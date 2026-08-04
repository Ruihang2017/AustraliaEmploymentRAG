# 13-identity-surface — sub-PRD

> Parent decomposition: [`docs/prd/breakdown-plan.md`](../breakdown-plan.md) §3, §4, §5.14, §6.2, §7, §8.
> Master spec: [`docs/PRD.md`](../../PRD.md) (AustraliaEmploymentRAG MVP v1.0, revision 2.0, 3 August 2026).
> Module directory `13-identity-surface` · lane `13-identity-surface` · ticket prefix `IDNT` · 9 tickets ·
> write-owns `apps/api/src/routes/{auth,invitations,members,mfa,sso,service-accounts,widget-sessions}/**`
> and `apps/web/src/features/{auth,settings}/**` (breakdown-plan §4).

## Problem

Everything the product promises about *who may do what* is currently a set of primitives with no
surface. `02-auth-core` ships `packages/auth` (sessions, MFA, SSO, machine credentials, widget
tokens); `01-app-data` ships PRD §35.4's tables; `00-foundation` ships PRD §38.1's permission matrix
as pure code; `03-app-runtime` ships the admission chain and the web shell. None of them exposes an
HTTP route or a screen — by design (PRD §45.2: `apps/api` owns *"HTTP auth/admission/DTO mapping/SSE"*
and must not own *"Duplicated business rules"*; `apps/web` owns *"Screen contracts/accessibility/client
state"* and must not own *"Security-boundary PII or tenant enforcement"*).

Without this module the release requirements have no observable behaviour at all. PRD §8.1 is
unambiguous about what that behaviour must be:

> Access MUST be authenticated and invitation-controlled. **Public registration MUST be disabled.** A
> user MAY belong to multiple organisations, but organisation data MUST remain isolated. Fixed roles:
> Owner, Admin, Researcher, Viewer and Developer. Owner/Admin MUST manage invitations, memberships,
> limits and security settings according to permission. **Developer MUST NOT automatically gain
> Research Record content access. The last Owner MUST NOT be removable.** Organisation-internal
> sharing is supported; unauthenticated public share links are excluded.

and PRD §30.2 turns it into six requirement rows with named routes — `AUTH-001` (`/accept-invite`,
`/login`), `AUTH-002` (organisation switcher), `AUTH-003` (`/settings/members`), `AUTH-004`
(`/settings/security`), `AUTH-005` (`/settings/sso`), `AUTH-006` (`/developer/service-accounts`) —
plus `DEV-002` (widget sessions). PRD §41.2 then tests four of them by hand as `UAT-AUTH-01`…`04`.

`13-identity-surface` is the single owner of that surface: seven `/v1` route areas and the four
PRD §31.2 `/settings/*` screens plus the sign-in and invitation-acceptance screens. It implements no
identity rule of its own. Every decision it renders was already decided in `packages/domain`
(permissions), `packages/auth` (sessions, MFA, SSO, credentials, widget tokens) or
`packages/database` (tables, last-Owner invariant, single-use invitation). This module maps them onto
HTTP and onto pixels, and is where a defect becomes *visible* — which is exactly why the module's
acceptance is written against `UAT-AUTH-*` rather than against unit tests alone.

## Scope

In scope — the two write-owns rows breakdown-plan §4 gives this module:

| Area | Ticket | PRD basis |
|---|---|---|
| Sign-in/sign-out, session context, session list/revoke, organisation switch, and the module's shared route toolkit | `IDNT-01` | §16.3, §38.2, AUTH-002 |
| Invitation create/list/revoke/preview/accept — the only user-creating path in the product | `IDNT-02` | §8.1, §35.4, §38.2, AUTH-001 |
| Membership list, role change, removal, suspension, with the last-Owner invariant and the §38.1 matrix | `IDNT-03` | §8.1, §38.1, AUTH-003 |
| TOTP/passkey/recovery-code lifecycle, factor removal, re-authentication and the recent-auth check | `IDNT-04` | §16.3, §38.2, AUTH-004 |
| SSO connection draft/test/activate/enforce/disable **and** SSO login initiation + callbacks | `IDNT-05` | §16.3, §38.3, AUTH-005 |
| Service accounts, scopes, credential create/rotate/revoke with display-once secrets | `IDNT-06` | §16.3, §38.4, AUTH-006 |
| Widget-session minting and revocation from a customer backend's service credential | `IDNT-07` | §8.10, §33.5, §38.4, DEV-002 |
| Sign-in, accept-invite and MFA-challenge screens; `/settings/members`; `/settings/security` | `IDNT-08` | §31.2, §32.8, §41.1, AUTH-001/003/004 |
| `/settings/sso`; `/settings/data` | `IDNT-09` | §31.2, §10.3, §41.1, AUTH-005 |

## Non-goals

Each names its owner; none is a judgement call left to a Builder.

- **No identity primitives.** Sessions, cookies, CSRF, invitation and email tokens, TOTP/passkey/
  recovery codes, the recent-auth assertion, the SSO state machine and connectors, credential
  hashing/scoping/rotation and widget-token signing are `packages/auth` — `02-auth-core`
  (`AUTC-01`…`AUTC-05`). This module calls them and maps their typed results to PRD §34.9 wire codes.
- **No tables, migrations or repositories.** PRD §35.4's eight tenancy/identity tables and their
  repositories are `DATA-04`; `audit_event` is `DATA-07`; field encryption is `DATA-03`.
  breakdown-plan **A3**: *"`packages/database` owns every app table and repository; product modules own
  routes/handlers/screens only."* A missing column is a new ticket in `01-app-data` (plan §9 **R4**),
  never a local migration.
- **No permission matrix.** PRD §38.1 is `packages/domain/src/access/**` (`FND-06`), which exports
  `ROLE_MATRIX`, `evaluate()`, `canRemoveMember()`, `canChangeRole()`,
  `developerHasRecordAccess()` and `isIndistinguishableNotFound()`. No route re-states a role's rights
  (plan §9 **R5**).
- **No admission chain.** authn → tenant → membership → permission → rate/quota → PII → idempotency is
  `RUNT-02` and runs once, before any handler in these areas. This module declares each route's
  admission profile and per-route requirements; it re-implements no stage.
- **No app shell, navigation, organisation-switch client mechanics or shared UI.**
  `apps/web/src/{app,shell,lib}/**` and `features/home/**` are `RUNT-05`; `packages/ui` is `RUNT-06`
  (breakdown-plan **A6**). The screens here consume both.
- **No OpenAPI authoring and no generated bindings.** `schemas/openapi/**` and
  `packages/contracts/src/{openapi,generated}/**` are `FND-04`, serial-owned (breakdown-plan §4.1).
  `FND-04` deliverable 1 already commits to documenting *"the PRD §16.3 authentication and
  machine-access endpoints"*; this module implements against the generated types.
- **No developer screens.** `/developer/service-accounts`, `/developer/webhooks`, `/developer/widget`
  and `/usage` are `20-developer-platform` (`PLTF-07`, `PLTF-08`). `AUTH-006`'s screen half lives
  there; its API half is `IDNT-06` here.
- **No widget runtime.** `apps/widget/**` (loader, sandboxed iframe, React wrapper) is `PLTF-05`.
  `IDNT-07` mints the session token that `PLTF-05` consumes.
- **No internal-admin identity.** PRD §8.11/§38.1 *"separate internal identity only"* and
  `/internal/v1` are `22-internal-admin` (`INTL-01`).
- **No public marketing or login-adjacent marketing site.** `apps/web/public-site/**` is `24-launch`
  (`LNCH-03`, breakdown-plan **A8**). `UAT-AUTH-01` expects *"marketing/login only"* — the **login**
  half is here, the marketing half is `LNCH-03`.
- **No SCIM, no public signup.** PRD §16.3: *"SCIM is excluded."* PRD §38.3: *"member removal remains
  manual for MVP."* PRD §8.1 requires public registration to be **absent** — that is a tested property
  (`UAT-AUTH-01`), not a deferral. Do not add either as a side effect.
- **No transactional email.** Invitation and magic-link tokens are minted and verified here; sending
  anything is `16-monitor-alerts`. plan §8 **Q14** is **CONFIRMED**: the provider is Resend on the
  Resend Free transactional tier, sitting behind the existing `EmailTransport` port and owned by
  `WTCH-04` (the port, the provider-neutral channel and the offline transports) and `WTCH-09` (the
  `providers/resend/**` adapter). No `IDNT-*` ticket writes a transport, reads `RESEND_API_KEY` or
  calls a provider: this module owns no `apps/worker/**` path and has no dependency edge on module 16.
  What the confirmed provider does and does not change for invitation delivery is **D14**; the
  still-unallocated send path is **OQ4**.
- **No cross-boundary suites.** `tests/{tenant-isolation,security,e2e}/**` are `23-assurance`
  (`ASSR-01`, `ASSR-06`). Every ticket here carries its **own** co-located tenant-isolation assertions
  so assurance confirms rather than discovers (plan §9 **R8**).

## Decisions

Every decision is already made by the PRD, by a breakdown-plan §2.1 ADR candidate or by the
breakdown-plan §8 decision register, except **D7**, **D8** and **D10**, which are flagged as
interpretations with a named writeback target. `docs/adr/` is still empty, so tickets cite the PRD
directly; where a §8 register entry settles the choice (**D13**, **D14**) the ticket cites that entry
and the ticket named there as carrying the decision, and decides nothing locally (plan §1.1 ADR
reference form).

| # | Decision | Basis |
|---|---|---|
| D1 | **Routes are thin adapters.** A handler validates, calls one `packages/auth` function and/or one `DATA-02`-scoped repository, and maps the typed result to a PRD §34.9 code. It contains no session arithmetic, no role table, no hashing and no state machine. | PRD §45.2; plan §9 **R5** |
| D2 | **Route areas self-register by directory** (`RUNT-01`'s A1 contract). Each of the seven areas is one immediate child of `apps/api/src/routes/`; default prefix `/v1/<area-id>`; each area ships `index.ts` with a default-exported Fastify plugin and an optional `area` config. No module edits a shared route index. | plan **A1**; PRD §20.1, §39.1 |
| D3 | **`IDNT-01` owns the module's shared API toolkit** at `apps/api/src/routes/auth/_lib/**`: the composed `AuthCore`, the typed-result → §34.9 error mapper, the audit-emit helper and the shared admission presets. `IDNT-02`…`IDNT-07` **import** it read-only. This is precisely why plan §6.2 makes `IDNT-01` block those five tickets. | plan §6.2, §4 (only *writes* are allocated); PRD §45.2 |
| D4 | **Wire paths and payload shapes come from `FND-04`'s OpenAPI document**, not from this module. PRD §34 contains **no** identity payload example (§34.2–§34.8 cover search, answers, SSE, snapshots, coverage/compare, records and webhooks only), so the binding contract for these endpoints is §34.1 conventions + §34.9 errors + the generated types + PRD §35.4 columns. A needed path or field is an `FND-04` ticket. | PRD §34 (scope of the examples), §34.1, §20.1; plan §4.1 |
| D5 | **Every secret is returned exactly once, at creation, and never again**: invitation acceptance URL, TOTP secret and `otpauth://` URI, recovery codes, API credential display string, widget token. No read endpoint can return them. | PRD §35.4, §38.4, §32.8 *"Secrets are never redisplayed"* |
| D6 | **Every identity mutation emits an audit/security event** through the `AuditSink` port composed in `_lib`, carrying actor/organisation/action/result/request metadata only — never a secret, token, assertion or research body. | PRD §22, §35.6 `audit_event`, §38.3 step 7 |
| D7 *(interpretation)* | **`apps/web/src/features/settings/` is one A1 feature area with a nested sub-area glob.** `IDNT-08` writes `features/settings/feature.tsx` plus the settings frame and the `members`/`security` sub-areas; `IDNT-09` adds `sso`/`data` sub-areas **without editing any file `IDNT-08` owns**. `RUNT-05`'s glob (`../features/*/feature.tsx`) is one level deep, so a nested `./*/sub-feature.tsx` glob extends its stability guarantee down one level. | plan **A1**; `RUNT-05` contract §1/§6; needed because `IDNT-08` and `IDNT-09` run concurrently in wave 3. Writeback: **OQ2** |
| D8 *(interpretation)* | **`apps/web/src/features/auth/**` belongs to `IDNT-08`.** plan §4 gives the module `features/{auth,settings}/**` but §5.14 allocates only the `settings` subtrees. `AUTH-001` names `/accept-invite` and `/login`; `UAT-AUTH-01`/`UAT-AUTH-02` are rehearsed on them; `IDNT-08` is the only ticket `blocked_by` both `RUNT-05` and `IDNT-02`. | plan §4 vs §5.14; PRD §30.2 AUTH-001, §41.2. Writeback: **OQ1** |
| D9 | **No identity route declares `requiresPiiAdmission`.** These routes carry structured account fields (email, display name, role, scope, origin), not free-text research. PRD §10.1's boundary and `PII-002`'s fail-closed rule govern Ask/Compare/Coverage. Account email is customer *account* data under PRD §10.3 retention, not blocked employee PII. | PRD §10.1, §37.2, §30.2 `PII-002`; `RUNT-02` deliverable 8 |
| D10 *(interpretation)* | **SSO login initiation and both callbacks (production and the §38.3 step-3 non-enforced test callback) live in `routes/sso/**` (`IDNT-05`).** `IDNT-05` is the only ticket in the module with an `AUTC-03` edge, so it is the only one that may import `<auth-pkg>/sso`. | PRD §38.3 steps 3–6; plan §5.14 `blocked_by` column. Writeback: **OQ5** |
| D11 | **The organisation to switch to is a path parameter, never a body/query/header field.** `RUNT-02` rejects any tenant identifier supplied in body, query or header (PRD §34.1). The switch endpoint therefore addresses the target as a resource and validates it against the caller's own memberships before writing it into the session; an unknown or non-member organisation returns the identical `404 RESOURCE_NOT_FOUND`. | PRD §34.1, §16.1, §16.5; `RUNT-02` deliverable 5 |
| D12 | **The PRD §34.9 catalogue is closed.** Identity-specific failures (last Owner, stale SSO test, consumed invitation, forbidden scope) are expressed as an existing code plus a `details.reason` from a documented closed set — never as a new code. Adding a code is a PRD change (§45.5, Founder). | PRD §34.9; `RUNT-01` deliverable 5 |
| D13 | **The toolchain is pinned exactly, and this module states no version literal.** plan §8 **Q12** is CONFIRMED: Node.js `24.18.0`, pnpm `11.4.0`, Rust `1.97.1`, Python `3.14.6`, committed by `FND-01` in `.node-version`, `package.json#packageManager`, `package.json#engines.node` and the lockfiles. Node and pnpm are the two that bind this module — it touches no Rust or Python (Acceptance item 11) — and they are the versions the `<auth-pkg>/<area>` subpath-export resolution these route areas rely on is exercised against; that resolution is a mechanical consequence checked by the first `pnpm typecheck`, not an open question. No `IDNT-*` ticket selects, re-states or upgrades a version; a genuine incompatibility is evidence written back through `FND-01`, never a local pin change. | plan §8 **Q12 (CONFIRMED)**, owner `00-foundation`, resolving ticket `FND-01`; PRD §45.3, §18.2 |
| D14 | **A transactional-email provider now exists, and it is not reachable from this module.** plan §8 **Q14** is CONFIRMED — Resend on the Resend Free transactional tier, behind the existing `EmailTransport` port, `RESEND_API_KEY` held only in the production sealed-secret layer, sending domain verified by DNS, and no customer question, answer, evidence excerpt or Research Record content in any message. The port and the adapter belong to `16-monitor-alerts` (`WTCH-04`, `WTCH-09`) under `apps/worker/src/handlers/notifications/email/**`, a tree this module does not write. Module 13 has no dependency edge on module 16 and cannot acquire one here: plan §3 numbers modules in topological order and plan §9 **R6** treats a dependency on a higher-numbered module as a misplaced ticket, not a new edge. **Consequence, stated plainly:** the confirmed provider gives `IDNT-01` and `IDNT-02` no send path, so the invitation acceptance URL stays display-once and the password-reset token stays with the configured sink — behaviour PRD §35.4 already permits (*"token shown/sent"*). That behaviour is **not superseded** and is **no longer waiting on a provider decision**; it waits on the plan allocating a send path (**OQ4**). | plan §8 **Q14 (CONFIRMED)**, plan §3, plan §9 **R6**; PRD §35.4, §38.2, §39.6 |

## Rejected alternatives

| Rejected | Why |
|---|---|
| One `apps/api/src/routes/identity/**` area for all seven concerns | Collapses six tickets into one write-set and one lane. plan §7 records 9 tickets / 3 minimum waves / **5 useful lanes** for this module; a single area destroys that and contradicts plan §4's seven named directories. |
| Each ticket composing its own `AuthCore` from `packages/auth` | Two instances with independently applied PRD §38.2 defaults inside one process — a session-policy divergence no test in either area would catch. **D3** gives exactly one composition point. |
| A shared `apps/api/src/routes/_identity-shared/**` directory that all seven tickets append to | The shared-barrel contention `02-auth-core` already rejected. `_lib` lives inside `IDNT-01`'s own area, so only one ticket writes it while six read it. |
| Re-deriving the role matrix in the members route so the API can return a friendly message | PRD §45.2 forbids duplicated business rules in `apps/api`; plan §9 **R5** names this exact failure. `FND-06` returns a `DenyReason`; the route maps it. |
| Splitting `/settings/*` into four top-level feature areas (`settings-members`, `settings-security`, …) to avoid **D7** | Contradicts plan §4/§5.14's directory names and would claim four of `RUNT-05`'s eleven PRD §31.1 nav slots for what the PRD gives one `SETTINGS` slot. |
| Returning the invitation token in any read endpoint so an Owner can re-copy it | PRD §35.4 stores only the hash — the plaintext exists once, in memory, at creation. A re-copy path would require storing it. Re-invitation is a **new** invitation. |
| Distinguishing "no such invitation" from "wrong email" with different HTTP statuses | Turns the accept endpoint into an invitation-enumeration oracle. All four outcomes are one status with a closed `details.reason` set; an unknown token reports the generic reason. |
| Letting a cookie-authenticated user mint a widget session "for convenience" | PRD §33.5 step 2 and §38.4 require a **customer backend** using a **service credential**; `DEV-002`'s evidence is that a long-lived key never reaches the browser. `AUTC-05.issueWidgetSession` structurally accepts only a `VerifiedCredential`. |
| Building a retention/closure **write** API for `/settings/data` in `IDNT-09` | No PRD §16.2/§16.3 endpoint exists and plan §5.14 allocates no such ticket. plan §5.14's own goal for `IDNT-09` is *"Exact deletion and backup-ageing behaviour **shown**"*. See **OQ6**. |
| Building the `/developer/service-accounts` screen here because `IDNT-06` owns its API | plan §4 gives `apps/web/src/features/developer/**` to `20-developer-platform` (`PLTF-07`, `blocked_by` `IDNT-06`). Writing it here would be a cross-boundary write. |

## Open questions

None blocks Gate 1 or the start of `IDNT-01`. Each names an owner and the ticket that resolves it.
Resolution is a **writeback** to the named path, not a code comment (plan §9; CLAUDE.md issue #53).

**No breakdown-plan §8 register entry is open for this module.** **Q14** (transactional email
provider) and **Q12** (exact toolchain versions) are both CONFIRMED and are recorded above as **D14**
and **D13**; the former `OQ9` (Node/pnpm versions) is closed by Q12 and has been removed from this
table. `OQ4` keeps its identifier so existing ticket references still resolve, but its question has
changed: the provider is settled and no Founder ruling is pending on it, and what remains is a
**plan-allocation** gap. `OQ1`, `OQ2`, `OQ3`, `OQ5`, `OQ6`, `OQ7` and `OQ8` are untouched by the
register, and none of them was ever blocked on Q14.

| # | Question | Owner | Resolved by | Blocks | Writeback target |
|---|---|---|---|---|---|
| OQ1 | plan §5.14 allocates no ticket to `apps/web/src/features/auth/**`, yet plan §4 gives the module `features/{auth,settings}/**` and `AUTH-001` names `/login` and `/accept-invite`. **D8** provisionally assigns it to `IDNT-08`. Is that the intended allocation? | Architect / plan owner; **Founder** only if it changes product scope | `IDNT-08` | Nothing — `IDNT-08` proceeds under D8 | `docs/prd/breakdown-plan.md` §5.14 (`IDNT-08` file-scope) + this README §Decisions |
| OQ2 | Does a nested Vite glob (`./*/sub-feature.tsx` inside `features/settings/feature.tsx`) actually work under the bundler `RUNT-05` selects, so `IDNT-09` never writes a file `IDNT-08` owns (**D7**)? | `13-identity-surface` (`IDNT-08` Builder) jointly with `03-app-runtime` (`RUNT-05` owns the A1 web contract) | `IDNT-08` | If it fails, `IDNT-09` must become `blocked_by` `IDNT-08` — a **plan** change | `docs/prd/breakdown-plan.md` §5.14/§6.2 + `docs/prd/03-app-runtime/README.md`; the mechanism itself in a new `docs/adr/NNNN-*.md` |
| OQ3 | Which ticket wires `packages/auth`'s `AuditSink` port to `DATA-07`'s durable `audit_event` table? No module currently holds both edges — `13-identity-surface` is not `blocked_by` `DATA-07`, and `RUNT-02` only logs admission decisions through `RUNT-07`. | `01-app-data` + `03-app-runtime`; raised by `13-identity-surface` | `IDNT-01` (discovers it first; ships the `_lib` seam and the interim logger-backed sink) | Durable 12-month audit retention (PRD §10.3, §22) — a **known gap** on every `IDNT-*` PR until closed | `docs/prd/breakdown-plan.md` §5.14/§6.2 (add a `DATA-07` edge or a wiring ticket) |
| OQ4 (**provider settled by plan §8 Q14; the send path is not**) | A transactional-email provider now exists — Resend behind the existing `EmailTransport` port (**D14**) — yet no ticket in any module sends an *invitation* or *password-reset* email. The confirmed channel is `WTCH-04`'s alert channel under `apps/worker/src/handlers/notifications/email/**`, keyed on `alert_delivery.id`; this module owns no worker path, and an `IDNT-*` → `WTCH-*` edge would be a forward module edge (13 → 16) that plan §3 forbids and plan §9 **R6** names. Where does the identity send path live and who owns it? **ADR candidate** for whoever resolves it — the seam is hard to reverse once chosen. Not a Founder question and not a cost question: Q14 puts expected provider cost at A$0/month inside the free allowance. | **Architect / plan owner**; **Founder** only if the answer changes product scope | **Not `IDNT-02`.** A plan change that either places the identity send seam in a module lower-numbered than 13 or allocates the send to a module that already owns both ends; `IDNT-01` and `IDNT-02` ship configured-sink / display-once until then | Nothing — `AUTH-001`, `UAT-AUTH-01` and `UAT-AUTH-02` are all satisfiable without email, and PRD §35.4 permits *"token shown/sent"* | `docs/prd/breakdown-plan.md` §4, §5.14, §5.17 and §6.2 (placement + edges) — **never** an edge added from this module, and no ADR authored from here (`WTCH-04` already reserves the `transactional-email-provider` slug) |
| OQ5 | Does SSO **login** (initiation + production callback) belong in `routes/sso/**` (`IDNT-05`, **D10**) or in `routes/auth/**` (`IDNT-01`)? `IDNT-01` has no `AUTC-03` edge, so it cannot implement it today. | `13-identity-surface`; escalate to plan if a new edge is needed | `IDNT-05` | Nothing | `docs/prd/breakdown-plan.md` §5.14 (`IDNT-01`/`IDNT-05` scope + edges) |
| OQ6 | PRD §31.2 gives `/settings/data` the main action *"Manage lifecycle"*, but PRD §16.2/§16.3 define no retention/export/closure endpoint and plan §5.14 allocates no route ticket for one. `IDNT-09` therefore ships the display half only. | **Founder** (product scope) + plan owner | A new route ticket if approved; otherwise `IDNT-09` as scoped | Organisation-closure self-service. Export **jobs** are `19-exports` (`XPRT-01`) and are out of this module either way | `docs/prd/breakdown-plan.md` §5.14 + PRD §16.3 (a **product change**, PRD §45.5) |
| OQ7 | PRD §38.2 requires a break-glass Owner path that is *"MFA protected, not SSO-only"*. Which surface **configures** it? `IDNT-09` displays its state (needed for `UAT-AUTH-04`'s break-glass explanation) and `AUTC-03.assertBreakGlassAvailable` enforces it, but no ticket creates it. | **Founder** + plan owner | `IDNT-09` displays; configuration is unallocated | `AUTH-005` enforcement is refused with `NO_BREAK_GLASS_PATH` until a path exists — correct fail-closed behaviour, but it must be reachable before launch | `docs/prd/breakdown-plan.md` §5.14 |
| OQ8 | Does `FND-04`'s `schemas/openapi/openapi.yaml` enumerate the PRD §16.3 identity paths with the fields these seven areas need (**D4**)? | `00-foundation` (`FND-04`, serial-owned) | `IDNT-01`'s first contract test | Nothing — mismatches surface as a failing generated-type check | `docs/prd/breakdown-plan.md` §5.1/§6.2 + a `00-foundation` ticket; **never** edit `schemas/openapi/**` from here |

## Work breakdown

Lane is `13-identity-surface` and agent is `builder` for all nine (plan §1.1, §5.14). File-scopes are
write-owns and are disjoint. `apps/api/package.json` / `apps/web/package.json` are extended
append-only if a dependency is required (plan §1.1 "Package manifests"; conflicts resolve by re-running
the package manager, never by hand-merge).

| Ticket | Title | Size | Lane | File-scope (write-owns) | Depends on (`blocked_by`) |
|---|---|---|---|---|---|
| [`IDNT-01`](tickets/IDNT-01-auth-session-routes-and-organisation-switch-context.md) | Auth/session routes and organisation-switch context | M | `13-identity-surface` | `apps/api/src/routes/auth/**` (incl. the shared `_lib/**` toolkit, **D3**) | `RUNT-02` |
| [`IDNT-02`](tickets/IDNT-02-invitation-lifecycle-routes.md) | Invitation lifecycle routes | M | `13-identity-surface` | `apps/api/src/routes/invitations/**` | `IDNT-01`, `DATA-04` |
| [`IDNT-03`](tickets/IDNT-03-membership-and-role-routes-with-the-last-owner-invariant.md) | Membership and role routes with the last-Owner invariant | M | `13-identity-surface` | `apps/api/src/routes/members/**` | `IDNT-01` |
| [`IDNT-04`](tickets/IDNT-04-mfa-and-recent-auth-routes.md) | MFA and recent-auth routes | M | `13-identity-surface` | `apps/api/src/routes/mfa/**` | `IDNT-01`, `AUTC-02` |
| [`IDNT-05`](tickets/IDNT-05-sso-connection-routes-draft-test-activate-disable.md) | SSO connection routes (draft/test/activate/disable) | L | `13-identity-surface` | `apps/api/src/routes/sso/**` | `IDNT-01`, `AUTC-03` |
| [`IDNT-06`](tickets/IDNT-06-service-account-and-credential-routes.md) | Service-account and credential routes | M | `13-identity-surface` | `apps/api/src/routes/service-accounts/**` | `IDNT-01`, `AUTC-04` |
| [`IDNT-07`](tickets/IDNT-07-widget-session-creation-endpoint.md) | Widget-session creation endpoint | M | `13-identity-surface` | `apps/api/src/routes/widget-sessions/**` | `IDNT-06`, `AUTC-05` |
| [`IDNT-08`](tickets/IDNT-08-members-and-security-settings-screens.md) | Members and security settings screens | L | `13-identity-surface` | `apps/web/src/features/settings/{feature.tsx,_shell,members,security}/**` + `apps/web/src/features/auth/**` (**D7**, **D8**) | `RUNT-05`, `IDNT-02`, `IDNT-03`, `IDNT-04` |
| [`IDNT-09`](tickets/IDNT-09-sso-and-data-retention-settings-screens.md) | SSO and data/retention settings screens | M | `13-identity-surface` | `apps/web/src/features/settings/{sso,data}/**` | `RUNT-05`, `IDNT-05` |

**Schedule (plan §7): 9 tickets, 3 minimum waves, 5 useful lanes — not serial.**
Wave 1 `IDNT-01` · Wave 2 `IDNT-02` ‖ `IDNT-03` ‖ `IDNT-04` ‖ `IDNT-05` ‖ `IDNT-06` ·
Wave 3 `IDNT-07` ‖ `IDNT-08` ‖ `IDNT-09`.

**Who waits on this module** (inverse edges from plan §6.2, mirrored in each ticket's `blocks`):
`IDNT-01` → `IDNT-02`, `IDNT-03`, `IDNT-04`, `IDNT-05`, `IDNT-06` · `IDNT-02` → `IDNT-08` ·
`IDNT-03` → `IDNT-08` · `IDNT-04` → `IDNT-08` · `IDNT-05` → `IDNT-09` ·
`IDNT-06` → `IDNT-07`, `PLTF-04`, `PLTF-07` · `IDNT-07` → `PLTF-05` · `IDNT-08` → `ASSR-06` ·
`IDNT-09` → *(nothing)*.

**Cross-module dependency naming.** Cross-module `blocked_by` entries are referenced by id and module
directory rather than by relative file link, because sibling modules author their own filenames in this
same wave; intra-module links are relative paths.

## Acceptance — what makes this module done

The module is done when all nine tickets are `done` and the following hold. Each item is the
route/screen half of a requirement; the primitive half is `02-auth-core`, the persistence half is
`01-app-data`, and the automated end-to-end `UAT-*` replay is `23-assurance` (`ASSR-06`).

1. **AUTH-001 — invite-only access.** No route creates a user except invitation acceptance; the web app
   exposes no registration path; an invitation is single-use, expires at 72 h and rejects a mismatched
   email, each with a distinct closed `details.reason` behind one HTTP status (§30.2 AUTH-001, §8.1,
   §38.2, §35.4). Evidence: `IDNT-02`, `IDNT-08`. Manual: **`UAT-AUTH-01`** (*"Open signup URL without
   invitation → No public account creation path; marketing/login only"*) and **`UAT-AUTH-02`**
   (*"Accept same invite twice → First succeeds; second shows consumed/invalid with no new
   membership"*).
2. **AUTH-002 — organisation switching leaks no state.** The session carries exactly one active
   organisation; switching validates membership, rotates the session identifier and returns the new
   context; a non-member or unknown organisation is indistinguishable from an absent one (§30.2
   AUTH-002, §38.2, §16.5, **D11**). Evidence: `IDNT-01` (server) with `RUNT-05` (client cache purge).
3. **AUTH-003 — the §38.1 permission matrix passes end to end.** Every members route obtains its
   decision from `FND-06.evaluate()`; Admin cannot remove or change the last Owner; a Researcher,
   Viewer or Developer receives the matrix-correct refusal; the last-Owner invariant is enforced inside
   the same transaction as the write (§30.2 AUTH-003, §38.1, §8.1). Evidence: `IDNT-03`, `IDNT-08`.
4. **AUTH-004 — MFA and recent auth are enforced, not advertised.** Owner/Admin cannot reach protected
   workspace actions without an enrolled, confirmed factor; a protected action fails with
   `403 MFA_REQUIRED` or `403 RECENT_AUTH_REQUIRED`; the last factor cannot be removed while enrolment
   is required; recovery codes and TOTP secrets are displayed exactly once (§30.2 AUTH-004, §38.2,
   §21.1). Evidence: `IDNT-04`, `IDNT-08`.
5. **AUTH-005 — SSO is testable before enforcement and cannot lock the organisation out.** Activation
   and enforcement are refused unless the connection is `ACTIVE` with a current successful test, recent
   MFA and an acknowledged break-glass path, each refusal carrying its own reason; disabling never
   deletes configuration or blocks break-glass; break-glass use emits a high-priority security event
   (§30.2 AUTH-005, §16.3, §38.3). Evidence: `IDNT-05`, `IDNT-09`. Manual: **`UAT-AUTH-04`**
   (*"Owner enables SSO before test → Action blocked with exact test requirement and break-glass
   explanation"*).
6. **AUTH-006 — machine credentials are shown once, hashed, scoped, expiring and rotatable.** The
   creation response is the only place a credential string appears; every read returns prefix/status/
   expiry only; rotation with the default zero overlap makes the previous credential fail immediately
   (§30.2 AUTH-006, §38.4). Evidence: `IDNT-06` (API half; the `/developer/service-accounts` screen is
   `PLTF-07`).
7. **DEV-002 — widget sessions are short-lived, origin-bound and backend-minted.** Only a verified
   service credential can mint one; a cookie session or a widget token cannot; the token lives ≤15
   minutes, is opaque, and carries organisation, service account, pseudonymous external user, exact
   origins, features, environment and credit ceiling (§30.2 DEV-002, §38.4, §33.5). Evidence:
   `IDNT-07` (the loader and iframe are `PLTF-05`).
8. **SEC-001 tenant isolation across all seven route areas.** For every addressable identity resource,
   another organisation's id and an absent id return byte-identical `404 RESOURCE_NOT_FOUND` bodies
   apart from `request_id`; every repository call goes through a `TenantContext`-scoped accessor and an
   architecture assertion proves no route file imports an unscoped `packages/database` entry point
   (§21.2, §16.5, §30.2 SEC-001). Evidence: every `IDNT-0[1-7]` ticket, co-located (plan §9 **R8**).
   The record-id form of **`UAT-AUTH-03`** is rehearsed by `17-records-collab` and `ASSR-01`; the
   identity-resource form is rehearsed here.
9. **Accessibility.** Every screen this module owns — sign-in, accept-invite, MFA challenge,
   `/settings/members`, `/settings/security`, `/settings/sso`, `/settings/data` — passes an automated
   WCAG 2.2 AA pass at 360 px, 768 px and 1280 px with complete keyboard operation, visible focus,
   screen-reader labels, one programmatic `<h1>`, error summaries, live regions for asynchronous
   status, no colour-only status signal, `3 Aug 2026` date rendering and destructive actions that name
   their exact effect and recovery (§13.1, §41.1). Evidence: `IDNT-08`, `IDNT-09`.
10. **No secret or research content leaks.** No response body, log line, error message, URL query
    string, page title or telemetry payload contains a session token, invitation token, TOTP secret,
    recovery code, credential secret, SSO client secret or widget token (§22, §21.1, §41.1). Asserted
    with canary values in every ticket.
11. **Suite green.** `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm generate &&
    pnpm generated:check` pass on the merged default branch (§20.3, §45.3, §20.1). This module touches
    no Rust and no Python, so `cargo test --workspace` and `uv run pytest` are not gates here.

Not owned here and therefore not part of this module's done: the `packages/auth` primitives
(`02-auth-core`), the PRD §35.4 tables and the last-Owner database trigger (`DATA-04`), the §38.1
matrix itself (`FND-06`), the admission chain (`RUNT-02`), the app shell and organisation-scoped cache
purge (`RUNT-05`), `packages/ui` (`RUNT-06`), the `/developer/*` and `/usage` screens
(`20-developer-platform`) and the widget runtime (`PLTF-05`).

## Changelog

- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.14 (first phase,
  9 tickets, no ADRs available). Records three interpretations of plan §5.14 as **D7** (nested settings
  sub-area glob), **D8** (`features/auth/**` allocated to `IDNT-08`) and **D10** (SSO login/callback in
  `routes/sso/**`), each with an open question and a writeback target. Authored by the Architect; no
  code exists in the repository yet.
- **v0.2 — 2026-08-03** — aligned with the `docs/prd/breakdown-plan.md` §8 decision register.
  **Q14 CONFIRMED** (Resend on the Resend Free transactional tier, behind the existing
  `EmailTransport` port, owned by `WTCH-04`/`WTCH-09` in `16-monitor-alerts`) is recorded as **D14**,
  and the Non-goals row plus `IDNT-01`, `IDNT-02` and `IDNT-08` no longer say a provider is absent or
  that a Founder ruling is pending. `OQ4` is rewritten rather than closed: the provider question is
  settled, the Founder/cost framing is gone, and what remains is the unallocated identity send path —
  including the fact that module 13 cannot take a forward edge on module 16 (plan §3, plan §9 **R6**),
  so an emailed invitation is a plan writeback, never a local edge. The display-once acceptance URL
  and the configured-sink password-reset token are **retained** as PRD §35.4-permitted behaviour, not
  superseded. **Q12 CONFIRMED** (Node.js `24.18.0`, pnpm `11.4.0`, Rust `1.97.1`, Python `3.14.6`,
  committed by `FND-01`) is recorded as **D13**; `OQ9` is closed and removed, and `IDNT-01`, `IDNT-08`
  and `IDNT-09` now cite the pins instead of an open version question. No ticket id, `blocked_by`
  edge, file-scope, requirement mapping, acceptance gate or wave assignment changed. `OQ1`, `OQ2`,
  `OQ3`, `OQ5`, `OQ6`, `OQ7` and `OQ8` remain open exactly as authored.
