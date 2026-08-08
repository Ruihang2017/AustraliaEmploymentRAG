-- CRPS-01 — corpus.sqlite DDL (PRD §35.1, §35.2, §35.3, §35.8; §15.3; §18.3).
--
-- THIS FILE IS A TEMPLATE, NOT EXECUTABLE SQL. It is a `string.Template`: every
-- `enum_check_<table>_<column>` placeholder (dollar-brace form) is replaced by
-- `contracts.enums.render_enum_checks()` with a `CHECK (<column> IN (...))` list generated from the
-- `packages/contracts` canonical enum export (PRD §35.1: *"Enumerations use checked text values
-- generated from packages/contracts"*). Hand-writing an enum literal here is a defect — the enum
-- drift test (tests/schema/test_enum_drift.py) fails on any quoted membership list in this file --
-- including one written inside a comment, which is why this sentence does not spell one out.
--
-- Columns whose enum family `packages/contracts` does not publish yet are listed in the `pending`
-- array of 002_enums.map.json and render to the empty string: the column is `TEXT` with no enum
-- CHECK. That gap is Q-CRPS-4 / FND-03, not a licence to hand-copy the values.
--
-- Creation order is FK-safe with one deliberate exception: `source.licence_assessment_id` points
-- forward at `licence_assessment`, which points back at `licence_snapshot` → `source`. That is a
-- genuine reference cycle in PRD §35.2/§35.3, so the column is nullable and
-- DEFERRABLE INITIALLY DEFERRED — a whole cycle can be inserted inside one transaction.
--
-- IMMUTABILITY (PRD §35.8 invariant 5). The BEFORE UPDATE / BEFORE DELETE triggers below are
-- defence-in-depth for the build pipeline's own mistakes. They are NOT the production guarantee:
-- SQLite's `PRAGMA recursive_triggers` defaults to OFF, and with it OFF an `INSERT OR REPLACE`
-- deletes a conflicting row WITHOUT firing the BEFORE DELETE trigger. `contracts.schema` therefore
-- sets `PRAGMA recursive_triggers = ON` on every connection it hands out, but the pragma is
-- per-connection and is not stored in the file — a third-party writer (the Rust searcher, the
-- sqlite3 CLI) does not inherit it. The durable production guarantee is the read-only open
-- (PRD §18.3), which `open_corpus_database(read_only=True)` provides.
--
-- CONSEQUENCE FOR CRPS-06: because `document_version` and `node_version` have no UPDATE path at
-- all, `effective_to` can never be closed off after insert. A consolidated-effect correction is an
-- appended replacement row, never an update. PRD §35.2 also asks for "non-overlap validation where
-- versions represent consolidated effect"; SQLite cannot express an interval-overlap constraint
-- declaratively, so that check is reallocated to a CRPS-06 validation gate (see the ticket's
-- Feedback obligation and docs/prd/04-corpus-contract/README.md).

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------------------------------------------
-- authority (PRD §35.2)
-- ------------------------------------------------------------------------------------------------
CREATE TABLE authority (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  authority_type  TEXT NOT NULL ${enum_check_authority_authority_type},
  jurisdiction    TEXT NOT NULL,
  court_level     TEXT ${enum_check_authority_court_level},
  official_url    TEXT NOT NULL,
  created_at      TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z')
);

CREATE INDEX authority_jurisdiction_type_level_idx
  ON authority (jurisdiction, authority_type, court_level);

-- ------------------------------------------------------------------------------------------------
-- source (PRD §35.2)
-- ------------------------------------------------------------------------------------------------
CREATE TABLE source (
  id                    TEXT PRIMARY KEY,
  source_group_id       TEXT NOT NULL,
  name                  TEXT NOT NULL,
  authority_id          TEXT NOT NULL REFERENCES authority (id),
  jurisdiction          TEXT NOT NULL,
  base_url              TEXT NOT NULL,
  adapter_key           TEXT NOT NULL,
  coverage_status       TEXT NOT NULL ${enum_check_source_coverage_status},
  freshness_status      TEXT NOT NULL ${enum_check_source_freshness_status},
  -- Nullable + deferred: source → licence_assessment → licence_snapshot → source is a real cycle.
  licence_assessment_id TEXT REFERENCES licence_assessment (id) DEFERRABLE INITIALLY DEFERRED,
  last_discovery_at     TEXT CHECK (last_discovery_at IS NULL OR last_discovery_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  last_ingestion_at     TEXT CHECK (last_ingestion_at IS NULL OR last_ingestion_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  created_at            TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z')
);

CREATE UNIQUE INDEX source_group_adapter_uidx ON source (source_group_id, adapter_key);

-- ------------------------------------------------------------------------------------------------
-- licence_snapshot (PRD §35.3) — immutable
-- ------------------------------------------------------------------------------------------------
CREATE TABLE licence_snapshot (
  id           TEXT PRIMARY KEY,
  source_id    TEXT NOT NULL REFERENCES source (id) DEFERRABLE INITIALLY DEFERRED,
  captured_at  TEXT NOT NULL CHECK (captured_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  terms_url    TEXT NOT NULL,
  terms_sha256 TEXT NOT NULL CHECK (length(terms_sha256) = 64 AND terms_sha256 GLOB '[0-9a-f]*'),
  artifact_key TEXT,
  created_at   TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z')
);

CREATE INDEX licence_snapshot_source_idx ON licence_snapshot (source_id, captured_at);

-- ------------------------------------------------------------------------------------------------
-- licence_assessment (PRD §35.3, §11.1) — the eight use decisions are booleans (PRD §35.1)
-- ------------------------------------------------------------------------------------------------
CREATE TABLE licence_assessment (
  id                  TEXT PRIMARY KEY,
  licence_snapshot_id TEXT NOT NULL REFERENCES licence_snapshot (id) DEFERRABLE INITIALLY DEFERRED,
  commercial_use      INTEGER NOT NULL CHECK (commercial_use IN (0, 1)),
  storage             INTEGER NOT NULL CHECK (storage IN (0, 1)),
  indexing            INTEGER NOT NULL CHECK (indexing IN (0, 1)),
  embedding           INTEGER NOT NULL CHECK (embedding IN (0, 1)),
  display             INTEGER NOT NULL CHECK (display IN (0, 1)),
  quotation           INTEGER NOT NULL CHECK (quotation IN (0, 1)),
  export              INTEGER NOT NULL CHECK (export IN (0, 1)),
  prohibited_use      INTEGER NOT NULL CHECK (prohibited_use IN (0, 1)),
  attribution_text    TEXT,
  max_quote_chars     INTEGER CHECK (max_quote_chars IS NULL OR max_quote_chars >= 0),
  status              TEXT NOT NULL ${enum_check_licence_assessment_status},
  assessed_at         TEXT NOT NULL CHECK (assessed_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  notes_internal      TEXT,
  created_at          TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z')
);

-- ------------------------------------------------------------------------------------------------
-- source_artifact (PRD §35.3) — immutable; `r2_key` absent when storage is not permitted
-- ------------------------------------------------------------------------------------------------
CREATE TABLE source_artifact (
  id                  TEXT PRIMARY KEY,
  source_id           TEXT NOT NULL REFERENCES source (id),
  official_url        TEXT NOT NULL,
  retrieved_at        TEXT NOT NULL CHECK (retrieved_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  http_status         INTEGER NOT NULL CHECK (http_status >= 100 AND http_status <= 599),
  etag                TEXT,
  last_modified       TEXT,
  content_type        TEXT NOT NULL,
  byte_length         INTEGER NOT NULL CHECK (byte_length >= 0),
  sha256              TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 GLOB '[0-9a-f]*'),
  r2_key              TEXT,
  licence_snapshot_id TEXT NOT NULL REFERENCES licence_snapshot (id),
  created_at          TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z')
);

CREATE INDEX source_artifact_source_idx ON source_artifact (source_id, retrieved_at);
CREATE INDEX source_artifact_sha256_idx ON source_artifact (sha256);

-- ------------------------------------------------------------------------------------------------
-- ingestion_run (PRD §35.3)
-- ------------------------------------------------------------------------------------------------
CREATE TABLE ingestion_run (
  id                 TEXT PRIMARY KEY,
  source_id          TEXT NOT NULL REFERENCES source (id),
  mode               TEXT NOT NULL ${enum_check_ingestion_run_mode},
  started_at         TEXT NOT NULL CHECK (started_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  finished_at        TEXT CHECK (finished_at IS NULL OR finished_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  status             TEXT NOT NULL ${enum_check_ingestion_run_status},
  discovered_count   INTEGER NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
  fetched_count      INTEGER NOT NULL DEFAULT 0 CHECK (fetched_count >= 0),
  changed_count      INTEGER NOT NULL DEFAULT 0 CHECK (changed_count >= 0),
  parsed_count       INTEGER NOT NULL DEFAULT 0 CHECK (parsed_count >= 0),
  quarantined_count  INTEGER NOT NULL DEFAULT 0 CHECK (quarantined_count >= 0),
  tool_versions_json TEXT NOT NULL,
  failure_code       TEXT,
  created_at         TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z')
);

CREATE INDEX ingestion_run_source_idx ON ingestion_run (source_id, started_at);

-- ------------------------------------------------------------------------------------------------
-- quarantine_item (PRD §35.3) — "cannot enter promoted release while open" is a CRPS-06 gate
-- ------------------------------------------------------------------------------------------------
CREATE TABLE quarantine_item (
  id               TEXT PRIMARY KEY,
  ingestion_run_id TEXT NOT NULL REFERENCES ingestion_run (id),
  artifact_id      TEXT REFERENCES source_artifact (id),
  reason_code      TEXT NOT NULL,
  details_json     TEXT,
  status           TEXT NOT NULL ${enum_check_quarantine_item_status},
  resolution       TEXT,
  resolved_at      TEXT CHECK (resolved_at IS NULL OR resolved_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  created_at       TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z')
);

CREATE INDEX quarantine_item_run_status_idx ON quarantine_item (ingestion_run_id, status);

-- ------------------------------------------------------------------------------------------------
-- legal_document (PRD §35.2)
-- ------------------------------------------------------------------------------------------------
CREATE TABLE legal_document (
  id                  TEXT PRIMARY KEY,
  source_id           TEXT NOT NULL REFERENCES source (id),
  document_type       TEXT NOT NULL ${enum_check_legal_document_document_type},
  canonical_title     TEXT NOT NULL,
  official_identifier TEXT,
  neutral_citation    TEXT,
  employer_abn        TEXT,
  stable_source_key   TEXT NOT NULL,
  created_at          TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z')
);

CREATE UNIQUE INDEX legal_document_source_key_uidx ON legal_document (source_id, stable_source_key);
CREATE INDEX legal_document_official_identifier_idx ON legal_document (official_identifier);
CREATE INDEX legal_document_neutral_citation_idx ON legal_document (neutral_citation);
CREATE INDEX legal_document_employer_abn_idx ON legal_document (employer_abn);

-- ------------------------------------------------------------------------------------------------
-- document_version (PRD §35.2) — immutable
-- ------------------------------------------------------------------------------------------------
CREATE TABLE document_version (
  id                 TEXT PRIMARY KEY,
  document_id        TEXT NOT NULL REFERENCES legal_document (id),
  source_artifact_id TEXT NOT NULL REFERENCES source_artifact (id),
  version_label      TEXT NOT NULL,
  publication_date   TEXT CHECK (publication_date IS NULL OR (length(publication_date) = 10 AND publication_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
  effective_from     TEXT CHECK (effective_from IS NULL OR (length(effective_from) = 10 AND effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
  effective_to       TEXT CHECK (effective_to IS NULL OR (length(effective_to) = 10 AND effective_to GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
  legal_status       TEXT NOT NULL ${enum_check_document_version_legal_status},
  retrieved_at       TEXT NOT NULL CHECK (retrieved_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  content_hash       TEXT NOT NULL CHECK (length(content_hash) = 64 AND content_hash GLOB '[0-9a-f]*'),
  official_url       TEXT NOT NULL,
  created_at         TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z')
);

CREATE UNIQUE INDEX document_version_label_uidx ON document_version (document_id, version_label);
CREATE INDEX document_version_effect_idx ON document_version (document_id, effective_from);

-- ------------------------------------------------------------------------------------------------
-- document_node (PRD §35.2) — immutable
-- ------------------------------------------------------------------------------------------------
CREATE TABLE document_node (
  id              TEXT PRIMARY KEY,
  document_id     TEXT NOT NULL REFERENCES legal_document (id),
  stable_node_key TEXT NOT NULL,
  node_kind       TEXT NOT NULL ${enum_check_document_node_node_kind},
  created_at      TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z')
);

CREATE UNIQUE INDEX document_node_key_uidx ON document_node (document_id, stable_node_key);

-- ------------------------------------------------------------------------------------------------
-- node_version (PRD §35.2) — immutable; FTS source; offsets into `canonical_text` are CHARACTER
-- offsets into the NFC-normalised text, half-open [start, end) (INR contract deliverable 12).
-- ------------------------------------------------------------------------------------------------
CREATE TABLE node_version (
  id                     TEXT PRIMARY KEY,
  document_version_id    TEXT NOT NULL REFERENCES document_version (id),
  document_node_id       TEXT NOT NULL REFERENCES document_node (id),
  parent_node_version_id TEXT REFERENCES node_version (id),
  display_label          TEXT,
  heading                TEXT,
  canonical_text         TEXT NOT NULL,
  ordinal                INTEGER NOT NULL CHECK (ordinal >= 0),
  effective_from         TEXT CHECK (effective_from IS NULL OR (length(effective_from) = 10 AND effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
  effective_to           TEXT CHECK (effective_to IS NULL OR (length(effective_to) = 10 AND effective_to GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
  text_hash              TEXT NOT NULL CHECK (length(text_hash) = 64 AND text_hash GLOB '[0-9a-f]*'),
  created_at             TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z')
);

CREATE INDEX node_version_ordinal_idx ON node_version (document_version_id, ordinal);
CREATE INDEX node_version_effect_idx ON node_version (document_node_id, effective_from);
CREATE INDEX node_version_hierarchy_idx ON node_version (parent_node_version_id);

-- ------------------------------------------------------------------------------------------------
-- node_relation (PRD §35.2) — immutable. `MODEL_SUGGESTED` cannot support definitive status; that
-- rule is enforced by the INR validator and the CRPS-06 gates, not declaratively here, because the
-- confidence vocabulary is not published by packages/contracts yet (Q-CRPS-4 / FND-03).
-- ------------------------------------------------------------------------------------------------
CREATE TABLE node_relation (
  id                       TEXT PRIMARY KEY,
  from_node_version_id     TEXT NOT NULL REFERENCES node_version (id),
  to_node_version_id       TEXT NOT NULL REFERENCES node_version (id),
  relation_type            TEXT NOT NULL ${enum_check_node_relation_relation_type},
  evidence_node_version_id TEXT REFERENCES node_version (id),
  evidence_start           INTEGER CHECK (evidence_start IS NULL OR evidence_start >= 0),
  evidence_end             INTEGER CHECK (evidence_end IS NULL OR evidence_end >= 0),
  derivation               TEXT NOT NULL,
  parser_version           TEXT NOT NULL,
  confidence_state         TEXT NOT NULL ${enum_check_node_relation_confidence_state},
  created_at               TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  CHECK (evidence_start IS NULL OR evidence_end IS NULL OR evidence_end >= evidence_start),
  CHECK ((evidence_start IS NULL) = (evidence_end IS NULL))
);

CREATE INDEX node_relation_from_idx ON node_relation (from_node_version_id, relation_type);
CREATE INDEX node_relation_to_idx ON node_relation (to_node_version_id, relation_type);

-- ------------------------------------------------------------------------------------------------
-- legal_event (PRD §35.2) — immutable; legal status is DERIVED from these rows (PRD §15.2)
-- ------------------------------------------------------------------------------------------------
CREATE TABLE legal_event (
  id                       TEXT PRIMARY KEY,
  document_id              TEXT NOT NULL REFERENCES legal_document (id),
  event_type               TEXT NOT NULL ${enum_check_legal_event_event_type},
  event_date               TEXT CHECK (event_date IS NULL OR (length(event_date) = 10 AND event_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
  effective_date           TEXT CHECK (effective_date IS NULL OR (length(effective_date) = 10 AND effective_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
  evidence_node_version_id TEXT REFERENCES node_version (id),
  target_version_id        TEXT REFERENCES document_version (id),
  metadata_json            TEXT,
  created_at               TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z')
);

CREATE INDEX legal_event_document_type_date_idx ON legal_event (document_id, event_type, event_date);

-- ------------------------------------------------------------------------------------------------
-- search_chunk (PRD §35.3) — REBUILDABLE (PRD §15.3): deliberately no immutability trigger.
-- Offsets are character offsets into the referenced node_version.canonical_text, half-open.
-- ------------------------------------------------------------------------------------------------
CREATE TABLE search_chunk (
  id              TEXT PRIMARY KEY,
  node_version_id TEXT NOT NULL REFERENCES node_version (id),
  chunk_ordinal   INTEGER NOT NULL CHECK (chunk_ordinal >= 0),
  start_offset    INTEGER NOT NULL CHECK (start_offset >= 0),
  end_offset      INTEGER NOT NULL CHECK (end_offset >= 0),
  text_hash       TEXT NOT NULL CHECK (length(text_hash) = 64 AND text_hash GLOB '[0-9a-f]*'),
  -- NULLABLE on purpose: CRPS-01 creates the column and assigns no value (its Non-goals put tier
  -- assignment in CRPS-04). A chunk written by CRPS-03 before the tiering pass runs must be
  -- representable; the generated CHECK still rejects every non-member value.
  index_tier      TEXT ${enum_check_search_chunk_index_tier},
  created_at      TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  CHECK (end_offset >= start_offset)
);

CREATE UNIQUE INDEX search_chunk_node_ordinal_uidx ON search_chunk (node_version_id, chunk_ordinal);
CREATE INDEX search_chunk_tier_idx ON search_chunk (index_tier);

-- ------------------------------------------------------------------------------------------------
-- chunk_embedding (PRD §35.3) — REBUILDABLE; carries EXACTLY the five §35.3 columns.
-- No model artefact, tokenizer, inference-runtime or licence column may ever be added here: those
-- pins live in the corpus/retrieval manifest (CRPS-02 / CRPS-05, sub-PRD D14/D15). Duplicating them
-- would put one PRD §44.3 serial-owned contract inside another, behind a database open that
-- RETR-01/RLSE-07 must verify BEFORE opening. A column-set test asserts this.
-- ------------------------------------------------------------------------------------------------
CREATE TABLE chunk_embedding (
  search_chunk_id TEXT NOT NULL REFERENCES search_chunk (id),
  profile_id      TEXT NOT NULL,
  vector_key      TEXT NOT NULL,
  dimensions      INTEGER NOT NULL CHECK (dimensions > 0),
  quantisation    TEXT NOT NULL,
  PRIMARY KEY (search_chunk_id, profile_id)
);

CREATE INDEX chunk_embedding_profile_idx ON chunk_embedding (profile_id);

-- ------------------------------------------------------------------------------------------------
-- corpus_release (PRD §35.3) — immutable AFTER SIGNING
-- ------------------------------------------------------------------------------------------------
CREATE TABLE corpus_release (
  id                TEXT PRIMARY KEY,
  parent_id         TEXT REFERENCES corpus_release (id),
  status            TEXT NOT NULL ${enum_check_corpus_release_status},
  created_at        TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  manifest_sha256   TEXT CHECK (manifest_sha256 IS NULL OR (length(manifest_sha256) = 64 AND manifest_sha256 GLOB '[0-9a-f]*')),
  signature         TEXT,
  schema_version    TEXT NOT NULL,
  parser_version    TEXT NOT NULL,
  embedding_profile TEXT NOT NULL,
  counts_json       TEXT,
  coverage_json     TEXT,
  evaluation_json   TEXT
);

CREATE INDEX corpus_release_status_idx ON corpus_release (status, created_at);

-- ------------------------------------------------------------------------------------------------
-- corpus_meta (single row) — the version the release manifest publishes and readiness compares
-- (PRD §18.4, §42.1). Beyond §35.3 deliberately: §35 is the MINIMUM dictionary.
-- ------------------------------------------------------------------------------------------------
CREATE TABLE corpus_meta (
  id               TEXT PRIMARY KEY,
  schema_version   TEXT NOT NULL,
  built_at         TEXT NOT NULL CHECK (built_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  release_id       TEXT,
  builder_version  TEXT NOT NULL,
  contract_version TEXT NOT NULL,
  created_at       TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'),
  CHECK (rowid = 1)
);

-- ------------------------------------------------------------------------------------------------
-- Immutability triggers (PRD §35.8 invariant 5)
-- ------------------------------------------------------------------------------------------------
CREATE TRIGGER source_artifact_no_update BEFORE UPDATE ON source_artifact
BEGIN SELECT RAISE(ABORT, 'source_artifact is immutable'); END;
CREATE TRIGGER source_artifact_no_delete BEFORE DELETE ON source_artifact
BEGIN SELECT RAISE(ABORT, 'source_artifact is immutable'); END;

CREATE TRIGGER licence_snapshot_no_update BEFORE UPDATE ON licence_snapshot
BEGIN SELECT RAISE(ABORT, 'licence_snapshot is immutable'); END;
CREATE TRIGGER licence_snapshot_no_delete BEFORE DELETE ON licence_snapshot
BEGIN SELECT RAISE(ABORT, 'licence_snapshot is immutable'); END;

CREATE TRIGGER document_version_no_update BEFORE UPDATE ON document_version
BEGIN SELECT RAISE(ABORT, 'document_version is immutable'); END;
CREATE TRIGGER document_version_no_delete BEFORE DELETE ON document_version
BEGIN SELECT RAISE(ABORT, 'document_version is immutable'); END;

CREATE TRIGGER document_node_no_update BEFORE UPDATE ON document_node
BEGIN SELECT RAISE(ABORT, 'document_node is immutable'); END;
CREATE TRIGGER document_node_no_delete BEFORE DELETE ON document_node
BEGIN SELECT RAISE(ABORT, 'document_node is immutable'); END;

CREATE TRIGGER node_version_no_update BEFORE UPDATE ON node_version
BEGIN SELECT RAISE(ABORT, 'node_version is immutable'); END;
CREATE TRIGGER node_version_no_delete BEFORE DELETE ON node_version
BEGIN SELECT RAISE(ABORT, 'node_version is immutable'); END;

CREATE TRIGGER node_relation_no_update BEFORE UPDATE ON node_relation
BEGIN SELECT RAISE(ABORT, 'node_relation is immutable'); END;
CREATE TRIGGER node_relation_no_delete BEFORE DELETE ON node_relation
BEGIN SELECT RAISE(ABORT, 'node_relation is immutable'); END;

CREATE TRIGGER legal_event_no_update BEFORE UPDATE ON legal_event
BEGIN SELECT RAISE(ABORT, 'legal_event is immutable'); END;
CREATE TRIGGER legal_event_no_delete BEFORE DELETE ON legal_event
BEGIN SELECT RAISE(ABORT, 'legal_event is immutable'); END;

-- "Immutable after signing" (PRD §35.3): an UPDATE that SETS the signature on an unsigned row must
-- succeed, so the guard reads OLD.signature, which is still NULL at that point.
CREATE TRIGGER corpus_release_no_update BEFORE UPDATE ON corpus_release
WHEN OLD.signature IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'corpus_release is immutable after signing'); END;
CREATE TRIGGER corpus_release_no_delete BEFORE DELETE ON corpus_release
WHEN OLD.signature IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'corpus_release is immutable after signing'); END;
