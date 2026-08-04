---
id: WTCH-09
title: Resend transactional-email provider adapter
module: 16-monitor-alerts
lane: 16-monitor-alerts
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [WTCH-04]
blocks: []
---

# WTCH-09 — Resend transactional-email provider adapter

Implements PRD §8.8, §24.1 and §39.6 (epic `E25-MONITOR`); breakdown-plan §5.17 lists this ticket's
PRD refs as *"§8.8, §24.1, §39.6, MON-003"*.
No ADR — the decision is already made in breakdown-plan **§8 `Q14` — Transactional email provider,
Status: CONFIRMED PROVIDER DECISION**; this is build ticket 9 of 9 against it. The durable ADR
`docs/adr/NNNN-transactional-email-provider.md` is **not** written by this ticket: §8 Q14 names
`WTCH-04` as the ticket carrying the ADR decision input, and `WTCH-04`'s Builder authors the file at
implementation time. `docs/adr/` is empty today (breakdown-plan §1 header, *"ADRs available: none"*),
so this ticket must not assume the file exists, and must not create it.
Parent sub-PRD: [16-monitor-alerts README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [WTCH-04 — Email delivery channel](WTCH-04-email-delivery-channel.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
the `EmailTransport` port, the transport-module registry, the idempotency key and the provider choice
all already exist; this adds one provider directory behind that port and decides nothing.

## Background + basis

**breakdown-plan §8 `Q14`, quoted in full — this is the decision, and it is settled.** It is quoted
rather than summarised because it is the only place the provider choice is recorded, and an
implementing agent must be able to execute this ticket without the planning conversation:

> **Q14 — Transactional email provider. Status: CONFIRMED PROVIDER DECISION.**
>
> *Owner: Founder. Resolving tickets: `WTCH-04` (the provider-neutral channel plus the ADR decision
> input) and `WTCH-09` (the Resend adapter, §5.17). PRD basis: §8.8, §24.1, §39.6. Blocking
> relationship: the email channel only; in-app and webhook delivery are unaffected.*
>
> - Provider: **Resend**, on the Resend Free transactional-email tier.
> - Expected MVP provider cost within the free allowance is A$0/month.
> - Current planning allowance: 3,000 emails/month, 100/day. Provider pricing and allowances are
>   external operational configuration that can change — they are not a permanent PRD guarantee.
> - Retry safety uses Resend's native idempotency-key support, keyed on the existing
>   `alert_delivery.id` or an equivalent stable delivery identifier.
> - The API key lives only in the production sealed-secret layer; the recommended variable name is
>   `RESEND_API_KEY`. It must never be committed, logged, or exposed to coding agents.
> - The sending domain must be verified with the correct DNS records.
> - Transactional email still must not contain customer questions, answers, evidence excerpts or
>   Research Record content.
> - Restore drills keep using `NullTransport`; tests keep using offline/fake/file transports.
> - The provider sits behind the existing `EmailTransport` port. A small typed HTTPS adapter is
>   sufficient — the Resend SDK is not mandatory.
> - The existing bounce/complaint/suppression-processing known gap remains open until a ticket
>   explicitly plans and implements it.

The register's standing note binds this ticket: *"A **confirmed** decision … is settled, and an
implementing agent must not re-litigate it, substitute its own preference for it, or treat it as a
suggestion. A Builder that believes a confirmed decision is falsified by what it finds in the code
uses the ticket's feedback obligation — writeback to this plan and the affected sub-PRD(s) first,
then the code — never a local substitution."*

**breakdown-plan §5.17 — this ticket's row, verbatim (the file-scope is the binding half):**

> | WTCH-09 | Resend transactional-email provider adapter | M |
> `apps/worker/src/handlers/notifications/email/providers/resend/**` — the Resend adapter behind the
> existing `EmailTransport` port; a subpath disjoint from `WTCH-04`'s remaining scope, and `WTCH-04`
> keeps the provider-neutral channel, the port and the transports | WTCH-04 | §8.8, §24.1, §39.6,
> MON-003 | A typed HTTPS Resend adapter with native idempotency keys, sealed-secret key handling and
> a verified sending domain, behind the existing port. |

and its preamble: *"`WTCH-04` and `WTCH-09` split the email tree along the `EmailTransport` port
(§8, Q14): `WTCH-04` owns the provider-neutral channel, the port and the transports; `WTCH-09` owns
only the Resend adapter subpath under it. The two write-sets are disjoint, and the `blocked_by` edge
orders them."*

**PRD §8.8 — the channel list and the payload limit:**

> Channels:
>
> - in-app;
> - email;
> - signed webhook.
>
> … **Payloads MUST avoid complete customer questions/answers by default.**

The payload sentence is a channel-independent privacy boundary in this module (sub-PRD **D6**,
`WTCH-04` deliverable 6). This adapter is the *last* place the message passes before it leaves the
host, so it must transmit exactly what the renderer produced and add nothing.

**PRD §24.1 — the budget the free tier has to fit inside:**

> | Domain/email/variance reserve | A$8–12 |
> | Total | A$42–50 |
>
> Cloudflare Paid Workers is not a default dependency. Actual provider billing MUST be monitored; the
> system MUST stop before exceeding the founder-funded ceiling.

§8 Q14's *"Expected MVP provider cost within the free allowance is A$0/month"* sits under that reserve
line. The allowance figures it quotes (3,000/month, 100/day) are **external operational
configuration**, not a PRD constant: this ticket must not encode them as a hard-coded product rule,
and must not implement its own spend circuit breaker — PRD §42.6's ledger and breaker are
`18-ops-release`/`22-internal-admin` machinery for hosted **model** spend.

**PRD §39.6 — where the key lives, verbatim:**

> Configuration layers are: committed safe defaults → environment-specific non-secret config →
> encrypted/sealed secret injection → internal feature flag. Production startup validates the complete
> schema and refuses unknown critical keys. Minimum secret groups are database field-encryption key,
> auth/session secret, S3 backup credential, S3 export credential, R2 read/promotion credential,
> **email credential**, model-provider/platform keys, webhook encryption key and release-verification
> public key. Offline signing and destructive backup credentials are never present on the host.

**PRD §20.2:** *"Coding agents MUST NOT receive production SSH, database, backup, signing or provider
credentials by default."* — which is why every criterion below is offline and why the suite must fail
if it ever reads a real key.

**PRD §21.1 — the controls this adapter is subject to:** *"Encrypted application secrets, hashed
API/webhook credentials and rotation/revocation"* and *"Source allowlists, HTTPS, redirect/final-domain
checks, private/link-local/metadata IP denial, DNS-rebinding protection, file/type/time/size/resource
limits"*. The provider endpoint is a **fixed, configured** host rather than customer input, but the
address policy still applies: a hostile or misconfigured DNS answer that resolves the provider host to
a loopback or metadata address must not be connected to.

**PRD §42.3 / `UAT-OPS-02`:** *"Restore app DB in isolated drill → Integrity/reference checks pass;
**no emails/webhooks/providers/real sessions fire**."* §8 Q14 keeps `NullTransport` as the restore-drill
transport; this ticket must not become reachable in that posture, and must not change how the
transport is selected.

**PRD §45.2** puts *"Lease loops and application-service orchestration"* in `apps/worker` and forbids
it *"Direct unscoped tenant SQL"*. This adapter performs neither database access nor orchestration: it
is a one-call HTTPS client behind a port. (`packages/model-gateway` owns *model* provider adapters;
an email provider is not a model provider and does not belong there — PRD §37.5 keeps the model
gateway away from email entirely.)

**The port and the registry already exist — this ticket implements against them, not around them.**
`WTCH-04` (merged before this ticket, `blocked_by`) ships, in
`apps/worker/src/handlers/notifications/email/`:

- `transport.ts` — the `EmailTransport` port:
  ```ts
  export interface EmailMessage {
    readonly to: string;
    readonly subject: string;
    readonly text: string;          // plain text, always present
    readonly html?: string;         // optional, sanitised, no remote resources
    readonly idempotencyKey: string; // = the alert_delivery row id
    readonly headers: Readonly<Record<string, string>>;
  }
  export type SendResult =
    | { readonly status: 'SENT'; readonly providerMessageId?: string }
    | { readonly status: 'RETRYABLE_FAILURE'; readonly code: string }
    | { readonly status: 'PERMANENT_FAILURE'; readonly code: string };
  export interface EmailTransport { send(message: EmailMessage): Promise<SendResult>; }
  ```
- `providers/index.ts` + `providers/provider-contract.ts` — `WTCH-04` deliverable 3's **transport-module
  registry**: it scans `providers/*/transport.ts` for a default export of `EmailTransportModule`
  (`{ name, create(context) }`) and selects one by the configured `transport` name, so a provider is
  added by **dropping in a directory** and diffs no file outside it. `EmailTransportContext` carries
  `{ fromAddress, sendTimeoutMs, secret(name), clock, logger, metrics }`; `secret()` reads the PRD
  §39.6 sealed-secret layer and is the **only** way this ticket may obtain a credential.
- `FileTransport` (the committed safe default), `NullTransport` (restore drills) and the test-only
  `FailingTransport`; the reserve → send → settle sequence (deliverable 4); the bounded exponential
  retry table and the `DEAD_LETTER` terminal state (deliverable 5); the content-minimised renderer
  (deliverable 6); and the channel configuration (deliverable 7).

**The idempotency key is fixed by the schema, not chosen here.** PRD §35.6: `alert`/`alert_delivery` —
*"idempotent `(alert, channel, destination)`"*; `DATA-07` deliverable 6 implements
`UNIQUE (alert_id, channel, destination)` with an append-only `recordAttempt` and a dead-letter
terminal state. `WTCH-04` deliverable 4 sets `idempotencyKey = <alert_delivery row id>` and
deliverable 4.4 requires a resumed attempt to re-send with the **same** key. §8 Q14 keys Resend's
native idempotency on exactly that identifier, so this adapter forwards the key it is given and never
mints one.

**Accepted caveats carried forward:**

- **Bounce, complaint and suppression processing stays out of scope and stays a known gap.** §8 Q14:
  *"The existing bounce/complaint/suppression-processing known gap remains open until a ticket
  explicitly plans and implements it."* It needs an inbound provider webhook and a suppression list,
  and no PRD section specifies either. Declared a non-goal below with its writeback path; do not
  invent it here as a side effect of having a real provider.
- **Provider allowances are operational configuration.** 3,000/month and 100/day are the current
  planning allowance in §8 Q14 and can change without a PRD change. This adapter surfaces
  provider rate-limit responses as retryable failures and counts them; it does not enforce a local
  quota and does not encode either number as a product rule.
- **The crash window is narrowed, not eliminated.** `WTCH-04` deliverable 4.4 documents the window
  between a successful provider call and the local status write. With Resend's native idempotency key
  a resumed attempt de-duplicates provider-side, which is *why* §8 Q14 names it; the residual (a
  provider that ignores or expires the key) stays documented rather than hidden, and is never "fixed"
  by writing `SENT` before the provider confirms.
- **The ADR does not exist yet.** It is `WTCH-04`'s file under breakdown-plan **A9** (per-file
  ownership, claimed by the creating ticket). This ticket cites §8 Q14 directly and does not wait for,
  create, or edit the ADR.

## Goal

Produce `apps/worker/src/handlers/notifications/email/providers/resend/**`: a single
`EmailTransportModule` named `resend` whose `create(context)` returns an `EmailTransport`
implementation that posts one message to Resend's HTTPS API using a small typed client (no SDK
dependency, no new lockfile entry), passes `WTCH-04`'s `idempotencyKey` as Resend's native
idempotency key, reads `RESEND_API_KEY` only through the sealed-secret accessor, refuses to send from
an address outside the configured verified sending domain, maps every provider outcome onto
`WTCH-04`'s `SendResult` union without retrying internally, and logs nothing that identifies a
recipient or carries message content. Completion is mechanically checkable: the whole suite runs
against an in-process fake provider on loopback with a literal fake key; the recorded request fixture
shows the exact headers and JSON body sent; two attempts for the same delivery carry the identical
idempotency key; the production address policy refuses the fake's own address; selecting the module
adds **zero** diff outside this directory; and no test reads an environment variable or reaches the
network.

