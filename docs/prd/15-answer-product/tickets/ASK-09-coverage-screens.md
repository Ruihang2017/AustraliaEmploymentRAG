---
id: ASK-09
title: Coverage screens
module: 15-answer-product
lane: 15-answer-product
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [ASK-08, ASK-07]
blocks: [ASSR-06]
---

# ASK-09 — Coverage screens

Implements PRD §32.4 (Coverage Navigator screen) and §41.1 (universal UI acceptance), carrying
requirements **COV-001** and **COV-002** (`E22`).
**No ADR — the decision is already made in PRD §32.4 and §8.5; this is build ticket 9 of 12 against
it.**
Parent sub-PRD: [15-answer-product README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`ASK-08` — Coverage Navigator workflow (seven ordered stages)](ASK-08-coverage-navigator-workflow-seven-ordered-stages.md) ·
[`ASK-07` — Answer progress and result screens](ASK-07-answer-progress-and-result-screens.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(PRD §32.4's region layout and per-candidate field table) — not a new subsystem decision.

## Background + basis

The Coverage screens have one job beyond rendering: making **uncertainty read as competence**. A
customer who sees three award candidates must understand that the product found three, not that it
failed. PRD §31.2 states the requirement as the screen's empty/first-use rule:

> `/coverage/new` | New Coverage assessment | Researcher/Admin/Owner | Determine candidate coverage |
> **Explains required facts and order of analysis**
> `/coverage/:assessmentId` | Coverage result | authorised record members | Review candidates/missing
> facts | **Multiple candidates are normal, not an error**

**PRD §32.4 — Coverage Navigator** is normative and reproduced in full:

> The left rail shows **seven ordered stages from §8.5**. The centre panel displays facts and
> candidates for the active stage. The right evidence panel displays **only evidence relevant to the
> selected candidate**.
>
> | Candidate row | Required fields |
> |---|---|
> | Workplace system | candidate system, status, decisive facts, evidence, unresolved exclusions |
> | Agreement | title, agreement ID/matter, employer/ABN match, approval/start/nominal-expiry/termination dates, current lifecycle status, evidence |
> | Award | award code/title, industry/occupation basis, coverage clause, exclusions, candidate status |
> | Classification | award/agreement, level, duties matched, qualifications/responsibility facts, missing facts, candidate status |
>
> The primary action is **Confirm stated fact**, not "accept AI answer". **User confirmation creates a
> new immutable ResearchTurn and reruns affected stages.**

**PRD §8.5** fixes the seven stages, the six candidate statuses
(`CONFIRMED_FROM_STATED_FACTS`, `LIKELY`, `POSSIBLE`, `UNLIKELY`, `EXCLUDED`,
`INSUFFICIENT_EVIDENCE`) and the prohibitions: *"Job title alone MUST NOT determine classification.
Multiple candidates MUST remain visible when evidence cannot select one."*

**PRD §31.3** requires all ten asynchronous states on this job-driven screen, each with a visible
title, plain-language explanation, allowed next action and request/job ID; *"A spinner without state
or recovery guidance is not acceptable."*

**PRD §34.6** fixes the request payload (`legal_as_at`, `employer.{name,abn}`, `work_locations`,
`principal_duties`, `known_agreement_ids`, `known_award_codes`, `retention_mode`,
`research_record_id`) and states that coverage jobs use *"the same job, SSE, idempotency,
cancellation, retention and budget semantics as answers"*.

**PRD §41.1 — Universal UI acceptance** applies in full, including *"works at 360 px, 768 px and
1280 px widths without hiding legal status, citations, primary actions or error recovery"*,
*"colour is never the only status signal"*, *"dates display unambiguously as `3 Aug 2026`"* and
*"customer research content is not placed in URL query strings, analytics, browser error telemetry or
page titles"*.

**PRD §30.2:** `COV-001` — *"Coverage follows system → agreement → award → classification order"*,
evidence *"Stage order is persisted and **shown**"*; `COV-002` — *"Job title alone cannot confirm
award/classification"*, evidence *"Job-title-only test returns candidates/missing facts"*.
**PRD §41.2 `UAT-COV-01`:** *"Supply job title only → Multiple candidates/missing facts; no confirmed
classification."*

**Contracts this ticket builds against (all already published):**

- `RUNT-05`'s A1 web feature contract, the eleven-slot PRD §31.1 nav tuple (this feature claims
  **`COVERAGE`** — sub-PRD **D13**), `orgScopedKey(...)` and `lib/format.ts`.
- `RUNT-06`'s `packages/ui`: `JobStateView` (ten states), `EvidencePanel` in **`candidate`** mode —
  *"renders only the evidence relevant to the selected candidate"* — the status badges,
  `SafeMarkdown`, `DestructiveAction`, `CopyableId` and `packages/ui/test/a11y.ts`, plus the committed
  `packages/ui/test/fixtures/coverage-candidate.json` fixture.
- `ASK-07`'s exported components (`AnswerResultSections`, `ClaimCitationView`, `AnswerStatusBadge`,
  `JobProgressView`, the stream-client hook) — reused so the evidence interaction and the ten
  asynchronous states are identical to an answer's.
