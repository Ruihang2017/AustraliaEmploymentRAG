---
id: FND-26
title: A global Vitest testTimeout, derived from the slowest measured test
module: 00-foundation
lane: 00-foundation
size: M
agent: builder
status: draft
date: 2026-08-16
blocked_by: [FND-29, FND-30]
blocks: [FND-23]
---

# FND-26 — A global Vitest `testTimeout`, derived from the slowest measured test

Repairs the first of the three CI jobs that are red on `main` @ `5ac25c2`, against PRD §20.3 / §45.3
(the `pnpm test` gate must be **correct**, not merely loud) and PRD-02 §1's root cause (local green and
CI green must mean the same thing). No ADR — nothing here decides a new rule; a test-runner timeout is
a runner setting, and the only judgement in it is the number, which deliverable 2 derives from
measurement rather than taste. Same defect class as `FND-11`, `FND-12`, `FND-19` and `FND-25`: a guard
whose *bound* is wrong for the work it is guarding, repaired at the guard rather than by weakening the
work.
Parent sub-PRD for this phase: [breakdown-plan-02-ci-repair.md](../../breakdown-plan-02-ci-repair.md)
— that file, not the frozen `00-foundation/README.md`, carries this phase's file-scope allocation (§3)
and decision register (§4); this ticket is a **seventh** phase-2 ticket appended to `00-foundation`
under **D-CI2** (*"this phase appends tickets to `00-foundation`; no module 25 is created"*), continuing
the ids past `FND-25`. Master spec: [PRD](../../../PRD.md).
Depends on: nothing. **This ticket is a root** — it is `blocked_by` nothing and must land **before**
[FND-23](FND-23-ci-local-entry-point-and-nanoid-override.md) can be green, because `FND-23`'s headline
acceptance is `pnpm ci:local` exiting 0 and `ci:local` derives its command set from `ci.yml`, so a red
`pnpm test` inside `ts-type-unit` is a red `ci:local` by construction. Hence `blocks: [FND-23]`.
**Why `builder`:** a measurement pass, one derived number, and that number threaded through the two
existing `tools/` dispatch paths from a single definition site — to a route the repo owner determined
**empirically** on 2026-08-16 (Background, *The route*). No new subsystem, no product surface.
**Q-CI-D is resolved and is no longer blocking**: this ticket carries a route rather than an escalation.

## Authorization — read this first

`tools/vitest.config.mjs` and `tools/workspace-script.mjs` are **repo-wide files that change the
pass/fail contract for every lane**. `.claude/agents/reviewer.md` requires such a file to carry an
**explicit human OK** before it lands, and the Reviewer must not have to infer one. It is recorded here
so it is in the spec rather than in a conversation:

> **The repo owner authorised touching `tools/vitest.config.mjs` for this purpose on 2026-08-16**, in
> the session that asked *"can CI go green?"*, having been told that the alternative — a per-test
> `timeout` argument on the one failing test — would leave the same defect live in every other heavy
> test in the repository.

> **The same owner authorised extending that scope to `tools/workspace-script.mjs` on 2026-08-16**,
> after the four experiments in *The route* (below) showed that a `testTimeout` in
> `tools/vitest.config.mjs` alone cannot reach the nine member suites — i.e. cannot fix the reported
> failure at all — and that the delegator is the only file inside `00-foundation`'s own scope through
> which it can.

The authorization is for **one global test timeout, single-sourced, and nothing else**. It is not an
authorization to change `include`, `environment`, `reporters`, `root`, to add pools, setup files,
coverage or projects, or to change any other behaviour of the delegator — its script resolution, its
owner-line reporting, its exit codes and its two-step dispatch order are untouched (Non-goals).

## Background + basis

### The reported failure — settled, do not re-diagnose

CI job **`TypeScript type/unit tests`** on `main` @ `5ac25c2`:

```
packages/domain/test/answers/decide-answer-status.property.test.ts:140
  "holds every invariant over 10000 generated signal records"
  Error: Test timed out in 5000ms
```

Observed elapsed on two runs: **7746 ms** and **7859 ms**. The test is not hung, not deadlocked and not
wrong — it draws 10,000 cases from fixed seeds (`FND-07` acceptance item 4, `[machine]` property test)
and it completes. It completes **later than 5000 ms**.

### The root cause — one missing setting, not one slow test

**Nothing in this repository configures `testTimeout` anywhere.** Verified on `main` @ `5ac25c2`:
`git ls-files` matching `vite(st)?.(config|workspace)` returns exactly **two** files —
`tools/vitest.config.mjs` and `packages/ui/vitest.config.ts` — and neither sets `testTimeout`. Every
test in the repository therefore runs on Vitest's **5000 ms default**.

That single fact explains a second, longer-running symptom as well, and the two must be fixed together
or the second will be rediscovered as a new bug. Under whole-suite **parallel** load, different heavy
files have timed out on different runs — observed across `apps/api/test/request-id.test.ts`,
`apps/api/test/errors.test.ts`, `packages/model-gateway`, `tools/tests/scripts.test.mjs` and
`packages/database` — **each of them passing in isolation**, and a fully **serial** run of the whole
suite green. That is the signature of a wall-clock bound that is too close to the work, not of a race:
under contention a test that takes 3–4 s alone drifts past 5 s, and *which* test drifts is a function of
scheduling. It has been read as a "wandering flake" for weeks. It is one missing setting with many
symptoms.

