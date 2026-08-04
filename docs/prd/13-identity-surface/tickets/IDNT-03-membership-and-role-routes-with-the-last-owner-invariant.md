---
id: IDNT-03
title: Membership and role routes with the last-Owner invariant
module: 13-identity-surface
lane: 13-identity-surface
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [IDNT-01]
blocks: [IDNT-08]
---

# IDNT-03 — Membership and role routes with the last-Owner invariant

Implements PRD §8.1 (access and organisation workspaces) and §38.1 (role matrix), carrying requirement
`AUTH-003` ("Owner, Admin, Researcher, Viewer and Developer permissions are enforced") and the
membership half of `SEC-001`. **No ADR — the decision is already made in PRD §8.1 and §38.1; this is
build ticket 3 of 9 against it.**
Parent sub-PRD: [13-identity-surface README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`IDNT-01` — Auth/session routes and organisation-switch context](IDNT-01-auth-session-routes-and-organisation-switch-context.md).
**Why `builder`:** a bounded change inside one module's declared file-scope, exposing `FND-06`'s
permission decisions and `DATA-04`'s last-Owner invariant over the fixed PRD §34.1/§34.9 wire
contract — not a new subsystem decision.

## Background + basis

**The roles are fixed and two of the rules are absolute.** PRD §8.1:

> Fixed roles: Owner, Admin, Researcher, Viewer and Developer. Owner/Admin MUST manage invitations,
> memberships, limits and security settings according to permission. **Developer MUST NOT automatically
> gain Research Record content access. The last Owner MUST NOT be removable.**

**The matrix is normative and is not restated here.** PRD §38.1 (the rows this area enforces):

> | Action | Owner | Admin | Researcher | Viewer | Developer | Service account |
> | Manage members/invitations | ✓ | **✓ except Owner constraints** | — | — | — | — |
> | Change roles/remove members | ✓ | **✓ cannot remove/change last Owner** | — | — | — | — |
> | Configure retention/closure | ✓ | — | — | — | — | — |
> | Configure SSO/enforce MFA | ✓ | ✓ | — | — | — | — |
>
> All checks are permission checks plus resource membership; **a role alone never authorises a record
> from another organisation.**

`FND-06` (`00-foundation`) already implements it as pure code and exports exactly what this area calls:
`ROLE_MATRIX` (84 cells, none omitted), `evaluate(input): Decision`, `isIndistinguishableNotFound(decision)`,
`canRemoveMember({ actorRole, targetRole, ownerCount })`, `canChangeRole({ actorRole, targetRole,
targetIsLastOwner })` and `developerHasRecordAccess(grants)`. Its deliverable 3 fixes the ordering this
area depends on:

> **Cross-organisation short-circuit.** If `resource.organizationId !== principal.organizationId`, the
> result is `{ allowed: false, reason: 'CROSS_ORGANIZATION' }` **before** any role or permission is
> consulted — PRD §21.2 *"Authorise before lookup"*.

and its deliverable 4:

> `isIndistinguishableNotFound(decision)` — true for `CROSS_ORGANIZATION` and for a missing resource, so
> the caller returns the identical `RESOURCE_NOT_FOUND` response for both.

**Persistence enforces the same invariant a second time.** PRD §35.4:

> | `membership` | `organization_id`, `user_id`, `role`, `status`, `joined_at`, `row_version` |
> composite PK; **last-Owner trigger/application invariant** |

`DATA-04` deliverable 5:

> `memberships`: **last-Owner invariant** — demoting, suspending or removing the last `ACTIVE` `OWNER`
> fails inside the same `withTenantTransaction`, evaluated with a read in that transaction so two
> concurrent demotions cannot both succeed.

**Requirement and acceptance evidence.** PRD §30.2:

> | AUTH-003 | Owner, Admin, Researcher, Viewer and Developer permissions are enforced |
> `/settings/members` | membership endpoints | App | **Permission matrix in §38 passes** |

