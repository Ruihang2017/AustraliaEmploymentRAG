# 20-developer-platform — sub-PRD

> Module sub-PRD. Authored from `docs/prd/breakdown-plan.md` §5.21 (wave B). The **tickets** under
> `tickets/` are the executable source of truth; this file is the module's shared context. On any
> disagreement between a ticket and this file, the ticket wins (CLAUDE.md, issue #53).

| Field | Value |
|---|---|
| Module | `20-developer-platform` |
| Lane | `20-developer-platform` |
| Ticket prefix | `PLTF` |
| Tickets | 9 (`PLTF-01` … `PLTF-09`) |
| PRD epic | `E27-DEVELOPER` (week 5; depends on `E02`, `E05`, `E21`; exit evidence *"DEV tests and sample integration"*, PRD §44.2) |
| Requirement families | `DEV-001`, `DEV-002`, `DEV-003`, `AUTH-006` (screen half), `OPS-003` (visibility half) |
| Depends on modules | `00-foundation`, `01-app-data`, `03-app-runtime`, `13-identity-surface`, `14-search-product`, `15-answer-product`, `16-monitor-alerts` |
| Modules that depend on this one | `23-assurance` (`ASSR-01` ← `PLTF-09`), `24-launch` (`LNCH-02` ← `PLTF-05`) |
| Languages | TypeScript (`packages/sdk-typescript`, `apps/widget`, `apps/api`, `apps/web`), **Python** (`sdk/python`), Markdown (`docs/api`) |
| Master spec | [`docs/PRD.md`](../../PRD.md) |
| Version | v0.2 (2026-08-03) |

## Problem

This module is where the product stops being a web application and becomes a **platform another
company builds against**. PRD §5 lists four of its fourteen mandatory surfaces here — *"Versioned
REST API"*, *"TypeScript and Python SDKs"*, *"Developer sandbox and portal"*, *"Embeddable
JavaScript widget and React wrapper"* — and PRD §4.2 names the persona: *"Platform developer |
Integrate REST API, SDK and widget; manage service accounts and webhooks"*. PRD §41.4's Integration
stage makes it a paid-pilot gate: *"Create scoped expiring service account, webhook, sandbox and
optional widget origins | Customer completes synthetic test | **No long-lived browser secret**"*.

Four pressures make it a module of its own, and make it the most security-sensitive customer-facing
surface in the repository.

1. **The customer's host page is untrusted, and the widget runs inside it.** PRD §21 opens with the
   trust boundary: *"Trust customer input, official source content, **customer host pages** and
   model output as untrusted."* Everything else in the product runs on an origin we control. The
   widget does not. PRD §8.10 therefore states the isolation mechanically — *"a sandboxed iframe
   with a JavaScript loader and React wrapper, exact origin validation, typed events and no token
   storage in localStorage"* — and PRD §21.1's control list says *"exact widget origins"*, not
   "configurable origins". A prefix or suffix origin match, a `postMessage` with `targetOrigin: '*'`,
   or a token written to `localStorage` each silently converts a per-organisation session into a
   cross-site capability.
2. **Credentials must not follow the widget into the browser.** PRD §8.10: *"The browser widget MUST
   use a short-lived organisation-scoped widget session created by the customer's backend;
   **long-lived service credentials MUST NOT enter the browser**."* `DEV-002`'s entire acceptance
   evidence is negative — *"Long-lived key never appears in browser storage/network fixture"* — so
   this module's job is to make the wrong integration **impossible to write**, not merely
   documented. `13-identity-surface`/`IDNT-07` already refuses to mint a session for anything but a
   verified service credential; this module must not build a browser path that undoes that.
3. **The SDKs are generated, and DEV-001's evidence is a diff.** PRD §8.10: *"TypeScript and Python
   SDKs MUST share an OpenAPI-generated core and provide streaming, wait/cancel, typed errors and
   webhook verification."* `DEV-001`'s minimum acceptance evidence is *"Generated-client diff is
   clean in CI"* and PRD §20.1 forbids the obvious shortcut: *"Generated OpenAPI/SDK/event/manifest
   bindings MUST NOT be hand-edited."* A hand-written client that "just adds the one field we need"
   is the failure mode this requirement exists to prevent — and the correct response to a missing
   field is a docs PR against `00-foundation`/`FND-04`, never a local divergence.
4. **A theme must not be able to delete the safety surface.** PRD §8.10 closes with *"The
   disclaimer, citations and product-source indicator MUST NOT be removable by customer theming"*
   and PRD §11.2 requires the disclaimer *"in the Web app, widget and exports"*. The commercial
   pressure to let a customer "clean up" an embedded widget is real and constant; the requirement is
   that the mechanism refuse, not that a reviewer notice.

Alongside those four, the module also owns two quieter API areas that live nowhere else: the
sandbox organisation (PRD §20.2 *"One strictly isolated sandbox organisation in production"*,
`DEV-003`) and the usage/limits/audit read endpoints (PRD §16.2, §38.5, §22) that `/usage` and
`23-assurance`'s tenant-isolation suite consume.

## Scope

In scope — exactly the module's breakdown plan §4 write-owns row:

- `packages/sdk-typescript/**` — the TypeScript SDK (`PLTF-02`).
- `sdk/python/**` — the Python SDK (`PLTF-03`).
- `apps/widget/**` — the versioned loader, the sandboxed iframe application and the React wrapper
  (`PLTF-05`, `PLTF-06`).
- `apps/api/src/routes/{sandbox,usage,audit-events}/**` — three A1 route areas (`PLTF-04`,
  `PLTF-09`) plus their co-located tests under `apps/api/test/routes/{sandbox,usage,audit-events}/**`.
- `apps/web/src/features/{developer,usage}/**` — the `/developer/*` section and `/usage` (`PLTF-01`,
  `PLTF-07`, `PLTF-08`).
- `docs/api/**` — the developer documentation set (`PLTF-01`).

Out of scope in one line: **this module packages, documents and embeds a contract that is already
frozen elsewhere; it defines no new `/v1` operation, mints no token, enforces no quota and stores no
row.**

## Non-goals

Each names its owner module/ticket or its standing reason.

| Not in this module | Owner / reason |
|---|---|
| The `/v1` OpenAPI document, the generated TypeScript core, canonical enums | `00-foundation` (`FND-03`, `FND-04`) — PRD §44.3 serial-owned. Both SDKs **generate from** or **wrap** it; PRD §20.1 forbids hand-editing generated output. A missing field is a docs PR against `FND-04`, never a local client. |
| The event/webhook schema root and the HMAC sign/verify helper | `00-foundation` (`FND-05`). The SDKs **re-export or re-implement against** those schemas and `FND-05`'s committed fixture; neither invents a signing scheme (PRD §34.8). |
| Widget session minting, token format, signing, claim validation and verification | `02-auth-core` (`AUTC-05`) and `13-identity-surface` (`IDNT-07`). `POST /v1/widget-sessions` is machine-only; nothing in this module mints a session (PRD §33.5 step 2, §38.4). |
| Service-account and credential **routes** (create/rotate/revoke), scope catalogue | `13-identity-surface` (`IDNT-06`). `PLTF-07` renders them; it hashes, generates and parses nothing (PRD §38.4). |
| Webhook **delivery** — subscription CRUD, secret storage/rotation, egress guard, retry, dead-letter | `16-monitor-alerts` (`WTCH-05`). `PLTF-07` renders those routes; it sends no webhook. |
| Admission — authn, tenant resolution, permission, rate/quota, idempotency, PII | `03-app-runtime` (`RUNT-02`) with `packages/domain` (`FND-06`, `FND-09`) and `12-evidence-safety`. Route areas here **declare** an admission profile; they enforce nothing (PRD §16.5, §45.2). |
| SSE transport, persisted replay, `Last-Event-ID` handling on the server | `03-app-runtime` (`RUNT-03`). The SDKs and the widget are **clients** of it (PRD §34.4). |
| App tables, migrations, repositories, the usage ledger itself | `01-app-data` (breakdown plan **A3**; PRD §45.2). `PLTF-09` reads through `DATA-07`'s repositories and writes no schema. |
| Budget enforcement, the 90%/100% circuit breaker, provider cost accounting | `12-evidence-safety` (`EVID-08`) and `22-internal-admin` (`INTL-07`). This module makes spend **visible** for the caller's own organisation; it stops nothing (PRD §42.6, `OPS-003`). |
| Search, answer, coverage, compare, records, exports and every `/v1` operation body | `14`, `15`, `17`, `19`. The widget and the SDKs **call** those operations; they define none. |
| `/internal/v1` and `apps/admin/**` | `22-internal-admin`. PRD §8.11: internal administration *"MUST NOT be shipped in customer SDKs"* — asserted mechanically in `PLTF-02` and `PLTF-03`. |
| The disclaimer, Terms/Privacy/AUP **text** and the in-product legal surfaces | `24-launch` (`LNCH-01`, `LNCH-02`; `LNCH-02` is `blocked_by PLTF-05`). This module owns the **non-removability mechanism**, not the wording (PRD §11.2, §8.10). |
| The web shell, navigation slots, organisation switcher, status/degraded badges, `apps/web/src/lib/**` | `03-app-runtime` (`RUNT-05`). |
| `packages/ui` primitives and the shared evidence panel | `03-app-runtime` (`RUNT-06`, breakdown plan **A6**). Not on this module's dependency path for `apps/widget` — see **D12**. |
| Cloudflare Pages hosting, edge headers, `frame-ancestors` at the CDN, DNS/TLS | `18-ops-release` (`RLSE-03`). See **Q-PLTF-5**. |
| Cross-boundary suites — tenant isolation, security, PII, E2E UAT automation, accessibility | `23-assurance` (`ASSR-01` … `ASSR-07`). `ASSR-01` is `blocked_by PLTF-09`. Every ticket here carries its **own** co-located assertions (breakdown plan §9 **R8**). |

## Decisions

Each states its basis: a PRD section, a breakdown plan §2.1 decision, or an upstream sub-PRD/ticket
decision. Where the PRD does not answer, the item is an open question below, not a decision.

| # | Decision | Basis |
|---|---|---|
| **D1** | **The TypeScript SDK wraps `packages/contracts`' generated core; it runs no second TypeScript generator.** `PLTF-02` declares a workspace dependency on `packages/contracts` and builds its ergonomic layer (auth, retry, idempotency, streaming, wait/cancel, typed errors, pagination, webhook verification, telemetry) on top of the generated types and path/method map. It re-declares no request or response type. | `FND-04` non-goals, verbatim: *"No Python SDK, no TypeScript SDK package — `20-developer-platform` (`PLTF-02`, `PLTF-03`). This ticket produces the generated **core** inside `packages/contracts`, which those SDKs wrap."* PRD §8.10 (*"share an OpenAPI-generated core"*); PRD §20.1. |
| **D2** | **The Python SDK generates its own core from the same `schemas/openapi/openapi.yaml`.** There is no Python equivalent of `packages/contracts`, so `PLTF-03` generates into `sdk/python/src/<pkg>/_generated/**` with the `FND-04` do-not-edit banner form and its own `generated:check` that regenerates into a temporary directory and fails on any difference. The **input file is `FND-04`'s**, never a copy. | PRD §8.10 (*"TypeScript and Python SDKs MUST share an OpenAPI-generated core"*); `DEV-001` (*"OpenAPI drives TypeScript/Python generated cores"*); PRD §20.1; breakdown plan §4.1 (the OpenAPI root is `FND-04`'s, read-only from here). |
| **D3** | **Surface parity between the two SDKs is asserted from a committed manifest, in both languages.** `packages/sdk-typescript/parity/surface.json` lists every public operation and every ergonomic method with its canonical name; the TypeScript suite asserts its exports against it and the Python suite asserts its own exports against the **same file**, read read-only. A method that exists in one SDK and not the other fails both suites. | PRD §8.10 requires the same four capabilities of both SDKs; PRD §5 items 9; `E27`'s exit evidence *"DEV tests and sample integration"* (PRD §44.2). Cross-tree **reads** are unrestricted (breakdown plan §4). |
| **D4** | **`INSUFFICIENT_EVIDENCE` and every other domain answer status is never an SDK exception.** Both SDKs raise typed errors only for PRD §34.9 HTTP error codes; a completed job whose answer status is a refusal is returned as a **successful result**. Each SDK carries a test that asserts it does not throw. | PRD §34.9 closing sentence: *"Domain answer statuses such as `INSUFFICIENT_EVIDENCE` are valid completed research results and do not become HTTP errors."* PRD §16.1 (*"HTTP status and domain answer status remain separate"*). |
| **D5** | **Idempotency is automatic and retry-stable.** For every operation the OpenAPI document marks retryable, the SDKs generate an `Idempotency-Key` (16–128 characters) when the caller supplies none, and **reuse the identical key across every automatic retry of the same logical call**. A caller-supplied key is passed through unchanged; a changed body under a reused key surfaces the typed `IDEMPOTENCY_CONFLICT`. | PRD §8.10 (*"Retryable writes MUST support `Idempotency-Key`"*); PRD §34.1 (*"Key 16–128 characters; same actor/route/key/body returns original result; changed body returns 409"*); `ANS-003` (*"Repeated idempotency key creates one job/charge"*). |
| **D6** | **`answer.section` is provisional in both SDKs and in the widget, and is dropped on failure.** The streaming iterator marks sections `provisional: true` until `job.completed`; on `job.failed` the accumulated sections are discarded and the accessor returns an empty set. Neither SDK nor the widget may render a provisional section as an answer. | PRD §34.4, quoted by `FND-05`: *"`answer.section` is provisional UI content until `job.completed`; clients MUST remove it on failure and MUST not represent it as a validated answer."* |
| **D7** | **SDK and widget telemetry use a closed field allowlist, are off by default, and are checked at runtime.** The only permitted fields are SDK/widget name and version, runtime and platform string, operation id, HTTP method and status, `request_id`, `job_id`, duration, retry count and a typed error code. An `assertTelemetrySafe(record)` guard runs on **every** emitted record and throws on any key outside the allowlist; a canary test proves a research question, facts string, answer text and citation quote never appear. | PRD §8.10: *"**SDK telemetry MUST NOT contain research content.**"* PRD §22 (logs *"MUST exclude research/evidence content, PII text, credentials, assertions and provider payloads"*); PRD §41.1 (*"customer research content is not placed in URL query strings, analytics, browser error telemetry or page titles"*). An allowlist is used rather than `FND-05`'s denylist because SDK telemetry field names are ours to choose, so the closed set is enforceable. |
| **D8** | **Neither SDK exposes `/internal/v1`.** The generation step filters the internal server/paths out, and each SDK carries a test asserting no exported operation has an `/internal/v1` path and no internal operation id is reachable. | PRD §8.11: *"Internal administration MUST be separated under `/internal/v1` … and MUST NOT be shipped in customer SDKs."* |
| **D9** | **Origin validation is exact and triple-sided.** (a) The loader posts to the iframe only with an exact `targetOrigin` string — never `'*'`; (b) the iframe accepts a message only when `event.origin` **string-equals** a member of the session's `allowed_origins` **and** `event.source` is the expected window; (c) every `/v1` call carries the browser-set `Origin` header and the server refuses `ORIGIN_NOT_ALLOWED` via `AUTC-05.verifyWidgetSession`. Comparison is scheme + host + port, byte-equal, after WHATWG URL normalisation — never `startsWith`, `endsWith`, `includes`, a regular expression or a wildcard. | PRD §8.10 (*"exact origin validation"*); PRD §21.1 (*"exact widget origins"*); PRD §33.5 step 4 (*"Iframe validates parent origin and exchanges only typed events"*); `AUTC-05` deliverable 4 (`ORIGIN_NOT_ALLOWED`); PRD §21 (host pages are untrusted). |
| **D10** | **The widget session token lives in one closure inside the iframe and in no storage at all.** It is never written to `localStorage`, `sessionStorage`, `document.cookie`, IndexedDB, Cache Storage, the iframe URL, a `data-*` attribute or the DOM; it is never included in a `postMessage` payload in either direction; it is never a telemetry field. The customer page holds it only long enough to pass it to `mount()` (or supplies an async `tokenProvider`), and the loader drops its reference immediately after transfer. | PRD §8.10 (*"no token storage in localStorage"*); PRD §33.5 step 6 (*"Session expires quickly and is never stored in localStorage"*); PRD §38.4 (≤15-minute lifetime, so brief in-memory presence in the host page is the contemplated design); `DEV-002` (*"Long-lived key never appears in browser storage/network fixture"* — the **long-lived** credential is what must never be there, and it never is). |
| **D11** | **Theming is a closed token set, and the protected regions are re-asserted after every render.** The public theme input is a fixed allowlist of named tokens (colour, radius, font family, font size scale, spacing); values are schema-validated and reject `url(`, `expression(`, `@import`, `;`, `}` and `<`. No raw CSS string, stylesheet URL, `class`, `part`, `slot`, `style` prop or `dangerouslySetInnerHTML` reaches the widget. After theming is applied and before any answer becomes interactive, a `assertProtectedRegionsVisible()` invariant re-reads the disclaimer, the citation list and the product-source indicator from the live DOM and checks presence, non-zero size, computed `display`/`visibility`/`opacity` and a minimum contrast; failure refuses to render the answer and reports a typed error event. | PRD §8.10: *"The disclaimer, citations and product-source indicator MUST NOT be removable by customer theming."* PRD §11.2 (disclaimers in *"the Web app, widget and exports"*); PRD §21.1 (*"Output schema, citations, URLs and Markdown/HTML validated/sanitised"*). |
| **D12** | **`apps/widget` depends on `packages/contracts` only — not on `packages/ui` and not on `packages/sdk-typescript`.** It implements the ten PRD §31.3 asynchronous states itself, in its own minimal renderer. | Breakdown plan §6.2 gives `PLTF-05` the blockers `IDNT-07`, `FIND-01`, `ASK-01` — neither `RUNT-06` nor `PLTF-02` is on its path, and adding an edge is a plan change (breakdown plan §9 **R6**). Breakdown plan **A6** scopes `packages/ui` to the shared **web** components (PRD §32.1/§32.3/§32.4 panels). PRD §31.3 still applies to the widget: it is a job-driven screen. A second reason is size: the embed bundle is loaded into a third party's page. |
| **D13** | **One `developer` web feature area, extended by a section glob.** `apps/web/src/features/developer/` is a single A1 feature area (one `feature.tsx`, one `DEVELOPER` nav slot). Its sub-screens are discovered with `import.meta.glob('./*/section.tsx', { eager: true })`, so `PLTF-07` adds `/developer/service-accounts`, `/developer/webhooks` and `/developer/widget` by creating three directories with **zero** diff to `PLTF-01`'s files. The area-level files belong to `PLTF-01`; `PLTF-07` is `blocked_by PLTF-01`, so the two are never concurrent. | `RUNT-05`'s A1 web registration contract (one `feature.tsx` per area with a default-exported `FeatureModule`; `nav.slot` claimed once from the frozen eleven-slot tuple; *"Adding, renaming or removing a feature area produces zero diff outside that area's own directory"*); PRD §31.1 item 9 and §31.2's four `/developer/*` routes; breakdown plan **A1**. The same refinement pattern is already used by `14-search-product` (**D7** there). |
| **D14** | **`/usage` is a feature area with routes and no nav slot.** `apps/web/src/features/usage/feature.tsx` registers `/usage` and claims **no** slot. | `RUNT-05` contract item 3: the frozen tuple is `['ORG_SWITCHER','HOME','SEARCH','ASK','COVERAGE','COMPARE','RECORDS','MONITOR','DEVELOPER','SETTINGS','HELP']` — PRD §31.1's eleven items, which do not include Usage — and *"`nav` is optional: a feature may register routes without a nav entry"*. PRD §31.2 still requires the `/usage` route. |
| **D15** | **PRD §32.8's mandatory developer fields are satisfied across the developer section, not by one screen.** `PLTF-01` owns environment, base URL, API version, OpenAPI version, the documented PRD §38.5 limit table and the copyable curl/TypeScript/Python examples; the **credential-derived** fields (current key prefix, scopes, expiry) and the webhook signing instructions in-context are `PLTF-07`, which is `blocked_by IDNT-06` and `WTCH-05`. `PLTF-01` renders a labelled empty slot where a credential panel will appear. | PRD §32.8 (*"Developer pages MUST display environment, base URL, API version, current key prefix/scopes/expiry, limits, OpenAPI version, webhook signing instructions and copyable Search/Answer examples. Secrets are never redisplayed."*); breakdown plan §5.21/§6.2 give `PLTF-01` no edge to `IDNT-06` — inventing one is a plan change. |
| **D16** | **`/developer/widget` never mints a widget session.** The screen renders the embed snippet, the customer's configured origins and a copyable **backend** snippet (curl/TypeScript/Python) for `POST /v1/widget-sessions`. Its live preview accepts a token the developer minted out of band, held in memory for the preview only. The screen has no input for a service credential and no code path that sends a credential string anywhere. | `IDNT-07` deliverable 1: the widget-session area *"rejects any principal that is not a service credential: a cookie session and a widget token are both `401 AUTHENTICATION_REQUIRED`"* — the web app is cookie-authenticated, so it structurally cannot mint. PRD §8.10 (*"long-lived service credentials MUST NOT enter the browser"*); `DEV-002`. |
| **D17** | **Sandbox isolation is ordinary tenancy, not a second mechanism.** The sandbox is an organisation row whose `environment` is `SANDBOX`; every access is already `TenantContext`-scoped, so "cannot reach production records" is `SEC-001` holding, asserted here with a co-located cross-organisation matrix. `PLTF-04` adds provisioning, reset, labelling and low-quota configuration — no new isolation primitive. | PRD §20.2 (*"One strictly isolated sandbox organisation in production"*); PRD §21.2 (*"All tenant access is `TenantContext`-scoped"*); `DEV-003` (*"Sandbox webhook/events are labelled and cannot reach production records"*); breakdown plan **A3**. |
| **D18** | **"Synthetic by default" is seeding plus labelling, and the hard boundary stays the PII admission pipeline.** `POST /v1/sandbox` seeds a committed synthetic dataset and sets a `synthetic_only` flag that defaults true; the flag drives the `/developer/widget` question picker's default and the sandbox label on every response. It does **not** attempt to classify free text as "real" — the actual boundary against customer personal data is `12-evidence-safety`'s admission detector, which runs on the sandbox exactly as on production. Carried explicitly as an accepted caveat: *documented and labelled, not text-classified*. | `DEV-003` (*"low quota and synthetic by default"*, evidence is labelling + isolation); PRD §31.2 `/developer/widget` (*"Synthetic questions only by default"*); PRD §10.1 and §37.2 make PII admission the universal boundary; PRD §33.5 step 5 (*"Widget calls the same `/v1` admission, PII, evidence and quota pipeline as Web/API; no bypass exists"*). |
| **D19** | **Usage figures are computed from ledger entries and never summed across ledgers.** `PLTF-09` reads `DATA-07`'s `usageLedger.balance()` per `(fundingLedger, operationLedger)` pair; `PLTF-08` renders the five operation ledgers (search, answer credits, advanced-task credits, API calls, provider cost) and the two funding ledgers (`FOUNDER_PLATFORM_BUDGET`, `CUSTOMER_PREPAID_OR_BYOK`) separately, with no combined total. | PRD §38.5: *"Search, answer credits, advanced-task credits, API calls and provider cost are separate ledgers; exhausting one does not misreport the others."* PRD §24.4; `DATA-07` deliverable 3 (*"`balance(...)` is computed from entries, never from a stored running total, and each `(fundingLedger, operationLedger)` pair is independent"*). |
| **D20** | **A service credential can read usage but not audit events.** `/v1/usage/*` accepts a service credential scoped `usage:read` and returns that principal's own usage; `/v1/audit-events` refuses a service-credential principal outright. | PRD §38.1's role matrix, read column by column: *"View organisation usage"* gives the service-account column **"own usage"**, while *"View audit/security events"* gives it **"—"** and the Developer column *"credential events only"*. PRD §16.3's example scope list contains `usage:read` and no audit scope. The decision itself comes from `FND-06.evaluate()`; this module re-states no role rule (PRD §45.2, breakdown plan §9 **R5**). |
| **D21** | **API tests live at `apps/api/test/routes/<area>/**`; web tests are co-located beside their components.** This matches `13-identity-surface` (`IDNT-06`, `IDNT-07`) for the API and `14-search-product` for the web app. Both conventions are permitted; what matters is that the subtrees are disjoint per area. | Breakdown plan §1.1 "Tests": *"Unit/integration tests live inside the owning package or app and belong to that module's tickets."* `RUNT-01` claims `apps/api/test/**` only *"for this ticket's own unit/integration tests"*; `RUNT-05` likewise for `apps/web/test/**`. |
| **D22** | **`apps/widget/react` is a second entry point of the `apps/widget` workspace member, not a new member.** `PLTF-05` creates `apps/widget/package.json` with an `exports` map that already declares `"./react"`; `PLTF-06` writes `apps/widget/react/**` and appends only its build wiring. | Breakdown plan §1.1: `FND-01` created the member skeleton for every path in PRD §20.1, which lists `apps/{web,api,worker,admin,widget}` and **not** `apps/widget/react`; adding a workspace member would touch `pnpm-workspace.yaml`, which is `FND-01`'s serial-owned root manifest (breakdown plan §4.1). Within a module a manifest is append-only shared, and `PLTF-06` is `blocked_by PLTF-05`, so the two never contend. |
| **D23** | **Every hand-derivable page of `docs/api/**` is generated and diff-checked; only prose is hand-written.** `docs/api/reference/**` (endpoint index, error catalogue, scope list, event-type list) is produced from `schemas/openapi/**` and `schemas/events/**` with a do-not-edit banner and is covered by `pnpm generate && pnpm generated:check`. `docs/api/guides/**` is prose. | PRD §20.1 (*"Generated OpenAPI/SDK/event/manifest bindings MUST NOT be hand-edited"*); PRD §34 preamble (*"property names and enum meanings cannot drift"*); breakdown plan §1.1 "Generated artifacts". A hand-copied error table is exactly the drift `DEV-001` exists to catch. |
| **D24** | **This module builds on `FND-01`'s confirmed toolchain pins, and no package here re-pins, widens or overrides them.** Node.js `24.18.0` and pnpm `11.4.0` build and test `packages/sdk-typescript`, `apps/widget` (loader, frame document and the `./react` entry point) and this module's `apps/api` / `apps/web` areas; Python `3.14.6` with `uv` builds and tests `sdk/python`. CI and local development run the same exact versions — this module has no multi-version build/test matrix — and no ticket here introduces a newer patch or major. `packages/sdk-typescript/package.json`, `apps/widget/package.json` and `sdk/python/pyproject.toml` therefore carry no toolchain version of their own; the pins live in `.node-version`, `package.json#packageManager`, `package.json#engines.node`, `pyproject.toml#requires-python` and the lockfiles, all `FND-01`'s (breakdown plan §4.1). React is a **peer** dependency of `apps/widget/react` and is not a Q12 pin (**D22**, `PLTF-06`). | Breakdown plan §8 **Q12**, status **CONFIRMED**, owner `00-foundation`, resolving ticket `FND-01`: *"Pinned exactly: Node.js `24.18.0`, pnpm `11.4.0`, Rust `1.97.1`, Python `3.14.6`"*; *"Node 24 LTS, not Node 26 while it is still Current"*; *"No silent upgrade to a newer patch or major during implementation. CI and local development use the same exact versions"*; *"Developer preference is not a reason to reopen Q12"*. PRD §45.3 (entry commands), §18.2. No Rust is written in this module, so `rust-toolchain.toml` is read-only context here. |

