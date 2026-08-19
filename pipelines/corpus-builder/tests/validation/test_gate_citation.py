"""Gate 4 — citation. PRD §15.3, §40.9; `SRCH-003`."""

from __future__ import annotations

from typing import Callable

import pytest
from candidate_fixtures import TS, Candidate

from validation.gates import gate_citation


def _codes(findings: list) -> set[str]:
    return {finding.code for finding in findings}


def test_the_baseline_passes(candidate_factory: Callable[..., Candidate]) -> None:
    findings = gate_citation(candidate_factory().phase_a_context())
    assert not [finding for finding in findings if finding.severity == "BLOCKING"], findings


def test_a_node_text_hash_that_does_not_reproduce_its_text_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    def tampered(connection) -> None:  # type: ignore[no-untyped-def]
        # `node_version` carries a BEFORE UPDATE immutability trigger, so the row is replaced
        # through a fresh id rather than edited: a tampered corpus is what the gate must catch.
        connection.execute(
            "INSERT INTO node_version (id, document_version_id, document_node_id,"
            " parent_node_version_id, display_label, heading, canonical_text, ordinal,"
            " effective_from, effective_to, text_hash, created_at)"
            " VALUES ('nv_liar', 'dv_act_2', 'node_act_s14', NULL, NULL, NULL,"
            " 'text that the recorded hash does not describe', 9, NULL, NULL, ?, ?)",
            ("f" * 64, TS),
        )

    findings = gate_citation(candidate_factory(customise=tampered).phase_a_context())
    mismatches = [
        finding for finding in findings if finding.code == "CITATION_NODE_TEXT_HASH_MISMATCH"
    ]
    assert [finding.subject for finding in mismatches] == ["node_version[nv_liar].text_hash"]
    assert mismatches[0].severity == "BLOCKING"


def test_a_chunk_offset_outside_its_node_text_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    def tampered(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute(
            "UPDATE search_chunk SET end_offset = 100000 WHERE node_version_id = 'nv_case_1'"
            " AND chunk_ordinal = 0"
        )

    findings = gate_citation(candidate_factory(customise=tampered).phase_a_context())
    assert "CITATION_CHUNK_OFFSET_OUT_OF_RANGE" in _codes(findings)


def test_a_chunk_hash_that_does_not_reproduce_its_slice_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    def tampered(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute(
            "UPDATE search_chunk SET text_hash = ? WHERE node_version_id = 'nv_case_1'"
            " AND chunk_ordinal = 0",
            ("e" * 64,),
        )

    findings = gate_citation(candidate_factory(customise=tampered).phase_a_context())
    assert "CITATION_CHUNK_HASH_MISMATCH" in _codes(findings)


def test_a_relation_evidence_offset_out_of_range_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    def tampered(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute(
            "INSERT INTO node_relation (id, from_node_version_id, to_node_version_id,"
            " relation_type, evidence_node_version_id, evidence_start, evidence_end, derivation,"
            " parser_version, confidence_state, created_at)"
            " VALUES ('nrel_bad', 'nv_act_2', 'nv_act_1', 'REFERS_TO', 'nv_act_2', 0, 99999,"
            " 'phrase match', '1.0.0', 'PARSER_DETERMINISTIC', ?)",
            (TS,),
        )

    findings = gate_citation(candidate_factory(customise=tampered).phase_a_context())
    out_of_range = [
        finding
        for finding in findings
        if finding.code == "CITATION_RELATION_EVIDENCE_OUT_OF_RANGE"
    ]
    assert [finding.subject for finding in out_of_range] == ["node_relation[nrel_bad]"]
    assert out_of_range[0].severity == "BLOCKING"


def test_an_unchunked_node_flags_rather_than_fails(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """A consolidated chunk anchors to its first participant and leaves the rest without rows.

    `search_chunk` stores no `consolidated_node_version_ids`, so this gate cannot tell that case
    apart from a genuine gap — which is why it is an ANOMALY and says so.
    """

    def unchunked(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute(
            "INSERT INTO node_version (id, document_version_id, document_node_id,"
            " parent_node_version_id, display_label, heading, canonical_text, ordinal,"
            " effective_from, effective_to, text_hash, created_at)"
            " VALUES ('nv_unchunked', 'dv_act_2', 'node_act_s14', NULL, NULL, NULL, ?, 5, NULL,"
            " NULL, ?, ?)",
            (
                "some text",
                __import__("hashlib").sha256("some text".encode("utf-8")).hexdigest(),
                TS,
            ),
        )

    findings = gate_citation(candidate_factory(customise=unchunked).phase_a_context())
    flagged = [finding for finding in findings if finding.code == "CITATION_NODE_UNCHUNKED"]
    assert [finding.subject for finding in flagged] == ["node_version[nv_unchunked]"]
    assert flagged[0].severity == "ANOMALY"


def test_a_broken_gold_citation_from_the_evaluation_report_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    from validation.evaluation_report import EvaluationReport

    candidate = candidate_factory()
    context = candidate.phase_a_context(
        evaluation_report=EvaluationReport(
            report_id="eval-1",
            ran_at=TS,
            metrics={"broken_gold_citations": "2"},
            gates=(),
        )
    )
    findings = gate_citation(context)
    broken = [finding for finding in findings if finding.code == "CITATION_GOLD_BROKEN"]
    assert broken and broken[0].severity == "BLOCKING"
    assert broken[0].evidence["broken_gold_citations"] == "2"


@pytest.mark.parametrize("reported", ["0.5", "0.001", "-1", "2.5"])
def test_a_fractional_broken_gold_citation_count_still_blocks(
    candidate_factory: Callable[..., Candidate], reported: str
) -> None:
    """REGRESSION (reviewer, MEDIUM). The metric is a DECIMAL STRING and may be fractional.

    `int(float("0.5"))` is `0`, which is falsy, so a positive-but-fractional count silently failed to
    raise the BLOCKING `CITATION_GOLD_BROKEN` finding PRD §40.9 requires. A negative value is nonsense
    for a count and is reported rather than read as "none".
    """
    from validation.evaluation_report import EvaluationReport

    context = candidate_factory().phase_a_context(
        evaluation_report=EvaluationReport(
            report_id="eval-1",
            ran_at=TS,
            metrics={"broken_gold_citations": reported},
            gates=(),
        )
    )
    broken = [
        finding for finding in gate_citation(context) if finding.code == "CITATION_GOLD_BROKEN"
    ]
    assert broken and broken[0].severity == "BLOCKING"
    assert broken[0].evidence["broken_gold_citations"] == reported


def test_a_zero_broken_gold_citation_count_does_not_block(
    candidate_factory: Callable[..., Candidate]
) -> None:
    from validation.evaluation_report import EvaluationReport

    context = candidate_factory().phase_a_context(
        evaluation_report=EvaluationReport(
            report_id="eval-1",
            ran_at=TS,
            metrics={"broken_gold_citations": "0.0"},
            gates=(),
        )
    )
    assert not [
        finding for finding in gate_citation(context) if finding.code == "CITATION_GOLD_BROKEN"
    ]
