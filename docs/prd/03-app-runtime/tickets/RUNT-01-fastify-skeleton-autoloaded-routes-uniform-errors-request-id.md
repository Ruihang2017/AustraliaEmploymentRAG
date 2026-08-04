---
id: RUNT-01
title: "Fastify skeleton: autoloaded routes, uniform errors, request_id"
module: 03-app-runtime
lane: 03-app-runtime
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-04]
blocks: [RUNT-02, RUNT-03, RUNT-08, RUNT-09, RLSE-01]
---

# RUNT-01 — Fastify skeleton: autoloaded routes, uniform errors, request_id

Implements PRD §16.1 (platform rules), §34.9 (error catalogue) and §39.1 (deployable processes and
dependency rule), carrying requirement `DEV-001`'s `/v1` surface and the `SEC-001` request pipeline
entry point. **No ADR — the decision is already made in PRD §16.1, §34.9 and §39.1; this is build
ticket 1 of 9 against it.**
Parent sub-PRD: [03-app-runtime README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `FND-04` — OpenAPI root and generated TypeScript bindings ([`00-foundation`](../../00-foundation/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope against a contract PRD
§16.1/§34.9/§39.1 already fixes — process bootstrap wiring, not a new subsystem decision.

## Background + basis

**The `/v1` platform rules are already normative.** PRD §16.1 states:

> Base path `/v1`; internal administration `/internal/v1`. … JSON/HTTPS, stable opaque IDs, ISO 8601
> UTC timestamps and cursor pagination. … Organisation is derived from authenticated context, not
> trusted request fields. **Every response includes `request_id`.** Retryable writes support
> `Idempotency-Key`. HTTP status and domain answer status remain separate. Optional fields may be
> added within v1; breaking changes require v2.

and fixes the uniform error body:

```json
{
  "error": {
    "code": "INSUFFICIENT_EVIDENCE",
    "message": "The available sources do not support a reliable answer.",
    "request_id": "req_...",
    "details": {},
    "retryable": false
  }
}
```

**The error catalogue is closed.** PRD §34.9 enumerates exactly these HTTP/code pairs:
`400 INVALID_REQUEST`, `400 INVALID_LEGAL_DATE`, `400 INVALID_ABN`, `401 AUTHENTICATION_REQUIRED`,
`403 MFA_REQUIRED`, `403 RECENT_AUTH_REQUIRED`, `404 RESOURCE_NOT_FOUND`, `409 IDEMPOTENCY_CONFLICT`,
`409 CONCURRENT_MODIFICATION`, `410 EPHEMERAL_CONTENT_EXPIRED`, `422 EMPLOYEE_PII_DETECTED`,
`429 RATE_LIMITED`, `429 CREDIT_LIMIT_REACHED`, `503 GENERATION_UNAVAILABLE`,
`503 SOURCE_NOT_CURRENT`, `503 CORPUS_INCOMPATIBLE`, `500 INTERNAL_ERROR`. Each row carries a
retryability column, which is the `retryable` field above. PRD §34.9 closes with:

> Domain answer statuses such as `INSUFFICIENT_EVIDENCE` are valid completed research results and do
> not become HTTP errors.

**The process boundary is fixed.** PRD §39.1 gives `app: Fastify API + auth + SSE` reading
`app.sqlite`, `ephemeral.sqlite` and the job/outbox tables, and enforces dependency directions in CI:

> `apps → packages/application services → packages/domain + packages/contracts` …
> `packages/domain` imports no Fastify, React, SQLite driver, provider SDK or Cloudflare/AWS library.

PRD §45.2 draws the same line for this app: `apps/api` owns "HTTP auth/admission/DTO mapping/SSE"
and must **not** own "Duplicated business rules".

**Configuration is layered and fails closed in production.** PRD §39.6:

> Configuration layers are: committed safe defaults → environment-specific non-secret config →
> encrypted/sealed secret injection → internal feature flag. **Production startup validates the
> complete schema and refuses unknown critical keys.**

**Why directory autoload, and why it is this ticket's job.** `docs/prd/breakdown-plan.md` §2.1 row
**A1** records the decomposition-critical decision:

> `apps/api`, `apps/worker`, `apps/web` register routes/handlers/features by **directory convention**
> (autoload), never a shared central manifest. … Without it every product module edits one
> `routes/index.ts` and the vertical cut collapses. Recorded by `RUNT-01`, `RUNT-04`, `RUNT-05`.

Seven downstream modules (`13`, `14`, `15`, `16`, `17`, `19`, `20`, `22`) each own their own
`apps/api/src/routes/<area>/**` subtree and **none** of them may write a file this ticket owns. If
the registration contract requires editing a shared index, breakdown-plan §9 risk **R1** applies:
the failure is escalated to the plan (a "route manifest owned by `03-app-runtime`" row plus a
manifest-registration ticket every product module becomes `blocked_by`), never patched locally.

**Fixed inputs and accepted caveats, documented not enforced here:**

- **The toolchain versions are fixed.** breakdown-plan §8 **Q12** is a confirmed decision: Node.js
  `24.18.0`, pnpm `11.4.0`, Rust `1.97.1`, Python `3.14.6` — Node 24 LTS, not Node 26. `FND-01` holds
  the pins; this ticket declares no version of its own and is built and tested on exactly those
  versions, the same ones CI runs (PRD §45.3: "Exact Node/pnpm/Python/Rust versions belong in
  committed tool-version files and lockfiles selected in E01, not in human memory. CI and local
  development use the same pinned versions"). If a mandatory Fastify-side dependency proves
  incompatible with a pinned version, the evidence is raised against `FND-01` and the §8 register
  before anything moves — never fixed by running a different version here.
- The autoload **mechanism** (Fastify autoload plugin vs a hand-rolled loader) and its survival inside
  the single immutable release archive PRD §20.3 requires is open question **QR1** in
  [`../README.md` §6](../README.md#6-open-questions); this ticket records the answer in an ADR.

## Goal

Produce a bootable `apps/api` Fastify process whose route areas self-register purely by existing as a
directory under `apps/api/src/routes/<area>/`, whose every response — success or failure — carries a
`request_id`, and whose every error body is the PRD §16.1 shape drawn from the closed PRD §34.9
catalogue. Completion is mechanically checkable: a conformance test creates a throw-away route
directory at test time, boots the app with **zero** diff to any tracked file, and asserts the route
answers under its derived prefix with a `request_id`; a second test asserts that every PRD §34.9 code
is producible through the typed error factory and that an unmapped thrown error becomes exactly
`500 INTERNAL_ERROR` with no stack, message or internal detail leaked.

## Non-goals

- **No authentication, tenant resolution, permission, rate/quota, PII or idempotency logic.** That is
  the admission chain, `RUNT-02`, which is `blocked_by` this ticket. This ticket only declares the
  typed `RouteAreaConfig.admission` field and treats every value as a no-op until `RUNT-02` binds it.
- **No SSE.** `apps/api/src/sse/**` is `RUNT-03`.
- **No `health` or `system-status` route areas.** `apps/api/src/routes/{health,system-status}/**` is
  `RUNT-08`, which is `blocked_by` this ticket. This ticket ships **no** route directory of its own;
  the conformance test's throw-away area is created and deleted inside the test.
- **No product route areas.** Every `apps/api/src/routes/<area>/**` other than `health` and
  `system-status` belongs to `13-identity-surface`, `14-search-product`, `15-answer-product`,
  `16-monitor-alerts`, `17-records-collab`, `19-exports`, `20-developer-platform` or
  `22-internal-admin` (breakdown-plan §4).
- **No OpenAPI authoring or generated bindings.** `schemas/openapi/**` and
  `packages/contracts/src/{openapi,generated}/**` are `FND-04` (serial-owned, breakdown-plan §4.1).
  This ticket **consumes** the generated types.
- **No business rules.** PRD §45.2 forbids duplicated business rules in `apps/api`; breakdown-plan
  risk **R5** names this module as the likely offender. Legal, answer, records and monitor decisions
  stay in `packages/domain` (`00-foundation`) or the owning product module.
- **No database access.** `packages/database` is `01-app-data`; this ticket has no `blocked_by` edge
  to it and must not acquire one.
- **No `.github/workflows/**` or root manifest edits.** `00-foundation` (`FND-01`, `FND-02`).

## File-scope (write-owns)

- `apps/api/src/server.ts`
- `apps/api/src/app.ts`
- `apps/api/src/bootstrap/**`
- `apps/api/src/errors/**`
- `apps/api/package.json`, `apps/api/tsconfig.json` — **append-only extension** of the empty
  workspace-member skeleton `FND-01` created (breakdown-plan §1.1, "Package manifests": "each
  **module** owns its members' manifests; within a module a manifest is append-only shared, and
  conflicts resolve by re-running the package manager").
- `apps/api/test/**` for this ticket's own unit/integration tests (breakdown-plan §1.1, "Tests":
  unit/integration tests live inside the owning app).
- `docs/adr/NNNN-api-route-directory-autoload.md` — a **new** file, claimed by this ticket under
  breakdown-plan **A9** ("`docs/adr/**` is the only shared-additive directory: ownership is per
  *file*, claimed by the ticket that creates `NNNN-<slug>.md`"). Take the lowest unused four-digit
  number at build time; the slug `api-route-directory-autoload` is reserved to this ticket.

Does not touch:

- `apps/api/src/{plugins,middleware}/**` — `RUNT-02`.
- `apps/api/src/sse/**` — `RUNT-03`.
- `apps/api/src/routes/**` — `RUNT-08` owns `health` and `system-status`; every other area belongs to
  a product module (breakdown-plan §4).
- `apps/worker/**` — `RUNT-04` (+ product handler subtrees).
- `apps/web/**` — `RUNT-05` (+ product feature subtrees).
- `packages/**` — `00-foundation`, `01-app-data`, `02-auth-core`, `03`'s own `RUNT-06`/`RUNT-07`,
  `11`, `12`, `20`.
- `schemas/openapi/**`, `packages/contracts/**` — `FND-04`/`FND-03`, serial-owned.
- Root `package.json`, `pnpm-lock.yaml`, `tsconfig.base.json`, `.github/workflows/**` — `FND-01`,
  `FND-02`. If a dependency is added here, the lockfile is regenerated as a build artifact and never
  hand-merged (breakdown-plan §4.1).
- `infra/**`, `tests/**` — `18-ops-release`/`RUNT-09`, `23-assurance`.

**Serial-safety analysis.** This is the **first** decomposition (breakdown-plan §1: phase 1,
`append: false`, `usedIds: []`, `existingFiles: ['.gitkeep']`): nothing is merged and no ticket is in
flight, so no prior ticket has touched these paths and none contends for them. Sibling tickets in
this module and why the scopes are disjoint: `RUNT-02` (`plugins`, `middleware`), `RUNT-03` (`sse`),
`RUNT-08` (`routes/health`, `routes/system-status`) live in sibling directories under
`apps/api/src/` that this ticket never writes; `RUNT-04` (`apps/worker`), `RUNT-05` (`apps/web`),
`RUNT-06` (`packages/ui`), `RUNT-07` (`packages/observability`) and `RUNT-09` (`infra/compose`) are
different trees entirely. `RUNT-01`, `RUNT-04`, `RUNT-05`, `RUNT-06` and `RUNT-07` form wave 1 and may
run as five concurrent lanes (breakdown-plan §7: 9 tickets, min 2 waves, 5 peak lanes). The only
shared-additive path is `docs/adr/`, where ownership is per file (A9) and this ticket's slug is unique.

## The A1 registration contract (normative for every downstream module)

This section is the contract seven other modules build against. It must be implementable without any
of them editing a file listed above.

**1. Discovery.** Every immediate child directory of `apps/api/src/routes/` is a **route area**. Its
directory name is the area id. Areas are discovered at boot by directory scan, sorted
lexicographically by area id, and registered in that order. Nested areas are addressed with a `/`
in the derived prefix: `apps/api/src/routes/internal/core/` is area id `internal/core`.

**2. Required entry file.** A route area MUST contain `index.ts` with a **default export** that is a
Fastify plugin:

```ts
import type { FastifyPluginAsync } from 'fastify';
const routes: FastifyPluginAsync = async (app) => { /* app.get(...), app.post(...) */ };
export default routes;
```

A directory without `index.ts`, or whose `index.ts` has no default export, fails boot with a named
error naming the directory — never a silent skip.

**3. Optional area configuration.** The same `index.ts` MAY export a const named `area`, typed by
`RouteAreaConfig` exported from `apps/api/src/bootstrap`:

```ts
export interface RouteAreaConfig {
  /** URL prefix. Default: `/v1/<area-id>`. Areas under `internal/` default to `/internal/v1/<rest>`. */
  readonly prefix?: string;
  /** Admission profile. Default `'tenant'`. Meaning is bound by RUNT-02; a no-op until then. */
  readonly admission?: 'public' | 'probe' | 'tenant' | 'internal';
  /** Load order tiebreak within the lexicographic order. Default 0. Lower loads first. */
  readonly order?: number;
}
export const area = { prefix: '/health', admission: 'probe' } satisfies RouteAreaConfig;
```

**4. Prefix derivation and collision.** Default prefix is `/v1/<area-id>`; `internal/<rest>` defaults
to `/internal/v1/<rest>`; an explicit `prefix` overrides both (this is how `RUNT-08` mounts
`/health/live` and `/health/ready` outside `/v1`, per PRD §42.1). If two areas would register the
same method+path, boot fails with an error naming both areas and the path. Last-wins is forbidden.

**5. Isolation.** Each area is registered inside its own Fastify plugin encapsulation context, so an
area's decorators, hooks and error handlers cannot leak into a sibling area.

**6. Stability guarantee.** Adding, renaming or removing a route area produces **zero** diff outside
that area's own directory. This is the property the acceptance conformance test asserts.

## Deliverables

1. **`apps/api/package.json` / `apps/api/tsconfig.json`** — extend the `FND-01` skeleton with the
   Fastify runtime dependency, a `dev`/`build`/`start` script set and workspace references to
   `packages/contracts`. No Node or pnpm version is declared here: breakdown-plan §8 **Q12** fixes
   them (Node.js `24.18.0`, pnpm `11.4.0`) and `FND-01` holds the pins.
2. **`apps/api/src/bootstrap/config.ts`** — `export interface ApiConfig`, `export function
   loadConfig(env: NodeJS.ProcessEnv): ApiConfig`. Implements the PRD §39.6 layer order (committed
   safe defaults → environment config → injected secrets → feature flags). Under
   `profile === 'production'` it validates the complete schema and **throws** on an unknown key
   flagged critical; under `development` an unknown key is logged and ignored. Exposes at minimum
   `profile: 'development' | 'test' | 'production'`, `host`, `port`, `bodyLimitBytes`,
   `shutdownTimeoutMs`, `environmentLabel: 'PRODUCTION' | 'SANDBOX'`.
3. **`apps/api/src/bootstrap/route-areas.ts`** — `export interface RouteAreaConfig` exactly as in the
   contract section above; `export async function registerRouteAreas(app: FastifyInstance, opts?: {
   root?: string }): Promise<readonly LoadedRouteArea[]>` implementing discovery, ordering, prefix
   derivation, collision detection and per-area encapsulation. `LoadedRouteArea` exposes
   `{ areaId, prefix, admission, routeCount }` so `RUNT-08` and the conformance test can enumerate
   what booted.
4. **`apps/api/src/bootstrap/request-id.ts`** — an `onRequest` hook that assigns
   `request.requestId`, honouring an inbound `x-request-id` only when it matches
   `^req_[A-Za-z0-9_-]{8,64}$` and otherwise minting `req_<uuidv7>` via
   `packages/contracts` id helpers (`FND-03`). An `onSend` hook sets the `x-request-id` response
   header on **every** response including 4xx/5xx, and the serialiser injects `request_id` into every
   JSON body per PRD §16.1.
5. **`apps/api/src/errors/catalogue.ts`** — `export const ERROR_CATALOGUE` typed as
   `Readonly<Record<ApiErrorCode, { status: number; retryable: boolean }>>` containing **exactly** the
   17 PRD §34.9 rows and no others. `ApiErrorCode` is imported from `packages/contracts` if `FND-03`
   exports it; otherwise it is declared here and the divergence is written back (see Feedback
   obligation).
6. **`apps/api/src/errors/api-error.ts`** — `export class ApiError extends Error` with
   `constructor(code: ApiErrorCode, message: string, details?: Record<string, unknown>)`; `status`
   and `retryable` are read from `ERROR_CATALOGUE`, never passed in. Plus one factory per code
   (`invalidRequest()`, `resourceNotFound()`, …) so call sites never hand-write a code string.
7. **`apps/api/src/errors/handler.ts`** — the single `setErrorHandler` + `setNotFoundHandler`
   installed by `app.ts`. Serialises exactly the PRD §16.1 body
   `{ error: { code, message, request_id, details, retryable } }`. An unmapped error becomes
   `500 INTERNAL_ERROR` with a fixed generic message; the original error is passed to the logger, and
   no stack, SQL, path or provider text reaches the body. A Fastify schema-validation failure maps to
   `400 INVALID_REQUEST` with `details` naming the offending fields — field **names** only, never the
   submitted values (PRD §37.2: "Detection response includes field, character range, category and
   suggested placeholder but never echoes the detected value").
8. **`apps/api/src/app.ts`** — `export async function buildApp(config: ApiConfig):
   Promise<FastifyInstance>` in this fixed order: (a) create the instance with
   `bodyLimit: config.bodyLimitBytes` and `disableRequestLogging` (logging is `RUNT-07`'s package,
   wired by `RUNT-08`'s ticket — this ticket accepts an injected logger via
   `config`/`opts` and defaults to a silent one); (b) install the request-id hooks; (c) install the
   error and not-found handlers; (d) call `registerRouteAreas`. Admission (`RUNT-02`) inserts itself
   between (c) and (d) — that ordering constraint is stated in a code comment so `RUNT-02` has one
   obvious insertion point.
9. **`apps/api/src/server.ts`** — the process entry. Loads config, builds the app, listens on
   `config.host:config.port`, and installs `SIGTERM`/`SIGINT` graceful shutdown that stops accepting
   connections, drains in-flight requests up to `shutdownTimeoutMs`, then exits `0`. A failure during
   boot exits non-zero with a single-line reason and no stack on stdout.
10. **`docs/adr/NNNN-api-route-directory-autoload.md`** — records breakdown-plan **A1** for the API
    boundary per PRD §45.5 ("Architecture decision: durable technology/dependency/deployment
    trade-off; requires an ADR under `docs/adr/`"). States the contract above verbatim, the mechanism
    chosen for **QR1**, the alternatives rejected (central manifest — see breakdown-plan R1), and the
    consequence: seven product modules depend on this contract being stable.
11. **Conformance test harness** — `apps/api/test/route-area-conformance.ts` exporting a reusable
    helper that creates a temporary route-area directory under a test root, boots via
    `registerRouteAreas({ root })`, asserts the route answers, and removes the directory. Exported so
    downstream modules can reuse it; it is the executable form of the A1 contract.

## Acceptance checklist (classified)

- [ ] `[machine]` A route area consisting of exactly one new directory containing `index.ts` is
      served at its derived prefix after boot, with **zero** diff to any tracked file outside that
      directory — asserted by `apps/api/test/route-area-conformance.ts` (A1; breakdown-plan §2.1)
- [ ] `[machine]` Default prefix derivation is `/v1/<area-id>`; `internal/<rest>` derives
      `/internal/v1/<rest>`; an explicit `area.prefix` overrides both (PRD §16.1 "Base path `/v1`;
      internal administration `/internal/v1`")
- [ ] `[machine]` Two areas registering the same method+path fail boot with an error naming both
      areas and the path; a directory without a default-exporting `index.ts` fails boot naming the
      directory. Neither case is a silent skip
- [ ] `[machine]` Areas load in deterministic order (lexicographic area id, `area.order` tiebreak) —
      asserted by booting the same fixture set twice and comparing `LoadedRouteArea[]`
- [ ] `[machine]` Every response carries `request_id` in the body **and** the `x-request-id` header —
      asserted for 200, 400, 404 and 500 responses (PRD §16.1 "Every response includes `request_id`")
- [ ] `[machine]` An inbound `x-request-id` is echoed only when it matches `^req_[A-Za-z0-9_-]{8,64}$`;
      any other inbound value is discarded and a fresh id minted
- [ ] `[machine]` `ERROR_CATALOGUE` contains exactly the 17 PRD §34.9 rows with the PRD's HTTP status
      and retryability, and no extra key — asserted by a table-driven test listing all 17 (PRD §34.9)
- [ ] `[machine]` Every error response body matches the PRD §16.1 shape
      `{ error: { code, message, request_id, details, retryable } }` with no additional top-level key
- [ ] `[machine]` An unmapped thrown error yields `500 INTERNAL_ERROR` and the body contains no stack
      frame, file path, SQL fragment or original message — asserted against a thrown
      `Error('secret-canary-<uuid>')` whose canary must be absent from the response bytes
      (PRD §34.9; PRD §22 "Logs MUST exclude research/evidence content, PII text, credentials")
- [ ] `[machine]` A Fastify schema-validation failure yields `400 INVALID_REQUEST` whose `details`
      names offending **field names only** and never echoes a submitted value (PRD §37.2)
- [ ] `[machine]` `loadConfig` under `profile: 'production'` throws on an unknown critical key and
      succeeds under `development` (PRD §39.6 "Production startup validates the complete schema and
      refuses unknown critical keys")
- [ ] `[machine]` `SIGTERM` drains in-flight requests and exits `0` within `shutdownTimeoutMs`;
      a boot failure exits non-zero (PRD §39.1/§39.2 supervised processes)
- [ ] `[machine]` A dependency-direction assertion: nothing under `apps/api/src/` imports React,
      a provider SDK or a Cloudflare/AWS library (PRD §39.1 "Dependency directions are enforced in CI")
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — no generated OpenAPI/SDK binding was
      hand-edited (PRD §20.1; breakdown-plan §1.1 "Generated artifacts")
- [ ] `[machine]` `docs/adr/NNNN-api-route-directory-autoload.md` exists, records the QR1 answer and
      is referenced from this ticket's PR (PRD §45.5; breakdown-plan A9)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs (`DEV-001` surface, `SEC-001` entry
      point), user-visible change and non-goals, schema/API/event compatibility impact, tenant/PII/
      security impact, cost/memory/latency impact, rollback path, known gaps
- No `[fixture]` criteria — this ticket replays no recorded source or evaluation data
      (breakdown-plan §1.1 maps `[fixture]` to PRD §40.8 adapter fixtures and PRD §14/§43 evaluation
      replays; neither exists at this layer)
- No `[human]` criteria — the deliverable is process bootstrap with no customer-visible surface;
      the first `[human]` checks in this module are `RUNT-05`, `RUNT-06`, `RUNT-08` and `RUNT-09`
- No `cargo test --workspace` / `uv run pytest` item — this ticket touches no Rust or Python
      (PRD §45.3; breakdown-plan §1.1)

## Test plan

Reviewer steps, all reproducible offline with no network and no database:

1. `corepack pnpm install --frozen-lockfile`, then `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/api` (or the workspace-equivalent filter `FND-01` established). The
   suites below live under `apps/api/test/`.
3. **`route-areas.test.ts`** — harness: Fastify `inject()` (no listening socket). Fixture route areas
   are written into a `mkdtemp` directory at test start and removed at teardown, so the tree under
   `apps/api/src/routes/` is untouched. Assert, per acceptance items 1–4: derived prefixes for
   `alpha` → `/v1/alpha`, `internal/core` → `/internal/v1/core`, an explicit `area.prefix: '/health'`
   → `/health`; a duplicate method+path across two areas rejects boot with both area ids in the
   message; a directory with no default export rejects boot naming the directory; two boots of the
   same fixture set produce identical `LoadedRouteArea[]`.
4. **`request-id.test.ts`** — `inject()` a 200 route, a route throwing `ApiError.invalidRequest()`, an
   unknown path (404) and a route throwing a bare `Error`. Assert `x-request-id` header and body
   `request_id` on all four, and that they are equal. Inject `x-request-id: <script>` and assert it is
   discarded.
5. **`errors.test.ts`** — table-driven over all 17 PRD §34.9 rows: construct each via its factory,
   assert HTTP status and `retryable` match the PRD table. Then throw `new Error('secret-canary-'
   + crypto.randomUUID())` from a fixture route and assert the canary substring is absent from the
   raw response bytes and that `code === 'INTERNAL_ERROR'`.
6. **`config.test.ts`** — call `loadConfig` with a fixture env containing an unknown critical key
   under `NODE_ENV=production` (expect throw) and under `NODE_ENV=development` (expect success).
7. **`dependency-direction.test.ts`** — copy the construction pattern from
   `packages/database/test/architecture/**` (`DATA-02`'s unscoped-import architecture test) if it has
   landed; otherwise a source scan over `apps/api/src/**` asserting no import of `react`, a provider
   SDK or an AWS/Cloudflare SDK.
8. **A1 stability check** — `git status --porcelain` after the full run must be clean: the conformance
   harness must leave no file behind.
9. Confirm `docs/adr/NNNN-api-route-directory-autoload.md` exists and that its number does not collide
   with another ADR on the default branch.

## Feedback obligation

**1. General rule.** If implementation falsifies anything in this ticket, update **this ticket file**
first (version note + changelog line in the PR), re-publish the issue with
`.claude/scripts/publish-tickets.mjs --sync`, and only then change code. Silent divergence is an
incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **No directory-convention mechanism works** (a bundler or the PRD §20.3 single immutable artifact
  requires a static import graph) → this is breakdown-plan risk **R1** and falsifies decision **A1**.
  Write, in this order, **before** touching `apps/api/src/`: (a) a new
  `docs/adr/NNNN-api-route-directory-autoload.md` recording the falsification and the replacement;
  (b) `docs/prd/breakdown-plan.md` §4.2 gains a "route manifest owned by `03-app-runtime`" row;
  (c) `docs/prd/03-app-runtime/README.md` §4 decision D1 is amended. Then every product module's first
  route ticket must become `blocked_by` a new manifest-registration ticket in this module — a
  plan-level change, not a local one.
- **A build-time codegen step is needed to make autoload work** (e.g. a generated route index emitted
  by `pnpm generate`) → that touches `00-foundation`'s `tools/**` and the generated-artifact rule in
  breakdown-plan §1.1. Record it in `docs/adr/NNNN-api-route-directory-autoload.md` and raise a
  `00-foundation` ticket; do **not** write `tools/**` from here.
- **`ApiErrorCode` is not exported by `packages/contracts`** (`FND-03`/`FND-04`) → the catalogue must
  be the generated enum, not a local copy (PRD §35.1: SQLite checked text values are generated from
  `packages/contracts`; breakdown-plan §4.1 makes canonical enums serial-owned by `FND-03`). Raise a
  `00-foundation` ticket and note the temporary local declaration in
  `docs/prd/03-app-runtime/README.md` §6 as a new open question. Do not write `packages/contracts/**`.
- **PRD §34.9 turns out to be incomplete** (a needed error has no code) → that is a **product/API
  change** under PRD §45.5, not an implementation detail. Do not invent a code. Raise it as an open
  question in `docs/prd/03-app-runtime/README.md` §6 with the Founder as owner and stop at the
  nearest existing code.
- **The `RouteAreaConfig.admission` values do not survive contact with `RUNT-02`** → amend this
  ticket's contract section and `RUNT-02`'s ticket together in one docs PR, then `--sync` both, before
  either ticket's code changes. Seven product modules read that field.

**3. Escalation.** A1 is a decomposition-critical decision recorded in `docs/prd/breakdown-plan.md`
§2.1. If it is outright falsified, that overturns a team decision that seven modules depend on:
escalate for re-review before any code lands. Never swap the registration approach silently inside
this ticket.
