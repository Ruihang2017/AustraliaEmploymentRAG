---
id: ASK-06
title: Ask form screen
module: 15-answer-product
lane: 15-answer-product
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-05, RUNT-06, ASK-01, EVID-01]
blocks: [ASK-07]
---

# ASK-06 — Ask form screen

Implements PRD §32.2 (Ask form) and §37.1 (input examples), carrying requirements **ANS-001** and the
client half of **ANS-002** (`E21`).
**No ADR — the decision is already made in PRD §32.2 and §37.1; this is build ticket 6 of 12 against
it.**
Parent sub-PRD: [15-answer-product README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`RUNT-05` — Web app shell: navigation, org switcher, status badges](../../03-app-runtime/tickets/RUNT-05-web-app-shell-navigation-org-switcher-status-badges.md) ·
[`RUNT-06` — `packages/ui`: accessible primitives, async states, evidence panel](../../03-app-runtime/tickets/RUNT-06-packages-ui-accessible-primitives-async-states-evidence-panel.md) ·
[`ASK-01` — Answer job admission and transaction boundary](ASK-01-answer-job-admission-and-transaction-boundary.md) ·
`EVID-01` — PII deterministic patterns/checksums and admission contract ([`12-evidence-safety`](../../12-evidence-safety/README.md))
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(PRD §32.2's field table and PRD §41.1's universal UI rules) — not a new subsystem decision.

## Background + basis

The Ask form is where a customer could most easily put an employee's name into a legal-research
system. PRD §10.1 makes the server the authoritative boundary, but the form is the first and most
visible line: it decides what the product **asks for**. A form that requests identifying data has
already failed, whatever the server does afterwards.

**PRD §32.2 — Ask form** is normative and reproduced in full:

> | Field | Type | Required | Rules |
> |---|---|---:|---|
> | Mode | `QUICK` or `DEEP` | Yes | Shows expected credit, time and limit before submit |
> | Question | multiline text | Yes | 20–4,000 characters; anonymous only |
> | Scenario facts | structured fields + multiline facts | Yes | 0–8,000 characters after normalisation; no attachments |
> | Legal date | `YYYY-MM-DD` | Yes | Defaults to today; future date requires explicit confirmation |
> | Jurisdictions | controlled list | Yes | `CTH`, `NSW`, `VIC`, `QLD`, `WA`, `SA`, `TAS`, `ACT`, `NT`; multi-select allowed |
> | Employer | name and/or ABN | No | ABN checksum validated; clearly labelled as public business data |
> | Employment facts | controlled values | Conditional | employee/contractor uncertainty, full/part/casual, work location, employer type, duties, industry, agreement/award if known |
> | Retention | `SAVE` or `EPHEMERAL` | Yes | Exact lifecycle shown before submit |
> | Research Record | existing or new | Required for `SAVE` | Hidden for `EPHEMERAL`; durable research must have a record |
>
> Before submission, the page shows detected assumptions and missing material facts. It **MUST never
> request an employee name, personal email, home address, TFN, bank details, date of birth,
> employee/payroll ID or upload.**

**PRD §37.1 — Input examples** gives the allowed/blocked table this form's hints and placeholders must
teach:

> | Allowed | Blocked |
> |---|---|
> | Public employer name and ABN | Employee or private individual name |
> | State/territory and non-precise work location | Home address or precise private location |
> | Anonymous role, duties, qualifications and employment type | Personal email, phone or private social identifier |
> | Public case party/citation | TFN, bank/card details, Medicare/passport/licence number |
> | Age band where legally relevant | Exact date of birth unless public case material |
> | "Employee A", "the worker", synthetic placeholders | Employee/payroll ID, payslip content or personnel-file extract |
> | Approximate wage/rate facts without identity | Identifying combination of rare role + tiny workplace + personal event |

**PRD §10.1:** *"Web/widget clients SHOULD provide immediate PII hints and one-click placeholders. The
server MUST be the authoritative PII boundary before logging, persistence or provider calls. …
**Customers MUST NOT bypass a positive employee-PII finding.**"*

**PRD §37.2:** *"browser hints (**not trusted**) → request byte/field limits → …"* and *"Public-entity
exceptions must come from structured `employer`, `abn` or `public_case_party` fields, **not a generic
'ignore warning' button**. If users need to explain a false positive, they can report the detector
category and request ID without the original text."*

**PRD §31.2** gives the route and its first-use state:

