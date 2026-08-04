---
id: RCRD-08
title: "Records list and record detail screens (six tabs)"
module: 17-records-collab
lane: 17-records-collab
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-05, RCRD-02, RCRD-04, RCRD-05, WTCH-01]
blocks: [RCRD-09, XPRT-05, ASSR-01]
---

# RCRD-08 — Records list and record detail screens (six tabs)

Implements PRD §31.2, §32.6 and §41.1 — requirements **REC-001**, **REC-003**, **REC-004**, epic
`E24-RECORDS`.
No ADR — the decision is already made in PRD §32.6 (the header fields, the six tabs, the append-only
Timeline) and §31.2 (the two routes and their empty states); this is build ticket 8 of 9 against it.
Parent sub-PRD: [17-records-collab README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `RUNT-05` — Web app shell ([`03-app-runtime`](../../03-app-runtime/README.md)) ·
[RCRD-02 — Immutable turns with supersede semantics](RCRD-02-immutable-turns-with-supersede-semantics.md)
· [RCRD-04 — Review actions and workflow transitions](RCRD-04-review-actions-and-workflow-transitions.md)
· [RCRD-05 — Comments on record, answer, claim or citation](RCRD-05-comments-on-record-answer-claim-or-citation.md)
· `WTCH-01` — Watchlist and watch-target routes
([`16-monitor-alerts`](../../16-monitor-alerts/README.md))
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §32.6 is a finished screen contract and `packages/ui` supplies every primitive; this composes them.

## Background + basis

**PRD §31.2 route table**, the two rows this ticket owns:

> | `/records` | Research Records | all; write by role | Filter/create/open records | **Explain
> immutable history and internal review** |
> | `/records/:recordId` | Record detail | authorised record members | Add turn/review/comment/rerun |
> **Timeline of versions and corrections** |

**PRD §32.6 Research Record**, the screen contract, verbatim:

> Header fields: title, stable ID, owner, reviewer, workflow status, legal context, tags,
> created/updated time and **correction badge**. Tabs: **Timeline**, **Answers**, **Evidence**,
> **Comments**, **Watch**, **Audit**. **The Timeline is append-only. Editable title/tags/assignments
> use ETag; formal turns/answers are never edited.**

followed by the seven-row transition table (`FND-08`'s twelve expanded pairs, exposed by `RCRD-04`).

**PRD §8.7**'s boundary, which this ticket is the last line of defence for: *"`CUSTOMER_REVIEWED`
means customer-internal review and MUST NOT imply legal verification by the product owner or a
lawyer."* This is the only place a human reads the words, so the copy assertion belongs here as much
as in `RCRD-04`.

**PRD §41.1 universal UI acceptance**, every clause of which applies:

> - works at 360 px, 768 px and 1280 px widths without hiding legal status, citations, primary actions
>   or error recovery;
> - complete keyboard operation with visible focus and logical order;
> - one programmatic page heading, labelled fields, error summaries and live regions for asynchronous
>   status;
> - colour is never the only status signal;
> - dates display unambiguously as `3 Aug 2026` in UI while APIs use ISO format;
> - jurisdiction, legal status and source freshness use text plus badge/icon;
> - destructive/security-sensitive actions name exact effect and recovery;
> - request/job/correction IDs are copyable from errors and support panels;
> - **customer research content is not placed in URL query strings, analytics, browser error telemetry
>   or page titles**;
> - refresh/back/forward/reconnect does not duplicate writes or charges.

**PRD §31.3** binds every asynchronous panel: *"Every job-driven screen MUST implement `IDLE`,
`VALIDATING`, `QUEUED`, `RUNNING`, `WAITING_FOR_CLARIFICATION`, `CANCELLING`, `COMPLETED`, `FAILED`,
`CANCELLED` and `EXPIRED` where retention permits. Each state needs a visible title, plain-language
explanation, allowed next action and request/job ID. **A spinner without state or recovery guidance is
not acceptable.**"* `RUNT-06`'s `JobStateView` is the single component that covers all ten
(breakdown plan **A6**); this ticket composes it and defines no second set.

**PRD §41.2 `UAT-REC-02`**, the founder script this screen must pass: *"Two browsers update title with
same ETag → First succeeds; second receives 409 and **reload guidance**."* The reload guidance is a UI
obligation, not an API one.

**`RUNT-05`'s A1 web registration contract**, which this ticket is a consumer of:

> **2. Required entry file.** A feature area MUST contain `feature.tsx` with a **default export** of
> type `FeatureModule` … `id` must equal the directory name … `nav.slot` one of the eleven PRD §31.1
> slot ids … `onOrganizationChange` — *"Called on organisation switch; must drop every
> organisation-scoped cache the feature holds."*
> **3. Navigation slots are PRD-fixed** — the frozen tuple includes `'RECORDS'` at position 7,
> exactly PRD §31.1 item 7.
> **5. Organisation scoping is mandatory for cached state.** Every cache key a feature creates MUST be
> produced by `orgScopedKey(...)` from `apps/web/src/lib/org-scope.ts`.
> **6. Stability guarantee.** Adding, renaming or removing a feature area produces **zero** diff
> outside that area's own directory.

**`RUNT-06`'s `packages/ui` surface** this ticket composes: `JobStateView` (ten states) +
`state-copy.ts`, `EvidencePanel` (`mode: 'source' | 'claim' | 'candidate'`), `ClaimText`,
`SafeMarkdown`, the primitive set (`Button`, `TextField`, `MultiSelect`, `Dialog`, `Tabs`, `Table`,
`Chip`, `Badge`, `CopyableId`, `ErrorSummary`, `LiveRegion`, `PageHeading`, `SkipLink`, `EmptyState`,
…), the status badges (`LegalStatusBadge`, `JurisdictionBadge`, `FreshnessBadge`,
`AuthorityRoleBadge`, `CitationRelationBadge`), `format/date.ts` (the `3 Aug 2026` rule),
`DestructiveAction`, and `packages/ui/test/a11y.ts` — *"Exported so every downstream screen ticket runs
the identical check."*

**Accepted caveats carried forward, documented not enforced here:**

- **This ticket is `blocked_by` neither `RCRD-03` nor `RCRD-07`, yet it renders the Answers tab and the
  correction badge** (sub-PRD **QR-3**). That is a plan-edge finding raised, not fixed. It is
  buildable because of sub-PRD **D12**: screens are written against `packages/contracts`' generated
  types and committed synthetic fixtures, never against a running sibling route, and PRD §34.5 already
  carries `correction_state` on the snapshot payload. Any tab whose endpoint is unavailable renders a
  PRD §31.3 state with a copyable request id — never a blank panel and never a silent success.
- **The Audit tab shows the record's own append-only history**, not the organisation audit log
  (sub-PRD **D11**): `/v1/audit-events` is `20-developer-platform`/`PLTF-09` and module `20` sits
  above `17` in the topological order, so an edge would fail `dag-scan.mjs` (plan §3, R6).
- **`RCRD-09` owns `records/from-search/**`.** This ticket must therefore ship the sub-area registry
  (sub-PRD **D13**) so `RCRD-09` adds its directory with **zero** diff to this ticket's files —
  `RUNT-05` contract item 6 applied one level down, because plan §5.18 splits one feature area across
  two tickets.
- **The disclaimer copy is `24-launch`/`LNCH-01`** (`docs/policies/**`). This ticket renders the
  acknowledgement control and the neutral §8.7 wording; it holds no policy prose.

## Goal

Produce `apps/web/src/features/records/**` (except `from-search/**`): the `/records` list and
`/records/:recordId` detail screens as one `RUNT-05` feature area, with the PRD §32.6 header including
the correction badge, all six tabs, an append-only Timeline, ETag-guarded header editing with reload
guidance on `409`, the workflow transition control including the `CUSTOMER_REVIEWED` disclaimer
acknowledgement, and a sub-area registry that lets `RCRD-09` extend the feature without touching a
file here. Completion is mechanically checkable: a component test proves all six tabs exist and that
the Timeline exposes no edit affordance; a `409` test proves the stale-ETag path renders reload
guidance; the `packages/ui/test/a11y.ts` harness passes at 360/768/1280 px; a URL/telemetry assertion
proves no research content leaves in a query string, page title or error payload; and the sub-area
registry test proves a new sub-directory registers with zero diff.

## Non-goals

- **No API routes, worker handlers, tables or repositories.** `RCRD-01` … `RCRD-07`, `01-app-data`.
  PRD §45.2: `apps/web` owns *"Screen contracts/accessibility/client state"* and must **not** own
  *"Security-boundary PII or tenant enforcement"* — the server decides (`RUNT-02`).
- **No `records/from-search/**`.** `RCRD-09`, which is `blocked_by` this ticket. This ticket ships the
  sub-area registry it plugs into and writes nothing inside that directory.
- **No shared UI components.** `packages/ui` (`RUNT-06`, plan **A6**). If a primitive is missing, it is
  a `RUNT-06` writeback, not a local component (Feedback obligation).
- **No app shell, navigation slots, organisation switcher, status bar, `orgScopedKey`, dirty-form
  registry or API client.** `RUNT-05` (`apps/web/src/{app,shell,lib}/**`).
- **No search, ask, answer, coverage, compare, monitor, export, developer or settings screens.** The
  other eight feature areas under `apps/web/src/features/` (plan §4).
- **No export rendering or download UI.** `19-exports`/`XPRT-05`, which is `blocked_by` this ticket.
- **No watchlist creation UI.** `16-monitor-alerts`/`WTCH-07` owns `features/monitor/watchlists/**`;
  the **Watch** tab here *lists* the record's watch targets read-only and links to that screen.
- **No answer synthesis, rerun trigger implementation or diff computation.** `RCRD-03` and
  `15-answer-product`; this screen calls their endpoints and renders their responses.
- **No organisation-wide audit log.** `20-developer-platform`/`PLTF-09` (sub-PRD **D11**).
- **No policy or disclaimer prose.** `24-launch`/`LNCH-01`.
- **No cross-boundary E2E or accessibility suite.** `tests/e2e/**` is `23-assurance` (`ASSR-06`,
  `ASSR-07`); `tests/tenant-isolation/**` is `ASSR-01`, which is `blocked_by` this ticket. Co-located
  checks here per plan R8.
- **No `apps/web/package.json` or `tsconfig.json` edit** — `03-app-runtime` (sub-PRD **D16**).

## File-scope (write-owns)

- `apps/web/src/features/records/**` — **except** `apps/web/src/features/records/from-search/**`
  (exactly plan §5.18's carve-out).
- `apps/web/test/records/**` — except `apps/web/test/records/from-search/**` (sub-PRD **D15**).

Does not touch:

- `apps/web/src/features/records/from-search/**` — `RCRD-09`.
- `apps/web/src/features/{home,auth,settings,search,sources,ask,answers,coverage,compare,monitor,exports,developer,usage,legal}/**`
  and `apps/web/public-site/**` — `03`, `13`, `14`, `15`, `16`, `19`, `20`, `24`.
- `apps/web/src/{app,shell,lib}/**`, `apps/web/index.html`, `apps/web/vite.config.ts`,
  `apps/web/{package.json,tsconfig.json}` — `RUNT-05` / `03-app-runtime` (**D16**).
- `packages/ui/**` — `RUNT-06`; `packages/contracts/**`, `schemas/openapi/**` — `00-foundation`.
- `apps/api/**`, `apps/worker/**`, `apps/admin/**`, `apps/widget/**`, `infra/**`, `tests/**`,
  `docs/policies/**` — other modules.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, no in-flight
ticket), so nothing has previously written `apps/web/src/features/records/**` and nothing contends for
it. Under plan **A1** and `RUNT-05`'s contract, `apps/web/src/features/` is discovered by a Vite glob —
*"a **pattern, not a list**: adding a feature directory changes no tracked file"* — so adding this
feature area produces zero diff outside it, and the eight sibling feature areas owned by other modules
are eight disjoint directories. The **only** intra-module contention is with `RCRD-09`, which owns
`records/from-search/**`; plan §5.18 carves it out by name, `RCRD-09` is `blocked_by` this ticket so
they are never in flight together, and sub-PRD **D13**'s sub-area registry makes `RCRD-09`'s addition
diff-free here as well. Per plan **A3** this ticket writes no table and no repository; per PRD §45.2 it
enforces no tenant or PII boundary — both remain server-side, which is what keeps this screen a pure
consumer of five sibling route areas without any file dependency on them.

## Deliverables

1. **`apps/web/src/features/records/feature.tsx`** — the `RUNT-05` `FeatureModule` default export:
   `id: 'records'`; routes `/records` and `/records/:recordId` (exactly PRD §31.2 — no route is
   invented); `nav: { slot: 'RECORDS', label: 'Research Records', to: '/records', visibleWhen }` where
   the predicate is this feature's, not the shell's (`RUNT-05` contract item 3);
   `onOrganizationChange` dropping every `orgScopedKey` cache this feature holds (contract item 5).
2. **The sub-area registry (sub-PRD D13).** `feature.tsx` composes its route list from its own routes
   **plus** `import.meta.glob('./*/sub-area.ts*', { eager: true })`, validating each sub-area's
   `id === directory name`, rejecting a duplicate path with a named build error, and mounting sub-area
   routes under `/records`. This is `RUNT-05`'s A1 contract applied one level down so `RCRD-09` adds
   `from-search/sub-area.tsx` with **zero** diff outside its own directory. The registry ships with a
   test helper `apps/web/test/records/sub-area-conformance.ts` exported for `RCRD-09` to reuse — the
   executable form of the contract.
3. **`/records` — the list screen** (PRD §31.2 *"Filter/create/open records"*):
   - a filterable, sortable table (`packages/ui`'s `Table`, `Chip`, `MultiSelect`) over
     `GET /v1/research-records` with filters for workflow status, owner, reviewer, tags and legal-date
     range, and cursor pagination;
   - a **create** action opening a dialog with the PRD §34.7 create fields (title, legal context,
     owner, reviewer, tags), submitting `POST /v1/research-records`;
   - the PRD §31.2 first-use state: *"Explain immutable history and internal review"* — rendered
     through `packages/ui`'s `EmptyState`, with wording that explains customer-internal review and
     **never** implies legal verification (sub-PRD **D6**);
   - workflow status rendered as **text plus badge**, never colour alone (PRD §41.1).
4. **`/records/:recordId` — the header** (PRD §32.6): title, stable ID (through `CopyableId`), owner,
   reviewer, workflow status, legal context (`legal_as_at` + jurisdictions, each a
   `JurisdictionBadge`), tags, created/updated time (`format/date.ts` → `3 Aug 2026`), and the
   **correction badge** driven by `correction_state` from the record's latest answer snapshot payload
   (PRD §34.5) — see Deliverable 8.
5. **ETag-guarded header editing with reload guidance (`UAT-REC-02`).** Editing title, tags, owner or
   reviewer sends `PATCH` with the `If-Match` captured on load. On `409 CONCURRENT_MODIFICATION` the
   screen:
   - keeps the user's unsaved input (never silently discards it);
   - shows an `ErrorSummary` naming the conflict in plain language with the **copyable `request_id`**;
   - offers exactly one primary action — reload the latest version — and shows what changed if the
     server supplied the new `ETag`;
   - never retries automatically and never overwrites.
   No other field is editable: the form has inputs for exactly PRD §32.6's *"title/tags/assignments"*.
6. **The workflow transition control** (PRD §32.6 via `RCRD-04`). A `DestructiveAction`-wrapped
   dialog per transition that names the exact effect and the recovery path (PRD §41.1), collects the
   required reason where §32.6 demands one, and — for `IN_REVIEW → CUSTOMER_REVIEWED` — requires an
   **explicit disclaimer acknowledgement** checkbox whose label is the neutral §8.7 wording:
   *"customer-internal review; does not imply legal verification by the product owner or a lawyer."*
   Unavailable transitions are shown as unavailable with the reason (from `RCRD-04`'s refusal), not
   hidden — PRD §31.3's principle that a user must always see the allowed next action.
7. **Tab 1 — Timeline (append-only).** Turns (`RCRD-02`) interleaved with review actions (`RCRD-04`)
   and answer versions, in `sequence`/`created_at` order. A superseded turn is rendered **visibly and
   marked as superseded**, never removed — PRD §32.6 makes the Timeline append-only, and PRD §8.7 says
   corrections *supersede* rather than overwrite. There is **no** edit or delete affordance on any
   timeline entry; adding a turn opens a form that posts a **new** turn, and correcting one posts a
   new turn with `supersedes_turn_id`. A toggle switches between the `all` and `effective` views
   `RCRD-02` exposes.
8. **Tab 2 — Answers.** The record's answer versions (`GET /v1/research-records/{id}/answers`,
   `RCRD-03`) with `answer_version`, status, `legal_as_at`, corpus release, `correction_state` and
   created time; actions to open a snapshot (`/answers/:snapshotId`, `15-answer-product`), **rerun**
   (through `ASK-04`'s admission endpoint) and **compare two versions** (rendering `RCRD-03`'s diff).
   A version carrying `correction_state !== 'NONE'` shows the correction badge with a link to the
   correction. Per sub-PRD **D12**/**QR-3**, this tab is built against the generated types and
   fixtures; if the endpoint is unavailable it renders a PRD §31.3 `FAILED` state with the request id,
   never an empty list that reads as "no answers".
9. **Tab 3 — Evidence.** `packages/ui`'s `EvidencePanel` in `claim` mode (`RUNT-06` deliverable 3,
   plan **A6**) over the selected answer version: selecting a claim shows its citations; selecting a
   citation shows exact text, pinpoint, effective interval, authority role, official URL and the
   supports/qualifies/contradicts relation (PRD §32.3). This ticket composes the shared panel and
   defines no second evidence renderer.
10. **Tab 4 — Comments.** `RCRD-05`'s comments for this record, grouped by target (record, answer,
    claim, citation), with create, edit (ETag-guarded, same `409` treatment as Deliverable 5), resolve
    and unresolve. Selecting a claim-targeted comment highlights the claim in the Evidence tab
    (PRD §32.3's claim↔citation interaction), driven by the same selection state.
11. **Tab 5 — Watch.** The record's watch targets read from `WTCH-01`'s watchlist endpoints,
    read-only, with a link to `/monitor/watchlists` for creation and editing
    (`16-monitor-alerts`/`WTCH-07` owns that screen). PRD §32.6 lists the tab; PRD §8.8 makes
    *"authorities referenced by Research Records"* a watch-target kind, which is why this tab exists
    on the record.
12. **Tab 6 — Audit (sub-PRD D11).** The record's own append-only history: review actions with
    from/to status, actor and reason; turn additions; answer versions; comment and correction events.
    Every row carries a copyable id (PRD §41.1). It does **not** query `/v1/audit-events`.
13. **PRD §31.3 states everywhere.** Every asynchronous panel — list load, tab load, rerun progress,
    diff computation, correction impact — renders through `RUNT-06`'s `JobStateView` with a visible
    title, plain-language explanation, allowed next action and copyable request/job id. No bare
    spinner exists anywhere in this feature.
14. **PRD §41.1 compliance as code, not intention.**
    - `format/date.ts` for every displayed date (`3 Aug 2026`), ISO only on the wire.
    - One `PageHeading` per screen, provided by the shell slot; `SkipLink` from the shell.
    - `LiveRegion` announcements for every asynchronous state change.
    - Every status uses **text plus badge/icon**.
    - Destructive and security-sensitive actions (archive, delete, transition to `CUSTOMER_REVIEWED`)
      use `DestructiveAction` with exact effect and recovery text.
    - **No customer research content in URLs, page titles, analytics or error telemetry.** Record
      titles, turn content, comment bodies and answer text never appear in `document.title`, a query
      string, a hash fragment or a client error payload. Only opaque ids do.
    - Refresh/back/forward/reconnect duplicates no write: every mutating action carries an
      `Idempotency-Key` generated once per user intent and reused across retries (PRD §34.1).
15. **Organisation scoping.** Every cache key uses `orgScopedKey` (`RUNT-05` contract item 5), and
    `onOrganizationChange` purges them; unsaved forms register with `registerDirtyForm` so the shell's
    switch flow can confirm before discarding (PRD §31.1). Verified with
    `apps/web/test/org-scope-conformance.ts` (`RUNT-05` deliverable 7).
16. **Committed synthetic fixtures** — `apps/web/test/records/fixtures/`: `record.json`,
    `record-list.json`, `turns-with-supersession.json`, `answer-versions.json` (including one with
    `correction_state !== 'NONE'`), `answer-snapshot.json` (PRD §34.5-shaped, reusing `RUNT-06`'s
    fixture shape), `comments.json`, `watch-targets.json`, `audit-entries.json` and
    `conflict-409.json`. All synthetic; no customer content and nothing from `evals/gold/**`
    (PRD §45.1 item 6; plan R9).

## Acceptance checklist (classified)

- [ ] `[machine]` The feature registers through `RUNT-05`'s glob with `id: 'records'`, claims nav slot
      `'RECORDS'`, and exposes exactly the PRD §31.2 routes `/records` and `/records/:recordId` — no
      invented route (PRD §31.1, §31.2; `RUNT-05` contract items 1–3)
- [ ] `[machine]` **Sub-area registry (sub-PRD D13):** a throw-away `records/<x>/sub-area.tsx` created
      at test time is discovered and mounted with **zero** diff to any tracked file outside that
      directory, and a duplicate path fails the build naming both sub-areas — asserted by
      `apps/web/test/records/sub-area-conformance.ts`, which `RCRD-09` reuses (`RUNT-05` contract
      item 6)
- [ ] `[fixture]` **All six PRD §32.6 tabs exist and render** from committed fixtures — Timeline,
      Answers, Evidence, Comments, Watch, Audit — asserted against the literal six-name list so a
      missing tab fails (PRD §32.6)
- [ ] `[fixture]` **Header completeness:** title, stable ID, owner, reviewer, workflow status, legal
      context, tags, created/updated time and **correction badge** are all present, asserted against
      the literal PRD §32.6 field list (PRD §32.6)
- [ ] `[machine]` **REC-001 / append-only Timeline:** no edit or delete affordance exists on any
      timeline entry — asserted by rendering `turns-with-supersession.json` and requiring zero
      elements with an edit/delete role or handler; a superseded turn is **visible and marked**, not
      removed (PRD §32.6 *"The Timeline is append-only"*; §8.7)
- [ ] `[machine]` Correcting a turn from the UI posts a **new** turn with `supersedes_turn_id`; no code
      path issues `PUT`/`PATCH`/`DELETE` against a turn or an answer (PRD §34.7; §35.8 invariant 5)
- [ ] `[fixture]` **`UAT-REC-02` reload guidance:** replaying `conflict-409.json` renders an
      `ErrorSummary` naming the conflict, preserves the user's unsaved input, offers exactly one
      reload action, shows the copyable `request_id`, and performs **no** automatic retry
      (PRD §41.2 `UAT-REC-02` *"second receives 409 and reload guidance"*; §30.2 REC-004)
- [ ] `[machine]` The header edit form has inputs for exactly title, tags, owner and reviewer — no
      control exists for `workflow_status`, legal context or any id (PRD §32.6)
- [ ] `[machine]` **`CUSTOMER_REVIEWED` never implies verification:** the transition control requires
      an explicit disclaimer acknowledgement; the rendered label matches `RCRD-01`'s
      `customer-reviewed-copy.json`; and a forbidden-word assertion over **every string this feature
      renders** (labels, tooltips, badges, empty states, error copy) finds none of *verified*, *legal
      review*, *approved by*, *certified*, *compliant* (PRD §8.7 *"MUST NOT imply legal verification
      by the product owner or a lawyer"*; §11.2; sub-PRD **D6**)
- [ ] `[machine]` Unavailable transitions are rendered as unavailable **with a reason**, not hidden
      (PRD §31.3's allowed-next-action principle; §32.6)
- [ ] `[machine]` **PRD §31.3 states:** every asynchronous panel renders through `JobStateView` with
      title, explanation, allowed action and copyable request/job id; a source scan finds **no** bare
      spinner and no panel that can render without an explanation (PRD §31.3; `RUNT-06` deliverable 2)
- [ ] `[machine]` A tab whose endpoint is unavailable renders a `FAILED` state with the request id —
      **not** an empty list — asserted for the Answers tab specifically (sub-PRD **D12**, **QR-3**)
- [ ] `[machine]` **No research content leaves the app:** record titles, turn content, comment bodies
      and answer text appear in no `document.title`, no URL query string or hash, no analytics call and
      no client error payload — asserted with canaries across a full navigation of both screens
      (PRD §41.1)
- [ ] `[machine]` Every displayed date renders as `3 Aug 2026` via `packages/ui`'s `format/date.ts`,
      while every request carries ISO 8601 / `YYYY-MM-DD` (PRD §41.1; §34.1)
- [ ] `[machine]` Every status, jurisdiction and freshness indicator renders **text plus badge/icon**;
      a colour-only signal fails the assertion (PRD §41.1)
- [ ] `[machine]` Destructive and security-sensitive actions (archive, delete, `CUSTOMER_REVIEWED`)
      render through `DestructiveAction` with exact effect **and** recovery text; the component refuses
      to render without both (PRD §41.1; `RUNT-06` deliverable 9)
- [ ] `[machine]` **No duplicate writes:** refresh, back, forward and reconnect during a create, patch,
      transition, comment or rerun produce exactly one server write — asserted by counting requests
      with a shared `Idempotency-Key` per user intent (PRD §41.1; §34.1)
- [ ] `[machine]` **Organisation scoping:** every cache key is produced by `orgScopedKey`;
      `onOrganizationChange` purges them all; unsaved forms are registered with `registerDirtyForm` —
      asserted with `apps/web/test/org-scope-conformance.ts` (PRD §31.1; `AUTH-002`; `RUNT-05`
      contract item 5)
- [ ] `[machine]` **Tenant isolation, client side (PRD §21.2 / SEC-001):** the feature never sends an
      organisation identifier in a body, query or header, and a `404` from any endpoint renders the
      same "not found" state regardless of whether the id was absent or foreign — the client cannot
      distinguish, and must not try (PRD §16.5, §34.1; `UAT-AUTH-03`; the cross-boundary suite is
      `ASSR-01`, which is `blocked_by` this ticket)
- [ ] `[machine]` **No boundary enforcement in the client:** a source scan finds no permission table,
      no PII detection and no tenant check in this feature — all are server-side (PRD §45.2:
      `apps/web` must not own *"Security-boundary PII or tenant enforcement"*)
- [ ] `[machine]` No component is defined here that duplicates a `packages/ui` primitive, evidence
      panel or async-state view — asserted by an import check (plan **A6**; `RUNT-06`)
- [ ] `[machine]` **Accessibility (automated):** `packages/ui/test/a11y.ts` passes for both screens and
      all six tabs at **360 px, 768 px and 1280 px**, with complete keyboard operation, visible focus,
      logical order, one programmatic page heading, labelled fields, error summaries and a live region
      (PRD §41.1; §13.1 WCAG 2.2 AA target; `RUNT-06` deliverable 12)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration` green
      (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — the feature consumes generated
      `packages/contracts` types and hand-edits no binding (PRD §20.1; `DEV-001`)
- [ ] `[human]` **`UAT-REC-02` two-browser script** (PRD §41.2): two browsers open the same record,
      both edit the title with the same ETag; the first succeeds, the second shows the 409 state with
      reload guidance and does not lose the typed text. Run by the founder against the deployed
      surface; automated by `23-assurance`/`ASSR-06`
- [ ] `[human]` **`UAT-REC-01` visual half** (PRD §41.2): after a rerun, the record shows a new version
      **and** the original version, both openable, with the original's legal date and corpus release
      unchanged on screen. (The byte-for-byte guarantee itself is `RCRD-03`'s `[machine]` test.)
- [ ] `[human]` **PRD §41.1 manual review** at 360/768/1280 px: legal status, citations, primary
      actions and error recovery remain visible at every width; the six tabs are reachable by keyboard
      in a logical order; no colour-only signal is perceptible in greyscale
- [ ] `[human]` **PRD §43.4 founder review** of the `CUSTOMER_REVIEWED` acknowledgement copy and the
      correction badge wording — item 6 of the founder test queue (*"UI/manual acceptance failures"*).
      A wording change is a `24-launch`/`LNCH-01` policy question, recorded not patched
- [ ] `[human]` **Gate 2 smoke test** (CLAUDE.md): open `/records`, create a record, add a turn, assign
      a reviewer, move it through `DRAFT → IN_REVIEW`, comment on a claim and open the Audit tab —
      the PRD §41.3 step 5 demonstration path (*"save to a Research Record, assign a reviewer and show
      immutable versions/comments"*)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**REC-001**, **REC-003**,
      **REC-004**, `UAT-REC-01`, `UAT-REC-02`, `UAT-AUTH-03`, `E24-RECORDS`), user-visible change and
      non-goals, schema/API/event compatibility (consumes generated types only), tenant/PII/security
      impact (none enforced client-side, by design), source/licence impact (citations rendered through
      the shared evidence panel under its licence limits), cost/memory/latency impact (rerun is a paid
      job initiated here — state it), rollback path (revert; `RCRD-09`, `XPRT-05` and `ASSR-01` consume
      this ticket), known gaps (**QR-3** missing `RCRD-03`/`RCRD-07` edges)
- [ ] No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected (PRD §45.3)

## Test plan

Reviewer steps. Every `[machine]` and `[fixture]` step is offline: no network, no API server, no model
provider. Screens are exercised against committed fixtures through the generated client's mock seam
(sub-PRD **D12**).

1. `pnpm typecheck && pnpm lint`; `pnpm test --filter <the apps/web package name>`; suites under
   `apps/web/test/records/`.
2. **Harness.** The component-test setup `RUNT-05` established for `features/home/**`, plus
   `packages/ui/test/a11y.ts` (`RUNT-06` deliverable 12) and
   `apps/web/test/org-scope-conformance.ts` (`RUNT-05` deliverable 7). Copy those construction
   patterns rather than inventing a third.
3. **`feature-registration.test.ts`** — assert `id`, nav slot, route list against the literal PRD
   §31.2 rows; assert no additional route.
4. **`sub-area-conformance.test.ts`** — create a throw-away `records/zz-test/sub-area.tsx` under a test
   root, assert it mounts, then remove it; assert `git status --porcelain` is clean afterwards. Assert
   a duplicate path fails the build naming both sub-areas.
5. **`tabs.test.ts`** — render the detail screen from fixtures; assert the six tab names against the
   literal list; assert each renders its fixture content and is keyboard-reachable in order.
6. **`timeline-append-only.test.ts`** — render `turns-with-supersession.json`; assert zero edit/delete
   affordances (query by role and by handler presence); assert a superseded turn is present and marked;
   assert the correction flow issues a `POST` with `supersedes_turn_id` and never a `PATCH`.
7. **`etag-conflict.test.ts`** — replay `conflict-409.json`: assert the input text survives, the
   `ErrorSummary` appears with the request id, exactly one reload action is offered, and no automatic
   retry request is issued (count outbound calls).
8. **`transitions.test.ts`** — for each transition `RCRD-04` exposes: assert the dialog names effect and
   recovery; assert the reason field is required where §32.6 requires it; assert
   `IN_REVIEW → CUSTOMER_REVIEWED` is blocked until the acknowledgement checkbox is ticked; assert
   unavailable transitions render with a reason.
9. **`copy.test.ts`** — walk every rendered string in both screens and all six tabs; assert the
   `CUSTOMER_REVIEWED` strings match `customer-reviewed-copy.json` and the forbidden-word list appears
   nowhere.
10. **`async-states.test.ts`** — force each of the ten PRD §31.3 states on each asynchronous panel;
    assert title, explanation, action and copyable id in every case; grep the feature source for a
    spinner component not wrapped by `JobStateView` and assert none.
11. **`no-content-leak.test.ts`** — seed fixtures whose title, turn content, comment body and answer
    text carry distinct canaries; drive a full navigation of both screens and all tabs; assert no canary
    appears in `document.title`, `location.href`, any analytics stub call or any client error payload.
12. **`idempotency.test.ts`** — perform create, patch, transition, comment and rerun; simulate refresh,
    back/forward and reconnect mid-flight; assert one server write per intent and a stable
    `Idempotency-Key`.
13. **`org-scope.test.ts`** — run `apps/web/test/org-scope-conformance.ts` against this feature; assert
    every cache key is org-scoped and all are purged on switch; assert dirty forms are registered.
14. **`a11y.test.ts`** — run `packages/ui/test/a11y.ts` at 360/768/1280 px over both screens and all six
    tabs.
15. **`no-boundary-logic.test.ts`** — source scan asserting no permission table, no PII pattern, no
    tenant check and no locally defined UI primitive.
16. **`[human]` steps**, run last against a deployed or locally composed stack (`pnpm stack:up`):
    `UAT-REC-02` in two browsers; the `UAT-REC-01` visual half after a rerun; the PRD §41.1 width and
    keyboard review; the founder copy review (PRD §43.4 item 6); and the Gate 2 smoke path from PRD
    §41.3 step 5.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** and
`docs/prd/17-records-collab/README.md` (version +0.1 + changelog line) **before** changing code, then
`publish-tickets.mjs --sync`. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`packages/ui` lacks a primitive this screen needs** (a tab set, a timeline row, a diff view). →
  Add it to `packages/ui` through a `RUNT-06` docs change, not locally: breakdown plan **A6** exists
  because PRD §32.1/§32.3/§32.4 are the same components in three surfaces, and a local copy would give
  `14`, `15` and `17` three different evidence panels. Record the required component in
  `docs/prd/03-app-runtime/README.md` and `docs/prd/17-records-collab/README.md`, then implement.
- **The Answers tab or the correction badge cannot be built without `RCRD-03`/`RCRD-07`** (**QR-3**).
  → Build against the generated types and fixtures (sub-PRD **D12**) and render the PRD §31.3 state
  when the endpoint is absent. If that is genuinely impossible, it is a **missing plan edge**: write
  back to `docs/prd/breakdown-plan.md` §5.18 + §6.2 and this README. Never import a sibling ticket's
  internals to work around a missing edge.
- **The Audit tab needs organisation-wide audit events.** → `/v1/audit-events` is
  `20-developer-platform`/`PLTF-09` and module `20` is above `17` in the topological order; an edge
  would fail `dag-scan.mjs` (plan §3, R6). Keep the record-scoped Audit tab (sub-PRD **D11**) and
  record the requirement in `docs/prd/17-records-collab/README.md` and
  `docs/prd/20-developer-platform/README.md` for a later phase.
- **The Watch tab needs a write.** → `16-monitor-alerts`/`WTCH-07` owns watch creation
  (`features/monitor/watchlists/**`). Link to it; do not add a watch write here. If a record-scoped
  watch create is genuinely required, record it in both modules' READMEs and add the plan edge first.
- **A PRD §32.6 header field or tab cannot be populated from any existing endpoint.** → That is a
  missing API, not a licence to omit a tab. Raise it against the owning `RCRD-0x` ticket in a docs PR,
  `--sync` both, and only then implement. Shipping five tabs would falsify PRD §32.6.
- **`RUNT-05`'s `FeatureModule` contract cannot express the sub-area registry** (**D13**). → Amend
  `RUNT-05`'s ticket and this one together in one docs PR and `--sync` both. `RCRD-09` depends on the
  registry existing; a late change strands it.
- **A wording change is proposed to the `CUSTOMER_REVIEWED` or correction copy.** → Policy prose is
  `24-launch`/`LNCH-01` (`docs/policies/**`) and the *meaning* is PRD §8.7. Record the proposal in
  `docs/prd/17-records-collab/README.md` open questions with the **Founder** as owner. Never soften
  the disclaimer to make a screen read better.

**3. Escalation.** Two non-negotiable classes:

- Anything that would put an **edit or delete affordance on a turn, an answer snapshot or a review
  action** — even "just for the author, within five minutes" — overturns PRD §8.7, PRD §32.6's
  append-only Timeline and PRD §35.8 invariant 5. Stop and escalate through the PRD §45.5
  product-change path; never soften immutability inside this ticket, and never implement a UI
  affordance whose server-side path does not exist.
- Any copy or badge that states or implies that `CUSTOMER_REVIEWED` means the product owner or a
  lawyer verified the answer overturns PRD §8.7 and PRD §11.2's legal positioning, which are legal
  exposure boundaries and not style choices. Escalate for re-review before it ships.
