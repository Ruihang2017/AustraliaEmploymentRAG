---
id: XPRT-05
title: "Export UI: request, status, download, expiry"
module: 19-exports
lane: 19-exports
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [XPRT-02, XPRT-03, XPRT-04, RCRD-08]
blocks: [ASSR-01, ASSR-06]
---

# XPRT-05 — Export UI: request, status, download, expiry

Implements PRD §31.2, §31.3 and §41.1 — requirement **EXP-002**, epic `E26-EXPORT`.
No ADR — the decision is already made in PRD §31.3 (the ten mandatory asynchronous states), §41.1 (the
universal UI acceptance list) and §8.9/§19.2 (short-lived signed URLs and the seven-day artifact
lifetime that this screen must make visible); this is build ticket 5 of 5 against it. The one thing the
PRD does not state — that PRD §31.2's route table has no export row although PRD §30.2 `EXP-002` names
an *"Export status"* surface — is sub-PRD **QX-3**, resolved by sub-PRD **D12** and recorded, not
invented silently.
Parent sub-PRD: [19-exports README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [XPRT-02 — PDF renderer](XPRT-02-pdf-renderer.md) ·
[XPRT-03 — DOCX renderer](XPRT-03-docx-renderer.md) ·
[XPRT-04 — Versioned JSON export](XPRT-04-versioned-json-export.md) ·
`RCRD-08` — Records list and record detail screens
([`17-records-collab`](../../17-records-collab/README.md))
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §31.3 and §41.1 are finished screen contracts, `RUNT-06` supplies every primitive including the
ten-state view, and `RUNT-05`'s A1 feature contract fixes registration; this composes them.

## Background + basis

**PRD §30.2 `EXP-002`**, the requirement this screen exists for:

> | `EXP-002` | Private artifacts use S3 Sydney signed URLs and expire after seven days | **Export
> status** | export download | App/S3 | **Expired or other-tenant URL is inaccessible** |

The column that matters here is the surface: *"Export status"*. PRD §31.2's route table does not
tabulate it (sub-PRD **QX-3**), so sub-PRD **D12** mints `/exports` and `/exports/:exportJobId`, claims
**no** navigation slot, and is entered by deep link from the screens that host the export action —
`/answers/:snapshotId` (PRD §31.2 main action *"Read/cite/report/export"*; §32.3 item 8 lists *export*
among the answer actions, owned by `15-answer-product`) and `/records/:recordId` (`RCRD-08`).

**PRD §31.3 — mandatory states for every asynchronous screen**, verbatim:

> Every job-driven screen MUST implement: `IDLE`, `VALIDATING`, `QUEUED`, `RUNNING`,
> `WAITING_FOR_CLARIFICATION`, `CANCELLING`, `COMPLETED`, `FAILED`, `CANCELLED` and **`EXPIRED` where
> retention permits**. Each state needs a visible title, plain-language explanation, allowed next
> action and request/job ID. **A spinner without state or recovery guidance is not acceptable.**

An export is the one surface in the product where `EXPIRED` is not a corner case: PRD §8.9 deletes the
artifact after seven days by default, so `EXPIRED` is a **normal** end state and the plan's goal line
for this ticket is *"Expiry and other-tenant denial are visible, not surprising"*
(breakdown plan §5.20). `WAITING_FOR_CLARIFICATION` cannot occur for an export — no clarification round
exists — and the screen states that explicitly rather than pretending the state is reachable.

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

**PRD §8.9** is what the screen must make legible: artifacts are *"delivered through short-lived signed
URLs and deleted after seven days by default"*. **PRD §41.2 `UAT-EXP-02`**: *"Use signed export URL
after expiry/as other tenant → Access denied; artifact lifecycle removes it by seven days."*

**PRD §38.1** decides who sees the action: *"Export accessible records — Owner ✓, Admin ✓, Researcher ✓,
Viewer read-only export if granted, Developer —"*. The **server** decides (`RUNT-02`'s
`evaluate-permission` stage); this screen renders the outcome and encodes no role table
(PRD §45.2: `apps/web` must not own *"Security-boundary PII or tenant enforcement"*).

**`RUNT-05`'s A1 web registration contract**, which this ticket is a consumer of:

