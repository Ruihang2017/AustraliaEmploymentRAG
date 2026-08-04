---
id: SFUT-07
title: FUTURE-SA
module: 10-sources-future
lane: 10-sources-future
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [SFUT-01, SLEG-07]
blocks: [GOLD-16]
---

# SFUT-07 — `FUTURE-SA`

Implements PRD §40.6 (wave 5 — `FUTURE-SA`), PRD §6.5 (future and proposed law) and PRD §40.8
(adapter Definition of Done) &lt;SRCH-002, ADM-001&gt; — no ADR — the decision is already made in PRD
§40.6; this is build ticket 7 of 10 against it.
Parent sub-PRD: [10-sources-future README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [SFUT-01 — Future-status event model and current/future separation](SFUT-01-future-status-event-model-and-current-future-separation.md),
and `SLEG-07` — `LEG-SA`, module `06-sources-legislation`, file-scope
`pipelines/adapters/leg-sa/**` (`docs/prd/06-sources-legislation/tickets/`).
**Why `builder`:** one source adapter inside its own directory against a frozen framework contract —
PRD §44.3 calls individual source adapters the *"safe parallel work units"*; not a new subsystem
decision.

## Background + basis

**The PRD §40.6 row this ticket implements, verbatim:**

| Group ID | Official entries | Required status events |
|---|---|---|
| `FUTURE-SA` | South Australian Legislation, Parliament of South Australia and official consultations | Same controlled future-status events |

*"Same controlled future-status events"* refers back to the `FUTURE-NSW` row in the same table, which
states them: **"Bill/draft/proclamation/commencement/repeal status without contaminating current-law
answers"**. That is the required event set for this group.

**PRD §40.6 closes with the labelling rule:**

> "Each future item links to the legislation it would amend where deterministically supported. The UI
> labels `BILL_NOT_ENACTED`, `ENACTED_NOT_IN_FORCE` or `DRAFT_OR_CONSULTATION` with the relevant
> dates and never calls it current law."

**PRD §6.5 is the invariant:** *"Future/proposed material MUST be stored and searchable but MUST be
separated from current-law answers and visibly labelled."* **PRD §6.7 is the default:** *"Default
answers MUST use only material in force at the requested legal date unless the user explicitly
requests historical, future or proposed material."*

**The register anchor.** PRD §40.2's `LEG-SA` row names South Australian Legislation —
<https://legislation.sa.gov.au/> — with families *"Acts, Bills, regulations/rules,
proclamations/notices, historical index"* and capability *"Discovery; versions; proclamation
events"*. That register is `SLEG-07`'s. PRD §40.6 adds *"Parliament of South Australia and official
consultations"*. **PRD §40.1 requires this ticket to expand those named entries into exact
collections:** *"The live Source Coverage Registry will expand each group into exact
collections/endpoints, licence snapshots, formats, counts, date bounds, schedules and gaps."* The PRD
names no parliament or consultation URL; the Builder discovers the exact official endpoints and
records them in `registry.yaml` — an entry name is not an endpoint.

**Jurisdiction-specific note — the highest overlap risk in wave 5.** SA is the one jurisdiction where
the §40.2 row *and* the wave-1 ticket goal both name proclamations: the `LEG-SA` row's capability is
*"Discovery; versions; proclamation events"* and plan §5.7's `SLEG-07` goal is *"SA versions plus
proclamation events"*. Sub-PRD **D1** still applies and must be applied deliberately here:

- `LEG-SA` consumes proclamations **as version/commencement evidence for Acts and regulations** it
  owns, and emits the resulting in-force versions and events on those documents;
- `FUTURE-SA` owns the **proclamation/notice documents themselves** where they are separately
  published, plus bills, explanatory material, exposure drafts, consultation documents and the §40.6
  status events on those documents.

Both adapters may legitimately read the same register page; neither may emit the other's documents.
Because the two groups are different `source_id`s, the intermediate-record contract makes
cross-source references impossible by construction (`CRPS-01` deliverable 11) — but duplicate
*content* is still a corpus defect (two documents for one proclamation). **Before emitting any
proclamation document, read the merged `leg-sa` adapter's emitted document types.** If `leg-sa`
already emits proclamation documents, stop and follow *Feedback obligation* item 4 — sub-PRD open
question **F4**.

**The ownership cut (sub-PRD D1) — read this before writing `identify()`.** `LEG-SA` (`SLEG-07`)
owns Acts, regulations/rules and their versions. `FUTURE-SA` owns the **pre-enactment pipeline**:
bill texts and prints, explanatory material, exposure drafts and draft instruments, official
consultation documents, and separately published proclamation/commencement notices — plus the §40.6
status events on those documents. This adapter must **not** emit a `document_version` for an Act,
regulation or rule; `SFUT-01`'s separation validator enforces that mechanically (check `S2`). The
`LEG-SA` row lists "Bills" because the register *hosts* them; hosting is not ownership — plan §5.11's
goal for this ticket is *"SA future-status events"*.

**Employment scope.** PRD §6.3 fixes the state/territory subject scope: payroll tax; employment and
industrial-relations legislation and guidance; long-service leave; WHS/OHS; discrimination and equal
opportunity; workers compensation; labour hire licensing; portable long-service leave; workplace
surveillance and employment-related privacy; whistleblowing; child employment; public-sector
employment. PRD §40.2 scopes register work to *"employment-related titles and their necessary
amending, commencement, transitional and interpretation instruments"* through *"a maintained
subject/title allowlist plus dependency expansion"* — `SLEG-01`'s primitive, reused here.

**PRD §40.8 is this ticket's Definition of Done, verbatim.** "For each source group, the
implementation PR must provide:"

1. registry row(s), official URL allowlist and licence snapshot/assessment;
2. discovery fixture and live dry-run evidence;
3. stable identity/version rules, including deletion/unavailability behaviour;
4. representative HTML/XML/JSON/PDF fixtures without customer data;
5. parser/node hierarchy and exact-text round-trip tests;
6. historical/effective/status/event behaviour for at least three time points;
7. incremental no-change, changed, removed and transient-failure tests;
8. count/hash baseline and anomaly thresholds;
9. freshness schedule and last-check/last-ingest separation;
10. quarantine cases and operator recovery action;
11. retrieval/citation evaluation subset;
12. measured storage, parse time, index size and peak memory.

`INGF-09` implements all twelve as inherited `test_dod_NN_*` methods; this ticket supplies the
fixtures and configuration they run against and commits the resulting `conformance-report.json`
(PRD §45.4).

**Downstream.** This ticket `blocks` `GOLD-16` — *"Every mandatory group is ACTIVE or explicitly
limited — never silently omitted"* (plan §5.22, PRD §44.4).

**Carried caveats.** DoD item 11 may be `DEFERRED(GOLD-16)` with a recorded reason and nothing else
may be deferred (sub-PRD **F8**).

**Per-source anomaly thresholds are baseline-selected, not guessed (plan §8 Q9).** PRD §40.9's ±10%
collection-count change and >2% parse-failure figures are **initial defaults**. This ticket records
the group's values in `conformance.yaml` and may tighten or replace the percentages once it has a
representative baseline — overrides are tighten-only. Critical identity, time, mandatory-source and
citation failures are unconditional blockers whatever the percentages are, and `GOLD-16` consolidates
and verifies the final per-source thresholds.

**The limited-state launch policy is settled — plan §8 Q10 is confirmed policy (sub-PRD D12).**
No mandatory source group is pre-selected for omission or reduced implementation; `FUTURE-SA` must be
attempted in full; arbitrary scope reduction to make a release date easier is not permitted. A
customer-visible limited state — `METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`,
`LICENSING_RESTRICTED` or `SOURCE_UNAVAILABLE` — is permitted **only** where measured evidence shows
a genuine official-source limitation (an official capability limit, the official body not publishing
the material, a licensing restriction, historical material unavailable, a freshness limitation, or
another real official-source constraint), and it is then recorded through `INGF-07`'s `limitation`
block (Deliverable 1). Silent omission is prohibited, and no unofficial source or commercial headnote
may substitute for unavailable official material. `GOLD-16` produces the measured evidence and the
proposed registry state, `LNCH-05` verifies that the launch statement discloses it accurately, and
Gate 2 is the Founder's verification and sign-off under this policy — not an opportunity to cut
mandatory scope. This ticket supplies the status, the evidence and the customer-visible gap text
unconditionally; **which** groups, if any, end up limited is a Gate 2 output derived from evidence.
None of this changes what this group emits: the PRD §6.5/§6.7 current-vs-future separation
invariants and `SFUT-01`'s checks are unaffected by registry status.

## Goal

Implement the `FUTURE-SA` source adapter under `pipelines/adapters/future-sa/**`: a `registry.yaml`
row decomposing "South Australian Legislation, Parliament of South Australia and official
consultations" into exact official collections, an `allowlist.yaml`, a licence snapshot and
assessment per authority, and an `adapter.py` exposing `ADAPTER: SourceAdapter` that implements PRD
§40.7's eight boundaries over SA bills, explanatory material, exposure drafts/consultations and
separately published proclamation/commencement notices — emitting only proposal documents with PRD
§6.7 non-current statuses derived from evidenced events via `_shared/future`, with recorded fixtures
sufficient for all twelve PRD §40.8 DoD items to pass offline through `INGF-09`'s conformance kit and
for `SFUT-01`'s separation suite to prove zero current-law eligibility at three legal dates.

## Non-goals

- **No Acts, regulations, rules or their versions** — `SLEG-07` (`leg-sa`), sub-PRD **D1**.
- **No proclamation-derived version/commencement events on Acts** — those belong to `leg-sa`; this
  adapter emits events on **its own** proposal and notice documents only (the INR contract scopes
  refs by `source_id`, `CRPS-01` deliverable 11).
- **No shared future primitives** — `SFUT-01` owns `_shared/future/**` (plan §9 **R2**).
- **No shared legislation primitives** — `SLEG-01` owns `_shared/legislation/**`.
- **No framework code** — `INGF-02`…`INGF-06`, reached only through the injected ports on
  `AdapterRunContext` (`INGF-01`). No HTTP or parsing library import (PRD §37.4).
- **No third-party consultation submissions**, Hansard, committee reports or media releases —
  sub-PRD **D6**; PRD §6.1, §10.1.
- **No corpus writes** — PRD §40.7.
- **No evaluation cases or gold data** — `GOLD-16`; `evals/gold/**` must never be read (plan §9 R9,
  PRD §45.1 item 6).
- **No live network in tests** — item 2's dry-run evidence is a recorded artifact.
- **No customer-facing screens or admin console** — `FIND-05`, `INTL-02`.

## File-scope (write-owns)

- `pipelines/adapters/future-sa/**` — the whole group directory in `INGF-07` deliverable 1's layout:
  `registry.yaml`, `allowlist.yaml`, `licence.yaml`, `licence-snapshots/`, `conformance.yaml`,
  `adapter.py`, `fixtures/**`, `tests/**`.
- `pipelines/adapters/pyproject.toml` — **append-only** (plan §1.1, PRD §44.3, sub-PRD F7).
- Does not touch: `pipelines/adapters/_shared/future/**` — `SFUT-01` (imported read-only).
- Does not touch: `pipelines/adapters/_shared/legislation/**`, `pipelines/adapters/leg-*/**` —
  module `06-sources-legislation`.
- Does not touch: `pipelines/adapters/future-{cth,nsw,vic,qld,wa,tas,act,nt}/**` — the eight sibling
  `SFUT` tickets.
- Does not touch: `pipelines/ingestion/**`, `pipelines/corpus-builder/**`, `pipelines/evaluation/**`,
  `evals/**`, `schemas/**`, `packages/**`, `apps/**`, `services/**`, `tests/**`, `infra/**`.

**Serial safety.** First decomposition; nothing merged, nothing in flight. `SFUT-01` and `SLEG-07`
have landed. The eight sibling adapter tickets may run concurrently: each writes only its own
`pipelines/adapters/future-<juris>/` directory, so the write-sets are disjoint by directory. The nine
share exactly two paths — `_shared/future/**`, read-only and owned by `SFUT-01`, and the append-only
`pipelines/adapters/pyproject.toml`.

## Deliverables

1. **`registry.yaml`** (schema and validator: `INGF-07`) with `group_id: FUTURE-SA`, `wave: 5`, the
   authority list (the SA legislation-register authority, the Parliament of South Australia and the
   official consultation publisher, D10), and `official_endpoints` decomposing PRD §40.6's three named
   entries into exact collections with `kind` and `material_class`. `document_coverage.families`
   covers bills and bill prints, explanatory material, exposure drafts/draft instruments, consultation
   documents and proclamation/notice documents; `financial_years` covers at least PRD §6.6's three or
   a `known_gaps` entry says why not. `initial_index_tier: T3` (sub-PRD **D8**). `change_detection`
   per sub-PRD **D9**. `evaluation_subset_ref` non-empty (F8). `adapter_status` is `ACTIVE` or a PRD
   §7 limited state with a customer-visible gap (PRD §40.1). **A `known_gaps` note records the
   `leg-sa` boundary** so the coverage claim is unambiguous to a reader of the composed registry.
   **When — and only when — `adapter_status` is one of the four PRD §7 limited states, the same file
   carries `INGF-07`'s `limitation` block**, whose shape this ticket consumes and never redefines:
   `state` equal to `adapter_status`; a `reason_code` from the closed set `OFFICIAL_CAPABILITY_LIMIT`
   / `MATERIAL_NOT_PUBLISHED` / `LICENSING_RESTRICTION` / `HISTORICAL_MATERIAL_UNAVAILABLE` /
   `FRESHNESS_LIMITATION` / `OTHER_OFFICIAL_SOURCE_CONSTRAINT`; a mandatory `reason_detail` stating
   why full coverage is unavailable; at least one `evidence` entry (`kind`, `observed_at`,
   `official_url`, `ref`, `summary`) recording a measured or official-source fact; an `affected`
   scope naming the dates or the collections; and a `customer_visible_warning` that also appears as a
   `customer_visible: true` `known_gaps` entry. A non-limited status carries `limitation: null`.
   `INGF-07` fails composition with `REGISTRY_LIMITATION_MISSING`, `REGISTRY_LIMITATION_UNEVIDENCED`,
   `REGISTRY_LIMITATION_SCOPE_MISSING` or `REGISTRY_LIMITATION_WARNING_MISSING` when one is absent, so
   an unevidenced limited state cannot be merged (plan §8 **Q10**, confirmed policy; sub-PRD **D12**).

2. **`allowlist.yaml`** (schema: `INGF-02`) — exact official hosts/path prefixes, **excluding** any
   third-party-submission repository (sub-PRD **D6**; check `S8`).
3. **`licence.yaml` + `licence-snapshots/`** (`INGF-04`) — one `LicenceAssessment` per authority
   across PRD §11.1's nine axes; unclear rights default to *"metadata, limited quotation and official
   links"*.
4. **`adapter.py`** exposing module-level `ADAPTER: SourceAdapter` (`INGF-01` deliverable 9),
   implementing PRD §40.7's eight boundaries: `discover` (official listings/feeds filtered to the PRD
   §6.3 employment scope through `_shared/legislation`'s title allowlist), `fetch` (through
   `ctx.fetcher` with conditional-request validators), `identify` (deterministic identity stable
   across bill prints, never colliding with a `leg-sa` identity — **the highest-risk identity boundary
   in wave 5**), `parse` (through `ctx.parser`), `normalise` (`document_type` from
   `PROPOSAL_DOCUMENT_TYPES`, `legal_status` from `derive_future_status()`), `extract_events`
   (`INTRODUCED`, `PASSED`, `ASSENTED`, `PROCLAMATION_MADE`, `COMMENCEMENT`, `DRAFT_PUBLISHED`,
   `CONSULTATION_OPENED/CLOSED`, `LAPSED`, `WITHDRAWN`, `REPEAL_SCHEDULED`, each with an
   `evidence_ref` into this document's own parsed text), `extract_relations` (intra-document only;
   "amends" travels as `future.amends`, sub-PRD **D5**), `validate` (`_shared/legislation` checks plus
   `FutureSeparationValidator`).
