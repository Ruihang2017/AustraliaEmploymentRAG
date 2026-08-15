---
id: FND-23
title: A pnpm ci:local entry point that reproduces the CI job set, and the nanoid override
module: 00-foundation
lane: 00-foundation
size: M
agent: builder
status: draft
date: 2026-08-15
blocked_by: [FND-01, FND-20]
blocks: []
---

# FND-23 — A `pnpm ci:local` entry point that reproduces the CI job set, and the nanoid override

Implements PRD-02 requirement **DEV-005** (a Definition-of-Done test command that reproduces the CI
job set and is runnable from a developer machine as a single command) and the override half of failure
class 4, against PRD §20.3 (the gate list), PRD §45.3 (committed pins; CI and local development use the
same pinned versions) and phase-2 decision **D-CI1**. No ADR — the gate list is decided by PRD §20.3
and the audit scoping by the Founder in PRD-02 §6; this ticket assembles what already exists.
Parent sub-PRD for this phase: [breakdown-plan-02-ci-repair.md](../../breakdown-plan-02-ci-repair.md)
— that file, not the frozen `00-foundation/README.md`, carries this phase's file-scope allocation (§3)
and decision register (§4). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-01 — Monorepo bootstrap](FND-01-monorepo-bootstrap-pinned-toolchains-workspace-skeleton.md)
(owns the root manifest, the lockfiles, `tools/workspace-script.mjs`, `tools/fixtures/script-owners.json`
and `tools/tests/scripts.test.mjs`; delivered and merged) and
[FND-20 — Gate delivery on required checks](FND-20-gate-delivery-on-required-checks.md) (phase-2
**D-CI7**: until it lands, every ticket in this phase is reported NOT delivered — and `FND-20` is what
makes a missing `--test-cmd` fail the Definition of Done, which is what gives this command its job).
**Why `builder`:** a bounded addition to the root manifest and one new script under an allocated tree,
composing commands that already exist — no new subsystem, no product surface, no new decision.

## Background + basis

### The root cause this ticket addresses

`docs/PRD-02-ci-repair.md` §1, *"Root cause of the class, not of any one item"*:

> The pipeline's operative definition of "tests green" is `pnpm test` on Windows. That is a strict
> subset of what CI runs:
>
> | CI runs | reached by `pnpm test` |
> |---|---|
> | `uv run pytest` (`pipelines/*`) | no — `pipelines/*` is not in `pnpm-workspace.yaml` |
> | `cargo build && cargo test` | no |
> | `pnpm audit`, `secret-scan.mjs`, `scan:container`, `scan:licence` | no |
> | `pnpm generate && pnpm generated:check` | no |
> | ubuntu-latest | no — Windows, the one platform on which class 1 cannot fail |
>
> So a Builder and a Reviewer can both honestly report green while CI is red, indefinitely. Local
> green and CI green have no causal relationship, and until that link exists every other repair here
> is a point fix that will be re-broken by the next platform-shaped assumption.

`pnpm test` resolves to `node tools/workspace-script.mjs test` → `vitest run --config
tools/vitest.config.mjs`, whose `include` is exactly `['tools/tests/**/*.test.mjs']` plus whatever
workspace members provide a `test` script. Everything else in the table above is unreachable from it.
**DEV-005 exists to close that gap with one command a human or a runner can invoke.**

### What `ci.yml` actually runs — the set to reproduce

Read off `.github/workflows/ci.yml` on `main` @ `0b19067` (nine jobs; `--prod` is `FND-21`'s change to
the audit line, D-CI1):

