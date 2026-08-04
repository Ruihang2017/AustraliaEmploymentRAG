---
id: ASK-05
title: Answer SSE stage events
module: 15-answer-product
lane: 15-answer-product
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [ASK-02]
blocks: [ASK-07, ASSR-05]
---

# ASK-05 — Answer SSE stage events

Implements PRD §32.3 (answer progress stage names) and §34.4 (SSE contract), carrying requirement
**ANS-003** (`E21`).
**No ADR — the decision is already made in PRD §32.3 and §34.4; this is build ticket 5 of 12 against
it.**
Parent sub-PRD: [15-answer-product README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`ASK-02` — Quick workflow in worker](ASK-02-quick-workflow-in-worker-retrieve-pack-gateway-validate-commit.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(PRD §32.3's six minimum stage names and §34.4's nine allowed event types) — not a new subsystem
decision.

## Background + basis

Progress reporting is where a safety-critical product most easily leaks. A stream that carries model
internals turns hidden reasoning into a customer-visible artifact; a stream that presents draft text
as an answer defeats the validator. Both are explicitly forbidden.

**PRD §32.3 — Answer progress and result** fixes the vocabulary:

> Progress events use **user-readable stage names, not model internals**. Minimum stages are
> `Validating request`, `Identifying legal context`, `Retrieving exact authorities`, `Checking
> conflicts and dates`, `Drafting supported claims`, and `Validating citations`. Deep MAY show bounded
> subquestion titles, but **not hidden reasoning**.

**PRD §34.4 — SSE contract** fixes the wire form and the closed event list:

> Clients connect with `Accept: text/event-stream` and may reconnect using `Last-Event-ID`. **Events
> are stored before emission.**
>
> ```text
> id: 12
> event: stage.changed
> data: {"schema_version":"1.0","job_id":"job_...","stage":"VALIDATING_CITATIONS","message":"Validating citations","occurred_at":"2026-08-03T03:00:09Z"}
>
> id: 13
> event: job.completed
> data: {"schema_version":"1.0","job_id":"job_...","answer_snapshot_id":"ans_...","occurred_at":"2026-08-03T03:00:12Z"}
> ```
>
> Allowed public event types: `job.started`, `stage.changed`, `clarification.required`,
> `answer.section`, `citation.added`, `job.completed`, `job.failed`, `job.cancelled`, `heartbeat`.
> **`answer.section` is provisional UI content until `job.completed`; clients MUST remove it on
> failure and MUST not represent it as a validated answer.**

**PRD §16.2:** SSE events *"MUST NOT contain hidden reasoning or raw provider payloads."*

**PRD §9.4:** *"Hidden chain-of-thought MUST NOT be requested, stored or displayed. Concise reasoning
summaries, assumptions and evidence mappings MAY be shown."*

**PRD §18.5 step 7:** *"`job.completed` is emitted only after commit."* and *"SSE events MUST be
persisted for reconnect/restart."*

**PRD §13.2:** *"Answer streaming | first safe progress/output event in approximately 3 seconds."*

**PRD §30.2 `ANS-003`:** *"Accepted work is asynchronous, idempotent, cancellable and resumable by
SSE"*. **PRD §41.2 `UAT-ANS-06`:** *"Disconnect/reconnect SSE after event 5 → Resume after event 5;
no duplicate section/completion."*

**Contracts this ticket builds against (all already published):**

- `RUNT-03`'s SSE package (`apps/api/src/sse/**`): `SSE_EVENT_TYPES` (the frozen nine-name tuple),
  `SseEnvelope` and its per-type payload unions, `serialiseEvent(id, type, payload)` which **rejects
  an unknown type and any payload key not declared for that type**, and
  `JobEventWriter.emit(jobId, type, payload): Promise<number>` which **persists first and returns the
  assigned sequence id**. `heartbeat` is the one type that is not persisted and consumes no sequence
  id.
- `RUNT-04`'s stage machinery: `run(ctx, stage)` is called once per stage and returning is the yield
  point, so a stage boundary is the natural emission point.
- `ASK-02`'s handler and its eight-stage list (`REAUTHORISE`, `RETRIEVE`, `BUILD_EVIDENCE_PACK`,
  `SYNTHESISE`, `VALIDATE`, `REPAIR`, `RENDER_AND_STATUS`, `COMMIT`), its
  `handlers/answer/events/index.ts` bootstrap, and the frozen import specifier `'./events'` in
  `handlers/answer/index.ts`.
