---
id: ASK-12
title: Compare screens
module: 15-answer-product
lane: 15-answer-product
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [ASK-11, ASK-07]
blocks: [ASSR-06]
---

# ASK-12 — Compare screens

Implements PRD §32.5 (Compare screen contract) and §41.1 (universal UI acceptance), carrying
requirement **CMP-002** (`E23`).
**No ADR — the decision is already made in PRD §32.5 and §8.6; this is build ticket 12 of 12 against
it.**
Parent sub-PRD: [15-answer-product README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`ASK-11` — Compare workflow (TIME / JURISDICTION / AUTHORITY_OR_INSTRUMENT)](ASK-11-compare-workflow-time-jurisdiction-authority-or-instrument.md) ·
[`ASK-07` — Answer progress and result screens](ASK-07-answer-progress-and-result-screens.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(PRD §32.5's setup bounds and result regions) — not a new subsystem decision.

## Background + basis

A side-by-side layout is a claim in itself: it says "these things are comparable, and here is each
one". The most dangerous failure on this screen is silent — a column that quietly disappears, or a
blank cell the reader fills in themselves. PRD §31.2 states the rule as the screen's own empty state:

> `/compare/new` | New comparison | Researcher/Admin/Owner | Configure dimensions | Templates for
> time/jurisdiction/instrument
> `/comparisons/:snapshotId` | Comparison result | authorised record members | Read side-by-side
> evidence | **Missing dimension visibly unavailable**

**PRD §32.5 — Compare** is normative and reproduced in full:

> The setup screen requires **exactly one comparison type per job**:
>
> - `TIME`: same issue/instrument at 2–4 legal dates;
> - `JURISDICTION`: same issue at 2–9 jurisdictions and one legal date;
> - `AUTHORITY_OR_INSTRUMENT`: 2–4 named documents/versions.
>
> The result includes a **common issue row, one column per dimension, textual change, legal-effect
> change, claim/citation set, gaps and a synthesis that never hides a missing column**. Users can open
> any cell as an evidence panel.

**PRD §8.6:** *"The product MUST distinguish textual changes from changes in legal effect. **An
evidence failure in one dimension MUST NOT cause fabricated symmetry in other dimensions.**"*

**PRD §31.3** requires all ten asynchronous states on this job-driven screen, each with a visible
title, plain-language explanation, allowed next action and request/job ID; *"A spinner without state
or recovery guidance is not acceptable."*

**PRD §41.1 — Universal UI acceptance** applies in full, and its 360 px rule is load-bearing here:
*"works at 360 px, 768 px and 1280 px widths **without hiding legal status, citations, primary actions
or error recovery**"*. A responsive design that drops a column on a narrow screen would violate both
§41.1 and §32.5's "never hides a missing column".

**PRD §30.2 `CMP-002`:** *"A missing side remains unavailable rather than being made symmetrical"*,
primary route `/compare/new`, evidence *"One-sided-source fixture passes"*.
**PRD §41.2 `UAT-CMP-01`/`UAT-CMP-02`:**

> `UAT-CMP-01` — Compare same instrument across two legal dates → *Each column uses its own version;
> textual and legal-effect changes distinguished*
> `UAT-CMP-02` — One jurisdiction source unavailable → *Available columns remain; missing column
> clearly unavailable, not fabricated*

**Contracts this ticket builds against (all already published):**

- `RUNT-05`'s A1 web feature contract, the eleven-slot PRD §31.1 nav tuple (this feature claims
  **`COMPARE`** — sub-PRD **D13**), `orgScopedKey(...)` and `lib/format.ts`.
- `RUNT-06`'s `packages/ui`: `JobStateView` (ten states), `EvidencePanel` in `claim` mode, the status
  badges, `SafeMarkdown`, `CopyableId`, `DestructiveAction` and `packages/ui/test/a11y.ts`.
- `ASK-07`'s exported components (`AnswerResultSections`, `ClaimCitationView`, `AnswerStatusBadge`,
  `JobProgressView`, the stream-client hook) — reused so the evidence interaction and the ten
  asynchronous states are identical to an answer's.
- `ASK-11`'s three endpoints (`POST /v1/comparisons`, `GET /v1/comparison-jobs/{jobId}`,
  `GET /v1/comparisons/{comparisonSnapshotId}`), its per-dimension result shape
  (`label`, `availability`, `legal_as_at`, `jurisdictions`, `document_version_ids`, `claims`,
  `citations`, `assumptions`, `gaps`, `textual_change`, `legal_effect_change`, `unavailable_reason`),
  its `availability` vocabulary and its stage SSE vocabulary.
