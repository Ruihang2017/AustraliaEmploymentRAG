"""Gate 3 — identity. Duplicate stable identity is BLOCKING (PRD §40.9).

Each fail case DROPS THE UNIQUE INDEX first, because that is exactly the situation the gate exists
for: a well-formed corpus database is protected by the index, and the gate is what a hand-built or
tampered database has to get past.
"""

from __future__ import annotations

from typing import Callable

from candidate_fixtures import TS, Candidate

from validation.gates import gate_identity


def test_the_baseline_passes(candidate_factory: Callable[..., Candidate]) -> None:
    assert gate_identity(candidate_factory().phase_a_context()) == []


def test_a_duplicate_document_stable_key_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    def tampered(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute("DROP INDEX legal_document_source_key_uidx")
        connection.execute(
            "INSERT INTO legal_document (id, source_id, document_type, canonical_title,"
            " official_identifier, neutral_citation, employer_abn, stable_source_key, created_at)"
            " SELECT 'doc_dupe', source_id, document_type, canonical_title, NULL, NULL, NULL,"
            " stable_source_key, ? FROM legal_document WHERE id = 'doc_act'",
            (TS,),
        )

    findings = gate_identity(candidate_factory(customise=tampered).phase_a_context())
    assert [finding.code for finding in findings] == ["IDENTITY_DUPLICATE_DOCUMENT_IDENTITY"]
    assert findings[0].severity == "BLOCKING"
    assert findings[0].evidence["duplicate_count"] == 2


def test_a_duplicate_node_stable_key_blocks(candidate_factory: Callable[..., Candidate]) -> None:
    def tampered(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute("DROP INDEX document_node_key_uidx")
        connection.execute(
            "INSERT INTO document_node (id, document_id, stable_node_key, node_kind, created_at)"
            " VALUES ('node_dupe', 'doc_act', 's14', 'SECTION', ?)",
            (TS,),
        )

    findings = gate_identity(candidate_factory(customise=tampered).phase_a_context())
    assert [finding.code for finding in findings] == ["IDENTITY_DUPLICATE_NODE_IDENTITY"]
    assert findings[0].severity == "BLOCKING"


def test_a_document_version_that_resolves_to_no_document_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    def tampered(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute("PRAGMA foreign_keys = OFF")
        connection.execute(
            "INSERT INTO document_version (id, document_id, source_artifact_id, version_label,"
            " publication_date, effective_from, effective_to, legal_status, retrieved_at,"
            " content_hash, official_url, created_at)"
            " VALUES ('dv_orphan', 'doc_absent', 'art_001', 'orphan', NULL, NULL, NULL,"
            " 'IN_FORCE', ?, ?, 'https://example.invalid/x', ?)",
            (TS, "a" * 64, TS),
        )
        connection.execute("PRAGMA foreign_keys = ON")

    findings = gate_identity(candidate_factory(customise=tampered).phase_a_context())
    assert [finding.code for finding in findings] == ["IDENTITY_DOCUMENT_VERSION_UNRESOLVED"]
    assert findings[0].evidence["resolved_count"] == 0
