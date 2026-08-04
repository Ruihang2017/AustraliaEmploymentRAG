---
id: ASK-07
title: Answer progress and result screens
module: 15-answer-product
lane: 15-answer-product
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [ASK-04, ASK-05, ASK-06]
blocks: [ASK-09, ASK-12]
---

# ASK-07 — Answer progress and result screens

Implements PRD §32.3 (answer progress and result), §31.3 (mandatory asynchronous states) and §41.1
(universal UI acceptance), carrying requirement **ANS-006** and the client half of **ANS-003**
(`E21`).
**No ADR — the decision is already made in PRD §32.3 and §31.3; this is build ticket 7 of 12 against
it.**
Parent sub-PRD: [15-answer-product README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`ASK-04` — Answer snapshot read contract and rerun endpoint](ASK-04-answer-snapshot-read-contract-and-rerun-endpoint.md) ·
[`ASK-05` — Answer SSE stage events](ASK-05-answer-sse-stage-events.md) ·
[`ASK-06` — Ask form screen](ASK-06-ask-form-screen.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(PRD §32.3's fixed eight-part result order and PRD §31.3's ten mandatory states) — not a new subsystem
decision.

## Background + basis

This is the screen a customer will judge the product by, and the screen where a fluent-looking
paragraph could quietly stand in for evidence. PRD §41.3 makes the point explicitly for the demo:
*"A demo that shows only fluent positive answers misrepresents the product's safety value."* The
result screen's job is to make status, uncertainty and evidence impossible to miss.

**PRD §32.3 — Answer progress and result** is normative and reproduced in full:

> Progress events use user-readable stage names, not model internals. Minimum stages are
> `Validating request`, `Identifying legal context`, `Retrieving exact authorities`, `Checking
> conflicts and dates`, `Drafting supported claims`, and `Validating citations`. Deep MAY show bounded
> subquestion titles, but not hidden reasoning.
>
> The completed screen order is **fixed**:
>
> 1. status badge and short answer;
> 2. legal date, jurisdictions, corpus release and freshness banner;
> 3. numbered explanation/application claims;
> 4. conditions and assumptions with "impact if false";
> 5. practical next checks;
> 6. limitations/missing facts;
> 7. authority table;
> 8. actions: save/rerun/compare/export/watch/report issue.
>
> Each material sentence is linked to one or more claim IDs. Selecting a claim highlights its source
> passages. Selecting a citation shows exact text, pinpoint, effective interval, authority role,
> official URL and whether the citation **supports, qualifies or contradicts** the claim.

**PRD §31.3 — Mandatory states for every asynchronous screen:**

> Every job-driven screen MUST implement: `IDLE`, `VALIDATING`, `QUEUED`, `RUNNING`,
> `WAITING_FOR_CLARIFICATION`, `CANCELLING`, `COMPLETED`, `FAILED`, `CANCELLED` and `EXPIRED` where
> retention permits. Each state needs a visible title, plain-language explanation, allowed next action
> and request/job ID. **A spinner without state or recovery guidance is not acceptable.**

**PRD §31.2** gives the two routes and their audiences:

> `/answer-jobs/:jobId` | Answer progress | **initiating permitted user** | Stream/cancel job |
> Reconnect from last event ID
> `/answers/:snapshotId` | Answer snapshot | **authorised record members** | Read/cite/report/export |
> Correction/review banner if applicable

**PRD §34.4** fixes what the stream may carry and how draft content must be treated:
*"`answer.section` is provisional UI content until `job.completed`; clients MUST remove it on failure
and MUST not represent it as a validated answer."*

**PRD §15.5** fixes the vocabularies the result renders: claim support
(`DIRECTLY_SUPPORTED`, `SUPPORTED_BY_INFERENCE`, `CONDITIONAL`, `CONTRADICTED`, `NOT_SUPPORTED`) and
citation role (`SUPPORTS`, `QUALIFIES`, `CONTRADICTS`, `DEFINES`, `BACKGROUND_ONLY`), with
*"`BACKGROUND_ONLY` evidence cannot independently support a definitive legal claim."*

**PRD §8.4** fixes the six answer statuses the badge must render: `SUPPORTED`, `CONDITIONAL`,
`INSUFFICIENT_EVIDENCE`, `CONFLICTING_SOURCES`, `OUT_OF_SCOPE`, `SOURCE_NOT_CURRENT`.

**PRD §41.1 — Universal UI acceptance** applies in full, including *"works at 360 px, 768 px and
1280 px widths without hiding legal status, citations, primary actions or error recovery"*,
*"colour is never the only status signal"*, *"dates display unambiguously as `3 Aug 2026`"*,
*"request/job/correction IDs are copyable from errors and support panels"*, *"customer research
content is not placed in URL query strings, analytics, browser error telemetry or page titles"* and
*"refresh/back/forward/reconnect does not duplicate writes or charges"*.

**PRD §30.2 `ANS-006`:** *"Answer renders status, short answer, explanation, assumptions, authorities,
next checks and limitations"*, evidence *"Contract snapshot and accessibility test pass"*.
**PRD §41.2 `UAT-ANS-06`:** *"Disconnect/reconnect SSE after event 5 → Resume after event 5; no
duplicate section/completion."*

**Contracts this ticket builds against (all already published):**

- `RUNT-05`'s A1 web feature contract, `orgScopedKey(...)`, `lib/format.ts` and the eleven-slot PRD
  §31.1 nav tuple (this feature claims **no** slot — sub-PRD **D13**).
- `RUNT-06`'s `packages/ui`: `JobStateView` (all ten PRD §31.3 states with title, explanation, allowed
  action and copyable id), `EvidencePanel` in `claim` mode (*"selecting a citation shows exact text,
  pinpoint, effective interval, authority role, official URL and the
  `supports | qualifies | contradicts` relation"*), `ClaimText` (claim-linked prose with
  offset-driven highlighting), `SafeMarkdown`, the status badges (`LegalStatusBadge`,
  `JurisdictionBadge`, `FreshnessBadge`, `AuthorityRoleBadge`, `CitationRelationBadge`),
  `CopyableId`, `DestructiveAction` and `packages/ui/test/a11y.ts`.
