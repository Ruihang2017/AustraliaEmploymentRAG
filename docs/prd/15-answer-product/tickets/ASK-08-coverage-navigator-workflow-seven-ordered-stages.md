---
id: ASK-08
title: Coverage Navigator workflow (seven ordered stages)
module: 15-answer-product
lane: 15-answer-product
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [ASK-02, SINS-03, SINS-04]
blocks: [ASK-09]
---

# ASK-08 — Coverage Navigator workflow (seven ordered stages)

Implements PRD §8.5 (Coverage Navigator) and §34.6 (coverage request), carrying requirements
**COV-001**, **COV-002**, **COV-003** and **COV-004** (`E22`).
**No ADR — the decision is already made in PRD §8.5; this is build ticket 8 of 12 against it.**
Parent sub-PRD: [15-answer-product README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`ASK-02` — Quick workflow in worker](ASK-02-quick-workflow-in-worker-retrieve-pack-gateway-validate-commit.md) ·
`SINS-03` — `FWC-AWARDS`: awards, variation history, pay data ([`07-sources-instruments`](../../07-sources-instruments/README.md)) ·
`SINS-04` — `FWC-AGREEMENTS`: agreement lifecycle ([`07-sources-instruments`](../../07-sources-instruments/README.md))
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(PRD §8.5's seven-step order, its six candidate statuses and PRD §34.6's request payload) — not a new
subsystem decision.

## Background + basis

Coverage is the question customers actually ask — *which award or agreement applies, and at what
classification* — and it is the question a fluent language model gets wrong most confidently. PRD §8.5
therefore does not describe a feature; it describes an **order of analysis** and a set of prohibitions.

**PRD §8.5 — Coverage Navigator** is normative and reproduced in full:

> Coverage Navigator MUST process in this order:
>
> 1. Likely workplace-relations system.
> 2. Employer/ABN enterprise-agreement candidates.
> 3. Agreement approval, variation, replacement, termination and coverage.
> 4. Modern-award candidates if no applicable agreement is established.
> 5. Industry/occupational coverage and exclusions.
> 6. Classification candidates based on principal duties, qualifications and responsibility.
> 7. Decisive missing facts and required clarifications.
>
> **Job title alone MUST NOT determine classification. Multiple candidates MUST remain visible when
> evidence cannot select one. `Award-free`, `agreement not applicable` and exclusion conclusions
> require pinpoint evidence.** Candidate status values:
>
> - `CONFIRMED_FROM_STATED_FACTS`
> - `LIKELY`
> - `POSSIBLE`
> - `UNLIKELY`
> - `EXCLUDED`
> - `INSUFFICIENT_EVIDENCE`

**PRD §34.6 — Coverage request.** Coverage uses the same fact object as Answer plus:

```json
{
  "legal_as_at": "2026-08-03",
  "employer": {"name": "Example Pty Ltd", "abn": "51824753556"},
  "work_locations": ["VIC"],
  "principal_duties": ["anonymous duty description"],
  "known_agreement_ids": [],
  "known_award_codes": [],
  "retention_mode": "SAVE",
  "research_record_id": "rec_..."
}
```

> Coverage/Compare jobs use the **same job, SSE, idempotency, cancellation, retention and budget
> semantics as answers**. Their completed snapshots contain dimension/stage-specific claims,
> citations, assumptions and gaps.

**PRD §16.2 — Compare and coverage:** `POST /v1/coverage-assessments` and
`GET /v1/coverage-assessment-jobs/{job_id}`.

**PRD §35.5** gives the persistence shape (owned by `DATA-06`, not by this ticket):

> `coverage_assessment` | `id`, tenant/record/job linkage, `legal_as_at`, `stage_results_ciphertext`,
> `status`, release/model metadata | **immutable formal result**

**PRD §30.2** register rows this ticket carries:

> `COV-001` — *"Coverage follows system → agreement → award → classification order"*, evidence
> *"Stage order is persisted and shown"*.
> `COV-002` — *"Job title alone cannot confirm award/classification"*, evidence *"Job-title-only test
> returns candidates/missing facts"*.
> `COV-003` — *"Agreement search supports employer name and validated ABN"*, evidence *"Known
> synthetic ABN fixture returns linked candidates"*.
> `COV-004` — *"Award-free, excluded or agreement-not-applicable outcomes need pinpoint evidence"*,
> evidence *"Negative conclusion without qualifying evidence fails validation"*.

