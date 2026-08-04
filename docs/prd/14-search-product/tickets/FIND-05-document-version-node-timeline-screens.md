---
id: FIND-05
title: Document / version / node timeline screens
module: 14-search-product
lane: 14-search-product
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-05, FIND-02]
blocks: [WTCH-07]
---

# FIND-05 — Document / version / node timeline screens

Implements PRD §31.2 (`/documents/:documentId`, `/document-versions/:versionId`, `/nodes/:nodeId`),
§32.1 (detail panel), §9.2, §9.3, §12.1, §15.3, §13.1 and §41.1 — requirement ID `SRCH-005`, with
`SRCH-003` on the render side; epic `E18-SEARCH-API-UI`.
No ADR — the decision is already made in PRD §31.2 (the three routes and their first-use states),
PRD §15.3 (version/node identity) and breakdown plan **A1**/**A6**; this is build ticket 5 of 6
against it.
Parent sub-PRD: [14-search-product README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RUNT-05 — web app shell](../../03-app-runtime/tickets/RUNT-05-web-app-shell-navigation-org-switcher-status-badges.md),
[FIND-02 — Document, version, node, timeline and relation endpoints](FIND-02-document-version-node-timeline-and-relation-endpoints.md)
(mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against fixed contracts —
`RUNT-05`'s feature-registration contract, `RUNT-06`'s component API and `FIND-02`'s `/v1` endpoints
— not a new subsystem decision.

## Background + basis

**Three routes, three purposes, three first-use states (PRD §31.2, verbatim):**

| Route | Screen | Roles | Main action | Empty/first-use state |
|---|---|---|---|---|
| `/documents/:documentId` | Document | all | Read metadata/current version/timeline | Not applicable; invalid/other-tenant-safe 404 |
| `/document-versions/:versionId` | Document version | all | Read exact historical version | Source unavailable banner if artifact is link-only |
| `/nodes/:nodeId` | Node timeline | all | View provision lineage | Relationship limitations shown |

**This is the surface `SRCH-005` is judged on.** PRD §30.2: *"Source/version pages expose timeline
and relationships without generation"*, primary route *"`/documents/:id`, `/nodes/:id`"*, minimum
acceptance evidence *"Historical stable link survives later release"*. `UAT-SRCH-03` is the human
test: *"Select 2024-08-03 then open result → Version effective at that date opens; current text is
not substituted."* PRD §41.3's two-minute demo beat is the same thing: *"find an exact provision and
switch its legal date to show version history without AI."*

**Identity, not labels.** PRD §15.3: *"Provision labels are version-specific display values, not
permanent IDs. Node lineage supports renumber/replacement/split/merge. … Citations MUST target
DocumentVersion + NodeVersion + exact offsets + source snapshot, never a SearchChunk."* Sub-PRD
**D13**: these screens address `document_version_id` and `node_version_id`, so a captured URL resolves
to the same text after a later release. A screen that re-points a version link at "the current
version" is precisely the silent substitution `UAT-SRCH-03` exists to catch.

**Relationships must show their limits.** PRD §9.2: *"Appeal, affirmation, reversal, overruling,
distinction, following and citation relationships MAY be asserted only with evidence. A citation
alone establishes `CITES`, not treatment. Unconfirmed later treatment MUST display
`TREATMENT_NOT_CONFIRMED`."* PRD §9.3: *"LLM-discovered relationships are `MODEL_SUGGESTED` and MUST
NOT change legal status or support a definitive treatment conclusion."* PRD §31.2's first-use state
for `/nodes/:nodeId` is literally *"Relationship limitations shown"*. `FIND-02` transports
`relation_type`, `evidence_node_version_id`, evidence offsets, `derivation`, `parser_version` and
`confidence_state`; this screen renders those qualifiers rather than a clean-looking list.

**Freshness is five separate facts.** PRD §12.1: *"Customer-visible source metadata MUST separate:
last discovery check; last successful change scan; last full reconciliation; last content ingestion;
freshness status"*, and *"Sources without reliable delta mechanisms MUST show `FRESHNESS_LIMITED`
rather than a false guarantee."* A single "updated" date on a source page would breach that sentence.

**Licence limits are visible, not silent.** PRD §11.1 defines the assessment states and *"Unclear
rights default to metadata, limited quotation and official links"*; PRD §31.2 gives this screen the
explicit state *"Source unavailable banner if artifact is link-only"*. `FIND-02` transports the
assessment state and withholds the text; this screen explains the limitation and offers the official
link rather than rendering an empty body.

**No generation, anywhere on these screens.** `SRCH-005` says *"without generation"*; PRD §26 makes
search independence a Definition-of-Done item; PRD §16.2 makes these endpoints read-only and
non-charging. These screens must therefore render fully with the model gateway disabled and the
funding ledger exhausted.

**Inherited contracts (do not re-derive them):**

- `RUNT-05`'s A1 web contract: one `feature.tsx` per feature area default-exporting a `FeatureModule`
  (`{ id, routes, nav?, onOrganizationChange }`) discovered by
  `import.meta.glob('../features/*/feature.tsx', { eager: true })`; *"`nav` is optional: a feature may
  register routes without a nav entry (PRD §31.2 has routes such as `/answer-jobs/:jobId` that are not
  nav destinations)"* — these three routes are reached from search results, and PRD §31.1's eleven
  nav slots contain no "Sources" item, so this area claims **no** slot; every cache key via
  `orgScopedKey`; `apps/web/src/lib/api-client.ts` for HTTP; the exported conformance harnesses under
  `apps/web/test/**`.
