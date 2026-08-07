---
id: FND-11
title: Repair the repo-wide frozen-path guard
module: 00-foundation
lane: 00-foundation
size: S
agent: builder
status: draft
date: 2026-08-08
blocked_by: [FND-01]
blocks: []
---

# FND-11 — Repair the repo-wide frozen-path guard

Implements breakdown plan §4 (file-scope allocation) as a mechanical check, and PRD §20.3 / §45.3
(the `pnpm test` gate must be correct, not merely loud). No ADR — the decision is already made in
breakdown plan §4 (which paths are frozen, which are unallocated, which module write-owns each
path) and PRD §44.3 (serial owners and safe parallel work units); this is a repair ticket against a
check that mis-transcribed that decision.
Parent sub-PRD: [00-foundation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-01 — Monorepo bootstrap, pinned toolchains, workspace skeleton](FND-01-monorepo-bootstrap-pinned-toolchains-workspace-skeleton.md)
— `FND-01` created the file this ticket repairs and is already delivered and merged into `main`, so
the edge is satisfied at authoring time.
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(breakdown plan §4's frozen/unallocated/write-owns rows) — not a new subsystem decision.

## Background + basis

### What exists today

`FND-01` delivered `tools/tests/frozen-paths.test.mjs` and it is merged into `main`. It is a
**repository-wide** vitest suite: `tools/vitest.config.mjs` includes `tools/tests/**/*.test.mjs`, so
every ticket in the plan runs it as part of the standing `[machine] pnpm test` acceptance item
(PRD §45.3). Its purpose is right and worth keeping: **no ticket branch may write a path that
breakdown plan §4 freezes or leaves unallocated.** That guard is what makes the §2 decomposition
principle — *"the only thing that makes [parallel lanes] safe is that two concurrently-running
tickets never write the same path"* — enforceable rather than aspirational, and it is the mechanical
expression of PRD §44.3's *"Serial owners are required for root lockfiles, canonical enums, OpenAPI
root, app migration order, corpus schema/manifest, active release/promotion files and production
Compose/deployment configuration."*

The file encodes **one ticket's** file-scope (`FND-01`'s) as that global invariant. Its own header
comment says so: *"Paths breakdown plan §4 freezes or leaves unallocated, **which the FND-01
File-scope forbids touching**."* Two concrete defects follow from that framing.

### Defect 1 — an allocated path is listed as forbidden

`FORBIDDEN` contains `/^\.github\/workflows\//`. Breakdown plan §4 allocates `.github/workflows/**`
to module `00-foundation` as a **write-owns** path, and `FND-02`'s File-scope is exactly
`.github/workflows/** — all files`. `FND-01` correctly listed `.github/workflows/**` under its own
*does-not-touch* set ("`FND-02` (same module, next wave)"), and that ticket-local exclusion was
transcribed into a repository-wide deny-list. The result: `FND-02` writing the files the plan
allocates to it is reported as a frozen-path violation.

### Defect 2 — the non-vacuity check names one ticket's files

The test named *"is not vacuous — the branch diff actually contains this ticket's files"* asserts,
for any non-empty branch diff, `expect(changed).toContain('package.json')` and
`expect(changed).toContain('README.md')`. Those are `FND-01`'s two files. Every branch that is not
`FND-01`'s fails it.

### Evidence (three independent reproductions — settled, not to be re-litigated)

| Reproduction | Observed |
|---|---|
| `FND-02` builder | `Test Files 1 failed | 8 passed (9)` — both assertions failing, everything else green |
| `FND-03` builder | Same failure — `1 failed | 96 passed (97)` |
| `LNCH-01` builder | **Control experiment**: a probe branch containing one unrelated file reproduced the identical failure at the identical line with no `LNCH-01` file involved. Probe branch deleted. |

**Why it was invisible on `main` and on `FND-01`'s branch.** On `main` the branch diff is empty and
the non-vacuity assertion is guarded by `if (changed.length > 0)`; on `FND-01`'s branch the diff
contains `package.json` and `README.md` and touches no `.github/workflows/**` file. The defect is
only observable from a *foreign* branch. This is a genuine cross-ticket defect, not a review miss —
and it is why the acceptance checklist below is written entirely around foreign branches.

### Consequence