## Rejected alternatives

| Rejected | Why |
|---|---|
| **A hand-written TypeScript client "for better ergonomics"**, generating only the types. | `DEV-001`'s evidence is *"Generated-client diff is clean in CI"* and PRD §8.10 requires a *shared* OpenAPI-generated core. A hand-written request layer drifts silently the first time an operation changes. Replaced by **D1** — ergonomics live in a thin, tested wrapper around the generated core. |
| **Vendoring a copy of `openapi.yaml` into `sdk/python/`** so the Python build is self-contained. | Two copies of a serial-owned artifact is precisely what PRD §44.3 and breakdown plan §4.1 forbid. The generator reads the repository path; CI regenerates and diffs (**D2**). |
| **A third "shared core" package that both SDKs import.** | For TypeScript that package already exists — `packages/contracts` (`FND-04`). For Python it cannot: PRD §39.1 has no cross-language runtime. The shared thing the PRD names is the **OpenAPI document**, not a runtime library. |
| **Shipping `/internal/v1` operations in the SDKs behind a flag.** | PRD §8.11 is unconditional: internal administration *"MUST NOT be shipped in customer SDKs"*. A flag is still shipped code and still documents the surface. Replaced by **D8**. |
| **Rendering the widget in-page with Shadow DOM instead of an iframe.** | PRD §8.10 names the mechanism — *"a sandboxed iframe with a JavaScript loader and React wrapper"* — and PRD §21 declares the host page untrusted. Shadow DOM shares the host's origin, JavaScript realm, storage and CSP; the host page could read the token and the DOM directly. |
| **`postMessage(..., '*')` "because the parent origin is validated anyway".** | A wildcard target broadcasts to whatever is actually framing the widget, which in a clickjacking or nested-frame scenario is not the origin that was validated. PRD §8.10 says *exact* origin validation. Replaced by **D9**. |
| **Matching allowed origins with a prefix, suffix or wildcard subdomain pattern.** | `https://app.example.com.attacker.tld` passes a suffix test on `example.com`; `https://example.com.evil` passes a prefix test. PRD §21.1 says *"exact widget origins"*. Replaced by **D9**'s byte-equal comparison. |
| **Storing the widget session in `sessionStorage` "so a reload does not lose it".** | PRD §33.5 step 6 and §8.10 both forbid token storage. The session is ≤15 minutes (PRD §38.4); the correct recovery is the host page's `tokenProvider` calling its own backend again. Replaced by **D10**. |
| **Letting `/developer/widget` mint a session for the "try it" preview.** | The web app is cookie-authenticated and `IDNT-07` refuses a cookie principal by design. Building a browser-reachable mint path would falsify `DEV-002`. Replaced by **D16**. |
| **Accepting a `customCss` string or a `className` prop on the widget for theming.** | Any CSS string can set `display:none` on the disclaimer. PRD §8.10 requires the disclaimer, citations and product-source indicator to be non-removable. Replaced by **D11**'s closed token set plus the post-render invariant. |
| **Enforcing "synthetic only" by classifying free text in the sandbox.** | A text classifier that decides "this looks like a real question" is a new safety mechanism with no PRD basis, and it would sit *beside* the PII detector that PRD §37.2 already makes authoritative. Replaced by **D18**. |
| **A single `/v1/usage` endpoint returning one combined balance.** | PRD §16.2 names three paths (`current`, `events`, `limits`) and PRD §38.5 requires the ledgers to stay separate so *"exhausting one does not misreport the others"*. Replaced by **D19**. |
| **Giving service credentials an `audit:read` scope so integrations can pull audit events.** | PRD §38.1's service-account column for *"View audit/security events"* is a dash, and PRD §16.3's scope list has no audit scope. Adding one is a product/API change (PRD §45.5), not an implementation choice — see **Q-PLTF-6**. |
| **One combined "developer portal" ticket covering portal, screens and docs.** | Breakdown plan §7 records this module at 2 minimum waves and 6 useful lanes; collapsing tickets would move it toward the fully-serial shape §7 treats as a decomposition defect. It would also merge a `blocked_by IDNT-06 + WTCH-05` ticket with one that needs neither. |
| **Putting the widget's ten async states in `packages/ui` and importing them.** | `RUNT-06` is not on `PLTF-05`'s dependency path (breakdown plan §6.2) and the embed bundle must stay small for a third-party page. Replaced by **D12**. |
| **Making `apps/widget/react` a separate pnpm workspace member.** | It would require editing `pnpm-workspace.yaml`, a `FND-01` serial-owned root manifest (breakdown plan §4.1). Replaced by **D22**. |

