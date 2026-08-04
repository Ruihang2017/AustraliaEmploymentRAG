---
id: SINS-06
title: "`ATO-EMPLOYMENT`"
module: 07-sources-instruments
lane: 07-sources-instruments
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [SINS-01]
blocks: [GOLD-08, GOLD-16]
---

# SINS-06 — `ATO-EMPLOYMENT`

Implements PRD §40.3 (wave-2 source group `ATO-EMPLOYMENT`), PRD §6.2 (Commonwealth scope), PRD §11.1
(licensing registry) and PRD §40.8 (adapter Definition of Done) <`ADM-001`, `SRCH-002`> — **No ADR —
the decision is already made in PRD §40.3; this is build ticket 6 of 14 against it.**
Parent sub-PRD: [07-sources-instruments README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [SINS-01 — Date-versioned rate/threshold fact model](SINS-01-date-versioned-rate-threshold-fact-model.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed adapter
contract (PRD §40.7), a fixed twelve-item gate (PRD §40.8) and a fixed rate model (`SINS-01`) — not a
new subsystem decision.

## Background + basis

**The PRD §40.3 row, verbatim:**

| Group ID | Official entry | Required artifacts | Initial tier |
|---|---|---|---|
| `ATO-EMPLOYMENT` | Australian Taxation Office — <https://www.ato.gov.au/businesses-and-organisations/hiring-and-paying-your-workers> | PAYG withholding, STP, super/Payday Super, FBT and employer guidance/rulings relevant to payroll | T1 high-use; status/licence controlled |

**Note what the row does not say (sub-PRD D7).** PRD §40.3 has no "Minimum adapter capability" column.
Change-detection capability is an **outcome** of this ticket, recorded in `registry.yaml`
(`INGF-07`). PRD §12.1: *"Sources without reliable delta mechanisms MUST show `FRESHNESS_LIMITED`
rather than a false guarantee."*

**The limited-state launch policy is settled (plan §8 **Q10**, confirmed policy; sub-PRD **D11**).**
It governs what this ticket may record and is not a question this ticket reopens:

1. `ATO-EMPLOYMENT` is a mandatory group and is attempted **in full** — never pre-selected for
   omission or reduced implementation, and never trimmed to make a release date easier.
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
   policy — not an opportunity to cut mandatory scope. This is the most likely group in the module to
   need a `LICENSING_RESTRICTED` state, because the §40.3 row already flags it "status/licence
   controlled" — and if it does, that state will rest on the recorded licence assessment as its
   `evidence[]`, not on convenience.

**What the row *does* say about licensing is unusual and load-bearing.** Of the thirteen wave-2
groups this is the only one whose tier column carries "**status/licence controlled**". PRD §11.1 is
the governing text:

> "Every SourceArtifact MUST link to the LicenceSnapshot applicable when acquired. LicenceAssessment
> MUST independently state commercial-use, storage, indexing, embedding, display, quotation, export,
> attribution and prohibited-use decisions."
>
> Assessment states: `PERMITTED`, `PERMITTED_WITH_ATTRIBUTION`, `METADATA_AND_LINK_ONLY`,
> `UNCLEAR_RESTRICTED`, `PROHIBITED`, `REVIEW_REQUIRED`.
>
> "Unclear rights default to metadata, limited quotation and official links. The product MUST NOT
> reproduce third-party commercial headnotes or imply government endorsement. Customer exports MUST
> apply the same restrictions."

Plan §5.8's goal is exactly that emphasis: *"PAYG/STP/super/FBT employer material with licence
control."* The licence assessment is therefore not paperwork on this ticket — it is a deliverable
with mechanical consequences through `INGF-04`'s gate (storage, indexing, embedding, display,
quotation, export) and through `EVID-06` and `XPRT-02`–`XPRT-04` at render and export time.

**PRD §6.2 fixes the subject scope:** *"PAYG, Single Touch Payroll, FBT, superannuation and Payday
Super materials relevant to employment/payroll."* The ATO publishes a very large site covering the
whole tax system; "relevant to employment/payroll" is the boundary, and it must be an auditable
committed list rather than a crawler's judgment — the same discipline PRD §40.2 imposes on wave 1
("A maintained subject/title allowlist plus dependency expansion records why each title is
included").

**Two authority levels live in this group (PRD §9.1).** Level 6 is "Official regulator guidance,
rulings, decision summaries and impact materials"; level 7 is "Explanatory memoranda and interpretive
materials". ATO **rulings** and ATO **web guidance** are not the same kind of thing, and PRD §9.1's
closing rule applies to both: *"Guidance MUST NOT silently override legislation, an operative
instrument or binding authority."* As with `SINS-05`, the adapter emits `document_type` +
`authority_key` and never a level; `FND-10` computes the hierarchy (sub-PRD **D5**, PRD §45.2).

**Rates (PRD §40.3, `SINS-01`).** Withholding scales, superannuation-guarantee percentages, FBT rates
and gross-up factors, and the various caps and thresholds are all date-versioned legal facts:
*"Rates are date-versioned legal facts, not mutable fields. A displayed rate must cite its official
date-specific source and applicable legislation/guidance role."* This ticket is `blocked_by SINS-01`
and uses `_shared/rates` for all of them. Most are FY-periodised, so the three PRD §6.6 financial
years (2026-27, 2025-26, 2024-25) are the natural three time points of PRD §40.8 item 6 (sub-PRD D8).

**No value may be hardcoded (`SINS-01` sub-PRD D3).** `RateFact` construction fails unless the
declared value re-parses from its own quoted source span. A super-guarantee percentage or FBT rate
the Builder "knows" but the committed fixture does not contain **cannot** be emitted. This is
deliberate: these are exactly the numbers a language model will confidently recall and get wrong for
a given year.

**No `SLEG-02` edge (sub-PRD N6).** Plan §5.8 gives this ticket `blocked_by: [SINS-01]` only, so the
Commonwealth legislation nodes an ATO rate would cite as its applicable law may not exist.
`legislation_ref` is optional; an unresolved link records a `RATE_LEGISLATION_LINK_MISSING` finding
and a `known_gaps` entry — never a fabricated link.

**Payday Super and future material.** PRD §6.2 names "Payday Super materials". Where the ATO publishes
guidance about a measure that is not yet operative, this ticket captures the **guidance document**
with its own dates; the commencement or enactment **event** for the underlying law belongs to
`FUTURE-CTH` (`SFUT-02`, module `10-sources-future`) and `LEG-CTH` (`SLEG-02`). PRD §6.5 requires
future material to be "stored and searchable but … separated from current-law answers and visibly
labelled"; PRD §6.7 gives `ENACTED_NOT_IN_FORCE` and `BILL_NOT_ENACTED`. A rate fact whose
`applies_from` is in the future is emitted with that interval and never with an open past interval.

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

Deliver the `ATO-EMPLOYMENT` source adapter under `pipelines/adapters/ato-employment/**`: the
per-adapter `registry.yaml`, `allowlist.yaml`, a **fully reasoned `licence.yaml`** + immutable licence
snapshot with all nine PRD §11.1 axes, an `adapter.py` exposing `ADAPTER: SourceAdapter` with all
eight PRD §40.7 boundaries over the employment/payroll ATO collections, a committed **subject-scope
allowlist** restricted to PAYG/STP/super/FBT employer material, document typing that separates
rulings from web guidance and can never be operative law, **withholding/super/FBT rates and thresholds
emitted as `SINS-01` `RateFact`s across the three PRD §6.6 financial years**, and the complete PRD
§40.8 fixture set — such that
`python -m <iroot>.conformance check pipelines/adapters/ato-employment` exits 0 in strict mode and the
group's licence assessment demonstrably controls storage, indexing, embedding, display, quotation and
export through `INGF-04`'s gate.

## Non-goals

- **No non-employment tax material.** Income tax generally, GST, excise, individuals' returns and any
  ATO topic outside PRD §6.2's list are out of scope and excluded by the subject-scope allowlist.
- **No legislation or legislative instruments.** Commonwealth tax law is `LEG-CTH` (`SLEG-02`,
  module `06`); this ticket has no edge to it and emits no legislation document or event.
- **No future-status events.** Bills, enactment, commencement and disallowance events are
  `FUTURE-CTH` (`SFUT-02`, module `10`). This ticket captures ATO *guidance about* a future measure
  as a dated guidance document.
- **No payroll-tax material.** State and territory payroll tax is `SINS-07`…`SINS-14`; the ATO does
  not administer it.
- **No PRD §9.1 hierarchy computation** — `FND-10` (sub-PRD **D5**).
- **No rate model changes.** `SINS-01` owns `_shared/rates/**`; extending it is a `SINS-01` ticket
  update, never a local variant (plan §9 **R2**).
- **No tax or withholding calculation.** The product is research, not a payroll engine (PRD §3.3,
  §11.2 "not legal representation", "MUST NOT state that a customer is definitely compliant").
- **No licence-limited rendering.** Enforcing quote limits and attribution at display and export time
  is `EVID-06` (`12-evidence-safety`) and `XPRT-02`–`XPRT-04` (`19-exports`). This ticket produces the
  assessment those layers enforce.
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

- `pipelines/adapters/ato-employment/**` — the whole group directory: `registry.yaml`,
  `allowlist.yaml`, `licence.yaml`, `licence-snapshots/`, `conformance.yaml` (optional), `adapter.py`,
  `fixtures/**`, `tests/**`, `README.md`.
- Does not touch: `pipelines/adapters/_shared/**` — `SLEG-01`, `SINS-01`, `SCAS-01`, `SFUT-01`. This
  ticket **imports** `_shared/rates` read-only.
- Does not touch: `pipelines/adapters/{fwc-docs,fwc-awards,fwc-agreements,fwo-guidance}/**` and
  `pipelines/adapters/pt-*/**` — `SINS-02`…`SINS-05`, `SINS-07`…`SINS-14`.
- Does not touch: `pipelines/adapters/leg-cth/**`, `future-cth/**` — modules `06`, `10`.
- Does not touch: `pipelines/ingestion/**`, `pipelines/corpus-builder/**`, `schemas/**` — modules
  `05`, `04`, `00`.
- Does not touch: `packages/citations/**`, `apps/api/src/routes/exports/**` — `12-evidence-safety`,
  `19-exports`.
- Does not touch: `evals/**`, `pipelines/evaluation/**` — `21-evaluation-600`.
- Does not touch: `packages/**`, `apps/**`, `services/**`, `tests/**`, `infra/**`,
  `.github/workflows/**`.
- `pipelines/adapters/pyproject.toml` (if it exists) — **append-only**, shared-additive; resolve
  conflicts by re-running `uv lock` (plan §1.1, PRD §44.3). Expected untouched (sub-PRD D9).

**Serial safety.** First decomposition of `docs/PRD.md`; **nothing is merged and no ticket is in
flight**. `INGF-01`…`INGF-09` and `SINS-01` have landed and are read-only from here. The tickets that
may run concurrently are the other ten wave-2 siblings, each owning exactly one other group directory
— the fourteen scopes are pairwise disjoint by construction (`INGF-07` deliverable 1: one directory
per group, named `group_id.lower()`). The only potentially shared path is the optional
`pyproject.toml`, which is append-only.

## Deliverables

1. **`registry.yaml`** (`INGF-07` schema) with all nine PRD §6.1 attributes: `group_id:
   ATO-EMPLOYMENT`, `wave: 2`; `authority` = the Australian Taxation Office with
   `authority_type: REGULATOR`, `jurisdiction: CTH`, `official_url`; `official_endpoints` — one entry
   per employment/payroll collection actually used, each with `kind` and a PRD §40.5 `material_class`
   which for this group is **`GUIDANCE`, `POLICY` or `NEWS`** (rulings are typed at the document level
   per deliverable 6) — never `LAW` or `OPERATIVE_INSTRUMENT`; `document_coverage.families` covering
   PAYG withholding, STP, superannuation including Payday Super material, FBT, and employer
   guidance/rulings, with `financial_years` covering `2024-25`, `2025-26`, `2026-27` (PRD §6.6) or a
   `known_gaps` entry; `initial_index_tier: T1`; `change_detection.*` **as measured**; `known_gaps`
   with `customer_visible` flags; `evaluation_subset_ref`.
   `adapter_status` is whatever this ticket's evidence supports. If it is one of PRD §7's four limited
   states — `LICENSING_RESTRICTED` is the realistic candidate here — the file **must** also carry
   `INGF-07`'s `limitation` block: `state` equal to `adapter_status`, a closed-set `reason_code`, a
   `reason_detail`, a non-empty `evidence[]` (for a licensing limitation, the `LICENCE_ASSESSMENT`
   entry pointing at the captured snapshot), an `affected` scope naming the affected dates or
   collections, and a `customer_visible_warning` that also appears as a `customer_visible: true`
   `known_gaps` entry (sub-PRD **D11**; plan §8 **Q10**). If it is `ACTIVE`, `limitation` stays null —
   `INGF-07` rejects a non-limited status carrying one.
2. **`allowlist.yaml`** (`INGF-02` schema): `schemes: [https]`, the ATO host with `path_prefixes`
   covering exactly deliverable 1's endpoints and **no broader**, plus conservative politeness values.
   The allowlist is the second line of defence behind the subject-scope list.
3. **`licence.yaml` + `licence-snapshots/` — the group's headline deliverable.** Captured with
   `python -m <iroot>.licensing capture pipelines/adapters/ato-employment`. All nine PRD §11.1 axes
   stated **independently**: commercial use, storage, indexing, embedding, display, quotation, export,
   attribution, prohibited uses. `status` from the six PRD §11.1 states, with `attribution_text` and
   `max_quote_chars`. Where any axis is not clearly permitted the status is `UNCLEAR_RESTRICTED` or
   `REVIEW_REQUIRED`, which `INGF-04`'s gate collapses to metadata/link-only with the quote clamp —
   the PRD §11.1 default. The assessment's reasoning is recorded in the group `README.md` with the
   snapshot it was made from, so a later reviewer can re-derive it — and, where it drives a
   `LICENSING_RESTRICTED` registry status, it is the `evidence[]` entry deliverable 1's `limitation`
   block cites.
4. **Subject-scope allowlist.** A committed, documented list of the collections and topics in scope —
   PAYG withholding, STP, superannuation and Payday Super, FBT, employer guidance and rulings relevant
   to payroll — with a recorded reason per entry (PRD §6.2, mirroring PRD §40.2's title-allowlist
   discipline). A discovered page outside the list is not fetched. This list is the auditable answer
   to "why is this ATO page in an employment-law corpus?". It bounds *subject matter* as PRD §6.2
   defines it; it is not a device for reducing the group's mandatory scope (sub-PRD **D11**).
5. **`adapter.py`** exposing `ADAPTER: SourceAdapter` with
   `AdapterMeta(group_id="ATO-EMPLOYMENT", adapter_key="ato-employment", jurisdiction="CTH", …)` and
   all eight PRD §40.7 boundaries. `discover` traverses the allowlisted collections with a
   `DiscoveryCursor` and honours `since`; `fetch` through `ctx.fetcher` with conditional-request
   validators; `parse` through `ctx.parser`.
6. **Document typing: rulings vs guidance (PRD §9.1).** `identify()` assigns `document_type` from a
   **closed set** resolved against `packages/contracts` (sub-PRD **N1**) that distinguishes a formal
   ATO ruling or determination from general web guidance, and sets `official_identifier` from the
   source's own document reference where it prints one (a ruling identifier, a document/QC reference).
   A module-level constant names the **forbidden** set — legislation, legislative-instrument and
   operative-instrument types — and a guard raises before emission if a record would carry one.
   Identifiers are read from the source, never constructed or completed from model knowledge.
7. **Dated versions and status.** `normalise()` emits a `DocumentVersion` per distinct published state
   with `publication_date` where stated, `effective_from` where the document itself declares one,
   `retrieved_at` always, and `legal_status` from PRD §6.7's seven values — `STATUS_UNCONFIRMED`
   rather than a guess when the source states no date. A withdrawn or superseded ruling gets
   `SUPERSEDED`/`REPEALED` **only** on evidence (PRD §15.2: "Legal status MUST be derived from
   evidenced LegalEvents"). Content changes with no version label are detected by `content_hash` and
   produce a new version, never an in-place update (PRD §35.3).
8. **Rate and threshold facts through `SINS-01`.** For every rate, percentage, cap, threshold or
   gross-up factor the allowlisted material publishes, emit a `RateFact` with `fact_key` in a
   documented namespace (e.g. `ato.super-guarantee.rate`, `ato.fbt.rate`, `ato.fbt.gross-up.type-1`,
   `ato.payg.<scale-identifier>`), `jurisdiction: "CTH"`, the correct `RateKind` and `Unit`,
   `applies_from`/`applies_to` from the dates the source states, `financial_year` where the series is
   FY-periodised, `source_role: "OFFICIAL_GUIDANCE"` or `"RULING"` per deliverable 6, and `evidence`
   whose `quoted_text` is the exact span the number is printed in. Emission uses `rate_records()` —
   `SINS-01` deliverable 6's single mapping — so records are shape-identical to the payroll-tax
   groups'. `legislation_ref` stays `None` where the Commonwealth legislation nodes are absent, with a
   `RATE_LEGISLATION_LINK_MISSING` finding and a `known_gaps` entry (sub-PRD **N6**); it is never
   fabricated. A withholding scale that is a table of brackets uses `RateValue.shape = "BRACKETED"`;
   a value that varies by an employer or employee attribute uses `"DIMENSIONED"`.
9. **Series validation.** `validate()` runs `RateSeries.validate()` for every `fact_key` and returns
   the findings unchanged (`SINS-01` deliverable 5): `RATE_SERIES_OVERLAP` blocks;
   `RATE_FY_COVERAGE_INCOMPLETE` flags for this non-`PT-*` group; `RATE_UNIT_INCONSISTENT` blocks.
   A fact whose `applies_from` is in the future keeps its true interval and never an open past one.
10. **Fixtures (PRD §40.8 items 2, 4, 6, 7, 10).** `fixtures/discovery/`; `fixtures/dry-run.json`
    (`run_at` within `DRY_RUN_MAX_AGE_DAYS = 180`); `fixtures/documents/` covering every declared
    media type, scrubbed of customer data/cookies/credentials; **`fixtures/timepoints/` with the three
    PRD §6.6 financial years as its three legal dates** (sub-PRD D8), each producing a different
    applicable rate for at least one FY-periodised `fact_key`; `fixtures/quarantine/` with one
    defective artifact per declared reason code; `fixtures/baseline.json`.
11. **`tests/test_conformance.py`** — the five-line `ConformanceTestCase` subclass, plus unit tests
    for deliverables 4, 6, 7, 8 and 9.
12. **`conformance.yaml`** where resource ceilings or **tightened** anomaly thresholds are needed;
    `deferred_items` may contain only `11`.
13. **Failure codes** with `register_failure_codes("ato-employment", …)`, each with a non-empty
    operator action (PRD §40.8 item 10, ADM-001) — at minimum: page outside the subject allowlist,
    document type would be operative, ruling identifier unparseable, rate table not located, rate
    value not present in source, publication date unparseable.
14. **`README.md`** in the group directory: the subject-scope allowlist with its reasons, the
    ruling-vs-guidance typing rule, the `fact_key` namespace, **the licence assessment's reasoning and
    the snapshot it was made from**, the recorded change-detection capability with its evidence, the
    known gaps, and — if the group carries a `limitation` — the evidence, affected collections and
    customer-visible warning behind it.

## Acceptance checklist (classified)

**PRD §40.8 — the twelve-item adapter Definition of Done (all twelve required):**

- [ ] `[fixture]` **DoD 1** — `registry.yaml`, `allowlist.yaml`, `licence.yaml` validate;
      `ATO-EMPLOYMENT` is in `MANDATORY_SOURCE_GROUPS`; directory name == `group_id.lower()`; the
      licence snapshot's SHA-256 equals `snapshot.terms_sha256`; every endpoint URL passes the
      allowlist. **This is the group's Source Coverage Registry row** (PRD §6.1, A2).
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
- [ ] `[fixture]` **DoD 6** — the three PRD §6.6 financial years as three time points: each yields a
      `DocumentVersion` bracketing that date, a `legal_status` from PRD §6.7's seven values, events
      with `event_date`/`effective_date` distinguished, **and a different applicable rate for at least
      one FY-periodised `fact_key`**; no overlapping effect intervals (sub-PRD D8).
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
- [ ] `[machine]` `python -m <iroot>.conformance check pipelines/adapters/ato-employment` exits 0 in
      **strict** mode; the committed `conformance-report.json` shows no `FAIL` and no
      `NOT_AVAILABLE` (PRD §45.4).

**Group-specific:**

- [ ] `[machine]` **Licence control is mechanical (PRD §11.1, the §40.3 row's "status/licence
      controlled")** — for each of the six PRD §11.1 assessment states, `INGF-04`'s gate returns the
      expected decision for all six `IntendedUse` values (`STORE_ARTIFACT`, `INDEX_LEXICAL`, `EMBED`,
      `DISPLAY_TEXT`, `QUOTE`, `EXPORT`); with the group's **actual** recorded status, a test asserts
      the resulting permission set and `max_quote_chars`, and that an `UNCLEAR_*` status has collapsed
      to metadata/link-only (deliverable 3).
- [ ] `[machine]` **Subject-scope allowlist (deliverable 4)** — a discovered ATO URL outside the
      committed employment/payroll subject list is **not** fetched and produces the corresponding
      failure code; every entry has a recorded reason (PRD §6.2).
- [ ] `[machine]` **Rulings vs guidance typing (PRD §9.1)** — a ruling fixture and a web-guidance
      fixture receive different `document_type` values from the closed set; **no** record carries a
      legislation/legislative-instrument/operative-instrument type, and a mutation attempting one
      raises before emission (deliverable 6, sub-PRD D5).
- [ ] `[fixture]` **Rates as dated facts (PRD §40.3)** — every emitted rate is a `SINS-01` `RateFact`
      whose `evidence.quoted_text` slices exactly out of the parsed text and re-parses to the declared
      value; the emitted records follow `SINS-01` deliverable 6's order; a bracketed withholding-scale
      fixture round-trips through `RateValue.shape = "BRACKETED"` with contiguous, non-overlapping
      brackets (deliverable 8).
- [ ] `[machine]` **No hardcoded value (sub-PRD D3)** — a mutation that changes a rate **only in the
      adapter code** fails construction with `RateValueNotInSourceError`. This is the specific defence
      against a model-recalled superannuation or FBT number for the wrong year.
- [ ] `[machine]` **No mutable rate field** — a scan asserts the adapter holds no `current_*` or
      `latest_*` module-level mutable rate; lookups go through `RateSeries.as_at()` (PRD §40.3 "not
      mutable fields").
- [ ] `[machine]` **Future-dated facts stay future** — a fact whose `applies_from` is after the run
      date keeps that interval and does not open a past interval; the corresponding document is not
      given `IN_FORCE` without evidence (PRD §6.5, §6.7, §15.2).
- [ ] `[machine]` **Unresolved legislation link is honest** — with the Commonwealth legislation nodes
      absent, `legislation_ref` is `None`, a `RATE_LEGISLATION_LINK_MISSING` finding is recorded and a
      `known_gaps` entry exists; no relation is emitted (sub-PRD **N6**, PRD §9.3).
- [ ] `[machine]` **No legislation or future-status events** — the emitted stream contains no
      commencement, enactment, amendment or repeal event for legislation; those belong to `SLEG-02`
      and `SFUT-02` (Non-goals).
- [ ] `[machine]` The adapter imports no HTTP library and no HTML/XML/PDF parsing library —
      `INGF-01`'s AST scan over `pipelines/adapters/ato-employment/**` passes (PRD §37.4, SEC-002).
- [ ] `[machine]` `python -m <iroot>.registry validate pipelines/adapters/ato-employment` exits 0 and
      a `--mode release` compose containing this group succeeds with `ACTIVE` or a PRD §7 limited
      status **with** a `customer_visible: true` gap (PRD §7, §44.4).
- [ ] `[machine]` **A limited status is only expressible with its evidence (sub-PRD D11; plan §8
      Q10).** If this group's `adapter_status` is limited — most plausibly `LICENSING_RESTRICTED` — the
      `--mode release` compose carries the `limitation` block through verbatim and fails when any
      obligation is removed: no block → `REGISTRY_LIMITATION_MISSING`; empty `evidence` →
      `REGISTRY_LIMITATION_UNEVIDENCED`; no `affected` dates or collections →
      `REGISTRY_LIMITATION_SCOPE_MISSING`; empty `customer_visible_warning` →
      `REGISTRY_LIMITATION_WARNING_MISSING`. A `LICENSING_RESTRICTED` state's `evidence[]` resolves to
      the captured licence snapshot. If the group is `ACTIVE`, the same test asserts `limitation` is
      null and that adding one fails to load.
- [ ] `[machine]` The whole suite runs offline with no outbound network.
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, §20.3).
- [ ] `[machine]` `pnpm test` green — standing item; no TypeScript here, so "unchanged and green".
- [ ] `[human]` **Licence assessment sign-off — the group's defining human gate.** The nine PRD §11.1
      axes, the `status`, `max_quote_chars` and `attribution_text` are a legal judgment (PRD §11.2
      keeps `LEGAL_REVIEW_PENDING` an explicit launch risk), and PRD §11.1 forbids implying government
      endorsement. The Founder confirms the recorded assessment against the captured snapshot before
      the group is declared `ACTIVE`. This is what the §40.3 row's "status/licence controlled" means
      in practice.
- [ ] `[human]` **Subject-scope review** — is the committed allowlist the right employment/payroll
      boundary within a very large tax site? Irreducibly a judgment call; PRD §6.1 forbids
      over-claiming coverage and PRD §43.4 item 4 puts source adapter anomalies in the founder review
      queue.
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (`ADM-001`; supports `SRCH-002`,
      `SRCH-003`, and PRD §44.2 `E12`'s "Licence/source-role validation"); UAT IDs — **none owned**;
      schema/API/event compatibility (uses `SINS-01`'s `RATES_MODEL_VERSION` unchanged);
      tenant/PII/security impact (none — public official material; the fixture scan is the control);
      **source/licence impact — the load-bearing line for this ticket: the recorded assessment, its
      six-state consequences through `INGF-04`, and the export restrictions PRD §11.1 requires
      customers' exports to inherit**; cost/memory/latency impact (DoD item 12); rollback path (mark
      `IN_DEVELOPMENT`, exclude from a release compose); known gaps (sub-PRD N1, N6, plus this group's
      own `known_gaps` entries and — if it carries one — its `limitation` block with the evidence
      behind it; the anomaly thresholds are baseline-selected and consolidated by `GOLD-16`, plan §8
      **Q9**, and the limited-state launch policy itself is confirmed, plan §8 **Q10**, so it is not a
      gap in this ticket).
- **Absent classes:** none. This ticket carries `[machine]`, `[fixture]` and `[human]` criteria.

## Test plan

Harness: `uv run pytest pipelines/adapters/ato-employment -q` plus the conformance CLI. All replays
are offline through `INGF-09`'s `ReplayFetcher`/`ReplayClock`; the fetcher refuses a URL absent from
the fixtures **and** a URL present but outside `allowlist.yaml`. Copy the construction pattern from
`INGF-09`'s reference adapter (`pipelines/ingestion/src/<iroot>/conformance/reference/demo-registry/`)
and its authoring guide (`pipelines/ingestion/src/<iroot>/conformance/README.md`); copy the rate-side
pattern from `pipelines/adapters/_shared/rates/README.md` (`SINS-01`).

1. `uv sync --frozen && uv run pytest pipelines/adapters/ato-employment -q`.
2. `python -m <iroot>.registry validate pipelines/adapters/ato-employment` — exit 0.
3. `python -m <iroot>.conformance check pipelines/adapters/ato-employment --report conformance-report.json`
   — exit 0, twelve verdicts inspected individually; `NOT_AVAILABLE` is a failure, never a skip.
4. **`tests/test_licence_gate.py`** — the six-state × six-use matrix through `INGF-04`'s gate, then
   the group's actual status asserting its permission set, `max_quote_chars` and the `UNCLEAR_*`
   collapse.
5. **`tests/test_subject_scope.py`** — an out-of-scope ATO URL in a recorded listing is not fetched;
   every allowlist entry has a reason.
6. **`tests/test_document_typing.py`** — ruling vs guidance typing, and the forbidden-type mutation
   raising before emission.
7. **`tests/test_rate_facts.py`** — for each of the three financial-year time points,
   `RateSeries.as_at()` returns a different fact for at least one FY-periodised key; the bracketed
   withholding-scale round-trip; the "changed in code only" mutation asserting
   `RateValueNotInSourceError`; the future-dated fact keeping its interval.
8. **`tests/test_no_legislation_events.py`** — the emitted stream carries no legislation or
   future-status event.
9. **`tests/test_registry_status.py`** — the declared `adapter_status` composes in `--mode release`;
   if it is limited, the four `limitation` mutations each fail with their own `REGISTRY_LIMITATION_*`
   code, a `LICENSING_RESTRICTED` state's `evidence[]` resolves to the captured licence snapshot, and
   the block survives composition verbatim; if it is `ACTIVE`, adding a `limitation` fails to load
   (sub-PRD **D11**).
10. **`tests/test_architecture.py`** — re-runs `INGF-01`'s AST scan over this directory with a
    synthetic dirty module as negative control.
11. `uv run pytest` (whole repo) and `pnpm test` — green.

**Reviewer focus.** (a) Run `tests/test_rate_facts.py`'s "changed in code only" mutation first: these
are exactly the numbers a model recalls confidently and wrongly, and sub-PRD **D3** is the only thing
standing between that and a cited answer. (b) Read the licence assessment in the group `README.md`
against the captured snapshot — the §40.3 row singles this group out as "status/licence controlled",
and an over-permissive assessment propagates silently into display, quotation and customer exports.
(c) Confirm no ATO page outside the subject allowlist was fetched. (d) Confirm no ruling was typed as
operative law. (e) Confirm the recorded `change_detection.capability` is backed by evidence in
`fixtures/dry-run.json`. (f) If the group is limited, confirm the `limitation` block names a real
official-source constraint with evidence — for `LICENSING_RESTRICTED`, the captured snapshot — and not
a scope decision wearing a `reason_code` (sub-PRD **D11**).

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (docs PR/MR,
changelog line in `docs/prd/07-sources-instruments/README.md`, then `publish-tickets.mjs --sync`),
then change code. `GOLD-08` and `GOLD-16` are `blocked_by` this ticket.

**Foreseeable frictions and their exact writeback targets:**

1. **Rights are unclear, restricted or prohibited** → this is the expected case for a
   "status/licence controlled" group, and it is **not** a reason to soften anything in code. Record
   the true PRD §11.1 status; let `INGF-04`'s gate collapse it to metadata/link-only with the quote
   clamp; set the registry status to **`LICENSING_RESTRICTED`** with a `known_gaps` entry marked
   `customer_visible: true` and a `limitation` block whose `reason_code` is `LICENSING_RESTRICTION`,
   whose `evidence[]` cites the captured licence snapshot, whose `affected` scope names the affected
   collections and whose `customer_visible_warning` states plainly what customers will not see; and
   update `docs/prd/07-sources-instruments/README.md`. PRD §44.4: "It is not permitted to silently
   call an unimplemented source category covered." A silent downgrade of indexing, embedding or
   quotation **without** the registry status is forbidden.
2. **The site has no reliable delta mechanism** → record the true `change_detection.capability`, let
   `INGF-07` derive **`FRESHNESS_LIMITED`**, add a customer-visible `known_gaps` entry, populate the
   `limitation` block (`reason_code: OFFICIAL_CAPABILITY_LIMIT` or `FRESHNESS_LIMITATION`, the
   capability-probe evidence, the affected collections, the warning), and update this module's README.
   PRD §12.1 requires this "rather than a false guarantee". Never declare a capability the dry-run did
   not demonstrate.
3. **A rate exists only in a downloadable calculator, spreadsheet or image with no addressable text**
   → **do not emit the fact.** Record a `known_gaps` entry with `reason_code: FORMAT_UNSUPPORTED` and
   `customer_visible: true`; if it makes the group's rate coverage claim untrue, set
   `METADATA_AND_LINK_ACTIVE` with a complete `limitation` block. PRD §40.3 requires a date-specific
   cited source; an uncited number is worse than an absent one, and PRD §43.3 gates unsupported
   definitive claims to zero. The status follows the evidence, never convenience (plan §8 **Q10**,
   confirmed policy).
4. **The `SINS-01` rate model cannot express a withholding scale or a multi-dimensional cap** →
   extend `_shared/rates` **through a `SINS-01` ticket update** (its deliverable 3), update
   `docs/prd/07-sources-instruments/README.md` **D2**, then re-publish the nine dependents. A local
   variant is the failure plan §9 **R2** exists to prevent.
5. **The needed `document_type` for an ATO ruling does not exist in `packages/contracts`** (sub-PRD
   **N1**) → do not invent a literal: `CRPS-01` deliverable 4 generates SQLite `CHECK` constraints
   from the enums, so it would fail at build time. Use the nearest existing value, record the
   compromise in this module's README **N1** row, and raise the enum addition against `FND-03` via
   `docs/prd/breakdown-plan.md` §5.1.
6. **A rate's applicable legislation is needed for the answer to be defensible** (sub-PRD **N6**) →
   keep `legislation_ref` optional and record the finding plus the `known_gaps` entry. If the
   dependency is genuinely hard, the writeback is a **plan** change adding `SLEG-02` to this ticket's
   `blocked_by` in `docs/prd/breakdown-plan.md` §5.8 and §6.2 — never an invented link.
7. **Payday Super or another not-yet-operative measure tempts a current-law fact** → keep the true
   `applies_from` and the true `legal_status`. PRD §6.5 requires future material to be "separated from
   current-law answers and visibly labelled" and PRD §6.7 provides `ENACTED_NOT_IN_FORCE`. The
   status **event** for the underlying law is `SFUT-02`'s; do not emit it here.

**Escalation rule.** If the twelve-item Definition of Done cannot be satisfied for this mandatory
group, PRD §7 and PRD §44.4 forbid leaving it `PLANNED_NOT_ACTIVE` or calling it covered. Stop and
record the true status together with its complete `limitation` block — evidence, affected dates or
collections, customer-visible warning and the reason full coverage is unavailable. The governing
policy is **confirmed** (plan §8 **Q10**; sub-PRD **D11**), so the question raised is never "may this
group be dropped or reduced" but only "does the measured evidence show a genuine official-source
limitation"; `GOLD-16` produces the evidence and the proposed registry state, `LNCH-05` verifies the
launch statement, and Gate 2 is the verification and sign-off step. If the licence assessment turns
out to prohibit storage or indexing outright, that changes what the product can say about
PAYG/STP/super/FBT and is a **product** escalation under PRD §45.5 requiring founder approval — not an
engineering workaround.