- `RUNT-06` (`packages/ui`, breakdown plan **A6**): the accessible primitives, the status/
  jurisdiction/freshness/authority badges (*"text plus an icon/shape, never colour alone"*),
  `format/date.ts` (`3 Aug 2026` in UI, ISO to APIs), `SafeMarkdown`, and **`EvidencePanel` in
  `source` mode**, which *"renders version timeline, source/licence limitations and related
  amendments/cases/instruments (PRD §32.1)"* — exactly this screen's right-hand panel.
- `FIND-02` (merged before this starts) serves `GET /v1/documents/{id}`, `/versions`, `/timeline`,
  `/relations`, `GET /v1/document-versions/{id}/nodes`, `GET /v1/node-versions/{id}`,
  `GET /v1/nodes/{id}/timeline` and `/relations`, with PRD §34.1 pagination, strong `ETag`s on
  immutable resources, uniform `404 RESOURCE_NOT_FOUND`, transported licence limitations and
  relationship qualifiers, and `503 CORPUS_INCOMPATIBLE` when a named release is not loaded.
- PRD §41.1 applies in full (three widths without hiding legal status/citations/primary actions/error
  recovery, keyboard, one page heading, labelled fields, error summaries, live regions, colour never
  alone, `3 Aug 2026`, copyable IDs, no research content in URLs/analytics/telemetry/titles, no
  duplicate writes or charges on refresh/back/forward). PRD §13.1 sets WCAG 2.2 AA.

**Carried caveats, accepted and documented:**

- Breakdown plan §5.15 lists this ticket's blockers as `RUNT-05` and `FIND-02` — **not** `RUNT-06` —
  yet the screens compose `packages/ui`. That is consistent, not an omission: `RUNT-05` deliverable 1
  declares the `packages/ui` workspace reference in `apps/web/package.json`, so the package exists
  whenever `apps/web` builds, and both `RUNT-05` and `RUNT-06` are `03-app-runtime` wave-1 tickets. If
  `RUNT-06` is genuinely unmerged when this ticket starts, that is a **scheduling** observation to
  raise against `docs/prd/breakdown-plan.md` §5.15/§6.2 — never a licence to build local primitives
  (breakdown plan **A6**).