> `/ask` | New answer | Researcher/Admin/Owner | Start Quick/Deep job | **Anonymous scenario template
> and PII examples**

**PRD §10.4** fixes the retention copy this form must show before submit: ephemeral content *"MUST
expire one hour after completion/failure/cancellation and no later than 24 hours after creation"*, it
*"MUST NOT enter Litestream, daily/weekly backups, exports or support tools"*, and *"Durable
audit/export/review/version comparison/change alerts require `SAVE` mode."*

**PRD §36.7** gives the numbers behind "expected credit, time and limit": Quick — 1 fixed plan,
1 retrieval round, 1 hosted synthesis call plus optional repair, 30-second objective, 60-second hard
cap, organisation concurrency 2. Deep — up to 4 subquestions, up to 2 retrieval rounds, up to 3 hosted
calls plus optional repair, 60-second objective or background, 180-second hard cap, concurrency 1.

**PRD §41.1 — Universal UI acceptance** applies in full, including *"customer research content is not
placed in URL query strings, analytics, browser error telemetry or page titles"* and
*"refresh/back/forward/reconnect does not duplicate writes or charges."*

**PRD §30.2:** `ANS-001` — *"Quick and Deep accept explicit question, facts, date, jurisdiction and
retention mode"*; `ANS-002` — *"Employee PII is blocked before persistence, logs or provider calls"*,
primary surface *"All Ask-like forms"*.

**Contracts this ticket builds against (all already published):**

- `RUNT-05`'s A1 web contract: `apps/web/src/features/<area>/feature.tsx` default-exports a
  `FeatureModule` `{ id, routes, nav?, onOrganizationChange }`; nav slots are the frozen eleven-item
  PRD §31.1 tuple and a feature **claims** a slot, never inserts one; every organisation-scoped cache
  key comes from `orgScopedKey(...)`; route collisions fail the build. Also `apps/web/src/lib/format.ts`
  for the PRD §41.1 date rule.
- `RUNT-06`'s `packages/ui`: `JobStateView` (all ten PRD §31.3 states), the accessible primitive set
  (`TextArea`, `MultiSelect`, `DateField`, `RadioGroup`, `ErrorSummary`, `LiveRegion`, `PageHeading`,
  `CopyableId`, `EmptyState`, …), the status badges, `SafeMarkdown` and `packages/ui/test/a11y.ts`.
- `ASK-01`'s `POST /v1/answers` contract: the PRD §34.3 request body, the `202` job object, the
  clarification variant, and the error codes `INVALID_REQUEST`, `INVALID_LEGAL_DATE`, `INVALID_ABN`,
  `EMPLOYEE_PII_DETECTED`, `CREDIT_LIMIT_REACHED`, `GENERATION_UNAVAILABLE`.
- `EVID-01`'s PII admission contract: the deterministic pattern/checksum detector and the
  `PiiAdmissionResult` shape (field, character range, category, suggested placeholder — **never** the
  detected value).

**Accepted caveats carried forward:**

- Client-side hints are **advisory only**. PRD §37.2 lists browser hints as "not trusted"; the
  authoritative decision is the server's `422 EMPLOYEE_PII_DETECTED`. This form must never allow a
  client-side pass to substitute for the server's verdict, and must never offer an override.
- The Research Record picker reads records owned by `17-records-collab` (`RCRD-01`). Until `RCRD-01`
  ships, the picker supports the `new_record` path (title + tags, which `ASK-01` creates inside the
  admission transaction) and degrades gracefully for "existing record"; this is a known gap to state
  in the PR, not a reason to write `features/records/**`.

## Goal

Ship `apps/web/src/features/ask/**` as a `RUNT-05` feature area serving `/ask` and claiming the `ASK`
nav slot, implementing PRD §32.2's field table exactly, showing mode cost/time/limits and the exact
retention lifecycle **before** submit, surfacing PRD §37.1's allowed/blocked guidance with one-click
anonymous placeholders, and submitting to `ASK-01`'s `POST /v1/answers` with an idempotency key that
survives refresh and back/forward. Completion is mechanically checkable: a source-level assertion
proves no input in this feature collects an employee name, personal email, home address, TFN, bank
details, date of birth, employee/payroll ID or a file; the server's `422 EMPLOYEE_PII_DETECTED` is
rendered with field/range/category/placeholder and **no** override control exists; and the
accessibility harness passes at 360/768/1280 px.

