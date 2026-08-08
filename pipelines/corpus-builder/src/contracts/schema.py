"""Create, open and fingerprint a `corpus.sqlite` database (PRD §18.3, §18.4, §35, §42.1).

SECURITY NOTE — what actually makes the corpus immutable.

The `BEFORE UPDATE` / `BEFORE DELETE` triggers in `schema/corpus/001_corpus_schema.sql` are
defence-in-depth against the build pipeline's own mistakes, not the production guarantee. Two
measured facts drive the code below:

1. With SQLite's default `PRAGMA recursive_triggers = 0`, `INSERT OR REPLACE` (and `REPLACE INTO`)
   deletes the conflicting row WITHOUT firing the `BEFORE DELETE` trigger. Every connection this
   module hands out therefore sets `PRAGMA recursive_triggers = ON`, and a test asserts the bypass
   is closed.
2. That pragma — like `PRAGMA foreign_keys` — is per-connection and is NOT stored in the database
   file. A third-party writer (the Rust searcher, the `sqlite3` CLI, any future code that opens the
   file itself) does not inherit it.

The durable production guarantee is therefore the read-only open (PRD §18.3: *"`corpus.sqlite` is
release-specific, immutable and production read-only"*), which `open_corpus_database(read_only=True)`
provides via a `file:...?mode=ro` URI enforced by SQLite itself.
"""

from __future__ import annotations

import hashlib
import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from string import Template
from urllib.parse import quote

from .enums import render_enum_checks
from .paths import CORPUS_SCHEMA_DIR
from .version import BUILDER_VERSION, CONTRACT_VERSION, SCHEMA_VERSION

__all__ = [
    "CORPUS_DDL_PATH",
    "SCHEMA_VERSION",
    "create_corpus_database",
    "open_corpus_database",
    "render_corpus_ddl",
    "schema_fingerprint",
    "utc_now",
]

CORPUS_DDL_PATH = CORPUS_SCHEMA_DIR / "001_corpus_schema.sql"

#: The single `corpus_meta` row's primary key. The table is `CHECK (rowid = 1)`; this makes the row
#: addressable by name as well.
CORPUS_META_ID = "corpus_meta"


def utc_now() -> str:
    """UTC ISO-8601 with a `Z` suffix and second precision — the PRD §35.1 timestamp form."""
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def render_corpus_ddl(substitutions: dict[str, str] | None = None) -> str:
    """Render the DDL template with generated enum `CHECK` lists.

    `Template.substitute` (not `safe_substitute`) so a placeholder the enum map does not cover is a
    `KeyError` at render time rather than a `${...}` literal reaching SQLite.
    """
    template = Template(CORPUS_DDL_PATH.read_text(encoding="utf-8"))
    return template.substitute(substitutions if substitutions is not None else render_enum_checks())


def _configure(connection: sqlite3.Connection) -> sqlite3.Connection:
    """Apply the per-connection pragmas the corpus invariants depend on."""
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA recursive_triggers = ON")
    return connection


def create_corpus_database(
    path: str | os.PathLike[str],
    *,
    release_id: str | None = None,
    ddl: str | None = None,
) -> None:
    """Create a new corpus database at *path* and write its single `corpus_meta` row.

    Refuses to touch an existing file: a corpus database is release-specific and is built once
    (PRD §18.3). *ddl* exists only so a test can prove `schema_fingerprint()` reacts to a DDL
    change; production callers leave it `None`.
    """
    target = Path(path)
    if target.exists():
        raise FileExistsError(f"refusing to overwrite an existing corpus database: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(target, isolation_level=None)
    try:
        _configure(connection)
        connection.executescript(ddl if ddl is not None else render_corpus_ddl())
        # A database carrying a schema but no corpus_meta row would fail the PRD §18.4 readiness
        # comparison in a way that looks like version drift rather than an aborted build, so a
        # failure between the two removes the half-built file instead of leaving it behind.
        connection.execute(
            "INSERT INTO corpus_meta"
            " (id, schema_version, built_at, release_id, builder_version, contract_version,"
            "  created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                CORPUS_META_ID,
                SCHEMA_VERSION,
                built_at := utc_now(),
                release_id,
                BUILDER_VERSION,
                CONTRACT_VERSION,
                built_at,
            ),
        )
    except BaseException:
        connection.close()
        target.unlink(missing_ok=True)
        raise
    finally:
        connection.close()


def open_corpus_database(
    path: str | os.PathLike[str],
    *,
    read_only: bool = True,
) -> sqlite3.Connection:
    """Open an existing corpus database.

    `read_only=True` (the default, PRD §18.3) opens through a `file:...?mode=ro` URI so SQLite
    itself refuses every write. The URI is built from the resolved POSIX path with every reserved
    character percent-encoded, because a Windows drive letter, a backslash or a space in an
    un-encoded URI silently resolves to a *different* database.
    """
    target = Path(path)
    if not target.is_file():
        raise FileNotFoundError(f"no corpus database at {target}")

    if read_only:
        # `safe="/"` keeps the path separators; everything else (spaces, '#', '?', '%') is encoded.
        uri = f"file:{quote(target.resolve().as_posix(), safe='/')}?mode=ro"
        connection = sqlite3.connect(uri, uri=True, isolation_level=None)
    else:
        connection = sqlite3.connect(target, isolation_level=None)
    return _configure(connection)


def schema_fingerprint(connection: sqlite3.Connection) -> str:
    """A stable lowercase-hex SHA-256 over the database's stored DDL.

    Newlines are normalised and trailing whitespace stripped per line, so the value does not depend
    on the checkout's line endings. Rows with `sql IS NULL` (SQLite's implicit indexes for
    `PRIMARY KEY` / `UNIQUE`) are excluded because they have no stored text — a change visible only
    through an implicit index is therefore invisible to this fingerprint, which is acceptable: the
    fingerprint detects DDL drift, and any DDL edit that moves an implicit index also edits the
    stored text of the constraint that created it.
    """
    digest = hashlib.sha256()
    rows = connection.execute(
        "SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type, name"
    ).fetchall()
    parts = []
    for row_type, name, sql in rows:
        normalised = "\n".join(line.rstrip() for line in sql.replace("\r\n", "\n").split("\n"))
        parts.append(f"{row_type}\x1f{name}\x1f{normalised}")
    digest.update("\n".join(parts).encode("utf-8"))
    return digest.hexdigest()
