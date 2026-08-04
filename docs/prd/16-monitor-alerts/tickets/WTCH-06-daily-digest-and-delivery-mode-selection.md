---
id: WTCH-06
title: Daily digest and delivery-mode selection
module: 16-monitor-alerts
lane: 16-monitor-alerts
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [WTCH-04]
blocks: []
---

# WTCH-06 — Daily digest and delivery-mode selection

Implements PRD §32.7 and §8.8, requirement **MON-004** (epic `E25-MONITOR`).
No ADR — the decision is already made in PRD §32.7 (*"delivery mode (`IMMEDIATE` or
`DAILY_DIGEST`)"*) and PRD §8.8 (the three channels and the payload limit); this is build ticket 6 of
8 against it. The digest **hour and timezone**, which no PRD section fixes, are a committed safe
default under PRD §39.6 and are sub-PRD open question **Q-WTCH-5**.
Parent sub-PRD: [16-monitor-alerts README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [WTCH-04 — Email delivery channel](WTCH-04-email-delivery-channel.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
the delivery mode, the channel contract, the transport port and the idempotency key all already
exist; this adds the batching pass.

## Background + basis

**PRD §32.7 — the delivery mode is a watchlist property, verbatim:**

> A watchlist has name, targets, event types, jurisdictions, severity threshold, **delivery mode
> (`IMMEDIATE` or `DAILY_DIGEST`)**, channels and active state.

**PRD §8.8 — the channels and the payload limit:**

> Channels:
>
> - in-app;
> - email;
> - signed webhook.
>
> … Payloads MUST avoid complete customer questions/answers by default.

**PRD §33.4 step 8:** *"Outbox delivers in-app/email/webhook idempotently."*

**PRD §39.5 — the queue class:** `notifications` — *"email/webhook/digest"*, *"2 independent
leases"*, *"bounded, does not consume research slot"*. The digest is named explicitly, so it is a
notification job, not a `maintenance` one.

**Requirement `MON-004`** (PRD §30.2): *"Email/webhook delivery is retryable and idempotent | Monitor
settings | webhook endpoints | App | Signature/replay/retry/dead-letter tests pass"*. The digest must
not create a second, weaker delivery path: it reuses the **same** `alert_delivery` idempotency key.

**The idempotency key is fixed by the schema.** PRD §35.6: `alert`/`alert_delivery` — *"idempotent
`(alert, channel, destination)`"*; `DATA-07` deliverable 6 implements
`UNIQUE (alert_id, channel, destination)`. **This is what makes the digest safe:** an alert already
delivered immediately by email cannot be re-sent in a digest, because the row already exists.

**Upstream contracts already exist.**
- `WTCH-03` deliverable 6 (merged before this ticket): for a `DAILY_DIGEST` watchlist it marks the
  alert `queued_for_digest` and enqueues **nothing**; for `IMMEDIATE` it enqueues the channel job
  directly. It also ships the `notifications` area shell and the `AlertChannelModule` contract
  (sub-PRD **D2**).
- `WTCH-04` (this ticket's blocker) ships the `EmailTransport` port, the `FileTransport`/
  `NullTransport` implementations, the recipient resolver, the retry/dead-letter schedule and the
  content-minimised renderer. **This ticket reuses all of them**; it does not re-implement a
  transport, a retry loop or a renderer.

**Digest mode and the webhook channel (sub-PRD D8).** PRD §34.8 specifies exactly one webhook event
type, `alert.created`, and `schemas/events/**` is `FND-05`'s serial-owned tree. So `DAILY_DIGEST`
batches the **delivery pass**, not the event contract: at the digest boundary the webhook channel is
enqueued once per alert, each carrying its own `alert.created` event with its own stable event id.
The email channel, by contrast, sends **one aggregate message**. Inventing an `alert.digest` event
would be an `FND-05` writeback, not a local schema (Feedback obligation 2).

**Timing.** No PRD section names a digest hour or timezone. PRD §39.6's configuration layers make the
committed safe default the right home: `08:00` in `Australia/Sydney`, the product's jurisdiction
(PRD §19.1 places the platform in Sydney and PRD §41.1 requires Australian date rendering). This is
sub-PRD **Q-WTCH-5**; a per-organisation setting would need a `DATA-07` column and founder approval
(PRD §45.5).

**Scheduling.** There is no cron in the architecture: PRD §18.1 forbids extra infrastructure
(*"Do not introduce Kubernetes, service mesh, Kafka, RabbitMQ, a Redis cluster, multiple service
databases or module-per-service deployment in the MVP"*) and `RUNT-04` provides lease loops, not a
scheduler. The digest therefore **self-reschedules** through the durable job table, keyed so that a
duplicate can never exist (deliverable 3).

**Accepted caveats carried forward:**

- **An empty digest sends nothing.** A "no changes today" email is noise and would consume the email
  budget; the run is recorded as skipped with a counter. Stated here because it is a product-visible
  choice, not an accident.
- **The digest never widens the payload.** It carries the same structured facts and links as
  `WTCH-04`'s single-alert message, grouped by watchlist — never a question, answer, claim, excerpt
  or record title (PRD §8.8).
- **In-app is never digested.** The alert row exists at creation time (sub-PRD **D5**), so the
  in-app channel is inherently immediate; `delivery_mode` governs email and webhook only.

## Goal

Produce `apps/worker/src/handlers/notifications/digest/**`: a self-rescheduling, `notifications`-class
digest job that, once per organisation per digest window, collects the alerts marked
`queued_for_digest`, sends **one** aggregate email per recipient through `WTCH-04`'s transport port
and renderer primitives, enqueues the webhook channel once per alert (preserving PRD §34.8's
per-alert `alert.created` contract), and records one `alert_delivery` row per `(alert, channel,
destination)` so nothing is ever delivered twice across the immediate and digest paths. Completion is
mechanically checkable: an alert delivered immediately is never included in a digest; a digest run
that crashes mid-way resumes without duplicating a message; an empty window sends nothing; and no
digest content carries a complete customer question or answer.

## Non-goals

- **No email transport, renderer primitives, recipient resolution or retry schedule** — `WTCH-04`
  (`notifications/email/**`), this ticket's blocker. This ticket **imports and composes** them; it
  re-implements none of them.
- **No webhook signing, subscription routes, egress guard or rotation** — `WTCH-05`
  (`notifications/webhook/**`). This ticket enqueues that channel's job; it never builds or signs an
  envelope.
- **No alert creation, impact marking or `queued_for_digest` marking** — `WTCH-03`.
- **No change matching** — `WTCH-02`.
- **No `notifications` area shell or channel registry** — `WTCH-03` (sub-PRD **D2**).
- **No screens or a digest-preview surface** — `WTCH-07`/`WTCH-08` own
  `apps/web/src/features/monitor/**`; a preview would be a new screen and a new PRD §31.2 route.
- **No tables, migrations or repositories** — `01-app-data`/`DATA-07` (breakdown-plan **A3**).
- **No scheduler, cron, timer service or external trigger** — PRD §18.1 forbids new infrastructure;
  `RUNT-04` owns the lease loops. The digest self-reschedules through the job table.
- **No per-organisation digest hour setting** — **Q-WTCH-5**; a customer-visible setting needs a
  `DATA-07` column, a `WTCH-01` DTO field and founder approval (PRD §45.5).
- **No new webhook event type** — sub-PRD **D8**; `FND-05` owns `schemas/events/**`.
- **No digest for the in-app channel** — sub-PRD **D5**.

## File-scope (write-owns)

- `apps/worker/src/handlers/notifications/digest/**` — `channel.ts` (the default-exported
  `AlertChannelModule` for the digest job), the window calculator, the collector, the aggregate
  renderer, fixtures and tests under
  `apps/worker/src/handlers/notifications/digest/__tests__/**`.

Does not touch:

- `apps/worker/src/handlers/notifications/{index.ts,registry.ts,channel-contract.ts}` — `WTCH-03`
  (sub-PRD **D2**; merged before this ticket).
- `apps/worker/src/handlers/notifications/{email,webhook}/**` — `WTCH-04` (merged before this
  ticket; imported, never edited) and `WTCH-05` (a sibling subtree this ticket only enqueues by job
  type).
- `apps/worker/src/handlers/{alerts,change-matching,maintenance}/**`,
  `apps/worker/src/{main.ts,runtime,queues}/**` — `WTCH-03`, `WTCH-02`, `RUNT-04`.
- `apps/api/**`, `apps/web/**` — other tickets in this module and other modules.
- `packages/database/**` (**A3**), `packages/contracts/**`, `packages/domain/**`,
  `packages/observability/**`, `packages/jobs/**`.
- `schemas/**`, `infra/**`, `tests/**`, root manifests and lockfiles.

**Serial-safety analysis.** First decomposition — breakdown-plan §1 records `phase: 1`, nothing
merged and nothing in flight. `apps/worker/src/handlers/notifications/digest/` does not exist before
this ticket and is written by no other ticket in the plan (breakdown-plan §5.17 gives `WTCH-06` this
subtree alone). The enclosing `notifications` directory is a single handler area under `RUNT-04`'s
contract; sub-PRD **D2** gives its shell to `WTCH-03`, strictly earlier in the DAG, and each channel
owns only its own subdirectory. This ticket is in intra-module round 4 and its only possible
concurrent sibling is `WTCH-08` (`apps/web/**`) — a different application. Adding this directory
produces zero diff outside it (`RUNT-04` contract item 6).

## Deliverables

1. **`channel.ts`** — default-exported `AlertChannelModule` with `channel: 'EMAIL'` in digest form,
   `jobType: 'ALERT_DIGEST'` (from `packages/contracts`; a missing member is a `00-foundation`
   writeback), `queue: 'notifications'` (PRD §39.5, which names "digest" in that class), stages:
   1. `COLLECT` — `idempotent: true`: resolve the window and gather the eligible alerts
      (deliverable 4).
   2. `SEND` — `idempotent: false`: the reserve → send → settle sequence of deliverable 5, reusing
      `WTCH-04`'s transport port.
   3. `ENQUEUE_WEBHOOKS` — `idempotent: true`: deliverable 6.
   4. `RESCHEDULE` — `idempotent: true`: deliverable 3's next-window enqueue.
2. **Window model** — `window.ts`: `digestWindow(now, config)` returns
   `{ organization_id, window_date, window_start, window_end }` where the boundary is the configured
   local hour in the configured IANA timezone (committed safe defaults `08:00`,
   `Australia/Sydney` — PRD §39.6 layer 1; **Q-WTCH-5**). The function is **pure** and takes the clock
   as an argument, so daylight-saving transitions are testable: a run on the day a transition occurs
   must still produce exactly one window (a 23-hour and a 25-hour day are both covered by a test).
3. **Self-rescheduling, duplicate-proof (no cron).** Each digest job carries
   `idempotency_fingerprint = ('ALERT_DIGEST', organization_id, window_date)`, so `DATA-05`'s unique
   job constraint makes a second enqueue for the same window return the original job (PRD §35.6
   `job`, PRD §18.5). Stage `RESCHEDULE` enqueues the next window's job before the job completes; a
   boot-time reconciliation in the same handler enqueues any missing window for an organisation with
   at least one active `DAILY_DIGEST` watchlist, so a cold start after downtime recovers without
   double-sending. **No timer, cron entry or external trigger is introduced** (PRD §18.1).
4. **Collection** — `collect.ts`: for the organisation and window, select alerts whose watchlist has
   `delivery_mode = 'DAILY_DIGEST'`, that are marked `queued_for_digest` by `WTCH-03`, whose
   `created_at` falls in the window, and that have **no** existing `alert_delivery` row for the
   target `(channel, destination)` pair. Results are grouped by watchlist and ordered by severity
   then effective date. The collection is bounded (default 500 alerts per digest, PRD §39.6 layer 1)
   with an explicit "and N more" count and a link to `/monitor/alerts` — an unbounded digest is both
   a memory and a readability failure (PRD §39.5 "bounded").
5. **One aggregate email per recipient, idempotently (MON-004).** Reusing `WTCH-04`'s recipient
   resolver, transport port and send sequence, in this order:
   1. **Reserve** — insert one `alert_delivery` row per `(alert_id, 'EMAIL', recipient_address)` in
      status `PENDING` for **every** alert in the digest, in one transaction, **before** the send.
      The `UNIQUE (alert_id, channel, destination)` constraint is what prevents an alert already
      delivered immediately from appearing in the digest, and prevents a re-run from sending twice
      (PRD §35.6). An alert whose row already exists is dropped from the message before rendering.
   2. **Render** — one message per recipient covering all reserved alerts, grouped by watchlist
      (deliverable 7).
   3. **Send** — through `WTCH-04`'s `EmailTransport` with `idempotencyKey = <digest run id +
      recipient>`.
   4. **Settle** — mark every reserved row `SENT` (or the failure code) in one statement, carrying the
      shared provider message id, through `DATA-07`'s append-only `recordAttempt`.
   Retry and dead-letter reuse `WTCH-04` deliverable 5's committed schedule and terminal state
   verbatim; a digest that dead-letters leaves its alerts' rows in `DEAD_LETTER` and does **not**
   silently re-queue them into the next window (that would produce a growing, repeating digest).
6. **Webhook channel at the digest boundary (sub-PRD D8)** — for each collected alert whose watchlist
   includes the `WEBHOOK` channel, enqueue `WTCH-05`'s delivery job with the same
   `(channel_job_type, alert_id, destination)` fingerprint `WTCH-03` uses, so each alert is delivered
   as its own PRD §34.8 `alert.created` event with its own stable event id. **This ticket builds no
   envelope, signs nothing and defines no event type.** The behaviour is stated in the file header
   with the reason: `schemas/events/**` is `FND-05`'s serial-owned tree and PRD §34.8 specifies only
   `alert.created`.
7. **Aggregate renderer** — `render.ts`, composed from `WTCH-04`'s primitives:
   - subject: `Daily law-change digest — <N> updates` (no customer content);
   - body grouped by watchlist name, each item carrying change type, effective/publication dates, the
     authority title and its **official URL**, and a deep link `/monitor/alerts/:alertId`; a per-group
     count; a total; the overflow line; the disclaimer and the settings pointer read from
     configuration (the copy is `24-launch`/`LNCH-01`);
   - **excluded by construction**: customer questions, facts, answer text, claim text, source
     excerpts and record titles. The same denylist test as the rest of the module runs over the
     template inputs and the rendered golden file (PRD §8.8, §22).
8. **Empty window** — when the collection is empty, **no message is sent**, no `alert_delivery` row
   is created, the run is recorded as `SKIPPED_EMPTY` with a counter, and the next window is still
   scheduled. Stated as behaviour, not an implementation detail, because it is customer-visible.
9. **Kill switch (PRD §42.5)** — an active `webhooks`-scoped switch suppresses only deliverable 6's
   enqueue (the email digest still sends); a `tenant/key`-scoped switch naming the organisation
   defers the whole run to the next lease without consuming a retry attempt and without recording a
   failure, so recovery produces no duplicate.
10. **Configuration** — `config.ts`: `digest_local_hour` (default 8), `digest_timezone` (default
    `Australia/Sydney`), `max_alerts_per_digest` (default 500), `reconcile_missing_windows` (default
    true). Validated at boot; unknown critical keys fail startup (PRD §39.6). Every value's default
    is annotated with **Q-WTCH-5** so nobody mistakes it for a PRD constant.
11. **Observability** (PRD §22, content-free): `digest_runs{result}`, `digest_alerts_included`,
    `digest_alerts_overflow`, `digest_recipients`, `digest_windows_reconciled`,
    `digest_webhook_jobs_enqueued`. No address, no subject line, no content.
12. **Committed fixtures** under `.../digest/__tests__/fixtures/`: `alerts.json` (a window's worth of
    alerts across two watchlists, including one already delivered immediately),
    `expected-digest-subject.txt` and `expected-digest-body.txt`.

## Acceptance checklist (classified)

- [ ] `[fixture]` **Digest replay, offline**: replaying `alerts.json` through `WTCH-04`'s
      `FileTransport` produces exactly `expected-digest-subject.txt` and
      `expected-digest-body.txt`, one file per recipient. **No test requires a live email endpoint**
      (PRD §42.3, `UAT-OPS-02`; epic `E25-MONITOR` exit evidence *"MON tests and delivery replay"*)
- [ ] `[machine]` **MON-004, no double delivery**: an alert already delivered immediately by email is
      **excluded** from the digest — the reserve step observes the existing
      `(alert_id, 'EMAIL', destination)` row and drops it before rendering (PRD §35.6 *"idempotent
      `(alert, channel, destination)`"*)
- [ ] `[machine]` **MON-004, digest idempotency**: running the same window twice — sequentially and
      concurrently on two leases — sends exactly one message per recipient and creates exactly one
      delivery row per `(alert, channel, destination)` (PRD §18.5)
- [ ] `[machine]` **Delivery-mode routing (PRD §32.7)**: an `IMMEDIATE` watchlist's alerts never enter
      a digest, and a `DAILY_DIGEST` watchlist's alerts are never sent immediately — a parametrised
      test over both modes and both channels
- [ ] `[machine]` **Self-rescheduling without a cron**: completing a run enqueues exactly one job for
      the next window; a duplicate enqueue with the same
      `('ALERT_DIGEST', organization_id, window_date)` fingerprint returns the original job; after a
      simulated 3-day outage the boot reconciliation enqueues the missing windows **once each**
      (PRD §18.1's no-new-infrastructure rule; PRD §35.6 `job`)
- [ ] `[machine]` Window boundaries: `digestWindow` is pure and correct across a daylight-saving
      transition in `Australia/Sydney` — exactly one window on both the 23-hour and the 25-hour day
      (**Q-WTCH-5**; PRD §39.6 layer-1 defaults)
- [ ] `[machine]` Crash resume: killing the process between the reserve and the settle leaves the rows
      `PENDING` and the resumed run re-sends with the **same** `idempotencyKey`, never a new one
      (`WTCH-04` deliverable 4.4)
- [ ] `[machine]` **Webhook at the boundary (sub-PRD D8)**: each digested alert enqueues exactly one
      `WTCH-05` job carrying its own `alert.created` event; this ticket builds **no** envelope and
      defines **no** event type — asserted by a scan showing no import of the event schema or signing
      helper in this directory (PRD §34.8; `FND-05` ownership)
- [ ] `[machine]` Empty window: no message, no delivery row, `SKIPPED_EMPTY` recorded, and the next
      window still scheduled (deliverable 8)
- [ ] `[machine]` Bounded digest: a window with 5,000 alerts sends the configured maximum plus an
      accurate overflow count and a link, and the transaction stays bounded (PRD §39.5
      "bounded, does not consume research slot")
- [ ] `[machine]` Dead-letter: a digest that exhausts `WTCH-04`'s retry schedule terminates in
      `DEAD_LETTER` and its alerts are **not** silently re-queued into the next window
      (deliverable 5)
- [ ] `[machine]` **Payload minimisation (PRD §8.8)**: the digest subject, body and every log line
      contain no complete customer question or answer, no claim text, no source excerpt and no record
      title — asserted by the denylist check **and** by a canary fixture whose record carries a
      distinctive question/answer string that must not appear anywhere in the output
- [ ] `[machine]` Kill switch: a `webhooks` switch suppresses only the webhook enqueue while the
      email digest sends; a `tenant/key` switch defers the run with no attempt consumed and no
      duplicate on recovery (PRD §42.5)
- [ ] `[machine]` **Channel registration (sub-PRD D2)**: discovered by `WTCH-03`'s registry with
      **zero** diff to any file outside `apps/worker/src/handlers/notifications/digest/`, verified
      with `git status --porcelain` (`RUNT-04` contract item 6)
- [ ] `[machine]` Architecture: no unscoped `packages/database` import; no HTTP or SMTP client in this
      directory — the only egress is `WTCH-04`'s injected transport (PRD §45.2)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3)
- [ ] `[human]` Gate 2 founder review: read one rendered digest file and confirm it is useful,
      correctly grouped and carries no customer research content (PRD §43.4 founder test queue;
      CLAUDE.md Gate 2). **Not required to merge** — the automated criteria above are
- [ ] `[human]` **Q-WTCH-5 writeback is an acceptance item**: the README's Q-WTCH-5 row records the
      shipped default hour/timezone and whether the Founder wants a customer-visible setting. Silence
      is not an acceptable outcome (CLAUDE.md; PRD §45.5)
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable (PRD §45.3)
- [ ] Cross-reference: **MON-001** (watchlist configuration) is `WTCH-01`'s, **MON-002** (fan-out) is
      `WTCH-02`'s and **MON-003** (alert content) is `WTCH-03`'s; this ticket owns only the
      **MON-004** delivery half for the digest path. Declared explicitly so the coverage is not
      assumed
- [ ] `[machine]` PR states the PRD §45.4 items: requirement **MON-004**, epic `E25-MONITOR`;
      user-visible change and non-goals; schema/API/event compatibility impact (none — no HTTP
      surface, no new event type); tenant/PII/security impact (one digest per organisation, recipient
      addresses never logged in full, no research content); source/licence impact (official URLs
      only); cost/memory/latency impact (bounded collection, one message instead of N — the reason
      digest mode exists against the PRD §24.1 budget); rollback path (revert the directory; digest
      watchlists then accumulate `queued_for_digest` alerts visible in-app, and the writeback is to
      re-enable or switch them to `IMMEDIATE`); known gaps (**Q-WTCH-5** default hour; no digest
      preview surface; no per-organisation timezone)

## Test plan

Reviewer steps. Every step is offline and deterministic: `FileTransport`, fake clock with an explicit
timezone, injected RNG, committed fixtures. **No live email provider, no webhook endpoint, no
network.**

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter <the apps/worker package name>`; suites under
   `apps/worker/src/handlers/notifications/digest/__tests__/`.
3. **Harness.** Copy `WTCH-04`'s suite construction (temp `app.sqlite` migrated by `DATA-01`,
   `DATA-07` delivery repository, `packages/jobs` leases, fake clock, injected transport) and
   `RUNT-04`'s `checkpoint-resume.test.ts` for the crash cases. Seed alerts with `WTCH-03`'s
   factories, including one already delivered immediately.
4. **Read the golden files against the PRD.** Compare `expected-digest-body.txt` with PRD §32.7's
   alert fields and PRD §8.8's payload sentence: grouped by watchlist, change type, dates, authority
   title, official URL, deep link, counts — and no question, answer, claim, excerpt or record title.
5. **Canary.** Confirm the fixture record carries a distinctive question/answer string and that the
   suite asserts its absence from subject, body and logs.
6. **No double delivery.** Assert the already-delivered alert is absent from the rendered body and
   that its delivery row count stays at one.
7. **Idempotency.** Run the same window twice sequentially, then concurrently on two leases; assert
   one message per recipient each time.
8. **Mode routing.** Parametrise over `IMMEDIATE`/`DAILY_DIGEST` × `EMAIL`/`WEBHOOK`; assert the four
   expected outcomes.
9. **Rescheduling.** Complete a run; assert exactly one next-window job. Enqueue a duplicate; assert
   the original is returned. Simulate a 3-day outage and run the boot reconciliation; assert three
   jobs, one per missing window, and no double send.
10. **Timezone.** Run `digestWindow` across both Australian daylight-saving transition dates; assert
    exactly one window per day and correct boundaries. Confirm the function takes the clock as an
    argument (grep for `Date.now` inside it — there must be none).
11. **Crash resume.** Kill between reserve and settle; restart; assert the same `idempotencyKey`.
12. **Bounds.** Seed 5,000 alerts; assert the configured maximum plus the overflow count and link.
13. **Webhook boundary.** Assert one `WTCH-05` job per digested alert with the expected fingerprint,
    and grep this directory for any import of the event schema or the signing helper — there must be
    none.
14. **Kill switch.** Activate `webhooks`; assert the email sends and no webhook job is enqueued.
    Activate a `tenant/key` switch; assert deferral with no attempt consumed.
15. `git status --porcelain` — clean; confirm no file under `notifications/` outside `digest/` is
    modified by the diff.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket file** (docs PR →
merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/16-monitor-alerts/README.md` (version +0.1 with a changelog line) **before** changing code.
Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**Foreseeable frictions, each with its exact writeback target:**

1. **Customers want a single digested webhook rather than N `alert.created` events** (sub-PRD
   **D8**). → `schemas/events/**` is `FND-05`'s serial-owned tree and PRD §34.8 specifies only
   `alert.created`. Raise a new type **on `FND-05`** (its Feedback obligation 2 defines the path),
   add the `blocked_by` edge in `docs/prd/breakdown-plan.md` §6.2, and record it in
   `docs/prd/16-monitor-alerts/README.md` **D8**. **Never** define a digest event schema here, and
   never pack multiple alerts into an `alert.created` payload — that would silently break every
   receiver's contract. Equally, a change type that cannot be structured per PRD §8.8 must not be
   summarised into free text in a digest line: that is a writeback (`WTCH-02`'s `UNCLASSIFIED` path
   plus a PRD change), not a local workaround.
2. **The default digest hour or timezone is wrong** (**Q-WTCH-5**). → It is a PRD §39.6 layer-1
   default; change it in `config.ts` and record the new value and its reason in
   `docs/prd/16-monitor-alerts/README.md` Q-WTCH-5. A **per-organisation** setting is a product
   change (PRD §45.5) requiring a `DATA-07` column (raise a `01-app-data` ticket, add the edge in
   `docs/prd/breakdown-plan.md` §5.2/§6.2) and a `WTCH-01` DTO field.
3. **Self-rescheduling proves unreliable** (missed or duplicated windows after downtime). → Record
   the failure mode in `docs/prd/16-monitor-alerts/README.md`. The fix is inside the job-table
   fingerprint and the reconciliation, or a `maintenance`-class scheduling primitive in
   `03-app-runtime`/`RUNT-04` — raised as a plan change in
   `docs/prd/breakdown-plan.md` §5.4/§6.2. **Do not** add a cron, timer service or external scheduler:
   PRD §18.1 forbids new infrastructure.
4. **A digest must include content to be useful** (for example the changed clause text). → PRD §8.8's
   payload limit and PRD §10.2's content rules apply to every channel. The digest carries links; the
   content lives behind authentication on `/monitor/alerts/:alertId`. A genuine need is a
   **product/privacy change** (PRD §45.5) recorded in `docs/prd/16-monitor-alerts/README.md` and
   escalated before the renderer changes.
5. **The `alert_delivery` reserve step cannot cover N alerts in one transaction** at the configured
   bound. → Reduce `max_alerts_per_digest` (a layer-1 default) and record the measurement in the PR's
   cost/memory line (PRD §45.4). Do **not** send first and record afterwards: that trades idempotency
   for throughput and breaks `MON-004`.
6. **`WTCH-04`'s renderer primitives are not reusable** (for example the message assembly is private
   to the single-alert path). → The writeback target is **`WTCH-04`'s deliverable 6** plus this
   ticket: agree the shared surface in the two ticket files and in
   `docs/prd/16-monitor-alerts/README.md`. Do **not** copy the renderer into this directory — two
   renderers means two payload-minimisation boundaries and one of them will drift.

**Escalation.** PRD §32.7's `IMMEDIATE`/`DAILY_DIGEST` contract, `MON-004`'s idempotent delivery and
PRD §8.8's payload limit are release requirements. If any is outright falsified — for example if the
`(alert, channel, destination)` key cannot express digest delivery — stop, raise an ADR under
`docs/adr/`, write back to `docs/prd/16-monitor-alerts/README.md` and
`docs/prd/breakdown-plan.md` §5.17, and escalate to the human before code lands. Never create a
second delivery path with weaker idempotency than the immediate one.