**PRD §41.2** acceptance scripts:

> `UAT-COV-01` — Supply job title only → *Multiple candidates/missing facts; no confirmed
> classification*
> `UAT-COV-02` — Known synthetic employer/ABN has agreement chain → *Agreement candidates show
> approval, variation/replacement/termination evidence*
> `UAT-COV-03` — Request award-free conclusion without exclusion evidence → *Validator refuses
> definitive negative conclusion*

**PRD §9.4 applies unchanged**: the generation sequence is
`retrieve → evidence pack → structured claims → deterministic validation → render → final status
check`, and *"remaining unsupported claims MUST be removed and the answer downgraded/refused."* Every
stage of Coverage runs that sequence.

**PRD §36.2** eligibility applies to every stage's retrieval: requested date within the effective
interval, jurisdiction intersection, permitted status, licence-permitted use, and membership of the
pinned CorpusRelease.

**Contracts this ticket builds against (all already published):**

- `RUNT-01`'s A1 route-area contract; `RUNT-02`'s admission chain; `RUNT-04`'s A1 worker handler
  contract (`type`, `queue`, ordered `stages`, `JobContext`, yield-per-stage).
- `ASK-01`'s exported `admitAnswerJob` and retention/clarification helpers — Coverage admission reuses
  the identical PRD §18.5 step 2 transaction (sub-PRD **D5**), so credit reservation, release pinning,
  record creation, ephemeral handling, idempotency and outbox behave identically.
- `ASK-02`'s `pipeline/index.ts` exported surface (`runRetrieveStage`, `runEvidencePackStage`,
  `runSynthesiseStage`, `runValidateStage`, `runStatusStage`, `runRenderStage`) — the PRD §9.4 sequence
  is imported, never copied (sub-PRD **D7**).
- `ASK-05`'s `createAnswerEventEmitter`, which takes a stage vocabulary as a parameter so this
  workflow supplies its own seven-stage vocabulary and reuses the same payload allowlist and terminal
  discipline.
- `DATA-06`'s immutable `coverage_assessment` repository.
- `SINS-03`'s award corpus — *"Award version chains and classification structures"* — and `SINS-04`'s
  agreement corpus — *"Approval/variation/replacement/termination evidence chains"*. These two edges
  exist because stages 2–6 are unanswerable without that material.

**Accepted caveats carried forward:**

- **The result read endpoint is not literally in PRD §16.2.** §16.2 lists only the create and job-status
  endpoints, but PRD §31.2 requires a `/coverage/:assessmentId` screen and §34.6 says the completed
  snapshot carries stage-specific claims and citations. This ticket adopts
  `GET /v1/coverage-assessments/{assessmentId}` — sub-PRD open question **Q-ASK-1**, to be reconciled
  with `FND-04`'s OpenAPI root.
- The exact hosted model behind the synthesis profile is breakdown plan §8 **Q1** — a
  **benchmark-selected** parameter resolved by `GOLD-15`'s promotion report, not a preference taken in
  advance. Build against `EVID-07`'s profile abstraction and stub provider; **no test may require a
  live provider** (sub-PRD **D15**).
- `GOLD-06` (awards/coverage evaluation cases, 90) validates this workflow's accuracy later; nothing
  here reads `evals/gold/**` (breakdown plan **R9**).

## Goal

Ship the `coverage` worker handler area and the `coverage-assessments` route area so a coverage
assessment executes PRD §8.5's seven stages **in order**, with each stage's inputs restricted to the
outputs of the stages before it, persists the stage order and per-stage results as an immutable
assessment, and never produces a `CONFIRMED_FROM_STATED_FACTS` classification from a job title alone
or a negative conclusion without pinpoint evidence. Completion is mechanically checkable: a
job-title-only fixture yields multiple candidates plus decisive missing facts with **no** confirmed
classification; a synthetic employer/ABN fixture yields agreement candidates carrying approval,
variation/replacement/termination evidence; and an award-free conclusion without qualifying exclusion
evidence fails validation and is not committed.

