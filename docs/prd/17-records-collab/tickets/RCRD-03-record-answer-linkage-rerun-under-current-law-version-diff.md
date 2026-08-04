---
id: RCRD-03
title: "Record↔answer linkage, rerun under current law, version diff"
module: 17-records-collab
lane: 17-records-collab
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RCRD-01, ASK-04]
blocks: [RCRD-07]
---

# RCRD-03 — Record↔answer linkage, rerun under current law, version diff

Implements PRD §8.7 and §32.6 — requirement **REC-002**, epic `E24-RECORDS`.
No ADR — the decision is already made in PRD §8.7 (*"Rerun under current law MUST create a new version
and support comparison with the prior answer"*), §34.5 (the immutable Answer Snapshot contract) and
§35.8 invariant 5; this is build ticket 3 of 9 against it.
Parent sub-PRD: [17-records-collab README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RCRD-01 — Research-record CRUD with ETag / `If-Match`](RCRD-01-research-record-crud-with-etag-if-match.md)
· `ASK-04` — Answer snapshot read contract and rerun endpoint
([`15-answer-product`](../../15-answer-product/README.md))
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §34.5 fixes the snapshot payload and `ASK-04` fixes the rerun admission; this adds the record-scoped
surface, the diff and the execution handler.

## Background + basis

This is the ticket that makes a saved answer survive a change in the law without being altered by it.

**PRD §8.7**: *"Formal answers MUST be immutable Answer Snapshots. **Rerun under current law MUST
create a new version and support comparison with the prior answer.**"*

**PRD §41.2 `UAT-REC-01`**, the acceptance script this ticket exists to pass:

> | `UAT-REC-01` | Rerun a 2024 saved answer under current law | **New snapshot/version and diff;
> original remains byte-for-byte unchanged** |

**Requirement REC-002** (PRD §30.2): *"Rerun under current law creates a new answer and diff | Record
action | rerun endpoint | App | **Original legal date/release/output are unchanged**."*

**PRD §34.5 Answer Snapshot** is the immutable payload this ticket reads and diffs. Its
version-bearing and pin-bearing fields, quoted from the normative example:

> ```json
> {
>   "schema_version": "1.0",
>   "id": "ans_...",
>   "record_id": "rec_...",
>   "answer_version": 2,
>   "status": "CONDITIONAL",
>   "short_answer": "…",
>   "legal_as_at": "2026-08-03",
>   "knowledge_cutoff_at": "2026-08-03T02:51:00Z",
>   "jurisdictions": ["CTH", "VIC"],
>   "corpus_release_id": "cr_...",
>   "claims": [ … ], "citations": [ … ], "assumptions": [ … ],
>   "next_checks": [ … ], "limitations": [ … ],
>   "correction_state": "NONE",
>   "created_at": "…"
> }
> ```
>
> Provider prompts, hidden reasoning and raw provider responses are never part of this customer
> contract.

**PRD §35.5** gives the storage guarantee `DATA-06` implements: `answer_snapshot` is *"immutable;
unique record/version and job/result"*, and `DATA-06` deliverable 2 makes that
`UNIQUE (organization_id, record_id, answer_version)` **and** `UNIQUE (job_id)`. **PRD §35.8**
invariant 1: *"An Answer Snapshot and its claims/citations/assumptions commit atomically"*;
invariant 3: *"A citation's node version must belong to the answer's pinned corpus release"*;
invariant 5: *"Formal snapshots … have no UPDATE/DELETE application path; corrections append
replacements."*

**PRD §16.2** places the collection at `/v1/research-records/{id}/answers` under "Research and
collaboration", and `POST /v1/answers/{answer_snapshot_id}/rerun` under "Answers". Sub-PRD **D8**
follows that split: the rerun **admission endpoint** is `ASK-04`'s (`apps/api/src/routes/answer-snapshots/**`,
breakdown plan §4); this ticket owns `apps/api/src/routes/record-answers/**` and
`apps/worker/src/handlers/rerun/**`.

**PRD §18.5** fixes what a rerun's execution must look like, because a rerun *is* an answer job:

