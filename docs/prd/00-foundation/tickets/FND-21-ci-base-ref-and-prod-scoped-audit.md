---
id: FND-21
title: Give CI a base ref and scope the dependency gate to --prod
module: 00-foundation
lane: 00-foundation
size: S
agent: builder
status: draft
date: 2026-08-15
blocked_by: [FND-02, FND-20]
blocks: []
---

# FND-21 — Give CI a base ref and scope the dependency gate to `--prod`

Implements PRD-02 requirement **DEV-004**'s prerequisite half — failure class 2 (no base ref on
`pull_request` runs) — and **D-CI1**'s scoping of the dependency gate (failure class 4), against
PRD §20.3 (the CI gate list) and PRD §21.1 (pinned actions). No ADR — the gate list is decided by
PRD §20.3 and its implementation by `FND-02`; the `--prod` scoping is decided by the Founder in
PRD-02 §6 **D-CI1** and is not re-litigated here.
Parent sub-PRD for this phase: [breakdown-plan-02-ci-repair.md](../../breakdown-plan-02-ci-repair.md)
— that file, not the frozen `00-foundation/README.md`, carries this phase's file-scope allocation (§3)
and decision register (§4). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-02 — CI gate pipeline](FND-02-ci-gate-pipeline.md) (owns `.github/workflows/**`,
delivered and merged — it created `ci.yml`, the gate fixture and the harness this ticket works
against) and [FND-20 — Gate delivery on required checks](FND-20-gate-delivery-on-required-checks.md)
(phase-2 **D-CI7**: until it lands, every ticket in this phase is reported NOT delivered).
**Why `builder`:** two bounded edits to one workflow file plus one new regression guard, against rules
already fixed by PRD §20.3 and D-CI1 — no new subsystem and no product surface.

## Background + basis

### Failure class 2 — measured

`docs/PRD-02-ci-repair.md` §1:

> | 2 | `neither main nor origin/main exists`; `ambiguous argument 'null...HEAD'` — 5 asserts, `pull_request` runs only | `.github/workflows/ci.yml` — `actions/checkout` defaults to `fetch-depth: 1`, so no base ref exists to diff against |

Every job in `ci.yml` checks out with the bare step

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

and no `with:` block, so the runner gets a single-commit checkout with no `main` branch and no
`origin/main` remote-tracking ref. **Five assertions depend on a base ref**, and all five are in the
`ts-type-unit` job's `pnpm test` step:

| File | Assertion |
|---|---|
| `tools/tests/frozen-paths.test.mjs:139` | *"resolves a base ref, so this check is never silently skipped"* — `baseRef()` tries `main` then `origin/main` and returns `null` |
| `tools/tests/frozen-paths.test.mjs:143` | *"changes no frozen or unallocated path in the branch diff"* — `git diff … null...HEAD` → `ambiguous argument` |
| `tools/tests/frozen-paths.test.mjs:154` | *"leaves the two pre-existing `tools/*.ps1` scripts byte-identical to main"* |
| `tools/tests/frozen-paths.test.mjs:162` | *"is not vacuous — the changed-file helper returns files for a historical range"* |
| `packages/contracts/test/enums/fixture-stability.test.ts:54` | the same `['main', 'origin/main']` base-ref resolution |

The failure is **`pull_request`-only**: a `push` run on `main` has `main` checked out, so `baseRef()`
resolves and the same five assertions pass. That asymmetry is why the class survived — the branch
that reports the gate as green is not the branch the gate runs on.

**These are guards worth having, and this ticket keeps every one of them.** `frozen-paths.test.mjs`
is the repository-wide frozen/unallocated-path guard (`FND-11`) — the mechanism `FND-20` narrows by
one file under D-CI4 and that every ticket's file-scope discipline rests on. A guard that cannot
resolve a base ref is not a lenient guard; it is a guard that has stopped running.

### Failure class 4 and D-CI1 — settled by the Founder

`docs/PRD-02-ci-repair.md` §6:

> **D-CI1 — the blocking dependency gate is scoped to `--prod`.** `pnpm audit --audit-level=high`
> becomes `pnpm audit --prod --audit-level=high`. *Basis:* an unscoped audit is time-bombed — a newly
> published advisory turns CI red with no code change, which is precisely the mechanism that
> reproduces "red carries no information" […] *Accepted cost:* devDependency advisories stop being
> surfaced by CI. A scheduled non-blocking full-tree audit is the durable answer and is deliberately
> **deferred** […] Record it as a follow-up, not as a deliverable here.

