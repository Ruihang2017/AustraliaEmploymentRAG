---
id: ASK-01
title: Answer job admission and transaction boundary
module: 15-answer-product
lane: 15-answer-product
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-02, RUNT-03, DATA-06, EVID-03, EVID-08]
blocks: [ASK-02, ASK-06, PLTF-05, ASSR-03]
---

# ASK-01 — Answer job admission and transaction boundary

Implements PRD §18.5 (answer runtime), §33.2 (Quick Answer transaction boundary), §34.3 (create an
Answer job) and §34.9 (error catalogue), carrying requirements **ANS-001**, **ANS-003** and
**ANS-004** (`E21`).
**No ADR — the decision is already made in PRD §18.5, §33.2 and §34.3; this is build ticket 1 of 12
against it.**
Parent sub-PRD: [15-answer-product README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`RUNT-02` — Admission middleware chain](../../03-app-runtime/tickets/RUNT-02-admission-middleware-chain.md) ·
[`RUNT-03` — SSE transport with persisted replay](../../03-app-runtime/tickets/RUNT-03-sse-transport-with-persisted-replay.md) ·
[`DATA-06` — Research and evidence tables (immutable)](../../01-app-data/tickets/DATA-06-research-and-evidence-tables-immutable.md) ·
`EVID-03` — PII availability split ([`12-evidence-safety`](../../12-evidence-safety/README.md)) ·
`EVID-08` — Budget reservation/settlement and hard circuit breaker ([`12-evidence-safety`](../../12-evidence-safety/README.md))
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(PRD §18.5 step 2, §33.2's sequence diagram and §34.3's literal payloads) — not a new subsystem
decision.

## Background + basis

This ticket is the product's money-and-truth boundary: the single place where a customer request
becomes a durable, charged, release-pinned unit of work. Everything downstream in this module assumes
it holds.

**PRD §18.5 — Answer runtime** is normative and reproduced in full:

> 1. App performs auth, TenantContext, permission/rate, PII, schema, legal scope, budget and
>    idempotency checks.
> 2. One transaction reserves credits, creates the job plus either a sanitized saved turn or an opaque
>    ephemeral-content reference, pins a CorpusRelease and writes an outbox event.
> 3. Worker leases the job with at-least-once delivery and reauthorises actor, tenant, resource and
>    budget.
> 4. Search receives only sanitized query, hard filters and pinned release.
> 5. Worker builds evidence, calls the approved Model Gateway profile and validates structured claims.
> 6. One transaction commits Answer Snapshot, claims/citations/assumptions, retrieval/model metadata,
>    actual cost, job status, audit and outbox.
> 7. `job.completed` is emitted only after commit.
>
> At-least-once execution plus idempotency and immutable unique results MUST provide **one observable
> answer and no duplicate charge**. SSE events MUST be persisted for reconnect/restart.

Steps 1, 2 and the `events_url` surface are this ticket. Steps 3–7 are `ASK-02`.

**PRD §33.2 — Quick Answer transaction boundary** gives the exact sequence, including the response:

> ```text
> U->>A: POST /v1/answers + Idempotency-Key
> A->>A: Auth, tenant, permission, PII, schema, rate, budget
> A->>D: TX reserve credit + create job + pin corpus + outbox
> A-->>U: 202 job_id/events_url
> ```
>
> Cancellation before paid provider execution releases the full reservation. Cancellation after
> provider execution records actual cost but never publishes a partial supported answer. A network
> retry with the same idempotency key returns the original job.

**PRD §34.3 — Create an Answer job.** The request body is normative:

```json
{
  "mode": "QUICK",
  "question": "Which official rules should be checked for this anonymous scenario?",
  "facts": {
    "free_text": "A full-time employee performs the following principal duties…",
    "employer_name": "Example Pty Ltd",
    "employer_abn": "51824753556",
    "work_jurisdictions": ["VIC"],
    "engagement_type": "EMPLOYEE",
    "employment_type": "FULL_TIME",
    "industry": "software services",
    "principal_duties": ["anonymous duty description"]
  },
  "legal_as_at": "2026-08-03",
  "jurisdictions": ["CTH", "VIC"],
  "retention_mode": "SAVE",
  "research_record_id": "rec_...",
  "new_record": null
}
```

> For `SAVE`, exactly one of `research_record_id` or `new_record: {"title":"…","tags":[]}` is
> required. **Creating a record and admitting the job occur in the same transaction.** For
> `EPHEMERAL`, both fields must be absent.

and the accepted response is normative:

```json
{
  "schema_version": "1.0",
  "request_id": "req_...",
  "job": {
    "id": "job_...",
    "type": "QUICK_ANSWER",
    "status": "QUEUED",
    "retention_mode": "SAVE",
    "corpus_release_id": "cr_...",
    "reserved_credits": 1,
    "created_at": "2026-08-03T03:00:00Z",
    "status_url": "/v1/answer-jobs/job_...",
    "events_url": "/v1/answer-jobs/job_.../events"
  }
}
```

