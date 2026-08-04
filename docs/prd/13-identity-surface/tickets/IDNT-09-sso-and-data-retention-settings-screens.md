---
id: IDNT-09
title: SSO and data/retention settings screens
module: 13-identity-surface
lane: 13-identity-surface
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-05, IDNT-05]
blocks: []
---

# IDNT-09 — SSO and data/retention settings screens

Implements PRD §31.2 (route table), §10.3 (durable retention) and §41.1 (universal UI acceptance),
carrying the screen half of requirement `AUTH-005` ("SAML/OIDC is testable before enforcement;
break-glass Owner remains"). **No ADR — the decision is already made in PRD §31.2, §38.3 and §10.3;
this is build ticket 9 of 9 against it.**
Parent sub-PRD: [13-identity-surface README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `RUNT-05` — Web app shell ([`03-app-runtime`](../../03-app-runtime/README.md));
[`IDNT-05` — SSO connection routes (draft/test/activate/disable)](IDNT-05-sso-connection-routes-draft-test-activate-disable.md).
**Why `builder`:** a bounded change inside one module's declared file-scope, composing `packages/ui`
primitives and `IDNT-05`'s endpoints against screen contracts PRD §31.2/§41.1 already enumerate — not a
new subsystem decision.

## Background + basis

**The two routes and their first-use states are fixed.** PRD §31.2:

> | `/settings/sso` | SSO | **Owner/Admin** | Draft/test/activate | **Cannot enforce before successful
> test** |
> | `/settings/data` | Retention/export/closure | **Owner/Admin** | Manage lifecycle | **Exact deletion
> and backup ageing shown** |

plan §5.14's goal for this ticket restates the second: *"Exact deletion and backup-ageing behaviour
**shown**."*

**The retention numbers this screen must show are normative.** PRD §10.3, in full:

> - Research Records and Answer Snapshots: **until customer deletion or organisation closure**.
> - Ordinary application logs: **14 days**.
> - Security and audit events: **12 months**.
> - Deleted customer records: **30-day recoverable period, then primary deletion**.
> - **Deleted data in backups: ages out within a further maximum of 30 days.**
> - Organisation closure: **export followed by deletion within 30 days**.
> - API request/response bodies: **not logged by default**.
> - Public legal sources and non-customer evaluation data: may be retained long term.

PRD §10.4 adds the ephemeral half a customer must understand: *"Ephemeral content … MUST expire one
hour after completion/failure/cancellation and no later than 24 hours after creation. It MUST NOT enter
Litestream, daily/weekly backups, exports or support tools. After expiry return
`410 EPHEMERAL_CONTENT_EXPIRED`."*

**The SSO lifecycle the screen drives.** PRD §16.3: *"SSO connection states: `DRAFT`, `TESTING`,
`ACTIVE`, `ERROR`, `DISABLED`. **SSO cannot be enforced before a successful test.** A tightly
controlled MFA-protected Owner break-glass account MUST remain available…"* PRD §38.3 step 5:
*"Enforcement requires recent MFA, successful test and acknowledgement of the break-glass path."*
Step 6: *"Error disables new SSO logins according to safe policy but does not delete configuration or
block break-glass access."*

**The requirement and its manual acceptance script.** PRD §30.2:

> | AUTH-005 | SAML/OIDC is testable before enforcement; break-glass Owner remains | `/settings/sso` |
> SSO endpoints | App | **Failed IdP test cannot lock out the organisation** |

PRD §41.2:

> | `UAT-AUTH-04` | Owner enables SSO before test | **Action blocked with exact test requirement and
> break-glass explanation** |

`IDNT-05` deliverable 4 already returns everything needed to render that: the redacted connection with
`tested_at`, `tested_config_current`, `enforced_at` and `enforcement_readiness: { can_enforce, reasons }`
whose reasons are exactly `TEST_REQUIRED | STALE_TEST | NOT_ACTIVE | RECENT_AUTH_REQUIRED |
BREAK_GLASS_NOT_ACKNOWLEDGED | NO_BREAK_GLASS_PATH`, each with a plain-language message.

**Accessibility is a release target.** PRD §13.1: *"**WCAG 2.2 AA is the release target.** Web and
widget MUST support keyboard navigation, visible focus, screen-reader labels, contrast and responsive
layouts."* PRD §41.1's universal list applies in full — 360/768/1280 px, complete keyboard operation
with visible focus, one programmatic page heading, labelled fields, error summaries, live regions,
colour never the only status signal, `3 Aug 2026` dates, **destructive/security-sensitive actions name
exact effect and recovery**, copyable request ids, no research content in URLs/titles/telemetry, and
refresh/back/forward never duplicating writes.

**The browser is never the enforcement point.** PRD §45.2: `apps/web` owns *"Screen
contracts/accessibility/client state"* and must not own *"Security-boundary PII or tenant
enforcement"*. Every refusal this screen shows comes from `IDNT-05`'s response; the screen encodes no
lifecycle rule (plan §9 **R5**).

**Registration.** `RUNT-05`'s A1 web contract puts feature areas one level under
`apps/web/src/features/`, and `IDNT-08` owns the single `features/settings/feature.tsx`. This ticket
adds two **settings sub-areas** under the contract `IDNT-08` publishes (sub-PRD **D7**), reproduced here
so this ticket is executable without reading `IDNT-08`:

> **1. Discovery.** Every immediate child directory of `apps/web/src/features/settings/` other than
> `_shell` is a settings sub-area, discovered by
> `import.meta.glob('../*/sub-feature.tsx', { eager: true })` in
> `apps/web/src/features/settings/_shell/sub-area-registry.ts` — a pattern, not a list.
> **2. Required entry file.** `sub-feature.tsx` with a default export of `SettingsSubArea` from
> `_shell/sub-area-contract.ts`: `{ id (= directory name), path, label, element, visibleWhen(ctx),
> order?, onOrganizationChange? }`.
> **3.** Sub-navigation renders by `order` then `id`; a duplicate `id` or `path` fails the build naming
> both.
> **5. Stability guarantee.** Adding a settings sub-area produces **zero** diff outside that sub-area's
> own directory; `apps/web/test/features/settings/sub-area-conformance.tsx` (exported by `IDNT-08`)
> asserts it.

**Accepted caveats carried forward, documented not enforced here:**

- **`/settings/data` is display-and-explain only in phase 1.** PRD §31.2's main action says *"Manage
  lifecycle"*, but PRD §16.2/§16.3 define no retention, export or closure endpoint and plan §5.14
  allocates no route ticket for one. This is sub-PRD **OQ6** (Founder + plan owner). Export **jobs** are
  `19-exports` (`XPRT-01`, not in this module) and organisation closure has no API. This screen
  therefore shows the exact PRD §10.3/§10.4 behaviour and routes a closure or export request to the
  PRD §13.3 support path, and states the gap on its PR (PRD §45.4).
- **Nothing provisions the break-glass Owner path.** Sub-PRD **OQ7** (Founder). This screen **displays**
  whether a break-glass path exists — which is what `UAT-AUTH-04` needs — and explains what to do when
  it does not; it does not create one.
- **No `packages/ui` duplication.** If a primitive is missing, use `RUNT-05`'s documented
  semantic-markup fallback and raise it against `RUNT-06` (breakdown-plan **A6**).
- **The toolchain is pinned; the router/data-fetching choice is not this ticket's.** plan §8 **Q12** is
  CONFIRMED — Node.js `24.18.0`, pnpm `11.4.0`, Rust `1.97.1`, Python `3.14.6`, committed by `FND-01`
  (sub-PRD **D13**) — so this ticket states no version literal and selects no version. The router and
  data-fetching library remain `03-app-runtime` **QR2**, resolved by `RUNT-05`.

## Goal

Produce the `sso` and `data` settings sub-areas at `apps/web/src/features/settings/{sso,data}/**`,
serving `/settings/sso` and `/settings/data`, composed from `packages/ui` primitives and `IDNT-05`'s
endpoints under `IDNT-08`'s sub-area contract. Completion is mechanically checkable: both sub-areas
register by directory with zero diff outside themselves — in particular without editing
`features/settings/feature.tsx` or `_shell/**`; the SSO screen shows every outstanding enforcement
condition **before** the user attempts enforcement and renders the server's refusal verbatim when they
do, including the break-glass explanation; no client secret or key material is ever rendered; the data
screen states every PRD §10.3 duration and the PRD §10.4 ephemeral behaviour verbatim; and an automated
WCAG 2.2 AA pass over both screens at 360 px, 768 px and 1280 px reports zero violations.

## Non-goals

- **No API endpoints.** `/v1/sso/**` is `IDNT-05`. This ticket adds none, and it must not call an
  endpoint that does not exist.
- **No settings frame, sub-navigation, `feature.tsx` or `_shell`.** `IDNT-08` owns them; this ticket
  **imports** the sub-area contract and the frame, and writes neither (sub-PRD **D7**).
- **No app shell, navigation, organisation switcher or client cache mechanics.**
  `apps/web/src/{app,shell,lib}/**` is `RUNT-05`.
- **No shared UI components.** `packages/ui` is `RUNT-06` (breakdown-plan **A6**).
- **No `/settings/members` or `/settings/security`, no `/login` or `/accept-invite`.** `IDNT-08`.
- **No retention, export or closure *write* API, and no client-side deletion.** sub-PRD **OQ6**; export
  jobs are `19-exports` (`XPRT-01`). Do not invent an endpoint or call an unspecified one.
- **No SSO lifecycle rules in the browser.** Every state transition, guard and refusal comes from
  `IDNT-05` (PRD §45.2; plan §9 **R5**).
- **No legal or policy documents.** `docs/policies/**` and `apps/web/src/features/legal/**` are
  `24-launch` (`LNCH-01`, `LNCH-02`). This screen may link to them once they exist and must degrade
  gracefully until then.
- **No cross-boundary E2E or accessibility suite.** `tests/e2e/**` is `23-assurance` (`ASSR-06`,
  `ASSR-07`). This ticket carries its own co-located checks (plan §9 **R8**).

## File-scope (write-owns)

- `apps/web/src/features/settings/sso/**` — including `sub-feature.tsx`, the `SettingsSubArea` entry
  file required by `IDNT-08`'s contract.
- `apps/web/src/features/settings/data/**` — including `sub-feature.tsx`.
- `apps/web/test/features/settings/{sso,data}/**` — this ticket's own component/integration tests and
  its committed synthetic fixtures (plan §1.1).
- `apps/web/package.json` — **append-only** if a dependency is required (plan §1.1).

Does not touch:

- `apps/web/src/features/settings/feature.tsx`, `apps/web/src/features/settings/_shell/**`,
  `apps/web/src/features/settings/{members,security}/**`, `apps/web/src/features/auth/**` — `IDNT-08`.
  This ticket imports `_shell/sub-area-contract.ts` and reuses
  `apps/web/test/features/settings/sub-area-conformance.tsx`; it writes neither.
- `apps/web/src/{app,shell,lib}/**`, `apps/web/index.html`, `apps/web/vite.config.ts`,
  `apps/web/src/features/home/**` — `RUNT-05`.
- `apps/web/src/features/{search,sources,ask,answers,coverage,compare,monitor,records,exports,developer,usage,legal}/**`
  and `apps/web/public-site/**` — `14`, `15`, `16`, `17`, `19`, `20`, `24` (plan §4).
- `packages/ui/**` — `RUNT-06`; `packages/contracts/**`, `schemas/openapi/**` — `00-foundation`;
  `packages/auth/**`, `packages/database/**`, `packages/domain/**` — `02-auth-core`, `01-app-data`,
  `00-foundation`.
- `apps/api/**` — `RUNT-01`…`RUNT-03`, `RUNT-08` and `IDNT-01`…`IDNT-07`. `apps/worker/**`,
  `apps/admin/**`, `apps/widget/**` — `RUNT-04`, `22-internal-admin`, `20-developer-platform`.
- `infra/**`, `tests/**`, `docs/policies/**`, root manifests, lockfiles, `.github/workflows/**`.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, no in-flight
ticket), so nothing has previously written these paths and nothing contends for them. This ticket and
`IDNT-08` are both wave 3 with **no** edge between them, so they may run concurrently; sub-PRD **D7**'s
nested sub-area glob is exactly what keeps their write-sets disjoint — `IDNT-08` writes
`features/settings/{feature.tsx,_shell,members,security}` and this ticket writes only
`features/settings/{sso,data}`, and neither appears in the other's tree. Because discovery is a glob and
not a list, adding these two directories changes no file `IDNT-08` owns (`IDNT-08`'s contract §5). The
third wave-3 ticket, `IDNT-07`, writes `apps/api/src/routes/widget-sessions/**` — a different tree.
`apps/web/package.json` is append-only shared (plan §1.1). **If the glob proves unworkable
(sub-PRD OQ2), this ticket must not fall back to editing `feature.tsx`** — see the Feedback obligation.

## Deliverables

1. **`apps/web/src/features/settings/sso/sub-feature.tsx`** — a conforming `SettingsSubArea`:
   `id: 'sso'`, `path: '/settings/sso'`, `label: 'Single sign-on'`, `order` placing it after
   `security`, and `visibleWhen` reading the server's permissions response for PRD §38.1's *"Configure
   SSO/enforce MFA"* action (Owner/Admin — PRD §31.2). It encodes no role literal.
2. **`/settings/sso` — connection state.** Renders `IDNT-05`'s redacted connection: protocol, the
   current state from the five PRD §16.3 values as a **text + icon** badge (PRD §41.1 "colour is never
   the only status signal"), `tested_at` rendered `3 Aug 2026`, whether the test is **current**
   (`tested_config_current`), `enforced_at`, JIT settings and verified domains, and the public
   configuration fields only. **No client secret, private key, certificate body, raw metadata document,
   assertion or ID token is ever rendered** — `IDNT-05` does not return them and this screen must not
   ask for them back (PRD §32.8 *"Secrets are never redisplayed"*; PRD §21.1).
3. **`/settings/sso` — the lifecycle walk (PRD §38.3 steps 1–7).** Draft creation and editing (with an
   explicit warning, rendered **before** submission, that editing clears the tested state and returns
   the connection to `DRAFT` — `IDNT-05` deliverable 5); start test; render the test callback's mapping
   report (subject, domain, mapped claims, mapped role, verified domain) so the operator can see what
   the IdP returned; activate; enforce; disable with an explicit choice of whether to revoke sessions.
   Each mutating action uses `packages/ui`'s `DestructiveAction`, which refuses to render without the
   exact effect and the recovery path as text (PRD §41.1).
4. **`/settings/sso` — `UAT-AUTH-04`, the load-bearing screen behaviour.** The enforce control renders
   `enforcement_readiness` **before** the user acts: every outstanding condition is listed with its
   plain-language message — the exact test requirement (`TEST_REQUIRED` / `STALE_TEST`), the state
   requirement (`NOT_ACTIVE`), the recent-MFA requirement (`RECENT_AUTH_REQUIRED`) and the **break-glass
   explanation** (`BREAK_GLASS_NOT_ACKNOWLEDGED` / `NO_BREAK_GLASS_PATH`). Acknowledging the break-glass
   path is an explicit, separately labelled confirmation, never a pre-checked box (PRD §38.3 step 5). If
   the user enforces anyway, the server's refusal body is rendered **verbatim** (PRD §45.2 — the browser
   is not the authority). The screen states permanently, in every state, that the break-glass Owner path
   remains available and that an `ERROR` state does not block it (PRD §16.3, §38.3 step 6).
5. **`/settings/sso` — first-use state.** With no connection, the screen renders PRD §31.2's *"Cannot
   enforce before successful test"* as the empty state, explaining the DRAFT → TESTING → ACTIVE →
   enforcement sequence in that order.
6. **`apps/web/src/features/settings/data/sub-feature.tsx`** — a conforming `SettingsSubArea`:
   `id: 'data'`, `path: '/settings/data'`, `label: 'Data and retention'`, `visibleWhen` reading the
   permissions response for PRD §38.1's Owner-only *"Configure retention/closure"* action (PRD §31.2
   gives the route to Owner/Admin; the screen shows the same content to both and marks Owner-only
   actions as such, taking that distinction from the server's permissions response, not from a local
   rule).
7. **`/settings/data` — the retention schedule, verbatim.** A single table stating each PRD §10.3 row
   with its exact duration: Research Records and Answer Snapshots until deletion or closure; application
   logs 14 days; security and audit events 12 months; deleted customer records 30-day recoverable then
   primary deletion; **deleted data in backups ages out within a further maximum of 30 days**;
   organisation closure export then deletion within 30 days; API request/response bodies not logged by
   default; public legal sources retained long term. Every number is rendered from a **single committed
   constant table** in this sub-area citing PRD §10.3 line by line, so a drifted value is a visible
   diff. This is plan §5.14's goal — *"Exact deletion and backup-ageing behaviour shown"* — and PRD
   §31.2's first-use state.
8. **`/settings/data` — ephemeral behaviour.** A second section stating PRD §10.4: ephemeral content
   expires one hour after a terminal state and no later than 24 hours after creation; it never enters
   backups, exports or support tools; after expiry the API returns `410 EPHEMERAL_CONTENT_EXPIRED`
   (PRD §34.9); durable audit, export, review, version comparison and change alerts require `SAVE` mode
   (PRD §10.4 closing line).
9. **`/settings/data` — requests, not writes (sub-PRD OQ6).** Export and organisation closure are
   presented as **explicit requests** through the PRD §13.3 support path (email and in-app issue
   reporting), each stating exactly what will happen and in what timeframe per PRD §10.3, with a
   copyable `request_id`. The screen must **not** call an endpoint that does not exist and must **not**
   imply a self-service deletion that is not implemented; the limitation is stated on the screen in
   plain language (PRD §41.1 "destructive/security-sensitive actions name exact effect and recovery"
   applies to the *absence* of the action too).
10. **Async state handling.** Every asynchronous interaction renders through `packages/ui`'s
    `JobStateView` or the equivalent primitive — no bare spinner (PRD §31.3) — and status is announced
    through the shell's live region (PRD §41.1).
11. **Organisation scoping.** Every cached value is keyed with `RUNT-05`'s `orgScopedKey(...)` and each
    sub-area implements `onOrganizationChange` to drop it; the SSO configuration form registers with
    `registerDirtyForm` so an organisation switch requires explicit confirmation (`RUNT-05` contract §5;
    PRD §31.1).
12. **No content in URLs, titles or telemetry.** No configuration value, domain, subject, claim or
    `request_id`-bearing error text is placed in a query string, `document.title` or a telemetry payload
    (PRD §41.1, §22).
13. **Committed synthetic fixtures** under `apps/web/test/features/settings/{sso,data}/fixtures/**` for
    every state this screen renders: no connection; `DRAFT`; `TESTING` with and without a successful
    test; `ACTIVE` with a **current** test; `ACTIVE` with a **stale** test; `ACTIVE` enforced; `ERROR`;
    `DISABLED`; and one `enforcement_readiness` fixture per refusal reason including
    `NO_BREAK_GLASS_PATH`. All synthetic — no real IdP metadata, keys or customer content
    (PRD §45.1 item 6).

## Acceptance checklist (classified)

- [ ] `[machine]` Both sub-areas register their routes and sub-navigation entries with **zero** diff to
      any tracked file outside their own directories — in particular no change to
      `features/settings/feature.tsx` or `_shell/**` — asserted with `IDNT-08`'s exported
      `apps/web/test/features/settings/sub-area-conformance.tsx` (sub-PRD **D7**; plan **A1**)
- [ ] `[machine]` Each `sub-feature.tsx` default-exports a valid `SettingsSubArea` whose `id` equals its
      directory name; a duplicate `id` or `path` fails the build naming both (`IDNT-08` contract §2/§3)
- [ ] `[machine]` **`UAT-AUTH-04` (screen half):** with the "no test" fixture the enforce control shows
      the exact test requirement **and** the break-glass explanation before the user acts; the same for
      `STALE_TEST`, `NOT_ACTIVE`, `RECENT_AUTH_REQUIRED`, `BREAK_GLASS_NOT_ACKNOWLEDGED` and
      `NO_BREAK_GLASS_PATH`; when enforcement is attempted anyway the server's refusal renders verbatim
      (PRD §41.2, §38.3 step 5; `AUTH-005`)
- [ ] `[machine]` The break-glass availability statement is present in **all five** connection states,
      including `ERROR` and `ACTIVE` with enforcement (PRD §16.3, §38.3 step 6; `AUTH-005` *"Failed IdP
      test cannot lock out the organisation"*)
- [ ] `[machine]` Break-glass acknowledgement is an explicit, separately labelled confirmation and is
      never pre-checked or defaulted to true (PRD §38.3 step 5)
- [ ] `[machine]` Editing configuration renders the "this clears the tested state and returns the
      connection to DRAFT" warning **before** submission, and the screen reflects the cleared state
      afterwards (PRD §35.4 *"successful current test"*; `IDNT-05` deliverable 5)
- [ ] `[machine]` **No key material rendered:** with a fixture whose configuration carries a
      `secret-canary-<uuid>` in every secret-bearing field, the canary is absent from the rendered DOM,
      from `location.href`, from `document.title` and from the telemetry buffer (PRD §21.1, §32.8, §22)
- [ ] `[machine]` The connection state is rendered as text **plus** an icon/shape, never colour alone,
      for all five PRD §16.3 states (PRD §41.1)
- [ ] `[machine]` **PRD §10.3 verbatim:** `/settings/data` renders every one of the eight PRD §10.3 rows
      with its exact duration, asserted against a literal expectation table transcribed from the PRD in
      the test — including *"Deleted data in backups: ages out within a further maximum of 30 days"*
      (PRD §31.2 first-use state *"Exact deletion and backup ageing shown"*; plan §5.14 goal)
- [ ] `[machine]` **PRD §10.4 shown:** the ephemeral section states the one-hour and 24-hour expiries,
      the exclusion from backups/exports/support tools, `410 EPHEMERAL_CONTENT_EXPIRED` and the `SAVE`
      requirement for durable audit/export/review/comparison/alerts (PRD §10.4, §34.9)
- [ ] `[machine]` `/settings/data` calls **no** endpoint that does not exist: a network assertion
      records every request the screen makes and compares it to a literal allowlist of `IDNT-05`- and
      `IDNT-01`/`IDNT-03`-owned paths (sub-PRD **OQ6**)
- [ ] `[machine]` **WCAG 2.2 AA:** an automated accessibility pass (`packages/ui/test/a11y.ts`, the
      harness `RUNT-06` exports) over `/settings/sso` and `/settings/data` at **360 px, 768 px and
      1280 px** reports **zero** violations (PRD §13.1, §41.1)
- [ ] `[machine]` Complete keyboard operation with visible focus and logical order; exactly **one**
      programmatic `<h1>` per screen; every field labelled; validation errors surface in an
      `ErrorSummary`; asynchronous status announced through an `aria-live` region (PRD §13.1, §41.1)
- [ ] `[machine]` Dates render as `3 Aug 2026` while API payloads stay ISO 8601, using `packages/ui`'s
      date helper; no component formats a date inline (PRD §41.1)
- [ ] `[machine]` Every mutating SSO action goes through `DestructiveAction` with an exact effect and a
      recovery path; the *absence* of self-service export/closure is stated in plain language
      (PRD §41.1)
- [ ] `[machine]` No asynchronous interaction renders a bare spinner: each uses `packages/ui`'s async
      state view with title, explanation, allowed next action and a copyable request/job id
      (PRD §31.3, §41.1)
- [ ] `[machine]` Switching organisation drops every cached value these sub-areas hold and requires
      confirmation for a dirty SSO form — asserted with `RUNT-05`'s exported
      `apps/web/test/org-scope-conformance.ts` (PRD §31.1; `AUTH-002` client half)
- [ ] `[machine]` Refresh, back and forward never re-submit a transition, a test start or a disable
      (PRD §41.1)
- [ ] `[machine]` This tree contains **no** role literal, no SSO state-transition rule and no retention
      logic of its own — source scan over `apps/web/src/features/settings/{sso,data}/**`; every
      permission comes from the server's permissions response and every state from `IDNT-05`
      (PRD §45.2; plan §9 **R5**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — these sub-areas consume generated
      bindings and hand-edit none (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `AUTH-005`, `UAT-AUTH-04`, the retention/privacy
      impact, the accessibility impact, the rollback path and the **known gaps** for sub-PRD **OQ6** (no
      retention/closure write API), **OQ7** (nothing provisions the break-glass path) and **OQ2** (the
      nested sub-area glob)
- [ ] `[fixture]` The committed synthetic fixtures under
      `apps/web/test/features/settings/{sso,data}/fixtures/**` — no connection, `DRAFT`, `TESTING`,
      `ACTIVE` with current test, `ACTIVE` with stale test, `ACTIVE` enforced, `ERROR`, `DISABLED`, and
      one per `enforcement_readiness` reason — each render the expected screen state (replay of recorded
      data; synthetic only, PRD §45.1 item 6)
- [ ] `[human]` **`UAT-AUTH-04`** run against a running stack: an Owner attempts to enable SSO before a
      successful test and is blocked with the exact test requirement and the break-glass explanation
      (PRD §41.2)
- [ ] `[human]` Founder review against PRD §41.1 at the three widths: connection state and the retention
      durations are never hidden; every security-sensitive action names its exact effect and recovery;
      request ids are copyable from every error (PRD §41.1, §43.4)
- [ ] `[human]` Founder review of `/settings/data` against PRD §10.3: the stated durations match the
      PRD exactly, and the absence of self-service export/closure is disclosed honestly rather than
      implied to exist (PRD §10.3, §26 *"Terms, Privacy, AUP and disclaimer drafts are published"*
      discipline; sub-PRD **OQ6**)
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)

## Test plan

Reviewer steps, offline, no network and no real IdP. The component runner and accessibility engine are
whatever `FND-01` selected; the accessibility helper is `packages/ui/test/a11y.ts` (`RUNT-06`
deliverable 12); the sub-area harness is `IDNT-08`'s exported
`apps/web/test/features/settings/sub-area-conformance.tsx`; the API is stubbed with this ticket's
committed fixtures — **no `apps/api` process is started**.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/web`. Suites live under `apps/web/test/features/settings/{sso,data}/`.
3. **`sub-area-registration.test.tsx`** — mount the settings feature with both sub-areas present; assert
   both routes and both sub-navigation entries appear; then run `git status --porcelain` and assert no
   file outside `features/settings/{sso,data}` changed. Assert a duplicate `id`/`path` fails with both
   offenders named.
4. **`sso-states.test.tsx`** (`[fixture]`) — render every connection-state fixture and assert the
   badge text plus icon, `tested_at` formatting, the `tested_config_current` indicator and the
   permanent break-glass statement in all five states.
5. **`enforcement-readiness.test.tsx`** (`[fixture]`) — one case per reason: assert the pre-action list
   shows every outstanding condition with its message, that the break-glass acknowledgement is not
   pre-checked, and that a forced attempt renders the server refusal verbatim.
6. **`config-edit-warning.test.tsx`** — assert the "clears the tested state" warning renders before
   submission and that the post-edit state shows `DRAFT` with no current test.
7. **`no-secret-render.test.tsx`** — fixture with `secret-canary-<uuid>` in every secret-bearing
   configuration field; render every SSO screen state; scan the DOM, `location.href`, `document.title`
   and the telemetry buffer; assert absence.
8. **`retention.test.tsx`** — a literal expectation table transcribed from PRD §10.3 and §10.4; assert
   every row and duration appears in the rendered output, and that the screen's constant table is the
   single source of those numbers (source scan for stray literals).
9. **`no-phantom-endpoint.test.tsx`** — record every request the `data` screen issues and compare to a
   literal allowlist; assert no unimplemented retention/export/closure path is called.
10. **`a11y.test.tsx`** — run `packages/ui/test/a11y.ts` over both screens at 360, 768 and 1280 px;
    assert zero WCAG 2.2 AA violations; keyboard walk asserts visible focus on every interactive
    element, a logical order and exactly one `<h1>` per screen.
11. **`org-switch.test.tsx`** — reuse `apps/web/test/org-scope-conformance.ts` (`RUNT-05`): seed markers
    under both sub-areas' cache keys, register a dirty SSO form, switch organisation; assert
    confirmation was required, every key is gone and both `onOrganizationChange` handlers ran.
12. **`idempotent-navigation.test.tsx`** — start a test, then simulate refresh/back/forward and assert
    exactly one call was made; repeat for activate and disable.
13. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether the
    screen can be coaxed into showing a configuration secret through an error body; whether the
    break-glass acknowledgement can be sent without the user seeing it; whether a stale
    `enforcement_readiness` cached from before a configuration edit can make enforcement look available;
    whether the sub-area glob can pick up `_shell` or a sibling ticket's directory.
14. The three `[human]` rows are run against a locally started stack (`pnpm stack:up`, `RUNT-09`) and
    recorded in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies anything in this ticket, update **this ticket file**
first (version note + changelog line in the PR), re-publish with
`.claude/scripts/publish-tickets.mjs --sync`, then change code. Silent divergence is an incomplete
ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`apps/web/src/features/settings/_shell/sub-area-contract.ts` does not exist or does not work as
  published** (sub-PRD **D7**/**OQ2** — `IDNT-08` runs concurrently with this ticket) → **do not** write
  `features/settings/feature.tsx` or `_shell/**` as a workaround; that is the file-scope defect plan §4
  exists to prevent, and it would collide with `IDNT-08`'s lane. Record it in
  `docs/prd/13-identity-surface/README.md` **OQ2**, amend `IDNT-08`'s contract section and this ticket
  in one docs PR, `--sync` both, and if serialisation is unavoidable add an `IDNT-09` ←`IDNT-08` edge to
  `docs/prd/breakdown-plan.md` §5.14/§6.2 before continuing.
- **`IDNT-05` does not return `enforcement_readiness` or a renderable message per reason** → `UAT-AUTH-04`
  cannot be satisfied. Amend `IDNT-05`'s deliverables 4/8 and this ticket together in one docs PR and
  `--sync` both. **Never** write `apps/api/src/routes/sso/**` from here.
- **`/settings/data` genuinely requires a write action to be useful** (sub-PRD **OQ6**) → that is a
  **product change** (PRD §45.5) and a plan change. Record it in
  `docs/prd/13-identity-surface/README.md` **OQ6** with the **Founder** as owner and add the route
  ticket to `docs/prd/breakdown-plan.md` §5.14/§6.2. Do not call, stub or fake an endpoint that does not
  exist, and do not implement deletion in the browser.
- **A PRD §10.3 duration cannot be stated because the implementation differs** → the PRD numbers are
  **product promises**, not implementation details (PRD §45.1 item 5). Do not soften the wording on the
  screen. Raise the divergence in `docs/prd/13-identity-surface/README.md` §Open questions with the
  **Founder** as owner, and against the owning module (`DATA-08` for ephemeral, `18-ops-release` for
  backup ageing).
- **No break-glass path exists to display** (sub-PRD **OQ7**) → show the `NO_BREAK_GLASS_PATH` state and
  what the Owner must do; do **not** hide the condition or imply enforcement is available. Record it in
  `docs/prd/13-identity-surface/README.md` **OQ7** with the **Founder** as owner.
- **A `packages/ui` primitive is missing** → use `RUNT-05`'s documented semantic-markup fallback and
  raise it against `RUNT-06`; creating a second component set falsifies breakdown-plan **A6**.
- **A WCAG 2.2 AA violation cannot be fixed without changing a `packages/ui` primitive** → raise it
  against `RUNT-06`; shipping with a known violation requires it in the PR's known-gaps line **and** in
  `docs/prd/13-identity-surface/README.md` (PRD §13.1 makes it a release target).

**3. Escalation.** *"SSO cannot be enforced before a successful test"* and the break-glass guarantee
(PRD §16.3) are release requirements with MUST force, and `AUTH-005`'s evidence is *"Failed IdP test
cannot lock out the organisation"*. `UAT-AUTH-04` is rehearsed on this screen. If the pre-action
readiness display, the break-glass statement or the PRD §10.3 disclosure proves unimplementable as
decided, that overturns a team decision recorded in `02-auth-core`'s sub-PRD **D6** and this module's
**D7**: escalate for re-review before any code lands. Never soften the disclosure inside this ticket.
