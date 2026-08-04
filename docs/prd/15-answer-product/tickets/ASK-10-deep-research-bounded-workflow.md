---
id: ASK-10
title: Deep Research bounded workflow
module: 15-answer-product
lane: 15-answer-product
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [ASK-02]
blocks: []
---

# ASK-10 — Deep Research bounded workflow

Implements PRD §8.3 (Quick Answer and Deep Research), §17.4 (bounded Deep Research) and §36.7 (Quick
and Deep limits), carrying requirements **ANS-001**, **ANS-004**, **ANS-005** and **ANS-007** for the
`DEEP` mode (`E23`).
**No ADR — the decision is already made in PRD §8.3 and §17.4; this is build ticket 10 of 12 against
it.**
Parent sub-PRD: [15-answer-product README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`ASK-02` — Quick workflow in worker](ASK-02-quick-workflow-in-worker-retrieve-pack-gateway-validate-commit.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(PRD §17.4's seven-stage list and PRD §36.7's Deep column of hard caps) — not a new subsystem
decision.

## Background + basis

"Deep Research" is the feature most likely to become an unbounded agent loop, and the PRD forecloses
that in two places with unusually direct language. Every bound below is a **product requirement**, not
a performance tuning parameter.

**PRD §8.3 — Quick Answer and Deep Research** is normative:

> Both modes MUST:
>
> - accept only anonymous scenarios;
> - require or infer an explicit legal date and jurisdiction with visible assumptions;
> - retrieve from approved evidence only;
> - return a structured answer status;
> - provide claim-level pinpoint citations;
> - show assumptions, missing facts, limitations and practical next checks;
> - refuse or downgrade when evidence is insufficient, conflicting or stale;
> - **preserve a single pinned CorpusRelease for the entire answer.**
>
> Quick Answer uses a bounded single-plan workflow. **Deep Research MAY decompose into bounded
> subquestions and one bounded evidence-gap/conflict follow-up round. It MUST NOT recurse
> indefinitely, browse unapproved sources, change scope or exceed explicit cost/time ceilings.**

**PRD §17.4 — Bounded Deep Research** fixes the stages and the stop conditions:

> Stages:
>
> ```text
> scope → decompose → retrieve → gap/conflict check → bounded follow-up → synthesis → validation
> ```
>
> Configuration MUST cap subquestions, retrieval rounds, candidates, hosted calls, tokens, cost and
> elapsed time. **Stop on sufficient authority, missing decisive facts, unresolved conflict,
> stale/unavailable sources, scope exclusion or resource limits.**

**PRD §36.7 — Quick and Deep limits** gives the Deep column, which is this ticket's v1 configuration:

> | Planning subquestions | **Up to 4** |
> | Retrieval rounds | **Up to 2** |
> | Hosted synthesis calls | **Up to 3 total + optional repair** |
> | Normal completion objective | 60 seconds/background |
> | Hard elapsed execution | **180 seconds** |
> | User-visible cancellation | Yes |
> | Organisation concurrency | **1** |
>
> Deep may run parallel retrieval branches but gets **only one** bounded gap/conflict follow-up. It
> **stops immediately** on decisive missing facts, unsupported source coverage, stale material that
> could change the outcome, hard budget, timeout or unresolved authoritative conflict.

**PRD §36.2** gives the per-branch evidence bound: *"Evidence nodes per Deep subquestion | 10 | 20 |
**Deduplicate across branches**"*, and the same 32,000/60,000-character bound on evidence text for one
hosted call.

**PRD §17.3** names the profile split: *"Hosted stronger validated model: Deep synthesis and complex
conflict coordination"*, and closes with *"No unvalidated fallback is permitted during provider
failure or budget exhaustion."*

**PRD §39.5** puts Deep in the `interactive_research` queue class at priority 2, *"1 shared; no
parallel hosted synthesis initially"*, and requires that *"Long Deep jobs yield between stages so
Quick work is not starved."*

**PRD §13.2:** *"Deep Research | normally ≤ 60 seconds or continues as a background job."*
**PRD §42.5:** the Deep kill switch — *"Quick/Search continue; Deep queued/running follows configured
cancel/drain."*
**PRD §42.6:** *"Before a hosted call the gateway computes a conservative reservation … Settlement
records actual provider usage and releases the remainder"*, and *"If price or currency data is
unavailable, new founder-funded calls fail closed."*
**PRD §13.4** sets the tested baseline at *"100 Deep Research runs/month"* — Deep is a bounded,
low-volume capability, not the default path.

**PRD §9.4 applies unchanged** to every branch and to the final synthesis: the sequence is
`retrieve → evidence pack → structured claims → deterministic validation → render → final status
check`, and *"remaining unsupported claims MUST be removed and the answer downgraded/refused."*

**Contracts this ticket builds against (all already published):**

- `RUNT-04`'s A1 worker handler contract (`type`, `queue`, ordered `stages`, `JobContext` with
  `signal`, yield-per-stage) and its `interactive_research` class configuration
  (`allowParallelHostedSynthesis: false`).
