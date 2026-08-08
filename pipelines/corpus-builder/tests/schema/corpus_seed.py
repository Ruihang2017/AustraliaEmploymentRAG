"""Row-seeding helpers for the corpus-schema suite.

A uniquely-named module rather than `conftest`: with no `__init__.py` in the test directories
(`tools/workspace-assertions.mjs::assertSkeleton()` allows the uv member exactly one package
directory) pytest imports test modules by bare basename, so every shared module under
`pipelines/**` needs a globally unique name.
"""

from __future__ import annotations

import sqlite3

TS = "2026-07-01T00:00:00Z"
DATE = "2026-07-01"
HASH = "a" * 64


def seed_provenance(connection: sqlite3.Connection) -> None:
    """authority -> source -> licence_snapshot -> licence_assessment -> source_artifact -> run."""
    connection.execute(
        "INSERT INTO authority (id, name, authority_type, jurisdiction, court_level, official_url,"
        " created_at) VALUES ('auth_1', 'Example Authority', 'PARLIAMENT', 'AU-CTH', NULL,"
        " 'https://example.gov.au', ?)",
        (TS,),
    )
    connection.execute(
        "INSERT INTO source (id, source_group_id, name, authority_id, jurisdiction, base_url,"
        " adapter_key, coverage_status, freshness_status, licence_assessment_id, created_at)"
        " VALUES ('src_1', 'grp_1', 'Example source', 'auth_1', 'AU-CTH',"
        " 'https://example.gov.au', 'leg-cth-example', 'METADATA_AND_LINK_ACTIVE', 'CURRENT',"
        " NULL, ?)",
        (TS,),
    )
    connection.execute(
        "INSERT INTO licence_snapshot (id, source_id, captured_at, terms_url, terms_sha256,"
        " artifact_key, created_at) VALUES ('lsnap_1', 'src_1', ?, 'https://example.gov.au/terms',"
        " ?, 'terms/1', ?)",
        (TS, HASH, TS),
    )
    connection.execute(
        "INSERT INTO licence_assessment (id, licence_snapshot_id, commercial_use, storage,"
        " indexing, embedding, display, quotation, export, prohibited_use, attribution_text,"
        " max_quote_chars, status, assessed_at, notes_internal, created_at)"
        " VALUES ('lass_1', 'lsnap_1', 1, 1, 1, 1, 1, 1, 1, 0, 'Example attribution', 400,"
        " 'PERMITTED_WITH_ATTRIBUTION', ?, NULL, ?)",
        (TS, TS),
    )
    connection.execute(
        "INSERT INTO source_artifact (id, source_id, official_url, retrieved_at, http_status,"
        " etag, last_modified, content_type, byte_length, sha256, r2_key, licence_snapshot_id,"
        " created_at) VALUES ('art_1', 'src_1', 'https://example.gov.au/a', ?, 200, NULL, NULL,"
        " 'text/html', 100, ?, NULL, 'lsnap_1', ?)",
        (TS, HASH, TS),
    )
    connection.execute(
        "INSERT INTO ingestion_run (id, source_id, mode, started_at, finished_at, status,"
        " tool_versions_json, failure_code, created_at) VALUES ('run_1', 'src_1', 'FULL', ?, ?,"
        " 'SUCCEEDED', '{}', NULL, ?)",
        (TS, TS, TS),
    )


def seed_corpus(connection: sqlite3.Connection) -> None:
    """A minimal but complete document -> version -> node -> node_version -> chunk chain."""
    seed_provenance(connection)
    connection.execute(
        "INSERT INTO legal_document (id, source_id, document_type, canonical_title,"
        " official_identifier, neutral_citation, employer_abn, stable_source_key, created_at)"
        " VALUES ('doc_1', 'src_1', 'PRIMARY_LEGISLATION', 'Example Act 2026', 'C2026A00042',"
        " NULL, NULL, 'C2026A00042', ?)",
        (TS,),
    )
    connection.execute(
        "INSERT INTO document_version (id, document_id, source_artifact_id, version_label,"
        " publication_date, effective_from, effective_to, legal_status, retrieved_at,"
        " content_hash, official_url, created_at) VALUES ('dv_1', 'doc_1', 'art_1', '2026-07-01',"
        " ?, ?, NULL, 'IN_FORCE', ?, ?, 'https://example.gov.au/a', ?)",
        (DATE, DATE, TS, HASH, TS),
    )
    connection.execute(
        "INSERT INTO document_node (id, document_id, stable_node_key, node_kind, created_at)"
        " VALUES ('node_1', 'doc_1', 's3', 'SECTION', ?)",
        (TS,),
    )
    connection.execute(
        "INSERT INTO node_version (id, document_version_id, document_node_id,"
        " parent_node_version_id, display_label, heading, canonical_text, ordinal, effective_from,"
        " effective_to, text_hash, created_at) VALUES ('nv_1', 'dv_1', 'node_1', NULL,"
        " 'Section 3', '3 Definitions', 'In this Act...', 0, ?, NULL, ?, ?)",
        (DATE, HASH, TS),
    )
    connection.execute(
        "INSERT INTO node_relation (id, from_node_version_id, to_node_version_id, relation_type,"
        " evidence_node_version_id, evidence_start, evidence_end, derivation, parser_version,"
        " confidence_state, created_at) VALUES ('nrel_1', 'nv_1', 'nv_1', 'REFERS_TO', 'nv_1', 0,"
        " 5, 'phrase match', '1.0.0', 'PARSER_DETERMINISTIC', ?)",
        (TS,),
    )
    connection.execute(
        "INSERT INTO legal_event (id, document_id, event_type, event_date, effective_date,"
        " evidence_node_version_id, target_version_id, metadata_json, created_at)"
        " VALUES ('evt_1', 'doc_1', 'COMMENCEMENT', ?, ?, 'nv_1', 'dv_1', NULL, ?)",
        (DATE, DATE, TS),
    )
    connection.execute(
        "INSERT INTO search_chunk (id, node_version_id, chunk_ordinal, start_offset, end_offset,"
        " text_hash, index_tier, created_at) VALUES ('chk_1', 'nv_1', 0, 0, 10, ?,"
        " 'TIER_1_FULL_SEMANTIC', ?)",
        (HASH, TS),
    )
    connection.execute(
        "INSERT INTO chunk_embedding (search_chunk_id, profile_id, vector_key, dimensions,"
        " quantisation) VALUES ('chk_1', 'profile-a', 'vec/1', 384, 'int8')"
    )
