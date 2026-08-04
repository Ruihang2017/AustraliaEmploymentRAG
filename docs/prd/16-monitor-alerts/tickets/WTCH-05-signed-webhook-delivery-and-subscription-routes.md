---
id: WTCH-05
title: Signed webhook delivery and subscription routes
module: 16-monitor-alerts
lane: 16-monitor-alerts
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [WTCH-03, FND-05]
blocks: [PLTF-07]
---

# WTCH-05 — Signed webhook delivery and subscription routes

Implements PRD §8.8, §34.8, §37.4 and §16.2, requirement **MON-004** (epic `E25-MONITOR`).
No ADR — the decision is already made in PRD §34.8 (headers, signature input, envelope) and PRD §8.8
(HMAC-SHA256, timestamps, idempotent event IDs, secret rotation, bounded exponential retry); this is
build ticket 5 of 8 against it. One sub-question the PRD does not settle — the **rotation overlap
semantics** — is sub-PRD open question **Q-WTCH-7** and is recorded by this ticket as an ADR, not
invented in code.
Parent sub-PRD: [16-monitor-alerts README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [WTCH-03 — Alert creation, impact marking and alert routes](WTCH-03-alert-creation-impact-marking-and-alert-routes.md), [FND-05 — Event and webhook schema root](../../00-foundation/tickets/FND-05-event-and-webhook-schema-root.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §34.8 gives the exact headers, signature input and payload, and `FND-05` already ships the
sign/verify helper; this is the delivery loop and the subscription surface against them.

## Background + basis

**PRD §34.8, quoted in full — this is the wire contract:**

> Headers:
>
> ```text
> X-AER-Event-Id: evt_...
> X-AER-Timestamp: 1785726012
> X-AER-Signature: v1=<lowercase hex HMAC-SHA256>
> ```
>
> The signature input is `<timestamp>.<raw_request_body>`. Receivers reject a timestamp older than
> five minutes and deduplicate event IDs.
>
> ```json
> {
>   "schema_version": "1.0",
>   "id": "evt_...",
>   "type": "alert.created",
>   "created_at": "2026-08-03T03:00:12Z",
>   "sandbox": false,
>   "data": {
>     "alert_id": "alt_...",
>     "watchlist_id": "wat_...",
>     "change_type": "COMMENCEMENT",
>     "effective_date": "2026-09-01",
>     "affected_research_record_ids": ["rec_..."]
>   }
> }
> ```
>
> Full questions, facts, answers and source excerpts are excluded by default.

**PRD §8.8 — the delivery requirements:**

> Webhook delivery MUST use HMAC-SHA256 signatures, timestamps, idempotent event IDs, secret rotation
> and bounded exponential retry. Payloads MUST avoid complete customer questions/answers by default.

**PRD §16.1:** *"Webhooks carry their own schema version."*
**PRD §16.2:** *"CRUD/test/rotate `/v1/webhook-subscriptions`"* and *"Webhook headers MUST include
event ID, timestamp and HMAC signature."*
**PRD §38.5:** webhook endpoints are limited to **2** (trial) / **10** (paid pilot) per organisation,
with *"delivery queue isolated from research"*.
**PRD §39.5:** the `notifications` queue class — *"2 independent leases"*, *"bounded, does not consume
research slot"*.
**PRD §39.6:** the minimum secret groups include a *"webhook encryption key"*; configuration layers
end in *"encrypted/sealed secret injection"*.
**PRD §32.8:** developer pages show *"webhook signing instructions"* and *"Secrets are never
redisplayed"*.
**PRD §42.5:** *"| Webhooks | Alerts remain in-app/queued | Stop delivery; retry after recovery
without duplicates |"*.

**Requirement `MON-004`** (PRD §30.2): *"Email/webhook delivery is retryable and idempotent | Monitor
settings | webhook endpoints | App | **Signature/replay/retry/dead-letter tests pass**"*.

**UAT script `UAT-MON-02`** (PRD §41.2): *"Replay signed webhook → Receiver/test verifier rejects
replay but original delivery remains successful."*

**The helper already exists.** `FND-05` (merged before this ticket) owns `schemas/events/**` and
`packages/contracts/src/events/**`, and its deliverable 3 states:

> `signWebhook({ secret, timestampSeconds, rawBody }): string` returning `v1=<lowercase hex>` where
> the HMAC-SHA256 input is exactly `${timestampSeconds}.${rawBody}` (PRD §34.8). `rawBody` is the
> **raw bytes as sent**, never a re-serialised object — re-serialisation is the classic signature
> break and must be documented at the call site.
> … `verifyWebhook({ secret, header, rawBody, nowSeconds, toleranceSeconds = 300 })` … Comparison
> uses a constant-time comparator … Secret rotation support: `verifyWebhook` accepts an ordered list
> of secrets and returns which one matched, so `WTCH-05` can implement PRD §8.8's rotation with an
> overlap window without changing this contract.
> Idempotency: `isDuplicateEventId` is **not** implemented here (it needs storage); the helper returns
> the parsed `X-AER-Event-Id` so the caller can deduplicate, and the doc comment names PRD §34.8's
> requirement and `WTCH-05` as its owner.

`FND-05` also owns the **only** webhook event schema the PRD specifies (`alert.created`) and states
that a new type is added *there*, never in a consuming module.

**The delivery row and its idempotency key already exist.** PRD §35.6: `alert`/`alert_delivery` —
*"idempotent `(alert, channel, destination)`"*; `DATA-07` deliverable 6 implements it with
`UNIQUE (alert_id, channel, destination)`, an append-only `recordAttempt`, a bounded attempt counter
and a dead-letter terminal state.

**The channel contract already exists.** `WTCH-03` deliverable 1 ships
`apps/worker/src/handlers/notifications/{index.ts,registry.ts,channel-contract.ts}`; a channel is a
subdirectory containing `channel.ts` with a default export of `AlertChannelModule`, discovered by
scan — so adding this channel diffs no file outside `notifications/webhook/`.

**Egress safety.** PRD §37.4 states the platform's address policy for outbound fetches:

> Each source has an allowlisted scheme/domain/path policy. The fetcher resolves DNS and rejects
> loopback, private, link-local, multicast and cloud-metadata addresses before and after redirects.
> Initial defaults: 5 redirects, 30-second fetch timeout, 50 MiB document limit, 250 MiB safely
> decompressed limit and declared/observed type agreement.

That fetcher is `INGF-02`, inside `pipelines/ingestion`, which `apps/worker` cannot import and which
this ticket has no edge to. Sub-PRD **D10** therefore implements the same **address policy class**
locally, and sub-PRD **Q-WTCH-4** records the duplication with its writeback path. PRD §21.1's
required controls and PRD §37.5 (*"The model gateway exposes no shell, Web, database, email, webhook
or arbitrary tool"*) are the reason a customer-supplied URL is treated as hostile input.

**Accepted caveats carried forward:**

- **Rotation overlap semantics are not in the PRD** (**Q-WTCH-7**). Sub-PRD **D9** fixes them:
  `rotate-secret` returns the new secret **once** and records `signing_switch_at`; the sender signs
  with the previous secret until that instant and the new secret after it, always emitting exactly
  one `X-AER-Signature`. A second signature header would change PRD §34.8's fixed header set.
- **Only `alert.created` exists.** PRD §34.8 specifies one event type; sub-PRD **D8** keeps digest
  mode a *delivery-time* batching of the same events. A new type is an `FND-05` writeback.
- **This module never receives a webhook.** The "receiver" in `UAT-MON-02` is `FND-05`'s verifier
  plus this ticket's local in-process test receiver — never a deployed endpoint.

## Goal

Produce two artifacts: (1) `apps/api/src/routes/webhook-subscriptions/**` — CRUD, `test` and
`rotate-secret` for `/v1/webhook-subscriptions`, with the endpoint URL validated against the
deliverable-3 egress policy, secrets shown once and stored encrypted, and the PRD §38.5 endpoint
cap enforced; and (2) `apps/worker/src/handlers/notifications/webhook/**` — the `WEBHOOK`
`AlertChannelModule` that builds the exact PRD §34.8 envelope from `FND-05`'s schema, signs it with
`FND-05`'s helper over the raw bytes it sends, delivers it through a guarded egress client, retries on
a bounded exponential schedule with per-attempt re-signing and a stable event id, and terminates in
dead-letter. Completion is mechanically checkable: a committed delivery replays byte-for-byte against
a local receiver using `FND-05`'s verifier; a replay 301 seconds later is rejected while the original
delivery stays successful (`UAT-MON-02`); a rotation window verifies under both secrets at the right
times; and a delivery to `http://169.254.169.254/` or `https://localhost/` is refused before any
socket is opened.

## Non-goals

- **No event schema, envelope, signature helper or new event type** — `00-foundation`/`FND-05` owns
  `schemas/events/**` and `packages/contracts/src/events/**` (PRD §44.3 serial-owned). This ticket
  **imports** `signWebhook`/`verifyWebhook` and validates against the published schema; it defines no
  schema and adds no event type.
- **No email or digest channel** — `WTCH-04`, `WTCH-06` (sibling channel subtrees).
- **No alert creation, impact marking or alert routes** — `WTCH-03`.
- **No `notifications` area shell or channel registry** — `WTCH-03` (sub-PRD **D2**).
- **No tables, migrations, repositories or field-encryption primitives** — `01-app-data`
  (`DATA-07` for `alert_delivery`, `DATA-03` for envelope encryption). Breakdown-plan **A3**.
- **No developer-facing webhook screens** — `20-developer-platform`/`PLTF-07`
  (`/developer/webhooks`), which is `blocked_by` this ticket and renders the signing instructions
  PRD §32.8 requires.
- **No SDK webhook verification** — `PLTF-02` (TypeScript) and `PLTF-03` (Python), both built on
  `FND-05`.
- **No inbound webhook receiver in production** — the only receiver is the in-process test one.
- **No kill-switch implementation** — `DATA-07` stores and `INTL-09` operates; this ticket honours
  the `webhooks` scope per PRD §42.5.
- **No shared egress package** — sub-PRD **Q-WTCH-4**; creating one is a plan change, not a
  side effect of this ticket.

## File-scope (write-owns)

- `apps/api/src/routes/webhook-subscriptions/**` — the route area, DTOs, handlers and its tests.
- `apps/worker/src/handlers/notifications/webhook/**` — `channel.ts`, the envelope builder, the
  egress guard, the delivery client, the local test receiver, fixtures and tests.
- Per breakdown-plan **A9** (`docs/adr/**` is shared-additive with per-file ownership, claimed by the
  creating ticket): `docs/adr/NNNN-webhook-secret-rotation.md` — **required** (deliverable 6). Take
  the lowest unused four-digit number at build time; the slug `webhook-secret-rotation` is reserved
  to this ticket.

Does not touch:

- `apps/worker/src/handlers/notifications/{index.ts,registry.ts,channel-contract.ts}` — `WTCH-03`
  (merged before this ticket); `notifications/{email,digest}/**` — `WTCH-04`, `WTCH-06` (disjoint
  sibling subtrees).
- `apps/api/src/routes/{watchlists,alerts}/**` — `WTCH-01`, `WTCH-03`.
- `apps/api/src/{server.ts,app.ts,bootstrap,plugins,middleware,errors,sse}/**`,
  `apps/worker/src/{main.ts,runtime,queues}/**` — `03-app-runtime`.
- `schemas/events/**`, `packages/contracts/**` — `FND-05`, `FND-03`, `FND-04`.
- `packages/database/**` (**A3**), `packages/auth/**`, `packages/domain/**`, `packages/ui/**`.
- `pipelines/ingestion/**` (including `INGF-02`'s fetcher), `apps/web/**`, `infra/**`, `tests/**`.

**Serial-safety analysis.** First decomposition — breakdown-plan §1 records `phase: 1`, nothing
merged and nothing in flight. Neither `apps/api/src/routes/webhook-subscriptions/` nor
`apps/worker/src/handlers/notifications/webhook/` exists before this ticket, and breakdown-plan §5.17
assigns both to `WTCH-05` alone. Under **A1** each route and handler area is an independent directory
with its own entry file, so this ticket shares no file with `WTCH-01`'s `watchlists`, `WTCH-03`'s
`alerts` or `WTCH-02`'s `change-matching`. The enclosing `notifications` area is a single area under
`RUNT-04`'s contract, resolved by sub-PRD **D2**: its shell belongs to `WTCH-03`, strictly earlier in
the DAG, and each channel owns only its own subdirectory — which is why this ticket and `WTCH-04`
are safe as concurrent round-3 lanes. `docs/adr/` is empty (breakdown-plan §1 header) and ownership
is per file under **A9**, so the reserved slug cannot collide.

## Deliverables

1. **Subscription route area** `apps/api/src/routes/webhook-subscriptions/index.ts` — default-exported
   Fastify plugin, `export const area = { admission: 'tenant' }`, derived prefix
   `/v1/webhook-subscriptions` (`RUNT-01` contract item 4). Endpoints (PRD §16.2 *"CRUD/test/rotate"*):
   - `POST /v1/webhook-subscriptions` — create; `monitor:write`; body
     `{ url, description?, event_types[], active }`; **response returns the generated secret exactly
     once** (PRD §32.8 *"Secrets are never redisplayed"*); honours `Idempotency-Key`.
   - `GET /v1/webhook-subscriptions` / `GET /{id}` — `monitor:read`; the secret is **never** returned,
     only `secret_last_rotated_at`, `secret_prefix` (first 6 characters) and
     `pending_secret_active_from`.
   - `PATCH /{id}` — `If-Match` required; `url`, `description`, `event_types`, `active`.
   - `DELETE /{id}` — `If-Match` required.
   - `POST /{id}/test` — sends a `webhook.test` **ping** built and signed exactly like a real
     delivery, to the subscription's own URL, through the same egress guard, and returns the
     receiver's status code and the elapsed time. It carries a synthetic `data` object with no tenant
     content beyond the subscription id. It is **rate-limited** to a low burst per subscription and
     never enqueues a retry.
   - `POST /{id}/rotate-secret` — deliverable 6.
   Enforce PRD §38.5's endpoint cap (2 trial / 10 paid) at create time with a named error; the plan
   value is a configuration default (PRD §39.6 layer 1).
2. **Secret storage** — a subscription's signing secret is generated with a CSPRNG, ≥256 bits,
   rendered as a prefixed opaque string, and stored **encrypted** through `DATA-03`'s field
   encryption using the PRD §39.6 *"webhook encryption key"* group. It is returned once on create and
   once on rotate, and never again by any route, log, metric or error (PRD §32.8, §22). A test
   asserts the plaintext secret does not appear in the raw `.sqlite`/`-wal` bytes.
3. **Egress guard (sub-PRD D10)** — `egress.ts`, applied to **every** outbound request, including the
   `test` ping:
   - scheme MUST be `https`; `http` is refused (PRD §21.1);
   - the hostname is resolved and **every** resolved address is checked against the denial set —
     loopback, private (RFC 1918 and IPv6 ULA), link-local (including `169.254.0.0/16` and
     `fe80::/10`), multicast, unspecified, and cloud-metadata (`169.254.169.254`,
     `fd00:ec2::254`) — mirroring PRD §37.4's list;
   - the connection is made to the **pinned resolved address** with the original Host/SNI, so a DNS
     rebinding between check and connect cannot redirect the request;
   - **redirects are not followed** (a stricter subset of PRD §37.4's "before and after redirects" —
     a `3xx` is a delivery failure, classified `PERMANENT_FAILURE` unless it is `307`/`308` to the
     same origin, which is also refused for simplicity and stated in the developer docs);
   - request timeout 10 s total, connect timeout 5 s, response body read bounded to 2 KiB and
     discarded beyond it (PRD §39.6 layer-1 defaults; the PRD gives no outbound-webhook numbers);
   - no proxy is honoured from the environment unless explicitly configured;
   - the guard is validated **twice**: at subscription create/update time (fail fast with
     `400 INVALID_REQUEST` naming the reason) and again at each delivery attempt (the address may
     have changed).
4. **Envelope construction** — `envelope.ts` builds the PRD §34.8 body from the alert:
   `{ schema_version, id: "evt_<uuidv7>", type: "alert.created", created_at: <ISO 8601 UTC>,
   sandbox: <organisation environment is SANDBOX>, data: { alert_id, watchlist_id, change_type,
   effective_date, affected_research_record_ids } }`. The object is validated against
   `schemas/events/webhook/v1/alert.created.json` (`FND-05`) **before** serialisation; a validation
   failure is a terminal delivery failure, never a best-effort send. `affected_research_record_ids`
   is truncated to the configured maximum with a `affected_research_record_overflow` count only if
   `FND-05`'s schema permits the field; otherwise the list is truncated and the full set stays on the
   alert (PRD §34.8's payload is identifiers only either way).
5. **Signing, to the byte (PRD §34.8, `FND-05`).** Ordering is load-bearing and must be exactly:
   1. serialise the envelope **once** into a `Buffer` — call it `rawBody`. This buffer is the single
      source of truth; it is signed and sent unchanged. **Re-serialising before sending breaks the
      signature** and is forbidden (the call site carries this comment, as `FND-05` requires).
   2. `timestampSeconds = Math.floor(now / 1000)` from the **injected clock**, taken at the moment of
      *this attempt*, not at alert creation.
   3. `signature = signWebhook({ secret: <the secret selected by deliverable 6>, timestampSeconds,
      rawBody })` → `v1=<lowercase hex>`.
   4. send `POST <subscription.url>` with headers, in this exact form:
      - `X-AER-Event-Id: <the stable event id from deliverable 7>`
      - `X-AER-Timestamp: <timestampSeconds>` (integer seconds, no fraction, no quotes)
      - `X-AER-Signature: v1=<hex>` (lowercase hex, `v1=` prefix present)
      - `Content-Type: application/json`
      - `User-Agent: <product>/<release version>`
      and `rawBody` as the body, byte-identical to what was signed.
   **Per-attempt re-signing is mandatory:** the timestamp and signature change on every attempt so a
   retry hours later is not rejected by the receiver's five-minute rule, while the **event id and the
   body stay identical** so the receiver deduplicates. A test asserts exactly this pair of properties.
6. **Secret rotation (sub-PRD D9, ADR `docs/adr/NNNN-webhook-secret-rotation.md`, Q-WTCH-7).**
   `POST /{id}/rotate-secret` with body `{ switch_after_seconds? }`:
   - generates the new secret, returns it **once**, and records
     `signing_switch_at = now + switch_after_seconds` (default 24 h; range 0 s … 7 days, values
     outside the range are `400 INVALID_REQUEST`);
   - both secrets are stored encrypted; the previous one is retained until
     `signing_switch_at + <retention window, default equal to the switch window>` and is then
     **destroyed** (overwritten in the row) and can never be reactivated;
   - the sender selects the secret purely by clock: `now < signing_switch_at` → previous secret;
     otherwise → new secret. Exactly **one** `X-AER-Signature` header is emitted, always
     (PRD §34.8's header set is fixed);
   - the receiver-side story, which `PLTF-07` documents and `PLTF-02`/`PLTF-03` implement, is
     `FND-05`'s ordered-secret `verifyWebhook`: hold both secrets across the window;
   - a second rotation while one is pending is rejected with a named error rather than producing
     three secrets;
   - the ADR records the option set weighed (immediate switch; dual-signature header; sender-side
     switch window) and states why the header set could not change.
7. **Event id and idempotency (PRD §8.8 *"idempotent event IDs"*).** The `X-AER-Event-Id` is
   generated **once** per `(subscription_id, alert_id, event_type)` and persisted on the
   `alert_delivery` row whose `destination` is the subscription id, so
   `UNIQUE (alert_id, channel, destination)` (PRD §35.6) guarantees exactly one event id per
   subscription per alert. Every retry re-uses it. The row is reserved in status `PENDING` **before**
   the first send, exactly as `WTCH-04` deliverable 4 does, so a repeated or concurrent lease observes
   the row instead of minting a second event.
8. **Bounded exponential retry and dead-letter (PRD §8.8; `MON-004`'s "retry/dead-letter tests
   pass").** The same committed table as `WTCH-04` deliverable 5 — attempts at 0, +1 min, +5 min,
   +25 min, +2 h, +6 h, +12 h (seven attempts, ±20 % jitter from an injected RNG) — with webhook
   classification:
   - **success**: any `2xx` → `DELIVERED`, terminal;
   - **retryable**: connection error, DNS failure, timeout, `408`, `429` (honouring `Retry-After`
     when it is within the remaining budget) and any `5xx`;
   - **permanent**: any other `4xx`, a `3xx` (redirects are refused), a TLS failure, or an egress
     policy refusal → terminal `FAILED` with the reason code, no further attempt;
   - after the seventh retryable failure → `DEAD_LETTER` (`DATA-07`'s terminal state), final, with an
     operator counter and a subscription-level consecutive-failure counter. A subscription reaching a
     configured consecutive dead-letter count is automatically set `active: false` with a recorded
     reason, so a permanently broken endpoint stops consuming the queue (a PRD §39.6 layer-1 default,
     surfaced to the customer through `PLTF-07`).
9. **Kill switch (PRD §42.5)** — before each attempt, read `DATA-07`'s `activeSwitchesAt(now)`; while
   a `webhooks`-scoped switch is active the attempt is **deferred without consuming an attempt slot
   and without recording a failure**, and the alert remains in-app and queued. After recovery the
   delivery resumes with the same event id and no duplicate — the exact behaviour PRD §42.5 requires
   (*"Stop delivery; retry after recovery without duplicates"*).
10. **Local test receiver** — `__tests__/receiver.ts`: an in-process HTTP listener on an ephemeral
    loopback port that records `(headers, rawBody, receivedAt)` and verifies using `FND-05`'s
    `verifyWebhook` with a configurable secret list, clock and 300-second tolerance. It is the only
    "endpoint" any test uses. **Note the deliberate tension**: the egress guard refuses loopback, so
    the delivery client takes an injectable `AddressPolicy` whose test implementation allows exactly
    the receiver's ephemeral port and nothing else, and a test asserts that the **production** policy
    refuses that same address. The guard is never disabled by a global flag or an environment
    variable — a bypassable guard is not a guard.
11. **Payload minimisation (PRD §34.8 *"Full questions, facts, answers and source excerpts are
    excluded by default"*, PRD §8.8)** — the envelope carries identifiers, enum values and dates only;
    the denylist property-name check (`question`, `facts`, `answer`, `short_answer`, `claim_text`,
    `quote`, `snippet`, `excerpt`, `content`, `prompt`, `reasoning`, `provider_payload`, `text`) runs
    over the built envelope as well as the schema, and no log line, metric label or error message
    carries the body, the secret or the signature (PRD §22).
12. **Observability** (PRD §22, content-free): `webhook_delivery_attempts{result}`,
    `webhook_delivery_dead_letter`, `webhook_delivery_latency_ms`,
    `webhook_egress_refused{reason}`, `webhook_subscription_auto_disabled`,
    `webhook_deferred_by_kill_switch`. Never log the URL's full path, the secret, the signature or
    the body.
13. **Committed fixtures** under `.../webhook/__tests__/fixtures/`:
    `alert-created.body.json` (the exact bytes of a delivery body), `alert-created.headers.txt` (the
    three `X-AER-*` headers as sent), `secret.txt` (a literal fixed test secret — never an
    environment variable) and `expected-signature.txt` (the signature computed from them). These
    mirror `FND-05`'s fixtures and let a reviewer confirm the wire format against PRD §34.8 by eye.

## Acceptance checklist (classified)

- [ ] `[fixture]` **Byte-exact delivery replay, offline**: delivering the fixture alert with the
      committed secret and a pinned clock produces exactly `alert-created.body.json` and
      `alert-created.headers.txt`, and `FND-05`'s `verifyWebhook` on the local receiver returns `OK`.
      The signature asserted is the **committed** `expected-signature.txt`, not merely
      `verify(sign(x))` — a self-consistent pair would pass with the wrong signing input
      (PRD §34.8; **MON-004**)
- [ ] `[fixture]` **`UAT-MON-02` — replay**: capturing a successful delivery and re-presenting it to
      the receiver at `+301` seconds is rejected with `TIMESTAMP_OUT_OF_WINDOW`, **and** the original
      delivery remains recorded `DELIVERED`; re-presenting the same `X-AER-Event-Id` within the
      window is rejected by the receiver's de-duplication while the original stays successful
      (PRD §41.2 `UAT-MON-02`; PRD §34.8 *"Receivers reject a timestamp older than five minutes and
      deduplicate event IDs"*)
- [ ] `[machine]` **Raw-body integrity**: the bytes signed are the bytes sent — a test signs a body
      containing a non-ASCII character and a key order whose re-serialisation would differ, and
      asserts the receiver verifies it (PRD §34.8; `FND-05` deliverable 3)
- [ ] `[machine]` **Per-attempt re-signing with a stable event id**: across three attempts the
      `X-AER-Timestamp` and `X-AER-Signature` differ while `X-AER-Event-Id` and the body bytes are
      identical (PRD §8.8 *"timestamps, idempotent event IDs"*)
- [ ] `[machine]` **MON-004, idempotency**: two concurrent leases for the same
      `(alert, WEBHOOK, subscription)` produce one `alert_delivery` row, one event id and one
      delivered request (PRD §35.6)
- [ ] `[machine]` **MON-004, retry**: retryable failures retry at the deliverable-8 delays under a
      fake clock and injected RNG; `429` with a `Retry-After` inside the budget honours it; a
      permanent failure is not retried (PRD §8.8 *"bounded exponential retry"*)
- [ ] `[machine]` **MON-004, dead-letter**: after the seventh retryable failure the row is
      `DEAD_LETTER`, terminal, and the subscription auto-disables after the configured consecutive
      count with a recorded reason (`DATA-07` deliverable 6)
- [ ] `[machine]` **Secret rotation (sub-PRD D9)**: before `signing_switch_at` the delivery verifies
      under the **previous** secret and not the new one; after it, under the **new** secret and not
      the previous; exactly one `X-AER-Signature` header is present in both cases; after the retention
      window the previous secret is destroyed and no longer verifies; a second rotation while one is
      pending is rejected (PRD §8.8 *"secret rotation"*; **Q-WTCH-7**)
- [ ] `[machine]` **Secrets are never redisplayed**: the create and rotate responses return the secret
      exactly once; every other route, log line, metric label and error message omits it; the
      plaintext secret is absent from the raw `.sqlite`/`-wal` bytes (PRD §32.8, §22, §39.6;
      `DATA-03`)
- [ ] `[machine]` **Egress guard (sub-PRD D10)**: subscription create and delivery both refuse
      `http://`, `https://localhost/`, `https://127.0.0.1/`, `https://[::1]/`,
      `https://10.0.0.1/`, `https://192.168.1.1/`, `https://169.254.169.254/` and a hostname
      resolving to any of them, **before** a socket is opened; a `3xx` response is a permanent
      failure; the response read stops at 2 KiB; the timeout fires at the configured value
      (PRD §37.4's policy class, §21.1, `SEC-002`'s discipline)
- [ ] `[machine]` **DNS-rebinding resistance**: a resolver stub returning a public address on the
      first lookup and a private one on the second still connects only to the checked, pinned address
      (deliverable 3)
- [ ] `[machine]` **The guard cannot be disabled**: no environment variable, configuration key or
      test-only flag turns it off globally; the test receiver is reached only through an injected
      `AddressPolicy`, and a test asserts the production policy refuses that same loopback address
      (deliverable 10)
- [ ] `[machine]` **Payload minimisation (PRD §8.8, §34.8)**: the built envelope contains no
      denylisted property and no complete customer question or answer — asserted with a canary
      fixture whose alert references a record carrying a distinctive question/answer string that must
      not appear in the body, the headers or any log line
- [ ] `[machine]` Envelope validity: the built body validates against
      `schemas/events/webhook/v1/alert.created.json` and carries `schema_version` (PRD §16.1
      *"Webhooks carry their own schema version"*); a schema failure is terminal, never a best-effort
      send
- [ ] `[machine]` `sandbox` is `true` exactly when the organisation's environment is `SANDBOX`
      (PRD §34.8; `DEV-003` *"Sandbox webhook/events are labelled"*)
- [ ] `[machine]` Kill switch: with a `webhooks` switch active no attempt is made, no attempt slot is
      consumed and no failure is recorded; after expiry the delivery completes exactly once
      (PRD §42.5)
- [ ] `[machine]` PRD §38.5 endpoint cap: creating an endpoint beyond the configured limit is
      rejected with a named error; the limit differs by plan tier
- [ ] `[machine]` **Tenant isolation**: a cross-tenant matrix over every subscription route returns
      `404 RESOURCE_NOT_FOUND` with the same body shape as an unknown id; `POST /{id}/test` cannot be
      pointed at another tenant's subscription (PRD §16.5, §21.2; `SEC-001`)
- [ ] `[machine]` `POST /{id}/test` sends exactly one request, enqueues no retry, is rate-limited and
      carries no tenant content beyond the subscription id (deliverable 1)
- [ ] `[machine]` **Channel registration (sub-PRD D2)**: discovered by `WTCH-03`'s registry with
      **zero** diff to any file outside `apps/worker/src/handlers/notifications/webhook/`, and the
      route area registers with zero diff outside `apps/api/src/routes/webhook-subscriptions/`
      (`RUNT-01`/`RUNT-04` contract item 6)
- [ ] `[machine]` Architecture: no unscoped `packages/database` import; the only outbound HTTP client
      in the module is inside this channel's egress seam; `pipelines/ingestion` is not imported
      (PRD §45.2, §39.1)
- [ ] `[machine]` `docs/adr/NNNN-webhook-secret-rotation.md` exists, records the option set, the
      chosen window semantics and the consequence for `PLTF-02`/`PLTF-03`/`PLTF-07`, and is linked
      from the PR — **the writeback is itself an acceptance item** (sub-PRD **Q-WTCH-7**; PRD §45.5;
      breakdown-plan **A9**)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — the `/v1/webhook-subscriptions`
      operations appear in the generated bindings with no hand-edit (PRD §20.1, `DEV-001`)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3)
- [ ] `[human]` Gate 2 founder smoke test of `UAT-MON-02` end to end (replay a signed webhook against
      the developer console's example verifier). **Not required to merge** — the `[fixture]` half
      above is (PRD §41.2; CLAUDE.md Gate 2)
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable. The Python verifier is `PLTF-03` (PRD §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement **MON-004** and `UAT-MON-02`, epic
      `E25-MONITOR`; user-visible change and non-goals; schema/API/event compatibility impact (new
      `/v1/webhook-subscriptions` operations; **no** change to `schemas/events/**` — `alert.created`
      is consumed as published); tenant/PII/security impact (customer-supplied URL treated as hostile
      input, egress denial set, pinned-address connect, no redirects, constant-time signature
      verification in the verifier, secrets encrypted and shown once, no research content in
      payloads); source/licence impact (none); cost/memory/latency impact (bounded retries, 10 s
      timeout, 2 KiB response read, isolated `notifications` leases per PRD §38.5); rollback path
      (revert both areas plus the ADR; alerts remain in-app and email); known gaps (**Q-WTCH-4**
      duplicated egress policy; **Q-WTCH-7** resolved by the ADR; only `alert.created` exists)

## Test plan

Reviewer steps. Every step is offline and deterministic: local in-process receiver, fixed secret,
pinned clock, injected RNG and resolver. **No external endpoint, no DNS, no network.**

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter <the apps/worker package name>` and `--filter <the apps/api package name>`;
   suites under `apps/worker/src/handlers/notifications/webhook/__tests__/` and
   `apps/api/src/routes/webhook-subscriptions/__tests__/`.
3. **Read the fixtures against the PRD.** Compare `alert-created.body.json` and
   `alert-created.headers.txt` with PRD §34.8's JSON and header block, character by character:
   `X-AER-Signature` must be `v1=` plus **lowercase** hex; `X-AER-Timestamp` must be integer seconds;
   `schema_version` must be present. Then compare them with `FND-05`'s own fixtures — a divergence
   between the two modules' idea of the wire format is the highest-value defect to find here.
4. **Signature proof.** Confirm the test asserts the committed `expected-signature.txt`. Then confirm
   the raw-body test signs a body whose re-serialisation would differ (reordered keys or a non-ASCII
   character) and verifies against the original bytes.
5. **`UAT-MON-02`.** Run the replay suite: deliver once (receiver `OK`, row `DELIVERED`), advance the
   fake clock 301 s, re-present the captured request, assert `TIMESTAMP_OUT_OF_WINDOW` and that the
   original row is still `DELIVERED`. Then re-present within the window and assert the receiver's
   event-id de-duplication rejects it.
6. **Per-attempt re-signing.** Script three retryable failures; capture all four requests; assert
   distinct timestamps and signatures with an identical event id and identical body bytes.
7. **Rotation.** Rotate with `switch_after_seconds = 3600`; deliver at `t+10 min` (verify under the
   previous secret, fail under the new); deliver at `t+2 h` (verify under the new, fail under the
   previous); advance past the retention window and assert the previous secret is destroyed. Attempt a
   second rotation while one is pending and assert rejection. Read the ADR and confirm it matches.
8. **Egress matrix.** Parametrise over the refused URL list in the acceptance checklist, at **both**
   create time and delivery time. Then run the rebinding stub. Then grep the whole file-scope for any
   flag, environment variable or configuration key that could disable the guard — there must be none.
9. **Retry and dead-letter.** Seven scripted retryable failures under the fake clock; assert the
   delays, then `DEAD_LETTER`, terminal, and the auto-disable after the configured consecutive count.
   Separately assert `3xx`, `401` and `422` are permanent.
10. **Secret exposure.** Grep the diff and the test output for the fixture secret outside
    `secret.txt` and the create/rotate responses. Run the raw-bytes assertion over the temp
    `.sqlite`/`-wal`.
11. **Canary.** Confirm the payload test uses an alert whose record carries a distinctive
    question/answer string, and that the assertion is a substring check over body, headers and logs.
12. **Kill switch.** Activate a `webhooks` switch; assert zero attempts and no attempt-count change;
    expire it; assert exactly one delivery.
13. **Route area.** Cross-tenant matrix, `If-Match` concurrency, idempotent create, endpoint cap,
    and `POST /{id}/test` behaviour (one request, no retry, rate limited).
14. `pnpm generate && pnpm generated:check`; then `git status --porcelain` — clean. Confirm
    `docs/adr/NNNN-webhook-secret-rotation.md` exists and its number does not collide on the default
    branch.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket file** (docs PR →
merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/16-monitor-alerts/README.md` (version +0.1 with a changelog line) **before** changing code.
Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**Foreseeable frictions, each with its exact writeback target:**

1. **A new webhook event type is needed** (`alert.digest`, `alert.resolved`, `correction.published`,
   …). → `schemas/events/**` is `FND-05`'s serial-owned tree and PRD §34.8 specifies only
   `alert.created`. Raise it **on `FND-05`** (its Feedback obligation 2 already defines the path),
   add the `blocked_by` edge in `docs/prd/breakdown-plan.md` §6.2, and record it in
   `docs/prd/16-monitor-alerts/README.md` **D8**. **Never** define an event schema inside this
   module. In particular, a change type that cannot be structured per PRD §8.8 must not be shipped as
   a raw HTML or text diff in a payload — that is a writeback (`WTCH-02`'s `UNCLASSIFIED` path plus a
   PRD change), not a local workaround.
2. **The rotation window semantics do not work for real receivers** (**Q-WTCH-7**). → Update
   `docs/adr/NNNN-webhook-secret-rotation.md` **first**, then this ticket and
   `docs/prd/16-monitor-alerts/README.md` **D9**. Emitting a second signature header, or a key id
   header, changes PRD §34.8's fixed header set and is a **PRD change** (§45.5) affecting every
   receiver and both SDKs — never a quiet addition.
3. **The signature input or header names cannot be produced** as PRD §34.8 states. → That overturns
   `MON-004` and every receiver's integration contract. Stop; the writeback target is `FND-05` plus a
   PRD change, per `FND-05`'s own escalation clause. Never ship a second, divergent signing scheme
   beside the specified one.
4. **The egress guard blocks a legitimate customer endpoint** (for example a corporate host resolving
   to a private range through a VPN). → Record the case in
   `docs/prd/16-monitor-alerts/README.md` **Q-WTCH-4**. Any allowance is a **security decision**
   requiring an ADR (`docs/adr/NNNN-outbound-egress-guard.md`) and, if it becomes shared behaviour, a
   plan change in `docs/prd/breakdown-plan.md` §4 for a shared egress package. Never add a per-tenant
   bypass flag.
5. **`DATA-07`'s `alert_delivery` cannot store the event id, the attempt schedule or the
   subscription's consecutive-failure count.** → Raise a `01-app-data` ticket, add the edge in
   `docs/prd/breakdown-plan.md` §5.2/§6.2 and record it here. Do not write `packages/database/**`
   (breakdown-plan **A3**, risk **R4**) and do not keep delivery state in worker memory, which loses
   idempotency across restarts.
6. **`DATA-03`'s field encryption cannot hold the signing secret**, or the PRD §39.6 *"webhook
   encryption key"* group is not wired. → That is `01-app-data` plus `18-ops-release` configuration.
   Raise both; record in `docs/prd/16-monitor-alerts/README.md`. **Never** store a signing secret in
   plaintext, and never fall back to the session secret.
7. **PRD §38.5's endpoint caps prove wrong for a pilot customer.** → They are initial defaults and
   are configuration; changing a shipped default is a **product/commercial change** (PRD §45.5,
   §24.3) needing founder approval, recorded in `docs/prd/16-monitor-alerts/README.md`.

**Escalation.** PRD §34.8's envelope, headers and signature input, PRD §8.8's HMAC/timestamp/
idempotent-id/rotation/bounded-retry set, and PRD §34.8's *"Full questions, facts, answers and source
excerpts are excluded by default"* are release requirements behind `MON-004` and `UAT-MON-02`. If any
is outright falsified, stop, raise an ADR under `docs/adr/`, write back to
`docs/prd/16-monitor-alerts/README.md` and `docs/prd/breakdown-plan.md` §5.17, and escalate to the
human before code lands. Never weaken the egress guard, never send an unsigned or unverifiably signed
delivery, and never place customer research content in a webhook payload.
