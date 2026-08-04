# 11-retrieval-engine — sub-PRD

> Module sub-PRD. Authored from `docs/prd/breakdown-plan.md` §5.12 (wave B). The **tickets** under
> `tickets/` are the executable source of truth; this file is the module's shared context. On any
> disagreement between a ticket and this file, the ticket wins (CLAUDE.md, issue #53).

| Field | Value |
|---|---|
| Module | `11-retrieval-engine` |
| Lane | `11-retrieval-engine` |
| Ticket prefix | `RETR` |
| Tickets | 10 (`RETR-01` … `RETR-10`) |
| PRD epics | `E17-INDEX` (read half; the build half is `04-corpus-contract`) |
| Requirement families | `SRCH-001` … `SRCH-005` |
| Depends on modules | `00-foundation`, `04-corpus-contract` |
| Modules that depend on this one | `12-evidence-safety`, `14-search-product`, `15-answer-product`, `18-ops-release`, `21-evaluation-600` |
| Languages | Rust (`services/search-rs`) + TypeScript (`packages/retrieval-client`) |
| Master spec | [`docs/PRD.md`](../../PRD.md) |
| Version | v0.3 (2026-08-03) |

## Problem

Every safety claim the product makes is a *retrieval* claim before it is a generation claim. PRD §2
says the system is safer than a general chatbot "by enforcing legal-date and jurisdiction filters,
immutable source versions, claim-level citations, deterministic citation validation, visible
uncertainty and refusal when evidence is insufficient". The first three of those are decided here:
if the wrong version, the wrong jurisdiction or licence-restricted material reaches the evidence
pack, no downstream validator can repair it — it can only refuse.

Four concrete pressures make this a module of its own.

1. **The engine is a separate process with a hard memory ceiling.** PRD §18.1 names a "Rust search
   process" as one of three supervised runtimes; PRD §39.2 gives it 768 MiB on a 2 GB host and PRD
   §39.4 restricts it to `127.0.0.1:7700`. PRD §39.1 states the dependency rule bluntly:
   *"`services/search-rs` has no credentials/path for `app.sqlite`"* and *"search-rs → corpus bundle
   only"*. That boundary is only real if exactly one module owns the process.
2. **Applicability is a filter, not a preference.** PRD §17.1: *"Dense similarity and reranking MAY
   improve recall/order but MUST NOT override applicability."* PRD §36.3: *"No learned score may
   reintroduce a filtered item or turn regulator guidance into higher authority than the operative
   legislation/instrument it explains."* A codebase where ranking and filtering are the same
   arithmetic cannot honour that sentence; the separation has to be structural.
3. **The retrieval order is fixed and the stages are genuinely different code.** PRD §17.1 fixes
   `query classification → hard legal filters → exact/citation retrieval → full-corpus lexical
   retrieval → selective dense retrieval → rank fusion → bounded rerank → evidence sufficiency`.
   Lexical (Tantivy) and dense (USearch) are two independent index technologies that meet at fusion —
   which is exactly why this module is not one serial lane (breakdown plan §7).
4. **Nothing downstream can start until the search boundary exists.** `packages/citations`
   (`EVID-04`), `POST /v1/search` (`FIND-01`), the Quick worker (`ASK-02`), the release archive
   (`RLSE-01`), the 2 GB benchmark (`RLSE-11`) and profile promotion (`GOLD-15`) all wait on tickets
   in this module. Breakdown plan decision **A4** is what lets this module start early at all: the
   signed synthetic fixture release `CRPS-08` stands in for 52 source adapters.

This module owns the read side of the corpus bundle, the retrieval pipeline over it, and the single
typed client through which the rest of the system is allowed to reach it.

## Scope

In scope (the module's breakdown plan §4 write-owns row):

- `services/search-rs/**` — the Rust search process: bundle load and verification, release pinning,
  localhost API, Tantivy lexical/field/citation index, exact-identifier retrieval, the PRD §36.2 hard
  filters, USearch dense retrieval with tiering/quantisation/semantic cache, rank fusion and the
  §36.3 feature order, the local query-embedding and rerank runtime, evidence sufficiency and
  candidate assembly, and the benchmark harness.
- `packages/retrieval-client/**` — the TypeScript client that `apps/api` and `apps/worker` use to
  talk to that process, and the only such path (PRD §39.1, §39.4).

Out of scope in one line: **this module reads the corpus and returns candidates; it never writes
corpus data, never touches tenant data, and never calls a hosted model.**

## Non-goals

Each names its owner module/ticket or standing reason.

| Not in this module | Owner / reason |
|---|---|
| Corpus schema, chunker, index tiering *policy*, embedding build, release manifest, R2 publish, the synthetic fixture release | `04-corpus-contract` (`CRPS-01` … `CRPS-08`). PRD §44.3 makes corpus schema and release manifest serial-owned there; this module **reads** them and takes `blocked_by` edges (`CRPS-08 → RETR-01`, `CRPS-05 → RETR-05`). |
| `POST /v1/search`, document/version/node/timeline/relation endpoints, the §34.2 wire payloads, search screens | `14-search-product` (`FIND-01` … `FIND-05`, both `blocked_by RETR-09`). This module exposes an **internal** localhost API, not a customer API. |
| Evidence-pack construction, untrusted-content delimitation, licence quote limits, the deterministic citation validator, output sanitisation | `12-evidence-safety` (`EVID-04` … `EVID-06`, `EVID-10`). PRD §45.2: `packages/citations` owns "Evidence/claim deterministic validation" and **must not own** "Retrieval ranking". `EVID-04` is `blocked_by RETR-09`. |
| Hosted model calls, model profiles, budget reservation, BYOK | `12-evidence-safety` (`EVID-07` … `EVID-09`). PRD §17.3 puts hosted synthesis outside the search boundary; the search process has no provider credentials (PRD §39.6). |
| PII detection and the admission boundary | `12-evidence-safety` (`EVID-01` … `EVID-03`). PRD §17.3 lists "PII pre-screening" as an online-local task, but PRD §37.2 makes it a *server-side admission* boundary in `packages/pii` before a job is created; search receives only the sanitized query (PRD §18.5 step 4). |
| Quick/Deep orchestration, clarification, snapshots, SSE | `15-answer-product` (`ASK-01` … `ASK-12`). `ASK-02` is `blocked_by RETR-08`. |
| Corpus promotion, the active-pointer switch, shadow processes, host systemd units and memory cgroups | `18-ops-release` (`RLSE-02`, `RLSE-07`). This module reads whatever bundle the pointer names and declares its own budget; it does not deploy itself. |
| The 600 evaluation cases, gold answers, the evaluation runner, gate enforcement and profile promotion | `21-evaluation-600` (`GOLD-01` … `GOLD-17`). `GOLD-15` is `blocked_by RETR-10`. Per breakdown plan R9 and PRD §14.3, nothing in this module may read `evals/gold/**`. |
| Canonical enums, opaque IDs, OpenAPI root, generated bindings, the pure §36.2 predicate and §36.3 feature order in TypeScript | `00-foundation` (`FND-03`, `FND-04`, `FND-10`). This module consumes them; `FND-10`'s own non-goals say "the engine applies them". |
| Cross-boundary suites under `tests/**` | `23-assurance`. Unit/integration tests for this module live inside `services/search-rs/**` and `packages/retrieval-client/**` (breakdown plan §1.1). |
| Choosing the production embedding and reranker model **weights**, the hosted reranker, the always-hot vector count | Breakdown plan §8 **Q2** (benchmark-selected — model, tokenizer settings, dimensions, normalisation, distance metric, quantisation and reranker weights; `CRPS-05` + `RETR-10` produce the evidence and `GOLD-15` freezes the promoted profile) and **Q3** (deferred until real-scale measurement, resolved by `RLSE-11`). PRD §1, §14.4. This module builds the mechanism and pins whatever is chosen. The **runtime** those weights execute in is *not* benchmark-selected: it is the confirmed §8 **Q11** decision, recorded as **D16**. |

## Decisions

Each decision states its basis: a PRD section, a breakdown-plan §2.1 ADR candidate, or a
breakdown-plan §8 decision-register entry. Where none of those answers, the item is an open question
below, not a decision.

| # | Decision | Basis |
|---|---|---|
| D1 | **`services/search-rs` is the sole reader of corpus files.** `apps/api` and `apps/worker` reach it only through `packages/retrieval-client` over `127.0.0.1:7700`; neither ever opens `corpus.sqlite`, a Tantivy directory or a vector file. | PRD §39.1 dependency arrows (`SEARCH → CORPUS/TANTIVY/VECTOR`; `search-rs → corpus bundle only`); §39.4 network matrix (`app`/`worker` → `127.0.0.1:7700`); §18.3. |
| D2 | **A bundle is verified before it is used, never after.** Loading performs the same checks as `CRPS-02`'s `verify_bundle()` — schema-valid manifest, `manifest_sha256` over canonical bytes, signature against a known `key_id`, every `files[]` hash and size, `artifacts.*`, and `versions.schema` equal to `corpus_meta.schema_version` — and opens `corpus.sqlite` through the SQLite read-only URI. | PRD §21 *"Trust application/corpus artifacts only after signature/hash/compatibility verification"*; §18.4; §18.3 *"production read-only"*. |
| D3 | **Release pinning is explicit and refusal-based.** Every request names a `corpus_release_id`; if that release is not loaded the request fails with a typed error. Search never substitutes another release, and a loaded release is retained while any caller still pins it. | PRD §18.5 step 4 *"Search receives only sanitized query, hard filters and pinned release"*; §36.2 conjunct 5; §18.4 *"Old releases cannot be removed while jobs remain pinned"*. |
| D4 | **Hard filters are a type boundary, not a score.** Only the filter stage can construct the eligible-candidate type that later stages consume, so no ranking, fusion or rerank code path can produce an ineligible candidate — the sentence "no learned score may reintroduce a filtered item" is enforced by the compiler, not by review. | PRD §36.2 (filters run before scoring **and again** before evidence-pack construction); §36.3; §17.1. |
| D5 | **The §36.2 predicate is re-implemented in Rust and proved equal to `FND-10`'s TypeScript predicate by replaying `FND-10`'s committed 32-row truth table** (`packages/domain/test/legal/prd-36-2-eligibility.json`), rather than calling across a process boundary per candidate. | PRD §13.2 p95 ≤ 2 s with 100–200 lexical candidates makes per-candidate IPC infeasible; `FND-10` deliverable 10 commits the fixture; breakdown plan §4.2 treats a shared *semantic* as a writeback target, not a shared file. ADR candidate — see Q-RETR-3. |
| D6 | **Fusion combines ranks, never raw scores.** Reciprocal-rank fusion over per-stage rank lists; BM25 and vector similarity are never added, scaled into a common range or compared numerically. | PRD §17.1 *"SHOULD combine ranks rather than directly add incompatible BM25/vector scores"*; §36.2 *"Reciprocal-rank fusion; no raw-score addition"*. |
| D7 | **The retrieval profile is versioned configuration with the PRD §36.2 "Initial default" column as its v1 values and the "Hard ceiling" column enforced in code.** A profile that exceeds a ceiling is rejected at load; the profile id and version are echoed in every response so a result set is attributable. | PRD §36.2 *"stored in a versioned retrieval profile … tuned on the development set and frozen for validation/release"*; §14.4 (benchmark-selected configuration is versioned config). |
| D8 | **The internal search API is contract-first: `RETR-01` freezes the complete surface** (endpoints, request/response JSON shapes, error codes) plus a committed JSON Schema and example fixtures, and later stages fill in implementations without changing the wire shape. | This is what lets `RETR-09` (`blocked_by RETR-01` only) type the whole surface at wave 2 while `RETR-08` lands at wave 5; a wire change after `RETR-09` merges would be a cross-ticket edit that the DAG does not permit. PRD §39.1, §16.1 (contract stability discipline). |
| D9 | **The offline lexical index builder ships as a second binary of the same crate** (`[[bin]]` appended to `services/search-rs/Cargo.toml`, source under `src/lexical/bin/`), so `CRPS-06` can invoke it as a process. A Python import of Rust code, or a `04 → 11` code dependency, is not permitted. | PRD §19.1/§19.3 forbid production index builds and put "index build" in the local pipeline; breakdown plan R6 (a `04 → 11` edge is a module cycle); mirrors `04-corpus-contract` open question **Q-CRPS-2**. |
| D10 | **Degradation is directional.** Under memory or artifact pressure the dense index, semantic cache and reranker degrade first and say so; lexical corpus coverage and the hard filters never degrade. A degraded dense stage still returns lexically-retrieved, fully-filtered results. | PRD §39.2 *"If the search process exceeds its limit, reduce always-hot vector coverage/cache before removing lexical corpus coverage"*; §13.2 *"the product MUST preserve correctness and surface delay/degraded status"*; §26 "Search remains available independently of hosted-generation budget". |
| D11 | **No tenant identity, no customer facts, no PII detection and no hosted-model call ever enter the search boundary.** The request type carries only the sanitized query, the §36.1 classification output, hard filters and the pinned release. | PRD §18.5 step 4; §21.2 (tenant isolation is an app-side repository concern); §45.2 (`services/search-rs` owns "Read-only corpus loading, exact/lexical/vector/rerank retrieval", must not own "Customer/app database access"). |
| D12 | **Test and manifest layout.** Rust unit tests live in `#[cfg(test)]` modules inside the owning ticket's own `src/<area>/**`; Rust integration tests live in `services/search-rs/tests/<area>_*.rs`, owned by file-name prefix. `services/search-rs/Cargo.toml` and `services/search-rs/src/lib.rs` are **module-shared, append-only** — a ticket adds only its own dependency lines, its own `[[bin]]` section and its own single `pub mod <area>;` line. | Breakdown plan §1.1 (tests live inside the owning package; a module's manifests are append-only shared, conflicts resolved by re-running the package manager). Rust has no directory autoload, so the crate root is the same class of artifact as a manifest — see Q-RETR-2. |
| D13 | **Offsets are character offsets into NFC-normalised `canonical_text`, half-open `[start, end)`** — inherited unchanged from `CRPS-01` deliverable 12, never re-derived. Every snippet returned by search is a slice of the stored node text at the returned offsets. | PRD §15.3 *"Citations MUST target DocumentVersion + NodeVersion + exact offsets + source snapshot, never a SearchChunk"*; `SRCH-003` *"Snippet offsets reproduce exact NodeVersion text"*; PRD §34.2. |
| D14 | **Benchmarks and fixtures in this module never read `evals/gold/**`.** `RETR-10` ships its own committed synthetic recall set derived from the `CRPS-08` fixture bundle. | PRD §14.3 *"Blind gold answers MUST remain outside ordinary coding-agent context"*; breakdown plan R9 and §4.2. |
| D15 | **A citation-bearing result identifies `document_version_id` + `node_version_id` + offsets, never a chunk id.** Chunks are an internal retrieval artifact; they may appear in internal diagnostics but never as the identity of a result. | PRD §15.3; §36.4 (`document_version_id`, `node_version_id`, `pinpoint`, `text_offset_base`). |
| D16 | **The local embedding and rerank runtime is Microsoft ONNX Runtime, CPU-only** — a confirmed architecture decision, not a preference this module may revisit. Rust integration is through the `ort` crate at an exact pinned, compatibility-verified version; tokenization is through the Hugging Face `tokenizers` Rust crate at an exact pinned version over a local `tokenizer.json` pinned by the release. Where technically compatible, query embedding and local cross-encoder reranking use the same controlled local-model boundary. Models, tokenizers and runtime metadata are pinned in the corpus/retrieval manifest, and every model artefact carries an immutable revision identifier, hash, dimensions, normalisation, truncation and licence information. **No runtime network access during production inference:** production never pulls a model from Hugging Face or any model hub on demand, and artefacts reach production only through the signed corpus/model release path. If a local model fails to load, the system degrades to lexical search exactly as the PRD already requires — a load failure never triggers an unvalidated hosted fallback. `RETR-07` implements this and pins the exact `ort` patch version after its own compatibility/build smoke test; that implementation pin is **not** a new architectural question. The model **weights** that run inside the runtime are a separate matter and remain Q2. **The consuming side is now concrete.** `CRPS-02` deliverable 12 carries the pins as two shared objects — **`ModelPin`** (`role`, `model_id`, `model_revision`, `model_artifact`, `dimensions`, `normalisation`, `truncation`, `max_tokens`, `tokenizer`, `licence`, `bundle_path`) and **`RuntimePin`** (`family`, `version`, `execution_providers`, `integration` — the `ort` pin —, `tokenizer_library`, `pinned_by`) — with `local_models[]` and `runtime` required members of the release manifest and `model_artifact`/`licence`/`tokenizer.artifact_sha256`/`runtime` added to the embedding manifest. `RETR-05` deliverable 1 transcribes that member list verbatim and carries it; `RETR-07` deliverable 7 verifies it before first use and refuses rather than defaulting. **Model weight bytes are not an additional PRD §18.4 bundle path** (`04-corpus-contract` D15): the manifest pins artefact *identity*, `RETR-07` reads the bytes from a configured local path, and `ModelPin.bundle_path` stays `null` unless that layout change is ever decided at plan or PRD level. | Breakdown plan §8 **Q11** (confirmed architecture decision); PRD §17.3, §18.2, §39.4, §39.6, §45.5; `CRPS-02` deliverable 12 (`ModelPin`/`RuntimePin`) and `04-corpus-contract` sub-PRD **D15** (weights are not a bundle path). `RETR-07` carries the ADR decision input for `docs/adr/NNNN-local-model-runtime.md`; `docs/adr/` is empty and that ADR **does not exist yet** — the Builder authors it at implementation time to record this decision (breakdown plan §1 header, A9). |

## Rejected alternatives

| Rejected | Why |
|---|---|
| **Search reads `app.sqlite`** (for quota, tenant or answer context). | PRD §18.3 *"Search can read only corpus files; it MUST NOT read `app.sqlite`"* and §39.1 *"`services/search-rs` has no credentials/path for `app.sqlite`"*. The admission decisions that need tenant state happen in `apps/api` before the call. |
| **Implement retrieval in TypeScript inside `apps/api`** and drop the Rust process. | PRD §18.2 selects "Rust + Tantivy" and "Rust + USearch"; PRD §39.2 gives `app` 320 MiB and `search` 768 MiB as separate cgroups on a 2 GB host. Folding a memory-mapped index into the API process makes the §39.2 budget unenforceable and takes the API down with an index fault. |
| **Dense-first retrieval (conventional RAG) with filters applied as post-hoc metadata boosts.** | Directly contradicts PRD §17.1's ordering and *"MUST NOT override applicability"*, and PRD §36.2's *"Hard applicability filters run before scoring"*. It is also the failure mode the whole product exists to avoid (PRD §2). |
| **Soft filters — express date/jurisdiction/status/licence as ranking penalties.** | PRD §36.3: *"No learned score may reintroduce a filtered item."* A penalty is a score; a large enough relevance signal always outvotes it. Replaced by D4's type boundary. |
| **Normalise BM25 and cosine into one score and add them.** | PRD §17.1 *"SHOULD combine ranks rather than directly add incompatible BM25/vector scores"*; §36.2 *"no raw-score addition"*. Replaced by D6. |
| **Let a model classify the query and choose identifiers.** | PRD §36.1: *"Rules/checksums parse dates, neutral citations, provision references, award codes, agreement IDs and ABNs before any model classifier. The model may add a candidate interpretation but may not discard a deterministic identifier."* |
| **Publish the internal search wire contract in `schemas/openapi/**`.** | That root is `FND-04`'s serial-owned **public** `/v1` contract (breakdown plan §4.1). The localhost search API is an internal process boundary (PRD §39.4) with no customer visibility; publishing it would make an internal refactor a public API change. The contract lives inside `services/search-rs` (D8). |
| **One "build the retrieval engine" ticket.** | The module would be a single serial lane; breakdown plan §2 makes disjoint write-sets the basis of the cut and §7 requires every module to reach at least two useful lanes. The 10-way split yields 6 waves at concurrency 2. |
| **Have `RETR-10` edit the shipped retrieval profile when its measurements suggest better constants.** | The profile file is `RETR-01`'s (`src/service/**`), and CLAUDE.md/issue #53 make the ticket the spec. `RETR-10` measures, reports and writes back; changing a default is a docs PR against `RETR-01` plus `publish-tickets.mjs --sync`, so the frozen profile `GOLD-15` validates is the one the tickets describe. |
| **Persist the semantic cache into the release bundle.** | PRD §18.4: *"Active data MUST never be rebuilt or mutated in place."* The cache is process-local, rebuildable and bounded; PRD §17.2 *"Embedding eviction MUST NOT remove legal evidence"* holds because evidence lives in `corpus.sqlite`, not in the cache. |
| **Candle, `rten`, or a hosted-only path for local query embedding and reranking.** | Breakdown plan §8 **Q11** confirms Microsoft ONNX Runtime, CPU-only, through the `ort` crate (D16). `RETR-07`'s ADR records the comparison against **Candle**, **`rten`** and a **hosted-only** alternative, with ONNX Runtime accepted. The hosted-only option also fails independently of that comparison: PRD §17.3 puts query embedding and small-set reranking online-local, PRD §39.1/§39.4/§39.6 give the search process no credential and no outbound destination, and `SRCH-001`/PRD §26 require search to work with the model gateway disabled. |
| **Let `CRPS-06` link the Rust indexing code as a library** to build `tantivy/` offline. | Creates a `04 → 11` module edge on top of the existing `11 → 04` edge — a module cycle; `dag-scan.mjs` exits 1 and `/start-all` refuses to run (breakdown plan R6). Replaced by D9's process boundary. |
| **Let `RETR-07` supply its own default for a model, tokenizer or runtime value the release did not pin.** | Breakdown plan §8 **Q11** requires those values to be pinned in the corpus/retrieval manifest, and `CRPS-02` deliverable 12 now provides the members (`ModelPin`, `RuntimePin`). A locally invented default would make a release's behaviour depend on the build that happened to load it, which PRD §21 and PRD §14.4 both forbid. The loader refuses and degrades to lexical search instead (D10, D16); a member that genuinely does not exist is a ticket change against `CRPS-02`, the sole owner of `schemas/corpus-manifest/**` (PRD §44.3). |

## Open questions

None blocks the module's first wave. Each names an owner and the artifact that resolves it. Three
breakdown plan §8 register entries are carried here: **Q4** and **Q2** are *benchmark-selected*
parameters and **Q3** is *deferred until real-scale measurement*. Each is settled by measured evidence
through its named ticket rather than by preference, and none of them is a Founder decision waiting to
be taken. §8 **Q11** — the local embedding and rerank runtime — is a **confirmed** decision recorded
as **D16** above, not an open question here, and an implementing agent must not re-litigate it.

| # | Question | Owner | Resolved by | Blocks | Basis |
|---|---|---|---|---|---|
| **Q4 (plan §8)** | **Retrieval constants — lexical and dense candidate counts, rank-fusion weights, rerank depth, evidence-node counts and the other retrieval-profile constants. Status: benchmark-selected.** Start from the PRD §36.2 buildable initial defaults, tune on **development cases only**, and **freeze before validation and blind testing**. | `11-retrieval-engine` | **`RETR-10`** measures and writes back; a value change lands as a docs PR against `RETR-01` (profile owner), and the final profile is recorded through `RETR-10` and frozen by `GOLD-15` | Nothing — v1 defaults are buildable today (D7) | PRD §36.2 ("tuned on the development set and frozen"), §14.4, §45.5 ("Benchmark-selected configuration") |
| Q2 (plan §8) | **Embedding model and representation — model, tokenizer settings, dimensions, normalisation, distance metric, quantisation, and reranker weights where applicable. Status: benchmark-selected.** Q2 selects the models that execute inside D16's confirmed ONNX Runtime boundary; **Q11's confirmation does not settle Q2**, and the two must not be conflated. | `04-corpus-contract` + `11-retrieval-engine` | `CRPS-05` + `RETR-10` produce the compatibility, recall, latency, memory and resource evidence; `GOLD-15` freezes the promoted profile; every chosen value is pinned in the release manifest | Nothing — the embedding manifest pins whatever is chosen and `RETR-05`/`RETR-07` refuse a mismatch | PRD §14.4, §18.2, §18.4 |
| Q3 (plan §8) | **Always-hot vector count, semantic-cache entry/byte limit, resident memory allocation and the cold/hot tier boundary. Status: deferred until real-scale measurement.** The governing policy is already settled: full lexical corpus coverage is kept, hot dense coverage is reduced before lexical scope, the 2 GB production-host budget holds, every process carries an explicit memory limit, and any dense-coverage downgrade is disclosed rather than silent (D10). Only the numbers await measurement, and the 150k–300k planning hypothesis is never a product commitment. | `18-ops-release` | `RLSE-11` (`blocked_by RETR-10`) measures against the real 2 GB benchmark and records the measured decision | The launch decision to reduce hot dense coverage before lexical scope | PRD §17.2, §36.2, §39.2, §27 |
| **Q-RETR-1** | **Who builds the bundle's `tantivy/` index offline?** The `CRPS-08` fixture ships `tantivy/INDEX_STATE.json = PLACEHOLDER`, so no committed bundle contains a real lexical index. D9 answers it with a second binary of this crate, but the ADR file belongs to `CRPS-06` (breakdown plan A9, `04-corpus-contract` Q-CRPS-2). | `11-retrieval-engine` (`RETR-02`) jointly with `04-corpus-contract` (`CRPS-06`) | `RETR-02` ships the builder and writes back; `CRPS-06` records `docs/adr/NNNN-offline-lexical-index-builder.md` | Nothing — `RETR-02` builds its own index from `corpus.sqlite` in its tests | PRD §18.4, §19.1, §19.3, §45.5 |
| **Q-RETR-2** | The Rust crate root `services/search-rs/src/lib.rs` must declare every module (`pub mod lexical;` …) — Rust has no directory autoload, so it is a shared file inside the module, unlike breakdown plan **A1**'s route autoload. D12 treats it as append-only shared. Is that sufficient under parallel lanes? | `11-retrieval-engine` (`RETR-01` establishes the convention) | Confirmed or falsified by the first concurrent wave (`RETR-02` ‖ `RETR-05` ‖ `RETR-09`) | Nothing — one-line additions, and `/start-all` serialises delivery | Breakdown plan §1.1 (append-only manifests), §2.1 A1, R1 |
| **Q-RETR-3** | The §36.2 eligibility predicate exists twice — `FND-10` (TypeScript, `packages/domain/src/legal/**`) and `RETR-04` (Rust). No `blocked_by` edge exists between them, and a divergence is a silent correctness failure. **ADR candidate** (duplicated cross-language invariant). | `11-retrieval-engine` (`RETR-04`) with `00-foundation` (`FND-10`) | `RETR-04` replays `FND-10`'s committed truth-table fixture and reports parity; a divergence is a writeback to this README **and** `docs/prd/breakdown-plan.md` §4.2, never a local re-interpretation | Nothing — the fixture is committed by `FND-10` deliverable 10, which lands in module 00 wave 3 | PRD §36.2; breakdown plan §4.2, R6 |
| **Q-RETR-4** | The **per-mode permitted status sets** for `CURRENT_LAW` / `HISTORICAL` / `FUTURE_OR_PROPOSED` are not literally in the PRD; `FND-10` records an initial rule as its open question **Q-F5** with the **Founder** as owner. | **Founder** (product ambiguity, PRD §45.5), staged through `00-foundation`/`FND-10` | `FND-10` Q-F5; validated by `21-evaluation-600` | Nothing — the invariants (default = in force at the requested date; future never relabelled current; `STATUS_UNCONFIRMED` never definitive) are fixed and testable now | PRD §6.7, §36.2 |
| **Q-RETR-5** | Effective-interval inclusivity — `FND-10` decides closed-inclusive `[effective_from, effective_to]` (its D12/Q-F4) and `CRPS-01` owns the columns. `RETR-04`'s boundary behaviour must match both. | `00-foundation` (`FND-10`) with `04-corpus-contract` (`CRPS-01`) | `FND-10` Q-F4, confirmed at `CRPS-01` | `UAT-SRCH-03` correctness | PRD §35.2, §15.2 |
| **Q-RETR-6** | Does the internal API need a streaming/pagination cursor for `SRCH-005` timeline and relation reads, or is a bounded page enough at MVP scale? `FIND-02` is the consumer and is `blocked_by RETR-09`, so the shape must be frozen by `RETR-01` (D8). | `11-retrieval-engine` (`RETR-01`), confirmed by `14-search-product` (`FIND-02`) | `RETR-01`; a `FIND-02` requirement the frozen contract cannot express is a writeback to this README and a docs PR against `RETR-01`/`RETR-09` | Nothing before `FIND-02` | PRD §16.2, §34.1, §13.2 (source-node retrieval p95 ≤ 1 s) |

## Work breakdown

Lane is `11-retrieval-engine` and agent is `builder` for all ten tickets (breakdown plan §1.1).
File-scopes are relative to the repository root, are exactly breakdown plan §5.12, and are disjoint
between tickets that can run concurrently. `depends-on` is exactly breakdown plan §5.12.

| Ticket | Size | Lane | File-scope (write-owns) | Depends on |
|---|---|---|---|---|
| [`RETR-01`](tickets/RETR-01-search-rs-skeleton-read-only-bundle-release-pinning-localhost-api.md) — search-rs skeleton: read-only bundle, release pinning, localhost API | L | `11-retrieval-engine` | `services/search-rs/src/main.rs`, `services/search-rs/src/service/**`, `services/search-rs/tests/service_*.rs` | `CRPS-08` |
| [`RETR-02`](tickets/RETR-02-tantivy-lexical-field-citation-index.md) — Tantivy lexical/field/citation index | L | `11-retrieval-engine` | `services/search-rs/src/lexical/**`, `services/search-rs/tests/lexical_*.rs` | `RETR-01` |
| [`RETR-03`](tickets/RETR-03-exact-identifier-retrieval.md) — Exact-identifier retrieval | M | `11-retrieval-engine` | `services/search-rs/src/exact/**`, `services/search-rs/tests/exact_*.rs` | `RETR-02` |
| [`RETR-04`](tickets/RETR-04-hard-legal-filters-pre-scoring-and-pre-pack.md) — Hard legal filters (pre-scoring and pre-pack) | L | `11-retrieval-engine` | `services/search-rs/src/filters/**`, `services/search-rs/tests/filters_*.rs` | `RETR-02` |
| [`RETR-05`](tickets/RETR-05-usearch-dense-index-tiering-quantisation-semantic-cache.md) — USearch dense index, tiering, quantisation, semantic cache | L | `11-retrieval-engine` | `services/search-rs/src/dense/**`, `services/search-rs/tests/dense_*.rs` | `RETR-01`, `CRPS-05` |
| [`RETR-06`](tickets/RETR-06-rank-fusion-and-ranking-feature-order.md) — Rank fusion and ranking feature order | L | `11-retrieval-engine` | `services/search-rs/src/ranking/**`, `services/search-rs/tests/ranking_*.rs` | `RETR-03`, `RETR-04`, `RETR-05` |
| [`RETR-07`](tickets/RETR-07-local-query-embedding-and-rerank-runtime.md) — Local query-embedding and rerank runtime | L | `11-retrieval-engine` | `services/search-rs/src/localmodel/**`, `services/search-rs/tests/localmodel_*.rs`, `docs/adr/NNNN-local-model-runtime.md` | `RETR-05` |
| [`RETR-08`](tickets/RETR-08-evidence-sufficiency-and-evidence-pack-candidate-assembly.md) — Evidence sufficiency and evidence-pack candidate assembly | M | `11-retrieval-engine` | `services/search-rs/src/evidence/**`, `services/search-rs/tests/evidence_*.rs` | `RETR-06` |
| [`RETR-09`](tickets/RETR-09-retrieval-client-typed-client.md) — `packages/retrieval-client` typed client | M | `11-retrieval-engine` | `packages/retrieval-client/**` | `RETR-01`, `FND-04` |
| [`RETR-10`](tickets/RETR-10-retrieval-benchmark-harness.md) — Retrieval benchmark harness (recall@10, memory, startup, p95) | M | `11-retrieval-engine` | `services/search-rs/benches/**`, `services/search-rs/src/bench/**` | `RETR-07`, `RETR-08` |

Standing module-shared exceptions (breakdown plan §1.1 "Package manifests", extended by D12 to the
Rust crate root):

- `services/search-rs/Cargo.toml` — created by `FND-01`; **append-only** inside this module (own
  dependencies and own `[[bin]]` sections only). Regenerate the root `Cargo.lock` as a build artifact
  (`cargo build`), never hand-merge it.
- `services/search-rs/src/lib.rs` — created by `FND-01` as an empty crate root; each ticket appends
  exactly one `pub mod <area>;` line for the directory it owns (D12, Q-RETR-2).
- `packages/retrieval-client/package.json` / `tsconfig.json` — created by `FND-01`; `RETR-09` is the
  only ticket in this module that writes them.

Wave shape (breakdown plan §7: **6 minimum waves, 2 useful lanes, not fully serial**). External
blockers are shown in brackets:

```text
wave 1  RETR-01 [CRPS-08]
wave 2  RETR-02              | RETR-05 [CRPS-05]
wave 3  RETR-03              | RETR-04
wave 4  RETR-06              | RETR-07
wave 5  RETR-08              | RETR-09 [FND-04]
wave 6  RETR-10
```

`RETR-09` has no intra-module blocker beyond `RETR-01` and may run as early as wave 2; it is placed
in wave 5 above only to show a schedule that reaches the 6-wave minimum at concurrency 2.

## Acceptance — what makes the whole module done

The module is done when all ten tickets are delivered (`/verify-delivery` green each) **and**:

1. **`SRCH-001` — search works with the model gateway disabled.** The engine has no hosted-model
   dependency and no provider credential; with `RETR-07`'s local runtime disabled entirely, a natural
   language query, a keyword query and an exact identifier query all return results from the lexical
   and exact stages. (PRD §30.2 `SRCH-001` minimum evidence: *"Search works with model gateway
   disabled"*; PRD §8.2 *"Search MUST remain usable when the AI budget is exhausted"*.)
2. **`SRCH-002` — every result independently passes all hard filters.** A property test over the
   `CRPS-08` fixture asserts that for every result of every generated request, the §36.2 five-conjunct
   predicate evaluated independently on the returned `document_version_id`/`node_version_id` is
   `eligible`, at both filter application points. Future/proposed material never appears in a
   `CURRENT_LAW` result set and is never relabelled current. (PRD §30.2 `SRCH-002`; §36.2;
   `UAT-SRCH-02`.)
3. **`SRCH-003` — snippet offsets reproduce exact NodeVersion text.** Every returned snippet equals
   the substring of the stored NFC-normalised `canonical_text` at the returned character offsets, and
   every result carries pinpoint, legal status, effective interval and the code-generated official
   URL. (PRD §30.2 `SRCH-003`; §34.2 *"`snippet.text` MUST equal the referenced NodeVersion substring
   at the returned offsets"*; §15.3.)
4. **`SRCH-004` — exact matches outrank semantic similarity.** `RETR-10`'s committed exact-match
   regression set passes: for every provision reference, neutral citation, award/agreement identifier
   and valid ABN in the fixture, the exact target is rank 1 and no dense-only candidate displaces it.
   (PRD §30.2 `SRCH-004`; §36.2 *"Always retained if applicable"*; §36.3 feature 1. The API-level
   half of this gate is `FIND-06`.)
5. **`SRCH-005` — historical links survive later releases.** Node, version, timeline and relation
   reads are served from the pinned release with no generation involved, and a request pinned to an
   older loaded release returns that release's text, not the current one. (PRD §30.2 `SRCH-005`;
   §18.5 step 4; `UAT-SRCH-03`.)
6. **PRD §13.2 latency objectives, measured at the search boundary.** `RETR-10` reports, against the
   committed fixture bundle on the reference machine and with the method and machine recorded in the
   report: search **p95 ≤ 2 s** and source-node retrieval **p95 ≤ 1 s**. A goal that cannot be met
   without violating evidence quality, cost or safety is a writeback, not a relaxed filter — PRD
   §13.2 requires the product to "preserve correctness and surface delay/degraded status". (The
   end-to-end HTTP gate over `POST /v1/search` is `FIND-06`, `blocked_by RETR-10`.)
7. **PRD §39.2 / §24 resource budgets.** The search process stays within its **768 MiB** limit with
   the fixture bundle loaded, reports peak RSS and startup time in the `RETR-10` report, and degrades
   dense coverage — never lexical coverage or a hard filter — when the budget is threatened (D10).
   Nothing in this module adds a recurring cost line to the PRD §24.1 A$42–50 budget: no hosted call,
   no object-store read at query time.
8. **Process boundary intact.** A machine check asserts the crate has no path, credential or
   dependency capable of reaching `app.sqlite`, binds only a loopback address, and that no package
   other than `packages/retrieval-client` opens a connection to the search port. (PRD §39.1, §39.4,
   §45.2.)
9. **Every `[machine]`/`[fixture]` item reproduces offline** against the committed `CRPS-08` fixture
   release with no network access: `cargo test --workspace` and `pnpm test` green on the merged
   default branch (PRD §20.3, §45.3).

## Changelog

- **v0.3 — 2026-08-03** — consuming-side alignment with `04-corpus-contract`'s resolved manifest
  schema. `CRPS-02` deliverable 12 now defines the shared **`ModelPin`** and **`RuntimePin`** objects
  and makes `local_models[]` and `runtime` required members of the release manifest, and `CRPS-05`
  deliverable 4 adds `model_artifact`, `licence`, `tokenizer.artifact_sha256` and `runtime` to the
  embedding manifest. `RETR-05` deliverable 1's verbatim transcription of that member list is brought
  up to the current schema and now states which members this module gates on and which it carries for
  `RETR-07`. `RETR-07`'s recorded friction — "the manifest has nowhere to record a value this loader
  must verify" — is **answered** and replaced by an explicit per-member verification table covering
  the runtime family and version, the CPU-only execution providers, the `ort` integration crate pin,
  the `tokenizers` library pin, `pinned_by`, and the model-artefact provenance (revision id, sha256,
  byte size, format, dimensions, normalisation, truncation, max tokens, tokenizer identity and
  licence), with the standing prohibitions kept: never write `schemas/corpus-manifest/**`, never
  invent a local default for a pinned value, never pull a model from a hub at runtime. **D16** records
  that model weight bytes are **not** an additional PRD §18.4 bundle path (`04-corpus-contract` D15) —
  the manifest pins artefact identity and `RETR-07` loads the bytes from a configured local path — and
  a matching rejected-alternative row is added. `RETR-01` deliverable 2 records where `CRPS-02`
  deliverable 10's ninth step (pinning completeness) is covered on the Rust side. Ticket edits:
  `RETR-01`, `RETR-05`, `RETR-07`. No change to module scope, the ticket set, dependency order,
  file-scope allocation, the PRD §13.2 latency targets or the PRD §39.2 memory budgets.
- **v0.2 — 2026-08-03** — aligned with the `docs/prd/breakdown-plan.md` §8 decision register.
  Breakdown plan §8 **Q11** is a confirmed architecture decision — Microsoft ONNX Runtime, CPU-only,
  through an exactly pinned `ort` crate with an exactly pinned Hugging Face `tokenizers` crate — and is
  recorded as decision **D16**; its open-question row is removed and a matching rejected-alternative
  row added. `RETR-07` is rewritten around the confirmed runtime and now carries the full ADR
  **decision input** for `docs/adr/NNNN-local-model-runtime.md`, a file that does not exist yet and is
  authored by the Builder at implementation time. **Q2** and **Q4** are restated as benchmark-selected
  with their evidence path (`CRPS-05`/`RETR-10` → `GOLD-15`, pinned in the release manifest), and **Q3**
  as deferred until real-scale measurement with its already-settled coverage policy (`RLSE-11`); Q2 is
  explicitly **not** settled by Q11. Ticket edits: `RETR-01` (local-model configuration keys, Q3
  status), `RETR-02`, `RETR-05`, `RETR-06`, `RETR-07`, `RETR-08`, `RETR-10`. No change to module scope,
  the ticket set, dependency order, file-scope allocation, the PRD §13.2 latency targets or the PRD
  §39.2 memory budgets.
- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.12 (10 tickets,
  `RETR-01` … `RETR-10`). Records decisions D1–D15, rejects 11 alternatives, carries the breakdown
  plan §8 entries Q2/Q3/Q4/Q11 as they stood at the time, and opens Q-RETR-1 … Q-RETR-6 — two of them
  ADR candidates: the offline lexical index builder (Q-RETR-1, ADR owned by `CRPS-06`) and the
  duplicated cross-language §36.2 predicate (Q-RETR-3).
