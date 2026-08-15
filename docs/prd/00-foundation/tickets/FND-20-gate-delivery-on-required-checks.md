---
id: FND-20
title: Gate delivery on required checks and make an unlanded merge a hard failure
module: 00-foundation
lane: 00-foundation
size: M
agent: builder
status: draft
date: 2026-08-15
blocked_by: [FND-01, FND-11]
blocks: [FND-21, FND-22, FND-23, FND-24]
---

# FND-20 — Gate delivery on required checks and make an unlanded merge a hard failure

Implements PRD-02 requirement **DEV-004** (phase-2 PRD `docs/PRD-02-ci-repair.md` §2, failure classes
5 and 6), against PRD §45.4 (the pull-request contract) and PRD §20.3 (the CI gate list). No ADR — the
requirement is already decided by PRD-02 §2 and the mechanism by phase-2 decisions **D-CI3**, **D-CI4**
and **D-CI7**; an ADR candidate is raised in Feedback obligation 6, not authored here.
Parent sub-PRD for this phase: [breakdown-plan-02-ci-repair.md](../../breakdown-plan-02-ci-repair.md)
— **that file, not `00-foundation/README.md`**, carries this phase's file-scope allocation (§3) and
decision register (§4); the module README is frozen for phase 2 and does not mention this ticket.
Master spec: [PRD](../../../PRD.md).
Depends on: [FND-01 — Monorepo bootstrap](FND-01-monorepo-bootstrap-pinned-toolchains-workspace-skeleton.md)
(owns `tools/**`, delivered and merged) and
[FND-11 — Repair repo-wide frozen-path guard](FND-11-repair-repo-wide-frozen-path-guard.md)
(created `tools/tests/frozen-paths.test.mjs`, the file this ticket narrows; delivered and merged).
Both edges are satisfied at authoring time and nothing waits on them.
**Why `builder`:** a bounded change to one existing script plus one existing guard file, against a
requirement already written in PRD-02 §2 and a mechanism already fixed by D-CI3/D-CI4 — no new
subsystem, no product surface.

## Background + basis

### The measured defect

`docs/PRD-02-ci-repair.md` §1 records two failure classes in `.claude/scripts/deliver-ticket.mjs`:

> | 5 | Every PR fails the §45.4 contract with `no requirement ID found` | `.claude/scripts/deliver-ticket.mjs:247` — when the deliver agent writes no `--body-file`, the script falls back to the **unfilled** `.github/PULL_REQUEST_TEMPLATE.md`, which by construction cannot satisfy the contract |
> | 6 | Merge never consults CI; a failed `gh pr merge` is recorded as a `note()` and execution continues; DoD `testsPassed` is never evaluated when `--test-cmd` is unset | `.claude/scripts/deliver-ticket.mjs:143`, `:504`, `:508` |

and §1's headline: **32 pull requests merged between 2026-08-07 and 2026-08-15 with red CI**, because
`main` carried no branch protection and *no step of the delivery pipeline reads CI status*.

The three code sites, as they stand on `main` @ `0b19067`:

```js
// :138-143  finish() — with no --test-cmd, dodPassed can be true although nothing was tested
const dodPassed = !awaitingMerge &&
  checks.planExists && checks.merged && checks.issueClosed &&
  (!checks.pushRequired || checks.pushed) &&
  (TEST_CMD ? checks.testsPassed === true : true)
```

```js
// :504-511  the merge — no check is consulted before it, and a failure is a note
} else if (pr && pr.number) {
  const mg = PLATFORM === 'gh'
    ? tryCli(['pr', 'merge', String(pr.number), '--merge'])
    : tryCli(['mr', 'merge', String(pr.number), '--yes'])
  if (!mg.ok) note(`forge merge failed (required checks pending, conflict, or approval required): ${firstLine(mg.out)}`)
```

```js
// :246-254  the body fallback — an unfilled template can never satisfy the §45.4 check
const resolvePrBody = () => {
  if (BODY_FILE && existsSync(BODY_FILE)) return readFileSync(BODY_FILE, 'utf8')
  const tpl = findMrTemplate()
  if (tpl) { note(...); return `<!-- ... -->\n\n` + ensureCloses(tpl.text) }
  return buildBody()
}
```

