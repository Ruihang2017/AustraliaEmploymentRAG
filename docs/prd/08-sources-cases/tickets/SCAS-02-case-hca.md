---
id: SCAS-02
title: CASE-HCA
module: 08-sources-cases
lane: 08-sources-cases
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [SCAS-01]
blocks: [GOLD-12, GOLD-16]
---

# SCAS-02 — `CASE-HCA`

Implements PRD §40.4 (wave 3 roster, the `CASE-HCA` row), PRD §6.4 (case law and decisions), PRD §9.2
(case treatment) and PRD §40.8 (adapter Definition of Done) <SRCH-004, SRCH-005, ADM-001> — no ADR —
the decision is already made in PRD §40.4; this is build ticket 2 of 13 against it.
Parent sub-PRD: [08-sources-cases README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [SCAS-01 — Case-law primitives: citation, level, paragraph identity, treatment](SCAS-01-case-law-primitives-citation-level-paragraph-identity-treatment.md)
**Why `builder`:** a bounded adapter inside one declared directory against a contract PRD §40.7/§40.8
and `SCAS-01` already fix — not a new subsystem decision.

## Background + basis

**PRD §40.4 gives this group's row verbatim:**

> | Group ID | Official entry/collection | Minimum included material | Initial tier |
> |---|---|---|---|
> | `CASE-HCA` | High Court cases/judgments — <https://www.hcourt.gov.au/cases-and-judgments> | Official judgments, summaries, case numbers, dates, later-case links where evidenced | T1 employment-relevant |

Three phrases in that row are load-bearing:

- **"summaries"** — the Court's own judgment summaries are official, but PRD §6.1 is explicit:
  *"Official regulator summaries MAY supplement but MUST NOT replace primary decisions or operative
  instruments."* A summary is therefore a separate document, never the judgment's text and never the
  holding.
- **"case numbers"** — PRD §9.2 requires *"case number and neutral citation MUST be displayed"*.
- **"later-case links where evidenced"** — the Court's own "cases citing this" data is official
  structured evidence for `CITES` and, by PRD §9.2, *"A citation alone establishes `CITES`, not
  treatment."*

**PRD §6.4** lists *"High Court"* first among the required decision sources, and **PRD §9.1** puts
*"Binding judicial authority"* third in the authority hierarchy — the High Court is the apex of it,
which is why this group is `T1 employment-relevant` rather than long-tail.

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

**PRD §40.8 is the twelve-item Definition of Done** and PRD §45.4 makes it a PR gate (*"Changes to
source adapters include the twelve-item adapter Definition of Done"*): (1) registry row(s), official
URL allowlist and licence snapshot/assessment; (2) discovery fixture and live dry-run evidence;
(3) stable identity/version rules, including deletion/unavailability behaviour; (4) representative
HTML/XML/JSON/PDF fixtures without customer data; (5) parser/node hierarchy and exact-text round-trip
tests; (6) historical/effective/status/event behaviour for at least three time points; (7) incremental
no-change, changed, removed and transient-failure tests; (8) count/hash baseline and anomaly
thresholds; (9) freshness schedule and last-check/last-ingest separation; (10) quarantine cases and
operator recovery action; (11) retrieval/citation evaluation subset; (12) measured storage, parse
time, index size and peak memory. `INGF-09` implements all twelve as `ConformanceTestCase`; this
ticket supplies the group directory it runs against.

**PRD §44.2 `E14-CASES` exit evidence** is *"Case metadata/paragraph/treatment evidence tests"* —
this ticket owes all three for `CASE-HCA`.

**Downstream.** Plan §6.2: `SCAS-02 --> GOLD-12 & GOLD-16`. `GOLD-12` authors the 40 *"case
authority, appeal and treatment"* evaluation cases (PRD §43.1) whose goal is *"24/8/8 with
`TREATMENT_NOT_CONFIRMED` behaviour"*; `GOLD-16` reconciles the full 52-group roster.

**Carried caveats.** Sub-PRD **D12** (fixtures are recorded, never authored), **D13** (official
publishers only — no aggregator, no commercial reporter), **D14** (officially published anonymisation
is preserved and never reversed), **D15** (this group is attempted in full; a limited state is
permitted only on measured evidence of a genuine official-source limitation, recorded in `INGF-07`'s
`limitation` block — the launch policy is confirmed, plan §8 **Q10**), **Q5** (whether this group ends
up limited is a `GOLD-16` measurement output, never a scope choice), **Q6** (PRD §40.9's ±10% / >2%
figures are baseline-selected initial defaults this group may tighten after a representative
baseline).

## Goal

Deliver `pipelines/adapters/case-hca/` as a complete PRD §40.8-conforming source group: the
`registry.yaml` decomposition of the High Court's official judgment collections with their
`material_class`, the URL allowlist, the licence snapshot and assessment, an `adapter.py` implementing
PRD §40.7's eight boundaries over `SCAS-01`'s primitives (neutral citation `[YYYY] HCA N`, stable case
identity, paragraph-exact nodes, bench facts, evidenced `CITES`/treatment relations, special-leave and
appeal events), recorded offline fixtures for discovery, documents, three time points, incremental
change and quarantine, a count/hash baseline, and the five-line `ConformanceTestCase` subclass — such
that `python -m <root>.conformance check pipelines/adapters/case-hca` exits `0` in strict mode with a
committed `conformance-report.json`, and `CASE-HCA` composes into the Source Coverage Registry as
`ACTIVE` or an explicit PRD §7 limited state.

## Non-goals

- **No shared case-law helper.** Citation parsing, identity, paragraphs, treatment, events and
  validation live in `_shared/caselaw/**` (`SCAS-01`). A helper wanted here that is genuinely
  universal is a `SCAS-01` change, never a local copy (plan §9 **R2**).
- **No framework code.** Fetching, hashing, artifact storage, licence gating, parsing/OCR, quarantine
  and run accounting are `INGF-02`…`INGF-06`; the conformance kit is `INGF-09`.
- **No other source group.** Federal Court is `SCAS-03`; FCFCOA is `SCAS-04`; FWC is `SCAS-05`;
  legislation the judgments interpret is `06-sources-legislation`.
- **No relation whose `from_ref` is outside this group.** An HCA judgment may cite or treat an FCA
  judgment; the reverse relation is `SCAS-03`'s to emit. Unresolved targets produce no relation
  (sub-PRD **D9**).
- **No commercial headnote, editorial summary, catchword vocabulary or aggregator content**
  (PRD §6.1, §40.4; sub-PRD **D13**).
- **No corpus table writes, chunking, tiering, embedding or ranking** — PRD §40.7; `CRPS-03`,
  `CRPS-04`, `RETR-06`.
- **No evaluation cases or gold answers** — `GOLD-12`. This ticket only names evaluation-subset ids in
  `registry.yaml` (DoD item 11) and must never read `evals/gold/**` (plan §9 **R9**, PRD §45.1 item 6).
- **No binding/persuasive computation** — `FND-10` (sub-PRD **D8**).

## File-scope (write-owns)

- `pipelines/adapters/case-hca/**` — the whole group directory, in `INGF-07` deliverable 1's layout:
  `registry.yaml`, `allowlist.yaml`, `licence.yaml`, `licence-snapshots/`, `conformance.yaml`,
  `adapter.py`, `fixtures/`, `tests/`, `README.md`.
- Does not touch: `pipelines/adapters/_shared/**` — `SCAS-01` (and `SLEG-01`/`SINS-01`/`SFUT-01` for
  the other three shared trees).
- Does not touch: any sibling `pipelines/adapters/case-*/**` — `SCAS-03`…`SCAS-13`.
- Does not touch: any `pipelines/adapters/{leg,pt,fwc,fwo,ato,adj,future}-*/**` — modules `06`, `07`,
  `09`, `10`.
- Does not touch: `pipelines/ingestion/**` (`05`), `pipelines/corpus-builder/**` (`04`),
  `pipelines/evaluation/**` and `evals/**` (`21`), `packages/**`, `apps/**`, `services/**`,
  `tests/**`, `schemas/**`, `infra/**`.
- `pipelines/adapters/pyproject.toml` (if present): **append-only**, and expected to need no change —
  `INGF-01`'s architecture test forbids HTTP and parser libraries here, so this adapter declares no
  new dependency. Conflicts resolve by re-running `uv lock`, never hand-merge (plan §1.1, PRD §44.3).

**Serial safety.** First decomposition of `docs/PRD.md` (plan §1: phase 1, nothing merged, nothing in
flight); no prior ticket has touched this path. `SCAS-01` has landed — it is this ticket's only
intra-module blocker. The eleven sibling adapter tickets run **concurrently** in the same wave (plan
§7: peak 12 lanes) and are disjoint by construction: each writes exactly one
`pipelines/adapters/case-<group>/` directory, and the only thing the twelve share is the
`_shared/caselaw/**` library they all import and none of them writes. The single shared path is
`pipelines/adapters/pyproject.toml`, append-only by plan §1.1.

## Deliverables

1. **`registry.yaml` — the collection decomposition (DoD item 1; `INGF-07` deliverable 2 schema).**
   `group_id: CASE-HCA`, `wave: 3`, `initial_index_tier: T1`, `authority` = the High Court of
   Australia with `authority_type: COURT`, `jurisdiction: CTH` and a `court_level` value from the
   contract enum. `official_endpoints[]` enumerates the **exact** official collections reached from
   <https://www.hcourt.gov.au/cases-and-judgments>, each with `kind`
   (`LISTING|FEED|API|SITEMAP|MANIFEST|DOCUMENT`) and `material_class` — judgments are `DECISION`;
   the Court's own judgment summaries are `GUIDANCE` (PRD §6.1: they supplement, never replace);
   case/matter listings are `DECISION` metadata sources. `document_coverage.families` distinguishes
   `JUDGMENT` from `JUDGMENT_SUMMARY`; `document_coverage.financial_years` covers at least 2024–25,
   2025–26 and 2026–27 (PRD §6.6) or carries a `known_gaps` entry with `reason_code: DATE_LIMITED`
   and `customer_visible: true` explaining why not. PRD §6.6 also forbids excluding case law *"solely
   because it is older than three financial years"*, so any date floor is a **declared** limitation.
   `change_detection` states the real capability and cadence; `evaluation_subset_ref` names the
   `GOLD-12` case ids this group must retrieve.

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

2. **`allowlist.yaml` (DoD item 1; `INGF-02`'s schema).** Only official High Court publisher hosts
   verified during the recording run. No aggregator, no commercial reporter (sub-PRD **D13**). Every
   `official_endpoints` URL must pass it — `INGF-07` fails composition with
   `REGISTRY_ENDPOINT_NOT_ALLOWLISTED` otherwise.
3. **`licence.yaml` + `licence-snapshots/<date>-<hash>.<ext>` (DoD item 1; `INGF-04`).** The terms
   page captured at acquisition time with its SHA-256, and an independent `LicenceAssessment` stating
   commercial-use, storage, indexing, embedding, display, quotation, export, attribution and
   prohibited-use decisions (PRD §11.1). Unclear rights collapse to metadata/link-only —
   PRD §11.1: *"Unclear rights default to metadata, limited quotation and official links."* If the
   assessment lands on `METADATA_AND_LINK_ONLY`, the group's `adapter_status` becomes
   `METADATA_AND_LINK_ACTIVE` with a customer-visible gap entry (PRD §7), never a silent full-text
   ingest. Any limited status set here
   carries deliverable 1's `limitation` block (`reason_code: LICENSING_RESTRICTION`, with the licence
   assessment and its snapshot hash as evidence).
4. **`adapter.py` — `ADAPTER: SourceAdapter`** (`INGF-01` deliverables 4 and 9), implementing all
   eight PRD §40.7 boundaries:
   - `discover` — official listing/feed/sitemap pages only, through `ctx.fetcher`, with conditional
     requests; emits `RemoteDescriptor`s with a stable `descriptor_key`.
   - `fetch` — `ctx.fetcher` with the declared validators; never a direct HTTP call.
   - `identify` — `SCAS-01`'s `case_identity()` with `IdentityBasis.NEUTRAL_CITATION` from the
     `[YYYY] HCA N` citation; falls back to court file number, then URL path with `weak=True`.
   - `parse` — `ctx.parser` (`INGF-06`'s isolated `ParserHost`) for HTML and PDF; no parser library
     import.
   - `normalise` — `SCAS-01`'s `build_judgment_nodes()`: root judgment node, coversheet/catchwords/
     orders/reasons parts, one node per numbered paragraph (`para/NNNN`, display `[N]`), per-judge
     sections where the source marks them. Judgment summaries normalise as their own
     `LegalDocument` with `document_type = JUDGMENT_SUMMARY`, linked to the judgment but never
     carrying its holding (PRD §6.1).
   - `extract_events` — `SCAS-01`'s `case_event()` for decision-handed-down, special leave
     granted/refused and appeal outcomes, each with an evidence span or an
     `OFFICIAL_STRUCTURED` derivation naming the official field (PRD §15.2).
   - `extract_relations` — `SCAS-01`'s `resolve_citations()` for in-text citations and, where the
     Court publishes later-case links, `record_citation()` with
     `derivation="OFFICIAL_STRUCTURED"`. A treatment relation is emitted **only** through
     `assert_treatment()` with a resolvable evidence span (PRD §9.2/§9.3). Unresolved targets produce
     no relation and are counted (sub-PRD **D9**).
   - `validate` — `SCAS-01`'s `case_validation()` plus any group-specific finding.
   `AdapterMeta` declares `group_id="CASE-HCA"`, `adapter_key="case-hca"`, `jurisdiction="CTH"`,
   `supported_content_types` and `declared_quarantine_reasons`.
5. **Court-code registration.** `register_court_codes("CASE-HCA", {...})` with `CourtFacts` for every
   High Court neutral-citation code this group actually ingests, including `is_appellate` and the
   contract `court_level`. No shared court file is created (`SCAS-01` deliverable 2).
6. **Recorded fixtures (DoD items 2, 4, 6, 7, 10) under `fixtures/`.** Captured from the official site
   through `INGF-02`'s fetcher in a one-off recording run and committed as replayable transcripts
   (`INGF-09` deliverable 6's recorded-response format); **never hand-authored** (sub-PRD **D12**):
   `discovery/` (≥1 recorded listing response), `dry-run.json`
   (`{run_at, descriptors_discovered, sample_urls, tool_versions}`, ≤180 days old),
   `documents/` (one per declared media type, including at least one judgment with ≥1 in-text
   citation to another case and one multi-judgment decision), `timepoints/` (≥3 legal dates),
   `incremental/` (no-change 304, changed, removed, transient 5xx), `quarantine/` (≥1 defective
   artifact per declared reason code), and `baseline.json`
   (`{collections: {name: {count, content_hash_set_sha256}}, captured_at}`).
7. **No-customer-data hygiene (DoD item 4).** Fixtures carry no `Set-Cookie`, `Authorization`/
   `Bearer`, session token, personal email or TFN-shaped content. Published party names in a judgment
   are public case parties (PRD §10.1) and stay exactly as the Court published them; officially
   anonymised material is never de-anonymised (sub-PRD **D14**).
8. **`conformance.yaml`** — resource ceilings for DoD item 12 and, if needed, tighten-only
   `anomaly_overrides` (PRD §40.9; `INGF-09` deliverable 3 forbids loosening). `deferred_items` may
   contain **only** `11`, and only while `evals/cases/**` does not yet exist.
9. **`tests/`** — the five-line conformance subclass
   (`class TestCaseHca(ConformanceTestCase): group_dir = Path(__file__).resolve().parents[1]`) plus
   group-specific unit tests: citation parsing over recorded text, paragraph round-trip, the
   evidenced-citation path, an evidence-free treatment attempt failing, identity stability across two
   recorded versions, and the summary-is-not-the-judgment assertion.
10. **`README.md`** — what was decomposed and why: the exact collections, what is deliberately out of
    scope, the licence position, the change-detection capability actually observed, and any
    `known_gaps`. This is the artifact `GOLD-16` and the Founder read at Gate 2 (PRD §41.3 step 1).
11. **`conformance-report.json`** committed at the group root — the PRD §45.4 evidence artifact.

## Acceptance checklist (classified)

The twelve PRD §40.8 items, in order, each proved for `CASE-HCA`:

- [ ] `[fixture]` **DoD 1 — registry row, URL allowlist, licence snapshot/assessment.**
      `registry.yaml`, `allowlist.yaml` and `licence.yaml` validate; `group_id` is in
      `MANDATORY_SOURCE_GROUPS`; the directory name is `case-hca`; the snapshot's SHA-256 matches
      `terms_sha256`; every endpoint passes the allowlist (PRD §40.8 item 1, §6.1, §11.1).
- [ ] `[fixture]` **DoD 2 — discovery fixture and live dry-run evidence.** Replaying `discovery/`
      through `adapter.discover()` yields ≥1 `RemoteDescriptor` with an allowlisted URL, and
      `dry-run.json` is present, well-formed and within 180 days (PRD §40.8 item 2).
- [ ] `[fixture]` **DoD 3 — stable identity and deletion/unavailability.** `identify()` is
      deterministic and stable across two recorded versions of one judgment; different judgments never
      collide; a removed descriptor yields a `REMOVED` finding, retains the prior version and deletes
      no state (PRD §40.8 item 3; sub-PRD **D14**).
- [ ] `[fixture]` **DoD 4 — representative fixtures without customer data.** Every declared media type
      has a fixture and the no-customer-data scan passes (PRD §40.8 item 4).
- [ ] `[fixture]` **DoD 5 — parser/node hierarchy and exact-text round-trip.** Every judgment fixture
      parses; `assert_roundtrip()` passes; one root, no cycles, contiguous sibling ordinals, every
      `text_hash` recomputes; paragraph `[N]` ↔ `para/NNNN` holds (PRD §40.8 item 5, §15.3;
      **E14 "paragraph"** evidence).
- [ ] `[fixture]` **DoD 6 — three time points.** For ≥3 legal dates the judgment resolves with an
      `effective_from` at its decision date, a PRD §6.7 `legal_status`, and events whose `event_date`
      and `effective_date` are distinguished; no two versions of one document overlap (PRD §40.8
      item 6, §15.2, §35.2).
- [ ] `[fixture]` **DoD 7 — incremental matrix.** No-change (304 → 0 fetched, change-scan date
      advanced, ingestion date unchanged), changed (new version; prior `effective_to` closed), removed
      (`REMOVED`, prior retained), transient failure (bounded retry → `PARTIAL` run, **no** content
      quarantine) (PRD §40.8 item 7).
- [ ] `[fixture]` **DoD 8 — count/hash baseline and anomaly thresholds.** The replayed run reproduces
      `baseline.json` exactly; any `anomaly_overrides` tighten only (PRD §40.8 item 8, §40.9;
      sub-PRD **Q6**).
- [ ] `[machine]` **DoD 9 — freshness schedule with last-check/last-ingest separation.**
      `registry.yaml` declares `change_detection.{capability,cadence}`; a replayed 304 run and a
      replayed content run write **different** fields (PRD §40.8 item 9, §12.1).
- [ ] `[fixture]` **DoD 10 — quarantine cases and operator recovery.** Every code in
      `declared_quarantine_reasons` has a defective fixture producing exactly that code, and each code
      has a non-empty operator action (PRD §40.8 item 10, ADM-001).
- [ ] `[machine]` **DoD 11 — retrieval/citation evaluation subset.** `evaluation_subset_ref` is
      non-empty and well-formed; ids resolve if `evals/cases/**` exists, otherwise the item is
      `DEFERRED(GOLD-16)` with a recorded reason. `evals/gold/**` is never read (PRD §40.8 item 11;
      plan §9 **R9**).
- [ ] `[fixture]` **DoD 12 — measured storage, parse time, index size, peak memory.** All four
      recorded and within the `conformance.yaml` ceilings (PRD §40.8 item 12, §39.2).
- [ ] `[machine]` `python -m <root>.conformance check pipelines/adapters/case-hca` exits `0` in
      **strict** mode and the committed `conformance-report.json` shows `summary.pass == 12` (or
      item 11 `DEFERRED`), `"strict": true` (PRD §45.4).
- [ ] `[machine]` `INGF-07`'s composer includes `CASE-HCA` with all nine PRD §6.1 attributes, a
      `material_class` per endpoint, the five PRD §12.1 dates as separate fields, and a
      release-acceptable status with a customer-visible gap entry if limited (PRD §6.1, §7, §12.1,
      ADM-001).
- [ ] `[machine]` **A limited status composes only with its complete `limitation` block.** If
      `adapter_status` is one of PRD §7's four limited states, `INGF-07`'s composed output carries the
      `limitation` block verbatim — matching `state`, a closed-set `reason_code`, `reason_detail`, at
      least one `evidence` entry, an `affected` scope and a `customer_visible_warning` — and
      composition fails with `REGISTRY_LIMITATION_MISSING`/`_UNEVIDENCED`/`_SCOPE_MISSING`/
      `_WARNING_MISSING` when any part is missing; an `ACTIVE` group carries `limitation: null`
      (`INGF-07` deliverables 3 and 7; sub-PRD **D15**; plan §8 **Q10**).
- [ ] `[fixture]` **E14 "case metadata" evidence** — court, level, decision date, case/matter number
      and neutral citation are extracted for every recorded judgment; a fixture missing a neutral
      citation is flagged, not silently defaulted (PRD §44.2 `E14`, §9.2 bullet 1).
- [ ] `[fixture]` **E14 "treatment evidence" evidence** — an in-text citation produces a `CITES`
      relation with a resolvable evidence span; an official later-case link produces `CITES` and
      **not** a treatment; an evidenced treatment fixture produces exactly one treatment relation with
      its span; a case pair with only citations reports `TREATMENT_NOT_CONFIRMED` (PRD §44.2 `E14`,
      §9.2; sub-PRD **D3**, **D4**).
- [ ] `[machine]` No `MODEL_SUGGESTED` relation and no evidence-free treatment can be emitted by this
      adapter — negative control over `adapter.extract_relations()` (PRD §9.3; sub-PRD **D5**).
- [ ] `[machine]` The adapter imports no HTTP or parser library and no corpus/app database module —
      `INGF-01` deliverable 11's architecture scan (PRD §37.4, §40.7, §39.1, SEC-002).
- [ ] `[machine]` The whole suite runs offline: every test replays recorded fixtures with no outbound
      network (session fixture asserts it).
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, §20.3).
- [ ] `[machine]` `pnpm test` green — standing item; this ticket adds no TypeScript, so "unchanged and
      green" (plan §1.1, PRD §45.3).
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (**SRCH-004**, **SRCH-005**,
      **ADM-001**; supports **SRCH-003**) and UAT IDs (**none** — no PRD §41.2 row exercises this
      group directly; the nearest customer-visible surface is PRD §41.3 step 1's registry walkthrough);
      schema/API/event compatibility (none — no shared schema changes); tenant/PII/security impact
      (public official judgment text only; sub-PRD **D14** anonymisation rule; SSRF surface is
      `INGF-02`'s allowlist); **source/licence impact** (the licence assessment and any quotation
      limit it imposes); cost/memory/latency impact (DoD item 12's four measurements, which are inputs
      to PRD §39.2's 2 GiB host budget); rollback path (remove the directory; the registry then fails
      composition with `MANDATORY_GROUP_MISSING`, which is the intended loud failure); known gaps
      (every `known_gaps` entry, verbatim).
- [ ] `[human]` **Founder review of the decomposition and coverage claim** — whether the recorded
      collections genuinely cover *"Official judgments, summaries, case numbers, dates, later-case
      links where evidenced"* for employment-relevant High Court material, and whether any limitation
      is stated honestly. PRD §43.4 item 4 puts source adapter count/time/licence/quarantine anomalies
      in the founder queue and item 5 puts case-treatment failures there; PRD §44.4 forbids calling
      the category covered otherwise.
- **No further `[fixture]` classes** beyond the recorded transcripts above, and **no additional
  `[human]` criteria** — everything else is mechanically checkable. Declared explicitly.

## Test plan

Harness: `uv run pytest pipelines/adapters/case-hca/tests -q`, fully offline, replaying only committed
fixtures. Copy the construction pattern from `pipelines/ingestion/src/<root>/conformance/reference/`
(`INGF-09` deliverable 7's reference adapter) — it is the worked example this directory mirrors.

1. `uv sync --frozen && uv run pytest pipelines/adapters/case-hca/tests -q`.
2. `python -m <root>.conformance check pipelines/adapters/case-hca` — strict, exit `0`, report written
   and schema-valid; diff it against the committed `conformance-report.json`.
3. **`test_citation_and_metadata.py`** — `[YYYY] HCA N` parsing over recorded judgment text, offsets
   index the source exactly, case/matter number and decision date extracted, bench facts recorded.
4. **`test_paragraphs.py`** — round-trip over the recorded judgments including the multi-judgment
   decision; `para/NNNN` keys; `[N]` labels; contiguous ordinals.
5. **`test_relations.py`** — in-text citation → `CITES` with a hash-matching span; official later-case
   link → `CITES` only; the evidenced-treatment fixture → one treatment relation; a synthetic attempt
   to assert treatment without evidence or with `MODEL_SUGGESTED` raises; `treatment_status()` returns
   `TREATMENT_NOT_CONFIRMED` for a citation-only pair.
6. **`test_summary_not_judgment.py`** — a judgment summary normalises as its own document with
   `document_type = JUDGMENT_SUMMARY` and never supplies the judgment's node text (PRD §6.1).
7. **`test_incremental.py`** — the four DoD item 7 scenarios via `ReplayFetcher`, asserting run counts,
   status, and that a 304 advances only the change-scan date.
8. **`test_quarantine.py`** — each defective fixture produces its declared reason code.
9. **`test_offline.py`** — the session-level assertion that no socket is opened.
10. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus: (a) open `allowlist.yaml` and confirm every host is an official High Court publisher —
one aggregator entry falsifies PRD §6.1 and §40.4 for the whole group; (b) confirm the fixtures are
recorded transcripts with real HTTP metadata, not hand-written HTML (sub-PRD **D12**); (c) run
`test_relations.py` and confirm no path turns an official "cases citing this" link into a treatment;
(d) confirm the `registry.yaml` coverage claim matches what the fixtures actually prove, and that any
shortfall appears as a `known_gaps` entry with `customer_visible: true` rather than silence.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (a docs PR/MR,
a changelog line in `docs/prd/08-sources-cases/README.md`, then `publish-tickets.mjs --sync`), and
only then change code. Silent divergence is an incomplete ticket; the ticket wins over any
implementation plan (CLAUDE.md, issue #53).

**Foreseeable frictions and their exact writeback targets:**

1. **The Court publishes no reliable delta mechanism** (no feed, no sitemap, no conditional requests)
   → set `change_detection.capability` honestly and let `INGF-07` derive `FRESHNESS_LIMITED`; add a
   `known_gaps` entry with `customer_visible: true`; record it in
   `docs/prd/08-sources-cases/README.md`. PRD §12.1: *"Sources without reliable delta mechanisms MUST
   show `FRESHNESS_LIMITED` rather than a false guarantee."* Never infer freshness from a page's own
   "last updated" string.
2. **Licensing is unclear or restrictive** → `INGF-04`'s assessment collapses to
   `METADATA_AND_LINK_ONLY` (PRD §11.1) and `adapter_status` becomes `METADATA_AND_LINK_ACTIVE` with a
   customer-visible gap; record it in `docs/prd/08-sources-cases/README.md`. Never ingest full text
   "pending clarification", and never substitute an aggregator copy (PRD §40.4, sub-PRD **D13**).
3. **A required class or historical range is not published** → `registry.yaml` records
   `SOURCE_UNAVAILABLE` or date-limited coverage with a customer-visible gap, exactly as PRD §40.4
   directs, and the shortfall goes into `docs/prd/08-sources-cases/README.md`. PRD §44.4: *"It is not
   permitted to silently call an unimplemented source category covered."*
4. **The site cannot be reached from the build environment** (sub-PRD **Q8**) → **stop**. Do not
   hand-author fixtures (sub-PRD **D12**). Escalate; the honest interim state is
   `SOURCE_UNAVAILABLE`/`IN_DEVELOPMENT` recorded in `docs/prd/08-sources-cases/README.md`. An
   official site that genuinely cannot be reached is a real official-source constraint, so it is recorded as a limited state with its complete `INGF-07`
   `limitation` block — never as a reason to reduce this group's scope. The launch policy is confirmed
   (plan §8 **Q10**, sub-PRD **D15**): `GOLD-16` produces the measured evidence and the proposed
   registry state, `LNCH-05` verifies the launch statement discloses it accurately, and Gate 2 is
   verification and sign-off, not an opportunity to cut mandatory scope.
5. **`SCAS-01` lacks a primitive this group needs** (a citation form, a paragraph key space, an
   evidence-span variant) → update
   `docs/prd/08-sources-cases/tickets/SCAS-01-case-law-primitives-citation-level-paragraph-identity-treatment.md`
   and the sub-PRD, re-publish the twelve dependent tickets, then implement it **there**. Never add a
   local copy: plan §9 **R2** names divergent copies as the worst outcome for shared adapter code.
6. **An enum value this group needs is missing from `FND-03`** → docs PR against `FND-03` (plan §4.2
   gives canonical enums one owner), update `docs/prd/08-sources-cases/README.md` **Q1**, then emit.
7. **DoD item 12's measurements exceed the `conformance.yaml` ceilings** → raise this group's ceiling
   with the measurement as justification and report the aggregate in the PR's cost/memory line. If the
   aggregate across 52 groups threatens PRD §39.2's 2 GiB budget, that is `RLSE-11`'s benchmark
   decision (plan §8 **Q3**) — escalate rather than quietly excluding material.
8. **An architectural choice emerges that outlives this ticket** (for example a general rule for
   modelling official judgment summaries across all twelve groups) → record it as a decision in
   `docs/prd/08-sources-cases/README.md`, or as `docs/adr/NNNN-<slug>.md` if durable (plan §2.1 **A9**:
   ADR files are owned per-file by the creating ticket).

**Escalation rule.** If this group cannot reach `ACTIVE` or one of PRD §7's four explicit limited
states, that is not a local judgement call: PRD §7 forbids `PLANNED_NOT_ACTIVE` at release and
PRD §44.4 forbids reporting the category covered. Stop, record the state together with its complete
`INGF-07` `limitation` block — evidence, affected dates or collections, customer-visible warning and
reason — in `docs/prd/08-sources-cases/README.md`, and carry it through `GOLD-16` → `LNCH-05`. The
limited-state launch policy is confirmed (plan §8 **Q10**, sub-PRD **D15**): mandatory scope is never
cut, a limited state requires measured evidence of a genuine official-source limitation, and Gate 2 is
the Founder's verification and sign-off, not a scope decision. Never soften the registry status to make
composition pass.
