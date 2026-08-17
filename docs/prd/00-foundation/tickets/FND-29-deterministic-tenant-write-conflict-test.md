---
id: FND-29
title: Make the two-process tenant write-conflict test deterministic instead of timing-dependent
module: 00-foundation
lane: 00-foundation
size: M
agent: builder
status: draft
date: 2026-08-17
blocked_by: []
blocks: [FND-26]
---

# FND-29 — Make the two-process tenant write-conflict test deterministic instead of timing-dependent

Repairs a **pre-existing intermittent test failure** that is unrelated to this phase's three CI jobs but
blocks [FND-26](FND-26-global-vitest-test-timeout.md) from meeting its standing acceptance item
*"`pnpm test` at full parallelism exits 0 on five consecutive runs"*. Against PRD §20.3 / §45.3 (the
`pnpm test` gate must be **correct**, not merely loud) and PRD §39.1/§39.4 (SQLite has exactly one
writer; two transactions racing for the same row produce one commit and one **typed** error, never a
lost update). No ADR — nothing here decides a new rule; the guarantee under test is already PRD §39.1's
and this ticket changes only how reliably the test observes it. Same defect class as `FND-11`, `FND-12`,
`FND-19`, `FND-25` and `FND-26`: **a guard whose mechanism is wrong for the thing it guards, repaired at
the guard rather than by weakening the work.**
Parent sub-PRD for this phase: [breakdown-plan-02-ci-repair.md](../../breakdown-plan-02-ci-repair.md)
— that file, not the frozen `00-foundation/README.md`, carries this phase's file-scope allocation (§3)
and decision register (§4); this ticket is a **tenth** phase-2 ticket appended to `00-foundation` under
**D-CI2** (*"this phase appends tickets to `00-foundation`; no module 25 is created"*), continuing the
ids past `FND-28`. Master spec: [PRD](../../../PRD.md).
Depends on: nothing. **This ticket is a root.** It must land **before**
[FND-26](FND-26-global-vitest-test-timeout.md) can report `testsPassed=true`, because `FND-26`'s
acceptance requires five consecutive green full-parallelism `pnpm test` runs and this test fails roughly
three runs in five under exactly that load. Hence `blocks: [FND-26]`.
**Why `builder`:** one existing test file, one ordering mechanism, and a property that is already
specified by PRD §39.1 — the assertions do not change and no new subsystem appears. The mechanism is a
design choice inside one file, not a decision about the system.

## Background + basis

### The reported failure — settled, do not re-diagnose

`packages/database/test/tenant/concurrency.test.ts`, the single test inside
`describe('two processes writing the same row')`:

```
FAIL test/tenant/concurrency.test.ts > two processes writing the same row
     > produces exactly one commit and one typed conflict, never a lost update
AssertionError: expected 'committed' to be 'conflict' // Object.is equality
  Expected: "conflict"
  Received: "committed"
  at test/tenant/concurrency.test.ts:130:32
```

The evidence below was gathered on 2026-08-16/17 and is **not to be re-derived**:

| Observation | Evidence |
|---|---|
| It is an **assertion** failure, not a timeout | The message above; the failing line is `expect(result.outcome).toBe('conflict')` at line 130. |
| The Vitest `testTimeout` never governed it | The `it(...)` carries its own `{ timeout: 60_000 }` (line 109), which overrides both the 5000 ms default and `FND-26`'s derived value. |
| It predates every phase-2 edit | It failed on unmodified `main` content before any `FND-26` change existed. |
| It passes in isolation | ~7.7 s, green, every time. It reproduces **only** under whole-suite contention. |
| Five consecutive whole-suite runs on `ticket/FND-26` | **FAIL, PASS, FAIL, FAIL, PASS** — all three failures this same assertion; **zero** timeout failures. |
| Independently reproduced | `FND-28`'s Reviewer hit it on **both** `main` and a ticket branch, and saw the same package pass 446/446 on a re-run. |

**It is categorically NOT the defect `FND-26` repairs, and the two must not be conflated.** `FND-26`
repairs a wall-clock bound that was too close to the work; this test opted out of that bound entirely
before either ticket existed. A reader who sees "intermittent failure in `packages/database` under
parallel load" and reaches for the timeout is repeating the mistake that kept this defect invisible.

### The mechanism — why the ordering inverts

