---
id: WTCH-07
title: Watchlist screens and create-watch-from-source
module: 16-monitor-alerts
lane: 16-monitor-alerts
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-05, WTCH-01, FIND-05]
blocks: [WTCH-08]
---

# WTCH-07 — Watchlist screens and create-watch-from-source

Implements PRD §32.7, §33.1 and §41.1, requirement **MON-001** (epic `E25-MONITOR`).
No ADR — the decision is already made in PRD §31.2 (the `/monitor/watchlists` route and its
first-use state), PRD §32.7 (the watchlist fields) and PRD §33.1 step 7 (*"User may create a watch
target from the search or source"*); this is build ticket 7 of 8 against it.
Parent sub-PRD: [16-monitor-alerts README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RUNT-05 — Web app shell: navigation, org switcher, status badges](../../03-app-runtime/tickets/RUNT-05-web-app-shell-navigation-org-switcher-status-badges.md), [WTCH-01 — Watchlist and watch-target routes with typed normalisation](WTCH-01-watchlist-and-watch-target-routes-with-typed-normalisation.md), [FIND-05 — Document / version / node timeline screens](../../14-search-product/tickets/FIND-05-document-version-node-timeline-screens.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §31.2 fixes the route and PRD §32.7 the fields; `WTCH-01` already publishes the API. This is one
feature area against them.

## Background + basis

**PRD §31.2 — the route row, verbatim:**

> | `/monitor/watchlists` | Watchlists | Researcher/Admin/Owner | Create/edit targets | **Suggested
> watch from recently cited sources** |

**PRD §31.1 — the shell and the nav slot:** the desktop navigation order is
*"1. organisation switcher; 2. Home; 3. Search; 4. Ask; 5. Coverage; 6. Compare; 7. Research Records;
**8. Monitor**; 9. Developer …; 10. Settings; 11. Help/status/user menu"*, and
*"Switching organisation clears unsaved forms and all organisation-scoped client caches."*

**PRD §32.7 — the fields the screen edits, verbatim:**

> A watchlist has name, targets, event types, jurisdictions, severity threshold, delivery mode
> (`IMMEDIATE` or `DAILY_DIGEST`), channels and active state.

**PRD §33.1 step 7 — the entry point breakdown-plan §4.2 assigns to this ticket:**

> 1. User enters query and legal context. … 5. User opens a source version or selects results.
> 6. User may create a Research Record using selected authorities; this writes only the selected
> stable IDs and user-authored anonymous notes. **7. User may create a watch target from the search
> or source.**

breakdown-plan §4.2 makes the ownership explicit:

> | "Create watch target from search/source" | `16` (`WTCH-07`) | would put watch writes in `14` |
> §33.1 step 7 |

So the *screen* that writes a watch lives here, in `apps/web/src/features/monitor/**`, and
`14-search-product` reaches it by link — exactly the shape `RCRD-09` uses for "create record from
search selection". Which component renders the link in the PRD §32.1 results toolbar
(*"copy stable search URL, save search/watch"*) is sub-PRD open question **Q-WTCH-6**, owned by
`14-search-product`; this ticket publishes the target and is complete without it.

**PRD §41.1 — universal UI acceptance, which every screen in this ticket must pass:**

> - works at 360 px, 768 px and 1280 px widths without hiding legal status, citations, primary
>   actions or error recovery;
> - complete keyboard operation with visible focus and logical order;
> - one programmatic page heading, labelled fields, error summaries and live regions for asynchronous
>   status;
> - colour is never the only status signal;
> - dates display unambiguously as `3 Aug 2026` in UI while APIs use ISO format;
> - jurisdiction, legal status and source freshness use text plus badge/icon;
> - destructive/security-sensitive actions name exact effect and recovery;
> - request/job/correction IDs are copyable from errors and support panels;
> - **customer research content is not placed in URL query strings, analytics, browser error
>   telemetry or page titles;**
> - refresh/back/forward/reconnect does not duplicate writes or charges.

The ninth bullet is load-bearing for the deep link in deliverable 5: the link may carry **stable
identifiers**, never a customer question, note or answer.

**PRD §13.1:** WCAG 2.2 AA is the release target and the UI is English.

**Requirement `MON-001`** (PRD §30.2): *"A watchlist can target documents, nodes, ABNs, topics, saved
searches and record authorities | `/monitor/watchlists` | watchlist endpoints | App | Target
normalisation and tenant isolation pass"*. The API half is `WTCH-01`; **this ticket is its primary
route/surface**.

**The API already exists.** `WTCH-01` (merged before this ticket) publishes `POST/GET/PATCH/DELETE
/v1/watchlists`, the `targets` sub-resource with all six `WatchTargetKind` values and their request
shapes, `POST .../targets/{id}/refresh`, ETag/`If-Match` concurrency and the §34.9 error mapping.
This ticket calls the generated client from `packages/contracts` (`FND-04`); it re-implements no
validation rule beyond immediate field feedback.

**The web registration contract** (`RUNT-05`, "The A1 web registration contract", normative here):
every immediate child directory of `apps/web/src/features/` is a feature area discovered by
`import.meta.glob('../features/*/feature.tsx', { eager: true })` — *"a **pattern, not a list**:
adding a feature directory changes no tracked file"*; the area MUST contain `feature.tsx` with a
default export of `FeatureModule` (`id` equal to the directory name, `routes[]`, optional `nav` that
**claims** one of the eleven PRD §31.1 slots, and `onOrganizationChange`); a slot outside the tuple or
claimed twice fails the build; two features registering the same `path` fail the build; every cache
key MUST be produced by the shell's `orgScopedKey(...)` helper; and *"Adding, renaming or removing a
feature area produces **zero** diff outside that area's own directory."*

**Why this ticket owns `feature.tsx` (sub-PRD D3).** breakdown-plan §4 gives this module
`apps/web/src/features/monitor/**` — **one** feature area under that contract — while §5.17 splits its
screens across `WTCH-07` (watchlists) and `WTCH-08` (alerts). The area entry must belong to exactly
one ticket, and `WTCH-08` is `blocked_by` `WTCH-07` (breakdown-plan §6.2: `WTCH-07 --> WTCH-08`), so
this ticket owns `feature.tsx` and composes screens by scanning `./*/routes.tsx`. `WTCH-08` then adds
`alerts/routes.tsx` with zero diff outside its own directory.

**Accepted caveats carried forward:**

- **No declared `blocked_by` edge to `RUNT-06`** (`packages/ui`), although PRD §41.1's accessible
  primitives and PRD §31.3's async states live there (breakdown-plan **A6**). This is sub-PRD open
  question **Q-WTCH-9**. `RUNT-06` is wave 1 of `03-app-runtime`, the same wave as this ticket's
  declared blocker `RUNT-05`, so in the global schedule it lands first; if it has not, **stop and
  raise the missing edge** rather than building a second component set (Feedback obligation 3).
- **These screens are not job-driven.** PRD §31.3's ten mandatory async states apply to job-driven
  screens; watchlist CRUD is synchronous request/response, so the applicable subset is loading,
  empty/first-use, error and success. That reading is stated here rather than assumed, and the
  screens still use `packages/ui`'s state components so the vocabulary is shared.
- **Alerts are not this ticket.** `/monitor/alerts` and `/monitor/alerts/:alertId` are `WTCH-08`.

## Goal

Produce the `monitor` feature area's entry and its watchlist screens: `feature.tsx` claiming the
PRD §31.1 `MONITOR` nav slot and composing screens by directory scan, plus
`apps/web/src/features/monitor/watchlists/**` implementing `/monitor/watchlists` — list, create,
edit and delete watchlists with all eight PRD §32.7 fields, add and remove all six `MON-001` target
kinds, the PRD §31.2 "suggested watch from recently cited sources" first-use state, and a
`/monitor/watchlists/new` deep-link entry point that turns a search result or source page into a
watch target using stable identifiers only. Completion is mechanically checkable: the six target
kinds can each be created from the UI against `WTCH-01`'s API, the deep link creates the right target
from its parameters alone, the screens pass the PRD §41.1 universal checks and WCAG 2.2 AA at three
widths, no customer research content reaches a URL or a page title, and adding the area diffs no file
owned by `03-app-runtime`.

## Non-goals

- **No alert screens** — `WTCH-08` (`features/monitor/alerts/**`), which is `blocked_by` this ticket.
- **No API routes, validation rules or normalisation** — `WTCH-01`
  (`apps/api/src/routes/watchlists/**`). The screen renders server errors; it never re-decides them.
- **No delivery configuration UI** — webhook subscriptions are `/developer/webhooks`
  (`20-developer-platform`/`PLTF-07`, `blocked_by` `WTCH-05`); the watchlist screen selects
  **channels**, not endpoints.
- **No search execution, result rendering, document, version or node screens** — `14-search-product`
  (`FIND-01` … `FIND-05`). This ticket consumes a deep link; it renders no search UI.
- **No record screens or the record Watch tab** — `17-records-collab`/`RCRD-08`, which is
  `blocked_by` `WTCH-01` for exactly that reason.
- **No shell, navigation chrome, organisation switcher, status badges or routing library choice** —
  `03-app-runtime`/`RUNT-05`. This ticket **claims** the `MONITOR` slot; it adds none.
- **No shared UI primitives, async-state components or evidence panel** — `03-app-runtime`/`RUNT-06`
  (`packages/ui`, breakdown-plan **A6**). Duplicating them here is forbidden.
- **No generated summaries or model calls** — sub-PRD **D6**.
- **No analytics or telemetry integration** — PRD §41.1 forbids research content in telemetry and no
  PRD section specifies an analytics surface for the MVP.

## File-scope (write-owns)

- `apps/web/src/features/monitor/feature.tsx` — the feature-area entry (sub-PRD **D3**).
- `apps/web/src/features/monitor/watchlists/**` — screens, components, hooks, fixtures and tests
  under `apps/web/src/features/monitor/watchlists/__tests__/**`.

Does not touch:

- `apps/web/src/features/monitor/alerts/**` — `WTCH-08` (adds `alerts/routes.tsx`, discovered by
  this ticket's scan; this ticket names it nowhere in code).
- `apps/web/src/{app,shell,lib}/**`, `apps/web/src/features/home/**`,
  `apps/web/{index.html,vite.config.ts,package.json,tsconfig.json}` — `03-app-runtime`/`RUNT-05`.
- `apps/web/src/features/{search,sources}/**` — `14-search-product`;
  `features/{ask,answers,coverage,compare}/**` — `15-answer-product`; `features/records/**` —
  `17-records-collab`; `features/{auth,settings}/**` — `13-identity-surface`;
  `features/{developer,usage}/**` — `20-developer-platform`; `features/legal/**`,
  `public-site/**` — `24-launch`.
- `packages/ui/**` — `RUNT-06`; `packages/contracts/**` — `FND-04`.
- `apps/api/**`, `apps/worker/**` — this module's other tickets and other modules.
- `tests/e2e/**` — `23-assurance` (`ASSR-06`/`ASSR-07`), which is `blocked_by` `WTCH-08`.

**Serial-safety analysis.** First decomposition — breakdown-plan §1 records `phase: 1`, nothing
merged and nothing in flight. `apps/web/src/features/monitor/` does not exist before this ticket.
breakdown-plan §4 gives the whole `features/monitor/**` subtree to this module and §5.17 splits it
between `WTCH-07` (watchlists) and `WTCH-08` (alerts). Under `RUNT-05`'s contract the directory is a
**single** feature area, so its `feature.tsx` must have exactly one owner; sub-PRD **D3** assigns it
here because `WTCH-08` is `blocked_by` this ticket (breakdown-plan §6.2) and the two are therefore
never concurrent. Because `feature.tsx` composes screens by scanning `./*/routes.tsx`, `WTCH-08` adds
its screens with zero diff to this ticket's files. Sibling feature areas are separate directories
discovered by the shell's glob, so no file is shared with `14`, `15`, `17` or any other module —
`RUNT-05` contract item 6 guarantees adding this area diffs nothing outside it. This ticket's
concurrent round-2 sibling is `WTCH-03` (`apps/api` + `apps/worker`).

## Deliverables

1. **`feature.tsx` (sub-PRD D3)** — default-exported `FeatureModule` with:
   - `id: 'monitor'` (equal to the directory name, per `RUNT-05` contract item 2);
   - `nav: { slot: 'MONITOR', label: 'Monitor', to: '/monitor/watchlists', visibleWhen: <the
     feature-supplied predicate for Researcher/Admin/Owner> }` — claiming exactly one of the eleven
     PRD §31.1 slots (`RUNT-05` contract item 3);
   - `routes`: composed from `import.meta.glob('./*/routes.tsx', { eager: true })`, so a screen
     directory registers itself. **No screen directory is named in this file**, which is what lets
     `WTCH-08` add `alerts/` without touching it;
   - `onOrganizationChange`: drops every organisation-scoped cache the area holds, and every cache key
     it creates is produced by the shell's `orgScopedKey(...)` (`RUNT-05` contract item 5; PRD §31.1).
2. **`watchlists/routes.tsx`** — registers `/monitor/watchlists` (the list/manage screen) and
   `/monitor/watchlists/new` (the create/deep-link screen). A duplicate path fails the build
   (`RUNT-05` contract item 4).
3. **Watchlist list and management screen** (`/monitor/watchlists`, PRD §31.2 roles
   Researcher/Admin/Owner):
   - a table/list of watchlists showing name, active state, delivery mode, channels, target count,
     event types and jurisdictions — each as **text plus badge**, never colour alone (PRD §41.1);
   - create, rename, activate/deactivate, edit and delete actions, with the delete confirmation
     naming the exact effect and its recovery ("alert history is retained; deliveries stop") per
     PRD §41.1's destructive-action rule;
   - inline editing of the eight PRD §32.7 fields: name, targets, event types (multi-select over the
     eight PRD §8.8 change types), jurisdictions, severity threshold, delivery mode
     (`IMMEDIATE`/`DAILY_DIGEST`), channels (in-app/email/webhook) and active state. Enum options come
     from the generated `packages/contracts` types — **never a hand-written option list**;
   - concurrency: the screen holds the `ETag` from the read and sends `If-Match`; a
     `409 CONCURRENT_MODIFICATION` renders a reload-and-retry path rather than a silent overwrite
     (PRD §16.2, §34.1; `UAT-REC-02`'s discipline applied to this surface);
   - the copyable `request_id` from any error (PRD §41.1, §16.1).
4. **Target management (all six `MON-001` kinds)** — one add-target control per kind, each with the
   field set `WTCH-01` deliverable 4 publishes:
   `DOCUMENT` / `NODE` (a stable identifier, pasted or arrived by deep link),
   `EMPLOYER_ABN` (ABN with **inline checksum feedback before submit**, and the server's
   `400 INVALID_ABN` surfaced inline — PRD §32.1's discipline and `UAT-SRCH-04`'s expectation that an
   invalid ABN produces an inline error and no quota event),
   `JURISDICTION_TOPIC`, `SAVED_SEARCH` (rendered from its descriptor: query, filters, `legal_as_at`,
   jurisdictions) and `RECORD_AUTHORITY` (shown grouped by its `source_record_id` with the
   `.../refresh` action and an explanation that new answers do not widen the watch automatically —
   `WTCH-01` deliverable 5). Removing a target names its effect.
5. **`/monitor/watchlists/new` — the create-watch-from-source deep link (PRD §33.1 step 7;
   breakdown-plan §4.2).** A **typed, published** query contract, documented in
   `apps/web/src/features/monitor/watchlists/DEEPLINK.md` so `14-search-product` can link to it
   without reading code:

   | Parameter | Meaning | Constraint |
   |---|---|---|
   | `target_kind` | one of the six `WatchTargetKind` values | required |
   | `document_id` / `node_id` | the stable corpus identifier | required for `DOCUMENT` / `NODE` |
   | `abn` | digits or spaced ABN | required for `EMPLOYER_ABN` |
   | `jurisdiction`, `topic` | enum value and a short label | required for `JURISDICTION_TOPIC` |
   | `saved_search` | the canonical search descriptor, base64url of its JSON | required for `SAVED_SEARCH` |
   | `research_record_id` | the record whose authorities to watch | required for `RECORD_AUTHORITY` |
   | `label` | a display hint for the confirmation screen | optional |
   | `return_to` | a **relative in-app path** to return to | optional; an absolute or external URL is rejected |

   The screen pre-fills a create/attach form (new watchlist, or add to an existing one), shows
   exactly what will be written, and writes only on explicit confirmation. **PRD §41.1's ninth
   bullet is enforced here**: only stable identifiers and enum values may appear in the URL — the
   customer's question, notes, answer text and any record title must not, and `return_to` is
   validated as an internal path to prevent an open redirect. A missing or malformed parameter
   renders a named error with recovery, never a partially created watch.
6. **First-use state (PRD §31.2)** — *"Suggested watch from recently cited sources"*: with no
   watchlists, the screen offers suggestions derived from the tenant's **recently cited authorities**
   through the read APIs already available to the web client, each as a one-click "watch this
   source". If the underlying read is unavailable, the empty state degrades to an explanation plus the
   manual add path — it never renders an empty list with no guidance (PRD §31.3's principle: *"A
   spinner without state or recovery guidance is not acceptable"*).
7. **PRD §41.1 conformance, built in** — one programmatic `h1` per screen; labelled fields with
   error summaries; live regions for async status; full keyboard operation with visible focus; layout
   at 360/768/1280 px with no hidden primary action or legal status; dates rendered as `3 Aug 2026`
   while the API uses ISO (a shared formatter from `packages/ui`, not a local one); status conveyed by
   text plus icon. Components come from `packages/ui` (`RUNT-06`, breakdown-plan **A6**).
8. **Organisation scoping** — every query cache key is built with `orgScopedKey(...)`;
   `onOrganizationChange` clears watchlist caches and any unsaved form state, asserted with
   `RUNT-05`'s exported `apps/web/test/org-scope-conformance.ts` helper (PRD §31.1; `AUTH-002`).
9. **No customer research content anywhere in this surface (PRD §8.8, §41.1)** — not in a URL, not
   in a page title, not in a cache key, not in an error message. A test asserts that navigating every
   screen and triggering every error leaves no research string in `document.title` or
   `location.search`, using a canary fixture.
10. **Fixtures and a client seam** — the screens talk to a `WatchlistApi` port whose test
    implementation replays committed fixtures under
    `apps/web/src/features/monitor/watchlists/__tests__/fixtures/` (`watchlists.json`,
    `targets.json`, `errors.json` covering `INVALID_ABN`, `CONCURRENT_MODIFICATION` and
    `RESOURCE_NOT_FOUND`). **No test performs a network request**; the generated client is used in
    production only.

## Acceptance checklist (classified)

- [ ] `[machine]` **MON-001 through the UI**: each of the six `WatchTargetKind` values can be created
      and removed from `/monitor/watchlists`, and the request body matches `WTCH-01` deliverable 4's
      shape for that kind — asserted against the fixture client (PRD §8.8; `MON-001`)
- [ ] `[machine]` **PRD §32.7 field coverage**: the create/edit form exposes name, targets, event
      types, jurisdictions, severity threshold, delivery mode, channels and active state; a literal
      expectation list fails if one is dropped
- [ ] `[machine]` **Deep link (PRD §33.1 step 7; breakdown-plan §4.2)**: for each target kind,
      navigating `/monitor/watchlists/new?...` with the deliverable-5 parameters pre-fills the form
      and, on confirmation, writes exactly that target; a malformed parameter renders a named error
      and writes nothing; an absolute or external `return_to` is rejected
- [ ] `[machine]` **PRD §41.1, no research content in URLs or titles**: with a canary question,
      note and answer present in the fixture data, no screen or error path places any of them in
      `location.search`, `document.title` or a cache key (PRD §41.1 ninth bullet; PRD §8.8)
- [ ] `[machine]` Inline ABN validation: an invalid checksum is reported inline before submit and the
      server's `400 INVALID_ABN` is surfaced inline; neither path leaves a partially created target
      (PRD §34.9; `UAT-SRCH-04`'s discipline)
- [ ] `[machine]` Concurrency: an edit against a stale `ETag` renders the
      `409 CONCURRENT_MODIFICATION` reload path and does not overwrite (PRD §16.2, §34.1)
- [ ] `[machine]` **First-use state (PRD §31.2)**: with zero watchlists the screen shows suggested
      watches from recently cited sources, and degrades to an explanation plus the manual path when
      the suggestion source is unavailable — never an empty list with no guidance (PRD §31.3)
- [ ] `[machine]` **Organisation switch (PRD §31.1)**: `onOrganizationChange` clears every
      organisation-scoped cache and unsaved form state, asserted with `RUNT-05`'s
      `org-scope-conformance.ts` helper (`AUTH-002`)
- [ ] `[machine]` **A1 web conformance (sub-PRD D3)**: the area registers by directory convention
      with **zero** diff to any file outside `apps/web/src/features/monitor/`, the `MONITOR` slot is
      claimed exactly once, and adding a second `routes.tsx` directory (a throw-away one at test
      time) is picked up without editing `feature.tsx` — the property `WTCH-08` depends on
      (`RUNT-05` contract items 1–4, 6)
- [ ] `[machine]` Enum options come from the generated `packages/contracts` types — a scan finds no
      hand-written change-type, channel, severity or delivery-mode list in this scope (PRD §20.1,
      `FND-03`)
- [ ] `[machine]` No duplicated `packages/ui` primitive: a scan finds no locally defined button,
      dialog, async-state or evidence component in this scope (breakdown-plan **A6**)
- [ ] `[human]` **PRD §41.1 universal UI acceptance**: 360/768/1280 px without hiding legal status or
      primary actions; complete keyboard operation with visible focus and logical order; one
      programmatic heading; colour never the only signal; dates as `3 Aug 2026`; destructive actions
      naming effect and recovery; copyable `request_id`. Irreducibly human judgement; the automated
      accessibility sweep is `23-assurance`/`ASSR-07` (PRD §41.1, §13.1)
- [ ] `[human]` Gate 2 founder smoke test: create a watch from a source page and see it appear on
      `/monitor/watchlists` (PRD §41.3 step 6's change narrative; CLAUDE.md Gate 2). **Not required to
      merge**
- [ ] `[machine]` Automated accessibility smoke within this ticket: axe-core (or the equivalent the
      repository standardises on) reports no violation on both screens at the three widths — the
      machine-checkable subset of WCAG 2.2 AA; the full suite is `ASSR-07` (PRD §13.1, §41.1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3)
- [ ] `[fixture]` **Declared absent** — this ticket replays no recorded change or delivery.
      `UAT-MON-01`'s recorded change replay is `WTCH-02`/`WTCH-03`; `UAT-MON-02`'s delivery replay is
      `WTCH-05`. The committed API fixtures here are synthetic responses, which breakdown-plan §1.1
      does not classify as `[fixture]`
- [ ] `[machine]` Payload minimisation cross-check (PRD §8.8): the module-wide assertion that alert
      and watch payloads carry no complete customer question or answer holds on this surface too — no
      screen sends or renders one, asserted by the canary test above
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable (PRD §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement **MON-001** and epic `E25-MONITOR`;
      user-visible change and non-goals; schema/API/event compatibility impact (none — consumes
      `WTCH-01`'s published operations through the generated client); tenant/PII/security impact (no
      research content in URLs, titles, caches or telemetry; `return_to` validated against open
      redirect; organisation-scoped caches cleared on switch); source/licence impact (official links
      only); cost/memory/latency impact (no generation, no search execution); rollback path (revert
      the feature directory; the `MONITOR` nav slot is then unclaimed and the API remains);
      known gaps (**Q-WTCH-6** the search-toolbar affordance; **Q-WTCH-9** no declared `RUNT-06` edge)

## Test plan

Reviewer steps. Every step is offline: fixture client, no network, no API server, no model provider.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter <the apps/web package name>`; suites under
   `apps/web/src/features/monitor/watchlists/__tests__/`.
3. **Harness.** Copy the construction pattern `RUNT-05` established for `features/home/**`: render
   the feature through the shell's test harness with an injected `WatchlistApi` fixture client and
   the `orgScopedKey` helper. Use the repository's standard component-testing library; no browser
   automation is required for this ticket (that is `ASSR-06`/`ASSR-07`).
4. **Six-kind matrix.** For each `WatchTargetKind`, drive the add-target control and assert the
   request body against `WTCH-01` deliverable 4's table. A mismatch here means the UI and the API
   disagree about normalisation input — the highest-value defect on this surface.
5. **Deep link.** For each kind, mount `/monitor/watchlists/new` with the deliverable-5 parameters and
   assert pre-fill, confirmation-gated write and the exact request. Then test a malformed parameter,
   an unknown `target_kind`, and `return_to=https://evil.example` (must be rejected).
6. **Canary.** Seed the fixtures with a distinctive question, note and answer string; navigate every
   screen and trigger every error; assert none of the strings appears in `location.search`,
   `document.title` or any cache key. Without a canary the PRD §41.1 assertion is vacuous.
7. **Concurrency.** Serve a `409 CONCURRENT_MODIFICATION` from the fixture client; assert the reload
   path renders and no second write is issued.
8. **First use.** Render with zero watchlists and with the suggestion source failing; assert both
   states show guidance and a manual path.
9. **Organisation switch.** Run `RUNT-05`'s `org-scope-conformance.ts` helper against the feature.
10. **A1 conformance.** Add a throw-away `apps/web/src/features/monitor/zz-temp/routes.tsx` at test
    time; assert its route is registered without editing `feature.tsx`; remove it; assert
    `git status --porcelain` is clean. Then confirm the `MONITOR` slot appears exactly once in the
    shell's nav registry.
11. **Accessibility smoke.** Run the axe-core sweep at 360/768/1280 px on both screens; zero
    violations.
12. **Scans.** Grep this scope for hand-written enum option lists, for locally defined UI primitives,
    and for any `fetch`/`axios` call outside the injected client — there must be none.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket file** (docs PR →
merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/16-monitor-alerts/README.md` (version +0.1 with a changelog line) **before** changing code.
Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**Foreseeable frictions, each with its exact writeback target:**

1. **`14-search-product` cannot render a link into this screen**, or wants a shared component
   instead (**Q-WTCH-6**). → The published deep link (`DEEPLINK.md`) is the contract; record any
   agreed change in **this ticket's deliverable 5** and in
   `docs/prd/16-monitor-alerts/README.md` Q-WTCH-6. If a shared component is genuinely required, it
   belongs in `packages/ui` (breakdown-plan **A6**) and the writeback target is
   `docs/prd/breakdown-plan.md` §4.2 plus a `RUNT-06` ticket — **never** a watch write inside
   `apps/web/src/features/search/**`, which breakdown-plan §4.2 exists to prevent.
2. **`RUNT-05`'s single-level feature glob makes the sub-directory scan impossible** (sub-PRD
   **D3**). → Record it in `docs/prd/16-monitor-alerts/README.md` **D3** and fall back to the ordered
   alternative: this ticket registers the watchlist routes in `feature.tsx` and `WTCH-08` appends its
   two alert routes to the same file, which is safe only because `WTCH-08` is `blocked_by` this
   ticket. If that changes the module's lane profile, raise it in
   `docs/prd/breakdown-plan.md` §7. Never let two concurrent tickets write `feature.tsx`.
3. **`RUNT-06` (`packages/ui`) is not merged when this ticket runs** (**Q-WTCH-9**). → Stop. Write the
   missing edge into **`docs/prd/breakdown-plan.md` §5.17 and §6.2** (`WTCH-07` `blocked_by` gains
   `RUNT-06`) and update the README's Q-WTCH-9 row. Do **not** build a second component set inside
   this feature — breakdown-plan **A6** exists precisely to stop three surfaces from each growing
   their own primitives.
4. **The PRD §31.2 "suggested watch from recently cited sources" state needs a read this client does
   not have.** → Record the required read in `docs/prd/16-monitor-alerts/README.md`; if it needs a
   new endpoint, that endpoint belongs to `WTCH-01` (this module) or to the module that owns the
   underlying data, and the edge goes into `docs/prd/breakdown-plan.md` §5.17/§6.2. Meanwhile ship
   the documented degraded empty state — **not** an empty list without guidance, which PRD §31.3
   rejects.
5. **A watchlist field cannot be edited because `WTCH-01`'s DTO omits it.** → `WTCH-01` is the API
   owner; raise it against **`WTCH-01`'s deliverable 3** and, if the column is missing, follow that
   ticket's `01-app-data` path. Never write a field into a free-text control or store UI-only state
   that the server does not model.
6. **PRD §41.1 conflicts with a chosen component's behaviour** (for example focus handling in a
   dialog). → PRD §41.1 and PRD §13.1 win; fix or replace the component in `packages/ui` through a
   `RUNT-06` request and record it in `docs/prd/16-monitor-alerts/README.md`. Accessibility is a
   release gate (PRD §26 "English UI, accessibility and responsive requirements pass release
   review"), not a preference.

**Escalation.** breakdown-plan §4.2's assignment of "create watch target from search/source" to this
ticket is a decomposition decision that keeps watch writes out of `14-search-product`, and PRD §41.1's
"customer research content is not placed in URL query strings … or page titles" is a privacy boundary.
If either is falsified — for example if the only workable affordance requires `14` to call the
watchlist API — stop, escalate for re-review, and write back to
`docs/prd/16-monitor-alerts/README.md` and `docs/prd/breakdown-plan.md` §4.2 before any code lands.
Never put a watch write in another module's feature tree, and never place customer content in a URL.