> 3. Worker leases the job with at-least-once delivery and **reauthorises actor, tenant, resource and
>    budget**. 4. Search receives only sanitized query, hard filters and **pinned release**. …
> 6. One transaction commits Answer Snapshot, claims/citations/assumptions, retrieval/model metadata,
>    actual cost, job status, audit and outbox. 7. `job.completed` is emitted only after commit.
> At-least-once execution plus idempotency and immutable unique results MUST provide **one observable
> answer and no duplicate charge**.

**PRD §39.5** fixes the queue classes: `interactive_quick` = *"Quick, clarification continuation"*;
`interactive_research` = *"Deep, Coverage, Compare"*. Sub-PRD **D7** therefore registers the rerun
handler under the **same class as the snapshot being rerun**, because a rerun of a Quick answer is a
Quick job and a rerun of a Deep/Coverage/Compare answer is research-class work.

**PRD §45.2** bounds the worker: `apps/worker` owns *"Lease loops and application-service
orchestration"* and must **not** own *"Direct unscoped tenant SQL"*; `apps/api` must not own
*"Duplicated business rules"*. That is why the rerun handler **composes** the existing answer pipeline
(`15-answer-product`, transitively available through `ASK-04 → ASK-02`) instead of re-implementing
retrieval, synthesis or validation.

**What "current law" means here.** PRD §8.7 says *"under current law"*; PRD §32.2 defaults the legal
date to today; PRD §18.4 makes the active CorpusRelease the current one. A rerun therefore sets
`legal_as_at` to the request date (default: today) and pins the **current active** `corpus_release_id`
— never the original's. The original's `legal_as_at`, `corpus_release_id`, model/profile/prompt/
validator versions and every claim, citation and assumption stay exactly as written.

**Accepted caveats carried forward:**

- **The diff payload shape is not in the PRD** (sub-PRD **QR-6**). §8.7 requires "comparison with the
  prior answer" and `UAT-REC-01` requires "a diff", but §34 defines no shape. This ticket fixes an
  initial structured shape over the §34.5 fields (Deliverable 7) and commits it as a fixture. If it
  is published as a public `/v1` contract it becomes an ADR
  (`docs/adr/NNNN-answer-version-diff-contract.md`, slug reserved to this ticket under plan **A9**).
- **`RCRD-08` renders the Answers tab but is not `blocked_by` this ticket** (sub-PRD **QR-3**). That is
  a plan-edge finding raised, not fixed; `RCRD-08` builds against the generated contract types and
  fixtures (sub-PRD **D12**).
- Cancellation, credit reservation and settlement semantics are `15-answer-product`/`12-evidence-safety`
  (PRD §33.2, §42.5). This ticket inherits them by composing the existing pipeline and adds none of
  its own.

## Goal

Produce (a) `apps/api/src/routes/record-answers/**` — the record-scoped answer surface: version list,
link/attach of an existing snapshot to a record, and the version diff; and (b)
`apps/worker/src/handlers/rerun/**` — the handler that executes a rerun under current law by composing
the existing answer pipeline and writing the result as `answer_version = n+1` on the same record.
Completion is mechanically checkable: a fixture-driven test hashes a stored snapshot and all its
children before a rerun and asserts the hash is **identical** afterwards (`UAT-REC-01`), while the new
version exists with the current release pinned and a diff between them is retrievable; and an
at-least-once replay of the rerun job produces exactly one new version and one charge.

## Non-goals

- **No table, migration or repository.** `DATA-06` owns `answer_snapshot`, `answer_claim`,
  `claim_citation`, `answer_assumption` and `writeAnswerSnapshot` (sub-PRD **D1**, plan **A3**,
  PRD §45.2, plan **R4**).
- **No answer synthesis, retrieval, evidence packing, validation, model call or refusal logic.**
  `15-answer-product` (`ASK-01`, `ASK-02`, `ASK-05`) and `12-evidence-safety`. PRD §45.2 forbids
  duplicated business rules; sub-PRD **D7**.
- **No `POST /v1/answers/{answer_snapshot_id}/rerun` admission endpoint.** `ASK-04`
  (`apps/api/src/routes/answer-snapshots/**`), sub-PRD **D8**.