- `ASK-06`'s retention/limit copy constants and PII guidance, reused verbatim.

**Accepted caveats carried forward:**

- The comparison result read path is sub-PRD open question **Q-ASK-2**; this screen consumes whatever
  `ASK-11` froze.
- Export of a comparison is `19-exports` (`XPRT-05`), and saving to a record is `17-records-collab`.
  This screen renders those actions and, where the owning module has not shipped, renders them
  disabled-with-reason and states the gap in the PR (PRD §45.4).

## Goal

Ship `apps/web/src/features/compare/**` as a `RUNT-05` feature area serving `/compare/new` and
`/comparisons/:snapshotId`, claiming the `COMPARE` nav slot, enforcing PRD §32.5's one-type-per-job
setup bounds with templates for each type, and rendering the result as a common issue row plus one
column per dimension with textual change, legal-effect change, claims/citations, gaps and a synthesis
that never hides a missing column. Completion is mechanically checkable: a one-sided-source fixture
renders the unavailable column **present and explicitly unavailable with its reason**, with no cell
content, no borrowed citation and no error styling on the available columns; and the column remains
visible and reachable at 360 px.

## Non-goals

- **No API routes or workflow.** `ASK-11` owns all three comparison endpoints and the worker handler.
- **No answer or coverage screens.** `ASK-07` and `ASK-09`; this ticket **imports** `ASK-07`'s exported
  components rather than duplicating them.
- **No shared UI primitives, async-state view, evidence panel or badges.** `packages/ui` is `RUNT-06`
  (breakdown plan **A6**).
- **No shell, navigation or client HTTP layer.** `apps/web/src/{app,shell,lib}/**` is `RUNT-05`.
- **No diffing logic.** `textual_change` and `legal_effect_change` are computed and validated
  server-side by `ASK-11`; this screen renders them and computes **no** difference of its own.
- **No export or record surfaces.** `19-exports` (`XPRT-05`) and `17-records-collab` (`RCRD-08`).
- **No PII detection.** `packages/pii` is `12-evidence-safety`; the setup form reuses `ASK-06`'s
  guidance and the server remains authoritative.
- **No cross-boundary E2E or accessibility suite.** `tests/e2e/**` is `23-assurance` (`ASSR-06`,
  `ASSR-07`), which is `blocked_by` this ticket.

## File-scope (write-owns)

- `apps/web/src/features/compare/**` — including `feature.tsx`.
- `apps/web/test/compare/**` — this ticket's own component/integration tests (breakdown plan §1.1).
- `apps/web/package.json` — **append-only** (breakdown plan §1.1).

Does not touch:

- `apps/web/src/{app,shell,lib}/**` and `features/home/**` — `RUNT-05`.
- `apps/web/src/features/ask/**` — `ASK-06`; `features/answers/**` — `ASK-07`;
  `features/coverage/**` — `ASK-09`.
- Every other `apps/web/src/features/<area>/**` — `13`, `14`, `16`, `17`, `19`, `20`, `24`.
- `packages/ui/**` — `RUNT-06`; `packages/contracts/**` — `00-foundation`;
  `packages/{pii,citations,model-gateway}/**` — `12-evidence-safety`.
