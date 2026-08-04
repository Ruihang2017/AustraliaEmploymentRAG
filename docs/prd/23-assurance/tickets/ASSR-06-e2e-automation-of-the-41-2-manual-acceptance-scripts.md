---
id: ASSR-06
title: "E2E automation of the §41.2 manual acceptance scripts"
module: 23-assurance
lane: 23-assurance
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FIND-04, ASK-09, ASK-12, RCRD-09, WTCH-08, XPRT-05, IDNT-08]
blocks: [ASSR-07]
---

# ASSR-06 — E2E automation of the §41.2 manual acceptance scripts

Implements PRD §41.1 and §41.2 — the product acceptance manual; contributes evidence to
**SRCH-001/002/005**, **ANS-006**, **COV-001/002/004**, **CMP-001/002**, **REC-004**, **MON-003**,
**EXP-001/002**, **AUTH-001**, **OPS-003**; epic `E34`.
No ADR exists for the acceptance behaviour — the decision is already made in PRD §41 (the universal UI
rules and the 32 acceptance scripts are normative); this is build ticket 6 of 8 against it. This
ticket **does** create one new ADR for a durable dependency it must choose (the browser and
accessibility runtime, sub-PRD **M-Q2**), per breakdown plan **A9**.
Parent sub-PRD: [23-assurance README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [FIND-04 — Advanced Search screen (filters, sort, no-results taxonomy)](../../14-search-product/tickets/FIND-04-advanced-search-screen-filters-sort-no-results-taxonomy.md), [ASK-09 — Coverage screens](../../15-answer-product/tickets/ASK-09-coverage-screens.md), [ASK-12 — Compare screens](../../15-answer-product/tickets/ASK-12-compare-screens.md), [RCRD-09 — Create record from search selection](../../17-records-collab/tickets/RCRD-09-create-record-from-search-selection.md), [WTCH-08 — Alerts list and alert detail screens](../../16-monitor-alerts/tickets/WTCH-08-alerts-list-and-alert-detail-screens.md), [XPRT-05 — Export UI: request, status, download, expiry](../../19-exports/tickets/XPRT-05-export-ui-request-status-download-expiry.md), [IDNT-08 — Members and security settings screens](../../13-identity-surface/tickets/IDNT-08-members-and-security-settings-screens.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §41.2 is a finished 32-row acceptance table and PRD §41.1 a finished rule list; this makes them
run unattended, and decides no product behaviour.

## Background + basis

**PRD §41.1 universal UI acceptance, quoted verbatim — every customer screen must pass these before
feature-specific sign-off:**

> - works at 360 px, 768 px and 1280 px widths without hiding legal status, citations, primary actions
>   or error recovery;
> - complete keyboard operation with visible focus and logical order;
> - one programmatic page heading, labelled fields, error summaries and live regions for asynchronous
>   status;
> - colour is never the only status signal;
> - **dates display unambiguously as `3 Aug 2026` in UI while APIs use ISO format;**
> - jurisdiction, legal status and source freshness use text plus badge/icon;
> - **destructive/security-sensitive actions name exact effect and recovery;**
> - **request/job/correction IDs are copyable from errors and support panels;**
> - **customer research content is not placed in URL query strings, analytics, browser error telemetry
>   or page titles;**
> - **refresh/back/forward/reconnect does not duplicate writes or charges.**

The four bold rules above are behavioural and belong to **this** ticket; the accessibility and
responsive rules (widths, keyboard, focus, headings/labels/live regions, colour-not-only, text plus
badge) belong to **`ASSR-07`**, which is `blocked_by` this ticket and reuses its runtime and page
objects. The split is stated in both tickets so neither rule set is orphaned.

**PRD §41.2 manual acceptance scripts** are 32 rows (`UAT-AUTH-01` … `UAT-OPS-03`). PRD §31.3 adds the
ten mandatory asynchronous states every job-driven screen must implement — `IDLE`, `VALIDATING`,
`QUEUED`, `RUNNING`, `WAITING_FOR_CLARIFICATION`, `CANCELLING`, `COMPLETED`, `FAILED`, `CANCELLED`,
`EXPIRED` — each with *"a visible title, plain-language explanation, allowed next action and
request/job ID. A spinner without state or recovery guidance is not acceptable."*

**PRD §26 Product** makes the outcome a Definition-of-Done item: *"All required product surfaces are
deployed and authenticated … English UI, accessibility and responsive requirements pass release
review."* PRD §41.3 adds the safety rule this suite must respect when selecting scenarios: *"The demo
must include one legitimate refusal/insufficient-evidence case. A demo that shows only fluent positive
answers misrepresents the product's safety value."*

**Why this cannot live in the product modules.** Each screen ticket tests its own screen. A
`UAT-*` row is a *journey*: `UAT-REC-02` opens the same record in two browser contexts and expects the
second write to fail with a 409 and reload guidance; `UAT-MON-01` promotes a fixture corpus change and
expects one `DetectedChange` to reach three organisations' alerts and mark their records. Those cross
`apps/web`, `apps/api`, `apps/worker`, `packages/database` and the corpus pipeline. PRD §45.2 assigns
cross-boundary E2E to `tests`.

**What the `blocked_by` closure guarantees (sub-PRD D3).** Union of the seven blockers' closures:
the web shell and shared UI (`RUNT-05`, `RUNT-06`), Simple and Advanced Search (`FIND-01`, `FIND-03`,
`FIND-04`) and the source/version/timeline screens (`FIND-02`, `FIND-05`), the Ask form, progress and
result screens (`ASK-01`, `ASK-04`, `ASK-05`, `ASK-06`, `ASK-07`), Coverage (`ASK-08`, `ASK-09`) and
Compare (`ASK-11`, `ASK-12`), records list/detail and create-from-search (`RCRD-01`, `RCRD-02`,
`RCRD-04`, `RCRD-05`, `RCRD-08`, `RCRD-09`), watchlists, change matching and alerts screens
(`WTCH-01`, `WTCH-02`, `WTCH-03`, `WTCH-07`, `WTCH-08`) with `CRPS-06`'s candidate-release build,
exports end to end (`XPRT-01` … `XPRT-05`), invitations, membership and MFA routes plus the members
and security settings screens (`IDNT-01` … `IDNT-04`, `IDNT-08`), and beneath all of it the app
database, admission chain, worker runtime, evidence/safety packages and a synthetic corpus release.

**Accepted caveats carried forward — each becomes a row in `coverage-gaps.md` (sub-PRD M-Q3):**

- `UAT-AUTH-04` (SSO before test) needs `IDNT-05`/`IDNT-09`.
- `UAT-ANS-02` (clarification questions) needs `ASK-03`.
- `UAT-MON-02` (signed-webhook replay) needs `WTCH-05`.
- `UAT-OPS-01` (corrupt candidate corpus blocks promotion) needs `RLSE-07`.
- `UAT-REC-01` (rerun under current law) needs `RCRD-03`.
- `UAT-EXP-01`'s **correction banner** needs `RCRD-07`; the rest of the row (original legal date and
  release, no regeneration) is inside the closure.
- **`apps/web/src/features/auth/**` has no owning ticket in breakdown plan §5.14** — plan §4 assigns
  the tree to `13-identity-surface`, but `IDNT-08` and `IDNT-09` cover only `features/settings/**`.
  `UAT-AUTH-01`'s browser half (no public signup route in the web app) therefore has no surface to
  assert against; its API half (no unauthenticated account-creation endpoint) is inside the closure
  and is asserted here.

## Goal

Produce `tests/e2e/uat/**`: a pinned, offline browser runtime driving the built `apps/web` bundle
against an in-process API and worker with a synthetic corpus release and a stub provider; a verbatim
transcription of PRD §41.2's 32 rows as machine-readable data; one automated journey per row this
ticket's closure can reach; a cross-reference for each row a sibling `ASSR-*` suite already automates;
and a gap register for the rest. Plus assertions for the four behavioural PRD §41.1 rules and the ten
PRD §31.3 asynchronous states. Completion is mechanically checkable: the matrix must contain exactly
32 rows, each with a status of `automated-here`, `automated-by:<ASSR-NN>` or `gap`, and a `gap` row
without an owning ticket and a plan edge fails the suite.

## Non-goals

- **No accessibility or responsive assertions** — `ASSR-07` (`tests/e2e/accessibility/**`), which is
  `blocked_by` this ticket and reuses this runtime and these page objects. This ticket owns only the
  four behavioural PRD §41.1 rules named above.
- **No per-screen component or contract tests** — every product module owns its own
  (`FIND-03`/`FIND-04`, `ASK-06`/`ASK-07`/`ASK-09`/`ASK-12`, `RCRD-08`/`RCRD-09`, `WTCH-07`/`WTCH-08`,
  `XPRT-05`, `IDNT-08`).
- **No tenant-isolation, PII, citation, security or restore assertions** — `ASSR-01` … `ASSR-05`,
  `ASSR-08`. Rows those suites automate are **cross-referenced** in the matrix, never duplicated.
- **No `/internal/v1` or `apps/admin` journeys** — `22-internal-admin` (sub-PRD **D18**/**M-Q4**).
- **No widget or SDK journeys** — `20-developer-platform` (`PLTF-05`, `PLTF-06`); not in this closure.
- **No public marketing/status site journeys** — `24-launch` (`LNCH-03`).
- **No PRD §41.3 demonstration script or §41.4 onboarding pack** — `24-launch` (`LNCH-04`). This
  suite supplies the automated evidence those documents cite.
- **No evaluation cases, metrics or gold data** — `21-evaluation-600`; no read of `evals/**` (plan
  **R9**).
- **No CI workflow or root-script edits** — `00-foundation` (`FND-02`, `FND-01`); sub-PRD **D15**,
  **M-Q8**.

## File-scope (write-owns)

Owned by this ticket:

- `tests/e2e/uat/**` — including `runtime/**` (browser bootstrap), `pages/**` (page objects shared
  with `ASSR-07`), `fixtures/**`, `journeys/**`, `uat-matrix.json` and `coverage-gaps.md`.
- `tests/e2e/package.json`, `tests/e2e/tsconfig.json` — **append-only**, own scripts and dependencies
  only (created by `FND-01`; sub-PRD **D16**). Shared with `ASSR-07`, which is serialised after this
  ticket.
- `docs/adr/NNNN-e2e-browser-and-accessibility-runtime.md` — **one new file**, claimed by this ticket
  under breakdown plan **A9** (`docs/adr/**` is shared-additive with per-file ownership).

Does not touch:

- `tests/e2e/accessibility/**` — `ASSR-07`.
- `tests/tenant-isolation/**` — `ASSR-01`; `tests/security/**` — `ASSR-02`, `ASSR-03`;
  `tests/integration/**` — `ASSR-04`, `ASSR-05`, `ASSR-08`.
- **Any other module's package or app tree** — `packages/**`, `apps/**`, `services/**`,
  `pipelines/**`, `infra/**`, `schemas/**`, `evals/**`. Not even to add a test id or a data attribute
  to a screen (sub-PRD **D1**) — see the feedback obligation for what to do instead.
- Any other `docs/adr/*.md` file — per-file ownership (**A9**).
- `.github/workflows/**`, root `package.json`, root lockfiles — `00-foundation`.
- `docs/PRD.md` — frozen. `docs/prd/breakdown-plan.md` — docs PR only.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). `tests/e2e/uat/**` is written by no other ticket in the plan (plan §5.24). This is a wave-1
ticket; its concurrent siblings write `tests/tenant-isolation`, `tests/security/*` and
`tests/integration/*` — different workspace members entirely. The only intra-member neighbour is
`ASSR-07`, which is `blocked_by` this ticket and therefore **never concurrent**; it owns
`tests/e2e/accessibility/**` and shares only the append-only `tests/e2e/package.json` and
`tsconfig.json`. The new ADR file is a fresh path claimed here under **A9**. All seven declared
blockers land first by construction.

## Deliverables

1. **`docs/adr/NNNN-e2e-browser-and-accessibility-runtime.md`** (sub-PRD **M-Q2**, plan **A9**).
   Records the durable choice this ticket cannot avoid: which browser-automation runtime and which
   accessibility-rule engine the E2E suites use, why, what was rejected, and — decisively — **how the
   browser binaries are pinned and integrity-verified, and how the suite runs with no network at test
   time** (pre-populated cache or vendored download step with a checksum). Cites PRD §13.1, §41.1,
   §20.2, §21.1 (*"Pinned dependencies/images, lockfiles, SBOM … and no arbitrary runtime
   plugin/model/code download"*) and §45.5's "Architecture decision" class. `ASSR-07` consumes this
   choice and makes none of its own.
2. **`runtime/stack.ts` — the E2E stack** (sub-PRD **D4**, **D5**, **D17**). Boots, in one process
   tree and with no Compose: the API from `RUNT-01`'s `buildApp(config)` on an ephemeral loopback
   port; `RUNT-04`'s lease loops with an injected clock; `services/search-rs` read-only against the
   synthetic corpus fixture; the **built** `apps/web` bundle served statically (build once per run,
   preview server, never a dev server with HMR); `EVID-07`'s stub provider tape; filesystem-backed S3;
   email/webhook sinks. Exposes `seed()` helpers for organisations, members, records, watchlists and
   alerts. Network egress beyond loopback is denied and asserted.
3. **`fixtures/corpus/**` and `fixtures/tapes/**`** (sub-PRD **D6**) — a synthetic corpus release
   (from `CRPS-08`'s shape) containing what the journeys need: an Act with an exact section and a
   version effective at 2024-08-03 plus a different current version (`UAT-SRCH-03`); an
   `ENACTED_NOT_IN_FORCE` item (`UAT-SRCH-02`); a modern award with classifications and a synthetic
   employer/ABN with an agreement chain (`UAT-COV-01`/`-02`); an instrument with two dated versions
   and a one-sided jurisdiction pair (`UAT-CMP-01`/`-02`); a stale/`FRESHNESS_LIMITED` item; plus a
   candidate release carrying one changed document for `UAT-MON-01`. Provider tapes cover a supported
   answer, an `INSUFFICIENT_EVIDENCE` answer (PRD §41.3's mandatory refusal case) and a coverage
   assessment with multiple candidates.
4. **`uat-matrix.json` — PRD §41.2 transcribed verbatim** (sub-PRD **D12**). All **32** rows with
   `{ id, setup_action, expected_result }` copied exactly, plus
   `{ status: 'automated-here' | 'automated-by' | 'gap', suite?, journey?, owner_ticket?, plan_edge? }`.
   A `matrix.test.ts` asserts: exactly 32 rows; ids and text match the PRD (compared against a frozen
   copy committed beside it); every `automated-here` row resolves to an existing journey file; every
   `automated-by` names one of `ASSR-01` … `ASSR-05`, `ASSR-08`; every `gap` row carries an
   `owner_ticket` **and** a `plan_edge`. This assertion is what makes "every automatable row runs
   unattended" mechanically checkable.
5. **Cross-referenced rows (no duplication).** `UAT-AUTH-03` → `ASSR-01`; `UAT-PII-01`, `UAT-PII-02` →
   `ASSR-03`; `UAT-ANS-04` → `ASSR-02`; `UAT-ANS-05` → `ASSR-04`; `UAT-ANS-01`, `UAT-ANS-06`,
   `UAT-ANS-07` → `ASSR-05`; `UAT-OPS-02` → `ASSR-08`. Where the row has a **browser-visible half**
   that the sibling suite cannot assert (the PII block rendered in the Ask form; the cancel control;
   the reconnect banner; the expired-download message), this ticket automates that half and the matrix
   records both.
6. **`journeys/auth/**`** — `UAT-AUTH-01` (API half: no unauthenticated account-creation endpoint
   exists; the browser half is a gap, see deliverable 12) and `UAT-AUTH-02` (accept the same invite
   twice: first succeeds, second shows consumed/invalid with **no new membership** — asserted in the
   members screen and in the database).
7. **`journeys/search/**`** — `UAT-SRCH-01` (model gateway disabled: an exact Act section is still
   returned, and the latency gate is *observed and reported*, not asserted as a hard number here —
   `FIND-06` owns the benchmark); `UAT-SRCH-02` (future material absent from default results or
   visibly separated when requested); `UAT-SRCH-03` (select 2024-08-03, open a result, assert the
   version effective at that date opens and current text is **not** substituted); `UAT-SRCH-04`
   (invalid ABN in the advanced employer filter: inline checksum error, and **no search or quota
   event** — asserted in the database, not only on screen).
8. **`journeys/answer/**`** — `UAT-ANS-03` (an `INSUFFICIENT_EVIDENCE` answer renders as such with no
   definitive conclusion, PRD §32.3's fixed eight-part order intact) and `UAT-ANS-08` (with the hosted
   budget at its hard stop, Search remains fully usable and Ask reports explicit generation
   unavailability — never a degraded answer). Plus the PRD §31.3 state walk: drive a job through every
   reachable state of the ten and assert each shows a title, a plain-language explanation, an allowed
   next action and a copyable request/job ID.
9. **`journeys/coverage/**` and `journeys/compare/**`** — `UAT-COV-01` (job title alone yields
   multiple candidates and missing facts, never a confirmed classification), `UAT-COV-02` (synthetic
   employer/ABN shows an agreement chain with approval, variation/replacement and termination
   evidence), `UAT-COV-03` (an award-free conclusion without exclusion evidence is refused),
   `UAT-CMP-01` (each column uses its own version; textual and legal-effect changes distinguished),
   `UAT-CMP-02` (a missing side is visibly unavailable, never fabricated).
10. **`journeys/records/**`** — `UAT-REC-02` (two browser contexts hold the same ETag; the first write
    succeeds, the second receives `409 CONCURRENT_MODIFICATION` **and reload guidance on screen**) and
    the create-record-from-search journey (`RCRD-09`: only selected stable IDs and anonymous notes are
    written — asserted in the database).
11. **`journeys/monitor/**` and `journeys/exports/**`** — `UAT-MON-01` (promote the fixture candidate
    release; assert **one** `DetectedChange`, tenant-isolated alerts in three seeded organisations,
    and affected records marked `REVIEW_REQUIRED`), `UAT-EXP-01` (export an older answer: the export
    shows the original legal date and release with **no regeneration** — the correction banner is a
    gap row), `UAT-EXP-02` (a signed export URL after expiry is inaccessible and the UI explains it;
    the other-tenant half is `ASSR-01`'s).
12. **`journeys/ops/**`** — `UAT-OPS-03` (trigger the A$50 projected/actual circuit-breaker fixture and
    assert paid generation admissions stop before founder liability increases, while Search and saved
    records stay available).
13. **`journeys/universal/**` — the four behavioural PRD §41.1 rules**, asserted across every screen
    the journeys visit:
    - dates render as `3 Aug 2026` in the UI while the corresponding API payload is ISO — asserted on
      the same value in the same request;
    - destructive and security-sensitive actions name their exact effect and recovery before
      confirmation;
    - request, job and correction IDs are present and **copyable** from error states and support
      panels;
    - **no research content appears in a URL query string, a page title, an analytics call or a
      browser error report** — asserted by driving a canary question through the UI and scanning the
      navigation history, `document.title`, every outbound request the page makes, and the console
      error channel; plus refresh/back/forward/reconnect on a submitted job produces no second job,
      snapshot or charge (the API half is `ASSR-05`'s).
14. **`coverage-gaps.md`** (sub-PRD **D3**, **M-Q3**) — one row per unreachable item with owning
    ticket and exact plan edge: `UAT-AUTH-04` (`IDNT-05`), `UAT-ANS-02` (`ASK-03`), `UAT-MON-02`
    (`WTCH-05`), `UAT-OPS-01` (`RLSE-07`), `UAT-REC-01` (`RCRD-03`), `UAT-EXP-01`'s correction banner
    (`RCRD-07`), `UAT-AUTH-01`'s browser half (**no ticket owns `apps/web/src/features/auth/**`** —
    a plan §5.14 gap), widget and SDK journeys (`PLTF-05`, `PLTF-06`), `/internal/v1` journeys
    (`INTL-01`, **M-Q4**), and the public site (`LNCH-03`).
15. **`package.json` script wiring** (sub-PRD **D10**, **M-Q8**): `test` runs the browser-free part —
    `matrix.test.ts`, the gap-register validation and the API-half journeys — so a per-PR run stays
    fast; `test:integration` runs the full browser set, which PRD §20.3 places in the
    release-candidate gate. No root script is added; that would be a `FND-01` docs PR.
16. **`README.md` in `tests/e2e/uat/`** — the row → journey map, how to add a row, the fixture
    provenance, the runtime choice with a link to the ADR, the §41.1 split with `ASSR-07`, and the
    rule that a failure is the owning module's defect (sub-PRD **D1**).

## Acceptance checklist (classified)

- [ ] `[machine]` **`uat-matrix.json` contains exactly the 32 PRD §41.2 rows, verbatim**, and every
      row has a status of `automated-here`, `automated-by:<ASSR-NN>` or `gap`; a `gap` without an
      owning ticket and a plan edge fails. (PRD §41.2; sub-PRD **D12**, **M-Q3**)
- [ ] `[fixture]` **Every `automated-here` row runs unattended and passes** against the synthetic
      corpus and provider tapes. (PRD §41.2; §26 Product)
- [ ] `[machine]` **No row is duplicated** — every `automated-by` row points at a sibling suite that
      genuinely asserts it, and this suite asserts only that row's browser-visible half where one
      exists. (Sub-PRD **D2**)
- [ ] `[fixture]` **`UAT-SRCH-01`** — with the model gateway disabled, an exact Act section is still
      returned and rendered. (PRD §41.2; **SRCH-001**; §26 *"Search remains available independently of
      hosted-generation budget"*)
- [ ] `[fixture]` **`UAT-SRCH-03`** — selecting 2024-08-03 opens the version effective at that date and
      current text is not substituted. (**SRCH-005**)
- [ ] `[machine]` **`UAT-SRCH-04`** — an invalid ABN produces an inline checksum error and **no search
      or quota event exists in the database**. (**SRCH-002**; PRD §34.9 `INVALID_ABN`)
- [ ] `[fixture]` **`UAT-COV-01`/`-02`/`-03` and `UAT-CMP-01`/`-02`** produce the PRD's expected
      results, including that a job title alone never confirms a classification and a missing compare
      side is visibly unavailable rather than fabricated. (**COV-001/002/004**, **CMP-001/002**)
- [ ] `[machine]` **`UAT-REC-02`** — the second concurrent write receives `409
      CONCURRENT_MODIFICATION` and the screen shows reload guidance. (**REC-004**; PRD §34.9)
- [ ] `[fixture]` **`UAT-MON-01`** — one `DetectedChange` fans out to three seeded organisations with
      tenant-isolated alerts and correctly marked affected records. (**MON-002**, **MON-003**)
- [ ] `[fixture]` **`UAT-EXP-01`/`-02`** — an older answer exports with its original legal date and
      release and no regeneration; an expired signed URL is inaccessible and the UI explains it.
      (**EXP-001**, **EXP-002**)
- [ ] `[machine]` **`UAT-OPS-03`** — at the circuit-breaker fixture, paid generation admissions stop
      while Search and saved records remain available. (**OPS-003**; PRD §42.6)
- [ ] `[machine]` **`UAT-ANS-08`** — with the hosted budget at hard stop, Ask reports explicit
      generation unavailability and never a degraded answer. (**ANS-007**)
- [ ] `[machine]` **No research content leaks into the browser surface** — a canary question appears in
      no URL query string, no `document.title`, no outbound analytics/telemetry request and no console
      error. (PRD §41.1; §22; **PII-001** contribution)
- [ ] `[machine]` **Dates render as `3 Aug 2026` while the API payload is ISO**, on the same value.
      (PRD §41.1)
- [ ] `[machine]` **Destructive and security-sensitive actions name exact effect and recovery**, and
      request/job IDs are copyable from error and support surfaces. (PRD §41.1)
- [ ] `[machine]` **Refresh/back/forward/reconnect duplicates no write or charge** at browser level.
      (PRD §41.1; **ANS-003**; the API half is `ASSR-05`'s)
- [ ] `[machine]` **All ten PRD §31.3 asynchronous states reachable in these journeys show a title, an
      explanation, an allowed next action and a job/request ID** — a bare spinner fails. (PRD §31.3)
- [ ] `[fixture]` **At least one journey is a legitimate refusal / insufficient-evidence case.** (PRD
      §41.3)
- [ ] `[machine]` **The ADR exists and pins the runtime** — `docs/adr/NNNN-e2e-browser-and-accessibility-runtime.md`
      records the choice, the pinning and the offline install path, and sub-PRD **M-Q2** is marked
      resolved. (PRD §45.5; §21.1; plan **A9**)
- [ ] `[machine]` **Offline** — the full run completes with network egress beyond loopback denied, no
      provider key, no cloud credential and no `evals/**` read; the browser binaries come from the
      pinned cache. (PRD §20.2; §45.1 item 6; §21.1)
- [ ] `[machine]` **Determinism** — three consecutive runs give identical results; no wall-clock sleep
      is used for synchronisation; the web bundle is built once and served statically. (Sub-PRD
      **D17**)
- [ ] `[machine]` **Nothing outside this ticket's file-scope is modified** — in particular no
      `data-testid` or any other change inside `apps/web/**`. (Sub-PRD **D1**; plan §4)
- [ ] `[machine]` **No skipped or conditional assertion**; every exclusion is a `coverage-gaps.md` row.
      (Sub-PRD **D3**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration` green
      (standing item, PRD §45.3; sub-PRD **D10**).
- [ ] `[machine]` No Rust or Python written here — `cargo test --workspace` / `uv run pytest`
      unaffected; declared not applicable. (PRD §45.3)
- [ ] `[human]` **The Gate 2 smoke test** — a human runs the `UAT-*` rows marked `gap`, plus one
      automated row of their choosing, against the delivered build. Not required to merge this ticket;
      it is `24-launch`/`LNCH-05`'s closure evidence. (PRD §41.2; §26; CLAUDE.md Gate 2)
- [ ] `[human]` **PRD §43.4 founder review** of any journey failure classified `PRODUCT_AMBIGUITY` —
      a row whose expected result the PRD states but the screen interprets differently is a product
      question, not a test fix. Not required to merge. (PRD §43.4)
- [ ] `[machine]` **Writeback items**: sub-PRD **M-Q2** marked resolved with the ADR path, and
      **M-Q3** updated with the final gap list including the `apps/web/src/features/auth/**` ownership
      gap. (Plan §1.1; CLAUDE.md issue #53)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (the matrix's `automated-here`
      set), user-visible change (none — tests only) and non-goals, schema/API/event compatibility
      impact (none), tenant/PII/security impact (three seeded organisations; canary scan for research
      content in the browser surface), source/licence impact (synthetic corpus fixture only),
      **cost/memory/latency impact** (release-candidate CI runtime and browser footprint — report
      both), rollback path, known gaps (`coverage-gaps.md`).

Absent classes: none omitted. `[machine]` covers the matrix, database and browser-surface assertions;
`[fixture]` covers journeys replaying the synthetic corpus and provider tapes; `[human]` covers the
Gate 2 smoke test and the PRD §43.4 founder review, both explicitly **not required to merge** — the
whole point of this ticket is that the automatable rows stop being human work.

## Test plan

Every `[machine]`/`[fixture]` step runs offline: egress beyond loopback denied, no provider key, no
cloud credential, no `evals/**` access, browser binaries from the pinned cache.

1. **Matrix first.** `pnpm --filter <tests-e2e> test`. This runs without a browser and must fail
   immediately if the matrix is not 32 rows, if a row's text drifts from the PRD, or if a `gap` row
   lacks an owner or a plan edge.
2. **Compare the matrix to the PRD by hand once.** Open `uat-matrix.json` beside `docs/PRD.md` §41.2
   and confirm the ids, setup/action and expected-result strings are verbatim. This is the one manual
   read that keeps the automation honest.
3. **Full run.** `pnpm --filter <tests-e2e> test:integration`. Confirm the web bundle is built once,
   served statically, and that no dev server or HMR is involved.
4. **Offline proof.** Re-run with the network namespace restricted to loopback; confirm the run still
   passes and that the browser is not downloaded at test time.
5. **Determinism.** Run three times; diff results. Grep the journeys for sleep-based synchronisation —
   there must be none; waits must be on observable conditions.
6. **Row-by-row spot check.** For `UAT-SRCH-03`, `UAT-COV-01`, `UAT-CMP-02`, `UAT-REC-02` and
   `UAT-MON-01`, read the journey beside the PRD row and confirm the assertion is the PRD's expected
   result, not a weaker proxy (for example: `UAT-COV-01` must assert *candidates and missing facts*,
   not merely "no error").
7. **Database-side assertions.** Confirm `UAT-SRCH-04` asserts the absence of a search/quota row,
   `UAT-AUTH-02` the absence of a second membership, and `RCRD-09` that only stable IDs and anonymous
   notes were written.
8. **Canary scan.** Drive the canary question; confirm the scan covers URL, title, outbound requests
   and the console error channel, and that removing one of those four from the scan makes the test
   vacuous (verify by temporarily planting the canary in that channel).
9. **State walk.** Confirm every PRD §31.3 state the journeys reach shows all four required elements
   and that a bare spinner would fail.
10. **Cross-references.** Confirm each `automated-by` row names a sibling suite that really contains
    that assertion — open the sibling file and check.
11. **ADR.** Read `docs/adr/NNNN-e2e-browser-and-accessibility-runtime.md`; confirm it states the
    pinning mechanism and the offline install path, and that no second ADR file was created.
12. **Isolation of the suite.** `git diff --name-only` shows only `tests/e2e/uat/**`, the append-only
    `tests/e2e` manifest, the one new ADR file and the lockfile. **No file under `apps/web/**` may
    appear** — not even a test id.
13. **Construction pattern to copy.** `ASK-07`'s and `FIND-04`'s own screen tests for selectors and
    state names, `RUNT-06`'s async-state component contract for the §31.3 walk, and `ASSR-05`'s
    harness for booting the API and worker in process.
14. **Reviewer focus.** Confirm the matrix is the gate, not a comment; confirm no row was quietly
    downgraded to `gap` to make the run green; confirm gaps name real tickets and real plan edges;
    confirm no `apps/web` file was touched; confirm at least one refusal journey exists (PRD §41.3);
    confirm the browser runtime is pinned and offline.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR → merge
   → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/23-assurance/README.md` (version +0.1 with a changelog line) **before** changing code.
   Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A journey cannot select an element because a screen has no stable hook* → **do not add a
     `data-testid` to `apps/web/**`.** That tree belongs to `13-`/`14-`/`15-`/`16-`/`17-`/`19-`'s
     screen tickets (plan §4), and a test-only edit from `tests/**` is exactly what sub-PRD **D1**
     forbids. Prefer accessible selectors (role, name, label) — which PRD §41.1 already requires the
     screen to provide. If none exists, that is an accessibility defect: file it against the owning
     screen ticket as a docs PR, and record the blocked journey in `coverage-gaps.md`.
   - *A journey fails because a screen's behaviour differs from its PRD §41.2 row* → **that screen has
     the defect.** File it against the owning ticket. Do not weaken the assertion to the screen's
     actual behaviour; PRD §41.2's expected result is normative.
   - *A row's expected result is genuinely ambiguous* → that is a PRD §43.4 `PRODUCT_AMBIGUITY`
     classification and a **Founder** decision. Record it in `docs/prd/23-assurance/README.md` and in
     `coverage-gaps.md`; do not pick an interpretation and encode it as a passing test.
   - *A row needs a surface outside the closure* → `coverage-gaps.md` row **plus** the exact plan
     §5.24/§6.2 edge proposed by docs PR, and update **M-Q3**. Never add a `blocked_by` edge locally
     (plan §6.2).
   - ***`apps/web/src/features/auth/**` has no owning ticket*** → this is a **breakdown plan §5.14
     gap**, not something to fill from `tests/**`. Raise it in `docs/prd/breakdown-plan.md` §5.14 by
     docs PR (a new `13-identity-surface` ticket) and record it in
     `docs/prd/23-assurance/README.md`.
   - *The browser runtime cannot be installed offline in CI* → that is the ADR's central constraint.
     Record the failure in the ADR's consequences section **first**, then choose differently; do not
     add a network-dependent download step, which would breach PRD §20.2 and §21.1.
   - *The full run is too slow for the release-candidate gate* → report the measured time here and
     propose sharding in a docs PR against this ticket **and** `FND-02` (**M-Q7**); do not drop
     journeys.
3. **Falsified protocol.** **If a PRD §41.2 row cannot be automated at all** — not merely blocked by a
   missing dependency, but structurally impossible — that overturns this ticket's premise and part of
   PRD §26's *"English UI, accessibility and responsive requirements pass release review"*. Stop. Do
   not mark it `gap` with a fabricated plan edge, and do not substitute a weaker assertion. Escalate
   for re-review, raise an ADR under `docs/adr/`, and write back to
   `docs/prd/23-assurance/README.md` **and** `docs/prd/breakdown-plan.md` §5.24 before any further
   code. `LNCH-05` closes PRD §26 against this matrix; a row that silently became human work again
   must be visible there.