| Job | Commands |
|---|---|
| `ts-type-unit` | `pnpm typecheck` · `pnpm test` · `node --test .github/workflows/checks/workflows.test.mjs` |
| `openapi-compat` | `pnpm generate && pnpm generated:check` · `pnpm -r --if-present run test:openapi-compat` |
| `migration-schema` | `pnpm -r --if-present run test:migrations` |
| `tenant-auth` | `pnpm -r --if-present run test:tenant` |
| `pii-citation` | `pnpm -r --if-present run test:pii-citation` |
| `rust-build-test` | `cargo build --workspace && cargo test --workspace` |
| `python-build-test` | `uv sync --frozen && uv run pytest` |
| `retrieval-eval-smoke` | `pnpm eval:smoke` |
| `supply-chain-scan` | `corepack pnpm audit [--prod] --audit-level=high` · `cargo metadata --locked --format-version 1` · `uv lock --check` · `node .github/workflows/checks/secret-scan.mjs` · `pnpm -r --if-present run scan:container` · `pnpm -r --if-present run scan:licence` |

The tenth context, `pr-contract.yml`'s `PRD 45.4 pull-request contract`, reads a **pull-request body**
from the `PR_BODY` environment variable and has no local equivalent — there is no PR body on a
developer machine. That is a real, bounded exclusion and deliverable 4 requires it to be stated in the
command's own output rather than silently omitted.

### The three constraints that shape where `ci:local` can live

Verified against `main` @ `0b19067`; each closes off the obvious approach:

1. **The root `scripts` block is asserted exhaustively.** `tools/tests/scripts.test.mjs`:
   `expect(Object.keys(manifest.scripts).sort()).toEqual([...owners.rootScripts].sort())`, and each
   value must be exactly `node tools/workspace-script.mjs <name>`. So `ci:local` cannot be added to
   `package.json` alone — it must also enter `tools/fixtures/script-owners.json#rootScripts`, and its
   value must go through the delegator like every other root script.
2. **`tools/workspace-script.mjs` resolves a "root implementation" inside `node_modules`.**
   `ROOT_IMPLEMENTATIONS` maps a name to a module path under `node_modules` (`eslint/bin/eslint.js`,
   `vitest/vitest.mjs`). A repository-local script is not expressible today, so the delegator needs a
   small, explicit extension.
3. **Root `package.json` is a shared file scope.** PRD-02 §4: *"The nanoid override and the `ci:local`
   script both touch it; they belong to one ticket, or the lanes will collide."* Hence one ticket for
   both halves.

### The nanoid advisory

`docs/PRD-02-ci-repair.md` §1 class 4: `nanoid <3.3.18` (GHSA-2v37-7h3g-55p8, high) fails
`pnpm audit --audit-level=high`, reached transitively through `vitest → vite → postcss`. D-CI1's
closing sentence is binding here: *"The nanoid override is still applied, so the advisory is closed
either way; the scoping is about what the gate does next time."* So this ticket applies the override
**and** `FND-21` scopes the gate; neither is a substitute for the other and neither is `blocked_by` the
other.

### Accepted caveats, carried forward

- **`ci:local` runs on Windows and cannot reproduce `ubuntu-latest`.** PRD-02 §5 item 4 asks exactly
  for *"`pnpm ci:local` exits 0 on Windows under the pinned Node 24.18.0 and reproduces the CI job
  set"* — the **job set**, not the runner OS. Platform-shaped defects like failure class 1 remain
  CI's to catch; `FND-22` is what makes that particular one impossible. This limit must be printed by
  the command, not buried here.
- **Several delegated gates are vacuously green today.** `test:openapi-compat`, `test:migrations`,
  `test:tenant`, `test:pii-citation`, `scan:container` and `scan:licence` run through
  `pnpm -r --if-present`, which matches nothing until the owning ticket registers the script (sub-PRD
  **D19**, **D4**). `ci:local` must reproduce that behaviour exactly — a *vacuously passing* gate, never
  a skipped one — and must not "improve" on CI by failing where CI passes, or the two definitions of
  green diverge again in the opposite direction.
- **`ci:local` is not a PRD §45.3 entry command.** §45.3 lists fourteen and the fixture transcribes
  them verbatim; this is a fifteenth *root script*, which is a different list
  (`script-owners.json#rootScripts`). It must not be added to `tools/fixtures/entry-commands.json` —
  that file is `FND-22`'s and its fourteen-line assertion would fail.
