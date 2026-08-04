---
id: ASSR-05
title: "Integration suite: idempotency, SSE resume, cancel, charge invariants"
module: 23-assurance
lane: 23-assurance
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [ASK-03, ASK-05, XPRT-01, DATA-09]
blocks: [LNCH-05]
---

# ASSR-05 — Integration suite: idempotency, SSE resume, cancel, charge invariants

Implements PRD §18.5, §33.2 and §35.8 — requirement **ANS-003** (contributing to **ANS-004**,
**OPS-003**, **EXP-001**); epic `E21`; acceptance scripts `UAT-ANS-01`, `UAT-ANS-06`, `UAT-ANS-07`.
No ADR — the decision is already made in PRD §18.5 (*"At-least-once execution plus idempotency and
immutable unique results MUST provide one observable answer and no duplicate charge"*); this is build
ticket 5 of 8 against it.
Parent sub-PRD: [23-assurance README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [ASK-03 — Clarification rounds](../../15-answer-product/tickets/ASK-03-clarification-rounds.md), [ASK-05 — Answer SSE stage events](../../15-answer-product/tickets/ASK-05-answer-sse-stage-events.md), [XPRT-01 — Export job admission, S3 lifecycle and signed URLs](../../19-exports/tickets/XPRT-01-export-job-admission-s3-lifecycle-and-signed-urls.md), [DATA-09 — The eight database invariants + property tests](../../01-app-data/tickets/DATA-09-the-eight-database-invariants-property-tests.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §18.5 and §33.2 already fix the transaction boundary and the cancellation semantics; this asserts
them under retry and reconnect, and decides no new subsystem.

## Background + basis

**PRD §18.5 answer runtime, quoted verbatim — the seven steps and the guarantee:**

> 1. App performs auth, TenantContext, permission/rate, PII, schema, legal scope, budget and
>    idempotency checks.
> 2. **One transaction reserves credits, creates the job plus either a sanitized saved turn or an
>    opaque ephemeral-content reference, pins a CorpusRelease and writes an outbox event.**
> 3. Worker leases the job with **at-least-once delivery** and reauthorises actor, tenant, resource
>    and budget.
> 4. Search receives only sanitized query, hard filters and pinned release.
> 5. Worker builds evidence, calls the approved Model Gateway profile and validates structured claims.
> 6. **One transaction commits Answer Snapshot, claims/citations/assumptions, retrieval/model
>    metadata, actual cost, job status, audit and outbox.**
> 7. **`job.completed` is emitted only after commit.**
>
> **At-least-once execution plus idempotency and immutable unique results MUST provide one observable
> answer and no duplicate charge. SSE events MUST be persisted for reconnect/restart.**

**PRD §33.2, quoted verbatim — cancellation and retry:**

> **Cancellation before paid provider execution releases the full reservation. Cancellation after
> provider execution records actual cost but never publishes a partial supported answer. A network
> retry with the same idempotency key returns the original job.**

**PRD §35.8, the invariants this suite observes through the running system:**

> 1. An Answer Snapshot and its claims/citations/assumptions commit atomically.
> 2. A job cannot settle more cost than its reservation without an explicit additional prepaid/BYOK
>    reservation.
> 6. Outbox event and corresponding business state commit in one transaction.

**PRD §34.4 SSE contract, quoted verbatim:**

> Clients connect with `Accept: text/event-stream` and may reconnect using `Last-Event-ID`. **Events
> are stored before emission.** … `answer.section` is provisional UI content until `job.completed`;
> clients MUST remove it on failure and MUST not represent it as a validated answer.

**PRD §33.3 clarification flow, quoted verbatim:**

> If a missing fact could change jurisdiction, applicable system, agreement, award, classification,
> status or material conclusion, the job moves to `WAITING_FOR_CLARIFICATION`. It returns 1–5 specific
> questions, each with the decision it affects. The user may answer with anonymous facts, choose
> "unknown" or cancel. **"Unknown" may continue only as a conditional/multiple-candidate answer; it
> cannot be converted into a silent assumption.**

**Requirements.** `ANS-003` (PRD §30.2): *"Accepted work is asynchronous, idempotent, cancellable and
resumable by SSE … **Repeated idempotency key creates one job/charge**."* PRD §41.2 `UAT-ANS-01`:
*"Submit same Quick request/key twice during timeout → **One job, one snapshot, one charge; both
responses identify same job**."* `UAT-ANS-06`: *"Disconnect/reconnect SSE after event 5 → **Resume
after event 5; no duplicate section/completion**."* `UAT-ANS-07`: *"Cancel before provider stage →
**Job cancelled; full reserved credit released**."* PRD §41.1 closes with the same rule for the UI:
*"refresh/back/forward/reconnect does not duplicate writes or charges."*

**Why this cannot live in `apps/api`, `apps/worker` or `packages/database`.** `DATA-09` proves each
§35.8 invariant holds against the schema. `RUNT-03` proves its replay cursor is gapless. `ASK-01` and
`ASK-02` prove their own transaction shapes. None of them can prove the guarantee PRD §18.5 actually
makes — that **at-least-once worker delivery plus a retried HTTP request still produce one snapshot
and one charge** — because that requires the API, the queue, the worker, the gateway's reservation
ledger and the database to be exercised together, with failures injected at the seams. PRD §45.2
assigns exactly that to `tests`.

**What the `blocked_by` closure guarantees (sub-PRD D3).** Via `ASK-03` → `ASK-02` → `ASK-01`,
`RUNT-02`, `RUNT-03`, `RUNT-04`, `RETR-08` → … → `CRPS-08`, `EVID-03`, `EVID-05`, `EVID-07`,
`EVID-08`, `DATA-06`. Via `ASK-05` → the persisted SSE stage events. Via `XPRT-01` → the export queue
class, `RLSE-04`'s S3 prefixes, and a second job type to prove queue-class separation. Via `DATA-09` →
the invariant registry and `DATA-06`/`DATA-07`.

**Accepted caveats carried forward, each a row in `coverage-gaps.md`:**

- **`XPRT-02`/`XPRT-03`/`XPRT-04` (the renderers) are siblings, not blockers.** Export assertions here
  cover **admission, queueing, idempotency, lifecycle and the signed URL**, not rendered output
  fidelity (`EXP-001` content equality is `19-exports`' own and `ASSR-06`'s).
- **Deep, Coverage and Compare are not in this closure** (`ASK-08`, `ASK-10`, `ASK-11`). Quick plus
  clarification plus export is the job matrix asserted here.
- **`ASK-04`'s `GET` snapshot route is a sibling of `ASK-03`.** Assertions read the persisted snapshot
  through `DATA-06`'s repositories.
- **The `apps/web` reconnect behaviour** behind PRD §41.1's *"refresh/back/forward/reconnect"* rule is
  `ASSR-06`'s; this suite asserts the API-level half.

## Goal

Produce `tests/integration/{jobs,sse,idempotency}/**`: a deterministic harness that can inject a
failure at any named seam of the PRD §18.5 sequence, and suites proving that a repeated idempotency
key, a redelivered worker lease, a mid-stream SSE disconnect, a cancellation before or after the
provider stage, and a stale clarification round each leave the system with exactly one job, at most
one snapshot, exactly one charge and no duplicate or orphaned outbox event. Completion is mechanically
checkable: the seam list is enumerated data, every seam is exercised for every job type in scope, and
a post-run consistency check asserts §35.8 invariants 1, 2 and 6 over the whole database.

## Non-goals

- **No §35.8 invariant property tests against the schema** — `01-app-data` (`DATA-09`). This suite
  **observes** the invariants through the running system and reads `DATA-09`'s registry for the names.
- **No SSE replay-cursor, heartbeat or subscriber-registry unit tests** — `03-app-runtime`
  (`RUNT-03`); no lease/fairness unit tests — `RUNT-04`.
- **No answer-content, citation or refusal assertions** — `ASSR-04` (`tests/integration/citations/**`),
  this suite's concurrent sibling in the same workspace member.
- **No PII, SSRF, XSS or supply-chain assertions** — `ASSR-03`, `ASSR-02`.
- **No tenant-isolation matrix** — `ASSR-01`; a queued-job cross-tenant attack is asserted there.
- **No restore, backup or recovery assertions** — `ASSR-08` (`tests/integration/recovery/**`).
- **No browser, screen or accessibility assertions** — `ASSR-06`, `ASSR-07`.
- **No export renderer fidelity or hash comparison** — `19-exports` (`XPRT-02` … `XPRT-04`) and
  `ASSR-06`.
- **No budget policy or ledger arithmetic** — `00-foundation` (`FND-09`) and `12-evidence-safety`
  (`EVID-08`). This suite asserts *one charge*, not the amount.

## File-scope (write-owns)

Owned by this ticket:

- `tests/integration/jobs/**`, `tests/integration/sse/**`, `tests/integration/idempotency/**` —
  including each subtree's `harness/**`, `fixtures/**` and `suites/**`, and
  `tests/integration/jobs/coverage-gaps.md`.
- `tests/integration/package.json`, `tests/integration/tsconfig.json` — **append-only**, own scripts
  and dependencies only (created by `FND-01`; sub-PRD **D16**). Shared with `ASSR-04` and `ASSR-08`.

Does not touch:

- `tests/integration/citations/**` — `ASSR-04`; `tests/integration/recovery/**` — `ASSR-08` (both
  concurrent siblings in the same member).
- `tests/tenant-isolation/**` — `ASSR-01`; `tests/security/**` — `ASSR-02`, `ASSR-03`;
  `tests/e2e/**` — `ASSR-06`, `ASSR-07`.
- **Any other module's package or app tree** — `packages/**`, `apps/**`, `services/**`,
  `pipelines/**`, `infra/**`, `schemas/**`, `evals/**`. Not even to make an assertion pass (sub-PRD
  **D1**).
- `.github/workflows/**`, root `package.json`, root lockfiles — `00-foundation`.
- `docs/PRD.md` — frozen. `docs/prd/breakdown-plan.md` — docs PR only.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). The three owned subtrees are written by no other ticket in the plan (plan §5.24). This is a
wave-1 ticket; its concurrent siblings inside the same workspace member are `ASSR-04` (`citations`)
and `ASSR-08` (`recovery`) — disjoint subtrees. The three share `tests/integration/package.json` and
`tsconfig.json` as **append-only** files (plan §1.1) and nothing else. All four declared blockers land
first by construction.

## Deliverables

1. **`jobs/harness/stack.ts` — the deterministic in-process stack** (sub-PRD **D4**, **D5**,
   **D17**). `startJobStack()` returning `{ inject, sse, step, db, providerTape, objectStore, clock,
   stop }`: `mkdtemp` data directory migrated with `DATA-01`'s runner; API from `RUNT-01`'s
   `buildApp(config)`; `RUNT-04`'s `interactive_quick` **and** `exports` lease loops driven by an
   explicit `step()` — never a timer; an injected clock; `EVID-07`'s stub provider tape; a
   filesystem-backed object store for `RLSE-04`'s export prefix; email and webhook sinks. No network,
   no provider key, no `pnpm stack:up`.
2. **`jobs/harness/seams.ts` — the failure-injection seam list, as data.** Every seam is a named point
   in PRD §18.5 at which the harness can kill the worker, drop the lease, or duplicate the delivery:

   | Seam | PRD §18.5 point | Injected failure |
   |---|---|---|
   | `AFTER_ADMISSION_TX` | end of step 2 | duplicate the outbox delivery |
   | `AFTER_LEASE` | step 3 | crash before any work; lease expires and redelivers |
   | `AFTER_REAUTHORISE` | step 3 | crash after re-authorisation |
   | `AFTER_SEARCH` | step 4 | crash; retry must be idempotent |
   | `BEFORE_PROVIDER_CALL` | step 5 | crash; **no charge may exist** |
   | `AFTER_PROVIDER_CALL_BEFORE_COMMIT` | step 5→6 | crash; redelivery must not double-charge and must not double-commit |
   | `INSIDE_COMMIT_TX` | step 6 | abort the transaction; nothing partial may persist |
   | `AFTER_COMMIT_BEFORE_ACK` | step 6→7 | redelivery must be a no-op; `job.completed` emitted once |
   | `AFTER_OUTBOX_BEFORE_DELIVERY` | step 7 | duplicate delivery attempt |

   The suites iterate the **product** of seams × job types (Quick, clarification continuation,
   export); a seam a job type cannot reach is declared `NOT_APPLICABLE` with a reason and the count is
   asserted against a literal.
3. **`jobs/harness/consistency.ts` — the post-run whole-database check.** After **every** scenario,
   assert: exactly one job row for the idempotency key; at most one `answer_snapshot` per job and, if
   present, its claims/citations/assumptions all committed (invariant 1); the settled cost ≤ the
   reservation, with exactly one settlement row (invariant 2); every outbox row has a matching
   business-state row committed in the same transaction and no orphan exists in either direction
   (invariant 6); no `answer_snapshot` exists without a terminal job status. The invariant identifiers
   are read from `DATA-09`'s registry so a rename fails here.
4. **`idempotency/suites/repeat-key.test.ts` — `UAT-ANS-01`.** Submit the identical `POST /v1/answers`
   with the same `Idempotency-Key` twice (concurrently and sequentially, and while the first is still
   running): assert **one** job, **one** snapshot, **one** charge; both responses carry the same
   `job_id` and `events_url`; the second response is not an error. Then submit the same key with a
   **different** body and assert `409 IDEMPOTENCY_CONFLICT` (PRD §34.9) with no second job. Repeat the
   whole matrix for `POST /v1/exports` (`XPRT-01`).
5. **`idempotency/suites/at-least-once.test.ts`.** For every seam in deliverable 2, run the job with
   the failure injected, allow the lease to redeliver, and assert the deliverable-3 consistency check
   plus: at most one provider call per job attempt where the seam is after the call, and **zero**
   provider calls for `BEFORE_PROVIDER_CALL`. (PRD §18.5 *"at-least-once delivery"*; §35.8 invariants
   1, 2, 6.)
6. **`idempotency/suites/no-duplicate-write-on-replay.test.ts` — PRD §41.1's last rule at API level.**
   Replay the same request after a simulated refresh/back/forward/reconnect (same key, same body, new
   connection) and assert no additional job, snapshot, charge, audit row or outbox event.
7. **`sse/suites/resume.test.ts` — `UAT-ANS-06`.** Open the stream, consume events 1–5, disconnect,
   reconnect with `Last-Event-ID: 5`, and assert: the first delivered event is 6; no event is
   repeated; no `answer.section` is duplicated; exactly one `job.completed`. Repeat with the
   disconnect placed **between** every adjacent event pair, and with a reconnect that arrives after
   the job has already completed (full replay from the store).
8. **`sse/suites/stored-before-emitted.test.ts`.** Kill the process immediately after an event is
   emitted but before the client acknowledges, restart, and assert the persisted event rows are a
   superset of what the client received — i.e. nothing was emitted that was not stored first (PRD
   §34.4). Assert the allowed public event-type set is exactly `RUNT-03`'s frozen tuple and that no
   event carries research content, provider payload or hidden reasoning (PRD §22; `ASK-05`).
9. **`sse/suites/provisional-content.test.ts`.** On a job that later fails, assert `job.failed` is
   emitted and that no `job.completed` precedes it; assert an `answer.section` emitted before failure
   is not accompanied by any persisted snapshot — PRD §34.4's *"provisional UI content until
   `job.completed`"*.
10. **`jobs/suites/cancellation.test.ts` — `UAT-ANS-07` and PRD §33.2.** Cancel **before** the provider
    stage: assert terminal `CANCELLED`, the **full** reservation released (ledger nets to zero for the
    job), no snapshot, no provider call. Cancel **after** the provider call: assert actual cost is
    recorded, **no partial supported answer is published** (no snapshot row, or a snapshot whose
    status is explicitly non-supported per the implementation's chosen representation — assert
    whichever one `ASK-02` implements and state it), and that the SSE stream ends in `job.cancelled`.
    Cancel twice: assert idempotent.
11. **`jobs/suites/clarification.test.ts` — PRD §33.3 (`ASK-03`).** Assert: a decisive missing fact
    moves the job to `WAITING_FOR_CLARIFICATION` with 1–5 questions, each naming the decision it
    affects; answering a **stale** round returns `409` and does not advance the job; answering
    "unknown" continues only as a conditional or multiple-candidate answer and never as a silent
    assumption (assert the persisted assumptions/missing-facts rows); cancelling from clarification
    releases the reservation as in deliverable 10.
12. **`jobs/suites/queue-classes.test.ts` — PRD §39.5.** With an `interactive_quick` job running,
    enqueue an export job and assert the export lease does **not** consume the interactive slot, that
    each class honours its own configured limit, and that a long job yields between stages so a Quick
    job is not starved. Assert deterministically with the stepped loops and the injected clock — no
    timing races (sub-PRD **D17**).
13. **`jobs/suites/export-lifecycle.test.ts` — `EXP-002` admission half.** Assert the export artifact
    lands under `RLSE-04`'s export prefix (never the backup prefix), that the signed URL is
    short-lived, that it is denied after expiry, and that the seven-day lifecycle rule is expressed by
    the object store fake and asserted (content fidelity is `19-exports`').
14. **`jobs/coverage-gaps.md`** (sub-PRD **D3**) — seeded with: Deep/Coverage/Compare job types
    (`ASK-08`, `ASK-10`, `ASK-11`); the §34.5 snapshot read route (`ASK-04`); export renderer fidelity
    (`XPRT-02` … `XPRT-04`); browser-level refresh/back/forward (`ASSR-06`); notification-queue
    delivery idempotency (`WTCH-04`, `WTCH-05`). Each row names the owning ticket and the exact plan
    §5.24/§6.2 edge that would close it.
15. **`package.json` script wiring** (sub-PRD **D10**): these suites run under this member's
    `test:integration` script — PRD §20.3 puts integration tests in the **release-candidate** set —
    and `FND-01`'s root `test:integration` already delegates to it and already names this module as
    the owner.
16. **`README.md` in `tests/integration/jobs/`** — the seam list with its PRD §18.5 mapping, how to
    add a seam or a job type, the determinism rules (stepped loops, injected clock, no sleeps), and
    the rule that a failure is the owning module's defect (sub-PRD **D1**).

## Acceptance checklist (classified)

- [ ] `[fixture]` **`UAT-ANS-01`** — a repeated idempotency key yields one job, one snapshot and one
      charge, and both responses identify the same job; the same key with a different body yields
      `409 IDEMPOTENCY_CONFLICT`. (PRD §41.2 `UAT-ANS-01`; §34.9; **ANS-003**)
- [ ] `[machine]` **Every seam × job-type cell holds under at-least-once redelivery** — the whole-
      database consistency check passes after each, with the cell count asserted against a literal and
      every `NOT_APPLICABLE` carrying a reason. (PRD §18.5; §35.8 invariants 1, 2, 6)
- [ ] `[machine]` **No duplicate charge, ever** — settled cost ≤ reservation with exactly one
      settlement row for every scenario, and zero provider calls when the failure precedes the call.
      (PRD §35.8 invariant 2; §18.5; **OPS-003** contribution)
- [ ] `[machine]` **Atomic commit** — no scenario leaves a snapshot without its claims, citations and
      assumptions, or an outbox row without its business state, or either without the other. (PRD
      §35.8 invariants 1 and 6)
- [ ] `[fixture]` **`UAT-ANS-06`** — reconnect with `Last-Event-ID: 5` resumes at event 6 with no
      repeated event, no duplicated `answer.section` and exactly one `job.completed`; the same holds
      for a disconnect at every adjacent event pair and for a reconnect after completion. (PRD §41.2
      `UAT-ANS-06`; §34.4; **ANS-003**)
- [ ] `[machine]` **Events are stored before emission** — after an abrupt stop the persisted event
      rows are a superset of what the client received; the public event-type set is exactly
      `RUNT-03`'s frozen tuple; no event carries research content, provider payload or hidden
      reasoning. (PRD §34.4; §22; §9.4)
- [ ] `[fixture]` **`UAT-ANS-07`** — cancellation before the provider stage releases the **full**
      reservation and produces no snapshot and no provider call; cancellation after it records actual
      cost and publishes no partial supported answer; a second cancel is idempotent. (PRD §41.2
      `UAT-ANS-07`; §33.2)
- [ ] `[machine]` **Clarification behaves per PRD §33.3** — 1–5 questions each naming the decision
      affected; a stale round returns `409`; "unknown" continues only as conditional/multiple-candidate
      and never becomes a silent assumption. (PRD §33.3; §34.3; **ANS-001** contribution)
- [ ] `[machine]` **Queue classes are independent** — an export lease never consumes the interactive
      slot, each class honours its own limit, and a long job yields between stages. Asserted with
      stepped loops and an injected clock, with no timing race. (PRD §39.5; sub-PRD **D17**)
- [ ] `[machine]` **Export artifacts use the export prefix only**, the signed URL is short-lived and
      denied after expiry, and the seven-day lifecycle rule is asserted. (PRD §19.2; **EXP-002**
      admission half)
- [ ] `[machine]` **Replay after refresh/reconnect writes nothing new** — no additional job, snapshot,
      charge, audit row or outbox event. (PRD §41.1 final bullet; §33.2)
- [ ] `[machine]` **Determinism** — three consecutive runs produce identical results; a scan finds no
      wall-clock sleep used for synchronisation and no dependence on test ordering. (Sub-PRD **D17**)
- [ ] `[machine]` **Nothing outside this ticket's file-scope is modified**, and the sibling
      integration subtrees are untouched. (Sub-PRD **D1**; plan §5.24)
- [ ] `[machine]` **Offline and credential-free** — network denied, no provider key, no cloud
      credential, no `evals/**` read, no `pnpm stack:up`. (PRD §20.2; §45.1 item 6; sub-PRD **D4**)
- [ ] `[machine]` **No skipped or conditional assertion**; every exclusion is a `coverage-gaps.md`
      row. (Sub-PRD **D3**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration` green
      (standing item, PRD §45.3; sub-PRD **D10**).
- [ ] `[machine]` No Rust or Python written here — `cargo test --workspace` / `uv run pytest`
      unaffected; declared not applicable. (PRD §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**ANS-003**, contributing to
      **ANS-004**, **OPS-003**, **EXP-002**; `UAT-ANS-01`, `UAT-ANS-06`, `UAT-ANS-07`), user-visible
      change (none — tests only) and non-goals, schema/API/event compatibility impact (none),
      tenant/PII/security and retention impact (temp data only), source/licence impact (none),
      **cost/memory/latency impact** (release-candidate CI runtime — report it; the suite makes zero
      paid provider calls), rollback path, known gaps (`coverage-gaps.md`).

Absent classes: **no `[human]` criteria.** PRD §18.5 states the guarantee as a system property and
PRD §20.3 makes integration tests a release-candidate gate; the three `UAT-*` rows here are executed
unattended, and their Gate 2 human re-run belongs to `24-launch`/`LNCH-05`. The `[fixture]` items are
replays of this suite's own scripted provider tapes and recorded event streams (sub-PRD **D6**).

## Test plan

Every step runs offline: network denied, no provider key, no cloud credential, no `evals/**` access.

1. **Run the suites.** `pnpm --filter <tests-integration> test:integration -- jobs sse idempotency`.
   Confirm each prints its scenario and seam counts.
2. **Read the seam list against the PRD.** Open `jobs/harness/seams.ts` beside PRD §18.5's seven steps
   and confirm every step boundary is represented and every `NOT_APPLICABLE` has a reason.
3. **Consistency-check sharpness.** In the harness only, deliberately commit a snapshot without its
   citations and confirm `consistency.ts` fails. Discard.
4. **Charge counting.** Confirm the settlement assertion reads the ledger rows, not a return value,
   and that a scenario with an injected double-delivery still shows one settlement.
5. **SSE.** Walk the disconnect matrix: confirm a disconnect between every adjacent pair resumes
   correctly; confirm a reconnect after completion replays the whole stream from the store; confirm
   the persisted-superset assertion fails if the harness emits without storing (simulate it in the
   harness, then discard).
6. **Cancellation.** Confirm the pre-provider case shows a zero net ledger for the job and an empty
   provider tape; confirm the post-provider case records cost and publishes no supported answer;
   confirm the second cancel changes nothing.
7. **Clarification.** Confirm the stale-round `409` does not advance the job and that "unknown"
   produces a conditional result with recorded missing facts — not an assumption in the claim text.
8. **Queue classes.** Step the loops manually and confirm the export job never occupies the
   interactive slot; confirm each class's limit is read from `RUNT-04`'s configuration rather than
   restated here.
9. **Determinism.** Run three times; diff the outputs. Grep the suites for `setTimeout`/`sleep` used
   as synchronisation — there must be none.
10. **Isolation of the suite.** `git diff --name-only` shows only this ticket's file-scope plus the
    shared member manifest (append-only) and the lockfile.
11. **Construction pattern to copy.** `RUNT-04`'s `apps/worker/test/{lease-race,checkpoint-resume}.test.ts`
    for stepping leases and injecting crashes, `RUNT-03`'s `replay.test.ts` and its
    `apps/api/test/fixtures/sse/job-events.jsonl` for the event-stream shape, `DATA-09`'s invariant
    registry for the invariant names, and `ASK-01`'s admission tests for the request builder.
12. **Reviewer focus.** Confirm every seam genuinely injects a failure rather than simulating one in
    the assertion; confirm "one charge" is read from ledger rows; confirm the SSE assertions cover
    *duplicate suppression*, not just resumption; confirm cancellation before the provider stage
    releases the **full** reservation; confirm nothing depends on wall-clock timing; confirm no
    assertion was weakened to accommodate `ASK-02`, `RUNT-03` or `XPRT-01`.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR → merge
   → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/23-assurance/README.md` (version +0.1 with a changelog line) **before** changing code.
   Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A seam produces two snapshots, two charges or an orphaned outbox row* → **that is a defect in
     the owning module** (`ASK-01`/`ASK-02` for the transaction boundary, `RUNT-04` for lease
     semantics, `EVID-08` for settlement, `DATA-05`/`DATA-06` for the outbox). File it against that
     ticket as a docs PR and leave the assertion at full strength. Do not add a de-duplication step in
     `tests/**` and do not edit the owning module (sub-PRD **D1**).
   - *A seam is unreachable for a job type* → declare it `NOT_APPLICABLE` **with a reason in the seam
     table**, never by deleting the cell; the count assertion makes a silent drop fail.
   - *The post-provider cancellation representation is ambiguous* (no snapshot vs a non-supported
     snapshot) → assert whichever `ASK-02` implements and **state it in this ticket** by docs PR;
     PRD §33.2 fixes the guarantee (*"never publishes a partial supported answer"*), not the
     representation. Do not assert both and pass on either.
   - *Queue-class assertions are timing-flaky* → make the loops stepped and the clock injected
     (sub-PRD **D17**); if `RUNT-04` offers no deterministic hook, that is a docs PR against `RUNT-04`
     requesting one — not a `sleep()` in `tests/**`.
   - *A job type this suite should cover is outside the closure* (Deep, Coverage, Compare,
     notifications) → `coverage-gaps.md` row **plus** the exact plan §5.24/§6.2 edge proposed by docs
     PR. Never add a `blocked_by` edge locally (plan §6.2).
   - *The release-candidate runtime grows too long* → report the measured time here and propose the
     split in a docs PR against this ticket **and** `FND-02`'s job definition (**M-Q7**); do not drop
     seams.
3. **Falsified protocol.** **If at-least-once delivery plus idempotency cannot yield one observable
   answer and no duplicate charge**, PRD §18.5's closing guarantee, PRD §33.2 and PRD §35.8
   invariants 1, 2 and 6 are falsified together — and `LNCH-05`, which is `blocked_by` this ticket,
   cannot close PRD §26. That is a product-level failure, not a test to relax. Stop. Do not add
   compensating logic in `tests/**`, do not narrow the seam list, and do not accept "one charge in
   practice". Escalate for re-review, raise an ADR under `docs/adr/`, and write back to
   `docs/prd/23-assurance/README.md` **and** `docs/prd/breakdown-plan.md` before any code changes.
