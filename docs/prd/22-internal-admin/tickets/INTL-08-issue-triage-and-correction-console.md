---
id: INTL-08
title: Issue triage and correction console
module: 22-internal-admin
lane: 22-internal-admin
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INTL-01, RCRD-07]
blocks: []
---

# INTL-08 — Issue triage and correction console

Implements **PRD §8.11 (issue triage and corrections) and §12.3 — requirement `COR-002`**, with
`ADM-001`'s internal-visibility clause (epic `E29-INTERNAL-ADMIN`).
No ADR — the decision is already made in PRD §12.3 (*"Confirmed errors MUST create a Correction,
preserve the original answer, create or link a replacement Answer Snapshot, run impact analysis and
notify affected customers when required"*); this is build ticket **8 of 10** against it.
Parent sub-PRD: [22-internal-admin README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`INTL-01`](INTL-01-internal-v1-separation-internal-identity-admin-shell.md);
`RCRD-07` — Corrections: preserve original, link replacement, impact analysis
([`17-records-collab`](../../17-records-collab/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
`RCRD-07`'s correction API and impact-analysis job, plus `INTL-01`'s internal boundary — not a new
subsystem decision.

## Background + basis

**What a fresh agent needs to know before touching anything.**

`INTL-01` has merged and owns the internal boundary; its "internal boundary contract" is normative
here. This ticket declares `area = internalArea({ areaId: 'issues', capability: 'ISSUES' })`, wraps
its plugin in `internalRoutes()`, performs every cross-organisation read through
`crossOrganisationRead(ctx, { reason })` (PRD §21.2) and records every triage decision through
`withDangerousAction()` (sub-PRD **D6**).

`RCRD-07` has merged and owns correction creation and impact analysis. Its deliverables, quoted:

> **`apps/api/src/routes/corrections/index.ts`** … The **create/confirm** route declares a per-route
> `admission: 'internal'` override … because PRD §30.2 COR-002's primary surface is the *"Internal
> issue flow"* and PRD §8.11 requires internal identity for corrections.
>
> **`POST /v1/corrections` — create a Correction from a confirmed issue.** Body:
> `{ issue_report_id, corrected_answer_snapshot_id, target: { type, id }, category, reason,
> replacement: { mode: 'RERUN' | 'LINK', answer_snapshot_id? } }`. In **one** transaction it: verifies
> the issue … writes the `correction` row … writes the issue's terminal status; enqueues the
> impact-analysis job … **and** the outbox event, in the same transaction.
>
> **Record the outcome** on the correction: counts of scanned, affected, marked and skipped, plus the
> job id, **so the internal console (`INTL-08`) can show what impact analysis actually did.**

`RCRD-06` owns `/v1/issues` (the customer-facing, tenant-scoped report surface, `COR-001`) and
`DATA-07` owns the `issue_report` and `correction` tables. **This console therefore owns exactly one
thing neither of them has: the cross-organisation triage queue and its decision record.** It creates
no correction of its own — it drives `RCRD-07`'s endpoint, which is the single implementation of
COR-002's "preserve the original" guarantee.

**What the PRD fixes, quoted.**

PRD §12.3 in full:

> Users MUST be able to report incorrect citations, outdated sources, wrong jurisdiction/date,
> unsupported claims, missing authority and privacy issues at answer/claim/citation/source level.
> **Confirmed errors MUST create a Correction, preserve the original answer, create or link a
> replacement Answer Snapshot, run impact analysis and notify affected customers when required.**

PRD §30.2 `COR-002`: *"Confirmed correction preserves original, links replacement and performs impact
analysis"*, primary surface **"Internal issue flow"**, primary API *"correction endpoints"*, minimum
acceptance evidence **"Affected records become reviewable/notifyable"**.
PRD §30.2 `COR-001` (context for the queue's contents): *"Report includes stable target IDs, not copied
full content."*

PRD §43.4 — the founder test queue's classification vocabulary, which this console implements as the
triage classification: *"Every reviewed failure is classified `CODE`, `CORPUS`, `GOLD_DATA`, `PROMPT`,
`MODEL_PROFILE`, `PRODUCT_AMBIGUITY` or `SOURCE_LIMITATION`; it gets an owner, requirement ID and
reproducible fixture."*

PRD §21.2: *"Cross-organisation internal access uses a separate recent-MFA, reason-required, audited
path."*

PRD §22 / §10.3: audit records retain 12 months; logs exclude research content, PII text and
credentials.

PRD §35.8 invariant 5: *"Formal snapshots and legal corpus versions have no UPDATE/DELETE application
path; corrections append replacements."*

PRD §42.7: `docs/runbooks/legal-correction.md` is required before generated answers — owned by
`RLSE-10`, and this console is the surface that runbook drives.

**Accepted caveats carried forward, documented not enforced here.**

- **Correction creation is not re-implemented.** `RCRD-07`'s `POST /v1/corrections` is the only path;
  the console calls it with internal identity. A second implementation would fork the "original
  preserved" guarantee (deliverable 5, and the rejected alternative in the sub-PRD).
- **Notification delivery is not here.** `RCRD-07` writes the outbox event; `WTCH-04`/`WTCH-05`/
  `WTCH-06` deliver. PRD §12.3's *"notify affected customers when required"* is satisfied by the event
  being written, and this console shows whether it was.
- **An internal principal has no organisation** (`INTL-01` contract item 5), while `RCRD-07`'s route
  verifies the issue's organisation. The console therefore acts **within the issue's organisation**
  through the PRD §21.2 audited path; if `RCRD-07`/`RUNT-02` cannot express that, see the Feedback
  obligation (sub-PRD **M9**).

## Goal

Produce the internal issue triage and correction console: `/internal/v1/issues` endpoints serving the
cross-organisation issue queue with PRD §12.3's six report categories and target levels, a triage
decision endpoint applying the PRD §43.4 classification with owner and requirement id, and a read view
of each resulting `correction` including `RCRD-07`'s recorded impact-analysis outcome (scanned,
affected, marked, skipped, job id) and whether the notification outbox event was written; plus the
`apps/admin/src/features/issues/**` screens that walk an operator from a confirmed error to
`RCRD-07`'s correction endpoint. Completion is mechanically checkable: the console creates no
correction itself and registers no path that mutates an answer snapshot; every cross-organisation read
and every triage decision is audited with a reason before any effect; the COR-002 chain (confirm →
correction → impact analysis → notification) is visible end to end from one screen; and every endpoint
is invisible to customer identity.

## Non-goals

- **No correction creation, replacement linkage or impact analysis.** `RCRD-07`
  (`apps/api/src/routes/corrections/**`, `apps/worker/src/handlers/correction/**`). This console calls
  and displays.
- **No issue creation, comment or customer-facing issue surface.** `RCRD-06` (`/v1/issues`,
  `COR-001`).
- **No answer, snapshot, record, turn or review-action write of any kind.** `15-answer-product`,
  `17-records-collab`; PRD §35.8 invariant 5 forbids an UPDATE/DELETE path to a formal snapshot.
- **No notification delivery, alert row, watchlist or channel.** `16-monitor-alerts`.
- **No table, migration or repository.** `DATA-07` owns `issue_report` and `correction`; `DATA-06`
  owns the snapshots (plan **A3**).
- **No incident or kill switch.** `INTL-09` — a systemic correction pattern that warrants an incident
  is raised there; this console links.
- **No runbook.** `docs/runbooks/legal-correction.md` is `RLSE-10` (PRD §42.7).
- **No evaluation, source, licensing, release or cost view.** `INTL-02`…`INTL-07`.
- **No internal boundary code.** `INTL-01`.

## File-scope (write-owns)

- `apps/api/src/routes/internal/issues/**`
- `apps/api/test/internal/issues/**` (sub-PRD **D11**), including `apps/api/test/internal/issues/fixtures/**`
- `apps/admin/src/features/issues/**`
- `apps/admin/test/issues/**` (sub-PRD **D11**)
- `apps/admin/package.json` — **append-only**, dependencies block only (sub-PRD **D10**, plan §1.1)

Does not touch:

- `apps/api/src/routes/internal/core/**`, `apps/admin/src/app/**`, `apps/admin/{index.html,vite.config.ts,tsconfig.json}`
  — `INTL-01`.
- `apps/api/src/routes/internal/{sources,quarantine,releases,licensing,evaluation,cost,incidents}/**`
  and `apps/admin/src/features/{sources,quarantine,releases,licensing,evaluation,cost,incidents,overview}/**`
  — `INTL-02`…`INTL-07`, `INTL-09`, `INTL-10`.
- `apps/api/src/routes/{corrections,issues,research-records,research-turns,record-answers,review-actions,comments,answers,answer-snapshots}/**`
  — `17-records-collab`, `15-answer-product`.
- `apps/worker/**` — `RUNT-04` and the product handler subtrees (`RCRD-07` owns
  `handlers/correction/**`).
- `packages/**`, `schemas/**` — `00`–`03`, `11`, `12`, `20`. `pipelines/**`, `evals/**` — `04`–`10`, `21`.
- `apps/web/**`, `apps/widget/**`, `infra/**`, `docs/runbooks/**`, `tests/**` — other modules.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, nothing in flight),
so no prior ticket has written these paths. Inside `apps/api/src/routes/internal/**` and `apps/admin/**`
only `INTL-01` (this ticket's `blocked_by`) has written, owning `internal/core/**` and `src/app/**`,
and it completes first. The seven siblings that may run concurrently (plan §7 wave 2, all blocked only
by `INTL-01`) own different `internal/<area>/` and `features/<area>/` directories, discovered by
directory convention (plan **A1**, sub-PRD **D9**). `RCRD-07` writes `apps/api/src/routes/corrections/**`
and `apps/worker/src/handlers/correction/**`, which this ticket never touches — the relationship is a
consumed API, not a shared path. The single shared file is `apps/admin/package.json`, restricted to
appending distinct dependency entries.

## Deliverables

1. **`apps/api/src/routes/internal/issues/index.ts`** — `export const area = internalArea({ areaId:
   'issues', capability: 'ISSUES' })` and a default export of `internalRoutes(plugin, { areaId:
   'issues', capability: 'ISSUES' })`.
2. **`GET /internal/v1/issues`** — the cross-organisation triage queue, read through
   `crossOrganisationRead(ctx, { reason })` (mandatory non-empty reason, audited before any read —
   PRD §21.2). Rows carry `issue_id`, `organization_id` and name, `created_at`, reporter actor id,
   **category** (the six PRD §12.3 kinds: incorrect citation, outdated source, wrong
   jurisdiction/date, unsupported claim, missing authority, privacy issue), **target level**
   (answer / claim / citation / source) with its **stable target ids** (`COR-001`: ids, not copied
   content), current status, triage classification if set, assigned owner, linked requirement id and
   whether a correction exists. Cursor pagination and filters by category, target level, status,
   classification, organisation and age (PRD §34.1).
3. **`GET /internal/v1/issues/{issueId}`** — detail: the report's structured fields, the resolved
   target references (snapshot id, claim id, citation id, corpus document/node version ids — ids only),
   the record and answer identity, and the **linked correction** with `RCRD-07`'s recorded impact
   outcome (`scanned`, `affected`, `marked`, `skipped`, `job_id`) and whether the notification outbox
   event was written. Free-text description is returned **truncated to the same bound `DATA-07`
   enforces on write**, is marked `internal_only`, and is never logged (PRD §22, §10.3).
4. **`POST /internal/v1/issues/{issueId}/triage`** — the console's own decision record, wrapped in
   `withDangerousAction({ incident: false, expiry: false })`. Body:
   `{ decision: 'CONFIRMED_ERROR' | 'NOT_AN_ERROR' | 'NEEDS_MORE_INFORMATION' | 'DUPLICATE',
   classification: 'CODE' | 'CORPUS' | 'GOLD_DATA' | 'PROMPT' | 'MODEL_PROFILE' | 'PRODUCT_AMBIGUITY'
   | 'SOURCE_LIMITATION', owner, requirement_id, fixture_ref?, reason, confirmation, scope: { type:
   'ISSUE_REPORT', payload: { issueId, organizationId } } }` — the vocabulary is exactly PRD §43.4's,
   and `owner` plus `requirement_id` are **required** because PRD §43.4 requires them
   (*"it gets an owner, requirement ID and reproducible fixture"*; `fixture_ref` is optional and its
   absence is recorded, never assumed). The effect records the decision through the audit sink and,
   when a decision sink is configured, publishes it; the response is
   `{ recorded: true, published: boolean, status }`.
5. **The correction is created by `RCRD-07`, never here.** `CONFIRMED_ERROR` does **not** create a
   correction as a side effect. The console's screen then directs the operator to `RCRD-07`'s
   `POST /v1/corrections` with the issue id pre-filled; that route carries its own
   `admission: 'internal'` + recent-MFA gate and performs the single transaction PRD §12.3 requires.
   This area registers **no** route that writes a `correction`, an `answer_snapshot`, a
   `research_record` or a `review_action`, asserted by a source scan for those repository members and
   by enumerating the route table (PRD §35.8 invariant 5; `COR-002`).
6. **`GET /internal/v1/issues/corrections`** — the correction view: every correction with its issue,
   original and replacement snapshot ids, category, reason, created-at, impact-analysis outcome and
   notification-event state, filterable by organisation, category and outcome. It renders the COR-002
   chain in one place: **confirmed issue → correction → impact analysis → notification**, with each
   stage either evidenced or explicitly `PENDING`/`NOT_RUN` — never blank
   (PRD §12.3; `COR-002` evidence *"Affected records become reviewable/notifyable"*).
7. **`apps/admin/src/features/issues/feature.tsx`** — an `AdminFeatureModule` with `id: 'issues'`, a
   nav entry and routes `/internal/issues`, `/internal/issues/:issueId`,
   `/internal/issues/corrections`. Screens:
   - **queue** — grouped by category and age with the organisation shown; the PRD §21.2 reason prompt
     appears before the first cross-organisation read of the session and states that the access is
     audited;
   - **issue detail** — structured report fields, target ids with links to the record/answer, the
     triage form (classification, owner, requirement id, fixture reference), and — once triaged
     `CONFIRMED_ERROR` — a clearly labelled hand-off to the correction form;
   - **correction form** — collects `RCRD-07`'s exact body (`corrected_answer_snapshot_id`, `target`,
     `category`, `reason`, `replacement.mode` `RERUN` or `LINK` with `answer_snapshot_id`) and submits
     to `POST /v1/corrections`, surfacing that route's own errors verbatim; the dialog states that the
     original answer is preserved and a replacement is linked, never edited (PRD §12.3, §35.8
     invariant 5);
   - **correction detail** — the four-stage chain with the impact counts and the notification state,
     plus links to the affected records;
   - `INTL-01`'s `dangerous-action-dialog` for the triage decision, `SnapshotStatePanel` where a stage
     is not yet evidenced, and the PRD §31.3 async states throughout (impact analysis is an
     asynchronous job).

## Acceptance checklist (classified)

- [ ] `[machine]` The area mounts at `/internal/v1/issues` via `internalArea()`/`internalRoutes()` and
      `assertInternalMounting` passes (`INTL-01` contract items 1–2; PRD §8.11, §16.1)
- [ ] `[machine]` **`ADM-001` negative, every endpoint:** a customer session, a customer service-account
      credential and a widget token each receive a `404 RESOURCE_NOT_FOUND` byte-identical (apart from
      `request_id`) to the unknown-path body on the queue, detail, triage and corrections endpoints;
      unauthenticated → `401`; internal principal without `ISSUES` → the same `404`
      (PRD §30.2 `ADM-001`; PRD §16.5, §34.9)
- [ ] `[machine]` **PRD §21.2 cross-organisation path:** every read across organisations requires a
      non-empty reason, rejects an absent one with `400 INVALID_REQUEST` **before** any repository call,
      and appends exactly one audit event carrying actor, reason and request id
- [ ] `[machine]` **`COR-002` chain visible:** a fixture with a confirmed issue, a correction, a
      completed impact analysis and a written outbox event renders all four stages; a fixture missing
      the impact run renders `PENDING`/`NOT_RUN` rather than blank
      (PRD §12.3; `COR-002` evidence *"Affected records become reviewable/notifyable"*)
- [ ] `[machine]` **No correction or snapshot write here:** the route table contains exactly the four
      routes of deliverables 2, 3, 4 and 6; a source scan finds no call to a `correction`,
      `answer_snapshot`, `research_record` or `review_action` write member, and `CONFIRMED_ERROR`
      creates nothing (PRD §35.8 invariant 5; `COR-002`)
- [ ] `[machine]` **PRD §43.4 classification:** the triage endpoint accepts exactly the seven values
      `['CODE','CORPUS','GOLD_DATA','PROMPT','MODEL_PROFILE','PRODUCT_AMBIGUITY','SOURCE_LIMITATION']`
      and requires `owner` and `requirement_id`; a missing one is `400 INVALID_REQUEST`; an absent
      `fixture_ref` is recorded as absent, not defaulted
- [ ] `[machine]` **Audit before effect:** a triage decision appends the `AUTHORISED` event before the
      effect and an outcome event after; with no audit sink bound it is refused; missing reason, wrong
      typed confirmation, stale recent auth or missing capability each reject with an effect spy proving
      nothing ran (PRD §32.8, §12.4)
- [ ] `[machine]` **`COR-001` content discipline:** the queue and detail expose stable target ids; the
      description is truncated to `DATA-07`'s bound, marked `internal_only`, and appears in no log line
      or audit event (PRD §30.2 `COR-001`; PRD §22, §10.3)
- [ ] `[machine]` PRD §22 canary: a canary in a fixture issue description and in a linked answer
      snapshot appears in no log line and no audit event, and no answer, claim or evidence text is
      returned by any endpoint
- [ ] `[machine]` `assertNoInternalSurfaceInCustomerArtifacts()` green (PRD §8.11; sub-PRD **D7**)
- [ ] `[machine]` Admin screens implement the PRD §31.3 async states (impact analysis is asynchronous)
      and state that the original answer is preserved on the correction form (PRD §41.1, §12.3)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `COR-002`, `COR-001` and `ADM-001`, and the
      tenant/PII impact of the cross-organisation queue
- [ ] `[fixture]` The committed fixtures under `apps/api/test/internal/issues/fixtures/**` replay
      end-to-end: issues in three organisations covering all six PRD §12.3 categories and all four
      target levels, one already-corrected issue with a completed impact run, one correction whose
      impact job is pending, one whose outbox event is missing, and one issue whose description exceeds
      the bound — offline, no network, no production credentials
- [ ] `[human]` **`COR-002` end-to-end walkthrough** on a locally started stack: a confirmed issue is
      triaged here, a correction is created through `RCRD-07`'s endpoint from this console, the impact
      analysis marks affected records `REVIEW_REQUIRED`, the notification event is written, and the
      **original answer is byte-for-byte unchanged** (PRD §12.3, §30.2 `COR-002`; the preservation
      assertion itself is `RCRD-07`'s)
- [ ] `[human]` PRD §43.4 founder-review linkage: the triage classification, owner and requirement id
      recorded here match the founder test queue's vocabulary and are usable as its working queue
- No further `[human]` criteria — PRD §41.2 contains **no** `UAT-COR-*` row (sub-PRD **M4**); `COR-002`'s
  evidence is the PRD §30.2 evidence column, exercised above
- No `cargo test --workspace` / `uv run pytest` item — this ticket touches no Rust and no Python
  (PRD §45.3)

## Test plan

Reviewer steps, offline: no network, no email or webhook destination, no provider, no production
credentials.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`; `pnpm test`.
2. Focused: `pnpm test --filter @aer/api`, `pnpm test --filter @aer/admin`. Suites under
   `apps/api/test/internal/issues/` and `apps/admin/test/issues/`.
3. **`boundary.test.ts`** — `internalAreaConformance('issues')` plus the four-row denial matrix from
   `INTL-01` contract item 4 against all four endpoints.
4. **`cross-org.test.ts`** — assert an absent or empty reason returns `400` with **no** repository call
   (spy on the reader factory) and that a valid reason produces exactly one audit event. Seed three
   organisations and assert the queue shows all three only through the audited path.
5. **`triage.test.ts`** — effect spy over the rejection causes (no capability, unsatisfied MFA, stale
   recent auth, wrong confirmation, empty reason, missing `owner`, missing `requirement_id`, unbound
   audit sink) asserting `effect.calls === 0`; success row asserting one pre-effect `AUTHORISED` event
   and that **no** correction row was created (assert against the `correction` repository spy).
6. **`chain.test.ts`** — `[fixture]` replay of the corrected, pending-impact and missing-outbox
   fixtures; assert each stage renders evidenced or explicitly `PENDING`/`NOT_RUN`.
7. **`no-write.test.ts`** — enumerate the route table (the exact four routes) and source-scan for
   snapshot/record/correction write members.
8. **`content.test.ts`** — the oversized-description fixture and canaries; assert truncation, the
   `internal_only` marking, and absence from logs and audit events.
9. **`issues.screen.test.tsx`** — render queue, detail and correction form; assert the reason prompt
   precedes the first cross-organisation read, the correction form submits `RCRD-07`'s exact body shape,
   its errors surface verbatim, and the preservation statement is present.
10. `git status --porcelain` clean after the run.
11. **Reviewer focus** (CLAUDE.md): whether `CONFIRMED_ERROR` can create anything; whether a
    cross-organisation read can precede reason validation; whether an issue in organisation A can be
    triaged with a scope naming organisation B; whether description text can reach a log; whether two
    concurrent triage decisions can conflict; whether a customer principal reaches any endpoint.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`RCRD-07`'s `POST /v1/corrections` cannot accept an internal principal acting on a named
  organisation** (sub-PRD **M9**: an internal principal has no organisation, but that route verifies
  the issue's organisation) → do **not** re-implement correction creation here and do **not** widen the
  admission chain from this ticket. Amend `RCRD-07`'s ticket and, if the chain is the blocker,
  `RUNT-02`'s, in one docs PR; record it in `docs/prd/22-internal-admin/README.md` **M9** and
  `docs/prd/17-records-collab/README.md`; then `--sync` before writing code that assumes either
  behaviour.
- **`RCRD-07` does not record the impact-analysis counts or the outbox-event state where this console
  can read them** → its own deliverable 6 promises them *"so the internal console (`INTL-08`) can show
  what impact analysis actually did"*. Amend `RCRD-07`'s ticket and
  `docs/prd/17-records-collab/README.md`, record it here, then `--sync` both. Never query the worker's
  internals or reconstruct the counts.
- **The queue needs a field `DATA-07`'s `issue_report` does not have** (a triage classification column,
  an owner, a requirement id) → `packages/database/**` is `01-app-data` (plan **A3**). If the audit
  trail is not a sufficient home for the triage decision, add the ticket to
  `docs/prd/breakdown-plan.md` §5.2 and the edge in §6.2 (plan **R4**), and record it in
  `docs/prd/22-internal-admin/README.md`. Never create a table from here.
- **An operator wants to edit or withdraw an answer directly from the queue** → PRD §35.8 invariant 5
  and PRD §12.3 forbid it: corrections append replacements. Do not add the path; raise it as a
  **product change** (PRD §45.5) in `docs/prd/22-internal-admin/README.md` with the Founder as owner.
- **PRD §43.4's classification vocabulary does not fit real issues** → it is the PRD's, not this
  ticket's. Record the gap in `docs/prd/22-internal-admin/README.md` open questions with the Founder as
  owner; never add an eighth value locally.

**3. Escalation.** `COR-002` and PRD §12.3's *"preserve the original answer"* are release requirements,
and PRD §35.8 invariant 5 makes them structural. If the console cannot drive the correction flow
without writing a snapshot, a record or a correction of its own, that overturns a team decision
spanning this module and `17-records-collab`: stop, escalate for re-review, and never let this ticket
acquire a write path to research data. **A triage or correction flow that would have to bypass the
audit append, skip the PRD §21.2 cross-organisation path, or delete data to work overturns PRD §12.4
and §21.2** — escalate, never implement the shortcut.
