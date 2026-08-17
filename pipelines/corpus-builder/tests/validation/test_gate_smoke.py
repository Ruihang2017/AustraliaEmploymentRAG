"""Gate 6 — smoke search, offline subset. PRD §12.2, §18.4."""

from __future__ import annotations

from typing import Callable

from candidate_fixtures import TS, Candidate

from validation.gates import gate_smoke


def _codes(findings: list) -> set[str]:
    return {finding.code for finding in findings}


def test_the_baseline_round_trips_every_probe_class(
    candidate_factory: Callable[..., Candidate]
) -> None:
    findings = gate_smoke(candidate_factory().phase_a_context())
    assert findings == [], findings


def test_an_ambiguous_identifier_lookup_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """Two documents sharing one neutral citation make the lookup resolve to two rows."""

    def tampered(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute(
            "INSERT INTO legal_document (id, source_id, document_type, canonical_title,"
            " official_identifier, neutral_citation, employer_abn, stable_source_key, created_at)"
            " VALUES ('doc_case_twin', (SELECT source_id FROM legal_document WHERE id ="
            " 'doc_case'), 'DECISION', 'Twin', NULL, '[2024] SYNIRC 7', NULL, 'SYNIRC-TWIN', ?)",
            (TS,),
        )

    findings = gate_smoke(candidate_factory(customise=tampered).phase_a_context())
    failed = [
        finding for finding in findings if finding.code == "SMOKE_IDENTIFIER_LOOKUP_FAILED"
    ]
    assert [finding.subject for finding in failed] == ["legal_document.neutral_citation"]
    assert failed[0].severity == "BLOCKING"
    assert failed[0].evidence["resolved_count"] == 2


def test_an_absent_probe_class_flags_rather_than_fails(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """A real MVP corpus may legitimately contain no `employer_abn` (OQ-3 flags the alternative)."""

    def tampered(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute("UPDATE legal_document SET employer_abn = NULL")

    findings = gate_smoke(candidate_factory(customise=tampered).phase_a_context())
    absent = [finding for finding in findings if finding.code == "SMOKE_PROBE_CLASS_ABSENT"]
    assert [finding.subject for finding in absent] == ["legal_document.employer_abn"]
    assert absent[0].severity == "ANOMALY"


def test_an_ambiguous_point_in_time_resolution_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """Two node versions of one provision in effect at one date is a release defect."""

    def tampered(connection) -> None:  # type: ignore[no-untyped-def]
        text = "A second node version claiming the same open-ended effect interval."
        connection.execute(
            "INSERT INTO node_version (id, document_version_id, document_node_id,"
            " parent_node_version_id, display_label, heading, canonical_text, ordinal,"
            " effective_from, effective_to, text_hash, created_at)"
            " VALUES ('nv_act_shadow', 'dv_act_2', 'node_act_s14', NULL, NULL, NULL, ?, 7,"
            " '2019-07-01', NULL, ?, ?)",
            (text, __import__("hashlib").sha256(text.encode("utf-8")).hexdigest(), TS),
        )

    findings = gate_smoke(candidate_factory(customise=tampered).phase_a_context())
    ambiguous = [
        finding for finding in findings if finding.code == "SMOKE_POINT_IN_TIME_AMBIGUOUS"
    ]
    assert ambiguous and all(finding.severity == "BLOCKING" for finding in ambiguous)


def test_a_provision_whose_text_no_longer_hashes_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    def tampered(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute(
            "INSERT INTO node_version (id, document_version_id, document_node_id,"
            " parent_node_version_id, display_label, heading, canonical_text, ordinal,"
            " effective_from, effective_to, text_hash, created_at)"
            " VALUES ('nv_act_liar', 'dv_act_2', 'node_act_s14', NULL, NULL, NULL, 'x', 8, NULL,"
            " NULL, ?, ?)",
            ("d" * 64, TS),
        )

    findings = gate_smoke(candidate_factory(customise=tampered).phase_a_context())
    assert "SMOKE_PROVISION_LOOKUP_FAILED" in _codes(findings)
