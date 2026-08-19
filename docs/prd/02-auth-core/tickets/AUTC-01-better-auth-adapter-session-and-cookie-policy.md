---
id: AUTC-01
title: Better Auth adapter, session and cookie policy
module: 02-auth-core
lane: 02-auth-core
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [DATA-04, FND-32]
blocks: [AUTC-02, AUTC-03, AUTC-04, RUNT-02]
---

# AUTC-01 — Better Auth adapter, session and cookie policy

Implements **PRD §18.2, §38.2, §21.1 — AUTH-001** (epic `E05-AUTH`).
No ADR — the decision is already made in PRD §18.2 (*"Authentication | Self-hosted Better Auth"*)
and PRD §38.2 (the session-defaults table); this is build ticket **1 of 5** against it.
Parent sub-PRD: [02-auth-core README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: **DATA-04 — Tenancy and identity tables/repositories** (module `01-app-data`,
`docs/prd/01-app-data/tickets/`) — it creates every PRD §35.4 table this ticket reads and writes.
**Why `builder`:** a bounded change inside one module's declared file-scope (`packages/auth/src/core/**`)
against a fixed contract — PRD §38.2 already fixes every default; nothing here is a new subsystem decision.

## Background + basis

**The repository has no code yet.** This is the first decomposition of `docs/PRD.md`; at authoring
time the repo contains only `docs/`, `templates/`, `tools/`, `CLAUDE.md` and `README.md`. By the time
this ticket runs, its ancestors have landed: `FND-01` (workspace skeleton, including an *empty*
`packages/auth` member with `package.json` + `tsconfig.json`), `FND-03` (canonical enums and IDs),
`FND-06` (role/permission matrix in `packages/domain/src/access/**`), `DATA-01`/`DATA-02`/`DATA-03`
(migrations, `TenantContext` repositories, field encryption) and `DATA-04` (the PRD §35.4 tenancy and
identity tables). That chain is transitive through `blocked_by`: `DATA-04` ← `DATA-02`,`DATA-03` ←
`DATA-01` ← `FND-03` ← `FND-01`, and `DATA-02` ← `FND-06`. Nothing else is guaranteed to exist — in
particular `FND-04` (OpenAPI root) and `DATA-07` (`audit_event`) are **not** ancestors, which is why
this ticket must not depend on generated API types or write audit rows directly.

**What the PRD fixes, quoted, so nothing is re-derived.**

PRD §18.2 (technology stack): *"Authentication | Self-hosted Better Auth"*; *"Mutable database |
SQLite (`better-sqlite3`) with Drizzle or Kysely-style migrations/repositories"*. That either/or is
settled and is **not** this ticket's to weigh: breakdown-plan §8 **Q13 (CONFIRMED)** — Kysely-style
repositories over `better-sqlite3`, Drizzle not used, raw `.sql` files the only migration authoring
format — owned by `01-app-data` and recorded by `DATA-01`. It changes nothing here (see *Accepted
caveats* below and sub-PRD **D10**).

PRD §18.3: *"`app.sqlite` is mutable and contains identity, organisations, Research Records, jobs,
audit and usage."*

PRD §38.2 (session defaults) — the whole table is normative:

| Setting | Initial default |
|---|---|
| Interactive idle timeout | 8 hours |
| Absolute session lifetime | 7 days |
| Sensitive-action recent authentication | 10 minutes |
| Invitation lifetime | 72 hours; single use |
| Password reset/magic-link lifetime | 15 minutes; single use |
| MFA methods | TOTP and passkey; single-use hashed recovery codes |
| Owner/Admin MFA grace | Must enrol before protected workspace access after first login |
| Active-session view | Device/time/IP metadata; revoke one or all |
| Break-glass account | One named Owner path, MFA protected, not SSO-only, high-priority event on use |

and immediately after it: *"Production cookie defaults: `Secure`, `HttpOnly`, `SameSite=Lax`,
host-only, rotated session identifier after login/MFA/privilege change. State-changing Web requests
require CSRF protection; API keys do not use cookies."*

PRD §8.1: *"Access MUST be authenticated and invitation-controlled. Public registration MUST be
disabled."* PRD §30.2 **AUTH-001**: *"Access is invite-only; public signup is absent"*, minimum
acceptance evidence *"Expired, reused and wrong-email invites fail"*. PRD §41.2 `UAT-AUTH-01` (no
public account creation path) and `UAT-AUTH-02` (*"Accept same invite twice → First succeeds; second
shows consumed/invalid with no new membership"*).

PRD §35.4 defines the rows this package operates on — `user` (*"`id`, `email_normalized`,
`display_name`, `status`, auth-library linkage"*), `invitation` (*"`token_hash` … token shown/sent,
only hash stored; one use"*), `membership`, `actor`. PRD §45.2 assigns them: `packages/database` owns
*"app schema/migrations/tenant repositories/outbox/encryption"* and `apps/api` owns *"HTTP
auth/admission/DTO mapping/SSE"* but **must not** own *"Duplicated business rules"*. Breakdown-plan
decision **A3** restates it: *"`packages/database` owns every app table and repository"*.

PRD §21.1 (required controls) for this ticket: *"Secure HttpOnly SameSite cookies, CSRF, strict CSP,
encoding/sanitisation and exact widget origins"* and *"Encrypted application secrets, hashed
API/webhook credentials and rotation/revocation"*. PRD §39.6 names the secret groups, including
*"auth/session secret"*, injected as *"encrypted/sealed secret injection"* — never read from a file
by this package.

PRD §41.4 (first paid-pilot onboarding, Identity stage) fixes the first-factor expectation:
*"Configure email/passkey and optional SAML/OIDC; test break glass"*. The PRD names **no password
requirement** anywhere; the only password reference is the §38.2 *"Password reset/magic-link
lifetime | 15 minutes; single use"* row. So this ticket delivers the single-use 15-minute
email-token primitive that serves both magic-link sign-in and password reset, and does not invent a
password policy.

**Accepted caveats, carried forward explicitly.**

- SCIM is absent and member removal stays manual (PRD §16.3, §38.3) — documented, not enforced.
- Rate limiting of sign-in and token verification is `RUNT-02`'s (PRD §38.5). This ticket exposes a
  hook point and counts failures through the audit sink; it does not throttle.
- The SQLite access layer is **settled**, not a choice this ticket carries: breakdown-plan §8 **Q13
  (CONFIRMED)** fixes Kysely-style repositories over `better-sqlite3` with Drizzle not used, and
  `DATA-01` implements it inside `packages/database`. This package never sees it — it consumes
  repository ports (sub-PRD **D3**) and, per `DATA-02`'s rule that `kysely` is not imported outside
  `packages/database`, `packages/auth/src/**` imports neither `kysely` nor any SQLite driver
  (Deliverable 12, sub-PRD **D10**).

## Goal

Create the `packages/auth` public surface and its `core` area so that, from this ticket alone, a
caller can construct a working self-hosted Better Auth instance bound to `DATA-04`'s existing
`app.sqlite` tables, issue and validate sessions that honour every PRD §38.2 default, emit
production cookie attributes exactly as §38.2 states them, verify CSRF for state-changing web
requests, and mint/consume invitation and 15-minute email tokens that are stored only as hashes and
are single-use — with **no** route, no framework import, no database connection opened here, and no
code path that creates a user outside invitation acceptance. Completion is mechanically checkable:
the constants equal the §38.2 table, the exported functions exist with the signatures below, the
architecture test finds no forbidden import, and every acceptance item passes offline.

## Non-goals

- **No routes and no Fastify.** `/v1` auth, invitation and session endpoints are `IDNT-01`/`IDNT-02`;
  the admission chain that calls this package is `RUNT-02`. Basis: PRD §45.2.
- **No tables, migrations or SQL.** Everything under `packages/database/**` is `01-app-data`
  (`DATA-04` for §35.4 identity tables). Do **not** run Better Auth's schema generator/migrator —
  PRD §44.3 makes "app migration order" serial-owned and plan **A5** makes migrations
  timestamp-prefixed and expand-only under `DATA-01`.
- **No MFA logic.** TOTP, passkey, recovery codes and the recent-auth assertion are `AUTC-02`. This
  ticket only *records* `authenticated_at`/`reauthenticated_at` on the session and exposes
  `rotateSessionId('mfa')` for `AUTC-02` to call.
- **No SSO.** `AUTC-03`. This ticket must not branch on SSO state.
- **No machine credentials or widget tokens.** `AUTC-04`/`AUTC-05`; PRD §38.2 — *"API keys do not use
  cookies"* — so they never travel through the cookie path built here.
- **No role or permission decisions.** `packages/domain/src/access/**` (`FND-06`).
- **No audit table writes.** `audit_event` is `DATA-07`, which is not an ancestor of this ticket.
  Emit through the injected `AuditSink` port; the caller wires it.
- **No email sending.** Token minting only; delivery is `IDNT-02` over the `EmailTransport` port
  owned by `16-monitor-alerts`, whose provider is settled — plan §8 **Q14 (CONFIRMED)**: Resend on
  its free transactional tier, implemented by `WTCH-04`/`WTCH-09`. This ticket names no provider,
  holds no API key and is not waiting on one.
- **No password policy.** The PRD does not require passwords (§41.4 "email/passkey"). If Better Auth
  needs a credential provider enabled to function, enable it configurably and default it **off**, and
  raise the friction per *Feedback obligation*.

## File-scope (write-owns)

This ticket owns:

- `packages/auth/package.json` — **append-only shared manifest** for the module (breakdown-plan §1.1:
  *"within a module a manifest is append-only shared, and conflicts resolve by re-running the package
  manager"*). This ticket sets the `exports` map, `main`/`types` and its own dependencies. Do **not**
  rename the package — keep whatever name `FND-01` gave it (referred to below as `<auth-pkg>`).
- `packages/auth/tsconfig.json`
- `packages/auth/src/index.ts` — root barrel, **core exports only**
- `packages/auth/src/core/**`
- `packages/auth/test/core/**` and `packages/auth/test/support/**` (in-memory port fakes)
- Root `pnpm-lock.yaml` **as a regenerated build artifact only** if a dependency is added
  (breakdown-plan §4.1: *"conflicts resolve by re-running the package manager, never hand-merge"*).

Does not touch:

- `packages/auth/src/mfa/**`, `test/mfa/**` — `AUTC-02`
- `packages/auth/src/sso/**`, `test/sso/**` — `AUTC-03`
- `packages/auth/src/credentials/**`, `test/credentials/**` — `AUTC-04`
- `packages/auth/src/widget/**`, `test/widget/**` — `AUTC-05`
- `packages/database/**` (schema, migrations, repositories, crypto) — `01-app-data` (`DATA-01`…`DATA-04`)
- `packages/contracts/**`, `packages/domain/**`, `schemas/**` — `00-foundation` (`FND-03`…`FND-10`)
- `apps/api/**` (middleware, routes, error mapping) — `03-app-runtime` (`RUNT-01`/`RUNT-02`) and
  `13-identity-surface` (`IDNT-01`…`IDNT-07`)
- `tests/**` — `23-assurance`

**Serial-safety analysis.** This is the **first** decomposition of the PRD: nothing has been merged,
so no ticket has previously touched these paths and no in-flight ticket contends for them. The four
sibling tickets in this module (`AUTC-02`…`AUTC-05`) are all `blocked_by` this one, so none of them
can run concurrently with it; when they do run (three of them concurrently, plan §7: 3 lanes), their
write-sets are disjoint subdirectories of `packages/auth/src/` and `packages/auth/test/`. The only
shared file in the module is `packages/auth/package.json`, and this ticket removes it from contention
for the common case by declaring a **wildcard subpath export** (Deliverable 1) so siblings never need
to add an export key — their only possible manifest edit is appending their own dependency entries,
which the plan §1.1 rule already covers. `/start-all` serialises delivery, so lockfile regenerations
land one at a time.

## Deliverables

Internal organisation inside `src/core/**` is the Builder's choice; the exported names, signatures,
constants and ordering constraints below are not.

1. **Package surface — `packages/auth/package.json`, `packages/auth/tsconfig.json`,
   `packages/auth/src/index.ts`.**
   - `exports` map with exactly two entries: `"."` → the built root barrel, and the wildcard pattern
     `"./*"` → the built `src/<area>/index.js` for that area, so siblings are importable as
     `<auth-pkg>/mfa`, `<auth-pkg>/sso`, `<auth-pkg>/credentials`, `<auth-pkg>/widget` **without any
     sibling editing this file**.
   - `src/index.ts` re-exports `./core` **only**. It must not reference `mfa`, `sso`, `credentials`
     or `widget` (those directories do not exist yet, and adding them here would create the shared
     barrel the module deliberately avoids).
   - The toolchain is fixed — plan §8 **Q12 (CONFIRMED)**: Node.js `24.18.0` and pnpm `11.4.0`,
     committed by `FND-01` (sub-PRD **D11**) — so whether the wildcard pattern resolves is a
     mechanical check against known pins and the TypeScript module resolution `FND-01` configures,
     not a pending version decision. Fallback if it does **not** resolve under those pins: switch to
     explicit per-area keys and record it per *Feedback obligation* against sub-PRD **D9** — do
     **not** create a shared barrel.
2. **`src/core/constants.ts` — the PRD §38.2 defaults as frozen named constants, in seconds.**
   ```ts
   export const SESSION_DEFAULTS = Object.freeze({
     idleTimeoutSeconds:        28_800,  // PRD §38.2 — 8 hours
     absoluteLifetimeSeconds:  604_800,  // PRD §38.2 — 7 days
     recentAuthWindowSeconds:      600,  // PRD §38.2 — 10 minutes
     invitationLifetimeSeconds: 259_200, // PRD §38.2 — 72 hours, single use
     emailTokenLifetimeSeconds:    900,  // PRD §38.2 — password reset / magic link, 15 minutes, single use
   } as const)

   export const COOKIE_DEFAULTS = Object.freeze({
     secure: true, httpOnly: true, sameSite: 'lax', path: '/', hostOnly: true, // PRD §38.2
   } as const)
   ```
   Each constant carries its `PRD §38.2` comment. `defineAuthConfig(overrides?)` validates overrides
   and **throws** on `secure: false` or `sameSite: 'none'` outside a test environment, and on any
   lifetime longer than the §38.2 default (a longer session is a product change, PRD §45.1 item 5).
3. **`src/core/ports.ts` — every outbound dependency as an injected interface. No implementations.**
   At minimum: `Clock` (`now(): Date`), `Random` (`bytes(n): Uint8Array`, CSPRNG), `SecretsPort`
   (`sessionSecret()`), `AuthDatabasePort` (the Better Auth database adapter object, constructed by
   the caller from `packages/database`), `IdentityPort` (narrow reads/writes over the §35.4 `user`,
   `membership`, `invitation`, `actor` rows and the session row), `AuditSink`
   (`emit(event: AuthSecurityEvent): void` — `AuthSecurityEvent` carries actor/organisation/action/
   result/request metadata and a `severity`, never a secret or research content, per PRD §22).
   `packages/auth` must not import `packages/database`, any SQLite driver or query builder, or any
   HTTP framework.
4. **`src/core/auth.ts` — `createAuthCore(deps: AuthCoreDeps): AuthCore`.** Constructs the
   self-hosted Better Auth instance against the injected `AuthDatabasePort` (PRD §18.2), configured
   to the §38.2 defaults and `COOKIE_DEFAULTS`. Hard requirements:
   - **Public signup is absent** (PRD §8.1, AUTH-001): any Better Auth sign-up/registration handler
     is disabled; `AuthCore` exposes no user-creation entry point other than
     `acceptInvitation` (Deliverable 7). Export `PUBLIC_SIGNUP_ENABLED = false as const` so the
     property is assertable.
   - Better Auth's own schema generation/migration is **not** invoked at runtime or build time; the
     instance is bound to the tables `DATA-04` created (sub-PRD **D2**).
   - No connection is opened here and no filesystem path to `app.sqlite` appears in this package.
5. **`src/core/session.ts` — session lifecycle.** Exported:
   - `evaluateSessionExpiry(session, now): 'ACTIVE' | 'IDLE_EXPIRED' | 'ABSOLUTE_EXPIRED'` — a pure
     function over `{ createdAt, lastSeenAt }`; idle and absolute limits are both enforced and the
     absolute limit is **never** extended by activity (PRD §38.2).
   - `issueSession(input, deps)` — records device/user-agent/IP metadata and `authenticated_at`
     (PRD §38.2 active-session view).
   - `rotateSessionId(sessionId, reason: 'login' | 'mfa' | 'privilege_change', deps)` — issues a new
     opaque session identifier and invalidates the old one **in the same operation**; PRD §38.2
     requires rotation on exactly those three events. Ordering: rotation happens **after** the
     triggering event succeeds and **before** any response is produced.
   - `listSessions(userId, deps)` → device/time/IP metadata; `revokeSession(id, deps)`;
     `revokeAllSessions(userId, deps, opts?: { exceptSessionId?: string })` (PRD §38.2 "revoke one or all").
   - `touchSession(sessionId, now, deps)` — updates `lastSeenAt` only; it must not extend the
     absolute lifetime.
   - Every revocation and rotation emits an `AuditSink` event.
6. **`src/core/cookies.ts` — cookie policy.** `buildSessionCookie(value, config)` and
   `clearSessionCookie(config)` return header *values* (strings), applying `COOKIE_DEFAULTS`. The
   cookie is host-only: **no `Domain` attribute is ever emitted** (PRD §38.2). The `__Host-` prefix
   MAY be used. No framework object is imported or returned.
7. **`src/core/invitations.ts` — invitation primitive (AUTH-001).**
   - `createInvitation({ organizationId, emailNormalized, role, invitedByActorId }, deps)` → returns
     the **plaintext token exactly once** in memory plus the row to persist, which contains only
     `token_hash` (PRD §35.4: *"token shown/sent, only hash stored; one use"*). Token ≥256 bits from
     `Random`, URL-safe encoded.
   - `consumeInvitation({ token, emailNormalized }, now, deps)` →
     `{ ok: true, invitation } | { ok: false, reason: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_ACCEPTED' | 'EMAIL_MISMATCH' }`.
     Consumption is a **compare-and-set on `accepted_at`** so two concurrent accepts produce exactly
     one membership (`UAT-AUTH-02`); the second returns `ALREADY_ACCEPTED`. Expiry is
     `invitationLifetimeSeconds`. Email comparison uses the normalised form.
   - `acceptInvitation(...)` — the **only** user-creating path; creates or links the `user`, creates
     the `membership`, then calls `rotateSessionId(..., 'login')`. Ordering: consume → create/link →
     membership → session, all through `IdentityPort`; a failure after consumption must not leave a
     consumed invitation without a membership (the port call sequence is wrapped in the transaction
     handle the caller supplies).
8. **`src/core/email-tokens.ts` — 15-minute single-use tokens** for magic-link sign-in and password
   reset (PRD §38.2). Same shape as invitations: ≥256-bit token, hash-only storage, single-use
   compare-and-set consumption, `emailTokenLifetimeSeconds` expiry, typed failure reasons. No sending.
9. **`src/core/csrf.ts` — `assertCsrf(facts: HttpRequestFacts, config)`** →
   `{ ok: true } | { ok: false, reason: 'CSRF_FAILED' }`. `HttpRequestFacts` is a plain type
   (`method`, `origin`, `referer`, header token, cookie token, `authScheme`). State-changing methods
   on cookie-authenticated requests are checked; bearer/API-key requests are exempt (PRD §38.2:
   *"State-changing Web requests require CSRF protection; API keys do not use cookies"*). Comparison
   is constant-time.
10. **`src/core/results.ts` — typed results, not wire codes.** Export the discriminated failure union
    (`AUTHENTICATION_REQUIRED`, `SESSION_EXPIRED`, `CSRF_FAILED`, `INVITATION_*`, …). This package
    **must not** re-declare PRD §34.9 HTTP error codes or import generated OpenAPI types; `RUNT-02`
    maps reasons to `AUTHENTICATION_REQUIRED` / `MFA_REQUIRED` / `RECENT_AUTH_REQUIRED` / 404
    (sub-PRD **D1**; PRD §45.2). Reason names must not disclose whether an account exists.
11. **`test/support/**` — in-memory fakes** for every port in Deliverable 3 (`FakeClock` with settable
    time, `FakeIdentityStore`, `RecordingAuditSink`, deterministic `FakeRandom`). These are the core
    fakes only; siblings add their own under `test/<area>/`.
12. **`test/core/architecture.test.ts` — boundary test.** Scans `packages/auth/src/**` and fails on
    any import of an HTTP framework (`fastify`, `express`, `node:http`), any SQLite driver or query
    builder (`better-sqlite3`, `libsql`, `kysely` — plan §8 **Q13** puts Kysely inside
    `packages/database` and `DATA-02`'s architecture test keeps it there), `packages/database`, or
    any filesystem/network module. Basis: PRD §45.2, sub-PRD **D1**/**D2**/**D10**. This test is the
    module's standing boundary guard and every sibling ticket re-runs it.

## Acceptance checklist (classified)

- [ ] `[machine]` `SESSION_DEFAULTS` equals the PRD §38.2 table exactly (28 800 / 604 800 / 600 /
      259 200 / 900 seconds) and the test asserts each value against the quoted row, not against
      itself (PRD §38.2, D4).
- [ ] `[machine]` `buildSessionCookie` emits `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` and **no
      `Domain` attribute**; `defineAuthConfig` throws on `secure: false` / `sameSite: 'none'` outside
      test (PRD §38.2, §21.1).
- [ ] `[machine]` `evaluateSessionExpiry` returns `IDLE_EXPIRED` after 8 h of inactivity and
      `ABSOLUTE_EXPIRED` at 7 days even under continuous activity — property test over a driven
      `FakeClock` (PRD §38.2).
- [ ] `[machine]` `rotateSessionId` produces a new identifier and invalidates the old one for each of
      `login`, `mfa`, `privilege_change`; the old identifier fails validation immediately afterwards
      (PRD §38.2).
- [ ] `[machine]` `listSessions` returns device/time/IP metadata; `revokeSession` and
      `revokeAllSessions({ exceptSessionId })` behave as specified and emit audit events (PRD §38.2).
- [ ] `[machine]` No user-creation path exists except `acceptInvitation`: `PUBLIC_SIGNUP_ENABLED` is
      `false`, and a test asserts the constructed `AuthCore` exposes no sign-up handler
      (AUTH-001, PRD §8.1; the surface half is `UAT-AUTH-01`).
- [ ] `[machine]` Invitation matrix — expired, reused, wrong-email and unknown tokens each return
      their exact reason and create **no** membership; a valid token succeeds once. Two concurrent
      `consumeInvitation` calls on one token yield exactly one success (AUTH-001 evidence *"Expired,
      reused and wrong-email invites fail"*; `UAT-AUTH-02`).
- [ ] `[machine]` Only `token_hash` is ever handed to `IdentityPort` for invitations and email
      tokens; a test asserts the persisted record contains no substring of the plaintext token
      (PRD §35.4, §21.1).
- [ ] `[machine]` Email tokens expire at 15 minutes and are single-use (PRD §38.2).
- [ ] `[machine]` `assertCsrf` rejects a state-changing cross-origin cookie request and exempts a
      bearer-authenticated request; comparison is constant-time (PRD §38.2, §21.1).
- [ ] `[machine]` Architecture test (Deliverable 12) passes: no HTTP framework, no SQLite driver or
      query builder (`better-sqlite3`, `libsql`, `kysely`), no `packages/database` import, no
      filesystem/network use anywhere in `packages/auth/src/**` (PRD §45.2, sub-PRD D1/D2/D10,
      plan §8 **Q13**).
- [ ] `[machine]` No log line, thrown error message or returned object contains a plaintext token,
      session secret or session identifier — asserted by scanning `RecordingAuditSink` output and
      error payloads in every test (PRD §22, §21.1).
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (PRD §45.3, §20.3).
      No `cargo test --workspace` / `uv run pytest` item — this ticket touches no Rust or Python.
- [ ] `[fixture]` Against a **recorded `app.sqlite` schema fixture produced by `DATA-04`'s
      migrations**, `createAuthCore` binds and performs a full invite → user → membership → session →
      rotate → revoke cycle without executing any DDL. The test asserts the schema hash before and
      after are identical — i.e. Better Auth generated no tables (sub-PRD **D2**/**OQ1**, PRD §44.3).
- [ ] `[human]` PR body carries the PRD §45.4 items: requirement ids (AUTH-001) and UAT ids
      (`UAT-AUTH-01`, `UAT-AUTH-02`, exercised at the surface by `IDNT-01`/`IDNT-02`); schema/API/event
      compatibility (none — no schema, no `/v1` change); tenant/PII/security impact; cost/memory/latency
      impact (hash parameter choice deferred to `AUTC-04`, sub-PRD OQ4); rollback path; known gaps.
- [ ] `[human]` Gate 2 smoke linkage, **not required to merge**: `UAT-AUTH-01`/`UAT-AUTH-02` are run
      by a human against `IDNT-01`/`IDNT-02`'s routes at the phase Gate 2 (CLAUDE.md), not against
      this package. Recorded here so the linkage is visible.
- [ ] `[human]` If **OQ1** is falsified (Better Auth needs schema `DATA-04` does not provide), the
      writeback in *Feedback obligation* is done **before** any workaround is coded.

No further `[human]` criteria — this package has no UI surface; its screens are `IDNT-08`/`IDNT-09`.
No `[fixture]` criteria beyond the schema replay — this module has no source adapters (PRD §40.8) and
no evaluation replays (PRD §14/§43).

## Test plan

Harness: the workspace TypeScript unit-test runner configured by `FND-01`/`FND-02`; tests live in
`packages/auth/test/core/**` and use only the fakes in `packages/auth/test/support/**`. Everything is
offline — no network, no real SQLite file except the schema fixture below.

1. `pnpm install --frozen-lockfile` (or regenerate if this ticket added a dependency), then
   `pnpm lint && pnpm typecheck && pnpm test`. All green.
2. **Constants** — `test/core/constants.test.ts`: assert each `SESSION_DEFAULTS` value against the
   §38.2 row quoted in the test's own comment; assert `COOKIE_DEFAULTS`; assert `defineAuthConfig`
   throws for `secure: false`, `sameSite: 'none'` and for any lifetime above the default.
3. **Session** — `test/core/session.test.ts` with `FakeClock`: advance 7 h 59 m → `ACTIVE`; advance
   past 8 h idle → `IDLE_EXPIRED`; touch every hour for 7 days → `ABSOLUTE_EXPIRED`. Rotation: assert
   old identifier invalid immediately after `rotateSessionId` for all three reasons. Revocation:
   `revokeAllSessions` with `exceptSessionId` leaves exactly one live session.
4. **Invitations** — `test/core/invitations.test.ts`: table-driven over `{valid, expired, reused,
   wrong-email, unknown}` asserting the reason and that `FakeIdentityStore` recorded zero memberships
   for every failure case. Concurrency: call `consumeInvitation` twice against the fake's
   compare-and-set and assert exactly one `ok: true`. Secret hygiene: assert the persisted row's JSON
   does not contain the plaintext token.
5. **Email tokens** — same construction as (4) at the 15-minute boundary.
6. **CSRF** — `test/core/csrf.test.ts`: matrix over method × origin × auth scheme; assert exemption
   for `authScheme: 'bearer'` and rejection for a cross-origin `POST` with a cookie.
7. **Signup absence** — `test/core/no-public-signup.test.ts`: assert `PUBLIC_SIGNUP_ENABLED === false`
   and that the constructed `AuthCore`'s exported keys contain no sign-up/registration entry.
8. **Schema-fixture replay** (`[fixture]`) — `test/core/schema-binding.test.ts`: apply `DATA-04`'s
   migrations to a temporary SQLite file (via the migration runner `DATA-01` ships — invoked as a
   test dependency, not re-implemented), snapshot `sqlite_master`, run the full cycle through
   `createAuthCore` with a real adapter over that file, snapshot `sqlite_master` again and assert the
   two snapshots are byte-identical. If the migration runner is not consumable from a test, record
   the fixture as a checked-in `.sql` schema dump under `packages/auth/test/support/` and replay that
   — state which route was taken in the PR body.
9. **Architecture** — `test/core/architecture.test.ts` as specified in Deliverable 12; the Reviewer
   runs it directly and inspects the deny-list, including the `kysely` entry that keeps the confirmed
   §8 Q13 access layer inside `packages/database`.
10. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): the
    compare-and-set in `consumeInvitation`; the ordering of rotation relative to privilege change;
    whether any error message distinguishes "unknown invitation" from "wrong email" in a way that
    leaks account existence; whether the absolute lifetime can be extended by `touchSession`.

## Feedback obligation

1. **General rule.** If implementation falsifies anything in this ticket, update **this ticket**
   (`docs/prd/02-auth-core/tickets/AUTC-01-better-auth-adapter-session-and-cookie-policy.md`) or
   `docs/prd/02-auth-core/README.md` first — version +0.1 and a changelog line — then change code. A
   spec change is a docs PR followed by `publish-tickets.mjs --sync` (CLAUDE.md, issue #53). Silent
   divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target.**
   - **Better Auth requires a table or column `DATA-04` does not define** (sub-PRD **OQ1**) → do
     **not** write `packages/database/**` and do **not** let Better Auth create it. Update
     `docs/prd/02-auth-core/README.md` (OQ1 resolution) **and** `docs/prd/breakdown-plan.md` §5.2 +
     §6.2 to add the schema ticket in `01-app-data` and the new `blocked_by` edge onto `AUTC-01` —
     the path breakdown-plan §9 **R4** prescribes — before touching `src/core/auth.ts`.
   - **The wildcard `exports` pattern does not resolve under the pinned toolchain** (Node.js
     `24.18.0` / pnpm `11.4.0`, plan §8 **Q12 (CONFIRMED)**, sub-PRD **D11**) → this is a build
     observation about the pattern, never a reason to change a pinned version. Update
     `docs/prd/02-auth-core/README.md` decision **D9** to the explicit per-area keys variant and note
     in each sibling ticket's file-scope that it now appends one `exports` key. Never create a shared
     `src/index.ts` barrel that four tickets edit.
   - **Better Auth cannot run with all account-creation providers disabled** → this touches AUTH-001,
     a release requirement. Update this ticket's Deliverable 4 and
     `docs/prd/02-auth-core/README.md` first, and state the compensating control (no route exposes
     it — `IDNT-01`) explicitly; do not quietly enable a signup path.
   - **A session/cookie default cannot be honoured** (e.g. the library cannot express host-only
     cookies) → that is a PRD §38.2 conflict, not a local choice: raise it as an ADR under
     `docs/adr/NNNN-<slug>.md` (breakdown-plan **A9**: `docs/adr/**` is shared-additive, per-file
     ownership claimed by the creating ticket — take the next unused number, never overwrite) and
     record the consequence in `docs/prd/02-auth-core/README.md`.
   - **The hash/KDF needed for invitation and email tokens is not yet decided** (sub-PRD **OQ4**,
     owned by `AUTC-04`) → use a documented interim choice behind `SecretsPort`/a named constant,
     record it in `docs/prd/02-auth-core/README.md` OQ4, and leave `AUTC-04` to set the final
     parameters. Do not fork a second hashing implementation.
   - **Better Auth's SQLite adapter appears to need a `kysely` or `better-sqlite3` import inside
     `packages/auth`** → it must not get one. The adapter object is constructed by the caller from
     `packages/database` and injected as `AuthDatabasePort` (Deliverable 3); plan §8 **Q13** and
     `DATA-02`'s architecture test keep both packages out of this tree. If that proves impossible,
     write back to `docs/prd/02-auth-core/README.md` **D3**/**D10** and `docs/prd/01-app-data/README.md`
     **D11** before relaxing the deny-list — never widen it locally.
3. **Escalation.** If a *decided* protocol is outright falsified — self-hosted Better Auth cannot be
   used (PRD §18.2), or `packages/database` cannot remain the sole schema owner (plan **A3**) — that
   overturns a team decision. Stop, write the ADR + the plan/sub-PRD writeback, and escalate for
   re-review. Never swap the approach silently inside this ticket.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-03 | Initial ticket (`/breakdown-prd`). |
| v1.1 | 2026-08-20 | **This ticket's own entry file breaks a guard it does not own; the repair is `FND-32`, which is added to `blocked_by`.** Writing `packages/auth/src/index.ts` — the *"root barrel, core exports only"* this ticket's own File-scope authorises, delivered on `ticket/AUTC-01` @ `4a8dff8` as a doc comment plus `export * from './core/index.js';` — turns one assertion red: `tools/tests/skeleton.test.mjs` *"keeps every entry file empty"*, via `tools/workspace-assertions.mjs#assertEntryFilesEmpty`, reporting **`packages/auth/src/index.ts is not empty`**. `tools/vitest.config.mjs` runs that suite on every branch, so the failure arrives without this branch touching the file that asserts it. **It is not this ticket's to repair:** `tools/**` is `FND-01`'s area in `00-foundation`'s row (breakdown plan §4; phase-2 plan §3 makes product trees this phase's Non-goal and `tools/**` `00-foundation`'s), and this ticket's File-scope declares `packages/auth/**` and nothing under `tools/`. The repair is **`FND-32`**, and it is **general rather than a carve-out for this branch**: the guard asserts that *every* workspace member's entry file is still the byte-exact bootstrap stub, and on `main` @ `e1e08e4` all **18** entry files under `apps/`, `packages/` and `services/` — 28 counting `tests/`, `pipelines/` and `sdk/` — are still that stub, so it stands in front of every member-implementing ticket in the PRD and not only this one. `RETR-01` hit the same assertion on the same run for `services/search-rs/src/lib.rs`. **This ticket's own work is otherwise green:** 12 test files / **273 tests** passing, and `pnpm ci:local` **17 of 18** with this guard as the single failing command. Nothing in this ticket's spec, scope, deliverables or acceptance changes — the only edit is the `blocked_by` edge, so `AUTC-01` merges after `FND-32` and lands green. |
