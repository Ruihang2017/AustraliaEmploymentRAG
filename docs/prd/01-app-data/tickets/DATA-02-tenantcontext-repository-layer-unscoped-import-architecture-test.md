---
id: DATA-02
title: TenantContext repository layer + unscoped-import architecture test
module: 01-app-data
lane: 01-app-data
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [DATA-01, FND-06]
blocks: [DATA-04, RUNT-02, EVID-07, ASSR-01]
---

# DATA-02 — TenantContext repository layer + unscoped-import architecture test

Implements PRD §16.5, §21.2 and §35.1 — requirement **SEC-001** (`E04-APPDB`). No ADR is authored
here — the decision is already made in PRD §16.5/§21.2 and plan §2.1 A3, and the access layer this
ticket is built on is settled by breakdown-plan §8 **Q13** (confirmed architecture decision), whose
ADR decision input is carried by `DATA-01`; this is build ticket 2 of 9 against those decisions.
Parent sub-PRD: [01-app-data README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [DATA-01 — Migration framework, expand/contract policy, ordering](DATA-01-migration-framework-expand-contract-policy-ordering.md)
· `FND-06` — "Domain: role/permission matrix and resource membership", module `docs/prd/00-foundation`.
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed
contract (PRD §16.5's request flow and SEC-001's stated acceptance evidence) — not a new subsystem
decision.

## Background + basis

SEC-001 in the PRD §30.2 register is unusually prescriptive: it names not only the behaviour but
the acceptance evidence.

> | SEC-001 | Every tenant repository requires `TenantContext` | All tenant routes/jobs | internal
> repository API | App | **Static/architecture test forbids unscoped repository import** |

**PRD §16.5** fixes the order of operations and the not-found rule:

> Request flow MUST be authenticate → resolve organisation → verify membership/service account →
> evaluate permission → perform tenant-scoped lookup. Other-tenant and absent opaque IDs return the
> same not-found response. **Business modules MUST use TenantContext-scoped repositories rather
> than raw/unscoped database connections.**

**PRD §21.2** adds the isolation controls and the break-glass path:

> All tenant access is TenantContext-scoped. Use organisation-scoped keys and composite foreign
> keys where feasible. Authorise before lookup. Cross-organisation internal access uses a separate
> recent-MFA, reason-required, audited path. Automated tests MUST cover read/write/delete/export/
> download and queued-job tenant attacks.

**PRD §15.4**: *"Every tenant-owned row MUST include `organization_id`. Organisation-scoped
composite keys/foreign keys MUST prevent cross-tenant relationships where feasible."*
**PRD §35.8 invariant 4**: *"Tenant child rows cannot point to another tenant's parent rows."*
**PRD §35.1**: *"Every tenant-owned unique key includes `organization_id` unless the key is a
globally random primary ID and a composite tenant foreign key provides the boundary."*
**PRD §34.9** fixes the error shape: `404 RESOURCE_NOT_FOUND` — *"Check ID; same response for
forbidden/other tenant"*. `UAT-AUTH-03` states the human-visible form: *"Same 404 shape/timing class
as unknown ID; audit records denied lookup safely."*
**PRD §45.2** assigns the ownership: `packages/database` owns "app schema/migrations/tenant
repositories/outbox/encryption"; `apps/worker` must not own "Direct unscoped tenant SQL".

**Plan §2.1 A3** is the decomposition decision this ticket exists to make enforceable:

> **`packages/database` owns every app table and repository**; product modules own routes/handlers/
> screens only. Removes the otherwise-real `15-answer-product` ↔ `17-records-collab` module cycle …
> Matches PRD §45.2 verbatim.

**Plan §8 Q13 fixes the access layer this repository layer is built from, and its last clause is a
restatement of this ticket's own guarantee.** The decision is confirmed, not a choice to be made
here:

> - Kysely-style repositories and query construction, using Kysely's SQLite dialect over
>   `better-sqlite3`.
> - Drizzle is not used in the application database layer.
> - Kysely owns typed application queries and repositories only. It neither generates nor owns
>   schema migrations.
> - Constraints, composite tenant foreign keys, triggers, CHECK constraints, temporal rules and
>   indexes stay expressed explicitly in SQL.
> - Application code reaches the database only through tenant-scoped repositories; an unscoped
>   Kysely or database handle must never be spread into feature modules.

So this ticket's repositories are Kysely-typed query builders wrapped by the tenant-scoping factory,
the schema they query is the raw `.sql` schema `DATA-01`…`DATA-07` author (nothing here defines or
migrates a table), and the architecture test in deliverable 9 is the mechanical enforcement of Q13's
last clause as well as of SEC-001. `DATA-01` records the decision in
`docs/adr/NNNN-sqlite-access-layer.md`; that ADR is authored at `DATA-01`'s implementation time and
does not exist yet, so read plan §8 Q13 and sub-PRD **D11** as the authority until it lands.

`FND-06` (`packages/domain/src/access/**`) supplies the framework-free permission decisions
(PRD §38.1 role matrix). This ticket consumes that decision — it does not re-implement permission
logic (PRD §45.2: `packages/domain` owns "Pure permissions, state transitions, evidence/budget
rules"; `apps/api` must not own "Duplicated business rules").

Accepted caveats, carried forward explicitly:

- SQLite has no row-level security. Scoping is therefore an *application* boundary made
  unavoidable by construction (private connection + repository factory + package `exports` map +
  static test), not a database feature. That is exactly what SEC-001's stated evidence asks for.
- Kysely does not enforce tenancy either. Its typed query construction is a correctness aid, not a
  security boundary; the boundary is the factory plus the `exports` map plus the static test. A
  typed query is still rejected by `assertTenantScoped` if it lacks the predicate.
- The "same timing class" half of `UAT-AUTH-03` is not fully decidable at the repository layer;
  this ticket guarantees the same *code path and error value* for other-tenant and absent ids, and
  `ASSR-01` owns the end-to-end timing-class assertion.

## Goal

Produce `packages/database/src/tenant/**` such that a business module physically cannot obtain an
unscoped database handle: the raw `better-sqlite3` connection and the Kysely instance built over it
are private to the package, every repository is built by a factory that requires a `TenantContext`,
every generated statement carries an `organization_id` predicate (or is rejected), other-tenant and
absent ids collapse to one indistinguishable not-found result, and cross-tenant writes are blocked
by a composite-FK helper the table-group tickets use. Ship the SEC-001 static/architecture test in
`packages/database/test/architecture/**`, proven by a deliberately violating fixture that makes it
fail. Also ship the two seams later tickets depend on: `withTenantTransaction` (so `ASK-01` can
create a record and admit a job in one transaction, PRD §34.3) and `registerPreCommitInvariant`
(so `DATA-09` can enforce PRD §35.8 without owning a migration).

## Non-goals

- **No tables and no migrations.** `DATA-04` (tenancy), `DATA-05` (execution), `DATA-06` (research),
  `DATA-07` (operations) own the schema and the concrete repositories. This ticket ships the factory
  and the helpers they use. Per plan §8 Q13, Kysely never generates or owns schema — the `.sql`
  files stay the authoring format.
- **No authentication, sessions, MFA or credential verification.** `02-auth-core`
  (`AUTC-01`…`AUTC-05`). A `TenantContext` is *constructed from* an already-authenticated principal.
- **No permission matrix.** `FND-06` owns `packages/domain/src/access/**`; this ticket calls it.
- **No HTTP middleware.** `RUNT-02` owns `apps/api/src/{plugins,middleware}/**` and is `blocked_by`
  this ticket; it maps an authenticated request to `TenantContext` and maps the not-found value to
  `404 RESOURCE_NOT_FOUND`.
- **No audit table.** `DATA-07` owns `audit_event`. The break-glass path here emits a callback; it
  does not write a table that does not yet exist.
- **No cross-boundary attack suite.** `ASSR-01` owns `tests/tenant-isolation/**` (PRD §20.1) and is
  `blocked_by` this ticket. The co-located tests here are the repository-level half required by
  PRD §45.4.
- **No encryption.** `DATA-03` owns `src/crypto/**`; repositories accept its codec.
- **No access-layer ADR.** `DATA-01` writes `docs/adr/NNNN-sqlite-access-layer.md` recording plan §8
  Q13. This ticket consumes that decision and must not re-open it.

## File-scope (write-owns)

- `packages/database/src/tenant/**`
- `packages/database/test/architecture/**`
- `packages/database/test/tenant/**` (this ticket's own additional test area, sub-PRD D8)
- `packages/database/package.json` — append-only (add the `exports` map entries and any dependency,
  including `kysely`; sub-PRD D9, plan §1.1)
- `pnpm-lock.yaml` — the mechanical artifact of the authorised `kysely` declaration above, regenerated
  by `pnpm install` and never hand-edited (v0.4)
- `packages/database/test/migrate/q13-conformance.test.ts` — **one line only** (v0.4): that file
  (`DATA-01`'s) asserts the package's declared dependency set *exactly*, and its own comment
  anticipates this ticket — *"Kysely is not a dependency of this package: DATA-02, not DATA-01,
  introduces it."* Declaring `kysely`, which this ticket is required to do, therefore falsifies that
  assertion, and `pnpm test` green is an acceptance item here. `DATA-02` adds `'kysely'` to the
  expected sorted array, keeping it an exact-set check; weakening the assertion, deleting it, or
  importing `kysely` undeclared are all forbidden. No other line of `test/migrate/**` may be touched.

- Does not touch: `packages/database/src/migrate/**` and `migrations/0001_*` (`DATA-01`) ·
  `src/crypto/**` (`DATA-03`) · `src/schema/*.ts`, `src/repos/**` and every `*_<group>.sql`
  migration (`DATA-04`–`DATA-07`) · `src/ephemeral/**` (`DATA-08`) · `src/invariants/**` and
  `test/invariants/**` (`DATA-09`) · `packages/jobs/**` (`DATA-05`) · `packages/domain/**`
  (`FND-06`) · `packages/contracts/**` (`FND-03`) · `docs/adr/**` (`DATA-01` owns the access-layer
  ADR) · `apps/**` (`03-app-runtime` and the product modules) · `tests/**` (`23-assurance`).

**Serial safety.** First decomposition — nothing merged, nothing in flight, no prior toucher. The
sibling that can run concurrently with this ticket is `DATA-03` (wave 2, `src/crypto/**`); the two
scopes share no path. `DATA-01` is merged before this starts (`blocked_by`). `DATA-04`…`DATA-09` are
all downstream. `packages/database/package.json` is the one shared file inside the module and is
append-only by sub-PRD D9; a conflict there resolves by re-running pnpm, never by hand-merge
(PRD §44.3). Migrations are timestamp-prefixed and expand-only (plan A5) so independent table
groups never serialise on this ticket.

## Deliverables

**Amendment (2026-08-11, `DATA-02` implementation + review round 1; sub-PRD v0.4).** Four corrections,
each marked *v0.4* where it applies: (a) deliverable 6's signature is `withTenantTransaction(db, ctx,
fn)`, not `(ctx, fn)` — deliverable 1 forbids the ambient handle a two-argument form would need; (b)
deliverable 6 also ships `withSystemTransaction`, without which deliverable 3's `GLOBAL` repositories
have an `insert` that exists on the type and at runtime but can never succeed — a dead path `DATA-06`
is due to depend on; (c) deliverable 8 states the grant/refusal asymmetry explicitly and makes a
`*_GRANTED` audit failure fail closed; (d) the File-scope names the two consequential paths outside
`src/tenant/**` that the authorised `kysely` declaration forces (`pnpm-lock.yaml` and a one-line
expected-dependency-set update in `DATA-01`'s `q13-conformance.test.ts`) rather than leaving them as
undeclared out-of-scope edits.

1. **Connection factory (private).** `packages/database/src/tenant/connection.ts` exporting
   `openAppDatabase(options)` for **package-internal use only**: opens `better-sqlite3`, applies
   `APP_SQLITE_PRAGMAS` from `DATA-01`'s `src/migrate/pragmas.ts` (do not restate them), calls
   `assertSchemaUpToDate`, and constructs the single package-private `Kysely` instance over the
   `SqliteDialect` (plan §8 Q13). The package's `exports` map in `packages/database/package.json`
   must not expose this module, the `better-sqlite3` handle, the `Kysely` instance, or any path that
   returns one of them. Public entry points expose repositories, `TenantContext` factories and
   codecs only.
2. **`TenantContext`.** `packages/database/src/tenant/context.ts`:
   ```ts
   export type ActorType = 'USER' | 'SERVICE_ACCOUNT' | 'SYSTEM'
   export interface TenantContext {
     readonly organizationId: string
     readonly actorId: string
     readonly actorType: ActorType
     readonly permissions: PermissionSet          // from packages/domain (FND-06)
     readonly requestId: string
     readonly elevation?: CrossTenantElevation    // present only on the break-glass path
   }
   ```
   Constructed **only** through named factories — the type has no public constructor and no
   mutable fields:
   - `tenantContextFromSession(principal, organizationId, requestId)` — the PRD §16.5 flow;
   - `tenantContextFromJobLease(job, requestId)` — worker re-authorisation (PRD §18.5 step 3:
     "Worker leases the job … and reauthorises actor, tenant, resource and budget");
   - `systemContext(scope, requestId)` — for `GLOBAL`-scoped tables only (e.g. `detected_change`,
     PRD §35.6 "global public-source event, not tenant content"); it cannot read or write a
     `TENANT`-scoped table;
   - `crossTenantElevatedContext({ organizationId, actorId, reason, incidentId, recentAuthAt, requestId })`
     — the PRD §21.2 break-glass path. Requires a non-empty `reason`, an `incidentId` and a
     `recentAuthAt` within a configured window; otherwise it throws. It invokes the audit callback
     (deliverable 8) synchronously before returning.
3. **Repository factory.** `packages/database/src/tenant/repository.ts` exporting
   `defineTenantRepository<T>(spec)` where `spec` names the table and its `TableSpec` (from
   `DATA-01`'s `manifest.ts`). Queries are constructed with the package-private Kysely instance from
   deliverable 1 (plan §8 Q13); the Kysely instance is never a parameter a caller can supply.
   Guarantees:
   - every generated read/write/delete carries `organization_id = :ctx.organizationId`;
   - a hand-written statement passed through the repository is checked by
     `assertTenantScoped(sql, params)` and rejected when the predicate or the bound
     `organization_id` is missing/mismatched — this applies equally to a compiled Kysely query, so a
     typed query is not exempt from the check;
   - the factory refuses at construction time to build a repository for a `TENANT`-scoped table
     whose `TableSpec.requiredColumns` lacks `organization_id` (PRD §15.4);
   - a repository for a `GLOBAL`-scoped table requires a `systemContext` and rejects a tenant
     context (and vice versa). A `GLOBAL` repository is **writable**: its `insert` runs inside
     `withSystemTransaction` (deliverable 6), which is the seam `DATA-06` uses to write
     `detected_change` (PRD §35.6). A write path that exists on the type but cannot succeed at
     runtime is not an acceptable shape here;
   - `mutability: 'IMMUTABLE' | 'APPEND_ONLY'` removes `update`/`delete` from the produced type —
     these must be *absent from the API*, not merely throwing (PRD §35.8 invariant 5, REC-001).
4. **Indistinguishable not-found.** `packages/database/src/tenant/errors.ts` exporting
   `ResourceNotFound` carrying only the resource kind — never the requested id, never the owning
   organisation. Other-tenant and absent ids take the **same code path**: the query is
   `WHERE id = ? AND organization_id = ?`, so the two cases are not distinguishable inside the
   repository at all. `RUNT-02`/`apps/api` maps it to `404 RESOURCE_NOT_FOUND` (PRD §34.9, §16.5).
5. **Composite tenant foreign keys.** `packages/database/src/tenant/keys.ts` exporting
   `tenantForeignKey({ childTable, parentTable, column })` producing
   `FOREIGN KEY (organization_id, <column>) REFERENCES <parent>(organization_id, id)` plus the
   parent-side `UNIQUE (organization_id, id)` it requires, and `tenantUnique(columns)` which
   prepends `organization_id` (PRD §35.1, §15.4). These emit SQL text for the table-group tickets'
   hand-authored `.sql` migrations — under plan §8 Q13 constraints and composite tenant foreign keys
   stay expressed explicitly in SQL, and nothing here generates a migration. `DATA-04`…`DATA-07` use
   these; PRD §35.8 invariant 4 is then structural, not conventional.
6. **Transaction helper.** `withTenantTransaction(db, ctx, fn)` — the connection handle is the first
   argument (v0.4 correction; the earlier wording was `withTenantTransaction(ctx, fn)`). Deliverable 1
   makes the connection package-private and deliberately *not* a module-level singleton, so a
   two-argument form would have to find an ambient handle — reintroducing exactly the global handle
   this ticket exists to abolish. The `AppDatabaseHandle` is not on the `./tenant` public surface, so
   this argument adds no reachable surface outside `packages/database`; the intended consumer shape is
   that `DATA-04`…`DATA-07` export concrete, pre-bound repositories and transaction entry points, and
   `RUNT-02` consumes those rather than this factory. Same correction for
   `TenantRepositoryDefinition.for(db, ctx)`.
   Alongside it, **`withSystemTransaction(db, systemCtx, fn)`**: the identical machinery for a
   `systemContext`, so a `GLOBAL`-scoped repository's `insert` is reachable (deliverable 3,
   `detected_change`, PRD §35.6). `withTenantTransaction` refuses a `systemContext` and
   `withSystemTransaction` refuses a tenant context; the two never nest inside one another, and
   elevation does not bridge them (elevation is a cross-*organisation* grant, not a cross-*scope* one).
   Both:
   - opens `BEGIN IMMEDIATE` on the single writer connection; nested calls use savepoints;
   - passes an opaque `Tx` handle that repositories require for writes, so a caller can compose
     record creation + job admission + outbox in **one** transaction — PRD §34.3: *"Creating a
     record and admitting the job occur in the same transaction"*; PRD §18.5 step 2 and step 6.
     The handle must not expose the underlying Kysely instance or `better-sqlite3` connection;
   - refuses to mix two `organizationId` values in one transaction unless the context is elevated;
   - runs the pre-commit invariant hooks (deliverable 7) inside the transaction, before commit;
   - retries on `SQLITE_BUSY` up to the configured `busy_timeout` and surfaces a typed error after.
7. **Pre-commit invariant registry.** `registerPreCommitInvariant(id, fn)` and
   `listPreCommitInvariants()`. Hooks receive `(tx, ctx, changeSet)` and throw to abort. This is the
   seam `DATA-09` uses to enforce PRD §35.8 without owning a migration (sub-PRD D5). Registration is
   idempotent by `id`; a duplicate id is an error.
8. **Audit callback seam.** `setTenantAuditSink(fn)` / default no-op-with-warning. The break-glass
   factory and every rejected cross-tenant access emit
   `{ event, actorId, organizationId, requestId, reason?, incidentId? }`. `DATA-07` wires the real
   `audit_event` writer later; nothing here writes a table.
   **Asymmetric failure handling, by design (v0.4).** A sink that throws while recording a *refusal*
   must not convert that refusal into a different failure or unwind before the caller's own throw, so
   those sink errors are contained and warned. A sink that throws while recording a `*_GRANTED` event
   fails **closed**: `crossTenantElevatedContext` propagates the failure and grants nothing, because a
   cross-organisation elevation that is granted while its audit record is silently lost is precisely
   the outcome PRD §21.2's "audited path" exists to prevent. `DATA-07` owns the durable sink and
   inherits this contract — see `docs/prd/01-app-data/README.md` D5's neighbouring note.
9. **SEC-001 architecture test.** `packages/database/test/architecture/no-unscoped-access.test.ts`:
   statically scans the repository's source tree (read-only file walk from the repo root, skipping
   `node_modules`, `dist` and `packages/database/src/**` itself) and fails when any file outside
   `packages/database` imports `better-sqlite3`, imports `kysely` (or any `kysely/*` subpath),
   imports a deep path into `packages/database/src/tenant/connection*`, or reaches
   `packages/database/src/**` other than through the package's public entry. Forbidding `kysely`
   outside the package is plan §8 Q13's last clause — "an unscoped Kysely or database handle must
   never be spread into feature modules" — made mechanical. It must also assert the package
   `exports` map exposes neither the connection module nor any Kysely instance. Ship a
   `fixtures/violation.ts.txt` sample that the test is run against in a negative case, proving the
   test fails when a violation exists; include an unscoped-`kysely`-import variant.

## Acceptance checklist (classified)

- [ ] `[machine]` **SEC-001**: the architecture test passes on the current tree and **fails** when
      the violating fixture is placed outside `packages/database` (PRD §30.2 SEC-001 minimum
      acceptance evidence: "Static/architecture test forbids unscoped repository import")
- [ ] `[machine]` The architecture test also fails on a file outside `packages/database` that
      imports `kysely` or `better-sqlite3` directly (plan §8 **Q13**: an unscoped Kysely or database
      handle must never be spread into feature modules; sub-PRD D11)
- [ ] `[machine]` The package `exports` map does not expose `src/tenant/connection*`, the raw
      `better-sqlite3` handle, the `Kysely` instance or any `src/**` deep path; a test asserts the
      exported surface set (PRD §16.5, plan §8 Q13)
- [ ] `[machine]` `defineTenantRepository` on a `TENANT` table produces no callable that can run
      without a `TenantContext` (type-level test plus a runtime throw for JS callers)
- [ ] `[machine]` Cross-tenant matrix — for read, write, delete and list: organisation B's context
      accessing organisation A's row yields the **same** `ResourceNotFound` value as a
      never-existing id, and the error payload contains no id or organisation (PRD §16.5, §21.2,
      AUTH-002)
- [ ] `[machine]` `assertTenantScoped` rejects a statement with no `organization_id` predicate and a
      statement whose bound `organization_id` differs from the context, including when the statement
      came from a compiled Kysely query (PRD §21.2)
- [ ] `[machine]` A `GLOBAL`-scoped repository refuses a tenant context and a `TENANT`-scoped
      repository refuses `systemContext` (PRD §35.6 `detected_change` is a global public-source
      event)
- [ ] `[machine]` A `GLOBAL`-scoped repository can actually **write**: an `insert` inside
      `withSystemTransaction` commits and is readable, a `GLOBAL` write inside a *tenant* transaction
      is refused with `SCOPE_MISMATCH`, and a `TENANT` write inside a system transaction likewise —
      no member of a produced repository is unreachable at runtime (v0.4)
- [ ] `[machine]` `tenantForeignKey` DDL makes a cross-tenant child insert fail at the database
      level with `foreign_keys = ON` (PRD §35.8 invariant 4, §15.4)
- [ ] `[machine]` `IMMUTABLE`/`APPEND_ONLY` repositories expose no `update`/`delete` member at all
      (compile-time assertion), not merely a throwing one (PRD §35.8 invariant 5)
- [ ] `[machine]` `withTenantTransaction` commits a multi-repository write atomically; a throw
      inside the callback leaves **no** row from any participating repository (PRD §34.3, §18.5)
- [ ] `[machine]` `withTenantTransaction` refuses two different `organizationId` values in one
      transaction unless elevated; nested calls use savepoints and roll back independently
- [ ] `[machine]` A registered pre-commit invariant that throws aborts the transaction; duplicate
      registration by id is an error; `listPreCommitInvariants` is stable (sub-PRD D5, consumed by
      `DATA-09`)
- [ ] `[machine]` `crossTenantElevatedContext` throws without `reason`, without `incidentId`, or
      with `recentAuthAt` outside the window, and emits exactly one audit callback on success
      (PRD §21.2 "recent-MFA, reason-required, audited path")
- [ ] `[machine]` A throwing audit sink does not swallow a *refusal*, and **does** fail a grant: a
      sink that throws on `CROSS_TENANT_ELEVATION_GRANTED` makes `crossTenantElevatedContext` throw
      and return no context (deliverable 8, PRD §21.2)
- [ ] `[machine]` Permission evaluation is delegated to `packages/domain` (`FND-06`) — a test
      asserts no role/permission table is re-declared in this package (PRD §45.2)
- [ ] `[machine]` Concurrency: two `withTenantTransaction` calls writing the same row from two
      connections produce one committed result and one typed busy/conflict error, never a lost
      update (SQLite single-writer, PRD §39.1/§39.4)
- [ ] `[machine]` `pnpm test` green
- [ ] No `[fixture]` criteria — no recorded source or evaluation data is replayed here
      (PRD §40.8 fixtures belong to the ingestion/source modules)
- [ ] No `[human]` criteria — `UAT-AUTH-03` ("Researcher guesses another tenant's record ID") is a
      PRD §41.2 manual script executed by `23-assurance` (`ASSR-01`), which is `blocked_by` this
      ticket
- [ ] No Rust or Python is touched, so `cargo test --workspace` and `uv run pytest` are not required
      (PRD §45.3)

## Test plan

Offline; no network, credentials or services.

1. `pnpm test` at the repository root; focused run with
   `pnpm --filter <the packages/database package name> test`.
2. Reuse `withTempDatabase` from `packages/database/test/migrate/helpers.ts` (`DATA-01`) — copy that
   construction pattern rather than inventing a second harness.
3. Because no application table exists yet, the repository tests run against **two throwaway
   tables** created inside the test's temp database by the test itself: `t_parent` (tenant-scoped,
   mutable) and `t_child` (tenant-scoped, append-only, composite FK to `t_parent`), each described by
   a hand-built `TableSpec`. This keeps the ticket independent of `DATA-04`…`DATA-07` and is the
   pattern those tickets extend.
4. Cross-tenant matrix: seed org `A` and org `B` rows; for each of read/write/delete/list assert the
   returned error is `deepStrictEqual` between "other tenant's id" and "id that never existed".
5. Architecture test negative case: copy `fixtures/violation.ts.txt` to a temp path **inside the
   scanned tree but outside `packages/database`**, run the scanner, assert it reports that file, and
   remove it. Repeat with the unscoped-`kysely`-import variant. The test must not leave the file
   behind on failure (use a `finally`).
6. Concurrency: two `better-sqlite3` connections from two worker threads, both entering
   `withTenantTransaction` on the same row; assert exactly one commit and one typed error.
7. Reviewer additionally greps the diff for `better-sqlite3` or `kysely` imports outside
   `packages/database/src/tenant/connection.ts` and for any new export of a raw handle or Kysely
   instance.

## Feedback obligation

1. **General rule.** If implementation falsifies this spec, update this ticket and
   `docs/prd/01-app-data/README.md` **first** (version +0.1 + changelog line), then change code, then
   re-publish with `publish-tickets.mjs --sync` (CLAUDE.md, issue #53). Silent divergence is
   incomplete work.
2. **Foreseeable frictions, each with its writeback target:**
   - *Kysely's SQLite dialect over `better-sqlite3` (plan §8 **Q13**, recorded in `DATA-01`'s ADR)
     cannot be wrapped so that an unscoped `Kysely` instance or connection is unreachable* — e.g. a
     required API forces a globally exported instance → this endangers SEC-001 **and** contradicts
     Q13's last clause, so it is not a local trade-off. Update
     `docs/adr/NNNN-sqlite-access-layer.md`'s consequences section **and**
     `docs/prd/01-app-data/README.md` D1/D11 **and** write back to `docs/prd/breakdown-plan.md` §8
     Q13 **before** relaxing the `exports` map, and record the compensating control (lint rule + CI
     gate) there. Never switch access layers as the local fix.
   - *Composite tenant foreign keys prove infeasible for some table shape* (PRD §15.4 says "where
     feasible") → do not silently drop the constraint. Record the exception, the table and the
     compensating application check in `docs/prd/01-app-data/README.md` under D1, and cross-check it
     with `DATA-09` invariant 4.
   - *`FND-06`'s permission API does not fit the repository boundary* → do not re-implement
     permissions here (PRD §45.2 forbids duplicated business rules). Raise a `00-foundation` ticket,
     add the edge in `docs/prd/breakdown-plan.md` §5.1/§6.2, and note it in
     `docs/prd/01-app-data/README.md`'s open questions.
   - *The pre-commit invariant registry cannot run inside the transaction* → that breaks sub-PRD D5
     and leaves `DATA-09` unable to enforce PRD §35.8. Update `docs/prd/01-app-data/README.md` D5
     and `DATA-09`'s deliverables **before** coding an alternative; a durable alternative needs a new
     `docs/adr/NNNN-invariant-enforcement.md`.
   - *The break-glass path needs an audit row before `DATA-07` exists* → keep the callback seam and
     record the ordering dependency in `docs/prd/01-app-data/README.md`; do not create an
     `audit_event` table here (that is `DATA-07`'s file-scope).
3. **Falsified decision.** If plan §2.1 **A3** ("`packages/database` owns every app table and
   repository") turns out to be unimplementable — for instance if a product module genuinely cannot
   be served by a scoped repository — that overturns a decomposition decision that removes a module
   cycle. Stop, escalate for re-review, and update `docs/prd/breakdown-plan.md` §2.1 and §4.2 before
   any code change. Never let a product module open its own connection as a local workaround. The
   same rule applies to plan §8 **Q13**: it is a confirmed architecture decision, so a Builder that
   believes it is falsified writes back to the register and the sub-PRD first and never substitutes
   another access layer locally.
