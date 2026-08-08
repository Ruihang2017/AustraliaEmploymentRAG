"""Every PRD §35.2 / §35.3 table and required column exists in a created database.

The expectation below is TRANSCRIBED FROM THE PRD, not read back from the DDL — the CRPS-01
acceptance item says so explicitly, because a test that reads the DDL back can only prove the DDL
equals itself.
"""

from __future__ import annotations

import sqlite3

import pytest

# PRD §35.2 "Corpus database: identity and versions" and §35.3 "Corpus database: provenance,
# licensing and releases", transcribed verbatim. `corpus_meta` is CRPS-01 deliverable 6 (§35 is the
# MINIMUM dictionary; PRD §18.4 requires the schema version to exist somewhere in the bundle).
REQUIRED_COLUMNS: dict[str, tuple[str, ...]] = {
    # ---- PRD §35.2 -----------------------------------------------------------------------------
    "source": (
        "id", "source_group_id", "name", "authority_id", "jurisdiction", "base_url", "adapter_key",
        "coverage_status", "freshness_status", "licence_assessment_id", "last_discovery_at",
        "last_ingestion_at",
    ),
    "authority": ("id", "name", "authority_type", "jurisdiction", "court_level", "official_url"),
    "legal_document": (
        "id", "source_id", "document_type", "canonical_title", "official_identifier",
        "neutral_citation", "employer_abn", "stable_source_key",
    ),
    "document_version": (
        "id", "document_id", "source_artifact_id", "version_label", "publication_date",
        "effective_from", "effective_to", "legal_status", "retrieved_at", "content_hash",
        "official_url",
    ),
    "document_node": ("id", "document_id", "stable_node_key", "node_kind"),
    "node_version": (
        "id", "document_version_id", "document_node_id", "parent_node_version_id", "display_label",
        "heading", "canonical_text", "ordinal", "effective_from", "effective_to", "text_hash",
    ),
    "node_relation": (
        "id", "from_node_version_id", "to_node_version_id", "relation_type",
        "evidence_node_version_id", "evidence_start", "evidence_end", "derivation",
        "parser_version", "confidence_state",
    ),
    "legal_event": (
        "id", "document_id", "event_type", "event_date", "effective_date",
        "evidence_node_version_id", "target_version_id", "metadata_json",
    ),
    # ---- PRD §35.3 -----------------------------------------------------------------------------
    "source_artifact": (
        "id", "source_id", "official_url", "retrieved_at", "http_status", "etag", "last_modified",
        "content_type", "byte_length", "sha256", "r2_key", "licence_snapshot_id",
    ),
    "licence_snapshot": ("id", "source_id", "captured_at", "terms_url", "terms_sha256", "artifact_key"),
    "licence_assessment": (
        "id", "licence_snapshot_id",
        # "use-decision columns" — PRD §11.1's eight decisions, as booleans (§35.1).
        "commercial_use", "storage", "indexing", "embedding", "display", "quotation", "export",
        "prohibited_use",
        "attribution_text", "max_quote_chars", "status", "assessed_at", "notes_internal",
    ),
    "ingestion_run": (
        "id", "source_id", "mode", "started_at", "finished_at", "status",
        "discovered_count", "fetched_count", "changed_count", "parsed_count", "quarantined_count",
        "tool_versions_json", "failure_code",
    ),
    "quarantine_item": (
        "id", "ingestion_run_id", "artifact_id", "reason_code", "details_json", "status",
        "resolution", "resolved_at",
    ),
    "corpus_release": (
        "id", "parent_id", "status", "created_at", "manifest_sha256", "signature", "schema_version",
        "parser_version", "embedding_profile", "counts_json", "coverage_json", "evaluation_json",
    ),
    "search_chunk": (
        "id", "node_version_id", "chunk_ordinal", "start_offset", "end_offset", "text_hash",
        "index_tier",
    ),
    "chunk_embedding": ("search_chunk_id", "profile_id", "vector_key", "dimensions", "quantisation"),
    # ---- CRPS-01 deliverable 6 -------------------------------------------------------------------
    "corpus_meta": (
        "id", "schema_version", "built_at", "release_id", "builder_version", "contract_version",
    ),
}