**Wire rules.** PRD §16.1 (`/v1`, organisation derived from authenticated context, `request_id` on
every response). PRD §34.1: opaque ids; ISO 8601 UTC; `page_size` 1–100 default 25 with opaque
`next_cursor`; **`Concurrency | Mutable resources return `ETag`; writes require `If-Match` where
documented`**; **`Tenant | Never accepted in a request body`**. PRD §16.2: *"Editable resources MUST use
ETag/version + `If-Match`; conflicts return `409 CONCURRENT_MODIFICATION`."* `membership.row_version`
(PRD §35.4) is the ETag source. PRD §34.9 is the closed catalogue; the codes reachable here are
`400 INVALID_REQUEST`, `401 AUTHENTICATION_REQUIRED`, `403 MFA_REQUIRED`, `403 RECENT_AUTH_REQUIRED`,
`404 RESOURCE_NOT_FOUND` (*"same response for forbidden/other tenant"*),
`409 CONCURRENT_MODIFICATION`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

**PRD §34 contains no membership payload example** (§34.2–§34.8 are search, answers, SSE, snapshots,
coverage/compare, records and webhooks). Sub-PRD **D4**: the binding shapes are §34.1 + §34.9 + the
PRD §35.4 `membership` columns + the generated types from `FND-04`'s OpenAPI, which commits to
documenting the PRD §16.3 endpoints. Never edit `schemas/openapi/**` from here.

**Routing and shared toolkit.** `RUNT-01`'s A1 contract makes `apps/api/src/routes/members/` an
autoloaded area at `/v1/members`; the shared toolkit (`getIdentityContext`, `mapAuthFailure`,
`emitIdentityAudit`, `TENANT_ROUTE`/`SENSITIVE_ROUTE` presets) is `IDNT-01`'s
`apps/api/src/routes/auth/_lib/**`, imported read-only (sub-PRD **D3**).

**Accepted caveats carried forward, documented not enforced here:**

- **No SCIM and no automated deprovisioning.** PRD §16.3: *"SCIM is excluded."* PRD §38.3: *"member
  removal remains manual for MVP."* Documented, not enforced — do not add it as a side effect.
- **Developer record access is a grant, not a role property.** PRD §8.1 forbids automatic access;
  `FND-06.developerHasRecordAccess(grants)` is the only decision point. This area may store/return the
  grant flags `DATA-04` defines but never interprets them.
- **PRD §34.9 has no "last Owner" code.** Sub-PRD **D12**: the refusal is `400 INVALID_REQUEST` with a
  closed `details.reason`. Inventing a code is a PRD change (§45.5, Founder).
- **Durable audit persistence** is sub-PRD **OQ3**; events go through `IDNT-01`'s `emitIdentityAudit`.

## Goal

Produce the `apps/api/src/routes/members/` route area serving membership list, read, role change,
status change and removal under `/v1/members`, such that the PRD §38.1 matrix passes end to end and the
last Owner cannot be removed, demoted or suspended by any actor or by any race. Completion is
mechanically checkable: every route's decision comes from `FND-06.evaluate()` and this area contains no
role literal; an Admin can manage members but cannot touch the last Owner; a Researcher, Viewer or
Developer is refused; a stale `If-Match` returns `409 CONCURRENT_MODIFICATION`; a member of another
organisation is byte-identically indistinguishable from an absent one; and two concurrent attempts to
demote the last Owner both fail.

## Non-goals

- **No permission matrix.** `packages/domain/src/access/**` is `FND-06` (`00-foundation`). This area
  calls `evaluate()`; it never enumerates a role's rights (PRD §45.2; plan §9 **R5**).
- **No membership table, repository or trigger.** `packages/database/**` is `01-app-data` (plan **A3**);
  the transactional last-Owner check is `DATA-04` deliverable 5.
- **No invitations.** Creating a membership is `IDNT-02`'s `accept` path (`AUTC-01.acceptInvitation` is
  *"the only user-creating path"*).
- **No sessions or organisation switch.** `IDNT-01`. Revoking a removed member's sessions is done by
  calling `AUTC-01`'s `revokeAllSessions` — the function lives in `packages/auth`, not here.
- **No MFA enforcement policy, no SSO.** `IDNT-04`, `IDNT-05`.
- **No screens.** `/settings/members` is `IDNT-08` (PRD §31.2).
- **No retention/closure configuration.** PRD §38.1 gives it to Owner only and PRD §31.2 puts it on
  `/settings/data`; the display half is `IDNT-09` and the API is sub-PRD **OQ6**.
- **No admission stages, no error catalogue, no OpenAPI.** `RUNT-02`, `RUNT-01`, `FND-04`.
- **No cross-boundary suites.** `tests/**` is `23-assurance`; this ticket carries its own co-located
  tenant assertions (plan §9 **R8**).

## File-scope (write-owns)

