---
id: PLTF-09
title: Usage, limits and audit endpoints
module: 20-developer-platform
lane: 20-developer-platform
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-02, DATA-07]
blocks: [PLTF-08, ASSR-01]
---

# PLTF-09 — Usage, limits and audit endpoints

Implements PRD §16.2 (primary endpoints — export, usage, audit and issues), §38.5 (initial rate and
concurrency defaults) and §22 (observability), carrying requirement **`OPS-003`** ("Founder-funded
monthly spend stops at A$50 and search remains usable" — this module owns its **visibility** half,
epic `E27-DEVELOPER`).
**No ADR — the decision is already made in PRD §16.2 (the four endpoint paths), §38.5 (the ledgers
are separate) and §38.1 (who may read usage and audit); this is build ticket 9 of 9 against it.**
Parent sub-PRD: [20-developer-platform README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `RUNT-02` — Admission middleware chain
([`03-app-runtime`](../../03-app-runtime/README.md)); `DATA-07` — Usage, monitor, issue/correction,
audit, incident tables ([`01-app-data`](../../01-app-data/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
— PRD §16.2 names the paths, `DATA-07` owns the ledger and audit repositories and `RUNT-02` the
admission chain; this maps them onto `/v1` over the frozen PRD §34.1/§34.9 wire contract.

## Background + basis

**The endpoints are named by the PRD.** PRD §16.2, the *"Export, usage, audit and issues"* group:

> - `POST /v1/exports`, get/cancel export jobs
> - **`GET /v1/usage/current`, `/events`, `/limits`**
> - **`GET /v1/audit-events`**
> - create/list/get/comment `/v1/issues`
> - `GET /v1/system-status`

Only the two middle lines are this ticket's; exports are `19-exports`, issues are `17-records-collab`
and `system-status` is `RUNT-08`.

**The ledgers are separate, and that is normative.** PRD §38.5:

> Rate-limit responses include `Retry-After`, limit, remaining and reset metadata **without
> disclosing other tenants**. **Search, answer credits, advanced-task credits, API calls and provider
> cost are separate ledgers; exhausting one does not misreport the others.**

and PRD §24.4:

> - `FOUNDER_PLATFORM_BUDGET`: trial/internal usage.
> - `CUSTOMER_PREPAID_OR_BYOK`: customer-funded variable model cost.

Sub-PRD **D19** applies: balances are read **per `(funding_ledger, operation_ledger)` pair** and are
never summed across pairs by this API.

**The ledger already exists and must not be re-implemented.** `DATA-07` deliverable 3, quoted for
cold start:

> `packages/database/src/repos/operations/usageLedger.ts`:
> - columns include `funding_ledger` (`FOUNDER_PLATFORM_BUDGET` | `CUSTOMER_PREPAID_OR_BYOK`,
>   PRD §24.4), `operation_ledger` (search / answer credits / advanced-task credits / API calls /
>   provider cost — PRD §38.5's "separate ledgers"), `entry_type`
>   (`RESERVATION` | `SETTLEMENT` | `RELEASE`), `units`, `cost_micro_aud` INTEGER (PRD §34.1),
>   `job_id`, `idempotency_key`, `created_at`;
> - repository exposes `reserve`, `settle`, `release` and `balance` only — no update, no delete
>   (`APPEND_ONLY`); a `BEFORE UPDATE/DELETE` trigger aborts;
> - **`balance(ctx, { fundingLedger, operationLedger, period })` is computed from entries, never from
>   a stored running total, and each `(fundingLedger, operationLedger)` pair is independent**
>   (PRD §38.5).

and `DATA-07` deliverable 8 for audit:

> `audit_event` is `APPEND_ONLY` with a `BEFORE UPDATE/DELETE` trigger; columns are actor, tenant,
> action, resource type/id, result, request id, IP, session metadata, timestamp. The repository API
> accepts **no free-text body parameter**, and a schema assertion proves **no column can hold a
> research body or credential** (PRD §35.6 "no complete research body/credential", §22).

**Who may read what — sub-PRD D20, read column by column from PRD §38.1:**

> | View organisation usage | ✓ | ✓ | own usage | — | API/service usage subset | own usage |
> | View audit/security events | ✓ | ✓ limited | — | — | credential events only | — |

Columns are Owner, Admin, Researcher, Viewer, Developer, **Service account**. So a service credential
**may** read usage (*"own usage"*) and **may not** read audit events (**—**). PRD §16.3's example
scope list contains `usage:read` and no audit scope, which agrees. The decision itself comes from
`FND-06.evaluate()`; **this area re-states no role rule** (PRD §45.2; breakdown plan §9 **R5**).
Sub-PRD **Q-PLTF-6** records that adding an `audit:read` scope would be a product/API change, not an
implementation choice.

**Observability content rules.** PRD §22:

> - Logs MAY include technical IDs/hashes, operation, status, latency, cost and versions.
> - **Logs MUST exclude research/evidence content, PII text, credentials, assertions and provider
>   payloads.**
> - Audit/security records retain 12 months separately and are backed up.

The same content boundary applies to these **responses**: a usage event and an audit event carry
identifiers and structured metadata only.

**Wire rules.** PRD §16.1 (`/v1`, `request_id`, organisation from authenticated context). PRD §34.1:
opaque ids *"clients never parse them"*; ISO 8601 UTC; **`page_size` 1–100 default 25 with an opaque
`next_cursor`**; *"Money | Integer micro-AUD for internal cost; never floating point"*; **tenant
never in a request body**. PRD §16.5's order: *"authenticate → resolve organisation → verify
membership/service account → evaluate permission → perform tenant-scoped lookup. **Other-tenant and
absent opaque IDs return the same not-found response.**"* PRD §34.9 is the closed catalogue;
reachable here: `400 INVALID_REQUEST`, `401 AUTHENTICATION_REQUIRED`, `404 RESOURCE_NOT_FOUND`,
`429 RATE_LIMITED`, `500 INTERNAL_ERROR`. **PRD §34 contains no usage or audit payload example**
(§34.2–§34.8 cover other domains), so sub-PRD **Q-PLTF-8** applies: the binding shapes are §34.1 +
§34.9 + `DATA-07`'s columns + the generated types from `FND-04`'s OpenAPI. Never edit
`schemas/openapi/**` from here.

**Routing and the shared toolkit.** `RUNT-01`'s A1 contract makes `apps/api/src/routes/usage/` and
`apps/api/src/routes/audit-events/` autoloaded areas at `/v1/usage` and `/v1/audit-events` (contract
item 4: *"Default prefix is `/v1/<area-id>`"*), each in its own Fastify encapsulation context (item 5)
and each adding **zero** diff outside its own directory (item 6). `IDNT-01`'s
`apps/api/src/routes/auth/_lib/**` toolkit (`getIdentityContext`, `mapAuthFailure`,
`emitIdentityAudit`, the route presets) is imported read-only, as `IDNT-06`/`IDNT-07` do.

**Two downstream tickets depend on this one** (breakdown plan §6.2): `PLTF-08` renders these
endpoints, and **`23-assurance`/`ASSR-01`** — the tenant-isolation attack suite — is `blocked_by`
this ticket, so the tenant boundary here must be right the first time, not discovered later
(breakdown plan §9 **R8**: *"every product ticket carries its own co-located tenant/PII/citation
assertions … so `23-assurance` confirms rather than discovers"*).

**Accepted caveats carried forward, documented not enforced here:**

- **Enforcement of the 90%/100% stops is `12-evidence-safety`/`EVID-08`'s** (PRD §42.6's reservation
  and breaker) and the global operator console is `22-internal-admin`/`INTL-07`'s. Neither is on this
  ticket's dependency path (breakdown plan §6.2). This ticket **reports**; it stops nothing.
- **Rate limiting of these endpoints themselves is `RUNT-02`'s** — they consume the PRD §38.5 *API
  calls* ledger like any other `/v1` read.
- **Durable audit persistence semantics are `DATA-07`'s**; `13-identity-surface`'s **OQ3** tracks the
  identity-side sink question. This ticket **reads** `audit_event`; it defines no new column.
- **No customer-facing audit screen exists.** PRD §31.2's route table has none, so `PLTF-08` adds
  none; the endpoint exists because PRD §16.2 lists it.

## Goal

Produce the `apps/api/src/routes/usage/` and `apps/api/src/routes/audit-events/` route areas serving
`GET /v1/usage/current`, `GET /v1/usage/events`, `GET /v1/usage/limits` and `GET /v1/audit-events`,
such that a caller can see exactly their own organisation's consumption, effective limits and audit
trail — with the five operation ledgers and two funding ledgers kept independent, no research content
or credential in any payload, and no other tenant's data reachable by any identifier. Completion is
mechanically checkable: balances come from `DATA-07`'s `balance()` per ledger pair and are never
summed; a service credential can read usage but is refused on audit events; pagination honours
PRD §34.1's 1–100 bound with an opaque cursor; another organisation's identifier and an absent one
return byte-identical `404 RESOURCE_NOT_FOUND`; and an architecture assertion finds no unscoped
database import in either area.

## Non-goals

- **No ledger, audit or incident tables, repositories, triggers or arithmetic** — `01-app-data`'s
  `DATA-07` (breakdown plan **A3**; PRD §45.2 gives `packages/database` *"app
  schema/migrations/tenant repositories/outbox/encryption"*). This area calls `balance()` and the
  audit repository and computes nothing itself.
- **No reservation, settlement, release or budget enforcement** — `12-evidence-safety`/`EVID-08` and
  `packages/domain/src/budget` (`FND-09`), PRD §42.6. This area performs **no** budget arithmetic and
  writes **no** ledger entry.
- **No admission stages, no rate limiting, no idempotency handling** — `RUNT-02`. These areas declare
  an admission profile.
- **No permission matrix** — `FND-06` (`00-foundation`). No role literal appears here.
- **No global or operator cost console** — `22-internal-admin`/`INTL-07` (`/internal/v1`). PRD §8.11
  keeps internal administration separate and out of customer SDKs.
- **No usage screen** — `PLTF-08` (`apps/web/src/features/usage/**`), which is `blocked_by` this
  ticket.
- **No export, issue or `system-status` endpoints** — `19-exports`, `17-records-collab`, `RUNT-08`,
  even though PRD §16.2 lists them in the same group.
- **No sandbox endpoints** — `PLTF-04` (`apps/api/src/routes/sandbox/**`), a sibling area in this
  module with a disjoint directory.
- **No OpenAPI, no enums, no error catalogue** — `FND-03`, `FND-04`, `RUNT-01`.
- **No cross-boundary suites** — `tests/**` is `23-assurance`; `ASSR-01` is `blocked_by` this ticket
  and confirms what this ticket asserts locally (breakdown plan §9 **R8**).

## File-scope (write-owns)

- `apps/api/src/routes/usage/**` — the route area, including its A1 entry file `index.ts`.
- `apps/api/src/routes/audit-events/**` — the route area, including its A1 entry file `index.ts`.
- `apps/api/test/routes/usage/**` and `apps/api/test/routes/audit-events/**` — this ticket's own
  unit/integration tests (breakdown plan §1.1; sub-PRD **D21**, matching `IDNT-06`/`IDNT-07`).
- `apps/api/package.json` — **append-only** if a dependency is genuinely required (breakdown plan
  §1.1). Prefer adding none.

Does not touch:

- `apps/api/src/routes/sandbox/**` — `PLTF-04` (same module, sibling area, disjoint directory).
- `apps/api/src/routes/auth/**` — `IDNT-01`, including `_lib/**`, which this ticket **imports** but
  never writes; `apps/api/src/routes/{invitations,members,mfa,sso,service-accounts,widget-sessions}/**`
  — `IDNT-02`…`IDNT-07`.
- `apps/api/src/routes/{health,system-status}/**` — `RUNT-08`; `apps/api/src/routes/exports/**` —
  `19-exports`; `apps/api/src/routes/{issues,research-records,...}/**` — `17-records-collab`; every
  other area belongs to `14`, `15`, `16` or `22` (breakdown plan §4).
- `apps/api/src/{server.ts,app.ts,bootstrap,errors,plugins,middleware,sse}/**` — `RUNT-01`,
  `RUNT-02`, `RUNT-03`.
- `packages/database/**` — `01-app-data`; `packages/model-gateway/**` — `12-evidence-safety`;
  `packages/auth/**` — `02-auth-core`; `packages/domain/**`, `packages/contracts/**`,
  `schemas/openapi/**` — `00-foundation`; `packages/{ui,observability}/**` — `RUNT-06`, `RUNT-07`.
- `apps/web/**` (including this module's `features/{developer,usage}/**` — `PLTF-01`, `PLTF-07`,
  `PLTF-08`), `apps/widget/**` — `PLTF-05`/`PLTF-06`, `packages/sdk-typescript/**` — `PLTF-02`,
  `sdk/python/**` — `PLTF-03`, `docs/api/**` — `PLTF-01`.
- `apps/worker/**`, `apps/admin/**`, `services/**`, `pipelines/**`, `infra/**`, `tests/**`,
  `evals/**`, root manifests, lockfiles, `.github/workflows/**`.

**Serial-safety analysis.** This is the **first** decomposition (breakdown plan §1: phase 1,
`append: false`, `usedIds: []`, `existingFiles: ['.gitkeep']`) — nothing is merged, nothing is in
flight, so no prior ticket has written these paths and none contends for them. Under the A1 autoload
convention (`RUNT-01` contract items 3–6) `apps/api/src/routes/usage/` and
`apps/api/src/routes/audit-events/` are independent directories whose addition produces **zero** diff
elsewhere — there is no shared route index — so they are disjoint from the seven identity areas, from
`PLTF-04`'s `sandbox`, and from every other module's route areas. The two areas in this ticket are
also disjoint from each other and are deliberately kept as two directories rather than one, because
PRD §38.1 gives them **different** principal rules (sub-PRD **D20**) and the A1 prefix derivation
maps `/v1/usage` and `/v1/audit-events` from the directory names. The module-wide picture is PRD
§44.3's *"independent SDK languages"* rule realised across five disjoint trees: this ticket and
`PLTF-04` write only `apps/api/src/routes/{usage,audit-events,sandbox}/**`; `PLTF-02` only
`packages/sdk-typescript/**`; `PLTF-03` only `sdk/python/**`; `PLTF-05`/`PLTF-06` only
`apps/widget/**` (split at `react/**`); `PLTF-01`/`PLTF-07`/`PLTF-08` only
`apps/web/src/features/{developer,usage}/**`. No two share a file, so all six wave-1 tickets run as
concurrent lanes (breakdown plan §7: 6 useful lanes). `apps/api/package.json` is append-only shared
(breakdown plan §1.1).

## Deliverables

1. **`apps/api/src/routes/usage/index.ts`** — the A1 entry file: default-exported
   `FastifyPluginAsync` and `export const area = { admission: 'tenant' } satisfies RouteAreaConfig`,
   deriving the prefix `/v1/usage`. Every route uses `IDNT-01`'s `TENANT_ROUTE` preset and declares
   the `usage:read` scope for service-credential principals (PRD §16.3's scope list). Per sub-PRD
   **D20**, a service credential **is** an accepted principal here and sees *"own usage"*, as PRD
   §38.1's row states.
2. **`GET /v1/usage/current`** — the current-period balances. Response:
   `{ period: { start, end, reset_at }, ledgers: [ { funding_ledger, operation_ledger, used, limit,
   remaining, reset_at } ], schema_version, request_id }`, one array entry per
   `(funding_ledger, operation_ledger)` pair the caller is entitled to see. Rules:
   - every `used` comes from `DATA-07`'s `balance(ctx, { fundingLedger, operationLedger, period })`
     — **no total is computed and no pair is summed with another** (PRD §38.5; sub-PRD **D19**);
   - `cost_micro_aud`-derived values are **integers** and are never converted to a float anywhere in
     this area (PRD §34.1);
   - `limit` is omitted when not applicable rather than sent as `0` (PRD §34.1: *"Omit values that are
     not applicable"*);
   - the five operation ledgers are search, answer credits, advanced-task credits, API calls and
     provider cost — their identifiers come from `DATA-07`'s generated enum, and **no ledger name is
     written out in this area** (PRD §35.1); a source scan asserts it.
3. **`GET /v1/usage/events`** — cursor-paginated ledger entries for the caller's own organisation.
   `page_size` 1–100 default 25 with an opaque `next_cursor` (PRD §34.1); `0` and `101` are rejected
   `400 INVALID_REQUEST`. Each entry carries **technical fields only**: `id`, `created_at`,
   `entry_type`, `operation_ledger`, `funding_ledger`, `units`, `cost_micro_aud`, `job_id`. A
   **response content allowlist** — a serialisation-time assertion listing the permitted property
   names — rejects any additional field, mirroring `FND-05`'s structural approach to payload
   minimisation. No question, answer, citation, prompt, provider payload or free text can be present
   (PRD §22, §35.6). Optional filters: `operation_ledger`, `funding_ledger`, `entry_type`, date range
   — all validated against the generated enums.
4. **`GET /v1/usage/limits`** — the caller's **own** effective PRD §38.5 boundaries with remaining and
   reset: search burst, API calls, concurrent Quick, concurrent Deep, concurrent export, webhook
   endpoints and widget session creation. Each entry is `{ boundary, scope, limit, remaining,
   reset_at, kind: 'CUSTOMER_QUOTA' | 'SYSTEM_PROTECTION' }`. Rules:
   - values come from `RUNT-02`'s configured ledger definitions, not from literals here — a source
     scan asserts no PRD §38.5 numeric literal appears in this area (PRD §39.6 layer 1);
   - **no other tenant's figure is included**, and a `SYSTEM_PROTECTION` row states the global
     protection without attributing another tenant's consumption to it (PRD §38.5 *"without
     disclosing other tenants"*);
   - the response is consistent with what `RUNT-02` puts on a `429` (`Retry-After`, limit, remaining,
     reset) so a client sees one story from both places.
5. **`apps/api/src/routes/audit-events/index.ts`** — the A1 entry file: default-exported
   `FastifyPluginAsync` and `export const area = { admission: 'tenant' } satisfies RouteAreaConfig`,
   deriving the prefix `/v1/audit-events`. Per sub-PRD **D20**, this area **rejects a service-account
   principal outright** — PRD §38.1's *"View audit/security events"* service-account column is a
   dash — with the `FND-06`-derived refusal mapped by `mapAuthFailure`. It is a `SENSITIVE_ROUTE`
   where `IDNT-01`'s preset applies, because audit/security records are exactly the *"sensitive
   operations"* PRD §21.1 has in mind.
6. **`GET /v1/audit-events`** — cursor-paginated, tenant-scoped audit trail. `page_size` 1–100 default
   25 with an opaque `next_cursor`. Each entry carries `DATA-07` deliverable 8's columns only:
   `id`, `occurred_at`, `action`, `actor_id`, `actor_type`, `resource_type`, `resource_id`, `result`,
   `request_id`, and bounded session/IP metadata. Rules:
   - the same **response content allowlist** as deliverable 3 — the repository can hold no research
     body or credential (`DATA-07` deliverable 8 asserts the schema), and this route asserts the
     payload too, so a later column addition cannot leak by default;
   - **row visibility follows `FND-06`**: Owner and Admin see the organisation's events (Admin's
     *"limited"* subset as `FND-06` defines it) and a Developer sees **credential events only**
     (PRD §38.1). The filter is `FND-06`'s decision applied to a repository query, **not** a role
     literal in this area;
   - filters: `action`, `resource_type`, `resource_id`, `actor_id`, date range — validated against
     the generated enums;
   - ordering is deterministic (`occurred_at` then `id`) so a cursor cannot skip or repeat a row.
7. **Tenant scoping, by construction.** Both areas obtain their `TenantContext` from `RUNT-02`'s
   admission result and use `DATA-07`'s scoped repositories; neither constructs a connection, and an
   architecture assertion over both directories finds no unscoped `packages/database` import (PRD
   §21.2, §16.5; `SEC-001`). An organisation identifier supplied in body, query or header is rejected
   `400 INVALID_REQUEST` naming the field (PRD §34.1).
8. **Indistinguishable not-found.** Any identifier in these areas — a `job_id` filter, a
   `resource_id` filter, a cursor minted for another organisation — belonging to another organisation
   returns the **same** response as an absent one: `404 RESOURCE_NOT_FOUND` from the same code path,
   byte-identical apart from `request_id` (PRD §16.5; §34.9; `AUTH-002`'s *"Cross-tenant ID matrix
   returns indistinguishable 404"*). This is the property `ASSR-01` is `blocked_by` this ticket to
   confirm.
9. **Cursor integrity.** The opaque cursor encodes the ordering key and is validated on use; a cursor
   minted in another organisation's context, a tampered cursor and an expired cursor are each
   rejected without disclosing why beyond `400 INVALID_REQUEST`/`404 RESOURCE_NOT_FOUND`, and never
   return another organisation's rows (PRD §34.1, §16.5).
10. **No writes.** Both areas are read-only: they create, update and delete nothing, hold no provider
    credential and perform no budget arithmetic. A source scan asserts no `reserve`, `settle`,
    `release`, `INSERT`, `UPDATE` or `DELETE` path exists in either directory (PRD §45.2;
    breakdown plan §9 **R5**). Reading `/v1/audit-events` does itself emit an audit event through
    `IDNT-01`'s `emitIdentityAudit` — a read of the security trail is a security-relevant action
    (PRD §21.2's audited access path) — and that emission is the single exception, made explicitly.
11. **`apps/api/test/routes/{usage,audit-events}/**`** — this ticket's suites, built on `IDNT-01`'s
    exported `apps/api/test/routes/auth/identity-route-harness.ts`, `DATA-04`'s
    `packages/database/test/tenancy/factories.ts` and `DATA-07`'s ledger/audit factories, all
    imported read-only.

Ordering constraint: deliverable 1 before 2–4 and deliverable 5 before 6 (each area's entry file
before its routes); deliverable 7's scoping before any query is written.

## Acceptance checklist (classified)

- [ ] `[machine]` Both areas register as `apps/api/src/routes/{usage,audit-events}/` and serve under
      `/v1/usage` and `/v1/audit-events` with **zero** diff to any tracked file outside those
      directories — asserted with `RUNT-01`'s `apps/api/test/route-area-conformance.ts` (breakdown
      plan **A1**; `RUNT-01` contract item 6)
- [ ] `[machine]` Every route declares an explicit admission profile, and the registered route set
      equals a literal table in the test — exactly four routes, no more (PRD §16.2)
- [ ] `[machine]` **Sub-PRD D20 principal rules**: a verified service credential with `usage:read`
      succeeds on all three `/v1/usage/*` routes and is **refused** on `/v1/audit-events`; a widget
      token is refused on all four; an unauthenticated caller is `401 AUTHENTICATION_REQUIRED`
      (PRD §38.1's *"View organisation usage"* and *"View audit/security events"* rows; §16.3)
- [ ] `[machine]` **`AUTH-003` boundary**: Owner, Admin, Researcher (own usage), Viewer and Developer
      (API/service usage subset; credential audit events only) each get the PRD §38.1 outcome —
      asserted against `FND-06`'s committed fixture
      `packages/domain/test/access/prd-38-1-matrix.json`, with **no role literal** in either area
      (PRD §38.1; §45.2; breakdown plan §9 **R5**)
- [ ] `[machine]` **`OPS-003` ledger independence (PRD §38.5)**: `GET /v1/usage/current` returns one
      entry per `(funding_ledger, operation_ledger)` pair with `used` from `DATA-07`'s `balance()`;
      **no total, no cross-pair sum and no derived aggregate exists in the response or the code** —
      asserted by a response-shape test plus a source scan for aggregate arithmetic (PRD §38.5
      *"exhausting one does not misreport the others"*; §24.4; sub-PRD **D19**)
- [ ] `[machine]` Exhausting one ledger in a fixture leaves every other pair's `used`/`remaining`
      unchanged in the response (PRD §38.5)
- [ ] `[machine]` **No money as float**: every cost value is an integer micro-AUD end to end; a source
      scan finds no floating-point arithmetic or `parseFloat`/`toFixed` on a cost in either area
      (PRD §34.1 *"Integer micro-AUD … never floating point"*)
- [ ] `[machine]` **No ledger name, boundary name or PRD §38.5 numeric literal in these areas** —
      identifiers come from the generated enums and values from `RUNT-02`'s configuration; a source
      scan asserts it (PRD §35.1; §39.6 layer 1)
- [ ] `[machine]` **Response content allowlist**: `GET /v1/usage/events` and `GET /v1/audit-events`
      serialise only their declared property sets; a deliberately added extra field on a repository
      row is **not** emitted, and a canary research string placed in an unexpected column never
      appears in a response (PRD §22 *"Logs MUST exclude research/evidence content, PII text,
      credentials …"*; §35.6; `DATA-07` deliverable 8)
- [ ] `[machine]` **No credential and no secret** appears in any response, log line or error message
      from either area, asserted with a canary (PRD §22; §21.1)
- [ ] `[machine]` **Pagination**: `page_size` 1–100 default 25 on both list routes; `0` and `101` are
      rejected `400 INVALID_REQUEST`; `next_cursor` is opaque and is never parsed by the client
      contract (PRD §34.1)
- [ ] `[machine]` **Cursor integrity**: a cursor minted in another organisation's context, a tampered
      cursor and a malformed cursor are each rejected and **never** return another organisation's
      rows; ordering is deterministic so no row is skipped or repeated across pages (PRD §34.1,
      §16.5)
- [ ] `[machine]` **Tenant isolation (`SEC-001`, PRD §21.2) — the property `ASSR-01` depends on**:
      another organisation's `job_id`, `resource_id`, `actor_id` or cursor and a syntactically valid
      absent one return **byte-identical** `404 RESOURCE_NOT_FOUND` bodies apart from `request_id`;
      the lists return only the calling organisation's rows (PRD §16.5; §34.9; `AUTH-002`
      *"Cross-tenant ID matrix returns indistinguishable 404"*)
- [ ] `[machine]` **Tenant isolation (`SEC-001`)**: an architecture assertion over both areas finds no
      unscoped `packages/database` import — copy the construction pattern from
      `apps/api/test/admission/architecture.test.ts` (`RUNT-02` deliverable 13)
- [ ] `[machine]` **Tenant derivation**: an `organization_id` supplied in body, query or header is
      rejected `400 INVALID_REQUEST` naming the field (PRD §34.1, §16.1)
- [ ] `[machine]` **Read-only**: a source scan finds no `reserve`, `settle`, `release`, insert, update
      or delete path and **no budget arithmetic** in either area; the only write is the audit emission
      for reading `/v1/audit-events` (deliverable 10; PRD §45.2)
- [ ] `[machine]` **`/v1/usage/limits` discloses no other tenant**: a `SYSTEM_PROTECTION` row states
      the global protection without attributing another tenant's consumption, and no other
      organisation's limit, remaining or reset is reachable (PRD §38.5)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (standing item, PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — these areas declare no type of their
      own and hand-edit no generated file (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**`OPS-003`** visibility half,
      `SEC-001`, `AUTH-002`, `E27-DEVELOPER`, proposed `UAT-DEV-01` per sub-PRD **Q-PLTF-1**),
      user-visible change and non-goals, schema/API/event compatibility impact (new paths only;
      **Q-PLTF-8** if `FND-04` lacks them), **tenant/PII/security impact** (indistinguishable 404s,
      response content allowlist, no credential in any payload, audit read is itself audited),
      source/licence impact (none), cost/memory/latency impact (balances computed from entries —
      state the query cost and any index `DATA-07` provides), rollback path (revert; the areas
      disappear with zero diff elsewhere), known gaps (**Q-PLTF-6** no `audit:read` scope;
      enforcement is `EVID-08`'s)
- [ ] `[human]` **Founder review at Gate 2** that the reported figures match what actually happened —
      run a search, a Quick Answer and an export, then read `GET /v1/usage/current` and
      `/v1/usage/events` and confirm each landed in the right ledger and none was double-counted
      (PRD §43.4; §41.3 step 7; proposed `UAT-DEV-01`). **Not required to merge**
- No `[fixture]` criteria — this ticket replays no recorded source or evaluation data; breakdown plan
      §1.1 maps `[fixture]` to PRD §40.8 adapter fixtures and PRD §14/§43 evaluation replays, and this
      module additionally to SDK recorded-response replay — none of which exists at this layer
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)
- No origin-validation criteria — these areas serve no browser-embedded surface; exact-origin
      validation is `PLTF-05`/`PLTF-06` and `AUTC-05` (PRD §8.10)
- No SDK-telemetry criteria — these areas emit no SDK telemetry; the closed allowlist is
      `PLTF-02`/`PLTF-03` (sub-PRD **D7**)

## Test plan

Reviewer steps, offline, no network. Database is a temp-file `app.sqlite` migrated with `DATA-01`'s
runner and seeded through `DATA-04`'s `packages/database/test/tenancy/factories.ts` and `DATA-07`'s
ledger/audit factories; the clock is a settable `FakeClock` so period boundaries are deterministic;
the harness is `IDNT-01`'s exported `apps/api/test/routes/auth/identity-route-harness.ts`. All
imports of other modules' test helpers are read-only.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @<scope>/api`. Suites live under `apps/api/test/routes/usage/` and
   `apps/api/test/routes/audit-events/`.
3. **`area-registration.test.ts`** — reuse `apps/api/test/route-area-conformance.ts` (`RUNT-01`);
   assert the two prefixes, the four routes and each route's admission profile against a literal
   table.
4. **`principal-kind.test.ts`** — call all four routes with (a) a service credential with
   `usage:read`, (b) a service credential without it, (c) a widget token, (d) no credential, (e) each
   of the five roles. Assert the sub-PRD **D20** split: usage succeeds for (a) and the entitled
   roles; `/v1/audit-events` refuses (a), (b) and (c) unconditionally. Read role expectations from
   `packages/domain/test/access/prd-38-1-matrix.json`.
5. **`ledger-independence.test.ts`** — seed entries across all five operation ledgers and both
   funding ledgers; assert one response entry per pair with `used` equal to `DATA-07`'s `balance()`
   for that pair; then drive one pair to its limit and assert every other pair's numbers are
   unchanged. Then a source scan for `reduce`/`+=`/`sum` over ledger values. Confirm the scan fails
   when a deliberate total is added on a scratch branch.
6. **`money.test.ts`** — seed integer `cost_micro_aud` values including 0, 1 and a large value;
   assert integer round-trip; then a source scan for float arithmetic on a cost.
7. **`content-allowlist.test.ts`** — add a canary research string to an unexpected repository column
   (or a fixture row with an extra property) and assert it is **not** serialised by either list
   route; then assert the allowlist rejects an unknown property rather than passing it through.
8. **`pagination.test.ts`** — `page_size` 0, 1, 25 (default), 100, 101; opaque cursor; full traversal
   over a seeded set asserting no row is skipped or repeated; a tampered cursor; a cursor minted in
   organisation B used by organisation A.
9. **`tenant-isolation.test.ts`** — organisations A and B: as an A principal, filter by B's `job_id`,
   `resource_id` and `actor_id`, and use B's cursor; byte-compare each `404` body with the
   absent-identifier `404` after masking `request_id`; assert the lists contain only A's rows. This
   is the suite `ASSR-01` builds on — make it exhaustive across every identifier these routes accept.
10. **`limits.test.ts`** — assert `/v1/usage/limits` matches `RUNT-02`'s configured values, that a
    `SYSTEM_PROTECTION` row is labelled, and that no other tenant's figure is present; then compare
    the reported limit/remaining/reset with what `RUNT-02` puts on a `429` for the same boundary and
    assert they agree.
11. **`read-only.test.ts`** — source scan for `reserve`/`settle`/`release`/insert/update/delete and
    budget arithmetic; assert the only write is the audit emission for reading `/v1/audit-events`,
    and assert that emission actually happens.
12. **`architecture.test.ts`** — source scan for unscoped `packages/database` imports, role literals,
    ledger-name literals and PRD §38.5 numeric literals; copy the pattern from
    `apps/api/test/admission/architecture.test.ts` (`RUNT-02`).
13. **`leak.test.ts`** — seed a credential-shaped canary and a research-content canary into every
    reachable table column; run the full request matrix; scan every response body, every captured log
    line and every audit event; assert absence.
14. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether a
    concurrent ledger write during a paginated read can produce a skipped or duplicated row; whether
    the period boundary (`reset_at`) can be crossed mid-request and report a stale balance; whether a
    cursor can be replayed across organisations or across a period boundary; whether an
    `operation_ledger` filter can be used to probe another tenant's existence through a timing or
    error-shape difference; whether the audit filter can be used to enumerate another organisation's
    actor ids; whether reading `/v1/audit-events` can recursively generate audit events; whether
    `limit` omission versus `0` is handled consistently by every consumer.
15. The `[human]` row runs against a locally started stack (`pnpm stack:up`, `RUNT-09`) with `curl`
    at Gate 2 and is recorded in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies anything in this ticket, update **this ticket file**
first (version note + changelog line in the PR), re-publish with
`.claude/scripts/publish-tickets.mjs --sync`, then change code. Silent divergence is an incomplete
ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`DATA-07`'s `balance()` cannot answer a question these endpoints must answer** (for example a
  per-period breakdown, or a `remaining` that needs the configured limit alongside the balance). →
  Add a ticket to `01-app-data` and add the edge in `docs/prd/breakdown-plan.md` §5.2/§6.2 **first**.
  **Never write `packages/database/**`** and **never compute a balance in `apps/api`** — that would
  duplicate a business rule PRD §45.2 forbids `apps/api` to own and would diverge from `DATA-07`
  deliverable 3's "computed from entries, never from a stored running total" rule.
- **`RUNT-02` does not expose its configured ledger limits to a handler**, so `/v1/usage/limits`
  cannot report them. → That is a `RUNT-02` contract gap. Amend `RUNT-02`'s deliverables and this
  ticket's deliverable 4 in **one** docs PR and `--sync` both. Never write
  `apps/api/src/{plugins,middleware}/**`, and never hard-code a PRD §38.5 number here.
- **`FND-04`'s OpenAPI has no `/v1/usage/*` or `/v1/audit-events` path** (sub-PRD **Q-PLTF-8**). →
  Raise a `00-foundation` ticket against `FND-04` and add the edge in
  `docs/prd/breakdown-plan.md`. **Never edit `schemas/openapi/**`** and never declare the
  request/response type locally (PRD §20.1).
- **An integration genuinely needs machine access to audit events.** → PRD §38.1 gives the
  service-account column a dash and PRD §16.3's scope list has no audit scope (sub-PRD **D20**,
  **Q-PLTF-6**). Do **not** add a scope here. Raise it in
  `docs/prd/20-developer-platform/README.md` §Open questions with the **Founder** as owner, and
  route any scope addition through `FND-03`'s enum and `FND-04`'s OpenAPI (PRD §35.1, §45.5).
- **A required failure has no PRD §34.9 code.** → The catalogue is closed. Use
  `400 INVALID_REQUEST` + `details.reason`. If genuinely impossible, raise it in
  `docs/prd/20-developer-platform/README.md` with the **Founder** as owner (PRD §45.5).
- **`PLTF-08` needs a field these endpoints do not return** (it is `blocked_by` this ticket). →
  Amend this ticket's deliverables 2–4 in a docs PR and `--sync`; do not let `PLTF-08` compute it on
  the client, and do not write `apps/web/src/features/usage/**` from here.
- **`ASSR-01` finds a tenant-isolation gap here** (it is `blocked_by` this ticket). → Fix it **in
  this area**, not in `tests/**`, and record the case in this ticket's deliverable 8 so the
  co-located suite covers it permanently (breakdown plan §9 **R8**: `23-assurance` confirms rather
  than discovers).
- **`IDNT-01`'s `_lib` toolkit lacks a preset these areas need.** → Amend `IDNT-01`'s deliverables and
  this ticket together in one docs PR and `--sync` both. Never write inside
  `apps/api/src/routes/auth/**`.

**3. Escalation.** *"Search, answer credits, advanced-task credits, API calls and provider cost are
separate ledgers; exhausting one does not misreport the others"* and *"without disclosing other
tenants"* (both PRD §38.5), and *"Other-tenant and absent opaque IDs return the same not-found
response"* (PRD §16.5) are release requirements with MUST force. `PLTF-08` and `23-assurance`'s
`ASSR-01` are both `blocked_by` this ticket. If ledger independence or the indistinguishable-404
property proves unimplementable as specified, that overturns sub-PRD **D19**/**D20** and touches
PRD §38.5's ledger model and PRD §21.2's tenant model. Stop, raise an ADR under `docs/adr/`
(breakdown plan **A9**), write back to `docs/prd/breakdown-plan.md` and
`docs/prd/20-developer-platform/README.md`, and escalate to the human. Never merge two ledgers to
simplify a response, and never let a cross-tenant identifier produce a distinguishable answer.
