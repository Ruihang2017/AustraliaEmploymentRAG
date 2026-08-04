---
id: ASSR-08
title: "Restore/DR and backup-exclusion assertions"
module: 23-assurance
lane: 23-assurance
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RLSE-09, DATA-08]
blocks: [LNCH-05]
---

# ASSR-08 — Restore/DR and backup-exclusion assertions

Implements PRD §23.2, §39.3 and §42.3 — requirement **OPS-001**; epic `E30`; acceptance script
`UAT-OPS-02`.
No ADR — the decision is already made in PRD §39.3 (*"A CI/restore test asserts that
`ephemeral.sqlite` and corpus files are absent from the Litestream destination"*) and PRD §42.3 (the
seven-step monthly drill); this is build ticket 8 of 8 against it.
Parent sub-PRD: [23-assurance README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RLSE-09 — Restore drill tooling and isolated recovery environment](../../18-ops-release/tickets/RLSE-09-restore-drill-tooling-and-isolated-recovery-environment.md), [DATA-08 — `ephemeral.sqlite` store, expiry sweeper, backup exclusion](../../01-app-data/tickets/DATA-08-ephemeral-sqlite-store-expiry-sweeper-backup-exclusion.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §42.3 already fixes the seven drill steps and PRD §39.3 the exclusion rule; this makes them
executable offline, and decides no new subsystem.

## Background + basis

**PRD §39.3, quoted verbatim — the sentence this ticket exists for:**

> The app database, ephemeral database and corpus cannot share a wildcard backup rule. **A CI/restore
> test asserts that `ephemeral.sqlite` and corpus files are absent from the Litestream destination.**

with the filesystem layout it is derived from:

> | `/srv/aer/data/app.sqlite*` | system | app/worker/Litestream | mutable tenant state and WAL | **Litestream to S3 Sydney** |
> | `/srv/aer/data/ephemeral.sqlite*` | system | app/worker only | transient research content | **Explicitly excluded** |
> | `/srv/aer/corpus/releases/<id>` | attached | search read, promoter write | active/previous/candidate bundles | **Rebuild/retrieve from R2** |

**PRD §23.1, quoted verbatim:**

> - `app.sqlite` uses WAL and Litestream continuous replication to S3 Sydney.
> - **Target replication lag: under 15 minutes.**
> - Daily recovery points: seven days.
> - Weekly recovery points: 30 days.
> - Restore testing: monthly.
>
> **Corpus databases/indexes and application binaries are rebuilt from immutable releases rather than
> duplicated into customer backup storage.**

**PRD §23.2, quoted verbatim:**

> **Monthly restore runs in an isolated environment with email, webhook, provider calls, SSO callbacks
> and real sessions disabled.** It validates SQLite integrity/schema, compatible app/corpus releases
> and Research Record/Answer/citation references and produces a report.

**PRD §42.3, transcribed verbatim — the drill steps are this ticket's acceptance target:**

> Continuous Litestream replication is monitored by **generation/validation of a recovery point, not
> merely "process is running"**. Daily and weekly retention are implemented by S3 lifecycle/version
> policy and **verified by inventory**.
>
> Monthly restore drill:
>
> 1. create isolated temporary host/network and **deny outbound email, webhook, SSO callback and
>    model-provider access**;
> 2. retrieve selected recovery point and compatible app/corpus manifests;
> 3. restore `app.sqlite`, replay WAL and run `PRAGMA integrity_check` plus foreign key/schema/
>    migration checks;
> 4. verify sampled organisation/record/answer/claim/citation references against exact corpus release
>    IDs;
> 5. prove auth sessions/credentials are disabled or rotated in drill;
> 6. run read-only Search and saved-record retrieval;
> 7. record recovery point, start/end time, achieved RPO/RTO, counts, failures and operator; destroy
>    isolated customer-data copy under controlled procedure.

**Requirements.** `OPS-001` (PRD §30.2): *"`app.sqlite` replication meets ≤15-minute target and
restore is tested monthly … **Timestamped restore report and integrity checks pass**."* PRD §41.2
`UAT-OPS-02`: *"Restore app DB in isolated drill → **Integrity/reference checks pass; no
emails/webhooks/providers/real sessions fire**."* PRD §20.3: *"Release candidates additionally run
integration, **restore**, evaluation, compatibility and rollback tests."* PRD §26 Operations:
*"Backup lag, monthly restore procedure, app rollback and CorpusRelease rollback are demonstrated."*

**Why this cannot live in `18-ops-release` or `01-app-data`.** `RLSE-05` proves its replication
configuration produces a validatable recovery point; `RLSE-09` provides the drill tooling and the
isolated environment; `DATA-08` provides `assertNotBackedUp` and `EPHEMERAL_FILE_GLOBS`. None of them
can assert the property PRD §39.3 states, because it is a statement about **what is in the replication
destination after the app, the worker, the ephemeral store and the corpus have all been running
together** — a cross-boundary fact. PRD §45.2 assigns *"Cross-boundary e2e/security/isolation/
restore"* to `tests`.

**What the `blocked_by` closure guarantees (sub-PRD D3).** Via `RLSE-09` → `RLSE-05` (Litestream
replication and recovery-point validation), `RLSE-04` (the S3 `backups/` and `exports/` prefixes with
separate least-privilege credentials), `RLSE-01` (the immutable release archive and its manifests),
and transitively `RUNT-01`, `RUNT-04`, `RETR-01` (read-only corpus loading) and `CRPS-08` (a signed
synthetic corpus fixture release), plus `DATA-01` (migrations), `DATA-02`, `DATA-03`, `DATA-04`,
`DATA-05`. Via `DATA-08` → the ephemeral store, its glob list and `assertNotBackedUp`.

**Accepted caveats carried forward, each a row in `coverage-gaps.md`:**

- **`DATA-06`/`DATA-07` are siblings of `DATA-05`, not blockers.** Step 4's reference verification is
  asserted here over the tables the closure guarantees — organisation, membership, job and execution
  references — and the **record/answer/claim/citation** half is a gap row naming `DATA-06`. The drill
  tool's reference check must accept an extensible table list so closing that gap needs no code
  change here.
- **`RLSE-07` (corpus promotion) is not in this closure.** Step 2's *"compatible app/corpus
  manifests"* is asserted against `RLSE-01`'s archive manifest and `CRPS-08`'s fixture release
  manifest; promotion and rollback are `RLSE-07`'s own and `LNCH-05`'s closure evidence.
- **Real AWS is never used** (sub-PRD **D5**). The replication destination is a filesystem-backed
  object-store fake standing in for S3 Sydney, with two distinct capability handles modelling
  `RLSE-04`'s two prefixes and two credentials. PRD §20.2 forbids production backup credentials in
  agent context, and PRD §23.1 puts *"Destructive backup deletion and break-glass restore
  credentials"* outside ordinary runtime entirely.

## Goal

Produce `tests/integration/recovery/**`: a suite that runs the app, worker and ephemeral store against
a stubbed replication destination, then asserts (a) the destination contains `app.sqlite` and its WAL
and **nothing else** — no `ephemeral.sqlite`, no corpus file, no release archive, no export artifact;
(b) `DATA-08`'s `assertNotBackedUp` rejects every wildcard rule that would capture an ephemeral file;
(c) the PRD §42.3 seven-step drill executes end to end offline through `RLSE-09`'s tooling with email,
webhook, provider and SSO egress denied and **provably unattempted**; and (d) the drill emits the
timestamped report `OPS-001` requires. Completion is mechanically checkable: the drill steps are
transcribed as data with one assertion each, the destination inventory is compared against a literal
allowed-file list, and a deliberately-broadened backup rule is detected.

## Non-goals

- **No Litestream configuration, replication tooling or recovery-point generation** — `18-ops-release`
  (`RLSE-05`). Consumed, never re-implemented.
- **No drill tooling or isolated-environment construction** — `18-ops-release` (`RLSE-09`), this
  ticket's blocker. This suite **drives** that tool and asserts its outcomes.
- **No ephemeral store, sweeper or glob-list definition** — `01-app-data` (`DATA-08`). The suite calls
  `assertNotBackedUp` and `EPHEMERAL_FILE_GLOBS`; it does not restate globs (sub-PRD **D14**).
- **No S3 prefix, bucket or credential definition** — `18-ops-release` (`RLSE-04`).
- **No app or corpus rollback, promotion or deployment sequence** — `18-ops-release` (`RLSE-06`,
  `RLSE-07`) and `LNCH-05`'s closure. PRD §26's rollback demonstration is theirs.
- **No runbook authoring** — `18-ops-release` (`RLSE-10`, `docs/runbooks/**`).
- **No tenant-isolation, PII, citation or job-invariant assertions** — `ASSR-01`, `ASSR-03`,
  `ASSR-04`, `ASSR-05`. The export-prefix boundary is asserted from the **backup** side here and from
  the **application** side in `ASSR-01`; both cite PRD §19.2 and neither duplicates the other.
- **No retention-policy decisions** — PRD §10.3 and §23.1 fix the numbers; this suite asserts them.
- **No use of real AWS, real Cloudflare or production credentials** — PRD §20.2; sub-PRD **D5**.

## File-scope (write-owns)

Owned by this ticket:

- `tests/integration/recovery/**` — including `harness/**`, `fixtures/**`, `suites/**`,
  `report/**` and `coverage-gaps.md`.
- `tests/integration/package.json`, `tests/integration/tsconfig.json` — **append-only**, own scripts
  and dependencies only (created by `FND-01`; sub-PRD **D16**). Shared with `ASSR-04` and `ASSR-05`.

Does not touch:

- `tests/integration/citations/**` — `ASSR-04`; `tests/integration/{jobs,sse,idempotency}/**` —
  `ASSR-05` (both concurrent siblings in the same member).
- `tests/tenant-isolation/**` — `ASSR-01`; `tests/security/**` — `ASSR-02`, `ASSR-03`;
  `tests/e2e/**` — `ASSR-06`, `ASSR-07`.
- **Any other module's package or app tree** — `packages/**`, `apps/**`, `services/**`,
  `pipelines/**`, `infra/**` (including `infra/backup/**` and `infra/recovery/**`), `schemas/**`,
  `evals/**`. Not even to adjust a backup rule so an assertion passes (sub-PRD **D1**).
- `.github/workflows/**`, root `package.json`, root lockfiles — `00-foundation`.
- `docs/PRD.md` — frozen. `docs/runbooks/**` — `RLSE-10`. `docs/prd/breakdown-plan.md` — docs PR only.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). `tests/integration/recovery/**` is written by no other ticket in the plan (plan §5.24). This
is a wave-1 ticket; its concurrent siblings inside the same workspace member are `ASSR-04`
(`citations`) and `ASSR-05` (`{jobs,sse,idempotency}`) — disjoint subtrees. The three share
`tests/integration/package.json` and `tsconfig.json` as **append-only** files (plan §1.1) and nothing
else. Both declared blockers land first by construction.