The test's design is sound and its intent is recorded in the file's own header comment: *"The overlap is
made deterministic rather than left to timing luck."* The **implementation does not achieve that**, for
one specific reason.

The sequence today (`concurrency.test.ts` lines 111–137, `tx-worker.mjs` lines 44–74):

1. The parent seeds row `p1` and spawns `tx-worker.mjs` (`runWorker`, line 118).
2. The worker writes `{"outcome":"ready"}` to stdout **immediately after its imports finish**
   (`tx-worker.mjs` line 44) — before `sleepSync(300)`, and before it has even opened the database.
3. The parent `await`s `worker.ready` (line 119), then enters `withTenantTransaction` and holds SQLite's
   write lock **synchronously** via `blockFor(HOLD_MS)` (lines 123–126), where
   `HOLD_MS = 300 + APP_SQLITE_BUSY_TIMEOUT_MS + 1500`.
4. The expectation is that the worker exhausts its busy timeout against a lock it cannot get, and
   returns `outcome: 'conflict'`.

**`worker.ready` signals that the worker process is up — not that it has attempted its write.** The only
thing separating the two processes is the worker's fixed `WORKER_ATTEMPT_DELAY_MS = 300` head start
delay, whose comment states its purpose exactly: *"Just enough for this process to get from the
readiness callback into `BEGIN IMMEDIATE`."* Under CPU contention — which is precisely what a
full-parallelism `pnpm test` produces — the parent can be descheduled for longer than 300 ms between
resolving the `ready` promise and reaching `BEGIN IMMEDIATE`. When that happens the ordering inverts: the
worker opens its connection, takes the lock, commits, and reports `committed`. The parent then takes the
lock unopposed, and asserts against a conflict that never had the chance to occur.

**So the test's correctness rests on a timing assumption the scheduler is free to violate.** That is a
defect in the test, not in the guarantee: nothing observed so far suggests the production transaction
code ever lost an update. The 300 ms delay is a *race that is usually won*, and this ticket's whole
content is replacing it with an ordering that cannot be lost.

### What is rejected outright — settled by the repo owner on 2026-08-17

The invariant under test — **exactly one commit, one typed `TX_CONFLICT`, never a lost update** — is a
genuine tenant-isolation guarantee under PRD §39.1/§39.4. It must still be asserted **exactly as
strongly** after this ticket as before. Every cheaper route trades that guarantee away and each is a
rejected outcome, recorded here so none is re-proposed:

- **Raising `HOLD_MS`, `WORKER_ATTEMPT_DELAY_MS` or `APP_SQLITE_BUSY_TIMEOUT_MS`.** This re-tunes the
  race; it does not remove it. A bigger number makes the failure rarer and therefore harder to
  attribute, which is strictly worse than a failure that reproduces three times in five.
- **`.skip`, `.todo`, `it.only`, `retry`, `test.concurrent` changes, or any per-test flake annotation.**
  A test that is allowed to be flaky has stopped guarding anything.
- **Weakening the assertions** — accepting either outcome, asserting only that no lost update occurred,
  or dropping the `TenantAccessError` / `TX_CONFLICT` checks. The typed error is half of what PRD §39.4
  promises.
- **Deleting the test**, or replacing the two-process design with a same-process one. `tx-worker.mjs`'s
  header states why two processes are required: *"Two handles inside one process can share cache and
  can be serialised by the event loop, so a same-process 'concurrency' test passes by accident as often
  as it passes for the right reason."*

### Accepted caveats, carried forward

- **This ticket does not prove the production transaction code correct.** It makes one test observe one
  guarantee reliably. If the investigation finds the defect is in `packages/database/src/**` rather
  than in the test, that is an escalation (see Feedback obligation), not a widening.
- **Intermittency cannot be disproved by a green run.** It can only be made *unlikely* by repetition and
  *implausible* by construction. That is why acceptance requires both a repetition item **and** a
  positive control: repetition alone is how this defect survived for weeks.
- **A deterministic test may be slower.** Acceptable: the `{ timeout: 60_000 }` budget is ample and this
  is one test.

## Goal

Replace the timing assumption in `packages/database/test/tenant/concurrency.test.ts` with an ordering
that the operating-system scheduler cannot invert, so that the PRD §39.1/§39.4 guarantee it asserts —
one commit, one typed `TX_CONFLICT`, no lost update — is observed on **every** run rather than on most
runs, and `pnpm test` stops failing intermittently under full parallelism. Completion is mechanically
checkable: the whole suite is green on **at least five consecutive** full-parallelism runs with each
run's outcome recorded; a positive control shows the test still fails when the conflict-producing
condition is removed; the assertions are byte-identical in strength; and the diff is one file.

