"""Deliverable 1's content table IS the specification — one explicit SQL assertion per row.

Written against the corpus the generator produces (byte-identical to the committed bundle's
`corpus.sqlite`, which `test_fixture_determinism.py` asserts), so a coverage row cannot quietly
disappear from the fixture without a named failure here.
"""

from __future__ import annotations

import sqlite3

LEGAL_STATUSES = (
    "IN_FORCE",
    "ENACTED_NOT_IN_FORCE",
    "BILL_NOT_ENACTED",
    "DRAFT_OR_CONSULTATION",
    "REPEALED",
    "SUPERSEDED",
    "STATUS_UNCONFIRMED",
)


def _scalar(connection: sqlite3.Connection, sql: str, *parameters: object) -> int:
    return int(connection.execute(sql, parameters).fetchone()[0])


def test_two_jurisdictions_across_two_source_groups(corpus_connection: sqlite3.Connection) -> None:
    assert _scalar(corpus_connection, "SELECT count(DISTINCT source_group_id) FROM source") >= 2
    assert _scalar(corpus_connection, "SELECT count(DISTINCT jurisdiction) FROM source") >= 2
    jurisdictions = {
        row[0]
        for row in corpus_connection.execute("SELECT DISTINCT jurisdiction FROM source").fetchall()
    }
    assert {"AU-CTH", "AU-NSW"} <= jurisdictions


def test_two_authorities(corpus_connection: sqlite3.Connection) -> None:
    assert _scalar(corpus_connection, "SELECT count(*) FROM authority") >= 2
    # One parliament-like (no court level) and one court-like (with one).
    assert _scalar(corpus_connection, "SELECT count(*) FROM authority WHERE court_level IS NULL") >= 1
    assert _scalar(
        corpus_connection, "SELECT count(*) FROM authority WHERE court_level IS NOT NULL"
    ) >= 1


def test_four_document_kinds(corpus_connection: sqlite3.Connection) -> None:
    assert _scalar(corpus_connection, "SELECT count(*) FROM legal_document") >= 4
    kinds = {
        row[0]
        for row in corpus_connection.execute(
            "SELECT DISTINCT document_type FROM legal_document"
        ).fetchall()
    }
    assert {
        "PRIMARY_LEGISLATION",
        "SUBORDINATE_LEGISLATION",
        "JUDICIAL_DECISION",
        "AGENCY_GUIDANCE",
    } <= kinds


def test_three_time_points_on_the_act_like_document(corpus_connection: sqlite3.Connection) -> None:
    dates = [
        row[0]
        for row in corpus_connection.execute(
            "SELECT v.effective_from FROM document_version AS v"
            " JOIN legal_document AS d ON d.id = v.document_id"
            " WHERE d.official_identifier = 'SYN2026A00001' AND v.effective_from IS NOT NULL"
            " ORDER BY v.effective_from"
        ).fetchall()
    ]
    assert dates == ["2019-07-01", "2022-07-01", "2025-07-01"]
    # Each dated version carries its OWN node versions, or a point-in-time query is meaningless.
    assert _scalar(
        corpus_connection,
        "SELECT count(*) FROM node_version AS n"
        " JOIN document_version AS v ON v.id = n.document_version_id"
        " JOIN legal_document AS d ON d.id = v.document_id"
        " WHERE d.official_identifier = 'SYN2026A00001' AND v.effective_from IS NOT NULL",
    ) == 12


def test_every_prd_6_7_legal_status_is_present(corpus_connection: sqlite3.Connection) -> None:
    present = {
        row[0]
        for row in corpus_connection.execute(
            "SELECT DISTINCT legal_status FROM document_version"
        ).fetchall()
    }
    assert set(LEGAL_STATUSES) <= present
    # `UAT-SRCH-02`-style current/future separation needs a future-dated, not-yet-in-force version.
    assert _scalar(
        corpus_connection,
        "SELECT count(*) FROM document_version"
        " WHERE legal_status = 'ENACTED_NOT_IN_FORCE' AND effective_from > '2026-08-03'",
    ) >= 1


def test_node_hierarchy_is_at_least_four_levels_with_ordinals_and_headings(
    corpus_connection: sqlite3.Connection,
) -> None:
    depth = corpus_connection.execute(
        "WITH RECURSIVE chain(id, depth) AS ("
        "  SELECT id, 1 FROM node_version WHERE parent_node_version_id IS NULL"
        "  UNION ALL"
        "  SELECT n.id, chain.depth + 1 FROM node_version AS n"
        "  JOIN chain ON n.parent_node_version_id = chain.id"
        ") SELECT max(depth) FROM chain"
    ).fetchone()[0]
    assert int(depth) >= 4
    assert _scalar(corpus_connection, "SELECT count(*) FROM node_version WHERE heading IS NULL") == 0
    assert _scalar(corpus_connection, "SELECT count(*) FROM node_version WHERE ordinal IS NULL") == 0
    kinds = {
        row[0]
        for row in corpus_connection.execute(
            "SELECT DISTINCT node_kind FROM document_node"
        ).fetchall()
    }
    assert {"PART", "DIVISION", "SECTION", "SUBSECTION"} <= kinds


