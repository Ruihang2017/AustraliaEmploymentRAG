---
id: IDNT-07
title: Widget-session creation endpoint
module: 13-identity-surface
lane: 13-identity-surface
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [IDNT-06, AUTC-05]
blocks: [PLTF-05]
---

# IDNT-07 — Widget-session creation endpoint

Implements PRD §8.10 (API, SDK and widget), §33.5 (widget request) and §38.4 (service account and
widget tokens), carrying requirement `DEV-002` ("Widget uses short-lived, origin-bound sessions from
customer backend"). **No ADR — the decision is already made in PRD §33.5 and §38.4; this is build
ticket 7 of 9 against it.**
Parent sub-PRD: [13-identity-surface README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`IDNT-06` — Service-account and credential routes](IDNT-06-service-account-and-credential-routes.md);
`AUTC-05` — Widget session token signing and origin binding
([`02-auth-core`](../../02-auth-core/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope, exposing `AUTC-05`'s
widget-token primitive over the fixed PRD §34.1/§34.9 wire contract — not a new subsystem decision.

## Background + basis

**The flow is enumerated.** PRD §33.5, in full:

> 1. Customer backend authenticates its own user.
> 2. **Backend calls the platform using a service credential to create a widget session containing
>    organisation, pseudonymous external user ID, exact origins, features, expiry and credit ceiling.**
> 3. Browser loads the versioned JavaScript loader and sandboxed iframe.
> 4. Iframe validates parent origin and exchanges only typed events.
> 5. Widget calls the same `/v1` admission, PII, evidence and quota pipeline as Web/API; **no bypass
>    exists**.
> 6. **Session expires quickly and is never stored in localStorage.**

**The token contract is normative.** PRD §38.4:

> **Widget sessions are signed, opaque-to-client authorisation tokens with a maximum 15-minute
> lifetime. Claims bind organisation, service account, pseudonymous external user, allowed origins,
> allowed features, environment, credit ceiling and unique token ID. The token cannot create service
> accounts, read arbitrary Research Records, access settings/admin or exceed its origin.**

PRD §8.10 adds: *"The browser widget MUST use a short-lived organisation-scoped widget session created
by the customer's backend; **long-lived service credentials MUST NOT enter the browser**."*

**The requirement and its acceptance evidence.** PRD §30.2:

> | DEV-002 | Widget uses short-lived, origin-bound sessions from customer backend | Widget sandbox |
> widget-session endpoint | App | **Long-lived key never appears in browser storage/network fixture** |

**Rate limits are given.** PRD §38.5: *"Widget session creation | 30/min/service account (trial) |
120/min/service account (paid pilot) | abuse/IP/origin protection"*, and *"Rate-limit responses include
`Retry-After`, limit, remaining and reset metadata **without disclosing other tenants**."*

**The primitive already exists and must not be re-implemented.** `AUTC-05` (`02-auth-core`) exports:

- `WidgetSessionClaims` — exactly the PRD §38.4 claim set: `tokenId`, `organizationId`,
  `serviceAccountId`, `externalUserRef`, `allowedOrigins[]`, `allowedFeatures[]`, `environment`,
  `creditCeiling`, `issuedAt`, `expiresAt` — plus `validateClaims(input)` rejecting unknown properties,
  empty `allowedOrigins`, a non-absolute or non-HTTPS origin (localhost excepted for development), and
  an `expiresAt` beyond the cap; and `WIDGET_FORBIDDEN_CAPABILITIES`.
- `WIDGET_SESSION_MAX_TTL_SECONDS = 900 as const` (PRD §38.4's 15 minutes) and
  `WIDGET_ALLOWED_FEATURES`.
- `issueWidgetSession(input, now, deps)` whose `input.credential` is **a `VerifiedCredential`**, with
  the decisive property recorded in `AUTC-05` deliverable 3:

  > The function accepts **only** a `VerifiedCredential` — there is no overload taking a raw credential
  > string, a cookie or a user session. This is what makes PRD §33.5 step 2 true ("Backend calls the
  > platform using a service credential") and DEV-002's *"created by customer backend"* structurally
  > enforced.

  plus: `assertScope` gates minting; `ttlSeconds` is clamped to the 900 s cap; `creditCeiling` must be
  `≥ 0` and `≤` the credential's `budgetLimit` when set; `allowedFeatures ⊆ WIDGET_ALLOWED_FEATURES`
  and disjoint from `WIDGET_FORBIDDEN_CAPABILITIES`; `tokenId` is a fresh ≥128-bit value; the token is
  signed and **opaque to the client** (`02-auth-core` **D8**); an `AuditSink` event is emitted carrying
  organisation, service account, `tokenId`, origins, features and TTL — *"never the token itself"*.
- `verifyWidgetSession(token, ctx, deps)` with reasons `MALFORMED | BAD_SIGNATURE | EXPIRED | REVOKED |
  ORIGIN_NOT_ALLOWED | FEATURE_NOT_ALLOWED` — called by `RUNT-02`'s `authenticate` stage, not by this
  area.

**Wire rules.** PRD §16.1 (`/v1`, `request_id`, organisation from authenticated context). PRD §34.1:
opaque ids; ISO 8601 UTC; **`Tenant | Never accepted in a request body; derived from authenticated
session/key/widget token`** — so the organisation of the minted session is the **credential's**
organisation, never a request field. PRD §34.9 is the closed catalogue; reachable here:
`400 INVALID_REQUEST`, `401 AUTHENTICATION_REQUIRED`, `404 RESOURCE_NOT_FOUND`,
`429 RATE_LIMITED`, `429 CREDIT_LIMIT_REACHED`, `500 INTERNAL_ERROR`. **PRD §34 contains no
widget-session payload example** (§34.2–§34.8 cover other domains); sub-PRD **D4** makes the binding
shapes §34.1 + §34.9 + `AUTC-05`'s `WidgetSessionClaims` + the generated types from `FND-04`'s OpenAPI,
whose deliverable 1 commits to a *"widget session token (PRD §38.4)"* security scheme. Never edit
`schemas/openapi/**` from here.

**Routing and shared toolkit.** `RUNT-01`'s A1 contract makes `apps/api/src/routes/widget-sessions/` an
autoloaded area at `/v1/widget-sessions`; the shared toolkit (`getIdentityContext`, `mapAuthFailure`,
`emitIdentityAudit`, the `MACHINE_ONLY_ROUTE` preset) is `IDNT-01`'s
`apps/api/src/routes/auth/_lib/**`, imported read-only (sub-PRD **D3**).

**Accepted caveats carried forward, documented not enforced here:**

- **The widget itself is not here.** The versioned loader, sandboxed iframe, origin validation in the
  browser and the React wrapper are `apps/widget/**` (`PLTF-05`, `20-developer-platform`), which is
  `blocked_by` this ticket (plan §6.2). PRD §33.5 steps 3–4 and 6 are that ticket's.
- **Verification on every subsequent call is `RUNT-02`'s.** This area mints and revokes; it does not
  authenticate widget traffic.
- **The credit ceiling is carried, not enforced, here.** PRD §24.4/§38.5 ledgers are enforced by
  `RUNT-02` with `packages/domain/src/budget` (`FND-09`).
- **Durable audit persistence** is sub-PRD **OQ3**; events go through `IDNT-01`'s `emitIdentityAudit`
  and `AUTC-05`'s own `AuditSink` call.

## Goal

Produce the `apps/api/src/routes/widget-sessions/` route area serving widget-session creation and
revocation under `/v1/widget-sessions`, such that only a customer backend holding a verified service
credential can mint a session, the token lives at most 15 minutes, and it is bound to exact origins.
Completion is mechanically checkable: a cookie-authenticated caller and a widget-token-authenticated
caller are both rejected; a request without the required scope is rejected; an empty, relative or
non-HTTPS origin list is rejected; a TTL above 900 seconds is clamped, never honoured; the response is
the only place the token appears; the minted session's organisation always equals the credential's
organisation even when the body says otherwise; and the creation rate limit is per service account.

## Non-goals

- **No token format, signing, claim validation or verification.** `packages/auth/src/widget/**` is
  `AUTC-05`. This area calls `issueWidgetSession` and never parses or constructs a token; the encoding
  is deliberately opaque (`02-auth-core` **D8**).
- **No widget runtime.** `apps/widget/**` (loader, iframe, React wrapper, origin checks in the browser,
  typed events, no-localStorage rule) is `PLTF-05`.
- **No service-account or credential management.** `IDNT-06` (`routes/service-accounts/**`), which this
  ticket is `blocked_by`.
- **No admission, no quota or budget enforcement.** `RUNT-02` + `FND-09`.
- **No developer widget sandbox screen.** `/developer/widget` is `PLTF-07`.
- **No tables or repositories.** `packages/database/**` is `01-app-data` (plan **A3**).
- **No cookie or user-session path of any kind.** PRD §38.2: *"API keys do not use cookies"*; PRD §33.5
  step 2 requires a service credential. A cookie-authenticated mint would falsify `DEV-002`.
- **No cross-boundary suites.** `tests/**` is `23-assurance`; this ticket carries its own co-located
  assertions (plan §9 **R8**).

## File-scope (write-owns)

- `apps/api/src/routes/widget-sessions/**` — the route area, including its A1 entry file `index.ts`.
- `apps/api/test/routes/widget-sessions/**` — this ticket's own unit/integration tests (plan §1.1).
- `apps/api/package.json` — **append-only** if a dependency is required (plan §1.1).

Does not touch:

- `apps/api/src/routes/auth/**` — `IDNT-01`, including `_lib/**`, which this ticket **imports** but
  never writes.
- `apps/api/src/routes/{invitations,members,mfa,sso,service-accounts}/**` — `IDNT-02`…`IDNT-06`.
- `apps/api/src/routes/{health,system-status}/**` — `RUNT-08`; `apps/api/src/routes/{sandbox,usage,audit-events}/**` —
  `20-developer-platform`; every other area belongs to `14`, `15`, `16`, `17`, `19` or `22` (plan §4).
- `apps/api/src/{server.ts,app.ts,bootstrap,errors,plugins,middleware,sse}/**` — `RUNT-01`, `RUNT-02`,
  `RUNT-03`.
- `apps/widget/**` — `PLTF-05` (`20-developer-platform`).
- `packages/auth/**` — `02-auth-core`; `packages/database/**` — `01-app-data`; `packages/domain/**`,
  `packages/contracts/**`, `schemas/openapi/**` — `00-foundation`; `packages/ui/**`,
  `packages/observability/**` — `RUNT-06`, `RUNT-07`.
- `apps/web/**`, `apps/worker/**`, `apps/admin/**`, `infra/**`, `tests/**`, root manifests, lockfiles,
  `.github/workflows/**`.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, no in-flight
ticket), so nothing has previously written these paths and nothing contends for them. Under the A1
autoload convention (`RUNT-01` contract §1/§6) `apps/api/src/routes/widget-sessions/` is an independent
directory whose addition produces zero diff elsewhere, so it is disjoint from the six sibling identity
areas and from `20-developer-platform`'s route areas — there is no shared route index. This ticket sits
in wave 3 with `IDNT-08` and `IDNT-09` (plan §7: 9 tickets, 3 minimum waves, 5 useful lanes), which
write `apps/web/src/features/**` — a different tree entirely. `apps/api/package.json` is append-only
shared (plan §1.1).

## Deliverables

1. **`apps/api/src/routes/widget-sessions/index.ts`** — the A1 entry file: default-exported
   `FastifyPluginAsync` and `export const area = { admission: 'tenant' } satisfies RouteAreaConfig`,
   with every route additionally declaring `IDNT-01`'s `MACHINE_ONLY_ROUTE` preset. The area rejects
   any principal that is **not** a service credential: a cookie session and a widget token are both
   `401 AUTHENTICATION_REQUIRED`. This is the structural expression of PRD §33.5 step 2 and PRD §38.4's
   *"The token cannot create service accounts …"*.
2. **`POST /v1/widget-sessions`** (`MACHINE_ONLY_ROUTE`) — mint. Request:
   `{ external_user_ref, allowed_origins: string[], allowed_features: string[], environment,
   credit_ceiling, ttl_seconds? }`. **No `organization_id` field exists**; the organisation comes from
   the verified credential (PRD §34.1). Ordering, fixed:
   1. obtain the `VerifiedCredential` the admission chain resolved (`RUNT-02` deliverable 4 →
      `AUTC-04.authenticateCredential`);
   2. call `AUTC-05.issueWidgetSession({ credential, … }, now, deps)` — the scope gate, TTL clamp,
      ceiling check, feature-subset check and origin validation all happen **inside** that function;
   3. map its typed failures (`SCOPE_REQUIRED`, `INVALID_ORIGIN`, `INVALID_FEATURE`, `INVALID_CEILING`,
      `INVALID_TTL`) to `400 INVALID_REQUEST` with `details.reason` set to the same value, except
      `SCOPE_REQUIRED`, which maps to the `FND-06`-consistent refusal `mapAuthFailure` produces
      (sub-PRD **D12**: PRD §34.9 is closed);
   4. respond `201`.
   Response body: `{ token, token_id, expires_at, issued_at, organization_id, service_account_id,
   allowed_origins, allowed_features, environment, credit_ceiling, schema_version, request_id }`.
   **This is the only response in the product that contains a widget token** (sub-PRD **D5**), and the
   token is never persisted in a form this area can read back, never logged and never echoed in an
   error.
3. **TTL clamping is never a rejection of a *shorter* request.** `ttl_seconds` is clamped to
   `min(requested ?? WIDGET_SESSION_MAX_TTL_SECONDS, WIDGET_SESSION_MAX_TTL_SECONDS)`; the response's
   `expires_at` reflects the **effective** value so the customer backend can see it was clamped. A zero
   or negative value is `INVALID_TTL`. No literal `900` or `15` appears in this area — the constant is
   imported (PRD §38.4).
4. **`DELETE /v1/widget-sessions/{token_id}`** (`MACHINE_ONLY_ROUTE`) — revoke a live session by its
   `tokenId`, so `AUTC-05.verifyWidgetSession`'s `REVOKED` reason is reachable and a customer backend
   can end a session when its own user signs out. A `token_id` belonging to another organisation and an
   absent one return `404 RESOURCE_NOT_FOUND` from the **same code path** (PRD §16.5, §34.9). Response
   `204`. Emits an audit event.
5. **Rate limiting is per service account.** The route declares the PRD §38.5 *"Widget session
   creation"* ledger keyed by **service account** (30/min trial, 120/min paid pilot) through `RUNT-02`'s
   configuration, with the PRD numbers as committed safe defaults in config rather than code
   (PRD §39.6 layer 1). A rejection is `429 RATE_LIMITED` with `Retry-After` and the caller's own
   limit/remaining/reset only — no other tenant's or other service account's counters (PRD §38.5).
   Exhausting this ledger must not affect the search, API-call, answer-credit or export ledgers
   (PRD §38.5 *"exhausting one does not misreport the others"*).
6. **Credit ceiling.** `credit_ceiling` is validated by `AUTC-05` against the credential's
   `budget_limit`; a ceiling above it is `INVALID_CEILING`. This area performs no budget arithmetic
   (`FND-09` owns it, `RUNT-02` enforces it).
7. **Audit events** (`IDNT-01`'s `emitIdentityAudit`, in addition to `AUTC-05`'s own `AuditSink` call)
   for mint and revoke, carrying `{ action, actorId (the service account's actor), organizationId,
   resourceType: 'WIDGET_SESSION', resourceId: tokenId, result, requestId }` plus origins, features and
   TTL as bounded values — **never the token** (PRD §22, §38.4, §35.6).
8. **A negative-capability assertion.** A test enumerates the routes this area registers and asserts
   the area exposes **nothing** that could let a widget token create a service account, read a Research
   Record or reach settings/admin — PRD §38.4's forbidden list, expressed as
   `AUTC-05.WIDGET_FORBIDDEN_CAPABILITIES`. This is the co-located half of `DEV-002`; the full
   negative-capability suite over `/v1` is `23-assurance`.
9. **`apps/api/test/routes/widget-sessions/**`** — this ticket's suites, built on `IDNT-01`'s exported
   `apps/api/test/routes/auth/identity-route-harness.ts`, `IDNT-06`'s seeded service accounts and
   `AUTC-04`/`AUTC-05`'s in-memory fakes.

## Acceptance checklist (classified)

- [ ] `[machine]` The area registers as `apps/api/src/routes/widget-sessions/` and serves under
      `/v1/widget-sessions` with **zero** diff to any tracked file outside that directory — asserted
      with `RUNT-01`'s `apps/api/test/route-area-conformance.ts` (plan **A1**)
- [ ] `[machine]` **`DEV-002` principal rule:** a cookie-authenticated user session and a
      widget-token-authenticated caller are each rejected `401 AUTHENTICATION_REQUIRED`; only a verified
      service credential can mint (PRD §33.5 step 2, §38.4; `DEV-002`)
- [ ] `[machine]` A credential without the required scope is refused, using `AUTC-05`'s gate with no
      local scope logic (PRD §38.4)
- [ ] `[machine]` **TTL cap:** `ttl_seconds` above 900 is clamped and the response's `expires_at`
      reflects the effective 900 s; zero or negative is `INVALID_TTL`; no literal `900`/`15` appears in
      this area (PRD §38.4 *"maximum 15-minute lifetime"*)
- [ ] `[machine]` **Origin binding:** an empty `allowed_origins`, a relative origin, a wildcard and a
      non-HTTPS origin (outside the development localhost exception) are each rejected `INVALID_ORIGIN`
      (PRD §38.4, §21.1 *"exact widget origins"*)
- [ ] `[machine]` `allowed_features` outside `WIDGET_ALLOWED_FEATURES`, or intersecting
      `WIDGET_FORBIDDEN_CAPABILITIES`, is rejected `INVALID_FEATURE` (PRD §38.4)
- [ ] `[machine]` `credit_ceiling` above the credential's `budget_limit`, or negative, is rejected
      `INVALID_CEILING`; this area performs no budget arithmetic — source scan (PRD §38.4, §24.4;
      `FND-09`)
- [ ] `[machine]` **Tenant derivation:** an `organization_id` supplied in the body, query or header is
      rejected `400 INVALID_REQUEST` naming the field, and the minted claims always carry the
      credential's organisation (PRD §34.1, §16.1)
- [ ] `[machine]` The minted claim set is exactly PRD §38.4's — organisation, service account,
      pseudonymous external user, allowed origins, allowed features, environment, credit ceiling and
      unique token ID — asserted by decoding the claims **through `AUTC-05`'s verifier**, never by
      parsing the token in this area (PRD §38.4; `02-auth-core` **D8**)
- [ ] `[machine]` **Token appears once:** the mint response is the only place the token string appears;
      a canary token is absent from every other response, every log line and every audit event
      (PRD §22, §38.4; sub-PRD **D5**)
- [ ] `[machine]` `DELETE /v1/widget-sessions/{token_id}` makes `verifyWidgetSession` return `REVOKED`
      immediately (`AUTC-05` deliverable 4)
- [ ] `[machine]` **Rate limit:** the PRD §38.5 widget-session-creation ledger is keyed per service
      account; exhausting it returns `429 RATE_LIMITED` with `Retry-After` and the caller's own
      limit/remaining/reset only, and leaves the search, API-call, answer-credit and export ledgers
      unchanged (PRD §38.5)
- [ ] `[machine]` **Tenant isolation (`SEC-001`, PRD §21.2):** revoking another organisation's
      `token_id` and an absent `token_id` return **byte-identical** `404 RESOURCE_NOT_FOUND` bodies
      apart from `request_id` (PRD §16.5, §34.9)
- [ ] `[machine]` **Tenant isolation (`SEC-001`):** an architecture assertion over
      `apps/api/src/routes/widget-sessions/**` finds no unscoped `packages/database` import — copy the
      construction pattern from `apps/api/test/admission/architecture.test.ts` (`RUNT-02` deliverable 13)
- [ ] `[machine]` The area registers no route beyond mint and revoke, and nothing in it can create a
      service account, read a Research Record or reach settings/admin (PRD §38.4; deliverable 8)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `DEV-002`, `SEC-001`, the tenant/security
      impact, the cost/latency impact of the §38.5 ledger, the rollback path and the **known gap** for
      sub-PRD **OQ3** (durable audit persistence)
- [ ] `[human]` `DEV-002` rehearsed manually against a running stack: a simulated customer backend mints
      a session with `curl` and a service credential; the token is used from an allowed origin and
      refused from another; the long-lived credential never appears in any browser request
      (PRD §30.2 DEV-002 *"Long-lived key never appears in browser storage/network fixture"*, §43.4).
      The browser half needs `PLTF-05`, so run after it merges — **not required to merge this ticket**
- No `[fixture]` criteria — this ticket replays no recorded source or evaluation data; plan §1.1 maps
      `[fixture]` to PRD §40.8 adapter fixtures and PRD §14/§43 evaluation replays, neither of which
      exists at this layer
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)

## Test plan

Reviewer steps, offline, no network and no browser. Database is a temp-file `app.sqlite` migrated with
`DATA-01`'s runner and seeded through `DATA-04`'s `packages/database/test/tenancy/factories.ts`;
`packages/auth` ports use the in-memory fakes from `packages/auth/test/support/**` with a settable
`FakeClock` and deterministic `FakeRandom`; the harness is `IDNT-01`'s exported
`apps/api/test/routes/auth/identity-route-harness.ts` extended with `IDNT-06`-created service accounts.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/api`. Suites live under `apps/api/test/routes/widget-sessions/`.
3. **`area-registration.test.ts`** — reuse `apps/api/test/route-area-conformance.ts` (`RUNT-01`); assert
   the prefix `/v1/widget-sessions` and that exactly two routes are registered.
4. **`principal-kind.test.ts`** — mint attempts with (a) a cookie session for an Owner, (b) a widget
   token, (c) no credential, (d) a verified service credential; assert 401 for a–c and 201 for d.
5. **`validation.test.ts`** — table-driven over `AUTC-05`'s five failure reasons: missing scope; empty
   origins; relative origin; wildcard origin; `http://` origin; unknown feature; forbidden feature;
   ceiling above `budget_limit`; negative ceiling; `ttl_seconds` 0, −1, 901 and 86 400. Assert status
   and `details.reason` for each, and that 901 is **clamped**, not rejected, when supplied as a value
   the PRD permits to be clamped (per deliverable 3's rule — assert the effective `expires_at`).
6. **`claims.test.ts`** — mint, then decode the token through `AUTC-05.verifyWidgetSession` (never by
   parsing it here) and assert every PRD §38.4 claim is present and equals the request or the
   credential; assert the organisation equals the credential's even when the body carries a different
   one (which must itself be rejected first).
7. **`revoke.test.ts`** — mint, verify (ok), revoke, verify again (expect `REVOKED`); revoke another
   organisation's `token_id` and an absent one and byte-compare the two 404 bodies after masking
   `request_id`.
8. **`rate-limit.test.ts`** — drive the widget-session ledger to exhaustion for one service account with
   a fake clock; assert `429 RATE_LIMITED` with `Retry-After`; assert a second service account in the
   same organisation is unaffected; assert the search/API-call/export ledgers are unchanged; assert the
   429 body contains no other organisation's or service account's identifier.
9. **`architecture.test.ts`** — source scan for unscoped `packages/database` imports, TTL literals,
   token parsing and budget arithmetic; copy the pattern from
   `apps/api/test/admission/architecture.test.ts` (`RUNT-02`).
10. **`leak.test.ts`** — force `FakeRandom` so the token contains `secret-canary-<uuid>`; run the whole
    area's request matrix; scan every response body except the mint response, every captured log line
    and every `RecordingAuditSink` event; assert absence.
11. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether any code
    path lets a cookie session reach `issueWidgetSession`; whether a revoked `tokenId` can be replayed
    within a caching window; whether `allowed_origins` comparison is exact (scheme + host + port) rather
    than prefix or suffix matching; whether the rate-limit key can be evaded by rotating credentials
    within one service account.
12. The `[human]` row is run against a locally started stack (`pnpm stack:up`, `RUNT-09`) with `curl`
    after `PLTF-05` merges, and recorded in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies anything in this ticket, update **this ticket file**
first (version note + changelog line in the PR), re-publish with
`.claude/scripts/publish-tickets.mjs --sync`, then change code. Silent divergence is an incomplete
ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`RUNT-02` does not expose the resolved `VerifiedCredential` to a handler** → `issueWidgetSession`
  cannot be called at all, because it accepts nothing else (`AUTC-05` deliverable 3). Amend
  `RUNT-02`'s deliverable 4 and this ticket's deliverable 2 together in one docs PR, `--sync` both, and
  only then code. **Never** write `apps/api/src/{plugins,middleware}/**`, and never re-verify the
  credential inside this area.
- **`AUTC-05` cannot express a needed claim or a needed revocation path** → the fix belongs in
  `02-auth-core`. Add a ticket there and add the edge in `docs/prd/breakdown-plan.md` §5.14/§6.2
  **first**. Never sign, parse or inspect a widget token in `apps/api` — that falsifies
  `02-auth-core` **D8** ("the encoding is internal").
- **`PLTF-05` needs a field or a second endpoint this area does not provide** (it is `blocked_by` this
  ticket) → amend this ticket's deliverable 2 in a docs PR and `--sync`; do not let
  `20-developer-platform` write `apps/api/src/routes/widget-sessions/**`, and do not write
  `apps/widget/**` from here.
- **The PRD §38.5 widget-session rate limit cannot be keyed per service account** with `RUNT-02`'s
  ledger model → that is a `RUNT-02` contract gap. Amend `RUNT-02`'s deliverable 7 and this ticket's
  deliverable 5 in one docs PR and `--sync` both. Do not implement a second counter here.
- **A required failure has no PRD §34.9 code** → the catalogue is closed (sub-PRD **D12**). Use
  `400 INVALID_REQUEST` + `details.reason`. If genuinely impossible, raise it in
  `docs/prd/13-identity-surface/README.md` §Open questions with the **Founder** as owner (PRD §45.5).
- **`FND-04`'s OpenAPI has no widget-session security scheme or path** (sub-PRD **OQ8**) → raise a
  `00-foundation` ticket and add the edge in `docs/prd/breakdown-plan.md`. Never edit
  `schemas/openapi/**`.
- **`IDNT-01`'s `_lib` toolkit lacks the `MACHINE_ONLY_ROUTE` preset or an equivalent** → amend
  `IDNT-01`'s deliverable 5 and this ticket together in one docs PR and `--sync` both. Never write
  inside `apps/api/src/routes/auth/**`.

**3. Escalation.** *"long-lived service credentials MUST NOT enter the browser"* (PRD §8.10) and the
15-minute, origin-bound, opaque-token contract (PRD §38.4) are release requirements with MUST force,
and `DEV-002`'s evidence is that the long-lived key never appears in a browser fixture. `PLTF-05`
depends on this endpoint. If the backend-only minting rule or the TTL cap is outright falsified, that
overturns a team decision recorded in `02-auth-core`'s sub-PRD **D8**: escalate for re-review before any
code lands. Never add a cookie or browser path to minting inside this ticket.
