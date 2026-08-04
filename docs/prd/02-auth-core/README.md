# 02-auth-core — sub-PRD

> Parent decomposition: [`docs/prd/breakdown-plan.md`](../breakdown-plan.md) §3, §4, §5.3, §6.2, §7, §8.
> Master spec: [`docs/PRD.md`](../../PRD.md) (AustraliaEmploymentRAG MVP v1.0, revision 2.0, 3 August 2026).
> Module directory `02-auth-core` · lane `02-auth-core` · ticket prefix `AUTC` · 5 tickets · write-owns `packages/auth/**`.

## Problem

The product is invitation-only, multi-tenant, MFA-gated and machine-callable, and every one of those
properties is a release requirement rather than a nice-to-have: PRD §8.1 — *"Access MUST be
authenticated and invitation-controlled. Public registration MUST be disabled."*; PRD §21.1 — *"MFA
for Owner/Admin/internal admins and recent auth for sensitive operations."*; PRD §38.4 — *"Service
credentials use a public prefix plus at least 256 bits of random secret; only a memory-hard/hash
verifier is stored."*

Without one owner for these primitives they get re-implemented per surface. PRD §45.2 forbids exactly
that: `apps/api` owns *"HTTP auth/admission/DTO mapping/SSE"* and must not own *"Duplicated business
rules"*; `apps/web`/`apps/widget` must not own *"Security-boundary PII or tenant enforcement"*. A
session-expiry rule computed in a route handler, a second recovery-code hash in the admin app or a
per-route guess at "was this user recently authenticated" is a security defect that no test in the
owning surface will catch.

`02-auth-core` is therefore the single home of the identity **primitives**: session and cookie
policy, invitation and email sign-in tokens, MFA factors, the recent-auth assertion, the SSO
lifecycle state machine, machine-credential hashing/scoping/rotation, and widget-session issue and
verification. It ships no HTTP route, no screen and no table — `03-app-runtime` binds it into the
admission chain (`RUNT-02`), `13-identity-surface` exposes it as `/v1` routes and `/settings/*`
screens, and `01-app-data` owns every table it reads and writes.

## Scope

In scope — everything under `packages/auth/**` (breakdown-plan §4):

| Area | Ticket | PRD basis |
|---|---|---|
| Better Auth wiring onto `app.sqlite`, session lifetime/rotation/revocation, cookie + CSRF policy, invitation and 15-minute single-use email tokens | `AUTC-01` | §18.2, §38.2, §21.1, AUTH-001 |
| TOTP, passkey, single-use hashed recovery codes, Owner/Admin enrolment gate, the callable recent-auth assertion | `AUTC-02` | §38.2, §16.3, AUTH-004 |
| SAML/OIDC connectors, the five-state SSO lifecycle, JIT provisioning limits, break-glass invariant and high-priority security event | `AUTC-03` | §38.3, §16.3, AUTH-005 |
| Machine credentials: prefix + ≥256-bit secret, verifier-only storage, exact scopes, expiry, IP restriction, rotation with explicit ≤24 h overlap | `AUTC-04` | §38.4, §16.3, AUTH-006 |
| Widget session issue/verify: ≤15-minute opaque token bound to organisation, service account, origins, features, environment and credit ceiling | `AUTC-05` | §38.4, §33.5, DEV-002 |

## Non-goals

Each names its owner; none is a judgement call left to the Builder.

- **No HTTP routes, no Fastify, no OpenAPI.** `/v1/auth|invitations|members|mfa|sso|service-accounts|widget-sessions` are `13-identity-surface` (`IDNT-01`…`IDNT-07`); the admission middleware that calls this package is `RUNT-02`. Basis: PRD §45.2, breakdown-plan §4.
- **No screens.** `/settings/security`, `/settings/sso`, `/settings/members` (PRD §31.2) are `IDNT-08`/`IDNT-09`; developer widget/service-account screens are `PLTF-07`.
- **No tables, migrations or repositories.** PRD §35.4's `user`, `membership`, `invitation`,
  `service_account`, `api_credential`, `sso_connection`, `actor` and the session table belong to
  `DATA-04`; encryption to `DATA-03`; `audit_event` to `DATA-07`. Breakdown-plan decision **A3**:
  *"`packages/database` owns every app table and repository"* — verbatim from PRD §45.2. How that
  package talks to SQLite is settled and not this module's concern (**D10**).