- `ASK-01`'s admission transaction — a `DEEP` job is admitted by the same `POST /v1/answers` route
  with `mode: 'DEEP'`; its reservation is sized for the Deep profile, its release is pinned once, and
  its concurrency limit is `RUNT-02`'s separate "Concurrent Deep" ledger (PRD §38.5).
- `ASK-02`'s `pipeline/index.ts` exported surface (`runRetrieveStage`, `runEvidencePackStage`,
  `runSynthesiseStage`, `runValidateStage`, `runStatusStage`, `runRenderStage`) and `commit.ts` —
  the PRD §9.4 sequence is imported, never copied (sub-PRD **D7**).
- `ASK-05`'s `createAnswerEventEmitter`, which takes a stage vocabulary as a parameter; Deep supplies
  its own and may emit **bounded subquestion titles** as `stage.changed.message` but **no reasoning**
  (PRD §32.3).
- `EVID-07`'s `DEEP_SYNTHESIS` and `STRUCTURED_REPAIR` profiles and its recorded/stub provider;
  `EVID-08`'s reservation, settlement and hard circuit breaker.
- `RETR-08`'s evidence sufficiency and candidate assembly through `packages/retrieval-client`.

**Accepted caveats carried forward:**

- The exact hosted model behind `DEEP_SYNTHESIS` is breakdown plan §8 **Q1** — a
  **benchmark-selected** parameter resolved by `GOLD-15`'s promotion report, with the Founder
  approving production promotion after seeing that benchmark evidence (PRD §14.4). Build against the
  profile abstraction and the stub provider; **no test may require a live provider**
  (sub-PRD **D15**).
- A **monetary** per-run ceiling is not stated numerically in the PRD; PRD §24.1's A$50 monthly ceiling
  and PRD §42.6's reservation mechanism are the hard money bounds. This ticket ships the per-run cost
  cap as versioned configuration wired to `EVID-08` and records the number as sub-PRD open question
  **Q-ASK-7**, resolved by `GOLD-15`/`RLSE-11`.
- Per-branch evidence-node counts (10/20) are `RETR-10`'s to tune — breakdown plan §8 **Q4**,
  **benchmark-selected**: PRD §36.2's initial defaults, tuned on development cases only and frozen
  before validation and blind testing. This ticket passes them through.

## Goal

Ship the `deep` worker handler area so a `DEEP` job executes PRD §17.4's seven stages — scope,
decompose, retrieve, gap/conflict check, **one** bounded follow-up, synthesis, validation — under the
PRD §36.7 Deep caps, with every branch running `ASK-02`'s PRD §9.4 sequence against the job's single
pinned release, and terminating on any of PRD §17.4's six stop conditions with a committed answer that
states its limitation. Completion is mechanically checkable: no configuration can produce more than 4
subquestions, more than 2 retrieval rounds, more than 3 hosted synthesis calls plus one repair, more
than one gap/conflict follow-up, or more than 180 seconds of elapsed execution; a scope-changing
subquestion is rejected rather than pursued; and each of the six stop conditions is asserted by its own
test.