> Clarification response still uses `202`; the job status becomes `WAITING_FOR_CLARIFICATION` and
> supplies questions … Clarifications are submitted to
> `POST /v1/answer-jobs/{job_id}/clarifications`. Submitting a stale clarification round returns
> `409 CLARIFICATION_ROUND_CLOSED`.

**PRD §8.3** fixes the release invariant this ticket establishes: both modes MUST *"preserve a single
pinned CorpusRelease for the entire answer"*.

**PRD §10.4 — Ephemeral retention:**

> Ephemeral content MUST be stored only in a local, non-replicated `ephemeral.sqlite`, not
> `app.sqlite`. It MUST expire one hour after completion/failure/cancellation and no later than
> 24 hours after creation. It MUST NOT enter Litestream, daily/weekly backups, exports or support
> tools. **After expiry return `410 EPHEMERAL_CONTENT_EXPIRED`.**

**PRD §35.8** — the two invariants this transaction must make structurally true:

> 2. A job cannot settle more cost than its reservation without an explicit additional prepaid/BYOK
>    reservation.
> 6. Outbox event and corresponding business state commit in one transaction.

**PRD §42.6:** *"Before a hosted call the gateway computes a conservative reservation from model
profile, maximum input/output tokens and current price. **Admission requires both operation quota and
funding-ledger balance.** Settlement records actual provider usage and releases the remainder."*
**PRD §24.4** names the two ledgers, `FOUNDER_PLATFORM_BUDGET` and `CUSTOMER_PREPAID_OR_BYOK`, and
forbids "unsecured founder liability".

**PRD §30.2** register rows this ticket carries:

> `ANS-001` — *"Quick and Deep accept explicit question, facts, date, jurisdiction and retention
> mode"*, evidence *"Missing decisive fields return clarification, not an invented assumption"*.
> `ANS-003` — *"Accepted work is asynchronous, idempotent, cancellable and resumable by SSE"*,
> evidence *"Repeated idempotency key creates one job/charge"*.
> `ANS-004` — *"Each answer uses one pinned corpus release and approved model profile"*.

**PRD §33.3 — Clarification flow** (the admission-time half; the submission endpoint is `ASK-03`):

> If a missing fact could change jurisdiction, applicable system, agreement, award, classification,
> status or material conclusion, the job moves to `WAITING_FOR_CLARIFICATION`. It returns 1–5 specific
> questions, each with the decision it affects.

**Contracts this ticket builds against (all already published):**

- `RUNT-01`'s A1 route-area contract: a directory under `apps/api/src/routes/` with `index.ts`
  default-exporting a Fastify plugin and an optional `export const area: RouteAreaConfig` carrying
  `prefix`, `admission` and `order`. Collision detection is on **method + path**; boot fails on a
  duplicate, never last-wins.
- `RUNT-02`'s admission chain: the eleven ordered stages
  `['request-limits','authenticate','resolve-organisation','verify-membership','evaluate-permission','rate-limit','pii-admission','schema-validate','legal-scope','budget-admission','idempotency']`,
  the `tenant` profile, `requiresPiiAdmission`, `idempotent: true` and the `TenantContext`-scoped
  repository accessor. This ticket **declares** those flags; it implements none of the stages.
- `RUNT-03`'s SSE surface: `createSseHandler({ resolveJobId, authorise })`, the `JobEventWriter`
  (`emit` persists first and returns the assigned sequence id) and the nine allowed PRD §34.4 event
  types.
- `DATA-06`'s `createRecord(tx, ctx, spec)`, which "takes the `Tx` handle so `ASK-01` can create a
  record and admit a job in one transaction (PRD §34.3)", and `DATA-05`'s `claimIdempotentJob`.
- `EVID-08`'s budget reservation/release API and hard circuit breaker.
- `EVID-03`'s PII availability split: *"Search can continue if PII service is unavailable; free-text
  research fails closed"* (`PII-002`).

**Accepted caveats carried forward:**

- The `answer-jobs` **directory** belongs to `ASK-03`, but the `/v1/answer-jobs/*` **URLs** for
  status, events and cancel are registered from this ticket's `routes/answers/**` area under
  `area.prefix: '/v1'`. This is sub-PRD decisions **D1–D3** and open question **Q-ASK-8**; it is the
  reading that keeps cancellation with the reservation (**D17**) and matches `RUNT-03`'s statement
  that `ASK-01` mounts the SSE plugin in its own route area.
