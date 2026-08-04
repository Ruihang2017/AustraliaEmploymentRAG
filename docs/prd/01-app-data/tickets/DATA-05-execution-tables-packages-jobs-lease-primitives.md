---
id: DATA-05
title: Execution tables + packages/jobs lease primitives
module: 01-app-data
lane: 01-app-data
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [DATA-04]
blocks: [DATA-06, DATA-07, RUNT-03, RUNT-04]
---

# DATA-05 — Execution tables + `packages/jobs` lease primitives

Implements PRD §15.6, §35.6, §18.1, §18.5 and §39.5 — persistence half of **ANS-003**
(`E04-APPDB`). No ADR — the decision is already made in PRD §18.1 ("database-backed durable job
queue and transactional outbox") and §35.6; this is build ticket 5 of 9 against it.
Parent sub-PRD: [01-app-data README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [DATA-04 — Tenancy and identity tables/repositories](DATA-04-tenancy-and-identity-tables-repositories.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed
contract (PRD §35.6's table list plus §18.5's transaction boundary) — not a new subsystem decision.

## Background + basis

**PRD §18.1** fixes the architecture this ticket implements:

> Use a **database-backed durable job queue and transactional outbox**. Do not introduce Kubernetes,
> service mesh, Kafka, RabbitMQ, a Redis cluster, multiple service databases or module-per-service
> deployment in the MVP.

**PRD §18.5 — Answer runtime** is the transaction boundary every asynchronous surface follows:

> 1. App performs auth, TenantContext, permission/rate, PII, schema, legal scope, budget and
>    idempotency checks.
> 2. **One transaction** reserves credits, creates the job plus either a sanitized saved turn or an
>    opaque ephemeral-content reference, pins a CorpusRelease and writes an outbox event.
> 3. Worker leases the job with **at-least-once delivery** and reauthorises actor, tenant, resource
>    and budget.
> …
> 6. **One transaction** commits Answer Snapshot, claims/citations/assumptions, retrieval/model
>    metadata, actual cost, job status, audit and outbox.
> 7. `job.completed` is emitted only after commit.
>
> At-least-once execution plus idempotency and immutable unique results MUST provide one observable
> answer and no duplicate charge. **SSE events MUST be persisted for reconnect/restart.**

**PRD §35.6** is the normative dictionary. Per sub-PRD decision **D3**, this ticket owns the
**execution** half of it; `DATA-07` owns the operations half. The rows owned here, quoted verbatim:

> | `job` | `id`, `organization_id`, `actor_id`, `job_type`, `status`, `retention_mode`, `resource_id`, `corpus_release_id`, `idempotency_fingerprint`, `lease_owner`, `lease_expires_at`, attempts/timestamps/failure code | unique tenant/actor/route/idempotency key; queue indexes |
> | `job_event` | `id` monotonic per job, `job_id`, `public_event_type`, safe payload, `created_at` | append-only; SSE replay |
> | `outbox_event` | `id`, tenant/aggregate/event data, `status`, attempt/next-at timestamps | written in same transaction as business change |
> | `retrieval_run` | `id`, `job_id`, `corpus_release_id`, query/filter hashes, stage counts/timings, algorithm version | no raw customer text in operational view |
> | `retrieval_candidate` | `retrieval_run_id`, `node_version_id`, stage/rank/scores/features, selected flag | bounded count; reproducibility |
> | `model_execution` | `id`, `job_id`, `profile`, actual provider/model/version, input/output token counts, latency, cost_micro_aud, schema status, retention mode | raw prompt/response excluded from ordinary logs/support |

**PRD §39.5 — Job types and worker fairness** fixes the queue classes:

> | Queue class | Jobs | Priority | Initial concurrency |
> | `interactive_quick` | Quick, clarification continuation | 1 | 1 |
> | `interactive_research` | Deep, Coverage, Compare | 2 | 1 shared; no parallel hosted synthesis initially |
> | `exports` | PDF/DOCX/JSON | 3 | 1 when no interactive pressure |
> | `notifications` | email/webhook/digest | 2 independent leases | bounded, does not consume research slot |
> | `maintenance` | cleanup, impact matching, usage reconciliation | 4 | cooperative/bounded |
>
> One worker process may host multiple lease loops, but every class has separate limits. Long Deep
> jobs yield between stages so Quick work is not starved. **Jobs store checkpoints at stage
> boundaries; only idempotent stages are retried.**

**PRD §34.1** fixes idempotency and money:

> Idempotency | Key 16–128 characters; same actor/route/key/body returns original result; **changed
> body returns 409** … Money | Integer micro-AUD for internal cost; never floating point

**PRD §34.9**: `409 IDEMPOTENCY_CONFLICT` — *"Reuse original body or new key"*.
**PRD §34.4 — SSE contract**: *"Clients connect with `Accept: text/event-stream` and may reconnect
using `Last-Event-ID`. **Events are stored before emission**."* Allowed public event types:
`job.started`, `stage.changed`, `clarification.required`, `answer.section`, `citation.added`,
`job.completed`, `job.failed`, `job.cancelled`, `heartbeat`.
**PRD §33.2**: *"Cancellation before paid provider execution releases the full reservation.
Cancellation after provider execution records actual cost but never publishes a partial supported
answer. A network retry with the same idempotency key returns the original job."*
**PRD §35.8 invariant 6**: *"Outbox event and corresponding business state commit in one
transaction."*
**PRD §22**: logs and operational views must exclude research content — which is why `retrieval_run`
stores *hashes* and `model_execution` excludes raw payloads.
**PRD §45.2** draws the line this ticket must not cross: `apps/worker` owns "Lease loops and
application-service orchestration"; `packages/jobs` therefore supplies the **primitives** those
loops call. `RUNT-04` is `blocked_by` this ticket.

Accepted caveats:

- `job.corpus_release_id` refers to a row in `corpus.sqlite`, a **different database** (PRD §18.3).
  It is a copied stable reference, not a foreign key — the same treatment PRD §35.5 gives citations
  ("corpus IDs copied as stable references"). Cross-database referential integrity is out of reach
  by design and is checked at admission time, not by SQLite.
- Initial concurrency numbers in PRD §39.5 are initial defaults, not tuned values. Store them as
  configuration; do not hard-code them into queries.

## Goal

Add the six PRD §35.6 execution tables as one expand-only, timestamp-prefixed migration with
`packages/database/src/schema/execution.ts` and `packages/database/src/repos/execution/**`, and
build `packages/jobs` as the transactional primitives `RUNT-04`'s lease loops and `RUNT-03`'s SSE
transport call: idempotent job admission with a three-way outcome, a race-free lease claim/renew/
release, per-job monotonic event sequencing for `Last-Event-ID` replay, stage checkpoints, and an
outbox enqueue that is impossible to call outside a transaction. Completion is mechanically
checkable: the schema assertion passes, and the concurrency suite shows one job per idempotency key,
one lease owner per job, no event-sequence gaps and no outbox row without its business row.

## Non-goals

- **No lease loops, no worker process, no fairness scheduler.** `RUNT-04` owns
  `apps/worker/src/{main.ts,runtime,queues}/**` and is `blocked_by` this ticket. `packages/jobs`
  exposes primitives; it starts no timer and owns no process lifecycle.
- **No SSE endpoint or HTTP transport.** `RUNT-03` owns `apps/api/src/sse/**`; this ticket persists
  the events it replays.
- **No answer, coverage or comparison logic.** `15-answer-product` (`ASK-*`) and
  `12-evidence-safety` (`EVID-*`).
- **No budget arithmetic or circuit breaker.** `FND-09` (`packages/domain/src/budget/**`) and
  `EVID-08`; the `usage_ledger` table itself is `DATA-07`. `model_execution.cost_micro_aud` here is
  a recorded fact, not a decision.
- **No research/answer tables** (`DATA-06`) and **no usage/monitor/audit/incident tables**
  (`DATA-07`) — see sub-PRD D3 for the exact §35.6 split.
- **No ephemeral content.** `DATA-08` owns `ephemeral.sqlite`; `job` stores only the opaque
  reference plus "safe status/cost metadata" (PRD §35.7).
- **No retrieval or model execution.** `11-retrieval-engine`, `12-evidence-safety`; this ticket
  stores their metadata rows.

## File-scope (write-owns)

- `packages/database/src/schema/execution.ts`
- `packages/database/src/repos/execution/**`
- `packages/database/migrations/<UTC YYYYMMDDHHMMSS>_execution.sql` (matches plan §5.2's
  `migrations/*_execution.sql`)
- `packages/jobs/**` (including `packages/jobs/package.json`, `tsconfig.json` and its tests)
- `packages/database/test/execution/**` (this ticket's own test area, sub-PRD D8)
- `packages/database/package.json` — append-only (sub-PRD D9)

- Does not touch: `src/migrate/**`, `migrations/0001_*` (`DATA-01`) · `src/tenant/**`,
  `test/architecture/**` (`DATA-02`) · `src/crypto/**` (`DATA-03`) · `src/schema/tenancy.ts`,
  `src/repos/tenancy/**`, `migrations/*_tenancy.sql` (`DATA-04`) · `src/schema/research.ts`,
  `src/repos/research/**`, `migrations/*_research.sql` (`DATA-06`) · `src/schema/operations.ts`,
  `src/repos/operations/**`, `migrations/*_operations.sql` (`DATA-07`) · `src/ephemeral/**`
  (`DATA-08`) · `src/invariants/**`, `test/invariants/**` (`DATA-09`) · `apps/worker/**`
  (`RUNT-04`) · `apps/api/src/sse/**` (`RUNT-03`) · `tests/**` (`23-assurance`).

**Serial safety.** First decomposition — nothing merged, no in-flight contention, no prior toucher.
This ticket is alone in wave 4 (`DATA-04` merges before it starts; `DATA-06` and `DATA-07` start
after), so nothing runs concurrently with it inside the module. `packages/jobs/**` is untouched by
every other ticket in the plan. Per plan A5 the migration is timestamp-prefixed and expand-only, so
`DATA-06` and `DATA-07` — which both reference `job` — do not serialise on each other, only on this
ticket, which is exactly the `blocked_by` edges the DAG already carries. `src/schema/*.ts` is a glob
(sub-PRD D4): adding `execution.ts` touches no other file.

## Deliverables

1. **Migration** `<timestamp>_execution.sql`, expand-only, created with
   `nextMigrationFilename('execution')`, creating the six tables with `DATA-01`'s §35.1 conventions
   and `DATA-02`'s `tenantForeignKey`/`tenantUnique` helpers. Tenant scope: `job`, `job_event`,
   `outbox_event`, `retrieval_run`, `retrieval_candidate`, `model_execution` are all `TENANT`-scoped
   (`job_event`, `retrieval_candidate` and `model_execution` carry `organization_id` denormalised so
   the tenant predicate is available without a join — PRD §35.1's rule that every tenant-owned
   unique key includes `organization_id`).
2. **Idempotency shape.** `job` carries `idempotency_key` (16–128 chars, PRD §34.1),
   `route` and `idempotency_fingerprint` (a hash of the normalised request body), with
   `UNIQUE (organization_id, actor_id, route, idempotency_key)`. The repository exposes
   `claimIdempotentJob(tx, ctx, spec)` returning a discriminated union:
   - `{ outcome: 'CREATED', job }`
   - `{ outcome: 'EXISTING', job }` — same key, same fingerprint (PRD §34.1 "same actor/route/key/
     body returns original result")
   - `{ outcome: 'CONFLICT' }` — same key, different fingerprint, which `apps/api` maps to
     `409 IDEMPOTENCY_CONFLICT` (PRD §34.9).
   The unique index, not a read-then-write, is what makes this race-free.
3. **Queue classes.** `packages/jobs/src/queues.ts` exposing the five PRD §39.5 classes with their
   priority and initial concurrency as **configuration**, and the mapping from `job_type` to class.
   Enum values come from `packages/contracts` (`FND-03`); the SQLite CHECK is generated
   (PRD §35.1). Queue indexes on `(queue_class, status, lease_expires_at, priority, created_at)`.
4. **Lease primitives.** `packages/jobs/src/lease.ts`:
   - `claimNext({ queueClass, workerId, leaseSeconds, now })` — a single `BEGIN IMMEDIATE`
     transaction that selects one eligible job (`status` runnable, `lease_expires_at` null or past)
     and writes `lease_owner`/`lease_expires_at`/`attempts + 1` in the same statement scope;
   - `renewLease(jobId, workerId, leaseSeconds)` — fails when the caller is no longer the owner;
   - `releaseLease(jobId, workerId, disposition)`;
   - `reclaimExpiredLeases(now)` — at-least-once delivery (PRD §18.5 step 3);
   - `recordCheckpoint(jobId, stage, payload)` / `readCheckpoint(jobId)` — PRD §39.5 "Jobs store
     checkpoints at stage boundaries; only idempotent stages are retried"; the checkpoint payload is
     bounded and carries no research content (PRD §22).
   Per-class limits are enforced by the query (a class cannot lease beyond its configured
   concurrency); the *loop* that calls this is `RUNT-04`'s.
5. **Job-event sequencing.** `packages/database/src/repos/execution/jobEvents.ts`:
   `appendJobEvent(tx, ctx, { jobId, publicEventType, payload })` allocating a per-job monotonic
   `sequence` **inside the caller's transaction** (`UNIQUE (job_id, sequence)`), append-only (no
   update/delete member exists), payload restricted to the PRD §34.4 allowed public event types and
   to safe fields. `readJobEventsAfter(ctx, jobId, lastEventId)` returns the ordered tail for
   `Last-Event-ID` resume (PRD §34.4 "Events are stored before emission"; ANS-003). Events are
   written **before** any emission — the emitting side is `RUNT-03`.
6. **Transactional outbox.** `packages/database/src/repos/execution/outbox.ts`:
   `enqueueOutbox(tx, ctx, event)` requires an active `Tx` handle from `DATA-02`'s
   `withTenantTransaction` — calling it with no transaction is a type error and, for JS callers, a
   runtime throw (PRD §35.8 invariant 6). Dispatch side: `claimOutboxBatch({ limit, now })` with
   attempt counting and `next_attempt_at` backoff, `markDelivered`, `markFailed`,
   `deadLetter` — delivery itself is `RUNT-04`/`WTCH-04`'s.
7. **Cancellation and terminal states.** `requestCancellation(ctx, jobId)` sets
   `cancellation_requested_at`; the worker checks it cooperatively at stage boundaries.
   `settleJob(tx, ctx, { status, failureCode, finishedAt })` writes the terminal state and is the
   only path to it. Reservation release is `EVID-08`'s arithmetic over `DATA-07`'s ledger; this
   ticket records the job-side facts only (PRD §33.2).
8. **Retrieval and model metadata repositories** — `retrieval_run`, `retrieval_candidate`,
   `model_execution` — with a hard rule encoded in the schema: **no plaintext content column**.
   `retrieval_run` stores `query_hash` and `filter_hash`; `model_execution` stores counts, latency,
   `cost_micro_aud` (INTEGER; PRD §34.1 "never floating point"), schema status and retention mode,
   never prompt or response text (PRD §35.6, §22, §37.3).
9. **`packages/database/src/schema/execution.ts`** exporting `tableManifest` with
   `group: 'execution'`, `scope: 'TENANT'` for all six, `mutability`: `job` `MUTABLE_METADATA`,
   `outbox_event` `MUTABLE_METADATA` (status/attempts advance), `job_event`, `retrieval_run`,
   `retrieval_candidate` and `model_execution` `APPEND_ONLY`, and the full `requiredColumns` copied
   from PRD §35.6. No barrel file (sub-PRD D4).
10. **`packages/jobs` package boundary.** `packages/jobs` depends on `packages/database`; the reverse
    dependency must not exist. Add a test asserting the dependency direction so the two packages
    cannot become mutually recursive.

## Acceptance checklist (classified)

- [ ] `[machine]` A clean database migrates to head and contains the six PRD §35.6 execution tables
      with every listed required column, asserted against a literal expectation table (PRD §35.6,
      sub-PRD D3)
- [ ] `[machine]` `DATA-01`'s `assertSchemaConventions` passes for the execution manifest, including
      `organization_id` on every table and generated enum CHECKs (PRD §35.1)
- [ ] `[machine]` **ANS-003 idempotency**: the same `(organization, actor, route, key, body)` yields
      `EXISTING` with the original job id; a changed body yields `CONFLICT`; 20 concurrent
      admissions with one key create exactly **one** job row (PRD §34.1, §34.9, §30.2 ANS-003
      "Repeated idempotency key creates one job/charge")
- [ ] `[machine]` **Lease exclusivity**: two workers calling `claimNext` concurrently for the same
      queue class never both own the same job; `attempts` increments once per claim
      (PRD §18.5 step 3)
- [ ] `[machine]` An expired lease is reclaimable by another worker and the original owner's
      `renewLease` then fails (at-least-once delivery, PRD §18.5)
- [ ] `[machine]` **Per-class limits**: saturating `interactive_research` does not prevent
      `notifications` or `maintenance` from leasing (PRD §39.5 "every class has separate limits …
      does not consume research slot")
- [ ] `[machine]` **Job-event sequencing**: 100 concurrent appends to one job produce sequences
      1…100 with no gap and no duplicate; `readJobEventsAfter(lastEventId)` returns the ordered tail
      (PRD §34.4 `Last-Event-ID`; ANS-003)
- [ ] `[machine]` `appendJobEvent` rejects an event type outside the PRD §34.4 allowed list, and the
      `job_event` repository exposes no update/delete member (append-only)
- [ ] `[machine]` **Invariant 6**: `enqueueOutbox` outside a transaction throws; a business write +
      outbox write commit together, and a forced rollback leaves **neither** row (PRD §35.8
      invariant 6)
- [ ] `[machine]` Outbox dispatch: `claimOutboxBatch` is race-free across two callers, applies
      backoff via `next_attempt_at`, and dead-letters after the configured attempts
- [ ] `[machine]` Checkpoints: after a simulated crash mid-stage, `readCheckpoint` returns the last
      stage boundary and re-running the idempotent stage produces no duplicate row (PRD §39.5)
- [ ] `[machine]` Cancellation: `requestCancellation` before terminal state is observable to the
      lease holder; `settleJob` is the only path to a terminal status (PRD §33.2)
- [ ] `[machine]` **No customer text in operational tables**: the column sets of `retrieval_run`,
      `retrieval_candidate` and `model_execution` contain no free-text content column — asserted from
      `pragma table_info`, not from the module under test (PRD §35.6, §22, §37.3)
- [ ] `[machine]` `cost_micro_aud` is INTEGER; a float insert is rejected (PRD §34.1 "never floating
      point")
- [ ] `[machine]` `job.corpus_release_id` is stored as a copied stable reference with **no** foreign
      key (it lives in `corpus.sqlite`) and is non-null for every job type that pins a release
      (PRD §18.3, §18.5 step 2, ANS-004)
- [ ] `[machine]` `packages/jobs` does not import `apps/**`, and `packages/database` does not import
      `packages/jobs` (dependency-direction test)
- [ ] `[machine]` The migration passes `assertExpandOnly` and its filename matches
      `MIGRATION_FILENAME` with the `execution` group suffix (plan A5)
- [ ] `[machine]` `pnpm test` green
- [ ] No `[fixture]` criteria — nothing recorded is replayed here
- [ ] No `[human]` criteria — `UAT-ANS-01` (one job/snapshot/charge), `UAT-ANS-06` (SSE resume) and
      `UAT-ANS-07` (cancel releases reservation) are PRD §41.2 manual scripts run end-to-end by
      `15-answer-product` and `23-assurance` (`ASSR-05`), not against this package
- [ ] No Rust or Python is touched (PRD §45.3)

## Test plan

Offline; no network, no worker process, no provider.

1. `pnpm test`; focused runs with `pnpm --filter <the packages/database package name> test` and
   `pnpm --filter <the packages/jobs package name> test`.
2. Reuse `withTempDatabase` (`DATA-01`) and the tenancy factories
   (`packages/database/test/tenancy/factories.ts`, `DATA-04`) to seed an organisation and actor.
   Add `packages/database/test/execution/factories.ts` for jobs.
3. Concurrency harness: Node `worker_threads`, each thread opening its own `better-sqlite3`
   connection to the same temp file with the shared pragmas (`DATA-01`). Use a start barrier so the
   threads contend. Three scenarios: 20 concurrent idempotent admissions with one key; 8 workers
   calling `claimNext` on 4 jobs; 100 concurrent `appendJobEvent` calls on one job.
4. Outbox atomicity: within `withTenantTransaction`, write a business row and an outbox row, then
   throw; assert both are absent. Repeat with a commit; assert both are present. Then call
   `enqueueOutbox` with no transaction and assert the throw.
5. Checkpoint/crash simulation: run a fake three-stage job, kill (throw) after stage 2's checkpoint,
   re-lease with a new worker id, and assert stage 3 starts from the recorded checkpoint and no
   stage-2 side-effect row is duplicated.
6. Schema assertions read `pragma table_info` and compare against expectation tables transcribed
   from PRD §35.6 in the test file.
7. Reviewer greps the diff for any `TEXT` column on `retrieval_run`/`model_execution` that could
   hold prose, any `REAL` cost column, and any `setInterval`/`setTimeout` in `packages/jobs` (loops
   belong to `RUNT-04`).

## Feedback obligation

1. **General rule.** If implementation falsifies this spec, update this ticket and
   `docs/prd/01-app-data/README.md` first (version +0.1 + changelog line), then change code, then
   `publish-tickets.mjs --sync` (CLAUDE.md, issue #53).
2. **Foreseeable frictions, each with its writeback target:**
   - *The §35.6 split between `DATA-05` and `DATA-07` proves wrong* — e.g. `usage_ledger` needs to be
     written in the same statement as the job row → the split is sub-PRD **D3**. Update
     `docs/prd/01-app-data/README.md` D3 **and** the two tickets' file-scopes, and check whether the
     `blocked_by` direction in `docs/prd/breakdown-plan.md` §5.2/§6.2 must change, **before** writing
     a table into the other ticket's migration file.
   - *SQLite's single writer makes per-class concurrency unenforceable in one query* → record the
     actual mechanism (advisory rows, per-class counters) in `docs/prd/01-app-data/README.md` and
     notify `RUNT-04` through the cross-module table; if the resolution is durable, add
     `docs/adr/NNNN-job-lease-concurrency.md`.
   - *`Last-Event-ID` replay needs an event retention/pruning policy the PRD does not state* → that
     is a retention rule (PRD §10.3) and therefore a **Product change** under PRD §45.5 if it
     shortens what a customer can resume. Raise it as an open question in
     `docs/prd/01-app-data/README.md` with `15-answer-product` named, do not choose silently.
   - *A job type needs a queue class outside the PRD §39.5 five* → do not add a class locally. PRD
     §39.5 is normative; raise it in `docs/prd/01-app-data/README.md`'s open questions and route the
     enum change through `FND-03` (serial-owned canonical enums, plan §4.1).
   - *`packages/jobs` needs its own database or table* → it must not have one (PRD §18.1 forbids
     "multiple service databases"). Add the table to this ticket's execution migration and record it
     in `docs/prd/01-app-data/README.md`.
3. **Falsified decision.** If a database-backed durable queue with a transactional outbox cannot meet
   the PRD §18.5 guarantee ("one observable answer and no duplicate charge"), that falsifies a PRD
   architecture statement, not a local detail. Stop, escalate for re-review, and update the PRD
   through the product-change path (PRD §45.5) before introducing any external queue.
