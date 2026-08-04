---
id: SCAS-10
title: CASE-SA
module: 08-sources-cases
lane: 08-sources-cases
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [SCAS-01]
blocks: [GOLD-16]
---

# SCAS-10 — `CASE-SA`

Implements PRD §40.4 (wave 3 roster, the `CASE-SA` row), PRD §6.3/§6.4 (state scope; case law and
decisions), PRD §9.1/§9.2 (authority hierarchy; case treatment) and PRD §40.8 (adapter Definition of
Done) <SRCH-004, SRCH-005, ADM-001> — no ADR — the decision is already made in PRD §40.4; this is
build ticket 10 of 13 against it.
Parent sub-PRD: [08-sources-cases README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [SCAS-01 — Case-law primitives: citation, level, paragraph identity, treatment](SCAS-01-case-law-primitives-citation-level-paragraph-identity-treatment.md)
**Why `builder`:** a bounded adapter inside one declared directory against a contract PRD §40.7/§40.8
and `SCAS-01` already fix — not a new subsystem decision.

## Background + basis

**PRD §40.4 gives this group's row verbatim:**

> | Group ID | Official entry/collection | Minimum included material | Initial tier |
> |---|---|---|---|
> | `CASE-SA` | SA courts and SA Employment Tribunal — <https://www.saet.sa.gov.au/> | Relevant judgments, SAET/Employment Court decisions/orders | T2 |

**Two publisher classes, one of them without a URL in the row.** The roster gives the SAET entry point
and names *"SA courts"* generically, so PRD §40.4's closing paragraph still binds:

> "**Every state/territory group must be decomposed into exact official collections before
> implementation.** If an official court does not publish a relevant class or historical range, the
> registry records `SOURCE_UNAVAILABLE` or date-limited coverage; **the product does not silently
> substitute a commercial headnote site.**"

The exact SA court collections are discovered at the official courts' own sites during the recording
run, verified there, and recorded in `registry.yaml` and `allowlist.yaml`. Multiple publishers are
expressed inside one `registry.yaml` (sub-PRD **Q9**).

**"decisions/orders" means two document behaviours.** PRD §9.1 ranks decisions *"with operative
effect"* (rank 4) above ordinary persuasive decisions (rank 5), and PRD §36.2's eligibility predicate
starts *"requested date ∈ effective interval"* — so a tribunal **order** with continuing operative
effect carries a structured effective interval and a PRD §6.7 `legal_status`, while reasons for
decision carry their decision date.

**Relevance is a recorded criterion, not a hidden filter** (PRD §40.2's analogous rule for
legislation; PRD §44.4). PRD §6.3 requires, for South Australia, *"employment and
industrial-relations legislation and guidance … and relevant regulators, courts and tribunals"*;
PRD §6.4 requires *"Relevant state and territory courts and tribunals"*.

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

**Downstream.** Plan §6.2: `SCAS-10 --> GOLD-16`.

**Carried caveats.** Sub-PRD **D12** (fixtures recorded, never authored), **D13** (official publishers
only), **D14** (anonymisation preserved — SAET publishes matters involving injured workers and
personal circumstances), **D15** (attempted in full; a limited state only on measured evidence of a
genuine official-source limitation, recorded in `INGF-07`'s `limitation` block — plan §8 **Q10** is a
confirmed policy), **Q5** (whether this group ends up limited is a `GOLD-16` measurement output, never
a scope choice), **Q6** (PRD §40.9's thresholds are baseline-selected initial defaults, tightenable
after a representative baseline), **Q9**.

## Goal

Deliver `pipelines/adapters/case-sa/` as a complete PRD §40.8-conforming source group: a
`registry.yaml` that **decomposes the SAET/Employment Court and the SA court collections into exact
official endpoints**, distinguishing decisions from operative orders and recording the
employment-relevance criterion; the URL allowlist; licence snapshot(s) and assessment; an `adapter.py`
implementing PRD §40.7's eight boundaries over `SCAS-01`'s primitives; recorded offline fixtures for
discovery, documents, three time points, incremental change and quarantine; a count/hash baseline; and
the five-line `ConformanceTestCase` subclass — such that
`python -m <root>.conformance check pipelines/adapters/case-sa` exits `0` in strict mode with a
committed `conformance-report.json`, and `CASE-SA` composes into the Source Coverage Registry as
`ACTIVE` or an explicit PRD §7 limited state.

## Non-goals

- **No shared case-law helper** — `_shared/caselaw/**` is `SCAS-01`'s (plan §9 **R2**).
- **No use of `_shared/legislation/**`** — `SLEG-01`; no `blocked_by` edge orders it (sub-PRD **Q7**).
- **No framework code** — `INGF-02`…`INGF-06`, `INGF-09`.
- **No SA legislation** — `06-sources-legislation` / `SLEG-07` (`LEG-SA`).
- **No SA regulator, WHS, equal-opportunity, ReturnToWorkSA, labour-hire or portable-LSL material** —
  `09-sources-adjacent` / `SADJ-06` (`ADJ-SA`).
- **No other decision group** — `SCAS-02`…`SCAS-09`, `SCAS-11`…`SCAS-13` (sub-PRD **D9**).
- **No commercial headnote, editorial summary or aggregator content** (PRD §6.1, §40.4; **D13**).
- **No corpus table writes, chunking, tiering, embedding or ranking** — PRD §40.7; `CRPS-03`,
  `CRPS-04`, `RETR-06`.
- **No evaluation cases or gold answers** — `21-evaluation-600`; `evals/gold/**` never read
  (plan §9 **R9**).
- **No binding/persuasive computation** — `FND-10` (sub-PRD **D8**).

## File-scope (write-owns)

- `pipelines/adapters/case-sa/**` — the whole group directory in `INGF-07` deliverable 1's layout:
  `registry.yaml`, `allowlist.yaml`, `licence.yaml`, `licence-snapshots/`, `conformance.yaml`,
  `adapter.py`, `fixtures/`, `tests/`, `README.md`.
- Does not touch: `pipelines/adapters/_shared/**` — `SCAS-01`, `SLEG-01`, `SINS-01`, `SFUT-01`.
- Does not touch: any sibling `pipelines/adapters/case-*/**` — `SCAS-02`…`SCAS-09`, `SCAS-11`…`SCAS-13`.
- Does not touch: `pipelines/adapters/leg-sa/**` (`SLEG-07`), `adj-sa/**` (`SADJ-06`), `pt-sa/**`
  (`SINS-11`).
- Does not touch: `pipelines/ingestion/**` (`05`), `pipelines/corpus-builder/**` (`04`),
  `pipelines/evaluation/**` and `evals/**` (`21`), `packages/**`, `apps/**`, `services/**`,
  `tests/**`, `schemas/**`, `infra/**`.
- `pipelines/adapters/pyproject.toml` (if present): **append-only**, expected to need no change
  (plan §1.1, PRD §44.3).

**Serial safety.** First decomposition of `docs/PRD.md`; nothing merged, nothing in flight. `SCAS-01`
has landed — the only blocker. The eleven sibling adapter tickets run **concurrently** (plan §7: peak
12 lanes), disjoint by directory; the twelve share only the `_shared/caselaw/**` library they import
and none of them writes. Modules `06`, `07` and `09` tickets covering SA write their own group
directories. The single shared path is `pipelines/adapters/pyproject.toml`, append-only by plan §1.1.

## Deliverables

1. **`registry.yaml` — the collection decomposition (DoD item 1; the ticket's primary deliverable).**
   `group_id: CASE-SA`, `wave: 3`, `initial_index_tier: T2` (the row's value; `CRPS-04` owns final
   tiering). `official_endpoints[]` enumerates the **exact** official collections of the SA Employment
   Tribunal / Employment Court (from the URL the row gives) and of the SA courts (discovered during
   the recording run), each with `kind` and `material_class` — decisions are `DECISION`; orders with
   continuing operative effect are `OPERATIVE_INSTRUMENT`. `document_coverage` records the
   employment-relevance criterion and separates the decision and order families; `financial_years`
   covers at least 2024–25, 2025–26 and 2026–27 (PRD §6.6) or carries a `known_gaps` entry
   (`reason_code: DATE_LIMITED`, `customer_visible: true`) — PRD §6.6 forbids excluding case law
   *"solely because it is older than three financial years"*. `change_detection` states the real
   observed capability per collection; `evaluation_subset_ref` names the evaluation ids.

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

2. **`allowlist.yaml` (DoD item 1; `INGF-02`'s schema).** Only official SAET and SA court publisher
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
   tribunal/court file number, else URL path with `weak=True`), `parse` (`ctx.parser` for every
   declared media type), `normalise` (`build_judgment_nodes()` — root, parts, one node per numbered
   paragraph `para/NNNN`, display `[N]`; an operative order additionally carries
   `effective_from`/`effective_to` and a PRD §6.7 `legal_status`), `extract_events` (`case_event()`
   with evidence spans or a named official field), `extract_relations` (`resolve_citations()` →
   `CITES`; `assert_treatment()` only with a resolvable evidence span), `validate`
   (`case_validation()` plus the relevance-basis rule). `AdapterMeta` declares `group_id="CASE-SA"`,
   `adapter_key="case-sa"`, `jurisdiction="SA"`.
5. **Court-code registration.** `register_court_codes("CASE-SA", {...})` with `CourtFacts` for every SA
   court/tribunal neutral-citation code ingested (including SAET and its Full Bench where the source
   distinguishes one), each with `authority_type`, the contract `court_level` and `is_appellate`. An
   unregistered code quarantines — a wrong court level is a wrong authority level (PRD §9.2 bullet 1,
   §36.3 item 3).
6. **Relevance basis recorded per document** — the criterion that put each document in scope,
   summarised in the run report; no determinable basis fails the run (PRD §44.4).
7. **Recorded fixtures (DoD items 2, 4, 6, 7, 10) under `fixtures/`.** Captured from the official
   collections through `INGF-02`'s fetcher in a one-off recording run, committed as replayable
   transcripts (`INGF-09` deliverable 6 format), **never hand-authored** (**D12**): `discovery/`
   (≥1 per publisher), `dry-run.json` (≤180 days old), `documents/` (one per declared media type,
   including at least one SA court judgment, one SAET/Employment Court decision, one **order** with
   continuing effect, and one decision with in-text citations), `timepoints/` (≥3 legal dates),
   `incremental/` (304, changed, removed, transient 5xx), `quarantine/` (≥1 per declared reason code),
   `baseline.json`.
8. **No-customer-data hygiene (DoD item 4).** No `Set-Cookie`, `Authorization`/`Bearer`, session token,
   personal email or TFN-shaped content. Published party names are public case parties (PRD §10.1) and
   stay as published; officially anonymised or suppressed material is never de-anonymised (**D14**) —
   employment-tribunal matters frequently involve medical and personal circumstances, so this is a
   live rule here, not a formality.
9. **`conformance.yaml`** — DoD item 12 ceilings and tighten-only `anomaly_overrides` (PRD §40.9).
   `deferred_items` may contain only `11`.
10. **`tests/`** — the five-line conformance subclass plus group-specific unit tests: per-publisher
    discovery, decision-vs-order modelling, relevance-basis recording, court-code/level mapping,
    paragraph round-trip, citation offsets, treatment evidence, identity stability, anonymisation
    preservation.
11. **`README.md`** — which collections were decomposed and why, what is out of scope (SA legislation →
    `SLEG-07`; regulator material → `SADJ-06`), the licence position per publisher, the observed
    change-detection capability, and every `known_gaps` entry. Read by `GOLD-16` and the Founder at
    Gate 2 (PRD §41.3 step 1).
12. **`conformance-report.json`** committed at the group root — the PRD §45.4 evidence artifact.

## Acceptance checklist (classified)

The twelve PRD §40.8 items, in order, each proved for `CASE-SA`:

- [ ] `[fixture]` **DoD 1 — registry row, URL allowlist, licence snapshot/assessment.** All three files
      validate; `group_id` is in `MANDATORY_SOURCE_GROUPS`; directory name is `case-sa`; each
      snapshot's SHA-256 matches its `terms_sha256`; every endpoint passes the allowlist (PRD §40.8
      item 1, §6.1, §11.1).
- [ ] `[machine]` **PRD §40.4 decomposition.** `official_endpoints[]` lists exact collections for the
      SAET/Employment Court and for the SA courts with a `material_class` each; no bare homepage; no
      aggregator host in `allowlist.yaml` (PRD §40.4 closing paragraph, §6.1; **D13**).
- [ ] `[fixture]` **DoD 2 — discovery fixture and live dry-run evidence.** ≥1 `RemoteDescriptor` per
      publisher with an allowlisted URL; `dry-run.json` present, well-formed, ≤180 days old (PRD §40.8
      item 2).
- [ ] `[fixture]` **DoD 3 — stable identity and deletion/unavailability.** Deterministic and stable
      across two recorded versions; no collisions; a removed descriptor yields `REMOVED`, retains the
      prior version and deletes no state (PRD §40.8 item 3; **D14**).
- [ ] `[fixture]` **DoD 4 — representative fixtures without customer data.** Every declared media type
      has a fixture; the no-customer-data scan passes (PRD §40.8 item 4).
- [ ] `[fixture]` **DoD 5 — parser/node hierarchy and exact-text round-trip.** `assert_roundtrip()`
      passes for every fixture; one root, no cycles, contiguous sibling ordinals, every `text_hash`
      recomputes; `[N]` ↔ `para/NNNN` (PRD §40.8 item 5, §15.3; **E14 "paragraph"** evidence).
- [ ] `[fixture]` **DoD 6 — three time points.** For ≥3 legal dates each document resolves with the
      right `effective_from` and a PRD §6.7 `legal_status`; the operative order resolves inside and
      outside its interval; events distinguish `event_date` from `effective_date`; no overlapping
      versions (PRD §40.8 item 6, §15.2, §35.2, §36.2).
- [ ] `[fixture]` **DoD 7 — incremental matrix.** No-change (304 → 0 fetched, change-scan date
      advanced, ingestion date unchanged), changed, removed, transient failure (bounded retry →
      `PARTIAL`, no content quarantine) (PRD §40.8 item 7).
- [ ] `[fixture]` **DoD 8 — count/hash baseline and anomaly thresholds.** The replayed run reproduces
      `baseline.json` exactly, per collection; overrides tighten only (PRD §40.8 item 8, §40.9;
      **Q6**).
- [ ] `[machine]` **DoD 9 — freshness schedule with last-check/last-ingest separation.** A replayed 304
      run and a replayed content run write different fields (PRD §40.8 item 9, §12.1).
- [ ] `[fixture]` **DoD 10 — quarantine cases and operator recovery.** Every declared reason code has a
      defective fixture producing exactly that code, and a non-empty operator action (PRD §40.8
      item 10, ADM-001).
- [ ] `[machine]` **DoD 11 — retrieval/citation evaluation subset.** `evaluation_subset_ref` non-empty
      and well-formed; ids resolve if `evals/cases/**` exists, else `DEFERRED(GOLD-16)` with a reason;
      `evals/gold/**` never read (PRD §40.8 item 11; plan §9 **R9**).
- [ ] `[fixture]` **DoD 12 — measured storage, parse time, index size, peak memory.** All four recorded
      and within `conformance.yaml` ceilings (PRD §40.8 item 12, §39.2).
- [ ] `[machine]` `python -m <root>.conformance check pipelines/adapters/case-sa` exits `0` in
      **strict** mode; the committed report shows `summary.pass == 12` (or item 11 `DEFERRED`) and
      `"strict": true` (PRD §45.4).
- [ ] `[machine]` `INGF-07`'s composer includes `CASE-SA` with all nine PRD §6.1 attributes, a
      `material_class` per endpoint, the five PRD §12.1 dates separated, and a release-acceptable
      status with a customer-visible gap entry if limited (PRD §6.1, §7, §12.1, ADM-001).
- [ ] `[machine]` **A limited status composes only with its complete `limitation` block.** If
      `adapter_status` is one of PRD §7's four limited states, `INGF-07`'s composed output carries the
      `limitation` block verbatim — matching `state`, a closed-set `reason_code`, `reason_detail`, at
      least one `evidence` entry, an `affected` scope and a `customer_visible_warning` — and
      composition fails with `REGISTRY_LIMITATION_MISSING`/`_UNEVIDENCED`/`_SCOPE_MISSING`/
      `_WARNING_MISSING` when any part is missing; an `ACTIVE` group carries `limitation: null`
      (`INGF-07` deliverables 3 and 7; sub-PRD **D15**; plan §8 **Q10**).
- [ ] `[machine]` **Orders are structurally distinct from reasons.** An operative order carries an
      effective interval and a PRD §6.7 status; a decision does not acquire one (PRD §9.1 ranks 4–5,
      §36.2).
- [ ] `[machine]` **Relevance basis is evidenced.** Every ingested document records the criterion that
      put it in scope; no determinable basis fails the run (deliverable 6; PRD §44.4).
- [ ] `[machine]` **Anonymisation preserved.** A test asserts the pipeline never expands a pseudonym,
      never joins an anonymised party to another document, and stores the published text unchanged
      (**D14**; PRD §10.1).
- [ ] `[fixture]` **E14 "case metadata" evidence** — court/tribunal, level, decision date, file number
      and neutral citation (or a recorded reason none is published) for every recorded decision; an
      unregistered court code quarantines (PRD §44.2 `E14`, §9.2 bullet 1).
- [ ] `[fixture]` **E14 "treatment evidence" evidence** — an in-text citation produces `CITES` with a
      hash-matching span; any evidenced treatment produces exactly one correctly-directed relation; a
      citation-only pair reports `TREATMENT_NOT_CONFIRMED` (PRD §44.2 `E14`, §9.2; **D3**, **D4**).
- [ ] `[machine]` No `MODEL_SUGGESTED` relation and no evidence-free treatment can be emitted by this
      adapter — negative control over `adapter.extract_relations()` (PRD §9.3; **D5**).
- [ ] `[machine]` The adapter imports no HTTP or parser library and no corpus/app database module —
      `INGF-01` deliverable 11's architecture scan (PRD §37.4, §40.7, §39.1, SEC-002).
- [ ] `[machine]` The whole suite runs offline: every test replays recorded fixtures with no outbound
      network (session fixture asserts it).
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, §20.3).
- [ ] `[machine]` `pnpm test` green — standing item; no TypeScript in this ticket (plan §1.1).
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (**SRCH-004**, **SRCH-005**,
      **ADM-001**; supports **SRCH-003**) and UAT IDs (**none** — no PRD §41.2 row exercises this group
      directly); schema/API/event compatibility (none, unless sub-PRD **Q9** forced an `INGF-07` schema
      change, which must be linked); **tenant/PII/security impact** (public official decision text;
      **D14** is called out explicitly because employment-tribunal matters carry medical and personal
      circumstances); **source/licence impact** (one assessment per publisher and the governing rule
      when they differ); cost/memory/latency impact (DoD item 12's measurements against PRD §39.2's
      2 GiB budget); rollback path (remove the directory — the registry then fails with
      `MANDATORY_GROUP_MISSING`); known gaps (every entry, verbatim).