- The canonical job-type value (`ANSWER_QUICK` / PRD §34.3's `"type": "QUICK_ANSWER"`) and the job
  status vocabulary are `FND-03`'s generated enums. If `packages/contracts` does not export them, the
  divergence is written back (sub-PRD **Q-ASK-3**), not resolved by a local enum that outlives the
  ticket.
- Clarification **persistence** has no PRD §35.5 table. Use the existing `DATA-05`/`DATA-06`
  repositories; a missing column is a new `01-app-data` ticket plus a `blocked_by` edge (breakdown
  plan **R4**), never a migration written here (sub-PRD **Q-ASK-5**).

## Goal

Ship the `answers` route area so that a `POST /v1/answers` request that survives `RUNT-02`'s
admission chain is converted, in exactly one database transaction, into: one pinned
`corpus_release_id`, an optional new `ResearchRecord`, one credit reservation, one durable job keyed
by its idempotency fingerprint, one sanitized saved turn or opaque ephemeral-content reference, and
one outbox event — after which a `202` carrying the PRD §34.3 job object is returned; and so that the
job's status, resumable SSE stream and cancellation are reachable at the PRD §16.2 URLs. Completion is
mechanically checkable: a forced failure at any point inside the transaction leaves **no** record, no
reservation, no job, no ephemeral row and no outbox event; two identical submissions with one
`Idempotency-Key` produce exactly one job and one reservation; and cancelling before the provider
stage releases the reservation in full.

## Non-goals

- **No worker execution.** `retrieve → pack → gateway → validate → commit` is `ASK-02`
  (`apps/worker/src/handlers/answer/**`), which is `blocked_by` this ticket. This ticket writes
  nothing under `apps/worker/`.
- **No clarification submission endpoint.** `POST /v1/answer-jobs/{jobId}/clarifications` is `ASK-03`
  (`apps/api/src/routes/answer-jobs/**`). This ticket only **returns** clarification questions in the
  `202` body when admission itself detects a decisive missing fact (PRD §34.3).
- **No snapshot read or rerun.** `GET /v1/answers/{id}` and `POST /v1/answers/{id}/rerun` are `ASK-04`
  (`apps/api/src/routes/answer-snapshots/**`).
- **No coverage or comparison admission.** `POST /v1/coverage-assessments` is `ASK-08`;
  `POST /v1/comparisons` is `ASK-11`. Both reuse the transaction shape defined here by importing this
  area's exported admission service; neither is `blocked_by` this ticket directly (both go through
  `ASK-02`), so the import is transitively ordered.
- **No tables, migrations or repositories.** `packages/database` and `packages/jobs` are `01-app-data`
  (`DATA-05`…`DATA-08`) — breakdown plan **A3**, PRD §45.2, PRD §44.3. If a column is missing, raise a
  `01-app-data` ticket (breakdown plan **R4**).
- **No admission middleware.** Authentication, tenant resolution, permission, rate limiting, PII
  admission, schema validation, budget admission and idempotency storage are `RUNT-02`'s stages. This
  ticket configures them per route and implements none.
- **No SSE transport.** `apps/api/src/sse/**` is `RUNT-03`. This ticket mounts `createSseHandler` and
  supplies only the `resolveJobId`/`authorise` callbacks.
- **No PII detection.** `packages/pii` is `12-evidence-safety` (`EVID-01`…`EVID-03`).
- **No budget arithmetic or price data.** `packages/model-gateway/src/budget/**` is `EVID-08`; the
  pure rules are `FND-09`. This ticket calls them.
- **No screens.** `apps/web/src/features/ask/**` is `ASK-06`, which is `blocked_by` this ticket.
- **No OpenAPI authoring.** `schemas/openapi/**` is `FND-04` (serial-owned). This ticket consumes the
  generated types; a missing shape is a `00-foundation` ticket.

## File-scope (write-owns)

- `apps/api/src/routes/answers/**`
- `apps/api/test/answers/**` — this ticket's own unit/integration tests (breakdown plan §1.1: tests
  live inside the owning app).
- `apps/api/package.json` — **append-only** (breakdown plan §1.1, "Package manifests"): this ticket
  adds only its own dependency lines. Regenerate `pnpm-lock.yaml` as a build artifact; never
  hand-merge it.

Does not touch:

- `apps/api/src/{server.ts,app.ts,bootstrap,errors}/**` — `RUNT-01`;
  `apps/api/src/{plugins,middleware}/**` — `RUNT-02`; `apps/api/src/sse/**` — `RUNT-03`;
  `apps/api/src/routes/{health,system-status}/**` — `RUNT-08`.
- `apps/api/src/routes/answer-jobs/**` — `ASK-03`; `apps/api/src/routes/answer-snapshots/**` —
  `ASK-04`; `apps/api/src/routes/coverage-assessments/**` — `ASK-08`;
  `apps/api/src/routes/comparisons/**` — `ASK-11`.
- `apps/api/src/routes/{auth,invitations,members,mfa,sso,service-accounts,widget-sessions}/**` —
  `13-identity-surface`; `.../routes/{search,documents,document-versions,nodes,node-versions}/**` —
  `14-search-product`; `.../routes/{watchlists,alerts,webhook-subscriptions}/**` — `16-monitor-alerts`;
  `.../routes/{research-records,research-turns,record-answers,review-actions,comments,issues,corrections}/**`
  — `17-records-collab`; `.../routes/exports/**` — `19-exports`;
  `.../routes/{sandbox,usage,audit-events}/**` — `20-developer-platform`; `.../routes/internal/**` —
  `22-internal-admin`.
