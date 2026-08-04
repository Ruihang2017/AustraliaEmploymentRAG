---
id: RCRD-01
title: "Research-record CRUD with ETag / `If-Match`"
module: 17-records-collab
lane: 17-records-collab
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-02, DATA-06]
blocks: [RCRD-02, RCRD-03, RCRD-04, RCRD-05, RCRD-06]
---

# RCRD-01 — Research-record CRUD with ETag / `If-Match`

Implements PRD §8.7, §16.2, §34.7 — requirement **REC-004** (and the write half of **REC-001**),
epic `E24-RECORDS`.
No ADR — the decision is already made in PRD §34.7 (the write contract), §16.2 (ETag + `If-Match` →
`409 CONCURRENT_MODIFICATION`) and §32.6 (only title/tags/assignments are editable); this is build
ticket 1 of 9 against it.
Parent sub-PRD: [17-records-collab README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `RUNT-02` — Admission middleware chain
([`03-app-runtime`](../../03-app-runtime/README.md)) · `DATA-06` — Research and evidence tables
(immutable) ([`01-app-data`](../../01-app-data/README.md))
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §34.7 is a finished payload and `DATA-06` is a finished repository; this maps HTTP onto them.

## Background + basis

This ticket creates the container every other ticket in the module hangs off. Five other `RCRD`
tickets are `blocked_by` it, so the shapes it fixes — the route area, the ETag source, the
`If-Match` outcomes and the tenant-scoped lookup — are consumed, not re-decided, downstream.

**PRD §8.7 Research Records and collaboration**, the governing section:

> - Research Records MUST persist questions/facts, legal date, jurisdiction, topics, owner, reviewer
>   and workflow status.
> - Research turns MUST be immutable; corrections supersede rather than overwrite prior turns.
> - Formal answers MUST be immutable Answer Snapshots.
> - Rerun under current law MUST create a new version and support comparison with the prior answer.
> - Comments MAY target a record, answer, claim or citation.
> - **Concurrent edits MUST use version/ETag checks.**
> - Workflow states: `DRAFT`, `IN_REVIEW`, `CUSTOMER_REVIEWED`, `REVIEW_REQUIRED`, `ARCHIVED`.
> - `CUSTOMER_REVIEWED` means customer-internal review and MUST NOT imply legal verification by the
>   product owner or a lawyer.

**PRD §34.7 Research Record write contract**, verbatim and normative:

> Create:
>
> ```json
> {
>   "title": "Anonymous coverage research – Example Pty Ltd",
>   "legal_context": {"legal_as_at": "2026-08-03", "jurisdictions": ["CTH", "VIC"]},
>   "owner_user_id": "usr_...",
>   "reviewer_user_id": null,
>   "tags": ["coverage"]
> }
> ```
>
> **Mutable metadata updates require `If-Match: "7"`.** Formal facts/questions are added as immutable
> turns … A mistake is corrected by adding a new turn with `supersedes_turn_id`, never by editing the
> original turn.

**PRD §16.2** (Research and collaboration): *"CRUD `/v1/research-records` · `/v1/research-records/{id}/turns`
· `/v1/research-records/{id}/answers` · `/v1/research-records/{id}/review-actions` · CRUD `/v1/comments`
and `/resolve`. **Editable resources MUST use ETag/version + `If-Match`; conflicts return
`409 CONCURRENT_MODIFICATION`.**"*

**PRD §32.6** fixes what is editable: *"Header fields: title, stable ID, owner, reviewer, workflow
status, legal context, tags, created/updated time and correction badge. … The Timeline is
append-only. **Editable title/tags/assignments use ETag; formal turns/answers are never edited.**"*

**PRD §34.1** common conventions that bind this route area: IDs are *"Opaque resource-prefixed UUIDv7
strings … clients never parse them"*; pagination is *"`page_size` 1–100, default 25; opaque
`next_cursor`"*; idempotency is *"Key 16–128 characters; same actor/route/key/body returns original
result; changed body returns 409"*; concurrency is *"Mutable resources return `ETag`; writes require
`If-Match` where documented"*; tenant is *"Never accepted in a request body; derived from
authenticated session/key/widget token"*.

**PRD §34.9** is a **closed** error catalogue. The rows this ticket produces are
`400 INVALID_REQUEST`, `400 INVALID_LEGAL_DATE`, `404 RESOURCE_NOT_FOUND`,
`409 IDEMPOTENCY_CONFLICT`, `409 CONCURRENT_MODIFICATION`, `422 EMPLOYEE_PII_DETECTED` and
`429 RATE_LIMITED`. There is **no** precondition-required row — see the accepted caveats.

**Requirement REC-004** (PRD §30.2): *"Workflow transitions enforce actor, ETag and audit | Record
header | review-action endpoint | App | **Invalid transition and stale ETag return 409**"*.
**REC-001**: *"Saved research stores immutable turns and Answer Snapshots … No update path mutates an
existing formal snapshot."*
**PRD §41.2 `UAT-REC-02`**: *"Two browsers update title with same ETag → First succeeds; second
receives 409 and reload guidance."*
**PRD §44.2 `E24-RECORDS`** exit evidence: *"REC and **concurrency** tests."*

**What `DATA-06` already provides** (`01-app-data`, merged before this ticket by the DAG):

> 6. **`research_record` mutability.** `update(ctx, id, patch, { ifMatch: rowVersion })` performing a
>    compare-and-swap (`WHERE row_version = ?` and increment); a stale version returns a typed
>    `CONCURRENT_MODIFICATION` … **`etagFor(record)` derives the ETag value from `row_version` so
>    `RCRD-01` does not invent its own.**
> 7. **Soft delete lifecycle.** `softDelete(ctx, id, now)` sets `deleted_at`; every default read and
>    list excludes soft-deleted rows; `restore(ctx, id)` works within the 30-day window …
> 8. **Invariant 7 (structural half).** `workflow_status` can only be changed by
>    `applyReviewAction(…)` … in particular, `update()`'s patch type excludes it.
> 9. **Record creation inside a caller's transaction.** `createRecord(tx, ctx, spec)` takes the `Tx`
>    handle so `ASK-01` can create a record and admit a job in one transaction (PRD §34.3).

**What `RUNT-02` already provides**: the eleven-stage admission chain
`['request-limits','authenticate','resolve-organisation','verify-membership','evaluate-permission','rate-limit','pii-admission','schema-validate','legal-scope','budget-admission','idempotency']`,
the `tenant` profile, per-route overrides declared in the route schema, the identical
`404 RESOURCE_NOT_FOUND` body for forbidden and absent ids, and the `TenantContext`-scoped repository
accessor. **What `RUNT-01` already provides**: directory autoload with `area.prefix` override and
boot-time method+path collision detection, `request_id` on every response, and the `ApiError`
factories over the closed §34.9 catalogue.

**PRD §38.1 role matrix**, the permission this route declares: *"Create/read own Research Records —
Owner ✓ · Admin ✓ · Researcher ✓ · Viewer read shared · Developer — by default · Service account
scoped"*, with the standing rule *"All checks are permission checks plus resource membership; a role
alone never authorises a record from another organisation."* PRD §16.3 names the service scopes
`records:read` and `records:write`.

**Accepted caveats carried forward:**

- **A missing `If-Match` has no PRD §34.9 code.** Sub-PRD decision **D4** maps it to
  `400 INVALID_REQUEST` with `details` naming the header, because §34.9 is closed and `RUNT-01`'s
  feedback obligation says *"Do not invent a code … stop at the nearest existing code"*. Recorded as
  open question **QR-4** with the **Founder** as owner. Documented, not silently normalised.
- **The `/v1/research-records` paths must already exist in `schemas/openapi/openapi.yaml`** (`FND-04`,
  serial-owned). This ticket consumes the generated bindings; an absent path is a writeback
  (**QR-5**), never a hand-edit (PRD §20.1).
- `row_version` is PRD §35.1's *"integer `row_version`"* on mutable metadata tables; the ETag value
  is `DATA-06`'s, not this ticket's (**D3**), so `FND-08`'s `computeETag` and this route can never
  disagree (`FND-08` feedback obligation 3).

## Goal

Produce `apps/api/src/routes/research-records/**`: the `/v1/research-records` route area implementing
PRD §16.2's CRUD with the PRD §34.7 create payload, an `ETag` header on every single-record response,
`If-Match` required on every mutating write, soft delete on the PRD §10.3 30-day lifecycle, and
cursor pagination per §34.1 — all through `DATA-06`'s tenant-scoped repository and `RUNT-02`'s
admission chain. Completion is mechanically checkable: a two-connection concurrency test proves that
two `PATCH`es carrying the same ETag produce exactly one `200` and one `409 CONCURRENT_MODIFICATION`
(`UAT-REC-02`), a type-level and runtime test proves `workflow_status` cannot be written through this
area at all, and a cross-tenant matrix proves another organisation's record id is byte-identical to an
absent id.

## Non-goals

- **No table, migration or repository.** `packages/database/**` is `01-app-data` (`DATA-06`,
  `DATA-07`); sub-PRD **D1**, plan **A3**, PRD §45.2, plan risk **R4**. A needed write that no
  repository exposes is a new `01-app-data` ticket plus a `blocked_by` edge.
- **No turns.** `apps/api/src/routes/research-turns/**` is `RCRD-02`, which is `blocked_by` this
  ticket.
- **No answers, rerun or diff.** `RCRD-03`. **No review actions or workflow transitions.** `RCRD-04`
  — this area's `PATCH` body type must **exclude** `workflow_status` entirely.
- **No comments, issues or corrections.** `RCRD-05`, `RCRD-06`, `RCRD-07`.
- **No screens.** `apps/web/src/features/records/**` is `RCRD-08`/`RCRD-09`.
- **No admission stages.** Authentication, tenant resolution, permission evaluation, rate limiting,
  PII detection and idempotency storage are `RUNT-02` (`apps/api/src/{plugins,middleware}/**`). This
  ticket declares per-route flags and implements no stage.
- **No permission matrix.** `FND-06` (`packages/domain/src/access/**`), evaluated by `RUNT-02`. This
  route names the permission it needs.
- **No ETag algorithm.** `DATA-06`'s `etagFor` (**D3**); the pure staleness rule is `FND-08`'s.
- **No OpenAPI or contract edits.** `schemas/openapi/**` and `packages/contracts/**` are
  `00-foundation`, serial-owned (plan §4.1). PRD §20.1 forbids hand-editing generated bindings.
- **No `apps/api/package.json` or `tsconfig.json` edit** — `03-app-runtime` (sub-PRD **D16**).
- **No cross-boundary tenant-isolation suite.** `tests/tenant-isolation/**` is `23-assurance`
  (`ASSR-01`, `blocked_by RCRD-08`). This ticket carries its **own** co-located assertions (plan R8).

## File-scope (write-owns)

- `apps/api/src/routes/research-records/**`
- `apps/api/test/records/research-records/**` — this ticket's own unit/integration tests (sub-PRD
  **D15**, plan §1.1).

