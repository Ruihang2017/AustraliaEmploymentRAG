---
id: IDNT-05
title: "SSO connection routes (draft/test/activate/disable)"
module: 13-identity-surface
lane: 13-identity-surface
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [IDNT-01, AUTC-03]
blocks: [IDNT-09]
---

# IDNT-05 — SSO connection routes (draft/test/activate/disable)

Implements PRD §16.3 (authentication and machine access) and §38.3 (SSO lifecycle), carrying
requirement `AUTH-005` ("SAML/OIDC is testable before enforcement; break-glass Owner remains"). **No
ADR — the decision is already made in PRD §16.3 and §38.3; this is build ticket 5 of 9 against it.**
Parent sub-PRD: [13-identity-surface README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`IDNT-01` — Auth/session routes and organisation-switch context](IDNT-01-auth-session-routes-and-organisation-switch-context.md);
`AUTC-03` — SSO connectors and lifecycle state machine with break-glass
([`02-auth-core`](../../02-auth-core/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope, exposing `AUTC-03`'s SSO
state machine and connectors over the fixed PRD §34.1/§34.9 wire contract — not a new subsystem
decision.

## Background + basis

**The lifecycle is enumerated, not sketched.** PRD §38.3, in full:

> 1. Owner/Admin creates `DRAFT` configuration.
> 2. Secrets/metadata are validated and encrypted.
> 3. A test login uses a **non-enforced callback** and moves to `TESTING`.
> 4. Successful identity/domain/claim mapping records `tested_at` and permits `ACTIVE`.
> 5. **Enforcement requires recent MFA, successful test and acknowledgement of the break-glass path.**
> 6. Error disables new SSO logins according to safe policy but **does not delete configuration or
>    block break-glass access**.
> 7. Disabling/replacing SSO revokes relevant sessions when selected and creates an audit/security
>    event.
>
> JIT provisioning is permitted only for verified domains and a controlled default role. **SCIM is
> absent; member removal remains manual for MVP.**

PRD §16.3:

> **SSO connection states: `DRAFT`, `TESTING`, `ACTIVE`, `ERROR`, `DISABLED`. SSO cannot be enforced
> before a successful test.** A tightly controlled MFA-protected Owner break-glass account MUST remain
> available and MUST generate a high-priority security event when used. SCIM is excluded.

PRD §35.4: *"`sso_connection` | `id`, `organization_id`, `protocol`, `state`, encrypted configuration,
`tested_at`, `enforced_at`, `row_version` | **enforcement requires successful current test**"*.

**The requirement and its acceptance evidence.** PRD §30.2:

> | AUTH-005 | SAML/OIDC is testable before enforcement; break-glass Owner remains | `/settings/sso` |
> SSO endpoints | App | **Failed IdP test cannot lock out the organisation** |

PRD §41.2:

> | `UAT-AUTH-04` | Owner enables SSO before test | **Action blocked with exact test requirement and
> break-glass explanation** |

**The primitives already exist and must not be re-implemented.** `AUTC-03` (`02-auth-core`) exports:

- `SSO_TRANSITIONS` — the five states as a `{ from, to, guard }` table, and
  `applyTransition(connection, to, context, deps)` returning `{ ok: true, connection } | { ok: false,
  reason }`; *"any transition absent from the table is refused with `reason: 'ILLEGAL_TRANSITION'`.
  `row_version` is checked and incremented on every write."*
- `validateSsoConfig(protocol, config)`, `hashSsoConfig(config)`, and `updateSsoConfig(...)` which
  *"**MUST clear `testedAt` and `testedConfigHash`** and move `ACTIVE`/`TESTING` back to `DRAFT`"* —
  `02-auth-core` decision **D6**: no configuration edit may ride on an earlier success.
- `connectors/saml.ts` and `connectors/oidc.ts`, each exporting `verifyAssertion(input, now, deps)`
  with per-failure reasons (unsigned, wrong audience, wrong issuer, expired, skewed, replayed) and
  **no network I/O**.
- `runSsoTest({ connectionId, assertion }, now, deps)` — *"A test login **never** creates a session,
  never provisions a user and never enforces — it only proves mapping."*
- `canEnforce(c, ctx, now)` → `{ ok: true } | { ok: false, reason: 'TEST_REQUIRED' | 'STALE_TEST' |
  'NOT_ACTIVE' | 'RECENT_AUTH_REQUIRED' | 'BREAK_GLASS_NOT_ACKNOWLEDGED' | 'NO_BREAK_GLASS_PATH' }` and
  `enforce(...)`; *"The three §38.3 step-5 conditions … are each a separate refusal reason so `IDNT-05`
  can render 'the exact test requirement and break-glass explanation' (`UAT-AUTH-04`)."*
- `assertBreakGlassAvailable(org, deps)` and `recordBreakGlassUse({ actorId, organizationId, reason },
  deps)` — *"a transition that would reduce the count to zero is refused with `NO_BREAK_GLASS_PATH`"*;
  break-glass use emits the highest-severity audit event.
- `resolveJitProvisioning({ connection, identity }, deps)` — verified domain and one controlled default
  role only, never Owner, fails closed.
- `disableSso({ connectionId, revokeSessions }, deps)` — *"break-glass check → state write
  (`row_version` guarded) → session revocation → audit event"*.

**Who may configure.** PRD §38.1 row *"Configure SSO/enforce MFA"*: Owner ✓, Admin ✓, everyone else —.
The decision comes from `FND-06.evaluate()`; this area never re-states it.

**Wire rules.** PRD §16.1 (`/v1`, `request_id`, organisation from authenticated context). PRD §34.1:
opaque ids; ISO 8601 UTC; **`Concurrency | Mutable resources return `ETag`; writes require `If-Match`
where documented`** — `sso_connection.row_version` is the ETag source; **tenant never in a body**.
PRD §16.2: *"conflicts return `409 CONCURRENT_MODIFICATION`"*. PRD §34.9 is the closed catalogue;
reachable here: `400 INVALID_REQUEST`, `401 AUTHENTICATION_REQUIRED`, `403 MFA_REQUIRED`,
**`403 RECENT_AUTH_REQUIRED`** (the direct mapping for `canEnforce`'s `RECENT_AUTH_REQUIRED`),
`404 RESOURCE_NOT_FOUND`, `409 CONCURRENT_MODIFICATION`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.
**PRD §34 contains no SSO payload example** (§34.2–§34.8 cover other domains); sub-PRD **D4** makes the
binding shapes §34.1 + §34.9 + PRD §35.4's `sso_connection` columns + `AUTC-03`'s exported types + the
generated types from `FND-04`'s OpenAPI. Never edit `schemas/openapi/**` from here.

**Why login and callbacks live here.** Sub-PRD decision **D10**: `IDNT-05` is the only ticket in this
module with an `AUTC-03` edge, so it is the only one that may import `<auth-pkg>/sso`. PRD §38.3 step 3
requires a **non-enforced test callback** and step 6 requires that an `ERROR` state still permits
break-glass sign-in, so both callbacks and the login initiation belong with the connection routes. This
is an interpretation of plan §5.14 recorded as sub-PRD **OQ5** with `docs/prd/breakdown-plan.md` §5.14
as the writeback target.

**Routing and shared toolkit.** `RUNT-01`'s A1 contract makes `apps/api/src/routes/sso/` an autoloaded
area at `/v1/sso`; the shared toolkit (`getIdentityContext`, `mapAuthFailure`, `emitIdentityAudit`,
route presets) is `IDNT-01`'s `apps/api/src/routes/auth/_lib/**`, imported read-only (sub-PRD **D3**).

**Accepted caveats carried forward, documented not enforced here:**

- **No SCIM, no automated deprovisioning.** PRD §16.3 and §38.3 exclude them. Documented, not enforced.
- **Which SAML/OIDC libraries, and whether SAML ships on day one**, is `02-auth-core` **OQ3** — the
  state machine is protocol-agnostic and this area is a thin wrapper over it either way.
- **The break-glass Owner path is not *created* here.** `assertBreakGlassAvailable` enforces it and
  `IDNT-09` displays it, but no ticket provisions it — sub-PRD **OQ7**, Founder-owned. Until it exists,
  `enforce` correctly refuses with `NO_BREAK_GLASS_PATH`; that is the fail-closed behaviour PRD §16.3
  requires, and it must be stated as a known gap on the PR (PRD §45.4).
- **Durable audit persistence** is sub-PRD **OQ3**; events go through `IDNT-01`'s `emitIdentityAudit`,
  and break-glass use additionally goes through `AUTC-03`'s highest-severity `AuditSink` path.

## Goal

Produce the `apps/api/src/routes/sso/` route area serving SSO connection create/read/update, test
start and callback, activate, enforce, disable, plus SSO login initiation and the production callback,
under `/v1/sso` — such that a failed or absent IdP test can never lock an organisation out. Completion
is mechanically checkable: enforcement is refused unless the connection is `ACTIVE` with a current
successful test, recent MFA and an acknowledged break-glass path, each refusal naming its own reason
and carrying a renderable explanation; editing configuration clears the tested state; an `ERROR` state
still permits break-glass sign-in; disabling never deletes configuration; another organisation's
connection id is byte-identically indistinguishable from an absent one; and no response, log line or
audit event contains a client secret, signing key, assertion or ID token.

## Non-goals

- **No SSO implementation.** The state machine, configuration validation, connectors, test login,
  enforcement guard, break-glass invariant, JIT rules and disable sequence are
  `packages/auth/src/sso/**` (`AUTC-03`). This area calls them.
- **No session issuance policy.** Creating a session after a successful production callback uses
  `AUTC-01`'s `issueSession` / `rotateSessionId(..., 'login')`; this area writes no session logic.
- **No user provisioning rules.** `AUTC-03.resolveJitProvisioning` decides; `AUTC-01.acceptInvitation`
  remains the only non-JIT user-creating path (`IDNT-02`).
- **No permission matrix.** `FND-06` (`00-foundation`).
- **No tables, repositories or field encryption.** `packages/database/**` is `01-app-data` (plan
  **A3**); configuration secrets are written only through `DATA-03`'s field-encryption port that
  `AUTC-03` injects.
- **No MFA implementation.** The recent-MFA condition is `AUTC-02`'s `assertRecentAuth`, injected into
  `canEnforce`'s `EnforcementContext` by this area — this ticket has no `AUTC-02` edge and must not
  import `<auth-pkg>/mfa` directly; it obtains the assertion through the session facts the admission
  chain (`RUNT-02`) already resolved.
- **No screens.** `/settings/sso` is `IDNT-09` (PRD §31.2).
- **No admission stages, no error catalogue, no OpenAPI.** `RUNT-02`, `RUNT-01`, `FND-04`.
- **No cross-boundary suites.** `tests/**` is `23-assurance`; this ticket carries its own co-located
  assertions (plan §9 **R8**).

## File-scope (write-owns)

- `apps/api/src/routes/sso/**` — the route area, including its A1 entry file `index.ts`.
- `apps/api/test/routes/sso/**` — this ticket's own unit/integration tests (plan §1.1).
- `apps/api/package.json` — **append-only** if a dependency is required (plan §1.1).

Does not touch:

- `apps/api/src/routes/auth/**` — `IDNT-01`, including `_lib/**`, which this ticket **imports** but
  never writes.
- `apps/api/src/routes/{invitations,members,mfa,service-accounts,widget-sessions}/**` — `IDNT-02`,
  `IDNT-03`, `IDNT-04`, `IDNT-06`, `IDNT-07`.
- `apps/api/src/routes/{health,system-status}/**` — `RUNT-08`; every other area belongs to `14`, `15`,
  `16`, `17`, `19`, `20` or `22` (plan §4).
- `apps/api/src/{server.ts,app.ts,bootstrap,errors,plugins,middleware,sse}/**` — `RUNT-01`, `RUNT-02`,
  `RUNT-03`.
- `packages/auth/**` — `02-auth-core`; `packages/database/**` — `01-app-data`; `packages/domain/**`,
  `packages/contracts/**`, `schemas/openapi/**` — `00-foundation`; `packages/ui/**`,
  `packages/observability/**` — `RUNT-06`, `RUNT-07`.
- `apps/web/**`, `apps/worker/**`, `apps/admin/**`, `apps/widget/**`, `infra/**`, `tests/**`, root
  manifests, lockfiles, `.github/workflows/**`.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, no in-flight
ticket), so nothing has previously written these paths and nothing contends for them. Under the A1
autoload convention (`RUNT-01` contract §1/§6) `apps/api/src/routes/sso/` is an independent directory
whose addition produces zero diff elsewhere, so it is disjoint from the six sibling identity areas and
from every product module's route areas — there is no shared route index. This ticket sits in wave 2
with `IDNT-02`, `IDNT-03`, `IDNT-04` and `IDNT-06`, all runnable as concurrent lanes (plan §7: 9
tickets, 3 minimum waves, 5 useful lanes); each writes a different `routes/<area>/` directory.
`apps/api/package.json` is append-only shared (plan §1.1).

## Deliverables

1. **`apps/api/src/routes/sso/index.ts`** — the A1 entry file: default-exported `FastifyPluginAsync`
   and `export const area = { admission: 'public' } satisfies RouteAreaConfig`. The area default is
   `public` because login initiation and both callbacks must be reachable by a signed-out user;
   **every configuration route declares `admission: 'tenant'`** using `IDNT-01`'s `SENSITIVE_ROUTE`
   preset (recent auth required — PRD §21.1, §38.3 step 5). A route without an explicit profile fails
   the suite.
2. **`POST /v1/sso/connections`** (`SENSITIVE_ROUTE`) — create a `DRAFT` (PRD §38.3 step 1). Request
   `{ protocol: 'SAML' | 'OIDC', configuration }`; `AUTC-03.validateSsoConfig` decides validity and
   `AUTC-03` writes the configuration through the injected encryption port (step 2). Response `201`:
   the **redacted** connection (deliverable 4's shape) plus an `ETag`. Permission from
   `FND-06.evaluate()` for *"Configure SSO/enforce MFA"*.
3. **`GET /v1/sso/connections`** and **`GET /v1/sso/connections/{connection_id}`** (`TENANT_ROUTE`) —
   list and read, tenant-scoped, with `page_size` 1–100 default 25 and an opaque `next_cursor`
   (PRD §34.1). `GET` by id sets the `ETag` header from `row_version`. A connection belonging to
   another organisation and an absent id return `404 RESOURCE_NOT_FOUND` from the **same code path**
   (PRD §16.5, §34.9).
4. **The redacted connection shape** — `{ id, protocol, state, tested_at, tested_config_current,
   enforced_at, jit_enabled, jit_default_role, verified_domains, configuration_public: { issuer,
   entity_id_or_client_id, acs_or_redirect_uri, audience, claim_mapping, signing_key_fingerprint,
   jwks_uri }, enforcement_readiness: { can_enforce, reasons: [...] }, created_at, updated_at }`.
   **No client secret, private key, signing certificate body or raw metadata document is ever
   returned** (PRD §32.8 *"Secrets are never redisplayed"*; PRD §21.1). `tested_config_current` is
   `tested_at != null && testedConfigHash === hashSsoConfig(currentConfig)` — the `02-auth-core` **D6**
   property surfaced for the UI. `enforcement_readiness` is `canEnforce(...)` evaluated in read-only
   form so `IDNT-09` can show *"the exact test requirement and break-glass explanation"* **before** the
   user attempts enforcement (`UAT-AUTH-04`).
5. **`PATCH /v1/sso/connections/{connection_id}`** (`SENSITIVE_ROUTE`, `If-Match` **required**) —
   `AUTC-03.updateSsoConfig`, which clears `tested_at`/`tested_config_hash` and returns
   `ACTIVE`/`TESTING` to `DRAFT` (PRD §35.4 *"successful **current** test"*; `02-auth-core` **D6**).
   The response body states that the tested state was cleared so the screen can say so. Stale
   `row_version` → `409 CONCURRENT_MODIFICATION`.
6. **`POST /v1/sso/connections/{connection_id}/test/start`** (`SENSITIVE_ROUTE`) — begins the PRD §38.3
   step-3 test login: transitions `DRAFT → TESTING` through `applyTransition`, mints a single-use,
   expiring test correlation state and returns the IdP redirect target. The state is bound to the
   connection and to the initiating actor.
7. **`POST /v1/sso/connections/{connection_id}/test/callback`** (`PUBLIC_ROUTE`) — the **non-enforced**
   callback. Delegates to `AUTC-03.runSsoTest`, which *"never creates a session, never provisions a
   user and never enforces"*. Response `200`: the structured mapping report `{ subject,
   email_normalized, domain, mapped_claims, mapped_role, verified_domain, result }` — enough for
   `IDNT-09` to show what the IdP returned. A verification failure returns `400 INVALID_REQUEST` with
   `details.reason` carrying the connector's own reason (unsigned, wrong audience, wrong issuer,
   expired, clock-skewed, replayed) so the operator can fix the right thing. **This route must not be
   able to create a session** — asserted.
8. **`POST /v1/sso/connections/{connection_id}/activate`** and
   **`POST /v1/sso/connections/{connection_id}/enforce`** (`SENSITIVE_ROUTE`, `If-Match` **required**) —
   `applyTransition(..., 'ACTIVE')` and `AUTC-03.enforce`. The `EnforcementContext` is composed here
   from: the injected `assertRecentAuth` closure over the session facts `RUNT-02` resolved,
   `breakGlassAcknowledged` (a required request field — PRD §38.3 step 5 *"acknowledgement of the
   break-glass path"*), and `breakGlassPathsAvailable` from `AUTC-03.assertBreakGlassAvailable`.
   Refusal mapping, exhaustive over `canEnforce`'s reasons:
   - `RECENT_AUTH_REQUIRED` → **`403 RECENT_AUTH_REQUIRED`** (PRD §34.9 row);
   - `TEST_REQUIRED`, `STALE_TEST`, `NOT_ACTIVE`, `BREAK_GLASS_NOT_ACKNOWLEDGED`, `NO_BREAK_GLASS_PATH`
     → `400 INVALID_REQUEST` with `details.reason` set to that value and a plain-language `message`
     `IDNT-09` renders verbatim (sub-PRD **D12**; `UAT-AUTH-04`).
   Every refusal body additionally carries `enforcement_readiness` so the screen can list **all**
   outstanding conditions, not just the first.
9. **`POST /v1/sso/connections/{connection_id}/disable`** (`SENSITIVE_ROUTE`, `If-Match` **required**) —
   `AUTC-03.disableSso({ connectionId, revokeSessions })`. Configuration is **not** deleted (PRD §38.3
   step 7 and step 6); the response shows the connection still present in `DISABLED`. The ordering
   `AUTC-03` fixes — break-glass check → state write → session revocation → audit event — is not
   re-implemented here.
10. **`POST /v1/sso/login/start`** (`PUBLIC_ROUTE`, rate-limited) — production login initiation
    (sub-PRD **D10**). Request `{ organization_slug }` **or** `{ email }`; the server resolves the
    connection and returns the IdP redirect target plus a single-use expiring correlation state. The
    response must be **identical in shape and timing class** whether or not a connection exists, so the
    endpoint is not an organisation-enumeration oracle: when none exists it returns the same envelope
    with a `sign_in_methods` list that omits SSO. It **never** discloses the organisation's name,
    member list or connection state.
11. **`POST /v1/sso/login/callback`** (`PUBLIC_ROUTE`) — production callback. Ordering, fixed:
    verify the correlation state (single-use, expiring) → `connectors/*.verifyAssertion` →
    `AUTC-03.resolveJitProvisioning` (verified domain and controlled default role only; never Owner) or
    resolve an existing membership → `AUTC-01.issueSession` → `rotateSessionId(..., 'login')` → set the
    session cookie → activate the organisation → emit audit → respond with `IDNT-01`'s session-context
    shape. A connection in `ERROR` or `DISABLED` refuses **new SSO logins** but the refusal body must
    state that the break-glass path remains available (PRD §38.3 step 6) — asserted.
12. **Break-glass is never blocked.** This area adds **no** guard that could prevent a break-glass Owner
    from signing in through `IDNT-01`'s ordinary sign-in route, in **any** connection state including
    `ACTIVE` with enforcement. Enforcement affects SSO login availability, not the existence of the
    break-glass path (PRD §16.3, §38.3 step 6). A test asserts sign-in succeeds for the break-glass
    Owner in every one of the five states.
13. **Rate limits.** `login/start`, both callbacks and `test/callback` declare a rate-limit ledger
    through `RUNT-02`'s configuration keyed by IP (no organisation context exists yet). PRD §38.5 gives
    no SSO number, so the committed safe default lives in config, not in code (PRD §39.6 layer 1).
14. **Audit events** (`IDNT-01`'s `emitIdentityAudit`) for create, update, test start, test result,
    activate, enforce (success and each refusal reason), disable and every login failure, carrying
    `{ action, actorId, organizationId, resourceType: 'SSO_CONNECTION', resourceId, result, requestId }`
    and **no** secret, assertion, ID token, certificate or claim body (PRD §22, §35.6). Break-glass use
    additionally emits `AUTC-03.recordBreakGlassUse`'s highest-severity event (PRD §16.3 *"MUST generate
    a high-priority security event when used"*).
15. **`apps/api/test/routes/sso/**`** — this ticket's suites, built on `IDNT-01`'s exported
    `apps/api/test/routes/auth/identity-route-harness.ts` and replaying `AUTC-03`'s committed synthetic
    IdP fixtures from `packages/auth/test/sso/fixtures/**` (valid, unsigned, wrong-signature,
    wrong-audience, wrong-issuer, expired, clock-skewed and replayed, plus a metadata document per
    protocol).

## Acceptance checklist (classified)

- [ ] `[machine]` The area registers as `apps/api/src/routes/sso/` and serves under `/v1/sso` with
      **zero** diff to any tracked file outside that directory — asserted with `RUNT-01`'s
      `apps/api/test/route-area-conformance.ts` (plan **A1**)
- [ ] `[machine]` Every route declares an explicit admission profile; every configuration route is
      `tenant` + recent-auth and every login/callback route is `public` — asserted against a literal
      route/profile table (PRD §38.3 step 5, §21.1)
- [ ] `[machine]` **`AUTH-005` / `UAT-AUTH-04`:** `enforce` is refused when there is no test
      (`TEST_REQUIRED`), when configuration changed after the test (`STALE_TEST`), when the connection
      is not `ACTIVE` (`NOT_ACTIVE`), when break-glass was not acknowledged
      (`BREAK_GLASS_NOT_ACKNOWLEDGED`), when no break-glass path exists (`NO_BREAK_GLASS_PATH`) and when
      recent auth is stale (`403 RECENT_AUTH_REQUIRED`) — each with its own reason, and every refusal
      body carries `enforcement_readiness` listing **all** outstanding conditions (PRD §38.3 step 5,
      §16.3; `AUTH-005`)
- [ ] `[machine]` Editing configuration clears `tested_at` and returns the connection to `DRAFT`, so a
      subsequent `enforce` is refused with `STALE_TEST`/`TEST_REQUIRED` (PRD §35.4 *"successful current
      test"*; `02-auth-core` **D6**)
- [ ] `[machine]` The **test** callback creates no session, provisions no user and changes no
      enforcement state — asserted by inspecting the session store and user table before and after
      (PRD §38.3 steps 3–4; `AUTC-03` deliverable 5)
- [ ] `[machine]` **Break-glass:** the break-glass Owner can sign in through `IDNT-01`'s ordinary route
      in all five connection states, including `ACTIVE` with enforcement and `ERROR`; a transition that
      would leave zero break-glass paths is refused with `NO_BREAK_GLASS_PATH`; break-glass use emits
      the highest-severity audit event (PRD §16.3, §38.3 step 6; `AUTH-005` *"Failed IdP test cannot
      lock out the organisation"*)
- [ ] `[machine]` `disable` leaves the configuration row present in `DISABLED` and revokes sessions only
      when requested (PRD §38.3 steps 6–7)
- [ ] `[machine]` **No secret leaks:** no response, log line or audit event contains a client secret,
      private key, certificate body, raw metadata document, SAML assertion or ID token — asserted with a
      `secret-canary-<uuid>` planted in the configuration and in a fixture assertion (PRD §21.1, §22,
      §32.8)
- [ ] `[machine]` `POST`/`PATCH` transitions require `If-Match`; a missing header is
      `400 INVALID_REQUEST` and a stale `row_version` is `409 CONCURRENT_MODIFICATION`
      (PRD §34.1, §16.2, §34.9)
- [ ] `[machine]` An illegal transition (any pair absent from `SSO_TRANSITIONS`) is refused with
      `details.reason === 'ILLEGAL_TRANSITION'` and changes no state (`AUTC-03` deliverable 2)
- [ ] `[machine]` `POST /v1/sso/login/start` returns the same envelope and timing class for an
      organisation with SSO, one without, and one that does not exist, and discloses no organisation
      name or membership (PRD §21.1)
- [ ] `[machine]` JIT provisioning is refused for an unverified domain, when disabled, and for an Owner
      default role, using `AUTC-03.resolveJitProvisioning` with no local rule (PRD §38.3)
- [ ] `[machine]` **Tenant isolation (`SEC-001`, PRD §21.2):** reading or transitioning another
      organisation's `connection_id` and an absent id return **byte-identical**
      `404 RESOURCE_NOT_FOUND` bodies apart from `request_id`; the list returns only the calling
      organisation's rows (PRD §16.5, §34.9)
- [ ] `[machine]` **Tenant isolation (`SEC-001`):** an architecture assertion over
      `apps/api/src/routes/sso/**` finds no unscoped `packages/database` import — copy the construction
      pattern from `apps/api/test/admission/architecture.test.ts` (`RUNT-02` deliverable 13)
- [ ] `[machine]` An organisation identifier supplied in body, query or header on a tenant route is
      rejected `400 INVALID_REQUEST` naming the field (PRD §34.1, §16.1)
- [ ] `[machine]` This area contains no state-transition table, no signature verification, no clock-skew
      constant and no break-glass rule of its own — source scan asserting every decision comes from
      `packages/auth/sso` (PRD §45.2; plan §9 **R5**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `AUTH-005`, `SEC-001`, `UAT-AUTH-04`, the
      tenant/security impact, the rollback path and the **known gaps** for sub-PRD **OQ7** (no
      break-glass provisioning surface), **OQ5** (login/callback placement) and **OQ3** (durable audit
      persistence)
- [ ] `[fixture]` `AUTC-03`'s committed synthetic IdP fixtures under `packages/auth/test/sso/fixtures/**`
      — valid, unsigned, wrong-signature, wrong-audience, wrong-issuer, expired, clock-skewed and
      replayed, per protocol — replay through the test and production callbacks and produce the expected
      status and reason for each (replay of recorded data; synthetic keys only, PRD §45.1 item 6)
- [ ] `[human]` `UAT-AUTH-04` rehearsed manually against a running stack: an Owner attempts to enable
      SSO before a successful test and is blocked with the exact test requirement and the break-glass
      explanation (PRD §41.2). The screen half is `IDNT-09`, so run after `IDNT-09` merges — **not
      required to merge this ticket**
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)

## Test plan

Reviewer steps, offline, no network and no real IdP. Database is a temp-file `app.sqlite` migrated with
`DATA-01`'s runner and seeded through `DATA-04`'s `packages/database/test/tenancy/factories.ts`;
`packages/auth` ports use the in-memory fakes from `packages/auth/test/support/**` and
`packages/auth/test/sso/fixtures/**` with a settable `FakeClock`; the harness is `IDNT-01`'s exported
`apps/api/test/routes/auth/identity-route-harness.ts`.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/api`. Suites live under `apps/api/test/routes/sso/`.
3. **`area-registration.test.ts`** — reuse `apps/api/test/route-area-conformance.ts` (`RUNT-01`); assert
   the prefix `/v1/sso` and compare the registered route/profile pairs to a literal table.
4. **`lifecycle.test.ts`** — walk PRD §38.3 steps 1–7 end to end: create `DRAFT`; `test/start` →
   `TESTING`; `test/callback` with the valid fixture → `tested_at` recorded; `activate` → `ACTIVE`;
   `enforce` with acknowledgement and fresh recent auth → `enforced_at`; `disable` → `DISABLED` with
   the row still present. Assert each transition's `ETag` changed.
5. **`enforcement-refusals.test.ts`** — one case per `canEnforce` reason; assert status, `details.reason`
   and that `enforcement_readiness` lists every outstanding condition, not just the first. Include the
   `STALE_TEST` case produced by editing configuration after a successful test.
6. **`test-callback-isolation.test.ts`** — snapshot the session store and user table, run the test
   callback with the valid fixture, and assert both are unchanged.
7. **`connectors.test.ts`** (`[fixture]`) — table-driven over every `packages/auth/test/sso/fixtures/**`
   case for both protocols through the production callback; assert the mapped status and reason.
8. **`break-glass.test.ts`** — for each of the five states, sign in as the break-glass Owner through
   `IDNT-01`'s route and assert success; attempt a transition that would leave zero break-glass paths
   and assert `NO_BREAK_GLASS_PATH`; assert the highest-severity audit event on break-glass use.
9. **`login-start-oracle.test.ts`** — organisation with SSO, without SSO, and non-existent: assert
   byte-identical envelopes (apart from the `sign_in_methods` list, which must not encode existence) and
   one timing class.
10. **`tenant-isolation.test.ts`** — organisations A and B; as an A Owner, read and transition B's
    connection and a syntactically valid absent id; byte-compare the two 404 bodies after masking
    `request_id`.
11. **`architecture.test.ts`** — source scan for unscoped `packages/database` imports, local transition
    tables, signature code and skew constants; copy the pattern from
    `apps/api/test/admission/architecture.test.ts` (`RUNT-02`).
12. **`leak.test.ts`** — plant `secret-canary-<uuid>` in the client secret, the certificate body and one
    fixture assertion; run the whole area's request matrix; scan every response body, captured log line
    and `RecordingAuditSink` event; assert absence.
13. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether a
    concurrent `PATCH` and `enforce` can let enforcement ride on a test that was just invalidated;
    whether the correlation state is genuinely single-use and bound to the connection; whether an
    `ERROR` state can be reached in a way that blocks break-glass; whether the production callback can
    provision an Owner via JIT; whether a redacted read can be coaxed into returning key material.
14. The `[human]` row is run against a locally started stack (`pnpm stack:up`, `RUNT-09`) after
    `IDNT-09` merges, and recorded in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies anything in this ticket, update **this ticket file**
first (version note + changelog line in the PR), re-publish with
`.claude/scripts/publish-tickets.mjs --sync`, then change code. Silent divergence is an incomplete
ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **SSO login initiation and the production callback are judged to belong in `routes/auth/**`**
  (sub-PRD **D10**/**OQ5**) → that changes the module's `blocked_by` graph, because `IDNT-01` would then
  need an `AUTC-03` edge. Write it into `docs/prd/breakdown-plan.md` §5.14/§6.2 and
  `docs/prd/13-identity-surface/README.md` **first**, `--sync` both tickets, and only then move code.
  Never write inside `apps/api/src/routes/auth/**` from here.
- **`AUTC-03`'s `EnforcementContext` cannot be composed without importing `<auth-pkg>/mfa`** (this
  ticket has no `AUTC-02` edge) → either obtain the assertion result from the session facts `RUNT-02`
  already resolved, or add the `AUTC-02` edge in `docs/prd/breakdown-plan.md` §5.14/§6.2 **first**. Do
  not re-derive recent auth locally — `02-auth-core` **D5** makes `assertRecentAuth` the only such
  decision in the codebase.
