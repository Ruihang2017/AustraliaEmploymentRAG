---
id: RCRD-04
title: "Review actions and workflow transitions"
module: 17-records-collab
lane: 17-records-collab
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RCRD-01, FND-08]
blocks: [RCRD-08]
---

# RCRD-04 — Review actions and workflow transitions

Implements PRD §8.7, §32.6 and §35.8 — requirement **REC-004**, epic `E24-RECORDS`.
No ADR — the decision is already made in PRD §32.6 (the allowed-transition table), §35.8 invariant 7
(*"`CUSTOMER_REVIEWED` can be reached only through a ReviewAction"*) and §16.2 (`If-Match` →
`409 CONCURRENT_MODIFICATION`); this is build ticket 4 of 9 against it.
Parent sub-PRD: [17-records-collab README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RCRD-01 — Research-record CRUD with ETag / `If-Match`](RCRD-01-research-record-crud-with-etag-if-match.md)
· `FND-08` — Domain: record workflow state machine and ETag rules
([`00-foundation`](../../00-foundation/README.md))
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
`FND-08` already decides every transition; this maps HTTP and audit onto that decision.

## Background + basis

**PRD §32.6 allowed workflow transitions**, transcribed verbatim — the acceptance target:

| From | To | Actor | Condition |
|---|---|---|---|
| `DRAFT` | `IN_REVIEW` | owner/researcher | reviewer assigned; at least one saved answer |
| `IN_REVIEW` | `DRAFT` | reviewer/owner | reason required |
| `IN_REVIEW` | `CUSTOMER_REVIEWED` | reviewer | explicit disclaimer acknowledgement |
| Any active state | `REVIEW_REQUIRED` | system/admin/reviewer | correction, source change or material issue; reason required |
| `REVIEW_REQUIRED` | `IN_REVIEW` | owner/reviewer | replacement/rerun linked |
| Any non-archived | `ARCHIVED` | owner/admin | confirmation; watches optionally retained |
| `ARCHIVED` | `DRAFT` | owner/admin | reason required |

**`FND-08` has already expanded the two wildcard rows to a closed set of twelve ordered pairs** and
committed the expansion as `packages/domain/test/workflow/prd-32-6-transitions.json`. Its ticket
states: *"`ARCHIVED` is the only non-active state, so 'any active state' and 'any non-archived' both
mean `{DRAFT, IN_REVIEW, CUSTOMER_REVIEWED, REVIEW_REQUIRED}`, minus the self-transition in each
case. The full closed set is therefore **12 ordered pairs** … Every other ordered pair of the 5 states
(20 non-self pairs in total) is **invalid** — including `CUSTOMER_REVIEWED` → `IN_REVIEW`,
`CUSTOMER_REVIEWED` → `DRAFT` and `REVIEW_REQUIRED` → `DRAFT`. Self transitions are invalid."*
**This ticket does not re-derive that table.** It calls `FND-08` and maps the result to HTTP.

**`FND-08`'s exported surface**, which this ticket is the first consumer of:

> 2. **`canTransition({ from, to, actor, conditions }): TransitionDecision`** — returns
>    `{ ok: true; transition }` or `{ ok: false; reason }` with `reason` in `INVALID_TRANSITION` |
>    `ACTOR_NOT_PERMITTED` | `CONDITION_NOT_MET` (naming the missing condition).
> 3. **`applyTransition(record, request): Result`** — a pure function returning the next state plus
>    the fields the caller must persist (`row_version + 1`, the new ETag, the reason and the trigger).
>    It performs no I/O; **the caller (`RCRD-04`) persists atomically and writes the audit row.**
> 4. **ETag and version rules**: `computeETag(rowVersion, resourceId)`;
>    `checkIfMatch(provided, current): 'OK' | 'STALE' | 'MISSING'`.
> 6. **`CUSTOMER_REVIEWED` semantics** — a `DISCLAIMER_ACKNOWLEDGED` condition flag plus an exported
>    constant carrying PRD §8.7's meaning.

