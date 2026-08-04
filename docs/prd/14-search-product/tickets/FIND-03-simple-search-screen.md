---
id: FIND-03
title: Simple Search screen
module: 14-search-product
lane: 14-search-product
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-05, RUNT-06, FIND-01]
blocks: [FIND-04]
---

# FIND-03 — Simple Search screen

Implements PRD §31.2 (`/search`), §32.1 (query bar, legal context, results toolbar, result row,
detail panel), §8.2, §13.1 and §41.1 — requirement ID `SRCH-001`, with `SRCH-003` on the render side;
epic `E18-SEARCH-API-UI`.
No ADR — the decision is already made in PRD §32.1 (the screen contract), PRD §31.2 (the route and
its first-use state) and breakdown plan **A1**/**A6** (feature-directory autoload; the shared
evidence/source panel lives in `packages/ui`); this is build ticket 3 of 6 against it.
Parent sub-PRD: [14-search-product README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RUNT-05 — web app shell](../../03-app-runtime/tickets/RUNT-05-web-app-shell-navigation-org-switcher-status-badges.md),
[RUNT-06 — `packages/ui`](../../03-app-runtime/tickets/RUNT-06-packages-ui-accessible-primitives-async-states-evidence-panel.md),
[FIND-01 — `POST /v1/search` route and response contract](FIND-01-post-v1-search-route-and-response-contract.md)
(mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against three fixed
contracts — `RUNT-05`'s feature-registration contract, `RUNT-06`'s component API and `FIND-01`'s
PRD §34.2 response — not a new subsystem decision.

## Background + basis

**The screen contract is prescriptive.** PRD §32.1, in full:

| Region | Required controls/content |
|---|---|
| Query bar | Text; submit; Simple/Advanced toggle; syntax help |
| Legal context | `legal_as_at` required and defaulted to today; jurisdiction multi-select; status defaults to `IN_FORCE` |
| Advanced filters | document type, authority, court/tribunal level, publication/effective date, employer name, ABN, award/agreement ID |
| Results toolbar | result count relation (`exact` or lower-bound), sort, active-filter chips, copy stable search URL, save search/watch |
| Result row | title, type, authority, neutral/instrument ID, pinpoint, exact source snippet, jurisdiction, status badge, effect interval, freshness, official link |
| Right/detail panel | version timeline, source/licence limitations, related amendments/cases/instruments |

PRD §32.1 also fixes two behaviours: *"Search validation errors remain inline and do not consume
quota"* and *"No-results state MUST distinguish: no text match, all matches removed by hard filters,
source not covered, source stale/unavailable and invalid exact identifier."* The **Advanced filters**
row and the full five-state no-results taxonomy are `FIND-04`'s; every other row is this ticket's.

**The route and its first-use state are fixed.** PRD §31.2: `/search` → *"Simple Search | all |
Search corpus | Search syntax examples; no generated answer"*, and `/search?mode=advanced` →
*"Advanced Search | all | Apply legal filters | Filter explanation and current legal date"*. One
path, one nav destination, a `mode` query parameter — which is why sub-PRD **D7** makes
`apps/web/src/features/search/` a single A1 feature area with a **mode registry**, so `FIND-04` adds
`advanced/` with zero diff to this ticket's files.

**What this screen must keep working without.** PRD §30.2 `SRCH-001`: *"Simple Search accepts natural
language, keywords and exact identifiers"*, minimum acceptance evidence *"Search works with model
gateway disabled"*. PRD §8.2: *"Search MUST remain usable when the AI budget is exhausted."* PRD
§31.2's first-use state for this route ends with *"no generated answer"*. So this screen renders no
AI output, offers no "summarise" affordance, and depends on no generation state.

**Snippets are source text, rendered as given.** PRD §8.2: *"Snippets MUST originate from source
text, not generated paraphrases."* PRD §34.2: *"`snippet.text` MUST equal the referenced NodeVersion
substring at the returned offsets … Search does not return generated summaries."* Sub-PRD **D2**
extends the rule to the browser: this screen renders `snippet.text` verbatim, does not truncate it in
the string, does not re-tokenise the query to highlight terms, and does not concatenate it with
prose. Visual truncation, if any, is CSS over the complete string.

**Registration is by directory.** `RUNT-05`'s A1 web contract is normative here:

- *"Every immediate child directory of `apps/web/src/features/` is a feature area. Discovery uses a
  Vite glob in `apps/web/src/app/feature-registry.ts` — `import.meta.glob('../features/*/feature.tsx',
  { eager: true })` — which is a pattern, not a list: adding a feature directory changes no tracked
  file."*
- A feature area MUST contain `feature.tsx` default-exporting a `FeatureModule`
  (`{ id, routes, nav?, onOrganizationChange }`), where `id` equals the directory name.
- Navigation slots are the frozen PRD §31.1 tuple
  `['ORG_SWITCHER','HOME','SEARCH','ASK','COVERAGE','COMPARE','RECORDS','MONITOR','DEVELOPER',
  'SETTINGS','HELP']`; *"A feature claims a slot; it never inserts one"*, and a slot claimed twice
  fails the build.
- *"Every cache key a feature creates MUST be produced by the shell's `orgScopedKey(...)` helper from
  `apps/web/src/lib/org-scope.ts`"*, the shell purges them on organisation switch and calls
  `onOrganizationChange` (PRD §31.1: *"Switching organisation clears unsaved forms and all
  organisation-scoped client caches"*).
- `apps/web/src/lib/api-client.ts` is the shell's fetch wrapper over the generated client; it
  *"never places request or research content into a URL query string"* and surfaces `request_id`.
- Conformance harnesses `apps/web/test/feature-conformance.tsx` and
  `apps/web/test/org-scope-conformance.ts` are *"exported for reuse by the eight product modules"* —
  this ticket uses them rather than writing its own.

**Components come from `packages/ui` (breakdown plan A6).** `RUNT-06` exports the accessible
primitive set (`Button`, `TextField`, `MultiSelect`, `DateField`, `Table`, `Toolbar`, `Chip`,
`Badge`, `CopyableId`, `ErrorSummary`, `LiveRegion`, `PageHeading`, `SkipLink`, `EmptyState`, …), the
status badges (`LegalStatusBadge`, `JurisdictionBadge`, `FreshnessBadge`, `AuthorityRoleBadge` —
each *"text plus an icon/shape, never colour alone"*), `SafeMarkdown`, the `format/date.ts` helper
(*"UI renders `3 Aug 2026`; ISO 8601 strings pass through to APIs untouched"*), and **`EvidencePanel`
in `source` mode**, which *"renders version timeline, source/licence limitations and related
amendments/cases/instruments (PRD §32.1)"*. Breakdown plan **A6** exists so this module does not
build a second one. `RUNT-06` also exports `packages/ui/test/a11y.ts`, *"a reusable helper that runs
the automated accessibility pass over a rendered component at the three PRD §41.1 widths"*.

**Universal UI acceptance applies in full (PRD §41.1):** works at 360/768/1280 px *"without hiding
legal status, citations, primary actions or error recovery"*; complete keyboard operation with
visible focus; one programmatic page heading, labelled fields, error summaries and live regions;
*"colour is never the only status signal"*; `3 Aug 2026` in UI and ISO in APIs; jurisdiction, legal
status and freshness as text plus badge; *"request/job/correction IDs are copyable from errors"*;
*"customer research content is not placed in URL query strings, analytics, browser error telemetry or
page titles"*; *"refresh/back/forward/reconnect does not duplicate writes or charges"*. PRD §13.1
sets WCAG 2.2 AA as the release target.

**Carried caveats, accepted and documented:**

- Sub-PRD **Q-FIND-4**: PRD §41.1's URL rule versus PRD §32.1's *"copy stable search URL"* and
  §31.2's `?mode=advanced`. This module builds the parameter-encoded URL (a corpus query over public
  law, not research-record content) and **never** places search text into analytics, browser error
  telemetry or the page title — the three unambiguous clauses are enforced fully. The Founder owns
  the interpretation; if it goes the other way, the fallback is a server-minted saved-search id,
  which is a new app table and a plan change.
- The Advanced Search screen does not exist until `FIND-04` lands. The mode registry must therefore
  handle `?mode=advanced` with **no** registered advanced mode by showing an explicit, accessible
  "Advanced Search is not available in this build" state with a link back to Simple — never a blank
  screen and never a silent redirect that rewrites the user's URL.
- PRD §31.3's ten mandatory async states apply to *"every job-driven screen"*. Search is a single
  synchronous request with no job id, so the ten-state machine does not apply; the screen still
  renders explicit idle / validating / running / completed / failed states with a visible title, a
  plain-language explanation, an allowed next action and a copyable `request_id` +
  `search_execution_id`, built from `RUNT-06`'s components (PRD §41.1; PRD §31.3's intent —
  *"A spinner without state or recovery guidance is not acceptable"*).

## Goal

Produce the `search` web feature area and its Simple Search screen: an A1-conforming `feature.tsx`
claiming the `SEARCH` nav slot and registering `/search`; a mode registry that discovers
`./*/mode.tsx` by glob so `FIND-04` adds Advanced with zero diff here; a typed `POST /v1/search`
caller over the shell's api-client with organisation-scoped caching; and the PRD §32.1 query bar,
legal-context, results-toolbar, result-row and detail-panel regions composed from `packages/ui`,
rendering verbatim snippets, a server-supplied no-results reason and a degraded banner, with no
generated text anywhere. Completion is mechanically checkable: `RUNT-05`'s feature- and
org-scope-conformance harnesses pass; a committed `FIND-01`-shaped response fixture renders all
eleven PRD §32.1 result-row fields; the screen renders results with generation reported unavailable;
`RUNT-06`'s a11y harness reports zero WCAG 2.2 AA violations at 360/768/1280 px; and `pnpm test`,
`pnpm typecheck` and `pnpm lint` are green.

## Non-goals

- **No advanced filters, no sort-by-authority/date controls beyond the toolbar's sort selector, no
  five-state no-results taxonomy detail, no result selection** — `FIND-04`
  (`apps/web/src/features/search/advanced/**`), which is `blocked_by` this ticket. This ticket ships
  the shared no-results renderer and the toolbar's action slot; `FIND-04` fills the taxonomy's
  filter-aware recovery actions and the selection model.
- **No source/document/version/node screens** — `FIND-05` (`apps/web/src/features/sources/**`). This
  screen links to those routes by path; it does not implement them.
- **No API work** — `FIND-01`, already merged when this starts.
- **No shell, navigation, organisation switcher, status bar, api-client or `apps/web/src/lib/**`** —
  `RUNT-05`. This feature consumes them.
- **No new UI primitives, no second evidence panel, no local status badge, no local date formatter**
  — `packages/ui` (`RUNT-06`), breakdown plan **A6**. A missing component is a `RUNT-06` docs PR, not
  a local copy.
- **No enums or generated types** — `packages/contracts` (`FND-03`, `FND-04`), PRD §44.3
  serial-owned.
- **No Research Record creation, no watch target, no saved search** — `17-records-collab`
  (`RCRD-09`), `16-monitor-alerts` (`WTCH-07`); breakdown plan §4.2. This ticket ships the empty
  action slot only.
- **No generated summaries, no "explain this result", no Ask entry point beyond ordinary navigation**
  — `15-answer-product`; PRD §31.2 (*"no generated answer"*).
- **No accessibility automation suite** — `tests/e2e/accessibility/**` is `23-assurance` (`ASSR-07`).
  This ticket carries its own co-located a11y checks (breakdown plan §9 **R8**).

## File-scope (write-owns)

- `apps/web/src/features/search/feature.tsx` — the A1 feature entry for the whole `search` area
  (sub-PRD **D7**; `RUNT-05`'s contract requires exactly one per area).
- `apps/web/src/features/search/mode-registry.ts` — the `./*/mode.tsx` glob registry and the
  `SearchRoute` mode dispatcher.
- `apps/web/src/features/search/search-api.ts` — the typed `POST /v1/search` caller and its
  organisation-scoped cache keys.
- `apps/web/src/features/search/no-results.tsx` — the shared renderer for the server-supplied
  no-results reason, consumed by both modes.
- `apps/web/src/features/search/result-actions.ts` — the typed result-action registry (the toolbar
  and row extension slot; ships with **zero** registered actions).
- `apps/web/src/features/search/simple/**` — the Simple Search screen, its `mode.tsx`, its
  components, its committed render fixtures and its co-located tests (sub-PRD **D8**).

Does not touch:

- `apps/web/src/features/search/advanced/**` — `FIND-04` (`blocked_by` this ticket; never
  concurrent). `apps/web/src/features/sources/**` — `FIND-05`.
- `apps/web/src/features/**` other than `search/` — `RUNT-05` (`home`) and modules `13`, `15`, `16`,
  `17`, `19`, `20`, `24`.
- `apps/web/src/{app,shell,lib}/**`, `apps/web/index.html`, `apps/web/vite.config.ts`,
  `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/test/**` — `RUNT-05`. The two
  conformance harnesses under `apps/web/test/**` are **used**, never edited.
- `packages/ui/**` — `RUNT-06`; `packages/contracts/**`, `schemas/openapi/**` — `FND-03`/`FND-04`;
  `packages/observability/**` — `RUNT-07`.
- `apps/api/**` — `FIND-01`, `FIND-02`, `FIND-06` and `03-app-runtime`. `apps/worker/**`,
  `apps/admin/**`, `apps/widget/**`, `packages/**` (other), `pipelines/**`, `infra/**`, `tests/**`,
  `evals/**` — other modules per breakdown plan §4. `docs/PRD.md` — frozen.

**Serial-safety analysis.** First decomposition (breakdown plan §1: phase 1, nothing merged, no
in-flight ticket): nothing has previously written `apps/web/src/features/search/**` and nothing
contends for it. Breakdown plan §4 gives the whole `apps/web/src/features/{search,sources}/**` tree
to this module, and §5.15 splits it three ways: this ticket (area entry files + `simple/**`),
`FIND-04` (`advanced/**`) and `FIND-05` (`sources/**`). `FIND-04` is `blocked_by` this ticket, so the
two are never in flight together, and even then their paths are disjoint because the mode registry
discovers modes by glob rather than by an edited list (sub-PRD **D7**). `FIND-05` is a different
feature area. Under `RUNT-05`'s A1 contract, adding this feature directory changes **zero** tracked
file outside it — no shell file, no route table, no nav list. This ticket's concurrent sibling in the
module's wave 2 is `FIND-05`, in a different directory.

## Deliverables

1. **`feature.tsx`** — default-exports a `FeatureModule` with `id: 'search'` (equal to the directory
   name), `routes: [{ path: '/search', element: <SearchRoute /> }]`, `nav: { slot: 'SEARCH', label:
   'Search', to: '/search', visibleWhen: () => true }` (PRD §31.2 gives the route to *all* members,
   so the predicate is unconditional and no role rule is encoded here), and
   `onOrganizationChange(orgId)` that drops every organisation-scoped cache this feature holds.
   Nothing else is exported from this file.
2. **`mode-registry.ts` + `SearchRoute`** — discovery by
   `import.meta.glob('./*/mode.tsx', { eager: true })`, mirroring `RUNT-05`'s pattern one level
   deeper. Each mode module default-exports `{ mode: 'simple' | 'advanced', label: string, element:
   ReactNode, order: number }`. `SearchRoute` reads `mode` from the query string, defaults to
   `simple`, renders the registered element, and renders the toggle from the registry — so
   `FIND-04`'s arrival adds the Advanced option with **zero** diff to this file. A `mode` value with
   no registered module renders an explicit, accessible state naming the mode and offering a link to
   Simple Search; it never blanks the screen and never rewrites the user's URL silently. Two modules
   claiming the same `mode` fail the build with a named error (`RUNT-05` contract item 4's rule,
   applied here).
