---
id: RUNT-02
title: Admission middleware chain
module: 03-app-runtime
lane: 03-app-runtime
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-01, AUTC-01, AUTC-04, FND-06, FND-09, DATA-02]
blocks: [IDNT-01, FIND-01, FIND-02, ASK-01, WTCH-01, RCRD-01, XPRT-01, PLTF-04, PLTF-09, INTL-01]
---

# RUNT-02 — Admission middleware chain

Implements PRD §16.5 (tenant authorisation), §18.5 step 1 (answer-runtime admission), §34.1 (common
conventions) and §38.5 (initial rate and concurrency defaults), carrying requirement `SEC-001`
("Every tenant repository requires `TenantContext`") and the admission half of `ANS-003`. **No ADR —
the decision is already made in PRD §16.5 and §18.5; this is build ticket 2 of 9 against it.**
Parent sub-PRD: [03-app-runtime README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`RUNT-01`](RUNT-01-fastify-skeleton-autoloaded-routes-uniform-errors-request-id.md);
`AUTC-01` (Better Auth adapter, session and cookie policy) and `AUTC-04` (machine credentials) in
[`02-auth-core`](../../02-auth-core/README.md); `FND-06` (role/permission matrix) and `FND-09`
(budget/quota/funding-ledger rules) in [`00-foundation`](../../00-foundation/README.md); `DATA-02`
(TenantContext repository layer) in [`01-app-data`](../../01-app-data/README.md).
**Why `builder`:** a bounded change inside one module's declared file-scope wiring four already-built
contracts (auth, permissions, budget, TenantContext) into the fixed PRD §16.5 order — not a new
subsystem decision.

## Background + basis

**The order is normative and is not a preference.** PRD §16.5, in full:

> Request flow MUST be authenticate → resolve organisation → verify membership/service account →
> evaluate permission → perform tenant-scoped lookup. **Other-tenant and absent opaque IDs return the
> same not-found response.** Business modules MUST use TenantContext-scoped repositories rather than
> raw/unscoped database connections.

PRD §18.5 step 1 gives the complete check list the app performs before any job exists:

> App performs auth, TenantContext, permission/rate, PII, schema, legal scope, budget and idempotency
> checks.

PRD §37.2 fixes where that sits relative to any side effect:

> browser hints (not trusted) → request byte/field limits → deterministic patterns and checksums →
> local entity recognition → contextual public-entity allow rules → combination/risk rules → accept
> sanitized payload OR reject with offsets/types/replacements → **only then create logs, persistence,
> jobs or provider calls**.

**Tenant is never a request field.** PRD §34.1: "Tenant | Never accepted in a request body; derived
from authenticated session/key/widget token". PRD §16.1: "Organisation is derived from authenticated
context, not trusted request fields."

**Idempotency is contractual.** PRD §34.1: "Idempotency | Key 16–128 characters; same
actor/route/key/body returns original result; changed body returns 409". PRD §16.1: "Retryable writes
support `Idempotency-Key`." PRD §34.9 gives `409 IDEMPOTENCY_CONFLICT` ("Reuse original body or new
key"). PRD §41.2 `UAT-ANS-01`: "Submit same Quick request/key twice during timeout → One job, one
snapshot, one charge; both responses identify same job."

**Rate/quota defaults are given.** PRD §38.5 table — Search burst 20/min/org (trial), 60/min/org
(paid), 100/min global initial; API calls 500/trial, 10,000/month; Concurrent Quick 1/2; Concurrent
Deep 1/1; Concurrent export 1/1; Webhook endpoints 2/10; Widget session creation 30/min and
120/min per service account. And:

> Rate-limit responses include `Retry-After`, limit, remaining and reset metadata **without disclosing
> other tenants**. Search, answer credits, advanced-task credits, API calls and provider cost are
> separate ledgers; exhausting one does not misreport the others.

PRD §34.9 gives `429 RATE_LIMITED` ("Honour `Retry-After`") and `429 CREDIT_LIMIT_REACHED`.

