---
id: RCRD-09
title: "Create record from search selection"
module: 17-records-collab
lane: 17-records-collab
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RCRD-08, FIND-04]
blocks: [ASSR-06]
---

# RCRD-09 — Create record from search selection

Implements PRD §33.1 step 6 — requirement **REC-001**, epic `E24-RECORDS`.
No ADR — the decision is already made in PRD §33.1 (*"User may create a Research Record using selected
authorities; this writes only the selected stable IDs and user-authored anonymous notes"*) and in
breakdown plan §4.2, which gives this surface to `17` by name so `14-search-product` never performs a
record write; this is build ticket 9 of 9 against it.
Parent sub-PRD: [17-records-collab README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RCRD-08 — Records list and record detail screens (six tabs)](RCRD-08-records-list-and-record-detail-screens-six-tabs.md)
· `FIND-04` — Advanced Search screen ([`14-search-product`](../../14-search-product/README.md))
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §33.1 step 6 fixes exactly what may be written; this is one screen against `RCRD-08`'s sub-area
registry.

## Background + basis

**PRD §33.1 Search to saved research**, the workflow this ticket completes:

> 1. User enters query and legal context.
> 2. API validates syntax and entitlement; generation budget is irrelevant.
> 3. Search applies hard filters, exact matching, lexical retrieval and optional dense/rerank stages.
> 4. API returns exact snippets and a **`search_execution_id`** for reproducibility.
> 5. User opens a source version or selects results.
> 6. **User may create a Research Record using selected authorities; this writes only the selected
>    stable IDs and user-authored anonymous notes.**
> 7. User may create a watch target from the search or source.

Step 6 is this ticket. Step 7 is `16-monitor-alerts`/`WTCH-07`. **Breakdown plan §4.2** allocates both
deliberately:

> | "Create record from search selection" | sole owner `17` (`RCRD-09`) | would put record writes in
> `14` | §33.1 step 6 |

**The constraint is the sentence's second half.** *"This writes only the selected stable IDs and
user-authored anonymous notes"* — three things follow mechanically:

1. The **search query text is never written** to the record. It is customer-authored content that
   never passed a record-scoped PII admission and is not among the two permitted classes.
2. The **snippets are never written**. A snippet is corpus text; PRD §15.3 makes citations point at
   `DocumentVersion + NodeVersion + exact offsets`, so a saved selection is a set of ids, and the text
   is re-read from the corpus when displayed.
3. The notes are **anonymous** — customer-authored free text that crosses the PRD §10.1 server PII
   boundary like every other free-text field in this module (sub-PRD **D10**).

**PRD §31.2** gives `/records` the main action *"Filter/create/open records"* — so the destination is
the **existing** `/records` route with a handoff parameter, not an invented route. **PRD §41.1**
forbids *"customer research content … in URL query strings, analytics, browser error telemetry or page
titles"* — so the handoff may carry opaque public corpus ids and the `search_execution_id`, and must
never carry the query text or the notes (sub-PRD **D14**).

**PRD §32.1 Search screen** describes the affordance's origin: the results toolbar carries *"result
count relation …, sort, active-filter chips, copy stable search URL, save search/watch"*, and the
result row carries *"title, type, authority, neutral/instrument ID, pinpoint, exact source snippet,
jurisdiction, status badge, effect interval, freshness, official link"* — the row's stable ids are what
a selection consists of.

**PRD §34.2 Search response**, the exact id set available for selection:

> ```json
> "search_execution_id": "srx_...",
> "corpus_release_id": "cr_...",
> "results": [{ "document_id": "doc_...", "document_version_id": "dv_...", "node_id": "node_...",
>   "node_version_id": "nv_...", … "pinpoint": "s 94(5)", … }]
> ```

**PRD §34.7** is the create payload this screen submits (`title`, `legal_context`, `owner_user_id`,
`reviewer_user_id`, `tags`), and **PRD §34.7**'s turn shape is how the selected authorities and notes
land: *"Formal facts/questions are added as immutable turns"* with `turn_type`, `content` and
`supersedes_turn_id`.

**Requirement REC-001** (PRD §30.2): *"Saved research stores immutable turns and Answer Snapshots …
No update path mutates an existing formal snapshot."*

**The handoff contract (sub-PRD D14, QR-7).** `RCRD-09` is `blocked_by FIND-04`, so the **search
screen is built first** and needs the contract before this ticket exists. It is therefore declared
here and in `docs/prd/17-records-collab/README.md` **D14**, for `14-search-product` to read:

- `14-search-product` navigates to **`/records?from_search=<search_execution_id>`**.
- The selected result ids are written by the search screen to session storage under
  **`orgScopedKey(organizationId, 'search-selection', searchExecutionId)`** — `orgScopedKey` is
  `RUNT-05`'s shared helper (`apps/web/src/lib/org-scope.ts`), which both features may *use* without
  either importing the other's code. A cross-module import would be a `14 → 17` edge and a module
  cycle (plan **R6**), so the handoff is deliberately data-only.
- The stored value contains **only**: `search_execution_id`, `corpus_release_id`, `legal_as_at`, the
  applied `jurisdictions`, and an array of `{ document_id, document_version_id, node_id,
  node_version_id, pinpoint }`. **No query text, no snippet text, no filter free-text.**
- If the key is absent or malformed, this screen falls back to its own manual entry so it is
  independently usable and testable — `RCRD-09` never hard-depends on `FIND-04` having run.

**Accepted caveats carried forward:**

- **If `FIND-04` already shipped a different affordance**, this ticket conforms to what exists and
  writes back to `docs/prd/17-records-collab/README.md` **QR-7** and `docs/prd/14-search-product/README.md`
  — it does not ship a second, incompatible contract.
- **`RCRD-08` owns `records/feature.tsx` and the sub-area registry** (sub-PRD **D13**). This ticket adds
  `records/from-search/sub-area.tsx` and **must not** edit any file outside `from-search/**`.
- **The record write is server-side.** This screen calls `RCRD-01`'s `POST /v1/research-records` and
  `RCRD-02`'s `POST …/turns`; it performs no persistence of its own and enforces no tenant or PII
  boundary (PRD §45.2).

## Goal

Produce `apps/web/src/features/records/from-search/**`: the create-record-from-search-selection flow,
registered through `RCRD-08`'s sub-area registry so it adds **zero** diff outside its own directory,
reachable at `/records?from_search=<search_execution_id>` and also usable standalone, which creates a
record (PRD §34.7) plus one immutable turn carrying **only** the selected stable IDs and the user's
anonymous notes. Completion is mechanically checkable: a canary test proves the search query text and
every snippet are absent from every outbound request body and from the URL; the sub-area conformance
test proves zero diff outside `from-search/**`; and the `packages/ui` accessibility harness passes at
360/768/1280 px.

## Non-goals

- **No API routes, worker handlers, tables or repositories.** `RCRD-01`, `RCRD-02`, `01-app-data`.
- **No file outside `apps/web/src/features/records/from-search/**`** — in particular **not**
  `records/feature.tsx`, which is `RCRD-08`'s and which this ticket extends only through the sub-area
  registry (sub-PRD **D13**).
- **No search screen, search endpoint or result rendering.** `14-search-product` (`FIND-01` …
  `FIND-05`). This ticket writes nothing under `apps/web/src/features/{search,sources}/**` and
  **imports nothing from it** — a `17 → 14` import is unnecessary and a `14 → 17` import would be a
  module cycle (plan **R6**).
- **No watch-target creation.** PRD §33.1 step 7 is `16-monitor-alerts`/`WTCH-07`.
- **No answer creation.** Selecting authorities does not start a job; `/ask` is
  `15-answer-product`/`ASK-06`.
- **No shared UI components.** `packages/ui` (`RUNT-06`, plan **A6**).
- **No new route.** PRD §31.2 gives `/records` the create action; this ticket adds a parameterised
  entry to it, not a route the PRD does not list.
- **No corpus text storage.** Snippets are re-read from the corpus for display through the shared
  evidence panel; nothing corpus-derived beyond ids and pinpoints is persisted (PRD §15.3, §33.1
  step 6).
- **No tenant or PII enforcement in the client.** Server-side (`RUNT-02`, PRD §45.2).
- **No cross-boundary E2E suite.** `tests/e2e/uat/**` is `23-assurance`/`ASSR-06`, which is
  `blocked_by` this ticket. Co-located checks here per plan R8.
- **No `apps/web/package.json` or `tsconfig.json` edit** — `03-app-runtime` (sub-PRD **D16**).

## File-scope (write-owns)

- `apps/web/src/features/records/from-search/**`
- `apps/web/test/records/from-search/**` (sub-PRD **D15**)

Does not touch:

- `apps/web/src/features/records/**` other than `from-search/**` — `RCRD-08` (including
  `records/feature.tsx`, the tabs, the header and the list).
- `apps/web/src/features/{search,sources}/**` — `14-search-product`;
  `apps/web/src/features/monitor/**` — `16-monitor-alerts`; every other feature area — `03`, `13`,
  `15`, `19`, `20`, `24`.
- `apps/web/src/{app,shell,lib}/**`, `apps/web/index.html`, `apps/web/vite.config.ts`, the web
  manifests — `RUNT-05` / `03-app-runtime` (**D16**).
- `packages/ui/**` — `RUNT-06`; `packages/contracts/**`, `schemas/openapi/**` — `00-foundation`.
- `apps/api/**`, `apps/worker/**`, `infra/**`, `tests/**` — other modules.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, no in-flight
ticket), so nothing has previously written `apps/web/src/features/records/from-search/**` and nothing
contends for it. This ticket is the module's **only** wave-4 web ticket and its sole intra-module
neighbour in the same tree, `RCRD-08`, is a declared blocker — so the two are never in flight
together, and plan §5.18 carves `from-search/**` out of `RCRD-08`'s scope by name. Sub-PRD **D13**
makes the disjointness *mechanical* rather than merely declared: `RCRD-08`'s sub-area registry
discovers `./*/sub-area.ts*` by Vite glob, so adding this directory changes no tracked file elsewhere,
exactly as `RUNT-05` contract item 6 requires one level up. Per plan **A3** and PRD §45.2 this ticket
writes no table, no repository and no security boundary; the record write happens server-side in
`RCRD-01`/`RCRD-02`, which is precisely why plan §4.2 could move this surface out of
`14-search-product` without creating any file dependency between modules `14` and `17`.

