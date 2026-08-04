---
id: DATA-07
title: Usage, monitor, issue/correction, audit, incident tables
module: 01-app-data
lane: 01-app-data
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [DATA-05]
blocks: [DATA-09, EVID-08, WTCH-01, WTCH-02, PLTF-09, INTL-09]
---

# DATA-07 — Usage, monitor, issue/correction, audit, incident tables

Implements PRD §15.6, §35.6 and §24.4 — persistence half of **MON-001**, **COR-001**, **COR-002**,
**ADM-003** and **OPS-003** (`E04-APPDB`). No ADR — the decision is already made in PRD §35.6 and
§24.4; this is build ticket 7 of 9 against it.
Parent sub-PRD: [01-app-data README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [DATA-05 — Execution tables + packages/jobs lease primitives](DATA-05-execution-tables-packages-jobs-lease-primitives.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed
contract (PRD §35.6's operations table list plus §24.4's funding ledgers) — not a new subsystem
decision.

## Background + basis

Per sub-PRD decision **D3**, PRD §35.6 is split between `DATA-05` (execution) and this ticket
(operations). The rows owned here, quoted verbatim from **PRD §35.6**:

> | `usage_ledger` | `id`, `organization_id`, `funding_ledger`, operation, reservation/settlement/release, units/cost, job/idempotency linkage, timestamp | append-only double-entry-style balance invariant |
> | `watchlist` / `watch_target` | tenant, name/state/delivery fields; typed normalised target | no crawler per watch |
> | `detected_change` | source/corpus IDs, change type, dates, before/after node/document IDs, severity | **global public-source event, not tenant content** |
> | `alert` / `alert_delivery` | tenant/watch/change/affected record/status; channel/attempt/provider status | idempotent `(alert, channel, destination)` |
> | `issue_report` / `correction` | tenant target/category/description/status; replacement and impact linkage | original answer preserved |
> | `audit_event` | actor/tenant/action/resource/result/request/IP/session metadata/time | append-only; no complete research body/credential |
> | `incident` / `kill_switch` | severity/state/scope/reason/review/expiry/actor | append-only actions; no data deletion side effect |

**PRD §24.4 — Funding ledgers and concurrency**:

> - `FOUNDER_PLATFORM_BUDGET`: trial/internal usage.
> - `CUSTOMER_PREPAID_OR_BYOK`: customer-funded variable model cost.
>
> Customer variable cost MUST be prepaid or BYOK; the system MUST NOT create unsecured founder
> liability. Default per-organisation concurrency: two Quick, one Deep and one export, with separate
> API/search burst limits and webhook queues.

**PRD §42.6** makes the ledger an admission-control mechanism, not a report:

> The monthly A$50 ceiling is an admission-control requirement, not a spreadsheet hope. … Before a
> hosted call the gateway computes a conservative reservation from model profile, maximum
> input/output tokens and current price. Admission requires both operation quota and funding-ledger
> balance. **Settlement records actual provider usage and releases the remainder.**

**PRD §35.8 invariant 2**: *"A job cannot settle more cost than its reservation without an explicit
additional prepaid/BYOK reservation."*
**PRD §38.5**: *"Search, answer credits, advanced-task credits, API calls and provider cost are
separate ledgers; exhausting one does not misreport the others."*
**PRD §34.1**: *"Money | Integer micro-AUD for internal cost; never floating point."*

**PRD §12.3 — User issues and corrections**:

> Users MUST be able to report incorrect citations, outdated sources, wrong jurisdiction/date,
> unsupported claims, missing authority and privacy issues at answer/claim/citation/source level.
> Confirmed errors MUST create a Correction, **preserve the original answer**, create or link a
> replacement Answer Snapshot, run impact analysis and notify affected customers when required.

**PRD §12.4 — Incidents and kill switches**:

> Incident states: `INVESTIGATING`, `IDENTIFIED`, `MITIGATING`, `MONITORING`, `RESOLVED`,
> `POSTMORTEM_REQUIRED`. … Kill switches MUST be scopeable to generation, provider/model, Deep
> Research, source, jurisdiction, corpus promotion, ingestion, webhooks, invitations, organisation
> or credential. **Every activation requires actor, reason, scope, incident and review/expiry time
> and cannot bypass audit or delete data.**

**PRD §42.5** enumerates the switch scopes and their admission behaviour, and closes with:
*"Kill switches expire or require review at the recorded time. No switch deletes content or bypasses
retention/audit."*

**PRD §32.7** describes what a watchlist holds: *"A watchlist has name, targets, event types,
jurisdictions, severity threshold, delivery mode (`IMMEDIATE` or `DAILY_DIGEST`), channels and active
state."*
**PRD §30.2**: MON-001 — *"A watchlist can target documents, nodes, ABNs, topics, saved searches and
record authorities"*, evidence *"Target normalisation and tenant isolation pass"*; MON-002 — evidence
*"N matching tenants do not trigger N crawls"*; MON-004 — evidence *"Signature/replay/retry/
dead-letter tests pass"*; ADM-003 — evidence *"Scope matrix and automatic expiry pass"*; OPS-003 —
*"Founder-funded monthly spend stops at A$50 and search remains usable"*, evidence *"90% warning and
100% hard-stop tests pass"*.
**PRD §22**: *"Audit/security records retain 12 months separately and are backed up"*, and logs
*"MUST exclude research/evidence content, PII text, credentials"*. **PRD §10.3**: *"Security and
audit events: 12 months."*

Accepted caveats carried forward:

- `detected_change` is explicitly **not tenant content**: it is a global public-source event. It
  therefore has no `organization_id` and is written through `DATA-02`'s `systemContext`, never a
  tenant repository. That is exactly what makes MON-002's "one change, N tenants, one crawl"
  structurally true.
- The circuit-breaker *arithmetic* (90% warning, hard stop, reserve order) is `FND-09` and
  `EVID-08`. This ticket owns the ledger's balance invariant and its append-only shape, not the
  admission decision.

## Goal

Add the eleven PRD §35.6 operations tables as one expand-only, timestamp-prefixed migration with
`packages/database/src/schema/operations.ts` and `packages/database/src/repos/operations/**`, such
that: the usage ledger is append-only and mechanically refuses a settlement exceeding its
reservation (invariant 2) while keeping the funding ledgers and the separate operation ledgers
independent; watch targets are typed and normalised on write; `detected_change` is global and
unwritable through a tenant repository; alert delivery is idempotent per
`(alert, channel, destination)`; corrections link a replacement without touching the original;
`audit_event` is append-only and cannot hold a research body or credential; and every kill switch
carries actor, reason, scope, incident and expiry with deactivation modelled as an append.
Completion is mechanically checkable by the schema assertion plus the ledger, idempotency, scope and
append-only suites.

## Non-goals

- **No routes, screens or delivery.** `16-monitor-alerts` (`WTCH-*`), `20-developer-platform`
  (`PLTF-09` usage/audit endpoints), `22-internal-admin` (`INTL-09` incidents/kill switches) and
  `17-records-collab` (`RCRD-*` issue reports) own the surfaces and are `blocked_by` this ticket.
- **No email/webhook sending, signing or retry loops.** `WTCH-04`/`WTCH-05` and `RUNT-04`; this
  ticket stores `alert_delivery` attempts and the outbox rows are `DATA-05`'s.
- **No change detection or matching.** `WTCH-02` (`apps/worker/src/handlers/change-matching/**`) and
  `05-ingestion-framework`; this ticket stores `detected_change`.
- **No budget arithmetic, price normalisation, exchange rate or circuit-breaker decision.** `FND-09`
  (`packages/domain/src/budget/**`) and `EVID-08` (`packages/model-gateway/src/budget/**`), which is
  `blocked_by` this ticket.
- **No kill-switch enforcement at admission.** `RUNT-02` and `INTL-09`; this ticket stores the
  switch and exposes the query.
- **No correction workflow or impact analysis.** `INTL-08`/`RCRD-07`; this ticket stores the rows and
  guarantees the original is preserved.
- **No research/answer tables** (`DATA-06`) and **no job/outbox/model-execution tables** (`DATA-05`)
  — see sub-PRD D3.

## File-scope (write-owns)

- `packages/database/src/schema/operations.ts`
- `packages/database/src/repos/operations/**`
- `packages/database/migrations/<UTC YYYYMMDDHHMMSS>_operations.sql` (matches plan §5.2's
  `migrations/*_operations.sql`)
- `packages/database/test/operations/**` (this ticket's own test area, sub-PRD D8)
- `packages/database/package.json` — append-only (sub-PRD D9)

- Does not touch: `src/migrate/**`, `migrations/0001_*` (`DATA-01`) · `src/tenant/**` (`DATA-02`) ·
  `src/crypto/**` (`DATA-03`) · `src/schema/tenancy.ts`, `src/repos/tenancy/**`,
  `migrations/*_tenancy.sql` (`DATA-04`) · `src/schema/execution.ts`, `src/repos/execution/**`,
  `migrations/*_execution.sql`, `packages/jobs/**` (`DATA-05`) · `src/schema/research.ts`,
  `src/repos/research/**`, `migrations/*_research.sql` (`DATA-06`) · `src/ephemeral/**` (`DATA-08`) ·
  `src/invariants/**`, `test/invariants/**` (`DATA-09`) · `apps/**`, `tests/**`.

**Serial safety.** First decomposition — nothing merged, no in-flight contention. The concurrent
sibling is `DATA-06` (wave 5, `src/schema/research.ts`, `src/repos/research/**`,
`migrations/*_research.sql`); the file-scopes are disjoint. Both groups reference `job` from
`DATA-05`, and that shared dependency is already ordered by both tickets' `blocked_by: [DATA-05]`.
Because migrations are timestamp-prefixed and expand-only (plan **A5**), the two groups do not
serialise on the migrations directory. `src/schema/*.ts` is a glob, not a barrel (sub-PRD D4).

## Deliverables

1. **Migration** `<timestamp>_operations.sql`, expand-only, via `nextMigrationFilename('operations')`,
   creating the eleven tables with `DATA-01`'s §35.1 conventions, `DATA-02`'s
   `tenantForeignKey`/`tenantUnique` and `DATA-03`'s `encryptedColumnDdl` for any customer free text
   (`issue_report.description_ciphertext`, `correction.rationale_ciphertext` — state the set in the
   schema file).
2. **Scopes.** `TENANT`: `usage_ledger`, `watchlist`, `watch_target`, `alert`, `alert_delivery`,
   `issue_report`, `correction`, `audit_event`. `GLOBAL`: `detected_change`, `incident`,
   `kill_switch` — with the caveat that a kill switch may *name* a tenant in its scope payload while
   the row itself is operator-owned (PRD §42.5 "Tenant/key | Only named scope denied"). State the
   reasoning in the schema file; `detected_change`'s global scope is mandated verbatim by PRD §35.6.
3. **Usage ledger (append-only, invariant 2).** `packages/database/src/repos/operations/usageLedger.ts`:
   - columns include `funding_ledger` (`FOUNDER_PLATFORM_BUDGET` | `CUSTOMER_PREPAID_OR_BYOK`,
     PRD §24.4), `operation_ledger` (search / answer credits / advanced-task credits / API calls /
     provider cost — PRD §38.5's "separate ledgers"), `entry_type`
     (`RESERVATION` | `SETTLEMENT` | `RELEASE`), `units`, `cost_micro_aud` INTEGER (PRD §34.1),
     `job_id`, `idempotency_key`, `created_at`;
   - repository exposes `reserve`, `settle`, `release` and `balance` only — no update, no delete
     (`APPEND_ONLY`); a `BEFORE UPDATE/DELETE` trigger aborts;
   - `settle(tx, ctx, { jobId, actualMicroAud })` refuses when the settlement would exceed the sum of
     that job's reservations, with `SETTLEMENT_EXCEEDS_RESERVATION`, unless an additional
     reservation row for that job exists (PRD §35.8 invariant 2, PRD §42.6);
   - `balance(ctx, { fundingLedger, operationLedger, period })` is computed from entries, never from
     a stored running total, and each `(fundingLedger, operationLedger)` pair is independent
     (PRD §38.5);
   - `UNIQUE (organization_id, job_id, entry_type, idempotency_key)` so an at-least-once worker
     retry cannot double-charge (PRD §18.5 "no duplicate charge").
4. **Watchlists and targets (MON-001).** `watchlist` carries name, state, event types,
   jurisdictions, severity threshold, delivery mode (`IMMEDIATE` | `DAILY_DIGEST`), channels
   (PRD §32.7). `watch_target` stores a **typed normalised** target — one column for
   `target_kind` (document, node, ABN, topic, saved search, record authority — the six MON-001 kinds)
   plus a normalised key; the repository normalises on write (ABN digits-only with checksum validity
   recorded, document/node ids as opaque corpus references) and enforces
   `UNIQUE (organization_id, watchlist_id, target_kind, normalized_key)`.
5. **`detected_change` (global).** No `organization_id`; written only through `systemContext`
   (`DATA-02`); a compile-time/runtime assertion proves a tenant repository cannot be constructed
   for it. Columns: source/corpus ids, `change_type`, detection/publication/effective dates,
   before/after node and document ids, `severity` (PRD §35.6, §32.7). This is the structural half of
   MON-002 — one row fans out to many tenants' alerts.
6. **Alerts and delivery idempotency (MON-004).** `alert` links tenant + watchlist + change +
   affected record + status. `alert_delivery` records channel, destination, attempt, provider status,
   with `UNIQUE (alert_id, channel, destination)` (PRD §35.6 "idempotent `(alert, channel,
   destination)`"). `recordAttempt` is append-only per attempt with a bounded attempt counter and a
   dead-letter terminal state.
7. **Issues and corrections (COR-001, COR-002).** `issue_report` stores target type/id, category,
   description ciphertext, status; the repository **rejects** a payload carrying copied full answer
   content (enforce a length bound and require stable target ids — PRD §30.2 COR-001 "Report includes
   stable target IDs, not copied full content"). `correction` links `original_answer_id` and
   `replacement_answer_id` plus impact linkage, and has **no** write path that touches the original
   snapshot — which is structurally guaranteed by `DATA-06`'s immutability triggers (PRD §12.3,
   §35.6 "original answer preserved").
8. **Audit events.** `audit_event` is `APPEND_ONLY` with a `BEFORE UPDATE/DELETE` trigger; columns
   are actor, tenant, action, resource type/id, result, request id, IP, session metadata, timestamp.
   The repository API accepts **no free-text body parameter**, and a schema assertion proves no
   column can hold a research body or credential (PRD §35.6 "no complete research body/credential",
   §22). Provide `appendAuditEvent(tx, ctx, entry)` so it composes into the caller's transaction
   (PRD §18.5 step 6 commits "job status, audit and outbox" together), and wire it as the sink for
   `DATA-02`'s `setTenantAuditSink` so the break-glass path is recorded (PRD §21.2).
9. **Incidents and kill switches (ADM-003).** `incident` uses the six PRD §12.4 states as a generated
   enum CHECK. `kill_switch` requires `actor_id`, `reason`, `scope_type`, `scope_payload`,
   `incident_id` and `review_or_expiry_at` — all NOT NULL; the repository rejects an expiry in the
   past. `scope_type` covers every PRD §42.5 scope (model profile/provider, Deep Research, corpus
   release/source/jurisdiction, ingestion/promotion, webhooks, tenant/key, global generation, plus
   PRD §12.4's invitations and organisation). Deactivation is an **append** (a new row or a terminal
   append-only action row), never a delete or an in-place clear (PRD §12.4 "append-only actions; no
   data deletion side effect"). `activeSwitchesAt(now)` returns the effective set for `RUNT-02` and
   `INTL-09` and automatically excludes expired switches.
10. **`packages/database/src/schema/operations.ts`** exporting `tableManifest` with
    `group: 'operations'`, the scopes from deliverable 2, `mutability` `APPEND_ONLY` for
    `usage_ledger`, `audit_event`, `alert_delivery` attempts and kill-switch actions,
    `MUTABLE_METADATA` for `watchlist`, `watch_target`, `alert`, `issue_report`, `correction`,
    `incident`, plus `encryptedColumns` and the full `requiredColumns` from PRD §35.6. No barrel file
    (sub-PRD D4).

## Acceptance checklist (classified)

- [ ] `[machine]` A clean database migrates to head and contains the eleven PRD §35.6 operations
      tables with every listed required column, asserted against a literal expectation table
      (PRD §35.6, sub-PRD D3)
- [ ] `[machine]` `DATA-01`'s `assertSchemaConventions` passes for the operations manifest; enum
      CHECKs (funding ledger, incident state, kill-switch scope, change type, delivery mode) equal
      their `packages/contracts` value sets (PRD §35.1, §12.4, §24.4, `FND-03`)
- [ ] `[machine]` **Invariant 2 / OPS-003**: settling more than the sum of a job's reservations fails
      with `SETTLEMENT_EXCEEDS_RESERVATION`; adding an explicit additional reservation makes the same
      settlement succeed (PRD §35.8 invariant 2, §42.6)
- [ ] `[machine]` `usage_ledger` is append-only: the repository exposes no update/delete, and a raw
      `UPDATE`/`DELETE` aborts via the trigger
- [ ] `[machine]` Balance is derived from entries: `reserve` → `settle` → `release` leaves the
      computed balance equal to reservations minus actual settlement, with no stored running total
      (PRD §42.6 "Settlement records actual provider usage and releases the remainder")
- [ ] `[machine]` **PRD §38.5 ledger separation**: exhausting the API-call ledger leaves the search
      and provider-cost balances unchanged, and `FOUNDER_PLATFORM_BUDGET` and
      `CUSTOMER_PREPAID_OR_BYOK` are independent (PRD §24.4, §38.5)
- [ ] `[machine]` Double-charge prevention: two identical `settle` calls with the same
      `(job_id, entry_type, idempotency_key)` create one row (PRD §18.5 "no duplicate charge")
- [ ] `[machine]` `cost_micro_aud` is INTEGER and a float insert is rejected (PRD §34.1)
- [ ] `[machine]` **MON-001**: all six target kinds normalise and round-trip; a duplicate normalised
      target in one watchlist is rejected; the cross-tenant matrix over watchlists/targets returns
      the indistinguishable `ResourceNotFound` (PRD §30.2 MON-001 "Target normalisation and tenant
      isolation pass")
- [ ] `[machine]` **MON-002 (structural)**: `detected_change` has no `organization_id`, cannot be
      written through a tenant repository, and one row supports alerts for three organisations
      (PRD §35.6 "global public-source event, not tenant content")
- [ ] `[machine]` **MON-004**: a duplicate `(alert, channel, destination)` delivery row is rejected;
      attempts increment; the dead-letter terminal state is reachable and final (PRD §35.6)
- [ ] `[machine]` **COR-001**: an `issue_report` payload exceeding the content bound, or lacking a
      stable target id, is rejected (PRD §30.2 COR-001 "stable target IDs, not copied full content")
- [ ] `[machine]` **COR-002**: creating a `correction` linking original and replacement leaves the
      original `answer_snapshot` byte-identical (read before/after and compare), proving "original
      answer preserved" (PRD §12.3, §35.6)
- [ ] `[machine]` `audit_event` is append-only, has no column able to hold a research body or
      credential (asserted from `pragma table_info` plus a repository-API assertion), and
      `DATA-02`'s break-glass path produces exactly one audit row (PRD §35.6, §22, §21.2)
- [ ] `[machine]` **ADM-003**: a `kill_switch` insert missing actor, reason, scope, incident or
      review/expiry is rejected; an expiry in the past is rejected; `activeSwitchesAt` excludes
      expired switches; deactivation appends and deletes nothing (PRD §12.4, §42.5, §30.2 ADM-003
      "Scope matrix and automatic expiry pass")
- [ ] `[machine]` Every PRD §42.5 scope value is representable and covered by a scope-matrix test
      (PRD §42.5)
- [ ] `[machine]` Encryption canary: issue-report description text does not appear in the raw
      `.sqlite`/`-wal` bytes (PRD §37.3, `DATA-03`)
- [ ] `[machine]` The migration passes `assertExpandOnly` and its filename matches
      `MIGRATION_FILENAME` with the `operations` group suffix (plan A5)
- [ ] `[machine]` `pnpm test` green
- [ ] No `[fixture]` criteria — nothing recorded is replayed; corpus and source ids in tests are
      synthetic opaque strings
- [ ] No `[human]` criteria — `UAT-MON-01` (one change, three tenants), `UAT-MON-02` (webhook
      replay) and `UAT-OPS-03` (A$50 circuit breaker) are PRD §41.2 manual scripts run end-to-end by
      `16-monitor-alerts`, `22-internal-admin` and `23-assurance`, not against this package
- [ ] No Rust or Python is touched (PRD §45.3)

## Test plan

Offline; no network, no email/webhook destination, no provider.

1. `pnpm test`; focused run with `pnpm --filter <the packages/database package name> test`.
2. Reuse `withTempDatabase` (`DATA-01`), the tenancy factories (`DATA-04`), the execution factories
   (`DATA-05`) and — for the COR-002 test — the research factories (`DATA-06`). Add
   `packages/database/test/operations/factories.ts`.
3. Ledger suite: property-style table of `(reservations[], settlements[], releases[])` sequences;
   assert the derived balance and that no settlement sequence can exceed reservations without an
   explicit extra reservation row. Include a concurrent case: two threads settling the same job
   simultaneously, asserting exactly one row and no over-settlement.
4. Ledger separation: seed entries in all five operation ledgers and both funding ledgers; exhaust
   one; assert each other balance is unchanged.
5. Fan-out: one `detected_change` written through `systemContext`; three organisations each with a
   matching watchlist; assert three alerts, each visible only to its own tenant, and that
   `detected_change` itself is unreadable through a tenant repository.
6. Delivery idempotency: insert the same `(alert, channel, destination)` twice; assert the second is
   rejected; then walk attempts to the dead-letter state and assert it is terminal.
7. COR-002: create a snapshot via `DATA-06`'s `writeAnswerSnapshot`, hash the row, create a
   `correction` with a replacement, re-read and re-hash the original, assert equality.
8. Kill-switch matrix: parametrise over every PRD §42.5 scope; for each, assert required fields,
   expiry rejection, `activeSwitchesAt` inclusion/exclusion around the expiry instant, and that
   deactivation performs no delete (row count before/after).
9. Reviewer greps the diff for any `REAL` cost column, any stored running-balance column, any
   `organization_id` on `detected_change`, and any `UPDATE`/`DELETE` against `usage_ledger` or
   `audit_event`.

## Feedback obligation

1. **General rule.** If implementation falsifies this spec, update this ticket and
   `docs/prd/01-app-data/README.md` first (version +0.1 + changelog line), then change code, then
   `publish-tickets.mjs --sync` (CLAUDE.md, issue #53).
2. **Foreseeable frictions, each with its writeback target:**
   - *`EVID-08`'s admission path needs a stored running balance for performance* → a stored total
     creates a second source of truth for money. Record the requirement, the proposed materialised
     view and its refresh invariant in `docs/prd/01-app-data/README.md` **before** adding the column,
     and cross-check with `DATA-09` invariant 2; a durable choice needs
     `docs/adr/NNNN-usage-ledger-balance.md`.
   - *A funding or operation ledger value is missing from `packages/contracts`* → canonical enums are
     serial-owned by `FND-03` (plan §4.1). Raise a `00-foundation` ticket and record the edge in
     `docs/prd/breakdown-plan.md` §6.2; do not add the value to a local CHECK.
   - *A kill-switch scope in PRD §42.5 cannot be represented as `(scope_type, scope_payload)`* →
     record the actual representation in `docs/prd/01-app-data/README.md` and notify `INTL-09` and
     `RUNT-02` via the cross-module table; do not drop a scope — PRD §12.4 enumerates them
     normatively.
   - *`detected_change` turns out to need tenant scope* → that would falsify MON-002's "N matching
     tenants do not trigger N crawls" and PRD §35.6's explicit wording. Escalate per layer 3; the
     writeback target is `docs/prd/01-app-data/README.md` D3 plus `docs/prd/breakdown-plan.md` §5.2
     (`16-monitor-alerts`'s assumptions depend on it).
   - *`audit_event` retention (12 months, PRD §10.3/§22) needs a partition or separate database* →
     PRD §18.1 forbids multiple service databases. Record the retention mechanism in
     `docs/prd/01-app-data/README.md` and coordinate with `RLSE-05`'s backup scope; a separate file
     would be an Architecture decision needing an ADR.
   - *An `issue_report` genuinely needs to carry a content excerpt* → COR-001's evidence forbids
     copied full content. Raise it as a **Product change** (PRD §45.5) with `17-records-collab`
     named, in `docs/prd/01-app-data/README.md`'s open questions.
3. **Falsified decision.** If the §35.6 execution/operations split (sub-PRD **D3**) proves wrong —
   for example if the ledger must be written in the same statement as the job row — that is a
   decomposition-level change affecting two tickets' file-scopes and possibly a `blocked_by`
   direction. Stop, escalate for re-review, and update `docs/prd/01-app-data/README.md` D3 and
   `docs/prd/breakdown-plan.md` §5.2/§6.2 before moving a table between migration files.
