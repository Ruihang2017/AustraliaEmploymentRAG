---
id: WTCH-08
title: Alerts list and alert detail screens
module: 16-monitor-alerts
lane: 16-monitor-alerts
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [WTCH-03, WTCH-07]
blocks: [ASSR-06]
---

# WTCH-08 — Alerts list and alert detail screens

Implements PRD §32.7, §31.2 and §41.1, requirement **MON-003** (epic `E25-MONITOR`).
No ADR — the decision is already made in PRD §31.2 (the two alert routes and their first-use states)
and PRD §32.7 (*"Alert detail shows detection/publication/effective dates, structured change type,
before and after authorities, affected records, delivery status and actions. Raw HTML diffs never
become customer alerts."*); this is build ticket 8 of 8 against it.
Parent sub-PRD: [16-monitor-alerts README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [WTCH-03 — Alert creation, impact marking and alert routes](WTCH-03-alert-creation-impact-marking-and-alert-routes.md), [WTCH-07 — Watchlist screens and create-watch-from-source](WTCH-07-watchlist-screens-and-create-watch-from-source.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §32.7 fixes the detail fields, PRD §31.2 the routes and roles, and `WTCH-03` already publishes the
API and the DTO. This is two screens against them.

## Background + basis

**PRD §31.2 — the two route rows, verbatim:**

> | `/monitor/alerts` | Alerts | all | Read/acknowledge | **Freshness and delivery explanation** |
> | `/monitor/alerts/:alertId` | Alert detail | authorised tenant | Inspect before/after/impact |
> **Generated summary absent if budget unavailable** |

Note the role difference from `WTCH-07`'s screen: the alert list is available to **all** members,
while `/monitor/watchlists` is Researcher/Admin/Owner.

**PRD §32.7 — the alert-detail contract, verbatim:**

> Alert detail shows detection/publication/effective dates, structured change type, before and after
> authorities, affected records, delivery status and actions. **Raw HTML diffs never become customer
> alerts.**

**Requirement `MON-003`** (PRD §30.2), verbatim:

> | MON-003 | Alerts identify change type, dates, before/after sources and affected records |
> `/monitor/alerts/:alertId` | alerts endpoints | App/Source | **Alert remains useful with generated
> summary disabled** |

This screen is `MON-003`'s **primary surface**, and the evidence column is a UI property: the screen
must be complete and actionable with `generated_summary` absent. Sub-PRD **D6** makes that structural
— this module never populates the field at all.

**PRD §8.8 — the eight structured change types** the screen renders as first-class values:

> Changes MUST be structured as amendment, commencement, rate, replacement, appeal, guidance,
> source-removal or freshness events—not raw HTML diffs.

**PRD §12.1 — the freshness vocabulary the list screen explains:**

> Customer-visible source metadata MUST separate: last discovery check; last successful change scan;
> last full reconciliation; last content ingestion; freshness status.
> … Sources without reliable delta mechanisms MUST show `FRESHNESS_LIMITED` rather than a false
> guarantee.

**PRD §41.1 — universal UI acceptance** (quoted in full in `WTCH-07`'s Background; every bullet
applies here too), in particular: 360/768/1280 px without hiding **legal status** or primary actions;
complete keyboard operation; one programmatic heading; **colour is never the only status signal**;
dates as `3 Aug 2026` in the UI while APIs use ISO; jurisdiction, legal status and source freshness
use **text plus badge/icon**; copyable request/job IDs; and *"customer research content is not placed
in URL query strings, analytics, browser error telemetry or page titles"*.

**PRD §13.1:** WCAG 2.2 AA is the release target.

**PRD §41.3 step 6 — the demo this screen carries:** *"One minute — change: open a prepared
source-change alert and affected record; rerun under current law without altering the original."*

**The API already exists.** `WTCH-03` (merged before this ticket) publishes `GET /v1/alerts` (cursor
list with `status`, `change_type`, `severity`, `watchlist_id`, `since` filters),
`GET /v1/alerts/{alert_id}` (the deliverable-8 detail DTO with `ETag`),
`POST /v1/alerts/{alert_id}/acknowledge` and `POST /v1/alerts/{alert_id}/resolve` (both `If-Match`
guarded). The detail DTO carries: status, severity, change type, `detected_at`, `publication_date`,
`effective_date`, watchlist, `before_authority`/`after_authority` (identifiers, titles, jurisdiction
and official URL — **never source text**), `affected_records[]` with each record's workflow status and
whether it was transitioned, `affected_record_overflow_count`, `deliveries[]` with channel, masked
destination, status, attempts and failure code, `actions[]`, acknowledgement/resolution metadata,
`row_version`, and an **optional, always-absent** `generated_summary`.

**The feature area already exists.** `WTCH-07` (this ticket's blocker) owns
`apps/web/src/features/monitor/feature.tsx`, which claims the PRD §31.1 `MONITOR` nav slot and
composes screens with `import.meta.glob('./*/routes.tsx', { eager: true })` — sub-PRD **D3**. This
ticket therefore registers by adding `alerts/routes.tsx`, with **zero** diff to `feature.tsx` or to
any file `WTCH-07` owns.

**`23-assurance` depends on this ticket.** breakdown-plan §6.2: `WTCH-08 --> ASSR-06`, and `ASSR-06`
is *"E2E automation of the §41.2 manual acceptance scripts"* — `UAT-MON-01` is driven through these
screens. Stable, testable selectors and deterministic states are therefore part of the deliverable,
not a nicety.

**Accepted caveats carried forward:**

- **No declared `blocked_by` edge to `RUNT-06`** (`packages/ui`), although the shared evidence/source
  panel (breakdown-plan **A6**; PRD §32.1/§32.3/§32.4) and the async-state components live there.
  Sub-PRD open question **Q-WTCH-9**. `RUNT-06` is wave 1 of `03-app-runtime`; if it has not landed,
  **stop and raise the missing edge** rather than building a second component set.
- **Source text is rendered, not embedded.** The alert payload carries identifiers and official
  links only (`WTCH-03` deliverable 8). Exact provision text, when shown, comes from the corpus read
  APIs through `packages/ui`'s evidence/source panel — the same component `14-search-product` and
  `15-answer-product` use (**A6**). The alert itself never carries a diff or an excerpt (PRD §32.7).
- **Record titles come from the tenant's own record read**, not from the alert payload
  (`WTCH-03` deliverable 9 deliberately omits them), so the screen resolves them client-side for
  display.
- **No rerun action is implemented here.** PRD §41.3 step 6's rerun is `17-records-collab`/`RCRD-03`;
  this screen links to the record.

## Goal

Produce `apps/web/src/features/monitor/alerts/**`: `/monitor/alerts` (a filterable, cursor-paginated
alert list available to all members, with the PRD §31.2 freshness-and-delivery explanation as its
first-use state) and `/monitor/alerts/:alertId` (the full PRD §32.7 detail — dates, structured change
type, before/after authorities, affected records, delivery status and actions — with acknowledge and
resolve). Both must be complete and actionable with `generated_summary` absent, must never render a
raw diff, and must pass PRD §41.1 at 360/768/1280 px. Completion is mechanically checkable: every
PRD §32.7 field is rendered from the fixture DTO; a fixture with `generated_summary` absent produces
no empty region and no missing information; acknowledge/resolve honour `If-Match` and render the 409
path; and adding the directory diffs no file owned by `WTCH-07` or `03-app-runtime`.

## Non-goals

- **No alert API, creation, impact marking or delivery** — `WTCH-03`, `WTCH-04`, `WTCH-05`,
  `WTCH-06`. The screen reads and acts; it decides nothing.
- **No watchlist screens, the `monitor` feature entry or the nav slot** — `WTCH-07` (sub-PRD **D3**).
- **No shared UI primitives, async-state components or the evidence/source panel** —
  `03-app-runtime`/`RUNT-06` (`packages/ui`, breakdown-plan **A6**). Duplicating them here is
  forbidden.
- **No shell, routing library or organisation switcher** — `RUNT-05`.
- **No record detail, review action, rerun, diff or correction UI** — `17-records-collab`
  (`RCRD-03`, `RCRD-04`, `RCRD-08`). This screen **links** to `/records/:recordId`.
- **No document, version or node screens** — `14-search-product`/`FIND-05`. This screen links to
  them and embeds `packages/ui`'s source panel.
- **No generated summary, no model call, no summarisation** — sub-PRD **D6**; `MON-003` requires the
  screen to be useful without one and PRD §37.5 forbids generated text from triggering external
  action.
- **No E2E automation of `UAT-MON-01`** — `23-assurance`/`ASSR-06` (`tests/e2e/uat/**`), which is
  `blocked_by` this ticket. This ticket provides the stable selectors and deterministic states it
  needs.
- **No accessibility sweep beyond this feature** — `ASSR-07`.

## File-scope (write-owns)

- `apps/web/src/features/monitor/alerts/**` — `routes.tsx`, the list and detail screens, their
  components, hooks, fixtures and tests under
  `apps/web/src/features/monitor/alerts/__tests__/**`.

Does not touch:

- `apps/web/src/features/monitor/feature.tsx` and
  `apps/web/src/features/monitor/watchlists/**` — `WTCH-07` (merged before this ticket). This ticket
  is discovered by `feature.tsx`'s scan and edits it **not at all** (sub-PRD **D3**).
- `apps/web/src/{app,shell,lib}/**`, `apps/web/src/features/home/**`, `apps/web/{index.html,
  vite.config.ts,package.json,tsconfig.json}` — `03-app-runtime`/`RUNT-05`.
- `apps/web/src/features/{search,sources,ask,answers,coverage,compare,records,auth,settings,
  developer,usage,legal}/**` and `apps/web/public-site/**` — modules 13, 14, 15, 17, 20, 24.
- `packages/ui/**` — `RUNT-06`; `packages/contracts/**` — `FND-04`.
- `apps/api/**`, `apps/worker/**` — this module's other tickets.
- `tests/**` — `23-assurance` (`ASSR-06`, `ASSR-07`).

**Serial-safety analysis.** First decomposition — breakdown-plan §1 records `phase: 1`, nothing
merged and nothing in flight. `apps/web/src/features/monitor/alerts/` does not exist before this
ticket and is written by no other ticket in the plan (breakdown-plan §5.17 gives `WTCH-08`
`apps/web/src/features/monitor/alerts/**` alone). The enclosing `features/monitor/` directory is a
**single** feature area under `RUNT-05`'s contract; sub-PRD **D3** gives its `feature.tsx` to
`WTCH-07`, which is this ticket's `blocked_by` (breakdown-plan §6.2: `WTCH-07 --> WTCH-08`), so the
two are never concurrent and, because `feature.tsx` composes by directory scan, this ticket adds its
screens with zero diff outside its own directory (`RUNT-05` contract item 6). This ticket is in
intra-module round 4; its only possible concurrent sibling is `WTCH-06` (`apps/worker/**`).

## Deliverables

1. **`alerts/routes.tsx`** — registers `/monitor/alerts` and `/monitor/alerts/:alertId`, discovered
   by `WTCH-07`'s `feature.tsx` scan. A duplicate path fails the build (`RUNT-05` contract item 4).
   The file claims **no** nav slot — `WTCH-07` already claims `MONITOR` and a second claim would fail
   the build (`RUNT-05` contract item 3).
2. **Alert list screen** (`/monitor/alerts`, PRD §31.2 role **all** members):
   - cursor-paginated list (`page_size` default 25) with filters `status`, `change_type`, `severity`,
     `watchlist_id` and `since`, each backed by `WTCH-03`'s query parameters and enum options from the
     generated `packages/contracts` types;
   - each row: structured change type (**text plus badge**), severity, watchlist name, effective and
     detected dates rendered `3 Aug 2026`, the authority title, the affected-record count, and the
     delivery status summary — colour never the only signal (PRD §41.1);
   - bulk-free, per-row **acknowledge** action (PRD §31.2 "Read/acknowledge") with optimistic state
     reverted on failure;
   - **first-use state (PRD §31.2)**: *"Freshness and delivery explanation"* — with no alerts, the
     screen explains how change detection works (PRD §12.1's five separated dates and the
     `FRESHNESS_LIMITED` meaning) and how delivery works (in-app always; email and webhook per
     watchlist channel and delivery mode), and links to `/monitor/watchlists`. It never renders an
     empty list without guidance (PRD §31.3).
3. **Alert detail screen** (`/monitor/alerts/:alertId`, PRD §31.2 role authorised tenant) rendering
   **every** PRD §32.7 field, in a fixed, testable order:
   1. **Header** — structured change type as a labelled badge, severity, status
      (`NEW`/`ACKNOWLEDGED`/`RESOLVED`), watchlist name linking to `/monitor/watchlists`, and the
      copyable alert id (PRD §41.1's copyable-ID rule).
   2. **Dates** — detection, publication and effective, each labelled with what it means, rendered
      `3 Aug 2026`, with the ISO value available for copy. A missing date is rendered as an explicit
      "not applicable for this change type" rather than a blank (for example `FRESHNESS` carries no
      effective date).
   3. **Before and after authorities** — two panels showing title, jurisdiction, document/version
      identifiers, legal status and the **official link**, each rendered through `packages/ui`'s
      shared evidence/source panel (breakdown-plan **A6**) which loads exact provision text from the
      corpus read APIs on demand. **The alert payload itself contains no text and the screen renders
      no diff** (PRD §32.7). Where the change type has only one side (`SOURCE_REMOVAL`,
      `FRESHNESS`), the absent side is shown as explicitly unavailable — never fabricated symmetry
      (the same discipline PRD §32.5/`CMP-002` requires of Compare).
   4. **Affected records** — each with its title (resolved client-side from the tenant's record
      read), workflow status, whether this alert transitioned it to `REVIEW_REQUIRED`, and a link to
      `/records/:recordId`; plus the overflow count when `WTCH-03`'s bound was reached, with an
      explanation. A record that was **not** transitioned (already `REVIEW_REQUIRED`, `ARCHIVED`, or
      an informational `GUIDANCE`/`FRESHNESS` change) shows why — this is where `WTCH-03`'s
      materiality rule becomes visible to the customer.
   5. **Delivery status** — one row per `alert_delivery`: channel, masked destination, status
      (including `DEAD_LETTER`), attempt count, last attempt time and failure code, with a
      plain-language explanation of the retry state. A suppressed delivery (webhook kill switch,
      PRD §42.5) is shown as *queued, delivery paused*, not as a failure.
   6. **Actions** — acknowledge, resolve, open watchlist, open affected record, open official source.
      Acknowledge and resolve send `If-Match` from the read `ETag`; a
      `409 CONCURRENT_MODIFICATION` renders a reload-and-retry path (PRD §16.2, §34.1).
   7. **Optional generated summary** — the region exists in the contract but is **absent** in this
      build; when absent the screen renders **nothing at all** in its place, and no other region
      depends on it (sub-PRD **D6**; PRD §31.2 *"Generated summary absent if budget unavailable"*).
4. **No raw diff, by construction (PRD §32.7)** — the screen has no diff component, imports no diff
   or patch library, and renders no `dangerouslySetInnerHTML`/raw-HTML sink. An import and a source
   scan assert all three. The "what changed" story is told by the structured change type plus the
   two source panels.
5. **PRD §41.1 conformance, built in** — one programmatic `h1` per screen; the detail's section order
   is a landmark structure with labelled regions; live regions announce acknowledge/resolve results;
   full keyboard operation with visible focus; layout at 360/768/1280 px with legal status, official
   links and primary actions never hidden; text-plus-icon for jurisdiction, legal status and
   freshness; dates as `3 Aug 2026`; copyable `request_id` on every error. Components come from
   `packages/ui` (`RUNT-06`), never redefined here.
6. **Async and error states** — loading, empty/first-use, forbidden/not-found (rendered identically,
   per PRD §16.5's indistinguishable 404), stale-ETag conflict, and network failure with retry, each
   with a visible title, a plain-language explanation and an allowed next action (PRD §31.3's
   principle: *"A spinner without state or recovery guidance is not acceptable"*).
7. **Organisation scoping** — every cache key uses the shell's `orgScopedKey(...)`; the feature's
   `onOrganizationChange` (owned by `WTCH-07`'s `feature.tsx`) must clear this screen's caches, which
   this ticket asserts with `RUNT-05`'s `apps/web/test/org-scope-conformance.ts` helper (PRD §31.1;
   `AUTH-002`).
8. **No customer research content in URLs, titles, caches or telemetry (PRD §41.1, §8.8)** — the
   routes carry only the opaque `alertId`; filters carry enum values and dates; `document.title`
   carries the change type and the authority title (public source metadata), never a question,
   answer, note or record title. A canary test asserts it.
9. **Stable selectors for `ASSR-06`** — every assertable element carries a stable, documented
   `data-testid` (or the repository's equivalent), listed in
   `apps/web/src/features/monitor/alerts/SELECTORS.md` so `23-assurance` can automate `UAT-MON-01`
   without reverse-engineering the DOM. Changing a selector is a documented change to that file.
10. **Fixtures and a client seam** — the screens talk to an `AlertApi` port whose test implementation
    replays committed fixtures under `apps/web/src/features/monitor/alerts/__tests__/fixtures/`:
    `alerts-list.json`, `alert-detail.json` (a full PRD §32.7 payload), `alert-detail-freshness.json`
    (a one-sided change with no effective date), `alert-detail-dead-letter.json` (a failed webhook
    delivery) and `errors.json` (`CONCURRENT_MODIFICATION`, `RESOURCE_NOT_FOUND`). **No test performs
    a network request.**

## Acceptance checklist (classified)

- [ ] `[machine]` **MON-003, PRD §32.7 field coverage**: rendering `alert-detail.json` shows
      detection, publication and effective dates, the structured change type, both authorities,
      affected records, delivery status and actions — asserted against a literal expectation list, so
      a dropped field fails (PRD §32.7; `MON-003`)
- [ ] `[machine]` **MON-003, useful with generated summary disabled**: with `generated_summary`
      absent the detail screen renders no empty region, no placeholder and no missing information —
      every §32.7 field is still present and every action still available (PRD §30.2 MON-003
      evidence; PRD §31.2 *"Generated summary absent if budget unavailable"*; sub-PRD **D6**)
- [ ] `[machine]` **No raw diff (PRD §32.7)**: the scope imports no diff/patch library, defines no
      diff component and uses no raw-HTML sink — three separate scans, each failing when violated on
      a scratch branch (PRD §8.8, §32.7 *"Raw HTML diffs never become customer alerts"*)
- [ ] `[machine]` One-sided changes: `alert-detail-freshness.json` renders the absent side as
      explicitly unavailable and the absent effective date as "not applicable", never blank and never
      fabricated (PRD §32.7; the `CMP-002` discipline)
- [ ] `[machine]` Delivery status: `alert-detail-dead-letter.json` renders channel, masked
      destination, `DEAD_LETTER`, attempts, last attempt and failure code with a plain-language
      explanation; a kill-switch-suppressed delivery reads as *queued, delivery paused*, not failed
      (PRD §32.7 "delivery status"; PRD §42.5)
- [ ] `[machine]` Affected records: transitioned and non-transitioned records are distinguished with
      the reason shown, the overflow count is explained, and each links to `/records/:recordId`
      (PRD §33.4 step 7; `WTCH-03` deliverable 5)
- [ ] `[machine]` Acknowledge/resolve: both send `If-Match`; a stale `ETag` renders the
      `409 CONCURRENT_MODIFICATION` reload path with no second write; optimistic state reverts on
      failure (PRD §16.2, §34.1, §41.1's "refresh/back/forward … does not duplicate writes")
- [ ] `[machine]` **First-use state (PRD §31.2)**: with zero alerts the list screen explains
      freshness (PRD §12.1's five separated dates and `FRESHNESS_LIMITED`) and delivery (in-app,
      email, webhook; `IMMEDIATE` vs `DAILY_DIGEST`) and links to `/monitor/watchlists` — never an
      empty list without guidance (PRD §31.3)
- [ ] `[machine]` Not-found and forbidden render identically (PRD §16.5's indistinguishable
      response), and every error surfaces a copyable `request_id` (PRD §41.1, §16.1)
- [ ] `[machine]` **No research content in URLs, titles or caches (PRD §41.1, §8.8)**: with a canary
      question, answer and record title in the fixtures, none appears in `location.search`,
      `document.title` or any cache key — the module-wide payload-minimisation assertion applied to
      this surface
- [ ] `[machine]` **Organisation switch (PRD §31.1)**: this screen's caches are cleared on switch,
      asserted with `RUNT-05`'s `org-scope-conformance.ts` helper (`AUTH-002`)
- [ ] `[machine]` **A1 web conformance (sub-PRD D3)**: adding this directory registers both routes
      with **zero** diff to `feature.tsx`, to `apps/web/src/features/monitor/watchlists/**` or to any
      file owned by `03-app-runtime`, verified with `git status --porcelain`; the `MONITOR` slot is
      still claimed exactly once (`RUNT-05` contract items 3, 4, 6)
- [ ] `[machine]` No duplicated `packages/ui` primitive: a scan finds no locally defined button,
      dialog, async-state, badge or evidence/source component in this scope (breakdown-plan **A6**)
- [ ] `[machine]` Enum options and labels come from the generated `packages/contracts` types — no
      hand-written change-type, severity, status or channel list (PRD §20.1, `FND-03`)
- [ ] `[machine]` `SELECTORS.md` exists and every listed selector is present in the rendered output —
      the contract `23-assurance`/`ASSR-06` automates `UAT-MON-01` against (breakdown-plan §6.2)
- [ ] `[machine]` Automated accessibility smoke: axe-core (or the repository's equivalent) reports no
      violation on both screens at 360/768/1280 px — the machine-checkable subset of WCAG 2.2 AA; the
      full suite is `ASSR-07` (PRD §13.1, §41.1)
- [ ] `[human]` **PRD §41.1 universal UI acceptance**: three widths without hiding legal status,
      official links or primary actions; complete keyboard operation with visible focus and logical
      order; one programmatic heading; colour never the only signal; dates as `3 Aug 2026`;
      destructive/security-sensitive actions naming effect and recovery. Irreducibly human judgement
      (PRD §41.1, §13.1)
- [ ] `[human]` **`UAT-MON-01` end to end at Gate 2** (PRD §41.2): *"Promote fixture change cited by
      three tenants → One DetectedChange, tenant-isolated alerts, affected records marked
      correctly."* Run by the Founder through this screen together with `WTCH-02`/`WTCH-03`; the
      automated version is `23-assurance`/`ASSR-06`, which is `blocked_by` this ticket. **Not required
      to merge** — the `[machine]` criteria above are (CLAUDE.md Gate 2)
- [ ] `[human]` PRD §41.3 step 6 demo readiness: *"open a prepared source-change alert and affected
      record"* is possible from this screen in one click. **Not required to merge**
- [ ] `[fixture]` **Declared absent** — this ticket replays no recorded change or delivery; the
      recorded-change replay is `WTCH-02`/`WTCH-03` and the delivery replay is `WTCH-04`/`WTCH-05`.
      The committed API responses here are synthetic, which breakdown-plan §1.1 does not classify as
      `[fixture]`
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3)
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable (PRD §45.3)
- [ ] Cross-reference: **MON-001** is `WTCH-01`/`WTCH-07`, **MON-002** is `WTCH-02`, **MON-004** is
      `WTCH-04`/`WTCH-05`/`WTCH-06`; this ticket owns the **MON-003** surface. Declared explicitly so
      coverage is not assumed
- [ ] `[machine]` PR states the PRD §45.4 items: requirement **MON-003**, `UAT-MON-01`, epic
      `E25-MONITOR`; user-visible change and non-goals; schema/API/event compatibility impact (none —
      consumes `WTCH-03`'s published operations through the generated client); tenant/PII/security
      impact (no research content in URLs, titles, caches or telemetry; forbidden and not-found are
      indistinguishable; delivery destinations are masked by the API); source/licence impact
      (official links and the shared source panel's licence-aware excerpt limits — `EVID-06`'s rules
      apply through `packages/ui`); cost/memory/latency impact (no generation, no search); rollback
      path (revert the directory; `feature.tsx` then registers only the watchlist routes);
      known gaps (**Q-WTCH-9** no declared `RUNT-06` edge)

## Test plan

Reviewer steps. Every step is offline: fixture client, no network, no API server, no model provider.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter <the apps/web package name>`; suites under
   `apps/web/src/features/monitor/alerts/__tests__/`.
3. **Harness.** Reuse the construction `WTCH-07` established: render through the shell's test harness
   with an injected `AlertApi` fixture client and `orgScopedKey`. Same component-testing library; no
   browser automation (that is `ASSR-06`/`ASSR-07`).
4. **Read the fixture against the PRD.** Compare `alert-detail.json` and the rendered output with
   PRD §32.7's sentence field by field — detection/publication/effective dates, structured change
   type, before and after authorities, affected records, delivery status, actions. A field rendered
   in the fixture but not on screen is exactly the defect this step exists to catch.
5. **Generated-summary-absent test.** Render `alert-detail.json` (which has no `generated_summary`)
   and assert every §32.7 region is present and non-empty and that there is **no** placeholder or
   empty container where the summary would be. This is `MON-003`'s evidence column.
6. **No-diff scans.** Run the three scans (no diff/patch import, no local diff component, no raw-HTML
   sink). On a scratch branch add a diff library import and confirm the scan fails; discard.
7. **One-sided and dead-letter fixtures.** Render `alert-detail-freshness.json` and
   `alert-detail-dead-letter.json`; assert the explicit-unavailable and paused/failed renderings.
8. **Acknowledge/resolve.** Drive both; assert `If-Match` is sent; serve a `409` and assert the
   reload path with no second write; assert optimistic state reverts.
9. **Canary.** With a distinctive question, answer and record title in the fixtures, navigate both
   screens and trigger every error; assert none of the strings appears in `location.search`,
   `document.title` or a cache key.
10. **First use, not-found and forbidden.** Render each; assert guidance, identical 404 shape and a
    copyable `request_id`.
11. **A1 conformance.** `git status --porcelain` clean after the suite; confirm the diff touches no
    file outside `apps/web/src/features/monitor/alerts/`; confirm the `MONITOR` nav slot is claimed
    exactly once.
12. **Selectors.** Confirm `SELECTORS.md` lists every id the tests use and that each resolves in the
    rendered output — `ASSR-06` depends on it.
13. **Accessibility smoke.** axe-core at 360/768/1280 px on both screens; zero violations. Then walk
    both screens by keyboard only and confirm focus order and visibility (the `[human]` item).
14. **Scans.** Grep for locally defined UI primitives, hand-written enum lists and any direct
    `fetch`/`axios` outside the injected client — there must be none.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket file** (docs PR →
merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/16-monitor-alerts/README.md` (version +0.1 with a changelog line) **before** changing code.
Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**Foreseeable frictions, each with its exact writeback target:**

1. **The alert is not understandable without showing what changed in the text.** → This is the
   module's central temptation and PRD §32.7 forbids the easy answer: *"Raw HTML diffs never become
   customer alerts."* The correct path is the structured change type plus the two source panels
   loading exact text from the corpus read APIs through `packages/ui` (**A6**). If a specific change
   type genuinely cannot be understood that way, the writeback is
   **`WTCH-02`'s classification (a better structured type)** and, if a new type is needed, a **PRD
   change** (PRD §45.5) recorded in `docs/prd/16-monitor-alerts/README.md` **Q-WTCH-8** — never a
   diff component in this screen. A change type that cannot be structured must not degrade into a raw
   HTML diff; that is a writeback, not a local workaround.
2. **`WTCH-03`'s detail DTO is missing a PRD §32.7 field.** → `WTCH-03` is the API owner. Raise it
   against **`WTCH-03`'s deliverable 8** and record it in
   `docs/prd/16-monitor-alerts/README.md`. Do **not** fetch the missing data from another endpoint to
   paper over it, and do **not** render the field as permanently blank.
3. **`RUNT-06` (`packages/ui`) is not merged, or its evidence/source panel cannot render a corpus
   authority** (**Q-WTCH-9**; breakdown-plan **A6**). → Stop. Write the missing edge into
   **`docs/prd/breakdown-plan.md` §5.17 and §6.2** and update the README's Q-WTCH-9 row. Building a
   second evidence panel here is exactly the duplication **A6** exists to prevent and would put this
   module in conflict with `14`, `15` and `17`.
4. **`ASSR-06` needs a selector or a deterministic state this screen does not provide.** → Add it to
   `SELECTORS.md` and this ticket's deliverable 9, then re-publish. `23-assurance` must not
   reverse-engineer the DOM or add test hooks into this module's tree
   (breakdown-plan §1.1: *"A ticket never writes into another module's tree to satisfy its own
   acceptance."*).
5. **A generated summary becomes available later** (a `12-evidence-safety` edge is added). →
   sub-PRD **D6** is the record. Update `docs/prd/16-monitor-alerts/README.md` **D6**, add the
   `blocked_by` edge in `docs/prd/breakdown-plan.md` §5.17/§6.2, and keep the screen complete without
   it — PRD §31.2 requires the summary to be **absent-tolerant** for ever, not merely at launch.
6. **PRD §41.1 cannot be satisfied at 360 px** without hiding a §32.7 region. → Legal status,
   official links and primary actions may **not** be hidden (PRD §41.1 first bullet); restructure
   (progressive disclosure with an accessible control) rather than dropping content, and record the
   pattern in `docs/prd/16-monitor-alerts/README.md`. Accessibility and responsiveness are release
   gates (PRD §26).

**Escalation.** PRD §32.7's *"Raw HTML diffs never become customer alerts"* and `MON-003`'s *"Alert
remains useful with generated summary disabled"* are release requirements, and `ASSR-06` depends on
this surface for `UAT-MON-01`. If either is outright falsified, stop, raise an ADR under `docs/adr/`,
write back to `docs/prd/16-monitor-alerts/README.md` and `docs/prd/breakdown-plan.md` §5.17, and
escalate to the human before code lands. Never render a raw diff, and never make an alert depend on
generated text.