The current finding is `nanoid <3.3.18` (GHSA-2v37-7h3g-55p8, high), reached only through
`vitest → vite → postcss`, which ships in nothing. **The override that closes the advisory outright is
`FND-23`'s** (root `package.json` is a shared file scope — PRD-02 §4). This ticket owns only the one
line in `ci.yml`. Either ticket alone makes the audit step pass; both are wanted, for different
reasons, and neither is `blocked_by` the other.

### What this ticket must not disturb

`.github/workflows/checks/workflows.test.mjs` is `FND-24`'s file this phase (phase-2 plan §3), and
`ci.yml`'s shape is heavily asserted by it. The relevant constraints, verified against the harness on
`main` @ `0b19067`:

- **`describe C`** — `ci.yml` may carry no `if:` and no `continue-on-error:` at any depth, and no
  commented-out step inside `jobs:`. A gate is never conditional (sub-PRD **D4**).
- **`describe D`** — every third-party `uses:` must stay pinned to a 40-hex SHA with a readable version
  comment. This ticket adds no action and changes no pin.
- **`describe E`** — no *version literal* may appear anywhere under `.github/workflows/**`, and only
  `*-version-file` keys are allowed. `fetch-depth: 0` is a depth, not a version, and is unaffected.
- **`describe K`** — the parser must find exactly **nine** jobs in `ci.yml`, every job must have a
  non-empty step list, and every job must be `runs-on: ubuntu-latest`. This ticket adds no job and
  removes none.
- The restricted YAML reader (`checks/workflow-model.mjs`) refuses flow collections, tabs, anchors and
  duplicate keys. A `with:` block written as an ordinary block mapping parses; `{ fetch-depth: 0 }`
  would not.

No harness section asserts an exact step list for any job, and `describe K`'s script-name list is a
fixed four names with a `filesRead.size >= 12` floor — which is why deliverable 3 may add a **new**
sibling check script without touching `FND-24`'s file (phase-2 plan §3, "Two near-collisions").

### Accepted caveats, carried forward

- **`fetch-depth: 0` costs clone time.** The repository is small (about 1550 git-tracked text files);
  a full-history fetch is seconds. Accepted, and stated so a later reader does not "optimise" it back
  to a shallow clone and silently disable five assertions. If it ever does become a cost, the narrower
  fix is a targeted `git fetch origin main` step, not a smaller `fetch-depth` — record it through the
  Feedback obligation.
- **`pr-contract.yml` and `release-candidate.yml` keep their checkouts unchanged.**
  `pr-contract.mjs` is pure text processing over `PR_BODY` and reads no git history;
  `release-candidate.yml` never triggers on `pull_request` (`describe F`), so it has a real branch
  checked out. Changing them would widen the diff for no assertion.