## Non-goals

- **No new admission transaction.** Coverage admission calls `ASK-01`'s exported `admitAnswerJob`;
  the reservation, pinning, record creation, ephemeral handling and outbox semantics are `ASK-01`'s
  (PRD §34.6: *"the same job, SSE, idempotency, cancellation, retention and budget semantics as
  answers"*).
- **No copy of the PRD §9.4 pipeline.** `ASK-02`'s `pipeline/index.ts` is imported (sub-PRD **D7**).
- **No SSE transport or event allowlist.** `RUNT-03` and `ASK-05`; this ticket supplies a stage
  vocabulary only.
- **No screens.** `apps/web/src/features/coverage/**` is `ASK-09`, which is `blocked_by` this ticket.
- **No award or agreement ingestion, parsing or classification-structure modelling.**
  `07-sources-instruments` (`SINS-03`, `SINS-04`) owns the corpus; this ticket reads it through
  `packages/retrieval-client`.
- **No retrieval, ranking or filters.** `11-retrieval-engine`.
- **No validator, evidence pack, licence limits or sanitisation.** `12-evidence-safety`.
- **No tables, migrations or repositories.** `01-app-data` — breakdown plan **A3**, PRD §45.2/§44.3.
- **No Compare.** `ASK-11`.
- **No evaluation cases.** `21-evaluation-600` (`GOLD-06`).

## File-scope (write-owns)

- `apps/worker/src/handlers/coverage/**`
- `apps/api/src/routes/coverage-assessments/**`
- `apps/worker/test/coverage/**` and `apps/api/test/coverage-assessments/**` — this ticket's own tests
  (breakdown plan §1.1).
- `apps/worker/package.json`, `apps/api/package.json` — **append-only** (breakdown plan §1.1).

Does not touch:

- `apps/worker/src/handlers/answer/**` — `ASK-02` (and `events/**` — `ASK-05`);
  `handlers/deep/**` — `ASK-10`; `handlers/comparison/**` — `ASK-11`;
  `handlers/{change-matching,alerts,notifications,rerun,correction,export}/**` — `16`, `17`, `19`;
  `apps/worker/src/{main.ts,runtime,queues}/**` and `handlers/maintenance/**` — `RUNT-04`.
- `apps/api/src/routes/answers/**` — `ASK-01`; `routes/answer-jobs/**` — `ASK-03`;
  `routes/answer-snapshots/**` — `ASK-04`; `routes/comparisons/**` — `ASK-11`; every other route area
  — `13`, `14`, `16`, `17`, `19`, `20`, `22`;
  `apps/api/src/{server.ts,app.ts,bootstrap,errors,plugins,middleware,sse}/**` — `03-app-runtime`.
- `apps/web/**` — `RUNT-05` and the product feature areas, including `features/coverage/**`
  (`ASK-09`).
- `packages/**`, `pipelines/**`, `services/**`, `schemas/**`, `infra/**`, `evals/**`, `tests/**` —
  `00`, `01`, `02`, `03`, `04`, `05`, `07`, `11`, `12`, `18`, `21`, `23`; root manifests and
  lockfiles — `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown plan §1: phase 1, nothing merged, no
in-flight ticket), so neither `apps/worker/src/handlers/coverage/**` nor
`apps/api/src/routes/coverage-assessments/**` has been written and nothing contends for them. Under
breakdown plan **A1** both directories self-register by convention, so adding them produces **zero**
diff to `03-app-runtime`'s files or to any sibling area — that is what makes
`handlers/{answer,deep,coverage,comparison}` and the five `routes/*` subtrees disjoint inside this
module and disjoint from the other modules that own `apps/worker/src/handlers/*` and
`apps/api/src/routes/*`. The URL-space hazard is resolved by the sub-PRD's ownership table: this area
declares `area.prefix: '/v1'` and registers only the three coverage paths, none of which any sibling
registers; parameter names `:jobId` and `:assessmentId` are fixed module-wide (sub-PRD **D3**), so no
sibling can declare a conflicting name at the same position. Concurrent siblings at this wave are
`ASK-03`, `ASK-04` and `ASK-05` — all different directories. Per breakdown plan **A3**, **this ticket
writes no table, no migration and no repository**; the `coverage_assessment` table is `DATA-06`'s.

## Deliverables

1. **`apps/api/src/routes/coverage-assessments/index.ts`** — the route area. Default-exports the
   Fastify plugin and exports
   `export const area = { prefix: '/v1', admission: 'tenant' } satisfies RouteAreaConfig`
   (sub-PRD **D1**). It registers **exactly three** routes (sub-PRD **D2**):
   `POST /coverage-assessments`, `GET /coverage-assessment-jobs/:jobId`,
   `GET /coverage-assessments/:assessmentId`.
2. **Route flags and admission.** `POST /coverage-assessments` declares `idempotent: true` and
   `requiresPiiAdmission: true` (free-text duties and facts). It validates the PRD §34.6 body —
   `legal_as_at`, `employer.{name,abn}` with ABN checksum (`400 INVALID_ABN`), `work_locations`,
   `principal_duties`, `known_agreement_ids`, `known_award_codes`, `retention_mode`,
   `research_record_id` — and then calls **`ASK-01`'s `admitAnswerJob`** with `job_type:
   'COVERAGE_ASSESSMENT'`. It implements no transaction of its own (PRD §34.6).
3. **`GET /coverage-assessment-jobs/:jobId`** — job status in the same shape `ASK-01` returns, with no
   provider payload, prompt, reasoning or cost detail, and `410 EPHEMERAL_CONTENT_EXPIRED` for an
   expired ephemeral job (PRD §10.4).
4. **`GET /coverage-assessments/:assessmentId`** — the immutable assessment read (sub-PRD **Q-ASK-1**):
   `schema_version`, `id`, `record_id`, `job_id`, `status`, `legal_as_at`, `jurisdictions`,
   `corpus_release_id`, `created_at`, and **`stages[]`** — one object per PRD §8.5 stage in the fixed
   order, each carrying `{ stage, sequence, candidates[], decisive_missing_facts[], claims[],
   citations[], assumptions[], gaps[] }`. Claims and citations use the PRD §34.5 shapes so the
   evidence panel is identical to an answer's (breakdown plan **A6**). Licence quote limits come from
   `EVID-06`, and `official_url` is code-generated (PRD §36.6) — reuse `ASK-04`'s serialiser helpers
   rather than re-deriving them.
5. **`apps/worker/src/handlers/coverage/index.ts`** — the `JobHandlerModule` with one `JobHandler`:
   `type: 'COVERAGE_ASSESSMENT'`, `queue: 'interactive_research'` (PRD §39.5), and an ordered `stages`
   list that is **exactly PRD §8.5's seven steps** plus a commit stage:

   | # | Stage name | `idempotent` | PRD §8.5 step |
   |---|---|---|---|
   | 1 | `WORKPLACE_RELATIONS_SYSTEM` | `true` | 1. Likely workplace-relations system |
   | 2 | `AGREEMENT_CANDIDATES` | `true` | 2. Employer/ABN enterprise-agreement candidates |
   | 3 | `AGREEMENT_LIFECYCLE` | `true` | 3. Approval, variation, replacement, termination, coverage |
   | 4 | `AWARD_CANDIDATES` | `true` | 4. Modern-award candidates if no applicable agreement |
   | 5 | `INDUSTRY_OCCUPATIONAL_COVERAGE` | `true` | 5. Industry/occupational coverage and exclusions |
   | 6 | `CLASSIFICATION_CANDIDATES` | `true` | 6. Classification from principal duties, qualifications, responsibility |
   | 7 | `DECISIVE_MISSING_FACTS` | `true` | 7. Decisive missing facts and required clarifications |
   | 8 | `COMMIT` | `false` | §18.5 step 6 |

   The list is a frozen tuple; a test asserts it equals PRD §8.5's order (sub-PRD **D10**;
   `COV-001` evidence *"Stage order is persisted and shown"*).
6. **Stage inputs are structurally restricted.** `StageInput<N>` for stage *N* exposes the job payload
   plus the **committed outputs of stages 1…N−1 only** — it is a type boundary, not a convention, so
   no stage can read a later stage's result and stage 6 cannot run without stages 1–5 having produced
   their evidence. Stage 4 is entered only when stage 3 established no applicable agreement, and that
   determination is itself a cited stage-3 output (PRD §8.5 step 4: *"if no applicable agreement is
   established"*).
7. **Each stage runs the PRD §9.4 sequence.** Every stage calls `ASK-02`'s exported
   `runRetrieveStage → runEvidencePackStage → runSynthesiseStage → runValidateStage → runStatusStage`
   with its own hard filters (the stage's document types, the job's `legal_as_at`, jurisdictions from
   `work_locations`, the permitted status set) and the job's **single pinned** `corpus_release_id`
   (sub-PRD **D6**). No stage re-resolves the release, and no stage retrieves outside PRD §36.2's
   eligibility predicate.
8. **The candidate model.** `Candidate` is
   `{ kind: 'WORKPLACE_SYSTEM' | 'AGREEMENT' | 'AWARD' | 'CLASSIFICATION', status:
   CandidateStatus, decisive_facts[], derived_from_facts[], citation_ids[], exclusions[] }` where
   `CandidateStatus` is exactly PRD §8.5's six values from `packages/contracts` (`FND-03`). Per-kind
   required fields follow PRD §32.4's table so `ASK-09` can render them without inventing any:
   - **Workplace system** — candidate system, status, decisive facts, evidence, unresolved exclusions;
   - **Agreement** — title, agreement ID/matter, employer/ABN match, approval/start/nominal-expiry/
     termination dates, current lifecycle status, evidence;
   - **Award** — award code/title, industry/occupation basis, coverage clause, exclusions, candidate
     status;
   - **Classification** — award/agreement, level, duties matched, qualifications/responsibility facts,
     missing facts, candidate status.
9. **`COV-002` enforced structurally, not by prompt.** A `CLASSIFICATION` candidate may reach
   `CONFIRMED_FROM_STATED_FACTS` **only** if `derived_from_facts` contains at least one duty,
   qualification or responsibility fact **beyond** a job title **and** its `citation_ids` resolve to a
   classification definition in the applicable award or agreement. A candidate derived from job title
   alone is capped at `LIKELY`/`POSSIBLE`/`INSUFFICIENT_EVIDENCE` by construction — the confirming
   constructor is unreachable without the required inputs (PRD §8.5; `COV-002`, `UAT-COV-01`).
10. **`COV-004` enforced structurally.** A **negative** conclusion — `award-free`, `agreement not
    applicable`, `EXCLUDED` — requires at least one citation whose role is `SUPPORTS` or `QUALIFIES`
    on the exclusion or coverage clause that produces it. Without it the stage result is
    `INSUFFICIENT_EVIDENCE`, never a negative finding. Absence of retrieval hits is **not** evidence of
    absence (PRD §8.5; `COV-004`, `UAT-COV-03`).
11. **Multiple candidates are the normal outcome.** No stage collapses a candidate set to one when the
    evidence does not select one; every retained candidate keeps its own status and citations, and the
    stage records why it could not choose (PRD §8.5: *"Multiple candidates MUST remain visible when
    evidence cannot select one"*). A single-candidate result requires the same evidence a confirmed
    status requires.
12. **`COV-003` — employer and ABN matching.** Stage 2 searches agreements by employer name **and**
    validated ABN through `packages/retrieval-client`'s exact-identifier path (`RETR-03` treats ABNs as
    exact identifiers). The ABN is checksum-validated at admission (deliverable 2) and is treated as
    public business data, never as personal information (PRD §37.1). Stage 3 attaches the approval,
    variation, replacement, termination and coverage evidence `SINS-04` provides.
13. **Stage 7 and clarification.** `DECISIVE_MISSING_FACTS` collects, from every prior stage, the facts
    that would change a candidate's status, and emits them as PRD §33.3-shaped clarification questions
    (1–5, each naming the decision affected). When the job is configured to pause, it transitions to
    `WAITING_FOR_CLARIFICATION` and `ASK-03`'s endpoint resumes it; otherwise they are committed as the
    assessment's `decisive_missing_facts` (PRD §8.5 step 7).
14. **`events/vocabulary.ts`** — the seven-stage public vocabulary supplied to `ASK-05`'s
    `createAnswerEventEmitter`, mapping each stage to a user-readable name (for example
    `Identifying the workplace relations system`, `Finding enterprise agreements`, `Checking agreement
    lifecycle`, `Finding modern awards`, `Checking coverage and exclusions`, `Matching classification
    candidates`, `Listing decisive missing facts`). It reuses `ASK-05`'s payload allowlist and terminal
    discipline; it declares no new event type (PRD §34.4).
15. **`commit.ts`** — one transaction writing the immutable `coverage_assessment` through `DATA-06`
    (stage results, candidates, claims, citations, assumptions, gaps), the model/retrieval metadata,
    `EVID-08`'s settlement, the terminal job status, the audit event and the outbox event, with
    `job.completed` emitted only afterwards (PRD §18.5 steps 6–7, §35.5, §35.8 invariants 1 and 2).

## Acceptance checklist (classified)

- [ ] `[machine]` **`COV-001`**: the declared stage tuple equals PRD §8.5's seven steps in order, and
      the committed assessment persists the stage order — asserted against a literal (§30.2 `COV-001`
      *"Stage order is persisted and shown"*)
- [ ] `[machine]` Stage *N* cannot read a later stage's output — a type-level assertion plus a runtime
      test that stage 6 fails when stages 1–5 produced no evidence (PRD §8.5; sub-PRD **D10**)
- [ ] `[machine]` Stage 4 (award candidates) is entered only when stage 3 established no applicable
      agreement, and that determination carries its own citations (PRD §8.5 step 4)
- [ ] `[fixture]` **`COV-002` / `UAT-COV-01`**: a job-title-only fixture yields **multiple candidates**
      and decisive missing facts, with **no** candidate at `CONFIRMED_FROM_STATED_FACTS` — replayed
      against the `CRPS-08` fixture release and recorded provider responses (§30.2 `COV-002`)
- [ ] `[machine]` A `CONFIRMED_FROM_STATED_FACTS` classification is unconstructible without at least
      one duty/qualification/responsibility fact beyond a job title **and** a citation resolving to a
      classification definition — asserted at the type level and by a runtime attempt (PRD §8.5)
- [ ] `[fixture]` **`COV-003` / `UAT-COV-02`**: a synthetic employer/ABN fixture with an agreement chain
      yields agreement candidates carrying approval, variation/replacement/termination and coverage
      evidence, each with pinpoint citations (§30.2 `COV-003`; `SINS-04`)
- [ ] `[machine]` An ABN failing the checksum returns `400 INVALID_ABN` at admission and consumes no
      quota event (PRD §34.9, §32.2)
- [ ] `[fixture]` **`COV-004` / `UAT-COV-03`**: an award-free / `EXCLUDED` / agreement-not-applicable
      conclusion **without** a supporting or qualifying exclusion citation fails validation and commits
      `INSUFFICIENT_EVIDENCE` instead; the same conclusion **with** pinpoint evidence commits normally
      (§30.2 `COV-004`)
- [ ] `[machine]` Absence of retrieval hits never produces a negative conclusion (PRD §8.5)
- [ ] `[machine]` A candidate set is never collapsed to one without the evidence a confirmed status
      requires; every retained candidate keeps its own status and citations, and the stage records why
      it could not choose (PRD §8.5)
- [ ] `[machine]` **`ANS-004` equivalent**: one pinned `corpus_release_id` is used by all seven stages;
      a test that swaps the active release mid-job still yields the originally pinned value
      (PRD §8.3, §36.2; sub-PRD **D6**)
- [ ] `[machine]` Every stage runs `ASK-02`'s exported PRD §9.4 sequence — asserted by instrumenting the
      pipeline doubles and comparing the recorded call order per stage; the sequence is **not**
      re-implemented here (source scan; sub-PRD **D7**)
- [ ] `[machine]` Admission uses `ASK-01`'s `admitAnswerJob`: one transaction, one reservation, one
      job, one outbox event; a forced failure leaves none of them (PRD §34.6, §18.5)
- [ ] `[machine]` `POST /v1/coverage-assessments` is idempotent under a repeated key and returns
      `409 IDEMPOTENCY_CONFLICT` on a changed body (PRD §34.1, §34.6)
- [ ] `[machine]` The committed `coverage_assessment` is immutable — no update or delete path exists in
      this area (PRD §35.5, §35.8 invariant 5)
- [ ] `[machine]` `GET /v1/coverage-assessments/{assessmentId}` returns stage-ordered results with PRD
      §34.5-shaped claims and citations, licence-limited quotes and code-generated `official_url`s, and
      **no** prompt/reasoning/provider payload — canary asserted absent (PRD §34.6, §36.6, §11.1)
- [ ] `[machine]` **Tenant isolation**: another organisation's `jobId`/`assessmentId` and an absent id
      return byte-identical `404 RESOURCE_NOT_FOUND` bodies apart from `request_id` (PRD §16.5)
- [ ] `[machine]` The SSE stage vocabulary maps all seven stages to user-readable names and declares no
      new event type; an undeclared payload key throws at `ASK-05`'s emitter (PRD §32.3, §34.4)
- [ ] `[machine]` These two areas register exactly the three method+path pairs in the sub-PRD ownership
      table (`RUNT-01`; sub-PRD **D2**)
- [ ] `[machine]` **A3 guard**: no import of `packages/database/migrations`, a schema module or an
      unscoped connection in either area (breakdown plan **A3**/**R4**; PRD §45.2, `SEC-001`)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `COV-001`…`COV-004` and `UAT-COV-01`…`03`