## Non-goals

- **No change to the channel, the port, the transports, the renderer, the recipient resolver, the
  retry table or the channel configuration** — all of that is `WTCH-04`
  (`apps/worker/src/handlers/notifications/email/**` outside `providers/resend/**`), merged before
  this ticket. This ticket **implements an existing interface**; if the interface is wrong, that is a
  writeback to `WTCH-04`, not a local edit (Feedback obligation 1).
- **No ADR file** — `docs/adr/NNNN-transactional-email-provider.md` is `WTCH-04`'s under breakdown-plan
  **A9** and §8 Q14. Do not create, number, or edit it here.
- **No retry, backoff, scheduling or dead-lettering inside the adapter** — `WTCH-04` deliverable 5 owns
  the bounded exponential schedule and the terminal state. A second retry loop inside a transport
  would silently multiply attempts against `MON-004`'s bounded budget.
- **No second delivery path, no direct `alert_delivery` write, no database access at all** — `WTCH-04`
  reserves, settles and records; `01-app-data`/`DATA-07` owns the table and the repository
  (breakdown-plan **A3**).
- **No bounce, complaint, unsubscribe or suppression processing, and no inbound provider webhook** —
  the standing known gap in §8 Q14. It is a **product change** (PRD §45.5) plus a `DATA-07` column and
  a new ticket; see Feedback obligation 4.
