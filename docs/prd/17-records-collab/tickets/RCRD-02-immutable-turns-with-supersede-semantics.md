---
id: RCRD-02
title: "Immutable turns with supersede semantics"
module: 17-records-collab
lane: 17-records-collab
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RCRD-01]
blocks: [RCRD-08]
---

# RCRD-02 — Immutable turns with supersede semantics

Implements PRD §8.7, §34.7 — requirement **REC-001**, epic `E24-RECORDS`.
No ADR — the decision is already made in PRD §8.7 (*"Research turns MUST be immutable; corrections
supersede rather than overwrite prior turns"*) and §34.7 (*"A mistake is corrected by adding a new
turn with `supersedes_turn_id`, never by editing the original turn"*); this is build ticket 2 of 9
against it.
Parent sub-PRD: [17-records-collab README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RCRD-01 — Research-record CRUD with ETag / `If-Match`](RCRD-01-research-record-crud-with-etag-if-match.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §34.7 fixes the turn payload and `DATA-06` fixes the append-only table; this makes the
"no edit path" mechanically true at the HTTP boundary.

## Background + basis

**PRD §8.7**, the governing sentence: *"Research turns MUST be immutable; corrections supersede
rather than overwrite prior turns."* The Timeline that displays them is append-only: PRD §32.6 —
*"The Timeline is append-only. Editable title/tags/assignments use ETag; **formal turns/answers are
never edited**."*

**PRD §34.7 Research Record write contract**, the normative turn payload:

> Formal facts/questions are added as immutable turns:
>
> ```json
> {
>   "turn_type": "FACT_CLARIFICATION",
>   "content": {"fact": "The employer is a constitutional corporation."},
>   "supersedes_turn_id": null
> }
> ```
>
> A mistake is corrected by adding a new turn with `supersedes_turn_id`, never by editing the
> original turn.

**PRD §16.2** places the collection at `/v1/research-records/{id}/turns` under "Research and
collaboration".

**PRD §15.5** gives the entity meaning: *"`ResearchTurn` — Immutable question, clarification or
superseding fact turn."* **PRD §32.4** adds the fourth producer: *"The primary action is **Confirm
stated fact**, not 'accept AI answer'. **User confirmation creates a new immutable ResearchTurn** and
reruns affected stages."*

**PRD §35.5** is the storage contract `DATA-06` already implements:

> | `research_turn` | `id`, `organization_id`, `record_id`, `sequence`, `turn_type`,
> `content_ciphertext`, `supersedes_turn_id`, `actor_id`, `created_at` | **immutable; unique record
> sequence** |

and `DATA-06` deliverable 3 makes that mechanical in two independent layers: *"the repository type
produced by `defineTenantRepository` has **no** `update`/`delete` member … and the migration adds
`BEFORE UPDATE` and `BEFORE DELETE` triggers that `RAISE(ABORT, …)`, so even a raw statement cannot
mutate them"*, with deliverable 2 fixing `UNIQUE (organization_id, record_id, sequence)`.

**PRD §35.8 invariant 5**: *"Formal snapshots and legal corpus versions have **no UPDATE/DELETE
application path**; corrections append replacements."*

**Requirement REC-001** (PRD §30.2): *"Saved research stores immutable turns and Answer Snapshots |
`/records/:id` | research/answer endpoints | App | **No update path mutates an existing formal
snapshot**."*

**PRD §10.1 / §37.2** bind the write: turn content is free-text customer-authored fact material, so
it crosses the server PII boundary before persistence — *"The server MUST be the authoritative PII
boundary before logging, persistence or provider calls"*; §37.2's pipeline ends *"→ accept sanitized
payload OR reject with offsets/types/replacements → **only then create logs, persistence, jobs or
provider calls**"*. Turn content is stored as `content_ciphertext` (PRD §37.3: `SAVE` content lives
in *"Encrypted app rows"*), which `DATA-06` handles through `DATA-03`'s codec — this ticket passes
plaintext to the repository and never encrypts anything itself.

**Two interpretations this ticket fixes**, both stated here rather than assumed:

1. **Cardinality of supersession (sub-PRD QR-9).** PRD §34.7 gives `supersedes_turn_id` but not how
   many turns may supersede one turn. This ticket fixes **at most one direct successor per turn**, so
   "the current statement of this fact" is unambiguous and the effective view is a simple filter
   (`turns with no successor`). Chains are expressed by successive turns: `t1 ← t2 ← t3`. Branching
   supersession would make the effective view a set with no ordering rule, which no PRD section
   defines.
2. **Turn-type vocabulary (sub-PRD QR-8).** PRD §34.7 shows `FACT_CLARIFICATION`; §15.5 describes
   *"question, clarification or superseding fact"*; §32.4 adds a coverage fact confirmation. The
   closed list is `FND-03`'s canonical enum (`packages/contracts`), because PRD §35.1 requires SQLite
   checked text values to be **generated from `packages/contracts`**. This ticket **consumes** that
   enum; if it is absent, raise the `FND-03` writeback rather than declaring a local vocabulary.

**Accepted caveats carried forward:**

- The turn *sequence* is allocated by `DATA-06`'s repository inside the write transaction, protected
  by the `UNIQUE (organization_id, record_id, sequence)` constraint. Two concurrent turn creations on
  one record therefore race on a unique key; this ticket must resolve that race deterministically
  (Deliverable 5), because PRD §44.2 makes concurrency the `E24` exit evidence.
- The Timeline **screen** is `RCRD-08` (which is `blocked_by` this ticket). This ticket ships the
  read model the Timeline consumes; it renders nothing.
- Coverage-stage fact confirmation (PRD §32.4) is initiated by `15-answer-product`/`ASK-09`, which
  calls this collection. This ticket does not own the coverage screen or its rerun trigger.

## Goal

Produce `apps/api/src/routes/research-turns/**`: the append-only turn collection under
`/v1/research-records/{recordId}/turns`, implementing the PRD §34.7 create payload with
`supersedes_turn_id`, a deterministic per-record sequence, an effective-view read that hides
superseded turns, and — most importantly — **no update or delete path of any kind**. Completion is
mechanically checkable: a table-driven test proves that `PUT`, `PATCH` and `DELETE` on every turn path
are unroutable, that the repository this area calls exposes no `update`/`delete` member, and that a
raw statement against `research_turn` aborts; a concurrency test proves two simultaneous turn creations
on one record produce two turns with distinct consecutive sequences and no lost write.

## Non-goals

- **No table, migration or repository.** `DATA-06` owns `research_turn`, its triggers and its
  repository (sub-PRD **D1**, plan **A3**, PRD §45.2, plan **R4**).
- **No record CRUD or ETag handling.** `RCRD-01` (`apps/api/src/routes/research-records/**`). A turn
  write must **not** bump the record's `row_version` or invalidate its ETag — turns are a different
  resource with a different lifecycle (PRD §32.6 separates the append-only Timeline from the
  ETag-guarded header).
- **No workflow transitions.** `RCRD-04`. Adding a turn never changes `workflow_status`; PRD §35.8
  invariant 7 permits only a `ReviewAction` to do that.
- **No answers, rerun or diff.** `RCRD-03`. **No comments.** `RCRD-05` — a comment is a separate
  entity with a `row_version` and is *not* a turn.
- **No issues or corrections.** `RCRD-06`, `RCRD-07`.
- **No screens.** `RCRD-08` owns the Timeline tab.
- **No coverage stage logic or rerun trigger.** `15-answer-product` (`ASK-08`, `ASK-09`) owns the
  seven-stage workflow that PRD §32.4 says a fact confirmation reruns; this area only records the
  turn.
- **No encryption.** `DATA-03`'s codec via `DATA-06`; this area passes plaintext to the repository
  and holds no key (PRD §37.3).
- **No enum definitions.** `FND-03` owns the turn-type vocabulary (**QR-8**); PRD §35.1.
- **No admission stages, OpenAPI edits or app-manifest edits.** `RUNT-02`, `FND-04`,
  `03-app-runtime` (sub-PRD **D16**).
- **No cross-boundary suites.** `tests/**` is `23-assurance`; co-located assertions here per plan R8.

## File-scope (write-owns)

- `apps/api/src/routes/research-turns/**`
- `apps/api/test/records/research-turns/**` (sub-PRD **D15**, plan §1.1)

Does not touch:

- `apps/api/src/routes/research-records/**` — `RCRD-01` (merged; this ticket is `blocked_by` it).
- `apps/api/src/routes/{record-answers,review-actions,comments,issues,corrections}/**` — `RCRD-03`
  … `RCRD-07`.
- `apps/api/src/{server.ts,app.ts,bootstrap,plugins,middleware,errors,sse}/**` — `RUNT-01` …
  `RUNT-03`; `apps/api/package.json`, `apps/api/tsconfig.json` — `03-app-runtime` (**D16**).
- `packages/database/**` — `01-app-data`; `packages/domain/**`, `packages/contracts/**`,
  `schemas/openapi/**` — `00-foundation`.
- `apps/worker/**`, `apps/web/**`, `infra/**`, `tests/**` — other modules.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, no in-flight
ticket), so nothing has previously written `apps/api/src/routes/research-turns/**` and nothing
contends for it. Under plan **A1** every `apps/api/src/routes/<area>/` subtree registers by directory
convention, so this area's four sibling route areas in the same wave (`RCRD-03`, `RCRD-04`, `RCRD-05`
— and `RCRD-06` if scheduled at four lanes) touch four **disjoint** directories and never a shared
index; adding this area produces zero diff outside it (`RUNT-01` contract item 6). The only shared
namespace is the URL space, and this area mounts under `area.prefix = '/v1/research-records'` with
sub-paths `/:recordId/turns[...]` — `RUNT-01`'s boot-time collision detector fails loudly rather than
last-wins if `RCRD-01`, `RCRD-03` or `RCRD-04` ever claimed the same method+path, so the disjointness
is enforced by the runtime, not by convention alone. Per plan **A3**, this ticket writes no table and
no repository; `research_turn` and its triggers belong to `DATA-06`, which is why
`15-answer-product` can write turns through the same repository without either module writing the
other's files.