`.github/workflows/checks/pr-contract.mjs` requires a requirement ID (or an explicit
`Requirement IDs: none` line) **and** the `## Constraint check` heading. An unfilled
`.github/PULL_REQUEST_TEMPLATE.md` carries neither in a form the check accepts, and that template is
**unallocated and frozen** (`breakdown-plan.md` §4, sub-PRD Q-F6) — `pr-contract.mjs`'s own header
says *"Fix the PR body. Do not edit the template to make this pass."* So the fallback is not merely
weak: it is a path that is guaranteed to produce a red context.

### The race the requirement does not name — settled by D-CI3, do not re-derive

DEV-004 says the script "MUST NOT merge a pull request whose required checks are not green". Read
literally and implemented as a refusal, that **deadlocks delivery**: the merge is attempted seconds
after `git push`, when the six currently-required contexts are still *pending*, so "not green" is the
normal state at merge time and no ticket would ever land. Branch protection went live 2026-08-15, so
this is now every delivery's steady state, not an edge case.

**Phase-2 decision D-CI3 (breakdown-plan-02-ci-repair.md §4) resolves it:** the script *waits* for the
required contexts to conclude, then merges only if all concluded successfully, and treats a timeout as
a hard failure. That is the difference between a gate and a deadlock, and it is the load-bearing part
of this ticket. It is recorded as an addition to the PRD's wording (that plan's §7, finding F-CI2), not
smuggled in.

### Why this ticket may write a file the repository freezes

`breakdown-plan.md` §4 puts `.claude/**` in the *frozen — no module writes* row, and
`tools/tests/frozen-paths.test.mjs` enforces it repository-wide with `/^\.claude\//`. That file's own
header records the escape hatch:

> ESCAPE HATCH: a ticket that genuinely needs a listed path allocates it to a module's write-owns row
> in breakdown plan §4 by a docs PR FIRST, and only then does the entry leave this list, in a separate
> change […] Editing this transcription to escape the rule is the failure mode, not the fix.

The docs half of that route is **unavailable this phase**: every file under `docs/prd/` is frozen for
phase 2 (`prd-phase.mjs check`), including `breakdown-plan.md`. **D-CI4** therefore records the
allocation in `docs/prd/breakdown-plan-02-ci-repair.md` §3 — a *new* file, an addition — and requires
the guard entry to be **narrowed, not deleted**: exactly one file, `.claude/scripts/deliver-ticket.mjs`,
leaves the frozen set. `.claude/settings.json`, `.claude/commands/**`, `.claude/workflows/**`,
`.claude/agents/**` and every other `.claude/` path stay frozen, and the guard keeps its bite.

### Accepted caveats, carried forward

- **`.claude/workflows/run-milestone.js` and `.claude/workflows/start-all.js` stay frozen and
  unchanged.** They already treat `merged && issueClosed && dodPassed` as the delivery test
  (`run-milestone.js:300`), so a summary line reporting `dodPassed:false` is *already* handled
  correctly by both. This ticket therefore hardens the script and does not touch its callers.
- **A non-zero exit is a new contract, and the runners must survive it.** Today the script documents
  `0 = definitive summary printed; 1 = bad invocation or unexpected internal error`. Deliverable 3
  adds exit **2**, and requires the `DELIVER-SUMMARY-JSON` line to be printed **before** exiting in
  every case, so a runner that parses the line still gets it. The delegating prompt in both runners
  already says: *"If the command cannot run or prints no DELIVER-SUMMARY-JSON, return
  merged/issueClosed/dodPassed = false"* — both outcomes converge on "not delivered".
- **This ticket does not make CI green.** It makes CI *consulted*. The four still-red contexts are
  repaired by `FND-21`, `FND-22`, `FND-23` and `FND-24`, all of which are `blocked_by` this ticket
  (D-CI7).

## Goal

Make `.claude/scripts/deliver-ticket.mjs` refuse to land work the gate has not approved, and report
honestly when it does not land. Concretely: before merging, resolve the pull request's **required**
check contexts from the forge and wait, bounded, until each has concluded; merge only when every one
concluded successfully; when the merge does not land — refused, timed out, failed, or landed nowhere —
report the ticket as **NOT delivered** with a non-zero exit and a `DELIVER-SUMMARY-JSON` line whose
`dodPassed` is `false`, never a `note()` that execution continues past. Make the Definition of Done
require a test run rather than tolerating its absence, and stop composing a pull-request body from the
unfilled repository template. Completion is mechanically checkable: a new suite under
`tools/tests/deliver-ticket.test.mjs` drives the script end to end against a scripted forge double via
the existing `GH_BIN` seam, and `pnpm test` is green.

