---
id: IDNT-06
title: Service-account and credential routes
module: 13-identity-surface
lane: 13-identity-surface
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [IDNT-01, AUTC-04]
blocks: [IDNT-07, PLTF-04, PLTF-07]
---

# IDNT-06 — Service-account and credential routes

Implements PRD §16.3 (authentication and machine access) and §38.4 (service account and widget
tokens), carrying requirement `AUTH-006` ("Service credentials are shown once, hashed, scoped,
expiring and rotatable"). **No ADR — the decision is already made in PRD §16.3 and §38.4; this is build
ticket 6 of 9 against it.**
Parent sub-PRD: [13-identity-surface README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`IDNT-01` — Auth/session routes and organisation-switch context](IDNT-01-auth-session-routes-and-organisation-switch-context.md);
`AUTC-04` — Machine credentials: hashing, scopes, rotation, expiry
([`02-auth-core`](../../02-auth-core/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope, exposing `AUTC-04`'s
credential primitives over the fixed PRD §34.1/§34.9 wire contract — not a new subsystem decision.

## Background + basis

**The endpoint family is named by the PRD.** PRD §16.3: *"**Service-account and credential
create/rotate/revoke.**"* The same section fixes the scope vocabulary:

> Example service scopes: `search:read` · `answers:create` · `records:read` · `records:write` ·
> `coverage:create` · `monitor:read` · `monitor:write` · `exports:create` · `usage:read`

**The credential contract is normative.** PRD §38.4:

> **Service credentials use a public prefix plus at least 256 bits of random secret; only a
> memory-hard/hash verifier is stored. Keys have exact scopes, expiry and optional IP/rate/budget
> restrictions. Rotation creates a new key; an optional maximum 24-hour overlap is explicit and
> auditable.**

PRD §35.4:

> | `service_account` | `id`, `organization_id`, `name`, `status`, `scopes_json`, `expires_at`,
> `ip_allowlist_json`, `budget_limit`, `row_version` | **no Web login** |
> | `api_credential` | `id`, `organization_id`, `service_account_id`, `prefix`, `secret_hash`,
> `created_at`, `expires_at`, `last_used_at`, `revoked_at` | **full secret displayed once** |

**The requirement and its acceptance evidence.** PRD §30.2:

> | AUTH-006 | Service credentials are shown once, hashed, scoped, expiring and rotatable |
> `/developer/service-accounts` | service-account endpoints | App | **Old key fails immediately after
> rotation/revocation** |

PRD §32.8 governs how the screen may display them — *"Developer pages MUST display environment, base
URL, API version, current key prefix/scopes/expiry, limits, OpenAPI version, webhook signing
instructions and copyable Search/Answer examples. **Secrets are never redisplayed.**"* — and that screen
is `PLTF-07` (`20-developer-platform`), not this ticket.

**The primitives already exist and must not be re-implemented.** `AUTC-04` (`02-auth-core`) exports:

- `generateCredential({ serviceAccountId, expiresAt }, deps): { row, display }` — *"`display` is the
  plaintext credential string returned **exactly once** and `row` contains only `prefix` and
  `secret_hash`"*; `CREDENTIAL_SECRET_BITS = 256 as const`; `parseCredential(presented)` which *"never
  throws on malformed input"*.
- `CREDENTIAL_HASH_PARAMS`, `hashSecret`, `verifySecret` — constant-time, *"never logging or returning
  the secret"*.
- `SCOPE_ALLOWLIST` — the nine PRD §16.3 values verbatim (or the `packages/contracts` enum if `FND-03`
  exports one); `parseScopes(json)`; `assertScope(granted, required)` — *"**exact match only; no
  wildcards, no prefix expansion, no implication**"*; and `FORBIDDEN_FOR_SERVICE_ACCOUNTS` documenting
  that *"member/role management, retention/closure configuration, SSO configuration and internal
  administration are never expressible as scopes"*.
- `isExpired(credential, now)`, `isIpAllowed(ip, allowlistJson)` (exact IP and CIDR, IPv4 and IPv6,
  malformed entry fails closed).
- `authenticateCredential(presented, ctx, deps)` — the single verification entry point, used by
  `RUNT-02`, not by this area.
- `CREDENTIAL_OVERLAP_MAX_SECONDS = 86_400 as const`, `rotateCredential({ credentialId,
  overlapSeconds?, reason }, now, deps)` with *"**Default `overlapSeconds = 0`** → the previous
  credential is revoked in the same operation, so 'Old key fails immediately after
  rotation/revocation' (AUTH-006) holds by default"* and *"`overlapSeconds >
  CREDENTIAL_OVERLAP_MAX_SECONDS` is **rejected**; any non-zero overlap emits an `AuditSink` event
  recording the requested window and the reason"*; `revokeCredential({ credentialId, reason }, now,
  deps)`.

**Who may manage them.** PRD §38.1 row *"Manage service accounts/webhooks/widget"*: Owner ✓, Admin ✓,
Researcher —, Viewer —, Developer *"✓ within granted developer permission"*, service account —. The
decision comes from `FND-06.evaluate()` (its `DEVELOPER_PERMISSION_GRANTED` condition); this area never
re-states it. Note the last column: **a service credential can never manage service accounts**
(PRD §38.4: *"The token cannot create service accounts …"* for widget tokens, and §38.1's dash for the
service-account column here).

**Wire rules.** PRD §16.1 (`/v1`, `request_id`, organisation from authenticated context). PRD §34.1:
opaque ids; ISO 8601 UTC; `page_size` 1–100 default 25 with opaque `next_cursor`; **`Concurrency |
Mutable resources return `ETag`; writes require `If-Match` where documented`** —
`service_account.row_version` is the ETag source; **tenant never in a body**. PRD §34.9 is the closed
catalogue; reachable here: `400 INVALID_REQUEST`, `401 AUTHENTICATION_REQUIRED`, `403 MFA_REQUIRED`,
`403 RECENT_AUTH_REQUIRED`, `404 RESOURCE_NOT_FOUND`, `409 CONCURRENT_MODIFICATION`,
`429 RATE_LIMITED`, `500 INTERNAL_ERROR`. **PRD §34 contains no service-account payload example**
(§34.2–§34.8 cover other domains); sub-PRD **D4** makes the binding shapes §34.1 + §34.9 + PRD §35.4's
columns + `AUTC-04`'s exported types + the generated types from `FND-04`'s OpenAPI. Never edit
`schemas/openapi/**` from here.

**Routing and shared toolkit.** `RUNT-01`'s A1 contract makes `apps/api/src/routes/service-accounts/`
an autoloaded area at `/v1/service-accounts`; the shared toolkit (`getIdentityContext`,
`mapAuthFailure`, `emitIdentityAudit`, route presets) is `IDNT-01`'s
`apps/api/src/routes/auth/_lib/**`, imported read-only (sub-PRD **D3**).

**Accepted caveats carried forward, documented not enforced here:**

- **Rate, budget and IP restrictions are carried, not enforced, here.** PRD §38.5's ledgers are
  enforced by `RUNT-02` using `packages/domain/src/budget` (`FND-09`); `AUTC-04`'s
  `restrictions.ts` explicitly makes them *"pass-through carriers … No enforcement decisions"*. This
  area stores and returns the values.
- **Verification is not here.** `authenticateCredential` is called by `RUNT-02`'s `authenticate` stage.
- **The developer screen is `PLTF-07`** and the sandbox organisation is `PLTF-04`; both are
  `blocked_by` this ticket (plan §6.2).
- **Durable audit persistence** is sub-PRD **OQ3**; events go through `IDNT-01`'s `emitIdentityAudit`.

## Goal

Produce the `apps/api/src/routes/service-accounts/` route area serving service-account and credential
create, read, list, update, disable, rotate and revoke under `/v1/service-accounts`, such that a
credential string exists in exactly one response and a rotated or revoked credential stops working
immediately. Completion is mechanically checkable: the creation and rotation responses are the only
places a credential string appears; every read returns prefix/status/expiry/scopes only; a scope outside
`SCOPE_ALLOWLIST` or inside `FORBIDDEN_FOR_SERVICE_ACCOUNTS` is rejected at creation; an overlap above
24 hours is rejected and any non-zero overlap is audited; a rotated credential fails verification
immediately with the default zero overlap; a service credential cannot call these routes at all; and
another organisation's service-account id is byte-identically indistinguishable from an absent one.

## Non-goals

- **No credential format, hashing, scope semantics, rotation logic or verification.**
  `packages/auth/src/credentials/**` is `AUTC-04`. This area calls it and stores nothing itself.
- **No widget sessions.** `POST /v1/widget-sessions` is `IDNT-07`, which is `blocked_by` this ticket.
- **No developer screens, sandbox organisation, webhooks or usage endpoints.** `PLTF-07`, `PLTF-04`,
  `WTCH-05`, `PLTF-09` (`20-developer-platform`, `16-monitor-alerts`).
- **No rate/quota/budget enforcement.** `RUNT-02` + `FND-09`.
- **No permission matrix.** `FND-06` (`00-foundation`).
- **No tables or repositories.** `packages/database/**` is `01-app-data` (plan **A3**); rows are reached
  through `AUTC-04`'s injected `IdentityPort` and `DATA-04`'s scoped repositories.
- **No admission stages, no error catalogue, no OpenAPI.** `RUNT-02`, `RUNT-01`, `FND-04`.
- **No cross-boundary suites.** `tests/**` is `23-assurance`; this ticket carries its own co-located
  assertions (plan §9 **R8**).

## File-scope (write-owns)

- `apps/api/src/routes/service-accounts/**` — the route area, including its A1 entry file `index.ts`.
- `apps/api/test/routes/service-accounts/**` — this ticket's own unit/integration tests (plan §1.1).
- `apps/api/package.json` — **append-only** if a dependency is required (plan §1.1).

Does not touch:

- `apps/api/src/routes/auth/**` — `IDNT-01`, including `_lib/**`, which this ticket **imports** but
  never writes.
- `apps/api/src/routes/{invitations,members,mfa,sso,widget-sessions}/**` — `IDNT-02`…`IDNT-05`,
  `IDNT-07`.
- `apps/api/src/routes/{health,system-status}/**` — `RUNT-08`; `apps/api/src/routes/{sandbox,usage,audit-events}/**` —
  `20-developer-platform`; every other area belongs to `14`, `15`, `16`, `17`, `19` or `22` (plan §4).
- `apps/api/src/{server.ts,app.ts,bootstrap,errors,plugins,middleware,sse}/**` — `RUNT-01`, `RUNT-02`,
  `RUNT-03`.
- `packages/auth/**` — `02-auth-core`; `packages/database/**` — `01-app-data`; `packages/domain/**`,
  `packages/contracts/**`, `schemas/openapi/**` — `00-foundation`; `packages/ui/**`,
  `packages/observability/**` — `RUNT-06`, `RUNT-07`.
- `apps/web/**` (including `features/developer/**` — `PLTF-07`), `apps/worker/**`, `apps/admin/**`,
  `apps/widget/**`, `infra/**`, `tests/**`, root manifests, lockfiles, `.github/workflows/**`.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, no in-flight
ticket), so nothing has previously written these paths and nothing contends for them. Under the A1
autoload convention (`RUNT-01` contract §1/§6) `apps/api/src/routes/service-accounts/` is an
independent directory whose addition produces zero diff elsewhere, so it is disjoint from the six
sibling identity areas and from `20-developer-platform`'s `routes/{sandbox,usage,audit-events}/**` —
there is no shared route index. This ticket sits in wave 2 with `IDNT-02`, `IDNT-03`, `IDNT-04` and
`IDNT-05`, all runnable as concurrent lanes (plan §7: 9 tickets, 3 minimum waves, 5 useful lanes); each
writes a different `routes/<area>/` directory. `apps/api/package.json` is append-only shared
(plan §1.1).

## Deliverables

1. **`apps/api/src/routes/service-accounts/index.ts`** — the A1 entry file: default-exported
   `FastifyPluginAsync` and `export const area = { admission: 'tenant' } satisfies RouteAreaConfig`.
   Every mutating route uses `IDNT-01`'s `SENSITIVE_ROUTE` preset (recent auth required — PRD §21.1
   *"recent auth for sensitive operations"*). Every route additionally rejects a **service-account
   principal**: PRD §38.1's *"Manage service accounts/webhooks/widget"* row gives the service-account
   column a dash, so a machine credential can never manage machine credentials. The rejection is the
   `FND-06` decision, mapped by `mapAuthFailure`.
2. **`POST /v1/service-accounts`** (`SENSITIVE_ROUTE`) — create. Request `{ name, scopes[], expires_at?,
   ip_allowlist?, budget_limit? }`. `scopes` is validated with `AUTC-04.parseScopes` against
   `SCOPE_ALLOWLIST`; a value outside it, or one named in `FORBIDDEN_FOR_SERVICE_ACCOUNTS`, is
   `400 INVALID_REQUEST` with `details.reason === 'SCOPE_NOT_PERMITTED'` and the offending scope
   **name** (a name, not a value — PRD §37.2). Response `201`: the service account without any
   credential. Creating a service account never mints a credential implicitly.
3. **`GET /v1/service-accounts`** and **`GET /v1/service-accounts/{service_account_id}`**
   (`TENANT_ROUTE`) — list and read, tenant-scoped, `page_size` 1–100 default 25 with an opaque
   `next_cursor` (PRD §34.1). `GET` by id sets the `ETag` header from `row_version`. Shape:
   `{ id, name, status, scopes, expires_at, ip_allowlist, budget_limit, created_at, updated_at,
   credentials: [{ id, prefix, created_at, expires_at, last_used_at, revoked_at, status }] }` —
   `prefix` only, **never** `secret_hash` and never a credential string (PRD §35.4, §32.8).
4. **`PATCH /v1/service-accounts/{service_account_id}`** (`SENSITIVE_ROUTE`, `If-Match` **required**) —
   name, scopes, expiry, IP allowlist and budget limit. Reducing scopes takes effect at the next
   verification with no cache (`AUTC-04` deliverable 7's rule). Stale `row_version` →
   `409 CONCURRENT_MODIFICATION`.
5. **`POST /v1/service-accounts/{service_account_id}/disable`** (`SENSITIVE_ROUTE`, `If-Match`
   **required**) — sets the account status so `authenticateCredential` fails with `ACCOUNT_DISABLED`
   at the next verification. Does not delete rows.
6. **`POST /v1/service-accounts/{service_account_id}/credentials`** (`SENSITIVE_ROUTE`) — mint.
   Delegates to `AUTC-04.generateCredential`; persists **only** `row` (prefix + `secret_hash`).
   Response `201`: `{ id, prefix, expires_at, created_at, secret }` where `secret` is `display`.
   **This is one of exactly two responses in the product that contain a credential string**
   (sub-PRD **D5**; PRD §35.4 *"full secret displayed once"*; PRD §32.8 *"Secrets are never
   redisplayed"*). The response body includes a `warning` string the screen renders verbatim; the
   secret is never persisted, logged, echoed in an error or returned again.
7. **`POST /v1/service-accounts/{service_account_id}/credentials/{credential_id}/rotate`**
   (`SENSITIVE_ROUTE`) — `AUTC-04.rotateCredential`. Request `{ overlap_seconds?, reason }` — `reason`
   is **required** because PRD §38.4 requires any overlap to be *"explicit and auditable"*.
   `overlap_seconds` defaults to `0`; a value above `CREDENTIAL_OVERLAP_MAX_SECONDS` (86 400) is
   `400 INVALID_REQUEST` with `details.reason === 'OVERLAP_TOO_LONG'`; any non-zero value emits the
   audit event `AUTC-04` specifies **and** is echoed in the response so the screen can show it. Response
   `201`: the new credential (deliverable 6's shape) plus `previous_expires_at`.
8. **`DELETE /v1/service-accounts/{service_account_id}/credentials/{credential_id}`**
   (`SENSITIVE_ROUTE`) — `AUTC-04.revokeCredential` with a **required** `reason` query/body field.
   Effective at the next verification with no caching layer (`AUTC-04` deliverable 7). Response `204`.
9. **`GET /v1/service-accounts/scopes`** (`TENANT_ROUTE`) — the grantable scope catalogue derived from
   `SCOPE_ALLOWLIST` (or the `packages/contracts` enum), each with its PRD §16.3 name and a short
   description, plus the `FORBIDDEN_FOR_SERVICE_ACCOUNTS` list so `PLTF-07` can explain why some
   capabilities are unavailable. **No scope list is written out in this area** — a source scan asserts
   it (PRD §35.1: controlled values are generated from `packages/contracts`).
10. **Audit events** (`IDNT-01`'s `emitIdentityAudit`) for create, update, disable, credential mint,
    rotate (with the requested overlap and reason) and revoke, carrying `{ action, actorId,
    organizationId, resourceType: 'SERVICE_ACCOUNT' | 'API_CREDENTIAL', resourceId, result, requestId }`
    plus the credential **prefix** — never the secret (PRD §22, §38.4, §35.6).
11. **`apps/api/test/routes/service-accounts/**`** — this ticket's suites, built on `IDNT-01`'s exported
    `apps/api/test/routes/auth/identity-route-harness.ts` and `DATA-04`'s
    `packages/database/test/tenancy/factories.ts`.

## Acceptance checklist (classified)

- [ ] `[machine]` The area registers as `apps/api/src/routes/service-accounts/` and serves under
      `/v1/service-accounts` with **zero** diff to any tracked file outside that directory — asserted
      with `RUNT-01`'s `apps/api/test/route-area-conformance.ts` (plan **A1**)
- [ ] `[machine]` Every route declares an explicit admission profile and every mutating route requires
      recent auth (PRD §21.1)
- [ ] `[machine]` **`AUTH-006` display-once:** the mint and rotate responses are the only responses in
      this area containing a credential string; a canary secret is absent from every read/list response,
      every log line and every audit event (PRD §35.4, §32.8, §22; sub-PRD **D5**)
- [ ] `[machine]` A read or list never returns `secret_hash` and never returns anything beyond the
      credential `prefix` (PRD §35.4)
- [ ] `[machine]` **`AUTH-006` rotation:** after rotation with the default `overlap_seconds = 0` the
      previous credential fails `authenticateCredential` immediately; after revocation likewise
      (`AUTH-006` *"Old key fails immediately after rotation/revocation"*; `AUTC-04` deliverable 7)
- [ ] `[machine]` `overlap_seconds` above 86 400 is rejected `400 INVALID_REQUEST` with
      `details.reason === 'OVERLAP_TOO_LONG'`; a non-zero overlap emits an audit event recording the
      window and the reason, and the reason field is required (PRD §38.4 *"explicit and auditable"*)
- [ ] `[machine]` A scope outside `SCOPE_ALLOWLIST`, or one named in `FORBIDDEN_FOR_SERVICE_ACCOUNTS`,
      is rejected at creation and at update, naming the offending scope (PRD §16.3, §38.4)
- [ ] `[machine]` Scope matching is exact — granting `records:write` does not grant `records:read` —
      asserted through `AUTC-04.assertScope` with no local matching logic (PRD §38.4)
- [ ] `[machine]` **A service-account principal cannot call any route in this area** — every route
      returns the `FND-06`-derived refusal for a machine credential (PRD §38.1 *"Manage service
      accounts/webhooks/widget"* service-account column)
- [ ] `[machine]` **`AUTH-003` boundary:** Owner and Admin succeed; Researcher and Viewer are refused;
      Developer succeeds only with the granted developer permission — asserted against `FND-06`'s
      committed fixture `packages/domain/test/access/prd-38-1-matrix.json`, and this area contains no
      role literal (PRD §38.1; plan §9 **R5**)
- [ ] `[machine]` `PATCH`/`disable` require `If-Match`; a missing header is `400 INVALID_REQUEST` and a
      stale `row_version` is `409 CONCURRENT_MODIFICATION` (PRD §34.1, §16.2, §34.9)
- [ ] `[machine]` **Tenant isolation (`SEC-001`, PRD §21.2):** another organisation's
      `service_account_id` or `credential_id` and an absent id return **byte-identical**
      `404 RESOURCE_NOT_FOUND` bodies apart from `request_id`; the list returns only the calling
      organisation's rows (PRD §16.5, §34.9)
- [ ] `[machine]` **Tenant isolation (`SEC-001`):** an architecture assertion over
      `apps/api/src/routes/service-accounts/**` finds no unscoped `packages/database` import — copy the
      construction pattern from `apps/api/test/admission/architecture.test.ts` (`RUNT-02` deliverable 13)
- [ ] `[machine]` An organisation identifier supplied in body, query or header is rejected
      `400 INVALID_REQUEST` naming the field (PRD §34.1, §16.1)
- [ ] `[machine]` This area contains no scope list, no hashing, no prefix grammar and no expiry
      arithmetic of its own — source scan asserting every value comes from `packages/auth/credentials`
      or `packages/contracts` (PRD §35.1, §45.2; plan §9 **R5**)
- [ ] `[machine]` `GET /v1/service-accounts` honours `page_size` 1–100 default 25 with an opaque
      `next_cursor`; 0 and 101 are rejected (PRD §34.1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `AUTH-006`, `SEC-001`, the tenant/security
      impact, the rollback path and the **known gap** for sub-PRD **OQ3** (durable audit persistence)
- [ ] `[human]` `AUTH-006` rehearsed manually against a running stack: mint a credential, copy it once,
      confirm it cannot be re-read anywhere, call a `/v1` endpoint with it, rotate it, and confirm the
      old value is rejected immediately (PRD §30.2 AUTH-006, §43.4). The `/developer/service-accounts`
      screen is `PLTF-07`, so the screen half of this run is **not required to merge this ticket**
- No `[fixture]` criteria — this ticket replays no recorded source or evaluation data; plan §1.1 maps
      `[fixture]` to PRD §40.8 adapter fixtures and PRD §14/§43 evaluation replays, neither of which
      exists at this layer
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)

## Test plan

Reviewer steps, offline, no network. Database is a temp-file `app.sqlite` migrated with `DATA-01`'s
runner and seeded through `DATA-04`'s `packages/database/test/tenancy/factories.ts`; `packages/auth`
ports use the in-memory fakes from `packages/auth/test/support/**` with a settable `FakeClock` and a
deterministic `FakeRandom`; the harness is `IDNT-01`'s exported
`apps/api/test/routes/auth/identity-route-harness.ts`.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/api`. Suites live under `apps/api/test/routes/service-accounts/`.
3. **`area-registration.test.ts`** — reuse `apps/api/test/route-area-conformance.ts` (`RUNT-01`); assert
   the prefix `/v1/service-accounts` and compare registered route/profile pairs to a literal table.
4. **`create-and-scopes.test.ts`** — create with valid scopes; with a scope outside `SCOPE_ALLOWLIST`;
   with a `FORBIDDEN_FOR_SERVICE_ACCOUNTS` value; assert statuses and that the offending scope name is
   returned. Then a source scan asserting no scope literal in this area.
5. **`display-once.test.ts`** — mint; assert `secret` present; then read, list and re-read and assert
   the secret string is absent everywhere. Rotate; assert the new secret appears once and the previous
   one never reappears.
6. **`rotation.test.ts`** — rotate with default overlap and assert the previous credential fails
   `authenticateCredential` immediately; rotate with `overlap_seconds = 3600` and assert the previous
   credential still verifies until the fake clock passes the window, and that the audit event records
   the window and reason; rotate with `overlap_seconds = 86_401` and assert `OVERLAP_TOO_LONG`; rotate
   without `reason` and assert `400 INVALID_REQUEST`.
7. **`revoke.test.ts`** — revoke and assert immediate verification failure; revoke twice and assert the
   second call is safe.
8. **`principal-kind.test.ts`** — call every route with a service-credential principal and assert every
   one is refused; then with each of the five roles and assert the `FND-06` matrix outcome, reading the
   expectation from `packages/domain/test/access/prd-38-1-matrix.json`.
9. **`etag.test.ts`** — `PATCH`/`disable` without `If-Match` (400), with a stale value (409), with the
   current value (success plus a changed `ETag`).
10. **`tenant-isolation.test.ts`** — organisations A and B; as an A Owner, read/patch/rotate/revoke B's
    service account and credential and a syntactically valid absent id; byte-compare the two 404 bodies
    after masking `request_id`.
11. **`architecture.test.ts`** — source scan for unscoped `packages/database` imports, scope literals,
    hashing and prefix grammar; copy the pattern from `apps/api/test/admission/architecture.test.ts`
    (`RUNT-02`).
12. **`leak.test.ts`** — force `FakeRandom` so the credential secret is `secret-canary-<uuid>`; run the
    whole area's request matrix; scan every response body except the mint and rotate responses, every
    captured log line and every `RecordingAuditSink` event; assert absence.
13. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether a
    concurrent rotate and revoke can leave both credentials live; whether a reduced scope set can still
    be used because something caches the verification; whether the credential string can reach a log via
    an error message or a validation echo; whether a Developer without the granted permission can reach
    any route.
14. The `[human]` row is run against a locally started stack (`pnpm stack:up`, `RUNT-09`) using `curl`
    against `/v1`, and recorded in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies anything in this ticket, update **this ticket file**
first (version note + changelog line in the PR), re-publish with
`.claude/scripts/publish-tickets.mjs --sync`, then change code. Silent divergence is an incomplete
ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`AUTC-04`'s functions cannot be composed into a route without re-implementing part of the format,
  hashing or scope logic** → the fix belongs in `02-auth-core`. Add a ticket there and make this one
  `blocked_by` it in `docs/prd/breakdown-plan.md` §5.14/§6.2 **first**. Never hash, generate or parse a
  credential in `apps/api` (PRD §45.2; plan §9 **R5**).
- **PRD §16.3's nine scopes are insufficient for a real endpoint** (a `/v1` route exists that no scope
  covers) → the scope list is a **product/API contract** (PRD §45.5). Do not add a scope here. Raise it
  in `docs/prd/13-identity-surface/README.md` §Open questions with the **Founder** as owner, and if the
  list is generated, raise the `FND-03` ticket in `00-foundation`. Never maintain a second list
  (PRD §35.1).
- **`DATA-04`'s `api_credential` repository lacks a needed column** (for example an overlap end stamp
  distinct from `revoked_at`) → add a ticket to `01-app-data` and make this one `blocked_by` it in
  `docs/prd/breakdown-plan.md` §5.14/§6.2. Never write `packages/database/**` (plan **A3**, plan §9
  **R4**).
- **A required failure has no PRD §34.9 code** → the catalogue is closed (sub-PRD **D12**). Use
  `400 INVALID_REQUEST` + `details.reason`. If genuinely impossible, raise it in
  `docs/prd/13-identity-surface/README.md` §Open questions with the **Founder** as owner (PRD §45.5).
- **`PLTF-07` needs a field this area does not return** (it is `blocked_by` this ticket) → amend this
  ticket's deliverable 3 in a docs PR and `--sync`; do not let `20-developer-platform` write
  `apps/api/src/routes/service-accounts/**`, and do not write `apps/web/src/features/developer/**` from
  here — either direction is the file-scope defect plan §4 exists to prevent.
- **`FND-04`'s OpenAPI does not describe these paths** (sub-PRD **OQ8**) → raise a `00-foundation`
  ticket and add the edge in `docs/prd/breakdown-plan.md`. Never edit `schemas/openapi/**`.
- **`IDNT-01`'s `_lib` toolkit is missing something this area needs** → amend `IDNT-01`'s deliverables
  and this ticket together in one docs PR and `--sync` both.

**3. Escalation.** *"only a memory-hard/hash verifier is stored"* and *"full secret displayed once"*
(PRD §38.4, §35.4) are release requirements with MUST force, and `AUTH-006`'s evidence is *"Old key
fails immediately after rotation/revocation"*. Three tickets (`IDNT-07`, `PLTF-04`, `PLTF-07`) are
`blocked_by` this one. If display-once storage or immediate revocation proves unimplementable as
decided, that overturns a team decision recorded in `02-auth-core`'s sub-PRD **D7**: escalate for
re-review before any code lands. Never persist or re-display a credential inside this ticket.
