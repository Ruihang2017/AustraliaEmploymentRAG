"""`chunk_embedding` rows — EXACTLY the PRD §35.3 five columns, and nothing else.

Sub-PRD D14 and the corpus DDL's own comment are emphatic: no model artefact, tokenizer,
inference-runtime or licence column may ever appear in this table. Those pins live in
`embedding-manifest.json`, because duplicating them would put one PRD §44.3 serial-owned contract
inside another, behind a database open that RETR-01/RLSE-07 must verify BEFORE opening.

The insert statement is a module constant so `tests/test_embed_source_scan.py` can parse its column
list and assert it is the five, in order — acceptance item 9 asks for exactly that inspection.

WHY PLAIN `INSERT`, NEVER `INSERT OR REPLACE`
----------------------------------------------
The primary key is `(search_chunk_id, profile_id)`. A duplicate therefore means the resume filter
is wrong, and that must be loud: `INSERT OR REPLACE` would turn a resume defect into a silent
double-embed with correct-looking counts. A DELIBERATE re-embed deletes the stale row first, which
is an explicit call, not a fallback.

TRANSACTIONS. `contracts.schema.open_corpus_database` sets `isolation_level=None` — autocommit — so
each batch is wrapped in an explicit `BEGIN`/`COMMIT`. Per-row autocommit plus a crash leaves rows
that a later `resume=True` run would treat as completed work: a silent under-embed, the hardest
failure in this pipeline to detect after the fact.
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Iterator, Sequence

__all__ = [
    "CHUNK_EMBEDDING_COLUMNS",
    "INSERT_CHUNK_EMBEDDING",
    "batch_transaction",
    "count_rows_for_profile",
    "delete_rows_for_profile",
    "existing_chunk_ids",
    "insert_embedding_rows",
    "profiles_present",
]

#: PRD §35.3, in order. The manifest carries the pins; this table carries the five columns.
CHUNK_EMBEDDING_COLUMNS: tuple[str, ...] = (
    "search_chunk_id",
    "profile_id",
    "vector_key",
    "dimensions",
    "quantisation",
)

INSERT_CHUNK_EMBEDDING = (
    "INSERT INTO chunk_embedding"
    " (search_chunk_id, profile_id, vector_key, dimensions, quantisation)"
    " VALUES (?, ?, ?, ?, ?)"
)


@contextmanager
def batch_transaction(connection: sqlite3.Connection) -> Iterator[None]:
    """An explicit `BEGIN`/`COMMIT` around one batch; `ROLLBACK` on any exception."""
    connection.execute("BEGIN")
    try:
        yield
    except BaseException:
        connection.execute("ROLLBACK")
        raise
    connection.execute("COMMIT")


def insert_embedding_rows(
    connection: sqlite3.Connection,
    rows: Sequence[tuple[str, str, str, int, str]],
) -> None:
    """Insert one batch. A duplicate primary key raises — see the module docstring."""
    connection.executemany(INSERT_CHUNK_EMBEDDING, rows)


def existing_chunk_ids(connection: sqlite3.Connection, profile_id: str) -> set[str]:
    """The `search_chunk_id`s already embedded for *profile_id*."""
    return {
        row[0]
        for row in connection.execute(
            "SELECT search_chunk_id FROM chunk_embedding WHERE profile_id = ?", (profile_id,)
        )
    }


def count_rows_for_profile(connection: sqlite3.Connection, profile_id: str) -> int:
    row = connection.execute(
        "SELECT COUNT(*) FROM chunk_embedding WHERE profile_id = ?", (profile_id,)
    ).fetchone()
    return int(row[0])


def delete_rows_for_profile(
    connection: sqlite3.Connection, profile_id: str, search_chunk_ids: Sequence[str] | None = None
) -> int:
    """Remove stale rows before a deliberate re-embed. Never called to paper over a duplicate."""
    if search_chunk_ids is None:
        cursor = connection.execute("DELETE FROM chunk_embedding WHERE profile_id = ?", (profile_id,))
        return int(cursor.rowcount)
    removed = 0
    for chunk_id in search_chunk_ids:
        cursor = connection.execute(
            "DELETE FROM chunk_embedding WHERE profile_id = ? AND search_chunk_id = ?",
            (profile_id, chunk_id),
        )
        removed += int(cursor.rowcount)
    return removed


def profiles_present(connection: sqlite3.Connection) -> set[str]:
    """Every distinct `profile_id` already in `chunk_embedding`.

    PRD §14.4: "Embedding changes require a dual index" — two profiles mean two indexes, never one
    mixed index. `guard.py` uses this to refuse the mix.
    """
    return {row[0] for row in connection.execute("SELECT DISTINCT profile_id FROM chunk_embedding")}