- **No role or permission matrix.** PRD §38.1 is `packages/domain/src/access/**` (`FND-06`). This
  module consumes it and never re-states a role's rights.
- **No canonical enums.** SSO states, error codes and any other controlled value come from
  `packages/contracts` (`FND-03`, breakdown-plan §4.1 serial-owned). PRD §35.1: SQLite checked text
  values are generated from `packages/contracts`.
- **No rate limits, quotas or budget arithmetic.** PRD §38.5's numbers are enforced by `RUNT-02`
  using `packages/domain/src/budget/**` (`FND-09`). This module carries a credential's
  `budget_limit`/`ip_allowlist_json` values but never decides admission.
- **No email/SMS delivery.** Invitation and sign-in tokens are minted and verified here; sending them
  is `IDNT-02` (route) over the `EmailTransport` port owned by `16-monitor-alerts`. The provider
  behind that port is settled — breakdown-plan §8 **Q14 (CONFIRMED)**: Resend on its free
  transactional tier, implemented by `WTCH-04` (the provider-neutral channel) and `WTCH-09` (the
  Resend adapter). Nothing in this module waits on that choice: `packages/auth` names no provider,
  holds no API key and sends nothing.
- **No internal-admin identity.** PRD §8.11/§38.1 *"separate internal identity only"* is `INTL-01`
  (`22-internal-admin`), which depends on `AUTC-02` for MFA but defines its own actor path.
- **No SCIM.** PRD §16.3: *"SCIM is excluded."* PRD §38.3: *"member removal remains manual for MVP."*
  Documented, not enforced — do not add it as a side effect.
- **No public signup.** Not a deferral: PRD §8.1 requires it be absent, and `UAT-AUTH-01` tests for
  its absence.

## Decisions

Every decision below is *already made* by the PRD, by a breakdown-plan §2.1 ADR candidate, or by a
breakdown-plan §8 decision-register entry. Nothing here is new product policy. `docs/adr/` is still
empty, so tickets cite the PRD directly, and where a §8 register entry settles the choice they cite
that entry and the ticket named there (breakdown-plan §1.1 ADR reference form).

