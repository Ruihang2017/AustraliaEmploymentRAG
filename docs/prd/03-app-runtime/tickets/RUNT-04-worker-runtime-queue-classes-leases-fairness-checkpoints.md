---
id: RUNT-04
title: "Worker runtime: queue classes, leases, fairness, checkpoints"
module: 03-app-runtime
lane: 03-app-runtime
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [DATA-05]
blocks: [RUNT-09, ASK-02, WTCH-02, RLSE-01, XPRT-01]
---

# RUNT-04 — Worker runtime: queue classes, leases, fairness, checkpoints

Implements PRD §39.5 (job types and worker fairness), §18.1 (architecture style) and §18.5 (answer
runtime, worker half), carrying the execution half of requirement `ANS-003`. **No ADR — the decision
is already made in PRD §39.5 and §18.5; this is build ticket 4 of 9 against it.**
Parent sub-PRD: [03-app-runtime README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `DATA-05` (execution tables + `packages/jobs` lease primitives) in
[`01-app-data`](../../01-app-data/README.md).
**Why `builder`:** a bounded change inside one module's declared file-scope wiring the `packages/jobs`
lease primitives into the five queue classes PRD §39.5 already tabulates — not a new subsystem decision.

## Background + basis

**The five queue classes and their limits are given.** PRD §39.5, verbatim:

| Queue class | Jobs | Priority | Initial concurrency |
|---|---|---:|---:|
| `interactive_quick` | Quick, clarification continuation | 1 | 1 |
| `interactive_research` | Deep, Coverage, Compare | 2 | 1 shared; no parallel hosted synthesis initially |
| `exports` | PDF/DOCX/JSON | 3 | 1 when no interactive pressure |
| `notifications` | email/webhook/digest | 2 independent leases | bounded, does not consume research slot |
| `maintenance` | cleanup, impact matching, usage reconciliation | 4 | cooperative/bounded |

> **One worker process may host multiple lease loops, but every class has separate limits. Long Deep
> jobs yield between stages so Quick work is not starved. Jobs store checkpoints at stage boundaries;
> only idempotent stages are retried.**

**Execution semantics are fixed by PRD §18.5.** Step 3: "Worker leases the job with at-least-once
delivery and reauthorises actor, tenant, resource and budget." Step 6: "One transaction commits Answer
Snapshot, claims/citations/assumptions, retrieval/model metadata, actual cost, job status, audit and
outbox." Step 7: "`job.completed` is emitted only after commit." And the closing invariant:

> At-least-once execution plus idempotency and immutable unique results MUST provide one observable
> answer and no duplicate charge.

**The infrastructure is deliberately small.** PRD §18.1: "Use a database-backed durable job queue and
transactional outbox. **Do not introduce Kubernetes, service mesh, Kafka, RabbitMQ, a Redis cluster,
multiple service databases or module-per-service deployment in the MVP.**"

**The process boundary.** PRD §39.1 gives `worker: job runner` reading the job/outbox tables,
`app.sqlite`, `ephemeral.sqlite`, the localhost `search` service and the model-gateway package, and
enforces `worker → jobs/model/retrieval/citation domain services`. PRD §39.2 gives it a 384 MiB
initial memory limit and network access to "app/ephemeral DB, search, export write permission,
approved model providers, outbox deliveries". PRD §45.2: `apps/worker` owns "Lease loops and
application-service orchestration" and must **not** own "Direct unscoped tenant SQL".

**Why directory autoload, and why it is this ticket's job.** `docs/prd/breakdown-plan.md` §2.1 row
**A1**:

> `apps/api`, `apps/worker`, `apps/web` register routes/handlers/features by **directory convention**
> (autoload), never a shared central manifest. … Recorded by `RUNT-01`, `RUNT-04`, `RUNT-05`.

breakdown-plan §4 allocates `apps/worker/src/handlers/{answer,deep,coverage,comparison}` to
`15-answer-product`, `{change-matching,alerts,notifications}` to `16-monitor-alerts`,
`{rerun,correction}` to `17-records-collab` and `export` to `19-exports`. **None** of them may edit a
file this ticket owns.

**The `maintenance` row needs one clarification, recorded as decision D8** in
[`../README.md` §4](../README.md#4-decisions): the three jobs PRD §39.5 lists under `maintenance`
("cleanup, impact matching, usage reconciliation") are a **queue class**, not a file location. Impact
matching lives in `apps/worker/src/handlers/change-matching/**` (`WTCH-02`, `16-monitor-alerts`) and
registers into the `maintenance` class. `apps/worker/src/handlers/maintenance/**` — this ticket's
scope — holds only the runtime's **own** housekeeping jobs.

**Fixed inputs and accepted caveats, documented not enforced here:**

- **The SQLite access layer is decided.** breakdown-plan §8 **Q13** is a confirmed architecture
  decision: **Kysely-style repositories and query construction over `better-sqlite3`**, and **Drizzle
  is not used** in the application database layer. Raw `.sql` files checked into git stay the only
  migration authoring format, and the project's own forward-only expand/contract runner owns migration
  ordering, checksums, locking and recovery points; Kysely owns typed application queries and
  repositories only, never migrations. `DATA-01` (`01-app-data`) records the decision and carries its
  ADR decision input — this ticket consumes it and adds nothing to it. **What it means for the
  worker:** the runtime reaches data only through the tenant-scoped repository interfaces
  `packages/jobs` and `packages/database` export. It never holds a Kysely instance, constructs a query
  or opens a SQLite connection — `DATA-02` forbids importing `kysely` outside `packages/database`, and
  PRD §45.2 forbids `apps/worker` to own "Direct unscoped tenant SQL".
- **The toolchain versions are fixed.** breakdown-plan §8 **Q12** is confirmed: Node.js `24.18.0`,
  pnpm `11.4.0`, Rust `1.97.1`, Python `3.14.6` — Node 24 LTS, not Node 26. `FND-01` holds the pins;
  this ticket declares no version of its own and runs on exactly those versions, the same ones CI runs
  (PRD §45.3).
- **"1 shared; no parallel hosted synthesis initially"** is an *initial* default, so it is
  configuration with the PRD value as the committed safe default (PRD §39.6 layer 1) — not a constant.
  Changing it is a benchmark-selected configuration decision (PRD §45.5), not an implementation detail.

## Goal

Produce a bootable `apps/worker` process that hosts one lease loop per PRD §39.5 queue class with
independently configured limits, discovers job handlers purely by directory convention under
`apps/worker/src/handlers/<area>/`, leases jobs at-least-once with checkpointed stage boundaries and
retries only stages declared idempotent, and yields between stages so that an `interactive_research`
job cannot starve `interactive_quick`. Completion is mechanically checkable: a conformance test
registers a throw-away handler directory at test time and sees it executed with **zero** diff to any
tracked file; a starvation test with a long fake Deep job shows a Quick job admitted within one stage
boundary; and a crash-and-resume test shows a job resuming from its last checkpoint with non-idempotent
stages not re-executed.

## Non-goals

- **No product job handlers.** `handlers/{answer,deep,coverage,comparison}` → `15-answer-product`;
  `{change-matching,alerts,notifications}` → `16-monitor-alerts`; `{rerun,correction}` →
  `17-records-collab`; `export` → `19-exports` (breakdown-plan §4). This ticket ships only the runtime
  and its own housekeeping handlers under `handlers/maintenance/**`.
- **No job tables, outbox, lease SQL or `packages/jobs` primitives.** `DATA-05` (`01-app-data`);
  breakdown-plan **A3** and PRD §45.2 forbid this module to own them. This ticket consumes them.
- **No model gateway, retrieval client, PII or citation validation.** `12-evidence-safety`,
  `11-retrieval-engine`.
- **No answer semantics, no stage vocabulary decisions.** `15-answer-product`; the stage names are
  `packages/contracts` (`FND-03`).
- **No SSE emission logic.** `RUNT-03` owns the writer; a handler calls it.
- **No HTTP surface.** `apps/api/**` is `RUNT-01`/`RUNT-02`/`RUNT-03`/`RUNT-08`.
- **No systemd units, release archive or production supervision.** `18-ops-release` (`RLSE-01`,
  `RLSE-02`); breakdown-plan **A7**.
- **No Compose file.** `RUNT-09`, which is `blocked_by` this ticket.

## File-scope (write-owns)

- `apps/worker/src/main.ts`
- `apps/worker/src/runtime/**`
- `apps/worker/src/queues/**`
- `apps/worker/src/handlers/maintenance/**`
- `apps/worker/package.json`, `apps/worker/tsconfig.json` — **append-only extension** of the empty
  workspace-member skeleton `FND-01` created (breakdown-plan §1.1, "Package manifests").
- `apps/worker/test/**` — this ticket's own unit/integration tests (breakdown-plan §1.1).
- `docs/adr/NNNN-worker-handler-directory-autoload.md` — a **new** file claimed by this ticket under
  breakdown-plan **A9**. Take the lowest unused four-digit number at build time; the slug
  `worker-handler-directory-autoload` is reserved to this ticket.

Does not touch:

- `apps/worker/src/handlers/{answer,deep,coverage,comparison,change-matching,alerts,notifications,rerun,correction,export}/**`
  — the product modules named above.
- `packages/jobs/**`, `packages/database/**` — `01-app-data` (`DATA-05`).
- `packages/contracts/**`, `packages/domain/**` — `00-foundation`, serial-owned enums (`FND-03`).
- `apps/api/**` — `RUNT-01`/`RUNT-02`/`RUNT-03`/`RUNT-08` and the product route areas.
- `apps/web/**`, `packages/ui/**`, `packages/observability/**` — `RUNT-05`, `RUNT-06`, `RUNT-07`.
- `infra/**` — `RUNT-09` (compose) and `18-ops-release` (everything else).
- `tests/**` — `23-assurance`. Root manifests, lockfiles, `.github/workflows/**` — `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown-plan §1: phase 1, nothing merged, no
in-flight ticket), so nothing has previously written `apps/worker/**` and nothing contends for it. The
`apps/worker` tree is split by breakdown-plan §4 between this module (`main.ts`, `runtime`, `queues`,
`handlers/maintenance`) and four product modules, each owning named sibling directories under
`handlers/`. Sibling tickets in this module are in different trees entirely: `RUNT-01`/`RUNT-02`/
`RUNT-03`/`RUNT-08` are `apps/api`, `RUNT-05` is `apps/web`, `RUNT-06`/`RUNT-07` are `packages/`,
`RUNT-09` is `infra/compose`. This ticket is in wave 1 with `RUNT-01`, `RUNT-05`, `RUNT-06` and
`RUNT-07`, all five runnable as concurrent lanes (breakdown-plan §7). `docs/adr/` is shared-additive
with per-file ownership (A9) and this slug is unique.

## The A1 worker registration contract (normative for four downstream modules)

**1. Discovery.** Every immediate child directory of `apps/worker/src/handlers/` is a **handler area**;
its directory name is the area id. Areas are discovered by directory scan at boot, sorted
lexicographically, and registered in that order.

**2. Required entry file.** A handler area MUST contain `index.ts` with a **default export** of type
`JobHandlerModule`:

```ts
import type { JobHandlerModule, JobHandler, JobContext, StageResult } from '../../runtime/contract';

const handler: JobHandler<QuickAnswerPayload> = {
  type: 'ANSWER_QUICK',                 // canonical job type enum from packages/contracts (FND-03)
  queue: 'interactive_quick',            // one of the five PRD §39.5 classes
  stages: [
    { name: 'RETRIEVE',  idempotent: true  },
    { name: 'SYNTHESISE', idempotent: false },
    { name: 'COMMIT',    idempotent: false },
  ],
  async run(ctx: JobContext<QuickAnswerPayload>, stage: string): Promise<StageResult> { /* … */ },
};