- `WTCH-07` ("Watchlist screens and create-watch-from-source", `blocked_by` this ticket) needs a slot
  on these screens. This ticket ships the registry and the stable watch-target descriptor and
  registers nothing itself (sub-PRD **D10**; breakdown plan §4.2: *"Create watch target from
  search/source — `16` (`WTCH-07`) — would put watch writes in `14`"*).
- Where `FIND-02`'s payload lacks a field these screens must show (the five PRD §12.1 freshness
  dates, authority level, the neutral/instrument identifier), the screen renders an explicit
  "not available" and the gap is raised against `FIND-02`/`FND-04` — it is never inferred
  (sub-PRD **D4**, **Q-FIND-2**).

## Goal

Produce `apps/web/src/features/sources/**`: an A1 feature area registering the three PRD §31.2 source
routes with no nav slot, rendering document metadata with separated PRD §12.1 freshness dates, a
version list and legal-event timeline, an exact historical document version with its paged nodes and
link-only banner, a node-lineage timeline with fully qualified relationships, all composed from
`packages/ui` with no generated text, plus a source-action registry and stable watch-target
descriptor for `WTCH-07`. Completion is mechanically checkable: `RUNT-05`'s feature-conformance
harness passes with zero diff outside this directory; committed `FIND-02`-shaped fixtures render each
screen's required fields; a version URL renders that version's text with a second release active;
`MODEL_SUGGESTED` and `TREATMENT_NOT_CONFIRMED` are visible; `RUNT-06`'s a11y harness reports zero
WCAG 2.2 AA violations at 360/768/1280 px; and `pnpm test`, `pnpm typecheck` and `pnpm lint` are
green.

## Non-goals

- **No search screens** — `FIND-03`, `FIND-04` (`apps/web/src/features/search/**`). This area links to
  `/search` by path and imports nothing from it.
- **No API work** — `FIND-02`, merged before this starts. A missing field is a `FIND-02` docs PR.
- **No watch target, no saved source, no Research Record, no export, no comment** —
  `16-monitor-alerts` (`WTCH-01`, `WTCH-07`), `17-records-collab`, `19-exports`; breakdown plan §4.2.
  This ticket ships the empty slot and the descriptor only, and performs **no** write.
- **No shell, navigation, status bar, api-client or `apps/web/src/lib/**`** — `RUNT-05`.
- **No new UI primitives, no second evidence panel, no local badge or date formatter** —
  `packages/ui` (`RUNT-06`), breakdown plan **A6**.
- **No enums or generated types** — `FND-03`, `FND-04`, PRD §44.3 serial-owned.
- **No generated summaries, no "explain this provision", no AI treatment assertion** —
  `15-answer-product`; PRD §9.3 forbids a model-suggested relationship from supporting a definitive
  conclusion, and `SRCH-005` requires these screens to work *"without generation"*.
- **No corpus reading and no licence decision** — `11-retrieval-engine`, `05-ingestion-framework`.
- **No accessibility or E2E automation suite** — `23-assurance` (`ASSR-06`, `ASSR-07`). Co-located
  checks only (breakdown plan §9 **R8**).

## File-scope (write-owns)

- `apps/web/src/features/sources/**` — `feature.tsx` (the A1 area entry for this area; this is the
  only ticket in it), the typed API callers, the three screens, the source-action registry, committed
  render fixtures under `__fixtures__/` and co-located tests under `__tests__/` (sub-PRD **D8**).

Does not touch:

- `apps/web/src/features/search/**` — `FIND-03`, `FIND-04`. `apps/web/src/features/**` other than
  `sources/` — `RUNT-05` (`home`) and modules `13`, `15`, `16`, `17`, `19`, `20`, `24`.
- `apps/web/src/{app,shell,lib}/**`, `apps/web/test/**`, `apps/web/package.json`,
  `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html` — `RUNT-05`. The
  conformance harnesses are **used**, never edited.