- **No production secret material, environment file, DNS record or infrastructure change** —
  `18-ops-release` owns `infra/**` and the sealed-secret layer; the DNS verification of the sending
  domain is an operational prerequisite recorded in this directory's `README.md`, and the runbook entry
  that carries it out belongs to `18-ops-release` (`docs/runbooks/**`, PRD §42.7).
- **No dependency on the Resend SDK or any HTTP client package** — §8 Q14: *"A small typed HTTPS
  adapter is sufficient — the Resend SDK is not mandatory."* Root manifests and `pnpm-lock.yaml` are
  `00-foundation`/`FND-01`'s and PRD §44.3 serial-owned; adding a dependency is a writeback, not a
  side effect (breakdown-plan risk **R7**).
- **No webhook or digest channel** — `WTCH-05` (`notifications/webhook/**`), `WTCH-06`
  (`notifications/digest/**`). `WTCH-06` reaches this provider only through `WTCH-04`'s port.
- **No shared outbound-egress package** — sub-PRD **Q-WTCH-4** records the duplication of the address
  policy; creating a shared package is a plan change, not a side effect of this ticket.
- **No spend circuit breaker, cost ledger or usage metering** — PRD §42.6 is `18-ops-release` /
  `22-internal-admin` machinery for hosted model spend. This ticket emits content-free counters only.
- **No customer-facing email preference UI or per-watchlist recipient list** — `13-identity-surface`
  owns `/settings/*`; recipient resolution is `WTCH-04` deliverable 2.

## File-scope (write-owns)

- `apps/worker/src/handlers/notifications/email/providers/resend/**` — and nothing else. Inside it:
  `transport.ts` (the default-exported `EmailTransportModule`), the typed HTTPS client, the
  request/response mapping, the local address check, `config.ts`, `README.md` (the operational
  prerequisites), and the tests and fixtures under
  `apps/worker/src/handlers/notifications/email/providers/resend/__tests__/**`.

Does not touch:

- `apps/worker/src/handlers/notifications/email/**` **outside** `providers/resend/**` — `WTCH-04`
  (merged before this ticket): `channel.ts`, `transport.ts`, `recipients.ts`, `render.ts`, `config.ts`,
  `providers/index.ts`, `providers/provider-contract.ts`, the `File`/`Null`/`Failing` transports, and
  `WTCH-04`'s own `__tests__/**`. They are **imported, never edited**.
- `apps/worker/src/handlers/notifications/{index.ts,registry.ts,channel-contract.ts}` — `WTCH-03`
  (sub-PRD **D2**); `notifications/{webhook,digest}/**` — `WTCH-05`, `WTCH-06`.
- `apps/worker/src/handlers/{alerts,change-matching,maintenance}/**` and
  `apps/worker/src/{main.ts,runtime,queues}/**` — `WTCH-03`, `WTCH-02`, `RUNT-04`.
