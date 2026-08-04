---
id: SINS-03
title: "`FWC-AWARDS` — awards, variation history, pay data"
module: 07-sources-instruments
lane: 07-sources-instruments
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [SINS-01]
blocks: [ASK-08, GOLD-06, GOLD-16]
---

# SINS-03 — `FWC-AWARDS` — awards, variation history, pay data

Implements PRD §40.3 (wave-2 source group `FWC-AWARDS`), PRD §8.5 (Coverage Navigator) and PRD §40.8
(adapter Definition of Done) <`COV-001`, `SRCH-004`, `ADM-001`> — **No ADR — the decision is already
made in PRD §40.3; this is build ticket 3 of 14 against it.**
Parent sub-PRD: [07-sources-instruments README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [SINS-01 — Date-versioned rate/threshold fact model](SINS-01-date-versioned-rate-threshold-fact-model.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed adapter
contract (PRD §40.7), a fixed twelve-item gate (PRD §40.8) and a fixed rate model (`SINS-01`) — not a
new subsystem decision.

## Background + basis

**The PRD §40.3 row, verbatim:**

| Group ID | Official entry | Required artifacts | Initial tier |
|---|---|---|---|
| `FWC-AWARDS` | FWC awards — <https://www.fwc.gov.au/work-conditions/awards> | Current awards, variation histories, pay database, annual wage review material | T1 |

**Note what the row does not say (sub-PRD D7).** PRD §40.3 has no "Minimum adapter capability" column
and states no licensing. Change-detection capability and rights are **outcomes** of this ticket,
determined in the live dry-run and recorded in `registry.yaml` (`INGF-07`) and `licence.yaml`
(`INGF-04`). PRD §12.1: *"Sources without reliable delta mechanisms MUST show `FRESHNESS_LIMITED`
rather than a false guarantee."*

**The limited-state launch policy is settled (plan §8 **Q10**, confirmed policy; sub-PRD **D11**).**
It governs what this ticket may record and is not a question this ticket reopens:

1. `FWC-AWARDS` is a mandatory group and is attempted **in full** — never pre-selected for omission or
   reduced implementation, and never trimmed to make a release date easier.
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
   policy — not an opportunity to cut mandatory scope.

**Why this group carries three separate obligations.**

1. **Version chains.** PRD §6.2 puts "Modern awards, variations, orders, classifications and relevant
   pay data" in scope. PRD §35.2 requires `document_version` with `effective_from`/`effective_to`,
   `legal_status` and "non-overlap validation where versions represent consolidated effect"; PRD
   §15.2 requires legal status to be "derived from evidenced LegalEvents". A variation history is
   exactly a sequence of evidenced events producing a chain of dated versions. Plan §5.8's goal:
   *"Award version chains and classification structures."*
2. **Classification structures (`COV-001`).** PRD §8.5 fixes the Coverage Navigator's order:

   > "1. Likely workplace-relations system. 2. Employer/ABN enterprise-agreement candidates.
   > 3. Agreement approval, variation, replacement, termination and coverage. 4. Modern-award
   > candidates if no applicable agreement is established. 5. Industry/occupational coverage and
   > exclusions. 6. Classification candidates based on principal duties, qualifications and
   > responsibility. 7. Decisive missing facts and required clarifications."

   and adds: *"Job title alone MUST NOT determine classification. Multiple candidates MUST remain
   visible when evidence cannot select one. `Award-free`, `agreement not applicable` and exclusion
   conclusions require pinpoint evidence."* Stages 4–6 can only be answered with citations if the
   award's **coverage clause, exclusions and classification definitions are addressable nodes** in the
   corpus. That is this ticket's job; `ASK-08` (module `15-answer-product`, `blocked_by` this ticket)
   makes the decisions.
3. **Pay data as dated legal facts.** PRD §40.3: *"Rates are date-versioned legal facts, not mutable
   fields. A displayed rate must cite its official date-specific source and applicable
   legislation/guidance role."* `SINS-01` owns that model and this ticket is `blocked_by` it. Annual
   wage review material makes award pay points change on a known date, which is why the three PRD
   §6.6 financial years are the natural three time points of PRD §40.8 item 6 (sub-PRD D8).

**PRD §6.6 carries a rule that applies here:** *"Case law and still-operative instruments MUST NOT be
excluded solely because they are older than three financial years."* An award version older than
2024-25 that is still operative for a historical question is in scope; the three years are a minimum
for point-in-time retrieval, not a deletion rule.

**PRD §40.7 fixes the interface** (eight boundaries; the adapter never writes corpus tables; it emits
versioned intermediate records with source URL, artifact hash and tool version; shared framework code
performs HTTP safety, hashing, artifact persistence, retry, licensing, metrics, quarantine and run
accounting). `INGF-01` publishes it as `SourceAdapter`; `INGF-09` publishes `ConformanceTestCase` and
`ReplayFetcher`.

**Carried caveats.**

- **No HTTP or parser library** (PRD §37.4, `05` sub-PRD D10, `INGF-01` deliverable 11): fetch through
  `ctx.fetcher`, parse through `ctx.parser`, extract rates over `ParsedDocument.text`/`.blocks`.
- **No hardcoded pay values** (`SINS-01` sub-PRD **D3**): a `RateFact` cannot be constructed unless
  its value re-parses from its own quoted source span. If a number is not in the committed fixture, it
  cannot be emitted — and it must not be supplied from model knowledge.
- **No `SLEG-02` edge.** Plan §5.8 gives this ticket `blocked_by: [SINS-01]` only, so the Fair Work Act
  nodes an award's enabling provision would link to may not exist. `legislation_ref` is optional; an
  unresolved link records a `validation_finding` of severity `ANOMALY` and a `known_gaps` entry —
  never a fabricated link (sub-PRD **N6**).
- **Shared host (sub-PRD N5).** `FWC-DOCS`, `FWC-AGREEMENTS` and `CASE-FWC` use the same host;
  declare conservative politeness values in `allowlist.yaml`.
- **Anomaly thresholds (plan §8 **Q9**, baseline-selected).** PRD §40.9's ±10% count change and >2%
  parse failure are the framework's **initial defaults**, refined per source once this group has a
  representative baseline. This ticket records that baseline and may **tighten** them, never loosen
  them; a genuine need for a looser percentage is a writeback to `INGF-05`, not a local override.
  `GOLD-16` consolidates, and the critical identity, time, mandatory-source and citation failures
  block unconditionally regardless of any percentage.

## Goal

Deliver the `FWC-AWARDS` source adapter under `pipelines/adapters/fwc-awards/**`: the per-adapter
`registry.yaml`, `allowlist.yaml`, `licence.yaml` + immutable licence snapshot, an `adapter.py`
exposing `ADAPTER: SourceAdapter` with all eight PRD §40.7 boundaries over the FWC awards
collections, award identity and dated **version chains** built from evidenced variation events, an
addressable **classification and coverage node hierarchy** sufficient for PRD §8.5 stages 4–6 to cite
pinpoints, **pay data emitted as `SINS-01` `RateFact`s** across the three PRD §6.6 financial years,
and the complete PRD §40.8 fixture set — such that
`python -m <iroot>.conformance check pipelines/adapters/fwc-awards` exits 0 in strict mode with all
twelve items `PASS` (item 11 `DEFERRED(GOLD-16)` only where `evals/cases/**` does not yet exist).

## Non-goals

- **No Document Search discovery client.** `SINS-02` (`FWC-DOCS`) owns it (sub-PRD **D6**). This
  ticket uses the awards collections named in its own §40.3 row; it does not re-implement Document
  Search, and it has no `SINS-02` edge in plan §5.8 — so it must not depend on `SINS-02`'s surface.
- **No enterprise agreements** — `SINS-04` (`FWC-AGREEMENTS`).
- **No FWC decisions as case law** — `SCAS-05` (`CASE-FWC`, module `08-sources-cases`).
- **No coverage or classification *decision*.** PRD §8.5's ordering, candidate statuses
  (`CONFIRMED_FROM_STATED_FACTS` … `INSUFFICIENT_EVIDENCE`) and the "job title alone MUST NOT
  determine classification" rule are enforced by `ASK-08` (`15-answer-product`), which is
  `blocked_by` this ticket. This ticket supplies citable structure, never a conclusion.
- **No rate model changes.** `SINS-01` owns `_shared/rates/**`; extending it is a `SINS-01` ticket
  update, never a local variant (plan §9 **R2**).
- **No pay calculation.** The product is research, not a payroll engine (PRD §3.3, §11.2).
- **No evaluation cases or gold data** — `21-evaluation-600` (`GOLD-06`, `GOLD-16`). Never read
  `evals/gold/**` (PRD §45.1 item 6, plan §9 R9).
- **No registry/allowlist/licence/conformance *schema* changes** — `INGF-07`, `INGF-02`, `INGF-04`,
  `INGF-09`. This ticket authors instances only, including any `limitation` block, whose fields and
  closed `reason_code` set are `INGF-07`'s and are never redefined here.
- **No launch-scope call and no reduction of this group's mandatory scope.** The limited-state policy
  is confirmed (plan §8 **Q10**, sub-PRD **D11**); this ticket supplies its own measured status and
  evidence, `GOLD-16` consolidates, and Gate 2 verifies.
- **No live network in tests.** PRD §40.8 item 2's "live dry-run evidence" is a committed recorded
  artifact.

## File-scope (write-owns)

- `pipelines/adapters/fwc-awards/**` — the whole group directory: `registry.yaml`, `allowlist.yaml`,
  `licence.yaml`, `licence-snapshots/`, `conformance.yaml` (optional), `adapter.py`, `fixtures/**`,
  `tests/**`, `README.md`.
- Does not touch: `pipelines/adapters/_shared/**` — `SLEG-01`, `SINS-01`, `SCAS-01`, `SFUT-01`. This
  ticket **imports** `_shared/rates` read-only.
- Does not touch: `pipelines/adapters/{fwc-docs,fwc-agreements,fwo-guidance,ato-employment}/**` and
  `pipelines/adapters/pt-*/**` — `SINS-02`, `SINS-04`…`SINS-14`.
- Does not touch: `pipelines/ingestion/**`, `pipelines/corpus-builder/**`, `schemas/**` — modules
  `05`, `04`, `00`.
- Does not touch: `evals/**`, `pipelines/evaluation/**` — `21-evaluation-600`.
- Does not touch: `packages/**`, `apps/**`, `services/**`, `tests/**`, `infra/**`,
  `.github/workflows/**`.
- `pipelines/adapters/pyproject.toml` (if it exists) — **append-only**, shared-additive; resolve
  conflicts by re-running `uv lock` (plan §1.1, PRD §44.3). Expected untouched (sub-PRD D9).

**Serial safety.** First decomposition of `docs/PRD.md`; **nothing is merged and no ticket is in
flight**. `INGF-01`…`INGF-09` and `SINS-01` have landed and own `pipelines/ingestion/**` and
`_shared/rates/**` respectively — both read-only from here. The tickets that may run concurrently are
the other ten wave-2 siblings (`SINS-04`, `SINS-06`, `SINS-07`…`SINS-14`), each owning exactly one
other group directory; the fourteen scopes are pairwise disjoint by construction (`INGF-07`
deliverable 1: one directory per group, named `group_id.lower()`). The only potentially shared path is
the optional `pyproject.toml`, which is append-only.

## Deliverables

1. **`registry.yaml`** (`INGF-07` schema) with all nine PRD §6.1 attributes: `group_id: FWC-AWARDS`,
   `wave: 2`; `authority` = the Fair Work Commission (`authority_type: COMMISSION`,
   `jurisdiction: CTH`, `court_level` populated, `official_url`); `official_endpoints` — one entry per
   awards collection actually used, each with `kind` and a PRD §40.5 `material_class`
   (`OPERATIVE_INSTRUMENT` for awards and variations, `GUIDANCE` for pay-guide style material,
   `DECISION`/`POLICY` for annual wage review material); `document_coverage.families` covering the
   row's four required artifact classes — current awards, variation histories, pay database, annual
   wage review material — with `financial_years` covering `2024-25`, `2025-26`, `2026-27` (PRD §6.6)
   or a `known_gaps` entry explaining why not; `initial_index_tier: T1`;
   `change_detection.{capability,cadence,supports_conditional_requests,reconciliation}` **as
   measured**; `known_gaps` with `customer_visible` flags; `evaluation_subset_ref`.
   `adapter_status` is whatever this ticket's evidence supports. If it is one of PRD §7's four limited
   states, the file **must** also carry `INGF-07`'s `limitation` block — `state` equal to
   `adapter_status`, a closed-set `reason_code`, a `reason_detail`, a non-empty `evidence[]` (the
   dry-run, conformance report, licence assessment or capability probe that demonstrates the
   limitation), an `affected` scope naming the affected dates or collections, and a
   `customer_visible_warning` that also appears as a `customer_visible: true` `known_gaps` entry
   (sub-PRD **D11**; plan §8 **Q10**). If it is `ACTIVE`, `limitation` stays null — `INGF-07` rejects
   a non-limited status carrying one.
2. **`allowlist.yaml`** (`INGF-02` schema): `schemes: [https]`, the FWC host with `path_prefixes`
   covering exactly the endpoints of deliverable 1, plus conservative `min_request_interval_ms` and
   `max_concurrent_requests` (sub-PRD N5).
3. **`licence.yaml` + `licence-snapshots/`** captured with
   `python -m <iroot>.licensing capture pipelines/adapters/fwc-awards`, stating all nine PRD §11.1
   axes independently plus `status`, `attribution_text` and `max_quote_chars`. Unclear rights ⇒
   `UNCLEAR_RESTRICTED`/`REVIEW_REQUIRED`, which `INGF-04`'s gate collapses to metadata/link-only.
4. **`adapter.py`** exposing `ADAPTER: SourceAdapter` with
   `AdapterMeta(group_id="FWC-AWARDS", adapter_key="fwc-awards", jurisdiction="CTH", …)` and all eight
   PRD §40.7 boundaries. `discover` traverses the awards collections with a `DiscoveryCursor` and
   honours `since`; `fetch` goes through `ctx.fetcher` with `FetchValidators` carrying the stored
   `etag`/`last_modified`; `parse` goes through `ctx.parser`.
5. **Award identity.** `StableDocumentIdentity` with `official_identifier` = the award's own official
   code as printed by the source, `canonical_title` = the official title, and a documented
   deterministic `stable_source_key`. Codes are read from the source, **never** constructed or
   completed from model knowledge; an unparseable code quarantines rather than emits (`SRCH-004`,
   PRD §35.2 "exact indexes on identifiers").
6. **Version chains from evidenced variations (PRD §15.2, §35.2).** Each variation in the award's
   published history produces (a) a `legal_event` with `event_type` (variation), `event_date` and
   `effective_date` **distinguished**, and `evidence_ref` pointing at the node that states it, and
   (b) a `document_version` whose `effective_from` is that operative date and whose predecessor's
   `effective_to` is closed to the day before. `validate()` asserts the chain has **no overlapping
   effect intervals** and no unexplained gap — the `EFFECT_INTERVAL_OVERLAP` BLOCK rule of `INGF-05`
   and PRD §40.9's "any overlapping effect interval for a supposedly consolidated series".
7. **Classification and coverage node hierarchy (`COV-001`, PRD §8.5 stages 4–6).** `normalise()`
   emits `document_node`/`node_version` records that make each of the following an **individually
   citable node with exact offsets**: the award's coverage clause; each exclusion; each
   industry/occupational scope statement; each classification level definition including its
   qualification, principal-duties and responsibility text; and each schedule containing pay points.
   `stable_node_key`s are documented and stable across versions so a citation survives a later
   release (`SRCH-005`: "Historical stable link survives later release"). PRD §15.3's exact-offset
   rule and PRD §40.8 item 5's round-trip apply to every one of them.
8. **Pay data as `SINS-01` rate facts.** For every pay point the source publishes, emit a `RateFact`
   through `_shared/rates` with `fact_key` in a documented namespace (e.g.
   `award.<code>.<classification>.<pay-basis>`), `jurisdiction: "CTH"`, the correct `RateKind` and
   `Unit`, `applies_from`/`applies_to` taken from the award version's operative dates,
   `financial_year` where the series is FY-periodised, `source_role: "OPERATIVE_INSTRUMENT"`, and
   `evidence` whose `quoted_text` is the exact span the number is printed in. Emission uses
   `rate_records()` — the single mapping of `SINS-01` deliverable 6 — so the records are identical in
   shape to the payroll-tax groups'. `legislation_ref` stays `None` when the Fair Work Act nodes are
   absent, with an `ANOMALY` finding and a `known_gaps` entry (sub-PRD **N6**); it is never
   fabricated.
9. **Series validation.** `validate()` runs `RateSeries.validate()` for every `fact_key` and returns
   the findings unchanged (`SINS-01` deliverable 5): `RATE_SERIES_OVERLAP` blocks;
   `RATE_FY_COVERAGE_INCOMPLETE` flags for this non-`PT-*` group; `RATE_UNIT_INCONSISTENT` blocks.
10. **Fixtures (PRD §40.8 items 2, 4, 6, 7, 10).** `fixtures/discovery/`; `fixtures/dry-run.json`
    (`run_at` within `DRY_RUN_MAX_AGE_DAYS = 180`); `fixtures/documents/` covering every declared
    media type, scrubbed of customer data/cookies/credentials; **`fixtures/timepoints/` with the three
    PRD §6.6 financial years as its three legal dates** (sub-PRD D8), each producing a different
    applicable award version and a different applicable pay point;
    `fixtures/quarantine/` with one defective artifact per declared reason code;
    `fixtures/baseline.json` with per-collection counts and a content hash set.
11. **`tests/test_conformance.py`** — the five-line `ConformanceTestCase` subclass, plus unit tests
    for deliverables 5–9.
12. **`conformance.yaml`** only where resource ceilings or **tightened** anomaly thresholds are
    needed; `deferred_items` may contain only `11`.
13. **Failure codes** registered with `register_failure_codes("fwc-awards", …)`, each with a
    non-empty operator action (PRD §40.8 item 10, ADM-001) — at minimum: award code unparseable,
    variation history shape changed, classification structure not recognised, pay table not located,
    version chain gap or overlap.
14. **`README.md`** in the group directory: collections used, award identity rule, the
    `stable_node_key` scheme for coverage/exclusion/classification nodes, the `fact_key` namespace,
    the recorded change-detection capability with its evidence, the known gaps, and — if the group
    carries a `limitation` — the evidence, affected collections and customer-visible warning behind it.

## Acceptance checklist (classified)

**PRD §40.8 — the twelve-item adapter Definition of Done (all twelve required):**

- [ ] `[fixture]` **DoD 1** — `registry.yaml`, `allowlist.yaml`, `licence.yaml` validate;
      `FWC-AWARDS` is in `MANDATORY_SOURCE_GROUPS`; directory name == `group_id.lower()`; the licence
      snapshot's SHA-256 equals `snapshot.terms_sha256`; every `official_endpoints` URL passes the
      allowlist. **This is the group's Source Coverage Registry row** (PRD §6.1, A2).
- [ ] `[fixture]` **DoD 2** — recorded discovery replays through `adapter.discover()` yielding ≥1
      `RemoteDescriptor` with a non-empty `descriptor_key` and an allowlisted URL; `dry-run.json`
      present and within `DRY_RUN_MAX_AGE_DAYS`.
- [ ] `[fixture]` **DoD 3** — `identify()` deterministic across two calls and stable across two award
      versions; different awards yield different keys; a removed descriptor produces `REMOVED` and
      deletes no prior state.
- [ ] `[fixture]` **DoD 4** — `fixtures/documents/` covers every declared media type and passes the
      no-customer-data scan.
- [ ] `[fixture]` **DoD 5** — every document fixture parses through `ParserHost`,
      `assert_roundtrip()` passes, and the classification/coverage hierarchy has one root, no cycles,
      contiguous sibling ordinals and recomputable `text_hash` (PRD §15.3, §35.2).
- [ ] `[fixture]` **DoD 6** — the three PRD §6.6 financial years as three time points: each yields a
      `DocumentVersion` bracketing that date, a `legal_status` from PRD §6.7's seven values, events
      with `event_date` and `effective_date` distinguished, **and a different applicable pay point**;
      no overlapping effect intervals (sub-PRD D8).
- [ ] `[fixture]` **DoD 7** — no-change (304 → 0 fetched, `last_successful_change_scan_at` advanced,
      `last_content_ingestion_at` unchanged), changed (new version, prior `effective_to` closed),
      removed (`REMOVED`, prior retained), transient failure (bounded retry → `PARTIAL`, no content
      quarantine).
- [ ] `[fixture]` **DoD 8** — `fixtures/baseline.json` reproduces exactly on replay; any
      `anomaly_overrides` are derived from that measured baseline and **tighten only** — an attempted
      loosening of an `INGF-05` initial default fails (PRD §40.9; plan §8 **Q9**, baseline-selected).
- [ ] `[machine]` **DoD 9** — `change_detection.{capability,cadence}` declared; a replayed 304 run and
      a replayed content run write **different** freshness fields (PRD §12.1 last-check vs
      last-ingest).
- [ ] `[fixture]` **DoD 10** — one defective artifact per declared quarantine reason produces exactly
      that code; every code has a non-empty operator action (ADM-001).
- [ ] `[machine]` **DoD 11** — `evaluation_subset_ref` non-empty and well-formed; ids resolve if
      `evals/cases/**` exists, else `DEFERRED(GOLD-16)` with a reason. `evals/gold/**` never read.
- [ ] `[fixture]` **DoD 12** — the replayed full run records non-zero `storage_bytes`,
      `parse_wall_ms`, `index_size_estimate_bytes`, `peak_rss_bytes`, each within this group's ceiling
      (PRD §39.2).
- [ ] `[machine]` `python -m <iroot>.conformance check pipelines/adapters/fwc-awards` exits 0 in
      **strict** mode; the committed `conformance-report.json` shows no `FAIL` and no
      `NOT_AVAILABLE` (PRD §45.4).

**Group-specific:**

- [ ] `[fixture]` **Version chain** — a replayed award with ≥3 variations produces a chain with no
      overlapping and no unexplained gap in `[effective_from, effective_to]`, every version traceable
      to a `legal_event` with an `evidence_ref`; a mutated fixture that overlaps two versions produces
      `EFFECT_INTERVAL_OVERLAP` at severity `BLOCK` (PRD §35.2, §40.9; deliverable 6).
- [ ] `[machine]` **Classification structure (`COV-001`)** — for a recorded award fixture, the
      coverage clause, each exclusion, each industry/occupational scope statement and each
      classification level (with its qualification/principal-duties/responsibility text) is an
      individually addressable node whose `canonical_text[start:end]` reproduces exactly; a test
      asserts a pinpoint citation can be built for a negative conclusion, which PRD §8.5 requires
      ("`Award-free` … and exclusion conclusions require pinpoint evidence") (deliverable 7).
- [ ] `[machine]` **`stable_node_key` stability** — the same clause in two award versions keeps the
      same `stable_node_key`, so a historical link survives a later release (`SRCH-005`;
      deliverable 7).
- [ ] `[fixture]` **Pay data as dated facts** — every emitted pay point is a `SINS-01` `RateFact`
      with a non-null `evidence.quoted_text` that slices exactly out of the parsed text and re-parses
      to the declared value; the emitted records are `document_node` + `node_version` + `legal_event`
      in `SINS-01` deliverable 6's order; a mutated fixture whose number is changed **only in the
      code** fails construction with `RateValueNotInSourceError` (PRD §40.3, sub-PRD D3;
      deliverable 8).
- [ ] `[machine]` **No mutable pay field** — a scan asserts the adapter holds no `current_rate`,
      `latest_pay` or equivalent module-level mutable value; lookups go through `RateSeries.as_at()`
      (PRD §40.3 "not mutable fields").
- [ ] `[machine]` **Unresolved legislation link is honest** — with the Fair Work Act nodes absent,
      `legislation_ref` is `None`, a `RATE_LEGISLATION_LINK_MISSING` finding is recorded and a
      `known_gaps` entry exists; no relation is emitted (sub-PRD **N6**, PRD §9.3).
- [ ] `[machine]` **Exact identifiers (`SRCH-004`)** — a parser table over recorded fixtures extracts
      award codes into `official_identifier`; a malformed code quarantines and emits no record
      (deliverable 5).
- [ ] `[machine]` The adapter imports no HTTP library and no HTML/XML/PDF parsing library —
      `INGF-01`'s AST scan over `pipelines/adapters/fwc-awards/**` passes (PRD §37.4, SEC-002).
- [ ] `[machine]` `python -m <iroot>.registry validate pipelines/adapters/fwc-awards` exits 0 and a
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
      (PRD §11.2, `LEGAL_REVIEW_PENDING`); the Founder confirms status, `max_quote_chars` and
      attribution before the group is declared `ACTIVE`.
- [ ] `[human]` **Classification-structure adequacy review** — can a Coverage Navigator answer at PRD
      §8.5 stages 5 and 6 cite a pinpoint from this structure for a *negative* conclusion? Whether the
      hierarchy is *sufficient* (as opposed to present) is irreducibly a judgment call and it gates
      `ASK-08`, `COV-001` and `COV-004`. PRD §43.4 item 5 puts Coverage failures in the founder review
      queue.
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (`COV-001`, `SRCH-004`,
      `ADM-001`; supports `COV-004`, `SRCH-003`, `SRCH-005`); UAT IDs — **none owned**; supplies the
      corpus preconditions for `UAT-COV-01` and `UAT-COV-03`, owned by `15-answer-product`;
      schema/API/event compatibility (uses `SINS-01`'s `RATES_MODEL_VERSION` unchanged); tenant/PII/
      security impact (none — public official material); **source/licence impact (the recorded
      assessment and its display/quotation/export consequences)**; cost/memory/latency impact
      (DoD item 12); rollback path (mark `IN_DEVELOPMENT`, exclude from a release compose); known gaps
      (sub-PRD N5, N6, plus this group's own `known_gaps` entries and — if it carries one — its
      `limitation` block with the evidence behind it; the anomaly thresholds are baseline-selected and
      consolidated by `GOLD-16`, plan §8 **Q9**, and the limited-state launch policy itself is
      confirmed, plan §8 **Q10**, so it is not a gap in this ticket).
- **Absent classes:** none. This ticket carries `[machine]`, `[fixture]` and `[human]` criteria.

## Test plan

Harness: `uv run pytest pipelines/adapters/fwc-awards -q` plus the conformance CLI. All replays are
offline through `INGF-09`'s `ReplayFetcher`/`ReplayClock`; the fetcher refuses a URL absent from the
fixtures **and** a URL present but outside `allowlist.yaml`. Copy the construction pattern from
`INGF-09`'s reference adapter (`pipelines/ingestion/src/<iroot>/conformance/reference/demo-registry/`)
and its authoring guide (`pipelines/ingestion/src/<iroot>/conformance/README.md`), plus
`_shared/rates/README.md` for the rate side.

1. `uv sync --frozen && uv run pytest pipelines/adapters/fwc-awards -q`.
2. `python -m <iroot>.registry validate pipelines/adapters/fwc-awards` — exit 0.
3. `python -m <iroot>.conformance check pipelines/adapters/fwc-awards --report conformance-report.json`
   — exit 0, twelve verdicts inspected individually; `NOT_AVAILABLE` is a failure, never a skip.
4. **`tests/test_version_chain.py`** — the three-variation fixture: assert dates, closure of prior
   `effective_to`, event evidence refs; then the overlap mutation asserting `BLOCK`.
5. **`tests/test_classification_nodes.py`** — assert the presence and exact round-trip of the
   coverage clause, one exclusion, one industry scope statement and one classification level; assert
   `stable_node_key` stability across two versions.
6. **`tests/test_pay_facts.py`** — for each of the three financial-year time points, assert
   `RateSeries.as_at()` returns a different fact; assert every fact's offsets slice its
   `quoted_text`; then the "changed in code only" mutation asserting `RateValueNotInSourceError`.
7. **`tests/test_identifiers.py`** — award-code parser table plus the malformed-code quarantine path.
8. **`tests/test_registry_status.py`** — the declared `adapter_status` composes in `--mode release`;
   if it is limited, the four `limitation` mutations each fail with their own `REGISTRY_LIMITATION_*`
   code and the block survives composition verbatim; if it is `ACTIVE`, adding a `limitation` fails
   to load (sub-PRD **D11**).
9. **`tests/test_architecture.py`** — re-runs `INGF-01`'s AST scan over this directory with a
   synthetic dirty module as negative control.
10. `uv run pytest` (whole repo) and `pnpm test` — green.

**Reviewer focus.** (a) Run `tests/test_pay_facts.py`'s mutation first — if a pay value can be changed
in code without failing, sub-PRD **D3** is not enforced and this ticket can publish an uncitable
number. (b) Check that the version chain has no gap silently filled: PRD §15.2 makes status derive
from evidenced events, so a synthesised interval is an unevidenced legal claim. (c) Check that a
*negative* coverage conclusion could be cited — PRD §8.5 requires pinpoint evidence for `Award-free`
and exclusion outcomes, and a hierarchy that only models positive coverage silently fails `COV-004`.
(d) Confirm the recorded `change_detection.capability` is backed by evidence in
`fixtures/dry-run.json`. (e) If the group is limited, confirm the `limitation` block names a real
official-source constraint with evidence — not a scope decision wearing a `reason_code`
(sub-PRD **D11**).

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (docs PR/MR,
changelog line in `docs/prd/07-sources-instruments/README.md`, then `publish-tickets.mjs --sync`),
then change code. Three tickets are `blocked_by` this one (`ASK-08`, `GOLD-06`, `GOLD-16`), so a
change after merge requires re-publishing them.

**Foreseeable frictions and their exact writeback targets:**

1. **The awards collection has no reliable delta mechanism** → record the true
   `change_detection.capability` and let `INGF-07` derive **`FRESHNESS_LIMITED`**; add a
   `known_gaps` entry with `customer_visible: true`; populate the `limitation` block
   (`reason_code: OFFICIAL_CAPABILITY_LIMIT` or `FRESHNESS_LIMITATION`, the capability-probe evidence,
   the affected collections, the customer-visible warning); update
   `docs/prd/07-sources-instruments/README.md`. PRD §12.1 demands this rather than "a false
   guarantee"; PRD §7 names the status. Never declare a capability the dry-run did not demonstrate.
2. **Rights are unclear, restricted or prohibited** → record the true PRD §11.1 status, let
   `INGF-04`'s gate collapse it to metadata/link-only, set the registry status to
   **`LICENSING_RESTRICTED`** with a customer-visible gap and a `limitation` block whose
   `reason_code` is `LICENSING_RESTRICTION` and whose `evidence[]` cites the licence assessment, and
   update this module's README. A silent downgrade of indexing or quotation without the registry
   status is forbidden (PRD §44.4).
3. **Pay data is only available in a form with no reliable offsets** (an image, a calculator widget, a
   spreadsheet the parser cannot address) → **do not emit the fact**. Record a `known_gaps` entry with
   `reason_code: FORMAT_UNSUPPORTED` and `customer_visible: true`, and if it makes the group's pay
   coverage claim untrue, set `METADATA_AND_LINK_ACTIVE` with a complete `limitation` block. Record
   the pattern in `docs/prd/07-sources-instruments/README.md`. PRD §40.3 requires a date-specific
   cited source; an uncited number is worse than an absent one. The status is chosen from what the
   evidence shows, never to make the work smaller (plan §8 **Q10**, confirmed policy).
4. **The `SINS-01` rate model cannot express an award pay structure** (e.g. a pay point that varies by
   two independent dimensions and a bracket at once) → extend `_shared/rates` **through a `SINS-01`
   ticket update**, not here. Update `SINS-01`'s deliverable 3 and
   `docs/prd/07-sources-instruments/README.md` **D2** first, then re-publish the nine dependents. A
   local variant of the value model is the failure plan §9 **R2** exists to prevent.
5. **The classification structure needs the Fair Work Act to be meaningful** (e.g. exclusions are
   stated by reference to a statutory definition) → keep `legislation_ref` optional and record the
   `known_gaps` entry (sub-PRD **N6**). If the dependency is genuinely hard, the writeback is a
   **plan** change adding `SLEG-02` to this ticket's `blocked_by` in
   `docs/prd/breakdown-plan.md` §5.8 and §6.2 — never an invented link.
6. **`ASK-08` needs structure this ticket does not emit** → extend deliverable 7 here and update this
   ticket, then re-publish `ASK-08`. `15-answer-product` must not re-parse award documents: PRD §45.2
   gives `pipelines` the source acquisition and forbids product modules to duplicate it.

**Escalation rule.** If the twelve-item Definition of Done cannot be satisfied for this mandatory
group, PRD §7 and PRD §44.4 forbid leaving it `PLANNED_NOT_ACTIVE` or calling it covered. Stop and
record the true status together with its complete `limitation` block — evidence, affected dates or
collections, customer-visible warning and the reason full coverage is unavailable. The governing
policy is **confirmed** (plan §8 **Q10**; sub-PRD **D11**), so the question raised is never "may this
group be dropped or reduced" but only "does the measured evidence show a genuine official-source
limitation". `GOLD-16` produces the evidence and the proposed registry state, `LNCH-05` verifies the
launch statement, and Gate 2 is the verification and sign-off step. The only permitted outcomes remain
PRD §44.4's two: delay production access, or launch with the limitation visible and relevant answers
safely warning or refusing. A `COV-001` claim resting on a structure that cannot cite a pinpoint is
exactly the "unsupported definitive claim" PRD §43.3 gates to zero.
