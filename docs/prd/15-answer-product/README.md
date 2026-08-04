# 15-answer-product — sub-PRD

> Module sub-PRD. Authored from `docs/prd/breakdown-plan.md` §5.16 (wave B). The **tickets** under
> `tickets/` are the executable source of truth; this file is the module's shared context. On any
> disagreement between a ticket and this file, the ticket wins (CLAUDE.md, issue #53).

| Field | Value |
|---|---|
| Module | `15-answer-product` |
| Lane | `15-answer-product` |
| Ticket prefix | `ASK` |
| Tickets | 12 (`ASK-01` … `ASK-12`) |
| PRD epics | `E21` (Quick Answer), `E22` (Coverage Navigator), `E23` (Deep Research + Compare) |
| Requirement families | `ANS-001` … `ANS-007`, `COV-001` … `COV-004`, `CMP-001`/`CMP-002` |
| Depends on modules | `01-app-data`, `03-app-runtime`, `07-sources-instruments`, `11-retrieval-engine`, `12-evidence-safety` |
| Modules that depend on this one | `17-records-collab`, `20-developer-platform`, `21-evaluation-600`, `23-assurance` |
| Languages | TypeScript only (`apps/api`, `apps/worker`, `apps/web`) |
| Master spec | [`docs/PRD.md`](../../PRD.md) |
| Version | v0.2 (2026-08-03) |

## Problem

This module is where the product's central promise is either kept or broken. PRD §2 says the system
is safer than a general chatbot "by enforcing legal-date and jurisdiction filters, immutable source
versions, claim-level citations, deterministic citation validation, visible uncertainty and refusal
when evidence is insufficient". `11-retrieval-engine` decides *which* evidence exists and
`12-evidence-safety` decides *whether a claim survives validation*; this module decides **what is
admitted, in what order it runs, what the customer is charged, what is persisted, and what the
customer sees**. An unvalidated claim reaching a customer screen is a defect here even when every
other module behaved correctly.

Four pressures make it a module of its own.

1. **Admission is a transaction, not a request handler.** PRD §18.5 step 2: *"One transaction
   reserves credits, creates the job plus either a sanitized saved turn or an opaque ephemeral-content
   reference, pins a CorpusRelease and writes an outbox event."* PRD §34.3 adds: *"Creating a record
   and admitting the job occur in the same transaction."* PRD §18.5 closes with the invariant that
   makes the product billable: *"At-least-once execution plus idempotency and immutable unique results
   MUST provide one observable answer and no duplicate charge."*
2. **The generation sequence is fixed and non-negotiable.** PRD §9.4: *"The generation sequence MUST
   be: `retrieve → evidence pack → structured claims → deterministic validation → render → final
   status check`. The model may cite only system-supplied evidence IDs. Code MUST create source
   titles, links, pinpoints and status badges."* Every workflow in this module — Quick, Deep, Coverage
   and Compare — is that same sequence with different bounds, so it is written once and reused.
3. **Three of the four workflows have explicit anti-fabrication rules.** PRD §8.5: *"Job title alone
   MUST NOT determine classification. Multiple candidates MUST remain visible when evidence cannot
   select one."* PRD §8.6: *"An evidence failure in one dimension MUST NOT cause fabricated symmetry
   in other dimensions."* PRD §8.3: Deep Research *"MUST NOT recurse indefinitely, browse unapproved
   sources, change scope or exceed explicit cost/time ceilings."* These are structural requirements,
   not prompt instructions.
4. **The vertical cut is what makes it safe to build in parallel.** Breakdown plan §2 puts each
   product surface in its own `routes/<area>/**`, `handlers/<area>/**` and `features/<area>/**`
   subtree, registered by directory convention (**A1**). Breakdown plan **A3** removes the otherwise
   real `15` ↔ `17` module cycle: *"`packages/database` owns every app table and repository; product
   modules own routes/handlers/screens only."* PRD §34.3 puts record creation inside the answer
   admission transaction and `17-records-collab` displays answers — without A3 the two modules would
   import each other.

## Scope

In scope — exactly the module's breakdown plan §4 write-owns row:

- `apps/api/src/routes/{answers,answer-jobs,answer-snapshots,coverage-assessments,comparisons}/**` —
  the HTTP surface: answer-job admission, job status/events/cancel, clarification submission, the
  immutable snapshot read and rerun, and the coverage/compare admission and read endpoints.
- `apps/worker/src/handlers/{answer,deep,coverage,comparison}/**` — the four job handlers: the Quick
  `retrieve → pack → gateway → validate → commit` pipeline, its SSE stage events, the bounded Deep
  Research workflow, the seven-stage Coverage Navigator and the per-dimension Compare workflow.
- `apps/web/src/features/{ask,answers,coverage,compare}/**` — the Ask form, the answer progress and
  result screens, the Coverage Navigator screens and the Compare screens.

Out of scope in one line: **this module orchestrates, admits and renders; it never writes a table,
never ranks a candidate, never calls a provider directly and never decides whether a claim is
supported.**

## Non-goals

Each names its owner module/ticket or its standing reason.

| Not in this module | Owner / reason |
|---|---|
| Every app table, migration and repository — `job`, `job_event`, `outbox_event`, `answer_snapshot`, `answer_claim`, `claim_citation`, `answer_assumption`, `coverage_assessment`, `comparison_snapshot`, `usage_ledger`, `model_execution`, `retrieval_run`, `research_record`, `research_turn` | `01-app-data` (`DATA-05`, `DATA-06`, `DATA-07`, `DATA-08`, `packages/jobs`). Breakdown plan **A3** and risk **R4**; PRD §45.2 gives `packages/database` exactly this scope and PRD §44.3 makes app migration order serial-owned. A missing column is a **new `01-app-data` ticket plus a `blocked_by` edge**, never a local migration. |
| The Fastify bootstrap, route autoload contract, uniform errors, `request_id`, the admission middleware chain, the SSE transport and the worker runtime | `03-app-runtime` (`RUNT-01` … `RUNT-04`). This module registers route areas and handler areas **against** those contracts and adds no middleware of its own. |
| The web shell, navigation slots, organisation switcher and `packages/ui` primitives, async-state view and evidence panel | `03-app-runtime` (`RUNT-05`, `RUNT-06`). Breakdown plan **A6**: the evidence panel is one shared component in three surfaces; screens here consume it. |
| PII detection and the admission PII boundary | `12-evidence-safety` (`EVID-01` … `EVID-03`). PRD §37.2 makes it a server-side admission stage bound into `RUNT-02`'s chain; this module declares `requiresPiiAdmission` on its free-text routes and never re-implements detection. |
| Evidence-pack construction, untrusted-content delimitation, the deterministic validator and bounded repair, licence quote limits, output sanitisation | `12-evidence-safety` (`EVID-04`, `EVID-05`, `EVID-06`, `EVID-10`). PRD §45.2: `packages/citations` owns "Evidence/claim deterministic validation". |
| Model profiles, provider adapters, schema enforcement, budget reservation/settlement, the circuit breaker and BYOK | `12-evidence-safety` (`EVID-07` … `EVID-09`). PRD §37.5: *"The model gateway exposes no shell, Web, database, email, webhook or arbitrary tool."* |
| Retrieval, ranking, hard filters and evidence-pack candidate assembly | `11-retrieval-engine` (`RETR-01` … `RETR-10`). This module calls `packages/retrieval-client` (`RETR-09`) and never opens a corpus file. |
| The answer status / claim support / citation role / refusal decision table, the permission matrix, budget arithmetic, the §36.2 eligibility predicate and the record workflow state machine | `00-foundation` (`FND-06` … `FND-10`) in `packages/domain`. PRD §45.2 forbids duplicated business rules in `apps/*`; breakdown plan risk **R5**. |
| `POST /v1/search` and the document/version/node endpoints and screens | `14-search-product` (`FIND-01` … `FIND-06`). |
| Research Records CRUD, immutable turns, review actions, comments, issue reports, corrections, the record screens, and the **worker rerun handler and version diff** | `17-records-collab` (`RCRD-01` … `RCRD-09`). `RCRD-03` is `blocked_by ASK-04`: this module owns `POST /v1/answers/{id}/rerun` as job admission; `17` owns `apps/worker/src/handlers/rerun/**` and the diff. |
| Watchlists, alerts and the `REVIEW_REQUIRED` marking of affected records | `16-monitor-alerts` (`WTCH-01` … `WTCH-08`). |
| Exports of answers, coverage assessments and comparisons | `19-exports` (`XPRT-01` … `XPRT-05`). PRD §8.9: exports *"MUST NOT regenerate the answer using current law"*. |
| The widget loader and SDKs | `20-developer-platform` (`PLTF-02`, `PLTF-03`, `PLTF-05`, which is `blocked_by ASK-01`). PRD §33.5 step 5: the widget calls *"the same `/v1` admission, PII, evidence and quota pipeline as Web/API; no bypass exists."* |
| The 600 evaluation cases, the runner, metrics and release gates | `21-evaluation-600` (`GOLD-02` is `blocked_by ASK-02`). Per breakdown plan **R9** and PRD §14.3, nothing in this module reads `evals/gold/**`. |
| Cross-boundary suites under `tests/**` | `23-assurance` (`ASSR-03` … `ASSR-06`). Unit/integration tests for this module live inside `apps/api`, `apps/worker` and `apps/web` (breakdown plan §1.1). |
| Choosing the hosted model per profile, the embedding model, and the always-hot vector count and semantic-cache limits | Decided by measurement, never here (PRD §1, §14.4; breakdown plan §8). **Q1** (hosted model per profile) and **Q2** (embedding model and representation) are *benchmark-selected* and resolved through `GOLD-15`; **Q3** (always-hot vector count, semantic-cache entry/byte limit, resident memory allocation, cold/hot tier boundary) is *deferred until real-scale measurement* and resolved by `RLSE-11` against the real 2 GB benchmark, its governing coverage policy already settled. This module builds against `EVID-07`'s profile abstraction and a stub provider, and consumes whatever profile is promoted. |

## Decisions

Each decision states its basis: a PRD section, a breakdown plan §2.1 ADR candidate, or a sibling
ticket's published contract. Where the PRD does not answer, the item is an open question below, not a
decision.

| # | Decision | Basis |
|---|---|---|
| D1 | **Every route area in this module declares `area.prefix: '/v1'` and registers full PRD §16.2 sub-paths.** The directory name is the *ownership* unit (breakdown plan §4), not the URL segment: `apps/api/src/routes/answers/**` serves `POST /v1/answers` **and** `/v1/answer-jobs/*`, and `apps/api/src/routes/answer-snapshots/**` serves `/v1/answers/{id}`. | PRD §16.2 groups these endpoints under path prefixes that do not match the plan's directory names, and `RUNT-01`'s contract gives one prefix per area with an explicit `area.prefix` override. `RUNT-01` item 4: collision detection is on **method + path**, so two areas may share a prefix while owning different concrete routes. |
| D2 | **Endpoint ownership is fixed by the table in "Endpoint and screen ownership" below.** No ticket registers a method+path assigned to another ticket. | `RUNT-01` item 4: *"If two areas would register the same method+path, boot fails with an error naming both areas and the path. Last-wins is forbidden."* A duplicate is a boot failure, not a merge conflict — so the split must be decided here, once. |
| D3 | **Path parameter names are fixed module-wide**: `:jobId`, `:answerSnapshotId`, `:assessmentId`, `:comparisonSnapshotId`. | Fastify keeps one radix tree across plugin scopes; two areas declaring different parameter names at the same path position fail at registration. Three tickets register siblings under `/v1/answer-jobs/` (`ASK-01`, `ASK-03`) and `/v1/answers/` (`ASK-01`, `ASK-04`), so the names cannot be a per-ticket choice. |
| D4 | **No ticket in this module writes a table, a migration or a repository.** Every read and write goes through `DATA-05`/`DATA-06`/`DATA-07`/`DATA-08` repositories and `packages/jobs`, obtained from `RUNT-02`'s `TenantContext`-scoped accessor (API) or `RUNT-04`'s `JobContext.tenant` (worker). | Breakdown plan **A3**; PRD §45.2 (`packages/database` owns "app schema/migrations/tenant repositories/outbox/encryption"; `apps/worker` must not own "Direct unscoped tenant SQL"); PRD §44.3 (app migration order is serial-owned); breakdown plan risk **R4**. |
| D5 | **The answer-admission transaction is exactly one `withTenantTransaction` performing, in order: (1) resolve and pin one `corpus_release_id`; (2) create the `ResearchRecord` if `new_record` was supplied; (3) reserve credit on the funding ledger; (4) create the job with its idempotency fingerprint; (5) write the sanitized saved turn (`SAVE`) or the opaque ephemeral-content reference (`EPHEMERAL`); (6) write the outbox event.** Nothing is emitted to the client until it commits. | PRD §18.5 step 2 verbatim; PRD §34.3 *"Creating a record and admitting the job occur in the same transaction"*; PRD §35.8 invariant 2 (*"A job cannot settle more cost than its reservation"*) and invariant 6 (*"Outbox event and corresponding business state commit in one transaction"*). |
| D6 | **One pinned CorpusRelease per answer, resolved once at admission and propagated unchanged to every retrieval call, every Deep subquestion, every Coverage stage and every Compare dimension.** A worker that cannot obtain the pinned release fails the job; it never substitutes the current active release. | PRD §8.3 *"preserve a single pinned CorpusRelease for the entire answer"*; PRD §36.2 eligibility conjunct 5 *"version and node belong to the pinned CorpusRelease"*; PRD §18.4 *"Old releases cannot be removed while jobs remain pinned"*; `RETR-01` D3 (release pinning is explicit and refusal-based). |
| D7 | **The PRD §9.4 pipeline is written once, in `apps/worker/src/handlers/answer/pipeline/**` (`ASK-02`), and imported — never copied — by `handlers/deep`, `handlers/coverage` and `handlers/comparison`.** All three are `blocked_by ASK-02`, so the import direction is always toward the earlier ticket. | PRD §9.4 fixes one sequence for every generated result; PRD §45.2 forbids duplicated business rules. Copying it into four directories would make a §36.6 validator change a four-way edit. |
| D8 | **This module never calls a model provider and never decides claim support.** It calls `packages/model-gateway` (`EVID-07`) with a named profile and `packages/citations` (`EVID-05`) for validation, and consumes their verdicts. The `INSUFFICIENT_EVIDENCE` / `CONFLICTING_SOURCES` downgrade is applied by acting on the validator's output, using `packages/domain/src/answers` (`FND-07`) for the status decision. | PRD §9.4; PRD §36.6; PRD §45.2 (`packages/citations` owns validation; `packages/model-gateway` owns approved profiles); PRD §17.3 *"No unvalidated fallback is permitted during provider failure or budget exhaustion."* |
| D9 | **Deep Research bounds are versioned configuration with the PRD §36.7 "Deep initial default" column as v1 values and the stated caps enforced in code.** Reaching any bound is a **stop condition producing a completed answer with a stated limitation**, never a retry or a scope change. | PRD §17.4 *"Configuration MUST cap subquestions, retrieval rounds, candidates, hosted calls, tokens, cost and elapsed time"*; PRD §36.7 (≤4 subquestions, ≤2 retrieval rounds, ≤3 hosted synthesis calls + optional repair, 180 s hard elapsed, concurrency 1); PRD §8.3 *"MUST NOT recurse indefinitely, browse unapproved sources, change scope or exceed explicit cost/time ceilings."* |
| D10 | **The Coverage Navigator's seven stages are data, not control flow**: a frozen ordered tuple derived from PRD §8.5, persisted with the assessment, with each stage's inputs restricted to the outputs of the stages before it. A classification candidate carries the facts it was derived from, so "job title only" is representable as an input and can never produce `CONFIRMED_FROM_STATED_FACTS`. | PRD §8.5 order and candidate-status list; `COV-001` *"Stage order is persisted and shown"*; `COV-002` *"Job-title-only test returns candidates/missing facts"*; `COV-004` *"Negative conclusion without qualifying evidence fails validation."* |
| D11 | **Compare dimensions are independent executions.** Each dimension runs its own §36.2 hard filters, its own retrieval, its own evidence pack and its own validation against its own legal date and jurisdiction set. A dimension that fails yields an explicit unavailable column; no claim, citation or value is ever inferred from a sibling dimension. | PRD §8.6 *"Each dimension MUST run its own date, jurisdiction and status filtering and MUST have its own claims/citations … An evidence failure in one dimension MUST NOT cause fabricated symmetry in other dimensions"*; PRD §32.5 *"a synthesis that never hides a missing column"*; `CMP-002`. |
| D12 | **`EPHEMERAL` content is written only through `DATA-08`'s ephemeral store and every read after expiry returns `410 EPHEMERAL_CONTENT_EXPIRED`.** `SAVE` requires exactly one of `research_record_id` or `new_record`; `EPHEMERAL` requires both absent. | PRD §10.4 (one hour after terminal state, never later than 24 hours; *"After expiry return `410 EPHEMERAL_CONTENT_EXPIRED`"*); PRD §34.3; PRD §37.3 content-retention matrix; PRD §34.9. |
| D13 | **Screens are `RUNT-05` feature areas.** `ask` claims nav slot `ASK`, `coverage` claims `COVERAGE`, `compare` claims `COMPARE`; `answers` registers routes with **no** nav slot (PRD §31.2 lists `/answer-jobs/:jobId` and `/answers/:snapshotId` as non-nav destinations). Every organisation-scoped cache key is produced by `orgScopedKey(...)` and every feature implements `onOrganizationChange`. | `RUNT-05`'s A1 web contract items 1–5; PRD §31.1 slot order and *"Switching organisation clears unsaved forms and all organisation-scoped client caches."* |
| D14 | **Every job-driven screen in this module renders its lifecycle through `packages/ui`'s `JobStateView` and its evidence through `EvidencePanel`.** No screen here re-implements an async state, a status badge, a Markdown renderer or a claim↔citation interaction. | Breakdown plan **A6**; PRD §31.3 (ten mandatory states; *"A spinner without state or recovery guidance is not acceptable"*); PRD §32.1/§32.3/§32.4; `RUNT-06` deliverables 2–7. |
| D15 | **No test in this module may require a live model provider or network.** Hosted calls are exercised through `EVID-07`'s stub/recorded provider and retrieval through the signed synthetic `CRPS-08` fixture release. | Breakdown plan §1.1 acceptance-tag mapping; PRD §20.3 CI gates run offline; PRD §45.1 item 6 (no production credentials or customer content in agent context). |
| D16 | **`ASK-02` creates `apps/worker/src/handlers/answer/events/index.ts` as a minimal terminal-event emitter and hands the whole `events/**` subtree to `ASK-05`, which is its sole owner thereafter.** The import specifier in `handlers/answer/index.ts` (`'./events'`) never changes, so `ASK-05` writes nothing outside `events/**`. | `ASK-05.blocked_by = [ASK-02]` makes the two tickets strictly ordered, and breakdown plan §2's safety property is about **concurrently running** tickets never writing the same path. `ASK-02` must be green on its own, so it cannot import a file that does not exist yet. |
| D17 | **Cancellation semantics live with the reservation.** `POST /v1/answer-jobs/{jobId}/cancel` is `ASK-01`'s, because releasing the reservation is the inverse of the admission transaction: cancellation before paid provider execution releases the **full** reservation; cancellation after it settles actual cost and publishes **no** partial supported answer. | PRD §33.2 *"Cancellation before paid provider execution releases the full reservation. Cancellation after provider execution records actual cost but never publishes a partial supported answer."*; PRD §42.5 *"Cancel safely at stage boundary; settle actual cost only."* |
| D18 | **`job.completed` is emitted only after the commit transaction, and every SSE event is persisted before it is written to the wire.** `answer.section` is provisional until `job.completed` and is removed by the client on failure. | PRD §18.5 steps 6–7; PRD §34.4 *"Events are stored before emission"* and *"`answer.section` is provisional UI content until `job.completed`; clients MUST remove it on failure and MUST not represent it as a validated answer."* |
| D19 | **Prohibited language is enforced in code, not prompts.** The words "definitely compliant", "guaranteed", "zero risk" and numeric model-confidence percentages are rejected at the commit boundary; uncertainty is carried only by status, assumptions, missing facts, conflicts and evidence roles. | PRD §36.8 closing paragraph. The check belongs to `FND-07`/`EVID-05` where those own it; this module refuses to commit a snapshot that fails it. |
| D20 | **Tests for this module live inside `apps/api/test/**`, `apps/worker/test/**` and `apps/web/test/**`, namespaced by the owning ticket's area.** No ticket here writes `tests/**`. | Breakdown plan §1.1 ("Tests"); PRD §20.1 reserves `tests/{integration,tenant-isolation,security,e2e}` for `23-assurance`. |

### Endpoint and screen ownership

The load-bearing consequence of D1–D3. `RUNT-01` fails boot on a duplicate method+path, so this table
is normative for every ticket in the module.

| Method + path | Ticket | Route area directory | PRD basis |
|---|---|---|---|
| `POST /v1/answers` | `ASK-01` | `routes/answers/**` | §16.2, §34.3 |
| `GET /v1/answer-jobs/{jobId}` | `ASK-01` | `routes/answers/**` | §16.2; §34.3 `status_url` |
| `GET /v1/answer-jobs/{jobId}/events` | `ASK-01` | `routes/answers/**` | §16.2, §34.4; §34.3 `events_url` |
| `POST /v1/answer-jobs/{jobId}/cancel` | `ASK-01` | `routes/answers/**` | §16.2, §33.2 (D17) |
| `POST /v1/answer-jobs/{jobId}/clarifications` | `ASK-03` | `routes/answer-jobs/**` | §34.3, §33.3 |
| `GET /v1/answers/{answerSnapshotId}` | `ASK-04` | `routes/answer-snapshots/**` | §16.2, §34.5 |
| `POST /v1/answers/{answerSnapshotId}/rerun` | `ASK-04` | `routes/answer-snapshots/**` | §16.2, `REC-002` |
| `POST /v1/coverage-assessments` | `ASK-08` | `routes/coverage-assessments/**` | §16.2, §34.6 |
| `GET /v1/coverage-assessment-jobs/{jobId}` | `ASK-08` | `routes/coverage-assessments/**` | §16.2 |
| `GET /v1/coverage-assessments/{assessmentId}` | `ASK-08` | `routes/coverage-assessments/**` | §31.2 `/coverage/:assessmentId`, §34.6 (open question **Q-ASK-1**) |
| `POST /v1/comparisons` | `ASK-11` | `routes/comparisons/**` | §16.2, §34.6 |
| `GET /v1/comparison-jobs/{jobId}` | `ASK-11` | `routes/comparisons/**` | §16.2 |
| `GET /v1/comparisons/{comparisonSnapshotId}` | `ASK-11` | `routes/comparisons/**` | §31.2 `/comparisons/:snapshotId` (open question **Q-ASK-2**) |

| Worker handler area | Ticket | Job type (`FND-03` enum) | PRD §39.5 queue class |
|---|---|---|---|
| `handlers/answer/**` | `ASK-02` (+ `ASK-05` for `events/**`) | `ANSWER_QUICK` | `interactive_quick` |
| `handlers/deep/**` | `ASK-10` | `ANSWER_DEEP` | `interactive_research` |
| `handlers/coverage/**` | `ASK-08` | `COVERAGE_ASSESSMENT` | `interactive_research` |
| `handlers/comparison/**` | `ASK-11` | `COMPARISON` | `interactive_research` |

| Web feature area | Ticket | Routes (PRD §31.2) | Nav slot (PRD §31.1) |
|---|---|---|---|
| `features/ask/**` | `ASK-06` | `/ask` | `ASK` |
| `features/answers/**` | `ASK-07` | `/answer-jobs/:jobId`, `/answers/:snapshotId` | none |
| `features/coverage/**` | `ASK-09` | `/coverage/new`, `/coverage/:assessmentId` | `COVERAGE` |
| `features/compare/**` | `ASK-12` | `/compare/new`, `/comparisons/:snapshotId` | `COMPARE` |

## Rejected alternatives

| Rejected | Why |
|---|---|
| **This module owns its own tables and migrations** (an `answers` schema next to its routes). | Breakdown plan **A3** exists precisely to remove the `15` ↔ `17` cycle; PRD §45.2 gives `packages/database` "app schema/migrations/tenant repositories" and PRD §44.3 makes app migration order serial-owned. Breakdown plan **R4** names this the expected pressure point and fixes the remedy: a new `01-app-data` ticket plus a `blocked_by` edge. |
| **One "build the answer product" ticket.** | The module would be one serial lane; breakdown plan §2 makes disjoint write-sets the basis of the cut and §7 requires every module to reach at least two useful lanes. The 12-way split reaches 5 waves at concurrency 4. |
| **Charge at completion instead of reserving at admission.** | PRD §42.6: *"Before a hosted call the gateway computes a conservative reservation … Admission requires both operation quota and funding-ledger balance."* PRD §24.4 forbids "unsecured founder liability". Charging late means the A$50 ceiling can be exceeded before anyone notices. |
| **Emit `job.completed` (or the snapshot id) before the commit transaction.** | PRD §18.5 step 7: *"`job.completed` is emitted only after commit."* A client that fetches a snapshot id which is then rolled back sees an answer that does not exist. |
| **Let the model produce citations, source titles, official URLs or the final status.** | PRD §9.4: *"The model may cite only system-supplied evidence IDs. Code MUST create source titles, links, pinpoints and status badges."* PRD §36.6: *"URL is code-generated official URL — Replace model URL; reject unknown URL."* |
| **Stream reasoning tokens as progress so the UI feels fast.** | PRD §9.4: *"Hidden chain-of-thought MUST NOT be requested, stored or displayed."* PRD §16.2: SSE events *"MUST NOT contain hidden reasoning or raw provider payloads."* PRD §32.3 fixes user-readable stage names instead. |
| **Deep Research as an open-ended agent loop with tool access and its own browsing.** | PRD §8.3: *"MUST NOT recurse indefinitely, browse unapproved sources, change scope or exceed explicit cost/time ceilings."* PRD §37.5: the gateway *"exposes no shell, Web, database, email, webhook or arbitrary tool."* Replaced by D9's fixed stage list and caps. |
| **Let Deep retry a failed subquestion until it succeeds.** | PRD §36.7: *"Deep may run parallel retrieval branches but gets only **one** bounded gap/conflict follow-up. It stops immediately on decisive missing facts, unsupported source coverage, stale material that could change the outcome, hard budget, timeout or unresolved authoritative conflict."* |
| **Infer a classification from job title plus industry when no award clause matches.** | PRD §8.5: *"Job title alone MUST NOT determine classification. Multiple candidates MUST remain visible when evidence cannot select one."* `UAT-COV-01` tests exactly this. |
| **Conclude "award-free" when retrieval returns nothing.** | PRD §8.5: *"`Award-free`, `agreement not applicable` and exclusion conclusions require pinpoint evidence."* `COV-004`; `UAT-COV-03`. Absence of evidence is `INSUFFICIENT_EVIDENCE`, not a negative finding. |
| **Fill a failed Compare column by mirroring the successful one, or hide the column.** | PRD §8.6 and PRD §32.5 *"a synthesis that never hides a missing column"*; `CMP-002`; `UAT-CMP-02`. |
| **Update an existing `answer_snapshot` on rerun.** | PRD §35.8 invariant 5 (*"Formal snapshots … have no UPDATE/DELETE application path"*); `REC-002` evidence *"Original legal date/release/output are unchanged"*; `UAT-REC-01`. Rerun creates a new job, a new snapshot and a new `answer_version`. |
| **Fall back to a non-approved model when the primary provider fails or budget is exhausted.** | PRD §17.3: *"No unvalidated fallback is permitted during provider failure or budget exhaustion."* `ANS-007`. The correct behaviour is `503 GENERATION_UNAVAILABLE` with Search still available (`UAT-ANS-08`). |
| **Screens implementing their own loading/error states or their own evidence panel.** | Breakdown plan **A6**; PRD §31.3's ten states are mandatory on *every* job-driven screen and `RUNT-06` ships them once. |
| **Publishing this module's request/response shapes in `schemas/openapi/**`.** | That root is `FND-04`'s serial-owned artifact (breakdown plan §4.1). This module implements the generated types and, when a shape is missing, raises a `00-foundation` ticket. |
| **A shared "answers" barrel module in `packages/` for the four workflows.** | It would be a new package outside every module's §4 write-owns row. D7 puts the shared pipeline in `handlers/answer/pipeline/**`, already owned by `ASK-02`, with the `blocked_by` edges that make the import direction safe. |

## Open questions

None blocks the module's first wave. Each names an owner and the artifact that resolves it.

Two breakdown plan §8 register entries are carried here — **Q1** and **Q4**. Both are
*benchmark-selected* parameters: each is settled by measured evidence through its named ticket rather
than by preference, neither is a Founder decision waiting to be taken, and neither blocks anything this
module builds. `Q-ASK-1` … `Q-ASK-8` are the module's own questions and remain open as authored.

| # | Question | Owner | Resolved by | Blocks | Basis |
|---|---|---|---|---|---|
| **Q-ASK-1** | **The coverage-assessment result read endpoint is not literally in PRD §16.2.** §16.2 lists only `POST /v1/coverage-assessments` and `GET /v1/coverage-assessment-jobs/{job_id}`, but PRD §31.2 requires a `/coverage/:assessmentId` screen for "authorised record members" and §34.6 says the completed snapshot carries stage-specific claims/citations/assumptions/gaps. This module adopts `GET /v1/coverage-assessments/{assessmentId}`. | `15-answer-product` (`ASK-08`) with `00-foundation` (`FND-04`, OpenAPI root owner) | `ASK-08`; a different path is a docs PR against `ASK-08` **and** a `FND-04` ticket, then `publish-tickets.mjs --sync` | Nothing — the screen (`ASK-09`) is `blocked_by ASK-08` | PRD §16.2, §31.2, §34.6, §45.5 |
| **Q-ASK-2** | Same question for the comparison result read: §16.2 lists `POST /v1/comparisons` and `GET /v1/comparison-jobs/{job_id}`; §31.2 requires `/comparisons/:snapshotId`. This module adopts `GET /v1/comparisons/{comparisonSnapshotId}`. | `15-answer-product` (`ASK-11`) with `00-foundation` (`FND-04`) | `ASK-11` | Nothing — `ASK-12` is `blocked_by ASK-11` | PRD §16.2, §31.2, §34.6 |
| **Q-ASK-3** | **The canonical job-type and public stage vocabularies are `FND-03`'s, not this module's.** `ANSWER_QUICK`, `ANSWER_DEEP`, `COVERAGE_ASSESSMENT`, `COMPARISON` and the six PRD §32.3 stage names must come from `packages/contracts`. If `FND-03` does not export them, the ticket declares them locally **and writes back**. | `00-foundation` (`FND-03`) | The first ticket that needs a missing value raises a `00-foundation` ticket; the local declaration is recorded here as a temporary divergence | Nothing — the values are fixed by PRD §32.3/§39.5 either way | PRD §35.1, §32.3, §39.5; breakdown plan §4.1 |
| **Q-ASK-4** | **Where the rerun job is executed.** `ASK-04` owns `POST /v1/answers/{id}/rerun` (admission); `RCRD-03` owns `apps/worker/src/handlers/rerun/**` and the version diff, and is `blocked_by ASK-04`. The rerun job type and payload shape must satisfy both. | `15-answer-product` (`ASK-04`) with `17-records-collab` (`RCRD-03`) | `ASK-04` freezes the job type and payload; a `RCRD-03` requirement it cannot express is a docs PR against `ASK-04` | Nothing before `RCRD-03` | PRD §8.7, §16.2, `REC-002`; breakdown plan §5.16/§5.18 |
| **Q-ASK-5** | **Clarification rounds have no table in PRD §35.5.** The 1–5 questions, the round number and the user's answers must persist somewhere — the `job` row's safe payload, a `research_turn` of type `FACT_CLARIFICATION` (PRD §34.7), or a `DATA-05` column that does not exist yet. | `01-app-data` (`DATA-05`/`DATA-06`) with `15-answer-product` (`ASK-03`) | `ASK-03` uses the existing repositories; a missing column is a **new `01-app-data` ticket plus a `blocked_by` edge** (breakdown plan **R4**), never a local migration | `ASK-03` only | PRD §33.3, §34.3, §34.7, §35.5, §35.6; breakdown plan **A3**, **R4** |
| **Q-ASK-6** | **Can admission-time clarification satisfy `UAT-ANS-02` for every decisive-fact class**, or does some class require a retrieval round before the missing fact is knowable? PRD §34.3 returns clarifications at `202` from `POST /v1/answers`; PRD §33.3 describes the job "moving to" `WAITING_FOR_CLARIFICATION`, which permits a mid-job round. This module supports **both** entry points. | `15-answer-product` (`ASK-02`/`ASK-03`); any customer-visible change is the **Founder**'s under PRD §45.5 | `ASK-03`, confirmed by `UAT-ANS-02` in `ASSR-06` | Nothing — both paths are specified | PRD §33.3, §34.3, `ANS-001`, §41.2 `UAT-ANS-02` |
| **Q-ASK-7** | **Deep Research cost and elapsed-time ceilings beyond PRD §36.7's initial defaults.** §36.7 gives 180 s hard elapsed and ≤3 hosted calls but no A$ figure; PRD §24.1's A$50 monthly ceiling is the only hard money bound. | `21-evaluation-600` (`GOLD-15`) and `18-ops-release` (`RLSE-11`) measure; `12-evidence-safety` (`EVID-08`) owns the breaker | `ASK-10` ships §36.7's values as versioned config and reads the per-run ceiling from `EVID-08` | Nothing — the caps are buildable today | PRD §17.4, §36.7, §24.1, §42.6, §45.5 ("Benchmark-selected configuration") |
| **Q-ASK-8** | **`RUNT-03`'s ticket says the SSE plugin is "a plugin that `ASK-01` registers inside its own route area", while breakdown plan §4 puts `/v1/answer-jobs/*` in a directory named `answer-jobs`.** D1–D3 resolve it by keeping the SSE mount in `routes/answers/**` under `area.prefix: '/v1'`. | `15-answer-product` (`ASK-01`) with `03-app-runtime` (`RUNT-03`) | `ASK-01`; if `RUNT-03` requires literal placement under `routes/answer-jobs/**`, that is a docs PR against **both** tickets plus this README, then `--sync` | Nothing — both readings mount the same URL | `RUNT-03` deliverable 4; breakdown plan §4, §5.16 |
| **Q1 (plan §8)** | Exact hosted model per profile (`QUICK_SYNTHESIS`, `DEEP_SYNTHESIS`, `STRUCTURED_REPAIR`, and any policy-permitted optional hosted reranker/fallback). **Status: benchmark-selected** — chosen by comparing accuracy, zero-tolerance failures, latency, provider availability and cost through the evaluation pipeline. | `21-evaluation-600`; the Founder approves production promotion **after** seeing the benchmark evidence (PRD §14.4) | `GOLD-15`, which records the promotion report | Production promotion only — this module builds against `EVID-07`'s profile abstraction with a stub provider (D15) | PRD §14.4, §17.3 |
| **Q4 (plan §8)** | Retrieval profile constants — evidence-node counts for Quick (12/20) and per Deep subquestion (10/20), and the candidate counts, fusion weights and rerank depth behind them. **Status: benchmark-selected** — start from the PRD §36.2 buildable initial defaults, tune on **development cases only**, freeze before validation and blind testing. | `11-retrieval-engine` | `RETR-10` measures and records the final profile; `GOLD-15` freezes it for validation | Nothing — PRD §36.2 gives buildable defaults and this module passes them through | PRD §36.2 (*"tuned on the development set and frozen"*) |

## Work breakdown

Lane is `15-answer-product` and agent is `builder` for all twelve tickets (breakdown plan §1.1).
File-scopes are relative to the repository root, are exactly breakdown plan §5.16, and are disjoint
between tickets that can run concurrently. `depends-on` is exactly breakdown plan §5.16.

| Ticket | Size | Lane | File-scope (write-owns) | Depends on |
|---|---|---|---|---|
| [`ASK-01`](tickets/ASK-01-answer-job-admission-and-transaction-boundary.md) — Answer job admission and transaction boundary | L | `15-answer-product` | `apps/api/src/routes/answers/**`, `apps/api/test/answers/**` | `RUNT-02`, `RUNT-03`, `DATA-06`, `EVID-03`, `EVID-08` |
| [`ASK-02`](tickets/ASK-02-quick-workflow-in-worker-retrieve-pack-gateway-validate-commit.md) — Quick workflow in worker (retrieve→pack→gateway→validate→commit) | L | `15-answer-product` | `apps/worker/src/handlers/answer/**` (creating `events/index.ts`, handed to `ASK-05` per D16), `apps/worker/test/answer/**` | `RUNT-04`, `RETR-08`, `EVID-05`, `EVID-07`, `ASK-01` |
| [`ASK-03`](tickets/ASK-03-clarification-rounds.md) — Clarification rounds | M | `15-answer-product` | `apps/api/src/routes/answer-jobs/**`, `apps/api/test/answer-jobs/**` | `ASK-02` |
| [`ASK-04`](tickets/ASK-04-answer-snapshot-read-contract-and-rerun-endpoint.md) — Answer snapshot read contract and rerun endpoint | M | `15-answer-product` | `apps/api/src/routes/answer-snapshots/**`, `apps/api/test/answer-snapshots/**` | `ASK-02` |
| [`ASK-05`](tickets/ASK-05-answer-sse-stage-events.md) — Answer SSE stage events | M | `15-answer-product` | `apps/worker/src/handlers/answer/events/**`, `apps/worker/test/answer-events/**` | `ASK-02` |
| [`ASK-06`](tickets/ASK-06-ask-form-screen.md) — Ask form screen | L | `15-answer-product` | `apps/web/src/features/ask/**`, `apps/web/test/ask/**` | `RUNT-05`, `RUNT-06`, `ASK-01`, `EVID-01` |
| [`ASK-07`](tickets/ASK-07-answer-progress-and-result-screens.md) — Answer progress and result screens | L | `15-answer-product` | `apps/web/src/features/answers/**`, `apps/web/test/answers/**` | `ASK-04`, `ASK-05`, `ASK-06` |
| [`ASK-08`](tickets/ASK-08-coverage-navigator-workflow-seven-ordered-stages.md) — Coverage Navigator workflow (seven ordered stages) | L | `15-answer-product` | `apps/worker/src/handlers/coverage/**`, `apps/api/src/routes/coverage-assessments/**`, `apps/worker/test/coverage/**`, `apps/api/test/coverage-assessments/**` | `ASK-02`, `SINS-03`, `SINS-04` |
| [`ASK-09`](tickets/ASK-09-coverage-screens.md) — Coverage screens | L | `15-answer-product` | `apps/web/src/features/coverage/**`, `apps/web/test/coverage/**` | `ASK-08`, `ASK-07` |
| [`ASK-10`](tickets/ASK-10-deep-research-bounded-workflow.md) — Deep Research bounded workflow | L | `15-answer-product` | `apps/worker/src/handlers/deep/**`, `apps/worker/test/deep/**` | `ASK-02` |
| [`ASK-11`](tickets/ASK-11-compare-workflow-time-jurisdiction-authority-or-instrument.md) — Compare workflow (TIME / JURISDICTION / AUTHORITY_OR_INSTRUMENT) | L | `15-answer-product` | `apps/worker/src/handlers/comparison/**`, `apps/api/src/routes/comparisons/**`, `apps/worker/test/comparison/**`, `apps/api/test/comparisons/**` | `ASK-02` |
| [`ASK-12`](tickets/ASK-12-compare-screens.md) — Compare screens | M | `15-answer-product` | `apps/web/src/features/compare/**`, `apps/web/test/compare/**` | `ASK-11`, `ASK-07` |

Standing module-shared exceptions (breakdown plan §1.1, "Package manifests"):

- `apps/api/package.json`, `apps/worker/package.json`, `apps/web/package.json` — created by `FND-01`,
  extended by `03-app-runtime`; **append-only** here (a ticket adds only its own dependency lines).
  Regenerate `pnpm-lock.yaml` as a build artifact, never hand-merge it (breakdown plan §4.1).
- `apps/worker/src/handlers/answer/events/index.ts` — created by `ASK-02`, owned by `ASK-05`
  thereafter (D16). The two tickets are ordered by `ASK-05.blocked_by = [ASK-02]`, so they can never
  run concurrently.

Wave shape (breakdown plan §7: **5 minimum waves, 4 useful lanes, not fully serial**). External
blockers are shown in brackets:

```text
wave 1  ASK-01 [RUNT-02, RUNT-03, DATA-06, EVID-03, EVID-08]
wave 2  ASK-02 [RUNT-04, RETR-08, EVID-05, EVID-07]  | ASK-06 [RUNT-05, RUNT-06, EVID-01]
wave 3  ASK-03 | ASK-04 | ASK-05 | ASK-08 [SINS-03, SINS-04]
wave 4  ASK-07 | ASK-10 | ASK-11
wave 5  ASK-09 | ASK-12
```

## Acceptance — what makes the whole module done

The module is done when all twelve tickets are delivered (`/verify-delivery` green each) **and**:

1. **`ANS-001` — Quick and Deep accept explicit question, facts, date, jurisdiction and retention
   mode.** `POST /v1/answers` accepts the PRD §34.3 request verbatim; the PRD §32.2 Ask form collects
   every listed field with its stated rules; and a request omitting a decisive fact returns
   clarification questions rather than an invented assumption. (PRD §30.2 `ANS-001` evidence:
   *"Missing decisive fields return clarification, not an invented assumption"*; §41.2 `UAT-ANS-02`.)
2. **`ANS-002` — employee PII is blocked before persistence, logs or provider calls.** Every
   free-text route in this module declares `requiresPiiAdmission` on `RUNT-02`'s chain and fails
   closed when no provider is bound; the Ask form never requests an employee name, personal email,
   home address, TFN, bank details, date of birth, employee/payroll ID or an upload (PRD §32.2).
   (§41.2 `UAT-PII-01`/`UAT-PII-02`; the detector itself is `EVID-01`/`EVID-02`.)
3. **`ANS-003` — accepted work is asynchronous, idempotent, cancellable and resumable by SSE.** The
   same actor/route/`Idempotency-Key`/body returns the original job; two submissions produce one job,
   one snapshot and one charge; `Last-Event-ID` resume delivers every event exactly once; cancelling
   before the provider stage releases the full reservation. (PRD §18.5; §33.2; §41.2 `UAT-ANS-01`,
   `UAT-ANS-06`, `UAT-ANS-07`; automated cross-boundary in `ASSR-05`.)
4. **`ANS-004` — each answer uses one pinned corpus release and approved model profile.** Every
   snapshot written by this module carries `corpus_release_id`, the model profile and the actual model
   version, and every citation in it resolves inside that release. No workflow — Quick, Deep, Coverage
   or Compare — re-resolves the release mid-job. (PRD §8.3, §18.5, §36.2; `DATA-06` enforces the
   storage invariant.)
5. **`ANS-005` — every material claim has validated source evidence or is removed/downgraded.** The
   count of unsupported definitive claims committed by this module is zero: the commit path refuses a
   snapshot containing a claim the `EVID-05` validator did not pass, and a removal that destroys the
   material conclusion downgrades the status to `INSUFFICIENT_EVIDENCE` or `CONFLICTING_SOURCES`.
   (PRD §9.4, §36.6, §36.8; §41.2 `UAT-ANS-03`, `UAT-ANS-05`; automated in `ASSR-04`.)
6. **`ANS-006` — the answer renders status, short answer, explanation, assumptions, authorities, next
   checks and limitations.** `GET /v1/answers/{id}` returns the PRD §34.5 payload exactly, and the
   result screen renders the PRD §32.3 eight-part order with claim↔citation interaction and passes the
   PRD §41.1 universal UI checks. (§41.2 `UAT-ANS-03`; accessibility automation in `ASSR-07`.)
7. **`ANS-007` — budget/provider/source failure never selects an unvalidated model.** With the
   `EVID-08` breaker tripped, admission returns `429 CREDIT_LIMIT_REACHED` or `503
   GENERATION_UNAVAILABLE`, Search and saved records remain available, and no alternative provider is
   attempted. (PRD §17.3, §36.8, §42.5, §42.6; §41.2 `UAT-ANS-08`.)
8. **`COV-001`/`COV-002` — the seven-stage order is persisted and shown, and job title alone cannot
   confirm a classification.** A job-title-only assessment returns multiple candidates plus decisive
   missing facts, with every candidate at `LIKELY`/`POSSIBLE`/`INSUFFICIENT_EVIDENCE` and none at
   `CONFIRMED_FROM_STATED_FACTS`; the Coverage screen presents multiple candidates as normal, not as
   an error. (PRD §8.5, §32.4; §41.2 `UAT-COV-01`.)
9. **`COV-003`/`COV-004` — agreement search uses employer name and validated ABN, and negative
   conclusions require pinpoint evidence.** A synthetic employer/ABN fixture returns agreement
   candidates with approval, variation/replacement/termination evidence; an award-free or exclusion
   conclusion without qualifying pinpoint evidence fails validation and is not committed. (PRD §8.5;
   §41.2 `UAT-COV-02`, `UAT-COV-03`.)
10. **`CMP-001`/`CMP-002` — each dimension has independent filters and citations, and a missing side
    stays unavailable.** A `TIME` comparison opens each column at its own legal date with its own
    version; a one-sided-source fixture leaves the available columns intact and marks the missing
    column explicitly unavailable with no fabricated claim. (PRD §8.6, §32.5; §41.2 `UAT-CMP-01`,
    `UAT-CMP-02`.)
11. **PRD §13.2 answer latency objectives, measured with the stub provider.** First safe
    progress/output event within approximately 3 seconds; Quick completion normally ≤ 30 seconds with
    a 60-second hard elapsed cap; Deep normally ≤ 60 seconds or continuing as a background job with a
    180-second hard cap (PRD §36.7). A goal that cannot be met without violating evidence quality,
    cost or safety is a writeback, not a relaxed validator — PRD §13.2 requires the product to
    *"preserve correctness and surface delay/degraded status"*.
12. **PRD §41.1 universal UI acceptance on all four screen tickets** — 360/768/1280 px, full keyboard
    operation, one programmatic heading, error summaries and live regions, colour never the only
    status signal, `3 Aug 2026` date rendering, copyable request/job/correction IDs, **no customer
    research content in URL query strings, analytics, browser telemetry or page titles**, and
    refresh/back/forward/reconnect never duplicating a write or a charge.
13. **Every `[machine]`/`[fixture]` item reproduces offline** against the `CRPS-08` fixture release
    and the `EVID-07` stub provider, with no network and no provider key: `pnpm test` green on the
    merged default branch (PRD §20.3, §45.3). No test in this module requires a live model provider.

## Changelog

- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.16 (12 tickets,
  `ASK-01` … `ASK-12`). Records decisions D1–D20 including the endpoint/screen ownership table that
  `RUNT-01`'s method+path collision rule makes load-bearing, rejects 15 alternatives, carries
  breakdown plan §8 entries Q1/Q4 as they stood at the time and opens Q-ASK-1 … Q-ASK-8 (two of
  them — the coverage and comparison result read paths — are PRD §16.2 gaps that must be reconciled
  with `FND-04`'s OpenAPI root).
- **v0.2 — 2026-08-03** — aligned with the `docs/prd/breakdown-plan.md` §8 decision register. The two
  register entries this module carries are restated with their status and their evidence path, and
  neither is described as awaiting a Founder answer any more. **Q1 (hosted model per profile):
  benchmark-selected** — resolved by comparing accuracy, zero-tolerance failures, latency, provider
  availability and cost through the evaluation pipeline, with `GOLD-15` recording the promotion report
  and Founder approval coming **after** that evidence; `ASK-02`, `ASK-08` and `ASK-10` carry the same
  wording. **Q4 (retrieval constants): benchmark-selected** — PRD §36.2 initial defaults, tuned on
  development cases only, frozen before validation and blind testing, recorded through `RETR-10` and
  frozen by `GOLD-15`; `ASK-02` and `ASK-10` updated to match. The Non-goals row that bundled Q1/Q2/Q3
  now separates benchmark-selected (`GOLD-15`) from **Q3**, which is *deferred until real-scale
  measurement* by `RLSE-11`; no number is stated for any of them, and no hot-vector planning
  hypothesis is repeated here as a commitment. No change to scope, the twelve tickets, `blocked_by`/`blocks` edges, the endpoint and
  screen ownership table, PRD traceability, the PRD §9.4 sequence, the PRD §13.2 latency objectives or
  any acceptance item; `Q-ASK-1` … `Q-ASK-8` remain open exactly as authored.