3. **`search-api.ts`** — `searchCorpus(request): Promise<SearchResponse>` over
   `apps/web/src/lib/api-client.ts` (`RUNT-05` deliverable 8), typed **only** by
   `packages/contracts/src/generated/**`. It sends the PRD §34.2 request body, surfaces `request_id`
   and `search_execution_id` on both success and error, maps the PRD §16.1 error body to the shell's
   typed client error, and keys any cache with `orgScopedKey(...)`. It sends no organisation
   identifier (PRD §34.1 — the tenant is derived from the session) and puts no research content into
   analytics or telemetry (PRD §41.1).
4. **Query bar (PRD §32.1 row 1)** — a labelled text field, a submit control, the Simple/Advanced
   toggle (from the mode registry) and a syntax-help disclosure whose content is the PRD §8.2
   Advanced Search capability list stated as user-facing examples (Boolean expressions, exact
   phrases, neutral citations and case numbers, section/clause/schedule/paragraph references,
   award/agreement identifiers and titles, employer name and ABN). Submitting an empty query is an
   **inline** validation error that issues no request — PRD §32.1: *"Search validation errors remain
   inline and do not consume quota."*
5. **Legal context (PRD §32.1 row 2)** — `legal_as_at` is a required date field **defaulted to
   today**, rendered `3 Aug 2026` and sent ISO (`RUNT-06`'s `format/date.ts`); jurisdiction is a
   multi-select over the `FND-03` jurisdiction values; legal status defaults to `IN_FORCE`. The
   defaults are visible, not implicit: the screen states the legal date in use above the results.
6. **Results toolbar (PRD §32.1 row 4)** — result count with its **relation** rendered explicitly as
   `exact` or *at least N* (never a bare number when the engine reports a lower bound); a sort
   selector over the generated sort enum (PRD §8.2: relevance, authority and date); active-filter
   chips that state the applied filters echoed by `applied_filters` (not the requested ones);
   a **copy stable search URL** control that copies the current parameter-encoded `/search?…` URL;
   and the **action slot** rendered from `result-actions.ts`, empty in this ticket.
7. **`result-actions.ts`** — `export type SearchResultAction = { id, label, scope: 'toolbar' | 'row',
   render(ctx: SearchResultActionContext): ReactNode }` and
   `export function registerSearchResultAction(a: SearchResultAction): void`, where
   `SearchResultActionContext` exposes only **stable identifiers and public metadata** —
   `document_id`, `document_version_id`, `node_id`, `node_version_id`, `corpus_release_id`,
   `search_execution_id`, `legal_as_at` — and never the snippet text or the user's query. This is the
   seam `RCRD-09` (*"writes only the selected stable IDs and anonymous notes"*, PRD §33.1 step 6) and
   `WTCH-07` (PRD §33.1 step 7) render into; this module registers nothing and writes nothing
   (sub-PRD **D10**; breakdown plan §4.2).
8. **Result row (PRD §32.1 row 5)** — one component rendering all eleven required fields: title,
   document type, authority (with level where the contract provides it, sub-PRD **Q-FIND-2**),
   neutral/instrument identifier, pinpoint, the **exact source snippet**, jurisdiction, legal-status
   badge, effect interval (`effective_from` – `effective_to`, with an explicit "current" rendering
   when `effective_to` is null), freshness and the official link. Status, jurisdiction, freshness and
   authority role use `packages/ui` badges — text plus icon, never colour alone (PRD §41.1). The
   official link opens with `rel="noopener noreferrer"` and is visibly marked as leaving the product.
   The snippet is rendered **verbatim** with no client-side highlighting, no term matching, no
   truncation of the string and no markdown interpretation of source text (sub-PRD **D2**; PRD §8.2,
   §34.2). Any highlight ranges are taken from payload offsets or omitted.
9. **Detail panel (PRD §32.1 row 6)** — `packages/ui`'s `EvidencePanel` in `source` mode, fed from
   the selected result and (where available) the `FIND-02` endpoints via ordinary navigation. This
   ticket builds **no** panel of its own (breakdown plan **A6**).
10. **States** — explicit idle, validating, running, completed and failed states, each with a visible
    title, a plain-language explanation, the allowed next action and a copyable `request_id` /
    `search_execution_id`, composed from `RUNT-06`'s components; a **degraded banner** naming the
    reduced stages whenever the response carries `warnings` or a degraded marker (sub-PRD **D9**;
    PRD §13.2); and the shared **no-results renderer** (`no-results.tsx`) that displays the
    server-supplied primary reason with plain-language copy and a next action per reason. The screen
    never infers a reason from an empty array (sub-PRD **D5**; PRD §32.1).
11. **URL state and history** — query, `legal_as_at`, jurisdictions, status, sort, page and `mode`
    live in the URL so the stable search URL is meaningful and back/forward restores exactly what was
    shown; a restored URL re-issues the read (search is free of charge and side effects, PRD §16.2)
    and produces no duplicate write or charge (PRD §41.1). Nothing of the query is written to the
    page title, analytics or browser error telemetry (PRD §41.1; **Q-FIND-4**).
12. **Organisation safety** — every cache key via `orgScopedKey`; the unsubmitted query registered
    through `registerDirtyForm` so the switcher can warn before discarding; `onOrganizationChange`
    clears results, selection and caches. Verified with `RUNT-05`'s exported
    `org-scope-conformance` harness (PRD §31.1; `AUTH-002`).
13. **Committed render fixtures** — `simple/__fixtures__/`: a populated `POST /v1/search` response, a
    degraded response with warnings, and one response per no-results reason. All synthetic, shaped
    exactly as PRD §34.2 and validated against the generated response type in the test suite, so a
    contract change breaks the render tests rather than production (PRD §45.1 item 6 — no customer
    content, no evaluation gold).
14. **Co-located tests** under `simple/__tests__/**` and, for the area files, alongside them
    (sub-PRD **D8**), including the `RUNT-06` a11y harness at 360/768/1280 px.

## Acceptance checklist (classified)

- [ ] `[machine]` **A1 conformance**: the feature area renders `/search` and claims the `SEARCH` nav
      slot with **zero** diff to any tracked file outside `apps/web/src/features/search/`, asserted
      with `RUNT-05`'s exported `apps/web/test/feature-conformance.tsx` (breakdown plan **A1**;
      `RUNT-05` contract item 6)