- `apps/api/**`, `apps/worker/**`, `schemas/**`, `infra/**`, `tests/**` — `03`, this module's own
  `ASK-11`, `00`, `18`, `23`; root manifests and lockfiles — `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown plan §1: phase 1, nothing merged, no
in-flight ticket), so nothing has previously written `apps/web/src/features/compare/**` and nothing
contends for it. `RUNT-05`'s Vite-glob feature discovery makes adding this directory a zero-diff change
outside itself, which is what keeps `features/{ask,answers,coverage,compare}` disjoint here and
disjoint from the ten feature subtrees other modules own. This feature claims the **`COMPARE`** nav
slot and no other — `ASK-06` claims `ASK`, `ASK-09` claims `COVERAGE`, `ASK-07` claims none (sub-PRD
**D13**) — and a slot claimed twice fails the build, so the assignment is fixed in the sub-PRD rather
than at merge time. Route paths `/compare/new` and `/comparisons/:snapshotId` are unique across every
feature area. The concurrent sibling at this wave is `ASK-09` (`features/coverage/**`) — a different
directory, claiming a different slot, importing the same `ASK-07` exports read-only. Per breakdown plan
**A3** this ticket writes no table or repository, and per PRD §45.2 `apps/web` holds no security
boundary.

## Deliverables

1. **`apps/web/src/features/compare/feature.tsx`** — the `FeatureModule`: `id: 'compare'`,
   `routes: [{ path: '/compare/new', element: <NewComparisonScreen /> }, { path:
   '/comparisons/:snapshotId', element: <ComparisonResultScreen /> }]`,
   `nav: { slot: 'COMPARE', label: 'Compare', to: '/compare/new', visibleWhen: ctx =>
   ctx.can('answers:create') }` (PRD §31.2 restricts creation to Researcher/Admin/Owner), and
   `onOrganizationChange` dropping every draft, cached job and cached comparison. All cache keys come
   from `orgScopedKey(...)`.
2. **`NewComparisonScreen` — exactly one comparison type per job.** A type selector
   (`TIME` / `JURISDICTION` / `AUTHORITY_OR_INSTRUMENT`) drives a type-specific dimension editor, and
   the three editors are mutually exclusive by construction — a body carrying two types is
   unrepresentable in the UI state (PRD §32.5). Bounds are enforced inline and mirror `ASK-11`'s server
   validation:
   - `TIME` — 2–4 dimensions, each with its own `legal_as_at`, one shared issue/instrument;
   - `JURISDICTION` — 2–9 dimensions over the controlled jurisdiction list, **one** shared
     `legal_as_at`;
   - `AUTHORITY_OR_INSTRUMENT` — 2–4 named documents/versions.
   Duplicate labels, out-of-range counts and unknown jurisdictions block submission **with no network
   request** (no quota consumed).
3. **Templates — the PRD §31.2 first-use state.** One worked template per type
   ("this instrument before and after a known amendment", "this issue across two states", "these two
   named instruments"), each pre-filling structure only — labels, dates, jurisdiction slots — and never
   a question or a fact.
4. **Shared intake fields.** `question`, `retention_mode` and the Research Record control (required for
   `SAVE`, hidden for `EPHEMERAL`) reuse `ASK-06`'s exported retention copy and PII guidance constants
   verbatim; like `ASK-06`, this form **collects no identifying data and offers no PII override**
   (PRD §32.2, §10.1, §10.4).
5. **Submission.** One `POST /v1/comparisons` with the draft-stable `Idempotency-Key` discipline
   `ASK-06` established, then navigation to the progress view.
6. **Progress view.** Reuses `ASK-07`'s exported `JobProgressView` and stream-client hook against
   `GET /v1/comparison-jobs/{jobId}` and the job's SSE stream, rendering all ten PRD §31.3 states
   through `JobStateView` with `ASK-11`'s user-readable stage names (including the per-dimension
   `Comparing <label>` progress), and `Last-Event-ID` resume. Cancel uses `ASK-01`'s cancel endpoint
   through `DestructiveAction` with the exact credit effect stated (PRD §33.2, §41.1).
7. **`ComparisonResultScreen` — PRD §32.5's result regions, in this order:**
   1. **common issue row** — the single issue every column answers, stated once;
   2. **one column per dimension** — every dimension in `dimensions[]`, in request order, **including
      unavailable ones**;
   3. **textual change** — rendered from `ASK-11`'s server-computed value, visually distinct from…
   4. **legal-effect change** — rendered from the validated claim-level determination, with an explicit
      `INSUFFICIENT_EVIDENCE` presentation where the evidence supports only "the text differs"
      (PRD §8.6);
   5. **claim/citation set** — per column, using `ASK-07`'s `ClaimCitationView`;
   6. **gaps** — per column;
   7. **synthesis** — rendered with the unavailable columns named in it, never omitted.
8. **The unavailable column, made loud.** A dimension whose `availability != AVAILABLE` renders as a
   **present, clearly labelled column** carrying its `unavailable_reason` in plain language and the
   allowed next action (for example "check the official source" or "retry when freshness recovers").
   It has **no** cell content, **no** borrowed citation and **no** placeholder text that could be read
   as a finding. The available columns are rendered unchanged — no error styling, no warning banner
   over the whole result (PRD §8.6, §32.5, §31.2; `CMP-002`).
9. **Every cell opens as an evidence panel.** Selecting any cell opens `packages/ui`'s `EvidencePanel`
   in `claim` mode for that **column's own** claims and citations, exposing exact text, pinpoint,
   effective interval, authority role, official URL and the `supports | qualifies | contradicts`
   relation (PRD §32.5 *"Users can open any cell as an evidence panel"*; PRD §32.3). A cell in an
   unavailable column has no evidence panel and says so.
10. **Column identity is explicit.** Each column header states its `label`, its `legal_as_at`
    (rendered `3 Aug 2026`), its jurisdictions and, where applicable, the exact
    `document_version_id`/version it opened — so `UAT-CMP-01`'s "each column uses its own version" is
    visible, not implied (PRD §32.5, §41.1).
11. **The synthesis never hides a missing column.** The synthesis region renders the server-produced
    synthesis together with a persistent, non-dismissible list of the unavailable columns and their
    reasons, positioned so it cannot be scrolled past independently of the synthesis text
    (PRD §32.5).
12. **Responsive behaviour that cannot drop a column.** At 768 px and 360 px the columns become a
    horizontally navigable or stacked sequence in which **every** column — including unavailable ones —
    remains reachable, with legal status, citations, primary actions and error recovery visible.
    Collapsing is permitted; omission is not (PRD §41.1, §32.5).
13. **Content hygiene and reload safety.** Routes carry ids only; no customer research content in the
    URL, page title, analytics or error telemetry. Refresh, back/forward and reconnect re-read state
    and never re-submit a comparison (PRD §41.1).
14. **Accessibility.** One programmatic page heading per screen, the comparison rendered with correct
    table/grid semantics and column headers associated with cells, labelled fields, an error summary, a
    live region for streaming status, visible focus with logical order, colour never the only signal —
    an unavailable column is marked by text plus an icon/shape, never by grey alone — and full
    operation at 360/768/1280 px. Verified with `RUNT-06`'s `packages/ui/test/a11y.ts` harness
    (PRD §13.1, §41.1).

## Acceptance checklist (classified)

- [ ] `[machine]` The feature registers `/compare/new` and `/comparisons/:snapshotId`, claims nav slot
      `COMPARE`, and produces **zero** diff outside `apps/web/src/features/compare/**` — `RUNT-05`'s
      `feature-conformance` helper (A1; sub-PRD **D13**)
- [ ] `[machine]` **PRD §32.5 setup**: exactly one comparison type per job is representable; the
      per-type bounds (2–4 / 2–9 / 2–4) are enforced inline; duplicate labels, out-of-range counts and
      unknown jurisdictions block submission with **no** network request
- [ ] `[machine]` One template per comparison type exists and pre-fills structure only — never a
      question or a fact (PRD §31.2)
- [ ] `[machine]` **PRD §32.5 result regions**: common issue row, one column per dimension, textual
      change, legal-effect change, claim/citation set, gaps and synthesis all render, in that order —
      asserted against the literal region list
- [ ] `[fixture]` **`CMP-002` / `UAT-CMP-02`**: rendering the one-sided-source fixture shows the
      unavailable column **present and explicitly unavailable** with its reason and next action, with
      **no** cell content, **no** borrowed citation and **no** placeholder that reads as a finding; the
      available columns render byte-identically to a control run without the failing column (§30.2
      `CMP-002`)
- [ ] `[machine]` The available columns carry no error styling and no whole-result warning banner when
      one column is unavailable (PRD §8.6, §32.5)
- [ ] `[fixture]` **`UAT-CMP-01`**: a two-date `TIME` fixture renders each column's own `legal_as_at`
      and its own `document_version_id`/version in the header, and shows textual change and
      legal-effect change as **visually distinct** findings (PRD §8.6, §32.5)
- [ ] `[machine]` Where `legal_effect_change` is `INSUFFICIENT_EVIDENCE`, the screen says so explicitly
      and never renders it as "no change in effect" (PRD §8.6)
- [ ] `[machine]` No difference is computed client-side — a source scan finds no local text-diff or
      effect-inference logic; both values come from `ASK-11`'s payload (PRD §8.6, §9.4)
- [ ] `[machine]` **PRD §32.5**: any cell in an available column opens an `EvidencePanel` showing that
      column's **own** claims and citations with all six PRD §32.3 fields; a cell in an unavailable
      column has no evidence panel and says so
- [ ] `[machine]` A citation rendered under a column belongs to that column — asserted by seeding a
      fixture where two columns have distinct citation ids and requiring no cross-appearance
      (PRD §8.6)
- [ ] `[machine]` The synthesis region renders the unavailable columns and their reasons persistently
      and non-dismissibly alongside the synthesis text (PRD §32.5)
- [ ] `[machine]` **PRD §41.1 responsive**: at 360 px and 768 px every column — including unavailable
      ones — remains reachable, and legal status, citations, primary actions and error recovery stay
      visible; no column is omitted at any width
- [ ] `[machine]` **PRD §31.3**: all ten asynchronous states render with title, explanation, allowed
      action and copyable id; no bare spinner exists (source scan)
- [ ] `[fixture]` SSE resume: replaying a recorded comparison event log with a mid-stream disconnect
      renders each stage transition exactly once, with no duplicate completion (PRD §34.4; `ANS-003`)
- [ ] `[machine]` The setup form collects no identifying data, offers no PII override, and reuses
      `ASK-06`'s retention and guidance constants verbatim (PRD §32.2, §10.1, §10.4)
- [ ] `[machine]` **PRD §41.1 content hygiene**: a canary in the question appears in no
      `location.href`, `document.title`, analytics call or error-telemetry payload
- [ ] `[machine]` **PRD §41.1 reload safety**: refresh, back/forward and reconnect issue no duplicate
      `POST /v1/comparisons`
- [ ] `[machine]` Organisation switch clears every draft, job and comparison cache — `RUNT-05`'s
      `org-scope-conformance` helper (PRD §31.1; `AUTH-002`)
- [ ] `[machine]` No `packages/ui` component is re-implemented, no `ASK-07` export is duplicated, and no
      controlled value (comparison types, jurisdictions, availability values) is declared locally
      (breakdown plan **A6**, §4.1; PRD §35.1)
- [ ] `[machine]` Accessibility: `RUNT-06`'s a11y harness passes at 360, 768 and 1280 px; the
      comparison uses correct table/grid semantics with headers associated to cells; an unavailable
      column is marked by text plus icon/shape, never grey alone; one programmatic heading per screen;
      dates render `3 Aug 2026` (PRD §13.1, §41.1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `CMP-002`, `UAT-CMP-01` and `UAT-CMP-02`
- [ ] `[human]` `UAT-CMP-01` and `UAT-CMP-02` rehearsed in a browser, plus the PRD §41.1 universal UI
      review at the three widths and the PRD §43.4 founder review of the unavailable-column presentation
      (PRD §41.2, §41.1, §43.4). Gate 2 smoke items — **not required to merge**; the
      `[machine]`/`[fixture]` rows are the merge gate
- [ ] No `cargo test --workspace` / `uv run pytest` item — no Rust or Python is touched (PRD §45.3)

## Test plan

Reviewer steps, all reproducible offline with no network and no provider key.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/web`. Suites live under `apps/web/test/compare/`.
3. **Harness.** `RUNT-05`'s component test setup, `RUNT-06`'s `packages/ui/test/a11y.ts`, `ASK-07`'s
   exported components, a fake SSE transport replaying a committed comparison event log, and a
   request-capturing API-client fake seeded from committed fixtures under
   `apps/web/test/compare/fixtures/`: a two-date `TIME` comparison with distinct versions
   (`UAT-CMP-01`), a three-jurisdiction comparison with one column unavailable (`UAT-CMP-02`), a
   control three-jurisdiction comparison with all columns available, and a comparison whose
   `legal_effect_change` is `INSUFFICIENT_EVIDENCE`. All synthetic (PRD §45.1 item 6).
4. **`feature.test.tsx`** — `RUNT-05`'s `feature-conformance` helper; assert both routes, the
   `COMPARE` slot claim, and a clean `git status --porcelain` after the run.
5. **`setup.test.tsx`** — assert exactly one type is selectable and the three editors are mutually
   exclusive; drive 1 and 5 `TIME` dimensions, 1 and 10 `JURISDICTION` dimensions, 1 and 5
   `AUTHORITY_OR_INSTRUMENT` documents, a duplicate label and an unknown jurisdiction; assert
   submission is blocked and **zero** requests were captured. Assert each template pre-fills structure
   only.
6. **`regions.test.tsx`** — render the control fixture and assert the seven PRD §32.5 regions render in
   order.
7. **`unavailable.test.tsx`** (`UAT-CMP-02`) — render the one-sided fixture; assert the unavailable
   column is present with its reason and next action, has no cell content, no citation and no
   placeholder text; assert the available columns' rendered output equals the control fixture's; assert
   no error styling or whole-result warning banner; assert the synthesis region lists the unavailable
   column persistently and that it cannot be dismissed.
8. **`time.test.tsx`** (`UAT-CMP-01`) — render the two-date fixture; assert each header states its own
   `legal_as_at` (rendered `3 Aug 2026`) and its own version id, and that textual change and
   legal-effect change are separate, visually distinct elements.
9. **`effect.test.tsx`** — render the `INSUFFICIENT_EVIDENCE` fixture; assert the explicit presentation
   and that the string "no change in effect" appears nowhere.
10. **`cells.test.tsx`** — open a cell in each available column; assert the panel shows that column's
    own claims and citations with all six PRD §32.3 fields; assert no citation id from column B appears
    under column A; open a cell in the unavailable column and assert the explanatory state.
11. **`no-client-diff.test.tsx`** — source scan for any local text-diff or effect-inference
    implementation; assert both values are read from the payload.
12. **`responsive.test.tsx`** — render at 360, 768 and 1280 px; assert every column, including the
    unavailable one, is reachable at each width and that status, citations, primary actions and error
    recovery remain visible.
13. **`states.test.tsx`** and **`resume.test.tsx`** — the ten PRD §31.3 states via `ASK-07`'s
    `JobProgressView`; the mid-stream disconnect and `Last-Event-ID` reconnect.
14. **`hygiene.test.tsx`**, **`org-switch.test.tsx`** and **`a11y.test.tsx`** — the canary check,
    `org-scope-conformance`, and the `RUNT-06` harness plus table/grid semantics assertions.
15. Reviewer greps the diff for: any file outside `apps/web/src/features/compare/**` and
    `apps/web/test/compare/**`, any local diff computation, any column filtered out of the render, any
    placeholder string in an unavailable cell, any cross-column citation rendering, any literal enum
    array, and any local re-implementation of a `packages/ui` or `ASK-07` component.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), then `docs/prd/15-answer-product/README.md`, then
`.claude/scripts/publish-tickets.mjs --sync`, and only then change code (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **Nine `JURISDICTION` columns do not fit at 1280 px, let alone 360 px** → PRD §32.5 permits up to
  nine and PRD §41.1 requires 360 px operation *"without hiding … citations, primary actions or error
  recovery"*. Solve it with horizontal navigation or stacking that keeps **every** column reachable;
  never omit, lazily drop, or silently truncate a column. If genuinely impossible, that is a **product
  change** under PRD §45.5 — raise it in `docs/prd/15-answer-product/README.md` with the Founder as
  owner.
- **An unavailable column looks broken and stakeholders ask to hide it** → PRD §32.5 requires a
  *"synthesis that never hides a missing column"* and PRD §31.2's empty state is *"Missing dimension
  visibly unavailable"*. Improve the wording, not the visibility. Record the request in
  `docs/prd/15-answer-product/README.md` and route it to the Founder as a product change.
- **`ASK-11`'s payload lacks a PRD §32.5 field** (for example a per-column version label) → do not
  derive it client-side and do not render a blank. Raise it as an open question in
  `docs/prd/15-answer-product/README.md` and amend `ASK-11`'s serialiser in one docs PR, then `--sync`
  both.
- **A client-side diff would render faster than waiting for the server value** → PRD §8.6 requires the
  textual/legal-effect distinction to be evidence-bounded and PRD §9.4 requires code-generated,
  validated output. A client-side diff is an unvalidated claim. Do not add one; record any latency
  concern against `ASK-11` and PRD §13.2.
- **`ASK-07`'s exported component surface does not fit a comparison need** → amend `ASK-07` in a docs
  PR and `--sync` both; never fork the result/evidence components (breakdown plan **A6**).
- **Export or save-to-record is needed before `19-exports`/`17-records-collab` ship** → render the
  action disabled-with-reason, state it as a known gap in the PR (PRD §45.4), and record it in
  `docs/prd/15-answer-product/README.md`. Do not write `features/{exports,records}/**`.

**3. Escalation.** PRD §8.6's sentence — *"An evidence failure in one dimension MUST NOT cause
fabricated symmetry in other dimensions"* — and PRD §32.5's *"a synthesis that never hides a missing
column"* are the product's central invariants for this surface, and this screen is the last place they
can be broken. Hiding an unavailable column, filling it with a placeholder that reads as a finding,
rendering a sibling's citation under it, or computing a difference client-side all put an unvalidated
legal statement in front of the user and overturn PRD §8.6 and §9.4. Stop, escalate for re-review
through the PRD §45.5 product-change path, and record the outcome in
`docs/prd/15-answer-product/README.md` and `docs/prd/breakdown-plan.md`. Never hide the column inside
this ticket.
