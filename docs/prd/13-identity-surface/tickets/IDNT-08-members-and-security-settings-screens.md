---
id: IDNT-08
title: Members and security settings screens
module: 13-identity-surface
lane: 13-identity-surface
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-05, IDNT-02, IDNT-03, IDNT-04]
blocks: [ASSR-06]
---

# IDNT-08 — Members and security settings screens

Implements PRD §31.2 (route table), §32.8 (developer and administration screens) and §41.1 (universal
UI acceptance), carrying the screen half of requirements `AUTH-001`, `AUTH-003` and `AUTH-004`. **No
ADR — the decision is already made in PRD §31.2, §32.8 and §41.1; this is build ticket 8 of 9 against
it.**
Parent sub-PRD: [13-identity-surface README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `RUNT-05` — Web app shell ([`03-app-runtime`](../../03-app-runtime/README.md));
[`IDNT-02` — Invitation lifecycle routes](IDNT-02-invitation-lifecycle-routes.md);
[`IDNT-03` — Membership and role routes with the last-Owner invariant](IDNT-03-membership-and-role-routes-with-the-last-owner-invariant.md);
[`IDNT-04` — MFA and recent-auth routes](IDNT-04-mfa-and-recent-auth-routes.md).
**Why `builder`:** a bounded change inside one module's declared file-scope, composing `packages/ui`
primitives and already-built `/v1` endpoints against screen contracts PRD §31.2/§32.8/§41.1 already
enumerate — not a new subsystem decision.

## Background + basis

**The routes and their empty states are fixed.** PRD §31.2:

> | `/settings/members` | Members/invitations | **Owner/Admin** | Manage access | **Last-Owner invariant
> visible** |
> | `/settings/security` | Sessions/MFA/passkeys | **all; policy by Owner/Admin** | Secure account |
> **MFA enrolment gate when required** |

`AUTH-001` (PRD §30.2) additionally names two routes that the §31.2 table does not list, because they
are pre-shell screens: *"`/accept-invite`, `/login`"*. Those are this ticket's too — sub-PRD decision
**D8**, recorded as **OQ1** with `docs/prd/breakdown-plan.md` §5.14 as the writeback target.

**Accessibility is a release target, not polish.** PRD §13.1:

> Application, API, SDK, widget, alerts, exports and generated answers MUST be English. **WCAG 2.2 AA
> is the release target. Web and widget MUST support keyboard navigation, visible focus, screen-reader
> labels, contrast and responsive layouts.**

PRD §41.1, which every customer screen must pass before feature sign-off:

> - works at **360 px, 768 px and 1280 px** widths without hiding legal status, citations, primary
>   actions or error recovery;
> - complete keyboard operation with visible focus and logical order;
> - one programmatic page heading, labelled fields, error summaries and live regions for asynchronous
>   status;
> - colour is never the only status signal;
> - dates display unambiguously as `3 Aug 2026` in UI while APIs use ISO format;
> - jurisdiction, legal status and source freshness use text plus badge/icon;
> - **destructive/security-sensitive actions name exact effect and recovery**;
> - request/job/correction IDs are copyable from errors and support panels;
> - customer research content is not placed in URL query strings, analytics, browser error telemetry or
>   page titles;
> - refresh/back/forward/reconnect does not duplicate writes or charges.

PRD §32.8 adds the rule that governs every secret this screen shows: *"**Secrets are never
redisplayed.**"*

**The requirements this screen carries.** PRD §30.2 `AUTH-001` (evidence *"Expired, reused and
wrong-email invites fail"*), `AUTH-003` (*"Permission matrix in §38 passes"*), `AUTH-004` (*"Protected
action fails without MFA and recent auth"*). PRD §41.2:

> | `UAT-AUTH-01` | Open signup URL without invitation | **No public account creation path;
> marketing/login only** |
> | `UAT-AUTH-02` | Accept same invite twice | **First succeeds; second shows consumed/invalid with no
> new membership** |

**The browser is never the enforcement point.** PRD §45.2 gives `apps/web` *"Screen
contracts/accessibility/client state"* and forbids it *"Security-boundary PII or tenant enforcement"*.
Every permission decision this screen renders comes from `IDNT-03`'s
`GET /v1/members/me/permissions` (itself derived from `FND-06`'s `ROLE_MATRIX`); every MFA state comes
from `IDNT-04`'s `GET /v1/mfa/status`. This screen encodes **no** role rule (plan §9 **R5**).

**The web registration contract is `RUNT-05`'s and this ticket obeys it.** `RUNT-05`'s A1 web contract:

> **1. Discovery.** Every immediate child directory of `apps/web/src/features/` is a **feature area**.
> Discovery uses a Vite glob in `apps/web/src/app/feature-registry.ts` —
> `import.meta.glob('../features/*/feature.tsx', { eager: true })` — which is a **pattern, not a list**.
> **2. Required entry file.** A feature area MUST contain `feature.tsx` with a **default export** of
> type `FeatureModule` … `id` must equal the directory name … `nav.slot` one of the eleven PRD §31.1
> slot ids … `onOrganizationChange` … **5. Organisation scoping is mandatory for cached state.** Every
> cache key a feature creates MUST be produced by the shell's `orgScopedKey(...)` helper …
> **6. Stability guarantee.** Adding, renaming or removing a feature area produces **zero** diff outside
> that area's own directory.

`RUNT-05` also exports the two conformance harnesses this ticket reuses:
`apps/web/test/feature-conformance.tsx` and `apps/web/test/org-scope-conformance.ts`, plus
`apps/web/src/lib/{org-scope,dirty-forms,api-client,format}.ts` and the `PageHeading`/`SkipLink`/live
region wiring in `apps/web/src/shell/AppShell.tsx`.

**Shared components come from `packages/ui`, not from here.** breakdown-plan **A6** and `RUNT-06`
export the accessible primitive set (`Button`, `TextField`, `Select`, `Dialog`, `Table`, `Chip`,
`Badge`, `CopyableId`, `ErrorSummary`, `LiveRegion`, `PageHeading`, `SkipLink`, `EmptyState`,
`DestructiveAction`, …), the ten PRD §31.3 async states via `JobStateView`, the status badges, the
`3 Aug 2026` date helper and the reusable accessibility harness `packages/ui/test/a11y.ts`. This ticket
composes them and defines no second component set.

**Why `settings` is one feature area with nested sub-areas.** `RUNT-05`'s glob is one level deep, so
`apps/web/src/features/settings/` is a single feature area with a single `feature.tsx` — yet plan §5.14
splits its contents between this ticket (`members`, `security`) and `IDNT-09` (`sso`, `data`), which run
**concurrently** in wave 3 with no ordering edge between them. Sub-PRD decision **D7** resolves it: this
ticket writes `features/settings/feature.tsx` once, discovering sub-areas with a nested glob
(`import.meta.glob('./*/sub-feature.tsx')`), so `IDNT-09` adds its two sub-areas without editing any
file this ticket owns. That extends `RUNT-05`'s stability guarantee one level down and is recorded as
**OQ2**, whose writeback target is `docs/prd/breakdown-plan.md` §5.14/§6.2 plus
`docs/prd/03-app-runtime/README.md`.

**Accepted caveats carried forward, documented not enforced here:**

- **The invitation acceptance URL is shown once to the inviter, and plan §8 Q14 does not change that.**
  The provider is confirmed — Resend behind the existing `EmailTransport` port — but it is owned by
  `WTCH-04`/`WTCH-09` in `16-monitor-alerts`, and no ticket sends an *invitation* email (sub-PRD
  **OQ4**, **D14**). `IDNT-02` deliverable 2 therefore still returns the acceptance URL exactly once,
  and this screen must display it exactly once, with a copy control and an explicit warning that it
  will not be shown again (PRD §32.8). Do not add a "resend invitation by email" control: no endpoint
  exists behind it.
- **`/settings/sso` and `/settings/data` are `IDNT-09`.** This ticket ships the settings frame with a
  navigation slot for them that renders only when their sub-areas exist — never a stub link to a
  missing route.
- **`packages/ui` runs in the same wave as the shell**, so if a primitive is missing, use `RUNT-05`'s
  documented fallback (semantic markup) and raise it against `RUNT-06` — do **not** create a second
  component set (`RUNT-05` Non-goals; breakdown-plan **A6**).
- **The toolchain is pinned; the router/data-fetching choice is not this ticket's.** plan §8 **Q12** is
  CONFIRMED — Node.js `24.18.0`, pnpm `11.4.0`, Rust `1.97.1`, Python `3.14.6`, committed by `FND-01`
  (sub-PRD **D13**) — so this ticket states no version literal and selects no version. The router and
  data-fetching library remain `03-app-runtime` **QR2**, resolved by `RUNT-05`.

## Goal

Produce the `apps/web/src/features/auth/` feature area (`/login`, `/accept-invite`, MFA challenge) and
the `apps/web/src/features/settings/` feature area with its frame plus the `members` and `security`
sub-areas (`/settings/members`, `/settings/security`), all composed from `packages/ui` primitives and
`RUNT-05`'s shell contract. Completion is mechanically checkable: both feature areas register by
directory with zero diff outside themselves; the app exposes no route or control that creates an
account other than invitation acceptance; the members screen shows the last-Owner invariant **before**
the action is attempted and renders the server's refusal verbatim when it is attempted anyway; the
security screen shows the MFA enrolment gate, the active-session list and one-time secrets exactly once;
every permission-driven control is driven by the server's permissions response and no role rule exists
in this tree; and an automated WCAG 2.2 AA pass over every screen at 360 px, 768 px and 1280 px reports
zero violations.

## Non-goals

- **No API endpoints.** `/v1/auth`, `/v1/invitations`, `/v1/members`, `/v1/mfa` are `IDNT-01`…`IDNT-04`.
- **No app shell, navigation, organisation switcher, status badges or client cache mechanics.**
  `apps/web/src/{app,shell,lib}/**` and `features/home/**` are `RUNT-05`.
- **No shared UI components.** `packages/ui` is `RUNT-06` (breakdown-plan **A6**).
- **No `/settings/sso` or `/settings/data` sub-areas.** `IDNT-09` writes
  `features/settings/{sso,data}/**`; this ticket must not create, stub or pre-empt those directories.
- **No developer or usage screens.** `/developer/*` and `/usage` are `20-developer-platform`
  (`PLTF-07`, `PLTF-08`) — including the `/developer/service-accounts` screen whose API is `IDNT-06`.
- **No marketing or public site.** `apps/web/public-site/**` is `24-launch` (`LNCH-03`,
  breakdown-plan **A8**). `UAT-AUTH-01` expects *"marketing/login only"* — this ticket owns the **login**
  half only.
- **No legal or disclaimer surfaces.** `apps/web/src/features/legal/**` is `LNCH-02` (`24-launch`).
- **No permission or MFA decisions in the browser.** PRD §45.2. Every control's visibility comes from
  `GET /v1/members/me/permissions` and `GET /v1/mfa/status`.
- **No cross-boundary E2E or accessibility suite.** `tests/e2e/**` is `23-assurance` (`ASSR-06`,
  `ASSR-07`), which is `blocked_by` this ticket. This ticket carries its own co-located checks
  (plan §9 **R8**).

## File-scope (write-owns)

- `apps/web/src/features/auth/**` — `/login`, `/accept-invite` and the MFA challenge screens.
  **Interpretation flag:** plan §4 gives this module `apps/web/src/features/{auth,settings}/**` but plan
  §5.14 allocates no ticket to `features/auth/**`; sub-PRD **D8** assigns it here because `AUTH-001`
  names `/login` and `/accept-invite` and this is the only ticket `blocked_by` both `RUNT-05` and
  `IDNT-02`. Writeback target if rejected: `docs/prd/breakdown-plan.md` §5.14 (see sub-PRD **OQ1**).
- `apps/web/src/features/settings/feature.tsx` — the single A1 entry file for the settings area
  (sub-PRD **D7**).
- `apps/web/src/features/settings/_shell/**` — the settings frame: sub-navigation, sub-area registry and
  the shared settings layout consumed read-only by `IDNT-09`.
- `apps/web/src/features/settings/members/**`
- `apps/web/src/features/settings/security/**`
- `apps/web/test/features/{auth,settings}/**` — this ticket's own component/integration tests
  (plan §1.1).
- `apps/web/package.json` — **append-only** if a dependency is required (plan §1.1).

Does not touch:

- `apps/web/src/features/settings/{sso,data}/**` — `IDNT-09`. This ticket creates neither directory and
  writes no list of sub-areas: discovery is a glob (sub-PRD **D7**).
- `apps/web/src/{app,shell,lib}/**`, `apps/web/index.html`, `apps/web/vite.config.ts`,
  `apps/web/src/features/home/**` — `RUNT-05`.
- `apps/web/src/features/{search,sources,ask,answers,coverage,compare,monitor,records,exports,developer,usage,legal}/**`
  and `apps/web/public-site/**` — `14`, `15`, `16`, `17`, `19`, `20`, `24` (plan §4).
- `packages/ui/**` — `RUNT-06`; `packages/contracts/**`, `schemas/openapi/**` — `00-foundation`;
  `packages/auth/**`, `packages/database/**`, `packages/domain/**` — `02-auth-core`, `01-app-data`,
  `00-foundation`.
- `apps/api/**` — `RUNT-01`/`RUNT-02`/`RUNT-03`/`RUNT-08` and `IDNT-01`…`IDNT-07`.
  `apps/worker/**`, `apps/admin/**`, `apps/widget/**` — `RUNT-04`, `22-internal-admin`,
  `20-developer-platform`.
- `infra/**`, `tests/**`, root manifests, lockfiles, `.github/workflows/**`.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, no in-flight
ticket), so nothing has previously written `apps/web/src/features/{auth,settings}/**` and nothing
contends for it. `RUNT-05` owns `apps/web/src/{app,shell,lib}` and `features/home` and explicitly names
`features/{auth,settings}` as `13-identity-surface`'s in its Non-goals, so the top-level split is
already agreed. Within this module the only concurrent writer is `IDNT-09` (both are wave 3, with no
edge between them); sub-PRD **D7**'s nested sub-area glob makes their write-sets disjoint —
`IDNT-09` writes only `features/settings/{sso,data}/**` and never `feature.tsx` or `_shell/**`. The
third wave-3 ticket, `IDNT-07`, writes `apps/api/src/routes/widget-sessions/**` — a different tree.
`apps/web/package.json` is append-only shared (plan §1.1).

## The settings sub-area contract (normative for `IDNT-09`)

This section is the contract `IDNT-09` builds against; it must be implementable without `IDNT-09`
editing any file listed above.

**1. Discovery.** Every immediate child directory of `apps/web/src/features/settings/` **other than**
`_shell` is a **settings sub-area**. Discovery is a nested Vite glob in
`apps/web/src/features/settings/_shell/sub-area-registry.ts` —
`import.meta.glob('../*/sub-feature.tsx', { eager: true })` — a pattern, not a list.

**2. Required entry file.** A sub-area MUST contain `sub-feature.tsx` with a default export of type
`SettingsSubArea`, exported from `_shell/sub-area-contract.ts`:

```ts
export interface SettingsSubArea {
  readonly id: string;              // must equal the directory name, e.g. 'sso'
  readonly path: string;            // absolute route, e.g. '/settings/sso'
  readonly label: string;           // sub-navigation label
  readonly element: React.ReactNode;
  /** Feature-supplied predicate over the server's permissions response. The frame encodes no role rule. */
  readonly visibleWhen: (ctx: SettingsContext) => boolean;
  readonly order?: number;          // sub-navigation order tiebreak; default 100
  /** Called on organisation switch; must drop every org-scoped cache the sub-area holds. */
  readonly onOrganizationChange?: (organizationId: string) => void;
}
```

**3. Ordering and collisions.** Sub-navigation renders by `order` then `id`. Two sub-areas with the
same `id` or the same `path` fail the build with an error naming both. Last-wins is forbidden.

**4. Delegation.** `features/settings/feature.tsx` composes the sub-area registry into the
`FeatureModule` `RUNT-05` requires: it claims the `SETTINGS` nav slot, contributes every sub-area's
`path` as a route, and fans `onOrganizationChange` out to every sub-area.

**5. Stability guarantee.** Adding, renaming or removing a settings sub-area produces **zero** diff
outside that sub-area's own directory. `apps/web/test/features/settings/sub-area-conformance.tsx`
asserts it and is **exported for `IDNT-09` to reuse**.

## Deliverables

1. **`apps/web/src/features/auth/feature.tsx`** — a conforming `RUNT-05` feature area, `id: 'auth'`,
   registering `/login`, `/accept-invite` and the MFA challenge route. It claims **no** nav slot (the
   PRD §31.1 tuple has none for sign-in and `RUNT-05` makes `nav` optional). It renders outside the
   authenticated shell frame.
2. **`/login`** — sign-in against `IDNT-01`'s `POST /v1/auth/sign-in`. Contains **no** registration,
   sign-up or "create account" affordance of any kind; the empty state names invitation-only access and
   links to support (PRD §8.1; `UAT-AUTH-01`). A `401` renders one generic message that does not
   disclose whether the account exists (`IDNT-01` deliverable 3). A `403 MFA_REQUIRED` navigates to the
   MFA challenge. Uses `packages/ui`'s labelled fields and `ErrorSummary`; the `request_id` from the
   error body is rendered in a `CopyableId` (PRD §41.1).
3. **MFA challenge screen** — drives `IDNT-04`'s `POST /v1/mfa/totp/verify`,
   `POST /v1/mfa/passkey/authenticate/{begin,finish}` and `POST /v1/mfa/recovery-codes/consume`,
   offering exactly the methods `GET /v1/mfa/status` reports. Rate-limit `429` responses render
   `Retry-After` as plain language. First-login Owner/Admin enrolment (PRD §38.2 grace) routes into the
   security screen's enrolment flow rather than dead-ending.
4. **`/accept-invite`** — reads the token from the URL, immediately calls `IDNT-02`'s
   `POST /v1/invitations/preview` with the token **in the request body**, and renders organisation,
   role and the masked invited address. Submitting calls `POST /v1/invitations/accept`. The four closed
   reasons (`INVALID`, `EXPIRED`, `ALREADY_USED`, `EMAIL_MISMATCH`) each render a distinct
   plain-language explanation and a recovery path (`UAT-AUTH-02`: *"second shows consumed/invalid"*).
   **The token must be removed from the address bar** as soon as it is read, and must never reach
   `document.title`, analytics or error telemetry (PRD §41.1; PRD §22).
5. **`apps/web/src/features/settings/feature.tsx` + `_shell/**`** — the settings feature area per the
   contract section above: `id: 'settings'`, `nav.slot: 'SETTINGS'` (PRD §31.1 item 10),
   `visibleWhen` supplied by this feature from the server's permissions response, sub-area registry,
   sub-navigation, shared layout, and a single `PageHeading` per screen using `RUNT-05`'s shell slot.
6. **`/settings/members`** (`members` sub-area, `visibleWhen`: the permissions response allows
   *"Manage members/invitations"*) — PRD §31.2 *"Manage access"*, empty/first-use state *"Last-Owner
   invariant visible"*:
   - a member table (`packages/ui` `Table`) with display name, email, role, status, joined date
     rendered `3 Aug 2026`, and a **text + icon** role badge (PRD §41.1 "colour is never the only status
     signal");
   - the **last-Owner invariant is visible before the action**: the sole Owner's row shows an explicit,
     always-present explanation that this member cannot be removed or demoted, and the corresponding
     controls are disabled with an accessible description — not hidden, not silently failing
     (plan §5.14 goal; PRD §31.2 empty-state column);
   - role change and removal use `DestructiveAction` from `packages/ui`, which **refuses to render
     without the exact effect and the recovery path as text** (PRD §41.1); the exact effect text names
     what the member loses and that sessions are revoked immediately (`IDNT-03` deliverable 4 step 5);
   - the server's refusal body is rendered verbatim when a write is attempted anyway — including the
     `LAST_OWNER_IMMUTABLE` / `ROLE_NOT_PERMITTED` / `OWNER_CONSTRAINTS` message — so the browser is
     never the authority (PRD §45.2);
   - `409 CONCURRENT_MODIFICATION` renders a reload-and-retry path preserving the user's intent, never
     a silent overwrite (PRD §34.9);
   - an invitations panel: pending invitations list, invite form (email + role, roles limited to what
     the permissions response allows), revoke, and **the acceptance URL displayed exactly once** after
     creation, in a `CopyableId`-style control with an explicit "this will not be shown again" warning
     (PRD §32.8; `IDNT-02` deliverable 2). Navigating away or refreshing must not re-display it.
7. **`/settings/security`** (`security` sub-area, `visibleWhen`: always — PRD §31.2 *"all; policy by
   Owner/Admin"*) — PRD §31.2 *"Secure account"*, empty/first-use state *"MFA enrolment gate when
   required"*:
   - **MFA enrolment gate**: when `GET /v1/mfa/status` reports `enrolment_required`, the screen leads
     with it and states that protected workspace access is unavailable until a factor is confirmed
     (PRD §38.2 grace row);
   - TOTP enrolment showing the secret and `otpauth://` URI **exactly once**, with the confirm step;
     passkey registration; recovery-code generation showing the codes **exactly once** with a copy/
     download control and the count of invalidated previous codes. Every one-time display carries the
     PRD §32.8 warning and cannot be re-opened;
   - factor list with remove actions; removing the last confirmed factor while enrolment is required
     renders the server's `MFA_ENROLMENT_REQUIRED` refusal verbatim;
   - **active sessions** (PRD §38.2 *"Device/time/IP metadata; revoke one or all"*) from
     `GET /v1/auth/sessions`, with the current session marked, per-session revoke and revoke-all, each
     wrapped in `DestructiveAction` naming the exact effect ("you will be signed out on that device")
     and the recovery path;
   - a recent-auth indicator driven by `GET /v1/mfa/recent-auth`, and a re-authenticate action calling
     `POST /v1/mfa/reauthenticate` when a sensitive action returns `403 RECENT_AUTH_REQUIRED`
     (PRD §34.9), returning the user to the interrupted action afterwards.
8. **Async state handling.** Every asynchronous interaction in these screens renders through
   `packages/ui`'s `JobStateView` (`RUNT-06` deliverable 2) or the equivalent primitive, so no
   interaction is ever a bare spinner (PRD §31.3: *"A spinner without state or recovery guidance is not
   acceptable"*), and asynchronous status is announced through the shell's live region (PRD §41.1).
9. **Organisation scoping.** Every cached value these features hold is keyed with `RUNT-05`'s
   `orgScopedKey(...)`, and each feature implements `onOrganizationChange` to drop it; forms register
   with `registerDirtyForm` so an organisation switch requires explicit confirmation
   (`RUNT-05` contract §5; PRD §31.1; `AUTH-002` client half).
10. **No content in URLs, titles or telemetry.** No email address, member name, invitation token, MFA
    secret, recovery code or session id is ever placed in a query string, `document.title` or a
    telemetry payload (PRD §41.1, §22). All ids surfaced to the user are rendered with `CopyableId`.
11. **Idempotent navigation.** Refresh, back, forward and reconnect never re-submit an invite, a role
    change, a revoke or an enrolment (PRD §41.1 *"refresh/back/forward/reconnect does not duplicate
    writes or charges"*); mutations carry an `Idempotency-Key` where the endpoint supports one
    (PRD §16.1, §34.1).
12. **Test harnesses** — `apps/web/test/features/settings/sub-area-conformance.tsx` (mount a throw-away
    settings sub-area and assert its route and sub-nav entry appear, then remove it) **exported for
    `IDNT-09`**, plus committed fixtures under `apps/web/test/features/{auth,settings}/fixtures/**` for
    the `GET /v1/members`, `GET /v1/members/me/permissions`, `GET /v1/mfa/status`,
    `GET /v1/auth/sessions` and `POST /v1/invitations/preview` responses in every state this screen
    renders (sole Owner, several Owners, enrolment required, enrolment satisfied, each of the four
    invitation-failure reasons). All synthetic — no customer content (PRD §45.1 item 6).

## Acceptance checklist (classified)

- [ ] `[machine]` Both feature areas register by directory with **zero** diff to any tracked file
      outside their own directories — asserted with `RUNT-05`'s exported
      `apps/web/test/feature-conformance.tsx` (plan **A1**; `RUNT-05` contract §6)
- [ ] `[machine]` A throw-away settings **sub-area** registers its route and sub-nav entry with zero
      diff outside its own directory — asserted with this ticket's exported
      `apps/web/test/features/settings/sub-area-conformance.tsx`; duplicate `id` or `path` fails the
      build naming both (sub-PRD **D7**)
- [ ] `[machine]` `settings` claims the `SETTINGS` slot from `RUNT-05`'s frozen eleven-slot PRD §31.1
      tuple, and `auth` claims none (PRD §31.1)
- [ ] `[machine]` **`UAT-AUTH-01` (screen half):** the built application exposes no route, link, form or
      control that creates an account other than `/accept-invite` — asserted by enumerating every
      registered route in these features and scanning rendered markup for sign-up affordances
      (PRD §8.1; `AUTH-001`)
- [ ] `[machine]` **`UAT-AUTH-02` (screen half):** each of the four invitation reasons (`INVALID`,
      `EXPIRED`, `ALREADY_USED`, `EMAIL_MISMATCH`) renders a distinct plain-language explanation and a
      recovery path, replayed from the committed fixtures (`AUTH-001`; PRD §41.2)
- [ ] `[machine]` The invitation token is removed from the address bar after it is read, and never
      appears in `location.href` after first paint, `document.title` or the captured telemetry buffer —
      asserted with a `secret-canary-<uuid>` token (PRD §41.1, §22)
- [ ] `[machine]` **`AUTH-003` last Owner:** with the sole-Owner fixture, the Owner's row shows the
      always-present explanation and disabled controls with an accessible description; with the
      several-Owners fixture the controls are enabled; when a write is attempted anyway the server's
      `LAST_OWNER_IMMUTABLE` message is rendered verbatim (PRD §31.2 empty-state column; PRD §8.1)
- [ ] `[machine]` **`AUTH-003` permissions:** every permission-driven control's visibility comes from
      `GET /v1/members/me/permissions`; this tree contains **no** role literal and **no** permission
      branch — source scan over `apps/web/src/features/{auth,settings}/**` (PRD §45.2; plan §9 **R5**)
- [ ] `[machine]` **`AUTH-004` MFA gate:** with the `enrolment_required` fixture the security screen
      leads with the gate and states that protected access is unavailable until a factor is confirmed;
      with the satisfied fixture it does not (PRD §31.2 empty-state column; PRD §38.2)
- [ ] `[machine]` **Secrets shown once:** the TOTP secret, the `otpauth://` URI, the recovery codes and
      the invitation acceptance URL each render exactly once and cannot be re-opened by refresh, back,
      forward or re-navigation; each display carries the "will not be shown again" warning
      (PRD §32.8 *"Secrets are never redisplayed"*)
- [ ] `[machine]` Every destructive or security-sensitive action names its exact effect and its recovery
      path — enforced by `packages/ui`'s `DestructiveAction`, which refuses to render without both
      (PRD §41.1)
- [ ] `[machine]` **WCAG 2.2 AA:** an automated accessibility pass (`packages/ui/test/a11y.ts`, the
      harness `RUNT-06` exports) over `/login`, `/accept-invite`, the MFA challenge, `/settings/members`
      and `/settings/security` at **360 px, 768 px and 1280 px** reports **zero** violations
      (PRD §13.1, §41.1)
- [ ] `[machine]` Complete keyboard operation with visible focus and logical order on every screen; the
      skip link reaches main content; exactly **one** programmatic `<h1>` per screen; every field is
      labelled; validation errors surface in an `ErrorSummary`; asynchronous status is announced through
      an `aria-live` region (PRD §13.1, §41.1)
- [ ] `[machine]` No status is conveyed by colour alone — every role, status and MFA badge carries text
      plus an icon/shape (PRD §41.1)
- [ ] `[machine]` Dates render as `3 Aug 2026` while every API payload stays ISO 8601, using
      `packages/ui`'s date helper; no component formats a date inline (PRD §41.1)
- [ ] `[machine]` No asynchronous interaction renders a bare spinner: each uses `packages/ui`'s async
      state view with a title, explanation, allowed next action and a copyable request/job id
      (PRD §31.3, §41.1)
- [ ] `[machine]` Switching organisation drops every cached value these features hold and requires
      confirmation for a dirty form — asserted with `RUNT-05`'s exported
      `apps/web/test/org-scope-conformance.ts` (PRD §31.1; `AUTH-002` client half)
- [ ] `[machine]` Refresh, back, forward and reconnect never re-submit an invite, role change, revoke or
      enrolment (PRD §41.1)
- [ ] `[machine]` `409 CONCURRENT_MODIFICATION` renders a reload-and-retry path that preserves the
      user's intent and never silently overwrites (PRD §34.9, §16.2)
- [ ] `[machine]` No member email, member name, MFA secret, recovery code or session id reaches a URL
      query string, `document.title` or the telemetry buffer — canary scan (PRD §41.1, §22)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — these features consume generated
      bindings and hand-edit none (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `AUTH-001`, `AUTH-003`, `AUTH-004`,
      `UAT-AUTH-01`, `UAT-AUTH-02`, the accessibility impact, the rollback path and the **known gaps**
      for sub-PRD **OQ1** (`features/auth/**` allocation), **OQ2** (nested sub-area glob) and **OQ4**
      (no ticket sends the invitation email, so the acceptance URL is displayed once — the plan §8 Q14
      provider is confirmed but is `16-monitor-alerts`')
- [ ] `[fixture]` The committed synthetic fixtures under
      `apps/web/test/features/{auth,settings}/fixtures/**` — members (sole Owner and several Owners),
      permissions per role, MFA status (enrolment required and satisfied), sessions, and each of the four
      invitation-failure reasons — each render the expected screen state (replay of recorded data;
      synthetic only, PRD §45.1 item 6)
- [ ] `[human]` **`UAT-AUTH-01`** run against a running stack: open the signup URL without an
      invitation and confirm there is no public account-creation path — login only (PRD §41.2). The
      marketing half of *"marketing/login only"* is `LNCH-03` and is **not required to merge this
      ticket**
- [ ] `[human]` **`UAT-AUTH-02`** run against a running stack: accept the same invitation twice; the
      first succeeds, the second shows consumed/invalid, and `/settings/members` shows no second
      membership (PRD §41.2)
- [ ] `[human]` Founder review against PRD §41.1 at the three widths: role, status and MFA state are
      never hidden; destructive and security-sensitive actions name their exact effect and recovery;
      request ids are copyable from every error (PRD §41.1, §43.4)
- [ ] `[human]` Gate 2 smoke: sign in, complete MFA enrolment as an Owner, invite a member, attempt to
      remove the last Owner and observe the refusal (CLAUDE.md Gate 2)
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)

## Test plan

Reviewer steps, offline, no network. The component runner and accessibility engine are whatever
`FND-01` selected (Vitest + Testing Library or equivalent, with a jsdom/browser-mode environment);
the accessibility helper is `packages/ui/test/a11y.ts` (`RUNT-06` deliverable 12); the API is stubbed
with the committed fixtures — **no `apps/api` process is started**.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/web`. Suites live under `apps/web/test/features/{auth,settings}/`.
3. **`feature-registration.test.tsx`** — reuse `apps/web/test/feature-conformance.tsx` (`RUNT-05`) for
   both areas; assert routes and the `SETTINGS` slot claim; assert `git status --porcelain` is clean at
   suite end.
4. **`sub-area-conformance.test.tsx`** — the harness this ticket exports: write a throw-away
   `features/settings/zzz-test/sub-feature.tsx` into a temp root, mount, assert its route and sub-nav
   entry, remove. Then assert duplicate `id` and duplicate `path` each fail with both offenders named.
5. **`login.test.tsx`** — render `/login`; scan the markup for any sign-up/registration affordance and
   assert absence; drive a `401` and assert one generic message plus a copyable `request_id`; drive a
   `403 MFA_REQUIRED` and assert navigation to the challenge.
6. **`accept-invite.test.tsx`** (`[fixture]`) — for each of the four reasons plus the success case,
   replay the fixture and assert the rendered explanation and recovery path. Assert the token is read
   from the URL and then removed, and scan `location.href`, `document.title` and the telemetry buffer
   for the canary.
7. **`members.test.tsx`** (`[fixture]`) — sole-Owner fixture: assert the always-present explanation, the
   disabled controls and their accessible description; several-Owners fixture: assert enabled controls.
   Drive a `LAST_OWNER_IMMUTABLE` refusal and assert the server message renders verbatim. Drive a
   `409` and assert the reload-and-retry path. Drive an invite creation and assert the acceptance URL
   renders once, then re-render and assert it is gone.
8. **`security.test.tsx`** (`[fixture]`) — enrolment-required fixture: assert the gate leads the screen;
   run TOTP enrolment and assert the secret renders once and is absent after re-navigation; run recovery
   code generation and assert the same; assert the session list, per-session revoke and revoke-all each
   go through `DestructiveAction` with an exact effect and recovery text.
9. **`permissions.test.tsx`** — for each role fixture of `GET /v1/members/me/permissions`, assert which
   controls render. Then a source scan over `apps/web/src/features/{auth,settings}/**` asserting no role
   literal and no permission branch.
10. **`a11y.test.tsx`** — run `packages/ui/test/a11y.ts` over all five screens at 360, 768 and 1280 px;
    assert zero WCAG 2.2 AA violations. Keyboard walk asserts a visible focus ring on every interactive
    element, a logical order, a working skip link and exactly one `<h1>` per screen.
11. **`org-switch.test.tsx`** — reuse `apps/web/test/org-scope-conformance.ts` (`RUNT-05`): seed a marker
    under each feature's cache keys, register a dirty invite form, switch organisation; assert
    confirmation was required, every key is gone and `onOrganizationChange` ran for both features.
12. **`idempotent-navigation.test.tsx`** — submit an invite, then simulate refresh/back/forward and
    assert exactly one create call was made; repeat for a role change and a session revoke.
13. **`leak.test.tsx`** — set the fixture member email, MFA secret and recovery code to
    `secret-canary-<uuid>`; drive every screen; scan `location.href`, `document.title` and the captured
    telemetry buffer; assert absence.
14. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether any
    one-time secret survives in component state, session storage or the router history; whether a
    disabled control is the only thing preventing a forbidden write (it must not be — the server
    refuses); whether the invitation token can leak through a referrer; whether the sub-area glob can
    pick up `_shell`.
15. The four `[human]` rows are run against a locally started stack (`pnpm stack:up`, `RUNT-09`) and
    recorded in the PR; `UAT-AUTH-01`'s marketing half waits for `LNCH-03`.

## Feedback obligation

**1. General rule.** If implementation falsifies anything in this ticket, update **this ticket file**
first (version note + changelog line in the PR), re-publish with
`.claude/scripts/publish-tickets.mjs --sync`, then change code. Silent divergence is an incomplete
ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **The nested sub-area glob does not survive the production bundle** (sub-PRD **D7**/**OQ2**) → then
  `IDNT-09` cannot add a sub-area without editing a file this ticket owns, which is a file-scope defect.
  Write, in this order, **before** changing `apps/web/src/features/settings/`: (a) the mechanism and its
  replacement in a new `docs/adr/NNNN-settings-sub-area-registration.md` (breakdown-plan **A9**:
  per-file ADR ownership; the slug is reserved to this ticket); (b) the resolution in
  `docs/prd/13-identity-surface/README.md` **OQ2**; (c) an `IDNT-09` → `IDNT-08` edge in
  `docs/prd/breakdown-plan.md` §5.14/§6.2 if serialisation is unavoidable. Never let `IDNT-09` write
  `feature.tsx`.
- **`features/auth/**` is judged to belong elsewhere** (sub-PRD **D8**/**OQ1**) → that is a **plan**
  change. Update `docs/prd/breakdown-plan.md` §5.14 and this ticket's file-scope in one docs PR and
  `--sync`. Do not build the login screen in `apps/web/src/{app,shell}/**` (`RUNT-05`'s tree) as a
  workaround.
- **`RUNT-05`'s `FeatureModule` cannot express something these screens need** (for example a route
  rendered outside the authenticated shell for `/login`) → amend `RUNT-05`'s contract section and this
  ticket in one docs PR and `--sync` both; eight product modules read that contract. Never write
  `apps/web/src/{app,shell,lib}/**`.
- **A `packages/ui` primitive is missing** (`DestructiveAction`, `CopyableId`, `JobStateView`, a badge)
  → use `RUNT-05`'s documented semantic-markup fallback and raise the missing primitive against
  `RUNT-06` (a docs change there, then `--sync`). Creating a second component set here falsifies
  breakdown-plan **A6** — do not do it.
- **An endpoint this screen needs does not exist or lacks a field** (`IDNT-02`, `IDNT-03`, `IDNT-04`) →
  amend that ticket and this one together in one docs PR and `--sync` both. **Never** write
  `apps/api/src/routes/**` from here; that is the file-scope defect plan §4 exists to prevent.
- **A screen cannot be built without a role rule in the browser** → PRD §45.2 and plan §9 **R5** forbid
  it. The predicate must come from `GET /v1/members/me/permissions`; if that response is insufficient,
  amend `IDNT-03`'s deliverable 6 in a docs PR and `--sync`. Do not import `packages/domain` into
  `apps/web` as a shortcut.
- **A WCAG 2.2 AA violation cannot be fixed without changing a `packages/ui` primitive** → raise it
  against `RUNT-06`; accessibility is a release target (PRD §13.1), so shipping with a known violation
  requires it to be stated in the PR's known-gaps line **and** recorded in
  `docs/prd/13-identity-surface/README.md`.

**3. Escalation.** *"WCAG 2.2 AA is the release target"* (PRD §13.1) and *"Public registration MUST be
disabled"* (PRD §8.1) are release requirements with MUST force; `ASSR-06` automates `UAT-AUTH-01`/`02`
against these screens and is `blocked_by` this ticket. If the A1 feature-registration contract, the
sub-area contract or the no-role-rule-in-the-browser rule is outright falsified, that overturns a team
decision recorded in `docs/prd/breakdown-plan.md` §2.1 (**A1**, **A6**) and PRD §45.2: escalate for
re-review before any code lands. Never move enforcement into the browser inside this ticket.