## Open questions

None blocks the module's first wave. Each names an owner and the artefact that resolves it.

| # | Question | Owner | Resolved by | Blocks | Basis |
|---|---|---|---|---|---|
| **Q-PLTF-1** | **PRD §41.2 defines no `UAT-DEV-*` script.** The manual acceptance table covers `AUTH`, `SRCH`, `PII`, `ANS`, `COV`, `CMP`, `REC`, `MON`, `EXP` and `OPS` — there is no developer-platform row, although `DEV-001/002/003` are release requirements. Should §41.2 gain `UAT-DEV-01…04`? This module proposes four scripts (below) and runs them as `[human]` acceptance in the meantime. | **Founder** (PRD change, §45.5) | Gate 2 review, or a PRD amendment adding the rows | Nothing — the four proposed scripts are runnable today from this file | PRD §41.2 (absence), §30.2 `DEV-001/002/003`, §41.3 step 7, §41.4 Integration stage, §43.4 |
| **Q-PLTF-2** | **Does the root `pnpm generate` / `pnpm generated:check` reach `sdk/python`?** `DEV-001`'s CI evidence is a clean generated diff for **both** languages, but `sdk/python` is a `uv` project and may not be a pnpm workspace member. If it is not, the Python generation check must be wired into `.github/workflows/**`, which is `FND-02`'s. | `00-foundation` (`FND-01` manifest/scripts, `FND-02` workflow) with `20-developer-platform` | `PLTF-03` reports what `FND-01` actually created and raises one docs PR against `FND-01`/`FND-02` if the delegator does not reach it | Nothing — `PLTF-03` ships `uv run` entry points that work standalone; only the CI wiring is at stake | PRD §45.3 (both `pnpm generated:check` and `uv run pytest` are entry commands); PRD §20.3 (*"Rust and Python builds/tests"* is a named gate); `DEV-001` |
| **Q-PLTF-3** | **Which Python code generator?** PRD §18.2 names no Python client generator. The choice is durable (it fixes the generated API shape every customer writes against) and is therefore an **ADR candidate** under PRD §45.5 *"Architecture decision"*. | `20-developer-platform` (`PLTF-03`); **ADR candidate** | `PLTF-03` records the choice in `docs/adr/NNNN-python-sdk-codegen.md` (breakdown plan **A9**: `docs/adr/**` is per-file, claimed by the creating ticket) | Nothing — the ergonomic layer's surface is fixed by **D3**'s parity manifest whatever the generator | PRD §45.5, §18.2; breakdown plan §2.1 **A9**, §8 |
| **Q-PLTF-4** | **A product feature area cannot import a workspace package without an entry in `apps/web/package.json`, which breakdown plan §4 gives to `03-app-runtime`.** Identical in form to `14-search-product`'s **Q-FIND-1** for `apps/api/package.json`. | `03-app-runtime` (`RUNT-05`, manifest owner) with the plan | `PLTF-01` records what it appended, following whatever `Q-FIND-1` settles for `apps/api` | Nothing — the addition is at most one dependency line and `/start-all` serialises delivery | Breakdown plan §1.1 ("Package manifests"), §4, §4.1; `14-search-product` **Q-FIND-1** |
| **Q-PLTF-5** | **Who sets `Content-Security-Policy: frame-ancestors` for the widget document?** `AUTC-05`'s per-session `allowed_origins` are dynamic; the widget document is a static asset on Cloudflare Pages (PRD §39.1). Defence-in-depth at the edge would need `infra/cloudflare/**`, which is `RLSE-03`'s. | `18-ops-release` (`RLSE-03`) with `20-developer-platform` | `PLTF-05` documents the required header in `docs/api` and raises it in `docs/prd/breakdown-plan.md` §5.19 if `RLSE-03` must own a rule | Nothing — **D9**'s three exact-origin checks are the required control (PRD §8.10/§21.1); `frame-ancestors` is additional | PRD §21.1, §39.1, §39.4, §8.10; breakdown plan §4 |
| **Q-PLTF-6** | **`GET /v1/audit-events` has no scope in PRD §16.3's list, and PRD §38.1 gives the service-account column a dash.** Confirmed reading: user principals only (**D20**). If an integration genuinely needs audit export, an `audit:read` scope is a product/API change. | **Founder** (product/API change, PRD §45.5), with `00-foundation` (`FND-03`/`FND-04`) if a scope is added | `PLTF-09` implements **D20**; a change would be a docs PR against `FND-03`'s scope enum and `FND-04`'s OpenAPI first | Nothing | PRD §38.1, §16.3, §16.2, §45.5 |
| **Q-PLTF-7** | **`/developer/sandbox` appears in `DEV-003`'s route column but not in PRD §31.2's route table.** This module reads the sandbox UI as living inside `/developer/api` (whose §31.2 main action is *"Read OpenAPI/**use sandbox**"*) and `/developer/widget` (*"Synthetic questions only by default"*), and adds no fifth developer route. | **Founder** (product interpretation, PRD §45.5) | Gate 2 review; if a dedicated route is wanted it is a `PLTF-01`/`PLTF-07` amendment plus a §31.2 PRD change | Nothing — every `DEV-003` behaviour is reachable and testable through the API area and the two screens | PRD §30.2 `DEV-003`, §31.2, §20.2 |
| **Q-PLTF-8** | **PRD §16.2 lists `/v1/usage/current`, `/events`, `/limits` and `GET /v1/audit-events` but PRD §34 gives no payload example for any of them.** The binding shapes are therefore §34.1 conventions + `FND-04`'s OpenAPI + `DATA-07`'s columns. | `00-foundation` (`FND-04`) with `20-developer-platform` | `PLTF-09` conforms to `FND-04`'s generated types; a missing path is a docs PR against `FND-04`, never a locally declared type | Nothing — the same situation `IDNT-06`/`IDNT-07` already handle (their sub-PRD **D4**) | PRD §16.2, §34.1, §34.9; breakdown plan §4.1 |
| **Q-PLTF-9** | **What is the sandbox organisation's quota profile?** PRD §20.2 requires isolation and `DEV-003` requires "low quota", but no numeric table exists for a sandbox. This module uses the PRD §24.2 **trial** limits as committed configuration defaults (PRD §39.6 layer 1), which are the lowest published set. | **Founder** (commercial limit, PRD §45.5) with `20-developer-platform` | `PLTF-04` ships the trial numbers as configuration; a change is a config edit, not a code change | Nothing | PRD §24.2, §20.2, §38.5, §39.6, §45.5 |

