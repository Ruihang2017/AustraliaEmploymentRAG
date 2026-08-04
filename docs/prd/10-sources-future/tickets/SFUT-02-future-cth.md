---
id: SFUT-02
title: FUTURE-CTH
module: 10-sources-future
lane: 10-sources-future
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [SFUT-01, SLEG-02]
blocks: [GOLD-13, GOLD-16]
---

# SFUT-02 — `FUTURE-CTH`

Implements PRD §40.6 (wave 5 — `FUTURE-CTH`), PRD §6.5 (future and proposed law) and PRD §40.8
(adapter Definition of Done) &lt;SRCH-002, ADM-001&gt; — no ADR — the decision is already made in PRD
§40.6; this is build ticket 2 of 10 against it.
Parent sub-PRD: [10-sources-future README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [SFUT-01 — Future-status event model and current/future separation](SFUT-01-future-status-event-model-and-current-future-separation.md),
and `SLEG-02` — `LEG-CTH` (Federal Register of Legislation), module `06-sources-legislation`,
file-scope `pipelines/adapters/leg-cth/**` (`docs/prd/06-sources-legislation/tickets/`).
**Why `builder`:** one source adapter inside its own directory against a frozen framework contract —
PRD §44.3 calls individual source adapters the *"safe parallel work units"*; not a new subsystem
decision.

## Background + basis

**The PRD §40.6 row this ticket implements, verbatim:**

| Group ID | Official entries | Required status events |
|---|---|---|
| `FUTURE-CTH` | Parliament Bills and Legislation plus Federal Register | introduced/passed/assented, enacted-not-commenced, commencement, disallowance, explanatory material |

**PRD §40.6 closes with the labelling rule:**

> "Each future item links to the legislation it would amend where deterministically supported. The UI
> labels `BILL_NOT_ENACTED`, `ENACTED_NOT_IN_FORCE` or `DRAFT_OR_CONSULTATION` with the relevant
> dates and never calls it current law."

**PRD §6.5 is the invariant:**

> "Future/proposed material MUST be stored and searchable but MUST be separated from current-law
> answers and visibly labelled."

**PRD §6.7 is the default:**

> "Default answers MUST use only material in force at the requested legal date unless the user
> explicitly requests historical, future or proposed material."

**The register anchor.** PRD §40.2's `LEG-CTH` row names the Federal Register of Legislation —
<https://www.legislation.gov.au/> — with families *"Acts, regulations/instruments, compilations,
as-made, amendments, commencement, repeal, histories"*. That register is `SLEG-02`'s. PRD §40.6
adds *"Parliament Bills and Legislation"* — the Commonwealth Parliament's bills pages — as this
group's second official entry. **PRD §40.1 requires this ticket to expand those two named entries
into exact collections:** *"The live Source Coverage Registry will expand each group into exact
collections/endpoints, licence snapshots, formats, counts, date bounds, schedules and gaps."* The
PRD names no parliament URL; the Builder discovers the exact official endpoints and records them in
`registry.yaml` — an entry name is not an endpoint.

**The ownership cut (sub-PRD D1) — read this before writing `identify()`.** `LEG-CTH` (`SLEG-02`)
owns Acts, regulations, instruments, compilations and their in-force versions and commencement
tables. `FUTURE-CTH` owns the **pre-enactment pipeline**: bill texts and prints, explanatory
memoranda, exposure drafts and draft instruments, official consultation documents, and separately
published commencement/proclamation and disallowance notices — plus the §40.6 status events on those
documents. This adapter must **not** emit a `document_version` for an Act or a legislative
instrument; `SFUT-01`'s separation validator enforces that mechanically (check `S2`,
`FUTURE_DOCUMENT_TYPE_FORBIDDEN`). If the merged `leg-cth` adapter already emits bill documents, stop
and follow *Feedback obligation* item 4 — sub-PRD open question **F4**.

**Disallowance is Commonwealth-specific and is in this row.** A disallowable legislative instrument
can be disallowed by either House within the statutory period; a disallowed instrument does not
operate. `SFUT-01` provides `FutureEventKind.DISALLOWANCE` and rule 2 of `derive_future_status()`
(an evidenced disallowance yields `BILL_NOT_ENACTED` for the proposal record). Asserting
disallowance without an evidenced notice is exactly the *"false guarantee"* PRD §12.1 forbids.

