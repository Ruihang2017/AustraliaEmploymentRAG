---
id: FIND-04
title: Advanced Search screen (filters, sort, no-results taxonomy)
module: 14-search-product
lane: 14-search-product
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FIND-03]
blocks: [RCRD-09, ASSR-06]
---

# FIND-04 — Advanced Search screen (filters, sort, no-results taxonomy)

Implements PRD §31.2 (`/search?mode=advanced`), §32.1 (advanced filters, results toolbar, the
five-state no-results taxonomy), §8.2, §6.5, §13.1 and §41.1 — requirement IDs `SRCH-002` and
`SRCH-004` on the customer-visible side; epic `E18-SEARCH-API-UI`.
No ADR — the decision is already made in PRD §32.1 (the advanced-filter and no-results contract),
PRD §8.2 (the Advanced Legal Search capability list) and breakdown plan **A1**/**A6**; this is build
ticket 4 of 6 against it.
Parent sub-PRD: [14-search-product README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [FIND-03 — Simple Search screen](FIND-03-simple-search-screen.md) (mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against fixed contracts —
`FIND-03`'s mode registry and shared area files, `FIND-01`'s PRD §34.2 response and `RUNT-06`'s
component API — not a new subsystem decision.

## Background + basis

**The capability list is a product requirement, quoted in full (PRD §8.2):** *"Simple Search MUST
support ordinary language and keywords. Advanced Legal Search MUST support:*

- *Boolean expressions;*
- *exact phrases;*
- *neutral citations and case numbers;*
- *section, clause, schedule and paragraph references;*
- *award/agreement identifiers and titles;*
- *employer name and ABN;*
- *jurisdiction, document type, authority, legal status and date filters;*
- *relevance, authority and date sorting."*

The first five are **query syntax**, parsed by the engine (PRD §36.1: *"Rules/checksums parse dates,
neutral citations, provision references, award codes, agreement IDs and ABNs before any model
classifier"*), so this screen passes the query through untouched and explains the syntax. The last
two are **controls** this screen owns.

**The filter row is enumerated (PRD §32.1):** *"Advanced filters | document type, authority,
court/tribunal level, publication/effective date, employer name, ABN, award/agreement ID"*, on top of
the legal-context row `FIND-03` already ships (*"`legal_as_at` required and defaulted to today;
jurisdiction multi-select; status defaults to `IN_FORCE`"*). PRD §31.2 gives the route and its
first-use state: *"`/search?mode=advanced` | Advanced Search | all | Apply legal filters | Filter
explanation and current legal date."*

**The no-results state is five states, not one.** PRD §32.1: *"No-results state MUST distinguish: no
text match, all matches removed by hard filters, source not covered, source stale/unavailable and
invalid exact identifier."* Sub-PRD **D5** decides where that judgment is made: `FIND-01` returns the
primary reason, this screen renders it with a **filter-aware recovery action**. The screen never
infers a reason from an empty array, because "no text match" and "removed by hard filters" produce
the identical empty array.

**Filters are hard, and the screen must not soften them.** PRD §30.2 `SRCH-002`: *"Advanced Search
applies date, jurisdiction, type, authority and status filters"*, minimum evidence *"Every result
independently passes all hard filters."* PRD §36.2 applies the eligibility predicate twice inside the
search boundary, and PRD §36.3: *"No learned score may reintroduce a filtered item."* Sub-PRD **D14**
therefore forbids any client-side re-filtering, re-ranking or re-sorting: results render in the order
the engine returned them, and a sort change is a **new request**, never a local array sort — that is
what protects `SRCH-004` (*"Exact provision/case/agreement/ABN matches outrank semantic
similarity"*).

**Future law is searchable but never presented as current.** PRD §6.5: *"Future/proposed material
MUST be stored and searchable but MUST be separated from current-law answers and visibly labelled."*
PRD §6.7: *"Default answers MUST use only material in force at the requested legal date unless the
user explicitly requests historical, future or proposed material."* `UAT-SRCH-02` is the test:
*"Search current law with `ENACTED_NOT_IN_FORCE` source present → Future material absent from default
results or visibly separated when requested."*

**Invalid input must not cost the customer anything.** PRD §32.1: *"Search validation errors remain
inline and do not consume quota."* `UAT-SRCH-04`: *"Use invalid ABN in advanced employer filter →
Inline checksum error; no search/quota event."* This matters mechanically: `RUNT-02`'s admission
chain runs `rate-limit` **before** `schema-validate`
(`['request-limits','authenticate','resolve-organisation','verify-membership','evaluate-permission',
'rate-limit','pii-admission','schema-validate','legal-scope','budget-admission','idempotency']`), so
a request sent with a bad ABN would consume a search-burst token before being rejected. The only way
to satisfy `UAT-SRCH-04` is to validate the checksum **client-side and not issue the request**. The
server remains authoritative and answers `400 INVALID_ABN` (PRD §34.9) if called directly.

**This screen is the seam two other modules build on.** Breakdown plan §4.2 assigns *"create record
from search selection"* to `17-records-collab` (`RCRD-09`, `blocked_by` this ticket) and *"create
watch target from search/source"* to `16-monitor-alerts`, *"would put record writes in `14`"* /
*"would put watch writes in `14`"* being the stated reason. PRD §33.1 steps 6–7: *"User may create a
Research Record using selected authorities; this writes only the selected stable IDs and
user-authored anonymous notes. User may create a watch target from the search or source."* Sub-PRD
**D10**: this ticket exports the **selection**, `FIND-03` owns the **action registry**, and neither
performs a write. `ASSR-06` (E2E automation of the PRD §41.2 scripts) is also `blocked_by` this
ticket, so every control needs a stable accessible name to target.

**Inherited contracts (do not re-derive them):**

- `FIND-03` owns and this ticket **consumes**: `feature.tsx` (the `search` area entry, `SEARCH` nav
  slot, `/search` route), `mode-registry.ts` (glob discovery of `./*/mode.tsx`; a mode module
  default-exports `{ mode, label, element, order }`), `search-api.ts` (the typed `POST /v1/search`
  caller over the shell api-client, organisation-scoped caching, `request_id` +
  `search_execution_id` surfaced), `no-results.tsx` (the shared reason renderer) and
  `result-actions.ts` (`registerSearchResultAction`, whose context carries **stable identifiers
  only** — never snippet text or the user's query).
- `RUNT-06` (`packages/ui`, breakdown plan **A6**) supplies every primitive, the status/jurisdiction/
  freshness/authority badges (*"text plus an icon/shape, never colour alone"*), `EvidencePanel` in
  `source` mode, `format/date.ts` (*"UI renders `3 Aug 2026`; ISO 8601 strings pass through to APIs
  untouched"*) and `packages/ui/test/a11y.ts` for the three-width accessibility pass.
- `RUNT-05` supplies `apps/web/src/lib/api-client.ts`, `orgScopedKey`, `registerDirtyForm` and the
  two conformance harnesses under `apps/web/test/**`.
- PRD §41.1 applies in full to this screen exactly as to `FIND-03` (three widths, keyboard, single
  page heading, labelled fields, error summaries, live regions, colour never alone, `3 Aug 2026`
  dates, copyable IDs, no research content in URL query strings / analytics / telemetry / page
  titles, and *"refresh/back/forward/reconnect does not duplicate writes or charges"*). PRD §13.1
  sets WCAG 2.2 AA as the release target.

**Carried caveats, accepted and documented:**

- **The ABN checksum is implemented locally as input validation.** No shared helper exists:
  `packages/domain` (`FND-06` … `FND-10`) covers access, answers, workflow, budget and legal
  temporality, not identifier checksums, and `packages/contracts` is enums/schemas only (PRD §45.2).
  A local implementation is an *implementation detail* under PRD §45.5 because the authoritative
  check stays server-side (`400 INVALID_ABN`). The algorithm, stated so nobody has to look it up:
  an ABN is 11 digits; subtract 1 from the first digit; multiply the digits by the weights
  `[10,1,3,5,7,9,11,13,15,17,19]`; the ABN is valid iff the sum is divisible by 89. If a shared
  helper later appears, switch to it (see Feedback obligation).
- Sub-PRD **Q-FIND-5**: `WTCH-07` ("create-watch-from-source") declares `blocked_by [RUNT-05,
  WTCH-01, FIND-05]` and does not name this ticket, although PRD §32.1's toolbar includes *"save
  search/watch"*. This ticket ships the slot regardless; an unfilled slot renders nothing. Whether
  `WTCH-07` needs an edge on this ticket is `16-monitor-alerts`' call, with the writeback target
  `docs/prd/breakdown-plan.md` §5.17/§6.2.
- Sub-PRD **Q-FIND-2/Q-FIND-7**: the authority-level and neutral/instrument-identifier row fields and
  the `employer` request shape may need additive `FND-04` contract properties. Where a value is
  absent, the screen renders an explicit "not available" — it never infers a legal attribute.

## Goal

Produce `apps/web/src/features/search/advanced/**`: the Advanced Search mode registered through
`FIND-03`'s mode registry, adding the seven PRD §32.1 advanced filters, relevance/authority/date
sorting as server-side requests, explicit separation and labelling of future/proposed material, the
five distinct PRD §32.1 no-results states with filter-aware recovery, client-side ABN checksum
validation that issues no request, and an exported result-selection surface for `RCRD-09` and
`WTCH-07` that writes nothing. Completion is mechanically checkable: the mode registers with zero
diff to `FIND-03`'s files; each of the five no-results fixtures renders its own state and recovery
action; an invalid ABN produces an inline error and zero HTTP requests; a sort change issues a new
request and never re-orders locally; `RUNT-06`'s a11y harness reports zero WCAG 2.2 AA violations at
360/768/1280 px; and `pnpm test`, `pnpm typecheck` and `pnpm lint` are green.

## Non-goals

- **No changes to `FIND-03`'s area files** — `feature.tsx`, `mode-registry.ts`, `search-api.ts`,
  `no-results.tsx` and `result-actions.ts` belong to `FIND-03`. This ticket consumes them; a needed
  change there is a `FIND-03` docs PR (see Feedback obligation), never a concurrent edit.
- **No Research Record creation, no watch target, no saved search, no export** —
  `17-records-collab` (`RCRD-09`, `blocked_by` this ticket), `16-monitor-alerts` (`WTCH-01`,
  `WTCH-07`), `19-exports`; breakdown plan §4.2. This ticket exports the selection and renders the
  registered actions; it performs **no** write of any kind.
- **No API work** — `FIND-01` decides the applied filters, the ranking order and the no-results
  reason; this screen sends parameters and renders answers.
- **No client-side filtering, ranking, sorting, deduplication or "smart" query rewriting** — sub-PRD
  **D14**, PRD §36.3, `SRCH-004`.
- **No source/document/version/node screens** — `FIND-05`.
- **No new UI primitives, no second evidence panel, no local badge or date formatter** —
  `packages/ui` (`RUNT-06`), breakdown plan **A6**.
- **No enums or generated types** — `FND-03`, `FND-04`, PRD §44.3 serial-owned.
- **No E2E automation of the §41.2 scripts** — `tests/e2e/uat/**` is `23-assurance` (`ASSR-06`,
  `blocked_by` this ticket). This ticket makes the screen automatable; it does not write the suite.
- **No accessibility automation suite** — `ASSR-07`. Co-located checks only (breakdown plan §9
  **R8**).

## File-scope (write-owns)

- `apps/web/src/features/search/advanced/**` — `mode.tsx` (the mode-registry entry), the Advanced
  Search screen and its filter panel, the ABN validator, the selection model, `public.ts` (the
  exported surface for `RCRD-09`/`WTCH-07`), committed render fixtures under `__fixtures__/` and
  co-located tests under `__tests__/` (sub-PRD **D8**).

Does not touch:

- `apps/web/src/features/search/{feature.tsx,mode-registry.ts,search-api.ts,no-results.tsx,
  result-actions.ts}` and `apps/web/src/features/search/simple/**` — `FIND-03` (merged before this
  starts; consumed, never written).
- `apps/web/src/features/sources/**` — `FIND-05`. `apps/web/src/features/records/**` —
  `17-records-collab`. `apps/web/src/features/monitor/**` — `16-monitor-alerts`.
- `apps/web/src/{app,shell,lib}/**`, `apps/web/test/**`, `apps/web/package.json`,
  `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html` — `RUNT-05`.
- `packages/ui/**` — `RUNT-06`; `packages/contracts/**`, `schemas/openapi/**` — `FND-03`/`FND-04`.
- `apps/api/**` — `FIND-01`, `FIND-02`, `FIND-06`, `03-app-runtime`. `apps/worker/**`,
  `apps/admin/**`, `apps/widget/**`, `packages/**` (other), `pipelines/**`, `infra/**`, `tests/**`,
  `evals/**` — other modules per breakdown plan §4. `docs/PRD.md` — frozen. Root manifests and
  lockfiles — `FND-01`.

**Serial-safety analysis.** First decomposition (breakdown plan §1: phase 1, nothing merged, no
in-flight ticket): nothing has previously written `apps/web/src/features/search/advanced/**`. The
only ticket that has written anywhere in this feature area is `FIND-03`, which this ticket is
`blocked_by` — so `FIND-03` is merged before this starts and the two are **never** concurrent. Even
so their paths are disjoint: `FIND-03` owns the area entry files and `simple/**`, this ticket owns
`advanced/**` only, and the mode registry discovers `./*/mode.tsx` by glob (sub-PRD **D7**), so
registering Advanced requires **zero** edit to any `FIND-03` file. This ticket's concurrent sibling in
the module's wave 3 is `FIND-06`, which writes `apps/api/bench/search/**` — a different app.

## Deliverables

1. **`advanced/mode.tsx`** — default-exports `{ mode: 'advanced', label: 'Advanced', element:
   <AdvancedSearchScreen />, order: 2 }` for `FIND-03`'s registry. Adding this file is the entire
   registration; no other file changes (sub-PRD **D7**).
2. **`AdvancedSearchScreen`** — composes `FIND-03`'s query bar and legal-context regions with the
   filter panel below, the shared results toolbar and result rows, and `packages/ui`'s
   `EvidencePanel` (`source` mode) as the detail panel. First-use state, per PRD §31.2: a **filter
   explanation** plus the **current legal date** in use — not an empty result table.
3. **The seven PRD §32.1 advanced filters**, every one typed from the generated request contract and
   the `FND-03` enums, never a local list:
   - **document type** — multi-select over the generated document-type values;
   - **authority** — multi-select/typeahead over `authority_ids`, showing the authority name and
     (where the contract provides it) its level;
   - **court/tribunal level** — select over the `FND-03` authority-level ordering (PRD §9.1, §9.2:
     *"Court/tribunal, level, date, case number and neutral citation MUST be displayed"*);
   - **publication date** and **effective date** — bounded date ranges, distinct from `legal_as_at`
     and clearly labelled as such, rendered `3 Aug 2026`, sent ISO;
   - **employer name** and **ABN** — the `employer` request member (sub-PRD **Q-FIND-7**), labelled
     *public business data* (PRD §32.2);
   - **award/agreement identifier** — feeding `exact_identifiers`, with a note that an exact
     identifier is always retained if applicable (PRD §36.2).
   Every filter is optional; clearing one re-issues the search; a filter the contract cannot express
   is not invented (see Feedback obligation).
4. **ABN validation that costs nothing.** The ABN field validates the modulus-89 checksum
   client-side (algorithm quoted in Background) and, on failure, renders an **inline** field error in
   the error summary and **issues no HTTP request** — asserted by a request-counting stub. A valid
   ABN is sent as typed; the server remains authoritative (`400 INVALID_ABN`, PRD §34.9) and its
   response is surfaced inline as well. Basis: PRD §32.1, `UAT-SRCH-04`, and `RUNT-02`'s stage order
   (rate limit precedes schema validation).
5. **Legal status and future material.** The status control defaults to `IN_FORCE` (PRD §32.1) and
   offers the other `FND-03` §6.7 values. When a status set including `ENACTED_NOT_IN_FORCE`,
   `BILL_NOT_ENACTED` or `DRAFT_OR_CONSULTATION` is selected, matching results are **visibly labelled
   and visually separated** from current-law results (a labelled group with an explanatory heading),
   and the screen states that future/proposed material is not current law. With the default status
   set, no future material appears. Basis: PRD §6.5, §6.7, `UAT-SRCH-02`.
6. **Sorting as a server request.** A sort control over the generated sort values (PRD §8.2:
   relevance, authority, date). Changing sort issues a **new** `POST /v1/search`; results are always
   rendered in the order returned. This feature contains **no** array sort, no re-ranking and no
   client-side dedupe — a test asserts the absence (sub-PRD **D14**; PRD §36.3; `SRCH-004`).
7. **Active-filter chips and the applied/requested distinction.** Chips are built from the response's
   `applied_filters`, each removable (removal re-issues the search), plus a clear-all. When a
   requested filter does not appear in `applied_filters`, the screen says so explicitly rather than
   showing it as applied (PRD §34.2; sub-PRD **D5**).
8. **The five no-results states** (PRD §32.1), rendered through `FIND-03`'s `no-results.tsx` with an
   advanced-mode recovery action per reason:

   | Server reason | What the screen says | Recovery action offered |
   |---|---|---|
   | no text match | the query matched no source text in this release | broaden the query; show syntax help |
   | all matches removed by hard filters | N candidates were excluded by the active legal filters | name the filters and offer to relax a **named** one — the screen never relaxes one automatically |
   | source not covered | the material is outside the covered source groups | link to the source-coverage information |
   | source stale/unavailable | the source is degraded or unavailable for this release | show freshness and the official link |
   | invalid exact identifier | the identifier is well formed but resolves to nothing in this release | offer to search it as free text |

   The reason comes from the payload; nothing here derives it (sub-PRD **D5**).
9. **Degraded banner** — a response carrying `warnings` or a degraded marker renders an explicit
   banner naming the reduced stages, above results that are still shown (PRD §13.2; sub-PRD **D9**).
10. **Result selection (`useSearchSelection`)** — multi-select of result rows with keyboard support,
    holding **only stable identifiers and public metadata** (`document_id`, `document_version_id`,
    `node_id`, `node_version_id`, `corpus_release_id`, `search_execution_id`, `legal_as_at`,
    title, pinpoint). The selection type **cannot** carry the user's query, the snippet text or any
    free text, asserted at the type level. Selection state is organisation-scoped
    (`orgScopedKey`) and cleared on organisation switch.
11. **`advanced/public.ts` — the published surface for downstream modules.** Exports
    `useSearchSelection()`, the `SearchSelection` type and a re-export of `FIND-03`'s
    `registerSearchResultAction`, documented as the **only** entry point `RCRD-09` and `WTCH-07` may
    import from this module. This module registers no action and performs no write (sub-PRD **D10**;
    breakdown plan §4.2; PRD §33.1 steps 6–7).
12. **Automatable by construction (`ASSR-06`).** Every control — query field, each filter, sort,
    submit, each chip, each result row, each no-results recovery action — exposes a stable,
    committed accessible **role + name** from a single exported copy map, so `23-assurance` can drive
    `UAT-SRCH-02` and `UAT-SRCH-04` by accessible name rather than by CSS selector. A test asserts
    the copy map is exhaustive for the controls rendered.
13. **URL state** — every filter, the sort and the page live in the URL alongside `mode=advanced`,
    so the PRD §32.1 stable search URL reproduces a filtered search and back/forward restores it with
    no duplicate write or charge (PRD §41.1; sub-PRD **Q-FIND-4**'s caveat as recorded in `FIND-03`).
14. **Committed render fixtures** under `advanced/__fixtures__/`: a filtered result set, a mixed
    current/future result set for `UAT-SRCH-02`, one fixture per no-results reason, and a degraded
    response — all synthetic, all validated against the generated response type in the tests
    (PRD §45.1 item 6).

## Acceptance checklist (classified)

- [ ] `[machine]` **Registration by file only**: adding `advanced/mode.tsx` registers the Advanced
      mode and the Simple/Advanced toggle option with **zero** diff to `FIND-03`'s files or any shell
      file (sub-PRD **D7**; breakdown plan **A1**)
- [ ] `[fixture]` **All seven PRD §32.1 advanced filters** are present, labelled, keyboard-operable
      and serialised into the PRD §34.2 request — asserted against a literal filter list transcribed
      from PRD §32.1 (`SRCH-002`)
- [ ] `[machine]` **`UAT-SRCH-04` mechanics**: an invalid ABN produces an inline field error plus an
      error-summary entry and issues **zero** HTTP requests; a valid ABN issues exactly one; a
      server-side `400 INVALID_ABN` is surfaced inline on the field (PRD §32.1, §34.9; `UAT-SRCH-04`)
- [ ] `[fixture]` **`UAT-SRCH-02` separation**: with the default status set, the mixed fixture shows
      no future material; with future statuses explicitly selected, future results appear in a
      visibly labelled, separated group stating they are not current law (PRD §6.5, §6.7;
      `UAT-SRCH-02`)
- [ ] `[fixture]` **Five distinct no-results states**: each committed fixture renders its own
      explanation and its own recovery action per deliverable 8's table; no two are identical; the
      "removed by hard filters" state names the filters and never relaxes one automatically
      (PRD §32.1; sub-PRD **D5**)
- [ ] `[machine]` **No client-side ranking**: a source scan of this feature finds no array sort,
      re-rank, re-filter or dedupe of `results`; changing sort issues a new request and the rendered
      order always equals the payload order (PRD §36.3; `SRCH-004`; sub-PRD **D14**)
- [ ] `[machine]` **Filters are never softened locally**: no code path removes, widens or defaults a
      filter on the customer's behalf after a zero-result response (PRD §36.2; `SRCH-002`)
- [ ] `[machine]` **Chips reflect `applied_filters`**, and a requested-but-not-applied filter is
      stated explicitly rather than shown as applied (PRD §34.2)
- [ ] `[machine]` **Selection carries no free text**: the `SearchSelection` type cannot express the
      query or snippet text — a type-level test proves adding such a property fails to compile; a
      runtime test proves the selection object contains only stable identifiers and public metadata
      (PRD §33.1 step 6; sub-PRD **D10**)
- [ ] `[machine]` **No writes**: a source scan finds no mutating API call in this feature — no POST,
      PUT, PATCH or DELETE other than the read-only `POST /v1/search`; no record, watchlist, comment
      or export endpoint is referenced (PRD §16.2; breakdown plan §4.2)
- [ ] `[machine]` **Extension surface**: `public.ts` exports exactly `useSearchSelection`,
      `SearchSelection` and `registerSearchResultAction`; a registered throw-away action renders in
      the toolbar and row slots and receives a context containing only stable identifiers
      (sub-PRD **D10**; enables `RCRD-09`, `WTCH-07`)
- [ ] `[machine]` **Works with generation disabled**: with the shell status reporting generation
      unavailable and the funding ledger exhausted, the filtered search runs and renders; nothing on
      this screen depends on generation (PRD §8.2, §16.2, §26; `SRCH-001`, `UAT-ANS-08`)
- [ ] `[machine]` **Accessibility**: `RUNT-06`'s `packages/ui/test/a11y.ts` reports **zero** WCAG 2.2
      AA violations at **360 px, 768 px and 1280 px** for the populated, mixed current/future, each
      no-results, degraded, error and loading states (PRD §13.1, §41.1)
- [ ] `[machine]` **Keyboard and structure**: every filter and the multi-select of results are fully
      keyboard-operable with visible focus; exactly one programmatic page heading; every field
      labelled; an error summary listing all invalid fields; a live region announcing result count,
      applied filters and state changes; no status conveyed by colour alone (PRD §41.1)
- [ ] `[machine]` **Stable accessible names**: the committed copy map covers every rendered control
      and each control's accessible name matches it — the property `ASSR-06` depends on (PRD §41.1)
- [ ] `[machine]` **URL round-trip**: filters, sort, page and mode survive copy-URL → reload →
      back/forward with identical rendered state and no duplicate request per navigation; the query
      appears in no page title, analytics or error-telemetry stub (PRD §41.1, §32.1)
- [ ] `[machine]` **Organisation scoping**: `RUNT-05`'s `org-scope-conformance` harness passes;
      switching organisation clears filters, results and selection (PRD §31.1; `AUTH-002`)
- [ ] `[machine]` **Dates**: displayed as `3 Aug 2026` via `packages/ui`; sent as ISO 8601 (PRD §41.1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[human]` `UAT-SRCH-02` — searching current law with an `ENACTED_NOT_IN_FORCE` source present
      shows future material absent by default or visibly separated when requested, judged on the
      running screen at Gate 2 (PRD §41.2)
- [ ] `[human]` `UAT-SRCH-04` — an invalid ABN in the advanced employer filter shows an inline
      checksum error with no search or quota event, judged at Gate 2 (PRD §41.2)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs `SRCH-002`, `SRCH-004` and UAT ids
      `UAT-SRCH-02`, `UAT-SRCH-04`; user-visible change and non-goals; tenant/PII impact ("selection
      carries stable IDs only; ABN is public business data, PRD §32.2"); cost impact ("zero — search
      consumes no generation credit"); accessibility evidence; rollback path; known gaps (the
      `RCRD-09`/`WTCH-07` actions are unregistered until those tickets land)
- [ ] `cargo test --workspace` and `uv run pytest` not applicable — no Rust and no Python here
      (PRD §45.3).

## Test plan

All steps run offline against committed fixtures; no network, no API process, no model provider.
Harness: the repository's component test runner as configured by `FND-01`/`RUNT-05`; copy the
construction pattern from `FIND-03`'s `simple/__tests__/**` so the two modes' tests stay recognisably
the same, and use `RUNT-06`'s `packages/ui/test/a11y.ts` for the accessibility pass.

1. **Registration** — `__tests__/mode.test.tsx`: mount the feature with both mode modules present;
   assert `?mode=advanced` resolves here and the toggle shows both; assert (by `git status
   --porcelain` in review) that no `FIND-03` file changed.
2. **Filters** — `__tests__/filters.test.tsx`: for each of the seven §32.1 filters, set a value and
   assert the serialised request body; assert clearing re-issues; assert every filter is reachable by
   keyboard and labelled.
3. **ABN** — `__tests__/abn.test.tsx`: a table of valid and invalid synthetic ABNs (including
   transposed digits and wrong length); assert inline error, error-summary entry, zero requests for
   invalid input, exactly one request for valid input, and inline surfacing of a stubbed
   `400 INVALID_ABN`.
4. **Future material** — `__tests__/future-separation.test.tsx`: render the mixed fixture with the
   default status set (assert absence) and with future statuses selected (assert a labelled,
   separated group whose heading states it is not current law).
5. **No-results taxonomy** — `__tests__/no-results.test.tsx`: one case per reason fixture; assert
   distinct copy and the deliverable-8 recovery action; assert no code path computes a reason from
   `results.length`.
6. **Ordering** — `__tests__/ordering.test.tsx`: assert rendered order equals payload order for a
   fixture whose payload order is deliberately not any natural sort; assert a sort change issues a
   new request; assert (source scan) no local sort/filter/dedupe of results exists.
7. **Selection and extension** — `__tests__/selection.test.tsx` and
   `__tests__/extension-point.test.tsx`: type-level test on `SearchSelection`; register a throw-away
   action and assert it renders in both slots with a stable-identifier-only context; assert no
   mutating request is issued by any interaction.
8. **URL, history and organisation** — `__tests__/url-state.test.tsx`,
   `__tests__/org-scope.test.tsx`: as in `FIND-03`, extended to filters and sort.
9. **Accessibility** — `__tests__/a11y.test.tsx`: `a11y.ts` over every state at 360/768/1280 px;
   assert zero violations and that no filter or result row becomes unreachable at 360 px
   (PRD §41.1 — *"without hiding legal status, citations, primary actions or error recovery"*).
10. **Suite green** — `pnpm lint`, `pnpm typecheck`, `pnpm test` from the repository root.
11. **Reviewer focus**: confirm no path relaxes or drops a filter automatically after an empty
    result; confirm the ABN check genuinely prevents the request (not merely marks the field);
    confirm the future/current separation cannot be defeated by a sort or a chip removal; confirm the
    selection type cannot carry free text even through an optional or index-signature property;
    confirm nothing in this feature performs a write; confirm the accessible-name map is exhaustive,
    since `ASSR-06` will depend on it.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/14-search-product/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *`FIND-03`'s area files need a change* (the mode registry cannot express a mode-specific nav
     state; `no-results.tsx` cannot take a recovery action; `result-actions.ts`' context is too
     narrow) → raise a docs PR against
     `docs/prd/14-search-product/tickets/FIND-03-simple-search-screen.md` **and** this ticket,
     `--sync`, then implement. `FIND-03` is merged, so this is an ordinary ticket amendment — but it
     is still a spec change, not a silent edit of a merged ticket's files.
   - *A filter in PRD §32.1 has no field in the generated request contract* (most likely `employer`,
     authority level, or the award/agreement identifier) → sub-PRD **Q-FIND-7**/**Q-FIND-2**: docs PR
     against `docs/prd/00-foundation/tickets/FND-04-*.md` (schema) and `FND-03` (enum members), plus
     `FIND-01` if the route must map it, recorded in this module's README. **Never** encode a filter
     as free text appended to the query string — that would silently convert a hard filter into a
     ranking hint, which PRD §36.2/§36.3 forbid.
   - *A zero-result search "looks broken" and relaxing a filter would look better* → PRD §32.1
     requires the five states precisely so an empty result is explained rather than avoided. Automatic
     relaxation is a product change (PRD §45.5) needing founder approval; record any pressure for it
     in `docs/prd/14-search-product/README.md`.
   - *An ABN checksum helper appears in `packages/domain` or `packages/contracts`* → switch to it and
     delete the local copy in the same PR, recording the change here. Two implementations of one
     checksum is exactly the duplication breakdown plan §4.2 exists to prevent.
   - *`RCRD-09` or `WTCH-07` asks for a wider context than stable identifiers* (the query text, the
     snippet, the full result row) → refuse and point at PRD §33.1 step 6 (*"writes only the selected
     stable IDs and user-authored anonymous notes"*). If a genuine need exists, it is a writeback to
     `docs/prd/14-search-product/README.md` **and** `docs/prd/breakdown-plan.md` §4.2 before any code
     — copying source text into a tenant record changes the licensing and PII surface of another
     module.
3. **Falsified protocol.** If the five no-results causes turn out to be underivable server-side —
   i.e. `FIND-01` cannot distinguish them — then PRD §32.1's requirement is unmet and inferring them
   in the browser is **not** the fallback (the browser cannot see candidate counts, coverage or
   freshness). Stop, escalate for re-review, and write back to `FIND-01`, this module's README and,
   if the internal contract is the limitation, `docs/prd/11-retrieval-engine/tickets/RETR-01-*.md`
   via retrieval sub-PRD **D8**'s docs-PR path.