and its named condition vocabulary: `REVIEWER_ASSIGNED`, `AT_LEAST_ONE_SAVED_ANSWER`,
`REASON_REQUIRED`, `DISCLAIMER_ACKNOWLEDGED`, `MATERIAL_TRIGGER`, `REPLACEMENT_OR_RERUN_LINKED`,
`CONFIRMATION`. `FND-08`'s non-goals name this ticket explicitly: *"No HTTP status mapping, endpoints
or audit writes — `17-records-collab`/`RCRD-04` maps `STALE`/`INVALID_TRANSITION` to
`409 CONCURRENT_MODIFICATION` and writes the audit row."*

**PRD §35.8 invariant 7**: *"`CUSTOMER_REVIEWED` can be reached **only through a ReviewAction**."*
`DATA-06` implements the structural half:

> 8. **Invariant 7 (structural half).** `workflow_status` can only be changed by
>    `applyReviewAction(tx, ctx, { recordId, fromStatus, toStatus, actorId, reason })`, which writes
>    the `review_action` row and the status change **in the same transaction** and refuses when
>    `fromStatus` does not match the current value. There is no other write path to `workflow_status`;
>    in particular, `update()`'s patch type excludes it. **Which transitions are *legal* is
>    `RCRD-04`'s (via `FND-08`).**

**PRD §35.5** for the row: *"`review_action` | `id`, `organization_id`, `record_id`, `from_status`,
`to_status`, `actor_id`, `reason_ciphertext`, `created_at` | **append-only; drives state
transition**"*.

**PRD §16.2** places the collection at `/v1/research-records/{id}/review-actions`, and:
*"Editable resources MUST use ETag/version + `If-Match`; conflicts return
`409 CONCURRENT_MODIFICATION`."*

**Requirement REC-004** (PRD §30.2): *"Workflow transitions enforce actor, ETag and audit | Record
header | review-action endpoint | App | **Invalid transition and stale ETag return 409**."*

**PRD §8.7's non-negotiable boundary**: *"`CUSTOMER_REVIEWED` means customer-internal review and MUST
NOT imply legal verification by the product owner or a lawyer."* PRD §11.2 reinforces it: the product
*"MUST NOT state that a customer is definitely compliant"* and `LEGAL_REVIEW_PENDING` remains an
explicit launch risk. This ticket owns the only API surface where a record becomes
`CUSTOMER_REVIEWED`, so the assertion belongs here.

**PRD §38.1** supplies the actor mapping: *"Review/comment shared records — Owner ✓ · Admin ✓ ·
Researcher ✓ **if assigned** · Viewer comment if granted · Developer — · Service account scoped if
granted"*, under the standing rule *"All checks are permission checks plus resource membership."*
The §32.6 **Actor** column (owner / reviewer / researcher / admin / system) is a *record-relative*
role — reviewer means `record.reviewer_user_id`, owner means `record.owner_user_id` — and is a
different question from the §38.1 organisation role. Both must hold: `RUNT-02`/`FND-06` decides the
organisation permission, and `FND-08`'s `allowedActors` decides the record-relative one. This
composition is stated here because neither upstream ticket states it: `FND-08`'s non-goals say
*"whether that actor may act in the organisation at all is `FND-06`'s decision and **the caller
composes the two**"* — this ticket is that caller.

**Accepted caveats carried forward:**

- **`REVIEW_REQUIRED` has two producers.** The source-change path is `16-monitor-alerts`/`WTCH-03`
  (also `blocked_by FND-08`); the correction path is `RCRD-07`. Both write through `DATA-06`'s
  `applyReviewAction` with `actor = system`. This ticket owns the **HTTP** surface for the
  human-initiated transitions and must not become a hidden dependency of either worker path.
- **The disclaimer copy is `24-launch`/`LNCH-01`** (`docs/policies/**`). This ticket enforces the
  acknowledgement **flag** and the meaning; it holds no policy prose (`FND-08` non-goals, same split).
- **A missing `If-Match`** maps to `400 INVALID_REQUEST` naming the header, per sub-PRD **D4** /
  **QR-4**, because PRD §34.9 has no precondition row.

