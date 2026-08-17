"""Gate 1 — completeness. PRD §7, §44.4; breakdown plan §8 Q10."""

from __future__ import annotations

from typing import Callable

from candidate_fixtures import Candidate

from validation.gates import gate_completeness

LIMITED_STATES = (
    "METADATA_AND_LINK_ACTIVE",
    "FRESHNESS_LIMITED",
    "LICENSING_RESTRICTED",
    "SOURCE_UNAVAILABLE",
)


def _codes(findings: list) -> set[str]:
    return {finding.code for finding in findings}


def test_the_baseline_passes(candidate_factory: Callable[..., Candidate]) -> None:
    findings = gate_completeness(candidate_factory().phase_a_context())
    assert not [finding for finding in findings if finding.severity == "BLOCKING"], findings


def test_a_missing_mandatory_group_blocks(candidate_factory: Callable[..., Candidate]) -> None:
    candidate = candidate_factory(omit_groups=("PT-TAS",))
    findings = gate_completeness(candidate.phase_a_context())
    missing = [
        finding for finding in findings if finding.code == "COMPLETENESS_SOURCE_GROUP_MISSING"
    ]
    assert [finding.subject for finding in missing] == ["source_group[PT-TAS]"]
    assert missing[0].severity == "BLOCKING"
    assert missing[0].evidence["prd_section"] == "§40.3"


def test_planned_not_active_blocks(candidate_factory: Callable[..., Candidate]) -> None:
    candidate = candidate_factory(coverage_overrides={"LEG-WA": "PLANNED_NOT_ACTIVE"})
    findings = gate_completeness(candidate.phase_a_context())
    blocking = [finding for finding in findings if finding.severity == "BLOCKING"]
    assert [finding.code for finding in blocking] == [
        "COMPLETENESS_SOURCE_GROUP_PLANNED_NOT_ACTIVE"
    ]
    assert blocking[0].subject == "source_group[LEG-WA]"


def test_each_explicit_limited_state_passes_and_is_recorded(
    candidate_factory: Callable[..., Candidate]
) -> None:
    for state in LIMITED_STATES:
        candidate = candidate_factory(coverage_overrides={"CASE-NT": state})
        findings = gate_completeness(candidate.phase_a_context())
        assert not [finding for finding in findings if finding.severity == "BLOCKING"], state
        recorded = [
            finding
            for finding in findings
            if finding.code == "COMPLETENESS_SOURCE_GROUP_LIMITED"
            and finding.subject == "source_group[CASE-NT]"
        ]
        assert len(recorded) == 1, state
        # The reason is taken from the source row's OWN recorded fields, never invented.
        assert recorded[0].evidence["coverage_status"] == state
        assert recorded[0].evidence["freshness_status"] == "CURRENT"
        assert recorded[0].evidence["last_ingestion_at"] is not None


def test_an_unrecognised_coverage_status_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    def broken(connection) -> None:  # type: ignore[no-untyped-def]
        # A well-formed corpus database rejects this with a CHECK constraint. The gate exists
        # because a HAND-BUILT or tampered database need not carry the constraint, which is what
        # `ignore_check_constraints` simulates here.
        connection.execute("PRAGMA ignore_check_constraints = ON")
        connection.execute(
            "UPDATE source SET coverage_status = 'PROBABLY_FINE' WHERE source_group_id = 'LEG-SA'"
        )
        connection.execute("PRAGMA ignore_check_constraints = OFF")

    candidate = candidate_factory(customise=broken)
    findings = gate_completeness(candidate.phase_a_context())
    assert "COMPLETENESS_COVERAGE_STATUS_UNKNOWN" in _codes(findings)


def test_declared_counts_are_compared_against_the_database(
    candidate_factory: Callable[..., Candidate]
) -> None:
    from validation.gates import corpus_counts

    candidate = candidate_factory()
    connection = candidate.connect()
    try:
        observed = corpus_counts(connection)
    finally:
        connection.close()

    from dataclasses import replace

    context = candidate.phase_a_context(declared_counts=replace(observed, chunks=observed.chunks + 1))
    findings = gate_completeness(context)
    mismatches = [
        finding for finding in findings if finding.code == "COMPLETENESS_COUNT_MISMATCH"
    ]
    assert [finding.subject for finding in mismatches] == ["counts.chunks"]
    assert mismatches[0].severity == "BLOCKING"

    context = candidate.phase_a_context(declared_counts=observed)
    assert "COMPLETENESS_COUNT_MISMATCH" not in _codes(gate_completeness(context))


def test_an_embedding_manifest_count_disagreement_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(embedding_overrides={"vector_file": {"count": 99}})
    findings = gate_completeness(candidate.phase_a_context())
    disagreements = [
        finding
        for finding in findings
        if finding.code == "COMPLETENESS_EMBEDDING_COUNT_DISAGREEMENT"
    ]
    assert disagreements and all(
        finding.severity == "BLOCKING" for finding in disagreements
    )


def test_an_open_quarantine_item_blocks_despite_everything_else_passing(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(open_quarantine=True)
    findings = gate_completeness(candidate.phase_a_context())
    blocking = [finding for finding in findings if finding.severity == "BLOCKING"]
    assert [finding.code for finding in blocking] == ["QUARANTINE_OPEN"]