- `ASK-08`'s three endpoints (`POST /v1/coverage-assessments`,
  `GET /v1/coverage-assessment-jobs/{jobId}`, `GET /v1/coverage-assessments/{assessmentId}`), its
  seven-stage tuple, its `Candidate` model with per-kind required fields, and its stage SSE
  vocabulary.
- `ASK-06`'s retention/limit copy constants and PII guidance, reused verbatim so the two intake forms
  cannot diverge.
- `ASK-03`'s `POST /v1/answer-jobs/{jobId}/clarifications` for the stage-7 clarification round.

**Accepted caveats carried forward:**

- **"Confirm stated fact" writes a `ResearchTurn`**, which is `17-records-collab`'s surface
  (`RCRD-02`, `apps/api/src/routes/research-turns/**`). This ticket renders the action and calls that
  endpoint; if it has not shipped, the action is rendered disabled-with-reason and stated as a known
  gap in the PR (PRD §45.4). This ticket must not write `features/records/**` or a turns route.
- The result read path `GET /v1/coverage-assessments/{assessmentId}` is sub-PRD open question
  **Q-ASK-1**; this screen consumes whatever `ASK-08` froze.

## Goal

Ship `apps/web/src/features/coverage/**` as a `RUNT-05` feature area serving `/coverage/new` and
`/coverage/:assessmentId`, claiming the `COVERAGE` nav slot, rendering PRD §32.4's three-region layout
— seven-stage left rail, candidate centre panel, candidate-scoped evidence panel — with every
candidate kind showing its full PRD §32.4 field set, and presenting multiple candidates as a normal
outcome rather than an error. Completion is mechanically checkable: the left rail shows the seven PRD
§8.5 stages in order; a job-title-only fixture renders multiple classification candidates plus missing
facts with no confirmed status and no error styling; the evidence panel shows only the selected
candidate's evidence; and the primary action reads "Confirm stated fact", never "accept AI answer".

## Non-goals

- **No API routes or workflow.** `ASK-08` owns all three coverage endpoints and the seven-stage
  worker handler.
- **No `ResearchTurn` write path.** `17-records-collab` (`RCRD-02`) owns
  `apps/api/src/routes/research-turns/**` and `apps/web/src/features/records/**`.
- **No shared UI primitives, async-state view, evidence panel or badges.** `packages/ui` is `RUNT-06`
  (breakdown plan **A6**).
- **No answer or compare screens.** `ASK-07` and `ASK-12`; this ticket **imports** `ASK-07`'s exported
  components rather than duplicating them.
- **No shell, navigation or client HTTP layer.** `apps/web/src/{app,shell,lib}/**` is `RUNT-05`.
- **No PII detection.** `packages/pii` is `12-evidence-safety`; the intake form reuses `ASK-06`'s
  guidance and the server remains authoritative.
- **No cross-boundary E2E or accessibility suite.** `tests/e2e/**` is `23-assurance` (`ASSR-06`,
  `ASSR-07`), which is `blocked_by` this ticket.

