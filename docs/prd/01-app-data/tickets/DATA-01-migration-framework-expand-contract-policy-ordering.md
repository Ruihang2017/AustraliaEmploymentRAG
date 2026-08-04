---
id: DATA-01
title: Migration framework, expand/contract policy, ordering
module: 01-app-data
lane: 01-app-data
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-03]
blocks: [DATA-02, DATA-03, RLSE-05]
---

# DATA-01 — Migration framework, expand/contract policy, ordering

Implements PRD §20.4, §35.1 and §44.3 (`E04-APPDB`; underpins SEC-001, REC-001, ANS-003/004,
OPS-003). No ADR exists yet — `docs/adr/` contains only `.gitkeep`. The migration decisions are
already made in PRD §20.4/§35.1/§44.3 and plan §2.1 **A5**, and the SQLite access layer is settled
by breakdown-plan §8 **Q13** (confirmed architecture decision, owner `01-app-data`); this ticket
**carries Q13's ADR decision input** and is build ticket 1 of 9 against those decisions.
Parent sub-PRD: [01-app-data README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `FND-03` — "Canonical enums and opaque ID conventions", module `docs/prd/00-foundation`.
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed
contract (PRD §35.1 conventions + §20.4 expand/contract + the §8 Q13 access layer) — not a new
subsystem decision.

## Background + basis

The repository has no `packages/` tree yet. `FND-01` creates the empty workspace-member skeleton
for every member in PRD §20.1 (manifest + tsconfig), and `FND-03` publishes the canonical enums
this ticket generates SQLite check constraints from. Everything else in `packages/database` starts
here.

**PRD §44.3** makes the migration sequence a serial-owned artifact:

> Serial owners are required for root lockfiles, canonical enums, OpenAPI root, **app migration
> order**, corpus schema/manifest, active release/promotion files and production
> Compose/deployment configuration.

**PRD §20.4** fixes the migration style:

> Use expand/contract SQLite migrations, background backfills, versioned release directories,
> candidate health checks and an atomic application pointer. Application and corpus releases are
> independently versioned and declare compatibility ranges.

**PRD §39.7** step 4 makes the same rule enforceable per release:

> Expand migrations run; destructive/contract changes are not permitted in the same release that
> removes old readers.

**PRD §35.1** is the complete storage/type contract every later table group must satisfy, quoted
in full because tickets `DATA-04`…`DATA-07` are checked against it:

> - SQLite table and column names use `snake_case`; API names use `snake_case`.
> - IDs are `TEXT PRIMARY KEY`; timestamps are UTC ISO text; legal dates are `TEXT` with
>   `YYYY-MM-DD` checks; booleans are `INTEGER CHECK (value IN (0,1))`.
> - Enumerations use checked text values generated from `packages/contracts`.
> - Customer text columns are encrypted only where stated; whole S3 backups are encrypted and
>   sensitive credentials also use application envelope encryption.
> - Every mutable table has `created_at`; mutable metadata tables also have `updated_at` and
>   integer `row_version`.
> - Every tenant-owned unique key includes `organization_id` unless the key is a globally random
>   primary ID and a composite tenant foreign key provides the boundary.

**The SQLite access layer is decided.** PRD §18.2 lists the mutable-database row as *"SQLite
(`better-sqlite3`) with Drizzle or Kysely-style migrations/repositories"* — an either/or. Plan §8
**Q13** has settled it, and the settlement is binding on this module:

> - Kysely-style repositories and query construction, using Kysely's SQLite dialect over
>   `better-sqlite3`.
> - Drizzle is not used in the application database layer.
> - Raw `.sql` files checked into git remain the only migration authoring format.
> - The project's own forward-only expand/contract migration runner owns migration ordering,
>   checksums, locking, recovery-point enforcement and the expand/contract policy.
> - Kysely owns typed application queries and repositories only. It neither generates nor owns
>   schema migrations.
> - Constraints, composite tenant foreign keys, triggers, CHECK constraints, temporal rules and
>   indexes stay expressed explicitly in SQL.
> - Application code reaches the database only through tenant-scoped repositories; an unscoped
>   Kysely or database handle must never be spread into feature modules.

That is not a question this ticket answers — it is a decision this ticket **implements and
records**. PRD §45.5 classifies a durable technology/dependency trade-off as an *Architecture
decision*, which "requires an ADR under `docs/adr/` and compatibility/security review", so writing
the ADR that records Q13 is a deliverable here (deliverable 1). The ADR does not exist yet;
`docs/adr/` contains only `.gitkeep`, and this Builder authors the file. The register's standing
rule applies: an implementing agent must not re-litigate a confirmed decision or substitute its own
preference — a Builder that believes Q13 is falsified by what it finds in the code uses the
feedback obligation below (writeback to `docs/prd/breakdown-plan.md` §8 and
`docs/prd/01-app-data/README.md` first), never a local substitution.

**PRD §18.3** scopes the database this sequence governs:

> `app.sqlite` is mutable and contains identity, organisations, Research Records, jobs, audit and
> usage. `corpus.sqlite` is release-specific, immutable and production read-only.

**PRD §23.1** adds an operational precondition this ticket must expose as a seam (the Litestream
side is `RLSE-05`, which is `blocked_by` this ticket):

> Force a confirmed recovery point before migrations, auth/application changes, bulk customer
> operations and key rotation.

**PRD §20.3** lists the CI gate this ticket must make runnable: *"Migration and tenant-schema
validation."*

**Decomposition decision A5** (plan §2.1), which this ticket implements and is the reason the
module is not a nine-ticket chain:

> App migrations are **timestamp-prefixed and expand-only**; independent table groups may be
> authored concurrently, and a group with a cross-group FK is `blocked_by` the group it references.
> Keeps PRD §44.3's single serial owner for "app migration order" without turning four table-group
> tickets into a chain.

Accepted caveats carried forward, not re-litigated:

- SQLite has no `ALTER TABLE … DROP COLUMN` before 3.35 and no general column-type change.
  Expand-only is therefore also the pragmatic style, not just the required one.
- `app.sqlite` is opened concurrently by `apps/api`, `apps/worker` and Litestream (PRD §39.1, §39.4)
  and SQLite allows exactly one writer. Migration must take an exclusive lock; two processes
  starting at once must not both migrate.
- `better-sqlite3` is a native module. It must build against the toolchain pinned by plan §8 **Q12**
  (Node.js `24.18.0`, pnpm `11.4.0`) and `FND-01`; record the verified version pair rather than
  floating the dependency.

## Goal

Produce, under `packages/database/src/migrate/**` and `packages/database/migrations/0001_*`, a
forward-only SQLite migration runner plus the ordering and expand-only policy that later table-group
tickets build on: a checksummed ledger table, a filename policy that lets four table groups be
authored concurrently without a shared counter, a mechanical expand-only check that only lets a
contract migration run in a *later* run than the expand migration it supersedes, the PRD §35.1
column-convention helpers (including enum checks generated from `packages/contracts`), and a
glob-discovered `TableManifest` contract so no shared registration file ever exists. Land, in the
same ticket, `docs/adr/NNNN-sqlite-access-layer.md` recording plan §8 **Q13**'s confirmed
access-layer decision, which `DATA-02`…`DATA-09` and every downstream consumer build against.
Completion is mechanically checkable: a clean temp database migrates from empty to head, re-running
is a no-op, a tampered applied migration fails loudly, the fixture policy suite rejects every
forbidden construct, and the ADR exists with the required sections.

## Non-goals

- **No application tables.** `organization`, `job`, `answer_snapshot` and friends are `DATA-04`,
  `DATA-05`, `DATA-06` and `DATA-07`. This ticket ships only the baseline migration
  (`0001_baseline.sql`) that bootstraps the ledger and pragmas.
- **No repositories, no `TenantContext`, and no Kysely query surface.** That is `DATA-02`
  (`src/tenant/**`), which owns the package-private Kysely instance and the typed repository
  factory under §8 Q13. This ticket exposes only the migration-time connection and the shared
  pragma definition, and it uses `better-sqlite3` directly to execute raw `.sql`.
- **No encryption.** `DATA-03` owns `src/crypto/**`.
- **No `ephemeral.sqlite`.** `DATA-08` owns it, and per sub-PRD D6 it is deliberately outside this
  migration sequence.
- **No Litestream, backup globs or recovery-point implementation.** `RLSE-05` owns `infra/backup/**`
  and is `blocked_by` this ticket; here the recovery-point precondition is a provider seam that
  fails closed by default.
- **No root `package.json` scripts.** Root manifests are `00-foundation`'s (`FND-01`, plan §4).
  Migration scripts go in `packages/database/package.json` only.
- **No corpus schema.** PRD §45.2 forbids it to this package.

## File-scope (write-owns)

- `packages/database/src/migrate/**`
- `packages/database/migrations/0001_*` (exactly one file: `0001_baseline.sql`)
- `packages/database/test/migrate/**` (this ticket's own test area, sub-PRD D8)
- `packages/database/package.json`, `packages/database/tsconfig.json` — module-owned, **append-only**
  (sub-PRD D9; plan §1.1 "Package manifests"). Adding a declared dependency regenerates
  `pnpm-lock.yaml` as a build artifact; conflicts resolve by re-running pnpm, never by hand-merge
  (PRD §44.3, plan §4.1).
- `docs/adr/NNNN-sqlite-access-layer.md` — **one new file**, claimed by this ticket under plan §2.1
  **A9** ("`docs/adr/**` is the only shared-additive directory: ownership is per *file*, claimed by
  the ticket that creates `NNNN-<slug>.md`"). It records the confirmed plan §8 **Q13** decision
  (deliverable 1). `NNNN` is the lowest unused four-digit number at implementation time (expected
  `0001`; `docs/adr/` currently contains only `.gitkeep`). Do not modify any existing ADR.

- Does not touch: `packages/database/src/{tenant,crypto,schema,repos,ephemeral,invariants}/**`
  (`DATA-02`, `DATA-03`, `DATA-04`–`DATA-07`, `DATA-08`, `DATA-09`) ·
  `packages/database/migrations/*_tenancy.sql` (`DATA-04`), `*_execution.sql` (`DATA-05`),
  `*_research.sql` (`DATA-06`), `*_operations.sql` (`DATA-07`) · `packages/jobs/**` (`DATA-05`) ·
  `packages/contracts/**` (`FND-03`) · `packages/domain/**` (`FND-06`–`FND-10`) · root manifests,
  lockfiles, `tools/**`, `.github/workflows/**` (`00-foundation`) · `infra/**` (`03-app-runtime`,
  `18-ops-release`) · `docs/PRD.md` and `docs/prd/breakdown-plan.md` (frozen / not this ticket's to
  edit).

**Serial safety.** This is the first decomposition: nothing is merged, no ticket has ever touched
these paths, and there is no in-flight contention. Siblings sharing the module are `DATA-02`…
`DATA-09`; all of them are `blocked_by` this ticket transitively, and their scopes are disjoint
subtrees (`src/tenant`, `src/crypto`, `src/schema/<group>.ts`, `src/repos/<group>`,
`src/ephemeral`, `src/invariants`, `packages/jobs`) plus their own group-suffixed migration files.
Per plan A5 the migrations directory is **not** a serialisation point: filenames are
timestamp-prefixed and expand-only, so `DATA-04`…`DATA-07` can author independently and only
cross-group FKs create ordering, which the DAG already encodes. This ticket writes the only
`0001_*` file, which nothing else may create.

## Deliverables

1. **ADR recording plan §8 Q13 — the SQLite access layer.**
   `docs/adr/NNNN-sqlite-access-layer.md`. This ADR **records an already-confirmed decision**; it
   does not choose. Write it with these five sections and this content:

   - **Status.** `Accepted`. Confirmed in `docs/prd/breakdown-plan.md` §8 **Q13** (decision
     register, 2026-08-03, owner `01-app-data`); authored here by the `DATA-01` Builder at
     implementation time. Classified an *Architecture decision* under PRD §45.5, so it carries a
     compatibility/security review.
   - **Context.** PRD §18.2 names the stack and leaves the mutable-database row as an either/or —
     quote *"SQLite (`better-sqlite3`) with Drizzle or Kysely-style migrations/repositories"*. Quote
     PRD §35.1's storage conventions (reproduced in "Background + basis" above). State the
     constraints the project had already fixed before the choice was made, because they are the
     grounds: PRD §44.3's serial-owned **app migration order**; plan §2.1 **A5** (timestamp-prefixed,
     expand-only, concurrently authorable `.sql` files) and sub-PRD **D2**; PRD §20.4 expand/contract
     and §39.7 step 4; PRD §23.1's forced recovery point before migrations; PRD §35.1's enum CHECKs
     generated from `packages/contracts` (`FND-03`); PRD §15.4/§35.1 composite tenant keys and
     foreign keys; PRD §35.8's eight database invariants; PRD §16.5/§21.2 and **SEC-001**
     (TenantContext-scoped repositories only).
   - **Decision.** Record all seven Q13 clauses: (a) Kysely-style repositories and query
     construction, using Kysely's SQLite dialect over `better-sqlite3`; (b) Drizzle is not used in
     the application database layer; (c) raw `.sql` files checked into git remain the only migration
     authoring format; (d) this project's own forward-only expand/contract migration runner — the
     one in deliverables 3–7 — owns migration ordering, checksums, locking, recovery-point
     enforcement and the expand/contract policy; (e) Kysely owns typed application queries and
     repositories only and neither generates nor owns schema migrations; (f) constraints, composite
     tenant foreign keys, triggers, CHECK constraints, temporal rules and indexes stay expressed
     explicitly in SQL; (g) application code reaches the database only through tenant-scoped
     repositories — an unscoped Kysely instance or `better-sqlite3` handle must never be spread into
     feature modules.
   - **Alternatives considered — Drizzle (rejected).** Record Drizzle as *the* rejected alternative,
     on the grounds §8 Q13 states: the project has already fixed a raw-SQL migration contract and
     carries a large set of explicit SQLite invariants, which suits Kysely-style repositories.
     Spell that out: Drizzle's centre of gravity is schema-first TypeScript table definitions plus
     generated migrations, and here the schema is authored as checked-in `.sql` under a serial-owned
     order (PRD §44.3) with checksums, an exclusive lock and an expand/contract gate that a
     generator does not own — so the generation half would be unused or in contention, and the
     schema half would become a second source of truth beside the `.sql` files and
     `packages/contracts`' generated enum CHECKs. Kysely's narrower remit — typed queries over a
     schema it does not own — matches the boundary the project already has. Do **not** write this
     section as an open comparison or a recommendation; Q13 is settled.
   - **Consequences.** At minimum: (i) migration authoring stays raw `.sql`, so plan §5.2's
     `*_tenancy.sql`/`*_execution.sql`/`*_research.sql`/`*_operations.sql` file-scope globs and
     sub-PRD D2's filename policy hold unchanged, and `DATA-04`…`DATA-07` are unaffected; (ii) no
     third-party migration tool, CLI or generator is introduced — deliverables 3–7 are the whole
     migration mechanism; (iii) the Kysely database-type surface is maintained alongside the `.sql`
     schema rather than generated from it, so drift is caught by deliverable 10's convention linter
     and deliverable 9's `TableManifest` glob, and the ADR must say so; (iv) for `DATA-02`, the
     Kysely instance and the `better-sqlite3` handle are package-private, the `packages/database`
     `exports` map exposes neither, and the SEC-001 architecture test forbids importing `kysely` or
     `better-sqlite3` anywhere outside `packages/database`; (v) `kysely` and `better-sqlite3` become
     declared dependencies of `packages/database` and therefore enter the PRD §21.1 SBOM/vulnerability
     gate; (vi) `better-sqlite3` is a native module and must build against the Node.js `24.18.0`
     toolchain pinned by plan §8 **Q12** — record the verified version pair; (vii) triggers, CHECK
     constraints and composite tenant foreign keys stay in SQL, which is what keeps PRD §35.8
     invariants 4 and 5 structural rather than conventional (`DATA-02` deliverable 5, `DATA-06`,
     `DATA-09`).
2. **Shared pragmas.** `packages/database/src/migrate/pragmas.ts` exporting `APP_SQLITE_PRAGMAS` —
   at minimum `journal_mode = WAL` (PRD §23.1), `foreign_keys = ON` (per-connection in SQLite; it is
   not persisted) and a non-zero `busy_timeout`. This is the single definition; `DATA-02`'s
   connection factory and `DATA-08`'s ephemeral factory import it rather than restating it.
3. **Migration ledger.** `packages/database/migrations/0001_baseline.sql` creating
   `schema_migration` (`name` TEXT PRIMARY KEY, `checksum` TEXT NOT NULL, `applied_at` TEXT NOT NULL,
   `duration_ms` INTEGER NOT NULL, `run_id` TEXT NOT NULL, `phase` TEXT NOT NULL CHECK
   (`phase` IN ('expand','contract'))). `run_id` groups everything applied by one invocation — it is
   what makes the same-release contract rule (deliverable 6) decidable. The baseline creates no
   application table.
4. **Runner.** `packages/database/src/migrate/runner.ts` exporting at least:
   - `runMigrations(options: { databasePath: string; migrationsDir?: string; requireRecoveryPoint?: boolean; recoveryPoint?: RecoveryPointProvider }): Promise<MigrationReport>`
   - `migrationStatus(databasePath): { applied: AppliedMigration[]; pending: string[]; head: string | null }`
   - `assertSchemaUpToDate(db): void` — throws when a pending migration exists; `RUNT-08` readiness
     (PRD §42.1) and `DATA-02`'s connection factory call it.
   Behaviour: forward-only; execute each pending file's raw SQL through `better-sqlite3` (no query
   builder, no Kysely migration facility, no generated DDL — §8 Q13 clauses (c)–(e)); apply each
   pending migration inside its own transaction; record the ledger row in the **same** transaction;
   take an exclusive lock (`BEGIN IMMEDIATE` on a dedicated lock row or equivalent) so two processes
   starting together cannot both migrate; idempotent — a second run with no new files applies
   nothing; a checksum mismatch on an already-applied file aborts before applying anything.
5. **Naming and ordering policy.** `packages/database/src/migrate/naming.ts` exporting
   `MIGRATION_FILENAME = /^(0001_baseline|\d{14}_[a-z0-9]+(?:-[a-z0-9]+)*)\.sql$/`,
   `parseMigrationFilename(name)` and `nextMigrationFilename(group, now)` producing
   `<UTC YYYYMMDDHHMMSS>_<group>.sql`. Ordering is plain lexicographic on filename — `0001_…` sorts
   before every `2026…` prefix, so the baseline is always first without a special case. Two files
   sharing a prefix is a hard error. **Out-of-order arrival is tolerated**: any unapplied file is
   applied in lexicographic order even if later-sorting files are already applied, and the report
   flags it. That tolerance is what makes A5's concurrent authoring safe.
6. **Expand-only policy.** `packages/database/src/migrate/policy.ts` exporting
   `assertExpandOnly(sql, meta)`. Default: reject `DROP TABLE`, `DROP INDEX` on a
   uniqueness-carrying index, `ALTER TABLE … DROP COLUMN`, `ALTER TABLE … RENAME`, and unqualified
   `DELETE FROM`/`UPDATE` in a migration body (comments and string literals must not produce false
   positives). A contract migration opts in with a header block:
   ```sql
   -- aer:phase contract
   -- aer:expanded-in 20260803120000_tenancy
   ```
   The runner then refuses to apply it unless `<expanded-in>` is already present in
   `schema_migration` **with a different `run_id`** — the mechanical form of PRD §39.7's
   "destructive/contract changes are not permitted in the same release that removes old readers".
7. **Recovery-point seam.** `RecoveryPointProvider = () => Promise<{ id: string; takenAt: string }>`.
   When `requireRecoveryPoint` is set and no provider is supplied, `runMigrations` throws
   `RECOVERY_POINT_REQUIRED` before opening a transaction (PRD §23.1). The provider itself is
   `RLSE-05`'s. Record the returned id in the report.
8. **Column conventions.** `packages/database/src/migrate/conventions.ts` implementing PRD §35.1 as
   reusable DDL fragments: `idColumn(name)`, `timestampColumn(name)`, `legalDateColumn(name)` (with
   the `YYYY-MM-DD` CHECK), `booleanColumn(name)` (`INTEGER CHECK (x IN (0,1))`),
   `rowVersionColumn()`, `createdUpdatedColumns()`, `enumCheck(column, contractsEnum)` — the enum
   values are read from `packages/contracts` (`FND-03`) so a drift between the TypeScript enum and
   the SQLite CHECK is a test failure, not a runtime surprise — and the DDL text for
   `tenantForeignKey(...)` (the repository-side helper is `DATA-02`'s). These emit SQL text for
   hand-authored `.sql` files; they are not a schema-definition DSL and nothing generates a
   migration from them (§8 Q13 clauses (c) and (f)).
9. **`TableManifest` contract + glob discovery.** `packages/database/src/migrate/manifest.ts`
   exporting:
   ```ts
   export type TableScope = 'TENANT' | 'GLOBAL'
   export type TableMutability = 'MUTABLE_METADATA' | 'APPEND_ONLY' | 'IMMUTABLE'
   export interface TableSpec { name: string; scope: TableScope; mutability: TableMutability; encryptedColumns?: string[]; requiredColumns: string[] }
   export interface TableManifest { group: string; tables: TableSpec[] }
   export function discoverTableManifests(dir?: string): TableManifest[]  // globs src/schema/*.ts
   ```
   Discovery is by directory glob over `packages/database/src/schema/*.ts`, each exporting
   `tableManifest` — **never** a shared barrel/index file (sub-PRD D4; same principle as plan A1).
   `DATA-04`…`DATA-07` each add exactly one file to that glob.
10. **Convention linter.** `assertSchemaConventions(db, manifests)` exported from `src/migrate/`,
    plus its test in `packages/database/test/migrate/`: migrate a temp database to head, walk
    `sqlite_master` and `pragma table_info`, and assert PRD §35.1 for every declared table —
    snake_case names, `TEXT PRIMARY KEY`, `created_at` on every mutable table, `updated_at` +
    integer `row_version` on `MUTABLE_METADATA` tables, boolean and legal-date CHECKs present,
    `organization_id` present on every `TENANT`-scoped table, and enum CHECK value sets equal to the
    `packages/contracts` enum. It passes vacuously today (only `schema_migration` exists) and
    becomes load-bearing as `DATA-04`…`DATA-07` land. Under §8 Q13 this linter is also the drift
    check between the `.sql` schema and the hand-maintained Kysely type surface `DATA-02` builds.
11. **Package scripts** in `packages/database/package.json`: `db:migrate`, `db:status`,
    `db:new <group>` (prints/creates the next timestamped filename via `nextMigrationFilename`).

## Acceptance checklist (classified)

- [ ] `[machine]` A clean temp database migrates from empty to head; `schema_migration` holds one
      row for `0001_baseline.sql` with a checksum, `applied_at`, `duration_ms`, `run_id` and
      `phase = 'expand'` (PRD §20.4)
- [ ] `[machine]` Re-running `runMigrations` applies nothing and returns an empty `applied` list
      (idempotent)
- [ ] `[machine]` Mutating an already-applied migration file makes the next run abort with a
      checksum error **before** applying any pending migration
- [ ] `[machine]` `MIGRATION_FILENAME` accepts `0001_baseline.sql` and `20260803120000_tenancy.sql`
      and rejects `2_foo.sql`, `0002_bar.sql`, `20260803120000_Tenancy.sql` and
      `20260803120000_tenancy.SQL`; two files sharing a prefix is a hard error (plan A5)
- [ ] `[machine]` Lexicographic ordering puts `0001_baseline.sql` first for every timestamped
      sibling; an unapplied file whose prefix sorts *before* an applied file is still applied, and
      the report flags the out-of-order arrival (plan A5 concurrent authoring)
- [ ] `[machine]` `assertExpandOnly` rejects fixture migrations containing `DROP TABLE`,
      `ALTER TABLE … DROP COLUMN`, `ALTER TABLE … RENAME` and an unqualified `DELETE FROM`, and does
      **not** false-positive on those words inside comments or string literals (PRD §20.4)
- [ ] `[machine]` A contract migration whose `-- aer:expanded-in` target was applied in the **same**
      `run_id` is refused; the same migration applied in a **later** run succeeds (PRD §39.7 step 4)
- [ ] `[machine]` `runMigrations({ requireRecoveryPoint: true })` without a provider throws
      `RECOVERY_POINT_REQUIRED` and leaves the database untouched (PRD §23.1)
- [ ] `[machine]` Two concurrent `runMigrations` calls against the same file produce exactly one set
      of ledger rows and no unhandled `SQLITE_BUSY` (WAL + `busy_timeout` + exclusive lock;
      PRD §39.1/§39.4 — api, worker and Litestream share the file)
- [ ] `[machine]` `enumCheck` output for a `packages/contracts` enum equals that enum's value set; a
      deliberately drifted fixture value fails (PRD §35.1 "generated from `packages/contracts`",
      `FND-03`)
- [ ] `[machine]` `assertSchemaConventions` runs green against head and fails against a fixture table
      that omits `created_at`, uses a non-`TEXT` primary key or declares a boolean without the
      `IN (0,1)` CHECK (PRD §35.1)
- [ ] `[machine]` `discoverTableManifests` finds manifests by glob with no index/barrel file present,
      and returns `[]` when `src/schema/` is empty (sub-PRD D4)
- [ ] `[machine]` **§8 Q13 conformance**: every file under `packages/database/migrations/` is a
      checked-in `.sql` file applied by this ticket's runner, no migration is generated by a query
      builder, and neither `packages/database/package.json` nor `packages/jobs/package.json`
      declares a Drizzle dependency (plan §8 Q13 clauses (b)–(e), sub-PRD D11)
- [ ] `[machine]` `pnpm db:migrate`, `pnpm db:status` and `pnpm db:new tenancy` run from
      `packages/database` (PRD §20.3 "Migration and tenant-schema validation" has a runnable target)
- [ ] `[machine]` `pnpm test` green
- [ ] `[machine]` Writeback: `docs/adr/NNNN-sqlite-access-layer.md` exists with Status/Context/
      Decision/Alternatives/Consequences sections and records the **confirmed** plan §8 **Q13**
      decision — Kysely-style repositories over `better-sqlite3` accepted, Drizzle recorded as the
      rejected alternative on Q13's stated grounds — and `docs/prd/01-app-data/README.md`'s decision
      **D11** is updated with the assigned `NNNN` path. The ADR must not present the choice as open
      (deliverable 1)
- [ ] `[human]` The access-layer ADR is accepted at the PRD §45.5 "compatibility/security review" for
      an Architecture decision
- [ ] No `[fixture]` criteria — this ticket replays no recorded source or evaluation data; PRD §40.8
      adapter fixtures belong to `05-ingestion-framework` and the source modules, PRD §14/§43
      evaluation replays to `21-evaluation-600`
- [ ] No Rust or Python is touched, so `cargo test --workspace` and `uv run pytest` are not required
      for this ticket (PRD §45.3)

## Test plan

All steps are offline and require no network, credentials or running services.

1. `corepack pnpm install --frozen-lockfile` at the repository root (PRD §45.3). If this ticket
   added a dependency, the lockfile change is a build artifact — regenerate, never hand-merge.
2. `pnpm test` at the root, then a focused run with
   `pnpm --filter <the packages/database package name from FND-01's skeleton manifest> test`.
3. Harness: every test opens a fresh SQLite file under the OS temp directory (no shared fixture
   database, no in-memory-only shortcuts — WAL and locking behaviour differ in memory). Provide
   `withTempDatabase(fn)` in `packages/database/test/migrate/helpers.ts`; later tickets copy this
   construction pattern.
4. Fixtures live in `packages/database/test/migrate/fixtures/`:
   - `good/` — a baseline plus two timestamped no-op expand migrations;
   - `bad-name/` — the four rejected filenames above;
   - `destructive/` — one file per forbidden construct, plus a decoy containing
     `-- we will never DROP TABLE here` and `SELECT 'DROP TABLE x'` to prove no false positive;
   - `contract/` — an expand migration and a contract migration naming it via `-- aer:expanded-in`.
5. Concurrency check: run two `runMigrations` calls against one temp database from two Node worker
   threads (or two child processes) started together; assert exactly one row per migration in
   `schema_migration` and no unhandled `SQLITE_BUSY`.
6. Convention-linter check: build a throwaway manifest describing a deliberately non-conforming
   table, create it in the temp database, and assert `assertSchemaConventions` throws naming the
   violated PRD §35.1 rule.
7. §8 Q13 conformance check: assert every entry in `packages/database/migrations/` ends in `.sql`,
   and grep the two package manifests for a Drizzle dependency (must be absent).
8. Reviewer confirms the ADR file exists, has the five required sections, states `Accepted` with
   Kysely accepted and Drizzle rejected on Q13's grounds, does not describe the choice as open, and
   that `docs/prd/01-app-data/README.md`'s **D11** row points at it.

## Feedback obligation

1. **General rule.** If implementation falsifies this spec, update this ticket (and the sub-PRD, and
   the ADR if the decision moved) **first** — version +0.1 with a changelog line — then change code.
   Re-publish the issue with `publish-tickets.mjs --sync` so ticket and issue stay identical
   (CLAUDE.md, issue #53). Silent divergence counts as incomplete.
2. **Foreseeable frictions, each with its writeback target:**
   - *Raw `.sql` migration files prove unworkable* — e.g. the runner cannot execute a needed
     statement class from a checked-in file → this contradicts a **confirmed** decision (§8 Q13
     clause (c)) and would invalidate the plan §5.2 file-scope globs `*_tenancy.sql`,
     `*_execution.sql`, `*_research.sql`, `*_operations.sql` for four sibling tickets. Do not
     substitute another authoring format locally: write back to `docs/prd/breakdown-plan.md` §8 Q13
     **and** §5.2's file-scope column **and** `docs/prd/01-app-data/README.md` D2/D11 **and**
     `docs/adr/NNNN-sqlite-access-layer.md` before writing the first migration.
   - *Kysely's SQLite dialect cannot express something `DATA-02` needs, or cannot be kept
     package-private* → record it in the ADR's consequences and in
     `docs/prd/01-app-data/README.md` D11, and coordinate with `DATA-02` (whose SEC-001 architecture
     test depends on the handle staying private). Reversing clause (a) or (g) is a §8 Q13 writeback,
     not a local decision.
   - *Lexicographic ordering is insufficient* — e.g. a monotonic integer version is required →
     that falsifies plan §2.1 **A5** and re-serialises `DATA-04`…`DATA-07`. Escalate per layer 3;
     writeback target is `docs/prd/breakdown-plan.md` §2.1 A5 and §7 (the module's lane profile).
   - *The same-run contract rule proves unworkable* (e.g. deployment applies all migrations in one
     run by design, per PRD §39.7) → update this ticket's deliverable 6 and
     `docs/prd/01-app-data/README.md` D2, and record the alternative gate (a release-id header)
     there, not silently in `policy.ts`.
   - *`packages/contracts` does not expose enum values in a form usable for DDL generation* → do not
     hand-copy the values into `conventions.ts`. That would duplicate a serial-owned artifact
     (plan §4.1). Raise a `00-foundation` ticket against `FND-03` and add the `blocked_by` edge in
     `docs/prd/breakdown-plan.md` §5.1/§6.2.
   - *`better-sqlite3` cannot be built against the pinned Node.js `24.18.0` toolchain* → that
     touches plan §8 **Q12** as well as Q13. Record the evidence through this ticket's writeback and
     `FND-01`'s before any version is changed; developer preference is not a reason to move a pin.
   - *An exclusive migration lock cannot be held safely alongside Litestream* → update this ticket
     and notify `RLSE-05` through `docs/prd/01-app-data/README.md`'s cross-module table; add a new
     `docs/adr/NNNN-migration-locking.md` if the resolution is durable.
3. **Falsified decision.** If plan A5 (timestamp-prefixed, expand-only, concurrently authorable) or
   plan §8 **Q13** (Kysely-style repositories over `better-sqlite3`, raw `.sql` migrations, no
   Drizzle) is outright falsified, that overturns a decomposition-level or register-level decision:
   stop, escalate for re-review, and update `docs/prd/breakdown-plan.md` §2.1/§8 plus every affected
   sub-PRD before any code change. Never swap the approach silently inside this ticket, and never
   record a confirmed decision as if it were still open.
