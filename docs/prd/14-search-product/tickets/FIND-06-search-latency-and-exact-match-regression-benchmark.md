---
id: FIND-06
title: Search latency and exact-match regression benchmark
module: 14-search-product
lane: 14-search-product
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FIND-01, RETR-10]
blocks: []
---

# FIND-06 — Search latency and exact-match regression benchmark

Implements PRD §13.2 (search p95 ≤ 2 s; source-node retrieval p95 ≤ 1 s), §43.3 and §20.3 —
requirement ID `SRCH-004`, with `SRCH-001`/`SRCH-002`/`SRCH-003` measured end to end; epic
`E18-SEARCH-API-UI`, whose PRD §44.2 exit criteria are *"SRCH/UAT and p95 gates"*.
No ADR — the decision is already made in PRD §13.2 (the objectives), PRD §30.2 `SRCH-004`
(*"Exact-match regression set passes"*) and breakdown plan §5.15 (this ticket owns
`apps/api/bench/search/**`); this is build ticket 6 of 6 against it.
Parent sub-PRD: [14-search-product README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [FIND-01 — `POST /v1/search` route and response contract](FIND-01-post-v1-search-route-and-response-contract.md),
[RETR-10 — Retrieval benchmark harness](../../11-retrieval-engine/tickets/RETR-10-retrieval-benchmark-harness.md)
(mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against fixed contracts —
`FIND-01`'s `/v1` response and `RETR-10`'s committed query set and report schema — not a new
subsystem decision.

## Background + basis

**The two gates, quoted (PRD §13.2):**

| Area | MVP objective |
|---|---|
| Search latency | p95 ≤ 2 seconds under tested MVP load |
| Source-node retrieval | p95 ≤ 1 second |

and the sentence that governs a miss: *"Performance goals are subject to the representative 2 GB
production benchmark. If a goal cannot be met without violating evidence quality, cost or safety, the
product MUST preserve correctness and surface delay/degraded status."* Sub-PRD **D9** is the
consequence: a missed gate is reported and escalated, never bought by relaxing a hard filter,
narrowing the corpus, caching across releases or generating a snippet.

**The load these numbers are measured under (PRD §13.4 "Tested capacity baseline"):** 10
organisations, 100 users, 5,000 searches/month, 1,000 Quick Answers/month, 100 Deep Research
runs/month, 100 active watchlists, 10,000 API calls/month — *"a tested system baseline, not a single
customer entitlement or unlimited-capacity promise"*. PRD §38.5 caps search burst at 20/min per
organisation (trial), 60/min (paid pilot) and 100/min globally. A benchmark that exceeds those caps
measures `429 RATE_LIMITED`, not latency — so the load profile is declared, bounded and recorded.

**`SRCH-004` is a pass/fail set, not a percentage.** PRD §30.2: *"Exact provision/case/agreement/ABN
matches outrank semantic similarity"*, minimum acceptance evidence *"Exact-match regression set
passes"*. PRD §36.2 makes exact identifier results *"Always retained if applicable"* and PRD §36.3
puts *"exact identifier and pinpoint match"* first in the safety precedence order, with *"No learned
score may reintroduce a filtered item or turn regulator guidance into higher authority than the
operative legislation/instrument it explains."*

**The retrieval half already exists and must not be duplicated.** `RETR-10` ships
`services/search-rs/src/bench/**` and `benches/**`: a committed synthetic query set derived solely
from the `CRPS-08` fixture (`{case_id, query, mode, requested_legal_as_at, jurisdictions,
expected_node_version_ids[], category, why}`), an **exact-identifier regression subset** covering the
fixture's provision reference, neutral citation, award-like identifier and synthetic ABN, recall@10
per PRD §43.3, per-stage latency, startup and RSS, and a versioned
`retrieval-benchmark-report.json` that — in its own words — *"`FIND-06`, `RLSE-11` and `GOLD-15`
consume"*. Its non-goals state the split explicitly: *"No API-level or HTTP benchmark —
`14-search-product`/`FIND-06` (`apps/api/bench/search/**`), which is `blocked_by` this ticket and
measures the `POST /v1/search` p95 that `SRCH-001`…`SRCH-004` are judged on end to end."* `RETR-10`
also warns that its expected node ids are *"transcribed from the fixture, never captured from a
run — a baseline recorded from current behaviour cannot detect a regression that already exists"*;
this ticket inherits that discipline by **reading `RETR-10`'s committed query set** rather than
inventing a second, divergent one.

**What this ticket adds that no other benchmark can see.** The customer-experienced number includes
`RUNT-02`'s admission chain (authenticate → tenant → permission → rate limit → schema validation),
JSON serialisation of the PRD §34.2 payload, the `packages/retrieval-client` hop with its deadlines
and bounded retry (`RETR-09` deliverable 6: 2 s for `retrieve`, 1 s for node/timeline/relation
reads), and the HTTP round trip. `RETR-09` separately budgets **client overhead p95 ≤ 15 ms** as
*"the transport share of the §13.2 search p95 ≤ 2 s and source-node p95 ≤ 1 s objectives that
`FIND-06` measures end to end over HTTP"*. Attributing the delta between `RETR-10`'s in-process
numbers and this ticket's HTTP numbers is what makes a regression assignable to a ticket rather than
to "search".

**Honesty about what was measured (sub-PRD D12).** `RETR-10` labels its runs `scale: "FIXTURE" |
"REAL"` and *"must label fixture-scale numbers as such"*. This ticket does the same on two axes:
`mode` (`MOCK` — against `RETR-09`'s exported in-process mock server, measuring API overhead only,
**gate not evaluated**; or `LOCAL_SEARCH` — against a locally built `search-rs` loaded with the
`CRPS-08` fixture bundle, **gate evaluated**) and `scale` (`FIXTURE` at this stage; the real-scale
2 GB run is `RLSE-11`'s). A `MOCK` run must report *"gate not evaluated"* and must never be
interpretable as a pass.

**CI context.** PRD §20.3 lists *"Retrieval/evaluation smoke set"* among the gates that run on every
PR, with *"Release candidates additionally run integration, restore, evaluation, compatibility and
rollback tests"*. The `MOCK`-mode run and the API-level contract assertions are cheap enough for
every PR; the `LOCAL_SEARCH` gate needs a built Rust binary and a loaded fixture bundle and is a
release-candidate/local activity. CI wiring itself is `FND-02`'s (`.github/workflows/**`), not this
ticket's.

**Carried caveats, accepted and documented:**

- **`FIND-02` is not a blocker of this ticket** (breakdown plan §5.15 gives `blocked_by:
  [FIND-01, RETR-10]`), yet PRD §13.2's second gate covers source-node retrieval, which `FIND-02`
  serves. This ticket therefore measures the node-read gate **when those route areas are present**
  and otherwise **skips with a named message** recorded in the report — never silently, and never
  reported as a pass. `FIND-02` additionally carries its own co-located overhead assertion.
- **`apps/api/package.json` belongs to `03-app-runtime`** (breakdown plan §4; sub-PRD **D11**,
  **Q-FIND-1**). This harness must therefore be invocable by a documented direct command that adds
  **no** script entry. If a script entry proves unavoidable, that is a writeback, not a quiet edit.
- The PRD §14.2/§43.3 evaluation gates (recall@10 ≥ 90%, the seven answer metrics, correct refusal,
  source-status correctness) belong to `21-evaluation-600`, and the retrieval-level recall figure
  belongs to `RETR-10`. This ticket measures **latency and exact-match rank at the API boundary** and
  nothing else.

## Goal

Produce `apps/api/bench/search/**`: a harness that drives `RETR-10`'s committed query set through
`POST /v1/search` (and, when present, `FIND-02`'s node/version endpoints) over real HTTP against the
built API, measuring p50/p95/p99/max per endpoint under a declared bounded load profile, asserting
the `SRCH-004` exact-match regression set at rank 1, attributing the delta against `RETR-10`'s
report, and emitting a versioned, machine-readable `search-api-benchmark-report.json` that records
mode, scale, release, profile, machine, method and an explicit gate verdict of `PASS`, `FAIL` or
`NOT_EVALUATED`. Completion is mechanically checkable: the harness runs offline in `MOCK` mode and
emits a schema-valid report with `gate: NOT_EVALUATED`; in `LOCAL_SEARCH` mode against the `CRPS-08`
fixture it evaluates the PRD §13.2 gates and the exact-match set; a non-2xx response fails the run
rather than being averaged in; and `pnpm test`, `pnpm typecheck` and `pnpm lint` are green.

## Non-goals

- **No retrieval-level benchmark** — recall@10, per-stage latency, startup, RSS and the fixture query
  set are `RETR-10` (`services/search-rs/**`), merged before this starts. This ticket **reads** its
  committed query set and report; it writes nothing there and re-implements no metric.
- **No real-scale or host benchmark, and no hot-dense-coverage decision** — `18-ops-release`
  (`RLSE-11`, `infra/deploy/benchmark/**`), which owns PRD §26's *"2 GB real-scale
  performance/memory/disk benchmark"* and breakdown plan §8 **Q3** (deferred until that real-scale
  measurement exists).
- **No evaluation cases, gold answers, metrics or gates** — `21-evaluation-600`. **This ticket must
  not reference `evals/**` at all** (breakdown plan **R9**; PRD §14.3: blind gold stays outside
  ordinary coding-agent context).
- **No changes to the route, the response shape, the retrieval profile or any filter** — `FIND-01`,
  `RETR-01`. This harness measures; a defect it finds is fixed in the owning ticket's scope, and a
  profile constant change is a docs PR against `RETR-01` (retrieval sub-PRD **Q4** — breakdown plan §8's
  benchmark-selected retrieval constants, measured through `RETR-10` and frozen by `GOLD-15`).
- **No CI workflow files** — `.github/workflows/**` is `00-foundation` (`FND-02`).
- **No production code path.** Nothing under `apps/api/src/**` may import this harness, and the
  harness must not be part of the served application (PRD §19.1 keeps benchmarking off the production
  host).
- **No network, no model provider, no credentials** (PRD §20.3, §39.4, §39.6). Search consumes no
  generation credit, so this harness needs none (PRD §16.2).
- **No screens and no cross-boundary suites** — `FIND-03`/`FIND-04`/`FIND-05`; `tests/**` is
  `23-assurance`.

## File-scope (write-owns)

- `apps/api/bench/search/**` — the harness entry point, the load profile, the case loader, the
  measurement code, the report model and its JSON Schema, the committed API-level cases that
  `RETR-10`'s set cannot express (pagination, filter round-trip, cursor continuation), and this
  ticket's own tests.

Does not touch:

- `apps/api/src/**` — `RUNT-01`/`RUNT-02`/`RUNT-03`/`RUNT-08` and `FIND-01`/`FIND-02` (the areas this
  harness drives over HTTP, never by import of internals).
- `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/test/**` — `03-app-runtime`
  (`RUNT-01`), extended only by `FIND-01`'s single dependency line (sub-PRD **D11**, **Q-FIND-1**).
  This ticket adds **no** script and **no** dependency to the app manifest.
- `services/search-rs/**` and `packages/retrieval-client/**` — `11-retrieval-engine`. Read-only here:
  `RETR-10`'s committed query set and report schema, `RETR-09`'s exported mock server, and the built
  `search-rs` binary as an external process.
- `evals/**`, `pipelines/evaluation/**`, `schemas/evaluation/**` — `21-evaluation-600`. **Not
  referenced at all** (breakdown plan **R9**).
- `infra/**` — `18-ops-release`/`RUNT-09`; `tests/**` — `23-assurance`; `apps/web/**` — `FIND-03`…
  `FIND-05`, `RUNT-05`; `packages/**` — `00`–`03`, `11`, `12`; `docs/PRD.md` — frozen. Root
  manifests, lockfiles and `.github/workflows/**` — `FND-01`, `FND-02`.

**Serial-safety analysis.** First decomposition (breakdown plan §1: phase 1, nothing merged, no
in-flight ticket): `apps/api/bench/**` is written by no other ticket in the plan — breakdown plan §4
gives `apps/api/bench/search/**` to this module and §5.15 gives it wholly to this ticket. `RUNT-01`'s
`apps/api` scope covers `src/**`, the two manifests and `test/**`, none of which this ticket writes.
Both blockers are merged before this starts: `FIND-01` (this module's wave 1) and `RETR-10`
(`11-retrieval-engine`'s final wave). Its concurrent sibling in the module's wave 3 is `FIND-04`, in
`apps/web/src/features/search/advanced/**` — a different app. This ticket adds no dependency and no
manifest line, so it cannot collide with `FIND-01`'s append-only edit.

## Deliverables

1. **`apps/api/bench/search/run.ts` — one entry point, two modes.**
   `--mode=mock|local-search` (default `mock`), `--iterations`, `--warmup`, `--concurrency`,
   `--base-url`, `--out`. `mock` starts the API in-process with `RETR-09`'s exported
   `mockSearch` bound as the retrieval client; `local-search` points the API's client at a locally
   running `search-rs` loaded with the committed `CRPS-08` fixture bundle. The command is documented
   in a `README.md` beside it as a **direct invocation** that requires no entry in
   `apps/api/package.json` (sub-PRD **Q-FIND-1**); the exact runner comes from `FND-01`'s toolchain —
   read it, do not guess.
2. **Case loader over `RETR-10`'s committed query set.** Reads
   `services/search-rs/src/bench/queryset/**` and maps each case
   (`case_id`, `query`, `mode`, `requested_legal_as_at`, `jurisdictions`,
   `expected_node_version_ids[]`, `category`, `why`) onto a PRD §34.2 request. Cases are **read, never
   copied into this tree** — one source of truth, so a fixture change cannot leave two divergent
   sets. If the query set is absent or unreadable, the run **fails loudly** naming the path; it never
   falls back to a self-generated set.
3. **API-level cases this harness owns** (`bench/search/cases/**`) — the small set `RETR-10`'s
   in-process cases cannot express: a first-page/second-page cursor continuation, a request with every
   PRD §32.1 advanced filter populated, a `page_size` boundary case (1 and 100), a request whose
   filters remove every candidate (the `FILTERED_BY_HARD_FILTERS` path), and one node-read case per
   `FIND-02` endpoint. Expected outcomes are transcribed from the fixture, never captured from a run.
4. **Load profile, declared and bounded.** A committed profile derived from PRD §13.4 and §38.5:
   fixed warm-up, N iterations, a declared concurrency that stays **below** the PRD §38.5 search-burst
   cap for the organisation the harness authenticates as, and a stated think-time. The profile is
   recorded in the report. Any `429 RATE_LIMITED` (or any non-2xx) **fails the run** with the case id
   and status — a rate-limited sample is not a latency measurement and must never be averaged in.
5. **Latency measurement** — p50/p95/p99/max plus sample count for:
   - `POST /v1/search` end to end (the PRD §13.2 **≤ 2 s** gate);
   - each `FIND-02` node/version/timeline/relation endpoint (the PRD §13.2 **≤ 1 s** gate), **skipped
     with a named message recorded in the report** when those route areas are not registered (see
     Background caveat);
   - a breakdown into *admission + serialisation* versus *retrieval-client call*, using the timings
     already available from the response and the client's own reporting — this harness adds **no**
     instrumentation inside `apps/api/src/**` or `packages/retrieval-client/**`.
   Timing starts before the HTTP request and ends after the body is fully read.
6. **`SRCH-004` exact-match regression check.** For every case in `RETR-10`'s exact-identifier
   subset, the expected node version must be **rank 1** of the `POST /v1/search` `results` array.
   This is pass/fail, not a percentage (PRD §30.2 `SRCH-004`; PRD §36.2 *"Always retained if
   applicable"*). A failure names the case id, the expected node, the actual rank and the actual
   top-ranked node.
7. **Correctness assertions carried alongside latency**, so a fast wrong answer cannot pass: every
   sampled response is checked for the PRD §34.2 shape, for `snippet.text` equal to the node
   substring at the returned offsets where the case supplies the node text (`SRCH-003`), and for
   independent satisfaction of the request's date/jurisdiction/status filters (`SRCH-002`; sub-PRD
   **D14** — a test-level check, no runtime re-filtering). A correctness failure fails the run
   regardless of the timing result.
8. **Delta attribution against `RETR-10`.** The report ingests
   `retrieval-benchmark-report.json` (path configurable) and records, per endpoint, the difference
   between the in-process retrieval latency and this harness's HTTP latency, so a regression is
   attributable to the API layer, the client hop or the engine. A missing or version-incompatible
   `RETR-10` report is recorded as such — the run continues and says the delta is unavailable rather
   than inventing a baseline.
9. **`search-api-benchmark-report.json` + its committed JSON Schema.** Versioned
   (`report_version`) and containing at minimum:

   ```text
   { generated_at, mode: "MOCK" | "LOCAL_SEARCH", scale: "FIXTURE" | "REAL",
     gate: { search_p95_ms, node_read_p95_ms, verdict: "PASS" | "FAIL" | "NOT_EVALUATED",
             reason_if_not_evaluated },
     corpus_release_id, retrieval_profile: { profile_id, profile_version },
     build: { api_version, search_version },
     machine: { os, cpu_model, cores, ram_bytes },
     method: { iterations, warmup, concurrency, think_time_ms, load_profile_id },
     latency: { search: {p50,p95,p99,max,samples}, node_read: {...}|null, by_component: {...} },
     exact_match: { passed: boolean, cases_total, cases_failed: [{case_id, expected, actual_rank}] },
     correctness: { shape_failures, snippet_mismatches, filter_violations },
     retrieval_baseline: { report_version, deltas } | { unavailable: reason },
     warnings: [] }
   ```

   `verdict` is `NOT_EVALUATED` in `MOCK` mode, and the report prints a prominent single line saying
   so. Fixture-scale numbers are labelled `scale: "FIXTURE"` (sub-PRD **D12**).
10. **Non-charging and generation-independent by construction.** The harness authenticates as an
    ordinary organisation principal, binds **no** model gateway and **no** PII provider, and asserts
    that a full run completes with the funding ledger reporting zero balance — the executable form of
    PRD §16.2, §8.2 and §26 at the API boundary (`SRCH-001`, `UAT-ANS-08`).
11. **Offline and hermetic.** No network egress beyond loopback; no model download; no credential; no
    `evals/**` reference. In `local-search` mode the only external process is the `search-rs` binary
    built from this repository, loaded with the committed `CRPS-08` fixture bundle.
12. **Isolation from the served application.** A test asserts that no file under `apps/api/src/**`
    imports anything from `apps/api/bench/**`, so the harness cannot reach production code paths or
    the release artifact (PRD §19.1; `RETR-10` applies the same rule via a Cargo feature gate).
13. **`apps/api/bench/search/README.md`** — one page: the two modes and what each does and does not
    prove, the exact invocation commands, how to build and start `search-rs` with the fixture bundle,
    how to read the report, the PRD §13.2 gates, and the rule that a missed gate is a writeback rather
    than a filter relaxation.

## Acceptance checklist (classified)

- [ ] `[machine]` **`MOCK` run is offline and honest**: `run.ts --mode=mock` completes with no
      network, emits a schema-valid `search-api-benchmark-report.json` with `mode: "MOCK"`,
      `scale: "FIXTURE"` and `gate.verdict: "NOT_EVALUATED"`, and prints the not-evaluated line
      (sub-PRD **D12**; PRD §13.2)
- [ ] `[fixture]` **`LOCAL_SEARCH` gate — search latency**: against the committed `CRPS-08` fixture
      bundle on the reference machine, `POST /v1/search` **p95 ≤ 2 000 ms** with method, machine,
      profile and release recorded in the report and in the PR (PRD §13.2)
- [ ] `[fixture]` **`LOCAL_SEARCH` gate — source-node retrieval**: `FIND-02`'s node/version endpoints
      **p95 ≤ 1 000 ms**, or — when those route areas are not registered — a recorded
      `NOT_EVALUATED` with a named reason; never a silent pass (PRD §13.2)
- [ ] `[fixture]` **`SRCH-004` exact-match regression passes**: every case in `RETR-10`'s
      exact-identifier subset returns its expected node version at **rank 1** of `POST /v1/search`;
      failures name case id, expected node, actual rank and actual top result (PRD §30.2 `SRCH-004`;
      §36.2, §36.3)
- [ ] `[machine]` **Cases are read, not copied**: the harness loads
      `services/search-rs/src/bench/queryset/**` and fails loudly if it is absent — a test asserts no
      duplicated case file exists in this tree (`RETR-10`; single source of truth)
- [ ] `[machine]` **Non-2xx fails the run**: an injected `429 RATE_LIMITED` and an injected `503`
      each abort the run naming the case and status, and neither is included in any percentile
      (PRD §38.5, §13.2)
- [ ] `[machine]` **Load profile stays inside PRD §38.5**: the declared concurrency and think-time
      keep the run below the search-burst cap for one organisation, and the profile is recorded in
      the report (PRD §38.5, §13.4)
- [ ] `[fixture]` **Correctness is checked alongside latency**: every sampled response matches the
      PRD §34.2 shape; `snippet.text` equals the node substring at the returned offsets for every
      case that supplies node text; every row independently satisfies the request's date, jurisdiction
      and status filters; any violation fails the run irrespective of timing (`SRCH-002`, `SRCH-003`;
      sub-PRD **D14**)
- [ ] `[machine]` **Search consumes no generation credit and runs with generation disabled**: a full
      run completes with no model gateway and no PII provider bound and with the funding ledger at
      zero (PRD §16.2, §8.2, §26; `SRCH-001`, `UAT-ANS-08`)
- [ ] `[machine]` **Delta attribution**: the report records per-endpoint deltas against
      `retrieval-benchmark-report.json`, or records that the baseline is unavailable with a reason —
      it never fabricates a baseline (`RETR-10`)
- [ ] `[machine]` **Report schema**: `search-api-benchmark-report.json` validates against its
      committed JSON Schema, and every number carries its mode, scale, method and machine — no
      unlabelled figure exists in the report (sub-PRD **D12**; PRD §45.4 latency-impact item)
- [ ] `[machine]` **Isolation**: no file under `apps/api/src/**` imports `apps/api/bench/**`; the
      harness is not part of the served application (PRD §19.1)
- [ ] `[machine]` **No `evals/**` reference anywhere in this tree** — asserted by a path scan
      (breakdown plan **R9**; PRD §14.3)
- [ ] `[machine]` **No manifest edit**: `apps/api/package.json` is unchanged by this ticket; the
      documented direct command runs the harness (sub-PRD **Q-FIND-1**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `cargo test --workspace` green — this ticket writes no Rust, but it binds to
      `RETR-10`'s committed query set and report schema, and running the Rust suite proves those
      artifacts are unchanged and consistent (PRD §45.3)
- [ ] `[human]` **PRD §43.4 founder review** of the `LOCAL_SEARCH` report at Gate 2: the numbers, the
      method and the machine are read and accepted, and any missed gate is classified rather than
      quietly re-run (PRD §43.4 item 7 *"performance/cost/accessibility defects"*; §13.2). Not
      required to merge.
- [ ] `[human]` `UAT-SRCH-01`'s latency clause — *"Exact official node and version still returned
      within latency gate"* with the model gateway disabled — is evidenced by this report at Gate 2
      (PRD §41.2). Not required to merge.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement ID `SRCH-004` (with `SRCH-001`…
      `SRCH-003` measured) and UAT id `UAT-SRCH-01`; the measured p95 numbers with mode, scale,
      method and machine; cost impact ("zero — no generation credit, PRD §16.2"); memory/latency
      impact; rollback path; known gaps (node-read gate skipped if `FIND-02` is absent; real-scale run
      is `RLSE-11`'s)
- [ ] `uv run pytest` not applicable — this ticket touches no Python (PRD §45.3).

## Test plan

Every `[machine]` step runs offline with no network. The `[fixture]` gate steps additionally require
building `search-rs` from this repository and loading the committed `CRPS-08` fixture bundle — still
offline, using only the pinned, already-resolved workspace dependencies.

1. **Unit tests of the harness** — `apps/api/bench/search/__tests__/`: the case loader (including the
   loud failure when `RETR-10`'s query set is missing), the percentile computation against a known
   sample, the report serialiser against its JSON Schema, and the non-2xx abort path.
2. **`MOCK` end-to-end** — run `run.ts --mode=mock --iterations=<small>` in the test suite; assert a
   schema-valid report with `gate.verdict: "NOT_EVALUATED"`, a populated `latency.search`, the
   exact-match section evaluated against `mockSearch`'s deterministic ordering, and the correctness
   checks green.
3. **Rate-limit and error injection** — configure the mock to return `429` then `503`; assert the run
   aborts naming the case and status and that no percentile was computed.
4. **Generation independence** — run `MOCK` with no model gateway, no PII provider and a zero funding
   ledger; assert completion.
5. **Isolation and boundary scans** — assert no `apps/api/src/**` file imports `apps/api/bench/**`;
   assert no path under this tree mentions `evals/`; assert no duplicated copy of `RETR-10`'s cases.
6. **`LOCAL_SEARCH` gate run (the `[fixture]` rows)** — build `search-rs`, start it with the
   `CRPS-08` fixture bundle, run `run.ts --mode=local-search` with the committed load profile, and
   attach the resulting `search-api-benchmark-report.json` to the PR. Assert `gate.verdict` and the
   exact-match section; record machine and method.
7. **Delta attribution** — run with and without `retrieval-benchmark-report.json` present; assert the
   deltas appear in the first case and an explicit `unavailable` reason in the second.
8. **Suite green** — `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `cargo test --workspace` from
   the repository root.
9. **Reviewer focus**: confirm no percentile can include a non-2xx sample; confirm the `MOCK` report
   cannot be read as a gate pass; confirm expected node ids come from `RETR-10`'s committed set and
   were not captured from a run; confirm the correctness checks would fail a fast-but-wrong response;
   confirm the harness cannot be reached from `apps/api/src/**`; confirm the declared concurrency
   stays under the PRD §38.5 cap; confirm nothing in this tree touches `evals/**`.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/14-search-product/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - ***A PRD §13.2 gate is missed.*** This is the important one. PRD §13.2 requires the product to
     *"preserve correctness and surface delay/degraded status"*. The permitted responses are: report
     the number with its method and machine; raise it in
     `docs/prd/14-search-product/README.md` and in `FIND-01`'s (or `FIND-02`'s) ticket if the API
     layer is the cause; raise it against `docs/prd/11-retrieval-engine/tickets/RETR-10-*.md` and the
     owning stage ticket if the engine is the cause; and surface degraded status to the customer
     (sub-PRD **D9**). The **forbidden** responses are: relaxing or dropping a hard filter, widening
     the permitted status set, shrinking the searched corpus, caching results across releases,
     returning a generated or truncated snippet, or excluding slow cases from the sample. Each of
     those trades a legal-correctness guarantee for a latency number, which PRD §13.2 forbids in the
     same sentence that sets the objective.
   - *The exact-match regression set fails* → that is a retrieval defect (`RETR-03` exact-identifier
     retrieval, `RETR-06` fusion/ranking) or an API defect (`FIND-01` re-ordering, which sub-PRD
     **D14** forbids). Raise it against the owning ticket with the failing case ids; **never** adjust
     the expected node ids to match observed behaviour — `RETR-10` states the rule: *"a baseline
     recorded from current behaviour cannot detect a regression that already exists."*
   - *`RETR-10`'s query set or report schema cannot express what this harness needs* → docs PR
     against `docs/prd/11-retrieval-engine/tickets/RETR-10-*.md` plus this ticket, `--sync`, then
     implement. Never fork the case set into `apps/api/bench/**`.
   - *A retrieval profile constant looks wrong* → retrieval sub-PRD **Q4**, a breakdown plan §8
     **benchmark-selected** parameter: PRD §36.2's initial defaults, tuned on development cases only
     and frozen before validation and blind testing. The profile lives in `RETR-01`'s scope, a value
     change is a docs PR against `RETR-01`, and the final profile is recorded through `RETR-10` and
     frozen by `GOLD-15`. This harness measures and reports; it never edits a profile.
   - *The harness needs a `package.json` script or a new dependency* → sub-PRD **Q-FIND-1**. Record
     it in `docs/prd/14-search-product/README.md` and raise it against
     `docs/prd/03-app-runtime/tickets/RUNT-01-*.md` and `docs/prd/breakdown-plan.md` §1.1/§4 before
     editing another module's manifest.
3. **Falsified protocol.** If the PRD §13.2 objectives turn out to be unreachable at fixture scale —
   i.e. before `RLSE-11`'s real-scale run has even happened — then the service objective, the
   retrieval design, or both, are in question, and that is a product-level decision (PRD §13.2's
   *"Performance goals are subject to the representative 2 GB production benchmark"*; PRD §27's
   *"2 GB server insufficient"* risk). The **ordering** of the response is not an open question:
   breakdown plan §8 **Q3** already settles the governing policy — full lexical corpus coverage is
   kept, hot dense coverage is reduced **before** lexical scope, the 2 GB production-host budget holds,
   every process carries an explicit memory limit, and any dense-coverage downgrade is disclosed rather
   than silent. What is **deferred until real-scale measurement** is the numbers — always-hot vector
   count, semantic-cache entry/byte limit, resident memory allocation and the cold/hot tier boundary —
   together with the launch decision to apply a downgrade; `RLSE-11` resolves them against the real 2 GB
   benchmark and records the measured decision. None of that is this ticket's to decide, and no figure
   may be asserted here as a product commitment. Stop, escalate for re-review, and write back to
   `docs/prd/14-search-product/README.md` and `docs/prd/breakdown-plan.md` §8 **Q3** — as measured
   evidence feeding `RLSE-11`, never as a planning number — before compensating anywhere in code.