| # | Decision | Basis |
|---|---|---|
| D1 | `packages/auth` is **framework-free**: no Fastify, no HTTP server, no route registration. It exports functions over plain request *facts* and typed results; `apps/api` maps results to the §34.9 wire codes. | PRD §45.2 (`apps/api` owns "HTTP auth/admission/DTO mapping"), §18.1 modular monolith |
| D2 | `packages/auth` **never opens a database connection and owns no schema**. Better Auth is adapted onto the tables `DATA-04` already created; its own schema generator/migrator is not run. | PRD §45.2, §35.4 (`user` carries "auth-library linkage"), §44.3 "app migration order" serial-owned, plan A3/A5 |
| D3 | All persistence and side effects reach the package through **injected ports** (identity repositories, field encryption, audit sink, clock, secrets). In-memory fakes make every unit test offline-reproducible. | PRD §20.3 (CI gates run offline), §45.2, plan §1.1 tests convention |
| D4 | Session/cookie/token constants are **exported named constants derived from PRD §38.2/§38.4**, not literals scattered across call sites; changing one is a PRD change, not a refactor. | PRD §38.2, §38.4, §45.1 item 5 ("do not silently turn an initial default into a new product rule") |
| D5 | **Recent authentication is one callable assertion** (`AUTC-02`), never a per-route freshness guess. Routes ask; they do not compute. | PRD §38.2 (10-minute sensitive-action window), §16.3, plan §5.3 goal for `AUTC-02` |
| D6 | **`tested_at` is bound to the SSO configuration that produced it.** Any configuration edit invalidates the test, so enforcement can never ride on a stale success. | PRD §35.4 `sso_connection` — "enforcement requires successful **current** test"; §38.3 steps 4–5 |
| D7 | **Rotation revokes immediately by default.** PRD §38.4 permits an *optional* ≤24 h overlap; AUTH-006's evidence is "Old key fails immediately after rotation/revocation", so overlap is opt-in, bounded and audited, and `0` is the default. | PRD §38.4, §30.2 AUTH-006 |
| D8 | The widget token's **encoding is internal**. The cross-package contract is `issueWidgetSession` / `verifyWidgetSession` plus an opaque string; no other package parses it. Keeps PRD §38.4's "opaque-to-client" true by construction and keeps the format an implementation detail (§45.5). | PRD §38.4, §33.5 step 6, §45.5 |
| D9 | The package's public surface is **subpath-per-area** (`<auth-pkg>/mfa`, `/sso`, `/credentials`, `/widget`) via a single wildcard `exports` pattern created by `AUTC-01`, so no sibling ticket edits a shared barrel file. | plan §2 (disjoint write-sets are what make lanes safe), §1.1 manifest convention |
| D10 | **The SQLite access layer is settled upstream and stays invisible here.** Kysely-style repositories and query construction over `better-sqlite3`; **Drizzle is not used**; raw `.sql` files checked into git remain the only migration authoring format; Kysely owns typed application queries and repositories only and never schema migrations; constraints, composite tenant foreign keys, triggers, CHECK constraints, temporal rules and indexes stay expressed explicitly in SQL; application code reaches the database only through tenant-scoped repositories. Consequence for this module: nothing changes — `packages/auth` still reaches identity data only through **D3**'s injected ports, and, per `DATA-02`'s rule that an unscoped handle never spreads into feature modules and `kysely` is not imported outside `packages/database`, `packages/auth/src/**` imports neither `kysely` nor any SQLite driver. `AUTC-01`'s boundary test enforces it. No `AUTC-*` ticket may re-open this. | Plan §8 **Q13 (CONFIRMED)** — owner `01-app-data`, recorded by `DATA-01`, which carries the ADR decision input; PRD §18.2 (which lists both options), §45.2, §45.5; this module's **D2**/**D3** |
| D11 | **The toolchain versions are fixed: Node.js `24.18.0`, pnpm `11.4.0`, Rust `1.97.1`, Python `3.14.6`**, committed by `FND-01` in `.node-version`, `package.json#packageManager`, `package.json#engines.node`, `rust-toolchain.toml`, `pyproject.toml#requires-python` and the lockfiles. This module touches no Rust or Python, so only the Node and pnpm pins bind it. Consequence for **D9**: whether the wildcard `exports` pattern resolves is a mechanical check `AUTC-01` performs against those known pins and the TypeScript module resolution `FND-01` configures — not a pending version decision. If it does not resolve, the fallback is explicit per-area `exports` keys and the writeback target is **D9**, never the toolchain. | Plan §8 **Q12 (CONFIRMED)** — owner `00-foundation`, resolving ticket `FND-01` (recorded there as its decision **D17**); PRD §45.3, §18.2 |

## Rejected alternatives

| Rejected | Why |
|---|---|
| Let Better Auth own its own tables and migrations (its default mode) | Splits the app schema across two owners and breaks PRD §44.3's single serial "app migration order" plus plan A3/A5. `DATA-04` already defines `user`, `membership`, `invitation`, `service_account`, `api_credential`, `sso_connection`, `actor`. Residual risk is **OQ1**. |
| Implement session/MFA/credential logic inside `apps/api` middleware | PRD §45.2 forbids duplicated business rules in `apps/api`; every product surface would then re-derive the §38.2 defaults. |
| One `packages/auth/src/index.ts` barrel that all five tickets append to | Three of the five tickets run concurrently (plan §7: 3 useful lanes); a shared barrel is a guaranteed write conflict. D9 removes the file from contention. |
| A shared `packages/auth/test/support/**` that every ticket extends | Same contention. `AUTC-01` owns core fakes; each sibling keeps its own fakes inside its own `test/<area>/**`. |
| A single `authenticate()` entry point covering cookies, credentials and widget tokens | Merges three tickets into one write-set and one lane, and mixes three different trust levels (PRD §38.2 "API keys do not use cookies"; §38.4 widget tokens cannot reach settings/admin). Each path stays a separate exported function; `RUNT-02` chooses. |
| Memory-hard hashing for every secret regardless of entropy | The `app` process budget is **320 MiB** (PRD §39.2) and API keys are verified per request under the §38.5 ceilings. §38.4 says "memory-hard/**hash** verifier"; the choice per secret class is **OQ4**, decided with a measurement, not a preference. |
| Widget tokens as client-readable JWTs | PRD §38.4 requires "opaque-to-client"; a readable payload also invites the widget to trust its own claims instead of the server (§33.5 step 5: "no bypass exists"). |
| Reaching identity rows through a query builder handed in from `packages/database` | Would put `kysely` inside `packages/auth` and break both **D3** and `DATA-02`'s unscoped-import architecture test. The access layer is confirmed (**D10**); the ports stay the only route in. |

## Open questions

Four remain, and every one of them is **module-local**. None blocks Gate 1 or the start of `AUTC-01`.
Each names an owner and the ticket that resolves it. Resolution is a **writeback**, not a code
comment (plan §9, CLAUDE.md issue #53).

**No breakdown-plan §8 register entry is open for this module.** The four entries this module cites
inbound are all confirmed, and no `AUTC-*` ticket may re-litigate one:

- **Q13 — SQLite access layer.** Kysely-style repositories over `better-sqlite3`, Drizzle not used,
  raw `.sql` the only migration authoring format. Owner `01-app-data`, recorded by `DATA-01`.
  Recorded here as **D10**; it reaches this module only as the boundary rule that `packages/auth`
  imports neither `kysely` nor a SQLite driver.
- **Q12 — exact toolchain versions.** Node.js `24.18.0`, pnpm `11.4.0`, Rust `1.97.1`, Python
  `3.14.6`. Owner `00-foundation`, resolving ticket `FND-01`. Recorded here as **D11**.
- **Q14 — transactional email provider.** Resend on its free transactional tier, behind the existing
  `EmailTransport` port. Owner `16-monitor-alerts` (`WTCH-04`, `WTCH-09`). It does not touch
  `packages/auth`, which mints and verifies tokens and sends nothing (Non-goals).
- **Q11 — local embedding/rerank runtime.** Microsoft ONNX Runtime, CPU-only, through a pinned `ort`
  crate. Owner `11-retrieval-engine`, resolving ticket `RETR-07`. Inherited context only — this
  module runs no model; it is cited below solely as the *class* of pinned-library decision that
  **OQ2** still faces locally.

| # | Question | Owner | Resolved by | Blocks | Basis |
|---|---|---|---|---|---|
| OQ1 | Does Better Auth bind cleanly to `DATA-04`'s PRD §35.4 schema, or does it require columns/tables `DATA-04` does not define? Independent of plan §8 **Q13**, which is confirmed and fixes only *how* `packages/database` reaches SQLite (**D10**); this question is whether §35.4's columns satisfy the library, and the answer is the same under any access layer. | `02-auth-core` Builder jointly with `01-app-data`; escalate to the **Founder** only if it changes stored customer data (§45.5 product change) | `AUTC-01` | Nothing today — the fixture-schema check in `AUTC-01` is what detects it | §35.4, §45.2, plan A3, plan §9 **R4** (writeback path: add a ticket to `01-app-data`, make `AUTC-01` `blocked_by` it — never write `packages/database/**` from here) |
| OQ2 | Which pinned WebAuthn/passkey library and which TOTP implementation? PRD names the *methods*, not the libraries. | `02-auth-core`; **ADR candidate** — the module-local counterpart of the pinned-local-library class of decision that plan §8 **Q11** already settled for `11-retrieval-engine` (ONNX Runtime, CPU-only, pinned `ort` crate, `RETR-07`). Q11 itself is confirmed and is not this module's to choose; only the WebAuthn/TOTP libraries are open. | `AUTC-02` | Nothing | §38.2, §18.2, §45.5 "Architecture decision" |
| OQ3 | Which pinned SAML and OIDC libraries, and is SAML in MVP scope on day one or OIDC-first? PRD §16.3 requires both to be *testable before enforcement* but does not sequence them. | `02-auth-core`; sequencing decision is the **Founder's** (it is customer-visible pilot scope, §41.4 "optional SAML/OIDC") | `AUTC-03` | Nothing — the state machine is protocol-agnostic and lands first | §16.3, §38.3, §41.4, §45.5 |
| OQ4 | Hash/KDF choice and parameters per secret class (≥256-bit machine secrets vs low-entropy recovery codes and email tokens), constrained by the 320 MiB `app` budget under the §38.5 rate ceilings. | `02-auth-core`; **ADR candidate**, benchmark-selected (§1) | `AUTC-04` (parameters + benchmark), consumed by `AUTC-01`/`AUTC-02` | Nothing — defaults are chosen and measured inside `AUTC-04` | §38.4, §21.1, §39.2, §38.5, §1 |

## Work breakdown

Lane is `02-auth-core` and agent is `builder` for all five (plan §1.1, §5.3). File-scopes are
write-owns and are disjoint; `packages/auth/package.json` is the module's append-only shared manifest
(plan §1.1: conflicts resolve by re-running the package manager, never by hand-merge).

| Ticket | Title | Size | Lane | File-scope (write-owns) | Depends on (`blocked_by`) |
|---|---|---|---|---|---|
| [`AUTC-01`](tickets/AUTC-01-better-auth-adapter-session-and-cookie-policy.md) | Better Auth adapter, session and cookie policy | L | `02-auth-core` | `packages/auth/{package.json,tsconfig.json}`, `packages/auth/src/index.ts`, `packages/auth/src/core/**`, `packages/auth/test/{core,support}/**` | `DATA-04` |
| [`AUTC-02`](tickets/AUTC-02-mfa-totp-passkey-recovery-codes-recent-auth-assertion.md) | MFA: TOTP, passkey, recovery codes, recent-auth assertion | M | `02-auth-core` | `packages/auth/src/mfa/**`, `packages/auth/test/mfa/**` | `AUTC-01` |
| [`AUTC-03`](tickets/AUTC-03-sso-connectors-and-lifecycle-state-machine-with-break-glass.md) | SSO connectors and lifecycle state machine with break-glass | L | `02-auth-core` | `packages/auth/src/sso/**`, `packages/auth/test/sso/**` | `AUTC-01` |
| [`AUTC-04`](tickets/AUTC-04-machine-credentials-hashing-scopes-rotation-expiry.md) | Machine credentials: hashing, scopes, rotation, expiry | M | `02-auth-core` | `packages/auth/src/credentials/**`, `packages/auth/test/credentials/**` | `AUTC-01` |
| [`AUTC-05`](tickets/AUTC-05-widget-session-token-signing-and-origin-binding.md) | Widget session token signing and origin binding | M | `02-auth-core` | `packages/auth/src/widget/**`, `packages/auth/test/widget/**` | `AUTC-04` |

**Schedule (plan §7): 5 tickets, 3 minimum waves, 3 useful lanes — not serial.**
Wave 1 `AUTC-01` · Wave 2 `AUTC-02` ‖ `AUTC-03` ‖ `AUTC-04` · Wave 3 `AUTC-05`.

**Who waits on this module** (inverse edges from plan §6.2, mirrored in each ticket's `blocks`):
`AUTC-01` → `AUTC-02`, `AUTC-03`, `AUTC-04`, `RUNT-02` · `AUTC-02` → `IDNT-04`, `INTL-01` ·
`AUTC-03` → `IDNT-05` · `AUTC-04` → `AUTC-05`, `RUNT-02`, `IDNT-06` · `AUTC-05` → `IDNT-07`.

**Cross-module dependency naming.** Cross-module `blocked_by` entries are referenced by id and module
directory rather than by relative file link, because sibling modules author their own filenames in
this same wave; intra-module links are relative paths.

## Acceptance — what makes this module done

The module is done when all five tickets are `done` and the following hold. Each item is the
*package-level half* of a requirement; the route/screen half is `13-identity-surface` and the
end-to-end UAT evidence is collected there and in `23-assurance`.

1. **AUTH-001** — no code path creates a user except invitation acceptance; invitation tokens are
   stored only as hashes, expire at 72 h and are single-use, so expired, reused and wrong-email
   invitations fail (§30.2 AUTH-001, §38.2, §35.4). Evidence: `AUTC-01`.
2. **AUTH-004** — TOTP, passkey and single-use hashed recovery codes exist as verifiable factors;
   `requiresMfaEnrolment` gates Owner/Admin protected access after first login; `assertRecentAuth`
   is the only recent-auth decision in the codebase (§30.2 AUTH-004, §38.2, §21.1). Evidence:
   `AUTC-02`.
3. **AUTH-005** — `canEnforce` is false unless the connection is `ACTIVE` with a current successful
   test, and no transition can remove the last break-glass Owner path; break-glass use emits a
   high-priority security event (§30.2 AUTH-005, §16.3, §38.3). Evidence: `AUTC-03`.
4. **AUTH-006** — credentials are prefix + ≥256-bit secret, displayed once, stored verifier-only,
   exactly scoped, expiring, IP-restrictable and rotatable with immediate default revocation
   (§30.2 AUTH-006, §38.4). Evidence: `AUTC-04`.
5. **DEV-002** — a widget session can only be minted from a verified service credential, lives ≤15
   minutes, is opaque to the client and is bound to organisation, service account, pseudonymous
   external user, origins, features, environment and credit ceiling (§30.2 DEV-002, §38.4, §33.5).
   Evidence: `AUTC-05`.
6. **Boundary integrity** — `packages/auth` imports no HTTP framework, no SQLite driver and no query
   builder (`better-sqlite3`, `libsql`, `kysely` — `DATA-02` keeps `kysely` inside
   `packages/database`, plan §8 **Q13**), opens no database connection, contains no SQL/DDL and
   re-declares no `packages/domain` or `packages/contracts` value; an architecture test asserts it
   (D1–D3, **D10**, PRD §45.2). Evidence: `AUTC-01`, re-asserted per ticket.
7. **Suite green** — `pnpm lint`, `pnpm typecheck` and `pnpm test` pass on the merged default branch
   (§45.3, §20.3). No Rust or Python is touched by this module, so `cargo test --workspace` and
   `uv run pytest` are not gates here.
8. **No secret leaks** — no test, log line, error message or returned object contains a plaintext
   secret, TOTP seed, recovery code, SSO client secret or widget token payload (§22 "Logs MUST
   exclude … credentials, assertions"; §21.1).

Not owned here and therefore not part of this module's done: **AUTH-002** (organisation switching —
`IDNT-01`) and **AUTH-003** (role matrix — `FND-06` + `IDNT-03`); **SEC-001** tenant scoping
(`DATA-02`), which this module inherits by never holding an unscoped connection.

## Changelog

- **v0.2 — 2026-08-03** — plan §8 rewritten as a decision register; the four register entries this
  module inherits are all **confirmed**, and none of them is an open question here any more.
  **Q13** (SQLite access layer — Kysely-style repositories over `better-sqlite3`, Drizzle not used,
  raw `.sql` the only migration authoring format) recorded as decision **D10** and the inherited
  `OQ5` row removed from Open questions; **Q12** (toolchain versions — Node.js `24.18.0`, pnpm
  `11.4.0`, Rust `1.97.1`, Python `3.14.6`) recorded as decision **D11** and the inherited `OQ6` row
  removed, with `AUTC-01`'s wildcard-`exports` fallback re-anchored to **D9**/**D11**; **Q14**
  (transactional email — Resend, free transactional tier, behind the existing `EmailTransport` port,
  `WTCH-04`/`WTCH-09`) rewritten in Non-goals so invitation and sign-in email no longer reads as
  waiting on a provider; **Q11** (Microsoft ONNX Runtime, CPU-only, pinned `ort` crate, `RETR-07`)
  corrected where `OQ2` cited it as an open peer. Acceptance item 6, the new "Rejected alternatives"
  row and `AUTC-01`'s boundary test now name `kysely` explicitly, matching `DATA-02`'s rule that it
  stays inside `packages/database`. `OQ1`–`OQ4` remain open and module-local; `OQ1` restated so it no
  longer reads as waiting on Q13. No change to scope, tickets, sizes, dependency order,
  `blocked_by`/`blocks` edges, PRD traceability, requirement coverage, evidence obligations, the
  A$50/month ceiling or any quality gate.
- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.3 (first phase,
  5 tickets, no ADRs available). Authored by the Architect; no code exists in the repository yet.