**Commencement is frequently not fixed.** `SFUT-01`'s `CommencementSpec` records the mechanism and
`resolve_commencement()` returns `None` for `BY_PROCLAMATION_UNSET` and `CONDITIONAL_UNSET`. A `None`
commencement is rendered as "not yet fixed", never substituted with a retrieval date (sub-PRD **D4**;
PRD §43.3 makes date critical errors a zero-tolerance gate).

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
(PRD §45.4: *"Changes to source adapters include the twelve-item adapter Definition of Done."*).

**Employment scope.** PRD §40.2 scopes wave 1 to *"employment-related titles and their necessary
amending, commencement, transitional and interpretation instruments—not every unrelated law in each
register"*, maintained as *"a subject/title allowlist plus dependency expansion"* — `SLEG-01`'s
primitive. The same scope applies here: this adapter tracks proposals touching the PRD §6.2
Commonwealth scope (Fair Work Act, regulations and NES; awards and agreements; PAYG/STP/FBT/
superannuation and Payday Super; employment-related migration and right-to-work; employment-related
privacy, surveillance and whistleblowing; Commonwealth public-sector employment), and records why
each tracked title is in scope.

**Downstream.** This ticket `blocks` `GOLD-13` — *"Cases: historical, future, commencement and
transitional traps (30)"*, 18/6/6, PRD §43.1 — and `GOLD-16` (full-roster reconciliation), plan §6.2.
`GOLD-13` is the only evaluation category that depends on a wave-5 adapter, so this group's
`evaluation_subset_ref` ids must be stable and non-empty even though `evals/**` does not exist yet
(sub-PRD **F8**).

**Carried caveats.** DoD item 11 may be `DEFERRED(GOLD-16)` with a recorded `conformance.yaml`
reason and nothing else may be deferred (`INGF-09` deliverable 4).

**Per-source anomaly thresholds are baseline-selected, not guessed (plan §8 Q9).** PRD §40.9's ±10%
collection-count change and >2% parse-failure figures are **initial defaults**. This ticket records
the group's values in `conformance.yaml` and may tighten or replace the percentages once it has a
representative baseline — overrides are tighten-only. Critical identity, time, mandatory-source and
citation failures are unconditional blockers whatever the percentages are, and `GOLD-16` consolidates
and verifies the final per-source thresholds.

**The limited-state launch policy is settled — plan §8 Q10 is confirmed policy (sub-PRD D12).**
No mandatory source group is pre-selected for omission or reduced implementation; `FUTURE-CTH` must be
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

Implement the `FUTURE-CTH` source adapter under `pipelines/adapters/future-cth/**`: a
`registry.yaml` row decomposing "Parliament Bills and Legislation plus Federal Register" into exact
official collections, an `allowlist.yaml`, a licence snapshot and assessment per authority, and an
`adapter.py` exposing `ADAPTER: SourceAdapter` that implements PRD §40.7's eight boundaries over
Commonwealth bills, explanatory memoranda, exposure drafts/consultations and commencement/
disallowance notices — emitting only proposal documents with PRD §6.7 non-current statuses derived
from evidenced events via `_shared/future`, with recorded fixtures sufficient for all twelve PRD
§40.8 DoD items to pass offline through `INGF-09`'s conformance kit and for `SFUT-01`'s separation
suite to prove zero current-law eligibility at three legal dates.

## Non-goals

- **No Acts, regulations, instruments, compilations or in-force versions** — `SLEG-02` (`leg-cth`),
  sub-PRD **D1**.
- **No shared future primitives** — `SFUT-01` owns `_shared/future/**`; no copy of a status,
  commencement or separation rule may appear here (plan §9 **R2**).