## Deliverables

1. **`apps/api/src/routes/research-turns/index.ts`** — default-exported `FastifyPluginAsync` plus
   `export const area = { prefix: '/v1/research-records', admission: 'tenant' } satisfies
   RouteAreaConfig` (sub-PRD **D2**; `RUNT-01` contract item 3). The area registers **only** the
   sub-paths below; any collision with `RCRD-01`'s paths fails boot.
2. **`POST /v1/research-records/{recordId}/turns`** — body exactly PRD §34.7's turn shape:
   `turn_type` (from `packages/contracts`' enum, **QR-8**), `content` (a JSON object; the free-text
   fields inside it are customer content), `supersedes_turn_id` (nullable). Route flags:
   `idempotent: true` (PRD §34.1 retryable write), `requiresPiiAdmission: true` (sub-PRD **D10** —
   this is the free-text fact path PRD §10.1 exists for). Responds `201` with the created turn
   including its allocated `sequence`. The response carries **no** `ETag`: a turn is immutable and can
   never be the target of an `If-Match` write.
3. **`GET /v1/research-records/{recordId}/turns`** — the collection, cursor-paginated per PRD §34.1
   (`page_size` 1–100, default 25), ordered by `sequence ASC` so the Timeline is append-ordered
   (PRD §32.6). A `view` query parameter selects:
   - `view=all` (default) — every turn, each carrying `superseded_by_turn_id` (computed, nullable) so
     the Timeline can render supersession without a second request. Nothing is ever hidden: PRD §32.6
     makes the Timeline append-only, which means a superseded turn remains **visible** and marked, not
     removed.
   - `view=effective` — only turns with no successor, i.e. the current statement of each fact
     (PRD §8.7 *"corrections supersede"*).