The last `/start-all` run delivered 1 of 235 tickets: `FND-02` and `FND-03` failed at the builder
stage and 232 tickets were skipped as dependency cascade. One file blocks the whole PRD.

### The contract this file must encode — breakdown plan §4, verbatim

The frozen row (*"frozen — no module writes"*):

> `docs/PRD.md`, `docs/discovery/**`, `docs/archive/**`, the two pre-existing `tools/*.ps1`,
> `templates/**`, `CLAUDE.md`, `.claude/**`

The **unallocated** paths — no module's write-owns row names them, and sub-PRD open question
**Q-F6** is still open (*"No module owns `.github/PULL_REQUEST_TEMPLATE.md` or
`.github/ISSUE_TEMPLATE/**` (breakdown plan §4 allocates only `.github/workflows/**`) … **Still
open** — the §8 decision register does not allocate these paths"*): `.github/PULL_REQUEST_TEMPLATE.md`,
`.github/ISSUE_TEMPLATE/**`, and `.gitattributes` (see the decision below).

Paths that are **allocated** and must therefore never be forbidden — the `00-foundation` write-owns
row after plan v0.3:

> Root manifests/lockfiles (`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc`,
> `.node-version`, `tsconfig.base.json`, `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`,
> `pyproject.toml`, `uv.lock`, `.editorconfig`, `README.md`, `.gitignore`) · `tools/**` ·
> `.github/workflows/**` · `packages/contracts/**` · `packages/domain/**` · `schemas/openapi/**` ·
> `schemas/events/**`

plus every other module's row, plus the two non-module rows that must also stay writable:
*shared-additive* `docs/adr/NNNN-<slug>.md` (decision **A9**, claimed by the creating ticket) and
*planning artifacts* `docs/prd/**` and `docs/plans/**`. `docs/prd/**` in particular **must not** be
forbidden: several tickets' Feedback obligations require the sub-PRD or the breakdown plan to be
updated **in the same PR** as the code (`FND-01`'s obligation 2 / **Q-F7** did exactly that, adding
`.gitignore` to §4 in plan v0.3).

### `.gitattributes` — decision, with its basis

**Decision: `.gitattributes` stays in `FORBIDDEN`, on the *unallocated* basis, not the frozen one.**
Basis:

1. §4's frozen row does not list it — so it is **not** frozen, and the comment must not claim it is.
2. No module's write-owns row lists it either. The `00-foundation` root-file enumeration is explicit
   and gained `.gitignore` in plan v0.3 under **Q-F7** while deliberately not gaining
   `.gitattributes`. An enumerated list that was edited and still omits the path is evidence of
   omission, not of oversight.
3. The guard's purpose is *frozen **or** unallocated*. `.gitattributes` is unallocated, exactly like
   `.github/PULL_REQUEST_TEMPLATE.md`, and belongs in the same class.
4. `FND-01`'s own File-scope already records it as such:
   *"`.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/**`, `.gitignore`, `.gitattributes`
   — unallocated by breakdown plan §4."* (`.gitignore` has since been allocated; `.gitattributes`
   has not.)
5. Blast radius: `.gitattributes` governs line-ending and diff behaviour for the whole tree on a
   Windows checkout. An unowned edit to it changes every other ticket's diff. Of all the unallocated
   files, it is the one where "no owner" most needs to mean "no write".

The escape hatch is the same one `.gitignore` used: a ticket that genuinely needs it adds the path
to breakdown plan §4's `00-foundation` write-owns row (a docs PR) **first**, then removes the entry
here. See Feedback obligation 1.

### Sequencing note (operational, not a DAG edge)

`blocks` is deliberately empty. The 233 remaining tickets are already ordered behind `FND-01`;
adding 233 `blocks` edges would rewrite every ticket file and change nothing about execution order.
The operational consequence must nevertheless be stated: **`FND-11` has to land before the next
`/start-all` schedules `FND-02`, `FND-03` or `LNCH-01`**, or those tickets fail again on the same
line. `FND-11` is a wave-2 sibling of theirs (all four are blocked only by `FND-01`), so at
concurrency > 1 the scheduler may run them together. Running this ticket to completion first is a
human scheduling decision, recorded here so it is not discovered by repeating the failure.

### Accepted caveats carried forward, not re-litigated

