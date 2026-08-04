---
id: SCAS-09
title: CASE-WA
module: 08-sources-cases
lane: 08-sources-cases
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [SCAS-01]
blocks: [GOLD-16]
---

# SCAS-09 — `CASE-WA`

Implements PRD §40.4 (wave 3 roster, the `CASE-WA` row), PRD §6.3/§6.4 (state scope; case law and
decisions), PRD §9.1/§9.2 (authority hierarchy; case treatment) and PRD §40.8 (adapter Definition of
Done) <SRCH-004, SRCH-005, ADM-001> — no ADR — the decision is already made in PRD §40.4; this is
build ticket 9 of 13 against it.
Parent sub-PRD: [08-sources-cases README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [SCAS-01 — Case-law primitives: citation, level, paragraph identity, treatment](SCAS-01-case-law-primitives-citation-level-paragraph-identity-treatment.md)
**Why `builder`:** a bounded adapter inside one declared directory against a contract PRD §40.7/§40.8
and `SCAS-01` already fix — not a new subsystem decision.

## Background + basis

**PRD §40.4 gives this group's row verbatim:**

> | Group ID | Official entry/collection | Minimum included material | Initial tier |
> |---|---|---|---|
> | `CASE-WA` | WA courts and WAIRC — <https://www.wairc.wa.gov.au/> | Relevant judgments, WAIRC decisions/orders/awards/agreements | T2; operative instruments T1 |

**This is the widest material set of any state group.** The row asks for judgments, WAIRC decisions
**and orders**, **state awards** and **state industrial agreements** — four document classes, two of
which are operative instruments. Western Australia runs its own state industrial relations system, so
these state awards and agreements are **not** the federal instruments owned by
`07-sources-instruments` (`SINS-03` `FWC-AWARDS`, `SINS-04` `FWC-AGREEMENTS`); the roster deliberately
places them in this group.

PRD §9.1 ranks *"FWC orders, approved agreements, modern awards and decisions with operative effect"*
(rank 4) above *"Persuasive court, tribunal and FWC decisions"* (rank 5), and PRD §36.2's eligibility
predicate begins *"requested date ∈ effective interval"* — so an operative instrument needs a
structured effective interval and a PRD §6.7 `legal_status`, not prose. That is also why the row's tier
is split: *"T2; operative instruments T1"*.

**The row gives one URL and names a second publisher class ("WA courts") without one.** PRD §40.4's
closing paragraph therefore still binds:

> "**Every state/territory group must be decomposed into exact official collections before
> implementation.** If an official court does not publish a relevant class or historical range, the
> registry records `SOURCE_UNAVAILABLE` or date-limited coverage; **the product does not silently
> substitute a commercial headnote site.**"

The exact WA court collections are discovered at the official courts' own sites during the recording
run and recorded in `registry.yaml` and `allowlist.yaml`; multiple publishers are expressed inside one
`registry.yaml` (sub-PRD **Q9**).

**Relevance is a recorded criterion, not a hidden filter** (PRD §40.2's analogous rule; PRD §44.4).
PRD §6.3 requires, for Western Australia, *"employment and industrial-relations legislation and
guidance … and relevant regulators, courts and tribunals"*; PRD §6.4 requires *"Relevant state and
territory courts and tribunals"*.

**PRD §7** fixes the release rule and the only permitted limited states:

> "No mandatory source group may remain `PLANNED_NOT_ACTIVE` at release. A group blocked by official
> capability or licensing MUST use an explicit status such as `METADATA_AND_LINK_ACTIVE`,
> `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED` or `SOURCE_UNAVAILABLE` and MUST produce
> customer-visible warnings when relevant."

**PRD §40.8 is the twelve-item Definition of Done** and PRD §45.4 makes it a PR gate: (1) registry
row(s), official URL allowlist and licence snapshot/assessment; (2) discovery fixture and live dry-run
evidence; (3) stable identity/version rules, including deletion/unavailability behaviour;
(4) representative HTML/XML/JSON/PDF fixtures without customer data; (5) parser/node hierarchy and
exact-text round-trip tests; (6) historical/effective/status/event behaviour for at least three time
points; (7) incremental no-change, changed, removed and transient-failure tests; (8) count/hash
baseline and anomaly thresholds; (9) freshness schedule and last-check/last-ingest separation;
(10) quarantine cases and operator recovery action; (11) retrieval/citation evaluation subset;
(12) measured storage, parse time, index size and peak memory.

**PRD §44.2 `E14-CASES` exit evidence** is *"Case metadata/paragraph/treatment evidence tests"*.

**Downstream.** Plan §6.2: `SCAS-09 --> GOLD-16`.

**Carried caveats.** Sub-PRD **Q7** (operative instruments and `_shared/legislation` — the default is
the `CRPS-01` effective-interval fields; a genuine need is a **plan** change, never an unordered
import), **D12**, **D13**, **D14**, **D15** (attempted in full; a limited state only on measured
evidence of a genuine official-source limitation, recorded in `INGF-07`'s `limitation` block —
plan §8 **Q10** is a confirmed policy), **Q5** (whether this group ends up limited is a `GOLD-16`
measurement output, never a scope choice), **Q6** (PRD §40.9's thresholds are baseline-selected
initial defaults, tightenable after a representative baseline), **Q9**.

## Goal

Deliver `pipelines/adapters/case-wa/` as a complete PRD §40.8-conforming source group: a
`registry.yaml` that **decomposes the WA court collections and the WAIRC collections into exact
official endpoints**, distinguishing judgments and decisions from **orders, state awards and state
agreements**, recording the split T2/T1 tier rule and the employment-relevance criterion; the URL
allowlist; licence snapshot(s) and assessment; an `adapter.py` implementing PRD §40.7's eight
boundaries over `SCAS-01`'s primitives with **structured effective intervals and PRD §6.7 statuses on
every operative instrument**; recorded offline fixtures for discovery, documents, three time points,
incremental change and quarantine; a count/hash baseline; and the five-line `ConformanceTestCase`
subclass — such that `python -m <root>.conformance check pipelines/adapters/case-wa` exits `0` in
strict mode with a committed `conformance-report.json`, and `CASE-WA` composes into the Source
Coverage Registry as `ACTIVE` or an explicit PRD §7 limited state.

## Non-goals

- **No shared case-law helper** — `_shared/caselaw/**` is `SCAS-01`'s (plan §9 **R2**).
- **No use of `_shared/legislation/**` or `_shared/rates/**`** — `SLEG-01`, `SINS-01`; no `blocked_by`
  edge orders either before this ticket (sub-PRD **Q7**).
- **No framework code** — `INGF-02`…`INGF-06`, `INGF-09`.
- **No WA legislation** — `06-sources-legislation` / `SLEG-06` (`LEG-WA`). A state award made under an
  Act is an instrument of this group; the Act itself is not.
- **No WA regulator, WHS, equal-opportunity, WorkCover or portable-LSL material** —
  `09-sources-adjacent` / `SADJ-05` (`ADJ-WA`).
- **No federal awards or agreements** — `07-sources-instruments` / `SINS-03`, `SINS-04`. WA state
  instruments belong here per the roster row; federal ones never do.
- **No other decision group** — `SCAS-02`…`SCAS-08`, `SCAS-10`…`SCAS-13` (sub-PRD **D9**).
- **No commercial headnote, editorial summary or aggregator content** (PRD §6.1, §40.4; **D13**).
- **No corpus table writes, chunking, tiering policy, embedding or ranking** — PRD §40.7; `CRPS-03`,
  `CRPS-04`, `RETR-06`.
- **No Coverage Navigator logic** — `ASK-08`. This group supplies instrument documents, not
  classification workflow.
- **No evaluation cases or gold answers** — `21-evaluation-600`; `evals/gold/**` never read.
- **No binding/persuasive computation** — `FND-10` (sub-PRD **D8**).

## File-scope (write-owns)

- `pipelines/adapters/case-wa/**` — the whole group directory in `INGF-07` deliverable 1's layout:
  `registry.yaml`, `allowlist.yaml`, `licence.yaml`, `licence-snapshots/`, `conformance.yaml`,
  `adapter.py`, `fixtures/`, `tests/`, `README.md`.
- Does not touch: `pipelines/adapters/_shared/**` — `SCAS-01`, `SLEG-01`, `SINS-01`, `SFUT-01`.
- Does not touch: any sibling `pipelines/adapters/case-*/**` — `SCAS-02`…`SCAS-08`, `SCAS-10`…`SCAS-13`.
- Does not touch: `pipelines/adapters/leg-wa/**` (`SLEG-06`), `adj-wa/**` (`SADJ-05`), `pt-wa/**`
  (`SINS-10`), `fwc-awards/**` / `fwc-agreements/**` (`SINS-03`, `SINS-04`).
- Does not touch: `pipelines/ingestion/**` (`05`), `pipelines/corpus-builder/**` (`04`),
  `pipelines/evaluation/**` and `evals/**` (`21`), `packages/**`, `apps/**`, `services/**`,
  `tests/**`, `schemas/**`, `infra/**`.
- `pipelines/adapters/pyproject.toml` (if present): **append-only**, expected to need no change
  (plan §1.1, PRD §44.3).

**Serial safety.** First decomposition of `docs/PRD.md`; nothing merged, nothing in flight. `SCAS-01`
has landed — the only blocker. The eleven sibling adapter tickets run **concurrently** (plan §7: peak
12 lanes), disjoint by directory; the twelve share only the `_shared/caselaw/**` library they import
and none of them writes. Modules `06`, `07` and `09` tickets covering WA write their own group
directories. The single shared path is `pipelines/adapters/pyproject.toml`, append-only by plan §1.1.

## Deliverables

1. **`registry.yaml` — the collection decomposition (DoD item 1; the ticket's primary deliverable).**
   `group_id: CASE-WA`, `wave: 3`. `official_endpoints[]` enumerates the **exact** official collections
   of the WAIRC (from the URL the roster row gives) and of the WA courts (discovered during the
   recording run), each with `kind` and `material_class` — judgments and WAIRC decisions are
   `DECISION`; **orders, state awards and state agreements are `OPERATIVE_INSTRUMENT`**.
   `initial_index_tier` records the row's `T2` default and `document_coverage` records the *"operative
   instruments T1"* rule with the evidence used to decide "operative".
   `document_coverage.families` separates `JUDGMENT`/`DECISION` from `ORDER`/`STATE_AWARD`/
   `STATE_AGREEMENT`; the employment-relevance criterion is written down; `financial_years` covers at
   least 2024–25, 2025–26 and 2026–27 (PRD §6.6) or carries a `known_gaps` entry (`reason_code:
   DATE_LIMITED`, `customer_visible: true`). **PRD §6.6 also states that an agreement MUST NOT be
   treated as ceased merely because its nominal expiry date has passed** — that rule governs this
   group's state agreements directly. `change_detection` states the real observed capability per
   collection; `evaluation_subset_ref` names the evaluation ids.

   **Limited state, if any (`INGF-07` deliverable 3).** If — and only if — this group's
   `adapter_status` is one of PRD §7's four limited states, `registry.yaml` also carries `INGF-07`'s
   `limitation` block, complete: `state` equal to `adapter_status`, a `reason_code` from `INGF-07`'s
   closed set, a mandatory `reason_detail`, a non-empty `evidence[]` of measured or official-source
   facts, an `affected` scope naming the dates or collections, and a `customer_visible_warning` that
   also appears as a `customer_visible: true` `known_gaps` entry. The schema is `INGF-07`'s and is
   never redefined here; composition fails with `REGISTRY_LIMITATION_MISSING`,
   `REGISTRY_LIMITATION_UNEVIDENCED`, `REGISTRY_LIMITATION_SCOPE_MISSING` or
   `REGISTRY_LIMITATION_WARNING_MISSING` if any part is absent, and an `ACTIVE` group carrying a
   non-null `limitation` fails to load. A limited state is permitted only on measured evidence of a
   genuine official-source limitation — never as a way to reduce this group's scope (sub-PRD **D15**;
   plan §8 **Q10**, confirmed policy).

2. **`allowlist.yaml` (DoD item 1; `INGF-02`'s schema).** Only official WAIRC and WA court publisher
   hosts verified during the recording run. No aggregator, no commercial reporter (**D13**).
3. **`licence.yaml` + `licence-snapshots/<date>-<hash>.<ext>` (DoD item 1; `INGF-04`).** Terms captured
   at acquisition with SHA-256 for **each** publisher whose terms differ, plus an independent
   `LicenceAssessment` over all nine PRD §11.1 axes. Unclear rights collapse to metadata/link-only →
   `METADATA_AND_LINK_ACTIVE` with a customer-visible gap; the **more restrictive** assessment governs
   ambiguous provenance. Any limited status set here
   carries deliverable 1's `limitation` block (`reason_code: LICENSING_RESTRICTION`, with the licence
   assessment and its snapshot hash as evidence).
4. **`adapter.py` — `ADAPTER: SourceAdapter`** (`INGF-01` deliverables 4 and 9) implementing all eight
   PRD §40.7 boundaries: `discover` (official listings/feeds only, conditional requests), `fetch`
   (`ctx.fetcher`), `identify` (`SCAS-01`'s `case_identity()` — neutral citation where published, else
   court/tribunal or instrument identifier, else URL path with `weak=True`), `parse` (`ctx.parser`),
   `normalise` (`build_judgment_nodes()` for decisions; the same node machinery with
   `document_type = OPERATIVE_INSTRUMENT` plus a real `effective_from`/`effective_to` and a PRD §6.7
   `legal_status` for orders, awards and agreements), `extract_events` (`case_event()` for
   decision-handed-down, appeal outcomes and instrument made/varied/replaced/cancelled events, each
   with an evidence span or a named official field), `extract_relations` (`resolve_citations()` →
   `CITES`; `assert_treatment()` only with a resolvable evidence span), `validate`
   (`case_validation()` plus the instrument-interval and relevance-basis rules). `AdapterMeta` declares
   `group_id="CASE-WA"`, `adapter_key="case-wa"`, `jurisdiction="WA"`.
5. **Operative instruments are modelled, not flattened.** Every order, award and agreement carries a
   structured effective interval and a PRD §6.7 status; an overlapping consolidated series is a
   `BLOCK` finding (PRD §40.9, §35.2); an instrument with no determinable effective date is quarantined
   rather than defaulted to its publication date. A **state agreement past its nominal expiry is not
   marked ceased** without an evidenced cessation event (PRD §6.6).
6. **Court-code registration.** `register_court_codes("CASE-WA", {...})` with `CourtFacts` for every WA
   court/tribunal neutral-citation code ingested (including the WAIRC and its Full Bench where the
   source distinguishes one), each with `authority_type`, the contract `court_level` and
   `is_appellate`. An unregistered code quarantines.
7. **Relevance basis recorded per document** — the criterion that put each document in scope,
   summarised in the run report; no determinable basis fails the run (PRD §44.4).
8. **Recorded fixtures (DoD items 2, 4, 6, 7, 10) under `fixtures/`.** Captured from the official
   collections through `INGF-02`'s fetcher in a one-off recording run, committed as replayable
   transcripts (`INGF-09` deliverable 6 format), **never hand-authored** (**D12**): `discovery/`
   (≥1 per publisher), `dry-run.json` (≤180 days old), `documents/` (one per declared media type,
   including at least one WA court judgment, one WAIRC decision, **one state award or order** and
   **one state agreement**), `timepoints/` (≥3 legal dates, exercising inside/outside an instrument's
   interval and a post-nominal-expiry agreement), `incremental/` (304, changed, removed, transient
   5xx), `quarantine/` (≥1 per declared reason code), `baseline.json`.
9. **No-customer-data hygiene (DoD item 4).** No `Set-Cookie`, `Authorization`/`Bearer`, session token,
   personal email or TFN-shaped content. Published party names are public case parties (PRD §10.1);
   officially anonymised material is never de-anonymised (**D14**). Employer names and ABNs appearing
   in a state agreement are public business information (PRD §10.1) and are recorded as structured
   fields where the source provides them.
10. **`conformance.yaml`** — DoD item 12 ceilings and tighten-only `anomaly_overrides` (PRD §40.9).
    `deferred_items` may contain only `11`.
11. **`tests/`** — the five-line conformance subclass plus group-specific unit tests: per-publisher
    discovery, decision-vs-instrument modelling, interval and status resolution at three dates,
    post-nominal-expiry agreement handling, relevance-basis recording, court-code/level mapping,
    paragraph round-trip, citation offsets, treatment evidence, identity stability.
12. **`README.md`** — which collections were decomposed and why, the decision/instrument split, the
    T2/T1 tier rule, why WA state awards and agreements are **not** `SINS-03`/`SINS-04` material, the
    licence position per publisher, the observed change-detection capability, and every `known_gaps`
    entry. Read by `GOLD-16` and the Founder at Gate 2 (PRD §41.3 step 1).
13. **`conformance-report.json`** committed at the group root — the PRD §45.4 evidence artifact.

## Acceptance checklist (classified)

The twelve PRD §40.8 items, in order, each proved for `CASE-WA`:

- [ ] `[fixture]` **DoD 1 — registry row, URL allowlist, licence snapshot/assessment.** All three files
      validate; `group_id` is in `MANDATORY_SOURCE_GROUPS`; directory name is `case-wa`; each
      snapshot's SHA-256 matches its `terms_sha256`; every endpoint passes the allowlist (PRD §40.8
      item 1, §6.1, §11.1).
- [ ] `[machine]` **PRD §40.4 decomposition.** `official_endpoints[]` lists exact collections for the
      WAIRC and for the WA courts with a `material_class` each, distinguishing `DECISION` from
      `OPERATIVE_INSTRUMENT`; no bare homepage; no aggregator host in `allowlist.yaml` (PRD §40.4
      closing paragraph, §6.1; **D13**).
- [ ] `[fixture]` **DoD 2 — discovery fixture and live dry-run evidence.** ≥1 `RemoteDescriptor` per
      publisher with an allowlisted URL; `dry-run.json` present, well-formed, ≤180 days old (PRD §40.8
      item 2).
- [ ] `[fixture]` **DoD 3 — stable identity and deletion/unavailability.** Deterministic and stable
      across two recorded versions (a decision and an instrument); no collisions; a removed descriptor
      yields `REMOVED`, retains the prior version and deletes no state (PRD §40.8 item 3).
- [ ] `[fixture]` **DoD 4 — representative fixtures without customer data.** Every declared media type
      has a fixture; the no-customer-data scan passes (PRD §40.8 item 4).
- [ ] `[fixture]` **DoD 5 — parser/node hierarchy and exact-text round-trip.** `assert_roundtrip()`
      passes for judgments, decisions **and** instruments; one root, no cycles, contiguous sibling
      ordinals, every `text_hash` recomputes; `[N]` ↔ `para/NNNN` (PRD §40.8 item 5, §15.3;
      **E14 "paragraph"** evidence).
- [ ] `[fixture]` **DoD 6 — three time points.** The instrument resolves correctly inside and outside
      its interval; the state agreement is **not** treated as ceased at its nominal expiry without an
      evidenced cessation event (PRD §6.6); decisions resolve at their decision date; PRD §6.7 statuses
      are used; events distinguish `event_date` from `effective_date`; no overlapping intervals
      (PRD §40.8 item 6, §15.2, §35.2, §36.2, §40.9).
- [ ] `[fixture]` **DoD 7 — incremental matrix.** No-change (304 → 0 fetched, change-scan date
      advanced, ingestion date unchanged), changed, removed, transient failure (bounded retry →
      `PARTIAL`, no content quarantine) (PRD §40.8 item 7).
- [ ] `[fixture]` **DoD 8 — count/hash baseline and anomaly thresholds.** The replayed run reproduces
      `baseline.json` exactly, per collection; overrides tighten only (PRD §40.8 item 8, §40.9;
      **Q6**).
- [ ] `[machine]` **DoD 9 — freshness schedule with last-check/last-ingest separation.** A replayed 304
      run and a replayed content run write different fields (PRD §40.8 item 9, §12.1).
- [ ] `[fixture]` **DoD 10 — quarantine cases and operator recovery.** Every declared reason code has a
      defective fixture producing exactly that code, including an instrument with no determinable
      effective date; each code has a non-empty operator action (PRD §40.8 item 10, ADM-001).
- [ ] `[machine]` **DoD 11 — retrieval/citation evaluation subset.** `evaluation_subset_ref` non-empty
      and well-formed; ids resolve if `evals/cases/**` exists, else `DEFERRED(GOLD-16)` with a reason;
      `evals/gold/**` never read (PRD §40.8 item 11; plan §9 **R9**).
- [ ] `[fixture]` **DoD 12 — measured storage, parse time, index size, peak memory.** All four recorded
      and within `conformance.yaml` ceilings (PRD §40.8 item 12, §39.2).
- [ ] `[machine]` `python -m <root>.conformance check pipelines/adapters/case-wa` exits `0` in
      **strict** mode; the committed report shows `summary.pass == 12` (or item 11 `DEFERRED`) and
      `"strict": true` (PRD §45.4).
- [ ] `[machine]` `INGF-07`'s composer includes `CASE-WA` with all nine PRD §6.1 attributes, a
      `material_class` per endpoint, the five PRD §12.1 dates separated, and a release-acceptable
      status with a customer-visible gap entry if limited (PRD §6.1, §7, §12.1, ADM-001).
- [ ] `[machine]` **A limited status composes only with its complete `limitation` block.** If
      `adapter_status` is one of PRD §7's four limited states, `INGF-07`'s composed output carries the
      `limitation` block verbatim — matching `state`, a closed-set `reason_code`, `reason_detail`, at
      least one `evidence` entry, an `affected` scope and a `customer_visible_warning` — and
      composition fails with `REGISTRY_LIMITATION_MISSING`/`_UNEVIDENCED`/`_SCOPE_MISSING`/
      `_WARNING_MISSING` when any part is missing; an `ACTIVE` group carries `limitation: null`
      (`INGF-07` deliverables 3 and 7; sub-PRD **D15**; plan §8 **Q10**).
- [ ] `[machine]` **Instruments are structurally distinct from decisions** and carry effective
      intervals plus PRD §6.7 statuses; an overlapping consolidated series is a `BLOCK` finding
      (PRD §9.1 ranks 4–5, §36.2, §40.9; deliverable 5).
- [ ] `[machine]` **State instruments are not federal ones.** A test asserts this group emits no
      document claiming to be a federal modern award or FWC-approved enterprise agreement — that
      material is `SINS-03`/`SINS-04`'s (PRD §40.3 vs §40.4; sub-PRD **D9** boundary discipline).
- [ ] `[machine]` **Relevance basis is evidenced.** Every ingested document records the criterion that
      put it in scope; no determinable basis fails the run (deliverable 7; PRD §44.4).
- [ ] `[fixture]` **E14 "case metadata" evidence** — court/tribunal, level, decision date, file number
      and neutral citation (or a recorded reason none is published) for every recorded decision; an
      unregistered court code quarantines (PRD §44.2 `E14`, §9.2 bullet 1).
- [ ] `[fixture]` **E14 "treatment evidence" evidence** — an in-text citation produces `CITES` with a
      hash-matching span; any evidenced treatment produces exactly one correctly-directed relation; a
      citation-only pair reports `TREATMENT_NOT_CONFIRMED` (PRD §44.2 `E14`, §9.2; **D3**, **D4**).
- [ ] `[machine]` No `MODEL_SUGGESTED` relation and no evidence-free treatment can be emitted by this
      adapter — negative control over `adapter.extract_relations()` (PRD §9.3; **D5**).
- [ ] `[machine]` The adapter imports no HTTP or parser library, no corpus/app database module, and
      nothing from `pipelines/adapters/_shared/{legislation,rates}/**` (sub-PRD **Q7**) — `INGF-01`
      deliverable 11's architecture scan plus one added assertion (PRD §37.4, §40.7, §39.1).
- [ ] `[machine]` The whole suite runs offline: every test replays recorded fixtures with no outbound
      network (session fixture asserts it).
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, §20.3).
- [ ] `[machine]` `pnpm test` green — standing item; no TypeScript in this ticket (plan §1.1).
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (**SRCH-004**, **SRCH-005**,
      **ADM-001**; supports **SRCH-002**/**SRCH-003**) and UAT IDs (**none** directly; the instrument
      time-point behaviour is the property `UAT-SRCH-03` exercises for legislation);
      schema/API/event compatibility (none, unless **Q7**/**Q9** forced a change, which must be
      linked); tenant/PII/security impact (public official text; employer names/ABNs in state
      agreements are public business information under PRD §10.1); **source/licence impact** (one
      assessment per publisher and the governing rule when they differ); cost/memory/latency impact
      (DoD item 12's measurements against PRD §39.2's 2 GiB budget — this is the widest material set of
      the eight state groups); rollback path (remove the directory — the registry then fails with
      `MANDATORY_GROUP_MISSING`); known gaps (every entry, verbatim).