- `apps/worker/**`, `apps/web/**` — `03-app-runtime` plus the product handler/feature subtrees.
- `packages/**` — `00-foundation`, `01-app-data`, `02-auth-core`, `03-app-runtime`,
  `11-retrieval-engine`, `12-evidence-safety`, `20-developer-platform`.
- `schemas/**` — `00-foundation`/`04-corpus-contract`; `infra/**` — `03`/`18`; `tests/**` —
  `23-assurance`; root manifests, lockfiles and `.github/workflows/**` — `00-foundation`.

**Serial-safety analysis.** This is the **first** decomposition (breakdown plan §1: phase 1,
`append: false`, `usedIds: []`, `existingFiles: ['.gitkeep']`): nothing is merged and no ticket is in
flight, so no prior ticket has written these paths and none contends for them. Under breakdown plan
**A1**, route areas self-register by directory convention, so adding
`apps/api/src/routes/answers/` produces **zero** diff to any file owned by `03-app-runtime` or by
another product module — that is the property that makes the sibling `routes/<area>/**` subtrees
disjoint by construction. Within this module the concurrent sibling is `ASK-06`
(`apps/web/src/features/ask/**`), a different tree entirely; every other `ASK` ticket is ordered after
this one by a `blocked_by` path. Per breakdown plan **A3**, **this ticket writes no table, no
migration and no repository** — all persistence is `packages/database`'s (`01-app-data`), reached
through `RUNT-02`'s `TenantContext`-scoped accessor. The only cross-module coupling is at the URL
level, and it is resolved by the sub-PRD's endpoint-ownership table, which `RUNT-01`'s boot-time
method+path collision check enforces mechanically.

## Deliverables

1. **`apps/api/src/routes/answers/index.ts`** — the route area. Default-exports the Fastify plugin and
   exports
   `export const area = { prefix: '/v1', admission: 'tenant' } satisfies RouteAreaConfig`
   (sub-PRD **D1**). It registers exactly four routes and no others (sub-PRD **D2**):
   `POST /answers`, `GET /answer-jobs/:jobId`, `GET /answer-jobs/:jobId/events`,
   `POST /answer-jobs/:jobId/cancel`. The parameter name is `:jobId` module-wide (sub-PRD **D3**).
2. **`apps/api/src/routes/answers/schema.ts`** — request and response schemas for all four routes,
   built from `packages/contracts` generated types (`FND-04`), matching PRD §34.3 **property for
   property**: `mode`, `question`, `facts.{free_text,employer_name,employer_abn,work_jurisdictions,engagement_type,employment_type,industry,principal_duties}`,
   `legal_as_at`, `jurisdictions`, `retention_mode`, `research_record_id`, `new_record`. Field rules
   from PRD §32.2 are enforced here so the API and the form agree: `question` 20–4,000 characters;
   `facts.free_text` 0–8,000 characters after normalisation; `legal_as_at` `YYYY-MM-DD`; jurisdictions
   from the controlled list `CTH|NSW|VIC|QLD|WA|SA|TAS|ACT|NT`; no attachment field exists at all.
   A future `legal_as_at` requires an explicit `confirm_future_date: true`, otherwise
   `400 INVALID_LEGAL_DATE`; an `employer_abn` failing the checksum returns `400 INVALID_ABN`
   (PRD §34.9).
3. **Route flags consumed by `RUNT-02`.** `POST /answers` declares `idempotent: true` and
   `requiresPiiAdmission: true`; the three `/answer-jobs/*` routes declare neither. This is the
   concrete expression of `PII-002` — *"Search can continue if PII service is unavailable; free-text
   research fails closed"* — for this surface (`EVID-03`).
4. **`apps/api/src/routes/answers/retention.ts`** — the PRD §34.3 retention contract as a single
   validator: for `SAVE`, exactly one of `research_record_id` or `new_record` (both present, or
   neither, is `400 INVALID_REQUEST` naming both fields); for `EPHEMERAL`, both absent. Exposes
   `resolveRetention(body): { mode: 'SAVE', recordRef } | { mode: 'EPHEMERAL' }`.
