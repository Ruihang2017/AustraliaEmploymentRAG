---
id: AUTC-05
title: Widget session token signing and origin binding
module: 02-auth-core
lane: 02-auth-core
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [AUTC-04]
blocks: [IDNT-07]
---

# AUTC-05 — Widget session token signing and origin binding

Implements **PRD §38.4, §33.5, §8.10 — DEV-002** (epic `E27-DEVELOPER`).
No ADR — the decision is already made in PRD §38.4 (*"Widget sessions are signed, opaque-to-client
authorisation tokens with a maximum 15-minute lifetime."*); this is build ticket **5 of 5** against it.
Parent sub-PRD: [02-auth-core README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [AUTC-04 — Machine credentials: hashing, scopes, rotation, expiry](AUTC-04-machine-credentials-hashing-scopes-rotation-expiry.md).
**Why `builder`:** a bounded change inside one module's declared file-scope
(`packages/auth/src/widget/**`) against a fixed contract — PRD §38.4 already fixes the claim set, the
lifetime and the prohibitions; nothing here is a new subsystem decision.

## Background + basis

**Context a fresh agent needs.** `AUTC-01` owns `packages/auth/src/core/**` (ports `Clock`, `Random`,
`SecretsPort`, `IdentityPort`, `AuditSink`; the typed-result convention — this package returns
reasons and `apps/api` maps them to PRD §34.9 wire codes; the wildcard subpath `exports` that makes
this area importable as `<auth-pkg>/widget` **without editing any shared file**). `AUTC-04`, this
ticket's `blocked_by`, owns `packages/auth/src/credentials/**` and exports
`authenticateCredential(presented, ctx, deps)` returning
`{ ok: true, credential: VerifiedCredential }` with `{ credentialId, serviceAccountId,
organizationId, scopes, budgetLimit }`, plus `assertScope(granted, required)` (exact match, no
wildcards). This ticket **consumes** that result; it never re-verifies a credential itself.
Transitively merged: `FND-01`, `FND-03`, `FND-06`, `DATA-01`…`DATA-04`. `DATA-07` (`audit_event`) is
not an ancestor — events leave through `AuditSink`. `AUTC-02`/`AUTC-03` may or may not have merged;
do not import `<auth-pkg>/mfa` or `<auth-pkg>/sso`.

**What the PRD fixes, quoted.**

PRD §38.4 (widget tokens), the whole paragraph, is this ticket's specification:

> Widget sessions are signed, opaque-to-client authorisation tokens with a maximum 15-minute
> lifetime. Claims bind organisation, service account, pseudonymous external user, allowed origins,
> allowed features, environment, credit ceiling and unique token ID. The token cannot create service
> accounts, read arbitrary Research Records, access settings/admin or exceed its origin.

PRD §33.5 (widget request flow):

> 1. Customer backend authenticates its own user.
> 2. Backend calls the platform using a service credential to create a widget session containing
>    organisation, pseudonymous external user ID, exact origins, features, expiry and credit ceiling.
> 3. Browser loads the versioned JavaScript loader and sandboxed iframe.
> 4. Iframe validates parent origin and exchanges only typed events.
> 5. Widget calls the same `/v1` admission, PII, evidence and quota pipeline as Web/API; no bypass
>    exists.
> 6. Session expires quickly and is never stored in localStorage.

PRD §8.10: *"The browser widget MUST use a short-lived organisation-scoped widget session created by
the customer's backend; long-lived service credentials MUST NOT enter the browser."* and *"The widget
MUST use a sandboxed iframe with a JavaScript loader and React wrapper, exact origin validation,
typed events and no token storage in localStorage."*

PRD §30.2 **DEV-002**: *"Widget uses short-lived, origin-bound sessions from customer backend"* —
primary API *"widget-session endpoint"*, minimum acceptance evidence *"Long-lived key never appears
in browser storage/network fixture"*.

PRD §21.1: *"Secure HttpOnly SameSite cookies, CSRF, strict CSP, encoding/sanitisation and **exact
widget origins**"*.

PRD §38.5: widget session creation is rate-limited at *"30/min/service account"* (trial) and
*"120/min/service account"* (paid pilot) with *"abuse/IP/origin protection"* — **enforced by
`RUNT-02`**, not here.

PRD §39.6 lists the secret groups including the *"auth/session secret"*, delivered by
*"encrypted/sealed secret injection"* — the signing key arrives through `AUTC-01`'s `SecretsPort`;
this package never reads a file or environment variable.

**The design constraint that keeps the format free.** Sub-PRD decision **D8**: the token's
**encoding is internal to `packages/auth`**. The cross-package contract is exactly
`issueWidgetSession` + `verifyWidgetSession` plus an opaque string. No other package parses the
token, so "opaque-to-client" (PRD §38.4) is true by construction and the encoding stays an
implementation detail (PRD §45.5). Any design in which the widget, the loader (`PLTF-05`) or a route
(`IDNT-07`) inspects the token's payload falsifies **D8** and must be written back before it is
coded.

**Accepted caveats, carried forward explicitly.**

- The pseudonymous external user ID is supplied by the customer backend (PRD §33.5 step 2). This
  package treats it as an opaque string, must not attempt to resolve it to a platform `user`, and
  must not persist it anywhere it would become customer PII beyond the token record (PRD §10.1
  anonymous-scenario rule, §37 admission).
- Rate limiting, quota reservation and the credit ceiling's *enforcement* are `RUNT-02` + `FND-09`
  (PRD §38.5, §24.4). This ticket carries `creditCeiling` in the claims; it does not debit.
- The browser-side loader, iframe sandboxing, `postMessage` typing and the "never in localStorage"
  behaviour are `PLTF-05`/`PLTF-06` (`20-developer-platform`). This ticket makes them *possible*
  (short lifetime, origin binding, opacity) and asserts the server-side half.

## Goal

Deliver `packages/auth/src/widget/**` so that a widget session can be minted **only** from an
already-verified service credential, carrying exactly the eight PRD §38.4 claim bindings, with a
lifetime hard-capped at 15 minutes, returned as a string that is opaque to the client, and verified
on every subsequent call with the **request's actual origin checked against the token's exact origin
allowlist** and the token's feature set enforced. Completion is mechanically checkable: the exported
functions below exist with the stated signatures, `WIDGET_SESSION_MAX_TTL_SECONDS` is 900, a
requested longer TTL is clamped, no forbidden capability is expressible, the origin check is exact
(no suffix or wildcard matching), and a tampered, expired, replayed-after-revocation or
wrong-origin token is refused.

## Non-goals

- **No route.** `POST /v1/widget-sessions` is `IDNT-07` (`13-identity-surface`), which is
  `blocked_by` this ticket.
- **No browser code.** The loader, sandboxed iframe, typed events and React wrapper are `PLTF-05`
  and `PLTF-06` (PRD §8.10). Nothing in this ticket runs in a browser.
- **No credential verification.** `AUTC-04` owns `authenticateCredential`; consume its result.
- **No tables or migrations.** Any persisted token/session record belongs to `packages/database`
  (`DATA-04`/`DATA-05`); access is through `AUTC-01`'s `IdentityPort`. If no suitable row exists, see
  *Feedback obligation* — do not create a schema.
- **No rate limiting or credit debiting.** `RUNT-02` + `FND-09` (PRD §38.5, §24.4).
- **No PII detection or admission logic.** `packages/pii` (`12-evidence-safety`); PRD §33.5 step 5
  requires the widget to traverse the **same** admission pipeline, which is `RUNT-02`'s chain.
- **No cookies.** A widget token is a machine authorisation, not a browser session (PRD §38.2 *"API
  keys do not use cookies"*, and the widget must not store the token at all, §33.5 step 6).
- **No new signing-key management.** The key comes from `SecretsPort` (PRD §39.6).

## File-scope (write-owns)

This ticket owns:

- `packages/auth/src/widget/**`
- `packages/auth/test/widget/**` (including recorded fixtures under
  `packages/auth/test/widget/fixtures/**`)
- `packages/auth/package.json` — **append-only**, dependencies block only (breakdown-plan §1.1).
  Do not change `exports`, `name`, `main`, `types` (`AUTC-01`) or reorder another ticket's entries.
- Root `pnpm-lock.yaml` as a regenerated build artifact only (breakdown-plan §4.1).

Does not touch:

- `packages/auth/src/core/**`, `src/index.ts`, `tsconfig.json`, `test/core/**`, `test/support/**` — `AUTC-01`
- `packages/auth/src/mfa/**`, `test/mfa/**` — `AUTC-02`
- `packages/auth/src/sso/**`, `test/sso/**` — `AUTC-03`
- `packages/auth/src/credentials/**`, `test/credentials/**` — `AUTC-04` (import from
  `<auth-pkg>/credentials`; never edit it)
- `apps/widget/**` — `20-developer-platform` (`PLTF-05`/`PLTF-06`)
- `apps/api/src/routes/widget-sessions/**` — `13-identity-surface` (`IDNT-07`)
- `packages/database/**` — `01-app-data`; `packages/domain/**`, `packages/contracts/**` — `00-foundation`
- `tests/**` (security/e2e suites) — `23-assurance`

**Serial-safety analysis.** First decomposition — nothing merged, no in-flight contention. Prior
writers inside `packages/auth/**` are `AUTC-01` (core) and `AUTC-04` (credentials); `AUTC-04` is this
ticket's `blocked_by`, and `AUTC-01` is its transitive ancestor, so both are complete before this
ticket starts. This ticket is the module's **final wave** (plan §7: wave 3 of 3): `AUTC-02` and
`AUTC-03` are in wave 2 and may still be in flight when this one starts, which is why this ticket
must not import `<auth-pkg>/mfa` or `<auth-pkg>/sso` — their write-sets (`src/mfa/**`, `src/sso/**`)
are disjoint from `src/widget/**` and stay that way. The single shared file is
`packages/auth/package.json`, restricted to appending distinct dependency entries; `/start-all`
serialises delivery.

## Deliverables

1. **`src/widget/claims.ts` — the PRD §38.4 claim set, exactly.**
   ```ts
   export type WidgetSessionClaims = {
     tokenId: string            // unique token ID (PRD §38.4)
     organizationId: string
     serviceAccountId: string
     externalUserRef: string    // pseudonymous external user (opaque to the platform)
     allowedOrigins: string[]   // exact origins, scheme+host+port
     allowedFeatures: string[]
     environment: string        // sandbox vs production (PRD §20.2)
     creditCeiling: number
     issuedAt: string           // ISO 8601 UTC (PRD §16.1)
     expiresAt: string          // ISO 8601 UTC
   }
   ```
   Plus `validateClaims(input)` rejecting unknown properties, empty `allowedOrigins`, a non-absolute
   or non-HTTPS origin (localhost excepted for development), and any `expiresAt` beyond the cap.
   Export `WIDGET_FORBIDDEN_CAPABILITIES` documenting, with the §38.4 quote, that a widget token
   cannot create service accounts, read arbitrary Research Records or reach settings/admin.
2. **`src/widget/constants.ts`** —
   `export const WIDGET_SESSION_MAX_TTL_SECONDS = 900 as const // PRD §38.4 — maximum 15 minutes`
   and `WIDGET_ALLOWED_FEATURES` (the initial feature identifiers the widget may be granted). If
   `packages/contracts` (`FND-03`) exports a feature enum, import it instead — PRD §35.1 forbids a
   second list of controlled values.
3. **`src/widget/issue.ts` — minting, only from a verified credential.**
   ```ts
   export function issueWidgetSession(
     input: {
       credential: VerifiedCredential          // from <auth-pkg>/credentials — AUTC-04
       externalUserRef: string
       allowedOrigins: string[]
       allowedFeatures: string[]
       environment: string
       creditCeiling: number
       ttlSeconds?: number                     // clamped to WIDGET_SESSION_MAX_TTL_SECONDS
     },
     now: Date,
     deps: WidgetDeps,
   ): { ok: true; token: string; claims: WidgetSessionClaims }
    | { ok: false; reason: 'SCOPE_REQUIRED' | 'INVALID_ORIGIN' | 'INVALID_FEATURE' | 'INVALID_CEILING' | 'INVALID_TTL' }
   ```
   - The function accepts **only** a `VerifiedCredential` — there is no overload taking a raw
     credential string, a cookie or a user session. This is what makes PRD §33.5 step 2 true
     ("Backend calls the platform using a service credential") and DEV-002's *"created by customer
     backend"* structurally enforced.
   - `assertScope` (from `<auth-pkg>/credentials`) gates minting; the required scope is a single named
     constant exported here.
   - `ttlSeconds` is clamped: `min(ttlSeconds ?? WIDGET_SESSION_MAX_TTL_SECONDS,
     WIDGET_SESSION_MAX_TTL_SECONDS)`. A negative or zero TTL is `INVALID_TTL`.
   - `creditCeiling` must be ≥ 0 and ≤ the credential's `budgetLimit` when one is set (PRD §38.4
     *"credit ceiling"*, §24.4 separate ledgers).
   - `allowedFeatures` ⊆ `WIDGET_ALLOWED_FEATURES` and must not contain anything in
     `WIDGET_FORBIDDEN_CAPABILITIES`.
   - `tokenId` is a fresh ≥128-bit value from `Random`; the token is signed with the auth/session
     secret from `SecretsPort` (PRD §39.6) and is **opaque to the client** (sub-PRD **D8**) — the
     encoding is this ticket's choice, but a client MUST NOT be able to read the claims from it.
   - Emits an `AuditSink` event (organisation, service account, `tokenId`, origins, features, TTL) —
     never the token itself.
4. **`src/widget/verify.ts` — verification on every call.**
   ```ts
   export function verifyWidgetSession(
     token: string,
     ctx: { requestOrigin?: string; now: Date; requiredFeature?: string },
     deps: WidgetDeps,
   ): { ok: true; claims: WidgetSessionClaims }
    | { ok: false; reason: 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED' | 'REVOKED' | 'ORIGIN_NOT_ALLOWED' | 'FEATURE_NOT_ALLOWED' }
   ```
   Fixed order: parse → signature (constant-time) → expiry → revocation check through `IdentityPort`
   → **origin** → feature. Requirements: **origin matching is exact** — full scheme + host + port
   equality against `allowedOrigins`, with no suffix matching, no wildcard, no `null` origin
   accepted, and no fallback to `Referer` (PRD §21.1 *"exact widget origins"*, §38.4 *"cannot …
   exceed its origin"*). A missing request origin on a state-changing call is a refusal, not a pass.
   Never throws on attacker-controlled input.
5. **`src/widget/revoke.ts`** — `revokeWidgetSession({ tokenId, reason }, now, deps)`: marks the
   token record revoked through `IdentityPort` and emits an audit event; `verifyWidgetSession`
   refuses it at the next call with `REVOKED`, with no cache inside this package. Also
   `revokeWidgetSessionsForServiceAccount(serviceAccountId, ...)` so `AUTC-04`'s credential
   revocation/rotation has a cascade path (AUTH-006's *"immediately"* must not be undermined by a
   live widget token minted from a revoked credential).
6. **`src/widget/index.ts`** — the area barrel (consumed as `<auth-pkg>/widget`), exporting
   everything above plus `WIDGET_SESSION_MAX_TTL_SECONDS`.
7. **Recorded fixtures** under `packages/auth/test/widget/fixtures/**`: a valid token with its claim
   set; tampered signature; expired; wrong-origin; near-miss origins
   (`https://app.example.com.evil.test`, `https://app.example.com:8443`, `http://app.example.com`,
   `null`); a revoked-token record; and a **captured request/response pair** (the widget-session
   creation response plus a subsequent widget call) used to assert DEV-002's evidence — *"Long-lived
   key never appears in browser storage/network fixture"*. Synthetic values only (PRD §45.1 item 6).

## Acceptance checklist (classified)

- [ ] `[machine]` `WIDGET_SESSION_MAX_TTL_SECONDS === 900`; a requested TTL of 3 600 s is clamped to
      900 s and the issued `expiresAt` is exactly `issuedAt + 900 s` (PRD §38.4 *"maximum 15-minute
      lifetime"*).
- [ ] `[machine]` `issueWidgetSession` accepts only a `VerifiedCredential`: there is no exported
      overload or path that mints a token from a raw credential string, a cookie or a user session —
      asserted by type-level and runtime tests (PRD §33.5 step 2, DEV-002).
- [ ] `[machine]` Minting without the required scope returns `SCOPE_REQUIRED` and issues nothing
      (PRD §38.4 *"exact scopes"*, via `AUTC-04`'s `assertScope`).
- [ ] `[machine]` The issued claims contain **exactly** the eight PRD §38.4 bindings plus
      issued/expiry — organisation, service account, pseudonymous external user, allowed origins,
      allowed features, environment, credit ceiling, unique token ID — and `validateClaims` rejects
      unknown properties (PRD §38.4).
- [ ] `[machine]` The token is opaque: a test asserts that no claim value (organisation id, external
      user ref, origin, feature) is recoverable from the token string by decoding it without the
      signing secret (PRD §38.4 *"opaque-to-client"*, sub-PRD D8).
- [ ] `[machine]` **Exact origin binding**: `https://app.example.com` is accepted; each near-miss
      fixture (`…com.evil.test`, different port, `http://`, `null`, absent) is refused with
      `ORIGIN_NOT_ALLOWED`; no suffix or wildcard match exists in the code (PRD §21.1, §38.4).
- [ ] `[machine]` `verifyWidgetSession` refuses tampered signatures, expired tokens and revoked
      tokens, and never throws on malformed/attacker-controlled input (PRD §21.1).
- [ ] `[machine]` `requiredFeature` outside the token's `allowedFeatures` returns
      `FEATURE_NOT_ALLOWED`; no capability in `WIDGET_FORBIDDEN_CAPABILITIES` can be granted at issue
      time (PRD §38.4 *"cannot create service accounts, read arbitrary Research Records, access
      settings/admin"*).
- [ ] `[machine]` `creditCeiling` above the credential's `budgetLimit` is refused with
      `INVALID_CEILING` (PRD §38.4, §24.4).
- [ ] `[machine]` Revoking a credential's widget sessions makes every derived token fail at the next
      verification, with no cache in this package (AUTH-006 *"immediately"*, PRD §38.4).
- [ ] `[machine]` No token string, signing secret or claim payload appears in any `AuditSink` event,
      thrown error or returned error object (PRD §22, §21.1).
- [ ] `[machine]` No cookie is read or written in `src/widget/**`, and nothing in `src/widget/**`
      imports `<auth-pkg>/mfa` or `<auth-pkg>/sso` (PRD §38.2; serial-safety, above).
- [ ] `[machine]` `AUTC-01`'s architecture test still passes with `src/widget/**` present
      (PRD §45.2).
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (PRD §45.3, §20.3).
      No `cargo test --workspace` / `uv run pytest` item — this ticket touches no Rust or Python.
- [ ] `[fixture]` Every recorded token fixture replays to its expected outcome offline (valid,
      tampered, expired, revoked, each near-miss origin) under `FakeClock`.
- [ ] `[fixture]` **DEV-002 evidence**: in the captured widget-session creation response and the
      subsequent widget call, the long-lived service credential appears **nowhere** — asserted by
      scanning both fixtures for the credential prefix and secret (PRD §30.2 DEV-002 *"Long-lived key
      never appears in browser storage/network fixture"*; §8.10). The browser-storage half of that
      evidence is `PLTF-05`'s.
- [ ] `[human]` PR body carries the PRD §45.4 items: requirement id DEV-002; UAT linkage (no §41.2
      row targets this package directly — surface evidence is `IDNT-07` and `PLTF-05`);
      schema/API/event compatibility (none from this package); tenant/security impact including the
      origin-binding analysis; rollback path; known gaps.
- [ ] `[human]` Gate 2 smoke linkage, **not required to merge**: the widget flow is exercised by a
      human through `/developer/widget` (`PLTF-05`/`PLTF-07`) with `IDNT-07` minting the session, at
      the phase Gate 2 (CLAUDE.md), not against this package.

No further `[human]` criteria — this package has no UI surface. No adapter fixtures (PRD §40.8) and
no evaluation replays (PRD §14/§43) exist in this module.

## Test plan

Harness: the workspace TypeScript unit-test runner from `FND-01`/`FND-02`; tests in
`packages/auth/test/widget/**`, copying the fake-port + `FakeClock` construction pattern from
`packages/auth/test/core/session.test.ts` (`AUTC-01`) and the fixture-table pattern from
`packages/auth/test/credentials/rotation.test.ts` (`AUTC-04`). Fully offline — no browser, no network.

1. `pnpm lint && pnpm typecheck && pnpm test` — all green.
2. **Issue** — `test/widget/issue.test.ts`: success case asserting the exact claim set and
   `expiresAt − issuedAt === 900`; TTL clamping at 3 600 s; `INVALID_TTL` at 0 and −1;
   `SCOPE_REQUIRED` without the minting scope; `INVALID_CEILING` above `budgetLimit`;
   `INVALID_FEATURE` for an unknown or forbidden feature; `INVALID_ORIGIN` for an empty list, a
   relative origin and a non-HTTPS non-localhost origin.
3. **Opacity** — `test/widget/opacity.test.ts`: attempt to recover claims from the token string by
   base64/JSON decoding and by common token parsers; assert no claim value is readable without the
   secret (sub-PRD D8).
4. **Origin matrix** (`[fixture]`) — `test/widget/origin.test.ts`: table over the near-miss fixtures;
   assert `ORIGIN_NOT_ALLOWED` for every one and success only for exact equality; assert an absent
   `requestOrigin` is refused.
5. **Verify** — `test/widget/verify.test.ts`: valid; tampered signature (flip one byte); expired at
   `expiresAt + 1 s`; revoked; feature mismatch. Assert the fixed order of checks by inspecting the
   fake port call log (no `IdentityPort` lookup happens before the signature check).
6. **Revocation cascade** — `test/widget/revoke.test.ts`: mint two tokens from one credential, call
   `revokeWidgetSessionsForServiceAccount`, assert both fail at the next verification.
7. **DEV-002 scan** (`[fixture]`) — `test/widget/dev-002-no-long-lived-key.test.ts`: load the captured
   request/response fixtures and assert the credential prefix and secret appear in neither.
8. **Secret hygiene** — a shared helper scanning every audit event, error and returned object in the
   suite for the token string and signing secret.
9. **Boundary** — re-run `packages/auth/test/core/architecture.test.ts` (owned by `AUTC-01`) unchanged,
   plus an assertion that `src/widget/**` imports nothing from `src/mfa/**` or `src/sso/**`.
10. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether origin
    comparison can be tricked by case, trailing dot, default-port normalisation or IDN homographs;
    whether a token minted just before credential revocation survives; whether the TTL clamp can be
    bypassed by supplying `expiresAt` directly; whether any error message reveals whether a
    `tokenId` exists; whether the signature check is constant-time.

## Feedback obligation

1. **General rule.** If implementation falsifies anything here, update **this ticket**
   (`docs/prd/02-auth-core/tickets/AUTC-05-widget-session-token-signing-and-origin-binding.md`) or
   `docs/prd/02-auth-core/README.md` first — version +0.1 and a changelog line — then change code.
   Spec changes go through a docs PR and `publish-tickets.mjs --sync` (CLAUDE.md, issue #53).
2. **Foreseeable frictions, each with its exact writeback target.**
   - **A consumer needs to read the token's claims client-side** (e.g. `PLTF-05` wants the expiry to
     schedule a refresh) → that falsifies sub-PRD decision **D8** and PRD §38.4's "opaque-to-client".
     Update `docs/prd/02-auth-core/README.md` (**D8** consequences) **and** write
     `docs/adr/NNNN-<slug>.md` (breakdown-plan **A9**: `docs/adr/**` is shared-additive, per-file
     ownership claimed by the creating ticket — next unused number, never overwrite) **before**
     changing the encoding. The cheap alternative — returning `expiresAt` alongside the token in the
     `IDNT-07` response body rather than inside it — is preferred and needs no ADR.
   - **No table exists to record widget-session tokens** (needed for revocation) → do **not** write
     `packages/database/**`. Follow breakdown-plan §9 **R4**: add the schema ticket to `01-app-data`
     in `docs/prd/breakdown-plan.md` §5.2 + §6.2 with the `blocked_by` edge onto this ticket, and
     record it in `docs/prd/02-auth-core/README.md` **OQ1**. A stateless token with no revocation
     path would break AUTH-006's "immediately" and must not be shipped as a silent workaround.
   - **The signing key cannot come from `SecretsPort`** (shape or rotation) → update
     `docs/prd/02-auth-core/README.md` decision **D3**, and if key rotation needs its own contract,
     raise it in `docs/prd/breakdown-plan.md` §8 with `18-ops-release` named (PRD §39.6 secret
     groups) before hardcoding a key source.
   - **`packages/contracts` should own the widget feature identifiers** → import from it and delete
     the local list; if it does not define them, update `docs/prd/breakdown-plan.md` §5.1 + §6.2 to
     add them to `FND-03` with the `blocked_by` edge, and note it in
     `docs/prd/02-auth-core/README.md`. PRD §35.1 forbids a second list.
   - **Exact-origin matching breaks a legitimate customer embedding** (e.g. many subdomains) → that
     is a **product change** (PRD §21.1 *"exact widget origins"* is a required control), requiring
     Founder approval and a PRD update per PRD §45.5. Record the request in
     `docs/prd/02-auth-core/README.md` open questions and escalate. Never add wildcard origin
     matching locally.
3. **Escalation.** If a decided protocol is outright falsified — a widget token cannot be both signed
   and opaque, or origin binding cannot be enforced server-side — that overturns PRD §38.4 and
   DEV-002. Stop, write the ADR + sub-PRD writeback, and escalate for re-review. Never allow a
   long-lived service credential to reach the browser as a workaround (PRD §8.10 MUST NOT).