- [ ] `[machine]` **Mode registry**: with only `simple/mode.tsx` present, `/search` renders Simple and
      `/search?mode=advanced` renders the explicit "not available in this build" state (never blank,
      never a silent URL rewrite); adding a second mode module registers it with no diff to
      `mode-registry.ts`, asserted by injecting a throw-away mode module in the test (sub-PRD **D7**)
- [ ] `[fixture]` **Result row completeness**: rendering the committed populated fixture shows all
      eleven PRD §32.1 result-row fields — title, type, authority, neutral/instrument ID, pinpoint,
      exact source snippet, jurisdiction, status badge, effect interval, freshness, official link —
      asserted field by field against a literal list transcribed from PRD §32.1 (`SRCH-003`)
- [ ] `[fixture]` **Snippet fidelity in the DOM**: the rendered snippet text node is byte-identical to
      `snippet.text` in the fixture — no ellipsis inserted, no whitespace collapsed into the string,
      no `<mark>` produced by client-side term matching (PRD §8.2, §34.2; sub-PRD **D2**)
- [ ] `[machine]` **No generated text**: a source scan of this feature finds no import of any answer/
      ask feature or model-related package, and no rendered string is composed from source text plus
      product prose; the screen offers no summarise/explain affordance (PRD §31.2 *"no generated
      answer"*, §16.2)
- [ ] `[machine]` **Works with generation disabled**: with the system status reporting generation
      unavailable and the funding ledger exhausted, the screen still issues the search and renders
      results — asserted against a stubbed api-client returning the populated fixture while the
      shell's status context reports degraded generation (`SRCH-001`; PRD §8.2, §26; `UAT-SRCH-01`,
      `UAT-ANS-08`)