### What `tools/vitest.config.mjs` actually governs — measure this before changing anything

**This is the item most likely to make a well-intentioned fix inert, so it is stated as a finding, not
as an assumption.** Read off `main` @ `5ac25c2`:

- Root `pnpm test` → `node tools/workspace-script.mjs test`, whose `ROOT_IMPLEMENTATIONS.test` is
  `vitest/vitest.mjs` with args `['run', '--config', 'tools/vitest.config.mjs']`. That run's `include`
  is exactly `['tools/tests/**/*.test.mjs']`.
- The delegator's **step 2** then runs `pnpm -r --if-present run test`. Nine workspace members declare a
  `test` script — `apps/api`, `packages/contracts`, `packages/database`, `packages/domain`,
  `packages/model-gateway`, `packages/observability`, `packages/pii`, `packages/sdk-typescript`,
  `packages/ui` — and every one of them is the bare string `vitest run`, executed with the member
  directory as cwd.
- Vite resolves a config file from its `root` (default: cwd) and **does not search parent
  directories**. Only `packages/ui` has a config file of its own.

So `tools/vitest.config.mjs` today governs `tools/tests/**` and nothing else, and
`packages/domain/test/answers/decide-answer-status.property.test.ts` — the test that is actually
failing — runs under **member-local Vitest defaults**.

**Consequence — do not re-propose the config-only fix.** A `testTimeout` added to
`tools/vitest.config.mjs` alone fixes the `tools/tests/**` half of the symptom and leaves the reported
failure exactly where it is. The three facts above are the whole reason: `include` is
`['tools/tests/**/*.test.mjs']`, all nine members declare a bare `vitest run`, and Vite does not search
parent directories, so no member run ever loads that file. A future reader who proposes "just set it in
the shared config" is re-proposing something already measured and rejected here.

### The route — Q-CI-D, resolved empirically on 2026-08-16

**This was settled by experiment, not by inspection**, on `main` @ `5ac25c2` under Node `v24.18.0`
against `@taxrag/domain` (58 files / 1139 tests). The control is a deliberately impossible
`--testTimeout=1`: if it does not turn the suite red, the flag never reached Vitest.

| Invocation | `--testTimeout=1` result | Conclusion |
|---|---|---|
| `pnpm --filter @taxrag/domain run test -- --testTimeout=1` | 58 files, 1139 tests **passed**, exit 0 | The flag **never reached Vitest**. pnpm injects a literal `--`, observed as `vitest run "--" "--testTimeout=1"`, which neutralises it. |
| `pnpm --filter @taxrag/domain run test -- --testTimeout=30000` | passed, exit 0 | A **false green** — indistinguishable from a working fix without the 1 ms control. |
| `pnpm --filter @taxrag/domain exec vitest run --testTimeout=1` | **53 files / 145 tests failed** | The flag itself is effective when no stray `--` is present. |
| `pnpm --filter @taxrag/domain run test --testTimeout=1` | **51 files / 142 tests failed** | Forwarding works **without** the `--` separator. **This is the chosen form.** |

**The `--`-separated form is a rejected outcome.** It is not merely useless: it produces a green suite
that looks exactly like success, which is how an inert change reaches `main`. Row 2 is the reason
acceptance in this ticket is written around the 1 ms positive control rather than around a green run.

**The route is `tools/workspace-script.mjs`, and it has _two_ dispatch paths — both need the timeout,
and missing either one is the failure this ticket was nearly written with:**

1. **The workspace members** (`runPnpmRecursive`, ~line 103):
   `spawnSync('pnpm', ['-r', '--if-present', 'run', name], …)` must carry `--testTimeout=<N>` in the
   **no-separator** form. Note this function has **two** `spawnSync` branches — the `npm_execpath` one
   (taken when the script was reached through `pnpm run`, i.e. the normal `pnpm test` path) and the
   bare-`pnpm` fallback. **Both** branches dispatch member suites; a timeout added to only one is
   reachable-in-testing and inert in normal use.
2. **The tools suite itself** (`ROOT_IMPLEMENTATIONS.test`, ~line 37):
   `{ module: 'vitest/vitest.mjs', args: ['run', '--config', 'tools/vitest.config.mjs'] }`. This path
   does **not** go through `pnpm -r`, so it needs the timeout independently — either as an added arg
   here or as `testTimeout` in `tools/vitest.config.mjs`.

**The number must exist exactly once in the repository.** Both paths must read one constant; the value
must not be transcribed into a second place. A duplicated literal that drifts is precisely the defect
class `FND-27` exists to repair and that `FND-11`, `FND-12` and `FND-19` established — reproducing it
inside the ticket that repairs the test suite would be self-defeating. The mechanism is the Builder's
choice (an export from one of the two owned files, imported by the other, is the obvious shape); the
**property** is an acceptance item and is mechanically checkable (deliverable 4).