- `apps/api/**`, `apps/web/**` — other tickets in this module and other modules.
- `packages/database/**` (**A3**), `packages/contracts/**`, `packages/domain/**`,
  `packages/observability/**`, `packages/jobs/**`, `packages/model-gateway/**`.
- `docs/adr/**` — the transactional-email ADR is `WTCH-04`'s file (**A9**, §8 Q14).
- `infra/**` (including every sealed-secret definition and any production credential material —
  `18-ops-release`), `docs/runbooks/**` (`18-ops-release`, PRD §42.7), `schemas/**`, `tests/**`, root
  manifests and lockfiles (`FND-01`, PRD §44.3 serial-owned).

**Serial-safety analysis.** First decomposition — breakdown-plan §1 records `phase: 1`, nothing merged
and nothing in flight. `apps/worker/src/handlers/notifications/email/providers/resend/` does not exist
before this ticket and is written by no other ticket in the plan: breakdown-plan §5.17 gives this
subpath to `WTCH-09` **alone** and simultaneously narrows `WTCH-04` to
`apps/worker/src/handlers/notifications/email/**` *"(except `providers/resend/**`)"*, so the two
write-sets are genuinely disjoint — `WTCH-04` states the same exclusion in its own file-scope section,
and neither ticket can satisfy its acceptance by writing into the other's paths. The `blocked_by`
edge (`WTCH-04 --> WTCH-09`, breakdown-plan §6.2) also removes any question of concurrency between
them: `WTCH-04` is merged before this ticket starts. The enclosing `notifications` area is a single
handler area under `RUNT-04`'s contract, resolved by sub-PRD **D2** (its shell belongs to `WTCH-03`,
strictly earlier in the DAG), and the enclosing `email` channel directory is `WTCH-04`'s, already
merged. This ticket sits in intra-module wave 4 alongside `WTCH-06`
(`notifications/digest/**` — breakdown-plan §7: *"`[WTCH-01, WTCH-02] → [WTCH-03, WTCH-07] →
[WTCH-04, WTCH-05, WTCH-08] → [WTCH-06, WTCH-09]`"*), a disjoint sibling subtree it neither reads for
write purposes nor imports. Because `WTCH-04`'s registry discovers providers by directory scan,
adding this directory produces **zero** diff outside it — the property `RUNT-04` contract item 6
guarantees and acceptance verifies.

## Deliverables

1. **`transport.ts` — the module the registry finds.** Default export of `WTCH-04`'s
   `EmailTransportModule`:
   - `name: 'resend'` — it must equal this directory's name, which is what the configured
     `transport: "resend"` value selects. A mismatch is a startup failure with a named error, not a
     silent no-op.
   - `create(context: EmailTransportContext): EmailTransport` — resolves configuration (deliverable 2),
     obtains the API key through `context.secret('RESEND_API_KEY')` (deliverable 3), and returns an
     object whose only method is `send(message: EmailMessage): Promise<SendResult>`.
   - The module is discovered by `WTCH-04`'s `providers/index.ts` scan. **No file outside this
     directory is edited to register it**; if registration turns out to require editing `WTCH-04`'s
     files, stop and use Feedback obligation 1.
2. **`config.ts` — validated at construction, layered per PRD §39.6.**
   - `base_url` — committed safe default `https://api.resend.com`. It exists so tests can point at the
     in-process fake (deliverable 9); a non-`https` value is rejected unless the injected
     `AddressPolicy` is the test one, and the default must be asserted by a test so a fixture cannot
     quietly become the production endpoint.
   - `verified_sending_domain` — required when this module is selected. `context.fromAddress`
     (`WTCH-04` deliverable 7's `from_address`) must be inside it, case-insensitively, or construction
     fails with a named error. This is the mechanical half of §8 Q14's *"The sending domain must be
     verified with the correct DNS records"* — the code cannot verify DNS, but it can refuse to send
     from an address the operator has not declared verified.
   - `max_response_bytes` — a bounded read of the provider response (a PRD §39.6 layer-1 default
     declared here; the **bound** is the requirement, and the Builder records the chosen number in the
     file with a comment saying it is an implementation default, not a PRD constant).
   - Timeout is **not** redefined here: the adapter uses `context.sendTimeoutMs` from `WTCH-04`
     deliverable 7, so there is one timeout for the channel.
   - Unknown keys fail startup (PRD §39.6 *"refuses unknown critical keys"*). No secret is read from
     configuration, ever.
3. **Credential handling (§8 Q14, PRD §39.6, §20.2, §21.1).**
   - The key is read exactly once, at `create()` time, through `context.secret('RESEND_API_KEY')`.
     If the module is selected and the secret is absent, construction **fails closed** with a named
     error that does not include any part of the value — a channel that starts without a credential
     and discovers it at send time would burn attempt slots from `WTCH-04`'s bounded budget.
   - The value is held in a non-enumerable field, never placed on an object that is logged,
     serialised, put in an error message, attached to a metric label, or included in a fixture.
   - `toString`/`toJSON` on the transport (and on any options object holding the key) return a
     redacted form. A test asserts the literal fake key never appears in captured logs, thrown errors,
     metrics or recorded fixtures.
   - **No `.env` file, no committed key, no default value, no fallback to an environment variable read
     directly by this directory.** The sealed-secret accessor is the only source (PRD §39.6 layer 3).
4. **The typed HTTPS client — one request, no SDK.** `client.ts`:
   - `POST <base_url>/emails` with headers `Authorization: Bearer <key>`,
     `Content-Type: application/json`, `Idempotency-Key: <message.idempotencyKey>` (deliverable 5) and
     the product `User-Agent` used elsewhere in the module.
   - Body built **only** from the `EmailMessage` the port hands over:
     `{ from: <context.fromAddress>, to: [message.to], subject: message.subject, text: message.text,
     html?: message.html, headers?: message.headers }`. The adapter **never re-renders, re-wraps,
     truncates, enriches, or adds a tracking parameter, pixel or link** — `WTCH-04` deliverable 6 is the
     only renderer, and it is the boundary PRD §8.8's payload sentence is enforced at.
   - Exactly **one** HTTP attempt per `send()` call. No internal retry, no backoff, no queueing
     (non-goal 3).
   - The request is aborted at `context.sendTimeoutMs`; the response body read is bounded by
     `max_response_bytes` and anything beyond it is discarded.
   - **Redirects are not followed** (a `3xx` from a provider API is a misconfiguration, classified
     permanent) and no proxy is honoured from the environment unless explicitly configured.
   - Implemented with the runtime's built-in HTTPS/fetch capability. **No new dependency**; a test
     asserts `pnpm-lock.yaml` is unchanged by this ticket.
5. **Native idempotency (§8 Q14, `MON-004`).** `Idempotency-Key` is set to `message.idempotencyKey`
   **verbatim** — which `WTCH-04` deliverable 4 defines as the `alert_delivery` row id. The adapter
   never generates, derives, hashes, truncates or refreshes it, and never omits it. A resumed attempt
   after a crash therefore presents the identical key (`WTCH-04` deliverable 4.4), which is exactly
   what makes the crash window safe with this provider. If the key is empty, `send()` fails
   `PERMANENT_FAILURE` with a named code rather than sending an unkeyed message.
6. **Outcome mapping onto `SendResult` — the classification table is the contract.** It is committed
   as a table in the file (not scattered `if`s), because `WTCH-04` deliverable 5 retries on exactly one
   of these values:

   | Provider outcome | `SendResult` | Notes |
   |---|---|---|
   | `2xx` | `SENT` | `providerMessageId` = the provider's message id when present; absence is not an error |
   | `429` | `RETRYABLE_FAILURE` | code `RATE_LIMITED`; `Retry-After` is recorded in the metric and **surfaced to `WTCH-04`**, never slept on inside the adapter |
   | `408`, `5xx` | `RETRYABLE_FAILURE` | code from the status |
   | connection error, DNS failure, TLS failure, timeout, aborted read | `RETRYABLE_FAILURE` | code names the cause; TLS failure is retryable only because a transient handshake failure is common — a certificate rejection is logged distinctly |
   | `401`, `403` | `PERMANENT_FAILURE` | code `AUTH_REJECTED`; the key is invalid or revoked — retrying cannot help and would burn the attempt budget |
   | `422` and any other `4xx` | `PERMANENT_FAILURE` | code from the status plus the provider's error identifier **if it is an enum-like token**; free-form provider text is never propagated into a stored code |
   | `3xx` | `PERMANENT_FAILURE` | redirects are refused (deliverable 4) |
   | address-policy refusal (deliverable 7) | `PERMANENT_FAILURE` | code `EGRESS_REFUSED` |

   Anything unmapped is `RETRYABLE_FAILURE` with a code naming the status: an unknown outcome must not
   be reported as `SENT`, and must not silently become terminal.
7. **Address policy for a fixed host (PRD §21.1, sub-PRD Q-WTCH-4).** `address-policy.ts`:
   - the scheme must be `https` in the production policy;
   - the configured host is resolved and **every** resolved address is checked against the denial set —
     loopback, private (RFC 1918 and IPv6 ULA), link-local (including `169.254.0.0/16` and `fe80::/10`),
     multicast, unspecified and cloud-metadata (`169.254.169.254`, `fd00:ec2::254`) — mirroring
     PRD §37.4's list as `WTCH-05`'s guard does;
   - the connection is made to the pinned resolved address with the original Host/SNI, so a DNS
     rebinding between check and connect cannot redirect the request;
   - the policy is **injectable** so deliverable 9's fake can be reached on loopback, and a test asserts
     the **production** policy refuses that same address. The guard is never disabled by a global flag
     or an environment variable — a bypassable guard is not a guard.
   - The file header states, with a pointer to sub-PRD **Q-WTCH-4**, that this duplicates `WTCH-05`'s
     policy class **by design**: `WTCH-05` may not be merged when this ticket runs (there is no
     `blocked_by` edge between them), and importing across sibling channel subtrees would couple two
     independently-owned trees. Consolidation is a plan change, not a local refactor.
8. **Observability (PRD §22, content-free).** `email_provider_requests{provider="resend",result}`,
   `email_provider_latency_ms`, `email_provider_rate_limited`, `email_provider_egress_refused{reason}`.
   Never log or label: the API key, the recipient address (a stable hash plus the domain only, as
   `WTCH-04` deliverable 9 already requires), the subject, the body, or the provider's raw response
   body. The provider message id may be logged — it identifies a delivery, not content.
9. **Offline fake provider — the only endpoint any test uses.** `__tests__/fake-resend.ts`: an
   in-process HTTP listener on an ephemeral loopback port that records
   `(method, path, headers, rawBody, receivedAt)` and replays scripted responses (`2xx`, `429` with and
   without `Retry-After`, `5xx`, `422`, `401`, a slow response that trips the timeout, an oversized
   body). It uses a **literal fake key committed in the fixture**, never an environment variable. It is
   constructed by the test, injected through `base_url` plus the test `AddressPolicy`, and is
   unreachable from the production configuration.
10. **Committed fixtures** under `.../resend/__tests__/fixtures/`: `request.headers.txt` and
    `request.body.json` — the exact headers and JSON the adapter sends for `WTCH-04`'s golden
    `alert.json` message — plus `responses/*.json` for each scripted outcome. These are what a reviewer
    reads to confirm §8 Q14 and PRD §8.8 compliance without running anything: the headers show the
    idempotency key and a redacted authorization line, and the body shows structured facts and links
    only.
11. **`README.md` inside this directory — the operational prerequisites, stated once.** It records:
    the sending domain must be verified with the provider's required DNS records **before** the module
    is selected in production, and that this is an `18-ops-release` operational step, not a code step;
    that `RESEND_API_KEY` is supplied only through the sealed-secret layer (PRD §39.6) and must never be
    committed, logged or given to a coding agent (PRD §20.2); that the Free-tier allowances quoted in
    breakdown-plan §8 Q14 (3,000/month, 100/day) are **external operational configuration that can
    change and are not a PRD guarantee**; and that bounce/complaint/suppression processing is a
    **known open gap** (§8 Q14) which this adapter does not implement. No key, no domain-specific DNS
    value and no account identifier is committed in it.
12. **Selection remains `WTCH-04`'s.** This ticket ships **no** default that makes `resend` active:
    the committed safe default stays `file` (`WTCH-04` deliverable 7), restore drills stay
    `NullTransport` (§8 Q14, PRD §42.3), and production selects `resend` through the
    environment-specific configuration layer. A test asserts that with `WTCH-04`'s default
    configuration this module is **not** constructed and no credential is read.

## Acceptance checklist (classified)

- [ ] `[fixture]` **Offline provider replay**: sending `WTCH-04`'s golden `alert.json` message through
      this transport against the in-process fake reproduces `request.headers.txt` and
      `request.body.json` exactly, and the fake records exactly **one** request. **No test requires the
      live Resend API, a real API key, a verified domain or any network access** (§8 Q14 *"tests keep
      using offline/fake/file transports"*; PRD §42.3 / `UAT-OPS-02`; epic `E25-MONITOR` exit evidence
      *"MON tests and delivery replay"*)
- [ ] `[machine]` **Native idempotency (§8 Q14)**: the `Idempotency-Key` header equals
      `message.idempotencyKey` byte for byte, which equals the `alert_delivery` row id; two attempts for
      the same delivery — including the crash-window resume of `WTCH-04` deliverable 4.4 — present the
      **identical** key; an empty key yields `PERMANENT_FAILURE` and sends nothing
- [ ] `[machine]` **One attempt per call**: for every scripted failure the fake records exactly one
      request per `send()` — the adapter contains no retry, backoff or sleep, asserted both by the
      request count and by a scan of the directory for timer/sleep constructs (`WTCH-04` deliverable 5
      owns the schedule)
- [ ] `[machine]` **Outcome mapping**: a parametrised test over deliverable 6's table asserts each
      provider outcome maps to the stated `SendResult` and code, and that an unmapped status becomes
      `RETRYABLE_FAILURE` rather than `SENT` (`MON-004` *"retryable and idempotent"*)
- [ ] `[machine]` **`429` handling**: `RETRYABLE_FAILURE` with `RATE_LIMITED`, the `Retry-After` value
      surfaced to the caller and counted, and **no sleep inside the adapter** (deliverable 6)
- [ ] `[machine]` **Credential hygiene (§8 Q14, PRD §39.6, §20.2)**: the key is obtained only through
      `context.secret('RESEND_API_KEY')`; selecting the module without the secret fails construction
      with a named error carrying no fragment of the value; the literal fake key appears in **no**
      log line, error, metric label, fixture or recorded request file (the fixture's authorization line
      is redacted); a scan of the whole file-scope finds no committed key, `.env` file or direct
      `process.env` read
- [ ] `[machine]` **Verified sending domain (§8 Q14)**: a `from_address` outside
      `verified_sending_domain` fails construction with a named error; a matching one succeeds; the
      check is case-insensitive and cannot be disabled by configuration
- [ ] `[machine]` **Egress policy (PRD §21.1, §37.4)**: the **production** policy refuses the fake's
      loopback address, a private address, a link-local address and `169.254.169.254`; refuses a
      non-`https` `base_url`; does not follow a `3xx`; connects to the pinned resolved address; and
      cannot be bypassed by an environment variable (deliverable 7)
- [ ] `[machine]` **Default endpoint**: with committed defaults `base_url` is the provider's HTTPS API
      endpoint — a test asserts the default so a test fixture URL can never silently become the
      production one (deliverable 2)
- [ ] `[machine]` **Payload minimisation (PRD §8.8, §8 Q14)**: the recorded request body contains only
      what `WTCH-04`'s renderer produced — asserted by byte-equality with the golden body **and** by a
      canary fixture whose research record carries a distinctive question and answer string that must
      not appear in the request, the headers, the logs or the metrics; the adapter adds no tracking
      pixel, tracking link, or extra header carrying content
- [ ] `[machine]` **Restore-drill posture unchanged (§8 Q14, PRD §42.3)**: with `WTCH-04`'s committed
      default configuration this module is not constructed, no credential is read and no socket is
      opened; `NullTransport` remains the restore-drill transport and this ticket changes nothing about
      how it is selected (deliverable 12)
- [ ] `[machine]` **Zero diff outside this directory**: the module is discovered by `WTCH-04`'s provider
      registry with **no** file under `apps/worker/src/handlers/notifications/` outside
      `email/providers/resend/` modified, verified with `git status --porcelain` after the suite
      (`RUNT-04` contract item 6; breakdown-plan §5.17's disjointness claim)
- [ ] `[machine]` **No dependency added (§8 Q14 *"the Resend SDK is not mandatory"*)**: `package.json`
      files and `pnpm-lock.yaml` are unchanged by this ticket — asserted against the merge base
      (PRD §44.3 serial-owned lockfiles; breakdown-plan risk **R7**)
- [ ] `[machine]` **Architecture (PRD §45.2)**: no database import of any kind, no `packages/database`
      or repository reference, no import from `notifications/{webhook,digest}/**`, and no import of
      `packages/model-gateway` — the only surfaces are `WTCH-04`'s port types and the runtime HTTPS
      client
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3)
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable (PRD §45.3)
- [ ] `[machine]` **Documentation deliverable**: this directory's `README.md` states the DNS
      verification prerequisite, the sealed-secret rule, that the §8 Q14 allowances are external
      operational configuration rather than a PRD guarantee, and that bounce/complaint/suppression
      processing remains an open gap — and contains no key, account identifier or environment-specific
      DNS value (deliverable 11)
- [ ] `[human]` Gate 2 founder review: read `request.headers.txt` and `request.body.json` and confirm
      the message that would leave the host carries no customer research content and no credential
      (PRD §43.4 founder test queue; CLAUDE.md Gate 2). **Not required to merge** — the automated
      criteria above are
- [ ] `[human]` **Live-send verification is an operator step, not a merge gate**: the first real send
      from the verified domain with the production key is performed by the Founder in the deployment
      window and its outcome recorded in `docs/prd/16-monitor-alerts/README.md`. **Not required to
      merge**, and no test may be changed to depend on it
- [ ] Requirement traceability, declared explicitly so coverage is not assumed: breakdown-plan §5.17
      lists **MON-003** in this row's PRD refs, while the delivery guarantees this adapter must not
      weaken — idempotent, retryable, dead-lettered delivery — are **MON-004**'s and are owned by
      `WTCH-04`, `WTCH-05` and `WTCH-06`. This ticket **adds no requirement coverage of its own**: it
      must leave both untouched. If that traceability is wrong, it is a breakdown-plan §5.17 writeback
      (Feedback obligation 6), never a local reinterpretation
- [ ] `[machine]` PR states the PRD §45.4 items: requirement **MON-003** per breakdown-plan §5.17 (with
      the **MON-004** relationship above), epic `E25-MONITOR`; user-visible change and non-goals
      (alert emails can leave the host once the operator selects this transport); schema/API/event
      compatibility impact (none — no HTTP surface, no event, no schema); tenant/PII/security impact
      (recipient addresses leave the host to the provider by design; no research content; the API key
      exists only in the sealed-secret layer and appears in no log, fixture or error); source/licence
      impact (none); cost/memory/latency impact (**§8 Q14** — expected A$0/month within the Resend Free
      allowance, which sits under PRD §24.1's *"Domain/email/variance reserve | A$8–12"* line; the
      quoted 3,000/month and 100/day allowances are external operational configuration that can
      change); rollback path (revert the directory and set `transport` back to `file`/`null` — the
      channel keeps working offline and alerts stay in-app); known gaps (bounce/complaint/suppression
      processing per §8 Q14; the `WTCH-04` deliverable 4.4 crash window, now covered provider-side by
      the native idempotency key)

## Test plan

Reviewer steps. Every step is offline and deterministic: the in-process fake provider on loopback, a
literal fake key from the fixture, fake clock, injected address policy, committed fixtures. **No live
Resend API, no real API key, no verified domain, no network.** A step that cannot run with the network
disabled is a defect in this ticket, not in the environment.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter <the apps/worker package name>`; suites under
   `apps/worker/src/handlers/notifications/email/providers/resend/__tests__/`.
3. **Harness.** Copy `WTCH-04`'s suite construction (injected transport context, fake clock, committed
   golden message) and `WTCH-05`'s `__tests__/receiver.ts` construction for the in-process listener and
   the injectable address policy. The transport is always constructed by the test through
   `create(context)`; it is never selected from production configuration inside a test.
4. **Read the fixtures against the decision.** Compare `request.headers.txt` with §8 Q14: an
   `Idempotency-Key` is present and equals the delivery id; the authorization line is redacted; the
   endpoint is the configured HTTPS API. Compare `request.body.json` with `WTCH-04`'s
   `expected-subject.txt`/`expected-body.txt` — the same subject and body, unmodified, plus the
   `from` address inside the verified domain, and nothing else.
5. **Canary.** Confirm the fixture's research record carries a distinctive question/answer string and
   that the suite asserts its absence from the request body, headers, logs and metrics.
6. **Idempotency.** Send once; capture the key. Simulate `WTCH-04` deliverable 4.4's crash-window
   resume; capture again; assert the two keys are identical and equal to the `alert_delivery` row id.
   Then assert an empty key never reaches the wire.
7. **One attempt.** For each scripted failure (`429`, `500`, `422`, `401`, timeout), assert the fake
   recorded exactly one request per `send()` call, and grep the directory for sleep/timer/backoff
   constructs — there must be none.
8. **Mapping matrix.** Run the parametrised table from deliverable 6 and assert both `status` and
   `code` for every row, including the unmapped-status default.
9. **Secrets.** Run with the secret absent and assert construction fails with a named error. Capture all
   logs, errors and metrics during the whole suite and assert the fake key string appears nowhere.
   Grep the entire file-scope for anything resembling an API key, a `.env` file or a direct
   `process.env` read — there must be none.
10. **Sending domain.** Configure a `from_address` outside `verified_sending_domain` and assert
    construction fails; configure a matching one and assert it succeeds; assert the check cannot be
    turned off.
11. **Egress.** Point the **production** policy at the fake's loopback address and assert refusal; repeat
    for a private address, a link-local address and `169.254.169.254`. Assert a `http://` `base_url` is
    refused and a `3xx` is classified permanent. Assert no environment variable can bypass the policy.
12. **Defaults.** Assert `base_url`'s committed default is the provider's HTTPS API endpoint, and that
    with `WTCH-04`'s default channel configuration this module is not constructed and no credential is
    read (deliverable 12).
13. **Dependencies.** `git diff --stat <merge-base>` — assert no `package.json` and no `pnpm-lock.yaml`
    change.
14. **Registration.** Confirm `git status --porcelain` is clean after the suite and that the diff
    modifies no file under `apps/worker/src/handlers/notifications/` outside
    `email/providers/resend/`.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket file** (docs PR →
merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/16-monitor-alerts/README.md` (version +0.1 with a changelog line) **before** changing code.
Silent divergence is an incomplete ticket (CLAUDE.md, issue #53). breakdown-plan §8 Q14 is a
**confirmed** decision: it is not re-opened by this ticket, and a belief that it is falsified goes
through the writeback path below, never through a local substitution.

**Foreseeable frictions, each with its exact writeback target:**

1. **`WTCH-04`'s `EmailTransport` port or its provider registry cannot express what the provider needs**
   — for example the provider requires a field the `EmailMessage` shape has no room for, or the
   registry cannot pass the sealed-secret accessor. → The writeback target is **`WTCH-04`'s
   deliverable 3** plus this ticket: agree the changed surface in both ticket files (and
   `docs/prd/16-monitor-alerts/README.md` **D11**/**D14** if the module contract changes) **before**
   editing a single file outside this directory. Do **not** widen this ticket's file-scope, and do not
   duplicate the port locally — two ports means two payload-minimisation boundaries and one of them
   will drift.
2. **Resend's idempotency-key semantics differ from what §8 Q14 assumes** — the key expires, is scoped
   differently, or is not honoured for this endpoint. → Record the **measured** behaviour in
   `docs/prd/16-monitor-alerts/README.md` **D11** and in the consequences section of the ADR
   `WTCH-04` authors (`docs/adr/NNNN-transactional-email-provider.md`), and update this ticket's
   deliverable 5. Do **not** compensate by writing `SENT` before the provider confirms, and do not mint
   a different key: that trades a rare duplicate for a silent loss, which `MON-004` does not permit.
3. **The provider proves unusable** — the free tier cannot be used for this workload, the domain cannot
   be verified, or the API is incompatible with a no-SDK client. → That contradicts a **confirmed**
   register entry. Stop. Write the evidence back to `docs/prd/breakdown-plan.md` §8 **Q14** and
   `docs/prd/16-monitor-alerts/README.md`, raise it for re-review (a provider change is an
   **architecture decision** under PRD §45.5 and re-writes the ADR `WTCH-04` owns), and escalate to the
   human **before** code lands. Never quietly substitute a different provider, and never add an SDK to
   make it work without recording the dependency decision.
4. **Bounces, complaints or suppressions make delivery unreliable.** → It is the standing known gap in
   §8 Q14. Record it in `docs/prd/16-monitor-alerts/README.md`; the inbound provider webhook, the
   suppression table and the member-notification consequences are a **product change** (PRD §45.5) plus
   a `01-app-data`/`DATA-07` column and a new ticket in `docs/prd/breakdown-plan.md` §5.17 and §6.2.
   Never suppress silently in application memory, and never drop a recipient without a recorded reason.
5. **The provider's rate limit is hit in normal operation.** → Surface it as `RATE_LIMITED` and let
   `WTCH-04`'s bounded schedule do its work; record the observation (and the allowance in force) in
   `docs/prd/16-monitor-alerts/README.md`. Changing the retry table is `WTCH-04`'s decision, a
   **benchmark-selected configuration** change under PRD §45.5 needing the measurement in the PR's
   cost/latency line (PRD §45.4). Do **not** add a local queue, sleep or token bucket inside this
   adapter.
6. **The requirement traceability in breakdown-plan §5.17 (MON-003) proves wrong for this ticket.** →
   That is a **plan** change: raise it against `docs/prd/breakdown-plan.md` §5.17 and, once merged,
   update this ticket and `docs/prd/16-monitor-alerts/README.md` §7/§8. Do not silently re-label the
   requirement in the PR — the sub-PRD's acceptance section is what maps `MON-*` coverage to tickets.

**Escalation.** §8 Q14's credential rule (*"never be committed, logged, or exposed to coding agents"*),
its content rule (*"Transactional email still must not contain customer questions, answers, evidence
excerpts or Research Record content"*) and PRD §8.8's payload sentence are release requirements, not
preferences. If any of them cannot hold against the real provider, stop, write back to
`docs/prd/16-monitor-alerts/README.md` and `docs/prd/breakdown-plan.md` §8, and escalate to the human
before code lands. Never ship a provider path that can carry customer research content, never log a
credential, and never mark a delivery successful that the provider has not accepted.