- **A `canEnforce` reason has no sensible PRD §34.9 mapping** → the catalogue is closed (sub-PRD
  **D12**). Use `400 INVALID_REQUEST` + `details.reason`, except `RECENT_AUTH_REQUIRED`, which has its
  own row. If genuinely impossible, raise it in `docs/prd/13-identity-surface/README.md` §Open questions
  with the **Founder** as owner (PRD §45.5).
- **No break-glass Owner path can exist because nothing provisions one** (sub-PRD **OQ7**) → do **not**
  relax `assertBreakGlassAvailable` and do not add a provisioning route here. Record it in
  `docs/prd/13-identity-surface/README.md` **OQ7** with the **Founder** as owner, add the ticket to
  `docs/prd/breakdown-plan.md` §5.14, and carry the gap on the PR. Fail-closed is the correct behaviour.
- **`AUTC-03` cannot express a needed connector behaviour** (for example IdP-initiated SAML) → the fix
  belongs in `02-auth-core`. Add a ticket there and add the edge in `docs/prd/breakdown-plan.md`
  §5.14/§6.2. Never verify a signature in `apps/api` (PRD §45.2; plan §9 **R5**).
- **`FND-04`'s OpenAPI does not describe these paths** (sub-PRD **OQ8**) → raise a `00-foundation`
  ticket and add the edge in `docs/prd/breakdown-plan.md`. Never edit `schemas/openapi/**`.
- **`IDNT-01`'s `_lib` toolkit is missing something this area needs** → amend `IDNT-01`'s deliverables
  and this ticket together in one docs PR and `--sync` both.

**3. Escalation.** *"SSO cannot be enforced before a successful test"* and *"A tightly controlled
MFA-protected Owner break-glass account MUST remain available"* (PRD §16.3) are release requirements
with MUST force, and `AUTH-005`'s evidence is *"Failed IdP test cannot lock out the organisation"*. If
the enforcement guard or the break-glass invariant is outright falsified, that overturns a team
decision recorded in `02-auth-core`'s sub-PRD **D6**: escalate for re-review before any code lands.
Never weaken either guarantee inside this ticket.
