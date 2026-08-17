"""Gate 5 — licensing. PRD §11.1, §35.3. Corpus content only; model weights are gate 8's."""

from __future__ import annotations

from typing import Callable

from candidate_fixtures import TS, Candidate

from validation.gates import gate_licensing


def _codes(findings: list) -> set[str]:
    return {finding.code for finding in findings}


def test_the_baseline_passes(candidate_factory: Callable[..., Candidate]) -> None:
    assert gate_licensing(candidate_factory().phase_a_context()) == []


def test_a_document_whose_source_has_no_assessment_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    def tampered(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute(
            "UPDATE source SET licence_assessment_id = NULL WHERE id ="
            " (SELECT source_id FROM legal_document WHERE id = 'doc_act')"
        )

    findings = gate_licensing(candidate_factory(customise=tampered).phase_a_context())
    absent = [finding for finding in findings if finding.code == "LICENSING_ASSESSMENT_ABSENT"]
    assert [finding.subject for finding in absent] == ["legal_document[doc_act]"]
    assert absent[0].severity == "BLOCKING"


def test_a_prohibited_assessment_blocks(candidate_factory: Callable[..., Candidate]) -> None:
    def tampered(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute(
            "UPDATE licence_assessment SET status = 'PROHIBITED' WHERE id ="
            " (SELECT licence_assessment_id FROM source WHERE id ="
            "  (SELECT source_id FROM legal_document WHERE id = 'doc_case'))"
        )

    findings = gate_licensing(candidate_factory(customise=tampered).phase_a_context())
    prohibited = [
        finding for finding in findings if finding.code == "LICENSING_ASSESSMENT_PROHIBITED"
    ]
    assert [finding.subject for finding in prohibited] == ["legal_document[doc_case]"]
    assert prohibited[0].evidence["licence_status"] == "PROHIBITED"


def test_an_unresolvable_licence_snapshot_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    def tampered(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute("PRAGMA foreign_keys = OFF")
        connection.execute(
            "INSERT INTO source_artifact (id, source_id, official_url, retrieved_at, http_status,"
            " etag, last_modified, content_type, byte_length, sha256, r2_key,"
            " licence_snapshot_id, created_at)"
            " VALUES ('art_orphan', 'src_001', 'https://example.invalid/a', ?, 200, NULL, NULL,"
            " 'text/html', 1, ?, NULL, 'lsnap_absent', ?)",
            (TS, "a" * 64, TS),
        )
        connection.execute("PRAGMA foreign_keys = ON")

    findings = gate_licensing(candidate_factory(customise=tampered).phase_a_context())
    assert "LICENSING_ARTIFACT_SNAPSHOT_UNRESOLVED" in _codes(findings)


def test_an_excluded_licensing_chunk_may_not_be_embedded(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """`EXCLUDED_LICENSING` is not eligible for dense OR lexical indexing (CRPS-04's predicates)."""

    def tampered(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute(
            "UPDATE search_chunk SET index_tier = 'EXCLUDED_LICENSING'"
            " WHERE node_version_id = 'nv_case_1'"
        )

    findings = gate_licensing(candidate_factory(customise=tampered).phase_a_context())
    assert "LICENSING_EXCLUDED_CHUNK_EMBEDDED" in _codes(findings)
    assert "LICENSING_EXCLUDED_CHUNK_LEXICAL" in _codes(findings)
    assert all(
        finding.severity == "BLOCKING"
        for finding in findings
        if finding.code.startswith("LICENSING_EXCLUDED")
    )


def test_an_unassigned_tier_is_never_read_as_permitted(
    candidate_factory: Callable[..., Candidate]
) -> None:
    def tampered(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute(
            "UPDATE search_chunk SET index_tier = NULL WHERE node_version_id = 'nv_case_1'"
        )

    findings = gate_licensing(candidate_factory(customise=tampered).phase_a_context())
    unknown = [finding for finding in findings if finding.code == "LICENSING_TIER_UNKNOWN"]
    assert unknown and unknown[0].severity == "BLOCKING"
