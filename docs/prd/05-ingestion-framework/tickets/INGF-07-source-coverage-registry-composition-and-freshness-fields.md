---
id: INGF-07
title: Source Coverage Registry composition and freshness fields
module: 05-ingestion-framework
lane: 05-ingestion-framework
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INGF-04]
blocks: [INGF-08, GOLD-16, INTL-02]
---

# INGF-07 — Source Coverage Registry composition and freshness fields

Implements PRD §6.1 (source policy / registry), PRD §12.1 (freshness) and PRD §7 (source acquisition
waves) <ADM-001> — no ADR — the decision is already made in PRD §6.1 and recorded as plan §2.1
decision **A2**, and the limited-state launch policy is settled in plan §8's decision register as
**Q10** (confirmed policy; the tickets named there are `GOLD-16` and `LNCH-05`); this is build ticket 7
of 9 against it. **This ticket is the recorder of A2.**
Parent sub-PRD: [05-ingestion-framework README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [INGF-04 — Licence snapshot/assessment registry and permitted-use gate](INGF-04-licence-snapshot-assessment-registry-and-permitted-use-gate.md)
**Why `builder`:** a bounded composition layer inside this module's declared file-scope over file
schemas PRD §6.1 and §12.1 already enumerate — not a new subsystem decision.

## Background + basis

**PRD §6.1 fixes the required attributes:**

> "Every source MUST appear in the Source Coverage Registry with **authority, jurisdiction, official
> endpoints, document/date coverage, licensing, adapter status, change-detection capability,
> freshness and known gaps**."
>
> "The product MUST NOT claim that every Australian employment-law document is included without
> exception. Customer-facing coverage language MUST refer to the published/auditable source registry
> and visible limitations."

**PRD §12.1 fixes the five dates, and requires them separated:**

> "Customer-visible source metadata MUST separate: last discovery check; last successful change
> scan; last full reconciliation; last content ingestion; freshness status."
>
> "Sources without reliable delta mechanisms MUST show `FRESHNESS_LIMITED` rather than a false
> guarantee."

**PRD §7 fixes the status vocabulary and the release rule:**

> "No mandatory source group may remain `PLANNED_NOT_ACTIVE` at release. A group blocked by official
> capability or licensing MUST use an explicit status such as `METADATA_AND_LINK_ACTIVE`,
> `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED` or `SOURCE_UNAVAILABLE` and MUST produce
> customer-visible warnings when relevant."

**PRD §40.1**: "Every row starts `NOT_STARTED` and must become `ACTIVE` or an explicit
customer-visible limited state before release. The live Source Coverage Registry will expand each
group into exact collections/endpoints, licence snapshots, formats, counts, date bounds, schedules
and gaps."

**PRD §40.5** adds a hard requirement for wave 4: "An authority name in this planning row is not
enough for release. The registry must link exact official pages/collections and **identify whether
material is law, operative instrument, decision, code, guidance, policy or news**." That
classification is a `registry.yaml` field, not prose.

**PRD §44.4**: "It is not permitted to silently call an unimplemented source category covered." With
PRD §40.9's "any missing mandatory source group" anomaly, composition must **fail** when a mandatory
group is absent — which requires the mandatory roster to exist as code.

**Decision A2 (plan §2.1), recorded by this ticket:**

> "The Source Coverage Registry is **composed at build time from per-adapter files**
> (`pipelines/adapters/<group>/registry.yaml` + licence snapshot + URL allowlist), never one shared
> document. PRD §40.8 makes a registry row part of every adapter's DoD; one shared file would
> serialise all 52 adapter tickets."

**Downstream.** `INTL-02` (Source and ingestion health console) is `blocked_by` this ticket with the
goal "The five §12.1 freshness dates surfaced separately". `GOLD-16` (Full-roster coverage, licence
and freshness reconciliation) is `blocked_by` this ticket and all 52 adapter tickets, with the goal
"Every mandatory group is ACTIVE or explicitly limited — never silently omitted". `INGF-08` reads the
cadence and capability fields.

**The limited-state launch policy is settled (plan §8 Q10, confirmed policy).** It governs what this
registry may record:

1. No mandatory source group is pre-selected for omission or reduced implementation; every
   Commonwealth, state and territory mandatory group in the approved MVP scope must be attempted in
   full; arbitrary scope reduction to make a release date easier is not permitted.
2. A source group may launch in a customer-visible limited state **only** where measured evidence
   shows a genuine limitation prevents `ACTIVE`: an official capability limit, the official body not
   publishing the material, a licensing restriction, historical material unavailable, a freshness
   limitation, or another real official-source constraint.
3. The permitted states are the ones the PRD already defines: `METADATA_AND_LINK_ACTIVE`,
   `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`.
4. A limited state must record **the evidence, the affected dates or collections, the customer-visible
   warning, and why full coverage is unavailable**.
5. Silent omission is prohibited, and no unofficial source or commercial headnote may substitute for
   unavailable official material.
6. `GOLD-16` produces the measured evidence and the proposed registry state; `LNCH-05` verifies that
   the launch statement discloses those limitations accurately; Gate 2 is the verification and
   sign-off step under this policy, not an opportunity to cut mandatory scope.

**This ticket is where that policy becomes mechanical.** The registry schema is the artifact that
records a limited state, so deliverables 2, 3, 6 and 7 make items 4 and 5 representable, enforced and
carried through to the consumers. Which groups, if any, end up limited is still a Gate 2 output
derived from evidence — this ticket ships the vocabulary, the evidence fields and the composition
failures, never the list.

## Goal

Implement the Source Coverage Registry under `pipelines/ingestion/src/<root>/registry/**`: the
authoritative per-adapter file layout (A2), the `registry.yaml` schema covering all nine PRD §6.1
attributes plus the PRD §40.5 material classification, the 52-entry mandatory roster from PRD
§40.2–40.6, a deterministic composer that merges every group's `registry.yaml`, `licence.yaml`
(`INGF-04`) and `allowlist.yaml` (`INGF-02`) with run history into one machine-readable registry
keeping the five PRD §12.1 dates as separate fields, and a `freshness_status` derivation that shows
`FRESHNESS_LIMITED` rather than a false guarantee — with composition failing when any mandatory
group is missing, when any group is still `PLANNED_NOT_ACTIVE` in release mode, and when a group
declares one of the four PRD §7 limited states without the evidence, affected dates or collections,
customer-visible warning and reason the confirmed plan §8 **Q10** policy requires.

## Non-goals

- **No `registry.yaml` content for any real source group** — modules `06`–`10` author all 52. This
  ticket ships the schema, the composer, the roster and synthetic fixtures.
- **No internal admin console** — `INTL-02` (`22-internal-admin`), `blocked_by` this ticket.
- **No customer-facing source/registry screens** — `14-search-product` / `FIND-05`
  (`apps/web/src/features/sources/**`).
- **No full-roster reconciliation report, and no launch-scope decision or scope reduction of any
  kind** — `21-evaluation-600` / `GOLD-16` produces the measured evidence and the proposed registry
  state, and Gate 2 verification and sign-off under the confirmed limited-state policy is the
  Founder's (plan §8 **Q10**; sub-PRD **D12**; PRD §26, §44.4). This ticket ships the vocabulary, the
  evidence fields and the composition failures that make that policy mechanical.
- **No scheduling** — `INGF-08` consumes the cadence/capability fields; it is `blocked_by` this
  ticket.
- **No licence decisions and no `licence.yaml` schema changes** — `INGF-04` (sub-PRD D3). This ticket
  reads the licence facts and reports them.
- **No `allowlist.yaml` schema changes** — `INGF-02` (sub-PRD D3). This ticket validates that the file
  exists and loads, nothing more.
- **No `conformance.yaml` schema** — `INGF-09` (sub-PRD D3). It appears in the layout table below for
  completeness only; this ticket neither defines nor validates it.
- **No freshness alerting or status page** — `18-ops-release` / `RLSE-08` owns PRD §42.2's "Critical
  source freshness | misses declared critical SLA by 2×" alert. This ticket exposes the breach flag
  it consumes.

## File-scope (write-owns)

- `pipelines/ingestion/src/<root>/registry/**` (plan §5.6 `src/registry/**`), including
  `schema/registry.schema.json` and the composed-output JSON Schema.
- `pipelines/ingestion/tests/registry/**`.
- `pipelines/ingestion/pyproject.toml` — **append-only**; conflicts resolve by re-running `uv lock`
  (plan §1.1).
- Does not touch: `pipelines/ingestion/src/<root>/{adapter,fetch,artifacts,licensing,quarantine,runs,parsing,discovery,conformance}/**`
  — `INGF-01`…`INGF-06`, `INGF-08`, `INGF-09`.
- Does not touch: `pipelines/adapters/**` — modules `06`–`10`. Synthetic fixture groups live under
  `pipelines/ingestion/tests/registry/fixtures/adapters/`.
- Does not touch: `apps/api/src/routes/internal/**`, `apps/admin/**` — `22-internal-admin`
  (`INTL-02`).
- Does not touch: `apps/web/src/features/sources/**` — `14-search-product` (`FIND-05`).
- Does not touch: `pipelines/evaluation/**`, `evals/**` — `21-evaluation-600` (`GOLD-16`).
- Writes no file into the repository at run time: the composer prints to stdout by default and writes
  only to an explicit `--out` path.

**Serial safety.** First decomposition; nothing merged, nothing in flight. `INGF-01`…`INGF-04` have
landed (and `INGF-05`/`INGF-06` may have). The ticket that can be concurrent with this one is
**`INGF-09`** (`blocked_by INGF-05, INGF-06`), which owns `src/<root>/conformance/**` and
`tests/conformance/**` — disjoint from `registry/`. Both tickets *describe* the per-adapter layout;
only this one writes `registry.schema.json` and only `INGF-09` writes `conformance.schema.json`. The
one shared path is `pyproject.toml`, append-only by plan §1.1.

## Deliverables

1. **The per-adapter file layout — the authoritative statement of A2.** Documented in
   `<root>/registry/__init__.py`'s module docstring and in `<root>/registry/LAYOUT.md`:

   ```text
   pipelines/adapters/<group-id>/            # <group-id> is the lowercase Group ID
   ├── registry.yaml                         # schema + validator: INGF-07  (this ticket)
   ├── allowlist.yaml                        # schema + validator: INGF-02
   ├── licence.yaml                          # schema + validator: INGF-04
   ├── licence-snapshots/<date>-<hash>.<ext> # written by INGF-04's capture CLI
   ├── conformance.yaml                      # schema + validator: INGF-09 (optional overrides)
   ├── adapter.py                            # module-level `ADAPTER: SourceAdapter` (INGF-01)
   ├── fixtures/                             # owned by the adapter ticket (PRD §40.8 items 2, 4)
   └── tests/                                # owned by the adapter ticket
   ```

   **There is no shared registry document anywhere in the repository.** A test asserts that no file
   named `registry.yaml`/`sources.yaml` exists outside a `pipelines/adapters/<group>/` directory
   (A2's mechanical guarantee).

2. **`<root>.registry.schema` — the `registry.yaml` schema.** Committed JSON Schema with
   `additionalProperties: false`; every PRD §6.1 attribute is a required key:

   ```yaml
   group_id: LEG-CTH                       # uppercase PRD §40.2–40.6 Group ID; must be in the roster
   wave: 1                                 # 1..5, PRD §7 / §40.2–40.6
   authority:                              # PRD §6.1 "authority"; mirrors PRD §35.2 `authority`
     id: cth-opc
     name: Office of Parliamentary Counsel
     authority_type: REGISTER              # REGISTER|REGULATOR|COURT|TRIBUNAL|COMMISSION|DEPARTMENT|REVENUE_OFFICE
     jurisdiction: CTH                     # PRD §6.1 "jurisdiction": CTH|NSW|VIC|QLD|WA|SA|TAS|ACT|NT
     court_level: null                     # required when authority_type is COURT|TRIBUNAL|COMMISSION
     official_url: https://www.legislation.gov.au/
   official_endpoints:                     # PRD §6.1 "official endpoints"; PRD §40.5 classification
     - url: https://www.legislation.gov.au/Series
       collection: Acts in force
       kind: LISTING                       # LISTING|FEED|API|SITEMAP|MANIFEST|DOCUMENT
       material_class: LAW                 # LAW|OPERATIVE_INSTRUMENT|DECISION|CODE|GUIDANCE|POLICY|NEWS
   document_coverage:                      # PRD §6.1 "document/date coverage"; PRD §6.6
     families: [ACT, REGULATION, COMPILATION, COMMENCEMENT_NOTICE]
     date_from: '2023-07-01'
     date_to: null                         # null = ongoing
     financial_years: ['2024-25', '2025-26', '2026-27']   # PRD §6.6 three-year minimum
   licence_ref: ./licence.yaml             # PRD §6.1 "licensing" (owned by INGF-04)
   allowlist_ref: ./allowlist.yaml         # owned by INGF-02
   adapter_status: NOT_STARTED             # PRD §7 / §40.1 vocabulary — see deliverable 3
   initial_index_tier: T1                  # PRD §40.1: T1|T2|T3
   change_detection:                       # PRD §6.1 "change-detection capability"; PRD §12.1
     capability: FEED                      # FEED|API|SITEMAP|UPDATED_LISTING|MANIFEST|CONDITIONAL_REQUEST|NONE
     cadence: CRITICAL_6_12H               # CRITICAL_6_12H|NORMAL_DAILY|WEEKLY_RECONCILE|MONTHLY_MANIFEST
     supports_conditional_requests: true
     reconciliation:
       count_hash_weekly: true             # PRD §12.1 "Weekly collection count/hash reconciliation"
       manifest_monthly: true              # PRD §12.1 "deeper monthly manifest reconciliation"
   known_gaps:                             # PRD §6.1 "known gaps"; PRD §6.1 "visible limitations"
     - description: Historical versions before 2023-07-01 are not ingested
       reason_code: DATE_LIMITED           # DATE_LIMITED|SOURCE_UNAVAILABLE|LICENSING_RESTRICTED|CAPABILITY_LIMITED|FORMAT_UNSUPPORTED
       customer_visible: true
   limitation: null                        # REQUIRED (non-null) exactly when adapter_status is one of
                                           # the four PRD §7 limited states — schema in deliverable 3
   evaluation_subset_ref: [EVAL-FED-001]   # PRD §40.8 item 11; resolved by GOLD-16
   ```

   Invariants enforced by the loader: `group_id` is in the mandatory roster; the directory name equals
   `group_id.lower()`; at least one `official_endpoint`; every endpoint URL passes that group's
   `allowlist.yaml` (`INGF-02`); `court_level` present exactly when required;
   `document_coverage.financial_years` covers at least the PRD §6.6 three-year minimum or a
   `known_gaps` entry with `customer_visible: true` explains why not; and `limitation` is non-null
   **exactly when** `adapter_status` is one of the four PRD §7 limited states, null otherwise
   (deliverable 3).

   Every object in the schema is `additionalProperties: false`, and the schema contains **no** key by
   which a group could be skipped, excluded, marked covered without a status, or served by a
   substitute source — a test asserts the property-name set contains no `skip`, `exclude`, `optional`,
   `covered_by`, `substitute_source`, `alternative_source` or `fallback_source`. That is plan §8
   **Q10** item 7 made structural: silent omission is prohibited, and no unofficial source or
   commercial headnote may substitute for unavailable official material.

3. **`<root>.registry.status` — the coverage-status vocabulary and the limited-state record
   (PRD §7 + §40.1; plan §8 **Q10**).** A closed enum in this exact order: `NOT_STARTED`,
   `PLANNED_NOT_ACTIVE`, `IN_DEVELOPMENT`, `ACTIVE`, `METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`,
   `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`. `is_release_acceptable(status) -> bool` returns
   `True` only for `ACTIVE` and the four explicit limited states — **never** for `NOT_STARTED`,
   `PLANNED_NOT_ACTIVE` or `IN_DEVELOPMENT` (PRD §7: "No mandatory source group may remain
   `PLANNED_NOT_ACTIVE` at release"; PRD §40.1). A limited status requires at least one `known_gaps`
   entry with `customer_visible: true` (PRD §7: "MUST produce customer-visible warnings when
   relevant").

   **A limited status is only representable together with its evidence.** Plan §8 **Q10** item 6
   requires a limited state to record the evidence, the affected dates or collections, the
   customer-visible warning and why full coverage is unavailable; those four obligations are these
   four field groups, and the loader rejects a limited status that omits any of them:

   ```yaml
   limitation:                                # required iff adapter_status is a limited state
     state: FRESHNESS_LIMITED                 # must equal adapter_status
     reason_code: OFFICIAL_CAPABILITY_LIMIT   # OFFICIAL_CAPABILITY_LIMIT|MATERIAL_NOT_PUBLISHED|
                                              # LICENSING_RESTRICTION|HISTORICAL_MATERIAL_UNAVAILABLE|
                                              # FRESHNESS_LIMITATION|OTHER_OFFICIAL_SOURCE_CONSTRAINT
     reason_detail: 'The register publishes no feed and supports no conditional requests, so a change
       scan cannot be guaranteed inside the declared cadence.'   # why full coverage is unavailable
     evidence:                                # >= 1 entry; measured or official-source facts only
       - kind: CAPABILITY_PROBE               # OFFICIAL_STATEMENT|CAPABILITY_PROBE|LICENCE_ASSESSMENT|
                                              # INGESTION_RUN|CONFORMANCE_REPORT
         observed_at: '2026-07-14T02:00:00Z'
         official_url: https://www.example.gov.au/legislation
         ref: 'sha256:...'                    # artifact hash, ingestion_run id or conformance report id
         summary: 'No ETag or Last-Modified on any listing endpoint across 30 probes.'
     affected:                                # at least one of the dates or collections must be set
       date_from: null
       date_to: '2023-06-30'
       collections: ['Historical reprints']
     customer_visible_warning: 'Change detection for this source is best-effort; content may lag the
       official register.'                    # must also appear as a customer_visible known_gaps entry
   ```

   `reason_detail` is mandatory for every `reason_code`, and `OTHER_OFFICIAL_SOURCE_CONSTRAINT`
   additionally requires it to name the constraint — the closed `reason_code` set is exactly plan §8
   **Q10** item 4's list of genuine official-source limitations, so a limitation that is really a
   scope choice has no code to hide behind. There is deliberately **no** field for a substitute,
   alternative or fallback source (plan §8 **Q10** item 7; PRD §44.4). Whether any group ends up
   carrying a `limitation` at all is a Gate 2 output produced by `GOLD-16`; this ticket only makes it
   recordable, and impossible to assert without evidence.

4. **`<root>.registry.roster` — `MANDATORY_SOURCE_GROUPS`**, exactly the 52 group IDs of PRD
   §40.2–40.6, as an ordered mapping group id → wave, with the PRD row's official entry URL as a
   comment. This is the single place the 52 are enumerated in code; `GOLD-16` consumes it.

   - **Wave 1 — PRD §40.2 (9):** `LEG-CTH`, `LEG-NSW`, `LEG-VIC`, `LEG-QLD`, `LEG-WA`, `LEG-SA`,
     `LEG-TAS`, `LEG-ACT`, `LEG-NT`.
   - **Wave 2 — PRD §40.3 (13):** `FWC-DOCS`, `FWC-AWARDS`, `FWC-AGREEMENTS`, `FWO-GUIDANCE`,
     `ATO-EMPLOYMENT`, `PT-NSW`, `PT-VIC`, `PT-QLD`, `PT-WA`, `PT-SA`, `PT-TAS`, `PT-ACT`, `PT-NT`.
   - **Wave 3 — PRD §40.4 (12):** `CASE-HCA`, `CASE-FCA`, `CASE-FCFCOA`, `CASE-FWC`, `CASE-NSW`,
     `CASE-VIC`, `CASE-QLD`, `CASE-WA`, `CASE-SA`, `CASE-TAS`, `CASE-ACT`, `CASE-NT`.
   - **Wave 4 — PRD §40.5 (9):** `ADJ-CTH`, `ADJ-NSW`, `ADJ-VIC`, `ADJ-QLD`, `ADJ-WA`, `ADJ-SA`,
     `ADJ-TAS`, `ADJ-ACT`, `ADJ-NT`.
   - **Wave 5 — PRD §40.6 (9):** `FUTURE-CTH`, `FUTURE-NSW`, `FUTURE-VIC`, `FUTURE-QLD`,
     `FUTURE-WA`, `FUTURE-SA`, `FUTURE-TAS`, `FUTURE-ACT`, `FUTURE-NT`.

   `len(MANDATORY_SOURCE_GROUPS) == 52` is asserted by test.

5. **`<root>.registry.freshness` — the five PRD §12.1 dates and the derived status.** The composed
   entry carries them as **five separate fields**, never merged:
   `last_discovery_check_at`, `last_successful_change_scan_at`, `last_full_reconciliation_at`,
   `last_content_ingestion_at`, `freshness_status`. The first four come from `INGF-05`'s
   `RunHistoryPort` (`INGF-01`'s port; a fake supplies them in tests). Derivation:

   | Condition | `freshness_status` |
   |---|---|
   | `change_detection.capability == NONE` or `supports_conditional_requests == false` with no feed/API/sitemap/manifest | `FRESHNESS_LIMITED` — PRD §12.1 "Sources without reliable delta mechanisms MUST show `FRESHNESS_LIMITED` rather than a false guarantee" |
   | no successful change scan ever recorded | `UNKNOWN` |
   | `now - last_successful_change_scan_at` ≤ cadence SLA | `FRESH` |
   | beyond the cadence SLA | `STALE` |

   Cadence SLAs, from PRD §12.1: `CRITICAL_6_12H` → target 6 h, SLA 12 h; `NORMAL_DAILY` → SLA 24 h;
   `WEEKLY_RECONCILE` → SLA 7 d (applies to `last_full_reconciliation_at`); `MONTHLY_MANIFEST` →
   SLA 31 d (applies to `last_full_reconciliation_at`). A separate boolean
   `critical_freshness_breach` is set when a `CRITICAL_6_12H` group exceeds **2×** its SLA — the exact
   trigger PRD §42.2 gives for the "Critical source freshness" alert that `RLSE-08` delivers.
   `freshness_status` never overwrites a declared limited `adapter_status`; the two are separate
   fields (PRD §12.1 lists freshness status *in addition to* the four dates).

6. **`<root>.registry.compose` — the composer.**
   `compose_registry(adapters_root: Path, *, history: RunHistoryPort, clock: Clock,
   mode: Literal["development", "release"]) -> SourceCoverageRegistry`:
   - discovers groups by directory convention (reusing `INGF-01`'s `iter_adapter_dirs`); no central
     list of directories is read;
   - loads each group's `registry.yaml`, resolves `licence.yaml` through `INGF-04` (status,
     `max_quote_chars`, attribution, `index_eligibility`) and asserts `allowlist.yaml` loads through
     `INGF-02`;
   - merges the run history into the five freshness fields;
   - **fails** on: a duplicate `group_id`; a directory whose name ≠ `group_id.lower()`; a group not in
     the roster (`REGISTRY_UNKNOWN_GROUP`); **any roster group with no directory**
     (`MANDATORY_GROUP_MISSING` — PRD §40.9, §44.4);
   - **fails in every mode** when a group's `adapter_status` is one of the four PRD §7 limited states
     and its `limitation` block is absent (`REGISTRY_LIMITATION_MISSING`), carries no evidence entry
     (`REGISTRY_LIMITATION_UNEVIDENCED`), names neither affected dates nor affected collections
     (`REGISTRY_LIMITATION_SCOPE_MISSING`), or carries no customer-visible warning text
     (`REGISTRY_LIMITATION_WARNING_MISSING`) — the mechanical form of plan §8 **Q10** item 6 — and
     equally when a non-limited status carries a non-null `limitation` (`REGISTRY_INVALID`);
   - in `mode="release"` additionally fails when any group's status is not
     `is_release_acceptable(...)` (PRD §7), or when a limited status lacks a customer-visible gap
     entry;
   - output ordering is `sorted(group_id)` and all mappings are emitted with sorted keys, so the JSON
     is **byte-deterministic** for identical inputs (diffable in review; required by `GOLD-16`).

7. **Composed output contract.** `SourceCoverageRegistry` serialises to JSON validated by a committed
   schema `<root>/registry/schema/source-coverage-registry.schema.json`, versioned with
   `registry_schema_version: "1"`. Per-entry fields: everything from `registry.yaml`, plus
   `licence: {status, max_quote_chars, attribution_text, index_eligibility}`, plus the five freshness
   fields, plus `critical_freshness_breach`, plus `counts: {documents, versions, artifacts,
   quarantined_open}` from run history, plus `computed_at`. The `limitation` block is carried through
   **verbatim** — state, reason code, reason detail, every evidence entry, affected dates/collections
   and customer-visible warning — because `GOLD-16` reconciles the composed registry and never
   re-reads `pipelines/adapters/**`, and `LNCH-05`'s disclosure evidence comes from the same output:
   anything plan §8 **Q10** requires to be recorded must survive composition. `notes_internal` from
   `licence.yaml` is **excluded** from the composed output (PRD §35.3 marks it internal; the composed
   registry is the basis of customer-facing coverage language, PRD §6.1).

8. **CLI.** `python -m <root>.registry compose [--adapters-root DIR] [--mode development|release]
   [--out FILE]` (stdout by default) and `python -m <root>.registry validate <group-dir>`
   (single-group schema + invariant check, exit non-zero on failure) — the entry point `INGF-09`'s
   DoD item 1 invokes and adapter tickets run locally.

9. **Failure codes** registered with `register_failure_codes("registry", …)`, each with an operator
   action: `REGISTRY_MISSING`, `REGISTRY_INVALID`, `REGISTRY_DUPLICATE_GROUP`,
   `REGISTRY_UNKNOWN_GROUP`, `REGISTRY_DIRECTORY_MISMATCH`, `MANDATORY_GROUP_MISSING`,
   `REGISTRY_STATUS_NOT_RELEASABLE`, `REGISTRY_GAP_NOT_VISIBLE`, `REGISTRY_ENDPOINT_NOT_ALLOWLISTED`,
   `REGISTRY_LIMITATION_MISSING`, `REGISTRY_LIMITATION_UNEVIDENCED`,
   `REGISTRY_LIMITATION_SCOPE_MISSING`, `REGISTRY_LIMITATION_WARNING_MISSING`.

10. **A2 provenance.** `<root>/registry/LAYOUT.md` records decision A2 verbatim with its plan
    reference and the reason ("one shared file would serialise all 52 adapter tickets"), so a
    cold-starting adapter Builder finds the rationale next to the schema.

## Acceptance checklist (classified)

- [ ] `[machine]` `MANDATORY_SOURCE_GROUPS` contains exactly the 52 PRD §40.2–40.6 group IDs, with the
      correct wave for each; `len(...) == 52` (PRD §40.2–40.6, §44.4).
- [ ] `[machine]` Composition **fails** with `MANDATORY_GROUP_MISSING` when any roster group has no
      directory — the mechanical form of PRD §44.4 "It is not permitted to silently call an
      unimplemented source category covered" and PRD §40.9's "any missing mandatory source group".
- [ ] `[machine]` The `registry.yaml` schema requires all nine PRD §6.1 attributes: a fixture missing
      any one of authority / jurisdiction / official endpoints / document coverage / licensing /
      adapter status / change-detection capability / freshness inputs / known gaps fails to load —
      one parametrised case per attribute (PRD §6.1).
- [ ] `[machine]` Every `official_endpoints` entry carries a `material_class` from the PRD §40.5
      seven-value set, and an entry without one fails to load (PRD §40.5: "identify whether material
      is law, operative instrument, decision, code, guidance, policy or news").
- [ ] `[machine]` The five PRD §12.1 dates appear as five **separate** fields in the composed entry;
      a test asserts the exact field names and that no field merges two of them (PRD §12.1; the
      `INTL-02` contract).
- [ ] `[machine]` Freshness derivation table: `capability: NONE` → `FRESHNESS_LIMITED` regardless of
      recency; never-scanned → `UNKNOWN`; within SLA → `FRESH`; beyond SLA → `STALE`; a
      `CRITICAL_6_12H` group beyond 2× SLA sets `critical_freshness_breach` (PRD §12.1, §42.2).
- [ ] `[machine]` `is_release_acceptable()` is `True` only for `ACTIVE` and the four PRD §7 limited
      states, and `mode="release"` composition fails for a `PLANNED_NOT_ACTIVE`, `NOT_STARTED` or
      `IN_DEVELOPMENT` group (PRD §7, §40.1).
- [ ] `[machine]` A limited status without a `known_gaps` entry marked `customer_visible: true` fails
      with `REGISTRY_GAP_NOT_VISIBLE` (PRD §7 "MUST produce customer-visible warnings when relevant";
      PRD §6.1 "visible limitations").
- [ ] `[machine]` **A limited state cannot be recorded without its evidence** — one parametrised case
      per plan §8 **Q10** item 6 obligation: no `limitation` block → `REGISTRY_LIMITATION_MISSING`;
      empty `evidence` → `REGISTRY_LIMITATION_UNEVIDENCED`; neither `affected.date_*` nor
      `affected.collections` set → `REGISTRY_LIMITATION_SCOPE_MISSING`; empty
      `customer_visible_warning` → `REGISTRY_LIMITATION_WARNING_MISSING`; missing `reason_detail` or a
      `reason_code` outside the closed set → `REGISTRY_INVALID`.
- [ ] `[machine]` `limitation.state` must equal `adapter_status`, and a non-limited status
      (`ACTIVE`, `IN_DEVELOPMENT`, …) carrying a non-null `limitation` fails to load — the block means
      exactly one thing (deliverable 3).
- [ ] `[machine]` **Neither omission nor substitution is expressible** (plan §8 **Q10** item 7; PRD
      §44.4): every schema object is `additionalProperties: false`; the schema's property-name set
      contains no `skip`, `exclude`, `optional`, `covered_by`, `substitute_source`,
      `alternative_source` or `fallback_source`; and an absent roster group still has exactly one
      outcome, `MANDATORY_GROUP_MISSING`.
- [ ] `[machine]` The composed output carries the `limitation` block verbatim — state, reason code,
      reason detail, every evidence entry, affected dates/collections and customer-visible warning —
      so `GOLD-16` and `LNCH-05` read it without re-reading `pipelines/adapters/**` (deliverable 7).
- [ ] `[machine]` An `official_endpoints` URL not permitted by that group's `allowlist.yaml` fails
      with `REGISTRY_ENDPOINT_NOT_ALLOWLISTED` (PRD §35.2 "URL official allowlist"; SEC-002
      consistency).
- [ ] `[machine]` **Determinism**: composing the same fixture tree twice with the same fake clock
      produces byte-identical JSON, and group order is `sorted(group_id)` (required by `GOLD-16`'s
      reconciliation diff).
- [ ] `[machine]` The composed output validates against
      `source-coverage-registry.schema.json` and **excludes** `notes_internal` (PRD §35.3, §6.1).
- [ ] `[machine]` **A2 guarantee**: no `registry.yaml` (or equivalent shared source list) exists
      anywhere outside a `pipelines/adapters/<group>/` directory (plan §2.1 A2; deliverable 1).
- [ ] `[machine]` Duplicate `group_id`, directory/id mismatch and unknown group each fail with their
      distinct code (deliverable 6).
- [ ] `[machine]` `python -m <root>.registry validate <group-dir>` exits non-zero for every invalid
      fixture group and zero for the valid one (the entry point `INGF-09` DoD item 1 calls).
- [ ] `[machine]` Every failure code in deliverable 9 is registered with a non-empty operator action
      (ADM-001, PRD §40.8 item 10).
- [ ] `[machine]` `uv run pytest` green.
- [ ] `[machine]` `pnpm test` green (unchanged — no TypeScript in this ticket).
- [ ] `[human]` **Founder review of the composed registry against PRD §41.3 step 1** — "open Source
      Coverage Registry; show all jurisdictions, active/limited groups, date ranges and freshness."
      With synthetic fixture groups this is a shape review: is the composed output sufficient to run
      that demo minute and to support PRD §6.1's customer-facing coverage language? The fixture set
      includes one limited group, so the review also covers whether a limited entry presents its
      evidence, affected dates/collections and customer-visible warning clearly enough to feed the
      Gate 2 verification `GOLD-16` prepares (plan §8 **Q10**). Irreducibly human judgment
      (PRD §41.3, §43.4 item 4).
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (**ADM-001**; supports **COV**/
      customer-facing coverage language via PRD §6.1); UAT IDs — none directly, though the composed
      registry is the artifact PRD §41.3 step 1 demonstrates; schema/API/event compatibility
      (introduces `registry.yaml` and the composed-output schema, both consumed by 52 adapter tickets
      and by `INTL-02`/`GOLD-16`); tenant/PII/security impact (none — public source metadata only);
      source/licence impact (surfaces `INGF-04`'s assessment per group); cost/memory/latency impact
      (negligible); rollback path; known gaps (sub-PRD **M3**; the limited-state launch policy itself
      is confirmed — plan §8 **Q10** — and which groups, if any, carry a `limitation` is a Gate 2
      output produced by `GOLD-16`, not a gap in this ticket).
- **No `[fixture]` criteria** — composition is pure over YAML/JSON inputs and a faked
  `RunHistoryPort`; no recorded source data is replayed here (that is `INGF-09`'s). Declared absent
  deliberately.

## Test plan

Harness: `uv run pytest pipelines/ingestion/tests/registry -q`, fully offline. Fixture groups under
`pipelines/ingestion/tests/registry/fixtures/adapters/`: a valid `leg-cth`-shaped group, one per
invalid case (`missing-attribute-*`, `bad-material-class`, `dup-group`, `dir-mismatch`,
`unknown-group`, `limited-no-visible-gap`, `endpoint-not-allowlisted`, `planned-not-active`), the
limited-state set (`limited-valid`, `limited-no-limitation`, `limited-no-evidence`,
`limited-no-scope`, `limited-no-warning`, `limited-state-mismatch`, `active-with-limitation`), plus a
**full synthetic 52-group tree** generated by a committed script for the roster and release-mode
tests.

1. `uv sync --frozen && uv run pytest pipelines/ingestion/tests/registry -q`.
2. **`test_roster.py`** — the 52 ids, their waves, the count, and that every id matches
   `^[A-Z][A-Z0-9-]*$` with a lowercase directory form.
3. **`test_schema.py`** — the nine required-attribute cases plus the `material_class` case plus the
   coverage/financial-year invariant.
4. **`test_status.py`** — `is_release_acceptable` table; release-mode failures; the
   customer-visible-gap rule; the deliverable 3 `limitation` rules (present iff limited, `state`
   equals `adapter_status`, closed `reason_code` set, mandatory `reason_detail`, non-empty `evidence`,
   affected dates or collections, non-empty `customer_visible_warning`); and the schema-shape
   assertion that no omission or substitution key exists (plan §8 **Q10** items 6–7).
5. **`test_freshness.py`** — derivation table driven by a fake `RunHistoryPort` and fake `Clock`;
   the five-field separation assertion; the 2× critical-breach flag.
6. **`test_compose.py`** — happy path over the 52-group synthetic tree (asserting a complete registry
   and no missing-group error), then one deletion at a time asserting `MANDATORY_GROUP_MISSING`;
   duplicate/mismatch/unknown cases; the four limited-state composition failures over the
   limited-state fixtures and the verbatim carry-through of a valid `limitation` into the composed
   output; determinism (two composes, byte equality); `notes_internal` exclusion; output schema
   validation.
7. **`test_no_shared_registry.py`** — repository scan implementing the A2 guarantee, with a synthetic
   violation as a negative control.
8. **`test_cli.py`** — `validate` exit codes per fixture group; `compose --out` writes only where
   asked.
9. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus: that composition cannot succeed with a roster group absent; that a limited status can
never be presented without a customer-visible gap, nor without its evidence, affected dates or
collections, customer-visible warning and reason; that no key anywhere in the schema lets a mandatory
group be skipped, excluded or served by a substitute source; that `freshness_status` cannot report
`FRESH` for a source with no delta mechanism; and that the composed JSON is deterministic (no clock,
no set iteration order, no absolute paths leaking in).

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (docs PR/MR,
sub-PRD changelog line, then `publish-tickets.mjs --sync`), then change code.

**Foreseeable frictions and their exact writeback targets:**

1. **A real group cannot be described by one `registry.yaml`** — e.g. `ADJ-NSW` spans five
   authorities with different licences (PRD §40.5 requires each to be enumerated) → keep **one file
   per group** and express the multiplicity **inside** it (a list of authorities/collections). Update
   this ticket's deliverable 2 and `docs/prd/05-ingestion-framework/README.md` D2/D3 first. Splitting
   into several files per group is acceptable only if they stay inside that group's directory;
   introducing any cross-group shared file falsifies **A2** and requires updating
   `docs/prd/breakdown-plan.md` §2.1 — escalate rather than doing it locally.
2. **The five PRD §12.1 dates cannot all be sourced from `INGF-05`'s run history** (e.g. "last full
   reconciliation" needs a separate reconciliation run type) → add the run mode in `INGF-05`, not a
   derived guess here. Record the dependency in `docs/prd/05-ingestion-framework/README.md`; a
   composed date that is really an approximation would violate PRD §12.1's "MUST separate" and PRD
   §12.1's "rather than a false guarantee".
3. **`INTL-02` or `GOLD-16` needs a field the composed output lacks** → add it here and bump
   `registry_schema_version`, recording the change in
   `docs/prd/05-ingestion-framework/README.md`. Neither consumer may re-read
   `pipelines/adapters/**` directly: the composed registry is the contract.
4. **A group genuinely cannot reach `ACTIVE` before release** → record the limited state with its
   complete `limitation` block. The governing policy is confirmed (plan §8 **Q10**), so the only live
   question is whether measured evidence shows a genuine official-source limitation — never whether
   mandatory scope may be cut. Do not add a status value, do not widen `is_release_acceptable`, and do
   not relax an evidence field to make a group pass. `GOLD-16` produces the measured evidence and the
   proposed registry state, Gate 2 is the Founder's verification and sign-off under that policy, and
   `LNCH-05` verifies the launch statement. PRD §7 fixes the vocabulary and PRD §44.4 forbids silently
   calling the category covered.
5. **Composition is needed before `INGF-05` exists in a branch** → use the `RunHistoryPort` fake; do
   not read `ingestion.sqlite` directly. If the port shape is wrong, the change belongs in `INGF-01`
   (the port declaration) with a ticket update, not in this area.

**Escalation rule.** If A2 itself is falsified — if the registry genuinely cannot be composed from
per-adapter files — that overturns a decomposition-critical decision recorded in
`docs/prd/breakdown-plan.md` §2.1 and would serialise all 52 adapter tickets across five modules.
Stop, write `docs/adr/NNNN-source-coverage-registry-composition.md` (new file, owned by this ticket
per plan §2.1 **A9**), update the plan's §2.1 row and this sub-PRD, and escalate for re-review before
writing any shared registry document.