- [ ] `[fixture]` **No-results reasons**: each of the five committed no-results fixtures renders its
      distinct plain-language state and next action, and the component receives the reason from the
      payload — a test asserting that the renderer has no code path that derives a reason from
      `results.length` (PRD §32.1; sub-PRD **D5**)
- [ ] `[machine]` **Degraded banner**: a response carrying `warnings`/degraded renders an explicit
      banner naming what is reduced, and results are still shown (PRD §13.2; sub-PRD **D9**)
- [ ] `[machine]` **Inline validation consumes no quota**: submitting an empty query produces an
      inline error and issues **no** HTTP request — asserted by a request-counting stub (PRD §32.1)
- [ ] `[machine]` **Count relation**: a lower-bound count renders as "at least N", never as a bare
      exact number (PRD §32.1)
- [ ] `[machine]` **Active-filter chips reflect `applied_filters`**, not the requested filters — a
      fixture where the two differ renders the applied set (PRD §34.2; sub-PRD **D5**)
- [ ] `[machine]` **URL round-trip**: query, legal date, jurisdictions, status, sort, page and mode
      survive copy-URL → reload → back/forward with the identical rendered state, and no duplicate
      write or charge occurs (PRD §41.1, §32.1)
- [ ] `[machine]` **No research content in title/analytics/telemetry**: a canary query string appears
      in `document.title`, in the analytics stub and in the error-telemetry stub **zero** times
      (PRD §41.1)
