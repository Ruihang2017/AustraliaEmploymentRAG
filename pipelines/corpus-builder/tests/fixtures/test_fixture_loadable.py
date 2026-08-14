"""`E07` exit evidence — *"Immutable fixture opens in search"*, on the corpus side.

`assert_fixture_loadable()` is deliverable 9's helper; these tests assert both that it passes on the
committed bundle and that it FAILS when its preconditions are broken, so a helper that had silently
degenerated into a no-op could not pass this file.
"""

from __future__ import annotations

import shutil
import sqlite3
from pathlib import Path

import pytest
from fixture_release_helpers import COMMITTED_BUNDLE_DIR

from consumer_checks import (
    ACT_OFFICIAL_IDENTIFIER,
    CASE_NEUTRAL_CITATION,
    TIME_POINTS,
    FixtureNotLoadable,
    assert_fixture_loadable,
)
from contracts.schema import open_corpus_database


def test_the_committed_bundle_is_loadable() -> None:
    assert_fixture_loadable(COMMITTED_BUNDLE_DIR)


def test_the_default_argument_points_at_the_committed_bundle() -> None:
    assert_fixture_loadable()


def test_exact_provision_lookup_returns_the_expected_row(
    corpus_connection: sqlite3.Connection,
) -> None:
    rows = corpus_connection.execute(
        "SELECT canonical_title, document_type FROM legal_document WHERE official_identifier = ?",
        (ACT_OFFICIAL_IDENTIFIER,),
    ).fetchall()
    assert rows == [("Synthetic Levy Administration Act 2019", "PRIMARY_LEGISLATION")]


def test_neutral_citation_lookup_returns_the_expected_row(
    corpus_connection: sqlite3.Connection,
) -> None:
    rows = corpus_connection.execute(
        "SELECT canonical_title, document_type FROM legal_document WHERE neutral_citation = ?",
        (CASE_NEUTRAL_CITATION,),
    ).fetchall()
    assert rows == [("Farrow v Commissioner of Synthetic Revenue", "JUDICIAL_DECISION")]


def test_the_three_time_points_resolve_to_three_different_node_versions(
    corpus_connection: sqlite3.Connection,
) -> None:
    resolved = []
    for date in TIME_POINTS:
        rows = corpus_connection.execute(
            "SELECT n.id, n.canonical_text FROM node_version AS n"
            " JOIN document_node AS d ON d.id = n.document_node_id"
            " JOIN legal_document AS l ON l.id = d.document_id"
            " WHERE l.official_identifier = ? AND d.stable_node_key = 'part-2/div-3/s14'"
            "   AND n.effective_from IS NOT NULL AND n.effective_from <= ?"
            "   AND (n.effective_to IS NULL OR n.effective_to >= ?)",
            (ACT_OFFICIAL_IDENTIFIER, date, date),
        ).fetchall()
        assert len(rows) == 1, (date, rows)
        resolved.append(rows[0])
    assert len({row[0] for row in resolved}) == 3
    # The TEXT differs too, not merely the row id — a downstream temporal test needs the difference
    # to be observable in what a user would read.
    assert len({row[1] for row in resolved}) == 3


def test_the_committed_database_refuses_a_write_when_opened_read_only() -> None:
    connection = open_corpus_database(COMMITTED_BUNDLE_DIR / "corpus.sqlite", read_only=True)
    try:
        with pytest.raises(sqlite3.OperationalError):
            connection.execute(
                "INSERT INTO authority (id, name, authority_type, jurisdiction, court_level,"
                " official_url, created_at) VALUES ('x', 'x', 'x', 'x', NULL, 'x',"
                " '2026-01-01T00:00:00Z')"
            )
    finally:
        connection.close()


def test_the_helper_refuses_a_tampered_bundle(tmp_path: Path) -> None:
    """Negative control: loadability is gated on verification, not merely on the file opening."""
    copied = tmp_path / "tampered"
    shutil.copytree(COMMITTED_BUNDLE_DIR, copied)
    (copied / "vectors.usearch").write_bytes(b'{"state": "REAL", "vector_count": 9000}\n')
    with pytest.raises(FixtureNotLoadable):
        assert_fixture_loadable(copied)


def test_the_helper_refuses_a_bundle_whose_manifest_is_absent(tmp_path: Path) -> None:
    empty = tmp_path / "empty"
    empty.mkdir()
    with pytest.raises(FixtureNotLoadable):
        assert_fixture_loadable(empty)