## Goal

Produce `apps/api/src/routes/review-actions/**`: the `/v1/research-records/{recordId}/review-actions`
collection that performs every human-initiated PRD §32.6 workflow transition by calling `FND-08` for
legality and `DATA-06.applyReviewAction` for atomic persistence, guarded by `If-Match` on the record's
ETag, and exposes the append-only review-action history. Completion is mechanically checkable: an
exhaustive test over all 25 ordered state pairs proves the endpoint permits exactly `FND-08`'s twelve
and rejects the rest with `409`; a two-connection test proves two simultaneous transitions from the
same `from_status` yield one success and one `409`; and a string assertion proves nothing this area
ships implies that `CUSTOMER_REVIEWED` means legal verification.

## Non-goals

- **No transition table, actor rule, condition predicate or ETag algorithm.** `FND-08`
  (`packages/domain/src/workflow/**`). Re-deriving any of them here is plan risk **R5** and PRD §45.2's
  *"Duplicated business rules"*.
- **No table, migration or repository.** `DATA-06` owns `review_action` and `applyReviewAction`
  (sub-PRD **D1**, plan **A3**, **R4**).
- **No organisation permission matrix.** `FND-06`, evaluated by `RUNT-02`. This route declares the
  permission and composes it with `FND-08`'s record-relative actor check.
- **No record metadata edit.** `RCRD-01` owns `PATCH /v1/research-records/{id}`, whose body type
  excludes `workflow_status` — the two paths must stay disjoint.
- **No turns, answers, comments, issues or corrections.** `RCRD-02`, `RCRD-03`, `RCRD-05`, `RCRD-06`,
  `RCRD-07`.
- **No system-triggered `REVIEW_REQUIRED` marking.** `16-monitor-alerts`/`WTCH-03` (source change) and
  `RCRD-07` (correction) write it directly through `DATA-06`; this area exposes the human-initiated
  transitions only and is not on either worker's call path.
- **No screens or disclaimer copy.** `RCRD-08` renders the header and the acknowledgement control;
  `24-launch`/`LNCH-01` owns `docs/policies/**`.
- **No watch retention behaviour.** PRD §32.6's `ARCHIVED` row says *"watches optionally retained"*;
  the watch entities are `16-monitor-alerts`/`WTCH-01`. This ticket carries the flag on the transition
  request (as `FND-08` models it) and performs no watch write.
- **No OpenAPI, contract, admission or app-manifest edits.** `FND-04`, `FND-03`, `RUNT-02`,
  `03-app-runtime` (**D16**).
- **No cross-boundary suites.** `tests/**` is `23-assurance`; co-located assertions here per plan R8.

## File-scope (write-owns)

- `apps/api/src/routes/review-actions/**`
- `apps/api/test/records/review-actions/**` (sub-PRD **D15**)

Does not touch:

- `apps/api/src/routes/{research-records,research-turns,record-answers,comments,issues,corrections}/**`
  — `RCRD-01` … `RCRD-07`.
- `packages/domain/**` — `00-foundation` (`FND-08`); `packages/database/**` — `01-app-data`;
  `packages/contracts/**`, `schemas/openapi/**` — `00-foundation`.
- `apps/api/src/{server.ts,app.ts,bootstrap,plugins,middleware,errors,sse}/**` — `RUNT-01` …
  `RUNT-03`; `apps/api/package.json`, `apps/api/tsconfig.json` — `03-app-runtime` (**D16**).
- `apps/worker/**`, `apps/web/**`, `infra/**`, `tests/**`, `docs/policies/**` — other modules.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, no in-flight
ticket), so nothing has previously written `apps/api/src/routes/review-actions/**` and nothing
contends for it. Plan **A1** makes the area self-registering, so adding it produces zero diff outside
its own directory (`RUNT-01` contract item 6); its wave-2 siblings (`RCRD-02`, `RCRD-03`, `RCRD-05`)
own three other disjoint route directories. It mounts under `area.prefix = '/v1/research-records'`
with sub-paths `/:recordId/review-actions[...]`, and `RUNT-01`'s boot-time collision detector — *"If
two areas would register the same method+path, boot fails with an error naming both areas and the
path. Last-wins is forbidden."* — makes the URL disjointness from `RCRD-01`/`RCRD-02`/`RCRD-03`
machine-enforced. Per plan **A3** this ticket writes no table and no repository: `review_action` and
the atomic `applyReviewAction` belong to `DATA-06`, which is why `WTCH-03` (`16-monitor-alerts`) can
mark records `REVIEW_REQUIRED` through the same repository without either module writing the other's
files.

