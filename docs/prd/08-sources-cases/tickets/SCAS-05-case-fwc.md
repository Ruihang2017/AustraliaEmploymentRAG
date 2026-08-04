---
id: SCAS-05
title: CASE-FWC
module: 08-sources-cases
lane: 08-sources-cases
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [SCAS-01, SINS-02]
blocks: [GOLD-12, GOLD-16]
---

# SCAS-05 — `CASE-FWC`

Implements PRD §40.4 (wave 3 roster, the `CASE-FWC` row), PRD §6.4 (case law and decisions), PRD §9.2
(case treatment) and PRD §40.8 (adapter Definition of Done) <SRCH-004, SRCH-005, ADM-001> — no ADR —
the decision is already made in PRD §40.4; this is build ticket 5 of 13 against it.
Parent sub-PRD: [08-sources-cases README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [SCAS-01 — Case-law primitives: citation, level, paragraph identity, treatment](SCAS-01-case-law-primitives-citation-level-paragraph-identity-treatment.md)
and `SINS-02` — `FWC-DOCS` (FWC Document Search), module `07-sources-instruments`
(`docs/prd/07-sources-instruments/tickets/`).
**Why `builder`:** a bounded adapter inside one declared directory against a contract PRD §40.7/§40.8,
`SCAS-01` and `SINS-02` already fix — not a new subsystem decision.

## Background + basis

**PRD §40.4 gives this group's row verbatim:**

> | Group ID | Official entry/collection | Minimum included material | Initial tier |
> |---|---|---|---|
> | `CASE-FWC` | FWC Document Search | FWC/FWCFB/FWCA decisions and orders; matter/section/bench metadata | T1 high-value; T2 long tail |

**The official entry is the same portal as PRD §40.3's `FWC-DOCS`** — *"FWC Document Search —
<https://www.fwc.gov.au/document-search>"*, whose required artifacts are *"Decisions, orders,
modern/historical awards, variations, agreements, Full Bench and research material"*. That overlap is
why plan §5.9 makes this ticket `blocked_by SINS-02`, and it is settled by sub-PRD **D10**:

> **`CASE-FWC` reuses `FWC-DOCS`'s portal discovery and must not fork it.** Decisions and orders (with
> matter/section/bench metadata) belong to `CASE-FWC`; awards, agreements, variations, pay data and
> research material belong to `FWC-DOCS`/`FWC-AWARDS`/`FWC-AGREEMENTS`.

Plan §4 makes this safe: *"Read access is unrestricted; only writes are allocated."* This ticket
**imports** what `SINS-02` publishes for portal discovery and writes only inside
`pipelines/adapters/case-fwc/`. Forking the discovery client would be the divergence plan §9 **R2**
forbids; adding a new `_shared/fwc/` tree would claim a path plan §4 allocates to no module.

**Three metadata classes are named in the row and are therefore mandatory:**

- **matter** — the FWC matter number (for example the `AG…`/`B…`/`C…`/`U…` series the Commission
  publishes), satisfying PRD §9.2's *"case number"*;
