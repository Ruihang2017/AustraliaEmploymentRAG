---
id: WTCH-03
title: Alert creation, impact marking and alert routes
module: 16-monitor-alerts
lane: 16-monitor-alerts
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [WTCH-02, FND-08]
blocks: [WTCH-04, WTCH-05, WTCH-08]
---

# WTCH-03 — Alert creation, impact marking and alert routes

Implements PRD §8.8, §32.7 and §33.4, requirement **MON-003** (epic `E25-MONITOR`).
No ADR — the decision is already made in PRD §33.4 step 7 (*"Transaction creates tenant alerts and
marks materially affected records `REVIEW_REQUIRED`"*) and PRD §32.7 (the alert-detail field list);
this is build ticket 3 of 8 against it.
Parent sub-PRD: [16-monitor-alerts README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [WTCH-02 — Detected-change matcher and single-crawl fan-out](WTCH-02-detected-change-matcher-and-single-crawl-fan-out.md), [FND-08 — Domain: record workflow state machine and ETag rules](../../00-foundation/tickets/FND-08-domain-record-workflow-state-machine-and-etag-rules.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §32.7 fixes the alert fields and `FND-08` already owns the transition machine; this wires them
into one transaction and one route area.

## Background + basis

**PRD §33.4 step 7, verbatim — the transaction boundary:**

> 7. Transaction creates tenant alerts and marks materially affected records `REVIEW_REQUIRED`.
> 8. Outbox delivers in-app/email/webhook idempotently.
> 9. Customer can rerun; the original answer remains unchanged.

**PRD §32.7 — the alert-detail contract, verbatim:**

> A watchlist has name, targets, event types, jurisdictions, severity threshold, delivery mode
> (`IMMEDIATE` or `DAILY_DIGEST`), channels and active state. **Alert detail shows
> detection/publication/effective dates, structured change type, before and after authorities,
> affected records, delivery status and actions. Raw HTML diffs never become customer alerts.**

**PRD §16.2 — the endpoints this ticket owns:**

> - `GET /v1/alerts`, alert detail, acknowledge and resolve

**Requirement `MON-003`** (PRD §30.2), verbatim:

> | MON-003 | Alerts identify change type, dates, before/after sources and affected records |
> `/monitor/alerts/:alertId` | alerts endpoints | App/Source | **Alert remains useful with generated
> summary disabled** |

That last column is why this module never calls a model (sub-PRD **D6**): the alert must be complete
from structured data alone.

**PRD §8.8 — the channels and the payload limit:**

> Channels:
>
> - in-app;
> - email;
> - signed webhook.
>
> … **Payloads MUST avoid complete customer questions/answers by default.**

**The transition machine is already built.** `FND-08` (merged before this ticket) owns
`packages/domain/src/workflow/**` and expands PRD §32.6's wildcard row into closed pairs. The rows
this ticket uses, quoted from `FND-08`:

> `{DRAFT, IN_REVIEW, CUSTOMER_REVIEWED} → REVIEW_REQUIRED` — actors `system`, `admin`, `reviewer`;
> conditions `MATERIAL_TRIGGER` (correction, source change or material issue), `REASON_REQUIRED`

and, from the same ticket's exhaustive expansion, `REVIEW_REQUIRED → REVIEW_REQUIRED` is **excluded**
(self-transition) and `ARCHIVED → REVIEW_REQUIRED` is **not** a permitted pair. So an already-flagged
record gains another alert link but no transition, and an archived record is never re-opened by a
source change. `FND-08` also states the caveat from its own Background:

> The system-triggered `REVIEW_REQUIRED` path from a source change is `16-monitor-alerts`/`WTCH-03`,
> also `blocked_by` this ticket.

**The persistence contract already exists (`DATA-07` deliverable 6):**

> **Alerts and delivery idempotency (MON-004).** `alert` links tenant + watchlist + change + affected
> record + status. `alert_delivery` records channel, destination, attempt, provider status, with
> `UNIQUE (alert_id, channel, destination)` (PRD §35.6 "idempotent `(alert, channel, destination)`").
> `recordAttempt` is append-only per attempt with a bounded attempt counter and a dead-letter
> terminal state.

**The upstream contract already exists.** `WTCH-02` (merged before this ticket, sub-PRD **D4**) writes
one global `detected_change` row per change and, in the same transaction, one internal
`outbox_event` of type `monitor.change_matched` per matched `(organization_id, watchlist_id,
detected_change_id)`, carrying identifiers only:
`{ detected_change_id, watchlist_id, change_type, effective_date, severity }`.

**Ephemeral work never produces alerts (PRD §10.4):** *"Durable audit/export/review/version
comparison/change alerts require `SAVE` mode."* Only `SAVE`-retention records and snapshots
participate in impact marking.

**Kill-switch behaviour (PRD §42.5):**

> | Webhooks | Alerts remain in-app/queued | Stop delivery; retry after recovery without duplicates |

Alert *creation* therefore continues while the webhook switch is active; only delivery pauses. That
separation is why creation (this ticket) and delivery (`WTCH-04`/`WTCH-05`/`WTCH-06`) are different
tickets.

**Registration contracts.** `RUNT-01`'s A1 route contract (one directory = one area, default export,
default prefix `/v1/<area-id>`, own encapsulation context, zero diff outside the directory) and
`RUNT-04`'s A1 worker contract (immediate children of `handlers/` are areas; `index.ts` default-
exports a `JobHandlerModule`; handlers declare `type`, `queue` and ordered `{name, idempotent}`
stages; boot fails loudly on a malformed area) are both normative here. PRD §39.5 puts email, webhook
and digest in the `notifications` queue class with *"2 independent leases"* that *"does not consume
research slot"*.

**Why this ticket owns the `notifications` area shell (sub-PRD D2).** `RUNT-04`'s contract makes
`apps/worker/src/handlers/notifications/` a **single** handler area, but breakdown-plan §5.17 splits
its contents across three tickets (`WTCH-04` email, `WTCH-05` webhook, `WTCH-06` digest), two of
which (`WTCH-04`, `WTCH-05`) may run as concurrent lanes. Something must own the area's `index.ts`,
and it must be a ticket that is strictly earlier in the DAG than all three. `WTCH-03` is that ticket
(breakdown-plan §6.2: `WTCH-03 --> WTCH-04 & WTCH-05`, and `WTCH-04 --> WTCH-06`). It therefore ships
the area entry plus a channel sub-registry so each channel registers by dropping in one directory.

**Accepted caveats carried forward:**

- **No `blocked_by` edge to `DATA-06`** (research and evidence tables) exists in breakdown-plan
  §5.17, yet impact marking reads answer citations and writes record workflow state. This is sub-PRD
  open question **Q-WTCH-3**. If `DATA-06` is not merged when this ticket executes, **stop and raise
  the missing edge** (Feedback obligation 3); never stub the research repository and never duplicate
  a research query.
- **No generated summary, ever** (sub-PRD **D6**). The `alert` DTO may carry an optional
  `generated_summary` field for forward compatibility, but this module never populates it and every
  screen and payload must be complete without it (`MON-003`).
- **Delivery is not this ticket.** This ticket writes the `IN_APP` delivery row and enqueues the
  channel jobs; the transports are `WTCH-04`/`WTCH-05`/`WTCH-06`.

## Goal

Produce three things that together satisfy PRD §33.4 step 7 and `MON-003`: (1) the
`apps/worker/src/handlers/alerts/**` handler area that consumes `WTCH-02`'s `monitor.change_matched`
outbox events and, **in one transaction per matched watchlist**, creates the tenant `alert`, its
`IN_APP` `alert_delivery` row, the affected-record links and the `REVIEW_REQUIRED` transitions
decided by `FND-08`, then enqueues the channel jobs the watchlist's `channels` and `delivery_mode`
select; (2) the `apps/api/src/routes/alerts/**` route area exposing list, detail, acknowledge and
resolve with the full PRD §32.7 detail payload built from structured data only; and (3) the
`notifications` handler-area shell and channel-registry contract that `WTCH-04`, `WTCH-05` and
`WTCH-06` plug into. Completion is mechanically checkable: one detected change with three matched
tenants yields three tenant-isolated alerts, exactly the permitted records transition, the alert
detail renders every PRD §32.7 field with no generated text, and an at-least-once redelivery of the
outbox event creates no second alert.

## Non-goals

- **No change detection, classification or matching** — `WTCH-02`, which is `blocked_by` nothing here
  and produces this ticket's input.
- **No email, webhook or digest transport** — `WTCH-04`, `WTCH-05`, `WTCH-06`. This ticket owns the
  `notifications` **area shell and channel contract** only (sub-PRD **D2**) and writes no channel
  directory.
- **No watchlist CRUD** — `WTCH-01`.
- **No screens** — `WTCH-08` (alerts list and detail), `WTCH-07` (watchlists); the record detail
  screen is `17-records-collab`/`RCRD-08`.
- **No tables, migrations or repositories** — `01-app-data`/`DATA-07` and `DATA-06`
  (breakdown-plan **A3**; PRD §45.2).
- **No workflow transition logic** — `00-foundation`/`FND-08` owns `canTransition`,
  `applyTransition`, the actor and condition predicates and the ETag rules. This ticket **calls**
  them and persists the result; PRD §45.2 forbids duplicated business rules in `apps/api`/
  `apps/worker`.
- **No review actions, comments, rerun, diff or corrections** — `17-records-collab` (`RCRD-03`,
  `RCRD-04`, `RCRD-07`). `REVIEW_REQUIRED` set here is the *system* trigger; the human path out of it
  is `RCRD-04`.
- **No generated summaries and no model-gateway call** — sub-PRD **D6**; `MON-003` requires the alert
  to be useful with generation disabled, and PRD §37.5 forbids generated text from triggering an
  external action.
- **No kill-switch implementation** — `01-app-data`/`DATA-07` stores switches and `22-internal-admin`
  /`INTL-09` operates them; this ticket only *reads* `activeSwitchesAt` before enqueuing delivery
  (PRD §42.5).
- **No enum members** — `FND-03` owns `AlertStatus`, `AlertChannel`, `ChangeType`, `Severity` and the
  `alt_` id prefix.

## File-scope (write-owns)

- `apps/worker/src/handlers/alerts/**` — the alert-creation handler area and its tests.
- `apps/api/src/routes/alerts/**` — the alert route area and its tests.
- `apps/worker/src/handlers/notifications/index.ts`,
  `apps/worker/src/handlers/notifications/registry.ts`,
  `apps/worker/src/handlers/notifications/channel-contract.ts`,
  `apps/worker/src/handlers/notifications/__tests__/registry.test.ts` — the area shell only
  (sub-PRD **D2**).

Does not touch:

- `apps/worker/src/handlers/notifications/{email,webhook,digest}/**` — `WTCH-04`, `WTCH-05`,
  `WTCH-06`. The shell discovers them; it names none of them in code.
- `apps/worker/src/handlers/change-matching/**` — `WTCH-02` (merged before this ticket).
- `apps/api/src/routes/{watchlists,webhook-subscriptions}/**` — `WTCH-01`, `WTCH-05`.
- `apps/web/**` — `WTCH-07`, `WTCH-08` and other modules.
- `apps/api/src/{server.ts,app.ts,bootstrap,plugins,middleware,errors,sse}/**`,
  `apps/worker/src/{main.ts,runtime,queues}/**`, `apps/worker/src/handlers/maintenance/**` —
  `03-app-runtime`.
- `packages/domain/**` (`FND-08`), `packages/database/**` (**A3**), `packages/contracts/**`,
  `packages/jobs/**`, `packages/ui/**`.
- `schemas/**`, `pipelines/**`, `infra/**`, `tests/**`, root manifests and lockfiles.

**Serial-safety analysis.** First decomposition — breakdown-plan §1 records `phase: 1`, nothing
merged and nothing in flight. `apps/worker/src/handlers/alerts/` and `apps/api/src/routes/alerts/`
do not exist before this ticket and are written by no other ticket in the plan (breakdown-plan §4
gives both trees to this module; §5.17 assigns `alerts` to `WTCH-03` alone). Under **A1** each route
and handler area is an independent directory with its own `index.ts`, so sibling areas
(`watchlists`, `webhook-subscriptions`, `change-matching`, `notifications/*`) share no file with
this one. The one deliberate exception is the `notifications` area shell: `RUNT-04`'s contract makes
that directory a single area, and sub-PRD **D2** assigns its three shell files to this ticket, which
is strictly earlier in the DAG than `WTCH-04`, `WTCH-05` and `WTCH-06` (breakdown-plan §6.2). Those
three then own only their own channel subdirectory, so they remain safe as concurrent lanes.
Intra-module round 2 pairs this ticket with `WTCH-07`, whose scope is `apps/web/**`.

## Deliverables

1. **`notifications` area shell (sub-PRD D2).**
   - `channel-contract.ts` exports
     `interface AlertChannelModule { channel: AlertChannel; jobType: JobType; stages: JobStage[];
     run(ctx: JobContext<AlertDeliveryPayload>, stage: string): Promise<StageResult>; }` and
     `interface AlertDeliveryPayload { alert_id: string; organization_id: string; channel:
     AlertChannel; destination: string; delivery_id: string; attempt_budget: number; }`.
   - `registry.ts` discovers channels by scanning the area's immediate subdirectories for
     `channel.ts` with a default export of `AlertChannelModule` — a **pattern, not a list**, so
     adding `email/`, `webhook/` or `digest/` diffs no file outside that directory. A subdirectory
     without a conforming `channel.ts`, a duplicate `channel` value or a `queue` outside PRD §39.5's
     classes **fails boot** with an error naming the directory (mirroring `RUNT-04` contract item 3;
     silent skip is forbidden).
   - `index.ts` default-exports the `JobHandlerModule` composed from the discovered channels, all
     with `queue: 'notifications'` (PRD §39.5).
   - The shell ships **no channel**: with no subdirectory present the area registers zero handlers
     and boots cleanly.
2. **Alert-creation handler area** `apps/worker/src/handlers/alerts/index.ts` — a
   `JobHandlerModule` with one handler, `type: 'ALERT_FANOUT'`, `queue: 'notifications'`
   (PRD §39.5: alerts and their delivery are notification work and must not consume a research
   slot), stages:
   1. `LOAD` — `idempotent: true`: read the `monitor.change_matched` outbox payload, the
      `detected_change` row (through `systemContext`) and the watchlist (through the tenant context).
   2. `CREATE` — `idempotent: false`: the single transaction of deliverable 3.
   3. `ENQUEUE_DELIVERY` — `idempotent: true`: deliverable 6.
3. **The PRD §33.4 step 7 transaction.** In **one** transaction, scoped to the matched
   organisation's `TenantContext`:
   - insert the `alert` row linking tenant, watchlist, `detected_change`, status
     (`NEW`), severity and the classified change type;
   - insert its affected-record links (deliverable 4);
   - insert one `alert_delivery` row with `channel = 'IN_APP'`, `destination = <organization_id>` and
     a terminal `DELIVERED` status — sub-PRD **D5**: the alert row *is* the in-app delivery
     (PRD §8.8's first channel; PRD §42.5 *"Alerts remain in-app/queued"* when webhooks are off);
   - apply the `REVIEW_REQUIRED` transitions of deliverable 5;
   - append the audit rows through `DATA-07`'s `appendAuditEvent` (PRD §35.6, §22);
   - **idempotency**: the transaction is keyed by `(detected_change_id, watchlist_id)`; a second
     delivery of the same outbox event finds the existing alert and commits nothing new. At-least-once
     outbox delivery must yield exactly one alert (PRD §18.5's closing invariant, PRD §35.8
     invariant 6).
4. **Affected-record resolution.** A record is *affected* when one of its `SAVE`-retention answer
   snapshots cites a `node_version` whose node appears in the change's `changed_node_version_ids`, or
   cites a `document_version` of the changed document. Resolution reads `DATA-06`'s tenant-scoped
   citation repository (see **Q-WTCH-3**). The resulting `research_record_id` set is stored on the
   alert as links, bounded by a configured maximum (default 200, PRD §39.6 layer 1) with an overflow
   count so a very broad change cannot produce an unbounded row.
5. **Impact marking, decided by `FND-08` (PRD §33.4 step 7).** For each affected record:
   - call `canTransition({ from: record.workflow_status, to: 'REVIEW_REQUIRED', actor: 'system',
     conditions: { MATERIAL_TRIGGER: <the alert id and change type>, REASON_REQUIRED: <the reason
     string> } })`; on `ok`, call `applyTransition` and persist the returned `row_version + 1`, ETag,
     reason and trigger inside the same transaction as deliverable 3;
   - `ARCHIVED` records are **never** transitioned (`ARCHIVED → REVIEW_REQUIRED` is not among
     `FND-08`'s twelve permitted pairs) and records already in `REVIEW_REQUIRED` are **not**
     re-transitioned (self-transitions are excluded) — both still receive the alert link;
   - **materiality** is a declared, testable set: `AMENDMENT`, `COMMENCEMENT`, `RATE`, `REPLACEMENT`,
     `APPEAL` and `SOURCE_REMOVAL` mark records; `GUIDANCE` and `FRESHNESS` create the alert but
     transition nothing. This is an interpretation of PRD §33.4's word *"materially"*, is stated here
     rather than assumed, and is a writeback if falsified (Feedback obligation 2).
6. **Channel enqueue (`ENQUEUE_DELIVERY`).** For each channel in the watchlist's `channels` other
   than `IN_APP`, and honouring `delivery_mode`:
   - `IMMEDIATE` → enqueue the channel's job now, with `idempotency_fingerprint`
     `(channel_job_type, alert_id, destination)` so `DATA-05`'s unique job constraint prevents a
     duplicate;
   - `DAILY_DIGEST` → mark the alert `queued_for_digest` and enqueue nothing; `WTCH-06` collects it
     at the digest boundary;
   - before enqueuing, read `DATA-07`'s `activeSwitchesAt(now)`; when a `webhooks`-scoped kill switch
     is active the webhook job is **not** enqueued and the alert is left `queued`, to be enqueued
     after recovery **without duplicates** (PRD §42.5 row "Webhooks"). The in-app alert is unaffected.
   The enqueue names channels **by value from the registry**, never by importing a channel module —
   so this ticket does not depend on `WTCH-04`/`WTCH-05`/`WTCH-06` existing.
7. **Alert route area** `apps/api/src/routes/alerts/index.ts` — default-exported Fastify plugin,
   `export const area = { admission: 'tenant' }`, derived prefix `/v1/alerts` (`RUNT-01` contract
   item 4):
   - `GET /v1/alerts` — cursor list (`page_size` 1–100, default 25, opaque `next_cursor`); filters
     `status`, `change_type`, `severity`, `watchlist_id`, `since`; requires `monitor:read`.
   - `GET /v1/alerts/{alert_id}` — the PRD §32.7 detail payload (deliverable 8); `ETag`.
   - `POST /v1/alerts/{alert_id}/acknowledge` — requires `monitor:write` and `If-Match`; records
     actor and time; idempotent (acknowledging twice is a no-op returning the same state).
   - `POST /v1/alerts/{alert_id}/resolve` — same rules; a resolve on an unacknowledged alert is
     permitted and recorded.
   Other-tenant and absent ids return the identical `404 RESOURCE_NOT_FOUND` (PRD §16.5, §34.9).
8. **Alert detail DTO — every PRD §32.7 field, from structured data only:**
   `id` (`alt_`), `status`, `severity`, `change_type` (one of the eight PRD §8.8 types),
   `detected_at`, `publication_date`, `effective_date`, `watchlist` (`{id, name}`),
   `before_authority` and `after_authority` (each `{document_id, document_version_id, node_ids[],
   title, jurisdiction, official_url}` — identifiers and metadata, **never source text**),
   `affected_records[]` (`{research_record_id, workflow_status, transitioned: boolean}`),
   `affected_record_overflow_count`, `deliveries[]` (`{channel, destination_label, status, attempts,
   last_attempt_at, failure_code?}` — the "delivery status" §32.7 requires), `actions[]` (the
   permitted next actions: acknowledge, resolve, open record, rerun link), `acknowledged_by/at`,
   `resolved_by/at`, `row_version`, and an **optional, always-absent** `generated_summary`
   (sub-PRD **D6**). `destination_label` is a masked form (for example `o••••@example.com`, or the
   subscription id and host for a webhook) — never a full secret and never a raw credential.
9. **No customer research content, by construction (PRD §8.8).** The alert row, the detail DTO and
   every log line carry identifiers, enum values, public source metadata and counts. A schema
   denylist test over this area's request/response schemas asserts no property named `question`,
   `facts`, `answer`, `short_answer`, `claim_text`, `quote`, `snippet`, `excerpt`, `content`,
   `prompt`, `reasoning`, `provider_payload` or `text` exists — the same list `FND-05` deliverable 2
   applies to events. Record **titles** are not included in the alert payload; the record is
   identified by id and rendered by the screen from the tenant's own record read.
10. **Observability** through `packages/observability` (`RUNT-07`), content-free:
    `alerts_created{change_type}`, `records_marked_review_required`, `records_skipped{reason}`,
    `alerts_queued_for_digest`, `delivery_jobs_enqueued{channel}`,
    `delivery_suppressed_by_kill_switch{scope}` (PRD §22).
11. **Committed fixtures** under `apps/worker/src/handlers/alerts/__tests__/fixtures/`:
    `matched-change.json` (a `monitor.change_matched` payload), `detected-change.json` (the global
    row it references) and `expected-alert-detail.json` (the PRD §32.7 detail payload a reviewer can
    diff against §32.7 by eye).

## Acceptance checklist (classified)

- [ ] `[fixture]` **`UAT-MON-01`, alert half**: replaying one `detected_change` matched to three
      organisations creates three alerts, one per tenant, each visible only to its own tenant, with
      the affected records marked exactly as deliverable 5 permits (PRD §41.2 `UAT-MON-01`;
      PRD §33.4 step 7; **MON-003**)
- [ ] `[fixture]` The alert detail response for the fixture equals `expected-alert-detail.json` and
      contains **every** PRD §32.7 field: detection/publication/effective dates, structured change
      type, before and after authorities, affected records, delivery status and actions
- [ ] `[machine]` **MON-003, useful without generation**: with no model gateway configured and
      `generated_summary` absent, the detail payload is complete and every field above is populated —
      asserted by a test that fails if any §32.7 field is empty (PRD §30.2 MON-003 evidence; sub-PRD
      **D6**)
- [ ] `[machine]` **One transaction (PRD §33.4 step 7)**: an induced failure while marking a record
      rolls back the alert, its `IN_APP` delivery row and the record links — the database is
      unchanged. Asserted for a failure injected at each of the three write points
      (PRD §35.8 invariant 6)
- [ ] `[machine]` **Idempotency under at-least-once delivery**: delivering the same
      `monitor.change_matched` outbox event twice creates exactly one alert, one `IN_APP` delivery
      row and one set of record transitions; `row_version` advances once (PRD §18.5 closing
      invariant)
- [ ] `[machine]` **`FND-08` transitions only**: a `DRAFT`, `IN_REVIEW` and `CUSTOMER_REVIEWED`
      record each transition to `REVIEW_REQUIRED` with actor `system` and a recorded reason; an
      `ARCHIVED` record and a record already in `REVIEW_REQUIRED` do **not** transition but still
      receive the alert link; no transition is applied without `canTransition` returning `ok`
      (PRD §32.6 via `FND-08`; `REC-004`)
- [ ] `[machine]` **Materiality set**: `GUIDANCE` and `FRESHNESS` alerts create no record transition;
      the other six types do — a parametrised test over all eight PRD §8.8 types (deliverable 5, an
      explicitly declared interpretation)
- [ ] `[machine]` `SAVE`-mode only: an answer snapshot in ephemeral retention mode never produces an
      affected-record link or a transition (PRD §10.4 *"change alerts require `SAVE` mode"*)
- [ ] `[machine]` **Tenant isolation**: a cross-tenant matrix over `GET /v1/alerts`,
      `GET /v1/alerts/{id}`, acknowledge and resolve returns `404 RESOURCE_NOT_FOUND` with the same
      body shape as an unknown id; organisation B's alert never appears in A's list (PRD §16.5,
      §21.2; `SEC-001`)
- [ ] `[machine]` Acknowledge/resolve: `If-Match` is required; a stale ETag returns
      `409 CONCURRENT_MODIFICATION`; acknowledging twice is a no-op with the same state (PRD §16.2,
      §34.1, §34.9)
- [ ] `[machine]` **Kill switch (PRD §42.5)**: with a `webhooks`-scoped switch active, the alert is
      still created and in-app delivered, the webhook job is **not** enqueued, and after the switch
      expires the job is enqueued exactly once — no duplicate (PRD §42.5 "Stop delivery; retry after
      recovery without duplicates")
- [ ] `[machine]` Delivery-mode routing: `IMMEDIATE` enqueues the channel job with the
      `(channel_job_type, alert_id, destination)` fingerprint; `DAILY_DIGEST` enqueues nothing and
      marks the alert for digest (PRD §32.7)
- [ ] `[machine]` **Channel registry (sub-PRD D2)**: with zero channel subdirectories the
      `notifications` area boots and registers zero handlers; with a throw-away channel directory
      added at test time it is discovered and executed with **zero** diff to any tracked file; a
      malformed channel directory, a duplicate `channel` value or a non-`notifications` queue fails
      boot with a named error (`RUNT-04` contract items 1–3, 6)
- [ ] `[machine]` **Payload minimisation (PRD §8.8)**: no alert row, detail payload, outbox payload
      or log line can carry a complete customer question or answer — the denylist test plus an
      assertion that no record **title** or answer text is copied into the alert (PRD §8.8, §22,
      §34.8)
- [ ] `[machine]` Bounded affected records: a change affecting 5,000 records stores the configured
      maximum plus an overflow count, and the transaction stays bounded (PRD §39.5
      "cooperative/bounded")
- [ ] `[machine]` A1 conformance: both new areas register by directory convention with **zero** diff
      outside their own directories (`git status --porcelain` clean after the suite), and no file
      owned by `03-app-runtime` is modified (`RUNT-01`/`RUNT-04` contract item 6)
- [ ] `[machine]` Architecture: no unscoped `packages/database` import; no transition logic
      duplicated outside `packages/domain` (a scan for a local state table or a hand-written
      transition switch) (PRD §45.2, `SEC-001`)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — `/v1/alerts` operations appear in
      the generated bindings with no hand-edit (PRD §20.1, §45.3)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3)
- [ ] `[human]` Gate 2 founder smoke test of `UAT-MON-01` end to end, with `WTCH-02` and `WTCH-08`.
      **Not required to merge** — the `[fixture]` half above is (PRD §41.2; CLAUDE.md Gate 2)
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable (PRD §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items: requirements **MON-003** (owned) and **MON-002**
      (consumed), `UAT-MON-01`, epic `E25-MONITOR`; user-visible change and non-goals; schema/API/
      event compatibility impact (new `/v1/alerts` operations, additive within `/v1`; no
      `schemas/events/**` change); tenant/PII/security impact (one transaction per tenant, scoped
      repositories, indistinguishable 404, no research content in alerts, masked delivery
      destinations); source/licence impact (before/after authorities are metadata and official links,
      never source text); cost/memory/latency impact (bounded affected-record set, no provider call);
      rollback path (revert both areas; `detected_change` rows remain and can be re-fanned);
      known gaps (**Q-WTCH-3** missing `DATA-06` edge; the materiality set is an interpretation)

## Test plan

Reviewer steps. Every step is offline and deterministic: injected clock, committed fixtures, no
network, no email provider, no webhook endpoint, no model provider.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter <the apps/worker package name>` and `--filter <the apps/api package name>`;
   suites under `apps/worker/src/handlers/alerts/__tests__/`,
   `apps/worker/src/handlers/notifications/__tests__/` and
   `apps/api/src/routes/alerts/__tests__/`.
3. **Harness.** Worker suites copy `RUNT-04`'s `checkpoint-resume.test.ts` construction (temp
   `app.sqlite` migrated by `DATA-01`, `packages/jobs` leases, fake clock); API suites copy
   `RUNT-02`'s injected-Fastify construction. Seed data through `DATA-04`, `DATA-06` and `DATA-07`
   factories plus `WTCH-02`'s fixtures.
4. **Read the fixture against the PRD.** Compare `expected-alert-detail.json` field by field with
   PRD §32.7's sentence — *"detection/publication/effective dates, structured change type, before and
   after authorities, affected records, delivery status and actions"*. A missing field here makes
   `MON-003` vacuous.
5. **Three-tenant replay.** Seed one `detected_change` and three matched watchlists; run; assert
   three alerts, three `IN_APP` delivery rows, correct per-tenant visibility, and that each tenant's
   `GET /v1/alerts` returns only its own.
6. **Transaction atomicity.** Inject a failure at each of the three write points and assert full
   rollback each time (row counts before/after).
7. **Idempotency.** Deliver the same outbox event twice (simulating at-least-once); assert one alert
   and one transition.
8. **Transition matrix.** Parametrise over the five `RecordWorkflowState` values as the record's
   starting state and over all eight change types; assert the permitted/ignored combinations of
   deliverable 5. Confirm the test calls `FND-08`'s `canTransition` rather than asserting against a
   locally written table.
9. **Ephemeral exclusion.** Seed an ephemeral-mode snapshot citing the changed node; assert no link
   and no transition (PRD §10.4).
10. **Kill switch.** Activate a `webhooks` switch through `DATA-07`; run; assert the alert exists,
    the webhook job does not, and after expiry a single job is enqueued.
11. **Channel registry.** Boot with no channel directory (zero handlers, clean boot); add a
    throw-away channel directory; assert discovery and execution; assert
    `git status --porcelain` is clean after removal. Then add a malformed one and assert boot fails
    naming the directory.
12. **Payload denylist.** Run the schema denylist test; on a scratch branch add an `answer` property
    to the alert DTO and confirm the test fails naming it; discard. Separately grep the alert-creation
    path for any read of a record `title` into the alert row — there must be none.
13. **Cross-tenant matrix, concurrency and pagination** on the route area, as in `WTCH-01`'s plan.
14. `pnpm generate && pnpm generated:check`; then `git status --porcelain` — clean.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket file** (docs PR →
merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/16-monitor-alerts/README.md` (version +0.1 with a changelog line) **before** changing code.
Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**Foreseeable frictions, each with its exact writeback target:**

1. **PRD §32.7's alert detail cannot be built from structured data alone** — for example "before and
   after authorities" appears to need rendered source text. → It does **not**: the payload carries
   identifiers, titles, jurisdictions and official links, and the screen (`WTCH-08`) renders exact
   source text through `packages/ui`'s evidence panel (breakdown-plan **A6**) from the corpus read
   APIs. If that is genuinely impossible, record it in
   `docs/prd/16-monitor-alerts/README.md` **D6** and escalate — **do not** embed a text or HTML diff
   in the alert. PRD §32.7 (*"Raw HTML diffs never become customer alerts"*) and PRD §8.8 forbid it,
   and a change type that cannot be structured is a **writeback**, not a local workaround: the path
   is `WTCH-02`'s `UNCLASSIFIED` handling plus a PRD change (PRD §45.5), never an unstructured
   payload here.
2. **The materiality set (deliverable 5) is wrong** — for example a `GUIDANCE` change genuinely
   invalidates a record. → Update deliverable 5 **in this ticket** and record it in
   `docs/prd/16-monitor-alerts/README.md`. Widening what marks a customer's record
   `REVIEW_REQUIRED` is customer-visible behaviour and needs founder approval per PRD §45.5 if it is
   not derivable from PRD §33.4's word "materially".
3. **`DATA-06` is not merged, so affected records cannot be resolved** (sub-PRD **Q-WTCH-3**). →
   Stop. Write the missing edge into **`docs/prd/breakdown-plan.md` §5.17 and §6.2** (`WTCH-03`
   `blocked_by` gains `DATA-06`) and update the README's Q-WTCH-3 row. Do **not** stub the citation
   repository, and do **not** create alerts with an empty affected-record set as if none existed —
   that would silently defeat PRD §33.4 step 7.
4. **`FND-08` rejects a transition this ticket needs** (for example a source change must re-open an
   `ARCHIVED` record). → `FND-08`'s twelve-pair expansion is the authority. Raise it against
   **`FND-08`'s Background table** and `docs/prd/00-foundation/README.md` first; PRD §32.6 is a
   customer-visible workflow contract. Never apply a transition without `canTransition` returning
   `ok`, and never write a local transition table in `apps/worker`.
5. **`DATA-07` cannot key the alert by `(detected_change_id, watchlist_id)`** for idempotency. →
   Raise a `01-app-data` ticket, add the edge in `docs/prd/breakdown-plan.md` §5.2/§6.2 and record it
   here. Do not write `packages/database/**` (breakdown-plan **A3**, risk **R4**) and do not
   de-duplicate in application memory, which fails across worker restarts.
6. **`RUNT-04`'s registry rejects a nested channel scan**, so the `notifications` shell cannot
   compose subdirectories (sub-PRD **D2**). → Record it in
   `docs/prd/16-monitor-alerts/README.md` **D2** and choose the ordered-write fallback: `WTCH-04`,
   `WTCH-05` and `WTCH-06` append to `notifications/index.ts` in DAG order and lose the ability to
   run as concurrent lanes; that changes the module's lane profile and therefore also
   `docs/prd/breakdown-plan.md` §7. Raise it there rather than silently serialising the module.
7. **The `notifications` queue class is the wrong home for `ALERT_FANOUT`** (it is arguably
   `maintenance`). → PRD §39.5 lists "impact matching" under `maintenance` and "email/webhook/digest"
   under `notifications`; alert creation is the hand-off between them. Record the measured choice in
   `docs/prd/16-monitor-alerts/README.md`; a change to the shipped default is a
   **benchmark-selected configuration** decision (PRD §45.5) needing evidence in the PR's
   cost/latency line, not a silent edit.

**Escalation.** PRD §33.4 step 7's single transaction and PRD §32.7's *"Raw HTML diffs never become
customer alerts"* are release requirements behind `MON-003`, and PRD §32.6's transition table is
behind `REC-004`. If any of the three is outright falsified, stop, raise an ADR under `docs/adr/`,
write back to `docs/prd/16-monitor-alerts/README.md` and `docs/prd/breakdown-plan.md` §5.17, and
escalate to the human before code lands. Never split the step-7 transaction and never mark a record
`REVIEW_REQUIRED` outside `FND-08`.