Does not touch:

- `apps/api/src/routes/{research-turns,record-answers,review-actions,comments,issues,corrections}/**`
  — `RCRD-02` … `RCRD-07`.
- `apps/api/src/routes/**` other than this area — `13`, `14`, `15`, `16`, `19`, `20`, `22`, and
  `health`/`system-status` (`RUNT-08`).
- `apps/api/src/{server.ts,app.ts,bootstrap,plugins,middleware,errors,sse}/**` — `RUNT-01`,
  `RUNT-02`, `RUNT-03`.
- `apps/api/package.json`, `apps/api/tsconfig.json` — `03-app-runtime` (**D16**).
- `packages/database/**` — `01-app-data`. `packages/domain/**`, `packages/contracts/**`,
  `schemas/openapi/**` — `00-foundation`. `packages/auth/**` — `02-auth-core`.
- `apps/worker/**`, `apps/web/**`, `infra/**`, `tests/**` — other modules.

**Serial-safety analysis.** This is the **first** decomposition (plan §1: phase 1, `append: false`,
`usedIds: []`, `existingFiles: ['.gitkeep']`): nothing is merged and no ticket is in flight, so no
prior ticket has written these paths and none contends for them. Under plan **A1** each
`apps/api/src/routes/<area>/` subtree is registered by directory convention, so this area's existence
is invisible to every sibling area — adding it produces zero diff outside its own directory
(`RUNT-01` contract item 6). The seven route areas this module owns are seven disjoint directories,
one per ticket (plan §5.18); the six siblings are all `blocked_by` this ticket, so none can even be
in flight concurrently with it. Per plan **A3**, **no ticket in this module writes a table or a
repository**, which is what removes the `15-answer-product` ↔ `17-records-collab` module cycle: this
area *reads and calls* `packages/database`, and `ASK-01` calls the same `DATA-06.createRecord(tx, …)`
inside its own admission transaction (PRD §34.3) without either module writing the other's files.
This ticket is the module's wave 1 and runs alone.

