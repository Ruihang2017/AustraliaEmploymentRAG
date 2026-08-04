---
id: RCRD-05
title: "Comments on record, answer, claim or citation"
module: 17-records-collab
lane: 17-records-collab
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RCRD-01]
blocks: [RCRD-08]
---

# RCRD-05 — Comments on record, answer, claim or citation

Implements PRD §8.7 and §16.2 — requirement **REC-003**, epic `E24-RECORDS`.
No ADR — the decision is already made in PRD §8.7 (*"Comments MAY target a record, answer, claim or
citation"*), §16.2 (*"CRUD `/v1/comments` and `/resolve`"* with ETag/`If-Match`) and §35.5 (*"target
must belong to same tenant"*); this is build ticket 5 of 9 against it.
Parent sub-PRD: [17-records-collab README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RCRD-01 — Research-record CRUD with ETag / `If-Match`](RCRD-01-research-record-crud-with-etag-if-match.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §16.2 fixes the endpoints and `DATA-06` fixes the tenant-target check; this maps HTTP onto them.

## Background + basis

**PRD §8.7**: *"Comments MAY target a record, answer, claim or citation."* Four target kinds, not
three and not a generic polymorphic pointer — the claim and citation levels are what make a comment
useful in a legal review (PRD §32.3: *"Selecting a claim highlights its source passages"*).

**PRD §16.2** (Research and collaboration): *"CRUD `/v1/comments` and `/resolve`"*, with the section's
closing rule: *"Editable resources MUST use ETag/version + `If-Match`; conflicts return
`409 CONCURRENT_MODIFICATION`."* A comment is an **editable** resource — PRD §35.5 gives it a
`row_version`, unlike the immutable turns and snapshots.

**PRD §35.5**, the storage contract `DATA-06` already implements:

> | `comment` | `id`, `organization_id`, target type/id, `body_ciphertext`, `actor_id`, `resolved_at`,
> `row_version` | **target must belong to same tenant** |

and `DATA-06` deliverable 10:

> 10. **`comment` tenant-target check.** `comment` stores `target_type` + `target_id`; the repository
>     verifies **in the same transaction** that the target row exists **in the same organisation**
>     before insert (PRD §35.5 "target must belong to same tenant"). Allowed target types: record,
>     answer, claim, citation (REC-003).

**Requirement REC-003** (PRD §30.2): *"Comments can target record, answer, claim or citation | Record
detail | comments endpoints | App | **Role and target validation pass**."* Two validations, both
required: *role* (who may comment) and *target* (what may be commented on, in which tenant).

**PRD §38.1 role matrix**, the role half: *"Review/comment shared records — Owner ✓ · Admin ✓ ·
Researcher ✓ if assigned · **Viewer comment if granted** · Developer — · Service account scoped if
granted"*, under the standing rule *"All checks are permission checks plus resource membership; a role
alone never authorises a record from another organisation."* The Viewer row is the interesting one: a
Viewer may comment **only where granted**, which is a permission decision `FND-06` makes and `RUNT-02`
evaluates — this area declares the permission and never encodes the matrix.

**PRD §32.6** places the surface: the Research Record has a **Comments** tab among its six tabs.
`RCRD-08` renders it and is `blocked_by` this ticket.

**PRD §37.3** content retention: comment bodies are `SAVE`-mode customer content living in
*"Encrypted app rows"* — `body_ciphertext` via `DATA-03`'s codec, applied by `DATA-06`. This area
passes plaintext and holds no key. **PRD §10.1** makes the server the authoritative PII boundary
*"before logging, persistence or provider calls"*, so a comment body crosses `RUNT-02`'s
`pii-admission` stage (sub-PRD **D10**).

**PRD §16.5 / §34.9**: an other-tenant id and an absent id return the same `404 RESOURCE_NOT_FOUND`.
For comments this matters twice — for the comment id **and** for the target id: a `400 "unknown claim
id"` would confirm that a claim id exists in some other organisation.

**Accepted caveats carried forward:**

- **Comment threading is not in the PRD.** §8.7 gives four target kinds and §16.2 gives CRUD plus
  resolve; no reply/thread model is specified. This ticket ships a **flat** comment set per target,
  because a thread model would be product surface the PRD does not define. A `parent_comment_id` is
  not added; if threading is wanted it is a PRD §45.5 product change (Feedback obligation).
- **`/v1/issues` carries a `comment` verb too** (PRD §16.2: *"create/list/get/comment `/v1/issues`"*).
  That is `RCRD-06`'s issue-comment surface, a different resource with a different lifecycle. This
  area owns `/v1/comments` only; the two must not be merged.
- **A missing `If-Match`** maps to `400 INVALID_REQUEST` naming the header, per sub-PRD **D4** /
  **QR-4**.

## Goal

Produce `apps/api/src/routes/comments/**`: the `/v1/comments` CRUD plus `/resolve`, targeting a
record, answer, claim or citation, with the target validated inside the same transaction and inside
the same organisation, ETag/`If-Match` on every mutation, and PII admission on every body write.
Completion is mechanically checkable: a four-way target matrix proves all four kinds work and that a
cross-tenant target is indistinguishable from an absent one; a two-connection test proves two edits
carrying the same ETag yield one `200` and one `409`; and a resolve/unresolve race proves the resolved
state cannot be double-applied.

## Non-goals

- **No table, migration or repository.** `DATA-06` owns `comment` and the tenant-target check
  (sub-PRD **D1**, plan **A3**, PRD §45.2, plan **R4**).
- **No comment threading, mentions, notifications or unread state.** Not specified by the PRD; adding
  any of them is a §45.5 product change. Notification delivery is `16-monitor-alerts` in any case.
- **No issue comments.** `RCRD-06` owns `/v1/issues` including its comment verb (PRD §16.2).
- **No record CRUD, turns, answers, review actions or corrections.** `RCRD-01` … `RCRD-04`, `RCRD-07`.
- **No screens.** `RCRD-08` owns the Comments tab and the claim/citation selection interaction
  (PRD §32.3, §32.6).
- **No claim/citation identity or evidence logic.** `12-evidence-safety` (`packages/citations`) and
  `15-answer-product`. This area treats `claim_id` and `citation_id` as opaque ids validated by
  repository lookup (sub-PRD **D17**).
- **No permission matrix.** `FND-06` via `RUNT-02`. This route declares the permission it needs.
- **No encryption.** `DATA-03` via `DATA-06` (PRD §37.3).
- **No OpenAPI, contract, admission or app-manifest edits.** `FND-04`, `FND-03`, `RUNT-02`,
  `03-app-runtime` (**D16**).
- **No cross-boundary suites.** `tests/**` is `23-assurance`; co-located assertions here per plan R8.

## File-scope (write-owns)

- `apps/api/src/routes/comments/**`
- `apps/api/test/records/comments/**` (sub-PRD **D15**)

Does not touch:

- `apps/api/src/routes/{research-records,research-turns,record-answers,review-actions,issues,corrections}/**`
  — `RCRD-01` … `RCRD-07`.
- `apps/api/src/{server.ts,app.ts,bootstrap,plugins,middleware,errors,sse}/**` — `RUNT-01` …
  `RUNT-03`; `apps/api/package.json`, `apps/api/tsconfig.json` — `03-app-runtime` (**D16**).
- `packages/database/**` — `01-app-data`; `packages/domain/**`, `packages/contracts/**`,
  `schemas/openapi/**` — `00-foundation`; `packages/citations/**` — `12-evidence-safety`.
- `apps/worker/**`, `apps/web/**`, `infra/**`, `tests/**` — other modules.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, no in-flight
ticket), so nothing has previously written `apps/api/src/routes/comments/**` and nothing contends for
it. Plan **A1** makes the area self-registering, so adding it produces zero diff outside its own
directory (`RUNT-01` contract item 6). Unlike its wave-2 siblings this area takes the **default**
prefix `/v1/comments` rather than mounting under `/v1/research-records`, so its URL space is disjoint
from `RCRD-01`/`RCRD-02`/`RCRD-03`/`RCRD-04` by construction as well as by `RUNT-01`'s boot-time
collision detector. Per plan **A3** this ticket writes no table and no repository: `comment` and its
same-transaction tenant-target check belong to `DATA-06`, which is why the claim and citation target
kinds — rows owned by `15-answer-product`'s write path — are reachable here without any file
dependency between modules `15` and `17`.

## Deliverables

1. **`apps/api/src/routes/comments/index.ts`** — default-exported `FastifyPluginAsync` plus
   `export const area = { admission: 'tenant' } satisfies RouteAreaConfig`; default prefix
   `/v1/comments` (sub-PRD **D2**; `RUNT-01` contract item 4).
2. **`POST /v1/comments`** — body `{ target_type, target_id, body }` where `target_type` is the
   `packages/contracts` enum restricted to the four PRD §8.7 kinds — `RESEARCH_RECORD`,
   `ANSWER_SNAPSHOT`, `ANSWER_CLAIM`, `CLAIM_CITATION` (the value spelling comes from `FND-03`; if the
   enum is absent, raise the writeback rather than declaring one). Route flags: `idempotent: true`,
   `requiresPiiAdmission: true` (sub-PRD **D10**). Responds `201` with the comment and an `ETag`.
3. **Target validation, in the same transaction (REC-003 "target validation").** Delegates to
   `DATA-06`'s repository, which resolves `(target_type, target_id)` **inside the write transaction**
   and refuses when the row does not exist in the caller's organisation. The route maps that refusal
   to `404 RESOURCE_NOT_FOUND` — byte-identical to an absent target and to an absent comment, so the
   response never reveals that the id exists in another tenant (PRD §16.5). A `target_type` outside
   the four kinds is `400 INVALID_REQUEST` naming the field.
4. **Record association is derived, never supplied.** A comment on a claim or citation belongs to the
   record that owns the answer that owns the claim; the route resolves that chain through the
   repository and stores/returns the owning `record_id` so `RCRD-08` can list a record's comments in
   one query. The client never supplies `record_id` — supplying it is `400 INVALID_REQUEST` naming the
   field (PRD §34.1's derived-not-trusted principle, the same shape as the tenant rule).
5. **`GET /v1/comments`** — list, cursor-paginated per PRD §34.1, filterable by `record_id`,
   `target_type`, `target_id` and `resolved` (`true`/`false`/omitted). Ordered `created_at ASC, id ASC`
   so a thread of remarks on one claim reads in the order written. Soft-deleted comments are excluded.
6. **`GET /v1/comments/{commentId}`** — one comment with an `ETag`. **`PATCH /v1/comments/{commentId}`**
   — edits the **body only**; `target_type`, `target_id`, `record_id`, `actor_id`, `resolved_at` and
   `row_version` are not representable in the patch type and a request carrying one is rejected
   `400 INVALID_REQUEST` naming the field. Requires `If-Match`; flags `requiresPiiAdmission: true`.
   **`DELETE /v1/comments/{commentId}`** — requires `If-Match`; a comment is customer content under
   PRD §10.3's 30-day recoverable rule, so this is a **soft** delete if `DATA-06` exposes one for
   `comment`; if it does not, the route deletes through the repository's only exposed path and the
   difference is recorded per the Feedback obligation rather than worked around.
7. **`POST /v1/comments/{commentId}/resolve` and `POST /v1/comments/{commentId}/unresolve`** — the
   PRD §16.2 `/resolve` verb. Sets/clears `resolved_at` through the repository with `If-Match`,
   returning the new `ETag`. Resolve is **not** idempotent-by-overwrite: resolving an
   already-resolved comment returns `409 CONCURRENT_MODIFICATION` (the caller's ETag is necessarily
   stale), so two reviewers cannot both believe they resolved it.
8. **`If-Match` outcomes, exactly two (sub-PRD D4)** — absent ⇒ `400 INVALID_REQUEST` naming the
   header; mismatched ⇒ `409 CONCURRENT_MODIFICATION` carrying the **current** `ETag`; `*` rejected
   `400`. Applies to `PATCH`, `DELETE`, `resolve` and `unresolve`. ETag values come from `DATA-06`
   (sub-PRD **D3**), never computed here.
9. **Permission and scope declarations.** Create/edit/resolve require the record-comment permission
   evaluated by `RUNT-02`/`FND-06` — this is where PRD §38.1's *"Viewer comment if granted"* and
   *"Researcher ✓ if assigned"* are enforced, by `FND-06`, not by a role string in this area.
   Editing or deleting **another user's** comment is a distinct permission from creating one; the
   route declares both so `FND-06` can decide (PRD §38.1's *"permission checks plus resource
   membership"*). Service accounts additionally require `records:write` / `records:read` (PRD §16.3).
10. **Audit.** Create, edit, delete and resolve emit `RUNT-02`'s audit record with actor,
    organisation, comment id, target type/id, record id, action and `request_id` — **never** the body
    text (PRD §22; §35.6).
11. **Test fixtures** — `apps/api/test/records/comments/fixtures/`: `targets.json` (one valid id per
    target kind in each of two organisations, plus one absent id per kind) and `comment-crud.json`
    (the create/patch/resolve request and response shapes). All synthetic (PRD §45.1 item 6).

## Acceptance checklist (classified)

- [ ] `[fixture]` **REC-003 target matrix:** `targets.json` replays — a comment can be created on a
      record, an answer snapshot, a claim and a citation, and each is listable and readable
      (PRD §8.7 *"Comments MAY target a record, answer, claim or citation"*; §30.2 REC-003)
- [ ] `[machine]` A `target_type` outside the four kinds is rejected `400 INVALID_REQUEST` naming the
      field; the four values come from `packages/contracts` and a source scan finds no locally declared
      vocabulary (PRD §35.1; sub-PRD **D17**)
- [ ] `[machine]` **Tenant-target check (PRD §35.5, §21.2 / SEC-001):** for each of the four kinds, a
      target id belonging to another organisation produces a response **byte-identical** to an absent
      target id apart from `request_id`, and **no** comment row is written (PRD §16.5; `UAT-AUTH-03`)
- [ ] `[machine]` The target check happens **in the same transaction** as the insert — a target
      deleted between check and insert leaves no orphan comment (PRD §35.5 *"target must belong to same
      tenant"*; `DATA-06` deliverable 10)
- [ ] `[machine]` `record_id` is derived from the target chain, never accepted from the client; a
      supplied `record_id` is rejected `400` naming the field, and a comment on a claim resolves to the
      record owning that claim's answer (PRD §34.1)
- [ ] `[machine]` **REC-004-class concurrency (`E24` exit evidence):** two connections `PATCH` the same
      comment with the same `If-Match`; exactly one `200` with an incremented `row_version` and one
      `409 CONCURRENT_MODIFICATION` carrying the current `ETag`; repeated 50 times (PRD §8.7
      *"Concurrent edits MUST use version/ETag checks"*; §16.2; §44.2 `E24`)
- [ ] `[machine]` Two connections `resolve` the same comment simultaneously: exactly one succeeds and
      the other receives `409`; `resolved_at` is written once and the resolving actor is unambiguous
      (PRD §16.2 `/resolve`)
- [ ] `[machine]` `unresolve` clears `resolved_at` and requires a fresh `If-Match`; resolve→unresolve→
      resolve produces three distinct `row_version` values (PRD §35.1)
- [ ] `[machine]` The `PATCH` type accepts **body only**; `target_type`, `target_id`, `record_id`,
      `actor_id`, `resolved_at` and `row_version` are each rejected `400 INVALID_REQUEST` naming the
      field, and no write occurs — table-driven (PRD §35.5's column set)
- [ ] `[machine]` An absent `If-Match` on `PATCH`/`DELETE`/`resolve`/`unresolve` returns
      `400 INVALID_REQUEST` with `details.field === 'If-Match'`; `If-Match: *` is rejected `400`
      (sub-PRD **D4**, **QR-4**)
- [ ] `[machine]` ETag values come from `DATA-06`; a source scan asserts this area computes no hash,
      digest or version string of its own (sub-PRD **D3**)
- [ ] `[machine]` **Role validation (REC-003 "Role … validation pass"):** the permission for creating a
      comment, and the distinct permission for editing/deleting **another user's** comment, are both
      declared and evaluated by `RUNT-02`/`FND-06`; a source scan finds no role-name string in this
      area (PRD §38.1; §45.2)
- [ ] `[machine]` `requiresPiiAdmission: true` on `POST` and `PATCH`: with the stub rejecting, a body
      containing a synthetic PII canary yields `422 EMPLOYEE_PII_DETECTED` carrying field/range/
      category and **not** the value, **no** row is written, and the canary is absent from the raw
      database bytes after `PRAGMA wal_checkpoint(TRUNCATE)` (PRD §10.1, §37.2, §37.3)
- [ ] `[machine]` Idempotency on `POST`: the same actor/route/key/body returns the original `201` and
      creates one comment; a changed body returns `409 IDEMPOTENCY_CONFLICT` (PRD §34.1)
- [ ] `[machine]` Pagination honours `page_size` 1–100 / default 25; the `next_cursor` walk over 200
      comments on one record returns each exactly once in `created_at` order (PRD §34.1)
- [ ] `[machine]` Filters compose: `record_id` + `target_type` + `resolved=false` returns exactly the
      expected subset, and no filter combination can return another organisation's comment
      (PRD §16.5, §21.2)
- [ ] `[machine]` **Audit:** every mutating call writes an audit record with ids/actions only — a
      canary body appears in no audit record and no log line (PRD §22; §35.6)
- [ ] `[machine]` No threading surface exists: the API accepts no `parent_comment_id` and returns no
      reply structure (PRD §8.7/§16.2 define none; adding one is a §45.5 product change)
- [ ] `[machine]` `CUSTOMER_REVIEWED` is not mentioned in any string this area ships; if a future
      string does, it matches `RCRD-01`'s `customer-reviewed-copy.json` and never implies
      product-owner or legal verification (PRD §8.7; sub-PRD **D6**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration` green
      (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean; `/v1/comments` and `/resolve` are
      declared in `FND-04`'s OpenAPI (PRD §20.1; **QR-5**)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**REC-003**, `UAT-AUTH-03`,
      `E24-RECORDS`), user-visible change and non-goals, schema/API/event compatibility (additive
      `/v1` paths; no event), tenant/PII/security/retention impact (body encrypted, PII admission on
      both write paths, four-kind target check inside the transaction), source/licence impact (none),
      cost/memory/latency impact (none — no generation credit), rollback path (revert; `RCRD-08`
      consumes this area), known gaps (**QR-4**; no threading)
- [ ] No `[human]` criteria in this ticket — the Comments tab and the claim/citation selection
      interaction are `RCRD-08`'s `[human]` surface (PRD §32.3, §32.6, §41.1)
- [ ] No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected (PRD §45.3)

## Test plan

Reviewer steps. Everything offline: no network, no model provider, no corpus database.

1. `pnpm typecheck && pnpm lint`; `pnpm test --filter <apps/api>`; suites under
   `apps/api/test/records/comments/`.
2. **Harness.** Fastify `inject()` per `apps/api/test/route-area-conformance.ts` (`RUNT-01`);
   `withTempDatabase` (`DATA-01`) with `DATA-04` tenancy, `RCRD-01`'s record factory and `DATA-06`'s
   research factories (`writeAnswerSnapshot` with at least two claims and two citations) in **two**
   organisations, so every target kind exists on both sides of the tenant boundary.
3. **`targets.test.ts`** — replay `fixtures/targets.json`: create a comment on each of the four kinds;
   assert `201`, an `ETag`, and the derived `record_id`. Then the negative half: for each kind, the
   other organisation's target id and an absent id; assert **byte-identical** responses apart from
   `request_id` and zero rows written.
4. **`same-transaction.test.ts`** — using a repository seam or a forced constraint failure, delete the
   target between validation and insert; assert the insert fails and no orphan comment exists.
5. **`patch-fields.test.ts`** — table-driven over every non-body field; assert `400` naming the field
   and that a subsequent `GET` shows the comment and its `row_version` unchanged.
6. **`concurrency.test.ts`** — two `worker_threads` with their own connections and Fastify instances
   over the same temp database: (a) same-`If-Match` `PATCH` race, (b) simultaneous `resolve` race.
   Assert one `200` / one `409` in each, exactly one stored effect, and that the `409` carries the
   current `ETag` so a retry succeeds. Repeat 50 times. Copy the two-thread pattern from
   `packages/database/test/research/**` (`DATA-06` test plan step 5).
7. **`resolve.test.ts`** — resolve, unresolve, resolve; assert three distinct `row_version` values,
   correct `resolved_at` transitions, and `409` on resolving with a stale ETag.
8. **`if-match.test.ts`** — absent, `*`, malformed, stale, across all four mutating verbs.
9. **`permission.test.ts`** — with `FND-06`'s decision stubbed per case: creator edits own comment
   (allowed), non-creator edits another's (separate permission, denied by default), Viewer without the
   grant (denied), Viewer with the grant (allowed). Assert the route consults the permission and
   contains no role-name literal.
10. **`pii.test.ts`** — canary body with the stub rejecting on both `POST` and `PATCH`; assert `422`,
    no echo, no row/no change, canary absent from raw database bytes after checkpoint.
11. **`pagination-filters.test.ts`** — 200 comments across two records and four target kinds; walk the
    cursor; assert completeness, ordering and that no filter combination leaks the other
    organisation's rows.
12. **`audit.test.ts`** — canary body; assert absence from every audit record and log line.
13. **Contract check** — `pnpm generate && pnpm generated:check`.
14. **Source review** — grep the diff for a locally declared target-type list, any role-name string,
    any crypto call, any locally computed ETag and any unscoped `packages/database` import; all must be
    absent.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** and
`docs/prd/17-records-collab/README.md` (version +0.1 + changelog line) **before** changing code, then
`publish-tickets.mjs --sync`. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`DATA-06` does not expose a soft delete for `comment`**, or its target-kind set differs from the
  four PRD §8.7 kinds. → Do **not** add a table, a column or a query here (plan **A3**/**R4**). Record
  the exact required API in `docs/prd/01-app-data/README.md` and
  `docs/prd/17-records-collab/README.md`, raise a new `01-app-data` ticket, and add the `blocked_by`
  edge in `docs/prd/breakdown-plan.md` §5.18 + §6.2.
- **`FND-03` does not export the comment target-type enum.** → PRD §35.1 requires the CHECK values to
  be generated from `packages/contracts`. Raise the `00-foundation` docs PR and record it in this
  README's open questions; do not declare a local vocabulary.
- **A screen wants threaded replies or @-mentions.** → Neither is in PRD §8.7 or §16.2. That is a
  **product change** under §45.5: record it in `docs/prd/17-records-collab/README.md` open questions
  with the **Founder** as owner, and coordinate with `RCRD-08` in one docs PR. Do not add
  `parent_comment_id` as a "small" schema request.
- **A comment should notify the record's reviewer.** → Notification transport is
  `16-monitor-alerts` (`WTCH-04`/`WTCH-05`/`WTCH-06`) and this module has no edge to it. Write the
  requirement into `docs/prd/17-records-collab/README.md` and `docs/prd/16-monitor-alerts/README.md`
  and add the plan edge before implementing anything; never send mail from `apps/api`.
- **`/resolve` needs to be idempotent** (a client retries and is surprised by `409`). → PRD §16.2
  makes it an ETag-guarded write; the `409` is the specified behaviour and is what stops two reviewers
  both believing they resolved a comment. If the product genuinely wants idempotent resolve, record it
  in this README's open questions with the Founder as owner; do not relax the guard locally.
- **Editing another user's comment turns out to need the same permission as creating one.** → That is
  `FND-06`'s decision, not this area's. Raise it against `FND-06` and record it in
  `docs/prd/00-foundation/README.md`; keep the two permissions declared here so the decision stays
  expressible.

**3. Escalation.** If ETag-guarded comment editing proves unworkable — for instance if the access
layer cannot express the compare-and-swap on `comment.row_version` — that overturns PRD §8.7
(*"Concurrent edits MUST use version/ETag checks"*) and PRD §16.2, both customer-facing promises, and
removes an item from the `E24` concurrency exit evidence. Stop and escalate for re-review through the
PRD §45.5 path. Separately, anything that would require **mutating a turn, an answer snapshot, a claim
or a citation** in order to attach or resolve a comment overturns PRD §8.7's immutability rule and
PRD §35.8 invariant 5 — a comment is a *separate row pointing at* the target and never a modification
of it. Escalate; never soften immutability inside this ticket.
