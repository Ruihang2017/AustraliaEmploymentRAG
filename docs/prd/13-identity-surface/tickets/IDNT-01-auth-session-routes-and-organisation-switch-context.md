---
id: IDNT-01
title: Auth/session routes and organisation-switch context
module: 13-identity-surface
lane: 13-identity-surface
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-02]
blocks: [IDNT-02, IDNT-03, IDNT-04, IDNT-05, IDNT-06]
---

# IDNT-01 — Auth/session routes and organisation-switch context

Implements PRD §16.3 (authentication and machine access) and §38.2 (session defaults), carrying
requirement `AUTH-002` ("A user can switch among organisations without leaking state") and the session
half of `SEC-001`. **No ADR — the decision is already made in PRD §16.3 and §38.2; this is build
ticket 1 of 9 against it.**
Parent sub-PRD: [13-identity-surface README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `RUNT-02` — Admission middleware chain
([`03-app-runtime`](../../03-app-runtime/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope, mapping already-built
`packages/auth` primitives onto the fixed PRD §16.1/§34.1/§34.9 wire contract — not a new subsystem
decision.

## Background + basis

**The endpoint family is named by the PRD, not invented here.** PRD §16.3:

> - Invitation and membership lifecycle endpoints.
> - **Session list/revoke and recent-authentication checks.**
> - TOTP, passkey and recovery-code lifecycle.
> - SAML/OIDC SSO connection create/test/activate/disable.
> - Service-account and credential create/rotate/revoke.

`AUTH-002` (PRD §30.2) fixes the observable behaviour and the acceptance evidence:

> | AUTH-002 | A user can switch among organisations without leaking state | Global organisation
> switcher | session context | App | **Cross-tenant ID matrix returns indistinguishable 404** |

and PRD §8.1 gives the underlying rule: *"A user MAY belong to multiple organisations, but
organisation data MUST remain isolated."*

**Session behaviour is fully specified.** PRD §38.2:

> | Interactive idle timeout | 8 hours | · | Absolute session lifetime | 7 days | · | Sensitive-action
> recent authentication | 10 minutes | · | Invitation lifetime | 72 hours; single use | · | Password
> reset/magic-link lifetime | 15 minutes; single use | · | MFA methods | TOTP and passkey; single-use
> hashed recovery codes | · | Owner/Admin MFA grace | Must enrol before protected workspace access
> after first login | · | **Active-session view | Device/time/IP metadata; revoke one or all** | ·
> | Break-glass account | One named Owner path, MFA protected, not SSO-only, high-priority event on use |
>
> Production cookie defaults: `Secure`, `HttpOnly`, `SameSite=Lax`, host-only, **rotated session
> identifier after login/MFA/privilege change**. State-changing Web requests require CSRF protection;
> API keys do not use cookies.

`AUTC-01` (`02-auth-core`) already implements every one of those as exported functions this ticket
calls and must not re-derive: `SESSION_DEFAULTS` / `COOKIE_DEFAULTS` (frozen §38.2 constants),
`createAuthCore(deps)`, `evaluateSessionExpiry(session, now)`, `issueSession(input, deps)`,
`rotateSessionId(sessionId, 'login' | 'mfa' | 'privilege_change', deps)`, `listSessions(userId, deps)`,
`revokeSession(id, deps)`, `revokeAllSessions(userId, deps, opts?)`, `touchSession(...)`,
`buildSessionCookie(value, config)` / `clearSessionCookie(config)`, `assertCsrf(facts, config)`,
the 15-minute single-use email-token functions, and `PUBLIC_SIGNUP_ENABLED = false as const`.
`AUTC-01` also fixes that `acceptInvitation` is *"the **only** user-creating path"* — implemented by
`IDNT-02`, not here.

**The platform rules and the error catalogue are closed.** PRD §16.1: *"Base path `/v1` … Organisation
is derived from authenticated context, not trusted request fields. **Every response includes
`request_id`.** … HTTP status and domain answer status remain separate."* PRD §34.1 rows that bind
every route in this area:

> | IDs | Opaque resource-prefixed UUIDv7 strings … clients never parse them |
> | Dates | Australian legal dates are `YYYY-MM-DD`; timestamps are ISO 8601 UTC |
> | Pagination | `page_size` 1–100, default 25; opaque `next_cursor` |
> | Concurrency | Mutable resources return `ETag`; writes require `If-Match` where documented |
> | **Tenant | Never accepted in a request body; derived from authenticated session/key/widget token** |

PRD §34.9 is the complete list of codes this area may return — `400 INVALID_REQUEST`,
`401 AUTHENTICATION_REQUIRED`, `403 MFA_REQUIRED`, `403 RECENT_AUTH_REQUIRED`,
`404 RESOURCE_NOT_FOUND` (*"same response for forbidden/other tenant"*), `409 IDEMPOTENCY_CONFLICT`,
`409 CONCURRENT_MODIFICATION`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR` — with the uniform PRD §16.1
body `{ error: { code, message, request_id, details, retryable } }`. `RUNT-01` owns the catalogue and
its factories (`apps/api/src/errors/**`); **adding a code is a PRD change, never a local decision**
(sub-PRD **D12**).

**PRD §34 contains no identity payload example.** §34.2–§34.8 cover search, answer creation, SSE,
answer snapshots, coverage/compare, record writes and webhooks only. The binding payload contract for
this area is therefore: PRD §34.1 conventions + PRD §34.9 errors + PRD §35.4 columns + the generated
types `FND-04` produces from `schemas/openapi/openapi.yaml`, whose deliverable 1 commits to including
*"the PRD §16.3 authentication and machine-access endpoints"*. Sub-PRD **D4**: a needed path or field
is an `FND-04` ticket, never a local edit of `schemas/openapi/**`.

**Routing is by directory, and the prefix derives mechanically.** `RUNT-01`'s A1 contract:

> Every immediate child directory of `apps/api/src/routes/` is a **route area**. Its directory name is
> the area id. … A route area MUST contain `index.ts` with a **default export** that is a Fastify
> plugin. … Default prefix is `/v1/<area-id>` … Adding, renaming or removing a route area produces
> **zero** diff outside that area's own directory.

So this area is `apps/api/src/routes/auth/` and serves under `/v1/auth`. Optional area configuration
is `export const area = { … } satisfies RouteAreaConfig` with
`admission?: 'public' | 'probe' | 'tenant' | 'internal'`.

**Admission runs before every handler here and is not re-implemented.** `RUNT-02` deliverable 2 fixes
the stage order `['request-limits','authenticate','resolve-organisation','verify-membership',
'evaluate-permission','rate-limit','pii-admission','schema-validate','legal-scope',
'budget-admission','idempotency']`, reads *"each route's effective `RouteAreaConfig.admission` profile
… and per-route overrides declared in the route schema"*, and deliverable 5 states:

> `middleware/resolve-organisation.ts` — derives the organisation from the authenticated principal
> only. **If any request body, query or header supplies an organisation/tenant identifier, the request
> is rejected `400 INVALID_REQUEST` naming the field** — it is never honoured (PRD §34.1, §16.1).

That is why sub-PRD decision **D11** puts the switch target in the **path**, as an addressed resource
validated against the caller's own memberships, and why the switch endpoint can never read a tenant id
from a body.

**This ticket is the module's foundation.** plan §6.2 makes `IDNT-01` block `IDNT-02`, `IDNT-03`,
`IDNT-04`, `IDNT-05` and `IDNT-06`. Sub-PRD decision **D3** is the reason: this ticket owns the single
composition point for `packages/auth` in `apps/api` plus the shared result→wire mapper and audit
helper, exported from `apps/api/src/routes/auth/_lib/**`, which the five sibling areas **import**
read-only. Only this ticket writes it (plan §4 allocates *writes*; read access is unrestricted).

**Accepted caveats carried forward, documented not enforced here:**

- **MFA is not decided here.** `assertMfaSatisfied` / `assertRecentAuth` are `AUTC-02` and this ticket
  has no `AUTC-02` edge. `RUNT-02`'s `authenticate` stage already returns `403 MFA_REQUIRED` /
  `403 RECENT_AUTH_REQUIRED`. The session-context response exposes MFA state as **pass-through row
  data**; the enforcement decision belongs to `RUNT-02` + `AUTC-02` and the challenge routes to
  `IDNT-04`.
- **Durable audit persistence is an open gap.** `AuditSink` is a `packages/auth` port (`AUTC-01`
  deliverable 3) and `audit_event` is `DATA-07`, but no module holds both edges — sub-PRD **OQ3**.
  This ticket ships the `_lib` seam plus an interim sink backed by the `RUNT-07` logger's security
  channel and states the gap on its PR (PRD §45.4 "known gaps").
- **The toolchain is pinned, not open.** plan §8 **Q12** is CONFIRMED — Node.js `24.18.0`, pnpm
  `11.4.0`, Rust `1.97.1`, Python `3.14.6` — and `FND-01` commits those pins (sub-PRD **D13**). This
  ticket states no version literal. Whether the `<auth-pkg>/<area>` wildcard subpath exports resolve
  for these routes is a mechanical consequence of those pins, checked by the first `pnpm typecheck`;
  a genuine incompatibility is evidence written back through `FND-01`, never a local pin change.

## Goal

Produce the `apps/api/src/routes/auth/` route area serving the PRD §16.3 session endpoints under
`/v1/auth`, plus the module's shared route toolkit at `routes/auth/_lib/**` that the five sibling
identity areas import. Completion is mechanically checkable: a signed-in user can read their session
context, list and revoke sessions, and switch to another organisation they belong to — with the session
identifier rotated on both sign-in and switch; a switch to an organisation they do not belong to
returns a `404 RESOURCE_NOT_FOUND` body byte-identical (apart from `request_id`) to a switch to an
organisation that does not exist; an organisation identifier supplied in a body, query or header is
rejected; and no response, log line or error message contains a session token, email token or any
`packages/auth` secret.

## Non-goals

- **No session, cookie, CSRF or token implementation.** `packages/auth/src/core/**` is `AUTC-01`
  (`02-auth-core`). This area calls it.
- **No user creation.** `acceptInvitation` is the only user-creating path (`AUTC-01` deliverable 7) and
  its route is `IDNT-02`. This area must expose no sign-up, registration or self-service account
  creation, and `PUBLIC_SIGNUP_ENABLED === false` is asserted (`UAT-AUTH-01`).
- **No MFA routes and no recent-auth *check* endpoint.** `apps/api/src/routes/mfa/**` is `IDNT-04`,
  which holds the `AUTC-02` edge. PRD §16.3's *"recent-authentication checks"* is served there.
- **No invitation, membership, SSO, service-account or widget-session routes.** `IDNT-02`, `IDNT-03`,
  `IDNT-05`, `IDNT-06`, `IDNT-07`.
- **No SSO login initiation or callback.** Sub-PRD **D10**: `routes/sso/**` (`IDNT-05`) — this ticket
  has no `AUTC-03` edge.
- **No admission stages.** `apps/api/src/{plugins,middleware}/**` is `RUNT-02`. If a required
  per-route admission capability is missing, that is a `RUNT-02` docs change (see Feedback obligation),
  never an edit here.
- **No tables, repositories or migrations.** `packages/database/**` is `01-app-data` (plan **A3**).
- **No permission matrix.** `packages/domain/src/access/**` is `FND-06`.
- **No screens.** `apps/web/**` is `RUNT-05` (shell) and `IDNT-08`/`IDNT-09` (this module's screens).
- **No OpenAPI authoring.** `schemas/openapi/**` and `packages/contracts/**` are `FND-04`/`FND-03`,
  serial-owned (plan §4.1).
- **No cross-boundary tenant-isolation or E2E suite.** `tests/**` is `23-assurance` (`ASSR-01`,
  `ASSR-06`). This ticket carries its own co-located assertions (plan §9 **R8**).

## File-scope (write-owns)

- `apps/api/src/routes/auth/**` — the route area, including:
  - `apps/api/src/routes/auth/index.ts` (the A1 entry file with the default-exported plugin and `area`)
  - `apps/api/src/routes/auth/_lib/**` — the module's shared route toolkit (sub-PRD **D3**), imported
    read-only by `IDNT-02`…`IDNT-07`
- `apps/api/test/routes/auth/**` — this ticket's own unit/integration tests (plan §1.1, "Tests":
  unit/integration tests live inside the owning app).
- `apps/api/package.json` — **append-only** if a dependency is required (plan §1.1, "Package
  manifests"; the lockfile is regenerated as a build artifact and never hand-merged, plan §4.1).

Does not touch:

- `apps/api/src/routes/{invitations,members,mfa,sso,service-accounts,widget-sessions}/**` — `IDNT-02`
  … `IDNT-07`.
- `apps/api/src/routes/{health,system-status}/**` — `RUNT-08`. Every other `apps/api/src/routes/*`
  area belongs to `14`, `15`, `16`, `17`, `19`, `20` or `22` (plan §4).
- `apps/api/src/{server.ts,app.ts,bootstrap,errors,plugins,middleware,sse}/**` — `RUNT-01`, `RUNT-02`,
  `RUNT-03`.
- `packages/auth/**` — `02-auth-core`. `packages/database/**` — `01-app-data`.
  `packages/domain/**`, `packages/contracts/**`, `schemas/openapi/**` — `00-foundation`.
  `packages/ui/**`, `packages/observability/**` — `RUNT-06`, `RUNT-07`.
- `apps/web/**`, `apps/worker/**`, `apps/admin/**`, `apps/widget/**` — `RUNT-05`/`IDNT-08`/`IDNT-09`,
  `RUNT-04`, `22-internal-admin`, `20-developer-platform`.
- `infra/**`, `tests/**`, root manifests, lockfiles, `.github/workflows/**` — `18-ops-release`/
  `RUNT-09`, `23-assurance`, `00-foundation`.

**Serial-safety analysis.** This is the **first** decomposition (plan §1: phase 1, `append: false`,
`usedIds: []`, `existingFiles: ['.gitkeep']`): nothing is merged, no ticket is in flight, and no prior
ticket has written any path above. Under the A1 autoload convention (`RUNT-01` contract §1/§6) each
route area is an independent directory whose addition produces *"zero diff outside that area's own
directory"*, so the seven sibling areas in this module — and the route areas of `14`, `15`, `16`, `17`,
`19`, `20`, `22` — are disjoint subtrees by construction; no shared route index exists to contend for.
This ticket is the module's only wave-1 ticket (plan §7: 9 tickets, 3 minimum waves, 5 useful lanes),
so no sibling runs concurrently with it. `apps/api/package.json` is the module-crossing append-only
manifest; conflicts resolve by re-running the package manager (plan §1.1).

## Deliverables

Internal organisation inside the area is the Builder's choice; the exported names, route paths, status
codes and ordering constraints below are not.

1. **`apps/api/src/routes/auth/index.ts`** — the A1 entry file: a default-exported `FastifyPluginAsync`
   and `export const area = { admission: 'public' } satisfies RouteAreaConfig`. The area default is
   `public` because sign-in must be reachable without a credential; every authenticated route in the
   area declares `admission: 'tenant'` as a per-route override (`RUNT-02` deliverable 1). Any route not
   explicitly declaring its profile is a build failure — add an assertion, not a default.
2. **`_lib/identity-context.ts` — the single `packages/auth` composition point (sub-PRD D3).**
   `export function getIdentityContext(app: FastifyInstance): IdentityContext` returning a lazily
   constructed, process-singleton `{ authCore, clock, random, secrets, audit }`, built by passing
   `AUTC-01`'s ports (`Clock`, `Random`, `SecretsPort`, `AuthDatabasePort`, `IdentityPort`,
   `AuditSink`) implementations that delegate to the `TenantContext`-scoped repository accessor
   `RUNT-02`'s `plugins/tenant-scope.ts` decorates onto the request, and to `ApiConfig` from
   `RUNT-01`'s `bootstrap/config.ts`. **Exactly one `AuthCore` exists per process**; a test asserts a
   second call returns the same instance. No sibling area constructs its own.
3. **`_lib/map-auth-result.ts` — the typed-result → PRD §34.9 mapper.**
   `export function mapAuthFailure(reason: AuthFailureReason, details?: Record<string, unknown>): ApiError`
   using `RUNT-01`'s `apps/api/src/errors` factories. The mapping table is exported as data so a test
   can assert it exhaustively over `AUTC-01`'s failure union:
   - `AUTHENTICATION_REQUIRED`, `SESSION_EXPIRED`, `CSRF_FAILED`, any credential/sign-in failure →
     `401 AUTHENTICATION_REQUIRED` with a **single generic message**; the reason is logged, never
     returned, so the response cannot disclose whether an account exists (`AUTC-01` deliverable 10).
   - not-a-member / unknown organisation / other-tenant resource → `404 RESOURCE_NOT_FOUND`
     (PRD §16.5, §34.9).
   - validation failure → `400 INVALID_REQUEST` with `details` naming **field names only**, never
     submitted values (PRD §37.2).
   - stale `If-Match` → `409 CONCURRENT_MODIFICATION`.
   Identity-specific reasons that PRD §34.9 has no code for are expressed as an existing code plus
   `details.reason` from a documented closed set (sub-PRD **D12**); `mapAuthFailure` must refuse an
   unknown reason at the type level.
4. **`_lib/audit.ts`** — `export function emitIdentityAudit(ctx, event: IdentityAuditEvent): void`
   wrapping the `AuditSink`. `IdentityAuditEvent` carries `{ action, actorId, organizationId,
   resourceType, resourceId, result, requestId, ip?, userAgent? }` and **nothing else**; the type must
   make a secret, token, assertion or free-text body unrepresentable (PRD §22: *"Logs MUST exclude
   research/evidence content, PII text, credentials, assertions and provider payloads"*; PRD §35.6
   `audit_event`: *"no complete research body/credential"*). Until sub-PRD **OQ3** is resolved the sink
   writes through `RUNT-07`'s logger security channel; the seam for a durable `DATA-07` repository is
   named and documented in this file.
5. **`_lib/route-presets.ts`** — the shared per-route declarations siblings reuse so admission
   requirements are declared identically everywhere: `TENANT_ROUTE` (`admission: 'tenant'`),
   `PUBLIC_ROUTE` (`admission: 'public'`), `SENSITIVE_ROUTE` (`admission: 'tenant'` +
   `requiresRecentAuth: true`, PRD §21.1 *"recent auth for sensitive operations"*), and
   `MACHINE_ONLY_ROUTE` (`admission: 'tenant'`, principal kind restricted to a service credential).
   Each preset carries a comment citing the PRD clause that motivates it.
6. **`GET /v1/auth/session`** (`TENANT_ROUTE`) — the organisation-switch context `AUTH-002` names.
   Returns `{ user: { id, display_name, email_normalized }, active_organization: { id, name, slug,
   role }, memberships: [{ organization_id, name, slug, role, status }], session: { id, authenticated_at,
   expires_at, mfa_satisfied, recent_auth_expires_at }, environment: 'PRODUCTION' | 'SANDBOX',
   schema_version, request_id }`. `expires_at` is computed with `AUTC-01`'s `evaluateSessionExpiry`;
   `mfa_satisfied` / `recent_auth_expires_at` are **pass-through row data** (see caveats). No token, no
   cookie value and no secret appears in the body.
7. **`POST /v1/auth/sign-in`** (`PUBLIC_ROUTE`) — delegates to the sign-in method `AUTC-01`'s
   `AuthCore` exposes (password and/or magic-link consumption). Fixed ordering: `assertCsrf` →
   `AuthCore` verification → `issueSession` → `rotateSessionId(..., 'login')` → set the cookie built by
   `buildSessionCookie` → activate a default organisation (deliverable 9) → respond `200` with the same
   body shape as deliverable 6. Every failure is the single generic `401 AUTHENTICATION_REQUIRED`.
   Emits an audit event on success **and** failure (failure carries the reason, never the credential).
8. **`POST /v1/auth/sign-out`** (`TENANT_ROUTE`) — revokes the current session through
   `revokeSession`, clears the cookie with `clearSessionCookie`, responds `204`. Idempotent: a second
   call with an already-revoked session also returns `204` and creates no error.
9. **`POST /v1/auth/organizations/{organization_id}/activate`** (`TENANT_ROUTE`) — the organisation
   switch (sub-PRD **D11**). Fixed ordering, each step load-bearing:
   1. read the caller's memberships through the `TenantContext`-scoped repository accessor;
   2. if `organization_id` is not an `ACTIVE` membership of the caller — whether it belongs to another
      tenant or does not exist — return `404 RESOURCE_NOT_FOUND` produced by the **same code path**, so
      the two bodies are byte-identical apart from `request_id` (PRD §16.5, §34.9, `AUTH-002`);
   3. write the new active organisation onto the session;
   4. `rotateSessionId(sessionId, 'privilege_change', deps)` — PRD §38.2 requires rotation on privilege
      change; the rotation happens **after** the write succeeds and **before** the response;
   5. emit an audit event carrying both organisation ids;
   6. respond `200` with the deliverable-6 body for the new organisation.
   The target is a **path parameter**; the handler must never read an organisation identifier from a
   body, query or header, and `RUNT-02`'s `resolve-organisation` stage rejects those before the handler
   runs. **Default activation** on sign-in: the single membership when there is one, otherwise the most
   recently activated organisation, otherwise the first by `name` ascending — deterministic and tested.
10. **`GET /v1/auth/sessions`** (`TENANT_ROUTE`) — PRD §38.2 *"Active-session view: Device/time/IP
    metadata; revoke one or all"*. Returns `listSessions(userId)` mapped to `{ id, created_at,
    last_seen_at, ip, user_agent, current }` with PRD §34.1 cursor pagination (`page_size` 1–100,
    default 25). No session token or cookie value is returned. Sessions of other users are not
    addressable.
11. **`DELETE /v1/auth/sessions/{session_id}`** (`SENSITIVE_ROUTE`) and
    **`POST /v1/auth/sessions/revoke-all`** (`SENSITIVE_ROUTE`, body `{ except_current?: boolean }`) —
    `revokeSession` / `revokeAllSessions`. A `session_id` belonging to another user returns
    `404 RESOURCE_NOT_FOUND` through the same code path as an absent id. Both emit audit events.
12. **`POST /v1/auth/password-reset/request`** and **`POST /v1/auth/password-reset/consume`**
    (`PUBLIC_ROUTE`) — the PRD §38.2 15-minute single-use email tokens via `AUTC-01`'s email-token
    functions. `request` responds `202` with an **identical body and timing class** for a known and an
    unknown address (no account-existence oracle) and never returns the token; `consume` rotates the
    session identifier on success. **Token delivery stays out of scope, and the confirmed provider does
    not change that.** plan §8 **Q14** is settled — Resend behind the existing `EmailTransport` port —
    but that port and its adapter belong to `16-monitor-alerts` (`WTCH-04`, `WTCH-09`) under
    `apps/worker/src/handlers/notifications/email/**`; this ticket owns no worker path and no edge to
    module 16, and adding one would be a forward module edge that plan §3 forbids and plan §9 **R6**
    names. The token is therefore handed to the configured sink, and the **unallocated** send path is
    stated as a known gap on the PR (PRD §45.4; sub-PRD **OQ4**, **D14**). Never add an email client,
    a provider HTTP call or `RESEND_API_KEY` to `apps/api`.
13. **Rate-limit declarations.** Sign-in, password-reset request and password-reset consume declare a
    rate-limit ledger through `RUNT-02`'s configuration (PRD §38.5 gives no per-route auth number, so
    the committed safe default is declared in config, not hard-coded, per PRD §39.6 layer 1). A `429`
    carries `Retry-After` and the caller's own limit/remaining/reset only.
14. **`apps/api/test/routes/auth/**`** — this ticket's suites, plus one exported helper
    `apps/api/test/routes/auth/identity-route-harness.ts` that boots the app with this area registered
    through `RUNT-01`'s `registerRouteAreas({ root })`, seeds two organisations and their memberships
    through `DATA-04`'s fixture builders (`packages/database/test/tenancy/factories.ts`), and returns
    `inject()`-ready authenticated request helpers. **Exported so `IDNT-02`…`IDNT-07` reuse it**; it is
    the executable form of the module's tenant-isolation assertion.

## Acceptance checklist (classified)

- [ ] `[machine]` The area registers as `apps/api/src/routes/auth/` and serves under `/v1/auth` with
      **zero** diff to any tracked file outside that directory — asserted with `RUNT-01`'s exported
      `apps/api/test/route-area-conformance.ts` harness (plan **A1**)
- [ ] `[machine]` Every route in the area declares an explicit admission profile; a route without one
      fails the suite (`RUNT-02` deliverable 1)
- [ ] `[machine]` `GET /v1/auth/session` returns the user, active organisation, every membership with
      its role, and the session's `expires_at` computed by `AUTC-01`'s `evaluateSessionExpiry` — no
      local expiry arithmetic exists in this area (PRD §38.2; `AUTH-002`)
- [ ] `[machine]` Sign-in rotates the session identifier (`rotateSessionId(..., 'login')`) and sets a
      cookie built by `buildSessionCookie` with `Secure`, `HttpOnly`, `SameSite=Lax` and **no `Domain`
      attribute** (PRD §38.2)
- [ ] `[machine]` Every sign-in failure — unknown user, wrong secret, disabled account — returns the
      identical `401 AUTHENTICATION_REQUIRED` body and reveals no account-existence signal; asserted by
      byte-comparing the responses after masking `request_id` (PRD §34.9; `AUTC-01` deliverable 10)
- [ ] `[machine]` Activating an organisation the caller belongs to rotates the session identifier with
      reason `privilege_change` and returns the new context (PRD §38.2; `AUTH-002`)
- [ ] `[machine]` **Tenant isolation (`SEC-001`, PRD §21.2):** activating an organisation that belongs
      to another tenant and activating an organisation id that does not exist return **byte-identical**
      `404 RESOURCE_NOT_FOUND` bodies apart from `request_id`; the same holds for
      `DELETE /v1/auth/sessions/{id}` against another user's session (PRD §16.5, §34.9;
      `AUTH-002` evidence *"Cross-tenant ID matrix returns indistinguishable 404"*)
- [ ] `[machine]` **Tenant isolation (`SEC-001`):** an architecture assertion over
      `apps/api/src/routes/auth/**` finds no import of an unscoped `packages/database` entry point —
      copy the construction pattern from `apps/api/test/admission/architecture.test.ts` (`RUNT-02`
      deliverable 13) (PRD §16.5 *"Business modules MUST use TenantContext-scoped repositories"*)
- [ ] `[machine]` An organisation/tenant identifier supplied in a body, query or header is rejected
      `400 INVALID_REQUEST` naming the field and never honoured; the switch target is only ever read
      from the path (PRD §34.1, §16.1; sub-PRD **D11**)
- [ ] `[machine]` `PUBLIC_SIGNUP_ENABLED === false` and the area exposes **no** route that creates a
      user — asserted by enumerating the area's registered routes against a literal expected list
      (PRD §8.1 *"Public registration MUST be disabled"*; `AUTH-001`; `UAT-AUTH-01` server half)
- [ ] `[machine]` `GET /v1/auth/sessions` returns device/time/IP metadata with `page_size` bounded to
      1–100 (default 25) and an opaque `next_cursor`, and returns no session token (PRD §38.2, §34.1)
- [ ] `[machine]` `POST /v1/auth/password-reset/request` returns the same status, body and timing class
      for a known and an unknown address, and never returns a token (PRD §38.2)
- [ ] `[machine]` **No secret leak:** a canary is placed in the session token, the email token and the
      cookie value; the canary is absent from every response body, every emitted log line and every
      audit event across the whole suite (PRD §22, §21.1)
- [ ] `[machine]` `mapAuthFailure` is exhaustive over `AUTC-01`'s failure union and produces only codes
      present in `RUNT-01`'s `ERROR_CATALOGUE`; an unknown reason fails to type-check (PRD §34.9;
      sub-PRD **D12**)
- [ ] `[machine]` `emitIdentityAudit` cannot carry a secret or free-text body — asserted at the type
      level and by a runtime scan of every event emitted in the suite (PRD §22, §35.6)
- [ ] `[machine]` `getIdentityContext` returns the same `AuthCore` instance on repeated calls
      (sub-PRD **D3**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — this area consumes generated bindings
      and hand-edits none (PRD §20.1; plan §1.1 "Generated artifacts")
- [ ] `[machine]` PR states the PRD §45.4 items, naming `AUTH-002`, `SEC-001`, `UAT-AUTH-03`, the
      tenant/security impact, the rollback path and the **known gaps** for sub-PRD **OQ3** (durable
      audit persistence) and **OQ4** (no ticket sends the reset token — the plan §8 Q14 provider is
      confirmed but is `16-monitor-alerts`', so the token goes to the configured sink)
- [ ] `[human]` `UAT-AUTH-03` rehearsed manually against a running stack for an **identity** resource:
      a member of organisation A requests activation of organisation B and observes the same 404 shape
      and timing class as an unknown organisation id (PRD §41.2). The record-id form of the script is
      `17-records-collab`/`ASSR-01` and is **not required to merge this ticket**
- No `[fixture]` criteria — this ticket replays no recorded source or evaluation data; plan §1.1 maps
      `[fixture]` to PRD §40.8 adapter fixtures and PRD §14/§43 evaluation replays, and neither exists
      at this layer
- No `cargo test --workspace` / `uv run pytest` item — this ticket touches no Rust or Python
      (PRD §45.3; plan §1.1)

## Test plan

Reviewer steps, all reproducible offline with no network, no provider and no real credentials. The
database is a temp-file `app.sqlite` migrated with `DATA-01`'s runner and seeded through `DATA-04`'s
`packages/database/test/tenancy/factories.ts`; `packages/auth` ports use `AUTC-01`'s in-memory fakes
(`FakeClock`, `FakeIdentityStore`, `RecordingAuditSink`, `FakeRandom`) from
`packages/auth/test/support/**`.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/api` (or the workspace-equivalent filter `FND-01` established). Suites live
   under `apps/api/test/routes/auth/`.
3. **`area-registration.test.ts`** — reuse `apps/api/test/route-area-conformance.ts` (`RUNT-01`) to boot
   with this area and assert the derived prefix `/v1/auth`, then enumerate registered routes and
   compare to a literal list written out in the test (this is also the no-signup assertion).
4. **`session-context.test.ts`** — seed one user with memberships in organisations A and B; `inject()`
   `GET /v1/auth/session`; assert every field of deliverable 6 and that no cookie value or token string
   appears anywhere in the body.
5. **`sign-in.test.ts`** — assert cookie attributes; assert `rotateSessionId` was called with `'login'`
   (spy on the fake); assert the default-activation rule for one membership, several memberships with a
   prior activation, and several with none. Then run the three failure cases and byte-compare the
   responses after masking `request_id`.
6. **`organization-switch.test.ts`** — the `AUTH-002` matrix: activate B as a member (expect 200 +
   rotation with `'privilege_change'`); activate B as a non-member; activate a syntactically valid but
   absent id; byte-compare the two 404 bodies after masking `request_id`. Then attempt the switch with
   the organisation id in the body, in a query parameter and in a header and assert each is rejected
   `400 INVALID_REQUEST` naming the field.
7. **`sessions.test.ts`** — list with `page_size` 0, 1, 100 and 101 (expect 400 for 0 and 101); revoke
   own session; revoke another user's session id (expect the identical 404); `revoke-all` with and
   without `except_current`.
8. **`password-reset.test.ts`** — known and unknown address: assert identical status and body, and that
   both responses fall in the same timing class over repeated runs; assert no token in either body.
9. **`architecture.test.ts`** — source scan over `apps/api/src/routes/auth/**` for unscoped
   `packages/database` imports; copy the construction pattern from
   `apps/api/test/admission/architecture.test.ts` (`RUNT-02` deliverable 13) so the two assertions stay
   recognisably the same.
10. **`leak.test.ts`** — set the fake session/email tokens and the cookie value to
    `secret-canary-<uuid>`; run the whole area's request matrix; scan every response body, every line
    captured from the logger and every `RecordingAuditSink` event for the canary; assert absence.
11. **`map-auth-result.test.ts`** — table-driven over every member of `AUTC-01`'s failure union;
    assert each maps to a code present in `RUNT-01`'s `ERROR_CATALOGUE` and that no mapping produces a
    body distinguishing account existence.
12. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether the
    organisation switch can interleave with a concurrent membership removal (step 1 read vs step 3
    write — the membership check and the session write must be in one transaction or re-validated);
    whether any 404 path differs in shape, header set or timing from the others; whether `_lib`'s
    singleton can be constructed twice under concurrent first requests.
13. The `[human]` row is run against a locally started stack (`pnpm stack:up`, `RUNT-09`) and recorded
    in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies anything in this ticket, update **this ticket file**
first (version note + changelog line in the PR), re-publish the issue with
`.claude/scripts/publish-tickets.mjs --sync`, and only then change code. Silent divergence is an
incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`RUNT-02` provides no way to reach the composed identity dependencies from a route** (no request
  decoration for the scoped repository accessor, or no per-route admission override) → that is a
  cross-module contract gap, not a local problem. Amend `docs/prd/03-app-runtime/README.md` and
  `RUNT-02`'s ticket in one docs PR, `--sync` both, **before** any code here. Never write
  `apps/api/src/plugins/**` or `apps/api/src/middleware/**` from this ticket — that is the file-scope
  defect plan §4 exists to prevent.
- **`RUNT-02`'s `resolve-organisation` stage also rejects an organisation id in a *path* parameter** →
  sub-PRD **D11** becomes unbuildable. Amend `RUNT-02`'s deliverable 5 and this ticket's deliverable 9
  together in one docs PR and `--sync` both; do not smuggle the target through a header or body.
- **`FND-04`'s OpenAPI document does not contain the PRD §16.3 session paths, or names different
  ones** (sub-PRD **OQ8**) → `schemas/openapi/**` is serial-owned by `FND-04` (plan §4.1). Raise a
  `00-foundation` ticket, add the edge in `docs/prd/breakdown-plan.md` §5.14/§6.2, and record the
  question in `docs/prd/13-identity-surface/README.md`. **Never** edit `schemas/openapi/**` or a
  generated file, and never invent a path that contradicts the document.
- **PRD §34.9 has no code for a required identity failure** → the catalogue is closed (sub-PRD **D12**;
  `RUNT-01` deliverable 5). Express it as an existing code plus `details.reason`. If that is genuinely
  impossible, it is a **product/API change** under PRD §45.5: raise it in
  `docs/prd/13-identity-surface/README.md` §Open questions with the **Founder** as owner and stop at
  the nearest existing code.
- **`packages/auth` does not expose a function this area needs** (for example a session-context read or
  a switch-safe session write) → the fix belongs in `02-auth-core`. Add a ticket there and make this one
  `blocked_by` it in `docs/prd/breakdown-plan.md` §5.14/§6.2 **first**. Do not implement session logic
  in `apps/api` — PRD §45.2 forbids duplicated business rules and plan §9 **R5** names this exact
  failure mode.
- **`AuditSink` has no durable destination** (sub-PRD **OQ3**) → do **not** write
  `packages/database/**` to add one (plan **A3**, PRD §45.2). Record the resolution in
  `docs/prd/13-identity-surface/README.md` **OQ3**, add the `DATA-07` edge or a wiring ticket to
  `docs/prd/breakdown-plan.md` §5.14/§6.2, and carry the gap on the PR meanwhile.
- **The shared `_lib` toolkit turns out to be the wrong seam** (a sibling needs to write it) → that is
  a module-internal design change with five dependents. Amend sub-PRD **D3** and every affected ticket
  in one docs PR and `--sync` them; never let a sibling write inside `routes/auth/**`.

**3. Escalation.** `AUTH-002` and `SEC-001` are release requirements with MUST force (PRD §8.1, §16.5,
§21.2), and five tickets in this module plus `RUNT-02`'s ten dependents sit behind the contracts this
ticket consumes. If the indistinguishable-404 rule, the PRD §16.5 order or the A1 registration contract
is outright falsified, that overturns a team decision recorded in `docs/prd/breakdown-plan.md` §2.1:
escalate for re-review before any code lands. Never weaken the isolation guarantee inside this ticket.
