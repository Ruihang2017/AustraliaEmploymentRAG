---
id: RCRD-07
title: "Corrections: preserve original, link replacement, impact analysis"
module: 17-records-collab
lane: 17-records-collab
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RCRD-06, RCRD-03]
blocks: [INTL-08]
---

# RCRD-07 — Corrections: preserve original, link replacement, impact analysis

Implements PRD §12.3 — requirement **COR-002**, epic `E24-RECORDS`.
No ADR — the decision is already made in PRD §12.3 (*"Confirmed errors MUST create a Correction,
preserve the original answer, create or link a replacement Answer Snapshot, run impact analysis and
notify affected customers when required"*) and PRD §35.8 invariants 5 and 6; this is build ticket 7 of
9 against it.
Parent sub-PRD: [17-records-collab README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RCRD-06 — Issue reports at answer/claim/citation/source level](RCRD-06-issue-reports-at-answer-claim-citation-source-level.md)
· [RCRD-03 — Record↔answer linkage, rerun under current law, version diff](RCRD-03-record-answer-linkage-rerun-under-current-law-version-diff.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §12.3 fixes the four obligations and `RCRD-03`/`RCRD-06` supply the replacement and the trigger;
this composes them.

## Background + basis

**PRD §12.3 User issues and corrections**, the whole basis:

> Users MUST be able to report incorrect citations, outdated sources, wrong jurisdiction/date,
> unsupported claims, missing authority and privacy issues at answer/claim/citation/source level.
> **Confirmed errors MUST create a Correction, preserve the original answer, create or link a
> replacement Answer Snapshot, run impact analysis and notify affected customers when required.**

Four obligations in one sentence: **create**, **preserve**, **link**, **analyse-and-notify**. Each is
a deliverable below.

**Requirement COR-002** (PRD §30.2): *"Confirmed correction preserves original, links replacement and
performs impact analysis | **Internal issue flow** | correction endpoints | App | **Affected records
become reviewable/notifyable**."* The primary surface is the internal issue flow — sub-PRD **D9**.

**PRD §35.8**, the two invariants that make this mechanical rather than aspirational:

> 5. Formal snapshots and legal corpus versions have **no UPDATE/DELETE application path**;
>    corrections **append replacements**.
> 6. Outbox event and corresponding business state commit **in one transaction**.

**PRD §35.6**, the storage contract:

> | `issue_report` / `correction` | tenant target/category/description/status; **replacement and
> impact linkage** | **original answer preserved** |

**PRD §34.5** carries the customer-visible marker: the Answer Snapshot payload includes
`"correction_state": "NONE"`. That field is how `RCRD-08`'s correction badge and `19-exports`'
correction banner are driven (sub-PRD **D12**, **QR-3**), and `UAT-EXP-01` depends on it:
*"Export old corrected answer → Export shows original legal date/release and **correction banner**; no
regeneration."*

**PRD §32.6** requires a **correction badge** in the Research Record header, and gives the transition
that impact analysis performs:

> | Any active state | `REVIEW_REQUIRED` | system/admin/reviewer | **correction**, source change or
> material issue; **reason required** |
> | `REVIEW_REQUIRED` | `IN_REVIEW` | owner/reviewer | **replacement/rerun linked** |

**PRD §33.4 steps 7–9** give the shape impact analysis must follow — written there for the
source-change path (`16-monitor-alerts`/`WTCH-03`), and the same shape applies here:

> 7. Transaction creates tenant alerts and **marks materially affected records `REVIEW_REQUIRED`**.
> 8. **Outbox delivers** in-app/email/webhook **idempotently**.
> 9. Customer can rerun; **the original answer remains unchanged**.

**PRD §8.11 / §16.2**: internal administration covers *"issue triage and corrections"* and MUST be
*"separated under `/internal/v1`, require internal identity, MFA and short sessions"*. Sub-PRD **D9**
therefore mounts this area's **create/confirm** operation behind `RUNT-02`'s `internal` admission
profile as a per-route override, while reads stay `tenant`. `22-internal-admin`/`INTL-08` is
`blocked_by` this ticket and builds the console on top (plan §5.23).

**PRD §39.5**: the impact-analysis worker belongs to the `maintenance` queue class — *"cleanup,
**impact matching**, usage reconciliation"*, priority 4, cooperative and bounded. That is the same
class `WTCH-02`'s change matcher uses, and it is the reason impact analysis is a job rather than a
synchronous request: PRD §13.2 gives no latency objective for it, and an unbounded fan-out inside an
HTTP request would violate §38.5's request-size and concurrency discipline.

**PRD §42.7** lists `docs/runbooks/legal-correction.md` as required *"before generated answers"*. That
file is `18-ops-release`/`RLSE-10`'s; this ticket provides the mechanism the runbook describes and must
not write `docs/runbooks/**`.

**Accepted caveats carried forward, documented not enforced here:**

- **`correction` is a `DATA-07` table and this ticket has no `blocked_by DATA-07` edge**
  (sub-PRD **QR-1**), exactly as for `RCRD-06`. In the global schedule `01-app-data` delivers roughly
  twelve waves earlier. **If the repository is absent, stop and write back** to
  `docs/prd/breakdown-plan.md` §5.18 + §6.2 and this module's README; never create the table here
  (plan **A3**, **R4**).
- **This ticket has no `blocked_by FND-08` and no `blocked_by RCRD-04` edge** (sub-PRD **QR-2**), yet
  it must move affected records to `REVIEW_REQUIRED`. It therefore writes the transition through
  **`DATA-06.applyReviewAction(tx, ctx, { recordId, fromStatus, toStatus: 'REVIEW_REQUIRED',
  actorId: system, reason })`** — the structural half of PRD §35.8 invariant 7, reachable through
  `RCRD-01 → DATA-06`. `DATA-06` states the split explicitly: *"There is no other write path to
  `workflow_status` … **Which transitions are *legal* is `RCRD-04`'s (via `FND-08`)**."* If the
  Builder finds it must import `packages/domain/src/workflow` or `RCRD-04`'s service, **that is a
  missing plan edge** — write back, do not add a silent import.
- **This ticket does not deliver notifications.** `16-monitor-alerts` owns every channel
  (`WTCH-04` email, `WTCH-05` webhook, `WTCH-06` digest) and there is no edge to it. This ticket
  writes the **outbox event** in the same transaction as the business change (PRD §35.8 invariant 6)
  and stops. PRD §12.3's *"notify affected customers when required"* is satisfied by the event being
  written; delivery is the monitor module's.
- **Triage UI, severity classification and operator workflow** are `22-internal-admin`/`INTL-08`.

## Goal

Produce (a) `apps/api/src/routes/corrections/**` — the correction resource: create/confirm (internal
identity), read, list, and the replacement link; and (b) `apps/worker/src/handlers/correction/**` —
the bounded `maintenance`-class impact-analysis job that finds every record materially affected by a
correction, marks each `REVIEW_REQUIRED` with a reason naming the correction, and writes the
notification outbox event in the same transaction. Completion is mechanically checkable: a
hash-equality test proves the corrected snapshot and all its children are byte-for-byte unchanged
after a correction; a replacement-link test proves the new snapshot is reachable from the old through
the correction and never by mutating the old; and a transactional test proves the record marking and
the outbox event either both land or neither does.

## Non-goals

- **No table, migration or repository.** `DATA-07` owns `correction`; `DATA-06` owns
  `answer_snapshot`, `review_action` and `applyReviewAction` (sub-PRD **D1**, **QR-1**, plan **A3**,
  PRD §45.2, plan **R4**).
- **No answer synthesis and no rerun implementation.** `RCRD-03` owns `apps/worker/src/handlers/rerun/**`
  and is `blocked_by`-upstream of this ticket precisely so a replacement can be produced without this
  handler re-implementing anything (PRD §45.2; sub-PRD **D7**).
- **No issue creation or issue-comment surface.** `RCRD-06` (`apps/api/src/routes/issues/**`). This
  ticket **consumes** a confirmed issue and writes the issue's terminal status through `DATA-07`'s
  repository, never through `RCRD-06`'s routes.
- **No notification delivery, alert rows, watchlists or channels.** `16-monitor-alerts`
  (`WTCH-03` … `WTCH-06`). This ticket writes an outbox event only.
- **No internal console, `/internal/v1` route directory or admin screens.**
  `apps/api/src/routes/internal/**` and `apps/admin/**` are `22-internal-admin` (`INTL-08`,
  `blocked_by` this ticket).
- **No workflow transition legality table.** `FND-08` (see **QR-2**). This ticket writes exactly one
  transition (`* → REVIEW_REQUIRED`) through `DATA-06`'s structural guard, with `actor = system` and a
  reason — the trigger PRD §32.6 names *"correction"*.
- **No record CRUD, turns, comments or review-action HTTP surface.** `RCRD-01`, `RCRD-02`, `RCRD-05`,
  `RCRD-04`.
- **No screens.** `RCRD-08` renders the correction badge from §34.5's `correction_state`.
- **No export banner.** `19-exports` (`XPRT-02`/`XPRT-03`) renders it; `UAT-EXP-01` depends on this
  ticket's data, not its code.
- **No runbook.** `docs/runbooks/legal-correction.md` is `18-ops-release`/`RLSE-10` (PRD §42.7).
- **No incident or kill-switch state.** `22-internal-admin` (`INTL-09`), PRD §12.4.
- **No worker runtime, queue class definition or lease machinery.** `RUNT-04`.
- **No OpenAPI, contract, admission or app-manifest edits.** `FND-04`, `FND-03`, `RUNT-02`,
  `03-app-runtime` (**D16**).

## File-scope (write-owns)

- `apps/api/src/routes/corrections/**`
- `apps/worker/src/handlers/correction/**`
- `apps/api/test/records/corrections/**` and `apps/worker/test/records/correction/**` (sub-PRD **D15**)

Does not touch:

- `apps/api/src/routes/{research-records,research-turns,record-answers,review-actions,comments,issues}/**`
  — `RCRD-01` … `RCRD-06`; `apps/api/src/routes/internal/**` — `22-internal-admin`.
- `apps/worker/src/handlers/{rerun,answer,deep,coverage,comparison,change-matching,alerts,notifications,export,maintenance}/**`
  — `RCRD-03`, `15-answer-product`, `16-monitor-alerts`, `19-exports`, `RUNT-04`.
- `apps/worker/src/{main.ts,runtime,queues}/**` — `RUNT-04`;
  `apps/api/src/{server.ts,app.ts,bootstrap,plugins,middleware,errors,sse}/**` — `RUNT-01` …
  `RUNT-03`; the app manifests — `03-app-runtime` (**D16**).
- `packages/**`, `schemas/**` — `00-foundation`, `01-app-data`, `12`, `16`.
- `apps/web/**`, `apps/admin/**`, `infra/**`, `docs/runbooks/**`, `tests/**` — other modules.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, no in-flight
ticket), so nothing has previously written either subtree and nothing contends for them. Under plan
**A1** both the route area and the handler area self-register by directory — `RUNT-01` contract item 6
and `RUNT-04` contract item 6 each guarantee *"zero diff outside that area's own directory"* — so this
ticket edits no shared index in `apps/api` or `apps/worker`. `apps/worker/src/handlers/` is split by
plan §4 across five modules and this module owns exactly `rerun` (`RCRD-03`) and `correction` (this
ticket): two disjoint directories, and `RCRD-03` is a declared blocker so the two are never in flight
together. Its only wave-4 sibling, `RCRD-09`, writes `apps/web`. Per plan **A3** this ticket writes
**no** table and **no** repository — which is what lets `22-internal-admin`/`INTL-08` build the triage
console over the same `correction` rows, and `16-monitor-alerts` consume the same outbox, without any
module writing another's files.

## Deliverables

1. **`apps/api/src/routes/corrections/index.ts`** — default-exported `FastifyPluginAsync` plus
   `export const area = { admission: 'tenant' } satisfies RouteAreaConfig`; default prefix
   `/v1/corrections` (sub-PRD **D2**). The **create/confirm** route declares a per-route
   `admission: 'internal'` override (`RUNT-02` deliverable 1: *"per-route overrides declared in the
   route schema"*; profile `internal` = full chain **plus** internal-identity and recent-MFA
   assertions), because PRD §30.2 COR-002's primary surface is the *"Internal issue flow"* and PRD
   §8.11 requires internal identity for corrections (sub-PRD **D9**, **QR-11**).
2. **`POST /v1/corrections` — create a Correction from a confirmed issue (obligation 1).** Body:
   `{ issue_report_id, corrected_answer_snapshot_id, target: { type, id }, category, reason,
   replacement: { mode: 'RERUN' | 'LINK', answer_snapshot_id? } }`. In **one** transaction it:
   - verifies the issue exists in the same organisation and is in a confirmable state;
   - writes the `correction` row through `DATA-07`'s repository with its target, category, reason and
     issue linkage;
   - writes the issue's terminal status;
   - enqueues the impact-analysis job (Deliverable 6) through `DATA-05`'s job repository **and** the
     outbox event, in the same transaction (PRD §35.8 invariant 6).
   Route flags: `idempotent: true`, `requiresPiiAdmission: true` (the reason is free text; sub-PRD
   **D10**), `admission: 'internal'`, recent-MFA required (PRD §8.11, §38.2).
3. **Preserve the original, mechanically (obligation 2).** This ticket writes **nothing** to the
   corrected `answer_snapshot` row or any of its claims, citations or assumptions. It registers no
   `PUT`/`PATCH`/`DELETE` on any answer path, calls only `DATA-06`'s immutable repository (no
   `update`/`delete` member), and is additionally guarded by `DATA-06`'s `BEFORE UPDATE`/`BEFORE
   DELETE` triggers. The **only** representation of "this answer was corrected" is the `correction`
   row pointing **at** it (PRD §35.8 invariant 5: *"corrections append replacements"*; §35.6
   *"original answer preserved"*).
   - **`correction_state` on the snapshot (PRD §34.5) is therefore a derived read**, computed by the
     read path from the existence of a `correction` targeting that snapshot — **not** an in-place
     column write. `DATA-06`'s own ticket flags this exact tension (*"The only permitted mutation on a
     snapshot is `correction_state`, and only if it is modelled as an append elsewhere"*). Modelling
     it as a derived read is the append-only resolution; if `DATA-07`/`DATA-06` require an actual
     column write, that is an `01-app-data` writeback (Feedback obligation), not a local trigger
     relaxation.
4. **Link the replacement (obligation 3).** Two modes, both leaving the original untouched:
   - `mode: 'RERUN'` — enqueue `RCRD-03`'s rerun for the corrected snapshot's record and, on
     completion, record the produced snapshot id as the correction's `replacement_answer_snapshot_id`.
     The rerun itself is `RCRD-03`'s handler; this ticket triggers and links, never synthesises.
   - `mode: 'LINK'` — link an existing snapshot supplied by the operator, validated to belong to the
     same organisation and the same record; a foreign or absent id returns the identical
     `404 RESOURCE_NOT_FOUND` (PRD §16.5).
   The replacement link is written on the **correction** row (PRD §35.6 *"replacement and impact
   linkage"*), never on the original snapshot.
5. **`GET /v1/corrections/{correctionId}` and `GET /v1/corrections`** — tenant-scoped reads under the
   `tenant` profile so a customer can see that their answer was corrected and why (PRD §41.1 requires
   correction IDs to be copyable; `RCRD-08`'s badge and `19-exports`' banner both need this).
   Cursor-paginated per §34.1, filterable by `record_id`, `answer_snapshot_id`, `status` and
   `category`. Another organisation's correction id is indistinguishable from an absent one.
6. **`apps/worker/src/handlers/correction/index.ts` — impact analysis (obligation 4).** A conforming
   `JobHandlerModule` (`RUNT-04` contract item 2) with `queue: 'maintenance'` (PRD §39.5 *"cleanup,
   **impact matching**, usage reconciliation"*, priority 4, cooperative and bounded) and explicit
   per-stage `idempotent` flags. Stages:
   1. **Resolve the impact set.** Starting from the correction's target, find every Answer Snapshot in
      the organisation that **materially depends** on it, and thence every record owning one. The
      dependency rule is explicit and bounded: a snapshot is affected when it contains a
      `claim_citation` whose `(document_version_id, node_version_id)` matches a `SOURCE`-level target,
      or when it **is** the corrected snapshot (`ANSWER_SNAPSHOT` target), or when it contains the
      targeted `answer_claim` / `claim_citation` id. Nothing broader: PRD §33.4 says *"materially
      affected"*, and an over-broad rule would mark whole workspaces `REVIEW_REQUIRED` and destroy the
      signal.
   2. **Mark each affected record `REVIEW_REQUIRED`**, one transaction per record, through
      `DATA-06.applyReviewAction(tx, ctx, { recordId, fromStatus: <current>, toStatus:
      'REVIEW_REQUIRED', actorId: system, reason: <names the correction id> })` — writing the
      `review_action` row and the status change together (PRD §35.8 invariant 7; §32.6's *"correction
      … reason required"*). Records already in `REVIEW_REQUIRED` and records in `ARCHIVED` are skipped
      (PRD §32.6 permits the transition only from an **active** state), and the skip is recorded in
      the job result rather than silently dropped.
   3. **Write the notification outbox event** for each affected record **in the same transaction as
      that record's marking** (PRD §35.8 invariant 6; §33.4 step 8 *"Outbox delivers … idempotently"*).
      The payload carries ids only — correction id, record id, answer snapshot id, category — never
      the question, answer or source text (PRD §34.8: *"Full questions, facts, answers and source
      excerpts are excluded by default"*).
   4. **Record the outcome** on the correction: counts of scanned, affected, marked and skipped, plus
      the job id, so the internal console (`INTL-08`) can show what impact analysis actually did.
   Bounded by construction: the scan is chunked with a checkpoint at each chunk boundary
   (`RUNT-04` deliverable 7), yields between stages (PRD §39.5), and re-authorises tenant and actor
   before each stage (PRD §18.5 step 3).
7. **Idempotency of the whole flow.** At-least-once redelivery of the impact-analysis job must not
   produce duplicate `review_action` rows or duplicate outbox events. Each record's marking is
   guarded by the `fromStatus` compare-and-swap (a record already `REVIEW_REQUIRED` is skipped) and
   each outbox event carries a deterministic idempotency key derived from
   `(correction_id, record_id, channel-agnostic event type)` so `16-monitor-alerts`' delivery
   de-duplicates (PRD §8.8 *"idempotent event IDs"*; §35.6 `alert_delivery` *"idempotent (alert,
   channel, destination)"*).
8. **Never regenerate on read.** A corrected answer is still displayed and exported as it was written:
   PRD §8.9 — *"Exports … MUST NOT regenerate the answer using current law"* — and `UAT-EXP-01`
   requires the export to show *"original legal date/release and correction banner"*. This ticket
   introduces no code path that re-renders or re-synthesises a corrected snapshot.
9. **Permission, identity and audit.** Create/confirm requires internal identity **and** recent MFA
   (`AUTC-02`'s callable assertion via `RUNT-02`'s `internal` profile), and every activation records
   actor, reason, target and time in an immutable audit record (PRD §8.11; §12.4's requirement that
   operator actions *"cannot bypass audit"*; §20.4's recent-MFA discipline). Reads require tenant
   membership. Audit payloads carry ids, categories and counts — never the reason text, the answer or
   any source excerpt (PRD §22; §35.6).
10. **Test fixtures** — `apps/api/test/records/corrections/fixtures/` and
    `apps/worker/test/records/correction/fixtures/`: `confirmed-issue.json`,
    `corrected-snapshot.json` (a §34.5-shaped snapshot with claims and citations),
    `impact-graph.json` (three records — one directly affected, one affected through a shared cited
    node version, one unaffected — plus one archived record that must be skipped), and
    `expected-impact-result.json`. All synthetic; nothing is read from `evals/gold/**` (PRD §45.1
    item 6; plan R9).

## Acceptance checklist (classified)

- [ ] `[machine]` **COR-002 obligation 2 — preserve the original:** hash the corrected
      `answer_snapshot` row and every claim/citation/assumption row before the correction; run
      create + impact analysis to completion; assert the hash is **identical** afterwards (PRD §12.3
      *"preserve the original answer"*; §35.8 invariant 5; §30.2 COR-002)
- [ ] `[machine]` This ticket registers **no** `PUT`/`PATCH`/`DELETE` on any answer path; the snapshot
      repository it imports exposes no `update`/`delete` (`@ts-expect-error` compile assertion); a raw
      `UPDATE`/`DELETE` on `answer_snapshot` aborts via `DATA-06`'s trigger (PRD §35.8 invariant 5)
- [ ] `[machine]` `correction_state` (PRD §34.5) is **derived** from the existence of a `correction`,
      not written in place — a source scan asserts no write to that column from this ticket
      (Deliverable 3; `DATA-06` deliverable 3's stated tension)
- [ ] `[machine]` **COR-002 obligation 1 — create:** confirming an issue writes exactly one
      `correction` row carrying target, category, reason and issue linkage, and sets the issue's
      terminal status, **in one transaction**; a forced failure leaves neither (PRD §12.3; §35.6)
- [ ] `[machine]` **COR-002 obligation 3 — link the replacement:** `mode: 'RERUN'` triggers `RCRD-03`'s
      rerun and records the produced snapshot id on the correction; `mode: 'LINK'` links an existing
      snapshot; in both cases the **original** snapshot is unchanged and the link lives on the
      correction row (PRD §12.3 *"create or link a replacement Answer Snapshot"*; §35.6)
- [ ] `[machine]` A replacement snapshot in another organisation or on another record is rejected with
      the byte-identical `404 RESOURCE_NOT_FOUND` as an absent id (PRD §16.5)
- [ ] `[fixture]` **COR-002 obligation 4 — impact analysis:** `impact-graph.json` replays and produces
      `expected-impact-result.json` — the directly-targeted record and the record sharing the cited
      node version are marked `REVIEW_REQUIRED`; the unaffected record is untouched; the `ARCHIVED`
      record is **skipped and reported**, not force-transitioned (PRD §33.4 step 7 *"materially
      affected"*; §32.6's *"Any active state"* row)
- [ ] `[machine]` Each marking writes the `review_action` row and the status change **in one
      transaction** with `actor = system` and a reason **naming the correction id**; a forced failure
      leaves neither (PRD §35.8 invariant 7; §32.6 *"reason required"*)
- [ ] `[machine]` **Invariant 6:** the notification outbox event and that record's marking commit
      together — a forced failure after the marking leaves **no** outbox event and **no** marking
      (PRD §35.8 invariant 6; §33.4 step 8)
- [ ] `[machine]` The outbox payload carries **ids and category only** — a canary planted in the
      question, the short answer and a citation quote appears in no outbox event (PRD §34.8 *"Full
      questions, facts, answers and source excerpts are excluded by default"*; §22)
- [ ] `[machine]` **Idempotency under at-least-once:** replaying the impact-analysis job produces no
      duplicate `review_action` row and no duplicate outbox event; the deterministic idempotency key
      is `(correction_id, record_id, event type)` (PRD §8.8; §18.5; §39.5)
- [ ] `[machine]` **Concurrency (`E24` exit evidence):** two impact-analysis jobs for the same
      correction running simultaneously mark each record exactly once, with exactly one
      `review_action` row and one outbox event per record; repeated 25 times (PRD §44.2 `E24` *"REC
      and concurrency tests"*)
- [ ] `[machine]` The handler registers under `queue: 'maintenance'` and boot fails if the class is
      outside the frozen five; the scan is chunked with a checkpoint per chunk and yields between
      stages (PRD §39.5; `RUNT-04` contract items 3 and 5)
- [ ] `[machine]` The impact rule is **bounded**: a snapshot that merely belongs to the same
      organisation, or cites a *different* node version of the same document, is **not** marked —
      asserted with a deliberate near-miss fixture (PRD §33.4 *"materially affected"*)
- [ ] `[machine]` **Internal identity + recent MFA** are required for create/confirm: a customer
      session, a service-account credential and a widget token are each refused, and a stale recent-auth
      returns `403 RECENT_AUTH_REQUIRED` (PRD §8.11; §38.2; §34.9; sub-PRD **D9**)
- [ ] `[machine]` **Tenant isolation (PRD §21.2 / SEC-001):** reads, links and the **queued
      impact-analysis job** are all tenant-scoped — a job whose payload names another organisation's
      snapshot is refused at re-authorisation without executing a stage, and no record in another
      organisation is ever marked (PRD §21.2 *"queued-job tenant attacks"*; `UAT-AUTH-03`)
- [ ] `[machine]` `requiresPiiAdmission: true` on create: a reason containing a synthetic PII canary
      with the stub rejecting yields `422 EMPLOYEE_PII_DETECTED` without echoing the value, writes no
      correction, and leaves the canary absent from raw database bytes after
      `PRAGMA wal_checkpoint(TRUNCATE)` (PRD §10.1, §37.2, §37.3)
- [ ] `[machine]` No regeneration path: a source scan asserts this ticket contains no retrieval,
      model-gateway or renderer call, and that reading a corrected answer returns the stored snapshot
      unchanged (PRD §8.9 *"MUST NOT regenerate the answer using current law"*; `UAT-EXP-01`)
- [ ] `[machine]` No notification transport here: a source scan asserts no email, webhook or HTTP
      delivery call — only the outbox write (`16-monitor-alerts` owns delivery; PRD §8.8)
- [ ] `[machine]` **Audit:** create/confirm writes an immutable audit record with actor, internal
      identity, reason presence, target, correction id and `request_id`, and **no** reason text; the
      action cannot bypass audit (PRD §12.4; §22; §35.6)
- [ ] `[machine]` `CUSTOMER_REVIEWED` is not asserted or implied anywhere: a correction never moves a
      record **into** `CUSTOMER_REVIEWED`, and no string this ticket ships implies product-owner or
      legal verification — matching `RCRD-01`'s `customer-reviewed-copy.json` and failing on
      *verified*, *legal review*, *approved by*, *certified*, *compliant* (PRD §8.7; sub-PRD **D6**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration` green
      (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean; the correction paths are declared in
      `FND-04`'s OpenAPI (PRD §20.1; **QR-5**)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**COR-002**, **COR-001**,
      `UAT-EXP-01` precondition, `UAT-AUTH-03`, `E24-RECORDS`), user-visible change and non-goals,
      schema/API/event compatibility (additive `/v1` paths; **a new outbox event type consumed by
      `16-monitor-alerts` — name it and state its schema version**, PRD §16.1/§34.8), tenant/PII/
      security/retention impact (internal identity + recent MFA on create; reason encrypted; outbox
      carries ids only), source/licence impact (none), cost/memory/latency impact (a `RERUN`-mode
      correction consumes a generation credit through `RCRD-03` — state the ledger effect, PRD §24,
      §38.5), rollback path (revert; `INTL-08` consumes this ticket), known gaps (**QR-1** missing
      `DATA-07` edge, **QR-2** missing `FND-08`/`RCRD-04` edge, **QR-11** internal mount)
- [ ] No `[human]` criteria in this ticket — the operator console and its `[human]` acceptance are
      `22-internal-admin`/`INTL-08`; the customer-facing correction badge is `RCRD-08` and the export
      banner (`UAT-EXP-01`) is `19-exports` (PRD §41.2)
- [ ] No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected (PRD §45.3)

## Test plan

Reviewer steps. Everything offline: no network, no model provider, no live corpus. The rerun path is
exercised through `RCRD-03`'s handler against `15-answer-product`'s deterministic stub provider.

1. **Check the two plan-edge caveats first.** Confirm on the default branch that (a) `DATA-07`'s
   `correction` repository exists (**QR-1**) and (b) `DATA-06.applyReviewAction` is reachable and
   accepts a `system` actor (**QR-2**). If either is false, the correct outcome is a **bounce with a
   writeback**, not a locally created table or a silent `packages/domain` import.
2. `pnpm typecheck && pnpm lint`; `pnpm test --filter <apps/api>` and `--filter <apps/worker>`; suites
   under `apps/api/test/records/corrections/` and `apps/worker/test/records/correction/`.
3. **Harness.** API: Fastify `inject()` per `apps/api/test/route-area-conformance.ts` (`RUNT-01`) with
   `RUNT-02`'s internal-identity and recent-MFA test principals. Worker:
   `apps/worker/test/handler-area-conformance.ts` (`RUNT-04` deliverable 12). Database:
   `withTempDatabase` (`DATA-01`) seeded from `impact-graph.json` in **two** organisations.
4. **`preserve-original.test.ts`** — canonical-serialise and hash the corrected snapshot plus all
   child rows; run create + impact analysis; hash again; assert equality and unchanged child row
   counts. Then the immutability matrix: method × path, the `@ts-expect-error` repository assertion,
   and the raw-statement trigger abort (copy from `packages/database/test/research/**`, `DATA-06` test
   plan step 4).
5. **`create.test.ts`** — confirm an issue from `confirmed-issue.json`; assert one `correction` row,
   the issue's terminal status, the enqueued job and the outbox event, all in one transaction; force a
   failure after the correction insert and assert nothing persists.
6. **`replacement.test.ts`** — `mode: 'RERUN'`: assert `RCRD-03`'s rerun runs, a new `answer_version`
   appears, and the correction records that snapshot id. `mode: 'LINK'`: link an existing snapshot;
   then attempt a foreign-organisation and a wrong-record snapshot and assert identical `404`s. In all
   cases re-hash the original and assert it is unchanged.
7. **`impact.test.ts`** — replay `impact-graph.json`; compare the job result to
   `expected-impact-result.json`. Assert the near-miss record (different node version of the same
   document) is **not** marked, and the `ARCHIVED` record is skipped **and reported**.
8. **`transactional.test.ts`** — inject a failure between the record marking and the outbox insert;
   assert neither persists for that record and that previously-processed records are unaffected
   (per-record transactions).
9. **`idempotency.test.ts`** — replay the same job lease (the pattern `RUNT-04`'s
   `checkpoint-resume.test.ts` establishes); assert no duplicate `review_action` and no duplicate
   outbox event; assert the idempotency key is derived, not random.
10. **`concurrency.test.ts`** — two worker threads running impact analysis for the same correction,
    released with a barrier; assert exactly one marking and one outbox event per record; repeat 25
    times.
11. **`internal-identity.test.ts`** — attempt create/confirm as a customer session, a service account
    and a widget token: each refused. With internal identity but stale recent-auth: `403
    RECENT_AUTH_REQUIRED`. With internal identity and fresh MFA: success, and an immutable audit
    record exists.
12. **`tenant-isolation.test.ts`** — reads and links against organisation B's ids; then the queued-job
    attack: enqueue an impact-analysis job whose payload names B's snapshot and assert refusal at
    re-authorisation with no stage executed and B's records unchanged.
13. **`pii.test.ts`** — canary reason with the stub rejecting; assert `422`, no echo, no correction
    row, canary absent from raw database bytes after checkpoint.
14. **`no-transport.test.ts` / `no-regeneration.test.ts`** — source scans asserting no email/webhook/
    HTTP delivery call and no retrieval/model-gateway/renderer call in this ticket's files.
15. **`audit.test.ts`** — canary reason; assert audit records carry ids and counts only.
16. **Contract check** — `pnpm generate && pnpm generated:check`; confirm the new outbox event type is
    declared in `schemas/events/**` (`FND-05`) or raise the writeback.
17. **Source review** — grep the diff for any write to an `answer_snapshot` column (including
    `correction_state`), any `packages/domain/src/workflow` import (**QR-2** — must be absent), any
    table or migration, and any notification transport; all must be absent.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** and
`docs/prd/17-records-collab/README.md` (version +0.1 + changelog line) **before** changing code, then
`publish-tickets.mjs --sync`. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`DATA-07`'s `correction` repository is absent or lacks the replacement/impact linkage**
  (**QR-1**). → **Stop.** Do not create the table or migration (plan **A3**, **R4**, PRD §45.2/§44.3).
  Write back to `docs/prd/breakdown-plan.md` §5.18 + §6.2 (adding `DATA-07 → RCRD-07`),
  `docs/prd/01-app-data/README.md` and `docs/prd/17-records-collab/README.md` **QR-1**, then proceed.
- **Marking `REVIEW_REQUIRED` genuinely needs `FND-08`'s legality check** (**QR-2**) — for example
  because a record is in a state from which §32.6 forbids the transition and this ticket cannot tell.
  → Do **not** import `packages/domain/src/workflow` or `RCRD-04`'s service without the edge. Write
  back to `docs/prd/breakdown-plan.md` §5.18 + §6.2 (adding `FND-08 → RCRD-07`, mirroring the existing
  `FND-08 --> WTCH-03 & RCRD-04` line) and to this README, then re-publish and add the import.
- **`correction_state` must actually be written on the snapshot** rather than derived (Deliverable 3).
  → PRD §35.8 invariant 5 says corrections **append replacements**, and `DATA-06`'s own feedback
  obligation names this case: *"Do not relax the trigger first. Record the exact column, the PRD
  citation and the agreed mechanism in `docs/prd/01-app-data/README.md`, coordinate with `DATA-07`
  and `INTL-08`, and only then change the trigger set."* Follow that path; never relax a trigger from
  here.
- **The impact rule is too narrow or too broad in practice.** → It is a *product* judgement about what
  "materially affected" means (PRD §33.4). Record the measured behaviour and the proposed rule in
  `docs/prd/17-records-collab/README.md` open questions with the **Founder** as owner, and coordinate
  with `16-monitor-alerts` (whose `WTCH-03` performs the analogous marking for source changes) so the
  two rules do not diverge. Do not widen it silently — an over-broad rule marks whole workspaces
  `REVIEW_REQUIRED` and destroys the signal.
- **Notification needs more than an outbox event** (a channel, a template, a digest rule). → That is
  `16-monitor-alerts` (`WTCH-04`/`WTCH-05`/`WTCH-06`) and this module has no edge to it. Write the
  requirement into `docs/prd/17-records-collab/README.md` and
  `docs/prd/16-monitor-alerts/README.md` and add the plan edge before implementing; never send mail or
  call a webhook from this handler.
- **The new outbox event type is not declared in `schemas/events/**`** (`FND-05`, serial-owned). →
  Raise a `00-foundation` docs PR; PRD §16.1 requires webhooks to carry their own schema version and
  PRD §20.1 forbids hand-editing generated bindings. Record it in this README's **QR-5**.
- **`INTL-08` wants the create/confirm route under `/internal/v1`** (**QR-11**). → The *file* stays
  `apps/api/src/routes/corrections/**` (plan §4); only the mounted URL and profile move. Agree it in
  one docs PR across this ticket and `INTL-08`, `--sync` both, then change `area.prefix`. Do not write
  `apps/api/src/routes/internal/**`.

**3. Escalation.** Three escalation classes, all non-negotiable:

- Anything that would **mutate the corrected Answer Snapshot** — an in-place `correction_state` write,
  a `superseded_by` column, a redaction, a trigger exemption — overturns PRD §12.3 (*"preserve the
  original answer"*), PRD §35.8 invariant 5 and requirement **COR-002**, and breaks `UAT-EXP-01`.
  Stop and escalate through the PRD §45.5 product-change path; never soften immutability inside this
  ticket.
- Anything that would let the record marking and the outbox event commit **separately** overturns
  PRD §35.8 invariant 6 and makes notification loss silent. Escalate rather than splitting the
  transaction for throughput.
- Anything that would let a correction be created **without internal identity, recent MFA, a reason
  and an audit record** overturns PRD §8.11 and §12.4's rule that operator actions *"cannot bypass
  audit"*. Escalate; never relax it for convenience.