**The forbidden-vs-missing response must be indistinguishable.** PRD §34.9 row 404: "Check ID; same
response for forbidden/other tenant". PRD §41.2 `UAT-AUTH-03`: "Researcher guesses another tenant's
record ID → Same 404 shape/timing class as unknown ID; audit records denied lookup safely."

**What this middleware may not contain.** PRD §45.2: `apps/api` owns "HTTP auth/admission/DTO
mapping/SSE" and must **not** own "Duplicated business rules". `docs/prd/breakdown-plan.md` §9 risk
**R5** names this ticket's file-scope as the most likely place for scope creep:

> A `RUNT-*` ticket starts encoding answer, records or monitor rules. … Move the logic to
> `packages/domain` (`00-foundation`) or the owning product module.

So the permission decision comes from `packages/domain/src/access` (`FND-06`), the budget arithmetic
from `packages/domain/src/budget` (`FND-09`), the session/credential verification from
`packages/auth` (`AUTC-01`, `AUTC-04`) and the scoped repository from `packages/database/src/tenant`
(`DATA-02`). This ticket **orders and enforces** them; it decides none of them.

**Accepted caveats carried forward, documented not enforced here:**

- **PII detection is not in this module.** PRD §18.5 and §37.2 place it inside admission, but
  `packages/pii` belongs to `12-evidence-safety` (`EVID-01`), which is not upstream of this ticket in
  `docs/prd/breakdown-plan.md` §6.2. This ticket therefore declares the PII slot as a **fail-closed
  extension point** (see Deliverable 8) — a route that declares `requiresPiiAdmission` and has no
  bound provider is rejected, never silently admitted. Recorded as decision **D5** in
  [`../README.md` §4](../README.md#4-decisions).
- **Rate-limit storage.** PRD §38.5 gives numbers, not a store. Counters live in the app database via
  `DATA-02`'s scoped repositories or an in-process bounded window where the PRD's "global initial"
  row permits; PRD §18.1 forbids introducing "a Redis cluster".

## Goal

Produce one ordered, named, non-bypassable admission chain in `apps/api/src/{plugins,middleware}/**`
that every route area passes through exactly once, in the PRD §16.5 order, with the admission profile
selected by the `RouteAreaConfig.admission` field `RUNT-01` defined. Completion is mechanically
checkable: a test route registered under the `tenant` profile cannot be reached without a valid
session, cannot see another organisation's row, cannot exceed the PRD §38.5 limits, and returns the
identical `404 RESOURCE_NOT_FOUND` body for a forbidden id and an absent id; a `public` route is
reachable with no credential; and an architecture assertion proves no handler can obtain an unscoped
database connection.

## Non-goals

- **No route areas.** This ticket registers no `apps/api/src/routes/**` directory. `health` and
  `system-status` are `RUNT-08`; every product area belongs to `13`, `14`, `15`, `16`, `17`, `19`,
  `20` or `22` (breakdown-plan §4).
- **No permission matrix, no budget arithmetic, no state machine.** `FND-06`, `FND-09`, `FND-08` own
  those in `packages/domain`. This chain calls them.
- **No session/cookie/MFA/SSO/credential implementation.** `02-auth-core` (`AUTC-01`…`AUTC-05`).
  Recent-auth is a callable assertion exported by `AUTC-02`; this chain invokes it for routes that
  declare it, and does not re-derive when re-authentication is required.
- **No repository or migration code.** `packages/database/**` is `01-app-data` (breakdown-plan **A3**;
  PRD §45.2 forbids other modules to own it).
- **No PII detector.** `packages/pii` is `12-evidence-safety` (`EVID-01`). This ticket ships only the
  slot and its fail-closed default.
- **No widget-token verification logic.** `AUTC-05` (`02-auth-core`) signs and binds widget tokens;
  this chain treats a widget token as one of the three principal kinds and delegates verification.
- **No SSE.** `RUNT-03`.
- **No cross-boundary tenant-isolation suite.** `tests/tenant-isolation/**` is `23-assurance`
  (`ASSR-01`). This ticket carries its **own** co-located assertions (breakdown-plan §9 risk R8:
  "every product ticket carries its own co-located tenant/PII/citation assertions … so
  `23-assurance` confirms rather than discovers").

## File-scope (write-owns)

- `apps/api/src/plugins/**`
- `apps/api/src/middleware/**`
- `apps/api/test/admission/**` — this ticket's own unit/integration tests (breakdown-plan §1.1).

Does not touch:

- `apps/api/src/{server.ts,app.ts,bootstrap,errors}/**` — `RUNT-01`. The chain is installed **by**
  `app.ts` at the insertion point `RUNT-01` marks between the error handler and
  `registerRouteAreas`; if that insertion point is missing or wrong, the fix is a `RUNT-01` docs
  change and re-`--sync`, not an edit here.
- `apps/api/src/sse/**` — `RUNT-03`.
- `apps/api/src/routes/**` — `RUNT-08` (`health`, `system-status`) and the product modules.
- `packages/auth/**` — `02-auth-core`. `packages/domain/**`, `packages/contracts/**` —
  `00-foundation`. `packages/database/**` — `01-app-data`. `packages/pii/**` — `12-evidence-safety`.
- `apps/worker/**`, `apps/web/**`, `packages/ui/**`, `packages/observability/**`, `infra/compose/**` —
  `RUNT-04`, `RUNT-05`, `RUNT-06`, `RUNT-07`, `RUNT-09`.
- `tests/**` — `23-assurance`.
- Root manifests, lockfiles, `.github/workflows/**` — `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown-plan §1: phase 1, nothing merged,
`existingFiles: ['.gitkeep']`), so no ticket has previously touched these paths and none is in flight
against them. `apps/api/src/plugins/**` and `apps/api/src/middleware/**` are claimed by no other
ticket in any module (breakdown-plan §4 gives `03-app-runtime` the whole
`apps/api/src/{server.ts,app.ts,bootstrap,plugins,middleware,errors,sse}` set, and §5.4 splits it
three ways: `RUNT-01` bootstrap/errors, this ticket plugins/middleware, `RUNT-03` sse). Sibling
tickets sharing the module: `RUNT-01`/`RUNT-03`/`RUNT-08` are disjoint sibling directories under
`apps/api/src/`; `RUNT-04`–`RUNT-07` and `RUNT-09` are different trees. This ticket sits in wave 2
alongside `RUNT-03`, `RUNT-08` and `RUNT-09`, which may all run as concurrent lanes
(breakdown-plan §7).

## Deliverables

1. **`apps/api/src/plugins/admission/index.ts`** — `export const admissionPlugin: FastifyPluginAsync`,
   installed once by `app.ts` before route areas. It reads each route's effective
   `RouteAreaConfig.admission` profile (from `RUNT-01`) and per-route overrides declared in the route
   schema, then runs the stage list below. It is registered at the root scope so **no route can opt
   out by omission** — only by declaring `admission: 'public'` or `'probe'`, both of which are
   explicit and asserted.
2. **`apps/api/src/middleware/stages.ts`** — the ordered stage list as data, exported so a test can
   assert the order:
   `['request-limits','authenticate','resolve-organisation','verify-membership','evaluate-permission','rate-limit','pii-admission','schema-validate','legal-scope','budget-admission','idempotency']`.
   The first five are exactly PRD §16.5; the whole list is exactly PRD §18.5 step 1 with PRD §37.2's
   byte/field limits placed first. Each stage is a named function
   `(ctx: AdmissionContext) => Promise<void>`; the plugin runs them in list order and stops at the
   first `ApiError`.
3. **Profiles.** `export type AdmissionProfile = 'public' | 'probe' | 'tenant' | 'internal'` with the
   stage subsets fixed:
   - `public` — `request-limits`, `schema-validate` only (login, invitation acceptance).
   - `probe` — `request-limits` only; additionally rejects any request not arriving from the
     tunnel-restricted probe path (PRD §42.1: `/health/live` and `/health/ready` are
     "Tunnel-restricted probe").
   - `tenant` — the full list.
   - `internal` — the full list **plus** a separate internal-identity assertion and a recent-MFA
     assertion (PRD §8.11/§38.2 via `AUTC-02`); `22-internal-admin` (`INTL-01`) builds on it.
4. **`middleware/authenticate.ts`** — resolves exactly one principal kind — session user, service
   account credential, or widget session token — by delegating to `packages/auth` (`AUTC-01`,
   `AUTC-04`, `AUTC-05`). No credential parsing or hashing is implemented here. Absence yields
   `401 AUTHENTICATION_REQUIRED`; a valid principal that has not satisfied MFA yields
   `403 MFA_REQUIRED`; a route declaring `requiresRecentAuth` with a stale assertion yields
   `403 RECENT_AUTH_REQUIRED` (PRD §34.9 rows).
5. **`middleware/resolve-organisation.ts`** — derives the organisation from the authenticated
   principal only. If any request body, query or header supplies an organisation/tenant identifier,
   the request is rejected `400 INVALID_REQUEST` naming the field — it is **never** honoured
   (PRD §34.1, §16.1). Produces the `TenantContext` value that `DATA-02` defines.
6. **`middleware/verify-membership.ts`** and **`middleware/evaluate-permission.ts`** — membership /
   service-account scope check, then a permission decision obtained by calling
   `packages/domain/src/access` (`FND-06`). No role table is duplicated here. A denied permission on
   an addressable resource yields the **same** `404 RESOURCE_NOT_FOUND` body as an absent id
   (PRD §16.5, §34.9, `UAT-AUTH-03`); a denied permission on a non-addressable action yields
   `403`.
7. **`middleware/rate-limit.ts`** — enforces the PRD §38.5 boundaries as **separate ledgers**
   (search burst, API calls, concurrent Quick, concurrent Deep, concurrent export, webhook endpoint
   count, widget session creation) keyed by organisation, plus the global initial caps. Defaults are
   loaded from config, not hard-coded, with the PRD §38.5 numbers as the committed safe defaults
   (PRD §39.6 layer 1). A rejection is `429 RATE_LIMITED` with `Retry-After` and limit/remaining/reset
   metadata for **the caller's own ledger only** — no other-tenant information, no global counter
   value.
8. **`middleware/pii-admission.ts`** — the fail-closed extension point.
   `export interface PiiAdmissionProvider { assess(input: PiiAdmissionInput): Promise<PiiAdmissionResult> }`
   and `export function setPiiAdmissionProvider(p: PiiAdmissionProvider): void`. A route declaring
   `requiresPiiAdmission: true` with **no** bound provider is rejected `503
   GENERATION_UNAVAILABLE`; it is never admitted. When a provider rejects, the response is
   `422 EMPLOYEE_PII_DETECTED` carrying the provider's field/range/category/placeholder and **never
   the detected value** (PRD §37.2). `EVID-01` (`12-evidence-safety`) binds the real provider.
   PRD §30.2 `PII-002` — "Search can continue if PII service is unavailable; free-text research fails
   closed" — is expressed as: only routes that declare `requiresPiiAdmission` fail closed; search
   routes do not declare it.
9. **`middleware/budget-admission.ts`** — calls `packages/domain/src/budget` (`FND-09`) for the
   admission decision and rejects with `429 CREDIT_LIMIT_REACHED` when quota **or** funding-ledger
   balance is insufficient (PRD §42.6: "Admission requires both operation quota and funding-ledger
   balance"). No arithmetic here.
10. **`middleware/idempotency.ts`** — implements PRD §34.1 exactly: key length 16–128 characters;
    the record key is `(actor, route, key, request-body hash)`; a repeat with the same body returns
    the **original stored result** including its original status and `request_id`; a repeat with a
    changed body returns `409 IDEMPOTENCY_CONFLICT`. Storage is a `DATA-02`-scoped repository;
    entries carry a TTL from config. Applies only to routes declaring `idempotent: true`.
11. **`middleware/request-limits.ts`** — per-field and per-array limits above `RUNT-01`'s global
    `bodyLimit` (PRD §37.2 "request byte/field limits"; PRD §38.5 "token-bucket and request-size
    limits"), and PRD §34.1 pagination bounds (`page_size` 1–100, default 25).
12. **`apps/api/src/plugins/tenant-scope.ts`** — decorates the request with the `TenantContext`-scoped
    repository accessor from `DATA-02` and **only** that. There is no exported path from a route
    handler to an unscoped connection. Backed by an architecture assertion (Deliverable 13).
13. **`apps/api/test/admission/architecture.test.ts`** — asserts that no file under
    `apps/api/src/routes/**` or `apps/api/src/plugins/**` imports an unscoped `packages/database`
    entry point, `kysely` (or any `kysely/*` subpath), or a SQLite driver such as `better-sqlite3`.
    All three are failures, not only the first: breakdown-plan §8 **Q13** is a confirmed
    architecture decision — "Application code reaches the database only through tenant-scoped
    repositories; an unscoped Kysely or database handle must never be spread into feature
    modules" — and `DATA-02` forbids importing `kysely` or `kysely/*` outside `packages/database`.
    Copy the construction pattern from `packages/database/test/architecture/**` (`DATA-02`'s
    unscoped-import architecture test) so the two assertions stay recognisably the same
    (`SEC-001`).
14. **Audit hook.** A denied lookup emits a structured admission decision record (stage, outcome,
    request id, principal kind, organisation id) through the logger `RUNT-07` provides — IDs and
    codes only, no request body (`UAT-AUTH-03` "audit records denied lookup safely"; PRD §42.2
    "Operational logs use bounded codes/IDs, not research bodies").

## Acceptance checklist (classified)

- [ ] `[machine]` `stages.ts` order is exactly the eleven-stage list above and the first five match
      PRD §16.5 verbatim — asserted against a literal in the test, so a reorder fails loudly (PRD §16.5)
- [ ] `[machine]` A `tenant`-profile route with no credential returns `401 AUTHENTICATION_REQUIRED`;
      with a session lacking MFA where required, `403 MFA_REQUIRED`; with a stale recent-auth on a
      route declaring it, `403 RECENT_AUTH_REQUIRED` (PRD §34.9)
- [ ] `[machine]` An organisation/tenant identifier supplied in body, query or header is rejected
      `400 INVALID_REQUEST` naming the field and is never used (PRD §34.1, §16.1)
- [ ] `[machine]` A resource belonging to another organisation and an absent id return **byte-identical**
      `404 RESOURCE_NOT_FOUND` bodies apart from `request_id` (PRD §16.5, §34.9; `UAT-AUTH-03`, `SEC-001`)
- [ ] `[machine]` No route handler can obtain an unscoped database connection, query builder or
      SQLite handle — an architecture test over `apps/api/src/{routes,plugins}/**` forbids importing
      an unscoped `packages/database` entry point, `kysely` (or any `kysely/*` subpath) or a SQLite
      driver directly (`SEC-001`; PRD §16.5 "Business modules MUST use TenantContext-scoped
      repositories rather than raw/unscoped database connections"; breakdown-plan §8 **Q13**;
      `DATA-02`)
- [ ] `[machine]` Each PRD §38.5 boundary is a **separate** ledger: exhausting the search burst leaves
      concurrent-Quick, API-call and export ledgers unchanged and correctly reported (PRD §38.5
      "exhausting one does not misreport the others")
- [ ] `[machine]` A `429 RATE_LIMITED` response carries `Retry-After` plus limit/remaining/reset for the
      caller's own ledger only, and contains no other-organisation identifier or global counter value
      (PRD §38.5)
- [ ] `[machine]` Same actor/route/`Idempotency-Key`/body returns the original stored result; changed
      body returns `409 IDEMPOTENCY_CONFLICT`; a key shorter than 16 or longer than 128 characters
      returns `400 INVALID_REQUEST` (PRD §34.1, §34.9; enables `ANS-003`, `UAT-ANS-01`)
- [ ] `[machine]` A route declaring `requiresPiiAdmission` with **no** bound provider is rejected, not
      admitted; a provider rejection returns `422 EMPLOYEE_PII_DETECTED` whose body contains the
      field/range/category/placeholder and **not** the detected value — asserted with a synthetic
      canary string that must be absent from the response bytes (PRD §37.2, §34.9; `PII-002`)
- [ ] `[machine]` A search-profile route does **not** declare `requiresPiiAdmission` and still serves
      when no PII provider is bound (PRD §30.2 `PII-002` "Search can continue if PII service is
      unavailable; free-text research fails closed")
- [ ] `[machine]` Budget rejection returns `429 CREDIT_LIMIT_REACHED` when either quota or funding
      balance is insufficient, using `packages/domain/src/budget` and no local arithmetic
      (PRD §42.6, `FND-09`)
- [ ] `[machine]` A `public`-profile route is reachable without a credential and a `probe`-profile
      route rejects a non-probe caller (PRD §42.1)
- [ ] `[machine]` The chain runs **exactly once** per request — asserted by a counting decorator on a
      route registered under two nested plugin scopes (PRD §16.5 "Request flow MUST be …")
- [ ] `[machine]` A denied lookup emits an admission decision record containing only stage, outcome,
      request id, principal kind and organisation id; a canary string placed in the request body is
      absent from every emitted log line (PRD §22, §42.2)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `SEC-001`, `ANS-003` and `UAT-AUTH-03`,
      `UAT-ANS-01`
- [ ] `[human]` `UAT-AUTH-03` rehearsed manually against a running stack: a Researcher guesses another
      tenant's record id and observes the same 404 shape and timing class as an unknown id (PRD §41.2)
- [ ] `[human]` `UAT-ANS-01` rehearsed manually: the same Quick request and `Idempotency-Key` submitted
      twice during the timeout window yields one job and both responses identify the same job
      (PRD §41.2; the answer half is `ASK-01`, so run this after `ASK-01` merges — **not required to
      merge this ticket**)
- No `[fixture]` criteria — this ticket replays no recorded source or evaluation data
      (breakdown-plan §1.1 maps `[fixture]` to PRD §40.8 adapter fixtures and §14/§43 evaluation replays)
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)

## Test plan

Reviewer steps, offline, using an in-memory/temp-file `app.sqlite` created through `DATA-01`'s
migration runner — no network, no provider, no real credentials:

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/api`. Suites live under `apps/api/test/admission/`.
3. **`stage-order.test.ts`** — import `stages.ts`, compare to a literal array written out in the test
   file. Assert profile subsets: `public` ⊂ `tenant`, `probe` ⊂ `public`, `internal` ⊃ `tenant`.
4. **`authn.test.ts`** — harness: `buildApp()` from `RUNT-01` with fixture route areas registered via
   `registerRouteAreas({ root })` into a `mkdtemp` directory (reuse
   `apps/api/test/route-area-conformance.ts`, the harness `RUNT-01` exports). Fake principals are
   produced by `packages/auth`'s test doubles (`AUTC-01`); no real session store. Assert the 401/403
   matrix.
5. **`tenant-isolation.test.ts`** — seed two organisations through `DATA-02` scoped repositories,
   then request org B's row as org A. Assert the response body equals the absent-id body byte for
   byte after masking `request_id`. Assert an admission decision record was emitted with no body text.
6. **`architecture.test.ts`** — source scan over `apps/api/src/{routes,plugins}/**` for unscoped
   `packages/database` imports and for any direct `kysely` / `kysely/*` or SQLite-driver import
   (breakdown-plan §8 **Q13**; `DATA-02` forbids `kysely` outside `packages/database`). Copy the
   construction pattern from `packages/database/test/architecture/**` (`DATA-02`).
7. **`rate-limit.test.ts`** — drive each PRD §38.5 boundary to exhaustion with a fake clock; assert
   independence across ledgers, and inspect the 429 body/headers for absence of any other-organisation
   identifier (assert against a second seeded organisation's id string).
8. **`idempotency.test.ts`** — same key + same body (expect original result, including original
   status), same key + changed body (expect 409), key length 15 and 129 (expect 400).
9. **`pii-slot.test.ts`** — unbound provider on a `requiresPiiAdmission` route (expect rejection);
   a stub provider rejecting with offsets (expect 422 with field/range/category/placeholder and the
   canary absent from response bytes); a search-profile route with no provider bound (expect 200).
10. **`budget.test.ts`** — stub `FND-09` decisions for quota-exhausted and funding-exhausted; assert
    `429 CREDIT_LIMIT_REACHED` in both and that no arithmetic constant appears in this module's source.
11. **`once.test.ts`** — register a fixture route inside two nested Fastify plugin scopes; assert the
    admission counter increments exactly once per request.
12. The two `[human]` rows are run against a locally started stack (`pnpm stack:up`, `RUNT-09`) and
    recorded in the PR; the `UAT-ANS-01` row is not required to merge this ticket.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **The PRD §16.5 order cannot be honoured** (for example a permission decision needs data only a
  tenant-scoped lookup can provide) → PRD §16.5 uses MUST, so this is a **product/API change** under
  PRD §45.5, not an implementation detail. Record it as an open question in
  `docs/prd/03-app-runtime/README.md` §6 with the Founder as owner and stop; do not reorder the chain.
- **PII must run before authentication** to satisfy PRD §37.2's "only then create logs, persistence,
  jobs or provider calls" → amend decision **D5** in `docs/prd/03-app-runtime/README.md` §4 and this
  ticket's Deliverable 2 stage list in one docs PR, then `--sync`, before touching
  `apps/api/src/middleware/`. Ten downstream tickets read this order.
- **The rate-limit counters need a store PRD §18.1 forbids** ("Do not introduce … a Redis cluster") →
  raise it as an ADR candidate: write `docs/adr/NNNN-admission-rate-limit-store.md` **first** (PRD
  §45.5 "Architecture decision"), add the question to `docs/prd/03-app-runtime/README.md` §6, and only
  then implement. Never add an infrastructure dependency silently.
- **A PRD §38.5 default is unworkable** (a limit makes a required flow impossible) → PRD §38.5 numbers
  are product limits, not tuning constants. Escalate to the Founder via
  `docs/prd/03-app-runtime/README.md` §6; ship the PRD value behind config in the meantime.
- **`packages/domain`'s permission or budget API does not fit the stage signature** → the fix belongs
  in `00-foundation` (`FND-06`/`FND-09`) as a new ticket that this one becomes `blocked_by`; that is a
  **plan** change, so write it into `docs/prd/breakdown-plan.md` §5.4/§6.2 first. Do not re-implement
  the rule here — that is breakdown-plan risk **R5**.
- **`RUNT-01`'s `RouteAreaConfig.admission` values are insufficient** (a real route needs a profile
  that is not one of the four) → amend `RUNT-01`'s contract section and this ticket's Deliverable 3
  together in one docs PR and `--sync` both. Seven product modules read that field.

**3. Escalation.** `SEC-001` and PRD §16.5 are release requirements with MUST force, and ten tickets
across six modules are `blocked_by` this one. If the decided admission protocol is outright falsified,
that overturns a team decision: escalate for re-review before any code lands. Never weaken the chain
inside this ticket.
