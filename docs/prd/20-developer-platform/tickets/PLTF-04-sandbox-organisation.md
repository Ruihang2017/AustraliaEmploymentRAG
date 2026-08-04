---
id: PLTF-04
title: Sandbox organisation
module: 20-developer-platform
lane: 20-developer-platform
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-02, IDNT-06]
blocks: []
---

# PLTF-04 — Sandbox organisation

Implements PRD §20.2 (environments), carrying requirement **`DEV-003`** ("Sandbox is tenant-isolated,
low quota and synthetic by default", epic `E27-DEVELOPER`).
**No ADR — the decision is already made in PRD §20.2 (*"One strictly isolated sandbox organisation in
production"*) and PRD §21.2 (all tenant access is `TenantContext`-scoped); this is build ticket 4 of
9 against it.**
Parent sub-PRD: [20-developer-platform README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `RUNT-02` — Admission middleware chain ([`03-app-runtime`](../../03-app-runtime/README.md));
[`IDNT-06` — Service-account and credential routes](../../13-identity-surface/tickets/IDNT-06-service-account-and-credential-routes.md).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
— PRD §20.2 fixes the environment model and `RUNT-02` already enforces tenancy, quota and
permissions; this exposes provisioning and labelling over the frozen PRD §34.1/§34.9 wire contract,
it does not invent an isolation mechanism.

## Background + basis

**The environment model is fixed.** PRD §20.2, quoted in full:

> - Local complete development environment.
> - CI build/test environment.
> - Static frontend previews.
> - **One strictly isolated sandbox organisation in production.**
> - No permanently running paid staging server.
>
> Coding agents MUST NOT receive production SSH, database, backup, signing or provider credentials by
> default.

**The requirement and its acceptance evidence.** PRD §30.2, quoted in full:

> | DEV-003 | Sandbox is tenant-isolated, low quota and synthetic by default | `/developer/sandbox` | sandbox API | App | **Sandbox webhook/events are labelled and cannot reach production records** |

Two things follow. First, the evidence is *labelling* plus *isolation* — not a text classifier.
Second, `/developer/sandbox` appears in that route column but **not** in PRD §31.2's route table;
sub-PRD **Q-PLTF-7** records the tension and this module's reading: the sandbox is surfaced inside
`/developer/api` (§31.2 main action *"Read OpenAPI/**use sandbox**"*) and `/developer/widget`
(*"Synthetic questions only by default"*), both `20-developer-platform` screens, and no fifth
developer route is added.

**Isolation is ordinary tenancy — sub-PRD D17.** PRD §21.2:

> All tenant access is `TenantContext`-scoped. Use organisation-scoped keys and composite foreign
> keys where feasible. **Authorise before lookup.** Cross-organisation internal access uses a
> separate recent-MFA, reason-required, audited path.

and PRD §16.5:

> Request flow MUST be authenticate → resolve organisation → verify membership/service account →
> evaluate permission → perform tenant-scoped lookup. **Other-tenant and absent opaque IDs return the
> same not-found response.** Business modules MUST use `TenantContext`-scoped repositories rather
> than raw/unscoped database connections.

So "cannot reach production records" is `SEC-001` already holding. This ticket adds provisioning,
reset, labelling and low-quota configuration — **no new isolation primitive** — and asserts the
boundary with its own co-located cross-organisation matrix (breakdown plan §9 **R8**: every product
ticket carries its own tenant assertions so `23-assurance` confirms rather than discovers).

**Labelling has two consumers already specified.** The shell *"MUST always display the active
organisation, **environment (`PRODUCTION` or `SANDBOX`)**, current CorpusRelease date/status, and a
degraded service badge"* (PRD §31.1), and `FND-05`'s webhook envelope carries a required boolean
`sandbox` (PRD §34.8's payload: `"sandbox": false`). `WTCH-05` builds that field from *"organisation
environment is `SANDBOX`"* — it reads the organisation row this ticket sets, and is **not** blocked
by this ticket. This ticket therefore owns the value and asserts it locally; the end-to-end webhook
labelling run belongs to `23-assurance` and Gate 2.

**Who may call it.** PRD §38.1's row *"Manage service accounts/webhooks/widget"*: Owner ✓, Admin ✓,
Researcher —, Viewer —, Developer *"✓ within granted developer permission"*, **service account —**.
The sandbox is part of that developer surface, so a machine credential can never provision or reset
it — the same rule `IDNT-06` deliverable 1 applies to service-account management. The decision comes
from `FND-06.evaluate()`; this area re-states no role rule (PRD §45.2; breakdown plan §9 **R5**).

**Quota.** PRD §24.2 gives the trial limits — *"five users; one service account; 1,000 Search; 20
Quick; two Deep; five watchlists; 500 API calls; sandbox widget"* — and PRD §38.5 gives the rate
table. No sandbox-specific numbers exist, so sub-PRD **Q-PLTF-9** records the reading: the sandbox is
provisioned at the PRD §24.2 **trial** profile, the lowest published set, as **committed
configuration defaults** (PRD §39.6 layer 1: committed safe defaults → environment config → injected
secrets → feature flags). This route configures; `RUNT-02` and `FND-09` enforce.

**"Synthetic by default" — sub-PRD D18, with its caveat stated.** `DEV-003` says *"synthetic by
default"* and PRD §31.2's `/developer/widget` empty state says *"Synthetic questions only by
default"*. This ticket implements that as **seeding plus labelling**: `POST /v1/sandbox` seeds a
committed synthetic dataset and sets a `synthetic_only` flag that defaults true and drives
`PLTF-07`'s question picker. It deliberately does **not** attempt to classify free text as "real" —
the actual boundary against customer personal data is `12-evidence-safety`'s admission detector,
which PRD §37.2 makes authoritative and which PRD §33.5 step 5 confirms applies to every surface
(*"the same `/v1` admission, PII, evidence and quota pipeline as Web/API; no bypass exists"*).
**Carried forward explicitly as an accepted caveat: documented and labelled, not text-classified.**

**Routing and the shared toolkit.** `RUNT-01`'s A1 contract makes `apps/api/src/routes/sandbox/` an
autoloaded area at `/v1/sandbox`:

> **3. Optional area configuration.** … `export const area = { prefix: '/health', admission: 'probe' }
> satisfies RouteAreaConfig;` … **4. Prefix derivation and collision.** Default prefix is
> `/v1/<area-id>` … **6. Stability guarantee.** Adding, renaming or removing a route area produces
> **zero** diff outside that area's own directory.

`IDNT-01`'s `apps/api/src/routes/auth/_lib/**` toolkit (`getIdentityContext`, `mapAuthFailure`,
`emitIdentityAudit`, the `TENANT_ROUTE`/`SENSITIVE_ROUTE`/`MACHINE_ONLY_ROUTE` presets) is imported
read-only, as `IDNT-06`/`IDNT-07` do (their sub-PRD **D3**).

**Wire rules.** PRD §16.1 (`/v1`, `request_id`, organisation from authenticated context). PRD §34.1:
opaque ids; ISO 8601 UTC; `Idempotency-Key` 16–128 characters; **tenant never in a request body**.
PRD §34.9 is the closed catalogue; reachable here: `400 INVALID_REQUEST`,
`401 AUTHENTICATION_REQUIRED`, `403 MFA_REQUIRED`, `403 RECENT_AUTH_REQUIRED`,
`404 RESOURCE_NOT_FOUND`, `409 IDEMPOTENCY_CONFLICT`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.
PRD §34 contains **no sandbox payload example**, so sub-PRD **Q-PLTF-8** applies: the binding shapes
are §34.1 + §34.9 + `DATA-04`'s tenancy columns + the generated types from `FND-04`'s OpenAPI. Never
edit `schemas/openapi/**` from here.

**Accepted caveats carried forward, documented not enforced here:**

- **Quota enforcement is `RUNT-02`'s** with `packages/domain/src/budget` (`FND-09`). This area writes
  configuration values; it performs no budget arithmetic.
- **Tables and repositories are `01-app-data`'s** (breakdown plan **A3**; PRD §45.2). Organisation
  rows are reached through `DATA-04`'s tenant-scoped repositories via the admission-provided context.
  If no repository operation exists for what this route needs, that is a writeback to `01-app-data`,
  never a `packages/database/**` edit (breakdown plan §9 **R4**).
- **Durable audit persistence** follows `IDNT-01`'s `emitIdentityAudit`, whose storage question is
  `13-identity-surface`'s **OQ3**.
- **The webhook `sandbox: true` end-to-end run** needs `WTCH-05`, which is not a blocker here; it is
  `23-assurance` and Gate 2.

## Goal

Produce the `apps/api/src/routes/sandbox/` route area serving sandbox provisioning, status and reset
under `/v1/sandbox`, such that an organisation gets exactly one paired sandbox organisation, labelled
`SANDBOX` on every response, seeded with a committed synthetic dataset, configured at the PRD §24.2
trial limits, and unable to read or write any production organisation's resource. Completion is
mechanically checkable: a service-credential principal is refused on every route; a repeated
`Idempotency-Key` provisions exactly one sandbox; every response carries `environment: "SANDBOX"`
for the sandbox context; reset removes sandbox research data and re-seeds without touching the
production organisation; and a cross-organisation read in either direction returns a byte-identical
`404 RESOURCE_NOT_FOUND`.

## Non-goals

- **No new isolation mechanism.** Sub-PRD **D17**: the sandbox is an ordinary organisation row with
  `environment = 'SANDBOX'`; `RUNT-02` + `DATA-02`'s `TenantContext` already provide isolation
  (PRD §21.2, §16.5).
- **No tables, migrations or repositories** — `packages/database/**` is `01-app-data` (breakdown plan
  **A3**; PRD §45.2 gives it *"app schema/migrations/tenant repositories/outbox/encryption"*).
- **No admission stages, no quota/budget enforcement, no rate limiting** — `RUNT-02` with `FND-06`
  and `FND-09`. This area declares an admission profile and writes configuration values.
- **No permission matrix** — `FND-06` (`00-foundation`). No role literal appears here.
- **No service-account or credential management** — `IDNT-06` (`routes/service-accounts/**`), which
  this ticket is `blocked_by`. A sandbox organisation's service accounts are created through **that**
  area, in the sandbox organisation's own context.
- **No widget session minting** — `IDNT-07` (`routes/widget-sessions/**`).
- **No webhook subscriptions or delivery** — `WTCH-05` (`16-monitor-alerts`). This ticket sets the
  organisation `environment` that `WTCH-05`'s envelope reads; it sends nothing.
- **No developer screens** — `PLTF-01` (`/developer/api`) and `PLTF-07` (`/developer/widget`). No
  fifth `/developer/*` route is added (sub-PRD **Q-PLTF-7**).
- **No usage or audit endpoints** — `PLTF-09` (`routes/{usage,audit-events}/**`).
- **No OpenAPI, no enums, no error catalogue** — `FND-03`, `FND-04`, `RUNT-01`.
- **No text classification of "real versus synthetic" questions** — sub-PRD **D18**. The PII boundary
  is `12-evidence-safety` (PRD §37.2, §10.1).
- **No cross-boundary suites** — `tests/**` is `23-assurance`; this ticket carries its own co-located
  assertions (breakdown plan §9 **R8**).

## File-scope (write-owns)

- `apps/api/src/routes/sandbox/**` — the route area, including its A1 entry file `index.ts` and the
  committed synthetic seed dataset.
- `apps/api/test/routes/sandbox/**` — this ticket's own unit/integration tests (breakdown plan §1.1;
  sub-PRD **D21**, matching `IDNT-06`/`IDNT-07`).
- `apps/api/package.json` — **append-only** if a dependency is genuinely required (breakdown plan
  §1.1; sub-PRD **Q-PLTF-4** is the same question for `apps/web`). Prefer adding none.

Does not touch:

- `apps/api/src/routes/{usage,audit-events}/**` — `PLTF-09` (same module, sibling area, disjoint
  directory).
- `apps/api/src/routes/auth/**` — `IDNT-01`, including `_lib/**`, which this ticket **imports** but
  never writes; `apps/api/src/routes/{invitations,members,mfa,sso,service-accounts,widget-sessions}/**`
  — `IDNT-02`…`IDNT-07`.
- `apps/api/src/routes/{health,system-status}/**` — `RUNT-08`; every other route area belongs to
  `14`, `15`, `16`, `17`, `19` or `22` (breakdown plan §4).
- `apps/api/src/{server.ts,app.ts,bootstrap,errors,plugins,middleware,sse}/**` — `RUNT-01`,
  `RUNT-02`, `RUNT-03`.
- `packages/database/**` — `01-app-data`; `packages/auth/**` — `02-auth-core`; `packages/domain/**`,
  `packages/contracts/**`, `schemas/openapi/**` — `00-foundation`; `packages/ui/**`,
  `packages/observability/**` — `RUNT-06`, `RUNT-07`.
- `packages/sdk-typescript/**` — `PLTF-02`; `sdk/python/**` — `PLTF-03`; `apps/widget/**` —
  `PLTF-05`/`PLTF-06`; `apps/web/**` — `RUNT-05` and the feature-owning modules including this
  module's `PLTF-01`/`PLTF-07`/`PLTF-08`.
- `apps/worker/**`, `apps/admin/**`, `services/**`, `pipelines/**`, `infra/**`, `tests/**`,
  `evals/**`, `docs/**`, root manifests, lockfiles, `.github/workflows/**`.

**Serial-safety analysis.** This is the **first** decomposition (breakdown plan §1: phase 1,
`append: false`, `usedIds: []`, `existingFiles: ['.gitkeep']`) — nothing is merged, nothing is in
flight, so no prior ticket has written these paths and none contends for them. Under the A1 autoload
convention (`RUNT-01` contract items 3, 4 and 6) `apps/api/src/routes/sandbox/` is an independent
directory whose addition produces **zero** diff elsewhere — there is no shared route index — so it is
disjoint from the seven identity areas, from `PLTF-09`'s `usage` and `audit-events`, and from every
other module's route areas. Within this module, PRD §44.3's *"independent SDK languages"* rule gives
the wider picture: this ticket writes only `apps/api/src/routes/sandbox/**`; `PLTF-02` only
`packages/sdk-typescript/**`; `PLTF-03` only `sdk/python/**`; `PLTF-05`/`PLTF-06` only
`apps/widget/**` (split at `react/**`); `PLTF-01`/`PLTF-07`/`PLTF-08` only
`apps/web/src/features/{developer,usage}/**`. No two share a file, so all six wave-1 tickets run as
concurrent lanes (breakdown plan §7: 6 useful lanes). `apps/api/package.json` is append-only shared
(breakdown plan §1.1).

## Deliverables

1. **`apps/api/src/routes/sandbox/index.ts`** — the A1 entry file: default-exported
   `FastifyPluginAsync` and `export const area = { admission: 'tenant' } satisfies RouteAreaConfig`,
   deriving the prefix `/v1/sandbox`. Every route additionally rejects a **service-account
   principal** — PRD §38.1's *"Manage service accounts/webhooks/widget"* row gives that column a
   dash, so a machine credential can never provision or reset a sandbox. The rejection is the
   `FND-06` decision mapped by `IDNT-01`'s `mapAuthFailure`; **no role literal appears in this area**.
2. **`GET /v1/sandbox`** (`TENANT_ROUTE`) — status for the calling organisation. Response:
   `{ exists, sandbox_organization_id?, environment: "SANDBOX", provisioned_at?, last_reset_at?,
   synthetic_only, seed_dataset_version?, limits: { … }, schema_version, request_id }`. When no
   sandbox exists, `exists` is `false` and the other fields are omitted (PRD §34.1: *"Omit values that
   are not applicable"*). Returns `200`, never `404` — absence of a sandbox is a state, not a missing
   resource.
3. **`POST /v1/sandbox`** (`SENSITIVE_ROUTE`, recent auth per PRD §21.1 *"recent auth for sensitive
   operations"*, honours `Idempotency-Key`) — provision. Ordering, fixed:
   1. resolve the caller's organisation from the admission context — **there is no
      `organization_id` field in the request body** (PRD §34.1);
   2. if a sandbox already exists for that organisation, return the existing one with `200` (the
      operation is idempotent by resource, not only by key — PRD §20.2 permits **one**);
   3. otherwise create the paired organisation through `DATA-04`'s tenancy repository with
      `environment = 'SANDBOX'` and a name derived from the parent, in **one transaction** with the
      quota configuration (deliverable 5) and the seed (deliverable 6);
   4. respond `201` with deliverable 2's shape.
   A repeated `Idempotency-Key` with the same body returns the original result; a changed body
   returns `409 IDEMPOTENCY_CONFLICT` (PRD §34.1) — both handled by `RUNT-02`'s idempotency stage,
   not re-implemented here.
4. **`POST /v1/sandbox/reset`** (`SENSITIVE_ROUTE`, recent auth, honours `Idempotency-Key`) — delete
   the sandbox organisation's research data and re-seed it. Rules:
   - it operates **only** on the caller's sandbox organisation, resolved from the caller's own
     organisation; a body-supplied identifier is rejected `400 INVALID_REQUEST` naming the field;
   - it is scoped through `TenantContext` for the **sandbox** organisation, so no production row is
     reachable from the code path at all (PRD §21.2);
   - it never deletes audit events (PRD §22: audit records retain 12 months separately) and never
     deletes the organisation itself;
   - response `200` with the refreshed status and a new `last_reset_at`;
   - an audit event is emitted for the reset with the actor, the sandbox organisation id, the seed
     version and the counts removed — **bounded values only, no research content** (PRD §22, §35.6).
5. **Quota configuration (sub-PRD Q-PLTF-9).** Provisioning writes the sandbox organisation's limit
   configuration to the PRD §24.2 **trial** profile — five users, one service account, 1,000 Search,
   20 Quick, two Deep, five watchlists, 500 API calls, sandbox widget — plus the PRD §38.5 trial
   rate rows. The numbers live in **committed configuration defaults** (PRD §39.6 layer 1), not as
   literals in a handler; a source scan asserts no numeric literal from that table appears in the
   route code. This area configures; `RUNT-02` and `FND-09` enforce, and this area performs **no
   budget arithmetic** — a source scan asserts that too.
6. **Committed synthetic seed dataset.** A versioned fixture under
   `apps/api/src/routes/sandbox/seed/**` containing only synthetic material: example anonymous
   scenario questions (PRD §37.1's shape), a synthetic employer name and a **synthetic** ABN, and
   nothing that could be a real person. Every record is derived from public law or invented; a test
   asserts the seed contains no value matching the PII canary patterns used elsewhere in the repo and
   no real-looking contact detail. The dataset carries a `seed_dataset_version` string returned by
   deliverable 2 so `PLTF-07`'s question picker can pin it.
7. **`synthetic_only` flag (sub-PRD D18).** Persisted on the sandbox organisation, default `true`,
   readable through deliverable 2 and settable through `POST /v1/sandbox` at provisioning time.
   Its **only** effects are: it is reported in the status response, and it is the default `PLTF-07`'s
   widget-sandbox question picker reads. It performs no text classification. The accepted caveat is
   restated in the code comment and in the route's OpenAPI description: *documented and labelled, not
   text-classified; the PII boundary is `12-evidence-safety` (PRD §37.2)*.
8. **Environment labelling.** Every response this area produces for a sandbox context carries
   `environment: "SANDBOX"`, sourced from the organisation row and never from a request field or a
   literal. A test asserts the parent organisation's own status response never claims `SANDBOX`, and
   that the sandbox organisation row's `environment` is exactly the value `WTCH-05`'s envelope reads
   for `sandbox: true` and `RUNT-05`'s shell reads for the environment badge (PRD §31.1, §34.8).
9. **Audit events** through `IDNT-01`'s `emitIdentityAudit` for provision and reset, carrying
   `{ action, actorId, organizationId, resourceType: 'SANDBOX_ORGANIZATION', resourceId, result,
   requestId }` plus bounded counts — never research content and never a credential (PRD §22, §35.6).
10. **`apps/api/test/routes/sandbox/**`** — this ticket's suites, built on `IDNT-01`'s exported
    `apps/api/test/routes/auth/identity-route-harness.ts`, `DATA-04`'s
    `packages/database/test/tenancy/factories.ts` and `IDNT-06`-created service accounts, all
    imported read-only.

## Acceptance checklist (classified)

- [ ] `[machine]` The area registers as `apps/api/src/routes/sandbox/` and serves under `/v1/sandbox`
      with **zero** diff to any tracked file outside that directory — asserted with `RUNT-01`'s
      `apps/api/test/route-area-conformance.ts` (breakdown plan **A1**; `RUNT-01` contract item 6)
- [ ] `[machine]` Every route declares an explicit admission profile; provisioning and reset require
      recent auth (PRD §21.1 *"recent auth for sensitive operations"*)
- [ ] `[machine]` **A service-credential principal is refused on every route** — PRD §38.1's *"Manage
      service accounts/webhooks/widget"* service-account column is a dash; the refusal is `FND-06`'s
      decision, and this area contains no role literal (PRD §38.1; §45.2; breakdown plan §9 **R5**)
- [ ] `[machine]` **`AUTH-003` boundary**: Owner and Admin succeed; Researcher and Viewer are refused;
      Developer succeeds only with the granted developer permission — asserted against `FND-06`'s
      committed fixture `packages/domain/test/access/prd-38-1-matrix.json` (PRD §38.1)
- [ ] `[machine]` **`DEV-003` one sandbox per organisation (PRD §20.2)**: a second `POST /v1/sandbox`
      returns the existing sandbox rather than creating a second one; two concurrent provisions
      produce exactly one sandbox organisation (PRD §20.2 *"One strictly isolated sandbox
      organisation"*)
- [ ] `[machine]` **Idempotency**: the same `Idempotency-Key` with the same body returns the original
      result; a changed body returns `409 IDEMPOTENCY_CONFLICT`; the key length bound 16–128 is
      enforced by `RUNT-02`, not re-implemented here (PRD §34.1, §16.1)
- [ ] `[machine]` **`DEV-003` labelling**: every response for a sandbox context carries
      `environment: "SANDBOX"` sourced from the organisation row; the parent organisation's status
      never claims `SANDBOX`; the row value is exactly what `WTCH-05`'s envelope and `RUNT-05`'s shell
      read (PRD §31.1, §34.8; `DEV-003`)
- [ ] `[machine]` **`DEV-003` cannot reach production records — the co-located half**: with a sandbox
      principal, reading and writing the parent organisation's ids across this area returns
      **byte-identical** `404 RESOURCE_NOT_FOUND` bodies apart from `request_id`, and the reverse
      direction likewise; reset with a body-supplied organisation identifier is rejected `400
      INVALID_REQUEST` naming the field (PRD §16.5, §21.2, §34.9; `SEC-001`)
- [ ] `[machine]` **Tenant isolation (`SEC-001`)**: an architecture assertion over
      `apps/api/src/routes/sandbox/**` finds no unscoped `packages/database` import — copy the
      construction pattern from `apps/api/test/admission/architecture.test.ts` (`RUNT-02`
      deliverable 13)
- [ ] `[machine]` **Tenant derivation**: an `organization_id` supplied in body, query or header is
      rejected `400 INVALID_REQUEST` naming the field, and the provisioned sandbox always pairs with
      the authenticated organisation (PRD §34.1, §16.1)
- [ ] `[machine]` **`DEV-003` low quota**: a freshly provisioned sandbox carries the PRD §24.2 trial
      limits and PRD §38.5 trial rate rows, read from committed configuration; a source scan finds no
      quota numeric literal and **no budget arithmetic** in this area (PRD §24.2, §38.5, §39.6;
      `FND-09`)
- [ ] `[machine]` **`DEV-003` synthetic by default**: `synthetic_only` defaults `true` and is returned
      by the status route; the committed seed contains no PII-canary value and no real-looking contact
      detail; the ABN in the seed is synthetic (PRD §31.2, §37.1; sub-PRD **D18**)
- [ ] `[machine]` **Reset safety**: reset removes the sandbox organisation's research data and
      re-seeds it, leaves the production organisation's row counts unchanged, does **not** delete
      audit events and does **not** delete the organisation (PRD §22; §35.6)
- [ ] `[machine]` **Audit events** are emitted for provision and reset with bounded values only — no
      research content, no credential, no seed body (PRD §22, §35.6)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (standing item, PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — this area declares no type of its
      own and hand-edits no generated file (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**`DEV-003`**, `SEC-001`,
      `E27-DEVELOPER`, proposed `UAT-DEV-03` per sub-PRD **Q-PLTF-1**), user-visible change and
      non-goals, schema/API/event compatibility impact (new paths only; **Q-PLTF-8** if `FND-04` lacks
      them), tenant/PII/security impact (isolation matrix, no tenant field, synthetic seed, audit
      events bounded), source/licence impact (none), cost/memory/latency impact (the sandbox consumes
      the trial quota profile), rollback path (revert; provisioned sandboxes remain ordinary
      organisations), known gaps (**Q-PLTF-7** route placement, **Q-PLTF-9** quota profile, `WTCH-05`
      end-to-end labelling)
- [ ] `[human]` **`DEV-003` rehearsed manually against a running stack** (proposed `UAT-DEV-03`,
      sub-PRD **Q-PLTF-1**): provision a sandbox, create a service account inside it through
      `IDNT-06`'s routes, run a synthetic answer, then attempt to read a production Research Record id
      with the sandbox credential and the reverse; confirm identical 404s, the `SANDBOX` badge in the
      shell and the low quota. The webhook-labelling half needs `WTCH-05`, so it runs at Gate 2 —
      **not required to merge** (PRD §30.2 `DEV-003`, §43.4)
- No `[fixture]` criteria — this ticket replays no recorded source or evaluation data; breakdown plan
      §1.1 maps `[fixture]` to PRD §40.8 adapter fixtures and PRD §14/§43 evaluation replays, and this
      module additionally to SDK recorded-response replay — none of which exists at this layer. The
      synthetic **seed** is production data for the sandbox, not a replay fixture
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)
- No origin-validation criteria — this area serves no browser-embedded surface; exact-origin
      validation is `PLTF-05`/`PLTF-06` and `AUTC-05` (PRD §8.10)
- No SDK-telemetry criteria — this area emits no SDK telemetry; the closed allowlist is
      `PLTF-02`/`PLTF-03` (sub-PRD **D7**)

## Test plan

Reviewer steps, offline, no network. Database is a temp-file `app.sqlite` migrated with `DATA-01`'s
runner and seeded through `DATA-04`'s `packages/database/test/tenancy/factories.ts`; `packages/auth`
ports use the in-memory fakes from `packages/auth/test/support/**` with a settable `FakeClock`; the
harness is `IDNT-01`'s exported `apps/api/test/routes/auth/identity-route-harness.ts` extended with
`IDNT-06`-created service accounts. All imports of other modules' test helpers are read-only.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @<scope>/api`. Suites live under `apps/api/test/routes/sandbox/`.
3. **`area-registration.test.ts`** — reuse `apps/api/test/route-area-conformance.ts` (`RUNT-01`);
   assert the prefix `/v1/sandbox`, the exact route set, and per-route admission profiles compared to
   a literal table in the test.
4. **`principal-kind.test.ts`** — call every route with (a) a verified service credential, (b) a
   widget token, (c) no credential, (d) each of the five roles; assert the service credential and the
   widget token are refused on every route, and read the role expectations from
   `packages/domain/test/access/prd-38-1-matrix.json`.
5. **`provision.test.ts`** — provision once (201); provision again (200, same sandbox id); provision
   twice **concurrently** with the same key and assert exactly one organisation row exists; then with
   different keys and assert still exactly one. Assert the response carries
   `environment: "SANDBOX"`.
6. **`idempotency.test.ts`** — same key + same body → original result; same key + changed body →
   `409 IDEMPOTENCY_CONFLICT`.
7. **`tenant-derivation.test.ts`** — send `organization_id` in body, query and header on each route;
   assert `400 INVALID_REQUEST` naming the field each time.
8. **`isolation.test.ts`** — organisations A (production) and A-sandbox: with the sandbox principal,
   attempt every read/write this area exposes against A's ids; then the reverse; byte-compare the two
   `404` bodies after masking `request_id`. Then extend the matrix with a **third** organisation B to
   prove the sandbox is not merely "the same tenant with a flag".
9. **`quota.test.ts`** — assert the provisioned limits equal the committed PRD §24.2 trial
   configuration; then a source scan asserting no quota literal and no budget arithmetic in the area.
10. **`seed.test.ts`** — assert the seed's `seed_dataset_version` is returned; scan every seed record
    for PII-canary patterns, real-looking contact details and non-synthetic ABNs; assert
    `synthetic_only` defaults `true`.
11. **`reset.test.ts`** — seed extra sandbox research rows; reset; assert they are gone and the seed
    is restored; assert the production organisation's row counts are unchanged; assert audit events
    survive; assert the organisation row still exists with a new `last_reset_at`.
12. **`architecture.test.ts`** — source scan for unscoped `packages/database` imports, role literals,
    quota literals and budget arithmetic; copy the pattern from
    `apps/api/test/admission/architecture.test.ts` (`RUNT-02`).
13. **`audit.test.ts`** — run the whole request matrix against a `RecordingAuditSink`; assert every
    event's fields are bounded and that no seed body, question text or credential appears.
14. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether two
    concurrent provisions can create two sandbox organisations (the invariant that must hold under a
    race); whether reset can be pointed at another organisation by any parameter, header or
    idempotency-key replay; whether the sandbox's `TenantContext` is genuinely the sandbox
    organisation's rather than the parent's on any code path; whether the seed can be re-run to
    duplicate rows; whether a sandbox service credential created through `IDNT-06` inherits any
    production-scoped grant; whether the quota configuration can be raised through this area.
15. The `[human]` row runs against a locally started stack (`pnpm stack:up`, `RUNT-09`) with `curl`
    and is recorded in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies anything in this ticket, update **this ticket file**
first (version note + changelog line in the PR), re-publish with
`.claude/scripts/publish-tickets.mjs --sync`, then change code. Silent divergence is an incomplete
ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`DATA-04`'s tenancy repository has no operation to create an organisation, set `environment`, or
  store a limit configuration.** → Add a ticket to `01-app-data` and add the edge in
  `docs/prd/breakdown-plan.md` §5.2/§6.2 **first**. **Never write `packages/database/**`** —
  breakdown plan **A3** and §9 **R4** and PRD §45.2 all forbid it.
- **`RUNT-02`'s admission chain cannot express "reject a service-account principal" for an area.** →
  That is a `RUNT-02` contract gap. Amend `RUNT-02`'s deliverables and this ticket's deliverable 1 in
  **one** docs PR and `--sync` both. Never write `apps/api/src/{plugins,middleware}/**`, and never
  re-verify a credential inside this area.
- **`FND-04`'s OpenAPI has no `/v1/sandbox` path** (sub-PRD **Q-PLTF-8**). → Raise a `00-foundation`
  ticket against `FND-04` and add the edge in `docs/prd/breakdown-plan.md`. **Never edit
  `schemas/openapi/**`** and never declare the request/response type locally (PRD §20.1).
- **A required failure has no PRD §34.9 code.** → The catalogue is closed. Use
  `400 INVALID_REQUEST` + `details.reason`. If genuinely impossible, raise it in
  `docs/prd/20-developer-platform/README.md` §Open questions with the **Founder** as owner
  (PRD §45.5).
- **"Synthetic by default" is read by a reviewer as requiring enforcement.** → Sub-PRD **D18** is the
  record and its caveat is explicit. Do **not** add a text classifier: that is a new safety mechanism
  beside PRD §37.2's authoritative detector. Raise it in
  `docs/prd/20-developer-platform/README.md` with the **Founder** as owner (PRD §45.5 *"Product
  change"*).
- **The sandbox needs a quota profile lower than PRD §24.2's trial numbers, or a different one.** →
  Sub-PRD **Q-PLTF-9**. It is a configuration value (PRD §39.6 layer 1), so change the committed
  default and record the reason in `docs/prd/20-developer-platform/README.md`; a *product* limit
  change is the Founder's (PRD §45.5).
- **`PLTF-07` needs a field or a second endpoint this area does not provide.** → Amend this ticket's
  deliverable 2 in a docs PR and `--sync`; do not let `PLTF-07` write
  `apps/api/src/routes/sandbox/**`, and do not write `apps/web/src/features/developer/**` from here —
  either direction is the file-scope defect breakdown plan §4 exists to prevent.
- **`IDNT-01`'s `_lib` toolkit lacks a preset this area needs.** → Amend `IDNT-01`'s deliverables and
  this ticket together in one docs PR and `--sync` both. Never write inside
  `apps/api/src/routes/auth/**`.

**3. Escalation.** *"One strictly isolated sandbox organisation in production"* (PRD §20.2) and
`DEV-003`'s evidence *"Sandbox webhook/events are labelled and cannot reach production records"* are
release requirements with MUST force. If the one-sandbox-per-organisation invariant or the isolation
boundary proves unimplementable through ordinary `TenantContext` scoping — for example because a
sandbox genuinely needs to read a production resource — that overturns sub-PRD **D17** and touches
PRD §21.2's tenant model. Stop, raise an ADR under `docs/adr/` (breakdown plan **A9**), write back to
`docs/prd/breakdown-plan.md` and `docs/prd/20-developer-platform/README.md`, and escalate to the
human. Never add a cross-organisation read path inside this ticket.