## Non-goals

- **No admission route.** `POST /v1/answers` with `mode: 'DEEP'` is `ASK-01`'s; this ticket adds no
  route and no transaction.
- **No copy of the PRD §9.4 pipeline.** `ASK-02`'s `pipeline/index.ts` is imported (sub-PRD **D7**).
- **No SSE transport or event allowlist.** `RUNT-03` and `ASK-05`; this ticket supplies a stage
  vocabulary only.
- **No Coverage or Compare.** `ASK-08` and `ASK-11`.
- **No screens.** `ASK-07` renders Deep progress and results, including bounded subquestion titles.
- **No retrieval, ranking or filters.** `11-retrieval-engine`; branch retrieval calls
  `packages/retrieval-client`.
- **No model profile, provider adapter, budget arithmetic or price data.** `EVID-07`/`EVID-08`.
- **No tables, migrations or repositories.** `01-app-data` — breakdown plan **A3**, PRD §45.2/§44.3.
- **No worker runtime, queue class definition or fairness arbiter.** `RUNT-04`.
- **No tool use, browsing or external calls of any kind.** PRD §37.5: the gateway *"exposes no shell,
  Web, database, email, webhook or arbitrary tool"*, and PRD §8.3 forbids browsing unapproved sources.

## File-scope (write-owns)

- `apps/worker/src/handlers/deep/**`
- `apps/worker/test/deep/**` — this ticket's own unit/integration tests (breakdown plan §1.1).
- `apps/worker/package.json` — **append-only** (breakdown plan §1.1).

Does not touch:

- `apps/worker/src/handlers/answer/**` — `ASK-02` (and `events/**` — `ASK-05`);
  `handlers/coverage/**` — `ASK-08`; `handlers/comparison/**` — `ASK-11`;
  `handlers/{change-matching,alerts,notifications,rerun,correction,export}/**` — `16`, `17`, `19`;
  `apps/worker/src/{main.ts,runtime,queues}/**` and `handlers/maintenance/**` — `RUNT-04`.
- `apps/api/**` — `03-app-runtime` and the product route areas, including this module's own
  `routes/answers/**` (`ASK-01`).
