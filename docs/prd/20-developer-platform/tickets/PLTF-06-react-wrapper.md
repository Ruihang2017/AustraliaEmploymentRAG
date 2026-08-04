---
id: PLTF-06
title: React wrapper
module: 20-developer-platform
lane: 20-developer-platform
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [PLTF-05]
blocks: []
---

# PLTF-06 — React wrapper

Implements PRD §5 (product surfaces, item 11) and PRD §8.10 (API, SDK and widget), carrying
requirement **`DEV-002`** ("Widget uses short-lived, origin-bound sessions from customer backend",
epic `E27-DEVELOPER`).
**No ADR — the decision is already made in PRD §8.10 (*"The widget MUST use a sandboxed iframe with a
JavaScript loader and React wrapper …"*) and PRD §5 item 11 (*"Embeddable JavaScript widget and React
wrapper"*); this is build ticket 6 of 9 against it.**
Parent sub-PRD: [20-developer-platform README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`PLTF-05` — Widget loader and sandboxed iframe](PLTF-05-widget-loader-and-sandboxed-iframe.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
— `PLTF-05` has already frozen the loader's mount API, protocol and security properties; this adapts
them to React idiom without adding a second transport or a second security surface.

## Background + basis

**The surface is mandatory and named.** PRD §5, the MVP surface list:

> 11. Embeddable JavaScript widget and **React wrapper**.

**The requirement clause.** PRD §8.10:

> - The widget MUST use a sandboxed iframe with **a JavaScript loader and React wrapper**, exact
>   origin validation, typed events and no token storage in localStorage.
> - **The disclaimer, citations and product-source indicator MUST NOT be removable by customer
>   theming.**

**Requirement `DEV-002`** (PRD §30.2):

> | DEV-002 | Widget uses short-lived, origin-bound sessions from customer backend | Widget sandbox | widget-session endpoint | App | **Long-lived key never appears in browser storage/network fixture** |

**The wrapper is thin by construction — this is the load-bearing property.** Breakdown plan §5.21
states this ticket's goal as *"Thin wrapper that cannot remove disclaimer or citations."* Everything
security-relevant already exists in `PLTF-05` and must not be re-implemented here:

- the iframe and its exact `sandbox` attribute set (`PLTF-05` deliverable 3);
- the typed `postMessage` protocol and its schemas (`PLTF-05` deliverable 4);
- exact origin validation on all three sides (`PLTF-05` deliverable 5, sub-PRD **D9**);
- the token living in one closure inside the frame, in no storage at all (`PLTF-05` deliverable 6,
  sub-PRD **D10**);
- the closed theme token set and its validator (`PLTF-05` deliverable 8, sub-PRD **D11**);
- `assertProtectedRegionsVisible()` and the refusal-to-render behaviour (`PLTF-05` deliverable 9).

`PLTF-05`'s public mount API, which this wrapper composes verbatim:

```ts
window.Aer.mount({
  container, session, widgetOrigin, features?, theme?, locale?, onEvent?
}): AerWidgetHandle   // { unmount(), refreshSession(), getState() }
```

**Where the React wrapper lives — sub-PRD D22.** PRD §20.1's tree lists `apps/{web,api,worker,admin,widget}`
and does **not** list `apps/widget/react`, so it is not a workspace member: `PLTF-05` created
`apps/widget/package.json` with an `exports` map that already declares `"./react"`, and this ticket
writes only `apps/widget/react/**` plus its own append to that manifest. Making it a separate member
would require editing `pnpm-workspace.yaml`, a `FND-01` serial-owned root manifest (breakdown plan
§4.1).

**Every screen rule still applies.** PRD §13.1: *"Web and **widget** MUST support keyboard
navigation, visible focus, screen-reader labels, contrast and responsive layouts."* PRD §31.3's ten
asynchronous states are rendered inside the frame by `PLTF-05`; this wrapper surfaces them to React
state so a host application can react, without re-rendering them itself. PRD §41.1: *"customer
research content is not placed in URL query strings, analytics, browser error telemetry or page
titles"*.

**The host page is untrusted.** PRD §21: *"Trust customer input, official source content, **customer
host pages** and model output as untrusted."* A React wrapper runs **in** that untrusted page — it is
convenience for the integrator, never a trust boundary. Every guarantee stays inside the frame.

**Accepted caveats carried forward, documented not enforced here:**

- **The wrapper cannot add security and must not appear to.** Anything it validated would be
  validated in the host page's realm and therefore trivially bypassable; the boundary is the frame.
- **The disclaimer *wording* is `24-launch`'s** (`LNCH-01`, `LNCH-02`). This ticket adds no way to
  change or hide it.
- **React is a peer dependency with a permissive range**, so the host application's copy is used and
  this ticket pins no React version. React is **not** one of breakdown plan §8 **Q12**'s pins: Q12 is
  **CONFIRMED** and fixes the *toolchain* — Node.js `24.18.0`, pnpm `11.4.0`, Rust `1.97.1`,
  Python `3.14.6` — while any repo-side React dependency pin lives in `FND-01`'s root
  `package.json` and `pnpm-lock.yaml`. This sub-package builds and tests on Node `24.18.0` /
  pnpm `11.4.0` like the rest of the workspace.

## Goal

Produce `apps/widget/react` — a thin React binding for `PLTF-05`'s loader that exposes an
`<AerWidget />` component and a `useAerWidget()` hook, is SSR-safe, is correct under React strict
mode and concurrent re-renders, cleans up completely on unmount, and **exposes no prop that could
remove or restyle the disclaimer, the citation list or the product-source indicator**. Completion is
mechanically checkable: the wrapper's public prop surface is a declared allowlist with no
`className`, `style`, `part`, `css`, `render`-prop or `children` reaching the protected regions and
no `dangerouslySetInnerHTML` anywhere; a prop-combination fuzz leaves all three regions present after
mount; the wrapper opens no socket, creates no iframe of its own and sends no `postMessage` other
than through `PLTF-05`'s handle; a canary token appears in no React state, prop, ref, DevTools tree,
error boundary payload or storage; and the whole suite runs offline in a DOM test environment.

## Non-goals

- **No second transport, iframe, protocol or origin check** — all `PLTF-05`. A source scan asserts
  this package creates no `iframe` element and calls no `postMessage` directly.
- **No widget-session minting and no credential handling** — `IDNT-07` mints; the host application's
  backend calls it. This package has no prop, option or code path for a service credential
  (PRD §8.10, `DEV-002`).
- **No answer, search, citation or disclaimer rendering** — all inside the frame (`PLTF-05`
  deliverables 7, 9, 10, 12). This wrapper renders a container and nothing else.
- **No theming beyond `PLTF-05`'s closed token set** — sub-PRD **D11**. The `theme` prop is typed as
  `PLTF-05`'s `AerThemeTokens` and passed through unmodified; the wrapper adds no token and no escape
  hatch.
- **No `apps/widget` loader or frame code** — `PLTF-05` (this ticket's `blocked_by`).
- **No web application integration** — `apps/web/src/features/developer/widget/**` is `PLTF-07`, and
  it uses the loader or this wrapper as an ordinary consumer.
- **No SDK dependency** — `packages/sdk-typescript` is `PLTF-02` and is not on this ticket's
  dependency path (breakdown plan §6.2; sub-PRD **D12**).
- **No publishing or release automation** — `18-ops-release`.
- **No cross-boundary suites** — `tests/**` is `23-assurance`; this ticket carries its own co-located
  assertions (breakdown plan §9 **R8**).

## File-scope (write-owns)

- `apps/widget/react/**` — the wrapper source, its build configuration, its tests and its example:
  - `apps/widget/react/src/**` — `AerWidget`, `useAerWidget`, the exported types;
  - `apps/widget/react/test/**` — this ticket's suites and fixtures;
  - `apps/widget/react/README.md`.
- `apps/widget/package.json` — **append-only**: the `"./react"` export's build wiring and the React
  peer dependency. `PLTF-05` created the file and already declared the export key; this ticket is
  `blocked_by PLTF-05`, so the two never write it concurrently (sub-PRD **D22**, breakdown plan §1.1).

Does not touch:

- `apps/widget/src/**`, `apps/widget/test/**`, `apps/widget/examples/**` — `PLTF-05`.
- `packages/sdk-typescript/**` — `PLTF-02`; `sdk/python/**` — `PLTF-03`;
  `apps/api/src/routes/{sandbox,usage,audit-events}/**` — `PLTF-04`, `PLTF-09`;
  `apps/web/src/features/{developer,usage}/**` — `PLTF-01`, `PLTF-07`, `PLTF-08`.
- `packages/**` (including `packages/ui/**` and `packages/contracts/**`), `apps/{web,api,worker,admin}/**`,
  `services/**`, `pipelines/**`, `infra/**`, `tests/**`, `evals/**`, `docs/**`.
- Root manifests, `pnpm-workspace.yaml`, lockfiles, `.github/workflows/**` — `FND-01`, `FND-02`. A
  dependency added here regenerates `pnpm-lock.yaml` as a build artifact; it is never hand-merged
  (breakdown plan §4.1).

**Serial-safety analysis.** This is the **first** decomposition (breakdown plan §1: phase 1,
`append: false`, `usedIds: []`, `existingFiles: ['.gitkeep']`) — nothing is merged and no ticket is
in flight, so no prior ticket has written these paths. `apps/widget/react/**` is carved out of
`PLTF-05`'s scope by breakdown plan §5.21 (*"`apps/widget/**` (except `react/**`)"*), and the two
tickets are ordered by a `blocked_by` edge, so they are **never** concurrent — which is also what
makes the append-only share of `apps/widget/package.json` safe (breakdown plan §1.1: *"within a
module a manifest is append-only shared, and conflicts resolve by re-running the package manager"*).
This ticket runs in wave 2 alongside `PLTF-07` (`apps/web/src/features/developer/{service-accounts,webhooks,widget}/**`)
and `PLTF-08` (`apps/web/src/features/usage/**`) — three disjoint trees, three concurrent lanes
(breakdown plan §7). PRD §44.3's *"independent SDK languages"* rule is the same principle: the widget
subtree, the two SDK subtrees, the route areas and the web feature areas share no file.

## Deliverables

1. **Build wiring, appended to `apps/widget/package.json`** — the `"./react"` export's build entry
   (ESM + type declarations), React and `react-dom` as **peer** dependencies with a permissive range,
   and a `build`/`test` script for the sub-package. No React version is pinned here — React stays
   the host application's, and any repo-side React pin is `FND-01`'s. Breakdown plan §8 **Q12** is
   **CONFIRMED** and covers the toolchain, not React: this sub-package builds and tests on the pinned
   Node `24.18.0` / pnpm `11.4.0`, and adds no toolchain version to the manifest. The append is
   additive only; `git diff` on the manifest shows no removed or modified line.
2. **`<AerWidget />`** — the component. Its props are a **declared allowlist**, and the allowlist is
   the security surface:
   ```ts
   export interface AerWidgetProps {
     readonly session: { token: string } | { tokenProvider: () => Promise<{ token: string }> };
     readonly widgetOrigin: string;
     readonly features?: readonly string[];
     readonly theme?: AerThemeTokens;          // PLTF-05's closed token set, passed through unmodified
     readonly locale?: 'en';
     readonly onEvent?: (event: AerWidgetEvent) => void;   // PLTF-05's typed events
     readonly onError?: (error: AerWidgetError) => void;
     readonly containerProps?: Pick<React.HTMLAttributes<HTMLDivElement>, 'id' | 'aria-label'>;
   }
   ```
   Explicitly **absent, and asserted absent by a type-level and a source test**: `className`,
   `style`, `css`, `part`, `children`, any `render`/`component` prop, any `slot`, any
   `disclaimer`/`citations`/`branding` prop, any `hide*`/`show*` flag, and
   `dangerouslySetInnerHTML` anywhere in the package. `containerProps` is deliberately narrowed to
   `id` and `aria-label` so the host can label the region for its own accessibility tree without
   gaining a styling or content hook.
3. **Mount lifecycle.** On mount the component creates a container `div` (its own ref) and calls
   `window.Aer.mount({ container, ... })`, keeping the returned handle in a ref. It:
   - **is strict-mode safe** — a double mount/unmount in development produces exactly one live
     widget and no orphaned iframe, asserted by test;
   - **does not remount on unrelated re-renders** — only `session`, `widgetOrigin`, `features` and
     `locale` are remount-relevant; `theme` is applied through the handle without a remount; `onEvent`
     and `onError` are held in refs so a new function identity never remounts;
   - **unmounts completely** — `handle.unmount()` in the effect cleanup, plus the container's
     removal, with no listener, timer, port or in-flight request left behind;
   - **refuses to mount twice** into the same container, surfacing `PLTF-05`'s named error through
     `onError`.
4. **`useAerWidget(options)`** — the hook form for hosts that want to control the container element
   themselves. Same options, same lifecycle rules, returning
   `{ containerRef, state, error, refreshSession, unmount }` where `state` is the current PRD §31.3
   state reported by the frame. The component is implemented **on top of** the hook so there is one
   lifecycle implementation, not two.
5. **SSR safety.** The module imports cleanly in a Node environment with no `window`, `document` or
   `navigator` access at import time; mounting happens only inside an effect. A server-render test
   renders the component to a string and asserts no throw and no iframe in the output.
6. **Token handling — the wrapper never holds one longer than the loader does (sub-PRD D10).** The
   `token` (or the `tokenProvider`'s result) is passed straight into `mount()` and is **never**
   stored in React state, never placed on a ref that outlives the mount call, never included in an
   `onEvent`/`onError` payload, never rendered, and never written to any storage. A test drives a
   canary token and inspects React state, refs, the DevTools element tree snapshot, error-boundary
   payloads and all browser storages.
7. **The protected regions cannot be reached (sub-PRD D11, and the reason this ticket exists).** The
   wrapper renders a container element and the iframe lives inside it, in a **different browsing
   context** — so the disclaimer, citation list and product-source indicator are not in the host
   application's DOM at all and no React prop, portal, ref or CSS rule from the host can address
   them. Deliverables 2 and 8 make that structural rather than incidental:
   - no prop can inject CSS or content into the frame;
   - `theme` is validated by `PLTF-05` inside the frame, so an invalid token set is rejected there,
     not trusted here;
   - `assertProtectedRegionsVisible()` runs inside the frame after theming, exactly as for a
     non-React embed.
8. **Prop-combination fuzz.** A property-based test enumerates the declared prop surface — including
   every theme token at its extreme permitted value, every `features` subset, absent and present
   callbacks, and `containerProps` variations — mounts, renders an answer from the recorded fixture,
   and asserts the three protected regions are present and visible in the frame for **every**
   combination, or that the frame refused to render the answer. There is no combination that yields
   an answer without them.
9. **Typed event pass-through.** `onEvent` receives `PLTF-05`'s typed events unchanged; the wrapper
   adds no field, drops no field and never widens the type to `unknown`/`any`. `onError` receives
   typed error codes only, never a message containing research content, a token or a URL with a query
   string (PRD §22, §41.1).
10. **Accessibility.** The container carries the accessible name from `containerProps['aria-label']`
    when supplied, and the iframe's own `title` is set by `PLTF-05`. The wrapper adds no focus trap,
    no `tabindex` manipulation and no ARIA that could contradict the frame's internal semantics
    (PRD §13.1, §41.1).
11. **`apps/widget/react/README.md`** — install, minimal example, the explicit statement that the
    session must be minted by the host's **backend** (PRD §33.5 step 2) and that the wrapper adds no
    security boundary, plus a pointer to `docs/api/guides/widget.md` (`PLTF-01`).
12. **`apps/widget/react/test/**`** — this ticket's suites, reusing `PLTF-05`'s exported test
    fixtures and its recorded transport read-only, so the two never diverge on what a `/v1` response
    looks like.

Ordering constraint: deliverable 4 (the hook) before 2 (the component composes it), and deliverable 2
before 8 (the fuzz enumerates the declared prop surface).

## Acceptance checklist (classified)

- [ ] `[machine]` **Prop allowlist**: the public prop type contains exactly the fields in
      deliverable 2; a type-level test asserts `className`, `style`, `css`, `part`, `children`, any
      `render`/`component` prop and any `hide*`/`show*` flag are **not assignable**; a source scan
      finds no `dangerouslySetInnerHTML` in the package (PRD §8.10; sub-PRD **D11**)
- [ ] `[machine]` **No second security surface**: a source scan proves this package creates no
      `iframe` element, calls no `postMessage`, performs no `fetch`/`XMLHttpRequest`/`WebSocket`, and
      reads no `event.origin` — every one of those lives in `PLTF-05` (PRD §8.10; breakdown plan
      §5.21 *"Thin wrapper"*)
- [ ] `[machine]` **`DEV-002` — no credential path**: no prop, option or code path can carry a service
      credential; a source scan finds no reference to `/v1/widget-sessions`, `service-account`,
      `apiKey` or `api_key` (PRD §8.10 *"long-lived service credentials MUST NOT enter the browser"*;
      `DEV-002`)
- [ ] `[machine]` **`DEV-002` — no token retention**: with a canary token, the string appears in no
      React state, no ref that outlives the mount call, no rendered output, no `onEvent`/`onError`
      payload, no DevTools element-tree snapshot, no error-boundary payload, and none of
      `localStorage`, `sessionStorage`, `document.cookie`, IndexedDB, Cache Storage or `window.name`
      (PRD §8.10 *"no token storage in localStorage"*; §33.5 step 6; sub-PRD **D10**)
- [ ] `[machine]` **Theming cannot remove the safety surface (PRD §8.10)**: the deliverable 8 fuzz
      over the whole declared prop surface — including every theme token at its extreme permitted
      value — always yields either all three protected regions present, sized and contrast-compliant
      inside the frame, or a refusal to render the answer. **No combination produces an answer
      without them** (PRD §8.10 *"The disclaimer, citations and product-source indicator MUST NOT be
      removable by customer theming"*; §11.2; sub-PRD **D11**)
- [ ] `[machine]` `theme` is passed through **unmodified** to `PLTF-05` and is validated inside the
      frame; the wrapper adds, renames and drops no token (sub-PRD **D11**)
- [ ] `[machine]` **Strict-mode safety**: a development double mount/unmount leaves exactly one live
      widget and zero orphaned iframes, ports, listeners or timers
- [ ] `[machine]` **Re-render stability**: changing `onEvent`/`onError` identity or an unrelated
      parent state does **not** remount the widget; changing `theme` applies through the handle
      without a remount; changing `session`, `widgetOrigin`, `features` or `locale` remounts exactly
      once
- [ ] `[machine]` **Unmount completeness**: after React unmount, `handle.unmount()` was called, the
      container is removed, no listener/timer/port remains, and a late fixture event delivered after
      unmount causes no state update and no warning
- [ ] `[machine]` **Double mount refused**: mounting two `<AerWidget />` into one container surfaces
      `PLTF-05`'s named error through `onError` rather than producing two frames
- [ ] `[machine]` **SSR safety**: importing the module in a Node environment with no `window` throws
      nothing; server rendering produces markup with no iframe and no browser API access
- [ ] `[fixture]` **Answer replay through the wrapper**: with `PLTF-05`'s recorded transport, mounting
      and running a Quick Answer reaches `COMPLETED`, `state` transitions through the PRD §31.3
      values, and the frame's disclaimer, citations and product-source indicator are present
      (PRD §31.3; §34.4)
- [ ] `[fixture]` **Failure replay**: a `job.failed` transcript reaches `FAILED` with a title,
      explanation, next action and job id surfaced through `state`, and no provisional section content
      remains rendered (PRD §31.3; §34.4; sub-PRD **D6**)
- [ ] `[machine]` **No research content escapes**: no question, facts, answer text or citation quote
      appears in any prop, any `onEvent`/`onError` payload, the host document title, any URL or any
      console line (PRD §41.1; §22)
- [ ] `[machine]` **PRD §13.1 accessibility**: the container is labellable via `containerProps`, the
      wrapper adds no focus trap or contradictory ARIA, and mounting introduces zero new WCAG 2.2 AA
      violations at 360 px, 768 px and 1280 px in the host document (PRD §13.1; §41.1)
- [ ] `[machine]` **Manifest append is additive**: `git diff apps/widget/package.json` shows added
      lines only (breakdown plan §1.1; sub-PRD **D22**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (standing item, PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — this package declares no `/v1` type
      of its own and hand-edits no generated file (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**`DEV-002`**,
      `E27-DEVELOPER`, proposed `UAT-DEV-04` per sub-PRD **Q-PLTF-1**), user-visible change and
      non-goals, schema/API/event compatibility impact (none — composes `PLTF-05`), **tenant/PII/
      security impact** (no credential path, no token retention, no second security surface, no
      themeable disclaimer), source/licence impact (none), cost/memory/latency impact (wrapper bundle
      size reported against a stated budget; React is a peer dependency), rollback path (revert; the
      `"./react"` export becomes unbuilt while the loader is unaffected), known gaps (none beyond
      `PLTF-05`'s **Q-PLTF-5**)
- [ ] `[human]` **Theming review** (proposed `UAT-DEV-04`): a founder applies the most aggressive
      legal theme through the React props and confirms the disclaimer, citations and product-source
      indicator remain legible, or that the widget refuses to render (PRD §8.10; §43.4). Runs at
      Gate 2 — **not required to merge**
- No `[fixture]` criteria beyond the two replays above — this package replays only `PLTF-05`'s
      recorded `/v1` responses; breakdown plan §1.1 maps `[fixture]` to recorded-data replay, which is
      exactly what those two rows are
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)
- No origin-validation criteria **in this package** — origin validation is `PLTF-05` deliverable 5 by
      design, and the acceptance above asserts this package contains none of it (PRD §8.10;
      sub-PRD **D9**)
- No SDK-telemetry criteria — this package emits no telemetry and constructs no transport
      (sub-PRD **D7**)

## Test plan

Reviewer steps, **all offline**: no network, no live API, no real third-party site. The DOM
environment and the recorded `/v1` transport are `PLTF-05`'s, imported read-only from
`apps/widget/test/fixtures/**` so the two tickets cannot diverge on what a response looks like.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @<scope>/widget` (this sub-package's suite runs with the widget package).
   Suites live under `apps/widget/react/test/`.
3. **`props.test-d.ts`** (type-level) — assert the exact prop surface; assert `className`, `style`,
   `css`, `part`, `children`, a `render` prop and a `hideDisclaimer` flag are each **not assignable**.
   Confirm the test fails when one is deliberately added on a scratch branch — a type test that
   cannot fail proves nothing.
4. **`no-second-surface.test.ts`** — source scan for `createElement('iframe')`, `postMessage`,
   `fetch`, `XMLHttpRequest`, `WebSocket`, `event.origin` and `dangerouslySetInnerHTML`; assert none.
5. **`no-credential.test.ts`** — source scan for `widget-sessions`, `service-account`, `apiKey`,
   `api_key`; assert none.
6. **`token-retention.test.ts`** — drive a canary token; after mount and after an answer completes,
   inspect React state and refs (via the test renderer), the rendered tree snapshot, every
   `onEvent`/`onError` payload, an error-boundary capture, and all browser storages; assert the canary
   appears nowhere. Confirm the test inspects **all** of those, not only storage.
7. **`lifecycle.test.ts`** — strict-mode double mount; re-render with a new `onEvent` identity
   (assert no remount); `theme` change (assert applied without remount); `session` change (assert
   exactly one remount); unmount (assert `handle.unmount()` called, container removed, no listener or
   timer left); a late event after unmount (assert no state update and no warning); double mount into
   one container (assert the named error through `onError`).
8. **`ssr.test.ts`** — import in a Node environment with `window` undefined; render to string; assert
   no throw and no iframe.
9. **`protected-regions.fuzz.test.ts`** — the deliverable 8 property test. For each generated prop
   combination: mount, render the recorded answer, then query the frame for the disclaimer, citation
   list and product-source indicator and assert presence, non-zero size and contrast — or assert the
   frame refused to render the answer. Confirm the generator actually reaches the extreme theme
   values (print the sampled space) rather than exercising defaults.
10. **`replay.test.ts`** — the completion and failure transcripts; assert the PRD §31.3 state
    sequence surfaces through `state` and that failure leaves no provisional section rendered.
11. **`a11y.test.ts`** — mount into a host document; assert zero new WCAG 2.2 AA violations at the
    three widths; assert the container is labellable and that no focus trap was added.
12. **`manifest.test.ts` / manual** — `git diff apps/widget/package.json` shows additions only.
13. **Bundle budget** — report the wrapper's bundle size against the stated budget; React must be
    external.
14. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether a
    parent re-render during an in-flight `tokenProvider` call can mount twice or leak a handle;
    whether the effect cleanup can run before `mount()` resolves and orphan an iframe; whether
    `containerProps` can be widened by spread to reintroduce `className`/`style`; whether an
    `onError` payload can carry a token, a URL with a query string or research content; whether the
    handle can escape through a ref the host can read; whether React 18 concurrent rendering can
    invoke the mount effect twice for one logical mount.
15. The `[human]` row runs at Gate 2 against a locally started stack (`pnpm stack:up`, `RUNT-09`) and
    is recorded in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies anything in this ticket, update **this ticket file**
first (version note + changelog line in the PR), re-publish with
`.claude/scripts/publish-tickets.mjs --sync`, then change code. Silent divergence is an incomplete
ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`PLTF-05`'s mount API cannot express something the React lifecycle needs** (for example applying a
  theme without a remount, or an abortable `tokenProvider`). → Amend **`PLTF-05`'s deliverable 2** and
  this ticket's deliverable 3 in **one** docs PR and `--sync` both. **Never write
  `apps/widget/src/**` from here**, and never reach into the loader's internals.
- **An integrator asks for `className`, `style` or a custom disclaimer slot.** → PRD §8.10's
  non-removability clause is unconditional and breakdown plan §5.21 states this ticket's goal as a
  *"Thin wrapper that cannot remove disclaimer or citations"*. Record the request in
  `docs/prd/20-developer-platform/README.md` **D11** and escalate as a **product change**
  (PRD §45.5) before widening the prop surface. Do not add "just `className` on the container" — a
  container class can position the iframe off-screen.
- **The wrapper is tempted to validate the origin, the theme or the session** to give a better error
  message. → It runs in the untrusted host page (PRD §21), so anything it validates is advisory at
  best and misleading at worst. Surface `PLTF-05`'s typed error instead. If the error vocabulary is
  insufficient, amend `PLTF-05`'s deliverable 4 in a docs PR.
- **React's concurrent/strict-mode semantics make a single-mount guarantee impossible with the
  current handle API.** → That is a real API problem, not a test problem. Amend `PLTF-05`'s
  deliverable 2 (for example to make `mount()` idempotent per container) and this ticket's
  deliverable 3 together in one docs PR and `--sync` both. Never ship a wrapper that can orphan an
  iframe.
- **A separate workspace member would be easier than the `"./react"` export.** → Sub-PRD **D22**:
  that would require editing `pnpm-workspace.yaml`, a `FND-01` serial-owned root manifest. Raise it in
  `docs/prd/20-developer-platform/README.md` and `docs/prd/breakdown-plan.md` §4.1 **first**; never
  edit the root workspace file from here.
- **React must be a direct rather than a peer dependency.** → Record the reason in this ticket's
  deliverable 1 and in `docs/prd/20-developer-platform/README.md` before changing it; bundling a
  second React into a host application is a customer-visible defect, not an implementation detail.

**3. Escalation.** *"a JavaScript loader and React wrapper"* and *"The disclaimer, citations and
product-source indicator MUST NOT be removable by customer theming"* (both PRD §8.10) are release
requirements with MUST force, and PRD §5 item 11 makes the wrapper an MVP surface. If a thin wrapper
genuinely cannot be built over `PLTF-05`'s handle — so that the only way to ship React support is to
re-implement the frame, the transport or the origin check in this package — that overturns the
decomposition recorded in breakdown plan §5.21 and sub-PRD **D9**/**D11**. Stop, raise an ADR under
`docs/adr/` (breakdown plan **A9**), write back to `docs/prd/breakdown-plan.md` §5.21 and
`docs/prd/20-developer-platform/README.md`, and escalate to the human. Never duplicate a security
control into the host page's realm.
