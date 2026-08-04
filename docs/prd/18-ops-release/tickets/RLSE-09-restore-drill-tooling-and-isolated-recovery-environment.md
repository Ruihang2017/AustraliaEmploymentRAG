---
id: RLSE-09
title: "Restore drill tooling and isolated recovery environment"
module: 18-ops-release
lane: 18-ops-release
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RLSE-05]
blocks: [RLSE-10, ASSR-08]
---

# RLSE-09 — Restore drill tooling and isolated recovery environment

Implements PRD §23.2 and §42.3 — requirement `OPS-001`, epic `E30-OBS-DR`. **No ADR — the decision is
already made in PRD §42.3, which gives the seven-step monthly restore drill and the whole-server
recovery order; this is build ticket 9 of 11 against it.**
Parent sub-PRD: [18-ops-release README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on:
[`RLSE-05`](RLSE-05-litestream-replication-and-recovery-point-validation.md) (mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope implementing a drill
PRD §42.3 already enumerates step by step — not a new subsystem decision.

## Background + basis

**PRD §42.3 is the executable specification, quoted in full:**

> Monthly restore drill:
>
> 1. create **isolated temporary host/network and deny outbound email, webhook, SSO callback and
>    model-provider access**;
> 2. retrieve selected recovery point and compatible app/corpus manifests;
> 3. restore `app.sqlite`, replay WAL and run **`PRAGMA integrity_check` plus foreign key/schema/
>    migration checks**;
> 4. verify sampled organisation/record/answer/claim/citation references against **exact corpus
>    release IDs**;
> 5. **prove auth sessions/credentials are disabled or rotated in drill**;
> 6. run **read-only Search and saved-record retrieval**;
> 7. record **recovery point, start/end time, achieved RPO/RTO, counts, failures and operator**;
>    destroy isolated customer-data copy under controlled procedure.
>
> The whole-server runbook restores in this order: **infrastructure/tunnel and secrets → app database
> → compatible app/corpus → auth/records/Search → Quick → Deep → exports/monitoring.** If
> compatibility or integrity is uncertain, remain in maintenance mode.

**PRD §23.2 states the isolation requirement and the whole-server sequence:**

> Monthly restore runs in an **isolated environment with email, webhook, provider calls, SSO callbacks
> and real sessions disabled**. It validates SQLite integrity/schema, compatible app/corpus releases
> and Research Record/Answer/citation references and **produces a report**.
>
> Whole-server recovery sequence: recreate Sydney compute/storage, bootstrap, restore `app.sqlite`,
> retrieve app/corpus releases, verify hashes/compatibility/integrity, reconnect origin tunnel, resume
> services in order and publish incident status. **Recovery priority: auth/records → Search → saved
> answers → Quick → Deep → exports/alerts.**

**The targets this drill must measure.** PRD §13.2: *"Customer-data RPO | **≤ 15 minutes target**"*
and *"Core-service RTO | **≤ 4 hours target**"*, with the standing rule *"If a goal cannot be met
without violating evidence quality, cost or safety, the product MUST preserve correctness and surface
delay/degraded status."*

**`OPS-001` (PRD §30.2):** *"`app.sqlite` replication meets ≤15-minute target and **restore is tested
monthly** | Internal operations | backup tooling | S3 | **Timestamped restore report and integrity
checks pass**."* `UAT-OPS-02` (PRD §41.2): *"Restore app DB in isolated drill → **Integrity/reference
checks pass; no emails/webhooks/providers/real sessions fire**."*

**Ephemeral and corpus data must be absent from what is restored.** PRD §39.3: *"A CI/restore test
asserts that `ephemeral.sqlite` and corpus files are absent from the Litestream destination."*
PRD §10.4: ephemeral content *"MUST NOT enter Litestream, daily/weekly backups, exports or support
tools"*, and is *"not recoverable after expiry or server loss"* — a restored drill environment must
therefore show ephemeral content **absent**, and that is correct behaviour, not a defect.

**The consumed contracts, restated so this ticket is cold-startable:**

- **`RLSE-05`** (`infra/backup/lib/api.mjs`) exports `restoreToPath(...)` (the primitive this drill
  builds on), `createRecoveryPoint(...)` (which returns only **confirmed** points, each carrying
  `{ id, takenAt, generation, objectKey, byteSize, integrity, schemaHead, elapsedMs }`),
  `measureLag()`, `scanDestination(store)` (fails when the destination holds an ephemeral database, a
  corpus file, an application binary, an export or a log), and the thresholds
  `BACKUP_LAG_WARN_SECONDS = 600`, `BACKUP_LAG_CRITICAL_SECONDS = 900`,
  `RECOVERY_POINT_MAX_AGE_SECONDS = 86400`. It also ships `FakeLitestream` + `LocalObjectStore`, the
  offline substrate this ticket reuses.
- **`DATA-01`** (`01-app-data`) exports `migrationStatus(databasePath)` → `{ applied, pending, head }`
  and `assertSchemaUpToDate(db)`; `APP_SQLITE_PRAGMAS` includes `journal_mode = WAL` and
  `foreign_keys = ON`.
- **`DATA-08`** (`01-app-data`) exports `EPHEMERAL_FILE_GLOBS` and `assertNotBackedUp(globs)`.
  Neither `DATA-01` nor `DATA-08` is a `blocked_by` of this ticket (breakdown-plan §5.19 gives
  `RLSE-05` only), so every call site degrades to a locally-defined equivalent and records
  `SKIPPED_NOT_AVAILABLE` — never a silent pass.

**Why `RLSE-05` is the only blocker, and why this ticket deliberately does not use `RLSE-02`.**
breakdown-plan §6.2: `RLSE-05 --> RLSE-09`. Sub-PRD **D5** records the reason `infra/deploy/host/lib/**`
must not be imported here: `RLSE-02` is not in this ticket's blocker closure, **and** PRD §42.3 step 1
requires an *isolated temporary host* while PRD §23.2's whole-server sequence begins with *"recreate
Sydney compute/storage"* — a drill that depends on the production host's tooling cannot run when that
host is gone.

**Accepted caveats carried forward, documented not enforced here:**

- **Where the drill runs is sub-PRD open question Q-RLSE-5**, with the **Founder** approving any
  spend (sub-PRD **D18**): a temporary Lightsail instance costs money per drill; containers on the
  founder workstation cost nothing. This ticket ships the workstation/container path as the default
  and the temporary-host path as an option, and records which was used.
- **`ASSR-08`** (`23-assurance`, `tests/integration/recovery/**`, `blocked_by` this ticket) asserts
  *"`ephemeral.sqlite` and corpus files are absent from backups"* against this ticket's exported
  helpers. This ticket must export them; it must not write `tests/**`.
- **The whole-server *runbook* is `RLSE-10`'s** (`docs/runbooks/server-rebuild.md`,
  `docs/runbooks/backup-restore.md`, `blocked_by` this ticket). This ticket ships the **ordered
  runner** those runbooks quote.

## Goal

Produce `infra/recovery/**`: an isolated recovery environment builder that cannot reach email,
webhooks, SSO or a model provider; a drill runner implementing PRD §42.3's seven steps against a
selected recovery point; a whole-server recovery runner implementing PRD §23.2's ordered sequence; and
a timestamped report that states the **achieved RPO and RTO** against PRD §13.2's ≤15-minute and
≤4-hour targets. Completion is mechanically checkable offline: the drill runs end to end against a
synthetic `app.sqlite` and `RLSE-05`'s local stub, producing a report; a canary outbound call to
email, a webhook, an SSO callback or a model provider **fails** and is recorded as blocked; restored
sessions and credentials are proven disabled; a corrupted recovery point fails at step 3 with the
drill reporting failure rather than success; and the report either meets the PRD §13.2 targets or
records the measured shortfall explicitly — a report that omits the achieved figures is a failed
drill.

## Non-goals

- **No Litestream configuration, replication or recovery-point generation.** `RLSE-05`
  (`infra/backup/**`); this ticket **consumes** `restoreToPath` and `createRecoveryPoint`.
- **No S3 bucket, prefix, policy or lifecycle.** `RLSE-04` (`infra/aws/**`).
- **No production host baseline, systemd unit or host primitive.** `RLSE-02`
  (`infra/deploy/host/**`) — and per sub-PRD **D5** this ticket must not import it. The drill
  environment is built by this ticket's own minimal builder.
- **No app deploy, rollback or corpus promotion.** `RLSE-06`, `RLSE-07`. The whole-server runner
  **invokes** them through seams when they exist, and records `UNAVAILABLE` when they do not.
- **No alerting, external checks or status page.** `RLSE-08` (`infra/deploy/monitoring/**`).
- **No runbooks.** `RLSE-10` (`docs/runbooks/**`), `blocked_by` this ticket.
- **No cross-boundary test suite.** `tests/integration/recovery/**` is `23-assurance` (`ASSR-08`,
  `blocked_by` this ticket). This ticket exports the assertions `ASSR-08` drives and writes nothing
  under `tests/**` (breakdown-plan §1.1).
- **No application schema, migration or ephemeral store.** `01-app-data`; PRD §45.2 and
  breakdown-plan **A3** forbid any other module writing `packages/database/**`.
- **No deletion of any production backup object.** PRD §23.1 puts destructive deletion outside
  ordinary runtime (`RLSE-04`'s break-glass identity). The drill reads; only the **isolated copy** it
  created is destroyed, and only under the controlled procedure of PRD §42.3 step 7.
- **No real credential, host, provider or customer data.** PRD §20.2, §39.6.
- **No `infra/compose/**`.** `RUNT-09` (`03-app-runtime`), breakdown-plan **A7**. The drill environment
  is this ticket's own artifact and must not reuse or reference the local development stack.

## File-scope (write-owns)

- `infra/recovery/**` — the isolation builder, the drill runner, the whole-server recovery runner, the
  report schema and writer, the exported assertions, `test/**` and `fixtures/**`.

Does not touch:

- `infra/deploy/**` (including **`infra/deploy/host/lib/**`, which must not be imported** — sub-PRD
  **D5**) — `RLSE-01`, `RLSE-02`, `RLSE-06`, `RLSE-07`, `RLSE-08`, `RLSE-11`.
  `infra/{cloudflare,aws,backup}/**` — `RLSE-03`, `RLSE-04`, `RLSE-05` (read-only consumption of
  `infra/backup/lib/api.mjs`). `docs/runbooks/**` — `RLSE-10`.
- **`infra/compose/**` — `RUNT-09` (`03-app-runtime`), breakdown-plan A7.**
- `packages/database/**` — `01-app-data`. `tests/**` — `23-assurance` (`ASSR-08`). `apps/**`,
  `packages/**`, `services/**`, `pipelines/**`, `schemas/**` — their owning modules. Root manifests,
  lockfiles, `.github/workflows/**` — `00-foundation`. `docs/PRD.md`, `docs/prd/breakdown-plan.md` —
  frozen / not this ticket's to edit.

**Serial-safety analysis.** First decomposition (breakdown-plan §1 header: `phase: 1`, nothing merged,
no in-flight ticket) — nothing has previously written `infra/recovery/**`. breakdown-plan §4 gives the
whole tree to `18-ops-release` and §5.19 gives it wholly to this ticket; siblings own disjoint trees.
In the sub-PRD wave shape this ticket runs in wave 4 concurrently with `RLSE-06`
(`infra/deploy/promote/**`) and `RLSE-08` (`infra/deploy/monitoring/**`) — disjoint trees. Its only
blocker, `RLSE-05`, merges before it starts. `infra/compose/**` belongs to `RUNT-09` and must not be
touched here (breakdown-plan **A7**, §4.1).

## Deliverables

1. **`infra/recovery/README.md`** — one page: the seven PRD §42.3 steps as executed, the isolation
   guarantees and how they are proven, the two environment options (container on the workstation;
   temporary host) with their cost consequence (sub-PRD **Q-RLSE-5**), the report location, and the
   statement that this repository holds no production credential (PRD §20.2).
2. **`infra/recovery/lib/isolation.mjs`** — PRD §42.3 step 1, made **provable** rather than
   configured:
   - `buildIsolatedEnvironment({ mode: 'CONTAINER' | 'TEMP_HOST', root })` produces an environment
     whose egress is denied by default. In `CONTAINER` mode isolation is a network namespace with no
     default route plus an explicit deny-list; in `TEMP_HOST` mode it is documented firewall rules
     applied at creation.
   - `assertIsolated(env)` **actively probes** each forbidden channel and requires failure: an SMTP
     connection, an HTTPS webhook POST, an SSO callback URL, and each approved model-provider
     endpoint. Every probe target is drawn from a committed list and every result is recorded as
     `BLOCKED` with the error class — a probe that **succeeds** aborts the drill with
     `ISOLATION_BREACH` before any customer data is restored (PRD §23.2, §42.3 step 1; `UAT-OPS-02`).
   - Configuration overrides force the restored application into drill mode: email, webhook, SSO and
     provider adapters disabled; `AER_DRILL=1`.
3. **`infra/recovery/lib/select-point.mjs`** — PRD §42.3 step 2: list recovery points from the backup
   store through `RLSE-05`'s read-only client, select by `--at <timestamp>` / `--id <id>` / `--latest`,
   and retrieve the **compatible app and corpus manifests** for that point (the app
   `app-release-manifest.json` from `RLSE-01`'s layout and the corpus `release-manifest.json` recorded
   for the active pointer at that time). It records the selected point's `takenAt`, which is the
   basis of the achieved-RPO calculation.
4. **`infra/recovery/lib/restore.mjs`** — PRD §42.3 step 3: call `RLSE-05`'s `restoreToPath` into the
   isolated environment, replay WAL, then run — in this order, each recorded separately —
   `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, a **schema check** (table/column set against
   the restored release's expectation), and `DATA-01`'s `migrationStatus()` asserting no pending
   migration and a head equal to the app manifest's `app_schema_migration_head`. Any failure marks the
   drill `FAILED` and continues to the report — a drill that stops without a report has produced no
   evidence (PRD §42.3 step 7).
5. **`infra/recovery/lib/verify-references.mjs`** — PRD §42.3 step 4: sample organisations, research
   records, answers, claims and citations from the restored database and verify each reference
   resolves against **exact corpus release IDs** — the answer's pinned `corpus_release_id` must equal
   a release id recorded in the retrieved corpus manifest, and every citation must name a
   `document_version_id`/`node_version_id` present in that release. Sampling is deterministic
   (seeded), the sample size is configurable with a documented default, and the check records counts
   per entity type plus every unresolved reference **by id only** — never by content (PRD §22).
6. **`infra/recovery/lib/prove-credentials-disabled.mjs`** — PRD §42.3 step 5: after restore, assert
   that no real session or credential is usable in the drill. It rotates or invalidates
   session/credential material inside the isolated copy through a `CredentialDisablementProvider`
   seam (bound by the restored application's own tooling where available), then **proves** it: an
   authentication attempt with a restored session token fails, and a restored machine credential is
   rejected. An unbound provider fails the step with `CREDENTIALS_NOT_PROVEN_DISABLED` — never a
   silent pass (PRD §23.2 *"real sessions disabled"*; `UAT-OPS-02`).
7. **`infra/recovery/lib/readonly-exercise.mjs`** — PRD §42.3 step 6: bring up a **read-only** Search
   against the retrieved corpus release and perform saved-record retrieval from the restored database.
   Both run through seams (`SearchTarget`, `RecordReader`) that fail closed and record `UNAVAILABLE`
   when the component is not present, so the drill is honest about what it exercised. No write path is
   permitted in this step; a write attempt fails the drill.
8. **`infra/recovery/lib/ephemeral-absence.mjs`** — the PRD §39.3/§10.4 assertion, exported for
   `ASSR-08` (`23-assurance`, `blocked_by` this ticket):
   `assertEphemeralAndCorpusAbsent({ backupStore, restoredRoot })` — delegates to `RLSE-05`'s
   `scanDestination` for the backup side and additionally asserts the **restored** tree contains no
   `ephemeral.sqlite*`, no corpus database or index file and no application binary. It also calls
   `DATA-08`'s `assertNotBackedUp(EPHEMERAL_FILE_GLOBS)` when `packages/database` resolves and records
   `SKIPPED_NOT_AVAILABLE` otherwise. PRD §10.4 makes ephemeral absence the **expected** outcome, and
   the report says so in words so no operator reads it as data loss.
9. **`infra/recovery/report.mjs` + `infra/recovery/schema/drill-report.schema.json`** — PRD §42.3
   step 7, the ticket's primary artifact. Required members:
   `{ report_id, drill_kind: 'MONTHLY_RESTORE' | 'WHOLE_SERVER', environment_mode, started_at,
     finished_at, operator, recovery_point: { id, takenAt, generation, objectKey, byteSize },
     achieved_rpo_seconds, achieved_rto_seconds, rpo_target_seconds: 900, rto_target_seconds: 14400,
     rpo_met: boolean, rto_met: boolean, shortfall: { rpo_reason, rto_reason } | null,
     isolation: [{ channel, result: 'BLOCKED' | 'REACHED', error_class }],
     integrity: { integrity_check, foreign_key_check, schema_check, migration_head },
     references: { sampled, resolved, unresolved: [{ entity, id, code }] },
     credentials_disabled: { proven: boolean, method, code },
     exercises: [{ id, status, latency_ms }],
     ephemeral_absence: { backup_scan, restored_scan, data08_check },
     app_release, corpus_release, counts, failures: [{ step, code }], destroyed_at, outcome }`.
   **`achieved_rpo_seconds` is `drill_start − recovery_point.takenAt`** and
   **`achieved_rto_seconds` is `service_restored − drill_start`**, both defined in the schema's
   `description` fields so two drills are comparable. When a target is missed, `shortfall` **must** be
   populated with the measured cause; a report with `rpo_met: false` and no `shortfall` is invalid
   against the schema. Basis: PRD §42.3 step 7 (*"record recovery point, start/end time, achieved
   RPO/RTO, counts, failures and operator"*); PRD §13.2's targets; PRD §13.2's standing rule that an
   unmet goal is surfaced, not hidden. The report carries **no customer content** — ids, counts and
   codes only (PRD §22).
10. **`infra/recovery/drill.mjs`** — the CLI:
    `node drill.mjs [--mode container|temp-host] [--at <ts> | --id <id> | --latest]
    [--sample <n>] [--operator <name>] [--keep] [--json]`. It runs steps 1–7 in order, writes the
    report to `infra/recovery/reports/drill-<timestamp>.json`, and then performs PRD §42.3 step 7's
    *"destroy isolated customer-data copy under controlled procedure"*: the isolated copy is destroyed
    in a `finally` block, its destruction is recorded in the report, and `--keep` requires an explicit
    typed acknowledgement and marks the report `RETAINED_COPY` so a lingering customer-data copy can
    never be invisible. Exit codes: `0` drill passed, `2` drill ran and failed (report written), `1`
    the drill could not run.
11. **`infra/recovery/whole-server.mjs`** — PRD §23.2/§42.3's ordered whole-server recovery, as a
    runner rather than prose: the steps
    `infrastructure_and_secrets → app_database → compatible_app_and_corpus → auth_records_search →
    quick → deep → exports_monitoring`, each with a precondition, an action (delegating to `RLSE-06`'s
    `runDeploy`, `RLSE-07`'s `promote`/`rollback` and `RLSE-05`'s `restoreToPath` through seams that
    record `UNAVAILABLE` when absent) and a verification. It refuses to advance past
    `compatible_app_and_corpus` when compatibility or integrity is uncertain and instead prints
    `REMAIN_IN_MAINTENANCE` — PRD §42.3: *"If compatibility or integrity is uncertain, remain in
    maintenance mode."* It records the same report shape with `drill_kind: 'WHOLE_SERVER'` and the
    achieved RTO measured against PRD §13.2's 4-hour target and PRD §23.2's recovery priority order.
12. **`infra/recovery/lib/api.mjs`** — the stable surface `ASSR-08` and `RLSE-10` bind:
    `runDrill(opts)`, `runWholeServerRecovery(opts)`, `assertEphemeralAndCorpusAbsent`,
    `assertIsolated`, `DRILL_STEP_IDS`, `RPO_TARGET_SECONDS = 900`, `RTO_TARGET_SECONDS = 14400`.

## Acceptance checklist (classified)

Cross-references: `OPS-001` (this ticket is the *"restore is tested monthly"* half — *"Timestamped
restore report and integrity checks pass"*), `OPS-002` (the drill report is an observability artifact
and carries no content), `OPS-003` (the default drill environment costs A$0; any paid option is a
Founder decision), `ADM-002` (not applicable — corpus promotion is `RLSE-07`'s; the drill only reads
corpus manifests; stated so the absence is deliberate).

- [ ] `[machine]` The drill runs steps 1–7 in PRD §42.3's order and the recorded step sequence equals
      `DRILL_STEP_IDS` — asserted against a literal list (PRD §42.3)
- [ ] `[machine]` **Isolation is proven, not configured.** `assertIsolated` probes SMTP, an HTTPS
      webhook, an SSO callback and each approved provider endpoint, requires every one to fail, and
      records the error class; a fixture in which **any** probe succeeds aborts with `ISOLATION_BREACH`
      **before** any customer data is restored (PRD §23.2; PRD §42.3 step 1; `UAT-OPS-02` "no
      emails/webhooks/providers/real sessions fire")
- [ ] `[machine]` Restore + WAL replay + `PRAGMA integrity_check` + `PRAGMA foreign_key_check` +
      schema check + `migrationStatus()` head match all pass on a healthy fixture; each is recorded
      **separately** in the report (PRD §42.3 step 3)
- [ ] `[machine]` A **corrupted** recovery point fails at step 3, the drill is marked `FAILED`, and a
      report is still written naming the failing check — a drill that produces no report has produced
      no evidence (PRD §42.3 step 7; `OPS-001`)
- [ ] `[machine]` Reference verification resolves sampled organisation/record/answer/claim/citation
      references against **exact corpus release IDs**, and an answer pinned to a release absent from
      the retrieved manifest is reported as unresolved **by id only**, never by content (PRD §42.3
      step 4; PRD §22)
- [ ] `[machine]` Credential disablement is **proven**: a restored session token and a restored
      machine credential are both rejected after the step; an unbound provider fails with
      `CREDENTIALS_NOT_PROVEN_DISABLED` and never passes silently (PRD §23.2 "real sessions disabled";
      PRD §42.3 step 5)
- [ ] `[machine]` Read-only Search and saved-record retrieval run, and any **write** attempt during
      step 6 fails the drill; an unavailable component is recorded `UNAVAILABLE`, never as passed
      (PRD §42.3 step 6)
- [ ] `[machine]` `assertEphemeralAndCorpusAbsent` fails when the backup destination or the restored
      tree contains an `ephemeral.sqlite*`, a corpus database/index file or an application binary; it
      calls `DATA-08`'s `assertNotBackedUp` when available and records `SKIPPED_NOT_AVAILABLE`
      otherwise — never a silent pass (PRD §39.3; §10.4; `DATA-08` deliverable 8; `ASSR-08`)
- [ ] `[machine]` The report validates against the committed schema and contains **`achieved_rpo_seconds`
      and `achieved_rto_seconds` with their targets and pass/fail flags**; a report with `rpo_met:
      false` or `rto_met: false` and an empty `shortfall` is **invalid** — the shortfall must be
      recorded honestly (PRD §42.3 step 7; PRD §13.2 "RPO ≤ 15 minutes", "RTO ≤ 4 hours")
- [ ] `[machine]` The report carries no customer content: a `content-canary-<uuid>` seeded into a
      restored record title, an answer body, a citation snippet and an error message appears in **no**
      report byte and no log byte (PRD §22; PRD §37.3)
- [ ] `[machine]` The isolated customer-data copy is destroyed in a `finally` block on every path
      including failure; `--keep` requires a typed acknowledgement and marks the report
      `RETAINED_COPY` (PRD §42.3 step 7 "destroy isolated customer-data copy under controlled
      procedure"; PRD §10.3)
- [ ] `[machine]` The drill performs **no** delete against the production backup store — asserted with
      a recording store that fails the test on any mutating call (PRD §23.1)
- [ ] `[machine]` The whole-server runner executes PRD §23.2's priority order
      (`auth/records → Search → saved answers → Quick → Deep → exports/alerts`) and **refuses to
      advance** past compatibility verification when compatibility or integrity is uncertain, printing
      `REMAIN_IN_MAINTENANCE` (PRD §42.3 "If compatibility or integrity is uncertain, remain in
      maintenance mode"; PRD §23.2)
- [ ] `[machine]` The whole-server runner records `UNAVAILABLE` for any seam whose owning tool is
      absent (`RLSE-06`, `RLSE-07`) and never reports a step as completed on a missing dependency
      (PRD §44.4 principle: an unimplemented thing is never silently called present)
- [ ] `[machine]` This module does **not** import `infra/deploy/host/lib/**` — asserted by a source
      scan; the drill environment is self-contained so it can run when the production host is gone
      (sub-PRD **D5**; PRD §23.2 "recreate Sydney compute/storage")
- [ ] `[machine]` No file outside `infra/recovery/**` is modified — asserted by
      `git diff --name-only`. In particular `infra/compose/**` is untouched and nothing is written
      under `tests/**` (breakdown-plan **A7**, §1.1; sub-PRD D2)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `OPS-001` and `UAT-OPS-02`, the tenant/PII
      impact (the drill handles real customer data in an isolated copy that is destroyed), the
      retention impact (PRD §10.3), the cost impact (container mode A$0; temp-host mode is a Founder
      decision) and the rollback path (a drill mutates nothing outside its isolated copy)
- [ ] `[fixture]` **Replay of a recorded drill.** The committed fixture under
      `infra/recovery/fixtures/drills/` — a recorded recovery point plus the expected report — replays
      to the same step sequence, the same integrity outcomes and the same reference-resolution counts
      (excluding timestamps and the measured RPO/RTO, which are recorded separately). This is the
      reproducible drill evidence PRD §26's *"Backup lag, monthly restore procedure … are
      demonstrated"* and `docs/runbooks/backup-restore.md` (`RLSE-10`) rest on
- [ ] `[human]` **One real monthly drill** against the real S3 backup and a real recovery point,
      performed by the founder, producing a timestamped report with the achieved RPO/RTO and confirming
      no email, webhook, SSO callback or provider call fired. **Not required to merge** — PRD §20.2
      forbids giving coding agents backup credentials or customer data; the merge-time substitute is
      the full drill against `RLSE-05`'s `FakeLitestream` + `LocalObjectStore` and a synthetic
      `app.sqlite`, which exercises every step, every isolation probe and the identical report path
- [ ] `[human]` `UAT-OPS-02` executed by the founder: *"Restore app DB in isolated drill → Integrity/
      reference checks pass; no emails/webhooks/providers/real sessions fire."* **Not required to
      merge** — PRD §41.2 makes it a manual acceptance script (PRD §41.2, §43.4)
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python authored; the read-only Search
      exercise invokes the search process as an external service (PRD §45.3)

## Test plan

Reviewer steps. Everything except the two `[human]` rows runs offline with no network, no AWS account,
no customer data and no production credentials (PRD §20.2):

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/infra-recovery`, **or** `node --test infra/recovery/test` if the workspace
   member is absent (open question **Q-RLSE-9**). Both must pass.
3. Harness: `test/helpers/world.mjs` builds a synthetic world — an `app.sqlite` created with
   `DATA-01`'s pragmas and migrations and seeded with **synthetic** organisations, records, answers,
   claims and citations carrying a `content-canary-<uuid>`; a fake corpus manifest with known release
   ids; `RLSE-05`'s `FakeLitestream` + `LocalObjectStore` holding several generations;
   `test/helpers/probeTargets.mjs` providing local listeners that can be flipped between "refuses
   connection" and "accepts" to exercise `assertIsolated` in both directions;
   `test/helpers/recordingStore.mjs` failing the test on any mutating call. Copy the recording-stub
   construction pattern from `docs/prd/04-corpus-contract/tickets/CRPS-07-*.md`.
4. **`sequence.test.mjs`** — a passing drill; assert the recorded step order equals `DRILL_STEP_IDS`
   and matches PRD §42.3's numbering.
5. **`isolation.test.mjs`** — all probes refused → `BLOCKED` recorded with error classes; then flip
   each probe target to accept in turn and assert `ISOLATION_BREACH` **before** any restore call is
   made (assert the restore helper was never invoked).
6. **`restore.test.mjs`** — healthy point passes all four checks; then a page-corrupted snapshot
   (integrity), a broken FK (foreign_key_check), a missing table (schema) and a pending migration
   (head mismatch). Each asserts `FAILED`, the specific code, and that a report was still written.
7. **`references.test.mjs`** — sampled resolution with a seeded RNG (deterministic); an answer pinned
   to an unknown release and a citation naming an absent node each appear in `unresolved` **by id**;
   assert no content appears anywhere in the report.
8. **`credentials.test.mjs`** — provider bound: a restored session token and a restored machine
   credential are both rejected after the step; provider unbound: `CREDENTIALS_NOT_PROVEN_DISABLED`.
9. **`exercise.test.mjs`** — read-only Search and record retrieval succeed against the fixture; a write
   attempt fails the drill; an absent component records `UNAVAILABLE` and does not pass.
10. **`ephemeral.test.mjs`** — seed the backup destination with an `ephemeral.sqlite`, then with a
    corpus file, then with an application archive; assert failure each time. Seed the restored tree
    similarly. Assert the `DATA-08` delegation records `SKIPPED_NOT_AVAILABLE` when
    `packages/database` is stubbed unresolvable.
11. **`report.test.mjs`** — validate against the committed schema; assert `achieved_rpo_seconds` equals
    `drill_start − recovery_point.takenAt` and `achieved_rto_seconds` equals
    `service_restored − drill_start` with an injected clock; construct a report with `rpo_met: false`
    and an empty `shortfall` and assert schema **invalidity**; assert the canary is absent.
12. **`destruction.test.mjs`** — the isolated copy is gone after a passing run, after a failing run and
    after a thrown exception; `--keep` without acknowledgement refuses; with acknowledgement the report
    is marked `RETAINED_COPY`.
13. **`whole-server.test.mjs`** — the ordered runner over the fixture: assert the PRD §23.2 priority
    order; make compatibility uncertain and assert `REMAIN_IN_MAINTENANCE` with no further step run;
    unbind the `RLSE-06`/`RLSE-07` seams and assert `UNAVAILABLE` rather than success.
14. **`isolation-source-scan.test.mjs`** — assert no import of `infra/deploy/host/lib/**` anywhere in
    the module (sub-PRD **D5**).
15. **`golden.test.mjs`** — the `[fixture]` row: replay the committed drill fixture and diff the report
    against the recorded golden, ignoring timestamps and the measured RPO/RTO.
16. **Diff check** — `git diff --name-only` lists only paths under `infra/recovery/`.
17. **Reviewer focus (data-loss- and privacy-sensitive):** confirm the isolation probes run **before**
    any customer data is written into the environment; confirm the destruction path cannot be skipped
    by an exception, a signal or a flag other than the acknowledged `--keep`; confirm the drill cannot
    write to the production backup store or the production host; confirm no restored customer content
    can reach the report, a log line or stdout; confirm the achieved RPO/RTO are computed from
    recorded timestamps rather than asserted constants; confirm a failing drill still writes a report
    (silence is the worst outcome); confirm the sampling seed is recorded so a drill is reproducible.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(docs PR → merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/18-ops-release/README.md` (version +0.1 with a changelog line), **then** change code. Silent
divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **The achieved RTO exceeds PRD §13.2's 4-hour target** → record it. `shortfall.rto_reason` exists
  precisely for this, PRD §13.2 says an unmet goal must be surfaced rather than hidden, and PRD §26
  requires the restore procedure to be *demonstrated*, not to be passed by definition. Put the measured
  figure in the PR's latency line (PRD §45.4) and in `docs/prd/18-ops-release/README.md`. Changing the
  target is a **product/NFR** change under PRD §45.5 requiring founder approval.
- **The achieved RPO exceeds 15 minutes** → the same rule, plus a cross-check against `RLSE-05`'s
  measured replication lag: an RPO breach usually means a replication problem, not a drill problem.
  Raise it against `RLSE-05` if the lag is the cause, and record both figures.
- **Isolation cannot be proven in the chosen environment** (a container that still has egress) → do
  **not** proceed with real customer data. `ISOLATION_BREACH` is the correct outcome. Record the
  limitation in `docs/prd/18-ops-release/README.md` Q-RLSE-5 and choose the temp-host mode — which is
  a **cost** decision and therefore the Founder's (sub-PRD **D18**).
- **The drill needs a temporary Lightsail instance** → sub-PRD **Q-RLSE-5**. Record the per-drill cost
  against PRD §24.1's table in `docs/prd/18-ops-release/README.md` and let the Founder decide; never
  assume the spend inside this ticket.
- **`DATA-01`'s `migrationStatus` or `DATA-08`'s `assertNotBackedUp` is unavailable or differently
  shaped** → neither is a `blocked_by` of this ticket. Keep the local equivalents authoritative,
  record `SKIPPED_NOT_AVAILABLE` in the report, raise a docs PR against the owning ticket, and never
  write `packages/database/**` (breakdown-plan **A3**; PRD §45.2).
- **`ASSR-08` needs an assertion this module does not export** → export it here (deliverable 8/12)
  rather than letting `23-assurance` re-derive the rule; record the addition in
  `docs/prd/18-ops-release/README.md` and notify `ASSR-08`. Do not write `tests/**`
  (breakdown-plan §1.1).
- **Ephemeral content is missing from the restored environment and someone reads it as data loss** →
  it is the required behaviour (PRD §10.4: ephemeral content is *"not recoverable after expiry or
  server loss"*). Make the report say so in words (deliverable 8) rather than adding ephemeral data to
  the backup — adding it would falsify PRD §10.4, §39.3 and `DATA-08` at once.

**3. Escalation.** *"Monthly restore runs in an isolated environment with email, webhook, provider
calls, SSO callbacks and real sessions disabled"* (PRD §23.2) and PRD §42.3's seven steps are the
evidence behind `OPS-001`, `UAT-OPS-02` and PRD §26's *"Backup lag, monthly restore procedure, app
rollback and CorpusRelease rollback are demonstrated"*. If the isolation guarantee is outright
falsified — if a drill genuinely cannot be run without reaching a real provider, mailbox or customer —
stop, escalate for re-review, and write back to `docs/prd/18-ops-release/README.md` and
`docs/prd/breakdown-plan.md` before any drill touches real data. Never run a drill with egress open,
and never report a drill as passed without the achieved RPO/RTO, inside this ticket.