## Deliverables

1. **`apps/api/src/routes/review-actions/index.ts`** — default-exported `FastifyPluginAsync` plus
   `export const area = { prefix: '/v1/research-records', admission: 'tenant' } satisfies
   RouteAreaConfig` (sub-PRD **D2**).
2. **`POST /v1/research-records/{recordId}/review-actions`** — the single transition endpoint. Body:
   `{ to_status, reason?, conditions: { disclaimer_acknowledged?, confirmation?, retain_watches?,
   replacement_answer_id? } }`. Requires `If-Match` carrying the **record's** ETag. `from_status` is
   **never** taken from the body — it is read from the stored record inside the transaction, so a
   client cannot assert a state it does not hold (PRD §34.1's tenant rule applied to state: derived,
   not trusted). Route flags: `idempotent: true`, `requiresPiiAdmission: true` (the `reason` is
   free-text customer content stored as `reason_ciphertext`, PRD §35.5; sub-PRD **D10**).
3. **The decision order, fixed and asserted.** For each request, in this exact order:
   1. `RUNT-02` admission (authn → tenant → membership → **organisation permission** → rate → PII →
      schema) — PRD §16.5.
   2. Load the record inside a transaction; `checkIfMatch(providedETag, etagFor(record))` (`FND-08` /
      `DATA-06`) → `MISSING` ⇒ `400 INVALID_REQUEST` naming the header (**D4**); `STALE` ⇒
      `409 CONCURRENT_MODIFICATION` with the current `ETag`.
   3. Resolve the **record-relative actor** (`owner` if `actor_id === record.owner_user_id`,
      `reviewer` if `=== record.reviewer_user_id`, otherwise `admin` where the organisation role is
      Owner/Admin, otherwise `researcher`) and call
      `canTransition({ from: record.workflow_status, to, actor, conditions })`.
   4. Map `FND-08`'s refusal reasons: `INVALID_TRANSITION` ⇒ `409 CONCURRENT_MODIFICATION` (REC-004:
      *"Invalid transition and stale ETag return 409"*); `ACTOR_NOT_PERMITTED` ⇒ `403`;
      `CONDITION_NOT_MET` ⇒ `400 INVALID_REQUEST` **naming the missing condition** (`FND-08` returns
      it).
   5. `applyTransition` (pure), then `DATA-06.applyReviewAction(tx, ctx, …)` writing the
      `review_action` row and the `workflow_status` change **in one transaction** (PRD §35.8
      invariant 7).
   6. Commit, then emit the audit record.
   The order is exported as a literal array so a test can assert it, and a reorder fails loudly.
4. **`GET /v1/research-records/{recordId}/review-actions`** — the append-only history, ordered
   `created_at ASC, id ASC`, cursor-paginated per PRD §34.1. Each entry carries `from_status`,
   `to_status`, `actor_id`, `created_at` and the reason. This is the Audit-tab source for workflow
   events (sub-PRD **D11**).
5. **No mutation path (sub-PRD D5).** The area registers **no** `PUT`, `PATCH` or `DELETE`;
   `review_action` is append-only in PRD §35.5 and trigger-protected by `DATA-06`. A transition is
   "undone" only by another transition that §32.6 permits (for example `IN_REVIEW → DRAFT` with a
   reason).
