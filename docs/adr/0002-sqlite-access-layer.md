# ADR 0002 — SQLite access layer: Kysely-style repositories over `better-sqlite3`

## Status

Accepted.

- **Owner:** `01-app-data`
- **Date:** 2026-08-08
- **Basis:** `docs/prd/breakdown-plan.md` §8 **Q13**; sub-PRD `docs/prd/01-app-data/README.md` **D11**
- **Number:** `0002` — the lowest unused four-digit number at implementation time; `0001` is
  `0001-local-pii-entity-runtime.md`.

Confirmed in [`docs/prd/breakdown-plan.md`](../prd/breakdown-plan.md) §8 **Q13** (decision register,
2026-08-03, owner `01-app-data`) and restated as decision **D11** of the
[`01-app-data` sub-PRD](../prd/01-app-data/README.md). This file was authored at implementation time
by the `DATA-01` Builder, which records the decision — it does not make it.

PRD §45.5 classifies a durable technology/dependency trade-off as an *Architecture decision*, which
"requires an ADR under `docs/adr/` and compatibility/security review". This record therefore carries
that review.

## Context

PRD §18.2 names the stack but leaves the mutable-database row as an either/or:

> SQLite (`better-sqlite3`) with Drizzle or Kysely-style migrations/repositories

PRD §35.1 is the storage and type contract every table group must satisfy:

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

The choice was not made in a vacuum. By the time it was taken, the project had already fixed the
constraints that decide it, and those constraints — not a library preference — are the grounds:

- **PRD §44.3** makes **app migration order** a serial-owned artifact, alongside root lockfiles, the
  canonical enums, the OpenAPI root and the corpus schema/manifest.
- **Breakdown plan §2.1 A5** and sub-PRD **D2** fix the authoring format and the ordering: migrations
  are timestamp-prefixed, expand-only, checked-in `.sql`, ordered lexicographically, and
  independently authorable by four table-group tickets at once.
- **PRD §20.4** requires expand/contract migrations with background backfills, and **PRD §39.7 step
  4** makes that enforceable per release: "destructive/contract changes are not permitted in the
  same release that removes old readers."
- **PRD §23.1** forces a confirmed recovery point before migrations, so a migration entry point has
  a precondition that no general-purpose migration tool knows about.
- **PRD §35.1** requires enum CHECK constraints *generated from* `packages/contracts` (`FND-03`), so
  the canonical enum values already have exactly one owner outside the database layer.
- **PRD §15.4/§35.1** require composite tenant foreign keys, and **PRD §35.8** adds eight database
  invariants that are expressed as constraints, triggers and indexes.
- **PRD §16.5/§21.2** and **SEC-001** require every database access to be tenant-scoped.

`app.sqlite` (PRD §18.3) is the mutable database this governs: identity, organisations, Research
Records, jobs, audit and usage. It is opened concurrently by `apps/api`, `apps/worker` and Litestream
(PRD §39.1/§39.4), and SQLite permits exactly one writer.

## Decision

1. **(a)** Kysely-style repositories and query construction, using Kysely's SQLite dialect over
   `better-sqlite3`.
2. **(b)** Drizzle is **not** used in the application database layer.
3. **(c)** Raw `.sql` files checked into git remain the **only** migration authoring format.
4. **(d)** This project's own forward-only expand/contract migration runner —
   `packages/database/src/migrate/**`, delivered by `DATA-01` — owns migration ordering, checksums,
   locking, recovery-point enforcement and the expand/contract policy.
5. **(e)** Kysely owns typed application queries and repositories only. It neither generates nor owns
   schema migrations.
6. **(f)** Constraints, composite tenant foreign keys, triggers, CHECK constraints, temporal rules
   and indexes stay expressed explicitly in SQL.
7. **(g)** Application code reaches the database only through tenant-scoped repositories. An unscoped
   Kysely instance or `better-sqlite3` handle must never be spread into feature modules.

## Alternatives considered — Drizzle (rejected)

Drizzle is the alternative PRD §18.2 offers, and it is rejected.

Drizzle's centre of gravity is schema-first TypeScript table definitions plus generated migrations.
Here the schema is authored as checked-in `.sql` under a serial-owned order (PRD §44.3), with
per-file checksums, an exclusive write lock, a forced recovery point and an expand/contract gate that
a generator does not own. The generation half of Drizzle would therefore be unused or in direct
contention with the runner, and the schema half would become a **second source of truth** standing
beside the `.sql` files and beside `packages/contracts`' generated enum CHECK values — the exact
duplication PRD §44.3's serial ownership exists to prevent.

