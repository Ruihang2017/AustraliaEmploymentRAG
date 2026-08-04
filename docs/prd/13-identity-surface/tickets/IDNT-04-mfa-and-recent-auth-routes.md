---
id: IDNT-04
title: MFA and recent-auth routes
module: 13-identity-surface
lane: 13-identity-surface
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [IDNT-01, AUTC-02]
blocks: [IDNT-08]
---

# IDNT-04 — MFA and recent-auth routes

Implements PRD §16.3 (authentication and machine access) and §38.2 (session defaults, MFA methods and
the 10-minute recent-authentication window), carrying requirement `AUTH-004` ("Owner/Admin/internal
admins must enrol MFA"). **No ADR — the decision is already made in PRD §16.3, §38.2 and §21.1; this is
build ticket 4 of 9 against it.**
Parent sub-PRD: [13-identity-surface README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`IDNT-01` — Auth/session routes and organisation-switch context](IDNT-01-auth-session-routes-and-organisation-switch-context.md);
`AUTC-02` — MFA: TOTP, passkey, recovery codes, recent-auth assertion
([`02-auth-core`](../../02-auth-core/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope, exposing `AUTC-02`'s MFA
primitives over the fixed PRD §34.1/§34.9 wire contract — not a new subsystem decision.

## Background + basis

**The endpoint family is named by the PRD.** PRD §16.3:

> - Session list/revoke and **recent-authentication checks**.
> - **TOTP, passkey and recovery-code lifecycle.**

**The policy numbers and methods are fixed.** PRD §38.2:

> | Sensitive-action recent authentication | **10 minutes** |
> | MFA methods | **TOTP and passkey; single-use hashed recovery codes** |
> | Owner/Admin MFA grace | **Must enrol before protected workspace access after first login** |
>
> Production cookie defaults: … **rotated session identifier after login/MFA/privilege change.**

PRD §21.1: *"**MFA for Owner/Admin/internal admins and recent auth for sensitive operations.**"*

**The requirement and its acceptance evidence.** PRD §30.2:

> | AUTH-004 | Owner/Admin/internal admins must enrol MFA | `/settings/security` | MFA endpoints | App |
> **Protected action fails without MFA and recent auth** |

**The primitives already exist and must not be re-implemented.** `AUTC-02` (`02-auth-core`) exports:

- `enrolTotp({ userId, label }, deps) → { factorDraft, secret, otpauthUri }` — *"the plaintext secret
  and `otpauth://` URI are returned **once** for display and are never persisted in clear"*;
  `confirmTotp({ factorId, code }, now, deps)` — *"enrolment is only complete after one successful
  verification; an unconfirmed factor never satisfies `assertMfaSatisfied`"*;
  `verifyTotp({ factorId, code }, now, deps)` — 30-second step, ±1 step window, constant-time
  comparison and **replay refusal** (`REPLAYED_CODE`).
- `beginPasskeyRegistration` / `finishPasskeyRegistration` / `beginPasskeyAuthentication` /
  `finishPasskeyAuthentication` — challenges are single-use and expiring, *"origin and RP ID are checked
  against the caller-supplied allowlist"*, user verification required for Owner/Admin enrolment, and a
  regressed signature counter *"fails as a cloned-authenticator signal and emits a high-severity
  `AuditSink` event"*.
- `generateRecoveryCodes({ userId, count = 10 }, deps)` → *"returns plaintext codes **once**; only
  hashes are handed to `IdentityPort`"*; `consumeRecoveryCode({ userId, code }, deps)` — single-use
  compare-and-set; `regenerateRecoveryCodes(...)` invalidates every previous code atomically.
- `requiresMfaEnrolment({ role, hasConfirmedFactor, firstLoginCompleted }): boolean` — the PRD §38.2
  grace rule, with role values from `packages/domain` (`FND-06`).
- `assertMfaSatisfied(facts)` and `assertRecentAuth(facts, now, windowSeconds?)` — *"the only
  recent-auth/MFA decisions in the codebase"*, both **pure**, defaulting to
  `SESSION_DEFAULTS.recentAuthWindowSeconds` (600 s, PRD §38.2). *"A caller supplying a `windowSeconds`
  longer than the default is rejected (a longer window is a product change, PRD §45.1 item 5)."*
- `markReauthenticated({ sessionId, method }, now, deps)` — sets `reauthenticatedAt` and then calls
  `AUTC-01`'s `rotateSessionId(sessionId, 'mfa', deps)`. *"Ordering constraint: factor verification
  succeeds → `reauthenticatedAt` is written → session id is rotated → the success result is returned."*

**Enforcement happens in admission, not here.** `RUNT-02` deliverable 4: *"a valid principal that has
not satisfied MFA yields `403 MFA_REQUIRED`; a route declaring `requiresRecentAuth` with a stale
assertion yields `403 RECENT_AUTH_REQUIRED`"*. This area supplies the routes a user visits **to
satisfy** those assertions, and the read that tells `IDNT-08` whether they are satisfied.

**Wire rules.** PRD §16.1 (`/v1`, `request_id` on every response, organisation from authenticated
context). PRD §34.1 (opaque ids, ISO 8601 UTC, pagination bounds, tenant never in a body). PRD §34.9 is
the closed catalogue; reachable here: `400 INVALID_REQUEST`, `401 AUTHENTICATION_REQUIRED`,
`403 MFA_REQUIRED`, `403 RECENT_AUTH_REQUIRED`, `404 RESOURCE_NOT_FOUND`, `429 RATE_LIMITED`,
`500 INTERNAL_ERROR`. **PRD §34 contains no MFA payload example** (§34.2–§34.8 cover other domains);
sub-PRD **D4** makes the binding shapes §34.1 + §34.9 + `AUTC-02`'s exported types + the generated types
from `FND-04`'s OpenAPI. Never edit `schemas/openapi/**` from here.

**Routing and shared toolkit.** `RUNT-01`'s A1 contract makes `apps/api/src/routes/mfa/` an autoloaded
area at `/v1/mfa`; the shared toolkit (`getIdentityContext`, `mapAuthFailure`, `emitIdentityAudit`,
route presets) is `IDNT-01`'s `apps/api/src/routes/auth/_lib/**`, imported read-only (sub-PRD **D3**).

**Accepted caveats carried forward, documented not enforced here:**

- **Internal-admin MFA is not this module's.** PRD §21.1 covers *"internal admins"* too, but
  `/internal/v1` and its separate identity are `22-internal-admin` (`INTL-01`, which is itself
  `blocked_by` `AUTC-02`).
- **The passkey RP ID and allowed origin are configuration, not code.** They come from `RUNT-01`'s
  `ApiConfig` (PRD §39.6 layer order); this area passes them to `AUTC-02` and decides nothing.
- **Hash parameters for recovery codes** are `AUTC-04`'s `CREDENTIAL_HASH_PARAMS` memory-hard set
  (`02-auth-core` **OQ4**); this area never hashes anything.
- **Durable audit persistence** is sub-PRD **OQ3**; events go through `IDNT-01`'s `emitIdentityAudit`.

## Goal

Produce the `apps/api/src/routes/mfa/` route area serving the TOTP, passkey and recovery-code
lifecycle, factor removal, re-authentication and the recent-authentication check under `/v1/mfa`, so
that an Owner/Admin can satisfy the PRD §38.2 enrolment grace and any user can refresh the 10-minute
recent-auth window. Completion is mechanically checkable: a TOTP secret and a recovery-code set are
each returned exactly once and never again; an unconfirmed factor never satisfies MFA; a replayed TOTP
step and a reused recovery code are refused; re-authentication rotates the session identifier; the last
confirmed factor cannot be removed while `requiresMfaEnrolment` is true; another user's factor id is
byte-identically indistinguishable from an absent one; and no response, log line or audit event outside
the single creation responses contains a secret, seed or code.

## Non-goals

- **No MFA implementation.** TOTP, WebAuthn, recovery codes, the enrolment policy, the assertions and
  `markReauthenticated` are `packages/auth/src/mfa/**` (`AUTC-02`). This area calls them and stores
  nothing.
- **No enforcement.** `403 MFA_REQUIRED` / `403 RECENT_AUTH_REQUIRED` on protected routes is `RUNT-02`'s
  admission chain. This area must not add a second enforcement point.
- **No session issuance, cookie policy or organisation switch.** `IDNT-01` / `AUTC-01`.
- **No MFA *policy* configuration** (an organisation-wide "enforce MFA" switch): PRD §38.1's *"Configure
  SSO/enforce MFA"* row is Owner/Admin, and the PRD gives the grace rule in §38.2 as a **role-derived**
  rule that `AUTC-02.requiresMfaEnrolment` already implements. No organisation-level override exists in
  the PRD; do not invent one (PRD §45.1 item 5).
- **No internal-admin identity.** `22-internal-admin` (`INTL-01`).
- **No screens.** `/settings/security` and the sign-in MFA challenge are `IDNT-08` (PRD §31.2).
- **No tables or repositories.** `packages/database/**` is `01-app-data` (plan **A3**); factor rows are
  reached only through `AUTC-02`'s injected `IdentityPort`.
- **No admission stages, no error catalogue, no OpenAPI.** `RUNT-02`, `RUNT-01`, `FND-04`.
- **No cross-boundary suites.** `tests/**` is `23-assurance`; this ticket carries its own co-located
  assertions (plan §9 **R8**).

## File-scope (write-owns)

- `apps/api/src/routes/mfa/**` — the route area, including its A1 entry file `index.ts`.
- `apps/api/test/routes/mfa/**` — this ticket's own unit/integration tests (plan §1.1).
- `apps/api/package.json` — **append-only** if a dependency is required (plan §1.1).

Does not touch:

- `apps/api/src/routes/auth/**` — `IDNT-01`, including `_lib/**`, which this ticket **imports** but
  never writes.
- `apps/api/src/routes/{invitations,members,sso,service-accounts,widget-sessions}/**` — `IDNT-02`,
  `IDNT-03`, `IDNT-05`…`IDNT-07`.
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
autoload convention (`RUNT-01` contract §1/§6) `apps/api/src/routes/mfa/` is an independent directory
whose addition produces zero diff elsewhere, so it is disjoint from the six sibling identity areas and
from every product module's route areas — there is no shared route index. This ticket sits in wave 2
with `IDNT-02`, `IDNT-03`, `IDNT-05` and `IDNT-06`, all runnable as concurrent lanes (plan §7: 9
tickets, 3 minimum waves, 5 useful lanes); each writes a different `routes/<area>/` directory.
`apps/api/package.json` is append-only shared (plan §1.1).

## Deliverables

1. **`apps/api/src/routes/mfa/index.ts`** — the A1 entry file: default-exported `FastifyPluginAsync`
   and `export const area = { admission: 'tenant' } satisfies RouteAreaConfig`. Exception: the routes
   used to **satisfy** an MFA challenge during sign-in must be reachable by a session that is
   authenticated but not yet MFA-satisfied. Declare those with a per-route override
   (`admission: 'tenant'` + an explicit `allowsUnsatisfiedMfa: true` flag consumed by `RUNT-02`
   deliverable 4). If `RUNT-02` offers no such flag, that is a cross-module contract gap — see Feedback
   obligation; do not weaken the area default to `public`.
2. **`GET /v1/mfa/status`** (`TENANT_ROUTE`, reachable with unsatisfied MFA) — the read `IDNT-08` and
   `RUNT-05`'s shell need: `{ enrolment_required, has_confirmed_factor, mfa_satisfied,
   recent_auth_expires_at, factors: [{ id, method, label, created_at, last_used_at, confirmed }],
   recovery_codes_remaining }`. `enrolment_required` is `AUTC-02.requiresMfaEnrolment(...)`;
   `mfa_satisfied` is `assertMfaSatisfied(facts).ok`; `recent_auth_expires_at` is derived from
   `assertRecentAuth`'s window — **no window arithmetic exists in this area** (PRD §38.2). No secret,
   seed, credential id or code appears in the body.
3. **`POST /v1/mfa/totp`** (`SENSITIVE_ROUTE`, reachable with unsatisfied MFA during first enrolment) —
   `AUTC-02.enrolTotp`. Response `201`: `{ factor_id, secret, otpauth_uri, expires_at }`. **This is the
   only response in the product that contains the TOTP secret or `otpauth://` URI** (sub-PRD **D5**;
   PRD §32.8 *"Secrets are never redisplayed"*).
4. **`POST /v1/mfa/totp/{factor_id}/confirm`** (same profile) — `AUTC-02.confirmTotp`. On success the
   factor becomes usable and `markReauthenticated` runs (deliverable 8's ordering). An unconfirmed
   factor never satisfies `assertMfaSatisfied`; an invalid code is `400 INVALID_REQUEST` with
   `details.reason` from the closed set `{ 'INVALID_CODE', 'REPLAYED_CODE', 'FACTOR_UNCONFIRMED',
   'ALREADY_USED' }` (sub-PRD **D12** — PRD §34.9 is closed).
5. **`POST /v1/mfa/totp/verify`** (same profile) — `AUTC-02.verifyTotp` for the sign-in challenge and
   for refreshing recent auth. Replay of an already-consumed step returns `'REPLAYED_CODE'`.
6. **`POST /v1/mfa/passkey/register/begin|finish`** and **`POST /v1/mfa/passkey/authenticate/begin|finish`**
   (same profile) — thin wrappers over `AUTC-02`'s four functions. The RP ID and allowed origin come
   from `ApiConfig` (`RUNT-01`), never from the request (PRD §21.1 *"exact widget origins"* discipline;
   `AUTC-02` deliverable 3). A wrong origin, wrong RP ID, replayed challenge or regressed signature
   counter each returns `400 INVALID_REQUEST` with its own closed `details.reason` and emits the
   high-severity audit event `AUTC-02` specifies.
7. **`POST /v1/mfa/recovery-codes`** (`SENSITIVE_ROUTE`) — `AUTC-02.generateRecoveryCodes` /
   `regenerateRecoveryCodes`. Response `201`: `{ codes: string[], generated_at }`. **Only response in
   the product containing plaintext recovery codes**; regeneration invalidates every previous code
   atomically and the response says how many were invalidated. `POST /v1/mfa/recovery-codes/consume`
   (reachable with unsatisfied MFA) → `AUTC-02.consumeRecoveryCode`; a reused code returns
   `'ALREADY_USED'`.
8. **`POST /v1/mfa/reauthenticate`** (`TENANT_ROUTE`, reachable with unsatisfied MFA) — the single entry
   point that refreshes the PRD §38.2 10-minute window. Fixed ordering, exactly as `AUTC-02`
   deliverable 7 requires: verify the presented factor (TOTP, passkey assertion or recovery code) →
   `markReauthenticated({ sessionId, method }, now, deps)` writes `reauthenticatedAt` →
   `rotateSessionId(sessionId, 'mfa', deps)` → respond. A failure at any step leaves
   `reauthenticatedAt` unchanged and returns `400 INVALID_REQUEST` with a closed reason. Response
   `200`: `{ recent_auth_expires_at, session_rotated: true }`.
9. **`GET /v1/mfa/recent-auth`** (`TENANT_ROUTE`) — PRD §16.3's *"recent-authentication checks"*:
   `{ satisfied, expires_at }` from `assertRecentAuth`. The route accepts **no** `window_seconds`
   parameter; `AUTC-02` rejects a longer window because *"a longer window is a product change"*
   (PRD §45.1 item 5).
10. **`DELETE /v1/mfa/factors/{factor_id}`** (`SENSITIVE_ROUTE`) — removes a factor. Refused with
    `400 INVALID_REQUEST`, `details.reason === 'MFA_ENROLMENT_REQUIRED'`, when removing it would leave
    the user with no confirmed factor while `requiresMfaEnrolment` is true (PRD §38.2 grace row;
    `AUTH-004`). A `factor_id` belonging to another user, and an absent one, return
    `404 RESOURCE_NOT_FOUND` from the **same code path** (PRD §16.5, §34.9). Emits an audit event.
11. **Rate limits.** Every verification route (`totp/verify`, `totp/*/confirm`,
    `passkey/*/finish`, `recovery-codes/consume`, `reauthenticate`) declares a rate-limit ledger
    through `RUNT-02`'s configuration, keyed by user and by IP. PRD §38.5 gives no MFA-specific number,
    so the committed safe default lives in config, not in code (PRD §39.6 layer 1). A `429` carries
    `Retry-After` and the caller's own limit/remaining/reset only (PRD §38.5).
12. **Audit events** (`IDNT-01`'s `emitIdentityAudit`) for enrol, confirm, verify-failure, factor
    removal, recovery-code use and regeneration, carrying `{ action, actorId, organizationId,
    resourceType: 'MFA_FACTOR', resourceId, result, requestId }` and **no** secret, seed, code,
    assertion or challenge (PRD §22, §35.6).
13. **`apps/api/test/routes/mfa/**`** — this ticket's suites, built on `IDNT-01`'s exported
    `apps/api/test/routes/auth/identity-route-harness.ts` and replaying `AUTC-02`'s committed vectors
    from `packages/auth/test/mfa/fixtures/**` (RFC 6238 TOTP vectors; captured WebAuthn ceremonies —
    valid, wrong-origin, wrong-RP-ID, replayed challenge, regressed sign counter).

## Acceptance checklist (classified)

- [ ] `[machine]` The area registers as `apps/api/src/routes/mfa/` and serves under `/v1/mfa` with
      **zero** diff to any tracked file outside that directory — asserted with `RUNT-01`'s
      `apps/api/test/route-area-conformance.ts` (plan **A1**)
- [ ] `[machine]` Every route declares an explicit admission profile, and exactly the routes needed to
      satisfy a challenge are reachable with unsatisfied MFA — asserted against a literal route/profile
      table (`RUNT-02` deliverable 4)
- [ ] `[machine]` The TOTP secret, the `otpauth://` URI and the recovery codes each appear in exactly
      one response and are absent from every other response, every log line and every audit event —
      asserted with canary values (PRD §32.8, §22; sub-PRD **D5**)
- [ ] `[machine]` An **unconfirmed** TOTP factor never satisfies `assertMfaSatisfied`; confirming it
      makes it satisfy (PRD §38.2; `AUTC-02` deliverable 2)
- [ ] `[machine]` A replayed TOTP step returns `'REPLAYED_CODE'` and a reused recovery code returns
      `'ALREADY_USED'`; two concurrent redemptions of one recovery code yield exactly one success
      (`AUTC-02` deliverables 2 and 4)
- [ ] `[machine]` `POST /v1/mfa/reauthenticate` writes `reauthenticatedAt` **and then** rotates the
      session identifier with reason `'mfa'`, in that order; a verification failure leaves
      `reauthenticatedAt` unchanged and does not rotate (PRD §38.2; `AUTC-02` deliverable 7)
- [ ] `[machine]` `GET /v1/mfa/recent-auth` reports `satisfied: false` once the PRD §38.2 10-minute
      window has passed on a fake clock, and the route rejects any attempt to widen the window
      (PRD §38.2; PRD §45.1 item 5)
- [ ] `[machine]` **`AUTH-004`:** removing the last confirmed factor is refused with
      `details.reason === 'MFA_ENROLMENT_REQUIRED'` for an Owner and an Admin, and permitted for a role
      `requiresMfaEnrolment` returns false for (PRD §38.2, §21.1; `AUTH-004` *"Protected action fails
      without MFA and recent auth"*)
- [ ] `[machine]` A passkey ceremony with a wrong origin, wrong RP ID, replayed challenge or regressed
      signature counter is refused, each with its own reason, replaying `AUTC-02`'s recorded fixtures
      (PRD §21.1)
- [ ] `[machine]` **Tenant isolation (`SEC-001`, PRD §21.2):** another user's `factor_id` and an absent
      `factor_id` return **byte-identical** `404 RESOURCE_NOT_FOUND` bodies apart from `request_id`;
      `GET /v1/mfa/status` returns only the calling user's factors (PRD §16.5, §34.9)
- [ ] `[machine]` **Tenant isolation (`SEC-001`):** an architecture assertion over
      `apps/api/src/routes/mfa/**` finds no unscoped `packages/database` import — copy the construction
      pattern from `apps/api/test/admission/architecture.test.ts` (`RUNT-02` deliverable 13)
- [ ] `[machine]` An organisation identifier supplied in body, query or header is rejected
      `400 INVALID_REQUEST` naming the field (PRD §34.1, §16.1)
- [ ] `[machine]` This area contains no TOTP step arithmetic, no window constant, no hashing and no
      WebAuthn verification of its own — source scan asserting every decision comes from
      `packages/auth/mfa` (PRD §45.2; plan §9 **R5**)
- [ ] `[machine]` Verification routes are rate-limited; exhausting the ledger returns `429 RATE_LIMITED`
      with `Retry-After` and the caller's own limit/remaining/reset only (PRD §38.5)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `AUTH-004`, `SEC-001`, the tenant/security
      impact, the rollback path and the **known gap** for sub-PRD **OQ3** (durable audit persistence)
- [ ] `[fixture]` `AUTC-02`'s committed vectors under `packages/auth/test/mfa/fixtures/**` — the RFC
      6238 TOTP vectors and the captured WebAuthn ceremonies (valid, wrong-origin, wrong-RP-ID,
      replayed challenge, regressed sign counter) — replay through these routes and produce the
      expected status and reason for each (replay of recorded data; the fixtures are synthetic,
      PRD §45.1 item 6)
- [ ] `[human]` `AUTH-004` rehearsed manually against a running stack: a newly invited Owner is blocked
      from a protected workspace action until a factor is enrolled and confirmed, and a sensitive action
      after 10 minutes of inactivity demands re-authentication naming the exact effect and recovery
      (PRD §41.1, §38.2, §43.4). The screen half is `IDNT-08`, so run after `IDNT-08` merges — **not
      required to merge this ticket**
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)

## Test plan

Reviewer steps, offline, no network and no authenticator hardware. Database is a temp-file
`app.sqlite` migrated with `DATA-01`'s runner and seeded through `DATA-04`'s
`packages/database/test/tenancy/factories.ts`; `packages/auth` ports use the in-memory fakes from
`packages/auth/test/support/**` with a settable `FakeClock`; the harness is `IDNT-01`'s exported
`apps/api/test/routes/auth/identity-route-harness.ts`.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/api`. Suites live under `apps/api/test/routes/mfa/`.
3. **`area-registration.test.ts`** — reuse `apps/api/test/route-area-conformance.ts` (`RUNT-01`); assert
   the prefix `/v1/mfa` and compare the registered route/profile pairs to a literal table.
4. **`totp.test.ts`** (`[fixture]`) — replay the RFC 6238 vectors from
   `packages/auth/test/mfa/fixtures/**` through `enrol → confirm → verify`; assert the ±1-step window,
   a rejected out-of-window code and `REPLAYED_CODE` on a repeated step. Assert the secret appears only
   in the enrolment response.
5. **`passkey.test.ts`** (`[fixture]`) — replay each recorded ceremony (valid, wrong-origin,
   wrong-RP-ID, replayed challenge, regressed counter); assert status, reason and — for the regressed
   counter — that a high-severity audit event was emitted.
6. **`recovery-codes.test.ts`** — generate 10; assert plaintext appears once; consume one; consume it
   again (expect `ALREADY_USED`); fire two concurrent consumptions of one code and assert exactly one
   success; regenerate and assert every previous code fails.
7. **`reauthenticate.test.ts`** — assert the ordering with spies: `reauthenticatedAt` written **before**
   `rotateSessionId('mfa')`; then a failing verification and assert neither happened.
8. **`recent-auth.test.ts`** — advance `FakeClock` to 9 m 59 s (satisfied) and 10 m 01 s (not
   satisfied); attempt to pass a longer `window_seconds` and assert rejection.
9. **`enrolment-gate.test.ts`** — for each of the five PRD §38.1 roles, assert `enrolment_required`
   matches `AUTC-02.requiresMfaEnrolment` and that deleting the last confirmed factor is refused where
   it is true.
10. **`tenant-isolation.test.ts`** — two users in two organisations; request the other's `factor_id`
    and an absent `factor_id`; byte-compare the 404 bodies after masking `request_id`.
11. **`architecture.test.ts`** — source scan for unscoped `packages/database` imports and for local
    TOTP/window/hash logic; copy the pattern from `apps/api/test/admission/architecture.test.ts`
    (`RUNT-02`).
12. **`leak.test.ts`** — force the fake `Random` to produce `secret-canary-<uuid>` for the TOTP secret,
    the recovery codes and the passkey challenge; run the whole area's request matrix; scan every
    response body except the two creation responses, every captured log line and every
    `RecordingAuditSink` event; assert absence.
13. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether a route
    reachable with unsatisfied MFA can be used to reach anything beyond the challenge; whether
    concurrent `confirm` and `delete` on the same factor can leave a user with zero confirmed factors
    while enrolment is required; whether the rate-limit key can be evaded by rotating IP; whether a
    failed re-authentication can still rotate the session.
14. The `[human]` row is run against a locally started stack (`pnpm stack:up`, `RUNT-09`) after
    `IDNT-08` merges, and recorded in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies anything in this ticket, update **this ticket file**
first (version note + changelog line in the PR), re-publish with
`.claude/scripts/publish-tickets.mjs --sync`, then change code. Silent divergence is an incomplete
ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`RUNT-02` has no way to mark a route reachable by an authenticated-but-not-MFA-satisfied session**
  (deliverable 1) → without it the MFA challenge is unreachable, which is a deadlock. Amend
  `RUNT-02`'s deliverable 4 and this ticket's deliverable 1 together in one docs PR, `--sync` both, and
  only then code. **Never** write `apps/api/src/{plugins,middleware}/**` from here, and never make the
  area `public` as a workaround — that would remove authentication from the challenge.
- **`AUTC-02`'s function signatures do not fit an HTTP route** (for example a ceremony needs state the
  route cannot carry) → the fix belongs in `02-auth-core`. Add a ticket there and make this one
  `blocked_by` it in `docs/prd/breakdown-plan.md` §5.14/§6.2 **first**. Do not implement WebAuthn or
  TOTP verification in `apps/api` (PRD §45.2; plan §9 **R5**).
- **A required failure has no PRD §34.9 code** → the catalogue is closed (sub-PRD **D12**). Use
  `400 INVALID_REQUEST` + `details.reason`. If genuinely impossible, raise it in
  `docs/prd/13-identity-surface/README.md` §Open questions with the **Founder** as owner (PRD §45.5).
- **The PRD §38.2 10-minute window or the Owner/Admin grace rule proves unworkable** → those are
  **product limits**, not tuning constants (PRD §45.1 item 5: *"do not silently turn an initial default
  into a new product rule"*). Escalate via `docs/prd/13-identity-surface/README.md` §Open questions with
  the **Founder** as owner; ship the PRD value behind configuration meanwhile.
- **An organisation-level "enforce MFA" switch turns out to be required** (PRD §38.1 names the action
  but §38.2 gives only the role-derived grace) → that is a **product change** (PRD §45.5). Raise it in
  `docs/prd/13-identity-surface/README.md` with the **Founder** as owner; do not invent the policy
  object here.
- **`FND-04`'s OpenAPI does not describe these paths** (sub-PRD **OQ8**) → raise a `00-foundation`
  ticket and add the edge in `docs/prd/breakdown-plan.md`. Never edit `schemas/openapi/**`.
- **`IDNT-01`'s `_lib` toolkit is missing something this area needs** → amend `IDNT-01`'s deliverables
  and this ticket together in one docs PR and `--sync` both. Never write inside
  `apps/api/src/routes/auth/**`.

**3. Escalation.** *"MFA for Owner/Admin/internal admins and recent auth for sensitive operations"*
(PRD §21.1) is a release requirement with MUST force, and `AUTH-004`'s evidence is *"Protected action
fails without MFA and recent auth"*. If the enrolment grace, the single-assertion rule or the
10-minute window is outright falsified, that overturns a team decision recorded in `02-auth-core`'s
sub-PRD **D5**: escalate for re-review before any code lands. Never add a second recent-auth decision
inside this ticket.