- [ ] `[human]` **Founder review of the decomposition, the instrument split and the coverage claim** —
      whether the recorded collections genuinely cover *"Relevant judgments, WAIRC
      decisions/orders/awards/agreements"*, whether "operative" is decided on evidence, and whether the
      WA state industrial system's instruments are complete enough to answer WA coverage questions
      without silently falling back on federal material (PRD §40.4, §43.4 items 4–5, §44.4).
- **No further `[fixture]` classes** beyond the recorded transcripts above, and **no additional
  `[human]` criteria**. Declared explicitly.

## Test plan

Harness: `uv run pytest pipelines/adapters/case-wa/tests -q`, fully offline, replaying only committed
fixtures. Copy the construction pattern from `pipelines/ingestion/src/<root>/conformance/reference/`
(`INGF-09` deliverable 7's reference adapter).

1. `uv sync --frozen && uv run pytest pipelines/adapters/case-wa/tests -q`.
2. `python -m <root>.conformance check pipelines/adapters/case-wa` — strict, exit `0`, report
   schema-valid; diff against the committed `conformance-report.json`.
3. **`test_decomposition.py`** — exact collections per publisher; `material_class` per endpoint;
   allowlist coverage; no non-official host.
4. **`test_instruments.py`** — award/order/agreement intervals and PRD §6.7 statuses; resolution at
   three dates; the post-nominal-expiry agreement stays non-ceased without an evidenced cessation
   event; overlapping series → `BLOCK`; no determinable effective date → quarantine.
5. **`test_state_not_federal.py`** — no emitted document claims to be a federal award or FWC-approved
   agreement.
6. **`test_relevance.py`** — in-scope basis recorded; no determinable basis fails the run.
7. **`test_metadata.py`** — court/tribunal, level, date, file number, citation; unregistered code
   quarantines.
8. **`test_paragraphs.py`** — round-trip across judgments, decisions and instruments; `para/NNNN` keys;
   `[N]` labels; contiguous ordinals; duplicate-number `BLOCK` finding.
9. **`test_relations.py`** — `CITES` with a hash-matching span; evidenced treatment → one
   correctly-directed relation; backwards-in-time and `MODEL_SUGGESTED` raise; citation-only pair →
   `TREATMENT_NOT_CONFIRMED`.
10. **`test_incremental.py`** — the four DoD item 7 scenarios via `ReplayFetcher`.
11. **`test_quarantine.py`** — each defective fixture produces its declared reason code.
12. **`test_offline.py`** — the session-level no-socket assertion.
13. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus: (a) awards, orders and agreements carry structured effective intervals — a
decision-shaped model here silently produces wrong point-in-time answers (PRD §36.2; PRD §43.3's
zero-tolerance date error); (b) the post-nominal-expiry agreement rule from PRD §6.6 is implemented,
not assumed; (c) the decomposition is real for both publisher classes; (d) `allowlist.yaml` is
official-only (**D13**) and fixtures are recorded transcripts (**D12**).

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (a docs PR/MR,
a changelog line in `docs/prd/08-sources-cases/README.md`, then `publish-tickets.mjs --sync`), and
only then change code. Silent divergence is an incomplete ticket; the ticket wins over any
implementation plan (CLAUDE.md, issue #53).

**Foreseeable frictions and their exact writeback targets:**

1. **Operative instruments genuinely need `_shared/legislation`'s point-in-time machinery** (sub-PRD
   **Q7**) → **do not import it**: no `blocked_by` edge orders `SLEG-01` before this ticket. The
   writeback is a plan change — add `SLEG-01` to this ticket's `blocked_by` in
   `docs/prd/breakdown-plan.md` §5.9 and the matching edge in §6.2, update
   `docs/prd/08-sources-cases/README.md` **Q7** and this ticket's frontmatter, re-publish, then
   implement. Duplicating the machinery locally is the plan §9 **R2** failure.
2. **The WA state instruments look like they belong with `SINS-03`/`SINS-04`** → they do not; PRD §40.4
   places them here and PRD §40.3 scopes those groups to the federal system. If the boundary is
   genuinely wrong, it is a **plan** change to §5.8/§5.9 agreed with module `07`, recorded in both
   sub-PRDs — never a quiet migration of documents between groups, which would leave one group's
   coverage claim false (PRD §44.4).
3. **`INGF-07`'s schema cannot express two authorities in one group** (sub-PRD **Q9**) → keep one file
   per group, express the multiplicity inside it, and if the schema must change open a docs PR against
   `docs/prd/05-ingestion-framework/tickets/INGF-07-source-coverage-registry-composition-and-freshness-fields.md`
   plus `docs/prd/05-ingestion-framework/README.md`; update `docs/prd/08-sources-cases/README.md`
   **Q9**. Never a cross-group shared file (plan §2.1 **A2**).
4. **A named collection is not published in a machine-retrievable form, or a class/date range is
   missing** → `SOURCE_UNAVAILABLE` or date-limited coverage with a `customer_visible: true` gap entry
   (PRD §40.4), recorded in `docs/prd/08-sources-cases/README.md`. PRD §44.4 forbids silently calling
   the category covered; an aggregator is never the substitute (**D13**).
5. **No reliable delta mechanism** → honest `change_detection.capability`; `INGF-07` derives
   `FRESHNESS_LIMITED`; customer-visible gap entry; record it (PRD §12.1).
6. **Licensing unclear, restrictive, or different per publisher** → `METADATA_AND_LINK_ONLY`
   (PRD §11.1) → `METADATA_AND_LINK_ACTIVE`/`LICENSING_RESTRICTED` with a customer-visible gap,
   recorded per publisher. Never ingest full text "pending clarification".
7. **The sites cannot be reached from the build environment** (sub-PRD **Q8**) → **stop**; do not
   hand-author fixtures (**D12**). Escalate. An official site that genuinely cannot be reached is a
   real official-source constraint, so it is recorded as a limited state with its complete `INGF-07`
   `limitation` block — never as a reason to reduce this group's scope. The launch policy is confirmed
   (plan §8 **Q10**, sub-PRD **D15**): `GOLD-16` produces the measured evidence and the proposed
   registry state, `LNCH-05` verifies the launch statement discloses it accurately, and Gate 2 is
   verification and sign-off, not an opportunity to cut mandatory scope.
8. **An instrument's operative status or an agreement's cessation cannot be evidenced** → quarantine or
   leave the status unchanged rather than guessing. PRD §6.6 forbids treating an agreement as ceased at
   nominal expiry; PRD §40.9 makes critical time failures release-blocking.
9. **`SCAS-01` lacks a primitive this group needs** → update
   `docs/prd/08-sources-cases/tickets/SCAS-01-case-law-primitives-citation-level-paragraph-identity-treatment.md`
   and the sub-PRD, re-publish the twelve dependent tickets, then implement it **there**.
10. **An enum value is missing from `FND-03`** → docs PR against `FND-03`, update
    `docs/prd/08-sources-cases/README.md` **Q1**, then emit.

**Escalation rule.** If this group cannot reach `ACTIVE` or one of PRD §7's four explicit limited
states, stop, record the state together with its complete `INGF-07` `limitation` block — evidence,
affected dates or collections, customer-visible warning and reason — in
`docs/prd/08-sources-cases/README.md`, and carry it through `GOLD-16` → `LNCH-05`. The limited-state
launch policy is confirmed (plan §8 **Q10**, sub-PRD **D15**): mandatory scope is never cut, a limited
state requires measured evidence of a genuine official-source limitation, and Gate 2 is the Founder's
verification and sign-off, not a scope decision. Never soften the registry status to make
composition pass, and never substitute a non-official source — PRD §44.4 and PRD §40.4 make those
the two forbidden outcomes.