- [ ] `[human]` `UAT-COV-01`, `UAT-COV-02` and `UAT-COV-03` rehearsed end to end once `ASK-09` has
      merged, plus PRD §43.4 founder review of candidate wording and the "multiple candidates is normal"
      framing (PRD §41.2, §43.4) — **not required to merge this ticket**; the `[machine]`/`[fixture]`
      rows are the merge gate
- [ ] No `cargo test --workspace` / `uv run pytest` item — no Rust or Python is touched (PRD §45.3)

## Test plan

Reviewer steps, all reproducible offline with no network and no provider key.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/worker` and `pnpm test --filter @aer/api`. Suites live under
   `apps/worker/test/coverage/` and `apps/api/test/coverage-assessments/`.
3. **Harness.** `ASK-02`'s worker test factories and pipeline doubles; a fake
   `packages/retrieval-client` seeded from the committed `CRPS-08` fixture bundle **plus** synthetic
   award and agreement fixtures committed under `apps/worker/test/coverage/fixtures/` (an award with a
   classification structure, an agreement with an approval→variation→termination chain, an award with
   an explicit exclusion clause, and an employer/ABN that links to the agreement); `EVID-07`'s
   recorded-response provider double; a temp-file `app.sqlite` migrated with `DATA-01`'s runner. No
   socket, no network, no provider key.
4. **`stage-order.test.ts`** — assert the literal seven-stage tuple; assert the persisted assessment
   records the same order; attempt to run stage 6 with stages 1–5 empty and assert failure.
5. **`job-title-only.test.ts`** (`UAT-COV-01`) — submit facts containing only a job title; assert ≥2
   classification candidates, a non-empty `decisive_missing_facts`, and that no candidate has
   `CONFIRMED_FROM_STATED_FACTS`. Then add a duty and a qualification with a matching classification
   citation and assert the confirmed status becomes reachable.
6. **`agreement-chain.test.ts`** (`UAT-COV-02`) — submit the synthetic employer name and ABN; assert
   agreement candidates carry approval, variation/replacement/termination dates and lifecycle status,
   each with pinpoint citations. Submit a mistyped ABN and assert `400 INVALID_ABN` with no job
   created.
7. **`negative-conclusion.test.ts`** (`UAT-COV-03`) — force a stage result asserting "award-free" with
   no exclusion citation; assert validation rejects it and the committed status is
   `INSUFFICIENT_EVIDENCE`. Repeat with an exclusion clause citation and assert the negative conclusion
   commits with its evidence.
8. **`multiple-candidates.test.ts`** — an ambiguous fixture where two awards both plausibly cover;
   assert both are retained with their own statuses and citations and that the stage records why it
   could not choose.
9. **`pinning.test.ts`** — swap the active release between stages 3 and 4; assert every stage used the
   originally pinned id.
10. **`pipeline-reuse.test.ts`** — instrument `ASK-02`'s exported stage functions; assert each of the
    seven stages invokes them in the PRD §9.4 order; source-scan this area for any local
    re-implementation of retrieval, packing, synthesis or validation.
11. **`admission.test.ts`** — post the PRD §34.6 body; assert one job, one reservation, one outbox
    event via `ASK-01`'s helper; fault-inject and assert none; repeat the key and assert one job; mutate
    the body and assert `409`.
12. **`read.test.ts`** — `GET` the assessment; assert stage order, PRD §34.5-shaped claims/citations,
    licence-limited quotes, code-generated URLs, and canaries from `model_execution` absent.
13. **`isolation.test.ts`** — cross-tenant matrix over `jobId` and `assessmentId`.
14. **`routes.test.ts`** — boot this area with `ASK-01`'s and `ASK-04`'s fixture areas; assert three
    method+path pairs here, no collision and no parameter-name conflict.
15. Reviewer greps the diff for: any stage reading a later stage's output, any construction of
    `CONFIRMED_FROM_STATED_FACTS` outside the guarded constructor, any negative conclusion emitted
    without a citation, any copy of the PRD §9.4 sequence, any `CREATE TABLE`, and any second
    resolution of the corpus release.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), then `docs/prd/15-answer-product/README.md`, then
`.claude/scripts/publish-tickets.mjs --sync`, and only then change code (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`GET /v1/coverage-assessments/{assessmentId}` is not in PRD §16.2** → sub-PRD **Q-ASK-1**. Confirm
  the path here, record it in `docs/prd/15-answer-product/README.md`, and raise a `FND-04` ticket so
  the OpenAPI root carries it. A different path is a docs PR against **this** ticket plus `ASK-09`,
  then `--sync` both.
- **The seven-stage order cannot be executed as stated** (for example agreements cannot be found
  before the workplace system is known) → PRD §8.5 fixes the order as a **product** rule, not an
  implementation preference. Do not reorder. Record the obstruction in
  `docs/prd/15-answer-product/README.md` with the Founder as owner under PRD §45.5.
- **`SINS-03`/`SINS-04` do not expose a field a stage needs** (for example a classification structure
  or a termination date) → that is a corpus gap. Record it in
  `docs/prd/15-answer-product/README.md`, raise it against the owning `07-sources-instruments`
  ticket, and **fail closed in the meantime**: `INSUFFICIENT_EVIDENCE`, never an inferred value.
- **`DATA-06`'s `coverage_assessment` cannot hold the stage results** → do not write
  `packages/database/**` (breakdown plan **A3**/**R4**; PRD §44.3, §45.2). Raise a new `01-app-data`
  ticket, add the `blocked_by` edge in `docs/prd/breakdown-plan.md` §5.16/§6.2, and record it in the
  sub-PRD.
