"""Uniqueness, date/boolean CHECKs, offsets and the source/licence reference cycle."""

from __future__ import annotations

import sqlite3

import pytest

from corpus_seed import DATE, HASH, TS, seed_corpus, seed_provenance


def test_duplicate_source_stable_key_is_rejected(conn: sqlite3.Connection) -> None:
    seed_corpus(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO legal_document (id, source_id, document_type, canonical_title,"
            " stable_source_key, created_at) VALUES ('doc_2', 'src_1', 'PRIMARY_LEGISLATION',"
            " 'Duplicate', 'C2026A00042', ?)",
            (TS,),
        )


def test_duplicate_document_node_key_is_rejected(conn: sqlite3.Connection) -> None:
    seed_corpus(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO document_node (id, document_id, stable_node_key, node_kind, created_at)"
            " VALUES ('node_2', 'doc_1', 's3', 'SECTION', ?)",
            (TS,),
        )


def test_duplicate_chunk_ordinal_is_rejected(conn: sqlite3.Connection) -> None:
    seed_corpus(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO search_chunk (id, node_version_id, chunk_ordinal, start_offset,"
            " end_offset, text_hash, index_tier, created_at) VALUES ('chk_2', 'nv_1', 0, 10, 20,"
            " ?, 'TIER_1_FULL_SEMANTIC', ?)",
            (HASH, TS),
        )


def test_duplicate_source_group_adapter_is_rejected(conn: sqlite3.Connection) -> None:
    seed_provenance(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO source (id, source_group_id, name, authority_id, jurisdiction, base_url,"
            " adapter_key, coverage_status, freshness_status, created_at) VALUES ('src_2', 'grp_1',"
            " 'Dup', 'auth_1', 'AU-CTH', 'https://example.gov.au', 'leg-cth-example',"
            " 'METADATA_AND_LINK_ACTIVE', 'CURRENT', ?)",
            (TS,),
        )


def test_duplicate_document_version_label_is_rejected(conn: sqlite3.Connection) -> None:
    seed_corpus(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO document_version (id, document_id, source_artifact_id, version_label,"
            " effective_from, legal_status, retrieved_at, content_hash, official_url, created_at)"
            " VALUES ('dv_2', 'doc_1', 'art_1', '2026-07-01', ?, 'IN_FORCE', ?, ?, 'u', ?)",
            (DATE, TS, HASH, TS),
        )


@pytest.mark.parametrize(
    "value",
    ["2026-8-3", "03/08/2026", "2026-08-03T00:00:00Z", "2026-08-031", "", "20260803"],
)
def test_legal_date_column_rejects(conn: sqlite3.Connection, value: str) -> None:
    seed_corpus(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO legal_event (id, document_id, event_type, event_date, created_at)"
            " VALUES ('evt_bad', 'doc_1', 'COMMENCEMENT', ?, ?)",
            (value, TS),
        )


@pytest.mark.parametrize("value", ["2026-08-03", None])
def test_legal_date_column_accepts(conn: sqlite3.Connection, value: str | None) -> None:
    seed_corpus(conn)
    conn.execute(
        "INSERT INTO legal_event (id, document_id, event_type, event_date, created_at)"
        " VALUES ('evt_ok', 'doc_1', 'COMMENCEMENT', ?, ?)",
        (value, TS),
    )


@pytest.mark.parametrize("value", ["2026-07-01", "2026-07-01T00:00:00", "2026-07-01 00:00:00Z", "now"])
def test_timestamp_column_rejects_non_utc_iso(conn: sqlite3.Connection, value: str) -> None:
    seed_corpus(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO legal_document (id, source_id, document_type, canonical_title,"
            " stable_source_key, created_at) VALUES ('doc_ts', 'src_1', 'PRIMARY_LEGISLATION',"
            " 'x', 'ts', ?)",
            (value,),
        )


@pytest.mark.parametrize("value", [2, -1, "yes"])
def test_boolean_column_rejects(conn: sqlite3.Connection, value: object) -> None:
    seed_provenance(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO licence_assessment (id, licence_snapshot_id, commercial_use, storage,"
            " indexing, embedding, display, quotation, export, prohibited_use, status,"
            " assessed_at, created_at) VALUES ('lass_bad', 'lsnap_1', ?, 1, 1, 1, 1, 1, 1, 0,"
            " 'PERMITTED', ?, ?)",
            (value, TS, TS),
        )


@pytest.mark.parametrize("value", [0, 1])
def test_boolean_column_accepts(conn: sqlite3.Connection, value: int) -> None:
    seed_provenance(conn)
    conn.execute(
        "INSERT INTO licence_assessment (id, licence_snapshot_id, commercial_use, storage,"
        " indexing, embedding, display, quotation, export, prohibited_use, status, assessed_at,"
        " created_at) VALUES ('lass_ok', 'lsnap_1', ?, 1, 1, 1, 1, 1, 1, 0, 'PERMITTED', ?, ?)",
        (value, TS, TS),
    )


def test_offsets_must_be_a_non_negative_half_open_range(conn: sqlite3.Connection) -> None:
    seed_corpus(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO search_chunk (id, node_version_id, chunk_ordinal, start_offset,"
            " end_offset, text_hash, index_tier, created_at) VALUES ('chk_neg', 'nv_1', 1, -1, 5,"
            " ?, 'TIER_1_FULL_SEMANTIC', ?)",
            (HASH, TS),
        )
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO search_chunk (id, node_version_id, chunk_ordinal, start_offset,"
            " end_offset, text_hash, index_tier, created_at) VALUES ('chk_inv', 'nv_1', 2, 9, 4,"
            " ?, 'TIER_1_FULL_SEMANTIC', ?)",
            (HASH, TS),
        )
    # An empty half-open range is legal.
    conn.execute(
        "INSERT INTO search_chunk (id, node_version_id, chunk_ordinal, start_offset, end_offset,"
        " text_hash, index_tier, created_at) VALUES ('chk_empty', 'nv_1', 3, 4, 4, ?,"
        " 'TIER_1_FULL_SEMANTIC', ?)",
        (HASH, TS),
    )


def test_foreign_keys_are_enforced(conn: sqlite3.Connection) -> None:
    seed_corpus(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO search_chunk (id, node_version_id, chunk_ordinal, start_offset,"
            " end_offset, text_hash, index_tier, created_at) VALUES ('chk_fk', 'nv_missing', 9, 0,"
            " 1, ?, 'TIER_1_FULL_SEMANTIC', ?)",
            (HASH, TS),
        )


def test_the_source_licence_reference_cycle_can_be_inserted_in_one_transaction(
    conn: sqlite3.Connection,
) -> None:
    """source -> licence_assessment -> licence_snapshot -> source is a genuine cycle (PRD §35.2/3).

    `source.licence_assessment_id` is nullable and DEFERRABLE INITIALLY DEFERRED so the whole cycle
    commits together with `foreign_keys = ON`.
    """
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    conn.execute("BEGIN")
    conn.execute(
        "INSERT INTO authority (id, name, authority_type, jurisdiction, official_url, created_at)"
        " VALUES ('auth_c', 'A', 'PARLIAMENT', 'AU-CTH', 'https://example.gov.au', ?)",
        (TS,),
    )
    conn.execute(
        "INSERT INTO source (id, source_group_id, name, authority_id, jurisdiction, base_url,"
        " adapter_key, coverage_status, freshness_status, licence_assessment_id, created_at)"
        " VALUES ('src_c', 'grp_c', 'S', 'auth_c', 'AU-CTH', 'https://example.gov.au', 'a-c',"
        " 'METADATA_AND_LINK_ACTIVE', 'CURRENT', 'lass_c', ?)",
        (TS,),
    )
    conn.execute(
        "INSERT INTO licence_snapshot (id, source_id, captured_at, terms_url, terms_sha256,"
        " created_at) VALUES ('lsnap_c', 'src_c', ?, 'https://example.gov.au/t', ?, ?)",
        (TS, HASH, TS),
    )
    conn.execute(
        "INSERT INTO licence_assessment (id, licence_snapshot_id, commercial_use, storage,"
        " indexing, embedding, display, quotation, export, prohibited_use, status, assessed_at,"
        " created_at) VALUES ('lass_c', 'lsnap_c', 1, 1, 1, 1, 1, 1, 1, 0, 'PERMITTED', ?, ?)",
        (TS, TS),
    )
    conn.execute("COMMIT")
    assert conn.execute("SELECT licence_assessment_id FROM source WHERE id = 'src_c'").fetchone() == (
        "lass_c",
    )


def test_a_deferred_cycle_that_is_never_closed_fails_at_commit(conn: sqlite3.Connection) -> None:
    """The deferral must not become a hole: an unresolved reference still fails, just later."""
    conn.execute("BEGIN")
    conn.execute(
        "INSERT INTO authority (id, name, authority_type, jurisdiction, official_url, created_at)"
        " VALUES ('auth_d', 'A', 'PARLIAMENT', 'AU-CTH', 'https://example.gov.au', ?)",
        (TS,),
    )
    conn.execute(
        "INSERT INTO source (id, source_group_id, name, authority_id, jurisdiction, base_url,"
        " adapter_key, coverage_status, freshness_status, licence_assessment_id, created_at)"
        " VALUES ('src_d', 'grp_d', 'S', 'auth_d', 'AU-CTH', 'https://example.gov.au', 'a-d',"
        " 'METADATA_AND_LINK_ACTIVE', 'CURRENT', 'lass_missing', ?)",
        (TS,),
    )
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("COMMIT")