6. **`CUSTOMER_REVIEWED` is reachable only here, and only with acknowledgement (sub-PRD D6).**
   - The transition requires `conditions.disclaimer_acknowledged === true`; absent, `FND-08` returns
     `CONDITION_NOT_MET('DISCLAIMER_ACKNOWLEDGED')` and this area returns `400` naming it.
   - The stored `review_action` records the acknowledgement in its reason payload so the record's
     history shows *who* acknowledged *what*, not merely that the state changed.
   - Every string this area returns or describes for the state is drawn from a committed fixture
     `apps/api/test/records/review-actions/fixtures/customer-reviewed-copy.json`, whose content is
     PRD §8.7's own wording: *"customer-internal review; does not imply legal verification by the
     product owner or a lawyer."* A negative assertion forbids the words *verified*, *legal review*,
     *approved by*, *certified* and *compliant* anywhere in this area's strings.
7. **Reason handling.** Where §32.6 says *"reason required"* (`IN_REVIEW → DRAFT`,
   `* → REVIEW_REQUIRED`, `ARCHIVED → DRAFT`), an empty or whitespace-only reason is a
   `CONDITION_NOT_MET('REASON_REQUIRED')` refusal, not an accepted blank. The reason is passed as
   plaintext to `DATA-06`, which stores it as `reason_ciphertext` via `DATA-03` — this area holds no
   key and performs no encryption (PRD §37.3).
8. **Concurrency.** Two simultaneous transitions carrying the same ETag must produce exactly one
   success. The compare-and-swap is `DATA-06`'s (`applyReviewAction` *"refuses when `fromStatus` does
   not match the current value"*, plus the record's `row_version` increment); this area returns
   `409 CONCURRENT_MODIFICATION` with the current `ETag` on the loser and performs **no** retry — a
   workflow transition is not idempotent under a changed `from_status` and must be re-decided by the
   human.
9. **Permission and scope declarations.** The endpoint declares the record review permission
   evaluated by `RUNT-02`/`FND-06`; service accounts additionally require `records:write` (PRD §16.3).
   Both the organisation permission and `FND-08`'s record-relative actor check must pass — the
   composition stated in Background.
10. **Audit.** Every transition emits an audit record with actor, organisation, record id,
    `from_status`, `to_status`, condition flags, `request_id` and the review-action id — **never** the
    reason text (PRD §22; §35.6 `audit_event` *"no complete research body"*). REC-004's evidence
    names audit explicitly, so this is a first-class deliverable, not logging.
11. **Test fixtures** — `apps/api/test/records/review-actions/fixtures/`:
    `prd-32-6-http-matrix.json` (all 25 ordered state pairs × the actor set × condition sets, with the
    expected HTTP status per cell, derived from `FND-08`'s committed
    `packages/domain/test/workflow/prd-32-6-transitions.json`), and `customer-reviewed-copy.json`.
    Deriving the matrix from `FND-08`'s fixture rather than restating it is what keeps the two from
    drifting.

## Acceptance checklist (classified)

- [ ] `[fixture]` **PRD §32.6 replay:** `prd-32-6-http-matrix.json`, derived from `FND-08`'s committed
      `prd-32-6-transitions.json`, replays end to end over HTTP: exactly the twelve permitted ordered
      pairs succeed with the correct actor and conditions (PRD §32.6; **REC-004**)
- [ ] `[machine]` **Exhaustive closure:** for all 5 × 5 = 25 ordered state pairs the endpoint permits
      **exactly** twelve and rejects the other thirteen — including all five self-transitions,
      `CUSTOMER_REVIEWED → IN_REVIEW`, `CUSTOMER_REVIEWED → DRAFT` and `REVIEW_REQUIRED → DRAFT` —
      with `409 CONCURRENT_MODIFICATION` (PRD §32.6; §30.2 REC-004 *"Invalid transition … return 409"*)
- [ ] `[machine]` The pairs are enumerated **programmatically from the `RecordWorkflowState` enum**,
      not a hand-written list, so adding a state fails the test rather than passing silently
      (`FND-08` enum-coverage guard, mirrored at the HTTP layer)
