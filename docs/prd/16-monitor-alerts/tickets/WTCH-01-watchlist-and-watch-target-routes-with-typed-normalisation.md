---
id: WTCH-01
title: Watchlist and watch-target routes with typed normalisation
module: 16-monitor-alerts
lane: 16-monitor-alerts
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-02, DATA-07]
blocks: [WTCH-07, RCRD-08]
---

# WTCH-01 — Watchlist and watch-target routes with typed normalisation

Implements PRD §8.8 and §32.7, requirement **MON-001** (epic `E25-MONITOR`).
No ADR — the decision is already made in PRD §8.8 (the six target kinds) and §32.7 (the watchlist
field list); this is build ticket 1 of 8 against it.
Parent sub-PRD: [16-monitor-alerts README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RUNT-02 — Admission middleware chain](../../03-app-runtime/tickets/RUNT-02-admission-middleware-chain.md), [DATA-07 — Usage, monitor, issue/correction, audit, incident tables](../../01-app-data/tickets/DATA-07-usage-monitor-issue-correction-audit-incident-tables.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §8.8 fixes the target kinds and §32.7 the watchlist fields; this maps them onto one route area.

## Background + basis

**PRD §8.8, first sentence — the target kinds are exhaustive and normative:**

> Watch targets MUST support documents, nodes, employers/ABNs, jurisdiction topics, saved searches and
> authorities referenced by Research Records.

**PRD §32.7 — the watchlist field list:**

> A watchlist has name, targets, event types, jurisdictions, severity threshold, delivery mode
> (`IMMEDIATE` or `DAILY_DIGEST`), channels and active state.

**Requirement `MON-001`** (PRD §30.2), verbatim:

> | MON-001 | A watchlist can target documents, nodes, ABNs, topics, saved searches and record
> authorities | `/monitor/watchlists` | watchlist endpoints | App | **Target normalisation and tenant
> isolation pass** |

**PRD §16.2 — the endpoint set this ticket owns:**

> #### Monitor and delivery
>
> - CRUD `/v1/watchlists`
> - `GET /v1/alerts`, alert detail, acknowledge and resolve
> - CRUD/test/rotate `/v1/webhook-subscriptions`

Only the first line is this ticket's; the other two are `WTCH-03` and `WTCH-05`.

**PRD §16.3 — the machine scopes** include `monitor:read` and `monitor:write`.

**PRD §16.5 — the request order, which `RUNT-02` already implements and this ticket must not
re-implement:**

> Request flow MUST be authenticate → resolve organisation → verify membership/service account →
> evaluate permission → perform tenant-scoped lookup. **Other-tenant and absent opaque IDs return the
> same not-found response.** Business modules MUST use TenantContext-scoped repositories rather than
> raw/unscoped database connections.

**PRD §34.1 — the conventions every payload here obeys:** opaque resource-prefixed UUIDv7 ids
(`wat_…` for watchlists per PRD §34.8's example); legal dates `YYYY-MM-DD` and timestamps ISO 8601
UTC; `page_size` 1–100 default 25 with an opaque `next_cursor`; `Idempotency-Key` 16–128 characters
where the same actor/route/key/body returns the original result and a changed body returns 409;
mutable resources return `ETag` and writes require `If-Match` where documented; **tenant is never
accepted in a request body**.

**PRD §34.9 — the error codes this ticket uses:** `INVALID_REQUEST`, `INVALID_ABN`
(*"Correct ABN checksum"*), `RESOURCE_NOT_FOUND` (*"same response for forbidden/other tenant"*),
`IDEMPOTENCY_CONFLICT`, `CONCURRENT_MODIFICATION`.

**The persistence contract already exists.** `DATA-07` deliverable 4 (`01-app-data`, merged before
this ticket starts) specifies:

> **Watchlists and targets (MON-001).** `watchlist` carries name, state, event types, jurisdictions,
> severity threshold, delivery mode (`IMMEDIATE` | `DAILY_DIGEST`), channels (PRD §32.7).
> `watch_target` stores a **typed normalised** target — one column for `target_kind` (document, node,
> ABN, topic, saved search, record authority — the six MON-001 kinds) plus a normalised key; the
> repository normalises on write (ABN digits-only with checksum validity recorded, document/node ids
> as opaque corpus references) and enforces
> `UNIQUE (organization_id, watchlist_id, target_kind, normalized_key)`.

This ticket therefore **calls** that repository; it writes no schema, no migration and no
normalisation that duplicates it. Where this ticket's DTO validation and the repository's
normalisation would disagree, the repository wins and the route maps the failure to a §34.9 code.

**The A1 registration contract** (`RUNT-01`, "The A1 registration contract", normative for this
module): every immediate child directory of `apps/api/src/routes/` is a route area whose directory
name is the area id; the area MUST contain `index.ts` with a **default export** that is a Fastify
plugin; an optional `export const area: RouteAreaConfig` sets `prefix` (default `/v1/<area-id>`) and
`admission` (default `'tenant'`); each area is registered inside its own encapsulation context; and
*"Adding, renaming or removing a route area produces **zero** diff outside that area's own
directory."* This ticket adds exactly one area, `watchlists`.

**Why this ticket is the module's entry point.** `WTCH-07` (the watchlist screens) and `RCRD-08`
(the record detail screen's **Watch** tab, PRD §32.6) are both `blocked_by` this ticket
(breakdown-plan §6.2: `WTCH-01 --> WTCH-07 & RCRD-08`). The DTOs published here are what both
render.

**Accepted caveats carried forward:**

- **No `blocked_by` edge to `DATA-06`** (research and evidence tables) exists in breakdown-plan
  §5.17, yet deliverable 5 below validates `source_record_id` through `DATA-06`'s tenant-scoped
  repository. This is sub-PRD open question **Q-WTCH-3**. If `DATA-06` is not merged when this
  ticket executes, **stop and raise the missing edge** as a plan writeback (Feedback obligation 2) —
  do not stub the repository and do not skip the validation, which would create an unvalidated
  cross-tenant identifier.
- Watch **matching** and alert creation are `WTCH-02`/`WTCH-03`. This ticket stores configuration
  only; nothing here fetches, crawls or evaluates a change.
- The `saved search` target kind stores a normalised, **already-executed** search descriptor
  (query text, filters, `legal_as_at`, jurisdiction set). This ticket does not execute searches and
  has no dependency on `14-search-product`'s API — `FIND-01`'s `search_execution_id` may be carried
  as an opaque provenance attribute but is never dereferenced here.

## Goal

Produce the `apps/api/src/routes/watchlists/**` route area: full CRUD for `/v1/watchlists` and its
`targets` sub-resource, with request/response DTOs for the eight PRD §32.7 watchlist fields, typed
normalisation and validation for all six PRD §8.8 target kinds delegated to `DATA-07`'s repository,
ETag/`If-Match` concurrency on mutable watchlists, `Idempotency-Key` on creates, and tenant isolation
that makes an other-tenant id indistinguishable from an absent one. Completion is mechanically
checkable: the six-kind normalisation matrix round-trips, a duplicate normalised target in one
watchlist is rejected, a cross-tenant id matrix returns `RESOURCE_NOT_FOUND` for every route, and the
area registers with zero diff outside its own directory.

## Non-goals

- **No tables, migrations, repositories or normalisation implementation** — `01-app-data`/`DATA-07`
  owns `packages/database/src/{schema/operations.ts,repos/operations/**}` (breakdown-plan **A3**;
  PRD §45.2 gives `packages/database` exactly this scope and forbids it to others).
- **No change detection, matching or fan-out** — `WTCH-02`
  (`apps/worker/src/handlers/change-matching/**`).
- **No alerts, alert routes, acknowledge/resolve or impact marking** — `WTCH-03`.
- **No email, webhook or digest delivery, and no webhook-subscription routes** — `WTCH-04`,
  `WTCH-05`, `WTCH-06`. A watchlist's `channels` field names channels; it does not configure them.
- **No screens** — `WTCH-07` (watchlists) and `WTCH-08` (alerts); the record **Watch** tab is
  `17-records-collab`/`RCRD-08`, which is `blocked_by` this ticket.
- **No admission, authentication, permission, rate-limit or idempotency machinery** —
  `03-app-runtime`/`RUNT-02`. This ticket **declares** its admission profile and permission
  requirement and calls the chain; it re-implements none of it (PRD §45.2: `apps/api` must not own
  "Duplicated business rules").
- **No enum members** — `FND-03` owns `WatchTargetKind`, `DeliveryMode`, `AlertChannel`,
  `ChangeType`, `Severity` and the `wat_` id prefix. A value this ticket needs and cannot find is a
  `00-foundation` writeback, not a local literal union.
- **No search execution or saved-search evaluation** — `14-search-product`/`FIND-01`.
- **No OpenAPI root edits** — `schemas/openapi/openapi.yaml` is `FND-04`'s serial-owned root
  (breakdown-plan §4.1). This area's schemas are declared in the route module and reach the document
  through `FND-04`'s generation path; a hand-edit of a generated binding is forbidden (PRD §20.1).

## File-scope (write-owns)

- `apps/api/src/routes/watchlists/**` — the whole route area, including `index.ts`, DTO schemas,
  handlers and its own tests under `apps/api/src/routes/watchlists/__tests__/**`.

Does not touch:

- `apps/api/src/routes/{alerts,webhook-subscriptions}/**` — `WTCH-03`, `WTCH-05` (same module,
  disjoint areas).
- `apps/api/src/{server.ts,app.ts,bootstrap,plugins,middleware,errors,sse}/**`,
  `apps/api/src/routes/{health,system-status}/**`, `apps/api/{package.json,tsconfig.json}` —
  `03-app-runtime` (`RUNT-01`, `RUNT-02`, `RUNT-03`, `RUNT-08`).
- Every other product route area (`search`, `documents`, `answers`, `research-records`, `exports`,
  `usage`, `internal/**`, …) — modules 13, 14, 15, 17, 19, 20, 22 per breakdown-plan §4.
- `apps/worker/**`, `apps/web/**` — `WTCH-02` … `WTCH-09` and other modules.
- `packages/database/**` (**A3**), `packages/contracts/**`, `packages/domain/**` (`00-foundation`),
  `packages/auth/**` (`02-auth-core`), `packages/ui/**` (`RUNT-06`).
- `schemas/**`, root manifests and lockfiles, `.github/workflows/**`, `tests/**` — `00-foundation`
  and `23-assurance`.

**Serial-safety analysis.** First decomposition — breakdown-plan §1 records `phase: 1`,
`existingFiles: ['.gitkeep']`: nothing is merged and no ticket is in flight, so no file in this scope
has a previous author. `apps/api/src/routes/watchlists/` does not exist before this ticket and is
written by no other ticket in the 236-ticket plan (breakdown-plan §4 gives
`apps/api/src/routes/{watchlists,alerts,webhook-subscriptions}/**` to this module, and §5.17 splits
those three areas across `WTCH-01`, `WTCH-03` and `WTCH-05`). Under **A1** each route area is an
independent directory with its own `index.ts`, so sibling areas share no file: adding this area
produces zero diff outside it, which is exactly the property `RUNT-01`'s conformance test asserts.
This ticket is in intra-module round 1 alongside `WTCH-02`, whose scope is `apps/worker/**` — a
different application entirely.

## Deliverables

1. **Route area entry** `apps/api/src/routes/watchlists/index.ts` — a default-exported
   `FastifyPluginAsync`, plus `export const area = { admission: 'tenant' } satisfies RouteAreaConfig`
   so the derived prefix is `/v1/watchlists` (`RUNT-01` contract item 4). Nothing outside this
   directory is edited to register it.
2. **Endpoints** (PRD §16.2 "CRUD `/v1/watchlists`"):
   - `POST /v1/watchlists` — create; requires `monitor:write`; honours `Idempotency-Key`;
     `201` with `ETag`.
   - `GET /v1/watchlists` — cursor list (`page_size` 1–100, default 25, opaque `next_cursor`);
     requires `monitor:read`; filters `active`, `delivery_mode`.
   - `GET /v1/watchlists/{watchlist_id}` — detail with embedded targets; `ETag`.
   - `PATCH /v1/watchlists/{watchlist_id}` — partial update of the mutable fields; requires
     `If-Match`; a mismatch returns `409 CONCURRENT_MODIFICATION`.
   - `DELETE /v1/watchlists/{watchlist_id}` — requires `If-Match`; performs the repository's
     deactivate-or-delete path (never a cascade that removes alert history).
   - `POST /v1/watchlists/{watchlist_id}/targets` — add one target; `Idempotency-Key` honoured.
   - `GET /v1/watchlists/{watchlist_id}/targets` — cursor list.
   - `DELETE /v1/watchlists/{watchlist_id}/targets/{target_id}`.
   - `POST /v1/watchlists/{watchlist_id}/targets/{target_id}/refresh` — re-materialises a
     `RECORD_AUTHORITY` target (deliverable 5); a no-op `200` for the other five kinds.
3. **Watchlist DTO** carrying exactly the PRD §32.7 fields and nothing that belongs to another
   surface: `id` (`wat_` prefixed), `name`, `active` (the "active state"), `event_types[]` (the
   PRD §8.8 change types), `jurisdictions[]`, `severity_threshold`, `delivery_mode`
   (`IMMEDIATE` | `DAILY_DIGEST`), `channels[]` (`IN_APP` | `EMAIL` | `WEBHOOK`), `target_count`,
   `created_at`, `updated_at`, `row_version`. Values come from `packages/contracts` enums
   (`FND-03`); the route declares **no local union of change types, channels or severities**.
   Validation: `name` 1–120 characters; `event_types` a non-empty subset of the enum;
   `channels` a non-empty subset; an empty `jurisdictions` array means "all", stated in the schema
   description.
4. **Watch-target DTO and the six-kind normalisation contract.** One request shape with a
   discriminated `target_kind` (`FND-03`'s `WatchTargetKind`), each mapping to the repository's
   `(target_kind, normalized_key)` pair:

   | `target_kind` | Request payload | Normalised key | Route-level validation |
   |---|---|---|---|
   | `DOCUMENT` | `{ document_id }` | the opaque corpus document id, unchanged | id shape only — corpus ids are opaque and are **not** dereferenced here (PRD §34.1 "clients never parse them") |
   | `NODE` | `{ node_id }` | the opaque corpus node id | id shape only |
   | `EMPLOYER_ABN` | `{ abn, employer_name? }` | digits-only ABN | ABN checksum; a failure returns `400 INVALID_ABN` (PRD §34.9) **before** any repository call, and consumes no quota |
   | `JURISDICTION_TOPIC` | `{ jurisdiction, topic }` | `<jurisdiction>:<normalised-topic>` | `jurisdiction` from the contracts enum; `topic` trimmed, case-folded, internal whitespace collapsed |
   | `SAVED_SEARCH` | `{ query, filters, legal_as_at, jurisdictions[] }` | a stable hash of the canonicalised descriptor | `legal_as_at` is `YYYY-MM-DD` (PRD §34.1); an invalid date returns `400 INVALID_LEGAL_DATE` |
   | `RECORD_AUTHORITY` | `{ research_record_id }` | one row per resolved authority id (deliverable 5) | the record must resolve in the caller's tenant |

   Normalisation itself is `DATA-07`'s repository (`Background`); this ticket supplies the typed DTO,
   the pre-repository field validation above, and the mapping of repository rejections to §34.9
   codes. A duplicate `(organization_id, watchlist_id, target_kind, normalized_key)` returns
   `409 IDEMPOTENCY_CONFLICT` when it arrives with a *different* `Idempotency-Key`, and the original
   target when the key matches (PRD §34.1).
5. **`RECORD_AUTHORITY` materialisation (sub-PRD D12).** On create, resolve
   `research_record_id` through `DATA-06`'s **tenant-scoped** repository and expand it into one
   `watch_target` row per distinct cited authority (document/node id) on the record's answer
   snapshots, each row carrying `source_record_id` and `source_kind = 'RESEARCH_RECORD'`. An
   unresolvable or other-tenant record id returns `404 RESOURCE_NOT_FOUND` — the same shape as an
   absent id (PRD §16.5). Re-materialisation is explicit (`.../refresh`), never implicit: a record
   that later gains an answer does not silently widen an existing watch. The reason is stated in the
   handler's doc comment and is a declared non-goal below.
6. **Concurrency and idempotency wiring** — `ETag` is computed from the row's `row_version`
   (PRD §35.1) through the mechanism `RUNT-01`/`FND-08` provide; `PATCH`/`DELETE` require `If-Match`
   and return `409 CONCURRENT_MODIFICATION` on mismatch and `428`-equivalent
   `400 INVALID_REQUEST` naming the missing header when absent. `POST` routes pass the
   `Idempotency-Key` through `RUNT-02`'s idempotency slot; no idempotency store is implemented here.
7. **Tenant isolation, by construction** — every handler obtains its repository from the request's
   `TenantContext` (`DATA-02` via `RUNT-02`); no handler accepts `organization_id` from the body,
   query or path (PRD §34.1, §16.5). An architecture assertion over
   `apps/api/src/routes/watchlists/**` forbids importing any unscoped `packages/database` entry
   point (`SEC-001`).
8. **Error mapping table** in `apps/api/src/routes/watchlists/errors.ts`, mapping every repository
   failure to exactly one PRD §34.9 row (`INVALID_REQUEST`, `INVALID_ABN`, `INVALID_LEGAL_DATE`,
   `RESOURCE_NOT_FOUND`, `IDEMPOTENCY_CONFLICT`, `CONCURRENT_MODIFICATION`). No new error code is
   invented; a genuinely unmapped failure is a writeback to `FND-04`/PRD §34.9, not a local code.
9. **No customer research content in any payload.** The watchlist and target DTOs carry
   identifiers, enum values, a user-authored `name` and a saved-search descriptor — never a question,
   answer, claim text, snippet or excerpt. A schema-level denylist test (the same property-name list
   `FND-05` deliverable 2 applies to events: `question`, `facts`, `answer`, `short_answer`,
   `claim_text`, `quote`, `snippet`, `excerpt`, `content`, `prompt`, `reasoning`,
   `provider_payload`, `text`) asserts it (PRD §8.8, §22).

## Acceptance checklist (classified)

- [ ] `[machine]` **MON-001, normalisation**: all six `WatchTargetKind` values create, read back and
      delete; each stored `normalized_key` matches the deliverable-4 table; an ABN with a bad
      checksum returns `400 INVALID_ABN` with no repository call and no quota event (PRD §8.8,
      §34.9, `MON-001`, `UAT-SRCH-04`'s ABN discipline)
- [ ] `[machine]` **MON-001, duplicate rejection**: adding the same normalised target twice to one
      watchlist is rejected (`409`); adding it to a *different* watchlist in the same organisation
      succeeds (`DATA-07`'s `UNIQUE (organization_id, watchlist_id, target_kind, normalized_key)`)
- [ ] `[machine]` **MON-001, tenant isolation**: a cross-tenant matrix over every route
      (`GET`/`PATCH`/`DELETE` watchlist, target list, target delete, refresh) returns
      `404 RESOURCE_NOT_FOUND` with the same body shape as an unknown id, and never `403` or a
      different latency class (PRD §16.5, §34.9, `SEC-001`, `MON-001` evidence "tenant isolation
      passes")
- [ ] `[machine]` **PRD §32.7 field coverage**: the created watchlist round-trips name, targets,
      event types, jurisdictions, severity threshold, delivery mode, channels and active state — a
      literal expectation table, so a dropped field fails
- [ ] `[machine]` `RECORD_AUTHORITY` materialisation creates one target row per distinct cited
      authority with `source_record_id` set; an other-tenant `research_record_id` returns
      `404 RESOURCE_NOT_FOUND`; `.../refresh` re-materialises and is idempotent when nothing changed
      (sub-PRD **D12**)
- [ ] `[machine]` ETag concurrency: two `PATCH` requests with the same `ETag` — first succeeds,
      second returns `409 CONCURRENT_MODIFICATION`; a `PATCH` without `If-Match` is rejected
      (PRD §16.2, §34.1)
- [ ] `[machine]` Idempotency: the same `POST /v1/watchlists` with the same key and body returns the
      original watchlist and creates one row; the same key with a changed body returns
      `409 IDEMPOTENCY_CONFLICT` (PRD §34.1)
- [ ] `[machine]` Pagination: `page_size` outside 1–100 is rejected; the default is 25; the
      `next_cursor` is opaque and stable across a concurrent insert (PRD §34.1)
- [ ] `[machine]` **Payload minimisation (PRD §8.8)**: no request or response schema in this area
      declares a denylisted property name (deliverable 9), and a test asserts that no complete
      customer question or answer can be stored on or returned from a watchlist or target —
      the module-wide assertion required of every `WTCH-*` ticket
- [ ] `[machine]` A1 conformance: the area registers by directory convention with **zero** diff to
      any file outside `apps/api/src/routes/watchlists/`, asserted with `git status --porcelain`
      after the suite, and boot fails loudly if the area is malformed (`RUNT-01` contract items 2, 6)
- [ ] `[machine]` Architecture: no unscoped `packages/database` import, and no route reads
      `organization_id` from body/query/path (PRD §16.5, §45.2, `SEC-001`)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — the `/v1/watchlists` operations
      appear in the generated bindings with no hand-edit (PRD §20.1, §45.3, `DEV-001`)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement id **MON-001** and epic
      `E25-MONITOR`; user-visible change and non-goals; schema/API/event compatibility impact (new
      `/v1/watchlists` operations, additive within `/v1`); tenant/PII/security impact (tenant-scoped
      repositories only, indistinguishable 404, no research content in payloads); source/licence
      impact (none — corpus ids are opaque references); cost/memory/latency impact (none — no
      generation, no crawl); rollback path (revert the area directory; no migration is owned here);
      known gaps (**Q-WTCH-3**: no declared `DATA-06` edge; **Q-WTCH-6**: the search-screen
      affordance)
- [ ] `[fixture]` **Declared absent** — this ticket replays no recorded change or delivery. The
      recorded-change replay is `WTCH-02`; the delivery replay is `WTCH-04`/`WTCH-05`. Its fixtures
      are synthetic factory rows, which is not a `[fixture]` class under breakdown-plan §1.1
- [ ] `[human]` **Declared absent for merge** — `UAT-MON-01` and `UAT-MON-02` (PRD §41.2) exercise
      matching and delivery, not watchlist configuration; the Gate 2 founder smoke test reaches this
      surface through `WTCH-07`'s screens. No `[human]` criterion is required to merge this ticket
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable (PRD §45.3)

## Test plan

Reviewer steps. Every step is offline: no network, no email provider, no webhook endpoint, no model
provider.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter <the apps/api package name>`; suites under
   `apps/api/src/routes/watchlists/__tests__/`.
3. **Harness.** Copy the construction pattern from `RUNT-02`'s middleware tests: an in-process
   Fastify instance built from `apps/api/src/app.ts` with a temp-file `app.sqlite` migrated by
   `DATA-01`'s runner, seeded with two organisations through `DATA-04`'s tenancy factories and the
   `DATA-07` operations factories. Requests are injected (`app.inject`), never sent over a socket.
4. **Six-kind matrix** — one parametrised test per `WatchTargetKind` asserting the stored
   `normalized_key` against the deliverable-4 table. Confirm the ABN case asserts the *checksum*, not
   merely the digit stripping, and that the invalid-ABN path never reaches the repository (spy on the
   repository).
5. **Cross-tenant matrix** — for each route, call it as organisation B with organisation A's id.
   Assert identical status, body shape and error code to an unknown id. Confirm the test asserts the
   **body**, not just the status: a `403`-shaped body would leak existence.
6. **Concurrency** — two `PATCH`es with one captured `ETag`; assert `200` then
   `409 CONCURRENT_MODIFICATION`. Repeat with `If-Match` omitted.
7. **Idempotency** — replay the create with the same key and body (one row, same id), then with a
   mutated body (`409 IDEMPOTENCY_CONFLICT`).
8. **`RECORD_AUTHORITY`** — seed a record with two answer snapshots citing three distinct
   authorities through `DATA-06`'s factories; assert three target rows with `source_record_id` set;
   add a fourth citation; assert the watch is unchanged until `.../refresh` is called.
9. **Payload denylist** — run the schema denylist test; on a scratch branch add a `question`
   property to the target DTO and confirm it fails naming the property; discard.
10. **A1 conformance** — run `RUNT-01`'s exported route-area conformance helper against this area,
    then `git status --porcelain` and confirm the working tree is clean.
11. **Architecture** — run the unscoped-import assertion; grep the area for `organization_id` reads
    from `request.body`, `request.query` or `request.params` — there must be none.
12. `pnpm generate && pnpm generated:check`; confirm no diff and no hand-edited generated file.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket file** (docs PR →
merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/16-monitor-alerts/README.md` (version +0.1 with a changelog line) **before** changing code.
Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**Foreseeable frictions, each with its exact writeback target:**

1. **`DATA-06` is not merged when this ticket runs**, so `source_record_id` cannot be validated
   (sub-PRD **Q-WTCH-3**). → Stop. Write the missing edge into
   **`docs/prd/breakdown-plan.md` §5.17 and §6.2** (`WTCH-01` `blocked_by` gains `DATA-06`) and
   update `docs/prd/16-monitor-alerts/README.md` Q-WTCH-3. Do **not** ship an unvalidated
   `research_record_id`: it would store a cross-tenant identifier and weaken `SEC-001`.
2. **`DATA-07`'s repository normalises a target kind differently from deliverable 4's table** (for
   example a different saved-search canonicalisation). → The **repository wins**; update
   deliverable 4's table here and note it in `docs/prd/16-monitor-alerts/README.md`. Never
   re-normalise in the route: two normalisers means `WTCH-02` can miss a match, which silently
   breaks `MON-002`.
3. **A required watchlist field from PRD §32.7 has no column** (for example `severity_threshold`). →
   That is `01-app-data`'s tree (breakdown-plan **A3**, risk **R4**). Raise a `01-app-data` ticket,
   add the `blocked_by` edge in **`docs/prd/breakdown-plan.md` §5.2/§6.2**, and record it in this
   module's README. Do **not** write `packages/database/**` and do **not** store the field in a JSON
   blob to avoid the dependency.
4. **A seventh target kind is needed** (a source group, an authority level, a saved comparison, …).
   → PRD §8.8 enumerates six. That is a **product change** (PRD §45.5) requiring founder approval, a
   PRD update, an `FND-03` enum member and a `DATA-07` column. Record it in
   `docs/prd/16-monitor-alerts/README.md` open questions with the requesting surface named; never add
   a local kind.
5. **A repository failure has no PRD §34.9 code.** → Add the mapping request to
   **`FND-04`** (`schemas/openapi/**` is serial-owned, breakdown-plan §4.1) via a `00-foundation`
   ticket and record it here. Never invent an error code in this area — `PLTF-02`/`PLTF-03` generate
   typed errors from the catalogue.
6. **The route needs to execute a saved search to validate it.** → That would create a
   `16 → 14` runtime coupling this ticket does not declare and would consume search quota on a
   configuration write (PRD §16.2: search "MUST not consume generation credits", but it is still a
   metered operation, PRD §38.5). Keep the descriptor opaque; if validation is genuinely required,
   raise the `blocked_by` edge in **`docs/prd/breakdown-plan.md` §5.17/§6.2** first.

**Escalation.** If PRD §8.8's six target kinds or PRD §35.6's *"typed normalised target"* cannot be
represented — for example if a kind requires a per-watch crawl to be usable — that overturns
`MON-001` **and** `MON-002`'s "no crawler per watch" property, which is the reason this module exists.
Stop, escalate for re-review, and write back to `docs/prd/16-monitor-alerts/README.md` and
`docs/prd/breakdown-plan.md` §5.17 before any code lands. Never add a per-watchlist fetch.