### What is rejected outright

Making a slow test fast by making it weaker is a **rejected outcome** and is the reason this ticket
exists rather than a one-line edit to the property test. Specifically: reducing `CASES` below 10,000
would contradict `FND-07` acceptance item 4 (*">= 10,000-case property run is the acceptance item as
written"*); `.skip`/`.todo` discards the guarantee; and a per-test `timeout` argument fixes one line and
leaves the other five observed symptoms live. The repo owner rejected all three on 2026-08-16.

### Accepted caveats, carried forward

- **A longer timeout makes a genuinely hung test slower to report.** That is the accepted cost. The
  mitigation is that the number is *derived* (deliverable 2) rather than generous: it is bounded by the
  slowest measured test times a stated headroom factor, and the derivation is written in a comment at
  the definition site so the next person raising it has to redo the measurement.
- **A timeout is a wall-clock bound and CI hardware is not this workstation.** The survey is taken
  locally; the headroom factor exists precisely because the CI runner is slower and more contended. The
  acceptance items require the CI evidence as well as the local evidence, so the factor is checked
  against reality rather than argued.
- **This ticket does not make the suite fast.** Slow tests stay slow; deliverable 1 makes them
  **known** — a written list with measured durations — so the next one to drift past a bound is
  recognised rather than rediscovered.

## Goal

Give the repository a single, derived, documented Vitest test timeout in place of the implicit 5000 ms
default — **reaching every suite `pnpm test` runs**, not only `tools/tests/**` — so that a test that
legitimately takes seconds is bounded by a number somebody chose against a measurement, and so the
intermittent whole-suite timeouts stop being attributed to flakiness. Completion is mechanically
checkable: the derived value is defined **once**, with its derivation recorded beside it, and reaches
both `tools/` dispatch paths; setting that one definition to `1` turns **both** the member suites and
the tools suite red (the positive control); the survey of near-bound tests exists in the pull request
with measured durations; the named property test passes **on CI**; `pnpm test` at full parallelism
passes on **five consecutive runs**; and the diff is the two `tools/` files and nothing else.

## Non-goals

- **No change to any test's logic, anywhere.** Not an assertion, not a title, not a helper, not a
  fixture. Rejected outcome.
- **No reduction of any property test's case count.** `CASES = 10_000` in
  `packages/domain/test/answers/decide-answer-status.property.test.ts` stays 10,000, and no other
  property or fuzz run is shortened, re-seeded or sampled down to fit a bound. `FND-07` acceptance item
  4 is the governing spec and this ticket may not amend it. Rejected outcome.
- **No `.skip`, `.todo`, `it.only`, `test.concurrent` change, `retry`, `continue-on-error` or exit-code
  swallow**, in any suite or in CI. A test that is allowed to be flaky is a test that has stopped
  guarding anything. Rejected outcomes.
- **No per-test or per-file `timeout` argument** added to work around the global value. If a specific
  test genuinely needs more than the global bound, that is Feedback obligation 3 — record it and raise
  it — not a local override slipped in beside the fix.
- **No other key in `tools/vitest.config.mjs`.** `root`, `include`, `environment` and `reporters` are
  byte-identical to `main`. No `hookTimeout`, `teardownTimeout`, `pool`, `poolOptions`, `maxWorkers`,
  `fileParallelism`, `sequence`, `retry`, `coverage`, `setupFiles` or `projects` — each of those changes
  something other than the bound, and several would mask the defect instead of fixing it (a serial run
  is green today; making the suite serial would hide the problem, not solve it, and would slow every
  lane). Rejected outcomes.
- **No change to `packages/ui/vitest.config.ts`** or to any workspace member's `package.json`, `test`
  script or config file — nine other modules' files. The resolved route (Background, *The route*)
  deliberately reaches none of them: that is why it was chosen. A member-local config file, a member
  `test` script edit, or a new member dependency is a **rejected outcome** here even if it would work.
- **No `--`-separated flag forwarding.** `pnpm … run test -- --testTimeout=<N>` is a rejected outcome:
  pnpm injects a literal `--` and Vitest ignores the flag, producing a green suite that proves nothing
  (Background, row 1–2). The no-separator form is the specified one.
- **No second copy of the timeout value.** The number appears in exactly one definition site; every
  other use imports or interpolates it. A transcribed literal is a rejected outcome (deliverable 4).
- **No other behaviour change in `tools/workspace-script.mjs`.** `ROOT_IMPLEMENTATIONS` gains nothing
  but the timeout argument; `loadScriptOwners`, `ownerLine`, `workspaceMemberDirs`, `membersProviding`,
  `runNode`, the two-step dispatch order in `main` and every exit code are byte-identical to `main`.
- **No change to `tools/fixtures/script-owners.json` or `tools/tests/scripts.test.mjs`** — `FND-01`'s,
  and `FND-23` is mid-flight in them. If a delegator change of this size requires a test change in
  `tools/tests/scripts.test.mjs`, that is Feedback obligation 1, not a quiet widening.
- **No change to `.github/workflows/**`** — `FND-21`'s and `FND-24`'s this phase. A timeout is not a
  gate-list change.
- **No product code, no dependency change, no `vitest` version bump.** The pin stays `4.1.10` exactly
  (`tools/tests/skeleton.test.mjs` asserts exact pins; **D17**: no silent upgrade).

## File-scope (write-owns)

Owned by this ticket — **two files under `tools/`, both `00-foundation`'s, and nothing else**:

- `tools/workspace-script.mjs` — the timeout argument on **both** dispatch paths: the `pnpm -r` member
  dispatch (both `spawnSync` branches of `runPnpmRecursive`) and `ROOT_IMPLEMENTATIONS.test`. Nothing
  else in the file (Non-goals).
- `tools/vitest.config.mjs` — the single `testTimeout`/constant and the comment recording its
  derivation. Nothing else in the file.

Exactly one of the two carries the **definition** of the value; the other imports it (deliverable 4).
No third file may be added to hold it — that would widen this file-scope.

Does not touch:

- `packages/ui/vitest.config.ts` — `13-ui`'s.
- `packages/domain/**`, `apps/api/**`, `packages/database/**`, `packages/model-gateway/**`,
  `packages/contracts/**`, `packages/observability/**`, `packages/pii/**`,
  `packages/sdk-typescript/**` — the owning modules'. **Read-only here**, including for the survey,
  which only measures.
- every workspace member `package.json` — the owning modules'; the `test` script strings are untouched.
- **every test file in the repository**, including `tools/tests/**` — read-only here.
- `tools/fixtures/script-owners.json`, `tools/tests/scripts.test.mjs`, `tools/workspace-assertions.mjs`,
  `tools/tests/{layout,line-endings,pins,skeleton}.test.mjs` — `FND-01`'s; `FND-23` is in flight in the
  first two.
- `tools/ci-local.mjs`, `tools/tests/ci-local.test.mjs` — `FND-23`'s.
- `tools/fixtures/secret-patterns.json`, `tools/tests/secret-scan.test.mjs`,
  `.github/workflows/**` — `FND-02`, `FND-21`, `FND-24`.
- root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc` — `FND-01`, with `FND-23`'s
  single-key carve-out.
- `docs/PRD.md`, `docs/adr/**`, `.claude/**`, `CLAUDE.md`, `templates/**` — frozen or unallocated.
- `docs/prd/**` — the Architect's; changed by a docs PR before this ticket executes.
- every product tree — PRD-02 §3.

**Serial-safety analysis.** `tools/vitest.config.mjs` is `FND-01`'s, delivered and merged, and is named
in **`FND-23`'s does-not-touch list explicitly** (*"`tools/vitest.config.mjs` … `FND-01`; read-only
here"*), so no in-flight phase-2 ticket contends for it. No other ticket under `docs/prd/**` declares
it — verified by search.

`tools/workspace-script.mjs` is a **deliberate, serialized overlap**, recorded here rather than left to
be discovered at merge: `FND-23` also write-owns it (breakdown-plan-02 §3), to extend
`ROOT_IMPLEMENTATIONS` so a root implementation may be a repo script. The two never run concurrently —
**`FND-23` is `blocked_by: [… FND-26 …]`**, so this ticket lands first and `FND-23` builds on the
result. The dependency edge is what makes the overlap safe; if that edge is ever removed, this overlap
becomes a real file-scope collision and must be re-decided by the Architect before either runs.

**Merge safety under the protection that is already live.** The six required contexts are
`API/OpenAPI compatibility`, `Migration and tenant-schema validation`, `Tenant isolation, auth and
permission tests`, `PII and citation validation suites`, `Rust builds/tests` and
`Retrieval/evaluation smoke set`. The timeout is an input to any context that runs `pnpm test`; the
second and third also run member Vitest suites. **Verify rather than assume** — the acceptance item
*"The branch is mergeable under the live protection"* requires all six green on the pull request, by
name.

## Deliverables

1. **A survey of every test at or near the old bound — written down, with measured numbers.** Before
   changing the configuration, run the full suite and record, in a table in the pull request, **every**
   test whose measured duration is **at or above 2500 ms** (half the old bound), with:

   | Column | Content |
   |---|---|
   | file | repository-relative path |
   | test name | the `it(...)` title |
   | duration | measured milliseconds, from the runner's own reporting |
   | run mode | measured at full parallelism, and again in isolation |

   Take the measurements at **full parallelism** and **in isolation** for each entry, because the
   difference between the two is the contention headroom the chosen number has to absorb. Include the
   six files already named in Background (`packages/domain`'s property test, `apps/api/test/request-id`,
   `apps/api/test/errors`, `packages/model-gateway`, `tools/tests/scripts.test.mjs`,
   `packages/database`) whatever their measured durations turn out to be, so the wandering-flake claim
   is confirmed or corrected with numbers. **The point of this deliverable is that slow tests become
   known rather than rediscovered as future flakes**, so a survey that lists only the failing test does
   not discharge it.

2. **The timeout value, derived from the slowest observed test and not picked round.** The value must
   be derived, in the pull request and again in a comment beside its definition site, by this rule:

   > `testTimeout` >= **3 x** the slowest duration measured in deliverable 1 at full parallelism,
   > rounded up to a readable value.

   The headroom factor is not decoration: the survey is taken on this workstation and the bound has to
   hold on a slower, more contended CI runner, which is exactly the difference that produced the
   original failure. The comment must state **the slowest test, its measured duration, the factor, and
   the resulting number**, so the next person who wants to raise it has to redo the measurement rather
   than round up again. A number quoted without its measurement is a defect in this deliverable even if
   the number is right.

3. **The 1 ms positive control — proof the setting is live on BOTH dispatch paths.** A green suite is
   **not** evidence the timeout took effect; Background row 2 shows a completely inert change producing
   exactly that state. So, with the single definition site temporarily set to `1`, record the runner
   output showing failures in:

   | Dispatch path | What must go red | Evidence to paste |
   |---|---|---|
   | member suites (`pnpm -r`) | `packages/domain` (and the other member suites) | failing file/test counts |
   | the tools suite (`ROOT_IMPLEMENTATIONS.test`) | `tools/tests/**` | failing file/test counts |

   Both rows are required, separately. A run in which only one goes red means the value reaches one path
   and not the other — the exact half-fix this ticket exists to avoid — and is a **stop-and-report**
   (Feedback obligation 1), not something to note and move past. Then restore the derived value and show
   `git status --porcelain` **clean**.

4. **A single definition site for the value.** The number is defined once, in one of the two owned
   files, and consumed by the other through an import (or interpolation of the same constant). Recorded
   in the PR with the grep that proves it (acceptance: *"The value has exactly one definition site"*).

5. **Nothing else in the two files changes.** In `tools/vitest.config.mjs`, `root`, `include`,
   `environment` and `reporters` are byte-identical to `main`, and the `FND-01` header comment is
   preserved (a line may be added beneath it; none may be removed). In `tools/workspace-script.mjs`,
   only the two dispatch sites (plus the constant/import) differ (Non-goals).

## Acceptance checklist (classified)

**Before any run**, confirm `node -v` prints `v24.18.0` (CLAUDE.md). A red suite under Node 22.11.0 is
an environment fault, not a regression — and under Node 22.11.0 the failures are
`node:internal/modules/esm/get_format` errors, which are **not** timeouts and must not be mistaken for
this defect.

- [ ] `[machine]` **The reported defect is gone — on CI, with the real value.**
      `packages/domain/test/answers/decide-answer-status.property.test.ts`'s
      *"holds every invariant over 10000 generated signal records"* passes **on CI**, in the
      `TypeScript type/unit tests` job, where on `main` @ `5ac25c2` it fails with
      `Error: Test timed out in 5000ms`. Both job outputs are linked or pasted into the PR.
      **A green run is not on its own evidence that the setting took effect** — Background row 2 records
      a `--testTimeout=30000` that never reached Vitest and produced a green suite indistinguishable
      from a working fix. This item is met only together with the positive-control item below.
- [ ] `[machine]` **The 1 ms positive control turns BOTH dispatch paths red.** With the single
      definition site temporarily set to `1`: the **member** suites fail (`packages/domain` among them)
      **and** the **tools** suite (`tools/tests/**`) fails — demonstrated **separately**, with the
      failing file/test counts for each pasted into the PR (deliverable 3). One path going red while the
      other stays green fails this item outright: that is a half-fix, and it is the failure this ticket
      was nearly written with. Afterwards the working tree is restored and `git status --porcelain` is
      shown **clean** in the PR.
- [ ] `[machine]` **The value has exactly one definition site.** A grep for the literal derived value
      across the repository returns **one** definition; every other use is an import or an
      interpolation of that constant, and no member package or test file contains it. The grep command
      and its full output are pasted into the PR (deliverable 4). A second transcribed copy fails this
      item even if the two copies currently agree — that is the `FND-27` / `FND-11` / `FND-12` /
      `FND-19` defect class, and this ticket may not reintroduce it.
- [ ] `[machine]` **The flake is gone, proved by repetition and not by one green run.** `pnpm test` at
      **full parallelism** (no `--no-file-parallelism`, no serial flag, no reduced worker count) exits 0
      on **five consecutive runs**. The pass count and wall-clock duration of each of the five are
      recorded in the PR, together with the slowest test in each. **A single green run proves nothing
      about an intermittent failure** — that is precisely how this defect survived to `main`. Any run of
      the five that is red fails this item; do not re-roll for a better sample.
- [ ] `[machine]` **The survey exists and is complete.** The deliverable-1 table is in the PR, with both
      parallel and isolated durations, and covers every test at or above 2500 ms — not only the failing
      one (deliverable 1).
- [ ] `[machine]` **The number is derived, not chosen.** The PR and the comment at the definition site
      both state the slowest measured test, its duration, the >= 3x factor and the resulting value, and
      the value satisfies the rule (deliverable 2).
- [ ] `[machine]` **The forwarding form is the no-separator one.** The member dispatch passes the
      timeout **without** a `--` separator, on **both** `spawnSync` branches of `runPnpmRecursive`. The
      `--`-separated form is a rejected outcome (Background, rows 1–2); its presence anywhere in the
      diff fails this item.
- [ ] `[machine]` **No test was weakened.** `git diff main...HEAD` touches no file under
      `packages/**`, `apps/**`, `pipelines/**` or `tools/tests/**`, and contains no `.skip`, `.todo`,
      `it.only`, `retry`, changed `CASES`, changed seed set, or per-test `timeout` argument (Non-goals).
      State in the PR that `CASES` is still `10_000`.
- [ ] `[machine]` **The two `tools/` files are the ONLY diff.** `git diff --name-only main...HEAD` lists
      exactly `tools/workspace-script.mjs` and `tools/vitest.config.mjs`. Within
      `tools/vitest.config.mjs`, `root`, `include`, `environment` and `reporters` are unchanged; within
      `tools/workspace-script.mjs`, only the two dispatch sites and the constant/import differ
      (deliverable 5; File-scope).
- [ ] `[machine]` **The branch is mergeable under the live protection.** All six currently-required
      contexts are green on this pull request; names and conclusions pasted into the PR (File-scope).
- [ ] `[machine]` **Full suite green — the standing item** (PRD §20.3, §45.3). `pnpm test` exits 0 with
      the pass count stated in the PR; `pnpm lint` and `pnpm typecheck` green.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**none** — a CI gate repair under
      PRD §20.3/§45.3; unblocks `FND-23`/DEV-005 and D-CI1), user-visible change (**none** — test-runner
      configuration), schema/API/event compatibility (**none**), tenant/PII/security impact (**none** —
      no product code, no credential, no scanner touched), source/licence impact (**none** — no
      dependency added or moved), cost impact (a hung test now takes longer to report — the accepted
      caveat; state the number), rollback path (revert the commit — which returns the suite to the
      5000 ms default and re-reds `ts-type-unit`, so the rollback note must say so), known gaps (the
      three Accepted caveats; **Q-CI-D is closed** — see the Open questions section).

**Absent classes.** No `[fixture]` criteria — a runner timeout is not a PRD §40.8 adapter fixture or a
§14/§43 evaluation replay. No `[human]` criteria — repository tooling with a mechanical acceptance
surface and no customer-visible behaviour; no PRD §41.2 `UAT-*` script applies. No Rust or Python
surface.

## Test plan

Reviewer steps. All offline; no network. **Step 0 in every shell:** confirm `node -v` prints
`v24.18.0`. Harness: Vitest, via `pnpm test` for the workspace and
`pnpm --filter @taxrag/domain test` for the named suite.

1. **Read the diff for a weakened test first.** Any test deleted, skipped, retried, re-seeded,
   shortened, or given a local `timeout` argument is a **rejected outcome** (Non-goals), not a style
   comment — including in a file the Builder did not declare. The diff must be the two `tools/` files.
2. **Check the number against the survey, not against intuition.** Recompute the >= 3x rule from the
   table in the PR. A value that is correct but undocumented fails deliverable 2; a value below the rule
   fails it outright.
3. **Re-run the repetition yourself.** Five consecutive full-parallelism `pnpm test` runs, exit 0 each
   time, durations recorded. Do not substitute one run, and do not use a serial or reduced-worker run —
   the defect only appears under contention, so a serial green run is the *absence* of the test.
4. **Re-run the 1 ms positive control yourself, and check both paths.** Set the single definition site
   to `1`, run `pnpm test`, and confirm **both** that member suites fail (`packages/domain` among them)
   **and** that `tools/tests/**` fails. If either stays green the fix reaches only one dispatch path and
   the ticket is not met — do not accept a green full-value run as a substitute for this control
   (Background, rows 1–2). Also read the diff for a `--` separator in the member dispatch: its presence
   means the flag is inert regardless of what the suite reports. Restore and confirm
   `git status --porcelain` is clean.
5. **Confirm the named test passes on CI, not only locally.** Read the `TypeScript type/unit tests` job
   log on the pull request for the property test's name and its duration. A local pass with a red CI job
   is the exact failure mode PRD-02 §1 names as this phase's root cause.
6. **Confirm nothing else moved.** `git diff --name-only main...HEAD` is exactly the two `tools/` files;
   no member config, no member manifest, no `script-owners.json`, no test file.
7. **Grep the value.** Search the repository for the literal derived number: exactly one definition
   site, everything else an import. Two copies fail acceptance even when they agree.
8. **Suite and gates.** `pnpm test`, `pnpm lint`, `pnpm typecheck` green on the branch; `pnpm test`
   re-run on `main` after the merge.

## Open questions

**None open. Nothing here blocks the build.**

| ID | Question | Status |
|---|---|---|
| **Q-CI-D** | By what route does one timeout come to govern every suite `pnpm test` runs, given that nine workspace members invoke a bare `vitest run` in their own directory and Vite does not search parent directories for a config? | **RESOLVED 2026-08-16 (v1.1), empirically** — see Background, *The route*. Route: `tools/workspace-script.mjs`, both dispatch paths (the `pnpm -r` member dispatch, in the **no-separator** forwarding form, on both `spawnSync` branches; and `ROOT_IMPLEMENTATIONS.test` / `tools/vitest.config.mjs` for the tools suite), with the value single-sourced. The repo owner authorised the widened two-file scope on the same date (Authorization). Rejected: member-local config files, member `test`-script edits, `test.projects`, and any `--`-separated forwarding form. |

Recorded so it is not re-litigated: the resolution came from **four measured invocations with a 1 ms
control**, not from reading the code. Reading the code had already produced a plausible and wrong
answer twice — first "set it in `tools/vitest.config.mjs`" (inert for the reported failure), then
"forward it with `--`" (inert, and green). Any future proposal to change this route is expected to
carry the same control.

## Feedback obligation

**General rule.** If implementation falsifies anything here, update **this ticket** first — version
+0.1 with a changelog line — then change code, then re-publish the issue
(`publish-tickets.mjs --sync`). Never patch spec into a plan, into code, or by hand-editing the issue
(CLAUDE.md, issue #53).

1. **The 1 ms control leaves one dispatch path green** — the member suites pass, or `tools/tests/**`
   passes, with the value set to `1`. → **Stop and report. Do not widen the file-scope**, and do not
   report the ticket as met. Record here (+0.1, `--sync`) exactly which suites did and did not go red
   and the invocation used, and hand it to the repo owner with the Architect. Reaching into the nine
   member packages, their manifests or their test files is a **rejected outcome** — that is the
   boundary `FND-23`'s Builder respected when it hit `pnpm-workspace.yaml`, and it is why that ticket
   is correct today.
2. **The derived value turns out to be very large** — the >= 3x rule produces a number that makes a hung
   test unreasonable to wait for (say, beyond 60 s). → Do **not** quietly reduce the factor. Record the
   measurement and the number here, and raise it: a test that slow is a *test design* question for its
   owning module, and the right outcome may be both a bound and a ticket against that test. Never
   resolve it by shortening the test from here (Non-goals).
3. **One specific test needs more than the global bound.** → Record which, and its measured duration,
   here (+0.1) **before** adding anything. A per-test `timeout` argument is a Non-goal precisely because
   it is how the global defect stayed invisible; if one is genuinely warranted the ticket says so
   explicitly, with the reason, and the file it lands in is that module's, not this one's.
4. **Raising the timeout makes a previously-failing test hang instead of fail.** → That is a real
   defect the 5000 ms bound was masking, not a regression introduced here. Record it, name the test, and
   raise it with the **Architect** as a ticket for the owning module. Do **not** lower the bound to keep
   it failing fast, and do **not** skip it.
5. **Somebody proposes making the suite serial** (`--no-file-parallelism`, reduced workers, `sequence`
   settings) because the serial run is green. → Rejected. It hides the contention rather than absorbing
   it, it slows every lane, and it makes CI and local diverge again in a new direction. Raise it with
   the **Architect** if the argument is genuinely new.

**Escalation.** If a single global bound cannot be found that both admits every legitimate test under
contention and still reports a hung test in reasonable time, then the *suite's* parallelism and cost
profile is what needs a decision, not this ticket. Stop, escalate to the human, and raise it with the
**Architect**. **Never** resolve it by shortening a property run, skipping a test, adding a retry, or
making CI tolerate a failure: a test that is allowed to be flaky has stopped guarding anything, and this
phase exists because a gate that is not believed is a gate that is not read.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.2 | 2026-08-17 | **Own fix complete and verified; blocked on two pre-existing defects outside this ticket's file-scope; acceptance UNCHANGED.** The repair specified by v1.1 is implemented and proved on `ticket/FND-26` @ `27a5c2e`: a single-sourced `TEST_TIMEOUT_MS = 28_000` defined once in `tools/vitest.config.mjs` and consumed by **both** dispatch paths in `tools/workspace-script.mjs`; the **1 ms positive control turns both paths red separately** (member suites and the tools suite, each demonstrated on its own, per deliverable 3); at the real value all **nine** member suites plus the tools suite are green; and pnpm echoes `vitest run "--testTimeout=28000"` with **no injected `--`**, which is the no-separator forwarding form this ticket specifies and the rejected-outcome check from Background rows 1–2. The Builder nonetheless reported `testsPassed=false`, and the reason is recorded here so it is not mistaken for a defect in the fix: **two STANDING acceptance items — five consecutive green full-parallelism `pnpm test` runs, and `pnpm lint` green — are blocked by two pre-existing defects this ticket may not touch.** (1) `packages/database/test/tenant/concurrency.test.ts` fails intermittently under whole-suite parallel load with an **assertion** (`expected 'committed' to be 'conflict'`), not a timeout — it carries its own `{ timeout: 60_000 }`, so no Vitest `testTimeout` ever governed it, and five consecutive runs on this branch gave FAIL, PASS, FAIL, FAIL, PASS with all three failures that same assertion and zero timeouts. (2) `pnpm lint` exits 1 on `main` with 11 pre-existing problems (10 errors, 1 warning) in four `.codex/scripts/*.mjs` files and one `packages/database` test, none of them in a recently-changed file. Both sit outside this ticket's two-file `tools/` scope, and reaching into them from here would be exactly the widening Feedback obligation 1 forbids. **On 2026-08-17 the repo owner chose the strict route: repair those two defects first — [FND-29](FND-29-deterministic-tenant-write-conflict-test.md) and [FND-30](FND-30-clear-the-standing-lint-errors.md), both new roots carrying `blocks: [FND-26]` — and then re-run this ticket with its acceptance UNCHANGED.** `blocked_by` accordingly becomes `[FND-29, FND-30]`. **No acceptance item, deliverable, non-goal or file-scope entry of this ticket is modified, relaxed or reinterpreted by this row** — in particular the five-consecutive-green-runs item and the `pnpm lint` green item stand exactly as written in v1.0, and this row exists to record why they could not yet be discharged, not to excuse them. |
| v1.1 | 2026-08-16 | **Q-CI-D resolved — empirically, not by inspection — and removed from the blocking set.** Four measured invocations against `@taxrag/domain` (58 files / 1139 tests) on `main` @ `5ac25c2` under Node `v24.18.0`, using a deliberately impossible `--testTimeout=1` as the positive control, are reproduced in Background as the evidence for the route. **The route moved** from "a `testTimeout` in `tools/vitest.config.mjs`" (measured inert for the reported failure: `include` is `tools/tests/**` only, all nine members declare a bare `vitest run`, and Vite does not search parent directories) to **both `tools/` dispatch paths in `tools/workspace-script.mjs`** — the `pnpm -r` member dispatch (both `spawnSync` branches of `runPnpmRecursive`) and `ROOT_IMPLEMENTATIONS.test` / `tools/vitest.config.mjs` for the tools suite — a path that reaches every suite without touching a single member package. File-scope widened accordingly to those two `tools/` files, with the repo owner's authorization of 2026-08-16 recorded in Authorization, and the deliberate serialized overlap with `FND-23` (which also write-owns the delegator, and is `blocked_by` this ticket) recorded in Serial-safety. **`pnpm … run test -- --testTimeout=<N>` is recorded as a rejected outcome**: pnpm injects a literal `--` (observed as `vitest run "--" "--testTimeout=1"`), the flag never reaches Vitest, and the suite goes **green** — a false green indistinguishable from a working fix, which is why acceptance was rewritten around the 1 ms control, required **separately for both dispatch paths**, instead of around "the timeout is set and the suite is green". Added the hard requirement that the value have **exactly one definition site**, mechanically checked by a grep returning one definition, because a transcribed number that drifts is the `FND-27` / `FND-11` / `FND-12` / `FND-19` defect class and reproducing it inside the ticket that repairs the test suite would be self-defeating. The five-consecutive-run item, the >= 3x derivation rule, the survey deliverable and every Non-goal (no `.skip`/`.todo`/`it.only`, no reduced `CASES`, no changed seeds, no per-test `timeout` argument, no weakened test) are unchanged. |
| v1.0 | 2026-08-16 | Initial ticket. Repairs the first of the three CI jobs red on `main` @ `5ac25c2`: `packages/domain/test/answers/decide-answer-status.property.test.ts:140` fails with `Error: Test timed out in 5000ms` (observed 7746 ms and 7859 ms) because **nothing in this repository configures `testTimeout` anywhere** — `git ls-files` returns exactly two Vitest config files, `tools/vitest.config.mjs` and `packages/ui/vitest.config.ts`, and neither sets it, so every test runs on Vitest's 5000 ms default. Records that the same missing setting explains the long-running "wandering flake" — different heavy files timing out on different whole-suite parallel runs across `apps/api`, `packages/model-gateway`, `tools/tests` and `packages/database`, each passing in isolation, with the serial run green — so one setting closes many symptoms. Requires a **survey** of every test at or above 2500 ms with parallel and isolated durations, so slow tests become known rather than rediscovered as future flakes, and requires the value to be **derived** (>= 3x the slowest measured duration, factor stated in the file) rather than picked round. Requires **five consecutive** full-parallelism green runs, because a single green run proves nothing about an intermittent failure. Makes weakening a test a rejected outcome in all its forms — no reduced `CASES` (contradicts `FND-07` acceptance item 4), no `.skip`/`.todo`, no `retry`, no per-test `timeout` argument. Records the repo owner's explicit authorization, dated 2026-08-16, to touch the repo-wide `tools/vitest.config.mjs`, because `.claude/agents/reviewer.md` requires such a file to carry a human OK and the Reviewer must not have to infer one. Records finding **Q-CI-D**: nine workspace members run bare `vitest run` in their own cwd and Vite does not search parent directories for a config, so the shared config governs `tools/tests/**` only and the route to one repository-wide timeout is a decision this ticket escalates rather than makes. Carries `blocks: [FND-23]` and an empty `blocked_by`: it is a root, and `FND-23`'s `pnpm ci:local` cannot exit 0 while `pnpm test` inside `ts-type-unit` is red. |