## Non-goals

- **No API route or admission logic.** `ASK-01` owns `POST /v1/answers`; this screen calls it.
- **No progress or result rendering.** `/answer-jobs/:jobId` and `/answers/:snapshotId` are `ASK-07`
  (`apps/web/src/features/answers/**`), which is `blocked_by` this ticket. On a successful `202` this
  screen navigates to `ASK-07`'s progress route.
- **No coverage or compare forms.** `/coverage/new` is `ASK-09`; `/compare/new` is `ASK-12`.
- **No PII detection.** `packages/pii` is `12-evidence-safety` (`EVID-01`, `EVID-02`). This screen
  renders `EVID-01`'s advisory hints and the server's verdict; it decides nothing.
- **No shared UI primitives, async-state view, evidence panel or status badges.** `packages/ui` is
  `RUNT-06` (breakdown plan **A6**). This feature composes them and re-implements none.
- **No shell, navigation, organisation switcher or client HTTP layer.** `apps/web/src/{app,shell,lib}/**`
  is `RUNT-05`.
- **No Research Record CRUD.** `17-records-collab` (`RCRD-01`, `RCRD-08`). This screen uses the
  `new_record` path in `ASK-01`'s contract and reads existing records through the shell's API client.
- **No cross-boundary accessibility or E2E suite.** `tests/e2e/**` is `23-assurance` (`ASSR-06`,
  `ASSR-07`); this ticket carries its own co-located checks (breakdown plan **R8**).

## File-scope (write-owns)

- `apps/web/src/features/ask/**` — including `feature.tsx`.
- `apps/web/test/ask/**` — this ticket's own component/integration tests (breakdown plan §1.1).
- `apps/web/package.json` — **append-only** (breakdown plan §1.1).

Does not touch:

- `apps/web/src/{app,shell,lib}/**` and `apps/web/src/features/home/**` — `RUNT-05`. If the feature
  contract or a shell helper must change, that is a `RUNT-05` docs PR and `--sync`, not an edit here.
- `apps/web/src/features/answers/**` — `ASK-07`; `features/coverage/**` — `ASK-09`;
  `features/compare/**` — `ASK-12`.
- `apps/web/src/features/{auth,settings}/**` — `13-identity-surface`; `{search,sources}/**` —
  `14-search-product`; `monitor/**` — `16-monitor-alerts`; `records/**` — `17-records-collab`;
  `exports/**` — `19-exports`; `{developer,usage}/**` — `20-developer-platform`; `legal/**` and
  `public-site/**` — `24-launch`.
- `packages/ui/**` — `RUNT-06`; `packages/pii/**` — `12-evidence-safety`; `packages/contracts/**` —
  `00-foundation`.
- `apps/api/**`, `apps/worker/**`, `schemas/**`, `infra/**`, `tests/**` — `03`, `00`, `18`, `23`;
  root manifests and lockfiles — `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown plan §1: phase 1, nothing merged, no
in-flight ticket), so nothing has previously written `apps/web/src/features/ask/**` and nothing
contends for it. Under breakdown plan **A1** and `RUNT-05`'s Vite-glob discovery
(`import.meta.glob('../features/*/feature.tsx')` — *"a pattern, not a list"*), adding this directory
produces **zero** diff to any tracked file outside it: no shell file, no registry and no sibling
feature changes. That is what makes the four feature subtrees in this module — and the ten in other
modules — disjoint by construction. The one shared namespace is the PRD §31.1 nav-slot tuple: this
feature claims **`ASK`** and no other; `ASK-09` claims `COVERAGE`, `ASK-12` claims `COMPARE`, and
`ASK-07` claims **none** (sub-PRD **D13**). A slot claimed twice fails the build, so the assignment is
fixed in the sub-PRD rather than negotiated at merge time. The concurrent sibling at this wave is
`ASK-02` (`apps/worker/src/handlers/answer/**`) — a different tree. Per breakdown plan **A3**, this
ticket writes no table and no repository; it holds no security boundary either (PRD §45.2:
`apps/web` must not own "Security-boundary PII or tenant enforcement").

## Deliverables