- `ASK-04`'s `GET /v1/answers/{answerSnapshotId}` PRD §34.5 payload, its `ETag` behaviour, and
  `POST /v1/answers/{answerSnapshotId}/rerun`.
- `ASK-05`'s event vocabulary and the committed
  `apps/worker/test/answer-events/fixtures/answer-job-events.jsonl` recorded log.
- `ASK-01`'s `GET /v1/answer-jobs/{jobId}` status read, `GET /v1/answer-jobs/{jobId}/events` SSE
  stream and `POST /v1/answer-jobs/{jobId}/cancel`.
- `ASK-03`'s `POST /v1/answer-jobs/{jobId}/clarifications` submission contract.
- `ASK-06`'s retention/limit copy constants, reused verbatim.

**Accepted caveats carried forward:**

- Actions in PRD §32.3 item 8 span other modules: **save** and **report issue** are
  `17-records-collab` (`RCRD-01`, `RCRD-06`), **export** is `19-exports` (`XPRT-05`), **watch** is
  `16-monitor-alerts` (`WTCH-07`), **compare** is `ASK-12`. This ticket renders the action row and
  wires the actions it owns (**rerun** via `ASK-04`); the rest are rendered as disabled-with-reason
  until their owning module ships, and that is a stated known gap, not a licence to write those
  feature subtrees.
- The correction/review banner reads `correction_state` from the PRD §34.5 payload; the correction
  workflow itself is `17-records-collab` (`RCRD-07`).

## Goal

Ship `apps/web/src/features/answers/**` as a `RUNT-05` feature area serving `/answer-jobs/:jobId` and
`/answers/:snapshotId`, rendering all ten PRD §31.3 states through `packages/ui`'s `JobStateView`,
resuming the SSE stream from `Last-Event-ID` without duplicating a section or a completion, and
presenting the completed answer in PRD §32.3's fixed eight-part order with working claim↔citation
interaction. Completion is mechanically checkable: a table-driven test renders all ten states with a
title, explanation, allowed action and copyable id; a replay of the recorded event log with a
disconnect after event 5 produces each event exactly once; the eight result sections appear in the
literal PRD order; and selecting a citation exposes all six PRD §32.3 fields.

## Non-goals

