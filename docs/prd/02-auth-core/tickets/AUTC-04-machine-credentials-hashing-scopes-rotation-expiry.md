---
id: AUTC-04
title: "Machine credentials: hashing, scopes, rotation, expiry"
module: 02-auth-core
lane: 02-auth-core
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [AUTC-01]
blocks: [AUTC-05, RUNT-02, IDNT-06]
---

# AUTC-04 — Machine credentials: hashing, scopes, rotation, expiry

Implements **PRD §38.4, §16.3, §21.1 — AUTH-006** (epic `E28-SSO-SECURITY`).
No ADR — the decision is already made in PRD §38.4 (*"Service credentials use a public prefix plus at
least 256 bits of random secret; only a memory-hard/hash verifier is stored."*); this is build ticket
**4 of 5** against it.
Parent sub-PRD: [02-auth-core README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [AUTC-01 — Better Auth adapter, session and cookie policy](AUTC-01-better-auth-adapter-session-and-cookie-policy.md).
**Why `builder`:** a bounded change inside one module's declared file-scope
(`packages/auth/src/credentials/**`) against a fixed contract — PRD §38.4 already fixes the format,
storage and rotation rules; nothing here is a new subsystem decision.

## Background + basis

**Context a fresh agent needs.** `AUTC-01` has landed and owns `packages/auth/src/core/**`: the
injected ports (`Clock`, `Random`, `SecretsPort`, `IdentityPort`, `AuditSink`), the typed-result
convention (this package returns reasons; `apps/api` maps them to PRD §34.9 wire codes), and the
wildcard subpath `exports` that makes this area importable as `<auth-pkg>/credentials` **without
editing any shared file**. Transitively merged: `FND-01`, `FND-03` (canonical enums/IDs), `FND-06`
(role matrix), `DATA-01`…`DATA-04` — including PRD §35.4's `service_account` (*"`id`,
`organization_id`, `name`, `status`, `scopes_json`, `expires_at`, `ip_allowlist_json`,
`budget_limit`, `row_version`"*, constraint *"no Web login"*) and `api_credential` (*"`id`,
`organization_id`, `service_account_id`, `prefix`, `secret_hash`, `created_at`, `expires_at`,
`last_used_at`, `revoked_at`"*, constraint *"full secret displayed once"*). `DATA-07`
(`audit_event`) is **not** an ancestor — credential events leave through `AuditSink`.

This ticket is on the critical path for three consumers: `AUTC-05` (widget sessions are minted only
from a verified credential), `RUNT-02` (the admission chain authenticates machine callers) and
`IDNT-06` (`/v1/service-accounts` routes).

**What the PRD fixes, quoted.**

PRD §38.4: *"Service credentials use a public prefix plus at least 256 bits of random secret; only a
memory-hard/hash verifier is stored. Keys have exact scopes, expiry and optional IP/rate/budget
restrictions. Rotation creates a new key; an optional maximum 24-hour overlap is explicit and
auditable."*

PRD §16.3: *"Service-account and credential create/rotate/revoke."* and the example scope list:
`search:read`, `answers:create`, `records:read`, `records:write`, `coverage:create`, `monitor:read`,
`monitor:write`, `exports:create`, `usage:read`.

PRD §38.2: *"API keys do not use cookies."* PRD §38.1 (role matrix) gives the service-account column
`scoped` for every capability and *"— "* for member/role management, retention configuration and
internal administration: **a credential can never manage members, roles, retention, SSO or internal
admin**. PRD §35.4 `service_account`: *"no Web login"*.

PRD §21.1: *"Encrypted application secrets, hashed API/webhook credentials and rotation/revocation."*

PRD §30.2 **AUTH-006**: *"Service credentials are shown once, hashed, scoped, expiring and
rotatable"* — surface `/developer/service-accounts`, minimum acceptance evidence *"Old key fails
immediately after rotation/revocation"*.

PRD §31.2 route row `/developer/service-accounts`: *"Create/rotate/revoke"*, empty state *"Scope and
one-time-secret warning"* — that screen is `PLTF-07`, the routes are `IDNT-06`; the primitive is this
ticket.

PRD §39.2 constrains the cost of verification: the `app` process has an **initial memory limit of
320 MiB** and bursts to 1 vCPU, and PRD §38.5 sets the traffic it must absorb (10 000 API calls/month
paid pilot, search burst 60/min/organisation, widget session creation up to 120/min/service account).
Every API call verifies a credential, so the hash parameters are a measured decision, not a taste —
sub-PRD **OQ4**.

**The one reconciliation this ticket must carry.** PRD §38.4 permits *"an optional maximum 24-hour
overlap"* on rotation, while AUTH-006's acceptance evidence is *"Old key fails **immediately** after
rotation/revocation"*. Sub-PRD decision **D7** resolves it: overlap is **opt-in, explicitly
requested, bounded at 24 h and audited**; the default is `0` so the AUTH-006 evidence holds by
default. Do not change this reconciliation locally — it is spec.

**Accepted caveats, carried forward explicitly.**

- Rate and budget **enforcement** is not here. PRD §38.4 says keys carry *"optional IP/rate/budget
  restrictions"*; this ticket stores and exposes them, and `RUNT-02` (with `FND-09`'s budget rules)
  enforces them (PRD §38.5).
- The scope list in PRD §16.3 is introduced as *"Example service scopes"* — treat it as the initial
  allowlist, not a closed product enum, and never as an invitation to invent scopes for capabilities
  the role matrix denies service accounts (§38.1).
- Webhook signing secrets are a different credential class (PRD §16.1 *"Webhooks carry their own
  schema version"*, §35.6 `alert_delivery`) owned by `16-monitor-alerts` (`WTCH-05`). Do not
  generalise this module's format to cover them.

## Goal

Deliver `packages/auth/src/credentials/**` so that a service-account credential can be generated
(public prefix + ≥256-bit CSPRNG secret, displayed exactly once), stored **verifier-only**,
authenticated on a request with a constant-time comparison and no existence oracle, checked against
exact scopes, expiry and an optional IP allowlist, and rotated or revoked such that the old secret
fails at the very next verification unless an explicit, bounded, audited overlap was requested.
Completion is mechanically checkable: the exported functions below exist with the stated signatures,
no plaintext secret is ever handed to `IdentityPort`, the hash parameters are pinned in one named
constant with a recorded benchmark against the PRD §39.2 320 MiB `app` budget, and the rotation
matrix passes.

## Non-goals

- **No routes and no screens.** `/v1/service-accounts` and credential endpoints are `IDNT-06`;
  `/developer/service-accounts` is `PLTF-07`.
- **No tables or migrations.** `service_account` and `api_credential` are `DATA-04` (PRD §35.4);
  access goes through `AUTC-01`'s `IdentityPort`.
- **No rate limiting, quota or budget arithmetic.** `RUNT-02` + `FND-09` (PRD §38.5, §24.4). This
  ticket carries `budget_limit` and `ip_allowlist_json` values; it never decides admission.
- **No permission matrix.** `packages/domain/src/access/**` (`FND-06`, PRD §38.1). Scope checking
  here is *credential capability*; membership/role permission remains a separate check in `RUNT-02`.
- **No widget tokens.** `AUTC-05` — it consumes this ticket's verified-credential result.
- **No webhook signing secrets.** `WTCH-05` (`16-monitor-alerts`).
- **No cookie or session path.** PRD §38.2: *"API keys do not use cookies."* A credential must never
  produce a browser session.
- **No BYOK provider keys.** PRD §16.4 BYOK credentials are `packages/model-gateway` (`EVID-*`,
  `12-evidence-safety`).

## File-scope (write-owns)

This ticket owns:

- `packages/auth/src/credentials/**`
- `packages/auth/test/credentials/**` (including recorded vectors under
  `packages/auth/test/credentials/fixtures/**`)
- `packages/auth/package.json` — **append-only**, dependencies block only (breakdown-plan §1.1).
  Do not change `exports`, `name`, `main`, `types` (`AUTC-01`) or reorder another ticket's entries.
- Root `pnpm-lock.yaml` as a regenerated build artifact only (breakdown-plan §4.1).

Does not touch:

- `packages/auth/src/core/**`, `src/index.ts`, `tsconfig.json`, `test/core/**`, `test/support/**` — `AUTC-01`
- `packages/auth/src/mfa/**`, `test/mfa/**` — `AUTC-02`
- `packages/auth/src/sso/**`, `test/sso/**` — `AUTC-03`
- `packages/auth/src/widget/**`, `test/widget/**` — `AUTC-05`
- `packages/database/**` — `01-app-data`; `packages/domain/**`, `packages/contracts/**` — `00-foundation`
- `apps/api/**`, `apps/web/**` — `03-app-runtime`, `13-identity-surface`, `20-developer-platform`
- `tests/**` (security suites) — `23-assurance`

**Serial-safety analysis.** First decomposition — nothing merged, no in-flight contention. The only
prior writer inside `packages/auth/**` is `AUTC-01`, this ticket's sole `blocked_by`, complete before
this one starts. `AUTC-02` (`src/mfa/**`) and `AUTC-03` (`src/sso/**`) run **concurrently** with this
ticket (plan §7: three lanes) and write disjoint subdirectories; `AUTC-05` is `blocked_by` this
ticket and therefore never concurrent with it. The single shared file is `packages/auth/package.json`,
restricted to appending distinct dependency entries — the KDF library is the likely addition here;
`/start-all` serialises delivery so the lockfile regeneration lands alone.

## Deliverables

1. **`src/credentials/types.ts`** — `ServiceAccount`, `ApiCredential` (mirroring the PRD §35.4
   columns), `CredentialScope`, `VerifiedCredential` (`{ credentialId, serviceAccountId,
   organizationId, scopes, budgetLimit }`) and the typed failure union
   (`'UNKNOWN_PREFIX' | 'BAD_SECRET' | 'EXPIRED' | 'REVOKED' | 'ACCOUNT_DISABLED' | 'IP_NOT_ALLOWED' | 'MALFORMED'`).
2. **`src/credentials/format.ts` — the PRD §38.4 wire format.**
   - `generateCredential({ serviceAccountId, expiresAt }, deps): { row, display }` where `display` is
     the plaintext credential string returned **exactly once** and `row` contains only `prefix` and
     `secret_hash`.
   - The secret is **≥256 bits** from the `Random` CSPRNG port; the prefix is a short public
     identifier stored in clear and used for the lookup (PRD §35.4 `api_credential.prefix`). Export
     `CREDENTIAL_SECRET_BITS = 256 as const` and the prefix/format grammar as named constants, plus
     `parseCredential(presented): { prefix, secret } | null` that never throws on malformed input.
   - The display string must be recognisable in secret scanners (a fixed, greppable prefix shape) —
     PRD §20.3 requires *"Dependency, secret, container and artifact scans"* in CI.
3. **`src/credentials/verifier.ts` — verifier-only storage (PRD §38.4, §21.1).**
   - `CREDENTIAL_HASH_PARAMS` — one exported, frozen, documented constant carrying the algorithm and
     every parameter. **This is the artifact sub-PRD OQ4 resolves**, and the choice must be recorded
     with its measurement (see *Feedback obligation*), constrained by the §39.2 320 MiB `app` limit
     under §38.5 traffic. Rule that constrains the choice: high-entropy (≥256-bit random) secrets MAY
     use a fast cryptographic hash — PRD §38.4 says *"memory-hard/hash verifier"* — while
     **low-entropy** secrets (recovery codes in `AUTC-02`, email/invitation tokens in `AUTC-01`) MUST
     use the memory-hard path. Export both parameter sets from here so the module has exactly one
     definition of each.
   - `hashSecret(secret): string` and `verifySecret(secret, storedHash): boolean` — constant-time,
     never logging or returning the secret, and safe against a malformed stored hash.
4. **`src/credentials/scopes.ts` — exact scopes (PRD §38.4 *"exact scopes"*).**
   - `SCOPE_ALLOWLIST` — the nine PRD §16.3 values, verbatim. **If `packages/contracts` (`FND-03`)
     already exports a scope enum, import it and delete the local list** — PRD §35.1 makes
     `packages/contracts` the generator of controlled values; never maintain two.
   - `parseScopes(json)`, `assertScope(granted: string[], required: string): boolean` — **exact match
     only; no wildcards, no prefix expansion, no implication** (`records:write` does not grant
     `records:read`). A scope outside the allowlist is rejected at creation time.
   - Export `FORBIDDEN_FOR_SERVICE_ACCOUNTS` documenting, with the §38.1 citation, that member/role
     management, retention/closure configuration, SSO configuration and internal administration are
     never expressible as scopes.
5. **`src/credentials/restrictions.ts`** — `isExpired(credential, now)`,
   `isIpAllowed(ip, allowlistJson)` (exact IP and CIDR, IPv4 and IPv6; an empty/absent allowlist
   means unrestricted; a malformed entry fails closed), and pass-through carriers for
   `budget_limit`/rate hints consumed by `RUNT-02`. No enforcement decisions.
6. **`src/credentials/authenticate.ts` — the single verification entry point.**
   ```ts
   export function authenticateCredential(
     presented: string,
     ctx: { ip?: string; now: Date },
     deps: CredentialDeps,
   ): { ok: true; credential: VerifiedCredential } | { ok: false; reason: CredentialFailure }
   ```
   Order of operations, fixed: `parseCredential` → prefix lookup → `verifySecret` → account status →
   expiry → revocation → IP allowlist. Requirements: the work performed is **the same shape for an
   unknown prefix and a bad secret** (no timing or response oracle for credential existence); the
   caller receives a reason for logging but `RUNT-02` maps every failure to one opaque 401; a
   successful verification updates `last_used_at` through `IdentityPort` (best-effort, never blocking
   the result); every failure emits an `AuditSink` event carrying the prefix and reason but **never**
   the secret. This function must not consult cookies (PRD §38.2).
7. **`src/credentials/rotation.ts` — rotation and revocation (PRD §38.4, sub-PRD D7).**
   ```ts
   export const CREDENTIAL_OVERLAP_MAX_SECONDS = 86_400 as const // PRD §38.4 — maximum 24 hours
   export function rotateCredential(
     input: { credentialId: string; overlapSeconds?: number /* default 0 */; reason: string },
     now: Date, deps: CredentialDeps,
   ): { ok: true; created: { row; display }; previousExpiresAt: Date } | { ok: false; reason }
   export function revokeCredential(input: { credentialId: string; reason: string }, now: Date, deps): Result
   ```
   - Default `overlapSeconds = 0` → the previous credential is revoked in the same operation, so
     *"Old key fails immediately after rotation/revocation"* (AUTH-006) holds by default.
   - `overlapSeconds > CREDENTIAL_OVERLAP_MAX_SECONDS` is **rejected**; any non-zero overlap emits an
     `AuditSink` event recording the requested window and the reason (PRD §38.4 *"explicit and
     auditable"*).
   - Ordering: create the new credential → set the previous credential's `revoked_at` (now, or
     `now + overlapSeconds`) → emit the audit event → return. A failure after creation must not leave
     both credentials live indefinitely.
   - Revocation and expiry take effect at the **next verification** with no caching layer inside this
     package; if a consumer adds a cache, that is a `RUNT-02` decision and must respect this rule.
8. **`src/credentials/index.ts`** — the area barrel (consumed as `<auth-pkg>/credentials`), exporting
   everything above plus `CREDENTIAL_HASH_PARAMS` and `CREDENTIAL_OVERLAP_MAX_SECONDS`.
9. **A recorded benchmark for the hash parameters**, checked in under
   `packages/auth/test/credentials/fixtures/` as a small report (algorithm, parameters, measured
   time and peak memory per verification, machine description) plus the test that asserts the pinned
   parameters are the ones measured. Basis: PRD §39.2 memory budget, §38.5 rate ceilings, §1
   *"Benchmark-selected"*, §45.4 *"model/token/cost, memory/disk and latency impact where
   applicable"*.

## Acceptance checklist (classified)

- [ ] `[machine]` Generated secrets carry **≥256 bits** of CSPRNG entropy and the display string is
      returned exactly once; a statistical test over many generations finds no repeats and the
      declared length (PRD §38.4).
- [ ] `[machine]` Only `prefix` and `secret_hash` reach `IdentityPort`: the persisted record contains
      no substring of the plaintext secret, and `secret_hash` is not the plaintext under any encoding
      (PRD §38.4 *"only a memory-hard/hash verifier is stored"*, §35.4 *"full secret displayed once"*).
- [ ] `[machine]` `verifySecret` is constant-time over equal-length inputs and returns false for a
      malformed stored hash without throwing (PRD §21.1).
- [ ] `[machine]` `authenticateCredential` returns each of `UNKNOWN_PREFIX`, `BAD_SECRET`, `EXPIRED`,
      `REVOKED`, `ACCOUNT_DISABLED`, `IP_NOT_ALLOWED`, `MALFORMED` in its own case, and the unknown-
      prefix and bad-secret paths perform the same verification work (no existence oracle)
      (PRD §21.1, §16.5 *"Other-tenant and absent opaque IDs return the same not-found response"*).
- [ ] `[machine]` `assertScope` is exact-match only: `records:write` does not satisfy `records:read`,
      no wildcard is honoured, and a scope outside `SCOPE_ALLOWLIST` is rejected at creation
      (PRD §38.4 *"exact scopes"*, §16.3).
- [ ] `[machine]` No scope exists for member/role management, retention configuration, SSO or
      internal administration — asserted against `SCOPE_ALLOWLIST` (PRD §38.1 service-account column).
- [ ] `[machine]` **AUTH-006 evidence**: after `rotateCredential()` with the default overlap, the old
      secret fails at the next `authenticateCredential` call and the new one succeeds; after
      `revokeCredential`, the secret fails immediately (PRD §30.2 AUTH-006).
- [ ] `[machine]` A non-zero overlap is honoured up to `CREDENTIAL_OVERLAP_MAX_SECONDS`, rejected
      above it, and always emits an audit event naming the window and reason (PRD §38.4 *"explicit
      and auditable"*, sub-PRD D7).
- [ ] `[machine]` Expiry: a credential past `expires_at` fails; `isIpAllowed` accepts exact IPv4/IPv6
      and CIDR entries, treats an empty allowlist as unrestricted and a malformed entry as denied
      (PRD §38.4).
- [ ] `[machine]` `last_used_at` is updated on success and never on failure; a failing update does not
      change the authentication result (PRD §35.4).
- [ ] `[machine]` No plaintext secret appears in any `AuditSink` event, thrown error, returned object
      or test output (PRD §22, §21.1).
- [ ] `[machine]` No cookie is read or written anywhere in `src/credentials/**` (PRD §38.2 *"API keys
      do not use cookies"*).
- [ ] `[machine]` `AUTC-01`'s architecture test still passes with `src/credentials/**` present
      (PRD §45.2).
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (PRD §45.3, §20.3).
      No `cargo test --workspace` / `uv run pytest` item — this ticket touches no Rust or Python.
- [ ] `[fixture]` Recorded credential vectors replay offline: a fixed set of `(prefix, secret,
      stored_hash)` triples verifies true, tampered variants verify false, and a recorded rotation
      timeline fixture (`t0` create, `t1` rotate with 24 h overlap, `t2` mid-overlap, `t3` after
      overlap) produces the expected accept/reject at each timestamp under `FakeClock`.
- [ ] `[fixture]` The checked-in hash benchmark (Deliverable 9) replays: the pinned
      `CREDENTIAL_HASH_PARAMS` equal the measured parameters, and the recorded peak memory per
      verification fits the PRD §39.2 320 MiB `app` budget at the PRD §38.5 rate ceilings.
- [ ] `[human]` PR body carries the PRD §45.4 items: requirement id AUTH-006; UAT linkage (no §41.2
      row targets this package directly — surface evidence is `IDNT-06`/`PLTF-07`); schema/API/event
      compatibility (none); tenant/security impact; **memory/latency impact of the chosen KDF against
      §39.2**; rollback path; known gaps.
- [ ] `[human]` Sub-PRD **OQ4** (hash/KDF choice and parameters per secret class) is resolved,
      benchmarked and written back before merge — see *Feedback obligation*. This unblocks the
      interim constants used by `AUTC-01` and `AUTC-02`.
- [ ] `[human]` Gate 2 smoke linkage, **not required to merge**: rotation/revocation is exercised by a
      human through `/developer/service-accounts` (`IDNT-06`/`PLTF-07`) at the phase Gate 2
      (CLAUDE.md), not against this package.

No further `[human]` criteria — this package has no UI surface. No adapter fixtures (PRD §40.8) and
no evaluation replays (PRD §14/§43) exist in this module.

## Test plan

Harness: the workspace TypeScript unit-test runner from `FND-01`/`FND-02`; tests in
`packages/auth/test/credentials/**`, copying the fake-port + `FakeClock` construction pattern from
`packages/auth/test/core/session.test.ts` (`AUTC-01`). Fully offline.

1. `pnpm lint && pnpm typecheck && pnpm test` — all green.
2. **Format** — `test/credentials/format.test.ts`: assert `CREDENTIAL_SECRET_BITS >= 256`; generate
   10 000 credentials against a real CSPRNG and assert no duplicate prefix+secret and the declared
   encoded length; assert `parseCredential` returns `null` (never throws) for empty, truncated,
   over-long and non-ASCII input.
3. **Verifier** — `test/credentials/verifier.test.ts`: replay the recorded `(prefix, secret,
   stored_hash)` vectors (`[fixture]`); assert tampered secrets fail; assert `verifySecret` does not
   throw on a corrupt stored hash; measure and assert constant-time behaviour over equal-length
   inputs with the repo's timing-safe comparison helper.
4. **Authenticate matrix** — `test/credentials/authenticate.test.ts`: one case per failure reason plus
   success; assert the fake `IdentityPort` recorded the same lookup+hash work for `UNKNOWN_PREFIX`
   and `BAD_SECRET`; assert `last_used_at` updated only on success; assert no cookie access.
5. **Scopes** — `test/credentials/scopes.test.ts`: table over the nine §16.3 scopes plus
   `records:*`, `RECORDS:READ`, `records:read ` (trailing space) and an unknown scope — all rejected;
   assert `SCOPE_ALLOWLIST` contains none of the §38.1-forbidden capabilities.
6. **Rotation** (`[fixture]` timeline) — `test/credentials/rotation.test.ts`: drive `FakeClock`
   through the recorded `t0…t3` timeline for `overlapSeconds = 0` and `= 86 400`; assert accept/reject
   at each point; assert `overlapSeconds = 86 401` is rejected; assert the audit event content for a
   non-zero overlap.
7. **Restrictions** — `test/credentials/restrictions.test.ts`: IPv4/IPv6 exact and CIDR, empty
   allowlist, malformed entry (denied), expiry boundary at `expires_at ± 1 s`.
8. **Benchmark replay** (`[fixture]`) — `test/credentials/hash-benchmark.test.ts`: assert the pinned
   `CREDENTIAL_HASH_PARAMS` match the checked-in report and that the report's peak memory fits the
   §39.2 `app` budget; the measurement itself is run once by the Builder and recorded, so the test is
   an assertion over recorded data and not a timing-sensitive CI gate.
9. **Secret hygiene** — a shared helper scanning every audit event, error and returned object in the
   suite for the plaintext secrets used in that test.
10. **Boundary** — re-run `packages/auth/test/core/architecture.test.ts` (owned by `AUTC-01`) unchanged.
11. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether the
    unknown-prefix path is distinguishable from bad-secret by timing or by any returned field that
    reaches the wire; whether a rotation racing an in-flight verification can accept a revoked
    secret; whether `overlapSeconds` can exceed 24 h through arithmetic overflow or a negative value;
    whether the KDF parameters could exhaust the 320 MiB `app` budget at the §38.5 burst ceiling.

## Feedback obligation

1. **General rule.** If implementation falsifies anything here, update **this ticket**
   (`docs/prd/02-auth-core/tickets/AUTC-04-machine-credentials-hashing-scopes-rotation-expiry.md`)
   or `docs/prd/02-auth-core/README.md` first — version +0.1 and a changelog line — then change code.
   Spec changes go through a docs PR and `publish-tickets.mjs --sync` (CLAUDE.md, issue #53).
2. **Foreseeable frictions, each with its exact writeback target.**
   - **Hash/KDF choice and parameters (sub-PRD OQ4)** → record the decision, the measurement and the
     per-secret-class rule in `docs/prd/02-auth-core/README.md` (OQ4 → resolved, plus a decision
     row), and — because it is a durable security/dependency trade-off with a memory-budget
     consequence (PRD §45.5 *"Architecture decision"* and *"Benchmark-selected configuration"*) —
     write `docs/adr/NNNN-<slug>.md`; breakdown-plan **A9** makes `docs/adr/**` shared-additive with
     per-file ownership by the creating ticket, so take the next unused number and never overwrite.
     `AUTC-01` and `AUTC-02` consume the low-entropy parameters, so the writeback is what unblocks
     their interim constants.
   - **The parameters cannot fit the §39.2 320 MiB `app` budget at §38.5 traffic** → this is a
     PRD-level tension (§38.4 vs §39.2), not a local tuning choice. Record the measurement in
     `docs/prd/02-auth-core/README.md` OQ4 **and** raise it in `docs/prd/breakdown-plan.md` §8 as a
     new open question with `18-ops-release` (`RLSE-11`, the 2 GB benchmark) named, before weakening
     the verifier.
   - **`packages/contracts` already defines (or should define) the scope enum** → import it and
     delete the local list; if it does not exist, update `docs/prd/breakdown-plan.md` §5.1 + §6.2 to
     put it in `FND-03` and add the `blocked_by` edge, then note it in
     `docs/prd/02-auth-core/README.md`. PRD §35.1 forbids a second list.
   - **`api_credential`/`service_account` lack a column this ticket needs** (e.g. a rotation link or
     an overlap marker) → do **not** write `packages/database/**`. Follow breakdown-plan §9 **R4**:
     add the schema ticket to `01-app-data` in `docs/prd/breakdown-plan.md` §5.2 + §6.2 with the
     `blocked_by` edge onto this ticket, and record it in `docs/prd/02-auth-core/README.md` **OQ1**.
   - **A consumer wants a scope that PRD §38.1 denies service accounts** (member management,
     retention, SSO, internal admin) → refuse. That is a **product change** requiring Founder
     approval and a PRD update (PRD §45.5); record the request in
     `docs/prd/02-auth-core/README.md` open questions and escalate. Never add the scope locally.
3. **Escalation.** If a decided protocol is outright falsified — verifier-only storage cannot be
   maintained, or immediate revocation cannot be guaranteed at the next verification — that overturns
   PRD §38.4 and AUTH-006. Stop, write the ADR + sub-PRD writeback, and escalate for re-review. Never
   store a recoverable secret or cache a revoked credential silently.