5. **`apps/api/src/routes/answers/clarification-gate.ts`** — the admission-time half of PRD §33.3.
   `detectDecisiveMissingFacts(input): ClarificationQuestion[]` returns **1–5** questions, each with
   `{ id: 'clq_…', question, affects: DecisionArea[], answer_type }` exactly as PRD §34.3 shows, where
   `affects` names the decision at risk (`WORKPLACE_RELATIONS_SYSTEM`, `JURISDICTION`,
   `APPLICABLE_AGREEMENT`, `APPLICABLE_AWARD`, `CLASSIFICATION`, `LEGAL_STATUS`,
   `MATERIAL_CONCLUSION` — PRD §33.3's list). The predicate itself is deterministic and, where
   `packages/domain` (`FND-10`, `FND-07`) already expresses a rule, calls it rather than restating it.
   Returning zero questions admits the job normally; returning 1–5 admits the job at status
   `WAITING_FOR_CLARIFICATION` and includes them in the `202` body. **It never converts a missing fact
   into an assumption** (PRD §33.3: *"'Unknown' … cannot be converted into a silent assumption"*).
6. **`apps/api/src/routes/answers/admission.ts`** — `export async function admitAnswerJob(deps,
   ctx, input): Promise<AdmittedJob>`, the whole ticket in one function, executed inside a single
   `withTenantTransaction` in this fixed order (sub-PRD **D5**, PRD §18.5 step 2):
   1. **Pin the release** — resolve the current active `corpus_release_id` **once**, before anything
      is written, and use that one value for the whole job (PRD §8.3, §36.2). If no compatible release
      is available, abort with `503 CORPUS_INCOMPATIBLE` and write nothing.
   2. **Create the record** — for `SAVE` with `new_record`, call `DATA-06`'s `createRecord(tx, ctx,
      spec)` **inside this transaction** (PRD §34.3). For `SAVE` with `research_record_id`, verify
      membership through the scoped repository; a record in another tenant returns the same
      `404 RESOURCE_NOT_FOUND` as an absent id (PRD §16.5).
   3. **Reserve credit** — call `EVID-08`'s reservation with the profile implied by `mode` and record
      `reserved_credits` plus the funding ledger (`FOUNDER_PLATFORM_BUDGET` or
      `CUSTOMER_PREPAID_OR_BYOK`, PRD §24.4). Insufficient quota or balance is
      `429 CREDIT_LIMIT_REACHED`; a tripped breaker is `503 GENERATION_UNAVAILABLE` (PRD §34.9,
      §42.6, `ANS-007`).
   4. **Create the job** — `DATA-05`'s `claimIdempotentJob` with `job_type`, `retention_mode`,
      `corpus_release_id`, the `idempotency_fingerprint` `RUNT-02` computed, and the initial status
      (`QUEUED`, or `WAITING_FOR_CLARIFICATION` when deliverable 5 returned questions).
   5. **Persist the content** — for `SAVE`, a sanitized `research_turn` through `DATA-06`; for
      `EPHEMERAL`, an opaque content reference through `DATA-08`'s ephemeral store, so no customer
      question or fact text enters `app.sqlite` (PRD §10.4, §37.3).
   6. **Write the outbox event** — in the same transaction (PRD §35.8 invariant 6).
   Nothing outside the transaction may observe partial state; the `202` is serialised only after
   commit.
7. **The `202` response** — exactly PRD §34.3's shape, including `status_url:
   "/v1/answer-jobs/{id}"` and `events_url: "/v1/answer-jobs/{id}/events"`, `schema_version`, and the
   `request_id` `RUNT-01` injects. When deliverable 5 produced questions, the same `202` additionally
   carries `status: "WAITING_FOR_CLARIFICATION"` and the `clarifications` array in PRD §34.3's shape.
8. **`GET /answer-jobs/:jobId`** — the job status read: id, type, status, `retention_mode`,
   `corpus_release_id`, `reserved_credits`, timestamps, `status_url`, `events_url`, and — when
   terminal and successful — the `answer_snapshot_id`. It returns **no** provider payload, prompt,
   reasoning, cost detail or evidence text. For an expired `EPHEMERAL` job it returns
   `410 EPHEMERAL_CONTENT_EXPIRED` (PRD §10.4, §34.9) while the safe status metadata remains readable
   per PRD §35.7 (*"`app.sqlite.job` retains only safe status/cost metadata after content expiry"*) —
   state which of the two applies per field in the schema.
9. **`GET /answer-jobs/:jobId/events`** — mounts `RUNT-03`'s `createSseHandler({ resolveJobId,
   authorise })`. `authorise` uses the scoped repository to confirm the caller may read this job and
   otherwise raises the same `404 RESOURCE_NOT_FOUND`; PRD §31.2 restricts the progress screen to the
   "initiating permitted user". This ticket writes no SSE framing, no replay logic and no event type.
10. **`POST /answer-jobs/:jobId/cancel`** — sub-PRD **D17**, PRD §33.2. Transitions the job to a
    cancelling/cancelled state through `DATA-05` and, **in one transaction**, either releases the full
    reservation (no paid provider execution has occurred) or leaves settlement of actual cost to
    `ASK-02` (provider execution already occurred). It never publishes a partial answer and never
    settles more than the reservation (PRD §35.8 invariant 2). Cancelling an already-terminal job is
    idempotent and returns the current state, not an error.
11. **`apps/api/src/routes/answers/errors.ts`** — the mapping from admission outcomes to
    `RUNT-01`'s typed `ApiError` factories, using **only** PRD §34.9 codes:
    `INVALID_REQUEST`, `INVALID_LEGAL_DATE`, `INVALID_ABN`, `RESOURCE_NOT_FOUND`,
    `IDEMPOTENCY_CONFLICT`, `EPHEMERAL_CONTENT_EXPIRED`, `EMPLOYEE_PII_DETECTED`, `RATE_LIMITED`,
    `CREDIT_LIMIT_REACHED`, `GENERATION_UNAVAILABLE`, `SOURCE_NOT_CURRENT`, `CORPUS_INCOMPATIBLE`.
    No new code is invented; a needed code that does not exist is a PRD §45.5 product/API change
    (see Feedback obligation). Domain answer statuses never become HTTP errors (PRD §34.9 closing
    paragraph).
12. **`apps/api/src/routes/answers/service.ts`** — re-exports `admitAnswerJob` and the retention and
    clarification helpers as this area's public surface so `ASK-08` and `ASK-11` can build their own
    admission on the identical transaction shape without copying it (sub-PRD **D7**). Anything not
    exported here is private to the area.

## Acceptance checklist (classified)

- [ ] `[machine]` `POST /v1/answers` accepts the literal PRD §34.3 request body and returns the literal
      PRD §34.3 `202` body, property for property including `status_url` and `events_url`
      (PRD §34.3; `ANS-001`)
- [ ] `[machine]` **Atomicity**: a forced failure injected at each of the six transaction steps leaves
      no `research_record`, no reservation, no `job`, no ephemeral row and no `outbox_event` — asserted
      once per step (PRD §18.5 step 2; §35.8 invariant 6)
- [ ] `[machine]` **`ANS-003` / `UAT-ANS-01`**: two identical submissions with the same actor, route,
      `Idempotency-Key` and body produce exactly **one** job, **one** reservation and two responses
      naming the same `job.id`; a changed body with the same key returns `409 IDEMPOTENCY_CONFLICT`
      (PRD §33.2, §34.1, §34.9)
- [ ] `[machine]` **`ANS-004`**: the job row carries exactly one `corpus_release_id`, resolved once;
      a test that swaps the active release mid-request still yields the originally pinned value
      (PRD §8.3, §18.5)
- [ ] `[machine]` `SAVE` with `new_record` creates the record and the job in one transaction, and a
      rollback leaves neither; `SAVE` with both `research_record_id` and `new_record`, or with
      neither, returns `400 INVALID_REQUEST` naming both fields; `EPHEMERAL` with either present is
      rejected (PRD §34.3)
- [ ] `[machine]` `EPHEMERAL` writes no question or fact text into `app.sqlite` — asserted with a
      distinctive canary string that must be absent from the raw `app.sqlite`/`-wal` bytes and present
      only in the ephemeral store (PRD §10.4, §37.3)
- [ ] `[machine]` A read of expired `EPHEMERAL` content returns `410 EPHEMERAL_CONTENT_EXPIRED`
      (PRD §10.4, §34.9)
- [ ] `[machine]` **`ANS-001` / `UAT-ANS-02`**: a request omitting a decisive fact returns `202` with
      `status: "WAITING_FOR_CLARIFICATION"` and **1–5** questions, each naming the decision it affects;
      zero questions and six questions are both unrepresentable; no assumption is written
      (PRD §33.3, §34.3)
- [ ] `[machine]` **`UAT-ANS-07`**: cancelling before any provider execution releases the **full**
      reservation and leaves the funding ledger balance exactly as it was before admission
      (PRD §33.2, §35.8 invariant 2)
- [ ] `[machine]` Cancelling after provider execution has been recorded settles actual cost only,
      publishes no snapshot, and never settles more than the reservation (PRD §33.2, §42.6)
- [ ] `[machine]` Cancelling an already-terminal job is idempotent and returns the current state
      (PRD §34.9 — no invented error code)
- [ ] `[machine]` **`ANS-007` / `UAT-ANS-08`**: with `EVID-08`'s breaker tripped, `POST /v1/answers`
      returns `429 CREDIT_LIMIT_REACHED` or `503 GENERATION_UNAVAILABLE`, no job is created, no
      reservation is taken, and no alternative provider or profile is attempted (PRD §17.3, §36.8,
      §42.6)
- [ ] `[machine]` **`PII-002`**: `POST /v1/answers` declares `requiresPiiAdmission` and is rejected —
      not admitted — when no PII provider is bound; a provider rejection surfaces
      `422 EMPLOYEE_PII_DETECTED` with field/range/category/placeholder and **not** the detected value,
      asserted with a canary that must be absent from the response bytes (PRD §37.2, §10.1; `EVID-03`)
- [ ] `[machine]` **Tenant isolation**: a `research_record_id` belonging to another organisation and an
      absent id return byte-identical `404 RESOURCE_NOT_FOUND` bodies apart from `request_id`
      (PRD §16.5; `UAT-AUTH-03`; breakdown plan R8 — co-located, not deferred to `ASSR-01`)
- [ ] `[machine]` `GET /v1/answer-jobs/{jobId}` returns no prompt, reasoning, provider payload or
      evidence text — asserted by injecting canary strings into the stored model/retrieval metadata and
      requiring their absence from the response bytes (PRD §16.2, §34.5, §22)
- [ ] `[machine]` `GET /v1/answer-jobs/{jobId}/events` is served by `RUNT-03`'s handler; a resume with
      `Last-Event-ID` yields every event exactly once, and this area contributes no event framing of
      its own (PRD §34.4; `ANS-003`)
- [ ] `[machine]` A future `legal_as_at` without explicit confirmation returns `400 INVALID_LEGAL_DATE`;
      an invalid `employer_abn` returns `400 INVALID_ABN` and consumes no quota event (PRD §34.9,
      §32.2; mirrors `UAT-SRCH-04`'s no-quota rule)
- [ ] `[machine]` Only the four method+path pairs in the sub-PRD ownership table are registered by this
      area — asserted against a literal list, so an accidental fifth route fails (`RUNT-01` collision
      contract; sub-PRD D2)
- [ ] `[machine]` **A3 guard**: no file under `apps/api/src/routes/answers/**` imports
      `packages/database/migrations`, a schema module or an unscoped connection — a source scan copying
      `RUNT-02`'s `apps/api/test/admission/architecture.test.ts` pattern (breakdown plan **A3**/**R4**;
      PRD §45.2, `SEC-001`)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — no generated OpenAPI binding was
      hand-edited (PRD §20.1; breakdown plan §1.1)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement ids (`ANS-001`, `ANS-003`, `ANS-004`) and
      UAT ids (`UAT-ANS-01`, `UAT-ANS-02`, `UAT-ANS-07`, `UAT-ANS-08`), user-visible change and
      non-goals, schema/API/event compatibility impact, tenant/PII/security and retention impact,
      cost/memory/latency impact, rollback path, known gaps