- **No API routes.** `ASK-01`, `ASK-03` and `ASK-04` own every endpoint this screen calls.
- **No SSE transport or event vocabulary.** `RUNT-03` owns the transport; `ASK-05` owns the answer
  event vocabulary. This screen consumes them.
- **No Ask form.** `/ask` is `ASK-06`; this screen is where `ASK-06` navigates on `202`.
- **No coverage or compare screens.** `ASK-09` and `ASK-12`, both `blocked_by` this ticket, reuse the
  components exported here.
- **No shared UI primitives, async-state view, evidence panel or badges.** `packages/ui` is `RUNT-06`
  (breakdown plan **A6**).
- **No record, export, watch or issue surfaces.** `17-records-collab`, `19-exports`,
  `16-monitor-alerts` own those features; this screen renders their action affordances only.
- **No PII detection, validation or licence logic.** `12-evidence-safety`. Quote limits are already
  applied server-side by `ASK-04`; this screen must not re-derive them.
- **No cross-boundary E2E or accessibility suite.** `tests/e2e/**` is `23-assurance` (`ASSR-06`,
  `ASSR-07`); this ticket carries co-located checks (breakdown plan **R8**).

## File-scope (write-owns)

- `apps/web/src/features/answers/**` — including `feature.tsx`.
- `apps/web/test/answers/**` — this ticket's own component/integration tests (breakdown plan §1.1).
- `apps/web/package.json` — **append-only** (breakdown plan §1.1).

Does not touch:

- `apps/web/src/{app,shell,lib}/**` and `features/home/**` — `RUNT-05`.
- `apps/web/src/features/ask/**` — `ASK-06`; `features/coverage/**` — `ASK-09`;
  `features/compare/**` — `ASK-12`.
- Every other `apps/web/src/features/<area>/**` — `13`, `14`, `16`, `17`, `19`, `20`, `24`.
- `packages/ui/**` — `RUNT-06`; `packages/{pii,citations,model-gateway}/**` — `12-evidence-safety`;
  `packages/contracts/**` — `00-foundation`.