5. **`future.*` metadata** on every emitted record via `build_future_metadata()`.
6. **Discovery fixtures** + `fixtures/dry-run.json` — DoD item 2.
7. **Identity/deletion rules** — DoD item 3, including `REMOVED` behaviour that retains prior
   versions, and an explicit assertion that a proclamation notice's identity does not collide with an
   Act identity of the shape `leg-sa` produces.
8. **Document fixtures** covering every declared media type, free of personal data, cookies,
   `Authorization` headers and credentials — DoD item 4.
9. **Parser/node round-trip** — DoD item 5 via `assert_roundtrip()`.
10. **Three time points** — DoD item 6 — spanning **(a)** before introduction, **(b)** after assent
    and before the proclamation, **(c)** after the evidenced proclamation. At all three the emitted
    records stay non-current (sub-PRD **D2**).
11. **Incremental matrix** — DoD item 7.
12. **`fixtures/baseline.json`** — DoD item 8, plus tighten-only `anomaly_overrides` (plan §8 Q9).
13. **Freshness schedule** — DoD item 9 (last-check vs last-ingest separation, PRD §12.1).
14. **Quarantine cases** — DoD item 10, one per declared reason code.
15. **`conformance.yaml`** — ceilings, overrides and `deferred_items: [11]` with a recorded reason.
16. **Measured resources** — DoD item 12, in the committed `conformance-report.json`.
17. **`tests/test_conformance.py`** (the five-line subclass) and **`tests/test_separation.py`**
    (`assert_future_separation`, `assert_no_cross_adapter_import`) — the PRD §44.2 `E16` exit evidence
    for this group.