### Proposed `UAT-DEV-*` scripts (this module's reading of Q-PLTF-1 — **not PRD text**)

| Proposed ID | Setup/action | Expected result | Requirement |
|---|---|---|---|
| `UAT-DEV-01` | Regenerate both SDK cores from `schemas/openapi/openapi.yaml`, then run the sample integration in each language against recorded responses | `pnpm generate && pnpm generated:check` and the Python equivalent both leave an empty `git status --porcelain`; both samples complete search → answer → wait → webhook verify | `DEV-001` |
| `UAT-DEV-02` | Embed the widget on a local host page using a session minted by a simulated customer backend; inspect storage and the network log; then load the same page from an origin **not** in `allowed_origins` | No long-lived credential anywhere in the page, storage or any request; the widget session appears in no storage; the second origin is refused `ORIGIN_NOT_ALLOWED` and renders nothing | `DEV-002` |
| `UAT-DEV-03` | Provision a sandbox organisation, run a synthetic answer, then attempt to read a production Research Record id with the sandbox credential and vice versa | Sandbox responses and events are labelled `SANDBOX`; both cross-organisation reads return an identical `404 RESOURCE_NOT_FOUND`; sandbox quotas are the low profile | `DEV-003` |
| `UAT-DEV-04` | Apply the most aggressive legal theme available (all tokens set to the background colour, smallest scale) and render an answer in the widget and in the React wrapper | The disclaimer, the citation list and the product-source indicator remain present, sized and readable; if the invariant cannot be satisfied the widget refuses to render the answer | `DEV-002`, PRD §8.10, §11.2 |