- **No `GET /v1/answers/{id}` snapshot read contract.** `ASK-04`. This ticket reads the same
  repository and reuses the same generated response type.
- **No SSE stage events.** `RUNT-03` (transport) and `ASK-05` (answer stage events). A rerun emits the
  same `job.*`/`stage.changed` events the composed pipeline already emits; this ticket adds no new
  public event type (PRD §34.4's list is closed).
- **No worker runtime, queue class definition, lease loop, fairness arbiter or checkpoint machinery.**
  `RUNT-04`. This handler is one conforming handler area.
- **No clarification rounds.** `ASK-03`. A rerun that requires clarification follows the composed
  pipeline's existing `WAITING_FOR_CLARIFICATION` path (PRD §33.3); this ticket adds no new round
  logic.
- **No corrections.** `RCRD-07`, which is `blocked_by` this ticket and uses the rerun to produce a
  replacement snapshot.
- **No screens.** `RCRD-08` (Answers tab, version timeline, diff view).
- **No export of a diff or snapshot.** `19-exports` (`XPRT-04` versioned JSON).
- **No OpenAPI, contract, admission or app-manifest edits.** `FND-04`, `FND-03`, `RUNT-02`,
  `03-app-runtime` (**D16**).
- **No cross-boundary suites.** `tests/**` is `23-assurance`; co-located assertions here per plan R8.

## File-scope (write-owns)

- `apps/api/src/routes/record-answers/**`
- `apps/worker/src/handlers/rerun/**`
- `apps/api/test/records/record-answers/**` and `apps/worker/test/records/rerun/**` (sub-PRD **D15**)

Does not touch:

- `apps/api/src/routes/{research-records,research-turns,review-actions,comments,issues,corrections}/**`
  — `RCRD-01`, `RCRD-02`, `RCRD-04` … `RCRD-07`.
- `apps/api/src/routes/answer-snapshots/**`, `apps/api/src/routes/{answers,answer-jobs}/**`,
  `apps/worker/src/handlers/{answer,deep,coverage,comparison}/**` — `15-answer-product`.
- `apps/worker/src/{main.ts,runtime,queues}/**`, `apps/worker/src/handlers/maintenance/**` —
  `RUNT-04`; `apps/api/src/{server.ts,app.ts,bootstrap,plugins,middleware,errors,sse}/**` — `RUNT-01`
  … `RUNT-03`.
- `apps/api/package.json`, `apps/worker/package.json` and their `tsconfig.json` — `03-app-runtime`
  (**D16**).
- `packages/**`, `schemas/**` — `00-foundation`, `01-app-data`, `11`, `12`.
- `apps/web/**`, `infra/**`, `tests/**` — other modules.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, no in-flight
ticket), so nothing has previously written either subtree and nothing contends for them. Under plan
**A1** the route area and the handler area both register by **directory convention** — `RUNT-01`
contract item 6 and `RUNT-04` contract item 6 each guarantee *"zero diff outside that area's own
directory"* — so this ticket never edits a shared index in `apps/api` or `apps/worker`.
`apps/worker/src/handlers/` is split by plan §4 between `RUNT-04` (`maintenance`),
`15-answer-product` (`answer`, `deep`, `coverage`, `comparison`), `16-monitor-alerts`
(`change-matching`, `alerts`, `notifications`), this module (`rerun`, `correction`) and `19-exports`
(`export`); `rerun` is claimed by this ticket alone. Its wave-2 siblings (`RCRD-02`, `RCRD-04`,
`RCRD-05`) write three other disjoint `apps/api/src/routes/*` directories and no worker directory.
Per plan **A3** this ticket writes **no** table and **no** repository: the record↔answer relationship
already exists as `answer_snapshot.record_id` (PRD §35.5), which is exactly why record creation can sit
inside `ASK-01`'s admission transaction (PRD §34.3) without a `15 → 17` file dependency — the module
cycle A3 removes.

## Deliverables

1. **`apps/api/src/routes/record-answers/index.ts`** — default-exported `FastifyPluginAsync` plus
   `export const area = { prefix: '/v1/research-records', admission: 'tenant' } satisfies
   RouteAreaConfig` (sub-PRD **D2**). Registers only the sub-paths below; a collision with `RCRD-01`,
   `RCRD-02` or `RCRD-04` fails boot (`RUNT-01` contract item 4).
