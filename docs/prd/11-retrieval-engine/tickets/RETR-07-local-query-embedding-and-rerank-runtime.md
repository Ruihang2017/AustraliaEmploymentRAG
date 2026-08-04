---
id: RETR-07
title: Local query-embedding and rerank runtime
module: 11-retrieval-engine
lane: 11-retrieval-engine
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RETR-05]
blocks: [RETR-10]
---

# RETR-07 — Local query-embedding and rerank runtime

Implements PRD §17.3, §18.2, §14.4, §39.2, §39.6 — requirement IDs `SRCH-001` (search stays usable
without hosted models), `ANS-007` (no unvalidated fallback), supporting `SRCH-004`; epic `E17-INDEX`.
No ADR exists yet — the decision is already made in PRD §17.3 (*"Online local: query embedding,
identifier/date/jurisdiction classification, PII pre-screening and small-set reranking"*), PRD §18.2
(*"Local model runtime | Small pinned embedding/rerank runtime in the search boundary"*) and
breakdown plan §8 **Q11**, the **confirmed architecture decision** that names the runtime the PRD
left unnamed: **Microsoft ONNX Runtime, CPU-only**, through the `ort` crate with Hugging Face
`tokenizers`. This is build ticket 7 of 10 against it. Because `docs/adr/` is still empty (breakdown
plan §1 header), this ticket also **authors** `docs/adr/NNNN-local-model-runtime.md` under breakdown
plan **A9** (per-file ADR ownership by the creating ticket): the ADR **records** the confirmed §8 Q11
decision and the comparison behind it — it does not choose the runtime and may not reopen it.
Parent sub-PRD: [11-retrieval-engine README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RETR-05 — USearch dense index](RETR-05-usearch-dense-index-tiering-quantisation-semantic-cache.md) (mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(the runtime fixed by breakdown plan §8 Q11, the model/tokenizer/runtime pins fixed by `CRPS-02`
deliverable 12, the embedding profile pinned by `CRPS-05`'s manifest and the rerank window defined by
`RETR-06`) — not a new subsystem decision. No technology choice is left open here: the only version
decision is the exact `ort` patch pin, which this ticket records after its own compatibility/build
smoke test, and §8 Q11 states that implementation pin is not a new architectural question.

## Background + basis

**The local/hosted split is a hard boundary, quoted in full.** PRD §17.3:

> - Offline/local: document embeddings, bulk evaluation and large rebuilds.
> - Online local: query embedding, identifier/date/jurisdiction classification, PII pre-screening and
>   small-set reranking.
> - Hosted validated model: Quick legal synthesis.
> - Hosted stronger validated model: Deep synthesis and complex conflict coordination.
> - Hosted reranker: only for approved complex paths when local ranking is insufficient.
>
> No unvalidated fallback is permitted during provider failure or budget exhaustion.

Two of those online-local tasks are **not** this ticket: identifier/date parsing is deterministic and
belongs to `RETR-03` (PRD §36.1 requires rules and checksums *before* any model), and PII
pre-screening is a server-side admission boundary in `packages/pii` (`EVID-01`…`EVID-03`, PRD §37.2)
that runs before a job exists — the search process never sees unsanitized input (PRD §18.5 step 4).
What remains here is **query embedding** and **small-set reranking**.

**The runtime is decided — breakdown plan §8 Q11, a confirmed architecture decision.** The PRD asks
for a *"small pinned embedding/rerank runtime"* and names no library; §8 Q11 now names it. This is
settled: an implementing agent must not re-litigate it, substitute its own preference for it, or treat
it as a suggestion.

- Runtime family: **Microsoft ONNX Runtime, CPU-only.** No GPU execution provider is configured or
  shipped — PRD §19.1's host is 2 vCPU with no GPU.
- Rust integration through the **`ort` crate at an exact pinned, compatibility-verified version**.
- Tokenization through the Hugging Face **`tokenizers` Rust crate at an exact pinned version**, over a
  local `tokenizer.json` **pinned by the release** — never a tokenizer fetched, resolved by hub id or
  inferred at runtime.
- Where technically compatible, query embedding and local cross-encoder reranking use the **same
  controlled local-model boundary**: one loader, one compatibility gate, one footprint accounting, two
  `ModelSpec` kinds.
- Models, tokenizers and runtime metadata are **pinned in the corpus/retrieval manifest**.
- Every model artefact carries an **immutable revision identifier, hash, dimensions, normalisation,
  truncation and licence information**, and the loader verifies them before use.
- **No runtime network access during production inference.** Production never pulls a model from
  Hugging Face or any model hub on demand; artefacts reach production only through the **signed
  corpus/model release path**.
- If a local model fails to load, the system **degrades to lexical search exactly as the PRD already
  requires** (`SRCH-001`, PRD §26, sub-PRD D10). A load failure must **never** trigger an unvalidated
  hosted fallback (PRD §17.3, `ANS-007`).
- This ticket pins the exact `ort` crate patch version after its compatibility/build smoke test
  (deliverable 2). That implementation pin is **not** a new architectural question.

**The manifest has a place for every value this loader must verify.** That was an open friction when
this ticket was first written; `04-corpus-contract` has since resolved it from its own side, and this
ticket now **consumes** the result instead of recording a gap:

- `CRPS-02` deliverable 12 defines two shared objects, referenced by both manifests —
  **`ModelPin`**: `role` (`DOCUMENT_EMBEDDING`, `QUERY_EMBEDDING` or `RERANK`), `model_id`,
  `model_revision`, `model_artifact {sha256, byte_size, format}`, `dimensions`, `normalisation`,
  `truncation`, `max_tokens`, `tokenizer {id, artifact_sha256, max_tokens, truncation}`,
  `licence {identifier, url, attribution_required, redistribution_permitted, notes}` and
  `bundle_path`; and **`RuntimePin`**: `family`, `version`, `execution_providers[]`,
  `integration {crate, version}` (the `ort` pin), `tokenizer_library {crate, version}` (the
  `tokenizers` pin) and `pinned_by`.
- `CRPS-02` deliverable 1 makes `local_models[]` — one `ModelPin` per role the release pins — and
  `runtime` — one `RuntimePin` — **required** members of `release-manifest.json`. `CRPS-02`
  deliverable 2 and `CRPS-05` deliverable 4 add `model_artifact`, `licence`,
  `tokenizer.artifact_sha256` and `runtime` to `embedding-manifest.json`, whose full member list
  `RETR-05` deliverable 1 transcribes.
- `CRPS-02` deliverable 10 step 9 gates pinning completeness release-side, and its deliverable 13 sets
  the severity: a stub or missing pin is **blocking** for a `CANDIDATE`/`PUBLISHED` release and an
  `INFO` finding for a `SYNTHETIC_FIXTURE` one — which is why this module's tests can still load the
  committed `CRPS-08` fixture with stub pins.
- **Model weight bytes are not a bundle path.** `04-corpus-contract` decided (its sub-PRD **D15**,
  `CRPS-02` deliverable 12 and `CRPS-02`'s acceptance checklist) that weights do **not** become an
  additional PRD §18.4 bundle path: the fixed five-entry layout stands, the manifest pins the
  artefact's *identity*, and this loader reads the bytes from a configured local path and verifies
  them against that identity. `ModelPin.bundle_path` exists only so the manifest can express the other
  outcome if that is ever decided at plan or PRD level.

Deliverable 7 states exactly which members this loader verifies and what it does on a mismatch. The
standing prohibitions are unchanged: this module never writes `schemas/corpus-manifest/**`, never
invents a local default for a value the release is meant to pin, and never pulls a model, tokenizer or
runtime artefact from a hub at runtime.

**The runtime decision does not choose the models.** The exact embedding and reranker **weights**
remain breakdown plan §8 **Q2** — benchmark-selected, evidenced by `CRPS-05` and `RETR-10`, frozen by
`GOLD-15` and pinned in the release manifest. Q11 settles what executes a model; Q2 settles which model
executes. The register is explicit that the two must not be conflated.

**The runtime lives inside the search boundary and nowhere else.** PRD §18.2 places the *"Small
pinned embedding/rerank runtime"* in the search boundary; PRD §39.1 gives `services/search-rs` no
credentials beyond the corpus bundle; PRD §39.4 allows the search process no outbound network
destination at all. So: model artefacts load from an explicit local path that the release pins,
inference makes no network call, and there is neither a provider client nor a model-hub client in the
dependency tree. §8 Q11 states the same rule from the decision side.

**The query embedding must match the corpus embedding exactly.** `CRPS-05` deliverable 6 forbids
mixing profiles or runtimes in one index, and PRD §14.4 states *"Embedding changes require a dual
index, retrieval recall/resource comparison and pointer rollback."* `RETR-05` deliverable 3 already
refuses a mismatched query vector; this ticket is the producer that must not create one — it reads the
profile from the bundle's `embedding-manifest.json` (`model_id`, `model_revision`,
`model_artifact {sha256, byte_size, format}`, `licence {…}`,
`tokenizer {id, artifact_sha256, max_tokens, truncation}`, `dimensions`, `normalisation`,
`distance_metric` and `runtime {…}` — the member list `RETR-05` deliverable 1 exposes) together with
the release manifest's `QUERY_EMBEDDING` `ModelPin`, and refuses to embed at all if the loaded local
model does not match.

**Reranking may not override applicability, and may not demote protected candidates.** PRD §17.1:
*"Dense similarity and reranking MAY improve recall/order but MUST NOT override applicability."*
PRD §36.2's table: *"Local rerank candidates | 30 | 50 | Exact/applicable authority cannot be demoted
below safety floor"*. `RETR-06` defines the window and the floor and re-applies the floor after
rerank; this ticket produces a permutation of the window and nothing else — it cannot add, remove or
alter a candidate.

**Everything must work with no model at all.** Requirement `SRCH-001`'s minimum evidence is *"Search
works with model gateway disabled"* and PRD §26 requires *"Search remains available independently of
hosted-generation budget"*. PRD §20.3's CI gates run offline. So the runtime ships a deterministic
**stub** provider (mirroring `CRPS-05`'s `DeterministicStubProvider`, whose manifests record
`model_id: "stub:<seed>"` and a `runtime.family` recorded as a stub) and the entire pipeline must
produce correct, filtered, ranked results with the local runtime absent — with dense recall reduced
and the degradation reported (sub-PRD D10).

**Memory is shared with the index.** PRD §39.2 gives the whole `search` process **768 MiB**, which
must simultaneously hold the Tantivy reader, the memory-mapped vectors, the semantic cache and this
runtime. A model whose resident footprint is not measured cannot be admitted.

**Carried caveat (accepted for the MVP, documented not enforced):** the exact local model **weights**
are **benchmark-selected** (PRD §14.4 profiles `QUERY_EMBEDDING` and `LOCAL_RERANK`; breakdown plan §8
Q1/Q2, promoted at `GOLD-15` once the evidence exists). This ticket ships the confirmed runtime, the
loader, the compatibility and provenance gates and the stub; the weight choice is measured elsewhere
and pinned in the release manifest. The runtime itself is not a caveat — §8 Q11 settles it.

## Goal

Produce `services/search-rs/src/localmodel/**`: the confirmed §8 Q11 local model runtime — ONNX
Runtime, CPU-only, through an exactly pinned `ort` crate with an exactly pinned `tokenizers` crate —
inside the search process, so that it (a) verifies the release's `ModelPin` and `RuntimePin` before
first use and embeds a sanitized query into a vector matching the bundle's embedding profile exactly,
refusing to run on any mismatch; (b) reranks the bounded window `RETR-06` supplies, returning a
permutation only; (c) ships a deterministic stub provider so every test and CI gate runs offline with
no model file; (d) accounts for its own memory and time inside the PRD §39.2 budget, degrading visibly
rather than silently; and (e) records the confirmed decision in `docs/adr/NNNN-local-model-runtime.md`,
which this ticket authors. Completion is mechanically checkable: `cargo test --workspace` is green,
`ort` and `tokenizers` are pinned to exact versions, reported by `RuntimeInfo` and checked
member-by-member against the release's `RuntimePin`, a model whose `ModelPin` members disagree with the
artefact at the configured path refuses to load, a profile-mismatched artefact refuses to embed, the
reranker provably returns a permutation of its input, the pipeline produces correct results with the
runtime disabled, and the ADR exists recording ONNX Runtime as accepted against Candle, `rten` and a
hosted-only alternative, with its consequences.

## Non-goals

- **No hosted model call of any kind**, including a hosted reranker. PRD §17.3 permits one *"only for
  approved complex paths when local ranking is insufficient"*; that path belongs to
  `packages/model-gateway` (`EVID-07`) with its budget and profile controls, and the search process
  has no provider credential (PRD §39.6). A network client in this module is a defect.
- **No manifest schema change and no manifest write** — `CRPS-02` owns `schemas/corpus-manifest/**`
  (PRD §44.3 serial-owned; sole owner). This ticket **consumes** `ModelPin`/`RuntimePin` and verifies
  them; a value it must verify and cannot find is a writeback against `CRPS-02`, never a local default
  and never a schema edit from here.
- **No PII detection or pre-screening** — `12-evidence-safety` (`EVID-01`…`EVID-03`, PRD §37.2). The
  search process receives an already-sanitized query (PRD §18.5 step 4).
- **No identifier, date or jurisdiction parsing** — `RETR-03` (deterministic rules and checksums, PRD
  §36.1). A model may add a candidate interpretation upstream; it may never discard an identifier, and
  no model in this module touches classification.
- **No document embedding, no index build, no re-embedding of corpus text** — `CRPS-05`
  (PRD §17.3 *"Offline/local: document embeddings"*). The `DOCUMENT_EMBEDDING` `ModelPin` is the build
  side's record and is never loaded here.
- **No fusion, feature order, retention or safety floor** — `RETR-06`, which owns the window and
  re-applies the floor after this module's permutation.
- **No model promotion decision** — the **weights** are benchmark-selected (PRD §14.4; breakdown plan
  §8 Q1/Q2), evidenced through `CRPS-05`/`RETR-10` and promoted at `GOLD-15` with founder approval
  *after* the benchmark evidence exists. This ticket runs whatever the release manifest pins.
- **No re-opening of breakdown plan §8 Q11.** Selecting Candle, `rten`, a hosted-only path or any other
  runtime family is not this ticket's to do: Q11 is a confirmed architecture decision. A Builder who
  believes the code falsifies it uses the feedback obligation below — writeback first, code second —
  never a local substitution.
- **No model weights committed to the repository, and none loaded from inside the bundle.** Weights are
  loaded from a configured local path (PRD §39.6 configuration layering); the repository carries only
  the stub; and weight bytes are not a PRD §18.4 bundle path (`04-corpus-contract` D15, deliverable 7).
- **No wire-contract change** — `RETR-01` owns `src/service/contract/**` (sub-PRD D8).

## File-scope (write-owns)

- `services/search-rs/src/localmodel/**` — the runtime abstraction, the pinned loader, the query
  embedder, the reranker, the deterministic stub provider, the compatibility gate, and memory/time
  accounting.
- `services/search-rs/tests/localmodel_*.rs` — this ticket's Rust integration tests (sub-PRD D12).
- `docs/adr/NNNN-local-model-runtime.md` — **created by this ticket** under breakdown plan **A9**
  (`docs/adr/**` is shared-additive with per-file ownership claimed by the creating ticket). The file
  **does not exist yet** and nothing has been implemented against it; the Builder authors it at
  implementation time to record the confirmed breakdown plan §8 Q11 decision (deliverable 1).
- Module-shared, append-only (sub-PRD D12, breakdown plan §1.1): `services/search-rs/Cargo.toml`
  (the runtime dependency and own entries only; regenerate `Cargo.lock` as a build artifact, never
  hand-merge) and `services/search-rs/src/lib.rs` (append exactly `pub mod localmodel;`).

Does not touch:

- `services/search-rs/src/{main.rs,service}/**` — `RETR-01`; `src/lexical/**` — `RETR-02`;
  `src/exact/**` — `RETR-03`; `src/filters/**` — `RETR-04`; `src/dense/**` — `RETR-05` (all merged
  before this starts); `src/ranking/**` — `RETR-06` (concurrent sibling); `src/evidence/**` —
  `RETR-08`; `benches/**`, `src/bench/**` — `RETR-10`. `packages/retrieval-client/**` — `RETR-09`.
- `packages/model-gateway/**`, `packages/pii/**` — `12-evidence-safety`.
- `pipelines/embeddings/**`, `schemas/corpus-manifest/**` — `04-corpus-contract` (PRD §44.3
  serial-owned release manifest; sole owner).
- Any other `docs/adr/*.md` file — each is owned by its own creating ticket (breakdown plan A9);
  in particular `docs/adr/NNNN-offline-lexical-index-builder.md` is `CRPS-06`'s.
- `packages/**`, `apps/**`, `infra/**`, `tests/**`, `evals/**` — other modules per breakdown plan §4.
  `docs/PRD.md` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header). `src/localmodel/**` is written by no other ticket in the plan. The concurrent sibling
in the same wave is `RETR-06` (`src/ranking/**`) — a disjoint directory and test-file prefix; the two
meet only through the profile's rerank window and the safety floor, both defined in `RETR-06`. The
declared blocker `RETR-05` is merged first and supplies the embedding-profile view this ticket must
match. `docs/adr/NNNN-local-model-runtime.md` is a **new file** claimed by this ticket under breakdown
plan A9; no other ticket in any module writes it. Only the two append-only shared files
(`Cargo.toml`, `src/lib.rs`) are touched by more than one ticket, with additive lines only.

## Deliverables

1. **`docs/adr/NNNN-local-model-runtime.md` — authored by this ticket to record the confirmed §8 Q11
   decision.** `docs/adr/` is empty today (breakdown plan §1 header): this ADR **does not exist yet**,
   nothing has been implemented against it, and the Builder writes it at implementation time, **before**
   the runtime dependency is added. It records a decision that is already made — it is not a
   decision-making exercise, and it may not record a different outcome. Required content, which is the
   **decision input** below:

   - **Status: Accepted.** Source: breakdown plan §8 **Q11**, confirmed architecture decision. PRD
     basis §17.3, §18.2, §45.5.
   - **Context.** PRD §17.3 puts query embedding and small-set reranking online-local; PRD §18.2 asks
     for a *"small pinned embedding/rerank runtime in the search boundary"* and names no library; PRD
     §39.1/§39.4/§39.6 give the search process no credential and no outbound network destination; PRD
     §19.1's host is 2 vCPU with no GPU; PRD §39.2 gives the whole search process 768 MiB.
   - **Decision (accepted).** Microsoft **ONNX Runtime, CPU-only**. Rust integration through the **`ort`
     crate at an exact pinned, compatibility-verified version** — this ADR records the exact version
     this ticket verified. Tokenization through the Hugging Face **`tokenizers` Rust crate at an exact
     pinned version**, with a local `tokenizer.json` **pinned by the release**. Where technically
     compatible, query embedding and local cross-encoder reranking use the **same controlled
     local-model boundary**. Models, tokenizers and runtime metadata are **pinned in the
     corpus/retrieval manifest** — concretely, in `CRPS-02` deliverable 12's `ModelPin` and
     `RuntimePin` objects, which this ticket verifies (deliverable 7) and never writes. Every model
     artefact carries an **immutable revision identifier, hash, dimensions, normalisation, truncation
     and licence information**. **No runtime network access during production inference** and no
     on-demand pull from Hugging Face or any model hub — artefacts reach production only through the
     **signed corpus/model release path**. If a local model fails to load, the system **degrades to
     lexical search** exactly as the PRD already requires, and a load failure **never** triggers an
     unvalidated hosted fallback.
   - **Alternatives compared**, all four recorded with their trade-offs against the constraint set
     above:

     | Alternative | Outcome | What the ADR must record |
     |---|---|---|
     | **ONNX Runtime, CPU-only, via `ort`** | **Accepted** | Why it satisfies the constraints — a pinnable CPU-only inference runtime over a stable model format with an exact-version Rust binding and no network dependency at inference — plus the exact `ort`, `tokenizers` and ONNX Runtime versions verified here and the measured binary-size, build-time and memory consequences. |
     | **Candle** | Rejected | Its assessed trade-offs against the same constraints: coverage of the candidate embedding and cross-encoder model formats, CPU-only behaviour on the §19.1 host, pinning and reproducibility, binary size and build time, and maturity for this narrow use. |
     | **`rten`** | Rejected | The same assessment, recorded on the same criteria. |
     | **Hosted-only (a provider performs query embedding and reranking; no local runtime)** | Rejected | That it contradicts PRD §17.3's local/hosted split and PRD §39.1/§39.4/§39.6 (the search process holds no credential and has no outbound destination), and that it would make search depend on hosted availability and budget — which `SRCH-001` (*"Search works with model gateway disabled"*) and PRD §26 forbid. |

   - **Consequences.** Binary size and build time; the PRD §39.2 memory share measured by deliverable 8;
     the licence of the runtime **and** of any model weights (PRD §11.1 discipline applies to
     dependencies too; the weight licence is read off the release's `ModelPin.licence`, not
     remembered); determinism/reproducibility; CPU-only operation on the PRD §19.1 host (2 vCPU,
     no GPU); the rollback path (the deterministic stub provider and the fully-disabled path); and the
     operational consequence that a new model, tokenizer or runtime version is a **release-path change**
     — pinned in the manifest, shipped through the signed release — not a runtime change.
   - **Constraints restated, each traceable to the PRD:** no network at inference (§39.4); no credential
     (§39.6); artefacts loaded from an explicit local path, never downloaded (§19.3, §20.3);
     deterministic output for a fixed input (§14.4 comparability); pinned and reproducible (§18.2
     *"pinned"*).
   - **What the ADR must not do:** re-open Q11, record any runtime other than ONNX Runtime as accepted,
     or name the production model **weights** — those are breakdown plan §8 **Q2**, benchmark-selected
     and promoted at `GOLD-15`.
2. **`src/localmodel/runtime.rs` — the runtime abstraction over the confirmed §8 Q11 runtime.**
   `trait LocalModelRuntime { fn load(spec: &ModelSpec) -> Result<Self>; fn describe(&self) ->
   RuntimeInfo; fn resident_bytes(&self) -> u64; }`, with
   `ModelSpec { kind: QueryEmbedding | Rerank, model_id, model_revision, path: PathBuf,
   tokenizer: TokenizerSpec, dimensions: Option<u32>, normalisation, truncation, max_input_tokens,
   artefact: ArtefactMetadata, licence: LicencePin }`. Every member except the two filesystem paths is
   **read from the release's `ModelPin`** (`CRPS-02` deliverable 12): the release says *what* the
   artefact is, configuration says only *where the bytes are* (deliverable 9). The supporting types
   mirror the pin member-for-member so a reviewer can compare them side by side:
   `ArtefactMetadata { revision_id, sha256, byte_size, format }` ← `ModelPin.model_artifact` plus
   `ModelPin.model_revision`; `TokenizerSpec { id, artifact_sha256, max_tokens, truncation,
   path: PathBuf }` ← `ModelPin.tokenizer` plus the configured path;
   `LicencePin { identifier, url, attribution_required, redistribution_permitted, notes }` ←
   `ModelPin.licence`. `describe()` returns `RuntimeInfo { kind, runtime_family, runtime_version,
   execution_providers, ort_version, tokenizers_version, model_id, model_revision, artefact_sha256,
   tokenizer_artifact_sha256, licence_identifier, pinned_by }` — the values actually in force, so every
   number `RETR-10` reports is attributable to an exact runtime build **and** to an exact pinned
   artefact, and so deliverable 7's checks can be read field-by-field against the release's
   `RuntimePin`. (`RETR-10` deliverable 6 consumes `kind`, `model_id`, `runtime_family`,
   `runtime_version` and `ort_version`; the remaining members are additive and change no report
   member.) Two implementations ship:
   - **`OnnxRuntime`** — the confirmed decision: Microsoft ONNX Runtime with the **CPU execution
     provider only**, driven from Rust through the **`ort`** crate, tokenizing through the Hugging Face
     **`tokenizers`** crate. Both crates are declared in `services/search-rs/Cargo.toml` with **exact**
     version requirements (`=x.y.z` — never a caret or a range), and this ticket records the exact
     `ort` patch version it verified by build and compatibility smoke test on the breakdown plan §8 Q12
     toolchain. No GPU/CUDA/DirectML provider is enabled (PRD §19.1: 2 vCPU, no GPU). The session is
     built from the artefact at `spec.path`; nothing is resolved by hub id and nothing is fetched.
   - `DeterministicStub`, a seeded hash-based implementation whose `RuntimeInfo.kind` is `"stub"` and
     whose `model_id` is `stub:<seed>` — the exact convention `CRPS-05` deliverable 2 uses, so a
     stub-produced vector can never be mistaken for a real one.
3. **`src/localmodel/embed.rs::QueryEmbedder`** —
   `embed_query(&self, sanitized_query: &str, profile: &EmbeddingProfileView) -> Result<QueryVector>`:
   1. **compatibility gate first** — deliverable 7's pin verification must have passed for the
      release's `QUERY_EMBEDDING` `ModelPin`, and the loaded model's `model_id`, `model_revision`,
      tokenizer id, `max_tokens`, truncation policy, `dimensions`, `normalisation` and
      `distance_metric` must equal the bundle's `embedding-manifest.json` values (`RETR-05`
      deliverable 1). Any difference is a typed `ProfileMismatch` error and **no vector is produced**
      (PRD §14.4; `CRPS-05` deliverable 6);
   2. tokenise with the pinned `tokenizers` crate over the **release-pinned `tokenizer.json`**, whose
      bytes are verified against `ModelPin.tokenizer.artifact_sha256` before first use, using the
      manifest's declared settings and applying the manifest's truncation policy
      (`head` / `tail` / `error`) rather than a local default — a tokenizer resolved by hub id,
      downloaded, or inferred from the model file is a defect (breakdown plan §8 Q11);
   3. produce the vector, applying the manifest's `normalisation`;
   4. return `QueryVector { values, profile_fingerprint, elapsed_ms }` so `RETR-05` can re-check the
      fingerprint at the index boundary.
   Determinism: the same query and model produce a byte-identical vector across processes.