- `packages/ui/**` — `RUNT-06`; `packages/contracts/**`, `schemas/openapi/**` — `FND-03`/`FND-04`.
- `apps/api/**` — `FIND-01`, `FIND-02`, `FIND-06`, `03-app-runtime`. `apps/worker/**`,
  `apps/admin/**`, `apps/widget/**`, `packages/**` (other), `pipelines/**`, `infra/**`, `tests/**`,
  `evals/**` — other modules per breakdown plan §4. `docs/PRD.md` — frozen. Root manifests and
  lockfiles — `FND-01`.

**Serial-safety analysis.** First decomposition (breakdown plan §1: phase 1, nothing merged, no
in-flight ticket): nothing has previously written `apps/web/src/features/sources/**` and nothing
contends for it. Breakdown plan §4 gives `apps/web/src/features/{search,sources}/**` to this module,
and §5.15 makes this the **only** ticket in the `sources` area — so it owns `feature.tsx` outright,
unlike the `search` area which `FIND-03` and `FIND-04` split by subdirectory (sub-PRD **D7**). Under
`RUNT-05`'s A1 contract, adding this feature directory changes **zero** tracked file outside it. Its
concurrent sibling in the module's wave 2 is `FIND-03`, in a different feature area; `WTCH-07` is
`blocked_by` this ticket and therefore never concurrent with it.

## Deliverables

1. **`feature.tsx`** — default-exports a `FeatureModule` with `id: 'sources'`, three routes —
   `/documents/:documentId`, `/document-versions/:versionId`, `/nodes/:nodeId` — **no `nav` entry**
   (PRD §31.1's eleven slots contain no sources item; `RUNT-05` contract item 3 permits routes
   without nav), and `onOrganizationChange` dropping this feature's organisation-scoped caches.
2. **`sources-api.ts`** — typed callers for the eight `FIND-02` endpoints over
   `apps/web/src/lib/api-client.ts`, typed **only** by `packages/contracts/src/generated/**`,
   surfacing `request_id`, honouring PRD §34.1 pagination (`page_size`, `next_cursor`), passing
   `If-None-Match` where `FIND-02` returns an `ETag`, and keying caches with `orgScopedKey`.
   **Bounded fetching:** each screen issues a fixed, small number of requests (metadata + one page of
   the list it shows + relations on demand); there is no per-row request fan-out, because PRD §13.2
   sets source-node retrieval at p95 ≤ 1 s and an N+1 pattern makes that unmeasurable.
