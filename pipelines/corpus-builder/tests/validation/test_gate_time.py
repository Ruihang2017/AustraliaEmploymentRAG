"""Gate 2 — time. PRD §15.2, §35.1, §40.9."""

from __future__ import annotations

from typing import Callable

from candidate_fixtures import TS, Candidate

from validation.gates import gate_time

_INSERT_NODE_VERSION = (
    "INSERT INTO node_version (id, document_version_id, document_node_id,"
    " parent_node_version_id, display_label, heading, canonical_text, ordinal, effective_from,"
    " effective_to, text_hash, created_at)"
    " VALUES (?, ?, 'node_act_s14', NULL, NULL, NULL, 'text', 1, ?, ?, ?, ?)"
)


def _codes(findings: list) -> set[str]:
    return {finding.code for finding in findings}


def test_the_baseline_passes(candidate_factory: Callable[..., Candidate]) -> None:
    findings = gate_time(candidate_factory().phase_a_context())
    assert not [finding for finding in findings if finding.severity == "BLOCKING"], findings


def test_an_inverted_document_version_interval_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    def broken(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute(
            "INSERT INTO document_version (id, document_id, source_artifact_id, version_label,"
            " publication_date, effective_from, effective_to, legal_status, retrieved_at,"
            " content_hash, official_url, created_at)"
            " VALUES ('dv_bad', 'doc_act', 'art_001', 'inverted', '2030-01-01', '2030-01-01',"
            " '2029-01-01', 'IN_FORCE', ?, ?, 'https://example.invalid/x', ?)",
            (TS, "a" * 64, TS),
        )

    findings = gate_time(candidate_factory(customise=broken).phase_a_context())
    inverted = [finding for finding in findings if finding.code == "TIME_INTERVAL_INVERTED"]
    assert [finding.subject for finding in inverted] == ["document_version[dv_bad]"]
    assert inverted[0].severity == "BLOCKING"


def test_an_overlapping_consolidated_series_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """PRD §40.9: any overlapping effect interval for a supposedly consolidated series blocks."""

    def broken(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute(
            "INSERT INTO document_version (id, document_id, source_artifact_id, version_label,"
            " publication_date, effective_from, effective_to, legal_status, retrieved_at,"
            " content_hash, official_url, created_at)"
            " VALUES ('dv_overlap', 'doc_act', 'art_001', 'overlapping', '2020-01-01',"
            " '2020-01-01', '2021-01-01', 'IN_FORCE', ?, ?, 'https://example.invalid/x', ?)",
            (TS, "a" * 64, TS),
        )

    findings = gate_time(candidate_factory(customise=broken).phase_a_context())
    overlaps = [finding for finding in findings if finding.code == "TIME_CONSOLIDATED_OVERLAP"]
    assert overlaps and overlaps[0].severity == "BLOCKING"
    assert overlaps[0].evidence["series"] == "doc_act"


def test_a_not_in_force_track_row_may_coexist(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """A bill and an uncommenced enactment legitimately coexist with an in-force version.

    This is the partition the module docstring states and OQ-2 flags for review: rows on the
    not-yet/never-in-force track are excluded from the overlap rule.
    """

    def coexisting(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute(
            "INSERT INTO document_version (id, document_id, source_artifact_id, version_label,"
            " publication_date, effective_from, effective_to, legal_status, retrieved_at,"
            " content_hash, official_url, created_at)"
            " VALUES ('dv_bill', 'doc_act', 'art_001', 'bill', '2020-01-01', '2020-01-01',"
            " '2021-01-01', 'BILL_NOT_ENACTED', ?, ?, 'https://example.invalid/x', ?)",
            (TS, "a" * 64, TS),
        )

    findings = gate_time(candidate_factory(customise=coexisting).phase_a_context())
    assert "TIME_CONSOLIDATED_OVERLAP" not in _codes(findings)


def test_an_operative_event_without_an_effective_date_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    def broken(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute(
            "INSERT INTO legal_event (id, document_id, event_type, event_date, effective_date,"
            " evidence_node_version_id, target_version_id, metadata_json, created_at)"
            " VALUES ('evt_bad', 'doc_act', 'REPEAL', '2030-01-01', NULL, NULL, NULL, NULL, ?)",
            (TS,),
        )

    findings = gate_time(candidate_factory(customise=broken).phase_a_context())
    absent = [
        finding for finding in findings if finding.code == "TIME_EVENT_EFFECTIVE_DATE_ABSENT"
    ]
    assert [finding.subject for finding in absent] == ["legal_event[evt_bad].effective_date"]
    assert absent[0].severity == "BLOCKING"


def test_an_unrecognised_event_type_is_reported_not_silently_passed(
    candidate_factory: Callable[..., Candidate]
) -> None:
    def unknown(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute(
            "INSERT INTO legal_event (id, document_id, event_type, event_date, effective_date,"
            " evidence_node_version_id, target_version_id, metadata_json, created_at)"
            " VALUES ('evt_unknown', 'doc_act', 'SOMETHING_NEW', '2030-01-01', NULL, NULL, NULL,"
            " NULL, ?)",
            (TS,),
        )

    findings = gate_time(candidate_factory(customise=unknown).phase_a_context())
    reported = [
        finding for finding in findings if finding.code == "TIME_EVENT_TYPE_UNRECOGNISED"
    ]
    assert reported and reported[0].severity == "INFO"
    assert reported[0].evidence["event_type"] == "SOMETHING_NEW"
    assert "TIME_EVENT_EFFECTIVE_DATE_ABSENT" not in _codes(findings)


def test_a_malformed_date_blocks_even_though_the_ddl_has_a_glob_check(
    candidate_factory: Callable[..., Candidate]
) -> None:
    def broken(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute("PRAGMA ignore_check_constraints = ON")
        connection.execute(
            "INSERT INTO legal_event (id, document_id, event_type, event_date, effective_date,"
            " evidence_node_version_id, target_version_id, metadata_json, created_at)"
            " VALUES ('evt_shape', 'doc_act', 'PUBLICATION', '01/07/2030', NULL, NULL, NULL,"
            " NULL, ?)",
            (TS,),
        )
        connection.execute("PRAGMA ignore_check_constraints = OFF")

    findings = gate_time(candidate_factory(customise=broken).phase_a_context())
    malformed = [finding for finding in findings if finding.code == "TIME_DATE_MALFORMED"]
    assert malformed and malformed[0].severity == "BLOCKING"


def test_a_node_version_without_an_effective_from_is_reported_not_skipped(
    candidate_factory: Callable[..., Candidate]
) -> None:
    def undated(connection) -> None:  # type: ignore[no-untyped-def]
        connection.execute(
            _INSERT_NODE_VERSION, ("nv_undated", "dv_act_2", None, None, "a" * 64, TS)
        )

    findings = gate_time(candidate_factory(customise=undated).phase_a_context())
    reported = [
        finding for finding in findings if finding.code == "TIME_EFFECTIVE_FROM_ABSENT"
    ]
    assert [finding.subject for finding in reported] == ["node_version[nv_undated]"]
    assert reported[0].severity == "INFO"
