# 04-corpus-contract — sub-PRD

> Module sub-PRD. Authored from `docs/prd/breakdown-plan.md` §5.5 (wave B). The **tickets** under
> `tickets/` are the executable source of truth; this file is the module's shared context. On any
> disagreement between a ticket and this file, the ticket wins (CLAUDE.md, issue #53).

| Field | Value |
|---|---|
| Module | `04-corpus-contract` |
| Lane | `04-corpus-contract` |
| Ticket prefix | `CRPS` |
| Tickets | 8 (`CRPS-01` … `CRPS-08`) |
| PRD epics | `E07-CORPUS-SCHEMA` (owner), `E17-INDEX` (build half; the read half is `11-retrieval-engine`) |
| Requirement families | `ADM-002`, `SRCH-003` |
| Depends on modules | `00-foundation` |
| Modules that depend on this one | `05-ingestion-framework`, `11-retrieval-engine`, `16-monitor-alerts`, `18-ops-release`, `21-evaluation-600` |
| Master spec | [`docs/PRD.md`](../../PRD.md) |
| Version | v0.2 (2026-08-03) |

## Problem

The product's entire safety claim rests on immutable, evidenced legal data: PRD §2 states the system
is "materially safer and more auditable than a general-purpose chatbot by enforcing legal-date and
jurisdiction filters, immutable source versions, claim-level citations, deterministic citation
validation, visible uncertainty and refusal when evidence is insufficient." Every one of those
mechanisms reads from one artifact — the CorpusRelease bundle — and every one of them is worthless if
the bundle's shape is negotiated ad hoc between 52 source adapters, a Rust search process and a
promotion tool.

Three concrete failure modes make this a module of its own:

1. **No contract between acquisition and build.** PRD §40.7 forbids the adapter from writing corpus
   tables: *"The adapter never writes active corpus tables directly. It emits versioned intermediate
   records with source URL, artifact hash and tool version."* Without a published record contract,
   each of the five source modules (06–10) would invent its own, and the corpus builder would grow 52
   special cases.
2. **No contract between build and consumption.** PRD §18.4 fixes the bundle layout
   (`corpus.sqlite`, `tantivy/`, `vectors.usearch`, `embedding-manifest.json`,
   `release-manifest.json`) and requires the manifest to carry "parent release, schema/parser/chunker/
   embedding/index versions, artifact hashes, counts, coverage, quarantine summary, evaluation
   results, file hashes/sizes, build time and app/search compatibility." Search (`11`), promotion
   (`18`), monitoring (`16`) and evaluation (`21`) all bind to that manifest.
3. **Nothing to build against until adapters land.** PRD §44.3's critical path puts
   "official-source adapters + release bundle" before "search/retrieval", and there are 52 adapter
   tickets. Without a synthetic signed release, `11-retrieval-engine` cannot start for weeks.

This module owns the two contracts and the offline build that produces conforming bundles, and it
produces the synthetic release that unblocks retrieval.

## Scope

In scope (the module's §4 write-owns row in the breakdown plan):

- `pipelines/corpus-builder/**` — corpus schema, the intermediate normalised-record (INR) contract,
  chunker, index tiering, candidate build + validation gates, R2 staging publish, synthetic fixture
  release.
- `pipelines/embeddings/**` — offline embedding build, vector artifact and embedding manifest.
- `schemas/corpus-manifest/**` — the versioned release-manifest and embedding-manifest JSON Schema
  roots (PRD §20.1 "Versioned contract roots"; §45.2 `schemas` owns exactly this).

**This module is the sole owner of the two PRD §44.3 serial-owned artifacts "corpus schema" and
"release manifest"** (breakdown plan §4.1). No other module may write `pipelines/corpus-builder/schema/**`
or `schemas/corpus-manifest/**`. A module that needs a corpus column or a manifest field raises a
ticket here and takes a `blocked_by` edge on it — exactly the rule PRD §45.2 applies to
`packages/database` ("Must not own: Corpus schema or UI").

## Non-goals

Each names its owner module/ticket or standing reason.

| Not in this module | Owner / reason |
|---|---|
| Adapter interface, safe fetcher, artifact store, licence registry, quarantine, coverage registry, discovery scheduler, conformance kit | `05-ingestion-framework` (`INGF-01` … `INGF-09`). `INGF-01` is `blocked_by CRPS-01` and binds the INR contract into the eight PRD §40.7 boundaries. |
| Any source adapter, any HTTP fetch of an official source | `06-sources-legislation` … `10-sources-future`. Per A4 the builder is testable from contract fixtures alone and never imports adapter code. |
| Reading the bundle: Tantivy search, USearch query, fusion, rerank, evidence assembly | `11-retrieval-engine` (`RETR-01` … `RETR-10`). Module 11 depends on 04; a dependency in the other direction would be a module cycle (breakdown plan §6.1, R6). |
| Downloading, verifying, shadowing and atomically promoting a release on the production host; rollback | `18-ops-release` (`RLSE-07`, file-scope `infra/deploy/corpus/**`). PRD §18.4 puts production verification and the active-pointer switch on the production side. |
| `DetectedChange` rows, watch matching, alerts | `16-monitor-alerts` (`WTCH-02`, `blocked_by CRPS-06`). This module emits the corpus-side release diff; the tenant fan-out is module 16 (PRD §33.4 steps 6–8). |
| The 600 evaluation cases, the runner, metrics and gate enforcement | `21-evaluation-600` (`GOLD-01` … `GOLD-17`). `CRPS-06` consumes an evaluation report as a file input; it never runs the evaluation harness (avoids a 04→21 cycle). |
| App tables, migrations, tenant repositories | `01-app-data`. PRD §18.3: `app.sqlite` and `corpus.sqlite` are separate databases; §45.2 forbids `packages/database` from owning corpus schema and vice versa. |
| Canonical enums, opaque ID conventions, OpenAPI/event roots | `00-foundation` (`FND-03`/`FND-04`/`FND-05`). PRD §35.1: "Enumerations use checked text values generated from `packages/contracts`" — this module *consumes* them and never redefines them. |
| Cross-boundary suites under `tests/**` | `23-assurance`. Unit/integration tests for this module live inside `pipelines/corpus-builder/tests/**` and `pipelines/embeddings/tests/**` (breakdown plan §1.1). |
| Choosing the production embedding model / dimensions / quantisation | Benchmark-selected (PRD §1, §14.4). `CRPS-05` builds the profile *mechanism* and pins whatever is chosen; the choice is plan §8 **Q2**, evidenced by `CRPS-05` + `RETR-10` and frozen by `GOLD-15`. |
| Choosing, building or running the **runtime** that executes those models | `11-retrieval-engine` (`RETR-07`). Plan §8 **Q11** is a confirmed architecture decision (Microsoft ONNX Runtime, CPU-only, via a pinned `ort` crate). This module records the runtime pin in the manifest (**D14**); it neither selects it nor loads a model. |

## Decisions

Each decision states its basis: a PRD section, a breakdown-plan §2.1 ADR candidate, or a settled
breakdown-plan §8 decision-register entry. No decision here invents product behaviour; where the PRD
does not answer, the item is an open question below, not a decision.

| # | Decision | Basis |
|---|---|---|
| D1 | The corpus builder consumes a **versioned intermediate normalised-record (INR) contract**, never adapter code. Adapters emit records; the builder resolves them into corpus rows. | Breakdown plan §2.1 **A4**; PRD §40.7 "The adapter never writes active corpus tables directly. It emits versioned intermediate records with source URL, artifact hash and tool version." |
| D2 | The INR contract is **language-neutral**: versioned JSON Schema + newline-delimited JSON, with a Python helper package as a convenience, never as the contract. A source module must be able to conform without reading corpus-builder code. | A4 ("testable from contract fixtures alone"); PRD §20.1 "Contracts and framework-independent domain rules are centralised". |
| D3 | Adapters emit **natural keys** (`stable_source_key`, `stable_node_key`, `version_label`) scoped by `source_id`; only the builder mints corpus primary keys. | PRD §40.7 (adapter never writes corpus tables); PRD §35.2 unique `(source_id, stable_source_key)` and `(document_id, stable_node_key)`. |
| D4 | The corpus schema's enum `CHECK` lists and ID conventions are **derived from `packages/contracts`**, with a drift test — never hand-copied. | PRD §35.1 "Enumerations use checked text values generated from `packages/contracts`"; breakdown plan §4.1 (`FND-03` is the serial owner). |
| D5 | Immutability is enforced **in the schema** (triggers denying UPDATE/DELETE) for `source_artifact`, `licence_snapshot`, `document_version`, `node_version`, `legal_event`, and for `corpus_release` after signing — while `search_chunk`/`chunk_embedding` stay rebuildable. | PRD §35.8 invariant 5; §35.2/§35.3 "immutable"; §15.3 "SearchChunks and embeddings may be deleted/rebuilt". |
| D6 | Chunking is deterministic and node-bounded: same inputs and same chunk profile ⇒ byte-identical chunk boundaries; a chunk never spans independent legal nodes. | PRD §15.3 "SearchChunks MUST NOT cross independent legal nodes merely for convenience"; §35.3 "cannot cross unrelated nodes; rebuildable"; §36.2 "Consolidate adjacent nodes only within same logical provision". |
| D7 | Index tier is **assigned by policy from evidence** (source-group initial tier, licence assessment, quarantine state) with downgrades dominating; nothing may be upgraded above its source-group tier. | PRD §17.2 tier list; §40.1 "Licensing can only reduce permitted display/indexing, never be assumed from the tier"; §35.3 quarantine "cannot enter promoted release while open". |
| D8 | The release manifest is a **JSON contract root under `schemas/corpus-manifest/**`**, canonicalised to deterministic bytes, hashed, and signed with a detached asymmetric signature. Production private keys never enter the repository. | PRD §18.4 manifest field list and "Build/sign/upload occurs offline. Production verifies signature, compatibility, disk, hashes …"; §20.2 "Coding agents MUST NOT receive production … signing … credentials by default". |
| D9 | The candidate build **fails closed**: a gate failure produces no publishable artifact and never touches active data; open quarantine blocks the candidate. | PRD §12.2 "Candidate corpus releases MUST pass completeness, time, identity, citation, licensing, smoke search, evaluation-subset and manifest checks. Failed releases MUST NOT modify active production data."; §35.8 invariant 8. |
| D10 | The evaluation-subset gate and the full search smoke are **file/port inputs**, not in-module implementations: `CRPS-06` consumes an evaluation report produced by `21-evaluation-600` and runs only the offline corpus-level smoke; the full search smoke belongs to production verification. | PRD §18.4 "Production verifies … and smoke queries"; module DAG direction (04 → 11, 04 → 21) — the reverse edge would be a cycle (breakdown plan §6.1, R6). |
| D11 | R2 staging is **write-once**: an existing key is a failure, never an overwrite; only public/rebuildable corpus artifacts are uploaded. | PRD §18.4 "Active data MUST never be rebuilt or mutated in place"; §19.2 R2 "MUST NOT contain customer identities, Research Records, answers, exports or backups". |
| D12 | `CRPS-08` ships a **signed synthetic fixture release** marked as such in the manifest (`release_kind: SYNTHETIC_FIXTURE`), generated deterministically and committed, so `RETR-01` and CI can start before any adapter exists — and so a fixture can never be mistaken for a promotable candidate. | Breakdown plan §2.1 **A4**; PRD §20.3 CI gates; §40.8 item 4 "representative … fixtures without customer data". |
| D13 | Unit/integration tests live inside the owning package (`pipelines/*/tests/**`), one disjoint sub-directory per ticket. | Breakdown plan §1.1 (Tests); PRD §20.1 reserves `tests/**` for cross-boundary suites. |
| D14 | **The manifests are where the local model, tokenizer and runtime are pinned.** `schemas/corpus-manifest/**` carries, as *fields*: the runtime family and version, its execution providers, the exact `ort` crate version and the pinned tokenizer-library version; the tokenizer artefact identity (id + artefact hash); and, per local model artefact and per role, an immutable revision identifier, artefact hash, dimensions, normalisation, truncation and licence information. `CRPS-02` owns the schema fields, `CRPS-05` emits them for the document-embedding profile it actually executed, `CRPS-06` gates them, and `RETR-07` may only **consume and verify** them. The **values** are never chosen here: the models stay plan §8 **Q2** (benchmark-selected), the runtime pin is supplied to the build as an explicit input recorded by `RETR-07`. | Breakdown plan §8 **Q11** (confirmed architecture decision): *"Models, tokenizers and runtime metadata are pinned in the corpus/retrieval manifest"* and *"Model artefacts must carry an immutable revision identifier, hash, dimensions, normalisation, truncation and licence information"*; PRD §18.4; §44.3 (the manifest is serial-owned here). |
| D15 | **Pinning is identity, not payload.** The manifest pins *what* must be loaded and verified; it does not add model weight files to the bundle. PRD §18.4 fixes five bundle paths and `RETR-07` loads weights from a configured local path, so a model artefact appears in `files[]`/`artifacts.*` only if it is genuinely a bundle file. Deciding to ship weight bytes inside the bundle would change PRD §18.4's fixed layout and is a **plan/PRD writeback**, never a ticket-local addition. | PRD §18.4 (fixed bundle layout; `docs/PRD.md` is frozen per breakdown plan §4); PRD §39.6 (runtime configuration, not repository content); breakdown plan §8 Q11 ("Model artefacts reach production only through the signed corpus/model release path"). |

## Rejected alternatives

| Rejected | Why |
|---|---|
| **Adapters write corpus tables directly** (no intermediate contract). | Directly forbidden by PRD §40.7, and it would make `04` and `05`–`10` mutually dependent — 52 adapter tickets contending on one schema. A4 exists precisely to break that. |
| **Define the INR contract inside `05-ingestion-framework`** (with the adapter interface). | Then the corpus builder would depend on the ingestion framework, inverting the plan's 04 → 05 edge and making the builder untestable without the framework. The contract is data; `INGF-01` owns the *callable* interface over it. |
| **Put the corpus schema in `packages/database`** next to the app schema. | PRD §45.2 states `packages/database` "Must not own: Corpus schema or UI", and PRD §18.3 keeps `app.sqlite` and `corpus.sqlite` strictly separate — the search process may read corpus files only. |
| **One "build the corpus" ticket.** | The module would be a single serial lane; breakdown plan §7 requires ≥2 useful lanes per module, and §2 makes disjoint write-sets the whole basis of the cut. The 8-way split yields 5 waves / 3 useful lanes. |
| **Have `CRPS-06` call `services/search-rs` to build the lexical index and run the smoke queries.** | Creates a 04 → 11 module edge on top of the existing 11 → 04 edge — a module cycle; `dag-scan.mjs` exits 1 and `/start-all` refuses to run (breakdown plan R6). Replaced by D10 plus open question Q-CRPS-2. |
| **Let `CRPS-05` author `schemas/corpus-manifest/embedding-manifest.schema.json`.** | Two writers on the serial-owned manifest root, and `CRPS-05` is not `blocked_by CRPS-02` (breakdown plan §5.5) so they can run concurrently. The schema is `CRPS-02`'s; `CRPS-05` emits a conforming instance whose fields are enumerated in its own ticket, and `CRPS-06` (blocked by both) is where the two are validated against each other. |
| **Ship the fixture release unsigned** (simpler for CI). | PRD §18.4 requires signature verification on load; an unsigned fixture would force `RETR-01` to implement a bypass path, which is exactly the code that must not exist. A committed *development* keypair keeps the verification path real without production key exposure (§20.2). |
| **Store text offsets as byte offsets.** | PRD §15.3 requires citations to target "exact offsets" and `SRCH-003` requires "Snippet offsets reproduce exact NodeVersion text"; mixing byte and character offsets across a Python builder, a Rust searcher and a TypeScript validator is a silent-corruption class. Character offsets into NFC-normalised `canonical_text`, fixed once at `normalise()`. |
| **Let the search process discover the model, tokenizer or runtime identity from whatever artefact it happens to load.** | Breakdown plan §8 **Q11** requires models, tokenizers and runtime metadata to be *pinned in the manifest* and verified before use. A value inferred at load time is unverifiable, and it makes a silent model or runtime swap invisible inside a signed release. The manifest carries the fields (D14); `RETR-07` refuses on any missing or mismatched one. |
| **Add model weight files to the PRD §18.4 bundle layout so the manifest can hash them as bundle files.** | PRD §18.4 fixes five bundle paths and `docs/PRD.md` is frozen (breakdown plan §4); `RETR-07` already loads weights from a configured local path. The manifest pins artefact *identity* instead (D15). A decision to ship weight bytes inside the bundle is a plan/PRD writeback, not something a ticket here may add. |
| **Record the local model/runtime pins in `chunk_embedding` columns instead of the manifest.** | It duplicates a PRD §44.3 serial-owned contract in a second serial-owned artifact, and the corpus database is immutable per release while the pins must be verifiable *before* the database is opened. PRD §35.3 fixes `chunk_embedding`'s columns; D14 keeps the pins in the manifest, which `RETR-01`/`RLSE-07` already verify first. |

## Open questions

None blocks the module's first wave. Each names an owner and the artifact that resolves it. **None of
the `docs/prd/breakdown-plan.md` §8 entries below is a Founder decision waiting to be taken** — each is
benchmark-selected or deferred until measurement, and is resolved by evidence through its named
ticket. Among the module-local questions, only **Q-CRPS-3**'s production key custody is the Founder's,
and it blocks nothing: the signing scheme, the verification path and the committed development keypair
are all buildable today.

**Settled `docs/prd/breakdown-plan.md` §8 register entries this module relies on. These are
decisions, not questions; an implementing agent must not re-litigate them:**

- **Q11 — local embedding and rerank runtime. Status: CONFIRMED architecture decision.** Microsoft
  ONNX Runtime, CPU-only, driven from Rust through an exactly pinned `ort` crate with the Hugging Face
  `tokenizers` crate and a release-pinned `tokenizer.json`; models, tokenizers and runtime metadata are
  pinned in the corpus/retrieval manifest; model artefacts carry an immutable revision identifier,
  hash, dimensions, normalisation, truncation and licence; no runtime network access in production.
  The runtime belongs to `11-retrieval-engine` (`RETR-07`); this module owns only the manifest fields
  that make the pinning satisfiable (**D14**, **D15**). **Q11 does not settle Q2** — Q11 fixes what
  executes a model, Q2 selects which model executes, and the two must not be conflated.
- **Q10 — which source groups may launch in a limited state. Status: CONFIRMED POLICY.** No mandatory
  source group is pre-selected for omission; every group in the approved MVP scope is attempted in
  full; no scope is reduced to make a release date easier; and a customer-visible limited state
  (`METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`) is
  permitted **only** on measured evidence of a genuine official-source limitation, recorded with the
  evidence, the affected dates or collections, the customer-visible warning and the reason. `GOLD-16`
  produces the evidence and the proposed registry state; `LNCH-05` verifies the launch statement; Gate
  2 is verification and sign-off, not an opportunity to cut mandatory scope. `CRPS-06`'s completeness
  gate enforces the corpus-side half (a group left `PLANNED_NOT_ACTIVE` is BLOCKING; an explicit
  limited state passes and is recorded in `coverage`).
- **Q6 — blind case authoring, isolation and key custody. Status: CONFIRMED.** Relevant here only as a
  warning: the Q6 private key (the Founder's `SealedBox`/`crypto_box_seal` key for `evals/gold/**`,
  supplied to the evaluation flow through `EVAL_BLIND_KEY_FILE`) is a **different key, with a
  different purpose and a different custody model**, from the corpus-release signing key in
  **Q-CRPS-3**. Never conflate them, never reuse one for the other, and never let Q6's settled custody
  rules be read as an answer to Q-CRPS-3.

| # | Question | Owner | Resolved by | Blocks | Basis |
|---|---|---|---|---|---|
| Q2 (plan §8) | **Embedding model and representation — model, tokenizer settings, dimensions, normalisation, distance metric, quantisation, and reranker weights where applicable. Status: benchmark-selected**, decided by measured evidence rather than preference. Q2 selects the models that execute inside Q11's confirmed ONNX Runtime boundary; **Q11's confirmation does not settle Q2**. | `04-corpus-contract` + `11-retrieval-engine` | `CRPS-05` + `RETR-10` produce the compatibility, recall, latency, memory and resource evidence; `GOLD-15` freezes the promoted profile; every chosen value is pinned in the release manifest | Nothing — the embedding manifest pins whatever is chosen (D14) | PRD §14.4, §18.2, §18.4 |
| Q3 (plan §8) | **Always-hot vector count, semantic-cache entry/byte limit, resident memory allocation and the cold/hot tier boundary. Status: deferred until real-scale measurement.** The governing policy is already settled: full lexical corpus coverage is kept, hot dense coverage is reduced before lexical scope, the 2 GB production-host budget holds, every process carries an explicit memory limit, and any dense-coverage downgrade is disclosed rather than silent. Only the numbers await measurement, and the 150k–300k planning hypothesis is never a product commitment. | `18-ops-release` | `RLSE-11` measures against the real 2 GB benchmark and records the measured decision; this module supplies the inputs (`CRPS-04` deliverable 6, `CRPS-05` deliverable 7, `CRPS-06` deliverable 9) | The launch decision to reduce hot dense coverage before lexical scope | PRD §17.2, §36.2, §39.2, §27 |
| Q5 (plan §8) | **Measured corpus statistics and dependent capacity claims — document count, source/object-storage bytes, search-chunk count, hot-vector count and release bundle size. Status: deferred until corpus measurement.** The "~300k documents / ~150 GB" figures are planning hypotheses; no artifact in this module may present them as measured fact, and no customer-facing copy may repeat them as one. | `21-evaluation-600` | `GOLD-16` writes the measured statistics back into the decision register and the dependent capacity inputs; this module's measurements come from `CRPS-05` deliverable 7 and `CRPS-06` deliverable 9 | Customer-facing capacity claims | PRD §17.2 "capacity hypotheses … MUST be replaced by measured corpus statistics" |
| Q9 (plan §8) | **Per-source anomaly thresholds. Status: baseline-selected.** The ±10% count change and >2% parse-failure figures are **initial defaults**, which each adapter may tighten or replace once it has a representative baseline. Critical identity, time, mandatory-source and citation failures are unconditional blockers unaffected by any percentage threshold. The Founder is not asked to guess these numbers. | each adapter ticket; defaults in `INGF-05`, enforced release-side by `CRPS-06` deliverable 6 | per-adapter DoD item 8, consolidated and verified by `GOLD-16` | Nothing — the critical failures already block release unconditionally | PRD §40.9 |
| **Q-CRPS-1** | Chunk profile constants (target chunk size, overlap, consolidation rule inside a provision). PRD §36.2 fixes evidence-node counts but not chunk size; PRD §45.5 classifies "chunk" values as **benchmark-selected configuration**. | `04-corpus-contract` — `CRPS-03` ships the versioned profile mechanism with documented initial defaults | Measured evidence from `RETR-10` (retrieval profile freeze) and `GOLD-16` | Nothing — defaults are buildable and versioned | PRD §1 (benchmark-selected), §36.2, §45.5 |
| **Q-CRPS-2** | **How is the bundle's `tantivy/` lexical index produced offline without importing `services/search-rs`?** PRD §19.1 forbids production index builds and §19.3 puts "index build" in the local pipeline, but no PRD section names the builder. ADR candidate (PRD §45.5 "Architecture decision"). | `04-corpus-contract` (`CRPS-06`) jointly with `11-retrieval-engine` (`RETR-02`) | `CRPS-06` — records the choice in `docs/adr/NNNN-offline-lexical-index-builder.md` (breakdown plan A9: the creating ticket claims the file) and writes back to `docs/prd/breakdown-plan.md` §2.1/§4.2 | Nothing before `CRPS-06`; `CRPS-08` declares its fixture index state explicitly rather than guessing | PRD §18.4, §19.1, §19.3, §45.5 |
| **Q-CRPS-3** | Signing scheme and key custody for the release manifest (PRD requires a signature, names no algorithm or custody model). **Still open** — the register's confirmed **Q6** custody rules govern the *blind-gold* `SealedBox` key and answer nothing about this, separate, release-signing key. ADR candidate. | `04-corpus-contract` (`CRPS-02`); production key custody is the **Founder's** (PRD §20.2, §39.6) | `CRPS-02` — ADR `docs/adr/NNNN-corpus-release-signing.md`; ticket default is a detached Ed25519 signature over the canonical manifest bytes | Nothing — verification and the committed dev keypair are buildable today | PRD §18.4, §20.2, §39.6, §45.5 |
| **Q-CRPS-4** | Does `packages/contracts` (`FND-03`) publish a machine-readable export of canonical enums and opaque-ID prefixes that a **Python** pipeline can consume, including corpus-entity prefixes? | `00-foundation` (`FND-03`) | `FND-03`; if absent when `CRPS-01` executes, `CRPS-01` raises a ticket-change request against `FND-03` and a writeback to `docs/prd/breakdown-plan.md` §4.2 — it must not hand-copy enum values or add prefixes into `packages/contracts` | `CRPS-01`'s D4 drift test | PRD §35.1, §20.1, breakdown plan §4.1 |

## Work breakdown

Lane is `04-corpus-contract` and agent is `builder` for all eight tickets (breakdown plan §1.1).
File-scopes below are relative to the repository root and are disjoint between tickets that can run
concurrently. `depends-on` is exactly breakdown plan §5.5.

| Ticket | Size | Lane | File-scope (write-owns) | Depends on |
|---|---|---|---|---|
| [`CRPS-01`](tickets/CRPS-01-corpus-sqlite-schema-and-intermediate-normalised-record-contract.md) — corpus.sqlite schema + intermediate normalised-record contract | L | `04-corpus-contract` | `pipelines/corpus-builder/schema/**`, `pipelines/corpus-builder/src/contracts/**`, `pipelines/corpus-builder/tests/{schema,contracts}/**` | `FND-03` |
| [`CRPS-02`](tickets/CRPS-02-corpusrelease-manifest-schema-signing-and-verification.md) — CorpusRelease manifest schema, signing and verification | M | `04-corpus-contract` | `schemas/corpus-manifest/**`, `pipelines/corpus-builder/src/manifest/**`, `pipelines/corpus-builder/tests/manifest/**` | `CRPS-01` |
| [`CRPS-03`](tickets/CRPS-03-chunker-and-searchchunk-node-boundary-rules.md) — Chunker and SearchChunk node-boundary rules | M | `04-corpus-contract` | `pipelines/corpus-builder/src/chunking/**`, `pipelines/corpus-builder/tests/chunking/**` | `CRPS-01` |
| [`CRPS-04`](tickets/CRPS-04-index-tier-assignment-policy.md) — Index-tier assignment policy | M | `04-corpus-contract` | `pipelines/corpus-builder/src/tiering/**`, `pipelines/corpus-builder/tests/tiering/**` | `CRPS-01` |
| [`CRPS-05`](tickets/CRPS-05-embedding-build-pipeline-and-embedding-manifest.md) — Embedding build pipeline and embedding manifest | L | `04-corpus-contract` | `pipelines/embeddings/**` | `CRPS-03`, `CRPS-04` |
| [`CRPS-06`](tickets/CRPS-06-candidate-release-build-and-validation-gates.md) — Candidate release build and validation gates | L | `04-corpus-contract` | `pipelines/corpus-builder/src/{build,validation}/**`, `pipelines/corpus-builder/tests/{build,validation}/**`, `docs/adr/NNNN-offline-lexical-index-builder.md` | `CRPS-02`, `CRPS-05` |
| [`CRPS-07`](tickets/CRPS-07-release-staging-upload-to-r2-with-hash-coverage-report.md) — Release staging upload to R2 with hash/coverage report | M | `04-corpus-contract` | `pipelines/corpus-builder/src/publish/**`, `pipelines/corpus-builder/tests/publish/**` | `CRPS-06` |
| [`CRPS-08`](tickets/CRPS-08-signed-synthetic-corpus-fixture-release.md) — Signed synthetic corpus fixture release | M | `04-corpus-contract` | `pipelines/corpus-builder/fixtures/**`, `pipelines/corpus-builder/tests/fixtures/**` | `CRPS-02` |

Standing module-shared exception (breakdown plan §1.1, "Package manifests"): `pipelines/corpus-builder/pyproject.toml`
and `pipelines/embeddings/pyproject.toml` are created empty by `FND-01` and are **append-only shared**
inside this module — a ticket adding a declared dependency appends there and regenerates the root
`uv.lock` as a build artifact (conflicts resolve by re-running `uv lock`, never by hand-merge).

Wave shape (breakdown plan §7: 5 minimum waves, 3 useful lanes, not fully serial):

```text
wave 1  CRPS-01
wave 2  CRPS-02 | CRPS-03 | CRPS-04
wave 3  CRPS-05 | CRPS-08
wave 4  CRPS-06
wave 5  CRPS-07
```

## Acceptance — what makes the whole module done

The module is done when all eight tickets are delivered (`/verify-delivery` green each) **and**:

1. **`ADM-002` corpus-side half.** A deliberately corrupted candidate cannot produce a publishable
   artifact and cannot alter any active data: `CRPS-06`'s gates fail closed, `CRPS-07` refuses to
   overwrite an existing key, and the manifest of a failed candidate is never signed. (PRD §30.2
   `ADM-002` "Promotion failure leaves active pointer unchanged"; §12.2; §35.8 invariant 8. The MFA,
   reason and audit half is `RLSE-07` + `INTL-04`.)
2. **`SRCH-003` corpus-side half.** For every chunk in the synthetic release, the recorded
   `start_offset`/`end_offset` slice of the stored `node_version.canonical_text` reproduces the exact
   chunk text, and `text_hash` matches. (PRD §30.2 `SRCH-003` "Snippet offsets reproduce exact
   NodeVersion text"; §15.3.)
3. **`E07-CORPUS-SCHEMA` exit evidence: "Immutable fixture opens in search."** `CRPS-08` produces a
   signed synthetic bundle with every PRD §18.4 path present, whose signature and hashes verify with
   the committed public key, and whose `corpus.sqlite` opens read-only. (The search-side load is
   `RETR-01`, which is `blocked_by CRPS-08`.)
4. **`E17-INDEX` build half.** `CRPS-05` produces a vector artifact plus an embedding manifest that
   pins the exact profile — profile id, model id and immutable model revision, model-artefact hash,
   tokenizer artefact identity, dimensions, normalisation, distance metric, quantisation, truncation,
   model licence, tier selection, and the runtime metadata the release pins (**D14**) — reproducibly:
   the same inputs and profile produce identical vectors and an identical manifest apart from
   timestamps. A stub-built profile is visibly a stub and cannot pass `CRPS-06`'s candidate gate.
5. **PRD §26 "Corpus" bullets that this module owns:** "Raw evidence/provenance/licensing and
   immutable CorpusRelease workflows operate" — the schema carries `source_artifact`,
   `licence_snapshot`, `licence_assessment`, `ingestion_run`, `quarantine_item` and `corpus_release`
   per §35.3, and the build refuses to include open quarantine items.
6. **Contract usability by the five source modules.** `INGF-01` and any one adapter ticket can emit
   conforming INR records using only `schemas/`-rooted JSON Schema plus the ticket text — verified by
   the conformance fixture set in `CRPS-01` being loadable and validatable without importing
   corpus-builder application code.
7. **Every ticket's `[machine]` items reproduce offline**: `uv run pytest` and `pnpm test` green on
   the merged default branch (PRD §20.3, §45.3).

## Changelog

- **v0.2 — 2026-08-03** — aligned with the `docs/prd/breakdown-plan.md` §8 decision register. **Q11**
  is recorded as a confirmed architecture decision owned by `RETR-07`, with its manifest-pinning
  consequence resolved inside this module's serial-owned scope as decisions **D14** (the manifest
  carries runtime family/version, execution providers, the `ort` crate version, the tokenizer-library
  version, the tokenizer artefact identity, and per model artefact an immutable revision identifier,
  hash, dimensions, normalisation, truncation and licence) and **D15** (pinning is identity, not
  payload — weight bytes do not become a sixth PRD §18.4 bundle path without a plan/PRD writeback);
  three matching rejected-alternative rows added. **Q2** is restated as benchmark-selected and
  explicitly **not** settled by Q11; **Q3** and **Q5** as deferred until measurement with their
  already-settled governing policies; **Q9** as baseline-selected with the ±10% / >2% figures named as
  initial defaults rather than placeholders. **Q10** and **Q6** are recorded as settled register
  entries this module relies on, with the explicit warning that Q6's blind-gold key is a different key
  from **Q-CRPS-3**'s release-signing key. Ticket edits: `CRPS-01`, `CRPS-02`, `CRPS-04`, `CRPS-05`,
  `CRPS-06`. Module-local `Q-CRPS-1` … `Q-CRPS-4` remain open. No change to module scope, the ticket
  set, dependency order, file-scope allocation, the PRD §44.3 serial ownership of the corpus schema and
  release manifest, or any quality gate.
- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.5 (8 tickets,
  `CRPS-01` … `CRPS-08`). Records decisions D1–D13, rejects 7 alternatives, opens Q-CRPS-1 … Q-CRPS-4
  (two of them ADR candidates: offline lexical index builder, release signing scheme).