- `apps/web/**` — `RUNT-05` and the product feature areas.
- `packages/**`, `services/**`, `pipelines/**`, `schemas/**`, `infra/**`, `evals/**`, `tests/**` —
  `00`, `01`, `02`, `03`, `04`, `05`, `11`, `12`, `18`, `21`, `23`; root manifests and lockfiles —
  `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown plan §1: phase 1, nothing merged, no
in-flight ticket), so nothing has previously written `apps/worker/src/handlers/deep/**` and nothing
contends for it. Under breakdown plan **A1**, handler areas self-register by directory convention, so
adding this directory produces **zero** diff to `RUNT-04`'s files or to any sibling handler area —
that is what makes `handlers/{answer,deep,coverage,comparison}` disjoint here and disjoint from the
handler subtrees owned by `16-monitor-alerts`, `17-records-collab` and `19-exports`. This ticket
registers job type `ANSWER_DEEP`; `RUNT-04` fails boot on a duplicate `type` across areas, so the
value is fixed in the sub-PRD's ownership table rather than negotiated at merge time. Concurrent
siblings at this wave are `ASK-07` (`apps/web/src/features/answers/**`) and `ASK-11`
(`handlers/comparison/**` + `routes/comparisons/**`) — different directories; both import `ASK-02`'s
pipeline read-only. Per breakdown plan **A3**, **this ticket writes no table, no migration and no
repository**; every write goes through `JobContext.tenant`.

## Deliverables

1. **`apps/worker/src/handlers/deep/index.ts`** — the `JobHandlerModule` with one `JobHandler`:
   `type: 'ANSWER_DEEP'` (from `packages/contracts`, `FND-03` — sub-PRD **Q-ASK-3**),
   `queue: 'interactive_research'` (PRD §39.5), and an ordered `stages` list that is **exactly PRD
   §17.4's seven stages** plus a commit stage:

   | # | Stage name | `idempotent` | PRD §17.4 |
   |---|---|---|---|
   | 1 | `SCOPE` | `true` | scope |
   | 2 | `DECOMPOSE` | `false` | decompose (a hosted call may be used; not retried) |
   | 3 | `RETRIEVE_BRANCHES` | `true` | retrieve |
   | 4 | `GAP_CONFLICT_CHECK` | `true` | gap/conflict check |
   | 5 | `BOUNDED_FOLLOW_UP` | `true` | bounded follow-up — **at most once per job** |
   | 6 | `SYNTHESISE` | `false` | synthesis |
   | 7 | `VALIDATE` | `true` | validation (plus at most one `REPAIR`, per PRD §36.6) |
   | 8 | `COMMIT` | `false` | §18.5 step 6 |

   Returning from each stage is the yield point, so a long Deep job never starves queued Quick work
   (PRD §39.5).
2. **`budget.ts` — the caps, as versioned configuration with the PRD §36.7 Deep column as committed
   safe defaults** (PRD §39.6 layer 1), each independently overridable and each **enforced in code**:
   `maxSubquestions: 4`, `maxRetrievalRounds: 2`, `maxHostedSynthesisCalls: 3`, `maxRepairCalls: 1`,
   `maxFollowUpRounds: 1`, `maxEvidenceNodesPerSubquestion: 10` (ceiling 20),
   `maxEvidenceCharsPerCall: 32_000` (ceiling 60_000), `normalObjectiveMs: 60_000`,
   `hardElapsedMs: 180_000`, `maxCostMicroAud` (from `EVID-08`'s reservation for the job — sub-PRD
   **Q-ASK-7**). A configuration exceeding any PRD ceiling is **rejected at load**, not clamped
   silently — the process refuses to start rather than run an unbounded Deep job.
3. **`ledger.ts` — one running counter object per job, checked before every consuming action.**
   `assertWithin(counter)` throws a typed `DeepLimitReached` carrying which limit was hit. Every
   hosted call, retrieval round, branch and follow-up increments the ledger **before** the action, and
   the ledger is checkpointed with the stage so an at-least-once retry cannot reset it (PRD §17.4
   *"Configuration MUST cap … hosted calls, tokens, cost and elapsed time"*; PRD §39.5 checkpoints).
4. **`stages/scope.ts`** — establishes the legal date, jurisdictions, permitted status set and the
   **scope boundary**: the set of topics, jurisdictions and document types the job may retrieve
   within, derived from the admitted request. It is written once and is **immutable for the rest of
   the job**. Every later stage validates against it.
5. **`stages/decompose.ts`** — produces **at most 4** subquestions. Each subquestion is checked against
   the frozen scope: a subquestion introducing a jurisdiction, date range, topic or document type
   outside it is **rejected and recorded as an out-of-scope gap**, never pursued (PRD §8.3 *"MUST NOT
   … change scope"*). A decomposition producing zero in-scope subquestions falls back to the single
   fixed plan — Deep degrades to Quick's shape rather than inventing scope.
6. **`stages/retrieve-branches.ts`** — runs `ASK-02`'s `runRetrieveStage` + `runEvidencePackStage` per
   subquestion, in **parallel branches** (PRD §36.7 permits parallel retrieval) but with **no parallel
   hosted synthesis** (`RUNT-04`'s `allowParallelHostedSynthesis: false`). Every branch uses the job's
   **single pinned** `corpus_release_id` (sub-PRD **D6**) and the same PRD §36.2 hard filters. Evidence
   is **deduplicated across branches** by `node_version_id` before any pack is built (PRD §36.2).
   Retrieval happens only through `packages/retrieval-client`: there is no HTTP client, no fetcher and
   no URL construction anywhere in this handler (PRD §8.3 *"MUST NOT … browse unapproved sources"*).
7. **`stages/gap-conflict.ts`** — a deterministic analysis over the branch evidence identifying
   (a) evidence gaps — a subquestion with insufficient applicable authority — and (b) conflicts —
   applicable authorities of equal or higher rank that materially disagree, using
   `packages/domain/src/legal` (`FND-10`) for the authority hierarchy rather than restating PRD §9.1.
   Its output is structured findings, not prose.
8. **`stages/follow-up.ts` — the single bounded round.** It may run **one** additional retrieval round
   (ledger-checked) targeted **only** at the gaps and conflicts stage 4 identified, within the frozen
   scope and the pinned release. It cannot add a subquestion, widen the date range, add a
   jurisdiction, add a document type or trigger a second follow-up. `maxFollowUpRounds: 1` is enforced
   by the ledger **and** by the stage list, which contains `BOUNDED_FOLLOW_UP` exactly once — there is
   no loop construct in this handler at all.
9. **`stages/synthesise.ts`** — up to **3** hosted calls total across the whole job through
   `EVID-07`'s `DEEP_SYNTHESIS` profile (per-branch summarisation plus a final coordination call, or
   fewer), each receiving only sanitized task facts and the deduplicated evidence pack, each bounded by
   `maxEvidenceCharsPerCall`, and each counted in the ledger before it is made. Then `ASK-02`'s
   `runValidateStage` with at most **one** repair through `STRUCTURED_REPAIR` (PRD §36.6). No hidden
   chain-of-thought is requested or stored (PRD §9.4).
10. **`stop-conditions.ts` — PRD §17.4's six stop conditions, each an explicit, tested branch** that
    terminates the job and commits a completed answer stating the reason as a limitation:
    | Condition (PRD §17.4 / §36.7) | Committed outcome |
    |---|---|
    | Sufficient authority reached | proceed to synthesis early; extra rounds are not spent |
    | Missing decisive facts | `CONDITIONAL` or `INSUFFICIENT_EVIDENCE` with the facts listed; clarification questions per PRD §33.3 |
    | Unresolved authoritative conflict | `CONFLICTING_SOURCES` (PRD §36.8) |
    | Stale/unavailable sources that could change the outcome | `SOURCE_NOT_CURRENT` (PRD §36.8) |
    | Scope exclusion | `OUT_OF_SCOPE` (PRD §36.8, §9.5) |
    | Resource limit — hosted calls, tokens, cost, hard elapsed 180 s, tripped breaker | completed answer with an explicit limitation, actual cost settled, **no retry and no fallback model** (PRD §17.3, §42.6) |
    Every one of the six commits an answer or a refusal; none leaves a job hanging or silently
    truncated.
11. **Cancellation and the Deep kill switch.** `JobContext.signal` is checked at every stage boundary.
    On abort the current stage completes to its boundary, the reservation is released in full if no
    hosted call has been made or actual cost is settled if one has, and no partial supported answer is
    published (PRD §33.2). PRD §42.5's Deep kill switch is honoured as a configured cancel/drain:
    Quick and Search continue unaffected.
12. **`events/vocabulary.ts`** — the Deep stage vocabulary for `ASK-05`'s emitter, mapping each stage
    to a user-readable name and permitting **bounded subquestion titles** in `stage.changed.message`.
    Titles are truncated to a configured length and are the subquestion text itself, never a reasoning
    trace (PRD §32.3: *"Deep MAY show bounded subquestion titles, but not hidden reasoning"*). It
    declares no new SSE event type (PRD §34.4).
13. **`commit.ts` wiring** — the terminal transaction reuses `ASK-02`'s `commit.ts`: one
    `answer_snapshot` (unique per job), its claims/citations/assumptions, model/retrieval metadata,
    `EVID-08` settlement (never more than the reservation), terminal job status, audit and outbox, with
    `job.completed` emitted only afterwards (PRD §18.5 steps 6–7, §35.8 invariants 1–2). Deep produces
    **one** snapshot; branches are internal structure, not separate answers.
14. **`limits.test`-facing exports.** `deepLimits()` and the ledger type are exported so the acceptance
    tests can assert the caps directly rather than inferring them from behaviour, and so `GOLD-02`'s
    evaluation runner can record which limit terminated a run.

## Acceptance checklist (classified)

- [ ] `[machine]` The declared stage tuple equals PRD §17.4's seven stages in order plus `COMMIT`, and
      `BOUNDED_FOLLOW_UP` appears **exactly once**; a source scan finds **no loop construct** that could
      repeat a stage (PRD §17.4, §8.3 *"MUST NOT recurse indefinitely"*)
- [ ] `[machine]` **PRD §36.7 caps enforced**: no run produces more than 4 subquestions, more than 2
      retrieval rounds, more than 3 hosted synthesis calls, more than 1 repair, or more than 1
      gap/conflict follow-up — asserted by counting invocations on instrumented doubles
- [ ] `[machine]` A configuration exceeding any PRD §36.7 or §36.2 ceiling is **rejected at load**, not
      clamped — the handler refuses to start (PRD §17.4)
- [ ] `[machine]` The ledger is checkpointed with the stage: an at-least-once retry after
      `SYNTHESISE` does not reset the hosted-call count and does not permit a fourth call (PRD §39.5,
      §18.5)
- [ ] `[machine]` **PRD §8.3 scope**: a subquestion introducing a jurisdiction, date range, topic or
      document type outside the frozen scope is rejected and recorded as an out-of-scope gap, never
      retrieved against
- [ ] `[machine]` **PRD §8.3 sources**: this handler contains no HTTP client, no fetcher, no URL
      construction and no tool interface — retrieval happens only through `packages/retrieval-client`
      (source scan)
- [ ] `[machine]` **`ANS-004`**: every branch and the final synthesis use the job's **single pinned**
      `corpus_release_id`; a test that swaps the active release mid-job still yields the originally
      pinned value (PRD §8.3, §36.2; sub-PRD **D6**)
- [ ] `[machine]` Evidence is deduplicated across branches by `node_version_id` before any pack is
      built, and each subquestion's pack respects the 10/20 node bound and the 32,000/60,000-character
      bound (PRD §36.2)
- [ ] `[machine]` **All six PRD §17.4 stop conditions** each have a test that drives them and asserts
      the committed outcome from the table above; none leaves the job hanging or silently truncated
- [ ] `[machine]` The 180-second hard elapsed cap terminates the job with a stated limitation, settles
      actual cost, and performs **no** retry and **no** fallback model selection (PRD §36.7, §17.3;
      `ANS-007`)
- [ ] `[machine]` A tripped `EVID-08` breaker mid-job terminates with a completed answer stating the
      limitation and no further hosted call is attempted (PRD §42.6, §36.8; `ANS-007`, `UAT-ANS-08`)
- [ ] `[machine]` **`ANS-005`**: every branch and the final synthesis run `ASK-02`'s exported PRD §9.4
      sequence — asserted by call-order instrumentation; a claim rejected by `EVID-05` is absent from
      the committed snapshot; the PRD §9.4 sequence is **not** re-implemented here (source scan;
      sub-PRD **D7**)
- [ ] `[machine]` Deep commits **one** `answer_snapshot` per job; branches produce no additional
      snapshot and no additional settlement (PRD §18.5 "one observable answer and no duplicate charge")
- [ ] `[machine]` No hidden chain-of-thought is requested or stored, and no provider payload reaches
      the database, the logs or an SSE event — canary asserted absent (PRD §9.4, §16.2, §37.3)
- [ ] `[machine]` Subquestion titles are emitted as bounded `stage.changed.message` values and are the
      subquestion text, never a reasoning trace; no new SSE event type is declared (PRD §32.3, §34.4)
- [ ] `[machine]` Cancellation at each stage boundary releases the full reservation before any hosted
      call and settles actual cost after one, publishing no partial answer (PRD §33.2, §42.5;
      `UAT-ANS-07`)
- [ ] `[machine]` Deep runs in `interactive_research` with `allowParallelHostedSynthesis: false`, and a
      long Deep job yields between stages so a queued Quick job is not starved (PRD §39.5)
- [ ] `[machine]` **A3 guard**: no import of `packages/database/migrations`, a schema module or an
      unscoped connection; every write goes through `JobContext.tenant` (breakdown plan **A3**/**R4**;
      PRD §45.2, `SEC-001`)