## File-scope (write-owns)

- `apps/web/src/features/coverage/**` — including `feature.tsx`.
- `apps/web/test/coverage/**` — this ticket's own component/integration tests (breakdown plan §1.1).
- `apps/web/package.json` — **append-only** (breakdown plan §1.1).

Does not touch:

- `apps/web/src/{app,shell,lib}/**` and `features/home/**` — `RUNT-05`.
- `apps/web/src/features/ask/**` — `ASK-06`; `features/answers/**` — `ASK-07`;
  `features/compare/**` — `ASK-12`.
- Every other `apps/web/src/features/<area>/**` — `13`, `14`, `16`, `17`, `19`, `20`, `24`.
- `packages/ui/**` — `RUNT-06`; `packages/contracts/**` — `00-foundation`;
  `packages/{pii,citations,model-gateway}/**` — `12-evidence-safety`.
- `apps/api/**`, `apps/worker/**`, `schemas/**`, `infra/**`, `tests/**` — `03`, `15`'s own
  `ASK-08`, `00`, `18`, `23`; root manifests and lockfiles — `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown plan §1: phase 1, nothing merged, no
in-flight ticket), so nothing has previously written `apps/web/src/features/coverage/**` and nothing
contends for it. `RUNT-05`'s Vite-glob feature discovery makes adding this directory a zero-diff change
outside itself, which is what keeps `features/{ask,answers,coverage,compare}` disjoint here and
disjoint from the ten feature subtrees other modules own. This feature claims the **`COVERAGE`** nav
slot and no other — `ASK-06` claims `ASK`, `ASK-12` claims `COMPARE`, `ASK-07` claims none (sub-PRD
**D13**) — and a slot claimed twice fails the build, so the assignment is fixed in the sub-PRD rather
than at merge time. Route paths `/coverage/new` and `/coverage/:assessmentId` are unique across every
feature area. The concurrent sibling at this wave is `ASK-12` (`features/compare/**`) — a different
directory, claiming a different slot, importing the same `ASK-07` exports read-only. Per breakdown plan
**A3** this ticket writes no table or repository, and per PRD §45.2 `apps/web` holds no security
boundary.

## Deliverables

1. **`apps/web/src/features/coverage/feature.tsx`** — the `FeatureModule`: `id: 'coverage'`,
   `routes: [{ path: '/coverage/new', element: <NewCoverageScreen /> }, { path:
   '/coverage/:assessmentId', element: <CoverageResultScreen /> }]`,
   `nav: { slot: 'COVERAGE', label: 'Coverage', to: '/coverage/new', visibleWhen: ctx =>
   ctx.can('coverage:create') }` (PRD §31.2 restricts creation to Researcher/Admin/Owner), and
   `onOrganizationChange` dropping every draft, cached job and cached assessment. All cache keys come
   from `orgScopedKey(...)`.
2. **`NewCoverageScreen`** — the PRD §34.6 intake form: `legal_as_at` (defaulting to today, future date
   requiring explicit confirmation), `employer.name` and `employer.abn` (checksum validated inline,
   labelled as public business data), `work_locations` (controlled jurisdiction list),
   `principal_duties` (free text, bounded by `ASK-06`'s facts limit), `known_agreement_ids`,
   `known_award_codes`, `retention_mode` and the Research Record control (required for `SAVE`, hidden
   for `EPHEMERAL`). It reuses `ASK-06`'s exported retention copy and PII guidance constants verbatim
   and, like `ASK-06`, **collects no identifying data and offers no PII override** (PRD §32.2, §10.1).
3. **First-use state — "explains required facts and order of analysis"** (PRD §31.2). Before any
   submission the screen shows the seven PRD §8.5 stages in order with a one-line plain-language
   description of each, and the facts each stage needs. This is the screen's teaching surface, not a
   help modal.
4. **Submission.** One `POST /v1/coverage-assessments` with the draft-stable `Idempotency-Key`
   discipline `ASK-06` established, then navigation to the progress view. Client validation mirrors
   `ASK-08`'s server rules (ABN checksum, jurisdiction membership, future-date confirmation, length
   bounds) and **consumes no quota** — a failed validation sends no request.
5. **Progress view.** Reuses `ASK-07`'s exported `JobProgressView` and stream-client hook against
   `GET /v1/coverage-assessment-jobs/{jobId}` and the job's SSE stream, rendering all ten PRD §31.3
   states through `packages/ui`'s `JobStateView` and `ASK-08`'s seven user-readable stage names, with
   `Last-Event-ID` resume. Cancel uses `ASK-01`'s cancel endpoint through `DestructiveAction` with the
   exact credit effect stated (PRD §33.2, §41.1).
6. **`CoverageResultScreen` — PRD §32.4's three regions.**
   - **Left rail** — the seven PRD §8.5 stages **in order**, each with its status (complete, blocked on
     a missing fact, not reached) and a jump target. The order is read from `ASK-08`'s persisted stage
     list, never re-declared here (`COV-001` evidence *"Stage order is persisted and shown"*).
   - **Centre panel** — the facts and candidates for the **active** stage.
   - **Right panel** — `packages/ui`'s `EvidencePanel` in **`candidate`** mode, showing **only** the
     selected candidate's evidence (PRD §32.4). Selection state is held here and passed down; the
     panel holds none (`RUNT-06` deliverable 3).
7. **Candidate rows with their full PRD §32.4 field sets.** Four row components, each rendering every
   required field and failing a test if one is missing:
   - **Workplace system** — candidate system, status, decisive facts, evidence, unresolved exclusions;
   - **Agreement** — title, agreement ID/matter, employer/ABN match, approval / start /
     nominal-expiry / termination dates, current lifecycle status, evidence;
   - **Award** — award code/title, industry/occupation basis, coverage clause, exclusions, candidate
     status;
   - **Classification** — award/agreement, level, duties matched, qualifications/responsibility facts,
     missing facts, candidate status.
   Dates render `3 Aug 2026` (PRD §41.1); statuses render **text plus icon/shape**, never colour alone.
8. **"Multiple candidates are normal, not an error."** A stage with more than one candidate renders
   with **neutral** framing, a plain-language explanation of why the evidence could not select one, and
   the decisive facts that would resolve it. It uses no error styling, no warning icon and no
   `role="alert"`. A committed test asserts the absence of error-styled elements in the multi-candidate
   state (PRD §31.2, §8.5).
9. **The six candidate statuses.** All of `CONFIRMED_FROM_STATED_FACTS`, `LIKELY`, `POSSIBLE`,
   `UNLIKELY`, `EXCLUDED` and `INSUFFICIENT_EVIDENCE` render with distinct text plus icon/shape and a
   short plain-language meaning. Values come from `packages/contracts` (`FND-03`); none is declared
   locally (PRD §35.1).
10. **"Confirm stated fact" as the primary action.** The primary action on a candidate row is
    **Confirm stated fact** — confirming a *fact the user knows*, never accepting a model conclusion.
    The label "accept", "approve" or "accept AI answer" appears nowhere in this feature (asserted by a
    source and DOM scan). Confirming posts an immutable `ResearchTurn` through `17-records-collab`'s
    turns endpoint and then triggers a rerun of the affected stages; the screen states which stages
    will rerun before the user commits (PRD §32.4).
11. **Decisive missing facts and clarification.** Stage 7's decisive missing facts render as a
    first-class section, each naming the decision it affects, with an answer control that submits to
    `ASK-03`'s clarification endpoint including an explicit **"unknown"** option and the statement that
    unknown produces a conditional or multiple-candidate outcome. Nothing is pre-filled (PRD §33.3,
    §8.5 step 7).
12. **Evidence interaction.** Selecting a candidate's citation opens the same `EvidencePanel`
    interaction `ASK-07` uses, exposing exact text, pinpoint, effective interval, authority role,
    official URL and the `supports | qualifies | contradicts` relation (PRD §32.3 applied to coverage
    evidence). Negative conclusions (`EXCLUDED`, award-free) display their **pinpoint** exclusion
    citation next to the conclusion, so `COV-004` is visible rather than implied.
13. **Content hygiene and reload safety.** Routes carry ids only; no customer research content in the
    URL, page title, analytics or error telemetry. Refresh, back/forward and reconnect re-read state
    and never re-submit an assessment, a confirmation or a clarification (PRD §41.1).
14. **Accessibility.** One programmatic page heading per screen, a labelled stage rail with correct
    landmark/`aria` semantics, labelled fields, an error summary, a live region for streaming status,
    visible focus with logical order, colour never the only signal, and full operation at
    360/768/1280 px **without hiding legal status, citations, primary actions or error recovery** —
    the three-region layout collapses to a navigable single column at 360 px. Verified with `RUNT-06`'s
    `packages/ui/test/a11y.ts` harness (PRD §13.1, §41.1).

## Acceptance checklist (classified)

- [ ] `[machine]` The feature registers `/coverage/new` and `/coverage/:assessmentId`, claims nav slot
      `COVERAGE`, and produces **zero** diff outside `apps/web/src/features/coverage/**` — `RUNT-05`'s
      `feature-conformance` helper (A1; sub-PRD **D13**)
- [ ] `[machine]` **`COV-001`**: the left rail renders the seven PRD §8.5 stages **in order**, read from
      the persisted assessment — asserted against the literal stage list, so a reorder fails (§30.2
      `COV-001` *"Stage order is persisted and shown"*)
- [ ] `[machine]` The first-use state explains the required facts and the order of analysis before any
      submission (PRD §31.2)
- [ ] `[machine]` **PRD §32.4 field sets**: each of the four candidate row kinds renders every required
      field — four table-driven tests over the literal field lists, so a missing field fails
- [ ] `[fixture]` **`COV-002` / `UAT-COV-01`**: rendering a committed job-title-only assessment fixture
      shows **multiple** classification candidates plus decisive missing facts, with **no** candidate at
      `CONFIRMED_FROM_STATED_FACTS` (§30.2 `COV-002`)
- [ ] `[machine]` **"Multiple candidates are normal, not an error"**: the multi-candidate state contains
      no error styling, no warning icon and no `role="alert"`, and carries a plain-language explanation
      plus the resolving facts — asserted by a rendered-DOM scan (PRD §31.2, §8.5)
- [ ] `[machine]` All six PRD §8.5 candidate statuses render with distinct text plus icon/shape and a
      plain-language meaning; colour is never the only signal (PRD §8.5, §41.1)
- [ ] `[machine]` **PRD §32.4 primary action**: the candidate primary action is labelled "Confirm stated
      fact"; the strings "accept AI answer", "accept" and "approve" appear nowhere in this feature —
      source and DOM scan
- [ ] `[machine]` Confirming a fact posts an immutable `ResearchTurn` and states which stages will
      rerun before committing; when the turns endpoint is unavailable the action is rendered
      disabled-with-reason, never silently no-op (PRD §32.4)
- [ ] `[machine]` The right panel renders **only** the selected candidate's evidence — asserted by
      supplying a second candidate's evidence in props and requiring its absence from the output
      (PRD §32.4; `RUNT-06` deliverable 3)
- [ ] `[machine]` A negative conclusion (`EXCLUDED`, award-free, agreement not applicable) displays its
      pinpoint exclusion citation adjacent to the conclusion (PRD §8.5; `COV-004`)
- [ ] `[machine]` **PRD §31.3**: all ten asynchronous states render with title, explanation, allowed
      action and copyable id; no bare spinner exists (source scan)
- [ ] `[fixture]` SSE resume: replaying a recorded coverage event log with a disconnect mid-stream
      renders each stage transition exactly once, with no duplicate completion (PRD §34.4; `ANS-003`)
- [ ] `[machine]` Decisive missing facts render with the decision each affects, offer an explicit
      "unknown" option, pre-fill nothing, and submit to `ASK-03`'s endpoint (PRD §33.3, §8.5 step 7)
- [ ] `[machine]` The intake form collects no identifying data, offers no PII override, and reuses
      `ASK-06`'s retention and guidance constants verbatim (PRD §32.2, §10.1, §10.4)
- [ ] `[machine]` Client validation blocks submission with **no** network request for a bad ABN
      checksum, a jurisdiction outside the nine values, an over-length duties field and an unconfirmed
      future legal date (PRD §34.9)
- [ ] `[machine]` **PRD §41.1 content hygiene**: a canary in the duties field appears in no
      `location.href`, `document.title`, analytics call or error-telemetry payload
- [ ] `[machine]` **PRD §41.1 reload safety**: refresh, back/forward and reconnect issue no duplicate
      `POST` to assessments, confirmations or clarifications
- [ ] `[machine]` Organisation switch clears every draft, job and assessment cache — `RUNT-05`'s
      `org-scope-conformance` helper (PRD §31.1; `AUTH-002`)
- [ ] `[machine]` No `packages/ui` component is re-implemented, no `ASK-07` export is duplicated, and no
      controlled value is declared locally (breakdown plan **A6**, §4.1; PRD §35.1)
- [ ] `[machine]` Accessibility: `RUNT-06`'s a11y harness passes at 360, 768 and 1280 px; the
      three-region layout collapses to a navigable single column at 360 px **without hiding legal
      status, citations, primary actions or error recovery**; one programmatic heading per screen; dates
      render `3 Aug 2026` (PRD §13.1, §41.1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `COV-001`, `COV-002` and `UAT-COV-01`
- [ ] `[human]` `UAT-COV-01`, `UAT-COV-02` and `UAT-COV-03` rehearsed in a browser, plus the PRD §41.1
      universal UI review at the three widths and the PRD §43.4 founder review of the
      "multiple candidates is normal" framing and the "Confirm stated fact" wording (PRD §41.2, §41.1,
      §43.4). Gate 2 smoke items — **not required to merge**; the `[machine]`/`[fixture]` rows are the
      merge gate
- [ ] No `cargo test --workspace` / `uv run pytest` item — no Rust or Python is touched (PRD §45.3)

## Test plan

Reviewer steps, all reproducible offline with no network and no provider key.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/web`. Suites live under `apps/web/test/coverage/`.
3. **Harness.** `RUNT-05`'s component test setup, `RUNT-06`'s `packages/ui/test/a11y.ts` and
   `packages/ui/test/fixtures/coverage-candidate.json`, `ASK-07`'s exported components, a fake SSE
   transport replaying a committed coverage event log, and a request-capturing API-client fake seeded
   from committed assessment fixtures under `apps/web/test/coverage/fixtures/`: a job-title-only
   assessment (multiple classification candidates, no confirmed status), an agreement-chain assessment
   (`UAT-COV-02` shape), an award-free assessment **with** a pinpoint exclusion citation, and an
   assessment blocked at stage 3 on a missing fact. All synthetic (PRD §45.1 item 6; breakdown plan
   **R9**).
4. **`feature.test.tsx`** — `RUNT-05`'s `feature-conformance` helper; assert both routes, the
   `COVERAGE` slot claim, and a clean `git status --porcelain` after the run.
5. **`rail.test.tsx`** — assert the left rail's seven entries equal PRD §8.5's order as persisted in
   the fixture, that each shows its stage state, and that reordering the fixture reorders the rail
   (proving it is read, not hard-coded).
6. **`candidate-fields.test.tsx`** — four table-driven suites over PRD §32.4's field lists; each
   asserts every field is present for its candidate kind and that a missing field fails.
7. **`multiple-candidates.test.tsx`** (`UAT-COV-01`) — render the job-title-only fixture; assert ≥2
   classification candidates, a non-empty missing-facts section, no `CONFIRMED_FROM_STATED_FACTS`, and
   **no** element with error styling, a warning icon or `role="alert"` in that region.
8. **`evidence.test.tsx`** — supply two candidates' evidence; select one; assert the other's evidence
   is absent from the output. Select a citation and assert all six PRD §32.3 fields render. Render the
   award-free fixture and assert the exclusion citation is adjacent to the conclusion.
9. **`confirm.test.tsx`** — assert the primary action label, assert the affected-stage statement
   appears before commit, capture the outbound `ResearchTurn` request, and assert the
   disabled-with-reason rendering when the endpoint fixture returns unavailable. Then scan source and
   DOM for "accept AI answer", "accept" and "approve".
10. **`states.test.tsx`** — the ten PRD §31.3 states via `ASK-07`'s `JobProgressView`; a source scan for
    bare spinners.
11. **`resume.test.tsx`** — replay the coverage event log with a mid-stream disconnect and
    `Last-Event-ID` reconnect; assert each stage transition once and exactly one completion.
12. **`intake.test.tsx`** — the five client-validation cases with zero captured requests; assert the
    retention and PII copy is byte-identical to `ASK-06`'s exported constants.
13. **`hygiene.test.tsx`** and **`org-switch.test.tsx`** — the canary and `org-scope-conformance`
    checks.
14. **`a11y.test.tsx`** — the `RUNT-06` harness at 360/768/1280 px, additionally asserting the
    single-column collapse keeps status, citations, primary actions and error recovery visible.
15. Reviewer greps the diff for: any file outside `apps/web/src/features/coverage/**` and
    `apps/web/test/coverage/**`, any hard-coded stage list, any local re-implementation of a
    `packages/ui` or `ASK-07` component, any literal enum array, any error styling in the
    multi-candidate state, and any "accept"-flavoured action label.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), then `docs/prd/15-answer-product/README.md`, then
`.claude/scripts/publish-tickets.mjs --sync`, and only then change code (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **The three-region layout does not fit 360 px** → PRD §41.1 requires operation at 360 px *"without
  hiding legal status, citations, primary actions or error recovery"* and PRD §32.4 fixes the regions.
  Collapse to a navigable single column with the same content; never drop the evidence panel or the
  stage rail. If genuinely impossible, that is a **product change** under PRD §45.5 — raise it in
  `docs/prd/15-answer-product/README.md` with the Founder as owner.
- **`ASK-08`'s assessment payload lacks a PRD §32.4 field** → do not derive it client-side and do not
  render a blank. Raise it as an open question in `docs/prd/15-answer-product/README.md` and amend
  `ASK-08`'s serialiser in one docs PR, then `--sync` both.
- **`packages/ui`'s `EvidencePanel` `candidate` mode cannot express a needed interaction** → add it in
  `RUNT-06` (breakdown plan **A6**), not here. A local evidence panel would fragment the guarantee
  across three surfaces.
- **`17-records-collab`'s turns endpoint has not shipped** → render "Confirm stated fact"
  disabled-with-reason, state it as a known gap in the PR (PRD §45.4), and record it in
  `docs/prd/15-answer-product/README.md`. Do not write `features/records/**` or a turns route.
- **Stakeholders ask for a single "recommended" award or classification** → PRD §8.5 requires multiple
  candidates to remain visible, and PRD §32.4 makes the primary action "Confirm stated fact", *not*
  "accept AI answer". Record the request in `docs/prd/15-answer-product/README.md` and route it to the
  Founder as a product change; never add a client-side tie-breaker or a "best match" highlight that
  manufactures a single answer.
- **`ASK-07`'s exported component surface does not fit a coverage need** → amend `ASK-07` in a docs PR
  and `--sync` both; never fork the result/evidence components.

**3. Escalation.** Two rules here are the product's central invariants, not presentation choices:
**multiple candidates must remain visible and read as normal** and **the primary action is confirming
a user's own stated fact, not accepting a model conclusion** (PRD §8.5, §32.4). A UI that highlights a
single "best" candidate, styles ambiguity as an error, or invites the user to accept an AI answer
converts an evidence-bounded assessment into an unvalidated recommendation — exactly the failure PRD
§9.4 exists to prevent. Stop, escalate for re-review through the PRD §45.5 product-change path, and
record the outcome in `docs/prd/15-answer-product/README.md` and `docs/prd/breakdown-plan.md`. Never
add the affordance inside this ticket.
