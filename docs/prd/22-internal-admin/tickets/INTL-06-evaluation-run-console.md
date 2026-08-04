---
id: INTL-06
title: Evaluation-run console
module: 22-internal-admin
lane: 22-internal-admin
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INTL-01, GOLD-03]
blocks: []
---

# INTL-06 — Evaluation-run console

Implements **PRD §8.11 (evaluation runs), §14 and §43.5 — requirements `ADM-001` and `EVAL-002`**
(epic `E29-INTERNAL-ADMIN`).
No ADR — the decision is already made in PRD §14.2 (the seven release thresholds) and PRD §43.5
(*"Promotion UI links one immutable release report"*); this is build ticket **6 of 10** against it.
Parent sub-PRD: [22-internal-admin README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`INTL-01`](INTL-01-internal-v1-separation-internal-identity-admin-shell.md);
`GOLD-03` — Release gate enforcement and release evidence pack
([`21-evaluation-600`](../../21-evaluation-600/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
`GOLD-03`'s gate results and release evidence pack, plus `INTL-01`'s internal boundary — not a new
subsystem decision.

## Background + basis

**What a fresh agent needs to know before touching anything.**

`INTL-01` has merged and owns the internal boundary; its "internal boundary contract" is normative
here. This ticket declares `area = internalArea({ areaId: 'evaluation', capability: 'EVALUATION' })`,
wraps its plugin in `internalRoutes()`, and reads operational state only through
`OperationalSnapshotStore` (sub-PRD **D5**).

`GOLD-03` has merged. `docs/prd/breakdown-plan.md` §5.22 defines it verbatim:

> | GOLD-03 | Release gate enforcement and release evidence pack | L |
> `pipelines/evaluation/src/gates/**`, `evals/reports/**` | GOLD-02 | §14.2, §43.5, EVAL-002, E31 |
> **A deliberately failing metric blocks promotion.** |

It owns the gate evaluation and writes the immutable release report under `evals/reports/**`. This
console **links and displays**; it never re-computes a metric, never re-runs an evaluation and never
edits a report.

`CRPS-02`'s release manifest already carries an `evaluation` object
(`{status, report_id | null, ran_at | null, metrics: {…}, gates: [{name, threshold, observed,
passed}]}`), which is how `INTL-04` shows gate outcomes on a release. This console is the fuller view:
runs over time, per-category breakdown and the linked evidence pack.

**What the PRD fixes, quoted.**

PRD §14.2 — the seven gates, verbatim:

> | Factual citation coverage | 100% |
> | Citation precision | ≥ 98% |
> | Retrieval recall@10 | ≥ 90% |
> | Critical legal-date or jurisdiction errors | 0 |
> | Unsupported definitive claims | 0 |
> | Correct refusal | ≥ 95% |
> | Source-status correctness | ≥ 98% |
>
> The release MUST also have no critical regression relative to the current production baseline,
> acceptable schema success, cost and latency, and **no supported-to-unsupported or
> refusal-to-definitive degradation in material cases.**

PRD §14.1: 600 stratified synthetic cases — **360 development, 120 validation, 120 blind test**.

PRD §14.3: *"Deterministic checks control legal/citation launch gates. A pinned LLM judge MAY assist
with clarity … but MUST NOT decide legal correctness, binding status, date applicability or release
alone. … Related smoke subsets run on changes; development cases run nightly where practical;
development + validation run weekly; all 600 run for release candidates. **Blind gold answers MUST
remain outside ordinary coding-agent context.** Formal dataset corrections create a new version and
reason; they are not edited invisibly."*

PRD §43.5 — the release evidence pack:

> Promotion UI links **one immutable release report** containing application/corpus versions, source
> coverage and gaps, all 600 metrics, per-category breakdown, critical-error list, changed cases,
> security/tenant/PII results, performance and memory benchmark, provider/profile cost forecast,
> backup/restore result, accessibility result, known risks and founder approval/reason.

PRD §43.4 — the founder test queue review order and the classification vocabulary `CODE`, `CORPUS`,
`GOLD_DATA`, `PROMPT`, `MODEL_PROFILE`, `PRODUCT_AMBIGUITY`, `SOURCE_LIMITATION`, and:
*"Agents may not 'fix' a failing gold case by changing expected output without a versioned
founder-approved reason."*

PRD §30.2 `EVAL-002`: *"Release is blocked unless every numeric and zero-tolerance gate passes"*,
primary surface *"Release admin"*, evidence *"Deliberate failing metric prevents promotion"*.
PRD §30.2 `ADM-001` includes *"evaluation … visible internally"*.

PRD §45.1 item 6: *"Never expose blind evaluation gold data, production credentials or customer
content to coding agents."* `docs/prd/breakdown-plan.md` §9 risk **R9** repeats it: *"`evals/gold/**`
blind material leaks into ordinary agent context … no ticket may reference `evals/gold/**` blind
paths."*

**Accepted caveats carried forward, documented not enforced here.**

- **This console never displays blind case content.** It shows aggregate metrics, per-category
  breakdowns, gate outcomes and case **identifiers/status** — never a blind case's question, expected
  answer or gold authorities (PRD §14.3, §45.1 item 6, plan **R9**). Development-split case content is
  likewise out of scope: the console is a gate and run view, not a case editor.
- **No promotion happens here.** `EVAL-002`'s *"prevents promotion"* is enforced by `GOLD-03` and by
  `INTL-04`'s `EVALUATION_GATES_PASSED` check; this console makes the gate outcome legible and links
  the immutable report.
- **Model-profile promotion** (PRD §14.4) is `GOLD-15`'s. The hosted model behind each profile is
  **benchmark-selected** (plan §8 **Q1**): it is resolved by comparing accuracy, zero-tolerance
  failures, latency, provider availability and cost through this very evaluation pipeline, `GOLD-15`
  records the promotion report, and the Founder approves production promotion **after** seeing that
  evidence rather than picking a model on preference beforehand. This console displays whatever
  profile a run recorded, and shows no profile as promoted, preferred or default unless the run
  document says so.

## Goal

Produce the internal evaluation-run console: `/internal/v1/evaluation` endpoints serving the run
history (smoke, nightly development, weekly development+validation, release-candidate full-600 — PRD
§14.3), each run's seven PRD §14.2 gate outcomes with threshold and observed value, the per-category
breakdown, the critical-error and changed-case counts, and a **link** to the one immutable PRD §43.5
release report; plus the `apps/admin/src/features/evaluation/**` screens. Completion is mechanically
checkable: all seven gates appear with threshold, observed and pass/fail — a deliberately failing gate
renders the run as **blocking**; the report is linked and never inlined or edited; no blind-case
content appears in any response, screen or log; and every endpoint is invisible to customer identity.

## Non-goals

- **No evaluation runner, metrics, judge or gate thresholds.** `GOLD-02`, `GOLD-03`, `GOLD-04`
  (`pipelines/evaluation/**`). This console displays their output.
- **No case authoring, editing or dataset correction.** `GOLD-01` and `GOLD-05`…`GOLD-14`
  (`evals/{cases,gold}/**`). PRD §14.3: *"Formal dataset corrections create a new version and reason;
  they are not edited invisibly."*
- **No blind gold access of any kind.** Plan **R9**, PRD §45.1 item 6, PRD §14.3.
- **No release promotion or gate enforcement.** `INTL-04` (authorisation) and `RLSE-07` (the tool);
  `GOLD-03` enforces the gate.
- **No model-profile promotion.** `GOLD-15` (PRD §14.4).
- **No triggering of runs.** Runs are executed on the workstation pipeline (PRD §19.3); this console is
  read-only (deliverable 6).
- **No cost or usage view.** `INTL-07` — the run's cost forecast is shown as the report's own recorded
  figure, and links out.
- **No internal boundary code.** `INTL-01`. **No table, migration or repository.** `01-app-data`.

## File-scope (write-owns)

- `apps/api/src/routes/internal/evaluation/**`
- `apps/api/test/internal/evaluation/**` (sub-PRD **D11**), including
  `apps/api/test/internal/evaluation/fixtures/**`
- `apps/admin/src/features/evaluation/**`
- `apps/admin/test/evaluation/**` (sub-PRD **D11**)
- `apps/admin/package.json` — **append-only**, dependencies block only (sub-PRD **D10**, plan §1.1)

Does not touch:

- `apps/api/src/routes/internal/core/**`, `apps/admin/src/app/**`, `apps/admin/{index.html,vite.config.ts,tsconfig.json}`
  — `INTL-01`.
- `apps/api/src/routes/internal/{sources,quarantine,releases,licensing,cost,issues,incidents}/**` and
  `apps/admin/src/features/{sources,quarantine,releases,licensing,cost,issues,incidents,overview}/**`
  — `INTL-02`…`INTL-05`, `INTL-07`…`INTL-10`.
- `pipelines/evaluation/**`, `evals/**` (**including and especially `evals/gold/**`**),
  `schemas/evaluation/**` — `21-evaluation-600`. Test fixtures for this ticket are **synthetic** and
  live under `apps/api/test/internal/evaluation/fixtures/**` (plan §4.2: assurance and consoles use
  their own synthetic fixtures, never blind gold).
- `apps/api/src/{server.ts,app.ts,bootstrap,plugins,middleware,errors,sse}/**` and every other
  `apps/api/src/routes/<area>/**` — `03-app-runtime` and the product modules.
- `packages/**`, `schemas/**` — `00`–`03`, `11`, `12`, `20`. `apps/web/**`, `apps/widget/**`,
  `infra/**`, `tests/**` — other modules.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, nothing in flight),
so no prior ticket has written these paths. Inside `apps/api/src/routes/internal/**` and `apps/admin/**`
only `INTL-01` (this ticket's `blocked_by`) has written, owning `internal/core/**` and `src/app/**`,
and it completes first. The seven siblings that may run concurrently (plan §7 wave 2, all blocked only
by `INTL-01`) own different `internal/<area>/` and `features/<area>/` directories, discovered by
directory convention (plan **A1**, sub-PRD **D9**). `GOLD-03` writes only `pipelines/evaluation/src/gates/**`
and `evals/reports/**`, which this ticket never touches. The single shared file is
`apps/admin/package.json`, restricted to appending distinct dependency entries.

## Deliverables

1. **`apps/api/src/routes/internal/evaluation/index.ts`** — `export const area = internalArea({ areaId:
   'evaluation', capability: 'EVALUATION' })` and a default export of `internalRoutes(plugin, { areaId:
   'evaluation', capability: 'EVALUATION' })`.
2. **`evaluation/snapshot.ts`** — reads `OperationalSnapshotStore.read('EVALUATION')`, validating
   against `GOLD-03`'s committed report/gate schema (`schemas/evaluation/**` is `21`'s; reference it,
   never copy it). Exposes the run list and per-run detail. All timestamps, metric values and gate
   verdicts come from the document; nothing is recomputed here (deliverable 5).
3. **`GET /internal/v1/evaluation/runs`** — run history. Each row: `run_id`, `kind`
   (`SMOKE | DEVELOPMENT | DEVELOPMENT_PLUS_VALIDATION | RELEASE_CANDIDATE` — the PRD §14.3 cadences),
   `ran_at`, `split_scope` (case counts by split, PRD §14.1's 360/120/120), `app_version`,
   `corpus_release_id`, `model_profiles` recorded for the run, overall `gates_passed` and the count of
   failing gates. Cursor pagination and filters by `kind`, `corpus_release_id` and `gates_passed`
   (PRD §34.1).
4. **`GET /internal/v1/evaluation/runs/{runId}`** — run detail:
   - **the seven PRD §14.2 gates**, each with `name`, `threshold`, `observed`, `passed` and the
     comparison operator, asserted present against a literal list so a missing gate fails loudly:
     factual citation coverage (100%), citation precision (≥98%), retrieval recall@10 (≥90%), critical
     legal-date or jurisdiction errors (0), unsupported definitive claims (0), correct refusal (≥95%),
     source-status correctness (≥98%);
   - the four **non-numeric release conditions** of PRD §14.2's closing paragraph (no critical
     regression against baseline, acceptable schema success/cost/latency, no
     supported-to-unsupported degradation, no refusal-to-definitive degradation), each as a named
     condition with its recorded verdict — absent means `UNKNOWN`, never `passed`;
   - the **per-category breakdown** (PRD §43.5) as counts and metric values per case category;
   - the **critical-error list** and **changed-case list** as case **identifiers and status only** —
     never case content (deliverable 7);
   - the recorded judge usage, with the PRD §14.3 note that the judge does not decide legal
     correctness, so the screen cannot be misread as judge-decided.
5. **Nothing is recomputed.** `evaluation/projection.ts` maps document → DTO with no arithmetic beyond
   formatting: no threshold comparison, no percentage derivation, no pass/fail inference. A source scan
   asserts the area contains no comparison of an observed value against a threshold constant
   (PRD §14.3 *"Deterministic checks control legal/citation launch gates"* — the checks are
   `GOLD-03`'s, and a second implementation could disagree with the gate that actually blocks).
6. **`GET /internal/v1/evaluation/runs/{runId}/report`** — returns the **link and identity** of the one
   immutable PRD §43.5 release report (`report_id`, `location`, `sha256`, `generated_at`, and the
   presence/absence of each of the fourteen §43.5 sections). It returns a reference, not the report
   body, and there is no endpoint that edits, regenerates or annotates a report
   (PRD §43.5 *"one immutable release report"*). The area registers **only** `GET` routes.
7. **Blind protection is structural.** `evaluation/redaction.ts` projects case-level rows to
   `{ case_id, split, category, status, failure_class }` and nothing else; a response assertion rejects
   any field whose name or value matches the document's case-content members (question, scenario,
   expected answer, gold authorities, required/prohibited claims). A test asserts that a fixture whose
   run document mistakenly contains blind case bodies produces a response with none of them, and that
   no `evals/gold/**` path string appears anywhere in this ticket's source or fixtures
   (PRD §14.3, §45.1 item 6, plan **R9**).
8. **`apps/admin/src/features/evaluation/feature.tsx`** — an `AdminFeatureModule` with `id:
   'evaluation'`, a nav entry and routes `/internal/evaluation`, `/internal/evaluation/:runId`.
   Screens:
   - **run list** — newest first, with the run kind, corpus release, app version and a pass/fail
     summary as text plus badge;
   - **run detail** — the seven-gate table with threshold and observed side by side (a failing gate is
     unmistakable and labelled *blocking*), the four non-numeric conditions, the per-category
     breakdown, the critical-error and changed-case identifier lists, and a prominent link to the
     immutable report with its `sha256`;
   - a link to `INTL-04`'s release detail for the same `corpus_release_id`, so the operator can see
     the gate outcome in its promotion context (`EVAL-002`);
   - `SnapshotStatePanel` for `AVAILABLE`/`STALE`/`UNAVAILABLE`, and the PRD §31.3 async states.

## Acceptance checklist (classified)

- [ ] `[machine]` The area mounts at `/internal/v1/evaluation` via `internalArea()`/`internalRoutes()`
      and `assertInternalMounting` passes (`INTL-01` contract items 1–2; PRD §8.11, §16.1)
- [ ] `[machine]` **`ADM-001` negative, every endpoint:** a customer session, a customer service-account
      credential and a widget token each receive a `404 RESOURCE_NOT_FOUND` byte-identical (apart from
      `request_id`) to the unknown-path body on the run list, run detail and report endpoints;
      unauthenticated → `401`; internal principal without `EVALUATION` → the same `404`
      (PRD §30.2 `ADM-001`; PRD §16.5, §34.9)
- [ ] `[machine]` **PRD §14.2 seven gates** are all present on a run detail with `threshold`, `observed`
      and `passed` — asserted against a literal list of the seven names; a run document missing a gate
      fails with the gate named, rather than rendering six
- [ ] `[machine]` **`EVAL-002`:** a fixture with a deliberately failing metric renders the run as
      failing and **blocking**, and the same run is reported not-promotable through the shared shape
      `INTL-04` consumes (PRD §30.2 `EVAL-002` *"Deliberate failing metric prevents promotion"*)
- [ ] `[machine]` The four non-numeric PRD §14.2 conditions each render with their recorded verdict, and
      an absent verdict renders `UNKNOWN` — never `passed`
- [ ] `[machine]` **Nothing is recomputed:** a source scan finds no threshold constant and no comparison
      of `observed` against a threshold in this area; a fixture whose `passed` disagrees with its own
      numbers is displayed **as recorded**, with the disagreement surfaced as a data warning rather than
      silently corrected (PRD §14.3)
- [ ] `[machine]` **Blind protection:** no response, screen or log line contains a case question,
      scenario, expected answer, gold authority or claim list — asserted against a fixture that
      deliberately embeds them; no `evals/gold/**` path appears in this ticket's source or fixtures
      (PRD §14.3, §45.1 item 6, plan **R9**)
- [ ] `[machine]` The report endpoint returns a reference (`report_id`, `location`, `sha256`,
      `generated_at`, section presence) and not the report body; the area registers **only** `GET`
      routes and no path edits, regenerates or annotates a report (PRD §43.5)
- [ ] `[machine]` The PRD §14.1 split counts (360/120/120) are displayed from the document and a
      mismatch is surfaced as a warning, not corrected (PRD §14.1, `EVAL-001`)
- [ ] `[machine]` `assertSnapshotPortOnly()` and `assertNoInternalSurfaceInCustomerArtifacts()` green
      (sub-PRD **D5**, **D7**; PRD §8.11, §18.3, §39.1)
- [ ] `[machine]` PRD §22 canary: no research content, PII text or credential in any response, log line
      or audit event
- [ ] `[machine]` Admin screens implement the PRD §31.3 async states and mark a failing gate by text as
      well as badge, not colour alone (PRD §41.1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `ADM-001` and `EVAL-002`, and confirming no
      blind-gold exposure
- [ ] `[fixture]` The committed **synthetic** evaluation fixtures under
      `apps/api/test/internal/evaluation/fixtures/**` replay end-to-end: one all-pass release-candidate
      run, one with a deliberately failing gate, one missing a gate, one with `UNKNOWN` non-numeric
      conditions, one containing embedded case bodies (redaction control), one stale document and one
      schema-invalid document — offline, no network, no production credentials, and **no material copied
      from `evals/gold/**`**
- [ ] `[human]` PRD §43.4 founder review: the review order's items 2 and 3 (*"any unsupported claim or
      legal-date/jurisdiction failure"*, *"changed evaluation cases versus last accepted baseline"*) are
      readable from a run detail, and the reviewer confirms no blind case content is visible
      (PRD §43.4, §14.3)
- [ ] `[human]` Gate 2 smoke linkage, **not required to merge**: the operator opens the release
      candidate run and follows its link to the immutable PRD §43.5 report (`GOLD-17` produces the
      real run)
- No further `[human]` criteria — PRD §41.2 contains no `UAT-ADM-*` row (sub-PRD **M4**)
- No `cargo test --workspace` / `uv run pytest` item — this ticket touches no Rust and no Python
  (PRD §45.3); the evaluation pipeline is `21-evaluation-600`'s

## Test plan

Reviewer steps, offline: no network, no evaluation run, no model provider, no production credentials,
and no access to `evals/gold/**`.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`; `pnpm test`.
2. Focused: `pnpm test --filter @aer/api`, `pnpm test --filter @aer/admin`. Suites under
   `apps/api/test/internal/evaluation/` and `apps/admin/test/evaluation/`.
3. **`boundary.test.ts`** — `internalAreaConformance('evaluation')` plus the four-row denial matrix
   from `INTL-01` contract item 4 against all three endpoints.
4. **`gates.test.ts`** — `[fixture]` replay; assert the seven-gate literal list, threshold/observed
   presence, the blocking render for the failing-gate fixture, and the named failure for the
   missing-gate fixture.
5. **`no-recompute.test.ts`** — source scan for threshold literals and comparisons; then the
   disagreeing fixture (recorded `passed: true` with a failing number): assert the display follows the
   record and raises a data warning.
6. **`redaction.test.ts`** — the embedded-case-bodies fixture: assert none of its content strings
   appear in any response, rendered screen or log line; assert the projected case row has exactly the
   five permitted members; grep this ticket's whole tree for `evals/gold`.
7. **`report-link.test.ts`** — assert the report endpoint returns a reference with `sha256` and section
   presence, never a body; enumerate the route table and assert every method is `GET`.
8. **`evaluation.screen.test.tsx`** — render list and detail against each fixture; assert a failing gate
   is labelled blocking in text, the report link shows its hash, and a stale document renders
   `SnapshotStatePanel`.
9. `git status --porcelain` clean after the run.
10. **Reviewer focus** (CLAUDE.md): whether any comparison is performed locally that could disagree
    with `GOLD-03`; whether a case body can reach a response through an unexpected field; whether the
    report can be mutated or inlined; whether an absent non-numeric condition can read as passing;
    whether a customer principal reaches any endpoint.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`GOLD-03`'s report or gate document lacks a field this console must show** (a gate's operator, the
  per-category breakdown, the section inventory) → do not derive it here and do not write
  `pipelines/evaluation/**` or `evals/**`. Amend `GOLD-03`'s ticket and
  `docs/prd/21-evaluation-600/README.md` in one docs PR, record the dependency in
  `docs/prd/22-internal-admin/README.md`, then `--sync` both.
- **The run document contains blind case material** → that is a leak of the kind plan **R9** and PRD
  §45.1 item 6 exist to prevent. Redact structurally (deliverable 7), then **escalate**: record it in
  `docs/prd/22-internal-admin/README.md` and against `GOLD-01`/`GOLD-03` in
  `docs/prd/21-evaluation-600/README.md`. Do not treat it as a display detail.
- **An operator wants to trigger a run from the console** → runs execute on the workstation pipeline
  (PRD §19.3) and would need a dispatch path that does not exist (sub-PRD **M1**/**M7** family). Raise
  it in `docs/prd/22-internal-admin/README.md` open questions and, if accepted, as a plan change in
  `docs/prd/breakdown-plan.md` §5.23/§6.2. This ticket stays read-only.
- **A gate's recorded verdict disagrees with its own numbers** → display as recorded plus a warning
  (deliverable 5) and raise it against `GOLD-03`. Never "fix" the verdict in the console: PRD §43.4
  forbids agents changing evaluation outcomes without a versioned founder-approved reason.
- **PRD §14.2's gate list changes** → the thresholds are product gates, not tuning constants. A change
  is a **product change** (PRD §45.5) requiring founder approval and a PRD update; record it in
  `docs/prd/22-internal-admin/README.md` open questions with the Founder as owner.

**3. Escalation.** `EVAL-002` (*"Release is blocked unless every numeric and zero-tolerance gate
passes"*) and PRD §14.3's blind-gold protection are release requirements. If the console cannot show a
gate outcome without recomputing it, or cannot avoid rendering blind material, that overturns a team
decision spanning this module and `21-evaluation-600`: stop, escalate for re-review, and never ship the
local recomputation or the unredacted view. **A console change that would have to bypass the audit
trail or delete a report to work overturns PRD §12.4 and §43.5** — escalate, never implement the
shortcut.