> **2. Required entry file.** A feature area MUST contain `feature.tsx` with a **default export** of
> type `FeatureModule` … `id` must equal the directory name … `onOrganizationChange` — *"Called on
> organisation switch; must drop every organisation-scoped cache the feature holds."*
> **3.** … *"`nav` is optional: a feature may register routes without a nav entry."*
> **4. Route collision.** Two features registering the same `path` fail the build naming both.
> **5. Organisation scoping is mandatory for cached state** — every cache key via `orgScopedKey(...)`.
> **6. Stability guarantee.** Adding, renaming or removing a feature area produces **zero** diff
> outside that area's own directory.

**`RUNT-06`'s `packages/ui` surface** this ticket composes: `JobStateView` (ten states) +
`state-copy.ts`, the primitive set (`Button`, `Dialog`, `Table`, `Chip`, `Badge`, `CopyableId`,
`ErrorSummary`, `LiveRegion`, `PageHeading`, `EmptyState`, …), `format/date.ts` (the `3 Aug 2026` rule),
`DestructiveAction`, and `packages/ui/test/a11y.ts` — *"Exported so every downstream screen ticket runs
the identical check."*

**`XPRT-01`'s API surface** this screen calls: `POST /v1/exports` (`202` with the export job id,
`Idempotency-Key` required for retry safety), `GET /v1/exports/{export_job_id}` (status plus a domain
`artifact_state` that becomes `EXPIRED` at `finished_at + 7 days`),
`POST /v1/exports/{export_job_id}/cancel`, and `GET /v1/exports/{export_job_id}/download` (a `302` to a
freshly minted, short-lived, GET-only signed URL — sub-PRD **D11**). Sub-PRD **D7** is what the screen
must render honestly: an expired, cancelled, failed, foreign or unknown export all yield the **same**
`404 RESOURCE_NOT_FOUND` on download, while the job resource itself keeps reporting `artifact_state`.

**Accepted caveats carried forward, documented not enforced here:**

- **This ticket is `blocked_by RCRD-08` but writes nothing under `features/records/**`.** The edge
  exists because the record detail screen is the primary host of the export action and this screen's
  handoff must fit it. The integration is a **deep link with opaque ids** (sub-PRD **D12**), the same
  shape `17-records-collab`'s **D14** uses for search → record. This ticket additionally exports a
  reusable `<ExportDialog>` so a hosting screen can mount it later **without** this ticket editing that
  screen, and vice versa.
- **The screen renders no research content.** It shows job metadata only — ids, target kind, format,
  status, timestamps, expiry, byte size. The answer text lives in the artifact, which the browser
  downloads directly from the object store. This is a deliberate simplification of PRD §8.9's exclusion
  problem: there is nothing to leak because nothing is rendered.
- **The disclaimer lives in the artifact**, placed by `XPRT-02`/`XPRT-03`/`XPRT-04` through
  `XPRT-01`'s `DisclaimerPort` (sub-PRD **D14**). This screen states, in the request dialog, that the
  exported file carries the product disclaimer and the source licence limits — it holds no policy prose
  (`24-launch`/`LNCH-01` owns that).
- **PRD §38.5 allows one concurrent export.** A second request while one is running is rejected by
  `RUNT-02`'s ledger with `429 RATE_LIMITED`; the screen must explain that in plain language with the
  `Retry-After` guidance, not as a raw error.

## Goal

Produce `apps/web/src/features/exports/**`: one `RUNT-05` feature area registering `/exports` and
`/exports/:exportJobId` with no navigation slot, implementing every PRD §31.3 state including
`EXPIRED`, letting a permitted user request a PDF, DOCX or JSON export of a record, answer, comparison
or coverage assessment, watch it progress, download it through a freshly minted short-lived URL, see
exactly when it expires, and see an expired or foreign export as a plain, non-alarming "no longer
available"/"not found" state rather than a broken download. Completion is mechanically checkable: a
component test proves all ten §31.3 states render with title, explanation, allowed action and copyable
id; an expiry test proves the countdown and the `EXPIRED` state; a fixture test proves an expired and a
foreign export render the identical not-found state; a canary test proves no research content and no
signed URL reaches a URL, page title, analytics call or error payload; `packages/ui/test/a11y.ts`
passes at 360/768/1280 px; and the feature registers with zero diff outside its own directory.

## Non-goals