- **This ticket does not itself declare the command in `CLAUDE.md`.** That is the Founder's (phase-2
  plan §6 item 2, open question **Q-CI-A**). `FND-20` supplies the forcing function; this ticket
  supplies the command.

## Goal

Give the repository one command — `pnpm ci:local` — that runs, on a developer machine under the pinned
Node 24.18.0, the same command set the nine `ci.yml` jobs run, reports each one's outcome in a single
readable summary, and exits non-zero if any of them fails; and close the `nanoid` advisory at its
source with a pinned override in the root manifest, so `pnpm audit --audit-level=high` has nothing to
report regardless of D-CI1's scoping. Completion is mechanically checkable: `pnpm ci:local` exits 0 on
this workstation, its summary lists every one of the CI command set's entries with an outcome and names
the one context it cannot reproduce, and `corepack pnpm audit --audit-level=high` (unscoped) exits 0.

## Non-goals

- **No change to the PRD §20.3 gate list or to `.github/workflows/**`.** `ci.yml` is `FND-21`'s this
  phase and `checks/**` is `FND-24`'s; the gate list's membership is PRD §20.3's (PRD-02 §3 Non-goal,
  owner Architect). `ci:local` **reads** the job set; it never becomes a second source of truth for it —
  see deliverable 2.
- **No scheduled full-tree audit workflow.** Deferred by D-CI1; phase-2 plan **Q-CI-C**, owner Founder.
- **No change to `CLAUDE.md`** — including the test-command declaration. Owner: **Founder** (phase-2
  plan §6 item 2, Q-CI-A). Frozen (`breakdown-plan.md` §4).
- **No change to `.claude/**`** — including `run-milestone.js` and `start-all.js`, which read `testCmd`
  from `CLAUDE.md`. Frozen; `FND-20` carries the single-file carve-out and nothing more.
- **No change to `tools/fixtures/entry-commands.json`, `tools/tests/entry-commands.test.mjs`,
  `tools/check-workspace.mjs`, `tools/tests/readme.test.mjs` or `README.md`** — `FND-22`'s (phase-2
  plan §3). `pnpm ci:local` is documented in `tools/fixtures/script-owners.json` and in the script's own
  header comment instead.
- **No dependency upgrade beyond the override.** `vitest`, `vite` and `postcss` keep their exactly
  pinned versions; the override redirects the transitive `nanoid` only. Bumping `vitest` to pull a
  fixed tree is a **rejected outcome** here: it changes the test runner under every package in the
  workspace, which is not a repair.
- **No range specifier anywhere.** `tools/tests/skeleton.test.mjs` requires every declared dependency
  to be pinned to an exact version — `^`, `~`, `latest` and `workspace:*` are each asserted rejected
  (sub-PRD **D22a**). The override is an exact version.
- **No product code, no new workspace member, no change to `pnpm-workspace.yaml`.** PRD-02 §3;
  sub-PRD **D3** (globs, so no module edits a root file to register itself).
- **No reordering or reformatting of `package.json` beyond the two additions.**

## File-scope (write-owns)

Owned by this ticket:

- `package.json` (root) — the `ci:local` script entry and the `pnpm.overrides` block.
- `pnpm-lock.yaml` — regenerated as a build artifact by the override, never hand-edited
  (`breakdown-plan.md` §4.1: *"conflicts resolve by re-running the package manager, never hand-merge"*).
- `tools/ci-local.mjs` — **new**, the runner.
- `tools/workspace-script.mjs` — the delegator extension needed by constraint 2 above.
- `tools/fixtures/script-owners.json` — `ci:local` joins `rootScripts`.
- `tools/tests/scripts.test.mjs` — the assertions that pin the new root script.
- `tools/tests/ci-local.test.mjs` — **new**, this ticket's suite.

Does not touch:

- `tools/fixtures/entry-commands.json`, `tools/tests/{entry-commands,readme}.test.mjs`,
  `tools/check-workspace.mjs`, `README.md` — `FND-22`.
