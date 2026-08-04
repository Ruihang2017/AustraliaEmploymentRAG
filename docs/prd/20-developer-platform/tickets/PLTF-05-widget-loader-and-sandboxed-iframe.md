---
id: PLTF-05
title: Widget loader and sandboxed iframe
module: 20-developer-platform
lane: 20-developer-platform
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [IDNT-07, FIND-01, ASK-01]
blocks: [PLTF-06, LNCH-02]
---

# PLTF-05 — Widget loader and sandboxed iframe

Implements PRD §8.10 (API, SDK and widget), §33.5 (widget request) and §38.4 (service account and
widget tokens), carrying requirement **`DEV-002`** ("Widget uses short-lived, origin-bound sessions
from customer backend", epic `E27-DEVELOPER`).
**No ADR — the decision is already made in PRD §8.10 (*"a sandboxed iframe with a JavaScript loader
and React wrapper, exact origin validation, typed events and no token storage in localStorage"*),
§33.5 and §38.4; this is build ticket 5 of 9 against it.**
Parent sub-PRD: [20-developer-platform README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`IDNT-07` — Widget-session creation endpoint](../../13-identity-surface/tickets/IDNT-07-widget-session-creation-endpoint.md);
`FIND-01` — `POST /v1/search` route and response contract
([`14-search-product`](../../14-search-product/README.md)); `ASK-01` — Answer job admission and
transaction boundary ([`15-answer-product`](../../15-answer-product/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
— PRD §8.10 and §33.5 already fix the isolation model, the session model and the event model, and
`IDNT-07`/`AUTC-05` already own minting and verification; this builds the browser half against them,
it does not decide a security architecture.

## Background + basis

**The widget clauses of PRD §8.10, quoted in full:**

> - **The browser widget MUST use a short-lived organisation-scoped widget session created by the
>   customer's backend; long-lived service credentials MUST NOT enter the browser.**
> - **The widget MUST use a sandboxed iframe with a JavaScript loader and React wrapper, exact origin
>   validation, typed events and no token storage in localStorage.**
> - **The disclaimer, citations and product-source indicator MUST NOT be removable by customer
>   theming.**

**The flow is enumerated.** PRD §33.5, in full:

> 1. Customer backend authenticates its own user.
> 2. Backend calls the platform using a service credential to create a widget session containing
>    organisation, pseudonymous external user ID, exact origins, features, expiry and credit ceiling.
> 3. **Browser loads the versioned JavaScript loader and sandboxed iframe.**
> 4. **Iframe validates parent origin and exchanges only typed events.**
> 5. **Widget calls the same `/v1` admission, PII, evidence and quota pipeline as Web/API; no bypass
>    exists.**
> 6. **Session expires quickly and is never stored in localStorage.**

Steps 1–2 are `IDNT-07` and `AUTC-05`. **Steps 3, 4 and 6 are this ticket**, and step 5 is this
ticket's obligation to *not* create a bypass.

**The token contract.** PRD §38.4:

> Widget sessions are signed, **opaque-to-client** authorisation tokens with a **maximum 15-minute
> lifetime**. Claims bind organisation, service account, pseudonymous external user, allowed origins,
> allowed features, environment, credit ceiling and unique token ID. **The token cannot create
> service accounts, read arbitrary Research Records, access settings/admin or exceed its origin.**

`AUTC-05` deliverable 4 gives the server-side verifier and its reason vocabulary — `MALFORMED`,
`BAD_SIGNATURE`, `EXPIRED`, `REVOKED`, `ORIGIN_NOT_ALLOWED`, `FEATURE_NOT_ALLOWED` — called by
`RUNT-02`'s `authenticate` stage on every request. The token is **opaque to the client**
(`02-auth-core` **D8**), so this ticket never parses it; the session's `allowed_origins`,
`allowed_features`, `environment` and `expires_at` are read from `IDNT-07`'s **mint response body**
(its deliverable 2), which the customer's backend forwards to the page.

**The requirement and its acceptance evidence.** PRD §30.2:

> | DEV-002 | Widget uses short-lived, origin-bound sessions from customer backend | Widget sandbox | widget-session endpoint | App | **Long-lived key never appears in browser storage/network fixture** |

**The host page is untrusted.** PRD §21, opening sentence:

> Trust customer input, official source content, **customer host pages** and model output as
> untrusted.

and PRD §21.1's control list includes *"Secure HttpOnly SameSite cookies, CSRF, strict CSP,
encoding/sanitisation and **exact widget origins**"* and *"Output schema, citations, URLs and
Markdown/HTML validated/sanitised; suggestions do not execute automatically"*.

**Every screen rule applies to the widget too.** PRD §13.1: *"Web and **widget** MUST support
keyboard navigation, visible focus, screen-reader labels, contrast and responsive layouts."*
PRD §11.2: the product *"MUST include clear disclaimers in the Web app, **widget** and exports"*.
PRD §31.3 fixes the ten mandatory asynchronous states — `IDLE`, `VALIDATING`, `QUEUED`, `RUNNING`,
`WAITING_FOR_CLARIFICATION`, `CANCELLING`, `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED` — each
needing *"a visible title, plain-language explanation, allowed next action and request/job ID. A
spinner without state or recovery guidance is not acceptable."* PRD §41.1 adds that *"customer
research content is not placed in URL query strings, analytics, browser error telemetry or page
titles"*.

**What the widget calls.** `FIND-01` publishes `POST /v1/search` (PRD §34.2's payload; search is
read-only and consumes no generation credit, PRD §16.2). `ASK-01` publishes `POST /v1/answers`,
`GET /v1/answer-jobs/{jobId}`, `GET /v1/answer-jobs/{jobId}/events` (served by `RUNT-03`'s SSE
handler) and `POST /v1/answer-jobs/{jobId}/cancel`. PRD §34.4 fixes the nine allowed SSE event types
and the rule that *"`answer.section` is provisional UI content until `job.completed`; clients MUST
remove it on failure and MUST not represent it as a validated answer"*, and PRD §16.2 adds that SSE
events *"MUST NOT contain hidden reasoning or raw provider payloads"*.

**Dependencies are constrained by the plan, not by taste — sub-PRD D12.** Breakdown plan §6.2 gives
this ticket the blockers `IDNT-07`, `FIND-01` and `ASK-01`. Neither `RUNT-06` (`packages/ui`) nor
`PLTF-02` (`packages/sdk-typescript`) is on that path, and adding an edge is a plan change
(breakdown plan §9 **R6**). So `apps/widget` depends on `packages/contracts` only — available
transitively through `FND-04` — and implements the PRD §31.3 states in its own minimal renderer. The
second reason is size: this bundle is loaded into a third party's page.

**Accepted caveats carried forward, documented not enforced here:**

- **The widget mints nothing.** `POST /v1/widget-sessions` is machine-only (`IDNT-07` deliverable 1:
  *"a cookie session and a widget token are both `401 AUTHENTICATION_REQUIRED`"*). The token reaches
  the page from the customer's own backend.
- **`Content-Security-Policy: frame-ancestors` at the edge is `18-ops-release`'s** —
  sub-PRD **Q-PLTF-5**. This ticket documents the required header and ships the three exact-origin
  checks that PRD §8.10/§21.1 actually mandate.
- **The disclaimer *wording* is `24-launch`'s** (`LNCH-01`, `LNCH-02`; `LNCH-02` is `blocked_by` this
  ticket). This ticket owns the **non-removability mechanism** and renders whatever text the
  configured legal strings supply, with a committed placeholder until `LNCH-01` lands.
- **The React wrapper is `PLTF-06`** (`apps/widget/react/**`), which is `blocked_by` this ticket.
- **The `[human]` `DEV-002` rehearsal in `IDNT-07`** explicitly waits for this ticket
  (`IDNT-07` acceptance: *"The browser half needs `PLTF-05`, so run after it merges"*).

## Goal

Produce `apps/widget` — a versioned JavaScript loader plus a sandboxed iframe application that
embeds Search and Quick Answer into an untrusted customer page, authenticating solely with a
short-lived origin-bound widget session minted by the customer's backend. Completion is mechanically
checkable: the iframe carries the declared `sandbox` attribute set with the dangerous tokens absent;
every `postMessage` uses an exact `targetOrigin` and every inbound message is origin-, source- and
schema-checked; a near-miss origin (prefix, suffix, wildcard, `null`, differing port or scheme) is
refused and the widget renders nothing; the session token appears in no storage, no URL, no DOM
attribute and no `postMessage` payload; the disclaimer, citation list and product-source indicator
survive every theme in the adversarial fuzz set or the widget refuses to render the answer; and the
whole suite runs offline against recorded responses in a DOM test environment.

## Non-goals

- **No widget-session minting, token format, signing, claim validation or verification** —
  `AUTC-05` (`packages/auth/src/widget/**`) and `IDNT-07` (`apps/api/src/routes/widget-sessions/**`).
  This ticket never parses a token (`02-auth-core` **D8**: the encoding is internal) and never sends a
  service credential anywhere.
- **No React wrapper** — `PLTF-06` (`apps/widget/react/**`), `blocked_by` this ticket. This ticket
  declares the `"./react"` export in `apps/widget/package.json` so `PLTF-06` adds only its own
  subtree (sub-PRD **D22**).
- **No `/v1` operation definitions** — `FIND-01`, `ASK-01`, `RUNT-03`, `FND-04`. The widget is a
  client; it defines no endpoint and adds no bypass (PRD §33.5 step 5).
- **No SDK dependency** — sub-PRD **D12**: `packages/sdk-typescript` is not on this ticket's
  dependency path; adding that edge is a plan change.
- **No `packages/ui` dependency** — `RUNT-06`, breakdown plan **A6**; same reason (sub-PRD **D12**).
- **No disclaimer, Terms, Privacy or AUP wording** — `24-launch` (`LNCH-01`, `LNCH-02`). This ticket
  owns the mechanism that makes them non-removable (PRD §8.10).
- **No CDN, DNS, TLS or edge header configuration** — `18-ops-release` (`RLSE-03`,
  `infra/cloudflare/**`). Sub-PRD **Q-PLTF-5**.
- **No developer widget screen** — `/developer/widget` is `PLTF-07`.
- **No PII detection, evidence assembly, citation validation or budget arithmetic** —
  `12-evidence-safety`, `15-answer-product`, `FND-09`. The widget calls the same pipeline; it
  duplicates none of it (PRD §33.5 step 5, §45.2).
- **No analytics or product telemetry transport.** Sub-PRD **D7**'s allowlist applies to whatever the
  widget emits, and the default is that it emits nothing anywhere (PRD §41.1, §22).
- **No cross-boundary suites** — `tests/**` is `23-assurance`; this ticket carries its own co-located
  assertions (breakdown plan §9 **R8**).

## File-scope (write-owns)

- `apps/widget/**` **except** `apps/widget/react/**`, specifically:
  - `apps/widget/package.json`, `tsconfig.json` and build configuration (module-owned member
    manifest, breakdown plan §1.1; created empty by `FND-01` for every PRD §20.1 member and extended
    here). The `exports` map declares `"./react"` up front for `PLTF-06` (sub-PRD **D22**).
  - `apps/widget/src/loader/**` — the versioned host-page loader.
  - `apps/widget/src/frame/**` — the iframe application (bootstrap, transport, screens, renderer).
  - `apps/widget/src/protocol/**` — the typed `postMessage` envelope, its schemas and its version.
  - `apps/widget/src/theme/**` — the closed theme token set and its validator.
  - `apps/widget/src/legal/**` — the protected-region components and the
    `assertProtectedRegionsVisible()` invariant.
  - `apps/widget/test/**` and `apps/widget/test/fixtures/**`.
  - `apps/widget/examples/**` — a static host page used only by tests.
  - `apps/widget/README.md`.

Does not touch:

- `apps/widget/react/**` — `PLTF-06` (`blocked_by` this ticket; never concurrent).
- `packages/auth/**` — `02-auth-core`; `apps/api/src/routes/widget-sessions/**` — `IDNT-07`;
  `apps/api/src/routes/{search,answers,answer-jobs}/**` — `FIND-01`, `ASK-01`;
  `apps/api/src/{sse,plugins,middleware,bootstrap,errors}/**` — `RUNT-01`…`RUNT-03`.
- `packages/contracts/**`, `schemas/openapi/**`, `schemas/events/**` — `00-foundation`, serial-owned;
  read-only from here.
- `packages/ui/**` — `RUNT-06`; `packages/sdk-typescript/**` — `PLTF-02`; `sdk/python/**` —
  `PLTF-03`; `apps/web/**` — `RUNT-05` and the feature-owning modules including this module's
  `PLTF-01`/`PLTF-07`/`PLTF-08`; `apps/api/src/routes/{sandbox,usage,audit-events}/**` — `PLTF-04`,
  `PLTF-09`.
- `apps/worker/**`, `apps/admin/**`, `services/**`, `pipelines/**`, `infra/**` (including
  `infra/cloudflare/**` — `RLSE-03`), `tests/**`, `evals/**`.
- `docs/api/**` — `PLTF-01`; `docs/policies/**` — `LNCH-01`; root manifests, lockfiles,
  `.github/workflows/**` — `FND-01`, `FND-02`.

**Serial-safety analysis.** This is the **first** decomposition (breakdown plan §1: phase 1,
`append: false`, `usedIds: []`, `existingFiles: ['.gitkeep']`) — nothing is merged, nothing is in
flight, so no prior ticket has written these paths and none contends for them. `apps/widget/**` is
written by no ticket outside this module (breakdown plan §4). PRD §44.3 names *"independent SDK
languages"* as a canonical safe parallel work unit, and this module's five subtrees realise the same
property: this ticket writes only `apps/widget/**` minus `react/**`; `PLTF-02` only
`packages/sdk-typescript/**`; `PLTF-03` only `sdk/python/**`; `PLTF-04`/`PLTF-09` only
`apps/api/src/routes/{sandbox,usage,audit-events}/**`; `PLTF-01`/`PLTF-07`/`PLTF-08` only
`apps/web/src/features/{developer,usage}/**`. No two share a file, so all six wave-1 tickets run as
concurrent lanes (breakdown plan §7: 6 useful lanes). The single intra-subtree split —
`apps/widget/react/**` — is ordered by a `blocked_by` edge (`PLTF-06` waits on this ticket), and
`apps/widget/package.json` is module-owned and append-only shared between exactly those two tickets
(sub-PRD **D22**, breakdown plan §1.1).

## Deliverables

1. **Package skeleton** — `apps/widget/package.json` extended from `FND-01`'s empty member skeleton:
   a workspace dependency on `packages/contracts` **only** (sub-PRD **D12**); two build outputs, the
   loader (an IIFE for a `<script>` tag) and the frame document (an ES module plus its HTML); an
   `exports` map that already declares `"./react"` for `PLTF-06`; `build`, `test`, `lint`,
   `typecheck` scripts. The build toolchain is settled, not open: breakdown plan §8 **Q12** is
   **CONFIRMED** and `FND-01` owns the pins — **Node.js `24.18.0`** and **pnpm `11.4.0`** — so both
   bundles are built and tested on exactly those versions, the same ones CI uses, and no newer patch
   or major is introduced here. This manifest re-pins nothing. The Node pin governs the **build**; it
   is not a statement about the browsers the emitted loader and frame document run in.
2. **Versioned loader** (PRD §33.5 step 3 *"the versioned JavaScript loader"*) — built to a
   version-stamped path (`loader/v<major>.<minor>.<patch>/loader.js`) with the version embedded in
   the artifact. Public API on the host page:
   ```ts
   window.Aer.mount({
     container: HTMLElement,
     session: { token: string } | { tokenProvider: () => Promise<{ token: string }> },
     widgetOrigin: string,        // exact origin the iframe is served from
     features?: string[],         // subset of the session's allowed_features
     theme?: AerThemeTokens,      // closed token set — deliverable 8
     locale?: 'en',
     onEvent?: (e: AerWidgetEvent) => void,   // typed, never carries the token
   }): AerWidgetHandle           // { unmount(), refreshSession(), getState() }
   ```
   Rules, all load-bearing:
   - `mount()` creates the iframe, transfers the token **once** over the deliverable 4 channel, and
     then **drops its own reference** (`token` is not retained on the handle, the options object is
     not stored, and a `WeakRef`/closure audit test asserts it);
   - `tokenProvider` is the recommended shape because it lets the page refresh a ≤15-minute session
     without a reload and without holding a token between refreshes (PRD §38.4);
   - `unmount()` removes the iframe, closes the message port, aborts in-flight requests and clears
     the handle's state;
   - mounting twice into the same container is refused with a named error rather than producing two
     frames;
   - the loader **never** performs a `/v1` request itself — all network activity happens inside the
     frame, so the host page's origin never appears on an API call.
3. **The sandboxed iframe** (PRD §8.10 *"a sandboxed iframe"*) — created by the loader with, exactly:
   - `sandbox="allow-scripts allow-same-origin allow-forms"` and **nothing else**. `allow-same-origin`
     is required so the frame has its own (platform) origin for `fetch` and so the browser sends a
     real `Origin` header rather than `null` — which is what makes `AUTC-05`'s server-side
     `ORIGIN_NOT_ALLOWED` check meaningful. It does **not** weaken isolation here because the frame's
     `src` is the *platform* origin, never the embedder's. The absent tokens are asserted by test:
     `allow-top-navigation`, `allow-top-navigation-by-user-activation`, `allow-popups`,
     `allow-popups-to-escape-sandbox`, `allow-modals`, `allow-downloads`, `allow-pointer-lock`,
     `allow-presentation`, `allow-orientation-lock`, `allow-storage-access-by-user-activation`;
   - `referrerpolicy="strict-origin"`, `allow=""` (empty Permissions Policy), `loading="lazy"`,
     `title` set to an accessible static name, and `credentialless` where the browser supports it;
   - `src` = `${widgetOrigin}/frame/v<version>/index.html` with **no query string and no fragment** —
     no token, no question, no organisation id, nothing (PRD §41.1; PRD §8.10);
   - a loader/frame **version handshake**: the frame reports its build version in its `ready` event
     and the loader refuses to proceed on a mismatch, with a named error.
4. **Typed `postMessage` protocol** (PRD §33.5 step 4 *"exchanges only typed events"*),
   `apps/widget/src/protocol/**`:
   - envelope `{ protocol: 'aer.widget', protocol_version: '1', direction: 'host→frame' | 'frame→host',
     type, id, payload }`, JSON-Schema-validated in **both** directions before any handler runs;
   - the initial handshake establishes a `MessageChannel`; the token is transferred on the
     **dedicated port**, once, in a `session.provide` message, and never again;
   - **host→frame** types: `session.provide`, `session.refresh`, `theme.set`, `feature.invoke`,
     `unmount`;
   - **frame→host** types: `ready`, `state.changed` (one of the ten PRD §31.3 states),
     `size.changed`, `error` (typed code only), `session.expiring`, `session.expired`;
   - **no frame→host message ever carries the token, a question, facts, an answer body, a citation
     quote or any research content** — a schema-level property-name denylist mirroring `FND-05`'s
     approach (`question`, `facts`, `answer`, `short_answer`, `claim_text`, `quote`, `snippet`,
     `excerpt`, `content`, `prompt`, `reasoning`, `provider_payload`, `text`, `token`) plus a runtime
     assertion;
   - an unknown `type`, a wrong `protocol`, a wrong `protocol_version` or a schema-invalid payload is
     dropped silently on the frame side and reported as a typed `error` on the host side — never
     executed, never echoed.
5. **Exact origin validation, three-sided (sub-PRD D9).**
   - **Loader → frame:** every `postMessage` passes `widgetOrigin` as `targetOrigin`. A source scan
     asserts the literal `'*'` never appears as a `targetOrigin` argument anywhere in
     `apps/widget/src/**`.
   - **Frame → host:** the frame computes the set of acceptable parent origins from the session's
     `allowed_origins` (read from the mint-response fields the page forwards) and accepts a message
     only when `event.origin` **string-equals** a member of that set **and** `event.source` is the
     expected `window`. Comparison is on the WHATWG-normalised origin (scheme + host + port), byte
     equal. A source scan asserts no `startsWith`, `endsWith`, `includes`, `RegExp`, `indexOf` or
     wildcard character is applied to an origin value.
   - **Frame → server:** every `/v1` request is a normal cross-origin `fetch` from the frame's own
     origin, so the browser sets `Origin`; `AUTC-05.verifyWidgetSession` refuses
     `ORIGIN_NOT_ALLOWED` server-side. The frame **never** attempts to set or spoof the `Origin`
     header.
   - **Refusal is total:** when the parent origin is not allowed, the frame renders an explicit
     "this embed is not authorised for this site" state, makes **no** `/v1` request, and emits a
     typed `error`. It never partially renders.
6. **Token handling — no storage anywhere (sub-PRD D10).** The token lives in exactly one closure
   variable inside the frame. Structurally forbidden and asserted by both a source scan and a runtime
   test: `localStorage`, `sessionStorage`, `document.cookie`, `indexedDB`, `caches`, `window.name`,
   the iframe URL, any DOM attribute or text node, any `postMessage` payload, any log line, any
   telemetry record and any thrown error message. On `session.expired` the variable is cleared and
   the frame renders the `EXPIRED` state with a "your host application must start a new session"
   explanation (PRD §31.3, §38.4).
7. **`/v1` client inside the frame.** Built on `packages/contracts`' generated types (sub-PRD **D1**
   applies to type provenance even though this is not the SDK): `POST /v1/search` (`FIND-01`),
   `POST /v1/answers`, `GET /v1/answer-jobs/{jobId}`, `GET /v1/answer-jobs/{jobId}/events` and
   `POST /v1/answer-jobs/{jobId}/cancel` (`ASK-01`, `RUNT-03`). Rules:
   - `Authorization` carries the widget session; **no cookie is ever sent** (`credentials: 'omit'`),
     per PRD §38.2;
   - `Idempotency-Key` is generated for `POST /v1/answers` and **re-sent unchanged on retry**
     (PRD §34.1; `ANS-003`);
   - SSE consumption follows PRD §34.4: the nine allowed types, `Last-Event-ID` on reconnect, no
     duplicate section or completion after a resume, and `answer.section` treated as **provisional**
     and discarded on `job.failed` (sub-PRD **D6**);
   - only the session's `allowed_features` are reachable: a `feature.invoke` for a feature outside
     that set is refused client-side **and** would be refused server-side by
     `AUTC-05`'s `FEATURE_NOT_ALLOWED` — the client check is convenience, the server check is the
     boundary;
   - no request is ever made from the loader (deliverable 2), so the host page never originates an
     API call.
8. **Closed theme token set (sub-PRD D11), `apps/widget/src/theme/**`.** `AerThemeTokens` is a fixed
   allowlist of named tokens — colour (surface, on-surface, accent, on-accent, border), radius, font
   family, font-size scale, spacing scale. Every value is schema-validated: colours must match a
   strict colour grammar; font family is a bounded list of generic families plus a quoted name with
   no `;`; numbers are bounded ranges. Values containing `url(`, `expression(`, `@import`, `;`, `}`,
   `<`, `/*` or a newline are rejected. There is **no** `customCss`, no stylesheet URL, no
   `className`, no `part`, no `style` prop and no `dangerouslySetInnerHTML` anywhere in the package —
   a source scan asserts each.
9. **Protected regions and their invariant (sub-PRD D11), `apps/widget/src/legal/**`.** The
   disclaimer, the citation list and the product-source indicator are rendered by dedicated
   components that read their content from configuration (placeholder text until `LNCH-01`, which
   `LNCH-02` replaces) and are **not** parameterised by theme tokens that could hide them.
   `assertProtectedRegionsVisible()` runs after theming is applied and **before** an answer becomes
   interactive, and checks, from the live DOM, for each of the three regions:
   - the node exists and is attached;
   - its bounding box has non-zero width and height;
   - computed `display` is not `none`, `visibility` is not `hidden`/`collapse`, `opacity` ≥ a
     configured floor, `clip-path` is not degenerate, `font-size` ≥ a configured floor;
   - the computed foreground/background contrast meets the PRD §13.1/§41.1 minimum;
   - the citation list is present whenever the answer carries citations.
   **On failure the widget refuses to render the answer**, shows a named error state and emits a
   typed `error` event. There is no "warn and continue" path.
10. **The ten PRD §31.3 asynchronous states, implemented in the frame** (sub-PRD **D12**): `IDLE`,
    `VALIDATING`, `QUEUED`, `RUNNING`, `WAITING_FOR_CLARIFICATION`, `CANCELLING`, `COMPLETED`,
    `FAILED`, `CANCELLED`, `EXPIRED`. Each renders a visible title, a plain-language explanation, the
    allowed next action and the request/job id, with an ARIA live region for status changes. A
    spinner alone is a defect (PRD §31.3).
11. **Accessibility and responsiveness** (PRD §13.1, §41.1): complete keyboard operation with visible
    focus and logical order inside the frame; one programmatic heading; labelled fields; error
    summaries; colour never the only status signal; legal status, jurisdiction and freshness rendered
    as text plus badge; dates displayed as `3 Aug 2026` while payloads stay ISO; usable at 360 px,
    768 px and 1280 px, with `size.changed` letting the host size the iframe without the frame
    reading the host's layout.
12. **Sanitisation of every rendered value** (PRD §21.1, §37.5): answer text is rendered through an
    allowlisted Markdown subset with HTML sanitised; every link is constructed from system-provided
    fields and restricted to `https:` with a `rel="noopener noreferrer"`; a link whose URL fails
    validation is rendered as inert text. No value from a `/v1` response is ever inserted as HTML,
    and no returned string can trigger navigation, a download or a `postMessage`.
13. **Widget telemetry, if any, follows sub-PRD D7** — off by default, no transport, closed field
    allowlist, `assertTelemetrySafe` on every record. The widget's default is to emit **nothing**
    anywhere; the `onEvent` callback is the host's own channel and carries typed states only
    (deliverable 4's denylist applies).
14. **`apps/widget/examples/host-page.html`** — a static host page used by the test suite to mount
    the widget in a real DOM, exercise the allowed and disallowed origins, and drive the storage and
    theming assertions. It is a **test artefact**, not a deployable page, and it embeds no real
    credential.
15. **`apps/widget/test/fixtures/**`** — recorded `/v1` responses built from
    `schemas/openapi/examples/**` (PRD §34.2 search, §34.3 create answer job, §34.5 snapshot) and SSE
    transcripts assembled for the completion, failure, cancel and resume paths, plus a synthetic mint
    response carrying `allowed_origins`, `allowed_features`, `environment` and `expires_at`. Fixed
    clock, fixed random.

Ordering constraint: deliverable 4 (protocol) before 2 and 3 (loader and frame speak it); deliverable
8 before 9 (theming is applied, then the invariant re-asserts); deliverable 5 before 7 (an
unauthorised origin must make **no** `/v1` request at all).

## Acceptance checklist (classified)

- [ ] `[machine]` **Iframe sandbox attributes**: the created iframe's `sandbox` token list is exactly
      `allow-scripts allow-same-origin allow-forms`; each of `allow-top-navigation`,
      `allow-top-navigation-by-user-activation`, `allow-popups`, `allow-popups-to-escape-sandbox`,
      `allow-modals`, `allow-downloads`, `allow-pointer-lock`, `allow-presentation`,
      `allow-orientation-lock` and `allow-storage-access-by-user-activation` is **absent**;
      `referrerpolicy="strict-origin"` and `allow=""` are set (PRD §8.10 *"sandboxed iframe"*; §21.1)
- [ ] `[machine]` **No secret in the frame URL**: the iframe `src` has no query string and no
      fragment, and contains no token, question, organisation id or research content
      (PRD §8.10; §41.1)
- [ ] `[machine]` **Loader/frame version handshake**: a version mismatch is refused with a named
      error and the widget renders nothing (PRD §33.5 step 3 *"versioned JavaScript loader"*)
- [ ] `[machine]` **Exact `targetOrigin`**: a source scan proves the literal `'*'` is never passed as
      a `postMessage` target anywhere in `apps/widget/src/**`; a runtime test captures every
      `postMessage` call and asserts each target equals the configured `widgetOrigin` (PRD §8.10
      *"exact origin validation"*; sub-PRD **D9**)
- [ ] `[machine]` **Origin-validation negative tests** — the frame refuses, renders nothing and makes
      **zero** `/v1` requests for each of: a prefix near-miss (`https://example.com.evil`), a suffix
      near-miss (`https://evil-example.com`), a wildcard-style value (`https://*.example.com`), a
      differing port (`https://example.com:8443` when `:443` was allowed), a differing scheme
      (`http://example.com`), an `Origin` of `null` (an opaque-origin embedder), a trailing-slash
      variant, an uppercase-host variant and a punycode/unicode homograph variant
      (PRD §8.10, §21.1 *"exact widget origins"*; sub-PRD **D9**)
- [ ] `[machine]` **Origin comparison is byte-equal**: a source scan finds no `startsWith`,
      `endsWith`, `includes`, `indexOf`, `RegExp` or wildcard applied to an origin value
      (PRD §21.1; sub-PRD **D9**)
- [ ] `[machine]` **Source check**: a message whose `event.source` is not the expected window is
      dropped even when its `event.origin` is allowed (a nested-frame / clickjacking case)
      (PRD §21 *"customer host pages … untrusted"*)
- [ ] `[machine]` **Typed events only**: every inbound and outbound message validates against its
      protocol schema; an unknown type, wrong `protocol`, wrong `protocol_version` or invalid payload
      is dropped and never executed; the property-name denylist rejects any schema declaring a
      research-content or token field (PRD §33.5 step 4 *"exchanges only typed events"*; §22)
- [ ] `[machine]` **`DEV-002` — no token in storage**: after a full session (mount → search → answer →
      stream → complete → expire → unmount), a canary token string is absent from `localStorage`,
      `sessionStorage`, `document.cookie`, IndexedDB, Cache Storage, `window.name`, the iframe `src`,
      every DOM attribute and text node, every captured `postMessage` payload, every console line and
      every telemetry record (PRD §8.10 *"no token storage in localStorage"*; §33.5 step 6;
      `DEV-002`; sub-PRD **D10**)
- [ ] `[machine]` **`DEV-002` — no long-lived credential path**: a source scan proves no file in
      `apps/widget/**` references `POST /v1/widget-sessions`, a service credential, an API key
      parameter, or `/v1/service-accounts`; the loader's public API has no field that could carry
      one (PRD §8.10 *"long-lived service credentials MUST NOT enter the browser"*; `DEV-002`;
      `IDNT-07` deliverable 1)
- [ ] `[machine]` **The loader makes no network request**: with the loader mounted and the frame
      stubbed, the recorded transport sees zero requests originating outside the frame (PRD §33.5)
- [ ] `[machine]` **No cookies**: every `/v1` request from the frame uses `credentials: 'omit'` and
      sets no `Cookie` header (PRD §38.2 *"API keys do not use cookies"*)
- [ ] `[machine]` **Token is never parsed**: a source scan proves no base64/JWT decode, no `split('.')`
      and no claim read is applied to the token; session metadata comes from the mint-response fields
      the page forwards (PRD §38.4 *"opaque-to-client"*; `02-auth-core` **D8**)
- [ ] `[fixture]` **Search and answer replay**: with recorded responses, the frame runs `POST /v1/search`
      and a Quick Answer to completion; the SSE transcript yields only the nine PRD §34.4 types; a
      resume after event 5 sends `Last-Event-ID: 5` and produces no duplicate section or completion
      (PRD §34.4; `ANS-003`; `UAT-ANS-06` client half)
- [ ] `[fixture]` **Provisional sections (sub-PRD D6)**: after a `job.failed` transcript no
      `answer.section` content remains rendered and none was ever presented as a validated answer
      (PRD §34.4)
- [ ] `[machine]` **`Idempotency-Key` is retry-stable** on `POST /v1/answers`: forced transport
      failures re-send the identical key, within PRD §34.1's 16–128 bound (PRD §34.1; `ANS-003`)
- [ ] `[machine]` **Feature scope**: invoking a feature outside the session's `allowed_features` is
      refused client-side, and the server-side `FEATURE_NOT_ALLOWED` path is exercised against a
      recorded response so the client check is proven to be convenience, not the boundary
      (PRD §38.4; `AUTC-05` deliverable 4)
- [ ] `[machine]` **Theming cannot remove the safety surface (PRD §8.10)**: for every theme in the
      adversarial fuzz set — including all colours equal to the background, the smallest permitted
      font scale, zero spacing, and every rejected-value probe (`url(`, `expression(`, `@import`,
      `;`, `}`, `<`, newline) — `assertProtectedRegionsVisible()` either passes with the disclaimer,
      citation list and product-source indicator visible, sized and contrast-compliant, or the widget
      **refuses to render the answer**. There is no path where an answer renders without them
      (PRD §8.10; §11.2; sub-PRD **D11**)
- [ ] `[machine]` **No arbitrary styling surface**: a source scan finds no `customCss`, stylesheet
      URL, `className`/`class` prop, `part`, `style` prop or `dangerouslySetInnerHTML` in the public
      API or the renderer (PRD §8.10; §21.1)
- [ ] `[machine]` **Sanitisation**: an answer fixture containing script tags, an event-handler
      attribute, a `javascript:` URL, a `data:` URL and a prompt-injection instruction renders as
      inert text with no navigation, no download, no `postMessage` and no HTML execution
      (PRD §21.1; §37.5; `SEC-003`)
- [ ] `[machine]` **The ten PRD §31.3 states** each render a visible title, plain-language
      explanation, allowed next action and request/job id, with a live region for changes; a spinner
      alone fails (PRD §31.3)
- [ ] `[machine]` **PRD §13.1 accessibility inside the frame**: zero WCAG 2.2 AA violations at
      360 px, 768 px and 1280 px; complete keyboard operation with visible focus and logical order;
      one programmatic heading; labelled fields; colour never the only status signal
      (PRD §13.1 *"Web and widget MUST support …"*; §41.1)
- [ ] `[machine]` **No research content leaves the frame**: no question, facts, answer text or
      citation quote appears in the iframe URL, `window.name`, any `postMessage` payload, any
      `onEvent` payload, any console line, any telemetry record or the document title
      (PRD §41.1; §22; sub-PRD **D7**)
- [ ] `[machine]` **Unmount is complete**: `unmount()` removes the iframe, closes the port, aborts
      in-flight requests, clears the token reference and leaves no listener attached; mounting twice
      into one container is refused with a named error
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (standing item, PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — this package declares no `/v1` type
      of its own and hand-edits no generated file (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**`DEV-002`**, `SEC-003`,
      `E27-DEVELOPER`, proposed `UAT-DEV-02`/`UAT-DEV-04` per sub-PRD **Q-PLTF-1**), user-visible
      change and non-goals, schema/API/event compatibility impact (client only), **tenant/PII/security
      impact** (exact origin validation, sandbox attributes, no token storage, no credential path, no
      research content off-frame), source/licence impact (none), cost/memory/latency impact (embed
      bundle size reported, with a stated budget), rollback path (revert; the loader path is
      versioned so an old embed keeps working), known gaps (**Q-PLTF-5** CSP `frame-ancestors` at the
      edge; disclaimer wording pending `LNCH-01`)
- [ ] `[human]` **`DEV-002` rehearsed manually against a running stack** (proposed `UAT-DEV-02`;
      also completes `IDNT-07`'s deferred `[human]` row): a simulated customer backend mints a
      session with `curl` and a service credential; the page embeds the widget and runs a search and a
      Quick Answer; the browser's storage inspector and network log show **no** long-lived credential
      and **no** stored session; the same page served from a different origin is refused
      (PRD §30.2 `DEV-002`; §43.4). **Not required to merge** — run at Gate 2
- [ ] `[human]` **Theming review** (proposed `UAT-DEV-04`): a founder applies the most aggressive
      legal theme and confirms the disclaimer, citations and product-source indicator remain legible
      (PRD §8.10; §43.4). **Not required to merge**
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)
- No SDK-telemetry criteria beyond deliverable 13 — this package ships no SDK; the SDK allowlist is
      `PLTF-02`/`PLTF-03` (sub-PRD **D7**)

## Test plan

Reviewer steps, **all offline**: no network, no live API, no real third-party site. The DOM
environment is the package's headless browser or DOM test runner; every `/v1` interaction goes
through the injected transport backed by `apps/widget/test/fixtures/**`; the clock and random source
are fixed.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @<scope>/widget`. Suites live under `apps/widget/test/`.
3. **Read the fixtures against the sources.** Compare each recorded `/v1` body with
   `schemas/openapi/examples/**` and each SSE frame with PRD §34.4. **A drifted fixture makes every
   replay vacuous** — check this first.
4. **`iframe-attributes.test.ts`** — mount into `examples/host-page.html`; read the created iframe's
   attributes; assert the exact `sandbox` token list and the absence list; assert `referrerpolicy`,
   `allow=""` and a query-free, fragment-free `src`.
5. **`origin.test.ts`** — the negative matrix from the acceptance list, one case per origin variant.
   For each, assert three things together: the frame renders the unauthorised state, the recorded
   transport saw **zero** requests, and no `postMessage` was accepted. Then the positive case. Then
   the source scans for `'*'` and for substring/regex origin matching — confirm each scan fails when
   deliberately reverted on a scratch branch.
6. **`protocol.test.ts`** — schema validation in both directions; unknown type; wrong
   `protocol_version`; a payload declaring a denylisted property name; a message from the correct
   origin but the wrong `event.source`.
7. **`token-storage.test.ts`** — force the fixture mint response to carry
   `token: 'widget-canary-<uuid>'`; run the full session; then enumerate `localStorage`,
   `sessionStorage`, `document.cookie`, IndexedDB databases, Cache Storage keys, `window.name`, the
   iframe `src`, the serialised DOM, every captured `postMessage`, every `onEvent` payload and every
   console line; assert the canary appears nowhere. Confirm the test enumerates **all** of those, not
   only `localStorage`.
8. **`no-credential-path.test.ts`** — source scan for `widget-sessions`, `service-account`, `apiKey`,
   `api_key`, `Bearer sk_`-style patterns and any mint call; assert none.
9. **`api-client.test.ts`** — search and answer replay; `credentials: 'omit'`; the SSE nine-type
   assertion; the cut-and-resume transcript asserting `Last-Event-ID: 5` and no duplicates; the
   `job.failed` transcript asserting provisional sections are discarded; forced retries asserting an
   identical `Idempotency-Key`; a `FEATURE_NOT_ALLOWED` recorded response.
10. **`theme.test.ts`** — property-based over the closed token set plus the explicit adversarial
    cases; for each, run `assertProtectedRegionsVisible()` and assert either full visibility or a
    refusal to render. Then the rejected-value probes. Then the source scan for `customCss`,
    `className`, `style`, `part` and `dangerouslySetInnerHTML`.
11. **`sanitisation.test.ts`** — the hostile answer fixture; assert inert rendering, no navigation,
    no download, no `postMessage`, no HTML execution.
12. **`states.test.ts`** — drive all ten PRD §31.3 states; assert title, explanation, next action and
    id for each, and that the live region announces changes.
13. **`a11y.test.ts`** — accessibility checks at the three widths; keyboard traversal; one heading.
14. **`unmount.test.ts`** — unmount cleanliness and double-mount refusal.
15. **Bundle budget** — report the loader and frame bundle sizes and compare against the stated
    budget; a regression is a PR discussion, not a silent growth.
16. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether any
    code path lets the host page read the token back (through `onEvent`, `getState()`, an error
    object, a thrown stack or a `postMessage` echo); whether a nested iframe or a clickjacking
    embedder can satisfy the origin check; whether `event.source` is compared by identity rather than
    by a spoofable property; whether the `MessageChannel` port can be re-transferred; whether a
    `session.refresh` race can leave two tokens live or overwrite a newer one with an older one;
    whether `assertProtectedRegionsVisible()` is reachable from every render path including error and
    clarification states; whether a `size.changed` message can be used to probe the host layout;
    whether an aborted request can still deliver a section after `unmount()`.
17. The two `[human]` rows run against a locally started stack (`pnpm stack:up`, `RUNT-09`) with a
    simulated customer backend at Gate 2 and are recorded in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies anything in this ticket, update **this ticket file**
first (version note + changelog line in the PR), re-publish with
`.claude/scripts/publish-tickets.mjs --sync`, then change code. Silent divergence is an incomplete
ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`IDNT-07`'s mint response does not carry a field the frame needs** (for example
  `allowed_features` or `expires_at` in the shape assumed here). → `IDNT-07`'s own feedback
  obligation names this path: *"`PLTF-05` needs a field or a second endpoint this area does not
  provide … amend this ticket's deliverable 2 in a docs PR and `--sync`"*. Raise the docs PR against
  `docs/prd/13-identity-surface/tickets/IDNT-07-*.md` and this ticket together. **Never** write
  `apps/api/src/routes/widget-sessions/**` from here, and never infer a claim by parsing the token.
- **`AUTC-05` cannot express a needed claim or revocation behaviour.** → The fix belongs in
  `02-auth-core`; add a ticket there and the edge in `docs/prd/breakdown-plan.md` §5.3/§6.2 first.
  Never sign, parse or inspect a widget token in `apps/widget`.
- **The widget needs an API shape the OpenAPI root does not have.** → **A docs PR against
  `docs/prd/00-foundation/tickets/FND-04-*.md`, never a hand-edited binding and never a
  hand-declared type** (PRD §20.1; `FND-04` friction 3). Record it in
  `docs/prd/20-developer-platform/README.md` under **Q-PLTF-8**.
- **`allow-same-origin` proves unacceptable** (for example a security review requires an opaque
  origin), but removing it makes the browser send `Origin: null` and defeats `AUTC-05`'s
  `ORIGIN_NOT_ALLOWED` check. → This is an architecture decision under PRD §45.5. Record it in
  `docs/adr/NNNN-widget-frame-isolation.md` (breakdown plan **A9**), update
  `docs/prd/20-developer-platform/README.md` **D9** and this ticket's deliverable 3 **before**
  changing code, and coordinate with `AUTC-05`/`IDNT-07`. Never silently weaken or strengthen the
  attribute set.
- **`frame-ancestors` cannot be served for the frame document.** → Sub-PRD **Q-PLTF-5**. Document the
  required header in `docs/api/guides/widget.md` (`PLTF-01`'s file — raise it there, do not write it
  from here) and raise it against `18-ops-release`/`RLSE-03` in
  `docs/prd/breakdown-plan.md` §5.19. The three exact-origin checks remain the required control
  either way; do not treat a missing CSP header as permission to relax them.
- **The `packages/ui` async-state components would obviously save work.** → Sub-PRD **D12** and
  breakdown plan §6.2: `RUNT-06` is not on this ticket's dependency path. Adding the dependency is a
  **plan change** — raise it in `docs/prd/breakdown-plan.md` §5.21/§6.2 and
  `docs/prd/20-developer-platform/README.md` first. Do not import it and do not copy code out of it.
- **A customer asks for theming beyond the closed token set.** → PRD §8.10's non-removability clause
  is unconditional. Update `docs/prd/20-developer-platform/README.md` **D11** with the exact request
  and escalate as a **product change** (PRD §45.5) before widening the token set. Never add a raw CSS
  surface.
- **`assertProtectedRegionsVisible()` produces false positives on a legitimate theme.** → Tighten the
  *check*, never the *requirement*, and record the adjusted thresholds in this ticket's deliverable 9
  before changing code. A "warn and continue" mode is not an option.

**3. Escalation.** *"long-lived service credentials MUST NOT enter the browser"*, *"exact origin
validation"*, *"no token storage in localStorage"* and *"The disclaimer, citations and
product-source indicator MUST NOT be removable by customer theming"* (all PRD §8.10) are release
requirements with MUST force, and `DEV-002`'s evidence is that the long-lived key never appears in a
browser fixture. `PLTF-06` and `LNCH-02` are both `blocked_by` this ticket. If any of those four
properties proves unimplementable as specified, that overturns a team decision recorded in
`02-auth-core`'s sub-PRD **D8** and in PRD §33.5. Stop, raise an ADR under `docs/adr/` (breakdown
plan **A9**), write back to `docs/prd/breakdown-plan.md` and
`docs/prd/20-developer-platform/README.md`, and escalate to the human. Never add a browser-reachable
minting path, a storage fallback or a themeable disclaimer inside this ticket.
