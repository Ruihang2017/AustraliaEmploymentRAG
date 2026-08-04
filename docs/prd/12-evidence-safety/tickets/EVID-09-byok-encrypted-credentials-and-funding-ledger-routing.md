---
id: EVID-09
title: "BYOK encrypted credentials and funding-ledger routing"
module: 12-evidence-safety
lane: 12-evidence-safety
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [EVID-08, DATA-03]
blocks: []
---

# EVID-09 — BYOK encrypted credentials and funding-ledger routing

Implements PRD §16.4, §24.4 and §42.6 — contributes to requirements **OPS-003** and **ANS-007**; epic
`E20-MODEL-GATEWAY`.
No ADR — the decision is already made in PRD §16.4 (keys decrypt only inside the Model Gateway;
arbitrary base URLs are prohibited; BYOK changes who pays and nothing else); this is build ticket 9 of
10 against it.
Parent sub-PRD: [12-evidence-safety README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [EVID-08 — Budget reservation/settlement and hard circuit breaker](EVID-08-budget-reservation-settlement-and-hard-circuit-breaker.md), [DATA-03 — Field-level envelope encryption for customer text](../../01-app-data/tickets/DATA-03-field-level-envelope-encryption-for-customer-text.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
`DATA-03` supplies envelope encryption and `EVID-08` the ledger routing; this confines a customer
provider key to the gateway process boundary.

## Background + basis

**PRD §16.4 BYOK, quoted verbatim** — the whole requirement, because every sentence is load-bearing:

> Owner/Admin MAY configure an encrypted credential **only for integrated provider/model profiles**.
> **Keys are displayed only on entry, decrypted only inside the Model Gateway and excluded from
> logs/exports/support. Arbitrary base URLs are prohibited.** BYOK changes who pays and whose provider
> contract governs retention; **it does not bypass model allowlists, evidence, validation, safety, abuse
> or rate limits.** Platform-funded fallback requires explicit opt-in and remains under the global hard
> budget.

**PRD §24.4 funding ledgers, quoted verbatim:**

> - `FOUNDER_PLATFORM_BUDGET`: trial/internal usage.
> - `CUSTOMER_PREPAID_OR_BYOK`: customer-funded variable model cost.
>
> **Customer variable cost MUST be prepaid or BYOK; the system MUST NOT create unsecured founder
> liability.**

**PRD §42.6:** *"Paid pilot variable use draws `CUSTOMER_PREPAID_OR_BYOK`. **BYOK still records
estimated usage/cost for visibility but does not debit founder funds.**"*

**PRD §39.6 configuration and secrets** lists *"model-provider/platform keys"* among the minimum secret
groups and fixes the layering: *"committed safe defaults → environment-specific non-secret config →
encrypted/sealed secret injection → internal feature flag"*. **PRD §21.1:** *"Encrypted application
secrets, hashed API/webhook credentials and rotation/revocation."* **PRD §10.3:** organisation closure
is *"export followed by deletion within 30 days"* — a stored credential is customer data and follows
that lifecycle. **PRD §8.9:** exports must exclude *"Hidden prompts/reasoning, **secrets** and internal
licensing notes"*.

**What is already built.** `DATA-03` owns field-level envelope encryption for customer text with a
rotatable key path (`packages/database/src/crypto/**`, PRD §35.1, §23.1, §39.6). `EVID-08` owns
reservation, settlement, ledger routing and `FND-09`'s `recordByokEstimate` (a founder debit of exactly
zero). `EVID-07` owns the profile registry, the provider allowlist and the fact that **no arbitrary
base URL configuration key exists in the package at all**.

**Sub-PRD decision carried forward: D19** — BYOK changes who pays and nothing else: no base URL, no
model, no retention posture, no limit and no safety control moves because a customer supplied a key.

**Accepted caveats carried forward:**

- **No ticket in breakdown plan §5 owns a BYOK configuration route or `/settings` screen.** PRD §16.4
  gives Owner/Admin the capability, but §5's ticket inventory has no endpoint for it. This ticket owns
  the **gateway-side** key handling only and records sub-PRD **Q-EVID-7**; creating the route is a plan
  change (`docs/prd/breakdown-plan.md` §5), never a route added from this module.
- **"Displayed only on entry" is a route/UI obligation.** This ticket makes it *possible* by never
  returning plaintext from any function, and exposes only a non-reversible display hint (provider,
  last-four, created/rotated timestamps).
- **Platform-funded fallback requires explicit opt-in** (PRD §16.4) and stays under the global hard
  budget. This ticket models the opt-in flag and routes such a call back through `EVID-08`'s founder
  breaker; it never creates a founder-funded call implicitly.

## Goal

Produce `packages/model-gateway/src/byok/**`: customer provider credentials stored through `DATA-03`'s
envelope encryption, decrypted only at call time inside the gateway and zeroed after; a display hint
that is never reversible; provider/profile binding restricted to `EVID-07`'s allowlist with no base-URL
surface; funding-ledger routing to `CUSTOMER_PREPAID_OR_BYOK` with a founder debit of exactly zero; and
an explicit opt-in path for platform-funded fallback that remains under the global hard budget.
Completion is mechanically checkable: a canary key never appears in any log, metric, error, export or
repository call other than its ciphertext; no function returns plaintext; and a property test proves
founder liability never increases on a BYOK path.

## Non-goals

- **No BYOK configuration route, settings screen or key-entry UI** — no ticket in breakdown plan §5
  owns one (sub-PRD **Q-EVID-7**). Creating it is a plan change; this ticket must not add a route,
  handler or screen.
- **No encryption primitive, key derivation, envelope format or key rotation mechanism** — `01-app-data`
  (`DATA-03`, merged; this ticket's blocker). Consumed, never re-implemented.
- **No credential *table*** — `01-app-data` (`DATA-04` tenancy/identity, `DATA-07` operations). This
  ticket writes through the injected TenantContext repository port and owns no schema or migration.
- **No budget arithmetic, breaker state, reservation minting or settlement** — `EVID-08` (merged).
  This ticket selects the ledger; `EVID-08` moves the money.
- **No provider adapter, profile registry, base-URL allowlist or schema enforcement** — `EVID-07`
  (merged). This ticket supplies a credential to an adapter that already exists and is already
  constrained.
- **No service-account or API credential hashing, scopes, rotation or revocation** — `02-auth-core`
  (`AUTC-04`). Those are *inbound* platform credentials; this is an *outbound* provider credential and
  they must not share a store or a code path.
- **No cost console, BYOK spend view or operator key management** — `22-internal-admin` (`INTL-07`).
- **No support tooling** — PRD §16.4 excludes keys from support by construction here; there is nothing
  to build.

## File-scope (write-owns)

Owned by this ticket:

- `packages/model-gateway/src/byok/**`
- `packages/model-gateway/test/byok/**` (sub-PRD **D21**)
- `packages/model-gateway/package.json`, `packages/model-gateway/src/index.ts` — **append-only**, own
  entries only

Does not touch:

- `packages/model-gateway/src/{profiles,providers,schema}/**` — `EVID-07` (merged); `src/budget/**` —
  `EVID-08` (merged).
- `packages/pii/**` — `EVID-01`…`EVID-03`; `packages/citations/**` — `EVID-04`…`EVID-06`, `EVID-10`.
- `packages/database/**` — `01-app-data`; `DATA-03`'s crypto and the TenantContext repository are
  **consumed**, and this ticket writes no schema, migration or SQL. `packages/auth/**` —
  `02-auth-core`. `packages/domain/**`, `packages/contracts/**` — `00-foundation` (PRD §44.3
  serial-owned). `packages/observability/**` — `03-app-runtime`.
- `apps/**` (including any settings route or screen), `services/**`, `pipelines/**`, `infra/**`,
  `tests/**`, `evals/**`, `docs/adr/**` — other modules per breakdown plan §4 and A9. `docs/PRD.md` —
  frozen.
- Root manifests and lockfiles — `FND-01`.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header). `packages/model-gateway/src/byok/**` is written by no other ticket in the plan (plan
§5.13). This is a wave-3 ticket; its concurrent siblings are `EVID-03` (`packages/pii/**`), `EVID-06`
and `EVID-10` (`packages/citations/**`) — different packages, disjoint trees, no shared file. Both
intra-package neighbours (`EVID-07`, `EVID-08`) are transitive blockers and merged first, as is
`DATA-03` (`01-app-data` wave 2). This ticket has **no dependents** in plan §6.2, so nothing waits on
it. Shared append-only files: this package's manifest and `src/index.ts`.

## Deliverables

1. **`src/byok/types.ts` — a credential type that cannot leak.** `StoredByokCredential` carries
   `{ credentialId, organizationId, providerId, ciphertext, keyVersion, lastFour, createdAt, rotatedAt,
   status }` and **no** plaintext member. `ByokDisplayHint` — the only shape any caller outside this
   module receives — carries `{ credentialId, providerId, lastFour, createdAt, rotatedAt, status }` and
   nothing derived from the secret beyond `lastFour`. A type-level test proves neither type has a
   `key`, `secret`, `plaintext`, `token`, `apiKey` or `value` member, and that no exported function
   returns one. Basis: PRD §16.4 (*"Keys are displayed only on entry … excluded from
   logs/exports/support"*).
2. **Storage through `DATA-03`.** `storeCredential(organizationId, providerId, plaintext, deps)`
   encrypts with `DATA-03`'s envelope encryption (recording `keyVersion` so rotation is possible) and
   appends through the injected TenantContext repository port. The plaintext parameter is consumed and
   **zeroed** before return (see deliverable 4); it is never returned, echoed or re-derived. An
   architecture test asserts this package imports no SQLite driver and no unscoped connection factory
   (PRD §21.2, §45.2; `SEC-001`). Basis: PRD §16.4, §21.1, §39.6, §35.1.
3. **Decryption only inside the gateway, only at call time.**
   `withDecryptedKey(credentialId, profile, fn)` is the **only** decryption surface: it decrypts,
   invokes `fn(secret)` synchronously within the same call, and zeroes the buffer in a `finally` block
   whether `fn` throws or not. It refuses when the resolved profile's provider id does not match the
   credential's provider id (PRD §16.4 *"only for integrated provider/model profiles"*). There is no
   `getKey`, no `decrypt` export, no cache and no promise that outlives the call. Basis: PRD §16.4
   (*"decrypted only inside the Model Gateway"*).
4. **Zeroisation and no accidental capture.** The secret is held in a mutable byte container that is
   overwritten after use; it is never placed in a plain string that could be interned, never
   interpolated into a template literal, never assigned to an object property that outlives the call,
   and never included in an `Error` message, a stack trace or a serialised request record. A test
   asserts a canary key is absent from a heap-adjacent capture taken after `withDecryptedKey` returns
   (best-effort, documented as such) and — the hard assertion — absent from every log, metric, error and
   repository call.
5. **No base-URL surface, no model surface.** This module exposes **no** configuration for a base URL,
   endpoint, region, header set, model name, tokenizer or retention setting. The credential binds only
   to a `providerId` already present in `EVID-07`'s allowlist; an unknown provider id is refused at
   store time. A type-level test proves the absent members. Basis: PRD §16.4 (*"Arbitrary base URLs are
   prohibited"*), §37.5; sub-PRD **D13/D19**.
6. **BYOK changes nothing but who pays.** A test matrix asserts that with a BYOK credential active, the
   following are byte-identical to the platform-funded path: the resolved profile and its ceilings, the
   provider allowlist, the evidence pack, the §36.5 request schema, the §36.6 validation, the PII
   admission, the rate/concurrency limits and the kill-switch behaviour. Only the funding ledger and the
   credential differ. Basis: PRD §16.4 (*"it does not bypass model allowlists, evidence, validation,
   safety, abuse or rate limits"*); sub-PRD **D19**.
7. **Funding-ledger routing.** `resolveFunding(organizationId, profile, deps): FundingDecision` returns
   `CUSTOMER_PREPAID_OR_BYOK` with the credential when one is active for the resolved provider, and
   otherwise `FOUNDER_PLATFORM_BUDGET`. It calls `EVID-08`'s routing and `FND-09`'s
   `recordByokEstimate` so a BYOK call records estimated usage/cost with a founder debit of **exactly
   zero**. A property test asserts founder liability is unchanged on every BYOK path. Customer variable
   cost that is neither prepaid nor BYOK is **refused before admission** — PRD §24.4 *"MUST NOT create
   unsecured founder liability"*. Basis: PRD §24.4, §42.6.
8. **Platform-funded fallback is opt-in and still capped.** `platformFallbackOptIn` is a per-organisation
   flag, default **off**; when off, a BYOK provider failure returns `Unavailable` and never becomes a
   founder-funded call. When on, the call is routed through `EVID-08`'s founder breaker unchanged, so it
   remains under the global hard budget and is denied at `HARD_STOP`. Basis: PRD §16.4 (*"Platform-funded
   fallback requires explicit opt-in and remains under the global hard budget"*); §42.6; **`OPS-003`**.
9. **Rotation, revocation and lifecycle.** `rotateCredential` stores a new ciphertext and marks the
   previous one `REVOKED` in the same repository transaction; `revokeCredential` marks it `REVOKED` and
   subsequent calls fall back to the funding decision in deliverable 7 (i.e. founder-funded only if the
   organisation is otherwise eligible — never as an automatic consequence of revocation). Revoked
   credentials remain as rows for audit and are deleted with the organisation on closure per PRD §10.3.
   Basis: PRD §21.1 (*"rotation/revocation"*), §10.3.
10. **Export and support exclusion.** `assertNoCredentialInPayload(payload)` — a deny-by-shape check
    reusable by `EVID-06`'s `assertExportSafe` and by any operator tool — rejects a payload containing a
    credential ciphertext, a `keyVersion`, a provider secret-shaped string or a plaintext-looking token.
    A test proves an export payload containing a credential is rejected. Basis: PRD §16.4 (*"excluded
    from logs/exports/support"*); §8.9.
11. **Content-free observability.** The module emits only
    `{ organizationId, providerId, credentialId, event: 'STORED'|'ROTATED'|'REVOKED'|'USED'|'REFUSED',
    reason? }` through an injected sink — never the secret, never `lastFour` in a log, never a hash of
    the key. Basis: PRD §22 (*"Logs MUST exclude … credentials"*); §16.4.
12. **`test/byok/fixtures/**`** — synthetic credentials (obviously fake tokens, per sub-PRD D22) with a
    canary token; a provider-mismatch case; an unknown-provider case; a rotation and a revocation
    sequence; a BYOK-funded call asserting zero founder debit; a BYOK provider failure with
    `platformFallbackOptIn` off (unavailable) and on (founder path, denied at `HARD_STOP`); and an
    export payload containing a credential.
13. **`README.md` update in `packages/model-gateway`** — append the BYOK lifecycle, the single
    decryption surface, the "changes only who pays" rule, the opt-in fallback, and the explicit note
    that no configuration route exists (sub-PRD **Q-EVID-7**).

## Acceptance checklist (classified)

- [ ] `[machine]` **No plaintext escapes**: a type-level test proves no exported type or function
      returns a key, secret, plaintext or token; `withDecryptedKey` is the only decryption surface and
      holds the secret for the duration of one call. (PRD §16.4)
- [ ] `[machine]` **Canary key leak test**: a canary credential appears in **no** log, metric, error
      message, stack trace, export payload or repository call other than its ciphertext column.
      (PRD §16.4 *"excluded from logs/exports/support"*; §22)
- [ ] `[machine]` **Zeroisation**: the secret buffer is overwritten in a `finally` block on both the
      success and throw paths; asserted by inspecting the container after the call. (PRD §16.4, §21.1)
- [ ] `[machine]` **No base-URL or model surface**: a type-level test proves the module exposes no base
      URL, endpoint, region, header, model, tokenizer or retention configuration; an unknown
      `providerId` is refused at store time. (PRD §16.4 *"Arbitrary base URLs are prohibited"*; §37.5)
- [ ] `[fixture]` **BYOK changes only who pays**: the matrix in deliverable 6 shows identical profile,
      allowlist, pack, request schema, validation, PII admission, limits and kill-switch behaviour
      between the BYOK and platform paths. (PRD §16.4; sub-PRD D19)
- [ ] `[machine]` **Zero founder debit**: a property test asserts founder liability is unchanged on
      every BYOK path while `recordByokEstimate` still records the estimate. (PRD §42.6; §24.4;
      **`OPS-003`**)
- [ ] `[machine]` **No unsecured liability**: customer variable cost that is neither prepaid nor BYOK is
      refused **before** admission. (PRD §24.4)
- [ ] `[fixture]` **Fallback is opt-in and capped**: with the flag off, a BYOK provider failure returns
      `Unavailable` and no founder-funded call occurs; with it on, the call goes through `EVID-08`'s
      breaker and is denied at `HARD_STOP`. (PRD §16.4; §42.6; **`ANS-007`**)
- [ ] `[machine]` **Provider binding**: a credential for provider A cannot be used for a profile bound
      to provider B. (PRD §16.4 *"only for integrated provider/model profiles"*)
- [ ] `[machine]` **Rotation and revocation**: rotation stores a new ciphertext and revokes the previous
      one atomically; a revoked credential is never selected; revoked rows survive for audit and follow
      PRD §10.3 deletion on closure. (PRD §21.1; §10.3)
- [ ] `[machine]` **Export exclusion**: `assertNoCredentialInPayload` rejects a payload containing a
      ciphertext, `keyVersion` or secret-shaped token; a clean payload passes. (PRD §16.4; §8.9)
- [ ] `[machine]` **Encryption via `DATA-03` only**: an architecture test asserts no local cipher, key
      derivation or crypto primitive is implemented here, and no SQLite driver or unscoped connection is
      importable. (PRD §35.1; §21.2; §45.2; `SEC-001`)
- [ ] `[machine]` **No inbound-credential coupling**: an import test asserts this module does not import
      `packages/auth`'s credential store — outbound provider keys and inbound API credentials never
      share a code path. (PRD §38.4 vs §16.4; `02-auth-core` ownership)
- [ ] `[machine]` **Offline**: the whole suite passes with the network globally stubbed to throw and no
      real provider key present; provider interactions come from `EVID-07`'s stub or a cassette.
      (PRD §20.2, §20.3; sub-PRD D15)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean. (PRD §20.1, §45.3)
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable. (PRD §45.3)
- [ ] `[machine]` **Writeback item**: sub-PRD **Q-EVID-7** in `docs/prd/12-evidence-safety/README.md` is
      updated with the gateway-side surface as built and the still-missing configuration route named as a
      plan gap. (Breakdown plan §1.1; CLAUDE.md issue #53)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (contributes to **OPS-003**,
      **ANS-007**; no dedicated `UAT-*` row — BYOK is exercised through `UAT-OPS-03`'s ledger
      separation), user-visible change and non-goals, schema/API/event compatibility impact (the
      `ByokDisplayHint` shape any future settings route would consume), **tenant/PII/security and
      retention impact — the substance of this ticket: a customer secret at rest and in memory, its
      rotation, revocation and closure deletion**, source/licence impact (none), **cost impact** (BYOK
      debits zero founder funds; the opt-in fallback stays under the hard budget), rollback path (revert;
      without this module all work is founder-funded and capped, which is the safe direction), known gaps
      (**Q-EVID-7** — no configuration route exists in the plan).

Absent classes: no `[human]` criteria — key handling is verified mechanically. There is no `UAT-*` row
for BYOK in PRD §41.2; its human-facing surface (key entry, shown once) does not exist until the
Q-EVID-7 route is planned. The `[fixture]` items are synthetic credential and ledger fixtures authored
here (sub-PRD D22) — the PRD §14/§43 evaluation replays are `21-evaluation-600`.

## Test plan

Every step runs offline: **no network, no real provider key**. All credential values are obviously
synthetic and marked as such.

1. **Read the requirement against the code.** Read `docs/PRD.md` §16.4 sentence by sentence beside
   `src/byok/**` and confirm each sentence has a corresponding deliverable and test.
2. **Run the suite.** `pnpm --filter @<scope>/model-gateway test`, then `pnpm test`, `pnpm typecheck`,
   `pnpm lint` and `pnpm generate && pnpm generated:check` from the repository root. Construction
   pattern to copy: `DATA-03`'s `packages/database/test/crypto/**` (encrypt/decrypt round-trip with a
   rotated key version) and `EVID-08`'s ledger fixtures.
3. **Type-level tests.** No plaintext member on any exported type; no exported function returning a
   secret; no base-URL/model/retention configuration member.
4. **Canary leak test.** Store a canary credential; run store → use → rotate → revoke; assert the canary
   appears in no log, metric, error, stack trace, export payload or repository call other than the
   ciphertext column; assert the ciphertext is not the plaintext.
5. **Zeroisation test.** Call `withDecryptedKey` with a callback that returns normally and one that
   throws; inspect the buffer afterwards in both cases.
6. **Provider-binding test.** Attempt to use a provider-A credential on a provider-B profile; assert
   refusal. Attempt to store an unknown provider id; assert refusal.
7. **Parity matrix.** Run one answer path twice — platform-funded and BYOK — with `EVID-07`'s stub;
   assert the profile, pack, request schema, validation result, PII admission and limits are identical
   and only the ledger and credential differ.
8. **Founder-liability property test** (≥ 10,000 generated calls): founder debit is exactly zero on
   every BYOK path; the estimate row exists in every case.
9. **Fallback tests.** BYOK provider failure with the opt-in off (assert `Unavailable`, no founder ledger
   row) and on (assert the founder path is used and is denied at `HARD_STOP`).
10. **Rotation/revocation.** Rotate; assert the old credential is `REVOKED` and unusable and the new one
    works. Revoke; assert no automatic founder-funded substitution occurs.
11. **Export-exclusion test.** Feed an export payload containing a ciphertext and one containing a
    plaintext-shaped token; assert both are rejected by name.
12. **Architecture tests.** No local crypto primitive; no SQLite driver; no unscoped connection; no
    import of `packages/auth`.
13. **Append-only manifest.** `git diff packages/model-gateway/package.json … src/index.ts` shows
    additions only; confirm no file under `src/{profiles,providers,schema,budget}/**` changed.
14. **Reviewer focus.** Confirm `withDecryptedKey` is genuinely the only decryption path and that the
    secret cannot outlive the call (no closure capture, no cache, no async escape); confirm nothing can
    configure a base URL; confirm a BYOK credential cannot relax any limit, validation or safety control;
    confirm revocation never silently shifts cost onto founder funds; confirm this module does not create
    an inbound-credential path that duplicates `AUTC-04`.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/12-evidence-safety/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A customer's provider account requires a custom endpoint (a regional or enterprise base URL)* →
     PRD §16.4 says *"Arbitrary base URLs are prohibited."* The supported path is adding the endpoint to
     **`EVID-07`'s provider allowlist** as reviewed configuration, in a docs PR against that ticket, with
     the retention terms checked against PRD §10.2. Never add a customer-supplied URL field here — that
     is the SSRF and data-exfiltration surface the allowlist exists to close.
   - *There is no way for a customer to enter a key, because no route exists* → sub-PRD **Q-EVID-7**.
     Record it in `docs/prd/12-evidence-safety/README.md`, then raise the ticket in the owning module via
     a docs PR against `docs/prd/breakdown-plan.md` §5 (and §6.2 for the edge). **Never add an endpoint
     or screen from this module** — plan §4 gives `apps/**` to other modules.
   - *`DATA-03`'s envelope encryption lacks a needed property* (per-organisation key scoping, an
     external KMS) → that is `01-app-data`'s. Raise the ticket change there, record it in
     `docs/prd/12-evidence-safety/README.md`, and take the `blocked_by` edge in
     `docs/prd/breakdown-plan.md` §5.13/§6.2 if sequencing is required. Never implement a cipher here.
   - *Support needs to verify a customer's key is valid* → PRD §16.4 excludes keys from support. The
     supported diagnostic is a `USED`/`REFUSED` event with a `reason`, plus `lastFour` in the display
     hint. Record any pressure in `docs/prd/12-evidence-safety/README.md` **D19**.
   - *A BYOK customer asks for a higher rate limit or a model outside the allowlist "since they are
     paying"* → PRD §16.4: BYOK *"does not bypass model allowlists, evidence, validation, safety, abuse
     or rate limits."* Refuse and record it; a limit change is a `FND-09`/`RUNT-02` decision and a
     product change (PRD §45.5).
3. **Falsified protocol.** If a customer key cannot in fact be confined to the gateway — for example if
   a provider SDK requires the key in a process or context this module does not control — that overturns
   PRD §16.4's *"decrypted only inside the Model Gateway"* and turns a customer secret into a leak
   surface. **Stop.** Do not store the key. Escalate for re-review, raise an ADR under `docs/adr/`, and
   write back to `docs/prd/12-evidence-safety/README.md` **and** `docs/prd/breakdown-plan.md` before any
   code. The safe interim state is BYOK unavailable with founder-funded work capped by `EVID-08` — the
   product works without BYOK, and PRD §24.4's rule is that customer variable cost must be prepaid *or*
   BYOK, not BYOK alone.