Kysely's remit is narrower and matches the boundary the project already has: typed queries over a
schema it does not own. That leaves the constraints, composite tenant foreign keys, triggers and
temporal rules of PRD §35.8 where they have to be — in SQL — while still giving repositories a typed
query surface.

This section records a settled decision. It is not an open comparison and is not a recommendation.

## Consequences

1. **(i)** Migration authoring stays raw `.sql`. Breakdown plan §5.2's file-scope globs
   `*_tenancy.sql`, `*_execution.sql`, `*_research.sql` and `*_operations.sql` and sub-PRD **D2**'s
   filename policy hold unchanged, and `DATA-04`…`DATA-07` are unaffected by this ADR.
2. **(ii)** No third-party migration tool, CLI or generator is introduced. `DATA-01`'s deliverables
   3–7 are the whole migration mechanism: `runner.ts`, `naming.ts`, `policy.ts`, `pragmas.ts` and the
   `0001_baseline.sql` ledger.
3. **(iii)** The Kysely database-type surface is **maintained alongside** the `.sql` schema, not
   generated from it. Drift is therefore caught mechanically rather than by review: by
   `assertSchemaConventions` (`DATA-01` deliverable 10), which walks `sqlite_master` and
   `pragma table_info` and compares each enum CHECK's value set against
   `packages/contracts`, and by the `TableManifest` glob (deliverable 9) that requires every table
   group to declare its tables in `src/schema/<group>.ts`.
4. **(iv)** For `DATA-02`, the Kysely instance and the `better-sqlite3` handle are package-private:
   the `packages/database` `exports` map exposes neither, and the SEC-001 architecture test forbids
   importing `kysely` or `better-sqlite3` anywhere outside `packages/database`.
5. **(v)** `kysely` and `better-sqlite3` become declared dependencies of `packages/database` and
   therefore enter the PRD §21.1 SBOM and vulnerability gate. `DATA-01` declares `better-sqlite3`
   only; `kysely` is declared by `DATA-02`, which introduces the query surface — an unused declared
   dependency in the SBOM is worse than a late one.
6. **(vi)** `better-sqlite3` is a native module and must work against the Node.js `24.18.0`
   toolchain pinned by breakdown plan §8 **Q12**. **Verified version pair:** `better-sqlite3`
   `13.0.3` (bundled SQLite `3.53.4`, N-API ABI `137`) against Node.js `24.18.0` and pnpm `11.4.0`,
   on `win32-x64`, installed and smoke-tested at implementation time. The version is pinned exactly,
   never floated: moving it is a §8 Q12 writeback, not a preference.

   13.x declares **no** `install`/`postinstall` script and ships N-API prebuilds inside its own
   tarball (`linux-x64`, `linux-arm64`, `linuxmusl-x64`, `linuxmusl-arm64`, `darwin-x64`,
   `darwin-arm64`, `win32-x64`, `win32-arm64`), so a normal install neither compiles anything nor
   fetches a binary over the network. pnpm 11 still stops on it, because a package carrying a
   `binding.gyp` counts as build-capable and `strictDepBuilds` defaults to true: an install that
   neither allows nor denies it exits `ERR_PNPM_IGNORED_BUILDS`. The workspace therefore carries
   `allowBuilds: { better-sqlite3: false }` in the root `pnpm-workspace.yaml` — deny the source
   build, use the shipped prebuild. `true` would put a C++ toolchain on the critical path of every
   developer machine and CI runner for no gain.

   That key is the one root-file change `DATA-01` makes, and it is outside the ticket's stated
   file-scope. It is recorded here rather than quietly: it is a mechanical consequence of declaring
   the dependency, in the same class as the regenerated `pnpm-lock.yaml` the ticket already
   anticipates, and without it no install in this repository can produce a working
   `packages/database`. If `00-foundation` would rather own it, the fix is to move the key, not to
   remove it.

   The equally-viable alternative, `better-sqlite3@12.11.1` with `allowBuilds: true`, was measured
   and rejected: 12.x runs `prebuild-install` from an `install` script, which reaches GitHub releases
   over the network at install time and falls back to `node-gyp` when that fetch fails. 13.x needs
   neither.
7. **(vii)** Triggers, CHECK constraints and composite tenant foreign keys stay in SQL, which is what
   keeps PRD §35.8 invariants 4 and 5 **structural** rather than conventional. `DATA-02` deliverable
   5, `DATA-06` and `DATA-09` depend on that.
