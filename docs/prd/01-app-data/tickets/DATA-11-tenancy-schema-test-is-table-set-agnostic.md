---
id: DATA-11
title: The tenancy schema test asserts DATA-04's eight tables, not the whole database's table set
module: 01-app-data
lane: 01-app-data
size: M
agent: builder
status: draft
date: 2026-08-19
blocked_by: []
blocks: [DATA-05, DATA-06, DATA-07]
---

# DATA-11 — The tenancy schema test asserts `DATA-04`'s eight tables, not the whole database's table set

Repairs `DATA-04`'s own test area, `packages/database/test/tenancy/**`, which **pins the database's
content**: `test/tenancy/schema.test.ts` reads the whole of `sqlite_master` after migrating to head
and asserts it equals the eight PRD §35.4 tenancy tables. That encodes *"this database contains
exactly these eight tables"* — a claim no ticket downstream of `DATA-04` can keep true, because every
later table-group ticket adds its own tables to the same `app.sqlite` by design (sub-PRD **D2**,
**D4**). Any such ticket turns the suite red without touching a line of it. No PRD decision changes
here — PRD §35.1 and §35.4 stay exactly as `DATA-04` implemented them, and
`packages/database/src/schema/tenancy.ts`, `src/repos/tenancy/**` and `migrations/*_tenancy.sql` are
**not** touched: the schema is correct, only one assertion over-specifies. Same defect class as
`DATA-10`, and as `FND-11`, `FND-12`, `FND-19`, `FND-25` and `FND-29`: **a guard whose mechanism is
wrong for the thing it guards, repaired at the guard rather than by weakening the work it guards.**
Parent sub-PRD: [01-app-data README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: nothing. **This ticket is a root** — the tenancy schema, its migration and this test all
already exist on `main`, and nothing in this repair needs a table, a repository or a migration that
has not landed.
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(`DATA-04`'s existing acceptance items 1–3 and PRD §35.4's column table) — no new subsystem and no
new decision. The one judgement call, whether the "and nothing else" half can be preserved in a
scoped form or must simply be dropped, is bounded by deliverable 2 and open question **Q-D11-A**.

## Background + basis

### The reported failure — settled, do not re-diagnose

`ticket/DATA-05` @ `8143e8d` adds exactly what `DATA-05`'s File-scope authorises — one
`packages/database/migrations/<UTC>_execution.sql` (delivered as `20260819030229_execution.sql`)
creating the six PRD §35.6 execution tables, one `packages/database/src/schema/execution.ts`, its
repositories, its own `test/execution/**` area and `packages/jobs/**`. `git diff --name-only
main...ticket/DATA-05` lists **34 files, every one inside that File-scope**, and contains **no path
under `packages/database/test/tenancy/`** at all. One test goes red anyway:

```
FAIL  packages/database test/tenancy/schema.test.ts
  > DATA-04 schema (PRD 35.4) > creates exactly the eight PRD 35.4 tables and nothing else
  + "job", "job_event", "model_execution", "outbox_event",
  + "retrieval_candidate", "retrieval_run"
  test/tenancy/schema.test.ts:98   expect(tables).toEqual(PRD_TABLES);
```

The suite was broken by the *existence* of correct work, not by any edit to it. This is the
reproduction: the ticket is verified **against that branch state** (acceptance items 1–2), not
against a hypothetical extra table only.

### The mechanism — one assertion, and it is a single line

`packages/database/test/tenancy/schema.test.ts:89-100`:

```ts
it('creates exactly the eight PRD §35.4 tables and nothing else', async () => {
  await withTenancyDatabase(({ db }) => {
    const tables = db.sqlite
      .prepare<[], { name: string }>(
        "select name from sqlite_master where type = 'table' order by name",
      )
      .all()
      .map((row) => row.name)
      .filter((name) => name !== 'schema_migration' && !name.startsWith('sqlite_'));
    expect(tables).toEqual(PRD_TABLES);       // <- line 98
  });
});
```

`withTenancyDatabase` (`test/tenancy/helpers.ts:59-75`) migrates a fresh temp database to head with
`runMigrations({ migrationsDir: REPO_MIGRATIONS_DIR })` — **the real, shipped `migrations/`
directory**. So `tables` is *the whole application database at head*, while `PRD_TABLES`
(`schema.test.ts:78`) is the eight keys of `PRD_REQUIRED_COLUMNS`, i.e. only what `DATA-04` owns.
Reading the whole database and comparing it to one ticket's slice is the defect; the two sides of
line 98 are not the same universe. Everything else in the file is already scoped to a named table
and is unaffected — the failure count on `ticket/DATA-05` is **one test in this file**, not eight.

### Why this is a repair ticket in `01-app-data`, not a widened file-scope on a dependant

**Ownership is unambiguous, and was verified in the files on 2026-08-19.** `DATA-04`'s File-scope
(write-owns) lists, at `DATA-04-…tenancy…md:132`:

> - `packages/database/test/tenancy/**` (this ticket's own test area, sub-PRD D8)

`DATA-05`'s write-owns (`DATA-05-…execution…md:131-140`) contains no path under
`packages/database/test/**` other than its own `test/execution/**`, and it declares
`migrations/*_tenancy.sql` and `src/repos/tenancy/**` under "Does not touch". Sub-PRD **D8** states
the rule generally: *"Unit/integration tests live under the owning ticket's own area … **No ticket
writes into another ticket's test directory.**"* So a `DATA-05` (or `DATA-06`/`DATA-07`) repair of
`test/tenancy/**` would be an undeclared file-scope violation. `DATA-05`'s Builder recognised the
pattern and correctly refused to touch it. **This exact shape has already been paid for once in this
module**: an earlier `DATA-04` build repaired another ticket's test area on its own branch and
**review round 4 bounced it as a blocker**, taking `DATA-04` to the 2-bounce cap on 2026-08-18
(`DATA-04` changelog `v1.2`; sub-PRD **M-Q11**). Repeating it on `DATA-05` would reproduce that
outcome, and a *declared* widening would still be the wrong shape, for the next reason.

### This is the third instance of one defect class in this module

| # | Guard | What it pinned | Broken by | Repaired by |
|---|---|---|---|---|
| 1 | `DATA-01`'s `test/migrate/**` | the repository's exact migration filename list, and that `src/schema/` holds **zero** manifests | any ticket adding a migration or a schema module — `DATA-04` hit it as 17 red tests | **`DATA-10`** (merged to `main`, PR #313, `b564953`) |
| 2 | `DATA-04`'s `test/tenancy/schema.test.ts:98` | the database's exact table set — "exactly these eight and nothing else" | any ticket adding a table — `DATA-05` hits it as 1 red test | **this ticket** |
| 3 | `DATA-06` / `DATA-07`, queued | — | they add tables to the same database, so they hit instance 2 identically | this ticket, in advance |

**Verified on 2026-08-19 by reading each ticket's File-scope (write-owns) section — not taken on
report.** The question for each is only: *does this ticket add tables to the same `app.sqlite` that
`withTenancyDatabase` migrates to head?*

| Ticket | Migration it owns | Tables it adds | Verified at | Hits line 98? |
|---|---|---|---|---|
| `DATA-05` | `packages/database/migrations/<UTC>_execution.sql` (delivered `20260819030229_execution.sql`) | **6** — `job`, `job_event`, `outbox_event`, `retrieval_run`, `retrieval_candidate`, `model_execution` (six `CREATE TABLE` statements in the delivered file; deliverable 1) | `DATA-05-…execution…md:131-140` (File-scope), `:160-165` (deliverable 1) | **Yes — observed**, the reproduction above |
| `DATA-06` | `packages/database/migrations/<UTC>_research.sql` | **10** — deliverable 1: *"creating the ten tables with `DATA-01`'s §35.1 conventions"* | `DATA-06-…research…md:123-131` (File-scope), `:148-150` (deliverable 1) | **Yes — by construction.** Its write-owns is `test/research/**`; it declares no path under `test/tenancy/**`, so it can neither cause nor repair the break |
| `DATA-07` | `packages/database/migrations/<UTC>_operations.sql` | **11** — deliverable 1: *"creating the eleven tables with `DATA-01`'s §35.1 conventions"* | `DATA-07-…operations…md:135-143` (File-scope), `:160-162` (deliverable 1) | **Yes — by construction.** Its write-owns is `test/operations/**`; same conclusion |

That is three tickets, of which one has hit the break and two have not run yet — and both are in
wave 5, i.e. next. Fixing it once, in the owning ticket's area, costs one ticket; fixing it as a
cross-scope exception on each dependant costs three exceptions, three file-scope violations, and
leaves the suite still pinned for the fourth table group any later phase adds.

### Other places that pin repository or database content — searched, and what was found

Searched on 2026-08-19 across `packages/**` and `apps/**` for `sqlite_master`, and read every
`test/tenancy/**` file for an exhaustive comparison:

- **`packages/database/test/tenancy/migration.test.ts` — already agnostic.** It filters
  `readdirSync(REPO_MIGRATIONS_DIR)` to `name.endsWith('_tenancy.sql')` before asserting
  `toHaveLength(1)` (`:20-31`), and filters `_tenancy.sql` again over the applied set (`:46,50`).
  A sibling group's migration cannot touch it. This is the idiom to copy.
- **`packages/database/test/tenancy/conventions.test.ts` — already agnostic.** `:29-31` calls
  `discoverTableManifests()` and asserts `.map(m => m.group)` **`toContain('tenancy')`**, then that
  `assertSchemaConventions` passes over *whatever was discovered* — it does not assert the manifest
  list equals `['tenancy']`. Its other assertions (`:60`, `:71`) are scoped to `tableManifest` from
  `src/schema/tenancy.ts`, this ticket's own module, and are legitimately exhaustive over it.
- **The rest of `test/tenancy/**`** — `closure.test.ts:162`, `cross-tenant.test.ts:348,353`,
  `invitations.test.ts`, `surface.test.ts:76,114` — every `toEqual` is over a value the tenancy code
  itself produces (an error shape, a constant set, a leak list), not over the database's or
  repository's inventory. **No second instance found in this directory.**
- **`packages/database/test/ephemeral/schema.test.ts:29-39` and `connection.test.ts:10-15` read all
  of `sqlite_master` and assert exactly three tables — and that is correct, not a defect.** That is
  `ephemeral.sqlite`, which sub-PRD **D6** makes a closed database with a single owner
  (`DATA-08`) that bootstraps its own schema outside the app migration sequence. An exhaustive set
  assertion is legitimate when the asserting ticket owns the whole database; the defect here is
  asserting an exhaustive set over a database **eight other tickets add to**. Do not "repair" these.
- **`packages/database/test/migrate/**`** — instance 1, already repaired by `DATA-10`; out of scope
  here and not to be touched (File-scope).
- `src/migrate/conventions-lint.ts:49` and `src/migrate/runner.ts:129,161` also read `sqlite_master`,
  but as production lookups by name/pattern, not as pinned expectations.

### The precedent already in this package

This idiom is not being introduced here. `packages/database/test/ephemeral/file-scope.test.ts`
already writes the rule down:

> Asserted as substring/set rules so sibling DATA tickets can keep adding their own migrations
> without turning this test red.

and `DATA-10` has just applied the same principle to `test/migrate/**` on `main`. The Builder should
read `DATA-10`'s delivered diff and `test/tenancy/migration.test.ts` before designing, and should
prefer their idiom over inventing a third.

### The hard limit — the transcription is the point of the file, and none of it may weaken

The file's own header states why it exists:

> The expectation table below is **transcribed from PRD §35.4 by hand**, in this file. That is the
> point of the test: deriving it from `src/schema/tenancy.ts` would compare the schema module
> against itself and would pass for any schema at all, including one that dropped a column the PRD
> requires.

**Everything `DATA-04` guarantees today about the eight tables must still be asserted at the same
strength after this ticket.** Dropping to a bare "the tables exist" check, deleting an assertion, or
deriving `PRD_REQUIRED_COLUMNS` from the schema module is a **rejected outcome**, however green the
suite is. The properties that must survive, enumerated from the file on 2026-08-19 — the Builder is
repairing against this list, and deliverable 5 requires an "after" for every row:

| # | Property proven today | Where | Must survive as |
|---|---|---|---|
| P1 | **All eight PRD §35.4 tables exist** in a database migrated to head — `organization`, `user`, `membership`, `invitation`, `service_account`, `api_credential`, `sso_connection`, `actor` | `:89-100` | The same eight, each named, still asserted present. **Only the "and nothing else" half is dropped** (deliverable 2) |
| P2 | `PRD_REQUIRED_COLUMNS` is a **hand transcription of PRD §35.4's "Required columns" cell**, with the three additions beyond §35.4 marked and reasoned in comments | `:5-8`, `:14-76` | Unchanged, by hand, in this file. It must not be derived from `src/schema/tenancy.ts`, from the manifest, or from the migration |
| P3 | **Every table has every required column** §35.4 lists, with the failure message naming the table and the column | `:102-113` | Same assertion, same per-column message |
| P4 | `sso_connection.configuration_ciphertext` **exists and is BLOB**, and there is **no plaintext sibling** `configuration` or `configuration_json` | `:115-125` | All four assertions, including both negatives |
| P5 | **`created_at` on all eight** tables (PRD §35.1) | `:127-134` | Same, over the same eight |
| P6 | **`updated_at` + `row_version`** on the five mutable-metadata tables (`organization`, `membership`, `service_account`, `sso_connection`, `user`) | `:135-143` | Same, over the same five |
| P7 | **Every primary key is exactly `['id']`, TEXT, NOT NULL** — an ordered `toEqual`, per table, with the table named in the message | `:147-160` | Ordered equality kept; not relaxed to `toContain` or a length |
| P8 | **`organization_id` present** on the six TENANT-scoped tables *including `organization` itself*, and **absent** on the two GLOBAL ones (`user`, `actor`) | `:162-187` | Both halves — the negative on `user`/`actor` is the one that catches a scope mistake |
| P9 | **The §35.4 uniqueness constraints in the stored DDL**: `UNIQUE (slug)`, `UNIQUE (email_normalized)`, `UNIQUE (organization_id, user_id)`, `UNIQUE (token_hash)`, `UNIQUE (prefix)`, `UNIQUE (organization_id, protocol)`, **plus `UNIQUE (organization_id, id)` on all six tenant-owned tables** | `:189-222` | Every one of the twelve, still read from `sqlite_master.sql` for that named table |
| P10 | **`api_credential` carries an explicit index on `(organization_id, service_account_id)`**, discounting implicit indexes (`index.sql !== null`) | `:224-238` | Same, including the implicit-index filter |
| P11 | The whole file runs against a **real temp file database migrated by the real shipped `migrations/` directory** through `withTenancyDatabase` — never `:memory:`, never a hand-built throwaway schema | `helpers.ts:52-75` | Unchanged. Do not swap in a synthetic corpus to make the counting problem go away — see Non-goals |

`PRD_TABLES` (`:78`) is not only line 98's expectation: it also drives the loops in P5 and P7. If the
Builder changes its shape, both must keep iterating over all eight.

### Accepted caveats, carried forward

- **`main` is green today.** `test/tenancy/schema.test.ts` passes on `main` and is still wrong — on
  `main` the tenancy migration is the only one that creates tables, so the two universes coincide by
  accident. Any argument of the form *"the tests pass, so they are fine"* is answered by acceptance
  item 4, not by a re-run.
- **`test/tenancy/helpers.ts` has consumers across this suite.** `REPO_MIGRATIONS_DIR`,
  `PACKAGE_ROOT`, `TENANCY_TEST_DIR`, `ORG_A`, `ORG_B`, `withTenancyDatabase`, `contextFor`,
  `globalContext`, `principal` and `testKeyRegistry` are imported by other files in
  `test/tenancy/**` (and `migration.test.ts` imports `withTempDatabase` from `../migrate/helpers.js`,
  `DATA-10`'s area, which this ticket must not edit). This ticket is not expected to need a helper
  change at all; if it makes one, every export keeps its name and meaning.
- **The module README is not updated by this ticket's Builder.** It has already been updated by
  the Architect in this same docs branch — `docs/prd/01-app-data/README.md` `v0.9 — 2026-08-19`
  carries the count of **11**, the work-breakdown row and the wave-1 placement — which closes
  **Q-D11-B**. `docs/prd/**` is the Architect's and changes by a docs PR: the Builder still must
  not edit it.
- **`DATA-05` is not re-litigated.** Its implementation is not reviewed, re-run or modified here
  beyond using its branch as the reproduction.

## Goal

Make `packages/database/test/tenancy/schema.test.ts` assert **what `DATA-04` owns** — that the eight
PRD §35.4 tenancy tables exist at head with exactly the columns, types, keys, tenant scoping,
uniqueness constraints and index PRD §35.4/§35.1 require — **without asserting that the database
contains nothing else.** The technique is named and not open: replace the exhaustive
`expect(tables).toEqual(PRD_TABLES)` over the whole of `sqlite_master` with a **superset/subset
assertion** — the set of tables present at head must **contain** all eight of `PRD_TABLES`; extra
tables belonging to other groups are permitted and unremarked. After this ticket, a table added by
any ticket in this module or a later phase leaves `test/tenancy/**` green, and every property in the
P1–P11 table above is still proven at the same strength. Completion is mechanically checkable: the
suite is green with `ticket/DATA-05`'s migration present, **and** red — naming the offending table —
when one of the eight is deliberately damaged.

## Non-goals

- **No production code.** `packages/database/src/schema/tenancy.ts`, `src/repos/tenancy/**` and
  `migrations/*_tenancy.sql` are untouched. The schema is correct and is not the defect; if the
  Builder comes to believe it is, that is a stop-and-report (Feedback obligation item 3), not an edit.
- **No migration is added, edited, renamed, deleted or reordered.** The positive controls' damage is
  applied to a **temporary working-tree copy or an in-test fixture**, never as a committed change,
  and `git status --porcelain` is shown clean afterwards.
- **This is not a weakening.** Explicitly rejected outcomes, any one of which fails the ticket
  regardless of how green the suite is: deleting an `it(`; `.skip` / `.todo` / `it.only` / `retry` /
  any flake annotation; reducing the file to "the eight tables exist"; deriving
  `PRD_REQUIRED_COLUMNS` or `PRD_TABLES` from `src/schema/tenancy.ts`, from `discoverTableManifests()`
  or from the migration SQL (P2); relaxing P7's ordered `toEqual(['id'])`, P9's DDL `toContain`
  checks or P8's negative assertions; or removing an assertion because *"another suite covers it"*.
- **Do not solve it by changing the corpus instead of the assertion.** Pointing
  `withTenancyDatabase` at a synthetic migrations directory containing only `*_tenancy.sql` would
  make line 98 pass while **deleting** the property that the eight tables survive the *real* shipped
  migration sequence at head (P11) — and would re-break the moment a later ticket adds a tenancy
  column by a second migration. Rejected.
- **No repair of the other suites listed above.** `test/migrate/**` is `DATA-10`'s (done),
  `test/ephemeral/**` is `DATA-08`'s and is correct as written. If the Builder finds a genuinely new
  instance while reading, it is reported to the Architect (Feedback obligation item 4), not fixed here.
- **No test-runner, timeout or parallelism change.** `tools/vitest.config.mjs` is `00-foundation`'s
  (`FND-26`).
- **No change to `packages/database/package.json`** — not the exports map, not a dependency.
  `test/ephemeral/file-scope.test.ts` asserts that manifest exactly, and it is `DATA-08`'s.

## File-scope (write-owns)

Owned by this ticket — **one directory, and in practice one file**:

- `packages/database/test/tenancy/**` — `schema.test.ts` above all; `helpers.ts` only if a helper
  change proves necessary, under the caveat above.

Does not touch:

- `packages/database/src/**` — `src/schema/tenancy.ts`, `src/repos/tenancy/**` (`DATA-04`),
  `src/migrate/**` (`DATA-01`), `src/tenant/**` (`DATA-02`), `src/crypto/**` (`DATA-03`),
  `src/ephemeral/**` (`DATA-08`), `src/invariants/**` (`DATA-09`).
- `packages/database/migrations/**` — `0001_*` (`DATA-01`), `*_tenancy.sql` (`DATA-04`),
  `*_execution.sql` (`DATA-05`), `*_research.sql` (`DATA-06`), `*_operations.sql` (`DATA-07`). No
  file created, edited or deleted; temporary controls excepted and restored.
- `packages/database/package.json`, `packages/database/tsconfig.json` — module-owned append-only
  (sub-PRD **D9**); this ticket appends nothing.
- `packages/database/test/**` other than `tenancy/**` — `test/migrate/**` (`DATA-01`, repaired by
  `DATA-10`), `test/tenant/**` and `test/architecture/**` (`DATA-02`), `test/crypto/**` (`DATA-03`),
  `test/execution/**` (`DATA-05`), `test/ephemeral/**` (`DATA-08`), `test/invariants/**` (`DATA-09`).
- `packages/jobs/**` (`DATA-05`) · `apps/**` · `tests/**` (`23-assurance`) · `tools/**`, root
  manifests and lockfiles, `.github/workflows/**` (`00-foundation`) · `infra/**` · `docs/PRD.md`,
  `docs/prd/**`, `docs/adr/**`, `CLAUDE.md`, `.claude/**` — frozen, the Architect's, or another
  module's.

**No cross-module declaration is needed.** This is a `01-app-data` ticket writing `01-app-data`'s own
tree, in the exact directory sub-PRD **D8** allocates to this module. The only thing worth stating is
*whose* area it is within the module: `DATA-04`'s, and `DATA-04` is delivered — so the repair comes
as a new ticket rather than a re-run of `DATA-04`, the route `DATA-09`'s Feedback obligation
prescribes for exactly this situation (*"because those tickets may already be delivered — take it as
a new ticket in `01-app-data`"*), and the route `DATA-10` took for instance 1.

**Serial-safety analysis.** `packages/database/test/tenancy/**` is declared in **no** other ticket's
write-owns under `docs/prd/**` — verified by search on 2026-08-19; every sibling names it in a "Does
not touch" list, and `DATA-05` names only `test/tenancy/factories.ts` as a file it *reads* for
fixtures (`DATA-05-…execution…md:283`), not writes. The ticket in flight, `DATA-05`, touches nothing
under it (`git diff --name-only main...ticket/DATA-05` @ `8143e8d` has no match for `test/tenancy`),
so this ticket and `DATA-05`'s branch can be built concurrently and merged in either order. The
`blocked_by` edge added to `DATA-05` exists so that `DATA-05` **merges second** and lands green, not
because the two implementations contend for a file.

## Deliverables

1. **Line 98 stops comparing two different universes.** The assertion becomes a **superset/subset**
   check: every name in `PRD_TABLES` is present among the tables in a database migrated to head, and
   nothing is asserted about names outside that set. Write it so a *missing* table fails with the
   **missing table named** — an `expect(tables).toEqual(expect.arrayContaining(PRD_TABLES))` reports
   "not an array containing" and makes the Builder's own control B harder to read, so prefer a
   per-table loop whose assertion message names the table (the same per-column message idiom the
   next test in this file already uses at `:109`), or a computed `missing` list asserted
   `toEqual([])`. The `it(` title changes
   with it: *"and nothing else"* is no longer what is proven, and a title that outlives its assertion
   is how the next reader is misled.

2. **Decide the "and nothing else" half explicitly, and record the decision in the file.** The
   dropped half had one real use — catching a table created by `*_tenancy.sql` that PRD §35.4 does
   not list. Two ways to keep it count-agnostically, in preference order: (a) assert over the tables
   **that migration creates**, by parsing `CREATE TABLE` names out of the shipped `*_tenancy.sql`
   (the file is reachable and already read by `migration.test.ts:35`) and comparing that set to
   `PRD_TABLES` exactly; (b) accept the loss and say so. **(a) is preferred but not required** — see
   **Q-D11-A**. Whichever is chosen, a comment in `schema.test.ts` states which, and why the whole-
   database comparison was wrong. Silently dropping the property with no note fails this deliverable.

3. **Nothing else in the file changes shape.** P2–P11 keep their current assertions verbatim unless
   an edit is forced by deliverable 1's rename of a local; in particular `PRD_REQUIRED_COLUMNS` stays
   a hand transcription with its header comment intact, and the loops in P5 and P7 keep iterating
   over all eight tables.

4. **A `DATA-11` note at the top of the file**, one short paragraph, stating the rule: *this file
   asserts the eight tables `DATA-04` owns, not the database's inventory; sibling groups add tables
   to the same `app.sqlite` by design (sub-PRD D2/D4)*. The next person to add a table group should
   be able to read why nothing broke.

5. **An enumeration of properties to tests, so nothing is dropped in the edit.** The P1–P11 table
   above, reproduced in the PR body with, for each row, the test that proves it **after** the change
   and a one-word verdict (`unchanged` / `rewritten` / `dropped`). Every row must have an "after". A
   row whose "after" is empty, or whose verdict is `dropped` other than the explicitly-authorised
   "and nothing else" clause of P1 under deliverable 2, fails the ticket.

6. **Positive controls, both halves, with real output.**
   (i) With `ticket/DATA-05` @ `8143e8d`'s `20260819030229_execution.sql` and
   `src/schema/execution.ts` present in the working tree, the whole `test/tenancy/**` suite passes.
   (ii) With a genuine defect injected into **one of the eight tenancy tables** — a dropped column
   from the §35.4 required set, a renamed table, a primary key changed off TEXT, a removed
   `UNIQUE (organization_id, id)`, or `configuration_ciphertext` demoted to TEXT — the suite still
   **fails**, and the failure **names that table**. Both demonstrated with pasted runner output, the
   tree restored afterwards, and `git status --porcelain` shown **clean**.

## Acceptance checklist (classified)

**Before any run**, confirm `node -v` prints `v24.18.0` (CLAUDE.md). A red suite under Node 22.11.0
is an environment fault, not a regression — its signature is `node:internal/modules/esm/get_format`,
concentrated in child-process tests, and `test/tenancy/**` contains one such test
(`memberships.test.ts` spawns `owner-worker.mjs`). That is neither this defect nor `DATA-05`'s.

- [ ] `[machine]` **The defect is reproduced before it is fixed.** The PR records the failure of
      *"creates exactly the eight PRD §35.4 tables and nothing else"* at `schema.test.ts:98`,
      observed with `ticket/DATA-05` @ `8143e8d`'s `20260819030229_execution.sql` and
      `src/schema/execution.ts` present in the working tree, showing the six extra table names, **and**
      records which other `test/tenancy/**` tests passed in the same run. A repair whose starting
      evidence is only a hand-made extra table has not been verified against the real reproduction.
- [ ] `[machine]` **The same reproduction is green after.** With that same working-tree state, the
      whole `test/tenancy/**` suite passes; the PR states how the branch state was reproduced, and
      shows the tree restored and `git status --porcelain` clean.
- [ ] `[machine]` **Positive control A — an added table group does not break the suite.** Runner
      output pasted for the reproduction above **and** for a synthetic second case (a temporary
      migration creating an unrelated table placed in the real `packages/database/migrations/`),
      both green; tree restored and `git status --porcelain` clean (deliverable 6i).
- [ ] `[machine]` **Positive control B — the suite still bites, and names the table.** With a genuine
      defect injected into one of the eight tenancy tables (deliverable 6ii lists the candidates),
      the suite **fails**, and the failing assertion **names that table** rather than failing with an
      incidental error; runner output pasted for each injection tried; tree restored and
      `git status --porcelain` clean. **This item, not any green run, is what carries the claim.**
      State plainly in the PR why: `test/tenancy/schema.test.ts` is green on `main` today and is
      still wrong, so a green run proves nothing about whether the properties survived the edit.
- [ ] `[machine]` **No property was dropped.** The deliverable-5 P1–P11 table is in the PR with an
      "after" test named for **every** row, and `git diff main...HEAD` contains no deleted `it(`, no
      `.skip`, `.todo`, `it.only` or `retry`, and no assertion loosened from an ordered equality to a
      length, subset, `toContain` or unordered comparison **except** line 98 itself, which is the
      point of the ticket. State this explicitly; the Reviewer re-checks it by reading the diff.
- [ ] `[machine]` **The transcription is still a transcription (P2).** `PRD_REQUIRED_COLUMNS` and
      `PRD_TABLES` are still literal in `schema.test.ts`, and the diff imports nothing from
      `../../src/schema/tenancy.js`, `../../src/migrate/manifest.js` or the migration SQL **for the
      purpose of building an expectation**. (Deliverable 2(a), if chosen, reads the migration only to
      compute the *created-table* set, never the required-column set — state which, and show the
      import.) Demonstrated by grep output in the PR.
- [ ] `[machine]` **The eight are still all asserted.** Grep output in the PR shows all eight table
      names — `organization`, `user`, `membership`, `invitation`, `service_account`,
      `api_credential`, `sso_connection`, `actor` — still present in `schema.test.ts`, and no
      assertion anywhere under `test/tenancy/**` compares the whole of `sqlite_master` to a fixed
      list.
- [ ] `[machine]` **The diff is contained.** `git diff --name-only main...HEAD` lists only paths under
      `packages/database/test/tenancy/`. In particular `packages/database/src/**`,
      `packages/database/migrations/**`, `packages/database/package.json` and
      `packages/database/test/migrate/**` are unchanged (File-scope; Non-goals).
- [ ] `[machine]` **Full suite green — the standing item** (PRD §20.3, §45.3). The declared test
      command (`pnpm ci:local`, CLAUDE.md) exits 0 with its command count stated, and
      `pnpm --filter @taxrag/database test` exits 0 with its own pass count stated; `pnpm typecheck`
      green; `pnpm lint`'s result reported and compared against the known pre-existing set, so this
      ticket is neither blocked by it nor credited with it.
- [ ] `[machine]` **PRD §44.2 `E04` exit evidence is unweakened.** The PR states, from the
      deliverable-5 table, that the persistence assertions behind `AUTH-002/003/006` and PRD §35.4 —
      the "tenant-schema validation" half of PRD §20.3's CI gate — prove the same set of properties
      after this ticket as before it, the P1 "nothing else" clause excepted and accounted for.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**none** — a test-harness repair
      under PRD §20.3/§45.3 guarding PRD §35.1/§35.4; unblocks `DATA-05`–`DATA-07`), user-visible
      change (**none** — test code), schema/API/event compatibility (**none**), tenant/PII/security
      impact (**none**; state that no production migration, schema module or tenant path was touched),
      source/licence impact (**none**), cost impact (**none** beyond suite runtime — state it),
      rollback path (revert the commit, which restores the pinning and re-breaks the suite for
      `DATA-05`–`DATA-07`, so the rollback note must say so), known gaps (the Accepted caveats, plus
      whichever way **Q-D11-A** was decided; **Q-D11-B** is closed — resolved 2026-08-19 by the
      module README's `v0.9` entry).
- [ ] No `[fixture]` criteria — nothing here is a PRD §40.8 adapter fixture or a §14/§43 evaluation
      replay.
- [ ] No `[human]` criteria — a test-only change with a wholly mechanical acceptance surface; no
      PRD §41.2 `UAT-*` script applies.
- [ ] No Rust or Python is touched (PRD §45.3).

## Test plan

Reviewer steps. All offline; no network, no corpus database, no provider. **Step 0 in every shell:**
confirm `node -v` prints `v24.18.0`. Harness: Vitest, via `pnpm --filter @taxrag/database test` for
the package and the declared `pnpm ci:local` for the workspace.

1. **Read the diff for a weakened test first, before anything else.** Walk the P1–P11 table against
   the diff and confirm each "after" test exists and asserts the same property at the same strength.
   Any deleted `it(`, any relaxed equality other than line 98, any `.skip`/`.todo`/`retry`, and any
   expectation newly derived from `src/schema/tenancy.ts` is a **BOUNCE**, not a style comment —
   including one that makes the suite green.
2. **Re-run positive control B yourself**, and more than once: drop `retention_policy_json` from
   `organization`, rename `actor`, change `api_credential.id` to INTEGER, and delete
   `UNIQUE (organization_id, id)` from `service_account` in a working-tree copy of the tenancy
   migration. Each must fail the suite **naming that table**. A suite that stays green under any of
   these guards nothing, and that is the outcome this repair is most at risk of producing. Restore
   the tree after each and confirm `git status --porcelain` clean.
3. **Re-run positive control A yourself.** Apply `ticket/DATA-05` @ `8143e8d`'s
   `20260819030229_execution.sql` and `src/schema/execution.ts` to the working tree over the ticket
   branch, run `test/tenancy/**` green, then restore.
4. **Grep for residual pins.** No assertion under `test/tenancy/**` compares an unfiltered
   `sqlite_master` listing to a fixed list; all eight table names still appear in `schema.test.ts`.
5. **Check the boundary.** `git diff --name-only main...HEAD` is entirely under
   `packages/database/test/tenancy/`. If `packages/database/src/**`, `migrations/**` or
   `test/migrate/**` appears, that is a file-scope violation regardless of the code's quality.
6. **Confirm the neighbours are untouched and green.** `test/tenancy/migration.test.ts` and
   `test/tenancy/conventions.test.ts` are unmodified in the diff and pass in the run, and
   `test/ephemeral/**` — whose exhaustive three-table assertion is correct and out of scope — is
   unmodified.
7. **Suite and gates.** `pnpm ci:local` and `pnpm typecheck` green on the branch; the suite re-run on
   the default branch after the merge.

## Open questions

| ID | Question | Status | Decides |
|---|---|---|---|
| **Q-D11-A** | Should the dropped *"and nothing else"* property be preserved in a scoped, count-agnostic form — asserting that the tables **`*_tenancy.sql` itself creates** are exactly the eight of PRD §35.4 — or simply accepted as lost? | **OPEN — does not block, and is not required by acceptance.** Deliverable 2 makes the *decision* mandatory and the *choice* the Builder's: (a) is strictly additive, cannot re-introduce the defect, and keeps a real guard against an unlisted table in `DATA-04`'s own migration; (b) is acceptable if (a) needs machinery out of proportion to it. Whichever is chosen must be stated in a comment in the file and in the PR. | **The Builder**, reported in the PR; the **Architect** if (a) turns out to need an `src/migrate/**` export that does not exist — that is a stop-and-report, not a quiet widening. |
| **Q-D11-B** | `docs/prd/01-app-data/README.md` describes the module as *"10 tickets"* and its work-breakdown table has no `DATA-11` row; the wave diagram has no wave-1 entry for it. Does the README gain the row (and the count become 11) now, or at the next module-level docs pass? | **RESOLVED 2026-08-19** — the README gains it **now**, in this same docs branch: `docs/prd/01-app-data/README.md` `v0.9 — 2026-08-19` states **11 tickets** in all three places the count appears (the sub-PRD header line, the Work-breakdown preamble and the Acceptance line), adds the `DATA-11` work-breakdown row, and places `DATA-11` in **wave 1** beside `DATA-01` and `DATA-10`. **One correction to this row as originally written:** peak lane width *does* change, 2 → 3, because wave 1 now holds three entries — so the lane-shape summary was corrected to *peak three lanes*, with the qualification that the intrinsic width is still two and both extra lanes are root repair tickets owning test areas only. Bookkeeping only — no scope, decision or acceptance change, and nothing in this ticket depended on it. `docs/prd/**` remains the Architect's: the Builder still must not edit it. | **The Architect**, as a docs PR followed by `publish-tickets.mjs --sync`. |

## Feedback obligation

**General rule.** If implementation falsifies anything here, update **this ticket** first — version
+0.1 with a changelog line — then change code, then re-publish the issue
(`publish-tickets.mjs --sync`). Never patch spec into a plan, into code, or by hand-editing the
issue (CLAUDE.md, issue #53).

1. **A property in P1–P11 genuinely cannot be kept while dropping the whole-database comparison.** →
   That is a test-design problem, not a licence to loosen. Say which property, what was tried, and
   why; propose the narrowest replacement that keeps it. Do **not** delete it and note it in the PR
   as a known gap.
2. **The repair appears to require a change outside `test/tenancy/**`** — for example
   `src/schema/tenancy.ts` must export something, or `test/migrate/helpers.ts` needs a new helper. →
   **Stop and report.** Those are `DATA-04`'s and `DATA-01`/`DATA-10`'s. Raise it with the
   **Architect** with the measurement attached: either this ticket gains the path by a +0.1
   file-scope amendment, or a separate ticket owns it. Do not widen quietly, and do not fall back to
   a loosened assertion while waiting.
3. **The tenancy schema turns out to be genuinely wrong** — a §35.4 required column is missing, a
   constraint is absent, or a table is not what §35.4 describes, and the exhaustive assertion was
   masking it. → That is a correctness defect in `DATA-04`'s delivered schema and a **release-blocking**
   finding, not a test edit. Stop, escalate to the human, and raise it with the **Architect** with the
   reproduction. Never make the test agree with the wrong schema.
4. **Another suite is found to pin the database's or repository's content.** → Record the file, the
   assertion and how it will break, and raise it with the **Architect** as a separate ticket for its
   owning module. Do not absorb it (Non-goals). The search recorded in Background was run on
   2026-08-19 and found none beyond `schema.test.ts:98` — `test/ephemeral/**`'s exhaustive
   three-table assertion is correct, not an instance — so a new finding is genuinely new. This is the
   **third** instance of the class in this module; a fourth is worth raising as a module-level
   pattern, not just a ticket.
5. **`DATA-05`'s branch cannot be reproduced** (rebased away, `8143e8d` unreachable). → Report it and
   proceed with the synthetic control A, which does not depend on that branch — but say so explicitly
   in the PR rather than letting acceptance items 1–2 read as satisfied.

**Escalation.** If it proves impossible to make the file table-set-agnostic **without** dropping a
property in P1–P11, then what needs deciding is how this repository asserts its application schema at
all — not this ticket. Stop, escalate to the human, and raise it with the **Architect**. **Never**
resolve it by deleting a test, skipping it, or loosening an assertion: PRD §35.4 and the
`AUTH-002/003/006` persistence half rest on these assertions, and a file that no longer distinguishes
a correct tenancy schema from a damaged one discharges nothing — while being, unlike today's file,
permanently green.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-19 | Initial ticket. Repairs `DATA-04`'s tenancy schema test, which pins the **database's** content and therefore turns **one test red** — *"creates exactly the eight PRD §35.4 tables and nothing else"*, `test/tenancy/schema.test.ts:98` — when `DATA-05` adds the six PRD §35.6 execution tables its own File-scope authorises (`ticket/DATA-05` @ `8143e8d`; `git diff --name-only main...ticket/DATA-05` is 34 files, all inside that File-scope, with **no path under `test/tenancy/`**, so the suite was broken by the existence of correct work, not by an edit to it). Records the mechanism so it is not re-derived: `withTenancyDatabase` (`test/tenancy/helpers.ts:59-75`) migrates a fresh database to head with the **real shipped `migrations/` directory**, so line 98's left-hand side is the whole application database while its right-hand side, `PRD_TABLES`, is only `DATA-04`'s eight — two different universes compared as if they were one. Establishes ownership from the files rather than by assertion: `DATA-04`'s File-scope names `packages/database/test/tenancy/**` as *"this ticket's own test area, sub-PRD D8"*, `DATA-05`'s write-owns is `test/execution/**` and `packages/jobs/**`, and **D8** forbids a ticket writing into another ticket's test directory — so the repair is a new ticket in `01-app-data`, the route `DATA-09`'s Feedback obligation prescribes for a delivered sibling and the route `DATA-10` took for the same defect class; `DATA-05`'s Builder correctly refused to touch it, and the opposite choice already cost `DATA-04` a round-4 blocker and the 2-bounce cap on 2026-08-18. Names this the **third instance of one defect class in this module** — (1) `DATA-01`'s migrate suite pinned the repository's migration list, repaired by `DATA-10`; (2) this; (3) `DATA-06` and `DATA-07`, which were **verified per ticket by reading each File-scope** (`DATA-06` owns `migrations/*_research.sql` creating ten tables and `test/research/**`; `DATA-07` owns `migrations/*_operations.sql` creating eleven tables and `test/operations/**`; neither declares a path under `test/tenancy/**`), so both hit line 98 identically and neither may repair it — hence `blocks: [DATA-05, DATA-06, DATA-07]` and a general repair rather than three cross-scope exceptions. Names the technique: a **superset/subset** assertion over the eight, not an exhaustive `toEqual` over `sqlite_master`. States the hard limit prominently and enumerates it as **P1–P11**, read out of the file on 2026-08-19, so the Builder repairs against a list rather than a vibe: the hand transcription of PRD §35.4 stays a hand transcription (deriving it from `src/schema/tenancy.ts` would compare the schema to itself — the file's own header says so), and required columns, the ciphertext BLOB and its two plaintext negatives, `created_at`/`updated_at`/`row_version`, the ordered TEXT NOT NULL primary keys, tenant scoping with its GLOBAL negatives, twelve uniqueness constraints and the `api_credential` index all survive at the same strength; dropping to "the tables exist" is a rejected outcome, as is making line 98 pass by pointing the harness at a synthetic migrations directory, which would silently delete the property that the eight survive the real sequence at head. Acceptance is **two-sided** — green with `ticket/DATA-05`'s migration and schema module in the tree, and still **red, naming the table**, when one of the eight is genuinely damaged — with real output and `git status --porcelain` clean afterwards, and says plainly that a green run proves nothing here because the file is green on `main` today (where the tenancy migration is the only one creating tables, so the two universes coincide by accident) and still wrong. Records the neighbours searched on 2026-08-19: `test/tenancy/migration.test.ts` and `conventions.test.ts` are **already** count-agnostic (`endsWith('_tenancy.sql')`, `toContain('tenancy')`) and are the idiom to copy; nothing else under `test/tenancy/**` asserts an inventory; and `test/ephemeral/schema.test.ts`'s exhaustive three-table assertion is **correct, not an instance**, because sub-PRD **D6** makes `ephemeral.sqlite` a closed database whose only owner bootstraps it outside the migration sequence. Carries `blocked_by: []` (a root — schema, migration and test all already on `main`); only `DATA-05` gains the reciprocal `blocked_by` edge, because `DATA-06` and `DATA-07` are already `blocked_by DATA-05` transitively and `dag-core.mjs` schedules on `blocked_by` alone. |
