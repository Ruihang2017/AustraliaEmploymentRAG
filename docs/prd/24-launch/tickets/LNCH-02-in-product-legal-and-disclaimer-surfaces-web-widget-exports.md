---
id: LNCH-02
title: "In-product legal and disclaimer surfaces (web, widget, exports)"
module: 24-launch
lane: 24-launch
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [LNCH-01, RUNT-05, PLTF-05, XPRT-02]
blocks: [LNCH-04]
---

# LNCH-02 — In-product legal and disclaimer surfaces (web, widget, exports)

Implements PRD §11.2 (clear disclaimers in the Web app, widget and exports; never a definite-compliance
statement), PRD §8.10 ("The disclaimer, citations and product-source indicator MUST NOT be removable by
customer theming"), PRD §8.9 (export fidelity) and PRD §41.1 / §13.1 (universal UI acceptance and WCAG
2.2 AA). The adjacent §30.2 register rows are `EXP-001` (export fidelity, owned by `19-exports`) and
`DEV-002` (widget sessions, owned by `20-developer-platform`); the disclaimer surface itself has no
dedicated requirement ID and its register entry is PRD §26 Security/privacy item 4. **No ADR — the
decision is already made in PRD §11.2 and §8.10; this is build ticket 2 of 5 against it.**
Parent sub-PRD: [24-launch README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on:
[`LNCH-01`](LNCH-01-terms-privacy-aup-disclaimer-drafts-and-legal-review-pending-register.md) — the
canonical policy source, claim-language rules and required-strings list;
[`RUNT-05`](../../03-app-runtime/tickets/RUNT-05-web-app-shell-navigation-org-switcher-status-badges.md)
— the web feature-registration contract and navigation slots
([`03-app-runtime`](../../03-app-runtime/README.md)); `PLTF-05` — widget loader and sandboxed iframe
([`20-developer-platform`](../../20-developer-platform/README.md)); `XPRT-02` — PDF renderer
([`19-exports`](../../19-exports/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope
(`apps/web/src/features/legal/**`) against three fixed contracts — `RUNT-05`'s feature registration,
`LNCH-01`'s policy source and PRD §8.10's non-removability rule — not a new subsystem decision.

## Background + basis

**PRD §11.2 names three surfaces, not one:**

> - It MUST include clear disclaimers in the Web app, widget and exports.
> - It MUST NOT state that a customer is definitely compliant.

**PRD §8.10 makes non-removability a hard product property:**

> - The disclaimer, citations and product-source indicator MUST NOT be removable by customer theming.

That is a claim about what a *hostile or careless embedder* cannot do, so it can only be discharged by
driving the built surface with hostile configuration and asserting the outcome. This ticket therefore
ships a **conformance kit**, not just a component.

**PRD §8.9 extends it to exports:**

> Exports MUST preserve legal date, corpus release, claims, citations, assumptions, limitations and
> correction status. They MUST NOT regenerate the answer using current law. … Hidden
> prompts/reasoning, secrets and internal licensing notes MUST be excluded.

The export *renderers* are `19-exports`; this ticket asserts only that the disclaimer required by
PRD §11.2 is present in the rendered PDF.

**The registration contract is already fixed by `RUNT-05`** (breakdown-plan **A1**), and this ticket
is one of the ten tickets `blocked_by` it (breakdown-plan §6.2). Verbatim from `RUNT-05`'s ticket:

> Every immediate child directory of `apps/web/src/features/` is a **feature area**. Discovery uses a
> Vite glob in `apps/web/src/app/feature-registry.ts` … A feature area MUST contain `feature.tsx` with
> a **default export** of type `FeatureModule` … `apps/web/src/shell/nav-slots.ts` exports the frozen
> ordered tuple `['ORG_SWITCHER','HOME','SEARCH','ASK','COVERAGE','COMPARE','RECORDS','MONITOR',
> 'DEVELOPER','SETTINGS','HELP']` … A feature **claims** a slot; it never inserts one.

**There is no `/legal` route in PRD §31.2 and no legal navigation slot in PRD §31.1.** `RUNT-05`
anticipated exactly this ticket and fixed the interim rule:

> **PRD §31.1's eleven slots do not cover a required surface** (for example `24-launch`'s legal
> surface, PRD §5.14) → the slot list is a **product contract** (PRD §45.5 …). Do not add a twelfth
> slot. … in the meantime the surface attaches under `HELP` or `SETTINGS` and the deviation is stated
> in the PR's known-gaps line (PRD §45.4).

This ticket therefore claims the existing **`HELP`** slot (PRD §31.1 item 11, "Help/status/user menu")
and adds a `/legal/*` route group. Sub-PRD decision **D6**; open question **QL2** (Founder).

**The content is not this ticket's.** `LNCH-01` owns `docs/policies/**` as the single source
(sub-PRD **D2**); this ticket compiles it. `docs/policies/claim-language/required-strings.json` states
which string each surface must carry and `prohibited-claims.json` states what none of them may say.
The Builder writes **no policy or disclaimer text** — if a string is missing, the fix is a docs change
in `LNCH-01`, not a literal in a `.tsx` file.

**Universal UI acceptance applies.** PRD §41.1: screens must work "at 360 px, 768 px and 1280 px widths
without hiding legal status, citations, primary actions or error recovery"; "complete keyboard
operation with visible focus and logical order"; "one programmatic page heading"; "colour is never the
only status signal"; "dates display unambiguously as `3 Aug 2026` in UI while APIs use ISO format".
PRD §13.1: "WCAG 2.2 AA is the release target."

**Accepted caveats carried forward, documented not enforced here:**

- **Only three surfaces are *guaranteed* to exist when this ticket runs.** breakdown-plan §5.25 gives
  it `blocked_by: [LNCH-01, RUNT-05, PLTF-05, XPRT-02]` — the web shell, the widget and the **PDF**
  renderer. DOCX (`XPRT-03`), JSON (`XPRT-04`) and every product screen (`14`, `15`, `16`, `17`) are
  **not** blockers. The kit therefore has a *required* set (the three) and scans any further surface it
  finds, reporting rather than failing (Deliverable 6). Adding guarantees means adding DAG edges — a
  plan change, see Feedback obligation.
- **`packages/ui` is not a blocker either.** `RUNT-06` is wave 1 of `03-app-runtime` and this module is
  terminal, so in practice it is long merged; this ticket consumes its primitives and its accessibility
  harness and must **not** create a second component set (breakdown-plan **A6**).
- **Generated-answer safety is elsewhere.** The rule that a *generated answer* never makes an
  unsupported definitive claim is `FND-07`/`EVID-05`, verified by `ASSR-04`. This ticket's
  claim-language checks apply to **static product copy**.

## Goal

Produce `apps/web/src/features/legal/**` as (a) an A1-conforming feature area that renders the four
`docs/policies/**` documents at `/legal/*` under the `HELP` navigation slot, with version, effective
date and a visible draft label whenever a policy is not `PUBLISHED`; (b) the single exported
**disclaimer register** every other surface imports; and (c) a **surface conformance kit** that proves,
by driving already-built artifacts, that the disclaimer, product-source indicator and citations survive
hostile theming in the widget, appear in PDF export, and appear on every web surface this module
renders. Completion is mechanically checkable: `node --test` / `pnpm test --filter @aer/web` runs the
kit offline, the kit emits `legal-surface-conformance.json` with a per-surface verdict, the claim
checker reports zero prohibited claims, and an automated WCAG 2.2 AA pass over the legal pages at
360/768/1280 px reports zero violations.

## Non-goals

- **No policy or disclaimer wording.** `docs/policies/**` is `LNCH-01`; the content is the **Founder's**
  (sub-PRD D1/QL1). A hard-coded legal string in this tree is a defect even if it renders correctly.
- **No widget code.** `apps/widget/**` is `20-developer-platform` (`PLTF-05`, `PLTF-06`). This ticket
  imports the built widget read-only and asserts its behaviour.
- **No export renderer code.** `apps/worker/src/handlers/export/**` is `19-exports` (`XPRT-02`…`04`).
  Same rule: read-only import, outcome assertion.
- **No product screens.** The answer result, record, search, coverage, compare and monitor screens that
  must display the disclaimer are `15-answer-product`, `17-records-collab`, `14-search-product`,
  `16-monitor-alerts`. They import the register exported here; this ticket never writes their trees.
- **No shell, navigation or route-table changes.** `apps/web/src/{app,shell,lib}/**`,
  `apps/web/{package.json,index.html,vite.config.ts}` are `RUNT-05`. No twelfth nav slot, no edit to
  PRD §31.2 (sub-PRD D6, QL2 — Founder).
- **No `packages/ui` components.** `RUNT-06` owns the primitives, the ten PRD §31.3 async states and
  the evidence panel (breakdown-plan **A6**).
- **No public marketing/status site.** `apps/web/public-site/**` is `LNCH-03` (same module, same wave,
  disjoint tree).
- **No cross-boundary suites.** `tests/e2e/**` including accessibility is `23-assurance` (`ASSR-06`,
  `ASSR-07`). This ticket carries its own co-located checks (breakdown-plan §9 R8).
- **No answer-safety logic.** Refusal/status decisions, claim support and citation validation are
  `FND-07`, `EVID-05`, `EVID-04`.

## File-scope (write-owns)

- `apps/web/src/features/legal/**` — the feature area, the compiled policy module, the disclaimer
  register, the conformance kit, this ticket's tests and its synthetic fixtures.

Does not touch:

- `apps/web/src/{app,shell,lib}/**`, `apps/web/{package.json,tsconfig.json,index.html,vite.config.ts}`,
  `apps/web/test/**`, `apps/web/src/features/home/**` — `RUNT-05` (`03-app-runtime`).
- `apps/web/src/features/**` other than `legal/**` — `13`, `14`, `15`, `16`, `17`, `19`, `20`.
- `apps/web/public-site/**` — `LNCH-03` (same module).
- `apps/widget/**` — `20-developer-platform`. `apps/worker/**`, `apps/api/**` — `03-app-runtime` and the
  product modules. `packages/ui/**` — `RUNT-06`.
- `docs/policies/**` — `LNCH-01`. `docs/onboarding/**` — `LNCH-04`. `docs/release/**` — `LNCH-05`.
- `tests/**` — `23-assurance`. `docs/adr/**` — no ADR is created by this ticket.
- Root manifests, lockfiles, `.github/workflows/**` — `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown-plan §1: phase 1, nothing merged), so no
ticket has previously written `apps/web/src/features/legal/**` and nothing contends for it.
breakdown-plan §4 allocates `apps/web/src/features/legal/**` to `24-launch` alone and splits the rest
of `apps/web` between `03-app-runtime` and seven product modules, each owning named sibling directories
under `src/features/`; by the A1 contract, adding this directory changes **zero** tracked files outside
it. Inside this module the sibling scopes are disjoint trees (`docs/policies/**`,
`apps/web/public-site/**`, `docs/onboarding/**`, `docs/release/**`). This ticket shares wave 2 with
`LNCH-03` only (breakdown-plan §7: 4 waves, 2 peak lanes); their trees do not intersect, so the two run
as concurrent lanes safely. This ticket claims no `docs/adr/` file, so breakdown-plan **A9** does not
apply.

## Deliverables

1. **`feature.tsx`** — the A1 `FeatureModule` default export:
   - `id: 'legal'` (must equal the directory name);
   - `routes`: `/legal` (index), `/legal/terms`, `/legal/privacy`, `/legal/acceptable-use`,
     `/legal/disclaimer`;
   - `nav`: `{ slot: 'HELP', label: 'Help & legal', to: '/legal', visibleWhen: () => true }` — the
     surface is visible to every authenticated member; this feature encodes **no role rule**
     (`RUNT-05` contract item 2, breakdown-plan risk R5);
   - `onOrganizationChange`: an explicit no-op with a comment stating that this feature holds no
     organisation-scoped cache — declared, not omitted, so `RUNT-05`'s org-switch conformance harness
     covers it.
2. **`content/generate.mjs` + `content/generated/policies.ts`** — a build-time compilation of
   `docs/policies/*.md` (frontmatter + body) into a typed, checked-in module:
   `{ id, title, version, status, effectiveDate, legalReview, appliesTo, sections: [{heading, html}],
   shortForm?, exportForm? }`. The generator is dependency-free (Node stdlib; sub-PRD D11) and the
   generated file carries the standard "generated — do not edit" header plus the source content hash.
   A test asserts regeneration produces **no diff** (PRD §20.1: "Generated OpenAPI/SDK/event/manifest
   bindings MUST NOT be hand-edited"; breakdown-plan §1.1 "Generated artifacts").
3. **`disclaimer/register.ts`** — the canonical export every other surface imports:
   `DISCLAIMER_SHORT_FORM`, `DISCLAIMER_EXPORT_FORM`, `PRODUCT_SOURCE_INDICATOR` and
   `CITATIONS_REQUIRED_NOTE`, each `{ id, text, version, sourcePath, prdRef }`, plus
   `REQUIRED_SURFACES` read from `docs/policies/claim-language/required-strings.json` at generation
   time. Every value derives from the compiled policy module — **no string literal of legal copy exists
   in this tree** (a test asserts it: every exported text must equal a value present in
   `content/generated/policies.ts`).
4. **`components/DisclaimerBanner.tsx`** — the shared renderer, composed from `packages/ui` primitives
   (breakdown-plan A6):
   - props `{ surface: 'web-app' | 'widget' | 'exports', variant: 'inline' | 'footer' }`;
   - renders `DISCLAIMER_SHORT_FORM` plus a link to `/legal/disclaimer`, and the product-source
     indicator where PRD §8.10 requires it;
   - **not dismissible and not conditionally rendered**: the component exposes no `hidden`, `compact`
     or `variant: 'none'` escape and throws at render time if the register value is empty. The
     behavioural guarantee is *either fully visible or a render error* — never silently absent.
5. **`components/LegalPage.tsx` + `pages/*.tsx`** — the four policy pages and the `/legal` index:
   - one programmatic `<h1>` per page via `RUNT-05`'s `PageHeading` slot (PRD §41.1);
   - a header line showing document `version`, `effectiveDate` (formatted `3 Aug 2026` through the
     shared date helper — PRD §41.1) and, when `status !== 'PUBLISHED'`, a **Draft** badge with text
     plus icon (PRD §41.1 "colour is never the only status signal") so an unfilled policy can never
     look final;
   - sections rendered through `packages/ui`'s `SafeMarkdown` (PRD §37.5 render-time allowlist) — this
     ticket implements no second sanitiser;
   - a visible "last reviewed" line and the issue-reporting path (PRD §12.3, `COR-001`) as a link only;
   - no `FOUNDER_INPUT_REQUIRED` marker is ever rendered as prose: an unfilled section renders as an
     explicit "This section is not yet drafted" state (a test asserts the raw marker text never reaches
     the DOM).
6. **`conformance/` — the surface conformance kit** (the load-bearing deliverable):
   - `conformance/surfaces.ts` — the registry
     `{ id, kind: 'web' | 'widget' | 'export', required: boolean, locate(): Locator }`. `required: true`
     for exactly the three surfaces guaranteed by this ticket's `blocked_by`: this module's own web
     pages, the built widget (`PLTF-05`) and the PDF renderer (`XPRT-02`). Every other surface
     discovered in the workspace is registered with `required: false`.
   - `conformance/widget-theming.test.ts` — mounts the **built** widget with a hostile configuration:
     every documented theming/config key set to hide, empty or override the disclaimer region, plus an
     injected stylesheet attempting `display:none`, `visibility:hidden`, `opacity:0`, `font-size:0`,
     `clip-path`, `height:0` and `aria-hidden="true"` on the disclaimer, citation and product-source
     nodes. Asserts all three remain present, have a non-zero rendered box, are not `aria-hidden`, and
     carry the register text (PRD §8.10).
   - `conformance/export-pdf.test.ts` — renders a committed synthetic Answer Snapshot fixture through
     the `XPRT-02` PDF renderer, extracts the text layer and asserts `DISCLAIMER_EXPORT_FORM` is
     present (PRD §11.2, §8.9).
   - `conformance/web-surfaces.test.tsx` — asserts the register text is present on every route this
     feature renders, and scans any other discovered `apps/web/src/features/*` surface for the required
     strings, recording (not failing) absences.
   - `conformance/claims.test.ts` — applies `docs/policies/claim-language/prohibited-claims.json` to all
     rendered copy in this feature, to `register.ts`'s exported strings and to the compiled policy
     module. Zero matches required (PRD §11.2, §11.1, §13.2, §13.4, §44.4).
   - `conformance/run.mjs` + `conformance/report.ts` — a standalone runner writing
     `legal-surface-conformance.json`: `{ generatedAt, registerVersion, surfaces: [{ id, kind, required,
     verdict: 'PRESENT' | 'MISSING' | 'NOT_BUILT', details }] }`. A `MISSING` verdict on a
     `required: true` surface fails the run; on a `required: false` surface it is reported for
     `LNCH-05`'s closure record (`DOD-SEC-04`) and named in this PR's known-gaps line (PRD §45.4).
7. **`test/fixtures/**`** — synthetic inputs only: an Answer Snapshot shaped by PRD §34.5 (reuse
   `packages/ui/test/fixtures/answer-snapshot.json` if `RUNT-06` exports it; otherwise a local synthetic
   copy), a hostile widget configuration, and a policy tree in each of the three lifecycle statuses. No
   customer content and no blind evaluation gold (PRD §45.1 item 6; breakdown-plan §9 R9).
8. **Accessibility check** — `a11y.test.tsx` running `packages/ui/test/a11y.ts` (`RUNT-06`'s exported
   harness) over the `/legal` index and all four policy pages at 360, 768 and 1280 px: zero WCAG 2.2 AA
   violations, complete keyboard operation with visible focus, exactly one `<h1>` per page, and no
   content hidden at the narrow width (PRD §13.1, §41.1).
9. **`index.ts`** — the module's public export surface: `DisclaimerBanner`, the register constants and
   the conformance kit's `assertRequiredStrings(html | text)` helper, so `15-answer-product`,
   `17-records-collab`, `19-exports` and `20-developer-platform` have exactly one import path. A test
   asserts the public surface matches a committed list (the pattern `RUNT-06` uses for `packages/ui`).

## Acceptance checklist (classified)

- [ ] `[machine]` The `legal` feature area registers through `RUNT-05`'s
      `apps/web/test/feature-conformance.tsx` harness with **zero** diff to any tracked file outside
      `apps/web/src/features/legal/**`, claims the `HELP` slot, and adds no nav slot
      (breakdown-plan A1; PRD §31.1; sub-PRD D6)
- [ ] `[machine]` All five routes render; each page shows `version`, `effectiveDate` formatted
      `3 Aug 2026`, and a text-plus-icon **Draft** badge whenever `status !== 'PUBLISHED'`
      (PRD §41.1; sub-PRD D1)
- [ ] `[machine]` No legal string literal exists in this tree: every exported register text equals a
      value in `content/generated/policies.ts`, which is compiled from `docs/policies/**`
      (PRD §11.2; sub-PRD D2)
- [ ] `[machine]` Regenerating `content/generated/policies.ts` produces no diff, and the file's recorded
      source hash matches `docs/policies/**` (PRD §20.1; breakdown-plan §1.1)
- [ ] `[machine]` A raw `FOUNDER_INPUT_REQUIRED` marker never reaches the DOM; an unfilled section
      renders an explicit not-yet-drafted state (PRD §11.2; sub-PRD D1)
- [ ] `[machine]` `DisclaimerBanner` cannot be rendered hidden: no prop suppresses it and an empty
      register value throws at render — "either fully visible or a render error" (PRD §8.10)
- [ ] `[machine]` The `prohibited-claims.json` scan over all rendered copy, the register and the
      compiled policy module reports zero matches — no surface states definite compliance, legal
      representation, government endorsement, an SLA, unlimited capacity or complete coverage
      (PRD §11.2, §11.1, §13.2, §13.4, §44.4)
- [ ] `[machine]` The `required-strings.json` presence assertion passes for every web route this
      feature renders (link/copy presence assertion; PRD §11.2, §8.10)
- [ ] `[machine]` `conformance/run.mjs` writes `legal-surface-conformance.json` with a verdict for every
      registered surface; a `MISSING` verdict on any `required: true` surface fails the run
      (PRD §11.2; this file is `LNCH-05` evidence for `DOD-SEC-04`)
- [ ] `[machine]` Automated WCAG 2.2 AA pass over the `/legal` index and four policy pages at 360, 768
      and 1280 px reports zero violations; complete keyboard operation with visible focus; exactly one
      programmatic `<h1>` per page; nothing legally material is hidden at 360 px
      (PRD §13.1, §41.1)
- [ ] `[machine]` The public export surface matches the committed list, so downstream modules cannot
      depend on an internal path (PRD §20.1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items, naming PRD §26 Security/privacy item 4, PRD §8.10, the
      **QL2** route-table deviation, and every `required: false` surface reported `MISSING`
- [ ] `[fixture]` Replaying the committed hostile widget configuration against the built `PLTF-05`
      widget leaves the disclaimer, citations and product-source indicator present, non-zero-sized and
      not `aria-hidden` (PRD §8.10) — a recorded-input replay, hence `[fixture]`
- [ ] `[fixture]` Replaying the committed synthetic Answer Snapshot through the `XPRT-02` PDF renderer
      yields a document whose text layer contains `DISCLAIMER_EXPORT_FORM` (PRD §11.2, §8.9)
- [ ] `[human]` Founder review of the four legal pages at 360/768/1280 px against PRD §41.1: the
      disclaimer and its link are never hidden, the Draft badge is unmistakable, and no page reads as a
      compliance guarantee (PRD §41.1, §43.4)
- [ ] `[human]` Gate 2 smoke: open the product, reach the legal pages from the `HELP` menu, confirm the
      disclaimer appears on an answer result and in a downloaded PDF (CLAUDE.md Gate 2; PRD §11.2)
- [ ] `[human]` **Founder** decides whether PRD §31.2's route table is amended to list `/legal/*`
      (sub-PRD **QL2**; PRD §45.5 Product change) — **not required to merge**; the deviation ships as a
      known gap
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)
- No PRD §40.8 adapter fixture or PRD §14/§43 evaluation replay applies (breakdown-plan §1.1)

## Test plan

Reviewer steps, offline, no network:

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/web`. Suites live under `apps/web/src/features/legal/**`; the harness is
   the component test runner `FND-01` selected (Vitest + Testing Library or equivalent), with the
   jsdom/browser-mode environment `RUNT-05` established. Copy `RUNT-05`'s
   `apps/web/test/feature-conformance.tsx` construction pattern for the registration test and
   `RUNT-06`'s `packages/ui/test/a11y.ts` for the accessibility pass.
3. **`feature-registration.test.tsx`** — mount through `loadFeatures()`, assert the five routes resolve,
   the `HELP` slot is claimed once, and `git status --porcelain` is clean at suite end (A1).
4. **`policy-pages.test.tsx`** — with the three committed policy-tree fixtures
   (`DRAFT_PENDING_FOUNDER_CONTENT`, `DRAFT_FOUNDER_APPROVED`, `PUBLISHED`): assert the Draft badge
   appears for the first two and not the third; assert `3 Aug 2026`-style dates; assert the raw
   `FOUNDER_INPUT_REQUIRED` marker never appears in the DOM.
5. **`generated.test.ts`** — run `node apps/web/src/features/legal/content/generate.mjs --check`; assert
   exit 0 and no diff. Then mutate a policy body in a temp copy and assert the check fails.
6. **`register.test.ts`** — assert every exported register string is present verbatim in
   `content/generated/policies.ts`; assert `DisclaimerBanner` throws when the register value is empty;
   assert no prop combination renders it absent.
7. **`conformance/widget-theming.test.ts`** — build or load the `PLTF-05` widget bundle, mount in the
   test environment with `test/fixtures/widget-hostile-config.json` plus the injected hostile
   stylesheet; assert presence, non-zero `getBoundingClientRect()`, `aria-hidden !== 'true'` and the
   register text for all three elements. No network: the widget is loaded from the workspace build
   output, and any widget session call is stubbed.
8. **`conformance/export-pdf.test.ts`** — call the `XPRT-02` renderer directly with
   `test/fixtures/answer-snapshot.json`; extract text; assert `DISCLAIMER_EXPORT_FORM` is present. If
   the renderer requires a service the test cannot start offline, stub at the renderer's own documented
   seam and record that in the test file's header comment.
9. **`conformance/claims.test.ts`** — load `docs/policies/claim-language/prohibited-claims.json`; scan
   rendered HTML for all five pages, the register and the compiled module; assert zero matches. Then
   inject the string `your organisation is fully compliant` into a temp fixture and assert the scan
   fails with rule `definite-compliance`.
10. `node apps/web/src/features/legal/conformance/run.mjs --out /tmp/legal-surface-conformance.json` →
    exit 0; inspect the JSON and confirm a verdict row exists for every registered surface and that
    each `required: true` row is `PRESENT`.
11. **`a11y.test.tsx`** — zero WCAG 2.2 AA violations at 360/768/1280 px; keyboard walk reaches every
    link with a visible focus ring; exactly one `<h1>` per page.
12. The three `[human]` rows run against a locally started stack (`pnpm stack:up`, `RUNT-09`) and are
    recorded in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **The widget's theming surface *can* remove the disclaimer** (a config key or CSS reaches it) → that
  falsifies PRD §8.10 in `PLTF-05`'s implementation, not here. Do **not** patch `apps/widget/**`.
  Write, in order: (a) the failing case into `conformance/widget-theming.test.ts` as a recorded fixture;
  (b) a docs change to `20-developer-platform`'s `PLTF-05` ticket file adding the explicit
  non-removability deliverable, then `publish-tickets.mjs --sync`; (c) a `MISSING` verdict in
  `legal-surface-conformance.json` and the known-gaps line of this PR, so `LNCH-05` sees it. PRD §8.10
  is a MUST — it is not closeable by narrowing the test.
- **The PDF renderer carries no disclaimer** → same shape: docs change to `19-exports`' `XPRT-02`
  ticket, `--sync`, and a `MISSING` verdict recorded. Never add rendering code to
  `apps/worker/src/handlers/export/**`.
- **DOCX/JSON export or a product screen must also be guaranteed** (not just scanned) → that is a new
  DAG edge. Add `XPRT-03`/`XPRT-04`/the screen ticket to this ticket's `blocked_by` in
  `docs/prd/breakdown-plan.md` §5.25 **and** the inverse in §6.2, amend this ticket file, re-run
  `dag-scan.mjs`, then `--sync`. Do not invent the edge locally — a dangling or cyclic edge fails
  `dag-scan.mjs`.
- **`docs/policies/**` lacks a string `required-strings.json` promises** → the fix is in `LNCH-01`
  (`docs/policies/**`), not a literal here. Raise it as a docs change to
  `docs/prd/24-launch/tickets/LNCH-01-*.md`, `--sync`, and rerun. A hard-coded legal string in this
  tree is a defect (Deliverable 3's test enforces it).
- **`RUNT-05`'s `HELP` slot is already claimed** (the shell renders the user menu itself, so the build
  fails "slot claimed twice") → do **not** edit `apps/web/src/shell/**`. Record it in
  `docs/prd/24-launch/README.md` §6 under **QL2**, raise a docs change against `RUNT-05` to expose a
  documented way for a feature to contribute to the `HELP` menu, `--sync`, and ship under `SETTINGS`
  in the meantime per `RUNT-05`'s stated interim rule, naming the deviation in the PR.
- **PRD §31.2's route table genuinely needs `/legal/*`** → `docs/PRD.md` is frozen (breakdown-plan §4).
  This is a **Product change** (PRD §45.5): raise it to the Founder through
  `docs/prd/24-launch/README.md` §6 **QL2**; never edit the PRD, and never add a twelfth nav slot.
- **`packages/ui` lacks a primitive this feature needs** → do not create a second component set
  (breakdown-plan **A6**). Use semantic markup as `RUNT-05` does and raise the missing primitive as a
  docs change against `RUNT-06`, then `--sync`.
- **The accessibility audit needs a dependency `apps/web` does not have** → `apps/web/package.json` is
  `RUNT-05`'s and the lockfile is `FND-01`'s (breakdown-plan §4.1). Raise a `03-app-runtime` ticket;
  do not edit either file.

**3. Escalation.** PRD §8.10 ("MUST NOT be removable by customer theming") and PRD §11.2 ("MUST NOT
state that a customer is definitely compliant") are product-level MUSTs behind a PRD §26
Definition-of-Done item. If either is outright falsified by an already-merged surface, that overturns a
decision recorded in a frozen document: escalate for re-review, record the gap in
`legal-surface-conformance.json` so `LNCH-05` cannot miss it, and never weaken the conformance kit to
make the run green.