## Deliverables

1. **`apps/web/src/features/records/from-search/sub-area.tsx`** — the sub-area module `RCRD-08`'s
   registry discovers: `id: 'from-search'` (equal to the directory name) and the routes/entry it
   contributes under `/records`. It adds **no** nav slot (PRD §31.1's eleven slots are fixed and
   `RECORDS` is already claimed by `RCRD-08`).
2. **Entry points, both supported.**
   - **Handoff:** `/records?from_search=<search_execution_id>` — on mount, read
     `orgScopedKey(organizationId, 'search-selection', searchExecutionId)` from session storage
     (sub-PRD **D14**). A present, well-formed value pre-populates the selection.
   - **Standalone:** the create dialog `RCRD-08` already offers, extended with an "add authorities"
     step so the flow is usable and testable with **no** search screen involved.
   A malformed, expired or absent handoff renders an explicit PRD §31.3-style state explaining that
   the selection could not be recovered, with the copyable `search_execution_id` and the standalone
   path as the allowed next action — never a silent empty selection.
3. **The selection review step.** The recovered selection is displayed for confirmation before any
   write: one row per selected authority showing title, type, authority, jurisdiction, legal status,
   effective interval and pinpoint, rendered with `packages/ui`'s status badges (**text plus
   badge/icon**, PRD §41.1) and, on demand, the shared `EvidencePanel` in `source` mode (`RUNT-06`
   deliverable 3, plan **A6**). The user may deselect entries. Corpus text shown here is **read for
   display**, never carried into the write.