## Deliverables

1. **`apps/api/src/routes/research-records/index.ts`** — the route area entry: a default-exported
   `FastifyPluginAsync` and `export const area = { admission: 'tenant' } satisfies RouteAreaConfig`
   (default prefix `/v1/research-records`, `RUNT-01` contract item 4). No other area in the repo may
   claim a `/v1/research-records` method+path this area registers; a collision fails boot by
   construction.
2. **`POST /v1/research-records`** — body exactly PRD §34.7's create shape: `title`,
   `legal_context: { legal_as_at, jurisdictions[] }`, `owner_user_id`, `reviewer_user_id` (nullable),
   `tags[]`. Route flags: `idempotent: true` (PRD §34.1 retryable write), `requiresPiiAdmission: true`
   (sub-PRD **D10** — `title` and `tags` are free-text customer content). `legal_as_at` is validated as
   an Australian calendar date and rejected with `400 INVALID_LEGAL_DATE` otherwise (PRD §16.1,
   §34.9). An `organization_id`/tenant field anywhere in body, query or header is rejected
   `400 INVALID_REQUEST` naming the field (PRD §34.1) — `RUNT-02` stage 3 already does this; the route
   adds no tenant field to its schema. Responds `201` with the record plus an `ETag` header.
3. **`GET /v1/research-records`** — cursor pagination exactly per PRD §34.1 (`page_size` 1–100,
   default 25, opaque `next_cursor`), sorted deterministically (`created_at DESC, id DESC` so the
   cursor is total), with filters for `workflow_status`, `owner_user_id`, `reviewer_user_id`, `tags`
   and `legal_as_at` range. Soft-deleted records are excluded (`DATA-06` deliverable 7). The list
   response carries **no** `ETag` (collections are not `If-Match` targets).