- The check is a **deny-list** (frozen + unallocated paths enumerated), not an allow-list derived
  from every §4 write-owns row. A path that is neither enumerated here nor allocated anywhere — for
  example a newly invented `docs/<something>.md` at the `docs/` root — therefore passes. Inverting
  to an allow-list would require transcribing all 25 write-owns rows plus the two non-module rows
  and is a larger design change than this repair; it is a **non-goal** (below) with a named owner.
- Base-ref resolution (`main`, else `origin/main`) is `FND-01`'s design and is **not** changed here.
  It is correct under `/start-all`'s isolated git worktrees, which share the repository's refs.

## Goal

Repair `tools/tests/frozen-paths.test.mjs` so that it enforces breakdown plan §4 on **any** branch
rather than `FND-01`'s file-scope on `FND-01`'s branch: `FORBIDDEN` transcribed from §4's frozen row
plus the enumerated unallocated paths (with `.github/workflows/**` removed, because §4 allocates it
to `00-foundation`), a non-vacuity check that proves the diff mechanism is live without naming any
ticket's files, a new control-vector check that proves the path predicate itself is neither
over-broad nor under-broad, and a header comment naming breakdown plan §4 as the list's single
source of truth so a future edit that adds an allocated path is visibly wrong. Completion is
mechanically checkable on foreign branches: a scratch branch touching only an allocated path passes
the suite, and a scratch branch touching a frozen or unallocated path fails it naming that path.

## Non-goals

- **No change to any file other than `tools/tests/frozen-paths.test.mjs`.** In particular no change
  to `tools/workspace-assertions.mjs`, `tools/vitest.config.mjs`, `tools/check-workspace.mjs` or any
  other `tools/tests/*.test.mjs` — all `FND-01`'s, all delivered. Extracting the predicate into a
  shared helper is not part of this repair; see Feedback obligation 2.
- **No change to breakdown plan §4 itself.** This ticket transcribes §4; it does not amend it. A
  path whose allocation is genuinely wrong is a plan change (Architect, docs PR), not a list edit —
  Feedback obligation 1.
- **No allow-list rewrite.** Converting the deny-list into "every changed path must fall inside some
  §4 write-owns row" is a separate, larger ticket. Owner: the **Architect**, via breakdown plan §4
  and a new `00-foundation` ticket if it is wanted. Do not start it here.