1. **`apps/web/src/features/ask/feature.tsx`** — the `FeatureModule`:
   `id: 'ask'`, `routes: [{ path: '/ask', element: <AskScreen /> }]`,
   `nav: { slot: 'ASK', label: 'Ask', to: '/ask', visibleWhen: ctx => ctx.can('answers:create') }`
   (PRD §31.2 restricts `/ask` to Researcher/Admin/Owner; the predicate is feature-supplied and the
   shell encodes no role rule), and `onOrganizationChange` which drops every draft and every cached
   record list. All cache keys come from `orgScopedKey(...)` (`RUNT-05` contract item 5).
2. **`AskScreen`** — the PRD §32.2 form, one field per row of the table, in that order: **Mode**
   (`QUICK`/`DEEP` radio group), **Question** (multiline, 20–4,000 characters with a live counter),
   **Scenario facts** (structured controls plus a multiline free-text field, 0–8,000 characters after
   normalisation, **no file input of any kind**), **Legal date** (`YYYY-MM-DD`, defaulting to today),
   **Jurisdictions** (multi-select over exactly `CTH NSW VIC QLD WA SA TAS ACT NT`), **Employer**
   (name and/or ABN, optional), **Employment facts** (controlled values), **Retention**
   (`SAVE`/`EPHEMERAL`), **Research Record** (required and visible for `SAVE`, hidden for
   `EPHEMERAL`). Every control is a `packages/ui` primitive (`RUNT-06`), labelled, keyboard-operable
   and with visible focus.
3. **Mode disclosure before submit.** The mode control shows expected **credit, time and limit** for
   the selected mode, sourced from the PRD §36.7 table: Quick — 1 hosted synthesis call, 30-second
   objective, 60-second hard cap, 2 concurrent per organisation; Deep — up to 4 subquestions, up to 3
   hosted calls, 60-second objective or background, 180-second hard cap, 1 concurrent. Reserved credit
   comes from `ASK-01`'s response contract, not from a hard-coded number.
4. **Retention disclosure before submit.** Choosing `EPHEMERAL` shows the exact PRD §10.4 lifecycle:
   stored only in the local non-replicated ephemeral database; expires one hour after
   completion/failure/cancellation and no later than 24 hours after creation; never enters backups,
   exports or support tools; not recoverable after expiry or server loss. Choosing `SAVE` states that
   durable audit, export, review, version comparison and change alerts require `SAVE`, and that a
   Research Record is required. The copy is a single exported constant so `ASK-09` and `ASK-12` reuse
   the identical wording.
5. **Employment facts, as controlled values only.** Employee/contractor uncertainty, full/part/casual,
   work location (state/territory and non-precise location only — PRD §37.1), employer type, duties,
   industry, and agreement/award identifiers if known. Duties are free text bounded by the facts
   limit; there is **no** "employee details" group, and none of these controls accepts an identifier.