## Acceptance checklist (classified)

**PRD §40.8 twelve-item adapter Definition of Done** (plan §1.1 maps §40.8 adapter fixtures to
`[fixture]`):

- [ ] `[fixture]` **DoD 1** — `registry.yaml`, `allowlist.yaml` and `licence.yaml` exist and validate;
      `FUTURE-SA` is in `MANDATORY_SOURCE_GROUPS`; directory name `future-sa`; licence-snapshot
      SHA-256 matches `terms_sha256`; every endpoint URL passes the allowlist (**this group's Source
      Coverage Registry row**, PRD §6.1).
- [ ] `[fixture]` **DoD 2** — recorded discovery replays through `discover()` yielding ≥1
      `RemoteDescriptor` with a non-empty `descriptor_key` and an allowlisted URL; `dry-run.json`
      present and within `DRY_RUN_MAX_AGE_DAYS`.
- [ ] `[fixture]` **DoD 3** — `identify()` deterministic across two calls and two prints; distinct
      documents distinct keys; **a proclamation notice's key does not collide with an Act-shaped
      key**; `REMOVED` deletes no prior state.
- [ ] `[fixture]` **DoD 4** — fixtures cover every declared media type; the no-customer-data scan is
      clean.
- [ ] `[fixture]` **DoD 5** — every fixture parses through `ParserHost`; `assert_roundtrip()` passes;
      one root, no cycles, contiguous sibling ordinals; every `text_hash` recomputes (PRD §15.3).
