---
id: DATA-08
title: ephemeral.sqlite store, expiry sweeper, backup exclusion
module: 01-app-data
lane: 01-app-data
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [DATA-03]
blocks: [ASSR-08]
---

# DATA-08 — `ephemeral.sqlite` store, expiry sweeper, backup exclusion

Implements PRD §10.4, §35.7 and §39.3 (`E04-APPDB`; underpins the PRD §37.3 retention matrix and
OPS-001's backup boundary). No ADR — the decision is already made in PRD §10.4 and §35.7; this is
build ticket 8 of 9 against it.
Parent sub-PRD: [01-app-data README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [DATA-03 — Field-level envelope encryption for customer text](DATA-03-field-level-envelope-encryption-for-customer-text.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed
contract (PRD §35.7 names the three tables, the key, the two expiry rules and the backup exclusion)
— not a new subsystem decision.

## Background + basis

**PRD §35.7 — Ephemeral database** is the entire specification, quoted in full:

> `ephemeral.sqlite` contains only `ephemeral_job_content`, `ephemeral_evidence` and
> `ephemeral_result` keyed by job ID, encrypted with a process-accessible key. It contains no
> identity beyond an opaque job/organisation reference. It is excluded from Litestream and every
> backup glob. A five-minute cleanup deletes content one hour after terminal state and all content
> at 24 hours from creation; startup cleanup runs before accepting traffic. `app.sqlite.job` retains
> only safe status/cost metadata after content expiry.

**PRD §10.4 — Ephemeral retention** restates it as customer-facing behaviour:

> Ephemeral content MUST be stored only in a local, non-replicated `ephemeral.sqlite`, **not**
> `app.sqlite`. It MUST expire one hour after completion/failure/cancellation and no later than
> 24 hours after creation. It MUST NOT enter Litestream, daily/weekly backups, exports or support
> tools. After expiry return `410 EPHEMERAL_CONTENT_EXPIRED`. Ephemeral jobs remain subject to
> PII/provider controls and are not recoverable after expiry or server loss.
>
> Durable audit/export/review/version comparison/change alerts require `SAVE` mode.

**PRD §39.3 — Filesystem layout** puts it on disk and states the CI assertion:

> | `/srv/aer/data/ephemeral.sqlite*` | system | app/worker only | transient research content |
> **Explicitly excluded** |
>
> The app database, ephemeral database and corpus cannot share a wildcard backup rule. **A
> CI/restore test asserts that `ephemeral.sqlite` and corpus files are absent from the Litestream
> destination.**

**PRD §37.3 — Content retention matrix** (`EPHEMERAL` column): sanitized question/facts → "Encrypted
ephemeral DB"; evidence excerpts used → "Ephemeral DB"; final answer → "Ephemeral DB until expiry";
operational IDs/status/timing/cost → "App DB safe metadata"; logs/support → "No"; backup → "SAVE
only".

**PRD §18.5 step 2**: the admission transaction *"creates the job plus either a sanitized saved turn
or an **opaque ephemeral-content reference**"* — so `app.sqlite` holds the reference, and the
content lives here.
**PRD §34.9**: `410 EPHEMERAL_CONTENT_EXPIRED` — *"Run new research if required"*.
**PRD §39.6** names the key group this store uses (the same "database field-encryption key" group as
`DATA-03`, used with a distinct purpose/AAD).

Sub-PRD decision **D6**: this database **bootstraps its own schema** and is not part of the app
migration sequence. Two reasons, both forced: it is disposable (a 24-hour ceiling deletes everything
anyway, and PRD §10.4 says it is "not recoverable after expiry or server loss"), and this ticket's
file-scope in plan §5.2 contains no `migrations/` path.

Accepted caveats carried forward:

- Two SQLite files cannot participate in one transaction unless attached, and attaching would defeat
  the separation PRD §10.4 mandates. Ephemeral content and the app job row are therefore written in
  two steps, **content first, then the app job row that references it** — an orphaned ephemeral row
  is harmless (the sweeper removes it) whereas a job row referencing missing content is a user-visible
  failure. State this ordering explicitly for `ASK-01`.
- "Process-accessible key" (PRD §35.7) means the key is available to the running app/worker, unlike
  offline signing keys (PRD §39.6). It is not a weaker key; it is the same envelope cipher with a
  different purpose binding.

## Goal

Produce `packages/database/src/ephemeral/**`: a separate, self-bootstrapping SQLite database holding
exactly the three PRD §35.7 tables keyed by job id, every content column encrypted through
`DATA-03`'s codec, with no identity column beyond an opaque job/organisation reference; a pure
`sweepExpired(now)` implementing both expiry rules (one hour after terminal state; 24 hours from
creation) plus a five-minute scheduler entry point and a startup cleanup that resolves **before**
readiness; a read path that returns a distinguishable `EXPIRED` result so `apps/api` can answer
`410 EPHEMERAL_CONTENT_EXPIRED`; and the canonical file-glob list plus an
`assertNotBackedUp(globs)` helper that `RLSE-05` and `ASSR-08` consume. Completion is mechanically
checkable: table-set assertion, the two expiry rules at their boundaries, startup ordering, and the
glob-intersection test.

## Non-goals

- **No app tables and no app migration.** `DATA-04`…`DATA-07` own `app.sqlite`; per sub-PRD D6 this
  database is outside the migration sequence and this ticket authors no file in
  `packages/database/migrations/`.
- **No Litestream configuration, backup globs or restore drill.** `RLSE-05` owns `infra/backup/**`
  and `RLSE-09`/`ASSR-08` own the restore assertions. This ticket exports the name list and the
  assertion helper they use; it configures nothing.
- **No sweeper *process*.** `RUNT-04` (`apps/worker/src/handlers/maintenance/**`) hosts the
  five-minute loop and `RUNT-01`/`RUNT-08` await the startup cleanup; this ticket exposes
  `startEphemeralSweeper` and `runStartupCleanup` as callables (PRD §45.2 — lease loops belong to
  `apps/worker`).
- **No HTTP status mapping.** `apps/api` maps `EXPIRED` to `410 EPHEMERAL_CONTENT_EXPIRED`
  (PRD §34.9); this ticket returns the discriminated value.
- **No PII detection.** `packages/pii` (`EVID-01`…`EVID-03`); PRD §10.1 puts that boundary before
  persistence.
- **No key management.** `DATA-03` owns the cipher and registry; sub-PRD open question **M-Q2**
  (Founder/`RLSE-02`) owns production custody.
- **No export or support-tool access.** PRD §10.4 forbids it; there is deliberately no read API for
  export or support in this module.

## File-scope (write-owns)

- `packages/database/src/ephemeral/**`
- `packages/database/test/ephemeral/**` (this ticket's own test area, sub-PRD D8)
- `packages/database/package.json` — append-only (sub-PRD D9)

- Does not touch: `packages/database/migrations/**` (owned per group by `DATA-01`, `DATA-04`–
  `DATA-07`; this ticket writes **no** migration, sub-PRD D6) · `src/migrate/**` (`DATA-01`) ·
  `src/tenant/**` (`DATA-02`) · `src/crypto/**` (`DATA-03`) · `src/schema/*.ts`, `src/repos/**`
  (`DATA-04`–`DATA-07`) · `src/invariants/**` (`DATA-09`) · `packages/jobs/**` (`DATA-05`) ·
  `infra/backup/**`, `infra/recovery/**` (`RLSE-05`, `RLSE-09`) · `apps/**`, `tests/**`
  (`23-assurance`, including `ASSR-08`).

**Serial safety.** First decomposition — nothing merged, no in-flight contention, no prior toucher.
The concurrent sibling in wave 3 is `DATA-04` (`src/schema/tenancy.ts`, `src/repos/tenancy/**`,
`migrations/*_tenancy.sql`); the scopes are disjoint, and this ticket authors no migration at all, so
plan **A5**'s timestamp-prefixed expand-only rule keeps the migrations directory free of contention
regardless. `DATA-03` merges before this starts (`blocked_by`).

## Deliverables

1. **Connection factory.** `packages/database/src/ephemeral/connection.ts` exporting
   `openEphemeralDatabase({ path })`:
   - a **separate file** from `app.sqlite`, defaulting to a sibling path
     (`/srv/aer/data/ephemeral.sqlite` in production, PRD §39.3) supplied by configuration;
   - applies `APP_SQLITE_PRAGMAS` from `DATA-01`'s `src/migrate/pragmas.ts` (do not restate them);
   - **refuses to `ATTACH`** any other database — provide and test a guard, because an attach would
     let a transaction span the app and ephemeral files and defeat PRD §10.4's separation;
   - calls `ensureEphemeralSchema(db)` (deliverable 2) on open — idempotent, no ledger, no migration
     history (sub-PRD D6).
2. **Schema bootstrap.** `ensureEphemeralSchema(db)` creating **exactly three** tables —
   `ephemeral_job_content`, `ephemeral_evidence`, `ephemeral_result` — keyed by `job_id`, each with:
   `job_id` TEXT, `organization_ref` TEXT (an opaque reference, not a joinable `organization_id`),
   `payload_ciphertext` BLOB, `created_at`, `terminal_at` (nullable), `expires_at`. **No** user id,
   email, record id, actor id, IP or any other identity column — PRD §35.7: *"It contains no
   identity beyond an opaque job/organisation reference."* A test asserts the exact table and column
   sets.
3. **Encryption.** All payload columns go through `DATA-03`'s `encryptField`/`decryptField` with the
   `FieldBinding` set to `{ organizationId: <the opaque ref>, table, column, rowId: job_id }` and a
   distinct purpose from app-database fields, so an app ciphertext cannot be replayed here or vice
   versa (PRD §35.7 "encrypted with a process-accessible key"; sub-PRD D7).
4. **Write path and ordering contract.** `putEphemeral(kind, { jobId, organizationRef, payload, createdAt })`
   and a documented ordering rule for callers (`ASK-01`): **write ephemeral content first, then
   commit the app job row that references it** (PRD §18.5 step 2's "opaque ephemeral-content
   reference"). State in the module doc that the two files cannot share a transaction and that an
   orphan here is swept, whereas a dangling reference in `app.sqlite` is a user-visible failure.
5. **Read path.** `getEphemeral(kind, jobId, now)` returning a discriminated union
   `{ status: 'PRESENT', payload } | { status: 'EXPIRED' } | { status: 'ABSENT' }`. `EXPIRED` is
   returned when the row is gone but the requested job is within the retention accounting window, so
   `apps/api` can answer `410 EPHEMERAL_CONTENT_EXPIRED` rather than a 404 (PRD §10.4, §34.9). State
   precisely how `EXPIRED` and `ABSENT` are distinguished (a tombstone row carrying **no** payload,
   or the app-side job status — choose one, implement it, and document it here).
6. **Expiry rules.** `sweepExpired(db, now)` — a pure, testable function implementing both PRD §35.7
   rules: delete content whose `terminal_at` is more than **one hour** before `now`, and delete all
   content whose `created_at` is more than **24 hours** before `now` regardless of terminal state.
   Returns per-table deletion counts. `expires_at` is a derived convenience column, never the sole
   authority — the sweep must be correct even if `expires_at` was never written.
7. **Schedulers.** `startEphemeralSweeper({ intervalMs = 5 * 60_000, clock })` returning a stop
   handle (PRD §35.7 "A five-minute cleanup"), and `runStartupCleanup(db, now)` returning a promise
   that `RUNT-01`/`RUNT-08` await **before** readiness reports ready (PRD §35.7 "startup cleanup runs
   before accepting traffic"; PRD §42.1). Neither starts itself on import.
8. **Backup-exclusion contract.** `packages/database/src/ephemeral/backup.ts` exporting
   `EPHEMERAL_FILE_GLOBS = ['ephemeral.sqlite', 'ephemeral.sqlite-wal', 'ephemeral.sqlite-shm']`
   (plus any journal variant the pragma choice implies) and
   `assertNotBackedUp(candidateGlobs: string[]): void`, which throws when any candidate glob would
   match an ephemeral file — including wildcard forms such as `*.sqlite*` and `data/*`. `RLSE-05`
   and `ASSR-08` call this; PRD §39.3: *"The app database, ephemeral database and corpus cannot share
   a wildcard backup rule."*
9. **Documented non-capabilities.** A module doc comment stating: no export path, no support-tool
   read path, no cross-database transaction, no recovery after expiry or server loss (PRD §10.4), and
   that durable audit/export/review/comparison/alerts require `SAVE` mode.

## Acceptance checklist (classified)

- [ ] `[machine]` `openEphemeralDatabase` creates a file distinct from `app.sqlite`, containing
      **exactly** `ephemeral_job_content`, `ephemeral_evidence` and `ephemeral_result` and no app
      table (PRD §35.7)
- [ ] `[machine]` No identity column beyond `job_id` and `organization_ref` exists on any of the
      three tables, asserted from `pragma table_info` against a literal expectation
      (PRD §35.7 "no identity beyond an opaque job/organisation reference")
- [ ] `[machine]` `ATTACH` of `app.sqlite` (or any other file) from the ephemeral connection is
      refused (PRD §10.4 "stored only in a local, non-replicated `ephemeral.sqlite`, not
      `app.sqlite`")
- [ ] `[machine]` Payload round-trips through `DATA-03`'s codec; an app-database ciphertext for the
      same logical value fails to decrypt here (distinct AAD binding) (PRD §35.7, sub-PRD D7)
- [ ] `[machine]` Canary: a distinctive question/evidence/answer string does not appear in the raw
      `ephemeral.sqlite`/`-wal` bytes after a checkpoint (PRD §37.3)
- [ ] `[machine]` Expiry rule 1: content with `terminal_at = now - 61 min` is deleted;
      `now - 59 min` survives (PRD §35.7 "one hour after terminal state")
- [ ] `[machine]` Expiry rule 2: content with `created_at = now - 24 h - 1 min` is deleted even with
      `terminal_at` null; `now - 23 h 59 min` survives (PRD §35.7 "all content at 24 hours from
      creation")
- [ ] `[machine]` `sweepExpired` is correct when `expires_at` was never written (the derived column
      is not the authority) and returns accurate per-table counts
- [ ] `[machine]` `runStartupCleanup` resolves before the readiness signal in a test that asserts the
      ordering, and it deletes pre-existing expired rows from a seeded file (PRD §35.7 "startup
      cleanup runs before accepting traffic")
- [ ] `[machine]` `startEphemeralSweeper` runs on the five-minute interval with an injected clock and
      its stop handle prevents further runs (PRD §35.7)
- [ ] `[machine]` Read after expiry returns `{ status: 'EXPIRED' }`, distinct from `ABSENT`, so
      `apps/api` can map it to `410 EPHEMERAL_CONTENT_EXPIRED` (PRD §10.4, §34.9)
- [ ] `[machine]` `assertNotBackedUp` throws for `*.sqlite`, `*.sqlite*`, `data/*` and the exact
      ephemeral names, and passes for an app-only glob set such as
      `['app.sqlite', 'app.sqlite-wal']` (PRD §39.3 "cannot share a wildcard backup rule")
- [ ] `[machine]` This ticket adds **no** file under `packages/database/migrations/` — asserted by a
      test or by the Reviewer's diff check (sub-PRD D6)
- [ ] `[machine]` No export or support read path exists: the module's public surface contains no
      function returning bulk ephemeral content (PRD §10.4 "MUST NOT enter … exports or support
      tools")
- [ ] `[machine]` `pnpm test` green
- [ ] No `[fixture]` criteria — nothing recorded is replayed
- [ ] No `[human]` criteria — `UAT-OPS-02` ("Restore app DB in isolated drill") is a PRD §41.2 manual
      script owned by `18-ops-release`/`23-assurance`; the real Litestream-destination assertion is
      `ASSR-08` (`tests/integration/recovery/**`), which is `blocked_by` this ticket and consumes
      `EPHEMERAL_FILE_GLOBS`/`assertNotBackedUp`
- [ ] No Rust or Python is touched (PRD §45.3)

## Test plan

Offline; no network, no Litestream, no S3.

1. `pnpm test`; focused run with `pnpm --filter <the packages/database package name> test`.
2. Harness: reuse the temp-file pattern from `packages/database/test/migrate/helpers.ts`
   (`DATA-01`), but open the ephemeral database at a **second** temp path in the same directory so
   the glob tests are realistic. Add
   `packages/database/test/ephemeral/helpers.ts` with `withTempEphemeralDatabase(fn)`.
3. Clock injection: every expiry test passes an explicit `now`; no test sleeps. Boundary cases are
   tested at ±1 minute around both thresholds.
4. Startup-ordering test: build a fake readiness sequence that records the order of
   `runStartupCleanup` resolution and the "ready" flag; assert cleanup completes first. Seed the file
   with expired rows before the run and assert they are gone at "ready".
5. Attach guard: attempt `ATTACH DATABASE '<app temp path>' AS app` through the ephemeral connection
   and assert the guard rejects it.
6. Cross-binding test: encrypt a value through `DATA-03` with an app-table binding, insert the bytes
   directly into an ephemeral row, and assert `getEphemeral` fails to decrypt.
7. Canary test: write a distinctive string, run `PRAGMA wal_checkpoint(TRUNCATE)`, read the
   `.sqlite` and `-wal` files as buffers, assert absence.
8. Glob test: table-driven over candidate backup glob sets (wildcards, directory globs, exact app
   names); assert `assertNotBackedUp` throws or passes as specified.
9. Reviewer greps the diff for any new file under `packages/database/migrations/`, any `ATTACH`
   statement, any identity-looking column on the three tables, and any function returning bulk
   content.

## Feedback obligation

1. **General rule.** If implementation falsifies this spec, update this ticket and
   `docs/prd/01-app-data/README.md` first (version +0.1 + changelog line), then change code, then
   `publish-tickets.mjs --sync` (CLAUDE.md, issue #53).
2. **Foreseeable frictions, each with its writeback target:**
   - *Distinguishing `EXPIRED` from `ABSENT` needs state in `app.sqlite`* (for example a
     `content_expired_at` column on `job`) → that is `DATA-05`'s file-scope. Do not edit it. Record
     the requirement in `docs/prd/01-app-data/README.md`, and either take it as a new ticket in
     `01-app-data` with a `blocked_by` edge in `docs/prd/breakdown-plan.md` §5.2/§6.2, or implement
     the tombstone alternative here and document the choice.
   - *The ephemeral database needs schema evolution after all* (a column must be added post-launch) →
     that reverses sub-PRD **D6**. Update `docs/prd/01-app-data/README.md` D6 first and state the
     mechanism (recreate-on-open is legitimate for a disposable store, since PRD §10.4 says it is
     "not recoverable after expiry or server loss"); only add it to the app migration sequence if D6
     is formally reversed.
   - *`RLSE-05`'s Litestream configuration cannot consume `assertNotBackedUp`* → keep
     `EPHEMERAL_FILE_GLOBS` as the shared fact and record the integration shape in
     `docs/prd/01-app-data/README.md`'s cross-module table; do not write `infra/backup/**` from this
     ticket.
   - *The five-minute cadence or the 1 h/24 h thresholds prove operationally wrong* → these are PRD
     §35.7 numbers and part of a customer-facing retention promise (PRD §10.4). Changing them is a
     **Product change** under PRD §45.5: founder approval and a PRD update, not a config tweak.
   - *A support or export path is requested for ephemeral content* → PRD §10.4 forbids it verbatim.
     Refuse, and record the request in `docs/prd/01-app-data/README.md`'s open questions rather than
     implementing it.
3. **Falsified decision.** If ephemeral content cannot be kept out of `app.sqlite` — for example if a
   flow genuinely requires one transaction spanning both — that falsifies PRD §10.4, a privacy
   promise, and would put customer research content into Litestream. Stop, escalate for re-review,
   and route it through the PRD §45.5 product-change path. Never attach the two databases as a local
   workaround.