## Non-goals

- **No weakening of any assertion.** `expect(result.outcome).toBe('conflict')`,
  `expect(result.name).toBe('TenantAccessError')`, `expect(result.code).toBe('TX_CONFLICT')` and
  `expect(row['label']).toBe('written-by-parent')` all survive with the same strength. Accepting either
  outcome, or asserting only the absence of a lost update, is a **rejected outcome**.
- **No `.skip`, `.todo`, `it.only`, `retry`, per-test retry/flake annotation, `continue-on-error` or
  exit-code swallow**, in the suite or in CI. Rejected outcomes.
- **No re-tuning of a timing constant as the fix.** Raising `HOLD_MS`,
  `WORKER_ATTEMPT_DELAY_MS` or `APP_SQLITE_BUSY_TIMEOUT_MS` to make the race easier to win is a rejected
  outcome (Background). A constant may still *move* as a consequence of a new mechanism — for example a
  hold that no longer needs to cover process start-up — but a diff whose only change is a larger number
  does not meet this ticket.
- **No deletion of the test and no move to a same-process design.** Two OS processes stay two OS
  processes (`tx-worker.mjs` header). Rejected outcomes.
- **No change to `packages/database/src/**`.** Not `src/tenant/transaction.ts`, not
  `src/tenant/repository.ts`, not `src/tenant/connection.ts`, not `src/migrate/pragmas.ts`. Production
  transaction and tenant code is read-only here; see Feedback obligation 2 for what to do if the
  investigation points there.
- **No change to `APP_SQLITE_BUSY_TIMEOUT_MS`** — it is production configuration in
  `src/migrate/pragmas.ts` and is read-only here (a special case of the line above, called out because
  it is the constant most likely to be reached for).
