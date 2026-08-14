"""Deliverable 3: a placeholder must be unmistakable from the manifest ALONE.

A consumer that reads only `release-manifest.json` + `embedding-manifest.json` — which is what
`RETR-01` does before it opens anything — must be able to tell there is no queryable index. Three
independent declarations carry that, and all three are asserted here.
"""

from __future__ import annotations

import json
import sqlite3

from fixture_release_helpers import COMMITTED_BUNDLE_DIR

from manifest import is_stub

INDEX_VERSION_PLACEHOLDER = "PLACEHOLDER_NO_INDEX"


def _release_manifest() -> dict:
    return json.loads((COMMITTED_BUNDLE_DIR / "release-manifest.json").read_text(encoding="utf-8"))


def _embedding_manifest() -> dict:
    return json.loads(
        (COMMITTED_BUNDLE_DIR / "embedding-manifest.json").read_text(encoding="utf-8")
    )


def test_declaration_one_the_index_state_file() -> None:
    tantivy = COMMITTED_BUNDLE_DIR / "tantivy"
    contents = sorted(path.name for path in tantivy.rglob("*"))
    assert contents == ["INDEX_STATE.json"], contents
    document = json.loads((tantivy / "INDEX_STATE.json").read_text(encoding="utf-8"))
    assert document == {
        "state": "PLACEHOLDER",
        "reason": "synthetic fixture; see CRPS-06/Q-CRPS-2",
        "index_version": None,
    }


def test_declaration_two_the_manifest_index_version() -> None:
    """The ticket asks for `null` here; CRPS-02's frozen schema forbids it — see the DEVIATION note.

    `versions.index` `$ref`s `pins.schema.json#/$defs/version_string`
    (`{"type": "string", "minLength": 1}`) and is required, and `verify_bundle()` reports a schema
    violation at BLOCKING severity — so `null` would make the bundle fail its own verification and
    contradict the ticket's first acceptance item. The sentinel below is unmistakably not a version.
    """
    assert _release_manifest()["versions"]["index"] == INDEX_VERSION_PLACEHOLDER


def test_declaration_three_the_embedding_manifest_reports_no_vectors() -> None:
    document = _embedding_manifest()
    assert document["vector_file"]["count"] == 0
    assert is_stub(document["model_id"])
    assert is_stub(document["runtime"]["family"])
    assert document["tier_selection"]["embedded_count"] == 0
    assert document["tier_selection"]["skipped_count"] == document["tier_selection"]["chunk_count"]


def test_the_vector_file_is_a_declared_placeholder_not_an_empty_index() -> None:
    document = json.loads((COMMITTED_BUNDLE_DIR / "vectors.usearch").read_text(encoding="utf-8"))
    assert document["state"] == "PLACEHOLDER"
    assert document["vector_count"] == 0


def test_the_release_manifest_pins_are_marked_as_stubs() -> None:
    document = _release_manifest()
    assert is_stub(document["runtime"]["family"])
    roles = {pin["role"]: pin for pin in document["local_models"]}
    assert set(roles) == {"DOCUMENT_EMBEDDING", "QUERY_EMBEDDING"}
    for pin in roles.values():
        assert is_stub(pin["model_id"])
    assert document["counts"]["embeddings"] == 0
    assert document["evaluation"]["status"] == "NOT_RUN"
    assert document["release_kind"] == "SYNTHETIC_FIXTURE"
    assert document["parent_release_id"] is None


def test_the_prohibited_document_is_excluded_and_has_no_vectors(
    corpus_connection: sqlite3.Connection,
) -> None:
    """PRD §11.1: a PROHIBITED licence means `EXCLUDED_LICENSING` and no vector artifact."""
    rows = corpus_connection.execute(
        "SELECT DISTINCT c.index_tier FROM search_chunk AS c"
        " JOIN node_version AS n ON n.id = c.node_version_id"
        " JOIN document_version AS v ON v.id = n.document_version_id"
        " JOIN legal_document AS d ON d.id = v.document_id"
        " JOIN source AS s ON s.id = d.source_id"
        " JOIN licence_assessment AS a ON a.id = s.licence_assessment_id"
        " WHERE a.status = 'PROHIBITED'"
    ).fetchall()
    assert [row[0] for row in rows] == ["EXCLUDED_LICENSING"]

    assert int(
        corpus_connection.execute(
            "SELECT count(*) FROM chunk_embedding AS e"
            " JOIN search_chunk AS c ON c.id = e.search_chunk_id"
            " WHERE c.index_tier = 'EXCLUDED_LICENSING'"
        ).fetchone()[0]
    ) == 0


def test_the_quarantine_summary_matches_the_database(corpus_connection: sqlite3.Connection) -> None:
    document = _release_manifest()
    open_count = int(
        corpus_connection.execute(
            "SELECT count(*) FROM quarantine_item WHERE status = 'OPEN'"
        ).fetchone()[0]
    )
    assert document["quarantine"]["open_count"] == open_count == 1
    assert document["quarantine"]["by_reason_code"] == {"STRUCTURE_UNPARSEABLE": 1}


def test_the_manifest_counts_match_the_database(corpus_connection: sqlite3.Connection) -> None:
    """The manifest's figures are what was inserted, not a second set that can drift."""
    counts = _release_manifest()["counts"]
    for member, table in (
        ("sources", "source"),
        ("documents", "legal_document"),
        ("document_versions", "document_version"),
        ("nodes", "document_node"),
        ("node_versions", "node_version"),
        ("relations", "node_relation"),
        ("events", "legal_event"),
        ("chunks", "search_chunk"),
        ("embeddings", "chunk_embedding"),
    ):
        actual = int(corpus_connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0])
        assert counts[member] == actual, member


def test_no_corpus_release_row_exists(corpus_connection: sqlite3.Connection) -> None:
    """Deliberate — writing one after signing would invalidate every hash the manifest recorded.

    The release identity travels in `corpus_meta.release_id` and in the manifest instead.
    """
    assert int(
        corpus_connection.execute("SELECT count(*) FROM corpus_release").fetchone()[0]
    ) == 0
    release_id = corpus_connection.execute("SELECT release_id FROM corpus_meta").fetchone()[0]
    assert release_id == _release_manifest()["release_id"]
