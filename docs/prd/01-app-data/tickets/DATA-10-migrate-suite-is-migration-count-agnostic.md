---
id: DATA-10
title: The migrate suite asserts framework properties, not the repository's migration count
module: 01-app-data
lane: 01-app-data
size: M
agent: builder
status: draft
date: 2026-08-19
blocked_by: []
blocks: [DATA-04, DATA-05, DATA-06, DATA-07]
---

# DATA-10 — The migrate suite asserts framework properties, not the repository's migration count

Repairs `DATA-01`'s own test area, `packages/database/test/migrate/**`, which **pins the
repository's content**: it asserts the exact set of migration filenames the repository happens to
contain, and the exact (empty) set of schema modules it happens to contain. Any ticket that
legitimately adds either turns the suite red without touching a line of it. No PRD decision changes
here — PRD §20.4, §35.1 and §44.3 and plan §2.1 **A5** stay exactly as `DATA-01` implemented them,
and `packages/database/src/migrate/**` is **not** touched: the framework is correct, only its tests
over-specify. Same defect class as `FND-11`, `FND-12`, `FND-19`, `FND-25` and `FND-29`: **a guard
whose mechanism is wrong for the thing it guards, repaired at the guard rather than by weakening the
work it guards.**
Parent sub-PRD: [01-app-data README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: nothing. **This ticket is a root** — the migration framework and its tests both already
exist on `main`, and nothing in this repair needs a table, a repository or a migration that has not
landed.
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed
contract (`DATA-01`'s existing deliverables 1–11 and their acceptance items) — no new subsystem and
no new decision. The one judgement call, whether a given assertion can be recomputed or needs a
synthetic fixture, is decided per assertion by the rule in deliverable 4.

## Background + basis

### The reported failure — settled, do not re-diagnose

On `ticket/DATA-04` @ `6350421`, **17 tests are red, all inside
`packages/database/test/migrate/**`, and none inside `packages/database/test/tenancy/**`.** That
branch adds exactly what `DATA-04`'s File-scope authorises — a
`packages/database/migrations/<UTC>_tenancy.sql` (delivered as `20260818093522_tenancy.sql`) and a
`packages/database/src/schema/tenancy.ts` — and `git diff --name-only main ticket/DATA-04` contains
**no path under `test/migrate/`** at all. The suite was broken by the *existence* of correct work,
not by any edit to it. Representative failure:

```
AssertionError: expected [ '0001_baseline.sql', ...(3) ] to deeply equal [ '0001_baseline.sql', ...(2) ]
- Expected  + Received
  [ "0001_baseline.sql", "20260803120000_alpha.sql", "20260803130000_beta.sql", + "20260818093522_tenancy.sql" ]
  at test/migrate/runner.test.ts:388:30
```

The affected files are `runner.test.ts`, `manifest.test.ts`, `conventions-lint.test.ts`,
`concurrency.test.ts`, `cli.test.ts` and the shared harness `helpers.ts`. This is the reproduction:
the ticket is verified **against that branch state**, not against a hypothetical extra migration
only (acceptance item 1).

### The mechanism — two axes, and both are in scope

The failures have one cause with two expressions. Both live inside this ticket's file-scope, and a
repair that fixes only the first leaves the second queued to fire again:

**Axis 1 — the migration corpus.** Two routes, one of them indirect and easy to miss:

- *Direct.* Tests that pass `REPO_MIGRATIONS_DIR` assert the repository's list literally:
  `runner.test.ts:61-62` (`report.applied` equals `['0001_baseline.sql']`, `report.head` is
  `'0001_baseline.sql'`), `:68-70,73` (the ledger has one row, with that name and that checksum),
  `:101-102` (an idempotent re-run leaves head and a one-row ledger), `:361` (`report.applied` has
  length 1).
- *Indirect, through the harness.* `helpers.ts:83-84` does
  `cpSync(REPO_MIGRATIONS_DIR, migrationsDir, { recursive: true })` — it copies the **whole real
  directory**, not the baseline, into every fixture temp directory. So each fixture corpus silently
  grows with the repository, and tests that never mention `REPO_MIGRATIONS_DIR` go red anyway:
  `runner.test.ts:388-392` (the pending list — the failure quoted above), `cli.test.ts:23-26`
  (`pending:  3` / `applied:  3`), `concurrency.test.ts:68-72` and `:109` (`ledgerNames` of length
  4). The helper's own `withBaseline` option documents the *intent* — *"The fixtures deliberately do
  NOT carry their own copy of the baseline: a copy would drift"* — and that intent is **the
  baseline**, singular. Copying the directory is the bug; the option's name is already the
  specification of the fix.

**Axis 2 — the schema-module corpus.** `manifest.test.ts:56-58`
(`expect(discoverTableManifests()).toEqual([])`) and `conventions-lint.test.ts:76-79` (the same
assertion, under the comment *"Vacuous by construction — `src/schema/` does not exist until DATA-04
lands"*) pin the repository to containing **zero** schema modules. `DATA-04` adds the first, and
`DATA-05`–`DATA-07` each add another (sub-PRD **D4**: `discoverTableManifests` globs
`src/schema/*.ts` and each group ticket adds exactly one file to that glob). Those two assertions
were written knowing they were temporary; nothing was ever put in place to retire them.

Naming only Axis 1 would be a half-repair, and this ticket's title must be read as shorthand for
**any count of things the repository happens to contain**.

### Why this is a repair ticket in `01-app-data`, not a widened file-scope on a dependant

**Ownership is unambiguous, and was verified in the files on 2026-08-19.** `DATA-01`'s File-scope
(write-owns) lists:

> - `packages/database/test/migrate/**` (this ticket's own test area, sub-PRD D8)

`DATA-04`'s write-owns contains no path under `packages/database/test/**` other than its own
`test/tenancy/**`, and its "Does not touch" line opens with *"`src/migrate/**` and
`migrations/0001_*` (`DATA-01`)"*. Sub-PRD **D8** states the rule generally: *"Unit/integration tests
live under the owning ticket's own area … **No ticket writes into another ticket's test
directory.**"* So a `DATA-04` (or `DATA-05`/`06`/`07`) repair of `test/migrate/**` would be an
undeclared file-scope violation — and a *declared* widening would still be the wrong shape, for the
next reason.

**Because it will recur, by construction.** Verified on 2026-08-19 by reading each ticket's
File-scope (write-owns) section:

| Ticket | Migration it owns | Schema module it owns | Verified at |
|---|---|---|---|
| `DATA-04` | `packages/database/migrations/<UTC YYYYMMDDHHMMSS>_tenancy.sql` | `src/schema/tenancy.ts` | `DATA-04-…tenancy…md:130-131` |
| `DATA-05` | `packages/database/migrations/<UTC YYYYMMDDHHMMSS>_execution.sql` | `src/schema/execution.ts` | `DATA-05-…execution…md:135-136` |
| `DATA-06` | `packages/database/migrations/<UTC YYYYMMDDHHMMSS>_research.sql` | `src/schema/research.ts` | `DATA-06-…research…md:127-128` |
| `DATA-07` | `packages/database/migrations/<UTC YYYYMMDDHHMMSS>_operations.sql` | `src/schema/operations.ts` | `DATA-07-…operations…md:139-140` |

`DATA-04`'s own Serial-safety paragraph says it plainly — the group tickets *"can author
independently"* because *"filenames are timestamp-prefixed and expand-only"*, each owning **a
different group-suffixed migration file**. That is four tickets, of which one has hit the break and
three have not run yet. Fixing it once, in the owning ticket's area, costs one ticket; fixing it as
a cross-scope exception on each dependant costs four exceptions and leaves the suite still pinned
for the fifth.

### The precedent already in this package

This is not a new idea being introduced here — the same package already contains the rule, written
down, in `packages/database/test/ephemeral/file-scope.test.ts` (`DATA-08`'s):

> Asserted as substring/set rules so sibling DATA tickets can keep adding their own migrations
> without turning this test red.

and `packages/database/test/tenant/helpers.ts` migrates the real directory to head without asserting
anything about its size. `DATA-01`'s suite is the outlier, not the standard. The Builder should read
both before designing, and should prefer their idiom over inventing a third.

### Accepted caveats, carried forward

- **`helpers.ts` has a consumer outside this suite.**
  `packages/database/test/ephemeral/file-scope.test.ts:6` imports `PACKAGE_ROOT` and
  `REPO_MIGRATIONS_DIR` from `../migrate/helpers.js`. Those two exports must keep their names and
  their meanings; `test/ephemeral/**` is `DATA-08`'s area and must not be edited by this ticket, so
  a rename there is a cross-area break, not a refactor. `withTempMigrations` and
  `TempMigrationsOptions` have **no** consumer outside `test/migrate/**` (verified by search on
  2026-08-19) and may change shape freely.
- **The module README is not updated by this ticket.** The README already carries `DATA-10` — its
  `v0.5 — 2026-08-19` entry states **10 tickets** in all three places the count appears, adds the
  work-breakdown row, and places `DATA-10` in wave 1 — but that is a separate file, changed by the
  Architect in the same docs branch as this ticket, not work this ticket's Builder does.
  `docs/prd/**` is the Architect's and is changed by a docs PR, never by the Builder — recorded as
  **Q-D10-A**, resolved 2026-08-19.
- **`main` is green today.** The suite passes on `main` and is still wrong. Any argument of the form
  *"the tests pass, so they are fine"* is answered by acceptance item 4, not by a re-run.

## Goal

Make `packages/database/test/migrate/**` assert the **framework's properties** — ordering,
idempotence, checksum/tamper detection, expand/contract sequencing, ledger rows, out-of-order
arrival, the recovery-point contract, and the `db:migrate` / `db:status` / `db:new` output shape —
**without encoding how many migrations or schema modules the repository happens to contain**. After
this ticket, a new migration or a new `src/schema/*.ts` added by any ticket, in this module or a
later phase, leaves the migrate suite green, and every property the suite proves today it still
proves at the same strength. Completion is mechanically checkable: the suite is green with a
synthetic extra migration present in the real `migrations/` directory, **and** red when a real
property is deliberately broken.

## Non-goals

- **No production code.** `packages/database/src/migrate/**` is untouched. The framework's behaviour
  is correct and is not the defect; if the Builder comes to believe it is, that is a stop-and-report
  (Feedback obligation item 3), not an edit.
- **No migration is added, edited, renamed, deleted or reordered** — including `0001_baseline.sql`.
  The positive control's synthetic migration is a temporary working-tree file that is removed, with
  `git status --porcelain` shown clean afterwards.
- **No change to `packages/database/package.json`** — not the `db:*` scripts, not the exports map,
  not a dependency. `test/ephemeral/file-scope.test.ts` asserts that manifest's exports and
  dependency sets exactly, and it is `DATA-08`'s.
- **This is not a weakening.** Explicitly rejected outcomes, any one of which fails the ticket
  regardless of how green the suite is: deleting an `it(`; `.skip` / `.todo` / `it.only` / `retry` /
  any flake annotation; replacing an ordered `toEqual([...])` with a length check, a `toContain`, an
  `arrayContaining`, a `toBeGreaterThan` or an unordered set comparison **where order is the
  property under test**; asserting a suffix or subset of the ledger where the whole ordered ledger
  was asserted; or removing an assertion because *"the value is now computed anyway"*.
- **No repair of other suites that pin repository content.** If the Builder finds one while reading,
  it is reported as a finding for the Architect (Feedback obligation item 4), not fixed here. None
  is known today: `test/ephemeral/file-scope.test.ts` and `test/tenant/**` were both checked on
  2026-08-19 and are already count-agnostic.
- **No test-runner, timeout or parallelism change.** `tools/vitest.config.mjs` is `00-foundation`'s
  (`FND-26`).
- **Not a re-litigation of `DATA-04`.** `DATA-04`'s implementation is not reviewed, re-run or
  modified here beyond using its branch as the reproduction.

## File-scope (write-owns)

Owned by this ticket — **one directory, and nothing else**:

- `packages/database/test/migrate/**` — the five affected test files, the shared harness
  `helpers.ts`, and `test/migrate/fixtures/**` (new synthetic fixture corpora are added here, per
  deliverable 4).

Does not touch:

- `packages/database/src/**`, and `src/migrate/**` in particular (`DATA-01`) — the framework is
  correct; this ticket changes only what its tests assert.
- `packages/database/migrations/**` (`DATA-01`'s `0001_*`; `DATA-04`–`DATA-07`'s group files) — no
  file created, edited or deleted, temporary controls excepted and restored.
- `packages/database/package.json`, `packages/database/tsconfig.json` — module-owned append-only
  (sub-PRD **D9**); this ticket appends nothing.
- `packages/database/test/**` other than `migrate/**` — `test/tenancy/**` (`DATA-04`),
  `test/tenant/**` (`DATA-02`, plus `FND-29`/`FND-30` this CI phase), `test/crypto/**` (`DATA-03`),
  `test/ephemeral/**` (`DATA-08`), `test/architecture/**` (`DATA-02`).
- `packages/jobs/**` (`DATA-05`) · `apps/**` · `tests/**` (`23-assurance`) · `tools/**`, root
  manifests and lockfiles, `.github/workflows/**` (`00-foundation`) · `infra/**` · `docs/PRD.md`,
  `docs/prd/**`, `docs/adr/**`, `CLAUDE.md`, `.claude/**` — frozen, the Architect's, or another
  module's.

**No cross-module declaration is needed.** Unlike `FND-25`, `FND-28` and `FND-29` — `00-foundation`
tickets that had to declare an edit inside `packages/database/**` — this is a `01-app-data` ticket
writing `01-app-data`'s own tree, in the exact directory sub-PRD **D8** allocates to this module.
The only thing worth stating is *whose* area it is within the module: `DATA-01`'s, and `DATA-01` is
delivered, so the repair comes as a new ticket rather than a re-run of `DATA-01` — the route
`DATA-09`'s Feedback obligation already prescribes for exactly this situation (*"because those
tickets may already be delivered — take it as a new ticket in `01-app-data`"*).

**Serial-safety analysis.** `packages/database/test/migrate/**` is declared in **no** other ticket's
write-owns under `docs/prd/**` — verified by search on 2026-08-19; every sibling names it in a "Does
not touch" list. The one ticket in flight, `DATA-04`, touches nothing under it
(`git diff --name-only main ticket/DATA-04` has no match for `test/migrate`), so this ticket and
`DATA-04`'s branch can be built concurrently and merged in either order. The `blocked_by` edge added
to `DATA-04` exists so that `DATA-04` **merges second** and lands green, not because the two
implementations contend for a file.

## Deliverables

1. **The fixture corpora become closed sets.** `withTempMigrations` must compose a corpus fully
   determined by the fixture name and the harness, not by whatever `migrations/` currently contains:
   copy the **baseline file by name** (`0001_baseline.sql`, still from the real directory, so the
   suite keeps migrating the ledger the product actually ships — that is why the option exists) plus
   the named fixture directory, and nothing else. `helpers.ts:83-84`'s whole-directory `cpSync` is
   the single line that makes the majority of the seventeen failures possible. If the harness gains
   a way to request extra real migrations, it must be **explicit and named**, never "everything
   present".

2. **Repository-facing assertions are computed, not transcribed.** For the tests that genuinely must
   run against `REPO_MIGRATIONS_DIR` — the ledger/checksum/idempotence tests at
   `runner.test.ts:55-105` and `:350-362`, and `conventions-lint.test.ts`'s `atHead` helper — derive
   the expectation from the directory listing at run time (the sorted, policy-filtered set of
   migration filenames) and assert the framework agrees with it: the applied set **equals** the
   directory set, in **directory order**; head **equals** the last entry; the ledger has **one row
   per file**, each with the checksum of that file's bytes; a second run applies **nothing** and
   changes neither. These are strictly stronger than today's transcriptions — they hold for one
   migration and for fifty — and they must be written so that they can still fail (item 6).

3. **The schema-module assertions stop pinning "zero".** `manifest.test.ts:56-58` and
   `conventions-lint.test.ts:76-79` must assert what is actually true and permanent — that
   `DEFAULT_SCHEMA_DIR` resolves to `packages/database/src/schema`, that `discoverTableManifests()`
   returns one manifest per `*.ts` file present there (and returns empty, without throwing, when the
   directory is absent), and that `assertSchemaConventions` passes at head against **whatever
   manifests are actually discovered** — rather than that the repository contains none. The comment
   *"Vacuous by construction"* goes when the vacuity goes; the fixture-driven negative cases below
   those assertions are what keep the criterion able to go red, and they stay untouched.

4. **A synthetic fixture wherever a fixed corpus is genuinely required.** Preferred technique, in
   order: (a) recompute the expectation from the directory (deliverable 2); (b) if a test needs an
   exact, stable corpus — the ordered pending list, the `db:status` counts, the concurrency ledger,
   the out-of-order-arrival case — give it **its own synthetic migration files under a temp
   directory**, never the repository's real `migrations/`. **`withTempMigrations` already exists for
   exactly that** and, once deliverable 1 lands, yields a closed corpus by construction, so most of
   these tests need only their fixture extended rather than their assertion changed. What is **not**
   acceptable is (c): keeping the real directory and loosening the assertion to fit it.

5. **An enumeration of properties to tests, so nothing is dropped in the edit.** A table — in the PR
   body, and as a comment block at the top of `runner.test.ts` if the Builder prefers it durable —
   with one row per property the suite proves today (ordering; idempotence; checksum/tamper
   detection; a missing already-applied migration; out-of-order arrival; duplicate timestamp
   prefixes; a bad filename; expand/contract sequencing and deferral; destructive-statement
   rejection; the recovery-point contract; ledger contents; `db:migrate` / `db:status` / `db:new`
   output shape; concurrent runners), naming the test that proves it **before** and **after**. Every
   row must have an "after". A row whose "after" is empty is a deleted property and fails the ticket.

6. **Positive controls, both halves, with real output.** (i) With a synthetic extra migration file
   placed in the repository's **real** `packages/database/migrations/` directory, the whole migrate
   suite still passes. (ii) With a real property deliberately broken — for example a migration
   applied out of order, or a checksum altered on an already-applied file — the suite still
   **fails**, and fails with the assertion that names the broken property rather than with an
   incidental error. Both demonstrated with pasted runner output; the tree restored afterwards and
   `git status --porcelain` shown **clean**.

7. **The comments say what changed and why.** `helpers.ts`'s `TempMigrationsOptions` doc comment
   currently describes behaviour the code does not have; it must describe the behaviour the code
   *will* have, and say in one line why copying the whole directory was wrong. Each edited test file
   gets a short note naming `DATA-10` and stating the rule: *this suite asserts the framework's
   properties, not the repository's inventory.* The next person to add a migration should be able to
   read why nothing broke.

## Acceptance checklist (classified)

**Before any run**, confirm `node -v` prints `v24.18.0` (CLAUDE.md). A red suite under Node 22.11.0
is an environment fault, not a regression — its signature is `node:internal/modules/esm/get_format`,
concentrated in child-process tests, and it is neither this defect nor `DATA-04`'s.

- [ ] `[machine]` **The defect is reproduced before it is fixed.** The PR records the 17 failures
      across `runner.test.ts`, `manifest.test.ts`, `conventions-lint.test.ts`, `concurrency.test.ts`
      and `cli.test.ts` observed with `ticket/DATA-04` @ `6350421`'s migration and schema module
      present, including the `runner.test.ts:388` assertion quoted in Background, **and** records
      that `test/tenancy/**` is green in the same run. A repair whose starting evidence is only a
      hand-made extra file has not been verified against the real reproduction.
- [ ] `[machine]` **The same reproduction is green after.** With `ticket/DATA-04` @ `6350421`'s
      `20260818093522_tenancy.sql` **and** `src/schema/tenancy.ts` present in the working tree, the
      full migrate suite passes; the PR states how that branch state was reproduced and shows the
      tree restored, `git status --porcelain` clean.
- [ ] `[machine]` **Positive control A — an added migration does not break the suite.** A synthetic
      migration placed in the real `packages/database/migrations/` leaves the whole migrate suite
      green; runner output pasted; tree restored and `git status --porcelain` clean (deliverable 6i).
- [ ] `[machine]` **Positive control B — the suite still bites.** With a real property deliberately
      broken (a migration applied out of order, or an already-applied migration's checksum altered),
      the suite **fails**, with the assertion that names that property; runner output pasted for each
      control; tree restored and `git status --porcelain` clean (deliverable 6ii). **This item, not
      any green run, is what carries the claim.** State plainly in the PR why: the suite is green on
      `main` today and is still wrong, so a green run proves nothing about whether the properties
      survived the edit.
- [ ] `[machine]` **No property was dropped.** The deliverable-5 table is in the PR with an "after"
      test named for **every** row, and `git diff main...HEAD` contains no deleted `it(`, no `.skip`,
      `.todo`, `it.only` or `retry`, and no assertion loosened from an ordered equality to a length,
      subset, `toContain` or unordered comparison where order is the property (Non-goals). State this
      explicitly; the Reviewer re-checks it by reading the diff.
- [ ] `[machine]` **Both axes are repaired.** No assertion anywhere under `test/migrate/**` names a
      real migration filename other than `0001_baseline.sql`; none asserts that
      `discoverTableManifests()` over the real `src/schema` is empty; and `helpers.ts` no longer
      copies the whole `REPO_MIGRATIONS_DIR`. Demonstrated by grep output in the PR.
- [ ] `[machine]` **The `db:*` CLI output shape is still asserted at full strength.** `db:migrate`'s
      per-file `+ <name> [expand|contract]` lines and its `applied:  none (already up to date)`,
      `db:status`'s `head:` / `applied:` / `pending:` lines, and `db:new <group>`'s filename policy
      are each still proven — against a synthetic corpus (deliverable 4b) rather than the
      repository's (`DATA-01` deliverable 11).
- [ ] `[machine]` **The harness contract outside this suite is intact.** `PACKAGE_ROOT` and
      `REPO_MIGRATIONS_DIR` are still exported from `test/migrate/helpers.ts` with the same meanings,
      and `packages/database/test/ephemeral/file-scope.test.ts` is **unmodified** and green
      (Accepted caveats).
- [ ] `[machine]` **The diff is contained.** `git diff --name-only main...HEAD` lists only paths
      under `packages/database/test/migrate/`. In particular `packages/database/src/**`,
      `packages/database/migrations/**` and `packages/database/package.json` are unchanged
      (File-scope; Non-goals).
- [ ] `[machine]` **Full suite green — the standing item** (PRD §20.3, §45.3). `pnpm test` exits 0
      with the pass count stated, and `pnpm --filter @taxrag/database test` exits 0 with its own pass
      count stated; `pnpm typecheck` green; `pnpm lint`'s result reported and compared against the
      known pre-existing set, so this ticket is neither blocked by it nor credited with it.
- [ ] `[machine]` **PRD §44.2 `E04` exit evidence is unweakened.** The PR states, from the
      deliverable-5 table, that the "migration tests" third of `E04-APPDB`'s
      *"Migration/invariant/isolation tests"* proves the same set of properties after this ticket as
      before it.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**none** — a test-harness
      repair under PRD §20.3/§45.3 guarding PRD §20.4/§35.1/§44.3; unblocks `DATA-04`–`DATA-07`),
      user-visible change (**none** — test code), schema/API/event compatibility (**none**),
      tenant/PII/security impact (**none**; state that no production migration or tenant path was
      touched), source/licence impact (**none**), cost impact (**none** beyond suite runtime — state
      it), rollback path (revert the commit, which restores the pinning and re-breaks the suite for
      `DATA-05`–`DATA-07`, so the rollback note must say so), known gaps (the two Accepted caveats only;
      **Q-D10-A** is closed — resolved 2026-08-19 by the module README's `v0.5` entry).
- [ ] No `[fixture]` criteria — nothing here is a PRD §40.8 adapter fixture or a §14/§43 evaluation
      replay; "fixture" in this ticket means a synthetic migration corpus.
- [ ] No `[human]` criteria — a test-only change with a wholly mechanical acceptance surface; no
      PRD §41.2 `UAT-*` script applies.
- [ ] No Rust or Python is touched (PRD §45.3).

## Test plan

Reviewer steps. All offline; no network, no corpus database, no provider. **Step 0 in every shell:**
confirm `node -v` prints `v24.18.0`. Harness: Vitest, via `pnpm --filter @taxrag/database test` for
the package and `pnpm test` for the workspace.

1. **Read the diff for a weakened test first, before anything else.** Walk the deliverable-5 table
   against the diff and confirm each "after" test exists and asserts the same property at the same
   strength. Any deleted `it(`, any relaxed equality, any `.skip`/`.todo`/`retry` is a **BOUNCE**,
   not a style comment — including one that makes the suite green.
2. **Re-run both positive controls yourself**, restoring the tree after each. Control A: drop a
   synthetic `<UTC>_zzz.sql` into the real `packages/database/migrations/` and run the migrate suite
   — it must be green. Control B: break a real property and confirm the suite fails **with the
   assertion that names it**. A suite that stays green under control B guards nothing, and that is
   the outcome this repair is most at risk of producing.
3. **Reproduce the original break and its repair.** Apply `ticket/DATA-04` @ `6350421`'s
   `20260818093522_tenancy.sql` and `src/schema/tenancy.ts` to the working tree over the ticket
   branch, run the migrate suite green, then restore. Confirm `git status --porcelain` clean.
4. **Grep for residual pins.** No real migration filename other than `0001_baseline.sql` anywhere
   under `test/migrate/**`; no `discoverTableManifests()`-is-empty assertion over the real
   `src/schema`; no whole-directory `cpSync` of `REPO_MIGRATIONS_DIR` in `helpers.ts`.
5. **Check the boundary.** `git diff --name-only main...HEAD` is entirely under
   `packages/database/test/migrate/`. If `packages/database/src/**` or `migrations/**` appears, that
   is a file-scope violation regardless of the code's quality.
6. **Confirm the cross-area consumer still works.**
   `packages/database/test/ephemeral/file-scope.test.ts` is unmodified in the diff and green in the
   run.
7. **Suite and gates.** `pnpm test` and `pnpm typecheck` green on the branch; `pnpm test` re-run on
   the default branch after the merge.

## Open questions

| ID | Question | Status | Decides |
|---|---|---|---|
| **Q-D10-A** | `docs/prd/01-app-data/README.md` describes the module as *"9 tickets"* and its work-breakdown table has no `DATA-10` row. Does the README gain the row (and the count become 10) now, or at the next module-level docs pass? | **RESOLVED 2026-08-19** — the README gains it **now**, in this same docs branch: `docs/prd/01-app-data/README.md` `v0.5 — 2026-08-19` states **10 tickets** in all three places the count appears, adds the `DATA-10` work-breakdown row, and places `DATA-10` in **wave 1** (`blocked_by: []`, blocking `DATA-04`–`DATA-07`; peak lane width unchanged at two). Bookkeeping only — no scope, decision or acceptance change, and nothing in this ticket depended on it. `docs/prd/**` remains the Architect's: the Builder still must not edit it. | **The Architect**, as a docs PR followed by `publish-tickets.mjs --sync`. |
| **Q-D10-B** | Should the suite gain a *positively stated* repository-corpus property — every file in the real `migrations/` satisfies the naming policy, sorts uniquely by timestamp prefix, and contains no destructive statement — as a count-agnostic replacement for what the pinned lists were incidentally providing? | **OPEN — does not block, and is not required by acceptance.** It is strictly additive and cannot re-introduce the defect, so the Builder may include it; if included, it appears as a new row in the deliverable-5 table with an empty "before". | **The Builder**, reported in the PR; the Architect if it turns out to need an `src/migrate/**` export that does not exist. |

## Feedback obligation

**General rule.** If implementation falsifies anything here, update **this ticket** first — version
+0.1 with a changelog line — then change code, then re-publish the issue
(`publish-tickets.mjs --sync`). Never patch spec into a plan, into code, or by hand-editing the
issue (CLAUDE.md, issue #53).

1. **A property genuinely cannot be expressed without a fixed corpus, and `withTempMigrations` will
   not serve.** → That is a fixture-design problem, not a licence to loosen. Extend
   `test/migrate/fixtures/**` (owned here) with a new synthetic corpus and say in the PR why the
   existing ones did not fit. Do **not** keep the assertion against the real directory and relax it.
2. **The repair appears to require an `src/migrate/**` change** — for example the runner exposes no
   way to enumerate the policy-filtered file list, so a test cannot compute the expectation. →
   **Stop and report.** `src/migrate/**` is `DATA-01`'s and is outside this file-scope. Raise it with
   the **Architect** with the measurement attached: either this ticket gains the export by a +0.1
   file-scope amendment, or a separate ticket owns it. Do not widen quietly, and do not fall back to
   a loosened assertion while waiting.
3. **The framework turns out to be genuinely wrong** — the runner mis-orders, mis-checksums, or
   silently tolerates an out-of-order migration, and the pinned tests were hiding it. → That is a
   correctness defect in `DATA-01`'s delivered framework and a **release-blocking** finding, not a
   test edit. Stop, escalate to the human, and raise it with the **Architect** with the
   reproduction. Never make the test agree with the wrong behaviour.
4. **Another suite is found to pin repository content.** → Record the file, the assertion and how it
   will break, and raise it with the **Architect** as a separate ticket for its owning module. Do
   not absorb it (Non-goals). `test/ephemeral/file-scope.test.ts` and `test/tenant/**` were checked
   on 2026-08-19 and are already count-agnostic, so a new finding is genuinely new.
5. **`DATA-04`'s branch cannot be reproduced** (rebased away, `6350421` unreachable). → Report it and
   proceed with the two positive controls, which do not depend on that branch — but say so
   explicitly in the PR rather than letting acceptance items 1–2 read as satisfied.

**Escalation.** If it proves impossible to make the suite corpus-agnostic **without** dropping a
property, then what needs deciding is how this repository tests its migration framework at all — not
this ticket. Stop, escalate to the human, and raise it with the **Architect**. **Never** resolve it
by deleting a test, skipping it, or loosening an assertion: PRD §44.3 makes migration ordering and
checksum integrity a data-safety guarantee, and a suite that no longer distinguishes a correct
ordering from a broken one discharges nothing — while being, unlike today's suite, permanently green.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-19 | Initial ticket. Repairs `DATA-01`'s migrate suite, which pins the repository's content and therefore turns **17 tests red** — all in `packages/database/test/migrate/**`, none in `test/tenancy/**` — when `DATA-04` adds the migration and schema module its own File-scope authorises (`ticket/DATA-04` @ `6350421`; `git diff --name-only main ticket/DATA-04` contains no `test/migrate` path, so the suite was broken by the existence of correct work, not by an edit to it). Records the mechanism so it is not re-derived, on **two axes**: (1) the migration corpus — directly at `runner.test.ts:61-62,68-70,73,101-102,361`, and indirectly through `helpers.ts:83-84`, where `withTempMigrations` `cpSync`s the **whole** real `migrations/` directory into every fixture temp dir, so fixture-only tests (`runner.test.ts:388-392`, `cli.test.ts:23-26`, `concurrency.test.ts:68-72,109`) grow red with the repository even though they never name it; and (2) the schema-module corpus — `manifest.test.ts:56-58` and `conventions-lint.test.ts:76-79` assert `discoverTableManifests()` is empty, which `DATA-04`–`DATA-07` each falsify by adding one `src/schema/*.ts`. Establishes ownership from the files rather than by assertion: `DATA-01`'s File-scope names `packages/database/test/migrate/**` as *"this ticket's own test area, sub-PRD D8"*, `DATA-04`'s write-owns does not include it, and **D8** forbids a ticket writing into another ticket's test directory — so the repair is a new ticket in `01-app-data`, the route `DATA-09`'s Feedback obligation already prescribes for a delivered sibling. Justifies a repair over four cross-scope exceptions by verifying in each ticket's File-scope that `DATA-04`/`05`/`06`/`07` own `*_tenancy.sql` / `*_execution.sql` / `*_research.sql` / `*_operations.sql` and one schema module each — i.e. the same break is queued three more times. Cites the precedent already in this package — `test/ephemeral/file-scope.test.ts`'s *"Asserted as substring/set rules so sibling DATA tickets can keep adding their own migrations without turning this test red"* — so the idiom is adopted, not invented. States the hard limit prominently: **this must not weaken what the suite proves**; recomputing a pinned list is legitimate, deleting an assertion, loosening an ordered equality to a length/subset/unordered check, or `.skip`/`.todo`/`retry` is not, and a synthetic fixture corpus under a temp directory (for which `withTempMigrations` already exists) is the preferred technique wherever a fixed corpus is genuinely needed. Acceptance carries a **positive control in both halves** — green with a synthetic extra migration in the real `migrations/`, and still **red** when a real property is broken — with real output and `git status --porcelain` clean afterwards, and says plainly that a green run proves nothing here because the suite is green today and still wrong. Records what this does **not** fix: `src/migrate/**` is untouched (the framework is correct), and any other suite that pins repository content is out of scope and reported to the Architect instead — none is known, `test/ephemeral/file-scope.test.ts` and `test/tenant/**` having been checked on 2026-08-19. Carries `blocked_by: []` (a root — framework and tests both already exist on `main`) and `blocks: [DATA-04, DATA-05, DATA-06, DATA-07]`; only `DATA-04` gains the reciprocal `blocked_by` edge, because `DATA-05`–`DATA-07` are already `blocked_by` `DATA-04` transitively and `dag-core.mjs` schedules on `blocked_by` alone. |
