---
id: RLSE-06
title: "App deploy and rollback tooling"
module: 18-ops-release
lane: 18-ops-release
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RLSE-02, RLSE-05]
blocks: [RLSE-10]
---

# RLSE-06 — App deploy and rollback tooling

Implements PRD §20.4, §39.7 and §44.3 — requirement `ADM-002` (the founder-authorised promotion
pattern), families `OPS-001`/`OPS-002`, epic `E33-PROMOTION`. **No ADR — the decision is already made
in PRD §39.7, which gives the eight-step deployment sequence; this is build ticket 6 of 11 against
it.** One durable sub-decision — the pointer mechanism — is sub-PRD open question **Q-RLSE-3** and is
recorded by this ticket as `docs/adr/NNNN-application-release-pointer.md`.
Parent sub-PRD: [18-ops-release README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on:
[`RLSE-02`](RLSE-02-production-host-baseline-systemd-cgroups-filesystem-layout.md) and
[`RLSE-05`](RLSE-05-litestream-replication-and-recovery-point-validation.md) — mirrors `blocked_by`.
**Why `builder`:** a bounded change inside one module's declared file-scope implementing a
step-by-step sequence PRD §39.7 already fixes — not a new subsystem decision.

## Background + basis

**PRD §39.7 is the executable specification, quoted in full:**

> 1. CI produces a signed/checksummed release archive, OpenAPI, migrations, SBOM and compatibility
>    manifest; tests and scans pass.
> 2. Founder authenticates with **recent MFA** and selects **exact release version/hash**.
> 3. Tool checks **disk/memory, backup lag, active app/corpus compatibility and forces a recovery
>    point**.
> 4. **Expand migrations run; destructive/contract changes are not permitted in the same release that
>    removes old readers.**
> 5. **Candidate systemd units start on a private health route/ports and verify DB/search.**
> 6. **Tunnel/upstream pointer switches atomically.**
> 7. **Authenticated synthetic Search and bounded Answer pass.**
> 8. **Prior release remains available for rollback**; backfill/contract cleanup is a later release.
>
> **Rollback chooses a compatible prior release directory. Database rollback is not automatic; use a
> forward fix unless the runbook explicitly restores a verified recovery point during maintenance.**

**PRD §20.4 states the same requirement from the product side:**

> **Founder-authorised promotion requires recent MFA, explicit version/changelog confirmation,
> health/space/compatibility checks and forced database recovery point.** Use expand/contract SQLite
> migrations, background backfills, **versioned release directories, candidate health checks and an
> atomic application pointer.** Application and corpus releases are independently versioned and
> declare compatibility ranges. High-risk capabilities launch behind internal/sandbox/pilot feature
> flags.

**A failed release must not touch active data.** PRD §12.2: *"**Failed releases MUST NOT modify active
production data.**"* PRD §18.4 says the same for corpus data.

**PRD §44.3 makes these files serial-owned:** *"Serial owners are required for … **active
release/promotion files** and production Compose/deployment configuration."* breakdown-plan §4.1
resolves `infra/deploy/promote/**` to this ticket as its single owner.

**The forced recovery point is not optional.** PRD §23.1: *"**Force a confirmed recovery point before
migrations**, auth/application changes, bulk customer operations and key rotation."* PRD §42.2 adds
the gate: *"Last valid recovery point | older than 24 h | Immediate | **Resolve before deployment**"*,
and *"Backup lag | warn 10 min, critical 15 min | … | **Stop risky deploy/write operation**"*.

**The consumed contracts, restated so this ticket is cold-startable:**

- **`RLSE-01`** (`infra/deploy/release/**`): `verify-release.mjs` and `lib/api.mjs`'s
  `verifyArchive(path, opts) -> { ok, findings }` / `readManifest(path)`; the archive is
  `aer-app-<version>.tar.zst` and its manifest `app-release-manifest.json` carries `release_id`,
  `git_commit`, `members[]`, `files[]`, `compatibility {corpus:{min,max}, search_protocol:{min,max},
  app_schema_migration_head}`, `migrations {head, count, checksums}` and `signature` (sub-PRD **D20**).
- **`RLSE-02`** (`infra/deploy/host/lib/**`, sub-PRD **D4**): `LAYOUT` path constants;
  `HostAdapter` with `SystemdHostAdapter` and `LocalRootHostAdapter({ root })`;
  `swapPointer(adapter, pointerPath, targetPath)` and `withPointerRollback(...)`;
  `requireAuthorisation(provider, { operation, subject, maxAgeSeconds })` throwing
  `AUTHORISATION_REQUIRED` / `AUTHORISATION_STALE`; `preflight.mjs` with its `BackupLagProvider` and
  `CompatibilityProvider` seams; and the unit names/ports of sub-PRD **D19** —
  serving `aer-app` (`127.0.0.1:3000`), `aer-worker`, `aer-search` (`127.0.0.1:7700`);
  candidate `aer-app-candidate` (`127.0.0.1:3001`), `aer-worker-candidate`,
  `aer-search-shadow` (`127.0.0.1:7701`).
- **`RLSE-05`** (`infra/backup/lib/api.mjs`): `createRecoveryPoint(...)` (a
  `RecoveryPointProvider` that returns only **confirmed** points), `measureLag()` and the thresholds
  `BACKUP_LAG_WARN_SECONDS = 600`, `BACKUP_LAG_CRITICAL_SECONDS = 900`,
  `RECOVERY_POINT_MAX_AGE_SECONDS = 86400`.
- **`DATA-01`** (`01-app-data`, `packages/database/src/migrate/**`):
  `runMigrations({ databasePath, requireRecoveryPoint, recoveryPoint })`, `migrationStatus(path)` and
  the expand-only policy — *"The runner then refuses to apply [a contract migration] unless
  `<expanded-in>` is already present in `schema_migration` **with a different `run_id`** — the
  mechanical form of PRD §39.7's 'destructive/contract changes are not permitted in the same release
  that removes old readers'."* This ticket **invokes** that runner and adds no migration policy of
  its own.

**Why these blockers.** breakdown-plan §6.2: `RLSE-02 --> RLSE-06` and `RLSE-05 --> RLSE-06`. Step 3
needs `RLSE-05`'s confirmed recovery point and lag measurement; steps 5–6 need `RLSE-02`'s candidate
units and atomic pointer. `RLSE-01` is reached transitively through `RLSE-02`.

**Accepted caveats carried forward, documented not enforced here:**

- **No production host, SSH key or MFA credential exists in this repository.** PRD §20.2. Every
  merge-blocking check runs through `LocalRootHostAdapter` and a stub `AuthorisationProvider`; the
  real promotion is irreducibly a `[human]` action (PRD §20.4).
- **The app candidate shares `app.sqlite` by design** (sub-PRD **D8**). PRD §39.7 runs expand
  migrations at step 4, *before* the candidate starts at step 5, and PRD §42.1 requires readiness to
  prove *"App DB writable"*. The prescribed mitigations are expand-only migrations (breakdown-plan
  **A5**) and the forced recovery point of step 3, both enforced here. What a failed candidate must be
  provably unable to modify is the **active pointer**, **any release directory** and the **corpus
  tree** (sub-PRD **D7**) — that is what this ticket proves.
- **Post-deploy verification here is one-shot; continuous external checks are `RLSE-08`'s**
  (sub-PRD **D15**). `RLSE-08` is not in this ticket's blocker closure, so the step-7 checks are
  implemented here and `RLSE-08` implements the scheduled ones. Consolidation later is a writeback,
  not a local merge.
- **The recent-MFA assertion is a fail-closed seam** (sub-PRD **D10**/**Q-RLSE-8**). No `blocked_by`
  edge exists from this ticket to `AUTC-02`, and inventing one would change the DAG.

## Goal

Produce `infra/deploy/promote/**`: a deploy tool that executes PRD §39.7's eight steps as one
abortable transaction, and a rollback tool that returns to a compatible prior release without touching
the database. Completion is mechanically checkable offline: the recorded command sequence matches
PRD §39.7's order exactly; a **fault injected at every step** leaves `/srv/aer/app/current`, every
release directory and the whole corpus tree byte-identical; the tool refuses to start without a
confirmed recovery point, without a recent-MFA authorisation naming the exact release id/hash, with
backup lag over the PRD §42.2 critical threshold, with a last valid recovery point older than 24 h, or
with an unverified/unsigned archive; and rollback selects only a compatibility-satisfying prior
release and refuses every database operation.

## Non-goals

- **No archive build or signing.** `RLSE-01` (`infra/deploy/release/**`); this tool **verifies**.
- **No systemd unit files, cgroup limits, filesystem layout or host primitives.** `RLSE-02`
  (`infra/deploy/host/**`); this tool consumes them.
- **No Litestream configuration or recovery-point implementation.** `RLSE-05`
  (`infra/backup/**`); this tool calls `createRecoveryPoint`.
- **No corpus verification, shadow, promotion or rollback.** `RLSE-07`
  (`infra/deploy/corpus/**`). Application and corpus releases are promoted independently (PRD §20.4);
  this tool only **reads** the active corpus id to evaluate compatibility.
- **No migration authoring, runner or expand/contract policy.** `DATA-01` (`01-app-data`); PRD §44.3
  makes app migration order serial-owned there and breakdown-plan **A3**/PRD §45.2 forbid any other
  module writing `packages/database/**`.
- **No continuous external checks, alert rules or status page.** `RLSE-08`
  (`infra/deploy/monitoring/**`), sub-PRD **D15**.
- **No admin UI, audit table or internal route.** `22-internal-admin` (`INTL-04`) and `01-app-data`
  (`DATA-07`). This tool emits an audit **record** through a seam and writes no database table.
- **No feature-flag system.** PRD §20.4's *"High-risk capabilities launch behind internal/sandbox/
  pilot feature flags"* is application configuration (`RLSE-02`'s PRD §39.6 layering plus the owning
  product modules); this tool neither defines nor flips a flag.
- **No runbook.** `docs/runbooks/deploy.md` and `docs/runbooks/app-rollback.md` are `RLSE-10`, which
  is `blocked_by` this ticket. This ticket provides the commands those runbooks quote.
- **No real credential, host or MFA.** PRD §20.2, §39.6.
- **No `infra/compose/**`.** `RUNT-09` (`03-app-runtime`), breakdown-plan **A7**.

## File-scope (write-owns)

- `infra/deploy/promote/**` — the deploy and rollback tools, the step engine, the abort/compensation
  logic, the smoke checks, the audit-record shape, `test/**` and `fixtures/**`.
- Per breakdown-plan **A9** (`docs/adr/**` is shared-additive with per-file ownership, claimed by the
  creating ticket): `docs/adr/NNNN-application-release-pointer.md` — **required** (deliverable 3).
  `NNNN` is the lowest unused four-digit number at implementation time; check `docs/adr/` first and do
  not modify any existing ADR.

Does not touch:

- `infra/deploy/{release,host,corpus,monitoring,benchmark}/**` — `RLSE-01`, `RLSE-02`, `RLSE-07`,
  `RLSE-08`, `RLSE-11`. `infra/{cloudflare,aws,backup,recovery}/**` — `RLSE-03`, `RLSE-04`, `RLSE-05`,
  `RLSE-09`. `docs/runbooks/**` — `RLSE-10`.
- **`infra/compose/**` — `RUNT-09` (`03-app-runtime`), breakdown-plan A7.** Production deployment must
  not reference Compose in any form (PRD §39.2).
- `packages/database/**` — `01-app-data`, PRD §44.3 serial-owned migration order. `apps/**`,
  `packages/**`, `services/**`, `pipelines/**`, `schemas/**` — their owning modules. `tests/**` —
  `23-assurance`. Root manifests, lockfiles, `.github/workflows/**` — `00-foundation`. `docs/PRD.md`,
  `docs/prd/breakdown-plan.md` — frozen / not this ticket's to edit.

**Serial-safety analysis.** First decomposition (breakdown-plan §1 header: `phase: 1`, nothing merged,
no in-flight ticket) — nothing has previously written `infra/deploy/promote/**`. breakdown-plan §4.1
names it one of the two **serial-owned "active release/promotion files"** paths with `RLSE-06` as its
single owner; no other module may write it. Siblings own disjoint subtrees. In the sub-PRD wave shape
this ticket runs in wave 4 concurrently with `RLSE-08` (`infra/deploy/monitoring/**`) and `RLSE-09`
(`infra/recovery/**`) — disjoint trees. Both blockers merge before it starts. The ADR file is claimed
by creation under **A9**. `infra/compose/**` belongs to `RUNT-09` and must not be touched here
(breakdown-plan **A7**, §4.1).

## Deliverables

1. **`infra/deploy/promote/README.md`** — one page: the eight PRD §39.7 steps as executed, the abort
   matrix, the exact commands, the statement that database rollback is never automatic (PRD §39.7),
   and that promotion is founder-authorised and cannot be run unattended (PRD §20.4).
2. **`infra/deploy/promote/lib/steps.mjs`** — the sequence as **data**, so the order is testable
   rather than implicit: an ordered array of
   `{ id, prdStep, title, run(ctx), compensate(ctx), pointOfNoReturn: boolean }`. `id`s are exactly
   `verify_archive`, `authorise`, `preflight_and_recovery_point`, `expand_migrations`,
   `stage_release`, `start_candidate`, `verify_candidate`, `swap_pointer`, `restart_serving`,
   `post_switch_smoke`, `retain_prior`. `pointOfNoReturn` is `true` only from `swap_pointer` onward.
   A test asserts the array's `prdStep` values cover PRD §39.7's steps 1–8 in order with no gap.
3. **`docs/adr/NNNN-application-release-pointer.md`** (sub-PRD **Q-RLSE-3**, breakdown-plan **A9**) —
   records the application pointer mechanism. Required sections: Status; Context (quote PRD §20.4's
   *"atomic application pointer"* and PRD §39.3's `/srv/aer/corpus/active` *"atomic symlink/pointer"*
   row); Decision (symlink + `rename(2)` at `/srv/aer/app/current`, per sub-PRD **D3**);
   Consequences (what `systemctl` must do after a swap; how rollback works; why the tunnel needs no
   reconfiguration because the port is stable); Alternatives considered (systemd template unit with a
   port swap and a tunnel ingress change; blue/green on a second host — rejected on the PRD §24.1
   budget). State explicitly whether a serving process must be restarted or can re-exec.
4. **`infra/deploy/promote/deploy.mjs`** — the CLI:
   `node deploy.mjs --archive <path> --version <id> --confirm-hash <sha256>
   [--reason "<text>"] [--plan] [--adapter systemd|localroot --root <dir>]`.
   Behaviour per step, with its ordering constraint and abort path:

   | Step | Action | Abort leaves |
   |---|---|---|
   | `verify_archive` (§39.7.1) | `RLSE-01`'s `verifyArchive`; refuse `signature: null`; refuse when the archive's `release_id` ≠ `--version` or its manifest hash ≠ `--confirm-hash` | nothing written |
   | `authorise` (§39.7.2) | `requireAuthorisation(provider, { operation: 'APP_PROMOTE', subject: <release_id>+<hash>, maxAgeSeconds })`; **throws with no provider bound** | nothing written |
   | `preflight_and_recovery_point` (§39.7.3) | `RLSE-02`'s `preflight()` (disk vs 75/85%, memory vs the §39.2 budget, layout, config) + `RLSE-05`'s `measureLag()` (refuse at `CRITICAL`) + refuse when the last confirmed point is older than `RECOVERY_POINT_MAX_AGE_SECONDS` + `createRecoveryPoint()`; record its id | nothing written; the recovery point (if taken) is harmless |
   | `expand_migrations` (§39.7.4) | `DATA-01`'s `runMigrations({ requireRecoveryPoint: true, recoveryPoint })`; **never** passes a flag that would relax the expand-only policy | migrations are forward-only and expand-only; the active release is untouched and still serving |
   | `stage_release` | unpack into `/srv/aer/app/releases/<version>` (a **new** directory; refuse if it exists with different content), then `chmod` read-only | the new directory is removed by `compensate` |
   | `start_candidate` (§39.7.5) | `systemctl start aer-app-candidate aer-worker-candidate` bound to `127.0.0.1:3001`, pointed at the explicit release directory | candidates stopped; nothing else changed |
   | `verify_candidate` (§39.7.5) | poll the candidate's `/health/ready` until `200` or timeout; assert its reported schema head equals the manifest's `app_schema_migration_head`; assert its search reachability check passes | candidates stopped and removed; **active pointer untouched** |
   | `swap_pointer` (§39.7.6) | `swapPointer(adapter, '/srv/aer/app/current', '/srv/aer/app/releases/<version>')` — **point of no return** | `withPointerRollback` restores the previous target |
   | `restart_serving` (§39.7.6) | restart `aer-app`, `aer-worker`, `aer-search` in that order; wait for each to report ready | automatic pointer rollback + restart of the prior release |
   | `post_switch_smoke` (§39.7.7) | deliverable 6's authenticated synthetic Search and bounded synthetic Answer | automatic rollback (pointer + restart), then exit non-zero with the failing check |
   | `retain_prior` (§39.7.8) | record the prior version as the rollback target; **delete nothing** | n/a |

   `--plan` prints the exact ordered command list and every threshold it would evaluate, and performs
   **no** write and no `systemctl` call — the safe way to review a deployment.
5. **`infra/deploy/promote/lib/transaction.mjs`** — the step engine: runs steps in order, records a
   structured journal entry per step (`{ step, started_at, finished_at, status, code }`), and on
   failure runs `compensate` for every completed step in **reverse** order. It writes the journal to
   `/srv/aer/log/deploy-<version>-<timestamp>.json` and is crash-safe: a journal on disk lets a
   re-run detect an interrupted deployment and refuse to start a second one until an operator
   acknowledges it (`--resume-acknowledge`). No compensation ever touches `app.sqlite`.
6. **`infra/deploy/promote/lib/smoke.mjs`** — PRD §39.7 step 7:
   - **authenticated synthetic Search** — a login/tenant/API/search round trip against the newly
     serving app using a synthetic sandbox credential supplied by configuration (PRD §42.1
     *"Login/tenant/API/search/current release work end-to-end"*), asserting the response names the
     currently active corpus release;
   - **bounded synthetic Answer** — one Quick answer with a **hard spend cap** read from
     configuration, skipped with a recorded `SKIPPED_BUDGET` when the cost breaker is at 90% or above
     (PRD §42.1 *"strict daily spend cap"*; PRD §42.2 spend rows; PRD §24.1).
   Both take their target from the serving port and never from a hard-coded host. Neither logs the
   query, the evidence or the answer text (PRD §22). The functions are exported so `RLSE-08` can
   reuse the same assertions for its scheduled checks without duplicating semantics (sub-PRD **D15**).
7. **`infra/deploy/promote/rollback.mjs`** — `node rollback.mjs [--to <version>] [--plan]`:
   1. list `/srv/aer/app/releases/*` and read each `app-release-manifest.json`;
   2. **filter by compatibility** — the candidate prior release's `compatibility.corpus` range must
      contain the **currently active** corpus release id, and its `app_schema_migration_head` must be
      **≤** the current schema head (a prior release that predates an applied expand migration is only
      compatible because migrations are expand-only, breakdown-plan **A5**; a release requiring a
      *newer* head is refused);
   3. require `requireAuthorisation(..., { operation: 'APP_ROLLBACK' })` with a reason;
   4. `swapPointer` back and restart the serving units;
   5. run the same step-7 smoke checks;
   6. **refuse every database operation**: the tool has no code path that runs a migration, restores a
      recovery point or writes `app.sqlite`, and it prints PRD §39.7's sentence plus the path
      `docs/runbooks/app-rollback.md` (`RLSE-10`) when the operator asks for one.
   Basis: PRD §39.7 *"Rollback chooses a compatible prior release directory. Database rollback is not
   automatic."*
8. **`infra/deploy/promote/lib/compatibility.mjs`** — `isCompatible({ appManifest, activeCorpusId,
   corpusManifest, currentSchemaHead })`, a pure function returning
   `{ ok, reasons: [{ code, expected, observed }] }`, implementing PRD §20.4's *"declare compatibility
   ranges"* in both directions: the app's `compatibility.corpus` must contain the corpus release, and
   the corpus manifest's `compatibility.app` (from `CRPS-02` deliverable 1) must contain the app
   version. Pure and table-testable; exported for `RLSE-07`, which evaluates the same predicate from
   the other side.
9. **`infra/deploy/promote/lib/audit.mjs`** — the immutable promotion audit record
   (`ADM-002`, PRD §42.4's *"Every incident records …"* discipline applied to promotions):
   `{ event: 'APP_PROMOTED' | 'APP_ROLLED_BACK' | 'APP_PROMOTION_ABORTED', actor_id, actor_kind,
     mfa_verified_at, reason, from_version, to_version, archive_sha256, recovery_point_id,
     migration_run_id, corpus_release_id, started_at, finished_at, outcome, journal_path }`.
   It is written to the deploy journal **and** offered to an `AuditSink` seam that fails **visibly**
   (non-zero exit, explicit code) when unbound — `22-internal-admin` (`INTL-04`) and `DATA-07` bind
   the durable sink. The record contains no customer content and no credential (PRD §22).
10. **`infra/deploy/promote/lib/guards.mjs`** — the refusals that make sub-PRD **D7** true, each with
    its own error code: `ARCHIVE_UNVERIFIED`, `ARCHIVE_UNSIGNED`, `VERSION_MISMATCH`,
    `HASH_MISMATCH`, `AUTHORISATION_REQUIRED`, `AUTHORISATION_STALE`, `SUBJECT_MISMATCH`,
    `BACKUP_LAG_CRITICAL`, `RECOVERY_POINT_STALE`, `RECOVERY_POINT_UNCONFIRMED`,
    `PREFLIGHT_DISK`, `PREFLIGHT_MEMORY`, `CONTRACT_MIGRATION_IN_SAME_RELEASE` (surfaced from
    `DATA-01`), `RELEASE_DIR_EXISTS_DIFFERENT`, `CANDIDATE_UNHEALTHY`, `SCHEMA_HEAD_MISMATCH`,
    `SMOKE_FAILED`, `INCOMPATIBLE_CORPUS`, `DEPLOY_JOURNAL_INTERRUPTED`. Every guard is checked
    **before** the corresponding step's first write.
11. **`infra/deploy/promote/lib/inertness.mjs`** — the machine proof of PRD §12.2 for this tool:
    `snapshotProtectedState(adapter)` captures a hash of `/srv/aer/app/current`'s target, the mtime and
    content hash of every existing release directory, and a recursive hash of `/srv/aer/corpus/**`;
    `assertProtectedStateUnchanged(before, after)` fails naming the first difference. Used by the
    fault-injection matrix (acceptance) and exported for `RLSE-07`, which needs the identical proof.
12. **`infra/deploy/promote/lib/api.mjs`** — the stable surface `RLSE-10` quotes and `RLSE-08` reuses:
    `runDeploy(opts)`, `runRollback(opts)`, `planDeploy(opts)` (the `--plan` output as data),
    `syntheticSearchCheck`, `syntheticAnswerCheck`, `isCompatible`, `STEP_IDS`.

## Acceptance checklist (classified)

Cross-references: `ADM-002` (the founder-authorised, recent-MFA, reason-bearing, immutably audited
promotion pattern, applied to the application release), `OPS-001` (the forced confirmed recovery point
and the backup-lag gate), `OPS-002` (the deploy journal and the post-switch checks are what make a
deployment observable), `OPS-003` (the synthetic Answer check respects the spend cap and is suppressed
at 90%).

- [ ] `[machine]` The step array's `prdStep` values cover PRD §39.7 steps 1–8 **in order with no gap**,
      and the recorded command sequence from a successful `LocalRootHostAdapter` run matches the
      expected ordered list exactly (PRD §39.7)
- [ ] `[machine]` **Fault-injection matrix — the core item.** For **every** step, inject a failure and
      assert: (a) the process exits non-zero with the step's guard code; (b)
      `assertProtectedStateUnchanged` passes for the active pointer, every pre-existing release
      directory and the whole corpus tree; (c) no candidate unit is left running. For steps after
      `swap_pointer`, additionally assert the pointer was rolled back to the previous target and the
      prior release is serving (PRD §12.2 "Failed releases MUST NOT modify active production data";
      PRD §39.7 step 8)
- [ ] `[machine]` Deployment refuses with `AUTHORISATION_REQUIRED` when **no** `AuthorisationProvider`
      is bound, with `AUTHORISATION_STALE` on an old `mfa_verified_at`, and with `SUBJECT_MISMATCH`
      when the confirmed subject is not the exact release id + hash (PRD §20.4 "recent MFA, explicit
      version/changelog confirmation"; `ADM-002`; sub-PRD D10)
- [ ] `[machine]` Deployment refuses an unsigned archive, an archive failing `RLSE-01`'s verification,
      a `--version` mismatch and a `--confirm-hash` mismatch — one test per case (PRD §39.7 step 1;
      PRD §21)
- [ ] `[machine]` Deployment refuses with `BACKUP_LAG_CRITICAL` at lag > 15 min and with
      `RECOVERY_POINT_STALE` when the last confirmed point is older than 24 h (PRD §42.2 rows
      "Backup lag" and "Last valid recovery point"; PRD §39.7 step 3)
- [ ] `[machine]` Deployment **cannot proceed past step 3 without a confirmed recovery point**: with
      `RLSE-05`'s provider stubbed to throw `RECOVERY_POINT_UNCONFIRMED`, the run aborts before
      `expand_migrations` and no migration is applied (PRD §23.1 "Force a confirmed recovery point
      before migrations"; PRD §39.7 step 3→4 order)
- [ ] `[machine]` `runMigrations` is invoked with `requireRecoveryPoint: true` and the recovery-point
      id, and the tool passes **no** option that could relax `DATA-01`'s expand-only policy — asserted
      by inspecting the recorded call arguments and by a source scan (PRD §39.7 step 4;
      breakdown-plan A5)
- [ ] `[machine]` A release containing a contract migration whose `expanded-in` is in the **same**
      `run_id` is refused, surfacing `CONTRACT_MIGRATION_IN_SAME_RELEASE` (PRD §39.7 step 4
      "destructive/contract changes are not permitted in the same release that removes old readers")
- [ ] `[machine]` Candidate units start on `127.0.0.1:3001`/`127.0.0.1:7701` only, are pointed at the
      explicit release directory (never through `/srv/aer/app/current`), and a candidate that attempts
      to write the active pointer, a release directory or the corpus tree is denied — reusing
      `RLSE-02`'s isolation (PRD §39.7 step 5; PRD §12.2; sub-PRD D7, D19)
- [ ] `[machine]` `verify_candidate` fails with `SCHEMA_HEAD_MISMATCH` when the candidate reports a
      schema head different from the manifest's, and with `CANDIDATE_UNHEALTHY` on a `/health/ready`
      timeout — and in both cases the active pointer is unchanged (PRD §39.7 step 5; PRD §42.1)
- [ ] `[machine]` `swapPointer` is used for the switch and is atomic under crash injection at every
      adapter call (delegated to `RLSE-02`'s primitive, re-asserted here at the tool level)
      (PRD §20.4 "atomic application pointer"; PRD §39.7 step 6)
- [ ] `[machine]` A failing step-7 smoke check triggers an **automatic rollback** to the prior release
      and exits non-zero naming the failing check (PRD §39.7 steps 7–8)
- [ ] `[machine]` The synthetic Answer check honours a hard spend cap and records `SKIPPED_BUDGET`
      when the breaker is at 90% or above, while the synthetic Search check still runs
      (PRD §42.1 "strict daily spend cap"; PRD §42.2 spend rows; PRD §26 "Search remains available
      independently of hosted-generation budget"; `OPS-003`)
- [ ] `[machine]` Neither smoke check logs a query, evidence or answer text — asserted with a
      `content-canary-<uuid>` seeded into the synthetic request and required absent from every emitted
      byte (PRD §22)
- [ ] `[machine]` `retain_prior` deletes **nothing**: a recording adapter fails the test on any
      unlink/rmdir of a release directory (PRD §39.7 step 8 "Prior release remains available for
      rollback")
- [ ] `[machine]` **Rollback** selects only a compatibility-satisfying prior release: table-driven over
      corpus range in/out, schema head lower/equal/higher; a release requiring a newer schema head is
      refused with `INCOMPATIBLE_CORPUS`/`SCHEMA_HEAD_MISMATCH` (PRD §39.7 "Rollback chooses a
      compatible prior release directory"; PRD §20.4)
- [ ] `[machine]` **Rollback performs no database operation**: a source scan proves no migration,
      restore or `app.sqlite` write path exists in `rollback.mjs`, and the tool prints PRD §39.7's
      sentence plus the `docs/runbooks/app-rollback.md` path when asked (PRD §39.7 "Database rollback
      is not automatic")
- [ ] `[machine]` `--plan` performs no write and no `systemctl` call and prints the full ordered plan
      with every threshold — asserted with an adapter that fails the test on any mutating call
      (deliverable 4)
- [ ] `[machine]` An interrupted deployment leaves a journal that makes a second run refuse with
      `DEPLOY_JOURNAL_INTERRUPTED` until acknowledged (deliverable 5)
- [ ] `[machine]` The audit record contains every deliverable-9 field, no customer content and no
      credential; an **unbound** `AuditSink` causes a visible non-zero failure, never a silent skip
      (`ADM-002`; PRD §22)
- [ ] `[machine]` No file outside `infra/deploy/promote/**` and the one new
      `docs/adr/NNNN-application-release-pointer.md` is modified — asserted by `git diff --name-only`.
      In particular `infra/compose/**` is untouched (breakdown-plan **A7**; sub-PRD D2)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `ADM-002` and `OPS-001`, the schema/API
      compatibility impact (the compatibility predicate), the security impact (authorisation seam,
      candidate isolation), the rollback path (this ticket **is** the rollback path) and the known gaps
- [ ] `[fixture]` Replay of a recorded **deploy journal** from the offline harness: the committed
      fixture under `infra/deploy/promote/fixtures/journals/` reproduces the same step sequence, the
      same guard codes and the same protected-state hashes when re-run — the reproducible drill
      evidence `RLSE-10`'s `docs/runbooks/deploy.md` and PRD §26's *"app rollback … demonstrated"*
      rest on
- [ ] `[human]` **The founder-authorised promotion itself.** One real deployment to the production host
      with recent MFA, explicit version/changelog confirmation and a typed reason, followed by one
      real rollback. **Not required to merge** — PRD §20.4 makes this irreducibly human (*"Founder
      authenticates with recent MFA and selects exact release version/hash"*) and PRD §20.2 forbids
      giving coding agents production SSH or MFA credentials. The merge-time substitute is the
      `LocalRootHostAdapter` fault-injection matrix plus the stub authorisation provider, which proves
      every guard, every abort path and the protected-state invariant without a host
- [ ] `[human]` Gate 2 smoke: the founder follows `docs/runbooks/deploy.md` (`RLSE-10`) end to end and
      confirms the sequence matches what the runbook says. **Not required to merge** — `RLSE-10` is
      `blocked_by` this ticket (CLAUDE.md Gate 2; PRD §43.4)
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python authored (PRD §45.3)

## Test plan

Reviewer steps. Everything except the two `[human]` rows runs offline with no host, no network, no
MFA and no production credentials (PRD §20.2):

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/infra-promote`, **or** `node --test infra/deploy/promote/test` if the
   workspace member is absent (open question **Q-RLSE-9**). Both must pass.
3. Harness: `test/helpers/world.mjs` builds a complete synthetic world in a temporary directory —
   `RLSE-02`'s `LAYOUT` materialised under `--root`; a signed `dev-` archive produced by `RLSE-01`'s
   builder (never a hand-written manifest); a synthetic `app.sqlite` migrated by `DATA-01`; a fake
   corpus tree with an active pointer; `FakeLitestream` + `LocalObjectStore` from `RLSE-05`; a stub
   `AuthorisationProvider`; and a fake candidate app that serves `/health/ready` and can be programmed
   to fail. The fake systemd records every call in order and can fail on the *n*-th — copy the
   recording-stub construction pattern from
   `docs/prd/04-corpus-contract/tickets/CRPS-07-*.md`.
4. **`sequence.test.mjs`** — a successful deploy; assert the recorded command list equals the expected
   ordered list and that `STEP_IDS`' `prdStep` values cover PRD §39.7 1–8 with no gap.
5. **`fault-matrix.test.mjs`** — the core suite. For each step id: snapshot protected state, inject a
   failure at that step, run, then assert exit code, guard code, `assertProtectedStateUnchanged`, no
   candidate unit running, and (post-`swap_pointer`) that the pointer was restored and the prior
   release restarted.
6. **`guards.test.mjs`** — one case per code in deliverable 10, each asserting the guard fires
   **before** the step's first write (assert the adapter recorded no mutating call).
7. **`migrations.test.mjs`** — assert the recorded `runMigrations` arguments include
   `requireRecoveryPoint: true` and the recovery-point id; run with the recovery-point provider
   throwing and assert no migration was applied; add a contract migration whose `expanded-in` shares
   the run id and assert `CONTRACT_MIGRATION_IN_SAME_RELEASE`.
8. **`candidate.test.mjs`** — candidate ports; explicit release directory; write attempts on each
   protected path denied; `/health/ready` timeout; schema-head mismatch.
9. **`smoke.test.mjs`** — synthetic Search happy path asserting the response names the active corpus
   release; synthetic Answer with the cap; breaker at 89% (runs) and 90% (`SKIPPED_BUDGET`, Search
   still runs); canary absent from all output.
10. **`rollback.test.mjs`** — the compatibility table; the authorisation requirement; the automatic
    rollback triggered by a failing smoke check; the source scan proving no database path exists; the
    printed runbook sentence.
11. **`plan.test.mjs`** — `--plan` with an adapter that fails on any mutating call; assert the printed
    plan matches a golden fixture.
12. **`journal.test.mjs`** — kill a run mid-step (throw), assert the journal is on disk, assert a
    second run refuses with `DEPLOY_JOURNAL_INTERRUPTED`, then assert `--resume-acknowledge` clears it.
13. **`audit.test.mjs`** — every field present; unbound sink fails visibly; canary content and a
    credential-shaped string are absent from the record.
14. **`golden.test.mjs`** — the `[fixture]` row: replay the committed journal fixture and diff the step
    sequence, guard codes and protected-state hashes, ignoring timestamps.
15. **Diff check** — `git diff --name-only` lists only `infra/deploy/promote/**` plus the one new ADR
    file.
16. **Reviewer focus (concurrency- and data-loss-sensitive):** confirm no step writes anything before
    its guard runs; confirm compensation never touches `app.sqlite`; confirm two concurrent deploys
    cannot both pass `stage_release` (a lock or an atomic directory creation must make the second
    fail); confirm the pointer swap and the unit restart cannot interleave into a state where the old
    process serves from a deleted directory; confirm `retain_prior` cannot be turned into a delete by
    a flag or configuration; confirm the authorisation subject really is the release id **and** hash,
    so authorising one release cannot promote another; confirm no credential, MFA assertion value or
    customer content reaches the journal, the audit record, stdout or stderr.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(docs PR → merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/18-ops-release/README.md` (version +0.1 with a changelog line), **then** change code. Silent
divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **The pointer swap alone does not switch the serving process** (systemd resolves `ExecStart` at
  start, so a restart is required, or the tunnel must be re-pointed) → that is exactly what
  `docs/adr/NNNN-application-release-pointer.md` (deliverable 3) must decide and record **before**
  implementation. If it turns out the tunnel upstream must change (PRD §39.7 step 6 says
  *"Tunnel/upstream pointer switches atomically"*), that touches `infra/cloudflare/**` — raise a docs
  PR against `RLSE-03` and record the cross-ticket dependency in
  `docs/prd/18-ops-release/README.md`; do **not** write `infra/cloudflare/**` from here.
- **The candidate cannot start because the app requires the shared `app.sqlite` in a way expand
  migrations do not cover** → that is a `DATA-01`/`01-app-data` concern and possibly a breakdown-plan
  **A5** falsification. Record it in `docs/prd/18-ops-release/README.md` and raise it against
  `DATA-01`; do not relax the expand-only policy from here (`packages/database/**` is serial-owned,
  PRD §44.3).
- **The step-7 synthetic checks need application endpoints that do not exist yet** → they are
  `RUNT-08`'s (`/health/ready`, `/v1/system-status`), `FIND-01`'s (`POST /v1/search`) and `ASK-01`'s
  (`POST /v1/answers`), and this ticket has no `blocked_by` edge to any of them. Implement them behind
  a `SmokeTarget` seam that fails **closed** with a named code when an endpoint is absent, record the
  gap in `docs/prd/18-ops-release/README.md`, and state it in the PR's known-gaps line (PRD §45.4).
  Never mark a deployment successful on a skipped check.
- **`RLSE-08` needs the same synthetic checks** → export them (deliverable 6/12) rather than letting
  `RLSE-08` reimplement them; sub-PRD **D15** already says the two artifacts stay separate. If they
  should genuinely be merged, that is a plan change — write `docs/prd/breakdown-plan.md` §5.19/§6.2
  and both sub-PRD sections first.
- **A deployment genuinely needs a database rollback** → PRD §39.7 forbids automating it. Do not add
  the capability. Document the manual, maintenance-window procedure in
  `docs/runbooks/app-rollback.md` (`RLSE-10`, `blocked_by` this ticket) using `RLSE-09`'s verified
  restore, and record the requirement in `docs/prd/18-ops-release/README.md`.
- **The founder wants unattended promotion** (a CI-triggered deploy) → PRD §20.4's *"Founder-authorised
  promotion requires recent MFA"* and PRD §20.2's credential prohibition make that a **product**
  change under PRD §45.5 requiring founder approval and a PRD update. Record it in
  `docs/prd/18-ops-release/README.md` Q-RLSE-8 and stop; never add a bypass flag.

**3. Escalation.** *"Failed releases MUST NOT modify active production data"* (PRD §12.2), *"Force a
confirmed recovery point before migrations"* (PRD §23.1) and PRD §39.7's eight-step order are the
guarantees `ADM-002`, `OPS-001` and PRD §26's *"app rollback … demonstrated"* rest on, and
`docs/runbooks/deploy.md` and `docs/runbooks/app-rollback.md` (`RLSE-10`) are written directly from
them. If any of the three is outright falsified, that overturns a team decision the whole release path
depends on: stop, escalate for re-review, and write back to `docs/prd/18-ops-release/README.md` and
`docs/prd/breakdown-plan.md` before any code lands. Never add a flag that skips a guard, and never
make a step irreversible earlier than `swap_pointer`, inside this ticket.