4. **`GET /v1/research-records/{recordId}/turns/{turnId}`** — one turn, with `supersedes_turn_id` and
   the computed `superseded_by_turn_id`. `404 RESOURCE_NOT_FOUND` for an absent id, a turn belonging
   to another record, and a turn belonging to another organisation — the three cases are
   indistinguishable (PRD §16.5).
5. **Deterministic sequence allocation under concurrency.** The create call allocates `sequence` inside
   `DATA-06`'s write transaction. If the `UNIQUE (organization_id, record_id, sequence)` constraint
   rejects a racing insert, the route **retries with the next sequence** up to a bounded number of
   attempts and only then returns `409 CONCURRENT_MODIFICATION`. Two simultaneous creates on one
   record therefore yield two turns with **consecutive distinct** sequences and no lost write — this
   is the ticket's contribution to the PRD §44.2 `E24` exit evidence *"REC and concurrency tests"*.
   The retry is safe because a turn insert is a pure append with no read-modify-write of other state.
6. **Supersession validation, inside the same transaction** (PRD §34.7; sub-PRD **D5**, **QR-9**):
   - `supersedes_turn_id` must reference a turn in the **same record** and the **same organisation**;
     otherwise `404 RESOURCE_NOT_FOUND` (never a 400 that would confirm the id exists elsewhere —
     PRD §16.5).
   - The target must not already have a successor → `409 CONCURRENT_MODIFICATION` naming the existing
     successor id. At most one direct successor per turn (**QR-9**).
   - A turn may not supersede itself, and a supersession cycle is impossible by construction because a
     new turn always has a strictly greater `sequence` than its target; the route asserts
     `target.sequence < new.sequence` and rejects otherwise.
