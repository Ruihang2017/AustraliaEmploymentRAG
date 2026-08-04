---
id: RLSE-11
title: "Real-scale 2 GB benchmark and hot-dense-coverage decision"
module: 18-ops-release
lane: 18-ops-release
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RLSE-02, RETR-10, CRPS-06]
blocks: [LNCH-05]
---

# RLSE-11 — Real-scale 2 GB benchmark and hot-dense-coverage decision

Implements PRD §13.2, §17.2, §26 and §39.2 — epic `E32-QUALITY` (PRD §44.2: *"Source/licence/freshness
reconciliation; **2GB real-scale benchmark**"*), requirement families `OPS-002`/`OPS-003`.
**No ADR — the decision is already made in PRD §39.2 ("If the search process exceeds its limit, reduce
always-hot vector coverage/cache before removing lexical corpus coverage") and PRD §26 ("2 GB
real-scale performance/memory/disk benchmark passes or hot dense coverage is safely reduced"); this is
build ticket 11 of 11 against it.** This ticket **resolves breakdown-plan §8 Q3**, whose status is
*deferred until real-scale measurement*: Q3's governing policy is already settled, and the four values
it defers stay deliberately unfilled until this benchmark measures them.
Parent sub-PRD: [18-ops-release README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on:
[`RLSE-02`](RLSE-02-production-host-baseline-systemd-cgroups-filesystem-layout.md), `RETR-10`
(retrieval benchmark harness, `11-retrieval-engine`) and `CRPS-06` (candidate release build and
validation gates, `04-corpus-contract`) — mirrors `blocked_by`.
**Why `builder`:** a bounded change inside one module's declared file-scope measuring against limits
PRD §39.2 and §13.2 already fix, and applying a reduction rule PRD §39.2 already states — not a new
subsystem decision.

## Background + basis

**PRD §26 (Definition of Done, Operations) is the requirement in one line:**

> **2 GB real-scale performance/memory/disk benchmark passes or hot dense coverage is safely reduced.**

**PRD §39.2 fixes the budget being measured and the direction of any reduction:**

| Process | Initial memory limit | CPU intent |
|---|---:|---:|
| `app` | 320 MiB | burst up to 1 vCPU |
| `worker` | 384 MiB | burst up to 1 vCPU |
| `search` | 768 MiB | burst up to 2 vCPU |
| `litestream` | 96 MiB | low |
| `cloudflared` | 96 MiB | low |
| OS/systemd/file cache reserve | approximately 384 MiB | — |

> These limits total the 2 GiB host and are **release-benchmark inputs**. **If the search process
> exceeds its limit, reduce always-hot vector coverage/cache before removing lexical corpus
> coverage.** Swap MUST NOT be used to hide sustained working-set failure; a small encrypted emergency
> swap file MAY prevent abrupt OOM during transient promotion but is not counted as capacity.

**PRD §19.1 fixes the disk being measured:** *"Sydney Lightsail: 2 GB RAM, 2 vCPU, **60 GB system disk
+ 32 GB attached SSD**"*, and *"Production MUST NOT compile application code, build large indexes or
generate mass embeddings."*

**PRD §13.2 fixes the latency objectives and their conditionality:**

| Area | MVP objective |
|---|---|
| Search latency | **p95 ≤ 2 seconds** under tested MVP load |
| Source-node retrieval | **p95 ≤ 1 second** |
| Answer streaming | first safe progress/output event in approximately 3 seconds |
| Quick Answer completion | normally ≤ 30 seconds |

> **Performance goals are subject to the representative 2 GB production benchmark.** If a goal cannot
> be met without violating evidence quality, cost or safety, the product MUST **preserve correctness
> and surface delay/degraded status**.

**PRD §13.4 fixes the load the benchmark represents:** *"The MVP MUST be tested at: 10 organisations;
100 users; 5,000 searches/month; 1,000 Quick Answers/month; 100 Deep Research runs/month; 100 active
watchlists; 10,000 API calls/month. This is a tested system baseline, not a single-customer
entitlement."*

**PRD §17.2 is the hypothesis this benchmark replaces with measurement — breakdown-plan §8 Q3:**

> Planning baseline:
> - approximately 300,000 documents;
> - approximately 150 GB source/object storage;
> - approximately 600,000–1,000,000 structurally consolidated online search chunks;
> - **approximately 150,000–300,000 always-hot semantic chunks.**
>
> **These counts are capacity hypotheses and MUST be replaced by measured corpus statistics.**
> The complete eligible corpus receives metadata/lexical/field/citation discovery. Tier 1 receives
> full dense indexing; Tier 2 selective/on-demand dense indexing; Tier 3 no default embedding.
> Long-tail lexical hits MAY populate a bounded semantic cache. **Embedding eviction MUST NOT remove
> legal evidence.**

**breakdown-plan §8 names this ticket as Q3's resolver, and separates what is settled from what is
not:**

> **Q3 — always-hot vectors and semantic-cache size. Status: DEFERRED UNTIL REAL-SCALE MEASUREMENT.**
> Owner `18-ops-release`; resolved by `RLSE-11`. The governing policy is already settled: keep full
> lexical corpus coverage; reduce hot dense coverage before cutting lexical scope; respect the 2 GB
> production-host budget; give every process an explicit memory limit; and disclose any dense-coverage
> downgrade rather than letting it happen silently. Still awaiting measurement: always-hot vector
> count, semantic-cache entry/byte limit, resident memory allocation, and the cold/hot tier boundary.
> `RLSE-11` resolves these against the real 2 GB benchmark and records the measured decision. The
> 150k–300k planning hypothesis must never be presented as a product commitment. Blocks the launch
> decision to reduce hot dense coverage before lexical scope. PRD basis: §17.2, §36.2, §39.2, §27.

So the **policy** is not this ticket's to choose — it is already fixed, and sub-PRD **D17** repeats it.
What this ticket produces is the **measurement** and the four values Q3 leaves unfilled:

| Q3 value awaiting measurement | Where this ticket produces it |
|---|---|
| Always-hot vector count | `q3_decision.recommendedHotVectorCount` (deliverable 6) |
| Semantic-cache entry **and byte** limit | `q3_decision.recommendedCacheEntries` / `recommendedCacheBytes` |
| Resident memory allocation inside PRD §39.2's 768 MiB search limit | `q3_decision.recommendedSearchResidentBytes` |
| Cold/hot tier boundary (recorded here; the shipped default is `CRPS-04`'s) | `q3_decision.recommendedHotTierBoundary` |

PRD §17.2's *"approximately 150,000–300,000 always-hot semantic chunks"* is a **capacity hypothesis**,
never a commitment and never a target: in this ticket it may appear **only** as a `prd_hypothesis`
value inside `hypothesis_comparison` — never as a default, a threshold, a pass criterion or a
recommendation.

**The consumed contracts, restated so this ticket is cold-startable:**

- **`RETR-10`** (`11-retrieval-engine`, `services/search-rs/benches/**`, `src/bench/**`) produces a
  versioned, machine-readable **`retrieval-benchmark-report.json`** that its own ticket says
  *"`FIND-06`, `RLSE-11` and `GOLD-15`"* bind to, containing recall, per-stage latency, startup time,
  peak RSS and — explicitly for this ticket — *"per-vector and per-chunk resident bytes, so `RLSE-11`
  can extrapolate PRD §17.2's 150k–300k"*. `RETR-10`'s figures are fixture-scale; the real-scale
  figures are this ticket's. Changing a member of that report schema is a docs PR against `RETR-10`.
- **`CRPS-06`** (`04-corpus-contract`, `pipelines/corpus-builder/src/{build,validation}/**`) produces
  the **real-scale candidate bundle** in PRD §18.4's layout (`corpus.sqlite`, `tantivy/`,
  `vectors.usearch`, `embedding-manifest.json`, `release-manifest.json`) together with a build report
  whose measured distribution `CRPS-06` records as *"[the] evidence input for breakdown plan §8 Q3
  (`RLSE-11` hot-dense-coverage decision) and Q5"*. `CRPS-04`'s tier assignment and `CRPS-05`'s
  embedding manifest are the levers a reduction adjusts — **in their own tickets**, never here.
- **`RLSE-02`** (`infra/deploy/host/**`) supplies the PRD §39.2 unit limits, `assertMemoryBudget`,
  the `LAYOUT` disk paths, `preflight.mjs` and the `HostAdapter`/`LocalRootHostAdapter` seam.

**Why these blockers.** breakdown-plan §6.2: `RLSE-02 --> RLSE-11`, `RETR-10 --> RLSE-11`,
`CRPS-06 --> RLSE-11`. The host budget comes from `RLSE-02`; the retrieval measurement method and its
report schema come from `RETR-10`; the real-scale bundle comes from `CRPS-06`.

**Accepted caveats carried forward, documented not enforced here:**

- **Where the real-scale run happens is sub-PRD open question Q-RLSE-6**, with the **Founder**
  approving any spend (sub-PRD **D18**). PRD §19.1 forbids heavy work on the production host, yet
  PRD §13.2 requires *"the representative 2 GB production benchmark"*. The only impact-free window is
  **pre-launch, before paid access exists** (PRD §25.2 week 7); the alternative is a temporary
  identical instance, which costs money. The report records which was used.
- **`RLSE-11` resolves Q3's measured values; it does not decide Q1 (hosted model per profile), Q2
  (embedding model and representation) or Q4 (retrieval constants)** — those are **benchmark-selected**
  and resolved by measured evidence through `GOLD-15`/`RETR-10` (breakdown-plan §8) — nor Q5 (measured
  corpus statistics and the capacity claims that depend on them), which is deferred to `GOLD-16`
  (`21-evaluation-600`). This ticket's measurements are an input to them, never a substitute.
- **This ticket changes no default in another module.** A reduction of hot dense coverage is applied by
  a docs PR against `CRPS-04`/`CRPS-05`/`RETR-01`, whose tickets own those values. `RLSE-11` measures,
  decides and writes back.
- **`LNCH-05`** (`24-launch`, `docs/release/**`, `blocked_by` this ticket) consumes this report for
  PRD §26's Operations item and PRD §43.5's release evidence pack (*"performance and memory
  benchmark"*).

## Goal

Produce `infra/deploy/benchmark/**`: a harness that runs the whole system at real scale under the
exact PRD §39.2 cgroup limits, measures per-process peak RSS, disk on both mounts, search p95 and
node-retrieval p95 against PRD §13.2, and startup time; a decision procedure that either records
**PASS** or computes the largest hot dense coverage that fits — the always-hot vector count, the
semantic-cache entry and byte limit, the search resident-memory allocation and the cold/hot tier
boundary — never reducing lexical corpus coverage; and a signed-off report that fills in the four
values breakdown-plan §8 **Q3** defers until measurement and replaces PRD §17.2's hypotheses with
measured corpus statistics. Completion is mechanically
checkable offline: the harness runs in a **memory-constrained container** matching the PRD §39.2
limits against a scaled fixture bundle, produces a schema-valid report marked `scale: FIXTURE` with
`gate_evaluated: false`, and the reduction calculator is proven by a table of synthetic measurements —
including the case where reduction is impossible, which must escalate rather than silently narrow
lexical scope.

## Non-goals

- **No retrieval implementation, ranking change or profile edit.** `11-retrieval-engine`
  (`RETR-01`…`RETR-10`). This ticket runs `RETR-10`'s harness at real scale and reads its report.
- **No corpus build, tier-assignment policy or embedding pipeline.** `04-corpus-contract`
  (`CRPS-04`, `CRPS-05`, `CRPS-06`). A reduction decision is written **back** to those tickets as a
  docs PR; this ticket edits none of their files.
- **No host baseline, systemd unit or cgroup definition.** `RLSE-02` (`infra/deploy/host/**`). This
  ticket **asserts against** those limits.
- **No deployment, promotion or rollback.** `RLSE-06`, `RLSE-07`. The benchmark may promote a bundle
  in a **non-production** environment through their tools; it never promotes to production.
- **No alerting, thresholds or status page.** `RLSE-08` (`infra/deploy/monitoring/**`).
- **No restore drill.** `RLSE-09` (`infra/recovery/**`).
- **No evaluation cases, gold data, metrics or gate enforcement.** `21-evaluation-600`
  (`GOLD-01`…`GOLD-17`). Per breakdown-plan **R9** and PRD §14.3, nothing here may read
  `evals/gold/**`.
- **No API-level latency gate.** `FIND-06` (`14-search-product`, `apps/api/bench/search/**`) owns the
  `POST /v1/search` gate; this ticket measures the **whole host** at real scale. Neither replaces the
  other.
- **No model-profile promotion or hosted-model choice.** `GOLD-15` (`21-evaluation-600`);
  breakdown-plan §8 Q1/Q2/Q4.
- **No runbook.** `RLSE-10` (`docs/runbooks/**`).
- **No production promotion of the benchmarked bundle.** A benchmark bundle is not a release
  candidate; promotion is `RLSE-07` with founder authorisation.
- **No `infra/compose/**`.** `RUNT-09` (`03-app-runtime`), breakdown-plan **A7**. The benchmark
  environment reproduces the **production** cgroup topology (`RLSE-02`), not the development stack.

## File-scope (write-owns)

- `infra/deploy/benchmark/**` — the harness, the environment constrainer, the load generator, the
  measurement collectors, the reduction calculator, the report schema and writer, `reports/**`,
  `test/**` and `fixtures/**`.

Does not touch:

- `infra/deploy/{release,host,promote,corpus,monitoring}/**` — `RLSE-01`, `RLSE-02`, `RLSE-06`,
  `RLSE-07`, `RLSE-08`. `infra/{cloudflare,aws,backup,recovery}/**` — `RLSE-03`, `RLSE-04`, `RLSE-05`,
  `RLSE-09`. `docs/runbooks/**` — `RLSE-10`.
- **`infra/compose/**` — `RUNT-09` (`03-app-runtime`), breakdown-plan A7.**
- `services/search-rs/**`, `packages/retrieval-client/**` — `11-retrieval-engine`.
  `pipelines/corpus-builder/**`, `pipelines/embeddings/**`, `schemas/corpus-manifest/**` —
  `04-corpus-contract` (PRD §44.3 serial-owned). `evals/**`, `pipelines/evaluation/**` —
  `21-evaluation-600`; **`evals/gold/**` must not be read at all** (PRD §14.3; breakdown-plan R9).
  `apps/api/bench/search/**` — `14-search-product` (`FIND-06`). `apps/**`, `packages/**`,
  `tests/**` — their owning modules. Root manifests, lockfiles, `.github/workflows/**` —
  `00-foundation`. `docs/PRD.md`, `docs/prd/breakdown-plan.md` — frozen / not this ticket's to edit.

**Serial-safety analysis.** First decomposition (breakdown-plan §1 header: `phase: 1`, nothing merged,
no in-flight ticket) — nothing has previously written `infra/deploy/benchmark/**`. breakdown-plan §4
gives `infra/deploy/**` to this module and §5.19 gives `infra/deploy/benchmark/**` wholly to this
ticket; siblings own disjoint subtrees. In the sub-PRD wave shape this ticket runs in wave 5
concurrently with `RLSE-10` (`docs/runbooks/**`) — a disjoint tree. All three blockers merge before it
starts. `infra/compose/**` belongs to `RUNT-09` and must not be touched here (breakdown-plan **A7**,
§4.1).

## Deliverables

1. **`infra/deploy/benchmark/README.md`** — one page: what is measured, against which PRD figures, the
   two environment options and their cost consequence (sub-PRD **Q-RLSE-6**), how the reduction rule
   works and in which direction, where reports land, and the statement that this ticket changes no
   default in another module.
2. **`infra/deploy/benchmark/lib/environment.mjs`** — the constrained environment:
   `buildBenchmarkEnvironment({ mode: 'CONTAINER' | 'HOST', limits })` applies **exactly** the
   PRD §39.2 memory limits per process (`app` 320 MiB, `worker` 384 MiB, `search` 768 MiB,
   `litestream` 96 MiB, `cloudflared` 96 MiB) plus the ~384 MiB OS reserve, using cgroup v2 limits in
   `CONTAINER` mode and `RLSE-02`'s systemd units in `HOST` mode. It **refuses to run** when the
   observed limits differ from `RLSE-02`'s `assertMemoryBudget` table — a benchmark against the wrong
   budget measures nothing. It also asserts swap is either absent or within PRD §39.2's emergency
   allowance and **excludes it from capacity**, failing with `SWAP_WOULD_HIDE_FAILURE` otherwise.
3. **`infra/deploy/benchmark/lib/workload.mjs`** — the load model derived from PRD §13.4's tested
   capacity baseline, expressed as a rate model rather than a monthly total so it is executable:
   10 organisations, 100 users, and the monthly volumes (5,000 searches, 1,000 Quick, 100 Deep, 100
   watchlists, 10,000 API calls) converted to a **peak-hour** concurrency using a documented, committed
   peak factor, plus PRD §24.4's per-organisation concurrency defaults (*"two Quick, one Deep and one
   export"*). The conversion is a single exported function with its assumptions in the report, so a
   reader can recompute it. Queries come from a committed synthetic query set derived from the
   benchmarked bundle's own identifiers — **never** from `evals/gold/**` (PRD §14.3;
   breakdown-plan **R9**).
4. **`infra/deploy/benchmark/lib/collect.mjs`** — the measurement collectors, each recording method
   and sampling interval alongside the value:
   - **memory** — per-process peak RSS and cgroup `memory.peak`/`memory.max` events, plus any OOM kill
     (PRD §42.2 row *"OOM/restart | any unexpected"*);
   - **disk** — used/free on the 60 GB system and 32 GB attached mounts during and after the run,
     against PRD §42.2's warn 75% / critical 85% (PRD §19.1, §39.3);
   - **latency** — search p95 and source-node retrieval p95 measured at the **API boundary** and, for
     attribution, at the search boundary via `RETR-10`'s report (PRD §13.2);
   - **startup** — search process cold-start time with the real bundle mapped, which bounds promotion
     and restart windows (PRD §18.4, §39.7);
   - **corpus statistics** — document, node, chunk and embedding counts and byte sizes read from the
     `CRPS-06` bundle's manifest, which is what replaces PRD §17.2's hypotheses.
5. **`infra/deploy/benchmark/lib/retrieval-report.mjs`** — the `RETR-10` adapter: locate, validate and
   read `retrieval-benchmark-report.json`, and extract the members this ticket needs — recall,
   per-stage latency, peak RSS, startup, and **per-vector and per-chunk resident bytes**. A missing or
   schema-invalid report fails the run with `RETRIEVAL_REPORT_UNAVAILABLE`; the benchmark never
   substitutes an estimate for a measurement.
6. **`infra/deploy/benchmark/lib/reduction.mjs`** — the PRD §39.2 rule as arithmetic, and the
   **measured** resolution of breakdown-plan §8 **Q3**'s four deferred values:
   `computeHotDenseBudget({ searchLimitBytes, observedPeakBytes, perVectorBytes, perChunkCacheBytes,
   currentHotVectorCount, currentCacheEntries, currentHotTierBoundary, headroomFraction })` returns
   `{ status: 'PASS' | 'REDUCE' | 'INFEASIBLE', recommendedHotVectorCount, recommendedCacheEntries,
     recommendedCacheBytes, recommendedSearchResidentBytes, recommendedHotTierBoundary,
     reclaimedBytes, projectedPeakBytes, rationale }`. The five `recommended*` members carry exactly
   Q3's four deferred values — vector count; cache entry **and** byte limit; resident memory allocation
   inside PRD §39.2's 768 MiB search limit; and the cold/hot tier boundary, whose shipped default is
   `CRPS-04`'s and changes only by a docs PR there. **Every one of them is an output of measurement:**
   the function has no default, no fallback constant and no PRD §17.2 capacity hypothesis anywhere in
   its inputs. Rules, each with its basis:
   - `PASS` when observed peak plus headroom fits `searchLimitBytes` (768 MiB) — no reduction
     recommended, but the `recommended*` values are still emitted as the **measured** hot-dense
     configuration, because Q3 asks for measured values and not only for a reduction;
   - `REDUCE` otherwise: reduce **always-hot vector coverage and the semantic cache** until the
     projection fits, and **never** reduce lexical corpus coverage or a hard filter
     (PRD §39.2; PRD §26; sub-PRD **D17**);
   - the reduction must respect PRD §17.2's *"Embedding eviction MUST NOT remove legal evidence"* — the
     function operates on **hot-cache coverage counts**, never on which documents are indexed
     lexically or which nodes exist, and it emits `EVIDENCE_SAFE: true` with the reason;
   - `INFEASIBLE` when even zero hot dense coverage does not fit — which is **not** a licence to
     narrow lexical scope. It escalates: PRD §2's product promise and PRD §26's Corpus items are at
     stake, so `INFEASIBLE` is a Founder decision recorded as a writeback, and the tool says so in its
     output.
   Pure and table-testable.
7. **`infra/deploy/benchmark/lib/degradation-check.mjs`** — PRD §13.2's standing rule made
   observable: when a latency objective is missed, assert that the system **surfaces degraded status**
   rather than silently returning worse results — probe `/v1/system-status` (`RUNT-08`) during an
   overload window and record whether `search`/`generation` reported degraded. Bound through a seam
   that records `UNAVAILABLE` when the endpoint is absent. Basis: PRD §13.2 *"the product MUST preserve
   correctness and surface delay/degraded status"*; PRD §42.1.
8. **`infra/deploy/benchmark/report.mjs` + `schema/benchmark-report.schema.json`** — the artifact
   `LNCH-05` and PRD §43.5 consume. Required members:
   `{ report_id, scale: 'FIXTURE' | 'REAL', gate_evaluated: boolean, environment_mode, host_profile
     (vCPU, RAM, disks), ran_at, operator, bundle: { release_id, manifest_sha256, counts, byte_sizes },
     app_release, workload: { assumptions, peak_factor, derived_rates },
     limits: { per_process: {...}, os_reserve_bytes, source: 'PRD §39.2' },
     memory: [{ process, peak_rss_bytes, limit_bytes, headroom_bytes, oom_events }],
     disk: [{ mount, capacity_bytes, used_bytes, peak_used_bytes, pct_peak }],
     latency: { search_p50_ms, search_p95_ms, node_p50_ms, node_p95_ms, method, sample_count },
     startup: { search_cold_start_ms },
     targets: { search_p95_ms: 2000, node_p95_ms: 1000, source: 'PRD §13.2' },
     targets_met: { search_p95: boolean, node_p95: boolean, memory: boolean, disk: boolean },
     retrieval_report_ref, corpus_statistics: { documents, nodes, chunks, embeddings, source_bytes },
     hypothesis_comparison: [{ metric, prd_hypothesis, measured, delta_pct }],
     q3_decision: { status, recommendedHotVectorCount, recommendedCacheEntries,
                    recommendedCacheBytes, recommendedSearchResidentBytes,
                    recommendedHotTierBoundary, rationale, evidence_safe: true,
                    writeback_targets: [...] },
     degradation_surfaced: boolean | 'UNAVAILABLE',
     shortfalls: [{ target, measured, cause, proposed_action }] | null,
     outcome: 'PASS' | 'REDUCED' | 'INFEASIBLE' }`.
   A report with any `targets_met` false and an empty `shortfalls` is **invalid** against the schema —
   PRD §13.2 requires an unmet goal to be surfaced, and PRD §26's *"passes **or** hot dense coverage is
   safely reduced"* only admits an honest second branch. `hypothesis_comparison` is what replaces
   PRD §17.2's *"capacity hypotheses [which] MUST be replaced by measured corpus statistics"*.
9. **`infra/deploy/benchmark/run.mjs`** — the CLI:
   `node run.mjs --bundle <path|release-id> [--mode container|host] [--scale fixture|real]
   [--duration <minutes>] [--operator <name>] [--json]`. It builds the environment, loads the bundle,
   warms up, runs the workload for a bounded duration with a recorded seed, collects, computes the Q3
   decision, writes the report to `infra/deploy/benchmark/reports/benchmark-<scale>-<timestamp>.json`,
   and exits `0` on `PASS`/`REDUCED` and `2` on `INFEASIBLE` or a schema-invalid report. In
   `--scale fixture` it sets `gate_evaluated: false` and prints *"gate not evaluated"* — mirroring
   `FIND-06`'s rule that a mock-scale run must never be reported as a passed gate.
10. **`infra/deploy/benchmark/lib/cost.mjs`** — the PRD §24.1 discipline: record the benchmark's own
    cost (temporary instance hours, R2 egress to fetch the bundle, any hosted-model call made by a
    synthetic Answer during the run) and assert it against the month's remaining founder budget,
    refusing to start with `BENCHMARK_BUDGET_REFUSED` when the run would push spend past the 90% row
    of PRD §42.2. The benchmark must not itself be the thing that breaches the ceiling.
11. **`infra/deploy/benchmark/lib/writeback.mjs`** — the Q3 resolution's mechanical half. For **any**
    real-scale decision (`PASS`, `REDUCE` or `INFEASIBLE`) it emits the **exact docs-PR text** filling
    the four deferred-value rows of `docs/prd/18-ops-release/README.md`'s **Q3** entry — always-hot
    vector count, semantic-cache entry/byte limit, search resident-memory allocation, cold/hot tier
    boundary — each with its measured evidence and the report path, plus the changelog line. For a
    `REDUCE` decision it additionally emits the docs-PR text for the owning tickets whose defaults
    change (`CRPS-04` tier assignment, `CRPS-05` embedding manifest, `RETR-01` retrieval profile). It
    **fails the run** when a real-scale decision has no writeback text, and when a `REDUCE` decision
    has no per-ticket text: a dense-coverage downgrade that is not written back is precisely the silent
    downgrade Q3's settled policy forbids. It never edits another module's file; it produces the text a
    human puts in a docs PR (CLAUDE.md, issue #53).
12. **`infra/deploy/benchmark/lib/api.mjs`** — the stable surface `LNCH-05` binds:
    `runBenchmark(opts)`, `computeHotDenseBudget`, `readReport(path)`, `LATENCY_TARGETS`,
    `MEMORY_LIMITS`, `REPORT_SCHEMA_PATH`.

## Acceptance checklist (classified)

Cross-references: `OPS-002` (the benchmark makes resource behaviour observable and proves degraded
status is surfaced), `OPS-003` (the run itself is budgeted and refuses to breach the ceiling),
`ADM-002` (not applicable — this ticket promotes nothing to production; stated so the absence is
deliberate), `OPS-001` (not applicable — no backup surface; stated so the absence is deliberate).
PRD §26's Operations item *"2 GB real-scale performance/memory/disk benchmark passes or hot dense
coverage is safely reduced"* is the module-level gate this ticket satisfies, consumed by `LNCH-05`.

- [ ] `[machine]` The environment applies **exactly** the PRD §39.2 per-process limits and the
      ~384 MiB OS reserve, and **refuses to run** when the observed limits differ from `RLSE-02`'s
      `assertMemoryBudget` table (PRD §39.2; sub-PRD D19)
- [ ] `[machine]` Swap is absent or within PRD §39.2's emergency allowance and is excluded from
      reported capacity; a fixture with sustained swap fails with `SWAP_WOULD_HIDE_FAILURE`
      (PRD §39.2 "Swap MUST NOT be used to hide sustained working-set failure")
- [ ] `[machine]` The workload model derives its peak-hour rates from PRD §13.4's baseline and
      PRD §24.4's per-organisation concurrency with a committed, documented peak factor, and the
      assumptions appear in the report so the derivation is recomputable (PRD §13.4, §24.4)
- [ ] `[machine]` The query set is derived from the benchmarked bundle's own identifiers and
      **`evals/gold/**` is never read** — asserted by a source scan and a filesystem-access assertion
      (PRD §14.3; breakdown-plan R9)
- [ ] `[machine]` Every collector records its method and sampling interval alongside its value, and
      an OOM kill during the run is recorded and fails the memory target (PRD §42.2 "OOM/restart |
      any unexpected")
- [ ] `[machine]` Disk usage is measured on **both** mounts against PRD §42.2's 75%/85% thresholds and
      recorded as peak, not merely final (PRD §19.1, §39.3, §42.2)
- [ ] `[machine]` A missing or schema-invalid `retrieval-benchmark-report.json` fails with
      `RETRIEVAL_REPORT_UNAVAILABLE`; the benchmark never substitutes an estimate for a measurement
      (`RETR-10`)
- [ ] `[machine]` **`computeHotDenseBudget` table:** for a table of synthetic measurements, assert
      `PASS` when it fits; `REDUCE` with a hot-vector/cache recommendation that makes the projection
      fit; and `INFEASIBLE` when zero hot dense coverage still does not fit. In **every** `REDUCE`
      case assert that no lexical coverage figure is reduced and that `EVIDENCE_SAFE` is true
      (PRD §39.2 "reduce always-hot vector coverage/cache before removing lexical corpus coverage";
      PRD §17.2 "Embedding eviction MUST NOT remove legal evidence"; sub-PRD D17)
- [ ] `[machine]` **All four Q3 values are produced, in every status.** `PASS`, `REDUCE` and
      `INFEASIBLE` each emit `recommendedHotVectorCount`, `recommendedCacheEntries` +
      `recommendedCacheBytes`, `recommendedSearchResidentBytes` and `recommendedHotTierBoundary`, each
      traceable to a measured input; a decision missing any of them is invalid (breakdown-plan §8
      **Q3**: these are exactly the values it defers until measurement)
- [ ] `[machine]` **The 150k–300k planning hypothesis is never a commitment.** No PRD §17.2 capacity
      figure appears as a default, fallback, threshold, target or recommendation anywhere in this
      scope; it may appear **only** as a `prd_hypothesis` value inside `hypothesis_comparison` —
      asserted by a source scan plus a report-shape assertion (PRD §17.2 "capacity hypotheses ... MUST
      be replaced by measured corpus statistics"; breakdown-plan §8 **Q3**)
- [ ] `[machine]` `INFEASIBLE` exits `2` and prints that this is a **Founder** decision with a
      writeback, never an automatic narrowing of legal scope (PRD §2; PRD §26; sub-PRD D18)
- [ ] `[machine]` The report validates against the committed schema; a report with any `targets_met`
      false and an empty `shortfalls` is **invalid** (PRD §13.2 "the product MUST preserve correctness
      and surface delay/degraded status"; PRD §26)
- [ ] `[machine]` `--scale fixture` sets `gate_evaluated: false` and prints *"gate not evaluated"*; a
      fixture-scale report can never be read as a passed PRD §26 gate — mirroring `FIND-06`'s rule for
      `MOCK` runs (PRD §13.2 "subject to the representative 2 GB production benchmark")
- [ ] `[machine]` `hypothesis_comparison` reports measured values against **every** PRD §17.2 planning
      figure (documents, source bytes, chunks, always-hot semantic chunks) with a delta — this is the
      replacement PRD §17.2 requires (PRD §17.2 "MUST be replaced by measured corpus statistics")
- [ ] `[machine]` The degradation check records whether `/v1/system-status` reported degraded during an
      overload window, or `UNAVAILABLE` when the endpoint is absent — never a silent pass (PRD §13.2;
      PRD §42.1; `RUNT-08`)
- [ ] `[machine]` The run refuses to start with `BENCHMARK_BUDGET_REFUSED` when its own projected cost
      would push month-to-date spend past PRD §42.2's 90% row (PRD §24.1; `OPS-003`)
- [ ] `[machine]` **A real-scale decision fails the run unless its writeback text has been produced.**
      Any `--scale real` run must emit the text filling the four deferred-value rows of
      `docs/prd/18-ops-release/README.md`'s **Q3** entry with their measured evidence; a `REDUCE`
      decision must additionally emit the per-ticket text for `CRPS-04`, `CRPS-05` and `RETR-01`. The
      decision is not complete until its writeback exists, because an undisclosed dense-coverage
      downgrade is exactly what Q3's settled policy forbids (CLAUDE.md, issue #53; breakdown-plan §8
      **Q3**)
- [ ] `[machine]` This ticket edits **no** default owned by another module — asserted by
      `git diff --name-only` showing only `infra/deploy/benchmark/**` plus, when the decision is
      `REDUCE`, the Q3 writeback line in `docs/prd/18-ops-release/README.md`. In particular
      `infra/compose/**` is untouched (breakdown-plan **A7**; sub-PRD D2)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items, naming the PRD §26 Operations item, the memory/disk/
      latency impact (the measured figures), the cost impact (the run's own cost against PRD §24.1),
      the rollback path (a benchmark changes nothing in production) and the known gaps
- [ ] `[fixture]` **Fixture-scale replay.** The harness runs in a memory-constrained container against
      the committed scaled fixture bundle under `infra/deploy/benchmark/fixtures/bundle/` (derived
      from `CRPS-08`'s synthetic release, scaled up by the committed generator) and reproduces the
      recorded report (excluding timestamps and machine-specific figures), with
      `scale: FIXTURE`/`gate_evaluated: false`. This is the reproducible evidence the merge gate rests
      on, and the regression baseline a later change is compared against
- [ ] `[fixture]` Replay of a **recorded `retrieval-benchmark-report.json`** fixture drives the
      reduction calculator end to end and produces the recorded `q3_decision` — so the Q3 arithmetic
      is reproducible without a real search process (`RETR-10`)
- [ ] `[human]` **The real-scale 2 GB run.** One run at `--scale real` on the production host
      pre-launch (or on a Founder-approved temporary identical instance), with the real `CRPS-06`
      candidate bundle, producing a signed-off report with `gate_evaluated: true`. **Not required to
      merge** — PRD §20.2 forbids giving coding agents production access, PRD §19.1 restricts what may
      run on the host, and the environment choice is an unresolved Founder decision (sub-PRD
      **Q-RLSE-6**). The merge-time substitute is the constrained-container fixture run, which
      exercises the identical limits, collectors, schema and reduction arithmetic at reduced scale
- [ ] `[human]` **Q3's measured values recorded** — always-hot vector count, semantic-cache entry/byte
      limit, search resident-memory allocation and cold/hot tier boundary — written into
      `docs/prd/18-ops-release/README.md` **Q3** with the measured evidence and the report path, and,
      where a default changes, into docs PRs against `CRPS-04`, `CRPS-05` and `RETR-01`. This is a
      **measurement outcome, not a Founder preference**: Q3 is deferred until real-scale measurement
      and its governing policy is already settled. **Not required to merge** — it needs the real-scale
      run above (PRD §17.2; breakdown-plan §8 **Q3**; PRD §45.5 "Benchmark-selected configuration")
- [ ] `[human]` Founder review of the report as PRD §43.5 release evidence (*"performance and memory
      benchmark"*) before `LNCH-05` closes PRD §26. **Not required to merge** (PRD §43.4, §43.5)
- No `cargo test --workspace` / `uv run pytest` item — this ticket authors no Rust and no Python; it
      **invokes** `RETR-10`'s Rust harness and reads `CRPS-06`'s Python-produced bundle as external
      artifacts (PRD §45.3)

## Test plan

Reviewer steps. Everything except the three `[human]` rows runs offline with no production host, no
network and no production credentials (PRD §20.2). A container runtime with cgroup v2 memory limits is
required for the fixture run — the same class of local prerequisite `RUNT-09` already documents:

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/infra-benchmark`, **or** `node --test infra/deploy/benchmark/test` if the
   workspace member is absent (open question **Q-RLSE-9**). Both must pass.
3. Harness: `test/helpers/world.mjs` provides the scaled fixture bundle, a recorded
   `retrieval-benchmark-report.json`, a fake `/v1/system-status` that can report degraded, a
   programmable cgroup reader (so memory/OOM cases are testable without actually exhausting a
   machine), and a spend source for the budget guard. Copy the recording-stub construction pattern
   from `docs/prd/04-corpus-contract/tickets/CRPS-07-*.md`.
4. **`environment.test.mjs`** — limits match `RLSE-02`'s table; a mismatched limit refuses; sustained
   swap fails with `SWAP_WOULD_HIDE_FAILURE`; an emergency swap file within the allowance passes and
   is excluded from capacity.
5. **`workload.test.mjs`** — the peak-factor conversion against a literal expected rate table derived
   from PRD §13.4 and §24.4; assert the assumptions are echoed into the report.
6. **`no-gold.test.mjs`** — a source scan plus a filesystem-access assertion proving nothing under
   `evals/gold/**` is opened at any point (breakdown-plan R9; PRD §14.3).
7. **`collect.test.mjs`** — synthetic cgroup readings drive peak RSS, an injected OOM event fails the
   memory target, disk readings at 74%/76%/86% map to ok/warn/critical, latency percentiles are
   computed from a known sample with the method recorded.
8. **`retrieval-report.test.mjs`** — a valid recorded report is read and its members extracted; a
   missing file and a schema-invalid file each fail with `RETRIEVAL_REPORT_UNAVAILABLE`.
9. **`reduction.test.mjs`** — the table: fits (`PASS`); exceeds by a little (`REDUCE` with a
   recommendation that fits, `EVIDENCE_SAFE: true`); exceeds massively (`INFEASIBLE`, exit `2`,
   Founder message). In every `REDUCE` case assert no lexical figure changes. In **every** status
   assert that all four Q3 values are emitted and each traces to a measured input, and assert no
   PRD §17.2 capacity figure is used as a default, fallback or threshold anywhere in the module.
10. **`report.test.mjs`** — schema validation; a report with `targets_met.search_p95: false` and empty
    `shortfalls` is **invalid**; `--scale fixture` sets `gate_evaluated: false` and prints
    *"gate not evaluated"*; `hypothesis_comparison` covers every PRD §17.2 figure.
11. **`degradation.test.mjs`** — the fake status endpoint reports degraded during overload (recorded
    `true`); reports healthy while latency is missed (recorded `false`, and the shortfall names it);
    absent endpoint records `UNAVAILABLE`.
12. **`cost.test.mjs`** — a projected cost that would cross PRD §42.2's 90% row refuses with
    `BENCHMARK_BUDGET_REFUSED`; below it proceeds.
13. **`writeback.test.mjs`** — a real-scale decision without produced writeback text fails the run, for
    `PASS` as well as `REDUCE`; with it, assert the emitted text fills all four Q3 deferred-value rows,
    names every target file and quotes the measured evidence, and that a `REDUCE` additionally emits
    per-ticket text for `CRPS-04`/`CRPS-05`/`RETR-01`; assert the module writes no file outside its own
    scope plus the Q3 lines.
14. **`fixture-run.test.mjs`** — the `[fixture]` rows: run the full harness in the constrained
    container against the scaled fixture bundle and diff the report against the recorded golden,
    ignoring timestamps and machine-specific figures; then drive the reduction calculator from the
    recorded `retrieval-benchmark-report.json` and diff `q3_decision`.
15. **Diff check** — `git diff --name-only` lists only paths under `infra/deploy/benchmark/` plus, in a
    `REDUCE` scenario, the Q3 writeback line in `docs/prd/18-ops-release/README.md`.
16. **Reviewer focus (correctness- and honesty-sensitive):** confirm a fixture-scale run can never be
    read as a passed PRD §26 gate (grep the report for `gate_evaluated`); confirm the reduction
    calculator has no path that reduces lexical coverage or removes a document from the index; confirm
    an unmet target cannot be recorded without a shortfall; confirm the measured figures come from
    recorded samples rather than constants; confirm the workload's peak factor is committed and not
    tuned per run to make a target pass; confirm no `evals/gold/**` access; confirm the benchmark
    cannot promote anything to production or mutate the active corpus pointer; confirm no PRD §17.2
    capacity hypothesis (notably 150k–300k) is used as an input, default, threshold or recommendation
    and that all four Q3 values come from measurement.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(docs PR → merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/18-ops-release/README.md` (version +0.1 with a changelog line), **then** change code. Silent
divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **The search process exceeds 768 MiB at real scale** → that is the expected second branch, not a
  failure of this ticket, and the policy for it is already settled (breakdown-plan §8 **Q3**; sub-PRD
  **D17**). Apply PRD §39.2's direction — reduce always-hot vector coverage and the semantic cache —
  record all four measured Q3 values in `docs/prd/18-ops-release/README.md` **Q3**, and raise docs PRs
  against the owning tickets whose defaults change: `CRPS-04` (tier assignment), `CRPS-05` (embedding
  manifest) and `RETR-01` (retrieval profile). **Never** edit their files from here, never reduce
  lexical corpus coverage, and never let a dense-coverage downgrade happen without disclosing it — the
  policy requires the downgrade to be visible (PRD §39.2; PRD §26).
- **Even zero hot dense coverage does not fit** → `INFEASIBLE`. This is a **Founder** decision touching
  the product promise (PRD §2) and PRD §26's Corpus items, and possibly the host size, which is a
  PRD §24.1 cost change (sub-PRD **D18**). Record the measurement and the options in
  `docs/prd/18-ops-release/README.md` and stop; never narrow legal scope to make a number fit.
- **PRD §13.2's p95 targets are missed** → record the measured figures in `shortfalls` with the cause,
  in the PR's latency line (PRD §45.4) and in `docs/prd/18-ops-release/README.md`. PRD §13.2 makes the
  objectives *"subject to the representative 2 GB production benchmark"* and requires the product to
  *"preserve correctness and surface delay/degraded status"* — so the follow-up is a degraded-status
  behaviour and a `RETR-10`/`FIND-06` investigation, not a relaxed filter or a silently lowered target.
- **`RETR-10`'s report lacks a member this ticket needs** (per-vector resident bytes, a stage
  breakdown) → the report schema is `RETR-10`'s contract, and its own ticket names `RLSE-11` as a
  consumer. Raise a docs PR against `RETR-10`, record the need in
  `docs/prd/18-ops-release/README.md`, and fail closed with `RETRIEVAL_REPORT_UNAVAILABLE` meanwhile.
  Do not write `services/search-rs/**`.
- **`CRPS-06` cannot produce a real-scale bundle in time** → record it as a known gap and run at
  fixture scale with `gate_evaluated: false`, stating plainly that PRD §26's benchmark item is **not**
  satisfied. `LNCH-05` (`blocked_by` this ticket) closes PRD §26 and must not be handed a
  fixture-scale report as if it were the gate.
- **The measured corpus statistics differ sharply from PRD §17.2's hypotheses** → that is the intended
  outcome (*"capacity hypotheses [which] MUST be replaced by measured corpus statistics"*). Record
  them in `hypothesis_comparison`, write them into `docs/prd/18-ops-release/README.md`, and notify
  `21-evaluation-600` (`GOLD-16`, breakdown-plan §8 **Q5**), which owns the customer-facing capacity
  language.
- **The run needs a temporary identical instance** → sub-PRD **Q-RLSE-6** and a **Founder** decision
  under PRD §24.1 (sub-PRD **D18**). Record the hourly cost and the alternative pre-launch window in
  `docs/prd/18-ops-release/README.md`; never assume the spend inside this ticket.

**3. Escalation.** PRD §26's *"2 GB real-scale performance/memory/disk benchmark passes or hot dense
coverage is safely reduced"* is a Definition-of-Done item, and PRD §39.2's reduction direction — *"reduce
always-hot vector coverage/cache **before** removing lexical corpus coverage"* — is what keeps a
resource shortfall from silently becoming a legal-coverage shortfall. If either is outright falsified
— if the only way to fit the host is to drop legal material — that overturns the product promise in
PRD §2 and the Corpus items in PRD §26: stop, escalate for re-review, and write back to
`docs/prd/18-ops-release/README.md` and `docs/prd/breakdown-plan.md` before any default changes
anywhere. Never resolve a benchmark failure by narrowing what the product covers inside this ticket.