- **section** — the Fair Work Act provision under which the matter was decided, which is what makes an
  FWC decision retrievable by provision (`SRCH-004`, PRD §17.1 *"Exact identifiers include provisions,
  neutral citations, case numbers, award/agreement identifiers and ABNs"*);
- **bench** — the members who constituted the tribunal, including whether it was a Full Bench.
  PRD §6.2 requires *"Fair Work Commission decisions, orders and Full Bench material"* and PRD §6.4
  requires *"Fair Work Commission, including Full Bench decisions"*.

**Decisions and orders are not the same thing.** PRD §9.1 ranks *"FWC orders, approved agreements,
modern awards and decisions with operative effect"* (rank 4) above *"Persuasive court, tribunal and FWC
decisions"* (rank 5) — so an order with operative effect carries an effective interval and a PRD §6.7
status, while a decision is dated reasons. This adapter must distinguish them in `document_type`, not
merge them.

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

**Downstream.** Plan §6.2: `SCAS-05 --> GOLD-12 & GOLD-16`.

**Carried caveats.** Sub-PRD **D10**/**Q4** (the `FWC-DOCS` split, agreed jointly with module `07`),
**D12** (fixtures recorded, never authored), **D13** (official publishers only), **D14**
(anonymisation preserved), **D15** (attempted in full; a limited state only on measured evidence of
a genuine official-source limitation, recorded in `INGF-07`'s `limitation` block — plan §8 **Q10** is
a confirmed policy), **Q5** (whether this group ends up limited is a `GOLD-16` measurement output,
never a scope choice), **Q6** (PRD §40.9's thresholds are baseline-selected initial defaults,
tightenable after a representative baseline).

## Goal

Deliver `pipelines/adapters/case-fwc/` as a complete PRD §40.8-conforming source group: the
`registry.yaml` decomposition of the FWC decision/order collections **with document families disjoint
from `FWC-DOCS`**, the URL allowlist, licence snapshot and assessment, an `adapter.py` that reuses
`SINS-02`'s portal discovery and implements PRD §40.7's eight boundaries over `SCAS-01`'s primitives —
`[YYYY] FWC/FWCFB/FWCA N` citations, matter/section/bench metadata, `DECISION` vs `ORDER` document
types with operative effective intervals for orders, paragraph-exact nodes, evidenced `CITES`/appeal
treatment — recorded offline fixtures for discovery, documents, three time points, incremental change
and quarantine, a count/hash baseline, and the five-line `ConformanceTestCase` subclass — such that
`python -m <root>.conformance check pipelines/adapters/case-fwc` exits `0` in strict mode with a
committed `conformance-report.json`, and `CASE-FWC` composes into the Source Coverage Registry as
`ACTIVE` or an explicit PRD §7 limited state.

## Non-goals

- **No awards, enterprise agreements, variations, pay data or research material** — `SINS-02`,
  `SINS-03`, `SINS-04` (sub-PRD **D10**). A document of those families encountered during discovery is
  skipped with a counted reason, never ingested here.
- **No fork of `FWC-DOCS`'s portal discovery** — import it (**D10**); a needed change belongs in
  `SINS-02` (see feedback obligation 1).
- **No shared case-law helper** — `_shared/caselaw/**` is `SCAS-01`'s; a universal addition is a
  `SCAS-01` change, never a local copy (plan §9 **R2**).
- **No framework code** — `INGF-02`…`INGF-06`, `INGF-09`.
- **No other decision group** — HCA `SCAS-02`, FCA `SCAS-03`, FCFCOA `SCAS-04`, state/territory
  `SCAS-06`…`SCAS-13`. A relation whose `from_ref` is not an FWC decision belongs to the group that
  owns the citing document (sub-PRD **D9**).
- **No Coverage Navigator logic** — `ASK-08` consumes award/agreement data from `SINS-03`/`SINS-04`,
  not from this group.
- **No corpus table writes, chunking, tiering, embedding or ranking** — PRD §40.7; `CRPS-03`,
  `CRPS-04`, `RETR-06`.
- **No evaluation cases or gold answers** — `GOLD-12`; `evals/gold/**` never read (plan §9 **R9**).
- **No binding/persuasive computation** — `FND-10` (sub-PRD **D8**).

## File-scope (write-owns)

- `pipelines/adapters/case-fwc/**` — the whole group directory in `INGF-07` deliverable 1's layout:
  `registry.yaml`, `allowlist.yaml`, `licence.yaml`, `licence-snapshots/`, `conformance.yaml`,
  `adapter.py`, `fixtures/`, `tests/`, `README.md`.
- Does not touch: `pipelines/adapters/fwc-docs/**`, `fwc-awards/**`, `fwc-agreements/**` —
  `07-sources-instruments` (`SINS-02`, `SINS-03`, `SINS-04`). This ticket **reads and imports** from
  `fwc-docs`; it writes nothing there.
- Does not touch: `pipelines/adapters/_shared/**` — `SCAS-01`, `SINS-01`, `SLEG-01`, `SFUT-01`. No new
  `_shared/` subtree is created (plan §4 allocates none for FWC).
- Does not touch: any sibling `pipelines/adapters/case-*/**` — `SCAS-02`…`SCAS-04`, `SCAS-06`…`SCAS-13`.
- Does not touch: `pipelines/ingestion/**` (`05`), `pipelines/corpus-builder/**` (`04`),
  `pipelines/evaluation/**` and `evals/**` (`21`), `packages/**`, `apps/**`, `services/**`,
  `tests/**`, `schemas/**`, `infra/**`.
- `pipelines/adapters/pyproject.toml` (if present): **append-only**, expected to need no change.
  Conflicts resolve by re-running `uv lock`, never hand-merge (plan §1.1, PRD §44.3).

**Serial safety.** First decomposition of `docs/PRD.md`; nothing merged, nothing in flight. Two
blockers have landed: `SCAS-01` (intra-module) and `SINS-02` (module `07`, whose `fwc-docs/`
directory this ticket only reads). The eleven sibling adapter tickets in this module run
**concurrently** (plan §7: peak 12 lanes) and are disjoint by directory; the twelve share only the
`_shared/caselaw/**` library. Module `07`'s remaining tickets may also be in flight — none of them
writes `pipelines/adapters/case-fwc/**`. The single shared path is
`pipelines/adapters/pyproject.toml`, append-only by plan §1.1.

## Deliverables

1. **`registry.yaml` — the collection decomposition with a disjoint family set (DoD item 1).**
   `group_id: CASE-FWC`, `wave: 3`, `authority` = the Fair Work Commission (`authority_type:
   COMMISSION`, `jurisdiction: CTH`, a contract `court_level`). `official_endpoints[]` enumerates the
   exact Document Search collections/queries this group uses, each with `kind` and `material_class` —
   decisions are `DECISION`; orders with operative effect are `OPERATIVE_INSTRUMENT`.
   `document_coverage.families` lists **only** `DECISION` and `ORDER` families and is asserted
   **disjoint from `FWC-DOCS`'s** (deliverable 6). `initial_index_tier` records the row's
   `T1 high-value; T2 long tail` split with the criterion used. `financial_years` covers at least
   2024–25, 2025–26 and 2026–27 (PRD §6.6) or carries a `known_gaps` entry (`reason_code:
   DATE_LIMITED`, `customer_visible: true`). `evaluation_subset_ref` names the `GOLD-12` ids.

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

2. **`allowlist.yaml` (DoD item 1; `INGF-02`'s schema).** Only official FWC hosts verified during the
   recording run — no aggregator (**D13**). Where `SINS-02`'s allowlist already covers the portal, this
   group states its own entries rather than depending on another group's file (per-adapter ownership,
   plan §2.1 **A2**).
3. **`licence.yaml` + `licence-snapshots/<date>-<hash>.<ext>` (DoD item 1; `INGF-04`).** Terms captured
   at acquisition with SHA-256 plus an independent `LicenceAssessment` over all nine PRD §11.1 axes.
   Unclear rights collapse to metadata/link-only → `METADATA_AND_LINK_ACTIVE` with a customer-visible
   gap. Any limited status set here
   carries deliverable 1's `limitation` block (`reason_code: LICENSING_RESTRICTION`, with the licence
   assessment and its snapshot hash as evidence).
4. **Portal discovery reuse (**D10**).** `discover()` calls the discovery surface `SINS-02` publishes
   for the FWC Document Search, filtered to the decision/order families. The import path and the
   symbols used are recorded in this group's `README.md`. If `SINS-02` publishes no reusable surface,
   see feedback obligation 1 — the fix is a `SINS-02` change, never a local fork.
5. **`adapter.py` — `ADAPTER: SourceAdapter`** (`INGF-01` deliverables 4 and 9), implementing all
   eight PRD §40.7 boundaries:
   - `discover` — via deliverable 4, with conditional requests.
   - `fetch` — `ctx.fetcher` with declared validators.
   - `identify` — `SCAS-01`'s `case_identity()` from the `[YYYY] FWC N` / `[YYYY] FWCFB N` /
     `[YYYY] FWCA N` citation; falls back to the FWC **matter number**, then URL path with
     `weak=True`.
   - `parse` — `ctx.parser` (`INGF-06`) for HTML, PDF and DOC-family outputs the Commission publishes.
   - `normalise` — `SCAS-01`'s `build_judgment_nodes()`: root node, parts, one node per numbered
     paragraph (`para/NNNN`, display `[N]`). `document_type` distinguishes `DECISION` from `ORDER`;
     an order with operative effect carries `effective_from`/`effective_to` and a PRD §6.7
     `legal_status`, a decision carries its decision date.
   - `extract_events` — `SCAS-01`'s `case_event()` for decision-handed-down, order operative/varied/
     revoked and appeal (permission-to-appeal and Full Bench outcome) events, each with an evidence
     span or an `OFFICIAL_STRUCTURED` derivation naming the official field.
   - `extract_relations` — `resolve_citations()` for `CITES`; `assert_treatment()` only with a
     resolvable evidence span, notably for a Full Bench decision that quashes or confirms a
     first-instance decision. Unresolved targets produce no relation and are counted (**D9**).
   - `validate` — `case_validation()` plus the family-disjointness check of deliverable 6.
   `AdapterMeta` declares `group_id="CASE-FWC"`, `adapter_key="case-fwc"`, `jurisdiction="CTH"`.
6. **Family disjointness is enforced, not assumed (**D10**).** A validation rule fails the run when a
   normalised document's `document_type` falls in `FWC-DOCS`/`FWC-AWARDS`/`FWC-AGREEMENTS` territory
   (award, agreement, variation, pay-data or research material). Encountered documents of those
   families are skipped with a counted reason, so double coverage is visible in the run report rather
   than silent.
7. **Matter, section and bench metadata (the row's mandatory metadata).** Every ingested document
   records the matter number, the Fair Work Act section(s) the source states, and `BenchFacts`
   (`members`, `bench_size`, `is_full_bench`, `presiding`) from `SCAS-01` deliverable 5. A document
   with none of the three recorded is quarantined rather than ingested with empty metadata.
8. **Court-code registration.** `register_court_codes("CASE-FWC", {...})` with `CourtFacts` for `FWC`,
   `FWCFB` (`is_appellate=True`) and `FWCA`, each with the contract `court_level`. An unregistered code
   quarantines.
9. **Recorded fixtures (DoD items 2, 4, 6, 7, 10) under `fixtures/`.** Captured from the official
   portal through `INGF-02`'s fetcher in a one-off recording run, committed as replayable transcripts
   (`INGF-09` deliverable 6 format), **never hand-authored** (**D12**): `discovery/`, `dry-run.json`
   (≤180 days old), `documents/` (one per declared media type, including at least one single-member
   decision, one Full Bench decision, and one **order** with an operative interval), `timepoints/`
   (≥3 legal dates, one of which exercises an order's effective interval), `incremental/` (304,
   changed, removed, transient 5xx), `quarantine/` (≥1 per declared reason code), `baseline.json`.
10. **No-customer-data hygiene (DoD item 4).** No `Set-Cookie`, `Authorization`/`Bearer`, session
    token, personal email or TFN-shaped content. Published party names are public case parties
    (PRD §10.1) and stay as published; officially anonymised material is never de-anonymised (**D14**).
11. **`conformance.yaml`** — DoD item 12 ceilings and tighten-only `anomaly_overrides` (PRD §40.9).
    `deferred_items` may contain only `11`.
12. **`tests/`** — the five-line conformance subclass plus group-specific unit tests: family
    disjointness, matter/section/bench extraction, decision-vs-order modelling with the order's
    effective interval, paragraph round-trip, Full Bench treatment evidence, identity stability.
13. **`README.md`** — the decomposition, the `SINS-02` import surface actually used, the family split
    and how it is enforced, the licence position, the observed change-detection capability and every
    `known_gaps` entry. Read by `GOLD-16` and the Founder at Gate 2 (PRD §41.3 step 1).
14. **`conformance-report.json`** committed at the group root — the PRD §45.4 evidence artifact.

## Acceptance checklist (classified)

The twelve PRD §40.8 items, in order, each proved for `CASE-FWC`:

- [ ] `[fixture]` **DoD 1 — registry row, URL allowlist, licence snapshot/assessment.** All three files
      validate; `group_id` is in `MANDATORY_SOURCE_GROUPS`; directory name is `case-fwc`; the
      snapshot's SHA-256 matches `terms_sha256`; every endpoint passes the allowlist (PRD §40.8 item 1,
      §6.1, §11.1).
- [ ] `[fixture]` **DoD 2 — discovery fixture and live dry-run evidence.** Replaying `discovery/`
      through the `SINS-02`-based discovery yields ≥1 `RemoteDescriptor` with an allowlisted URL;
      `dry-run.json` present, well-formed, ≤180 days old (PRD §40.8 item 2).
- [ ] `[fixture]` **DoD 3 — stable identity and deletion/unavailability.** Deterministic and stable
      across two recorded versions; no collisions; a removed descriptor yields `REMOVED`, retains the
      prior version and deletes no state (PRD §40.8 item 3).
- [ ] `[fixture]` **DoD 4 — representative fixtures without customer data.** Every declared media type
      has a fixture; the no-customer-data scan passes (PRD §40.8 item 4).
- [ ] `[fixture]` **DoD 5 — parser/node hierarchy and exact-text round-trip.** `assert_roundtrip()`
      passes for every fixture; one root, no cycles, contiguous sibling ordinals, every `text_hash`
      recomputes; `[N]` ↔ `para/NNNN` (PRD §40.8 item 5, §15.3; **E14 "paragraph"** evidence).
- [ ] `[fixture]` **DoD 6 — three time points.** For ≥3 legal dates, decisions resolve at their
      decision date and the **order** fixture resolves inside/outside its operative interval with the
      correct PRD §6.7 status; events distinguish `event_date` from `effective_date`; no overlapping
      versions (PRD §40.8 item 6, §15.2, §35.2, §9.1 rank 4).
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
- [ ] `[machine]` `python -m <root>.conformance check pipelines/adapters/case-fwc` exits `0` in
      **strict** mode; the committed report shows `summary.pass == 12` (or item 11 `DEFERRED`) and
      `"strict": true` (PRD §45.4).
- [ ] `[machine]` `INGF-07`'s composer includes `CASE-FWC` with all nine PRD §6.1 attributes, a
      `material_class` per endpoint, the five PRD §12.1 dates separated, and a release-acceptable
      status with a customer-visible gap entry if limited (PRD §6.1, §7, §12.1, ADM-001).
- [ ] `[machine]` **A limited status composes only with its complete `limitation` block.** If
      `adapter_status` is one of PRD §7's four limited states, `INGF-07`'s composed output carries the
      `limitation` block verbatim — matching `state`, a closed-set `reason_code`, `reason_detail`, at
      least one `evidence` entry, an `affected` scope and a `customer_visible_warning` — and
      composition fails with `REGISTRY_LIMITATION_MISSING`/`_UNEVIDENCED`/`_SCOPE_MISSING`/
      `_WARNING_MISSING` when any part is missing; an `ACTIVE` group carries `limitation: null`
      (`INGF-07` deliverables 3 and 7; sub-PRD **D15**; plan §8 **Q10**).
- [ ] `[machine]` **Family disjointness (sub-PRD D10).** `document_coverage.families` is disjoint from
      `FWC-DOCS`'s, and an award/agreement/variation/pay-data/research fixture is skipped with a
      counted reason rather than ingested — asserted against the merged `fwc-docs/registry.yaml`
      (deliverable 6; PRD §40.3 vs §40.4).
- [ ] `[machine]` **Discovery is reused, not forked.** A test asserts `discover()` resolves through
      `SINS-02`'s published surface and that this directory contains no second implementation of portal
      discovery (**D10**; plan §9 **R2**).
- [ ] `[fixture]` **E14 "case metadata" evidence** — court (`FWC`/`FWCFB`/`FWCA`), level, decision
      date, **matter number**, **Fair Work Act section** and **bench composition** are extracted for
      every recorded document; a document with none of the three metadata classes quarantines
      (PRD §44.2 `E14`, §9.2 bullet 1, §40.4 row; deliverable 7).
- [ ] `[fixture]` **E14 "treatment evidence" evidence** — an in-text citation produces `CITES` with a
      hash-matching span; the Full Bench fixture's evidenced appeal outcome produces exactly one
      correctly-directed treatment relation; a citation-only pair reports `TREATMENT_NOT_CONFIRMED`
      (PRD §44.2 `E14`, §9.2; sub-PRD **D3**, **D4**).
- [ ] `[machine]` **Decision vs order.** An order carries an operative effective interval and a PRD
      §6.7 status; a decision does not acquire one; the two never share a `document_type`
      (PRD §9.1 ranks 4 and 5).
- [ ] `[machine]` No `MODEL_SUGGESTED` relation and no evidence-free treatment can be emitted by this
      adapter — negative control over `adapter.extract_relations()` (PRD §9.3; **D5**).
- [ ] `[machine]` The adapter imports no HTTP or parser library and no corpus/app database module —
      `INGF-01` deliverable 11's architecture scan (PRD §37.4, §40.7, §39.1, SEC-002).
- [ ] `[machine]` The whole suite runs offline: every test replays recorded fixtures with no outbound
      network (session fixture asserts it).
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, §20.3).
- [ ] `[machine]` `pnpm test` green — standing item; no TypeScript in this ticket (plan §1.1).
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (**SRCH-004**, **SRCH-005**,
      **ADM-001**; supports **SRCH-003** and, indirectly, **COV-003** by keeping agreement material out
      of this group) and UAT IDs (**none** — no PRD §41.2 row exercises this group directly);
      **schema/API/event compatibility** (this PR states the exact `SINS-02` symbols it imports — a
      cross-module coupling that must be visible); tenant/PII/security impact (public official decision
      text; **D14**; SSRF surface is `INGF-02`'s allowlist); **source/licence impact** (the assessment
      and any quotation limit); cost/memory/latency impact (DoD item 12's measurements against PRD
      §39.2's 2 GiB budget); rollback path (remove the directory — the registry then fails with
      `MANDATORY_GROUP_MISSING`); known gaps (every `known_gaps` entry, verbatim).
- [ ] `[human]` **Founder/Architect review of the `FWC-DOCS` ↔ `CASE-FWC` split** (sub-PRD **Q4**) —
      whether the family boundary leaves any required PRD §6.2 material unowned, and whether the
      coverage claim is honest. This is the one place in the module where two groups face the same
      portal, so the risk is either double coverage or an unowned gap (PRD §43.4 items 4–5; PRD §44.4).
- **No further `[fixture]` classes** beyond the recorded transcripts above, and **no additional
  `[human]` criteria**. Declared explicitly.

## Test plan

Harness: `uv run pytest pipelines/adapters/case-fwc/tests -q`, fully offline, replaying only committed
fixtures. Copy the construction pattern from `pipelines/ingestion/src/<root>/conformance/reference/`
(`INGF-09` deliverable 7) and, for the portal-discovery call, from `SINS-02`'s own tests.

1. `uv sync --frozen && uv run pytest pipelines/adapters/case-fwc/tests -q`.
2. `python -m <root>.conformance check pipelines/adapters/case-fwc` — strict, exit `0`, report
   schema-valid; diff against the committed `conformance-report.json`.
3. **`test_family_split.py`** — loads the merged `fwc-docs/registry.yaml` and asserts family
   disjointness; an award/agreement fixture is skipped with a counted reason.
4. **`test_discovery_reuse.py`** — `discover()` goes through `SINS-02`'s surface; a repository scan
   asserts no second portal-discovery implementation exists in this directory.
5. **`test_metadata.py`** — matter number, Fair Work Act section and bench composition extracted for
   every recorded document; a metadata-free fixture quarantines.
6. **`test_decision_vs_order.py`** — the order fixture carries an operative interval and status; the
   decision fixture does not; the three time points resolve correctly on both.
7. **`test_paragraphs.py`** — round-trip, `para/NNNN` keys, `[N]` labels, contiguous ordinals.
8. **`test_relations.py`** — `CITES` with a hash-matching span; the Full Bench appeal fixture → one
   correctly-directed treatment relation; backwards-in-time and `MODEL_SUGGESTED` raise; a
   citation-only pair → `TREATMENT_NOT_CONFIRMED`.
9. **`test_incremental.py`** — the four DoD item 7 scenarios via `ReplayFetcher`.
10. **`test_quarantine.py`** — each defective fixture produces its declared reason code.
11. **`test_offline.py`** — the session-level no-socket assertion.
12. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus: (a) the family split is **enforced by a test against `FWC-DOCS`'s own registry**, not
asserted in prose — double coverage or an unowned gap is the specific risk of this group;
(b) `discover()` genuinely reuses `SINS-02` and no second crawler exists here; (c) an order's operative
interval is modelled and a decision's is not; (d) fixtures are recorded transcripts (**D12**) and the
allowlist contains only official FWC hosts (**D13**).

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (a docs PR/MR,
a changelog line in `docs/prd/08-sources-cases/README.md`, then `publish-tickets.mjs --sync`), and
only then change code. Silent divergence is an incomplete ticket; the ticket wins over any
implementation plan (CLAUDE.md, issue #53).

**Foreseeable frictions and their exact writeback targets:**

1. **`SINS-02` publishes no reusable discovery surface, or one that cannot be filtered to decisions
   and orders** (sub-PRD **Q4**) → **do not fork it**. Open a docs PR against
   `docs/prd/07-sources-instruments/tickets/` (`SINS-02`) requesting the surface, update
   `docs/prd/08-sources-cases/README.md` **D10**/**Q4**, re-publish both tickets, then implement. A
   second FWC crawler is exactly the divergence plan §9 **R2** forbids, and a new `_shared/fwc/` tree
   would claim a path plan §4 allocates to no module — that would need a `docs/prd/breakdown-plan.md`
   §4 change first.
2. **The family boundary leaves PRD §6.2 material unowned** (something is neither a `CASE-FWC`
   decision/order nor an `FWC-DOCS`/`FWC-AWARDS`/`FWC-AGREEMENTS` artifact) → that is a **plan-level**
   gap. Record it in `docs/prd/08-sources-cases/README.md` **Q4**, raise it with module `07`, and
   escalate; PRD §44.4 forbids assuming another group covers it.
3. **No reliable delta mechanism** → set `change_detection.capability` honestly; `INGF-07` derives
   `FRESHNESS_LIMITED`; add a customer-visible gap entry (PRD §12.1: *"rather than a false
   guarantee"*) and record it in `docs/prd/08-sources-cases/README.md`.
4. **Licensing unclear or restrictive** → `METADATA_AND_LINK_ONLY` (PRD §11.1) →
   `METADATA_AND_LINK_ACTIVE` with a customer-visible gap. Never ingest full text "pending
   clarification"; never substitute an aggregator (**D13**).
5. **A required class or historical range is not published** → `SOURCE_UNAVAILABLE` or date-limited
   coverage exactly as PRD §40.4 directs, recorded in `docs/prd/08-sources-cases/README.md`.
6. **The portal cannot be reached from the build environment** (sub-PRD **Q8**) → **stop**; do not
   hand-author fixtures (**D12**). Escalate. An official site that genuinely cannot be reached is a
   real official-source constraint, so it is recorded as a limited state with its complete `INGF-07`
   `limitation` block — never as a reason to reduce this group's scope. The launch policy is confirmed
   (plan §8 **Q10**, sub-PRD **D15**): `GOLD-16` produces the measured evidence and the proposed
   registry state, `LNCH-05` verifies the launch statement discloses it accurately, and Gate 2 is
   verification and sign-off, not an opportunity to cut mandatory scope.
7. **An order's operative effect cannot be expressed with the `CRPS-01` effective-interval fields** →
   raise it against `SCAS-01` (a shared primitive) or `CRPS-01` (the record contract) with a docs PR;
   never encode operative effect in free-text metadata, because PRD §9.1 rank 4 and PRD §36.2's
   eligibility predicate both depend on it being structured.
8. **An enum value is missing from `FND-03`** → docs PR against `FND-03`, update
   `docs/prd/08-sources-cases/README.md` **Q1**, then emit.

**Escalation rule.** If this group cannot reach `ACTIVE` or one of PRD §7's four explicit limited
states — or if the `FWC-DOCS` split cannot be made disjoint — stop, record the state together with
its complete `INGF-07` `limitation` block (evidence, affected dates or collections, customer-visible
warning and reason) in `docs/prd/08-sources-cases/README.md`, and carry it through `GOLD-16` →
`LNCH-05`. The limited-state launch policy is confirmed (plan §8 **Q10**, sub-PRD **D15**): mandatory
scope is never cut, a limited state requires measured evidence of a genuine official-source
limitation, and Gate 2 is the Founder's verification and sign-off, not a scope decision. A boundary
that leaves FWC decisions unowned, or claims them twice, defeats PRD §44.4 in both directions; never soften the registry status to make composition pass.
