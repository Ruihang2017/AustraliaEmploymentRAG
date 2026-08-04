---
id: ASSR-07
title: "Accessibility and responsive suite"
module: 23-assurance
lane: 23-assurance
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [ASSR-06]
blocks: [LNCH-05]
---

# ASSR-07 — Accessibility and responsive suite

Implements PRD §13.1 and §41.1 — the **WCAG 2.2 AA** release target and the universal UI acceptance
rules; feeds PRD §43.5's release evidence pack. Contributes evidence to **ANS-006** (*"Contract
snapshot and accessibility test pass"*) and to PRD §26 Product (*"English UI, accessibility and
responsive requirements pass release review"*); epic `E34`.
No ADR — the decision is already made in PRD §13.1 (*"WCAG 2.2 AA is the release target"*) and PRD
§41.1 (the per-screen rules); this is build ticket 7 of 8 against it. The runtime choice is already
recorded by `ASSR-06`'s ADR (sub-PRD **M-Q2**); this ticket adds none of its own.
Parent sub-PRD: [23-assurance README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [ASSR-06 — E2E automation of the §41.2 manual acceptance scripts](ASSR-06-e2e-automation-of-the-41-2-manual-acceptance-scripts.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §13.1 names the standard and PRD §41.1 the per-screen rules; this measures them across the route
table, and decides no new subsystem.

## Background + basis

**PRD §13.1, quoted verbatim — the release target:**

> - Application, API, SDK, widget, alerts, exports and generated answers MUST be English.
> - **WCAG 2.2 AA is the release target.**
> - Web and widget MUST support keyboard navigation, visible focus, screen-reader labels, contrast and
>   responsive layouts.

**PRD §41.1, the accessibility and responsive half of the universal rules — this ticket's scope
(`ASSR-06` owns the four behavioural rules, and says so):**

> - **works at 360 px, 768 px and 1280 px widths without hiding legal status, citations, primary
>   actions or error recovery;**
> - **complete keyboard operation with visible focus and logical order;**
> - **one programmatic page heading, labelled fields, error summaries and live regions for
>   asynchronous status;**
> - **colour is never the only status signal;**
> - **jurisdiction, legal status and source freshness use text plus badge/icon;**

**PRD §31.3, quoted verbatim — why live regions are not optional:**

> Every job-driven screen MUST implement: `IDLE`, `VALIDATING`, `QUEUED`, `RUNNING`,
> `WAITING_FOR_CLARIFICATION`, `CANCELLING`, `COMPLETED`, `FAILED`, `CANCELLED` and `EXPIRED` where
> retention permits. Each state needs a visible title, plain-language explanation, allowed next action
> and request/job ID. **A spinner without state or recovery guidance is not acceptable.**

**PRD §43.5, quoted verbatim — where this suite's output goes:**

> Promotion UI links one immutable release report containing application/corpus versions, source
> coverage and gaps, all 600 metrics, per-category breakdown, critical-error list, changed cases,
> security/tenant/PII results, performance and memory benchmark, provider/profile cost forecast,
> backup/restore result, **accessibility result**, known risks and founder approval/reason.

**Requirements.** PRD §26 Product: *"English UI, accessibility and responsive requirements pass
release review."* PRD §30.2 `ANS-006` names *"Contract snapshot and accessibility test pass"* as the
answer result screen's acceptance evidence. `LNCH-05` (Definition-of-Done closure) is `blocked_by`
this ticket.

**Why this cannot live in the screen modules.** `RUNT-06` proves its shared components are accessible
in isolation; each screen ticket checks its own screen. Neither can produce the artifact PRD §43.5
requires — **one accessibility result covering every route at three widths** — nor catch the failures
that only appear in composition: a heading level duplicated because a feature screen renders inside
the shell, a focus trap created by the evidence panel over the result page, a live region that never
fires because the async state is owned by one component and the announcement by another. PRD §45.2
assigns cross-boundary E2E to `tests`.

**Why automated scanning is necessary but not sufficient (sub-PRD D13).** No rule engine decides WCAG
2.2 AA conformance; it detects a subset of violations. This ticket therefore carries explicit
`[human]` criteria for the judgements a scanner cannot make — whether the focus order is
*comprehensible*, whether a screen-reader announcement is *useful*, whether an error summary actually
guides recovery. PRD §26 says the requirements *"pass release review"*, which is a review, not only a
scan.

**What the `blocked_by` closure guarantees.** Everything in `ASSR-06`'s closure — the web shell and
shared UI, Simple and Advanced Search, the source/version/timeline screens, Ask, answer progress and
result, Coverage, Compare, records list/detail and create-from-search, watchlists and alerts, exports,
and the members/security settings screens — plus `ASSR-06`'s own pinned browser runtime, page objects
and in-process stack, which this ticket **reuses rather than re-choosing**.

**Accepted caveats carried forward, each a row in `coverage-gaps.md`:**

- Routes outside `ASSR-06`'s closure are not scanned: SSO and data/retention settings (`IDNT-09`),
  the login and accept-invite screens (**no ticket owns `apps/web/src/features/auth/**`** — a
  breakdown plan §5.14 gap raised by `ASSR-06`), the widget (`PLTF-05`), the developer and usage
  screens (`PLTF-01`, `PLTF-07`, `PLTF-08`), the legal surfaces (`LNCH-02`), the public site
  (`LNCH-03`) and `apps/admin` (**M-Q4**). PRD §13.1 covers the widget too; that scan needs a plan
  edge.
- Contrast is asserted on rendered colour pairs the engine can compute; images of text and
  canvas-rendered content are reported as `NEEDS_HUMAN`, never silently passed.

## Goal

Produce `tests/e2e/accessibility/**`: a route-driven scan that visits every PRD §31.2 route reachable
in `ASSR-06`'s closure at 360 px, 768 px and 1280 px, runs a **WCAG 2.2 AA** rule set, and adds
targeted assertions for the PRD §41.1 rules a generic engine does not cover — one programmatic page
heading, labelled fields, error summaries, live regions that actually announce every PRD §31.3 state
change, colour never being the only status signal, jurisdiction/legal status/freshness carrying text
alongside their badge, and nothing important hidden at 360 px. It emits one machine-readable
accessibility result for PRD §43.5's release evidence pack. Completion is mechanically checkable: the
route list is data compared against PRD §31.2, zero AA violations at all three widths, and every
`NEEDS_HUMAN` item appears in the human checklist.

## Non-goals

- **No `UAT-*` journeys and no behavioural PRD §41.1 rules** — `ASSR-06` (dates, destructive-action
  wording, copyable IDs, no research content in the browser surface, refresh/back/forward). The split
  is stated in both tickets.
- **No component-level accessibility tests** — `03-app-runtime` (`RUNT-06`, the shared accessible
  primitives and the ten async-state components) and each screen ticket. Cited, never duplicated.
- **No runtime or ADR choice** — `ASSR-06`'s ADR (sub-PRD **M-Q2**) governs; this ticket adds no new
  dependency of its own beyond the rule set that ADR names.
- **No visual-regression or screenshot-diff testing.** PRD names none, it is not an accessibility
  signal, and it is the classic source of CI flake (sub-PRD **D17**).
- **No widget, developer-portal, admin, legal or public-site scans** — `20-developer-platform`,
  `22-internal-admin`, `24-launch`; not in this closure.
- **No performance, latency or memory measurement** — `14-search-product` (`FIND-06`),
  `11-retrieval-engine` (`RETR-10`), `18-ops-release` (`RLSE-11`).
- **No evaluation report assembly** — `21-evaluation-600` (`GOLD-03`) and `24-launch` (`LNCH-05`);
  this ticket emits the accessibility result they consume.
- **No CI workflow or root-script edits** — `00-foundation`; sub-PRD **D15**.

## File-scope (write-owns)

Owned by this ticket:

- `tests/e2e/accessibility/**` — including `routes/**`, `rules/**`, `suites/**`, `report/**` and
  `coverage-gaps.md`.
- `tests/e2e/package.json`, `tests/e2e/tsconfig.json` — **append-only**, own scripts and dependencies
  only (created by `FND-01`; sub-PRD **D16**). Shared with `ASSR-06`, which is merged before this
  ticket starts.

Does not touch:

- `tests/e2e/uat/**` — `ASSR-06` (merged; this ticket's blocker). Its `runtime/**` and `pages/**` are
  **imported**, never modified. A change needed there is a docs PR against `ASSR-06`.
- `tests/tenant-isolation/**` — `ASSR-01`; `tests/security/**` — `ASSR-02`, `ASSR-03`;
  `tests/integration/**` — `ASSR-04`, `ASSR-05`, `ASSR-08`.
- **Any other module's package or app tree** — `packages/**`, `apps/**`, `services/**`,
  `pipelines/**`, `infra/**`, `schemas/**`, `evals/**`. Not even to add a landmark, a label or an
  `aria-*` attribute to make a scan pass (sub-PRD **D1**) — that is the owning screen's defect.
- `docs/adr/**` — `ASSR-06` claimed the one relevant file (**A9**).
- `.github/workflows/**`, root `package.json`, root lockfiles — `00-foundation`.
- `docs/PRD.md` — frozen. `docs/prd/breakdown-plan.md` — docs PR only.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). `tests/e2e/accessibility/**` is written by no other ticket in the plan (plan §5.24). This is
the module's **only wave-2 ticket** (plan §7: 2 minimum waves): its single blocker `ASSR-06` is merged
before it starts, so the two never write concurrently even though they share the `tests/e2e` workspace
member — the `package.json` and `tsconfig.json` appends are serialised by the DAG edge. No sibling
ticket in any module writes `tests/e2e/**`.

## Deliverables

1. **`routes/route-table.ts` — the scan target list, as data.** Every PRD §31.2 route reachable in
   `ASSR-06`'s closure, each with `{ path, name, requiresAuth, seedState, asyncStates? }`. A test
   compares the list against a frozen transcription of PRD §31.2 and asserts that every route in the
   table is either scanned or present in `coverage-gaps.md` with an owning ticket and a plan edge —
   so a route cannot silently drop out of the accessibility gate.
2. **`suites/wcag-aa.test.ts` — the WCAG 2.2 AA scan.** For every route × {360 px, 768 px, 1280 px},
   run the rule set `ASSR-06`'s ADR names, configured to the **WCAG 2.2 Level AA** tag set explicitly
   (the configuration is a literal in `rules/config.ts`, so narrowing it is a visible diff), and
   assert **zero violations**. Each finding is reported with rule id, WCAG success criterion, route,
   width and a DOM path — enough for the owning screen ticket to act without re-running the suite.
   Basis: PRD §13.1.
3. **`suites/responsive.test.ts` — PRD §41.1's first rule, asserted literally.** At 360 px, for every
   route: no horizontal document overflow; and **legal status, citations, primary actions and error
   recovery are all present and operable** — not merely in the DOM, but visible, not clipped, and
   reachable without a hidden scroll container. The four required categories are located by role and
   accessible name from `ASSR-06`'s page objects, so the assertion cannot be satisfied by an offscreen
   node. Repeat the presence assertions at 768 px and 1280 px.
4. **`suites/keyboard.test.ts` — complete keyboard operation.** For every route: every interactive
   element is reachable by `Tab`, the tab sequence follows the visual/DOM order, each focused element
   has a **computed** visible focus indicator (asserted from computed style, not from a class name),
   no keyboard trap exists (assert `Tab`/`Shift+Tab` can always leave a widget, including the evidence
   panel and any dialog), `Escape` closes dismissible surfaces and returns focus to the invoker, and
   every action available by pointer is available by keyboard. Basis: PRD §13.1, §41.1.
5. **`suites/structure.test.ts` — headings, labels and error summaries.** Exactly **one** programmatic
   page heading (`h1`) per route, with no skipped heading levels; every form control has a
   programmatically associated label (not a placeholder); every error state renders an error summary
   that is focusable and links to the offending fields; landmarks are present and unique. Basis: PRD
   §41.1.
6. **`suites/live-regions.test.ts` — PRD §31.3 announcements.** Drive a job-backed screen through
   every reachable PRD §31.3 state and assert that each transition produces an announcement in a live
   region whose text names the state and the allowed next action, and that the request/job ID is
   present. Assert a bare spinner without state text **fails** — PRD §31.3: *"A spinner without state
   or recovery guidance is not acceptable."*
7. **`suites/colour-not-only.test.ts` — PRD §41.1's fourth and fifth rules.** For every status signal
   the route table declares (answer status, legal status, jurisdiction, source freshness, job state,
   correction state): assert an accessible **text** equivalent accompanies the colour — a visible
   label or an accessible name on an icon — and that removing colour (forced-colours / greyscale
   emulation) leaves the status still distinguishable. Assert jurisdiction, legal status and source
   freshness specifically carry text plus badge/icon.
8. **`rules/needs-human.ts` — the honest boundary.** A declared list of checks the engine cannot
   decide — images of text, canvas or chart content, the *comprehensibility* of focus order, the
   *usefulness* of an announcement, whether an error summary genuinely guides recovery — each emitted
   as `NEEDS_HUMAN` with its route and element. `NEEDS_HUMAN` is never counted as a pass; it flows
   into deliverable 9 and into this ticket's `[human]` criteria.
9. **`report/accessibility-result.json` — the PRD §43.5 artifact.** One machine-readable result per
   run: tool and rule-set versions, the commit, the route × width matrix with pass/fail counts, every
   violation with its WCAG success criterion, every `NEEDS_HUMAN` item, the coverage gaps, and a
   single top-level verdict. Written to a stable path so `GOLD-03`'s release evidence pack and
   `LNCH-05`'s closure can consume it without re-running the suite. A human-readable `report/index.md`
   is generated from the same data.
10. **`suites/negative-control.test.ts`.** A fixture page inside this suite with a known AA violation
    (missing label, insufficient contrast, focus trap) must be **detected** by every relevant suite. A
    scan that cannot fail proves nothing.
11. **`coverage-gaps.md`** (sub-PRD **D3**) — routes and surfaces not scanned, each with owning ticket
    and the exact plan §5.24/§6.2 edge: SSO and data/retention settings (`IDNT-09`), login and
    accept-invite (**unowned `apps/web/src/features/auth/**`**, plan §5.14 gap), widget (`PLTF-05` —
    PRD §13.1 covers it explicitly), developer and usage screens (`PLTF-01`, `PLTF-07`, `PLTF-08`),
    legal surfaces (`LNCH-02`), public site (`LNCH-03`), `apps/admin` (**M-Q4**).
12. **`package.json` script wiring** (sub-PRD **D10**): `test` runs the route-table and gap-register
    assertions without a browser; `test:integration` runs the full scan, which PRD §20.3 places in the
    release-candidate gate. No root script is added (**M-Q8**).
13. **`README.md` in `tests/e2e/accessibility/`** — the PRD §41.1 rule → suite map, the AA
    configuration and why it is explicit, how to add a route, what `NEEDS_HUMAN` means and who signs
    it off, the report's location for PRD §43.5, and the rule that a violation is the owning screen's
    defect (sub-PRD **D1**).

## Acceptance checklist (classified)

- [ ] `[machine]` **Zero WCAG 2.2 AA violations** on every route in the table at **360 px, 768 px and
      1280 px**, with the AA tag set configured explicitly and visibly. (PRD §13.1 *"WCAG 2.2 AA is
      the release target"*; §41.1)
- [ ] `[machine]` **The route list matches PRD §31.2** — every reachable route is scanned or is a
      `coverage-gaps.md` row with an owning ticket and a plan edge. (PRD §31.2; sub-PRD **D3**)
- [ ] `[machine]` **At 360 px nothing important is hidden** — legal status, citations, primary actions
      and error recovery are visible, unclipped and operable on every route; no horizontal document
      overflow. (PRD §41.1 first rule; **WCAG 2.2 AA** reflow)
- [ ] `[machine]` **Complete keyboard operation** — full `Tab` reachability in a logical order, a
      computed visible focus indicator on every focusable element, no keyboard trap anywhere including
      the evidence panel and dialogs, `Escape` restores focus, and every pointer action has a keyboard
      equivalent. (PRD §13.1; §41.1; **WCAG 2.2 AA**)
- [ ] `[machine]` **Structure** — exactly one programmatic page heading per route with no skipped
      levels, programmatic labels on every control, a focusable error summary linking to its fields,
      and unique landmarks. (PRD §41.1; **WCAG 2.2 AA**)
- [ ] `[machine]` **Live regions announce every PRD §31.3 state**, naming the state and the allowed
      next action and carrying the request/job ID; a bare spinner fails. (PRD §31.3; §41.1)
- [ ] `[machine]` **Colour is never the only status signal**, and jurisdiction, legal status and source
      freshness carry text plus badge/icon — verified with colour removed. (PRD §41.1; **WCAG 2.2 AA**
      use-of-colour)
- [ ] `[machine]` **`NEEDS_HUMAN` items are enumerated, never counted as passes**, and each appears in
      the human checklist below. (Sub-PRD **D13**)
- [ ] `[machine]` **`report/accessibility-result.json` is produced** at the stable path with tool and
      rule-set versions, the full route × width matrix, every violation with its success criterion,
      the `NEEDS_HUMAN` list and one verdict — the PRD §43.5 *"accessibility result"*. (PRD §43.5;
      consumed by `GOLD-03` and `LNCH-05`)
- [ ] `[machine]` **Negative control is detected** — the fixture page's known violations fail the
      relevant suites. (Sub-PRD **D3**)
- [ ] `[machine]` **Nothing outside `tests/e2e/accessibility/**` is modified** — in particular no
      `aria-*`, label or landmark added anywhere under `apps/**` or `packages/ui/**`. (Sub-PRD **D1**;
      plan §4)
- [ ] `[machine]` **Offline and deterministic** — egress beyond loopback denied, browser from the
      pinned cache (`ASSR-06`'s ADR), three consecutive runs identical, no sleep-based
      synchronisation, no screenshot diffing. (PRD §20.2; sub-PRD **D17**)
- [ ] `[machine]` **No skipped or conditional assertion**; every exclusion is a `coverage-gaps.md`
      row. (Sub-PRD **D3**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration` green
      (standing item, PRD §45.3; sub-PRD **D10**).
- [ ] `[machine]` No Rust or Python written here — `cargo test --workspace` / `uv run pytest`
      unaffected; declared not applicable. (PRD §45.3)
- [ ] `[human]` **Screen-reader walkthrough of one journey per surface family** (search, ask/answer,
      coverage/compare, records, monitor, exports, settings) with a real screen reader: the
      announcements are *useful*, the status is understandable without sight, and no announcement
      leaks research content. A rule engine cannot decide this; **WCAG 2.2 AA** conformance is a
      review outcome, not a scan result. (PRD §13.1; §41.1; §26 *"pass release review"*)
- [ ] `[human]` **Keyboard-only walkthrough** of the same journeys: the focus order is
      *comprehensible*, not merely present, and every error state can be recovered from without a
      pointer. (PRD §41.1; **WCAG 2.2 AA**)
- [ ] `[human]` **Every `NEEDS_HUMAN` item in the report is adjudicated** and recorded in
      `report/index.md` with a verdict and, where failing, the owning screen ticket. (Sub-PRD **D13**)
- [ ] `[human]` **PRD §43.4 founder review** of accessibility defects (item 7 in the review order),
      and the Gate 2 smoke test on the delivered build. Not required to merge this ticket; it is
      `24-launch`/`LNCH-05`'s closure evidence. (PRD §43.4; §26)
- [ ] `[machine]` **Writeback item**: if any route in PRD §31.2 cannot be scanned,
      `docs/prd/23-assurance/README.md` **M-Q3** is updated with the route and the plan edge that
      would close it. (Plan §1.1; CLAUDE.md issue #53)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (PRD §13.1, §41.1; contributing
      to **ANS-006**), user-visible change (none — tests only) and non-goals, schema/API/event
      compatibility impact (none), tenant/PII/security impact (the screen-reader assertion includes a
      no-research-content check), source/licence impact (none), **cost/memory/latency impact**
      (release-candidate CI runtime — report it), rollback path, known gaps (`coverage-gaps.md` and
      the `NEEDS_HUMAN` list).

Absent classes: none omitted. `[machine]` covers the rule scan and the PRD §41.1 structural rules;
`[human]` covers the judgements a scanner cannot make, which is why sub-PRD **D13** exists. There are
no `[fixture]` criteria — this suite replays no recorded data; it drives live screens with
`ASSR-06`'s synthetic seed state.

## Test plan

Every `[machine]` step runs offline: egress beyond loopback denied, browser from the pinned cache, no
provider key, no `evals/**` access.

1. **Route table first.** `pnpm --filter <tests-e2e> test`. This must fail if the route list drifts
   from PRD §31.2 or if a gap row lacks an owner or plan edge — no browser needed.
2. **Full scan.** `pnpm --filter <tests-e2e> test:integration -- accessibility`. Confirm the run
   visits every route at all three widths and prints the matrix size.
3. **Read the AA configuration.** Open `rules/config.ts` and confirm the WCAG 2.2 **AA** tag set is
   stated explicitly and no rule is disabled without a comment naming the reason and the owning
   ticket. A silently disabled rule is how an accessibility gate dies.
4. **Negative control.** Run `suites/negative-control.test.ts`; confirm the missing label,
   insufficient contrast and focus trap are each detected by the suite that should catch them.
5. **Responsive.** At 360 px, confirm the four required categories are asserted **visible and
   operable**, not merely present in the DOM — verify by hiding one in the fixture page and confirming
   the test fails.
6. **Keyboard.** Confirm the focus-indicator assertion reads computed style; confirm the trap test
   covers the evidence panel and at least one dialog; confirm `Escape` focus restoration is asserted.
7. **Live regions.** Drive a job through the reachable PRD §31.3 states and read the captured
   announcements; confirm each names the state and the next action and carries the job ID.
8. **Colour.** Re-run the colour suite with colour removed and confirm statuses remain
   distinguishable; confirm the assertion covers jurisdiction, legal status and freshness explicitly.
9. **Report.** Confirm `report/accessibility-result.json` exists at the stable path, contains tool and
   rule-set versions, and that `report/index.md` is generated from it. Confirm `NEEDS_HUMAN` items are
   listed and are not counted as passes.
10. **Isolation of the suite.** `git diff --name-only` shows only `tests/e2e/accessibility/**`, the
    append-only `tests/e2e` manifest and the lockfile. **No file under `apps/**` or `packages/ui/**`
    may appear** — not an `aria-label`, not a landmark.
11. **Human passes.** Run the screen-reader and keyboard-only walkthroughs on one journey per surface
    family; record verdicts in `report/index.md`. These are the `[human]` criteria and are the reason
    the module claims WCAG 2.2 AA *review*, not merely a scan.
12. **Construction pattern to copy.** `ASSR-06`'s `runtime/**` and `pages/**` (imported, not copied)
    and `RUNT-06`'s own component accessibility tests for the expected roles and names of the shared
    async-state and evidence-panel components.
13. **Reviewer focus.** Confirm no AA rule was disabled to reach zero; confirm `NEEDS_HUMAN` is not
    used as an escape hatch for a rule the engine *can* decide; confirm nothing under `apps/**` was
    modified to make a scan pass; confirm the 360 px assertions are about visibility and operability,
    not DOM presence; confirm the report is written even when the suite fails, so the release evidence
    pack can carry a failing accessibility result rather than none.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR → merge
   → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/23-assurance/README.md` (version +0.1 with a changelog line) **before** changing code.
   Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A route has an AA violation* → **that screen has the defect.** File it against the owning screen
     ticket (`FIND-03`/`FIND-04`/`FIND-05`, `ASK-06`/`ASK-07`/`ASK-09`/`ASK-12`, `RCRD-08`/`RCRD-09`,
     `WTCH-07`/`WTCH-08`, `XPRT-05`, `IDNT-08`) or against `RUNT-05`/`RUNT-06` when it is a shell or
     shared-component defect, as a docs PR amending that ticket. **Do not add an `aria-*` attribute, a
     label or a landmark from `tests/**`** — sub-PRD **D1** forbids it and it would hide the defect
     from the module that must fix it.
   - *A rule is genuinely inapplicable to a route* → disable it **per route with a comment naming the
     reason and the WCAG success criterion**, record it in `coverage-gaps.md`, and never disable it
     globally. A global disable silently removes the criterion from the release gate.
   - *A check the engine reports is ambiguous* → move it to `NEEDS_HUMAN` and adjudicate it in the
     report; do not suppress it. `NEEDS_HUMAN` is a declared, reviewed state — not a pass.
   - *A route in PRD §31.2 is unreachable in this closure* → `coverage-gaps.md` row **plus** the exact
     plan §5.24/§6.2 edge proposed by docs PR, and update `docs/prd/23-assurance/README.md`
     **M-Q3**. PRD §13.1 explicitly covers the **widget** too; that gap must be visible to `LNCH-05`.
   - *`ASSR-06`'s page objects or runtime need a change* → docs PR against **`ASSR-06`**, then a
     follow-up here. Never edit `tests/e2e/uat/**` from this ticket (that tree is `ASSR-06`'s, plan
     §5.24).
   - *The scan is slow at three widths across every route* → shard by route family and report the
     measured time; propose CI shaping in a docs PR against `FND-02` (**M-Q7**). Do not reduce the
     width set — PRD §41.1 names exactly three.
3. **Falsified protocol.** **If WCAG 2.2 AA cannot be reached on a required screen**, that is a PRD
   §13.1 release-target failure and a PRD §26 Definition-of-Done item, not a suite to relax. Stop. Do
   not lower the tag set to A, do not disable the failing rule, and do not reclassify the violation as
   `NEEDS_HUMAN` and pass it. Escalate for re-review, raise an ADR under `docs/adr/` if the cause is a
   durable technical constraint, and write back to `docs/prd/23-assurance/README.md` **and**
   `docs/prd/breakdown-plan.md` before any further code. `LNCH-05` is `blocked_by` this ticket and
   closes PRD §26 against this report; an accessibility failure that was quietly configured away is
   indistinguishable, at review time, from a product that was never tested.
