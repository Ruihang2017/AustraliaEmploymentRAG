---
id: RETR-05
title: USearch dense index, tiering, quantisation, semantic cache
module: 11-retrieval-engine
lane: 11-retrieval-engine
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RETR-01, CRPS-05]
blocks: [RETR-06, RETR-07]
---

# RETR-05 — USearch dense index, tiering, quantisation, semantic cache

Implements PRD §17.2, §18.2, §18.4, §39.2 — requirement IDs `SRCH-001` (recall support), `SRCH-003`
(dense hits resolve to exact NodeVersion offsets); epic `E17-INDEX` (read half).
No ADR — the decision is already made in PRD §18.2 (*"Dense vector index | Rust + USearch,
quantised/memory-mapped where benchmarked"*) and PRD §17.2 (the five index tiers and the bounded
semantic cache); this is build ticket 5 of 10 against it.
Parent sub-PRD: [11-retrieval-engine README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RETR-01 — search-rs skeleton](RETR-01-search-rs-skeleton-read-only-bundle-release-pinning-localhost-api.md), [CRPS-05 — Embedding build pipeline and embedding manifest](../../04-corpus-contract/tickets/CRPS-05-embedding-build-pipeline-and-embedding-manifest.md) (mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(the vector artifact and embedding manifest produced by `CRPS-05`) — not a new subsystem decision.

## Background + basis

**Dense retrieval is selective, and that is deliberate.** PRD §17.2: *"The complete eligible corpus
receives metadata/lexical/field/citation discovery. Tier 1 receives full dense indexing; Tier 2
selective/on-demand dense indexing; Tier 3 no default embedding. Long-tail lexical hits MAY populate a
bounded semantic cache. Embedding eviction MUST NOT remove legal evidence."* The five tiers are
`TIER_1_FULL_SEMANTIC`, `TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC`, `TIER_3_METADATA_AND_ON_DEMAND`,
`EXCLUDED_LICENSING`, `QUARANTINED_QUALITY`; `CRPS-04` assigns them and exposes
`is_eligible_for_dense()`, true only for Tier 1 and the selective Tier 2 subset.

**Dense never overrides applicability.** PRD §17.1: *"Dense similarity and reranking MAY improve
recall/order but MUST NOT override applicability."* Every dense candidate passes through `RETR-04`'s
predicate exactly like every other candidate; this stage produces candidates, not conclusions.

**The memory budget is the design constraint, not an afterthought.** PRD §39.2 gives the `search`
process **768 MiB** and states the ordering rule for pressure: *"If the search process exceeds its
limit, reduce always-hot vector coverage/cache before removing lexical corpus coverage. Swap MUST NOT
be used to hide sustained working-set failure."* PRD §17.2's planning baseline is *"approximately
150,000–300,000 always-hot semantic chunks"* against *"600,000–1,000,000 structurally consolidated
online search chunks"* — hypotheses that *"MUST be replaced by measured corpus statistics"*. The
always-hot count and the cache size are breakdown plan §8 **Q3**, *deferred until real-scale
measurement*: the governing policy is already settled — keep full lexical corpus coverage, reduce hot
dense coverage before lexical scope, respect the 2 GB production-host budget, give every process an
explicit memory limit, and disclose any dense-coverage downgrade rather than letting it happen
silently — and only the numbers (always-hot vector count, semantic-cache entry/byte limit, resident
allocation, cold/hot tier boundary) await measurement. Owner `18-ops-release`, resolved by `RLSE-11`;
this ticket builds the mechanism and reports the measurements that decide them. The 150k–300k figure
stays a planning hypothesis and is never a product commitment.

**The vector artifact's contract is already fixed by `CRPS-05`.** Its deliverable 3 writes vectors
into the USearch index file with `vector_key = f"{search_chunk_id}"`, one entry per chunk, in the
deterministic order `(node_version_id, chunk_ordinal)`; its deliverable 4 emits
`embedding-manifest.json` with `manifest_version`, `profile_id`, `model_id`, `model_revision`,
`model_artifact {sha256, byte_size, format}`,
`licence {identifier, url, attribution_required, redistribution_permitted, notes}`,
`tokenizer {id, artifact_sha256, max_tokens, truncation}`, `dimensions`, `quantisation`,
`normalisation`, `distance_metric`, `runtime {family, version, execution_providers,
integration {crate, version}, tokenizer_library {crate, version}, pinned_by}`, `built_at`,
`builder_version`, `input_contract_version`,
`tier_selection {tiers, chunk_count, embedded_count, skipped_count}`,
`vector_file {path, sha256, byte_size, count}`, `determinism {seed, deterministic}` and
`source_release_id | null`. The `model_artifact`, `licence`, `tokenizer.artifact_sha256` and `runtime`
members are the breakdown plan §8 **Q11** pins: `CRPS-02` deliverable 12 defines them as the shared
`ModelPin`/`RuntimePin` objects, `CRPS-02` deliverable 1 makes `local_models[]` and `runtime` required
members of `release-manifest.json` as well, and `RETR-07` is the consumer that verifies them before it
loads anything. Its deliverable 6 forbids mixing profiles or runtimes in one index: *"mixing two
profiles or two runtimes in one `vectors.usearch` is a blocking error"*, because PRD §14.4 requires
*"Embedding changes require a dual index, retrieval recall/resource comparison and pointer
rollback."*

**A stub index must be visibly a stub.** `CRPS-05` deliverable 2 ships a `DeterministicStubProvider`
whose manifest records `model_id: "stub:<seed>"` and a `runtime.family` recorded as a stub, and
`CRPS-08` deliverable 3 permits the fixture's `vectors.usearch` to be a zero-count placeholder with
`vector_file.count == 0`. `RETR-01` deliverable 3 already turns that into `capabilities().dense ==
false`. This ticket must honour that: **a placeholder is not an empty index**, and dense
unavailability degrades the response rather than silently returning nothing.

**Degradation is directional (sub-PRD D10).** When the vector artifact is missing, incompatible or
too large for the budget, the dense stage reports degraded and the pipeline continues on lexical and
exact results. PRD §13.2: *"If a goal cannot be met without violating evidence quality, cost or
safety, the product MUST preserve correctness and surface delay/degraded status."* PRD §26 requires
*"Search remains available independently of hosted-generation budget"*, and PRD §39.2 makes lexical
coverage the last thing to go.

**Carried caveat (accepted for the MVP, documented not enforced):** the embedding model, dimensions,
tokenizer settings, normalisation, distance metric, quantisation and any reranker weights are
**benchmark-selected** (PRD §1, §14.4; breakdown plan §8 **Q2** — `CRPS-05` and `RETR-10` produce the
compatibility, recall, latency, memory and resource evidence, `GOLD-15` freezes the promoted profile,
and every chosen value is pinned in the release manifest). This ticket must therefore read every one of
those values from the embedding manifest and refuse a mismatch, rather than compiling any of them in.
The *runtime* those models execute in is a separate and settled matter: breakdown plan §8 **Q11**
confirms ONNX Runtime, CPU-only (sub-PRD D16), implemented by `RETR-07`. Q11 does not settle Q2, and
the two must not be conflated.

## Goal

Produce `services/search-rs/src/dense/**`: a memory-mapped USearch reader over a verified bundle's
`vectors.usearch`, gated by the embedding manifest's declared profile and by `CRPS-04`'s dense tier
eligibility; a dense retrieval stage bounded by `profile.dense_candidates` that maps vector keys back
to `search_chunk` → `node_version` identities; a bounded LRU semantic cache for long-tail lexical
hits; and an explicit memory-accounting and degradation path that keeps the process inside its PRD
§39.2 budget by reducing dense coverage, never lexical coverage. Completion is mechanically checkable:
`cargo test --workspace` is green, a profile-mismatched query is refused, a zero-count vector file
yields a degraded (not empty) response, every dense candidate resolves to a `node_version_id` whose
tier is dense-eligible, and the reader's resident footprint is measured and reported.

## Non-goals

- **No embedding computation of any kind, offline or online.** Document embeddings are `CRPS-05`
  (PRD §17.3 *"Offline/local: document embeddings"*); the **query** embedding is `RETR-07`
  (`src/localmodel/**`), which is `blocked_by` this ticket. This stage takes a query vector as an
  input and, for tests, a deterministic stub vector.
- **No vector artifact writing.** The bundle is immutable (PRD §18.4). This stage opens
  `vectors.usearch` read-only and never rebuilds it.
- **No embedding manifest schema change** — `CRPS-02` owns `schemas/corpus-manifest/**` (PRD §44.3
  serial-owned). A field this stage needs and cannot find is a writeback.
- **No model, tokenizer or runtime verification.** This stage *carries* the `model_artifact`,
  `licence`, `tokenizer.artifact_sha256` and `runtime` pins it reads (deliverable 1); verifying them
  against an artefact on disk is `RETR-07` deliverable 7, the only ticket in this module that loads a
  model.
- **No tier assignment** — `CRPS-04`. Tier is read from `search_chunk.index_tier`.
- **No §36.2 filtering** — `RETR-04`. Dense candidates are filtered like every other candidate.
- **No fusion, ranking or rerank** — `RETR-06`, `RETR-07`.
- **No hot-vector-count or cache-size decision** — breakdown plan §8 **Q3** (deferred until real-scale
  measurement), owner `18-ops-release`, resolved by `RLSE-11` against the real 2 GB benchmark. This
  ticket supplies the knob and the measurement.
- **No host cgroup or systemd memory limit** — `RLSE-02`. This ticket measures and self-limits; the
  host enforces.
- **No wire-contract change** — `RETR-01` owns `src/service/contract/**` (sub-PRD D8).

## File-scope (write-owns)

- `services/search-rs/src/dense/**` — the USearch reader, manifest/profile compatibility gate, tier
  gate, dense retrieval stage, key→identity resolution, bounded semantic cache, memory accounting and
  degradation policy.
- `services/search-rs/tests/dense_*.rs` — this ticket's Rust integration tests (sub-PRD D12).
- Module-shared, append-only (sub-PRD D12, breakdown plan §1.1): `services/search-rs/Cargo.toml`
  (the USearch dependency and own entries only; regenerate `Cargo.lock` as a build artifact, never
  hand-merge) and `services/search-rs/src/lib.rs` (append exactly `pub mod dense;`).

Does not touch:

- `services/search-rs/src/{main.rs,service}/**` — `RETR-01` (merged before this starts);
  `src/lexical/**` — `RETR-02` (concurrent wave-2 sibling); `src/exact/**` — `RETR-03`;
  `src/filters/**` — `RETR-04`; `src/ranking/**` — `RETR-06`; `src/localmodel/**` — `RETR-07`;
  `src/evidence/**` — `RETR-08`; `benches/**`, `src/bench/**` — `RETR-10`.
  `packages/retrieval-client/**` — `RETR-09`.
- `pipelines/embeddings/**` — `CRPS-05` (this ticket's blocker; read-only from here).
  `pipelines/corpus-builder/**`, `schemas/corpus-manifest/**` — `04-corpus-contract` (PRD §44.3
  serial-owned corpus schema and release manifest; sole owner).
- `packages/**`, `apps/**`, `infra/**`, `tests/**`, `evals/**` — other modules per breakdown plan §4.
  `docs/PRD.md` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header). `src/dense/**` is written by no other ticket in the plan. The concurrent wave-2
sibling is `RETR-02` (`src/lexical/**`) — a disjoint directory and test-file prefix; they meet only at
`RETR-06`, which is `blocked_by` both. Both declared blockers are in other modules or earlier waves
and are merged first: `RETR-01` (this module's wave 1) and `CRPS-05` (`pipelines/embeddings/**`, a
disjoint tree owned by `04-corpus-contract`). Only the two append-only shared files (`Cargo.toml`,
`src/lib.rs`) are touched by more than one ticket, with additive lines only.

## Deliverables

1. **`src/dense/manifest.rs`** — read `embedding-manifest.json` from the verified bundle into
   `EmbeddingProfileView`, whose member list is `CRPS-05` deliverable 4 / `CRPS-02` deliverable 2
   **verbatim**:
   `manifest_version`, `profile_id`, `model_id`, `model_revision`,
   `model_artifact {sha256, byte_size, format}`,
   `licence {identifier, url, attribution_required, redistribution_permitted, notes}`,
   `tokenizer {id, artifact_sha256, max_tokens, truncation}`, `dimensions`, `quantisation`,
   `normalisation`, `distance_metric`,
   `runtime {family, version, execution_providers, integration {crate, version},
   tokenizer_library {crate, version}, pinned_by}`, `built_at`, `builder_version`,
   `input_contract_version`, `tier_selection {tiers, chunk_count, embedded_count, skipped_count}`,
   `vector_file {path, sha256, byte_size, count}`, `determinism {seed, deterministic}`,
   `source_release_id | null`.
   **On any divergence the schema wins** and the divergence is a writeback:
   `schemas/corpus-manifest/**` is PRD §44.3 serial-owned by `04-corpus-contract`, and this module
   transcribes it, never edits it.
   Division of use inside this module: this ticket **gates** on the representation members
   (`profile_id`, `dimensions`, `normalisation`, `distance_metric`, `quantisation`, tokenizer
   settings) and consumes `tier_selection` and `vector_file`; the provenance members
   `model_artifact`, `licence`, `tokenizer.artifact_sha256` and `runtime` — the breakdown plan §8
   **Q11** pins — are parsed and exposed unchanged so `RETR-07` deliverable 7 can verify them against
   the artefact it loads. Parsing a JSON member is not loading a model: this module still has no model
   runtime, no tokenizer library and no network client in its dependency tree.
   Nothing in this module compiles in a model id, a dimension count, a distance metric, a crate version
   or a runtime version — the model values are breakdown plan §8 Q2 and the runtime values are §8 Q11,
   and both are read from the release rather than from this build.
2. **`src/dense/reader.rs::DenseReader::open(bundle: &ReleaseBundle) -> Result<DenseState>`** —
   returns one of three explicit states, never a silent empty index:
   - `Unavailable { reason }` when `capabilities().dense` is false (`vector_file.count == 0`, a
     `stub:` model in a production context, or `vectors.usearch` absent) — `RETR-01` deliverable 3;
   - `Degraded { reason }` when the artifact exists but cannot be used within budget (deliverable 7);
   - `Ready(DenseReader)` otherwise.
   `Ready` memory-maps `vectors.usearch` read-only (PRD §18.2 *"quantised/memory-mapped where
   benchmarked"*), records the mapped byte size and the resident footprint after a warm-up query, and
   never copies the whole index into anonymous memory.
3. **`src/dense/compat.rs::assert_query_profile_compatible(query_profile, manifest) -> Result<()>`** —
   refuses to run a query whose embedding profile fingerprint, `dimensions`, `normalisation` or
   `distance_metric` differs from the manifest's. Basis: `CRPS-05` deliverable 6 (*"mixing two
   profiles or two runtimes in one `vectors.usearch` is a blocking error"*) and PRD §14.4 (*"Embedding
   changes require a dual index"*). A mismatch is a typed error surfaced as a `Blocking` finding, not a
   degraded result: a query vector from the wrong model produces confident nonsense, which is worse
   than no dense results at all. The artefact-identity and runtime-pin checks that sit behind the same
   guarantee are `RETR-07` deliverable 7's, over the members deliverable 1 exposes.
4. **`src/dense/tiers.rs`** — the dense eligibility gate over `search_chunk.index_tier`:
   `TIER_1_FULL_SEMANTIC` always; `TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC` only for the selective
   subset the manifest's `tier_selection.tiers` declares; `TIER_3_METADATA_AND_ON_DEMAND`,
   `EXCLUDED_LICENSING` and `QUARANTINED_QUALITY` never. Basis: PRD §17.2; `CRPS-04`'s
   `is_eligible_for_dense`. A vector key whose chunk is not dense-eligible is a **corpus/manifest
   defect**: it is dropped and counted as `ineligible_vector_keys` in the stage report, and a non-zero
   count is a `Warning` finding.
5. **`src/dense/stage.rs::retrieve_dense(reader, query_vector, request, profile) -> DenseOutcome`** —
   the stage:
   1. runs **after** exact and lexical retrieval (PRD §17.1 order), against the same pinned release;
   2. performs top-k search with `k = profile.dense_candidates` (v1 default **50**, hard ceiling
      **100**, PRD §36.2);
   3. maps each `vector_key` (= `search_chunk_id`, `CRPS-05` deliverable 3) back through
      `search_chunk` to `node_version_id` / `document_version_id` via `RETR-01`'s reader;
   4. deduplicates to **one candidate per `node_version_id`**, keeping the best rank
      (sub-PRD D15 — a chunk is never a result identity);
   5. emits candidates carrying `MatchReason::Dense` and the **rank ordinal only** — the similarity
      score may be carried for diagnostics but must not be consumed by `RETR-06`
      (PRD §17.1/§36.2: rank fusion, no raw-score addition; sub-PRD D6);
   6. returns `DenseOutcome::{Hits, NoHits, Unavailable, Degraded}` so the response can distinguish
      "nothing similar" from "dense not running".
6. **`src/dense/cache.rs` — the bounded semantic cache.** PRD §17.2: *"Long-tail lexical hits MAY
   populate a bounded semantic cache … Embedding eviction MUST NOT remove legal evidence."*
   - capacity `profile.semantic_cache_chunks` (v1 default **10,000**, ceiling "disk benchmark" —
     breakdown plan §8 Q3, `RLSE-11`);
   - LRU eviction, process-local, **never written into the bundle** (PRD §18.4 *"Active data MUST
     never be rebuilt or mutated in place"*; sub-PRD "rejected alternatives");
   - keyed by `(profile_id, search_chunk_id)` so a profile change cannot serve stale vectors;
   - a cache miss or a wholly disabled cache changes recall, never correctness: the evidence text
     lives in `corpus.sqlite` and a cache entry is only a vector. A test asserts that clearing the
     cache changes no candidate's identity, only its presence in the dense candidate list.
7. **`src/dense/budget.rs` — memory accounting and directional degradation (sub-PRD D10).**
   - `DenseFootprint { mapped_bytes, resident_bytes, cache_bytes, vectors_loaded }` sampled after load
     and after each N queries;
   - a configured share of PRD §39.2's 768 MiB process budget (`RETR-01` deliverable 1's
     `memory_budget_bytes`); when the share is exceeded the stage reduces, in this order: **semantic
     cache size → always-hot vector coverage → dense stage off (`Degraded`)** — and **never** signals
     any reduction of lexical coverage, which is not this stage's to reduce. Basis: PRD §39.2 verbatim;
   - every reduction emits a bounded log event and a response `warnings` entry, so degradation is
     visible rather than silent (PRD §13.2, §22).
8. **`src/dense/report.rs`** — `DenseReport { state, k, returned, deduped, ineligible_vector_keys,
   cache_hits, cache_misses, evictions, footprint, elapsed_ms }`, surfaced in `warnings`/diagnostics
   and consumed by `RETR-10`'s benchmark and, through it, by `RLSE-11`'s hot-coverage decision
   (breakdown plan §8 Q3).
9. **Test vector index builder (test-only)** — `src/dense/testing.rs::build_test_index(chunks, dims,
   seed) -> PathBuf`, building a small USearch index from deterministic stub vectors so the whole
   ticket is testable offline against the `CRPS-08` fixture corpus, whose committed `vectors.usearch`
   may legitimately be a zero-count placeholder. This helper is `#[cfg(test)]` or behind a
   `testing` feature and is never compiled into the service binary.
10. **`src/dense/README.md`** — one page: the tier gate, the profile-compatibility rule, the three
    reader states, the degradation order quoted from PRD §39.2, the cache's bounded/rebuildable
    nature, and the statement that dense results never override applicability.

## Acceptance checklist (classified)

- [ ] `[fixture]` Placeholder honesty: opening the committed `CRPS-08` bundle whose
      `embedding-manifest.json` reports `vector_file.count == 0` or a `stub:` model yields
      `DenseState::Unavailable` with a named reason; `/v1/retrieve` returns `degraded: true` with the
      dense stage named and **lexical results still present** — never an empty result set.
      (`CRPS-08` deliverable 3; `RETR-01` deliverable 3; sub-PRD D10)
- [ ] `[machine]` Profile mismatch is refused, not degraded: a query vector whose dimensions,
      normalisation, distance metric or profile fingerprint differ from the manifest yields a
      `Blocking` error and **no dense candidates**. (`CRPS-05` deliverable 6; PRD §14.4)
- [ ] `[machine]` Tier gate: with a test index built over the fixture corpus, every returned candidate's
      chunk tier is dense-eligible; a deliberately injected vector key for a `TIER_3` or
      `EXCLUDED_LICENSING` chunk is dropped and counted in `ineligible_vector_keys` with a `Warning`.
      (PRD §17.2; `CRPS-04`)
- [ ] `[machine]` Bounds: the stage never returns more than `profile.dense_candidates`, and a profile
      exceeding the PRD §36.2 hard ceiling of 100 is rejected at load. (PRD §36.2)
- [ ] `[machine]` Identity: every dense candidate resolves to a `node_version_id` +
      `document_version_id`; no response field exposes a chunk id as a result identity; a node matched
      by three chunks yields one candidate. (Sub-PRD D15; PRD §15.3)
- [ ] `[machine]` Ranks not scores: the candidate contract exposes a rank ordinal, and a test asserts
      the emitted ordering is reproducible without the similarity score. (PRD §17.1, §36.2; sub-PRD D6)
- [ ] `[machine]` Cache semantics: the cache is bounded at `semantic_cache_chunks` and evicts LRU;
      clearing it changes no candidate's identity or eligibility, only dense recall; no cache entry is
      ever written into the bundle directory (asserted by comparing bundle file mtimes and hashes
      before and after a cache-heavy run). (PRD §17.2 *"Embedding eviction MUST NOT remove legal
      evidence"*; §18.4)
- [ ] `[machine]` Directional degradation: driving the footprint past the configured share reduces
      cache, then hot coverage, then disables the dense stage — and emits a visible warning at each
      step; no code path in this module reduces lexical coverage. (PRD §39.2 verbatim; sub-PRD D10)
- [ ] `[machine]` Read-only: `vectors.usearch` is opened read-only and memory-mapped; the bundle
      directory is byte-identical after a full test run. (PRD §18.3, §18.4)
- [ ] `[fixture]` **PRD §13.2 / §39.2 budgets**, measured against a test index of at least 50,000
      stub vectors built from the fixture corpus: dense stage p95 ≤ **250 ms** at `k = 50` over 200
      queries (its share of the §13.2 search p95 ≤ 2 s composite that `RETR-10` measures end to end);
      `DenseFootprint.resident_bytes` recorded and reported so hot-vector coverage can be attributed
      inside the 768 MiB process limit; per-vector resident bytes reported so `RLSE-11` can extrapolate
      the 150k–300k hypothesis (breakdown plan §8 Q3). Numbers, method and machine recorded in the PR.
      (PRD §13.2, §17.2, §39.2, §24.1)
- [ ] `[machine]` No embedding computation: the module contains no model loading, no tokenizer library
      and no network client — asserted by a source scan and a dependency-tree assertion. Parsing the
      manifest's `model_artifact`, `licence`, `tokenizer` and `runtime` members (deliverable 1) is
      reading JSON, not loading a model. (PRD §17.3; the query embedder is `RETR-07`)
- [ ] `[machine]` `cargo test --workspace` green (Rust; PRD §45.3).
- [ ] `[machine]` `pnpm test` green (standing item, breakdown plan §1.1).
- [ ] `[machine]` PR states requirement IDs `SRCH-001`, `SRCH-003`; memory/disk/latency impact (the
      measured footprint, per-vector bytes and stage p95 — the inputs to breakdown plan §8 Q3);
      schema/API compatibility impact (the embedding manifest members consumed); rollback path
      (dense stage disabled leaves search fully functional); known gaps including the benchmark-selected
      embedding profile (Q2) and hot-vector count (Q3). (PRD §45.4)
- [ ] No `[human]` criteria — vector retrieval and budget behaviour are verified mechanically. The
      hot-coverage decision this ticket's measurements feed is **deferred until real-scale
      measurement** and is taken at `RLSE-11` against the real 2 GB benchmark — settled by the evidence
      under an already-fixed policy, not by preference (breakdown plan §8 Q3).
- [ ] `uv run pytest` not applicable — this ticket touches no Python. (`CRPS-05`, the Python producer
      of the artifact it reads, carries that check.)

## Test plan

All steps run offline against the committed `CRPS-08` fixture bundle plus test indexes built into
`tmp_path` by deliverable 9; no network, no model files.

1. `cargo test -p search-rs dense` then `cargo test --workspace`. Integration tests live in
   `services/search-rs/tests/dense_*.rs`. Construction pattern to copy: `RETR-01`'s
   `tests/service_bundle.rs` for fixture handling; `CRPS-05`'s determinism tests for the stub-vector
   approach.
2. States: `tests/dense_state.rs` asserts `Unavailable` for the committed fixture's placeholder vector
   file, `Ready` for a built test index, and `Degraded` when the configured memory share is set below
   the mapped size.
3. Compatibility: build a test index at `dims = 64`, then query with a 128-dimension vector, a
   different `distance_metric` and a different `profile_id`; assert a `Blocking` error and zero
   candidates in each case.
4. Manifest transcription: assert every deliverable 1 member is parsed from the fixture's
   `embedding-manifest.json` into `EmbeddingProfileView` — including `model_artifact`, `licence`,
   `tokenizer.artifact_sha256` and every `runtime` member — against an explicit literal member list in
   the test, so a schema addition that this transcription has not absorbed fails here rather than
   silently in `RETR-07`.
5. Tier gate: build a test index that deliberately includes vector keys for `TIER_3` and
   `EXCLUDED_LICENSING` chunks; assert they are dropped, counted and warned.
6. Identity and dedupe: assert every candidate's `node_version_id` exists in the fixture corpus and a
   multi-chunk node yields exactly one candidate.
7. Cache: fill beyond capacity, assert LRU eviction and bounded size; clear the cache and assert the
   eligible candidate identities are unchanged; hash the bundle directory before and after.
8. Degradation: parametrised over shrinking memory shares, assert the reduction order
   (cache → coverage → off) and that each step emits a warning; assert no code path touches a lexical
   setting.
9. Budget: `tests/dense_budget.rs` builds a ≥50,000-vector stub index, measures stage p95 at `k = 50`,
   resident bytes and per-vector bytes, and prints them for the PR.
10. Suite green: `cargo test --workspace` and `pnpm test` from the repository root.
11. Reviewer focus: confirm the index is genuinely memory-mapped rather than read into memory; confirm
    a profile mismatch **fails** rather than degrading; confirm the cache can never be persisted into
    the bundle; confirm the degradation order matches PRD §39.2 exactly and never touches lexical;
    confirm no similarity score is required by the emitted ordering; confirm the test-only index
    builder cannot be compiled into the service binary; confirm the manifest transcription is complete
    and that no member was dropped because this stage does not use it — `RETR-07` does.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/11-retrieval-engine/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *The emitted `embedding-manifest.json` and this reader disagree on a member* → **the schema wins**
     (`CRPS-02` deliverable 2 owns it; `CRPS-05` deliverable 4 says so explicitly). Record the
     divergence in `docs/prd/11-retrieval-engine/README.md` and raise the ticket change against the
     owning ticket; never parse around a missing field, and never write `schemas/corpus-manifest/**`,
     which is PRD §44.3 serial-owned by `04-corpus-contract`.
   - *The schema gains a member after this ticket's deliverable 1 was written* → the transcription is
     updated by a docs PR against **this ticket** (then `publish-tickets.mjs --sync`), not by a code
     edit that quietly widens the reader. Test plan step 4 is what makes the divergence visible.
   - *USearch cannot be read from Rust with the pinned toolchain, or the artifact `CRPS-05` writes is
     not loadable here* → this is the load-bearing assumption of the `CRPS-05 → RETR-05` edge. Record
     it in `docs/prd/11-retrieval-engine/README.md`, raise it against `CRPS-05` (whose own feedback
     obligation anticipates exactly this), and if the artifact format must change, that is a docs PR on
     both tickets before either side writes code.
   - *Measured per-vector memory makes 150k–300k always-hot vectors impossible inside 768 MiB* → do
     **not** respond by trimming lexical coverage or by loading vectors lazily in a way that breaks the
     latency budget. Record the measurement in `docs/prd/11-retrieval-engine/README.md`, and route the
     coverage decision to breakdown plan §8 **Q3** (`RLSE-11`) — PRD §39.2 already names the correct
     trade: reduce hot vector coverage and cache first.
   - *Quantisation changes recall materially* → quantisation is part of the embedding profile
     (breakdown plan §8 Q2) and is `CRPS-05`'s to emit and `GOLD-15`'s to promote. Report the measured
     recall delta through `RETR-10`; never re-quantise a shipped index inside the search process.
   - *A vector key does not resolve to a chunk* → that is a corpus/manifest integrity defect, not a
     retrieval defect: count it, warn, and file it against `CRPS-05`/`CRPS-06`. Never invent an
     identity for an unresolvable key, and never return a chunk id as a result.
3. **Falsified protocol.** If PRD §17.2's tiered model turns out to be unworkable — for example if
   selective Tier 2 coverage cannot be expressed in one index without mixing profiles — then the
   tiering contract shared with `CRPS-04`/`CRPS-05` is falsified. Stop, escalate for re-review, and
   write back to `docs/prd/breakdown-plan.md` §8 (Q2, Q3) plus this sub-PRD and
   `docs/prd/04-corpus-contract/README.md` before improvising a second index. Never let a dense
   shortcut change which material is retrievable at all — that is lexical's job, and PRD §39.2 protects
   it.
