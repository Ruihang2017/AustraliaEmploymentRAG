---
id: ASK-03
title: Clarification rounds
module: 15-answer-product
lane: 15-answer-product
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [ASK-02]
blocks: [ASSR-05]
---

# ASK-03 — Clarification rounds

Implements PRD §33.3 (clarification flow) and §34.3 (clarification response and submission),
carrying requirement **ANS-001** (`E21`).
**No ADR — the decision is already made in PRD §33.3 and §34.3; this is build ticket 3 of 12 against
it.**
Parent sub-PRD: [15-answer-product README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`ASK-02` — Quick workflow in worker](ASK-02-quick-workflow-in-worker-retrieve-pack-gateway-validate-commit.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(PRD §33.3's rules and §34.3's literal clarification payload plus its named `409` code) — not a new
subsystem decision.

## Background + basis

Clarification is the mechanism that stops the product inventing facts. PRD §30.2 states requirement
**ANS-001**'s minimum acceptance evidence as: *"Missing decisive fields return clarification, not an
invented assumption."* That is a refusal behaviour dressed as a question, and it is the difference
between a research tool and a plausible-sounding guess.

**PRD §33.3 — Clarification flow** is normative and reproduced in full:

> If a missing fact could change jurisdiction, applicable system, agreement, award, classification,
> status or material conclusion, the job moves to `WAITING_FOR_CLARIFICATION`. It returns **1–5
> specific questions, each with the decision it affects**. The user may answer with anonymous facts,
> choose "unknown" or cancel. **"Unknown" may continue only as a conditional/multiple-candidate
> answer; it cannot be converted into a silent assumption.**

**PRD §34.3** fixes the wire shapes. The clarification response, returned at `202` from
`POST /v1/answers` (`ASK-01`) or observable on the job:

```json
{
  "status": "WAITING_FOR_CLARIFICATION",
  "clarifications": [
    {
      "id": "clq_...",
      "question": "Is the employer a constitutional corporation?",
      "affects": ["WORKPLACE_RELATIONS_SYSTEM"],
      "answer_type": "YES_NO_UNKNOWN"
    }
  ]
}
```

and the submission endpoint plus its failure mode:

> Clarifications are submitted to `POST /v1/answer-jobs/{job_id}/clarifications`. **Submitting a stale
> clarification round returns `409 CLARIFICATION_ROUND_CLOSED`.**

**PRD §31.3** makes `WAITING_FOR_CLARIFICATION` one of the ten mandatory asynchronous states every
job-driven screen must render, each with *"a visible title, plain-language explanation, allowed next
action and request/job ID"*.

**PRD §39.5** puts *"clarification continuation"* in the `interactive_quick` queue class alongside
Quick, at priority 1 — so answering a clarification resumes the same job rather than creating a new
one.

**PRD §10.1 / §37.2** still apply to every submitted answer: the server is *"the authoritative PII
boundary before logging, persistence or provider calls"*, and a rejected submission returns
*"field, character range, category and suggested placeholder but never echoes the detected value"*.

**PRD §34.9** rows this endpoint can produce: `400 INVALID_REQUEST`, `404 RESOURCE_NOT_FOUND`,
`409 IDEMPOTENCY_CONFLICT`, `410 EPHEMERAL_CONTENT_EXPIRED`, `422 EMPLOYEE_PII_DETECTED`,
`429 RATE_LIMITED`. `409 CLARIFICATION_ROUND_CLOSED` is named in PRD §34.3 and is the one code this
route contributes beyond the §34.9 table — it is a PRD-named code, not an invented one.

**PRD §41.2** acceptance script this ticket serves:

> `UAT-ANS-02` — Omit a fact decisive to applicable system → *Clarification questions explain affected
> decision; no silent assumption*

**Contracts this ticket builds against (all already published):**

- `RUNT-01`'s A1 route-area contract and its typed `ApiError` factories over the closed PRD §34.9
  catalogue.
- `RUNT-02`'s admission chain: this route declares `admission: 'tenant'`, `idempotent: true` and
  `requiresPiiAdmission: true` (the submitted answers are free-text customer facts).
- `ASK-01`'s `clarification-gate.ts` — `detectDecisiveMissingFacts(input): ClarificationQuestion[]`
  and the `affects` vocabulary (`WORKPLACE_RELATIONS_SYSTEM`, `JURISDICTION`, `APPLICABLE_AGREEMENT`,
  `APPLICABLE_AWARD`, `CLASSIFICATION`, `LEGAL_STATUS`, `MATERIAL_CONCLUSION` — PRD §33.3's list) and
  `ASK-01`'s `service.ts` export surface.
- `ASK-02`'s handler and its `REAUTHORISE`/`RETRIEVE` stages: a mid-job clarification pauses the job
  at a stage boundary and answering it resumes the same job in the same queue class.
- `DATA-05`'s job repository (status transitions, safe payload, idempotency) and `DATA-06`'s
  `research_turn` repository (immutable turns, `turn_type: 'FACT_CLARIFICATION'` per PRD §34.7).

**Accepted caveats carried forward:**

- **There is no `clarification` table in PRD §35.5.** Persist rounds using the existing repositories —
  the `job` row's safe payload for the open round and, for `SAVE` jobs, an immutable
  `research_turn` of type `FACT_CLARIFICATION` for each answered fact (PRD §34.7). If that proves
  impossible, a missing column is a **new `01-app-data` ticket plus a `blocked_by` edge** (breakdown
  plan **R4**), never a migration written here. This is sub-PRD open question **Q-ASK-5**.
- Whether every decisive-fact class is detectable at admission time or some require a retrieval round
  first is sub-PRD **Q-ASK-6**; both entry points are specified and this endpoint serves both.

## Goal

Ship the `answer-jobs` route area so a job in `WAITING_FOR_CLARIFICATION` can be answered exactly
once per round: `POST /v1/answer-jobs/{jobId}/clarifications` accepts anonymous facts, `"unknown"` or
a cancel, validates the round number, resumes the job in the `interactive_quick` queue, and returns
`409 CLARIFICATION_ROUND_CLOSED` for a stale round. Completion is mechanically checkable: a stale
round returns the PRD §34.3 code; an `"unknown"` answer resumes the job and can only produce a
`CONDITIONAL`/multiple-candidate answer, never an assumption written as fact; and two concurrent
submissions for the same round admit exactly one.

## Non-goals

- **No admission, no job creation, no reservation.** `ASK-01` owns `POST /v1/answers` and the
  admission transaction, and it is `ASK-01` — not this ticket — that returns the first clarification
  set in its `202` body.
- **No job status, SSE or cancel endpoints.** `GET /v1/answer-jobs/{jobId}`,
  `GET /v1/answer-jobs/{jobId}/events` and `POST /v1/answer-jobs/{jobId}/cancel` are `ASK-01`'s,
  registered from `routes/answers/**` under `area.prefix: '/v1'` (sub-PRD **D1**–**D3**). This ticket
  registers exactly **one** method+path; a second would fail boot (`RUNT-01`).
- **No worker execution.** Resuming the job is `ASK-02`'s handler; this route only transitions the
  job and lets `RUNT-04`'s lease loop pick it up.
- **No detection of which facts are decisive.** `ASK-01`'s `clarification-gate.ts` owns the predicate;
  this ticket imports it and restates nothing.
- **No screens.** The `WAITING_FOR_CLARIFICATION` state and the answer form are `ASK-07`
  (`apps/web/src/features/answers/**`), which is `blocked_by ASK-05`/`ASK-06`, not this ticket.
- **No tables, migrations or repositories.** `01-app-data` — breakdown plan **A3**, PRD §45.2/§44.3.
- **No PII detection.** `packages/pii` is `12-evidence-safety`; this route declares
  `requiresPiiAdmission` and implements no detector.
- **No OpenAPI authoring.** `schemas/openapi/**` is `FND-04` (serial-owned).

## File-scope (write-owns)

- `apps/api/src/routes/answer-jobs/**`
- `apps/api/test/answer-jobs/**` — this ticket's own unit/integration tests (breakdown plan §1.1).
- `apps/api/package.json` — **append-only** (breakdown plan §1.1).

Does not touch:

- `apps/api/src/routes/answers/**` — `ASK-01`; `apps/api/src/routes/answer-snapshots/**` — `ASK-04`;
  `apps/api/src/routes/coverage-assessments/**` — `ASK-08`; `apps/api/src/routes/comparisons/**` —
  `ASK-11`.
- `apps/api/src/{server.ts,app.ts,bootstrap,errors,plugins,middleware,sse}/**` and
  `apps/api/src/routes/{health,system-status}/**` — `03-app-runtime` (`RUNT-01`…`RUNT-03`, `RUNT-08`).
- Every other `apps/api/src/routes/<area>/**` — `13`, `14`, `16`, `17`, `19`, `20`, `22`.
- `apps/worker/**`, `apps/web/**` — `03-app-runtime` plus the product subtrees, including this
  module's own `handlers/answer/**` (`ASK-02`) and `features/answers/**` (`ASK-07`).
- `packages/**`, `schemas/**`, `infra/**`, `tests/**` — `00`, `01`, `02`, `03`, `11`, `12`, `18`,
  `23`; root manifests and lockfiles — `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown plan §1: phase 1, nothing merged, no
in-flight ticket), so nothing has previously written `apps/api/src/routes/answer-jobs/**` and nothing
contends for it. Under breakdown plan **A1**, adding this route directory produces **zero** diff to
`03-app-runtime`'s files or to any sibling route area — that is what makes the five
`routes/{answers,answer-jobs,answer-snapshots,coverage-assessments,comparisons}/**` subtrees disjoint
inside this module and disjoint from the seven other modules that own `apps/api/src/routes/*`.
Concurrent siblings at this wave are `ASK-04` (`routes/answer-snapshots/**`), `ASK-05`
(`apps/worker/src/handlers/answer/events/**`) and `ASK-08` (`routes/coverage-assessments/**` +
`handlers/coverage/**`) — all different directories. The one cross-ticket hazard is the URL space, not
the filesystem: `ASK-01` registers `/v1/answer-jobs/{jobId}`, `/events` and `/cancel` from its own
area, so this ticket must register **only** `POST /v1/answer-jobs/:jobId/clarifications` and must use
the parameter name `:jobId` (sub-PRD **D2**/**D3**); `RUNT-01` fails boot on a duplicate method+path
or a conflicting parameter name. Per breakdown plan **A3**, **this ticket writes no table, no
migration and no repository**.

## Deliverables

1. **`apps/api/src/routes/answer-jobs/index.ts`** — the route area. Default-exports the Fastify plugin
   and exports
   `export const area = { prefix: '/v1/answer-jobs', admission: 'tenant' } satisfies RouteAreaConfig`.
   It registers **exactly one** route: `POST /:jobId/clarifications` (sub-PRD **D2**). The parameter
   name is `:jobId` (sub-PRD **D3**).
2. **Route flags consumed by `RUNT-02`.** `idempotent: true` (a retried submission must not create a
   second round transition) and `requiresPiiAdmission: true` (the submitted answers are free-text
   customer facts — PRD §37.2, `PII-002`).
3. **`apps/api/src/routes/answer-jobs/schema.ts`** — the submission body, built from
   `packages/contracts` generated types (`FND-04`):

   ```json
   {
     "round": 1,
     "answers": [
       { "id": "clq_...", "answer_type": "YES_NO_UNKNOWN", "value": "UNKNOWN" },
       { "id": "clq_...", "answer_type": "FREE_TEXT", "value": "anonymous fact" }
     ]
   }
   ```

   Rules: `round` is required and integral; `answers` must reference **exactly** the open round's
   question ids — an unknown id, a duplicate id or a missing id is `400 INVALID_REQUEST` naming the
   offending ids (ids only, never values); each free-text answer is bounded by the same PRD §32.2
   limit as `facts.free_text` (0–8,000 characters after normalisation) and carries no attachment
   field.
4. **`apps/api/src/routes/answer-jobs/round.ts`** — round-state control.
   `assertRoundOpen(job, submittedRound)` compares the submitted round to the job's current open round
   and raises **`409 CLARIFICATION_ROUND_CLOSED`** when they differ, when the round has already been
   answered, or when the job is no longer in `WAITING_FOR_CLARIFICATION` (PRD §34.3). The error body
   uses `RUNT-01`'s uniform PRD §16.1 shape with `retryable: false` and carries the current round
   number in `details` so the client can refetch — never the previous answers.
5. **`apps/api/src/routes/answer-jobs/submit.ts`** — the whole endpoint in one
   `withTenantTransaction`, in this order:
   1. load the job through the scoped repository; another tenant's job and an absent job return the
      **same** `404 RESOURCE_NOT_FOUND` (PRD §16.5);
   2. `assertRoundOpen`;
   3. for a `SAVE` job, append one immutable `research_turn` per answered fact with
      `turn_type: 'FACT_CLARIFICATION'` and the PRD §34.7 content shape, through `DATA-06` — turns are
      appended, never edited (PRD §8.7);
   4. for an `EPHEMERAL` job, write the answers to `DATA-08`'s ephemeral store only; an expired job
      returns `410 EPHEMERAL_CONTENT_EXPIRED` (PRD §10.4, §34.9);
   5. record the round as closed and transition the job to the resumable status in the
      `interactive_quick` queue (PRD §39.5 "clarification continuation");
   6. write the outbox event in the same transaction (PRD §35.8 invariant 6).
   Nothing outside the transaction observes partial state.
6. **The `"unknown"` rule, enforced in code.** An answer of `UNKNOWN` is recorded as an **unresolved
   decisive fact**, propagated to the resumed job as a constraint that the answer must be
   `CONDITIONAL` or present multiple candidates. It is **never** written as an `answer_assumption`, a
   default value or a narrowed filter (PRD §33.3: *"it cannot be converted into a silent
   assumption"*). Exposed as `unresolvedFactsFor(job)` so `ASK-02`'s pipeline consumes one
   representation.
7. **Cancel from a clarification.** PRD §33.3 allows the user to "cancel". The cancel endpoint is
   `ASK-01`'s (`POST /v1/answer-jobs/{jobId}/cancel`, sub-PRD **D17**); this ticket does **not**
   duplicate it. The submission body therefore has no cancel variant — a cancelling client calls
   `ASK-01`'s route, which releases the reservation in full because no provider call has been made
   (PRD §33.2). State this explicitly in the route documentation so the UI has one path.
8. **Round bounds.** A round always carries **1–5** questions (PRD §33.3); a job whose stored open
   round is empty or has more than five entries is a data defect and fails with
   `500 INTERNAL_ERROR` rather than being served — it never silently truncates. The maximum number of
   rounds per job is versioned configuration with a committed safe default (PRD §39.6 layer 1);
   exceeding it terminates the job as `INSUFFICIENT_EVIDENCE` with the unresolved facts stated, never
   an unbounded question loop.
9. **`apps/api/src/routes/answer-jobs/errors.ts`** — the mapping to `RUNT-01`'s typed factories using
   only PRD §34.9 codes plus PRD §34.3's `409 CLARIFICATION_ROUND_CLOSED`. No other code is invented;
   a needed code that does not exist is a PRD §45.5 product/API change (see Feedback obligation).

## Acceptance checklist (classified)

- [ ] `[machine]` `POST /v1/answer-jobs/{jobId}/clarifications` accepts the documented body and
      transitions the job to the resumable `interactive_quick` state (PRD §34.3, §39.5)
- [ ] `[machine]` **PRD §34.3**: submitting a stale round — an older round number, an already-answered
      round, or a job no longer in `WAITING_FOR_CLARIFICATION` — returns
      `409 CLARIFICATION_ROUND_CLOSED` with the uniform PRD §16.1 error body
- [ ] `[machine]` **`ANS-001` / `UAT-ANS-02`**: the open round carries **1–5** questions, each with a
      non-empty `affects` naming the decision at risk; zero and six are unrepresentable (PRD §33.3)
- [ ] `[machine]` **PRD §33.3 "unknown"**: an `UNKNOWN` answer resumes the job with an unresolved
      decisive fact recorded and writes **no** `answer_assumption`, no default value and no narrowed
      filter — asserted by inspecting every table the transaction touched
- [ ] `[machine]` An `UNKNOWN` answer constrains the resumed job to `CONDITIONAL` or a
      multiple-candidate result — asserted through `ASK-02`'s pipeline with the constraint set
      (PRD §33.3)
- [ ] `[machine]` **Atomicity**: a forced failure at each step of the submission transaction leaves no
      `research_turn`, no ephemeral row, no round transition and no `outbox_event` (PRD §35.8
      invariant 6)
- [ ] `[machine]` **Idempotency**: the same actor/route/`Idempotency-Key`/body returns the original
      result; two **concurrent** submissions for the same round produce exactly one transition and one
      `409 CLARIFICATION_ROUND_CLOSED` (PRD §34.1; `ANS-003`)
- [ ] `[machine]` Answers referencing an unknown, duplicate or missing question id return
      `400 INVALID_REQUEST` naming **ids only** — asserted with a canary in the submitted value that
      must be absent from the response bytes (PRD §37.2)
- [ ] `[machine]` **`PII-002`**: the route declares `requiresPiiAdmission` and is rejected — not
      admitted — when no PII provider is bound; a provider rejection returns
      `422 EMPLOYEE_PII_DETECTED` with field/range/category/placeholder and not the detected value
      (PRD §10.1, §37.2)
- [ ] `[machine]` **Tenant isolation**: another organisation's `jobId` and an absent `jobId` return
      byte-identical `404 RESOURCE_NOT_FOUND` bodies apart from `request_id` (PRD §16.5;
      `UAT-AUTH-03`)
- [ ] `[machine]` An expired `EPHEMERAL` job returns `410 EPHEMERAL_CONTENT_EXPIRED` (PRD §10.4,
      §34.9)
- [ ] `[machine]` `SAVE` submissions append immutable `research_turn` rows of type
      `FACT_CLARIFICATION` and edit no existing turn (PRD §8.7, §34.7; `DATA-06` invariant 5)
- [ ] `[machine]` The configured maximum round count terminates the job as `INSUFFICIENT_EVIDENCE`
      with unresolved facts stated, rather than issuing a further round (PRD §36.8)
- [ ] `[machine]` This area registers **exactly one** method+path — asserted against a literal, so an
      accidental second route (which would collide with `ASK-01`'s `/v1/answer-jobs/*` routes at boot)
      fails in test rather than at boot (`RUNT-01`; sub-PRD **D2**)
- [ ] `[machine]` **A3 guard**: no file under `apps/api/src/routes/answer-jobs/**` imports
      `packages/database/migrations`, a schema module or an unscoped connection (breakdown plan
      **A3**/**R4**; PRD §45.2, `SEC-001`)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `ANS-001` and `UAT-ANS-02`
- [ ] `[human]` `UAT-ANS-02` rehearsed end to end once `ASK-07` has merged: omit a fact decisive to the
      applicable system and confirm the questions explain the affected decision and that no assumption
      appears in the result (PRD §41.2) — **not required to merge this ticket**; the `[machine]` rows
      are the merge gate
- [ ] No `[fixture]` criteria — this ticket replays no recorded source or provider data; the resumed
      pipeline's replay coverage is `ASK-02`'s (breakdown plan §1.1)
- [ ] No `cargo test --workspace` / `uv run pytest` item — no Rust or Python is touched (PRD §45.3)

## Test plan

Reviewer steps, all reproducible offline with no network and no provider key.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/api`. Suites live under `apps/api/test/answer-jobs/`.
3. **Harness.** Fastify `inject()`, copying the signed-in-principal setup from
   `apps/api/test/admission/*` (`RUNT-02`) and the job/record factories from `apps/api/test/answers/*`
   (`ASK-01`). A temp-file `app.sqlite` + `ephemeral.sqlite` migrated with `DATA-01`'s runner. No
   socket, no provider.
4. **`round.test.ts`** — seed a job with an open round 2. Submit round 1 (expect
   `409 CLARIFICATION_ROUND_CLOSED`), round 3 (expect `409`), round 2 twice (expect one success, one
   `409`). Then set the job status to `RUNNING` and submit round 2 (expect `409`).
5. **`unknown.test.ts`** — answer every question `UNKNOWN`; assert the job resumes, assert
   `unresolvedFactsFor(job)` lists them, and assert `answer_assumption` and every other table the
   transaction touched contain no row representing the unknown as a fact. Then run `ASK-02`'s pipeline
   with the constraint set and assert the committed status is `CONDITIONAL` or a multiple-candidate
   result.
6. **`transaction.test.ts`** — fault injection at each of the six submission steps; after each, assert
   no `research_turn`, no ephemeral row, no round transition and no `outbox_event`.
7. **`idempotency.test.ts`** — two sequential submissions with the same key and body, then two
   concurrent submissions from two `worker_threads`; assert one transition and one `409`.
8. **`validation.test.ts`** — bodies with an unknown question id, a duplicate id, a missing id and an
   8,001-character free-text answer. Assert `400 INVALID_REQUEST` naming ids only; plant
   `answer-canary-<uuid>` in a rejected value and assert it is absent from the response bytes.
9. **`isolation.test.ts`** — the cross-tenant matrix over `jobId`; assert byte-identical 404 bodies
   apart from `request_id`.
10. **`ephemeral.test.ts`** — advance the clock past expiry and assert `410
    EPHEMERAL_CONTENT_EXPIRED`; assert the submitted answers never appear in the raw `app.sqlite`
    bytes for an `EPHEMERAL` job.
11. **`routes.test.ts`** — boot the area through `RUNT-01`'s `registerRouteAreas` and assert exactly
    one method+path; boot it together with `ASK-01`'s area fixture and assert no collision and no
    parameter-name conflict on `/v1/answer-jobs/:jobId`.
12. **`architecture.test.ts`** — source scan asserting no `packages/database` schema/migration import
    and no unscoped connection; copy the shape from `RUNT-02`'s
    `apps/api/test/admission/architecture.test.ts`.
13. Reviewer greps the diff for: a second registered route, any write of an assumption derived from an
    `UNKNOWN` answer, any edit (rather than append) of a `research_turn`, any `CREATE TABLE`, and any
    error code outside PRD §34.9 plus `CLARIFICATION_ROUND_CLOSED`.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), then `docs/prd/15-answer-product/README.md`, then
`.claude/scripts/publish-tickets.mjs --sync`, and only then change code (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **There is nowhere to persist the open round.** PRD §35.5 has no clarification table (sub-PRD
  **Q-ASK-5**). Do **not** write `packages/database/**` or a migration — breakdown plan **R4**, PRD
  §44.3/§45.2. Record the requirement in `docs/prd/15-answer-product/README.md`, raise a new
  `01-app-data` ticket, and add the `blocked_by` edge in `docs/prd/breakdown-plan.md` §5.16 and §6.2.
- **A decisive-fact class cannot be detected before retrieval** → sub-PRD **Q-ASK-6**. Record which
  classes moved to the mid-job round and why in `docs/prd/15-answer-product/README.md`; the customer
  path is unchanged, so this is documentation, not a product change. Never close the gap by assuming
  the fact.
- **The `affects` vocabulary in PRD §33.3 does not cover an observed decision** → that is a
  **product change** under PRD §45.5 (it changes what the customer is told is at risk). Raise it as an
  open question in `docs/prd/15-answer-product/README.md` with the Founder as owner; do not add a
  value locally.
- **`409 CLARIFICATION_ROUND_CLOSED` is not in `packages/contracts`'s error enum** — PRD §34.3 names
  it but PRD §34.9's table does not list it. Add it through `FND-03`/`FND-04` (`00-foundation`), not
  locally; record the temporary local declaration in `docs/prd/15-answer-product/README.md` under
  **Q-ASK-3**.
- **The UI needs a cancel variant on this endpoint** → it does not: `ASK-01` owns
  `POST /v1/answer-jobs/{jobId}/cancel` (sub-PRD **D17**), and registering a second cancel path here
  would fail boot on `RUNT-01`'s method+path collision check. If the UI genuinely cannot use it,
  amend the sub-PRD's endpoint-ownership table and both tickets in one docs PR, then `--sync` both.

**3. Escalation.** PRD §33.3's rule that *"'Unknown' … cannot be converted into a silent assumption"*
is a safety invariant, not a UX preference: converting it would let an unvalidated premise flow
through PRD §9.4's pipeline and out to the customer as a supported conclusion. If the implementation
cannot honour it — for example if the resumed pipeline has no way to carry an unresolved fact — stop,
escalate for re-review through the PRD §45.5 product-change path, and record the outcome in
`docs/prd/15-answer-product/README.md` and `docs/prd/breakdown-plan.md`. Never default an unknown fact
inside this ticket.