- [ ] `[machine]` **Organisation scoping**: `RUNT-05`'s `org-scope-conformance` harness passes — every
      cache key is `orgScopedKey`-derived, and switching organisation clears results, selection and
      caches and warns about the unsubmitted query (PRD §31.1; `AUTH-002`)
- [ ] `[machine]` **Accessibility**: `RUNT-06`'s `packages/ui/test/a11y.ts` harness reports **zero**
      WCAG 2.2 AA violations for the screen in populated, empty, degraded, error and loading states at
      **360 px, 768 px and 1280 px** (PRD §13.1, §41.1)
- [ ] `[machine]` **Keyboard and structure**: complete keyboard operation with visible focus and
      logical order; exactly one programmatic page heading; every field labelled; an error summary on
      validation failure; a live region announcing result-count and state changes; every status
      signal carries text plus icon (PRD §41.1)
- [ ] `[machine]` **Dates**: every displayed date renders as `3 Aug 2026` through `packages/ui`'s
      formatter, and every value sent to the API is ISO 8601 — asserted by a test that fails on an
      inline date format in this feature (PRD §41.1)
- [ ] `[machine]` **IDs are copyable**: `request_id` and `search_execution_id` are rendered in a
      copyable control on the error and detail states (PRD §41.1)
- [ ] `[machine]` **Extension seam is inert here**: `result-actions.ts` has no registered action in
      this module, and its context type cannot carry snippet text or the user's query — asserted at
      the type level (sub-PRD **D10**; breakdown plan §4.2)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[human]` `UAT-SRCH-01` — with the model gateway disabled, searching an exact Act section
      returns the exact official node and version within the latency gate, judged on the running
      screen at Gate 2 (PRD §41.2). Not required to merge; `FIND-06` supplies the latency evidence.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement ID `SRCH-001` (with `SRCH-003` on the
      render side) and UAT id `UAT-SRCH-01`; user-visible change and non-goals; tenant/PII impact
      ("no organisation identifier is sent; no research content leaves the page"); cost impact
      ("zero — search consumes no generation credit"); accessibility evidence; rollback path; known
      gaps (Advanced Search arrives in `FIND-04`)
- [ ] `cargo test --workspace` and `uv run pytest` not applicable — no Rust and no Python here
      (PRD §45.3).

## Test plan

All steps run offline against committed fixtures; no network, no API process, no model provider.
Harness: the repository's component test runner as configured by `FND-01`/`RUNT-05`; copy the
construction pattern from `packages/ui/test/**` (`RUNT-06`'s render + a11y tests) and from
`RUNT-05`'s `apps/web/test/feature-conformance.tsx`.

1. **Feature conformance** — `__tests__/feature.test.tsx`: run `RUNT-05`'s exported
   `feature-conformance` harness against this area; assert the route, the `SEARCH` slot and the
   zero-diff property (the reviewer confirms with `git status --porcelain`).
2. **Mode registry** — `__tests__/mode-registry.test.tsx`: inject a throw-away second mode module and
   assert it appears in the toggle and resolves from `?mode=`; remove it and assert
   `?mode=advanced` renders the explicit unavailable state; assert a duplicate mode fails loudly.
3. **Render fixtures** — `simple/__tests__/result-row.test.tsx`: validate each committed fixture
   against the generated response type, render, and assert the eleven §32.1 fields and byte-identical
   snippet text. Include one result with `effective_to: null` and one licence-limited result.
4. **No-results and degraded** — `simple/__tests__/states.test.tsx`: one case per committed
   no-results fixture plus the degraded fixture; assert distinct copy, distinct next action, and that
   no code path infers a reason.
5. **Generation independence** — `simple/__tests__/no-generation.test.tsx`: shell status stub
   reporting generation unavailable; assert results render; assert no import of an answer feature via
   the architecture scan in step 9.
6. **URL and history** — `simple/__tests__/url-state.test.tsx`: set state → read URL → reload from
   URL → back/forward; assert identical rendered state, one request per navigation, and the canary
   absent from title/analytics/telemetry stubs.
7. **Organisation scoping** — `simple/__tests__/org-scope.test.tsx`: run `RUNT-05`'s
   `org-scope-conformance` harness; assert dirty-form registration and cache purge on switch.
8. **Accessibility** — `simple/__tests__/a11y.test.tsx`: `RUNT-06`'s `a11y.ts` over every screen state
   at 360/768/1280 px; assert zero violations and assert keyboard traversal reaches submit, sort,
   every result row and the detail panel.
9. **Architecture** — `__tests__/architecture.test.ts`: this feature imports only `packages/ui`,
   `packages/contracts` and `apps/web/src/lib/**`; it imports no other feature area, no model-related
   package and no API source file.
10. **Suite green** — `pnpm lint`, `pnpm typecheck`, `pnpm test` from the repository root.
11. **Reviewer focus**: confirm the snippet cannot be altered on any render path (including
    truncation utilities and markdown renderers); confirm `?mode=advanced` before `FIND-04` is a
    named state rather than a blank or a redirect; confirm no reason code is computed client-side;
    confirm nothing in the feature reads or writes a non-org-scoped cache key; confirm the
    result-action context type cannot leak query or snippet text; confirm the a11y run covers the
    error and empty states, not only the happy path.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/14-search-product/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *`packages/ui` lacks a component this screen needs, or `EvidencePanel`'s `source` mode cannot
     express the PRD §32.1 detail panel* → breakdown plan **A6** puts it in `packages/ui`. Raise a
     docs PR against `docs/prd/03-app-runtime/tickets/RUNT-06-*.md`, `--sync`, and record it in
     `docs/prd/14-search-product/README.md`. **Never** build a second evidence panel or a local status
     badge — `14`, `15` and `17` would then import each other, which A6 exists to prevent.
   - *`RUNT-05`'s feature contract cannot express something this area needs* (a nested route, a
     mode-aware nav entry) → docs PR against `RUNT-05`, recorded in this module's README, and — if
     the A1 web contract itself is at fault — against `docs/prd/breakdown-plan.md` §2.1 **A1** and
     risk **R1**, which already names this failure mode.
   - *The response lacks a field the row must show* (authority level, neutral/instrument identifier,
     a no-results reason) → sub-PRD **Q-FIND-2/Q-FIND-3**: a docs PR against `FND-04`/`FND-03` and
     `FIND-01`. The screen shows an explicit "not available" rather than inventing or inferring the
     value; a legal attribute guessed in the browser is exactly the failure PRD §2 exists to prevent.
   - *`Q-FIND-4` resolves against the parameter-encoded URL* → the fallback (a server-minted
     saved-search id) needs a new app table owned by `01-app-data` and a `blocked_by` edge. That is a
     plan change: write back to `docs/prd/14-search-product/README.md` **and**
     `docs/prd/breakdown-plan.md` §4/§5.15 before building it here.
   - *Rendering the complete snippet is visually awkward* → truncate with CSS, never in the string.
     If the product genuinely needs a shortened snippet, that is a PRD §34.2 change (product change,
     PRD §45.5) requiring founder approval — not a render-time decision.
3. **Falsified protocol.** If the A1 feature-directory autoload turns out to require a central route
   or nav manifest after all, that overturns breakdown plan **A1** and triggers its recorded
   consequence in risk **R1**: `RUNT-05` raises the ADR, breakdown plan §4.2 gains a manifest-owner
   row, and every product module's first screen ticket takes a new `blocked_by`. Escalate for
   re-review; do not quietly edit a shell file to make this screen appear.