- **No API routes, worker handlers, renderers, tables or repositories.** `XPRT-01` … `XPRT-04`,
  `01-app-data`. PRD §45.2: `apps/web` owns *"Screen contracts/accessibility/client state"* and must
  **not** own *"Security-boundary PII or tenant enforcement"*.
- **No shared UI components.** `packages/ui` (`RUNT-06`, plan **A6**). A missing primitive is a
  `RUNT-06` writeback, not a local component (Feedback obligation).
- **No app shell, navigation slot, organisation switcher, status bar, `orgScopedKey`, dirty-form
  registry or API client.** `RUNT-05` (`apps/web/src/{app,shell,lib}/**`).
- **No edit to any other feature area.** `features/records/**` is `RCRD-08`/`RCRD-09`;
  `features/answers/**`, `features/ask/**`, `features/coverage/**`, `features/compare/**` are
  `15-answer-product`; `features/settings/**` is `13-identity-surface`. The export action reaches them
  by **deep link** and by the exported `<ExportDialog>`, never by editing their files (plan **A1**;
  sub-PRD **D12**).
- **No rendering of answer, claim or citation content.** The artifact carries it; the screen does not.
- **No policy or disclaimer prose.** `24-launch` (`LNCH-01`, `LNCH-02`).
- **No organisation-data or search-result export UI.** Sub-PRD **QX-6**; PRD §10.3's closure export is
  a `/settings/data` flow owned by `13-identity-surface`.
- **No cross-boundary E2E, accessibility or tenant-isolation suite.** `tests/**` is `23-assurance`:
  `ASSR-01` (tenant isolation, including export/download) and `ASSR-06` (E2E `UAT-*` automation) are
  both `blocked_by` this ticket. Co-located checks here per plan **R8**.
- **No `apps/web/package.json` or `tsconfig.json` edit.** `03-app-runtime` (sub-PRD **D15**).

## File-scope (write-owns)

- `apps/web/src/features/exports/**` (exactly plan §5.20).
- `apps/web/test/exports/**` — this ticket's own tests and fixtures (sub-PRD **D16**).

Does not touch:

- `apps/web/src/features/{home,auth,settings,search,sources,ask,answers,coverage,compare,monitor,records,developer,usage,legal}/**`
  and `apps/web/public-site/**` — `03`, `13`, `14`, `15`, `16`, `17`, `20`, `24`.
- `apps/web/src/{app,shell,lib}/**`, `apps/web/index.html`, `apps/web/vite.config.ts`,
  `apps/web/{package.json,tsconfig.json}` — `RUNT-05` / `03-app-runtime` (**D15**).
- `packages/ui/**` — `RUNT-06`; `packages/contracts/**`, `schemas/openapi/**` — `00-foundation`.
- `apps/api/**`, `apps/worker/**` — `RUNT-01`/`RUNT-02`/`RUNT-04` and `XPRT-01` … `XPRT-04`.
- `apps/admin/**`, `apps/widget/**`, `infra/**`, `tests/**`, `docs/policies/**` — other modules.
  `docs/PRD.md` — frozen.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, no in-flight
ticket), so nothing has previously written `apps/web/src/features/exports/**` and nothing contends for
it. Under plan **A1** and `RUNT-05`'s contract, `apps/web/src/features/` is discovered by a Vite glob —
*"a **pattern, not a list**: adding a feature directory changes no tracked file"* — so adding this
feature area produces zero diff outside it, and the thirteen sibling feature areas owned by other
modules are thirteen disjoint directories. This ticket is alone in the module's wave 3: `XPRT-01` …
`XPRT-04` are all merged before it starts (`blocked_by`), and `RCRD-08` — an external blocker in
`17-records-collab` — owns `features/records/**`, which this ticket never writes. Per plan **A3** this
ticket writes no table and no repository; per PRD §45.2 it enforces no tenant or PII boundary — both
stay server-side, which is what keeps this screen a pure consumer of `XPRT-01`'s four endpoints with no
file dependency on any sibling.

## Deliverables

1. **`apps/web/src/features/exports/feature.tsx`** — the `RUNT-05` `FeatureModule` default export:
   `id: 'exports'`; routes `/exports` and `/exports/:exportJobId` (sub-PRD **D12**); **no `nav` entry**
   (contract item 3 — exports are entered from the artifact they describe, not from the primary
   navigation); `onOrganizationChange` dropping every `orgScopedKey` cache this feature holds
   (contract item 5).