4. **`GET /v1/research-records/{recordId}`** — returns the record and an `ETag` header whose value is
   `DATA-06`'s `etagFor(record)` (**D3**). Includes `workflow_status`, `legal_context`, `tags`,
   `owner_user_id`, `reviewer_user_id`, `created_at`, `updated_at` and `row_version`, and the
   correction badge input as carried by the repository. An absent id and another organisation's id
   both return the byte-identical `404 RESOURCE_NOT_FOUND` (PRD §16.5, §34.9).
5. **`PATCH /v1/research-records/{recordId}`** — the **only** mutating metadata path. Requires
   `If-Match`. The body type is `Pick<Record, 'title' | 'tags' | 'owner_user_id' |
   'reviewer_user_id'>` — exactly PRD §32.6's *"title/tags/assignments"*. `workflow_status`,
   `legal_context`, `row_version`, `created_at`, `organization_id` and every id are **not
   representable** in the type, and a request carrying one is rejected `400 INVALID_REQUEST` naming
   the field (not silently ignored). Delegates to `DATA-06.update(ctx, id, patch, { ifMatch })`.
   Route flags: `requiresPiiAdmission: true`.
6. **`If-Match` outcomes, exactly two (sub-PRD D4).**
   - Absent header → `400 INVALID_REQUEST`, `details: { field: 'If-Match' }`, message naming the
     header. (`QR-4`; no §34.9 precondition row exists.)
   - Present but not equal to the current validator → `409 CONCURRENT_MODIFICATION` with the PRD
     §34.9 user action *"Reload latest ETag"* as the message, and the **current** `ETag` on the
     response so the client can refetch-and-retry in one round trip.
   - Equal → apply, increment `row_version`, return `200` with the **new** `ETag`.
   A `*` wildcard `If-Match` is rejected `400 INVALID_REQUEST` — this product has no
   "overwrite regardless" semantics (PRD §8.7).