- [ ] `[fixture]` **DoD 6** — three legal dates produce the expected `legal_status` from PRD §6.7's
      seven values, distinguish `event_date` from `effective_date` (PRD §15.2), no overlapping effect
      intervals.
- [ ] `[fixture]` **DoD 7** — the four incremental scenarios produce their expected counts/status; the
      transient case creates **no** content quarantine item.
- [ ] `[fixture]` **DoD 8** — the replayed run reproduces `baseline.json` exactly; `anomaly_overrides`
      pass the tighten-only policy.
- [ ] `[fixture]` **DoD 9** — a replayed 304 run and a content run write different freshness fields;
      `last_content_ingestion_at` does not advance on a 304 (PRD §12.1).
- [ ] `[fixture]` **DoD 10** — every declared quarantine reason has ≥1 fixture producing exactly that
      code with a non-empty operator action (ADM-001).
- [ ] `[fixture]` **DoD 11** — `evaluation_subset_ref` non-empty and well-formed; `DEFERRED` with the
      recorded reason until `evals/**` exists — the only permitted deferral (sub-PRD F8).
- [ ] `[fixture]` **DoD 12** — storage, parse time, index-size estimate and peak RSS recorded and
      within ceilings (PRD §39.2).
- [ ] `[fixture]` `python -m <root>.conformance check pipelines/adapters/future-sa` exits 0 in strict
      mode and the report is committed (PRD §45.4).

