"""An open `quarantine_item` blocks, and the manifest summary uses the SAME rule."""

from __future__ import annotations

from typing import Callable

from candidate_fixtures import Candidate

from validation.quarantine import assert_no_open_quarantine, quarantine_summary


def test_a_resolved_item_does_not_block(candidate_factory: Callable[..., Candidate]) -> None:
    candidate = candidate_factory()
    connection = candidate.connect()
    try:
        assert assert_no_open_quarantine(connection) == []
        summary = quarantine_summary(connection)
    finally:
        connection.close()
    assert summary.open_count == 0
    assert summary.resolved_count == 1
    assert summary.by_reason_code == {"PARSE_DEFECT": 1}


def test_an_open_item_blocks_regardless_of_everything_else(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(open_quarantine=True)
    connection = candidate.connect()
    try:
        findings = assert_no_open_quarantine(connection)
        summary = quarantine_summary(connection)
    finally:
        connection.close()
    assert [finding.code for finding in findings] == ["QUARANTINE_OPEN"]
    assert findings[0].severity == "BLOCKING"
    assert findings[0].gate == "completeness"
    assert findings[0].evidence["reason_code"] == "OCR_DEFECT"
    # The gate and the manifest can never disagree: both read `resolved_at IS NULL`.
    assert summary.open_count == 1


def test_openness_is_structural_not_a_status_vocabulary(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """`quarantine_item.status`'s enum family is `pending` (Q-CRPS-4 / FND-03).

    A row whose `status` spells something this repository has never seen is still OPEN when
    `resolved_at IS NULL` — the rule reads the schema, not a hand-copied vocabulary.
    """

    def customise(connection: object) -> None:
        connection.execute(  # type: ignore[attr-defined]
            "INSERT INTO quarantine_item (id, ingestion_run_id, artifact_id, reason_code,"
            " details_json, status, resolution, resolved_at, created_at)"
            " VALUES ('qi_weird', 'run_001', NULL, 'UNKNOWN_REASON', NULL, 'AWAITING_TRIAGE',"
            " NULL, NULL, '2026-01-01T00:00:00Z')"
        )

    candidate = candidate_factory(customise=customise)
    connection = candidate.connect()
    try:
        findings = assert_no_open_quarantine(connection)
    finally:
        connection.close()
    assert [finding.subject for finding in findings] == ["quarantine_item[qi_weird]"]
    assert findings[0].evidence["status"] == "AWAITING_TRIAGE"
