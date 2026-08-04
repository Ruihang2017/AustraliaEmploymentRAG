---
id: INTL-05
title: Licensing review console
module: 22-internal-admin
lane: 22-internal-admin
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INTL-01, INGF-04]
blocks: []
---

# INTL-05 — Licensing review console

Implements **PRD §8.11 (licensing review) and §11.1 — requirement `ADM-001`**
(epic `E29-INTERNAL-ADMIN`).
No ADR — the decision is already made in PRD §11.1 (*"LicenceAssessment MUST independently state
commercial-use, storage, indexing, embedding, display, quotation, export, attribution and
prohibited-use decisions"*); this is build ticket **5 of 10** against it.
Parent sub-PRD: [22-internal-admin README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`INTL-01`](INTL-01-internal-v1-separation-internal-identity-admin-shell.md);
`INGF-04` — Licence snapshot/assessment registry and permitted-use gate
([`05-ingestion-framework`](../../05-ingestion-framework/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
`INGF-04`'s `licence.yaml` schema and snapshot records, plus `INTL-01`'s internal boundary — not a new
subsystem decision.

## Background + basis

**What a fresh agent needs to know before touching anything.**

`INTL-01` has merged and owns the internal boundary; its "internal boundary contract" is normative
here. This ticket declares `area = internalArea({ areaId: 'licensing', capability: 'LICENSING' })`,
wraps its plugin in `internalRoutes()`, records every state-changing operation through
`withDangerousAction()` (sub-PRD **D6**) and reads operational state only through
`OperationalSnapshotStore` (sub-PRD **D5**).

`INGF-04` has merged. Its deliverable 1 fixes the per-adapter assessment document
(`pipelines/adapters/<group-id>/licence.yaml`, validated by a committed JSON Schema) with exactly the
nine PRD §11.1 axes plus `attribution_text`, `max_quote_chars`, `status`, `assessed_at`, `assessed_by`
and `notes_internal`, and states:

> The nine decision axes are exactly PRD §11.1's list: commercial-use, storage, indexing, embedding,
> display, quotation, export, attribution, prohibited-use. **A missing axis is a load error, not a
> default** — the assessment must "independently state" each one.

Its deliverable 2 makes snapshots **append-only**: *"a second capture of the same `terms_url` with
different bytes creates a **new** snapshot file and a new record; it never"* overwrites — which is what
makes "revisable with history" (the plan §5.23 goal) achievable without mutation. The INGF sub-PRD's
**D9** carries PRD §11.1's default: *"Unclear rights collapse to the metadata/link-only permission set
before any storage, indexing, embedding, display or export decision is taken."*

The licence records live on the pipeline side (`pipelines/adapters/**` files and `ingestion.sqlite`
records), which the `app` process has no path to (PRD §39.2, §39.4). Therefore **this console reviews
and records decisions; it does not rewrite `licence.yaml`.** That split is deliverable 6 and is the
honest form of sub-PRD **D5**/**M1**.

**What the PRD fixes, quoted.**

PRD §11.1 in full:

> Every SourceArtifact MUST link to the LicenceSnapshot applicable when acquired. LicenceAssessment
> MUST independently state commercial-use, storage, indexing, embedding, display, quotation, export,
> attribution and prohibited-use decisions.
>
> Assessment states: `PERMITTED`, `PERMITTED_WITH_ATTRIBUTION`, `METADATA_AND_LINK_ONLY`,
> `UNCLEAR_RESTRICTED`, `PROHIBITED`, `REVIEW_REQUIRED`.
>
> **Unclear rights default to metadata, limited quotation and official links.** The product MUST NOT
> reproduce third-party commercial headnotes or imply government endorsement. **Customer exports MUST
> apply the same restrictions.**

PRD §35.3: `licence_snapshot` (`id`, `source_id`, `captured_at`, `terms_url`, `terms_sha256`,
`artifact_key`) is **immutable**; `licence_assessment` (`id`, `licence_snapshot_id`, use-decision
columns, `attribution_text`, `max_quote_chars`, `status`, `assessed_at`, `notes_internal`) has the
constraint *"renderer/exporter enforces decisions"*.

PRD §6.1: licensing is one of the nine attributes every source must expose in the Source Coverage
Registry.

PRD §7: a group blocked by licensing MUST use an explicit status such as `LICENSING_RESTRICTED` and
MUST produce customer-visible warnings when relevant.

PRD §11.2: *"`LEGAL_REVIEW_PENDING` MUST remain an explicit launch risk and be revisited when revenue
permits."*

PRD §30.2 `ADM-001`: *"Source health, quarantine, release, **licensing**, evaluation and costs are
visible internally"*, evidence *"Customer identity cannot call internal routes"*.

**Accepted caveats carried forward, documented not enforced here.**

- **Enforcement of licence decisions at render and export time is not here.** `EVID-06`
  (`packages/citations/src/licensing/**`) and `XPRT-02`/`XPRT-03` enforce quotation, display and export
  limits; `INGF-04` enforces the permitted-use gate at ingestion. This console reviews the decision and
  shows where it is enforced.
- **The conservative quote-character ceiling for `UNCLEAR_RESTRICTED`/`REVIEW_REQUIRED` is an initial
  default**, not a product rule — `05-ingestion-framework` open question **M2**, owner Founder. This
  console displays the value and its provenance; it does not invent a policy.
- **The console cannot rewrite `licence.yaml`** (no path to `pipelines/**`, and adapter files belong to
  modules `06`–`10`). It records an audited review decision; the pipeline applies it and the applied
  state returns in the next snapshot (deliverable 6).

## Goal

Produce the internal licensing review console: `/internal/v1/licensing` endpoints serving every source
group's current `LicenceAssessment` with all nine PRD §11.1 axes stated independently, its
`LicenceSnapshot` lineage (append-only history with `captured_at`, `terms_url`, `terms_sha256`), the
six assessment states, a review queue of everything in `REVIEW_REQUIRED` or `UNCLEAR_RESTRICTED`, and
an audited review-decision endpoint; plus the `apps/admin/src/features/licensing/**` screens.
Completion is mechanically checkable: an assessment missing any of the nine axes is surfaced as a
**load error**, never as a permissive default; unclear rights are displayed as the metadata/link-only
permission set; the assessment history is append-only in the console as it is in the producer; every
review decision is audited before any effect; and every endpoint is invisible to customer identity.

## Non-goals

- **No `licence.yaml` schema, snapshot capture or permitted-use gate.** `INGF-04` owns them; this
  ticket consumes the schema and records.
- **No adapter licence content.** Modules `06`–`10` author each group's `licence.yaml`.
- **No quotation, display or export enforcement.** `EVID-06`, `XPRT-02`, `XPRT-03`.
- **No source health, freshness, quarantine or release view.** `INTL-02`, `INTL-03`, `INTL-04` —
  this console links to them and duplicates no field beyond the licensing attribute.
- **No customer-facing licence or attribution surface.** `FIND-05`, `LNCH-02` (`apps/web/src/features/legal/**`).
- **No legal advice, policy drafting or `LEGAL_REVIEW_PENDING` register.** `LNCH-01`
  (`docs/policies/**`).
- **No internal boundary code.** `INTL-01`.
- **No table, migration or repository.** `01-app-data` (plan **A3**).
- **No delete path.** Assessment history is append-only (PRD §35.3, `INGF-04` deliverable 2).

## File-scope (write-owns)

- `apps/api/src/routes/internal/licensing/**`
- `apps/api/test/internal/licensing/**` (sub-PRD **D11**), including
  `apps/api/test/internal/licensing/fixtures/**`
- `apps/admin/src/features/licensing/**`
- `apps/admin/test/licensing/**` (sub-PRD **D11**)
- `apps/admin/package.json` — **append-only**, dependencies block only (sub-PRD **D10**, plan §1.1)

Does not touch:

- `apps/api/src/routes/internal/core/**`, `apps/admin/src/app/**`, `apps/admin/{index.html,vite.config.ts,tsconfig.json}`
  — `INTL-01`.
- `apps/api/src/routes/internal/{sources,quarantine,releases,evaluation,cost,issues,incidents}/**` and
  `apps/admin/src/features/{sources,quarantine,releases,evaluation,cost,issues,incidents,overview}/**`
  — `INTL-02`…`INTL-04`, `INTL-06`…`INTL-10`.
- `pipelines/**` (including every `pipelines/adapters/<group>/licence.yaml`) — `05`–`10`.
- `packages/citations/**` — `12-evidence-safety`. `packages/**`, `schemas/**` — `00`–`03`, `11`, `12`, `20`.
- `apps/api/src/{server.ts,app.ts,bootstrap,plugins,middleware,errors,sse}/**` and every other
  `apps/api/src/routes/<area>/**` — `03-app-runtime` and the product modules.
- `apps/web/**`, `apps/widget/**`, `infra/**`, `tests/**`, `docs/policies/**` — other modules.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, nothing in flight),
so no prior ticket has written these paths. Inside `apps/api/src/routes/internal/**` and
`apps/admin/**` only `INTL-01` (this ticket's `blocked_by`) has written, owning `internal/core/**` and
`src/app/**`, and it completes first. The seven siblings that may run concurrently (plan §7 wave 2, all
blocked only by `INTL-01`) own different `internal/<area>/` and `features/<area>/` directories,
discovered by directory convention (plan **A1**, sub-PRD **D9**), so this console's arrival changes no
file another ticket owns. The single shared file is `apps/admin/package.json`, restricted to appending
distinct dependency entries; `/start-all` serialises delivery.

## Deliverables

1. **`apps/api/src/routes/internal/licensing/index.ts`** — `export const area = internalArea({ areaId:
   'licensing', capability: 'LICENSING' })` and a default export of `internalRoutes(plugin, { areaId:
   'licensing', capability: 'LICENSING' })`.
2. **`licensing/snapshot.ts`** — reads `OperationalSnapshotStore.read('LICENSING')`, validating against
   `INGF-04`'s committed `licence.schema.json` for each group's assessment plus the snapshot lineage
   records. **A document missing any of the nine axes is a load error** for that group
   (`UNAVAILABLE / INVALID_SCHEMA` with the missing axis named) — never a default value
   (`INGF-04` deliverable 1).
3. **`GET /internal/v1/licensing`** — one row per source group: `group_id`, `status` (one of the six
   PRD §11.1 states — imported from `packages/contracts` if `FND-03` exports it, otherwise projected
   from the producer's schema and never re-declared), the **nine axes each as its own field**
   (`commercial_use`, `storage`, `indexing`, `embedding`, `display`, `quotation`, `export`,
   `attribution`, `prohibited_uses`), `attribution_text`, `max_quote_chars`, `assessed_at`,
   `assessed_by`, the current `licence_snapshot_id` and `terms_url`. `notes_internal` is returned
   because this is an internal surface, and is flagged `internal_only: true` in the contract document so
   no downstream ever renders it to a customer (PRD §35.3). Cursor pagination and filters by `status`,
   `jurisdiction` and `axis` value (PRD §34.1).
4. **`GET /internal/v1/licensing/{groupId}`** — detail with the **append-only snapshot history**: every
   `licence_snapshot` for the group in capture order (`captured_at`, `terms_url`, `terms_sha256`,
   `artifact_key`) and every assessment revision attached to it, so a reviewer can see what changed and
   when. History is rendered oldest-to-newest with no edit affordance (PRD §35.3 *"immutable"*;
   `INGF-04` deliverable 2 *"append-only"*).
5. **Unclear rights are shown as the restricted permission set.** `licensing/effective.ts` derives an
   `effective_permissions` projection: for `UNCLEAR_RESTRICTED` and `REVIEW_REQUIRED` it reports the
   metadata/link-only set with limited quotation and official links, and states the derivation reason
   inline (PRD §11.1 *"Unclear rights default to metadata, limited quotation and official links"*;
   `INGF-04`'s D9). The projection is display-only and is labelled as such: the **enforcing** code is
   `INGF-04` at ingestion and `EVID-06`/`XPRT-02`/`XPRT-03` at render and export, and the response
   names those enforcement points so an operator is never misled about where the limit binds.
6. **`POST /internal/v1/licensing/{groupId}/review-decision`** — the only write. Body:
   `{ decision: 'CONFIRM' | 'REQUEST_REASSESSMENT' | 'ESCALATE_LEGAL_REVIEW', proposed_status?,
   reason, confirmation, scope: { type: 'LICENCE_ASSESSMENT', payload: { groupId, snapshotId } } }`,
   wrapped in `withDangerousAction({ incident: false, expiry: false })`. Its effect is **only** to
   record the decision: the audit event is the record of truth, and a configured decision sink is
   additionally published to. The response is
   `{ recorded: true, published: boolean, applied: false, status: 'DECISION_RECORDED' }` — the
   console **never** reports the assessment as changed; a changed assessment appears only in the next
   snapshot, produced by the pipeline from the group's own `licence.yaml`. `proposed_status` must be
   one of the six PRD §11.1 states, and proposing a **more permissive** status than the current one
   requires the reason field to be non-empty and is recorded as such in the audit event (PRD §11.1's
   conservative default is not overridable by a click).
7. **No delete, no in-place edit.** The area registers exactly the three routes above: no `DELETE`, no
   `PUT`, no `PATCH`, and no path that mutates a snapshot or an existing assessment. Asserted by
   enumerating the route table and by a source scan (PRD §35.3 *"immutable"*; PRD §12.4).
8. **`apps/admin/src/features/licensing/feature.tsx`** — an `AdminFeatureModule` with `id:
   'licensing'`, a nav entry and routes `/internal/licensing`, `/internal/licensing/:groupId`. Screens:
   - **review queue** — groups in `REVIEW_REQUIRED` or `UNCLEAR_RESTRICTED` first, then the rest, each
     showing status as text plus badge and the nine axes in a compact grid where `UNCLEAR` is visually
     and textually distinct from `DENIED`;
   - **detail** — the axis grid, `attribution_text` and `max_quote_chars` with their provenance, the
     effective-permission projection with its enforcement-point note, the append-only snapshot history
     with `terms_url` links and `terms_sha256`, and a link to `INTL-02`'s group row;
   - **decision dialog** — `INTL-01`'s `dangerous-action-dialog` with a typed challenge naming the
     group and the proposed status, a mandatory reason, and an explicit statement that recording a
     decision does not itself change the assessment or any customer-visible limit;
   - `SnapshotStatePanel` for `AVAILABLE`/`STALE`/`UNAVAILABLE` and the PRD §31.3 async states on the
     decision submission.

## Acceptance checklist (classified)

- [ ] `[machine]` The area mounts at `/internal/v1/licensing` via `internalArea()`/`internalRoutes()`
      and `assertInternalMounting` passes (`INTL-01` contract items 1–2; PRD §8.11, §16.1)
- [ ] `[machine]` **`ADM-001` negative, every endpoint:** a customer session, a customer service-account
      credential and a widget token each receive a `404 RESOURCE_NOT_FOUND` byte-identical (apart from
      `request_id`) to the unknown-path body on the list, detail and decision endpoints;
      unauthenticated → `401`; internal principal without `LICENSING` → the same `404`
      (PRD §30.2 `ADM-001`; PRD §16.5, §34.9)
- [ ] `[machine]` **PRD §11.1 nine axes:** every row exposes all nine as independent fields — asserted
      against the literal list
      `['commercial_use','storage','indexing','embedding','display','quotation','export','attribution','prohibited_uses']`
- [ ] `[machine]` **A missing axis is a load error**, surfaced as `INVALID_SCHEMA` naming the axis, and
      never rendered as a permissive default — asserted with a fixture missing `embedding`
      (`INGF-04` deliverable 1; PRD §11.1)
- [ ] `[machine]` All six PRD §11.1 states round-trip unchanged and an unknown state surfaces as unknown
      rather than being mapped into a known one
- [ ] `[machine]` **Unclear rights:** `UNCLEAR_RESTRICTED` and `REVIEW_REQUIRED` produce the
      metadata/link-only effective-permission projection with its reason, and the response names the
      enforcing components (`INGF-04`, `EVID-06`, `XPRT-02`/`XPRT-03`) rather than implying the console
      enforces anything (PRD §11.1)
- [ ] `[machine]` **Append-only history:** the detail endpoint returns every snapshot and revision in
      capture order; the area registers no `DELETE`/`PUT`/`PATCH` and a source scan finds no mutation of
      a snapshot or assessment (PRD §35.3; `INGF-04` deliverable 2; PRD §12.4)
- [ ] `[machine]` **Audit before effect:** a review decision appends the `AUTHORISED` event before the
      effect and an outcome event after; with no audit sink bound the decision is refused; missing
      reason, wrong typed confirmation, stale recent auth or missing capability each reject with the
      effect spy proving nothing ran (PRD §32.8, §12.4)
- [ ] `[machine]` A decision never reports the assessment as changed: the response carries
      `applied: false`, `status: 'DECISION_RECORDED'` and an explicit `published` flag
      (sub-PRD **M1**)
- [ ] `[machine]` `notes_internal` is flagged `internal_only` in the internal contract document and
      appears in no customer-facing artifact (asserted together with the D7 exclusion assertion)
- [ ] `[machine]` `assertSnapshotPortOnly()` and `assertNoInternalSurfaceInCustomerArtifacts()` green
      (sub-PRD **D5**, **D7**; PRD §8.11, §18.3, §39.1)
- [ ] `[machine]` PRD §22 canary: no research content, PII text or credential in any response, log line
      or audit event
- [ ] `[machine]` Admin screens implement the PRD §31.3 async states and distinguish `UNCLEAR` from
      `DENIED` by text as well as badge, not colour alone (PRD §41.1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `ADM-001` and **source/licence impact**
      explicitly (PRD §45.4 requires it for licence-affecting changes)
- [ ] `[fixture]` The committed licensing fixtures under
      `apps/api/test/internal/licensing/fixtures/**` replay end-to-end: one group per PRD §11.1 state,
      one missing an axis, one with a multi-snapshot history whose terms hash changed, one stale
      document and one schema-invalid document — each producing its expected endpoint output and screen
      state, offline with no network and no production credentials
- [ ] `[human]` PRD §43.4 founder-review linkage: item 4 of the founder test queue (*"source adapter
      count/time/**licence**/quarantine anomalies"*) is triageable from this console, and a reviewer
      confirms that recording a decision visibly does **not** change any customer-visible limit
      (PRD §11.1, §11.2)
- No further `[human]` criteria — PRD §41.2 contains no `UAT-ADM-*` row (sub-PRD **M4**)
- No `cargo test --workspace` / `uv run pytest` item — this ticket touches no Rust and no Python
  (PRD §45.3); `INGF-04`'s Python side is tested in `05-ingestion-framework`

## Test plan

Reviewer steps, offline: no network, no terms fetch, no production credentials.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`; `pnpm test`.
2. Focused: `pnpm test --filter @aer/api`, `pnpm test --filter @aer/admin`. Suites under
   `apps/api/test/internal/licensing/` and `apps/admin/test/licensing/`.
3. **`boundary.test.ts`** — `internalAreaConformance('licensing')` plus the four-row denial matrix from
   `INTL-01` contract item 4 against all three endpoints; copy the construction pattern from
   `apps/api/test/internal/core/denial.test.ts`.
4. **`axes.test.ts`** — `[fixture]` replay; assert the nine-axis literal list on every row; assert the
   missing-axis fixture yields `INVALID_SCHEMA` naming `embedding` and that no permissive value appears
   anywhere in that response.
5. **`states.test.ts`** — one fixture group per PRD §11.1 state; assert round-trip and that an injected
   unknown state is reported as unknown.
6. **`effective.test.ts`** — assert the metadata/link-only projection for `UNCLEAR_RESTRICTED` and
   `REVIEW_REQUIRED`, that the reason is present, and that the enforcement-point note names
   `INGF-04`/`EVID-06`/`XPRT-02`/`XPRT-03`.
7. **`history.test.ts`** — the multi-snapshot fixture; assert capture order, that both `terms_sha256`
   values are present, and that no endpoint can modify or remove a historical record.
8. **`decision.test.ts`** — effect spy over the rejection causes (no capability, unsatisfied MFA, stale
   recent auth, wrong confirmation, empty reason, unbound audit sink) asserting `effect.calls === 0`;
   success row asserting one pre-effect `AUTHORISED` event, `applied === false` and
   `status === 'DECISION_RECORDED'`; a more-permissive `proposed_status` row asserting the reason is
   mandatory and recorded in the audit event.
9. **`read-only-shape.test.ts`** — enumerate the route table and assert the exact three-route set with
   no `DELETE`/`PUT`/`PATCH`.
10. **`licensing.screen.test.tsx`** — render queue and detail against each fixture; assert `UNCLEAR` is
    textually distinct from `DENIED`, the history is read-only, and the dialog states that nothing
    changes on record.
11. `git status --porcelain` clean after the run.
12. **Reviewer focus** (CLAUDE.md): whether a missing axis can be silently defaulted; whether the
    effective-permission projection can be read as enforcement; whether a review decision can appear to
    apply; whether history can be mutated; whether `notes_internal` can escape to a customer artifact;
    whether a customer principal reaches any endpoint.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`INGF-04`'s exported licensing document lacks the snapshot lineage or an axis** → do not derive it
  here and do not write `pipelines/**`. Amend `INGF-04`'s ticket and
  `docs/prd/05-ingestion-framework/README.md` in one docs PR, record the dependency in
  `docs/prd/22-internal-admin/README.md`, then `--sync` both.
- **An operator genuinely needs the console to change an assessment** (not merely record a decision) →
  `licence.yaml` belongs to the owning adapter module (`06`–`10`) and the gate belongs to `INGF-04`;
  a write path would put a legal decision in two places. Record it in
  `docs/prd/22-internal-admin/README.md` **M1** and, if accepted, as a plan change in
  `docs/prd/breakdown-plan.md` §5.23/§6.2. Never open `ingestion.sqlite` or write `pipelines/**` from
  `apps/api` (PRD §18.3, §39.1, sub-PRD **D5**).
- **The six PRD §11.1 states are not in `packages/contracts`** → canonical enums are serial-owned by
  `FND-03` (plan §4.1). Raise a `00-foundation` ticket, project the producer's values meanwhile, and
  note it in `docs/prd/22-internal-admin/README.md`. Never re-declare the list locally as the source of
  truth.
- **`max_quote_chars` has no defensible default for an unclear licence** → that is
  `05-ingestion-framework` open question **M2**, owner Founder. Display the value and its provenance;
  do not invent a ceiling in this console.
- **A group's assessment implies a customer-visible warning that no surface shows** → PRD §7 requires
  the warning; the surfaces are `FIND-05` and `LNCH-02`. Raise it in
  `docs/prd/22-internal-admin/README.md` open questions with the owning module named; do not add a
  customer surface here.

**3. Escalation.** PRD §11.1's *"Unclear rights default to metadata, limited quotation and official
links"* and the independence of the nine axes are MUSTs, and PRD §11.2 keeps `LEGAL_REVIEW_PENDING` an
explicit launch risk. If the console cannot present the axes independently, or a permissive default
would be needed to make a screen work, that overturns a release requirement with legal consequences:
stop, escalate for re-review, and never ship the permissive default. **A review action that would have
to mutate an immutable snapshot or skip the audit append overturns PRD §35.3 and §12.4** — escalate,
never implement the shortcut.
