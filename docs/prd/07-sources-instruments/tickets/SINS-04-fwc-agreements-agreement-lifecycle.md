---
id: SINS-04
title: "`FWC-AGREEMENTS` — agreement lifecycle"
module: 07-sources-instruments
lane: 07-sources-instruments
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [SINS-02]
blocks: [ASK-08, GOLD-07, GOLD-16]
---

# SINS-04 — `FWC-AGREEMENTS` — agreement lifecycle

Implements PRD §40.3 (wave-2 source group `FWC-AGREEMENTS`), PRD §8.5 (Coverage Navigator) and PRD
§40.8 (adapter Definition of Done) <`COV-003`, `SRCH-004`, `ADM-001`> — **No ADR — the decision is
already made in PRD §40.3; this is build ticket 4 of 14 against it.**
Parent sub-PRD: [07-sources-instruments README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [SINS-02 — `FWC-DOCS` — FWC Document Search](SINS-02-fwc-docs-fwc-document-search.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed adapter
contract (PRD §40.7), a fixed twelve-item gate (PRD §40.8) and `SINS-02`'s published Document Search
surface — not a new subsystem decision.

## Background + basis

**The PRD §40.3 row, verbatim:**

| Group ID | Official entry | Required artifacts | Initial tier |
|---|---|---|---|
| `FWC-AGREEMENTS` | FWC agreement finder — <https://www.fwc.gov.au/work-conditions/enterprise-agreements/find-enterprise-agreement> | Current, terminated and historical agreement lists/documents plus lifecycle evidence | T2; candidates on demand |

**Note what the row does not say (sub-PRD D7).** PRD §40.3 has no "Minimum adapter capability" column
and states no licensing. Change-detection capability and rights are **outcomes** of this ticket,
recorded in `registry.yaml` (`INGF-07`) and `licence.yaml` (`INGF-04`). PRD §12.1: *"Sources without
reliable delta mechanisms MUST show `FRESHNESS_LIMITED` rather than a false guarantee."*

**The limited-state launch policy is settled (plan §8 **Q10**, confirmed policy; sub-PRD **D11**).**
It governs what this ticket may record and is not a question this ticket reopens:

1. `FWC-AGREEMENTS` is a mandatory group and is attempted **in full** — never pre-selected for
   omission or reduced implementation, and never trimmed to make a release date easier. The long tail
   being large is not a licence to cut it.
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

**PRD §6.2 puts the lifecycle in scope explicitly:** *"Enterprise agreements and their approval,
variation, replacement and termination chains."* Plan §5.8's goal for this ticket is the same
sentence: *"Approval/variation/replacement/termination evidence chains."*

**`COV-003` is this ticket's requirement** (PRD §30.2):

> "Agreement search supports employer name and validated ABN | Coverage form | coverage job | Source |
> Known synthetic ABN fixture returns linked candidates"

with the manual script `UAT-COV-02` (PRD §41.2): *"Known synthetic employer/ABN has agreement chain →
Agreement candidates show approval, variation/replacement/termination evidence."* PRD §35.2 gives
`legal_document` an `employer_abn` column with "exact indexes on identifiers/ABN". The corpus side of
`COV-003` is therefore: **the employer name and a checksum-validated ABN are on the agreement
document, and the lifecycle events are evidenced.** The product side (the coverage form, the
candidate list, the ordering of PRD §8.5) is `ASK-08`, which is `blocked_by` this ticket.

**PRD §6.6 carries a rule that this group can get badly wrong:**

> "An enterprise agreement MUST NOT be treated as ceased merely because its nominal expiry date has
> passed."

A nominal expiry date is not a termination. This ticket must model them as different things, and a
test must prove an agreement past its nominal expiry is still emitted as operative unless an
evidenced termination or replacement says otherwise.

**PRD §9.3 constrains what may be asserted:**

> "Official structured assertions may support conclusions. Deterministic extraction may support
> conclusions when exact source evidence and parser version are retained. LLM-discovered
> relationships are `MODEL_SUGGESTED` and MUST NOT change legal status or support a definitive
> treatment conclusion."

Every lifecycle link — this agreement replaced that one; this variation applies from that date; this
agreement was terminated on that date — is a `legal_event` or a `node_relation` with an
`evidence_ref`, a `derivation` and a `parser_version`, never an inference (PRD §35.2:
"`MODEL_SUGGESTED` cannot support definitive status").

**Why `blocked_by SINS-02` (sub-PRD D6).** PRD §40.3 gives `FWC-DOCS` "agreements" among its required
artifacts and `FWC-AGREEMENTS` its own agreement-finder entry: the two draw on the same
Commission publishing surface. Plan §6.2 orders them `SINS-02 --> SINS-04`, and plan §4 states "Read
access is unrestricted; only writes are allocated". This ticket therefore **imports** `SINS-02`'s
published discovery/identifier surface (its `README.md` documents the module path) and does not
re-implement Document Search paging or FWC identifier parsing. Plan §9 **R2** forbids copying a helper
into two adapter directories.

**PRD §40.7 fixes the interface** (eight boundaries; the adapter never writes corpus tables; it emits
versioned intermediate records with source URL, artifact hash and tool version; shared framework code
performs HTTP safety, hashing, artifact persistence, retry, licensing, metrics, quarantine and run
accounting).

**Carried caveats.**

- **No HTTP or parser library** (PRD §37.4, `05` sub-PRD D10, `INGF-01` deliverable 11).
- **No rate facts.** This ticket has no `SINS-01` edge in plan §5.8; agreement pay tables are captured
  as citable nodes, not as `RateFact`s. If rate facts prove necessary, that is a plan writeback
  (sub-PRD **N4**'s rule applied here), never a local copy of the rate model.
- **Index tier (sub-PRD N3).** The PRD row says "T2; candidates on demand" — declare
  `initial_index_tier: T2` and record the "candidates on demand" intent as a note; `CRPS-04` assigns
  the operative per-chunk tier.
- **Shared host (sub-PRD N5).** Same host as `FWC-DOCS`, `FWC-AWARDS` and `CASE-FWC`; declare
  conservative politeness values in `allowlist.yaml`.
- **Volume.** Agreements are the long tail of this module. PRD §39.2 budgets a 2 GiB host and PRD
  §17.2 makes T2 "lexical plus selective semantic"; DoD item 12's measurements are the release input
  for that budget, not decoration. Those measurements are also this group's contribution to the two
  register entries deferred until measurement — plan §8 **Q3** (hot dense coverage, resolved by
  `RLSE-11`'s real-scale benchmark) and **Q5** (measured corpus statistics, resolved by `GOLD-16`).
  Nothing here assumes a planning figure for collection size: the number is whatever this group
  measures.
- **Anomaly thresholds (plan §8 **Q9**, baseline-selected).** PRD §40.9's ±10% count change and >2%
  parse failure are the framework's **initial defaults**, refined per source once this group has a
  representative baseline. This ticket may **tighten** them and never loosen them; a genuine need for
  a looser percentage is a writeback to `INGF-05`, not a local override. `GOLD-16` consolidates, and
  the critical identity, time, mandatory-source and citation failures block unconditionally.

## Goal

Deliver the `FWC-AGREEMENTS` source adapter under `pipelines/adapters/fwc-agreements/**`: the
per-adapter `registry.yaml`, `allowlist.yaml`, `licence.yaml` + immutable licence snapshot, an
`adapter.py` exposing `ADAPTER: SourceAdapter` with all eight PRD §40.7 boundaries over the agreement
finder collections (current, terminated and historical), agreement identity carrying the official
agreement code, employer name and a **checksum-validated** ABN, an **evidenced lifecycle chain** of
approval → variation → replacement → termination events, a nominal-expiry model that cannot be
mistaken for cessation, and the complete PRD §40.8 fixture set including a synthetic-employer ABN
fixture — such that `python -m <iroot>.conformance check pipelines/adapters/fwc-agreements` exits 0
in strict mode and the corpus precondition for `COV-003` and `UAT-COV-02` is demonstrably met.

## Non-goals

- **No Document Search discovery client or FWC identifier parser.** `SINS-02` owns both (sub-PRD
  **D6**); this ticket imports them.
- **No modern awards, variation histories or pay data** — `SINS-03` (`FWC-AWARDS`).
- **No FWC decisions as case law.** The decision approving an agreement is `SCAS-05` (`CASE-FWC`,
  module `08-sources-cases`); this ticket records the approval **event** with its evidence, not the
  decision's bench, reasons or treatment (PRD §9.2).
- **No coverage decision.** PRD §8.5 stages 2 and 3 (employer/ABN candidates, agreement coverage) are
  decided by `ASK-08` (`15-answer-product`), which is `blocked_by` this ticket. This ticket supplies
  citable candidates and evidence, never a conclusion. "Multiple candidates MUST remain visible when
  evidence cannot select one" is enforced there.
- **No ABN registry lookup.** Validating an ABN's **checksum** is arithmetic on the digits; verifying
  that an ABN belongs to a named entity would require an external registry that is not in PRD §40's
  roster. Where the source itself does not state the ABN, the field stays `NULL` and a `known_gaps`
  entry records it — never a looked-up or inferred value.
- **No rate facts** (see carried caveats).
- **No evaluation cases or gold data** — `21-evaluation-600` (`GOLD-07`, `GOLD-16`); never read
  `evals/gold/**` (PRD §45.1 item 6, plan §9 R9).
- **No registry/allowlist/licence/conformance *schema* changes** — `INGF-07`, `INGF-02`, `INGF-04`,
  `INGF-09`. This ticket authors instances only, including any `limitation` block, whose fields and
  closed `reason_code` set are `INGF-07`'s and are never redefined here.
- **No launch-scope call and no reduction of this group's mandatory scope.** The limited-state policy
  is confirmed (plan §8 **Q10**, sub-PRD **D11**); this ticket supplies its own measured status and
  evidence, `GOLD-16` consolidates, and Gate 2 verifies.
- **No live network in tests.**

## File-scope (write-owns)

- `pipelines/adapters/fwc-agreements/**` — the whole group directory: `registry.yaml`,
  `allowlist.yaml`, `licence.yaml`, `licence-snapshots/`, `conformance.yaml` (optional), `adapter.py`,
  `fixtures/**`, `tests/**`, `README.md`.
- Does not touch: `pipelines/adapters/fwc-docs/**` — `SINS-02`. This ticket **imports** its published
  surface read-only.
- Does not touch: `pipelines/adapters/_shared/**` — `SLEG-01`, `SINS-01`, `SCAS-01`, `SFUT-01`.
- Does not touch: `pipelines/adapters/{fwc-awards,fwo-guidance,ato-employment}/**` and
  `pipelines/adapters/pt-*/**` — `SINS-03`, `SINS-05`…`SINS-14`.
- Does not touch: `pipelines/adapters/case-fwc/**` — `SCAS-05` (module `08-sources-cases`).
- Does not touch: `pipelines/ingestion/**`, `pipelines/corpus-builder/**`, `schemas/**` — modules
  `05`, `04`, `00`.
- Does not touch: `evals/**`, `pipelines/evaluation/**` — `21-evaluation-600`.
- Does not touch: `packages/**`, `apps/**`, `services/**`, `tests/**`, `infra/**`,
  `.github/workflows/**`.
- `pipelines/adapters/pyproject.toml` (if it exists) — **append-only**, shared-additive; resolve
  conflicts by re-running `uv lock` (plan §1.1, PRD §44.3). Expected untouched (sub-PRD D9).

**Serial safety.** First decomposition of `docs/PRD.md`; **nothing is merged and no ticket is in
flight**. `INGF-01`…`INGF-09` and `SINS-02` have landed; both are read-only from here. The tickets
that may run concurrently are the other ten wave-2 siblings, each owning exactly one other group
directory — the fourteen scopes are pairwise disjoint by construction (`INGF-07` deliverable 1: one
directory per group, named `group_id.lower()`). The only potentially shared path is the optional
`pyproject.toml`, which is append-only.

## Deliverables

1. **`registry.yaml`** (`INGF-07` schema) with all nine PRD §6.1 attributes: `group_id:
   FWC-AGREEMENTS`, `wave: 2`; `authority` = the Fair Work Commission (`authority_type: COMMISSION`,
   `jurisdiction: CTH`, `court_level`, `official_url`); `official_endpoints` — one entry per agreement
   collection used (current, terminated, historical), each with `kind` and
   `material_class: OPERATIVE_INSTRUMENT` (or `DECISION` where the collection publishes approval
   decisions); `document_coverage.families` covering the row's required artifacts, with `date_from`
   justified by what the collection exposes and `financial_years` per PRD §6.6 or a `known_gaps`
   entry; `initial_index_tier: T2` plus a note on "candidates on demand" (sub-PRD N3);
   `change_detection.*` **as measured**; `known_gaps` with `customer_visible` flags;
   `evaluation_subset_ref`.
   `adapter_status` is whatever this ticket's evidence supports. If it is one of PRD §7's four limited
   states, the file **must** also carry `INGF-07`'s `limitation` block — `state` equal to
   `adapter_status`, a closed-set `reason_code`, a `reason_detail`, a non-empty `evidence[]` (the
   dry-run, conformance report, licence assessment or capability probe that demonstrates the
   limitation), an `affected` scope naming the affected dates or collections, and a
   `customer_visible_warning` that also appears as a `customer_visible: true` `known_gaps` entry
   (sub-PRD **D11**; plan §8 **Q10**). If it is `ACTIVE`, `limitation` stays null — `INGF-07` rejects
   a non-limited status carrying one.
2. **`allowlist.yaml`** (`INGF-02` schema): `schemes: [https]`, the FWC host with `path_prefixes`
   covering exactly deliverable 1's endpoints, plus conservative `min_request_interval_ms` and
   `max_concurrent_requests` (sub-PRD N5).
3. **`licence.yaml` + `licence-snapshots/`** via
   `python -m <iroot>.licensing capture pipelines/adapters/fwc-agreements`, stating all nine PRD §11.1
   axes independently plus `status`, `attribution_text`, `max_quote_chars`. Unclear rights ⇒
   `UNCLEAR_RESTRICTED`/`REVIEW_REQUIRED`, collapsed by `INGF-04`'s gate to metadata/link-only.
   Agreement documents name real employers; the assessment's `display` and `quotation` axes are
   load-bearing for `EVID-06` and exports.
4. **`adapter.py`** exposing `ADAPTER: SourceAdapter` with
   `AdapterMeta(group_id="FWC-AGREEMENTS", adapter_key="fwc-agreements", jurisdiction="CTH", …)` and
   all eight PRD §40.7 boundaries. `discover` uses `SINS-02`'s published discovery client over this
   group's own endpoints, driven by `DiscoveryCursor` and honouring `since`; `fetch` through
   `ctx.fetcher` with conditional-request validators; `parse` through `ctx.parser`.
5. **Agreement identity.** `StableDocumentIdentity` with `official_identifier` = the agreement code as
   printed by the source, `canonical_title` = the official agreement title, `employer_abn` populated
   **only** from an ABN the source itself states, and a documented deterministic `stable_source_key`.
   Codes and ABNs are read, never constructed or completed from model knowledge; an unparseable code
   quarantines rather than emits (`SRCH-004`).
6. **ABN checksum validation (`COV-003`).** A pure, individually tested `validate_abn(text) -> str |
   None` implementing the published 11-digit ABN checksum: strip whitespace, require 11 digits,
   subtract 1 from the first digit, apply the standard positional weights, and accept only when the
   weighted sum is divisible by 89. A failing checksum **must not** be stored: it is recorded as a
   `validation_finding` (`ANOMALY`) and the field stays `NULL`. `UAT-SRCH-04` ("Use invalid ABN in
   advanced employer filter → Inline checksum error") is the product-side mirror of the same rule.
7. **Employer identity.** `employer_name` normalised for search (documented rule: case folding,
   whitespace and punctuation normalisation, legal-suffix handling) and emitted as a citable node or
   document field so `COV-003`'s "employer name" path has something exact to match. The **raw**
   official name is preserved verbatim; normalisation is additive, never destructive.
8. **The evidenced lifecycle chain (PRD §6.2, §9.3).** For each agreement, emit `legal_event` records
   for **approval**, **variation**, **replacement** and **termination**, each with: the canonical
   `event_type` resolved against `packages/contracts` (sub-PRD **N1**), `event_date` and
   `effective_date` **distinguished** (PRD §15.2), an `evidence_ref` pointing at the exact node that
   states it, and `metadata_json` carrying the source's own reference (decision or matter identifier)
   where printed. A replacement additionally emits a `node_relation` between the two agreements with
   `derivation: DETERMINISTIC` and a non-model `confidence_state`; where the relationship is not
   stated structurally by the source it is **not emitted** (PRD §9.3, §35.2).
9. **Nominal expiry ≠ cessation (PRD §6.6).** `nominal_expiry_date` is captured as a distinct dated
   fact on the agreement and **never** sets `effective_to`, never changes `legal_status`, and never
   produces a termination event. `legal_status` is derived only from evidenced events (PRD §15.2). A
   dedicated test proves an agreement past its nominal expiry with no termination evidence is still
   returned as operative at a later `legal_as_at`.
10. **Fixtures (PRD §40.8 items 2, 4, 6, 7, 10).** `fixtures/discovery/`; `fixtures/dry-run.json`
    (`run_at` within `DRY_RUN_MAX_AGE_DAYS = 180`); `fixtures/documents/` covering every declared
    media type, scrubbed of customer data/cookies/credentials; `fixtures/timepoints/` with ≥3 legal
    dates spanning at least one lifecycle transition; `fixtures/quarantine/` with one defective
    artifact per declared reason code; `fixtures/baseline.json`. **Plus a
    `fixtures/synthetic-employer/` set** carrying a synthetic employer name and a synthetic but
    checksum-valid ABN with a complete approval → variation → replacement → termination chain — the
    `COV-003` "known synthetic ABN fixture" and the corpus half of `UAT-COV-02`. It contains no real
    employer's data (PRD §40.8 item 4).
11. **`tests/test_conformance.py`** — the five-line `ConformanceTestCase` subclass, plus unit tests
    for deliverables 5–9.
12. **`conformance.yaml`** where resource ceilings or **tightened** anomaly thresholds are needed;
    `deferred_items` may contain only `11`.
13. **Failure codes** with `register_failure_codes("fwc-agreements", …)`, each with a non-empty
    operator action (PRD §40.8 item 10, ADM-001) — at minimum: agreement code unparseable, ABN
    checksum failed, lifecycle event without evidence, replacement target unresolved, listing shape
    changed.
14. **`README.md`** in the group directory: collections used, the identity and ABN rules, the
    lifecycle event grammar with an example chain, the nominal-expiry rule quoted from PRD §6.6, the
    `SINS-02` import path used, the recorded change-detection capability with its evidence, the known
    gaps, and — if the group carries a `limitation` — the evidence, affected collections and
    customer-visible warning behind it.

## Acceptance checklist (classified)

**PRD §40.8 — the twelve-item adapter Definition of Done (all twelve required):**

- [ ] `[fixture]` **DoD 1** — `registry.yaml`, `allowlist.yaml`, `licence.yaml` validate;
      `FWC-AGREEMENTS` is in `MANDATORY_SOURCE_GROUPS`; directory name == `group_id.lower()`; licence
      snapshot SHA-256 == `snapshot.terms_sha256`; every endpoint URL passes the allowlist. **This is
      the group's Source Coverage Registry row** (PRD §6.1, A2).
- [ ] `[fixture]` **DoD 2** — recorded discovery replays through `adapter.discover()` yielding ≥1
      `RemoteDescriptor` with a non-empty `descriptor_key` and an allowlisted URL; `dry-run.json`
      present and within `DRY_RUN_MAX_AGE_DAYS`.
- [ ] `[fixture]` **DoD 3** — `identify()` deterministic and stable across two versions of one
      agreement; different agreements yield different keys; a removed descriptor produces `REMOVED`
      and deletes no prior state.
- [ ] `[fixture]` **DoD 4** — `fixtures/documents/` covers every declared media type and passes the
      no-customer-data scan; the synthetic-employer fixture contains no real employer data.
- [ ] `[fixture]` **DoD 5** — every fixture parses through `ParserHost`, `assert_roundtrip()` passes,
      the node hierarchy has one root, no cycles, contiguous sibling ordinals and recomputable
      `text_hash` (PRD §15.3, §35.2).
- [ ] `[fixture]` **DoD 6** — ≥3 time points spanning a lifecycle transition: each yields a
      `DocumentVersion` bracketing that date, a `legal_status` from PRD §6.7's seven values, and
      events with `event_date`/`effective_date` distinguished; no overlapping effect intervals.
- [ ] `[fixture]` **DoD 7** — no-change (304 → 0 fetched, last-check advanced, last-ingest unchanged),
      changed, removed (prior retained), transient failure (bounded retry → `PARTIAL`, no content
      quarantine).
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
      (PRD §39.2 — the long tail makes this group's numbers the module's largest, and they are the
      measured input `RLSE-11` and `GOLD-16` consume, not a figure to be predicted).
- [ ] `[machine]` `python -m <iroot>.conformance check pipelines/adapters/fwc-agreements` exits 0 in
      **strict** mode; the committed `conformance-report.json` shows no `FAIL` and no `NOT_AVAILABLE`
      (PRD §45.4).

**Group-specific:**

- [ ] `[machine]` **ABN checksum (`COV-003`)** — `validate_abn()` accepts a table of valid synthetic
      ABNs and rejects: 10 digits, 12 digits, non-digits, and a digit-transposed variant of a valid
      one; a rejected ABN leaves `employer_abn` `NULL` **and** records an `ANOMALY` finding
      (deliverable 6).
- [ ] `[fixture]` **`COV-003` corpus precondition** — replaying `fixtures/synthetic-employer/`
      produces an agreement document whose `employer_abn` is the synthetic ABN, whose `employer_name`
      matches on both the raw and normalised forms, and whose lifecycle chain contains an approval, a
      variation, a replacement and a termination event **each with an `evidence_ref`** — the corpus
      half of `UAT-COV-02` ("Agreement candidates show approval, variation/replacement/termination
      evidence").
- [ ] `[fixture]` **Nominal expiry ≠ cessation (PRD §6.6)** — an agreement whose nominal expiry date
      has passed, with no termination evidence, is still emitted as operative at a later
      `legal_as_at`; a mutated fixture that sets `effective_to` from the nominal expiry date fails the
      test. This is the mechanical form of "An enterprise agreement MUST NOT be treated as ceased
      merely because its nominal expiry date has passed" (deliverable 9).
- [ ] `[machine]` **No unevidenced lifecycle assertion (PRD §9.3)** — a fixture where a replacement is
      only implied (not stated structurally) emits **no** relation; a test asserts no emitted
      `node_relation` carries a model-suggested `confidence_state` (PRD §35.2: "`MODEL_SUGGESTED`
      cannot support definitive status").
- [ ] `[machine]` **Exact identifiers (`SRCH-004`)** — a parser table over recorded fixtures extracts
      agreement codes into `official_identifier`; a malformed code quarantines and emits no record.
- [ ] `[machine]` **`SINS-02` surface is imported, not copied** — a test asserts the discovery client
      and identifier parsers come from `SINS-02`'s documented module path, and a scan asserts this
      directory contains no second implementation of Document Search paging (sub-PRD **D6**, plan §9
      **R2**).
- [ ] `[machine]` **No rate facts** — the emitted record stream carries no `rates` tool-version key
      (this ticket has no `SINS-01` edge; sub-PRD N4's rule).
- [ ] `[machine]` The adapter imports no HTTP library and no HTML/XML/PDF parsing library —
      `INGF-01`'s AST scan over `pipelines/adapters/fwc-agreements/**` passes (PRD §37.4, SEC-002).
- [ ] `[machine]` `python -m <iroot>.registry validate pipelines/adapters/fwc-agreements` exits 0 and
      a `--mode release` compose containing this group succeeds with `ACTIVE` or a PRD §7 limited
      status **with** a `customer_visible: true` gap (PRD §7, §44.4).
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
      (PRD §11.2, `LEGAL_REVIEW_PENDING`). Agreement documents name real employers, so the `display`,
      `quotation` and `export` axes have direct customer-facing consequences through `EVID-06` and
      `XPRT-02`. The Founder confirms before the group is declared `ACTIVE`.
- [ ] `[human]` **Lifecycle-evidence adequacy review** — can a Coverage answer show *why* an agreement
      applies or has been replaced, from this evidence alone? PRD §43.4 item 5 puts
      "Coverage/enterprise-agreement/case-treatment failures" in the founder review queue; whether the
      chain is *sufficient* is irreducibly a judgment call and it gates `ASK-08` and `COV-003`.
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (`COV-003`, `SRCH-004`,
      `ADM-001`); UAT IDs — **none owned**; supplies the corpus precondition for `UAT-COV-02` and
      `UAT-SRCH-04`, both owned by product modules; schema/API/event compatibility (consumes
      `SINS-02`'s published surface unchanged); tenant/PII/security impact (**public official material
      only — but agreement documents name employers and individuals: the fixture no-customer-data scan
      and PRD §10.1's employer/public-entity rules are the controls**); **source/licence impact (the
      recorded assessment and its display/quotation/export consequences)**; cost/memory/latency impact
      (DoD item 12 — this is the module's largest collection, and its measured numbers feed `RLSE-11`
      and `GOLD-16`); rollback path (mark `IN_DEVELOPMENT`, exclude from a release compose); known gaps
      (sub-PRD N3, N4, N5, plus this group's own `known_gaps` entries and — if it carries one — its
      `limitation` block with the evidence behind it; the anomaly thresholds are baseline-selected and
      consolidated by `GOLD-16`, plan §8 **Q9**, and the limited-state launch policy itself is
      confirmed, plan §8 **Q10**, so it is not a gap in this ticket).
- **Absent classes:** none. This ticket carries `[machine]`, `[fixture]` and `[human]` criteria.

## Test plan

Harness: `uv run pytest pipelines/adapters/fwc-agreements -q` plus the conformance CLI. All replays
are offline through `INGF-09`'s `ReplayFetcher`/`ReplayClock`; the fetcher refuses a URL absent from
the fixtures **and** a URL present but outside `allowlist.yaml`. Copy the construction pattern from
`INGF-09`'s reference adapter (`pipelines/ingestion/src/<iroot>/conformance/reference/demo-registry/`)
and its authoring guide (`pipelines/ingestion/src/<iroot>/conformance/README.md`); copy the
identifier-parser test pattern from `pipelines/adapters/fwc-docs/tests/test_identifiers.py`
(`SINS-02`).

1. `uv sync --frozen && uv run pytest pipelines/adapters/fwc-agreements -q`.
2. `python -m <iroot>.registry validate pipelines/adapters/fwc-agreements` — exit 0.
3. `python -m <iroot>.conformance check pipelines/adapters/fwc-agreements --report conformance-report.json`
   — exit 0, twelve verdicts inspected individually; `NOT_AVAILABLE` is a failure, never a skip.
4. **`tests/test_abn.py`** — the checksum table (valid synthetic set; 10/12 digits; non-digits;
   transposition) and the "invalid ABN is not stored, an `ANOMALY` finding is" assertion.
5. **`tests/test_lifecycle.py`** — replay `fixtures/synthetic-employer/`; assert the four event types,
   their `event_date`/`effective_date` separation, their `evidence_ref`s, and the replacement
   relation; then the "implied but not stated" mutation asserting no relation is emitted.
6. **`tests/test_nominal_expiry.py`** — the PRD §6.6 rule: past nominal expiry, no termination
   evidence, still operative at a later date; and the mutation that closes `effective_to` from the
   nominal expiry failing.
7. **`tests/test_identity.py`** — determinism, cross-version stability, distinctness, and the
   `REMOVED` path retaining prior state.
8. **`tests/test_uses_sins02_surface.py`** — the import-path assertion plus the no-second-copy scan.
9. **`tests/test_registry_status.py`** — the declared `adapter_status` composes in `--mode release`;
   if it is limited, the four `limitation` mutations each fail with their own `REGISTRY_LIMITATION_*`
   code and the block survives composition verbatim; if it is `ACTIVE`, adding a `limitation` fails
   to load (sub-PRD **D11**).
10. **`tests/test_architecture.py`** — re-runs `INGF-01`'s AST scan over this directory with a
    synthetic dirty module as negative control.
11. `uv run pytest` (whole repo) and `pnpm test` — green.

**Reviewer focus.** (a) Run `tests/test_nominal_expiry.py` first — an agreement wrongly treated as
ceased is a date/jurisdiction critical error, which PRD §43.3 gates to **zero**, and it is the most
likely mistake in this group. (b) Confirm no lifecycle relation is emitted from an inference: feed
the "implied replacement" fixture and check that nothing is asserted (PRD §9.3). (c) Confirm an
invalid ABN never reaches `employer_abn`. (d) Confirm the `SINS-02` surface is imported rather than
re-implemented. (e) Confirm the recorded `change_detection.capability` is backed by evidence in
`fixtures/dry-run.json`. (f) If any part of the historical collection is excluded, confirm the
`document_coverage` bound is backed by a measurement and a `limitation` block — not by a decision that
the long tail was inconvenient (sub-PRD **D11**).

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (docs PR/MR,
changelog line in `docs/prd/07-sources-instruments/README.md`, then `publish-tickets.mjs --sync`),
then change code. Three tickets are `blocked_by` this one (`ASK-08`, `GOLD-07`, `GOLD-16`).

**Foreseeable frictions and their exact writeback targets:**

1. **The agreement collection has no reliable delta mechanism** → record the true
   `change_detection.capability`, let `INGF-07` derive **`FRESHNESS_LIMITED`**, add a `known_gaps`
   entry with `customer_visible: true`, populate the `limitation` block
   (`reason_code: OFFICIAL_CAPABILITY_LIMIT` or `FRESHNESS_LIMITATION`, the capability-probe evidence,
   the affected collections, the customer-visible warning), and update
   `docs/prd/07-sources-instruments/README.md`. PRD §12.1 requires this rather than "a false
   guarantee"; PRD §7 names the status. Never declare a capability the dry-run did not demonstrate.
2. **Rights are unclear, restricted or prohibited** → record the true PRD §11.1 status, let
   `INGF-04`'s gate collapse it to metadata/link-only, set the registry status to
   **`LICENSING_RESTRICTED`** with a customer-visible gap and a `limitation` block whose
   `reason_code` is `LICENSING_RESTRICTION` and whose `evidence[]` cites the licence assessment, and
   update this module's README. PRD §44.4 forbids silently calling the category covered.
3. **The source states no ABN for many agreements** → `employer_abn` stays `NULL` and a `known_gaps`
   entry with `customer_visible: true` records the proportion. Do **not** look it up elsewhere and do
   **not** infer it: `COV-003`'s promise is "validated ABN", and an unvalidated one is worse than
   none. If ABN coverage is too thin for `COV-003` to be credible, raise it against `ASK-08` and this
   module's README before the requirement is claimed complete.
4. **The full historical agreement set is too large for the PRD §39.2 budget** → this is a real
   possibility for the long tail, and it is resolved by **measurement**, not by a scope decision.
   Record the measured DoD item 12 numbers, set a date-bounded `document_coverage` with a
   `known_gaps` entry (`reason_code: DATE_LIMITED`, `customer_visible: true`) and a `limitation` block
   whose `reason_code` and `evidence[]` state the measured constraint, and feed the measurements to
   plan §8 **Q3** (`RLSE-11`'s real-scale benchmark) and **Q5** (`GOLD-16`'s corpus statistics), both
   of which are deferred until measured and neither of which may be pre-empted by a guess here. Never
   silently truncate a collection, and never bound coverage merely because the tail is inconvenient
   (plan §8 **Q10**, confirmed policy).
5. **`SINS-02`'s published surface does not expose what discovery needs** → extend it **there**
   (`SINS-02` deliverable 7) and update `docs/prd/07-sources-instruments/README.md` **D6**, then
   re-publish this ticket. Do not copy the code here (plan §9 **R2**) and do not move it into
   `_shared/` — `_shared/` areas have four fixed owners and adding a fifth is a
   `docs/prd/breakdown-plan.md` §4/§4.2 change.
6. **Agreement pay tables tempt rate facts** → this ticket has no `SINS-01` edge. Capture them as
   citable nodes. If rate facts are genuinely required, the writeback is a **plan** change adding
   `SINS-01` to this ticket's `blocked_by` in `docs/prd/breakdown-plan.md` §5.8 and §6.2 — never a
   local copy of the rate model (plan §9 **R2**, sub-PRD **N4**).
7. **A lifecycle relation is obvious to a reader but not stated structurally** → do not emit it.
   PRD §9.3 permits deterministic extraction only "when exact source evidence and parser version are
   retained"; anything else is `MODEL_SUGGESTED` and "MUST NOT change legal status". Record a
   `known_gaps` entry instead.

**Escalation rule.** If the twelve-item Definition of Done cannot be satisfied for this mandatory
group, PRD §7 and PRD §44.4 forbid leaving it `PLANNED_NOT_ACTIVE` or calling it covered. Stop and
record the true status together with its complete `limitation` block — evidence, affected dates or
collections, customer-visible warning and the reason full coverage is unavailable. The governing
policy is **confirmed** (plan §8 **Q10**; sub-PRD **D11**), so the question raised is never "may this
group be dropped or reduced" but only "does the measured evidence show a genuine official-source
limitation"; `GOLD-16` produces the evidence and the proposed registry state, `LNCH-05` verifies the
launch statement, and Gate 2 is the verification and sign-off step. And if the nominal-expiry rule of
PRD §6.6 cannot be honoured — if the source's data genuinely cannot distinguish expiry from
termination — that is a **product/spec** escalation under PRD §45.5, not a local approximation: an
agreement wrongly reported as ceased is a definitive claim about a customer's legal position built on
no evidence.