- [ ] `[machine]` `ACTOR_NOT_PERMITTED` maps to `403` and `CONDITION_NOT_MET` maps to
      `400 INVALID_REQUEST` **naming the missing condition** — one explicit case per condition
      (`REVIEWER_ASSIGNED`, `AT_LEAST_ONE_SAVED_ANSWER`, `REASON_REQUIRED`, `DISCLAIMER_ACKNOWLEDGED`,
      `MATERIAL_TRIGGER`, `REPLACEMENT_OR_RERUN_LINKED`, `CONFIRMATION`) (PRD §32.6 Condition column)
- [ ] `[machine]` `from_status` is read from storage, never from the request body; a body carrying
      `from_status` is rejected `400 INVALID_REQUEST` naming the field (PRD §34.1's derived-not-trusted
      principle)
- [ ] `[machine]` **REC-004 / stale ETag:** a transition with a stale `If-Match` returns
      `409 CONCURRENT_MODIFICATION` carrying the current `ETag`, and **no** `review_action` row and no
      status change are written (PRD §16.2, §34.9)
- [ ] `[machine]` An absent `If-Match` returns `400 INVALID_REQUEST` with `details.field === 'If-Match'`
      (sub-PRD **D4**, **QR-4**)
- [ ] `[machine]` **Invariant 7 / atomicity:** the `review_action` row and the `workflow_status` change
      commit together; a forced failure after the status write leaves **neither**; there is no other
      write path to `workflow_status` reachable from this area (PRD §35.8 invariant 7; `DATA-06`
      deliverable 8)
- [ ] `[machine]` **`CUSTOMER_REVIEWED` is reachable only through a ReviewAction:** an attempt to reach
      it through `RCRD-01`'s `PATCH` is rejected `400` naming the field, and a direct repository
      `update()` cannot express it (compile-time) (PRD §35.8 invariant 7)