- `ASK-01`'s `GET /v1/answer-jobs/{jobId}/events` route, which mounts `RUNT-03`'s
  `createSseHandler`. This ticket writes **no** route and no transport.

**Accepted caveats carried forward:**

- This ticket takes over `apps/worker/src/handlers/answer/events/**`, created by `ASK-02` as a minimal
  terminal emitter (sub-PRD **D16**). Because `blocked_by: [ASK-02]`, the two tickets can never run
  concurrently, so no parallel lane writes the same path. **The import specifier `'./events'` in
  `handlers/answer/index.ts` is frozen** — this ticket must not change `ASK-02`'s files.
- The public stage **enum values** belong to `packages/contracts` (`FND-03`). If they are not exported
  there, declare them here and write back (sub-PRD **Q-ASK-3**); never let a local enum become the de
  facto canonical one.
- Deep, Coverage and Compare emit their own stage sets (`ASK-10`, `ASK-08`, `ASK-11`). This ticket
  ships the shared emitter and vocabulary those tickets reuse; it does not ship their stage lists.

## Goal

Ship `apps/worker/src/handlers/answer/events/**` as the single, allowlisted path by which any answer
job emits a public SSE event: user-readable stage names from PRD §32.3, provisional `answer.section`
and `citation.added` content, and the terminal `job.completed`/`job.failed`/`job.cancelled` after
commit — all persisted before emission through `RUNT-03`'s writer. Completion is mechanically
checkable: a payload containing a prompt, reasoning, provider response or any undeclared key is
rejected at the emitter and reaches no byte of the wire; `job.completed` cannot be emitted before the
commit transaction is visible; and a disconnect/reconnect at event 5 yields every event exactly once.

## Non-goals

- **No SSE transport, framing, replay, heartbeat or subscriber registry.** `RUNT-03` owns
  `apps/api/src/sse/**`; this ticket calls `JobEventWriter` and never re-implements the wire format.
- **No HTTP route.** `GET /v1/answer-jobs/{jobId}/events` is `ASK-01`'s, in
  `apps/api/src/routes/answers/**`.
- **No pipeline logic.** `ASK-02` owns `handlers/answer/pipeline/**` and `commit.ts`; this ticket must
  not change them (they are already merged when this ticket runs).
- **No Deep subquestion titles, Coverage stage results or Compare dimension events.** `ASK-10`,
  `ASK-08` and `ASK-11` own their own stage sets and reuse this emitter.
- **No screen.** `apps/web/src/features/answers/**` is `ASK-07`, which is `blocked_by` this ticket.
- **No new event type.** PRD §34.4's nine types are closed; a tenth is a PRD §45.5 product/API change,
  not an implementation detail.
- **No tables or repositories.** `job_event` persistence is `DATA-05`'s, reached through `RUNT-03`'s
  writer — breakdown plan **A3**.
- **No observability package changes.** `packages/observability` is `RUNT-07`.

## File-scope (write-owns)

- `apps/worker/src/handlers/answer/events/**` — sole owner from this ticket's delivery (sub-PRD
  **D16**), including replacing the contents of `events/index.ts` that `ASK-02` created.
- `apps/worker/test/answer-events/**` — this ticket's own unit/integration tests (breakdown plan
  §1.1). A separate directory from `ASK-02`'s `apps/worker/test/answer/**` so the two test trees stay
  disjoint.
- `apps/worker/package.json` — **append-only** (breakdown plan §1.1).

Does not touch:

- `apps/worker/src/handlers/answer/**` **outside** `events/**` — `ASK-02`. In particular
  `handlers/answer/index.ts`'s `'./events'` import specifier is frozen; if it must change, that is an
  `ASK-02` docs PR and `--sync`, not an edit here.