- **No change to any other test in `packages/database/test/**`**, including `tenant/helpers.ts` and
  `tenant/context.test.ts` (the latter is `FND-30`'s single line this phase — do not contend for it).
- **No change to `tools/vitest.config.mjs` or `tools/workspace-script.mjs`** — `FND-26`'s, and `FND-26`
  is `blocked_by` this ticket. A timeout is not the repair here (Background).
- **No new dependency, no new fixture directory, and no network.** Whatever mechanism is chosen must
  work offline with the packages already installed.
- **No product code, no other module's test tree, no `.github/workflows/**`.** PRD-02 §3.

## File-scope (write-owns)

Owned by this ticket — **one file, and nothing else**:

- `packages/database/test/tenant/concurrency.test.ts` — the ordering mechanism and the constants that
  serve it. The four assertions and the test's title are unchanged.

Does not touch:

- `packages/database/test/tenant/tx-worker.mjs` — **read-only here, and this is the boundary most likely
  to be tested by the chosen design.** See Open questions **Q-CI-E**: if the mechanism genuinely
  requires the worker to emit a second signal, that is a file-scope amendment decided by the Architect
  (+0.1, `--sync`) **before** the file is touched, not a quiet widening.
- `packages/database/src/**`, `packages/database/migrations/**`,
  `packages/database/{package.json,tsconfig.json}` — `01-app-data`'s, and production code besides.
- `packages/database/test/**` other than `tenant/concurrency.test.ts` — `01-app-data`'s;
  `tenant/context.test.ts` is `FND-30`'s one-line edit this phase.
- `tools/vitest.config.mjs`, `tools/workspace-script.mjs` — `FND-26`'s this phase.
- `.codex/scripts/**` — `FND-30`'s this phase.
- `.claude/**`, `CLAUDE.md`, `templates/**`, `docs/PRD.md`, `docs/adr/**` — frozen or unallocated.
- `docs/prd/**` — the Architect's; changed by a docs PR before this ticket executes.
- every other product tree — PRD-02 §3.

**Cross-module declaration.** `packages/database/**` is `01-app-data`'s write-owns tree, so a
`00-foundation` ticket writing a file there is an out-of-file-scope edit, **declared here rather than
performed quietly** — on exactly the footing `FND-25` and `FND-28` declared, for the same reason. The
edit is **test-only**, confined to one file, opens no other suite, and exists because a `00-foundation`
phase-2 ticket (`FND-26`) cannot discharge its acceptance while this test is intermittent. Re-running
the delivered `DATA-01` to repair a test-harness ordering bug would be the wrong owner as well as the
slower route.

**Serial-safety analysis.** `packages/database/test/tenant/concurrency.test.ts` is declared in **no**
other ticket's file-scope under `docs/prd/**` — verified by search on 2026-08-17. The other two phase-2
tickets in flight declare `.codex/scripts/*.mjs` plus `packages/database/test/tenant/context.test.ts`
(`FND-30`) and the two `tools/` files (`FND-26`), so all three may run as parallel lanes. `FND-26` is
`blocked_by` this ticket and therefore never concurrent with it.

**Merge safety under the protection that is already live.** The six required contexts are
`API/OpenAPI compatibility`, `Migration and tenant-schema validation`, `Tenant isolation, auth and
permission tests`, `PII and citation validation suites`, `Rust builds/tests` and
`Retrieval/evaluation smoke set`. This file runs inside the second and third, so this ticket **does**
write an input to two required contexts. **Verify rather than assume** — acceptance requires all six
green on the pull request, by name.

## Deliverables

1. **A deterministic ordering, stated as a property in a comment at the mechanism.** The worker must be
   **observably unable to obtain the write lock** before the parent decides anything — established by
   construction or by an observation the parent actually makes, never by a delay that is assumed to be
   long enough. The mechanism is the Builder's design choice; the **property** is the acceptance item:

   > On every run, the parent holds the SQLite write lock **before** the worker's write can succeed, and
   > this fact is either structurally guaranteed or observed, not assumed from elapsed time.

   Two shapes are worth naming so the Builder does not have to rediscover them; neither is mandated:
   **(a)** take the lock *first* and spawn the contender *afterwards*, from inside the transaction, so
   the worker cannot exist before the lock is held — `child_process.spawn` creates the child at call
   time, so this is expressible entirely within the owned file; **(b)** have the parent observe a signal
   that the worker is actually blocked — which, as written today, would require a second handshake line
   from `tx-worker.mjs` and therefore **Q-CI-E** must be resolved first. If the chosen design makes
   `WORKER_ATTEMPT_DELAY_MS` unnecessary, remove it rather than leaving a dead constant that reads like
   a surviving timing assumption.

2. **The header comment is corrected to describe what the file now does.** The file already claims
   *"The overlap is made deterministic rather than left to timing luck"* — a claim that was false when
   this ticket was written, and is the reason nobody re-read the mechanism for weeks. The rewritten
   comment must state **how** determinism is achieved and **why the previous approach was not**, in a
   few lines, naming `FND-29`. A comment that repeats the old claim without the mechanism does not
   discharge this deliverable.

3. **A positive control proving the test still bites.** Demonstrate, by a temporary working-tree edit
   that is restored afterwards, that the test **fails as designed** when the conflict-producing
   condition is removed — for example by shortening or removing the parent's hold so the worker's write
   succeeds, which must produce the `expected 'committed' to be 'conflict'` failure, and by leaving the
   parent's write in place so the lost-update assertion (`label === 'written-by-parent'`) is the thing
   that breaks. Record the runner output for each control and then show `git status --porcelain`
   **clean**. **A test that passes deterministically because it no longer tests anything is the failure
   mode this deliverable exists to exclude**, and a green run is not evidence against it.

4. **The four assertions are unchanged.** `outcome === 'conflict'`, `name === 'TenantAccessError'`,
   `code === 'TX_CONFLICT'`, `label === 'written-by-parent'` — same assertions, same strength, same
   test title. Verified by diff reading (acceptance), not by intention.

5. **The repetition evidence, run by run.** The table required by acceptance item 4 below: **N >= 5**
   consecutive full-parallelism `pnpm test` runs with each run's outcome, pass count, wall-clock
   duration and — for this file specifically — the observed duration of the concurrency test. Runs are
   reported **individually**; an aggregate "all green" line does not discharge it, and a red run among
   them fails the item rather than being re-rolled away.

## Acceptance checklist (classified)

**Before any run**, confirm `node -v` prints `v24.18.0` (CLAUDE.md). A red suite under Node 22.11.0 is
an environment fault, not a regression — its signature is `node:internal/modules/esm/get_format`, which
is neither this defect nor `FND-26`'s.

- [ ] `[machine]` **The reported defect is characterised before it is fixed.** The PR records at least
      one reproduction of `AssertionError: expected 'committed' to be 'conflict'` at
      `test/tenant/concurrency.test.ts:130` under a full-parallelism `pnpm test` on the branch's base,
      **and** records that the test passes in isolation on the same commit. Fixing an intermittent
      failure without first reproducing it is how a fix that changes nothing gets believed.
- [ ] `[machine]` **The ordering is deterministic by construction or by observation, not by delay.** The
      diff contains the mechanism and the comment required by deliverables 1–2, and the PR states in one
      paragraph *why the scheduler can no longer invert the order*. A diff whose only substantive change
      is a larger timing constant fails this item outright (Non-goals).
- [ ] `[machine]` **Positive control — the test still catches a lost update.** With the parent's hold
      removed or shortened so the worker's write succeeds, the test **fails**, and the failure is the
      expected one (`'committed'` where `'conflict'` was expected, and/or the `label` assertion). The
      runner output for each control is pasted into the PR and the working tree is restored with
      `git status --porcelain` shown **clean** (deliverable 3). **This item, not the green runs, is what
      proves the determinism is real rather than lucky.**
- [ ] `[machine]` **The whole suite is green on N >= 5 consecutive full-parallelism runs, recorded
      individually.** `pnpm test` (no `--no-file-parallelism`, no serial flag, no reduced worker count)
      exits 0 on each of N consecutive runs, N stated, N >= 5, with **each run's** outcome, pass count
      and wall-clock duration in the PR, plus the concurrency test's own duration per run (deliverable
      5). The baseline for comparison is stated too: FAIL, PASS, FAIL, FAIL, PASS on five runs before
      this ticket. **Any red run among the N fails this item; do not re-roll for a better sample.** The
      PR must say plainly that repetition alone is evidence of *rarity*, not of correctness, and that
      the positive-control item is what carries the correctness claim.
