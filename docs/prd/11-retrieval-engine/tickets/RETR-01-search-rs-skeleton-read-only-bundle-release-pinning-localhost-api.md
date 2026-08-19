---
id: RETR-01
title: "search-rs skeleton: read-only bundle, release pinning, localhost API"
module: 11-retrieval-engine
lane: 11-retrieval-engine
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [CRPS-08, FND-32]
blocks: [RETR-02, RETR-05, RETR-09, RLSE-01]
---

# RETR-01 — search-rs skeleton: read-only bundle, release pinning, localhost API

Implements PRD §18.3, §18.4, §39.1, §39.2, §39.4, §42.1 — requirement IDs `SRCH-003`, `SRCH-005`
(search-side halves), epic `E17-INDEX` (read half).
No ADR — the decision is already made in PRD §18.1/§18.2 (a Rust search process), §18.3 (corpus
read-only, no `app.sqlite`) and §39.4 (localhost only); this is build ticket 1 of 10 against it.
Parent sub-PRD: [11-retrieval-engine README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [CRPS-08 — Signed synthetic corpus fixture release](../../04-corpus-contract/tickets/CRPS-08-signed-synthetic-corpus-fixture-release.md) (mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(the bundle layout from PRD §18.4 and the verified fixture from `CRPS-08`) — not a new subsystem
decision.

## Background + basis

**The process boundary is the product's safety boundary.** PRD §18.3: *"`app.sqlite` is mutable and
contains identity, organisations, Research Records, jobs, audit and usage. `corpus.sqlite` is
release-specific, immutable and production read-only. Search can read only corpus files; it MUST NOT
read `app.sqlite`."* PRD §39.1 repeats it as an enforced dependency rule: *"`services/search-rs` has
no credentials/path for `app.sqlite`"* and *"search-rs → corpus bundle only"*. PRD §45.2 gives this
tree exactly one job: *"Read-only corpus loading, exact/lexical/vector/rerank retrieval"*, and
forbids *"Customer/app database access"*.

**Nothing is trusted before verification.** PRD §21: *"Trust application/corpus artifacts only after
signature/hash/compatibility verification."* PRD §18.4 fixes the bundle layout —

```text
corpus-release-{id}/
├── corpus.sqlite
├── tantivy/
├── vectors.usearch
├── embedding-manifest.json
└── release-manifest.json
```

— and requires the manifest to carry *"parent release, schema/parser/chunker/embedding/index
versions, artifact hashes, counts, coverage, quarantine summary, evaluation results, file
hashes/sizes, build time and app/search compatibility."* `CRPS-02` deliverable 10 defines the
canonical verification order (`verify_bundle()`) that this ticket mirrors on the Rust side:
manifest parses and validates → `manifest_sha256` matches canonical bytes → signature verifies
against a known `key_id` → every §18.4 path exists and appears in `files[]` in both directions →
every file hash and byte size matches → `artifacts.*` agree → `versions.schema` equals
`corpus_meta.schema_version` → compatibility ranges satisfy the caller's expectation.

**Release pinning is a correctness rule, not a cache policy.** PRD §18.5 step 4: *"Search receives
only sanitized query, hard filters and pinned release."* PRD §36.2's eligibility predicate ends with
*"AND version and node belong to the pinned CorpusRelease"*. PRD §18.4: *"Old releases cannot be
removed while jobs remain pinned."* A search that silently answers from a newer release than the job
pinned would invalidate every Answer Snapshot invariant in PRD §15.5 and requirement `ANS-004`
(*"Each answer uses one pinned corpus release"*).

**The network position is fixed.** PRD §39.4: `app` → `127.0.0.1:7700` for *"Search/document
retrieval with pinned release"*; `worker` → `127.0.0.1:7700` for *"Evidence retrieval only"*; and
*"Search exposes no public port."* PRD §39.2 gives `search` a **768 MiB** memory limit, "burst up to
2 vCPU", and access to *"read-only active corpus bundle; localhost only"*.

**What this ticket has to load, exactly.** Its blocker `CRPS-08` commits a signed synthetic bundle at
`pipelines/corpus-builder/fixtures/releases/corpus-release-fixture-v1/`, verified with a **development**
keypair whose `key_id` starts with `dev-`, marked `release_kind: SYNTHETIC_FIXTURE`. Carried caveat,
stated in `CRPS-08` deliverable 3 and accepted here: **the fixture's `tantivy/` is a declared
placeholder** (`tantivy/INDEX_STATE.json` = `{"state": "PLACEHOLDER", …}`, `versions.index` is
`null`) and `vectors.usearch` may be a zero-count placeholder. That is exactly why this ticket's
scope is bundle loading, pinning and the API surface — not querying an index. Loading MUST succeed
against a bundle whose index members are declared placeholders, and readiness MUST report which
retrieval capabilities are unavailable rather than pretending they exist.

**Contract-first, because the DAG says so.** `RETR-09` (`packages/retrieval-client`) is `blocked_by`
this ticket and `FND-04` only — it cannot wait for `RETR-08`. Sub-PRD decision **D8** therefore makes
this ticket freeze the *complete* internal API surface (every endpoint, request and response shape,
every error code), with later stages filling implementations behind it. A stage that later needs a
new wire field is a docs PR against this ticket plus `RETR-09`, never a silent client edit.

**Observability is bounded.** PRD §22: *"App, worker and search emit bounded JSON operational logs
with request/job/retrieval/model/answer correlations"* and *"Logs MUST exclude research/evidence
content, PII text, credentials, assertions and provider payloads."* The query string is customer
text; it is never logged.

## Goal

Produce a runnable Rust search service in `services/search-rs/src/main.rs` and
`services/search-rs/src/service/**` that (a) verifies and loads a CorpusRelease bundle exactly as
`CRPS-02`'s `verify_bundle()` does, opens `corpus.sqlite` read-only and holds it behind an explicit
release-pinning registry; (b) serves the **complete, frozen** internal JSON API on a loopback address
only, with health/readiness and node/version/timeline/relation reads working end to end and the
retrieval stages returning a typed `STAGE_NOT_AVAILABLE` until later tickets fill them; and (c)
publishes the versioned retrieval profile and the cross-stage Rust contracts the other nine tickets
build against. Completion is mechanically checkable: `cargo test --workspace` is green, the service
loads the committed `CRPS-08` fixture bundle and refuses a one-byte-mutated copy, a bind to any
non-loopback address fails at startup, and the committed wire-contract examples validate against the
committed JSON Schema.

## Non-goals

- **No lexical index, no query execution over Tantivy** — `RETR-02` (`src/lexical/**`). This ticket
  registers the retrieval endpoint and returns `STAGE_NOT_AVAILABLE`.
- **No exact-identifier parsing** (`RETR-03`), **no §36.2 filter implementation** (`RETR-04`), **no
  dense retrieval or semantic cache** (`RETR-05`), **no fusion or ranking** (`RETR-06`), **no local
  models** (`RETR-07`), **no evidence assembly** (`RETR-08`), **no benchmarks** (`RETR-10`). This
  ticket owns the *types and the ordering*, not the stage bodies.
- **No TypeScript client** — `RETR-09` (`packages/retrieval-client/**`), which is `blocked_by` this
  ticket and consumes the contract frozen here.
- **No public HTTP API, no `/v1/search` route, no §34.2 payload mapping** — `14-search-product`
  (`FIND-01`, `FIND-02`). The API served here is an internal process boundary (PRD §39.4) and is not
  published in `schemas/openapi/**` (`FND-04`, serial-owned).
- **No corpus schema, manifest schema or signing** — `04-corpus-contract` (`CRPS-01`, `CRPS-02`), the
  PRD §44.3 serial-owned pair. This ticket **re-implements the verification steps in Rust and
  consumes the schema**; it never edits either.
- **No systemd unit, cgroup, release archive or promotion tooling** — `18-ops-release` (`RLSE-01`,
  `RLSE-02`, `RLSE-07`). This ticket declares its memory budget and measures it; the host enforces it.
- **No tenant identity, quota, PII detection or model call** — sub-PRD D11; PRD §18.5 step 4, §45.2.
- **No writes of any kind to the bundle.** The service opens every file read-only and never creates,
  renames or deletes anything inside a release directory (PRD §18.4 *"Active data MUST never be
  rebuilt or mutated in place"*).

## File-scope (write-owns)

- `services/search-rs/src/main.rs` — the binary entry point.
- `services/search-rs/src/service/**` — configuration, bundle verification and loading, release
  registry, read-only corpus reader, the frozen wire contract (types + JSON Schema + examples), the
  versioned retrieval profile, the HTTP layer, health/readiness, bounded logging.
- `services/search-rs/tests/service_*.rs` — this ticket's Rust integration tests (sub-PRD D12; file
  names prefixed `service_`).
- Module-shared, append-only (sub-PRD D12, breakdown plan §1.1): `services/search-rs/Cargo.toml`
  (own dependencies and the `[[bin]]` entry for this binary only; regenerate `Cargo.lock` as a build
  artifact, never hand-merge) and `services/search-rs/src/lib.rs` (this ticket creates the crate
  root's module list containing only `pub mod service;`).

Does not touch:

- `services/search-rs/src/lexical/**` — `RETR-02`; `src/exact/**` — `RETR-03`; `src/filters/**` —
  `RETR-04`; `src/dense/**` — `RETR-05`; `src/ranking/**` — `RETR-06`; `src/localmodel/**` —
  `RETR-07`; `src/evidence/**` — `RETR-08`; `benches/**` and `src/bench/**` — `RETR-10`.
- `packages/retrieval-client/**` — `RETR-09`.
- `pipelines/corpus-builder/**`, `pipelines/embeddings/**`, `schemas/corpus-manifest/**` —
  `04-corpus-contract`. These are the PRD §44.3 serial-owned corpus schema and release manifest; no
  other module may write them. This ticket reads the committed fixture bundle and the manifest schema.
- `packages/contracts/**`, `packages/domain/**`, `schemas/{openapi,events}/**` — `00-foundation`.
  Root `Cargo.toml`, `Cargo.lock` pins, `rust-toolchain.toml` — `FND-01`.
- `apps/**` — `03-app-runtime` and the product modules. `infra/**` — `18-ops-release` /
  `03-app-runtime`. `tests/**` — `23-assurance`. `evals/**` — `21-evaluation-600` (breakdown plan R9:
  nothing here reads blind gold). `docs/PRD.md` — frozen (breakdown plan §4).

**Serial-safety analysis.** This is the **first decomposition**: nothing has been merged and no
in-flight ticket contends for these paths (breakdown plan §1 header — `phase: 1`, `append: false`,
`existingFiles: ['.gitkeep']`). The only prior writer of anything under `services/search-rs/` is
`FND-01`, which creates `Cargo.toml`, an empty `src/lib.rs` and the workspace member entry so that
`cargo test --workspace` exits 0 with zero tests (`FND-01` deliverable 5). This ticket is the sole
member of this module's wave 1, so no sibling can be in flight; every sibling is transitively
`blocked_by` it except `RETR-05`'s second blocker `CRPS-05` and `RETR-09`'s second blocker `FND-04`,
both in other modules with disjoint trees. Sibling scopes are disjoint by construction: each later
ticket owns one `src/<area>/**` directory and one `tests/<area>_*.rs` file prefix, and only the two
append-only shared files (`Cargo.toml`, `src/lib.rs`) are ever touched by more than one ticket.

## Deliverables

1. **`src/service/config.rs`** — `SearchConfig` assembled in PRD §39.6's layer order (committed safe
   defaults → environment-specific non-secret config → environment overrides), validated completely at
   startup, rejecting unknown keys with a named error:
   - `bundle_dir: PathBuf` (default `/srv/aer/corpus/active`, PRD §39.3);
   - `bind_addr: SocketAddr` (default `127.0.0.1:7700`, PRD §39.4) — **startup fails** if the address
     is not a loopback address; there is no configuration value that opens a public port;
   - `release_public_keys: Vec<PathBuf>` — verification keys only; no private key is ever read;
   - `memory_budget_bytes: u64` (default 768 MiB, PRD §39.2) — used for reporting and for D10's
     degradation decisions;
   - `retrieval_profile_path: Option<PathBuf>` — override for deliverable 7's compiled-in default;
   - `local_model: LocalModelConfig { embedding_enabled, rerank_enabled, model_path: Option<PathBuf>,
     tokenizer_path: Option<PathBuf>, memory_share_bytes, budget }` — the filesystem-only knobs
     `RETR-07` consumes for the confirmed local runtime (breakdown plan §8 **Q11**: ONNX Runtime,
     CPU-only, through the pinned `ort` crate with pinned Hugging Face `tokenizers` over a
     release-pinned `tokenizer.json`). Local paths only: artefacts reach production through the signed
     corpus/model release path, so there is deliberately **no** key for a model-hub id, a download URL
     or a mirror, and the defaults are stub/disabled so no CI gate needs a model file (PRD §20.3,
     §39.6). These keys say only *where the bytes are*; *what they must be* is pinned by the release
     and verified by `RETR-07` deliverable 7, and no key here may override a pinned value;
   - **no key exists for an application database, a provider endpoint, a model hub, an object store or
     a credential of any kind** (PRD §39.1, §39.6; breakdown plan §8 Q11). A test asserts the config
     type has no such field.
2. **`src/service/bundle.rs`** — `ReleaseBundle::open(dir: &Path, keys: &PublicKeyRing) ->
   Result<ReleaseBundle, Vec<Finding>>`, performing the `CRPS-02` `verify_bundle()` steps **in the
   same order** and **collecting all findings rather than stopping at the first**, each finding
   `{code, severity: Blocking | Warning, message, subject}`:
   1. `release-manifest.json` present, parses, validates against
      `schemas/corpus-manifest/v1/release-manifest.schema.json` for its `manifest_version`;
   2. `manifest_sha256` equals SHA-256 of the canonical bytes (RFC 8785-style: keys sorted by code
      point, no insignificant whitespace, `signature` and `manifest_sha256` excluded) — the Rust
      canonicaliser must be byte-identical to `CRPS-02`'s `canonical_bytes()`, asserted in the test
      plan against the committed fixture manifest;
   3. detached signature verifies against a known `key_id` (default scheme Ed25519, `CRPS-02`
      deliverable 8);
   4. every PRD §18.4 bundle path exists and appears in `files[]`, and `files[]` names no missing
      path (both directions);
   5. every `files[]` entry's `sha256` and `byte_size` match, hashed in streaming blocks;
   6. `artifacts.*` hashes agree with the corresponding `files[]` entries;
   7. `versions.schema` equals `corpus_meta.schema_version` read from `corpus.sqlite`;
   8. `compatibility.search` contains this build's version.
   `open` returns `Err` if any finding is `Blocking`. It never writes to the bundle directory.
   `CRPS-02` deliverable 10 carries a ninth step — pinning completeness over `local_models[]` and
   `runtime` — which is deliberately **not** duplicated here: step 1 already rejects a manifest that
   omits those required members (`CRPS-02` deliverable 1), the stub-pin severity rule is release-side
   (`CRPS-02` deliverable 13, enforced by `CRPS-06`'s candidate gate), and verifying a pin against an
   artefact actually loaded belongs to `RETR-07` deliverable 7 — the only ticket in this module that
   loads a model. This ticket loads none; it exposes the verified manifest so `RETR-05` and `RETR-07`
   can read their members from it rather than from an unverified directory.
3. **Index-state honesty.** `ReleaseBundle` exposes `capabilities() -> Capabilities { lexical: bool,
   dense: bool }` derived from the manifest, not from the presence of a directory: `lexical` is false
   when `versions.index` is `null` or `tantivy/INDEX_STATE.json` declares `PLACEHOLDER`; `dense` is
   false when `embedding-manifest.json` reports `vector_file.count == 0` or a `model_id` beginning
   `stub:`. Basis: `CRPS-08` deliverable 3 — *"A consumer must be able to tell from the manifest alone
   that there is no queryable index"*. A placeholder must never be loaded as an empty-but-real index.
4. **`src/service/corpus.rs`** — the read-only corpus reader. Opens `corpus.sqlite` via the SQLite
   read-only URI (`file:…?mode=ro&immutable=1`) with `PRAGMA query_only=ON`, and exposes prepared
   lookups used by the API and by later stages:
   `document_version(id)`, `node_version(id)`, `nodes_of_version(document_version_id, page)`,
   `node_timeline(node_id)`, `document_timeline(document_id)`, `relations(node_id | document_id)`,
   `licence_assessment_for(document_version_id)`, and `snippet(node_version_id, start, end)`.
   `snippet` slices the stored NFC-normalised `canonical_text` by **character** offsets, half-open
   `[start, end)` (sub-PRD D13; `CRPS-01` deliverable 12), and returns an error rather than a
   truncated slice if the range is out of bounds. Any write attempt through this reader is a
   compile-time impossibility (the connection type exposes no mutating method).
5. **`src/service/release.rs`** — `ReleaseRegistry`:
   - `load(dir) -> ReleaseId` (verify + open, refuse on `Blocking`);
   - `pin(release_id) -> Option<ReleaseHandle>` returning a reference-counted handle;
   - `active() -> ReleaseId`;
   - `unload(release_id) -> Result<(), StillPinned>` — refuses while any handle is outstanding
     (PRD §18.4 *"Old releases cannot be removed while jobs remain pinned"*).
   **Every request must name a `corpus_release_id`.** An unknown or unloaded id returns the typed
   error `RELEASE_NOT_LOADED`; the service never falls back to the active release. Basis: PRD §18.5
   step 4; §36.2 conjunct 5; `ANS-004`.
6. **`src/service/contract/**` — the frozen internal wire contract (sub-PRD D8).** Rust types plus a
   committed JSON Schema (`contract/search-api.v1.schema.json`) and example fixtures
   (`contract/examples/*.json`), covering the complete surface:

   | Endpoint | Purpose | Filled by |
   |---|---|---|
   | `GET /health/live` | process alive (PRD §42.1) | this ticket |
   | `GET /health/ready` | verified bundle loaded, corpus readable, smoke query passes, capabilities reported (PRD §42.1 *"search responds"*) | this ticket |
   | `GET /v1/release` | active + loaded release ids, `versions`, `compatibility`, `capabilities`, retrieval profile id/version | this ticket |
   | `POST /v1/retrieve` | the PRD §17.1 pipeline: classification input, hard filters, pinned release → ranked candidates with `match_reasons` | `RETR-02`…`RETR-06` |
   | `POST /v1/evidence` | bounded, twice-filtered candidate set for Quick/Deep (PRD §36.2 evidence-node counts) | `RETR-08` |
   | `GET /v1/node-versions/{id}` | exact node text, pinpoint, status, interval, offsets (`SRCH-003`) | this ticket |
   | `GET /v1/document-versions/{id}/nodes` | bounded page of nodes | this ticket |
   | `GET /v1/documents/{id}/timeline`, `GET /v1/nodes/{id}/timeline` | version history (`SRCH-005`) | this ticket |
   | `GET /v1/documents/{id}/relations`, `GET /v1/nodes/{id}/relations` | `NodeRelation` rows with `confidence_state` (PRD §9.3) | this ticket |

   Every request carries `corpus_release_id` and an optional caller-supplied `request_id`; every
   response carries `schema_version`, `request_id`, `corpus_release_id`, `retrieval_profile_id` and a
   `warnings: []` array. Every result item identifies `document_version_id` + `node_version_id` +
   character offsets — **never a chunk id** (sub-PRD D15; PRD §15.3). A stage that is not yet
   implemented returns HTTP 503 with `{"code": "STAGE_NOT_AVAILABLE", "stage": "<name>"}`; a stage
   whose bundle capability is absent returns 200 with the stage listed in `warnings` and
   `degraded: true` (sub-PRD D10).
7. **`src/service/profile.rs`** — `RetrievalProfile`, versioned (`profile_id`, `profile_version`),
   compiled in as `contract/profiles/v1-initial.json` and overridable by path. v1 values are the PRD
   §36.2 **"Initial default"** column and the ceilings are enforced at load:

   | Field | v1 default | Hard ceiling |
   |---|---:|---:|
   | `exact_results` | 20 | 50 |
   | `lexical_candidates` | 100 | 200 |
   | `dense_candidates` | 50 | 100 |
   | `fused_candidates` | 60 | 100 |
   | `rerank_candidates` | 30 | 50 |
   | `evidence_nodes_quick` | 12 | 20 |
   | `evidence_nodes_deep_per_subquestion` | 10 | 20 |
   | `evidence_chars_per_call` | 32000 | 60000 |
   | `semantic_cache_chunks` | 10000 | (disk benchmark — `RLSE-11`) |

   `RetrievalProfile::load()` rejects any value above its ceiling with a named error. The profile id
   and version appear in every response (deliverable 6). Changing a default is a docs PR against this
   ticket, not a code edit elsewhere (sub-PRD Q4).
8. **`src/service/http.rs` + `src/main.rs`** — the HTTP layer: JSON only, bounded request body size,
   an explicit per-request deadline derived from PRD §13.2 (default 2 s for `/v1/retrieve`, 1 s for
   node reads) after which the request returns `DEADLINE_EXCEEDED` rather than running unbounded, and
   graceful shutdown. `main.rs` parses arguments (`serve` subcommand), builds the config, loads the
   bundle, logs one structured startup line with release id, versions, capabilities, startup
   milliseconds and peak RSS, and binds. **Binding a non-loopback address is a startup failure**, not
   a warning (PRD §39.4 *"Search exposes no public port"*).
9. **`src/service/log.rs`** — bounded JSON logging: fields limited to `ts`, `level`, `event`,
   `request_id`, `search_execution_id`, `corpus_release_id`, `stage`, `status`, `latency_ms`,
   `candidate_count`, `profile_id`, `error_code`. **Query text, node text, snippets and any evidence
   content are never logged at any level**, and there is no debug flag that turns them on (PRD §22
   *"Logs MUST exclude research/evidence content, PII text, credentials, assertions and provider
   payloads"*; *"Full-content debug logs and crash dumps are disabled by default"*).
10. **`src/service/health.rs`** — `/health/live` (process only) and `/health/ready`, where ready
    requires: a verified bundle loaded, `corpus.sqlite` readable, `versions.schema` compatible with
    this build, and a canonical smoke read succeeding. Readiness returns the capability set and is
    **not ready** on incompatible app/corpus/schema state (PRD §42.1 *"Readiness fails during
    incompatible app/corpus/schema state"*). A missing dense index makes the service **degraded, not
    unready** (sub-PRD D10).
11. **Negative-capability tests** (`tests/service_boundary.rs`) asserting, mechanically:
    no source file or config field references `app.sqlite`, `ephemeral.sqlite` or an application
    database path; the crate's dependency tree contains no HTTP client, cloud SDK or provider client;
    every bind path rejects non-loopback addresses; the corpus connection is opened read-only.
    Basis: PRD §39.1, §39.4, §45.2.
12. **`services/search-rs/README.md`** — one page for consumers and reviewers: how to run against the
    committed `CRPS-08` fixture bundle, the frozen endpoint list, the memory/latency budgets it must
    stay inside, and the statement that this process never reads tenant data.

Ordering constraint: deliverables 1–5 must land before 6–8 (the API serves what the bundle exposes),
and 6 must be complete before `RETR-09` starts — it is the contract that ticket types.

## Acceptance checklist (classified)

- [ ] `[fixture]` The service loads the committed `CRPS-08` bundle
      (`pipelines/corpus-builder/fixtures/releases/corpus-release-fixture-v1/`), reports
      `release_kind: SYNTHETIC_FIXTURE` and a `dev-` key id, and reaches ready. (PRD §18.4; §21;
      breakdown plan A4)
- [ ] `[fixture]` Placeholder honesty: with the fixture's `tantivy/INDEX_STATE.json` = `PLACEHOLDER`
      and `versions.index` = `null`, `capabilities().lexical` is `false`, `/health/ready` reports the
      missing capability, and `/v1/retrieve` returns `degraded: true` with the stage named — never a
      silent empty result set. (`CRPS-08` deliverable 3; sub-PRD D10)
- [ ] `[machine]` Tamper matrix: one-byte mutation of `corpus.sqlite`, of any `files[]` entry, of any
      manifest member, and a signature from an unknown `key_id`, each yields a `Blocking` finding and
      `open()` returns `Err` — one test per mutation site. (PRD §18.4 *"Production verifies signature,
      compatibility, disk, hashes"*; §21)
- [ ] `[machine]` Canonicalisation parity: the Rust canonicaliser reproduces the fixture manifest's
      committed `manifest_sha256` byte-for-byte. (Deliverable 2 step 2; `CRPS-02` deliverable 6)
- [ ] `[machine]` `versions.schema` mismatch with `corpus_meta.schema_version` fails readiness with a
      named error and the service serves no retrieval request. (PRD §42.1)
- [ ] `[machine]` Release pinning: a request naming an unloaded `corpus_release_id` returns
      `RELEASE_NOT_LOADED`; a request naming a loaded **older** release is served from that release's
      text, not the active one; `unload()` refuses while a handle is pinned. (PRD §18.5 step 4; §18.4;
      `ANS-004`; `SRCH-005`)
- [ ] `[machine]` `SRCH-003` offsets: for every node in the fixture, `snippet(node_version_id, s, e)`
      equals the substring of the stored `canonical_text` at character offsets `[s, e)`, including the
      fixture's non-ASCII node; an out-of-range request errors rather than truncating. (PRD §34.2;
      §15.3; sub-PRD D13)
- [ ] `[machine]` `SRCH-005` reads: timeline and relation endpoints return the pinned release's rows
      with no generation involved, and a `MODEL_SUGGESTED` relation is returned with its
      `confidence_state` intact. (PRD §9.3; `SRCH-005`)
- [ ] `[machine]` Boundary: binding `0.0.0.0`, a LAN address or any non-loopback address fails at
      startup; the negative-capability test finds no `app.sqlite` path, no credential field and no
      outbound HTTP client in the dependency tree. (PRD §39.1, §39.4, §45.2)
- [ ] `[machine]` Read-only: an attempted write against the corpus connection is not expressible in
      the reader API, and the bundle directory's file mtimes are unchanged after a full test run.
      (PRD §18.3, §18.4)
- [ ] `[machine]` Profile ceilings: a profile file exceeding any PRD §36.2 hard ceiling is rejected at
      load with a named error; the v1 defaults equal the §36.2 "Initial default" column exactly,
      asserted against a committed transcription fixture. (PRD §36.2; sub-PRD D7)
- [ ] `[machine]` Logging: a run over the fixture produces no log line containing query text, node
      text or a snippet — asserted by seeding a unique canary string through a request and grepping
      the captured log output for it. (PRD §22)
- [ ] `[fixture]` **PRD §13.2 / §39.2 budgets, measured on the fixture bundle**: cold startup to ready
      ≤ **10 s**, resident set after load ≤ **256 MiB** (the fixture is ≤ 20 MiB, so this is headroom
      inside the 768 MiB process limit, not the real-scale figure), node-read p95 ≤ **1 s** over 200
      sequential reads. Numbers, method and machine are recorded in the PR. The real-scale gates are
      `RETR-10` (search boundary) and `RLSE-11` (2 GB host). (PRD §13.2, §39.2, §24.1)
- [ ] `[machine]` Contract freeze: every committed example in `contract/examples/**` validates against
      `contract/search-api.v1.schema.json`, and every endpoint in deliverable 6's table is present in
      the schema — including the ones whose stages return `STAGE_NOT_AVAILABLE`. (Sub-PRD D8)
- [ ] `[machine]` `cargo test --workspace` green (Rust; PRD §45.3).
- [ ] `[machine]` `pnpm test` green (standing item, breakdown plan §1.1).
- [ ] `[machine]` PR states requirement IDs `SRCH-003`, `SRCH-005`; schema/API compatibility impact
      (the frozen internal contract and its consumers `RETR-09`/`FIND-01`/`FIND-02`); tenant/PII/
      security impact ("no tenant data reaches this process"); memory/latency impact (the measured
      numbers above); rollback path; known gaps including the fixture's placeholder index (sub-PRD
      Q-RETR-1). (PRD §45.4)
- [ ] No `[human]` criteria — this ticket is a process boundary and a contract, both verified
      mechanically. Its human-visible payoff (`UAT-SRCH-01`/`UAT-SRCH-03`) is exercised by
      `14-search-product` at Gate 2.
- [ ] `uv run pytest` not applicable — this ticket touches no Python. (`CRPS-08`, the Python producer
      of the fixture it loads, carries that check.)

## Test plan

All steps run offline against the committed fixture bundle; no network, no credentials beyond
`CRPS-02`'s committed development **public** key.

1. `cargo test -p search-rs` (unit) then `cargo test --workspace` (whole workspace). Harness: the Rust
   built-in test harness; integration tests live in `services/search-rs/tests/service_*.rs`. Construction
   pattern to copy: `CRPS-08`'s `tests/fixtures/` layout — tests operate on **the committed bundle**,
   never on a freshly generated one, so a stale artifact fails loudly.
2. Bundle verification: `tests/service_bundle.rs` copies the committed bundle into `tempdir`, then
   applies one mutation per test (flip a byte in `corpus.sqlite`; truncate a file; edit a `files[]`
   hash; edit `counts`; re-sign with an unknown key; delete `vectors.usearch`) and asserts the exact
   finding `code` and `severity` for each. Assert the full finding list is returned, not just the
   first.
3. Canonicalisation parity: assert the Rust canonicaliser's SHA-256 over the fixture manifest equals
   the `manifest_sha256` member committed by `CRPS-08`. If it does not, the divergence is a writeback,
   not a local fix (see Feedback obligation).
4. Pinning: load the fixture twice under two release ids (copy the directory, re-sign is not needed —
   load the same bundle under an alias), assert `RELEASE_NOT_LOADED` for a third id, assert a pinned
   handle blocks `unload`, and assert a request pinned to release A never returns rows from release B.
5. Offsets: property test over every `node_version` row in the fixture — for random `[s, e)` ranges
   inside the text, `snippet` equals the Rust `char_indices`-derived slice; include the fixture's
   non-ASCII node explicitly, and assert `text_hash` reproduces for the full-node range.
6. Boundary: `tests/service_boundary.rs` — a source scan for forbidden identifiers (`app.sqlite`,
   `ephemeral.sqlite`), a `cargo metadata` assertion over the dependency tree for an outbound HTTP or
   cloud client, and a parametrised bind test over `0.0.0.0`, `::`, and a private LAN address.
7. Logging canary: issue a request whose query contains a unique token, capture the log writer output
   in-process, and assert the token is absent from every emitted line.
8. Budgets: `tests/service_budget.rs` measures cold-start-to-ready, post-load RSS and node-read p95
   over 200 iterations; the test asserts the thresholds in the acceptance list and prints the measured
   values so the PR can quote them.
9. Contract: validate every `contract/examples/*.json` against `contract/search-api.v1.schema.json`
   with a JSON Schema validator, and assert the endpoint table's completeness by comparing the schema's
   declared operations to a committed list.
10. Suite green: `cargo test --workspace` and `pnpm test` from the repository root.
11. Reviewer focus: confirm signature verification is genuinely performed and not stubbed behind a
    feature flag; confirm the corpus connection cannot be made writable through any public method;
    confirm there is no configuration path that binds a public interface; confirm placeholder index
    state is read from the manifest rather than inferred from an empty directory; confirm the frozen
    contract covers the endpoints later tickets need, because a wire change after `RETR-09` merges is
    a cross-ticket edit the DAG does not allow.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/11-retrieval-engine/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *The Rust canonicaliser cannot reproduce `CRPS-02`'s `manifest_sha256`* (number formatting,
     Unicode escaping, key ordering) → do **not** relax the check or hash a different byte sequence.
     Record the exact divergence in `docs/prd/11-retrieval-engine/README.md` and raise a ticket change
     against `CRPS-02` (which owns the canonical form) — the manifest is PRD §44.3 serial-owned and
     `04-corpus-contract` is its sole owner.
   - *The fixture's placeholder index makes an endpoint impossible to exercise* → keep the endpoint in
     the frozen contract and return the typed unavailable/degraded response; if a *real* fixture index
     turns out to be required for this ticket, that is a new `RETR-01 blocked_by CRPS-06` edge and must
     be written into `docs/prd/breakdown-plan.md` §5.12 **and** §6.2 first — a late edge here reshapes
     the critical path for `RETR-02`, `RETR-05`, `RETR-09` and `RLSE-01`.
   - *A later stage needs a wire field this contract does not have* → that is a docs PR amending **this
     ticket's deliverable 6 and `RETR-09`**, then `--sync`, then code. Never let a stage ticket edit
     `src/service/contract/**` or `packages/retrieval-client/**` — those scopes belong to this ticket
     and `RETR-09`.
   - *The crate root `src/lib.rs` proves contentious under parallel lanes* (sub-PRD **Q-RETR-2**) → the
     writeback target is `docs/prd/11-retrieval-engine/README.md` D12 plus, if the convention must
     change, `docs/prd/breakdown-plan.md` §1.1. Do not split `services/search-rs` into multiple crates:
     the workspace member list lives in the root `Cargo.toml`, which is `FND-01`'s serial-owned file.
   - *768 MiB cannot hold the process with a real bundle* → this is PRD §39.2's declared trade: reduce
     always-hot vector coverage and cache **before** lexical coverage, record the measurement, and route
     the decision to `RLSE-11` (breakdown plan §8 Q3 — deferred until real-scale measurement; the
     governing coverage policy is already settled, only the numbers are not). Never respond by loading
     the corpus lazily in a way that breaks the read-only or pinning guarantees.
3. **Falsified protocol.** If it turns out that a search process *cannot* be built without an
   application-database path, a public port or a writable corpus — for instance because a required
   library demands it — then PRD §18.3, §39.1 and §39.4 are contradicted by the implementation, and
   breakdown plan decision **A4** plus the whole module boundary are in question. Stop, escalate for
   re-review, and write back to `docs/prd/breakdown-plan.md` §2.1 and §4 plus this sub-PRD before
   improvising. Never ship a search process that can reach tenant data, on any code path, behind any
   flag.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-03 | Initial ticket (`/breakdown-prd`). |
| v1.1 | 2026-08-20 | **This ticket's own crate root breaks a guard it does not own; the repair is `FND-32`, which is added to `blocked_by`.** Writing `services/search-rs/src/lib.rs` — *"the crate root's module list containing only `pub mod service;`"* this ticket's own File-scope authorises, delivered on `ticket/RETR-01` @ `766ad18` as exactly that one line — turns one assertion red: `tools/tests/skeleton.test.mjs` *"keeps every entry file empty"*, via `tools/workspace-assertions.mjs#assertEntryFilesEmpty`, reporting **`services/search-rs/src/lib.rs is not empty`**. `tools/vitest.config.mjs` runs that suite on every branch, so the failure arrives without this branch touching the file that asserts it — and for a Rust crate the guard is categorically unsatisfiable, since a crate root that is the empty string has no modules, no items and no public surface at all. **It is not this ticket's to repair:** `tools/**` is `FND-01`'s area in `00-foundation`'s row (breakdown plan §4; phase-2 plan §3), and this ticket's File-scope declares `services/search-rs/**` and nothing under `tools/`. The repair is **`FND-32`**, and it is **general rather than a carve-out for this branch**: the guard asserts that *every* workspace member's entry file is still the byte-exact bootstrap stub, and on `main` @ `e1e08e4` all **18** entry files under `apps/`, `packages/` and `services/` — 28 counting `tests/`, `pipelines/` and `sdk/` — are still that stub, so it stands in front of every member-implementing ticket in the PRD and not only this one. `AUTC-01` hit the same assertion on the same run for `packages/auth/src/index.ts`. **This ticket's own work is otherwise green:** **142 Rust tests across 11 suites** passing, with the PRD §39.2 budgets measured and met — cold start **36 ms** against a 10 s budget, resident set **14 MiB** against 256 MiB, node read p95 **1 ms** against 1 s — and `pnpm ci:local` **17 of 18** with this guard as the single failing command. Nothing in this ticket's spec, scope, deliverables or acceptance changes — the only edit is the `blocked_by` edge, so `RETR-01` merges after `FND-32` and lands green. |
