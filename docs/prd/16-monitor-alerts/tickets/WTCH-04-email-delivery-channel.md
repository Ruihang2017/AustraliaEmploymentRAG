---
id: WTCH-04
title: Email delivery channel
module: 16-monitor-alerts
lane: 16-monitor-alerts
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [WTCH-03]
blocks: [WTCH-06, WTCH-09]
---

# WTCH-04 — Email delivery channel

Implements PRD §8.8 and §16.2, requirement **MON-004** (epic `E25-MONITOR`).
No ADR yet — the decision is already made in PRD §8.8 (email is one of the three channels; delivery is
idempotent and carries no complete customer question or answer) and PRD §35.6 (`alert_delivery` is
idempotent per `(alert, channel, destination)`); this is build ticket 4 of 9 against it. The
**provider** is settled by breakdown-plan §8 **Q14** (*"Transactional email provider. Status:
CONFIRMED PROVIDER DECISION"* — Resend), and §8 Q14 names **this ticket** as the one carrying that
decision's **ADR decision input**: this ticket stays provider-neutral, ships the port and the offline
transports, and authors `docs/adr/NNNN-transactional-email-provider.md` (deliverable 11). `docs/adr/`
is empty today (breakdown-plan §1 header, *"ADRs available: none"*), so the ADR does not exist until
this ticket's Builder writes it. The Resend adapter itself is **`WTCH-09`**, which lands behind the
port this ticket ships.
Parent sub-PRD: [16-monitor-alerts README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [WTCH-03 — Alert creation, impact marking and alert routes](WTCH-03-alert-creation-impact-marking-and-alert-routes.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
the channel contract, the queue class and the idempotency key all already exist; this adds one
channel directory behind a port.

## Background + basis

**PRD §8.8 — the channel list and the payload limit:**

> Channels:
>
> - in-app;
> - email;
> - signed webhook.
>
> Webhook delivery MUST use HMAC-SHA256 signatures, timestamps, idempotent event IDs, secret rotation
> and bounded exponential retry. **Payloads MUST avoid complete customer questions/answers by
> default.** A single detected source change MUST fan out to matching watchlists rather than create
> one crawler per watchlist.

The payload sentence is written about webhooks but is a channel-independent privacy boundary: PRD
§10.2 (*"Customer queries and records MUST NOT be used for … manual product analysis by default"*),
§22 (logs *"MUST exclude research/evidence content, PII text, credentials"*) and §37.3's content
retention matrix all point the same way. This ticket applies it to email by construction.

**PRD §33.4 step 8:** *"Outbox delivers in-app/email/webhook idempotently."*

**Requirement `MON-004`** (PRD §30.2), verbatim:

> | MON-004 | Email/webhook delivery is retryable and idempotent | Monitor settings | webhook
> endpoints | App | **Signature/replay/retry/dead-letter tests pass** |

The signature and replay halves are `WTCH-05`'s; **retry and idempotency for email are this
ticket's**.

**The idempotency key is fixed by the schema.** PRD §35.6: `alert`/`alert_delivery` — *"idempotent
`(alert, channel, destination)`"*. `DATA-07` deliverable 6 implements it:

> `alert_delivery` records channel, destination, attempt, provider status, with
> `UNIQUE (alert_id, channel, destination)` … `recordAttempt` is append-only per attempt with a
> bounded attempt counter and a dead-letter terminal state.

**The queue class is fixed (PRD §39.5):** `notifications` — *"email/webhook/digest"*, *"2 independent
leases"*, *"bounded, does not consume research slot"*.

**Secrets (PRD §39.6):** the minimum secret groups include an *"email credential"*; configuration
layers are *"committed safe defaults → environment-specific non-secret config → encrypted/sealed
secret injection → internal feature flag"* and *"Production startup validates the complete schema and
refuses unknown critical keys"*. No credential is committed.

**Restore drills must not send (PRD §42.3 / `UAT-OPS-02`):** *"Restore app DB in isolated drill →
Integrity/reference checks pass; **no emails/webhooks/providers/real sessions fire**."* `RLSE-09`
builds that isolated environment; this ticket must make "send nothing" a first-class, configurable
transport rather than an accident.

**The provider is decided, and this ticket is deliberately still provider-neutral.** breakdown-plan
§8 **Q14 — Transactional email provider. Status: CONFIRMED PROVIDER DECISION**, quoted because it is
the only place the choice is recorded:

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

So the split is a **file-ownership** split, not an open question: this ticket ships the port, the
provider registry and the offline transports and **no live-provider code**; `WTCH-09` ships
`providers/resend/**` behind that port; and breakdown-plan §5.17 narrows this ticket's file-scope to
`apps/worker/src/handlers/notifications/email/**` *"(except `providers/resend/**`)"* so the two
write-sets are disjoint. Nothing here waits on a Founder decision, and no criterion below may be
satisfied by writing into `providers/resend/`.

**The channel contract already exists.** `WTCH-03` deliverable 1 (merged before this ticket) ships
`apps/worker/src/handlers/notifications/channel-contract.ts` and a registry that discovers channels
by scanning the area's immediate subdirectories for `channel.ts` with a default export of
`AlertChannelModule` — *a pattern, not a list*, so adding this channel diffs no file outside
`notifications/email/`. `AlertDeliveryPayload` is
`{ alert_id, organization_id, channel, destination, delivery_id, attempt_budget }`.

**Accepted caveats carried forward:**

- **Bounce, complaint and unsubscribe handling is out of scope and stays a known gap** — §8 Q14:
  *"The existing bounce/complaint/suppression-processing known gap remains open until a ticket
  explicitly plans and implements it."* It requires an inbound provider webhook and a suppression
  list, and no PRD section specifies either. Declared a non-goal below with its writeback path.
- **Recipient resolution.** PRD §32.7 gives a watchlist "channels" but names no recipient field. This
  ticket resolves recipients as the **verified email addresses of the organisation members permitted
  to read monitor data** (`monitor:read` via `FND-06`'s matrix), read through `DATA-04`'s tenancy
  repository. That is an interpretation, is stated here, and is a writeback if a per-watchlist
  recipient list turns out to be required.
- **The crash window is narrowed, not eliminated.** A transport whose provider ignores request
  idempotency can double-send in the window between a successful provider call and the local status
  write. The design below shrinks that window to one statement and always passes a provider-side
  idempotency key; §8 Q14 selected a provider with **native idempotency-key support keyed on the
  `alert_delivery` id** precisely so a resumed attempt de-duplicates provider-side. The residual —
  a transport without that support, or a key the provider expires — is documented, not hidden, and is
  recorded in the ADR's consequences (deliverable 11).

## Goal

Produce `apps/worker/src/handlers/notifications/email/**` (except `providers/resend/**`, which is
`WTCH-09`'s): one `AlertChannelModule` registered into the existing `notifications` area, delivering
alert emails through an injected `EmailTransport` port with an offline default (a file/console
transport), an explicit no-op transport for restore drills, and a directory-scanned **provider
registry** through which a live-provider adapter can be added later with zero diff to this ticket's
files; made idempotent by `DATA-07`'s `(alert_id, 'EMAIL', destination)` uniqueness, retried on a
bounded exponential schedule with a dead-letter terminal state, and rendering a message that contains
the structured change facts and links but **no complete customer question or answer**. It also records
breakdown-plan §8 Q14's confirmed provider decision as an ADR under `docs/adr/` (deliverable 11).
Completion is mechanically checkable: the same alert delivered twice produces one `alert_delivery` row
and one message; the retry schedule and dead-letter transition are asserted against a fake clock; the
rendered message is asserted against a committed golden file to contain no denylisted content; the
provider registry resolves a fixture provider directory without any file in this scope changing; and
no test requires a live email provider.

## Non-goals

- **No live-provider adapter, SDK, credential or account** — the Resend adapter is **`WTCH-09`**
  (`apps/worker/src/handlers/notifications/email/providers/resend/**`), which is `blocked_by` this
  ticket. This ticket ships the port, the provider registry and the offline transports only, and must
  not write anything under `providers/resend/`.
- **No webhook delivery, signing, subscription CRUD or rotation** — `WTCH-05`
  (`notifications/webhook/**`, `apps/api/src/routes/webhook-subscriptions/**`).
- **No digest aggregation or scheduling** — `WTCH-06` (`notifications/digest/**`), which is
  `blocked_by` this ticket and reuses this ticket's renderer and transport port.
- **No alert creation, impact marking, acknowledge/resolve or alert routes** — `WTCH-03`.
- **No `notifications` area shell or channel registry** — `WTCH-03` (sub-PRD **D2**); this ticket
  adds exactly one subdirectory.
- **No tables, migrations or repositories** — `01-app-data`/`DATA-07` (breakdown-plan **A3**).
- **No worker runtime, queue configuration or lease loops** — `03-app-runtime`/`RUNT-04`.
- **No bounce/complaint/unsubscribe processing, suppression list or inbound provider webhook** — the
  standing known gap in breakdown-plan §8 **Q14**; no PRD section specifies it, a real provider will
  require it, and that is a **product change** (PRD §45.5) plus a `DATA-07` column and its own ticket,
  recorded as a known gap rather than invented here.
- **No production secret material, environment file or DNS record** — `18-ops-release` owns `infra/**`
  and the sealed-secret layer; §8 Q14's `RESEND_API_KEY` never appears in this scope.
- **No email templating framework decision beyond this channel** — the renderer is local to this
  directory; it is not a shared package.
- **No customer-facing email preference UI** — `13-identity-surface` owns `/settings/*`; this ticket
  reads the member records it needs.

## File-scope (write-owns)

- `apps/worker/src/handlers/notifications/email/**` — **except `providers/resend/**`, which is
  `WTCH-09`'s** (breakdown-plan §5.17). Inside the remaining scope: `channel.ts` (the default-exported
  `AlertChannelModule`), the transport port and its offline implementations, the provider registry
  (`providers/index.ts`, `providers/provider-contract.ts`), the recipient resolver, the renderer,
  `config.ts`, the golden fixtures and the tests under
  `apps/worker/src/handlers/notifications/email/__tests__/**`.
- Per breakdown-plan **A9** (`docs/adr/**` is shared-additive with per-file ownership, claimed by the
  creating ticket): `docs/adr/NNNN-transactional-email-provider.md` — **required** (deliverable 11).
  Take the lowest unused four-digit number at build time; the slug `transactional-email-provider` is
  reserved to this ticket. The file does not exist yet and this ticket's Builder creates it.

Does not touch:

- `apps/worker/src/handlers/notifications/email/providers/resend/**` — **`WTCH-09`** (the Resend
  adapter). This ticket defines the seam that directory plugs into and writes not one byte inside it;
  `WTCH-09` in turn writes nothing in this ticket's paths. The two scopes are disjoint by construction
  and both tickets say so.
- `apps/worker/src/handlers/notifications/{index.ts,registry.ts,channel-contract.ts}` — `WTCH-03`
  (sub-PRD **D2**; merged before this ticket). This channel is discovered by the registry; it edits
  none of those files.
- `apps/worker/src/handlers/notifications/{webhook,digest}/**` — `WTCH-05`, `WTCH-06` (disjoint
  sibling subtrees; `WTCH-05` may run as a concurrent lane).
- `apps/worker/src/handlers/{alerts,change-matching,maintenance}/**` and
  `apps/worker/src/{main.ts,runtime,queues}/**` — `WTCH-03`, `WTCH-02`, `RUNT-04`.
- `apps/api/**`, `apps/web/**` — other tickets in this module and other modules.
- `packages/database/**` (**A3**), `packages/contracts/**`, `packages/domain/**`,
  `packages/observability/**`, `packages/jobs/**`.
- `infra/**` (including any production secret material — `18-ops-release`), `schemas/**`,
  `tests/**`, root manifests and lockfiles.

**Serial-safety analysis.** First decomposition — breakdown-plan §1 records `phase: 1`, nothing
merged and nothing in flight. `apps/worker/src/handlers/notifications/email/` does not exist before
this ticket, and inside it exactly one subpath belongs to another ticket: breakdown-plan §5.17 gives
`WTCH-04` `apps/worker/src/handlers/notifications/email/**` *"(except `providers/resend/**`)"* and
gives `providers/resend/**` to `WTCH-09` alone, whose `blocked_by: [WTCH-04]` edge (§6.2:
`WTCH-04 --> WTCH-06 & WTCH-09`) puts it strictly after this ticket — so the two never run
concurrently and never share a file. The sibling channels have their own subtrees. The enclosing
`notifications` directory is a **single handler area** under `RUNT-04`'s contract, and sub-PRD **D2**
resolves that by giving its three shell files to `WTCH-03`, which is strictly earlier in the DAG
(breakdown-plan §6.2: `WTCH-03 --> WTCH-04 & WTCH-05`). Because the registry discovers channels by
directory scan, this ticket and `WTCH-05` — its concurrent round-3 lane — write pairwise-disjoint
subtrees and share no file. Adding this directory produces zero diff outside it, the property
`RUNT-04` contract item 6 guarantees. `docs/adr/` is empty (breakdown-plan §1 header) and ownership is
per file under **A9**, so the reserved slug cannot collide.

## Deliverables

1. **`channel.ts`** — default-exported `AlertChannelModule` with `channel: 'EMAIL'`,
   `jobType: 'ALERT_EMAIL_DELIVERY'` (from `packages/contracts`; a missing member is a
   `00-foundation` writeback, not a local literal), `queue: 'notifications'` (PRD §39.5) and stages:
   1. `RESOLVE` — `idempotent: true`: load the alert and its `detected_change` (via `WTCH-03`'s read
      path), resolve recipients (deliverable 2), and short-circuit when an `alert_delivery` row for
      `(alert_id, 'EMAIL', destination)` is already terminal.
   2. `SEND` — `idempotent: false`: deliverable 4's reserve → send → settle sequence.
   3. `RECORD` — `idempotent: true`: write the attempt outcome and the metrics.
2. **Recipient resolution** — `recipients.ts`: the verified email addresses of the organisation's
   members who hold `monitor:read` under `FND-06`'s permission matrix, read through `DATA-04`'s
   tenant-scoped repository, de-duplicated and sorted for determinism. Unverified addresses are
   skipped and counted. One `alert_delivery` row exists **per recipient address**, which is exactly
   what `(alert, channel, destination)` uniqueness expresses (PRD §35.6). The interpretation is
   recorded in the file's doc comment with a pointer to Feedback obligation 4.
3. **`EmailTransport` port and the provider registry** — `transport.ts`:
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
   Shipped implementations, selected by configuration (`PRD §39.6` layer 1 default first):
   - `FileTransport` — writes each message to a configured directory as `<idempotencyKey>.eml`;
     the committed **safe default** for development and for every test in this module.
   - `NullTransport` — accepts and discards, reporting `SENT`; the transport a restore drill selects
     so that `UAT-OPS-02`'s *"no emails … fire"* is structural, not procedural (PRD §42.3), and the
     transport §8 Q14 keeps for drills.
   - `FailingTransport` (test-only) — a scripted sequence of results, used to drive the retry and
     dead-letter suites.

   **The provider seam — `providers/provider-contract.ts` and `providers/index.ts`.** A live-provider
   adapter is a *directory*, never an edit to this ticket's files, so that `WTCH-09` (and any later
   provider) lands with zero diff here — the same pattern `WTCH-03`'s channel registry uses
   (`RUNT-04` contract item 6):
   ```ts
   export interface EmailTransportContext {
     readonly fromAddress: string;            // from this channel's config (deliverable 7)
     readonly sendTimeoutMs: number;          // one timeout for the channel
     readonly secret: (name: string) => string | undefined; // PRD §39.6 sealed-secret layer, the ONLY
                                              // credential source; never logged, never persisted
     readonly clock: () => Date;
     readonly logger: Logger;                 // content-free, per deliverable 9
     readonly metrics: Metrics;
   }
   export interface EmailTransportModule {
     readonly name: string;                   // must equal its directory name, e.g. 'resend'
     create(context: EmailTransportContext): EmailTransport;
   }
   ```
   `providers/index.ts` scans `providers/*/transport.ts` for a default-exported
   `EmailTransportModule`, asserts `name === <directory name>`, and resolves the configured
   `transport` value to exactly one module. **No live-provider adapter is shipped here** — `WTCH-09`
   owns `providers/resend/**`. An unknown `transport` name fails startup with a named error
   (PRD §39.6 *"refuses unknown critical keys"*), and a fixture provider directory under
   `__tests__/fixtures/providers/` proves the scan works without this ticket depending on `WTCH-09`.
4. **Idempotent send sequence (MON-004).** Ordering is load-bearing:
   1. **Reserve** — insert the `alert_delivery` row `(alert_id, 'EMAIL', destination)` in status
      `PENDING` with `attempt = 1` **before** any transport call. The unique constraint makes a
      concurrent or repeated attempt observe the existing row instead of sending again
      (PRD §35.6).
   2. **Send** — call `transport.send` with `idempotencyKey = <alert_delivery row id>`, which §8 Q14
      names as the value the provider's native idempotency key is keyed on, so a repeat is
      de-duplicated provider-side.
   3. **Settle** — record `SENT` with the provider message id, or `RETRYABLE_FAILURE` /
      `PERMANENT_FAILURE` with the code, through `DATA-07`'s append-only `recordAttempt`.
   4. **Crash window** — if the process dies between 2 and 3, the row is left `PENDING`; a resumed
      attempt re-sends with the **same** `idempotencyKey` (never a new one), so a provider with
      idempotency support de-duplicates and one without may double-send once. That residual is
      documented in the file header and in the ADR's consequences (deliverable 11) — it is never
      hidden by silently marking the row `SENT` before the provider confirms.
5. **Bounded exponential retry and dead-letter (PRD §8.8's "bounded exponential retry", MON-004's
   "retry/dead-letter tests pass").** The schedule is a committed constant table, not a formula
   buried in code:

   | Attempt | Delay before it | Cumulative |
   |---:|---|---|
   | 1 | 0 | 0 |
   | 2 | 1 min | 1 min |
   | 3 | 5 min | 6 min |
   | 4 | 25 min | 31 min |
   | 5 | 2 h | 2 h 31 min |
   | 6 | 6 h | 8 h 31 min |
   | 7 | 12 h | 20 h 31 min |

   Seven attempts maximum; ±20 % jitter from an **injected** RNG so tests are deterministic; only
   `RETRYABLE_FAILURE` is retried; `PERMANENT_FAILURE` goes terminal immediately. After the seventh
   failure the row moves to `DEAD_LETTER` (`DATA-07`'s terminal state), which is final: no further
   attempt is scheduled and an operator counter increments. All values are PRD §39.6 layer-1 defaults
   and are configurable; the **shape** (bounded, exponential, terminal dead-letter) is the PRD
   requirement. **The retry loop lives here and nowhere else**: a provider adapter performs one
   attempt per `send()` call and never retries internally.
6. **Message rendering — structured facts only (PRD §8.8).** `render.ts` produces subject and body
   from the alert's structured fields:
   - subject: `[<jurisdiction>] <change type> — <authority title>` (public source metadata only);
   - body: change type, detection/publication/effective dates, before/after authority titles with
     their **official URLs**, the watchlist name, the count of affected research records, and deep
     links (`/monitor/alerts/:alertId`, `/records/:recordId`) — links, not content;
   - a fixed disclaimer line and the unsubscribe/preferences pointer to `/settings` (PRD §11.2's
     positioning applies to customer-facing surfaces; the copy itself is `24-launch`/`LNCH-01`, so
     the renderer reads it from configuration rather than hard-coding legal text);
   - **excluded by construction**: the customer's question, facts, any answer text, claim text,
     source excerpts, record titles and any provider payload. Enforced by the same denylist test the
     rest of the module uses, applied to both the template inputs and the rendered golden file.
   HTML output, if present, is sanitised and references no remote image or script (PRD §37.5's
   rendering boundary and §21.1). This renderer is the **only** place a message is composed: a
   transport transmits what it is given and adds nothing (§8 Q14's content rule).
7. **Configuration** — `config.ts` with a schema validated at boot:
   `transport` (`file` | `null` | `<a registered provider module name>`, default `file`),
   `from_address`, `file_output_dir`, `max_attempts` (default 7), `attempt_delays_seconds` (the table
   above), `jitter_ratio` (0.2), `send_timeout_ms` (default 10 000). Unknown critical keys fail
   startup (PRD §39.6). **No secret is read here**: a provider credential reaches its adapter only
   through `EmailTransportContext.secret` (deliverable 3), sourced from the sealed-secret layer — never
   committed, never logged, never placed in this file or in any fixture.
8. **Kill-switch and degradation** — before `SEND`, read `DATA-07`'s `activeSwitchesAt(now)`; a
   `webhooks`-scoped switch does **not** stop email, but a `tenant/key`-scoped switch naming the
   organisation, or a global generation switch, is honoured per PRD §42.5's scope semantics: the
   attempt is deferred without consuming an attempt slot and without recording a failure, so recovery
   produces no duplicate.
9. **Observability** (PRD §22, content-free): `email_delivery_attempts{result}`,
   `email_delivery_dead_letter`, `email_recipients_skipped{reason}`,
   `email_delivery_latency_ms`. No address is logged in full — log a stable hash plus the domain.
10. **Golden fixtures** under `.../email/__tests__/fixtures/`: `alert.json` (a `WTCH-03` alert detail
    payload), `expected-subject.txt` and `expected-body.txt` (the exact rendered output). The golden
    files are what a reviewer reads to confirm PRD §8.8 compliance without running anything.
11. **ADR — `docs/adr/NNNN-transactional-email-provider.md` (breakdown-plan §8 Q14, **A9**,
    PRD §45.5 *"Architecture decision"*).** Required, created by this ticket's Builder at
    implementation time; it does not exist beforehand. It records the decision that §8 Q14 already
    settled — it does not re-open it — in four sections:

    **Accepted decision.** Transactional email is sent through **Resend**, on the Resend Free
    transactional-email tier, behind this ticket's `EmailTransport` port; the adapter is a small typed
    HTTPS client (`WTCH-09`, `providers/resend/**`), not the vendor SDK. Retry safety uses Resend's
    native idempotency-key support keyed on the `alert_delivery` row id. `RESEND_API_KEY` lives only in
    the production sealed-secret layer and is never committed, logged or exposed to coding agents. The
    sending domain must be verified with the correct DNS records. Transactional email carries no
    customer questions, answers, evidence excerpts or Research Record content. Restore drills keep
    `NullTransport`; tests keep offline/fake/file transports.

    **Why.** (a) **Cost** — the free tier is expected to cost A$0/month for MVP volume, which is what
    keeps the email line inside PRD §24.1's *"Domain/email/variance reserve | A$8–12"* and the
    A$42–50 total, and PRD §24.1 requires the system to *"stop before exceeding the founder-funded
    ceiling"*. The quoted allowance (3,000 emails/month, 100/day) is **external operational
    configuration that can change, not a PRD guarantee**, and the ADR must say so. (b) **Native
    idempotency keys** — deliverable 4.4's crash window is the one place email delivery can duplicate;
    a provider that de-duplicates on a caller-supplied key keyed to `alert_delivery.id` closes it
    without weakening `MON-004`. (c) **The port already exists** — the provider is reachable only
    through `EmailTransport`, so provider coupling stays behind one seam (PRD §45.2), the offline and
    drill transports are unaffected, and rollback is a configuration change rather than a code change.

    **Rejected alternatives** (the option set the ADR must record as weighed, each with its reason):
    a self-hosted SMTP relay or MTA on the production host — no native request idempotency, and it adds
    deliverability, DNS and process burden to the 2 GB host PRD §39.2 budgets; a paid ESP tier — spends
    PRD §24.1's variance reserve for no MVP benefit at this volume; AWS SES — cheap but widens the AWS
    credential/IAM surface that PRD §39.6 deliberately limits to the S3 backup and export groups, and
    adds a production-access approval step; the Resend **SDK** as a dependency — a runtime dependency
    and root-lockfile churn (PRD §44.3 serial-owned lockfiles, breakdown-plan risk **R7**) for a single
    HTTP call, and §8 Q14 explicitly says the SDK is not mandatory; **no email channel at all** —
    PRD §8.8 lists email as one of the three required channels, so it is not available.

    **Consequences.** The module gains exactly one outbound destination beyond customer-configured
    webhooks, namely the provider's own fixed API endpoint (sub-PRD §3 and **D14**); the address-policy
    duplication that comes with it is tracked under sub-PRD **Q-WTCH-4**. A verified sending domain
    becomes a production prerequisite owned by `18-ops-release`, and email delivery fails closed until
    it exists. Provider allowances and pricing can change without a PRD change, so they are never
    encoded as a product rule. Bounce, complaint and suppression processing **remains an open known
    gap** until a ticket explicitly plans it (§8 Q14). Reverting is `transport: "file" | "null"` plus
    reverting `WTCH-09`'s directory. The ADR contains no key, no account identifier and no
    environment-specific DNS value.

## Acceptance checklist (classified)

- [ ] `[fixture]` **Delivery replay, offline**: replaying `alert.json` through `FileTransport`
      produces exactly `expected-subject.txt` and `expected-body.txt`, and writes one `.eml` file per
      recipient. **No test requires a live email endpoint** — the transport is a port and the default
      writes to disk (PRD §42.3, `UAT-OPS-02`; epic `E25-MONITOR` exit evidence *"MON tests and
      delivery replay"*)
- [ ] `[machine]` **MON-004, idempotency**: delivering the same alert to the same address twice —
      including a concurrent double-lease — creates exactly **one** `alert_delivery` row and **one**
      message; the second attempt observes the existing row and sends nothing (PRD §35.6 *"idempotent
      `(alert, channel, destination)`"*)
- [ ] `[machine]` **MON-004, retry**: a scripted `RETRYABLE_FAILURE` sequence retries at exactly the
      deliverable-5 delays under a fake clock and injected RNG; a `PERMANENT_FAILURE` is **not**
      retried (PRD §8.8 *"bounded exponential retry"*)
- [ ] `[machine]` **MON-004, dead-letter**: after the seventh failure the row is `DEAD_LETTER`, no
      further attempt is scheduled, the state is terminal, and the counter increments (`DATA-07`
      deliverable 6)
- [ ] `[machine]` Crash-window safety: killing the process between transport success and the status
      write leaves the row `PENDING`, and the resumed attempt re-sends with the **same**
      `idempotencyKey` — asserted by capturing the key on both attempts (deliverable 4.4)
- [ ] `[machine]` **Payload minimisation (PRD §8.8)**: the rendered subject, body and every log line
      contain no complete customer question or answer, no claim text, no source excerpt and no record
      title — asserted by the denylist check over the template inputs **and** by a substring assertion
      against a fixture whose record carries a distinctive canary question and answer, which must not
      appear in the output
- [ ] `[machine]` `NullTransport` sends nothing and reports `SENT`, so a restore drill fires no email
      (PRD §42.3, `UAT-OPS-02` *"no emails/webhooks/providers/real sessions fire"*; §8 Q14 keeps this
      the drill transport)
- [ ] `[machine]` Configuration: an unknown `transport` name fails startup with a named error; no
      credential is read from the repository or committed anywhere in this scope (PRD §39.6, §20.2)
- [ ] `[machine]` **Provider seam (§8 Q14, `WTCH-09`)**: the fixture provider directory under
      `__tests__/fixtures/providers/` is discovered by `providers/index.ts`, is selected by its
      configured name, receives `EmailTransportContext` with a working `secret()` accessor, and a
      `name`/directory mismatch fails startup with a named error — proving `WTCH-09` can land with
      **zero** diff to any file in this scope (deliverable 3)
- [ ] `[machine]` **Scope disjointness**: this ticket's diff contains **no** file under
      `apps/worker/src/handlers/notifications/email/providers/resend/` — that subpath is `WTCH-09`'s
      (breakdown-plan §5.17)
- [ ] `[machine]` Recipients: only verified addresses of members holding `monitor:read` receive a
      delivery; an unverified address is skipped and counted; the recipient set is deterministic
      (PRD §38.1 via `FND-06`)
- [ ] `[machine]` Kill switch: a `tenant/key`-scoped switch naming the organisation defers the
      attempt without consuming an attempt slot and without recording a failure; recovery produces no
      duplicate (PRD §42.5)
- [ ] `[machine]` Queue discipline: the handler runs in the `notifications` class and its in-flight
      count does not decrement a research slot (PRD §39.5 *"does not consume research slot"*)
- [ ] `[machine]` **Channel registration (sub-PRD D2)**: the channel is discovered by `WTCH-03`'s
      registry with **zero** diff to any file outside
      `apps/worker/src/handlers/notifications/email/`, verified with `git status --porcelain` after
      the suite (`RUNT-04` contract item 6)
- [ ] `[machine]` Architecture: no unscoped `packages/database` import; no direct SMTP/HTTP client
      import anywhere in this scope — the port is the only egress seam, and the only HTTP client in
      the module lives in `WTCH-09`'s provider directory (PRD §45.2)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3)
- [ ] `[machine]` **ADR authored (breakdown-plan §8 Q14, A9, PRD §45.5)**:
      `docs/adr/NNNN-transactional-email-provider.md` exists with the four deliverable-11 sections —
      accepted decision, why, rejected alternatives, consequences — records Resend as the accepted
      decision with the §8 Q14 constraints, states that the quoted provider allowances are external
      operational configuration rather than a PRD guarantee, names `WTCH-09` as the implementing
      ticket, and contains no key or account identifier. Silence is not an acceptable outcome
      (CLAUDE.md; PRD §45.5)
- [ ] `[human]` Gate 2 founder review: read one rendered `.eml` from the fixture run and confirm it
      is useful and carries no customer research content, and read the ADR and confirm it states the
      decision the Founder made (PRD §43.4 founder test queue; CLAUDE.md Gate 2). **Not required to
      merge** — the automated criteria above are
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable (PRD §45.3)
- [ ] `[fixture]`/`[machine]` cross-check: `UAT-MON-02` (webhook replay) is **not** this ticket's —
      it is `WTCH-05`'s. Declared explicitly so the classification is not assumed
- [ ] `[machine]` PR states the PRD §45.4 items: requirement **MON-004**, epic `E25-MONITOR`;
      user-visible change and non-goals; schema/API/event compatibility impact (none — no HTTP or
      event surface); tenant/PII/security impact (recipient addresses are tenant data, never logged
      in full; no research content in messages; no credential in the repository); source/licence
      impact (official URLs only, no source excerpt); cost/memory/latency impact (**§8 Q14** — the
      selected provider is expected to cost A$0/month within its free allowance, under PRD §24.1's
      *"Domain/email/variance reserve | A$8–12"* line; no provider call happens in this ticket's
      default configuration); rollback path (revert the channel directory; the registry then registers
      zero email handlers and alerts stay in-app); known gaps (bounce/complaint/suppression processing
      per §8 Q14; the crash-window double-send for any transport without provider-side idempotency)

## Test plan

Reviewer steps. Every step is offline and deterministic: `FileTransport` or `FailingTransport`, fake
clock, injected RNG, committed fixtures. **No live email provider, no SMTP connection, no network.**

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter <the apps/worker package name>`; suites under
   `apps/worker/src/handlers/notifications/email/__tests__/`.
3. **Harness.** Copy `RUNT-04`'s `checkpoint-resume.test.ts` construction: temp `app.sqlite` migrated
   by `DATA-01`, `packages/jobs` leases, fake clock. Seed alerts with `WTCH-03`'s factories and
   `DATA-07`'s delivery repository. The transport is injected, never constructed from configuration
   inside a test.
4. **Read the golden files against the PRD.** Compare `expected-body.txt` with PRD §32.7's alert
   fields and PRD §8.8's payload sentence. Confirm it carries change type, dates, before/after
   authority titles and official links, a record **count** and deep links — and no question, answer,
   claim, excerpt or record title.
5. **Canary test.** Confirm the fixture's record carries a distinctive question and answer string and
   that the suite asserts those strings are absent from subject, body and logs. Without a canary the
   denylist test only proves the schema, not the render.
6. **Idempotency.** Deliver twice sequentially, then twice concurrently (two leases); assert one row
   and one file each time.
7. **Retry.** Script `FailingTransport` to return six `RETRYABLE_FAILURE`s then `SENT`; advance the
   fake clock and assert each attempt occurs at the deliverable-5 delay (jitter bounded by ±20 %).
   Then script seven failures and assert `DEAD_LETTER`, terminal, no eighth attempt.
8. **Permanent failure.** One `PERMANENT_FAILURE` → terminal immediately, no retry.
9. **Crash window.** Kill after the transport resolves but before the status write; restart; assert
   the same `idempotencyKey` is presented on the second attempt.
10. **`NullTransport`.** Configure it and assert zero files, zero network and `SENT` recorded — the
    restore-drill posture.
11. **Configuration.** Set `transport: "some-unknown-provider"` and assert startup fails naming the
    key. Grep the whole file-scope for anything resembling an API key or SMTP password — there must be
    none, including in the ADR.
12. **Provider seam.** Point `transport` at the fixture provider directory; assert it is discovered,
    constructed with a working `secret()` accessor and used; assert a `name`/directory mismatch fails
    startup. Confirm the diff contains nothing under `providers/resend/` — that is `WTCH-09`'s scope,
    and this ticket must be complete without it.
13. **ADR.** Open `docs/adr/NNNN-transactional-email-provider.md`; confirm the four sections, that the
    accepted decision matches breakdown-plan §8 Q14 bullet for bullet, that the allowance caveat is
    present, that `WTCH-09` is named as the implementing ticket, and that no credential or account
    identifier appears.
14. **Registration.** Confirm `git status --porcelain` is clean after the suite and that no file
    under `apps/worker/src/handlers/notifications/` outside `email/` is modified by the diff.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket file** (docs PR →
merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/16-monitor-alerts/README.md` (version +0.1 with a changelog line) **before** changing code.
Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**Foreseeable frictions, each with its exact writeback target:**

1. **The port or the provider seam cannot carry the confirmed provider.** breakdown-plan §8 Q14 is a
   **confirmed** decision and is not re-opened here; but if `EmailTransport`,
   `EmailTransportContext` or the directory scan cannot express what Resend needs, the writeback
   target is **this ticket's deliverable 3 and `WTCH-09`** — agree the changed surface in both ticket
   files, and in `docs/prd/16-monitor-alerts/README.md` **D11**/**D14** if the module contract
   changes, **before** either ticket writes code. Do not widen this ticket into `providers/resend/`,
   and do not build a second port.
2. **The provider's idempotency-key semantics differ from what §8 Q14 assumes** (the key expires, is
   scoped differently, or is not honoured). → Record the measured behaviour in
   `docs/prd/16-monitor-alerts/README.md` **D11** and in the ADR's **consequences** section
   (deliverable 11), and update deliverable 4.4. Do **not** "fix" it by writing `SENT` before the
   provider confirms — that trades a rare duplicate for a silent loss, which `MON-004` does not
   permit.
3. **PRD §8.8's payload limit makes the email useless** — for example a customer needs to see which
   clause changed. → The message already carries change type, dates, authority titles and official
   links; exact text belongs on the alert screen behind authentication (`WTCH-08`). If a genuine
   product need remains, that is a **product/privacy change** (PRD §45.5, §10.2): record the exact
   field and its justification in `docs/prd/16-monitor-alerts/README.md` and escalate before relaxing
   the renderer. The denylist is a privacy boundary, not a lint rule.
4. **Recipients need a per-watchlist address list** rather than "members with `monitor:read`". →
   PRD §32.7's watchlist fields do not include recipients, so this needs a `DATA-07` column and a
   `WTCH-01` DTO field. Raise a `01-app-data` ticket, add the edge in
   `docs/prd/breakdown-plan.md` §5.2/§6.2, and update this ticket and `WTCH-01`. Do not store
   addresses in an existing free-text column.
5. **Bounces or complaints make delivery unreliable** without a suppression list. → It is the standing
   known gap in §8 Q14. Record it in `docs/prd/16-monitor-alerts/README.md`; the inbound provider
   webhook, the suppression table and the member-notification consequences are a **product change**
   plus a `01-app-data` ticket and a new ticket in `docs/prd/breakdown-plan.md` §5.17/§6.2. Never
   suppress silently in application memory.
6. **The retry table starves or floods the `notifications` queue.** → The values are PRD §39.6
   layer-1 defaults; changing a shipped default is a **benchmark-selected configuration** decision
   (PRD §45.5) needing the measurement in the PR's cost/latency line (PRD §45.4) and a note in this
   ticket. The *shape* — bounded, exponential, terminal dead-letter — is PRD §8.8 and must not
   change.

**Escalation.** PRD §8.8's *"Payloads MUST avoid complete customer questions/answers by default"* and
`MON-004`'s idempotent, retryable delivery are release requirements. If either proves unimplementable
against the confirmed provider, stop, write the evidence back to `docs/prd/breakdown-plan.md` §8
**Q14** (a provider change overturns a confirmed decision and rewrites the ADR above),
`docs/prd/16-monitor-alerts/README.md` and `docs/prd/breakdown-plan.md` §5.17, and escalate to the
human before code lands. Never ship an email path that can carry customer research content, and never
mark a delivery successful that a provider has not accepted.