- [ ] `[machine]` **The assertions did not move.** `git diff main...HEAD` shows the four `expect(...)`
      calls unchanged in text and strength, the `describe`/`it` titles unchanged, and no `.skip`,
      `.todo`, `it.only`, `retry` or deleted `it(` anywhere (deliverable 4; Non-goals). State this
      explicitly in the PR.
- [ ] `[machine]` **The diff is one file.** `git diff --name-only main...HEAD` lists exactly
      `packages/database/test/tenant/concurrency.test.ts`. In particular
      `packages/database/test/tenant/tx-worker.mjs`, `packages/database/src/**` and
      `src/migrate/pragmas.ts` are **unchanged** (File-scope; Non-goals). If **Q-CI-E** was resolved in
      favour of a second handshake, this item reads against the amended file-scope recorded in this
      ticket at +0.1 — and the amendment must be visible in the Changelog before the diff is judged.
- [ ] `[machine]` **The package's own suite is green in isolation too.**
      `pnpm --filter @taxrag/database test` exits 0 with the pass count stated in the PR (446 at the
      time of writing), so a fix that only survives contention is distinguished from one that only
      survives isolation.
- [ ] `[machine]` **The branch is mergeable under the live protection**, and in particular the two
      contexts this file is an input to — `Migration and tenant-schema validation` and
      `Tenant isolation, auth and permission tests` — are green. All six names and conclusions pasted
      into the PR (File-scope).
