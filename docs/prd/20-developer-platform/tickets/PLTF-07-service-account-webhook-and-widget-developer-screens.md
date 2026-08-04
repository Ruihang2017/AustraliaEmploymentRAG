---
id: PLTF-07
title: Service-account, webhook and widget developer screens
module: 20-developer-platform
lane: 20-developer-platform
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [PLTF-01, IDNT-06, WTCH-05]
blocks: []
---

# PLTF-07 — Service-account, webhook and widget developer screens

Implements PRD §31.2 (routes `/developer/service-accounts`, `/developer/webhooks`,
`/developer/widget`) and §32.8 (developer and administration screens), carrying requirements
**`AUTH-006`** ("Service credentials are shown once, hashed, scoped, expiring and rotatable") and
**`DEV-002`** ("Widget uses short-lived, origin-bound sessions from customer backend", epic
`E27-DEVELOPER`).
**No ADR — the decision is already made in PRD §31.2, §32.8 and §38.4; this is build ticket 7 of 9
against it.**
Parent sub-PRD: [20-developer-platform README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`PLTF-01` — API reference and developer portal screens](PLTF-01-api-reference-and-developer-portal-screens.md);
[`IDNT-06` — Service-account and credential routes](../../13-identity-surface/tickets/IDNT-06-service-account-and-credential-routes.md);
`WTCH-05` — Signed webhook delivery and subscription routes
([`16-monitor-alerts`](../../16-monitor-alerts/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
— `IDNT-06` and `WTCH-05` have already frozen the routes, and `PLTF-01` the section registry; this
renders them, it does not design an API or a credential model.

## Background + basis

**The three routes and their empty states are fixed.** PRD §31.2:

> | `/developer/service-accounts` | Service accounts | Developer/Admin/Owner subject to scope | Create/rotate/revoke | **Scope and one-time-secret warning** |
> | `/developer/webhooks` | Webhooks | Developer/Admin/Owner | Configure/test/rotate | **Signature verification example** |
> | `/developer/widget` | Widget sandbox | Developer/Admin/Owner | Configure/test embed | **Synthetic questions only by default** |

**The mandatory field list.** PRD §32.8:

> Developer pages MUST display environment, base URL, API version, current key prefix/scopes/expiry,
> limits, OpenAPI version, webhook signing instructions and copyable Search/Answer examples.
> **Secrets are never redisplayed.**

Sub-PRD **D15** splits that list: `PLTF-01` owns environment, base URL, API version, OpenAPI version,
documented limits and the copyable examples; **this ticket owns the credential-derived fields
(current key prefix, scopes, expiry) and the in-context webhook signing instructions**, and fills
`PLTF-01`'s `CREDENTIAL_PANEL_SLOT`.

**`AUTH-006` and its acceptance evidence.** PRD §30.2:

> | AUTH-006 | Service credentials are shown once, hashed, scoped, expiring and rotatable | `/developer/service-accounts` | service-account endpoints | App | **Old key fails immediately after rotation/revocation** |

and PRD §38.4:

> Service credentials use a public prefix plus at least 256 bits of random secret; only a
> memory-hard/hash verifier is stored. Keys have exact scopes, expiry and optional IP/rate/budget
> restrictions. **Rotation creates a new key; an optional maximum 24-hour overlap is explicit and
> auditable.**

**What `IDNT-06` already publishes and this screen consumes** (its deliverables 2–9), quoted for
cold start:

- `POST /v1/service-accounts` — `{ name, scopes[], expires_at?, ip_allowlist?, budget_limit? }`;
  *"Creating a service account never mints a credential implicitly."*
- `GET /v1/service-accounts` and `GET /{id}` — list/read with `ETag` from `row_version`; shape
  `{ id, name, status, scopes, expires_at, ip_allowlist, budget_limit, created_at, updated_at,
  credentials: [{ id, prefix, created_at, expires_at, last_used_at, revoked_at, status }] }` —
  *"`prefix` only, **never** `secret_hash` and never a credential string"*.
- `PATCH /{id}` and `POST /{id}/disable` — `If-Match` **required**; stale `row_version` →
  `409 CONCURRENT_MODIFICATION`.
- `POST /{id}/credentials` — mint; response `{ id, prefix, expires_at, created_at, secret }` where
  *"`secret` is `display`"*, plus *"a `warning` string the screen renders verbatim"*. **This is one of
  exactly two responses in the product that contain a credential string.**
- `POST /{id}/credentials/{credentialId}/rotate` — `{ overlap_seconds?, reason }`, `reason`
  **required**; `overlap_seconds` defaults `0`; above 86 400 → `400 INVALID_REQUEST` with
  `details.reason === 'OVERLAP_TOO_LONG'`; a non-zero value is echoed in the response.
- `DELETE /{id}/credentials/{credentialId}` — **required** `reason`.
- `GET /v1/service-accounts/scopes` — *"the grantable scope catalogue … plus the
  `FORBIDDEN_FOR_SERVICE_ACCOUNTS` list so `PLTF-07` can explain why some capabilities are
  unavailable"*.

**What `WTCH-05` already publishes and this screen consumes** (its deliverable 1):

- `POST /v1/webhook-subscriptions` — `{ url, description?, event_types[], active }`; *"**response
  returns the generated secret exactly once**"*; honours `Idempotency-Key`.
- `GET` list and `GET /{id}` — *"the secret is **never** returned, only `secret_last_rotated_at`,
  `secret_prefix` (first 6 characters) and `pending_secret_active_from`"*.
- `PATCH /{id}` and `DELETE /{id}` — `If-Match` required.
- `POST /{id}/test` — *"sends a `webhook.test` **ping** built and signed exactly like a real
  delivery … and returns the receiver's status code and the elapsed time"*, rate-limited, no retry.
- `POST /{id}/rotate-secret`.
- PRD §38.5's endpoint cap is enforced server-side (2 trial / 10 paid) *"with a named error"*.

**The webhook signature contract the screen must explain.** PRD §34.8, headers and input:

> ```text
> X-AER-Event-Id: evt_...
> X-AER-Timestamp: 1785726012
> X-AER-Signature: v1=<lowercase hex HMAC-SHA256>
> ```
>
> The signature input is `<timestamp>.<raw_request_body>`. Receivers reject a timestamp older than
> five minutes and deduplicate event IDs.

**The widget rule the screen must not break — sub-PRD D16.** PRD §8.10: *"long-lived service
credentials MUST NOT enter the browser"*, and `IDNT-07` deliverable 1 makes the mint endpoint
machine-only: *"The area rejects any principal that is **not** a service credential: a cookie session
and a widget token are both `401 AUTHENTICATION_REQUIRED`."* The web application is
cookie-authenticated, so **this screen structurally cannot mint a widget session** — and must not
try. It renders the embed configuration, the customer's origins and a copyable **backend** snippet;
its live preview accepts a token the developer minted out of band, held in memory for the preview
only. PRD §33.5 step 2 is the flow it teaches.

**Who may see and act.** PRD §38.1's row *"Manage service accounts/webhooks/widget"*: Owner ✓,
Admin ✓, Researcher —, Viewer —, Developer *"✓ within granted developer permission"*, service
account —. The decision comes from `FND-06.evaluate()` surfaced by the shell; **this area writes no
role literal** (PRD §45.2; breakdown plan §9 **R5**).

**The A1 section contract** — `PLTF-01` deliverable 3 (sub-PRD **D13**): each section is a directory
under `apps/web/src/features/developer/` containing `section.tsx` with a default-exported
`DeveloperSection { id, path, title, order?, element }`, discovered by
`import.meta.glob('./*/section.tsx', { eager: true })`. Adding a section directory produces **zero**
diff to `PLTF-01`'s files. Cache keys come from `RUNT-05`'s `orgScopedKey(...)`.

**Accepted caveats carried forward, documented not enforced here:**

- **This screen mints, hashes, rotates and revokes nothing itself.** Every action is a call to
  `IDNT-06`'s or `WTCH-05`'s routes.
- **The widget preview cannot mint** (sub-PRD **D16**). The `[human]` end-to-end `DEV-002` rehearsal
  belongs to `PLTF-05` and `IDNT-07`.
- **`/developer/sandbox` is not a fourth route here** — sub-PRD **Q-PLTF-7**; the sandbox affordance
  lives on `/developer/api` (`PLTF-01`) and in this screen's synthetic-question default.
- **Durable audit persistence** is `13-identity-surface`'s **OQ3**; nothing here depends on it.

## Goal

Produce the three developer sections — `/developer/service-accounts`, `/developer/webhooks` and
`/developer/widget` — registered through `PLTF-01`'s section registry, such that a platform developer
can create, scope, rotate and revoke service credentials with a one-time secret warning; configure,
test and rotate webhook subscriptions with a working signature-verification example; and configure a
widget embed **without any long-lived credential ever entering the browser**. Completion is
mechanically checkable: each section registers with zero diff to `PLTF-01`'s files; a credential or
webhook secret is shown exactly once and never re-read, cached, stored or placed in a URL; rotation
requires a reason and shows the overlap window; a stale `ETag` produces the 409 reload guidance; and
the widget section contains no code path that sends a credential to `POST /v1/widget-sessions` or
anywhere else.

## Non-goals

- **No service-account, credential or scope logic** — `IDNT-06` (`apps/api/src/routes/service-accounts/**`)
  and `AUTC-04` (`packages/auth/src/credentials/**`). This screen hashes, generates, parses and
  validates nothing; the scope catalogue comes from `GET /v1/service-accounts/scopes` (PRD §35.1: no
  second list of controlled values).
- **No webhook delivery, egress guard, secret storage, retry or dead-letter** — `WTCH-05`
  (`16-monitor-alerts`). The screen calls `POST /{id}/test`; it sends no webhook itself.
- **No widget-session minting** — `IDNT-07`, machine-only (sub-PRD **D16**). This screen has no input
  for a service credential.
- **No widget runtime** — `PLTF-05`/`PLTF-06` (`apps/widget/**`). The preview embeds the published
  loader as an ordinary consumer.
- **No `developer` area entry files** — `feature.tsx`, `section-contract.ts`, `section-registry.ts`
  and `developer-context.ts` are `PLTF-01` (sub-PRD **D13**). This ticket writes only its three
  section directories.
- **No `/developer/api` screen and no `docs/api/**`** — `PLTF-01`. Snippets shown here are the
  strings `docs/api/guides/webhooks.md` and `docs/api/guides/widget.md` publish, imported rather than
  re-typed (deliverable 8).
- **No usage screen** — `PLTF-08`; **no usage/audit endpoints** — `PLTF-09`.
- **No sandbox provisioning** — `PLTF-04` (`apps/api/src/routes/sandbox/**`).
- **No permission matrix** — `FND-06`. No role literal appears here.
- **No web shell, nav slots or `apps/web/src/lib/**`** — `RUNT-05`; **no `packages/ui` primitives** —
  `RUNT-06` (breakdown plan **A6**). This screen composes them.
- **No cross-boundary suites** — `tests/**` is `23-assurance`; this ticket carries its own co-located
  assertions (breakdown plan §9 **R8**).

## File-scope (write-owns)

- `apps/web/src/features/developer/service-accounts/**` — the section, its components, its co-located
  tests and fixtures.
- `apps/web/src/features/developer/webhooks/**` — likewise.
- `apps/web/src/features/developer/widget/**` — likewise.

Does not touch:

- `apps/web/src/features/developer/{feature.tsx,section-contract.ts,section-registry.ts,developer-context.ts}`
  and `apps/web/src/features/developer/api/**` — `PLTF-01` (this ticket is `blocked_by` it; never
  concurrent, and this ticket still writes none of those files).
- `apps/web/src/features/usage/**` — `PLTF-08`; every other `apps/web/src/features/*` area — `13`,
  `14`, `15`, `16`, `17`, `19`, `24`.
- `apps/web/src/{app,shell,lib}/**`, `apps/web/test/**`, `apps/web/{index.html,vite.config.ts,
  tsconfig.json,package.json}` — `RUNT-05`. (If a dependency were genuinely unavoidable, sub-PRD
  **Q-PLTF-4** is the path; prefer adding none, and `PLTF-01` has already added whatever the section
  registry needs.)
- `apps/api/src/routes/**` — `IDNT-01`…`IDNT-07`, `WTCH-05`, `PLTF-04`, `PLTF-09` and the other route
  owners; `packages/auth/**` — `02-auth-core`; `packages/database/**` — `01-app-data`;
  `packages/{contracts,domain,ui,observability}/**` and `schemas/**` — `00-foundation`, `RUNT-06`,
  `RUNT-07`.
- `apps/widget/**` — `PLTF-05`/`PLTF-06`; `packages/sdk-typescript/**` — `PLTF-02`; `sdk/python/**` —
  `PLTF-03`; `docs/api/**` — `PLTF-01`.
- `apps/worker/**`, `apps/admin/**`, `services/**`, `pipelines/**`, `infra/**`, `tests/**`,
  `evals/**`, root manifests, lockfiles, `.github/workflows/**`.

**Serial-safety analysis.** This is the **first** decomposition (breakdown plan §1: phase 1,
`append: false`, `usedIds: []`, `existingFiles: ['.gitkeep']`) — nothing is merged, nothing is in
flight, so no prior ticket has written these paths and none contends for them. Under `PLTF-01`'s
section-registry contract (sub-PRD **D13**, itself an instance of `RUNT-05`'s A1 web contract item 6
*"zero diff outside that area's own directory"*), each of the three section directories is discovered
by a glob, so creating them produces **zero** diff to `PLTF-01`'s files — and this ticket is
`blocked_by PLTF-01`, so the two are never concurrent in any case. This ticket runs in wave 2
alongside `PLTF-06` (`apps/widget/react/**`) and `PLTF-08` (`apps/web/src/features/usage/**`) — three
disjoint trees, three concurrent lanes (breakdown plan §7: 2 minimum waves, 6 useful lanes). The
module-wide picture is PRD §44.3's *"Web screens against frozen contracts"* and *"independent SDK
languages"*: the two SDK subtrees, the widget subtree, the three API route areas and the two web
feature areas share no file.

## Deliverables

1. **`service-accounts/section.tsx`** — `DeveloperSection { id: 'service-accounts', path:
   '/developer/service-accounts', title: 'Service accounts', order }`. Renders, against `IDNT-06`'s
   routes:
   - a list of service accounts with name, status, scopes, expiry, IP allowlist, budget limit and,
     per credential, **prefix, status, created, expires, last used** — never a secret and never a
     hash (PRD §35.4, §32.8);
   - **create**: name, a scope picker built from `GET /v1/service-accounts/scopes` with each scope's
     description, and the `FORBIDDEN_FOR_SERVICE_ACCOUNTS` list rendered as *"not available to
     machine credentials"* with the reason. **No scope string is written in this area** — a source
     scan asserts it (PRD §35.1);
   - **edit** and **disable** via `PATCH`/`disable` with `If-Match` from the read's `ETag`; a stale
     value surfaces `409 CONCURRENT_MODIFICATION` as an explicit reload-and-retry state, never a
     silent overwrite (PRD §16.2, §34.1, §34.9);
   - **mint credential**, **rotate** and **revoke** — deliverables 2 and 3.
2. **One-time secret presentation (`AUTH-006`).** The mint and rotate responses are the only places a
   credential string exists (`IDNT-06` deliverable 6, sub-PRD **D5** there). This screen:
   - renders the `warning` string from the response **verbatim** (`IDNT-06` deliverable 6);
   - shows the secret exactly once, in a modal that requires an explicit "I have stored this"
     acknowledgement to dismiss, with a copy control;
   - **never** writes the secret to any cache, query cache, React state that outlives the modal,
     `localStorage`, `sessionStorage`, a cookie, IndexedDB, the URL, the document title or a log
     line;
   - never re-requests it and renders no "show again" affordance — PRD §32.8: *"Secrets are never
     redisplayed"*;
   - on dismissal, clears the value and re-fetches the account so only the prefix remains visible.
3. **Rotation and revocation UX (`AUTH-006`).** Rotation requires a **reason** (`IDNT-06`
   deliverable 7 makes it required because PRD §38.4 requires any overlap to be *"explicit and
   auditable"*) and offers `overlap_seconds` with a default of `0`, an explicit statement that zero
   means *the old key stops working immediately*, and a hard client-side bound of 86 400 matching
   `CREDENTIAL_OVERLAP_MAX_SECONDS` — with the server's `OVERLAP_TOO_LONG` still surfaced verbatim
   if it is hit. A non-zero overlap is echoed back and displayed with its end time. Revocation
   requires a reason and states *"this key will stop working immediately"* (PRD §41.1:
   *"destructive/security-sensitive actions name exact effect and recovery"*).
4. **`webhooks/section.tsx`** — `DeveloperSection { id: 'webhooks', path: '/developer/webhooks',
   title: 'Webhooks' }`. Renders, against `WTCH-05`'s routes:
   - the subscription list with URL, description, event types, active state, `secret_prefix`,
     `secret_last_rotated_at` and `pending_secret_active_from` — never a secret;
   - **create** with the same one-time-secret presentation as deliverable 2 (`WTCH-05`'s create
     response returns the secret once), honouring `Idempotency-Key`;
   - **edit** and **delete** with `If-Match` and the 409 reload guidance;
   - **test**: `POST /{id}/test`, showing the receiver's status code and elapsed time, plus a plain
     explanation that the ping is signed exactly like a real delivery and is **not** retried;
   - **rotate secret**, showing the overlap window `WTCH-05` reports;
   - the PRD §38.5 endpoint cap explained before it is hit, with the server's named error surfaced
     verbatim when it is.
5. **Signature verification example (PRD §31.2's empty state).** The section renders a copyable
   verification snippet in **curl, TypeScript and Python** showing: the three PRD §34.8 headers; the
   signature input `<timestamp>.<raw_request_body>`; the five-minute replay window; event-id
   deduplication; and, prominently, the **raw-body** requirement (`FND-05` deliverable 3: *"the raw
   bytes as sent, never a re-serialised object — re-serialisation is the classic signature break"*).
   The snippets are imported from `docs/api/guides/webhooks.md`'s published strings (`PLTF-01`
   deliverable 6), not re-typed here — deliverable 8.
6. **`widget/section.tsx`** — `DeveloperSection { id: 'widget', path: '/developer/widget',
   title: 'Widget sandbox' }`. Sub-PRD **D16** governs it:
   - **embed configuration**: the customer's exact allowed origins (entered as absolute
     `https://host[:port]` values, validated client-side for shape only and echoed exactly), the
     feature subset, and the theme tokens from `PLTF-05`'s closed set;
   - **copyable embed snippet** — the `<script>` tag plus the `Aer.mount({...})` call, generated from
     the entered configuration;
   - **copyable backend snippet** in curl/TypeScript/Python for `POST /v1/widget-sessions`, with an
     explicit statement that it must run **on the customer's server** with a service credential
     (PRD §33.5 step 2; PRD §8.10);
   - a prominent, non-dismissible notice: *"a long-lived service credential must never be entered
     here or used in a browser"* (PRD §8.10; `DEV-002`);
   - **live preview**: an optional field accepting a widget-session **token** the developer minted out
     of band. It is held in component memory only, never stored, never logged, never placed in a URL
     and cleared on navigation. There is **no** field for a service credential and **no** call to
     `POST /v1/widget-sessions` anywhere in this area;
   - **synthetic questions only by default** (PRD §31.2): the preview's question picker defaults to
     the committed synthetic set, pinned by `PLTF-04`'s `seed_dataset_version` when a sandbox exists;
     free text is permitted but the default is synthetic and the state is visible (sub-PRD **D18**'s
     caveat is restated in the UI copy).
7. **`PLTF-01`'s credential panel slot filled (sub-PRD D15).** The `service-accounts` section
   registers the `CREDENTIAL_PANEL_SLOT` renderer from `PLTF-01`'s `developer-context.ts`, supplying
   the PRD §32.8 credential-derived fields — **current key prefix, scopes and expiry** — so
   `/developer/api` shows them without `PLTF-01` depending on `IDNT-06`. Registration is a call into
   `PLTF-01`'s exported API; **no file of `PLTF-01`'s is edited**.
8. **Snippets have one home.** Every code snippet rendered by this ticket is imported from the
   strings `PLTF-01` publishes in `docs/api/guides/{webhooks,widget}.md` (`PLTF-01` deliverable 6). A
   test asserts string equality, so the documentation and the screen cannot drift.
9. **The ten PRD §31.3 states where applicable** — the webhook test ping and any long-running action
   render `IDLE`, `VALIDATING`, `RUNNING`, `COMPLETED`, `FAILED` with a visible title, plain-language
   explanation, allowed next action and request id, using `packages/ui`'s async-state components
   (`RUNT-06`). A spinner alone is a defect.
10. **Organisation scoping and accessibility.** Every cache key is produced by `RUNT-05`'s
    `orgScopedKey(...)` and purged on switch; each section renders one programmatic heading, labelled
    fields, error summaries and live regions; destructive actions name their exact effect and
    recovery; colour is never the only status signal; dates display as `3 Aug 2026` while payloads
    stay ISO (PRD §31.1, §41.1, §13.1).
11. **Co-located tests** under each section's `__tests__/**`, with recorded responses for `IDNT-06`'s
    and `WTCH-05`'s routes built from those tickets' documented shapes.

Ordering constraint: deliverable 1 before 2 and 3 (the account must exist before a credential is
minted); deliverable 8 before 5 and 6 (the snippet source is the documentation string).

## Acceptance checklist (classified)

- [ ] `[machine]` Each of the three sections registers its `/developer/*` route through `PLTF-01`'s
      section registry with **zero** diff to any file outside its own directory — including zero diff
      to `PLTF-01`'s `feature.tsx`, `section-registry.ts`, `section-contract.ts` and
      `developer-context.ts` (sub-PRD **D13**; `RUNT-05` contract item 6; breakdown plan **A1**)
- [ ] `[machine]` **`AUTH-006` display-once**: after a mint, the secret string is present only inside
      the modal's lifetime; a canary secret is absent from every query cache, every persisted store
      (`localStorage`, `sessionStorage`, cookies, IndexedDB, Cache Storage), every URL, the document
      title, every console line and every re-render after dismissal; there is **no** "show again"
      affordance (PRD §32.8 *"Secrets are never redisplayed"*; §35.4; `AUTH-006`)
- [ ] `[machine]` The `warning` string from `IDNT-06`'s mint response is rendered **verbatim**, and
      the modal cannot be dismissed without the explicit acknowledgement (`IDNT-06` deliverable 6)
- [ ] `[machine]` A read or list never displays `secret_hash` and never displays anything beyond the
      credential `prefix` (PRD §35.4)
- [ ] `[machine]` **`AUTH-006` rotation UX**: rotation requires a reason; `overlap_seconds` defaults
      to `0` with an explicit "the old key stops working immediately" statement; a value above 86 400
      is refused client-side **and** the server's `OVERLAP_TOO_LONG` is surfaced verbatim when
      returned; a non-zero overlap is displayed with its end time (PRD §38.4 *"explicit and
      auditable"*; `IDNT-06` deliverable 7)
- [ ] `[machine]` Revocation requires a reason and names its exact effect and recovery (PRD §41.1)
- [ ] `[machine]` **No scope list, no credential grammar, no hashing** in this area — the scope picker
      is built from `GET /v1/service-accounts/scopes` and a source scan finds no scope literal, no
      prefix grammar and no hashing (PRD §35.1, §45.2; breakdown plan §9 **R5**)
- [ ] `[machine]` **ETag handling**: edit and disable send `If-Match` from the read's `ETag`; a stale
      value produces an explicit reload-and-retry state carrying the request id, never a silent
      overwrite (PRD §16.2, §34.1, §34.9; `REC-004`-style concurrency behaviour)
- [ ] `[machine]` **Webhook secret display-once**: create and rotate-secret show the secret once under
      the same rules as the credential modal; list and read never show it, only `secret_prefix` and
      the rotation timestamps (`WTCH-05` deliverable 1; PRD §32.8)
- [ ] `[fixture]` **Signature-verification example fidelity**: the rendered curl/TypeScript/Python
      snippets are **string-identical** to `docs/api/guides/webhooks.md`'s published strings, and each
      shows the three PRD §34.8 headers, the `<timestamp>.<raw_request_body>` input, the five-minute
      window, event-id deduplication and the raw-body warning (PRD §31.2 empty state; §34.8;
      `FND-05` deliverable 3)
- [ ] `[machine]` **Webhook test ping**: the result shows the receiver's status code and elapsed time
      and states that the ping is signed like a real delivery and is not retried; the PRD §38.5
      endpoint cap is explained before it is hit and the server's named error is surfaced verbatim
      when it is (`WTCH-05` deliverable 1; PRD §38.5)
- [ ] `[machine]` **`DEV-002` — the widget section cannot leak a credential**: a source scan proves
      this area contains no reference to `POST /v1/widget-sessions`, no service-credential input
      field, no `apiKey`/`api_key` parameter and no code path that sends a credential string to any
      endpoint; the non-dismissible notice is present (PRD §8.10 *"long-lived service credentials MUST
      NOT enter the browser"*; `IDNT-07` deliverable 1; sub-PRD **D16**)
- [ ] `[machine]` **`DEV-002` — the preview token is memory-only**: a canary widget token entered in
      the preview appears in no storage, no URL, no cache, no console line and no rendered attribute,
      and is cleared on navigation (PRD §8.10 *"no token storage in localStorage"*; §33.5 step 6)
- [ ] `[machine]` **Exact origins are echoed exactly**: an entered origin is transmitted and displayed
      byte-for-byte with no normalisation that could widen it (no wildcard expansion, no trailing
      slash added or removed silently); a wildcard or relative value is rejected client-side with a
      named message, and the server's `INVALID_ORIGIN` is surfaced verbatim when returned
      (PRD §21.1 *"exact widget origins"*; §38.4; `AUTC-05`)
- [ ] `[machine]` **Synthetic by default** (PRD §31.2): the preview's question picker defaults to the
      committed synthetic set and the state is visible; free text is permitted but never the default
      (sub-PRD **D18**)
- [ ] `[fixture]` **Embed and backend snippet fidelity**: the rendered embed snippet and the backend
      `POST /v1/widget-sessions` snippet are string-identical to `docs/api/guides/widget.md`'s
      published strings, with the entered configuration substituted only into the declared
      placeholders (PRD §32.8; `PLTF-01` deliverable 6)
- [ ] `[machine]` **PRD §32.8 credential-derived fields** — current key prefix, scopes and expiry —
      are rendered here and supplied to `PLTF-01`'s `CREDENTIAL_PANEL_SLOT`, with **no file of
      `PLTF-01`'s edited** (sub-PRD **D15**)
- [ ] `[machine]` **No role literal and no permission logic** in this area; visibility and action
      availability come from the shell's `FND-06` decision (PRD §38.1; §45.2)
- [ ] `[machine]` **Organisation scoping**: every cache key is produced by `orgScopedKey(...)` and
      purged on switch — asserted with `RUNT-05`'s `apps/web/test/org-scope-conformance.ts`
      (PRD §31.1; `AUTH-002`)
- [ ] `[machine]` **PRD §41.1 universal UI acceptance**: no research content and no secret in any URL
      query string, page title or error-telemetry payload; request ids copyable from errors;
      destructive actions name exact effect and recovery; colour never the only status signal; dates
      as `3 Aug 2026` (PRD §41.1)
- [ ] `[machine]` **PRD §13.1 accessibility**: zero WCAG 2.2 AA violations at 360 px, 768 px and
      1280 px on each of the three sections; complete keyboard operation with visible focus; one
      programmatic heading per section; labelled fields; error summaries; live regions for the test
      ping (PRD §13.1, §41.1)
- [ ] `[machine]` **PRD §31.3 states** for the test ping and every long-running action render title,
      explanation, next action and request id (PRD §31.3)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (standing item, PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — this area declares no `/v1` type of
      its own and hand-edits no generated file (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**`AUTH-006`**, **`DEV-002`**,
      `E27-DEVELOPER`, proposed `UAT-DEV-02` per sub-PRD **Q-PLTF-1**), user-visible change and
      non-goals, schema/API/event compatibility impact (consumer only), **tenant/PII/security impact**
      (display-once secrets, no credential path in the browser, exact origins, memory-only preview
      token), source/licence impact (none), cost/memory/latency impact (the test ping consumes
      `WTCH-05`'s rate budget), rollback path (revert; the three sections disappear with zero diff to
      `PLTF-01`), known gaps (**Q-PLTF-7** sandbox route placement)
- [ ] `[human]` **`AUTH-006` rehearsed on the screen** — completes `IDNT-06`'s deferred `[human]` row
      (*"The `/developer/service-accounts` screen is `PLTF-07`, so the screen half of this run is not
      required to merge this ticket"*): mint a credential, copy it once, confirm it cannot be re-read
      anywhere, call a `/v1` endpoint with it, rotate it, and confirm the old value is rejected
      immediately (PRD §30.2 `AUTH-006`; §43.4). Runs at Gate 2 — **not required to merge**
- [ ] `[human]` **`DEV-002` integration walkthrough** (proposed `UAT-DEV-02`, PRD §41.4's Integration
      stage exit condition *"No long-lived browser secret"*): follow this screen's instructions end to
      end — create a scoped expiring service account, configure a webhook and verify a signature,
      configure widget origins, mint a session from a simulated backend and preview the embed — and
      confirm no long-lived secret ever entered the browser (PRD §41.4; §43.4). **Not required to
      merge**
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python **source** is written here;
      the Python snippets are strings executed by `PLTF-03`'s suite (PRD §45.3)
- No SDK-telemetry criteria — this area emits no SDK telemetry; the closed allowlist is
      `PLTF-02`/`PLTF-03` (sub-PRD **D7**)
- Origin-validation criteria here are limited to **input handling and exact echo**; the enforcing
      checks are `PLTF-05` deliverable 5 (browser) and `AUTC-05`/`RUNT-02` (server) — this screen must
      not re-implement them (PRD §8.10; sub-PRD **D9**)

## Test plan

Reviewer steps, **all offline**: no network, no live API, no running server. Every HTTP interaction
is a recorded response for `IDNT-06`'s and `WTCH-05`'s documented shapes; the DOM environment is
`apps/web`'s test runner; the clock and random source are fixed.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @<scope>/web`. Suites live under
   `apps/web/src/features/developer/{service-accounts,webhooks,widget}/__tests__/`. Copy the
   construction pattern from `PLTF-01`'s section tests and `14-search-product`'s co-located screen
   tests.
3. **Read the recorded responses against the source tickets.** Compare each fixture with `IDNT-06`
   deliverables 3, 6, 7 and 9 and `WTCH-05` deliverable 1. **A drifted fixture makes every assertion
   vacuous** — check this first.
4. **`registration.test.ts`** — mount `PLTF-01`'s registry with these three directories present;
   assert the three routes register and that `git status --porcelain` shows no change to any
   `PLTF-01` file.
5. **`secret-display-once.test.ts`** — mint with a canary secret; assert it renders once; dismiss;
   then enumerate the query cache, `localStorage`, `sessionStorage`, cookies, IndexedDB, Cache
   Storage, `window.name`, every URL, the document title and the console; assert the canary is absent
   from all of them. Repeat for the webhook create and rotate-secret responses. Confirm the test
   enumerates **all** of those, not only `localStorage`.
6. **`rotation.test.ts`** — rotate without a reason (blocked client-side); with `overlap_seconds` 0
   (assert the immediate-effect statement); with 3 600 (assert the end time is shown); with 86 401
   (assert the client refusal **and** that a server `OVERLAP_TOO_LONG` response is surfaced verbatim
   when injected).
7. **`scopes.test.ts`** — the picker is built from the recorded `GET /v1/service-accounts/scopes`;
   the `FORBIDDEN_FOR_SERVICE_ACCOUNTS` entries render with their reason; then a source scan for
   scope literals.
8. **`etag.test.ts`** — edit and disable without `If-Match` (blocked), with a stale value (assert the
   409 reload state and the request id), with the current value.
9. **`webhooks.test.ts`** — create, edit, delete, test ping (status and elapsed shown, "not retried"
   stated), rotate secret; the PRD §38.5 cap explained and the server's named error surfaced.
10. **`snippets.test.ts`** — string-compare every rendered snippet with `docs/api/guides/webhooks.md`
    and `docs/api/guides/widget.md`; confirm the comparison is exact, not a substring match.
11. **`widget-no-credential.test.ts`** — source scan for `widget-sessions`, `service-account`,
    `apiKey`, `api_key` and any credential-shaped input; assert none; assert the non-dismissible
    notice renders.
12. **`widget-preview-token.test.ts`** — enter a canary widget token; navigate away; enumerate all
    storages, URLs, caches, attributes and console lines; assert absence.
13. **`origins.test.ts`** — enter origins with a trailing slash, a wildcard, a relative path, an
    uppercase host, a non-HTTPS scheme and a non-default port; assert exact echo for the valid ones
    and named client refusals for the invalid ones; assert the server's `INVALID_ORIGIN` is surfaced
    verbatim when injected.
14. **`org-scope.test.ts`**, **`a11y.test.ts`**, **`states.test.ts`** — deliverables 9 and 10.
15. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether the
    secret can survive in a query cache, a React DevTools snapshot, an error boundary or a retry of
    the mint request; whether a failed rotate can leave the screen showing a secret that was never
    persisted server-side; whether two browser tabs editing one service account can both write with
    the same `ETag`; whether the copy control can copy more than the shown value; whether an entered
    origin can be normalised into a wider one; whether the preview token can reach a URL through a
    router state or a deep link; whether the webhook test ping can be driven in a loop past
    `WTCH-05`'s rate limit; whether any error message echoes the secret or the token.
16. The two `[human]` rows run against a locally started stack (`pnpm stack:up`, `RUNT-09`) at Gate 2
    and are recorded in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies anything in this ticket, update **this ticket file**
first (version note + changelog line in the PR), re-publish with
`.claude/scripts/publish-tickets.mjs --sync`, then change code. Silent divergence is an incomplete
ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`IDNT-06` does not return a field this screen must display** (for example a rotation's end time
  or a credential's last-used timestamp). → `IDNT-06`'s own feedback obligation names the path:
  *"`PLTF-07` needs a field this area does not return … amend this ticket's deliverable 3 in a docs PR
  and `--sync`; do not let `20-developer-platform` write `apps/api/src/routes/service-accounts/**`"*.
  Raise the docs PR against `docs/prd/13-identity-surface/tickets/IDNT-06-*.md` and this ticket
  together.
- **`WTCH-05` does not return a field this screen must display.** → Same shape: a docs PR against
  `docs/prd/16-monitor-alerts/tickets/WTCH-05-*.md` and this ticket, `--sync` both. Never write
  `apps/api/src/routes/webhook-subscriptions/**` from here.
- **`PLTF-01`'s section contract or credential-panel slot cannot carry what this ticket needs.** →
  Amend `PLTF-01`'s deliverable 3 or 4 and this ticket together in **one** docs PR and `--sync` both.
  **Never edit `PLTF-01`'s files directly** — that is the file-scope defect breakdown plan §4 exists
  to prevent, and it would break the zero-diff property `PLTF-01` is asserted on.
- **A reviewer asks for a "reveal secret" affordance** for usability. → PRD §32.8 is unconditional:
  *"Secrets are never redisplayed."* Record the request in
  `docs/prd/20-developer-platform/README.md` and escalate as a **product change** (PRD §45.5). Never
  add it, and never cache the secret to make it possible later.
- **The widget preview would be much better if the screen could mint a session.** → It structurally
  cannot: `IDNT-07` refuses cookie principals by design (sub-PRD **D16**), and building a
  browser-reachable mint path would falsify `DEV-002`. If a first-party preview is genuinely
  required, that is a **product and security change**: raise it in
  `docs/prd/20-developer-platform/README.md` and against
  `docs/prd/13-identity-surface/tickets/IDNT-07-*.md` **before** any code, with the **Founder** as
  owner. Never add a credential input to this screen.
- **PRD §16.3's nine scopes are insufficient for something this screen must offer.** → The scope list
  is a product/API contract. `IDNT-06`'s feedback obligation routes it: raise it in
  `docs/prd/13-identity-surface/README.md` with the **Founder** as owner, and to `FND-03` if the list
  is generated. Never maintain a second list here (PRD §35.1).
- **A snippet must differ between the documentation and the screen.** → They are one string by design
  (deliverable 8). Amend `PLTF-01`'s deliverable 6 and this ticket in one docs PR; never fork the
  snippet.

**3. Escalation.** *"Secrets are never redisplayed"* (PRD §32.8), *"Old key fails immediately after
rotation/revocation"* (`AUTH-006`) and *"long-lived service credentials MUST NOT enter the browser"*
(PRD §8.10) are release requirements with MUST force. If display-once presentation or the
no-credential-in-the-browser rule proves unimplementable on these screens as specified, that
overturns decisions recorded in `13-identity-surface`'s sub-PRD **D5** and this module's **D16**.
Stop, raise an ADR under `docs/adr/` (breakdown plan **A9**), write back to
`docs/prd/breakdown-plan.md` and `docs/prd/20-developer-platform/README.md`, and escalate to the
human. Never cache a secret, add a re-display path, or add a credential input inside this ticket.
