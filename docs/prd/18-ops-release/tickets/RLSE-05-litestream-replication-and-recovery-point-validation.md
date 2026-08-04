---
id: RLSE-05
title: "Litestream replication and recovery-point validation"
module: 18-ops-release
lane: 18-ops-release
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RLSE-04, DATA-01]
blocks: [RLSE-06, RLSE-09]
---

# RLSE-05 — Litestream replication and recovery-point validation

Implements PRD §23.1, §42.2 and §42.3 — requirement `OPS-001`, epic `E30-OBS-DR`. **No ADR — the
decision is already made in PRD §18.2 (Litestream is the selected continuous-replication technology)
and PRD §42.3 ("monitored by generation/validation of a recovery point, not merely 'process is
running'"); this is build ticket 5 of 11 against it.**
Parent sub-PRD: [18-ops-release README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on:
[`RLSE-04`](RLSE-04-s3-sydney-backup-and-export-prefixes-with-least-privilege.md) and `DATA-01`
(migration framework, `01-app-data`) — mirrors `blocked_by`.
**Why `builder`:** a bounded change inside one module's declared file-scope implementing the
replication and recovery-point rules PRD §23.1/§42.3 already enumerate — not a new subsystem decision.

## Background + basis

**PRD §23.1 is the specification, quoted for the parts this ticket implements:**

> - `app.sqlite` uses **WAL and Litestream continuous replication to S3 Sydney**.
> - **Target replication lag: under 15 minutes.**
> - Daily recovery points: seven days.
> - Weekly recovery points: 30 days.
> - Restore testing: monthly.
> - **Force a confirmed recovery point before migrations, auth/application changes, bulk customer
>   operations and key rotation.**
> - S3 uses encryption at rest/TLS; sensitive secret fields also use application-level encryption.
> - Destructive backup deletion and break-glass restore credentials MUST remain outside ordinary
>   production runtime.
>
> Corpus databases/indexes and application binaries are rebuilt from immutable releases rather than
> duplicated into customer backup storage.

**PRD §42.3 fixes what "healthy" means:**

> **Continuous Litestream replication is monitored by generation/validation of a recovery point, not
> merely "process is running".** Daily and weekly retention are implemented by S3 lifecycle/version
> policy and **verified by inventory**.

**PRD §42.2 fixes the thresholds this ticket must expose:**

| Condition | Threshold | Delivery | Initial operator action |
|---|---|---|---|
| Backup lag | warn 10 min, critical 15 min | Immediate critical | Stop risky deploy/write operation; restore replication |
| Last valid recovery point | older than 24 h | Immediate | Resolve before deployment; incident if customer data at risk |

**PRD §39.3 forbids a wildcard rule and names the excluded files:**

> | `/srv/aer/data/app.sqlite*` | system | app/worker/Litestream | mutable tenant state and WAL |
> **Litestream to S3 Sydney** |
> | `/srv/aer/data/ephemeral.sqlite*` | system | app/worker only | transient research content |
> **Explicitly excluded** |
>
> **The app database, ephemeral database and corpus cannot share a wildcard backup rule.** A
> CI/restore test asserts that `ephemeral.sqlite` and corpus files are absent from the Litestream
> destination.

**PRD §10.4 restates it as a hard requirement:** *"Ephemeral content MUST be stored only in a local,
non-replicated `ephemeral.sqlite`, not `app.sqlite`. … **It MUST NOT enter Litestream, daily/weekly
backups, exports or support tools.**"*

**`OPS-001` (PRD §30.2):** *"`app.sqlite` replication meets ≤15-minute target and restore is tested
monthly | Internal operations | backup tooling | S3 | **Timestamped restore report and integrity
checks pass**."* The monthly restore half is `RLSE-09` (`blocked_by` this ticket); the replication and
recovery-point half is here.

**The two consumed contracts, restated so this ticket is cold-startable:**

- **`DATA-08` publishes the exclusion helper** (`01-app-data`, `packages/database/src/ephemeral/backup.ts`):
  `EPHEMERAL_FILE_GLOBS = ['ephemeral.sqlite', 'ephemeral.sqlite-wal', 'ephemeral.sqlite-shm']` and
  `assertNotBackedUp(candidateGlobs: string[]): void`, *"which throws when any candidate glob would
  match an ephemeral file — including wildcard forms such as `*.sqlite*` and `data/*`"*. This ticket
  calls it in its own test suite. Note the DAG: `DATA-08` is **not** a `blocked_by` of this ticket
  (breakdown-plan §5.19 gives `RLSE-04, DATA-01`), so the call site must degrade to this ticket's own
  equivalent local assertion if the helper is not yet available — and must never skip the assertion.
- **`DATA-01` publishes the recovery-point seam** (`01-app-data`,
  `packages/database/src/migrate/runner.ts`):
  `RecoveryPointProvider = () => Promise<{ id: string; takenAt: string }>`, and *"When
  `requireRecoveryPoint` is set and no provider is supplied, `runMigrations` throws
  `RECOVERY_POINT_REQUIRED` before opening a transaction (PRD §23.1). The provider itself is
  `RLSE-05`'s."* **This ticket implements that provider.**

**Why these blockers.** breakdown-plan §6.2: `RLSE-04 --> RLSE-05` (the bucket, prefix, backup
credential and retention constants) and `DATA-01 --> RLSE-05` (the `RecoveryPointProvider` type, the
`APP_SQLITE_PRAGMAS` including `journal_mode = WAL`, and `migrationStatus`).

**Accepted caveats carried forward, documented not enforced here:**

- **The `litestream` systemd unit and its 96 MiB limit are `RLSE-02`'s** (`infra/deploy/host/**`,
  PRD §39.2). That unit reads its configuration from `AER_LITESTREAM_CONFIG`, default
  `/srv/aer/config/litestream.yml`; this ticket produces the file installed there. `RLSE-02` is
  **not** a blocker of this ticket (sub-PRD **D5**), so nothing here may import
  `infra/deploy/host/lib/**`.
- **Lifecycle/retention is enforced by S3, configured by `RLSE-04`.** PRD §42.3: *"Daily and weekly
  retention are implemented by S3 lifecycle/version policy and verified by inventory."* This ticket
  owns the **verification by inventory**, not the policy.
- **The monthly restore drill is `RLSE-09`'s.** PRD §23.1 *"Restore testing: monthly"*; this ticket
  performs a **restore-and-integrity-check of a single recovery point** as the definition of backup
  health (PRD §42.3), which is a different, smaller thing.

## Goal

Produce `infra/backup/**`: the Litestream replication configuration that names `app.sqlite` and
nothing else, a recovery-point generator that is only "confirmed" after the object exists in S3 **and**
a restore of it passes `PRAGMA integrity_check`, a replication-lag measurement against PRD §42.2's
10/15-minute thresholds, and an inventory verifier for the PRD §23.1 daily/weekly retention.
Completion is mechanically checkable offline: against a local S3-compatible stub and a synthetic
`app.sqlite`, a forced recovery point is produced, restored and integrity-checked end to end; a
configuration naming `ephemeral.sqlite`, a corpus path, or **any wildcard**, is refused by both this
ticket's own assertion and `DATA-08`'s `assertNotBackedUp`; lag is computed correctly at the warn and
critical boundaries; and `runMigrations({ requireRecoveryPoint: true })` succeeds with this provider
bound and throws `RECOVERY_POINT_REQUIRED` without it.

## Non-goals

- **No bucket, prefix, IAM policy or lifecycle rule.** `RLSE-04` (`infra/aws/**`). This ticket
  consumes `BACKUP_PREFIX`, `BACKUP_DAILY_RETENTION_DAYS` and `BACKUP_WEEKLY_RETENTION_DAYS` from
  `infra/aws/lib/api.mjs`.
- **No systemd unit, cgroup limit or host layout.** `RLSE-02` (`infra/deploy/host/**`).
- **No monthly restore drill, isolated environment or whole-server recovery.** `RLSE-09`
  (`infra/recovery/**`), which is `blocked_by` this ticket and consumes this ticket's restore
  primitive.
- **No deployment sequence.** `RLSE-06` (`infra/deploy/promote/**`), which is `blocked_by` this ticket
  and calls the recovery-point provider at PRD §39.7 step 3.
- **No alert rules, delivery or status page.** `RLSE-08` (`infra/deploy/monitoring/**`). This ticket
  **measures and publishes**; `RLSE-08` thresholds and notifies (PRD §42.2).
- **No application schema, migration authoring or ephemeral store.** `01-app-data` (`DATA-01`,
  `DATA-08`). This ticket calls their APIs and writes neither.
- **No corpus or release backup.** PRD §23.1 forbids it — corpus and binaries are rebuilt from
  immutable releases (`RLSE-07` retrieves them from R2).
- **No backup deletion of any kind.** PRD §23.1 puts destructive deletion outside ordinary runtime;
  `RLSE-04`'s break-glass identity owns it. Nothing in this ticket may delete an object.
- **No real credential or bucket.** PRD §20.2, §39.6.
- **No `infra/compose/**`.** `RUNT-09` (`03-app-runtime`), breakdown-plan **A7**.

## File-scope (write-owns)

- `infra/backup/**` — the Litestream configuration template, the recovery-point generator/validator,
  the lag measurement, the inventory verifier, the exclusion assertion, the local S3-compatible stub
  used by tests, `test/**` and `fixtures/**`.

Does not touch:

- `infra/deploy/**` — `RLSE-01`, `RLSE-02`, `RLSE-06`, `RLSE-07`, `RLSE-08`, `RLSE-11`; in particular
  **`infra/deploy/host/lib/**` must not be imported** (sub-PRD **D5**: `RLSE-02` is not in this
  ticket's blocker closure). `infra/cloudflare/**` — `RLSE-03`. `infra/aws/**` — `RLSE-04` (read-only
  consumption of its exported constants). `infra/recovery/**` — `RLSE-09`. `docs/runbooks/**` —
  `RLSE-10`.
- **`infra/compose/**` — `RUNT-09` (`03-app-runtime`), breakdown-plan A7.**
- `packages/database/**` — `01-app-data` (`DATA-01`, `DATA-08`); PRD §45.2 and breakdown-plan **A3**
  forbid any other module writing it. `apps/**`, `packages/**`, `services/**`, `pipelines/**`,
  `schemas/**` — their owning modules. `tests/**` — `23-assurance`. Root manifests, lockfiles,
  `.github/workflows/**` — `00-foundation`. `docs/PRD.md`, `docs/prd/breakdown-plan.md` — frozen.

**Serial-safety analysis.** First decomposition (breakdown-plan §1 header: `phase: 1`, nothing merged,
no in-flight ticket) — nothing has previously written `infra/backup/**`. breakdown-plan §4 gives the
whole tree to `18-ops-release` and §5.19 gives it wholly to this ticket; siblings own disjoint trees.
In the sub-PRD wave shape this ticket runs in wave 3 concurrently with `RLSE-03`
(`infra/cloudflare/**`) and `RLSE-07` (`infra/deploy/corpus/**`) — disjoint trees. Both blockers
(`RLSE-04`, `DATA-01`) merge before it starts. `infra/compose/**` belongs to `RUNT-09` and must not be
touched here (breakdown-plan **A7**, §4.1).

## Deliverables

1. **`infra/backup/README.md`** — one page: what is replicated and what is explicitly not, the two
   PRD §42.2 thresholds, the definition of a *confirmed* recovery point, the commands, and the
   statement that this repository holds no AWS credential (PRD §20.2).
2. **`infra/backup/litestream.yml`** — the replication configuration installed at
   `AER_LITESTREAM_CONFIG` (default `/srv/aer/config/litestream.yml`, read by `RLSE-02`'s
   `aer-litestream.service`). It declares **exactly one** database — the literal path
   `/srv/aer/data/app.sqlite` — with one S3 replica scoped to `s3://<bucket>/backups/app-sqlite`
   (using `RLSE-04`'s `BACKUP_PREFIX`), TLS enforced, a `sync-interval` and `snapshot-interval` chosen
   so the PRD §23.1 *"under 15 minutes"* target has margin (default: sync 10 s, snapshot 1 h), and
   **no `retention` directive that deletes** — retention is S3 lifecycle (`RLSE-04`), per PRD §42.3.
   The file contains **no glob, no wildcard and no second database**, and every value that is a
   credential is an environment reference.
3. **`infra/backup/lib/exclusions.mjs`** — the module's own hard assertion, independent of `DATA-08`'s
   availability: `assertBackupSelection(paths)` throws when any entry is a glob/wildcard, or matches
   `ephemeral.sqlite*`, `ingestion.sqlite*`, `/srv/aer/corpus/**`, `/srv/aer/app/**`, `/srv/aer/log/**`
   or `/srv/aer/tmp/**`; and `assertAgainstDataModule(globs)`, which additionally calls `DATA-08`'s
   `assertNotBackedUp(globs)` **when the package resolves**, and records `SKIPPED_NOT_AVAILABLE` in the
   report when it does not — never silently passing. Basis: PRD §39.3, §10.4, §23.1;
   `DATA-08` deliverable 8.
4. **`infra/backup/lib/objectStore.mjs`** — a narrow `ObjectStore` protocol (`head`, `list`, `get`,
   `put`) with an S3 implementation configured from environment only (PRD §39.6) and a
   `LocalObjectStore` backed by a temporary directory for tests. Deliberately the same shape
   `CRPS-07` uses on the R2 side, so an operator learns one idiom. It exposes **no delete**.
5. **`infra/backup/recovery-point.mjs`** — the ticket's centrepiece, implementing `DATA-01`'s
   `RecoveryPointProvider` (`() => Promise<{ id, takenAt }>`) with **confirmation** as PRD §42.3
   defines it. `createRecoveryPoint({ databasePath, store, clock, timeoutMs })` performs, in order:
   1. assert the database is in WAL mode (`DATA-01`'s `APP_SQLITE_PRAGMAS`) and readable;
   2. force a WAL checkpoint and a Litestream snapshot (through the adapter of deliverable 8);
   3. poll the object store until the new generation/snapshot object exists, bounded by `timeoutMs`;
   4. **restore that snapshot to a temporary path** and run `PRAGMA integrity_check`,
      `PRAGMA foreign_key_check`, and `DATA-01`'s `migrationStatus()` to confirm the schema head;
   5. compute a content fingerprint (row counts of a small, non-customer-content set of tables plus
      the schema head) and record it;
   6. delete the temporary restore under a `finally` block;
   7. return `{ id, takenAt, generation, objectKey, byteSize, integrity: 'PASSED', schemaHead,
      elapsedMs }`.
   Any failure at any step throws `RECOVERY_POINT_UNCONFIRMED` with a code naming the step — it never
   returns an unconfirmed point. Ordering constraint: **checkpoint before poll, poll before restore,
   restore before confirmation**; a point is confirmed only after step 4 passes.
6. **`infra/backup/lag.mjs`** — `measureLag({ store, clock })` returning
   `{ lagSeconds, newestObjectAt, lastConfirmedRecoveryPointAt, status }` where `status` is
   `OK | WARN | CRITICAL | UNKNOWN` using PRD §42.2's exact thresholds — **warn at 10 minutes,
   critical at 15 minutes** — plus a separate `recoveryPointAge` status that is `CRITICAL` when the
   last confirmed point is older than **24 hours** (PRD §42.2 row *"Last valid recovery point"*).
   `UNKNOWN` (never `OK`) is returned when the store cannot be reached, so an outage can never look
   healthy. Thresholds are exported constants (`BACKUP_LAG_WARN_SECONDS = 600`,
   `BACKUP_LAG_CRITICAL_SECONDS = 900`, `RECOVERY_POINT_MAX_AGE_SECONDS = 86400`) that `RLSE-08`
   consumes rather than restating.
7. **`infra/backup/status.mjs`** — writes `backup-status.json` (path from configuration, default
   `/srv/aer/log/backup-status.json`) containing the lag measurement, the last confirmed recovery
   point and the inventory result, **and** emits one bounded JSON log line per run conforming to
   `packages/observability`'s published field contract
   (`packages/observability/schema/log-record.schema.json`, `RUNT-07` deliverable 10) using
   allowlisted fields only. It never imports `packages/observability` — `RUNT-07` is not in this
   ticket's blocker closure — it conforms to the published schema. This is the seam `RLSE-08` reads
   (PRD §22 metric family *"backup lag"*).
8. **`infra/backup/lib/litestreamAdapter.mjs`** — the seam that makes every check reproducible:
   `LitestreamAdapter = { snapshot(dbPath), generations(dbPath), restore(dbPath, target, opts),
   version() }` with a real implementation shelling out to the pinned `litestream` binary and a
   `FakeLitestream` that implements the same semantics over `LocalObjectStore` (real SQLite files,
   real WAL, real restore — only the binary is replaced). Every `[machine]` test uses the fake; the
   real adapter is exercised only by `[human]` checks.
9. **`infra/backup/verify-retention.mjs`** — PRD §42.3's *"verified by inventory"*:
   lists the backup prefix, groups objects into daily and weekly recovery points, and asserts at
   least the counts `RLSE-04` declares (`BACKUP_DAILY_RETENTION_DAYS = 7`,
   `BACKUP_WEEKLY_RETENTION_DAYS = 30`) are present and that nothing older than the maximum survives
   (PRD §10.3 *"Deleted data in backups: ages out within a further maximum of 30 days"*). It
   **reports**; it never deletes.
10. **`infra/backup/lib/scan-destination.mjs`** — the PRD §39.3 assertion applied to the *destination*
    rather than the configuration: `scanDestination(store)` lists the backup prefix and fails if any
    object key suggests an ephemeral database, a corpus file, an application binary, an export or a
    log. PRD §39.3: *"A CI/restore test asserts that `ephemeral.sqlite` and corpus files are absent
    from the Litestream destination."* Exported so `ASSR-08` (`23-assurance`, `blocked_by RLSE-09`)
    and `RLSE-09` can reuse it rather than re-deriving the rule.
11. **`infra/backup/cli.mjs`** — `node infra/backup/cli.mjs <command>` with:
    `recovery-point [--json]` (force and confirm one), `lag [--json]`, `verify-retention [--json]`,
    `scan-destination [--json]`, `check-config` (deliverables 3 and 2). Exit codes: `0` healthy/passed,
    `2` refused or threshold breached, `1` transport/internal error. Every command prints codes and
    numbers, never a credential, a bucket secret or a row of customer data (PRD §22).
12. **`infra/backup/lib/api.mjs`** — the stable export surface downstream tickets bind:
    `createRecoveryPoint` (as a `RecoveryPointProvider` factory for `DATA-01`/`RLSE-06`),
    `measureLag`, `BACKUP_LAG_WARN_SECONDS`, `BACKUP_LAG_CRITICAL_SECONDS`,
    `RECOVERY_POINT_MAX_AGE_SECONDS`, `restoreToPath` (the primitive `RLSE-09` builds its drill on)
    and `scanDestination`.

## Acceptance checklist (classified)

Cross-references: `OPS-001` (this ticket is the replication half; `RLSE-09` is the restore half),
`OPS-002` (the backup-lag signal `RLSE-08` alerts on), `OPS-003` (no unbudgeted cost — storage sits in
`RLSE-04`'s A$1–2 line), `ADM-002` (not applicable — corpus promotion does not use this store; stated
so the absence is deliberate).

- [ ] `[machine]` `litestream.yml` declares exactly one database, the literal path
      `/srv/aer/data/app.sqlite`, one S3 replica under `backups/`, and **no glob, no wildcard and no
      second database** — asserted by parsing the file (PRD §39.3, §23.1)
- [ ] `[machine]` `assertBackupSelection` refuses `*.sqlite`, `*.sqlite*`, `data/*`,
      `ephemeral.sqlite`, `ingestion.sqlite`, a corpus path, a release path, a log path and a tmp path
      — one test per case (PRD §39.3 "cannot share a wildcard backup rule"; §10.4)
- [ ] `[machine]` `assertAgainstDataModule` calls `DATA-08`'s `assertNotBackedUp` when
      `packages/database` resolves and records `SKIPPED_NOT_AVAILABLE` — never a silent pass — when it
      does not (`DATA-08` deliverable 8; PRD §39.3)
- [ ] `[machine]` **A confirmed recovery point round-trips end to end** against `FakeLitestream` +
      `LocalObjectStore`: checkpoint → object appears → restore → `PRAGMA integrity_check` passes →
      `migrationStatus()` head matches → fingerprint recorded (PRD §42.3; `OPS-001`)
- [ ] `[machine]` `createRecoveryPoint` throws `RECOVERY_POINT_UNCONFIRMED` — never returns a point —
      when: the object does not appear within the timeout; the restored database fails
      `integrity_check`; `foreign_key_check` fails; the schema head does not match. One test per case,
      each asserting the step code (PRD §42.3 "not merely 'process is running'")
- [ ] `[machine]` The temporary restore is removed on every path, including when a step throws —
      asserted by listing the temporary directory afterwards (PRD §10.3; §39.3)
- [ ] `[machine]` `runMigrations({ requireRecoveryPoint: true })` (from `DATA-01`) **succeeds** with
      this provider bound and throws `RECOVERY_POINT_REQUIRED` with none — proving the seam matches
      `DATA-01` deliverable 7's declared type (PRD §23.1 "Force a confirmed recovery point before
      migrations")
- [ ] `[machine]` `measureLag` returns `OK` at 9 min, `WARN` at 10 min 1 s, `CRITICAL` at 15 min 1 s,
      and `UNKNOWN` (never `OK`) when the store is unreachable — table-driven with an injected clock
      (PRD §42.2 "warn 10 min, critical 15 min")
- [ ] `[machine]` `recoveryPointAge` is `CRITICAL` when the last confirmed point is older than 24 h
      (PRD §42.2 "Last valid recovery point | older than 24 h")
- [ ] `[machine]` `verify-retention` reports the daily-7 and weekly-30 groupings from a seeded
      inventory and fails when a required group is missing; it performs **no** delete, asserted by a
      recording store that fails the test on any mutating call (PRD §42.3 "verified by inventory";
      §23.1)
- [ ] `[machine]` `scanDestination` fails when the destination contains an `ephemeral.sqlite*` object,
      a corpus bundle file, an application archive, an export artifact or a log file — one test per
      case (PRD §39.3 "A CI/restore test asserts that `ephemeral.sqlite` and corpus files are absent
      from the Litestream destination")
- [ ] `[machine]` The module exposes **no delete path**: a source scan asserts no `DeleteObject`,
      `rm`, `unlink` or Litestream retention/delete invocation exists outside the temporary-restore
      cleanup (PRD §23.1 "Destructive backup deletion … outside ordinary production runtime")
- [ ] `[machine]` `backup-status.json` and the emitted log line validate against
      `packages/observability/schema/log-record.schema.json` and contain only allowlisted fields; a
      canary placed in a database row, a bucket name and an error message appears in **no** emitted
      byte (PRD §22; `RUNT-07` deliverable 10)
- [ ] `[machine]` No credential, bucket name or endpoint is hard-coded, and none is read from a
      committed file — asserted by a source scan (PRD §20.2, §39.6)
- [ ] `[machine]` Streaming discipline: restore and hashing never read a whole database into memory —
      the `litestream` unit's budget is **96 MiB** (PRD §39.2), asserted by a bounded-memory test over
      a synthetic multi-hundred-MiB database fixture
- [ ] `[machine]` No file outside `infra/backup/**` is modified — asserted by `git diff --name-only`.
      In particular `infra/compose/**` is untouched, and `infra/deploy/host/lib/**` is **not imported**
      (breakdown-plan **A7**; sub-PRD D2, D5)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `OPS-001`, the retention/PII impact (nothing
      but `app.sqlite` is replicated; ephemeral content never enters the destination), the cost impact
      (inside `RLSE-04`'s A$1–2 line), the rollback path (configuration is declarative; a bad config
      is reverted and replication resumes from the last generation) and the known gaps
- [ ] `[fixture]` Replay of a **recorded generation set**: the committed fixture under
      `infra/backup/fixtures/generations/` — a real Litestream generation layout captured from the
      fake adapter — restores to a byte-identical database and produces the recorded lag/inventory
      report (excluding timestamps). This is the replayable evidence `RLSE-09` and `ASSR-08` build on
- [ ] `[human]` One real run against the production host and the real S3 bucket: `cli.mjs
      recovery-point` produces a confirmed point, `cli.mjs lag` reports under 15 minutes, and
      `cli.mjs verify-retention` matches the S3 inventory. **Not required to merge** — PRD §20.2
      forbids giving coding agents backup credentials; the merge-time substitute is `FakeLitestream` +
      `LocalObjectStore`, which exercises the identical confirmation, lag and inventory logic against
      real SQLite files
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python authored (PRD §45.3)

## Test plan

Reviewer steps. Everything except the single `[human]` row runs offline with no network, no AWS
account and no credentials (PRD §20.2):

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/infra-backup`, **or** `node --test infra/backup/test` if the workspace
   member is absent (open question **Q-RLSE-9**). Both must pass.
3. Harness: `test/helpers/appDb.mjs` creates a synthetic `app.sqlite` using `DATA-01`'s
   `APP_SQLITE_PRAGMAS` and runs `DATA-01`'s migrations so `migrationStatus()` is real, seeded with
   **synthetic, non-customer** rows carrying a `content-canary-<uuid>`.
   `test/helpers/fakeLitestream.mjs` implements the adapter over `LocalObjectStore` with real
   snapshot/restore semantics. `test/helpers/recordingStore.mjs` wraps `LocalObjectStore`, records
   every call in order and fails the test on any mutating call in read-only scenarios — copy the
   construction pattern from `docs/prd/04-corpus-contract/tickets/CRPS-07-*.md`.
4. **`config.test.mjs`** — parse `litestream.yml`: exactly one database; literal path; one replica
   under `backups/`; no wildcard; no retention/delete directive; credentials are environment
   references. Then the `assertBackupSelection` rejection matrix, and `assertAgainstDataModule` both
   with `packages/database` resolvable and stubbed unresolvable.
5. **`recovery-point.test.mjs`** — happy path end to end; then the four failure injections (object
   never appears; `integrity_check` fails on a deliberately corrupted snapshot; `foreign_key_check`
   fails; schema head mismatch). Assert `RECOVERY_POINT_UNCONFIRMED` and the step code for each, and
   that the temporary restore directory is empty afterwards in every case.
6. **`migrations-seam.test.mjs`** — call `DATA-01`'s `runMigrations({ requireRecoveryPoint: true })`
   with this provider and assert success and the recorded recovery-point id in the report; then with
   no provider and assert `RECOVERY_POINT_REQUIRED` before any transaction opens.
7. **`lag.test.mjs`** — injected clock; table over 0, 9 min, 10 min 1 s, 15 min 1 s, 24 h + 1 min; and
   an unreachable store asserting `UNKNOWN`, explicitly asserting it is not `OK`.
8. **`retention.test.mjs`** — seed an inventory with 7 daily and 30 weekly points; assert pass. Remove
   one daily; assert failure naming the gap. Assert the recording store saw no mutating call.
9. **`scan-destination.test.mjs`** — seed the destination with each forbidden object class in turn and
   assert failure naming the key class; assert a clean destination passes.
10. **`observability.test.mjs`** — validate `backup-status.json` and the emitted log line against
    `packages/observability/schema/log-record.schema.json`; seed a `content-canary-<uuid>` into a
    database row, the bucket name and a thrown error message, and assert it appears in no emitted byte.
11. **`memory.test.mjs`** — restore a synthetic multi-hundred-MiB database with a bounded heap and
    assert peak RSS stays well under the PRD §39.2 96 MiB Litestream budget.
12. **`golden.test.mjs`** — the `[fixture]` row: restore the committed generation fixture and diff the
    resulting database and report against the recorded goldens, ignoring timestamps.
13. **Diff check** — `git diff --name-only` lists only paths under `infra/backup/`; a source scan
    confirms no import of `infra/deploy/host/lib/**`.
14. **Reviewer focus (concurrency- and data-loss-sensitive):** confirm a recovery point cannot be
    reported confirmed before the restore check passes (reorder the steps in a scratch branch and
    watch a test fail); confirm the poll loop is bounded and cannot spin forever; confirm two
    concurrent `createRecoveryPoint` calls cannot interleave into a mixed report (either serialise or
    prove independence); confirm nothing in the module can delete an object; confirm no customer row
    content, bucket name or credential can reach `backup-status.json`, a log line or an error message;
    confirm the wildcard assertion cannot be bypassed by supplying a path list from configuration.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(docs PR → merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/18-ops-release/README.md` (version +0.1 with a changelog line), **then** change code. Silent
divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **Litestream needs delete permission to prune generations** → do **not** grant it. PRD §23.1 puts
  destructive deletion outside ordinary runtime and `RLSE-04`'s `backup-writer.json` explicitly denies
  it. Move pruning entirely into S3 lifecycle (PRD §42.3: retention *"implemented by S3
  lifecycle/version policy"*), record the decision here and in `docs/prd/18-ops-release/README.md`,
  and raise the matching change against `RLSE-04` as a docs PR. If Litestream genuinely cannot operate
  without delete, that is an escalation.
- **Replication lag exceeds 15 minutes under real load** → PRD §23.1 states the target and PRD §42.2
  makes 15 minutes critical. Record the measured numbers in the PR's latency line (PRD §45.4) and in
  `docs/prd/18-ops-release/README.md`; tune `sync-interval` first. Relaxing the threshold is a
  **product/NFR** change under PRD §45.5 (PRD §13.2's *"Customer-data RPO ≤ 15 minutes target"*)
  requiring founder approval — never a constant edited inside this ticket.
- **`DATA-08`'s `assertNotBackedUp` is unavailable or has a different signature** → it is `01-app-data`'s
  contract (`DATA-08` deliverable 8) and this ticket has no `blocked_by` edge to it. Keep this
  ticket's own `assertBackupSelection` as the authoritative gate, record the mismatch in
  `docs/prd/18-ops-release/README.md`, and raise a docs PR against `DATA-08`. Never skip the
  assertion, and never write `packages/database/**` (breakdown-plan **A3**; PRD §45.2).
- **`DATA-01`'s `RecoveryPointProvider` shape differs from deliverable 5's return value** → the type is
  `DATA-01`'s (`{ id, takenAt }`). Return a superset object that satisfies it exactly, record the
  extra fields here, and raise a docs PR against `DATA-01` only if the base type genuinely must change.
- **The `litestream` process cannot stay inside its 96 MiB budget** (PRD §39.2) → record the measured
  RSS in the PR's memory line and in `docs/prd/18-ops-release/README.md`; the authoritative
  measurement is `RLSE-11`'s. A larger budget takes memory from another process on a 2 GiB host and is
  therefore a `RLSE-11`/Founder decision (sub-PRD **D17**, **D18**), not a unit-file edit.
- **The recovery-point confirmation is too slow to run before every migration** → PRD §23.1 requires it
  *before migrations, auth/application changes, bulk customer operations and key rotation*, so it
  cannot simply be skipped. Record the measured elapsed time, tune the restore check (for example
  `integrity_check` with a bounded page budget) and write the reduced check and its residual risk into
  deliverable 5 **before** implementing it. A confirmation that does not restore is not a confirmation
  (PRD §42.3).

**3. Escalation.** *"Continuous Litestream replication is monitored by generation/validation of a
recovery point, not merely 'process is running'"* (PRD §42.3) and *"The app database, ephemeral
database and corpus cannot share a wildcard backup rule"* (PRD §39.3) are the two sentences behind
`OPS-001` and PRD §26's *"Backup lag, monthly restore procedure … are demonstrated"*. `RLSE-06`,
`RLSE-09` and `ASSR-08` all build directly on them. If either is outright falsified, stop, escalate
for re-review, and write back to `docs/prd/18-ops-release/README.md` and
`docs/prd/breakdown-plan.md` before any code lands. Never widen the backup selection and never report
an unconfirmed recovery point as healthy inside this ticket.
