---
id: RUNT-06
title: "packages/ui: accessible primitives, async states, evidence panel"
module: 03-app-runtime
lane: 03-app-runtime
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-03]
blocks: [FIND-03, ASK-06]
---

# RUNT-06 — `packages/ui`: accessible primitives, async states, evidence panel

Implements PRD §13.1 (language and accessibility), §31.3 (mandatory states for every asynchronous
screen), §32.1/§32.3/§32.4 (the shared detail/evidence panel) and §41.1 (universal UI acceptance).
**No ADR — the decision is already made in PRD §31.3 and §32.1/§32.3/§32.4; this is build ticket 6 of
9 against it.**
Parent sub-PRD: [03-app-runtime README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `FND-03` — canonical enums and opaque ID conventions
([`00-foundation`](../../00-foundation/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope building the component set
PRD §31.3 and §32.1/§32.3/§32.4 already enumerate — not a new subsystem decision.

## Background + basis

**The ten async states are mandatory and enumerated.** PRD §31.3, in full:

> Every job-driven screen MUST implement: `IDLE`, `VALIDATING`, `QUEUED`, `RUNNING`,
> `WAITING_FOR_CLARIFICATION`, `CANCELLING`, `COMPLETED`, `FAILED`, `CANCELLED` and `EXPIRED` where
> retention permits. Each state needs a visible title, plain-language explanation, allowed next action
> and request/job ID. **A spinner without state or recovery guidance is not acceptable.**

**The evidence panel is one component appearing in three screen contracts.** PRD §32.1 (Search screen)
requires a "Right/detail panel | version timeline, source/licence limitations, related amendments/
cases/instruments". PRD §32.3 (Answer result):

> Each material sentence is linked to one or more claim IDs. Selecting a claim highlights its source
> passages. Selecting a citation shows exact text, pinpoint, effective interval, authority role,
> official URL and whether the citation **supports, qualifies or contradicts** the claim.

PRD §32.4 (Coverage Navigator): "The right evidence panel displays only evidence relevant to the
selected candidate."

`docs/prd/breakdown-plan.md` §2.1 row **A6** records why this is one owner:

> The shared **evidence/source panel and async-state components live in `packages/ui`**. PRD §32.1
> (detail panel), §32.3 (claim→citation) and §32.4 (evidence panel) are the same component in three
> surfaces; without this `14` and `15` import each other. Recorded by `RUNT-06`.

and §4.2 lists the contested path with modules `14`, `15`, `17` as the would-be sharers.

**Accessibility is a release target.** PRD §13.1: "**WCAG 2.2 AA is the release target.** Web and
widget MUST support keyboard navigation, visible focus, screen-reader labels, contrast and responsive
layouts." PRD §41.1 gives the universal checks every customer screen must pass before feature-specific
sign-off:

> works at 360 px, 768 px and 1280 px widths without hiding legal status, citations, primary actions or
> error recovery; complete keyboard operation with visible focus and logical order; one programmatic
> page heading, labelled fields, error summaries and live regions for asynchronous status; colour is
> never the only status signal; dates display unambiguously as `3 Aug 2026` in UI while APIs use ISO
> format; jurisdiction, legal status and source freshness use text plus badge/icon;
> destructive/security-sensitive actions name exact effect and recovery; request/job/correction IDs are
> copyable from errors and support panels; customer research content is not placed in URL query
> strings, analytics, browser error telemetry or page titles; refresh/back/forward/reconnect does not
> duplicate writes or charges.

**Rendering is a security boundary.** PRD §37.5: "Returned JSON is schema-validated; all links and
source metadata are constructed from system records. **Markdown is rendered through an allowlist and
HTML is sanitised.** Generated text never directly triggers an email, webhook, corpus promotion, record
transition, credential use or external action." Requirement `SEC-003` is "Model output is
schema/citation/licence/sanitisation validated before display" with acceptance "Prompt-injection/XSS/
invalid-URL fixtures pass". Server-side validation is `12-evidence-safety` (`packages/citations`); the
render-time allowlist here is the second, independent layer.

**Why `FND-03` is the blocker.** breakdown-plan §5.1 gives `FND-03` "Canonical enums and opaque ID
conventions … One generated source for every controlled value in the product" (PRD §6.7, §8.4, §11.1,
§15.5, §17.2, §34.1, §35.1). Every badge this package renders — legal status, jurisdiction, authority
role, citation relation (`supports`/`qualifies`/`contradicts`), async state, freshness — displays a
controlled value from that single source. This package defines **no** enum of its own.

**Accepted caveats carried forward, documented not enforced here:**

- **No design system is specified by the PRD.** Visual styling is an implementation detail (PRD §45.5
  "Implementation detail: local code choice within all existing contracts"). What is *not* free is the
  PRD §41.1 behaviour list and WCAG 2.2 AA — those are asserted.
- **The evidence data shapes come from elsewhere.** The evidence-pack schema is PRD §36.4 and the
  Answer Snapshot is PRD §34.5, owned by `12-evidence-safety` and `15-answer-product`. This package
  takes **props**, typed against `packages/contracts` where `FND-03`/`FND-04` already export them, and
  fetches nothing.

## Goal

Produce `packages/ui` as the single source of the ten PRD §31.3 async states, the accessible primitive
set every customer screen composes from, and one evidence/source panel that satisfies PRD §32.1,
§32.3 and §32.4 by props alone. Completion is mechanically checkable: an exhaustive test renders all
ten states and asserts each shows a visible title, a plain-language explanation, an allowed next action
and a copyable request/job id; the evidence panel renders a committed Answer Snapshot fixture with
claim→citation selection showing exact text, pinpoint, effective interval, authority role, official URL
and support/qualify/contradict relation; and an automated accessibility pass over every exported
component at 360 px, 768 px and 1280 px reports zero WCAG 2.2 AA violations.

## Non-goals

- **No screens.** Every `apps/web/src/features/**` subtree belongs to `13`, `14`, `15`, `16`, `17`,
  `19`, `20` or `24` (breakdown-plan §4); the shell and Home are `RUNT-05`. This package exports
  components; it renders no route.
- **No data fetching, no API client, no state store.** `apps/web/src/lib/**` is `RUNT-05`. Components
  are prop-driven and side-effect free apart from local UI state.
- **No enums.** `packages/contracts` (`FND-03`) is the single generated source (PRD §35.1); duplicating
  a controlled value here would violate breakdown-plan §4.1's serial ownership.
- **No server-side sanitisation or citation validation.** `packages/citations` and `packages/pii` are
  `12-evidence-safety` (`EVID-02`, `EVID-03`). The render-time allowlist here is a second layer, not a
  replacement.
- **No evidence assembly, ranking or retrieval.** `11-retrieval-engine`.
- **No cross-boundary accessibility suite.** `tests/e2e/**` accessibility automation is `23-assurance`
  (`ASSR-07`). This ticket carries its own co-located checks (breakdown-plan §9 R8).
- **No widget or admin components.** `apps/widget/**` is `20-developer-platform`; `apps/admin/**` is
  `22-internal-admin`. Both **may** consume this package.

## File-scope (write-owns)

- `packages/ui/**` — including `packages/ui/package.json`, `tsconfig.json`, `src/**` and `test/**`,
  and the committed fixtures under `packages/ui/test/fixtures/**`. The manifest is an **append-only
  extension** of the empty workspace-member skeleton `FND-01` created (breakdown-plan §1.1).

Does not touch:

- `apps/web/**` — `RUNT-05` (shell, Home) and the eight product feature modules.
- `packages/contracts/**` — `00-foundation` (`FND-03`/`FND-04`), serial-owned canonical enums and
  generated bindings.
- `packages/citations/**`, `packages/pii/**` — `12-evidence-safety`.
- `packages/observability/**` — `RUNT-07`. `apps/api/**`, `apps/worker/**` — `RUNT-01`…`RUNT-04`,
  `RUNT-08` and the product modules.
- `apps/widget/**`, `apps/admin/**` — `20-developer-platform`, `22-internal-admin`.
- `infra/**`, `tests/**` — `RUNT-09`/`18-ops-release`, `23-assurance`.
- Root manifests, lockfiles, `.github/workflows/**` — `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown-plan §1: phase 1, nothing merged, no
in-flight ticket), so nothing has previously written `packages/ui/**` and nothing contends for it.
breakdown-plan §4 gives the entire `packages/ui/**` tree to `03-app-runtime`, and §5.4 gives it wholly
to this ticket — no sibling shares it. Sibling tickets are in different trees: `RUNT-01`/`RUNT-02`/
`RUNT-03`/`RUNT-08` are `apps/api`, `RUNT-04` is `apps/worker`, `RUNT-05` is `apps/web`, `RUNT-07` is
`packages/observability`, `RUNT-09` is `infra/compose`. This ticket is in wave 1 with `RUNT-01`,
`RUNT-04`, `RUNT-05` and `RUNT-07`, all five runnable as concurrent lanes (breakdown-plan §7).
`RUNT-05` consumes this package concurrently; the dependency is one-directional (this package imports
nothing from `apps/web`), so the lanes stay safe.

## Deliverables

1. **`packages/ui/package.json` / `tsconfig.json`** — extend the `FND-01` skeleton; peer-dependency on
   React (PRD §18.2), workspace dependency on `packages/contracts`. No toolchain version is declared
   here: breakdown-plan §8 **Q12** fixes them (Node.js `24.18.0`, pnpm `11.4.0`) and `FND-01` holds
   the pins, so this package is built and its accessibility suite runs on exactly those versions.
2. **`src/async-state/JobStateView.tsx`** — the single component covering all ten PRD §31.3 states.
   Props: `{ state: JobUiState; requestId: string; jobId?: string; title?: string; explanation?:
   string; actions: JobStateAction[]; expiresAt?: string }`. For **every** state it renders a visible
   title, a plain-language explanation, the allowed next action(s), and the request/job id in a
   copyable control. The default title/explanation per state is exported as
   `src/async-state/state-copy.ts` so no screen invents its own wording. A bare spinner is not
   representable by the API (PRD §31.3 "A spinner without state or recovery guidance is not
   acceptable"). `JobUiState` is imported from `packages/contracts` (`FND-03`) if exported there;
   otherwise it is declared here and the divergence is written back (see Feedback obligation).
3. **`src/evidence/EvidencePanel.tsx`** — the A6 component, prop-driven, satisfying all three PRD
   contracts through one API:
   - `mode: 'source' | 'claim' | 'candidate'` selects the PRD §32.1 / §32.3 / §32.4 presentation;
   - `source` mode renders version timeline, source/licence limitations and related
     amendments/cases/instruments (PRD §32.1);
   - `claim` mode renders, for the selected claim, its supporting citations and, for a selected
     citation, exact text, pinpoint, effective interval, authority role, official URL and the
     `supports | qualifies | contradicts` relation (PRD §32.3);
   - `candidate` mode renders only the evidence relevant to the selected candidate (PRD §32.4).
     Selection is controlled (`selectedClaimId`, `selectedCitationId`, `selectedCandidateId` +
     `onSelect*`), so the owning screen holds the state and this package holds none of it.
4. **`src/evidence/ClaimText.tsx`** — renders claim-linked prose where each material sentence carries
   its claim id(s) and selecting one raises `onSelectClaim`. Highlighting of source passages is driven
   by offsets supplied in props; this package computes no offsets (PRD §32.3; offsets are
   `packages/citations`, `EVID-02`).
5. **`src/safe/SafeMarkdown.tsx`** — the render-time allowlist required by PRD §37.5. A fixed tag and
   attribute allowlist, no raw HTML pass-through, no `javascript:`/`data:` URLs, all links rendered
   with `rel="noopener noreferrer"`, and any URL not matching the allowlisted schemes rendered as
   inert text. This is the second, independent layer behind `packages/citations` (`SEC-003`).
6. **`src/primitives/**`** — the accessible primitive set every screen composes from: `Button`,
   `Link`, `TextField`, `TextArea`, `Select`, `MultiSelect`, `DateField`, `Checkbox`, `RadioGroup`,
   `Dialog`, `Disclosure`, `Tabs`, `Table`, `Toolbar`, `Chip`, `Badge`, `Tooltip`,
   `CopyableId`, `ErrorSummary`, `LiveRegion`, `PageHeading`, `SkipLink`, `EmptyState`. Every one:
   labelled, keyboard-operable, visible focus, correct roles, and responsive at 360/768/1280 px
   (PRD §13.1, §41.1).
7. **`src/status/**`** — `LegalStatusBadge`, `JurisdictionBadge`, `FreshnessBadge`,
   `AuthorityRoleBadge`, `CitationRelationBadge`. Each renders **text plus an icon/shape**, never
   colour alone, and takes its allowed values from `packages/contracts` (PRD §41.1 "jurisdiction, legal
   status and source freshness use text plus badge/icon"; "colour is never the only status signal").
8. **`src/format/date.ts`** — the PRD §41.1 date rule as one helper: UI renders `3 Aug 2026`; ISO 8601
   strings pass through to APIs untouched. Exported so `RUNT-05` and every feature use the same one.
9. **`src/actions/DestructiveAction.tsx`** — a confirmation wrapper that requires the caller to supply
   the exact effect and the recovery path as text, and refuses to render without both (PRD §41.1
   "destructive/security-sensitive actions name exact effect and recovery").
10. **`src/ui.ts`** — a single explicit export barrel, mapped as this package's `"."` export in
    `package.json`. Anything not exported here is private; a test asserts the public surface matches a
    committed list so a downstream module cannot depend on an internal path.
    *(Corrected from `src/index.ts` by `RUNT-06`: `tools/workspace-assertions.mjs#assertEntryFilesEmpty`,
    asserted on every branch, requires every member's `src/index.ts` to stay byte-exactly `export {};`.
    The merged precedent for a package needing a real entry is an `exports` map pointing at a
    differently-named file — `packages/database` and `packages/sdk-typescript` both do this. No
    acceptance semantics change: "the public export surface matches a committed list" is asserted
    exactly as specified, against `src/ui.ts`.)*
11. **Committed fixtures** — `packages/ui/test/fixtures/`:
    `answer-snapshot.json` (a PRD §34.5-shaped snapshot with claims, citations and all three relation
    values), `evidence-pack.json` (PRD §36.4-shaped), `search-detail.json` (PRD §32.1 panel data) and
    `coverage-candidate.json` (PRD §32.4). All synthetic — no blind evaluation gold, no customer
    content (PRD §45.1 item 6; breakdown-plan §9 R9).
12. **Accessibility harness** — `packages/ui/test/a11y.ts`, a reusable helper that runs the automated
    accessibility pass over a rendered component at the three PRD §41.1 widths. Exported so every
    downstream screen ticket runs the identical check.

## Acceptance checklist (classified)

- [ ] `[machine]` All ten PRD §31.3 states render with a visible title, plain-language explanation,
      allowed next action and a copyable request/job id — a table-driven test over the literal
      ten-state list, so a missing state fails (PRD §31.3)
- [ ] `[machine]` No exported API can produce a state view without an explanation and an action —
      asserted at the type level and by a runtime guard test (PRD §31.3 "A spinner without state or
      recovery guidance is not acceptable")
- [ ] `[machine]` `EvidencePanel` in `source` mode renders version timeline, source/licence limitations
      and related amendments/cases/instruments (PRD §32.1)
- [ ] `[machine]` `EvidencePanel` in `claim` mode: selecting a claim raises `onSelectClaim` and shows
      its citations; selecting a citation shows exact text, pinpoint, effective interval, authority
      role, official URL and the `supports | qualifies | contradicts` relation — all six fields
      asserted present (PRD §32.3)
- [ ] `[machine]` `EvidencePanel` in `candidate` mode renders **only** evidence for the selected
      candidate — asserted by including a second candidate's evidence in the props and requiring its
      absence from the rendered output (PRD §32.4)
- [ ] `[fixture]` The committed `answer-snapshot.json`, `evidence-pack.json`, `search-detail.json` and
      `coverage-candidate.json` fixtures render without error and reproduce the field sets above
      (replay of recorded data; the fixtures are synthetic per PRD §45.1 item 6)
- [ ] `[machine]` `SafeMarkdown` neutralises a `<script>` tag, an `onerror` attribute, a
      `javascript:` URL and a `data:` URL from a prompt-injection/XSS fixture string; no raw HTML
      passes through; links carry `rel="noopener noreferrer"` (PRD §37.5; `SEC-003`)
- [ ] `[machine]` Every status badge renders text **and** an icon/shape; a colour-only variant is not
      representable (PRD §41.1)
- [ ] `[machine]` Badge allowed values come from `packages/contracts`; no controlled value is declared
      in this package — asserted by a source scan for literal enum arrays (PRD §35.1; breakdown-plan
      §4.1)
- [ ] `[machine]` `formatLegalDate` renders `3 Aug 2026` and leaves ISO 8601 API values untouched
      (PRD §41.1)
- [ ] `[machine]` `DestructiveAction` refuses to render without both the exact-effect and recovery
      texts (PRD §41.1)
- [ ] `[machine]` Automated accessibility pass over **every** exported component at 360 px, 768 px and
      1280 px reports zero WCAG 2.2 AA violations; complete keyboard operation with visible focus and
      logical order; labelled fields; `ErrorSummary` and `LiveRegion` expose the correct roles
      (PRD §13.1 "WCAG 2.2 AA is the release target", §41.1)
- [ ] `[machine]` At 360 px no component hides legal status, citations, primary actions or error
      recovery — asserted by requiring those elements to remain in the accessibility tree at the
      narrow width (PRD §41.1)
- [ ] `[machine]` The public export surface matches the committed list in `src/index.ts`'s test, so no
      downstream module depends on an internal path
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `SEC-003` (render layer) and the accessibility
      impact
- [ ] `[human]` Founder review against the full PRD §41.1 list on a rendered gallery of every component
      at the three widths, including the "destructive/security-sensitive actions name exact effect and
      recovery" and "request/job/correction IDs are copyable" rows (PRD §41.1, §43.4)
- [ ] `[human]` Screen-reader pass over `JobStateView` and `EvidencePanel` confirming that async status
      changes are announced and that claim→citation selection is operable and comprehensible without
      sight (PRD §13.1 "screen-reader labels"; WCAG 2.2 AA is not fully machine-decidable)
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)

## Test plan

Reviewer steps, offline, no network:

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm --filter @taxrag/ui test`. *(Corrected from `@aer/ui` by `RUNT-06`: the workspace member
   `FND-01` created is named `@taxrag/ui`, and `tsconfig.base.json#paths` maps that name. The package
   is not renamed.)* Suites live under `packages/ui/test/`; the component harness is the
   runner `FND-01` selected (Vitest + Testing Library or equivalent) with a jsdom/browser-mode
   environment for the accessibility pass.
3. **`async-state.test.tsx`** — table-driven over a literal array of the ten PRD §31.3 state names
   written out in the test file (so the list cannot silently shrink). For each: assert a visible title,
   a non-empty explanation, at least one action, and a `CopyableId` carrying the request/job id.
4. **`evidence-panel.test.tsx`** — render `packages/ui/test/fixtures/answer-snapshot.json` in `claim`
   mode; select claim 1, assert its citations appear; select a citation, assert all six PRD §32.3
   fields. Render `search-detail.json` in `source` mode and assert the three PRD §32.1 regions. Render
   `coverage-candidate.json` in `candidate` mode with two candidates' evidence supplied and assert the
   unselected candidate's evidence text is absent from the output.
5. **`safe-markdown.test.tsx`** — an XSS/prompt-injection fixture string containing `<script>`,
   `<img onerror=...>`, `[x](javascript:alert(1))` and a `data:` URL. Assert none survives, that link
   elements carry `rel="noopener noreferrer"`, and that a `secret-canary-<uuid>` embedded in an
   attribute does not appear in any rendered attribute value.
6. **`badges.test.tsx`** — every status badge renders text and a non-colour signal. Then a source scan
   asserting no literal enum array is declared in `packages/ui/src/**`.
7. **`a11y.test.tsx`** — iterate the export barrel, render each component with its fixture props via
   `packages/ui/test/a11y.ts`, and run the accessibility engine at 360, 768 and 1280 px. Assert zero
   WCAG 2.2 AA violations, and assert the narrow-width retention of legal status, citations, primary
   actions and error recovery.
8. **`exports.test.ts`** — compare the runtime export surface against the committed list.
9. The two `[human]` rows are run against a component gallery built with `pnpm dev` in `apps/web`
   (after `RUNT-05`) or the package's own preview, and recorded in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **One `EvidencePanel` cannot serve PRD §32.1, §32.3 and §32.4** without becoming three components in
  a trench coat → that falsifies decision **A6**. Write, in order, before splitting anything:
  (a) `docs/adr/NNNN-shared-evidence-panel.md` recording the falsification and the replacement
  boundary (PRD §45.5 "Architecture decision"; breakdown-plan **A9** gives per-file ADR ownership);
  (b) an amendment to `docs/prd/breakdown-plan.md` §2.1 row A6 and §4.2's contested-path row;
  (c) an amendment to `docs/prd/03-app-runtime/README.md` §4 D3. The alternative — letting `14` and
  `15` each own a copy — is exactly what A6 exists to prevent and must not be reached silently.
- **A controlled value the badges need is not exported by `packages/contracts`** (`FND-03`) → raise a
  `00-foundation` ticket and add the dependency in `docs/prd/breakdown-plan.md` §5.4/§6.2. Note the
  temporary local declaration in `docs/prd/03-app-runtime/README.md` §6 as a new open question. Do
  **not** write `packages/contracts/**` — it is serial-owned (breakdown-plan §4.1) and PRD §35.1
  generates database check constraints from it.
- **A PRD §31.3 state cannot be rendered meaningfully** (for example `EXPIRED` has no data left to
  show) → PRD §31.3 says "where retention permits" only for `EXPIRED`; every other state is
  unconditional. Record the retention-driven variant in this ticket's Deliverable 2 and `--sync`
  before changing code; do not drop a state.
- **WCAG 2.2 AA cannot be reached for a component** → PRD §13.1 makes it the release target and PRD
  §26 puts "English UI, accessibility and responsive requirements pass release review" in the
  Definition of Done. A shortfall is a **product change** (PRD §45.5) requiring "a recorded reason and
  visible limitation" (PRD §1, SHOULD/MUST semantics). Record it in
  `docs/prd/03-app-runtime/README.md` §6 with the Founder as owner and in the PR's known-gaps line
  (PRD §45.4); do not lower the assertion threshold.
- **The render-time allowlist blocks legitimate model output** → do **not** widen it locally. The
  server-side sanitiser is `packages/citations` (`EVID-02`, `12-evidence-safety`); raise the shape
  there. Any widening of the allowlist is a `SEC-003` change and is recorded in
  `docs/adr/NNNN-shared-evidence-panel.md`'s consequences section before code changes.
- **A downstream screen needs a component this package does not export** → add it here (this module
  owns `packages/ui/**`), never a private copy in `apps/web/src/features/**`. If the request arrives
  after this ticket is delivered, it is a new `03-app-runtime` ticket, recorded in
  `docs/prd/breakdown-plan.md` §5.4 and §6.2.

**3. Escalation.** A6 is a decomposition-critical decision recorded in `docs/prd/breakdown-plan.md`
§2.1 and §4.2 that removes an otherwise-real coupling between modules `14`, `15` and `17`. If it is
outright falsified, that overturns a team decision three modules depend on: escalate for re-review
before any code lands. Never duplicate the panel silently.