- `apps/worker/src/{main.ts,runtime,queues}/**` and `handlers/maintenance/**` — `RUNT-04`.
- `apps/worker/src/handlers/{deep,coverage,comparison}/**` — `ASK-10`, `ASK-08`, `ASK-11`;
  `handlers/{change-matching,alerts,notifications,rerun,correction,export}/**` — `16`, `17`, `19`.
- `apps/api/**` — `03-app-runtime` and the product route areas, including `apps/api/src/sse/**`
  (`RUNT-03`) and `routes/answers/**` (`ASK-01`).
- `apps/web/**`, `packages/**`, `schemas/**`, `infra/**`, `tests/**` — `03`, `00`, `01`, `02`, `11`,
  `12`, `18`, `23`; root manifests and lockfiles — `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown plan §1: phase 1, nothing merged, no
in-flight ticket). The only path this ticket shares with any other is
`apps/worker/src/handlers/answer/events/**`, created by `ASK-02` and handed over here (sub-PRD
**D16**); `blocked_by: [ASK-02]` makes the two strictly ordered, so the breakdown plan §2 property —
"two concurrently-running tickets never write the same path" — holds exactly. Concurrent siblings at
this wave are `ASK-03` (`apps/api/src/routes/answer-jobs/**`), `ASK-04`
(`apps/api/src/routes/answer-snapshots/**`) and `ASK-08` (`handlers/coverage/**` +
`routes/coverage-assessments/**`) — all different directories. Test trees are separated by directory
(`test/answer-events/**` here, `test/answer/**` in `ASK-02`) so a concurrent test run never contends.
Per breakdown plan **A3**, **this ticket writes no table, no migration and no repository**; event
persistence is `DATA-05`'s through `RUNT-03`'s writer.

## Deliverables

1. **`events/stage-vocabulary.ts`** — the public stage vocabulary as a frozen ordered tuple mapping
   each internal `ASK-02` stage to the PRD §32.3 user-readable name and message:

   | Internal stage (`ASK-02`) | Public `stage` value | `message` (PRD §32.3) |
   |---|---|---|
   | `REAUTHORISE` | `VALIDATING_REQUEST` | `Validating request` |
   | *(admission/legal-context resolution)* | `IDENTIFYING_LEGAL_CONTEXT` | `Identifying legal context` |
   | `RETRIEVE` | `RETRIEVING_EXACT_AUTHORITIES` | `Retrieving exact authorities` |
   | `BUILD_EVIDENCE_PACK` | `CHECKING_CONFLICTS_AND_DATES` | `Checking conflicts and dates` |
   | `SYNTHESISE` | `DRAFTING_SUPPORTED_CLAIMS` | `Drafting supported claims` |
   | `VALIDATE` / `REPAIR` | `VALIDATING_CITATIONS` | `Validating citations` |

   All six PRD §32.3 minimum stages are present. Enum values come from `packages/contracts` (`FND-03`)
   when exported (sub-PRD **Q-ASK-3**). `COMMIT` emits no `stage.changed`; it produces the terminal
   event. A mapping table entry is required for every `ASK-02` stage — a stage with no mapping fails a
   test, so adding a pipeline stage cannot silently produce an unnamed progress event.
2. **`events/emitter.ts`** — `export function createAnswerEventEmitter(writer: JobEventWriter, jobId:
   string): AnswerEventEmitter` with exactly these methods and no others:
   `started()`, `stageChanged(internalStage)`, `clarificationRequired(questions)`,
   `answerSection(section)`, `citationAdded(citation)`, `completed(answerSnapshotId)`,
   `failed(code)`, `cancelled()`. Every method routes through `writer.emit`, which persists before
   emission (PRD §34.4). There is **no** generic `emit(type, payload)` escape hatch — the closed
   method set is what makes the payload allowlist enforceable.
3. **`events/payloads.ts`** — one builder per event type producing exactly the keys `RUNT-03`'s
   `serialiseEvent` declares for that type, and no others:
   - `stage.changed` → `{ schema_version, job_id, stage, message, occurred_at }` (PRD §34.4's literal
     example);
   - `job.completed` → `{ schema_version, job_id, answer_snapshot_id, occurred_at }` (PRD §34.4's
     literal example);
   - `job.failed` → `{ schema_version, job_id, code, occurred_at }` where `code` is a PRD §34.9 code
     or a domain terminal status — **never** a provider message, stack trace or model text;
   - `job.cancelled` → `{ schema_version, job_id, occurred_at }`;
   - `clarification.required` → `{ schema_version, job_id, round, clarifications[], occurred_at }`
     with `clarifications[]` in PRD §34.3's shape (`id`, `question`, `affects`, `answer_type`);
   - `answer.section` → `{ schema_version, job_id, section, sequence, text, provisional: true,
     occurred_at }`;
   - `citation.added` → `{ schema_version, job_id, claim_id, citation_id, occurred_at }` — **ids
     only**; the citation's text, quote and URL are read from `GET /v1/answers/{id}` after completion
     (`ASK-04`), not streamed.
4. **The content allowlist, enforced twice.** `payloads.ts` builds from a literal key list, and
   `emitter.ts` runs a final assertion that the object's own keys are exactly that list before calling
   `writer.emit`. A payload carrying `reasoning`, `prompt`, `provider_response`, `raw`, `tokens`,
   `cost` or any undeclared key **throws at the emitter**, so no malformed event ever reaches
   `RUNT-03`'s serialiser, let alone the wire (PRD §16.2, §9.4, §34.4).
5. **`answer.section` provisional discipline.** `answerSection()` always sets `provisional: true` and
   is permitted **only** between `job.started` and a terminal event. It carries no citation, no legal
   status and no authority claim — it is rendered as draft prose and removed on failure (PRD §34.4).
   Calling it after a terminal event throws.
6. **Terminal ordering.** `completed(answerSnapshotId)` asserts, before emitting, that the commit
   transaction has committed — it accepts the snapshot id only from `ASK-02`'s `commit.ts` return
   value and refuses a null/undefined id (PRD §18.5 step 7). `failed()` and `cancelled()` are mutually
   exclusive with `completed()`: at most one terminal event per job, enforced by an emitter-local
   latch **and** by the store's per-job sequence, so an at-least-once retry after a terminal event is
   a no-op rather than a duplicate.
7. **First-event latency.** `started()` is emitted at the very first stage boundary, before any
   retrieval or provider work, so the PRD §13.2 objective — *"first safe progress/output event in
   approximately 3 seconds"* — depends only on lease pickup. A test asserts `job.started` precedes
   every other event for the job.
8. **Reusable by the other three workflows.** `createAnswerEventEmitter` and the payload builders take
   the stage vocabulary as a parameter, so `ASK-08` (coverage stages), `ASK-10` (Deep subquestion
   titles) and `ASK-11` (per-dimension progress) supply their own vocabulary table and reuse the same
   allowlist and terminal discipline. Deep may emit bounded subquestion **titles** as
   `stage.changed.message`; it may not emit reasoning (PRD §32.3).
9. **`events/index.ts`** — the module's explicit export barrel, replacing `ASK-02`'s bootstrap while
   keeping the `'./events'` specifier and the `emitTerminal` signature `ASK-02` calls, so no file
   outside `events/**` changes. A test asserts the public surface matches a committed list.
10. **Committed fixture** — `apps/worker/test/answer-events/fixtures/answer-job-events.jsonl`: a
    recorded 13-event log for one Quick job (mirroring PRD §34.4's ids 12 and 13) used by the resume
    test and reusable by `ASK-07`. Synthetic only — no customer content, no blind gold
    (PRD §45.1 item 6; breakdown plan **R9**).

## Acceptance checklist (classified)

- [ ] `[machine]` Only the nine PRD §34.4 event types are producible; the emitter exposes no generic
      `emit` and a tenth type is unrepresentable at the type level (PRD §34.4)
- [ ] `[machine]` All six PRD §32.3 minimum stage names are emitted for a normal Quick run, in the
      documented order, with the exact user-readable `message` strings (PRD §32.3)
- [ ] `[machine]` Every `ASK-02` pipeline stage has a vocabulary entry — a stage with no mapping fails
      the test, so a new pipeline stage cannot produce an unnamed progress event (PRD §32.3)
- [ ] `[machine]` A payload containing `reasoning`, `prompt`, `provider_response`, `raw`, `tokens`,
      `cost` or any undeclared key **throws at the emitter** and no byte reaches the wire — asserted
      with a canary that must be absent from all written bytes (PRD §16.2, §9.4, §34.4)
- [ ] `[machine]` `job.failed` carries only a PRD §34.9 code or a domain terminal status, never a
      provider message or stack trace — asserted by failing the stub provider with a canary message
      that must not appear in the event (PRD §16.2, §22)
- [ ] `[machine]` `citation.added` carries ids only; no quote, URL or source text is streamed
      (PRD §34.4, §11.1)
- [ ] `[machine]` `answer.section` always sets `provisional: true`, carries no citation or legal
      status, and cannot be emitted after a terminal event (PRD §34.4)
- [ ] `[machine]` **PRD §18.5 step 7**: `job.completed` cannot be emitted before the commit transaction
      is visible — asserted with a writer instrumented to fail if the `answer_snapshot` row is not yet
      readable when the event is written
- [ ] `[machine]` At most one terminal event per job; an at-least-once retry after a terminal event
      emits nothing new (PRD §18.5 "one observable answer")
- [ ] `[machine]` `job.started` precedes every other event for the job and is emitted at the first
      stage boundary, before retrieval or any provider call (PRD §13.2)
- [ ] `[machine]` Every emitted event is persisted **before** any byte is written to a client —
      asserted through `RUNT-03`'s writer contract, not re-implemented here (PRD §34.4, §18.5)
- [ ] `[fixture]` **`UAT-ANS-06` in automated form**: replaying
      `apps/worker/test/answer-events/fixtures/answer-job-events.jsonl` through `RUNT-03`'s resume path
      with a simulated disconnect after event 5 yields every event exactly once, in order, with no
      duplicate section and no duplicate completion (PRD §41.2, §34.4; `ANS-003`)
- [ ] `[machine]` The stage vocabulary values come from `packages/contracts` where exported; no
      controlled value is declared locally without a recorded writeback (PRD §35.1; sub-PRD
      **Q-ASK-3**)
- [ ] `[machine]` The public export surface of `events/index.ts` matches the committed list, and
      `ASK-02`'s `emitTerminal` signature is unchanged — asserted so `handlers/answer/index.ts` needs
      no edit (sub-PRD **D16**)
- [ ] `[machine]` **A3 guard**: no import of `packages/database/migrations`, a schema module or an
      unscoped connection (breakdown plan **A3**; PRD §45.2)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `ANS-003` and `UAT-ANS-06`
- [ ] `[human]` `UAT-ANS-06` rehearsed in a browser once `ASK-07` has merged: disconnect and reconnect
      after event 5 and observe resume with no duplicate section or completion (PRD §41.2) — **not
      required to merge this ticket**; the `[fixture]` row is the merge gate
- [ ] No further `[human]` criteria — this ticket ships no screen
- [ ] No `cargo test --workspace` / `uv run pytest` item — no Rust or Python is touched (PRD §45.3)

## Test plan

Reviewer steps, all reproducible offline with no network and no provider key.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/worker`. Suites live under `apps/worker/test/answer-events/`.
3. **Harness.** Copy the construction pattern from `RUNT-03`'s `apps/api/test/sse/writer.test.ts`: a
   temp-file `app.sqlite` migrated with `DATA-01`'s runner, the `DATA-05` job-event repository behind
   `RUNT-03`'s `JobEventWriter`, and a fake transport sink that records every byte batch. Use
   `ASK-02`'s pipeline doubles (`apps/worker/test/answer/**` factories) to drive real stage
   boundaries.
4. **`vocabulary.test.ts`** — assert the literal mapping table, that all six PRD §32.3 names appear
   with their exact `message` strings, and that every `ASK-02` stage has an entry (enumerate `ASK-02`'s
   exported stage list and diff against the vocabulary keys).
5. **`allowlist.test.ts`** — for each event type, build a payload with one extra key
   (`reasoning`, `prompt`, `provider_response`, `raw`, `tokens`, `cost`, `x`), each carrying
   `leak-canary-<uuid>`; assert the emitter throws, that `writer.emit` was never called, and that the
   canary appears in no recorded byte batch.
6. **`terminal.test.ts`** — (a) call `completed()` with a snapshot id that is not yet visible in the
   store and assert the instrumented writer fails the test; (b) run the happy path and assert
   `job.completed` follows the commit; (c) call `completed()` then `failed()` and assert the second is
   a no-op; (d) simulate an at-least-once retry after a terminal event and assert no new event.
7. **`section.test.ts`** — assert `provisional: true` on every `answer.section`, assert it carries no
   citation/legal-status key, and assert a post-terminal call throws.
8. **`ordering.test.ts`** — assert `job.started` is sequence-first and precedes any retrieval or
   gateway call in the instrumented double.
9. **`replay.test.ts`** — load `fixtures/answer-job-events.jsonl`, open a stream through `RUNT-03`'s
   handler, read 5 events, abort, reopen with `Last-Event-ID: 5`, drain; assert the concatenated id
   sequence over both connections is `1…13` with each id exactly once and exactly one `job.completed`.
10. **`failure.test.ts`** — fail the stub provider with `provider-message-canary-<uuid>`; assert
    `job.failed` carries only a code and that the canary is absent from every event byte.
11. **`surface.test.ts`** — assert `events/index.ts`'s exports match the committed list and that
    `emitTerminal`'s signature is unchanged; `git diff --name-only` for the ticket must show no file
    outside `apps/worker/src/handlers/answer/events/**`, `apps/worker/test/answer-events/**` and the
    append-only manifest.
12. Reviewer greps the diff for: any generic `emit(type, payload)` export, any event payload built
    outside `payloads.ts`, any change to a file under `handlers/answer/` other than `events/**`, and
    any string from a provider response reaching an event.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), then `docs/prd/15-answer-product/README.md`, then
`.claude/scripts/publish-tickets.mjs --sync`, and only then change code (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **A needed progress signal has no PRD §34.4 event type** (for example "retrieval degraded") → the
  nine types are closed. Use `stage.changed`'s `message`, or raise it as a **product/API change**
  under PRD §45.5: an open question in `docs/prd/15-answer-product/README.md` with the Founder as
  owner, plus a `FND-05`/`FND-04` ticket for the schema root. Never add a tenth type locally.
- **`ASK-02`'s stage list changes and a vocabulary entry is missing** → the test fails by design. Fix
  it here **and** state the new stage's user-readable name in a docs PR against `ASK-02`'s stage
  table, then `--sync` both. A progress event with no PRD §32.3 name is not shippable.
- **`handlers/answer/index.ts` must change to wire a new emitter method** → that file is `ASK-02`'s.
  Raise an `ASK-02` docs PR and `--sync`; do not edit outside `events/**` (sub-PRD **D16**).
- **`packages/contracts` does not export the stage enum** → sub-PRD **Q-ASK-3**. Declare it here,
  record the divergence in `docs/prd/15-answer-product/README.md`, and raise a `00-foundation` ticket
  (PRD §35.1; breakdown plan §4.1).
- **The UI wants richer `answer.section` content (citations inline) to feel responsive** → PRD §34.4
  makes sections *provisional* and forbids representing them as a validated answer; citations exist
  only after validation. Record the request in `docs/prd/15-answer-product/README.md` and align with
  `ASK-07`; do not stream citation text.
- **`RUNT-03`'s writer cannot guarantee persist-before-emit for a burst** → that is `RUNT-03`'s
  contract and `ANS-003`'s evidence. Raise a `RUNT-03` docs PR; do not add a local buffer that emits
  first.

**3. Escalation.** Two rules here are the product's central invariants, not presentation choices:
**hidden reasoning and raw provider payloads never reach the customer** (PRD §9.4, §16.2) and
**`job.completed` is emitted only after commit** (PRD §18.5 step 7). A change that would stream model
internals, or that would announce an answer that has not committed, lets an unvalidated claim reach a
user and overturns PRD §9.4. Stop, escalate for re-review, and record the outcome in
`docs/prd/15-answer-product/README.md` and `docs/prd/breakdown-plan.md`. Never widen the payload
allowlist as a convenience.
