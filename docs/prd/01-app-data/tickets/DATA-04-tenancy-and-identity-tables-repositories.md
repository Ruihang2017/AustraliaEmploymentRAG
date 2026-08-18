---
id: DATA-04
title: Tenancy and identity tables/repositories
module: 01-app-data
lane: 01-app-data
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [DATA-02, DATA-03]
blocks: [DATA-05, AUTC-01, IDNT-02]
---

# DATA-04 — Tenancy and identity tables/repositories

Implements PRD §15.4 and §35.4 — persistence half of **AUTH-002**, **AUTH-003** and **AUTH-006**
(`E04-APPDB`). No ADR — the decision is already made in PRD §35.4 (the table list is normative);
this is build ticket 4 of 9 against it.
Parent sub-PRD: [01-app-data README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [DATA-02 — TenantContext repository layer + unscoped-import architecture test](DATA-02-tenantcontext-repository-layer-unscoped-import-architecture-test.md)
· [DATA-03 — Field-level envelope encryption for customer text](DATA-03-field-level-envelope-encryption-for-customer-text.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed
contract (PRD §35.4's table/column/constraint list) — not a new subsystem decision.

## Background + basis

This is the first application table group and the root of the FK order the whole module follows
(plan §7: *"§35.8 invariant 4 forces the tenancy → execution → research/operations FK order"*).

**PRD §35.4 — App database: tenancy and authentication** is normative and is reproduced in full so
this ticket is executable without any other document:

> | Table | Required columns | Critical constraints/indexes |
> |---|---|---|
> | `organization` | `id`, `name`, `slug`, `plan`, `status`, `default_legal_date_policy`, `retention_policy_json`, `row_version` | unique slug; closure state blocks writes |
> | `user` | `id`, `email_normalized`, `display_name`, `status`, auth-library linkage | globally unique normalised email where auth permits |
> | `membership` | `organization_id`, `user_id`, `role`, `status`, `joined_at`, `row_version` | composite PK; last-Owner trigger/application invariant |
> | `invitation` | `id`, `organization_id`, `email_normalized`, `role`, `token_hash`, `expires_at`, `accepted_at`, `invited_by_actor_id` | token shown/sent, only hash stored; one use |
> | `service_account` | `id`, `organization_id`, `name`, `status`, `scopes_json`, `expires_at`, `ip_allowlist_json`, `budget_limit`, `row_version` | no Web login |
> | `api_credential` | `id`, `organization_id`, `service_account_id`, `prefix`, `secret_hash`, `created_at`, `expires_at`, `last_used_at`, `revoked_at` | full secret displayed once |
> | `sso_connection` | `id`, `organization_id`, `protocol`, `state`, encrypted configuration, `tested_at`, `enforced_at`, `row_version` | enforcement requires successful current test |
> | `actor` | `id`, `actor_type`, nullable user/service/system linkage | stable audit identity |

**PRD §15.4** gives the entity meanings and the tenancy rule:

> `Organization` — Tenant boundary, plan, retention, defaults and limits · `User` — Human identity ·
> `Membership` — User-to-organisation role/permissions · `ServiceAccount` — Non-human organisation
> actor with scopes · `ApiCredential` — Hashed, rotatable, expiring machine credential · `Actor` —
> Unified User, ServiceAccount or SystemJob audit identity
>
> Every tenant-owned row MUST include `organization_id`. Organisation-scoped composite keys/foreign
> keys MUST prevent cross-tenant relationships where feasible.

Note the consequence: `user` and `actor` are **global**, not tenant-owned — a user may belong to
several organisations (AUTH-002: *"A user can switch among organisations without leaking state"*).
Every other table in the group is `TENANT`-scoped.

The requirement rows this group must satisfy at the persistence layer (PRD §30.2):

> | AUTH-002 | A user can switch among organisations without leaking state | … | Cross-tenant ID matrix returns indistinguishable 404 |
> | AUTH-003 | Owner, Admin, Researcher, Viewer and Developer permissions are enforced | … | Permission matrix in §38 passes |
> | AUTH-006 | Service credentials are shown once, hashed, scoped, expiring and rotatable | … | Old key fails immediately after rotation/revocation |

**PRD §38.4** (service account and widget tokens) and **PRD §38.3** (SSO lifecycle) own the
*behaviour*; this ticket owns only the rows they read and write. **AUTH-005**'s acceptance —
*"Failed IdP test cannot lock out the organisation"* — has a persistence half here: the
`sso_connection` constraint "enforcement requires successful current test".

**PRD §10.3**: *"Organisation closure: export followed by deletion within 30 days"* — which is why
`organization.status` closure "blocks writes" rather than deleting rows.

Accepted caveats carried forward:

- "auth-library linkage" on `user` is deliberately unspecified in the PRD because `AUTC-01` selects
  Better Auth's table expectations (PRD §18.2 "Self-hosted Better Auth"). This ticket owns the
  `user` row shape and MUST leave an explicit, documented extension point rather than guessing
  Better Auth's internal tables; `AUTC-01` is `blocked_by` this ticket and completes the linkage.
- The role vocabulary (`OWNER`, `ADMIN`, `RESEARCHER`, `VIEWER`, `DEVELOPER`, PRD §38.1) is a
  canonical enum owned by `FND-03`; the CHECK constraint is generated from it (PRD §35.1), never
  hand-typed.
- **The closure allowlist is asserted as a predicate only, not end to end — a recorded known
  gap.** `CLOSURE_EXEMPT_OPERATIONS` (`packages/database/src/repos/tenancy/closure.ts`) names
  `export`, `delete` and `close`, but only `close` has a repository operation behind it in this
  module (`organizations.close`). No repository here implements an organisation export or a bulk
  row deletion, so `packages/database/test/tenancy/closure.test.ts` can assert only that the guard
  predicate does not refuse those two labels; there is no end-to-end test that an exempt `export`
  or `delete` operation runs against a closed organisation, because there is no such operation to
  run. That is consistent with this ticket's Non-goals (no routes, no jobs) and is **not** a
  defect to fix here. It is recorded rather than left implicit because **no ticket currently owns**
  PRD §10.3's *"export followed by deletion within 30 days"* for an organisation:
  `XPRT-01`…`XPRT-05` (`19-exports`) explicitly exclude it (that sub-PRD's **D9**/**QX-6**:
  *"the PRD §10.3 organisation-closure export is a `/settings/data` flow owned by
  `13-identity-surface`"*), while `IDNT-09` (`13-identity-surface`) ships the **display** half only
  and states *"organisation closure has no API"* (that sub-PRD's **OQ6**, owner: Founder + plan
  owner). `DATA-08` is the ephemeral store (PRD §10.4/§35.7) and is unrelated. The
  export-then-delete path is therefore an **unallocated requirement**, surfaced here under the
  Feedback obligation: the allowlist's two unexercised labels stay in place as the seam that
  ticket will use, and whoever closes **OQ6**/**QX-6** owns the end-to-end test.

## Goal

Add the eight PRD §35.4 tables to the app migration sequence as one expand-only,
timestamp-prefixed migration, plus `packages/database/src/schema/tenancy.ts` (declaring the group's
`tableManifest`) and `packages/database/src/repos/tenancy/**` (one `TenantContext`-scoped repository
per table, built with `DATA-02`'s factory and using `DATA-03`'s codec for the encrypted
`sso_connection` configuration). Every "critical constraint" in the §35.4 table is either a database
constraint or an application invariant enforced inside a single transaction, and each has a test.
Completion is mechanically checkable: migrate a clean database, assert the exact table/column set,
and run the constraint suite.

## Non-goals

- **No authentication logic.** Sessions, cookies, MFA, SSO protocol handling, credential hashing
  and rotation semantics are `02-auth-core` (`AUTC-01`…`AUTC-05`), which are `blocked_by` this
  ticket. This ticket stores a `secret_hash` produced elsewhere; it never hashes or verifies.
- **No routes or screens.** `13-identity-surface` (`IDNT-01`…`IDNT-09`) owns
  `apps/api/src/routes/{auth,invitations,members,mfa,sso,service-accounts,widget-sessions}/**` and
  `apps/web/src/features/{auth,settings}/**`.
- **No permission evaluation.** `FND-06` owns `packages/domain/src/access/**`; repositories consume
  the decision via `TenantContext.permissions` (`DATA-02`).
- **No jobs, research, usage or audit tables.** `DATA-05`, `DATA-06`, `DATA-07`.
- **No `actor` write path for system jobs beyond the row itself** — job authorship is `DATA-05`.
- **No widget-session storage.** PRD §38.4 widget tokens are opaque and signed (`AUTC-05`), not
  stored rows.

## File-scope (write-owns)

- `packages/database/src/schema/tenancy.ts`
- `packages/database/src/repos/tenancy/**`
- `packages/database/migrations/<UTC YYYYMMDDHHMMSS>_tenancy.sql` (matches plan §5.2's
  `migrations/*_tenancy.sql`)
- `packages/database/test/tenancy/**` (this ticket's own test area, sub-PRD D8)
- `packages/database/package.json` — append-only (sub-PRD D9)

**Anticipated forward references (amended 2026-08-18, under the Feedback obligation; sub-PRD v0.5).**
Two `DATA-01`-owned assertions are written *about this ticket* and go red the moment
`src/schema/tenancy.ts` exists. They are named here so the edit is declared rather than silent, and
the change to each is bounded to that one assertion:

- `packages/database/test/migrate/manifest.test.ts` — `expect(discoverTableManifests()).toEqual([])`,
  in a test titled *"defaults to packages/database/src/schema, which DATA-04 creates"*.
- `packages/database/test/migrate/conventions-lint.test.ts` — `expect(manifests).toEqual([])`,
  commented *"Vacuous by construction — `src/schema/` does not exist until DATA-04 lands"*.

Two more, found only by running the suite — this ticket ships the repository's **first migration
after the baseline**, and `DATA-01`'s fixture harness was written while the baseline was the only
file:

- `packages/database/test/migrate/helpers.ts` — `withTempMigrations` copied the **whole** shipped
  `migrations/` directory into each fixture directory, so every fixture-based test silently
  inherited `*_tenancy.sql` and thirteen `DATA-01` assertions failed for a reason that had nothing
  to do with `DATA-01`. Its own comment states the intent — *"The fixtures deliberately do NOT carry
  their own copy of the baseline"* — so it now copies `0001_baseline.sql` alone. No assertion was
  touched; the harness was restored to the contract it documents. `DATA-05`…`DATA-07` would each
  have hit this identically.
- `packages/database/test/migrate/runner.test.ts` — three assertions in the *"runMigrations against
  the shipped migrations directory"* block pinned the shipped sequence to exactly
  `['0001_baseline.sql']` (applied list, `head`, ledger length). Same over-broad shape as the two
  above: `DATA-01` asserting that no other module ever adds its own migration. Each is narrowed to
  what `DATA-01` has standing to check — its baseline applies **first**, every file on disk is
  applied, `head` is the last of them, the baseline's ledger row is byte-exact, and a second run
  applies nothing.

Both are the over-broad shape `FND-25` names: a module may assert that its own exception stays
narrow; it may not assert that another module never creates its own file. Each is updated to expect
the tenancy manifest — which turns the conventions-lint assertion from vacuous into the real §35.1
check this ticket's acceptance item 2 asks for. Precedent: sub-PRD changelog v0.4, where `DATA-02`
amended its own File-scope to cover a one-line update in `DATA-01`'s `q13-conformance.test.ts`.
Nothing else in either file changes.

- Does not touch: `src/migrate/**` and `migrations/0001_*` (`DATA-01`) · `src/tenant/**`,
  `test/architecture/**` (`DATA-02`) · `src/crypto/**` (`DATA-03`) · `src/schema/execution.ts`,
  `src/repos/execution/**`, `migrations/*_execution.sql`, `packages/jobs/**` (`DATA-05`) ·
  `src/schema/research.ts`, `src/repos/research/**`, `migrations/*_research.sql` (`DATA-06`) ·
  `src/schema/operations.ts`, `src/repos/operations/**`, `migrations/*_operations.sql` (`DATA-07`) ·
  `src/ephemeral/**` (`DATA-08`) · `src/invariants/**`, `test/invariants/**` (`DATA-09`) ·
  `packages/auth/**` (`02-auth-core`) · `packages/contracts/**` (`FND-03`) · `apps/**`, `tests/**`.

**Serial safety.** First decomposition — nothing merged, no in-flight contention. This ticket's
wave-3 sibling is `DATA-08` (`src/ephemeral/**`), which shares no path with it. `DATA-05`, `DATA-06`
and `DATA-07` are downstream and each owns a **different** group-suffixed migration file; per plan
A5, migrations are timestamp-prefixed and expand-only, so independent table groups do not serialise
— only cross-group FKs order them, and those orderings are exactly the `blocked_by` edges
(`DATA-05` → `DATA-04`, `DATA-06`/`DATA-07` → `DATA-05`). `src/schema/*.ts` is a glob, not a shared
barrel (sub-PRD D4), so adding `tenancy.ts` touches no other ticket's file.

## Deliverables

1. **Migration** `<timestamp>_tenancy.sql`, expand-only, created with `DATA-01`'s
   `nextMigrationFilename('tenancy')`. It creates the eight tables above with the PRD §35.1 column
   conventions from `DATA-01`'s `conventions.ts` (TEXT ids, ISO-UTC timestamps, `YYYY-MM-DD` legal
   dates with CHECK, `INTEGER CHECK (x IN (0,1))` booleans, `created_at` everywhere,
   `updated_at` + `row_version` on the mutable metadata tables `organization`, `membership`,
   `service_account`, `sso_connection`), and every enum column's CHECK generated from
   `packages/contracts` via `enumCheck` (`FND-03`).
2. **Composite tenant keys.** Every tenant-owned table gets `UNIQUE (organization_id, id)` and every
   tenant-owned child FK is emitted with `DATA-02`'s `tenantForeignKey(...)` — notably
   `api_credential.(organization_id, service_account_id)` → `service_account.(organization_id, id)`
   and `invitation.(organization_id, invited_by_actor_id)` where the actor is org-resolvable.
   PRD §35.8 invariant 4 becomes structural (PRD §15.4 "where feasible" — record any table where it
   is not, per the feedback obligation).
3. **Indexes/uniques stated by PRD §35.4**: `organization.slug` UNIQUE; `user.email_normalized`
   UNIQUE (globally); `membership` composite PK `(organization_id, user_id)`;
   `invitation.token_hash` UNIQUE with a single-use guard; `api_credential.prefix` UNIQUE and an
   index on `(organization_id, service_account_id)`; `sso_connection` unique per
   `(organization_id, protocol)` unless the protocol allows several — state the decision in the
   file.
4. **`packages/database/src/schema/tenancy.ts`** exporting
   `export const tableManifest: TableManifest` with `group: 'tenancy'` and one `TableSpec` per table:
   `scope: 'GLOBAL'` for `user` and `actor`, `'TENANT'` for the other six; `mutability`
   `'MUTABLE_METADATA'` for `organization`, `membership`, `service_account`, `sso_connection`,
   `'APPEND_ONLY'` for `invitation` and `api_credential` (their lifecycle is expressed by
   `accepted_at` / `revoked_at` stamps, not by row rewriting — state this in the file),
   `encryptedColumns: ['configuration_ciphertext']` for `sso_connection`, and the full
   `requiredColumns` list copied from PRD §35.4. Discovery is by glob (`DATA-01` deliverable 9) —
   do **not** create an index/barrel file.
5. **Repositories** in `packages/database/src/repos/tenancy/`, one file per table, each built with
   `defineTenantRepository` (`DATA-02`). Required behaviours beyond CRUD:
   - `organizations`: `slug` uniqueness surfaced as a typed conflict, not a raw SQLite error;
     **closure blocks writes** — when `status` is the closed value, every write repository in the
     tenancy group (and, by a shared guard exported here, in later groups) refuses with
     `ORGANIZATION_CLOSED`, except an explicit allowlist for export and deletion operations
     (PRD §10.3 "Organisation closure: export followed by deletion within 30 days").
   - `memberships`: **last-Owner invariant** — demoting, suspending or removing the last `ACTIVE`
     `OWNER` fails inside the same `withTenantTransaction`, evaluated with a read in that
     transaction so two concurrent demotions cannot both succeed (PRD §35.4).
   - `invitations`: single use — `accept(tokenHash)` is a conditional update that succeeds only when
     `accepted_at IS NULL` and `expires_at > now`, returning a discriminated result
     (`ACCEPTED | EXPIRED | ALREADY_USED | NOT_FOUND`) so `IDNT-02` can render AUTH-001's
     "Expired, reused and wrong-email invites fail" without a second query. Only the hash is stored
     (PRD §35.4 "token shown/sent, only hash stored").
   - `serviceAccounts` / `apiCredentials`: the credential repository accepts `prefix` + `secret_hash`
     only; it has **no** parameter that could carry a full secret (AUTH-006 "full secret displayed
     once"). `revoke()` and `rotate()` set `revoked_at` and take effect immediately for verification
     queries, which filter `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now)`
     (AUTH-006 "Old key fails immediately after rotation/revocation").
   - `ssoConnections`: configuration stored through `DATA-03`'s codec; `enforce()` refuses unless
     `state` records a successful test and `tested_at` is within the configured freshness window
     (PRD §35.4 "enforcement requires successful current test"; AUTH-005).
   - `actors`: `ensureActor({type, userId?, serviceAccountId?})` returning a stable id; exactly one
     linkage must be set for `USER`/`SERVICE_ACCOUNT`, none for `SYSTEM`.
6. **Better Auth extension point.** A documented, explicitly-named seam in `schema/tenancy.ts`
   (`AUTH_LIBRARY_LINKAGE_COLUMNS`) describing which `user` columns `AUTC-01` may rely on and stating
   that additional auth-library tables, if Better Auth requires them, arrive in a **new** migration
   authored by a ticket in this module — not by `02-auth-core` (plan §4, PRD §45.2).
7. **Fixture builders** in `packages/database/test/tenancy/factories.ts` (`makeOrganization`,
   `makeUser`, `makeMembership`, …) that later tickets and `ASSR-01` can copy the construction
   pattern from.

## Acceptance checklist (classified)

- [ ] `[machine]` A clean database migrates to head and contains exactly the eight PRD §35.4 tables
      with every listed required column, asserted against a literal expectation table in the test
      (PRD §35.4)
- [ ] `[machine]` `DATA-01`'s `assertSchemaConventions` passes for the tenancy manifest — TEXT
      primary keys, `created_at` everywhere, `updated_at` + `row_version` on the four mutable
      metadata tables, boolean/date CHECKs, `organization_id` on every `TENANT`-scoped table
      (PRD §35.1)
- [ ] `[machine]` Every enum column's CHECK value set equals the corresponding `packages/contracts`
      enum; a drifted fixture value fails (PRD §35.1, `FND-03`)
- [ ] `[machine]` `organization.slug` is unique; a duplicate insert raises the typed conflict, not a
      raw driver error (PRD §35.4)
- [ ] `[machine]` `user.email_normalized` is globally unique and `user`/`actor` are `GLOBAL`-scoped:
      a tenant repository cannot be constructed for them (PRD §15.4, `DATA-02`)
- [ ] `[machine]` **AUTH-002**: the cross-tenant matrix over all six tenant-owned tables
      (`organization`, `membership`, `invitation`, `service_account`, `api_credential`,
      `sso_connection`) returns the indistinguishable `ResourceNotFound` for another tenant's id
      and for an absent id. The matrix is defined **per repository, as every operation that
      repository exposes which resolves a caller-supplied identifier of an existing tenant-owned
      row** — not a fixed `{get, list, update, delete}` tuple — so that no exposed operation
      escapes the property and none is demanded that the design does not have. Exhaustively:
      `organizations.{find, get, updateWithVersion, close}` ·
      `memberships.{find, get, findByUser, updateWithVersion, demote, suspend, remove}` ·
      `invitations.{find, get, accept}` · `serviceAccounts.{find, get, updateWithVersion}` ·
      `apiCredentials.{find, get, findVerifiable, revoke, rotate, touchLastUsed}` ·
      `ssoConnections.{find, get, readConfiguration, recordTest, enforce}`. Where the operation
      throws, the assertion is `deepStrictEqual` on the two errors' wire form, after asserting
      each call raised at all. Where it reports a miss without throwing it MUST return the
      **identical** miss value for both identifiers: `find`, `findByUser` and
      `apiCredentials.findVerifiable` → `undefined`. `list()` carries the same property in its own
      form — on all six repositories it returns only the calling tenant's rows, asserted over a
      seeded non-empty result so the check cannot pass vacuously.
      **`organization`, `service_account` and `sso_connection` expose no delete-equivalent
      operation at all, by design, so the matrix has no `delete` leg for them** — this ticket's
      own Background gives the reason: *"**PRD §10.3**: 'Organisation closure: export followed by
      deletion within 30 days' — which is why `organization.status` closure 'blocks writes'
      rather than deleting rows."* Row deletion is not part of this ticket's surface, and this
      narrowing removes no coverage of any operation that exists. The two tables that **do** have
      a delete-equivalent keep it and must not lose it: `memberships.remove` (row removal) and
      `apiCredentials.revoke` (the `revoked_at` stamp, which is deletion's equivalent on an
      `APPEND_ONLY` table). **`invitation`'s mutating path sits outside the uniform id-addressed
      matrix and is not thereby exempt**: its `find`/`get`/`list` legs are in the matrix as above,
      and `accept(tokenHash)` — keyed by token hash rather than row id, returning a discriminated
      result instead of throwing — MUST return exactly `{ status: 'NOT_FOUND' }` for another
      tenant's token hash and for a token hash that never existed, asserted equal to each other,
      so the token path cannot be used to probe another tenant's invitations
      (PRD §16.5, §30.2 AUTH-002)
- [ ] `[machine]` Composite tenant FKs reject a cross-tenant child insert at the database level with
      `foreign_keys = ON` (PRD §35.8 invariant 4)
- [ ] `[machine]` Last-Owner invariant: removing/demoting/suspending the last `ACTIVE` `OWNER` fails;
      two concurrent demotions of the two remaining Owners leave at least one Owner
      (PRD §35.4 "last-Owner trigger/application invariant")
- [ ] `[machine]` Closure blocks writes: with `organization.status` closed, tenancy writes fail with
      `ORGANIZATION_CLOSED` while the allowlisted export/delete operations still run (PRD §35.4,
      §10.3)
- [ ] `[machine]` **AUTH-001 persistence half**: accepting an invitation twice yields `ACCEPTED` then
      `ALREADY_USED`; an expired invitation yields `EXPIRED`; the plaintext token is absent from the
      schema (only `token_hash` exists) (PRD §35.4)
- [ ] `[machine]` **AUTH-006**: `api_credential` has no column able to hold a full secret; the
      repository API accepts `prefix` + `secret_hash` only; after `revoke()`/`rotate()` the
      verification query returns nothing for the old credential in the same transaction
      (PRD §30.2 AUTH-006 "Old key fails immediately after rotation/revocation")
- [ ] `[machine]` **AUTH-005 persistence half**: `enforce()` refuses when no successful test is
      recorded or `tested_at` is stale (PRD §35.4 "enforcement requires successful current test")
- [ ] `[machine]` `sso_connection` configuration is encrypted: a canary string in the configuration
      does not appear in the raw SQLite file bytes (PRD §35.1, `DATA-03`)
- [ ] `[machine]` `row_version` compare-and-swap: a stale-version update fails with a typed conflict
      that `RCRD-01`/`IDNT-*` map to `409 CONCURRENT_MODIFICATION` (PRD §34.1 "Concurrency", §34.9)
- [ ] `[machine]` The migration passes `assertExpandOnly` and its filename matches
      `MIGRATION_FILENAME` with the `tenancy` group suffix (plan A5, `DATA-01`)
- [ ] `[machine]` `pnpm test` green
- [ ] No `[fixture]` criteria — nothing recorded is replayed; test data is generated by the factories
      in this ticket
- [ ] No `[human]` criteria — `UAT-AUTH-01`/`02`/`03`/`04` (PRD §41.2) are executed against the
      product surfaces by `13-identity-surface` and `23-assurance` (`ASSR-01`), not against this
      package
- [ ] No Rust or Python is touched (PRD §45.3)

## Test plan

Offline; no network, no auth provider, no real credentials.

1. `pnpm test`; focused run with `pnpm --filter <the packages/database package name> test`.
2. Reuse `withTempDatabase` (`packages/database/test/migrate/helpers.ts`, `DATA-01`) and the
   throwaway-table pattern from `packages/database/test/tenant/` (`DATA-02`). New shared fixtures go
   in `packages/database/test/tenancy/factories.ts`.
3. Schema assertion: after migrating to head, read `sqlite_master` and `pragma table_info` for each
   of the eight tables and compare against a literal expectation table transcribed from PRD §35.4 in
   the test file — the transcription is the point; do not derive the expectation from the schema
   module under test.
4. Cross-tenant matrix: seed organisations `A` and `B` with a full set of rows each; from `A`'s
   context, iterate **each of the six tenant-owned repositories against the operations that
   repository actually exposes**, exactly as enumerated in the `AUTH-002` acceptance item — not a
   fixed `{get, list, update, delete}` tuple, which would demand a `delete` this ticket's
   Background rules out for `organization`, `service_account` and `sso_connection` (PRD §10.3
   closure keeps the rows and blocks the writes). For every throwing operation, call it twice —
   once with `B`'s row id, once with an id that never existed — assert each call raised at all,
   then `deepStrictEqual` between the two errors' wire forms. For the non-throwing lookups assert
   the identical miss value from both inputs: `find`, `findByUser` and
   `apiCredentials.findVerifiable` → `undefined`, and `invitations.accept` →
   `{ status: 'NOT_FOUND' }` for `B`'s token hash and for a token hash that never existed.
   Separately assert `list()` on all six repositories returns only `A`'s rows, over a seeded
   non-empty result. The delete-equivalents that do exist — `memberships.remove` and
   `apiCredentials.revoke` — are part of the throwing set and must not be dropped.
5. Last-Owner concurrency: two connections, two Owners, both transactions attempting to demote "the
   other" Owner; assert exactly one succeeds and a query afterwards still returns at least one active
   Owner.
6. Credential revocation: create → verify-query hits → `revoke()` → verify-query misses, all within
   one test; then assert again across a fresh connection.
7. Encryption canary: as in `DATA-03`'s test plan — write a distinctive SSO configuration value, run
   `PRAGMA wal_checkpoint(TRUNCATE)`, and assert absence from the `.sqlite` and `-wal` bytes.
8. Migration hygiene: run `assertExpandOnly` over the new file and `migrationStatus` before/after to
   confirm exactly one new ledger row.

## Feedback obligation

1. **General rule.** If implementation falsifies this spec, update this ticket and
   `docs/prd/01-app-data/README.md` first (version +0.1 + changelog line), then change code, then
   `publish-tickets.mjs --sync` (CLAUDE.md, issue #53).
2. **Foreseeable frictions, each with its writeback target:**
   - *Better Auth requires its own tables or a different `user` shape* → the tables still belong to
     this module (PRD §45.2, plan §4). Add a **new** ticket to `01-app-data` for the auth-linkage
     migration, record it in `docs/prd/01-app-data/README.md`'s work-breakdown table, and add the
     `blocked_by` edge in `docs/prd/breakdown-plan.md` §5.2/§6.2. `AUTC-01` must not write
     `packages/database/migrations/**` (plan §9 risk R4).
   - *A composite tenant FK is not feasible for some table* (PRD §15.4 says "where feasible") →
     record the table, the reason and the compensating application check in
     `docs/prd/01-app-data/README.md` under D1, and tell `DATA-09` so invariant 4's property test
     covers it at the repository level instead.
   - *The role/status enum in `packages/contracts` is missing a value PRD §38.1 requires* → do not
     add the value to a local CHECK. Canonical enums are serial-owned by `FND-03` (plan §4.1): raise
     a `00-foundation` ticket and record the dependency in `docs/prd/breakdown-plan.md` §6.2.
   - *"Closure blocks writes" needs to apply to tables owned by `DATA-05`/`DATA-06`/`DATA-07`* →
     export the guard from this ticket and record the contract in
     `docs/prd/01-app-data/README.md`; do not edit another ticket's repository files, and do not
     duplicate the predicate.
   - *A §35.4 "required column" cannot be implemented as written* → that is a PRD-level conflict, not
     a local choice: raise it in `docs/prd/01-app-data/README.md`'s open questions with a named
     owner and escalate per layer 3 before deviating from the dictionary.
3. **Falsified decision.** If it turns out a product module genuinely must own its own identity
   tables, that overturns plan §2.1 **A3** and re-creates the module cycle A3 removes. Stop,
   escalate for re-review, and update `docs/prd/breakdown-plan.md` §2.1/§4.2 before any code moves.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-03 | Initial ticket (`/breakdown-prd`). |
| v1.1 | 2026-08-18 | **Self-contradiction between the `AUTH-002` acceptance item and this ticket's own Background removed.** The acceptance item and test-plan step 4 both specified the cross-tenant matrix as `{get, list, update, delete}` over **all six** tenant-owned tables, while the Background states *"**PRD §10.3**: 'Organisation closure: export followed by deletion within 30 days' — which is why `organization.status` closure 'blocks writes' rather than deleting rows."* `organizations.ts`, `service-accounts.ts` and `sso-connections.ts` therefore expose no delete method **by design, not by omission**, and `invitation`'s mutating path (`accept(tokenHash)`) is token-keyed rather than id-keyed, so it never fitted a uniform id-addressed tuple: the ticket demanded an operation its own design rules out. Both places are now scoped to **each repository's real operation surface**, enumerated explicitly, **without weakening the AUTH-002 indistinguishability property on any operation that exists** — the two delete-equivalents that do exist (`memberships.remove`, `apiCredentials.revoke`) stay in the matrix, the non-throwing lookups (`find`, `findByUser`, `findVerifiable`) gain an explicit identical-miss requirement, `invitations.accept` gains an explicit `{ status: 'NOT_FOUND' }` requirement, and `list()` keeps its no-leak assertion on all six. Acceptance item and test plan are now stated in terms of one another so they cannot drift apart again — that drift is what produced the escalation. Separately recorded under Accepted caveats: `CLOSURE_EXEMPT_OPERATIONS` (`closure.ts`) names `export` and `delete`, but no repository in this module implements either, so `closure.test.ts` can assert only that the guard predicate does not refuse those labels — a known end-to-end gap, consistent with the Non-goals, now written down rather than implicit, together with the finding that **no ticket owns** PRD §10.3's organisation export-then-delete path (`19-exports` **D9**/**QX-6** excludes it; `13-identity-surface` `IDNT-09` **OQ6** ships the display half only), making it an unallocated requirement. Made after a Reviewer escalation at the 2-bounce cap on 2026-08-18 and authorized by the repo owner. No id, title, frontmatter, dependency edge, file-scope entry, Non-goal or other acceptance item changed. |