2. **`/exports` — the export list and request surface.** A table of this organisation's export jobs
   (`packages/ui`'s `Table`, `Chip`, `Badge`): target kind, target id (`CopyableId`), format, status,
   requested-at, expires-at and size, newest first, cursor-paginated. A **first-use `EmptyState`**
   explaining in plain language what an export is, that the file preserves the answer as it was given
   (never regenerated — PRD §8.9), that it carries the product disclaimer and the source licence
   limits, and that **the download link expires after seven days**. A **Request export** action opens
   the dialog (Deliverable 3).
3. **`<ExportDialog target={{kind, id}} />`, exported from the feature's public entry.** Format picker
   (`PDF` / `DOCX` / `JSON`, from the generated `ExportFormat` enum — never a local list), a short
   plain-language note of what the file will contain and how long it will live, and a submit that posts
   `POST /v1/exports` with an `Idempotency-Key` generated **once per user intent** and reused across
   retries (PRD §34.1; §41.1's *"refresh/back/forward/reconnect does not duplicate writes or
   charges"*). Exporting the component is what lets `/answers/:snapshotId` and `/records/:recordId`
   host the action later with **zero** diff to this ticket's files, and vice versa (plan **A1**).
4. **Deep-link entry (sub-PRD D12).** `/exports?target_kind=ANSWER_SNAPSHOT&target_id=ans_…` opens the
   list with the dialog pre-filled. Only **opaque ids and enum values** ever appear in the URL — never a
   record title, a question, a claim or a filename (PRD §41.1). An unknown or malformed parameter opens
   the plain list with an inline `ErrorSummary`, never a blank screen.
5. **`/exports/:exportJobId` — the status screen**, built on `RUNT-06`'s `JobStateView`, implementing
   **all ten PRD §31.3 states**, each with a visible title, a plain-language explanation, the allowed
   next action and the copyable export-job id:
   - `IDLE`/`VALIDATING`/`QUEUED`/`RUNNING` — progress with the queue position semantics `XPRT-01`
     exposes and a **Cancel** action;
   - `CANCELLING`/`CANCELLED` — cancel acknowledged, nothing downloadable, offer to request again;
   - `COMPLETED` — **Download** plus the expiry line (Deliverable 6);
   - `FAILED` — the bounded failure code, the copyable `request_id`, and a **Request again** action;
   - `EXPIRED` — *"This file is no longer available"*, the date it expired, an explanation that export
     files are deleted after seven days by design, and a **Request again** action that produces a
     **new** export of the same, unchanged source (PRD §8.9; §31.3);
   - `WAITING_FOR_CLARIFICATION` — declared unreachable for exports and rendered as a defensive
     "unexpected state" panel with the copyable id rather than being silently omitted (PRD §31.3 lists
     it; honesty about non-applicability is better than a missing branch).
   No bare spinner exists anywhere in this feature.
6. **Expiry, made legible, not surprising.** On a `COMPLETED` export the screen shows the exact expiry
   as `3 Aug 2026` plus a relative hint (*"about 6 days left"*), and a `DestructiveAction`-style notice
   on the Download button naming the exact effect and recovery: *the link is valid for a few minutes;
   the file itself is deleted after seven days; you can request a new export at any time*
   (PRD §41.1's *"destructive/security-sensitive actions name exact effect and recovery"*; §8.9).
7. **Download.** Every press calls `GET /v1/exports/{id}/download` **afresh** and follows the `302`;
   the client never caches, stores, logs or re-uses a signed URL, and never places it in the address
   bar, in browser history, in a page title, in an analytics call or in an error payload
   (sub-PRD **D11**, **D18**). A `404` renders the sub-PRD **D7** state: *"This export is not
   available"* — the same copy whether the artifact expired, the job failed, the id is unknown or it
   belongs to another organisation, because the client cannot distinguish and must not try
   (PRD §16.5; `UAT-AUTH-03`).
8. **Cancel.** A `DestructiveAction` dialog naming the effect (*the export stops; no file is produced*)
   and the recovery (*request a new export*), posting `POST /v1/exports/{id}/cancel` with an
   `Idempotency-Key`.
9. **Rate-limit and permission outcomes in plain language.** `429 RATE_LIMITED` (the PRD §38.5
   one-concurrent-export ledger) renders as *"One export at a time — this organisation already has an
   export running"* with the `Retry-After` guidance and no other-tenant information. A `403`/`404` from
   a permission decision renders the same neutral not-found/unavailable copy the server chose; the
   client encodes **no** role table (PRD §38.1 is evaluated by `RUNT-02`/`FND-06`).
10. **PRD §41.1 compliance as code, not intention.** `format/date.ts` for every displayed date
    (`3 Aug 2026`) with ISO only on the wire; one `PageHeading` per screen from the shell slot;
    `LiveRegion` announcements for every asynchronous state change; every status as **text plus
    badge/icon**, never colour alone; every id copyable; **no customer research content in URLs, page
    titles, analytics or error telemetry** — the feature renders no research content at all, and the
    assertion is a canary sweep proving it; refresh/back/forward duplicates no export job.
11. **Organisation scoping.** Every cache key uses `orgScopedKey` (`RUNT-05` contract item 5) and
    `onOrganizationChange` purges them; the in-flight request dialog registers with `registerDirtyForm`
    so the shell can confirm before discarding (PRD §31.1). Verified with
    `apps/web/test/org-scope-conformance.ts` (`RUNT-05` deliverable 7).
12. **Committed synthetic fixtures** — `apps/web/test/exports/fixtures/`: `export-list.json`,
    `export-queued.json`, `export-running.json`, `export-completed.json` (with `expires_at` in the
    future), `export-expired.json`, `export-failed.json`, `export-cancelled.json`,
    `download-404.json`, `rate-limited-429.json` and `foreign-404.json` (byte-identical to
    `download-404.json` apart from `request_id` — the fixture that proves the client cannot
    distinguish). All synthetic; no customer content and nothing from `evals/gold/**` (PRD §45.1
    item 6; plan **R9**).

## Acceptance checklist (classified)

- [ ] `[machine]` The feature registers through `RUNT-05`'s glob with `id: 'exports'`, claims **no**
      nav slot, and exposes exactly `/exports` and `/exports/:exportJobId` — no other route
      (`RUNT-05` contract items 1–4; sub-PRD **D12**)
- [ ] `[machine]` Adding this feature area produces **zero** diff outside its own directory, asserted
      with `apps/web/test/feature-conformance.tsx` (`RUNT-05` deliverable 13; plan **A1**)
- [ ] `[fixture]` **All ten PRD §31.3 states render** — `IDLE`, `VALIDATING`, `QUEUED`, `RUNNING`,
      `WAITING_FOR_CLARIFICATION`, `CANCELLING`, `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED` — each
      with a visible title, a plain-language explanation, an allowed next action and the copyable
      export-job id, asserted against the literal ten-name list so a missing branch fails (PRD §31.3)
- [ ] `[machine]` A source scan finds **no bare spinner**: every asynchronous panel renders through
      `RUNT-06`'s `JobStateView` (PRD §31.3 *"A spinner without state or recovery guidance is not
      acceptable"*)
- [ ] `[fixture]` **Expiry is visible, not surprising (`EXP-002`).** `export-completed.json` shows the
      exact expiry date as `3 Aug 2026` plus a relative hint and the effect/recovery note on the
      Download action; `export-expired.json` renders the `EXPIRED` state naming the expiry date,
      explaining the seven-day deletion and offering **Request again** (PRD §8.9; §31.3; §41.1; plan
      §5.20's goal line)
- [ ] `[fixture]` **Other-tenant denial is indistinguishable (`EXP-002`, `UAT-AUTH-03`).** Replaying
      `foreign-404.json` and `download-404.json` produces **byte-identical rendered output** apart from
      the copyable `request_id`; the feature contains no branch keyed on "forbidden" versus "absent"
      (PRD §16.5; §34.9; `SEC-001`)
- [ ] `[machine]` **A fresh signed URL per download, never stored.** Each Download press issues a new
      `GET /v1/exports/{id}/download`; no signed URL is written to state, storage, the address bar,
      browser history, a page title, an analytics call or an error payload — asserted with a canary URL
      swept across all of them (PRD §8.9; §41.1; sub-PRD **D11**)
- [ ] `[machine]` **No research content and nothing PRD §8.9 excludes is rendered anywhere.** The
      feature displays only ids, enum values, timestamps, sizes and status codes; a fixture whose
      fields carry answer text, a record title, a prompt, a reasoning trace, an API key and an internal
      licensing note renders **none** of them, and none reaches a URL, page title, analytics call or
      error payload (PRD §8.9; §41.1)
- [ ] `[machine]` **The request dialog is honest about the artifact.** Its copy states that the file
      preserves the answer as it was given and is not regenerated, that it carries the product
      disclaimer and source licence limits, and that the download expires — asserted against a
      committed copy fixture so a rewrite is a deliberate change (PRD §8.9; §11.2; sub-PRD **D14**)
- [ ] `[machine]` **No duplicate exports.** Refresh, back, forward and a double submit during a request
      produce exactly one export job — asserted by counting requests carrying the same
      `Idempotency-Key` per user intent (PRD §34.1; §41.1; `EXP-002` cost discipline)
- [ ] `[fixture]` **`429 RATE_LIMITED`** renders the one-concurrent-export explanation with
      `Retry-After` guidance and exposes no other-organisation identifier or global counter
      (PRD §38.5; §34.9)
- [ ] `[machine]` **Format list comes from the contract.** The picker is built from the generated
      `ExportFormat` enum in `packages/contracts`; no local string union exists (PRD §20.1; `DEV-001`)
- [ ] `[machine]` **Deep link carries opaque ids only.** `/exports?target_kind=…&target_id=…` accepts an
      enum and an opaque id and nothing else; a title, question or free-text parameter is ignored and an
      inline `ErrorSummary` is shown; no research content ever enters the query string (PRD §41.1;
      sub-PRD **D12**)
- [ ] `[machine]` **Organisation scoping.** Every cache key is produced by `orgScopedKey`;
      `onOrganizationChange` purges them all; the open request dialog is registered with
      `registerDirtyForm` — asserted with `apps/web/test/org-scope-conformance.ts` (PRD §31.1;
      `AUTH-002`; `RUNT-05` contract item 5)
- [ ] `[machine]` **No boundary enforcement in the client.** A source scan finds no permission table, no
      PII detection and no tenant check in this feature; the export action's availability comes from the
      server's response, not from a client-side role rule (PRD §45.2; §38.1 evaluated by `RUNT-02`)
- [ ] `[machine]` **Dates and signals.** Every displayed date renders as `3 Aug 2026` via
      `packages/ui`'s `format/date.ts` while every request carries ISO 8601; every status renders as
      text plus badge/icon, never colour alone (PRD §41.1; §34.1)
- [ ] `[machine]` **Accessibility (automated).** `packages/ui/test/a11y.ts` passes for both screens and
      the dialog at **360 px, 768 px and 1280 px**, with complete keyboard operation, visible focus,
      logical order, one programmatic page heading, labelled fields, error summaries and a live region
      (PRD §41.1; §13.1 WCAG 2.2 AA target; `RUNT-06` deliverable 12)
- [ ] `[machine]` No component is defined here that duplicates a `packages/ui` primitive or async-state
      view — asserted by an import check (plan **A6**; `RUNT-06`)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration` green
      (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — the feature consumes generated
      `packages/contracts` types and hand-edits no binding (PRD §20.1; `DEV-001`)
- [ ] `[machine]` **Writeback item:** sub-PRD **QX-3** in `docs/prd/19-exports/README.md` records the
      routes actually shipped and that PRD §31.2 has no export row, with the **Founder** named as owner
      (plan §1.1; CLAUDE.md issue #53)
- [ ] `[human]` **`UAT-EXP-02`** (PRD §41.2): the founder opens an export, downloads it, waits for the
      signed URL to expire and retries (denied), then attempts the same export id from a second
      organisation's session (denied, identical message). Automated by `23-assurance`/`ASSR-06`; the
      tenant half is also covered by `ASSR-01` — both are `blocked_by` this ticket
- [ ] `[human]` **`UAT-EXP-01` visual half** (PRD §41.2): exporting an old corrected answer from this
      screen produces a file showing the original legal date and release and the correction banner. (The
      artifact assertions themselves are `XPRT-02`/`XPRT-03`/`XPRT-04`'s.)
- [ ] `[human]` **PRD §41.1 manual review** at 360/768/1280 px: primary actions and error recovery
      remain visible at every width; both screens and the dialog are keyboard-reachable in a logical
      order; no colour-only signal is perceptible in greyscale
- [ ] `[human]` **PRD §43.4 founder review**, item 6 (*"UI/manual acceptance failures"*): the founder
      confirms the expiry and denial copy reads as a normal, explained product behaviour rather than an
      error — the explicit goal of plan §5.20's *"Expiry and other-tenant denial are visible, not
      surprising"*
- [ ] `[human]` **Gate 2 smoke test** (CLAUDE.md): from a saved record, request a PDF export, watch it
      complete, download it, and see the expiry date on screen
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**EXP-002**, `UAT-EXP-01`,
      `UAT-EXP-02`, `UAT-AUTH-03`, `E26-EXPORT`), user-visible change and non-goals, schema/API/event
      compatibility (consumes generated types only), tenant/PII/security and retention impact (none
      enforced client-side by design; the seven-day artifact lifetime is surfaced), source/licence
      impact (the dialog states that licence limits apply to the file), cost/memory/latency impact (an
      export is a queued job initiated here — state it), rollback path (revert; `ASSR-01` and `ASSR-06`
      consume this ticket), known gaps (**QX-3**, **QX-6**)
- [ ] No further `[fixture]` classes — the fixtures are this ticket's synthetic API responses; PRD §40.8
      adapter fixtures and PRD §14/§43 evaluation replays belong to other modules (plan §1.1)
- No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected (PRD §45.3)

## Test plan

Reviewer steps. Every `[machine]` and `[fixture]` step is offline: **no network, no API server, no AWS
credential, no model provider**. Screens are exercised against committed fixtures through the generated
client's mock seam, exactly as `RCRD-08` does (`17-records-collab` **D12**).

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter <the apps/web package name>`; suites live under `apps/web/test/exports/`. Then
   `pnpm test`, `pnpm test:integration` and `pnpm generate && pnpm generated:check` from the root.
3. **Harness.** Copy the component-test setup `RUNT-05` established for `features/home/**` plus
   `packages/ui/test/a11y.ts` (`RUNT-06` deliverable 12) and `apps/web/test/org-scope-conformance.ts`
   (`RUNT-05` deliverable 7); mirror `RCRD-08`'s fixture-driven screen tests. Do not invent a third
   pattern.
4. **`feature-registration.test.ts`** — assert `id`, the absence of a nav entry, and the route list
   against the literal sub-PRD **D12** pair; assert no additional route; run
   `apps/web/test/feature-conformance.tsx` and assert `git status --porcelain` is clean afterwards.
5. **`states.test.ts`** — force each of the ten PRD §31.3 states from fixtures; assert title,
   explanation, allowed action and copyable id in every case; grep the feature source for a spinner not
   wrapped by `JobStateView` and assert none.
6. **`expiry.test.ts`** — `export-completed.json` with a controllable clock: assert the `3 Aug 2026`
   expiry rendering, the relative hint, and the effect/recovery note; advance the clock past
   `expires_at` and assert the `EXPIRED` state with the **Request again** action.
7. **`indistinguishable.test.ts`** — render from `download-404.json` and from `foreign-404.json`;
   assert the rendered output is identical apart from `request_id`; assert the source contains no
   branch keyed on a forbidden-versus-absent distinction.
8. **`download.test.ts`** — press Download twice; assert two separate `…/download` calls; plant a canary
   signed URL in the `302` and sweep `location.href`, `document.title`, session/local storage, the
   analytics stub and the error payload for it; assert absent.
9. **`no-content-leak.test.ts`** — fixtures seeded with answer text, a record title, a prompt, a
   reasoning trace, an API key and an internal licensing note; drive a full navigation of both screens
   and the dialog; assert none is rendered and none reaches a URL, title, analytics call or error
   payload.
10. **`dialog-copy.test.ts`** — assert the request dialog copy against the committed copy fixture
    (no-regeneration, disclaimer, licence limits, expiry).
11. **`idempotency.test.ts`** — double submit, refresh, back/forward mid-request; assert exactly one
    export job and a stable `Idempotency-Key` per intent.
12. **`rate-limit.test.ts`** — `rate-limited-429.json`: assert the plain-language explanation, the
    `Retry-After` guidance and the absence of other-tenant data.
13. **`deep-link.test.ts`** — valid, unknown and malformed parameters; assert the dialog pre-fill, the
    inline error and that no free-text parameter is ever honoured or echoed.
14. **`org-scope.test.ts`** — run `apps/web/test/org-scope-conformance.ts` against this feature.
15. **`a11y.test.ts`** — run `packages/ui/test/a11y.ts` at 360/768/1280 px over both screens and the
    dialog.
16. **`no-boundary-logic.test.ts`** — source scan asserting no permission table, no PII pattern, no
    tenant check and no locally defined UI primitive.
17. **Reviewer focus.** Confirm that (a) the expired and foreign paths are genuinely one code path;
    (b) no signed URL survives anywhere in client state; (c) the screen renders no research content at
    all; (d) `EXPIRED` reads as a designed outcome with a recovery action, not as an error; (e) the
    feature adds nothing to `features/records/**` despite the `RCRD-08` edge.
18. **`[human]` steps**, run last against a deployed or locally composed stack (`pnpm stack:up`):
    `UAT-EXP-02` in two organisations and after TTL expiry; the `UAT-EXP-01` visual half; the PRD §41.1
    width and keyboard review; the founder copy review (PRD §43.4 item 6); the Gate 2 smoke path.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** and
`docs/prd/19-exports/README.md` (version +0.1 with a changelog line) **before** changing code, then
`publish-tickets.mjs --sync`. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`packages/ui` lacks a primitive this screen needs** (a countdown, a file-size cell, a download
  button pattern). → Add it to `packages/ui` through a `RUNT-06` docs change, not locally: plan **A6**
  exists because the same components appear on several surfaces. Record the required component in
  `docs/prd/03-app-runtime/README.md` and `docs/prd/19-exports/README.md`, then implement.
- **The hosting screens cannot open `<ExportDialog>` or the deep link** — for example `RCRD-08`'s
  record detail or `15-answer-product`'s answer screen has no place to mount an export action. →
  Do **not** edit their files. Record the integration requirement in `docs/prd/19-exports/README.md`
  and raise a docs change against the owning ticket (`RCRD-08`, `ASK-07`); the deep link keeps working
  standalone from `/exports` in the meantime (sub-PRD **D12**).
- **PRD §31.2's missing export route becomes contentious** (**QX-3**). → It is a **Founder** decision
  under PRD §45.5 ("Product change"); record the shipped routes and the rationale in
  `docs/prd/19-exports/README.md` **QX-3**. Never quietly relocate the screen into another module's
  feature area to avoid the question.
- **`XPRT-01`'s status payload lacks a field this screen needs** (`expires_at`, `byte_length`,
  `artifact_state`, a queue position). → Add it in **`XPRT-01`**, through a docs change to that ticket
  plus `docs/prd/19-exports/README.md`, `--sync`, then consume it. Never derive an expiry client-side
  from a local clock — the server's expiry is authoritative and a client-side guess would show a file
  as available after it is gone.
- **A user asks to preview the exported content in the browser.** → That would put research content —
  and the PRD §8.9 exclusion problem — into a surface that currently has neither. It is a **product
  change** (PRD §45.5) with the **Founder** as owner; record it in `docs/prd/19-exports/README.md`,
  never add an inline viewer as a convenience.
- **The seven-day expiry frustrates a pilot customer.** → The seven days are PRD §8.9 (*"deleted after
  seven days by default"*) and the bucket lifecycle is `RLSE-04`'s. A change is a Founder-approved
  product change plus an `18-ops-release` change, recorded in `docs/prd/19-exports/README.md` and
  `docs/prd/breakdown-plan.md` — never a longer TTL or a re-upload hack in the client.

**3. Escalation — two non-negotiable classes.**

- **Anything that makes an expired or another organisation's export distinguishable** — a different
  message, a different status code surfaced to the user, a timing difference the client amplifies —
  overturns PRD §16.5's *"Other-tenant and absent opaque IDs return the same not-found response"*,
  `EXP-002` and `UAT-AUTH-03`. It is a tenant-isolation defect, not a copy improvement. Stop and
  escalate.
- **Anything that persists, caches, shares or re-uses a signed URL** — storing it in state for a
  "retry", putting it in the address bar, emailing it, or logging it for support — overturns PRD §8.9's
  *"short-lived signed URLs"* and turns a minutes-long credential into a durable one. Escalate for
  re-review; never treat a signed URL as an ordinary link inside the client.
