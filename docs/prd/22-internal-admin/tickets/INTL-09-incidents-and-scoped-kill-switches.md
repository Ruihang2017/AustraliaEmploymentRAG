---
id: INTL-09
title: Incidents and scoped kill switches
module: 22-internal-admin
lane: 22-internal-admin
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INTL-01, DATA-07]
blocks: [INTL-10]
---

# INTL-09 — Incidents and scoped kill switches

Implements **PRD §8.11 (incidents, scoped kill switches), §12.4, §42.4 and §42.5 — requirement
`ADM-003`** (epic `E29-INTERNAL-ADMIN`).
No ADR — the decision is already made in PRD §12.4 (*"Every activation requires actor, reason, scope,
incident and review/expiry time and cannot bypass audit or delete data"*) and PRD §42.5's scope table;
this is build ticket **9 of 10** against it.
Parent sub-PRD: [22-internal-admin README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`INTL-01`](INTL-01-internal-v1-separation-internal-identity-admin-shell.md);
`DATA-07` — Usage, monitor, issue/correction, audit, incident tables
([`01-app-data`](../../01-app-data/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
`DATA-07`'s `incident`/`kill_switch` repositories and `INTL-01`'s dangerous-action envelope — not a new
subsystem decision.

## Background + basis

**What a fresh agent needs to know before touching anything.**

`INTL-01` has merged and owns the internal boundary. This ticket declares
`area = internalArea({ areaId: 'incidents', capability: 'INCIDENTS' })`, wraps its plugin in
`internalRoutes()`, and performs **every** state change through `withDangerousAction()`, whose fixed
order is internal identity → `assertMfaSatisfied` → `assertRecentAuth` → typed confirmation → required
fields → **audit append before the effect** → effect → outcome audit append, and which **refuses when
no audit sink is bound** (sub-PRD **D6**).

`DATA-07` has merged and owns the tables. Its deliverable 9, quoted:

> **Incidents and kill switches (ADM-003).** `incident` uses the six PRD §12.4 states as a generated
> enum CHECK. `kill_switch` requires `actor_id`, `reason`, `scope_type`, `scope_payload`,
> `incident_id` and `review_or_expiry_at` — **all NOT NULL**; the repository rejects an expiry in the
> past. `scope_type` covers every PRD §42.5 scope … **Deactivation is an append** (a new row or a
> terminal append-only action row), **never a delete or an in-place clear** (PRD §12.4 "append-only
> actions; no data deletion side effect"). `activeSwitchesAt(now)` returns the effective set for
> `RUNT-02` and `INTL-09` and automatically excludes expired switches.

and its deliverable 8 exports `appendAuditEvent(tx, ctx, entry)` for the append-only `audit_event`
table. **This ticket is the only one in the module with a `DATA-07` edge**, so it binds
`appendAuditEvent` as `INTL-01`'s `InternalAuditSink` (deliverable 3) — which is what makes every other
console's audit durable rather than merely portable.

`RUNT-02` (transitively upstream via `INTL-01`) owns admission. **Enforcement of a kill switch is its
job, not this ticket's** (sub-PRD **D13**, **M10**): `DATA-07` states `activeSwitchesAt` exists *"for
`RUNT-02` and `INTL-09`"*, while `RUNT-02`'s published stage list has no kill-switch stage. This ticket
proves the stored switch set and the scope matrix; the end-to-end admission effect is `RUNT-02`'s and
is tracked as sub-PRD **M10**.

**What the PRD fixes, quoted.**

PRD §12.4 in full:

> Incident states: `INVESTIGATING`, `IDENTIFIED`, `MITIGATING`, `MONITORING`, `RESOLVED`,
> `POSTMORTEM_REQUIRED`.
>
> Severity ranges from SEV-1 (cross-tenant exposure/systemic material legal error) to SEV-4
> (low-impact defect). **Kill switches MUST be scopeable to generation, provider/model, Deep Research,
> source, jurisdiction, corpus promotion, ingestion, webhooks, invitations, organisation or
> credential. Every activation requires actor, reason, scope, incident and review/expiry time and
> cannot bypass audit or delete data.**

PRD §42.4 — severity table (SEV-1 cross-tenant disclosure / systemic materially wrong current-law
answers / unrecoverable data loss → *"Stop affected/global capability immediately, preserve evidence,
status notice/notification assessment"*; SEV-2 → *"Scope kill switch/maintenance, rollback or restore,
customer-impact analysis"*; SEV-3 → *"Disable/queue feature, communicate in status/support as
needed"*; SEV-4 → *"Normal issue queue"*) and:

> Every incident records **detection, owner, severity, affected versions/tenants, timeline, kill
> switches, customer-notification decision, correction/rollback, resolution and follow-up**. SEV-1/2
> require postmortem; the solo founder may be both operator and approver, **but the audit cannot be
> omitted**.

PRD §42.5 — the scope behaviour matrix, verbatim, which this console must display beside every switch:

| Switch scope | Admission behaviour | Existing work |
|---|---|---|
| Model profile/provider | New affected generation returns unavailable | Cancel safely at stage boundary; settle actual cost only |
| Deep Research | Quick/Search continue | Deep queued/running follows configured cancel/drain |
| Corpus release/source/jurisdiction | Affected research warns/refuses | Mark impact candidates; prior verified release may be activated |
| Ingestion/promotion | Active Search continues | Stop candidate processing; preserve quarantine/evidence |
| Webhooks | Alerts remain in-app/queued | Stop delivery; retry after recovery without duplicates |
| Tenant/key | Only named scope denied | Preserve records/audit; no deletion |
| Global generation | Search/records/source reading continue | No unvalidated fallback |

> **Kill switches expire or require review at the recorded time. No switch deletes content or bypasses
> retention/audit.**

PRD §42.2, the row that makes a switch the first action: *"Cross-tenant anomaly | any | SEV-1 immediate
| **Global customer-data capability kill switch**; preserve evidence; assess notification."*

PRD §32.8: *"Dangerous actions use recent MFA, typed confirmation, scope, reason and expiry/review."*

PRD §30.2 `ADM-003`: *"Scoped kill switches stop only the named capability/tenant/source"*, primary
route `/internal/incidents`, primary API *"kill-switch endpoints"*, minimum acceptance evidence
**"Scope matrix and automatic expiry pass"**.

PRD §42.7: `docs/runbooks/security-incident.md` is required before external access — owned by
`RLSE-10`; this console is the surface that runbook drives.

**Accepted caveats carried forward, documented not enforced here.**

- **Enforcement is `RUNT-02`'s** (sub-PRD **D13**, **M10**). This console activates, scopes, expires
  and audits; it never denies a request itself. Two enforcement points cannot both be authoritative,
  and one inside the internal routes could not affect the worker at all.
- **Alert delivery and the status page are `RLSE-08`'s** (PRD §42.2). This console records the
  incident and the switch.
- **Corrections and rollbacks are elsewhere** — `INTL-08`/`RCRD-07` and `INTL-04`/`RLSE-07`. The
  incident record **links** them (PRD §42.4's *"correction/rollback"* field) and performs neither.

## Goal

Produce the internal incident and kill-switch console: `/internal/v1/incidents` endpoints implementing
the six PRD §12.4 incident states and four PRD §42.4 severities with every PRD §42.4 record field, and
kill-switch activation/deactivation covering **every** PRD §12.4 and §42.5 scope, where each activation
carries actor, reason, scope, incident and review/expiry time, is audited **before** it takes effect,
and can neither delete data nor be cleared in place; plus the `apps/admin/src/features/incidents/**`
screens that show each switch beside its PRD §42.5 admission behaviour. This ticket also binds
`DATA-07`'s `appendAuditEvent` as the module's durable audit sink. Completion is mechanically
checkable: the scope matrix round-trips for every scope; an activation missing any mandatory field or
with a past expiry is rejected; expiry removes a switch from `activeSwitchesAt` with no delete;
deactivation is an append; and no code path in this area deletes, truncates or mutates customer data.

## Non-goals

- **No kill-switch enforcement at admission or in the worker.** `RUNT-02` (sub-PRD **D13**, **M10**).
- **No table, migration or repository.** `DATA-07` owns `incident`, `kill_switch` and `audit_event`
  (plan **A3**, PRD §45.2). This ticket calls the repositories and adds no column.
- **No alerting, thresholds, status page or notification delivery.** `RLSE-08`, `16-monitor-alerts`.
- **No correction, rollback, promotion or restore execution.** `RCRD-07`, `RLSE-06`, `RLSE-07`,
  `RLSE-09`; the incident links them.
- **No postmortem document store.** PRD §42.4 requires a postmortem for SEV-1/2; this console records
  the **requirement and its reference**, not the document (`docs/runbooks/**` is `RLSE-10`'s and
  postmortems are not a repository artifact in the PRD).
- **No internal boundary code.** `INTL-01`.
- **No customer-facing incident or status surface.** `RUNT-08`'s `/v1/system-status` and `RLSE-08`'s
  status page.
- **No deletion, purge, anonymisation or retention override anywhere.** PRD §12.4, §42.5.

## File-scope (write-owns)

- `apps/api/src/routes/internal/incidents/**`
- `apps/api/test/internal/incidents/**` (sub-PRD **D11**), including
  `apps/api/test/internal/incidents/fixtures/**`
- `apps/admin/src/features/incidents/**`
- `apps/admin/test/incidents/**` (sub-PRD **D11**)
- `apps/admin/package.json` — **append-only**, dependencies block only (sub-PRD **D10**, plan §1.1)

Does not touch:

- `apps/api/src/routes/internal/core/**`, `apps/admin/src/app/**`, `apps/admin/{index.html,vite.config.ts,tsconfig.json}`
  — `INTL-01`.
- `apps/api/src/routes/internal/{sources,quarantine,releases,licensing,evaluation,cost,issues}/**` and
  `apps/admin/src/features/{sources,quarantine,releases,licensing,evaluation,cost,issues,overview}/**`
  — `INTL-02`…`INTL-08`, `INTL-10`.
- `packages/database/**` — `01-app-data`; `packages/auth/**`, `packages/domain/**`,
  `packages/contracts/**` — `02-auth-core`, `00-foundation`.
- `apps/api/src/{server.ts,app.ts,bootstrap,plugins,middleware,errors,sse}/**` and every other
  `apps/api/src/routes/<area>/**` — `03-app-runtime` and the product modules.
- `apps/worker/**`, `apps/web/**`, `apps/widget/**`, `infra/**`, `docs/runbooks/**`, `tests/**`,
  `pipelines/**` — other modules.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, nothing in flight),
so no prior ticket has written these paths. Inside `apps/api/src/routes/internal/**` and `apps/admin/**`
only `INTL-01` (this ticket's `blocked_by`) has written, owning `internal/core/**` and `src/app/**`,
and it completes first. The seven siblings that may run concurrently (plan §7 wave 2, all blocked only
by `INTL-01`) own different `internal/<area>/` and `features/<area>/` directories, discovered by
directory convention (plan **A1**, sub-PRD **D9**). `DATA-07` writes only inside
`packages/database/**`, which this ticket never touches. Binding the audit sink is a call to
`setInternalAuditSink()` **inside this area's plugin registration** — it writes no file `INTL-01` owns
and no file a sibling owns. The single shared file is `apps/admin/package.json`, restricted to
appending distinct dependency entries.

## Deliverables

1. **`apps/api/src/routes/internal/incidents/index.ts`** — `export const area = internalArea({ areaId:
   'incidents', capability: 'INCIDENTS' })` and a default export of `internalRoutes(plugin, { areaId:
   'incidents', capability: 'INCIDENTS' })`.
2. **Incident CRUD-with-append semantics.**
   - `POST /internal/v1/incidents` — open an incident. Required: `severity`
     (`SEV_1 | SEV_2 | SEV_3 | SEV_4`), `title`, `detection` (how it was detected and when), `owner`.
     Initial state `INVESTIGATING`.
   - `GET /internal/v1/incidents` and `GET /internal/v1/incidents/{id}` — list and detail carrying
     **every PRD §42.4 field**: detection, owner, severity, affected versions and tenants, timeline,
     linked kill switches, customer-notification decision, correction/rollback links, resolution and
     follow-up. A field not yet set renders as explicitly unset, never as absent from the schema.
   - `POST /internal/v1/incidents/{id}/state` — transition among the six PRD §12.4 states, recorded as
     an **append** to the incident timeline (actor, from, to, reason, at) — no in-place overwrite of
     history. `RESOLVED` is refused for a SEV-1 or SEV-2 incident until a postmortem reference is
     recorded (PRD §42.4 *"SEV-1/2 require postmortem … the audit cannot be omitted"*), with
     `POSTMORTEM_REQUIRED` available as the honest intermediate state.
   - `POST /internal/v1/incidents/{id}/notification-decision` — records the customer-notification
     decision with its reason (PRD §42.4). It **sends nothing**; delivery is `16-monitor-alerts`'.
   Every one of these is wrapped in `withDangerousAction()` with `capability: 'INCIDENTS'` and a
   required reason; state transitions additionally require the typed confirmation naming both states.
3. **Bind the durable audit sink.** During area registration call
   `setInternalAuditSink(dataSevenAuditSink)` where the sink appends through `DATA-07`'s
   `appendAuditEvent(tx, ctx, entry)` inside the caller's transaction (PRD §18.5 step 6 commits *"job
   status, audit and outbox"* together; `DATA-07` deliverable 8). Because `INTL-01` refuses a dangerous
   action with no sink bound, this binding is what makes every console's audit durable. A test asserts
   that after this area loads, `getInternalAuditSink()` is non-null and that an appended event is
   readable back through `DATA-07`'s repository.
4. **Kill-switch activation — `POST /internal/v1/kill-switches`** (mounted under this area, path
   `/internal/v1/incidents/kill-switches` if the area convention requires a single root; the exact
   path is stated in the internal contract document). Body:
   `{ scope_type, scope_payload, reason, incident_id, review_or_expiry_at, confirmation }`, wrapped in
   `withDangerousAction({ incident: true, expiry: true })` so **all five PRD §12.4 requirements are
   structural**: actor (from the internal principal), reason, scope, incident and review/expiry time.
   `scope_type` covers **every** PRD §12.4 and §42.5 scope — generation (global), provider/model
   (profile), Deep Research, source, jurisdiction, corpus release/promotion, ingestion, webhooks,
   invitations, organisation (tenant), credential (key) — imported from `packages/contracts`/`DATA-07`,
   never re-declared here. `scope_payload` is validated per scope type (for example
   `organisation` requires an organisation id; `source` requires a source group id) so an activation
   cannot be broader than the operator intended. A past `review_or_expiry_at` is rejected
   (`DATA-07` deliverable 9).
5. **Deactivation is an append — `POST /internal/v1/kill-switches/{id}/deactivate`.** Requires a
   reason and typed confirmation; writes through `DATA-07`'s append-only path; performs no delete and
   no in-place clear. `GET /internal/v1/kill-switches` lists active and historical switches with the
   full lineage (activation, extensions, deactivation, expiry), and `GET
   /internal/v1/kill-switches/active` returns `DATA-07`'s `activeSwitchesAt(now)` set — the **same**
   query admission uses, so console and enforcement cannot diverge (sub-PRD **M10**).
6. **Expiry and review are visible and automatic.** The active list is derived from
   `activeSwitchesAt(now)`; a switch past its `review_or_expiry_at` is absent from it **without any
   delete**, and the detail view shows it as expired with its full record intact. Extension is a new
   append carrying its own reason and new review/expiry instant, never an edit
   (PRD §42.5 *"Kill switches expire or require review at the recorded time"*).
7. **The PRD §42.5 behaviour matrix is displayed, not implemented.** `incidents/scope-matrix.ts` holds
   the seven §42.5 rows as data (scope → admission behaviour → existing-work behaviour), quoted from
   the PRD, and every switch view shows the row for its scope so an operator knows exactly what the
   activation does and does not stop. The module contains **no** admission or cancellation logic; a
   source scan asserts it (sub-PRD **D13**).
8. **No deletion, ever.** The area exposes no `DELETE` route and no repository call that deletes,
   truncates, purges, anonymises or overrides retention; every state change is an append. Asserted by
   enumerating the route table and by a source scan for those verbs across the area
   (PRD §12.4 *"cannot bypass audit or delete data"*; PRD §42.5 *"No switch deletes content or bypasses
   retention/audit"*; PRD §42.4 SEV-1 first action *"preserve evidence"*).
9. **`apps/admin/src/features/incidents/feature.tsx`** — an `AdminFeatureModule` with `id:
   'incidents'`, a nav entry and routes `/internal/incidents`, `/internal/incidents/:incidentId`,
   `/internal/incidents/kill-switches`. Screens:
   - **incident list** — open incidents by severity with age and owner; SEV-1/2 visually and textually
     first (PRD §42.4);
   - **incident detail** — the PRD §42.4 field set, the append-only timeline, linked kill switches,
     the notification decision, and links to `INTL-04` (rollback), `INTL-08` (correction) and
     `INTL-02`/`INTL-03` (source/quarantine context);
   - **kill-switch panel** — active switches with scope, reason, incident, activated-by and a **visible
     countdown to review/expiry**, each beside its PRD §42.5 admission-behaviour row;
   - **activation dialog** — `INTL-01`'s `dangerous-action-dialog` requiring the typed challenge naming
     the exact scope and its effect, the reason, the incident (selected or created first) and the
     review/expiry instant, with an explicit statement that **the switch deletes nothing and does not
     bypass retention or audit** (PRD §41.1 *"destructive/security-sensitive actions name exact effect
     and recovery"*; PRD §42.5);
   - the PRD §31.3 async states throughout.

## Acceptance checklist (classified)

- [ ] `[machine]` The area mounts under `/internal/v1/` via `internalArea()`/`internalRoutes()` and
      `assertInternalMounting` passes (`INTL-01` contract items 1–2; PRD §8.11, §16.1)
- [ ] `[machine]` **`ADM-001` negative, every endpoint:** a customer session, a customer service-account
      credential and a widget token each receive a `404 RESOURCE_NOT_FOUND` byte-identical (apart from
      `request_id`) to the unknown-path body on every incident and kill-switch endpoint;
      unauthenticated → `401`; internal principal without `INCIDENTS` → the same `404`
      (PRD §30.2 `ADM-001`; PRD §16.5, §34.9)
- [ ] `[machine]` **`ADM-003` scope matrix:** every PRD §12.4 / §42.5 scope — generation, provider/model,
      Deep Research, source, jurisdiction, corpus release/promotion, ingestion, webhooks, invitations,
      organisation, credential — can be activated, is stored with its validated `scope_payload`, and
      appears in `activeSwitchesAt`; a payload that does not match its scope type is rejected
      (PRD §30.2 `ADM-003` *"Scope matrix … pass"*)
- [ ] `[machine]` **`ADM-003` automatic expiry:** a switch is in `activeSwitchesAt(now)` at
      `review_or_expiry_at − 1 s` and absent at `+1 s`, with the row still present and readable — proving
      expiry deletes nothing (PRD §42.5; `DATA-07` deliverable 9)
- [ ] `[machine]` **PRD §12.4 five mandatory fields:** an activation missing actor, reason, scope,
      incident or review/expiry is rejected, and a past `review_or_expiry_at` is rejected — each with an
      effect spy proving nothing was written
- [ ] `[machine]` **Audit cannot be bypassed:** every activation, deactivation, extension, state
      transition and notification decision appends the `AUTHORISED` audit event **before** the effect and
      an outcome event after; with no audit sink bound the action is refused; a sink that throws refuses
      the action (PRD §12.4, §42.4 *"the audit cannot be omitted"*)
- [ ] `[machine]` **Nothing is deleted:** the area exposes no `DELETE` route; a source scan finds no
      delete/truncate/purge/anonymise call and no retention override; deactivation and expiry both leave
      the original rows intact, asserted by row counts before and after
      (PRD §12.4, §42.5, §42.4)
- [ ] `[machine]` **PRD §12.4 six incident states** are all reachable and are the only representable
      values — asserted against the literal list
      `['INVESTIGATING','IDENTIFIED','MITIGATING','MONITORING','RESOLVED','POSTMORTEM_REQUIRED']`;
      history is append-only (an earlier timeline entry is never overwritten)
- [ ] `[machine]` **PRD §42.4 postmortem rule:** a SEV-1 or SEV-2 incident cannot reach `RESOLVED`
      without a recorded postmortem reference; SEV-3/SEV-4 can
- [ ] `[machine]` **PRD §42.4 record fields:** the incident DTO exposes detection, owner, severity,
      affected versions, affected tenants, timeline, kill switches, notification decision,
      correction/rollback links, resolution and follow-up — asserted against a literal list; unset
      fields are explicitly unset, not absent
- [ ] `[machine]` **No enforcement here:** a source scan finds no admission, cancellation, drain or
      request-denial logic in this area; the active-switch list is `DATA-07`'s `activeSwitchesAt`
      output verbatim, so console and admission cannot diverge (sub-PRD **D13**, **M10**)
- [ ] `[machine]` The audit sink is bound after this area loads: `getInternalAuditSink()` is non-null
      and an appended event is readable back through `DATA-07`'s repository (deliverable 3)
- [ ] `[machine]` PRD §22 canary: no research content, PII text or credential appears in any response,
      log line or audit event — including in `scope_payload` and `reason`, which are length-bounded
- [ ] `[machine]` `assertNoInternalSurfaceInCustomerArtifacts()` green (PRD §8.11; sub-PRD **D7**)
- [ ] `[machine]` Admin screens implement the PRD §31.3 async states, show the PRD §42.5 behaviour row
      beside every switch, and convey severity by text as well as badge (PRD §41.1, §42.5)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `ADM-003`, the tenant/security impact of the
      tenant/credential scopes, the rollback path (deactivation is an append) and known gaps
      (sub-PRD **M10**)
- [ ] `[fixture]` The committed fixtures under `apps/api/test/internal/incidents/fixtures/**` replay
      end-to-end: one incident per severity, one switch per PRD §42.5 scope, one expired switch, one
      extended switch, one deactivated switch and one SEV-1 incident awaiting postmortem — offline, no
      network, no production credentials
- [ ] `[human]` **PRD §42.5 kill-switch drill** on a locally started stack: for each scope the operator
      activates a switch with actor, reason, scope, incident and expiry, reads the PRD §42.5 behaviour
      row, observes the countdown, lets one expire and deactivates another, and confirms **no data was
      deleted and every action is in the audit trail** (PRD §30.2 `ADM-003`; PRD §42.5)
- [ ] `[human]` **PRD §42.4 incident drill**: a simulated SEV-1 cross-tenant anomaly is opened, the
      first action (global customer-data capability kill switch, PRD §42.2) is taken from this console,
      evidence preservation is confirmed, and the incident cannot be resolved without a postmortem
      reference (PRD §42.2, §42.4; `OPS-002`)
- No further `[human]` criteria — PRD §41.2 contains no `UAT-ADM-*` row (sub-PRD **M4**); `ADM-003`'s
  evidence is the scope-matrix and expiry assertions above
- No `cargo test --workspace` / `uv run pytest` item — this ticket touches no Rust and no Python
  (PRD §45.3)

## Test plan

Reviewer steps, offline: no network, no provider, no email or webhook destination, no production
credentials; an in-memory or temp-file `app.sqlite` created through `DATA-01`'s migration runner with
`DATA-07`'s factories.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`; `pnpm test`.
2. Focused: `pnpm test --filter @aer/api`, `pnpm test --filter @aer/admin`. Suites under
   `apps/api/test/internal/incidents/` and `apps/admin/test/incidents/`.
3. **`boundary.test.ts`** — `internalAreaConformance('incidents')` plus the four-row denial matrix from
   `INTL-01` contract item 4 against every endpoint.
4. **`scope-matrix.test.ts`** — parametrised over every PRD §12.4/§42.5 scope: activate with a valid
   payload (assert stored and active), activate with a mismatched payload (assert rejected), and assert
   the displayed §42.5 behaviour row matches the PRD text. Copy the construction pattern from
   `packages/database/test/operations/*` (`DATA-07`'s kill-switch matrix) so the two assertions stay
   recognisably the same.
5. **`expiry.test.ts`** — fake clock at `review_or_expiry_at ∓ 1 s`; assert presence then absence in
   `activeSwitchesAt`, and that the row count is unchanged across the boundary. Extension: assert a new
   append with its own reason, and that the earlier record is unmodified.
6. **`mandatory-fields.test.ts`** — effect spy; table-driven over missing actor/reason/scope/incident/
   expiry, past expiry, wrong typed confirmation, stale recent auth, missing capability and unbound
   audit sink — each asserting `effect.calls === 0` and no row written.
7. **`audit.test.ts`** — assert the pre-effect `AUTHORISED` event for every mutating endpoint; assert a
   throwing sink refuses the action; assert the appended event is readable through `DATA-07` and
   contains actor, reason, scope and request id and no free-text body.
8. **`no-delete.test.ts`** — enumerate the route table (no `DELETE`); source-scan for
   `delete`/`truncate`/`purge`/`anonymise`/retention override; row counts before and after deactivation
   and expiry.
9. **`incident-states.test.ts`** — the six-state literal list; append-only timeline; the SEV-1/2
   postmortem gate; the PRD §42.4 field list.
10. **`no-enforcement.test.ts`** — source scan proving no admission/cancellation/drain logic, and that
    the active list is `activeSwitchesAt`'s output verbatim.
11. **`incidents.screen.test.tsx`** — render list, detail and kill-switch panel; assert the countdown,
    the §42.5 behaviour row, and the dialog's statement that nothing is deleted.
12. `git status --porcelain` clean after the run.
13. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether any
    activation can occur without a preceding audit append; whether a scope payload can widen a switch
    beyond its declared scope (for example an organisation scope with an empty payload behaving
    globally); whether two concurrent activations for the same scope produce a consistent active set;
    whether expiry is evaluated with the same clock semantics as `DATA-07`; whether deactivation can
    race with expiry; whether any path deletes or clears a row; whether a customer principal reaches any
    endpoint.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`RUNT-02`'s admission does not consult `DATA-07.activeSwitchesAt`** (sub-PRD **M10**) → `ADM-003`'s
  end-to-end effect cannot be evidenced. Do **not** add enforcement here (sub-PRD **D13**): a second
  enforcement point would be authoritative for the API and invisible to the worker. Amend `RUNT-02`'s
  ticket and `docs/prd/03-app-runtime/README.md`, add the edge in `docs/prd/breakdown-plan.md`
  §5.4/§6.2 if one is needed, record it in `docs/prd/22-internal-admin/README.md` **M10**, and
  `--sync`.
- **A PRD §42.5 scope cannot be represented as `(scope_type, scope_payload)`** → `DATA-07`'s own
  feedback obligation names this exact case: *"record the actual representation in
  `docs/prd/01-app-data/README.md` and notify `INTL-09` and `RUNT-02`; **do not drop a scope** — PRD
  §12.4 enumerates them normatively."* Follow it; never ship a console missing a scope.
- **`DATA-07`'s repository lacks a needed query** (for example switch lineage or per-scope history) →
  do not write `packages/database/**` (plan **A3**). Add a `01-app-data` ticket and the edge in
  `docs/prd/breakdown-plan.md` §5.2/§6.2 (plan **R4**), and record it in
  `docs/prd/22-internal-admin/README.md`.
- **The audit sink cannot be bound from a route area** (composition-root problem) → the binding point
  is `INTL-01`'s exported `setInternalAuditSink`. If the composition root must move, amend `INTL-01`'s
  deliverable 5 and this ticket's deliverable 3 in one docs PR and `--sync` both — eight consoles
  depend on the sink being bound before any dangerous action runs.
- **An operator needs a switch to take effect faster than admission re-reads it** → that is a caching
  question inside `RUNT-02`, not a reason to enforce here. Record it in
  `docs/prd/03-app-runtime/README.md` and `docs/prd/22-internal-admin/README.md` **M10**.
- **An incident response appears to require deleting or anonymising customer data** (for example a
  cross-tenant disclosure) → PRD §42.4's SEV-1 first action is *"preserve evidence"* and PRD §42.5 is
  explicit that no switch deletes content. Record the requirement, escalate per layer 3, and never add
  a deletion path here; tenant closure and deletion have their own runbook
  (`docs/runbooks/tenant-closure-deletion.md`, `RLSE-10`) and their own owner.

**3. Escalation.** `ADM-003` and PRD §12.4 are release requirements with MUST force. **A kill switch
that would have to delete data or skip the audit append to work overturns PRD §12.4** (*"Every
activation requires actor, reason, scope, incident and review/expiry time and cannot bypass audit or
delete data"*) and PRD §42.5 (*"No switch deletes content or bypasses retention/audit"*): stop,
escalate for re-review, and never implement the shortcut inside this ticket. The same applies if the
scope set cannot be honoured — a switch that stops more than its named scope violates `ADM-003`'s
*"stop only the named capability/tenant/source"* just as surely as one that stops less.
