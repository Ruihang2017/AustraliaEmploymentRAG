---
id: INTL-03
title: Quarantine console and operator recovery actions
module: 22-internal-admin
lane: 22-internal-admin
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INTL-01, INGF-05]
blocks: []
---

# INTL-03 — Quarantine console and operator recovery actions

Implements **PRD §8.11 (quarantine), §12.2 and §40.8 item 10 — requirement `ADM-001`**
(epic `E29-INTERNAL-ADMIN`).
No ADR — the decision is already made in PRD §12.2 (*"Failed parsing, licensing ambiguity, count
anomalies, OCR defects, identity conflicts and broken structure MUST enter quarantine"*) and PRD §40.8
item 10 (*"quarantine cases and operator recovery action"*); this is build ticket **3 of 10** against
it.
Parent sub-PRD: [22-internal-admin README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`INTL-01`](INTL-01-internal-v1-separation-internal-identity-admin-shell.md);
`INGF-05` — Quarantine, ingestion-run accounting and anomaly rules
([`05-ingestion-framework`](../../05-ingestion-framework/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
`INGF-05`'s quarantine reason table and item schema, plus `INTL-01`'s internal boundary — not a new
subsystem decision.

## Background + basis

**What a fresh agent needs to know before touching anything.**

`INTL-01` has merged and owns the internal boundary; its "internal boundary contract" section is
normative here. This ticket declares
`area = internalArea({ areaId: 'quarantine', capability: 'QUARANTINE' })`, wraps its plugin in
`internalRoutes()`, records every state-changing operation through `withDangerousAction()`
(audit **before** effect, recent MFA, typed confirmation, scope, reason — sub-PRD **D6**), and reads
operational state only through `OperationalSnapshotStore` (sub-PRD **D5**).

`INGF-05` has merged. Its deliverable 3 is named in its own ticket as *"the `INTL-03` contract"*:

> `QUARANTINE_REASONS: Mapping[FailureCode, QuarantineReason]` where
> `QuarantineReason(code, klass, severity, operator_action, recovery_command | None)` and `klass` is
> one of the **six PRD §12.2 classes**: `PARSE_FAILURE`, `LICENSING_AMBIGUITY`, `COUNT_ANOMALY`,
> `OCR_DEFECT`, `IDENTITY_CONFLICT`, `BROKEN_STRUCTURE`. Every failure code registered by any area …
> must map to a class and carry a **non-empty `operator_action`**; an unmapped code maps to
> `UNCLASSIFIED_FAILURE` with the action "triage in the quarantine console and add a mapping" — a test
> asserts the registry is total.

and its deliverable 4 fixes the item shape and the absence of a delete path:

> `quarantine(...)` writes one `quarantine_item` with `status="OPEN"` … `details_json` is a bounded
> structure (stage, descriptor key, official URL, message, up to 2 KiB of context) and **never**
> contains raw document bytes. `resolve(item_id, resolution, actor)` sets `status="RESOLVED"` and
> `resolved_at`; **there is no delete path.** `has_open_quarantine(group_ids)` … are the exported
> predicates `CRPS-06`/`RLSE-07` use for PRD §35.3's *"cannot enter promoted release while open"*.

The quarantine store is `ingestion.sqlite` (INGF sub-PRD **D6**), a Python-side working store that the
`app` process has no path to (PRD §39.2/§39.4 give `app` only the app/ephemeral databases, the worker
enqueue, the export prefix and localhost search). Therefore **this console reads a snapshot and records
decisions; it does not mutate the pipeline store.** That split is deliverable 6 below and is the
honest form of sub-PRD **D5**/**M1**.

**What the PRD fixes, quoted.**

PRD §12.2 in full:

> Failed parsing, licensing ambiguity, count anomalies, OCR defects, identity conflicts and broken
> structure MUST enter quarantine. Candidate corpus releases MUST pass completeness, time, identity,
> citation, licensing, smoke search, evaluation-subset and manifest checks. **Failed releases MUST NOT
> modify active production data.**

PRD §35.3, `quarantine_item`: columns `id`, `ingestion_run_id`, `artifact_id`, `reason_code`,
`details_json`, `status`, `resolution`, `resolved_at`, with the constraint **"cannot enter promoted
release while open"**.

PRD §40.8 item 10 makes *"quarantine cases and operator recovery action"* part of every adapter's
twelve-item Definition of Done — so an item whose reason has no defined action is a defect in the
adapter, and this console is where that shows up.

PRD §40.9: *"Critical identity/time/citation and mandatory-source failures block release; percentage
thresholds are refined per source after baseline measurement."*

PRD §42.2, disk pressure row: *"Stop candidate download/build; rotate safe logs/cache; **never delete
active/backup evidence blindly**."* — an operator console must not offer a delete.

PRD §32.8: *"Dangerous actions use recent MFA, typed confirmation, scope, reason and expiry/review."*

PRD §30.2 `ADM-001`: *"Source health, quarantine, release, licensing, evaluation and costs are visible
internally"*, evidence *"Customer identity cannot call internal routes"*.

**Accepted caveats carried forward, documented not enforced here.**

- **The console cannot apply a resolution itself** (no path to `ingestion.sqlite`). It records an
  audited operator decision; the pipeline applies it and the applied result returns in the next
  snapshot. The item lifecycle this console can drive is therefore `OPEN → DECISION_RECORDED` only;
  `RESOLVED` always comes from the producer (deliverable 6). Sub-PRD **M1** owns the transport.
- **Anomaly thresholds are baseline-selected, not a Founder guess** — plan §8 **Q9**, PRD §40.9
  (*"refined per source after baseline measurement"*). `INGF-05`'s ±10% count change and >2% parse
  failure are **initial defaults** that each adapter may tighten or replace once it has a
  representative baseline; the critical identity, time, mandatory-source and citation failures are
  unconditional blockers that no percentage threshold affects; and `GOLD-16` consolidates and verifies
  the final per-source thresholds. This console reports the reason code, class, severity and recorded
  detail exactly as `INGF-05` produced them; it holds no threshold of its own, tunes none and overrides
  none.
- **`ACCEPT_AS_LIMITED` is a triage decision, not a launch-scope decision.** Recording it marks an item
  for the pipeline; it does not put a source group into a registry limited state. Under the confirmed
  plan §8 **Q10** policy a limited state exists only in `INGF-07`'s `limitation` block with its
  measured evidence, is proposed by `GOLD-16` and is verified and signed off by the Founder at Gate 2 —
  never from this console (`INTL-02` displays the result).
- **Blocking promotion on open quarantine is not enforced here.** `CRPS-06` and `RLSE-07` own that
  predicate; this console shows the count and which groups are blocked.

## Goal

Produce the internal quarantine console: `/internal/v1/quarantine` endpoints serving the open and
resolved queue grouped by the six PRD §12.2 reason classes, each item carrying its **non-empty defined
operator action** from `INGF-05`'s reason table, plus an audited operator-decision endpoint that
records a triage decision without ever deleting data or mutating a resolved item; and the
`apps/admin/src/features/quarantine/**` screens. Completion is mechanically checkable: every reason
code present in a fixture resolves to a non-empty operator action (an unmapped code surfaces as
`UNCLASSIFIED_FAILURE` with its triage action, never as blank); the console exposes no delete, purge or
force-resolve path; every decision produces exactly one audit event appended **before** any effect; and
every endpoint is invisible to customer identity.

## Non-goals

- **No quarantine sink, reason table, run accounting or anomaly rules.** `INGF-05` owns them; this
  ticket consumes the table and the item schema and adds no reason code of its own.
- **No parse, OCR, fetch or re-ingestion execution.** `INGF-02`, `INGF-06`, `INGF-08`. The console
  records a decision; the pipeline acts on it.
- **No promotion gating.** `CRPS-06` (candidate gates) and `RLSE-07` (promotion); the release console
  is `INTL-04`.
- **No source health, freshness or registry view.** `INTL-02` — this console links to it and duplicates
  no field.
- **No licence assessment or state change.** `INTL-05`.
- **No incident creation or kill switch.** `INTL-09`. A quarantine spike that warrants an incident is
  raised there; this console links, and creates nothing.
- **No internal boundary code.** `INTL-01` — admission, identity, session policy, audit sink,
  dangerous-action envelope, snapshot store and the shared assertions are imported.
- **No table, migration or repository.** `01-app-data` (plan **A3**).
- **No delete, purge, truncate or force-resolve capability anywhere.** PRD §12.4, §42.2, §42.5 and
  `INGF-05` (*"there is no delete path"*).

## File-scope (write-owns)

- `apps/api/src/routes/internal/quarantine/**`
- `apps/api/test/internal/quarantine/**` (sub-PRD **D11**), including
  `apps/api/test/internal/quarantine/fixtures/**`
- `apps/admin/src/features/quarantine/**`
- `apps/admin/test/quarantine/**` (sub-PRD **D11**)
- `apps/admin/package.json` — **append-only**, dependencies block only (sub-PRD **D10**, plan §1.1)

Does not touch:

- `apps/api/src/routes/internal/core/**`, `apps/admin/src/app/**`, `apps/admin/{index.html,vite.config.ts,tsconfig.json}`
  — `INTL-01`.
- `apps/api/src/routes/internal/{sources,releases,licensing,evaluation,cost,issues,incidents}/**` and
  `apps/admin/src/features/{sources,releases,licensing,evaluation,cost,issues,incidents,overview}/**`
  — `INTL-02`, `INTL-04`…`INTL-10`.
- `apps/api/src/{server.ts,app.ts,bootstrap,plugins,middleware,errors,sse}/**` and every other
  `apps/api/src/routes/<area>/**` — `03-app-runtime` and the product modules.
- `pipelines/**` — `04`–`10`, `21`. `packages/**`, `schemas/**` — `00`–`03`, `11`, `12`, `20`.
- `apps/web/**`, `apps/widget/**`, `infra/**`, `tests/**`, `docs/runbooks/**` — other modules.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, nothing in flight),
so no prior ticket has written these paths. The only ticket that has written inside
`apps/api/src/routes/internal/**` or `apps/admin/**` before this one is `INTL-01` (this ticket's
`blocked_by`), which owns `internal/core/**` and `src/app/**` and completes first. The seven siblings
that may run **concurrently** (plan §7 wave 2, all blocked only by `INTL-01`) own different
`internal/<area>/` and `features/<area>/` directories; under plan **A1** and sub-PRD **D9** both trees
are discovered by directory convention, so this console's arrival changes no file another ticket owns
(`RUNT-01` contract item 6; `INTL-01` contract item 8). The single shared file is
`apps/admin/package.json`, restricted to appending distinct dependency entries; `/start-all` serialises
delivery, so lockfile regenerations land one at a time.

## Deliverables

1. **`apps/api/src/routes/internal/quarantine/index.ts`** — `export const area = internalArea({ areaId:
   'quarantine', capability: 'QUARANTINE' })` and a default export of `internalRoutes(plugin, { areaId:
   'quarantine', capability: 'QUARANTINE' })`. No prefix, no admission override, no local guard.
2. **`quarantine/snapshot.ts`** — reads `OperationalSnapshotStore.read('QUARANTINE')`, validating
   against `INGF-05`'s committed schema for the exported quarantine document (items + the
   `QUARANTINE_REASONS` table + per-group open counts). Exposes
   `readQuarantine(): Promise<SnapshotResult<QuarantineDocument>>`. Timestamps and statuses come from
   the document; the read time is never substituted.
3. **`GET /internal/v1/quarantine`** — the queue. Cursor-paginated (PRD §34.1), filterable by
   `reason_class` (the six PRD §12.2 classes), `reason_code`, `group_id`, `status`
   (`OPEN | DECISION_RECORDED | RESOLVED`) and `severity`. Each row carries `id`, `ingestion_run_id`,
   `artifact_id`, `reason_code`, `reason_class`, `severity`, **`operator_action`** (non-empty by
   construction — deliverable 5), `recovery_command | null`, a **bounded** `details` projection
   (stage, descriptor key, official URL, message — capped, never raw document bytes) and the
   timestamps. Sorted by severity then age by default so the solo operator sees the worst first
   (PRD §32.8).
4. **`GET /internal/v1/quarantine/summary`** — counts by reason class and by group, the set of groups
   with open items (the *"cannot enter promoted release while open"* blocking set, PRD §35.3), and the
   snapshot's `generatedAt`/`sourceRef`. Shape documented in the internal contract document so
   `INTL-04` can display "promotion blocked by open quarantine" and `INTL-10` can show a count
   (sub-PRD **M6**) without a new endpoint.
5. **Every reason has an action, mechanically.** `quarantine/reasons.ts` projects `INGF-05`'s
   `QUARANTINE_REASONS` from the snapshot document; a code absent from the table is rendered as
   `UNCLASSIFIED_FAILURE` with that entry's triage action — **never** an empty string, `null` or a
   dash. A response assertion (and a test) proves `operator_action.length > 0` for every returned row
   (PRD §40.8 item 10; the plan §5.23 goal *"Every quarantine reason has a defined operator action"*).
6. **`POST /internal/v1/quarantine/{itemId}/decision`** — the only write. Body:
   `{ decision: 'REQUEUE' | 'ACCEPT_AS_LIMITED' | 'NEEDS_SOURCE_FIX' | 'DEFER', reason, confirmation,
   scope: { type: 'QUARANTINE_ITEM', payload: { itemId, groupId, reasonCode } } }`. It is wrapped in
   `withDangerousAction({ incident: false, expiry: false })`, so recent MFA, typed confirmation, a
   non-empty reason and an audit append **before** the effect are structural (`INTL-01` deliverable 6).
   Its effect is **only** to record the decision:
   - the decision is durable in the audit trail (the audit event is the record of truth);
   - when a decision sink is configured it is additionally published for the pipeline;
   - the item's console-visible status becomes `DECISION_RECORDED`; it **never** becomes `RESOLVED`
     here. `RESOLVED` appears only when the next snapshot says so (`INGF-05.resolve` is the pipeline's).
   The response states which of the two happened: `{ recorded: true, published: boolean, status:
   'DECISION_RECORDED' }` — with `published: false` the operator sees that the pipeline has not yet
   acted, rather than a false success. A decision on an item already `RESOLVED` in the snapshot returns
   `409 CONCURRENT_MODIFICATION` (PRD §34.9).
7. **No deletion, no force-resolve.** The area registers exactly the three routes above; there is no
   `DELETE`, no `PUT`, no "purge", no "clear queue", and no endpoint that sets `RESOLVED`. Asserted by
   enumerating the route table and by a source scan for the forbidden verbs
   (PRD §12.4 *"cannot … delete data"*; PRD §42.2 *"never delete active/backup evidence blindly"*;
   `INGF-05` *"there is no delete path"*).
8. **`apps/admin/src/features/quarantine/feature.tsx`** — an `AdminFeatureModule` with `id:
   'quarantine'`, a nav entry and routes `/internal/quarantine` and `/internal/quarantine/:itemId`.
   Screens:
   - **queue** — grouped by reason class with counts, severity and age; each row shows the defined
     operator action inline so triage needs no second lookup;
   - **item detail** — the bounded details projection, the run and group context, a link to `INTL-02`'s
     group detail, and the decision form;
   - **decision dialog** — `INTL-01`'s `dangerous-action-dialog` with the typed challenge naming the
     exact effect (for example *"record REQUEUE decision for item `<id>` in group `<group>`"*), the
     reason field, and an explicit statement that recording a decision does not itself resolve or delete
     anything (PRD §41.1 *"destructive/security-sensitive actions name exact effect and recovery"*);
   - every screen uses `SnapshotStatePanel` for `AVAILABLE`/`STALE`/`UNAVAILABLE` and the PRD §31.3
     async states for the decision submission.

## Acceptance checklist (classified)

- [ ] `[machine]` The area mounts at `/internal/v1/quarantine` via `internalArea()`/`internalRoutes()`
      and `assertInternalMounting` passes (`INTL-01` contract items 1–2; PRD §8.11, §16.1)
- [ ] `[machine]` **`ADM-001` negative, every endpoint:** a customer session, a customer service-account
      credential and a widget token each receive a `404 RESOURCE_NOT_FOUND` byte-identical (apart from
      `request_id`) to the unknown-path body on the queue, summary and decision endpoints;
      unauthenticated → `401`; internal principal without `QUARANTINE` → the same `404`
      (PRD §30.2 `ADM-001`; PRD §16.5, §34.9)
- [ ] `[machine]` **Every returned item has a non-empty `operator_action`**, including an item whose
      `reason_code` is absent from the reason table (rendered `UNCLASSIFIED_FAILURE` with its triage
      action) — asserted over a fixture containing one unmapped code (PRD §40.8 item 10; `ADM-001`)
- [ ] `[machine]` All six PRD §12.2 reason classes are representable and filterable, asserted against a
      literal list `['PARSE_FAILURE','LICENSING_AMBIGUITY','COUNT_ANOMALY','OCR_DEFECT','IDENTITY_CONFLICT','BROKEN_STRUCTURE']`
- [ ] `[machine]` **No deletion or force-resolve surface:** the route table contains exactly the three
      routes of deliverables 3, 4 and 6; no `DELETE`/`PUT` route exists; a source scan finds no
      delete/purge/truncate call and no code path setting `RESOLVED`
      (PRD §12.4, §42.2; `INGF-05`)
- [ ] `[machine]` **Audit before effect:** a decision produces exactly one `AUTHORISED` audit event
      **before** the effect and one outcome event after; with no audit sink bound the decision is
      refused and nothing is recorded; missing reason, wrong typed confirmation, stale recent auth or a
      missing capability each reject before the effect — asserted with an effect spy
      (PRD §32.8, §12.4; `INTL-01` deliverable 6)
- [ ] `[machine]` A decision never reports `RESOLVED`: the response status is `DECISION_RECORDED`, and
      `published` is `false` when no decision sink is configured — asserted as an explicit field, not
      an omission (sub-PRD **M1**)
- [ ] `[machine]` A decision on an item the snapshot already reports `RESOLVED` returns
      `409 CONCURRENT_MODIFICATION` (PRD §34.9)
- [ ] `[machine]` `details` projection is bounded and contains no raw document bytes — asserted with a
      fixture whose `details_json` carries an oversized payload (PRD §35.3; `INGF-05` deliverable 4)
- [ ] `[machine]` `assertSnapshotPortOnly()` passes for this area (sub-PRD **D5**; PRD §18.3, §39.1)
- [ ] `[machine]` `assertNoInternalSurfaceInCustomerArtifacts()` green after this ticket
      (PRD §8.11; sub-PRD **D7**)
- [ ] `[machine]` PRD §22 canary: a canary string in a fixture's `details_json` appears in no log line
      and no audit event; no response carries research content, PII text or a credential
- [ ] `[machine]` Admin screens implement the PRD §31.3 async states via `INTL-01`'s components and
      convey severity by text plus badge, not colour alone (PRD §41.1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `ADM-001`, source/licence impact, and the
      recorded-not-applied decision boundary as a known gap (sub-PRD **M1**)
- [ ] `[fixture]` The committed quarantine fixtures under
      `apps/api/test/internal/quarantine/fixtures/**` replay end-to-end: one document covering all six
      PRD §12.2 classes, one unmapped reason code, one oversized `details_json`, one already-`RESOLVED`
      item, one stale document and one schema-invalid document — each producing its expected endpoint
      output and screen state, offline with no network and no production credentials
- [ ] `[human]` PRD §42 operational walkthrough on a locally started stack: for each of the six PRD
      §12.2 classes the operator can read the defined recovery action and record a decision, and the
      console offers no way to delete or force-resolve an item (PRD §40.8 item 10, §42.2; `ADM-001`)
- No further `[human]` criteria — PRD §41.2 contains no `UAT-ADM-*` row (sub-PRD **M4**)
- No `cargo test --workspace` / `uv run pytest` item — this ticket touches no Rust and no Python
  (PRD §45.3); `INGF-05`'s Python side is tested in `05-ingestion-framework`

## Test plan

Reviewer steps, offline: no network, no ingestion run, no production credentials.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`; `pnpm test`.
2. Focused: `pnpm test --filter @aer/api`, `pnpm test --filter @aer/admin`. Suites under
   `apps/api/test/internal/quarantine/` and `apps/admin/test/quarantine/`.
3. **`boundary.test.ts`** — `internalAreaConformance('quarantine')` plus the four-row denial matrix
   from `INTL-01` contract item 4 against all three endpoints; copy the construction pattern from
   `apps/api/test/internal/core/denial.test.ts`.
4. **`reasons.test.ts`** — `[fixture]` replay; assert `operator_action.length > 0` for every row over
   every fixture, including the unmapped-code document; assert the six-class literal list.
5. **`decision.test.ts`** — effect spy; table-driven over the rejection causes (no capability,
   unsatisfied MFA, stale recent auth, wrong confirmation, empty reason, unbound audit sink) asserting
   `effect.calls === 0`; success row asserting one pre-effect `AUTHORISED` event, one outcome event,
   `status === 'DECISION_RECORDED'` and `published === false` with no sink configured. Add a
   concurrency case: two identical decisions submitted simultaneously produce two audit events and no
   inconsistent status, and a decision against an already-`RESOLVED` item returns `409`.
6. **`no-delete.test.ts`** — enumerate the Fastify route table for the area and assert the exact
   three-route set; source-scan for `delete`, `purge`, `truncate`, `resolve(` and `status = 'RESOLVED'`.
7. **`details-bounds.test.ts`** — oversized fixture; assert the projection is capped and no raw bytes
   appear in the response.
8. **`architecture.test.ts`** — `assertSnapshotPortOnly()` and
   `assertNoInternalSurfaceInCustomerArtifacts()`.
9. **`quarantine.screen.test.tsx`** — render the queue and detail against each fixture; assert the
   decision dialog requires the typed challenge and reason, states that nothing is deleted, and that a
   stale snapshot renders `SnapshotStatePanel` rather than an empty queue.
10. `git status --porcelain` clean after the run.
11. **Reviewer focus** (CLAUDE.md): whether any path can set `RESOLVED` locally; whether a decision can
    be recorded without an audit event under sink failure; whether the reason projection can yield an
    empty action; whether the details projection can leak document bytes; whether two concurrent
    decisions can interleave into an inconsistent console state; whether a customer principal reaches
    any endpoint.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`INGF-05`'s exported quarantine document lacks the reason table, the per-group open counts or a
  field this console shows** → do not derive it here and do not write `pipelines/**`. Amend `INGF-05`'s
  ticket and `docs/prd/05-ingestion-framework/README.md` in one docs PR, record the dependency in
  `docs/prd/22-internal-admin/README.md`, then `--sync` both.
- **An operator genuinely needs the console to apply a resolution** (not merely record a decision) →
  that requires a transport into the pipeline store, which is sub-PRD **M1** and crosses into
  `05-ingestion-framework` and `18-ops-release`. Record it in
  `docs/prd/22-internal-admin/README.md` **M1** and, if accepted, as a plan change in
  `docs/prd/breakdown-plan.md` §5.23/§6.2. Never open `ingestion.sqlite` from `apps/api` — PRD §18.3,
  §39.1 and sub-PRD **D5** forbid it.
- **A reason code has no operator action** → that is an adapter Definition-of-Done defect
  (PRD §40.8 item 10), not something to paper over. The console must surface it as
  `UNCLASSIFIED_FAILURE`; raise the missing mapping against the owning adapter module and record it in
  `docs/prd/05-ingestion-framework/README.md`. Never substitute a generic sentence of your own.
- **An adapter tightens or replaces a percentage threshold after its representative baseline** (plan
  §8 **Q9**) → nothing changes here. The thresholds live with `INGF-05` and the per-adapter PRD §40.8
  item 8, and this console reports whatever fired. Never add a threshold constant, a tuning control or
  an override to this area, and never present a fired threshold as a number someone guessed.
- **The decision vocabulary (`REQUEUE`/`ACCEPT_AS_LIMITED`/`NEEDS_SOURCE_FIX`/`DEFER`) does not match
  what the pipeline can act on** → align it with `INGF-05`'s `resolution` values in one docs PR across
  both tickets before writing code; a mismatch would make the audit trail unreadable against the
  pipeline's own records.
- **A decision needs to become an incident** → `INTL-09` owns incidents and kill switches; link, do not
  create. If the link needs an edge, that is a plan change in `docs/prd/breakdown-plan.md` §5.23/§6.2.

**3. Escalation.** PRD §12.4 (*"cannot bypass audit or delete data"*), PRD §42.2 (*"never delete
active/backup evidence blindly"*) and `INGF-05`'s *"there is no delete path"* are absolute. **A
recovery action that would have to delete data or skip the audit append to work overturns PRD
§12.4** — stop, escalate for re-review, and never implement the shortcut inside this ticket. Likewise,
if PRD §40.8 item 10's guarantee (every quarantine case has a defined operator action) proves
unattainable, that overturns a Definition-of-Done item across 52 adapters: escalate rather than
shipping a console with blank actions.