- **`ASK-02`'s exported pipeline surface does not fit a coverage stage** → change it there, in one docs
  PR against `ASK-02` plus this ticket, and `--sync` both. Never fork the PRD §9.4 sequence
  (sub-PRD **D7**).
- **Customers find "multiple candidates" unsatisfying and ask for a single recommendation** → PRD §8.5
  is explicit: *"Multiple candidates MUST remain visible when evidence cannot select one."* Record the
  feedback in `docs/prd/15-answer-product/README.md` and route it to the Founder as a product change;
  never add a tie-breaking heuristic that manufactures a single answer.

**3. Escalation.** Three rules here are the product's central invariants, not tuning parameters:
**job title alone cannot determine classification**, **multiple candidates remain visible when
evidence cannot select one**, and **negative conclusions require pinpoint evidence** (PRD §8.5,
`COV-002`/`COV-004`). Any change that would let a confident single classification, or an unevidenced
"award-free" finding, reach a customer overturns PRD §8.5 and PRD §9.4's requirement that unsupported
claims be removed and the answer downgraded. Stop, escalate for re-review through the PRD §45.5
product-change path, and record the outcome in `docs/prd/15-answer-product/README.md` and
`docs/prd/breakdown-plan.md`. Never relax a candidate-status guard inside this ticket.
