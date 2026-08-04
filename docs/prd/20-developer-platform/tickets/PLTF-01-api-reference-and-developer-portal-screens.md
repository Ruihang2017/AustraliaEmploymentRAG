---
id: PLTF-01
title: API reference and developer portal screens
module: 20-developer-platform
lane: 20-developer-platform
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-05, FND-04]
blocks: [PLTF-07]
---

# PLTF-01 — API reference and developer portal screens

Implements PRD §31.2 (route table, `/developer/api`) and §32.8 (developer and administration
screens), carrying requirement **`DEV-001`** ("OpenAPI drives TypeScript/Python generated cores",
epic `E27-DEVELOPER`).
**No ADR — the decision is already made in PRD §32.8 and §34 (*"The OpenAPI file at
`schemas/openapi/openapi.yaml` will be the generated-code source of truth"*); this is build ticket 1
of 9 against it.**
Parent sub-PRD: [20-developer-platform README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `RUNT-05` — Web app shell: navigation, org switcher, status badges
([`03-app-runtime`](../../03-app-runtime/README.md)); `FND-04` — OpenAPI root and generated
TypeScript bindings ([`00-foundation`](../../00-foundation/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
— PRD §32.8 lists the fields the page must show and `FND-04` has already frozen the document it
renders; this presents them, it does not design an API.

## Background + basis

**The route and its empty state are fixed.** PRD §31.2:

> | `/developer/api` | API explorer/docs | Developer/Admin/Owner | Read OpenAPI/use sandbox | Curl/TS/Python Search example |

**The mandatory field list is normative.** PRD §32.8, quoted in full for the developer half:

> Developer pages MUST display environment, base URL, API version, current key prefix/scopes/expiry,
> limits, OpenAPI version, webhook signing instructions and copyable Search/Answer examples. Secrets
> are never redisplayed.

Sub-PRD **D15** splits that list across the developer section, because breakdown plan §5.21 gives
this ticket the blockers `RUNT-05` and `FND-04` only — **not** `IDNT-06` or `WTCH-05`. This ticket
owns environment, base URL, API version, OpenAPI version, the documented PRD §38.5 limit table and
the copyable examples; the **credential-derived** fields (current key prefix, scopes, expiry) and
the in-context webhook signing instructions are `PLTF-07`, which is `blocked_by` this ticket. This
ticket renders a labelled empty slot where the credential panel will appear.

**The document is generated, not transcribed.** PRD §34 preamble:

> The OpenAPI file at `schemas/openapi/openapi.yaml` will be the generated-code source of truth. The
> examples below are normative payload shapes; property names and enum meanings cannot drift from
> them without PRD/API change control.

and PRD §20.1: *"Generated OpenAPI/SDK/event/manifest bindings MUST NOT be hand-edited."* Sub-PRD
**D23** applies both to `docs/api/**`: everything derivable from `schemas/openapi/**` or
`schemas/events/**` is generated with a do-not-edit banner and covered by `pnpm generated:check`;
only prose is hand-written. A hand-copied error table is exactly the drift `DEV-001` exists to catch.

**Requirement `DEV-001`** (PRD §30.2), quoted in full:

> | DEV-001 | OpenAPI drives TypeScript/Python generated cores | `/developer/api` | `/v1` | Contracts | Generated-client diff is clean in CI |

**What `FND-04` already publishes and this ticket consumes read-only** (`FND-04` deliverables 1–8):

- `schemas/openapi/openapi.yaml` — OpenAPI 3.1, `info.version` `1.0`, servers `/v1` and
  `/internal/v1`, every PRD §16.2/§16.3 endpoint, the 17-code PRD §34.9 error catalogue in
  `components/responses`, reusable `page_size`/`cursor`/`Idempotency-Key`/`If-Match` parameters.
- `packages/contracts/src/openapi/**` — `loadOpenApiDocument()`, which *"reads and parses the YAML,
  validates it against the OpenAPI 3.1 meta-schema, and fails loudly on any `$ref` that does not
  resolve"*.
- `packages/contracts/test/openapi/prd-16-2-endpoints.json` — *"the PRD §16.2 and §16.3 endpoint
  lists transcribed verbatim"*. This ticket's endpoint-completeness test reads that same fixture, so
  the reference cannot silently omit an endpoint.
- `schemas/openapi/examples/**` — the PRD §34.2/§34.3/§34.5/§34.6/§34.7 JSON blocks copied verbatim.
  The page's copyable examples are built from these, never re-typed.

**The A1 web registration contract** (`RUNT-05`, normative for this ticket):

> **1. Discovery.** Every immediate child directory of `apps/web/src/features/` is a **feature
> area**. Discovery uses a Vite glob in `apps/web/src/app/feature-registry.ts` —
> `import.meta.glob('../features/*/feature.tsx', { eager: true })` — which is a **pattern, not a
> list**: adding a feature directory changes no tracked file.
> **2. Required entry file.** A feature area MUST contain `feature.tsx` with a **default export** of
> type `FeatureModule`.
> **3. Navigation slots are PRD-fixed.** … the frozen ordered tuple `['ORG_SWITCHER','HOME','SEARCH',
> 'ASK','COVERAGE','COMPARE','RECORDS','MONITOR','DEVELOPER','SETTINGS','HELP']` … A feature
> **claims** a slot; it never inserts one.
> **5. Organisation scoping is mandatory for cached state.** Every cache key a feature creates MUST
> be produced by the shell's `orgScopedKey(...)` helper from `apps/web/src/lib/org-scope.ts`.
> **6. Stability guarantee.** Adding, renaming or removing a feature area produces **zero** diff
> outside that area's own directory.

Sub-PRD **D13** extends that one level down: this ticket creates the `developer` area's
`feature.tsx` **and a section registry** using `import.meta.glob('./*/section.tsx', { eager: true })`,
so `PLTF-07` adds three sub-directories with zero diff here.

**Who may see it.** PRD §31.1 item 9: *"Developer, visible to Developer/Admin/Owner"*. The predicate
is supplied by the feature (`RUNT-05` contract item 2 — *"feature-supplied predicate; the shell
encodes no role rule"*) and evaluated from `FND-06`'s permission decision surfaced by the shell
session context. This ticket writes no role literal (PRD §45.2; breakdown plan §9 **R5**).

**Accepted caveats carried forward, documented not enforced here:**

- **Live limits are not shown here.** PRD §32.8's *"limits"* is satisfied with the documented PRD
  §38.5 default table plus a link to `/usage`; live remaining/reset comes from `PLTF-09`'s
  `/v1/usage/limits` rendered by `PLTF-08`, neither of which is on this ticket's dependency path
  (breakdown plan §6.2).
- **No sandbox screen is added.** Sub-PRD **Q-PLTF-7** records that `/developer/sandbox` appears in
  `DEV-003`'s route column but not in PRD §31.2's route table; the sandbox is surfaced inside
  `/developer/api` (§31.2 main action *"Read OpenAPI/use sandbox"*) and `/developer/widget`
  (`PLTF-07`).
- **The API explorer does not execute requests against production.** See Non-goals; PRD §20.2 gives
  exactly one sandbox organisation and it is `PLTF-04`'s.

## Goal

Produce the `developer` web feature area with its `/developer/api` screen and the `docs/api/**`
documentation set, such that a platform developer can read the frozen `/v1` contract, copy a working
Search and Answer example in curl, TypeScript and Python, and find the authentication, idempotency,
pagination, error, async-job, SSE-resume and webhook-verification rules — with every derivable page
generated from `schemas/openapi/**` and `schemas/events/**` rather than transcribed. Completion is
mechanically checkable: the rendered endpoint list equals `FND-04`'s
`prd-16-2-endpoints.json` fixture exactly; the rendered error catalogue equals the document's 17
`components/responses` entries exactly; `pnpm generate && pnpm generated:check` leaves
`docs/api/reference/**` diff-free; the area registers with zero diff outside its own directory; and
no secret and no research content appears anywhere on the page or in a URL.

## Non-goals

- **No OpenAPI document, no generated bindings, no enum members** — `00-foundation` (`FND-04`,
  `FND-03`), PRD §44.3 serial-owned. This ticket **reads** `schemas/openapi/**`; it never writes it
  and never hand-edits generated output (PRD §20.1).
- **No service-account, webhook or widget screens** — `PLTF-07` (`blocked_by` this ticket), which
  owns `apps/web/src/features/developer/{service-accounts,webhooks,widget}/**` and the
  credential-derived half of PRD §32.8 (sub-PRD **D15**).
- **No usage screen and no live limit values** — `PLTF-08` (`apps/web/src/features/usage/**`) and
  `PLTF-09` (`/v1/usage/limits`).
- **No SDK code** — `PLTF-02` (`packages/sdk-typescript/**`), `PLTF-03` (`sdk/python/**`). This
  ticket documents their install and quickstart; the snippets it publishes are the ones those
  tickets' example suites execute (deliverable 6).
- **No widget code** — `PLTF-05`/`PLTF-06` (`apps/widget/**`). The embed guide's snippet is prose
  here; the runtime is theirs.
- **No sandbox provisioning API** — `PLTF-04` (`apps/api/src/routes/sandbox/**`).
- **No request execution against production `/v1`.** An "explorer" that issues live authenticated
  calls from a browser page is out of scope: PRD §20.2 permits exactly *"One strictly isolated
  sandbox organisation in production"* and it is provisioned by `PLTF-04`. This screen renders the
  contract and copyable examples; the sandbox affordance links to `PLTF-07`'s widget/sandbox surface
  once it exists (sub-PRD **Q-PLTF-7**).
- **No web shell, navigation slots, organisation switcher, status badges or `apps/web/src/lib/**`** —
  `RUNT-05`.
- **No shared UI primitives** — `packages/ui` is `RUNT-06` (breakdown plan **A6**). This screen
  composes them; it defines no second component set.
- **No runbooks, policies, ADRs or release docs** — `docs/runbooks/**` is `18-ops-release`,
  `docs/policies/**` and `docs/release/**` are `24-launch`, `docs/adr/**` is per-file under
  breakdown plan **A9**.
- **No cross-boundary suites** — `tests/**` is `23-assurance`; this ticket carries its own
  co-located assertions (breakdown plan §9 **R8**).

## File-scope (write-owns)

- `apps/web/src/features/developer/feature.tsx` — the A1 entry file for the whole `developer` area
  (sub-PRD **D13**).
- `apps/web/src/features/developer/section-contract.ts` — the `DeveloperSection` type `PLTF-07`
  implements.
- `apps/web/src/features/developer/section-registry.ts` — the `import.meta.glob('./*/section.tsx')`
  discovery and ordering.
- `apps/web/src/features/developer/developer-context.ts` — the area-level read-only context
  (environment, base URL, API version, OpenAPI version) and the named credential-panel slot.
- `apps/web/src/features/developer/api/**` — the `/developer/api` screen, its co-located tests and
  its fixtures.
- `docs/api/**` — `docs/api/guides/**` (prose) and `docs/api/reference/**` (generated, banner-marked).
- `apps/web/package.json` — **append-only**, and only if a dependency is genuinely required
  (breakdown plan §1.1; sub-PRD **Q-PLTF-4**). Prefer adding none.

Does not touch:

- `apps/web/src/features/developer/{service-accounts,webhooks,widget}/**` — `PLTF-07`.
- `apps/web/src/features/usage/**` — `PLTF-08`.
- `apps/web/src/{app,shell,lib}/**`, `apps/web/src/features/home/**`, `apps/web/test/**`,
  `apps/web/{index.html,vite.config.ts,tsconfig.json}` — `RUNT-05`.
- Every other `apps/web/src/features/*` area — `13`, `14`, `15`, `16`, `17`, `19`, `24`.
- `schemas/openapi/**`, `schemas/events/**`, `packages/contracts/**` — `FND-03`/`FND-04`/`FND-05`,
  serial-owned; read-only from here.
- `packages/ui/**` — `RUNT-06`; `packages/sdk-typescript/**` — `PLTF-02`; `sdk/python/**` —
  `PLTF-03`; `apps/widget/**` — `PLTF-05`/`PLTF-06`.
- `apps/api/**`, `apps/worker/**`, `apps/admin/**`, `services/**`, `pipelines/**`, `infra/**`,
  `tests/**`, `evals/**`, root manifests, lockfiles, `.github/workflows/**`.
- `docs/PRD.md`, `docs/prd/**` other than this module's own writeback targets, `docs/runbooks/**`,
  `docs/policies/**`, `docs/release/**`.

**Serial-safety analysis.** This is the **first** decomposition (breakdown plan §1: phase 1,
`append: false`, `usedIds: []`, `existingFiles: ['.gitkeep']`) — nothing is merged, nothing is in
flight, so no prior ticket has written these paths and none contends for them. Under `RUNT-05`'s A1
web contract, `apps/web/src/features/developer/` is discovered by a glob, so creating it produces
**zero** diff outside its own directory; it is therefore disjoint from every other module's feature
area. Within this module the four subtrees are pairwise disjoint by construction and breakdown plan
§44.3 names *"Web screens against frozen contracts"* and *"independent SDK languages"* as canonical
safe parallel units: the TypeScript SDK (`packages/sdk-typescript/**`), the Python SDK
(`sdk/python/**`), the widget (`apps/widget/**`) and the route areas
(`apps/api/src/routes/{sandbox,usage,audit-events}/**`) share no file with this ticket or with each
other. The single intra-area overlap risk — the `developer` area's entry files — is resolved by
sub-PRD **D13**: they belong to this ticket, and `PLTF-07` is `blocked_by` this ticket, so the two
are never concurrent. `docs/api/**` is written by no other ticket in the 236-ticket plan (breakdown
plan §4).

## Deliverables

1. **`apps/web/src/features/developer/feature.tsx`** — default-exported `FeatureModule` with
   `id: 'developer'` (equal to the directory name), `nav: { slot: 'DEVELOPER', label: 'Developer',
   to: '/developer/api', visibleWhen }`, and `routes` produced by the section registry
   (deliverable 3) with `/developer/api` always present. `visibleWhen` reads the permission decision
   from `RUNT-05`'s `ShellSessionContext` — **no role string literal appears in this area** (PRD
   §38.1 is `FND-06`'s; PRD §45.2). `onOrganizationChange` drops every cached document, example and
   limit table.
2. **`developer-context.ts`** — a read-only React context exposing
   `{ environment: 'PRODUCTION' | 'SANDBOX', baseUrl, apiVersion, openApiVersion, documentedLimits }`
   plus `CREDENTIAL_PANEL_SLOT`, the named slot `PLTF-07` fills. `environment` comes from the shell
   (PRD §31.1: the shell *"MUST always display the active organisation, environment"*); `baseUrl` and
   `apiVersion` come from the loaded document's `servers` and `info.version`; `openApiVersion` is the
   document's `openapi` field. **No value on this screen is a hard-coded literal** — a source scan
   asserts it.
3. **`section-contract.ts` + `section-registry.ts`** — `export interface DeveloperSection { id;
   path; title; order?; element }` and a registry built from
   `import.meta.glob('./*/section.tsx', { eager: true })`. Rules, all failing the build with a named
   error rather than silently: a directory without `section.tsx`; a `section.tsx` with no default
   export; two sections with the same `id` or the same `path`; a `path` outside `/developer/`.
   Ordering is `order` then `id`, so adding a section never reorders the existing ones. This is the
   contract `PLTF-07` implements; changing it after `PLTF-07` starts is a docs PR on both tickets.
4. **`apps/web/src/features/developer/api/section.tsx`** — the `/developer/api` screen. It renders,
   in this order:
   1. **Environment header** — active organisation, `PRODUCTION`/`SANDBOX` badge, base URL, API
      version, OpenAPI document version, and the release/degraded badges the shell supplies
      (PRD §31.1, §32.8).
   2. **The credential panel slot** — `CREDENTIAL_PANEL_SLOT`, rendering a labelled empty state
      ("no service credential yet — create one in Service accounts") until `PLTF-07` fills it
      (sub-PRD **D15**). It **never** renders a secret (PRD §32.8 *"Secrets are never
      redisplayed"*).
   3. **Endpoint reference** — every operation in the loaded document, grouped by the PRD §16.2
      headings, each with method, path, summary, required scope where the document declares one,
      request and response schema, and the error responses the operation references. Enum values are
      shown from the document's `$ref`'d schemas; **no enum member is written out in this area**
      (PRD §35.1).
   4. **Error catalogue** — the 17 PRD §34.9 codes read from `components/responses`, each with HTTP
      status, `retryable` and the user action. Rendered from the document, never from a local table.
      Includes the §34.9 closing note that domain answer statuses such as `INSUFFICIENT_EVIDENCE`
      are completed results, not HTTP errors (sub-PRD **D4**).
   5. **Conventions** — the PRD §34.1 table (IDs, dates, nulls, money, pagination, idempotency,
      versioning, concurrency, tenant) rendered from `docs/api/reference/conventions.*`.
   6. **Documented limits** — the PRD §38.5 trial/paid-pilot/system table with a link to `/usage`
      for live values, labelled *"documented defaults — see Usage for your current limits"*
      (accepted caveat above).
   7. **Copyable examples** — deliverable 5.
   The screen implements the applicable PRD §31.3 states for its document load (`IDLE`,
   `VALIDATING`, `COMPLETED`, `FAILED`) with a visible title, plain-language explanation, allowed
   next action and request id, using `packages/ui`'s async-state components (`RUNT-06`).
5. **Copyable Search and Answer examples in three languages** (PRD §31.2 *"Curl/TS/Python Search
   example"*, §32.8 *"copyable Search/Answer examples"*). Each example is built from
   `schemas/openapi/examples/**` — the PRD §34.2 search request/response and the PRD §34.3 create-answer-job
   request — so the body shown is byte-identical to the normative payload. Each has a copy control
   with an accessible confirmation. The TypeScript and Python snippets are the **same strings**
   published in `docs/api/guides/quickstart.*`, which `PLTF-02` and `PLTF-03` execute in their
   example suites (deliverable 6). No example contains a credential, a token or a placeholder that
   looks like one beyond an obvious `$AER_API_KEY` shell variable.
6. **`docs/api/guides/**` (prose, hand-written)** — at minimum:
   `getting-started.md`, `authentication.md` (session cookie versus service credential versus widget
   session; PRD §38.2's *"API keys do not use cookies"*), `idempotency.md` (PRD §34.1's 16–128
   character key rule and the 409-on-changed-body semantics), `pagination.md`, `errors.md` (prose
   only — the table is generated), `async-jobs-and-sse.md` (PRD §16.2's job endpoints, PRD §34.4's
   nine allowed event types, `Last-Event-ID` resume, and the `answer.section`-is-provisional rule),
   `webhooks.md` (PRD §34.8's headers, the `<timestamp>.<raw_request_body>` signature input, the
   five-minute replay window, the raw-body warning, and verification snippets in curl/TS/Python),
   `sdk-typescript.md`, `sdk-python.md`, `widget.md` (embed snippet, exact-origin requirement, the
   backend-mints-the-session rule and the CSP header `18-ops-release` should set — sub-PRD
   **Q-PLTF-5**), `sandbox.md`, `rate-limits.md`, `versioning.md` (PRD §16.1: *"Optional fields may
   be added within v1; breaking changes require v2"*).
7. **`docs/api/reference/**` (generated, sub-PRD D23)** — `endpoints.md`, `errors.md`, `scopes.md`,
   `conventions.md`, `events.md`, each produced from `schemas/openapi/**` / `schemas/events/**` by a
   generator in this ticket's scope, each beginning with
   `<!-- GENERATED FROM schemas/openapi/openapi.yaml — DO NOT EDIT (PRD §20.1) -->`, and each wired
   into `pnpm generate` / `pnpm generated:check` so a stale file fails CI. The generator itself is
   deterministic: sorted output, no timestamps, no absolute paths.
8. **Endpoint-completeness binding** — the screen and `docs/api/reference/endpoints.md` are both
   asserted against `packages/contracts/test/openapi/prd-16-2-endpoints.json` (`FND-04`
   deliverable 8), read read-only. An operation in the document that the reference omits, or a
   reference entry with no operation, fails.
9. **`/internal/v1` is excluded from the customer-facing reference.** The document declares the
   `/internal/v1` server (`FND-04` deliverable 1); this screen and `docs/api/reference/**` render
   only `/v1` operations. PRD §8.11: internal administration *"MUST NOT be shipped in customer
   SDKs"* — and it does not belong in the customer's API reference either. A test asserts no
   `/internal/v1` path is rendered.
10. **Co-located tests** under `apps/web/src/features/developer/api/__tests__/**` and
    `apps/web/src/features/developer/__tests__/**`, plus the offline fixtures they need. Cache keys
    used by this area are produced with `orgScopedKey(...)` and asserted with `RUNT-05`'s exported
    `apps/web/test/org-scope-conformance.ts` helper (read-only import).

Ordering constraint: deliverable 3 before 4 (the registry types the screen registers through), and
deliverable 7's generator before deliverable 8's assertion (the assertion reads the generated file).

## Acceptance checklist (classified)

- [ ] `[machine]` The `developer` feature area consisting of `feature.tsx` plus its own files
      registers `/developer/api` and claims the `DEVELOPER` nav slot with **zero** diff to any
      tracked file outside `apps/web/src/features/developer/` — asserted with `RUNT-05`'s exported
      feature-area conformance helper (breakdown plan **A1**; `RUNT-05` contract item 6)
- [ ] `[machine]` The nav slot claimed is exactly `DEVELOPER` from `RUNT-05`'s frozen tuple; the area
      claims no second slot and inserts none (PRD §31.1 item 9; `RUNT-05` contract item 3)
- [ ] `[machine]` Section-registry negative tests: a directory without `section.tsx`, a `section.tsx`
      with no default export, two sections sharing an `id`, two sharing a `path`, and a `path`
      outside `/developer/` each fail the build with an error naming the offender (deliverable 3)
- [ ] `[machine]` Adding a scratch section directory registers a new route with **zero** diff to any
      file this ticket owns — the property `PLTF-07` depends on (sub-PRD **D13**)
- [ ] `[fixture]` **Endpoint completeness (`DEV-001`)**: the rendered endpoint list and
      `docs/api/reference/endpoints.md` both equal the operation set of `schemas/openapi/openapi.yaml`
      restricted to `/v1`, and cross-check against `packages/contracts/test/openapi/prd-16-2-endpoints.json`;
      an operation present in one and absent from the other fails (PRD §16.2; `FND-04` deliverable 8)
- [ ] `[fixture]` **Error catalogue fidelity**: the rendered catalogue equals the document's 17
      `components/responses` entries with the exact HTTP status and `retryable` value; no code is
      added, renamed or dropped, and no local error table exists — source scan (PRD §34.9; `FND-04`
      deliverable 2)
- [ ] `[fixture]` **Example fidelity**: every copyable example's request body is byte-identical to
      the corresponding file under `schemas/openapi/examples/**`, and the TypeScript/Python snippets
      are string-identical to those published in `docs/api/guides/quickstart.*` (PRD §34 preamble;
      §31.2; §32.8)
- [ ] `[machine]` **Generated-diff clean (`DEV-001`)**: `pnpm generate && pnpm generated:check`
      exits 0 and leaves `git status --porcelain` empty; every file under `docs/api/reference/**`
      carries the do-not-edit banner; a hand-edit to any of them is detected by `generated:check`
      (PRD §20.1, §30.2 `DEV-001`)
- [ ] `[machine]` The generator is deterministic: two consecutive runs produce byte-identical output
      with no timestamp, absolute path or non-deterministic ordering (PRD §20.1; `FND-04` friction 4)
- [ ] `[machine]` **PRD §32.8 field coverage owned here**: environment, base URL, API version,
      OpenAPI version, documented limits and copyable Search **and** Answer examples are each present
      and each sourced from the document or the shell, never a literal — source scan asserts no
      hard-coded base URL, version or enum member in this area (PRD §32.8, §35.1)
- [ ] `[machine]` **Secrets never appear**: no code path in this area renders, stores or logs a
      credential, a widget token or a `secret`-shaped field; the credential panel slot renders an
      empty state until filled (PRD §32.8 *"Secrets are never redisplayed"*; §22)
- [ ] `[machine]` No `/internal/v1` operation is rendered on the screen or in
      `docs/api/reference/**` (PRD §8.11; deliverable 9)
- [ ] `[machine]` **No role literal and no permission logic** in this area; visibility comes from the
      shell's permission decision (PRD §38.1 is `FND-06`'s; PRD §45.2; breakdown plan §9 **R5**)
- [ ] `[machine]` **Organisation scoping**: every cache key this area creates is produced by
      `orgScopedKey(...)`, and switching organisation clears them — asserted with `RUNT-05`'s
      `apps/web/test/org-scope-conformance.ts` (PRD §31.1; `AUTH-002`)
- [ ] `[machine]` **PRD §41.1 universal UI acceptance**: no research content in any URL query
      string, page title or error-telemetry payload; request/job ids copyable from errors; dates
      rendered as `3 Aug 2026` while payload examples stay ISO; colour is never the only status
      signal (PRD §41.1)
- [ ] `[machine]` **PRD §13.1 accessibility**: zero WCAG 2.2 AA violations at 360 px, 768 px and
      1280 px using `RUNT-06`'s exported harness; complete keyboard operation with visible focus; one
      programmatic page heading; labelled fields; live region for the document-load status
      (PRD §13.1, §41.1)
- [ ] `[machine]` The applicable PRD §31.3 async states for the document load (`IDLE`, `VALIDATING`,
      `COMPLETED`, `FAILED`) each render a title, plain-language explanation, allowed next action and
      request id — a spinner alone fails (PRD §31.3)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (standing item, PRD §20.3, §45.3)
- [ ] `[human]` **Founder review of the developer entry experience** — a developer who has never seen
      the product can, from `/developer/api` and `docs/api/guides/getting-started.md` alone, identify
      the base URL, authenticate, run the Search example and find the webhook signature rule
      (PRD §43.4; §41.3 step 7 *"show API request, widget sandbox, usage limit and security/retention
      settings"*; sub-PRD proposed `UAT-DEV-01`). Runs at Gate 2 — **not required to merge**
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**`DEV-001`**, `E27-DEVELOPER`,
      proposed `UAT-DEV-01` per sub-PRD **Q-PLTF-1**), user-visible change and non-goals,
      schema/API/event compatibility impact (none — read-only consumer of `FND-04`), tenant/PII/
      security impact (no secret rendered; no research content in URLs or telemetry), source/licence
      impact (none), cost/memory/latency impact (static assets only), rollback path (revert; the
      feature area disappears with zero diff elsewhere), known gaps (**Q-PLTF-4** manifest,
      **Q-PLTF-7** sandbox route)
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python **source** is written here;
      the Python quickstart snippet is prose executed by `PLTF-03`'s suite (PRD §45.3)
- No origin-validation criteria — this ticket ships no cross-origin surface; exact-origin validation
      is `PLTF-05`/`PLTF-06` (PRD §8.10)
- No SDK-telemetry criteria — this ticket emits no SDK telemetry; the closed allowlist is
      `PLTF-02`/`PLTF-03` (sub-PRD **D7**)

## Test plan

Reviewer steps, all offline: no network, no live API, no running server. `schemas/openapi/**` and
`packages/contracts/**` are read from the working tree.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @<scope>/web`. Suites live under
   `apps/web/src/features/developer/__tests__/**` and `.../developer/api/__tests__/**`. Build them on
   the construction pattern of `RUNT-05`'s own feature-area tests and `14-search-product`'s
   co-located screen tests.
3. **`area-registration.test.ts`** — mount the feature registry over a `mkdtemp` copy of
   `apps/web/src/features` containing only `developer/`; assert `/developer/api` registers and the
   `DEVELOPER` slot is claimed; then `git status --porcelain` must be clean.
4. **`section-registry.test.ts`** — the five negative cases from deliverable 3, each asserting the
   error message names the offending directory or path. Then add a scratch `zz-example/section.tsx`
   and assert its route appears with no diff to any file this ticket owns.
5. **`endpoints.test.ts`** — load `schemas/openapi/openapi.yaml` through `FND-04`'s
   `loadOpenApiDocument()`; build the rendered list; compare three ways: rendered ↔ document (`/v1`
   only), rendered ↔ `docs/api/reference/endpoints.md`, and rendered ↔
   `packages/contracts/test/openapi/prd-16-2-endpoints.json`. Confirm the assertion is
   **bidirectional** — a one-way subset check would pass with a missing endpoint.
6. **`errors.test.ts`** — assert the rendered catalogue equals `components/responses`; then grep this
   area for the literal strings `INSUFFICIENT_EVIDENCE`, `RATE_LIMITED` and `409` and confirm they
   appear only in test fixtures, never as a rendering source.
7. **`examples.test.ts`** — byte-compare each copyable request body with its file under
   `schemas/openapi/examples/**`, and string-compare the TS/Python snippets with
   `docs/api/guides/quickstart.*`. Open one example beside PRD §34.2 and confirm no property was
   renamed — a renamed property is a ticket failure, not a style choice.
8. **Generated-diff check.** `pnpm generate && pnpm generated:check`; `git status --porcelain` must
   be empty. Run `pnpm generate` twice and byte-compare the two outputs. Then hand-edit one line of
   `docs/api/reference/errors.md`, re-run `pnpm generated:check`, confirm it fails, restore.
9. **`no-internal.test.ts`** — assert no `/internal/v1` path is rendered or documented.
10. **`no-literals.test.ts`** — source scan over `apps/web/src/features/developer/**` for a
    hard-coded base URL, `"/v1"` outside the document loader, an API version string, an enum member,
    or a role name (`'OWNER'`, `'ADMIN'`, `'DEVELOPER'`, …). Any hit fails.
11. **`org-scope.test.ts`** — import `apps/web/test/org-scope-conformance.ts` (`RUNT-05`) read-only
    and assert this area's cache keys comply and are purged on switch.
12. **`a11y.test.ts`** — `RUNT-06`'s exported accessibility harness at the three widths; assert zero
    violations and one `h1`.
13. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether any
    rendering path could interpolate a credential or a widget token into the DOM or a copy buffer;
    whether the copy control can be tricked into copying more than the shown snippet; whether the
    section registry's ordering is stable when two sections share an `order`; whether the document
    loader can be pointed at a URL rather than the repository file (it must not fetch at runtime in
    tests); whether an organisation switch can leave a stale document or limit table cached.
14. The `[human]` row runs against a locally started stack (`pnpm stack:up`, `RUNT-09`) at Gate 2 and
    is recorded in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies anything in this ticket, update **this ticket file**
first (version note + changelog line in the PR), re-publish with
`.claude/scripts/publish-tickets.mjs --sync`, then change code. Silent divergence is an incomplete
ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **The OpenAPI document is missing an operation, a scope declaration or a schema the reference must
  show.** → **Never edit `schemas/openapi/**` and never publish a hand-written substitute.** Raise a
  docs PR against `docs/prd/00-foundation/tickets/FND-04-*.md` (its Feedback obligation item 3 names
  exactly this path: *"a new ticket in `00-foundation` … recorded on `docs/prd/breakdown-plan.md`,
  with the requesting ticket `blocked_by` it"*), record the gap in
  `docs/prd/20-developer-platform/README.md` under **Q-PLTF-8**, and add the edge in
  `docs/prd/breakdown-plan.md` §5.1/§6.2.
- **`RUNT-05`'s `FeatureModule` contract cannot express a section-level route or the nav predicate.**
  → Amend `RUNT-05`'s A1 web registration contract and this ticket's deliverable 1 in **one** docs PR
  and `--sync` both. Never write `apps/web/src/{app,shell,lib}/**` from here.
- **A dependency is genuinely needed in `apps/web/package.json`** (for example a YAML or Markdown
  renderer). → That manifest is `03-app-runtime`'s. Follow whatever `14-search-product`'s **Q-FIND-1**
  settles, record the addition in `docs/prd/20-developer-platform/README.md` under **Q-PLTF-4**, keep
  the change append-only, and regenerate `pnpm-lock.yaml` — never hand-merge it (breakdown plan §4.1).
- **PRD §32.8's credential fields cannot wait for `PLTF-07`** (for example a reviewer reads the
  requirement as one-screen). → Do **not** add an `IDNT-06` dependency here; that is a plan change.
  Amend sub-PRD **D15** in `docs/prd/20-developer-platform/README.md` and, if the edge is genuinely
  required, raise it in `docs/prd/breakdown-plan.md` §5.21/§6.2 **before** coding.
- **A `docs/api/reference/**` page cannot be generated deterministically** (ordering, absolute paths,
  a tool that stamps a date). → That falsifies `DEV-001`'s mechanism, exactly as `FND-04` friction 4
  describes. Fix determinism; if it cannot be fixed, create `docs/adr/NNNN-api-docs-generation.md`
  (breakdown plan **A9**, PRD §45.5) and escalate. **Never** loosen `generated:check` to a fuzzy
  comparison and never move a generated page into `guides/` to dodge it.
- **The examples cannot be both copyable and byte-identical to `schemas/openapi/examples/**`** (for
  example the example lacks a field the snippet needs). → The PRD §34 shapes *"cannot drift … without
  PRD/API change control"*. Raise it against `FND-04`, record it in
  `docs/prd/20-developer-platform/README.md`, and never edit an example to suit a snippet.

**3. Escalation.** PRD §20.1 (*"Generated OpenAPI/SDK/event/manifest bindings MUST NOT be
hand-edited"*) and `DEV-001`'s evidence (*"Generated-client diff is clean in CI"*) are release
requirements with MUST force, and `PLTF-07` is `blocked_by` this ticket. If the reference genuinely
cannot be generated from the frozen document — for instance because OpenAPI 3.1 cannot carry
something PRD §16.2 requires — that overturns PRD §34's "generated-code source of truth" decision.
Stop, raise an ADR under `docs/adr/`, write back to `docs/prd/breakdown-plan.md` §4.1, and escalate
to the human. Never publish a hand-maintained parallel API reference.