4. **The record create call.** Submits PRD §34.7's create payload to `RCRD-01`'s
   `POST /v1/research-records`: `title` (user-authored), `legal_context` (defaulted from the search's
   `legal_as_at` and applied `jurisdictions`, editable), `owner_user_id` (the current user),
   `reviewer_user_id` (optional), `tags`. Carries an `Idempotency-Key` generated once per user intent
   and reused across retries so refresh/back/reconnect creates one record (PRD §34.1, §41.1).
5. **The authorities turn.** Immediately after creation, submits **one** immutable turn to `RCRD-02`'s
   `POST /v1/research-records/{id}/turns` whose `content` contains **exactly two** things (PRD §33.1
   step 6):
   - `selected_authorities`: an array of `{ document_id, document_version_id, node_id,
     node_version_id, pinpoint }` plus the `search_execution_id` and `corpus_release_id` for
     reproducibility (PRD §33.1 step 4 exists for this);
   - `notes`: the user's anonymous free text, or omitted if empty.
   Nothing else. **No query string, no snippet, no result title text, no filter free-text.** The
   request type has no field for any of them, and a source scan asserts none is constructed.
6. **Failure handling that cannot half-create.** If the record is created and the turn fails, the
   screen does **not** retry blindly or silently leave an empty record: it navigates to the created
   record, shows the failure with the copyable `request_id`, and offers "add the authorities again" as
   the single next action — which re-posts the turn under the same `Idempotency-Key`. This is the
   honest treatment of two sequential writes without a client-side transaction; PRD §31.3 requires a
   visible state with an allowed next action rather than an ambiguous outcome.