## Work breakdown

Lane is `20-developer-platform` and agent is `builder` for all nine tickets (breakdown plan §1.1).
File-scopes are relative to the repository root, are exactly breakdown plan §5.21 (plus the area
entry-file refinements noted below, all inside the module's §4 write-owns row), and are disjoint
between tickets that can run concurrently. `depends-on` is exactly breakdown plan §5.21.

| Ticket | Size | Lane | File-scope (write-owns) | Depends on |
|---|---|---|---|---|
| [`PLTF-01`](tickets/PLTF-01-api-reference-and-developer-portal-screens.md) — API reference and developer portal screens | M | `20-developer-platform` | `apps/web/src/features/developer/{feature.tsx,section-contract.ts,section-registry.ts,developer-context.ts}` + `apps/web/src/features/developer/api/**` + `docs/api/**` | `RUNT-05`, `FND-04` |
| [`PLTF-02`](tickets/PLTF-02-typescript-sdk.md) — TypeScript SDK | L | `20-developer-platform` | `packages/sdk-typescript/**` (incl. its manifest, `examples/**`, `parity/**`) | `FND-04`, `FND-05` |
| [`PLTF-03`](tickets/PLTF-03-python-sdk.md) — Python SDK | L | `20-developer-platform` | `sdk/python/**` (incl. `pyproject.toml`, `examples/**`, `tests/**`) | `FND-04`, `FND-05` |
| [`PLTF-04`](tickets/PLTF-04-sandbox-organisation.md) — Sandbox organisation | M | `20-developer-platform` | `apps/api/src/routes/sandbox/**`, `apps/api/test/routes/sandbox/**` | `RUNT-02`, `IDNT-06` |
| [`PLTF-05`](tickets/PLTF-05-widget-loader-and-sandboxed-iframe.md) — Widget loader and sandboxed iframe | L | `20-developer-platform` | `apps/widget/**` **except** `apps/widget/react/**` (incl. `apps/widget/package.json`) | `IDNT-07`, `FIND-01`, `ASK-01` |
| [`PLTF-06`](tickets/PLTF-06-react-wrapper.md) — React wrapper | M | `20-developer-platform` | `apps/widget/react/**`; append-only `apps/widget/package.json` | `PLTF-05` |
| [`PLTF-07`](tickets/PLTF-07-service-account-webhook-and-widget-developer-screens.md) — Service-account, webhook and widget developer screens | L | `20-developer-platform` | `apps/web/src/features/developer/{service-accounts,webhooks,widget}/**` | `PLTF-01`, `IDNT-06`, `WTCH-05` |
| [`PLTF-08`](tickets/PLTF-08-usage-and-limits-screens.md) — Usage and limits screens | M | `20-developer-platform` | `apps/web/src/features/usage/**` (incl. its `feature.tsx`) | `PLTF-09`, `RUNT-05` |
| [`PLTF-09`](tickets/PLTF-09-usage-limits-and-audit-endpoints.md) — Usage, limits and audit endpoints | M | `20-developer-platform` | `apps/api/src/routes/{usage,audit-events}/**`, `apps/api/test/routes/{usage,audit-events}/**` | `RUNT-02`, `DATA-07` |

**Three file-scope refinements this sub-PRD records** (all inside the module's §4 write-owns row,
all disjoint from every sibling ticket, none a new path outside the plan):

- The **area-level files of the `developer` feature** — `feature.tsx`, `section-contract.ts`,
  `section-registry.ts`, `developer-context.ts` — belong to **`PLTF-01`** (**D13**). `RUNT-05`'s A1
  contract requires exactly one `feature.tsx` per area, and breakdown plan §5.21 places all four
  `/developer/*` screens inside the single `developer` area. `PLTF-07` is `blocked_by PLTF-01`, so
  they are never concurrent, and `PLTF-07` still writes **only** its three sub-directories because
  the section registry discovers `./*/section.tsx` by glob.
- `apps/web/src/features/usage/feature.tsx` belongs to **`PLTF-08`**, the only ticket in that area
  (**D14**).
- `apps/widget/package.json` belongs to **`PLTF-05`**, which declares the `"./react"` export up
  front; `PLTF-06` appends only its own build wiring (**D22**, breakdown plan §1.1 append-only rule).

Standing module-owned manifests (breakdown plan §1.1: *"each module owns its members' manifests;
within a module a manifest is append-only shared"*):

- `packages/sdk-typescript/package.json` — `PLTF-02` only.
- `sdk/python/pyproject.toml` — `PLTF-03` only.
- `apps/widget/package.json` — `PLTF-05`, appended by `PLTF-06` (never concurrent).
- `apps/api/package.json` and `apps/web/package.json` are **other modules'** manifests: append-only
  and only if unavoidable, per **Q-PLTF-4**. `pnpm-lock.yaml` is regenerated as a build artifact
  (`corepack pnpm install`, which resolves pnpm `11.4.0` from `package.json#packageManager`), never
  hand-merged (breakdown plan §4.1); `uv.lock` behaves the same way for `sdk/python`'s dependencies
  under the pinned Python `3.14.6`. None of this module's manifests sets a toolchain version
  (**D24**).

Wave shape (breakdown plan §7: **2 minimum waves, 6 useful lanes, not fully serial**). External
blockers in brackets:

```text
wave 1  PLTF-01 [RUNT-05, FND-04] | PLTF-02 [FND-04, FND-05] | PLTF-03 [FND-04, FND-05]
        PLTF-04 [RUNT-02, IDNT-06] | PLTF-05 [IDNT-07, FIND-01, ASK-01] | PLTF-09 [RUNT-02, DATA-07]
wave 2  PLTF-06 | PLTF-07 [IDNT-06, WTCH-05] | PLTF-08 [RUNT-05]
```

## Acceptance — what makes the whole module done

The module is done when all nine tickets are delivered (`/verify-delivery` green each) **and**:

1. **`DEV-001` — OpenAPI drives TypeScript/Python generated cores; the generated-client diff is
   clean in CI.** `pnpm generate && pnpm generated:check` and the Python generation check both exit
   0 and leave `git status --porcelain` empty on the merged default branch; a hand-edit to any
   generated file in `packages/sdk-typescript/**` or `sdk/python/src/**/_generated/**` is detected;
   the two SDKs' public surfaces agree with the committed parity manifest (**D3**). The
   `/developer/api` reference renders the same endpoint set as `FND-04`'s
   `prd-16-2-endpoints.json` fixture, and `docs/api/reference/**` is generated, not transcribed
   (**D23**). (PRD §30.2 `DEV-001`; §8.10; §20.1; §34 preamble.)
2. **`DEV-002` — the widget uses short-lived, origin-bound sessions from the customer backend, and
   the long-lived key never appears in browser storage or the network fixture.** Nothing in
   `apps/widget/**` or `apps/web/src/features/developer/**` can send a service credential to a
   browser-reachable endpoint; the widget session is absent from `localStorage`, `sessionStorage`,
   cookies, IndexedDB, Cache Storage, the iframe URL and every `postMessage` payload; an origin
   outside `allowed_origins` — including a prefix, suffix and wildcard near-miss — is refused, and
   the widget renders nothing. (PRD §30.2 `DEV-002`; §8.10; §33.5; §38.4; §21.1; **D9**, **D10**,
   **D16**.)
3. **`DEV-003` — the sandbox is tenant-isolated, low quota and synthetic by default; sandbox
   webhook/events are labelled and cannot reach production records.** A provisioned sandbox
   organisation carries `environment: SANDBOX` on every response, is seeded with the committed
   synthetic dataset, is configured to the PRD §24.2 trial limits, and cannot read or write any
   production organisation's resource — cross-organisation reads return byte-identical
   `404 RESOURCE_NOT_FOUND`. (PRD §30.2 `DEV-003`; §20.2; §21.2; **D17**, **D18**.)
4. **`AUTH-006` — the screen half.** `/developer/service-accounts` creates, rotates and revokes
   through `IDNT-06`'s routes; the secret is displayed exactly once with the one-time warning, is
   never re-displayed, never cached, never in a URL and never in client storage; rotation states the
   overlap window and requires a reason; a stale `ETag` shows the 409 reload guidance. (PRD §30.2
   `AUTH-006`; §32.8 *"Secrets are never redisplayed"*; §38.4.)
5. **PRD §8.10's widget clauses hold mechanically.** The iframe carries the declared `sandbox`
   attribute set with `allow-top-navigation`, `allow-popups`, `allow-modals`, `allow-downloads` and
   `allow-pointer-lock` **absent**; every `postMessage` uses an exact `targetOrigin`; every inbound
   message is origin-checked, source-checked and schema-validated; and `assertProtectedRegionsVisible()`
   passes for every theme in the fuzz set — including the adversarial "all tokens equal to the
   background" case — or the widget refuses to render the answer. (PRD §8.10; §11.2; **D9**,
   **D11**.)
6. **PRD §8.10's telemetry clause holds mechanically.** With telemetry enabled, a canary research
   question, canary facts, a canary answer string and a canary citation quote appear in **no**
   telemetry record emitted by either SDK or by the widget; `assertTelemetrySafe` rejects any key
   outside the closed allowlist. (PRD §8.10 *"SDK telemetry MUST NOT contain research content"*;
   §22; §41.1; **D7**.)
7. **`OPS-003` — the visibility half.** `/usage` shows the five operation ledgers and the two
   funding ledgers separately with reset times, explains Search versus generation charging, and is
   never a combined total; `/v1/usage/*` computes from ledger entries and discloses no other
   tenant's counters. Enforcement of the 90%/100% stops remains `EVID-08`'s and the global console
   remains `INTL-07`'s. (PRD §30.2 `OPS-003`; §38.5; §24.4; §42.6; **D19**.)
8. **`SEC-001` tenant isolation across this module's API areas.** For `sandbox`, `usage` and
   `audit-events`, another organisation's id and an absent id return byte-identical
   `404 RESOURCE_NOT_FOUND` bodies apart from `request_id`; an architecture assertion finds no
   unscoped `packages/database` import in any of the three areas. `ASSR-01` (`blocked_by PLTF-09`)
   confirms this repo-wide rather than discovering it. (PRD §21.2; §16.5; breakdown plan §9 **R8**.)
9. **PRD §13.1 accessibility and PRD §41.1 universal UI acceptance** on `/developer/*`, `/usage`,
   the widget and the React wrapper: WCAG 2.2 AA at 360 px, 768 px and 1280 px, complete keyboard
   operation with visible focus, one programmatic page heading per screen, labelled fields, error
   summaries, live regions for asynchronous status, colour never the only signal, and no research
   content in a URL, a page title or browser error telemetry. (PRD §13.1 — *"Web and widget MUST
   support keyboard navigation, visible focus, screen-reader labels, contrast and responsive
   layouts"*; §41.1; §31.3.)
10. **The `[human]` acceptance runs.** PRD §41.2 contains no `UAT-DEV-*` row (**Q-PLTF-1**), so this
    module's human acceptance is: the four proposed `UAT-DEV-01…04` scripts above; PRD §41.3 step 7
    (*"One minute — platform: show API request, widget sandbox, usage limit and security/retention
    settings"*); PRD §41.4's Integration stage exit condition *"No long-lived browser secret"*; the
    PRD §43.4 founder review queue; and the CLAUDE.md Gate 2 smoke test. Every automatable part is
    already `[machine]`/`[fixture]` inside the tickets; `ASSR-06` automates what belongs in
    `tests/e2e/uat/**`.
11. **Every `[machine]`/`[fixture]` item reproduces offline** — no network, no live API, no browser
    against a real origin: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm generate &&
    pnpm generated:check` and `uv run pytest` green on the merged default branch, run on `FND-01`'s
    pinned toolchain — Node `24.18.0`, pnpm `11.4.0` and Python `3.14.6`, the same versions CI uses
    (**D24**) — with all HTTP replayed from `schemas/openapi/examples/**`,
    `packages/contracts/test/events/fixtures/**` and each ticket's own recorded-response set
    (PRD §20.3; §45.3).

## Changelog

- **v0.2 — 2026-08-03** — `docs/prd/breakdown-plan.md` §8 is now a decision register, and **Q12
  (exact toolchain versions) is CONFIRMED**: Node.js `24.18.0`, pnpm `11.4.0`, Rust `1.97.1`,
  Python `3.14.6`, pinned by `FND-01` in `.node-version`, `package.json#packageManager`,
  `package.json#engines.node`, `rust-toolchain.toml`, `pyproject.toml#requires-python` and the
  lockfiles. Adds **D24** recording how those pins apply here, and rewrites the four tickets that
  still framed the toolchain as unpinned: `PLTF-02` (Node/pnpm floor and single-version build/test
  matrix), `PLTF-03` (Python `3.14.6`, `uv` retained as the toolchain), `PLTF-05` (widget build)
  and `PLTF-06` (React, which was previously cited to Q12 although Q12 pins no library version).
  No scope, requirement, quality gate, decision or ticket dependency changes; `PLTF-09` needed no
  change; **Q-PLTF-1 … Q-PLTF-9 all remain open**.
- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.21 (9 tickets,
  `PLTF-01` … `PLTF-09`). Records decisions D1–D23, rejects 15 alternatives, and opens Q-PLTF-1 …
  Q-PLTF-9. Two items are flagged beyond ordinary build decisions: **Q-PLTF-1** records that PRD
  §41.2 defines **no** `UAT-DEV-*` script and proposes four (Founder-owned PRD change), and
  **Q-PLTF-3** flags the Python code-generator choice as an **ADR candidate** under PRD §45.5, to be
  recorded by `PLTF-03` at `docs/adr/NNNN-python-sdk-codegen.md` per breakdown plan **A9**. No other
  ADR is proposed: every decision above is a build decision against an existing PRD sentence or an
  existing breakdown-plan decision (A1, A3, A6, A9).
