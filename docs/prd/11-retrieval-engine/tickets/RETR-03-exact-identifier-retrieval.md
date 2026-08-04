---
id: RETR-03
title: Exact-identifier retrieval
module: 11-retrieval-engine
lane: 11-retrieval-engine
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RETR-02]
blocks: [RETR-06]
---

# RETR-03 — Exact-identifier retrieval

Implements PRD §17.1, §36.1, §36.2, §8.2 — requirement ID `SRCH-004` (*"Exact provision/case/agreement/ABN
matches outrank semantic similarity"*), supporting `SRCH-001`; epic `E17-INDEX`.
No ADR — the decision is already made in PRD §36.1 (*"Rules/checksums parse dates, neutral citations,
provision references, award codes, agreement IDs and ABNs before any model classifier"*); this is
build ticket 3 of 10 against it.
Parent sub-PRD: [11-retrieval-engine README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RETR-02 — Tantivy lexical/field/citation index](RETR-02-tantivy-lexical-field-citation-index.md) (mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(the §36.1 classification schema and the identifier fields `RETR-02` indexes) — not a new subsystem
decision.

## Background + basis

**Deterministic identifiers outrank everything, and a model may not remove one.** PRD §36.1 defines
the query classification contract as a schema, never prose, and states the rule verbatim:
*"Rules/checksums parse dates, neutral citations, provision references, award codes, agreement IDs and
ABNs before any model classifier. The model may add a candidate interpretation but may not discard a
deterministic identifier."* The contract's shape is fixed:

```json
{
  "query_types": ["NATURAL_LANGUAGE", "PROVISION_REFERENCE"],
  "exact_identifiers": [{"type": "PROVISION", "value": "s 94"}],
  "requested_legal_as_at": "2026-08-03",
  "jurisdictions": ["CTH"],
  "document_types": [],
  "employer_names": [],
  "abns": [],
  "topics": ["annual_leave"],
  "requires_clarification": false
}
```

**Exact hits are retained, not merely boosted.** PRD §36.2's configuration table gives "Exact
identifier results" an initial default of **20** and a hard ceiling of **50**, with the note
*"Always retained if applicable"* — the strongest retention language in the table. PRD §36.3 makes
*"exact identifier and pinpoint match"* ranking feature **1**, above hard applicability pass and
authority level. PRD §17.1 puts exact/citation retrieval **before** full-corpus lexical retrieval.
Requirement `SRCH-004`'s minimum evidence is an *"exact-match regression set"*, built in `RETR-10`.

**"Retained if applicable" is not "retained".** The retention rule is bounded by the §36.2 hard
filters: an exact match to a repealed version, a wrong jurisdiction, a licence-prohibited document or
a version outside the pinned release is **not** applicable and must not be retained. `RETR-04` owns
that predicate; this ticket must not implement a second, weaker version of it, and must not treat
"exact" as a bypass.

**An invalid identifier is an input error, not a zero-result search.** `UAT-SRCH-04`: *"Use invalid
ABN in advanced employer filter → Inline checksum error; no search/quota event."* The checksum
validators therefore have to be callable **before** a search is executed, so the API layer
(`FIND-01`/`FIND-04`) can reject without consuming quota. This ticket owns the validators; the inline
UI behaviour is `14-search-product`'s.

**What the fixture provides.** `CRPS-08` deliverable 1 commits, in the synthetic bundle, *"Exact
identifiers: a provision reference, a neutral citation, an award-like identifier, a synthetic ABN"*,
where the ABN is *"a checksum-valid ABN from a documented synthetic range"*. Those four are the
executable targets of this ticket's tests; no real-world identifier is needed or permitted.

**Carried caveat (accepted for the MVP, documented not enforced):** the identifier grammars below are
the **initial** rule set for Australian employment-law material. PRD §45.5 classifies a parsing rule
that changes customer-visible behaviour as a product change; adding a new identifier *type* is a
ticket change, while adding a spelling variant of an existing type inside the same grammar is an
implementation detail covered by this ticket's fixtures.

## Goal

Produce `services/search-rs/src/exact/**`: deterministic, checksum-backed parsers for the five PRD
§36.1 identifier classes (provision references, neutral citations and case numbers, award codes,
agreement identifiers, ABNs) plus legal-date extraction; a normaliser that maps each parsed identifier
to the corpus fields `RETR-02` indexes; and an exact-retrieval stage that returns up to
`profile.exact_results` candidates carrying `MatchReason::ExactProvision` / `ExactCitation` /
`ExactIdentifier` and a retention marker that `RETR-06` must honour for applicable candidates.
Completion is mechanically checkable: `cargo test --workspace` is green, a committed table of positive
and negative parse cases replays exactly, an invalid-checksum ABN is rejected before any index access,
and each of the fixture's four exact identifiers retrieves its target node.

## Non-goals

- **No PRD §36.2 filter implementation** — `RETR-04` (`src/filters/**`), a sibling in the same wave.
  This ticket produces candidates and marks them retention-eligible; applicability is decided there,
  and an exact match that fails the predicate is dropped, not retained.
- **No fusion, no final ordering, no "exact wins" arbitration across stages** — `RETR-06`
  (`src/ranking/**`), which is `blocked_by` this ticket. This ticket states the retention contract;
  `RETR-06` enforces it against the other stages.
- **No model-based classification of any kind.** PRD §36.1 allows a model to *add* a candidate
  interpretation; that model lives outside this stage (`RETR-07` local classification, and the answer
  workflow in `15-answer-product`). Nothing in `src/exact/**` calls a model.
- **No index schema change** — `RETR-02` owns `src/lexical/**` including the identifier fields. If a
  new field is needed, that is a writeback and a `blocked_by` edge, not a local addition.
- **No UI validation, no quota decision, no inline error rendering** — `14-search-product`
  (`FIND-01`, `FIND-04`) for `UAT-SRCH-04`. This ticket exposes the validators they call.
- **No employer/ABN coverage workflow** — `15-answer-product` (`ASK-08`, `COV-003`). This ticket
  validates and matches an ABN; it does not resolve an employer to an agreement chain.
- **No wire-contract change** — `RETR-01` owns `src/service/contract/**` (sub-PRD D8).

## File-scope (write-owns)

- `services/search-rs/src/exact/**` — identifier grammars, checksum validators, normalisers, the
  exact-retrieval stage and the committed parse-case tables.
- `services/search-rs/tests/exact_*.rs` — this ticket's Rust integration tests (sub-PRD D12).
- Module-shared, append-only (sub-PRD D12, breakdown plan §1.1): `services/search-rs/Cargo.toml`
  (own dependencies only; regenerate `Cargo.lock` as a build artifact, never hand-merge) and
  `services/search-rs/src/lib.rs` (append exactly `pub mod exact;`).

Does not touch:

- `services/search-rs/src/{main.rs,service}/**` — `RETR-01`; `src/lexical/**` — `RETR-02` (both merged
  before this starts); `src/filters/**` — `RETR-04` (concurrent sibling); `src/dense/**` — `RETR-05`;
  `src/ranking/**` — `RETR-06`; `src/localmodel/**` — `RETR-07`; `src/evidence/**` — `RETR-08`;
  `benches/**`, `src/bench/**` — `RETR-10`. `packages/retrieval-client/**` — `RETR-09`.
- `pipelines/**`, `schemas/**` — `04-corpus-contract` and `00-foundation` (PRD §44.3 serial-owned
  corpus schema, release manifest, canonical enums and OpenAPI root; sole owners).
- `packages/**`, `apps/**`, `infra/**`, `tests/**`, `evals/**` — other modules per breakdown plan §4.
  `docs/PRD.md` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header). `src/exact/**` is written by no other ticket in the plan. The concurrent wave-3
sibling is `RETR-04` (`src/filters/**`) — a disjoint directory and a disjoint test-file prefix; the
two meet only at `RETR-06`, which is `blocked_by` both. `RETR-02`, whose index fields this ticket
queries, is the declared blocker and is merged first. Only the two append-only shared files
(`Cargo.toml`, `src/lib.rs`) are touched by more than one ticket, with additive lines only.

## Deliverables

1. **`src/exact/grammar/provision.rs`** — provision-reference parsing, returning a structured
   `ProvisionRef { kind, number, subdivisions: Vec<String>, raw }` rather than a string. Recognised
   forms, each with a committed positive and negative case:
   `s 94`, `s94`, `section 94`, `s 94(5)`, `s 94(5)(a)`, `ss 90-92`, `subsection 23(2)`,
   `cl 12.3`, `clause 12.3`, `Sch 2`, `Schedule 2`, `Pt 2-2`, `Part 2-2`, `Div 3`, `Division 3`,
   `reg 3.01`, `regulation 3.01`, `para [45]`, `paragraph 45`. Ranges expand to their endpoints plus
   the enclosing range marker; a range wider than a configured bound is rejected rather than expanded.
   Basis: PRD §8.2 *"section, clause, schedule and paragraph references"*; §36.1 `PROVISION`.
2. **`src/exact/grammar/citation.rs`** — neutral citations and case numbers:
   `[2024] FWCFB 123`, `[2024] HCA 1`, `[2024] FCAFC 45`, `[2024] FCA 1234`, `[2024] NSWIRComm 7`,
   and the tolerant variants `(2024) FWCFB 123` / `2024 FWCFB 123` normalised to the bracketed
   canonical form. Returns `CitationRef { year, court_code, number, raw }`. A court code unknown to the
   corpus is parsed but reported as `UNKNOWN_COURT_CODE` in `warnings` rather than silently dropped.
   Basis: PRD §8.2, §9.2 (*"neutral citation MUST be displayed"*), §36.1 `CASE_CITATION`.
3. **`src/exact/grammar/instrument.rs`** — award codes (`MA` + 6 digits, e.g. `MA000010`), enterprise
   agreement identifiers (`AE` + digits), and instrument identifiers matched case-insensitively with
   internal whitespace and punctuation removed before comparison. Basis: PRD §8.2 *"award/agreement
   identifiers and titles"*; §36.1 `AWARD_CODE` / `AGREEMENT_ID`.
4. **`src/exact/checksum/abn.rs::validate_abn(input: &str) -> Result<Abn, AbnError>`** — the ATO
   modulus-89 algorithm, stated here so it is not re-derived: strip whitespace; require exactly 11
   digits; subtract 1 from the **first** digit; multiply the digits by the positional weights
   `[10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]`; the sum is valid **iff** `sum % 89 == 0`. Errors are
   typed (`WrongLength`, `NonDigit`, `ChecksumFailed`) so the caller can render an inline message.
   **The validator must be callable without touching an index**, so `FIND-04` can satisfy
   `UAT-SRCH-04` (*"Inline checksum error; no search/quota event"*) before a search is admitted.
5. **`src/exact/grammar/legal_date.rs`** — `requested_legal_as_at` parsing from explicit
   `YYYY-MM-DD` and the unambiguous Australian forms (`3 August 2026`, `03/08/2026` read as
   day-first), returning `None` rather than guessing on an ambiguous value. Basis: PRD §36.1
   (*"Rules/checksums parse dates"*), PRD §34.1/§35.1 (legal dates are `YYYY-MM-DD` strings), PRD
   §15.2 (*"A query MUST carry `legal_as_at`"*). An ambiguous date is a clarification input for
   `15-answer-product`, never a silent default.
6. **`src/exact/classify.rs::classify(query: &str) -> QueryClassification`** — assembles the PRD §36.1
   schema from the deterministic parsers only, populating `query_types`, `exact_identifiers`,
   `requested_legal_as_at`, `abns` and leaving model-supplied members empty. Two invariants, both
   tested:
   - `merge_model_interpretation(det, model)` **may add** query types, topics and jurisdictions but
     **cannot remove or alter** any element of `det.exact_identifiers` or `det.abns` — the merge
     function is the only place a model interpretation can enter, and removal is not expressible
     (PRD §36.1);
   - classification is pure and deterministic: no clock, no locale, no randomness (the same query
     always yields the same schema).
7. **`src/exact/resolve.rs`** — maps each parsed identifier to the corpus fields `RETR-02` indexes:
   `ProvisionRef` → `display_label` / `heading` / node path within a document version;
   `CitationRef` → `neutral_citation`; award/agreement → `official_identifier` / `award_code` /
   `agreement_id`; `Abn` → `employer_abn`. Matching is exact after the documented normalisation
   (case-fold, strip internal punctuation and spaces) — never fuzzy, never stemmed.
8. **`src/exact/stage.rs::retrieve_exact(reader, classification, request, profile) ->
   Vec<Candidate>`** — the stage:
   1. runs **before** lexical retrieval (PRD §17.1 order), against the same pinned release;
   2. returns at most `profile.exact_results` (v1 default **20**, hard ceiling **50**, PRD §36.2)
      candidates, ordered by identifier specificity (pinpoint provision > document-level identifier >
      employer ABN), then by rank within each class;
   3. marks each candidate `retention: RetentionClass::ExactIdentifier` — the marker PRD §36.2's
      *"Always retained if applicable"* and PRD §36.3's feature 1 require `RETR-06` to honour;
   4. carries `MatchReason::ExactProvision | ExactCitation | ExactIdentifier | ExactAbn` so the API's
      `match_reasons` array (PRD §34.2) is code-supplied, not inferred;
   5. **applies no applicability logic of its own** — `RETR-04`'s predicate decides, and a candidate
      that fails it is dropped even though it is an exact match (the "if applicable" half of the rule).
9. **Committed case tables** — `src/exact/cases/{provisions,citations,instruments,abns,dates}.json`,
   each row `{input, expect: Parsed | Rejected, why}`, including deliberate negatives: `s 94(5` (unbalanced),
   `[24] FWCFB 123` (two-digit year), `MA00010` (short award code), an ABN failing the checksum by one
   digit, and `01/02/2026` recorded as day-first with the ambiguity noted. These tables are the
   specification for deliverables 1–5; a parser change that is not reflected here is incomplete.
10. **`src/exact/README.md`** — one page: the five identifier classes, the exact ABN algorithm, the
    normalisation rules, the retention contract owed to `RETR-06`, and the explicit statement that
    "exact" never bypasses the §36.2 filters.

## Acceptance checklist (classified)

- [ ] `[fixture]` All five committed case tables replay exactly: every positive parses to the recorded
      structure and every negative is rejected with the recorded error. (Deliverable 9; PRD §36.1)
- [ ] `[fixture]` Each of the `CRPS-08` fixture's four exact identifiers — provision reference, neutral
      citation, award-like identifier, synthetic ABN — retrieves its target node from the fixture-built
      index at rank 1 within the exact stage. (`CRPS-08` deliverable 1; `SRCH-004`)
- [ ] `[machine]` ABN checksum: the fixture's synthetic ABN validates; the same ABN with any single
      digit changed fails with `ChecksumFailed`; a 10- or 12-digit input fails with `WrongLength`; and
      `validate_abn` touches no index and performs no I/O — asserted by calling it with no reader
      constructed. (`UAT-SRCH-04`; PRD §8.2)
- [ ] `[machine]` Model cannot discard a deterministic identifier:
      `merge_model_interpretation` with a model result that omits or rewrites every identifier still
      yields the deterministic `exact_identifiers` and `abns` unchanged; removal is not expressible in
      the API. (PRD §36.1 *"may not discard a deterministic identifier"*)
- [ ] `[machine]` Determinism and purity: the same query classified twice in separate processes yields
      byte-identical JSON; the classifier reads no clock and no locale. (PRD §36.1)
- [ ] `[machine]` Bounds: the stage never returns more than `profile.exact_results`, and a profile
      exceeding the PRD §36.2 hard ceiling of 50 is rejected at load. (PRD §36.2)
- [ ] `[machine]` Retention marker present: every exact candidate carries
      `RetentionClass::ExactIdentifier` and a code-supplied `match_reasons` value; a test asserts the
      marker survives serialisation into `RETR-01`'s frozen candidate shape. (PRD §36.2, §36.3, §34.2)
- [ ] `[machine]` **"If applicable" is not "always"**: an exact-identifier hit on a fixture document
      that is `REPEALED` at the requested date, or licence-`PROHIBITED`, or outside the pinned release,
      is **not** returned as a retained candidate — asserted through the pipeline once `RETR-04` is
      present, and asserted at the stage boundary here by proving the stage applies no override and
      exposes no bypass flag. (PRD §36.2; sub-PRD D4)
- [ ] `[machine]` Ranges are bounded: `ss 1-9999` is rejected rather than expanded, and a rejected
      range produces a named warning rather than a silent empty result. (Deliverable 1)
- [ ] `[machine]` Citation normalisation: `(2024) FWCFB 123` and `2024 FWCFB 123` both normalise to
      `[2024] FWCFB 123` and retrieve the same node; an unknown court code is reported in `warnings`,
      not dropped. (PRD §8.2, §9.2)
- [ ] `[fixture]` **PRD §13.2 budget contribution**: exact stage p95 ≤ **50 ms** over 200 classified
      queries against the fixture index, recorded with method and machine in the PR — the stage's share
      of the §13.2 search p95 ≤ 2 s composite that `RETR-10` measures end to end. Memory: the stage
      allocates no index of its own and adds no measurable resident footprint beyond `RETR-02`'s reader
      (asserted by an RSS delta bound of **8 MiB** across 200 queries). (PRD §13.2, §39.2)
- [ ] `[machine]` `cargo test --workspace` green (Rust; PRD §45.3).
- [ ] `[machine]` `pnpm test` green (standing item, breakdown plan §1.1).
- [ ] `[machine]` PR states requirement IDs `SRCH-004`, `SRCH-001` and UAT id `UAT-SRCH-04`;
      schema/API impact (`match_reasons` values added to the frozen contract's enum, if any — a
      contract change is a docs PR against `RETR-01`); latency impact (measured stage p95); rollback
      path; known gaps including the initial-rule caveat on identifier grammars. (PRD §45.4)
- [ ] No `[human]` criteria — parsing and retrieval are pure logic verified by committed tables. The
      human-visible payoff (`UAT-SRCH-04`) is exercised by `14-search-product` at Gate 2.
- [ ] `uv run pytest` not applicable — this ticket touches no Python.

## Test plan

All steps run offline against the committed `CRPS-08` fixture bundle and an index built by `RETR-02`'s
builder into `tmp_path`; no network.

1. `cargo test -p search-rs exact` then `cargo test --workspace`. Integration tests live in
   `services/search-rs/tests/exact_*.rs`. Construction pattern to copy: `RETR-02`'s
   `tests/lexical_query.rs` — build the index into `tempdir` from the fixture corpus, then assert
   expected `node_version_id` sets taken from the `CRPS-08` fixture inventory.
2. Case tables: `tests/exact_grammar.rs` is a data-driven test over the five committed JSON tables; a
   parser change that is not reflected in a table fails here first.
3. ABN: `tests/exact_abn.rs` — the fixture ABN, ±1 in each digit position (11 negatives), wrong
   lengths, non-digits, and a no-I/O assertion (the test constructs no reader and no bundle).
4. Merge invariant: property test over 10,000 randomly generated deterministic/model pairs asserting
   `merge_model_interpretation` never shrinks or alters `exact_identifiers` or `abns`.
5. Retrieval: `tests/exact_stage.rs` runs each of the fixture's four identifiers end to end through
   classification → resolve → stage, asserting the expected node and the retention marker; plus the
   negative cases (repealed / licence-prohibited / wrong release) proving no bypass exists.
6. Budget: `tests/exact_budget.rs` measures stage p95 over 200 queries and the RSS delta, printing both
   for the PR.
7. Suite green: `cargo test --workspace` and `pnpm test` from the repository root.
8. Reviewer focus: confirm the ABN algorithm matches the stated weights and modulus and is not a
   length-only check; confirm no code path lets an exact match skip the §36.2 filters; confirm
   `merge_model_interpretation` cannot remove an identifier even through a "replace all" call shape;
   confirm date parsing refuses ambiguity instead of defaulting; confirm the case tables contain real
   negatives, not only positives.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/11-retrieval-engine/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A real Australian identifier form is not covered by the grammars* → add the form and its cases to
     deliverable 9 within this ticket if it is a spelling variant of an existing class; if it is a new
     identifier **class**, that changes `query_types` and `match_reasons` in `RETR-01`'s frozen
     contract, so it is a docs PR against **this ticket and `RETR-01`** (and `RETR-09` if the wire enum
     changes) before code.
   - *An identifier cannot be matched because the index lacks the field* → do not add a field to
     `src/lexical/**` (that is `RETR-02`'s scope) and do not add a corpus column (that is `CRPS-01`'s
     PRD §44.3 serial-owned scope). Record the need in `docs/prd/11-retrieval-engine/README.md`, raise
     the ticket change against the owner, and take the `blocked_by` edge in
     `docs/prd/breakdown-plan.md` §5.12 and §6.2.
   - *Exact retention appears to conflict with a hard filter* (an exact match that "should obviously"
     be shown but is filtered) → the filter wins. PRD §36.2's phrase is *"Always retained **if
     applicable**"* and PRD §17.1 says dense and rank signals *"MUST NOT override applicability"*.
     Record the case in `docs/prd/11-retrieval-engine/README.md` as evidence for `RETR-04`/`RETR-06`
     and, if the product genuinely needs to surface an inapplicable exact match as a labelled
     out-of-scope hint, that is a **product change** requiring founder approval and a PRD update
     (PRD §45.5) — never a local exception.
   - *The ATO checksum rejects an ABN the corpus contains* → that is a corpus data defect, not a
     validator defect: file it against the owning adapter module and record it in
     `docs/prd/11-retrieval-engine/README.md`. Never weaken the checksum to accommodate data.
   - *Ambiguous date handling forces a default* → do not choose one. `requires_clarification` exists in
     the PRD §36.1 schema for exactly this; the clarification workflow is `ASK-03`'s. Record any
     pressure to default in `docs/prd/11-retrieval-engine/README.md`.
3. **Falsified protocol.** If deterministic parsing before the model turns out to be impossible for a
   material identifier class — for instance because official identifiers are genuinely ambiguous
   without context — then PRD §36.1's central rule (*"before any model classifier … may not discard a
   deterministic identifier"*) is falsified for that class. Stop, escalate for re-review, and write
   back to `docs/prd/breakdown-plan.md` §8 plus this sub-PRD before letting a model decide an
   identifier. Never make identifier interpretation a model decision inside this ticket.