## Non-goals

- **No change to `.claude/workflows/run-milestone.js`, `.claude/workflows/start-all.js`,
  `.claude/commands/**`, `.claude/agents/**`, `.claude/settings.json` or any other `.claude/` file.**
  Owner: those remain frozen (`breakdown-plan.md` §4); D-CI4 carves out exactly one file. Widening the
  carve-out is a rejected outcome, not a shortcut.
- **No change to `CLAUDE.md`** — including the test-command declaration PRD-02 §5 item 5 calls for.
  Owner: **Founder** (phase-2 plan §6 item 2). This ticket supplies the forcing function; the
  constitution's text is the human's.
- **No change to branch protection or any repository setting.** `OPS-004` is the Founder's
  (phase-2 plan §6 item 1). Nothing here calls a settings API.
- **No change to `.github/**`.** `ci.yml` is `FND-21`'s, the secret scan and its harness are
  `FND-24`'s, and `.github/PULL_REQUEST_TEMPLATE.md` is **frozen and unallocated** (Q-F6) — refusing
  the unfilled-template fallback is this ticket's whole answer to failure class 5; *editing* the
  template is explicitly rejected by `pr-contract.mjs`'s own header.
- **No new dependency.** The script imports only `node:child_process`, `node:fs`, `node:os` and
  `node:path` today and must continue to. `tools/tests/skeleton.test.mjs` asserts every member manifest
  declares only exactly-pinned dependencies; adding a forge SDK or an HTTP client is out of scope.
- **No weakening of the divergence guard, and no force-push, ever.** `assertBranchNotDiverged` and its
  message set are untouched. A merge that will not land is reported, never forced.
- **No auto-approval, no admin override, no `--admin` flag, and no bypass of a required review.** If a
  required approval is missing the ticket is NOT delivered and a human decides.
- **No change to the `pushmr` (GitLab push-option) or `direct` delivery paths beyond what deliverables
  3 and 4 require.** This repository is `gh`; the other paths must keep working but gain no new gate.
- **No product code, no test other than this ticket's own, no schema, no migration.** PRD-02 §3.

## File-scope (write-owns)

Owned by this ticket:

- `.claude/scripts/deliver-ticket.mjs` — allocated to this ticket by **D-CI4**
  (`docs/prd/breakdown-plan-02-ci-repair.md` §3, §4), a single-file carve-out of the `.claude/**`
  frozen row.
- `tools/tests/frozen-paths.test.mjs` — deliverable 1 narrows one `FORBIDDEN` entry and adds its
  control vectors. `FND-11`'s file; `tools/**` is `00-foundation`'s write-owns tree
  (`breakdown-plan.md` §4).
- `tools/tests/deliver-ticket.test.mjs` — **new**, this ticket's suite.
- `tools/tests/support/**` — **new**, the forge double and the scratch-repository helper. This
  directory is deliberately *outside* `tools/tests/*.test.mjs`, which is the only glob
  `tools/vitest.config.mjs` collects, so helpers are not collected as tests.

Does not touch:

- `.claude/**` other than the one allocated file — frozen (`breakdown-plan.md` §4, narrowed by D-CI4).
- `CLAUDE.md`, `templates/**`, `docs/PRD.md`, `docs/discovery/**`, `docs/archive/**`,
  `tools/validate-prd.ps1`, `tools/export-visible-transcript.ps1`, `.gitattributes`,
  `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/**` — frozen or unallocated
  (`breakdown-plan.md` §4; Q-F6).
- `.github/workflows/**` — `FND-02`, and this phase's `FND-21` (`ci.yml`) and `FND-24`
  (`checks/**`, `fixtures/**`).
- `tools/fixtures/entry-commands.json`, `tools/tests/entry-commands.test.mjs`,
  `tools/check-workspace.mjs`, `tools/tests/readme.test.mjs`, `README.md` — `FND-22`.
- root `package.json`, `pnpm-lock.yaml`, `tools/workspace-script.mjs`,
  `tools/fixtures/script-owners.json`, `tools/tests/scripts.test.mjs`, `tools/ci-local.mjs` — `FND-23`.