**PRD §44.2 `E16` exit evidence — current/future separation tests:**

- [ ] `[fixture]` `assert_future_separation()` over this group's replayed fixtures at all three DoD-6
      legal dates returns no findings: nothing is eligible in `CURRENT_LAW` mode, while
      `INCLUDE_FUTURE` returns the records (PRD §6.5, §6.7, §36.2).
- [ ] `[machine]` No emitted record carries `legal_status: IN_FORCE`, `REPEALED` or `SUPERSEDED`, and
      no `document_type` is outside `PROPOSAL_DOCUMENT_TYPES` — checks `S1`/`S2` (sub-PRD D1, D2).
      **This is the check that keeps `future-sa` and `leg-sa` disjoint.**
- [ ] `[machine]` Every asserted status is supported by an evidenced `legal_event`; an
      evidence-stripped fixture yields `STATUS_UNCONFIRMED` (check `S3`; PRD §15.2).
- [ ] `[machine]` A commencement expressed as a day to be fixed by proclamation produces
      `resolved_date: null` and status `ENACTED_NOT_IN_FORCE`; a proclamation-evidenced fixture
      resolves the date (check `S4`; sub-PRD D4; PRD §43.3).
- [ ] `[machine]` Every `future.*` block carries its status's required dates (check `S5`; PRD §40.6).
- [ ] `[machine]` `future.amends` links carry exact evidence offsets and a deterministic derivation
      (check `S7`; PRD §40.6, §35.2).
