---
id: SCAS-04
title: CASE-FCFCOA
module: 08-sources-cases
lane: 08-sources-cases
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [SCAS-01]
blocks: [GOLD-12, GOLD-16]
---

# SCAS-04 — `CASE-FCFCOA`

Implements PRD §40.4 (wave 3 roster, the `CASE-FCFCOA` row), PRD §6.4 (case law and decisions),
PRD §9.2 (case treatment) and PRD §40.8 (adapter Definition of Done) <SRCH-004, SRCH-005, ADM-001> —
no ADR — the decision is already made in PRD §40.4; this is build ticket 4 of 13 against it.
Parent sub-PRD: [08-sources-cases README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [SCAS-01 — Case-law primitives: citation, level, paragraph identity, treatment](SCAS-01-case-law-primitives-citation-level-paragraph-identity-treatment.md)
**Why `builder`:** a bounded adapter inside one declared directory against a contract PRD §40.7/§40.8
and `SCAS-01` already fix — not a new subsystem decision.

## Background + basis

**PRD §40.4 gives this group's row verbatim:**

> | Group ID | Official entry/collection | Minimum included material | Initial tier |
> |---|---|---|---|
> | `CASE-FCFCOA` | FCFCOA judgments — <https://www.fcfcoa.gov.au/judgments> | General federal law/fair-work relevant judgments and metadata | T1 relevant; T2 broader candidate set |

Two phrases in that row govern the whole ticket:

- **"General federal law/fair-work relevant"** — the roster asks for the general federal law and
  fair-work relevant portion of this court's output, not its family-law work. The subject boundary is
  therefore part of the group's definition, recorded in `registry.yaml`'s `document_coverage`, not an
  undocumented filter. PRD §6.4 lists *"Federal Circuit and Family Court"* among the required decision
  sources; PRD §3.3 and §6.2/§6.3 scope the product to employment law.
- **"T1 relevant; T2 broader candidate set"** — this group is the only wave-3 row with a **two-tier**
  initial assignment. PRD §40.1: *"Initial semantic tiers: `T1` primary/high-frequency full semantic,
  `T2` lexical plus selective semantic … Licensing can only reduce permitted display/indexing, never
  be assumed from the tier."* The adapter records which tier each document takes and why; `CRPS-04`
  owns the final assignment policy.

**Anonymisation matters more here than anywhere else in the module.** This court publishes matters in
which parties are pseudonymised or suppressed by law or order. Sub-PRD **D14** is binding: the adapter
ingests exactly what the court publishes and never attempts to re-identify; an official removal or
suppression is the PRD §40.8 item 3 deletion/unavailability path. PRD §10.1 permits *"public case
parties"* as data; it does not permit reversing an official anonymisation.

**PRD §40.4's closing paragraph binds every group in wave 3:**

> "Every state/territory group must be decomposed into exact official collections before
> implementation. If an official court does not publish a relevant class or historical range, the
> registry records `SOURCE_UNAVAILABLE` or date-limited coverage; the product does not silently
> substitute a commercial headnote site."

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

**Downstream.** Plan §6.2: `SCAS-04 --> GOLD-12 & GOLD-16`.

**Carried caveats.** Sub-PRD **D12** (fixtures recorded, never authored), **D13** (official publishers
only), **D14** (anonymisation preserved), **D15** (attempted in full; a limited state only on
measured evidence of a genuine official-source limitation, recorded in `INGF-07`'s `limitation`
block — plan §8 **Q10** is a confirmed policy), **Q5** (whether this group ends up limited is a
`GOLD-16` measurement output, never a scope choice), **Q6** (PRD §40.9's thresholds are
baseline-selected initial defaults, tightenable after a representative baseline).

## Goal

Deliver `pipelines/adapters/case-fcfcoa/` as a complete PRD §40.8-conforming source group: the
`registry.yaml` decomposition of the FCFCOA's official judgment collections **with an explicit,
recorded general-federal-law/fair-work subject boundary and the T1/T2 split**, the URL allowlist,
licence snapshot and assessment, an `adapter.py` implementing PRD §40.7's eight boundaries over
`SCAS-01`'s primitives, recorded offline fixtures for discovery, documents, three time points,
incremental change and quarantine, a count/hash baseline, and the five-line `ConformanceTestCase`
subclass — such that `python -m <root>.conformance check pipelines/adapters/case-fcfcoa` exits `0` in
strict mode with a committed `conformance-report.json`, and `CASE-FCFCOA` composes into the Source
Coverage Registry as `ACTIVE` or an explicit PRD §7 limited state.

## Non-goals

- **No shared case-law helper** — `_shared/caselaw/**` is `SCAS-01`'s; a universal addition is a
  `SCAS-01` change, never a local copy (plan §9 **R2**).
- **No framework code** — `INGF-02`…`INGF-06`, `INGF-09`.
- **No family-law division material.** The roster row scopes this group to *"General federal law/
  fair-work relevant judgments"*; the exclusion is recorded in `registry.yaml`'s `document_coverage`
  and the group `README.md` as **scope**, not as a coverage gap, because the roster never asked for it.
- **No other source group** — HCA `SCAS-02`, FCA `SCAS-03`, FWC `SCAS-05`. A relation whose `from_ref`
  is not an FCFCOA judgment belongs to the group that owns the citing document (sub-PRD **D9**).
- **No index-tier assignment policy** — `CRPS-04`. This adapter records the tier the roster row gives
  and the evidence for it; the policy is decided downstream.
- **No commercial headnote, editorial summary or aggregator content** (PRD §6.1, §40.4; **D13**).
- **No corpus table writes, chunking, embedding or ranking** — PRD §40.7; `CRPS-03`, `RETR-06`.
- **No evaluation cases or gold answers** — `GOLD-12`; `evals/gold/**` never read (plan §9 **R9**).
- **No binding/persuasive computation** — `FND-10` (sub-PRD **D8**).
- **No re-identification of anonymised parties, ever** — **D14**; a standing rule, not a deferral.

## File-scope (write-owns)

- `pipelines/adapters/case-fcfcoa/**` — the whole group directory in `INGF-07` deliverable 1's layout:
  `registry.yaml`, `allowlist.yaml`, `licence.yaml`, `licence-snapshots/`, `conformance.yaml`,
  `adapter.py`, `fixtures/`, `tests/`, `README.md`.
- Does not touch: `pipelines/adapters/_shared/**` — `SCAS-01` (and `SLEG-01`/`SINS-01`/`SFUT-01`).
- Does not touch: any sibling `pipelines/adapters/case-*/**` — `SCAS-02`, `SCAS-03`, `SCAS-05`…`SCAS-13`.
- Does not touch: any `pipelines/adapters/{leg,pt,fwc,fwo,ato,adj,future}-*/**` — modules `06`, `07`,
  `09`, `10`.
- Does not touch: `pipelines/ingestion/**` (`05`), `pipelines/corpus-builder/**` (`04`),
  `pipelines/evaluation/**` and `evals/**` (`21`), `packages/**`, `apps/**`, `services/**`,
  `tests/**`, `schemas/**`, `infra/**`.
- `pipelines/adapters/pyproject.toml` (if present): **append-only**, expected to need no change.
  Conflicts resolve by re-running `uv lock`, never hand-merge (plan §1.1, PRD §44.3).

**Serial safety.** First decomposition of `docs/PRD.md`; nothing merged, nothing in flight. `SCAS-01`
has landed — the only intra-module blocker. The eleven sibling adapter tickets run **concurrently**
(plan §7: peak 12 lanes), disjoint by directory; the twelve share only the `_shared/caselaw/**`
library they import and none of them writes. The single shared path is
`pipelines/adapters/pyproject.toml`, append-only by plan §1.1.

## Deliverables

1. **`registry.yaml` — the collection decomposition and subject boundary (DoD item 1).**
   `group_id: CASE-FCFCOA`, `wave: 3`, `authority` = the Federal Circuit and Family Court of Australia
   (`authority_type: COURT`, `jurisdiction: CTH`, a contract `court_level`; where the court publishes
   divisions separately, each is its own `official_endpoints` entry). `initial_index_tier` records the
   row's `T1 relevant` value, and `document_coverage` states the **T2 broader candidate set** rule
   with the evidence used to classify a judgment as relevant. The general-federal-law/fair-work
   subject boundary is written down as a maintained topic/list criterion — mirroring PRD §40.2's rule
   for legislation (*"A maintained subject/title allowlist plus dependency expansion records why each
   title is included"*) — so a reader can tell why a judgment is in or out. `financial_years` covers
   at least 2024–25, 2025–26 and 2026–27 (PRD §6.6) or carries a `known_gaps` entry
   (`reason_code: DATE_LIMITED`, `customer_visible: true`); PRD §6.6 forbids excluding case law
   *"solely because it is older than three financial years"*.

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

2. **`allowlist.yaml` (DoD item 1; `INGF-02`'s schema).** Only official FCFCOA publisher hosts verified
   during the recording run — no aggregator, no commercial reporter (**D13**).
3. **`licence.yaml` + `licence-snapshots/<date>-<hash>.<ext>` (DoD item 1; `INGF-04`).** Terms captured
   at acquisition with SHA-256 plus an independent `LicenceAssessment` over all nine PRD §11.1 axes.
   Unclear rights collapse to metadata/link-only, which makes `adapter_status`
   `METADATA_AND_LINK_ACTIVE` with a customer-visible gap. Any limited status set here
   carries deliverable 1's `limitation` block (`reason_code: LICENSING_RESTRICTION`, with the licence
   assessment and its snapshot hash as evidence).
4. **`adapter.py` — `ADAPTER: SourceAdapter`** (`INGF-01` deliverables 4 and 9) implementing all eight
   PRD §40.7 boundaries: `discover` (official listings only, conditional requests), `fetch`
   (`ctx.fetcher`), `identify` (`SCAS-01`'s `case_identity()` from the court's neutral citation, then
   file number, then URL path with `weak=True`), `parse` (`ctx.parser`), `normalise`
   (`build_judgment_nodes()` — root, parts, one node per numbered paragraph `para/NNNN` with display
   `[N]`), `extract_events` (`case_event()` for decision-handed-down, appeal outcomes and — critically
   for this group — `DECISION_WITHDRAWN_OR_SUPPRESSED`), `extract_relations` (`resolve_citations()`
   for `CITES`; `assert_treatment()` only with a resolvable evidence span), and `validate`
   (`case_validation()`). `AdapterMeta` declares `group_id="CASE-FCFCOA"`,
   `adapter_key="case-fcfcoa"`, `jurisdiction="CTH"`.
5. **Subject-relevance classification is recorded, not hidden.** Every ingested judgment carries the
   recorded reason it is in scope (the official division/practice-area field, or the topic criterion
   it matched), stored in the document metadata and summarised in the run report. A judgment whose
   relevance cannot be evidenced is **not** silently dropped: it is either excluded by the recorded
   boundary or flagged for the operator. PRD §44.4's rule against implied coverage cuts both ways.
6. **Court-code registration.** `register_court_codes("CASE-FCFCOA", {...})` with `CourtFacts` for
   every neutral-citation code this group ingests, including division and appellate facts where the
   court marks them. An unregistered code quarantines rather than being reclassified.
7. **Recorded fixtures (DoD items 2, 4, 6, 7, 10) under `fixtures/`.** Captured from the official site
   through `INGF-02`'s fetcher in a one-off recording run, committed as replayable transcripts
   (`INGF-09` deliverable 6 format), **never hand-authored** (**D12**): `discovery/`, `dry-run.json`
   (≤180 days old), `documents/` (one per declared media type, including at least one fair-work
   relevant judgment with in-text citations and **one officially anonymised/pseudonymised judgment**),
   `timepoints/` (≥3 legal dates), `incremental/` (304, changed, removed, transient 5xx),
   `quarantine/` (≥1 per declared reason code), `baseline.json`.
8. **No-customer-data hygiene and anonymisation preservation (DoD item 4; **D14**).** No `Set-Cookie`,
   `Authorization`/`Bearer`, session token, personal email or TFN-shaped content. The anonymised
   fixture is committed exactly as published, and a test asserts the pipeline neither expands a
   pseudonym nor cross-references it against any other document.
9. **`conformance.yaml`** — DoD item 12 ceilings and tighten-only `anomaly_overrides` (PRD §40.9).
   `deferred_items` may contain only `11`.
10. **`tests/`** — the five-line conformance subclass plus group-specific unit tests: relevance-boundary
    classification, the anonymisation-preservation assertion, paragraph round-trip, citation offsets,
    identity stability, and the suppression/withdrawal path.
11. **`README.md`** — the decomposition, the recorded subject boundary and what it excludes, the
    T1/T2 rule, the licence position, the observed change-detection capability and every `known_gaps`
    entry. Read by `GOLD-16` and the Founder at Gate 2 (PRD §41.3 step 1).
12. **`conformance-report.json`** committed at the group root — the PRD §45.4 evidence artifact.

## Acceptance checklist (classified)

The twelve PRD §40.8 items, in order, each proved for `CASE-FCFCOA`:

- [ ] `[fixture]` **DoD 1 — registry row, URL allowlist, licence snapshot/assessment.** All three files
      validate; `group_id` is in `MANDATORY_SOURCE_GROUPS`; directory name is `case-fcfcoa`; the
      snapshot's SHA-256 matches `terms_sha256`; every endpoint passes the allowlist (PRD §40.8 item 1,
      §6.1, §11.1).
- [ ] `[fixture]` **DoD 2 — discovery fixture and live dry-run evidence.** Replaying `discovery/`
      yields ≥1 `RemoteDescriptor` with an allowlisted URL; `dry-run.json` present, well-formed, ≤180
      days old (PRD §40.8 item 2).
- [ ] `[fixture]` **DoD 3 — stable identity and deletion/unavailability.** Deterministic and stable
      across two recorded versions; no collisions; a removed or suppressed judgment yields `REMOVED`
      plus a `DECISION_WITHDRAWN_OR_SUPPRESSED` event, retains the prior version and deletes no state
      (PRD §40.8 item 3; **D14**).
- [ ] `[fixture]` **DoD 4 — representative fixtures without customer data.** Every declared media type
      has a fixture; the no-customer-data scan passes; the anonymised fixture is unchanged from
      publication (PRD §40.8 item 4; **D14**).
- [ ] `[fixture]` **DoD 5 — parser/node hierarchy and exact-text round-trip.** `assert_roundtrip()`
      passes; one root, no cycles, contiguous sibling ordinals, every `text_hash` recomputes; `[N]` ↔
      `para/NNNN` (PRD §40.8 item 5, §15.3; **E14 "paragraph"** evidence).
- [ ] `[fixture]` **DoD 6 — three time points.** For ≥3 legal dates the judgment resolves with
      `effective_from` at its decision date, a PRD §6.7 `legal_status`, and events whose `event_date`
      and `effective_date` are distinguished; no overlapping versions (PRD §40.8 item 6, §15.2, §35.2).
- [ ] `[fixture]` **DoD 7 — incremental matrix.** No-change (304 → 0 fetched, change-scan date
      advanced, ingestion date unchanged), changed, removed, transient failure (bounded retry →
      `PARTIAL`, no content quarantine) (PRD §40.8 item 7).
- [ ] `[fixture]` **DoD 8 — count/hash baseline and anomaly thresholds.** The replayed run reproduces
      `baseline.json` exactly; overrides tighten only (PRD §40.8 item 8, §40.9; **Q6**).
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
- [ ] `[machine]` `python -m <root>.conformance check pipelines/adapters/case-fcfcoa` exits `0` in
      **strict** mode; the committed report shows `summary.pass == 12` (or item 11 `DEFERRED`) and
      `"strict": true` (PRD §45.4).
- [ ] `[machine]` `INGF-07`'s composer includes `CASE-FCFCOA` with all nine PRD §6.1 attributes, a
      `material_class` per endpoint, the five PRD §12.1 dates separated, and a release-acceptable
      status with a customer-visible gap entry if limited (PRD §6.1, §7, §12.1, ADM-001).
- [ ] `[machine]` **A limited status composes only with its complete `limitation` block.** If
      `adapter_status` is one of PRD §7's four limited states, `INGF-07`'s composed output carries the
      `limitation` block verbatim — matching `state`, a closed-set `reason_code`, `reason_detail`, at
      least one `evidence` entry, an `affected` scope and a `customer_visible_warning` — and
      composition fails with `REGISTRY_LIMITATION_MISSING`/`_UNEVIDENCED`/`_SCOPE_MISSING`/
      `_WARNING_MISSING` when any part is missing; an `ACTIVE` group carries `limitation: null`
      (`INGF-07` deliverables 3 and 7; sub-PRD **D15**; plan §8 **Q10**).
- [ ] `[machine]` **Subject boundary is evidenced.** Every ingested judgment records the official field
      or criterion that put it in scope; a judgment with no recorded basis fails the run rather than
      being included or dropped silently (roster row *"General federal law/fair-work relevant"*;
      PRD §44.4; deliverable 5).
- [ ] `[machine]` **Anonymisation preserved.** A test asserts the pipeline never expands a pseudonym,
      never joins an anonymised party to another document, and stores the published text unchanged
      (**D14**; PRD §10.1).
- [ ] `[fixture]` **E14 "case metadata" evidence** — court, level/division, decision date, file number
      and neutral citation extracted for every recorded judgment; an unregistered court code
      quarantines (PRD §44.2 `E14`, §9.2 bullet 1).
- [ ] `[fixture]` **E14 "treatment evidence" evidence** — an in-text citation produces `CITES` with a
      hash-matching span; an evidenced appeal outcome produces exactly one correctly-directed treatment
      relation; a citation-only pair reports `TREATMENT_NOT_CONFIRMED` (PRD §44.2 `E14`, §9.2;
      sub-PRD **D3**, **D4**).
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
      directly); schema/API/event compatibility (none); **tenant/PII/security impact** (public official
      judgment text; the anonymisation-preservation rule **D14** is stated explicitly here because this
      court publishes pseudonymised matters; SSRF surface is `INGF-02`'s allowlist);
      **source/licence impact** (the assessment and any quotation limit); cost/memory/latency impact
      (DoD item 12's measurements against PRD §39.2's 2 GiB budget); rollback path (remove the
      directory — the registry then fails with `MANDATORY_GROUP_MISSING`); known gaps (every
      `known_gaps` entry, verbatim).
- [ ] `[human]` **Founder review of the subject boundary and coverage claim** — whether the recorded
      general-federal-law/fair-work criterion is right, whether the T1/T2 split is defensible, and
      whether any limitation is stated honestly. This is the group where an over-broad boundary imports
      irrelevant material and an over-narrow one silently loses employment authority (PRD §43.4
      items 4–5; PRD §44.4).
- **No further `[fixture]` classes** beyond the recorded transcripts above, and **no additional
  `[human]` criteria**. Declared explicitly.

## Test plan

Harness: `uv run pytest pipelines/adapters/case-fcfcoa/tests -q`, fully offline, replaying only
committed fixtures. Copy the construction pattern from
`pipelines/ingestion/src/<root>/conformance/reference/` (`INGF-09` deliverable 7).

1. `uv sync --frozen && uv run pytest pipelines/adapters/case-fcfcoa/tests -q`.
2. `python -m <root>.conformance check pipelines/adapters/case-fcfcoa` — strict, exit `0`, report
   schema-valid; diff against the committed `conformance-report.json`.
3. **`test_subject_boundary.py`** — an in-scope fixture is ingested with its recorded basis; an
   out-of-scope fixture is excluded by the recorded criterion; a fixture with no determinable basis
   fails the run.
4. **`test_anonymisation.py`** — the anonymised fixture round-trips unchanged; no pseudonym expansion;
   no cross-document join on an anonymised party.
5. **`test_paragraphs.py`** — round-trip, `para/NNNN` keys, `[N]` labels, contiguous ordinals, and the
   duplicate-number `BLOCK` finding.
6. **`test_relations.py`** — `CITES` with a hash-matching span; the evidenced appeal fixture → one
   treatment relation with correct direction; backwards-in-time and `MODEL_SUGGESTED` raise; a
   citation-only pair → `TREATMENT_NOT_CONFIRMED`.
7. **`test_incremental.py`** — the four DoD item 7 scenarios via `ReplayFetcher`, including the
   suppression path producing `REMOVED` plus the withdrawal event.
8. **`test_quarantine.py`** — each defective fixture produces its declared reason code.
9. **`test_offline.py`** — the session-level no-socket assertion.
10. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus: (a) the subject boundary is written down and evidenced per document — an undocumented
filter is the failure mode here; (b) the anonymised fixture is untouched and no code path could
re-identify it (**D14**); (c) `allowlist.yaml` contains only official FCFCOA hosts; (d) the fixtures
are recorded transcripts, not hand-written HTML (**D12**).

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (a docs PR/MR,
a changelog line in `docs/prd/08-sources-cases/README.md`, then `publish-tickets.mjs --sync`), and
only then change code. Silent divergence is an incomplete ticket; the ticket wins over any
implementation plan (CLAUDE.md, issue #53).

**Foreseeable frictions and their exact writeback targets:**

1. **The court publishes no field that distinguishes general federal law from family law** → do not
   guess from prose. Record the criterion actually available (division, practice area, listing
   section) in `registry.yaml`, state the residual uncertainty as a `known_gaps` entry with
   `customer_visible: true`, and note it in `docs/prd/08-sources-cases/README.md`. If no usable
   criterion exists at all, the honest state is date-limited or `SOURCE_UNAVAILABLE` coverage for the
   affected class (PRD §40.4), escalated through `GOLD-16` → `LNCH-05`.
2. **No reliable delta mechanism** → set `change_detection.capability` honestly; `INGF-07` derives
   `FRESHNESS_LIMITED`; add a customer-visible gap entry (PRD §12.1: *"rather than a false
   guarantee"*) and record it in `docs/prd/08-sources-cases/README.md`.
3. **Licensing unclear or restrictive** → `METADATA_AND_LINK_ONLY` (PRD §11.1) →
   `METADATA_AND_LINK_ACTIVE` with a customer-visible gap. Never ingest full text "pending
   clarification"; never substitute an aggregator (**D13**).
4. **A required class or historical range is not published** → `SOURCE_UNAVAILABLE` or date-limited
   coverage exactly as PRD §40.4 directs, recorded in `docs/prd/08-sources-cases/README.md`; PRD §44.4
   forbids silently calling the category covered.
5. **The site cannot be reached from the build environment** (sub-PRD **Q8**) → **stop**; do not
   hand-author fixtures (**D12**). Escalate; the interim state is `SOURCE_UNAVAILABLE`/
   `IN_DEVELOPMENT`. An official site that genuinely cannot be reached is a
   real official-source constraint, so it is recorded as a limited state with its complete `INGF-07`
   `limitation` block — never as a reason to reduce this group's scope. The launch policy is confirmed
   (plan §8 **Q10**, sub-PRD **D15**): `GOLD-16` produces the measured evidence and the proposed
   registry state, `LNCH-05` verifies the launch statement discloses it accurately, and Gate 2 is
   verification and sign-off, not an opportunity to cut mandatory scope.
6. **An anonymised judgment appears to need de-anonymising to link an appeal chain** → forbidden.
   Record the link only if the court itself publishes it in anonymised form; otherwise leave the
   citation unresolved (sub-PRD **D9**) and count it. Any change to this rule is a **product** change
   under PRD §45.5 requiring founder approval and a PRD update — escalate, never decide locally.
7. **`SCAS-01` lacks a primitive this group needs** → update
   `docs/prd/08-sources-cases/tickets/SCAS-01-case-law-primitives-citation-level-paragraph-identity-treatment.md`
   and the sub-PRD, re-publish the twelve dependent tickets, then implement it **there** (plan §9
   **R2**).
8. **An enum value is missing from `FND-03`** → docs PR against `FND-03`, update
   `docs/prd/08-sources-cases/README.md` **Q1**, then emit.

**Escalation rule.** If this group cannot reach `ACTIVE` or one of PRD §7's four explicit limited
states, stop, record the state together with its complete `INGF-07` `limitation` block — evidence,
affected dates or collections, customer-visible warning and reason — in
`docs/prd/08-sources-cases/README.md`, and carry it through `GOLD-16` → `LNCH-05`. The limited-state
launch policy is confirmed (plan §8 **Q10**, sub-PRD **D15**): mandatory scope is never cut, a limited
state requires measured evidence of a genuine official-source limitation, and Gate 2 is the Founder's
verification and sign-off, not a scope decision. Never soften the registry status to make
composition pass — PRD §44.4 makes that the one forbidden outcome.