## Deliverables

1. **`harness/stack.ts` — a running system with a stubbed replication destination** (sub-PRD **D4**,
   **D5**). `startRecoveryStack()` creating `/data` (with `app.sqlite`, its WAL and
   `ephemeral.sqlite`), `/corpus` (holding `CRPS-08`'s fixture release bundle), `/releases` (holding
   `RLSE-01`'s archive), and a **filesystem-backed object store** exposing two distinct capability
   handles — `backups/` and `exports/` — modelling `RLSE-04`'s least-privilege split. Boots the API
   (`RUNT-01`'s `buildApp`), the worker (`RUNT-04`) and the ephemeral store (`DATA-08`), writes real
   rows and real ephemeral content, then drives replication through `RLSE-05`'s configuration pointed
   at the stub. No network, no AWS credential.
2. **`suites/backup-exclusion.test.ts` — PRD §39.3's headline assertion.** After the workload runs,
   take a full **inventory** of the `backups/` prefix and assert it against a literal allowed list:
   `app.sqlite` generations/snapshots and WAL segments only. Assert **absent**: any file matching
   `DATA-08`'s `EPHEMERAL_FILE_GLOBS` (`ephemeral.sqlite`, `-wal`, `-shm` and any journal variant);
   any corpus bundle, index or manifest from `/corpus`; any release archive from `/releases`; any
   export artifact. Assert additionally, by byte search, that no ephemeral **content** canary written
   during the workload appears anywhere in the destination (PRD §10.4: ephemeral content *"MUST NOT
   enter Litestream, daily/weekly backups, exports or support tools"*).
3. **`suites/no-wildcard-rule.test.ts` — PRD §39.3's second sentence.** Call `DATA-08`'s
   `assertNotBackedUp` with each candidate rule and assert it **throws** for every one that could
   capture an ephemeral file: `*.sqlite*`, `*.sqlite`, `data/*`, `data/**`, `/srv/aer/data/*`, `.`,
   `**`; and **does not throw** for the app-only rules. Assert the effective replication configuration
   `RLSE-05` produces passes `assertNotBackedUp`. Do not restate the glob list here — read it from
   `DATA-08` so a change there is caught, not mirrored (sub-PRD **D14**).
4. **`suites/prefix-separation.test.ts` — PRD §19.2 from the backup side.** Assert the `backups/`
   capability cannot read, write or list under `exports/`, and vice versa; assert an export artifact
   never lands under `backups/`; assert the two handles are distinct objects and that swapping them
   fails. Cross-reference: `ASSR-01` asserts the same boundary from the application/download side.
5. **`fixtures/prd-42-3-drill.json` + `suites/drill.test.ts` — the seven steps, transcribed verbatim
   and asserted one by one** through `RLSE-09`'s tooling:
   1. **isolation** — the drill environment denies outbound email, webhook, SSO callback and
      model-provider access. Assert with local sinks that record **attempts**: zero attempts, not
      merely zero successes (`UAT-OPS-02`: *"no emails/webhooks/providers/real sessions fire"*);
   2. **retrieve** — the selected recovery point and the compatible app and corpus manifests are
      fetched from the stub destination and their compatibility ranges are checked (PRD §20.4:
      *"Application and corpus releases are independently versioned and declare compatibility
      ranges"*);
   3. **restore** — `app.sqlite` is restored, the WAL replayed, and `PRAGMA integrity_check`,
      `PRAGMA foreign_key_check`, the schema check and the migration-head check all pass;
   4. **references** — sampled organisation, membership, job and execution references resolve, and
      every corpus reference names an **exact** corpus release ID present in the fixture release. The
      record/answer/claim/citation half is a gap row (`DATA-06`) and the check accepts an extensible
      table list so closing it needs no change here;
   5. **credentials** — auth sessions and machine credentials are disabled or rotated in the drill;
      assert a session valid in the source system is **not** valid in the drill copy;
   6. **read-only use** — a read-only Search runs against the restored state and the fixture corpus
      (`RETR-01`), and saved-state retrieval succeeds for the tables in scope; assert **no write** to
      the restored database occurs during this step;
   7. **report and destruction** — the report exists and destruction of the isolated customer-data
      copy is performed and verified.
6. **`suites/recovery-point-validation.test.ts` — `OPS-001` and PRD §42.3's first line.** Assert
   replication health is measured by **generating and validating a recovery point**, not by process
   liveness: kill the replication process and assert the health signal degrades; keep the process
   alive but break the destination and assert the health signal **still** degrades. Assert the
   measured recovery-point age is reported and compared against the **15-minute** target, and that
   exceeding it is a failure signal rather than a silent pass. (PRD §23.1; §42.2's *"backup breach"*
   alert is `RLSE-08`'s to fire; this suite asserts the signal exists and is correct.)
7. **`suites/retention-inventory.test.ts` — PRD §23.1 and §42.3.** Assert the destination's lifecycle
   or version policy expresses **seven** daily recovery points and **30** weekly ones, and that the
   assertion is made by **inventory** of the destination (PRD §42.3: *"verified by inventory"*), not
   by reading the configuration file alone. Assert PRD §10.3's *"Deleted data in backups: ages out
   within a further maximum of 30 days"* is expressible and expressed by that policy.
8. **`report/restore-report.json` — the `OPS-001` artifact.** The drill emits, and this suite asserts
   the presence and shape of: recovery point identity, start and end timestamps, achieved RPO and RTO,
   row counts per checked table, the failure list, the operator identity, and the integrity-check
   results. Written to a stable path so `LNCH-05`'s closure and PRD §43.5's release evidence pack can
   consume it. A human-readable `report/index.md` is generated from the same data.
9. **`suites/negative-control.test.ts`.** (a) Plant an `ephemeral.sqlite` copy in the stub destination
   and assert `backup-exclusion.test.ts` fails. (b) Corrupt one byte of the restored database and
   assert the integrity check fails. (c) Point the replication rule at `data/*` and assert
   `no-wildcard-rule.test.ts` fails. A suite that cannot fail proves nothing.
10. **`coverage-gaps.md`** (sub-PRD **D3**) — seeded with: record/answer/claim/citation reference
    verification (`DATA-06`); corpus promotion and rollback demonstration (`RLSE-07`, `RLSE-06` — PRD
    §26 Operations, closed by `LNCH-05`); real-S3 lifecycle verification against AWS (out of scope by
    PRD §20.2 — a human/operator step in `RLSE-09`'s runbook); the `RLSE-08` alert firing itself. Each
    row names the owning ticket and the exact plan §5.24/§6.2 edge that would close it.
11. **`package.json` script wiring** (sub-PRD **D10**): this suite runs under this member's
    `test:integration` script — PRD §20.3 puts **restore** tests in the release-candidate set.
12. **`README.md` in `tests/integration/recovery/`** — the PRD §42.3 step → assertion map, the stub
    object-store model and why no real AWS is used, the allowed-file inventory list, the report
    location for `LNCH-05`, and the rule that a failure is the owning module's defect (sub-PRD
    **D1**).

## Acceptance checklist (classified)

- [ ] `[machine]` **`ephemeral.sqlite` and corpus files are absent from the replication destination**
      after a real workload, asserted by full inventory against a literal allowed-file list; no
      ephemeral content canary appears anywhere in the destination. (PRD §39.3 verbatim; §10.4;
      **OPS-001**)
- [ ] `[machine]` **No wildcard backup rule can capture an ephemeral file** — `assertNotBackedUp`
      throws for `*.sqlite*`, `data/*`, `data/**`, `**` and every other candidate, and the effective
      `RLSE-05` configuration passes it. The glob list is read from `DATA-08`, not restated. (PRD
      §39.3; sub-PRD **D14**)
- [ ] `[machine]` **Backup and export prefixes are mutually inaccessible** — each capability handle is
      denied on the other's prefix, and no export artifact reaches `backups/`. (PRD §19.2;
      cross-referenced with `ASSR-01`)
- [ ] `[machine]` **No release archive or corpus bundle is duplicated into customer backup storage.**
      (PRD §23.1 *"rebuilt from immutable releases rather than duplicated"*)
- [ ] `[fixture]` **`UAT-OPS-02` — all seven PRD §42.3 drill steps pass offline**, asserted against
      the verbatim transcription; a missing or renamed step fails. (PRD §41.2 `UAT-OPS-02`; §42.3;
      §23.2)
- [ ] `[machine]` **Nothing fires during the drill** — the email, webhook, SSO-callback and
      model-provider sinks record **zero attempts**, and a session valid in the source system is
      invalid in the drill copy. (PRD §23.2; §42.3 steps 1 and 5; `UAT-OPS-02`)
- [ ] `[machine]` **Integrity holds after restore** — `PRAGMA integrity_check`, `PRAGMA
      foreign_key_check`, the schema check and the migration-head check all pass on the restored
      database. (PRD §42.3 step 3; **OPS-001** *"integrity checks pass"*)
- [ ] `[machine]` **Sampled references resolve against exact corpus release IDs** for the tables in
      scope, with the record/answer/claim/citation half declared in `coverage-gaps.md` and the check
      list extensible. (PRD §42.3 step 4; §23.2)
- [ ] `[machine]` **Step 6 performs no write** — read-only Search and saved-state retrieval leave the
      restored database byte-identical. (PRD §42.3 step 6)
- [ ] `[machine]` **Replication health is recovery-point based, not liveness based** — the signal
      degrades both when the process dies and when the destination breaks; the measured recovery-point
      age is compared against the **15-minute** target. (PRD §42.3 first line; §23.1; **OPS-001**)
- [ ] `[machine]` **Retention is verified by inventory** — seven daily and 30 weekly recovery points
      are expressed by the destination's policy and observed in its inventory; PRD §10.3's 30-day
      backup ageing is expressible. (PRD §23.1; §42.3; §10.3)
- [ ] `[machine]` **`report/restore-report.json` is produced** with recovery point, start/end times,
      achieved RPO/RTO, per-table counts, failures, operator and integrity results, at the stable path
      `LNCH-05` and PRD §43.5 consume. (**OPS-001** *"Timestamped restore report"*; §42.3 step 7;
      §43.5)
- [ ] `[machine]` **The isolated customer-data copy is destroyed and the destruction verified.** (PRD
      §42.3 step 7)
- [ ] `[machine]` **Negative controls are detected** — a planted `ephemeral.sqlite`, a corrupted byte
      and a broadened backup rule each fail their suite. (Sub-PRD **D3**)
- [ ] `[machine]` **Nothing outside `tests/integration/recovery/**` is modified**, and the sibling
      integration subtrees and `infra/**` are untouched. (Sub-PRD **D1**; plan §4, §5.24)
- [ ] `[machine]` **Offline and credential-free** — network denied, no AWS/Cloudflare/provider
      credential, no `evals/**` read; the object store is a local stub. (PRD §20.2; §23.1
      *"break-glass restore credentials MUST remain outside ordinary production runtime"*; §45.1
      item 6)
- [ ] `[machine]` **No skipped or conditional assertion**; every exclusion is a `coverage-gaps.md`
      row. (Sub-PRD **D3**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration` green
      (standing item, PRD §45.3; sub-PRD **D10**).
- [ ] `[machine]` No Rust or Python written here — `cargo test --workspace` / `uv run pytest`
      unaffected; declared not applicable. (PRD §45.3)
- [ ] `[human]` **The real monthly drill against actual S3 Sydney** — with production backup
      credentials, which PRD §20.2 and §23.1 keep out of agent context — remains an operator
      procedure in `RLSE-09`'s tooling and `RLSE-10`'s runbook. This suite proves the *procedure and
      its assertions* offline; the operator's timestamped run is `LNCH-05`'s closure evidence for PRD
      §26 Operations. Not required to merge this ticket. (PRD §20.2; §23.1; §26; §42.3)
- [ ] `[machine]` **Writeback item**: `docs/prd/23-assurance/README.md` is updated if any PRD §42.3
      step proves unassertable offline, naming the step and the reason. (Plan §1.1; CLAUDE.md
      issue #53)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**OPS-001**; `UAT-OPS-02`),
      user-visible change (none — tests only) and non-goals, schema/API/event compatibility impact
      (none), **tenant/PII/security and retention impact** (the suite asserts the PRD §10.4 ephemeral
      exclusion and PRD §19.2 prefix separation; it holds no real credential), source/licence impact
      (none), cost/memory/latency impact (release-candidate CI runtime — report it), **rollback path**
      (app and corpus rollback are `RLSE-06`/`RLSE-07`; named as a gap here), known gaps
      (`coverage-gaps.md`).

Absent classes: the single `[human]` item is the operator's real-S3 monthly drill, which PRD §20.2
structurally forbids an agent from running; everything the PRD states as a **CI/restore test** (§39.3)
is `[machine]`, and the seven-step drill replay is `[fixture]`. There are no other human criteria —
PRD §26 asks for the procedure to be *demonstrated*, and this suite demonstrates it repeatably.

## Test plan

Every `[machine]`/`[fixture]` step runs offline: network denied, no AWS or provider credential, no
`evals/**` access.

1. **Run the suite.** `pnpm --filter <tests-integration> test:integration -- recovery`. Confirm it
   prints the destination inventory size and the drill step results.
2. **Read the drill steps against the PRD.** Compare `fixtures/prd-42-3-drill.json` with
   `docs/PRD.md` §42.3 step by step — seven steps, in order. A merged step silently deletes a check.
3. **Inventory sharpness.** Copy `ephemeral.sqlite` into the stub `backups/` prefix and confirm
   `backup-exclusion.test.ts` fails; remove it and confirm green.
4. **Canary.** Write a canary into ephemeral content during the workload and confirm the byte search
   over the destination is what catches a leak — not merely the filename check.
5. **Glob source.** Confirm `no-wildcard-rule.test.ts` imports `EPHEMERAL_FILE_GLOBS` from `DATA-08`
   rather than restating it; change the list in a scratch branch and confirm this suite reacts.
   Discard.
6. **Isolation proof.** Confirm the email, webhook, SSO and provider sinks count **attempts**; make
   the drill deliberately attempt one and confirm the assertion fails. Discard.
7. **Integrity.** Corrupt one byte of the restored database and confirm `PRAGMA integrity_check`
   fails the suite. Discard.
8. **Read-only step.** Hash the restored database before and after step 6 and confirm equality.
9. **Recovery-point health.** Kill the replication process, then separately break the destination;
   confirm the health signal degrades in both cases and that a merely-alive process does not pass.
10. **Retention.** Confirm the seven-daily / 30-weekly assertion reads the destination inventory, not
    only the configuration file.
11. **Report.** Confirm `report/restore-report.json` exists with all seven required fields and that
    `report/index.md` is generated from it; confirm the report is written even when the drill fails.
12. **Isolation of the suite.** `git diff --name-only` shows only `tests/integration/recovery/**` plus
    the shared member manifest (append-only) and the lockfile. **No file under `infra/**` may
    appear.**
13. **Construction pattern to copy.** `DATA-08`'s own `packages/database/test/ephemeral/**` for the
    glob and sweeper semantics, `RLSE-05`'s recovery-point validation tests for the health signal, and
    `RLSE-09`'s drill tooling interface for driving the steps.
14. **Reviewer focus.** Confirm the exclusion assertion is a **full inventory against an allowlist**,
    not a spot check for one filename; confirm the wildcard test reads `DATA-08`'s globs; confirm the
    isolation assertion counts attempts rather than successes; confirm step 6 writes nothing; confirm
    the health signal is recovery-point based; confirm no `infra/**` file was modified to make a
    rule pass.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR → merge
   → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/23-assurance/README.md` (version +0.1 with a changelog line) **before** changing code.
   Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *An ephemeral or corpus file reaches the destination* → **that is a defect in the module that
     configured replication** (`RLSE-05`, or `DATA-08` if the glob list is wrong). File it against
     that ticket as a docs PR and leave the assertion at full strength. **Do not edit `infra/backup/**`
     or `packages/database/**` from `tests/**`** (sub-PRD **D1**). PRD §10.4 makes this absolute:
     ephemeral content *"MUST NOT enter Litestream, daily/weekly backups, exports or support tools."*
   - *A PRD §42.3 step cannot be executed offline* → record the step and the reason in
     `coverage-gaps.md` **and** in `docs/prd/23-assurance/README.md`, and route the residual to
     `RLSE-09`'s operator procedure and `RLSE-10`'s runbook by docs PR. Never delete the step from the
     transcription — the count assertion makes a silent drop fail.
   - *Step 4 needs tables outside this closure* → `coverage-gaps.md` row naming `DATA-06` **plus** the
     exact plan §5.24/§6.2 edge proposed by docs PR. Never add a `blocked_by` edge locally (plan
     §6.2).
   - *The replication health signal is liveness-based* → that falsifies PRD §42.3's opening sentence
     and is `RLSE-05`'s defect. File it there; do not weaken this suite to "process is running".
   - *A test wants real S3 to be faithful* → refuse for the automated path. PRD §20.2 and §23.1 keep
     those credentials out of agent context; the real drill stays an operator step. If fidelity gaps
     matter, record them in `coverage-gaps.md` and in `RLSE-09`'s runbook by docs PR.
   - *`assertNotBackedUp`'s signature or glob list changes* → align **here** and record it; if the
     change is wrong, it is `DATA-08`'s docs PR, not a local copy of the old list.
3. **Falsified protocol.** **If `ephemeral.sqlite` or corpus data cannot be kept out of the
   replication destination**, PRD §10.4, §23.1, §39.3 and the whole PRD §37.3 retention matrix are
   falsified together — transient research content would be entering customer backup storage, which
   PRD §42.4 would classify as a security/privacy incident. Stop. Do not narrow the inventory
   allowlist, do not exclude the canary search, and do not "handle" it with a post-hoc deletion step.
   Escalate for re-review, raise an ADR under `docs/adr/`, and write back to
   `docs/prd/23-assurance/README.md` **and** `docs/prd/breakdown-plan.md` before any code changes.
   `LNCH-05` is `blocked_by` this ticket and closes PRD §26 Operations against this report.