3. **Document screen (`/documents/:documentId`)** — PRD §31.2 *"Read metadata/current version/
   timeline"*:
   - **metadata**: canonical title, document type, authority (with level where the contract provides
     it), jurisdiction(s), official identifier / neutral citation, employer ABN where present, and
     the official link (`rel="noopener noreferrer"`, visibly marked as leaving the product);
   - **the five PRD §12.1 freshness facts, separately labelled**: last discovery check, last
     successful change scan, last full reconciliation, last content ingestion, and the freshness
     status badge — never collapsed into one "updated" date; `FRESHNESS_LIMITED` is shown as such;
   - **current version** summary with its effective interval and legal-status badge, plus an
     `as_at` control that resolves which version is current **at a chosen legal date** and links to
     that version (this is the `UAT-SRCH-03` path, and PRD §41.3's demo beat *"switch its legal date
     to show version history without AI"*);
   - **version list** (paged) and **legal-event timeline** (commencement, amendment, repeal … with
     event and effective dates), each row linking to its `document_version_id`;
   - **relations** section rendering deliverable 6's qualifiers;
   - the PRD §31.2 first-use/error state: an invalid or unknown id renders the uniform not-found
     state (`FIND-02` returns an identical `404` body for absent and non-addressable ids).
4. **Document-version screen (`/document-versions/:versionId`)** — PRD §31.2 *"Read exact historical
   version"*: the version's label, effective interval, legal status, publication and retrieval dates,
   content hash, official URL, and its **paged node list** with `display_label`/pinpoint and canonical
   text rendered **verbatim** (no truncation in the string, no highlighting, no markdown
   interpretation of source text — sub-PRD **D2**). A banner states which release answered the read.
   Where the licence assessment is `METADATA_AND_LINK_ONLY`, `UNCLEAR_RESTRICTED`, `PROHIBITED` or
   `REVIEW_REQUIRED`, the screen renders the PRD §31.2 **"Source unavailable"** banner naming the
   limitation, shows the attribution where one applies, and offers the official link — it never shows
   an empty body and never attempts to fetch the withheld text.
5. **Node timeline screen (`/nodes/:nodeId`)** — PRD §31.2 *"View provision lineage"*: the node's
   versions across document versions in effective-date order, each with its display label (marked as
   version-specific, PRD §15.3), effective interval, status and a link to the exact node version;
   lineage events (renumber, replacement, split, merge) shown as such; and the **relationship
   limitations** section required by PRD §31.2's first-use state.
6. **Relationship rendering with qualifiers intact** — every relation row shows `relation_type`, the
   target, the **evidence** (a link to the evidence node version and its offsets) or an explicit
   "no evidence recorded", `derivation`, `parser_version` where present, and the `confidence_state`
   badge. `MODEL_SUGGESTED` is labelled as model-suggested and stated not to change legal status;
   `TREATMENT_NOT_CONFIRMED` is displayed wherever later treatment is unconfirmed; a citation is
   presented as `CITES`, never as treatment. Basis: PRD §9.2, §9.3, §35.2.
7. **Detail panel** — `packages/ui`'s `EvidencePanel` in `source` mode for version timeline,
   source/licence limitations and related amendments/cases/instruments (PRD §32.1 row 6; breakdown
   plan **A6**). This ticket builds no panel of its own.
8. **Source-action registry for `WTCH-07`** — `export type SourceAction = { id, label, scope:
   'document' | 'document-version' | 'node', render(ctx: SourceActionContext): ReactNode }` and
   `export function registerSourceAction(a: SourceAction): void`, plus the **stable watch-target
   descriptor** `SourceWatchTarget = { kind: 'DOCUMENT' | 'NODE', document_id?, node_id?,
   document_version_id?, node_version_id?, authority_id?, jurisdictions?, corpus_release_id }` — the
   PRD §8.8 target kinds this surface can offer, expressed as **stable identifiers only**, never text.
   Exported from `apps/web/src/features/sources/public.ts` as the single documented entry point for
   `WTCH-07`. This module registers nothing and performs no write (sub-PRD **D10**; PRD §33.1 step 7).
9. **States** — explicit loading, loaded, not-found, unavailable-release (`503
   CORPUS_INCOMPATIBLE` → a plain-language maintenance state) and failed states, each with a visible
   title, plain-language explanation, allowed next action and a copyable `request_id`, composed from
   `RUNT-06`'s components; plus the degraded banner when a response carries `warnings` (sub-PRD
   **D9**).
