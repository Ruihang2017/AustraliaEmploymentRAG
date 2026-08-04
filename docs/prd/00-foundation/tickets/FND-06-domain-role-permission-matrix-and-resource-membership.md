---
id: FND-06
title: "Domain: role/permission matrix and resource membership"
module: 00-foundation
lane: 00-foundation
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-03]
blocks: [DATA-02, RUNT-02]
---

# FND-06 — Domain: role/permission matrix and resource membership

Implements PRD §38.1, §16.5 and §21.2, requirements **AUTH-003** and **SEC-001** (epic `E03-DOMAIN`).
No ADR — the decision is already made in PRD §38.1 (the role matrix) and §16.5/§21.2 (authorise before
lookup, TenantContext-scoped access); this is build ticket 6 of 10 against it.
Parent sub-PRD: [00-foundation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-03 — Canonical enums and opaque ID conventions](FND-03-canonical-enums-and-opaque-id-conventions.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §38.1 is a finished decision table; this makes it executable, it does not design a permission model.

## Background + basis

**PRD §38.1 role matrix, transcribed verbatim** — the acceptance target. *"`Own` below means a record
owned by or explicitly shared with the member inside the same organisation; the MVP has no
external/public sharing."*

| Action | Owner | Admin | Researcher | Viewer | Developer | Service account |
|---|---|---|---|---|---|---|
| Search/read public corpus | ✓ | ✓ | ✓ | ✓ | ✓ | scoped |
| Create Answer/Coverage/Compare | ✓ | ✓ | ✓ | — | — by default | scoped |
| Create/read own Research Records | ✓ | ✓ | ✓ | read shared | — by default | scoped |
| Review/comment shared records | ✓ | ✓ | ✓ if assigned | comment if granted | — | scoped if granted |
| Export accessible records | ✓ | ✓ | ✓ | read-only export if granted | — | scoped |
| Create watchlists | ✓ | ✓ | ✓ | — | — | scoped |
| Manage members/invitations | ✓ | ✓ except Owner constraints | — | — | — | — |
| Change roles/remove members | ✓ | ✓ cannot remove/change last Owner | — | — | — | — |
| Configure retention/closure | ✓ | — | — | — | — | — |
| Configure SSO/enforce MFA | ✓ | ✓ | — | — | — | — |
| Manage service accounts/webhooks/widget | ✓ | ✓ | — | — | ✓ within granted developer permission | — |
| View organisation usage | ✓ | ✓ | own usage | — | API/service usage subset | own usage |
| View audit/security events | ✓ | ✓ limited | — | — | credential events only | — |
| Internal source/release/incident admin | — | — | — | — | — | separate internal identity only |

and the closing rule, which is the whole point of the ticket:

> All checks are permission checks plus resource membership; a role alone never authorises a record from
> another organisation.

**PRD §16.5 tenant authorisation**, quoted in full:

> Request flow MUST be authenticate → resolve organisation → verify membership/service account →
> evaluate permission → perform tenant-scoped lookup. Other-tenant and absent opaque IDs return the same
> not-found response. Business modules MUST use TenantContext-scoped repositories rather than
> raw/unscoped database connections.

**PRD §21.2 tenant isolation**: *"All tenant access is TenantContext-scoped. Use organisation-scoped keys
and composite foreign keys where feasible. **Authorise before lookup.** Cross-organisation internal
access uses a separate recent-MFA, reason-required, audited path. Automated tests MUST cover
read/write/delete/export/download and queued-job tenant attacks."*

**PRD §8.1** adds two hard invariants this ticket encodes: *"Developer MUST NOT automatically gain
Research Record content access."* and *"The last Owner MUST NOT be removable."*

**Requirements:**

- **AUTH-003**: *"Owner, Admin, Researcher, Viewer and Developer permissions are enforced | `/settings/members`
  | membership endpoints | App | **Permission matrix in §38 passes**"* (PRD §30.2).
- **SEC-001**: *"Every tenant repository requires `TenantContext` | All tenant routes/jobs | internal
  repository API | App | **Static/architecture test forbids unscoped repository import**"* (PRD §30.2).
  The static test itself is `01-app-data`/`DATA-02` (`packages/database/test/architecture/**`), which is
  `blocked_by` this ticket; the *decision* that a cross-organisation principal is never authorised is
  here, before any repository exists.

**PRD §45.2** bounds the package: `packages/domain` owns *"Pure permissions, state transitions,
evidence/budget rules"* and must not own *"Framework, database or network code"*. **PRD §39.1**:
*"`packages/domain` imports no Fastify, React, SQLite driver, provider SDK or Cloudflare/AWS library."*
**PRD §45.2** also forbids `apps/api` from owning *"Duplicated business rules"* — which is why `RUNT-02`
is `blocked_by` this ticket rather than implementing its own checks.

**Accepted caveats carried forward:**

- The `Role` and `Permission` identifier vocabularies are `FND-03`'s enums (sub-PRD **D6**); this ticket
  owns the **matrix and the predicate**, not the words.
- Enforcement at the HTTP boundary (401/403/404 mapping, recent-auth, MFA gates) is
  `03-app-runtime`/`RUNT-02`; repository scoping is `01-app-data`/`DATA-02`. This ticket cannot enforce
  anything by itself and does not pretend to — it makes the decision computable and unit-testable.
- PRD §41.2 `UAT-AUTH-03` (*"Researcher guesses another tenant's record ID → Same 404 shape/timing class
  as unknown ID"*) is an end-to-end script owned by `23-assurance`.

## Goal

Produce `packages/domain/src/access/**`: the PRD §38.1 matrix as data (including every conditional cell
as a named condition rather than a comment), a pure `evaluate()` decision function that requires
permission **and** resource membership, the last-Owner and Developer-default invariants as predicates,
and property tests proving that no input with a cross-organisation resource can ever return "allowed".
Completion is mechanically checkable: all 84 matrix cells replay against a fixture transcribed from
§38.1, and `packages/domain` imports nothing but `packages/contracts` and Node built-ins.

## Non-goals

- **No HTTP middleware, guards, status codes or headers** — `03-app-runtime`/`RUNT-02` owns the
  admission chain (`apps/api/src/{plugins,middleware}/**`) and maps decisions to §34.9 codes
  (`RESOURCE_NOT_FOUND`, `MFA_REQUIRED`, `RECENT_AUTH_REQUIRED`).
- **No repositories, TenantContext implementation or database access** — `01-app-data`/`DATA-02`
  (`packages/database/src/tenant/**`) plus the SEC-001 architecture test.
- **No session, MFA, SSO or credential logic** — `02-auth-core` (`AUTC-01` … `AUTC-05`). Recent-auth is
  an *input* to this function, never something it computes.
- **No membership storage, invitation lifecycle or `/settings/members` screens** — `01-app-data`/`DATA-04`
  and `13-identity-surface` (`IDNT-01` … `IDNT-03`, `IDNT-08`).
- **No internal-admin identity** — PRD §38.1's last row says internal administration uses a *separate
  internal identity*; that identity is `22-internal-admin`. This ticket only guarantees that no
  organisation principal is ever authorised for it.
- **No audit writing** — `01-app-data`/`DATA-07` owns audit tables; this function returns a decision and
  a reason, which the caller audits.
- **No enum definitions** — `FND-03`.
- **No API scope→permission mapping enforcement for service accounts beyond the matrix's "scoped" cells**
  — the scope vocabulary is `FND-03`; issuing and verifying scoped credentials is `02-auth-core`/`AUTC-04`.

## File-scope (write-owns)

Owned by this ticket:

- `packages/domain/src/access/**`
- `packages/domain/test/access/**` (sub-PRD D14)
- `packages/domain/package.json` — **append-only**, own entries only (sub-PRD D16)

Does not touch:

- `packages/domain/src/{answers,workflow,budget,legal}/**` — `FND-07`, `FND-08`, `FND-09`, `FND-10`
  (same wave, sibling leaves; sub-PRD **D10** forbids imports between them).
- `packages/contracts/**` — `FND-03` (merged), `FND-04`/`FND-05` (same wave, different package).
- `packages/database/**` — `01-app-data`; `packages/auth/**` — `02-auth-core`; `apps/**` — `03-app-runtime`
  and the product modules.
- Root manifests, lockfiles, `README.md`, `tools/**` — `FND-01`; `.github/workflows/**` — `FND-02`.

**Serial-safety analysis.** First decomposition; nothing merged, nothing in flight. This is one of seven
wave-3 siblings, all `blocked_by FND-03`. Within `packages/domain` the five rule tickets own five
disjoint leaf directories (`access`, `answers`, `workflow`, `budget`, `legal`); sub-PRD D10 forbids
cross-leaf imports, so they can run in parallel lanes with no shared source file. The only shared file
is `packages/domain/package.json`, append-only per breakdown plan §1.1. `packages/domain/src/access/**`
is written by no other ticket in the plan (breakdown plan §4).

## Deliverables

1. **`ROLE_MATRIX`** — a frozen data structure with one entry per (action, principal) cell of the §38.1
   table: 14 actions × 6 principals = **84 cells**, none omitted. Each cell is one of
   `ALLOW`, `DENY`, or `CONDITIONAL` with a named condition. The conditions, taken from the table's own
   words, are exactly:
   - `OWNER_CONSTRAINTS` — "✓ except Owner constraints" (Admin, manage members/invitations)
   - `LAST_OWNER_IMMUTABLE` — "✓ cannot remove/change last Owner" (Admin, change roles/remove members)
   - `ASSIGNED_REVIEWER` — "✓ if assigned" (Researcher, review/comment shared records)
   - `SHARED_WITH_MEMBER` — "read shared" (Viewer, create/read own Research Records)
   - `GRANT_REQUIRED` — "comment if granted", "read-only export if granted", "scoped if granted"
   - `OFF_BY_DEFAULT_GRANTABLE` — "— by default" (Developer, answer creation and record access)
   - `SCOPED_CREDENTIAL` — "scoped" (service account)
   - `OWN_RESOURCE_ONLY` — "own usage" (Researcher, service account; view organisation usage)
   - `USAGE_SUBSET` — "API/service usage subset" (Developer, view organisation usage)
   - `LIMITED_SUBSET` — "✓ limited" (Admin, view audit/security events)
   - `CREDENTIAL_EVENTS_ONLY` — "credential events only" (Developer, view audit/security events)
   - `DEVELOPER_PERMISSION_GRANTED` — "✓ within granted developer permission"
   - `SEPARATE_INTERNAL_IDENTITY` — the whole internal-admin row; never satisfiable by an organisation
     principal.
   Each condition is a named predicate over the decision input — never a comment, never a `TODO`.
2. **`evaluate(input): Decision`** where
   `input = { principal: { kind: 'USER'|'SERVICE_ACCOUNT', role?, grants, scopes, organizationId }, action, resource?: { organizationId, ownerId?, sharedWith?, assignedReviewerId? }, context: { ownerCount? } }`
   and `Decision = { allowed: true; via: Permission } | { allowed: false; reason: DenyReason }` with
   `DenyReason` including at least `NOT_A_MEMBER`, `ROLE_LACKS_PERMISSION`, `CONDITION_NOT_MET`
   (carrying the condition name), `NOT_A_RESOURCE_MEMBER`, `CROSS_ORGANIZATION`,
   `SEPARATE_INTERNAL_IDENTITY_REQUIRED`.
3. **Cross-organisation short-circuit.** If `resource.organizationId !== principal.organizationId`, the
   result is `{ allowed: false, reason: 'CROSS_ORGANIZATION' }` **before** any role or permission is
   consulted — PRD §21.2 *"Authorise before lookup"* and §38.1 *"a role alone never authorises a record
   from another organisation"*. This branch must be unreachable-past, i.e. no later branch can flip it.
4. **`isIndistinguishableNotFound(decision): boolean`** — true for `CROSS_ORGANIZATION` and for a missing
   resource, so the caller (`RUNT-02`) returns the identical `RESOURCE_NOT_FOUND` response for both.
   PRD §16.5: *"Other-tenant and absent opaque IDs return the same not-found response."* The domain must
   never hand the boundary a reason that distinguishes them.
5. **Membership invariants as pure predicates**:
   - `canRemoveMember({ actorRole, targetRole, ownerCount })` and
     `canChangeRole({ actorRole, targetRole, targetIsLastOwner })` — both deny when the target is the
     last Owner (PRD §8.1: *"The last Owner MUST NOT be removable"*; §38.1 Admin cell).
   - `developerHasRecordAccess(grants): boolean` — false unless an explicit grant exists (PRD §8.1:
     *"Developer MUST NOT automatically gain Research Record content access."*).
6. **Ordering guarantee, documented and tested**: the evaluation order is
   organisation match → membership/principal validity → permission lookup → condition predicate →
   resource membership. It mirrors PRD §16.5's request flow so `RUNT-02` can implement the chain
   without re-deriving it.
7. **Purity**: no imports outside `packages/contracts` and Node built-ins; no clock, no randomness, no
   I/O (PRD §39.1, §45.2). Any time-dependent input (e.g. recent-auth freshness) arrives as a parameter.
8. **Fixture** `packages/domain/test/access/prd-38-1-matrix.json` — the §38.1 table transcribed verbatim,
   cell text included, so the replay asserts against the PRD's words rather than the implementation's
   interpretation.

## Acceptance checklist (classified)

- [ ] `[fixture]` Matrix replay: all **84** cells of `prd-38-1-matrix.json` are asserted individually —
      `ALLOW` cells allow with a satisfied context, `DENY` cells always deny, `CONDITIONAL` cells allow
      only when their named condition holds and deny with `CONDITION_NOT_MET` when it does not
      (**AUTH-003**: "Permission matrix in §38 passes").
- [ ] `[machine]` Fixture completeness: the fixture has exactly 14 actions × 6 principals and no cell is
      `null`/absent; a deleted cell fails the test (PRD §38.1).
- [ ] `[machine]` Property test (≥10,000 generated cases): for any principal, role, grant set, action and
      resource where `resource.organizationId !== principal.organizationId`, `evaluate()` returns
      `allowed: false` with reason `CROSS_ORGANIZATION` — **SEC-001**, PRD §21.2, §38.1.
- [ ] `[machine]` Property test: `isIndistinguishableNotFound` is true for every cross-organisation
      decision and for a missing resource, and the two produce identical caller-visible information
      (PRD §16.5).
- [ ] `[machine]` Property test: for every action, `allowed(Owner) ⊇ allowed(Admin)`,
      `allowed(Owner) ⊇ allowed(Researcher)`, `allowed(Owner) ⊇ allowed(Viewer)` and
      `allowed(Owner) ⊇ allowed(Developer)` under identical context — Owner dominance, per the §38.1
      table's shape.
- [ ] `[machine]` Last-Owner invariant: with `ownerCount === 1`, no actor (including Owner) may remove or
      demote that Owner (PRD §8.1, §38.1 Admin cell).
- [ ] `[machine]` Developer default: `evaluate()` denies Research Record content access for a Developer
      with no explicit grant, for every record-related action (PRD §8.1).
- [ ] `[machine]` Internal-admin row: every organisation principal — including Owner — is denied with
      `SEPARATE_INTERNAL_IDENTITY_REQUIRED` (PRD §38.1 final row).
- [ ] `[machine]` Evaluation-order test: with a cross-organisation resource **and** a missing permission,
      the reason is `CROSS_ORGANIZATION`, proving the organisation check runs first (PRD §21.2
      "Authorise before lookup").
- [ ] `[machine]` Import-graph purity: `packages/domain/src/access/**` imports only `packages/contracts`
      and Node built-ins; no Fastify/React/SQLite/provider/cloud import anywhere in `packages/domain`
      (PRD §39.1, §45.2).
- [ ] `[machine]` No sibling-leaf import: `src/access/**` does not import `src/{answers,workflow,budget,legal}/**`
      (sub-PRD D10 — the guarantee that makes the seven-lane wave safe).
- [ ] `[machine]` Determinism: `evaluate()` is a pure function — the same input yields the same output,
      and the module reads no clock, no environment variable and no random source (PRD §45.2).
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**AUTH-003**, **SEC-001**,
      `E03-DOMAIN`; `UAT-AUTH-03` is exercised downstream by `23-assurance`), user-visible change and
      non-goals, schema/API/event compatibility impact (none — pure functions), **tenant/PII/security
      impact** (this is the tenant-authorisation decision point; cross-organisation is unconditionally
      denied), source/licence impact (none), cost/memory/latency impact (none), rollback path (revert;
      only `DATA-02`/`RUNT-02` consume it), known gaps (enforcement lives at the boundary, not here).

Absent classes: no `[human]` criteria — this is pure logic with no rendered surface; the human-facing
evidence is `UAT-AUTH-03` and the `/settings/members` screens, owned by `23-assurance` and
`13-identity-surface`.

## Test plan

Reviewer steps, all offline and deterministic:

1. **Read the fixture against the PRD.** Compare `packages/domain/test/access/prd-38-1-matrix.json`
   with `docs/PRD.md` §38.1 cell by cell, including the exact conditional wording ("✓ if assigned",
   "read shared", "✓ limited", "credential events only", …). A fixture that flattens a conditional cell
   into `ALLOW` or `DENY` silently deletes a rule — that is a bounce, not a nit.
2. **Run the suite.** `pnpm --filter @<scope>/domain test`. Confirm the matrix replay produces **84**
   assertions (one per cell), not one aggregate assertion.
3. **Cross-tenant property.** Confirm the generator produces cross-organisation cases with *valid*
   roles and grants (otherwise the property is vacuously satisfied by the membership check). Run with
   at least 10,000 cases.
4. **Ordering negative test.** On a scratch branch move the organisation check after the permission
   lookup; assert the ordering test fails; discard.
5. **Last-Owner cases.** Verify explicit cases for `ownerCount === 1` and `ownerCount === 2` and for an
   Owner attempting to demote themselves.
6. **Developer default.** Verify the denial is for the *absence* of a grant, not for the Developer role
   as such — a Developer with an explicit grant must be allowed (PRD §38.1 "— by default").
7. **Purity checks.** Run the import-graph and sibling-leaf tests; then grep `src/access/**` for
   `Date.now`, `Math.random`, `process.env` — there must be none.
8. **Append-only manifest.** `git diff packages/domain/package.json` shows additions only.

Harness: the framework `FND-01` registered, plus the property-testing library declared in
`packages/domain/package.json` (the first ticket to add it sets the pattern the other domain tickets
follow). Fixture: `packages/domain/test/access/prd-38-1-matrix.json`. No mocks, no network, no database.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update this ticket and
`docs/prd/00-foundation/README.md` (version +0.1, changelog line) **before** changing code; re-publish
with `publish-tickets.mjs --sync`. Silent divergence = incomplete.

**Foreseeable frictions, each with its writeback target:**

1. **A §38.1 conditional cell needs an input the `Decision` shape cannot carry** (e.g. "✓ within granted
   developer permission" needs a grant model richer than a flag set). → Extend the input type **in this
   ticket** and record the shape in `docs/prd/00-foundation/README.md`; `DATA-04` (membership storage)
   and `RUNT-02` (the chain) both read it, so the shape must be decided here, once.
2. **`RUNT-02` or `DATA-02` finds it needs a permission the §38.1 table does not contain.** → That is a
   product change (PRD §45.5). Raise it against **this ticket** and `FND-03`'s `Permission` enum, and
   record it in `docs/prd/00-foundation/README.md` Open questions with a named owner. Never let
   `apps/api` add an ad-hoc check — PRD §45.2 forbids `apps/api` from owning *"Duplicated business
   rules"*.
3. **The Owner-dominance property fails for a real cell.** → The property is derived from the table's
   shape, not stated by the PRD. Update this ticket's acceptance item, record the exception in
   `docs/prd/00-foundation/README.md`, and cite the exact §38.1 row — do not delete the property test.
4. **Service-account "scoped" cells need the §16.3 scope vocabulary to line up with `Permission`.** →
   The mapping lives here (matrix side) and in `FND-03` (vocabulary side). Record it in
   `docs/prd/00-foundation/README.md` D6 and coordinate with `02-auth-core`/`AUTC-04` through a
   writeback, not through a second mapping table in `packages/auth`.
5. **Cross-organisation internal access is needed** (PRD §21.2: *"Cross-organisation internal access uses
   a separate recent-MFA, reason-required, audited path"*). → It must **not** be modelled as an
   exception inside `evaluate()`. Record the requirement in `docs/prd/00-foundation/README.md` and route
   it to `22-internal-admin`; the unconditional `CROSS_ORGANIZATION` deny in this function is a SEC-001
   invariant and stays.

**Escalation.** If PRD §38.1's "permission plus resource membership" model proves insufficient — for
example a real screen needs row-level sharing the MVP explicitly excludes (PRD §38.1: *"the MVP has no
external/public sharing"*) — that overturns a product decision, not an implementation detail. Stop,
raise it for founder approval per PRD §45.5, write back to `docs/prd/00-foundation/README.md` and, if
durable, create `docs/adr/NNNN-<slug>.md`. Never widen the permission model inside this ticket.
