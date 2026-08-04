---
id: CRPS-05
title: Embedding build pipeline and embedding manifest
module: 04-corpus-contract
lane: 04-corpus-contract
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [CRPS-03, CRPS-04]
blocks: [CRPS-06, RETR-05]
---

# CRPS-05 — Embedding build pipeline and embedding manifest

Implements PRD §17.2, §17.3, §14.4, §18.4 — requirement ID `SRCH-003` (dense recall supporting
evidence retrieval), epic `E17-INDEX` (build half).
No ADR — the decision is already made in PRD §17.3 ("Offline/local: document embeddings, bulk
evaluation and large rebuilds") and §18.4 (the bundle carries `vectors.usearch` and
`embedding-manifest.json`); this is build ticket 5 of 8 against it. The *choice* of embedding model,
tokenizer settings, dimensions and quantisation is **benchmark-selected** (PRD §1, §14.4) and is
breakdown plan §8 **Q2**, evidenced here and by `RETR-10` and frozen by `GOLD-15` — this ticket builds
the mechanism and pins whatever is chosen. The **runtime** that executes a model is a separate,
already-settled question: breakdown plan §8 **Q11** is a confirmed architecture decision (Microsoft
ONNX Runtime, CPU-only, via an exactly pinned `ort` crate) owned by `RETR-07`. **Q11 does not settle
Q2**, and this ticket chooses neither: it records both, as fields, in the manifest.
Parent sub-PRD: [04-corpus-contract README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [CRPS-03 — Chunker and SearchChunk node-boundary rules](CRPS-03-chunker-and-searchchunk-node-boundary-rules.md), [CRPS-04 — Index-tier assignment policy](CRPS-04-index-tier-assignment-policy.md) (mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(chunks from `CRPS-03`, tiers from `CRPS-04`, bundle paths from PRD §18.4, pinning fields from
breakdown plan §8 Q11) — not a new subsystem decision.

## Background + basis

**Embedding is offline work, never production work.** PRD §17.3: *"Offline/local: document
embeddings, bulk evaluation and large rebuilds. Online local: query embedding, identifier/date/
jurisdiction classification, PII pre-screening and small-set reranking."* PRD §19.1: *"Production MUST
NOT compile application code, build large indexes or generate mass embeddings."* PRD §19.3: *"The
local pipeline performs source-adapter development, full fetch/parse, OCR orchestration,
normalisation, embedding, index build, 600-case evaluation, release signing and candidate upload."*

**What gets embedded is decided by tier, not by this pipeline.** PRD §17.2: *"Tier 1 receives full
dense indexing; Tier 2 selective/on-demand dense indexing; Tier 3 no default embedding. Long-tail
lexical hits MAY populate a bounded semantic cache. Embedding eviction MUST NOT remove legal
evidence."* `CRPS-04` exports `is_eligible_for_dense(tier)` as the single definition.

**The stored embedding record is specified.** PRD §35.3, `chunk_embedding`: required columns
*"`search_chunk_id`, `profile_id`, `vector_key`, `dimensions`, `quantisation`"* with the constraint
*"rebuildable; exact profile compatibility"*. PRD §15.1 defines `ChunkEmbedding` as
*"Model/version-specific embedding stored separately from chunk text"*. The model, tokenizer, licence
and runtime pins do **not** live in that table — they live in the manifest (sub-PRD D14, `CRPS-01`).

**The vector artifact and its manifest are bundle members.** PRD §18.4 fixes the layout:
`corpus.sqlite`, `tantivy/`, `vectors.usearch`, `embedding-manifest.json`, `release-manifest.json`;
and the release manifest *"MUST include … schema/parser/chunker/**embedding**/index versions, artifact
hashes …"*. PRD §18.2 names the dense index: *"Dense vector index | Rust + USearch, quantised/
memory-mapped where benchmarked"* — the on-disk USearch file is the cross-language contract between
this pipeline and `services/search-rs` (`RETR-05`, which is `blocked_by` this ticket).

**The manifest is where the model, tokenizer and runtime are pinned — that is a confirmed decision.**
Breakdown plan §8 **Q11**: *"Models, tokenizers and runtime metadata are pinned in the corpus/retrieval
manifest"* and *"Model artefacts must carry an immutable revision identifier, hash, dimensions,
normalisation, truncation and licence information"*, with tokenization *"through the Hugging Face
`tokenizers` Rust crate at an exact pinned version, with a local `tokenizer.json` pinned by the
release"*. `RETR-07` may only consume and verify those values and is forbidden to invent a local
default; `RETR-05`'s profile gate already refuses a mismatched query vector. So the instance this
ticket emits must carry them (deliverables 1, 2 and 4) — the *fields* are fixed by Q11, the *values*
are Q2 (models) and an explicit build input recorded by `RETR-07` (runtime). Nothing here selects a
runtime, downloads a model or reopens Q11.

**Profile changes are governed.** PRD §14.4: `QUERY_EMBEDDING` is a promoted profile; *"A candidate
MUST pass security/cost compatibility, development, frozen validation, blind testing and full
non-regression before promotion. … Embedding changes require a dual index, retrieval recall/resource
comparison and pointer rollback."* And: *"Exact models, tokenizer settings, hot vector count,
release-size/concurrency limits and provider token/time ceilings are benchmark-selected
configuration—not permanent requirements."*

**Memory is the binding constraint.** PRD §19.1: the production host is *"Sydney Lightsail: 2 GB RAM,
2 vCPU, 60 GB system disk + 32 GB attached SSD"* and *"App/worker/search MUST have explicit memory
limits."* PRD §17.2's planning baseline is *"approximately 150,000–300,000 always-hot semantic
chunks"* — a hypothesis that *"MUST be replaced by measured corpus statistics"*. That number, the
semantic-cache limit, the resident memory allocation and the cold/hot boundary are breakdown plan §8
**Q3**, whose status is **deferred until real-scale measurement** and which `RLSE-11` resolves against
the real 2 GB benchmark. The surrounding policy is already settled and this ticket honours it: full
lexical coverage is kept, hot dense coverage is reduced before lexical scope, and any downgrade is
disclosed rather than silent.

**Carried caveat (accepted, documented, not enforced here):** until `GOLD-15` promotes a model
(Q2), the pipeline runs against a **pinned local development embedding model or a deterministic stub
provider**; the manifest records exactly which. Shipping a stub is not a defect — shipping a stub that
is indistinguishable from a real profile in the manifest would be, and `CRPS-06`'s candidate gate
rejects a stub pin outright.

## Goal

Produce the offline embedding build in `pipelines/embeddings/**`: a deterministic, resumable pipeline
that takes the chunks eligible for dense indexing (per `CRPS-04`'s predicate), embeds them with an
explicitly pinned profile, writes a `vectors.usearch` index file plus `chunk_embedding` rows, and
emits an `embedding-manifest.json` that pins the profile, the model artefact, the tokenizer artefact,
the model licence and the runtime metadata exactly enough to reproduce the run and to let a reader
decide compatibility. Completion is mechanically checkable: `uv run pytest
pipelines/embeddings/tests` is green, two runs over the same input with the same profile produce
byte-identical vectors and an identical manifest apart from timestamps, and a profile mismatch is
detected rather than silently tolerated.

## Non-goals

- **No query-time embedding, no vector search, no rerank** — `11-retrieval-engine` (`RETR-05`,
  `RETR-07`). PRD §17.3 splits offline document embedding from online query embedding; `RETR-05` is
  `blocked_by` this ticket and reads the artifact.
- **No runtime selection, no runtime integration, no model loading beyond this build** — breakdown
  plan §8 **Q11** is confirmed and belongs to `RETR-07`, which also records the exact `ort` crate patch
  pin after its own compatibility smoke test. This ticket **records** the runtime pin it was given; it
  never chooses one, never reads it from an installed package or lockfile, and never re-opens Q11.
- **No model promotion decision** — `21-evaluation-600` (`GOLD-15`); breakdown plan §8 Q1/Q2. This
  ticket pins and records; it does not approve.
- **No lexical/Tantivy index** — `CRPS-06` (bundle assembly) and `RETR-02` (read side); see sub-PRD
  open question Q-CRPS-2.
- **No chunking and no tier assignment** — `CRPS-03` and `CRPS-04`. This ticket consumes both.
- **No `schemas/corpus-manifest/**` writes** — `CRPS-02` owns the manifest **schemas**, including
  `embedding-manifest.schema.json` (PRD §44.3 serial-owned; breakdown plan §4.1). This ticket emits a
  conforming **instance**. This ticket is *not* `blocked_by CRPS-02` (breakdown plan §5.5), so it must
  not depend on that file existing: it validates against the schema when present and always satisfies
  the member list in deliverable 4 below. `CRPS-06` — blocked by both — is where instance and schema
  are validated against each other.
- **No release manifest, no signing, no upload** — `CRPS-02`/`CRPS-06`/`CRPS-07`.
- **No hot-vector budget decision** — `RLSE-11` (breakdown plan §8 Q3, deferred until measured). This
  ticket measures and reports; it does not cap coverage.
- **No network access at build time** — PRD §19.3 keeps the pipeline local and PRD §20.3 requires
  reproducible CI. Model weights are a pinned local artifact or a stub, and no model hub is ever
  contacted (breakdown plan §8 Q11).

## File-scope (write-owns)

- `pipelines/embeddings/**` — including `pipelines/embeddings/tests/**` (breakdown plan §1.1: unit and
  integration tests live inside the owning package) and `pipelines/embeddings/pyproject.toml`
  (created empty by `FND-01`; append-only within this module, regenerate the root `uv.lock` as a build
  artifact, never hand-merge).

Does not touch:

- `pipelines/corpus-builder/**` in its entirety — `CRPS-01` … `CRPS-04`, `CRPS-06` … `CRPS-08`.
  In particular `pipelines/corpus-builder/schema/**` and `schemas/corpus-manifest/**` are the PRD
  §44.3 **serial-owned corpus schema and release manifest**: this module (`04-corpus-contract`) is
  their sole owner and no other module may write them; inside the module only `CRPS-01` and `CRPS-02`
  do. This ticket *imports* from `pipelines/corpus-builder` (contracts, chunking, tiering) and writes
  nothing there.
- `services/search-rs/**`, `packages/retrieval-client/**` — `11-retrieval-engine`.
- `pipelines/{ingestion,adapters,evaluation}/**`, `evals/**`, `schemas/**`, `packages/**`, `apps/**`,
  `infra/**`, `tests/**` — other modules per breakdown plan §4. `docs/PRD.md` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header — `phase: 1`). `pipelines/embeddings/**` is created empty by `FND-01` (workspace-member
skeleton) and is written by no other ticket in any module — breakdown plan §4 assigns the whole tree
to `04-corpus-contract`, and within the module only this ticket claims it. The concurrent wave-3
sibling is `CRPS-08` (`pipelines/corpus-builder/fixtures/**`) — a disjoint tree. `CRPS-03` and
`CRPS-04`, whose output this ticket consumes, are merged before it starts (`blocked_by`).

## Deliverables

1. `pipelines/embeddings/src/profile.py` — the pinned profile and the pins that travel with it:
   - `@dataclass(frozen=True) class EmbeddingProfile` with `profile_id: str`, `model_id: str`,
     `model_revision: str`, `tokenizer_id: str`, `max_tokens: int`, `truncation: Literal["head",
     "tail", "error"]`, `dimensions: int`, `quantisation: Literal["none", "int8", "binary"]`,
     `normalisation: Literal["none", "l2"]`, `distance_metric: Literal["cosine", "ip", "l2"]`,
     `batch_size: int`, `seed: int`.
   - `profile_fingerprint(profile) -> str` — stable hash over every **representation** member above;
     recorded in the manifest and in `chunk_embedding.profile_id`'s provenance so "exact profile
     compatibility" (PRD §35.3) is checkable rather than assumed. Deliberately unchanged in scope:
     `RETR-05`/`RETR-07` compare this fingerprint at the index boundary, so it must keep meaning
     "the same representation", not "the same file on disk".
   - `@dataclass(frozen=True) class ModelArtefactPin` with `sha256: str`, `byte_size: int`,
     `format: str`, and `@dataclass(frozen=True) class LicencePin` with `identifier: str`,
     `url: str | None`, `attribution_required: bool`, `redistribution_permitted: bool`,
     `notes: str | None`; plus `tokenizer_artifact_sha256: str` alongside the profile. These carry
     breakdown plan §8 **Q11**'s *"immutable revision identifier, hash, dimensions, normalisation,
     truncation and licence information"* and its release-pinned `tokenizer.json`. They are recorded
     and verified, not fingerprinted, so a query-side artefact exported differently from the build-side
     artefact is caught by an explicit artefact check rather than by a confusing fingerprint mismatch.
   - `@dataclass(frozen=True) class RuntimePin` mirroring `CRPS-02` deliverable 12 exactly —
     `family`, `version`, `execution_providers: tuple[str, ...]`,
     `integration: {crate, version}`, `tokenizer_library: {crate, version}`, `pinned_by`. It is a
     **build input**, supplied by the caller (ultimately `CRPS-06`'s `BuildRequest`, sourced from
     `RETR-07`'s recorded compatibility verification). This module must never infer it from an
     installed package, a lockfile or the environment, and never default it; a missing pin is a typed
     error naming the field.
   - `EMBEDDING_BUILD_VERSION: str` — published as `versions.embedding` in the release manifest
     (PRD §18.4).
2. `pipelines/embeddings/src/provider.py` — the embedding backend behind one interface:
   `class EmbeddingProvider(Protocol): def embed(self, texts: Sequence[str]) -> np.ndarray` plus
   `describe() -> ProviderInfo`. `ProviderInfo` carries the provider `kind`, the `ModelArtefactPin`
   of the artefact actually loaded and the `tokenizer_artifact_sha256` actually used, so the manifest
   records what ran rather than what was requested. Two implementations ship:
   - `LocalModelProvider` — a pinned, locally-available model loaded from an explicit filesystem path
     given by configuration; **no network fetch at build time and no model-hub lookup of any kind**
     (PRD §19.3, §20.3; breakdown plan §8 Q11). It hashes the artefact and the `tokenizer.json` it
     loaded and fails if either disagrees with the declared pin.
   - `DeterministicStubProvider` — a seeded, hash-based pseudo-embedding used by CI and by `CRPS-08`'s
     fixture path. Its `ProviderInfo.kind` is `"stub"`, the manifest records
     `model_id: "stub:<seed>"` and a `runtime.family` recorded as a stub, so a stub-built index can
     never be mistaken for a real one (PRD §14.4 requires the actual model to be recorded), and
     `CRPS-06`'s candidate gate rejects it outright (`CRPS-02` deliverable 13).
3. `pipelines/embeddings/src/build.py::build_embeddings(...) -> EmbeddingBuildResult` — the entry
   point, with this ordering constraint:
   1. select chunks where `CRPS-04`'s `is_eligible_for_dense(tier)` is true (Tier 1, plus the
      selective Tier 2 subset requested by the caller);
   2. deterministically order the selection by `(node_version_id, chunk_ordinal)` — the on-disk vector
      order must not depend on database iteration order;
   3. embed in batches of `profile.batch_size` with bounded peak memory;
   4. write vectors into the USearch index file, `vector_key = f"{search_chunk_id}"`, one entry per
      chunk;
   5. write `chunk_embedding` rows (`search_chunk_id`, `profile_id`, `vector_key`, `dimensions`,
      `quantisation`) through `CRPS-01`'s corpus connection — and nothing else: the artefact, licence
      and runtime pins go to the manifest, never to a corpus column (sub-PRD D14);
   6. emit `embedding-manifest.json`, including the artefact, tokenizer, licence and runtime pins
      reported by `ProviderInfo` and supplied by the caller;
   7. return counts, elapsed time, peak RSS and the output file's sha256/byte size.
   Steps 4–6 are all-or-nothing: a failed run leaves no partial `embedding-manifest.json`
   (write to a temporary path and rename).
4. `embedding-manifest.json` **required members** — identical to `CRPS-02`'s
   `schemas/corpus-manifest/v1/embedding-manifest.schema.json`; on any divergence **the schema wins**
   and the divergence is a writeback (see Feedback obligation):
   `manifest_version`, `profile_id`, `model_id`, `model_revision`,
   `model_artifact` (`{sha256, byte_size, format}`),
   `licence` (`{identifier, url, attribution_required, redistribution_permitted, notes}`),
   `tokenizer` (`{id, artifact_sha256, max_tokens, truncation}`), `dimensions`, `quantisation`,
   `normalisation`, `distance_metric`,
   `runtime` (`{family, version, execution_providers, integration: {crate, version},
   tokenizer_library: {crate, version}, pinned_by}`),
   `built_at`, `builder_version`, `input_contract_version`,
   `tier_selection` (`{tiers: [...], chunk_count, embedded_count, skipped_count}`),
   `vector_file` (`{path, sha256, byte_size, count}`), `determinism` (`{seed, deterministic}`),
   `source_release_id | null`.
   The `model_artifact`, `licence`, tokenizer-artefact and `runtime` members exist because breakdown
   plan §8 **Q11** requires the release to pin them and `RETR-07` to verify them before first use.
   This ticket writes no value for any of them: models are Q2, the runtime pin is an input.
5. **Resumability.** `build_embeddings(..., resume=True)` skips chunks that already have a
   `chunk_embedding` row for the same `profile_id` **and** whose `search_chunk.text_hash` is unchanged;
   a changed `text_hash` forces re-embedding. Rationale: PRD §15.3 chunks are rebuildable and PRD
   §12.1 targets processing a detected change "within a further 24 hours" — at the corpus scale PRD
   §17.2 hypothesises (a planning figure, not a measured one — breakdown plan §8 **Q5**, deferred until
   `GOLD-16` measures it) a full re-embed per change is not viable. A resumed run records
   `resumed_from` in the result (not in the manifest, which describes the final state).
6. **Profile-compatibility guard.** `assert_profile_compatible(conn, profile)` refuses to add vectors
   to an index whose manifest declares a different `profile_fingerprint`, a different
   `model_artifact.sha256`, a different tokenizer artefact or a different `runtime`; mixing two
   profiles or two runtimes in one `vectors.usearch` is a blocking error. Basis: PRD §35.3
   `chunk_embedding` "exact profile compatibility"; PRD §14.4 "Embedding changes require a dual index"
   — two profiles mean two indexes, never one mixed index; breakdown plan §8 Q11 (the pinned values are
   what a consumer verifies against).
7. **Measurement output** — `EmbeddingBuildResult` carries `{embedded_count, skipped_count,
   vector_bytes, peak_rss_bytes, elapsed_seconds, chunks_per_second}` and `build_embeddings` writes a
   `embedding-build-report.json` next to the manifest. This is the measured evidence for breakdown
   plan §8 Q3 (`RLSE-11`'s deferred hot-dense coverage numbers) and Q5 (`GOLD-16`'s deferred corpus
   statistics), and it satisfies PRD §40.8 item 12's discipline ("measured storage, parse time, index
   size and peak memory") applied to the embedding stage. Reported values are measurements; they are
   never written back into the PRD's planning hypotheses by this ticket.
8. `pipelines/embeddings/src/cli.py` — `uv run python -m embeddings build --corpus <path>
   --profile <path> --runtime-pin <path> --out <dir> [--resume]
   [--tiers TIER_1_FULL_SEMANTIC,...]`, exit code non-zero on any blocking condition, including a
   missing or incomplete `--runtime-pin`. No credentials, no network.
9. `pipelines/embeddings/README.md` — one page: what runs offline, how to point at a local model, how
   to supply the runtime pin and where it comes from (`RETR-07`, breakdown plan §8 Q11), how to run
   with the stub provider, and the statement that this pipeline never runs in production (PRD §19.1).

## Acceptance checklist (classified)

- [ ] `[machine]` Only chunks whose tier satisfies `is_eligible_for_dense()` are embedded; Tier 3,
      `EXCLUDED_LICENSING` and `QUARANTINED_QUALITY` chunks produce no vector and no
      `chunk_embedding` row. (PRD §17.2; `CRPS-04` deliverable 5)
- [ ] `[machine]` Determinism: two runs with the same profile, same input and the stub provider
      produce byte-identical `vectors.usearch` and identical manifests apart from `built_at`.
      (PRD §15.3 rebuildable; deliverable 3 step 2)
- [ ] `[machine]` Every required member of deliverable 4 is present in the emitted
      `embedding-manifest.json`, asserted against an explicit literal list in the test — including
      `model_artifact`, `licence`, `tokenizer.artifact_sha256` and every `runtime` member.
      (PRD §18.4; breakdown plan §8 **Q11**)
- [ ] `[machine]` The recorded `model_artifact.sha256` and `tokenizer.artifact_sha256` are the hashes
      of the files actually loaded — asserted by hashing the fixture artefacts independently in the
      test — and a declared pin that disagrees with the loaded file fails the build.
      (Breakdown plan §8 Q11 "immutable revision identifier, hash")
- [ ] `[machine]` A missing or incomplete `RuntimePin` fails the build with a typed error naming the
      field, and a source scan asserts no code path reads a runtime family, version or crate version
      from the environment, an installed package or a lockfile. (Deliverable 1; breakdown plan §8 Q11
      "never a locally invented default")
- [ ] `[machine]` `vector_file.sha256`, `byte_size` and `count` in the manifest match the file on disk
      and the number of `chunk_embedding` rows. (PRD §18.4 "artifact hashes … file hashes/sizes")
- [ ] `[machine]` A stub-built index records `model_id` starting with `stub:`, a stub `runtime.family`
      and `determinism.deterministic = true` — a stub can never be mistaken for a promoted profile,
      and `CRPS-06`'s candidate gate can reject it from the manifest alone. (PRD §14.4;
      `CRPS-02` deliverable 13)
- [ ] `[machine]` `assert_profile_compatible()` blocks a second profile, a different model artefact, a
      different tokenizer artefact or a different runtime writing into an existing index, each with a
      distinct error. (PRD §35.3 "exact profile compatibility"; §14.4 "dual index"; deliverable 6)
- [ ] `[machine]` No `chunk_embedding` column beyond the PRD §35.3 five is written, asserted by
      inspecting the insert statement's column list — the Q11 pins stay in the manifest (sub-PRD D14).
- [ ] `[machine]` Resume: after an interrupted run, `resume=True` embeds exactly the missing chunks;
      changing one chunk's `text_hash` causes exactly that chunk to be re-embedded. (Deliverable 5)
- [ ] `[machine]` A failed run leaves no `embedding-manifest.json` and no partially-written vector
      file at the final path. (Deliverable 3, all-or-nothing)
- [ ] `[machine]` Peak RSS during a 10,000-chunk stub run stays below a declared ceiling asserted in
      the test, and `embedding-build-report.json` records it. (PRD §19.1 "explicit memory limits";
      §40.8 item 12)
- [ ] `[machine]` No network call occurs during a build — asserted by a socket-blocking fixture that
      fails the test on any outbound connection attempt — and a source scan finds no model-hub client
      and no code path that resolves a model or tokenizer by hub id. (PRD §19.3, §20.3; breakdown plan
      §8 Q11)
- [ ] `[fixture]` A committed small corpus fixture (≥1 source group, ≥3 tiers represented,
      ≥1 non-ASCII chunk) builds end-to-end with the stub provider and reproduces the recorded golden
      manifest (excluding timestamps). (PRD §40.8 item 4 discipline: fixtures without customer data)
- [ ] `[fixture]` If `schemas/corpus-manifest/v1/embedding-manifest.schema.json` exists in the
      worktree, the emitted instance validates against it; if it does not exist, the test records a
      skip **with a message naming `CRPS-02`** rather than passing silently. (Non-goals; deliverable 4)
- [ ] `[machine]` `uv run pytest` green (Python; PRD §45.3).
- [ ] `[machine]` `pnpm test` green (standing item, breakdown plan §1.1).
- [ ] `[machine]` PR states requirement ID `SRCH-003`; cost/memory/latency impact (measured embed
      throughput and peak RSS); model/token impact (profile, artefact, licence and runtime pins
      recorded; no hosted calls); rollback path (rebuild from chunks); known gaps including Q2 (model
      not yet promoted) and the deferred Q3/Q5 measurements. (PRD §45.4)
- [ ] No `[human]` criteria — the pipeline is offline and deterministic. The decisions it feeds belong
      elsewhere: hot dense coverage to `RLSE-11` (breakdown plan §8 Q3, deferred until measured) and
      model promotion to `GOLD-15` (Q2, benchmark-selected).
- [ ] `cargo test --workspace` not applicable — this ticket touches no Rust. (`RETR-05`/`RETR-07` cover
      the Rust read side and are `blocked_by`/downstream of this ticket.)

## Test plan

All steps run offline; no network, no credentials, no model download.

1. `uv sync --frozen` then `uv run pytest pipelines/embeddings/tests -q`.
   Harness: pytest. A `corpus_fixture` fixture builds a small corpus database with `CRPS-01`'s
   `create_corpus_database()`, inserts node versions, runs `CRPS-03`'s chunker and `CRPS-04`'s
   `assign_tiers()` — reuse those modules, do not re-implement chunking or tiering in the test. A
   `runtime_pin_fixture` supplies a complete `RuntimePin` as literal test data, so no test ever
   depends on what is installed on the machine.
2. Determinism: run `build_embeddings` twice into two output directories with
   `DeterministicStubProvider`; assert `sha256` equality of the vector files and manifest equality
   after removing `built_at`.
3. Eligibility: construct chunks in all five tiers and assert the embedded set equals the
   `is_eligible_for_dense()` set exactly.
4. Pinning: assert every deliverable 4 member is present; hash the fixture model and tokenizer
   artefacts independently and compare with the manifest; run with a deliberately wrong declared
   artefact hash and assert the build fails; run with an absent and with a partial `RuntimePin` and
   assert the typed error names the missing field.
5. Resume: run with a provider that raises after N batches, then re-run with `resume=True`; assert the
   union equals the full run and no chunk is embedded twice.
6. Profile guard: build with profile A, then attempt profile B into the same output; repeat for a
   changed model artefact, a changed tokenizer artefact and a changed runtime; assert the distinct
   blocking errors.
7. Network isolation: a session-scoped fixture patches `socket.socket` to raise; the whole test module
   runs under it. Plus the source scan for hub clients and hub-id resolution.
8. Memory: run 10,000 stub chunks and assert `peak_rss_bytes` under the declared ceiling
   (measure with `resource.getrusage` / `psutil` — declare the chosen mechanism in the test).
9. Suite green: `uv run pytest` and `pnpm test` from the repository root.
10. Reviewer focus: confirm vector ordering is independent of SQLite row order; confirm the temporary-
    file-then-rename pattern really prevents partial artifacts; confirm nothing writes into
    `pipelines/corpus-builder/**` or `schemas/**`; confirm the stub provider cannot be selected
    implicitly (it must be an explicit flag/parameter, never a fallback when a model is missing) — a
    silent stub fallback would put unusable vectors into a signed release; confirm no pin is defaulted,
    inferred or read from the environment, and that no Q11 pin has leaked into a corpus column.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/04-corpus-contract/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *The emitted manifest and `CRPS-02`'s `embedding-manifest.schema.json` disagree* → the schema
     wins. Fix the instance here; if the schema is wrong, amend **both tickets** in one docs PR. If
     this proves that `CRPS-05` genuinely needs a `blocked_by CRPS-02` edge, that edge goes into
     `docs/prd/breakdown-plan.md` §5.5 **and** §6.2 first — a ticket-only edge desynchronises the plan
     from `dag-scan.mjs`.
   - *There is no way to obtain the `RuntimePin` at build time* (the `ort`/`tokenizers` versions live
     in `services/search-rs/Cargo.toml`, which this module neither owns nor may treat as a source of
     truth) → the pin stays an explicit input; raise a ticket change against **`CRPS-06`** (which owns
     `BuildRequest`) and record it in `docs/prd/04-corpus-contract/README.md`. Never read a lockfile,
     never probe the environment, never default it — breakdown plan §8 Q11 forbids a locally invented
     value for anything the release is meant to pin.
   - *The build-side model artefact is not the same file the query side loads* (a differently exported
     artefact for `QUERY_EMBEDDING`) → do **not** widen `profile_fingerprint` to absorb it. The release
     manifest already carries one `local_models[]` entry per role (`CRPS-02` deliverable 12) and
     `CRPS-06` gates that their representation members agree; record the case in
     `docs/prd/04-corpus-contract/README.md` and, if a member is missing, raise it against `CRPS-02`.
   - *A candidate model's weights carry an unclear or restrictive licence* → PRD §11.1's conservative
     default applies to weights as it does to sources: record the assessment in the `licence` pin and
     do not ship it. The **weight** choice routes to `GOLD-15` (breakdown plan §8 Q2); run stub-only
     until a licence-clean artefact exists. The runtime family is not the variable here — Q11 is
     confirmed.
   - *USearch cannot be written from the pinned Python toolchain, so the vector artifact cannot be
     produced offline here* → this is the same class as sub-PRD open question **Q-CRPS-2** (offline
     index building). Do **not** import `services/search-rs` (module cycle, breakdown plan R6) and do
     not invent a second vector format. Record it in `docs/prd/04-corpus-contract/README.md` (Q-CRPS-2)
     and write an ADR `docs/adr/NNNN-offline-index-builders.md` jointly with `CRPS-06` before any code.
   - *Measured peak memory or throughput makes a full corpus embed impractical on the development
     workstation* → report it via deliverable 7 and record it in
     `docs/prd/04-corpus-contract/README.md` (Q3/Q5, both deferred until measured). The permitted
     response is a documented reduction decision by `RLSE-11` under the settled Q3 policy (hot dense
     coverage reduced before lexical scope, downgrade disclosed), not a silent tier downgrade here
     (PRD §2 forbids silently deleting agreed legal scope).
   - *The promoted model (Q2, `GOLD-15`) has a different tokenizer/dimension contract than
     `EmbeddingProfile` expresses* → extend `EmbeddingProfile` and deliverable 4 in **this ticket**,
     and mirror the change into `CRPS-02`'s schema through a docs PR. Never carry a profile attribute
     that is not in the manifest.
   - *Resume semantics conflict with PRD §14.4's "dual index" requirement during a model change* →
     dual index wins: build a second index rather than resuming into the first. Record the rule in
     `docs/prd/04-corpus-contract/README.md` (Decisions) if the implementation needs to differ from
     deliverable 6.
3. **Falsified protocol.** If PRD §17.3's offline/online split is falsified — for example if embedding
   must happen in the production process — that overturns PRD §19.1 ("Production MUST NOT … generate
   mass embeddings"), the 2 GB host budget and the module boundary between `04` and `11`. Stop,
   escalate for re-review, and write back to `docs/prd/breakdown-plan.md` §3/§4 and this sub-PRD before
   writing code that embeds at runtime. Never move a build stage into production silently.