7. **PII admission is the server's** (`RUNT-02`'s `pii-admission` stage on both `RCRD-01`'s create and
   `RCRD-02`'s turn). This screen renders the `422 EMPLOYEE_PII_DETECTED` response using the
   field/character-range/category/placeholder the server returns and **never echoes the detected
   value** (PRD §37.2). Client-side hints are permitted and non-authoritative (PRD §10.1: *"Web/widget
   clients SHOULD provide immediate PII hints"*; *"The server MUST be the authoritative PII
   boundary"*).
8. **PRD §41.1 compliance.** `format/date.ts` for every displayed date (`3 Aug 2026`); one
   programmatic page heading via the shell slot; labelled fields and an `ErrorSummary`; a `LiveRegion`
   for asynchronous status; status by text plus badge; **no customer research content in the URL, the
   page title, analytics or error telemetry** — the URL carries only `from_search=<srx_...>`, an
   opaque operational id; refresh/back/forward duplicates no write (Deliverable 4's idempotency key).
9. **Organisation scoping.** The handoff key is org-scoped by construction (`orgScopedKey`), and the
   sub-area registers its caches and its unsaved form with `RUNT-05`'s `onOrganizationChange` /
   `registerDirtyForm` seams through `RCRD-08`'s feature module — switching organisation mid-flow
   discards the selection after confirmation and never carries it across tenants (PRD §31.1;
   `AUTH-002`).
10. **Committed synthetic fixtures** — `apps/web/test/records/from-search/fixtures/`:
    `search-selection.json` (a well-formed handoff payload with three authorities),
    `search-selection-malformed.json`, `search-results-with-canaries.json` (results whose titles and
    snippets carry distinct canary strings, plus a canary query string) and `expected-turn.json` (the
    exact turn body the flow must produce). All synthetic; nothing from `evals/gold/**` (PRD §45.1
    item 6; plan R9).

## Acceptance checklist (classified)

- [ ] `[machine]` **Sub-area registration (sub-PRD D13):** the flow registers through `RCRD-08`'s
      registry from `records/from-search/sub-area.tsx` with **zero** diff to any tracked file outside
      `from-search/**` — asserted with `apps/web/test/records/sub-area-conformance.ts`, the helper
      `RCRD-08` exports, plus a `git status --porcelain` check after the suite (`RUNT-05` contract
      item 6)
- [ ] `[machine]` **PRD §33.1 step 6 — only stable IDs and anonymous notes:** replaying
      `search-results-with-canaries.json` through the full flow produces a turn body **byte-equal** to
      `expected-turn.json`, and **no canary** from any result title, snippet or the search query text
      appears in any outbound request body (PRD §33.1 step 6; §30.2 **REC-001**)
- [ ] `[machine]` The turn request type has **no** field for query text, snippet, result title or
      filter free-text; a source scan finds no construction of one (PRD §33.1 step 6)
- [ ] `[fixture]` `search-selection.json` replays: the handoff pre-populates the selection with three
      authorities carrying `document_id`, `document_version_id`, `node_id`, `node_version_id` and
      `pinpoint`, plus `search_execution_id` and `corpus_release_id` (PRD §34.2; §33.1 step 4)
- [ ] `[machine]` `search-selection-malformed.json` and an absent key both render an explicit
      recovery state with the copyable `search_execution_id` and the standalone path as the allowed
      next action — never a silent empty selection (PRD §31.3)
- [ ] `[machine]` The flow works **standalone** with no handoff and no search screen: a record and its
      authorities turn are created from manual selection (independent testability; `RCRD-09` must not
      hard-depend on `FIND-04` having run)
- [ ] `[machine]` **No research content in the URL, title, analytics or telemetry:** across the whole
      flow the URL carries only `from_search=<srx_...>`; `document.title` is static; no canary from
      the query, a snippet or the notes appears in any analytics stub call or client error payload
      (PRD §41.1)
- [ ] `[machine]` The record create submits exactly PRD §34.7's fields and carries a stable
      `Idempotency-Key` per user intent; refresh, back/forward and reconnect mid-flow create **one**
      record and **one** turn (PRD §34.1; §41.1 *"refresh/back/forward/reconnect does not duplicate
      writes or charges"*)
- [ ] `[machine]` **Partial-failure handling:** with the turn call forced to fail, the flow navigates
      to the created record, shows the failure with the copyable `request_id`, offers exactly one
      retry action, and re-posts under the **same** `Idempotency-Key` — no duplicate turn results
      (PRD §31.3; §34.1)
- [ ] `[machine]` A `422 EMPLOYEE_PII_DETECTED` on the notes renders the server's field, character
      range, category and suggested placeholder and **never** the detected value; the user's other
      input is preserved (PRD §37.2)
- [ ] `[machine]` **No cross-module import:** a source scan asserts this sub-area imports nothing from
      `apps/web/src/features/search/**` or `features/sources/**`, and nothing under those trees imports
      this sub-area — the handoff is data-only (sub-PRD **D14**; plan **R6**)
- [ ] `[machine]` **No boundary enforcement in the client:** no permission table, no authoritative PII
      rule, no tenant check — all server-side (PRD §45.2)
- [ ] `[machine]` No component duplicating a `packages/ui` primitive, status badge or evidence panel is
      defined here (plan **A6**; `RUNT-06`)
- [ ] `[machine]` **Organisation scoping:** the handoff key is produced by `orgScopedKey`; switching
      organisation mid-flow discards the selection after confirmation and never carries it across
      tenants (PRD §31.1; `AUTH-002`; `RUNT-05` contract item 5)
- [ ] `[machine]` Every displayed date renders as `3 Aug 2026`; every status uses text plus
      badge/icon; the page has one programmatic heading, labelled fields, an error summary and a live
      region (PRD §41.1)
- [ ] `[machine]` **Accessibility (automated):** `packages/ui/test/a11y.ts` passes for the whole flow at
      **360 px, 768 px and 1280 px** with complete keyboard operation, visible focus and logical order
      (PRD §41.1; §13.1)
- [ ] `[machine]` `CUSTOMER_REVIEWED` is not mentioned in any string this sub-area ships; if a future
      string does, it matches `RCRD-01`'s `customer-reviewed-copy.json` and never implies
      product-owner or legal verification (PRD §8.7; sub-PRD **D6**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration` green
      (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — the flow consumes generated
      `packages/contracts` types and hand-edits no binding (PRD §20.1; `DEV-001`)
- [ ] `[human]` **PRD §33.1 end-to-end script:** search for an exact provision, select two results,
      create a record from the selection, then open the record and confirm the Timeline shows one
      immutable turn listing exactly those authorities and the typed notes — and that the search query
      text appears nowhere on the record (PRD §33.1 steps 1–6; automated by
      `23-assurance`/`ASSR-06`, which is `blocked_by` this ticket)
- [ ] `[human]` **PRD §41.1 manual review** at 360/768/1280 px: the selection review, the notes field
      and the primary action remain visible and keyboard-reachable at every width; legal status and
      jurisdiction remain legible in greyscale
- [ ] `[human]` **PRD §43.4 founder review** of the notes-field guidance copy — it must direct the user
      to anonymous facts (PRD §37.1's allowed/blocked table) without implying that the server check is
      optional. A wording change is recorded, not patched (founder queue item 6)
- [ ] `[human]` **Gate 2 smoke test** (CLAUDE.md), which is also PRD §41.3 step 5 of the eight-minute
      demonstration: search → select → save to a Research Record → assign a reviewer → show immutable
      versions
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**REC-001**, `E24-RECORDS`,
      PRD §33.1), user-visible change and non-goals, schema/API/event compatibility (consumes generated
      types only), tenant/PII/security/retention impact (**writes only stable IDs and anonymous notes;
      server-side PII admission on both writes**), source/licence impact (no corpus text is persisted —
      ids and pinpoints only, PRD §11.1's excerpt limits therefore unaffected), cost/memory/latency
      impact (none — no generation credit is consumed), rollback path (revert; `ASSR-06` consumes this
      ticket), known gaps (**QR-7** handoff contract confirmation with `14-search-product`)
- [ ] No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected (PRD §45.3)

## Test plan

Reviewer steps. Every `[machine]` and `[fixture]` step is offline: no network, no API server, no
search service. The flow is exercised against committed fixtures through the generated client's mock
seam (sub-PRD **D12**).

1. **Confirm the handoff contract first (QR-7).** Read `apps/web/src/features/search/**` on the default
   branch and check what `FIND-04` actually ships. If it differs from sub-PRD **D14**, the correct
   outcome is that this ticket **conforms to what exists** and writes back to
   `docs/prd/17-records-collab/README.md` **QR-7** and `docs/prd/14-search-product/README.md` — not
   that it ships a second contract.
2. `pnpm typecheck && pnpm lint`; `pnpm test --filter <the apps/web package name>`; suites under
   `apps/web/test/records/from-search/`.
3. **Harness.** The component-test setup `RUNT-05` established, plus `packages/ui/test/a11y.ts`
   (`RUNT-06` deliverable 12) and `apps/web/test/records/sub-area-conformance.ts` (`RCRD-08`
   deliverable 2). Copy those patterns rather than inventing a fourth.
4. **`sub-area.test.ts`** — assert registration through `RCRD-08`'s registry; run
   `git status --porcelain` after the suite and assert clean; assert no file outside `from-search/**`
   is modified by the diff under review.
5. **`only-ids-and-notes.test.ts`** — the load-bearing test. Load
   `fixtures/search-results-with-canaries.json` (result titles, snippets and the query each carrying a
   distinct canary), drive the full flow with typed notes, and capture every outbound request. Assert:
   (a) the turn body equals `expected-turn.json` byte for byte; (b) **no canary** appears in any
   request body; (c) no canary appears in the URL at any point.
6. **`handoff.test.ts`** — replay `search-selection.json` (populates three authorities),
   `search-selection-malformed.json` (recovery state) and an absent key (recovery state). Assert the
   recovery state carries the copyable `search_execution_id` and offers the standalone path.
7. **`standalone.test.ts`** — with no handoff at all, complete the flow manually; assert one record and
   one turn.
8. **`idempotency.test.ts`** — simulate refresh, back/forward and reconnect at each step; count server
   writes; assert one record and one turn, with a stable `Idempotency-Key` per intent.
9. **`partial-failure.test.ts`** — force the turn call to fail; assert navigation to the created
   record, the failure state with the request id, one retry action, and that the retry re-posts under
   the same key producing no duplicate.
10. **`pii-response.test.ts`** — return a fixture `422 EMPLOYEE_PII_DETECTED` for the notes; assert the
    field, range, category and placeholder render, the detected value does not, and the user's other
    input survives.
11. **`no-cross-import.test.ts`** — source scan in both directions between this sub-area and
    `features/search/**` / `features/sources/**`; assert none.
12. **`url-and-telemetry.test.ts`** — canary sweep over `location.href`, `document.title`, the
    analytics stub and the client error reporter across the whole flow.
13. **`org-scope.test.ts`** — populate the handoff key for organisation A, switch to B mid-flow; assert
    the selection is discarded after confirmation and never posted under B.
14. **`a11y.test.ts`** — `packages/ui/test/a11y.ts` at 360/768/1280 px over the whole flow.
15. **`[human]` steps**, run last against a locally composed stack (`pnpm stack:up`): the PRD §33.1
    search → select → save script end to end, confirming the query text appears nowhere on the record;
    the PRD §41.1 width and keyboard review; the founder copy review of the notes guidance; and the
    Gate 2 / PRD §41.3 step 5 demonstration path.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** and
`docs/prd/17-records-collab/README.md` (version +0.1 + changelog line) **before** changing code, then
`publish-tickets.mjs --sync`. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`FIND-04` ships a different handoff** — a different URL parameter, a different storage key, or an
  in-memory router state (**QR-7**). → Conform to what exists and write back to
  `docs/prd/17-records-collab/README.md` **D14**/**QR-7** and `docs/prd/14-search-product/README.md` in
  one docs PR, `--sync` both. Do **not** ship a second contract, and do **not** edit
  `apps/web/src/features/search/**` to make yours fit — that tree is `14-search-product`'s (plan §4).
- **`RCRD-08`'s sub-area registry does not exist or cannot mount this flow** (**D13**). → Do **not**
  edit `records/feature.tsx`; that file is `RCRD-08`'s and editing it breaks the disjointness plan
  §5.18 depends on. Amend `RCRD-08`'s ticket and this one together in one docs PR, `--sync` both, then
  implement.
- **The selection is too large for session storage** (a user selects hundreds of results). → Bound the
  selection in the **UI** with a stated limit and an explanation, and record the limit in
  `docs/prd/17-records-collab/README.md`. Do **not** move the payload into the URL — PRD §41.1 and the
  practical URL-length limit both forbid it — and do not create a server-side "selection" resource
  without a new `RCRD-0x`/`01-app-data` ticket and a plan edge.
- **A user wants the search query saved on the record** so they remember what they searched. → PRD
  §33.1 step 6 permits **only** *"the selected stable IDs and user-authored anonymous notes"*. The
  user may type the query into the notes themselves, which then passes PII admission like any other
  note. Widening the write is a **product change** under PRD §45.5: record it in
  `docs/prd/17-records-collab/README.md` open questions with the **Founder** as owner; never copy the
  query automatically.
- **A snippet needs to be stored so the record reads well offline.** → PRD §15.3 makes citations
  identity-plus-offsets and PRD §11.1 restricts excerpt reproduction; the record re-reads corpus text
  through the shared evidence panel. If offline snapshots of source text are genuinely required, that
  is an export concern (`19-exports`, PRD §8.9) with its own licence limits — raise it there, not here.
- **The two sequential writes need to be atomic.** → PRD §34.3 already provides the atomic path for the
  *answer* flow (*"Creating a record and admitting the job occur in the same transaction"*) via
  `DATA-06.createRecord(tx, …)`. If this flow needs the same, it is a **new API** on `RCRD-01`/`RCRD-02`
  (one endpoint creating record+turn in one transaction), raised as a docs PR against those tickets and
  recorded in `docs/prd/17-records-collab/README.md` — never a client-side "transaction" or a
  compensating delete, which PRD §35.8 invariant 5 forbids for turns in any case.

**3. Escalation.** Two non-negotiable classes:

- Anything that would write **more than the selected stable IDs and the user's anonymous notes** —
  copying the query, a snippet, a result title or a filter's free text into the record — overturns
  PRD §33.1 step 6 and the anonymity model PRD §10.1 and §37.1 rest on. Stop and escalate through the
  PRD §45.5 product-change path.
- Anything that would require **editing or deleting the authorities turn** after creation — for
  example a "fix my selection" affordance that mutates it — overturns PRD §8.7 and PRD §35.8
  invariant 5. The correct flow is a **new superseding turn** (`RCRD-02`'s `supersedes_turn_id`).
  Escalate; never soften immutability inside this ticket.