2. **`GET /v1/research-records/{recordId}/answers`** — the PRD §16.2 endpoint: the record's answer
   versions ordered by `answer_version ASC`, cursor-paginated per §34.1. Each entry carries
   `id`, `answer_version`, `status`, `legal_as_at`, `corpus_release_id`, `knowledge_cutoff_at`,
   `correction_state` and `created_at` — enough for `RCRD-08`'s version timeline and correction badge
   without a second request (sub-PRD **D12**, **QR-3**). Full snapshot bodies come from `ASK-04`'s
   `GET /v1/answers/{id}`.
3. **`POST /v1/research-records/{recordId}/answers`** — **link** an existing snapshot to this record.
   Body: `{ answer_snapshot_id }`. It assigns the next `answer_version` for the record and never
   copies, rewrites or re-renders the snapshot. Rejections: a snapshot already linked to a different
   record → `409 CONCURRENT_MODIFICATION` naming the existing record; a snapshot in another
   organisation or absent → identical `404 RESOURCE_NOT_FOUND` (PRD §16.5). Route flags:
   `idempotent: true`. This is the "or link a replacement Answer Snapshot" half of PRD §12.3 that
   `RCRD-07` consumes.
4. **`GET /v1/research-records/{recordId}/answers/{fromVersion}/diff/{toVersion}`** — the version diff
   (Deliverable 7). Both versions must belong to this record; either absent → `404`. Read-only, no
   generation credit (PRD §16.2's rule for search applies a fortiori: this reads two stored
   snapshots).
5. **`apps/worker/src/handlers/rerun/index.ts`** — a conforming `JobHandlerModule` (`RUNT-04` contract
   item 2) with:
   - `type` — the canonical rerun job type from `packages/contracts` (`FND-03`). If no such value
     exists, raise the `FND-03` writeback (**QR-8** pattern); do **not** declare a local string.
   - `queue` — **the same PRD §39.5 class as the source snapshot's own job**: `interactive_quick`
     when the source was a Quick answer, `interactive_research` when it was Deep, Coverage or
     Compare (sub-PRD **D7**). The class is resolved from the source snapshot at claim time and
     asserted to be one of the five frozen classes.
   - `stages` — declared with explicit `idempotent` flags so `RUNT-04`'s checkpoint machinery never
     re-executes a non-idempotent stage (PRD §39.5 *"only idempotent stages are retried"*).