7. **No mutation path, by construction (sub-PRD D5).** This area registers **no** `PUT`, `PATCH` or
   `DELETE` route at any path. It calls only `DATA-06`'s append-only turn repository, which exposes no
   `update`/`delete` member (compile-time), backed by the `BEFORE UPDATE`/`BEFORE DELETE` triggers
   (runtime). A source assertion in this ticket's tests proves no handler in this directory issues a
   write other than the append.
8. **Permission and scope declarations.** Create requires the record-write permission plus resource
   membership; read requires record-read. Service accounts are additionally checked against
   `records:write` / `records:read` (PRD §16.3). Evaluated by `RUNT-02` against `FND-06`; no role name
   is hard-coded here (PRD §38.1's standing rule: *"a role alone never authorises a record from
   another organisation"*).
9. **Turn creation is composable inside a caller's transaction.** Where `15-answer-product` needs a
   turn written in the same transaction as a job admission (PRD §34.3, §18.5 step 2), it calls
   `DATA-06`'s repository directly — **not** this HTTP route. This area documents that in a code
   comment so no one adds an internal HTTP call between two processes of the same deployment
   (PRD §39.1 dependency rule).
10. **Audit.** Every create emits the `RUNT-02` audit record with actor, organisation, record id, turn
    id, `turn_type`, `supersedes_turn_id` and `request_id` — **ids and codes only**, never the turn
    content (PRD §22; §35.6 `audit_event` *"no complete research body"*).
11. **Test fixtures** — `apps/api/test/records/research-turns/fixtures/`: `create-turn.json` (PRD
    §34.7 verbatim), `supersede-chain.json` (a three-turn chain with its expected `all` and
    `effective` views), and `mutation-attempts.json` (the full method × path matrix that must be
    unroutable). All synthetic (PRD §45.1 item 6).

## Acceptance checklist (classified)

- [ ] `[machine]` **REC-001 / no mutation path:** for every path this area registers, `PUT`, `PATCH`
      and `DELETE` are unroutable (framework `404`/`405`, never a handler) — table-driven over
      `mutation-attempts.json` (PRD §8.7; §32.6 *"formal turns/answers are never edited"*; §30.2
      REC-001)
- [ ] `[machine]` The turn repository this area imports exposes no `update`/`delete` member —
      asserted at the type level with a `@ts-expect-error` compile assertion (PRD §35.8 invariant 5;
      `DATA-06` deliverable 3)
- [ ] `[machine]` A raw `UPDATE`/`DELETE` against `research_turn` on the temp database aborts via
      `DATA-06`'s trigger, proving the guarantee survives a bug in this layer (PRD §35.8 invariant 5)
- [ ] `[machine]` `POST` accepts the PRD §34.7 turn body **verbatim** from `create-turn.json` and
      returns `201` with an allocated `sequence` and **no** `ETag` header (PRD §34.7)
- [ ] `[fixture]` `supersede-chain.json` replays: three turns where `t2` supersedes `t1` and `t3`
      supersedes `t2`; `view=all` returns all three in `sequence` order with `superseded_by_turn_id`
      set on `t1` and `t2`; `view=effective` returns exactly `t3` (PRD §8.7 *"corrections supersede
      rather than overwrite"*)
- [ ] `[machine]` A second attempt to supersede an already-superseded turn returns
      `409 CONCURRENT_MODIFICATION` naming the existing successor (**QR-9**)
- [ ] `[machine]` `supersedes_turn_id` pointing at a turn in another record or another organisation
      returns the byte-identical `404 RESOURCE_NOT_FOUND` as an absent id — the error never reveals
      that the id exists elsewhere (PRD §16.5, §34.9)
- [ ] `[machine]` Self-supersession and a target with a greater `sequence` are both rejected; no
      supersession cycle is constructible (Deliverable 6)
- [ ] `[machine]` **Concurrency (`E24` exit evidence):** 20 concurrent `POST`s to the same record
      from two connections produce 20 turns with 20 distinct consecutive `sequence` values, zero lost
      writes and zero unhandled unique-constraint errors; repeated 25 times (PRD §35.5 *"unique record
      sequence"*; §44.2 `E24` *"REC and concurrency tests"*)
- [ ] `[machine]` A turn write leaves the parent record's `row_version` and `ETag` **unchanged** — the
      Timeline and the ETag-guarded header are separate lifecycles (PRD §32.6)
- [ ] `[machine]` A turn write leaves `workflow_status` unchanged; this area has no path to it
      (PRD §35.8 invariant 7; `RCRD-04` owns transitions)
- [ ] `[machine]` **Tenant isolation (PRD §21.2 / SEC-001):** creating, listing or reading a turn
      against another organisation's record id returns responses byte-identical to the absent-id case
      apart from `request_id`, and the other organisation's turn set is unchanged afterwards
      (PRD §16.5; `UAT-AUTH-03`)
- [ ] `[machine]` `requiresPiiAdmission: true` on `POST`: with the stub rejecting, the response is
      `422 EMPLOYEE_PII_DETECTED` with field/range/category and **not** the detected value, and **no**
      turn row is written; a raw-bytes canary check confirms the content never reached the database
      (PRD §10.1, §37.2, §37.3; sub-PRD **D10**)
- [ ] `[machine]` Idempotency: the same actor/route/key/body returns the original `201` and creates
      **one** turn; a changed body returns `409 IDEMPOTENCY_CONFLICT` (PRD §34.1)
- [ ] `[machine]` `turn_type` values come from `packages/contracts` — a value outside the enum is
      rejected `400 INVALID_REQUEST`, and a source scan finds no locally declared turn vocabulary
      (PRD §35.1; **QR-8**)
- [ ] `[machine]` Pagination honours `page_size` 1–100 / default 25 and the `next_cursor` walk over
      200 turns returns each exactly once in `sequence` order (PRD §34.1)
- [ ] `[machine]` Audit records carry ids/codes only — a canary planted in `content` appears in no
      audit record and no log line (PRD §22, §35.6)
- [ ] `[machine]` No business rule leaked into `apps/api`: no encryption, no enum declaration, no
      workflow logic, no unscoped `packages/database` import (PRD §45.2; `SEC-001`; plan R5)
- [ ] `[machine]` `CUSTOMER_REVIEWED` is not mentioned in any string this area ships; if a future
      string does mention it, it matches `RCRD-01`'s `customer-reviewed-copy.json` and never implies
      product-owner or legal verification (PRD §8.7; sub-PRD **D6**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration` green
      (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean; every path served is declared in
      `FND-04`'s OpenAPI (PRD §20.1; **QR-5**)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**REC-001**, `UAT-AUTH-03`,
      `E24-RECORDS`), user-visible change and non-goals, schema/API/event compatibility (additive
      `/v1` paths; no event), tenant/PII/security/retention impact (tenant-scoped repository, PII
      admission on the only write, content encrypted by `DATA-03` via `DATA-06`), source/licence
      impact (none), cost/memory/latency impact (none — no generation credit), rollback path (revert;
      `RCRD-08` consumes this area), known gaps (**QR-8** turn enum, **QR-9** supersession
      cardinality)
- [ ] No `[human]` criteria in this ticket — the Timeline tab and its `[human]` acceptance are
      `RCRD-08` (PRD §32.6, §41.1)
- [ ] No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected (PRD §45.3)

## Test plan

Reviewer steps. Everything offline: no network, no model provider, no corpus database.

1. `pnpm typecheck && pnpm lint`, then `pnpm test --filter <the apps/api package name>`; suites under
   `apps/api/test/records/research-turns/`.
2. **Harness.** Fastify `inject()` per `apps/api/test/route-area-conformance.ts` (`RUNT-01`
   deliverable 11); `withTempDatabase` (`DATA-01`) seeded with `DATA-04` tenancy factories and
   `RCRD-01`'s record factory (two organisations, one record each). `RUNT-02`'s admission chain with
   its PII stub.
3. **`no-mutation.test.ts`** — the load-bearing test. Table-driven over
   `fixtures/mutation-attempts.json`: for each of `PUT`, `PATCH`, `DELETE` × each registered path
   shape, assert the framework rejects before any handler runs. Then the `@ts-expect-error` compile
   assertion that `turnRepo.update` and `turnRepo.delete` do not exist. Then a raw
   `UPDATE research_turn SET …` and `DELETE FROM research_turn` on the temp database, asserting the
   `DATA-06` trigger aborts both.
4. **`create.test.ts`** — post `fixtures/create-turn.json`; assert `201`, `sequence` allocated,
   no `ETag` header, and that the parent record's `row_version` and `ETag` are unchanged before and
   after. Repeat with the same `Idempotency-Key`: one turn.
5. **`supersede.test.ts`** — replay `fixtures/supersede-chain.json`; assert both views; then attempt a
   second successor for `t1` and assert `409` naming `t2`; attempt supersession across records and
   across organisations and assert the identical `404`; attempt self-supersession and assert
   rejection.
6. **`concurrency.test.ts`** — two `worker_threads`, each with its own connection and Fastify
   instance over the same temp database, issuing ten interleaved `POST`s each to one record. Assert 20
   rows, 20 distinct consecutive sequences, zero `5xx`, zero unhandled unique-constraint errors.
   Repeat 25 times. Copy the two-thread construction pattern from `packages/database/test/research/**`
   (`DATA-06` test plan step 5).
7. **`tenant-isolation.test.ts`** — as organisation A, create/list/read turns against organisation B's
   record id and B's turn id; assert byte-identical `404`s and that B's turn set is unchanged (compare
   a direct repository read before and after).
8. **`pii.test.ts`** — with the stub rejecting, post `content` containing a synthetic TFN canary;
   assert `422 EMPLOYEE_PII_DETECTED` without the canary in the response, no row written, and after
   `PRAGMA wal_checkpoint(TRUNCATE)` the canary absent from the raw `.sqlite`/`-wal` bytes.
9. **`enum.test.ts`** — post an out-of-enum `turn_type`; assert `400 INVALID_REQUEST`. Grep the area's
   source for any hard-coded turn-type string literal outside a type import; assert none.
10. **`pagination.test.ts`** — 200 turns, walk `next_cursor`, assert order and completeness.
11. **`audit.test.ts`** — canary in `content`; assert it appears in no audit record and no log line.
12. **Contract check** — `pnpm generate && pnpm generated:check`.
13. **Source review** — grep the diff for `update`, `delete`, `PATCH`, `PUT`, any crypto call, and any
    unscoped `packages/database` import; all must be absent.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** and
`docs/prd/17-records-collab/README.md` (version +0.1 + changelog line) **before** changing code, then
`publish-tickets.mjs --sync`. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`FND-03` does not export a turn-type enum** (**QR-8**). → Do **not** declare a local vocabulary;
  PRD §35.1 requires the CHECK values to be generated from `packages/contracts` and plan §4.1 makes
  that serial-owned by `FND-03`. Raise a `00-foundation` docs PR, record it in
  `docs/prd/17-records-collab/README.md` **QR-8**, and only then implement.
- **A product flow needs a turn to be superseded by more than one turn** (**QR-9**). → That changes
  what "the current fact" means and therefore what the Timeline, the rerun and the correction impact
  set all read. Update this ticket's Background, `docs/prd/17-records-collab/README.md` **QR-9**, and
  coordinate with `RCRD-03`/`RCRD-07` in one docs PR before changing code. It is a PRD §45.5 product
  change if it is not derivable from §34.7.
- **`DATA-06`'s repository cannot allocate a sequence safely under concurrency** (for example it
  exposes no retry seam). → Do not add a table, an index or a sequence generator here. Raise a new
  `01-app-data` ticket, record the required API in both READMEs, and add the `blocked_by` edge in
  `docs/prd/breakdown-plan.md` §5.18 + §6.2 (plan risk **R4**).
- **`15-answer-product` wants to create a turn over HTTP from the worker** (PRD §34.3 needs it inside
  one transaction). → That is a process-boundary violation of PRD §39.1 and would break atomicity.
  Point it at `DATA-06`'s repository, and record the seam in `docs/prd/01-app-data/README.md` if the
  repository must change.
- **A turn must be redacted** (a PII leak survived admission and is now in an immutable row). → Do
  **not** add an update or delete path. PRD §35.8 invariant 5 and §8.7 forbid it; the remedy is a
  superseding turn plus, if the ciphertext itself must go, a `01-app-data` retention/erasure ticket
  under PRD §10.3. Escalate rather than adding a "just this once" mutation.

**3. Escalation.** Anything that would require **mutating a turn** — an update path, a delete path, a
trigger exemption, an in-place redaction — overturns PRD §8.7 (*"Research turns MUST be immutable"*),
PRD §35.8 invariant 5 and requirement **REC-001**, all customer-facing promises. Stop, escalate for
re-review through the PRD §45.5 product-change path, and write back to
`docs/prd/17-records-collab/README.md` and `docs/prd/01-app-data/README.md` before any code changes.
Never soften immutability inside this ticket.
