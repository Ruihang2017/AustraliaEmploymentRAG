---
id: AUTC-03
title: SSO connectors and lifecycle state machine with break-glass
module: 02-auth-core
lane: 02-auth-core
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [AUTC-01]
blocks: [IDNT-05]
---

# AUTC-03 — SSO connectors and lifecycle state machine with break-glass

Implements **PRD §38.3, §16.3 — AUTH-005** (epic `E28-SSO-SECURITY`).
No ADR — the decision is already made in PRD §38.3 (the seven-step SSO lifecycle) and PRD §16.3
(*"SSO cannot be enforced before a successful test"*); this is build ticket **3 of 5** against it.
Parent sub-PRD: [02-auth-core README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [AUTC-01 — Better Auth adapter, session and cookie policy](AUTC-01-better-auth-adapter-session-and-cookie-policy.md).
**Why `builder`:** a bounded change inside one module's declared file-scope
(`packages/auth/src/sso/**`) against a fixed contract — PRD §38.3 already fixes the states,
transitions and guards; nothing here is a new subsystem decision.

## Background + basis

**Context a fresh agent needs.** `AUTC-01` has landed and owns `packages/auth/src/core/**`: injected
ports (`Clock`, `Random`, `SecretsPort`, `IdentityPort`, `AuditSink`), session issue/rotate/revoke
(`rotateSessionId`, `revokeAllSessions`), and the wildcard subpath `exports` that makes this ticket's
area importable as `<auth-pkg>/sso` **without editing any shared file**. Transitively merged:
`FND-01`, `FND-03` (canonical enums — PRD §35.1: *"SQLite checked text values are generated from
`packages/contracts`"*), `FND-06` (role matrix), `DATA-01`…`DATA-04` (PRD §35.4 tables including
`sso_connection`, plus `DATA-03`'s field-level envelope encryption). `AUTC-02` (MFA) runs
**concurrently** with this ticket and is *not* a dependency: the recent-MFA guard at enforcement time
is taken as an **injected assertion function**, not an import of `<auth-pkg>/mfa` (see Deliverable 6).
`DATA-07` (`audit_event`) is not an ancestor — security events leave through `AuditSink`.

**What the PRD fixes, quoted.**

PRD §38.3 (SSO lifecycle), in full, is this ticket's specification:

> 1. Owner/Admin creates `DRAFT` configuration.
> 2. Secrets/metadata are validated and encrypted.
> 3. A test login uses a non-enforced callback and moves to `TESTING`.
> 4. Successful identity/domain/claim mapping records `tested_at` and permits `ACTIVE`.
> 5. Enforcement requires recent MFA, successful test and acknowledgement of the break-glass path.
> 6. Error disables new SSO logins according to safe policy but does not delete configuration or
>    block break-glass access.
> 7. Disabling/replacing SSO revokes relevant sessions when selected and creates an audit/security
>    event.
>
> JIT provisioning is permitted only for verified domains and a controlled default role. SCIM is
> absent; member removal remains manual for MVP.

PRD §16.3: *"SAML/OIDC SSO connection create/test/activate/disable."* and *"SSO connection states:
`DRAFT`, `TESTING`, `ACTIVE`, `ERROR`, `DISABLED`. SSO cannot be enforced before a successful test. A
tightly controlled MFA-protected Owner break-glass account MUST remain available and MUST generate a
high-priority security event when used. SCIM is excluded."*

PRD §38.2 (break-glass row): *"One named Owner path, MFA protected, not SSO-only, high-priority event
on use."*

PRD §35.4 `sso_connection`: required columns *"`id`, `organization_id`, `protocol`, `state`,
encrypted configuration, `tested_at`, `enforced_at`, `row_version`"*; critical constraint
*"enforcement requires successful **current** test"* — the word *current* is what makes
configuration-change invalidation of `tested_at` a requirement, not a nicety (sub-PRD decision **D6**).

PRD §30.2 **AUTH-005**: *"SAML/OIDC is testable before enforcement; break-glass Owner remains"* —
surface `/settings/sso`, minimum acceptance evidence *"Failed IdP test cannot lock out the
organisation"*.

PRD §41.2 `UAT-AUTH-04`: *"Owner enables SSO before test → Action blocked with exact test requirement
and break-glass explanation."*

PRD §31.2 route row `/settings/sso`: Owner/Admin, *"Draft/test/activate"*, empty state *"Cannot
enforce before successful test"*. That screen is `IDNT-09` and its routes are `IDNT-05`; the state
machine underneath is this ticket.

PRD §21.1: *"Encrypted application secrets"*; PRD §39.6 lists the secret groups and requires
*"encrypted/sealed secret injection"* — IdP client secrets and signing material are encrypted with
`DATA-03`'s field encryption, injected as a port, never with a crypto implementation written here.

PRD §42.2: a cross-tenant or security anomaly is delivered immediately; break-glass use is exactly
the kind of *"high-priority"* event §16.3 demands, so it must reach the `AuditSink` with a severity
that the operational alerting in `RLSE-08`/`INTL-*` can key on.

**Accepted caveats, carried forward explicitly.**

- **SCIM is excluded** and member removal stays manual (PRD §16.3, §38.3). Documented, not enforced —
  do not add provisioning sync as a side effect.
- JIT provisioning is allowed **only** for verified domains with a controlled default role
  (PRD §38.3). Domain verification evidence is carried on the connection; this ticket must not
  invent a domain-verification protocol beyond recording the verified state supplied to it — if none
  exists, JIT stays off (fail closed) and the friction is written back.
- SAML-vs-OIDC sequencing is sub-PRD **OQ3** (Founder decides pilot scope, PRD §41.4 *"optional
  SAML/OIDC"*). The state machine is protocol-agnostic and lands regardless.

## Goal

Deliver `packages/auth/src/sso/**` so that an organisation's SAML/OIDC connection can be created,
validated, tested against a non-enforced callback, activated and enforced — with **enforcement
mechanically impossible** before a successful test of the *current* configuration, and with the
break-glass Owner path provably preserved through every transition including `ERROR`. Completion is
mechanically checkable: the five PRD §16.3 states and their allowed transitions exist as data, an
edit to the configuration invalidates `tested_at`, `canEnforce` returns false without a current test
or recent MFA or break-glass acknowledgement, no transition can leave an organisation with zero
break-glass paths, and break-glass use emits a high-priority audit event.

## Non-goals

- **No routes and no screens.** `/v1/sso/*` create/test/activate/disable is `IDNT-05`;
  `/settings/sso` is `IDNT-09`.
- **No tables or migrations.** `sso_connection` is `DATA-04` (PRD §35.4); reads/writes go through
  `AUTC-01`'s `IdentityPort`.
- **No crypto implementation for secret storage.** Use the injected field-encryption port backed by
  `DATA-03` (`packages/database/src/crypto/**`). Signature verification of IdP assertions is in
  scope; envelope encryption of stored secrets is not re-implemented here.
- **No MFA implementation.** `AUTC-02` owns factors and `assertRecentAuth`; this ticket *calls* an
  injected assertion so the two can run concurrently.
- **No session/cookie policy.** `AUTC-01`. Call `revokeAllSessions`/`rotateSessionId`.
- **No SCIM, no directory sync, no group-to-role mapping beyond the single controlled default role**
  — PRD §16.3/§38.3 exclude them.
- **No IdP network calls at test time from this package.** The connector verifies material handed to
  it; fetching IdP metadata over the network is the caller's (`IDNT-05`) concern and is subject to
  the PRD §21.1 allowlist controls. This package stays offline-testable.
- **No internal-admin identity.** `INTL-01`.

## File-scope (write-owns)

This ticket owns:

- `packages/auth/src/sso/**`
- `packages/auth/test/sso/**` (including recorded IdP fixtures under `packages/auth/test/sso/fixtures/**`)
- `packages/auth/package.json` — **append-only**, dependencies block only (breakdown-plan §1.1).
  Do not change `exports`, `name`, `main`, `types` (`AUTC-01`), and do not reorder another ticket's entries.
- Root `pnpm-lock.yaml` as a regenerated build artifact only (breakdown-plan §4.1).

Does not touch:

- `packages/auth/src/core/**`, `src/index.ts`, `tsconfig.json`, `test/core/**`, `test/support/**` — `AUTC-01`
- `packages/auth/src/mfa/**`, `test/mfa/**` — `AUTC-02`
- `packages/auth/src/credentials/**`, `test/credentials/**` — `AUTC-04`
- `packages/auth/src/widget/**`, `test/widget/**` — `AUTC-05`
- `packages/database/**` — `01-app-data`; `packages/domain/**`, `packages/contracts/**` — `00-foundation`
- `apps/api/**`, `apps/web/**` — `03-app-runtime`, `13-identity-surface`
- `tests/**` (security suites) — `23-assurance`

**Serial-safety analysis.** First decomposition — nothing merged, no in-flight contention. The only
prior writer inside `packages/auth/**` is `AUTC-01`, this ticket's sole `blocked_by`, which is
complete before it starts. `AUTC-02` and `AUTC-04` run **concurrently** with this ticket (plan §7:
three lanes) and write `src/mfa/**` and `src/credentials/**` respectively — disjoint. The deliberate
design choice that keeps them disjoint is Deliverable 6: this ticket takes the recent-MFA guard as an
injected function rather than importing `<auth-pkg>/mfa`, so there is no source dependency on a
concurrently-built area. The single shared file is `packages/auth/package.json`, restricted to
appending distinct dependency entries; `/start-all` serialises delivery.

## Deliverables

1. **`src/sso/types.ts`** — `SsoProtocol = 'SAML' | 'OIDC'`, `SsoConnection` (mirroring the PRD §35.4
   columns: `id`, `organizationId`, `protocol`, `state`, encrypted configuration handle, `testedAt`,
   `testedConfigHash`, `enforcedAt`, `rowVersion`), `SsoIdentity` (subject, `emailNormalized`,
   domain, claims), and the typed result union. **Import the SSO state enum from
   `packages/contracts` (`FND-03`)** if it exists — PRD §35.1 generates the SQLite check constraint
   from it; never maintain a second list. If it does not exist, see *Feedback obligation*.
2. **`src/sso/state-machine.ts` — the PRD §16.3 states as data, not `if` chains.** Export
   `SSO_TRANSITIONS`, a table of `{ from, to, guard }` covering exactly:
   - `DRAFT → TESTING` — configuration validated and secrets encrypted (§38.3 steps 1–3)
   - `TESTING → ACTIVE` — `testedAt` present **and** `testedConfigHash` equals the current
     configuration hash (§38.3 step 4, §35.4 "current test")
   - `TESTING → ERROR`, `ACTIVE → ERROR` — safe policy: new SSO logins are refused; configuration is
     **not** deleted and break-glass is **not** blocked (§38.3 step 6)
   - `ERROR → TESTING` — retest allowed; `testedAt`/`testedConfigHash` cleared first
   - `ACTIVE|ERROR|TESTING → DISABLED` — optional session revocation + mandatory audit/security event
     (§38.3 step 7)
   - `DISABLED → DRAFT` — reconfiguration
   Export `applyTransition(connection, to, context, deps)` returning
   `{ ok: true, connection } | { ok: false, reason }`; any transition absent from the table is
   refused with `reason: 'ILLEGAL_TRANSITION'`. `row_version` is checked and incremented on every
   write (PRD §35.4, §34.1 optimistic concurrency).
3. **`src/sso/config.ts` — configuration validation and test invalidation.**
   - `validateSsoConfig(protocol, config)` — required fields per protocol (issuer/entity id, ACS or
     redirect URI, signing certificate or JWKS source, audience, claim mapping), URL scheme HTTPS
     only (PRD §21.1).
   - `hashSsoConfig(config): string` — a stable hash over the security-relevant configuration.
   - `updateSsoConfig(connection, config, deps)` — **MUST clear `testedAt` and `testedConfigHash`**
     and move `ACTIVE`/`TESTING` back to `DRAFT`. This is sub-PRD decision **D6** and PRD §35.4's
     *"successful current test"*: no configuration edit may ride on an earlier success.
   - Secrets are written only through the injected field-encryption port (`DATA-03`), never in clear
     (PRD §38.3 step 2, §21.1, §39.6).
4. **`src/sso/connectors/saml.ts` and `src/sso/connectors/oidc.ts` — verification only.**
   Each exports `verifyAssertion(input, now, deps): { ok: true, identity: SsoIdentity } | { ok: false, reason }`
   enforcing at minimum: signature validity against the configured key material; issuer and audience
   match; `NotBefore`/`NotOnOrAfter` (SAML) or `iat`/`exp`/`nonce` (OIDC) with a bounded clock skew
   constant exported by name; single-use assertion/nonce (replay refused); and claim→identity mapping
   restricted to the configured mapping. Unsigned, wrong-audience, expired, skewed and replayed
   inputs each return their own reason. No network I/O.
5. **`src/sso/test-login.ts` — the non-enforced test callback (§38.3 step 3–4).**
   `runSsoTest({ connectionId, assertion }, now, deps)` verifies through the connector, records
   `testedAt` **and** `testedConfigHash = hashSsoConfig(currentConfig)`, and returns a structured
   report (identity, domain, mapped claims, mapped role). A test login **never** creates a session,
   never provisions a user and never enforces — it only proves mapping.
6. **`src/sso/enforcement.ts` — the AUTH-005 guard.**
   ```ts
   export type EnforcementContext = {
     assertRecentAuth: (now: Date) => { ok: boolean }   // injected — AUTC-02's assertion, not imported
     breakGlassAcknowledged: boolean
     breakGlassPathsAvailable: number
   }
   export function canEnforce(c: SsoConnection, ctx: EnforcementContext, now: Date):
     { ok: true } | { ok: false, reason: 'TEST_REQUIRED' | 'STALE_TEST' | 'NOT_ACTIVE'
                     | 'RECENT_AUTH_REQUIRED' | 'BREAK_GLASS_NOT_ACKNOWLEDGED' | 'NO_BREAK_GLASS_PATH' }
   export function enforce(c: SsoConnection, ctx: EnforcementContext, now: Date, deps): Result
   ```
   `enforce` sets `enforced_at` only when `canEnforce` is `ok`. The three §38.3 step-5 conditions —
   recent MFA, successful current test, break-glass acknowledgement — are each a separate refusal
   reason so `IDNT-05` can render *"the exact test requirement and break-glass explanation"*
   (`UAT-AUTH-04`).
7. **`src/sso/break-glass.ts` — the lockout invariant (§16.3, §38.2).**
   - `assertBreakGlassAvailable(org, deps)` — at least one named Owner path that is MFA-protected and
     **not** SSO-only must exist. Every state transition and every enforcement call runs this check
     **before** writing; a transition that would reduce the count to zero is refused with
     `NO_BREAK_GLASS_PATH`.
   - `recordBreakGlassUse({ actorId, organizationId, reason }, deps)` — emits an `AuditSink` event
     with the **highest severity** the sink defines (PRD §16.3 *"MUST generate a high-priority
     security event when used"*; PRD §42.2 immediate delivery class).
   - An `ERROR` state must never block the break-glass path (§38.3 step 6) — asserted by test.
8. **`src/sso/jit.ts` — JIT provisioning limits (§38.3).**
   `resolveJitProvisioning({ connection, identity }, deps)` →
   `{ provision: true, role } | { provision: false, reason: 'DOMAIN_NOT_VERIFIED' | 'JIT_DISABLED' | 'ROLE_NOT_ALLOWED' }`.
   Permitted **only** for a verified domain and the connection's single controlled default role;
   the default role is validated against `packages/domain`'s role set (`FND-06`) and must not be
   Owner. Fails closed.
9. **`src/sso/disable.ts` — §38.3 step 7.** `disableSso({ connectionId, revokeSessions }, deps)`:
   moves to `DISABLED`, optionally calls `AUTC-01`'s `revokeAllSessions` for members whose current
   session was established through this connection, and **always** emits an audit/security event.
   Ordering: break-glass check → state write (`row_version` guarded) → session revocation → audit
   event; a revocation failure must not leave the connection in a state that implies enforcement.
10. **`src/sso/index.ts`** — the area barrel exporting everything above (consumed as `<auth-pkg>/sso`).
11. **Recorded IdP fixtures** under `packages/auth/test/sso/fixtures/**`: synthetic SAML responses
    and OIDC ID tokens covering valid, unsigned, wrong-signature, wrong-audience, wrong-issuer,
    expired, clock-skewed and replayed cases, plus a metadata document per protocol. Synthetic keys
    only — no real IdP material (PRD §45.1 item 6).

## Acceptance checklist (classified)

- [ ] `[machine]` The five PRD §16.3 states exist and `SSO_TRANSITIONS` allows exactly the listed
      pairs; every other pair returns `ILLEGAL_TRANSITION` — table-driven over all 25 combinations
      (PRD §16.3, §38.3).
- [ ] `[machine]` `canEnforce` returns `TEST_REQUIRED` from `DRAFT`/`TESTING` without `testedAt`, and
      `enforce` refuses — i.e. **enforcement is impossible before a successful test** (AUTH-005,
      PRD §16.3; the surface half is `UAT-AUTH-04`).
- [ ] `[machine]` Editing the configuration clears `testedAt`/`testedConfigHash` and returns the
      connection to `DRAFT`; a subsequent `canEnforce` returns `STALE_TEST`, not `ok`
      (PRD §35.4 *"successful current test"*, sub-PRD D6).
- [ ] `[machine]` `canEnforce` returns `RECENT_AUTH_REQUIRED` when the injected assertion fails and
      `BREAK_GLASS_NOT_ACKNOWLEDGED` when acknowledgement is absent — each condition independently
      (PRD §38.3 step 5).
- [ ] `[machine]` No transition and no enforcement can reduce break-glass paths to zero:
      `NO_BREAK_GLASS_PATH` is returned and **no write occurs** (PRD §16.3, §38.2).
- [ ] `[machine]` From `ERROR`: new SSO logins are refused, the configuration row still exists with
      its encrypted secrets intact, and break-glass remains available — *"Failed IdP test cannot lock
      out the organisation"* (AUTH-005 evidence, PRD §38.3 step 6).
- [ ] `[machine]` `recordBreakGlassUse` emits an audit event at the sink's highest severity, carrying
      actor/organisation/reason and no secret (PRD §16.3, §22).
- [ ] `[machine]` `disableSso` emits an audit/security event in every case and revokes sessions only
      when asked; ordering matches Deliverable 9 (PRD §38.3 step 7).
- [ ] `[machine]` `resolveJitProvisioning` fails closed for unverified domains, for a disabled
      connection and for an Owner default role (PRD §38.3).
- [ ] `[machine]` Concurrent transitions on one connection: the second write fails on `row_version`
      rather than overwriting (PRD §35.4 `row_version`, §34.1).
- [ ] `[machine]` No SSO client secret, private key, raw assertion or ID token appears in any
      `AuditSink` event, thrown error, returned object or test output (PRD §22 *"Logs MUST exclude …
      credentials, assertions"*, §21.1).
- [ ] `[machine]` `AUTC-01`'s architecture test still passes with `src/sso/**` present: no HTTP
      framework, no SQLite driver, no `packages/database` import, **no network call** (PRD §45.2).
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (PRD §45.3, §20.3).
      No `cargo test --workspace` / `uv run pytest` item — this ticket touches no Rust or Python.
- [ ] `[fixture]` Every recorded IdP fixture replays to its expected outcome offline: valid →
      identity; unsigned / wrong-signature / wrong-audience / wrong-issuer / expired / skewed-beyond-
      tolerance / replayed → the matching refusal reason (PRD §38.3 step 4, §21.1).
- [ ] `[human]` PR body carries the PRD §45.4 items: requirement id AUTH-005; UAT id `UAT-AUTH-04`
      (surface evidence via `IDNT-05`); schema/API/event compatibility (none); tenant/security impact
      including the lockout analysis; rollback path; known gaps (SCIM absent, manual member removal).
- [ ] `[human]` Sub-PRD **OQ3** (SAML/OIDC library choice and day-one protocol scope) is resolved and
      written back before merge — see *Feedback obligation*.
- [ ] `[human]` Gate 2 smoke linkage, **not required to merge**: `UAT-AUTH-04` is executed by a human
      against `/settings/sso` (`IDNT-05`/`IDNT-09`) at the phase Gate 2 (CLAUDE.md), not against this
      package.

No further `[human]` criteria — this package has no UI surface. No adapter fixtures (PRD §40.8) and
no evaluation replays (PRD §14/§43) exist in this module.

## Test plan

Harness: the workspace TypeScript unit-test runner from `FND-01`/`FND-02`; tests in
`packages/auth/test/sso/**`, using local fakes plus `AUTC-01`'s `FakeClock`/`RecordingAuditSink`
pattern from `packages/auth/test/core/session.test.ts`. Fully offline — synthetic keys, no IdP, no
network.

1. `pnpm lint && pnpm typecheck && pnpm test` — all green.
2. **Transition matrix** — `test/sso/state-machine.test.ts`: iterate all 5×5 state pairs, assert
   allowed pairs succeed under their guard and every other pair returns `ILLEGAL_TRANSITION`; assert
   `row_version` increments on success and a stale `row_version` fails.
3. **Enforcement guard** — `test/sso/enforcement.test.ts`: one case per refusal reason
   (`NOT_ACTIVE`, `TEST_REQUIRED`, `STALE_TEST`, `RECENT_AUTH_REQUIRED`,
   `BREAK_GLASS_NOT_ACKNOWLEDGED`, `NO_BREAK_GLASS_PATH`) plus the single success case; assert
   `enforced_at` is written only in the success case.
4. **Test staleness** — `test/sso/config.test.ts`: run a successful test, mutate one
   security-relevant configuration field, assert `testedAt`/`testedConfigHash` cleared, state back to
   `DRAFT`, and `canEnforce` → `STALE_TEST`.
5. **Connector fixtures** (`[fixture]`) — `test/sso/connectors.test.ts`: table-driven over
   `test/sso/fixtures/**`; each fixture file declares its expected outcome; assert exact reasons and
   that a replayed assertion/nonce fails on the second use.
6. **Break-glass** — `test/sso/break-glass.test.ts`: (a) attempt to enforce when the only Owner is
   SSO-only → `NO_BREAK_GLASS_PATH` and no write; (b) drive the connection into `ERROR` and assert
   the break-glass path still authenticates and the configuration row is intact; (c) assert
   `recordBreakGlassUse` emits the highest-severity event.
7. **JIT** — `test/sso/jit.test.ts`: unverified domain, disabled JIT, Owner default role → all refuse;
   verified domain + allowed role → provisions with exactly that role.
8. **Disable** — `test/sso/disable.test.ts`: with and without `revokeSessions`; assert the audit event
   fires in both, and assert the ordering by inspecting the fake's call log.
9. **Secret hygiene** — a shared helper scanning every audit event, error and returned object in the
   suite for the synthetic secrets used.
10. **Boundary** — re-run `packages/auth/test/core/architecture.test.ts` (owned by `AUTC-01`) unchanged.
11. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether any
    path reaches `enforced_at` without all three §38.3 step-5 conditions; whether a configuration
    edit can race a test-login completion so a stale hash is recorded; whether `ERROR` can block
    break-glass; whether clock skew tolerance is bounded and named; whether assertion replay
    protection is per-connection and time-bounded.

## Feedback obligation

1. **General rule.** If implementation falsifies anything here, update **this ticket**
   (`docs/prd/02-auth-core/tickets/AUTC-03-sso-connectors-and-lifecycle-state-machine-with-break-glass.md`)
   or `docs/prd/02-auth-core/README.md` first — version +0.1 and a changelog line — then change code.
   Spec changes go through a docs PR and `publish-tickets.mjs --sync` (CLAUDE.md, issue #53).
2. **Foreseeable frictions, each with its exact writeback target.**
   - **SAML/OIDC library selection and day-one protocol scope (sub-PRD OQ3)** → record the pinned
     libraries and the scope decision in `docs/prd/02-auth-core/README.md` (OQ3 → resolved). Because
     this is a durable dependency and security trade-off (PRD §45.5 *"Architecture decision"*), also
     write `docs/adr/NNNN-<slug>.md` — breakdown-plan **A9** makes `docs/adr/**` shared-additive with
     per-file ownership by the creating ticket; take the next unused number, never overwrite. If the
     scope decision is that one protocol ships and the other does not, that is customer-visible
     (PRD §41.4) — it is a **Founder** call, and the writeback must say so.
   - **`packages/contracts` has no SSO state enum** → do **not** define a competing one here. Update
     `docs/prd/breakdown-plan.md` §5.1 + §6.2 to add the enum to `FND-03`'s scope and the
     `blocked_by` edge, and note it in `docs/prd/02-auth-core/README.md`. PRD §35.1 makes
     `packages/contracts` the single generator; two lists would drift into a check-constraint failure.
   - **`sso_connection` lacks `tested_at`, `testedConfigHash` or `row_version`** → do **not** write
     `packages/database/**`. Follow breakdown-plan §9 **R4**: add the schema ticket to
     `01-app-data` in `docs/prd/breakdown-plan.md` §5.2 + §6.2, add the `blocked_by` edge onto this
     ticket, and record it in `docs/prd/02-auth-core/README.md` **OQ1**.
   - **The field-encryption port (`DATA-03`) cannot carry SSO configuration** (size, shape or key
     rotation) → update `docs/prd/02-auth-core/README.md` decision **D3** and raise the schema/crypto
     change through `docs/prd/breakdown-plan.md` §5.2 before storing anything in clear. Storing an
     IdP secret unencrypted is never an acceptable interim state (PRD §21.1, §39.6).
   - **A recent-MFA guard cannot be injected** (e.g. the caller has no access to `AUTC-02`'s
     assertion at that point) → update `docs/prd/02-auth-core/README.md` decision **D5** and this
     ticket's Deliverable 6 before adding a direct `<auth-pkg>/mfa` import, since that import creates
     a source dependency between two concurrently-scheduled tickets and would need a new `blocked_by`
     edge in `docs/prd/breakdown-plan.md` §6.2.
3. **Escalation.** If a decided protocol is outright falsified — enforcement cannot be gated on a
   current test, or the break-glass invariant cannot be maintained — that overturns PRD §16.3's MUST
   and AUTH-005. Stop, write the ADR + sub-PRD writeback, and escalate for re-review. Never ship a
   configuration in which a failed IdP test can lock out an organisation.