10. **No generation on any of these screens** — no import of any answer/ask feature or model-related
    package, no summarise affordance, no derived legal conclusion. Every displayed legal attribute
    comes from the payload (`SRCH-005`; PRD §9.4's *"Code MUST create source titles, links, pinpoints
    and status badges"*).
11. **Deep-link stability and URL discipline** — URLs carry only opaque identifiers and, where the
    contract supports it, a release or `as_at` parameter; no source text and no customer research
    content appears in the URL, the page title, analytics or error telemetry (PRD §41.1). Refresh and
    back/forward re-issue reads only, with no duplicate write or charge (there are none to duplicate).
12. **Committed render fixtures** under `__fixtures__/`: a populated document (with all five
    freshness dates), a version whose licence is link-only, a node with `MODEL_SUGGESTED` and
    `TREATMENT_NOT_CONFIRMED` relations, a node with a renumber/replacement lineage, a two-release
    pair for the stability test, and a not-found response — all synthetic and validated against the
    generated response types in the tests (PRD §45.1 item 6).
13. **Co-located tests** under `__tests__/**`, including `RUNT-05`'s feature- and
    org-scope-conformance harnesses and `RUNT-06`'s a11y harness at the three widths.

## Acceptance checklist (classified)

- [ ] `[machine]` **A1 conformance**: the area registers all three PRD §31.2 routes, claims **no** nav
      slot, and produces **zero** diff outside `apps/web/src/features/sources/` — asserted with
      `RUNT-05`'s exported `apps/web/test/feature-conformance.tsx` (breakdown plan **A1**)
- [ ] `[fixture]` **Document screen completeness**: the populated fixture renders title, type,
      authority (with level where provided), jurisdictions, official/neutral identifier, official
      link, current version, version list and legal-event timeline — asserted field by field
      (`SRCH-005`; PRD §31.2)
- [ ] `[fixture]` **PRD §12.1 freshness separation**: the five facts — last discovery check, last
      successful change scan, last full reconciliation, last content ingestion, freshness status —
      render as five separately labelled values; a `FRESHNESS_LIMITED` fixture renders that status
      explicitly; no screen collapses them into one date (PRD §12.1)
- [ ] `[fixture]` **`SRCH-005` / `UAT-SRCH-03` stability**: with two releases fixtured, opening a
      `document_version_id`/`node_version_id` URL renders that version's text under both releases, and
      choosing legal date 2024-08-03 on the document screen opens the version effective then — the
      current text is never substituted (PRD §30.2 `SRCH-005`; §15.3; `UAT-SRCH-03`)
- [ ] `[fixture]` **Link-only banner**: the licence-limited fixture renders the PRD §31.2 "Source
      unavailable" banner naming the limitation, shows attribution where applicable and the official
      link, and the withheld text bytes appear nowhere in the DOM (PRD §11.1, §31.2)
- [ ] `[fixture]` **Relationship limitations**: `MODEL_SUGGESTED` renders labelled as model-suggested
      with the statement that it does not change legal status; `TREATMENT_NOT_CONFIRMED` renders
      wherever treatment is unconfirmed; a relation without evidence renders "no evidence recorded"
      rather than being hidden; a citation renders as `CITES`, never as treatment (PRD §9.2, §9.3;
      §31.2 *"Relationship limitations shown"*)
- [ ] `[fixture]` **Node text fidelity**: node canonical text renders byte-identical to the payload —
      no ellipsis inserted, no whitespace collapsed into the string, no markdown interpretation of
      source text (PRD §34.2, §8.2; sub-PRD **D2**)
- [ ] `[machine]` **No generation**: a source scan finds no import of an answer/ask feature or
      model-related package; the screens render fully with the shell status reporting generation
      unavailable and the funding ledger exhausted (`SRCH-005` *"without generation"*; PRD §8.2,
      §16.2, §26)
- [ ] `[machine]` **No writes**: no mutating request is issued by any interaction on these screens —
      a source scan finds no POST/PUT/PATCH/DELETE and no record, watchlist, comment or export
      endpoint reference (PRD §16.2; breakdown plan §4.2)
- [ ] `[machine]` **Watch seam**: `public.ts` exports exactly `registerSourceAction`, `SourceAction`
      and `SourceWatchTarget`; a registered throw-away action renders on all three screens and
      receives a descriptor of **stable identifiers only** — a type-level test proves the descriptor
      cannot carry title, snippet or free text (PRD §33.1 step 7, §8.8; sub-PRD **D10**; enables
      `WTCH-07`)
- [ ] `[machine]` **Bounded fetching**: rendering each screen issues a fixed number of requests
      independent of row count — asserted with a counting api-client stub over a fixture with many
      nodes and relations (PRD §13.2)
- [ ] `[machine]` **Not-found and unavailable states**: an unknown id renders the uniform not-found
      state; a `503 CORPUS_INCOMPATIBLE` renders a plain-language maintenance state with a copyable
      `request_id`; neither renders a blank screen (PRD §34.9, §31.2, §41.1)
- [ ] `[machine]` **Accessibility**: `RUNT-06`'s `packages/ui/test/a11y.ts` reports **zero** WCAG 2.2
      AA violations for all three screens in populated, link-only, not-found, degraded and loading
      states at **360 px, 768 px and 1280 px** (PRD §13.1, §41.1)
- [ ] `[machine]` **Keyboard and structure**: complete keyboard operation with visible focus and
      logical order through the timeline, node list and relations; exactly one programmatic page
      heading per screen; labelled controls; live region for asynchronous status; every status signal
      is text plus icon; at 360 px nothing hides legal status, citations, primary actions or error
      recovery (PRD §41.1)
- [ ] `[machine]` **Dates**: displayed as `3 Aug 2026` via `packages/ui`; ISO 8601 to and from the API
      (PRD §41.1)
- [ ] `[machine]` **URL discipline**: no source text or research content in the URL, page title,
      analytics stub or error-telemetry stub; refresh and back/forward re-issue reads only
      (PRD §41.1)
- [ ] `[machine]` **Organisation scoping**: `RUNT-05`'s `org-scope-conformance` harness passes and
      switching organisation clears this feature's caches (PRD §31.1; `AUTH-002`)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[human]` `UAT-SRCH-03` — selecting 2024-08-03 and opening a result opens the version effective
      at that date, with current text not substituted, judged on the running screens at Gate 2
      (PRD §41.2). Not required to merge.
- [ ] `[human]` PRD §41.3 demo beat two — *"find an exact provision and switch its legal date to show
      version history without AI"* — is performable end to end on these screens at Gate 2 (PRD §41.3;
      §43.4 founder review). Not required to merge.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement ID `SRCH-005` (with `SRCH-003` on the
      render side) and UAT id `UAT-SRCH-03`; user-visible change and non-goals; source/licence impact
      ("licence limitations are displayed, never bypassed"); tenant/PII impact ("no tenant data is
      read or written"); cost impact ("zero — no generation"); accessibility evidence; rollback path;
      known gaps (the watch action is unregistered until `WTCH-07` lands)
- [ ] `cargo test --workspace` and `uv run pytest` not applicable — no Rust and no Python here
      (PRD §45.3).

## Test plan

All steps run offline against committed fixtures; no network, no API process, no model provider.
Harness: the repository's component test runner as configured by `FND-01`/`RUNT-05`; copy the
construction pattern from `FIND-03`'s `simple/__tests__/**` and from `packages/ui/test/**`
(`RUNT-06`'s render + a11y tests).

1. **Feature conformance** — `__tests__/feature.test.tsx`: `RUNT-05`'s harness; assert the three
   routes, the absence of a nav slot and the zero-diff property (reviewer confirms with
   `git status --porcelain`).
2. **Screen fixtures** — `__tests__/document.test.tsx`, `version.test.tsx`, `node.test.tsx`: validate
   each fixture against the generated response type, render, and assert the required fields per
   deliverables 3–6, including the five separated freshness facts and the exact node text.
3. **Historical stability** — `__tests__/release-stability.test.tsx`: stub the api-client with two
   releases; assert the version URL renders the same text under both; assert the `as_at` control
   resolves to the version effective at 2024-08-03 and links to it rather than to the current one.
4. **Licence** — `__tests__/licence.test.tsx`: the link-only fixture renders the banner and
   attribution; assert the withheld text bytes are absent from the rendered output and that no
   request is issued attempting to fetch them.
5. **Relations** — `__tests__/relations.test.tsx`: one case per qualifier (`MODEL_SUGGESTED`,
   `TREATMENT_NOT_CONFIRMED`, no-evidence, `CITES`); assert the rendered wording states the
   limitation and that nothing upgrades a qualifier.
6. **Watch seam** — `__tests__/source-actions.test.tsx`: register a throw-away action; assert it
   renders on all three screens; type-level test on `SourceWatchTarget`; assert no mutating request
   is issued anywhere in the feature.
7. **Request budget** — `__tests__/request-budget.test.tsx`: counting api-client stub over a
   many-node fixture; assert a fixed request count independent of row count and correct pagination.
8. **States** — `__tests__/states.test.tsx`: not-found, `503 CORPUS_INCOMPATIBLE`, degraded and
   failure states each render title, explanation, next action and copyable `request_id`.
9. **Accessibility** — `__tests__/a11y.test.tsx`: `a11y.ts` over every state of all three screens at
   360/768/1280 px; assert zero violations and that the timeline and relations remain reachable at
   360 px.
10. **Architecture** — `__tests__/architecture.test.ts`: this feature imports only `packages/ui`,
    `packages/contracts` and `apps/web/src/lib/**`; it imports no other feature area (in particular
    not `features/search/**`), no model-related package and no API source file.
11. **Suite green** — `pnpm lint`, `pnpm typecheck`, `pnpm test` from the repository root.
12. **Reviewer focus**: confirm no screen substitutes the current version when a version id is in the
    URL; confirm a relationship qualifier cannot be lost by any render path; confirm withheld
    licence-restricted text is unreachable; confirm the freshness facts are five distinct labelled
    values, not one; confirm the watch descriptor cannot carry text even through an optional
    property; confirm the request count does not scale with rows; confirm the a11y run covers the
    link-only and not-found states, not only the happy path.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/14-search-product/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *`FIND-02`'s payload lacks a field these screens must show* — most likely the five PRD §12.1
     freshness dates, the authority level, the neutral/instrument identifier, or lineage event kinds
     → raise a docs PR against
     `docs/prd/14-search-product/tickets/FIND-02-document-version-node-timeline-and-relation-endpoints.md`
     and, if the public shape is the limit, `docs/prd/00-foundation/tickets/FND-04-*.md`; record it in
     this module's README. The screen shows an explicit "not available" meanwhile — a legal attribute
     inferred in the browser is exactly the failure PRD §2 exists to prevent.
   - *`packages/ui` lacks a component, or `EvidencePanel`'s `source` mode cannot express the panel* →
     docs PR against `docs/prd/03-app-runtime/tickets/RUNT-06-*.md`, `--sync`, recorded here. Never
     build a second evidence panel or a local status badge (breakdown plan **A6**).
   - *`RUNT-06` is not merged when this ticket starts* → that is a scheduling issue for `/start-all`
     and a writeback against `docs/prd/breakdown-plan.md` §5.15/§6.2 (a missing edge), **not**
     grounds for local primitives.
   - *`WTCH-07` asks for a richer context than stable identifiers* (document title, node text) →
     refuse and point at PRD §8.8's target kinds and PRD §33.1 step 7. A genuine need is a writeback
     to `docs/prd/14-search-product/README.md` **and** `docs/prd/breakdown-plan.md` §4.2 before any
     code, because copying source text into a tenant-owned watch target changes another module's
     licensing and retention surface.
   - *Rendering a long provision is slow, and truncating the text would fix it* → truncate with CSS or
     paginate the node list, never the string (sub-PRD **D2**). If pagination is insufficient, the
     writeback is to `FIND-02` (a smaller page or a range parameter), not to the rendered text.
3. **Falsified protocol.** If a version-addressed URL cannot be made to render that version's text —
   for example if version identities turn out not to be stable across releases — then `SRCH-005`,
   PRD §15.3 and PRD §18.4 are contradicted and the product's citation guarantee is in question.
   Stop, escalate for re-review, and write back to `docs/prd/breakdown-plan.md` §4.2 and both
   affected sub-PRDs. A "nearest available version" fallback is the silent substitution
   `UAT-SRCH-03` exists to catch and must never be added quietly.