- `apps/api/src/routes/members/**` — the route area, including its A1 entry file `index.ts`.
- `apps/api/test/routes/members/**` — this ticket's own unit/integration tests (plan §1.1).
- `apps/api/package.json` — **append-only** if a dependency is required (plan §1.1).

Does not touch:

- `apps/api/src/routes/auth/**` — `IDNT-01`, including `_lib/**`, which this ticket **imports** but
  never writes.
- `apps/api/src/routes/{invitations,mfa,sso,service-accounts,widget-sessions}/**` — `IDNT-02`,
  `IDNT-04`…`IDNT-07`.
- `apps/api/src/routes/{health,system-status}/**` — `RUNT-08`; every other area belongs to `14`, `15`,
  `16`, `17`, `19`, `20` or `22` (plan §4).
- `apps/api/src/{server.ts,app.ts,bootstrap,errors,plugins,middleware,sse}/**` — `RUNT-01`, `RUNT-02`,
  `RUNT-03`.
- `packages/domain/**` — `FND-06`; `packages/database/**` — `01-app-data`; `packages/auth/**` —
  `02-auth-core`; `packages/contracts/**`, `schemas/openapi/**` — `00-foundation`; `packages/ui/**`,
  `packages/observability/**` — `RUNT-06`, `RUNT-07`.
- `apps/web/**`, `apps/worker/**`, `apps/admin/**`, `apps/widget/**`, `infra/**`, `tests/**`, root
  manifests, lockfiles, `.github/workflows/**`.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, no in-flight
ticket), so nothing has previously written these paths and nothing contends for them. Under the A1
autoload convention (`RUNT-01` contract §1/§6) `apps/api/src/routes/members/` is an independent
directory whose addition produces zero diff elsewhere, so it is disjoint from the six sibling identity
areas and from every product module's route areas — there is no shared route index. This ticket sits in
wave 2 with `IDNT-02`, `IDNT-04`, `IDNT-05` and `IDNT-06`, all runnable as concurrent lanes
(plan §7: 9 tickets, 3 minimum waves, 5 useful lanes); each writes a different `routes/<area>/`
directory. `apps/api/package.json` is append-only shared (plan §1.1).

## Deliverables

