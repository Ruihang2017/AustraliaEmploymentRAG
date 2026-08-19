"""The PRD §40.9 anomaly rules, and the property that an override can never downgrade a class."""

from __future__ import annotations

from typing import Callable

import pytest
from candidate_fixtures import Candidate

from validation.anomalies import (
    BLOCKING_CLASSES,
    COLLECTION_COUNT_CHANGE_FRACTION,
    PARSE_FAILURE_RATE,
    AnomalyThresholds,
    collection_count_anomalies,
    parse_failure_anomalies,
)
from validation.gates import gate_completeness, gate_identity, gate_time


def _codes(findings: list) -> set[str]:
    return {finding.code for finding in findings}


def test_the_declared_defaults_are_the_prd_s_initial_values() -> None:
    assert COLLECTION_COUNT_CHANGE_FRACTION == 0.10
    assert PARSE_FAILURE_RATE == 0.02


def test_a_parse_failure_rate_above_the_threshold_flags_but_does_not_fail(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(parse_counts={"LEG-CTH": (100, 90)})
    connection = candidate.connect()
    try:
        findings = parse_failure_anomalies(connection, AnomalyThresholds())
    finally:
        connection.close()
    flagged = [
        finding for finding in findings if finding.code == "ANOMALY_PARSE_FAILURE_RATE"
    ]
    assert [finding.subject for finding in flagged] == ["source_group[LEG-CTH]"]
    assert flagged[0].severity == "ANOMALY"
    assert flagged[0].evidence["observed_rate"] == 0.1


def test_a_zero_denominator_is_not_measurable_and_never_a_pass(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(parse_counts={"PT-NT": (0, 0)})
    connection = candidate.connect()
    try:
        findings = parse_failure_anomalies(connection, AnomalyThresholds())
    finally:
        connection.close()
    not_measurable = [
        finding
        for finding in findings
        if finding.code == "ANOMALY_NOT_MEASURABLE" and finding.subject == "source_group[PT-NT]"
    ]
    assert not_measurable and not_measurable[0].severity == "INFO"


def test_a_per_source_override_relaxes_only_that_group(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(parse_counts={"LEG-CTH": (100, 90)})
    thresholds = AnomalyThresholds(by_source_group={"LEG-CTH": {"parse_failure_rate": 0.5}})
    connection = candidate.connect()
    try:
        findings = parse_failure_anomalies(connection, thresholds)
    finally:
        connection.close()
    assert "ANOMALY_PARSE_FAILURE_RATE" not in _codes(findings)


def test_no_parent_is_reported_rather_than_silently_passed(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory()
    connection = candidate.connect()
    try:
        findings = collection_count_anomalies(connection, None, AnomalyThresholds())
    finally:
        connection.close()
    assert [finding.code for finding in findings] == ["ANOMALY_NO_PARENT"]
    assert findings[0].severity == "INFO"


def test_a_collection_count_change_beyond_the_threshold_flags(
    candidate_factory: Callable[..., Candidate]
) -> None:
    parent = candidate_factory(extra_documents=0)
    child = candidate_factory(extra_documents=20)
    parent_connection = parent.connect()
    child_connection = child.connect()
    try:
        findings = collection_count_anomalies(
            child_connection, parent_connection, AnomalyThresholds()
        )
    finally:
        parent_connection.close()
        child_connection.close()
    flagged = [
        finding for finding in findings if finding.code == "ANOMALY_COLLECTION_COUNT_CHANGE"
    ]
    assert flagged and all(finding.severity == "ANOMALY" for finding in flagged)


def test_an_anomaly_does_not_block(candidate_factory: Callable[..., Candidate]) -> None:
    candidate = candidate_factory(parse_counts={"LEG-CTH": (100, 50)})
    findings = gate_completeness(candidate.phase_a_context())
    assert "ANOMALY_PARSE_FAILURE_RATE" in _codes(findings)
    assert not [finding for finding in findings if finding.severity == "BLOCKING"]


# ==================================================================================================
# The four unconditional BLOCKING classes
# ==================================================================================================


def test_the_four_blocking_classes_are_a_module_constant_not_a_request_input() -> None:
    assert set(BLOCKING_CLASSES) == {
        "DUPLICATE_STABLE_IDENTITY",
        "OVERLAPPING_CONSOLIDATED_EFFECT_INTERVAL",
        "MISSING_MANDATORY_SOURCE_GROUP",
        "BROKEN_GOLD_CITATION",
    }
    # `AnomalyThresholds` carries floats and nothing else; there is no member, key or code path by
    # which a request-supplied mapping can name one of the four.
    for blocking_class in BLOCKING_CLASSES:
        with pytest.raises(ValueError):
            AnomalyThresholds(by_source_group={"LEG-CTH": {blocking_class: 1.0}})
        with pytest.raises(ValueError):
            AnomalyThresholds(by_source_group={"LEG-CTH": {blocking_class.lower(): 1.0}})


def test_a_hostile_override_cannot_downgrade_a_missing_mandatory_group(
    candidate_factory: Callable[..., Candidate]
) -> None:
    hostile = AnomalyThresholds(
        collection_count_change_fraction=1.0,
        parse_failure_rate=1.0,
        by_source_group={"PT-TAS": {"collection_count_change_fraction": 1.0}},
    )
    candidate = candidate_factory(omit_groups=("PT-TAS",))
    context = candidate.phase_a_context(
        request=candidate.request(anomaly_thresholds=hostile)
    )
    findings = gate_completeness(context)
    missing = [
        finding for finding in findings if finding.code == "COMPLETENESS_SOURCE_GROUP_MISSING"
    ]
    assert missing and missing[0].severity == "BLOCKING"


def test_a_hostile_override_cannot_downgrade_a_duplicate_stable_identity(
    candidate_factory: Callable[..., Candidate]
) -> None:
    def tampered(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute("DROP INDEX legal_document_source_key_uidx")
        connection.execute(
            "INSERT INTO legal_document (id, source_id, document_type, canonical_title,"
            " official_identifier, neutral_citation, employer_abn, stable_source_key, created_at)"
            " SELECT 'doc_dupe', source_id, document_type, canonical_title, NULL, NULL, NULL,"
            " stable_source_key, created_at FROM legal_document WHERE id = 'doc_act'"
        )

    hostile = AnomalyThresholds(
        collection_count_change_fraction=1.0, parse_failure_rate=1.0
    )
    candidate = candidate_factory(customise=tampered)
    context = candidate.phase_a_context(
        request=candidate.request(anomaly_thresholds=hostile)
    )
    findings = gate_identity(context)
    assert [finding.severity for finding in findings] == ["BLOCKING"]


def test_a_hostile_override_cannot_downgrade_an_overlapping_consolidated_interval(
    candidate_factory: Callable[..., Candidate]
) -> None:
    def overlapping(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute(
            "INSERT INTO document_version (id, document_id, source_artifact_id, version_label,"
            " publication_date, effective_from, effective_to, legal_status, retrieved_at,"
            " content_hash, official_url, created_at)"
            " SELECT 'dv_overlap', document_id, source_artifact_id, 'overlap', publication_date,"
            " '2020-01-01', '2021-01-01', 'IN_FORCE', retrieved_at, content_hash, official_url,"
            " created_at FROM document_version WHERE id = 'dv_act_1'"
        )

    hostile = AnomalyThresholds(
        collection_count_change_fraction=1.0, parse_failure_rate=1.0
    )
    candidate = candidate_factory(customise=overlapping)
    context = candidate.phase_a_context(
        request=candidate.request(anomaly_thresholds=hostile)
    )
    findings = gate_time(context)
    overlaps = [finding for finding in findings if finding.code == "TIME_CONSOLIDATED_OVERLAP"]
    assert overlaps and overlaps[0].severity == "BLOCKING"


def test_a_hostile_override_cannot_downgrade_a_broken_gold_citation(
    candidate_factory: Callable[..., Candidate]
) -> None:
    from validation.evaluation_report import EvaluationReport
    from validation.gates import gate_citation

    hostile = AnomalyThresholds(
        collection_count_change_fraction=1.0, parse_failure_rate=1.0
    )
    candidate = candidate_factory()
    context = candidate.phase_a_context(
        request=candidate.request(anomaly_thresholds=hostile),
        evaluation_report=EvaluationReport(
            report_id="eval-1",
            ran_at="2026-01-01T00:00:00Z",
            metrics={"broken_gold_citations": "1"},
            gates=(),
        ),
    )
    broken = [
        finding for finding in gate_citation(context) if finding.code == "CITATION_GOLD_BROKEN"
    ]
    assert broken and broken[0].severity == "BLOCKING"