- `tools/fixtures/secret-patterns.json`, `tools/tests/secret-scan.test.mjs` — `FND-24`.
- `tools/workspace-assertions.mjs`, `tools/tests/{layout,line-endings,pins,skeleton}.test.mjs`,
  `tools/fixtures/{prd-20-1-layout,toolchain-pins}.json`, `tools/vitest.config.mjs`,
  `tools/eslint.config.mjs` — `FND-01`; read-only here.
- every product tree (`apps/**`, `packages/**`, `pipelines/**`, `services/**`, `schemas/**`,
  `evals/**`, `infra/**`, `tests/**`) — other modules; PRD-02 §3 makes product code a Non-goal.
- `docs/prd/**` — the Architect's; changed by a docs PR **before** this ticket executes.

**Serial-safety analysis.** `.claude/scripts/deliver-ticket.mjs` is written by no other ticket in any
phase — it has been frozen since `breakdown-plan.md` §4 was authored, and D-CI4 allocates it to this
ticket alone. `tools/tests/frozen-paths.test.mjs` was last written by `FND-11` (delivered, merged) and
is declared by no other phase-2 ticket (phase-2 plan §3). The two new paths do not exist. No in-flight
ticket contends for any of the five entries. Every other phase-2 ticket is `blocked_by` this one
(D-CI7), so nothing runs concurrently with it in this phase.

**Frozen-path note.** This branch's diff will contain `.claude/scripts/deliver-ticket.mjs`, which the
guard forbids **until deliverable 1 lands in the same branch**. Deliverable 1 and deliverable 2
therefore cannot be split across branches: the narrowing must be present when the suite runs. This is
expected and is not a signal to skip the guard.

**Merge safety under the protection that is already live.** Six contexts are required on `main` today
— `API/OpenAPI compatibility`, `Migration and tenant-schema validation`, `Tenant isolation, auth and
permission tests`, `PII and citation validation suites`, `Rust builds/tests`, `Retrieval/evaluation
smoke set` — and all six are green. None of them runs `pnpm test`, `pnpm audit`, the secret scan or
the §45.4 contract check, and this ticket's file-scope touches no input to any of the six: it writes
one pipeline script and three files under `tools/tests/**`. The branch is therefore mergeable under
the live protection. **Deliberately verify this rather than assume it** — acceptance item 11.

## Deliverables

1. **Narrow the `.claude/` frozen-path entry — do not delete it.** In
   `tools/tests/frozen-paths.test.mjs`, replace the `FORBIDDEN` entry `/^\.claude\//` with one that
   still matches every `.claude/` path *except* `.claude/scripts/deliver-ticket.mjs`, carrying a
   comment naming **D-CI4** and `docs/prd/breakdown-plan-02-ci-repair.md` §3 as its basis. The
   entry-count assertion stays at **eleven** and the per-entry basis-comment assertion must still pass
   (it requires the shape `/^…/,  // <basis>`). `FORBIDDEN_CONTROL` keeps a `.claude/` vector that
   still matches (`.claude/settings.json` does), and `ALLOWED_CONTROL` gains
   `['.claude/scripts/deliver-ticket.mjs', '00-foundation (FND-20) — D-CI4 single-file carve-out']`.
   Nothing else in the file changes: the four behavioural tests, the non-vacuity probe and the two
   `tools/*.ps1` assertions are untouched.

2. **A required-check gate before the merge (D-CI3).** In the `pr` delivery path, immediately before
   the merge attempt at `:504`, resolve the pull request's check state from the forge and decide:

   - **Which contexts count.** The *required* contexts for the target branch, as the forge reports
     them — not every context that happens to have run. On `gh` the branch-protection required-contexts
     list intersected with the PR's `statusCheckRollup` is the source; if the required list cannot be
     read (no permission, no protection configured), fall back to **every** context in the rollup and
     record which rule was used in `checks` and in a note. Falling back to "no contexts" is a rejected
     outcome: a gate that finds nothing to check must fail, never pass.
   - **Wait, bounded.** Poll until every counted context has *concluded*. Default timeout **20
     minutes**, default poll interval **20 seconds**, both overridable by
     `--checks-timeout <seconds>` / `--checks-interval <seconds>`; the defaults are stated in the
     usage header. Open question **Q-CI-B** (phase-2 plan §7) owns the numbers.
   - **Decide.** Merge only when every counted context concluded successfully. Any context that
     concluded otherwise, and any context still pending at the timeout, is a stop: no merge attempt is
     made, `checks.requiredChecksGreen` is `false`, and the failing/pending context **names** appear in
     the summary notes.
   - **Zero counted contexts is a stop**, with a note saying so.
   - The whole gate is skipped only when the branch is already an ancestor of `origin/<default>` (the
     existing `alreadyMerged` path) — there is nothing left to gate.

