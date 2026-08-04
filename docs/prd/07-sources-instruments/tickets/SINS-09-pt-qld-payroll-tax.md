---
id: SINS-09
title: "`PT-QLD` payroll tax"
module: 07-sources-instruments
lane: 07-sources-instruments
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [SINS-01, SLEG-05]
blocks: [GOLD-08, GOLD-16]
---

# SINS-09 — `PT-QLD` payroll tax

Implements PRD §40.3 (wave-2 source group `PT-QLD`), PRD §6.3 (state and territory scope) and PRD
§40.8 (adapter Definition of Done) <`ADM-001`, `SRCH-002`> — **No ADR — the decision is already made
in PRD §40.3; this is build ticket 9 of 14 against it.**
Parent sub-PRD: [07-sources-instruments README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [SINS-01 — Date-versioned rate/threshold fact model](SINS-01-date-versioned-rate-threshold-fact-model.md);
`SLEG-05` — `LEG-QLD`, module `06-sources-legislation`
(`docs/prd/06-sources-legislation/tickets/`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed adapter
contract (PRD §40.7), a fixed twelve-item gate (PRD §40.8) and a fixed rate model (`SINS-01`) — not a
new subsystem decision.

## Background + basis

**The PRD §40.3 row, verbatim:**

| Group ID | Official entry | Required artifacts | Initial tier |
|---|---|---|---|
| `PT-QLD` | Queensland Revenue Office — <https://qro.qld.gov.au/payroll-tax/overview/> | Rates/thresholds, **levy**, rulings, guides, **news** | T1 |

**This is the only payroll-tax row in PRD §40.3 that names a `levy`, and one of the few that names
`news`.** Both are load-bearing for this ticket: a levy is a **second, independent dated fact series**
that sits alongside the base rate and must not be folded into it, and a news/change-notice collection
is a **separate material class** (PRD §40.5: the registry "must … identify whether material is law,
operative instrument, decision, code, guidance, policy or news").

**Note what the row does not say (sub-PRD D7).** PRD §40.3 has no "Minimum adapter capability" column
and states no licensing. Change-detection capability and rights are **outcomes** of this ticket,
recorded in `registry.yaml` (`INGF-07`) and `licence.yaml` (`INGF-04`). PRD §12.1: *"Sources without
reliable delta mechanisms MUST show `FRESHNESS_LIMITED` rather than a false guarantee."*

**The limited-state launch policy is settled (plan §8 **Q10**, confirmed policy; sub-PRD **D11**).**
It governs what this ticket may record and is not a question this ticket reopens:

1. `PT-QLD` is a mandatory group and is attempted **in full** — never pre-selected for omission or
   reduced implementation, and never trimmed to make a release date easier. That applies to all eight
   payroll-tax jurisdictions equally, and to every required artifact in the row including the levy.
2. A limited state is permitted **only** where measured evidence shows a genuine limitation prevents
   `ACTIVE`: an official capability limit, the official body not publishing the material, a licensing
   restriction, historical material unavailable, a freshness limitation, or another real
   official-source constraint. The permitted states are PRD §7's four — `METADATA_AND_LINK_ACTIVE`,
   `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`.
3. Where one applies, `registry.yaml` carries `INGF-07`'s **`limitation` block**: `state` equal to
   `adapter_status`, a closed-set `reason_code`, a mandatory `reason_detail`, a non-empty `evidence[]`,
   an `affected` scope naming the affected dates or collections, and a `customer_visible_warning`.
   `INGF-07`'s composer fails in **every** mode without them. Silent omission is prohibited, and no
   unofficial source or commercial headnote may substitute for unavailable official material.
4. `GOLD-16` produces the measured evidence and the proposed registry state, `LNCH-05` verifies the
   launch statement discloses it accurately, and Gate 2 is verification and sign-off under this
   policy — not an opportunity to cut mandatory scope. A missing `E13` matrix cell is therefore
   reported with its evidence, never left blank and never quietly dropped.

**PRD §6.3 puts this in scope for all eight jurisdictions:** *"For NSW, Victoria, Queensland, Western
Australia, South Australia, Tasmania, the ACT and the Northern Territory: payroll tax legislation,
rates and official guidance; …"*

**The rate rule (PRD §40.3):**

> "Rates are date-versioned legal facts, not mutable fields. A displayed rate must cite its official
> date-specific source and applicable legislation/guidance role."

`SINS-01` owns that model (`pipelines/adapters/_shared/rates/**`) and this ticket is `blocked_by` it.
Nothing about the rate model is re-implemented here — plan §9 **R2**.

**Why `blocked_by SLEG-05`.** The "applicable legislation" half of the §40.3 sentence is not optional:
the rate and the levy are imposed under Queensland payroll-tax legislation, which `LEG-QLD`
(`SLEG-05`, module `06-sources-legislation`) puts in the corpus. This ticket is ordered after it in
plan §5.8 and §6.2 so every emitted fact can carry a **resolved** `legislation_ref` to a real
Queensland legislation node. For the eight payroll-tax groups an unresolved link is a **blocking**
finding of this adapter's own `validate()` — unlike `SINS-03`/`SINS-06` (sub-PRD **N6**).

**PRD §44.2 `E13` is this group's exit evidence** — *"Eight-jurisdiction historical fixture matrix"* —
and this ticket contributes **the Queensland row** across the three PRD §6.6 financial years
(2026-27, 2025-26, 2024-25), which are also its PRD §40.8 item-6 time points (sub-PRD **D8**). A
missing cell is a failure, never a blank (PRD §44.4).

**No value may be hardcoded (`SINS-01` sub-PRD D3).** `RateFact` construction fails unless the
declared value re-parses from its own quoted source span. A base rate, a levy rate, a levy threshold
or a deduction threshold the Builder "knows" but the committed fixture does not contain **cannot** be
emitted. A jurisdiction with two independent rate series is exactly where a recalled number gets
attached to the wrong series.

**Rulings and guides are subordinate authority (PRD §9.1)** — level 6, and *"Guidance MUST NOT
silently override legislation, an operative instrument or binding authority."* The adapter emits
`document_type` + `authority_key`, never a level; `FND-10` computes the hierarchy (sub-PRD **D5**,
PRD §45.2).

**PRD §40.7 fixes the interface** (eight boundaries; the adapter never writes corpus tables; it emits
versioned intermediate records with source URL, artifact hash and tool version; shared framework code
performs HTTP safety, hashing, artifact persistence, retry, licensing, metrics, quarantine and run
accounting).

**Carried caveats.** No HTTP or parser library (PRD §37.4, `05` sub-PRD D10, `INGF-01`
deliverable 11); extraction runs over `ParsedDocument.text`/`.blocks`. **Anomaly thresholds are
baseline-selected (plan §8 **Q9**):** PRD §40.9's ±10% count change and >2% parse failure are the
framework's **initial defaults**, refined per source once this group has a representative baseline;
this ticket may **tighten** them and never loosen them, a genuine need for a looser percentage is a
writeback to `INGF-05` rather than a local override, `GOLD-16` consolidates, and the critical
identity, time, mandatory-source and citation failures block unconditionally regardless of any
percentage.

## Goal

Deliver the `PT-QLD` source adapter under `pipelines/adapters/pt-qld/**`: the per-adapter
`registry.yaml`, `allowlist.yaml`, `licence.yaml` + immutable licence snapshot, an `adapter.py`
exposing `ADAPTER: SourceAdapter` with all eight PRD §40.7 boundaries over the Queensland Revenue
Office payroll-tax collections, **dated rate, threshold and levy facts emitted as separate `SINS-01`
`RateFact` series across the three PRD §6.6 financial years with resolved `legislation_ref`s into
`LEG-QLD`**, rulings and guides captured as subordinate authority with citable nodes, the news/change
collection captured with `material_class: NEWS`, a committed `fixtures/rate-matrix.json` contributing
the Queensland row of the PRD §44.2 `E13` matrix, and the complete PRD §40.8 fixture set — such that
`python -m <iroot>.conformance check pipelines/adapters/pt-qld` exits 0 in strict mode.

## Non-goals

- **No rate model changes.** `SINS-01` owns `_shared/rates/**` (plan §9 **R2**).
- **No Queensland legislation.** The payroll-tax Act and its instruments are `LEG-QLD` (`SLEG-05`,
  module `06`). This ticket **reads** those nodes to resolve `legislation_ref`; it emits no
  legislation document and no legislation event.
- **No other jurisdiction.** `PT-NSW`, `PT-VIC`, `PT-WA`…`PT-NT` are `SINS-07`, `SINS-08`,
  `SINS-10`…`SINS-14`.
- **No employment-adjacent Queensland regulators** — WHS Queensland/OIR, QHRC, WorkCover Queensland,
  Labour Hire Licensing Queensland and QLeave are `ADJ-QLD` (`SADJ-04`, module `09-sources-adjacent`).
- **No Queensland court, Industrial Court or QIRC decisions** — `CASE-QLD` (`SCAS-08`, module
  `08-sources-cases`).
- **No payroll-tax calculation, grouping determination or liability estimate** (PRD §3.3; PRD §11.2
  "MUST NOT state that a customer is definitely compliant").
- **No PRD §9.1 hierarchy computation** — `FND-10` (sub-PRD **D5**).
- **No evaluation cases or gold data** — `21-evaluation-600` (`GOLD-08`, `GOLD-16`); never read
  `evals/gold/**` (PRD §45.1 item 6, plan §9 R9).
- **No registry/allowlist/licence/conformance *schema* changes** — `INGF-07`, `INGF-02`, `INGF-04`,
  `INGF-09`. This ticket authors instances only, including any `limitation` block, whose fields and
  closed `reason_code` set are `INGF-07`'s and are never redefined here.
- **No launch-scope call and no reduction of this group's mandatory scope.** The limited-state policy
  is confirmed (plan §8 **Q10**, sub-PRD **D11**); this ticket supplies its own measured status and
  evidence, `GOLD-16` consolidates, and Gate 2 verifies.
- **No live network in tests.**

## File-scope (write-owns)

- `pipelines/adapters/pt-qld/**` — the whole group directory: `registry.yaml`, `allowlist.yaml`,
  `licence.yaml`, `licence-snapshots/`, `conformance.yaml` (optional), `adapter.py`, `fixtures/**`
  (including `fixtures/rate-matrix.json`), `tests/**`, `README.md`.
- Does not touch: `pipelines/adapters/_shared/**` — `SLEG-01`, `SINS-01`, `SCAS-01`, `SFUT-01`. This
  ticket **imports** `_shared/rates` read-only.
- Does not touch: `pipelines/adapters/pt-{nsw,vic,wa,sa,tas,act,nt}/**` — `SINS-07`, `SINS-08`,
  `SINS-10`…`SINS-14`.
- Does not touch: `pipelines/adapters/{fwc-docs,fwc-awards,fwc-agreements,fwo-guidance,ato-employment}/**`
  — `SINS-02`…`SINS-06`.
- Does not touch: `pipelines/adapters/leg-qld/**`, `adj-qld/**`, `case-qld/**`, `future-qld/**` —
  modules `06`, `09`, `08`, `10`. `leg-qld` is read-only from here.
- Does not touch: `pipelines/ingestion/**`, `pipelines/corpus-builder/**`, `schemas/**` — modules
  `05`, `04`, `00`.
- Does not touch: `evals/**`, `pipelines/evaluation/**` — `21-evaluation-600`.
- Does not touch: `packages/**`, `apps/**`, `services/**`, `tests/**`, `infra/**`,
  `.github/workflows/**`.
- `pipelines/adapters/pyproject.toml` (if it exists) — **append-only**, shared-additive; resolve
  conflicts by re-running `uv lock` (plan §1.1, PRD §44.3). Expected untouched (sub-PRD D9).

**Serial safety — the eight payroll-tax adapters are genuinely parallel.** First decomposition of
`docs/PRD.md`; **nothing is merged and no ticket is in flight**. `INGF-01`…`INGF-09`, `SINS-01` and
`SLEG-05` have landed; all three are read-only from here. The seven sibling payroll-tax tickets run in
the same wave and each writes **only** its own `pipelines/adapters/pt-<jurisdiction>/**` directory:
the eight scopes are disjoint by directory name, which `INGF-07` deliverable 1 fixes as
`group_id.lower()`. The **only** thing the eight share is `pipelines/adapters/_shared/rates/**`,
which none of them writes and all of them are `blocked_by` — exactly the arrangement plan §9 **R2**
prescribes. Each is additionally `blocked_by` a *different* `SLEG-0x` ticket in a different module and
lane. The only potentially shared path is the optional `pyproject.toml`, which is append-only.

## Deliverables

1. **`registry.yaml`** (`INGF-07` schema) with all nine PRD §6.1 attributes: `group_id: PT-QLD`,
   `wave: 2`; `authority` = Queensland Revenue Office with `authority_type: REVENUE_OFFICE`,
   `jurisdiction: QLD`, `official_url`; `official_endpoints` — one entry per payroll-tax collection
   actually used, each with `kind` and a PRD §40.5 `material_class`: `GUIDANCE` for guides,
   `GUIDANCE`/`POLICY` for rulings, and **`NEWS` for the news/change collection the row names** —
   never `LAW` or `OPERATIVE_INSTRUMENT`; `document_coverage.families` covering the row's required
   artifacts — **rates/thresholds, levy, rulings, guides and news** — with
   `financial_years: ['2024-25','2025-26','2026-27']` (PRD §6.6) or a `known_gaps` entry;
   `initial_index_tier: T1`; `change_detection.*` **as measured** (a news collection is a candidate
   delta signal, but declare only what the dry-run demonstrates); `known_gaps` with
   `customer_visible` flags; `evaluation_subset_ref`.
   `adapter_status` is whatever this ticket's evidence supports. If it is one of PRD §7's four limited
   states, the file **must** also carry `INGF-07`'s `limitation` block — `state` equal to
   `adapter_status`, a closed-set `reason_code`, a `reason_detail`, a non-empty `evidence[]` (the
   dry-run, conformance report, licence assessment or capability probe that demonstrates the
   limitation), an `affected` scope naming the affected dates or collections, and a
   `customer_visible_warning` that also appears as a `customer_visible: true` `known_gaps` entry
   (sub-PRD **D11**; plan §8 **Q10**). If it is `ACTIVE`, `limitation` stays null — `INGF-07` rejects
   a non-limited status carrying one.
2. **`allowlist.yaml`** (`INGF-02` schema): `schemes: [https]`, the QRO host with `path_prefixes`
   covering exactly deliverable 1's endpoints and no broader, plus conservative
   `min_request_interval_ms` and `max_concurrent_requests`.
3. **`licence.yaml` + `licence-snapshots/`** via
   `python -m <iroot>.licensing capture pipelines/adapters/pt-qld`, stating all nine PRD §11.1 axes
   independently plus `status`, `attribution_text`, `max_quote_chars`. Unclear rights ⇒
   `UNCLEAR_RESTRICTED`/`REVIEW_REQUIRED`, collapsed by `INGF-04`'s gate to metadata/link-only.
4. **`adapter.py`** exposing `ADAPTER: SourceAdapter` with
   `AdapterMeta(group_id="PT-QLD", adapter_key="pt-qld", jurisdiction="QLD", …)` and all eight PRD
   §40.7 boundaries. `discover` traverses the allowlisted collections with a `DiscoveryCursor` and
   honours `since`; `fetch` through `ctx.fetcher` with conditional-request validators; `parse`
   through `ctx.parser`.
5. **Subordinate document typing (PRD §9.1).** `identify()` assigns `document_type` from a **closed
   set** resolved against `packages/contracts` (sub-PRD **N1**) distinguishing a public ruling from a
   guide and from a news/change item, and sets `authority_key` to the Queensland Revenue Office. A
   module-level constant names the **forbidden** set — legislation, legislative-instrument and
   operative-instrument types — and a guard raises before emission if a record would carry one.
6. **Dated rate and threshold facts through `SINS-01`.** For every rate and threshold the material
   publishes, emit a `RateFact` with `fact_key` in a documented namespace
   (`payroll-tax.qld.rate.<variant>`, `payroll-tax.qld.threshold.<variant>`, …),
   `jurisdiction: "QLD"`, the correct `RateKind` and `Unit`, `applies_from`/`applies_to` from the
   dates the source states, `financial_year` where FY-periodised,
   `source_role: "OFFICIAL_GUIDANCE"` (or `"RULING"` where stated in a ruling), and `evidence` whose
   `quoted_text` is the exact span the number is printed in. Emission uses `rate_records()` —
   `SINS-01` deliverable 6's single mapping. A rate that varies by payroll size uses
   `RateValue.shape = "BRACKETED"`; one that varies by a declared employer attribute uses
   `"DIMENSIONED"`. **Every value comes from the committed fixture text.**
7. **The levy as an independent series (this row's distinguishing artifact).** Every levy component
   the source publishes is its own `fact_key` (`payroll-tax.qld.levy.<component>` for the rate and
   `payroll-tax.qld.levy.threshold.<component>` for any threshold), with `kind: "LEVY"`, its own
   `applies_from`/`applies_to` and its own `legislation_ref`. It is **never** merged into, added to or
   substituted for the base rate: `RateSeries.validate()` runs independently per `fact_key`, and a
   test asserts the levy and base-rate series are separate objects with separate evidence spans. A
   combined "effective rate" is a calculation and is out of scope (Non-goals).
8. **Resolved `legislation_ref`.** Every emitted `RateFact` — base rate, threshold **and levy** —
   carries a `legislation_ref` `NodeRef` into a `LEG-QLD` node (`SLEG-05`), and `rate_records()`
   emits the `node_relation` of `SINS-01` deliverable 6 step 4 with `derivation: DETERMINISTIC` and a
   non-model `confidence_state`. Resolution follows the citation the source gives; where it cites no
   provision, the reference comes from the group's committed `fact_key` → provision mapping, reviewed
   as part of this ticket. An unresolved reference is a **blocking** finding of this adapter's own
   `validate()` (`PT_RATE_LEGISLATION_LINK_MISSING`) — never a fabricated link (PRD §9.3, §40.3).
9. **Rulings, guides and news as citable nodes.** Each is emitted with its own headings and sections
   as `document_node`/`node_version` records with exact offsets (PRD §15.3; PRD §36.6). News/change
   items carry their published date and are typed `NEWS` at the endpoint level (deliverable 1); a
   news item is **never** the sole evidence for a rate fact when the rate is also published in a rate
   or guide page — prefer the authoritative page and record the news item as a change signal.
10. **`fixtures/rate-matrix.json`** — this group's row of the PRD §44.2 `E13` matrix, validating
    against `SINS-01`'s `rate-matrix.schema.json`: one cell per supported financial year with
    `present: true`, `fact_count > 0` and a `fixture_ref`. `assert_rate_matrix(group_dir)` is called
    from this group's tests. The matrix cell counts include the levy series.
11. **Fixtures (PRD §40.8 items 2, 4, 6, 7, 10).** `fixtures/discovery/`; `fixtures/dry-run.json`
    (`run_at` within `DRY_RUN_MAX_AGE_DAYS = 180`); `fixtures/documents/` covering every declared
    media type, scrubbed of customer data/cookies/credentials; **`fixtures/timepoints/` with the three
    PRD §6.6 financial years** (sub-PRD D8); `fixtures/quarantine/` with one defective artifact per
    declared reason code; `fixtures/baseline.json`.
12. **`tests/test_conformance.py`** — the five-line `ConformanceTestCase` subclass, plus unit tests
    for deliverables 5–10.
13. **`conformance.yaml`** where resource ceilings or **tightened** anomaly thresholds are needed;
    `deferred_items` may contain only `11`.
14. **Failure codes** with `register_failure_codes("pt-qld", …)`, each with a non-empty operator
    action (PRD §40.8 item 10, ADM-001) — at minimum: rate table not located, levy table not located,
    rate value not present in source, effective date unparseable, legislation reference unresolved,
    document type would be operative, collection count anomaly.
15. **`README.md`** in the group directory: collections used, the `fact_key` namespace **including
    the levy series and why it is separate**, the `fact_key` → Queensland provision mapping, the
    three-financial-year evidence with its fixture references, the recorded change-detection
    capability with its evidence, the known gaps, and — if the group carries a `limitation` — the
    evidence, affected dates or collections and customer-visible warning behind it.

## Acceptance checklist (classified)

**PRD §40.8 — the twelve-item adapter Definition of Done (all twelve required):**

- [ ] `[fixture]` **DoD 1** — `registry.yaml`, `allowlist.yaml`, `licence.yaml` validate; `PT-QLD` is
      in `MANDATORY_SOURCE_GROUPS`; directory name == `group_id.lower()`; licence snapshot SHA-256 ==
      `snapshot.terms_sha256`; every endpoint URL passes the allowlist. **This is the group's Source
      Coverage Registry row** (PRD §6.1, A2).
- [ ] `[fixture]` **DoD 2** — recorded discovery replays through `adapter.discover()` yielding ≥1
      `RemoteDescriptor` with a non-empty `descriptor_key` and an allowlisted URL; `dry-run.json`
      present and within `DRY_RUN_MAX_AGE_DAYS`.
- [ ] `[fixture]` **DoD 3** — `identify()` deterministic and stable across two versions of one
      document; different documents yield different keys; a removed descriptor produces `REMOVED` and
      deletes no prior state.
- [ ] `[fixture]` **DoD 4** — `fixtures/documents/` covers every declared media type and passes the
      no-customer-data scan.
- [ ] `[fixture]` **DoD 5** — every fixture parses through `ParserHost`, `assert_roundtrip()` passes,
      the node hierarchy has one root, no cycles, contiguous sibling ordinals and recomputable
      `text_hash` (PRD §15.3, §35.2).
- [ ] `[fixture]` **DoD 6** — **the three PRD §6.6 financial years as three time points**: each yields
      a `DocumentVersion` bracketing that date, a `legal_status` from PRD §6.7's seven values, events
      with `event_date`/`effective_date` distinguished, and the applicable rate, threshold **and levy**
      for that year; no overlapping effect intervals (sub-PRD D8).
- [ ] `[fixture]` **DoD 7** — no-change (304 → 0 fetched, last-check advanced, last-ingest unchanged),
      changed (including an unlabelled content change detected by `content_hash`), removed (prior
      retained), transient failure (bounded retry → `PARTIAL`, no content quarantine).
- [ ] `[fixture]` **DoD 8** — `fixtures/baseline.json` reproduces exactly on replay; any
      `anomaly_overrides` are derived from that measured baseline and **tighten only** — an attempted
      loosening of an `INGF-05` initial default fails (PRD §40.9; plan §8 **Q9**, baseline-selected).
- [ ] `[machine]` **DoD 9** — `change_detection.{capability,cadence}` declared; a replayed 304 run and
      a replayed content run write **different** freshness fields (PRD §12.1).
- [ ] `[fixture]` **DoD 10** — one defective artifact per declared quarantine reason produces exactly
      that code; every code has a non-empty operator action (ADM-001).
- [ ] `[machine]` **DoD 11** — `evaluation_subset_ref` non-empty and well-formed; ids resolve if
      `evals/cases/**` exists, else `DEFERRED(GOLD-16)` with a reason; `evals/gold/**` never read.
- [ ] `[fixture]` **DoD 12** — the replayed full run records non-zero `storage_bytes`,
      `parse_wall_ms`, `index_size_estimate_bytes`, `peak_rss_bytes`, each within this group's ceiling
      (PRD §39.2).
- [ ] `[machine]` `python -m <iroot>.conformance check pipelines/adapters/pt-qld` exits 0 in
      **strict** mode; the committed `conformance-report.json` shows no `FAIL` and no
      `NOT_AVAILABLE` (PRD §45.4).

**PRD §44.2 `E13` exit evidence:**

- [ ] `[fixture]` **The Queensland row of the eight-jurisdiction historical fixture matrix** —
      `assert_rate_matrix(pipelines/adapters/pt-qld)` passes: all three PRD §6.6 financial years have a
      cell with `present: true`, `fact_count > 0` and a `fixture_ref`, replayable offline.
- [ ] `[fixture]` **Point-in-time correctness** — `RateSeries.as_at()` returns the correct fact for a
      date in each of the three financial years for **both** the base-rate and the levy series, and
      `None` (never a nearest match) before the first recorded interval (PRD §6.6, §15.2; the corpus
      precondition for `UAT-SRCH-03`).
- [ ] `[machine]` **`RATE_FY_COVERAGE_INCOMPLETE` blocks for this group** — deleting one financial
      year's facts fails the run rather than emitting a partial series (`SINS-01` deliverable 5;
      PRD §44.4).

**Group-specific:**

- [ ] `[fixture]` **Rates as dated facts (PRD §40.3)** — every emitted rate/threshold/levy is a
      `SINS-01` `RateFact` whose `evidence.quoted_text` slices exactly out of the parsed text and
      re-parses to the declared value; records follow `SINS-01` deliverable 6's order.
- [ ] `[machine]` **The levy is an independent series (deliverable 7)** — a test asserts the levy and
      base-rate series have distinct `fact_key`s, distinct evidence spans and independent
      `applies_from`/`applies_to`; no emitted fact combines them, and no "effective rate" fact exists
      (PRD §40.3; Non-goals).
- [ ] `[machine]` **No hardcoded value (sub-PRD D3)** — a mutation that changes a rate, threshold or
      levy value **only in the adapter code** fails construction with `RateValueNotInSourceError`.
      With two independent series this is also the defence against attaching a recalled number to the
      wrong series.
- [ ] `[machine]` **No mutable rate field** — a scan asserts the adapter holds no `current_*` or
      `latest_*` module-level mutable rate; lookups go through `RateSeries.as_at()` (PRD §40.3).
- [ ] `[machine]` **Resolved `legislation_ref` (deliverable 8)** — every emitted `RateFact`, levy
      included, carries a `legislation_ref` into a `LEG-QLD` node and a deterministic `node_relation`;
      an unresolvable-reference fixture produces `PT_RATE_LEGISLATION_LINK_MISSING` at `BLOCK` and
      emits **no** relation (PRD §40.3, §9.3).
- [ ] `[machine]` **News is typed as news (PRD §40.5)** — the news/change collection's endpoints carry
      `material_class: NEWS`, and a test asserts no rate fact takes a news item as its sole evidence
      where the value is also published on a rate or guide page (deliverable 9).
- [ ] `[machine]` **Subordinate typing (PRD §9.1)** — no record carries a legislation,
      legislative-instrument or operative-instrument `document_type`; a mutation attempting one raises
      before emission (deliverable 5, sub-PRD D5).
- [ ] `[machine]` The adapter imports no HTTP library and no HTML/XML/PDF parsing library —
      `INGF-01`'s AST scan over `pipelines/adapters/pt-qld/**` passes (PRD §37.4, SEC-002).
- [ ] `[machine]` `python -m <iroot>.registry validate pipelines/adapters/pt-qld` exits 0 and a
      `--mode release` compose containing this group succeeds with `ACTIVE` or a PRD §7 limited status
      **with** a `customer_visible: true` gap (PRD §7, §44.4).
- [ ] `[machine]` **A limited status is only expressible with its evidence (sub-PRD D11; plan §8
      Q10).** If this group's `adapter_status` is limited, the `--mode release` compose carries the
      `limitation` block through verbatim and fails when any obligation is removed — one parametrised
      mutation per code: no block → `REGISTRY_LIMITATION_MISSING`; empty `evidence` →
      `REGISTRY_LIMITATION_UNEVIDENCED`; no `affected` dates or collections →
      `REGISTRY_LIMITATION_SCOPE_MISSING`; empty `customer_visible_warning` →
      `REGISTRY_LIMITATION_WARNING_MISSING`. If the group is `ACTIVE`, the same test asserts
      `limitation` is null and that adding one fails to load.
- [ ] `[machine]` The whole suite runs offline with no outbound network.
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, §20.3).
- [ ] `[machine]` `pnpm test` green — standing item; no TypeScript here, so "unchanged and green".
- [ ] `[human]` **Licence assessment sign-off** — the nine PRD §11.1 axes are a legal judgment
      (PRD §11.2, `LEGAL_REVIEW_PENDING`); PRD §11.1 forbids implying government endorsement. The
      Founder confirms status, `max_quote_chars` and attribution before the group is `ACTIVE`.
- [ ] `[human]` **`fact_key` → provision mapping review, including the levy** — is each rate,
      threshold and levy component linked to the right Queensland provision, and is the levy correctly
      separated from the base rate? A wrong link or a merged series produces a confidently
      mis-grounded answer; PRD §43.4 item 4 puts source adapter anomalies in the founder review queue.
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (`ADM-001`; supports `SRCH-002`,
      `SRCH-003`, `SRCH-005`, PRD §44.2 `E13`); UAT IDs — **none owned**; supplies the corpus
      precondition for `UAT-SRCH-03`; schema/API/event compatibility (uses `SINS-01`'s
      `RATES_MODEL_VERSION` unchanged); tenant/PII/security impact (none — public official material);
      **source/licence impact**; cost/memory/latency impact (DoD item 12); rollback path (mark
      `IN_DEVELOPMENT`, exclude from a release compose); known gaps (sub-PRD N1, plus this group's own
      `known_gaps` entries and — if it carries one — its `limitation` block with the evidence behind
      it; the anomaly thresholds are baseline-selected and consolidated by `GOLD-16`, plan §8 **Q9**,
      and the limited-state launch policy itself is confirmed, plan §8 **Q10**, so it is not a gap in
      this ticket).
- **Absent classes:** none. This ticket carries `[machine]`, `[fixture]` and `[human]` criteria.

## Test plan

Harness: `uv run pytest pipelines/adapters/pt-qld -q` plus the conformance CLI. All replays are
offline through `INGF-09`'s `ReplayFetcher`/`ReplayClock`; the fetcher refuses a URL absent from the
fixtures **and** a URL present but outside `allowlist.yaml`. Copy the construction pattern from
`INGF-09`'s reference adapter (`pipelines/ingestion/src/<iroot>/conformance/reference/demo-registry/`)
and its authoring guide (`pipelines/ingestion/src/<iroot>/conformance/README.md`); copy the rate-side
pattern from `pipelines/adapters/_shared/rates/README.md` (`SINS-01`).

1. `uv sync --frozen && uv run pytest pipelines/adapters/pt-qld -q`.
2. `python -m <iroot>.registry validate pipelines/adapters/pt-qld` — exit 0.
3. `python -m <iroot>.conformance check pipelines/adapters/pt-qld --report conformance-report.json`
   — exit 0, twelve verdicts inspected individually; `NOT_AVAILABLE` is a failure, never a skip.
4. **`tests/test_rate_facts.py`** — for each of the three financial-year time points, assert
   `RateSeries.as_at()` returns the fact recorded in `fixtures/rate-matrix.json` for the base-rate
   series; assert offsets slice `quoted_text`; the "changed in code only" mutation asserting
   `RateValueNotInSourceError`; the delete-one-financial-year mutation asserting
   `RATE_FY_COVERAGE_INCOMPLETE` at `BLOCK`.
5. **`tests/test_levy_series.py`** — the levy has its own `fact_key`s, evidence spans and intervals;
   its `as_at()` results are independent of the base rate across the three years; a mutation merging
   the two fails.
6. **`tests/test_matrix_row.py`** — `assert_rate_matrix(group_dir)` passes; a mutated
   `rate-matrix.json` with a missing year or `fact_count: 0` fails.
7. **`tests/test_legislation_link.py`** — every fact (levy included) carries a resolved
   `legislation_ref` and a deterministic relation; the unresolvable-reference fixture produces
   `PT_RATE_LEGISLATION_LINK_MISSING` at `BLOCK` and emits no relation.
8. **`tests/test_news_class.py`** — news endpoints carry `material_class: NEWS`; no rate fact takes a
   news item as sole evidence where the value is also on a rate or guide page.
9. **`tests/test_document_typing.py`** — ruling/guide/news typing and the forbidden-type mutation
   raising before emission.
10. **`tests/test_registry_status.py`** — the declared `adapter_status` composes in `--mode release`;
    if it is limited, the four `limitation` mutations each fail with their own
    `REGISTRY_LIMITATION_*` code and the block survives composition verbatim; if it is `ACTIVE`,
    adding a `limitation` fails to load (sub-PRD **D11**).
11. **`tests/test_architecture.py`** — re-runs `INGF-01`'s AST scan over this directory with a
    synthetic dirty module as negative control.
12. `uv run pytest` (whole repo) and `pnpm test` — green.
13. Once all eight payroll-tax groups have landed:
    `python -m <aroot>._shared.rates matrix --adapters-root pipelines/adapters` prints the complete
    8 × 3 matrix and exits 0 — the PRD §44.2 `E13` exit evidence.

**Reviewer focus.** (a) Run `tests/test_levy_series.py` and `tests/test_rate_facts.py`'s "changed in
code only" mutation first: two independent rate series in one jurisdiction is the configuration most
likely to produce a plausible, wrong, cited number. (b) Confirm no "effective rate" was computed —
that is a calculation, and the product is research (PRD §3.3). (c) Confirm every fact, levy included,
resolves to a real `LEG-QLD` node; an unresolved link must block, not warn. (d) Confirm the recorded
`change_detection.capability` is backed by evidence in `fixtures/dry-run.json`. (e) If the group is
limited, confirm the `limitation` block names a real official-source constraint with evidence — not a
scope decision wearing a `reason_code` (sub-PRD **D11**).

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (docs PR/MR,
changelog line in `docs/prd/07-sources-instruments/README.md`, then `publish-tickets.mjs --sync`),
then change code. `GOLD-08` and `GOLD-16` are `blocked_by` this ticket.

**Foreseeable frictions and their exact writeback targets:**

1. **The site has no reliable delta mechanism** — a news feed is a *candidate* signal, not proof →
   record the true `change_detection.capability`, let `INGF-07` derive **`FRESHNESS_LIMITED`** if the
   dry-run does not demonstrate a delta mechanism, add a `known_gaps` entry with
   `customer_visible: true`, populate the `limitation` block (`reason_code:
   OFFICIAL_CAPABILITY_LIMIT` or `FRESHNESS_LIMITATION`, the capability-probe evidence, the affected
   collections, the customer-visible warning), and update
   `docs/prd/07-sources-instruments/README.md`. PRD §12.1 requires this "rather than a false
   guarantee".
2. **Rights are unclear, restricted or prohibited** → record the true PRD §11.1 status, let
   `INGF-04`'s gate collapse it to metadata/link-only, set the registry status to
   **`LICENSING_RESTRICTED`** with a customer-visible gap and a `limitation` block whose
   `reason_code` is `LICENSING_RESTRICTION` and whose `evidence[]` cites the licence assessment, and
   update this module's README. PRD §44.4 forbids silently calling the category covered.
3. **The levy cannot be separated from the base rate in the source** → do **not** merge them into one
   fact. Record a `known_gaps` entry with `customer_visible: true`, emit only what the source states
   separately, and record the pattern in `docs/prd/07-sources-instruments/README.md`. A merged
   "effective rate" is a calculation that would then be cited as an official figure.
4. **A historical financial year is not published any more** → do **not** reconstruct the value from
   memory or a third-party site (PRD §6.1: only official public sources are eligible). Confirm by
   measurement that the material is genuinely unavailable, record `reason_code: DATE_LIMITED` with
   `customer_visible: true`, set the status the evidence supports with a `limitation` block whose
   `reason_code` is `HISTORICAL_MATERIAL_UNAVAILABLE`, whose `affected` names the missing financial
   year and whose `customer_visible_warning` says what is not covered, update this module's README,
   and report the matrix gap with that evidence. PRD §44.2's `E13` and PRD §26's "three total
   [financial years] are validated" are verified at Gate 2 under the confirmed policy (plan §8
   **Q10** → `GOLD-16` → `LNCH-05`): Gate 2 checks the evidence and the disclosure, it does not
   authorise dropping the year.
5. **A rate exists only in a calculator, spreadsheet or image with no addressable text** → **do not
   emit the fact.** Record `reason_code: FORMAT_UNSUPPORTED` with `customer_visible: true`.
6. **The `SINS-01` rate model cannot express this jurisdiction's structure** → extend `_shared/rates`
   **through a `SINS-01` ticket update** (its deliverable 3), update
   `docs/prd/07-sources-instruments/README.md` **D2**, then re-publish the nine dependents. A local
   variant is the failure plan §9 **R2** exists to prevent.
7. **The source cites no provision and the mapping is ambiguous** → do not guess. Record
   `PT_RATE_LEGISLATION_LINK_MISSING`, quarantine, and resolve the mapping with the Founder review of
   deliverable 8 (PRD §9.3).

**Escalation rule.** If the twelve-item Definition of Done cannot be satisfied for this mandatory
group, PRD §7 and PRD §44.4 forbid leaving it `PLANNED_NOT_ACTIVE` or calling it covered. Stop and
record the true status together with its complete `limitation` block — evidence, affected dates or
collections, customer-visible warning and the reason full coverage is unavailable. The governing
policy is **confirmed** (plan §8 **Q10**; sub-PRD **D11**), so the question raised is never "may this
group be dropped or reduced" but only "does the measured evidence show a genuine official-source
limitation"; `GOLD-16` produces the evidence and the proposed registry state, `LNCH-05` verifies the
launch statement, and Gate 2 is the verification and sign-off step. The only permitted outcomes remain
PRD §44.4's two. If the three-financial-year matrix cannot be completed for Queensland, that also puts
PRD §26's Corpus Definition of Done at risk and must be raised before release, not at it.