7. **`DELETE /v1/research-records/{recordId}`** — soft delete via `DATA-06.softDelete`, requires
   `If-Match` with the same three outcomes, returns `204`. It **never** issues a hard delete: PRD
   §10.3 gives *"Deleted customer records: 30-day recoverable period, then primary deletion"* and the
   purge path is `DATA-06.purgeDeletedBefore`, owned by the maintenance job (`RUNT-04`). A subsequent
   `GET` returns `404`; the row still exists for the recovery window.
8. **`POST /v1/research-records/{recordId}/restore`** — restores within the 30-day window
   (`DATA-06.restore`), `404` outside it. Declared here because `DATA-06` exposes `restore` and PRD
   §10.3 promises recoverability; it is the only non-CRUD verb in this area. If `FND-04`'s OpenAPI
   does not declare the path, raise **QR-5** rather than shipping an undeclared endpoint.
9. **Permission declarations.** Each route declares the permission `RUNT-02`'s `evaluate-permission`
   stage evaluates against `FND-06`: read routes require the record-read permission plus resource
   membership; write routes require record-write. Service-account callers are additionally checked
   against the `records:read` / `records:write` scopes (PRD §16.3). No role name is hard-coded in this
   area; the permission id is.
10. **Response mapping only.** This area contains no business rule: no transition logic, no editable
    field policy beyond the type, no ETag arithmetic, no tenant check of its own. PRD §45.2 —
    `apps/api` owns *"HTTP auth/admission/DTO mapping/SSE"* and must not own *"Duplicated business
    rules"*; plan risk **R5** names this as the likely offender.
11. **`CUSTOMER_REVIEWED` semantics in the read model (sub-PRD D6).** Where this area returns or
    describes `workflow_status`, the description string is fixed as *"customer-internal review;
    does not imply legal verification by the product owner or a lawyer"* — PRD §8.7's own words. A
    committed string fixture `apps/api/test/records/research-records/customer-reviewed-copy.json`
    holds the exact permitted wording so the assertion is checkable without reading code.