- `apps/api/**`, `apps/worker/**`, `schemas/**`, `infra/**`, `tests/**` — `03`, `00`, `18`, `23`;
  root manifests and lockfiles — `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown plan §1: phase 1, nothing merged, no
in-flight ticket), so nothing has previously written `apps/web/src/features/answers/**` and nothing
contends for it. `RUNT-05`'s Vite-glob discovery makes adding this directory a zero-diff change
outside itself, which is what keeps the four feature subtrees in this module disjoint. This feature
claims **no** nav slot (PRD §31.2 lists both its routes as non-nav destinations), so it cannot collide
with `ASK-06`'s `ASK`, `ASK-09`'s `COVERAGE` or `ASK-12`'s `COMPARE` claims (sub-PRD **D13**); route
paths `/answer-jobs/:jobId` and `/answers/:snapshotId` are unique across every feature area, and
`RUNT-05` fails the build on a duplicate path. Concurrent siblings at this wave are `ASK-10`
(`apps/worker/src/handlers/deep/**`) and `ASK-11` (`handlers/comparison/**` +
`routes/comparisons/**`) — different trees. Per breakdown plan **A3**, this ticket writes no table and
no repository, and per PRD §45.2 `apps/web` holds no security boundary.

## Deliverables

1. **`apps/web/src/features/answers/feature.tsx`** — the `FeatureModule`: `id: 'answers'`,
   `routes: [{ path: '/answer-jobs/:jobId', element: <AnswerProgressScreen /> }, { path:
   '/answers/:snapshotId', element: <AnswerResultScreen /> }]`, **no `nav`** (sub-PRD **D13**), and
   `onOrganizationChange` dropping every cached job, stream and snapshot. All cache keys come from
   `orgScopedKey(...)`.
2. **`AnswerProgressScreen`** — renders all ten PRD §31.3 states through `packages/ui`'s
   `JobStateView`: `IDLE`, `VALIDATING`, `QUEUED`, `RUNNING`, `WAITING_FOR_CLARIFICATION`,
   `CANCELLING`, `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED`. Each carries a visible title, a
   plain-language explanation, the allowed next action and the copyable request/job id. There is **no
   bare spinner anywhere** — the API of `JobStateView` makes one unrepresentable (`RUNT-06`
   deliverable 2).
3. **Stream client.** Connects to `GET /v1/answer-jobs/{jobId}/events` with
   `Accept: text/event-stream`, tracks the last received event id, and **reconnects with
   `Last-Event-ID`** on transport loss, applying events by id so a replayed event is idempotent. On
   `job.completed` it stops streaming and navigates to `/answers/{answer_snapshot_id}`. On
   `job.failed`/`job.cancelled` it renders the terminal state with recovery guidance
   (PRD §34.4, §31.3; `ANS-003`, `UAT-ANS-06`).
4. **Provisional content discipline.** `answer.section` events render in a clearly labelled
   **provisional** region — visually and via `aria` — that is **removed** on `job.failed` and replaced
   wholesale by the committed snapshot on `job.completed`. It carries no status badge, no citation and
   no authority claim, and is never presented as a validated answer (PRD §34.4). `citation.added`
   events increment a "citations found so far" count only; citation content is fetched from
   `ASK-04`'s snapshot after completion.
5. **Stage rendering.** Stage names come from `ASK-05`'s vocabulary and are rendered as the
   user-readable PRD §32.3 strings, in order, with the current stage announced through a `LiveRegion`.
   Deep subquestion titles are rendered when present; **no reasoning-like content is rendered at all**
   — an event payload key outside `ASK-05`'s allowlist is ignored, not displayed (PRD §32.3, §16.2).
6. **Clarification state.** `WAITING_FOR_CLARIFICATION` renders the 1–5 questions from the job with
   the decision each affects, offers per-question answer controls including an explicit **"unknown"**
   choice, and submits to `ASK-03`'s `POST /v1/answer-jobs/{jobId}/clarifications` with the round
   number. It states plainly that answering "unknown" will produce a conditional or
   multiple-candidate answer, and **never** pre-fills a guess (PRD §33.3). A `409
   CLARIFICATION_ROUND_CLOSED` refetches the job and re-renders the current round rather than showing
   a raw error.
7. **Cancel.** The progress screen's cancel action calls `ASK-01`'s
   `POST /v1/answer-jobs/{jobId}/cancel` through `packages/ui`'s `DestructiveAction`, which requires
   the exact effect and the recovery path as text (PRD §41.1). The copy states whether the reserved
   credit will be released in full — before provider execution — or actual cost settled (PRD §33.2).
   The screen then renders `CANCELLING` and `CANCELLED`.
8. **`AnswerResultScreen` — the fixed eight-part order**, rendered from `ASK-04`'s PRD §34.5 payload,
   in exactly this sequence and no other:
   1. **status badge and short answer** — the badge covers all six PRD §8.4 statuses with text plus
      icon/shape, never colour alone;
   2. **legal date, jurisdictions, corpus release and freshness banner** — `legal_as_at` rendered
      `3 Aug 2026`, jurisdiction badges, `corpus_release_id` and its date/status from the shell's
      release context, and a freshness banner;
   3. **numbered explanation/application claims** — claims ordered by `sequence`, each numbered, each
      carrying its `support_status`;
   4. **conditions and assumptions with "impact if false"** — every assumption renders `text`,
      `source` and `impact_if_false`;
   5. **practical next checks** — `next_checks`;
   6. **limitations/missing facts** — `limitations`;
   7. **authority table** — one row per citation with title, authority, pinpoint, legal status,
      effective interval, authority role and the official link;
   8. **actions** — save / rerun / compare / export / watch / report issue.
9. **Claim ↔ citation interaction.** Material sentences are rendered through `packages/ui`'s
   `ClaimText` with their claim id(s); selecting a claim highlights its source passages via the
   offsets in the payload; selecting a citation opens `EvidencePanel` in `claim` mode showing **exact
   text, pinpoint, effective interval, authority role, official URL and the
   `supports | qualifies | contradicts` relation** (PRD §32.3). A `BACKGROUND_ONLY` citation is
   visibly labelled as background and never presented as the support of a definitive claim
   (PRD §15.5).
10. **Rerun.** The rerun action calls `ASK-04`'s `POST /v1/answers/{answerSnapshotId}/rerun` with the
    stable idempotency-key discipline `ASK-06` established, states that the original answer remains
    unchanged, and navigates to the new job's progress route (PRD §8.7, `REC-002`).
11. **Correction / review banner.** When `correction_state` is not `NONE`, a banner states the
    correction state and links to the replacement, per PRD §31.2's *"Correction/review banner if
    applicable"*. The banner never rewrites the answer body.
12. **Exported components for the sibling screens.** `AnswerResultSections`, `ClaimCitationView`,
    `AnswerStatusBadge`, `JobProgressView` and the stream-client hook are exported from
    `features/answers/index.ts` so `ASK-09` and `ASK-12` reuse them rather than re-implementing the
    result order and the claim↔citation interaction (both are `blocked_by` this ticket). A test asserts
    the exported surface matches a committed list.
13. **Content hygiene and reload safety.** No customer research content in the URL, page title,
    analytics or error telemetry — the routes carry ids only (PRD §41.1). Refresh, back/forward and
    reconnect re-read state from the API and never re-submit a job, a clarification or a rerun
    (PRD §41.1: *"does not duplicate writes or charges"*).
14. **Accessibility.** One programmatic page heading per screen, labelled controls, an error summary,
    a live region for the streaming status, visible focus with logical order, colour never the only
    signal, and full operation at 360/768/1280 px **without hiding legal status, citations, primary
    actions or error recovery** — verified with `RUNT-06`'s `packages/ui/test/a11y.ts` harness
    (PRD §13.1, §41.1).

## Acceptance checklist (classified)

- [ ] `[machine]` The feature registers `/answer-jobs/:jobId` and `/answers/:snapshotId`, claims **no**
      nav slot, and produces **zero** diff outside `apps/web/src/features/answers/**` — asserted with
      `RUNT-05`'s `feature-conformance` helper (A1; sub-PRD **D13**)
- [ ] `[machine]` **PRD §31.3**: all ten states render with a visible title, plain-language
      explanation, allowed next action and copyable request/job id — a table-driven test over the
      literal ten-state list; no bare spinner exists anywhere in the feature (source scan)
- [ ] `[machine]` **PRD §32.3 fixed order**: the completed screen renders the eight sections in the
      literal PRD order — asserted by comparing the DOM order of section landmarks to the literal list,
      so a reorder fails (`ANS-006`)
- [ ] `[machine]` All six PRD §8.4 statuses render with text plus icon/shape; colour is never the only
      signal (PRD §8.4, §41.1)
- [ ] `[machine]` Every assumption renders `text`, `source` and `impact_if_false`; every claim renders
      its `support_status`; `next_checks` and `limitations` are present even when empty (as an explicit
      empty state, not omitted) (PRD §32.3, §34.5)
- [ ] `[machine]` **Claim ↔ citation**: selecting a claim highlights its source passages; selecting a
      citation exposes **all six** PRD §32.3 fields — exact text, pinpoint, effective interval,
      authority role, official URL and the supports/qualifies/contradicts relation
- [ ] `[machine]` A `BACKGROUND_ONLY` citation is labelled as background and is never rendered as the
      support of a definitive claim (PRD §15.5)
- [ ] `[fixture]` **`UAT-ANS-06`**: replaying `apps/worker/test/answer-events/fixtures/answer-job-events.jsonl`
      (`ASK-05`) with a simulated disconnect after event 5 and reconnect with `Last-Event-ID` renders
      each event exactly once — **no duplicate section and no duplicate completion** (PRD §34.4, §41.2;
      `ANS-003`)
- [ ] `[machine]` `answer.section` content renders in a labelled provisional region, is **removed** on
      `job.failed`, and is replaced by the committed snapshot on `job.completed`; it carries no status
      badge and no citation (PRD §34.4)
- [ ] `[machine]` An event payload key outside `ASK-05`'s allowlist is ignored and never rendered —
      asserted with a canary key that must be absent from the DOM (PRD §16.2, §32.3)
- [ ] `[machine]` `WAITING_FOR_CLARIFICATION` renders 1–5 questions with the decision each affects,
      offers an explicit "unknown" option, pre-fills nothing, and a `409 CLARIFICATION_ROUND_CLOSED`
      refetches and re-renders rather than showing a raw error (PRD §33.3; `ASK-03`)
- [ ] `[machine]` Cancel uses `DestructiveAction` and states the exact credit effect (full release
      before provider execution, actual cost after) and the recovery path (PRD §33.2, §41.1;
      `UAT-ANS-07`)
- [ ] `[machine]` Rerun states that the original remains unchanged and navigates to the new job; the
      original snapshot view is re-read byte-identically afterwards (PRD §8.7; `REC-002`,
      `UAT-REC-01`)
- [ ] `[machine]` A `correction_state` other than `NONE` renders the correction/review banner and links
      to the replacement without altering the answer body (PRD §31.2)
- [ ] `[machine]` **PRD §41.1 content hygiene**: a canary in the answer text appears in no
      `location.href`, `document.title`, analytics call or error-telemetry payload
- [ ] `[machine]` **PRD §41.1 reload safety**: refresh, back/forward and reconnect issue no duplicate
      `POST` to answers, clarifications or rerun — asserted by capturing outbound requests
- [ ] `[machine]` Organisation switch clears every cached job, stream and snapshot — `RUNT-05`'s
      `org-scope-conformance` helper (PRD §31.1; `AUTH-002`)
- [ ] `[machine]` No `packages/ui` component is re-implemented and no controlled value is declared
      locally (breakdown plan **A6**, §4.1; PRD §35.1)
- [ ] `[machine]` The exported surface of `features/answers/index.ts` matches the committed list so
      `ASK-09` and `ASK-12` can depend on it (sub-PRD **D14**)
- [ ] `[machine]` Accessibility: `RUNT-06`'s a11y harness passes at 360, 768 and 1280 px **without
      hiding legal status, citations, primary actions or error recovery**; one programmatic heading per
      screen; live region for streaming status; dates render `3 Aug 2026` (PRD §13.1, §41.1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[fixture]` The result screen renders from a committed PRD §34.5 snapshot fixture covering all
      six statuses, all five citation roles and all five claim-support values, reusing
      `packages/ui/test/fixtures/answer-snapshot.json`'s shape (`RUNT-06`) — offline, no provider
- [ ] `[human]` **`UAT-ANS-03`** (evidence pack lacks support → `INSUFFICIENT_EVIDENCE`, no definitive
      conclusion) and **`UAT-ANS-06`** (disconnect/reconnect after event 5) rehearsed in a browser, plus
      the PRD §41.1 universal UI review at the three widths and the PRD §43.4 founder review of the
      result presentation (PRD §41.2, §41.1, §43.4). These are the Gate 2 smoke items and are **not
      required to merge**; the `[machine]`/`[fixture]` rows are the merge gate
- [ ] No `cargo test --workspace` / `uv run pytest` item — no Rust or Python is touched (PRD §45.3)

## Test plan

Reviewer steps, all reproducible offline with no network and no provider key.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/web`. Suites live under `apps/web/test/answers/`.
3. **Harness.** `RUNT-05`'s component test setup, `RUNT-06`'s `packages/ui/test/a11y.ts`, a fake SSE
   transport that replays `apps/worker/test/answer-events/fixtures/answer-job-events.jsonl` (`ASK-05`)
   and can drop the connection at a chosen event, and a request-capturing API-client fake seeded from
   `apps/web/test/answers/fixtures/*.json`. No socket, no network.
4. **`states.test.tsx`** — table-driven over the ten PRD §31.3 states: assert title, explanation,
   allowed action and copyable id for each. Then a source scan for any element that renders a spinner
   without a `JobStateView` wrapper.
5. **`resume.test.tsx`** — replay the fixture log, drop after event 5, reconnect with
   `Last-Event-ID: 5`, drain. Assert every event id is applied exactly once, exactly one completion is
   rendered, and no section appears twice.
6. **`provisional.test.tsx`** — stream three `answer.section` events, then `job.failed`; assert the
   provisional region is removed. Repeat with `job.completed`; assert the region is replaced by the
   snapshot content and that the provisional region never carried a status badge or citation. Inject an
   event payload with a `reasoning` key carrying `leak-canary-<uuid>`; assert it is absent from the
   DOM.
7. **`order.test.tsx`** — render the snapshot fixture and assert the DOM order of the eight section
   landmarks equals the literal PRD §32.3 list.
8. **`interaction.test.tsx`** — select each claim and assert its source passages highlight; select each
   citation and assert all six fields render; assert a `BACKGROUND_ONLY` citation carries its label and
   is not offered as the support of a definitive claim.
9. **`clarification.test.tsx`** — render the `WAITING_FOR_CLARIFICATION` state with 1 and with 5
   questions; assert an "unknown" option per question, that nothing is pre-filled, and that a fixture
   `409 CLARIFICATION_ROUND_CLOSED` triggers a refetch rather than a raw error.
10. **`actions.test.tsx`** — cancel copy and `DestructiveAction` wiring; rerun navigation and the
    "original unchanged" statement; save/compare/export/watch/report rendered as
    disabled-with-reason where their owning module has not shipped.
11. **`hygiene.test.tsx`** — a canary in the answer text must not appear in `location.href`,
    `document.title`, captured analytics or captured error telemetry. Refresh/back/forward/reconnect
    must produce zero duplicate `POST`s.
12. **`org-switch.test.tsx`** — `RUNT-05`'s `org-scope-conformance` helper.
13. **`a11y.test.tsx`** — the `RUNT-06` harness at 360/768/1280 px, additionally asserting that legal
    status, citations, primary actions and error recovery remain visible at 360 px.
14. **`surface.test.tsx`** — assert `features/answers/index.ts` exports match the committed list.
15. Reviewer greps the diff for: any file outside `apps/web/src/features/answers/**` and
    `apps/web/test/answers/**`, any local spinner/badge/Markdown implementation, any literal enum
    array, any rendering of an event key outside `ASK-05`'s allowlist, and any client-side
    re-derivation of a licence quote limit.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), then `docs/prd/15-answer-product/README.md`, then
`.claude/scripts/publish-tickets.mjs --sync`, and only then change code (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **The eight-part order does not fit a small screen** → PRD §41.1 requires 360 px operation *"without
  hiding legal status, citations, primary actions or error recovery"*, and PRD §32.3 fixes the order.
  Solve it with progressive disclosure inside a section, never by reordering or dropping one. If it
  genuinely cannot be done, that is a **product change** under PRD §45.5: raise it in
  `docs/prd/15-answer-product/README.md` with the Founder as owner.
- **The PRD §34.5 payload lacks a field the screen needs** → do not derive it client-side. Raise it as
  an open question in `docs/prd/15-answer-product/README.md`, and align `ASK-04`'s serialiser plus
  `FND-04`'s OpenAPI root in one docs PR, then `--sync` both.
- **`packages/ui`'s `EvidencePanel` cannot express a needed interaction** → add it in `RUNT-06`, not
  here (breakdown plan **A6**). Record the requirement in `docs/prd/15-answer-product/README.md` and
  raise the `03-app-runtime` ticket; a local evidence panel would fragment the guarantee across three
  surfaces.
- **`ASK-05`'s event vocabulary is missing a progress signal the UI wants** → amend `ASK-05` in a docs
  PR and `--sync`; never render an undeclared payload key, and never add a tenth SSE event type
  (PRD §34.4 closes the list).
- **An action in PRD §32.3 item 8 belongs to a module that has not shipped** → render it
  disabled-with-reason, state it as a known gap in the PR (PRD §45.4), and record it in
  `docs/prd/15-answer-product/README.md`. Do not write `features/{records,exports,monitor}/**`.
- **Streaming feels slow and there is pressure to render draft text as the answer** → PRD §34.4 is
  explicit: sections are provisional *"and MUST not [be represented] as a validated answer"*. Do not
  soften the labelling. If latency is the real problem, that is PRD §13.2's objective and belongs in a
  `RETR-10`/`ASK-02` measurement discussion.

**3. Escalation.** Presenting provisional or unvalidated content as an answer — by dropping the
provisional labelling, by rendering a claim without its support status, by hiding a citation on a
narrow screen, or by displaying reasoning-like content from an event — overturns PRD §9.4 and §34.4
and is precisely how an unvalidated claim reaches the user. It is the product's central invariant, not
a presentation preference. Stop, escalate for re-review, and record the outcome in
`docs/prd/15-answer-product/README.md` and `docs/prd/breakdown-plan.md`. Never work around it inside
this ticket.