4. **`src/localmodel/rerank.rs::Reranker`** —
   `rerank(&self, query: &str, window: &[Ranked], budget: RerankBudget) -> Result<Permutation>`:
   - the return type is a **permutation of the input indices**, not a candidate list: this module
     cannot add, remove, alter or re-score a candidate, and `RETR-06`'s `enforce_floor` runs afterwards
     (PRD §36.2 safety floor; §17.1 *"MUST NOT override applicability"*);
   - the window is at most `profile.rerank_candidates` (v1 default **30**, hard ceiling **50**,
     PRD §36.2) — a larger window is rejected, not truncated silently;
   - `RerankBudget { max_millis, max_pairs }` bounds the work; on exhaustion the reranker returns the
     **identity permutation** with a `Degraded` marker rather than a partial reordering
     (a half-reranked list is neither the original order nor a better one);
   - the model is the release's `RERANK` `ModelPin`, verified by deliverable 7. A release that pins no
     `RERANK` entry means no local reranker: the identity permutation, `Unavailable` reported, never a
     substituted model.
5. **Text handling.** The reranker sees candidate text only through `RETR-01`'s corpus reader, bounded
   per candidate by a configured character cap, and **never sees a candidate whose `PermittedUse.display_text`
   is false** (`RETR-04` deliverable 7) — a metadata-only candidate is passed through in its original
   relative order. Basis: PRD §11.1 licence limits apply to machine use of the text as well as display.
