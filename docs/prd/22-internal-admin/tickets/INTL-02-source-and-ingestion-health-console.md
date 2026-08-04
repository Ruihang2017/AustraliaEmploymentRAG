---
id: INTL-02
title: Source and ingestion health console
module: 22-internal-admin
lane: 22-internal-admin
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INTL-01, INGF-07]
blocks: [INTL-10]
---

# INTL-02 — Source and ingestion health console

Implements **PRD §8.11 (source and ingestion health), §12.1 and §6.1 — requirement `ADM-001`**
(epic `E29-INTERNAL-ADMIN`).
No ADR — the decision is already made in PRD §8.11 and §12.1 (*"Customer-visible source metadata MUST
separate: last discovery check; last successful change scan; last full reconciliation; last content
ingestion; freshness status"*); this is build ticket **2 of 10** against it.
Parent sub-PRD: [22-internal-admin README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`INTL-01`](INTL-01-internal-v1-separation-internal-identity-admin-shell.md);
`INGF-07` — Source Coverage Registry composition and freshness fields
([`05-ingestion-framework`](../../05-ingestion-framework/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
`INGF-07`'s composed-registry schema and `INTL-01`'s internal boundary — not a new subsystem decision.

## Background + basis

**What a fresh agent needs to know before touching anything.**

`INTL-01` has merged. It owns the internal boundary and exports, from
`apps/api/src/routes/internal/core`: `internalArea()`, `internalRoutes()`, `withDangerousAction()`,
`crossOrganisationRead()`, the `OperationalSnapshotStore` port with `fileSnapshotStore()`, and the
reusable assertions `internalAreaConformance()`, `assertNoInternalSurfaceInCustomerArtifacts()`,
`assertNoContentLeak()` and `assertSnapshotPortOnly()`. Its contract section
("The internal boundary contract") is normative here: this ticket declares
`area = internalArea({ areaId: 'sources', capability: 'SOURCE_HEALTH' })`, wraps its plugin in
`internalRoutes()`, and reads operational state **only** through `OperationalSnapshotStore`
(sub-PRD **D5**). It writes no admission, identity, audit or snapshot machinery of its own.

`INGF-07` has merged. It owns `pipelines/ingestion/src/<root>/registry/**` and produces the
**composed registry document**: a deterministic merge of every source group's `registry.yaml`,
`licence.yaml` and `allowlist.yaml` with run history, validated against a committed JSON Schema, keeping
the five PRD §12.1 dates as **separate fields** and deriving `freshness_status`. Its own goal statement:

> a deterministic composer that merges every group's `registry.yaml`, `licence.yaml` (`INGF-04`) and
> `allowlist.yaml` (`INGF-02`) with run history into one machine-readable registry keeping the five
> PRD §12.1 dates as separate fields, and a `freshness_status` derivation that shows
> `FRESHNESS_LIMITED` rather than a false guarantee — with composition failing when any mandatory
> group is missing, when any group is still `PLANNED_NOT_ACTIVE` in release mode, and when a group
> declares one of the four PRD §7 limited states without the evidence, affected dates or collections,
> customer-visible warning and reason the confirmed plan §8 **Q10** policy requires.

`INGF-07` states this ticket's boundary explicitly in its non-goals: *"**No internal admin console** —
`INTL-02` (`22-internal-admin`), `blocked_by` this ticket."* The composed document is this ticket's
input contract; its JSON Schema is the validator passed to `fileSnapshotStore`.

**What the PRD fixes, quoted.**

PRD §6.1: *"Every source MUST appear in the Source Coverage Registry with **authority, jurisdiction,
official endpoints, document/date coverage, licensing, adapter status, change-detection capability,
freshness and known gaps**."* — the nine attributes this console must show.

PRD §12.1, in full for the parts this console renders:

> Critical official collections SHOULD be checked every 6–12 hours … Normal official collections
> SHOULD be checked at least daily where source capability permits. Weekly collection count/hash
> reconciliation and deeper monthly manifest reconciliation are required. The target is to detect
> official change within 24 hours and normally process/validate/publish within a further 24 hours.
> **Sources without reliable delta mechanisms MUST show `FRESHNESS_LIMITED` rather than a false
> guarantee.**
>
> Customer-visible source metadata MUST separate:
> - last discovery check;
> - last successful change scan;
> - last full reconciliation;
> - last content ingestion;
> - freshness status.

PRD §7: *"No mandatory source group may remain `PLANNED_NOT_ACTIVE` at release. A group blocked by
official capability or licensing MUST use an explicit status such as `METADATA_AND_LINK_ACTIVE`,
`FRESHNESS_LIMITED`, `LICENSING_RESTRICTED` or `SOURCE_UNAVAILABLE` and MUST produce customer-visible
warnings when relevant."*

PRD §42.2, the row this console must make visible before the alert fires:
*"Critical source freshness | misses declared critical SLA by 2× | Immediate | Mark degraded; stop
definitive affected answers if material."*

PRD §44.4 / §26: a mandatory group must be ACTIVE or explicitly limited — *"it cannot be silently
omitted"*.

PRD §30.2 `ADM-001`: *"Source health, quarantine, release, licensing, evaluation and costs are visible
internally"*, evidence *"Customer identity cannot call internal routes"*.

**The limited-state launch policy is settled (plan §8 Q10, confirmed policy).** It governs what this
console shows and how:

1. No mandatory source group is pre-selected for omission or reduced implementation; every
   Commonwealth, state and territory mandatory group in the approved MVP scope is attempted in full,
   and there is no date-driven scope reduction.
2. A source group may be in a customer-visible limited state **only** where measured evidence shows a
   genuine limitation prevents `ACTIVE`: an official capability limit, the official body not
   publishing the material, a licensing restriction, historical material unavailable, a freshness
   limitation, or another real official-source constraint.
3. The permitted states are the four the PRD already defines: `METADATA_AND_LINK_ACTIVE`,
   `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`.
4. A limited state records the evidence, the affected dates or collections, the customer-visible
   warning, and why full coverage is unavailable.
5. Silent omission is prohibited, and no unofficial source or commercial headnote may substitute for
   unavailable official material.
6. `GOLD-16` produces the measured evidence and the proposed registry state; `LNCH-05` verifies that
   the launch statement discloses those limitations accurately; Gate 2 is the Founder's verification
   and sign-off step under this policy, not an opportunity to cut mandatory scope.

**`INGF-07` has already made items 4 and 5 mechanical, and that is this console's input contract.**
`registry.yaml` carries a `limitation` block that is required to be non-null **exactly when**
`adapter_status` is one of the four limited states, and composition fails without it
(`REGISTRY_LIMITATION_MISSING`, `_UNEVIDENCED`, `_SCOPE_MISSING`, `_WARNING_MISSING`). The composed
output carries the block through **verbatim** (`INGF-07` deliverable 7) because `GOLD-16` and
`LNCH-05` read it from there:

| Member | Content |
|---|---|
| `state` | equals `adapter_status`; one of the four PRD §7 limited states |
| `reason_code` | closed set: `OFFICIAL_CAPABILITY_LIMIT`, `MATERIAL_NOT_PUBLISHED`, `LICENSING_RESTRICTION`, `HISTORICAL_MATERIAL_UNAVAILABLE`, `FRESHNESS_LIMITATION`, `OTHER_OFFICIAL_SOURCE_CONSTRAINT` |
| `reason_detail` | mandatory prose — why full coverage is unavailable |
| `evidence[]` | at least one entry, each with `kind`, `observed_at`, `official_url`, `ref`, `summary` |
| `affected` | `date_from`, `date_to`, `collections[]` — at least one of dates or collections set |
| `customer_visible_warning` | the warning text, which also appears as a `customer_visible` `known_gaps` entry |

Because `INGF-07` refuses to compose a limited status without all of that, an operator looking at a
limited group **in this console must see all of it too** — the evidence, the affected scope, the
warning and the reason, not only the status word. That is deliverable 10, and it is a display rule
over the existing snapshot port (sub-PRD **D5**): no new data path, and no schema redefined here.

**Accepted caveats carried forward, documented not enforced here.**

- **Where the composed registry document comes from in production is unresolved** — sub-PRD **M1**
  (owner `18-ops-release` / `RLSE-02`, with `05-ingestion-framework` M1). PRD §19.3 says *"The
  production server continues lightweight source discovery so source health does not depend on the
  workstation being online"*, but PRD §39.3's filesystem table has no row for ingestion state. This
  ticket therefore reads through `INTL-01`'s port and renders `UNAVAILABLE`/`STALE` explicitly; it
  never fabricates a value and never opens `ingestion.sqlite` or `corpus.sqlite` (PRD §18.3, §39.1).
- **Alert thresholds and delivery are not here.** PRD §42.2's alert is `RLSE-08`'s; this console shows
  the breach flag `INGF-07` exposes.
- **Customer-facing source pages are not here.** `FIND-05` (`apps/web/src/features/sources/**`).

## Goal

Produce the internal source and ingestion health console: `/internal/v1/sources` endpoints that serve
the composed registry snapshot with the nine PRD §6.1 attributes and the five PRD §12.1 dates kept
**separate**, per-group ingestion-run health and open-quarantine counts, the PRD §7 status vocabulary
including `FRESHNESS_LIMITED`, the `limitation` record behind every limited group, and a
critical-freshness breach view; plus the `apps/admin/src/features/sources/**` screens that render them
with an explicit unavailable/stale state.
Completion is mechanically checkable: a fixture registry snapshot round-trips through the endpoints
with all five dates as distinct fields; a group whose delta mechanism is unreliable shows
`FRESHNESS_LIMITED` and never a computed "fresh" claim; a group in one of the four PRD §7 limited
states is displayed with its evidence, affected scope, customer-visible warning and reason rather than
a bare status word; a missing mandatory group is reported as a named gap rather than omitted; and every
endpoint is invisible to customer identity.

## Non-goals

- **No registry composition, schema or roster.** `INGF-07` owns `registry.schema.json`, the composer
  and the 52-group mandatory roster. This ticket **consumes** the composed document and its schema.
- **No discovery scheduling or change detection.** `INGF-08` (`pipelines/ingestion/src/<root>/discovery/**`).
- **No quarantine queue, reason table or operator recovery actions.** `INTL-03`
  (`.../internal/quarantine/**`). This console shows **counts** from the registry snapshot and links
  to `INTL-03`'s screens; it lists no quarantine item.
- **No licence review or state changes.** `INTL-05`.
- **No release or promotion view.** `INTL-04`.
- **No alerting, thresholds, status page or external checks.** `RLSE-08` (PRD §42.2).
- **No customer-facing source, document or coverage screens.** `FIND-05`, `14-search-product`.
- **No full-roster reconciliation report, and no launch-scope decision or scope reduction of any
  kind.** `GOLD-16` produces the measured evidence and the proposed registry state, and Gate 2
  verification and sign-off under the confirmed limited-state policy is the Founder's (plan §8 **Q10**;
  PRD §26, §44.4). This console displays what the composed registry already records; it proposes no
  state, edits none, and clears none.
- **No internal boundary code.** `INTL-01` — no admission, identity, session, audit, snapshot-store or
  SDK-assertion implementation is written here; all are imported.
- **No table, migration or repository.** `01-app-data` (plan **A3**).

## File-scope (write-owns)

- `apps/api/src/routes/internal/sources/**`
- `apps/api/test/internal/sources/**` (sub-PRD **D11**), including its fixtures under
  `apps/api/test/internal/sources/fixtures/**`
- `apps/admin/src/features/sources/**`
- `apps/admin/test/sources/**` (sub-PRD **D11**)
- `apps/admin/package.json` — **append-only**, dependencies block only (sub-PRD **D10**, plan §1.1)

Does not touch:

- `apps/api/src/routes/internal/core/**`, `apps/admin/src/app/**`, `apps/admin/{index.html,vite.config.ts,tsconfig.json}`
  — `INTL-01`.
- `apps/api/src/routes/internal/{quarantine,releases,licensing,evaluation,cost,issues,incidents}/**`
  and `apps/admin/src/features/{quarantine,releases,licensing,evaluation,cost,issues,incidents,overview}/**`
  — `INTL-03`…`INTL-10`.
- `apps/api/src/{server.ts,app.ts,bootstrap,plugins,middleware,errors,sse}/**` and every other
  `apps/api/src/routes/<area>/**` — `03-app-runtime` and the product modules.
- `pipelines/**` — `04`–`10`, `21`. `packages/**`, `schemas/**` — `00`–`03`, `11`, `12`, `20`.
- `apps/web/**`, `apps/widget/**`, `infra/**`, `tests/**`, `docs/runbooks/**` — other modules.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, no in-flight
ticket), so nothing has previously written either subtree and nothing contends for them. The only
ticket that has written inside `apps/api/src/routes/internal/**` or `apps/admin/**` before this one is
`INTL-01` (this ticket's `blocked_by`), which owns `internal/core/**` and `src/app/**` and is complete
before this ticket starts. The seven siblings that run **concurrently** with it (plan §7 wave 2:
`INTL-02` ‖ `INTL-03` ‖ `INTL-04` ‖ `INTL-05` ‖ `INTL-06` ‖ `INTL-07` ‖ `INTL-08` ‖ `INTL-09`, all
blocked only by `INTL-01`) each own a **different** `internal/<area>/` and `features/<area>/`
directory: under plan **A1** and sub-PRD **D9** both trees are discovered by directory convention, so
adding this console changes no file another ticket owns (`RUNT-01` contract item 6; `INTL-01` contract
item 8). The single shared file is `apps/admin/package.json`, restricted to appending distinct
dependency entries; `/start-all` serialises delivery, so lockfile regenerations land one at a time.

## Deliverables

1. **`apps/api/src/routes/internal/sources/index.ts`** — `export const area = internalArea({ areaId:
   'sources', capability: 'SOURCE_HEALTH' })` and a default export of
   `internalRoutes(plugin, { areaId: 'sources', capability: 'SOURCE_HEALTH' })`. No `prefix`, no
   admission override, no local guard (`INTL-01` contract items 1 and 3).
2. **`sources/snapshot.ts`** — reads `OperationalSnapshotStore.read('REGISTRY')`, validating the
   document against `INGF-07`'s committed composed-registry JSON Schema (the schema is **referenced**,
   never copied: load it from the `pipelines/ingestion` tree at test time and from configuration at
   run time; if it cannot be referenced, see Feedback obligation). Exposes
   `readRegistry(): Promise<SnapshotResult<ComposedRegistry>>` and the mapping from the composed
   document to this console's response DTOs. All timestamps come from the document; the read time is
   never substituted (`INTL-01` deliverable 7).
3. **`GET /internal/v1/sources`** — the group list. One row per source group with, at minimum, the
   nine PRD §6.1 attributes: `authority`, `jurisdiction`, `official_endpoints`,
   `document_coverage` (`document_count`, `earliest_effective_from`, `latest_effective_from`),
   `licensing` (assessment state and attribution requirement only — the review surface is `INTL-05`),
   `adapter_status`, `change_detection_capability`, `freshness`, `known_gaps`. Plus the group's
   `coverage_status` from the PRD §7 vocabulary (`ACTIVE`, `PLANNED_NOT_ACTIVE`,
   `METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE` — the
   exact value set `INGF-07` composes; import it, never re-declare it). A group in one of the four
   limited states additionally carries `limitation_summary` — its `state`, `reason_code`, evidence
   count and `customer_visible_warning`, projected from the composed document's `limitation` block, so
   a limited row is never a status word on its own (deliverable 10). Cursor pagination and filters
   per PRD §34.1: `jurisdiction`, `wave`, `coverage_status`, `freshness_status`, `has_open_quarantine`.
4. **The five PRD §12.1 dates are five fields.** Every group row carries
   `last_discovery_check_at`, `last_successful_change_scan_at`, `last_full_reconciliation_at`,
   `last_content_ingestion_at` and `freshness_status` as **separate** members. No endpoint, DTO or
   screen may collapse them into one "last updated" value; a schema assertion in the test suite lists
   the five names literally so a collapse fails loudly (PRD §12.1).
5. **`GET /internal/v1/sources/{groupId}`** — group detail: the row above plus the recent
   `ingestion_run` history the composed document carries (mode, started/finished, status, discovered /
   fetched / changed / parsed / quarantined counts, `failure_code`), the group's open-quarantine count
   **by reason code**, the declared freshness cadence and its SLA class (critical vs normal, PRD
   §12.1), the **complete `limitation` block** where the group is in a limited state (deliverable 10),
   and the `allowlist` host list. An unknown group id returns `404 RESOURCE_NOT_FOUND` — the
   same body a customer identity receives for the whole area (`INTL-01` contract item 4).
6. **`GET /internal/v1/sources/health`** — the operator summary this console contributes to
   `INTL-10`: counts by `coverage_status`, count of groups in `FRESHNESS_LIMITED`, count of groups
   breaching their critical-freshness SLA by 2× (PRD §42.2), total open quarantine items, the list of
   **missing mandatory groups** (`INGF-07`'s roster minus composed groups — PRD §7, §44.4), the list of
   **limited groups** naming each group id with its `limitation.state` and `reason_code` (plan §8
   **Q10**: a limited group is disclosed by name, never only counted), and the snapshot's
   `generatedAt`/`sourceRef`. This is the endpoint `INTL-10` consumes (sub-PRD **M6**), so
   its shape is stable and documented in the internal contract document.
7. **Freshness is reported, never computed optimistically.** `freshness_status` is taken from the
   composed document. Where a group's change-detection capability is unreliable, the response repeats
   `FRESHNESS_LIMITED` and the console shows the reason text from the document — PRD §12.1
   (*"MUST show `FRESHNESS_LIMITED` rather than a false guarantee"*). The API computes exactly one
   derived value: `critical_sla_breached`, defined as `now - last_successful_change_scan_at > 2 ×
   declared_cadence` for groups declared critical (PRD §42.2), with `now` injected for testability and
   `null` when either input is absent — never `false` by default.
8. **`apps/admin/src/features/sources/feature.tsx`** — an `AdminFeatureModule` (`INTL-01` deliverable
   9) with `id: 'sources'`, a nav entry and routes `/internal/sources` and
   `/internal/sources/:groupId` (PRD §31.2's `/internal/*` row). Screens:
   - **list** — sortable/filterable table showing status and freshness as **text plus badge**, never
     colour alone (PRD §41.1 conventions adopted for internal screens; sub-PRD Decisions), with the
     five dates in five separate columns (or five labelled fields in a compact layout) and dates
     rendered `3 Aug 2026` while the API stays ISO (PRD §41.1); a limited group's row shows its reason
     code and customer-visible warning beside the status, never the status word alone;
   - **detail** — run history, quarantine counts by reason with a link to `INTL-03`'s screen, allowlist
     hosts, known gaps, the group's declared cadence versus its actual last scan, and — where the group
     is limited — a **limitation panel** presenting deliverable 10's record in full: the state and
     reason code, the `reason_detail` prose, the evidence entries as a table (kind, observed at,
     official URL shown as its literal URL, reference, summary), the affected dates and collections,
     and the `customer_visible_warning` quoted as customers will see it;
   - **summary banner** — missing mandatory groups shown as an explicit error state naming each
     missing group id (PRD §7, §44.4); the limited groups named with their state and reason code; and
     any group whose limitation record is missing named as a data defect (deliverable 10).
   Every screen uses `INTL-01`'s `SnapshotStatePanel` for `AVAILABLE`/`STALE`/`UNAVAILABLE`, showing
   the producer's `generatedAt` and `sourceRef`; a stale or absent snapshot never renders as zeroes.
9. **No write path.** This console is read-only: it registers no `POST`, `PUT`, `PATCH` or `DELETE`
   and therefore uses no `withDangerousAction`. An architecture assertion proves the area declares
   only `GET` routes (PRD §12.4's "no data deletion" is trivially satisfied and asserted, not assumed).
10. **A limited state is displayed together with the record that justifies it (plan §8 Q10).**
    `sources/limitation.ts` projects the composed document's `limitation` block through the same
    snapshot port as everything else (sub-PRD **D5**): it opens no new data path, reads no pipeline
    module and re-declares no schema — `INGF-07` owns the block's shape and carries it through
    composition verbatim. The rules:
    - **Verbatim, not summarised.** The detail response carries `state`, `reason_code`,
      `reason_detail`, every `evidence` entry (`kind`, `observed_at`, `official_url`, `ref`,
      `summary`), `affected` (`date_from`, `date_to`, `collections`) and `customer_visible_warning`
      exactly as composed. Nothing is shortened, merged, re-worded or dropped, and the console adds no
      explanation of its own (plan §8 **Q10** item 6; `INGF-07` deliverable 7).
    - **Never the status word alone.** Wherever a group whose `coverage_status` is
      `METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED` or `SOURCE_UNAVAILABLE`
      appears — list row, detail, or the `/sources/health` summary — it appears with at least its
      reason code and its customer-visible warning.
    - **A missing block is a data defect, not a display default.** `INGF-07` fails composition for a
      limited status without a complete `limitation` block, so a snapshot carrying one did not come
      from its composer: the group is reported `LIMITATION_RECORD_MISSING`, named on the summary
      banner, and marked invalid in the endpoint response. The console never fabricates evidence, a
      reason, an affected scope or a warning, and never quietly degrades the group to a plain status
      (sub-PRD **D5**; PRD §44.4).
    - **Read-only, and no proposal path.** Nothing here proposes, edits, clears or overrides a
      limitation. The measured evidence and the proposed registry state are `GOLD-16`'s, the launch
      statement is `LNCH-05`'s, and the verification and sign-off are the Founder's at Gate 2
      (plan §8 **Q10** items 8–10).

## Acceptance checklist (classified)

- [ ] `[machine]` The area mounts at `/internal/v1/sources` via `internalArea()`/`internalRoutes()` with
      no local prefix or admission override, and `assertInternalMounting` passes
      (`INTL-01` contract items 1–2; PRD §8.11, §16.1)
- [ ] `[machine]` **`ADM-001` negative, every endpoint:** a customer session, a customer service-account
      credential and a widget token each receive a `404 RESOURCE_NOT_FOUND` body byte-identical (apart
      from `request_id`) to the unknown-path body on `GET /internal/v1/sources`,
      `/sources/{groupId}` and `/sources/health`; an unauthenticated call returns `401`; an internal
      principal without `SOURCE_HEALTH` receives the same `404`
      (PRD §30.2 `ADM-001`; PRD §16.5, §34.9; `INTL-01` contract item 4)
- [ ] `[machine]` **PRD §12.1 five dates:** the group DTO exposes `last_discovery_check_at`,
      `last_successful_change_scan_at`, `last_full_reconciliation_at`, `last_content_ingestion_at` and
      `freshness_status` as five distinct members — asserted against a literal list, so a collapse into
      one "updated" field fails
- [ ] `[machine]` **PRD §6.1 nine attributes** are all present on every group row — asserted against a
      literal list of the nine names
- [ ] `[machine]` **PRD §12.1 / §7:** a group whose change-detection capability is unreliable is
      reported `FRESHNESS_LIMITED`, and no response contains a derived "fresh" claim for it; every
      PRD §7 status value round-trips unchanged from the composed document (`ADM-001`)
- [ ] `[machine]` **Plan §8 Q10 — a limited group shows the record behind it:** for each of the four
      PRD §7 limited states the detail response carries `state`, `reason_code`, `reason_detail`, every
      `evidence` entry, `affected` dates/collections and `customer_visible_warning` — asserted against
      a literal member list and compared with the fixture's composed block, so a summarised, re-worded
      or partially dropped limitation fails; the list row and `/sources/health` each name that group's
      reason code and warning (deliverable 10)
- [ ] `[machine]` **A limited status with no `limitation` record is a defect, not a default:** a fixture
      whose group is `LICENSING_RESTRICTED` with the block absent, and one with an empty `evidence`
      list, are each reported `LIMITATION_RECORD_MISSING` and named on the summary banner; no response
      or screen invents a reason, an evidence entry, an affected scope or a warning, and neither
      renders as a plain status word (deliverable 10; `INGF-07`'s `REGISTRY_LIMITATION_MISSING` /
      `REGISTRY_LIMITATION_UNEVIDENCED` composition failures; PRD §44.4)
- [ ] `[machine]` **PRD §7 / §44.4:** a fixture registry missing a mandatory group yields that group id
      in `missing_mandatory_groups` on `/sources/health` and an explicit error state on the list
      screen — never a silently shorter list
- [ ] `[machine]` `critical_sla_breached` is `true` at `2 × cadence + 1 s` and `false` at
      `2 × cadence − 1 s` with an injected clock, and `null` when either input is absent — never
      defaulting to `false` (PRD §42.2)
- [ ] `[machine]` The area registers only `GET` routes — asserted by enumerating the Fastify route
      table (deliverable 9; PRD §12.4)
- [ ] `[machine]` `assertSnapshotPortOnly()` passes for this area: no SQLite driver, object-store SDK,
      `pipelines/` import or `node:fs` use (sub-PRD **D5**; PRD §18.3, §39.1)
- [ ] `[machine]` `assertNoInternalSurfaceInCustomerArtifacts()` is green after this ticket — no
      `/internal/v1/sources` path or internal DTO name in `schemas/openapi/**`,
      `packages/contracts/src/generated/**`, or (when present) `packages/sdk-typescript/**`,
      `sdk/python/**`, `apps/widget/**` (PRD §8.11; sub-PRD **D7**)
- [ ] `[machine]` PRD §22 canary: a canary string placed in a registry fixture's free-text field appears
      in no log line and no audit event; no response contains research content, PII text or a credential
- [ ] `[machine]` Admin screens implement the PRD §31.3 states through `INTL-01`'s async-state
      components, and status/freshness are conveyed by text plus badge, not colour alone (PRD §41.1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `ADM-001`, source/licence impact and known gaps
- [ ] `[fixture]` The committed composed-registry fixtures under
      `apps/api/test/internal/sources/fixtures/**` replay end-to-end: a **complete** roster (all
      mandatory groups, mixed statuses), a **degraded** one (a critical group breaching its SLA by 2×,
      one `FRESHNESS_LIMITED`, one `SOURCE_UNAVAILABLE`, each carrying the complete `limitation` block
      `INGF-07` composes), a **limited-set** one covering all four PRD §7 limited states with distinct
      `reason_code`s and a multi-entry `evidence` list, a **defective** one whose limited group carries
      no `limitation` block and one whose `evidence` list is empty, an **incomplete** one (a mandatory
      group absent), a **stale** one and a **schema-invalid** one — each producing its expected
      endpoint output and screen state, offline with no network and no production credentials
- [ ] `[human]` PRD §42.2 drill: with the degraded fixture loaded on a locally started stack, an
      operator confirms the console marks the critical group degraded and names the affected source
      before any alert is configured (PRD §42.2 initial operator action *"Mark degraded; stop
      definitive affected answers if material"*; `OPS-002`)
- [ ] `[human]` PRD §43.4 founder-review linkage, **not required to merge**: item 4 of the founder test
      queue (*"source adapter count/time/licence/quarantine anomalies"*) is reviewable from this
      console
- [ ] `[human]` Plan §8 **Q10** legibility, **not required to merge**: with the limited-set fixture
      loaded, a reviewer confirms that a limited group's evidence, affected dates/collections,
      customer-visible warning and reason are all readable from the console — the same material
      `GOLD-16` consolidates for the Founder's Gate 2 verification and `LNCH-05` checks the launch
      statement against. Irreducibly human judgment; the console is the display, and no sign-off
      happens here
- No further `[human]` criteria — PRD §41.2 contains no `UAT-ADM-*` row (sub-PRD **M4**); `ADM-001`'s
  evidence is the machine assertion above
- No `cargo test --workspace` / `uv run pytest` item — this ticket touches no Rust and no Python
  (PRD §45.3). The Python composer it consumes is `INGF-07`'s and is tested there

## Test plan

Reviewer steps, offline: no network, no ingestion run, no production credentials, no real registry.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`; `pnpm test`.
2. Focused: `pnpm test --filter @aer/api` and `pnpm test --filter @aer/admin`. API suites under
   `apps/api/test/internal/sources/`, admin suites under `apps/admin/test/sources/`.
3. **`boundary.test.ts`** — call `internalAreaConformance('sources')` from `INTL-01`'s exported
   helpers; then the four-row denial matrix of `INTL-01` contract item 4 against all three endpoints,
   masking `request_id` and asserting byte equality with the unknown-path body. Copy the construction
   pattern from `apps/api/test/internal/core/denial.test.ts` (`INTL-01`).
4. **`registry-dto.test.ts`** — `[fixture]` replay of the five committed documents through
   `fileSnapshotStore` and the route handlers using Fastify `inject()`. Assert the five §12.1 members
   and the nine §6.1 attributes against literal name lists; assert PRD §7 status values round-trip.
5. **`freshness.test.ts`** — injected clock at `2 × cadence ± 1 s` for a critical group and a normal
   group; assert `critical_sla_breached` and `null` handling. Assert no endpoint emits a "fresh"
   claim for a `FRESHNESS_LIMITED` group.
6. **`roster.test.ts`** — the incomplete fixture; assert `missing_mandatory_groups` names the absent
   group and that the list endpoint's total does not silently shrink.
7. **`limitation.test.ts`** — the limited-set fixture: for each of the four PRD §7 limited states,
   assert the detail response's `limitation` members against a literal list and compare each member
   with the fixture's composed block (no summarising, re-wording or dropping), and assert the list row
   and `/sources/health` name that group's reason code and warning. Then the defective fixtures:
   assert `LIMITATION_RECORD_MISSING`, that the group is named on the summary banner, and that no
   reason, evidence, affected scope or warning string appears in the response that is not in the
   document (plan §8 **Q10**; deliverable 10).
8. **`read-only.test.ts`** — enumerate the registered routes for the area and assert every method is
   `GET`.
9. **`architecture.test.ts`** — `assertSnapshotPortOnly()` and
   `assertNoInternalSurfaceInCustomerArtifacts()`; assert the latter's result names every scanned tree.
10. **`sources.screen.test.tsx`** — render list and detail against each fixture; assert the five dates
    render as five labelled fields in `3 Aug 2026` form, that a limited group's detail renders the
    limitation panel with its evidence rows, affected scope and warning text, that a stale snapshot
    renders `SnapshotStatePanel` with the producer's `generatedAt`, and that an absent snapshot renders
    `UNAVAILABLE` rather than zeroes.
11. `git status --porcelain` clean after the run.
12. **Reviewer focus** (CLAUDE.md): whether any code path substitutes the read time for a document
    timestamp; whether a missing mandatory group can disappear rather than surface; whether a limited
    group can reach a response or a screen without its evidence, affected scope, warning and reason;
    whether the critical-SLA derivation defaults to a comfortable value when inputs are absent; whether
    the group id in the URL can address anything outside the snapshot; whether a customer principal
    reaches any endpoint.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`INGF-07`'s composed document lacks a field this console must show** (one of the nine PRD §6.1
  attributes, one of the five PRD §12.1 dates, the declared cadence, the per-reason quarantine
  counts, or any member of the `limitation` block) → do **not** derive or invent it here and do **not**
  write `pipelines/**`. Record the gap in
  `docs/prd/22-internal-admin/README.md` (open questions) and amend `INGF-07`'s ticket +
  `docs/prd/05-ingestion-framework/README.md` in one docs PR, then `--sync` both. `INGF-07`'s own
  feedback obligation item 3 names this exact path, including the `registry_schema_version` bump.
- **The composed-registry JSON Schema cannot be referenced from `apps/api`** (cross-language path
  resolution, or the schema is not published with the document) → record the resolution in
  `docs/prd/22-internal-admin/README.md` **M1**; the fallback is that the snapshot document carries its
  own `$schema`/`schemaVersion` and the store validates structurally, returning `INVALID_SCHEMA` on
  mismatch. Never skip validation.
- **No production placement exists for the snapshot** (sub-PRD **M1**) → this is expected today. Ship
  the port plus fixtures and the `UNAVAILABLE` state; add nothing to `infra/**` (that is `RLSE-02`) and
  record any new fact in `docs/prd/22-internal-admin/README.md` **M1**.
- **The console needs live ingestion state rather than a snapshot** (for example an operator needs a
  "run now" action) → that is a new capability crossing into `05-ingestion-framework` and
  `18-ops-release`, not a local addition. Raise it in `docs/prd/22-internal-admin/README.md` open
  questions and, if accepted, as a plan change in `docs/prd/breakdown-plan.md` §5.23/§6.2. This ticket
  stays read-only (deliverable 9).
- **PRD §7's status vocabulary and `INGF-07`'s composed values disagree** → the PRD wins and the
  divergence is `INGF-07`'s to fix; record it in `docs/prd/05-ingestion-framework/README.md` and this
  module's README. Do not map or normalise unknown status values into a known one — an unknown value
  must surface as unknown.
- **A limited group arrives without its `limitation` block, or someone asks for a "simpler" view of
  one** → neither is a display preference: the policy is confirmed (plan §8 **Q10**). A missing block
  means the document did not come from `INGF-07`'s composer, which fails closed on exactly that case —
  report `LIMITATION_RECORD_MISSING` (deliverable 10) and raise it against `INGF-07` and the snapshot
  producer (sub-PRD **M1**). Never hide the evidence, the affected scope, the warning or the reason
  behind a status word, and never substitute a console-authored explanation for them.

**3. Escalation.** PRD §12.1's five separated dates and PRD §7's "no mandatory group silently omitted"
are MUSTs and are the substance of `ADM-001`. If either cannot be honoured — the dates cannot be kept
separate, or the roster cannot be reconciled — that overturns a release requirement: stop, write the
sub-PRD writeback, and escalate for re-review before any code lands. A console that would have to
present a computed freshness guarantee where the source has no reliable delta mechanism overturns
PRD §12.1 outright; escalate, never ship the optimistic value. A console that could show a limited
source group without the evidence, affected scope, customer-visible warning and reason behind it
defeats the confirmed plan §8 **Q10** policy at the one screen where an operator inspects it —
escalate rather than shipping the status word on its own.
