---
id: RUNT-03
title: SSE transport with persisted replay
module: 03-app-runtime
lane: 03-app-runtime
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-01, DATA-05]
blocks: [ASK-01]
---

# RUNT-03 — SSE transport with persisted replay

Implements PRD §34.4 (SSE contract), §18.5 (answer runtime, persistence rule) and §16.2 (answer job
event endpoint), carrying the transport half of requirement `ANS-003` ("Accepted work is
asynchronous, idempotent, cancellable and resumable by SSE"). **No ADR — the decision is already made
in PRD §34.4 and §18.5; this is build ticket 3 of 9 against it.**
Parent sub-PRD: [03-app-runtime README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`RUNT-01`](RUNT-01-fastify-skeleton-autoloaded-routes-uniform-errors-request-id.md);
`DATA-05` (execution tables + `packages/jobs` lease primitives, which own the job-event rows) in
[`01-app-data`](../../01-app-data/README.md).
**Why `builder`:** a bounded change inside one module's declared file-scope implementing a wire format
PRD §34.4 already specifies down to the event names — transport plumbing, not a new subsystem decision.

## Background + basis

**The wire format is normative.** PRD §34.4, in full:

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
> `answer.section` is provisional UI content until `job.completed`; clients MUST remove it on failure
> and MUST not represent it as a validated answer.

**Persistence is a MUST, not an optimisation.** PRD §18.5: "**SSE events MUST be persisted for
reconnect/restart.**" and "`job.completed` is emitted only after commit." PRD §16.2 fixes the
endpoint that carries the stream: `GET /v1/answer-jobs/{job_id}/events`, and constrains the payload:

> SSE events MAY include started, retrieval completed, clarification required, safe answer sections,
> citation added, completed and failed. **They MUST NOT contain hidden reasoning or raw provider
> payloads.**

**The reconnect behaviour is an acceptance script.** PRD §41.2 `UAT-ANS-06`: "Disconnect/reconnect SSE
after event 5 → Resume after event 5; no duplicate section/completion." PRD §31.2 makes it a screen
requirement too: `/answer-jobs/:jobId` → "Reconnect from last event ID".

**Stage names are user-readable.** PRD §32.3: "Progress events use user-readable stage names, not
model internals. Minimum stages are `Validating request`, `Identifying legal context`, `Retrieving
exact authorities`, `Checking conflicts and dates`, `Drafting supported claims`, and `Validating
citations`." The **stage vocabulary** is `packages/contracts` (`FND-03`); this ticket transports it.

**Why this ticket does not own the endpoint.** `docs/prd/breakdown-plan.md` §4 allocates
`apps/api/src/routes/{answers,answer-jobs,answer-snapshots,coverage-assessments,comparisons}/**` to
`15-answer-product`. `RUNT-03 --> ASK-01` in breakdown-plan §6.2 is the only outgoing edge: `ASK-01`
mounts this transport on `/v1/answer-jobs/{job_id}/events`. Recorded as decision **D7** in
[`../README.md` §4](../README.md#4-decisions).

**Why `DATA-05` is the blocker.** breakdown-plan §5.2 gives `DATA-05` "Execution tables +
`packages/jobs` lease primitives … Durable jobs, job events and transactional outbox" (PRD §15.6,
§35.6, §18.1, §18.5, §39.5). The job-event rows this transport writes and replays are **its** tables;
this ticket only reads and appends through the scoped repository it exports.

**Accepted caveats carried forward, documented not enforced here:**

- **Answer semantics are not here.** What a stage means, when `clarification.required` fires and what
  an `answer.section` contains are `15-answer-product` (`ASK-01`…`ASK-05`). This ticket enforces the
  envelope, the ordering, the allowlist and the replay.
- **Memory budget.** PRD §39.2 gives the `app` process a 320 MiB initial limit. Open streams are
  therefore bounded (Deliverable 7); the number is config, and the measured value is a release-benchmark
  input for `RLSE-11`, not a decision here.
- **The access-control decision for a stream is `RUNT-02`'s admission chain**; PRD §31.2 restricts
  `/answer-jobs/:jobId` to the "initiating permitted user". This ticket must not re-derive it.

## Goal

Produce a reusable SSE transport in `apps/api/src/sse/**` that (a) writes every event to the
`DATA-05` job-event store **before** any byte reaches a client, (b) serves a `text/event-stream`
response whose `id:` values are the persisted monotonic per-job sequence, (c) resumes from
`Last-Event-ID` by replaying persisted events strictly greater than that id and then continuing live,
and (d) refuses to serialise any event type outside the nine PRD §34.4 names or any field outside the
declared envelope. Completion is mechanically checkable: a recorded event log fixture replayed through
the resume path yields every event exactly once across a disconnect at event 5, and a test that emits
an out-of-allowlist type or an extra payload key fails the emitter, not the client.

## Non-goals

- **No routes.** `/v1/answer-jobs/*` is `ASK-01` (`15-answer-product`, breakdown-plan §4). This ticket
  exports a plugin and a handler factory; it registers no route area.
- **No job-event schema or table.** `packages/database` execution tables are `DATA-05`
  (`01-app-data`); breakdown-plan **A3** and PRD §45.2 forbid this module to own them.
- **No answer/coverage/compare semantics, no stage sequencing decisions.** `15-answer-product`.
- **No worker-side emission loop.** `apps/worker/**` is `RUNT-04` (runtime) and `ASK-02` (answer
  handler). This ticket's writer API is called from there; the loop is not built here.
- **No admission, authentication or permission logic.** `RUNT-02`.
- **No webhook delivery.** Signed webhook envelopes are `FND-05` (schema) and `16-monitor-alerts`
  (`WTCH-05`) — a different transport with a different contract (PRD §34.8).
- **No client-side reconnect UI.** The `/answer-jobs/:jobId` screen is `ASK-06`/`15-answer-product`;
  the shared async-state components are `RUNT-06`.

## File-scope (write-owns)

- `apps/api/src/sse/**`
- `apps/api/test/sse/**` — this ticket's own unit/integration tests (breakdown-plan §1.1).
- `apps/api/test/fixtures/sse/**` — the committed recorded event-log fixture used by the replay test.

Does not touch:

- `apps/api/src/{server.ts,app.ts,bootstrap,errors}/**` — `RUNT-01`. If `app.ts` must register the SSE
  plugin globally, that is a `RUNT-01` change: raise it there and re-`--sync`. This ticket's default
  is a plugin that `ASK-01` registers inside its own route area, requiring no `app.ts` edit (A1).
- `apps/api/src/{plugins,middleware}/**` — `RUNT-02`.
- `apps/api/src/routes/**` — `RUNT-08` (`health`, `system-status`) and the product modules.
- `packages/database/**`, `packages/jobs/**` — `01-app-data` (`DATA-05`).
- `packages/contracts/**` — `00-foundation` (`FND-03`/`FND-05`), serial-owned.
- `apps/worker/**` — `RUNT-04` and the product handler subtrees.
- `apps/web/**`, `packages/ui/**`, `packages/observability/**`, `infra/compose/**` — `RUNT-05`,
  `RUNT-06`, `RUNT-07`, `RUNT-09`.
- `tests/**` — `23-assurance`.

**Serial-safety analysis.** First decomposition (breakdown-plan §1: phase 1, nothing merged, no
in-flight ticket), so no prior work has touched `apps/api/src/sse/**` and nothing contends for it.
breakdown-plan §4 gives the whole `apps/api/src/{…,sse}` set to `03-app-runtime`, and §5.4 splits it:
`RUNT-01` owns `bootstrap`/`errors`, `RUNT-02` owns `plugins`/`middleware`, this ticket owns `sse`,
`RUNT-08` owns `routes/{health,system-status}`. Those four scopes are disjoint sibling directories.
`RUNT-04`–`RUNT-07` and `RUNT-09` are different trees. This ticket runs in wave 2 alongside
`RUNT-02`, `RUNT-08` and `RUNT-09` as concurrent lanes (breakdown-plan §7).

## Deliverables

1. **`apps/api/src/sse/event-types.ts`** — `export const SSE_EVENT_TYPES` as a frozen tuple of exactly
   the nine PRD §34.4 names, in that order, and `export type SseEventType = typeof
   SSE_EVENT_TYPES[number]`. If `packages/contracts` (`FND-05`) already exports this vocabulary, import
   it and re-export; do not maintain a second list (PRD §20.1 forbids duplicating contract roots).
2. **`apps/api/src/sse/envelope.ts`** — `export interface SseEnvelope { schema_version: string; job_id:
   string; occurred_at: string; }` plus the per-type payload unions, matching the PRD §34.4 example
   fields verbatim (`stage`, `message` for `stage.changed`; `answer_snapshot_id` for `job.completed`).
   `export function serialiseEvent(id: number, type: SseEventType, payload: unknown): string` produces
   exactly `id: <n>\nevent: <type>\ndata: <json>\n\n`. It **rejects** an unknown type and any payload
   key not declared for that type — the emitter throws; a malformed event is never written to the wire
   (PRD §16.2 "MUST NOT contain hidden reasoning or raw provider payloads").
3. **`apps/api/src/sse/writer.ts`** — `export interface JobEventWriter { emit(jobId: string, type:
   SseEventType, payload: unknown): Promise<number> }` and its implementation over the `DATA-05`
   job-event repository. `emit` **persists first and returns the assigned sequence id**, then
   publishes to live subscribers. Sequence ids are monotonic and gapless **per job**, assigned by the
   store, never by the caller (PRD §34.4 "Events are stored before emission").
4. **`apps/api/src/sse/stream.ts`** — `export function createSseHandler(opts: SseHandlerOptions):
   RouteHandlerMethod`, the factory `ASK-01` mounts. `SseHandlerOptions` carries
   `{ resolveJobId(request): string, authorise(request, jobId): Promise<void> }` — the authorisation
   callback is supplied by the mounting route area, so this ticket makes **no** access decision. The
   handler:
   - sets `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`,
     `Connection: keep-alive`, `X-Accel-Buffering: no`;
   - rejects a request without `Accept: text/event-stream` with `400 INVALID_REQUEST` (PRD §34.4);
   - reads `Last-Event-ID` (header, falling back to a `last_event_id` query parameter for clients that
     cannot set headers), validates it as a non-negative integer, and replays every persisted event
     with `id > lastEventId` in ascending order **before** attaching the live subscription;
   - closes cleanly after `job.completed`, `job.failed` or `job.cancelled` is delivered.
5. **`apps/api/src/sse/replay.ts`** — the gapless cursor logic that hands the live subscription over
   without a window in which a concurrently emitted event is missed or duplicated: subscribe first,
   buffer, then drain the persisted range, then flush the buffer discarding ids already sent. This
   ordering is the load-bearing mechanic and is asserted directly (acceptance item 4).
6. **`apps/api/src/sse/heartbeat.ts`** — emits `heartbeat` on a configurable interval (default 15 s,
   from config per PRD §39.6, not hard-coded). Heartbeats are the one event type that is **not**
   persisted — they carry no state and must not consume sequence ids; this exception is stated in code
   and asserted (PRD §34.4 lists `heartbeat` among allowed types; PRD §18.5 requires persistence for
   *reconnect/restart*, which a heartbeat cannot serve).
7. **`apps/api/src/sse/registry.ts`** — a bounded live-subscriber registry: a per-process maximum open
   stream count and a per-job maximum subscriber count, both from config. Exceeding either returns
   `503 GENERATION_UNAVAILABLE` rather than accepting an unbounded stream (PRD §39.2: the `app` process
   has a 320 MiB initial memory limit). Streams are removed on client disconnect, request abort and
   process `SIGTERM` drain (`RUNT-01`'s graceful shutdown).
8. **Content boundary.** `serialiseEvent` runs a final allowlist pass: the serialised `data` object may
   contain only the declared envelope keys for its type. A test asserts that a payload carrying a
   `reasoning`, `prompt`, `provider_response` or arbitrary extra key is rejected at the emitter
   (PRD §16.2; PRD §37.5 "The model gateway exposes no shell, Web, database, email, webhook or
   arbitrary tool").
9. **Recorded fixture** — `apps/api/test/fixtures/sse/job-events.jsonl`: a committed 13-event recorded
   log for one job (mirroring the PRD §34.4 example ids 12 and 13) used by the replay test.

## Acceptance checklist (classified)

- [ ] `[machine]` Every emitted event is present in the `DATA-05` job-event store **before** any byte
      is written to a connected client — asserted with a writer whose transport is instrumented to fail
      if the store lookup for that id misses (PRD §34.4, §18.5 "SSE events MUST be persisted")
- [ ] `[machine]` The wire bytes are exactly `id: <n>\nevent: <type>\ndata: <json>\n\n`, and the two
      PRD §34.4 example events round-trip byte-identically apart from timestamps (PRD §34.4)
- [ ] `[machine]` Only the nine PRD §34.4 event types serialise; a tenth type throws at the emitter
      and never reaches the wire (PRD §34.4)
- [ ] `[machine]` A payload containing `reasoning`, `prompt`, `provider_response` or any undeclared key
      is rejected at the emitter — asserted with a canary string that must be absent from all written
      bytes (PRD §16.2 "MUST NOT contain hidden reasoning or raw provider payloads")
- [ ] `[machine]` Sequence ids are monotonic and gapless per job, assigned by the store; two concurrent
      `emit` calls for the same job produce distinct consecutive ids (PRD §34.4)
- [ ] `[machine]` A request without `Accept: text/event-stream` is rejected `400 INVALID_REQUEST`
      (PRD §34.4)
- [ ] `[machine]` Reconnect with `Last-Event-ID: 5` delivers events 6…n exactly once, with no
      duplicate and no gap, including an event emitted **during** the handover window (asserted by
      emitting from a second task while the replay drains) (PRD §34.4; `ANS-003`; enables `UAT-ANS-06`)
- [ ] `[machine]` An invalid `Last-Event-ID` (non-numeric, negative, larger than the highest stored id)
      is rejected `400 INVALID_REQUEST` rather than silently starting from zero
- [ ] `[machine]` `heartbeat` consumes no sequence id and is not persisted; the id sequence across a
      stream containing heartbeats is unbroken (PRD §34.4, §18.5)
- [ ] `[machine]` The stream closes after `job.completed`, `job.failed` or `job.cancelled`, and the
      subscriber is removed from the registry (PRD §34.4)
- [ ] `[machine]` Exceeding the configured per-process or per-job stream cap returns
      `503 GENERATION_UNAVAILABLE`; subscriber count returns to zero after client disconnect, request
      abort and `SIGTERM` drain (PRD §39.2, §34.9)
- [ ] `[fixture]` `apps/api/test/fixtures/sse/job-events.jsonl` — the committed recorded event log
      replays through the resume path with a simulated disconnect after event 5 and yields every event
      exactly once, in order (PRD §41.2 `UAT-ANS-06` in automated form)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `ANS-003` and `UAT-ANS-06`
- [ ] `[human]` `UAT-ANS-06` rehearsed end to end in a browser once `ASK-01` and `ASK-06` have merged:
      disconnect and reconnect after event 5, observe resume with no duplicate section or completion
      (PRD §41.2) — **not required to merge this ticket**; the `[fixture]` row is the merge gate
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)

## Test plan

Reviewer steps, offline, no network and no provider:

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/api`. Suites live under `apps/api/test/sse/`.
3. **`envelope.test.ts`** — serialise the two literal PRD §34.4 example events and compare the exact
   byte strings. Then attempt an unknown type, an undeclared key, and a payload with a
   `secret-canary-<uuid>` under key `reasoning`; assert each throws and that the canary appears in no
   written byte.
4. **`writer.test.ts`** — harness: a temp-file `app.sqlite` migrated with `DATA-01`'s runner and the
   `DATA-05` job-event repository; the transport is a fake sink that asserts, for every byte batch, that
   the corresponding id already exists in the store. Emit 20 events; assert ids are 1…20 with no gap.
   Run 10 concurrent `emit` calls for one job; assert 10 distinct consecutive ids.
5. **`replay.test.ts`** — load `apps/api/test/fixtures/sse/job-events.jsonl` into the store, open a
   stream, read 5 events, abort the connection, reopen with `Last-Event-ID: 5`, drain to completion.
   Assert the concatenated id sequence over both connections is `1…13` with each id appearing exactly
   once. Repeat with an event emitted from a second task while the replay drains, and assert the same
   property (this is the handover-window assertion).
6. **`heartbeat.test.ts`** — fake clock; assert heartbeats are emitted at the configured interval,
   carry no `id:` line contribution to the sequence, and are absent from the store.
7. **`registry.test.ts`** — set the per-process cap to 2; open 3 streams and assert the third is
   `503 GENERATION_UNAVAILABLE`. Then disconnect, abort and `SIGTERM`-drain, asserting the subscriber
   count returns to zero in each case.
8. **`accept-header.test.ts`** — request without `Accept: text/event-stream` → `400 INVALID_REQUEST`;
   `Last-Event-ID` values `abc`, `-1` and `9999` → `400 INVALID_REQUEST`.
9. All suites use Fastify `inject()` where a full stream is not needed and a real loopback listener for
   the disconnect tests. No external service is contacted.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **Persist-before-emit cannot be made gapless** under the `DATA-05` store's transaction semantics
  (for example the sequence id is only visible after commit and a live subscriber can observe an
  ordering inversion) → the replay handover in Deliverable 5 is the mechanism that must absorb it.
  If it cannot, write `docs/adr/NNNN-sse-event-ordering.md` **first** (PRD §45.5 "Architecture
  decision"), add the question to `docs/prd/03-app-runtime/README.md` §6, and raise a `01-app-data`
  ticket for the store change. Do not relax "Events are stored before emission" — PRD §34.4 and §18.5
  both state it as a MUST.
- **`heartbeat` must be persisted** after all (a client cannot distinguish a stalled stream otherwise)
  → that changes the id sequence contract every downstream client reads. Amend Deliverable 6 and the
  acceptance item in this ticket, `--sync`, and notify `ASK-01`/`ASK-06` before code changes.
- **The nine PRD §34.4 event types are insufficient** for a real answer flow → PRD §34.4's list is a
  closed **product/API contract** (PRD §45.5 "Product change … requires founder approval and PRD
  update"). Do not add a type. Raise it in `docs/prd/03-app-runtime/README.md` §6 with the Founder as
  owner; `15-answer-product` must express the need inside the existing nine.
- **`ASK-01` needs the transport registered globally in `app.ts`** rather than inside its own route
  area → that would make `apps/api/src/app.ts` a file two modules edit, weakening breakdown-plan
  **A1**. Raise it against `RUNT-01` (a docs change to its Deliverable 8 ordering comment) and
  `docs/prd/03-app-runtime/README.md` §4 D7, then `--sync`; do not edit `app.ts` from this ticket.
- **The stream cap turns out to be the binding memory constraint** for the PRD §39.2 320 MiB `app`
  budget → that is a **benchmark-selected configuration** (PRD §45.5), owned by `RLSE-11`
  (`18-ops-release`). Record the measured number in the PR's cost/memory/latency line (PRD §45.4) and
  add it to `docs/prd/03-app-runtime/README.md` §6; keep the value in config.

**3. Escalation.** "Events are stored before emission" (PRD §34.4) and "SSE events MUST be persisted
for reconnect/restart" (PRD §18.5) are release requirements behind `ANS-003` and `UAT-ANS-06`. If the
decided protocol is outright falsified, that overturns a team decision `ASK-01` depends on: escalate
for re-review before any code lands. Never swap the persistence approach silently inside this ticket.
