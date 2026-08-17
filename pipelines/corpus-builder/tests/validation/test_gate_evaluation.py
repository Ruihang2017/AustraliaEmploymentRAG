"""Gate 7 — evaluation subset. PRD §12.2, §14.2. Missing, malformed and failed are distinct."""

from __future__ import annotations

from typing import Callable

from candidate_fixtures import Candidate

from validation.gates import gate_evaluation


def _codes(findings: list) -> set[str]:
    return {finding.code for finding in findings}


def test_a_passing_report_passes(candidate_factory: Callable[..., Candidate]) -> None:
    assert gate_evaluation(candidate_factory().phase_a_context()) == []


def test_a_failed_gate_blocks(candidate_factory: Callable[..., Candidate]) -> None:
    findings = gate_evaluation(candidate_factory(evaluation="fail").phase_a_context())
    failed = [finding for finding in findings if finding.code == "EVALUATION_GATE_FAILED"]
    assert failed and failed[0].severity == "BLOCKING"
    assert failed[0].evidence["observed"] == "0.61"


def test_a_missing_report_blocks_a_candidate(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(release_kind="CANDIDATE", evaluation="missing")
    findings = gate_evaluation(candidate.phase_a_context())
    assert [finding.code for finding in findings] == ["EVALUATION_REPORT_ABSENT"]
    assert findings[0].severity == "BLOCKING"


def test_a_missing_report_blocks_a_candidate_even_with_the_allowance(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(release_kind="CANDIDATE", evaluation="missing")
    context = candidate.phase_a_context(
        request=candidate.request(allow_not_run_evaluation=True)
    )
    findings = gate_evaluation(context)
    assert [finding.code for finding in findings] == ["EVALUATION_REPORT_ABSENT"]


def test_a_missing_report_is_allowed_on_a_non_candidate_with_the_allowance(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(release_kind="SYNTHETIC_FIXTURE", evaluation="missing")
    context = candidate.phase_a_context(
        request=candidate.request(allow_not_run_evaluation=True)
    )
    findings = gate_evaluation(context)
    assert [finding.code for finding in findings] == ["EVALUATION_NOT_RUN_ALLOWED"]
    assert findings[0].severity == "INFO"


def test_a_missing_report_blocks_a_non_candidate_without_the_allowance(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(release_kind="SYNTHETIC_FIXTURE", evaluation="missing")
    findings = gate_evaluation(candidate.phase_a_context())
    assert [finding.code for finding in findings] == ["EVALUATION_REPORT_ABSENT"]


def test_a_supplied_but_absent_report_file_is_absent_not_ignored(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(evaluation="absent-file")
    assert _codes(gate_evaluation(candidate.phase_a_context())) == {"EVALUATION_REPORT_ABSENT"}


def test_a_malformed_report_blocks_under_every_release_kind(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """Reading "the file was corrupt" as "no evaluation ran" is how a broken harness releases."""
    for release_kind in ("CANDIDATE", "SYNTHETIC_FIXTURE"):
        candidate = candidate_factory(release_kind=release_kind, evaluation="malformed")
        context = candidate.phase_a_context(
            request=candidate.request(allow_not_run_evaluation=True)
        )
        findings = gate_evaluation(context)
        assert _codes(findings) == {"EVALUATION_REPORT_MALFORMED"}, release_kind
        assert all(finding.severity == "BLOCKING" for finding in findings)