def test_three_evidenced_legal_events(corpus_connection: sqlite3.Connection) -> None:
    types = {
        row[0]
        for row in corpus_connection.execute("SELECT DISTINCT event_type FROM legal_event").fetchall()
    }
    assert {"COMMENCEMENT", "AMENDMENT", "REPEAL"} <= types
    # PRD §15.2 — status is derived from EVIDENCED events, so every event carries its evidence.
    assert _scalar(
        corpus_connection,
        "SELECT count(*) FROM legal_event"
        " WHERE evidence_node_version_id IS NULL OR target_version_id IS NULL",
    ) == 0


def test_three_relations_including_one_model_suggested(corpus_connection: sqlite3.Connection) -> None:
    assert _scalar(corpus_connection, "SELECT count(*) FROM node_relation") >= 3
    assert _scalar(
        corpus_connection, "SELECT count(*) FROM node_relation WHERE confidence_state = 'MODEL_SUGGESTED'"
    ) == 1
    assert _scalar(
        corpus_connection,
        "SELECT count(*) FROM node_relation WHERE confidence_state = 'PARSER_DETERMINISTIC'"
        " AND evidence_start IS NOT NULL AND evidence_end IS NOT NULL",
    ) >= 2


def test_the_model_suggested_relation_supports_no_legal_event(
    corpus_connection: sqlite3.Connection,
) -> None:
    """PRD §35.2: `MODEL_SUGGESTED` cannot support definitive status."""
    assert _scalar(
        corpus_connection,
        "SELECT count(*) FROM legal_event AS e"
        " JOIN node_relation AS r ON r.evidence_node_version_id = e.evidence_node_version_id"
        " WHERE r.confidence_state = 'MODEL_SUGGESTED'",
    ) == 0


def test_four_exact_identifiers(corpus_connection: sqlite3.Connection) -> None:
    """`SRCH-004`: provision reference, neutral citation, award identifier, ABN."""
    assert _scalar(
        corpus_connection,
        "SELECT count(*) FROM legal_document WHERE official_identifier = 'SYN2026A00001'",
    ) == 1
    assert _scalar(
        corpus_connection,
        "SELECT count(*) FROM legal_document WHERE neutral_citation = '[2026] SYNFC 7'",
    ) == 1
    assert _scalar(
        corpus_connection,
        "SELECT count(*) FROM legal_document WHERE official_identifier = 'SYNMA000001'",
    ) == 1
    abn = corpus_connection.execute(
        "SELECT employer_abn FROM legal_document WHERE employer_abn IS NOT NULL"
    ).fetchone()[0]
    from generator.synthetic_corpus import abn_is_valid

    assert abn_is_valid(abn), abn


def test_one_prohibited_licence_assessment(corpus_connection: sqlite3.Connection) -> None:
    assert _scalar(
        corpus_connection,
        "SELECT count(*) FROM licence_assessment WHERE status = 'PROHIBITED' AND prohibited_use = 1",
    ) == 1


def test_one_open_quarantine_item_on_a_non_included_artifact(
    corpus_connection: sqlite3.Connection,
) -> None:
    assert _scalar(
        corpus_connection, "SELECT count(*) FROM quarantine_item WHERE status = 'OPEN'"
    ) == 1
    # PRD §35.3 — the fixture demonstrates the state WITHOUT including the item: no document version
    # references the quarantined artifact.
    assert _scalar(
        corpus_connection,
        "SELECT count(*) FROM quarantine_item AS q"
        " JOIN document_version AS v ON v.source_artifact_id = q.artifact_id"
        " WHERE q.status = 'OPEN'",
    ) == 0


def test_at_least_one_node_carries_non_ascii_text(corpus_connection: sqlite3.Connection) -> None:
    rows = [
        row[0]
        for row in corpus_connection.execute("SELECT canonical_text FROM node_version").fetchall()
    ]
    assert any(any(ord(character) > 127 for character in text) for text in rows)


def test_every_id_matches_the_fnd_03_opaque_id_form(corpus_connection: sqlite3.Connection) -> None:
    from contracts.validate import CORPUS_ID_PATTERN

    tables = (
        "authority",
        "source",
        "licence_snapshot",
        "licence_assessment",
        "source_artifact",
        "ingestion_run",
        "quarantine_item",
        "legal_document",
        "document_version",
        "document_node",
        "node_version",
        "node_relation",
        "legal_event",
        "search_chunk",
    )
    offenders: list[str] = []
    for table in tables:
        for (identifier,) in corpus_connection.execute(f"SELECT id FROM {table}").fetchall():
            if not CORPUS_ID_PATTERN.match(identifier):
                offenders.append(f"{table}.{identifier}")
    assert offenders == [], offenders


def test_no_chunk_embedding_rows(corpus_connection: sqlite3.Connection) -> None:
    """Deliverable 3: no embedding pass exists, so the fixture claims no vectors."""
    assert _scalar(corpus_connection, "SELECT count(*) FROM chunk_embedding") == 0