12. **Audit.** Every mutating call emits the structured admission/decision record through
    `RUNT-02`'s audit hook — actor, organisation, action, resource id, outcome, `request_id` — and
    **never** the title, tags or any body content (PRD §22: *"Logs MUST exclude research/evidence
    content, PII text, credentials"*; §35.6 `audit_event` *"no complete research body"*).
13. **Test fixtures** — `apps/api/test/records/research-records/fixtures/`:
    `create-request.json` (PRD §34.7 verbatim), `record-response.json`, and
    `patch-rejected-fields.json` enumerating every field a `PATCH` must refuse. All synthetic; no
    customer content, no blind gold (PRD §45.1 item 6).

## Acceptance checklist (classified)

- [ ] `[machine]` `POST /v1/research-records` accepts the PRD §34.7 create body **verbatim** from
      `create-request.json` and returns `201` with an `ETag` header (PRD §34.7; **REC-001**)
- [ ] `[machine]` The `PATCH` body type accepts exactly `title`, `tags`, `owner_user_id`,
      `reviewer_user_id`; a request containing `workflow_status`, `legal_context`, `row_version`,
      `organization_id` or any id is rejected `400 INVALID_REQUEST` **naming the field** and no write
      occurs — table-driven over `patch-rejected-fields.json` (PRD §32.6; §35.8 invariant 7)
- [ ] `[machine]` **`UAT-REC-02` / REC-004 concurrency:** two connections `PATCH` the same record with
      the **same** `If-Match` value; exactly one returns `200` with an incremented `row_version` and
      the other returns `409 CONCURRENT_MODIFICATION`; the final stored title is the winner's and no
      intermediate state is observable (PRD §8.7 *"Concurrent edits MUST use version/ETag checks"*;
      §44.2 `E24` exit evidence *"REC and concurrency tests"*)
- [ ] `[machine]` The `409` response carries the **current** `ETag`, and re-issuing the `PATCH` with
      it succeeds — the reload-and-retry loop terminates in one round trip (PRD §34.9 *"Reload latest
      ETag"*)
- [ ] `[machine]` An absent `If-Match` on `PATCH`/`DELETE` returns `400 INVALID_REQUEST` with
      `details.field === 'If-Match'`; `If-Match: *` is also rejected `400` (sub-PRD **D4**, **QR-4**)
- [ ] `[machine]` `ETag` values come from `DATA-06.etagFor`; a source scan asserts this area computes
      no hash, digest or version string of its own (sub-PRD **D3**; `FND-08` feedback obligation 3)
- [ ] `[machine]` **Tenant isolation (PRD §21.2 / SEC-001):** a matrix over read, list, create-against,
      patch, delete and restore using a second organisation's record id returns responses
      **byte-identical** to the absent-id case apart from `request_id`; the second organisation's row
      is unchanged afterwards (PRD §16.5, §34.9; `UAT-AUTH-03`)
- [ ] `[machine]` A tenant/organisation identifier supplied in body, query or header is rejected
      `400 INVALID_REQUEST` naming the field and is never honoured (PRD §34.1, §16.1)
- [ ] `[machine]` `DELETE` performs a **soft** delete: the record disappears from `GET` and list, a
      raw repository read still finds the row with `deleted_at` set, and no hard-delete call exists in
      this area's source (PRD §10.3; `DATA-06` deliverable 7)
- [ ] `[machine]` `POST …/restore` restores inside the 30-day window and returns `404` outside it
      (PRD §10.3)
- [ ] `[machine]` Pagination honours `page_size` 1–100 / default 25, rejects out-of-range values
      `400 INVALID_REQUEST`, and the `next_cursor` walk over a seeded set returns every record exactly
      once with no duplicates across a concurrent insert (PRD §34.1)
- [ ] `[machine]` Idempotency: the same actor/route/`Idempotency-Key`/body returns the **original**
      `201` result and creates **one** record; a changed body returns `409 IDEMPOTENCY_CONFLICT`
      (PRD §34.1, §34.9)
- [ ] `[machine]` `requiresPiiAdmission: true` is declared on `POST` and `PATCH`; with the provider
      stub rejecting, the response is `422 EMPLOYEE_PII_DETECTED` carrying field/range/category and
      **never the detected value**, and **no** record row is written (PRD §37.2; §10.1; sub-PRD **D10**)
- [ ] `[machine]` An invalid `legal_as_at` returns `400 INVALID_LEGAL_DATE`; a future date is accepted
      only with the explicit confirmation flag (PRD §32.2, §34.9)
- [ ] `[machine]` **`CUSTOMER_REVIEWED` never implies verification:** every string this area ships
      that mentions the state matches `customer-reviewed-copy.json`, and a negative assertion proves
      the words *verified*, *legal review*, *approved by* and *compliant* appear in no returned or
      described string (PRD §8.7 *"MUST NOT imply legal verification by the product owner or a
      lawyer"*; §11.2)
- [ ] `[machine]` Audit records for every mutating call contain actor/organisation/action/resource/
      outcome/`request_id` and **no** title, tag or body text — asserted with a canary title
      (PRD §22, §35.6)
- [ ] `[machine]` No business rule leaked into `apps/api`: a source scan finds no workflow transition
      table, no editable-field list outside the request type, and no direct `packages/database`
      unscoped import (PRD §45.2; `SEC-001`; plan R5)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration` green
      (standing item, PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — every path this area serves is
      declared in `FND-04`'s OpenAPI and no generated binding was hand-edited (PRD §20.1; **QR-5**)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**REC-001**, **REC-004**,
      `UAT-REC-02`, `UAT-AUTH-03`, `E24-RECORDS`), user-visible change and non-goals, schema/API/event
      compatibility (additive `/v1` paths only; no event), tenant/PII/security/retention impact
      (tenant-scoped repository, PII admission on both writes, 30-day soft-delete window),
      source/licence impact (none), cost/memory/latency impact (none — no generation credit is
      consumed), rollback path (revert; five sibling tickets consume this area), known gaps
      (**QR-4** missing-`If-Match` code, **QR-5** OpenAPI paths)
- [ ] `[fixture]` The PRD §34.7 create payload and the rejected-field table replay from committed
      JSON fixtures, so a drift in the wire shape fails without reading code (PRD §34.7)
- [ ] No `[human]` criteria in this ticket — the customer-visible surface is `RCRD-08`. `UAT-REC-02`
      is exercised here as a `[machine]` two-connection test and re-run as a `[human]` script against
      the deployed UI by `RCRD-08`/`23-assurance` (PRD §41.2)
- [ ] No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected; declared not
      applicable (PRD §45.3)

## Test plan

Reviewer steps. Everything is offline: no network, no model provider, no corpus database.

1. `corepack pnpm install --frozen-lockfile`, then `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter <the apps/api package name>`; the suites live under
   `apps/api/test/records/research-records/`.
3. **Harness.** Fastify `inject()` with no listening socket, exactly as
   `apps/api/test/route-area-conformance.ts` (`RUNT-01` deliverable 11) demonstrates — copy that
   construction pattern. Database is `DATA-01`'s `withTempDatabase` seeded with `DATA-04`'s tenancy
   factories (two organisations, one Owner, one Researcher, one Viewer per organisation). Admission is
   `RUNT-02`'s chain with its test principals; the PII provider is `RUNT-02`'s stub, switchable
   between accept and reject.
4. **`create.test.ts`** — post `fixtures/create-request.json`; assert `201`, `ETag` present,
   `Location`/body id opaque and unparsed, and that a second post with the same `Idempotency-Key` and
   body returns the original result while a changed body returns `409 IDEMPOTENCY_CONFLICT`. Assert an
   `organization_id` planted in body, query and header is each rejected `400` naming the field.
5. **`patch-fields.test.ts`** — table-driven over `fixtures/patch-rejected-fields.json`: for each
   forbidden field, assert `400 INVALID_REQUEST` naming it and that a subsequent `GET` shows the
   record unchanged (including `row_version`).
6. **`concurrency.test.ts`** — the load-bearing test. Two `worker_threads`, each with its own
   connection and its own Fastify instance over the same temp database, both `PATCH` the same record
   with the same captured `ETag`. Assert exactly one `200` and one `409 CONCURRENT_MODIFICATION`;
   assert the `409` body's `code` and that its `ETag` header equals the winner's new value; re-issue
   the loser's `PATCH` with that value and assert `200`. Repeat 50 times to catch a race that only
   sometimes interleaves. Copy the two-thread construction pattern from
   `packages/database/test/research/**` (`DATA-06` test plan step 5).
7. **`if-match.test.ts`** — absent header, `*`, malformed value and stale value; assert the four
   distinct outcomes from Deliverable 6 and that no write occurred in the three failing cases.
8. **`tenant-isolation.test.ts`** — seed one record in each organisation. As organisation A's
   Researcher, attempt `GET`, `PATCH`, `DELETE`, `POST …/restore` and a list filter targeting
   organisation B's record id. Assert every response is byte-identical to the absent-id response
   apart from `request_id`, and assert organisation B's row is unchanged (compare a repository read
   before and after). Copy the matrix shape from `apps/api/test/admission/architecture.test.ts`
   (`RUNT-02` deliverable 13).
9. **`soft-delete.test.ts`** — delete, assert `GET`/list `404`/absent, then read the row directly
   through the repository and assert `deleted_at` is set; restore and assert visibility returns; grep
   the area's source for any hard-delete call and assert none.
10. **`pagination.test.ts`** — seed 120 records, walk `next_cursor` to exhaustion, assert 120 unique
    ids and no duplicate across an insert performed mid-walk; assert `page_size` 0, 101 and `-1` each
    return `400`.
11. **`pii.test.ts`** — with the stub rejecting, post a title containing a synthetic TFN canary;
    assert `422 EMPLOYEE_PII_DETECTED`, that the response contains field/range/category and **not**
    the canary, and that no row exists. Then `PRAGMA wal_checkpoint(TRUNCATE)` and assert the canary
    is absent from the raw database bytes (the pattern `DATA-03`/`DATA-06` use).
12. **`copy.test.ts`** — assert every `CUSTOMER_REVIEWED` string matches
    `fixtures/customer-reviewed-copy.json`, and run the forbidden-word negative assertion over all
    strings exported or returned by the area.
13. **`audit.test.ts`** — create/patch/delete with a canary title; assert the emitted audit records
    carry ids and codes only and that the canary appears in none of them.
14. **Contract check** — `pnpm generate && pnpm generated:check`; confirm the area serves no path
    absent from `schemas/openapi/openapi.yaml`.
15. **Source review** — grep the diff for `packages/database` unscoped entry points, for any
    `workflow_status` write, and for any locally computed ETag; all three must be absent.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** and
`docs/prd/17-records-collab/README.md` (version +0.1 + changelog line) **before** changing code, then
re-publish with `.claude/scripts/publish-tickets.mjs --sync`. Silent divergence is an incomplete
ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`DATA-06` does not expose a write this area needs** (for example a list filter, or `restore`
  behaving differently from PRD §10.3). → Do **not** add a repository, a query or a migration here.
  Raise a new ticket in `01-app-data`, record the required API in
  `docs/prd/17-records-collab/README.md` open questions **and** in `docs/prd/01-app-data/README.md`,
  and add the `blocked_by` edge in `docs/prd/breakdown-plan.md` §5.18 + §6.2. This is plan risk
  **R4**'s stated path; PRD §44.3 and §45.2 both forbid a product module to own `packages/database`.
- **A `/v1/research-records` path is missing from `schemas/openapi/openapi.yaml`** (`FND-04`,
  serial-owned). → Raise a `00-foundation` docs PR against `FND-04`, note it in
  `docs/prd/17-records-collab/README.md` **QR-5**, and only then implement. Never hand-edit a
  generated binding (PRD §20.1) and never ship an undeclared endpoint (`DEV-001`).
- **A missing `If-Match` genuinely needs its own status code** (a client cannot distinguish it from a
  schema error). → That is a PRD §45.5 **product/API change**, not an implementation detail. Record
  it against **QR-4** in `docs/prd/17-records-collab/README.md` with the Founder as owner and stop at
  `400 INVALID_REQUEST`. Do not invent a §34.9 row.
- **`RUNT-02`'s per-route flags cannot express `requiresPiiAdmission` or the permission id this area
  needs.** → Amend `RUNT-02`'s ticket and this one together in one docs PR and `--sync` both, before
  either changes code. Seven route areas in this module read those flags.
- **A screen or sibling ticket wants an additional editable header field** (PRD §32.6 lists more
  header fields than it makes editable). → PRD §32.6 says *"Editable title/tags/assignments use
  ETag"*. Widening the set is a **product change** (§45.5): record it in
  `docs/prd/17-records-collab/README.md` open questions with the Founder as owner and escalate. Never
  widen the `PATCH` type as a local convenience.
- **`etagFor` and `FND-08`'s `computeETag` disagree.** → Two modules computing ETags differently makes
  `UAT-REC-02` non-deterministic (`FND-08` feedback obligation 3). Write back to
  `docs/prd/01-app-data/README.md` and `docs/prd/00-foundation/README.md` and keep a single source;
  do not add a third here.

**3. Escalation.** If optimistic concurrency on `research_record` proves unworkable — for instance if
the access layer cannot express the compare-and-swap, or a product flow genuinely requires a
last-write-wins path — that overturns PRD §8.7 (*"Concurrent edits MUST use version/ETag checks"*),
**REC-004** and `UAT-REC-02`, all customer-facing promises and the `E24` exit evidence. Stop, escalate
for re-review, and route it through the PRD §45.5 product-change path. Never relax the check inside
this ticket. Equally, anything that would require mutating a turn or a snapshot to make this area work
overturns PRD §8.7's immutability rule and PRD §35.8 invariant 5 — escalate; never soften immutability
here.