- `.claude/scripts/deliver-ticket.mjs`, `tools/tests/frozen-paths.test.mjs`,
  `tools/tests/deliver-ticket.test.mjs`, `tools/tests/support/**` — `FND-20`.
- `.github/workflows/**` — `FND-02`, `FND-21`, `FND-24`.
- `tools/fixtures/secret-patterns.json`, `tools/tests/secret-scan.test.mjs` — `FND-24`.
- `tools/workspace-assertions.mjs`, `tools/tests/{layout,line-endings,pins,skeleton}.test.mjs`,
  `tools/fixtures/{prd-20-1-layout,toolchain-pins}.json`, `tools/vitest.config.mjs`,
  `tools/eslint.config.mjs`, `tools/pytest_exit_zero_when_empty.py` — `FND-01`; read-only here.
- `pnpm-workspace.yaml`, `.npmrc`, `.node-version`, `tsconfig.base.json`, `Cargo.toml`, `Cargo.lock`,
  `rust-toolchain.toml`, `pyproject.toml`, `uv.lock`, `.editorconfig`, `.gitignore` — `FND-01`; no pin
  changes here (**D17**: no silent upgrade).
- `docs/PRD.md`, `docs/discovery/**`, `docs/archive/**`, `templates/**`, `CLAUDE.md`, `.claude/**`
  (other than `FND-20`'s carve-out), the two `tools/*.ps1`, `.github/PULL_REQUEST_TEMPLATE.md`,
  `.github/ISSUE_TEMPLATE/**`, `.gitattributes` — frozen or unallocated.
- every product tree and every workspace member manifest — other modules; PRD-02 §3.
- `docs/prd/**` — the Architect's; changed by a docs PR before this ticket executes.

**Serial-safety analysis.** Root `package.json` and `pnpm-lock.yaml` are PRD §44.3 serial-owned
artifacts whose owner is `00-foundation`/`FND-01` (`breakdown-plan.md` §4.1); they were last written
by `FND-04`'s generated-bindings work and by `FND-01`. **No other phase-2 ticket declares either** —
that is precisely why PRD-02 §4 folded the override and the script into one ticket. `tools/ci-local.mjs`
and `tools/tests/ci-local.test.mjs` do not exist. `tools/workspace-script.mjs`,
`tools/fixtures/script-owners.json` and `tools/tests/scripts.test.mjs` are `FND-01`'s, delivered, and
declared by no other phase-2 ticket. `/start-all` serialises delivery, so the lockfile regeneration
lands on its own.

**Merge safety under the protection that is already live.** The six required contexts are
`API/OpenAPI compatibility`, `Migration and tenant-schema validation`, `Tenant isolation, auth and
permission tests`, `PII and citation validation suites`, `Rust builds/tests` and
`Retrieval/evaluation smoke set`. Only the first touches anything this ticket writes: it runs
`pnpm generate && pnpm generated:check` and `pnpm -r --if-present run test:openapi-compat`, which
depend on the **lockfile** resolving and on `packages/contracts` being installable. A `nanoid` override
changes a transitive dev-only resolution and must not disturb them — **verify by watching that context
on this pull request**, acceptance item 8, rather than assuming it.

## Deliverables

1. **`pnpm ci:local` exists as a root script and goes through the delegator.** Add
   `"ci:local": "node tools/workspace-script.mjs ci:local"` to root `package.json#scripts`, add
   `"ci:local"` to `tools/fixtures/script-owners.json#rootScripts` (**not** to `owners` — it is
   implemented, not delegated to a future ticket), and extend
   `tools/workspace-script.mjs#ROOT_IMPLEMENTATIONS` so a root implementation may be a
   **repository-local script path** (`tools/ci-local.mjs`) as well as a `node_modules` module path.
   The extension must be explicit — two clearly distinguished kinds, each with its own resolution rule
   and its own "missing file" message — not a heuristic that guesses from the string. Step 2 of the
   delegator (`pnpm -r --if-present run <name>`) is unchanged and still runs afterwards, so a workspace
   member that later provides `ci:local` is still reached.

2. **`tools/ci-local.mjs` runs the CI command set, derived from `ci.yml` rather than transcribed.**
   The runner must read `.github/workflows/ci.yml` through `FND-02`'s restricted reader
   (`.github/workflows/checks/workflow-model.mjs`, imported read-only) and execute, in job order, the
   `run:` lines of every step of every job, skipping only the steps whose `uses:` is a checkout or the
   composite setup action. Deriving is the point: a transcription is a second source of truth that
   silently drifts the first time `ci.yml` changes — the same defect class `FND-11`, `FND-12` and
   `FND-19` each repaired. Rules:

   - **Every command runs**, even after one fails; the exit code is non-zero if any failed. A run that
     stops at the first failure hides the rest of the gate, which is what made class 4 mask class 3.
   - **A step's exit status is reported verbatim.** A step that exits 0 because
     `pnpm -r --if-present` matched nothing is reported **green with a `(vacuous)` marker**, matching
     CI exactly (sub-PRD D4/D19) — never as skipped, never as failed.
   - **No command is rewritten, reordered or dropped**, and no `--audit-level`, `--frozen-lockfile` or
     equivalent flag is altered. If a line cannot run locally the correct outcome is a **failure with
     its message**, not a silent omission — the whole point is that local green means CI green.
   - **Multi-line `run:` blocks** are executed line by line, in order, each reported separately, so a
     failure names the exact line.

3. **A single readable summary, and an honest statement of what it does not cover.** After the run,
   print one line per command — job id, command, exit status, `(vacuous)` where applicable — then a
   summary block that states, explicitly:

   - the running Node version, and a **hard failure** if it is not `24.18.0` (CLAUDE.md: a red result
     under Node 22.11.0 is an environment fault, and a local CI reproduction that does not check this
     reproduces the wrong thing);
   - that the run reproduces the **job set**, not `ubuntu-latest`, and that platform-shaped failures
     remain CI's to catch (Accepted caveats);
   - that the tenth context, `PRD 45.4 pull-request contract`, is **not** reproduced, because it reads a
     pull-request body that does not exist locally (Background).

4. **The `nanoid` advisory is closed at source.** Add a `pnpm.overrides` entry in root `package.json`
   pinning `nanoid` to an **exact** version `>= 3.3.18` that satisfies GHSA-2v37-7h3g-55p8, with a
   sibling comment (or a `$comment`-style key the manifest tolerates — the Builder's choice, as long as
   the basis is written down in the file) naming the advisory, the transitive path
   (`vitest → vite → postcss`), and D-CI1's division of labour: the override closes the advisory, the
   `--prod` scoping (`FND-21`) governs what the gate does next time. Regenerate `pnpm-lock.yaml` with
   the package manager; never hand-edit it.

5. **Assertions in `tools/tests/scripts.test.mjs`** — keep every existing test, and extend the
   `rootScripts` set assertion so it covers `ci:local` and still asserts each script's value is exactly
   `node tools/workspace-script.mjs <name>`. Add an assertion that `ci:local` is in `rootScripts` but
   **not** in `owners` — an implemented script must never print an owner line.

6. **`tools/tests/ci-local.test.mjs`** — a suite for the runner's decidable parts, without executing the
   real gate (which takes minutes and needs a warm toolchain). At minimum: the command list derived from
   a synthetic `ci.yml` fixture text matches the expected set, in job order, with checkout and composite
   steps excluded; a multi-line `run:` block expands to one entry per line; a failing command does not
   stop the run and does produce a non-zero overall status; the vacuous marker appears only for a
   zero-exit command that matched nothing; the Node-version guard fails on a wrong version; and a
   **non-vacuity** assertion that the derived list is non-empty and contains at least one command from
   each of the nine jobs — a runner that derives nothing must fail, not pass. No file added by this
   deliverable may contain a credential-shaped identifier (`tools/tests/secret-scan.test.mjs` scans all
   of `tools/**` inside `pnpm test`).

7. **No other change to the root manifest.** `name`, `version`, `private`, `type`, `packageManager`,
   `engines` and every existing `devDependencies` entry are byte-identical to `main` (**D17**: no
   silent upgrade).

## Acceptance checklist (classified)

**Before any run**, confirm `node -v` prints `v24.18.0` (CLAUDE.md). A red result under Node 22.11.0 is
an environment fault, not a regression.

- [ ] `[machine]` **`pnpm ci:local` exits 0 on this workstation** under the pinned Node 24.18.0, and its
      full output — every command with its status — is pasted into the PR (PRD-02 §5 item 4).
- [ ] `[machine]` **It reproduces the job set, and the mapping is checkable.** The output lists at least
      one command from each of the nine `ci.yml` jobs, and the derived list is compared, in the PR,
      against the Background table. A command present in `ci.yml` and absent from the run is a defect.
- [ ] `[machine]` **It is derived, not transcribed — demonstrated.** Locally add a scratch step with a
      `run:` line to one `ci.yml` job (not committed), re-run `pnpm ci:local`, and record that the new
      command appears in the output; revert and confirm `git status --porcelain` is clean
      (deliverable 2).
- [ ] `[machine]` **It fails when CI would fail, and reports everything.** Locally break one command
      (for example point a step at a non-existent script), re-run, and record that the run **continues**,
      reports that command as failed, and exits non-zero. Restore.
- [ ] `[machine]` **A vacuous gate is green, not skipped.** The output marks the `--if-present` gates
      `(vacuous)` and counts them as passing, matching CI (sub-PRD D4/D19).
- [ ] `[machine]` **The Node guard bites.** Run it once with the machine PATH's Node 22.11.0 ahead of
      the pin and record the hard failure naming the version (deliverable 3).
- [ ] `[machine]` **It states its two exclusions.** The summary names `ubuntu-latest` and the
      `PRD 45.4 pull-request contract` context explicitly (deliverable 3).
- [ ] `[machine]` **The advisory is closed at source.** `corepack pnpm audit --audit-level=high` —
      **unscoped**, i.e. without `--prod` — exits 0 on this branch, where on `main` it reports
      GHSA-2v37-7h3g-55p8. Both outputs are pasted into the PR (deliverable 4).
- [ ] `[machine]` **The lockfile is a build artifact, and the install is still frozen-clean.**
      `corepack pnpm install --frozen-lockfile` exits 0 on this branch, and `pnpm-lock.yaml` shows only
      the override's resolution changes. It was regenerated by the package manager, not hand-edited.
- [ ] `[machine]` **The root script set is still exhaustively asserted.** `tools/tests/scripts.test.mjs`
      is green with `ci:local` in `rootScripts` and absent from `owners`, and every root script's value
      is still `node tools/workspace-script.mjs <name>` (deliverable 5).
- [ ] `[machine]` **The pins did not move.** `git diff main...HEAD -- package.json` shows only the
      `ci:local` entry and the `pnpm.overrides` block; `.node-version`, `rust-toolchain.toml`,
      `pyproject.toml` and every `devDependencies` version are unchanged (deliverable 7; D17).
- [ ] `[machine]` **The branch is mergeable under the live protection**, and in particular
      `API/OpenAPI compatibility` — the one required context that depends on the lockfile — is green.
      All six names and conclusions are pasted into the PR (File-scope).
- [ ] `[machine]` **Full suite green — the standing item** (PRD §20.3, §45.3). `pnpm test` exits 0 with
      the pass count stated in the PR; `pnpm lint` and `pnpm typecheck` green.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (`DEV-005`; D-CI1 for the
      override), user-visible change (**none** — repository tooling), non-goals, schema/API/event
      compatibility (**none**), tenant/PII/security impact (**none** — the runner reads no credential
      and `ci:local` executes only commands already written in `ci.yml`; the override *reduces* exposure
      by closing a high-severity advisory), source/licence impact (**a pinned override of an existing
      transitive dependency**, no new package added), cost/latency impact (a full local gate run takes
      minutes — that is the point, and the reason Q-CI-A asks which string `CLAUDE.md` declares),
      rollback path (revert the commit — which removes the only local reproduction of the CI job set and
      re-opens the advisory, so the rollback note must say so), known gaps (the four Accepted caveats,
      plus Q-CI-A).

**Absent classes.** No `[fixture]` criteria in the plan's sense — the synthetic `ci.yml` text in the
suite is a test input, not a PRD §40.8 adapter fixture or a §14/§43 evaluation replay. No `[human]`
criteria — repository tooling with a mechanical acceptance surface and no customer-visible behaviour;
no PRD §41.2 `UAT-*` script applies. Rust and Python are *invoked* by `ci:local` but no Rust or Python
source changes.

## Test plan

Reviewer steps. Offline except where the package manager needs its store warm. **Step 0 in every
shell:** confirm `node -v` prints `v24.18.0`. Harness: Vitest via `pnpm test`
(`vitest run --config tools/vitest.config.mjs`). The construction pattern to copy for reading a
workflow is `.github/workflows/checks/workflows.test.mjs` (which imports the restricted reader rather
than a second YAML parser); for a `spawnSync`-driven suite, `tools/tests/entry-commands.test.mjs`.

1. **Read the runner for a divergence from CI first.** Any command rewritten, reordered, dropped,
   wrapped in a conditional, or given a different flag than `ci.yml` spells is a **rejected outcome**
   (Non-goals) — a local gate that is *easier* than CI recreates the very failure this phase exists to
   end, and one that is *stricter* trains people to ignore it.
2. **Confirm derivation, not transcription.** The runner must import
   `.github/workflows/checks/workflow-model.mjs` and read `ci.yml`; a hardcoded array of command
   strings is a defect even if the array is currently correct. Prove it with the scratch-step
   experiment (acceptance item 3).
3. **Run it.** `pnpm ci:local` end to end on this workstation; read every line of the summary against
   the Background table; confirm the two stated exclusions and the Node-version line are present.
4. **Negative test — failures are reported, not swallowed.** Break one command, re-run, confirm the run
   continues, the failure is named, and the exit code is non-zero. Restore.
5. **Negative test — the vacuous marker is real.** Register a `scan:licence` script in a scratch
   workspace member so the gate stops being vacuous, re-run, confirm the marker disappears and the
   command actually runs. Revert.
6. **Audit both ways.** On `main`, `corepack pnpm audit --audit-level=high` reports the advisory; on the
   branch it exits 0. Then confirm `corepack pnpm install --frozen-lockfile` exits 0, so the lockfile
   and the manifest agree.
7. **Read the manifest diff.** Only two additions; no pin moved; no range specifier introduced
   (`tools/tests/skeleton.test.mjs` asserts exact pins, and D22a's positive control rejects `^`, `~`,
   `latest` and `workspace:*`).
8. **Suite and gates.** `pnpm test` (exit 0, pass count recorded), `pnpm lint`, `pnpm typecheck`,
   `node tools/check-workspace.mjs --no-sweep` green on this branch; `pnpm test` re-run on `main` after
   the merge.

## Feedback obligation

**General rule.** If implementation falsifies anything here, update **this ticket** first — version
+0.1 with a changelog line — then change code, then re-publish the issue
(`publish-tickets.mjs --sync`). Where the falsified item is a phase-2 decision, the writeback target is
`docs/prd/breakdown-plan-02-ci-repair.md` §4 as well, by a docs PR. Never patch spec into a plan, into
code, or by hand-editing the issue (CLAUDE.md, issue #53).

1. **A `ci.yml` command cannot run on Windows at all** — not "fails", but has no local meaning. → Do
   **not** drop it silently and do **not** wrap it in a platform conditional inside the runner. Record
   which command and why here (+0.1, `--sync`), and report it as a **failed** entry with that reason in
   the summary, so `pnpm ci:local` exiting 0 keeps meaning "CI would pass". If that makes the command
   permanently red, stop and escalate: DEV-005 asks for a reproduction, and a reproduction that must be
   ignored is worse than none.
2. **Deriving from `ci.yml` proves impractical** — the restricted reader cannot model a step, or the
   import from `.github/workflows/checks/**` is unavailable. → `.github/workflows/**` is `FND-21`'s and
   `FND-24`'s this phase and must not be edited from here. Record the exact limitation, and only then
   fall back to a **fixture derived from `ci.yml` with a test that asserts the two agree** — a second
   source of truth is acceptable *only* when a guard fails the moment they drift, which is the lesson of
   `FND-11`/`FND-12`/`FND-19`. A bare hardcoded list is not an acceptable fallback.
3. **The override does not clear the audit**, or clears it while breaking a test — for example `vitest`
   misbehaves against the overridden `nanoid`. → Do **not** bump `vitest`, `vite` or `postcss` to route
   around it (Non-goals: that changes the test runner under every package). Record the observed failure
   here, and escalate to the **Architect**: the choice between an override and a toolchain bump is a
   D17 question about pins, not a repair ticket's to make.
4. **Extending `ROOT_IMPLEMENTATIONS` breaks another root script.** `tools/workspace-script.mjs` is
   `FND-01`'s and is on the critical path of `pnpm lint` and `pnpm test`. → Record the breakage here
   before changing the mechanism further; keep the two kinds explicit rather than adding a third
   heuristic; and re-run `pnpm lint` and `pnpm test` as the acceptance for that file specifically.
5. **Someone proposes making `pnpm test` an alias for `ci:local`.** → Rejected without a decision:
   `pnpm test` is PRD §45.3 entry command 6, transcribed verbatim in `tools/fixtures/entry-commands.json`
   (`FND-22`'s file) and used by the `ts-type-unit` CI job; redefining it changes what CI itself runs.
   Raise it with the **Architect**.
6. **`CLAUDE.md`'s declaration is needed before this is useful.** → True, and it is deliberately out of
   scope: phase-2 plan §6 item 2 and **Q-CI-A**, owner **Founder**. Record the exact
   double-quote-free `cmd.exe` string this ticket recommends
   (`set PATH=C:\Users\HoraceHou\AppData\Local\node-24.18.0;%PATH% && pnpm ci:local`) in the PR so the
   Founder can paste it; do not edit `CLAUDE.md`.

**Escalation.** If local execution of the CI job set cannot be made to mean the same thing as CI —
because too many commands are platform-bound, or because the two definitions of "green" cannot be kept
in step without a second source of truth — then DEV-005's premise needs a design decision (a container,
a self-hosted runner, or an explicitly reduced local subset with its limits written down). Stop,
escalate to the human, and raise it with the **Architect**. **Never** resolve it by making `ci:local`
a subset that *looks* complete: an entry point that reports green while CI is red is the exact defect
this phase exists to remove, reproduced one level up.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-15 | Initial ticket. Implements DEV-005 — one command reproducing the nine-job `ci.yml` command set on a developer machine — and applies the `nanoid` override D-CI1 keeps regardless of the `--prod` scoping, both in root `package.json`, which PRD-02 §4 folds into one ticket because it is a shared file scope. Records the three constraints that fix where the command can live: `tools/tests/scripts.test.mjs` asserts the root `scripts` key set exhaustively and asserts every value is `node tools/workspace-script.mjs <name>`; `ROOT_IMPLEMENTATIONS` resolves only `node_modules` module paths and needs an explicit second kind; and the tenth CI context (`PRD 45.4 pull-request contract`) has no local equivalent because it reads a pull-request body. Requires the command set to be **derived** from `ci.yml` through `FND-02`'s restricted reader rather than transcribed — a transcription is the `FND-11`/`FND-12`/`FND-19` defect class, one level up — and requires a vacuous `--if-present` gate to be reported green, exactly as CI reports it. |