- **No shared legislation primitives** — `SLEG-01` owns `_shared/legislation/**`.
- **No framework code** — fetching, hashing, artifact storage, licence gating, parsing, quarantine and
  run accounting are `INGF-02`…`INGF-06`, reached only through the injected ports on
  `AdapterRunContext` (`INGF-01`). This adapter imports no HTTP or parsing library (PRD §37.4,
  enforced by `INGF-01`'s architecture scan).
- **No third-party consultation submissions**, Hansard, committee reports or media releases about
  bills — sub-PRD **D6**; PRD §6.1 (*"Only official public sources are eligible"*), PRD §10.1.
- **No corpus writes** — PRD §40.7: *"The adapter never writes active corpus tables directly."*
- **No evaluation cases or gold data** — `GOLD-13`/`GOLD-16`; `evals/gold/**` must never be read
  (plan §9 R9, PRD §45.1 item 6).
- **No live network in tests.** Item 2's *"live dry-run evidence"* is a recorded artifact committed
  here; the kit validates its shape and age, it does not perform the run (`INGF-09` non-goals).
- **No customer-facing screens or admin console** — `FIND-05`, `INTL-02`.

## File-scope (write-owns)

- `pipelines/adapters/future-cth/**` — the whole group directory, in the layout `INGF-07`
  deliverable 1 fixes: `registry.yaml`, `allowlist.yaml`, `licence.yaml`, `licence-snapshots/`,
  `conformance.yaml`, `adapter.py`, `fixtures/**`, `tests/**`.
- `pipelines/adapters/pyproject.toml` — **append-only**; conflicts resolve by re-running `uv lock`,
  never by hand-merge (plan §1.1, PRD §44.3, sub-PRD F7).
- Does not touch: `pipelines/adapters/_shared/future/**` — `SFUT-01` (imported read-only).
- Does not touch: `pipelines/adapters/_shared/legislation/**`, `pipelines/adapters/leg-cth/**` and the
  other eight `leg-*` directories — module `06-sources-legislation`.
- Does not touch: `pipelines/adapters/future-{nsw,vic,qld,wa,sa,tas,act,nt}/**` — `SFUT-03`…`SFUT-10`.
- Does not touch: `pipelines/ingestion/**`, `pipelines/corpus-builder/**`, `pipelines/evaluation/**`,
  `evals/**`, `schemas/**`, `packages/**`, `apps/**`, `services/**`, `tests/**`, `infra/**`.

**Serial safety.** First decomposition; nothing merged, nothing in flight. `SFUT-01` (this module's
wave 1) and `SLEG-02` have landed. The eight sibling adapter tickets `SFUT-03`…`SFUT-10` may run
concurrently: each writes only its own `pipelines/adapters/future-<juris>/` directory, so the
write-sets are disjoint by directory. The nine share exactly two paths — `_shared/future/**`, which
they only read and which is owned by `SFUT-01` (all nine are `blocked_by` it), and the append-only
`pipelines/adapters/pyproject.toml`. Adapter tickets in modules `07`–`09` may also be concurrent;
their directories are likewise disjoint.

## Deliverables

1. **`registry.yaml`** (schema and validator: `INGF-07`) with `group_id: FUTURE-CTH`, `wave: 5`,
   the authority list (the Commonwealth register authority and the Parliament authority, D10 —
   multiplicity inside one file), and `official_endpoints` decomposing PRD §40.6's two named entries
   into exact collections, each with `kind` (`LISTING|FEED|API|SITEMAP|MANIFEST|DOCUMENT`) and
   `material_class` (`LAW|OPERATIVE_INSTRUMENT|DECISION|CODE|GUIDANCE|POLICY|NEWS`).
   `document_coverage.families` covers bills and bill prints, explanatory memoranda, exposure
   drafts/draft instruments, consultation documents and commencement/disallowance notices;
   `financial_years` covers at least PRD §6.6's three (`2024-25`, `2025-26`, `2026-27`) or a
   `known_gaps` entry with `customer_visible: true` says why not.
   `initial_index_tier: T3` (sub-PRD **D8**; PRD §40.6 declares no tier, `CRPS-04` assigns the real
   one). `change_detection` per sub-PRD **D9**. `evaluation_subset_ref` non-empty (F8).
   `adapter_status` is `ACTIVE` or one of PRD §7's four limited states with a customer-visible gap —
   never `NOT_STARTED`/`PLANNED_NOT_ACTIVE` at merge (PRD §40.1).
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

2. **`allowlist.yaml`** (schema: `INGF-02`) listing the exact official hosts/path prefixes for those
   endpoints and **excluding** any third-party-submission repository (sub-PRD **D6**; enforced by
   `SFUT-01` check `S8`).
3. **`licence.yaml` + `licence-snapshots/`** (schema and capture CLI: `INGF-04`) — one
   `LicenceAssessment` per authority covering PRD §11.1's nine decision axes; unclear rights collapse
   to metadata/link-only *"Unclear rights default to metadata, limited quotation and official links"*.
4. **`adapter.py`** exposing module-level `ADAPTER: SourceAdapter` (`INGF-01` deliverable 9),
   implementing PRD §40.7's eight boundaries:
   - `discover` — the register's and Parliament's official listings/feeds, filtered to the PRD §6.2
     employment scope through `_shared/legislation`'s title allowlist; emits `RemoteDescriptor`s with
     stable `descriptor_key`s;
   - `fetch` — through `ctx.fetcher` only, with conditional-request validators;
   - `identify` — deterministic `StableDocumentIdentity` for a proposal document; the identity is
     stable across bill **prints** (a later print is a new version of the same document, not a new
     document) and never collides with a `leg-cth` identity;
   - `parse` — through `ctx.parser` (`INGF-06`) for HTML/XML/PDF, exact-offset blocks;
   - `normalise` — `DocumentVersion + NodeVersions` with `document_type` from
     `PROPOSAL_DOCUMENT_TYPES` and `legal_status` from `derive_future_status()`;
   - `extract_events` — `INTRODUCED`, `PASSED`, `ASSENTED`, `COMMENCEMENT`, `DISALLOWANCE`,
     `PROCLAMATION_MADE`, `DRAFT_PUBLISHED`, `CONSULTATION_OPENED/CLOSED`, `LAPSED`, `WITHDRAWN` via
     `_shared.future.events.build_event`, each with an `evidence_ref` into this document's own parsed
     text;
   - `extract_relations` — intra-document relations only; the "amends" link travels as
     `future.amends` metadata (sub-PRD **D5**);
   - `validate` — runs `_shared/legislation`'s checks plus `FutureSeparationValidator`, returning
     `ValidationFindings`.
5. **`future.*` metadata** on every emitted record, built with
   `_shared.future.metadata.build_future_metadata()`: status, the status's required dates, the
   `commencement` object (mechanism + `resolved_date`, which may legitimately be `null`), the
   `consultation` block where applicable, and `amends` links.
6. **Discovery fixtures** under `fixtures/discovery/` plus `fixtures/dry-run.json`
   (`{run_at, descriptors_discovered, sample_urls, tool_versions}`, `run_at` within
   `DRY_RUN_MAX_AGE_DAYS = 180`) — DoD item 2.
7. **Identity/deletion rules** — DoD item 3: `identify()` deterministic across two calls and across
   two prints of the same bill; a withdrawn/removed listing yields a `REMOVED` finding and retains
   the prior version (never deletes history).
8. **Document fixtures** under `fixtures/documents/` covering every media type declared in
   `AdapterMeta.supported_content_types` (at minimum HTML and PDF for explanatory memoranda), all
   free of personal data, cookies, `Authorization` headers and credentials — DoD item 4.
9. **Parser/node round-trip** — DoD item 5: `assert_roundtrip()` (`INGF-06`) passes; one root, no
   cycles, contiguous sibling `ordinal`s, `text_hash` recomputes from `canonical_text`.
10. **Three time points** under `fixtures/timepoints/` — DoD item 6 — chosen to span the wave-5
    transition: **(a)** before introduction, **(b)** after assent and before commencement, **(c)**
    after the evidenced commencement. At all three the emitted records stay non-current
    (sub-PRD **D2**).
11. **Incremental matrix** — DoD item 7: no-change (304 → 0 fetched, `last_successful_change_scan_at`
    advanced, `last_content_ingestion_at` unchanged), changed (new print emitted, prior version's
    `effective_to` closed), removed, transient failure (bounded retry → `PARTIAL` run, no content
    quarantine).
12. **`fixtures/baseline.json`** — DoD item 8: per-collection `{count, content_hash_set_sha256,
    captured_at}` reproduced exactly by the replayed run, plus `conformance.yaml`
    `anomaly_overrides` that only tighten `INGF-05`'s policy (never downgrade a BLOCK), with the
    measurement as justification (plan §8 Q9).
13. **Freshness schedule** — DoD item 9: `change_detection.{capability,cadence}` in `registry.yaml`,
    proven by a replayed 304 run and a replayed content run writing **different** fields
    (PRD §12.1's last-check/last-ingest separation).
14. **Quarantine cases** under `fixtures/quarantine/` — DoD item 10: at least one deliberately
    defective artifact per code in `AdapterMeta.declared_quarantine_reasons`, each with a defined
    operator action in `INGF-05`'s reason table.
15. **`conformance.yaml`** — `resource_ceilings`, `anomaly_overrides`, and
    `deferred_items: [11]` with a recorded reason (`"Evaluation cases authored in GOLD-13/GOLD-16"`)
    — the only permitted deferral (`INGF-09` deliverable 4; sub-PRD F8).
16. **Measured resources** — DoD item 12: `storage_bytes`, `parse_wall_ms`,
    `index_size_estimate_bytes`, `peak_rss_bytes` recorded in the committed
    `conformance-report.json`, each within its ceiling (PRD §39.2's 2 GiB host budget makes these
    release inputs).
17. **`tests/test_conformance.py`** — the five-line `ConformanceTestCase` subclass (`INGF-09`
    deliverable 1) — and **`tests/test_separation.py`**, calling
    `_shared.future.conformance.assert_future_separation(group_dir, legal_dates=[...])` and
    `assert_no_cross_adapter_import(group_dir)`. This is the PRD §44.2 `E16` exit evidence for this
    group.

## Acceptance checklist (classified)

**PRD §40.8 twelve-item adapter Definition of Done** (plan §1.1 maps §40.8 adapter fixtures to
`[fixture]`; all twelve are discharged by `INGF-09`'s kit against recorded fixtures):

- [ ] `[fixture]` **DoD 1** — `registry.yaml`, `allowlist.yaml` and `licence.yaml` exist and validate;
      `FUTURE-CTH` is in `MANDATORY_SOURCE_GROUPS`; the directory name is `future-cth`; every licence
      snapshot's SHA-256 matches `terms_sha256`; every `official_endpoints` URL passes the allowlist
      (**this group's Source Coverage Registry row**, PRD §6.1, §40.8 item 1).
- [ ] `[fixture]` **DoD 2** — recorded discovery responses replay through `discover()` yielding ≥1
      `RemoteDescriptor` with a non-empty `descriptor_key` and an allowlisted URL; `dry-run.json` is
      present and within `DRY_RUN_MAX_AGE_DAYS`.
- [ ] `[fixture]` **DoD 3** — `identify()` is deterministic across two calls and across two prints of
      one bill; different documents yield different keys; a removed descriptor yields `REMOVED` and
      deletes no prior state.
- [ ] `[fixture]` **DoD 4** — fixtures cover every declared media type and the no-customer-data scan
      is clean (no TFN, personal email/phone, `Set-Cookie`, `Authorization: Bearer`, `.env`-shaped
      content).
- [ ] `[fixture]` **DoD 5** — every document fixture parses through `ParserHost`;
      `assert_roundtrip()` passes; hierarchy has one root, no cycles, contiguous sibling ordinals; every
      `text_hash` recomputes (PRD §15.3).
- [ ] `[fixture]` **DoD 6** — three declared legal dates produce the expected `legal_status` from PRD
      §6.7's seven-value set, distinguish `event_date` from `effective_date` (PRD §15.2), and produce
      no overlapping effect intervals.
- [ ] `[fixture]` **DoD 7** — the four incremental scenarios (no-change / changed / removed /
      transient failure) each produce their expected run counts and status; the transient case creates
      **no** content quarantine item.
- [ ] `[fixture]` **DoD 8** — the replayed run reproduces `baseline.json` exactly; declared
      `anomaly_overrides` pass `INGF-05`'s tighten-only policy.
- [ ] `[fixture]` **DoD 9** — a replayed 304 run and a replayed content run write different freshness
      fields; `last_content_ingestion_at` does not advance on a 304 (PRD §12.1).
- [ ] `[fixture]` **DoD 10** — every declared quarantine reason has ≥1 fixture producing exactly that
      code, and every code has a non-empty operator action (ADM-001).
- [ ] `[fixture]` **DoD 11** — `registry.yaml.evaluation_subset_ref` is non-empty and well-formed;
      recorded as `DEFERRED` with the `conformance.yaml` reason until `evals/**` exists — the only
      permitted deferral (sub-PRD F8; `INGF-09` deliverable 4).
- [ ] `[fixture]` **DoD 12** — storage, parse time, index-size estimate and peak RSS are recorded and
      within the declared ceilings (PRD §39.2).
- [ ] `[fixture]` `python -m <root>.conformance check pipelines/adapters/future-cth` exits 0 in strict
      mode and the resulting `conformance-report.json` is committed (PRD §45.4).

**PRD §44.2 `E16` exit evidence — current/future separation tests:**

- [ ] `[fixture]` `assert_future_separation()` over this group's own replayed fixtures at all three
      DoD-6 legal dates returns no findings: no record is eligible in `CURRENT_LAW` mode, while
      `INCLUDE_FUTURE` returns them (PRD §6.5 "stored and searchable … separated from current-law
      answers"; PRD §6.7; PRD §36.2).
- [ ] `[machine]` No emitted record carries `legal_status: IN_FORCE`, `REPEALED` or `SUPERSEDED`, and
      no emitted `document_type` is outside `PROPOSAL_DOCUMENT_TYPES` — checks `S1`/`S2`
      (sub-PRD **D1**, **D2**).
- [ ] `[machine]` Every asserted status is supported by an evidenced `legal_event`; an
      evidence-stripped fixture yields `STATUS_UNCONFIRMED`, not a status (check `S3`; PRD §15.2).
- [ ] `[machine]` A commencement expressed as "a day to be fixed by proclamation" produces
      `resolved_date: null` and status `ENACTED_NOT_IN_FORCE`; no fixture path fabricates a date
      (check `S4`; sub-PRD D4; PRD §43.3 date critical errors must be 0).
- [ ] `[machine]` An evidenced **disallowance** fixture yields `BILL_NOT_ENACTED` for the affected
      proposal and never an in-force status (PRD §40.6 row; `SFUT-01` derivation rule 2).
- [ ] `[machine]` Every emitted record's `future.*` block carries its status's required dates
      (check `S5`; PRD §40.6 "with the relevant dates").
- [ ] `[machine]` `future.amends` links are emitted only with exact evidence offsets and a
      deterministic derivation; a model-suggested derivation is rejected (check `S7`; PRD §40.6
      "where deterministically supported", PRD §35.2).
- [ ] `[machine]` The allowlist admits no third-party submission repository and no record's
      `provenance.official_url` matches one (check `S8`; sub-PRD **D6**; PRD §6.1, §10.1).
- [ ] `[machine]` `assert_no_cross_adapter_import()` passes: this adapter imports `_shared/**` and the
      ingestion framework only, never `pipelines/adapters/leg-cth` or a sibling group (sub-PRD D7).
- [ ] `[machine]` `python -m <root>.registry validate pipelines/adapters/future-cth` exits 0 and the
      declared `adapter_status` is `ACTIVE` or a PRD §7 limited state with a `known_gaps` entry marked
      `customer_visible: true` (PRD §7, §40.1, §44.4).
- [ ] `[machine]` **A limited status is only representable with its evidence.** When `adapter_status`
      is one of the four limited states, `registry.yaml` carries `INGF-07`'s `limitation` block:
      `state` equal to `adapter_status`, a closed-set `reason_code`, a non-empty `reason_detail`, at
      least one `evidence` entry, an `affected` scope naming dates or collections, and a
      `customer_visible_warning` that also appears as a `customer_visible: true` gap; a non-limited
      status carries `limitation: null`. Deleting any one of those from a scratch copy makes
      composition fail with the matching `REGISTRY_LIMITATION_*` code. The recorded evidence must
      describe a genuine official-source limitation — unfinished work is not one (plan §8 **Q10**,
      confirmed policy; sub-PRD **D12**; `INGF-07` deliverables 3 and 6).
- [ ] `[machine]` This adapter imports no HTTP or document-parsing library and no database module —
      `INGF-01`'s architecture scan is green over `pipelines/adapters/future-cth/**` (PRD §37.4,
      §39.1, §40.7; SEC-002).
- [ ] `[machine]` No path under `evals/gold/**` is opened during the suite (plan §9 R9, PRD §45.1
      item 6).
- [ ] `[machine]` The whole suite runs offline with no outbound network.
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, §20.3).
- [ ] `[machine]` `pnpm test` green — standing suite item; this ticket adds no TypeScript, so the
      expectation is "unchanged and green" (plan §1.1, PRD §45.3).
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (**SRCH-002** data-side,
      **ADM-001** registry row); UAT IDs (`UAT-SRCH-02` — this group supplies the
      `ENACTED_NOT_IN_FORCE` material the script needs; the screen behaviour is `FIND-04`'s);
      schema/API/event compatibility (none — no shared schema changes); tenant/PII/security impact
      (submission material excluded, fixtures scanned, fetches allowlisted); source/licence impact
      (new licence snapshot + assessment per authority; any `METADATA_AND_LINK_ONLY` outcome named);
      cost/memory/latency impact (the DoD-12 measurements); rollback path (remove the group directory;
      the registry composer then reports `MANDATORY_GROUP_MISSING`, which is the correct loud
      failure); known gaps (`known_gaps` rows, sub-PRD F1–F4, F8).
- [ ] `[human]` **Founder review of the coverage claim**: are the decomposed collections, date bounds
      and `known_gaps` an honest description of Commonwealth future/proposed employment law? PRD §6.1
      forbids claiming complete coverage and PRD §44.4 forbids silently calling a category covered;
      PRD §43.4 item 4 puts source anomalies in the founder review queue. Irreducibly human judgment.
- **No further `[fixture]` classes** beyond the twelve DoD items and the separation replay — every
  other check is pure logic over recorded records. Declared explicitly.

## Test plan

Harness: `uv run pytest pipelines/adapters/future-cth -q`, fully offline. Recorded responses are
served by `INGF-09`'s `ReplayFetcher` (which also applies this group's `allowlist.yaml`, so a fixture
cannot legitimise an off-allowlist URL) with `ReplayClock` and an in-memory `RecordSink` inside
`replay_context`. Copy the construction pattern from `INGF-09`'s reference adapter
(`pipelines/ingestion/src/<root>/conformance/reference/demo-registry/`) — it is the canonical example
and exists precisely so an adapter Builder need not read another adapter.

1. `uv sync --frozen && uv run pytest pipelines/adapters/future-cth -q`.
2. **`tests/test_conformance.py`** `[fixture]` — the inherited twelve `test_dod_NN_*` methods, all
   `PASS` except item 11 `DEFERRED`; then
   `python -m <root>.conformance check pipelines/adapters/future-cth --report conformance-report.json`
   exits 0 and the report validates against `conformance-report.schema.json`.
3. **`tests/test_separation.py`** `[fixture]`/`[machine]` — `assert_future_separation()` at the three
   DoD-6 legal dates; then per-check assertions for `S1`–`S8` using locally mutated copies of this
   group's fixtures in `tmp_path` (never mutating the committed fixtures).
4. **`tests/test_status.py`** — the bill lifecycle: before introduction → `STATUS_UNCONFIRMED`;
   after introduction → `BILL_NOT_ENACTED`; after assent → `ENACTED_NOT_IN_FORCE`; after an evidenced
   disallowance → `BILL_NOT_ENACTED`. Asserts `IN_FORCE` never appears.
5. **`tests/test_commencement.py`** — the proclamation-unset fixture: `resolved_date is None`, status
   `ENACTED_NOT_IN_FORCE`, and the `S4` negative control (a fixture whose commencement date has no
   evidence) fails.
6. **`tests/test_identity.py`** — determinism across two prints; no collision with a `leg-cth`-shaped
   key; `REMOVED` behaviour.
7. **`tests/test_registry.py`** — `python -m <root>.registry validate pipelines/adapters/future-cth`
   exits 0; `adapter_status` is releasable; a limited status carries a customer-visible gap.
8. **`tests/test_architecture.py`** — the forbidden-import scan and
   `assert_no_cross_adapter_import()`.
9. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus (security- and correctness-sensitive paths): run the `S1`–`S8` mutations first — if a
contaminated copy still passes, the group's separation evidence is vacuous and the ticket is not
done. Then confirm (a) no fixture path produces a commencement date without evidence, (b) no emitted
`document_type` overlaps `leg-cth`'s Acts/instruments, (c) the allowlist contains no submission
repository and no non-official host, and (d) `conformance.yaml` defers item 11 and nothing else.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (a docs PR/MR,
a changelog line in `docs/prd/10-sources-future/README.md`, then `publish-tickets.mjs --sync`), and
only then change code. Silent divergence is an incomplete ticket; the ticket wins over any
implementation plan (CLAUDE.md, issue #53).

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

1. **An official entry named in PRD §40.6 has no machine-readable change-detection capability** (no
   feed, API, sitemap, manifest or conditional requests) → declare `change_detection.capability: NONE`
   in `registry.yaml`, which `INGF-07` derives to **`FRESHNESS_LIMITED`**, and add a `known_gaps`
   entry with `customer_visible: true`. Record the limitation in
   `docs/prd/10-sources-future/README.md`. PRD §12.1: *"Sources without reliable delta mechanisms
   MUST show `FRESHNESS_LIMITED` rather than a false guarantee"*; PRD §7 fixes the vocabulary. Never
   a silent downgrade — PRD §44.4: *"It is not permitted to silently call an unimplemented source
   category covered."*
2. **Licensing does not permit storage, indexing or quotation of a collection** → the licence
   assessment becomes `METADATA_AND_LINK_ONLY` (or `UNCLEAR_RESTRICTED`/`REVIEW_REQUIRED`, PRD §11.1)
   and the group's `adapter_status` becomes **`LICENSING_RESTRICTED`** with a customer-visible gap.
   Record it in `docs/prd/10-sources-future/README.md`. Do not reduce the group's scope silently and
   do not substitute a non-official source (PRD §6.1, §11.1).
3. **A whole collection named in the §40.6 row is unavailable** → `SOURCE_UNAVAILABLE` for that
   endpoint with a customer-visible gap; the group may still be `ACTIVE` for what it does cover. If
   the entire group is unavailable, that is a group-level `SOURCE_UNAVAILABLE` carrying its full
   `limitation` block under the confirmed plan §8 **Q10** policy — `GOLD-16` consolidates the
   evidence, `LNCH-05` verifies the disclosure, and Gate 2 is the Founder's verification and
   sign-off, not a scope decision. Do not invent a status value; PRD §7 fixes the four.
4. **`leg-cth` already emits bill documents**, contradicting sub-PRD **D1** (open question **F4**) →
   stop before emitting. Writeback to `docs/prd/10-sources-future/README.md` **D1** and
   `docs/prd/06-sources-legislation/README.md`; if the module boundary moves, that is a
   `docs/prd/breakdown-plan.md` §4/§5 change and an escalation, not a local fix.
5. **A §40.6 status event has no canonical `event_type` member** (sub-PRD **F3**) → add it under
   `FND-03`'s rules (`packages/contracts`, the `prd-enums` fixture, `docs/prd/00-foundation/README.md`
   D6) and map it in `SFUT-01`'s `future.events`. Never emit a locally-invented string.
6. **The "amends" link cannot be expressed as `future.amends` metadata** → sub-PRD **F2**: the
   writeback is `docs/prd/04-corpus-contract/README.md` + the `CRPS-01` ticket, then `SFUT-01`
   deliverable 7. Do not add a cross-source `node_relation` locally.
7. **A DoD item genuinely does not apply to this group** (for example a media type the source never
   publishes) → `NOT_APPLICABLE` **with a recorded reason** in `conformance.yaml`, per `INGF-09`
   deliverable 4. Deferral remains permitted for item 11 only. If an item is impossible for a whole
   class of sources, that is a change to PRD §40.8 — escalate under PRD §45.5.
8. **Resource ceilings (DoD 12) are exceeded** → raise this group's ceiling in `conformance.yaml`
   with the measurement as justification and state the aggregate in the PR's cost/memory line; if the
   52-group aggregate threatens PRD §39.2's 2 GiB budget, that is `RLSE-11`'s benchmark decision
   (plan §8 Q3).

**Escalation rule.** If this group cannot be made to satisfy PRD §6.5's separation invariant — if any
emitted record can be eligible in current-law mode — stop and escalate. That is not an adapter defect
but a falsification of `SFUT-01`'s model, on which all nine wave-5 groups, PRD §43.3's zero-tolerance
date/status gates and PRD §26's corpus Definition of Done depend. Never weaken the separation checks
inside this ticket.