- **This ticket does not make the `supply-chain-scan` job green.** The secret scan in the same job is
  still red on 65 pre-existing findings; that is `FND-24`'s. It does make the job's *first* step pass,
  which is what unmasks the secret scan (PRD-02 §1: *"class 4 masks class 3: `pnpm audit` is the first
  step, so the secret scan never ran"*).

## Goal

Make every `pull_request` run of `ci.yml` carry a resolvable base ref, so the five base-ref-dependent
assertions execute instead of erroring, and scope the blocking dependency audit to production
dependencies per D-CI1. Both changes land in `.github/workflows/ci.yml`, with a new regression guard
at `.github/workflows/checks/checkout-depth.test.mjs` run as a step of the `ts-type-unit` job.
Completion is mechanically checkable: on a `pull_request` run, `origin/main` resolves on the runner,
`tools/tests/frozen-paths.test.mjs` reports five green assertions instead of five errors, and the
audit step exits 0 while still failing on a high-severity **production** advisory.

## Non-goals

- **No change to the PRD §20.3 gate list, to `.github/workflows/fixtures/prd-20-3-gates.json`, or to
  the job set.** Owner: PRD §20.3 (membership) and `FND-02` (mapping). PRD-02 §3 names redesigning the
  gate list a Non-goal with the Architect as owner. Nine jobs in, nine jobs out.
- **No change to `.github/workflows/checks/workflows.test.mjs`, `checks/secret-scan.mjs`,
  `checks/pr-contract.mjs`, `checks/workflow-model.mjs`, `checks/verify-toolchain.mjs` or
  `fixtures/prd-20-3-gates.json`** — `FND-24`'s and `FND-02`'s (phase-2 plan §3). If a change there
  proves necessary, that is Feedback obligation 2, not a silent widening.
- **No change to `pr-contract.yml` or `release-candidate.yml`** — see Accepted caveats.
- **No `if:`, no `continue-on-error:`, no `.skip`, no commented-out step, and no gate made
  conditional.** Rejected outcomes (sub-PRD D4; `describe C` asserts all three).
- **No new action, no unpinned `uses:`, no version literal in a workflow file** (PRD §21.1;
  `describe D`, `describe E`).
- **No scheduled full-tree audit workflow.** Deliberately deferred by D-CI1; it is a follow-up
  (phase-2 plan §7 **Q-CI-C**), not a deliverable here. Adding it is a rejected outcome.
- **No nanoid override and no lockfile change** — root `package.json` and `pnpm-lock.yaml` are
  `FND-23`'s (PRD-02 §4: root `package.json` is a shared file scope, so it belongs to one ticket).
- **No change to any test under `tools/**`.** The five failing assertions are correct as written; what
  is missing is the ref they diff against.
- **No branch-protection change.** `OPS-004` is the Founder's (phase-2 plan §6 item 1).

## File-scope (write-owns)

Owned by this ticket:

- `.github/workflows/ci.yml` — `FND-02`'s file; `.github/workflows/**` is `00-foundation`'s write-owns
  path (`breakdown-plan.md` §4), and phase-2 plan §3 allocates this one file to this ticket.
- `.github/workflows/checks/checkout-depth.test.mjs` — **new**, this ticket's regression guard.

Does not touch:

- `.github/workflows/checks/{workflows.test,secret-scan}.mjs`, `.github/workflows/fixtures/**` —
  `FND-24` this phase.
- `.github/workflows/{pr-contract,release-candidate}.yml`, `.github/workflows/actions/setup/action.yml`,
  `.github/workflows/checks/{pr-contract,workflow-model,verify-toolchain}.mjs` — `FND-02`; read-only
  here.
- `.claude/scripts/deliver-ticket.mjs`, `tools/tests/frozen-paths.test.mjs`,
  `tools/tests/deliver-ticket.test.mjs`, `tools/tests/support/**` — `FND-20`.
- `tools/fixtures/entry-commands.json`, `tools/tests/{entry-commands,readme}.test.mjs`,
  `tools/check-workspace.mjs`, `README.md` — `FND-22`.
- root `package.json`, `pnpm-lock.yaml`, `tools/{ci-local,workspace-script}.mjs`,
  `tools/fixtures/script-owners.json`, `tools/tests/{scripts,ci-local}.test.mjs` — `FND-23`.
- `tools/fixtures/secret-patterns.json`, `tools/tests/secret-scan.test.mjs` — `FND-24`.
- `docs/PRD.md`, `docs/discovery/**`, `docs/archive/**`, `templates/**`, `CLAUDE.md`, `.claude/**`
  (other than `FND-20`'s carve-out), the two `tools/*.ps1`, `.github/PULL_REQUEST_TEMPLATE.md`,
  `.github/ISSUE_TEMPLATE/**`, `.gitattributes` — frozen or unallocated (`breakdown-plan.md` §4;
  Q-F6).
- every product tree — other modules; PRD-02 §3 makes product code a Non-goal.
- `docs/prd/**` — the Architect's; changed by a docs PR before this ticket executes.

**Serial-safety analysis.** `.github/workflows/ci.yml` was last written by `FND-02` (delivered,
merged). No other phase-2 ticket declares it (phase-2 plan §3), and its harness — the file most likely
to contend — is deliberately allocated to `FND-24` alone with this ticket adding a *new* sibling
script instead. `.github/workflows/checks/checkout-depth.test.mjs` does not exist. The three other
wave-2 tickets write only under `tools/**` and root, so no lane can conflict.

**Merge safety under the protection that is already live.** The six required contexts are
`API/OpenAPI compatibility`, `Migration and tenant-schema validation`, `Tenant isolation, auth and
permission tests`, `PII and citation validation suites`, `Rust builds/tests` and
`Retrieval/evaluation smoke set`. Each of those jobs gains `fetch-depth: 0` on its checkout — strictly
more history, no behaviour change — and none of them runs `pnpm audit`, `pnpm test` or the new guard.
The two edits therefore cannot turn a required context red. **Verify rather than assume** —
acceptance item 8.

## Deliverables

1. **Every `actions/checkout` step in `ci.yml` fetches enough history to resolve `origin/main`.** Add
   to each of the nine jobs' checkout steps:

   ```yaml
   - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
     with:
       fetch-depth: 0
   ```

   Written as a block mapping (the restricted reader in `checks/workflow-model.mjs` refuses flow
   collections). The pinned SHA and its version comment are unchanged. Uniformity is deliberate: a
   per-job exception is a future "which jobs need history?" question nobody will be able to answer, and
   `describe K` requires all nine jobs to keep a non-empty step list anyway.

2. **The dependency audit is scoped to production dependencies (D-CI1).** In `supply-chain-scan`'s
   *"Dependency audit and lockfile integrity"* step, `corepack pnpm audit --audit-level=high` becomes
   `corepack pnpm audit --prod --audit-level=high`. The other two lines of that step
   (`cargo metadata --locked --format-version 1 > /dev/null`, `uv lock --check`) are unchanged, and the
   step keeps its name so the gate fixture's job mapping is untouched. A comment on the step records
   **D-CI1**, its accepted cost (devDependency advisories stop being surfaced by CI) and the deferred
   follow-up, so a reader of the workflow does not have to find the PRD to know the scoping was decided.

3. **A regression guard at `.github/workflows/checks/checkout-depth.test.mjs`**, run under
   `node --test` as a new step of the `ts-type-unit` job, directly after the existing
   *"Workflow gate-list replay (PRD 20.3)"* step. It must assert, reading `ci.yml` through
   `checks/workflow-model.mjs` (never a second YAML parser):

   - every step in `ci.yml` whose `uses:` names `actions/checkout` declares `with.fetch-depth: 0` —
     failing by **job id and step index** so the message says where;
   - the count of such steps equals the number of jobs (nine), so a job added without a checkout, or a
     checkout deleted, fails rather than passing vacuously;
   - the audit line contains `--prod` and `--audit-level=high`, and contains no `--audit-level=critical`
     or `|| true`-style swallow;
   - **non-vacuity**: the guard parsed a non-empty job map and read `ci.yml` — a check that inspected
     nothing must fail (the discipline `describe K` already establishes);
   - a **negative control** on synthetic text: a checkout step without `with.fetch-depth` is detected,
     and one with `fetch-depth: 1` is detected. Without these the guard could pass by finding nothing.

4. **No other change to `ci.yml`.** Job ids, job names, `runs-on`, `permissions`, `concurrency`, the
   trigger block, step names and every other `run:` line are byte-identical to `main`. The gate
   fixture's 1:1 gate↔job mapping is untouched.

## Acceptance checklist (classified)

**Before any run**, confirm `node -v` prints `v24.18.0` (CLAUDE.md). A red suite under Node 22.11.0 is
an environment fault, not a regression.

- [ ] `[machine]` **The reported defect is gone on a real `pull_request` run.** On this ticket's pull
      request, the `TypeScript type/unit tests` job's `pnpm test` step shows
      `tools/tests/frozen-paths.test.mjs` with **all five** base-ref assertions green, and the log
      contains neither `neither main nor origin/main exists` nor `ambiguous argument`. Both the before
      (a linked earlier run) and after logs are quoted in the PR (Background — failure class 2).
- [ ] `[machine]` **The base ref really resolves on the runner.** The same run's log shows the guard's
      own output, and `packages/contracts/test/enums/fixture-stability.test.ts` is green in the same
      step (the fifth assertion, in a different file).
- [ ] `[machine]` **The guard bites — demonstrated, not asserted.** Locally, remove `fetch-depth: 0`
      from one job in `ci.yml`, run
      `node --test .github/workflows/checks/checkout-depth.test.mjs`, and record the failure message
      verbatim; it must name that job. Restore and confirm green and `git status --porcelain` clean.
- [ ] `[machine]` **The guard is not vacuous.** Its non-vacuity assertion and both synthetic negative
      controls are present and pass (deliverable 3).
- [ ] `[machine]` **The audit is scoped and still bites.** `corepack pnpm audit --prod
      --audit-level=high` exits 0 locally; the unscoped `corepack pnpm audit --audit-level=high` still
      reports the `nanoid` advisory (proving the scoping, not a coincidence, is what changed the
      outcome). Both outputs are pasted into the PR.
- [ ] `[machine]` **The `supply-chain-scan` job now reaches its second step.** The CI log for this
      pull request shows the *Secret scan* step **executing** (and failing on the pre-existing 65
      findings, which are `FND-24`'s), where previously the job stopped at the audit. This is the
      unmasking PRD-02 §1 describes; the secret-scan failure is **not** a defect of this ticket.
- [ ] `[machine]` **The workflow harness is still green.**
      `node --test .github/workflows/checks/workflows.test.mjs` exits 0 — in particular `describe C`
      (no `if:`/`continue-on-error:`/commented-out step), `describe D` (pins), `describe E` (no version
      literal) and `describe K` (nine jobs, every job non-empty, `filesRead.size >= 12`).
- [ ] `[machine]` **The branch is mergeable under the live protection.** All six currently-required
      contexts are green on this pull request; names and conclusions pasted into the PR (File-scope).
- [ ] `[machine]` **The diff is two files.** `git diff --name-only main...HEAD` lists exactly
      `.github/workflows/ci.yml` and `.github/workflows/checks/checkout-depth.test.mjs`, and
      `git diff main...HEAD -- .github/workflows/ci.yml` shows only the nine `with:` blocks, the
      `--prod` flag, the step comment and the one new step (deliverable 4).
- [ ] `[machine]` **Full suite green — the standing item** (PRD §20.3, §45.3). `pnpm test` exits 0 with
      the pass count stated in the PR; `pnpm lint` and `pnpm typecheck` green.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (`DEV-004`, and D-CI1 for the
      audit scoping), user-visible change (**none** — CI configuration), non-goals, schema/API/event
      compatibility (**none**), tenant/PII/security impact (**a deliberate reduction in scan scope**:
      devDependency advisories are no longer blocking — D-CI1's accepted cost, with the deferred
      full-tree audit named as the follow-up), source/licence impact (**none** — no dependency added),
      cost impact (a full-history clone per job, seconds on this repository), rollback path (revert the
      commit — which re-disables five repository-wide guards on every `pull_request` run and re-arms the
      time-bombed unscoped audit, so the rollback note must say so), known gaps (the three Accepted
      caveats in Background).

**Absent classes.** No `[fixture]` criteria — nothing here replays recorded data. No `[human]`
criteria — CI configuration with a fully mechanical acceptance surface and no customer-visible
behaviour; no PRD §41.2 `UAT-*` script applies. No Rust or Python source change (both jobs' checkouts
gain history and nothing else).

## Test plan

Reviewer steps. All local steps are offline. **Step 0 in every shell:** confirm `node -v` prints
`v24.18.0`. Harness: `node --test` for the workflow checks (the runner `FND-02` registered) and Vitest
via `pnpm test` for `tools/**`. The construction pattern to copy for the new guard is
`.github/workflows/checks/workflows.test.mjs` — same `node:test` style, same restricted reader, same
insistence on a negative control and a non-vacuity assertion beside every real assertion.

1. **Read the workflow diff for a weakening first.** Any `if:`, any `continue-on-error:`, any removed
   or renamed job, any unpinned `uses:`, any lowered `--audit-level`, any `|| true`, or an audit line
   that no longer runs at all is a **rejected outcome** (Non-goals), not a style comment.
2. **Confirm the scoping is the Founder's, applied as written.** The step must read
   `corepack pnpm audit --prod --audit-level=high` — not `--production`, not a lowered level, not a
   different subcommand — and the comment must name D-CI1 and its accepted cost.
3. **Reproduce both ways locally.** `corepack pnpm audit --audit-level=high` reports the `nanoid`
   advisory; `corepack pnpm audit --prod --audit-level=high` exits 0. This before/after is what proves
   the change did what it claims.
4. **Negative test — the guard is live.** Delete `fetch-depth: 0` from one job, run the guard, observe
   the named failure; set it to `1`, observe the failure again; restore, observe green. A guard that
   passes in all three states is defective.
5. **Read the real CI run, not only the local suite.** Open this pull request's `TypeScript type/unit
   tests` job and confirm the five base-ref assertions are green, then open `supply-chain-scan` and
   confirm the audit step passed and the secret-scan step ran.
6. **Confirm nothing else moved.** `git diff --name-only main...HEAD` lists exactly two files;
   `workflows.test.mjs`, the gate fixture, `pr-contract.yml` and `release-candidate.yml` are absent
   from the diff.
7. **Suite and gates.** `node --test .github/workflows/checks/workflows.test.mjs`,
   `node --test .github/workflows/checks/checkout-depth.test.mjs`, `pnpm test`, `pnpm lint`,
   `pnpm typecheck` all green on this branch; `pnpm test` re-run on `main` after the merge.

## Feedback obligation

**General rule.** If implementation falsifies anything here, update **this ticket** first — version
+0.1 with a changelog line — then change code, then re-publish the issue
(`publish-tickets.mjs --sync`). Where the falsified item is a phase-2 decision, the writeback target is
`docs/prd/breakdown-plan-02-ci-repair.md` §4 as well, by a docs PR. Never patch spec into a plan, into
code, or by hand-editing the issue (CLAUDE.md, issue #53).

1. **`fetch-depth: 0` does not make `origin/main` resolvable** on a `pull_request` run — for example
   the checkout leaves a detached HEAD with no remote-tracking refs. → Do **not** relax the failing
   assertions and do **not** teach `baseRef()` a third fallback (`tools/**` is out of this ticket's
   scope and those tests are correct). Record the observed `git for-each-ref` / `git rev-parse` output
   in this ticket (+0.1, `--sync`) and add the narrowest additional step that creates the ref — a
   `git fetch origin main:refs/remotes/origin/main` step inside `ci.yml`, which is in scope — stating
   why `fetch-depth: 0` alone was insufficient.
2. **The change cannot be contained in `ci.yml` and the new guard** — for example
   `workflows.test.mjs` turns out to assert a step shape this ticket breaks. → That file is `FND-24`'s
   this phase. Stop, record the exact assertion here (+0.1), and raise it with the **Architect**: a
   phase-2 file-scope collision is a plan defect (phase-2 plan §3), and the resolution is a plan/ticket
   change before code, never a quiet edit of another ticket's file.
3. **The `--prod` scoping does not clear the audit** — a high-severity advisory exists on a production
   dependency. → That is a **real** finding and the gate is doing its job. Do **not** lower
   `--audit-level`, add `|| true`, or widen the scoping back. Record the advisory here, and treat
   closing it as separate work: if it is closable by an override it is `FND-23`'s file scope; if it
   needs a dependency change it is the owning module's ticket, with the Architect.
4. **A full-history clone measurably slows CI.** → Record the measured before/after job durations here.
   The narrower fix is a targeted fetch step (see 1), **not** a smaller `fetch-depth` — a shallow clone
   is what disabled five guards in the first place.
5. **Someone proposes adding the deferred scheduled full-tree audit here** because "it is only a
   workflow file". → Rejected by D-CI1, which defers it explicitly and says *"Record it as a follow-up,
   not as a deliverable here"*. It is new workflow machinery with its own failure modes and its own
   noise budget. Raise it as **Q-CI-C** (phase-2 plan §7) with the **Founder**.

**Escalation.** If a `pull_request` run cannot be given a base ref without either weakening
`tools/tests/frozen-paths.test.mjs` or adding a second source of truth for "what is the default
branch", then the guards' *mechanism* — diffing the working branch against a locally-resolved ref — is
what needs a design decision, not this ticket. Stop, escalate to the human, and raise it with the
**Architect**. **Never** resolve a base-ref failure by marking the assertion `.skip`/`.todo`, by making
it conditional on `process.env.CI`, or by deleting it: those five assertions are the only thing
standing between the repository and unallocated writes, and a guard that is quiet on the branch that
matters is worse than none.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-15 | Initial ticket. Repairs PRD-02 failure class 2 — `actions/checkout` defaults to `fetch-depth: 1`, so `pull_request` runs have no `main`/`origin/main` to diff against and five base-ref assertions (four in `tools/tests/frozen-paths.test.mjs`, one in `packages/contracts/test/enums/fixture-stability.test.ts`) error out instead of running, on the exact runs where the frozen-path guard matters most — and applies Founder decision **D-CI1**, scoping the blocking dependency gate to `pnpm audit --prod --audit-level=high` while the `nanoid` override that closes the advisory outright stays `FND-23`'s (root `package.json` is a shared file scope). Adds a regression guard as a *new* sibling check script rather than editing `.github/workflows/checks/workflows.test.mjs`, which phase-2 plan §3 allocates to `FND-24`. |