- [ ] `[machine]` **Full suite green — the standing item** (PRD §20.3, §45.3). `pnpm test` exits 0 with
      the pass count stated in the PR; `pnpm typecheck` green. `pnpm lint` is **`FND-30`'s** subject and
      exits 1 on `main` today for reasons entirely outside this file; report its result and state
      whether the 11 problems are exactly the pre-existing set, so this ticket is neither blocked by
      them nor credited with them.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**none** — a test-harness repair
      under PRD §20.3/§45.3 guarding PRD §39.1/§39.4; unblocks `FND-26`), user-visible change
      (**none** — test code), schema/API/event compatibility (**none**), tenant/PII/security impact
      (**the guarantee under test is unchanged** — no assertion weakened, no production transaction code
      touched; state that the test's *coverage* of the single-writer rule is the same or stronger),
      source/licence impact (**none**), cost impact (**none** beyond this test's own runtime — state
      it), rollback path (revert the commit — which restores the intermittent failure and re-blocks
      `FND-26`, so the rollback note must say so), known gaps (the three Accepted caveats, and
      **Q-CI-E**'s resolution if it was exercised).

**Absent classes.** No `[fixture]` criteria — nothing here is a PRD §40.8 adapter fixture or a §14/§43
evaluation replay. No `[human]` criteria — test-only change with a mechanical acceptance surface and no
customer-visible behaviour; no PRD §41.2 `UAT-*` script applies. No Rust or Python surface.

## Test plan

Reviewer steps. All offline; no network. **Step 0 in every shell:** confirm `node -v` prints
`v24.18.0`. Harness: Vitest, via `pnpm --filter @taxrag/database test` for the file and `pnpm test` for
the workspace.

1. **Read the diff for a weakened test first.** Any assertion relaxed, any title changed, any `.skip`,
   `.todo`, `retry` or deleted `it(` is a **rejected outcome** (Non-goals), not a style comment. Then
   read the mechanism and satisfy yourself it cannot be inverted by the scheduler — if the argument for
   determinism is *"the delay is now long enough"*, the ticket is not met.
2. **Re-run the positive controls yourself**, in the working tree, restoring after each. This is the
   heart of the review: a deterministic test that no longer produces the conflict it asserts would pass
   every repetition and guard nothing.
3. **Re-run the repetition yourself** — N >= 5 consecutive full-parallelism `pnpm test` runs, exit 0
   each time. Do not substitute one run and do not use a serial or reduced-worker run: the defect only
   appears under contention, so a serial green run is the *absence* of the test.
4. **Check the boundary.** `git diff --name-only main...HEAD` is one file. If `tx-worker.mjs` appears,
   confirm the file-scope amendment (**Q-CI-E**) is recorded in this ticket's Changelog **before** the
   commit that touched it; an undeclared widening is a BOUNCE regardless of whether the code is good.
5. **Confirm no production code moved.** `packages/database/src/**` and `src/migrate/pragmas.ts` are
   untouched; `APP_SQLITE_BUSY_TIMEOUT_MS` is byte-identical.
6. **Suite and gates.** `pnpm test` and `pnpm typecheck` green on the branch; `pnpm lint`'s output
   compared against the known pre-existing 11 problems (`FND-30`), not treated as this ticket's;
   `pnpm test` re-run on `main` after the merge.

## Open questions

| ID | Question | Status | Decides |
|---|---|---|---|
| **Q-CI-E** | If the chosen determinism mechanism requires the worker to emit a second signal (*"I am now blocked on the lock"*), `packages/database/test/tenant/tx-worker.mjs` must be edited — and it is **not** in this ticket's file-scope. Does the file-scope gain it, or must the mechanism stay inside `concurrency.test.ts`? | **OPEN — does not block the start of the ticket.** Shape (a) in deliverable 1 (take the lock, then spawn) is expressible in the owned file alone and is the route to try first. Only if that is measured to be insufficient does this question need an answer. | **The Architect**, on the Builder's report of what was measured; the repo owner if the widening is contested. Route: +0.1 to this ticket, docs PR, `publish-tickets.mjs --sync`, then build. |

## Feedback obligation

**General rule.** If implementation falsifies anything here, update **this ticket** first — version
+0.1 with a changelog line — then change code, then re-publish the issue
(`publish-tickets.mjs --sync`). Never patch spec into a plan, into code, or by hand-editing the issue
(CLAUDE.md, issue #53).

1. **No mechanism inside `concurrency.test.ts` alone is sufficient.** → That is **Q-CI-E**. Record what
   was tried and what was measured, raise it with the **Architect**, and wait for the +0.1 amendment
   before editing `tx-worker.mjs`. Do **not** fall back to a longer delay while waiting: a re-tuned race
   reported as a fix is worse than a reported blocker.
2. **The investigation concludes the defect is in production code** — `withTenantTransaction`, the
   busy-timeout pragma, or the repository layer genuinely permits a lost update or fails to raise a
   typed `TX_CONFLICT`. → **Stop and report.** That is a tenant-isolation defect in `01-app-data`, not a
   test-harness bug, and it is emphatically not this ticket's to fix — a `00-foundation` ticket silently
   editing `packages/database/src/**` would be exactly the failure this repo's file-scope discipline
   exists to prevent. Escalate to the human and raise it with the **Architect** as a ticket for the
   owning module, with the reproduction attached.
3. **The test becomes deterministic but slow** — for example the hold must now cover a longer worker
   start-up. → Acceptable within the existing `{ timeout: 60_000 }`; record the measured duration in the
   PR so `FND-26`'s survey and this number stay consistent. If it approaches the 60 s budget, record
   that here (+0.1) and raise it rather than raising the budget silently.
4. **Somebody proposes `retry: 2` (or a Vitest flake annotation) "because it is only a test".** →
   Rejected by the repo owner on 2026-08-17. A retried test reports the same green as a correct one and
   is how this class of defect becomes permanent. Raise it with the **Architect** if the argument is
   genuinely new.
5. **`pnpm test` is still intermittently red after the fix, on a different file.** → That is a separate
   finding, not a failure of this ticket's mechanism *and not automatically a `FND-26` timeout either* —
   read the failure text before attributing it. Record the file, the assertion or timeout text, and the
   run in which it appeared, and raise it with the **Architect**. Do not absorb it into this ticket's
   scope.

**Escalation.** If the guarantee cannot be observed deterministically by any mechanism that keeps two OS
processes and the four assertions, then what needs a decision is how this repository tests
single-writer semantics at all — not this ticket. Stop, escalate to the human, and raise it with the
**Architect**. **Never** resolve it by skipping the test, retrying it, weakening an assertion, or
accepting either outcome: PRD §39.1/§39.4 is a tenant-isolation guarantee, and a test that no longer
distinguishes a conflict from a lost update discharges nothing.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-17 | Initial ticket. Repairs the intermittent **assertion** failure `expected 'committed' to be 'conflict'` at `packages/database/test/tenant/concurrency.test.ts:130`, which fails under whole-suite parallel load and passes in isolation (~7.7 s). Records the evidence so it is not re-derived: the test carries its own `{ timeout: 60_000 }` so the Vitest `testTimeout` — 5000 ms before `FND-26`, the derived value after — **never governed it**, and it is categorically **not** the timeout defect `FND-26` repairs; it failed on unmodified `main` content before any `FND-26` edit existed; five consecutive whole-suite runs on `ticket/FND-26` gave **FAIL, PASS, FAIL, FAIL, PASS**, all three failures this same assertion and zero timeouts; and `FND-28`'s Reviewer reproduced it independently on both `main` and a ticket branch. Records the **mechanism**: `tx-worker.mjs` writes `{"outcome":"ready"}` immediately after its imports, before `sleepSync(300)` and before it opens the database, so `worker.ready` means *the process is up*, not *it has attempted its write*; the only thing separating the two processes is the fixed `WORKER_ATTEMPT_DELAY_MS = 300` head start, and under CPU contention the parent can be descheduled for longer than that between resolving `ready` and reaching `BEGIN IMMEDIATE`, so the worker commits and reports `committed`. The test's correctness therefore rests on a timing assumption the scheduler is free to violate — which is why the file's own header claim, *"The overlap is made deterministic rather than left to timing luck"*, is false today and must be corrected as part of the fix. Requires the ordering to be deterministic **by construction or by observation**, states the property rather than an implementation, and names two candidate shapes (spawn the contender from inside the held transaction; or a second worker handshake, which needs **Q-CI-E** first). Makes rejected outcomes explicit: raising `HOLD_MS` / `WORKER_ATTEMPT_DELAY_MS` / `APP_SQLITE_BUSY_TIMEOUT_MS` (re-tunes the race rather than removing it, and makes the failure rarer and so harder to attribute), `.skip`/`.todo`/`it.only`/`retry`/any flake annotation, weakening the assertions to accept either outcome or to check only that no lost update occurred, and deleting the test or making it same-process. Acceptance pairs an honest repetition item — N >= 5 consecutive full-parallelism `pnpm test` runs, each recorded individually, no re-rolls — with a **positive control** proving the test still fails when the conflict-producing condition is removed, and says plainly that repetition proves rarity while the control carries the correctness claim. File-scope is one file, with the cross-module `packages/database` edit declared on the footing `FND-25` and `FND-28` used, and an escalation rather than a widening if the defect turns out to be in production transaction code. Carries `blocks: [FND-26]` and an empty `blocked_by`: it is a root, and `FND-26` cannot discharge its standing five-consecutive-green-runs item while this test fails roughly three runs in five. |
