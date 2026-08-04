---
id: AUTC-02
title: "MFA: TOTP, passkey, recovery codes, recent-auth assertion"
module: 02-auth-core
lane: 02-auth-core
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [AUTC-01]
blocks: [IDNT-04, INTL-01]
---

# AUTC-02 — MFA: TOTP, passkey, recovery codes, recent-auth assertion

Implements **PRD §38.2, §16.3, §21.1 — AUTH-004** (epic `E05-AUTH`).
No ADR — the decision is already made in PRD §38.2 (*"MFA methods | TOTP and passkey; single-use
hashed recovery codes"*) and PRD §16.3; this is build ticket **2 of 5** against it.
Parent sub-PRD: [02-auth-core README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [AUTC-01 — Better Auth adapter, session and cookie policy](AUTC-01-better-auth-adapter-session-and-cookie-policy.md).
**Why `builder`:** a bounded change inside one module's declared file-scope
(`packages/auth/src/mfa/**`) against a fixed contract — the factors and the 10-minute window are
already set by PRD §38.2; nothing here is a new subsystem decision.

## Background + basis

**Context a fresh agent needs.** `AUTC-01` has landed and owns `packages/auth/src/core/**`: the
`SESSION_DEFAULTS` constants, the injected ports (`Clock`, `Random`, `SecretsPort`, `IdentityPort`,
`AuditSink`), `rotateSessionId(sessionId, reason, deps)`, the session record carrying
`authenticated_at`/`reauthenticated_at`, and `packages/auth`'s wildcard subpath `exports` — so this
ticket's area is importable as `<auth-pkg>/mfa` **without editing any shared file**. Transitively
merged before this ticket: `FND-01` (workspace), `FND-03` (canonical enums/IDs), `FND-06`
(`packages/domain/src/access/**` — the PRD §38.1 role matrix), `DATA-01`…`DATA-04` (PRD §35.4 tables,
`TenantContext` repositories, field encryption). `DATA-07` (`audit_event`) is **not** an ancestor:
security events leave through the injected `AuditSink`, never a direct table write.

**What the PRD fixes, quoted.**

PRD §38.2: *"MFA methods | TOTP and passkey; single-use hashed recovery codes"*;
*"Sensitive-action recent authentication | 10 minutes"*; *"Owner/Admin MFA grace | Must enrol before
protected workspace access after first login"*; and *"rotated session identifier after login/MFA/
privilege change"*.

PRD §16.3: *"Session list/revoke and recent-authentication checks."* and *"TOTP, passkey and
recovery-code lifecycle."*

PRD §21.1: *"MFA for Owner/Admin/internal admins and recent auth for sensitive operations."*

PRD §30.2 **AUTH-004**: *"Owner/Admin/internal admins must enrol MFA"* — primary surface
`/settings/security`, minimum acceptance evidence *"Protected action fails without MFA and recent
auth"*.

PRD §34.9 gives the two wire codes this package's results ultimately produce — `403 MFA_REQUIRED`
("Complete MFA") and `403 RECENT_AUTH_REQUIRED` ("Reauthenticate") — but the mapping is `apps/api`'s
(PRD §45.2: `apps/api` owns *"HTTP auth/admission/DTO mapping"*). This package returns typed reasons;
`RUNT-02`/`IDNT-04` map them.

PRD §31.2 route row: `/settings/security` — *"Sessions/MFA/passkeys"*, all members, *"MFA enrolment
gate when required"*. That screen is `IDNT-08`; the gate *decision* is this ticket.

PRD §41.4 (first paid-pilot onboarding): the Workspace stage exit condition is *"Owner enrols MFA"*,
and the Identity stage is *"Configure email/passkey and optional SAML/OIDC"* — passkey is a
first-class factor from day one, not a post-MVP extra.

**Why the recent-auth assertion is a deliverable in its own right.** Breakdown-plan §5.3 states this
ticket's goal as *"Recent-auth is a callable assertion, not a per-route guess."* PRD §21.1 requires
recent auth for *"sensitive operations"* across MFA changes, SSO enforcement (§38.3 step 5), corpus
promotion (§20.4, ADM-002) and internal admin (§31.2 `/internal/*`). If each route re-derives
"recent", the 10-minute window drifts per surface and no single test can prove AUTH-004.

**Accepted caveats, carried forward explicitly.**

- SMS/voice OTP is **not** a method (PRD §38.2 lists exactly TOTP, passkey, recovery codes). Do not
  add one.
- The internal-admin identity path (PRD §8.11, §38.1 *"separate internal identity only"*) is
  `INTL-01`; it consumes this assertion and MUST NOT define its own.
- Rate limiting of factor verification attempts is `RUNT-02` (PRD §38.5). This ticket returns a
  countable failure result and emits an audit event; it does not throttle.
- The library choice for WebAuthn and TOTP is sub-PRD **OQ2** — resolve it in this ticket and record
  the choice (see *Feedback obligation*); PRD §18.2 names neither.

## Goal

Deliver `packages/auth/src/mfa/**` so that a caller can enrol and verify the three PRD §38.2 factors
— TOTP, passkey (WebAuthn) and single-use hashed recovery codes — decide whether a member must enrol
before protected access, and obtain a **single callable answer** to "is this session recently
authenticated for a sensitive action?" with the §38.2 10-minute window applied in exactly one place.
Completion is mechanically checkable: the exported functions below exist with the stated signatures,
the recent-auth window comes from `SESSION_DEFAULTS.recentAuthWindowSeconds` (not a literal), factor
verification succeeds against recorded standard test vectors, recovery codes are single-use and
hash-only, session rotation happens on MFA completion, and the architecture test from `AUTC-01` still
passes.

## Non-goals

- **No routes and no screens.** `/v1/mfa/*` is `IDNT-04`; `/settings/security` is `IDNT-08`.
- **No tables or migrations.** Factor rows live in `packages/database` (`DATA-04`); this ticket reads
  and writes them only through `AUTC-01`'s `IdentityPort` (extend the port's *type* here if a method
  is missing — see *Feedback obligation* — but never write `packages/database/**`).
- **No session or cookie policy.** `AUTC-01` owns `src/core/**`; call `rotateSessionId`, do not
  reimplement it.
- **No role definitions.** Who counts as Owner/Admin comes from `packages/domain/src/access/**`
  (`FND-06`, PRD §38.1). This ticket consumes the role value; it never lists a role's rights.
- **No SSO step-up.** SSO's own recent-MFA requirement (PRD §38.3 step 5) is enforced by `AUTC-03`
  *calling* this assertion.
- **No internal-admin identity.** `INTL-01` (`22-internal-admin`).
- **No SMS/voice/email OTP factor.** Not in PRD §38.2 — absence is the requirement, not a deferral.
- **No rate limiting or lockout policy.** `RUNT-02` (PRD §38.5).

## File-scope (write-owns)

This ticket owns:

- `packages/auth/src/mfa/**`
- `packages/auth/test/mfa/**` (including its own fakes and recorded vectors under
  `packages/auth/test/mfa/fixtures/**`)
- `packages/auth/package.json` — **append-only**, dependencies block only (breakdown-plan §1.1:
  *"within a module a manifest is append-only shared, and conflicts resolve by re-running the package
  manager"*). Do not reorder or rewrite entries another ticket added; do not change `exports`,
  `name`, `main` or `types` (`AUTC-01`).
- Root `pnpm-lock.yaml` as a regenerated build artifact only (breakdown-plan §4.1).

Does not touch:

- `packages/auth/src/core/**`, `src/index.ts`, `tsconfig.json`, `test/core/**`, `test/support/**` — `AUTC-01`
- `packages/auth/src/sso/**`, `test/sso/**` — `AUTC-03`
- `packages/auth/src/credentials/**`, `test/credentials/**` — `AUTC-04`
- `packages/auth/src/widget/**`, `test/widget/**` — `AUTC-05`
- `packages/database/**` — `01-app-data` (`DATA-04`); `packages/domain/**`, `packages/contracts/**` — `00-foundation`
- `apps/api/**`, `apps/web/**` — `03-app-runtime`, `13-identity-surface`, `22-internal-admin`
- `tests/**` — `23-assurance`

**Serial-safety analysis.** First decomposition — nothing is merged and no in-flight ticket contends
for these paths. The only ticket that has previously written inside `packages/auth/**` is `AUTC-01`
(this ticket's sole `blocked_by`), and it is complete before this one starts. The three siblings that
run **concurrently** with this ticket (plan §7: `AUTC-02` ‖ `AUTC-03` ‖ `AUTC-04`, all blocked only by
`AUTC-01`) write disjoint subdirectories: `src/sso/**`, `src/credentials/**` and their matching
`test/` trees. The single shared file is `packages/auth/package.json`, restricted to appending
distinct dependency entries; `AUTC-01`'s wildcard `exports` pattern means no ticket needs to add an
export key. `/start-all` serialises delivery, so lockfile regenerations land one at a time.

## Deliverables

1. **`src/mfa/types.ts`** — `MfaMethod = 'TOTP' | 'PASSKEY' | 'RECOVERY_CODE'`, `MfaFactor`
   (id, userId, method, label, createdAt, lastUsedAt, confirmedAt), and the typed result union
   (`{ ok: true, factor } | { ok: false, reason: 'MFA_REQUIRED' | 'INVALID_CODE' | 'REPLAYED_CODE' |
   'FACTOR_NOT_FOUND' | 'FACTOR_UNCONFIRMED' | 'ALREADY_USED' }`). If `packages/contracts` (`FND-03`)
   already exports an MFA-method enum, **import it instead of redefining** — PRD §35.1 makes
   `packages/contracts` the generator of controlled values; never maintain two lists.
2. **`src/mfa/totp.ts`** — RFC 6238 TOTP.
   - `enrolTotp({ userId, label }, deps): { factorDraft, secret, otpauthUri }` — secret ≥160 bits from
     `Random`; the plaintext secret and `otpauth://` URI are returned **once** for display and are
     never persisted in clear (persist encrypted through `IdentityPort`, using the `DATA-03` field
     encryption the caller injects).
   - `confirmTotp({ factorId, code }, now, deps)` — enrolment is only complete after one successful
     verification; an unconfirmed factor never satisfies `assertMfaSatisfied`.
   - `verifyTotp({ factorId, code }, now, deps)` — 30-second step, acceptance window ±1 step,
     constant-time comparison, and **replay refusal**: a step already consumed by this factor returns
     `REPLAYED_CODE` (store the last accepted step through `IdentityPort`).
3. **`src/mfa/passkey.ts`** — WebAuthn, verification only (no browser code).
   - `beginPasskeyRegistration({ userId, rpId, origin }, deps)` / `finishPasskeyRegistration(...)`
   - `beginPasskeyAuthentication({ userId, rpId, origin }, deps)` / `finishPasskeyAuthentication(...)`
   - Challenges are ≥128-bit from `Random`, single-use and expire; **origin and RP ID are checked
     against the caller-supplied allowlist** and a mismatch fails (PRD §21.1 *"exact widget
     origins"*, and the same discipline applies here); user-verification flag is required for
     Owner/Admin enrolment; signature-counter regression (`newCounter <= storedCounter` when the
     authenticator reports counters) fails as a cloned-authenticator signal and emits a
     high-severity `AuditSink` event.
4. **`src/mfa/recovery-codes.ts`** — PRD §38.2 *"single-use hashed recovery codes"*.
   - `generateRecoveryCodes({ userId, count = 10 }, deps)` → returns plaintext codes **once**; only
     hashes are handed to `IdentityPort`. Codes are ≥80 bits of entropy each from `Random`.
   - Hashing uses the memory-hard KDF and parameters `AUTC-04` fixes (sub-PRD **OQ4**) — recovery
     codes are lower entropy than machine secrets and MUST use the memory-hard path. Until `AUTC-04`
     merges, use a documented named constant and record it per *Feedback obligation*; do not fork a
     second hashing implementation.
   - `consumeRecoveryCode({ userId, code }, deps)` → single-use **compare-and-set** on the code's
     `used_at`; two concurrent redemptions of one code yield exactly one success.
   - `regenerateRecoveryCodes(...)` invalidates every previous code atomically and emits an audit event.
5. **`src/mfa/enrolment-policy.ts`** — `requiresMfaEnrolment({ role, hasConfirmedFactor, firstLoginCompleted }): boolean`.
   Owner and Admin MUST enrol before protected workspace access after first login (PRD §38.2 grace
   row, §21.1). Role values come from `packages/domain/src/access/**` (`FND-06`); this function must
   not enumerate permissions. Export `MFA_REQUIRED_ROLES` derived from the domain package, not a
   local copy.
6. **`src/mfa/assert.ts` — the single callable assertions.** These are the only recent-auth/MFA
   decisions in the codebase:
   ```ts
   export function assertMfaSatisfied(facts: SessionAuthFacts): AssertResult // { ok } | { ok:false, reason:'MFA_REQUIRED' }
   export function assertRecentAuth(
     facts: SessionAuthFacts,
     now: Date,
     windowSeconds?: number, // defaults to SESSION_DEFAULTS.recentAuthWindowSeconds (PRD §38.2 — 600)
   ): AssertResult            // { ok } | { ok:false, reason:'RECENT_AUTH_REQUIRED' | 'MFA_REQUIRED' }
   ```
   `SessionAuthFacts` is a plain type (`mfaSatisfiedAt`, `reauthenticatedAt`, `authenticatedAt`,
   `role`, `hasConfirmedFactor`). Both are **pure** — no I/O, no route knowledge, no default other
   than the §38.2 constant imported from `<auth-pkg>` core. A caller supplying a `windowSeconds`
   longer than the default is rejected (a longer window is a product change, PRD §45.1 item 5).
7. **`src/mfa/reauthenticate.ts`** — `markReauthenticated({ sessionId, method }, now, deps)`: sets
   `reauthenticatedAt` and, per PRD §38.2 (*"rotated session identifier after login/MFA/privilege
   change"*), calls `AUTC-01`'s `rotateSessionId(sessionId, 'mfa', deps)`. **Ordering constraint:**
   factor verification succeeds → `reauthenticatedAt` is written → session id is rotated → the
   success result is returned. A failure at any step leaves `reauthenticatedAt` unchanged.
8. **`src/mfa/index.ts`** — the area barrel exporting everything above (imported by consumers as
   `<auth-pkg>/mfa`). Every function emits an `AuditSink` event for enrol/confirm/verify-failure/
   recovery-code use/regeneration, carrying no secret material (PRD §22).
9. **Recorded vectors** under `packages/auth/test/mfa/fixtures/**`: the RFC 6238 published TOTP test
   vectors, and captured WebAuthn registration/assertion payloads (valid, wrong-origin, wrong-RP-ID,
   replayed challenge, regressed sign counter). Fixtures are synthetic — no real credential material
   (PRD §45.1 item 6).

## Acceptance checklist (classified)

- [ ] `[machine]` `assertRecentAuth` uses `SESSION_DEFAULTS.recentAuthWindowSeconds` (600 s, PRD
      §38.2) — a grep-style test asserts no numeric literal for the window exists anywhere in
      `src/mfa/**`, and a caller-supplied longer window is rejected (AUTH-004).
- [ ] `[machine]` `assertRecentAuth` returns `RECENT_AUTH_REQUIRED` at 10 min + 1 s and `ok` at
      10 min − 1 s; returns `MFA_REQUIRED` when the session has no satisfied factor (PRD §38.2,
      §34.9 mapping owned by `RUNT-02`).
- [ ] `[machine]` `requiresMfaEnrolment` is true for Owner and Admin without a confirmed factor after
      first login and false once enrolled; role values are read from `packages/domain` and not
      re-declared (AUTH-004, PRD §38.2 grace row, §38.1).
- [ ] `[machine]` An unconfirmed TOTP factor never satisfies `assertMfaSatisfied` (PRD §16.3
      lifecycle).
- [ ] `[machine]` TOTP replay: the same code at the same step returns `REPLAYED_CODE` on the second
      call; a code one step early/late succeeds; two steps away fails (RFC 6238 window ±1).
- [ ] `[machine]` Recovery codes are hash-only (the persisted record contains no substring of any
      plaintext code), single-use under concurrent redemption (exactly one success), and
      `regenerateRecoveryCodes` invalidates every prior code (PRD §38.2).
- [ ] `[machine]` Passkey verification fails on wrong origin, wrong RP ID, replayed/expired challenge
      and regressed signature counter; the counter regression emits a high-severity audit event
      (PRD §21.1).
- [ ] `[machine]` `markReauthenticated` calls `rotateSessionId(..., 'mfa')` and the pre-rotation
      session identifier is invalid immediately afterwards; on verification failure nothing is
      written (PRD §38.2 ordering).
- [ ] `[machine]` No TOTP seed, recovery code, challenge or assertion appears in any `AuditSink`
      event, thrown error or returned object (PRD §22 *"Logs MUST exclude … credentials,
      assertions"*).
- [ ] `[machine]` `AUTC-01`'s architecture test still passes with `src/mfa/**` present: no HTTP
      framework, no SQLite driver, no `packages/database` import (PRD §45.2).
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (PRD §45.3, §20.3).
      No `cargo test --workspace` / `uv run pytest` item — this ticket touches no Rust or Python.
- [ ] `[fixture]` The RFC 6238 published TOTP test vectors replay green against `verifyTotp` at their
      recorded timestamps (`FakeClock`), and every recorded WebAuthn fixture (valid, wrong-origin,
      wrong-RP-ID, replayed challenge, regressed counter) produces its expected outcome — all offline
      from `packages/auth/test/mfa/fixtures/**`.
- [ ] `[human]` PR body carries the PRD §45.4 items: requirement id AUTH-004; UAT linkage (no §41.2
      row targets this package directly — the surface evidence is `IDNT-04`); schema/API/event
      compatibility (none); tenant/PII/security impact; memory/latency impact of the recovery-code
      KDF against the §39.2 320 MiB `app` budget; rollback path; known gaps.
- [ ] `[human]` Sub-PRD **OQ2** (WebAuthn/TOTP library choice) is resolved and written back before
      merge — see *Feedback obligation*.
- [ ] `[human]` Gate 2 smoke linkage, **not required to merge**: MFA enrolment and step-up are
      exercised by a human through `/settings/security` (`IDNT-04`/`IDNT-08`) at the phase Gate 2
      (CLAUDE.md), not against this package.

No further `[human]` criteria — this package has no UI surface. No evaluation-replay `[fixture]`
criteria (PRD §14/§43) and no adapter fixtures (PRD §40.8) — neither class exists in this module.

## Test plan

Harness: the workspace TypeScript unit-test runner from `FND-01`/`FND-02`; tests in
`packages/auth/test/mfa/**`. Copy the construction pattern from `packages/auth/test/core/session.test.ts`
(`AUTC-01`): drive time with `FakeClock`, persistence with a local fake `IdentityPort`, and assert
audit output through a `RecordingAuditSink`. Everything runs offline; no network, no authenticator
hardware, no browser.

1. `pnpm lint && pnpm typecheck && pnpm test` — all green.
2. **Recent-auth window** — `test/mfa/assert.test.ts`: parameterised over
   `now = reauthenticatedAt + {0, 599, 600, 601} s`; assert `ok` / `RECENT_AUTH_REQUIRED` exactly at
   the 600 s boundary; assert `MFA_REQUIRED` when `mfaSatisfiedAt` is absent; assert a 3 600 s
   `windowSeconds` argument is rejected. Add the literal-scan assertion for `src/mfa/**`.
3. **Enrolment policy** — `test/mfa/enrolment-policy.test.ts`: matrix over the five PRD §38.1 roles ×
   `{hasConfirmedFactor, firstLoginCompleted}`; assert Owner/Admin true only in the ungated cell and
   that the role list is imported from `packages/domain`.
4. **TOTP** — `test/mfa/totp.test.ts`: replay the RFC 6238 vectors from
   `test/mfa/fixtures/rfc6238-vectors.json` (`[fixture]`); then window tests at ±1 and ±2 steps;
   then call `verifyTotp` twice with the same code and assert `REPLAYED_CODE`; assert the persisted
   factor record contains no plaintext secret.
5. **Passkey** — `test/mfa/passkey.test.ts`: replay each recorded ceremony fixture and assert the
   expected outcome; assert the challenge is single-use by replaying a consumed one; assert the
   counter-regression case emits a high-severity audit event.
6. **Recovery codes** — `test/mfa/recovery-codes.test.ts`: generate 10, assert only hashes persisted,
   redeem one twice (second fails), redeem two concurrently against the fake's compare-and-set
   (exactly one success), regenerate and assert all prior codes fail.
7. **Reauthentication ordering** — `test/mfa/reauthenticate.test.ts`: assert `rotateSessionId` was
   called with `'mfa'` after a successful verification and not at all after a failed one; assert the
   old session identifier is rejected afterwards.
8. **Secret hygiene** — a shared assertion helper scanning every `RecordingAuditSink` event and every
   thrown error in the suite for the plaintext secrets used in that test.
9. **Boundary** — re-run `packages/auth/test/core/architecture.test.ts` (owned by `AUTC-01`) unchanged.
10. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): the
    compare-and-set on recovery-code redemption; whether the TOTP replay store is per-factor rather
    than global; whether any assertion path can be satisfied by an *unconfirmed* factor; whether
    `assertRecentAuth` can be bypassed by a caller passing its own `windowSeconds`; whether a failed
    verification leaves partial state.

## Feedback obligation

1. **General rule.** If implementation falsifies anything here, update **this ticket**
   (`docs/prd/02-auth-core/tickets/AUTC-02-mfa-totp-passkey-recovery-codes-recent-auth-assertion.md`)
   or `docs/prd/02-auth-core/README.md` first — version +0.1 and a changelog line — then change code.
   Spec changes go through a docs PR and `publish-tickets.mjs --sync` (CLAUDE.md, issue #53).
2. **Foreseeable frictions, each with its exact writeback target.**
   - **WebAuthn/TOTP library selection (sub-PRD OQ2)** → record the pinned choice and its rationale
     in `docs/prd/02-auth-core/README.md` (OQ2 row → resolved, plus a decision row). If the choice is
     a durable dependency trade-off with security consequences (PRD §45.5 *"Architecture decision"*),
     also write `docs/adr/NNNN-<slug>.md` — breakdown-plan **A9** makes `docs/adr/**` shared-additive
     with per-file ownership claimed by the creating ticket; take the next unused number and never
     overwrite an existing file.
   - **`IdentityPort` lacks a method this ticket needs** (e.g. per-factor last-used TOTP step, or
     recovery-code rows) → the *type* lives in `AUTC-01`'s `src/core/ports.ts`, which this ticket must
     not edit. Update `docs/prd/02-auth-core/README.md` decision **D3** with the added port method and
     amend `AUTC-01`'s Deliverable 3 in its ticket file (docs PR + `--sync`) before writing code that
     assumes it.
   - **The underlying table/column does not exist** (`DATA-04` did not model TOTP steps, passkey
     credentials or recovery codes) → do **not** write `packages/database/**`. Update
     `docs/prd/breakdown-plan.md` §5.2 + §6.2 to add the schema ticket in `01-app-data` and the
     `blocked_by` edge onto this ticket — the path breakdown-plan §9 **R4** prescribes — and record
     it in `docs/prd/02-auth-core/README.md` **OQ1**.
   - **The memory-hard KDF for recovery codes cannot fit the §39.2 320 MiB `app` budget** at the
     §38.5 rate ceilings → that is sub-PRD **OQ4**, owned by `AUTC-04`. Record the measurement in
     `docs/prd/02-auth-core/README.md` OQ4 and let `AUTC-04` set the parameters; do not silently
     weaken the KDF here.
   - **A factor cannot be verified without an HTTP-framework or browser dependency** → that falsifies
     sub-PRD decision **D1**. Write it up in `docs/prd/02-auth-core/README.md` (D1 consequences) and,
     if the boundary itself must move, `docs/adr/NNNN-<slug>.md` — before adding the import.
3. **Escalation.** If a decided protocol is outright falsified — e.g. the §38.2 10-minute window
   cannot be applied uniformly, or passkeys cannot be supported at all (PRD §41.4 expects them at
   pilot onboarding) — that overturns a team decision and a release requirement. Stop, write the
   ADR + sub-PRD writeback, and escalate for re-review. Never swap the approach silently inside this
   ticket.
