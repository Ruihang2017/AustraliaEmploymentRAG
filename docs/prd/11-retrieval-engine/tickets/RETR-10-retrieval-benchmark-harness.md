---
id: RETR-10
title: "Retrieval benchmark harness (recall@10, memory, startup, p95)"
module: 11-retrieval-engine
lane: 11-retrieval-engine
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RETR-07, RETR-08]
blocks: [FIND-06, RLSE-11, GOLD-15]
---

# RETR-10 — Retrieval benchmark harness (recall@10, memory, startup, p95)

Implements PRD §13.2, §17.2, §39.2, §43.3, §14.2, §14.4 — requirement IDs `SRCH-004` (exact-match
regression set), `EVAL-002` (measured inputs to the release gates), `OPS-002` (search latency is
observable); epic `E17-INDEX`, feeding `E32`/`E33`.
No ADR — the decision is already made in PRD §36.2 (*"These are buildable initial defaults, stored in
a versioned retrieval profile. They must be tuned on the development set and frozen for
validation/release"*) and PRD §43.3 (the metric definitions); this is build ticket 10 of 10 against it.
Parent sub-PRD: [11-retrieval-engine README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RETR-07 — Local query-embedding and rerank runtime](RETR-07-local-query-embedding-and-rerank-runtime.md), [RETR-08 — Evidence sufficiency and evidence-pack candidate assembly](RETR-08-evidence-sufficiency-and-evidence-pack-candidate-assembly.md) (mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(the PRD §43.3 metric definitions and the PRD §13.2/§39.2 budgets) — not a new subsystem decision.

## Background + basis

**This ticket produces the numbers three other modules consume.** Its dependents are `FIND-06` (the
API-level latency and exact-match regression gate), `RLSE-11` (the real-scale 2 GB benchmark and the
hot-dense-coverage decision) and `GOLD-15` (model and retrieval profile promotion). Breakdown plan
§8 **Q4** — *retrieval constants*, **benchmark-selected** — names this ticket as the resolver: start
from the PRD's buildable initial defaults, tune on **development cases only**, **freeze before
validation and blind testing**, and record the final profile through `RETR-10` and `GOLD-15`. The
constants in scope are the lexical and dense candidate counts, the rank-fusion weights, the rerank
depth, the evidence-node counts and the other retrieval-profile values. These are settled by measured
evidence rather than preference, and they block nothing: PRD §36.2's initial defaults are buildable
today.

**What is fixed and what is measured.** The local model runtime is not one of the parameters this
harness selects: breakdown plan §8 **Q11** confirms ONNX Runtime, CPU-only, through the pinned `ort`
crate (sub-PRD D16, implemented by `RETR-07`), so every number measured here is attributable to an
exact runtime build and the report records it. What remains measured is the embedding/reranker model
**weights** and representation (§8 **Q2**, frozen at `GOLD-15`) and the retrieval constants (§8 **Q4**,
above).

**The measurable targets, quoted.** PRD §13.2: *"Search latency | p95 ≤ 2 seconds under tested MVP
load"*; *"Source-node retrieval | p95 ≤ 1 second"*; and the clause that governs every failure here:
*"Performance goals are subject to the representative 2 GB production benchmark. If a goal cannot be
met without violating evidence quality, cost or safety, the product MUST preserve correctness and
surface delay/degraded status."* PRD §39.2 gives the `search` process **768 MiB**, "burst up to 2
vCPU", and the ordering rule under pressure: *"If the search process exceeds its limit, reduce
always-hot vector coverage/cache before removing lexical corpus coverage. Swap MUST NOT be used to
hide sustained working-set failure."* PRD §14.2 sets the retrieval gate: *"Retrieval recall@10 |
≥ 90%"*, and PRD §43.3 defines it exactly: *"Required gold nodes with at least one hit in first 10
**eligible** results, macro-averaged by case; ≥90%"*.

**Recall must be measured on eligible results.** "Eligible" is PRD §36.2's predicate, implemented by
`RETR-04` — so a run that scores recall over unfiltered candidates measures the wrong thing and would
reward exactly the behaviour the product forbids. The harness therefore scores the pipeline's final,
filtered output.

**This harness may not touch blind gold.** PRD §14.3: *"Blind gold answers MUST remain outside
ordinary coding-agent context."* Breakdown plan risk **R9** and §4.2 keep `evals/gold/**` away from
ordinary fixtures, and `21-evaluation-600` owns `evals/**` entirely. Sub-PRD decision **D14**
therefore requires this ticket to ship its **own** committed synthetic query set derived from the
`CRPS-08` fixture bundle, with expected node ids taken from that fixture's documented inventory. The
600-case evaluation is `GOLD-02`/`GOLD-17`'s and consumes this harness's *report*, not its query set.

**Measurements must be attributable and reproducible.** PRD §14.4 requires *"retrieval recall/resource
comparison"* for an embedding change and a non-regression comparison before promotion; PRD §43.5's
release evidence pack must contain a *"performance and memory benchmark"*. A number without its
profile id, release id, machine description and method is not evidence.

**A benchmark result is never a licence to weaken a filter.** If a target can only be reached by
relaxing PRD §36.2, by widening a permitted-status set, by indexing licence-restricted material or by
skipping the second filter application, the correct output is a **writeback**, not a code change —
PRD §13.2's own escape clause says preserve correctness and surface degradation. This is stated again
in the Feedback obligation because it is the single most likely way this ticket goes wrong.

**Carried caveat (accepted for the MVP, documented not enforced):** the `CRPS-08` fixture is small
(≤ 20 MiB) and synthetic. Absolute latency and memory numbers from it are **not** the release figures;
they are regression baselines and stage-attribution evidence. The real-scale figures are `RLSE-11`'s
on the 2 GB host with a real bundle (PRD §26 *"2 GB real-scale performance/memory/disk benchmark
passes or hot dense coverage is safely reduced"*). This harness must therefore emit a report shaped to
be re-run at real scale, and must label fixture-scale numbers as such.

## Goal

Produce `services/search-rs/benches/**` and `services/search-rs/src/bench/**`: a committed synthetic
query set over the `CRPS-08` fixture with expected node ids and an exact-identifier regression subset;
a harness measuring recall@10 on eligible results (macro-averaged by case, PRD §43.3), end-to-end and
per-stage latency percentiles, process startup time and peak RSS with per-component attribution; and a
versioned, machine-readable `retrieval-benchmark-report.json` that `FIND-06`, `RLSE-11` and `GOLD-15`
consume. Completion is mechanically checkable: `cargo test --workspace` is green, the harness runs
offline against the committed fixture and emits a schema-valid report, the exact-match regression
subset passes at 100%, and the report records the profile id, release id, method and machine for every
number.

## Non-goals

- **No evaluation cases, gold answers, judge, metrics beyond retrieval, gate enforcement or promotion**
  — `21-evaluation-600` (`GOLD-02`, `GOLD-03`, `GOLD-04`, `GOLD-15`, `GOLD-17`). This harness measures
  retrieval; the seven PRD §43.3 answer-level metrics and the PRD §14.2 gate enforcement are theirs.
- **No access to `evals/**` of any kind** — breakdown plan R9, PRD §14.3. Not even a path reference.
- **No API-level or HTTP benchmark** — `14-search-product`/`FIND-06` (`apps/api/bench/search/**`),
  which is `blocked_by` this ticket and measures the `POST /v1/search` p95 that `SRCH-001`…`SRCH-004`
  are judged on end to end.
- **No host-level or real-scale benchmark, no hot-coverage decision** — `18-ops-release`/`RLSE-11`
  (`infra/deploy/benchmark/**`), also `blocked_by` this ticket. Breakdown plan §8 **Q3** is theirs.
- **No profile change.** This ticket **measures** and **writes back**; the shipped default profile
  lives in `RETR-01`'s `src/service/**` and is changed by a docs PR against `RETR-01`
  (sub-PRD Q4, and the module's rejected alternative "have `RETR-10` edit the shipped profile").
- **No changes to any retrieval stage.** If the harness reveals a defect, the fix is a change to the
  owning ticket's scope, not to `src/bench/**`.
- **No production execution.** The harness is an offline/CI tool; PRD §19.1 keeps benchmarking and
  index building off the production host, and the service binary must not contain it.
- **No network, no model download, no credentials** (PRD §20.3, §39.4, §39.6).

## File-scope (write-owns)

- `services/search-rs/benches/**` — the Cargo benchmark targets (`cargo bench`) and the harness
  entry points.
- `services/search-rs/src/bench/**` — the harness library: the committed query set, the metric
  implementations, the measurement instrumentation, the report model and its JSON Schema.
- Module-shared, append-only (sub-PRD D12, breakdown plan §1.1): `services/search-rs/Cargo.toml`
  (benchmark dependencies as `[dev-dependencies]`, own `[[bench]]` sections only; regenerate
  `Cargo.lock` as a build artifact, never hand-merge) and `services/search-rs/src/lib.rs` (append
  exactly `pub mod bench;`, gated behind a `bench` feature so the harness is not compiled into the
  service binary).

Does not touch:

- `services/search-rs/src/{main.rs,service}/**` — `RETR-01`; `src/lexical/**` — `RETR-02`;
  `src/exact/**` — `RETR-03`; `src/filters/**` — `RETR-04`; `src/dense/**` — `RETR-05`;
  `src/ranking/**` — `RETR-06`; `src/localmodel/**` — `RETR-07`; `src/evidence/**` — `RETR-08` (all
  merged before this starts). `packages/retrieval-client/**` — `RETR-09`.
- `evals/**`, `pipelines/evaluation/**`, `schemas/evaluation/**` — `21-evaluation-600` (blind-gold
  boundary, PRD §14.3, breakdown plan R9). **This ticket must not reference these paths at all.**
- `apps/api/bench/search/**` — `14-search-product` (`FIND-06`). `infra/deploy/benchmark/**` —
  `18-ops-release` (`RLSE-11`).
- `pipelines/**`, `schemas/**`, `packages/**`, `apps/**`, `infra/**`, `tests/**` — other modules per
  breakdown plan §4. `docs/PRD.md` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header). `services/search-rs/benches/**` and `src/bench/**` are written by no other ticket in
the plan. This ticket is the module's final wave (breakdown plan §7: 6 minimum waves) and has no
concurrent sibling inside the module; all nine other `RETR` tickets are merged before it starts,
directly or transitively through `RETR-07` and `RETR-08`. Only the two append-only shared files
(`Cargo.toml`, `src/lib.rs`) are touched by more than one ticket, with additive lines only.

## Deliverables

1. **`src/bench/queryset/**` — the committed synthetic query set**, derived solely from the `CRPS-08`
   fixture inventory (`CRPS-08` deliverable 1) and containing, per case:
   `{ case_id, query, mode, requested_legal_as_at, jurisdictions, expected_node_version_ids[],
   category, why }`. Required coverage, one or more cases each:
   - the four fixture exact identifiers — provision reference, neutral citation, award-like
     identifier, synthetic ABN (the **exact-match regression subset**, `SRCH-004`);
   - natural-language and keyword queries against the fixture's Act-like and guidance-like documents;
   - each of the three fixture time points, so a temporal case fails if point-in-time resolution breaks
     (`UAT-SRCH-03`);
   - a `CURRENT_LAW` case in the presence of the fixture's `ENACTED_NOT_IN_FORCE` document
     (`UAT-SRCH-02`);
   - a case whose only match is licence-`PROHIBITED`, expecting **zero** eligible results;
   - a case expecting zero results for a genuinely absent topic (so "no hits" is distinguishable from
     "broken").
   Expected node ids are transcribed from the fixture, never captured from a run — a baseline recorded
   from current behaviour cannot detect a regression that already exists.
2. **`src/bench/metrics/recall.rs::recall_at_10(results, expected) -> CaseRecall`** — PRD §43.3
   exactly: a case scores 1 if **at least one** required node appears in the **first 10 eligible
   results**, and the reported figure is the **macro average over cases**. Eligibility means the
   pipeline's final filtered output (`RETR-04`), not raw candidates. The implementation also reports
   `recall@1`, `recall@5` and MRR as diagnostics, clearly labelled as non-gate metrics (PRD §14.2 sets
   only recall@10 at ≥ 90%).
3. **`src/bench/metrics/exact.rs` — the exact-match regression check**: for every case in the
   exact-identifier subset, the expected node must be **rank 1**. This is a pass/fail set, not a
   percentage: requirement `SRCH-004`'s minimum evidence is *"Exact-match regression set passes"*, and
   PRD §36.2 says exact identifiers are *"Always retained if applicable"*.
4. **`src/bench/latency.rs` — latency measurement** with fixed warm-up, a configured iteration count,
   and reporting of p50/p95/p99/max for:
   - the end-to-end retrieve path (PRD §13.2 *"Search latency | p95 ≤ 2 seconds"*);
   - the node/version/timeline/relation read path (PRD §13.2 *"Source-node retrieval | p95 ≤ 1
     second"*);
   - the evidence-assembly path (`RETR-08`);
   - **per stage** — exact, lexical, dense, filters, fusion/ranking, local embed, rerank, evidence —
     so a regression is attributable to a ticket rather than to "search". Stage timings come from the
     stage reports the earlier tickets already emit; the harness adds no instrumentation inside their
     scopes.
5. **`src/bench/resources.rs` — memory and startup**:
   - cold start to `/health/ready` in milliseconds, split into verify, open, index-load and warm-up;
   - peak RSS and steady-state RSS after N queries, with **component attribution** from the footprints
     the stages report (`LexicalReader`, `DenseFootprint`, semantic cache, `LocalModelFootprint`) plus
     an unattributed remainder;
   - a declared headroom check against PRD §39.2's **768 MiB** limit, reported as a percentage;
   - per-vector and per-chunk resident bytes, so `RLSE-11` can extrapolate PRD §17.2's 150k–300k
     always-hot hypothesis to real scale (breakdown plan §8 **Q3**).
6. **`src/bench/report.rs` + `src/bench/report.schema.json` — the versioned report.**
   `retrieval-benchmark-report.json` with `report_version`, and:
   `{ generated_at, scale: "FIXTURE" | "REAL", corpus_release_id, release_kind, corpus_counts,
   retrieval_profile: {profile_id, profile_version, values}, embedding_profile: {profile_id, model_id,
   dimensions, quantisation}, local_model: {kind, model_id, runtime_family, runtime_version,
   ort_version}, build: {search_version, index_version},
   machine: {os, cpu_model, cores, ram_bytes}, method: {iterations, warmup, concurrency},
   metrics: {recall_at_10, recall_at_1, recall_at_5, mrr, exact_regression_passed, cases_total,
   cases_failed[]}, latency: {end_to_end, node_read, evidence, by_stage}, resources: {startup_ms,
   peak_rss_bytes, steady_rss_bytes, attribution, headroom_pct, bytes_per_vector, bytes_per_chunk},
   degraded_stages[], warnings[] }`.
   `scale: "FIXTURE"` is mandatory for a run against `CRPS-08` — a fixture-scale number must never be
   mistaken for a release figure (the carried caveat). `local_model.runtime_family`, `runtime_version`
   and `ort_version` come from `RETR-07`'s `RuntimeInfo`, so every latency and memory number is
   attributable to an exact pinned runtime build (breakdown plan §8 Q11). The schema is the interface
   `FIND-06`, `RLSE-11` and `GOLD-15` bind to; changing a member is a docs PR against this ticket.
7. **`benches/retrieval.rs` + a CLI entry** — `cargo bench -p search-rs` for the microbenchmarks and
   `search-bench run --bundle <dir> --queryset <path> --out <report.json> [--iterations N]
   [--profile <path>]` for the reporting run. Non-zero exit on: a failed exact-match regression case, a
   recall@10 below a configured floor, a peak RSS above the configured budget, or a p95 above a
   configured threshold — so CI can gate on it (PRD §20.3 *"Retrieval/evaluation smoke set"*). Every
   threshold is a parameter with a documented default, never a hard-coded literal.
8. **Profile sweep (the Q4 resolver).** `search-bench sweep --parameter <name> --values <list>` runs
   the query set across candidate profile values (candidate counts, fusion `k` and weights, rerank
   depth, evidence-node counts) and emits `retrieval-profile-sweep.json` with recall, latency and memory
   per value. It sweeps **development material only** — this ticket's committed fixture query set — and
   never validation or blind material, which is also why it may not touch `evals/**` (deliverable 10;
   PRD §14.3). **The sweep never writes a profile**: its output is evidence for the writeback that
   amends `RETR-01`'s shipped defaults through a docs PR, and for `GOLD-15`'s freeze before validation
   and blind testing (breakdown plan §8 Q4; sub-PRD "rejected alternatives").
9. **Determinism and honesty of measurement.** The query set runs in a fixed order with a fixed seed;
   the harness records whether any stage was `Degraded` or `Unavailable` during the run and **refuses
   to report a gate-relevant metric as passing** when a stage the metric depends on was degraded —
   it reports the metric with `degraded_stages` populated and the exit code non-zero. A recall number
   measured with the dense stage silently off is a false pass, and PRD §13.2 requires degraded status to
   be surfaced.
10. **No blind-gold contact.** A test asserts that no path under `services/search-rs/benches/**` or
    `src/bench/**` references `evals/`, `gold`, or any evaluation path, and that the query set's
    provenance note states it is derived from the `CRPS-08` fixture. Basis: PRD §14.3; breakdown plan
    R9 and §4.2.
11. **`src/bench/README.md`** — one page: how to run against the committed fixture in two commands,
    what each metric means with its PRD §43.3 definition quoted, the fixture-vs-real-scale caveat, the
    report schema's consumers (`FIND-06`, `RLSE-11`, `GOLD-15`), and the rule that a failing target is a
    writeback rather than a filter change.

## Acceptance checklist (classified)

- [ ] `[fixture]` The harness runs end to end offline against the committed `CRPS-08` bundle plus an
      index built by `RETR-02`'s builder, and emits a `retrieval-benchmark-report.json` that validates
      against the committed report schema with `scale: "FIXTURE"`. (PRD §20.3; `CRPS-08`)
- [ ] `[fixture]` **`SRCH-004` exact-match regression set passes**: every case in the exact-identifier
      subset returns its expected node at rank 1, including with an adversarial dense ordering.
      (PRD §30.2 `SRCH-004`; §36.2)
- [ ] `[fixture]` **recall@10 is computed to PRD §43.3**: at least one required node in the first 10
      **eligible** results, macro-averaged by case — asserted by a unit test over hand-constructed
      result lists (including a case where a required node appears at position 11 and must score 0, and
      a case where an ineligible node at position 3 must not count). (PRD §43.3; §14.2 ≥ 90%)
- [ ] `[fixture]` Temporal and status cases behave: the three time-point cases resolve to different
      node versions, and the `CURRENT_LAW` case excludes the fixture's `ENACTED_NOT_IN_FORCE` document.
      (`UAT-SRCH-02`, `UAT-SRCH-03`; PRD §36.2)
- [ ] `[fixture]` The licence-`PROHIBITED` case returns **zero** eligible results and the absent-topic
      case returns zero hits with a distinguishable reason. (PRD §11.1; §32.1 no-results taxonomy)
- [ ] `[fixture]` **PRD §13.2 latency gates measured and reported**: end-to-end retrieve p95 and
      node-read p95 are reported with p50/p95/p99/max and per-stage attribution, and the run fails when
      either exceeds its configured threshold. Fixture-scale defaults: retrieve p95 ≤ **2 s** and node
      read p95 ≤ **1 s** — the PRD §13.2 objectives themselves, since a fixture-scale run that cannot
      meet them will certainly fail at real scale. (PRD §13.2; `FIND-06` measures the HTTP-level
      equivalent)
- [ ] `[fixture]` **PRD §39.2 / §24 resource budgets measured and reported**: peak RSS, steady RSS,
      startup milliseconds, component attribution, headroom against **768 MiB**, and bytes per vector
      and per chunk. The run fails when peak RSS exceeds the configured budget. (PRD §39.2; §24.1;
      breakdown plan §8 Q3 input for `RLSE-11`)
- [ ] `[machine]` Degraded honesty: a run with the dense stage or the local runtime forced
      `Unavailable` reports `degraded_stages` and exits non-zero for gate-relevant metrics — it never
      reports a passing recall measured on a degraded pipeline. (PRD §13.2; sub-PRD D10)
- [ ] `[machine]` Determinism: two runs over the same bundle, query set and profile produce identical
      metric values (latency excepted, which is reported as a distribution with the method recorded).
      (PRD §14.4 comparability)
- [ ] `[machine]` Attribution completeness: every number in the report carries `retrieval_profile`,
      `embedding_profile`, `corpus_release_id`, `build`, `machine` and `method`; a report missing any of
      them fails schema validation. (PRD §43.5 release evidence pack; §14.4)
- [ ] `[machine]` **No blind-gold contact**: a scan asserts nothing under `benches/**` or `src/bench/**`
      references `evals/`, `gold` or an evaluation path, and the query set declares its `CRPS-08`
      provenance. (PRD §14.3; breakdown plan R9)
- [ ] `[machine]` The harness is not compiled into the service binary: `src/bench/**` is behind the
      `bench` feature, and a build of the default binary contains no benchmark symbol. (PRD §19.1)
- [ ] `[machine]` **Writeback obligation is discharged**: the sweep output for the PRD §36.2 profile
      constants is produced and either (a) the current defaults are confirmed, recorded in the PR and in
      `docs/prd/11-retrieval-engine/README.md`, or (b) a docs PR amending `RETR-01`'s profile defaults
      is opened and linked. Breakdown plan §8 **Q4** is benchmark-selected: it must not be left without
      a recorded measurement after this ticket, and the profile it produces is frozen before validation
      and blind testing. (Breakdown plan §8 Q4; PRD §36.2, §45.5)
- [ ] `[machine]` `cargo test --workspace` green (Rust; PRD §45.3).
- [ ] `[machine]` `pnpm test` green (standing item, breakdown plan §1.1).
- [ ] `[machine]` PR states requirement IDs `SRCH-004`, `EVAL-002`, `OPS-002`; model/token/cost impact
      (none — no hosted call); memory/disk/latency impact (**the measured report, quoted**); rollback
      path; known gaps including the fixture-vs-real-scale caveat and the parameters still awaiting
      measured evidence — `RLSE-11` (Q3, deferred until real-scale measurement) and `GOLD-15`
      (Q1/Q2/Q4, benchmark-selected). (PRD §45.4)
- [ ] `[human]` **Founder review of the measured numbers** where a PRD §13.2 or §39.2 target is not met
      at fixture scale — PRD §43.4's founder test queue item 7 (*"performance/cost/accessibility
      defects"*). Not required to merge if every threshold passes; **required** before `GOLD-15`
      freezes a profile or `RLSE-11` decides hot-dense coverage.
- [ ] `uv run pytest` not applicable — this ticket touches no Python.

## Test plan

All steps run offline against the committed `CRPS-08` fixture bundle, an index built by `RETR-02`'s
builder, a stub vector index from `RETR-05`'s helper and `RETR-07`'s stub runtime; no network, no
model file, no access to `evals/**`.

1. `cargo test -p search-rs bench` then `cargo test --workspace`; `cargo bench -p search-rs` for the
   microbenchmarks. Construction pattern to copy: the `*_budget.rs` tests each earlier stage ticket
   ships — this harness generalises them and consumes their reported stage timings.
2. Metric unit tests: hand-constructed result lists exercising recall@10's boundary (required node at
   position 10 scores 1, at 11 scores 0), macro-averaging (two cases at 1 and 0 give 50%), an
   ineligible node that must not count, and a case with multiple required nodes where one hit suffices.
3. Query set integrity: assert every `expected_node_version_ids` entry exists in the fixture corpus and
   that the set covers each required category from deliverable 1 — a data-driven test whose table is
   the specification.
4. End-to-end run: execute `search-bench run` into `tmp_path`, validate the emitted report against the
   committed schema, and assert `scale == "FIXTURE"` and every attribution field is populated.
5. Gates: parametrised runs with deliberately impossible thresholds (recall floor 1.0, RSS budget
   1 MiB, p95 threshold 0 ms) asserting non-zero exit and a named failure each time.
6. Degraded honesty: force `RETR-05` to `Unavailable` and `RETR-07` to disabled; assert
   `degraded_stages` is populated and the exit code is non-zero for the gate metrics.
7. Determinism: two runs, compare metric values (excluding latency distributions) byte for byte.
8. Isolation: a scan test for `evals`/`gold` references; a feature-gate test proving the default binary
   excludes the harness.
9. Sweep: run `search-bench sweep` over two parameters with three values each and assert the sweep
   report's shape; assert no profile file is written anywhere in the workspace during the run.
10. Suite green: `cargo test --workspace` and `pnpm test` from the repository root.
11. Reviewer focus: confirm recall is computed on **eligible** results, not raw candidates; confirm the
    expected node ids were transcribed from the fixture rather than captured from a run; confirm a
    degraded run cannot report a passing gate metric; confirm no path touches `evals/**`; confirm the
    sweep cannot mutate the shipped profile; confirm fixture-scale numbers are labelled and cannot be
    mistaken for release figures.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/11-retrieval-engine/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A PRD §36.2 constant should change* (breakdown plan §8 **Q4**) → this is the expected outcome, and
     it is a **docs PR against `RETR-01`** (the profile owner) plus a note in
     `docs/prd/11-retrieval-engine/README.md`, then `publish-tickets.mjs --sync`, then the code change
     in `RETR-01`'s scope. This ticket never edits `src/service/**`. Record the sweep evidence in the
     PR so `GOLD-15` can freeze a measured value rather than a guess.
   - *A PRD §13.2 latency goal or the PRD §39.2 memory budget cannot be met* → **do not** respond by
     relaxing a hard filter, widening a permitted-status set, indexing licence-restricted material,
     skipping the second filter application or trimming lexical corpus coverage. PRD §13.2 states the
     required behaviour: *"the product MUST preserve correctness and surface delay/degraded status"*,
     and PRD §39.2 states the permitted trade: reduce always-hot vector coverage and cache first.
     Record the measurement in `docs/prd/11-retrieval-engine/README.md`, route the coverage decision to
     `RLSE-11` (breakdown plan §8 **Q3**), and if the objective itself is unreachable, that is a
     **product change** requiring founder approval and a PRD update (PRD §45.5) — write it back to
     `docs/prd/breakdown-plan.md` §8 first.
   - *recall@10 is below 90% on the fixture* → the fixture is small and synthetic, so a fixture-scale
     miss is a **diagnostic**, not the PRD §14.2 gate (which `GOLD-03` enforces on the 600-case set).
     Record it, identify the responsible stage from the per-stage attribution, and raise the defect
     against that stage's ticket. Never tune the query set to make the number look better — an expected
     node id captured from a run is not a baseline.
   - *A stage report needed for attribution is missing* → the stage reports belong to their owning
     tickets (`RETR-02`…`RETR-08`). Raise the ticket change against the owner and record it in
     `docs/prd/11-retrieval-engine/README.md`; never add instrumentation inside another ticket's
     file-scope.
   - *`GOLD-15` or `RLSE-11` needs a report field this schema lacks* → the report schema is this
     ticket's published interface. Amend **this ticket** in a docs PR (bumping `report_version`), then
     `--sync`, then change the code — and note the consumer impact, because both consumers are
     `blocked_by` this ticket and a silent schema change breaks them after the fact.
3. **Falsified protocol.** If the PRD §13.2 objectives turn out to be unreachable inside the PRD §39.2
   budget **without** violating evidence quality, cost or safety, then PRD §13.2's escape clause is
   engaged and the decision is the Founder's, not this ticket's. Stop, escalate for re-review, and
   write back to `docs/prd/breakdown-plan.md` §8 (Q3, Q4) plus this sub-PRD with the measured evidence
   before any stage is changed. A benchmark that is made to pass by weakening a legal filter is worse
   than a benchmark that fails — the failing number is recoverable, the weakened filter reaches
   customers.