- [ ] `[machine]` The allowlist admits no third-party submission repository and no record's
      `provenance.official_url` matches one (check `S8`; sub-PRD D6; PRD §6.1, §10.1).
- [ ] `[machine]` `assert_no_cross_adapter_import()` passes — `_shared/**` and the ingestion framework
      only, never `pipelines/adapters/leg-sa` or a sibling group (sub-PRD D7).
- [ ] `[machine]` `python -m <root>.registry validate pipelines/adapters/future-sa` exits 0 and
      `adapter_status` is `ACTIVE` or a PRD §7 limited state with a `customer_visible: true` gap
      (PRD §7, §40.1, §44.4).
- [ ] `[machine]` **A limited status is only representable with its evidence.** When `adapter_status`
      is one of the four limited states, `registry.yaml` carries `INGF-07`'s `limitation` block:
      `state` equal to `adapter_status`, a closed-set `reason_code`, a non-empty `reason_detail`, at
      least one `evidence` entry, an `affected` scope naming dates or collections, and a
      `customer_visible_warning` that also appears as a `customer_visible: true` gap; a non-limited
      status carries `limitation: null`. Deleting any one of those from a scratch copy makes
      composition fail with the matching `REGISTRY_LIMITATION_*` code. The recorded evidence must
      describe a genuine official-source limitation — unfinished work is not one (plan §8 **Q10**,
      confirmed policy; sub-PRD **D12**; `INGF-07` deliverables 3 and 6).
- [ ] `[machine]` No HTTP, document-parsing or database import — `INGF-01`'s architecture scan is
      green over `pipelines/adapters/future-sa/**` (PRD §37.4, §39.1, §40.7; SEC-002).