- [ ] `[fixture]` The admission path runs end to end against the signed synthetic `CRPS-08` fixture
      release for release pinning and against `EVID-07`'s recorded/stub provider for the reservation
      price — no network, no provider key (sub-PRD **D15**)
- [ ] `[human]` `UAT-ANS-01`, `UAT-ANS-07` and `UAT-ANS-08` rehearsed through the UI once `ASK-06` and
      `ASK-07` have merged (PRD §41.2) — **not required to merge this ticket**; the `[machine]` rows
      above are the merge gate. Gate 2 smoke test covers the same three scripts.
- [ ] No additional `[human]` criteria — this ticket ships no screen; PRD §41.1 universal UI acceptance
      belongs to `ASK-06`, `ASK-07`, `ASK-09` and `ASK-12`
- [ ] No `cargo test --workspace` / `uv run pytest` item — no Rust or Python is touched (PRD §45.3)

## Test plan

Reviewer steps, all reproducible offline with no network and no provider key.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/api` (the workspace filter `FND-01` established). Suites live under
   `apps/api/test/answers/`.
3. **Harness.** Fastify `inject()` (no listening socket), copying the construction pattern from
   `apps/api/test/admission/*` (`RUNT-02`) for a signed-in principal and from
   `apps/api/test/sse/replay.test.ts` (`RUNT-03`) for the stream. The database is a temp-file
   `app.sqlite` + `ephemeral.sqlite` migrated with `DATA-01`'s runner, seeded with `DATA-04`'s tenancy
   factories. The corpus release id comes from the committed `CRPS-08` fixture manifest; the budget
   provider is `EVID-08`'s in-memory test double.
4. **`contract.test.ts`** — post the literal PRD §34.3 request JSON; assert the response equals the
   literal PRD §34.3 `202` JSON with only ids, timestamps and `request_id` substituted. Then walk the
   PRD §32.2 field-rule table: 19-character and 4,001-character questions, an 8,001-character
   `free_text`, a jurisdiction outside the nine-value list, a future `legal_as_at` with and without
   confirmation, and a bad ABN checksum.
5. **`transaction.test.ts`** — a fault-injection wrapper around the transaction that throws at each of
   the six steps in turn. After each, assert every participating table is empty:
   `research_record`, `usage_ledger` reservation rows, `job`, the ephemeral store and `outbox_event`.
   Then run the happy path and assert all six wrote exactly once.
6. **`idempotency.test.ts`** — two sequential posts with the same key and body, then two **concurrent**
   posts from two `worker_threads` with the same key and body; assert exactly one `job` row, one
   reservation and identical `job.id` in both responses. Post again with a mutated body; assert
   `409 IDEMPOTENCY_CONFLICT`.
7. **`retention.test.ts`** — `SAVE`+`new_record`, `SAVE`+`research_record_id`, `SAVE` with both,
   `SAVE` with neither, `EPHEMERAL` with each field present. For the `EPHEMERAL` happy path, write a
   `pii-free-canary-<uuid>` inside `facts.free_text`, `PRAGMA wal_checkpoint(TRUNCATE)`, then read the
   raw `app.sqlite` and `app.sqlite-wal` bytes and assert the canary is absent; assert it is present in
   the ephemeral store; advance the clock past expiry and assert `410 EPHEMERAL_CONTENT_EXPIRED`.
8. **`clarification.test.ts`** — a request missing a decisive fact for each `affects` value; assert
   1–5 questions, each with a non-empty `affects`, and assert no `answer_assumption` or assumption-like
   row was written. A complete request returns no `clarifications` key at all.
9. **`cancel.test.ts`** — admit, read the ledger balance, cancel before any `model_execution` row
   exists, re-read the balance and assert it is exactly the pre-admission value. Then admit, insert a
   `model_execution` row through `DATA-05`, cancel, and assert actual cost is settled, no
   `answer_snapshot` exists, and settlement ≤ reservation. Cancel again and assert idempotency.
10. **`budget.test.ts`** — trip `EVID-08`'s breaker in the test double; assert the status code, that no
    job or reservation exists, and that the double records **no** provider selection attempt.
11. **`isolation.test.ts`** — the cross-tenant matrix over `research_record_id`, `jobId` (status,
    events, cancel); assert byte-identical 404 bodies apart from `request_id`.
12. **`routes.test.ts`** — boot the area through `RUNT-01`'s `registerRouteAreas` against a test root
    and assert `LoadedRouteArea` reports exactly the four method+path pairs from the sub-PRD table.
13. **`architecture.test.ts`** — source scan over `apps/api/src/routes/answers/**` asserting no import
    of `packages/database/migrations`, no schema module and no unscoped connection; copy the assertion
    shape from `RUNT-02`'s `apps/api/test/admission/architecture.test.ts` so the two stay recognisably
    the same.
14. Reviewer greps the diff for: any `CREATE TABLE`/`ALTER TABLE`, any file added under
    `packages/database/`, any provider SDK import, any error code outside PRD §34.9, and any second
    resolution of the active corpus release inside one request.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), then `docs/prd/15-answer-product/README.md`, then
`.claude/scripts/publish-tickets.mjs --sync`, and only then change code. Silent divergence is an
incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **A column or repository method needed by the transaction does not exist** (for example clarification
  rounds have nowhere to live — sub-PRD **Q-ASK-5**) → do **not** write
  `packages/database/**` or a migration. That is breakdown plan risk **R4** and PRD §44.3/§45.2
  forbid it. Record the requirement in `docs/prd/15-answer-product/README.md`'s open questions, raise a
  new ticket in `docs/prd/01-app-data/`, and add the `blocked_by` edge in
  `docs/prd/breakdown-plan.md` §5.16 and §6.2.
- **The four `/v1/answer-jobs/*` URLs cannot be registered from `routes/answers/**`** (for example
  `RUNT-01`'s prefix rule proves narrower than read here) → that is sub-PRD **Q-ASK-8**. Update
  `docs/prd/15-answer-product/README.md`'s endpoint-ownership table **and** `ASK-03`'s ticket in one
  docs PR, `--sync` both, and only then move code. Two tickets registering the same method+path is a
  boot failure, so this must never be resolved by "whichever lands first wins".
- **PRD §34.9 has no code for an outcome this route produces** → that is a **product/API change** under
  PRD §45.5, not an implementation detail. Do not invent a code. Raise it as an open question in
  `docs/prd/15-answer-product/README.md` with the Founder as owner and stop at the nearest existing
  code.
- **`packages/contracts` does not export the job-type, job-status or clarification `affects`
  vocabulary** → sub-PRD **Q-ASK-3**. Declare it locally, record the divergence in
  `docs/prd/15-answer-product/README.md`, and raise a `00-foundation` ticket. Never let a local enum
  become the de facto canonical one (PRD §35.1; breakdown plan §4.1).
- **`EVID-08`'s reservation API cannot be called inside the transaction** (for example it needs a
  network price lookup) → PRD §42.6 requires the reservation *before* the hosted call and PRD §42.6
  says *"If price or currency data is unavailable, new founder-funded calls fail closed."* Record the
  constraint in `docs/prd/15-answer-product/README.md` and coordinate a `12-evidence-safety` docs PR;
  do not admit a job with an unreserved cost.
- **Admission-time clarification cannot detect a decisive-fact class without retrieval** → sub-PRD
  **Q-ASK-6**. The mid-job round is already specified (`ASK-02` moves the job to
  `WAITING_FOR_CLARIFICATION`, `ASK-03` accepts the answers). Record which classes moved and why in
  `docs/prd/15-answer-product/README.md`; do not fill the gap with an assumption.

**3. Escalation.** Two properties here are the product's central invariants, not local design:
**one pinned CorpusRelease for the whole answer** (PRD §8.3) and **one observable answer with no
duplicate charge** (PRD §18.5). If either proves unimplementable as specified — for example if the
transaction cannot span record creation, reservation and job creation — that overturns PRD §18.5 and
§34.3, both customer-facing promises, and it is the mechanism by which an unvalidated or double-charged
result could reach a user. Stop, escalate for re-review through the PRD §45.5 product-change path, and
record the outcome in `docs/prd/breakdown-plan.md` §2.1 (**A3** depends on this transaction shape) plus
a new `docs/adr/NNNN-answer-admission-transaction.md`. Never relax the transaction boundary as a local
convenience.