1. **`apps/api/src/routes/members/index.ts`** — the A1 entry file: default-exported
   `FastifyPluginAsync` and `export const area = { admission: 'tenant' } satisfies RouteAreaConfig`.
   Every route additionally declares its own requirements through `IDNT-01`'s presets; the mutating
   routes use `SENSITIVE_ROUTE` (recent auth required — PRD §21.1 *"recent auth for sensitive
   operations"*).
2. **`GET /v1/members`** (`TENANT_ROUTE`) — list the calling organisation's memberships through the
   `TenantContext`-scoped repository. Query: `role?`, `status?`, `page_size` 1–100 default 25, opaque
   `cursor` (PRD §34.1). Item shape: `{ user_id, display_name, email_normalized, role, status,
   joined_at, is_last_owner, etag }`. `is_last_owner` is computed from the organisation's `ACTIVE`
   Owner count so `IDNT-08` can render the invariant **before** the user attempts the action
   (plan §5.14 goal: *"Last-Owner invariant … visible in UI"*); it is a display hint, never the
   enforcement point.
3. **`GET /v1/members/{user_id}`** (`TENANT_ROUTE`) — one membership, same shape, with the `ETag`
   response header set from `membership.row_version` (PRD §34.1, §16.2). A user id from another
   organisation and an absent user id return `404 RESOURCE_NOT_FOUND` from the **same code path**
   (PRD §16.5; `FND-06.isIndistinguishableNotFound`).
4. **`PATCH /v1/members/{user_id}`** (`SENSITIVE_ROUTE`, `If-Match` **required**) — role and status
   change. Request `{ role?, status? }`; at least one field required. Fixed ordering:
   1. `FND-06.evaluate()` for *"Change roles/remove members"* with the actor's principal and the target
      resource; a `CROSS_ORGANIZATION` or missing-resource decision becomes `404 RESOURCE_NOT_FOUND`
      via `isIndistinguishableNotFound` (PRD §16.5, §21.2 *"Authorise before lookup"*);
   2. `FND-06.canChangeRole({ actorRole, targetRole, targetIsLastOwner })` — an Admin acting on an
      Owner, or any actor demoting the last Owner, is refused;
   3. the write executes inside `DATA-04`'s `withTenantTransaction`, which re-evaluates the last-Owner
      invariant **inside the transaction**, so a race between two concurrent demotions cannot leave the
      organisation ownerless (PRD §35.4);
   4. `row_version` mismatch → `409 CONCURRENT_MODIFICATION` (PRD §16.2, §34.9);
   5. on a role change that reduces privilege, call `AUTC-01`'s session revocation for the target user
      so the new role takes effect immediately (PRD §38.2 *"rotated session identifier after …
      privilege change"*);
   6. emit an audit event carrying old and new role/status;
   7. respond `200` with the updated item and a new `ETag`.
   Last-Owner and matrix refusals are `400 INVALID_REQUEST` with `details.reason` from the **closed
   set** `{ 'LAST_OWNER_IMMUTABLE', 'ROLE_NOT_PERMITTED', 'OWNER_CONSTRAINTS' }` (sub-PRD **D12**), plus
   a plain-language `message` `IDNT-08` can render verbatim.
5. **`DELETE /v1/members/{user_id}`** (`SENSITIVE_ROUTE`, `If-Match` **required**) — removal. Same
   ordering as deliverable 4, using `FND-06.canRemoveMember({ actorRole, targetRole, ownerCount })`;
   removing the last `ACTIVE` Owner is refused with `details.reason === 'LAST_OWNER_IMMUTABLE'`
   (PRD §8.1 *"The last Owner MUST NOT be removable"*). On success the target's sessions for this
   organisation are revoked through `packages/auth`, an audit event is emitted, and the response is
   `204`. Removal is **manual only** — no bulk or automated path (PRD §38.3).
6. **`GET /v1/members/me/permissions`** (`TENANT_ROUTE`) — the caller's own effective decisions, derived
   by calling `FND-06.evaluate()` once per PRD §38.1 action and returning
   `{ action, allowed, reason? }[]`. This exists so `IDNT-08` and `RUNT-05`'s shell can hide or disable
   controls **without encoding a role rule in the browser** (PRD §45.2: `apps/web` must not own
   "Security-boundary … tenant enforcement"; `RUNT-05` deliverable 4 takes a feature-supplied
   `visibleWhen` predicate). The action list is derived from `ROLE_MATRIX`, not written out here.
7. **No role literal.** This area must contain no `'OWNER' | 'ADMIN' | 'RESEARCHER' | 'VIEWER' |
   'DEVELOPER'` string other than through the `packages/contracts` enum (`FND-03`) used for request
   validation, and no permission branch of its own. A source-scan test enforces it (plan §9 **R5**).
8. **Audit events** (`IDNT-01`'s `emitIdentityAudit`) for every role change, status change and removal,
   carrying `{ action, actorId, organizationId, resourceType: 'MEMBERSHIP', resourceId: userId, result,
   requestId }` plus the old/new role as bounded enum values — never an email body or free text
   (PRD §22, §35.6 `audit_event` *"no complete research body/credential"*).
9. **`apps/api/test/routes/members/**`** — this ticket's suites, built on `IDNT-01`'s exported
   `apps/api/test/routes/auth/identity-route-harness.ts` and `DATA-04`'s
   `packages/database/test/tenancy/factories.ts`.

## Acceptance checklist (classified)

- [ ] `[machine]` The area registers as `apps/api/src/routes/members/` and serves under `/v1/members`
      with **zero** diff to any tracked file outside that directory — asserted with `RUNT-01`'s
      `apps/api/test/route-area-conformance.ts` (plan **A1**)
- [ ] `[machine]` **`AUTH-003` matrix:** for each of the five PRD §38.1 roles plus a service credential,
      every route returns the matrix-correct outcome — asserted by a table-driven test whose expectation
      table is read from `FND-06`'s committed fixture `packages/domain/test/access/prd-38-1-matrix.json`
      (the PRD's own words), not from this area's implementation (PRD §38.1; `AUTH-003` *"Permission
      matrix in §38 passes"*)
- [ ] `[machine]` This area contains **no** role literal and **no** permission branch of its own —
      source scan over `apps/api/src/routes/members/**` (PRD §45.2; plan §9 **R5**)
- [ ] `[machine]` **Last Owner:** removing, demoting or suspending the only `ACTIVE` Owner is refused
      with `400 INVALID_REQUEST` and `details.reason === 'LAST_OWNER_IMMUTABLE'`, for an Owner acting on
      themselves and for an Admin acting on the Owner (PRD §8.1, §38.1)
- [ ] `[machine]` **Last-Owner race:** two concurrent demotions of the last two Owners against the real
      `DATA-04` repository leave at least one `ACTIVE` Owner — asserted with a concurrency test, not a
      mock (PRD §35.4 *"last-Owner trigger/application invariant"*; `DATA-04` deliverable 5)
- [ ] `[machine]` `PATCH` and `DELETE` require `If-Match`; a missing header is `400 INVALID_REQUEST` and
      a stale `row_version` is `409 CONCURRENT_MODIFICATION`; a successful write returns a new `ETag`
      (PRD §34.1, §16.2, §34.9)
- [ ] `[machine]` A privilege-reducing role change revokes the target's sessions through
      `packages/auth`, so the old role cannot be used afterwards (PRD §38.2)
- [ ] `[machine]` **Tenant isolation (`SEC-001`, PRD §21.2):** reading, patching or deleting a member of
      another organisation and an absent `user_id` return **byte-identical** `404 RESOURCE_NOT_FOUND`
      bodies apart from `request_id`; the list endpoint returns only the calling organisation's rows
      (PRD §16.5, §34.9; `FND-06.isIndistinguishableNotFound`)
- [ ] `[machine]` **Tenant isolation (`SEC-001`):** an architecture assertion over
      `apps/api/src/routes/members/**` finds no unscoped `packages/database` import — copy the
      construction pattern from `apps/api/test/admission/architecture.test.ts` (`RUNT-02` deliverable 13)
- [ ] `[machine]` An organisation identifier supplied in body, query or header is rejected
      `400 INVALID_REQUEST` naming the field (PRD §34.1, §16.1)
- [ ] `[machine]` `GET /v1/members` honours `page_size` 1–100 default 25 with an opaque `next_cursor`;
      0 and 101 are rejected (PRD §34.1)
- [ ] `[machine]` `GET /v1/members/me/permissions` returns one entry per PRD §38.1 action derived from
      `ROLE_MATRIX`, with no action list written out in this area (PRD §38.1)
- [ ] `[machine]` `is_last_owner` is a display hint only: forcing it to `false` in a request has no
      effect and the write is still refused (PRD §8.1 — enforcement is server-side)
- [ ] `[machine]` No audit event, log line or error body contains an email body, free text or any
      credential — asserted with a canary placed in the target user's display name (PRD §22, §35.6)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `AUTH-003`, `SEC-001`, the tenant/security
      impact, the rollback path and the **known gap** for sub-PRD **OQ3** (durable audit persistence)
- [ ] `[human]` Founder review of the refusal messages: a last-Owner refusal and a matrix refusal each
      name the exact effect and the recovery path in plain language, as PRD §41.1 requires of
      security-sensitive actions (PRD §41.1, §43.4). Rendered by `IDNT-08`, so run after `IDNT-08`
      merges — **not required to merge this ticket**
- No `[fixture]` criteria of the plan §1.1 kind (PRD §40.8 adapter fixtures or PRD §14/§43 evaluation
      replays) — the `AUTH-003` matrix test replays `FND-06`'s committed PRD §38.1 transcription, which
      is a domain fixture owned by `00-foundation`, not recorded external data
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)

## Test plan

Reviewer steps, offline, no network. Database is a temp-file `app.sqlite` migrated with `DATA-01`'s
runner and seeded through `DATA-04`'s `packages/database/test/tenancy/factories.ts`; principals come
from `IDNT-01`'s exported `apps/api/test/routes/auth/identity-route-harness.ts`.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/api`. Suites live under `apps/api/test/routes/members/`.
3. **`area-registration.test.ts`** — reuse `apps/api/test/route-area-conformance.ts` (`RUNT-01`); assert
   the derived prefix `/v1/members` and enumerate the registered routes against a literal list.
4. **`matrix.test.ts`** — read `packages/domain/test/access/prd-38-1-matrix.json` (`FND-06`
   deliverable 8) and drive every (role × route) pair through `inject()`. Assert the response class
   matches the PRD cell. A cell the fixture marks `CONDITIONAL` is exercised in both branches.
5. **`last-owner.test.ts`** — single-Owner organisation: Owner demotes self, Owner removes self, Admin
   demotes Owner, Admin removes Owner — all four refused with `LAST_OWNER_IMMUTABLE`. Then a
   two-Owner organisation: one demotion succeeds and the second, on the now-last Owner, is refused.
6. **`last-owner-race.test.ts`** — two-Owner organisation; fire two demotions concurrently against the
   **real** `DATA-04` repository; assert exactly one succeeds and an `ACTIVE` Owner remains.
7. **`etag.test.ts`** — `PATCH`/`DELETE` without `If-Match` (expect 400); with a stale value (expect
   409); with the current value (expect success and a changed `ETag`).
8. **`tenant-isolation.test.ts`** — seed organisations A and B; as an A Owner, read/patch/delete B's
   member and a syntactically valid absent `user_id`; byte-compare the two 404 bodies after masking
   `request_id`; assert the list never returns a B row.
9. **`architecture.test.ts`** — source scan for unscoped `packages/database` imports and for role
   literals; copy the pattern from `apps/api/test/admission/architecture.test.ts` (`RUNT-02`).
10. **`session-revocation.test.ts`** — demote a Researcher to Viewer and assert `revokeAllSessions` was
    called for that user (spy on `AUTC-01`'s fake) and that a request replayed with the old session is
    rejected.
11. **`leak.test.ts`** — set a target user's display name to `secret-canary-<uuid>`; run the route
    matrix; scan every audit event and captured log line; assert absence.
12. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether the
    permission decision and the write are in one transaction; whether `ownerCount` can be read outside
    the transaction and go stale; whether a suspended Owner still counts as `ACTIVE` for the invariant;
    whether any refusal reason discloses another organisation's data.
13. The `[human]` row is run against a locally started stack (`pnpm stack:up`, `RUNT-09`) after
    `IDNT-08` merges, and recorded in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies anything in this ticket, update **this ticket file**
first (version note + changelog line in the PR), re-publish with
`.claude/scripts/publish-tickets.mjs --sync`, then change code. Silent divergence is an incomplete
ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`FND-06.evaluate()`'s input shape does not fit a membership route** (for example it cannot express
  "actor changes another member's role") → the fix belongs in `00-foundation`. Add a ticket there and
  make this one `blocked_by` it in `docs/prd/breakdown-plan.md` §5.14/§6.2 **first**. Do **not** add a
  local permission branch — PRD §45.2 forbids duplicated business rules and plan §9 **R5** names this
  exact failure.
- **`DATA-04`'s `memberships` repository does not enforce the last-Owner invariant inside the
  transaction** → the guarantee cannot be provided from `apps/api` (a check-then-write here is exactly
  the race PRD §35.4 forbids). Raise a ticket in `01-app-data`, add the edge in
  `docs/prd/breakdown-plan.md` §5.14/§6.2, and do not ship a route-level check as if it were the
  invariant. Never write `packages/database/**` (plan **A3**, plan §9 **R4**).
- **PRD §34.9 has no code for a last-Owner or matrix refusal** → the catalogue is closed (sub-PRD
  **D12**). Use `400 INVALID_REQUEST` + `details.reason`. If genuinely impossible, raise it in
  `docs/prd/13-identity-surface/README.md` §Open questions with the **Founder** as owner (PRD §45.5
  product/API change) and stop at the nearest existing code.
- **A PRD §38.1 cell is ambiguous in practice** (for example what *"✓ except Owner constraints"* means
  for inviting at Owner role) → the matrix is a **product contract**. Do not resolve it here. Raise it
  in `docs/prd/13-identity-surface/README.md` §Open questions with the **Founder** as owner and, if it
  changes `FND-06`, raise the `00-foundation` ticket too.
- **`FND-04`'s OpenAPI does not describe these paths or the `ETag`/`If-Match` contract** (sub-PRD
  **OQ8**) → raise a `00-foundation` ticket and add the edge in `docs/prd/breakdown-plan.md`. Never
  edit `schemas/openapi/**` or a generated file.
- **`IDNT-01`'s `_lib` toolkit is missing something this area needs** → amend `IDNT-01`'s deliverables
  and this ticket together in one docs PR and `--sync` both. Never write inside
  `apps/api/src/routes/auth/**`.

**3. Escalation.** *"The last Owner MUST NOT be removable"* (PRD §8.1) and the §38.1 matrix are release
requirements with MUST force, and `AUTH-003`'s acceptance evidence is *"Permission matrix in §38
passes"*. If either proves unimplementable as decided, that overturns a team decision: escalate for
re-review before any code lands. Never weaken the invariant inside this ticket.
