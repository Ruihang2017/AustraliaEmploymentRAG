"""`corpus_meta` is single-row and reports SCHEMA_VERSION; `schema_fingerprint()` detects DDL drift.

Basis: PRD §18.4 (the bundle publishes schema/parser/chunker/embedding/index versions) and §42.1
(readiness fails during an incompatible app/corpus/schema state).
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from contracts.schema import (
    create_corpus_database,
    open_corpus_database,
    render_corpus_ddl,
    schema_fingerprint,
)
from contracts.version import BUILDER_VERSION, CONTRACT_VERSION, SCHEMA_VERSION
from corpus_seed import TS


def test_corpus_meta_holds_exactly_one_row_reporting_the_versions(conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        "SELECT schema_version, builder_version, contract_version, release_id FROM corpus_meta"
    ).fetchall()
    assert rows == [(SCHEMA_VERSION, BUILDER_VERSION, CONTRACT_VERSION, None)]


def test_release_id_is_recorded_when_given(tmp_path: Path) -> None:
    path = tmp_path / "release.sqlite"
    create_corpus_database(path, release_id="cr_0199abcd")
    connection = open_corpus_database(path)
    try:
        assert connection.execute("SELECT release_id FROM corpus_meta").fetchone() == ("cr_0199abcd",)
    finally:
        connection.close()


def test_a_second_corpus_meta_row_is_rejected(conn: sqlite3.Connection) -> None:
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO corpus_meta (id, schema_version, built_at, builder_version,"
            " contract_version, created_at) VALUES ('second', '9.9.9', ?, '0', '0', ?)",
            (TS, TS),
        )
    assert conn.execute("SELECT count(*) FROM corpus_meta").fetchone() == (1,)


def test_fingerprint_is_stable_across_two_fresh_creations(tmp_path: Path) -> None:
    fingerprints = []
    for name in ("one", "two"):
        path = tmp_path / name / "corpus.sqlite"
        create_corpus_database(path)
        connection = open_corpus_database(path)
        try:
            fingerprints.append(schema_fingerprint(connection))
        finally:
            connection.close()
    assert fingerprints[0] == fingerprints[1]
    assert len(fingerprints[0]) == 64 and fingerprints[0] == fingerprints[0].lower()


def test_fingerprint_changes_when_the_ddl_changes(tmp_path: Path) -> None:
    baseline_path = tmp_path / "baseline.sqlite"
    create_corpus_database(baseline_path)

    mutated = render_corpus_ddl().replace(
        "CREATE TABLE corpus_release (\n  id                TEXT PRIMARY KEY,",
        "CREATE TABLE corpus_release (\n  id                TEXT PRIMARY KEY,\n  drift_probe TEXT,",
    )
    mutated_path = tmp_path / "mutated.sqlite"
    create_corpus_database(mutated_path, ddl=mutated)

    fingerprints = []
    for path in (baseline_path, mutated_path):
        connection = open_corpus_database(path)
        try:
            fingerprints.append(schema_fingerprint(connection))
        finally:
            connection.close()
    assert fingerprints[0] != fingerprints[1]


def test_fingerprint_ignores_the_checkouts_line_endings(tmp_path: Path) -> None:
    """A CRLF checkout must not change the fingerprint — the value ends up in a release manifest."""
    path = tmp_path / "crlf.sqlite"
    create_corpus_database(path, ddl=render_corpus_ddl().replace("\n", "\r\n"))
    baseline_path = tmp_path / "lf.sqlite"
    create_corpus_database(baseline_path)

    fingerprints = []
    for candidate in (baseline_path, path):
        connection = open_corpus_database(candidate)
        try:
            fingerprints.append(schema_fingerprint(connection))
        finally:
            connection.close()
    assert fingerprints[0] == fingerprints[1]