#: PRD §35.3 fixes `chunk_embedding` at exactly five columns. Confirmed breakdown-plan §8 Q11 model,
#: tokenizer and runtime pins belong to the corpus/retrieval MANIFEST (CRPS-02 / CRPS-05, sub-PRD
#: D14/D15) and must never be duplicated into a second PRD §44.3 serial-owned artifact.
CHUNK_EMBEDDING_EXACT = {"search_chunk_id", "profile_id", "vector_key", "dimensions", "quantisation"}

#: Substrings that would signal a model/tokenizer/runtime/licence pin leaking into a corpus table.
FORBIDDEN_COLUMN_SUBSTRINGS = ("model", "tokenizer", "runtime", "onnx", "revision", "licen")

#: The only columns allowed to contain "licen": the licensing tables PRD §35.3 defines, plus the
#: `source` foreign key to the assessment.
LICENCE_COLUMN_ALLOWLIST = {
    ("licence_snapshot", "licence_snapshot_id"),
    ("source", "licence_assessment_id"),
    ("source_artifact", "licence_snapshot_id"),
    ("licence_assessment", "licence_snapshot_id"),
}


def table_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    return [row[1] for row in conn.execute(f"PRAGMA table_info('{table}')")]


def test_created_database_holds_exactly_the_seventeen_tables(conn: sqlite3.Connection) -> None:
    actual = {
        row[0]
        for row in conn.execute("SELECT name FROM sqlite_schema WHERE type = 'table'")
        if not row[0].startswith("sqlite_")
    }
    assert actual == set(REQUIRED_COLUMNS)


@pytest.mark.parametrize("table", sorted(REQUIRED_COLUMNS))
def test_table_holds_every_required_column(conn: sqlite3.Connection, table: str) -> None:
    actual = table_columns(conn, table)
    assert actual, f"table {table} does not exist"
    missing = [column for column in REQUIRED_COLUMNS[table] if column not in actual]
    assert not missing, f"{table} is missing PRD-required column(s): {missing}"


@pytest.mark.parametrize("table", sorted(set(REQUIRED_COLUMNS) - {"chunk_embedding"}))
def test_every_table_but_chunk_embedding_has_created_at(conn: sqlite3.Connection, table: str) -> None:
    # CRPS-01 deliverable 2. `chunk_embedding` is the documented exception: acceptance item 9
    # requires it to carry EXACTLY the five PRD §35.3 columns, and the specific rule wins.
    assert "created_at" in table_columns(conn, table)


def test_chunk_embedding_carries_exactly_the_prd_columns(conn: sqlite3.Connection) -> None:
    assert set(table_columns(conn, "chunk_embedding")) == CHUNK_EMBEDDING_EXACT


def test_chunk_embedding_primary_key_is_chunk_and_profile(conn: sqlite3.Connection) -> None:
    key = {row[1] for row in conn.execute("PRAGMA table_info('chunk_embedding')") if row[5]}
    assert key == {"search_chunk_id", "profile_id"}


def test_no_corpus_table_carries_a_model_tokenizer_runtime_or_licence_pin(
    conn: sqlite3.Connection,
) -> None:
    offenders: list[str] = []
    for table in sorted(REQUIRED_COLUMNS):
        for column in table_columns(conn, table):
            for needle in FORBIDDEN_COLUMN_SUBSTRINGS:
                if needle in column.lower() and (table, column) not in LICENCE_COLUMN_ALLOWLIST:
                    offenders.append(f"{table}.{column} (matched {needle!r})")
    assert not offenders, (
        "model/tokenizer/runtime/licence pins belong to the corpus manifest (CRPS-02/CRPS-05, "
        f"sub-PRD D14/D15), never to a corpus table: {offenders}"
    )


def test_every_id_column_is_text_primary_key(conn: sqlite3.Connection) -> None:
    # PRD §35.1: "IDs are TEXT PRIMARY KEY". chunk_embedding has a composite key and no `id`.
    for table in sorted(set(REQUIRED_COLUMNS) - {"chunk_embedding"}):
        rows = list(conn.execute(f"PRAGMA table_info('{table}')"))
        identity = [row for row in rows if row[1] == "id"]
        assert identity, f"{table} has no `id` column"
        assert identity[0][2] == "TEXT", f"{table}.id is {identity[0][2]}, expected TEXT"
        assert identity[0][5] == 1, f"{table}.id is not the primary key"