6. **The PII boundary at the client, done correctly.**
   - `apps/web/src/features/ask/pii-hints.ts` — advisory, immediate hints from `EVID-01`'s
     deterministic patterns/checksums, plus **one-click anonymous placeholders** ("Employee A",
     "the worker") as PRD §10.1 requires.
   - Public-entity data is accepted **only** through the structured `employer_name`, `employer_abn`
     and public-case-party controls — never by dismissing a warning (PRD §37.2).
   - **There is no override control.** No "ignore warning", "submit anyway" or equivalent exists
     anywhere in this feature (PRD §10.1: *"Customers MUST NOT bypass a positive employee-PII
     finding"*).
   - A server `422 EMPLOYEE_PII_DETECTED` is rendered against the named field with the character
     range, the category and the suggested placeholder, and offers "report the detector category and
     request ID" — quoting the request id, never the original text (PRD §37.2).
   - Client hints never gate submission on their own and never suppress the server call; the server is
     authoritative.
7. **PRD §37.1 guidance surfaces.** The first-use state is the PRD §31.2 "anonymous scenario template
   and PII examples": a worked anonymous scenario plus the PRD §37.1 allowed/blocked table rendered as
   inline guidance next to the relevant fields, not buried in a help modal.
8. **Pre-submission assumptions and missing facts.** Before submit the page shows **detected
   assumptions and missing material facts** (PRD §32.2 closing sentence), derived from the same
   deterministic rules `ASK-01`'s `clarification-gate.ts` uses so the form and the server agree. Each
   item states the decision it affects. It is presented as *"we will ask about this"*, never as a
   filled-in default.
9. **Client-side validation matching the server.** Question length, facts length, jurisdiction
   membership, ABN checksum (`400 INVALID_ABN` mirrored inline before submit), and the future-date
   confirmation (`400 INVALID_LEGAL_DATE` — a future `legal_as_at` requires an explicit confirmation
   control). Validation errors are inline plus an `ErrorSummary` and **consume no quota** — no request
   is sent (PRD §32.1's analogous rule for search; PRD §41.2 `UAT-SRCH-04`).
10. **Submission.** One `POST /v1/answers` through the shell's API client with an `Idempotency-Key`
    that is **generated once per composed draft** and persisted with the draft, so refresh,
    back/forward and a double-click all reuse it — PRD §41.1: *"refresh/back/forward/reconnect does
    not duplicate writes or charges"*; PRD §33.2: *"A network retry with the same idempotency key
    returns the original job."* On `202` the screen navigates to `/answer-jobs/{id}` (`ASK-07`); if the
    body carries `status: "WAITING_FOR_CLARIFICATION"`, it navigates to the same route, which renders
    the clarification state.
11. **Error rendering.** `429 CREDIT_LIMIT_REACHED` and `503 GENERATION_UNAVAILABLE` are rendered with
    their PRD §34.9 user action and an explicit statement that **Search remains available**, with a
    link to `/search` (PRD §36.8: *"Provider/budget unavailable | Job unavailable; Search and saved
    records remain available"*; `UAT-ANS-08`). `429 RATE_LIMITED` honours `Retry-After`.
12. **Draft state and content hygiene.** The draft is held in organisation-scoped client state via
    `orgScopedKey(...)` and cleared on organisation switch. **No customer research content is placed
    in a URL query string, the page title, analytics or browser error telemetry** (PRD §41.1) — the
    route is `/ask` with no query parameters carrying content, and error reporting sends the request id
    only.
13. **Accessibility.** One programmatic page heading, labelled fields, an error summary, a live region
    for asynchronous status, visible focus and logical tab order, colour never the only signal, dates
    rendered `3 Aug 2026` while the API receives ISO (`RUNT-05`'s `lib/format.ts` /`RUNT-06`'s
    `src/format/date.ts`), and full operation at 360/768/1280 px — verified with `RUNT-06`'s
    `packages/ui/test/a11y.ts` harness (PRD §13.1, §41.1).

## Acceptance checklist (classified)

- [ ] `[machine]` The feature registers `/ask` and claims nav slot `ASK` with **zero** diff to any
      tracked file outside `apps/web/src/features/ask/**` — asserted with `RUNT-05`'s
      `apps/web/test/feature-conformance.tsx` (A1; `RUNT-05` contract item 6)
- [ ] `[machine]` **PRD §32.2 field table**: every one of the nine rows is present with its required
      flag and its stated rule — a table-driven test over the literal list, so a missing field fails
- [ ] `[machine]` **PRD §32.2 prohibition**: no input in this feature collects an employee name,
      personal email, home address, TFN, bank details, date of birth, employee/payroll ID **or a
      file** — asserted by a source scan for `type="file"`/`<input type=file>` plus a rendered-DOM scan
      for those field labels and their common synonyms (PRD §32.2, §37.1)
- [ ] `[machine]` **No override control exists**: a source and rendered-DOM scan finds no "ignore",
      "submit anyway", "dismiss warning" or equivalent affordance on a positive PII finding
      (PRD §10.1, §37.2)
- [ ] `[machine]` A server `422 EMPLOYEE_PII_DETECTED` renders the field, character range, category and
      suggested placeholder and **not** the detected value — asserted with a canary in the response
      that must be absent from the rendered DOM (PRD §37.2; `ANS-002`)
- [ ] `[machine]` Public-entity data is accepted only through the structured employer/ABN/public-party
      controls; there is no free-text path that marks content as public (PRD §37.2)
- [ ] `[machine]` Mode selection displays expected credit, time and limit for `QUICK` and `DEEP`,
      matching PRD §36.7's columns (PRD §32.2)
- [ ] `[machine]` `EPHEMERAL` displays the exact PRD §10.4 lifecycle (1 hour after terminal state,
      ≤24 hours from creation, excluded from backups/exports/support, not recoverable) and `SAVE`
      displays the record requirement — asserted against the exported copy constant (PRD §10.4, §32.2)
- [ ] `[machine]` `SAVE` requires exactly one of an existing record or a new-record title; `EPHEMERAL`
      hides the record control entirely and sends neither field (PRD §32.2, §34.3)
- [ ] `[machine]` Client validation blocks submission with **no** network request for: a 19-character
      question, a 4,001-character question, an 8,001-character facts field, a jurisdiction outside the
      nine values, an ABN failing the checksum, and a future legal date without explicit confirmation
      (PRD §32.2, §34.9)
- [ ] `[machine]` **PRD §41.1 / `UAT-ANS-01`**: the `Idempotency-Key` is generated once per draft and
      is byte-identical across refresh, back/forward and a double submit — asserted by capturing
      outbound requests (PRD §33.2, §41.1)
- [ ] `[machine]` **PRD §41.1 content hygiene**: no customer research content appears in the URL, the
      page title, analytics calls or error telemetry — asserted with a canary typed into the question
      that must not appear in `location.href`, `document.title` or any captured telemetry payload
- [ ] `[machine]` Organisation switch clears the draft and every organisation-scoped cache key —
      asserted with `RUNT-05`'s `apps/web/test/org-scope-conformance.ts` helper (PRD §31.1;
      `AUTH-002`)
- [ ] `[machine]` `429 CREDIT_LIMIT_REACHED` and `503 GENERATION_UNAVAILABLE` render the PRD §34.9 user
      action and an explicit "Search remains available" link (PRD §36.8; `ANS-007`, `UAT-ANS-08`)
- [ ] `[machine]` Pre-submission assumptions and missing material facts are shown, each naming the
      decision it affects, and none is written into a field as a default (PRD §32.2, §33.3)
- [ ] `[machine]` No controlled value is declared locally — jurisdictions, modes, retention modes and
      employment-fact values come from `packages/contracts` (PRD §35.1; breakdown plan §4.1)
- [ ] `[machine]` No `packages/ui` component is re-implemented here — a source scan finds no local
      spinner, dialog, badge or Markdown renderer (breakdown plan **A6**; `RUNT-06`)
- [ ] `[machine]` Accessibility: `RUNT-06`'s `packages/ui/test/a11y.ts` harness passes at 360, 768 and
      1280 px; one programmatic heading; labelled fields; error summary; live region; colour never the
      only signal; dates render `3 Aug 2026` (PRD §13.1, §41.1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[fixture]` The screen renders and submits against a recorded `ASK-01` response set —
      `202` accepted, `202` with clarifications, `422 EMPLOYEE_PII_DETECTED`, `400 INVALID_ABN`,
      `400 INVALID_LEGAL_DATE`, `429 CREDIT_LIMIT_REACHED`, `503 GENERATION_UNAVAILABLE` — committed
      under `apps/web/test/ask/fixtures/`; no network and no provider key (sub-PRD **D15**)
- [ ] `[human]` **`UAT-PII-01`** (enter synthetic TFN/name/contact details in Ask → request blocked
      with categories/offsets) and **`UAT-PII-02`** (employer name, valid ABN and public case party →
      allowed only through correct structured/public context), plus the PRD §41.1 universal UI review
      at the three widths (PRD §41.2, §41.1). The automated halves are the `[machine]`/`[fixture]` rows
      above and `ASSR-03`/`ASSR-06`; the human rows are the Gate 2 smoke test and are **not required to
      merge**
- [ ] `[human]` PRD §43.4 founder review of the anonymous-scenario template and PII guidance copy —
      **not required to merge**
- [ ] No `cargo test --workspace` / `uv run pytest` item — no Rust or Python is touched (PRD §45.3)

## Test plan

Reviewer steps, all reproducible offline with no network and no provider key.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/web`. Suites live under `apps/web/test/ask/`.
3. **Harness.** The component test setup `RUNT-05` established (`apps/web/test/**`), the a11y helper
   `packages/ui/test/a11y.ts` (`RUNT-06`), and a request-capturing fake for the shell's API client
   seeded from `apps/web/test/ask/fixtures/*.json`. No socket, no network.
4. **`feature.test.tsx`** — run `RUNT-05`'s `feature-conformance` helper: assert the route renders, the
   `ASK` slot is claimed, and `git status --porcelain` is clean after the run.
5. **`fields.test.tsx`** — table-driven over PRD §32.2's nine rows: presence, required flag, and the
   stated rule. Then a **prohibition scan**: assert no `input[type=file]`, no drag-and-drop target, and
   no label matching the blocked list (employee name, personal email, home address, TFN, bank, date of
   birth, employee/payroll ID) or their synonyms.
6. **`pii.test.tsx`** — type `Jane Smith, jane@example.com, TFN 123 456 782` into the facts field;
   assert an advisory hint and a one-click placeholder appear; assert submission still occurs (hints
   are advisory) and that the fixture `422` renders field/range/category/placeholder with the canary
   absent from the DOM. Then scan the rendered tree and the source for any override affordance.
7. **`disclosure.test.tsx`** — assert Quick and Deep credit/time/limit copy matches PRD §36.7 and that
   the `EPHEMERAL`/`SAVE` copy matches the exported PRD §10.4 constant character for character.
8. **`validation.test.tsx`** — the six blocking cases; assert zero outbound requests were captured for
   each, and that the `ErrorSummary` names each offending field.
9. **`idempotency.test.tsx`** — compose a draft, capture the key, simulate refresh and back/forward,
   submit twice quickly; assert one key value across all captured requests.
10. **`hygiene.test.tsx`** — type `research-canary-<uuid>`; assert it appears in no `location.href`, no
    `document.title`, no captured analytics call and no captured error-telemetry payload.
11. **`org-switch.test.tsx`** — run `RUNT-05`'s `org-scope-conformance` helper; assert the draft is
    cleared and no key carrying the previous organisation id survives.
12. **`a11y.test.tsx`** — run the `RUNT-06` harness at 360/768/1280 px; assert one `h1`, labelled
    fields, a live region, and that every status signal has text plus a badge/icon.
13. Reviewer greps the diff for: any file outside `apps/web/src/features/ask/**` and
    `apps/web/test/ask/**`, any literal enum array that should come from `packages/contracts`, any
    local re-implementation of a `packages/ui` component, any `type="file"`, and any control that
    submits despite a positive PII finding.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), then `docs/prd/15-answer-product/README.md`, then
`.claude/scripts/publish-tickets.mjs --sync`, and only then change code (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **A scenario cannot be expressed without a field PRD §32.2 does not list** → adding a field to the
  Ask form is a **product change** under PRD §45.5 (it changes what the product asks customers for,
  and every new field is a new PII surface). Raise it as an open question in
  `docs/prd/15-answer-product/README.md` with the Founder as owner, and align `ASK-01`'s §34.3 request
  schema plus `FND-04`'s OpenAPI root in the same docs PR. Never add an undocumented input.
- **Customers ask for an "I know it's fine, submit anyway" control** → PRD §10.1 forbids it outright:
  *"Customers MUST NOT bypass a positive employee-PII finding."* This is not a UX negotiation. Record
  the request in `docs/prd/15-answer-product/README.md` and route it to the Founder as a product
  change; never ship the control.
- **`RUNT-05`'s feature contract cannot express a route or nav need** (for example `/ask` must be
  reachable without the nav slot for a widget embed) → raise a `RUNT-05` docs PR and `--sync`; do not
  edit `apps/web/src/{app,shell,lib}/**`.
- **`packages/ui` lacks a needed primitive** → add it in `RUNT-06`, not here (breakdown plan **A6**).
  Record the requirement in `docs/prd/15-answer-product/README.md` and raise the `03-app-runtime`
  ticket; a locally re-implemented control fragments the accessibility guarantee.
- **The Research Record picker needs `17-records-collab` endpoints that do not exist yet** → state it
  as a known gap in the PR (PRD §45.4 "known gaps and follow-up IDs"), keep the `new_record` path
  working, and record it in `docs/prd/15-answer-product/README.md`. Do not write
  `apps/web/src/features/records/**`.
- **`EVID-01`'s hint contract changes** → record it in `docs/prd/15-answer-product/README.md` and align
  in a `12-evidence-safety` docs PR; never re-implement detection locally to compensate.

**3. Escalation.** The rule that this form **never requests identifying data** and that a positive PII
finding **cannot be overridden** (PRD §32.2, §10.1) is the product's privacy invariant, and the
`422 EMPLOYEE_PII_DETECTED` path is what stops customer PII reaching persistence, logs and providers
(PRD §37.2). Any change that would add an identifying field, add an override, or let a client-side
pass substitute for the server verdict overturns PRD §10.1 and §37.2 and is exactly how unvalidated,
identifying content reaches the model boundary. Stop, escalate for re-review through the PRD §45.5
product-change path, and record the outcome in `docs/prd/15-answer-product/README.md` and
`docs/prd/breakdown-plan.md`. Never add the control inside this ticket.
