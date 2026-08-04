---
id: INTL-01
title: "`/internal/v1` separation, internal identity, admin shell"
module: 22-internal-admin
lane: 22-internal-admin
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-02, AUTC-02]
blocks: [INTL-02, INTL-03, INTL-04, INTL-05, INTL-06, INTL-07, INTL-08, INTL-09]
---

# INTL-01 — `/internal/v1` separation, internal identity, admin shell

Implements **PRD §8.11, §21.1, §38.2 — requirement `ADM-001`** (epic `E29-INTERNAL-ADMIN`), and fixes
the boundary that `ADM-002`, `ADM-003` and `COR-002` are enforced at.
No ADR for the requirement itself — the decision is already made in PRD §8.11 (*"Internal
administration MUST be separated under `/internal/v1`, require internal identity, MFA and short
sessions, and MUST NOT be shipped in customer SDKs"*); this is build ticket **1 of 10** against it.
This ticket **does** record one new architecture decision as an ADR (deliverable 12), because PRD
§38.1 fixes *that* internal identity is separate but not *where* it lives.
Parent sub-PRD: [22-internal-admin README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `RUNT-02` — Admission middleware chain ([`03-app-runtime`](../../03-app-runtime/README.md));
`AUTC-02` — MFA: TOTP, passkey, recovery codes, recent-auth assertion
([`02-auth-core`](../../02-auth-core/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope, wiring two already-built
contracts (`RUNT-02`'s `internal` admission profile, `AUTC-02`'s MFA and recent-auth assertions) into
the boundary PRD §8.11 already specifies — not a new subsystem decision.

## Background + basis

**What a fresh agent needs to know before touching anything.**

`RUNT-01` has merged and owns the API bootstrap. Its **A1 registration contract** is normative for
this ticket (quoted from `docs/prd/03-app-runtime/tickets/RUNT-01-...md`):

> **1. Discovery.** Every immediate child directory of `apps/api/src/routes/` is a **route area**. Its
> directory name is the area id. … Nested areas are addressed with a `/` in the derived prefix:
> `apps/api/src/routes/internal/core/` is area id `internal/core`.
>
> **4. Prefix derivation and collision.** Default prefix is `/v1/<area-id>`; `internal/<rest>` defaults
> to `/internal/v1/<rest>`; an explicit `prefix` overrides both. … If two areas would register the
> same method+path, boot fails with an error naming both areas and the path. Last-wins is forbidden.
>
> **6. Stability guarantee.** Adding, renaming or removing a route area produces **zero** diff outside
> that area's own directory.

A route area's `index.ts` has a default-exported `FastifyPluginAsync` and may export
`const area satisfies RouteAreaConfig` with `{ prefix?, admission?: 'public'|'probe'|'tenant'|'internal', order? }`.

`RUNT-02` has merged and owns the admission chain. Its deliverable 3 defines the profile this ticket
builds on:

> `internal` — the full list **plus** a separate internal-identity assertion and a recent-MFA
> assertion (PRD §8.11/§38.2 via `AUTC-02`); `22-internal-admin` (`INTL-01`) builds on it.

and its stage list is
`['request-limits','authenticate','resolve-organisation','verify-membership','evaluate-permission','rate-limit','pii-admission','schema-validate','legal-scope','budget-admission','idempotency']`,
with `RUNT-01`'s `404 RESOURCE_NOT_FOUND` body used for both an absent id and a denied addressable
resource, and `401 AUTHENTICATION_REQUIRED` / `403 MFA_REQUIRED` / `403 RECENT_AUTH_REQUIRED` from the
closed PRD §34.9 catalogue.

`AUTC-02` has merged and owns MFA. Its deliverable 6 gives the two pure assertions this ticket calls
and must not re-derive:

```ts
export function assertMfaSatisfied(facts: SessionAuthFacts): AssertResult
export function assertRecentAuth(facts: SessionAuthFacts, now: Date, windowSeconds?: number): AssertResult
```

with the window defaulting to `SESSION_DEFAULTS.recentAuthWindowSeconds` (PRD §38.2 — 10 minutes) and
a caller-supplied **longer** window rejected. `AUTC-02` explicitly reserves this ticket's job:
*"The internal-admin identity path (PRD §8.11, §38.1 'separate internal identity only') is `INTL-01`;
it consumes this assertion and MUST NOT define its own."*

**What the PRD fixes, quoted.**

PRD §8.11 (the whole internal surface, and the three MUSTs) — reproduced in the sub-PRD's Problem
section; the boundary clauses are: *"MUST be separated under `/internal/v1`, require internal
identity, MFA and short sessions, and MUST NOT be shipped in customer SDKs."*

PRD §16.1: *"Base path `/v1`; internal administration `/internal/v1`."* and *"Every response includes
`request_id`."*

PRD §38.1 role matrix, the internal row — for **every** customer role (Owner, Admin, Researcher,
Viewer, Developer, Service account) the cell for *"Internal source/release/incident admin"* reads
**"separate internal identity only"**, and the section closes: *"All checks are permission checks plus
resource membership; a role alone never authorises a record from another organisation."*

PRD §21.1: *"MFA for Owner/Admin/internal admins and recent auth for sensitive operations."*
PRD §21.2: *"Cross-organisation internal access uses a separate recent-MFA, reason-required, audited
path."*

PRD §31.2 route table, last row: `/internal/*` | Internal operations | **internal admin only** |
Operate sources/releases/incidents | **Separate identity and recent MFA**.

PRD §32.8: *"Internal pages MUST optimise for a solo operator … **Dangerous actions use recent MFA,
typed confirmation, scope, reason and expiry/review.**"*

PRD §12.4: *"Every activation requires actor, reason, scope, incident and review/expiry time and
**cannot bypass audit or delete data**."*

PRD §39.1's process graph places the admin bundle with the other static assets —
`WEB[Cloudflare Pages: Web/admin/widget assets] --> APP[app: Fastify API + auth + SSE]` — so
`apps/admin` is a separately built static bundle talking to the same `app` process over the tunnel,
exactly like `apps/web`.

PRD §30.2 `ADM-001`: *"Source health, quarantine, release, licensing, evaluation and costs are visible
internally"*, primary route `/internal/*`, primary API `/internal/v1/*`, minimum acceptance evidence
**"Customer identity cannot call internal routes"**.

**Accepted caveats carried forward, documented not enforced here.**

- **"Short sessions" has no number in the PRD.** PRD §8.11 requires them; PRD §38.2's table gives the
  *customer* defaults (8 h idle, 7 d absolute), which are not short. This ticket pins an initial
  default (deliverable 4) and records it as an **initial default, not a product rule** (PRD §45.1
  item 5). Sub-PRD open question **M2**, owner Founder.
- **Internal identity storage** is configuration, not a tenant table (sub-PRD **D4**). PRD §35.4 has
  no internal-admin table and `packages/database/**` belongs to `01-app-data` (plan **A3**). This is
  the ticket's ADR (deliverable 12); sub-PRD **M3**.
- **`RUNT-02`'s `internal` profile still runs `resolve-organisation` and `verify-membership`**, which
  have no meaning for an operator principal with no organisation (sub-PRD **M9**). This ticket states
  the operator-scope semantics it needs and writes back if the chain cannot express them.
- **`apps/admin` may not import `packages/ui` or `packages/observability`** — no plan edge exists to
  `RUNT-06`/`RUNT-07` (sub-PRD **D8**).

## Goal

Produce the internal boundary and the admin shell: the `internal/core` route area exporting
`internalArea()`, `internalRoutes()` and `withDangerousAction()` that all eight sibling consoles build
on; a boot-time assertion that every registered internal area is mounted under `/internal/v1/`; an
internal-identity resolver backed by configuration with MFA and short-session policy enforced at the
boundary; a fail-closed audit sink so no dangerous action can run unaudited; the
`OperationalSnapshotStore` port with its fixture binding; a non-vacuous assertion that no internal
path, schema or type reaches the customer OpenAPI root, generated bindings or SDKs; and the
`apps/admin` static shell whose feature areas self-register by directory. Completion is mechanically
checkable: a conformance test creates a throw-away internal area, boots with zero diff to any tracked
file, and asserts it is served under `/internal/v1/<area>` and is invisible (byte-identical 404) to a
customer session, a customer service-account credential and a widget token.

## Non-goals

- **No console features.** Sources, quarantine, releases, licensing, evaluation, cost, issues and
  incidents are `INTL-02`…`INTL-09`, each `blocked_by` this ticket. This ticket ships **no** route
  area under `apps/api/src/routes/internal/` other than `core`, and **no** feature under
  `apps/admin/src/features/` other than what its own conformance test creates and deletes.
- **No operator overview screen.** `INTL-10`.
- **No table, migration or repository.** `packages/database/**` is `01-app-data` (plan **A3**, PRD
  §45.2). Audit rows are appended through an injected sink, never a direct table write — the same
  discipline `AUTC-02` uses for security events.
- **No session, cookie, MFA, passkey, recovery-code or credential implementation.** `02-auth-core`
  (`AUTC-01`…`AUTC-05`). This ticket calls `assertMfaSatisfied` / `assertRecentAuth` and defines no
  second window.
- **No admission stage, route autoload mechanism, error catalogue or SSE.** `RUNT-01`, `RUNT-02`,
  `RUNT-03`. This ticket consumes `RouteAreaConfig`, the `internal` profile and `ApiError`.
- **No kill-switch enforcement.** `RUNT-02`'s chain (sub-PRD **D13**, **M10**).
- **No customer OpenAPI, contract or SDK edits.** `schemas/openapi/**` and
  `packages/contracts/src/**` are `FND-03`/`FND-04`, serial-owned (plan §4.1);
  `packages/sdk-typescript/**` and `sdk/python/**` are `20-developer-platform`. This ticket only
  **asserts** their content.
- **No `packages/ui`, `packages/observability`, `apps/web` or `apps/widget` code.** Sub-PRD **D8**.
- **No production host, deployment or Cloudflare Pages configuration for `apps/admin`.**
  `18-ops-release` (`RLSE-02`, `RLSE-03`). This ticket produces a static build; where it is served
  from is `RLSE-03`'s.

## File-scope (write-owns)

- `apps/api/src/routes/internal/core/**`
- `apps/api/test/internal/core/**` (sub-PRD **D11**)
- `apps/admin/src/app/**`
- `apps/admin/index.html`, `apps/admin/vite.config.ts`, `apps/admin/tsconfig.json` (sub-PRD **D10**)
- `apps/admin/test/app/**` (sub-PRD **D11**)
- `apps/admin/package.json` — **append-only** extension of the empty workspace-member skeleton
  `FND-01` created (plan §1.1; PRD §20.1 lists `apps/admin` as a member)
- Root `pnpm-lock.yaml` as a regenerated build artifact only (plan §4.1 — regenerate, never hand-merge)
- `docs/adr/NNNN-internal-identity-boundary.md` — a **new** file claimed by this ticket under plan
  **A9** (*"`docs/adr/**` is the only shared-additive directory: ownership is per file, claimed by the
  ticket that creates `NNNN-<slug>.md`"*). Take the lowest unused four-digit number at build time; the
  slug `internal-identity-boundary` is reserved to this ticket.

Does not touch:

- `apps/api/src/routes/internal/{sources,quarantine,releases,licensing,evaluation,cost,issues,incidents}/**`
  — `INTL-02`…`INTL-09`.
- `apps/admin/src/features/**` — `INTL-02`…`INTL-10`.
- `apps/api/src/{server.ts,app.ts,bootstrap,errors,plugins,middleware,sse}/**` and
  `apps/api/src/routes/{health,system-status}/**` — `RUNT-01`, `RUNT-02`, `RUNT-03`, `RUNT-08`.
- Every other `apps/api/src/routes/<area>/**` — modules `13`, `14`, `15`, `16`, `17`, `19`, `20`.
- `apps/web/**`, `apps/widget/**` — `03-app-runtime` + product modules, `20-developer-platform`.
- `packages/**` — `00-foundation`, `01-app-data`, `02-auth-core`, `03-app-runtime`, `11`, `12`, `20`.
- `schemas/**` — `FND-04`, `FND-05`, `CRPS-02`, `GOLD-01` (serial-owned, plan §4.1).
- `infra/**`, `docs/runbooks/**`, `tests/**`, `pipelines/**`, `evals/**` — `18-ops-release`,
  `23-assurance`, modules `04`–`10`, `21`.

**Serial-safety analysis.** This is the **first** decomposition (plan §1: phase 1, `append: false`,
`usedIds: []`, `existingFiles: ['.gitkeep']`): nothing is merged and no ticket is in flight, so no
prior ticket has written these paths and none contends for them. Within this module, this ticket is
the sole member of wave 1 (plan §7: 10 tickets, min 3 waves, 8 peak lanes) — every sibling is
`blocked_by` it, so none runs concurrently with it. The two sibling subtree families are disjoint by
construction under plan **A1**: `apps/api/src/routes/internal/<area>/` is a directory per ticket
(`core` here, one per console elsewhere) and `apps/admin/src/features/<area>/` likewise, so adding a
console changes no file this ticket owns (`RUNT-01` contract item 6, mirrored for the admin app in
deliverable 9). Outside the module, `apps/api/src/routes/internal/**` and `apps/admin/**` are
write-owned by `22-internal-admin` alone (plan §4). The only shared-additive paths are
`apps/admin/package.json` (append-only within the module, plan §1.1), the root lockfile (regenerated
artifact, plan §4.1) and `docs/adr/` (per-file ownership, plan **A9**; this slug is unique).

## The internal boundary contract (normative for `INTL-02`…`INTL-10`)

Eight sibling tickets build against this section. It must be implementable without any of them editing
a file this ticket owns.

**1. Area declaration.** Every internal console's `apps/api/src/routes/internal/<area>/index.ts` is:

```ts
import { internalArea, internalRoutes } from '../core';
export const area = internalArea({ areaId: 'sources', capability: 'SOURCE_HEALTH' });
export default internalRoutes(async (app) => { /* app.get('/', …) */ },
                              { areaId: 'sources', capability: 'SOURCE_HEALTH' });
```

`internalArea()` returns `{ admission: 'internal' } satisfies RouteAreaConfig` — it never sets
`prefix`, so the mount point comes from `RUNT-01`'s derivation and cannot be overridden per area.

**2. Mount assertion.** At boot, `assertInternalMounting(loadedAreas)` runs over `RUNT-01`'s
`LoadedRouteArea[]` and **fails boot** if (a) any area whose id starts with `internal/` has a prefix
that does not start with `/internal/v1/`, or (b) any area outside `internal/` has a prefix that does
start with `/internal/v1/`. Both directions matter: the first stops an internal console leaking onto
`/v1`, the second stops a product module squatting the internal namespace.

**3. Guard order.** `internalRoutes()` wraps the area's plugin so that, before any handler runs:
internal identity is resolved → `assertMfaSatisfied` → short-session policy → capability check. A
failure is mapped as in item 4. The guard runs **inside** `RUNT-02`'s chain, not instead of it.

**4. Denial semantics (sub-PRD D3).**

| Caller | Response |
|---|---|
| No credential | `401 AUTHENTICATION_REQUIRED` (platform-wide, `RUNT-02`) |
| Customer session, customer service-account credential, or widget token | `404 RESOURCE_NOT_FOUND`, **byte-identical** (apart from `request_id`) to the body for an unknown path |
| Internal identity without a confirmed MFA factor | `403 MFA_REQUIRED` |
| Internal identity whose session exceeded the short-session policy | `401 AUTHENTICATION_REQUIRED` |
| Internal identity lacking the area's capability | `404 RESOURCE_NOT_FOUND`, same body as above |
| Dangerous action without recent auth | `403 RECENT_AUTH_REQUIRED` |

**5. Operator scope.** An internal principal has **no** organisation. Any read that crosses
organisations goes through `crossOrganisationRead(ctx, { reason })`, which requires a non-empty reason
and appends an audit event before returning a reader (PRD §21.2). There is no other path from an
internal route to tenant data.

**6. Dangerous actions.** Any state-changing internal operation is wrapped in
`withDangerousAction()` (deliverable 6). Its ordering, required fields and audit-before-effect rule
are fixed there and are not re-implemented per console.

**7. Operational reads.** Non-app-database operational state is read through
`OperationalSnapshotStore` (deliverable 7). A console never opens a database file, an object store or
a pipeline module (sub-PRD **D5**).

**8. Stability guarantee.** Adding, renaming or removing an internal console produces **zero** diff
outside its own `apps/api/src/routes/internal/<area>/` and `apps/admin/src/features/<area>/`
directories. The conformance harness of deliverable 11 is the executable form of this contract.

## Deliverables

1. **`apps/api/src/routes/internal/core/index.ts`** — the `internal/core` route area. Default-exports
   a `FastifyPluginAsync` (mounted at `/internal/v1/core`) and re-exports the contract surface:
   `internalArea`, `internalRoutes`, `withDangerousAction`, `crossOrganisationRead`,
   `OperationalSnapshotStore`, `setOperationalSnapshotStore`, `setInternalAuditSink`,
   `INTERNAL_SESSION_DEFAULTS`, `InternalCapability`. Exports `const area = internalArea({ areaId:
   'core', capability: 'CORE' })`.
2. **`core/area.ts`** — `export interface InternalAreaOptions { readonly areaId: string; readonly
   capability: InternalCapability }`, `export function internalArea(o: InternalAreaOptions):
   RouteAreaConfig` (returns `{ admission: 'internal' }` only), `export function
   internalRoutes(plugin: FastifyPluginAsync, o: InternalAreaOptions): FastifyPluginAsync`, and
   `export function assertInternalMounting(areas: readonly LoadedRouteArea[]): void` implementing
   contract item 2 (throws a named error listing the offending area ids and prefixes). `InternalCapability`
   is a union covering exactly the nine PRD §8.11 surfaces plus `CORE`: `'CORE' | 'SOURCE_HEALTH' |
   'QUARANTINE' | 'RELEASES' | 'LICENSING' | 'EVALUATION' | 'COST' | 'ISSUES' | 'INCIDENTS'`. If
   `packages/contracts` (`FND-03`) already exports an equivalent enum, **import it instead of
   redefining** (PRD §35.1).
3. **`core/identity.ts`** — internal identity resolution from configuration (sub-PRD **D4**).
   `export interface InternalPrincipal { readonly internalActorId: string; readonly capabilities:
   readonly InternalCapability[]; readonly userId: string }` and
   `export function resolveInternalPrincipal(session, config): InternalPrincipal | null`. The roster
   is loaded through `RUNT-01`'s `ApiConfig` (PRD §39.6 layered configuration; secrets injected, not
   committed) and is **empty by default** — with no roster configured, every internal route denies.
   The resolver never consults `membership` or a tenant role (PRD §38.1). Every resolution failure
   emits an audit event with the request id, principal kind and outcome — and no request body
   (PRD §22, §42.2).
4. **`core/session-policy.ts`** — `export const INTERNAL_SESSION_DEFAULTS` with
   `idleTimeoutSeconds`, `absoluteLifetimeSeconds` and `recentAuthWindowSeconds`. Initial values:
   idle **1 800 s (30 min)**, absolute **28 800 s (8 h)**, recent auth **`SESSION_DEFAULTS.recentAuthWindowSeconds`
   imported from `packages/auth`** (PRD §38.2's 10 minutes — never a local literal). Each constant
   carries a comment naming PRD §8.11 (*"short sessions"*), stating that the two internal numbers are
   **initial defaults, not product rules** (PRD §45.1 item 5), and pointing at sub-PRD **M2**. The
   values are overridable by configuration **downward only**: a configured value longer than the
   default is rejected at load, mirroring `AUTC-02`'s rejection of a longer recent-auth window.
5. **`core/audit.ts`** — `export interface InternalAuditSink { append(event: InternalAuditEvent):
   Promise<void> }`, `export function setInternalAuditSink(sink: InternalAuditSink): void`,
   `export function getInternalAuditSink(): InternalAuditSink | null`. `InternalAuditEvent` carries
   actor, action, capability, scope type + payload, reason, target ids, result, request id, IP and
   timestamp — and **no free-text body parameter** beyond `reason`, which is length-bounded. With no
   sink bound, `withDangerousAction` **rejects** (deliverable 6); read-only routes log the absence
   once at boot as a named warning. The production binding is `DATA-07`'s `appendAuditEvent`, wired by
   `INTL-09` (the only ticket in this module with a `DATA-07` edge) — this ticket ships the port and a
   recording fake.
6. **`core/dangerous-action.ts`** — the single envelope (sub-PRD **D6**).
   ```ts
   export interface DangerousActionRequest {
     readonly action: string;                    // stable action id, e.g. 'RELEASE_PROMOTE'
     readonly capability: InternalCapability;
     readonly scope: { readonly type: string; readonly payload: Readonly<Record<string, unknown>> };
     readonly reason: string;                    // required, 8–500 chars
     readonly confirmation: string;              // must equal the server-computed challenge
     readonly incidentId?: string;               // required when requiredFields.incident is true
     readonly reviewOrExpiryAt?: string;         // ISO-8601 UTC; required when requiredFields.expiry is true
   }
   export async function withDangerousAction<T>(
     ctx: InternalRequestContext,
     req: DangerousActionRequest,
     required: { incident?: boolean; expiry?: boolean },
     effect: (authorised: AuthorisedAction) => Promise<T>,
   ): Promise<T>;
   ```
   Fixed order, each step failing before the next: (a) internal principal present and holds
   `req.capability`; (b) `assertMfaSatisfied`; (c) `assertRecentAuth(facts, now)` — no `windowSeconds`
   argument is ever passed; (d) `confirmation` equals the challenge returned by
   `challengeFor(action, scope)` (a deterministic, server-computed phrase naming the exact effect,
   PRD §41.1 *"destructive/security-sensitive actions name exact effect and recovery"*); (e) required
   fields present, `reviewOrExpiryAt` strictly in the future; (f) **audit append with
   `result: 'AUTHORISED'`, awaited, before `effect` is called** — if the sink is unbound or the append
   throws, the action is refused with `503` and `effect` never runs; (g) `effect`; (h) audit append
   with `result: 'SUCCEEDED' | 'FAILED'` and the failure code. `AuthorisedAction` carries the audit
   event id so the effect can reference it.
7. **`core/snapshots.ts`** — the operational read port (sub-PRD **D5**).
   ```ts
   export interface OperationalSnapshot<T> {
     readonly kind: SnapshotKind;      // 'REGISTRY' | 'QUARANTINE' | 'LICENSING' | 'RELEASE' | 'EVALUATION'
     readonly generatedAt: string;     // producer's own timestamp, never the read time
     readonly sourceRef: string;       // producer id/path/release id, for display
     readonly schemaVersion: string;
     readonly body: T;
   }
   export type SnapshotResult<T> =
     | { readonly state: 'AVAILABLE'; readonly snapshot: OperationalSnapshot<T>; readonly ageSeconds: number }
     | { readonly state: 'STALE';     readonly snapshot: OperationalSnapshot<T>; readonly ageSeconds: number }
     | { readonly state: 'UNAVAILABLE'; readonly reason: 'NOT_CONFIGURED' | 'NOT_FOUND' | 'INVALID_SCHEMA'; readonly detail: string };
   export interface OperationalSnapshotStore { read<T>(kind: SnapshotKind, key?: string): Promise<SnapshotResult<T>> }
   export function setOperationalSnapshotStore(s: OperationalSnapshotStore): void;
   ```
   Plus `fileSnapshotStore(rootDir, validators)` — the default binding, reading versioned JSON
   documents from a configured directory and validating each against the producing module's committed
   JSON Schema before returning it (an invalid document is `UNAVAILABLE / INVALID_SCHEMA`, never a
   partially-parsed body). Staleness thresholds are per kind, from configuration, with documented
   initial defaults. **No console may bypass this port**; asserted by deliverable 11's architecture
   test. The production placement of these documents is sub-PRD **M1**.
8. **`core/routes.ts`** — the `/internal/v1/core` endpoints, all read-only:
   `GET /whoami` (internal actor id, capabilities, session expiry instants, MFA state — no roster
   contents), `GET /capabilities` (the registered internal areas and their capabilities, derived from
   `LoadedRouteArea[]`, so a new console appears with no edit here), and `GET /contract` (this
   module's internal contract document, deliverable 10). No endpoint returns configuration values,
   secrets or another principal's identity.
9. **`apps/admin` shell** — `index.html`, `vite.config.ts`, `tsconfig.json`, and under `src/app/**`:
   - `feature-contract.ts` — `export interface AdminFeatureModule { id, title, nav?: { slot, label,
     order }, routes: { path, element }[], onInternalSessionEnd?(): void }`;
   - `feature-registry.ts` — discovery by glob
     `import.meta.glob('../features/*/feature.tsx', { eager: true })` (a **pattern, not a list**;
     sub-PRD **D9**), deterministic ordering, and a build-time failure naming both features on a route
     collision;
   - `shell.tsx` — persistent header showing environment label, app version, active corpus release id
     (from `INTL-04`'s endpoint when present, `UNAVAILABLE` otherwise), internal actor id and a
     **visible session countdown** driven by `INTERNAL_SESSION_DEFAULTS`, plus a sign-out control;
   - `async-states.tsx` — the PRD §31.3 states (`IDLE`, `VALIDATING`, `QUEUED`, `RUNNING`,
     `WAITING_FOR_CLARIFICATION`, `CANCELLING`, `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED`) each
     with title, plain-language explanation, allowed next action and copyable request/job id — plus
     `SnapshotStatePanel` rendering `AVAILABLE`/`STALE`/`UNAVAILABLE` with the producer's own
     `generatedAt` and `sourceRef` (never a blank or a zero);
   - `dangerous-action-dialog.tsx` — the shared confirmation dialog: names the exact effect, requires
     the typed challenge phrase, a reason, and (where the action declares them) an incident id and a
     review/expiry instant; disables submit until all are present;
   - `client.ts` — the `/internal/v1` fetch client attaching `x-request-id`, surfacing PRD §16.1 error
     bodies verbatim, and treating `401` as "session ended" (clearing all in-memory state);
   - **no** import of `packages/ui` or `packages/observability` (sub-PRD **D8**), asserted in
     deliverable 11.
10. **Internal contract document** — `core/contract/internal-v1.ts` builds the `/internal/v1`
    description from the registered areas' route schemas at runtime and writes nothing outside
    `apps/api/src/routes/internal/core/contract/`. It is served by `GET /internal/v1/core/contract`.
    It is **never** merged into `schemas/openapi/**` (sub-PRD **D7**, **M8**).
11. **Assertions shipped as reusable helpers** under `apps/api/test/internal/core/` — exported so every
    sibling console re-runs them rather than re-inventing them:
    - `internalAreaConformance(areaId)` — creates a throw-away internal area in a `mkdtemp` root,
      boots via `registerRouteAreas({ root })` (reusing `RUNT-01`'s exported
      `apps/api/test/route-area-conformance.ts` harness), asserts the derived prefix, the four denial
      rows of contract item 4, and cleans up leaving `git status --porcelain` clean;
    - `assertNoInternalSurfaceInCustomerArtifacts()` — sub-PRD **D7**: **always** scans
      `schemas/openapi/**` and `packages/contracts/src/generated/**` for `/internal/`, `internal/v1`
      and any exported internal type name, failing if found; **additionally** scans
      `packages/sdk-typescript/**`, `sdk/python/**` and `apps/widget/**` when those directories exist,
      and records in the assertion result which trees were scanned so a skipped tree is visible rather
      than silent;
    - `assertNoContentLeak(responseBytes | logLines, canaries)` — PRD §22 canary check;
    - `assertSnapshotPortOnly()` — an architecture scan over `apps/api/src/routes/internal/**`
      forbidding imports of a SQLite driver, an object-store SDK, `node:fs` outside
      `core/snapshots.ts`, and any `pipelines/` path.
12. **`docs/adr/NNNN-internal-identity-boundary.md`** — records sub-PRD **D4** and **D5** per PRD
    §45.5 (*"Architecture decision: durable technology/dependency/deployment trade-off; requires an ADR
    under `docs/adr/` and compatibility/security review"*): internal identity as configuration rather
    than tenant data; the snapshot port rather than direct corpus/ingestion access; the alternatives
    rejected (sub-PRD Rejected alternatives table); and the consequence that eight console tickets
    depend on this boundary being stable.

## Acceptance checklist (classified)

- [ ] `[machine]` An internal route area consisting of exactly one new directory under
      `apps/api/src/routes/internal/` is served at `/internal/v1/<area>` after boot with **zero** diff
      to any tracked file outside that directory (plan **A1**; `RUNT-01` contract items 1, 4, 6)
- [ ] `[machine]` `assertInternalMounting` fails boot when an `internal/*` area resolves to a prefix
      outside `/internal/v1/`, **and** when a non-internal area resolves to a prefix inside it — both
      directions asserted (PRD §8.11, §16.1)
- [ ] `[machine]` **`ADM-001` negative:** a customer session, a customer service-account credential and
      a widget token each receive a `404 RESOURCE_NOT_FOUND` body **byte-identical** (apart from
      `request_id`) to the unknown-path body, on `/internal/v1/core/whoami` and on the conformance
      area (PRD §30.2 `ADM-001` *"Customer identity cannot call internal routes"*; PRD §16.5, §34.9)
- [ ] `[machine]` An unauthenticated call returns `401 AUTHENTICATION_REQUIRED`; an internal principal
      without a confirmed MFA factor returns `403 MFA_REQUIRED`; an internal principal lacking the
      area capability returns the same `404` as above (PRD §8.11, §21.1, §34.9)
- [ ] `[machine]` With **no** internal roster configured, every internal route denies — the default is
      closed (PRD §39.6; sub-PRD **D4**)
- [ ] `[machine]` `INTERNAL_SESSION_DEFAULTS.recentAuthWindowSeconds` is imported from `packages/auth`
      and no numeric literal for a recent-auth window exists under
      `apps/api/src/routes/internal/core/**`; a configured session value **longer** than the default is
      rejected at load (PRD §38.2, §8.11; `AUTC-02`)
- [ ] `[machine]` A session past `idleTimeoutSeconds` or `absoluteLifetimeSeconds` is rejected with
      `401`, asserted at boundary ±1 s with a fake clock (PRD §8.11 *"short sessions"*)
- [ ] `[machine]` **`withDangerousAction` ordering:** each of missing capability, unsatisfied MFA,
      stale recent auth, wrong typed confirmation, missing reason, missing incident (when required),
      absent/past `reviewOrExpiryAt` (when required) rejects **before** `effect` runs — asserted by a
      spy proving `effect` was never called (PRD §32.8, §12.4, §20.4)
- [ ] `[machine]` **Audit cannot be bypassed:** with no audit sink bound, `withDangerousAction`
      refuses and `effect` never runs; with a sink bound, the `AUTHORISED` event is appended **before**
      `effect` and a `SUCCEEDED`/`FAILED` event after; a sink that throws refuses the action
      (PRD §12.4 *"cannot bypass audit"*; `ADM-002`)
- [ ] `[machine]` **No deletion surface:** an architecture scan proves nothing under
      `apps/api/src/routes/internal/core/**` exports or calls a delete/purge/truncate operation on any
      repository, and `withDangerousAction` has no code path that removes data (PRD §12.4 *"or delete
      data"*, §42.5)
- [ ] `[machine]` `crossOrganisationRead` rejects an empty reason and appends an audit event before
      returning a reader (PRD §21.2)
- [ ] `[machine]` **Sub-PRD D7 / PRD §8.11:** `assertNoInternalSurfaceInCustomerArtifacts()` is green —
      no `/internal/` path, `internal/v1` string or internal type name appears in `schemas/openapi/**`
      or `packages/contracts/src/generated/**`; SDK and widget trees are additionally scanned when
      present and the assertion result names every tree scanned (never a silent skip)
- [ ] `[machine]` `assertSnapshotPortOnly()` is green: no SQLite driver, object-store SDK, `pipelines/`
      import or `node:fs` use outside `core/snapshots.ts` under `apps/api/src/routes/internal/**`
      (sub-PRD **D5**; PRD §18.3, §39.1)
- [ ] `[machine]` `fileSnapshotStore` returns `UNAVAILABLE / INVALID_SCHEMA` for a document failing its
      JSON Schema and never a partially-parsed body; `STALE` is returned with the producer's own
      `generatedAt`, not the read time (sub-PRD **D5**)
- [ ] `[machine]` `apps/admin` builds; the feature registry serves a throw-away feature directory with
      zero diff to any tracked file, and two features claiming one route path fail the build naming
      both (sub-PRD **D9**; plan **A1**)
- [ ] `[machine]` `apps/admin/src/**` imports neither `packages/ui` nor `packages/observability`
      (sub-PRD **D8**) — source scan
- [ ] `[machine]` PRD §22 canary: a canary string placed in a request body and in a snapshot document
      appears in **no** response body and **no** emitted log line or audit event
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — no generated OpenAPI/SDK binding was
      hand-edited and the internal contract did not enter the customer root (PRD §20.1; sub-PRD **M8**)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `ADM-001`, the absence of a `UAT-ADM-*` row
      (sub-PRD **M4**), tenant/PII/security impact, rollback path and known gaps
- [ ] `[fixture]` The committed operational-snapshot fixtures under
      `apps/api/test/internal/core/fixtures/**` (one valid, one stale, one schema-invalid, one absent)
      replay through `fileSnapshotStore` to `AVAILABLE`, `STALE`, `UNAVAILABLE/INVALID_SCHEMA` and
      `UNAVAILABLE/NOT_FOUND` respectively — offline, no network, no production credentials
- [ ] `[human]` `docs/adr/NNNN-internal-identity-boundary.md` exists, records sub-PRD **D4** and
      **D5**, and its number does not collide with another ADR on the default branch (PRD §45.5, plan
      **A9**)
- [ ] `[human]` Sub-PRD **M2** (internal session length) and **M9** (`RUNT-02` operator scope) are
      written back to `docs/prd/22-internal-admin/README.md` with their resolution or their unchanged
      status before merge
- [ ] `[human]` Gate 2 smoke linkage, **not required to merge**: an operator signs in to `apps/admin`
      with internal identity + MFA, observes the session countdown, and confirms a customer login
      cannot reach any `/internal/*` screen (PRD §31.2 route row; CLAUDE.md Gate 2)
- No further `[human]` criteria — PRD §41.2 contains **no** `UAT-ADM-*` row (sub-PRD **M4**); the
  `ADM-001` evidence is the machine assertion above, and the `UAT-OPS-*` scripts belong to `INTL-04`
  and `INTL-07`
- No `cargo test --workspace` / `uv run pytest` item — this ticket touches no Rust and no Python
  (PRD §45.3, plan §1.1)

## Test plan

Reviewer steps, all reproducible offline: no network, no production credentials, no real internal
roster, no provider.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test` (full suite green), then the focused runs
   `pnpm test --filter @aer/api` and `pnpm test --filter @aer/admin` (or the workspace filters
   `FND-01` established). API suites live under `apps/api/test/internal/core/`, admin suites under
   `apps/admin/test/app/`.
3. **`mounting.test.ts`** — harness: `buildApp()` from `RUNT-01` with fixture areas written into a
   `mkdtemp` root, exactly the construction pattern in `apps/api/test/route-area-conformance.ts`
   (`RUNT-01`) and `apps/api/test/admission/stage-order.test.ts` (`RUNT-02`). Assert `internal/demo`
   → `/internal/v1/demo`; assert `assertInternalMounting` throws for an `internal/*` area with an
   explicit non-internal prefix and for a `products` area with an explicit `/internal/v1/x` prefix.
4. **`denial.test.ts`** — fake principals from `packages/auth`'s test doubles (`AUTC-01`) for the
   three customer kinds and one internal kind. Capture the unknown-path 404 body, then each denial
   body, mask `request_id`, and assert byte equality. Assert the 401/403 rows with a fake clock.
5. **`dangerous-action.test.ts`** — table-driven over the seven rejection causes with an `effect` spy;
   assert `effect.calls === 0` in every rejection row and exactly one `AUTHORISED` audit event
   preceding the single `effect` call in the success row. Add: unbound sink → refusal; sink throwing
   on the pre-effect append → refusal and no `effect` call; `effect` throwing → one `FAILED` audit
   event carrying the failure code and no partial state.
6. **`snapshots.test.ts`** — `[fixture]` replay of the four committed documents; assert `ageSeconds`
   is computed from `generatedAt` with a fake clock, and that a schema-invalid document yields
   `INVALID_SCHEMA` with no body exposed.
7. **`architecture.test.ts`** — `assertSnapshotPortOnly()` and the `packages/ui` /
   `packages/observability` scan; copy the construction pattern from
   `apps/api/test/admission/architecture.test.ts` (`RUNT-02`) so the assertions stay recognisably the
   same.
8. **`sdk-exclusion.test.ts`** — `assertNoInternalSurfaceInCustomerArtifacts()`; assert the result
   object enumerates every tree scanned and that the two always-present trees
   (`schemas/openapi/**`, `packages/contracts/src/generated/**`) are among them. Then, as a negative
   control, point the helper at a temporary tree containing `/internal/v1/sources` and assert it
   fails — proving the assertion can fail.
9. **`admin-shell.test.tsx`** — render the shell with a fake internal session; assert the countdown
   reaches zero at `idleTimeoutSeconds` under a fake clock and that a `401` from `client.ts` clears
   in-memory state. Mount a throw-away feature directory and assert the route resolves; assert a
   duplicate route path fails the build.
10. `git status --porcelain` after the full run must be clean — no conformance fixture left behind.
11. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether any
    ordering in `withDangerousAction` can be satisfied out of order; whether the audit append is
    genuinely awaited before `effect`; whether a customer principal can reach an internal route by
    supplying an organisation header (it must be rejected by `RUNT-02`, and the internal guard must
    not re-admit it); whether `crossOrganisationRead` can be obtained without a reason; whether the
    404 bodies differ in timing class as well as bytes; whether the snapshot port can be bypassed by a
    dynamic import.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `.claude/scripts/publish-tickets.mjs
--sync`, and only then change code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`RUNT-02`'s `internal` profile cannot express an operator principal with no organisation**
  (sub-PRD **M9**) → amend `RUNT-02`'s Deliverable 3 and this ticket's contract item 5 in **one** docs
  PR, then `--sync` both, before writing middleware-adjacent code. Write the resolution into
  `docs/prd/03-app-runtime/README.md` and `docs/prd/22-internal-admin/README.md` (**M9**). Do **not**
  add a second admission path inside `internal/core`.
- **`RUNT-01`'s `internal/<rest>` prefix derivation does not work** → that falsifies plan **A1** for
  the internal namespace and is plan risk **R1**. Write, in order: `docs/adr/NNNN-internal-identity-boundary.md`
  (consequences section), `docs/prd/breakdown-plan.md` §4.2, `docs/prd/22-internal-admin/README.md`
  D1 — before touching `apps/api/src/routes/`.
- **The internal roster genuinely needs a database table** (sub-PRD **M3**) → do **not** write
  `packages/database/**` (plan **A3**, PRD §45.2). Add the ticket to `docs/prd/breakdown-plan.md`
  §5.2 and the `blocked_by` edge in §6.2 (the path plan **R4** prescribes), and record it in
  `docs/prd/22-internal-admin/README.md` **M3**.
- **`packages/contracts` does not export an internal capability enum** → canonical enums are
  serial-owned by `FND-03` (plan §4.1). Raise a `00-foundation` ticket, note the temporary local union
  in `docs/prd/22-internal-admin/README.md`, and do not write `packages/contracts/**`.
- **`pnpm generate` pulls internal route schemas into `schemas/openapi/**`** (sub-PRD **M8**) → this
  directly violates PRD §8.11. Stop, record it in `docs/prd/22-internal-admin/README.md` **M8**, raise
  a `00-foundation` (`FND-04`) ticket, and do not "fix" it by deleting entries from the generated
  root, which PRD §20.1 forbids hand-editing.
- **The admin shell needs a component that already exists in `packages/ui`** (sub-PRD **D8**) → the
  writeback is a plan edge in `docs/prd/breakdown-plan.md` §5.23 (`INTL-01` gains `RUNT-06`) plus
  §6.2, then `--sync`. Never add the import without the edge — `/start-all` may schedule this ticket
  before `RUNT-06`.
- **A "short session" default breaks a real operator workflow** (sub-PRD **M2**) → the numbers are
  initial defaults, not product rules. Record the measurement and the proposed value in
  `docs/prd/22-internal-admin/README.md` **M2** with the Founder as owner; ship the conservative value
  behind configuration meanwhile. Never lengthen it past PRD §38.2's customer defaults.

**3. Escalation.** PRD §8.11's three clauses are MUSTs and eight tickets in this module plus
requirements `ADM-001/002/003` and `COR-002` depend on this boundary. If one is outright falsified —
`/internal/v1` cannot be separated, internal identity cannot be kept separate from tenant roles, or an
internal path cannot be kept out of the customer SDKs — that overturns a release requirement, not a
local design choice: stop, write the ADR and the sub-PRD writeback, and escalate for re-review before
any code lands. In particular, **a dangerous action that would have to skip the audit append or delete
data to work overturns PRD §12.4** (*"cannot bypass audit or delete data"*) — escalate, never
implement the shortcut.