- [ ] `[machine]` **`CUSTOMER_REVIEWED` never implies verification:** every string this area ships
      matches `customer-reviewed-copy.json`, and the forbidden-word assertion (*verified*, *legal
      review*, *approved by*, *certified*, *compliant*) finds nothing (PRD §8.7 *"MUST NOT imply legal
      verification by the product owner or a lawyer"*; §11.2)
- [ ] `[machine]` **Concurrency (`E24` exit evidence):** two connections POST the same transition with
      the same `If-Match`; exactly one `200` and one `409`; the stored state is the winner's and
      exactly **one** `review_action` row exists; repeated 50 times (PRD §8.7; §44.2 `E24` *"REC and
      concurrency tests"*)
- [ ] `[machine]` Two connections POST **different** valid transitions from the same state; exactly one
      succeeds and the other receives `409` — the loser is not silently applied on top (PRD §32.6)
- [ ] `[machine]` A blank or whitespace-only `reason` on a reason-required transition is refused with
      `CONDITION_NOT_MET('REASON_REQUIRED')` (PRD §32.6)
- [ ] `[machine]` `GET …/review-actions` is append-only ordered history; `PUT`/`PATCH`/`DELETE` are
      unroutable on every path this area registers, and a raw `UPDATE`/`DELETE` on `review_action`
      aborts via `DATA-06`'s trigger (PRD §35.5 *"append-only"*; §35.8 invariant 5)
- [ ] `[machine]` **Tenant isolation (PRD §21.2 / SEC-001):** transitioning or listing review actions
      against another organisation's record id returns responses byte-identical to the absent-id case
      apart from `request_id`, and that organisation's `workflow_status` is unchanged afterwards
      (PRD §16.5; `UAT-AUTH-03`)
- [ ] `[machine]` Both checks compose: an organisation-permitted actor who is neither owner nor
      reviewer is refused `403` on `IN_REVIEW → CUSTOMER_REVIEWED`, and a record-relative reviewer
      without the organisation permission is refused by `RUNT-02` before the domain call (PRD §38.1;
      `FND-08` non-goals *"the caller composes the two"*)
- [ ] `[machine]` `requiresPiiAdmission: true`: with the stub rejecting, a reason containing a
      synthetic PII canary yields `422 EMPLOYEE_PII_DETECTED` without echoing the value, and **no**
      transition and **no** `review_action` row occur (PRD §37.2; §10.1)
- [ ] `[machine]` **Audit:** every transition writes an audit record with actor/organisation/record/
      from/to/conditions/`request_id`/review-action id and **no** reason text — asserted with a canary
      reason (PRD §22; §35.6; §30.2 REC-004 names audit)
- [ ] `[machine]` No duplicated business rule: a source scan finds no transition table, no actor list
      and no condition predicate in this area — all come from `FND-08` (PRD §45.2; plan R5)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration` green
      (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean; the review-actions path is declared in
      `FND-04`'s OpenAPI (PRD §20.1; **QR-5**)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**REC-004**, `UAT-REC-02`,
      `UAT-AUTH-03`, `E24-RECORDS`), user-visible change and non-goals, schema/API/event compatibility
      (additive `/v1` path; no event), tenant/PII/security/retention impact (reason is encrypted
      customer text; audit carries none of it), source/licence impact (none), cost/memory/latency
      impact (none — no generation credit), rollback path (revert; `RCRD-08` consumes this area),
      known gaps (**QR-4** missing-`If-Match` code)
- [ ] No `[human]` criteria in this ticket — the acknowledgement control and its `[human]` acceptance
      are `RCRD-08`; `UAT-REC-02` is run as a founder script against the deployed UI by
      `23-assurance`/`ASSR-06` (PRD §41.2)
- [ ] No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected (PRD §45.3)

## Test plan

Reviewer steps. Everything offline: no network, no model provider, no corpus database.

1. `pnpm typecheck && pnpm lint`; `pnpm test --filter <apps/api>`; suites under
   `apps/api/test/records/review-actions/`.
2. **Harness.** Fastify `inject()` per `apps/api/test/route-area-conformance.ts` (`RUNT-01`);
   `withTempDatabase` (`DATA-01`) with `DATA-04` tenancy and `RCRD-01`'s record factory. Seed, per
   organisation: one Owner, one Admin, one Researcher who is the record's `reviewer_user_id`, one
   Researcher who is not, and one Viewer. Seed a record in each of the five workflow states, each with
   and without a saved answer, so the `AT_LEAST_ONE_SAVED_ANSWER` condition is exercisable.
3. **Read the fixture against `FND-08` first.** Confirm `fixtures/prd-32-6-http-matrix.json` is
   *derived from* `packages/domain/test/workflow/prd-32-6-transitions.json` (a generation step or an
   import), not retyped. A retyped matrix is the single most likely source of silent drift and should
   bounce.
4. **`transition-matrix.test.ts`** — enumerate the 25 ordered pairs **from the enum**, POST each with a
   permitted actor and full conditions, and assert exactly twelve succeed. Assert the thirteen
   rejections carry `409` with code `CONCURRENT_MODIFICATION`.
5. **`actor-and-conditions.test.ts`** — for each of the twelve transitions, one case with a
   non-permitted record-relative actor (`403`) and one case per named condition unsatisfied (`400`
   naming it).
6. **`if-match.test.ts`** — stale, absent, `*` and malformed; assert the four outcomes and that no row
   was written in the failing cases.
7. **`atomicity.test.ts`** — inject a failure between the status write and the `review_action` insert
   (a repository seam or a forced constraint violation); assert neither persists. Then the happy path;
   assert both persist with matching `from_status`/`to_status`.
8. **`concurrency.test.ts`** — two `worker_threads`, own connections, same `If-Match`, same
   transition: one `200`, one `409`, exactly one `review_action` row. Then the same with two
   *different* valid transitions from one state. Repeat 50 times. Copy the two-thread pattern from
   `packages/database/test/research/**` (`DATA-06` test plan step 5).
9. **`customer-reviewed.test.ts`** — (a) transition without `disclaimer_acknowledged` ⇒ `400` naming
   the condition; (b) with it ⇒ `200` and the acknowledgement visible in the stored review action;
   (c) attempt to reach `CUSTOMER_REVIEWED` through `RCRD-01`'s `PATCH` ⇒ `400`; (d) string fixture
   equality and the forbidden-word negative assertion over every string this area exports or returns.
10. **`tenant-isolation.test.ts`** — as organisation A, transition and list against organisation B's
    record id; assert indistinguishable `404`s and that B's `workflow_status` is unchanged (direct
    repository read before and after).
11. **`append-only.test.ts`** — method × path matrix for `PUT`/`PATCH`/`DELETE`; then the raw
    `UPDATE`/`DELETE` trigger abort on `review_action`.
12. **`pii.test.ts`** — canary reason with the stub rejecting; assert `422`, no echo, no transition, no
    row, and canary absent from raw database bytes after `PRAGMA wal_checkpoint(TRUNCATE)`.
13. **`audit.test.ts`** — canary reason; assert the audit record carries ids and statuses only.
14. **Source review** — grep the diff for any state-name array, actor array or condition predicate;
    all must come from `FND-08`. Grep for any second write path to `workflow_status`; none.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** and
`docs/prd/17-records-collab/README.md` (version +0.1 + changelog line) **before** changing code, then
`publish-tickets.mjs --sync`. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`FND-08`'s twelve-pair expansion proves wrong** — a real review flow needs, say,
  `CUSTOMER_REVIEWED → IN_REVIEW`. → Do **not** add the pair here. `FND-08`'s own feedback obligation
  owns this: update the expansion table in `FND-08`'s ticket, its fixture and
  `docs/prd/00-foundation/README.md`, then this ticket's derived matrix. Adding a transition is a
  customer-visible workflow change needing founder approval under PRD §45.5 if it is not derivable
  from §32.6's wildcards.
- **`FND-08`'s transition input cannot carry something this endpoint needs** (for example the
  identity of the correction that triggered `REVIEW_REQUIRED`, which `RCRD-07` will want). → Extend
  the input type **in `FND-08`**, not here; PRD §45.2 forbids duplicated business rules outside
  `packages/domain`. `FND-08`'s feedback obligation item 2 names exactly this case. Record the shape
  in `docs/prd/00-foundation/README.md` and this README.
- **`DATA-06.applyReviewAction` cannot express a required transition** (for example a system actor
  with no `actor_id`, needed by `WTCH-03`/`RCRD-07`). → Raise a new `01-app-data` ticket, record the
  required API in `docs/prd/01-app-data/README.md` and this README, and add the `blocked_by` edge in
  `docs/prd/breakdown-plan.md` §5.18 + §6.2. Never write the table here (plan **R4**).
- **`INVALID_TRANSITION` should not be `409`.** → PRD §30.2 REC-004's evidence is literally *"Invalid
  transition and stale ETag return 409"*. Changing it is an API change: raise it in
  `docs/prd/17-records-collab/README.md` open questions with the Founder as owner; do not pick a
  different code locally.
- **A screen wants to display why a transition is unavailable before attempting it.** → Expose it as a
  **read** (a capability list computed by calling `FND-08`'s pure `canTransition`), never as a second,
  laxer write path. Record the read shape here and in `RCRD-08` in one docs PR.
- **`24-launch` has not written the disclaimer copy yet.** → Ship the acknowledgement flag and the
  neutral fixture wording; do **not** invent policy prose. Note the dependency in
  `docs/prd/17-records-collab/README.md`; `LNCH-01` owns `docs/policies/**`.

**3. Escalation.** Two escalation classes here, both non-negotiable:

- Anything that would let `CUSTOMER_REVIEWED` be reached **without** a `ReviewAction`, or that would
  render or return text implying product-owner or legal verification, overturns PRD §8.7, PRD §35.8
  invariant 7 and PRD §11.2's legal positioning. Stop and escalate; never soften it locally.
- Anything that would require **mutating a `review_action` row** — editing a reason, deleting a
  mistaken transition — overturns PRD §35.5's *"append-only"* and §35.8 invariant 5. The remedy is
  another permitted transition, not a mutation. Escalate through the PRD §45.5 product-change path and
  write back to `docs/prd/17-records-collab/README.md` and `docs/prd/01-app-data/README.md` before any
  code changes.