const module_: JobHandlerModule = { handlers: [handler] };
export default module_;
```

**3. Validation at boot, never at first job.** A directory without a default-exporting `index.ts`, a
`type` not present in the `packages/contracts` job-type enum, a `queue` outside the five PRD §39.5
classes, a duplicate `type` across two areas, or an empty `stages` list **fails boot** with an error
naming the area and the offence. Silent skip is forbidden.

**4. What `JobContext` gives a handler and nothing more.** `{ jobId, jobType, tenant: TenantContext,
payload, attempt, checkpoint, logger, signal }`. `tenant` is the `DATA-02` scoped context — there is
**no** unscoped connection, Kysely instance, query builder or SQLite handle reachable from
`JobContext` (PRD §45.2: `apps/worker` must not own "Direct unscoped tenant SQL"; breakdown-plan §8
**Q13**). `signal` is an `AbortSignal` fired on cancellation, kill switch and `SIGTERM`
drain.

**5. Yield points.** `run` is called **once per stage**. Returning from a stage is the yield point; the
runtime re-evaluates fairness between stages (PRD §39.5 "Long Deep jobs yield between stages so Quick
work is not starved"). A handler that never returns between stages is a handler bug, and a configurable
per-stage soft deadline logs it.

**6. Stability guarantee.** Adding, renaming or removing a handler area produces **zero** diff outside
that area's own directory.

## Deliverables

1. **`apps/worker/package.json` / `tsconfig.json`** — extend the `FND-01` skeleton with workspace
   references to `packages/jobs`, `packages/database`, `packages/contracts` and
   `packages/observability`, plus `dev`/`build`/`start` scripts. No toolchain version is declared here:
   the **Q12** versions (Node.js `24.18.0`, pnpm `11.4.0`) are fixed and `FND-01` holds the pins.
2. **`apps/worker/src/runtime/contract.ts`** — the exported types in the contract section above:
   `JobHandlerModule`, `JobHandler`, `JobStage` (`{ name: string; idempotent: boolean }`),
   `JobContext`, `StageResult` (`{ next?: string; done?: true; checkpoint?: unknown }`), `QueueClass`.
   `QueueClass` is the frozen tuple
   `['interactive_quick','interactive_research','exports','notifications','maintenance']` — exactly
   PRD §39.5, imported from `packages/contracts` if `FND-03` exports it.
3. **`apps/worker/src/runtime/registry.ts`** — `export async function loadHandlerAreas(opts?: { root?:
   string }): Promise<HandlerRegistry>` implementing discovery, boot-time validation and duplicate
   detection per the contract. `HandlerRegistry.byType(type)` and `.byQueue(queue)` are the only
   lookups the loops use.
4. **`apps/worker/src/queues/config.ts`** — the five class configurations with the PRD §39.5 values as
   committed safe defaults (PRD §39.6 layer 1), each independently overridable:
   `interactive_quick` priority 1 concurrency 1; `interactive_research` priority 2 concurrency 1
   shared with `allowParallelHostedSynthesis: false`; `exports` priority 3 concurrency 1 gated on
   `noInteractivePressure`; `notifications` priority 2 with **2 independent leases** and a flag that
   it does not consume a research slot; `maintenance` priority 4, cooperative and bounded.
5. **`apps/worker/src/queues/loop.ts`** — one lease loop per class. Each loop: claims a job through
   `packages/jobs` (`DATA-05`) with a lease and at-least-once semantics; re-authorises actor, tenant,
   resource and budget **before each stage**, not only at claim time (PRD §18.5 step 3); runs one
   stage; persists the checkpoint; releases or extends the lease; yields. Limits are per class and are
   never shared across classes.
6. **`apps/worker/src/runtime/fairness.ts`** — the arbiter that implements PRD §39.5's two rules:
   (a) `exports` runs "when no interactive pressure" — it does not claim while an
   `interactive_quick` or `interactive_research` job is queued or running; (b) `notifications` uses
   its own two leases and never consumes a research slot. Priority ordering is 1 → 4. The arbiter is
   consulted at every stage boundary.
7. **`apps/worker/src/runtime/checkpoint.ts`** — stage checkpoints stored through `DATA-05`'s job
   repository at each stage boundary. On resume the runtime restarts at the **last uncommitted stage**;
   a stage declared `idempotent: false` that has already been recorded as completed is **never**
   re-executed (PRD §39.5 "only idempotent stages are retried"). Retries of an `idempotent: true` stage
   use bounded backoff from config.
8. **`apps/worker/src/runtime/cancellation.ts`** — cancellation, kill-switch and `SIGTERM` handling:
   the `AbortSignal` fires, the current stage is allowed to reach its boundary, the lease is released
   and the job is left resumable. PRD §42.5 requires "Cancel safely at stage boundary; settle actual
   cost only" for a model-profile switch and a configured cancel/drain for Deep — the runtime provides
   the boundary; the settlement is `15-answer-product`/`12-evidence-safety`.
9. **`apps/worker/src/main.ts`** — process entry: load config (PRD §39.6 layers; production refuses
   unknown critical keys), initialise the logger from `packages/observability` (`RUNT-07`), load the
   handler registry, start one loop per class, install `SIGTERM`/`SIGINT` drain, exit non-zero on boot
   failure with a single-line reason.
10. **`apps/worker/src/handlers/maintenance/**`** — the runtime's own housekeeping handlers, each a
    conforming handler area: `expired-leases` (reclaim leases whose holder died), `job-retention`
    (prune job and job-event rows past their retention window through `DATA-05`'s repository),
    `dead-letter` (move jobs past max attempts to the dead-letter state with the failure code). Each
    is `queue: 'maintenance'`, priority 4, cooperative and bounded. **No product maintenance job**
    lives here (decision D8).
11. **`docs/adr/NNNN-worker-handler-directory-autoload.md`** — records breakdown-plan **A1** for the
    worker boundary per PRD §45.5, stating the contract above, the mechanism chosen, the rejected
    central-manifest alternative (breakdown-plan R1) and the consequence that four product modules
    depend on its stability. Cross-references the ADR `RUNT-01` creates for the API boundary.
12. **Conformance test harness** — `apps/worker/test/handler-area-conformance.ts`, the reusable helper
    that writes a temporary handler area, boots `loadHandlerAreas({ root })`, enqueues a job of that
    type, asserts execution, and removes the directory. Exported for reuse by the four product modules.

## Acceptance checklist (classified)

- [ ] `[machine]` A handler area consisting of exactly one new directory containing `index.ts` is
      discovered and executed, with **zero** diff to any tracked file outside that directory —
      `apps/worker/test/handler-area-conformance.ts` (A1; breakdown-plan §2.1)
- [ ] `[machine]` Boot fails, naming the area and the offence, for: no default export; a `type` absent
      from the `packages/contracts` job-type enum; a `queue` outside the five PRD §39.5 classes; a
      duplicate `type` across two areas; an empty `stages` list. None is a silent skip
- [ ] `[machine]` Exactly five lease loops start, one per PRD §39.5 class, each with its own
      concurrency limit; raising `interactive_quick` concurrency does not change any other class's
      in-flight count (PRD §39.5 "every class has separate limits")
- [ ] `[machine]` Starvation test: with a fake `interactive_research` job of ten stages running, an
      `interactive_quick` job enqueued mid-run starts within one stage boundary (PRD §39.5 "Long Deep
      jobs yield between stages so Quick work is not starved")
- [ ] `[machine]` `exports` does not claim while an `interactive_quick` or `interactive_research` job
      is queued or running, and resumes claiming when both are idle (PRD §39.5 "1 when no interactive
      pressure")
- [ ] `[machine]` `notifications` runs on two independent leases and its in-flight count does not
      decrement any research slot (PRD §39.5 "2 independent leases … does not consume research slot")
- [ ] `[machine]` Crash-and-resume: killing the process mid-job and restarting resumes at the last
      uncommitted stage; a stage declared `idempotent: false` already recorded as completed is **not**
      re-executed — asserted with a side-effect counter that must equal 1 (PRD §39.5 "only idempotent
      stages are retried"; PRD §18.5 "one observable answer and no duplicate charge"; `ANS-003`)
- [ ] `[machine]` At-least-once claim: two loops racing for the same job result in exactly one lease
      holder; the loser observes the lease and moves on (PRD §18.5 step 3)
- [ ] `[machine]` Each stage re-authorises actor, tenant, resource and budget before executing, not
      only at claim time — asserted by a stub authoriser whose call count equals the stage count
      (PRD §18.5 step 3)
- [ ] `[machine]` `JobContext` exposes no unscoped database handle, query builder or SQLite
      connection; an architecture assertion over `apps/worker/src/**` forbids importing an unscoped
      `packages/database` entry point, `kysely` or a SQLite driver directly (PRD §45.2 "must not own
      Direct unscoped tenant SQL"; breakdown-plan §8 **Q13**; `DATA-02`; `SEC-001`)
- [ ] `[machine]` `SIGTERM` completes the current stage, releases the lease and leaves the job
      resumable; the process exits `0` within the configured drain window (PRD §39.2, §42.5)
- [ ] `[machine]` The three `handlers/maintenance/**` handlers run under `queue: 'maintenance'`,
      priority 4, and are bounded (each yields after a configured batch size) (PRD §39.5)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` `docs/adr/NNNN-worker-handler-directory-autoload.md` exists and is referenced from
      the PR (PRD §45.5; breakdown-plan A9)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `ANS-003` and the memory impact against the
      PRD §39.2 384 MiB worker budget
- No `[fixture]` criteria — this ticket replays no recorded source or evaluation data
      (breakdown-plan §1.1 maps `[fixture]` to PRD §40.8 adapter fixtures and §14/§43 evaluation replays)
- No `[human]` criteria — the worker has no customer-visible surface; the PRD §41.2 scripts that
      exercise it (`UAT-ANS-01`, `UAT-ANS-07`) belong to `ASK-01`/`ASK-02`
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)

## Test plan

Reviewer steps, offline, no network and no provider:

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/worker`. Suites live under `apps/worker/test/`.
3. Harness for every suite: a temp-file `app.sqlite` migrated with `DATA-01`'s runner, the `DATA-05`
   job repository and `packages/jobs` lease primitives, plus a **fake clock** so lease expiry and
   backoff are deterministic. No real provider, no network.
4. **`handler-registry.test.ts`** — fixture handler areas written into a `mkdtemp` root; assert
   discovery order, and assert each of the five boot-failure cases produces a named error.
5. **`conformance.test.ts`** — the exported harness: create a throw-away area, enqueue, assert
   execution, remove. Then `git status --porcelain` must be clean at suite end.
6. **`queue-limits.test.ts`** — start all five loops with fake handlers that block on a controllable
   latch; assert per-class in-flight counts and that changing one class's limit leaves the others
   unchanged.
7. **`fairness.test.ts`** — a ten-stage `interactive_research` fake job running; enqueue an
   `interactive_quick` job; assert it starts within one stage boundary. Separately assert `exports`
   is blocked while either interactive class has work and resumes when both are idle, and that
   `notifications` progresses throughout on its own two leases.
8. **`checkpoint-resume.test.ts`** — a three-stage handler whose middle stage is `idempotent: false`
   and increments a counter persisted in the fixture database. Abort the process after that stage
   commits its checkpoint, restart, drain. Assert the counter equals 1 and the job completes.
9. **`lease-race.test.ts`** — two loop instances against one job; assert exactly one lease holder.
10. **`reauthorise.test.ts`** — a stub authoriser counting calls; assert `calls === stages.length`.
11. **`architecture.test.ts`** — source scan over `apps/worker/src/**` for unscoped
    `packages/database` imports and for any direct `kysely` or SQLite-driver import (breakdown-plan §8
    **Q13**; `DATA-02` forbids `kysely` outside `packages/database`). Copy the construction pattern
    from `packages/database/test/architecture/**` (`DATA-02`).
12. **`shutdown.test.ts`** — spawn `main.ts` as a child process with a fixture handler, send `SIGTERM`
    mid-stage, assert exit code `0`, lease released and the job resumable on restart.
13. Confirm `docs/adr/NNNN-worker-handler-directory-autoload.md` exists and its number does not collide
    with another ADR on the default branch.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **Directory autoload does not survive the bundled release archive** PRD §20.3 requires ("CI builds
  one immutable app artifact") → this is breakdown-plan risk **R1** and falsifies decision **A1** for
  the worker boundary. Write, in order, before touching `apps/worker/src/`: (a)
  `docs/adr/NNNN-worker-handler-directory-autoload.md` recording the falsification and replacement;
  (b) a "worker handler manifest owned by `03-app-runtime`" row in `docs/prd/breakdown-plan.md` §4.2;
  (c) an amendment to `docs/prd/03-app-runtime/README.md` §4 D1. Four product modules' first handler
  tickets then become `blocked_by` a new manifest-registration ticket here.
- **A product module needs a `maintenance`-class handler but breakdown-plan §4 allocates it no
  `apps/worker/src/handlers/*` directory** (PRD §39.5 names "usage reconciliation", and
  `20-developer-platform` owns no worker directory) → this is open question **QR4** in
  `docs/prd/03-app-runtime/README.md` §6. The writeback target is **`docs/prd/breakdown-plan.md` §4**
  (a new directory allocation) plus §5/§6.2 for the ticket that will own it. Do **not** let another
  module write into `apps/worker/src/handlers/maintenance/**` — that is this ticket's scope and would
  break the disjointness the parallel lanes depend on.
- **`packages/jobs` (`DATA-05`) cannot express a lease/checkpoint operation this runtime needs** → add
  a ticket to `01-app-data` and make this one `blocked_by` it. That is a **plan** change: write
  `docs/prd/breakdown-plan.md` §5.2/§6.2 first. Do not write `packages/jobs/**` — breakdown-plan **A3**
  and PRD §45.2 forbid it (breakdown-plan risk **R4** gives exactly this path).
- **A PRD §39.5 concurrency value makes a required flow impossible** → the table's values are *initial*
  defaults and are configuration; a change to the shipped default is a **benchmark-selected
  configuration** decision (PRD §45.5) needing measured evidence. Record the measurement in the PR's
  cost/memory/latency line (PRD §45.4) and add the question to
  `docs/prd/03-app-runtime/README.md` §6. Do not change the committed default silently.
- **Fairness needs cross-process coordination** (more than one worker process) → PRD §18.1 forbids
  introducing Redis/Kafka/a service mesh. Write `docs/adr/NNNN-worker-fairness-coordination.md` first
  (PRD §45.5 "Architecture decision") and raise it in `docs/prd/03-app-runtime/README.md` §6 before
  adding any dependency.

**3. Escalation.** A1 is a decomposition-critical decision recorded in `docs/prd/breakdown-plan.md`
§2.1 that four product modules depend on, and "only idempotent stages are retried" (PRD §39.5) plus
"one observable answer and no duplicate charge" (PRD §18.5) are release requirements behind `ANS-003`.
If either is outright falsified, escalate for re-review before any code lands. Never swap the
registration or retry approach silently inside this ticket.
