---
id: CRPS-01
title: corpus.sqlite schema + intermediate normalised-record contract
module: 04-corpus-contract
lane: 04-corpus-contract
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-03]
blocks: [CRPS-02, CRPS-03, CRPS-04, INGF-01]
---

# CRPS-01 — `corpus.sqlite` schema + intermediate normalised-record contract

Implements PRD §15.1–15.3, §18.3, §35.2, §35.3, §40.7 — requirement IDs `SRCH-003`, `ADM-002`
(corpus-side), epic `E07-CORPUS-SCHEMA`.
No ADR — the decision is already made in PRD §35.2/§35.3 (the corpus data dictionary) and §40.7 (the
adapter emits versioned intermediate records); this is build ticket 1 of 8 against it.
Parent sub-PRD: [04-corpus-contract README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `FND-03` — Canonical enums and opaque ID conventions (module `00-foundation`, breakdown plan §5.1; mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(the PRD §35.2/§35.3 data dictionary and the PRD §40.7 adapter boundary) — not a new subsystem
decision.

## Background + basis

**The corpus database is the product's evidence store, and it is immutable.** PRD §18.3:
*"`app.sqlite` is mutable and contains identity, organisations, Research Records, jobs, audit and
usage. `corpus.sqlite` is release-specific, immutable and production read-only. Search can read only
corpus files; it MUST NOT read `app.sqlite`. Ingestion MUST NOT modify active production corpus
data."*

**The tables and their required columns are already specified.** PRD §35.2 ("Corpus database:
identity and versions") fixes `source`, `authority`, `legal_document`, `document_version`,
`document_node`, `node_version`, `node_relation`, `legal_event`; PRD §35.3 ("Corpus database:
provenance, licensing and releases") fixes `source_artifact`, `licence_snapshot`,
`licence_assessment`, `ingestion_run`, `quarantine_item`, `corpus_release`, `search_chunk`,
`chunk_embedding`. Both tables lists carry required columns and critical constraints — for example
`legal_document` has *"unique `(source_id, stable_source_key)`; exact indexes on identifiers/ABN"*,
`node_version` is *"immutable; hierarchy/ordinal indexes; FTS source"*, `search_chunk` *"cannot cross
unrelated nodes; rebuildable"* and `node_relation` carries *"`MODEL_SUGGESTED` cannot support
definitive status"*. §35.2/§35.3 is a **minimum** dictionary: additional columns/tables are permitted
where a PRD requirement needs them, never fewer.

**Storage conventions are fixed.** PRD §35.1: *"SQLite table and column names use `snake_case`; API
names use `snake_case`. IDs are `TEXT PRIMARY KEY`; timestamps are UTC ISO text; legal dates are
`TEXT` with `YYYY-MM-DD` checks; booleans are `INTEGER CHECK (value IN (0,1))`. Enumerations use
checked text values generated from `packages/contracts`."* The last sentence is why this ticket is
`blocked_by FND-03`, which owns *"Canonical enums and opaque ID conventions"* (breakdown plan §5.1,
§4.1) — this ticket consumes them and never redefines them.

**Immutability is an invariant, not a convention.** PRD §35.8 invariant 5: *"Formal snapshots and
legal corpus versions have no UPDATE/DELETE application path; corrections append replacements."*
PRD §15.3 carves out the rebuildable artifacts: *"SearchChunks and embeddings may be deleted/rebuilt"*
and *"Citations MUST target DocumentVersion + NodeVersion + exact offsets + source snapshot, never a
SearchChunk."*

**Adapters do not write these tables.** PRD §40.7: *"The adapter never writes active corpus tables
directly. It emits versioned intermediate records with source URL, artifact hash and tool version.
Shared framework code performs HTTP safety, hashing, artifact persistence, retry, licensing, metrics,
quarantine and run accounting."* The eight adapter boundaries in the same section are:

```text
discover(cursor, since) → RemoteDescriptor[]
fetch(descriptor, validators) → SourceArtifact
identify(artifact) → StableDocumentIdentity
parse(artifact) → ParsedDocument
normalise(parsed) → DocumentVersion + NodeVersions
extractEvents(normalised) → LegalEvents
extractRelations(normalised) → NodeRelations
validate(candidate, priorState) → ValidationFindings
```

Breakdown plan §2.1 decision **A4** turns that sentence into the module cut: *"The corpus builder
consumes the versioned intermediate normalised-record contract, never adapter code; it is testable
from contract fixtures alone."* That is why `INGF-01` (the adapter interface, module
`05-ingestion-framework`) is `blocked_by` this ticket rather than the reverse, and why the record
schemas must be usable by the five source modules (`06-sources-legislation` …
`10-sources-future`) **without reading corpus-builder code**.

**Temporal and status vocabulary.** PRD §15.2 requires the system to distinguish *"publication time;
effective time; retrieval time; system knowledge/recorded time"* and states *"Legal status MUST be
derived from evidenced LegalEvents. Cached status fields MAY improve performance but are not the
authoritative history."* PRD §6.7 fixes the status taxonomy: `IN_FORCE`, `ENACTED_NOT_IN_FORCE`,
`BILL_NOT_ENACTED`, `DRAFT_OR_CONSULTATION`, `REPEALED`, `SUPERSEDED`, `STATUS_UNCONFIRMED`. PRD §17.2
fixes the index tiers: `TIER_1_FULL_SEMANTIC`, `TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC`,
`TIER_3_METADATA_AND_ON_DEMAND`, `EXCLUDED_LICENSING`, `QUARANTINED_QUALITY`. PRD §11.1 fixes the
licence assessment states: `PERMITTED`, `PERMITTED_WITH_ATTRIBUTION`, `METADATA_AND_LINK_ONLY`,
`UNCLEAR_RESTRICTED`, `PROHIBITED`, `REVIEW_REQUIRED`.

**Carried caveat (accepted, documented, not enforced here):** exact chunk sizing, embedding profile
and retrieval constants are **benchmark-selected** (PRD §1; §45.5 "Benchmark-selected
configuration"). This ticket fixes the *columns* that record them (`search_chunk.text_hash`,
`chunk_embedding.profile_id/dimensions/quantisation`), not their values — those belong to `CRPS-03`,
`CRPS-05` and plan §8 **Q2** (status: benchmark-selected) / sub-PRD Q-CRPS-1. Plan §8 **Q11** is a
confirmed architecture decision that settles the *runtime* which executes a model (Microsoft ONNX
Runtime, CPU-only, owned by `RETR-07`); it does not settle Q2, which selects the models that execute
inside it. Neither is a value this ticket may write.

**Model, tokenizer and runtime pinning is manifest scope, not corpus DDL.** Confirmed plan §8 Q11
requires models, tokenizers and runtime metadata to be pinned in the corpus/retrieval manifest, and
every model artefact to carry an immutable revision identifier, hash, dimensions, normalisation,
truncation and licence information. Those fields belong to `schemas/corpus-manifest/**` (`CRPS-02`,
which owns the schema) and to the embedding-manifest instance (`CRPS-05`) — sub-PRD **D14**. They do
**not** belong in `chunk_embedding` or any other corpus table: `chunk_embedding` keeps exactly the PRD
§35.3 columns (`search_chunk_id`, `profile_id`, `vector_key`, `dimensions`, `quantisation`). Adding
runtime, artefact-hash or licence columns here would duplicate one PRD §44.3 serial-owned contract
inside another, and would place the pins behind a database open that `RETR-01`/`RLSE-07` must verify
*before* opening. If a consumer needs a value pinned, it is a `CRPS-02` ticket change, not a column.

**Carried caveat:** `packages/contracts` may not yet publish a Python-consumable enum/ID export
(sub-PRD Q-CRPS-4). If it does not, this ticket raises the gap; it does not hand-copy enum values and
it does not write into `packages/contracts` (owned by `00-foundation`).

## Goal

Produce (a) the complete `corpus.sqlite` DDL for every table in PRD §35.2 and §35.3, with enum
`CHECK` lists and ID conventions derived from `packages/contracts`, immutability triggers for the
formal-record tables, and a versioned schema-meta row that the manifest and readiness checks can
compare against; and (b) the versioned **intermediate normalised-record (INR) contract** — a
language-neutral JSON Schema set plus a newline-delimited-JSON serialisation and a Python
reader/writer/validator — covering all eight PRD §40.7 adapter outputs, with committed conformance
fixtures. Completion is mechanically checkable: `uv run pytest pipelines/corpus-builder/tests/schema
pipelines/corpus-builder/tests/contracts` is green, a fresh empty database created by the DDL passes
the immutability and constraint suites, and every committed conformance fixture validates against the
JSON Schemas using a generic JSON-Schema validator with no corpus-builder import.

## Non-goals

- **No adapter interface, fetcher, artifact store, licence registry, quarantine engine or run
  accounting** — `INGF-01`…`INGF-05` (`05-ingestion-framework`). This ticket defines the *records*
  those components move; `INGF-01` binds them into the callable eight-boundary interface.
- **No adapter, no HTTP request to any official source** — modules `06-sources-legislation` …
  `10-sources-future`. Per A4 this ticket is testable from fixtures alone.
- **No chunking algorithm** (`CRPS-03`) and **no tier assignment policy** (`CRPS-04`). This ticket
  creates the `search_chunk`/`chunk_embedding` tables and the `index_tier` column; it assigns no
  values.
- **No release manifest schema, signing or verification** — `CRPS-02` (`schemas/corpus-manifest/**`).
  This ticket creates the `corpus_release` *table*; the manifest JSON contract is `CRPS-02`'s,
  including the model-artefact, tokenizer and runtime pinning fields that confirmed plan §8 Q11
  requires (sub-PRD D14/D15).
- **No local model, tokenizer or inference runtime of any kind** — `11-retrieval-engine` (`RETR-07`,
  plan §8 Q11) at query time and `CRPS-05` at build time. Nothing in this ticket loads, describes or
  version-pins a model.
- **No build orchestration, validation gates or publish** — `CRPS-06`/`CRPS-07`.
- **No app-database work of any kind** — `01-app-data` owns `packages/database/**`; PRD §45.2 states
  `packages/database` "Must not own: Corpus schema or UI", and PRD §18.3 keeps the two databases
  separate.
- **No changes to `packages/contracts`** — `00-foundation` (`FND-03`) is the serial owner of canonical
  enums and opaque ID conventions (breakdown plan §4.1). A missing enum or ID prefix is a writeback,
  not a local addition.
- **No full-text-search index creation.** PRD §35.2 marks `node_version` as the "FTS source"; the
  lexical index is a bundle artifact built later (`CRPS-06`, and read by `RETR-02`). A SQLite FTS
  virtual table is explicitly out of scope for this ticket.

## File-scope (write-owns)

- `pipelines/corpus-builder/schema/**` — corpus DDL and the versioned INR JSON Schema directory.
- `pipelines/corpus-builder/src/contracts/**` — Python record models, reader/writer, validator,
  version constants.
- `pipelines/corpus-builder/tests/schema/**`, `pipelines/corpus-builder/tests/contracts/**` — this
  ticket's unit/integration tests and conformance fixtures (breakdown plan §1.1: unit/integration
  tests live inside the owning package).
- Module-shared, append-only (breakdown plan §1.1): `pipelines/corpus-builder/pyproject.toml` —
  append declared dependencies only; regenerate the root `uv.lock` as a build artifact
  (`uv lock`), never hand-merge it.

Does not touch:

- `schemas/corpus-manifest/**`, `pipelines/corpus-builder/src/manifest/**` — `CRPS-02`.
- `pipelines/corpus-builder/src/chunking/**` — `CRPS-03`. `pipelines/corpus-builder/src/tiering/**` — `CRPS-04`.
- `pipelines/embeddings/**` — `CRPS-05`. `pipelines/corpus-builder/src/{build,validation}/**` — `CRPS-06`.
  `pipelines/corpus-builder/src/publish/**` — `CRPS-07`. `pipelines/corpus-builder/fixtures/**` — `CRPS-08`.
- `packages/contracts/**`, `packages/domain/**`, `schemas/{openapi,events}/**` — `00-foundation`.
- `packages/database/**` — `01-app-data`. `pipelines/ingestion/**` — `05-ingestion-framework`.
  `pipelines/adapters/**` — modules 06–10. `services/search-rs/**` — `11-retrieval-engine`.
  `pipelines/evaluation/**`, `evals/**`, `schemas/evaluation/**` — `21-evaluation-600`.
  `infra/**` — `03-app-runtime` (compose) / `18-ops-release` (everything else).
  `tests/**` — `23-assurance`. `docs/PRD.md` — frozen (breakdown plan §4).

**Serial-safety analysis.** This is the **first decomposition**: nothing has been merged and no
in-flight ticket contends for these paths (breakdown plan §1 header — `phase: 1`, `existingFiles:
['.gitkeep']`; the repository contains no `pipelines/` tree yet). The last (only) writer of
`pipelines/corpus-builder/pyproject.toml` before this ticket is `FND-01`, which creates it empty as a
workspace-member skeleton. Sibling tickets in this module write disjoint sub-trees: `CRPS-02`
(`src/manifest/**` + `schemas/corpus-manifest/**`), `CRPS-03` (`src/chunking/**`), `CRPS-04`
(`src/tiering/**`), `CRPS-05` (`pipelines/embeddings/**`), `CRPS-06` (`src/{build,validation}/**`),
`CRPS-07` (`src/publish/**`), `CRPS-08` (`fixtures/**`) — no overlap with `schema/**` or
`src/contracts/**`, and in any case `CRPS-02/03/04` cannot start until this ticket lands.

**PRD §44.3 serial-owned artifact.** `pipelines/corpus-builder/schema/**` is half of the serial-owned
"corpus schema + release manifest" pair (PRD §44.3: *"Serial owners are required for root lockfiles,
canonical enums, OpenAPI root, app migration order, corpus schema/manifest, active release/promotion
files and production Compose/deployment configuration."*; breakdown plan §4.1). **`04-corpus-contract`
is the sole owner; no other module may write it.** A module needing a corpus column raises a ticket
here and takes a `blocked_by` edge on it.

## Deliverables

### A. Corpus schema — `pipelines/corpus-builder/schema/`

1. `schema/corpus/001_corpus_schema.sql` — the complete DDL for a corpus database, containing every
   table and every required column from PRD §35.2 and §35.3, in this creation order (FK-safe):
   `authority`, `source`, `licence_snapshot`, `licence_assessment`, `source_artifact`,
   `ingestion_run`, `quarantine_item`, `legal_document`, `document_version`, `document_node`,
   `node_version`, `node_relation`, `legal_event`, `search_chunk`, `chunk_embedding`,
   `corpus_release`, `corpus_meta`.
2. Conventions applied to every table (PRD §35.1): `snake_case` names; `id TEXT PRIMARY KEY`;
   timestamps `TEXT` UTC ISO-8601 with a `Z` suffix; legal dates `TEXT CHECK (col IS NULL OR col GLOB
   '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')`; booleans `INTEGER CHECK (col IN (0,1))`;
   `created_at` on every table.
3. Required uniqueness/indexes, at minimum: `source` unique `(source_group_id, adapter_key)`;
   `legal_document` unique `(source_id, stable_source_key)` plus indexes on `official_identifier`,
   `neutral_citation`, `employer_abn`; `document_node` unique `(document_id, stable_node_key)`;
   `node_version` indexes on `(document_version_id, ordinal)` and `(document_node_id, effective_from)`;
   `legal_event` index on `(document_id, event_type, event_date)`; `search_chunk` unique
   `(node_version_id, chunk_ordinal)`; `chunk_embedding` primary key `(search_chunk_id, profile_id)`.
4. `schema/corpus/002_enums.sql.j2` (or equivalent generator input) plus
   `src/contracts/enums.py::render_enum_checks()` — every enumerated column's `CHECK (col IN (…))`
   list is **generated** from the `packages/contracts` export at build time and written into the
   emitted DDL. Hand-written enum literals in the SQL are a defect. Enumerated columns and their
   sources: `document_version.legal_status` and `node_version`-adjacent status (PRD §6.7),
   `search_chunk.index_tier` (PRD §17.2), `licence_assessment.status` (PRD §11.1),
   `node_relation.relation_type`/`confidence_state` and `legal_event.event_type` (PRD §15.1),
   `source.coverage_status`/`freshness_status` (PRD §7, §12.1), `quarantine_item.status`,
   `corpus_release.status`.
5. Immutability triggers (PRD §35.8 invariant 5) on `source_artifact`, `licence_snapshot`,
   `document_version`, `document_node`, `node_version`, `node_relation`, `legal_event`: `BEFORE
   UPDATE` and `BEFORE DELETE` triggers that `RAISE(ABORT, '<table> is immutable')`.
   `corpus_release` gets the same triggers guarded on `signature IS NOT NULL` ("immutable after
   signing", PRD §35.3). `search_chunk` and `chunk_embedding` are **excluded** — PRD §15.3 requires
   them to be deletable/rebuildable.
6. `corpus_meta` — single-row table (`CHECK (rowid = 1)`) with `schema_version TEXT NOT NULL`,
   `built_at TEXT NOT NULL`, `release_id TEXT`, `builder_version TEXT NOT NULL`,
   `contract_version TEXT NOT NULL`. `schema_version` is the value the release manifest publishes and
   readiness compares (PRD §18.4 "schema/parser/chunker/embedding/index versions"; §42.1 "Readiness
   fails during incompatible app/corpus/schema state"). Basis for adding a table beyond §35.3: §35 is
   the *minimum* dictionary and §18.4 requires the version to exist somewhere in the bundle.
7. `src/contracts/schema.py` exporting, at minimum:
   - `SCHEMA_VERSION: str` — semver; bumped by any DDL change.
   - `create_corpus_database(path: str | os.PathLike, *, release_id: str | None = None) -> None` —
     creates a new database, applies the DDL with generated enum checks, writes `corpus_meta`.
   - `open_corpus_database(path, *, read_only: bool = True) -> sqlite3.Connection` — opens with
     `PRAGMA foreign_keys=ON`; when `read_only`, opens via the SQLite read-only URI (PRD §18.3
     "production read-only").
   - `schema_fingerprint(conn) -> str` — stable hash over `sqlite_schema.sql`, so drift is detectable
     from a built bundle.
8. IDs follow the `FND-03` opaque-ID convention. This ticket does **not** add corpus prefixes to
   `packages/contracts`; if the convention has no corpus-entity prefixes yet, raise the writeback in
   the Feedback obligation section and use the convention's generic form meanwhile.

### B. Intermediate normalised-record (INR) contract — `pipelines/corpus-builder/schema/intermediate/v1/`

9. **Envelope** — `schema/intermediate/v1/envelope.schema.json`. Every emitted record is one JSON
   object with exactly these top-level members (all required unless marked):

   | Member | Type | Meaning |
   |---|---|---|
   | `contract_version` | `string` semver | INR contract version, e.g. `"1.0.0"` |
   | `record_type` | `string` enum | one of the nine types in item 10 |
   | `adapter_key` | `string` | the adapter that emitted it (matches `source.adapter_key`) |
   | `source_id` | `string` | the corpus `source.id` the records belong to |
   | `ingestion_run_id` | `string` | the run this batch belongs to (PRD §35.3 `ingestion_run`) |
   | `emitted_at` | `string` UTC ISO-8601 | emission time |
   | `tool_versions` | `object` | `{adapter, framework, parser, ocr?}` — all strings (PRD §40.7 "tool version") |
   | `provenance` | `object` | `{official_url, artifact_sha256, retrieved_at}` (PRD §40.7 "source URL, artifact hash") |
   | `payload` | `object` | the record-type-specific body, item 10 |

   `additionalProperties: false` at the envelope level. The three provenance members are **required
   on every record type** — that is the literal PRD §40.7 requirement.

10. **Record types** — one JSON Schema file each under `schema/intermediate/v1/`, payload members
    named exactly as the corpus columns they feed (PRD §35.2/§35.3), so the mapping is inspectable:

    | `record_type` | File | Payload members (required unless `?`) |
    |---|---|---|
    | `remote_descriptor` | `remote-descriptor.schema.json` | `descriptor_key`, `official_url`, `discovered_at`, `etag?`, `last_modified?`, `content_type?`, `document_hint?`, `cursor?` |
    | `source_artifact` | `source-artifact.schema.json` | `artifact_key`, `official_url`, `retrieved_at`, `http_status`, `etag?`, `last_modified?`, `content_type`, `byte_length`, `sha256`, `r2_key?`, `licence_snapshot_key` |
    | `document_identity` | `document-identity.schema.json` | `stable_source_key`, `document_type`, `canonical_title`, `jurisdiction`, `authority_key`, `official_identifier?`, `neutral_citation?`, `employer_abn?` |
    | `document_version` | `document-version.schema.json` | `stable_source_key`, `version_label`, `publication_date?`, `effective_from`, `effective_to?`, `legal_status`, `retrieved_at`, `content_hash`, `official_url`, `artifact_key` |
    | `document_node` | `document-node.schema.json` | `stable_source_key`, `stable_node_key`, `node_kind` |
    | `node_version` | `node-version.schema.json` | `stable_source_key`, `version_label`, `stable_node_key`, `parent_stable_node_key?`, `display_label?`, `heading?`, `canonical_text`, `ordinal`, `effective_from`, `effective_to?`, `text_hash` |
    | `legal_event` | `legal-event.schema.json` | `stable_source_key`, `event_type`, `event_date`, `effective_date?`, `evidence_ref?`, `target_version_label?`, `metadata_json?` |
    | `node_relation` | `node-relation.schema.json` | `from_ref`, `to_ref`, `relation_type`, `evidence_ref?`, `evidence_start?`, `evidence_end?`, `derivation`, `parser_version`, `confidence_state` |
    | `validation_finding` | `validation-finding.schema.json` | `finding_code`, `severity`, `subject_ref?`, `details_json?` |

11. **Reference discipline (load-bearing).** A record never carries a corpus primary key. Cross-record
    references use the natural-key object `NodeRef = {stable_source_key, version_label,
    stable_node_key}` and `VersionRef = {stable_source_key, version_label}`, always implicitly scoped
    by the envelope's `source_id`. Defined once in `schema/intermediate/v1/refs.schema.json` and
    `$ref`-ed. Rationale: PRD §40.7 — the adapter never writes corpus tables, so it cannot know corpus
    IDs; the builder resolves natural keys to IDs and enforces PRD §35.2's `(source_id,
    stable_source_key)` / `(document_id, stable_node_key)` uniqueness.
12. **Offsets and text (load-bearing).** `canonical_text` is Unicode-NFC-normalised **once**, at
    `normalise()`. `text_hash` is the lowercase hex SHA-256 of the UTF-8 bytes of the exact stored
    `canonical_text`. Every offset in the contract (`evidence_start`, `evidence_end`, and later
    `search_chunk.start_offset/end_offset`) is a **character** offset into that normalised
    `canonical_text`, half-open `[start, end)`. Rationale: PRD §15.3 "Citations MUST target
    DocumentVersion + NodeVersion + exact offsets"; requirement `SRCH-003` "Snippet offsets reproduce
    exact NodeVersion text" must hold across a Python builder, a Rust searcher and a TypeScript
    validator.
13. **Enumerated payload values** reuse the `packages/contracts` enums: `legal_status` (PRD §6.7),
    `document_type`, `node_kind`, `relation_type`, `confidence_state`, `event_type`. `severity` on
    `validation_finding` is `BLOCKING | ANOMALY | INFO`, where `BLOCKING` is reserved for the classes
    PRD §40.9 says block release (*"Critical identity/time/citation and mandatory-source failures block
    release; percentage thresholds are refined per source after baseline measurement"*).
    `node_relation.confidence_state` carries the §35.2 rule in the schema description: *"`MODEL_SUGGESTED`
    cannot support definitive status."*
14. **Serialisation.** One newline-delimited-JSON file per `record_type` per run, UTF-8, LF endings,
    one record per line, object keys sorted, no trailing whitespace — so a byte-diff of two runs is
    meaningful. Directory layout emitted by an adapter run:
    `<out>/<source_id>/<ingestion_run_id>/<record_type>.jsonl` plus `records-manifest.json` listing
    `{record_type, path, sha256, count}` for each file and repeating `contract_version`.
15. **Python contract package** — `src/contracts/` exporting:
    - `CONTRACT_VERSION: str` and `SCHEMA_DIR: Path`.
    - Frozen record dataclasses (or pydantic models) `Envelope`, `RemoteDescriptor`, `SourceArtifact`,
      `DocumentIdentity`, `DocumentVersion`, `DocumentNode`, `NodeVersion`, `LegalEvent`,
      `NodeRelation`, `ValidationFinding`, `NodeRef`, `VersionRef`.
    - `validate_record(obj: Mapping) -> list[ContractViolation]` — JSON-Schema validation plus the
      cross-field rules of items 11–13; returns findings, never raises on invalid data.
    - `read_records(path: Path) -> Iterator[Envelope]` and
      `write_records(path: Path, records: Iterable[Envelope]) -> RecordFileStat` (writes item 14's
      exact byte format and returns `{count, sha256}`).
    - `read_run(dir: Path) -> RunRecords` — validates `records-manifest.json` hashes before yielding.
16. **Versioning rule.** `contract_version` is semver. Adding an optional member is a **minor** bump
    in place. Removing/renaming a member, tightening a type, or changing a documented meaning is a
    **major** bump and requires a new `schema/intermediate/v<N>/` directory; the reader accepts the
    current major and the immediately previous major. Any major bump is a writeback (see Feedback
    obligation) because five source modules bind to this contract. Basis: PRD §45.4 *"Changes to an
    immutable/public contract include regenerated bindings and compatibility tests."*
17. **Conformance fixtures** — `tests/contracts/fixtures/valid/**` (at least one complete, coherent
    run covering all nine record types, two document versions of one document at different
    `effective_from`, and one node relation with `confidence_state: MODEL_SUGGESTED`) and
    `tests/contracts/fixtures/invalid/**` (at least: missing `provenance.artifact_sha256`; corpus
    primary key used in place of a natural key; byte-offset that exceeds `len(canonical_text)`;
    `text_hash` mismatch; unknown `legal_status`). Each invalid fixture is paired with the expected
    `ContractViolation` code. These fixtures are the artifact `INGF-01` and the source modules test
    against.
18. **`README.md` inside `schema/intermediate/v1/`** — a one-page contract description sufficient for
    a source-module author who has never opened `pipelines/corpus-builder/src/**`: envelope, the nine
    payloads, reference discipline, offset rule, file layout, versioning. Basis: A4 and this ticket's
    `blocks` list (`INGF-01`).

## Acceptance checklist (classified)

- [ ] `[machine]` `create_corpus_database()` produces a database whose `sqlite_schema` contains every
      table and every required column named in PRD §35.2 and §35.3 — asserted from a table-driven test
      listing them explicitly, not by reading the DDL back. (`E07-CORPUS-SCHEMA`)
- [ ] `[machine]` Every enumerated column's `CHECK` list equals the corresponding `packages/contracts`
      export, asserted by a drift test that fails if either side changes. (PRD §35.1; decision D4)
- [ ] `[machine]` `UPDATE` and `DELETE` on `source_artifact`, `licence_snapshot`, `document_version`,
      `document_node`, `node_version`, `node_relation`, `legal_event` raise; `UPDATE`/`DELETE` on
      `search_chunk` and `chunk_embedding` succeed. (PRD §35.8 invariant 5; §15.3)
- [ ] `[machine]` `UPDATE`/`DELETE` on a `corpus_release` row with a non-null `signature` raises;
      the same operations on an unsigned row succeed. (PRD §35.3 "immutable after signing")
- [ ] `[machine]` Uniqueness holds: duplicate `(source_id, stable_source_key)`, duplicate
      `(document_id, stable_node_key)`, duplicate `(node_version_id, chunk_ordinal)` each raise.
      (PRD §35.2, §35.3)
- [ ] `[machine]` Legal-date columns reject `2026-8-3`, `03/08/2026` and `2026-08-03T00:00:00Z`;
      boolean columns reject `2`. (PRD §35.1)
- [ ] `[machine]` `open_corpus_database(read_only=True)` cannot write: an `INSERT` raises
      `sqlite3.OperationalError`. (PRD §18.3 "production read-only")
- [ ] `[machine]` `corpus_meta` accepts exactly one row and reports `SCHEMA_VERSION`;
      `schema_fingerprint()` is stable across two fresh creations and changes when the DDL changes.
      (PRD §18.4, §42.1)
- [ ] `[machine]` `chunk_embedding` carries exactly the PRD §35.3 columns and **no** model-artefact,
      tokenizer, licence or runtime column — asserted by an explicit column-set test, so the confirmed
      plan §8 Q11 pins stay in the manifest (`CRPS-02`/`CRPS-05`, sub-PRD D14) and are never duplicated
      into a second serial-owned artifact. (PRD §35.3; §44.3)
- [ ] `[fixture]` Every fixture under `tests/contracts/fixtures/valid/**` validates against the
      `schema/intermediate/v1/**` JSON Schemas using a **generic** JSON-Schema validator invoked with
      no import of `pipelines.corpus_builder` application code — proving a source module can conform
      without reading builder code. (Breakdown plan A4)
- [ ] `[fixture]` Every fixture under `tests/contracts/fixtures/invalid/**` produces exactly its
      expected `ContractViolation` code from `validate_record()` — including the corpus-primary-key
      misuse and the `text_hash` mismatch. (Deliverables 11–13)
- [ ] `[machine]` Round-trip determinism: `write_records(read_records(f))` reproduces the input file
      byte-for-byte, and `records-manifest.json` hashes match. (Deliverable 14)
- [ ] `[machine]` Offset rule: for every `node_version` fixture, `canonical_text` is NFC-normalised,
      `text_hash` equals SHA-256 of its UTF-8 bytes, and every `evidence_start/evidence_end` pair is a
      valid half-open character range. (PRD §15.3; `SRCH-003`)
- [ ] `[machine]` Contract-version guard: a record whose `contract_version` major differs from
      `CONTRACT_VERSION` by more than one is rejected with a dedicated violation code. (Deliverable 16)
- [ ] `[machine]` `uv run pytest` green (this ticket is Python; PRD §45.3).
- [ ] `[machine]` `pnpm test` green (standing item, breakdown plan §1.1).
- [ ] `[machine]` PR states requirement IDs `SRCH-003`, `ADM-002`; schema/contract compatibility
      impact ("new contract, no prior version"); source/licence impact ("none — no source is fetched");
      rollback path; known gaps. (PRD §45.4; breakdown plan §1.1)
- [ ] No `[human]` criteria — this ticket produces a schema and a data contract with no user-visible
      surface; the human acceptance for the corpus surface is `UAT-OPS-01`, exercised in `CRPS-06`.
- [ ] `cargo test --workspace` not applicable — this ticket touches no Rust.

## Test plan

Everything below runs offline with no network and no credentials.

1. `uv sync --frozen` then `uv run pytest pipelines/corpus-builder/tests/schema -q`. Harness: pytest
   with a `tmp_path` fixture creating a fresh database per test via `create_corpus_database()`.
   Asserted: the table/column table-driven list (PRD §35.2/§35.3), uniqueness, date/boolean CHECKs,
   immutability triggers (`pytest.raises(sqlite3.IntegrityError)` / `OperationalError` with the
   trigger message), read-only open, `corpus_meta` single-row constraint, `schema_fingerprint()`
   stability, and the `chunk_embedding` column-set assertion.
2. `uv run pytest pipelines/corpus-builder/tests/contracts -q`. Asserted: JSON-Schema validation of
   every `fixtures/valid/**` record; expected violation codes for every `fixtures/invalid/**` record;
   byte-exact round-trip; `records-manifest.json` hash agreement; the contract-version guard.
3. **Independence check** (the one that proves A4): run
   `uv run python -m pytest pipelines/corpus-builder/tests/contracts/test_schema_only.py -q`. That
   module must import only `json`, `pathlib` and a JSON-Schema library — the test asserts
   `"pipelines.corpus_builder" not in sys.modules` after validating all valid fixtures.
4. Enum drift: `uv run pytest pipelines/corpus-builder/tests/schema/test_enum_drift.py -q` reads the
   `packages/contracts` export and compares it to the generated `CHECK` lists in the emitted DDL. If
   the export is missing, this test must **fail with a message naming Q-CRPS-4 and `FND-03`** — it may
   not be skipped silently.
5. Suite green: `uv run pytest` and `pnpm test` from the repository root.
6. Reviewer focus (security/concurrency-sensitive, per the pipeline's reviewer brief): confirm the
   read-only open path really cannot write; confirm no trigger can be bypassed by `INSERT OR REPLACE`
   (test it); confirm no fixture contains anything resembling customer data (PRD §40.8 item 4, §19.2);
   confirm the DDL contains no hand-written enum literal; confirm no model, tokenizer, runtime or
   licence pin has been added to a corpus table (that is manifest scope — sub-PRD D14).

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where the module's shared context changes,
   `docs/prd/04-corpus-contract/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *`packages/contracts` publishes no Python-consumable enum/ID export, or has no corpus-entity ID
     prefixes* (sub-PRD Q-CRPS-4) → do **not** hand-copy enums and do **not** write into
     `packages/contracts`. Record the gap in `docs/prd/04-corpus-contract/README.md` (Q-CRPS-4) and
     raise a ticket-change request against `FND-03` in `docs/prd/00-foundation/tickets/`; if the fix
     needs a new edge (`CRPS-01 blocked_by` a new `FND-*` ticket), that edge goes into
     `docs/prd/breakdown-plan.md` §5.1/§6.2 first — a dangling or missing edge breaks `dag-scan.mjs`.
   - *A PRD §35.2/§35.3 column cannot be expressed in SQLite as specified* (e.g. a required
     non-overlap constraint on `document_version` effect intervals) → the constraint moves to a
     validation gate, and that reallocation is written into
     `docs/prd/04-corpus-contract/README.md` (Decisions) **and** flagged in `CRPS-06`'s ticket before
     any code, because the gate is `CRPS-06`'s file-scope, not this ticket's.
   - *A consumer asks for a corpus column to record a local model artefact, tokenizer, licence or
     inference-runtime value* (confirmed plan §8 Q11 pinning) → refuse: that is manifest scope
     (sub-PRD **D14**). Raise a ticket-change request against **`CRPS-02`** (which owns
     `schemas/corpus-manifest/**`) and, if the value describes the executed embedding profile, against
     `CRPS-05`. Never add the column here, and never let the same value exist in both serial-owned
     artifacts.
   - *The INR contract needs a tenth record type, or a source module cannot express its data in the
     nine* → this is a contract change binding five modules: update **this ticket's** deliverable 10,
     bump `contract_version` minor/major per deliverable 16, and note it in
     `docs/prd/04-corpus-contract/README.md`. Never let a source module invent a private record type.
   - *A source module needs corpus primary keys inside a record* (violating deliverable 11) → that
     contradicts PRD §40.7 and breakdown plan A4. Escalate per layer 3; do not add an ID field.
   - *Character offsets prove unworkable across the Python/Rust/TypeScript boundary* → this changes
     `SRCH-003` behaviour and `packages/citations`' validator (`12-evidence-safety`). Write an ADR
     `docs/adr/NNNN-corpus-text-offset-units.md` (breakdown plan A9: the creating ticket claims the
     file) and update this ticket plus `docs/prd/04-corpus-contract/README.md` before changing the
     schema.
3. **Falsified protocol.** If PRD §40.7's "the adapter never writes active corpus tables directly" or
   breakdown plan A4 turns out to be unimplementable — for instance if the builder genuinely cannot
   resolve natural keys without adapter code — that overturns the module cut itself (04 would become
   mutually dependent with 05–10). Stop, escalate for re-review, and write back to
   `docs/prd/breakdown-plan.md` §2.1 (A4) and §6.1/§6.2 before writing any code that couples the two.
   Never resolve it silently inside this ticket.