- [ ] `[fixture]` A full Deep run replays end to end against the signed synthetic `CRPS-08` fixture
      release and `EVID-07`'s **recorded** provider responses, producing a byte-stable snapshot for a
      fixed input — no network, no provider key (sub-PRD **D15**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items — requirement ids (`ANS-001`, `ANS-004`, `ANS-005`,
      `ANS-007`), **model/token/cost impact** and latency impact (PRD §13.2 Deep objective), rollback
      path, known gaps
- [ ] `[human]` PRD §43.4 founder review of Deep output quality and of the limitation wording produced
      by each stop condition, once `ASK-07` has merged — **not required to merge this ticket**; the
      `[machine]`/`[fixture]` rows are the merge gate
- [ ] No further `[human]` criteria — this ticket ships no screen; PRD §41.1 universal UI acceptance
      belongs to `ASK-07`
- [ ] No `cargo test --workspace` / `uv run pytest` item — no Rust or Python is touched (PRD §45.3)

## Test plan

Reviewer steps, all reproducible offline with no network and no provider key.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/worker`. Suites live under `apps/worker/test/deep/`.
3. **Harness.** `ASK-02`'s worker test factories and pipeline doubles; a fake
   `packages/retrieval-client` seeded from the committed `CRPS-08` fixture bundle; `EVID-07`'s
   recorded-response provider double with an invocation counter; an injected clock so elapsed-time caps
   are deterministic; a temp-file `app.sqlite` migrated with `DATA-01`'s runner. No socket, no network,
   no provider key.
4. **`stages.test.ts`** — assert the literal stage tuple and the `idempotent` flags; assert
   `BOUNDED_FOLLOW_UP` appears once; source-scan for `while`/`for`/recursive stage dispatch that could
   repeat a stage.
5. **`limits.test.ts`** — table-driven over `deepLimits()`: assert every value equals PRD §36.7's Deep
   column; then load a configuration exceeding each ceiling in turn and assert the handler refuses to
   start.
6. **`ledger.test.ts`** — drive a run that attempts a fourth hosted call, a third retrieval round, a
   fifth subquestion and a second follow-up; assert each throws `DeepLimitReached` with the right limit
   named. Then kill the process after `SYNTHESISE`, resume, and assert the counter is restored from the
   checkpoint and no extra call is permitted.
7. **`scope.test.ts`** — a decomposition fixture whose third subquestion names a jurisdiction outside
   the frozen scope; assert it is rejected, recorded as an out-of-scope gap, and never passed to the
   retrieval client. A decomposition producing zero in-scope subquestions falls back to the single
   fixed plan.
8. **`branches.test.ts`** — assert parallel retrieval branches, no parallel hosted synthesis, and that
   evidence duplicated across two branches appears once in the pack. Assert per-subquestion node counts
   and character bounds.
9. **`follow-up.test.ts`** — force gaps and a conflict; assert exactly one follow-up round, that it
   targets only the identified gaps/conflicts, and that it adds no subquestion, jurisdiction, date
   range or document type.
10. **`stop-conditions.test.ts`** — six suites, one per PRD §17.4 condition, each asserting the
    committed status and that the limitation text names the reason: sufficient authority (early
    synthesis, unspent rounds), missing decisive facts, unresolved conflict, stale sources, scope
    exclusion, resource limit (advance the injected clock past 180 s and separately trip the breaker).
11. **`no-network.test.ts`** — source scan asserting no `fetch`, no HTTP client import, no URL literal
    and no tool interface anywhere under `apps/worker/src/handlers/deep/**`.
12. **`pinning.test.ts`** — swap the active release between branches; assert every branch used the
    originally pinned id.
13. **`leak.test.ts`** — plant `provider-canary-<uuid>` in the stub response and
    `reasoning-canary-<uuid>` in a subquestion title; `PRAGMA wal_checkpoint(TRUNCATE)`; assert neither
    reaches the database bytes, the logs or any emitted event, and that the emitted title is the
    truncated subquestion text.
14. **`commit.test.ts`** — assert exactly one `answer_snapshot`, one settlement, settlement ≤
    reservation, and `job.completed` after the commit.
15. Reviewer greps the diff for: any loop that could repeat a stage, any second follow-up path, any
    hosted call not preceded by a ledger increment, any retrieval outside the frozen scope, any copy of
    the PRD §9.4 sequence, any `CREATE TABLE`, and any fallback-provider selection.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), then `docs/prd/15-answer-product/README.md`, then
`.claude/scripts/publish-tickets.mjs --sync`, and only then change code (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **Deep answers are noticeably better with a second follow-up round, or with 6 subquestions** →
  PRD §8.3 says *"**one** bounded evidence-gap/conflict follow-up round"* and PRD §36.7 caps
  subquestions at 4. These are **product bounds**, not benchmark-selected values: raising either is a
  PRD §45.5 **product change** requiring Founder approval and a PRD update, and it also changes the
  cost model under PRD §24.1. Record the measurement in `docs/prd/15-answer-product/README.md` under
  **Q-ASK-7** and stop. Do not raise the cap in configuration.
- **The 180-second cap is hit routinely on real corpora** → PRD §13.2 says a goal that cannot be met
  *"without violating evidence quality, cost or safety"* must yield to correctness, with the product
  surfacing *"delay/degraded status"*. The correct response is a committed answer stating the
  limitation (already specified), plus a measurement writeback to
  `docs/prd/15-answer-product/README.md` and `RETR-10`. Never extend the cap silently and never drop a
  validation step to fit inside it.
- **A per-run monetary ceiling number is needed** → sub-PRD **Q-ASK-7**. Take it from `EVID-08`'s
  reservation for the job; if `EVID-08` cannot supply one, record the gap in
  `docs/prd/15-answer-product/README.md` and raise a `12-evidence-safety` docs PR. PRD §42.6 requires
  founder-funded calls to **fail closed** when price data is unavailable — do so.
- **`ASK-02`'s exported pipeline surface does not fit a Deep branch** → change it there, in one docs PR
  against `ASK-02` plus this ticket, and `--sync` both. Never fork the PRD §9.4 sequence (sub-PRD
  **D7**).
- **The gap/conflict analysis wants a hosted call of its own** → that consumes the ledger's hosted-call
  budget and must be counted. If three total calls cannot cover decomposition, branch synthesis and
  coordination, record the accounting in `docs/prd/15-answer-product/README.md`; do not add an
  uncounted call.
- **A subquestion needs a source outside the pinned release or the approved corpus** → PRD §8.3 forbids
  browsing unapproved sources and PRD §36.2 requires membership of the pinned release. Record the
  coverage gap against the owning source module and commit `INSUFFICIENT_EVIDENCE`; never fetch.

**3. Escalation.** The four prohibitions in PRD §8.3 — **no indefinite recursion, no unapproved
sources, no scope change, no exceeding cost/time ceilings** — are the product's central invariants for
this feature, and each is also a founder-liability control under PRD §24.1/§42.6. A change that adds a
loop, a second follow-up, an uncounted hosted call, an out-of-scope retrieval or a network fetch
overturns PRD §8.3 and §17.4 and is exactly how an unbounded, unvalidated research run reaches a
customer and the budget. Stop, escalate for re-review through the PRD §45.5 product-change path, and
record the outcome in `docs/prd/15-answer-product/README.md` and `docs/prd/breakdown-plan.md`. Never
raise a bound inside this ticket.