- [ ] `[human]` **Founder review of the decomposition and coverage claim** — whether the recorded
      collections genuinely cover *"Relevant judgments, SAET/Employment Court decisions/orders"* and
      whether every shortfall is a customer-visible limitation rather than silence (PRD §40.4, §43.4
      items 4–5, §44.4).
- **No further `[fixture]` classes** beyond the recorded transcripts above, and **no additional
  `[human]` criteria**. Declared explicitly.

## Test plan

Harness: `uv run pytest pipelines/adapters/case-sa/tests -q`, fully offline, replaying only committed
fixtures. Copy the construction pattern from `pipelines/ingestion/src/<root>/conformance/reference/`
(`INGF-09` deliverable 7's reference adapter).

1. `uv sync --frozen && uv run pytest pipelines/adapters/case-sa/tests -q`.
2. `python -m <root>.conformance check pipelines/adapters/case-sa` — strict, exit `0`, report
   schema-valid; diff against the committed `conformance-report.json`.
3. **`test_decomposition.py`** — exact collections per publisher; `material_class` per endpoint;
   allowlist coverage; no non-official host.
4. **`test_orders.py`** — the operative order's interval and PRD §6.7 status; resolution at three
   dates; reasons for decision acquire no interval.
5. **`test_anonymisation.py`** — the anonymised fixture round-trips unchanged; no pseudonym expansion;
   no cross-document join on an anonymised party.
6. **`test_relevance.py`** — in-scope basis recorded; no determinable basis fails the run.
7. **`test_metadata.py`** — court/tribunal, level, date, file number, citation; unregistered code
   quarantines.
8. **`test_paragraphs.py`** — round-trip, `para/NNNN` keys, `[N]` labels, contiguous ordinals, and the
   duplicate-number `BLOCK` finding.
9. **`test_relations.py`** — `CITES` with a hash-matching span; evidenced treatment → one
   correctly-directed relation; backwards-in-time and `MODEL_SUGGESTED` raise; citation-only pair →
   `TREATMENT_NOT_CONFIRMED`.
10. **`test_incremental.py`** — the four DoD item 7 scenarios via `ReplayFetcher`.
11. **`test_quarantine.py`** — each defective fixture produces its declared reason code.
12. **`test_offline.py`** — the session-level no-socket assertion.
13. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus: (a) the decomposition is real for both publisher classes — the row names *"SA courts"*
without a URL, so a homepage entry is the likely shortcut and is not acceptable; (b) anonymised matters
are untouched (**D14**); (c) `allowlist.yaml` is official-only (**D13**); (d) fixtures are recorded
transcripts, not hand-written HTML (**D12**).

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (a docs PR/MR,
a changelog line in `docs/prd/08-sources-cases/README.md`, then `publish-tickets.mjs --sync`), and
only then change code. Silent divergence is an incomplete ticket; the ticket wins over any
implementation plan (CLAUDE.md, issue #53).

**Foreseeable frictions and their exact writeback targets:**

1. **`INGF-07`'s schema cannot express two authorities in one group** (sub-PRD **Q9**) → keep one file
   per group and express the multiplicity inside it, as `INGF-07`'s own feedback obligation 1 directs.
   If the schema must change, open a docs PR against
   `docs/prd/05-ingestion-framework/tickets/INGF-07-source-coverage-registry-composition-and-freshness-fields.md`
   plus `docs/prd/05-ingestion-framework/README.md`, update `docs/prd/08-sources-cases/README.md`
   **Q9**, and re-publish. Never a cross-group shared file (plan §2.1 **A2**).
2. **A named collection is not published in a machine-retrievable form, or a class/date range is
   missing** → `SOURCE_UNAVAILABLE` or date-limited coverage with a `customer_visible: true` gap entry
   (PRD §40.4), recorded in `docs/prd/08-sources-cases/README.md`. PRD §44.4 forbids silently calling
   the category covered; an aggregator is never the substitute (**D13**).
3. **No reliable delta mechanism** → honest `change_detection.capability`; `INGF-07` derives
   `FRESHNESS_LIMITED`; customer-visible gap entry; record it (PRD §12.1: *"rather than a false
   guarantee"*).
4. **Licensing unclear, restrictive, or different per publisher** → `METADATA_AND_LINK_ONLY`
   (PRD §11.1) → `METADATA_AND_LINK_ACTIVE`/`LICENSING_RESTRICTED` with a customer-visible gap,
   recorded per publisher. Never ingest full text "pending clarification".
5. **The sites cannot be reached from the build environment** (sub-PRD **Q8**) → **stop**; do not
   hand-author fixtures (**D12**). Escalate. An official site that genuinely cannot be reached is a
   real official-source constraint, so it is recorded as a limited state with its complete `INGF-07`
   `limitation` block — never as a reason to reduce this group's scope. The launch policy is confirmed
   (plan §8 **Q10**, sub-PRD **D15**): `GOLD-16` produces the measured evidence and the proposed
   registry state, `LNCH-05` verifies the launch statement discloses it accurately, and Gate 2 is
   verification and sign-off, not an opportunity to cut mandatory scope.
6. **A tribunal order's operative effect cannot be evidenced** → quarantine rather than defaulting to
   the publication date. PRD §40.9 makes critical time failures release-blocking and PRD §43.3 makes a
   date error a zero-tolerance metric.
7. **An anonymised matter appears to need de-anonymising to link a citation** → forbidden; leave the
   citation unresolved (sub-PRD **D9**) and count it. Changing this rule is a **product** change under
   PRD §45.5 requiring founder approval — escalate, never decide locally.
8. **`SCAS-01` lacks a primitive this jurisdiction needs** → update
   `docs/prd/08-sources-cases/tickets/SCAS-01-case-law-primitives-citation-level-paragraph-identity-treatment.md`
   and the sub-PRD, re-publish the twelve dependent tickets, then implement it **there** (plan §9
   **R2**).
9. **An enum value is missing from `FND-03`** → docs PR against `FND-03`, update
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
