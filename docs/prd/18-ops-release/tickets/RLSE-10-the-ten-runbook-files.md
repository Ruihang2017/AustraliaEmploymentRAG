---
id: RLSE-10
title: "The ten runbook files"
module: 18-ops-release
lane: 18-ops-release
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RLSE-06, RLSE-07, RLSE-09]
blocks: [LNCH-04]
---

# RLSE-10 — The ten runbook files

Implements PRD §42.7 and §26 (Operations) — requirement families `OPS-001`/`OPS-002`/`OPS-003` and
`ADM-002`, epic `E30-OBS-DR`. **No ADR — the decision is already made in PRD §42.7, which tabulates
the ten required files and the activity each one gates; this is build ticket 10 of 11 against it.**
Parent sub-PRD: [18-ops-release README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on:
[`RLSE-06`](RLSE-06-app-deploy-and-rollback-tooling.md),
[`RLSE-07`](RLSE-07-corpus-promotion-and-rollback-tool.md) and
[`RLSE-09`](RLSE-09-restore-drill-tooling-and-isolated-recovery-environment.md) — mirrors
`blocked_by`.
**Why `builder`:** a bounded change inside one module's declared file-scope writing ten documents
whose content is fixed by PRD §42.7, §42.3, §42.4, §42.5, §39.7 and the tools already built — not a
new subsystem decision.

## Background + basis

**PRD §42.7 is the specification — the exact file list and the gate each one holds:**

> These are implementation deliverables, **currently not created**:
>
> | File | Required before |
> |---|---|
> | `docs/runbooks/deploy.md` | First production app deployment |
> | `docs/runbooks/app-rollback.md` | First production app deployment |
> | `docs/runbooks/corpus-promote-rollback.md` | First corpus promotion |
> | `docs/runbooks/backup-restore.md` | Any durable customer data |
> | `docs/runbooks/server-rebuild.md` | Paid access |
> | `docs/runbooks/source-failure.md` | Automated ingestion |
> | `docs/runbooks/provider-budget-failure.md` | Hosted model use |
> | `docs/runbooks/security-incident.md` | External access |
> | `docs/runbooks/legal-correction.md` | Generated answers |
> | `docs/runbooks/tenant-closure-deletion.md` | First customer onboarding |

**PRD §26 makes them a Definition-of-Done item:** *"**Runbooks exist for deploy, migration, restore,
source failure, provider failure, security incident and correction.**"*

**PRD §42.2 binds each alert to an operator action**, and each of those actions must land in a
runbook: every row's *"Initial operator action"* column is the first paragraph of the runbook
`RLSE-08`'s rule names.

**PRD §42.4 fixes the incident classification the incident runbook uses:**

> | SEV-1 | Cross-tenant disclosure; systemic materially wrong current-law answers; unrecoverable
> customer-data loss | Stop affected/global capability immediately, preserve evidence, status notice/
> notification assessment |
> | SEV-2 | Material source/corpus defect; prolonged auth/Search outage; backup RPO breach | Scope kill
> switch/maintenance, rollback or restore, customer-impact analysis |
> | SEV-3 | Feature degradation with workaround; delayed alerts/exports | Disable/queue feature,
> communicate in status/support as needed |
> | SEV-4 | Low-impact UI/docs defect | Normal issue queue |
>
> Every incident records detection, owner, severity, affected versions/tenants, timeline, kill
> switches, customer-notification decision, correction/rollback, resolution and follow-up. SEV-1/2
> require postmortem; **the solo founder may be both operator and approver, but the audit cannot be
> omitted.**

**PRD §42.5 fixes the kill-switch scopes** every incident runbook must reference: model
profile/provider, Deep Research, corpus release/source/jurisdiction, ingestion/promotion, webhooks,
tenant/key and global generation — with *"Kill switches expire or require review at the recorded time.
**No switch deletes content or bypasses retention/audit.**"*

**PRD §42.6 fixes the budget-failure behaviour:** *"The monthly A$50 ceiling is an admission-control
requirement, not a spreadsheet hope … Founder-funded reserve order: 1. production incident/synthetic
safety check allowance; 2. active trial commitments; 3. internal testing; 4. discretionary Deep runs …
**If price or currency data is unavailable, new founder-funded calls fail closed.**"*

**PRD §12.3 fixes the correction workflow** the legal-correction runbook documents: *"Confirmed errors
MUST create a Correction, preserve the original answer, create or link a replacement Answer Snapshot,
run impact analysis and notify affected customers when required."*

**PRD §10.3 fixes tenant closure:** *"Deleted customer records: 30-day recoverable period, then
primary deletion. Deleted data in backups: ages out within a further maximum of 30 days. Organisation
closure: **export followed by deletion within 30 days**."*

**The tools these runbooks quote, restated so this ticket is cold-startable:**

- **`RLSE-06`** (`infra/deploy/promote/**`): `deploy.mjs --archive … --version … --confirm-hash …
  [--reason] [--plan]` implementing PRD §39.7's eight steps, and `rollback.mjs [--to <version>]
  [--plan]`; `lib/api.mjs` exports `runDeploy`, `runRollback`, `planDeploy`, `syntheticSearchCheck`,
  `syntheticAnswerCheck`, `isCompatible`, `STEP_IDS`. Database rollback is **never** automatic.
- **`RLSE-07`** (`infra/deploy/corpus/**`): `promote.mjs --release <id> --confirm-manifest-sha256
  <hex> [--reason] [--plan]`, `rollback.mjs [--to <id>]`, `retain.mjs`; refusals include
  `FIXTURE_REFUSED`, `INCOMPATIBLE_APP`, `INSUFFICIENT_DISK`, `PINNED_PROVIDER_UNBOUND`.
- **`RLSE-09`** (`infra/recovery/**`): `drill.mjs [--mode container|temp-host] [--at|--id|--latest]`
  and `whole-server.mjs` implementing PRD §23.2's priority order, with a report carrying
  `achieved_rpo_seconds`/`achieved_rto_seconds` against the PRD §13.2 targets.
- Reachable transitively and therefore quotable: **`RLSE-01`**'s `verify-release.mjs`, **`RLSE-02`**'s
  `install-layout.mjs`/`preflight.mjs`, **`RLSE-05`**'s `cli.mjs recovery-point|lag|verify-retention|
  scan-destination`.
- **Not** in this ticket's blocker closure: `RLSE-03` (edge), `RLSE-04` (S3), `RLSE-08` (alerting and
  the status page), `RLSE-11` (benchmark), and every mechanism owned by other modules
  (`INGF-*` source failure, `EVID-*`/`FND-09` budget breaker, `INTL-09` kill switches, `RCRD-07`
  corrections, `DATA-*` deletion). Deliverable 3's `PENDING` convention is how those steps are written
  honestly.

**Why these three blockers.** breakdown-plan §6.2: `RLSE-06 --> RLSE-10`, `RLSE-07 --> RLSE-10`,
`RLSE-09 --> RLSE-10`. The three most dangerous procedures — deploy/rollback, corpus promotion and
restore — must exist as executable tools before their runbooks can quote real commands rather than
aspirations.

**Accepted caveats carried forward, documented not enforced here:**

- **Five of the ten runbooks describe mechanisms this module does not own.** `source-failure.md`
  (`05-ingestion-framework`), `provider-budget-failure.md` (`FND-09`, `EVID-08`, `INTL-07`),
  `security-incident.md` (`INTL-09`, `23-assurance`), `legal-correction.md` (`RCRD-07`, `INTL-08`),
  `tenant-closure-deletion.md` (`DATA-*`, `XPRT-01`). PRD §42.7 still requires the **files** to exist
  before the activities they gate, so this ticket writes them from the PRD and marks every step whose
  mechanism is not yet merged `PENDING <ticket-id>` (deliverable 3). A runbook that describes a
  command that does not exist, without saying so, is worse than no runbook.
- **`LNCH-04`** (`24-launch`, `docs/onboarding/**`, `blocked_by` this ticket) builds the paid-pilot
  onboarding pack on top of these files; PRD §41.4's *"Go live"* stage depends on them.
- **No production credential, host or account.** PRD §20.2. Every command in every runbook is quoted
  from a tool that exists in the repository; the runbooks tell a **human operator** what to run.

## Goal

Produce `docs/runbooks/**`: exactly the ten PRD §42.7 files, each stating the activity it gates, each
quoting commands that exist in this repository, each naming its abort/rollback path and its audit
obligation, and each marking any step whose mechanism is not yet merged as `PENDING <ticket-id>`.
Completion is mechanically checkable: a linter asserts the file set equals PRD §42.7's list exactly;
every fenced command block is either resolvable to a file in the repository whose `--help` exits `0`,
or explicitly marked `PENDING`; every internal link resolves; every runbook carries the required
section skeleton; and every PRD §42.2 alert row's `runbook` reference (from `RLSE-08`) points at a file
that exists.

## Non-goals

- **No tooling, configuration or code of any kind.** Every mechanism belongs to the ticket that built
  it: `RLSE-01`…`RLSE-09`, `RLSE-11` and the other modules named above. This ticket writes documents.
- **No new procedure that the tools do not implement.** A runbook step with no executable behind it is
  marked `PENDING`, not invented. PRD §44.4's principle applies to operations as much as to sources:
  an unimplemented thing is never silently called present.
- **No alert rules or thresholds.** `RLSE-08` (`infra/deploy/monitoring/**`) owns PRD §42.2's table;
  the runbooks quote the *"Initial operator action"* column and are **referenced by** the rules.
- **No incident record schema, kill-switch implementation or admin console.** `22-internal-admin`
  (`INTL-09`, `ADM-003`) and `01-app-data` (`DATA-07`). The security-incident runbook describes the
  PRD §42.4/§42.5 procedure and names the console.
- **No policies, terms, privacy or disclaimer text.** `24-launch` (`LNCH-01`, `docs/policies/**`).
  `tenant-closure-deletion.md` references them and defines the operational steps only.
- **No onboarding or demo material.** `24-launch` (`LNCH-04`, `docs/onboarding/**`), which is
  `blocked_by` this ticket.
- **No release evidence pack.** `24-launch` (`LNCH-05`, `docs/release/**`) and `21-evaluation-600`
  (`GOLD-03`).
- **No API documentation.** `20-developer-platform` (`docs/api/**`).
- **No `infra/**` writes at all.** Every `infra/` subtree belongs to a sibling ticket; this ticket only
  **reads** them to quote commands.

## File-scope (write-owns)

- `docs/runbooks/**` — exactly the ten PRD §42.7 files, a `README.md` index, the shared section
  template, and the runbook linter with its tests under `docs/runbooks/_lint/**`.

Does not touch:

- `infra/**` in its entirety — `RLSE-01`…`RLSE-09`, `RLSE-11` and `RUNT-09`. In particular
  **`infra/compose/**` — `RUNT-09` (`03-app-runtime`), breakdown-plan A7**; production procedures must
  not reference the local development stack (PRD §39.2).
- `docs/policies/**`, `docs/onboarding/**`, `docs/release/**` — `24-launch` (`LNCH-01`, `LNCH-04`,
  `LNCH-05`). `docs/api/**` — `20-developer-platform`. `docs/adr/**` — shared-additive per file
  (breakdown-plan **A9**); this ticket creates none. `docs/PRD.md`, `docs/discovery/**`,
  `docs/archive/**` — frozen (breakdown-plan §4). `docs/prd/**` — planning artifacts; this ticket
  writes only the writeback lines its acceptance requires.
- `apps/**`, `packages/**`, `services/**`, `pipelines/**`, `schemas/**`, `evals/**`, `tests/**` —
  their owning modules. Root manifests, lockfiles, `.github/workflows/**` — `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown-plan §1 header: `phase: 1`, nothing merged,
no in-flight ticket) — nothing has previously written `docs/runbooks/**`. breakdown-plan §4 gives the
whole tree to `18-ops-release` and §5.19 gives it wholly to this ticket; no sibling writes any
`docs/` path except `RLSE-11`'s reports, which live under `infra/deploy/benchmark/**`. In the sub-PRD
wave shape this ticket runs in wave 5 concurrently with `RLSE-11` (`infra/deploy/benchmark/**`) — a
disjoint tree. All three blockers merge before it starts. `infra/compose/**` belongs to `RUNT-09` and
must not be referenced here (breakdown-plan **A7**, §4.1).

## Deliverables

1. **`docs/runbooks/README.md`** — the index: PRD §42.7's table reproduced with a link per file and
   its "Required before" gate, a one-line statement of the `PENDING` convention, and the rule that
   every command in every runbook exists in this repository or is marked `PENDING`.
2. **`docs/runbooks/_template.md`** — the section skeleton every runbook follows, so ten documents are
   comparable under pressure at 3 a.m.:
   `Gate` (the PRD §42.7 "Required before" row) · `When to use this` (the triggering alert or event,
   naming the PRD §42.2 row where one exists) · `Preconditions` (what must be true, with the command
   that checks it) · `Procedure` (numbered, each step one command or one decision) · `Abort / rollback`
   (what to do when a step fails, and what state that leaves) · `Verification` (how you know it
   worked) · `Audit` (what must be recorded — actor, reason, timestamps, ids — per PRD §42.4's *"the
   audit cannot be omitted"*) · `Escalation` (severity per PRD §42.4 and who decides) ·
   `Known gaps` (every `PENDING` step listed).
3. **The `PENDING` convention.** Any step whose mechanism is not merged is written as
   `> **PENDING `<ticket-id>`** — <what will happen once it exists>. Until then: <the safe manual
   fallback, or "stop and escalate">.` The linter (deliverable 15) asserts that every `PENDING` marker
   names a ticket id that exists under `docs/prd/**` and that no unmarked command block references a
   file absent from the repository. Basis: PRD §44.4's principle and PRD §42.7's requirement that the
   file exist *before* the activity.
4. **`docs/runbooks/deploy.md`** — gate: *first production app deployment*. Procedure = PRD §39.7's
   eight steps, each quoting `RLSE-06`'s actual command and its guard codes:
   verify the archive (`node infra/deploy/release/verify-release.mjs …`), review the plan
   (`node infra/deploy/promote/deploy.mjs … --plan`), authorise with recent MFA and the typed
   version/hash confirmation (PRD §20.4), check preflight/backup lag/recovery point, run the deploy,
   read the journal, confirm the post-switch synthetic Search and bounded Answer. Abort section: the
   guard code table from `RLSE-06` deliverable 10 with what each leaves behind, and the statement that
   before `swap_pointer` nothing active has changed. Audit: the `APP_PROMOTED` record's fields.
5. **`docs/runbooks/app-rollback.md`** — gate: *first production app deployment*. Procedure =
   `RLSE-07`-independent: choose a compatible prior release (`rollback.mjs --plan`), authorise, swap,
   verify. Carries PRD §39.7's sentence verbatim — *"**Database rollback is not automatic; use a
   forward fix unless the runbook explicitly restores a verified recovery point during maintenance**"*
   — and then, because this is that runbook, defines the **explicit maintenance-window procedure**
   for restoring a verified recovery point: announce maintenance, stop admissions, take a fresh
   confirmed recovery point, restore with `RLSE-09`'s primitive, verify integrity and references,
   resume in PRD §23.2's priority order. Every step of that procedure that depends on an unmerged
   mechanism is `PENDING`.
6. **`docs/runbooks/corpus-promote-rollback.md`** — gate: *first corpus promotion*. Procedure =
   `RLSE-07`'s sequence: fetch the report, review the plan, authorise with recent MFA + reason + the
   typed `release_id`/`manifest_sha256` confirmation (`ADM-002`), promote, read the journal, confirm
   the post-switch smoke and the recorded verification path (`SHADOW` or `BOUNDED_READONLY`).
   Rollback: activate a prior verified release. Retention: `retain.mjs` and why it fails closed while
   `INTL-04` is unbuilt. Includes the `UAT-OPS-01` expectation — *"Corrupt candidate corpus fixture →
   Promotion blocked; active release/search unchanged"* — as the operator's sanity check.
7. **`docs/runbooks/backup-restore.md`** — gate: *any durable customer data*. Two procedures:
   (a) **health**: `RLSE-05`'s `cli.mjs lag|recovery-point|verify-retention|scan-destination`, with
   PRD §42.2's warn/critical thresholds and the 24-hour recovery-point rule; (b) **monthly drill**:
   `RLSE-09`'s `drill.mjs`, PRD §42.3's seven steps, where the report lands, and the rule that the
   report **must** carry the achieved RPO/RTO against PRD §13.2's ≤15 min / ≤4 h targets or an explicit
   shortfall. States plainly that ephemeral content is expected to be **absent** after restore
   (PRD §10.4) and that this is correct, not data loss.
8. **`docs/runbooks/server-rebuild.md`** — gate: *paid access*. Procedure = PRD §23.2's whole-server
   sequence driven by `RLSE-09`'s `whole-server.mjs`: recreate Sydney compute/storage; bootstrap
   (`RLSE-02`'s `bootstrap/` and `install-layout.mjs`, with the recorded `AER_IP_PROFILE` decision
   from sub-PRD **Q7**); restore `app.sqlite`; retrieve app and corpus releases and verify
   hashes/compatibility/integrity; reconnect the origin tunnel (`RLSE-03` — **`PENDING RLSE-03`** where
   its commands are not in this ticket's blocker closure); resume services in PRD §23.2's priority
   order *auth/records → Search → saved answers → Quick → Deep → exports/alerts*; publish incident
   status. Carries PRD §42.3's *"If compatibility or integrity is uncertain, remain in maintenance
   mode."*
9. **`docs/runbooks/source-failure.md`** — gate: *automated ingestion*. Written from PRD §12.1, §12.2,
   §40.9 and PRD §42.2's *"Critical source freshness | misses declared critical SLA by 2×"* row:
   triage (which of the five PRD §12.1 freshness dates moved), quarantine handling (PRD §12.2's
   categories), the `FRESHNESS_LIMITED` obligation (PRD §12.1: *"Sources without reliable delta
   mechanisms MUST show `FRESHNESS_LIMITED` rather than a false guarantee"*), the customer-visible
   consequence (PRD §42.2: *"Mark degraded; stop definitive affected answers if material"*), and the
   PRD §44.4 rule that a category is never silently called covered. Mechanism steps are
   `PENDING INGF-05` / `PENDING INGF-07` / `PENDING INTL-02` / `PENDING INTL-03`.
10. **`docs/runbooks/provider-budget-failure.md`** — gate: *hosted model use*. Written from PRD §42.6,
    §42.5 and §24.1: read month-to-date spend; the 90% action (*"Reduce synthetic/Deep; ask paid users
    for prepaid/BYOK"*) and the 100% action (*"Stop founder-funded model calls; **preserve Search**"*);
    the reserve order (incident/synthetic allowance → trial commitments → internal testing →
    discretionary Deep); the fail-closed rule when price or currency data is unavailable; the model
    profile/provider kill switch (PRD §42.5: *"Cancel safely at stage boundary; settle actual cost
    only"*); and the standing product guarantee that Search continues (PRD §26). Also names
    `RLSE-08`'s suppression of its own budgeted synthetic Answer check. Mechanism steps are
    `PENDING EVID-08` / `PENDING INTL-07` / `PENDING INTL-09`.
11. **`docs/runbooks/security-incident.md`** — gate: *external access*. Written from PRD §42.4, §42.5,
    §21 and §12.4: the severity table verbatim with first actions; the incident states
    (`INVESTIGATING`, `IDENTIFIED`, `MITIGATING`, `MONITORING`, `RESOLVED`, `POSTMORTEM_REQUIRED`);
    the ten fields every incident records; the scoped kill-switch table with the rule that *"No switch
    deletes content or bypasses retention/audit"* and that switches expire or require review; the
    SEV-1 cross-tenant path (*"Global customer-data capability kill switch; preserve evidence; assess
    notification"*); evidence preservation (never delete logs or backups during an incident —
    PRD §42.2's disk row says *"never delete active/backup evidence blindly"*); the vulnerability
    report intake via `security.txt` (`RLSE-03`); and the postmortem obligation for SEV-1/2 with the
    note that the solo founder may be both operator and approver *"but the audit cannot be omitted"*.
    Mechanism steps are `PENDING INTL-09`.
12. **`docs/runbooks/legal-correction.md`** — gate: *generated answers*. Written from PRD §12.3 and
    §32.6: confirm the reported defect; create a Correction; **preserve the original answer**; create
    or link a replacement Answer Snapshot; run impact analysis; mark affected records
    `REVIEW_REQUIRED`; notify affected customers when required. States explicitly that no original
    answer is ever edited or deleted (PRD §35.5's append-only rule). Mechanism steps are
    `PENDING RCRD-07` / `PENDING INTL-08`.
13. **`docs/runbooks/tenant-closure-deletion.md`** — gate: *first customer onboarding*. Written from
    PRD §10.3, §10.4, §19.2 and §23.1: export first, then delete within 30 days; the 30-day
    recoverable period before primary deletion; *"Deleted data in backups: ages out within a further
    maximum of 30 days"* — with the consequence spelled out that backup ageing is **lifecycle-driven**
    (`RLSE-04`) and that no operator deletes a backup object by hand (PRD §23.1 puts destructive
    deletion behind the break-glass identity); what must **not** be deleted (audit and security
    records retained 12 months, PRD §10.3); and the confirmation that ephemeral content requires no
    action because it expires by itself (PRD §10.4). Mechanism steps are `PENDING DATA-04` /
    `PENDING XPRT-01` / `PENDING INTL-09`.
14. **Cross-references, both directions.** Every runbook names the PRD §42.2 alert rows that lead to
    it, and `docs/runbooks/README.md` carries the inverse table (alert row → runbook) so `RLSE-08`'s
    `runbook:` field in each rule has a verifiable target. Every runbook also names the `[human]`
    acceptance items it supports (`UAT-OPS-01`, `UAT-OPS-02`, `UAT-OPS-03`).
15. **`docs/runbooks/_lint/lint.mjs`** — the machine check behind most acceptance items:
    - the file set equals PRD §42.7's ten names **exactly** (no extra, none missing);
    - each file contains every section of the deliverable-2 skeleton, in order;
    - every fenced `sh`/`bash` block's first token resolves to a path in the repository, and that
      path's `--help` exits `0` — **unless** the block is inside a `PENDING` callout;
    - every `PENDING <ticket-id>` names a ticket id present under `docs/prd/**/tickets/**`;
    - every relative link resolves;
    - no runbook references `infra/compose/**` (breakdown-plan **A7**; PRD §39.2);
    - no runbook contains a credential-shaped string, a real hostname, an account id or a customer
      name — reported by **path and line**, never by value (PRD §20.2, §22);
    - each file's `Gate` line matches PRD §42.7's "Required before" text for that file.
    Exit codes: `0` clean, `2` lint failures (listed), `1` internal error.

## Acceptance checklist (classified)

Cross-references: `OPS-001` (backup-restore and server-rebuild are the human half of *"restore is
tested monthly"*), `OPS-002` (every PRD §42.2 alert's operator action has a reachable runbook),
`OPS-003` (provider-budget-failure documents the 90%/100% behaviour and the preserve-Search rule),
`ADM-002` (corpus-promote-rollback documents the recent-MFA, reason-bearing, audited promotion).

- [ ] `[machine]` The file set under `docs/runbooks/` equals PRD §42.7's ten names **exactly** —
      asserted against a literal list; an extra or missing file fails (PRD §42.7)
- [ ] `[machine]` Each file's `Gate` line reproduces PRD §42.7's "Required before" text for that file
      (PRD §42.7)
- [ ] `[machine]` Each file contains every section of the shared skeleton in order — `Gate`,
      `When to use this`, `Preconditions`, `Procedure`, `Abort / rollback`, `Verification`, `Audit`,
      `Escalation`, `Known gaps` (deliverable 2)
- [ ] `[machine]` **Every command block is executable or explicitly `PENDING`:** the first token of
      every fenced shell block resolves to a repository path whose `--help` exits `0`, unless the block
      sits inside a `PENDING` callout — a runbook may not quote a command that does not exist
      (PRD §42.7; PRD §44.4's principle)
- [ ] `[machine]` Every `PENDING <ticket-id>` names a ticket id that exists under
      `docs/prd/**/tickets/**`, and every `PENDING` step is also listed in that file's `Known gaps`
      section (deliverable 3)
- [ ] `[machine]` Every relative link in every runbook resolves (deliverable 15)
- [ ] `[machine]` The alert→runbook inverse table in `README.md` covers every PRD §42.2 row, and every
      row's target file exists — so `RLSE-08`'s `runbook:` field can never dangle (PRD §42.2;
      `OPS-002`)
- [ ] `[machine]` `deploy.md` reproduces PRD §39.7's eight steps in order and quotes `RLSE-06`'s
      guard-code table; `app-rollback.md` carries PRD §39.7's *"Database rollback is not automatic"*
      sentence verbatim (PRD §39.7)
- [ ] `[machine]` `corpus-promote-rollback.md` states the recent-MFA + reason + typed
      `release_id`/`manifest_sha256` confirmation and the `UAT-OPS-01` expectation
      (`ADM-002`; PRD §41.2)
- [ ] `[machine]` `backup-restore.md` states PRD §42.2's warn 10 / critical 15-minute lag thresholds,
      the 24-hour recovery-point rule and PRD §13.2's ≤15 min RPO / ≤4 h RTO targets, and requires the
      drill report to carry the **achieved** figures or an explicit shortfall (`OPS-001`; PRD §42.3
      step 7; PRD §13.2)
- [ ] `[machine]` `server-rebuild.md` reproduces PRD §23.2's recovery priority order
      (*auth/records → Search → saved answers → Quick → Deep → exports/alerts*) and PRD §42.3's
      *"remain in maintenance mode"* rule (PRD §23.2, §42.3)
- [ ] `[machine]` `provider-budget-failure.md` states the 90% and 100% actions verbatim including
      *"preserve Search"*, the PRD §42.6 reserve order and the fail-closed rule for missing price data
      (`OPS-003`; PRD §42.6, §42.2)
- [ ] `[machine]` `security-incident.md` reproduces PRD §42.4's four severities with first actions,
      the six incident states, the ten recorded fields, and PRD §42.5's *"No switch deletes content or
      bypasses retention/audit"* (PRD §42.4, §42.5, §12.4)
- [ ] `[machine]` `legal-correction.md` states PRD §12.3's five obligations and that the original
      answer is never edited or deleted (PRD §12.3, §35.5)
- [ ] `[machine]` `tenant-closure-deletion.md` states export-before-delete, the 30-day recoverable
      period, the further 30-day backup ageing, the 12-month audit retention, and that no operator
      deletes a backup object by hand (PRD §10.3, §23.1)
- [ ] `[machine]` **No runbook references `infra/compose/**`** — production procedures must not depend
      on the local development stack (breakdown-plan **A7**; PRD §39.2; sub-PRD D2)
- [ ] `[machine]` No runbook contains a credential-shaped string, a real hostname, an account id or a
      customer name — reported by path and line, never by value; seeded with a `secret-canary-<uuid>`
      in a test fixture to prove the check fires (PRD §20.2, §22)
- [ ] `[machine]` No file outside `docs/runbooks/**` is modified — asserted by `git diff --name-only`
      (breakdown-plan §4)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green, including
      `node docs/runbooks/_lint/lint.mjs` exiting `0` (PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items, naming the requirement ids each runbook serves
      (`OPS-001`, `OPS-002`, `OPS-003`, `ADM-002`, `COR-002`), the known gaps (the complete `PENDING`
      list) and the rollback path (documents are revertible)
- [ ] `[fixture]` **Dry-run replay:** for the three runbooks whose tools exist
      (`deploy.md`, `corpus-promote-rollback.md`, `backup-restore.md`), a test executes each quoted
      command in its `--plan`/`--dry-run`/fixture form against the sibling tickets' offline harnesses
      and asserts the printed step sequence matches the runbook's numbered procedure — a runbook that
      has drifted from its tool fails here rather than at 3 a.m. (PRD §26 *"Runbooks exist for
      deploy, migration, restore …"*)
- [ ] `[human]` **Founder walkthrough**: the founder follows `deploy.md`, `corpus-promote-rollback.md`
      and `backup-restore.md` end to end against the real host and confirms each document is
      sufficient without asking anyone. **Not required to merge** — PRD §20.2 forbids giving coding
      agents production access; the merge-time substitute is the dry-run replay above plus the
      command-existence lint, which prove every quoted command exists and every documented sequence
      matches the tool's actual plan (PRD §43.4; CLAUDE.md Gate 2)
- [ ] `[human]` Operator review of the five `PENDING`-heavy runbooks (`source-failure`,
      `provider-budget-failure`, `security-incident`, `legal-correction`,
      `tenant-closure-deletion`) confirming that each is **useful today** — that the safe manual
      fallback in every `PENDING` callout is genuinely actionable. **Not required to merge**
      (PRD §42.7; PRD §43.4)
- No `cargo test --workspace` / `uv run pytest` item — this ticket authors no Rust and no Python; the
      linter is Node (PRD §45.3)

## Test plan

Reviewer steps. Everything except the two `[human]` rows runs offline with no host, no network and no
production credentials (PRD §20.2):

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `node docs/runbooks/_lint/lint.mjs` — must exit `0`.
3. `pnpm test --filter @aer/runbooks`, **or** `node --test docs/runbooks/_lint/test` if the workspace
   member is absent (open question **Q-RLSE-9**). Both must pass.
4. Harness: `_lint/test/helpers/fixtures.mjs` provides a valid runbook tree plus one mutation per
   rejection case, so every negative test is a one-line change to a known-good baseline.
5. **`fileset.test.mjs`** — the ten names against a literal list; add an eleventh file and assert
   failure; remove one and assert failure; assert each `Gate` line against PRD §42.7's text.
6. **`skeleton.test.mjs`** — remove each required section in turn from a fixture and assert failure
   naming the section.
7. **`commands.test.mjs`** — a block quoting a non-existent path fails; the same block inside a
   `PENDING` callout passes; a block quoting an existing tool whose `--help` exits non-zero fails.
   Then run the real check over the ten shipped files.
8. **`pending.test.mjs`** — a `PENDING` naming a non-existent ticket id fails; a `PENDING` step absent
   from `Known gaps` fails.
9. **`links.test.mjs`** — a broken relative link fails; the real files pass.
10. **`alert-map.test.mjs`** — parse `RLSE-08`'s `rules/index.yml` when it resolves and assert every
    `runbook:` target exists here and that `README.md`'s inverse table covers every PRD §42.2 row;
    record `SKIPPED_NOT_AVAILABLE` if `RLSE-08` is unmerged, never a silent pass.
11. **`content.test.mjs`** — assert the required verbatim sentences: PRD §39.7's eight steps and the
    database-rollback sentence; PRD §23.2's priority order; PRD §42.2's thresholds; PRD §42.6's 90/100
    actions; PRD §42.4's severities and states; PRD §42.5's no-deletion rule; PRD §12.3's five
    obligations; PRD §10.3's retention numbers.
12. **`hygiene.test.mjs`** — a fixture containing a credential-shaped string, a real-looking hostname,
    an account id and a customer name each fails, reported by path and line with the value absent from
    output (seed a `secret-canary-<uuid>`); assert no runbook mentions `infra/compose`.
13. **`dryrun.test.mjs`** — the `[fixture]` row: for `deploy.md`, `corpus-promote-rollback.md` and
    `backup-restore.md`, run each quoted command in its `--plan`/`--dry-run`/fixture form against the
    sibling harnesses and diff the printed step sequence against the runbook's numbered procedure.
14. **Diff check** — `git diff --name-only` lists only paths under `docs/runbooks/`.
15. **Reviewer focus:** read `deploy.md` and `corpus-promote-rollback.md` as if it were an incident and
    you had never seen this repository — every command must be copy-pasteable and every abort path
    must say what state it leaves; confirm no runbook instructs an operator to delete a backup object,
    a log or an active release; confirm the security-incident runbook never instructs evidence
    destruction; confirm every `PENDING` callout has a genuinely actionable fallback rather than
    "wait"; confirm no document leaks a hostname, credential or customer name.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(docs PR → merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/18-ops-release/README.md` (version +0.1 with a changelog line), **then** change the
runbooks. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **A runbook step needs a capability no tool provides** → do **not** write a procedure a human cannot
  execute. Mark it `PENDING <ticket-id>` with a safe manual fallback, list it in `Known gaps`, and
  raise the capability against the owning ticket as a docs PR (for example a missing abort path
  against `RLSE-06`, a missing retention behaviour against `RLSE-07`). Record the gap in
  `docs/prd/18-ops-release/README.md`.
- **A tool's actual command or step order differs from what a runbook says** → the **tool's ticket is
  the spec** (CLAUDE.md, issue #53). Fix the runbook, and if the tool's behaviour is wrong, raise a
  docs PR against `RLSE-06`/`RLSE-07`/`RLSE-09` and `--sync` before changing either. The dry-run
  replay test exists to catch this drift automatically.
- **PRD §42.7's ten files are not enough** (an eleventh procedure is genuinely needed) → PRD §42.7 is
  a fixed list. Adding a file is a **product/PRD** change under PRD §45.5: record the need in
  `docs/prd/18-ops-release/README.md`, get founder approval, and only then add it. The linter's exact
  file-set assertion is deliberate.
- **A `PENDING` mechanism lands and the fallback is now wrong** → update the runbook in the same PR
  that merges the mechanism's ticket, or immediately after; a stale fallback is more dangerous than a
  `PENDING` marker. The `PENDING` list in `Known gaps` is the checklist for this.
- **An alert rule in `RLSE-08` names a runbook that does not exist** → the file set here is fixed by
  PRD §42.7, so the rule is wrong. Raise a docs PR against `RLSE-08` pointing the rule at one of the
  ten files, and record it in `docs/prd/18-ops-release/README.md`. Do not add an eleventh file to
  satisfy a rule.
- **A runbook would be clearer with a real hostname, account id or example credential** → it must not
  contain one (PRD §20.2, §22). Use a documented placeholder and point at `RLSE-02`'s configuration
  contract for where the real value lives.

**3. Escalation.** PRD §42.7 makes each file a **gate**: *"`docs/runbooks/deploy.md` | Required before
**first production app deployment**"*, *"`backup-restore.md` | Required before **any durable customer
data**"*, *"`server-rebuild.md` | Required before **paid access**"*. PRD §26 repeats it as a
Definition-of-Done item. If a gated activity is about to happen while its runbook is still substantially
`PENDING`, that is not a documentation debt — it is a launch-gate breach: stop, escalate for
re-review, and write back to `docs/prd/18-ops-release/README.md` and
`docs/prd/breakdown-plan.md`. Never mark a runbook complete by removing a `PENDING` marker that is
still true.
