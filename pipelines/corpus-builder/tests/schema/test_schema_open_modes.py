"""PRD §18.3: `corpus.sqlite` is production read-only. The read-only open must really be read-only."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from contracts.schema import create_corpus_database, open_corpus_database
from corpus_seed import TS

INSERT = (
    "INSERT INTO authority (id, name, authority_type, jurisdiction, official_url, created_at)"
    f" VALUES ('auth_x', 'X', 'PARLIAMENT', 'AU-CTH', 'https://example.gov.au', '{TS}')"
)


def test_read_only_connection_rejects_insert(readonly_conn: sqlite3.Connection) -> None:
    with pytest.raises(sqlite3.OperationalError) as caught:
        readonly_conn.execute(INSERT)
    assert "readonly" in str(caught.value)


def test_writable_connection_accepts_the_same_insert(conn: sqlite3.Connection) -> None:
    conn.execute(INSERT)
    assert conn.execute("SELECT count(*) FROM authority").fetchone() == (1,)


@pytest.mark.parametrize(
    "statement",
    [
        "CREATE TABLE smuggled (id TEXT)",
        "DROP TABLE authority",
        "CREATE TRIGGER t BEFORE INSERT ON authority BEGIN SELECT 1; END",
        "DELETE FROM corpus_meta",
        "UPDATE corpus_meta SET schema_version = '9.9.9'",
        "PRAGMA user_version = 7",
        "VACUUM",
    ],
)
def test_read_only_connection_rejects_every_write_path(
    readonly_conn: sqlite3.Connection, statement: str
) -> None:
    with pytest.raises(sqlite3.OperationalError):
        readonly_conn.execute(statement)


def test_read_only_connection_rejects_writable_schema_tampering(
    readonly_conn: sqlite3.Connection,
) -> None:
    """`PRAGMA writable_schema` is the classic route around a trigger; `mode=ro` still wins."""
    readonly_conn.execute("PRAGMA writable_schema = ON")
    with pytest.raises(sqlite3.OperationalError):
        readonly_conn.execute("DELETE FROM sqlite_schema WHERE name LIKE '%_no_update'")


@pytest.mark.parametrize("read_only", [True, False])
def test_both_connection_kinds_enable_the_invariant_pragmas(db_path: Path, read_only: bool) -> None:
    connection = open_corpus_database(db_path, read_only=read_only)
    try:
        assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert connection.execute("PRAGMA recursive_triggers").fetchone()[0] == 1
    finally:
        connection.close()


def test_read_only_open_handles_paths_with_spaces_and_reserved_characters(tmp_path: Path) -> None:
    """SECURITY. An un-encoded URI turns a path with a space, '#' or '?' into a DIFFERENT database
    — one that may be created empty and writable. The path is percent-encoded for that reason.
    """
    directory = tmp_path / "a dir with spaces #1"
    directory.mkdir()
    path = directory / "corpus release.sqlite"
    create_corpus_database(path)

    connection = open_corpus_database(path)
    try:
        assert connection.execute("SELECT count(*) FROM corpus_meta").fetchone() == (1,)
        with pytest.raises(sqlite3.OperationalError):
            connection.execute(INSERT)
    finally:
        connection.close()
    # No stray database was created beside it.
    assert sorted(item.name for item in directory.iterdir()) == ["corpus release.sqlite"]


def test_create_refuses_to_overwrite_an_existing_database(db_path: Path) -> None:
    with pytest.raises(FileExistsError):
        create_corpus_database(db_path)


def test_open_reports_a_missing_database(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        open_corpus_database(tmp_path / "absent.sqlite")