8. **(viii)** `packages/database` is the first workspace member to declare a real dependency.
   `tools/tests/skeleton.test.mjs` no longer forbids that — `FND-04` replaced the old
   "declares no dependency beyond the toolchain" snapshot with "pins every member dependency to an
   exact version, with no range" — so the manifest carries `better-sqlite3` `13.0.3` and
   `@types/better-sqlite3` `9.6.0`, both exact.

   `@types/better-sqlite3` is the only devDependency, and it earns its place twice over: it types the
   driver, and its `types="node"` reference pulls a pinned `@types/node` into this package's
   resolution, so `src/migrate/**` needs no hand-written ambient shim for `node:fs`, `node:crypto`,
   `node:path`, `node:module`, `node:url` or `node:perf_hooks`. `@types/node` is deliberately **not**
   declared here: a second copy alongside the transitively-resolved one risks duplicate identifiers,
   and a repo-wide `@types/node` is `03-app-runtime`'s to decide. The types are generated against
   `better-sqlite3` 9.x, so an API added after 9.x is untyped; the whole surface this package uses
   (`new Database(path, { timeout })`, `.pragma`, `.exec`, `.prepare`, `.transaction(fn).immediate()`,
   `.close()`) predates it. Widen with a narrow local declaration if that ever bites — never with
   `any`, which ESLint rejects anyway.

   `packages/database/src/migrate/contracts.ts` is the single import boundary to
   `packages/contracts`, using a **relative** specifier (`../../../contracts/src/enums/index.js`)
   rather than a `@taxrag/contracts` workspace link — the `packages/observability/src/contracts.ts`
   and `packages/domain/src/legal/contracts.ts` precedent. `FND-01` asserts every member's
   `src/index.ts` is byte-for-byte `export {};`, so the package specifier resolves to nothing at type
   level or at runtime. When `00-foundation` adds an `exports` map to `packages/contracts`, that one
   file changes; the `exports` map consequence (iv) describes for `packages/database` is the same
   mechanism.
9. **(ix)** With no build step and no `compilerOptions` permitted in a member `tsconfig.json`
   (`FND-01`), a runnable TypeScript entry point needs a `.js` → `.ts` resolution bridge:
   `packages/database/src/migrate/ts-resolve.ts` installs a `node:module` `registerHooks` resolve
   hook, which `src/migrate/cli.mjs` and `discoverTableManifests` both call. It is local, explicit
   (never an import side effect) and reversible, and adds no dependency. If a second package needs
   the same bridge — `apps/api` and `apps/worker` will — it should become a `00-foundation`
   decision rather than a copied idiom.
10. **(x)** `discoverTableManifests` is declared **synchronous** (deliverable 9), and it loads
    `src/schema/*.ts` through `createRequire(...)` under Node 24's native type stripping. That binds
    `DATA-04`…`DATA-07`: a file in `src/schema/` must use only **type-strippable** TypeScript — no
    `enum`, no `namespace`, no constructor parameter properties — and must write `import type`
    explicitly, which `verbatimModuleSyntax` already forces. A schema file that breaks the rule fails
    discovery at load, not at review.
11. **(xi)** **Locking granularity.** Each migration is applied inside its own `BEGIN IMMEDIATE`
    transaction, together with its ledger row (ticket deliverable 4, "apply each pending migration
    inside its own transaction"). The write lock is therefore held for one migration at a time rather
    than for a whole run, which is what keeps a long migration set compatible with Litestream and the
    api/worker connections that share `app.sqlite` (PRD §39.1/§39.4). The trade-off is deliberate and
    is the thing to revisit first if it proves wrong: a run that fails at migration *N* leaves
    migrations 1…*N*−1 committed, so a release is atomic per migration, not per release. Recovery is
    forward-only — add a new migration — which is the same discipline PRD §20.4 already imposes.
    `RLSE-05` inherits this as a decision rather than a surprise; if an exclusive whole-run lock ever
    turns out to be required, that is a new `docs/adr/NNNN-migration-locking.md`, not a local change.
12. **(xii)** **The same-run contract gate refuses, it does not defer.** A `-- aer:phase contract`
    migration whose `-- aer:expanded-in` target was applied by the current `run_id` raises
    `CONTRACT_IN_SAME_RUN` and stops the run. Because each migration commits in its own transaction
    (xi), the expand it names has already landed, so the very next invocation — a different `run_id` —
    applies the contract migration cleanly. This is the mechanical form of PRD §39.7 step 4, and its
    operational consequence is explicit: a release that ships an expand and its contract together
    needs `db:migrate` run twice. If a deployment must apply everything in one invocation, the
    alternative gate is a release-id header rather than `run_id`, and that is a ticket writeback to
    `DATA-01` deliverable 6 and sub-PRD **D2** — not a quiet change in `policy.ts`.