6. **Degradation and availability (sub-PRD D10).** `LocalModelState::{Ready, Stub, Unavailable{reason}}`:
   with `Unavailable`, `RETR-05`'s dense stage is skipped (no query vector) and rerank is the identity
   permutation, while exact, lexical, filtering, fusion and evidence assembly all continue. The state
   appears in `/health/ready`'s capability report and in every response's `warnings`, and `reason`
   names the failing pin member when deliverable 7 is what refused. A search that silently returns
   worse results because a model failed is prohibited — PRD §13.2 requires surfacing *"delay/degraded
   status"*.
7. **No fallback substitution, and no unpinned artefact.** PRD §17.3: *"No unvalidated fallback is
   permitted during provider failure or budget exhaustion."* If the pinned model cannot load, the
   runtime reports `Unavailable` and the pipeline degrades to lexical search exactly as `SRCH-001` and
   PRD §26 already require; it never loads a different model, a different revision or a different
   quantisation, never reaches for a hosted model, and never downloads anything. A test asserts there
   is no code path that selects a model not named in `ModelSpec`.

   **Pin verification (breakdown plan §8 Q11; `CRPS-02` deliverable 12).** Model artefacts reach
   production only through the **signed corpus/model release path** (PRD §18.4) — never from Hugging
   Face or any model hub at runtime. This loader reads `release-manifest.json`'s `local_models[]` and
   `runtime`, and `embedding-manifest.json`, **only** through `RETR-01`'s already-verified
   `ReleaseBundle` (PRD §21: trust an artifact only after signature/hash/compatibility verification),
   the same way `RETR-05` deliverable 1 reads the embedding manifest; it never verifies a bundle itself
   and never reads an unverified directory. It then selects its `ModelPin` **by `role`** and verifies
   every member below **before first use**:

   | Pinned member | Verified against | On absence or mismatch |
   |---|---|---|
   | `runtime.family` | the runtime family this build embeds (`RuntimeInfo.runtime_family` — ONNX Runtime, the confirmed §8 Q11 decision) | refuse: this build executes no other family, and it never silently executes the one it happens to have |
   | `runtime.version` | the ONNX Runtime version linked into this build (`RuntimeInfo.runtime_version`) | refuse |
   | `runtime.execution_providers[]` | the providers the session actually registers — CPU only | refuse; a release pinning a GPU provider is wrong for the PRD §19.1 host (2 vCPU, no GPU) and is never silently downgraded to CPU |
   | `runtime.integration {crate, version}` | the **`ort`** crate and the exact `=x.y.z` version this build links (`RuntimeInfo.ort_version`, deliverable 2) | refuse |
   | `runtime.tokenizer_library {crate, version}` | the Hugging Face **`tokenizers`** crate and the exact version this build links (`RuntimeInfo.tokenizers_version`) | refuse |
   | `runtime.pinned_by` | nothing local — it is the provenance of the pin itself. The loader requires it present and non-empty and reports it through `RuntimeInfo`, so every `RETR-10` number traces back to the verification record the pin came from | refuse a pin with no provenance |
   | `local_models[].role` | the stage being loaded — `QUERY_EMBEDDING` for deliverable 3, `RERANK` for deliverable 4 | if the release pins no entry for that role the stage does not run: `Unavailable{reason}` naming the role. Never substitute another role's entry; the `DOCUMENT_EMBEDDING` pin is the build side's and is never loaded here |
   | `model_id`, `model_revision` | the identity in `ModelSpec` and the artefact the configuration points at | refuse. `model_revision` is §8 Q11's **immutable revision identifier**: a mutable tag, an empty value or a different revision is a refusal, never a "nearest available" |
   | `model_artifact.sha256`, `model_artifact.byte_size` | the file at the configured path, hashed in streaming blocks **before** a session is created | refuse |
   | `model_artifact.format` | a format this runtime build can execute | refuse rather than attempt |
   | `dimensions` | for `QUERY_EMBEDDING`: the embedding manifest's `dimensions` **and** the length of the vector actually produced on the first embed. `RERANK` pins `null` (no vector output), and a rerank model that produces one is a defect | `ProfileMismatch`, no vector (deliverable 3) |
   | `normalisation`, `truncation`, `max_tokens` | applied exactly as pinned, in deliverable 3 steps 2–3 | refuse; there is no local normalisation, truncation policy or token limit to fall back to |
   | `tokenizer {id, artifact_sha256, max_tokens, truncation}` | the `tokenizer.json` at the configured path, hashed and compared to `artifact_sha256`, with `id` compared to the pin | refuse. The tokenizer is never resolved by hub id, never downloaded, never inferred from the model file |
   | `licence {identifier, url, attribution_required, redistribution_permitted, notes}` | presence and completeness; the values are reported through `RuntimeInfo` and the diagnostics so the PR's licence statement and the ADR's consequences are read off the release rather than remembered | refuse a missing or empty `identifier`, under PRD §11.1's conservative default |
   | `bundle_path` | expected `null` — see below; it is never used to locate weights inside the release directory | `null` is **not** a defect and never a reason to refuse |

   **"Refuse" means exactly one thing here:** the model is not loaded, `LocalModelState::Unavailable`
   carries a `reason` naming the member that failed, the stage is skipped and the pipeline degrades to
   lexical search with the degradation surfaced (deliverable 6) — never a substituted value, never a
   partial load, never a hosted fallback (PRD §17.3, `ANS-007`).

   **Which artefact the hash belongs to.** The query-side artefact and the build-side artefact may
   legitimately be different files — `CRPS-05`'s feedback obligation anticipates a differently exported
   query artefact. So the artefact hash this loader verifies is the **`QUERY_EMBEDDING` `ModelPin`'s**,
   never `embedding-manifest.json`'s `model_artifact.sha256`, which describes the file that produced the
   indexed vectors. What must agree across both is the **representation** — `dimensions`,
   `normalisation`, `truncation`, `max_tokens` and tokenizer identity — plus the `runtime` object, which
   must be equal in `release-manifest.json` and `embedding-manifest.json`. `CRPS-02` deliverable 10
   step 9 already gates all of that release-side; this loader re-checks it in Rust for the same reason
   `RETR-01` re-implements `verify_bundle()` — PRD §21 trusts an artifact after verification **here**,
   not after verification somewhere else. A disagreement is `Blocking` and produces no vector.

   **Weight bytes do not ship inside the bundle.** `04-corpus-contract` decided (its sub-PRD **D15**)
   that model weights do **not** become an additional PRD §18.4 bundle path: the five-entry layout
   stands, the manifest pins artefact *identity*, and this loader reads the bytes from the configured
   local path (`RETR-01` deliverable 1's `local_model.model_path` / `tokenizer_path`) and verifies them
   against that identity. Therefore `ModelPin.bundle_path` is `null` in every release this ticket loads;
   a `null` is expected, is never a defect, and nothing here assumes a weight or tokenizer file exists
   inside the release directory. `bundle_path` exists only so the manifest can express the other outcome
   if it is ever decided at plan or PRD level — and that decision would add a path to PRD §18.4's fixed
   layout, which is a plan/PRD writeback (`CRPS-02`'s feedback obligation), never something this ticket
   implements speculatively. A release that arrives with a non-null `bundle_path` therefore means the
   decision was taken elsewhere: follow the feedback obligation rather than loading from the bundle.

   **Standing prohibitions, unchanged.** This ticket never writes `schemas/corpus-manifest/**` (PRD
   §44.3 serial-owned by `04-corpus-contract`); never invents a local default for any value the release
   is meant to pin — an absent or unverifiable pin yields `Unavailable`/`ProfileMismatch` and lexical
   degradation, not a guess; and never pulls a model, tokenizer or runtime artefact from Hugging Face or
   any model hub at runtime. If a value this loader must verify still has no member after `CRPS-02`
   deliverable 12, that is a writeback naming **`CRPS-02`** (see Feedback obligation), never a local
   default and never a parse-around.
8. **Memory and time accounting.** `LocalModelFootprint { resident_bytes, load_millis,
   embed_p95_millis, rerank_p95_millis }`, sampled at load and per N calls, reported into the response
   diagnostics and consumed by `RETR-10`. The runtime declares a configured share of PRD §39.2's
   768 MiB; exceeding it moves the state to `Unavailable` with a logged reason rather than letting the
   process approach the cgroup limit (PRD §39.2 *"Swap MUST NOT be used to hide sustained working-set
   failure"*).
9. **Configuration** (via `RETR-01`'s `SearchConfig` deliverable 1, read-only from here): the local
   model artefact path, the `tokenizer.json` path, the enable flags for embedding and rerank
   independently, the budget values, and the memory share. Configuration supplies **where the bytes
   are**; the release supplies **what they must be** (deliverable 7), and there is no configuration key
   that overrides, relaxes or substitutes a pinned value. There is **no** key for a model-hub id, a
   download URL, a mirror or a credential, and none may be added (PRD §39.6; breakdown plan §8 Q11).
   Defaults are **stub for tests and CI, disabled in a bundle whose `capabilities().dense` is false**,
   so no CI gate ever needs a model file (PRD §20.3).
10. **`src/localmodel/README.md`** — one page: the confirmed runtime (ONNX Runtime, CPU-only) with the
    exact `ort`, `tokenizers` and ONNX Runtime versions in force; what runs locally and why nothing
    hosted may; how to point at a release-pinned artefact and tokenizer; how to run with the stub; the
    compatibility and provenance gates, including the deliverable 7 member table and the fact that
    weights live at a configured local path rather than inside the bundle; the degradation states; and
    a link to the ADR.

## Acceptance checklist (classified)

- [ ] `[human]` **The ADR faithfully records the confirmed decision**:
      `docs/adr/NNNN-local-model-runtime.md` exists, carries Status **Accepted** citing breakdown plan
      §8 **Q11**, states the decision as §8 Q11 states it (ONNX Runtime CPU-only; pinned `ort`; pinned
      `tokenizers`; release-pinned `tokenizer.json`; models, tokenizers and runtime metadata pinned in
      the manifest; artefact revision/hash/dimensions/normalisation/truncation/licence; no runtime
      network access; degradation to lexical search with no unvalidated hosted fallback), compares
      **ONNX Runtime, Candle, `rten` and a hosted-only alternative** with ONNX Runtime recorded as
      accepted, and carries the consequences listed in deliverable 1. The reviewer's judgment is
      whether the ADR **records** the decision faithfully — not whether to re-take it. This is the
      module's one irreducibly human item (PRD §45.5 "Architecture decision"). **Not required to merge
      if the orchestrator defers ADR acceptance**, but the file must exist and the ticket may not close
      without it.
- [ ] `[machine]` **Exact pins, and the release agrees with them**: `services/search-rs/Cargo.toml`
      declares `ort` and `tokenizers` with exact `=x.y.z` requirements (no caret, no range),
      `Cargo.lock` agrees, `RuntimeInfo` reports the ONNX Runtime version together with both crate
      versions and the release's `runtime.pinned_by`, and loading refuses a release whose
      `runtime.family`, `runtime.version`, `runtime.integration.version` (the `ort` pin) or
      `runtime.tokenizer_library.version` (the `tokenizers` pin) differs from what this build links —
      one test per member. (Breakdown plan §8 Q11 and Q12; PRD §18.2 *"pinned"*; `CRPS-02`
      deliverable 12)
- [ ] `[machine]` **CPU-only**: the build enables no GPU execution provider, a test asserts the created
      session registers only the CPU provider, and a release whose `runtime.execution_providers` names
      a provider this build does not register is refused rather than silently downgraded. (PRD §19.1;
      breakdown plan §8 Q11)
- [ ] `[machine]` **Artefact provenance and metadata, against the release's `ModelPin`**: loading
      refuses when `model_id`, `model_revision`, `model_artifact.sha256`, `model_artifact.byte_size`,
      `model_artifact.format`, `dimensions`, `normalisation`, `truncation`, `max_tokens`,
      `tokenizer.id`, `tokenizer.artifact_sha256` or `licence` is absent from the pin or disagrees with
      the artefact at the configured path — one test per member; the tokenizer is loaded from the
      release-pinned `tokenizer.json` and verified by `tokenizer.artifact_sha256`, never from a hub id
      or a model-file default; and a `bundle_path` of `null` loads normally, since weight bytes are not
      a PRD §18.4 bundle path. (Breakdown plan §8 Q11; `CRPS-02` deliverable 12 and sub-PRD D15;
      PRD §18.4, §11.1)
- [ ] `[machine]` No network, no credentials: a dependency-tree assertion finds no HTTP client, cloud
      SDK or provider client in this module's dependency closure, and a source scan finds no URL, host
      name or credential field. (PRD §39.4, §39.6, §17.3)
- [ ] `[machine]` No download path and no model hub: a test asserts model loading fails cleanly when
      `path` does not exist and never attempts to fetch; a filesystem-only loader is asserted by
      running the test with the network stack unavailable; and a dependency/source scan finds no
      model-hub client and no code path that resolves a model or tokenizer by hub id. (PRD §19.3,
      §20.3; breakdown plan §8 Q11)
- [ ] `[machine]` **Profile gate**: a model whose `model_id`, `model_revision`, tokenizer id,
      `max_tokens`, truncation, `dimensions`, `normalisation` or `distance_metric` differs from the
      bundle's `embedding-manifest.json` produces `ProfileMismatch` and **no vector** — one test per
      differing field. (PRD §14.4; `CRPS-05` deliverable 6; `RETR-05` deliverable 3)
- [ ] `[machine]` Determinism: the same query embedded twice in separate processes yields a
      byte-identical vector; the stub provider is seeded and reproducible. (PRD §14.4)
- [ ] `[machine]` **Rerank is a permutation**: a property test over ≥10,000 windows asserts the output
      is a permutation of the input indices — same multiset, same length — and that no candidate field
      is mutated. (PRD §17.1; §36.2 safety floor)
- [ ] `[machine]` Window bounds: a window larger than `profile.rerank_candidates` is rejected, and a
      profile above the PRD §36.2 hard ceiling of 50 is rejected at load. (PRD §36.2)
- [ ] `[machine]` Budget exhaustion returns the **identity** permutation with a `Degraded` marker, never
      a partial reordering. (Deliverable 4)
- [ ] `[machine]` Licence respect: a candidate whose `PermittedUse.display_text` is false is never
      passed to the reranker's text input and retains its relative order. (PRD §11.1; `RETR-04`
      deliverable 7)
- [ ] `[fixture]` **`SRCH-001` with the runtime off**: with `LocalModelState::Unavailable`, the full
      pipeline over the `CRPS-08` fixture still returns correctly filtered, exactly-matched and
      lexically ranked results, with the degradation named in `warnings` — asserted for the same query
      set used with the stub. (PRD §30.2 `SRCH-001`; §26; sub-PRD D10)
- [ ] `[machine]` No unvalidated fallback: a test asserts there is no code path that loads a model not
      named in `ModelSpec` — no "nearest available", no revision drift, no automatic quantisation
      change — and that a role the release does not pin (`QUERY_EMBEDDING` or `RERANK` absent from
      `local_models[]`) yields `Unavailable` naming that role, never a substituted entry from another
      role. (PRD §17.3 *"No unvalidated fallback is permitted"*; `ANS-007`; `CRPS-02` deliverable 12)
- [ ] `[fixture]` **PRD §13.2 / §39.2 budgets**: query embedding p95 ≤ **150 ms** and rerank p95
      ≤ **400 ms** at a 30-candidate window, measured over 200 runs with the stub **and**, where a real
      model is available in the reviewer's environment, with that model — the two stages' share of the
      §13.2 search p95 ≤ 2 s composite `RETR-10` measures end to end. `LocalModelFootprint.resident_bytes`
      and `load_millis` recorded and reported so the runtime's share of the 768 MiB process limit is
      attributable, and the configured share is enforced (exceeding it yields `Unavailable`, not an
      OOM). Numbers, method and machine recorded in the PR. (PRD §13.2, §39.2, §24.1)
- [ ] `[machine]` No model weights are committed: a repository scan asserts no file over 1 MiB and no
      known weight-file extension exists under `services/search-rs/src/localmodel/**`. (PRD §20.2;
      repository-size discipline)
- [ ] `[machine]` `cargo test --workspace` green (Rust; PRD §45.3).
- [ ] `[machine]` `pnpm test` green (standing item, breakdown plan §1.1).
- [ ] `[machine]` PR states requirement IDs `SRCH-001`, `SRCH-004`, `ANS-007`; model/token/cost impact
      (none — no hosted call, no recurring cost against the PRD §24.1 A$42–50 budget); memory/latency
      impact (measured above); source/licence impact (the ONNX Runtime, `ort` and `tokenizers` licences
      **and** any model-weight licence, read off the release's `ModelPin.licence` and recorded in the
      ADR); the exact pinned `ort`, `tokenizers` and ONNX Runtime versions; rollback path (stub
      provider / runtime disabled); known gaps including the benchmark-selected model **weights**
      (breakdown plan §8 Q1/Q2, promoted at `GOLD-15` once the evidence exists — the runtime itself is
      settled by §8 Q11). (PRD §45.4)
- [ ] `uv run pytest` not applicable — this ticket touches no Python.

## Test plan

All steps run offline against the committed `CRPS-08` fixture bundle, an index built by `RETR-02`'s
builder and a stub vector index from `RETR-05`'s test helper; no network, no model download. Tests use
the **stub** runtime by default; a real model is exercised only if the reviewer's environment provides
one at a configured path, and its absence never fails the suite.

1. `cargo test -p search-rs localmodel` then `cargo test --workspace`. Integration tests live in
   `services/search-rs/tests/localmodel_*.rs`. Construction pattern to copy: `RETR-05`'s
   `tests/dense_state.rs` for the three-state availability shape, and `CRPS-05`'s stub-provider tests
   for the seeded determinism approach.
2. Isolation: a session fixture that makes outbound sockets fail; the whole module's tests must pass
   with it active. Plus the `cargo metadata` dependency assertion and a source scan for URLs.
3. Profile gate: parametrised over each mismatching field, asserting `ProfileMismatch` and no vector;
   plus a release that pins no `QUERY_EMBEDDING` entry, asserting `Unavailable` naming the role and no
   substitution of the `DOCUMENT_EMBEDDING` pin.
4. Determinism: embed the same query in two processes and compare bytes; repeat with two stub seeds to
   confirm the seed actually varies the output.
5. Permutation: property test over ≥10,000 generated windows (including duplicates, single-element and
   empty windows) asserting the multiset equality and field immutability.
6. Budget exhaustion: a runtime configured with `max_millis = 0` returns the identity permutation with
   `Degraded`.
7. Licence: construct a window mixing full-text and metadata-only candidates; assert the metadata-only
   ones never reach the text input and keep their relative order.
8. Degraded pipeline: run the fixture query set with the runtime `Unavailable` and assert result
   correctness (filters, exact matches, lexical order) plus the warning; diff against the stub run to
   show only dense recall differs.
9. Budgets: `tests/localmodel_budget.rs` measures embed/rerank p95, resident bytes and load time, and
   asserts the configured memory share is enforced by driving the footprint past it.
10. Suite green: `cargo test --workspace` and `pnpm test` from the repository root.
11. Pins and provenance: `tests/localmodel_pins.rs` asserts the exact `=x.y.z` requirements for `ort`
    and `tokenizers`; that `RuntimeInfo` reports them together with the ONNX Runtime version, the
    registered execution providers and the release's `runtime.pinned_by`; that only a CPU execution
    provider is registered; that a release whose `runtime.family`, `runtime.version`,
    `runtime.integration.version`, `runtime.tokenizer_library.version` or `runtime.execution_providers`
    disagrees with this build is refused with that member named; and that a `ModelPin` with a missing or
    mismatched `model_revision`, `model_artifact.{sha256, byte_size, format}`, `dimensions`,
    `normalisation`, `truncation`, `max_tokens`, `tokenizer.{id, artifact_sha256}` or `licence` is
    refused — one case per member. Pins are supplied as literal test data (the pattern `CRPS-05`'s
    `runtime_pin_fixture` uses) so no test depends on what is installed on the machine, a
    `bundle_path` of `null` is asserted to load normally, and a test asserts no artefact is ever read
    from inside the bundle directory.
12. Reviewer focus: read the ADR first and confirm it **records** breakdown plan §8 Q11 rather than
    re-deciding it — ONNX Runtime accepted, with Candle, `rten` and a hosted-only alternative compared,
    the deliverable 1 consequences present, and a licence statement for the runtime and for the
    weights. Then confirm the pins are exact and reported; confirm deliverable 7's checks compare
    against the **release**, not against a constant compiled into this build, and that nothing is
    defaulted, inferred or skipped when a pin member is absent; confirm no code path can load an
    unnamed, unpinned or hub-resolved model or tokenizer; confirm the manifests are read only through
    `RETR-01`'s verified `ReleaseBundle`; confirm the reranker cannot change a candidate; confirm the
    compatibility gate covers every manifest field, not just dimensions; confirm the fully-disabled path
    is genuinely exercised rather than assumed.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/11-retrieval-engine/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *No local runtime can meet the PRD §39.2 memory share alongside the indexes* → do **not** respond
     by shrinking the Tantivy reader or the corpus coverage. Record the measurement in
     `docs/adr/NNNN-local-model-runtime.md` (consequences) and
     `docs/prd/11-retrieval-engine/README.md`; the product-level fallback PRD §39.2 sanctions is
     reducing hot vector coverage and cache (breakdown plan §8 Q3 — deferred until real-scale
     measurement and resolved by `RLSE-11`), and the honest end state
     is `LocalModelState::Unavailable` with dense recall degraded and surfaced — which PRD §13.2
     explicitly prefers over a quiet quality loss.
   - *The runtime cannot be made deterministic* (threading, SIMD paths, floating-point drift) → record
     it in the ADR's consequences and in `docs/prd/11-retrieval-engine/README.md`, and weaken the test
     to a tolerance-based comparison **only** with that written record — `RETR-10`'s recall measurement
     and `GOLD-15`'s non-regression comparison both assume reproducibility, so a non-deterministic
     runtime changes their meaning.
   - *The query embedding cannot match the corpus profile* (for example the manifest's tokenizer is not
     available locally) → the answer is `ProfileMismatch` and a degraded dense stage, never an
     approximate vector. Record the case in `docs/prd/11-retrieval-engine/README.md` and raise it
     against `CRPS-05` (the profile's producer) and breakdown plan §8 Q2.
   - *A pinned value this loader must verify has no member in `ModelPin`/`RuntimePin`* → the schema now
     carries the §8 Q11 pins (`CRPS-02` deliverable 12; `local_models[]` and `runtime` are required
     members), so this is the residual case only: something genuinely needed that those two objects
     still cannot express. Record the gap in `docs/prd/11-retrieval-engine/README.md` and raise the
     ticket change against **`CRPS-02`** — the sole owner of `schemas/corpus-manifest/**` (PRD §44.3),
     whose own feedback obligation anticipates exactly this and adds the member under a minor
     `manifest_version` bump, with `CRPS-05`/`CRPS-06` following in the same docs PR — **before**
     writing code. Never invent a local default for a value the release is supposed to pin, never parse
     around a missing member, and never write `schemas/corpus-manifest/**` from this module.
   - *A release's pins and this build disagree* (a `runtime.integration.version` that is not the linked
     `ort` version, a `runtime.family` this build does not implement, an artefact hash that does not
     match the file at the configured path) → that is neither a writeback nor a code change: it is the
     refusal deliverable 7 specifies. Report `Unavailable` with the disagreeing member named, degrade to
     lexical, and route the release-side correction to `CRPS-06`, which supplies the pins to the build
     through its `BuildRequest`. Never relax a check to make a release load.
   - *Model weight bytes are wanted inside the release bundle* → that adds a path to PRD §18.4's fixed
     five-entry layout and is a **plan/PRD-level change**, not a ticket change (`04-corpus-contract`
     sub-PRD **D15**; `CRPS-02`'s feedback obligation). `ModelPin.bundle_path` exists so the manifest can
     express that outcome once it is decided; until then weights load from the configured local path and
     this ticket implements no bundle-resident loading path. Stop and write back to
     `docs/prd/breakdown-plan.md` and `docs/prd/04-corpus-contract/README.md` first.
   - *Local reranking is insufficient and a hosted reranker looks necessary* → PRD §17.3 allows one
     *"only for approved complex paths"*, and it does **not** belong in the search process. That is a
     ticket change for `12-evidence-safety` (`EVID-07`, the model gateway) plus a new edge in
     `docs/prd/breakdown-plan.md` §5.13 and §6.2, and it requires founder approval under PRD §14.4.
     Never add a network client to `services/search-rs`.
   - *A candidate model's weights carry an unclear licence* → PRD §11.1's conservative default applies
     to dependencies and to weights: do not ship it. Record the assessment in the ADR's consequences
     and route the **weight** choice to `GOLD-15` (breakdown plan §8 Q2), or run stub-only until a
     licence-clean artefact exists. The variable here is the weights, never the runtime family; the
     ONNX Runtime, `ort` and `tokenizers` licences are recorded in the ADR in their own right.
   - *The pinned `ort` or `tokenizers` version cannot be built or linked on the pinned toolchain*
     (breakdown plan §8 Q12: Rust `1.97.1`) → pinning a different **patch** version of the same crate
     after a compatibility/build smoke test is exactly what §8 Q11 delegates to this ticket: record the
     verified version in the ADR and in the PR. Because the release pins the same values
     (`runtime.integration.version`, `runtime.tokenizer_library.version`), a rebuilt release must carry
     the verified version too — that is `CRPS-06`'s build input, not a local override here. Changing the
     **runtime family** is not delegated — that is the falsified-protocol path below.
3. **Falsified protocol.** Breakdown plan §8 **Q11 is confirmed**: it may not be re-litigated,
   substituted for a preference, or treated as a suggestion. If the implementation genuinely falsifies
   it — ONNX Runtime cannot run CPU-only inside the PRD §39.2 share on the PRD §19.1 host, or the
   `ort`/`tokenizers` stack cannot be pinned reproducibly at all — then **stop**. Do not switch to
   Candle, `rten` or a hosted path locally. Escalate for re-review and write back to
   `docs/prd/breakdown-plan.md` §8 Q11 plus this sub-PRD and this ticket **first**; the code follows the
   writeback, never the reverse. The honest interim state is `Stub` or `Unavailable` with lexical search
   intact, which PRD §13.2, PRD §26 and `SRCH-001` already sanction. The same rule applies one level up:
   if the PRD §17.3 local/hosted split itself turns out to be unworkable — for instance if query
   embedding cannot run inside the search boundary at all on the PRD §19.1 host — then PRD §18.2's stack
   row and the module's dense retrieval design are falsified, and the writeback target is the same.
   Never move an online model call outside the search boundary without the model gateway's budget,
   profile and validation controls — that is precisely the *"unvalidated fallback"* PRD §17.3 prohibits.
