---
id: IDNT-02
title: Invitation lifecycle routes
module: 13-identity-surface
lane: 13-identity-surface
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [IDNT-01, DATA-04]
blocks: [IDNT-08]
---

# IDNT-02 — Invitation lifecycle routes

Implements PRD §8.1 (access and organisation workspaces), §35.4 (`invitation` table) and §38.2
(invitation lifetime), carrying requirement `AUTH-001` ("Access is invite-only; public signup is
absent"). **No ADR — the decision is already made in PRD §8.1, §35.4 and §38.2; this is build ticket 2
of 9 against it.**
Parent sub-PRD: [13-identity-surface README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`IDNT-01` — Auth/session routes and organisation-switch context](IDNT-01-auth-session-routes-and-organisation-switch-context.md);
`DATA-04` — Tenancy and identity tables/repositories
([`01-app-data`](../../01-app-data/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope, exposing `AUTC-01`'s
invitation primitive and `DATA-04`'s single-use repository over the fixed PRD §34.1/§34.9 wire
contract — not a new subsystem decision.

## Background + basis

**Invite-only is a MUST, and its absence-of-signup half is tested by hand.** PRD §8.1:

> **Access MUST be authenticated and invitation-controlled. Public registration MUST be disabled.** …
> Owner/Admin MUST manage invitations, memberships, limits and security settings according to
> permission.

PRD §30.2 `AUTH-001`:

> | AUTH-001 | Access is invite-only; public signup is absent | `/accept-invite`, `/login` |
> invitation/session endpoints | App | **Expired, reused and wrong-email invites fail** |

PRD §41.2:

> | `UAT-AUTH-01` | Open signup URL without invitation | No public account creation path;
> marketing/login only |
> | `UAT-AUTH-02` | Accept same invite twice | First succeeds; second shows consumed/invalid with **no
> new membership** |

**The persistence contract is normative.** PRD §35.4:

> | `invitation` | `id`, `organization_id`, `email_normalized`, `role`, `token_hash`, `expires_at`,
> `accepted_at`, `invited_by_actor_id` | **token shown/sent, only hash stored; one use** |

PRD §38.2 fixes the lifetime: *"Invitation lifetime | 72 hours; single use"*.

**The primitives already exist and must not be re-implemented.** `AUTC-01` (`02-auth-core`)
deliverable 7 exports:

> - `createInvitation({ organizationId, emailNormalized, role, invitedByActorId }, deps)` → returns the
>   **plaintext token exactly once** in memory plus the row to persist, which contains only
>   `token_hash`. Token ≥256 bits from `Random`, URL-safe encoded.
> - `consumeInvitation({ token, emailNormalized }, now, deps)` →
>   `{ ok: true, invitation } | { ok: false, reason: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_ACCEPTED' | 'EMAIL_MISMATCH' }`.
>   Consumption is a **compare-and-set on `accepted_at`** so two concurrent accepts produce exactly one
>   membership (`UAT-AUTH-02`); the second returns `ALREADY_ACCEPTED`.
> - `acceptInvitation(...)` — the **only** user-creating path; creates or links the `user`, creates the
>   `membership`, then calls `rotateSessionId(..., 'login')`.

`DATA-04` deliverable 5 gives the matching repository behaviour:

> `invitations`: single use — `accept(tokenHash)` is a conditional update that succeeds only when
> `accepted_at IS NULL` and `expires_at > now`, returning a discriminated result
> (`ACCEPTED | EXPIRED | ALREADY_USED | NOT_FOUND`) so `IDNT-02` can render AUTH-001's "Expired, reused
> and wrong-email invites fail" without a second query. Only the hash is stored.

**Who may invite.** PRD §38.1 row *"Manage members/invitations"*: Owner ✓, Admin *"✓ except Owner
constraints"*, Researcher/Viewer/Developer/service account —. The decision comes from
`FND-06.evaluate()`; this route never re-states it (PRD §45.2; plan §9 **R5**).

**Wire rules.** PRD §16.1: base path `/v1`; *"Organisation is derived from authenticated context, not
trusted request fields"*; *"Every response includes `request_id`"*. PRD §34.1: opaque
resource-prefixed ids; ISO 8601 UTC timestamps; `page_size` 1–100 default 25 with an opaque
`next_cursor`; *"Tenant | Never accepted in a request body; derived from authenticated
session/key/widget token"*. PRD §34.9 is the closed error catalogue —
`400 INVALID_REQUEST`, `401 AUTHENTICATION_REQUIRED`, `403 MFA_REQUIRED`, `403 RECENT_AUTH_REQUIRED`,
`404 RESOURCE_NOT_FOUND` (*"same response for forbidden/other tenant"*), `409 IDEMPOTENCY_CONFLICT`,
`429 RATE_LIMITED`, `500 INTERNAL_ERROR` — in the uniform PRD §16.1 body
`{ error: { code, message, request_id, details, retryable } }`.

**PRD §34 contains no invitation payload example** (§34.2–§34.8 are search, answers, SSE, snapshots,
coverage/compare, records and webhooks). Sub-PRD **D4**: the binding shapes are §34.1 conventions +
§34.9 errors + the PRD §35.4 columns above + the generated types from `FND-04`'s
`schemas/openapi/openapi.yaml`, which commits to documenting *"the PRD §16.3 authentication and
machine-access endpoints"*. Never edit `schemas/openapi/**` from here.

**Routing.** `RUNT-01`'s A1 contract makes `apps/api/src/routes/invitations/` an autoloaded area at
`/v1/invitations`; adding it produces *"zero diff outside that area's own directory"*. The shared
toolkit (`getIdentityContext`, `mapAuthFailure`, `emitIdentityAudit`, route presets) is
`IDNT-01`'s `apps/api/src/routes/auth/_lib/**`, imported read-only (sub-PRD **D3**).

**Accepted caveats carried forward, documented not enforced here:**

- **A transactional-email provider is confirmed, and this ticket still sends nothing.** plan §8
  **Q14** is settled: Resend on the Resend Free transactional tier, behind the existing
  `EmailTransport` port, owned by `WTCH-04` and `WTCH-09` in `16-monitor-alerts`. That port lives in
  `apps/worker/src/handlers/notifications/email/**` as an alert channel keyed on `alert_delivery.id`;
  this module owns no worker path, has no edge to module 16, and cannot add one — 13 → 16 is a forward
  module edge that plan §3 forbids and plan §9 **R6** names. **No ticket in any module sends an
  *invitation* email**, and that allocation gap is sub-PRD **OQ4** (Architect / plan owner — not a
  Founder ruling and not a cost question). PRD §35.4 permits *"token shown/**sent**"*, so this ticket
  returns the acceptance URL **exactly once** in the creation response for the inviter to deliver out
  of band — the same behaviour as before, now held up by §35.4 rather than by the absence of a
  provider — and states the unallocated send path as a known gap on the PR (PRD §45.4). There is
  deliberately **no** re-read path: the plaintext exists once, in memory.
- **Membership rows are created by `acceptInvitation`, not by this route.** Role changes and removal
  are `IDNT-03`.
- **Durable audit persistence** is sub-PRD **OQ3**; events are emitted through `IDNT-01`'s
  `emitIdentityAudit` seam.

## Goal

Produce the `apps/api/src/routes/invitations/` route area serving invitation create, list, revoke,
preview and accept under `/v1/invitations`, so that the product has exactly one path by which a user
account can come into existence. Completion is mechanically checkable: an Owner/Admin can invite an
address and receives the acceptance URL exactly once; a Researcher cannot invite; accepting a valid
invitation creates exactly one membership and a signed-in session; accepting the same invitation a
second time creates **no** membership and reports a consumed reason; expired and wrong-email tokens
fail; an invitation belonging to another organisation is indistinguishable from one that does not
exist; and no response, log line or audit event outside the single creation response contains the
plaintext token.

## Non-goals

- **No invitation primitive.** `packages/auth/src/core/invitations.ts` is `AUTC-01`; the single-use
  compare-and-set repository is `DATA-04`. This area calls both.
- **No user or membership table access outside those repositories.** `packages/database/**` is
  `01-app-data` (plan **A3**).
- **No permission matrix.** PRD §38.1 lives in `packages/domain/src/access/**` (`FND-06`).
- **No email, SMS or any delivery channel, and no provider call.** The plan §8 **Q14** provider
  (Resend) sits behind the `EmailTransport` port owned by `WTCH-04`/`WTCH-09` in `16-monitor-alerts`.
  This area adds no transport, no provider HTTP client and no `RESEND_API_KEY` (sub-PRD **D14**).
- **No membership management.** Role change, suspension and removal are `IDNT-03`
  (`apps/api/src/routes/members/**`).
- **No sign-in, session or organisation-switch routes.** `IDNT-01` (`routes/auth/**`).
- **No screens.** `/accept-invite` and `/settings/members` are `IDNT-08` (sub-PRD **D8**).
- **No admission stages, no error catalogue, no OpenAPI.** `RUNT-02`, `RUNT-01`, `FND-04`.
- **No cross-boundary suites.** `tests/**` is `23-assurance` (`ASSR-01`, `ASSR-06`); this ticket
  carries its own co-located tenant assertions (plan §9 **R8**).

## File-scope (write-owns)

- `apps/api/src/routes/invitations/**` — the route area, including its A1 entry file
  `index.ts` (default-exported Fastify plugin + `area` config).
- `apps/api/test/routes/invitations/**` — this ticket's own unit/integration tests (plan §1.1).
- `apps/api/package.json` — **append-only** if a dependency is required (plan §1.1).

Does not touch:

- `apps/api/src/routes/auth/**` — `IDNT-01`, including `_lib/**`, which this ticket **imports** but
  never writes.
- `apps/api/src/routes/{members,mfa,sso,service-accounts,widget-sessions}/**` — `IDNT-03`…`IDNT-07`.
- `apps/api/src/routes/{health,system-status}/**` — `RUNT-08`; every other route area belongs to `14`,
  `15`, `16`, `17`, `19`, `20` or `22` (plan §4).
- `apps/api/src/{server.ts,app.ts,bootstrap,errors,plugins,middleware,sse}/**` — `RUNT-01`, `RUNT-02`,
  `RUNT-03`.
- `packages/auth/**`, `packages/database/**`, `packages/domain/**`, `packages/contracts/**`,
  `schemas/openapi/**`, `packages/ui/**`, `packages/observability/**` — `02-auth-core`, `01-app-data`,
  `00-foundation`, `RUNT-06`, `RUNT-07`.
- `apps/web/**`, `apps/worker/**`, `apps/admin/**`, `apps/widget/**`, `infra/**`, `tests/**`, root
  manifests, lockfiles, `.github/workflows/**`.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, `existingFiles:
['.gitkeep']`), so no prior ticket has written these paths and none is in flight against them. Under
the A1 autoload convention (`RUNT-01` contract §1/§6) `apps/api/src/routes/invitations/` is an
independent directory whose addition produces zero diff elsewhere, so it is disjoint from the six
sibling identity areas and from every product module's route areas by construction — there is no shared
route index to contend for. This ticket sits in wave 2 with `IDNT-03`, `IDNT-04`, `IDNT-05` and
`IDNT-06`, which may all run as concurrent lanes (plan §7: 9 tickets, 3 minimum waves, 5 useful lanes);
each writes a different `routes/<area>/` directory. `apps/api/package.json` is append-only shared
(plan §1.1).

## Deliverables

1. **`apps/api/src/routes/invitations/index.ts`** — the A1 entry file: default-exported
   `FastifyPluginAsync` and `export const area = { admission: 'public' } satisfies RouteAreaConfig`.
   The area default is `public` because `preview` and `accept` must be reachable by a signed-out
   invitee; **every management route declares `admission: 'tenant'` explicitly** using `IDNT-01`'s
   `TENANT_ROUTE` preset. A route without an explicit profile fails the suite.
2. **`POST /v1/invitations`** (`TENANT_ROUTE`, `Idempotency-Key` supported) — create.
   - Request: `{ email, role }`. `email` is normalised with the same normalisation `DATA-04` applies to
     `user.email_normalized`; `role` is validated against the `packages/contracts` role enum (`FND-03`)
     and **must not** be a value `FND-06` forbids for invitation.
   - Permission: `FND-06.evaluate()` for the *"Manage members/invitations"* action; Admin is subject to
     the `OWNER_CONSTRAINTS` condition (PRD §38.1) — inviting at Owner role is an Owner-only action.
     A refusal maps through `IDNT-01`'s `mapAuthFailure`.
   - Ordering, fixed: permission → `AUTC-01.createInvitation(...)` → persist the row through
     `DATA-04`'s `invitations` repository inside one `withTenantTransaction` → emit audit → respond.
   - Response `201`: `{ id, email_normalized, role, expires_at, created_at, status: 'PENDING',
     accept_url, schema_version, request_id }`. **`accept_url` is the only place the plaintext token
     ever appears** (sub-PRD **D5**; PRD §35.4 *"token shown/sent, only hash stored"*); it is composed
     from the configured web base URL plus the token and is never persisted, logged or re-returned.
   - `expires_at` is `now + SESSION_DEFAULTS.invitationLifetimeSeconds` (259 200 s = 72 h, PRD §38.2);
     the number is **not** written in this area.
3. **`GET /v1/invitations`** (`TENANT_ROUTE`) — list the calling organisation's invitations through the
   tenant-scoped repository. Query: `status?` (`PENDING | ACCEPTED | EXPIRED | REVOKED`), `page_size`
   1–100 default 25, opaque `cursor` (PRD §34.1). Each item is `{ id, email_normalized, role,
   status, expires_at, created_at, accepted_at, invited_by_actor_id }` — **never** `token_hash` and
   **never** a token.
4. **`POST /v1/invitations/{invitation_id}/revoke`** (`TENANT_ROUTE`) — marks a `PENDING` invitation
   unusable through the repository. An invitation belonging to another organisation, or an absent id,
   returns `404 RESOURCE_NOT_FOUND` from the **same code path**, so the bodies are byte-identical apart
   from `request_id` (PRD §16.5, §34.9). Revoking an already accepted or revoked invitation returns
   `400 INVALID_REQUEST` with `details.reason` from the closed set below. Emits an audit event.
5. **`POST /v1/invitations/preview`** (`PUBLIC_ROUTE`) — the accept screen's read.
   - Request body `{ token }`. The token travels in the **body, never a query string**, because a URL
     is logged and PRD §22 requires logs to *"exclude … credentials"*.
   - Response `200`: `{ organization: { name }, role, email_masked, expires_at }` — enough for
     `IDNT-08` to render "You have been invited to X as Researcher", with the invited address **masked**
     (for example `j••••@example.com`) so a stolen link does not disclose a full address.
   - Any invalid token — absent, expired, already accepted — returns `400 INVALID_REQUEST` with the
     closed `details.reason` set and **identical timing class**, so the endpoint is not an
     invitation-enumeration oracle.
6. **`POST /v1/invitations/accept`** (`PUBLIC_ROUTE`, rate-limited) — the only user-creating path in the
   product.
   - Request `{ token, email, display_name?, password? }` — the credential fields are exactly those
     `AUTC-01`'s `acceptInvitation` accepts; this route adds none.
   - Ordering, fixed and load-bearing: `assertCsrf` (PRD §38.2) → `AUTC-01.consumeInvitation({ token,
     emailNormalized })` **compare-and-set** → `acceptInvitation(...)` creating/linking the `user` and
     creating the `membership` → `rotateSessionId(..., 'login')` → set the session cookie via
     `buildSessionCookie` → activate the invited organisation → emit audit → respond `200` with the
     `GET /v1/auth/session` body shape (`IDNT-01` deliverable 6).
   - **Exactly one membership per invitation**: consumption and membership creation happen inside one
     transaction; two concurrent accepts of the same token produce one success and one
     `ALREADY_USED` (`UAT-AUTH-02`, `AUTC-01` deliverable 7).
   - Failure mapping is `400 INVALID_REQUEST` with `details.reason` from the **closed set**
     `{ 'INVALID', 'EXPIRED', 'ALREADY_USED', 'EMAIL_MISMATCH' }` (sub-PRD **D12** — PRD §34.9 is closed
     and no new code is invented). `NOT_FOUND` maps to `'INVALID'` so an unknown token is
     indistinguishable from a malformed one. All four responses share one HTTP status and one timing
     class.
7. **Rate limits.** `preview` and `accept` declare a rate-limit ledger through `RUNT-02`'s
   configuration keyed by client IP (there is no organisation context yet). PRD §38.5 gives no
   invitation number, so the committed safe default lives in config, not in code (PRD §39.6 layer 1). A
   `429 RATE_LIMITED` carries `Retry-After` and the caller's own limit/remaining/reset only, with no
   other-tenant information (PRD §38.5).
8. **Audit events** (`IDNT-01`'s `emitIdentityAudit`) for created, revoked, accepted and every
   accept/preview failure, carrying `{ action, actorId, organizationId, resourceType: 'INVITATION',
   resourceId, result, requestId }` — never the token, never the plaintext email of a failed lookup
   (PRD §22, §35.6).
9. **`apps/api/test/routes/invitations/**`** — this ticket's suites, built on `IDNT-01`'s exported
   `apps/api/test/routes/auth/identity-route-harness.ts` (two seeded organisations, authenticated
   request helpers) and `DATA-04`'s `packages/database/test/tenancy/factories.ts`.

## Acceptance checklist (classified)

- [ ] `[machine]` The area registers as `apps/api/src/routes/invitations/` and serves under
      `/v1/invitations` with **zero** diff to any tracked file outside that directory — asserted with
      `RUNT-01`'s `apps/api/test/route-area-conformance.ts` (plan **A1**)
- [ ] `[machine]` Every route declares an explicit admission profile; a route without one fails the
      suite (`RUNT-02` deliverable 1)
- [ ] `[machine]` `POST /v1/invitations` as Owner and as Admin succeeds; as Researcher, Viewer,
      Developer or a service credential it is refused by `FND-06.evaluate()`, and this area contains no
      role literal — asserted by a source scan for role strings (PRD §38.1; `AUTH-003` boundary;
      plan §9 **R5**)
- [ ] `[machine]` The creation response is the **only** response in the whole area containing the
      plaintext token; a canary token value is absent from every list/preview/accept response, every
      log line and every audit event (PRD §35.4, §22; sub-PRD **D5**)
- [ ] `[machine]` `expires_at` equals `created_at + 72 h` and is derived from
      `SESSION_DEFAULTS.invitationLifetimeSeconds`; no literal `72`, `259200` or equivalent appears in
      this area (PRD §38.2)
- [ ] `[machine]` **`AUTH-001` core matrix:** a valid token accepts once and creates exactly one
      membership; the same token a second time returns `400 INVALID_REQUEST` with
      `details.reason === 'ALREADY_USED'` and creates **no** membership; an expired token returns
      `'EXPIRED'`; a token presented with a different email returns `'EMAIL_MISMATCH'`; an unknown token
      returns `'INVALID'` (PRD §30.2 `AUTH-001` *"Expired, reused and wrong-email invites fail"*;
      `UAT-AUTH-02`)
- [ ] `[machine]` Two concurrent accepts of one token produce exactly one success, one `ALREADY_USED`
      and exactly one membership row — asserted with a concurrency test against the real repository
      (PRD §35.4 *"one use"*; `AUTC-01` deliverable 7)
- [ ] `[machine]` All four accept-failure responses share one HTTP status and one timing class and
      differ only in `details.reason`, so the endpoint is not an enumeration oracle (PRD §21.1)
- [ ] `[machine]` **Tenant isolation (`SEC-001`, PRD §21.2):** revoking or reading an invitation that
      belongs to another organisation and one that does not exist return **byte-identical**
      `404 RESOURCE_NOT_FOUND` bodies apart from `request_id`; the list endpoint returns only the
      calling organisation's rows (PRD §16.5, §34.9)
- [ ] `[machine]` **Tenant isolation (`SEC-001`):** an architecture assertion over
      `apps/api/src/routes/invitations/**` finds no unscoped `packages/database` import — copy the
      construction pattern from `apps/api/test/admission/architecture.test.ts` (`RUNT-02` deliverable 13)
- [ ] `[machine]` An organisation identifier supplied in body, query or header is rejected
      `400 INVALID_REQUEST` naming the field; the organisation always comes from the authenticated
      context (PRD §34.1, §16.1)
- [ ] `[machine]` `GET /v1/invitations` honours `page_size` 1–100 default 25 and returns an opaque
      `next_cursor`; 0 and 101 are rejected `400 INVALID_REQUEST` (PRD §34.1)
- [ ] `[machine]` `preview` accepts the token only in the request body; a token supplied as a query
      parameter is rejected, and no request URL recorded by the logger contains a token
      (PRD §22, §41.1)
- [ ] `[machine]` The area exposes **no** route that creates a user other than `accept` — asserted by
      enumerating the registered routes against a literal expected list (PRD §8.1;
      `UAT-AUTH-01` server half)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `AUTH-001`, `SEC-001`, `UAT-AUTH-01`,
      `UAT-AUTH-02`, the tenant/PII/security impact, the rollback path and the **known gaps** for
      sub-PRD **OQ4** (no ticket sends the invitation email — the plan §8 Q14 provider is confirmed but
      is `16-monitor-alerts`', so the acceptance URL is displayed once under PRD §35.4) and **OQ3**
      (durable audit persistence)
- [ ] `[human]` `UAT-AUTH-02` rehearsed manually against a running stack: accept the same invitation
      twice; the first succeeds, the second shows a consumed/invalid message and the members list shows
      no second membership (PRD §41.2). The screen half is `IDNT-08`, so run this after `IDNT-08`
      merges — **not required to merge this ticket**
- No `[fixture]` criteria — this ticket replays no recorded source or evaluation data; plan §1.1 maps
      `[fixture]` to PRD §40.8 adapter fixtures and PRD §14/§43 evaluation replays, neither of which
      exists at this layer
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)

## Test plan

Reviewer steps, offline, no network and no email provider. Database is a temp-file `app.sqlite`
migrated with `DATA-01`'s runner and seeded through `DATA-04`'s
`packages/database/test/tenancy/factories.ts`; `packages/auth` ports use `AUTC-01`'s in-memory fakes
from `packages/auth/test/support/**`; the harness is `IDNT-01`'s exported
`apps/api/test/routes/auth/identity-route-harness.ts`.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/api`. Suites live under `apps/api/test/routes/invitations/`.
3. **`area-registration.test.ts`** — reuse `apps/api/test/route-area-conformance.ts` (`RUNT-01`);
   assert the derived prefix `/v1/invitations`, then enumerate registered routes against a literal list
   (this is also the "no other user-creating route" assertion).
4. **`create.test.ts`** — permission matrix over Owner, Admin, Researcher, Viewer, Developer and a
   service credential using `FND-06`-backed principals from the harness; assert the `201` body, that
   `accept_url` appears exactly once, and that `expires_at - created_at === 72 h`. Then a source scan
   asserting no role literal and no lifetime literal in `apps/api/src/routes/invitations/**`.
5. **`accept.test.ts`** — table-driven over `{valid, expired, reused, wrong-email, unknown}` with
   `FakeClock` advanced past 72 h for the expired row. Assert status, `details.reason`, membership count
   after each case, and that the response for the valid case matches `IDNT-01`'s session-context shape
   with a rotated session id.
6. **`accept-concurrency.test.ts`** — fire two accepts of one token concurrently against the real
   `DATA-04` repository (not a fake) and assert exactly one success, one `ALREADY_USED` and exactly one
   `membership` row.
7. **`tenant-isolation.test.ts`** — seed organisations A and B; as an A member, revoke and read B's
   invitation and a syntactically valid absent id; byte-compare the two 404 bodies after masking
   `request_id`; assert the list endpoint never returns a B row.
8. **`architecture.test.ts`** — source scan for unscoped `packages/database` imports; copy the pattern
   from `apps/api/test/admission/architecture.test.ts` (`RUNT-02`).
9. **`leak.test.ts`** — force the fake `Random` to produce a `secret-canary-<uuid>` token; run the whole
   area's request matrix; scan every response body except the single creation response, every captured
   log line and every `RecordingAuditSink` event; assert absence. Additionally assert no request URL in
   the captured log contains the token.
10. **`timing.test.ts`** — run each accept-failure reason many times with a fixed clock and assert the
    responses are byte-identical apart from `details.reason` and `request_id`, and that the measured
    distributions fall in one class (the assertion is on the *code path*, not wall-clock timing:
    assert the same repository/primitive call sequence is executed for all four).
11. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether
    consumption and membership creation are genuinely in one transaction; whether the plaintext token
    can reach a log through the request URL, an error message or a serialiser; whether `email_masked`
    can be reversed; whether a revoked invitation can still be accepted.
12. The `[human]` row is run against a locally started stack (`pnpm stack:up`, `RUNT-09`) after
    `IDNT-08` merges, and recorded in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies anything in this ticket, update **this ticket file**
first (version note + changelog line in the PR), re-publish with
`.claude/scripts/publish-tickets.mjs --sync`, then change code. Silent divergence is an incomplete
ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`AUTC-01`'s `consumeInvitation`/`acceptInvitation` cannot be composed into one transaction with
  `DATA-04`'s repository** (the port sequence does not accept the caller's transaction handle) → the
  `UAT-AUTH-02` "one membership" guarantee is at risk. The fix belongs in `02-auth-core` and/or
  `01-app-data`: raise a ticket there and add the edge in `docs/prd/breakdown-plan.md` §5.14/§6.2
  **before** coding. Do **not** re-implement consumption in `apps/api` (PRD §45.2; plan §9 **R5**) and
  do **not** write `packages/database/**` (plan **A3**, plan §9 **R4**).
- **`DATA-04`'s `invitations` repository lacks a needed column or result** (for example a `REVOKED`
  status, which PRD §35.4 does not list) → add a ticket to `01-app-data` and make this ticket
  `blocked_by` it in `docs/prd/breakdown-plan.md` §5.14/§6.2. Until then express revocation with the
  columns PRD §35.4 does define and state the deviation in the PR's known-gaps line (PRD §45.4). Never
  add a migration from here.
- **Returning `accept_url` in the creation response is judged unacceptable, or the invitation must
  actually be emailed** → do **not** solve it here, and do **not** add an `IDNT-02` → `WTCH-04` /
  `WTCH-09` edge: 13 → 16 is a forward module edge that plan §3 forbids and plan §9 **R6** names as a
  misplaced ticket. Record it in `docs/prd/13-identity-surface/README.md` **OQ4** with the
  **Architect / plan owner** as owner — the provider itself is settled (plan §8 **Q14**: Resend behind
  the `EmailTransport` port), so this is a placement question, not a Founder or cost one — and let the
  plan owner allocate the send path in `docs/prd/breakdown-plan.md` §4/§5.14/§5.17/§6.2 **before** any
  code. Changing what the *customer* sees is additionally a product change (PRD §45.5). Never add an
  email client, a provider HTTP call or `RESEND_API_KEY` to `apps/api`.
- **A required failure has no PRD §34.9 code** → the catalogue is closed (sub-PRD **D12**). Express it
  as `400 INVALID_REQUEST` + `details.reason`. If genuinely impossible, raise it in
  `docs/prd/13-identity-surface/README.md` §Open questions with the **Founder** as owner (PRD §45.5
  product/API change) and stop at the nearest existing code.
- **`FND-04`'s OpenAPI does not describe these paths or fields** (sub-PRD **OQ8**) → raise a
  `00-foundation` ticket and add the edge in `docs/prd/breakdown-plan.md`. Never edit
  `schemas/openapi/**` or a generated file.
- **`IDNT-01`'s `_lib` toolkit is missing something this area needs** → that is an `IDNT-01` docs
  change: amend `IDNT-01`'s deliverables and this ticket together in one docs PR and `--sync` both.
  Never write inside `apps/api/src/routes/auth/**`.

**3. Escalation.** `AUTH-001` is a release requirement with MUST force (PRD §8.1: *"Public registration
MUST be disabled"*), and `UAT-AUTH-01`/`UAT-AUTH-02` are founder-run acceptance scripts. If the
single-use, expiry or email-match guarantee proves unimplementable as decided, that overturns a team
decision: escalate for re-review before any code lands. Never weaken the invitation contract inside
this ticket.