- [ ] `[machine]` No path under `evals/gold/**` is opened during the suite (plan §9 R9, PRD §45.1
      item 6).
- [ ] `[machine]` The whole suite runs offline with no outbound network.
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, §20.3).
- [ ] `[machine]` `pnpm test` green — standing suite item; no TypeScript here, so "unchanged and
      green" (plan §1.1, PRD §45.3).
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (**SRCH-002** data-side,
      **ADM-001** registry row); UAT IDs (`UAT-SRCH-02`; screen behaviour is `FIND-04`'s);
      schema/API/event compatibility (none); tenant/PII/security impact (submissions excluded,
      fixtures scanned, fetches allowlisted); source/licence impact (licence snapshot + assessment per
      authority); cost/memory/latency impact (DoD-12 measurements); rollback path (remove the group
      directory; the composer then reports `MANDATORY_GROUP_MISSING`, the correct loud failure); known
      gaps (`known_gaps` rows including the `leg-sa` boundary, sub-PRD F1–F4, F8).
- [ ] `[human]` **Founder/Architect review of the `leg-sa` boundary** — SA is the jurisdiction where
      wave 1 and wave 5 come closest (both name proclamations). Confirm that the two groups' emitted
      document sets do not overlap and that the composed registry describes the split honestly
      (PRD §6.1, §44.4, §40.9's duplicate-identity anomaly; PRD §43.4 item 4). Irreducibly human
      judgment.
- **No further `[fixture]` classes** beyond the twelve DoD items and the separation replay. Declared
  explicitly.

## Test plan

Harness: `uv run pytest pipelines/adapters/future-sa -q`, fully offline, with `INGF-09`'s
`ReplayFetcher` (which also applies this group's `allowlist.yaml`), `ReplayClock` and an in-memory
`RecordSink` inside `replay_context`. Copy the construction pattern from `INGF-09`'s reference
adapter (`pipelines/ingestion/src/<root>/conformance/reference/demo-registry/`).

1. `uv sync --frozen && uv run pytest pipelines/adapters/future-sa -q`.
2. **`tests/test_conformance.py`** `[fixture]` — the twelve inherited methods, all `PASS` except item
   11 `DEFERRED`; the CLI exits 0 and the report validates.
3. **`tests/test_separation.py`** — `assert_future_separation()` at the three legal dates, then the
   `S1`–`S8` mutations over `tmp_path` copies.
4. **`tests/test_status.py`** — before introduction → `STATUS_UNCONFIRMED`; after introduction →
   `BILL_NOT_ENACTED`; after assent → `ENACTED_NOT_IN_FORCE`; `IN_FORCE` never appears.
5. **`tests/test_proclamation_boundary.py`** — the jurisdiction-specific risk: a proclamation notice
   is emitted as a **notice document** with a proposal `document_type`, never as an Act version; its
   identity does not collide with an Act-shaped key; the commencement event it evidences is attached
   to this group's own documents only.
6. **`tests/test_commencement.py`** — proclamation-unset → `resolved_date is None`; the `S4` negative
   control fails.
7. **`tests/test_identity.py`** — determinism across two prints; `REMOVED` behaviour.
8. **`tests/test_registry.py`** — `registry validate` exits 0; `adapter_status` releasable; limited
   status carries a customer-visible gap; the `leg-sa` boundary note is present.
9. **`tests/test_architecture.py`** — forbidden-import scan and `assert_no_cross_adapter_import()`.
10. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus (security- and correctness-sensitive paths): start with the `leg-sa` boundary — list
the `document_type`s this adapter emits and confirm none is an Act, regulation or rule, then run the
`S1`–`S8` mutations. Then confirm (a) no commencement date is produced without evidence, (b) the
allowlist contains no submission repository or non-official host, and (c) `conformance.yaml` defers
item 11 and nothing else.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (a docs PR/MR,
a changelog line in `docs/prd/10-sources-future/README.md`, then `publish-tickets.mjs --sync`), and
only then change code. The ticket wins over any implementation plan (CLAUDE.md, issue #53).

**Foreseeable frictions and their exact writeback targets:**

**Standing rule for every limited state below (plan §8 Q10, confirmed policy).** A limited
`adapter_status` is permitted only where measured evidence shows a genuine official-source
limitation, and declaring one obliges this ticket to fill `INGF-07`'s `limitation` block — `state`, a
closed-set `reason_code`, a `reason_detail` saying why full coverage is unavailable, at least one
`evidence` entry, an `affected` scope of dates or collections, and the `customer_visible_warning`
that also appears as a customer-visible `known_gaps` entry. Composition fails otherwise. A limited
state is never a way to describe unfinished work, never grounds for dropping a collection, and never
grounds for substituting an unofficial source or a commercial headnote. `GOLD-16` consolidates the
evidence and Gate 2 is verification and sign-off, not scope reduction.

1. **An official entry has no machine-readable change-detection capability** → declare
   `change_detection.capability: NONE` → `INGF-07` derives **`FRESHNESS_LIMITED`** — plus a
   `known_gaps` entry with `customer_visible: true`, recorded in
   `docs/prd/10-sources-future/README.md`. PRD §12.1 *"rather than a false guarantee"*; PRD §7 fixes
   the vocabulary; PRD §44.4 forbids a silent downgrade.
2. **Licensing does not permit storage, indexing or quotation** → `METADATA_AND_LINK_ONLY` (or
   `UNCLEAR_RESTRICTED`/`REVIEW_REQUIRED`, PRD §11.1) and `adapter_status: LICENSING_RESTRICTED` with
   a customer-visible gap, recorded in the sub-PRD. Never substitute a non-official source (PRD §6.1).
3. **A whole collection named in the §40.6 row is unavailable** → `SOURCE_UNAVAILABLE` for that
   endpoint with a customer-visible gap; a whole-group failure is a group-level `SOURCE_UNAVAILABLE`
   carrying its full `limitation` block under the confirmed plan §8 **Q10** policy — `GOLD-16`
   consolidates the evidence, `LNCH-05` verifies the disclosure, and Gate 2 is the Founder's
   verification and sign-off, not a scope decision.
4. **`leg-sa` already emits proclamation or bill documents**, contradicting sub-PRD **D1** (open
   question **F4**) — the most likely place in wave 5 for this to happen → stop before emitting.
   Writeback to `docs/prd/10-sources-future/README.md` **D1** and
   `docs/prd/06-sources-legislation/README.md`, naming which group keeps which document class; a
   module-boundary move is a `docs/prd/breakdown-plan.md` §4/§5 change and an escalation. Do **not**
   emit "just in case": PRD §40.9 flags duplicate stable identities and the corpus would show one
   proclamation twice.
5. **A §40.6 status event has no canonical `event_type` member** (sub-PRD **F3**) → add it under
   `FND-03`'s rules and map it in `SFUT-01`'s `future.events`. Never a locally-invented string.
6. **The "amends" link cannot be expressed as `future.amends` metadata** → sub-PRD **F2**: writeback
   to `docs/prd/04-corpus-contract/README.md` + the `CRPS-01` ticket, then `SFUT-01` deliverable 7.
7. **A DoD item genuinely does not apply** → `NOT_APPLICABLE` **with a recorded reason** in
   `conformance.yaml`. Deferral stays limited to item 11; an item impossible for a whole class of
   sources is a PRD §40.8 change — escalate under PRD §45.5.
8. **Resource ceilings (DoD 12) are exceeded** → raise this group's ceiling with the measurement as
   justification; a 52-group aggregate threat to PRD §39.2's 2 GiB budget is `RLSE-11`'s decision
   (plan §8 Q3).

**Escalation rule.** If this group cannot satisfy PRD §6.5's separation invariant — if any emitted
record can be eligible in current-law mode — stop and escalate. That falsifies `SFUT-01`'s model, on
which all nine wave-5 groups, PRD §43.3's zero-tolerance date/status gates and PRD §26's corpus
Definition of Done depend. Never weaken the separation checks inside this ticket.