6. **Rerun execution semantics.** The handler:
   1. Re-authorises actor, tenant, resource and budget **before each stage** through `JobContext`
      (PRD §18.5 step 3; `RUNT-04` deliverable 5 already provides the seam).
   2. Composes the **existing** answer pipeline (`15-answer-product`) with the source snapshot's
      question and facts, `legal_as_at` = the rerun request's date (default today) and
      `corpus_release_id` = the **current active** release. It re-implements no retrieval, synthesis
      or validation step (PRD §45.2; sub-PRD **D7**).
   3. Writes the result through `DATA-06.writeAnswerSnapshot(tx, ctx, { snapshot, claims, citations,
      assumptions })` in **one** transaction with `answer_version = max(existing) + 1` on the same
      record (PRD §35.8 invariant 1).
   4. Touches **nothing** on the prior snapshot — no field, no child row, no `correction_state`. The
      only relationship recorded is the new version's own `answer_version` ordering.
   5. Emits `job.completed` only after commit (PRD §18.5 step 7), through `RUNT-03`/`ASK-05`'s existing
      event path; it defines no new public event type (PRD §34.4's list is closed).
7. **The diff contract (sub-PRD QR-6), fixed here and committed as a fixture.** A pure function
   `diffAnswerVersions(from: AnswerSnapshot, to: AnswerSnapshot): AnswerVersionDiff` over the PRD
   §34.5 payload, deterministic and side-effect free:
   - **Header deltas** — `status`, `short_answer`, `legal_as_at`, `jurisdictions`,
     `corpus_release_id`, `knowledge_cutoff_at`, `correction_state`: each reported as
     `{ from, to, changed }`.
   - **Claims** — matched by `sequence`, then reported as `ADDED` / `REMOVED` / `CHANGED` /
     `UNCHANGED`, with `kind`, `support_status` and `text` deltas named individually. A change in
     `support_status` is reported **separately** from a change in `text`, because a claim that moved
     from `DIRECTLY_SUPPORTED` to `CONDITIONAL` is a legal-effect change even if the prose is
     identical (PRD §8.6's distinction between textual change and change in legal effect, applied to
     versions).
   - **Citations** — matched by the tuple `(document_version_id, node_version_id, start_offset,
     end_offset)`, reported as `ADDED` / `REMOVED` / `ROLE_CHANGED` / `UNCHANGED`. Matching by
     identity-plus-offsets, never by quote text, follows PRD §15.3 (*"Citations MUST target
     DocumentVersion + NodeVersion + exact offsets … never a SearchChunk"*).
   - **Assumptions, `next_checks`, `limitations`** — set differences by `sequence`/text.
   - **No provider content.** The diff contains only §34.5 fields; prompts, hidden reasoning and raw
     provider responses are never part of the customer contract (PRD §34.5) and are absent by
     construction.
   The function lives in this route area and is exercised directly by unit tests; a committed fixture
   `apps/api/test/records/record-answers/fixtures/diff-2024-vs-current.json` holds an input pair and
   its expected diff so the shape is reviewable without reading code.
8. **Immutability at the HTTP boundary (sub-PRD D5).** This area registers **no** `PUT`, `PATCH` or
   `DELETE` on any answer path, and calls only `DATA-06`'s immutable snapshot repository, which
   exposes no `update`/`delete` member and is trigger-protected. Unlinking an answer from a record is
   **not** supported: an answer version is part of the record's append-only history (PRD §32.6).
9. **One observable answer, no duplicate charge.** The rerun job carries an idempotency fingerprint
   through `DATA-05`'s job repository; at-least-once redelivery of the same rerun lease produces
   exactly one new snapshot (guaranteed by `DATA-06`'s `UNIQUE (job_id)` and
   `UNIQUE (organization_id, record_id, answer_version)`) and one settlement (PRD §18.5 closing rule).
   A losing racer surfaces the typed conflict and does not retry a paid stage.
10. **Permission and scope declarations.** Read requires record-read; link requires record-write; the
    rerun job re-authorises `answers:create`-equivalent permission at each stage. Evaluated by
    `RUNT-02`/`FND-06`; no role name hard-coded (PRD §38.1, §16.3).
11. **Audit.** Linking and rerun completion emit `RUNT-02`/`RUNT-04` audit records with actor,
    organisation, record id, snapshot ids, versions, release ids and `request_id` — **never** the
    question, short answer, claim text or quote (PRD §22; §35.6).
12. **Test fixtures** — `apps/api/test/records/record-answers/fixtures/`:
    `snapshot-2024.json` and `snapshot-current.json` (two §34.5-shaped snapshots with claims,
    citations and assumptions, different `legal_as_at` and `corpus_release_id`),
    `diff-2024-vs-current.json` (the expected diff), and `version-list.json`. All synthetic; the
    corpus ids are opaque strings, and nothing is read from `evals/gold/**` (PRD §45.1 item 6; plan
    R9).

## Acceptance checklist (classified)

- [ ] `[machine]` **`UAT-REC-01` / REC-002 core:** hash the stored snapshot row and every
      claim/citation/assumption row of version *n* (canonical serialisation, before the rerun); run
      the rerun handler to completion; assert the hash is **identical** afterwards and that version
      *n*'s `legal_as_at`, `corpus_release_id` and model/profile/prompt/validator versions are
      unchanged (PRD §30.2 REC-002 *"Original legal date/release/output are unchanged"*; §41.2
      `UAT-REC-01` *"byte-for-byte unchanged"*)
- [ ] `[machine]` The rerun creates `answer_version = n+1` on the **same** record, pinned to the
      **current active** `corpus_release_id` and with `legal_as_at` = the rerun date — never the
      original's (PRD §8.7 *"under current law"*; §18.4)
- [ ] `[machine]` `GET …/answers/{n}/diff/{n+1}` returns a diff whose header section reports the
      `legal_as_at` and `corpus_release_id` change, matching `diff-2024-vs-current.json`
      (**QR-6**; PRD §8.7 *"support comparison with the prior answer"*)
- [ ] `[fixture]` The diff function replays `snapshot-2024.json` × `snapshot-current.json` and
      reproduces `diff-2024-vs-current.json` exactly, including a claim whose `text` is unchanged but
      whose `support_status` moved — reported as a support change, not "unchanged" (PRD §34.5; §8.6's
      textual-vs-legal-effect distinction)
- [ ] `[machine]` Citations are matched by `(document_version_id, node_version_id, start_offset,
      end_offset)` and never by quote text — asserted with two citations having identical quotes at
      different offsets (PRD §15.3)
- [ ] `[machine]` The diff contains **no** provider prompt, hidden reasoning or raw provider payload —
      asserted by a canary planted in the internal execution record and required absent from the diff
      bytes (PRD §34.5; §22)
- [ ] `[machine]` **REC-001 / immutability:** `PUT`, `PATCH` and `DELETE` are unroutable on every
      answer path this area registers; the snapshot repository exposes no `update`/`delete`
      (`@ts-expect-error` compile assertion); a raw `UPDATE`/`DELETE` on `answer_snapshot` aborts via
      `DATA-06`'s trigger (PRD §35.8 invariant 5)
- [ ] `[machine]` **One observable answer, no duplicate charge:** replaying the same rerun job lease
      twice produces exactly **one** new snapshot and one settlement; the second attempt surfaces the
      typed conflict from `UNIQUE (job_id)` / `UNIQUE (record, version)` and re-executes no paid stage
      (PRD §18.5; §39.5 *"only idempotent stages are retried"*)
- [ ] `[machine]` **Concurrency (`E24` exit evidence):** two rerun jobs for the same record committing
      simultaneously produce two **distinct consecutive** `answer_version` values with no gap, no
      duplicate and no lost write; repeated 25 times (PRD §35.5 *"unique record/version"*; §44.2 `E24`
      *"REC and concurrency tests"*)
- [ ] `[machine]` The rerun handler registers under the source snapshot's own PRD §39.5 queue class
      and boot fails if the class is outside the frozen five (sub-PRD **D7**; `RUNT-04` contract item 3)
- [ ] `[machine]` The handler re-authorises actor, tenant, resource and budget **before each stage**,
      not only at claim time — asserted by revoking permission between two stages and observing the
      job stop (PRD §18.5 step 3)
- [ ] `[machine]` The handler re-implements no synthesis: a source scan proves it contains no
      retrieval call, no model-gateway call and no validator invocation of its own, and composes the
      existing pipeline instead (PRD §45.2; sub-PRD **D7**)
- [ ] `[machine]` `POST …/answers` linking a snapshot already linked to another record returns
      `409 CONCURRENT_MODIFICATION` naming the existing record; a snapshot in another organisation
      returns the byte-identical `404 RESOURCE_NOT_FOUND` as an absent id (PRD §16.5)
- [ ] `[machine]` **Tenant isolation (PRD §21.2 / SEC-001):** list, link, diff and **queued rerun job**
      against another organisation's record or snapshot id all return the indistinguishable `404`, and
      the queued-job attack (a rerun job whose payload names another tenant's snapshot) is refused at
      re-authorisation without executing a stage (PRD §21.2 *"queued-job tenant attacks"*;
      `UAT-AUTH-03`)
- [ ] `[machine]` The diff and list endpoints consume **no** generation credit and are usable with the
      model gateway disabled (PRD §16.2; §26 *"Search remains available independently of
      hosted-generation budget"*)
- [ ] `[machine]` Audit records for link and rerun completion carry ids/versions/release ids only — a
      canary planted in the question and in a claim appears in no audit record and no log line
      (PRD §22, §35.6)
- [ ] `[machine]` No new public SSE event type is introduced; the emitted set is a subset of PRD
      §34.4's closed list (PRD §34.4)
- [ ] `[machine]` `CUSTOMER_REVIEWED` is not mentioned in any string this ticket ships; if a future
      string does, it matches `RCRD-01`'s `customer-reviewed-copy.json` and never implies
      product-owner or legal verification (PRD §8.7; sub-PRD **D6**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration` green
      (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean; every path served — including the
      diff path — is declared in `FND-04`'s OpenAPI (PRD §20.1; **QR-5**, **QR-6**)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**REC-001**, **REC-002**,
      `UAT-REC-01`, `UAT-AUTH-03`, `E24-RECORDS`), user-visible change and non-goals, schema/API/event
      compatibility (additive `/v1` paths; **QR-6** diff shape; no new event type), tenant/PII/security
      /retention impact, source/licence impact (none — citations are references, not reproduced
      excerpts, beyond what the snapshot already stores), **cost/latency impact (a rerun is a paid
      generation job and consumes the same credit as the original — state the ledger effect
      explicitly, PRD §24, §38.5)**, rollback path (revert; `RCRD-07` consumes this ticket), known
      gaps (**QR-6** diff shape, **QR-3** `RCRD-08` edge)
- [ ] No `[human]` criteria in this ticket — `UAT-REC-01` is run as a `[human]` founder script against
      the deployed UI by `RCRD-08`/`23-assurance` (`ASSR-06`); here it is a `[machine]` hash-equality
      test (PRD §41.2)
- [ ] No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected (PRD §45.3)

## Test plan

Reviewer steps. Everything offline: no network, no model provider, no live corpus. The composed answer
pipeline is exercised through `15-answer-product`'s existing deterministic stub provider (the one
`ASK-02`/`EVID-07` register for CI); no hosted model is called.

1. `pnpm typecheck && pnpm lint`; then `pnpm test --filter <apps/api>` and
   `pnpm test --filter <apps/worker>`; suites under `apps/api/test/records/record-answers/` and
   `apps/worker/test/records/rerun/`.
2. **Harness.** API: Fastify `inject()` per `apps/api/test/route-area-conformance.ts` (`RUNT-01`).
   Worker: `apps/worker/test/handler-area-conformance.ts` (`RUNT-04` deliverable 12) to register this
   handler area from a test root and enqueue a job. Database: `withTempDatabase` (`DATA-01`) with
   `DATA-04` tenancy, `DATA-05` job and `DATA-06` research factories; two organisations, one record
   each, one `snapshot-2024.json`-shaped version pre-written through `writeAnswerSnapshot`.
3. **`byte-identical.test.ts`** — the load-bearing test for `UAT-REC-01`. Serialise version *n* and
   all its child rows canonically, hash. Run the rerun to completion against the stub provider. Hash
   again; assert equality. Additionally assert row counts per child table are unchanged and that
   `updated_at`-style columns do not exist on the immutable tables.
4. **`new-version.test.ts`** — assert `answer_version = n+1`, `record_id` unchanged,
   `corpus_release_id` equals the seeded *current active* release (not the 2024 one), and `legal_as_at`
   equals the rerun date.
5. **`diff.test.ts`** — unit-test `diffAnswerVersions` against `fixtures/diff-2024-vs-current.json`;
   include the support-status-only change case and the same-quote-different-offset citation case.
   Then integration-test the HTTP path and assert the same body.
6. **`immutability.test.ts`** — method × path matrix asserting `PUT`/`PATCH`/`DELETE` unroutable; the
   `@ts-expect-error` repository assertion; the raw-statement trigger abort (copy the construction from
   `packages/database/test/research/**`, `DATA-06` test plan step 4).
7. **`at-least-once.test.ts`** — enqueue one rerun job, let it complete, then replay the same lease
   (the pattern `RUNT-04`'s `checkpoint-resume.test.ts` establishes). Assert one snapshot, one
   settlement, and that the non-idempotent stage did not re-execute.
8. **`concurrency.test.ts`** — two worker threads each running a rerun for the same record, released
   simultaneously with a barrier. Assert two consecutive versions, no gap, no duplicate; repeat 25
   times.
9. **`queue-class.test.ts`** — seed a Quick-sourced and a Deep-sourced snapshot; assert the handler
   resolves `interactive_quick` and `interactive_research` respectively, and that an out-of-set class
   fails boot.
10. **`reauthorise.test.ts`** — revoke the actor's permission between stage 1 and stage 2 and assert
    the job stops without committing (PRD §18.5 step 3).
11. **`tenant-isolation.test.ts`** — the five-way matrix (list, link, diff, rerun admission, **queued
    rerun job with a foreign snapshot id in the payload**); assert indistinguishable `404`s and, for
    the queued job, refusal at re-authorisation with no stage executed and organisation B's data
    unchanged.
12. **`no-synthesis.test.ts`** — source scan over `apps/worker/src/handlers/rerun/**` asserting no
    import of a retrieval client, model gateway or validator package; assert the pipeline entry point
    it calls is `15-answer-product`'s.
13. **`audit.test.ts`** — canaries in the question and in a claim; assert absence from audit records
    and logs.
14. **Contract check** — `pnpm generate && pnpm generated:check`; confirm the diff path is declared.
15. **Source review** — grep the diff for any write to a prior snapshot, any `correction_state`
    assignment (that is `RCRD-07`'s), any unscoped `packages/database` import, and any new SSE event
    type; all must be absent.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** and
`docs/prd/17-records-collab/README.md` (version +0.1 + changelog line) **before** changing code, then
`publish-tickets.mjs --sync`. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **The diff shape proves insufficient** — a screen or an export needs a field or a granularity this
  shape cannot express (**QR-6**). → Update Deliverable 7 **in this ticket**, the committed fixture,
  and `docs/prd/17-records-collab/README.md` **QR-6** first. If it is published as a public `/v1`
  contract, create `docs/adr/NNNN-answer-version-diff-contract.md` (slug reserved to this ticket under
  plan **A9**) and raise the `FND-04` OpenAPI change. Never let `RCRD-08` or `19-exports` define a
  second diff.
- **`ASK-04`'s rerun admission endpoint does not exist or has a different shape** (sub-PRD **D8**). →
  Do **not** add a competing `POST /v1/answers/{id}/rerun` here; plan §4 gives that path's file to
  `15-answer-product`. Amend both tickets in one docs PR, `--sync` both, and record the boundary in
  `docs/prd/17-records-collab/README.md` **QR-5**.
- **Composing the existing pipeline is impossible** (its entry point is private, or it is coupled to
  `routes/answers`' request shape). → That is a `15-answer-product` seam, not a licence to
  re-implement synthesis here (PRD §45.2). Raise it against `ASK-02`/`ASK-04` in a docs PR and record
  the seam in `docs/prd/15-answer-product/README.md` and this README. Duplicating retrieval,
  synthesis or validation in `apps/worker/src/handlers/rerun/**` is plan risk **R5** realised.
- **`DATA-06` cannot allocate `answer_version` safely under concurrency**, or `writeAnswerSnapshot`
  cannot be called from this handler. → Raise a new `01-app-data` ticket, record the required API in
  both READMEs, and add the `blocked_by` edge in `docs/prd/breakdown-plan.md` §5.18 + §6.2 (plan
  **R4**). Never add a table or a migration here.
- **A rerun must charge differently from an ordinary answer** (for instance a discounted rerun). →
  That is a **product change** touching PRD §24 pricing and §38.5 ledgers; record it in
  `docs/prd/17-records-collab/README.md` open questions with the **Founder** as owner and do not
  encode a second charging rule in this handler.
- **A rerun needs to mark the prior version as superseded on the prior row.** → It must not: PRD §35.8
  invariant 5 gives formal snapshots no update path, and `UAT-REC-01` requires byte-for-byte
  equality. Supersession is expressed by the **new** version's existence and, for corrections, by
  `RCRD-07`'s replacement link. Escalate rather than adding a column write.

**3. Escalation.** Anything that would require **mutating a stored Answer Snapshot** — writing
`correction_state` in place, stamping a `superseded_by` column, or relaxing a `DATA-06` trigger —
overturns PRD §8.7, PRD §35.8 invariant 5, requirement **REC-002** and the `UAT-REC-01` script. Stop,
escalate for re-review through the PRD §45.5 product-change path, and write back to
`docs/prd/17-records-collab/README.md` and `docs/prd/01-app-data/README.md` before any code changes.
Never soften immutability inside this ticket.
