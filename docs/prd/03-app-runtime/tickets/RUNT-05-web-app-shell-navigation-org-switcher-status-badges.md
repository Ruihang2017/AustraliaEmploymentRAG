---
id: RUNT-05
title: "Web app shell: navigation, org switcher, status badges"
module: 03-app-runtime
lane: 03-app-runtime
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-04]
blocks: [IDNT-08, IDNT-09, FIND-03, FIND-05, ASK-06, WTCH-07, RCRD-08, PLTF-01, PLTF-08, LNCH-02]
---

# RUNT-05 — Web app shell: navigation, org switcher, status badges

Implements PRD §31.1 (global authenticated shell), §31.2 (route table) and §13.1 (language and
accessibility), carrying the client half of requirement `AUTH-002` ("A user can switch among
organisations without leaking state"). **No ADR — the decision is already made in PRD §31.1 and
§31.2; this is build ticket 5 of 9 against it.**
Parent sub-PRD: [03-app-runtime README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `FND-04` — OpenAPI root and generated TypeScript bindings
([`00-foundation`](../../00-foundation/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope against a shell contract
PRD §31.1 already enumerates item by item — not a new subsystem decision.

## Background + basis

**The shell contract is enumerated, not sketched.** PRD §31.1, in full:

> Desktop navigation order:
> 1. organisation switcher; 2. Home; 3. Search; 4. Ask; 5. Coverage; 6. Compare; 7. Research Records;
> 8. Monitor; 9. Developer, visible to Developer/Admin/Owner; 10. Settings; 11. Help/status/user menu.
>
> The shell MUST always display the active organisation, environment (`PRODUCTION` or `SANDBOX`),
> current CorpusRelease date/status, and a degraded service badge when freshness, generation or
> monitoring is limited. **Switching organisation clears unsaved forms and all organisation-scoped
> client caches.**

**The route table is fixed.** PRD §31.2 lists 25 routes with their screen, roles, main action and
empty/first-use state. This ticket owns `/` (Home: "Resume records, view alerts and usage"; empty
state "Three example anonymous tasks plus source-coverage link") and the shell frame around all the
others; each remaining route belongs to the module that owns its feature directory
(`docs/prd/breakdown-plan.md` §4).

**Accessibility is a release target, not a polish item.** PRD §13.1: "**WCAG 2.2 AA is the release
target.** Web and widget MUST support keyboard navigation, visible focus, screen-reader labels,
contrast and responsive layouts." PRD §41.1 adds the universal checks every customer screen must pass,
including "works at 360 px, 768 px and 1280 px widths", "one programmatic page heading", "colour is
never the only status signal", "dates display unambiguously as `3 Aug 2026` in UI while APIs use ISO
format", and "**customer research content is not placed in URL query strings, analytics, browser error
telemetry or page titles**".

**The stack is fixed and minimal.** PRD §18.2: "Web/admin/widget | React + Vite, TypeScript." PRD
§39.1 places the web bundle at the Cloudflare edge calling the `app` process; PRD §45.2 gives
`apps/web` "Screen contracts/accessibility/client state" and forbids it "Security-boundary PII or
tenant enforcement" — the browser is never the enforcement point.

**Why directory autoload, and why it is this ticket's job.** `docs/prd/breakdown-plan.md` §2.1 row
**A1**:

> `apps/api`, `apps/worker`, `apps/web` register routes/handlers/features by **directory convention**
> (autoload), never a shared central manifest. … Recorded by `RUNT-01`, `RUNT-04`, `RUNT-05`.

Eight modules own `apps/web/src/features/**` subtrees (`13`, `14`, `15`, `16`, `17`, `19`, `20`, `24`
— breakdown-plan §4) and **none** may edit a file this ticket owns. Ten tickets across those modules
are `blocked_by` this one (breakdown-plan §6.2).

**Why the shell does not depend on `RUNT-08`.** breakdown-plan §5.4 gives this ticket `blocked_by:
[FND-04]` only. The status badges are therefore coded against the **generated `GET /v1/system-status`
type** from `packages/contracts` (`FND-04` owns the OpenAPI root; PRD §16.2 lists the endpoint) plus a
committed fixture — not against `RUNT-08`'s implementation. Recorded as decision **D10** in
[`../README.md` §4](../README.md#4-decisions).

**Fixed inputs and accepted caveats, documented not enforced here:**

- **Routing and data-fetching libraries are undecided** — PRD §18.2 names only "React + Vite,
  TypeScript". This is open question **QR2** in [`../README.md` §6](../README.md#6-open-questions);
  this ticket records the answer in its ADR because eight modules build on it.
- **Role visibility rules are not encoded here.** PRD §31.1 item 9 makes Developer visible to
  Developer/Admin/Owner, but the role matrix lives in `packages/domain/src/access` (`FND-06`), which
  is **not** upstream of this ticket. The shell therefore consumes a predicate supplied by the feature
  (Deliverable 4); it encodes no role rule. This is breakdown-plan risk **R5** discipline.
- **The toolchain versions are fixed.** breakdown-plan §8 **Q12** is confirmed: Node.js `24.18.0`,
  pnpm `11.4.0`, Rust `1.97.1`, Python `3.14.6` — Node 24 LTS, not Node 26. `FND-01` holds the pins;
  this ticket declares no version of its own, and the Vite build and the component/accessibility
  runners execute on exactly those versions, the same ones CI runs (PRD §45.3).

## Goal

Produce a bootable `apps/web` Vite application whose global shell renders the eleven PRD §31.1
navigation slots, the active organisation, the `PRODUCTION`/`SANDBOX` environment label, the current
CorpusRelease date/status and a degraded-service badge; whose feature routes register purely by
existing as a directory under `apps/web/src/features/<area>/`; and in which switching organisation
provably clears unsaved forms and every organisation-scoped client cache. Completion is mechanically
checkable: a conformance test mounts a throw-away feature directory with **zero** diff to any tracked
file and sees its route and nav slot appear; an organisation-switch test asserts that no cache entry
keyed to the previous organisation survives and that a dirty form is discarded with a confirmation
step; and an automated accessibility pass over the shell and Home reports no WCAG 2.2 AA violation at
360 px, 768 px and 1280 px.

## Non-goals

- **No product feature screens.** `features/{auth,settings}` → `13-identity-surface`;
  `{search,sources}` → `14-search-product`; `{ask,answers,coverage,compare}` → `15-answer-product`;
  `monitor` → `16-monitor-alerts`; `records` → `17-records-collab`; `exports` → `19-exports`;
  `{developer,usage}` → `20-developer-platform`; `legal` and `public-site` → `24-launch`
  (breakdown-plan §4). This ticket owns `features/home/**` only.
- **No shared UI components.** Accessible primitives, the ten PRD §31.3 async states and the
  evidence/source panel are `packages/ui` (`RUNT-06`, breakdown-plan **A6**). The shell **consumes**
  them; it does not define a second set. `RUNT-05` and `RUNT-06` are both wave 1, so the shell must
  not block on `RUNT-06` — it imports the package and falls back to unstyled semantic markup where a
  primitive is not yet exported, and that fallback is removed by whichever ticket lands second.
- **No API endpoints.** `GET /v1/system-status` is `RUNT-08`; session/organisation-switch endpoints are
  `IDNT-01` (`13-identity-surface`).
- **No tenant enforcement, no permission decisions, no PII handling.** PRD §45.2 forbids
  security-boundary enforcement in `apps/web`; the server decides (`RUNT-02`).
- **No public marketing/status site.** `apps/web/public-site/**` is `24-launch` (`LNCH-03`,
  breakdown-plan **A8**).
- **No admin or widget app.** `apps/admin/**` is `22-internal-admin`; `apps/widget/**` is
  `20-developer-platform`.
- **No E2E/accessibility cross-boundary suite.** `tests/e2e/**` is `23-assurance` (`ASSR-07`). This
  ticket carries its own co-located checks (breakdown-plan §9 R8).

## File-scope (write-owns)

- `apps/web/index.html`
- `apps/web/vite.config.ts`
- `apps/web/src/app/**`
- `apps/web/src/shell/**`
- `apps/web/src/lib/**`
- `apps/web/src/features/home/**`
- `apps/web/package.json`, `apps/web/tsconfig.json` — **append-only extension** of the empty
  workspace-member skeleton `FND-01` created (breakdown-plan §1.1, "Package manifests").
- `apps/web/test/**` — this ticket's own unit/integration/component tests (breakdown-plan §1.1).
- `docs/adr/NNNN-web-feature-directory-autoload.md` — a **new** file claimed by this ticket under
  breakdown-plan **A9**. Take the lowest unused four-digit number at build time; the slug
  `web-feature-directory-autoload` is reserved to this ticket. It also records the **QR2** answer.

Does not touch:

- `apps/web/src/features/**` other than `home/**` — the eight modules named in Non-goals.
- `apps/web/public-site/**` — `24-launch`.
- `packages/ui/**` — `RUNT-06`. `packages/observability/**` — `RUNT-07`.
- `packages/contracts/**`, `schemas/openapi/**` — `FND-03`/`FND-04`, serial-owned.
- `apps/api/**` — `RUNT-01`/`RUNT-02`/`RUNT-03`/`RUNT-08` and the product route areas.
  `apps/worker/**` — `RUNT-04` and the product handler subtrees.
- `apps/admin/**`, `apps/widget/**` — `22-internal-admin`, `20-developer-platform`.
- `infra/**` — `RUNT-09` (compose) and `18-ops-release`. `tests/**` — `23-assurance`.
- Root manifests, lockfiles, `.github/workflows/**` — `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown-plan §1: phase 1, nothing merged, no
in-flight ticket), so nothing has previously written `apps/web/**` and nothing contends for it. The
`apps/web` tree is split by breakdown-plan §4 between this module (`index.html`, `vite.config.ts`,
`src/{app,shell,lib}`, `src/features/home`) and eight product modules, each owning named sibling
directories under `src/features/`. Sibling tickets in this module are in different trees:
`RUNT-01`/`RUNT-02`/`RUNT-03`/`RUNT-08` are `apps/api`, `RUNT-04` is `apps/worker`,
`RUNT-06`/`RUNT-07` are `packages/`, `RUNT-09` is `infra/compose`. This ticket is in wave 1 with
`RUNT-01`, `RUNT-04`, `RUNT-06` and `RUNT-07`, all five runnable as concurrent lanes (breakdown-plan
§7). `docs/adr/` is shared-additive with per-file ownership (A9) and this slug is unique.

## The A1 web registration contract (normative for eight downstream modules)

**1. Discovery.** Every immediate child directory of `apps/web/src/features/` is a **feature area**.
Discovery uses a Vite glob in `apps/web/src/app/feature-registry.ts` —
`import.meta.glob('../features/*/feature.tsx', { eager: true })` — which is a **pattern, not a list**:
adding a feature directory changes no tracked file.

**2. Required entry file.** A feature area MUST contain `feature.tsx` with a **default export** of
type `FeatureModule`:

```ts
import type { FeatureModule } from '../../app/feature-contract';

const feature: FeatureModule = {
  id: 'search',                                   // must equal the directory name
  routes: [
    { path: '/search', element: <SimpleSearch /> },
    { path: '/documents/:documentId', element: <DocumentScreen /> },
  ],
  nav: {
    slot: 'SEARCH',                               // one of the eleven PRD §31.1 slot ids
    label: 'Search',
    to: '/search',
    visibleWhen: (ctx) => true,                   // feature-supplied predicate; the shell encodes no role rule
  },
  /** Called on organisation switch; must drop every organisation-scoped cache the feature holds. */
  onOrganizationChange: (orgId) => { /* … */ },
};
export default feature;
```

**3. Navigation slots are PRD-fixed.** `apps/web/src/shell/nav-slots.ts` exports the frozen ordered
tuple `['ORG_SWITCHER','HOME','SEARCH','ASK','COVERAGE','COMPARE','RECORDS','MONITOR','DEVELOPER',
'SETTINGS','HELP']` — exactly PRD §31.1 items 1–11 in order. A feature **claims** a slot; it never
inserts one. A `nav.slot` outside the tuple, or a slot claimed twice, fails the build with a named
error. `nav` is optional: a feature may register routes without a nav entry (PRD §31.2 has routes such
as `/answer-jobs/:jobId` that are not nav destinations).

**4. Route collision.** Two features registering the same `path` fail the build naming both features
and the path. Last-wins is forbidden.

**5. Organisation scoping is mandatory for cached state.** Every cache key a feature creates MUST be
produced by the shell's `orgScopedKey(...)` helper from `apps/web/src/lib/org-scope.ts`. The shell
purges every key carrying the previous organisation id on switch and calls each feature's
`onOrganizationChange`. A test helper exported from `apps/web/test/org-scope-conformance.ts` lets a
feature module assert its own compliance (PRD §31.1 "Switching organisation clears unsaved forms and
all organisation-scoped client caches"; `AUTH-002`).

**6. Stability guarantee.** Adding, renaming or removing a feature area produces **zero** diff outside
that area's own directory.

## Deliverables

1. **`apps/web/package.json` / `tsconfig.json` / `vite.config.ts` / `index.html`** — extend the
   `FND-01` skeleton with React + Vite (PRD §18.2) and a workspace reference to `packages/contracts`
   and `packages/ui`. `index.html` carries a single `<title>` that is a **static product name** and is
   never templated with research content (PRD §41.1: "customer research content is not placed in …
   page titles"). No toolchain version is declared here: the **Q12** versions (Node.js `24.18.0`, pnpm
   `11.4.0`) are fixed and `FND-01` holds the pins.
2. **`apps/web/src/app/feature-contract.ts`** — `FeatureModule`, `FeatureRoute`, `NavEntry`,
   `ShellSessionContext` exactly as in the contract section above.
3. **`apps/web/src/app/feature-registry.ts`** — the glob discovery, id/slot/path validation, collision
   detection and a `loadFeatures(modules?)` seam so tests can inject fixture modules.
4. **`apps/web/src/shell/nav-slots.ts` and `src/shell/Navigation.tsx`** — the frozen eleven-slot tuple
   and the navigation renderer. Slots are rendered in PRD §31.1 order; a slot with no claiming feature
   is omitted, not stubbed. Item 9 (`DEVELOPER`) renders only when its feature's `visibleWhen`
   predicate returns true — the predicate is the feature's, not the shell's.
5. **`apps/web/src/shell/OrganizationSwitcher.tsx`** — renders the active organisation always
   (PRD §31.1). On switch it (a) collects dirty-form registrations from
   `apps/web/src/lib/dirty-forms.ts` and requires explicit confirmation before discarding,
   (b) purges every `orgScopedKey` cache entry for the previous organisation, (c) calls every feature's
   `onOrganizationChange`, (d) navigates to `/`. Order (a) → (d) is load-bearing and is asserted.
6. **`apps/web/src/shell/StatusBar.tsx`** — always displays: active organisation; environment label
   `PRODUCTION` or `SANDBOX`; current CorpusRelease date and status; and a degraded-service badge when
   freshness, generation or monitoring is limited (PRD §31.1). Values come from the generated
   `GET /v1/system-status` response type (`packages/contracts`, `FND-04`) via
   `apps/web/src/lib/system-status.ts`, which polls on a configurable interval and **fails visible**:
   an unreachable status endpoint renders an explicit "status unavailable" state, never a silently
   healthy one (PRD §42.1; PRD §41.1 "colour is never the only status signal" — each badge carries
   text plus icon).
7. **`apps/web/src/lib/org-scope.ts`** — `orgScopedKey(organizationId, ...parts): string` and the
   purge routine. Also `apps/web/src/lib/dirty-forms.ts` — `registerDirtyForm(id, isDirty)` /
   `unregisterDirtyForm(id)` used by features to participate in step (a) above.
8. **`apps/web/src/lib/api-client.ts`** — a thin fetch wrapper over the generated `packages/contracts`
   client that attaches credentials, surfaces `request_id` from every response for the PRD §41.1
   "request/job/correction IDs are copyable from errors" requirement, and maps the PRD §16.1 error
   body into a typed client error. It **never** places request or research content into a URL query
   string (PRD §41.1).
9. **`apps/web/src/shell/AppShell.tsx` and `src/app/main.tsx`** — the composition root: shell frame,
   skip-to-content link, a single programmatic `<h1>` per screen enforced by a shell-provided
   `PageHeading` slot, a live region for asynchronous status announcements, and the router built from
   the feature registry (PRD §41.1; PRD §13.1).
10. **`apps/web/src/features/home/**`** — the `/` screen per PRD §31.2: "Resume records, view alerts
    and usage", with the first-use state "Three example anonymous tasks plus source-coverage link". It
    is a **conforming feature area** — it uses the same `feature.tsx` contract as every product module,
    so the contract is exercised by its own first consumer. It renders counts/links only; it owns no
    record, alert or usage logic (those are `17`, `16`, `20`).
11. **`apps/web/src/lib/format.ts`** — the PRD §41.1 date rule: UI renders `3 Aug 2026`; anything sent
    to or received from the API stays ISO 8601. One helper, used everywhere, asserted by a lint-style
    test that no component formats a date inline.
12. **`docs/adr/NNNN-web-feature-directory-autoload.md`** — records breakdown-plan **A1** for the web
    boundary and the **QR2** answer (router and data-fetching libraries) per PRD §45.5. States the
    contract above, the rejected central-manifest alternative (breakdown-plan R1), and the consequence
    that eight product modules depend on its stability. Cross-references `RUNT-01`'s and `RUNT-04`'s
    ADRs.
13. **Conformance harnesses** — `apps/web/test/feature-conformance.tsx` (mount a throw-away feature and
    assert its route and nav slot appear) and `apps/web/test/org-scope-conformance.ts` (assert a
    feature's caches are purged on switch). Both exported for reuse by the eight product modules.

## Acceptance checklist (classified)

- [ ] `[machine]` A feature area consisting of exactly one new directory containing `feature.tsx`
      renders its route and claims its nav slot, with **zero** diff to any tracked file outside that
      directory — `apps/web/test/feature-conformance.tsx` (A1; breakdown-plan §2.1)
- [ ] `[machine]` The nav slot tuple equals the eleven PRD §31.1 items in order; a `nav.slot` outside
      the tuple, a slot claimed twice, or two features with the same route `path` fails the build with
      a named error (PRD §31.1)
- [ ] `[machine]` The shell always renders active organisation, environment (`PRODUCTION`/`SANDBOX`),
      CorpusRelease date and status, and a degraded badge when freshness, generation or monitoring is
      limited — asserted against the committed `system-status` fixtures for healthy and each degraded
      combination (PRD §31.1)
- [ ] `[machine]` An unreachable `/v1/system-status` renders an explicit "status unavailable" state and
      never a healthy-looking one (PRD §42.1)
- [ ] `[machine]` Every status badge carries text **and** an icon/shape — no badge is distinguishable
      by colour alone (PRD §41.1 "colour is never the only status signal")
- [ ] `[machine]` Switching organisation purges every `orgScopedKey` entry for the previous
      organisation and calls every feature's `onOrganizationChange`; a dirty form triggers explicit
      confirmation before discard; the sequence is (dirty-form confirm) → (cache purge) →
      (feature notify) → (navigate) (PRD §31.1; `AUTH-002` client half)
- [ ] `[machine]` No residual data from organisation A is readable after switching to organisation B —
      asserted by seeding a marker into every shell-managed store and scanning after the switch
      (PRD §31.1; `AUTH-002`)
- [ ] `[machine]` No research content reaches a URL query string, the document title or a client
      telemetry payload — asserted by driving the Home screen and a fixture feature with a
      `secret-canary-<uuid>` value and scanning `location.href`, `document.title` and the captured
      telemetry buffer (PRD §41.1)
- [ ] `[machine]` UI dates render as `3 Aug 2026` while API payloads remain ISO 8601, and no component
      formats a date inline (PRD §41.1)
- [ ] `[machine]` Automated accessibility pass (axe or equivalent) over the shell and Home at 360 px,
      768 px and 1280 px reports zero WCAG 2.2 AA violations; complete keyboard operation with visible
      focus and a working skip-to-content link; exactly one programmatic `<h1>` per screen; an
      `aria-live` region announces asynchronous status (PRD §13.1, §41.1)
- [ ] `[machine]` Home renders the PRD §31.2 first-use state — three example anonymous tasks plus a
      source-coverage link — when there are no records, alerts or usage rows (PRD §31.2)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — the shell consumes generated bindings
      and hand-edits none (PRD §20.1)
- [ ] `[machine]` `docs/adr/NNNN-web-feature-directory-autoload.md` exists, records the QR2 answer, and
      is referenced from the PR (PRD §45.5; breakdown-plan A9)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `AUTH-002` and the accessibility impact
- [ ] `[human]` Founder review of the shell against PRD §41.1 at the three widths: legal status,
      citations, primary actions and error recovery are never hidden; destructive/security-sensitive
      actions name exact effect and recovery; request/job ids are copyable (PRD §41.1, §43.4)
- [ ] `[human]` Gate 2 smoke: log in, switch organisation, confirm the badge row updates and no
      previous-organisation content is visible (CLAUDE.md Gate 2; PRD §31.1)
- [ ] `[fixture]` The committed `apps/web/test/fixtures/system-status/*.json` recordings —
      healthy, degraded-freshness, degraded-generation, degraded-monitor and unreachable — each render
      the correct badge row (replay of recorded data; the fixtures are synthetic, PRD §45.1 item 6)
- No PRD §40.8 adapter fixture or PRD §14/§43 evaluation replay applies to this ticket
      (breakdown-plan §1.1)
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)

## Test plan

Reviewer steps, offline, no network:

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/web`. Suites live under `apps/web/test/`; the harness is the component
   test runner `FND-01` established (Vitest + Testing Library or the equivalent it selected), with a
   jsdom/browser-mode environment for the accessibility pass.
3. **`feature-registry.test.tsx`** — inject fixture `FeatureModule`s through `loadFeatures(modules)`;
   assert nav order equals the eleven-slot tuple, that an unknown slot fails, that a duplicate slot
   fails, and that a duplicate path fails, each with both offenders named.
4. **`feature-conformance.test.tsx`** — the exported harness: write a throw-away feature directory into
   a `mkdtemp` root, mount, assert route and nav slot, remove. `git status --porcelain` must be clean
   at suite end.
5. **`status-bar.test.tsx`** — fixtures at `apps/web/test/fixtures/system-status/{healthy,
   degraded-freshness,degraded-generation,degraded-monitor,unreachable}.json`, shaped by the
   generated `GET /v1/system-status` type from `packages/contracts` (`FND-04`). Assert the rendered
   text for each, and assert every badge exposes a non-colour signal.
6. **`org-switch.test.tsx`** — seed a marker under `orgScopedKey('org_a', …)` in every shell-managed
   store, register a dirty form, switch to `org_b`. Assert: confirmation was required; no `org_a` key
   remains; every fixture feature's `onOrganizationChange` was called once; navigation landed on `/`.
   Then scan all stores for the `org_a` marker string and assert absence.
7. **`content-leak.test.tsx`** — drive Home and a fixture feature with `secret-canary-<uuid>`; scan
   `location.href`, `document.title` and a captured telemetry buffer; assert absence.
8. **`a11y.test.tsx`** — axe (or the equivalent selected in `FND-01`) over the shell and Home at
   viewport widths 360, 768 and 1280; assert zero WCAG 2.2 AA violations. Keyboard walk asserts a
   visible focus ring on every interactive element and that the skip link reaches main content.
9. **`format.test.ts`** — `3 Aug 2026` rendering; plus a source scan asserting no component calls a
   date formatter directly.
10. Confirm `docs/adr/NNNN-web-feature-directory-autoload.md` exists, records the QR2 answer, and its
    number does not collide with another ADR on the default branch.
11. The two `[human]` rows are run against a locally started stack (`pnpm stack:up`, `RUNT-09`) and
    recorded in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **The glob-based feature discovery does not survive the production bundle** (code-splitting, SSR or
  the PRD §20.3 immutable artifact requires a static import list) → this is breakdown-plan risk **R1**
  and falsifies **A1** for the web boundary. Write, in order, before touching `apps/web/src/`:
  (a) `docs/adr/NNNN-web-feature-directory-autoload.md` recording the falsification and replacement;
  (b) a "web feature manifest owned by `03-app-runtime`" row in `docs/prd/breakdown-plan.md` §4.2;
  (c) an amendment to `docs/prd/03-app-runtime/README.md` §4 D1. Eight product modules' first screen
  tickets then become `blocked_by` a new manifest-registration ticket here.
- **The router/data-fetching choice (QR2) implies a shared configuration file every feature edits** →
  that reintroduces the contention A1 exists to prevent. Record the alternative in
  `docs/adr/NNNN-web-feature-directory-autoload.md` and, if unavoidable, follow the R1 path above.
- **PRD §31.1's eleven slots do not cover a required surface** (for example `24-launch`'s legal
  surface, PRD §5.14) → the slot list is a **product contract** (PRD §45.5 "Product change … requires
  founder approval and PRD update"). Do not add a twelfth slot. Raise it in
  `docs/prd/03-app-runtime/README.md` §6 with the Founder as owner; in the meantime the surface
  attaches under `HELP` or `SETTINGS` and the deviation is stated in the PR's known-gaps line
  (PRD §45.4).
- **`GET /v1/system-status` (`FND-04`'s OpenAPI) lacks a field PRD §31.1 requires** (CorpusRelease date
  or a degraded-service flag) → that is an **OpenAPI root** change, serial-owned by `FND-04`
  (breakdown-plan §4.1). Raise a `00-foundation` ticket and add the dependency to
  `docs/prd/breakdown-plan.md` §5.4/§6.2. Do not write `schemas/openapi/**` or invent a client-side
  derivation; and notify `RUNT-08`, which implements the endpoint.
- **The shell needs a role rule to hide the Developer slot** → PRD §45.2 and breakdown-plan risk **R5**
  forbid the shell to own it. The predicate stays feature-supplied; if that is impossible, add a
  `blocked_by` edge to `FND-06` in `docs/prd/breakdown-plan.md` §5.4/§6.2 **first** — a plan change,
  not a local import.
- **A `packages/ui` primitive this shell needs does not exist** (`RUNT-06` runs concurrently) → do not
  create a second component set in `apps/web/src/shell/**`; that falsifies **A6**. Use the temporary
  semantic-markup fallback named in Non-goals, and raise the missing primitive against `RUNT-06`
  (a docs change there, then `--sync`).

**3. Escalation.** A1 is a decomposition-critical decision recorded in `docs/prd/breakdown-plan.md`
§2.1 that eight product modules and ten tickets depend on, and "Switching organisation clears unsaved
forms and all organisation-scoped client caches" (PRD §31.1) sits behind `AUTH-002`. If either is
outright falsified, escalate for re-review before any code lands. Never swap the registration approach
silently inside this ticket.