- **No change to base-ref resolution, and no change to the two tests that already behave correctly**
  (*"resolves a base ref, so this check is never silently skipped"* and *"leaves the two pre-existing
  `tools/*.ps1` scripts byte-identical to main"*) beyond what deliverable 6 permits.
- **No weakening of the guard to make it pass.** Deleting the frozen-path assertion, wrapping it in
  a conditional, marking it `.skip`, narrowing it to a subset of §4's frozen row, or making its
  failure non-fatal are all out of scope and are rejected outcomes, not shortcuts. The point is a
  correct guard, not a quiet one.
- **No CI workflow changes** — `.github/workflows/**` is `FND-02`'s. This ticket makes `FND-02`
  runnable; it does not do `FND-02`'s work.
- **No re-litigation of Q-F6.** `.github/PULL_REQUEST_TEMPLATE.md` and `.github/ISSUE_TEMPLATE/**`
  stay forbidden precisely because Q-F6 is open. Resolving Q-F6 is the Architect's.

## File-scope (write-owns)

Owned by this ticket:

- `tools/tests/frozen-paths.test.mjs` — **this one file, and nothing else.**

Does not touch:

- `tools/workspace-assertions.mjs`, `tools/vitest.config.mjs`, `tools/check-workspace.mjs`,
  `tools/workspace-script.mjs`, `tools/fixtures/**`, `tools/pytest_exit_zero_when_empty.py`,
  `tools/eslint.config.mjs` and the other eight `tools/tests/*.test.mjs` files — `FND-01`
  (same module, wave 1, delivered and merged).
- `.github/workflows/**` — `FND-02` (same module, wave 2).
- `packages/contracts/**`, `packages/domain/**`, `schemas/**` — `FND-03` … `FND-10` (same module).
- Root manifests, lockfiles, tool-version files, `README.md`, `.gitignore` — `FND-01`.
- Every other module's write-owns tree in breakdown plan §4.
- `docs/PRD.md`, `docs/discovery/**`, `docs/archive/**`, `tools/validate-prd.ps1`,
  `tools/export-visible-transcript.ps1`, `templates/**`, `CLAUDE.md`, `.claude/**` — frozen
  (breakdown plan §4).
- `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/**`, `.gitattributes` — unallocated
  (breakdown plan §4; Q-F6 and the `.gitattributes` decision above).
- `docs/prd/**` — the ticket, the sub-PRD and the breakdown plan are changed by a **docs PR before**
  this ticket executes (CLAUDE.md: the ticket is the executable source of truth; spec changes go
  through the ticket, never through code). The scratch probes in the Test plan are **local branches
  only**: never pushed, deleted after use.

**Serial-safety analysis.** `tools/tests/frozen-paths.test.mjs` was last written by `FND-01`, which
is merged into `main`; no in-flight ticket writes it. `FND-02` (`.github/workflows/**`) and `FND-03`
(`packages/contracts/src/{enums,ids}/**`) are this ticket's wave-2 siblings and their write-sets are
disjoint from this one file, so all three lanes may run concurrently without contention. The
*behavioural* coupling is one-directional and is a scheduling matter, not a file conflict: until
this ticket merges, those two lanes fail the suite (see the Sequencing note).

## Deliverables

All of the following land in `tools/tests/frozen-paths.test.mjs`. Internal organisation inside the
file is the Builder's choice; the boundary and the load-bearing mechanics below are not.

1. **`FORBIDDEN`, transcribed from breakdown plan §4.** Exactly these entries, anchored, matched
   case-sensitively against repository-relative forward-slash git paths, each carrying its §4 basis
   in a comment:

   | # | Pattern | breakdown plan §4 basis |
   |---:|---|---|
   | 1 | `/^docs\/PRD\.md$/` | frozen row |
   | 2 | `/^docs\/discovery\//` | frozen row |
   | 3 | `/^docs\/archive\//` | frozen row |
   | 4 | `/^tools\/validate-prd\.ps1$/` | frozen row — "the two pre-existing `tools/*.ps1`" |
   | 5 | `/^tools\/export-visible-transcript\.ps1$/` | frozen row — "the two pre-existing `tools/*.ps1`" |
   | 6 | `/^templates\//` | frozen row |
   | 7 | `/^CLAUDE\.md$/` | frozen row |
   | 8 | `/^\.claude\//` | frozen row |
   | 9 | `/^\.github\/PULL_REQUEST_TEMPLATE\.md$/` | unallocated — no write-owns row names it (Q-F6, open) |
   | 10 | `/^\.github\/ISSUE_TEMPLATE\//` | unallocated — no write-owns row names it (Q-F6, open) |
   | 11 | `/^\.gitattributes$/` | unallocated — see the decision in Background |

   `/^\.github\/workflows\//` is **removed**: §4 allocates `.github/workflows/**` to
   `00-foundation` (`FND-02`). No pattern may be added that matches any of these allocated paths:
   `.github/workflows/**`, `.gitignore`, `tools/**` other than the two `.ps1` scripts, the root
   manifests/lockfiles/tool-version files/`README.md`/`.editorconfig`, `packages/**`, `apps/**`,
   `services/**`, `pipelines/**`, `schemas/**`, `evals/**`, `infra/**`, `sdk/**`, `tests/**`,
   `docs/runbooks/**`, `docs/api/**`, `docs/policies/**`, `docs/onboarding/**`, `docs/release/**`,
   `docs/adr/**` (shared-additive, A9), `docs/prd/**` and `docs/plans/**` (planning artifacts).
   No `i` flag on any pattern: git records paths in their canonical case, and a case-insensitive
   `^templates\//` would also match an unrelated `Templates/` tree.

2. **A header comment tying the list to its source of truth**, replacing the current one, which
   grounds the list in `FND-01`'s File-scope. It must state, in substance:
   - `docs/prd/breakdown-plan.md` **§4** is the single source of truth for this list;
   - an entry belongs here only if §4 puts the path in the *frozen* row **or** leaves it
     unallocated — a path that appears in **any** module's write-owns row must **not** be listed,
     and listing one is the defect this file was repaired for (`FND-11`);
   - the escape hatch: allocate the path in §4 by a docs PR **first**, then remove the entry here;
   - the reason the ticket-local framing was wrong: one ticket's does-not-touch set is not a
     repository-wide invariant, and this suite runs on every ticket's branch.

3. **A new control-vector test that proves the predicate is live in both directions** — the
   anti-regression mechanism, independent of any branch:
   - a `FORBIDDEN_CONTROL` table of synthetic paths, at least one per `FORBIDDEN` entry (e.g.
     `docs/PRD.md`, `docs/discovery/notes.md`, `docs/archive/old.md`, `tools/validate-prd.ps1`,
     `tools/export-visible-transcript.ps1`, `templates/ticket.template.md`, `CLAUDE.md`,
     `.claude/settings.json`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/bug.md`,
     `.gitattributes`). Assert every control path matches, **and** assert that every `FORBIDDEN`
     entry is matched by at least one control path — so an entry added without a control vector
     fails the suite and the table cannot rot;
   - an `ALLOWED_CONTROL` table of synthetic paths that §4 allocates, each annotated with its owning
     module, covering at minimum `.github/workflows/ci.yml`, `.gitignore`, `package.json`,
     `README.md`, `tools/check-workspace.mjs`, `tools/tests/frozen-paths.test.mjs`,
     `docs/prd/breakdown-plan.md`, `docs/prd/00-foundation/README.md`, `docs/adr/0001-example.md`,
     `docs/runbooks/restore.md`, `packages/domain/src/legal/index.ts`,
     `apps/api/src/routes/search/index.ts`, `pipelines/adapters/leg-cth/adapter.py`,
     `tests/e2e/smoke.spec.ts`. Assert **none** of them matches any `FORBIDDEN` entry.

   These are string literals evaluated against the regexes. They are not branch content, they touch
   no filesystem path, and they name no ticket's deliverables.

4. **Replacement of the non-vacuity test.** The current one (`toContain('package.json')`,
   `toContain('README.md')`) is deleted. Its replacement keeps the property it was reaching for —
   *the frozen-path check is not passing merely because the changed-file list came back empty* — and
   must be **ticket-agnostic**:
   - it must name **no** repository file path belonging to any ticket's deliverables; the only
     literal paths it may contain are the deliverable-3 control vectors and git revision
     expressions;
   - it must prove the **same** changed-file helper used by the frozen-path test returns a
     **non-empty** list for a range that exists in every clone of this repository and is chosen
     without reference to any ticket's files. Default mechanism: the helper applied to
     `<base>~1..<base>`; if `<base>~1` does not resolve (single-commit repository) fall back to the
     base commit's own tree listing (`git show --pretty= --name-only <base>`); if the chosen range
     yields an empty list, walk back at most five commits from `<base>` and fail only if every one
     of them is empty, with a message naming the ranges tried. An equivalent mechanism satisfying
     the same three constraints is acceptable; a mechanism that inspects the current branch's own
     diff content is not;
   - it must assert the git invocation's exit status is `0`, so a broken git call fails loudly
     instead of yielding an empty list that reads as a pass;
   - it must contain **no** `if (changed.length > 0)`-style guard, or any other conditional under
     which an empty current-branch diff skips an assertion.

5. **Hardening of the frozen-path test itself**, keeping its current shape:
   - compute the changed-file list with `git diff --name-only -z --no-renames <base>...HEAD` and
     split on `\0`. `--no-renames` so a frozen file renamed away is listed under **both** its old
     and new path instead of being collapsed into the destination only; `-z` so a path containing a
     space, a quote or a non-ASCII character is not quoted/escaped into a string that no longer
     matches its pattern;
   - assert the git invocation's exit status is `0` before evaluating the list (already present —
     keep it);
   - the failure message continues to name **every** violating path, not just the first.

6. **The two already-correct tests are preserved behaviourally**: *"resolves a base ref, so this
   check is never silently skipped"* is unchanged; *"leaves the two pre-existing `tools/*.ps1`
   scripts byte-identical to main"* is kept (it is redundant with `FORBIDDEN` entries 4–5 by design,
   because it produces a targeted message). They may be re-ordered or share the new helper, but
   neither may be deleted, skipped or weakened.

7. **No other change to the file's public behaviour**: it remains a vitest suite under
   `tools/tests/`, collected by `tools/vitest.config.mjs`'s `tools/tests/**/*.test.mjs` include, and
   requires no network access.

Ordering constraint: deliverable 1 (the corrected list) and deliverable 2 (the comment that grounds
it) land together — a corrected list without the grounding comment is one careless edit away from
the same defect, which is exactly what this ticket exists to prevent.

## Acceptance checklist (classified)

Every `[machine]` item below is reproducible offline. The scratch branches are created from `main`,
never pushed, and deleted after the observation is recorded.

- [ ] `[machine]` **Foreign-branch pass, allocated path (proves defect 1 fixed).** A scratch branch
      off `main` whose only change is adding `.github/workflows/zz-frozen-paths-probe.yml` runs
      `pnpm test` with `tools/tests/frozen-paths.test.mjs` **fully green** (breakdown plan §4 —
      `.github/workflows/**` is `00-foundation`'s write-owns path; `FND-02` File-scope).
- [ ] `[machine]` **Foreign-branch pass, a different allocated path (proves defect 2 fixed and the
      pass is not special-cased).** A second scratch branch off `main` whose only change is adding
      `packages/domain/src/legal/zz-probe.ts` — a path this ticket does not touch and `FND-01` does
      not own — is also fully green. The two probes share no file, so no assertion in the file can
      depend on a particular ticket's files (breakdown plan §4; deliverable 4).
- [ ] `[machine]` **Foreign-branch fail, frozen path (proves the guard still bites).** A scratch
      branch off `main` whose only change is adding `docs/archive/zz-probe.md` fails
      `tools/tests/frozen-paths.test.mjs`, and the failure message **names**
      `docs/archive/zz-probe.md` (breakdown plan §4 frozen row).
- [ ] `[machine]` **Foreign-branch fail, unallocated paths.** Scratch branches adding
      `.github/ISSUE_TEMPLATE/zz-probe.md` and modifying `.gitattributes` each fail, naming the
      offending path (breakdown plan §4 — unallocated; Q-F6; the `.gitattributes` decision in
      Background).
- [ ] `[machine]` **The `FORBIDDEN` list equals the deliverable-1 table** — eleven entries, no
      `.github/workflows/**` entry, every entry carrying its §4 basis in a comment, no `i` flag
      (breakdown plan §4).
- [ ] `[machine]` **Control vectors, both directions.** Every `FORBIDDEN` entry is matched by at
      least one `FORBIDDEN_CONTROL` path and every `FORBIDDEN_CONTROL` path is matched by at least
      one entry; **no** `ALLOWED_CONTROL` path matches any entry (deliverable 3).
- [ ] `[machine]` **Anti-regression comment present**: the file's header states breakdown plan §4 as
      the list's source of truth and the rule that a path in any module's write-owns row must not be
      listed, and no longer grounds the list in `FND-01`'s File-scope (deliverable 2).
- [ ] `[machine]` **Non-vacuity is ticket-agnostic**: the replacement test names no repository file
      path other than the deliverable-3 control vectors, contains no
      `if (changed.length > 0)`-style skip, and fails when the changed-file helper is forced to
      return an empty list for the chosen historical range — demonstrated by temporarily pointing
      that range at an empty revision range and observing the failure, then restoring
      (deliverable 4).
- [ ] `[machine]` **Rename hardening**: on a scratch branch that renames a frozen file (e.g.
      `git mv templates/ticket.template.md docs/zz-probe.md`), the check fails and names the frozen
      **source** path — not only the destination (deliverable 5, `--no-renames`).
- [ ] `[machine]` **The diff is one file.** `git diff --name-only main...HEAD` on this ticket's
      branch lists exactly `tools/tests/frozen-paths.test.mjs` (File-scope).
- [ ] `[machine]` `pnpm test` green on this ticket's own branch — the standing suite item, and here
      also a direct check that the repaired file passes on a branch that is not `FND-01`'s
      (PRD §45.3).
- [ ] `[machine]` `pnpm lint` and `pnpm typecheck` green (PRD §20.3).
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (`DEV-001`, `E01-REPO`),
      user-visible change (none — repository tooling) and non-goals, schema/API/event compatibility
      impact (none), tenant/PII/security impact (none — no data path; the change is to a test that
      reads only git metadata), source/licence impact (none), cost/memory/latency impact (none),
      rollback path (revert the single-file commit — which restores the defect, so the rollback note
      must say so), known gaps (the deny-list limitation recorded under Accepted caveats).

**Absent classes.** No `[fixture]` criteria: this ticket replays no recorded data — the control
vectors are string literals inside the test, and the repository's fixture material (PRD §40.8
adapter fixtures, §43 evaluation replays) does not exist until modules `05` and `21`. No `[human]`
criteria: the change is pure logic with a fully mechanical acceptance surface and produces no
customer-visible behaviour, so no PRD §41.2 `UAT-*` script applies and nothing is carried to the
Gate 2 smoke test.

## Test plan

Reviewer steps. All steps are offline. Steps 2–5 create local scratch branches from `main`; none is
pushed, and each is deleted (`git checkout -` then `git branch -D <name>`) before the next begins.
Harness: vitest via `pnpm test` (`node tools/workspace-script.mjs test` →
`vitest run --config tools/vitest.config.mjs`), the framework `FND-01` registered. The construction
pattern to copy is the file's own surviving tests plus its sibling `tools/tests/*.test.mjs` suites
(for example `tools/tests/skeleton.test.mjs`), which report the offending path in the assertion
message rather than flipping a boolean. No mocks, no fixtures, no network.

1. **Read the list against the plan, entry by entry.** Open `docs/prd/breakdown-plan.md` §4 beside
   the repaired file. Confirm each of the eleven entries appears in §4's frozen row or is one of the
   three enumerated unallocated paths, that its comment states the right basis, and that no entry
   matches any allocated path in deliverable 1's must-not-match list. A paraphrased or
   over-generalised pattern (`/^docs\//`, `/^\.github\//`, `/^tools\/.*\.ps1$/`) is a defect: the
   first two forbid allocated trees, the third would forbid a future `tools/*.ps1` that
   `00-foundation` is entitled to write.
2. **Allocated-path probe (`.github/workflows/**`).** From `main`:
   `git switch -c zz-probe-workflows`, create `.github/workflows/zz-frozen-paths-probe.yml` with any
   content, commit, run `pnpm test`. Expect the whole suite green. Discard the branch.
3. **Allocated-path probe, second and unrelated.** Repeat with a single new file
   `packages/domain/src/legal/zz-probe.ts`. Expect green. Discard. (Two disjoint green probes are
   what proves the suite no longer depends on any specific ticket's files.)
4. **Frozen-path probe.** Repeat with a single new file `docs/archive/zz-probe.md`. Expect the
   frozen-path test to **fail**, with `docs/archive/zz-probe.md` in the message. Discard.
5. **Unallocated probes.** Repeat twice: once adding `.github/ISSUE_TEMPLATE/zz-probe.md`, once
   modifying `.gitattributes`. Expect failure naming the path in both cases. Discard.
6. **Rename probe.** From `main`, `git mv templates/ticket.template.md docs/zz-probe.md`, commit,
   run the suite: expect failure naming `templates/ticket.template.md`. Discard the branch — the
   frozen file must be intact afterwards (`git status --porcelain templates/` empty on return).
7. **Control-vector negative test.** Temporarily add `.github/workflows/ci.yml` to the
   `FORBIDDEN_CONTROL` table and re-run: the suite must fail, because that path is in
   `ALLOWED_CONTROL` and matches no entry. Then temporarily add `/^\.github\/workflows\//` back to
   `FORBIDDEN` and re-run: the suite must fail on the `ALLOWED_CONTROL` assertion, naming
   `.github/workflows/ci.yml`. Restore. This is the check that a future edge-case edit reintroducing
   defect 1 cannot land silently.
8. **Non-vacuity negative test.** Point the historical range used by deliverable 4 at an empty range
   (for example `<base>..<base>`) and re-run: the test must fail, naming the ranges tried. Restore.
   Then confirm by reading that the test contains no branch-diff content assertion and no
   `changed.length > 0` guard.
9. **On `main` and on this ticket's branch.** Run `pnpm test` on both. Green on both. On the ticket
   branch also run `git diff --name-only main...HEAD` and confirm the single-file scope.
10. **Cleanup verification.** `git branch --list 'zz-probe*'` returns nothing and
    `git status --porcelain` is clean.

## Feedback obligation

**General rule.** If implementation falsifies anything in this ticket, update **this ticket** (and
`docs/prd/00-foundation/README.md` where the decision is recorded) **first** — version +0.1 with a
changelog line — then change code, then re-publish the issue from the ticket
(`publish-tickets.mjs --sync`). Silent divergence is an incomplete ticket. Spec never gets patched
into an implementation plan, into code, or by hand-editing the issue (CLAUDE.md, issue #53).

**Foreseeable frictions, each with its writeback target:**

1. **A path this list forbids turns out to be needed by a real ticket** (the `.gitignore` /
   **Q-F7** situation repeating — most plausibly `.gitattributes`, or one of the Q-F6 `.github`
   templates). → Do **not** remove the entry here. Add the path to the owning module's write-owns
   row in **`docs/prd/breakdown-plan.md` §4** and record it in
   **`docs/prd/00-foundation/README.md`** (Q-F6 / a new open question) in a docs PR **first**; only
   then does the entry leave this list, in a separate change. The list is a transcription of §4 —
   editing the transcription to escape the rule is the exact failure mode this ticket repairs.
2. **The repair cannot be contained in one file** — for example the predicate must move into
   `tools/workspace-assertions.mjs` to be shared with `tools/check-workspace.mjs`, or
   `tools/vitest.config.mjs` needs a change for the new test to run. → Both are `FND-01`'s files.
   Update **this ticket's File-scope and deliverables** (version +0.1, changelog line, `--sync`)
   **before** touching them, and state the serial-safety consequence: `tools/**` is `00-foundation`'s
   write-owns tree, so this is a scope widening within the module, not a cross-module violation, but
   it widens the blast radius of a repair that 233 tickets are waiting on.
3. **The non-vacuity property cannot be proven without referencing a real file.** → That would mean
   the property as specified is unreachable. Record the exact obstacle in this ticket and in
   **`docs/prd/00-foundation/README.md`**, and escalate to the **Architect** before writing a test
   that names a repository file: a non-vacuity check that names files is how defect 2 was born, and
   reintroducing it silently would re-block the plan.
4. **A probe reveals a third class of defect in this file** — for example base-ref resolution
   behaving differently inside `/start-all`'s isolated git worktrees, or `<base>...HEAD` producing a
   surprising list after a `--no-ff` delivery merge. → Record the measurement (command, branch,
   observed output) in this ticket, fix it here **only if** it is inside this one file and inside
   this ticket's stated goal; otherwise raise it as a new `00-foundation` ticket with the Architect.
   Do not silently broaden a repair that the whole plan is blocked on.
5. **Breakdown plan §4 and this list genuinely disagree** — §4 allocates a path to two modules, or
   leaves a path both frozen and allocated. → That is a plan defect, not a test defect. Raise it
   against **`docs/prd/breakdown-plan.md` §4** with the Architect and stop; do not choose a reading
   locally. A guard built on an ambiguous allocation is worse than no guard, because it launders the
   ambiguity as a green test.

**Escalation.** If the guard cannot be made both correct (no false positive on an allocated path)
and effective (fails on every frozen or unallocated path) inside one file, that overturns the design
`FND-01` delivered and the assumption in breakdown plan §2 that file ownership is mechanically
enforceable. Stop, escalate to the human, and raise it with the Architect as a plan-level change
(and an ADR under `docs/adr/NNNN-<slug>.md` per PRD §45.5 / plan §2.1 A9 if the resolution is
durable). **Never** resolve it by deleting, skipping or narrowing the frozen-path assertion so the
suite goes green — 233 tickets rely on this file being right, not quiet.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-08 | Initial ticket. Repairs `tools/tests/frozen-paths.test.mjs`, which encoded `FND-01`'s file-scope as a repository-wide invariant: `.github/workflows/**` (allocated to `00-foundation` by breakdown plan §4) was listed as frozen, and the non-vacuity test asserted the branch diff contained `package.json` and `README.md` (`FND-01`'s own files). Reproduced independently by the `FND-02`, `FND-03` and `LNCH-01` builders; the last `/start-all` run delivered 1 of 235 tickets. |