3. **An unlanded merge is a hard failure.** Replace the `note()`-and-continue behaviour at `:508` and
   `:520`. When the merge does not land on the remote default branch — refused by the gate, refused by
   the forge, or landed nowhere — the run must: print the `DELIVER-SUMMARY-JSON` line **first**, with
   `merged:false` and `dodPassed:false` and a `notes` string that names the cause; then exit with code
   **2**. Extend the usage header's exit-code contract to `0 = delivered (or a documented awaiting-merge
   stop); 1 = bad invocation or unexpected internal error; 2 = summary printed, delivery did not
   complete`. The deliberate `awaitingMerge` stops — `--no-merge`, and the `pushmr` path's
   human-web-merge stop — keep exit **0**: those are not failures, and `finish()` already excludes them
   from `dodPassed`.

4. **The Definition of Done requires a test run.** In `finish()`, replace
   `(TEST_CMD ? checks.testsPassed === true : true)` with `checks.testsPassed === true`, so a run with
   no `--test-cmd` reports `dodPassed:false` and a note naming the missing flag and pointing at the
   `CLAUDE.md` declaration (phase-2 plan §6 item 2). The DoD block must also run when the merge
   succeeded but a later step failed, so `planExists` and `testsPassed` are always evaluated and always
   present in the summary.

5. **Refuse the unfilled-template fallback (failure class 5).** In `resolvePrBody()`, keep the
   `--body-file` path unchanged, and remove the "repo template as skeleton" branch as a *silent*
   fallback. When no `--body-file` is supplied the script must not open a pull request at all: it
   reports the ticket NOT delivered under deliverable 3, with a note stating that the deliver agent
   composes the body from the repository template (CLAUDE.md, issue #58) and that
   `.github/PULL_REQUEST_TEMPLATE.md` is frozen and unfilled. The `buildBody()` hardcoded fallback is
   likewise not used to open a PR. Rationale, recorded so it is not "simplified" later: an unfilled
   template body is *guaranteed* to fail the §45.4 contract context, so opening a PR with one
   manufactures a red required check — the exact behaviour classes 5 and 6 combine into.

6. **Do not close the tracker issue, do not complete an Asana subtask, and do not post a verdict
   comment on a delivery that did not land.** The existing landed-precondition at `:526` is correct and
   must survive the restructuring; state it in the code comment so a later reader does not "tidy" it.

7. **A test double and a suite** — `tools/tests/support/forge-double.mjs` (new) and
   `tools/tests/deliver-ticket.test.mjs` (new). The double is driven through the script's **existing**
   `GH_BIN` seam (`deliver-ticket.mjs:117`, documented as *"for non-PATH binaries and test doubles,
   e.g. `GH_BIN="node tools/fake-gh.mjs"`"*) — no new seam is added to production code for testability.
   The double reads a scenario description from an environment variable pointing at a JSON file under
   the test's own temporary directory and replays scripted `gh` responses, including a rollup that is
   pending on the first poll and concluded on a later one. The suite creates a throwaway git repository
   per case with `mkdtempSync`, so nothing touches this repository's remotes. **No file created by
   this deliverable may contain a credential-shaped identifier** — `tools/tests/secret-scan.test.mjs`
   scans all of `tools/**` inside `pnpm test`, so a literal `GITHUB_TOKEN` (or any `*_TOKEN`, `*_KEY`,
   `*_SECRET`, `*_CREDENTIAL`, `*_PASSWORD`, `AWS_*`, `*_URL`/`*_DSN` name from
   `tools/fixtures/secret-patterns.json`) would fail the suite it is part of.

8. **The script's contract is otherwise unchanged**: same CLI flags plus the two new optional ones,
   same `DELIVER-SUMMARY-JSON` key set plus the new `checks` members, same delivery-mode
   auto-detection, same divergence guard, same OPEN-then-MERGED existing-PR lookup, same
   `--verdict-file` precondition. No key is removed from the summary — `run-milestone.js` and
   `start-all.js` are frozen and read `merged`, `issueClosed`, `dodPassed`, `awaitingMerge`, `prUrl`
   and `notes` by name.

## Acceptance checklist (classified)

Every `[machine]` item is reproducible offline in this environment. **Before any run**, confirm
`node -v` prints `v24.18.0` (CLAUDE.md — in the Bash tool no PATH prefix is needed; in PowerShell and
in a `--test-cmd` child it is mandatory). A red suite under Node 22.11.0 is an environment fault, not
a regression.

- [ ] `[machine]` **The gate refuses a red PR.** With the forge double reporting one required context
      concluded as failing, the script makes **no** merge call, prints `DELIVER-SUMMARY-JSON` with
      `merged:false`, `dodPassed:false` and the failing context's **name** in `notes`, and exits **2**
      (PRD-02 §5 item 3; deliverables 2, 3).
- [ ] `[machine]` **The gate waits rather than deadlocking.** With the double reporting the required
      contexts *pending* on the first poll and *all successful* on a later one, the script merges, and
      the run reports `merged:true`. Asserted with a short `--checks-interval` so the case runs in
      seconds (D-CI3).
- [ ] `[machine]` **A timeout is a failure, not a merge.** With the double reporting a context pending
      forever and `--checks-timeout` set to a few seconds, no merge call is made, the summary names the
      still-pending context, and the exit code is **2**.
- [ ] `[machine]` **Zero counted contexts is a stop.** With the double reporting an empty rollup, the
      script does not merge and says why (deliverable 2, final bullet).
- [ ] `[machine]` **An unlanded merge is never reported as delivered.** With the double accepting the
      merge call but leaving the branch un-landed on the default branch, the summary carries
      `merged:false`, `issueClosed:false` (no close was attempted) and exit **2** (deliverables 3, 6).
- [ ] `[machine]` **No `--test-cmd` fails the DoD.** A run that otherwise succeeds but is invoked
      without `--test-cmd` reports `dodPassed:false` with a note naming the flag; the same run with a
      passing `--test-cmd` reports `dodPassed:true` (deliverable 4).
- [ ] `[machine]` **No `--body-file` opens no PR.** A `pr`-path run without `--body-file` creates no
      pull request, reports NOT delivered, and its note names
      `.github/PULL_REQUEST_TEMPLATE.md` as frozen and unfilled; `.github/PULL_REQUEST_TEMPLATE.md` is
      absent from the branch diff (deliverable 5).
- [ ] `[machine]` **The deliberate stops still exit 0.** `--no-merge` reports `awaitingMerge:true`,
      `dodPassed:false` and exit **0**; the summary line is present (deliverable 3).
- [ ] `[machine]` **The divergence guard is intact.** A scenario where the remote head is not an
      ancestor of the local head still refuses to push, names both shas, and pushes/forces/deletes
      nothing (Non-goals).
- [ ] `[machine]` **The frozen-path guard still bites — demonstrated, not asserted.** On this branch,
      `pnpm test` is green with `.claude/scripts/deliver-ticket.mjs` in the diff; then add a scratch
      edit to `.claude/settings.json`, re-run, and record the observed failure naming that path; revert
      it and confirm green and `git status --porcelain` clean. Quote the failure text verbatim in the
      PR (deliverable 1).
- [ ] `[machine]` **The branch is mergeable under the live protection.** All six currently-required
      contexts are green on this ticket's pull request; their names and conclusions are pasted into the
      PR (File-scope, "Merge safety").
- [ ] `[machine]` **No credential-shaped identifier was introduced.**
      `node .github/workflows/checks/secret-scan.mjs` reports no finding whose file is one this ticket
      added or changed, and `tools/tests/secret-scan.test.mjs` is green (deliverable 7). The
      repository-wide scan is still red on the pre-existing 65 findings — that is `FND-24`'s, and it is
      **not** a defect of this ticket.
- [ ] `[machine]` **Full suite green — the standing item** (PRD §20.3, §45.3). `pnpm test` on this
      branch exits 0; the pass count is stated in the PR so a masked test cannot pass as a fix.
      `pnpm lint` and `pnpm typecheck` green.
- [ ] `[machine]` **No frozen path other than the carve-out is in the diff.**
      `git diff --name-only main...HEAD` lists only the five paths in File-scope (four files plus the
      new support directory's contents).
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (`DEV-004`), user-visible change
      (**none** — pipeline infrastructure), non-goals, schema/API/event compatibility (**none**),
      tenant/PII/security impact (**none** — no credential is read; the script's only new reads are the
      forge's own check API through the already-authenticated CLI), source/licence impact (**none** —
      no dependency added), cost/latency impact (**delivery now waits for CI**, up to the timeout — the
      accepted cost of the gate, and the reason Q-CI-B exists), rollback path (revert the commit — which
      restores merge-without-CI and re-opens the failure mode that merged 32 red pull requests, so the
      rollback note must say so), known gaps (the four Accepted caveats in Background, plus F-CI3).

**Absent classes.** No `[fixture]` criteria — the plan's `[fixture]` class is PRD §40.8 adapter
fixtures and PRD §14/§43 evaluation replays; the forge double is a test harness, not a recorded-data
replay. No `[human]` criteria — the change is pipeline infrastructure with a fully mechanical
acceptance surface and no customer-visible behaviour, so no PRD §41.2 `UAT-*` script applies and
nothing is carried to the Gate 2 smoke test. No Rust or Python surface.

## Test plan

Reviewer steps. All offline; no network, no real forge, no real remote. **Step 0 in every shell:**
confirm `node -v` prints `v24.18.0`. Harness: Vitest via `pnpm test`
(`node tools/workspace-script.mjs test` → `vitest run --config tools/vitest.config.mjs`, which collects
`tools/tests/**/*.test.mjs`). The construction pattern to copy for a child-process-driven suite is
`tools/tests/entry-commands.test.mjs` (`spawnSync` with `shell: true` and a generous timeout); the
pattern to copy for scratch roots is `tools/tests/layout.test.mjs`'s `mkdtempSync` usage.

1. **Read the diff for a bypass first.** Any `--admin`, any `--force`, any `push --force*`, any
   re-introduction of a merge call before the gate, any path that closes the issue when `landed` is
   false, or any widening of the `.claude/` carve-out beyond the one file is a **rejected outcome**
   (Non-goals), not a style comment.
2. **Confirm the carve-out is a narrowing.** `tools/tests/frozen-paths.test.mjs` must still have
   eleven `FORBIDDEN` entries, each with a basis comment; `.claude/settings.json` must still be caught;
   `.claude/scripts/deliver-ticket.mjs` must not be. Then prove it on the real tree: touch
   `.claude/settings.json`, run `pnpm test`, observe the named failure, revert.
3. **Drive every gate outcome.** Run the new suite and read the scenarios: green, red, pending→green,
   pending→timeout, empty rollup, merge-call-accepted-but-not-landed. Each must assert the **exit code**
   and the **summary flags**, not only stdout text.
4. **Negative test — the gate is live.** Temporarily make the double report every required context
   successful *while one is in fact failing* in the rollup payload, and confirm the assertion that
   distinguishes them still fails the suite; restore. This proves the tests read the rollup rather than
   a convenient field.
5. **Negative test — the DoD cannot pass untested.** Remove `--test-cmd` from a passing scenario and
   confirm `dodPassed` flips to false (deliverable 4). Then restore.
6. **Confirm nothing else moved.** `git diff --name-only main...HEAD` lists exactly the File-scope
   paths. `.github/PULL_REQUEST_TEMPLATE.md`, `CLAUDE.md`, `.claude/workflows/*.js` are absent from
   the diff.
7. **Suite and gates.** `pnpm test` (exit 0, pass count recorded), `pnpm lint`, `pnpm typecheck`,
   `node tools/check-workspace.mjs --no-sweep` exit 0. Re-run `pnpm test` on `main` **after** the merge —
   the post-merge run on the default branch is the gate this ticket exists to make meaningful.
8. **Read the six required contexts on the PR itself** and confirm each is green before clearing, since
   this is the first ticket delivered under live protection.

## Feedback obligation

**General rule.** If implementation falsifies anything here, update **this ticket** first — version
+0.1 with a changelog line — then change code, then re-publish the issue
(`publish-tickets.mjs --sync`). Where the falsified item is a phase-2 *decision*, the writeback target
is `docs/prd/breakdown-plan-02-ci-repair.md` §4 as well, by a docs PR. Spec is never patched into a
plan, into code, or by hand-editing the issue (CLAUDE.md, issue #53).

1. **The forge does not expose the required-context list to this token.** → Do **not** silently degrade
   to "merge anyway". Use the documented fallback (every context in the rollup), record the observed
   error and which rule was used in this ticket (+0.1, `--sync`), and state it in the PR. If *neither*
   list is obtainable, that is a stop and an escalation: a delivery script that cannot see the gate
   must not merge.
2. **The 20-minute default is wrong in practice** — CI regularly takes longer, or a lane cannot hold a
   worktree that long. → That is **Q-CI-B** (phase-2 plan §7), owner Founder. Record the measured CI
   duration here, propose a number, and change the default only after the Founder answers. Do not make
   the timeout unbounded, and do not make a timeout merge.
3. **Exit code 2 breaks a caller.** `run-milestone.js` and `start-all.js` are **frozen** and must not be
   edited. → If a non-zero exit demonstrably strands a run, record the evidence here (+0.1) and fall
   back to *exit 0 with `dodPassed:false`* — which both runners already treat as not delivered — rather
   than editing a frozen file. Report the constraint to the Architect; a runner change is a separate
   ticket with its own allocation.
4. **Refusing the template fallback strands a delivery** because some path legitimately has no
   `--body-file`. → Record which path and why. The fix is that the caller composes a body, never that
   the script invents one: `.github/PULL_REQUEST_TEMPLATE.md` is frozen, and `pr-contract.mjs`'s header
   forbids editing it to make the check pass.
5. **This ticket's own delivery reports NOT delivered** because the *old* script attempts the merge
   while the six required contexts are pending. → This is **expected** and is recorded as finding
   **F-CI3** (phase-2 plan §7). It is not a defect of the implementation. Re-run the deliver step once
   the checks have concluded — the existing open PR is detected and the merge retried, with no second
   build — or have a human merge on the web and let a resume run close and verify the issue. Do **not**
   rebuild the ticket on the same branch: two independent builds of one ticket cannot be merged,
   rebased or honestly reviewed (CLAUDE.md; the divergence guard).
6. **Someone proposes `gh pr merge --auto` instead of polling.** → Not adopted here without a decision:
   auto-merge lands the PR *after* this script has exited, so the script can no longer verify the merge,
   close the issue, fast-forward the local default or run the DoD test command — every downstream step
   of the Definition of Done assumes the merge is observable. **ADR candidate (raised here, not
   authored here — this ticket writes nothing under `docs/adr/`):** *how the delivery script decides a
   merge is safe* — bounded polling versus forge auto-merge versus a human gate. Owner: **Architect**;
   trigger: the first timeout escalation under D-CI3.

**Escalation.** If the required checks cannot be both *consulted* and *waited for* without either
bypassing the gate or holding a lane indefinitely, then the delivery model — a synchronous script that
owns the merge and everything after it — is what is wrong, not this ticket. Stop, escalate to the
human, and raise it with the **Architect**. **Never** resolve a red or pending gate by merging anyway,
by lowering the timeout until the gate is vacuous, or by removing a context from protection: the whole
phase exists because 32 pull requests merged past a gate nobody read.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-15 | Initial ticket. Implements DEV-004 against `.claude/scripts/deliver-ticket.mjs` failure classes 5 and 6: a bounded wait on the required-check rollup before merging (D-CI3, which extends the PRD's wording so the gate does not deadlock — the merge is attempted seconds after the push, when the six now-required contexts are still pending), an unlanded merge as a hard exit-2 failure rather than a `note()`, a Definition of Done that fails when no `--test-cmd` was supplied, and the removal of the unfilled-`PULL_REQUEST_TEMPLATE.md` body fallback that made every pull request fail the §45.4 contract by construction. Carries the D-CI4 single-file carve-out of `.claude/**` from the frozen row — recorded in `docs/prd/breakdown-plan-02-ci-repair.md` §3 because `breakdown-plan.md` §4 is frozen for phase 2 — implemented by **narrowing** `tools/tests/frozen-paths.test.mjs`'s `FORBIDDEN` entry rather than deleting it. First ticket in the phase-2 DAG; the other four are `blocked_by` it (D-CI7). |
