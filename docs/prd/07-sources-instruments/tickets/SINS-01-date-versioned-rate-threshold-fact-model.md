---
id: SINS-01
title: Date-versioned rate/threshold fact model
module: 07-sources-instruments
lane: 07-sources-instruments
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [SLEG-01]
blocks: [SINS-03, SINS-06, SINS-07, SINS-08, SINS-09, SINS-10, SINS-11, SINS-12, SINS-13, SINS-14]
---

# SINS-01 — Date-versioned rate/threshold fact model

Implements PRD §40.3 (rates are date-versioned legal facts), PRD §15.2 (temporal model) and PRD §35.2
(corpus identity and versions) — supporting `SRCH-003`, `SRCH-005` and the PRD §44.2 `E13` exit
evidence. **No ADR — the decision is already made in PRD §40.3; this is build ticket 1 of 14 against
it.** (Deliverable 4's representation choice is flagged as an ADR candidate in the sub-PRD, D2.)
Parent sub-PRD: [07-sources-instruments README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `SLEG-01` — Legislation adapter primitives (point-in-time, events, title allowlist),
module `06-sources-legislation` (`docs/prd/06-sources-legislation/tickets/`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a contract PRD
§40.3 and `CRPS-01` already fix — not a new subsystem decision.

## Background + basis

**PRD §40.3 states the rule this ticket exists to make mechanical.** The sentence that closes the
wave-2 roster table:

> "Rates are date-versioned legal facts, not mutable fields. A displayed rate must cite its official
> date-specific source and applicable legislation/guidance role."

Two obligations follow: a rate has an **effective interval** (so `legal_as_at` can select the right
one), and it has a **pinpoint citation** into official text plus a statement of the authority role of
the document it came from.

**PRD §15.2 fixes the temporal vocabulary** the interval lives in:

> "The system MUST distinguish: publication time; effective time; retrieval time; system
> knowledge/recorded time. Legal status MUST be derived from evidenced LegalEvents. Cached status
> fields MAY improve performance but are not the authoritative history."

A rate is exactly that shape: an *effective* interval derived from an *evidenced* event, never a
cached field.

**PRD §6.6 fixes the horizon:**

> "At MVP launch, point-in-time retrieval MUST support: 2026–27; 2025–26; 2024–25."

Those three financial years are also the "at least three time points" of PRD §40.8 item 6 for every
rate-bearing group (sub-PRD D8), and their eight-jurisdiction product is the PRD §44.2 `E13` exit
evidence: *"Eight-jurisdiction historical fixture matrix"*.

**PRD §35.2 fixes what the corpus can store.** `document_version` carries `effective_from`,
`effective_to`, `legal_status` and `content_hash` with "non-overlap validation where versions
represent consolidated effect"; `node_version` carries `canonical_text`, `ordinal`, `effective_from`,
`effective_to`, `text_hash`; `legal_event` carries `event_type`, `event_date`, `effective_date`,
`evidence_node_version_id`, `metadata_json` with "legal status derived from events"; `node_relation`
carries `evidence_node_version_id`, `evidence_start`, `evidence_end`, `derivation`, `parser_version`,
`confidence_state` with "`MODEL_SUGGESTED` cannot support definitive status".

**PRD §40.7 forbids inventing a storage path.** "The adapter never writes active corpus tables
directly. It emits versioned intermediate records with source URL, artifact hash and tool version."
The record types are `CRPS-01`'s nine (module `04-corpus-contract`,
`pipelines/corpus-builder/schema/intermediate/v1/`): `remote_descriptor`, `source_artifact`,
`document_identity`, `document_version`, `document_node`, `node_version`, `legal_event`,
`node_relation`, `validation_finding`. **There is no rate record type and this ticket does not add
one** — plan §2.1 **A4** makes the corpus builder depend on that contract, not on adapter code, and
`CRPS-01` deliverable 16 makes any change to it a versioned writeback binding five source modules.
Sub-PRD **D2** therefore fixes the mapping into the existing types; it is an ADR candidate because
nine adapters and every downstream citation depend on it.

**PRD §9.3 licenses the extraction, with conditions:**

> "Official structured assertions may support conclusions. Deterministic extraction may support
> conclusions when exact source evidence and parser version are retained. LLM-discovered
> relationships are `MODEL_SUGGESTED` and MUST NOT change legal status or support a definitive
> treatment conclusion."

That is why every fact in this model carries `NodeRef` + character offsets + `parser_version` +
`extractor_version`, and why a fact whose declared value cannot be re-parsed from its own quoted span
is rejected at construction (sub-PRD **D3**). A number that is not in the source text cannot become a
citation.

**PRD §15.3 fixes the offset semantics:** "Citations MUST target DocumentVersion + NodeVersion +
exact offsets + source snapshot, never a SearchChunk." `CRPS-01` deliverable 12 makes every offset a
**character** offset into the NFC-normalised `canonical_text`, half-open `[start, end)`.

**Why this ticket is first in its module.** Plan §5.8 makes nine adapters `blocked_by` it —
`SINS-03` (award pay data), `SINS-06` (PAYG/STP/super/FBT) and the eight payroll-tax groups. Plan §9
**R2** is the standing warning: *"The shared primitive stays owned by `SLEG-01`/`SINS-01`/`SCAS-01`/
`SFUT-01`; a new sibling ticket is added there and the adapters are `blocked_by` it. Never copy the
helper into two adapter directories."* Nine concurrent adapter tickets rewriting a rate model is the
worst contention this module could produce.

**Carried caveats, documented not re-litigated:**

- **The adapters import no HTTP and no document-parsing library** (PRD §37.4; `05` sub-PRD D10;
  `INGF-01` deliverable 11 enforces it with an AST scan). Extraction in this package therefore
  operates on `ParsedDocument.text` and `ParsedDocument.blocks` returned by `INGF-06`'s `ParserHost`,
  using the standard library only.
- **Packaging (sub-PRD N2).** `SLEG-01` — this ticket's blocker — has already created
  `pipelines/adapters/_shared/legislation/**`. Read that tree and follow its packaging convention
  exactly; record what you found in the sub-PRD's D4 row. Do **not** create or edit
  `pipelines/adapters/_shared/__init__.py`: sub-PRD **D4** keeps `_shared/` a PEP 420 namespace
  directory precisely so four modules share zero files.
- **Enum values (sub-PRD N1).** `node_kind`, `event_type` and `relation_type` values come from
  `packages/contracts` via `FND-03`, and `CRPS-01` deliverable 4 generates SQLite `CHECK`
  constraints from them — an invented literal is rejected by the database, not silently accepted.
  Resolve the values against the committed enums; a genuinely missing value is a writeback, not a
  local literal.
- **Anomaly thresholds are not this ticket's (plan §8 **Q9**, baseline-selected).** PRD §40.9's ±10%
  count change and >2% parse failure are the framework's **initial defaults**, refined per source
  against a measured baseline and **tightened only**; `GOLD-16` consolidates them. This ticket ships
  series invariants, not thresholds, and the series rules in deliverable 5 are unconditional — they
  are not percentage rules and no baseline can relax them.

## Goal

Create the shared date-versioned rate/threshold fact model under
`pipelines/adapters/_shared/rates/**`: an immutable `RateFact` value type whose construction is
impossible without an exact quoted source span that re-parses to the declared value, a `RateSeries`
with `as_at(date)` lookup and no-overlap/coverage invariants, a financial-year model for the three
PRD §6.6 years, one deterministic extraction helper over `ParsedDocument`, one emission mapping into
the `CRPS-01` intermediate records (sub-PRD D2), and an `E13` matrix harness plus CLI — such that
`uv run pytest` proves a rate can never be a mutable field, never be hardcoded, and never be emitted
without a pinpoint citation, and the nine rate-bearing adapters implement PRD §40.3 identically
without reading each other's code.

## Non-goals

- **No source group and no network call.** All thirteen PRD §40.3 groups are `SINS-02`…`SINS-14`.
  This package has no `adapter.py`, is skipped by `INGF-01`'s `iter_adapter_dirs()` (the `_` prefix),
  and never appears in `MANDATORY_SOURCE_GROUPS`.
- **No new intermediate-record type and no change to `CRPS-01`.** Owned by `04-corpus-contract`
  (plan §2.1 A4). This ticket *maps into* the existing nine types.
- **No canonical enum values.** `FND-03` (`00-foundation`) owns `packages/contracts/src/enums/**`.
  Resolve against them; a missing value is sub-PRD **N1**'s writeback.
- **No point-in-time, commencement or repeal machinery.** `SLEG-01` owns
  `_shared/legislation/**`; this ticket reuses it rather than re-deriving version selection.
- **No corpus write, no `corpus.sqlite` access.** PRD §18.3 makes it release-specific and production
  read-only; the working store is `INGF-05`'s `ingestion.sqlite`.
- **No answer-time rate presentation, rounding or arithmetic.** Displaying, quoting and comparing a
  rate belongs to `12-evidence-safety` (`EVID-04`–`EVID-06`) and `15-answer-product`; the PRD §36.2
  eligibility predicate is `FND-10`. This package produces evidence, not answers.
- **No tax calculation of any kind.** The product is research, not a payroll engine (PRD §3.3, §11.2
  "not legal representation"). Nothing here computes a liability.
- **No per-source anomaly thresholds.** The initial defaults are `INGF-05`'s; per-group **tightening**
  against a measured baseline lives in each group's `conformance.yaml` (schema `INGF-09`), and
  `GOLD-16` consolidates. Plan §8 **Q9** (baseline-selected).
- **No registry status, `limitation` block or launch-scope call.** Group status and its evidence are
  each adapter ticket's, recorded through `INGF-07`'s schema under the confirmed plan §8 **Q10**
  policy (sub-PRD **D11**); this package owns no group directory and no `registry.yaml`.
- **No evaluation cases or gold data.** `21-evaluation-600`. This package must never read
  `evals/gold/**` (PRD §45.1 item 6, plan §9 R9).

## File-scope (write-owns)

- `pipelines/adapters/_shared/rates/**` — the entire package, including `schema/` (any committed JSON
  Schema), `tests/` (this package's unit tests) and `README.md` (the authoring guide the nine
  rate-bearing adapter Builders read instead of another adapter's code).
- Does not touch: `pipelines/adapters/_shared/__init__.py` — deliberately absent (sub-PRD **D4**,
  PEP 420 namespace directory). If `SLEG-01` created one, leave it alone and record the fact.
- Does not touch: `pipelines/adapters/_shared/{legislation,caselaw,future}/**` — `SLEG-01`
  (module `06`), `SCAS-01` (module `08`), `SFUT-01` (module `10`).
- Does not touch: `pipelines/adapters/{fwc-docs,fwc-awards,fwc-agreements,fwo-guidance,ato-employment}/**`
  and `pipelines/adapters/pt-*/**` — `SINS-02`…`SINS-14`. Fixtures for this ticket are synthetic and
  live under `pipelines/adapters/_shared/rates/tests/fixtures/`.
- Does not touch: `pipelines/adapters/leg-*/**`, `case-*/**`, `adj-*/**`, `future-*/**` — modules
  `06`, `08`, `09`, `10`.
- Does not touch: `pipelines/ingestion/**` — `05-ingestion-framework`.
- Does not touch: `pipelines/corpus-builder/**`, `schemas/corpus-manifest/**` — `04-corpus-contract`.
- Does not touch: `packages/**`, `apps/**`, `services/**`, `tests/**`, `evals/**`, `infra/**`,
  `.github/workflows/**`.
- `pipelines/adapters/pyproject.toml` (if `FND-01` created one) — **append-only**, shared-additive
  across modules `06`–`10`; append only what this ticket declares and resolve conflicts by re-running
  `uv lock`, never by hand-merge (plan §1.1, PRD §44.3). D9 means this should be untouched: the model
  needs the standard library and the framework only.

**Serial safety.** This is the **first decomposition** of `docs/PRD.md`; **nothing is merged and no
ticket is in flight**, so no prior ticket has touched these paths. `SLEG-01` (module `06`) has landed
and owns the sibling directory `_shared/legislation/**` — a different directory, and D4 removes the
only file the two could have shared. The tickets that may run concurrently with this one are
`SINS-02` and `SINS-05` (both `blocked_by INGF-09` only), which own `fwc-docs/**` and
`fwo-guidance/**` — disjoint from `_shared/rates/**` and from each other. No sibling in this module
writes into `_shared/rates/**`: the nine tickets that use it are all `blocked_by` this one and read
it as a dependency.

## Deliverables

Public names below are **binding**: nine adapter tickets are written against them without reading
this package's source. Internal organisation is the Builder's choice; the public surface is not.

1. **Package skeleton.** `pipelines/adapters/_shared/rates/__init__.py` exporting
   `RATES_MODEL_VERSION: str = "1"` and re-exporting the public surface of deliverables 2–9.
   Import path follows `SLEG-01`'s precedent (sub-PRD N2); record it in this package's `README.md`.

2. **`financial_year` — the PRD §6.6 model.**
   - `SUPPORTED_FINANCIAL_YEARS: tuple[str, ...] = ("2024-25", "2025-26", "2026-27")` with a
     docstring quoting PRD §6.6 and stating that this is the **launch minimum, not a rule that older
     material may be dropped** ("Case law and still-operative instruments MUST NOT be excluded solely
     because they are older than three financial years").
   - `financial_year_of(date: str) -> str` — Australian FY, 1 July to 30 June inclusive;
     `financial_year_bounds(fy: str) -> tuple[str, str]` returning `("YYYY-07-01", "YYYY-06-30")`;
     `is_supported_financial_year(fy) -> bool`. All dates are `YYYY-MM-DD` text (PRD §35.1).
   - `FinancialYearError` for a malformed label; the label form is exactly `YYYY-YY`.

3. **`values` — the value model.** Frozen dataclasses; all numbers `decimal.Decimal`, never `float`
   (a percentage stored as binary floating point is a citation that does not reproduce):
   - `Unit = Literal["PERCENT", "AUD", "AUD_PER_ANNUM", "AUD_PER_WEEK", "RATIO", "COUNT"]`.
   - `RateKind = Literal["RATE", "THRESHOLD", "LEVY", "SURCHARGE", "CAP", "MULTIPLIER", "AMOUNT"]`.
   - `Bracket(lower: Decimal | None, upper: Decimal | None, value: Decimal, lower_inclusive: bool,
     upper_inclusive: bool)`.
   - `Dimension(name: str, value: str)` — e.g. `("region", "REGIONAL")`, `("employer_type",
     "GROUP")`. Names and values are adapter-declared uppercase tokens.
   - `RateValue(shape: Literal["SCALAR", "BRACKETED", "DIMENSIONED"], unit: Unit,
     value: Decimal | None, brackets: tuple[Bracket, ...], dimensions: tuple[Dimension, ...])`
     with validators: `SCALAR` requires `value` and empty `brackets`; `BRACKETED` requires ≥2
     brackets, contiguous and non-overlapping in bound order, at most one open lower and one open
     upper bound; `DIMENSIONED` requires ≥1 dimension. Violations raise `RateValueError`.
   - `parse_value(text: str, unit: Unit) -> Decimal` — the **single** permitted way to turn source
     text into a number: tolerant of `%`, `$`, thousands separators and surrounding words; raises
     `RateParseError` when the span contains no unambiguous number for that unit. Deliverable 4
     depends on it.

4. **`RateFact` — the load-bearing type (sub-PRD D3).** Frozen dataclass:

   ```text
   RateFact(
     fact_key: str,            # stable lowercase dotted key, e.g. "payroll-tax.rate.general"
     jurisdiction: str,        # CTH | NSW | VIC | QLD | WA | SA | TAS | ACT | NT
     kind: RateKind,
     value: RateValue,
     applies_from: str,        # YYYY-MM-DD, inclusive
     applies_to: str | None,   # YYYY-MM-DD inclusive, or None = open-ended
     financial_year: str | None,
     evidence: RateEvidence,
     source_role: SourceRole,
     legislation_ref: NodeRef | None,
   )

   RateEvidence(
     node_ref: NodeRef,        # CRPS-01 natural key {stable_source_key, version_label, stable_node_key}
     start_offset: int, end_offset: int,   # half-open, character offsets into canonical_text
     quoted_text: str,         # EXACTLY canonical_text[start_offset:end_offset]
     artifact_sha256: str,
     parser_version: str,
     extractor_version: str,
   )

   SourceRole = Literal["LEGISLATION", "LEGISLATIVE_INSTRUMENT", "OPERATIVE_INSTRUMENT",
                        "OFFICIAL_GUIDANCE", "RULING", "EXPLANATORY"]
   ```

   `__post_init__` raises, with a distinct failure code each:
   - `RateEvidenceError` if `quoted_text` is empty, if `end_offset <= start_offset`, or if
     `len(quoted_text) != end_offset - start_offset`;
   - **`RateValueNotInSourceError` if the declared value cannot be re-derived from `quoted_text`** —
     for `SCALAR`, `parse_value(quoted_text, unit)` must equal `value`; for `BRACKETED`/`DIMENSIONED`,
     every bracket value and every bound must appear in `quoted_text` under `parse_value`. **This is
     the mechanical form of sub-PRD D3: a number the Builder "knows" but the fixture does not contain
     cannot be constructed.**
   - `RateIntervalError` if `applies_to < applies_from`, if either date is not `YYYY-MM-DD`, or if
     `financial_year` is set and `applies_from` falls outside its bounds;
   - `RateRoleError` if `source_role` is outside the six-value set.

   There is **no** setter, no `current` flag and no mutable field anywhere in the type — PRD §40.3
   "not mutable fields". A test asserts the dataclass is frozen and exposes no `current`/`latest`
   attribute.

5. **`RateSeries` — the dated series and its invariants.**
   `RateSeries(fact_key: str, jurisdiction: str, facts: tuple[RateFact, ...])` with:
   - `as_at(date: str) -> RateFact | None` — the fact whose `[applies_from, applies_to]` contains
     `date`; `None` (never a nearest match, never the newest) when nothing applies. This is the only
     lookup; there is no "get current rate".
   - `validate() -> tuple[SeriesFinding, ...]` where `SeriesFinding(code, severity, message,
     details)` and `severity ∈ {"BLOCK", "FLAG", "INFO"}`, matching `INGF-01`'s `ValidationFinding`
     severities so findings pass straight through `adapter.validate()`:

     | Rule | Code | Severity | Basis |
     |---|---|---|---|
     | Two facts with overlapping intervals | `RATE_SERIES_OVERLAP` | **BLOCK** | PRD §35.2 "non-overlap validation where versions represent consolidated effect"; PRD §40.9 "critical … time … failures block release"; mirrors `INGF-05`'s `EFFECT_INTERVAL_OVERLAP` |
     | Gap inside the supported FY window | `RATE_SERIES_GAP` | **FLAG** | PRD §6.6 three-year coverage; a declared `known_gaps` entry is the honest alternative |
     | A supported financial year with no applicable fact | `RATE_FY_COVERAGE_INCOMPLETE` | **BLOCK** for `PT-*` groups (`E13`), **FLAG** otherwise | PRD §44.2 `E13`; PRD §6.6 |
     | Mixed units within one `fact_key` | `RATE_UNIT_INCONSISTENT` | **BLOCK** | a series whose unit changes cannot be compared |
     | `legislation_ref is None` | `RATE_LEGISLATION_LINK_MISSING` | **FLAG** | PRD §40.3 "applicable legislation/guidance role"; sub-PRD **N6** makes the link optional and never fabricated |

     These are unconditional structural rules, not percentage thresholds: plan §8 **Q9**'s
     baseline refinement applies to `INGF-05`'s count/parse-failure percentages and never to a
     `BLOCK` severity here. `validate()` returns findings; it never raises and never repairs.
   - `to_findings(series) -> Sequence[ValidationFindingRecord]` converting the above into `CRPS-01`
     `validation_finding` records, so an adapter's `validate()` can return them unchanged.

6. **`emit` — the single emission mapping into `CRPS-01` records (sub-PRD D2).**
   `rate_records(fact: RateFact, *, stable_source_key: str, version_label: str,
   document_effective_from: str, document_effective_to: str | None, tool_versions: Mapping[str, str])
   -> Sequence[Envelope]` returning, in this order:
   1. one `document_node` — `stable_node_key = f"rate/{fact.fact_key}"`, `node_kind` = the canonical
      value resolved per sub-PRD **N1**;
   2. one `node_version` — `canonical_text` = the exact official text span the fact was read from,
      `display_label` = `fact.fact_key`, `effective_from`/`effective_to` = the **fact's** interval,
      `text_hash` per `CRPS-01` deliverable 12, `ordinal` supplied by the caller;
   3. one `legal_event` — `event_type` resolved per **N1**, `event_date` = the document's publication
      date, `effective_date` = `fact.applies_from`, `evidence_ref` = the `NodeRef` of (2), and
      `metadata_json` = the **structured** fact:
      `{rates_model_version, fact_key, jurisdiction, kind, unit, shape, value | brackets |
      dimensions, applies_from, applies_to, financial_year, source_role, extractor_version}`;
   4. **only when `fact.legislation_ref is not None`** — one `node_relation` from (2) to the
      legislation node, with `derivation = "DETERMINISTIC"`, `parser_version` and
      `confidence_state` set to the canonical non-model value. A `MODEL_SUGGESTED` relation is
      **never** produced here (PRD §9.3, PRD §35.2 "`MODEL_SUGGESTED` cannot support definitive
      status"); attempting it raises `RateRelationError`.

   Every envelope carries `provenance = {official_url, artifact_sha256, retrieved_at}` and
   `tool_versions` including `rates` = `RATES_MODEL_VERSION` (PRD §40.7 "source URL, artifact hash and
   tool version"). Output ordering and JSON key ordering are deterministic so two runs over one
   artifact are byte-identical (`INGF-09` DoD item 8).

7. **`extract` — the deterministic extraction helper (PRD §9.3, D9).**
   `extract_facts(parsed: ParsedDocument, spec: TableSpec, *, extractor_version: str)
   -> tuple[tuple[RateFact, ...], tuple[SeriesFinding, ...]]` where `TableSpec` declares, per fact:
   `fact_key`, `kind`, `unit`, a `block_path` or `label_pattern` locating the row/cell in
   `ParsedDocument.blocks`, an optional `dimension`, and the date rule (`FY_LABEL`,
   `EXPLICIT_DATES` or `FROM_HEADING`). The helper:
   - operates only on `parsed.text` and `parsed.blocks` — **no HTML/XML/PDF library is imported**
     (PRD §37.4; `INGF-01` deliverable 11's AST scan enforces it and this package is inside its
     scanned tree);
   - computes offsets into `parsed.text` and slices `quoted_text` from them, so deliverable 4's
     re-parse check is always satisfiable when the value really is in the source;
   - returns a `RATE_EXTRACTION_AMBIGUOUS` finding (never a guess) when a spec entry matches zero or
     more than one block.

8. **`matrix` — the PRD §44.2 `E13` harness.**
   - `RateMatrixRow(group_id, jurisdiction, financial_years: Mapping[str, MatrixCell])` and
     `MatrixCell(present: bool, fact_count: int, fixture_ref: str | None, checked_at: str)`.
   - `rate_matrix_row(group_dir: Path) -> RateMatrixRow` reads that group's committed
     `fixtures/rate-matrix.json` (schema committed at `_shared/rates/schema/rate-matrix.schema.json`,
     `additionalProperties: false`) and validates that every `SUPPORTED_FINANCIAL_YEARS` entry has a
     cell with `present: true` and `fact_count > 0`.
   - `assert_rate_matrix(group_dir)` — the one-line call every `PT-*` ticket's test file makes.
   - CLI `python -m <aroot>._shared.rates matrix --adapters-root DIR [--groups GLOB] [--out FILE]`
     printing the 8 × 3 table and **exiting non-zero when any of the eight payroll-tax jurisdictions
     or any of the three financial years is missing** — a blank cell is a failure, never a skip
     (PRD §44.4; the same discipline `INGF-07` applies to `MANDATORY_GROUP_MISSING`). The expected
     jurisdiction set `PAYROLL_TAX_JURISDICTIONS = ("NSW","VIC","QLD","WA","SA","TAS","ACT","NT")` is
     a module constant asserted to have length 8.

9. **Failure codes** registered through `INGF-01`'s `register_failure_codes("rates", …)`, each with a
   non-empty **operator action** (PRD §40.8 item 10, ADM-001): `RATE_EVIDENCE_MISSING`,
   `RATE_VALUE_NOT_IN_SOURCE`, `RATE_INTERVAL_INVALID`, `RATE_SERIES_OVERLAP`, `RATE_SERIES_GAP`,
   `RATE_FY_COVERAGE_INCOMPLETE`, `RATE_UNIT_INCONSISTENT`, `RATE_UNIT_UNKNOWN`,
   `RATE_LEGISLATION_LINK_MISSING`, `RATE_EXTRACTION_AMBIGUOUS`, `RATE_ROLE_INVALID`,
   `RATE_RELATION_MODEL_SUGGESTED`.

10. **`README.md` inside `_shared/rates/`** — the authoring guide for the nine rate-bearing adapter
    Builders: the import path, the `RateFact` contract, the D3 evidence rule stated as *"if the number
    is not in your committed fixture, you cannot emit it"*, the `TableSpec` recipe, the emission
    mapping, the `rate-matrix.json` shape, the three financial years, and the standing prohibition on
    copying this package into a group directory (plan §9 R2). It also states the one registry-facing
    rule the nine dependents inherit: a financial year that cannot be sourced officially is recorded
    as a `customer_visible: true` gap and, where it prevents `ACTIVE`, an `INGF-07` `limitation` block
    (sub-PRD **D11**) — never reconstructed from memory and never left blank. This is the document a
    cold-starting Builder reads instead of another adapter's code.

11. **Docstring provenance.** Every public symbol's docstring cites the PRD section that fixes it
    (`§40.3`, `§15.2`, `§15.3`, `§35.2`, `§9.3`, `§6.6`). A Builder must be able to justify the model
    from the PRD without this ticket.

## Acceptance checklist (classified)

- [ ] `[machine]` `RateFact` is frozen, has no `current`/`latest`/settable attribute, and mutation
      raises — the mechanical form of PRD §40.3 "not mutable fields" (deliverable 4).
- [ ] `[machine]` **D3 evidence rule**: constructing a `RateFact` whose `SCALAR` value does not
      re-parse from `quoted_text` raises `RateValueNotInSourceError`; the same for a bracket value and
      for a bracket bound; a fact whose `quoted_text` length ≠ `end_offset - start_offset` raises
      `RateEvidenceError` (PRD §40.3, §9.4, §15.3; deliverable 4).
- [ ] `[machine]` `RateSeries.as_at()` returns the applicable fact for a date inside an interval,
      `None` for a date before the first and after the last interval, and **never** a nearest or
      newest match — parametrised over a three-FY series (PRD §15.2, §6.6; deliverable 5).
- [ ] `[machine]` `validate()` returns `RATE_SERIES_OVERLAP` at severity `BLOCK` for two overlapping
      intervals, `RATE_SERIES_GAP` at `FLAG` for a hole inside the supported window, and
      `RATE_UNIT_INCONSISTENT` at `BLOCK` for a mixed-unit series (PRD §35.2, §40.9; deliverable 5).
- [ ] `[machine]` `RATE_FY_COVERAGE_INCOMPLETE` is `BLOCK` for a `PT-*` group and `FLAG` otherwise,
      driven by the group id passed to `validate()` (PRD §44.2 `E13`, §6.6).
- [ ] `[machine]` `financial_year_of()` maps 30 June and 1 July to different years and round-trips
      through `financial_year_bounds()`; `SUPPORTED_FINANCIAL_YEARS == ("2024-25","2025-26","2026-27")`
      (PRD §6.6; deliverable 2).
- [ ] `[machine]` All values are `Decimal`; a test asserts no public field is typed `float` and that a
      percentage round-trips exactly through emission and re-read (deliverable 3).
- [ ] `[machine]` `rate_records()` emits exactly the D2 sequence — `document_node`, `node_version`,
      `legal_event`, and the `node_relation` **only** when `legislation_ref` is set — every envelope
      carrying `provenance.official_url`, `provenance.artifact_sha256` and
      `tool_versions["rates"]`, and every emitted record validating against `CRPS-01`'s
      `validate_record()` (PRD §40.7; deliverable 6).
- [ ] `[machine]` Emission is byte-deterministic: two calls with equal input produce identical JSON
      lines including key order (`INGF-09` DoD item 8; deliverable 6).
- [ ] `[machine]` `rate_records()` raises `RateRelationError` if asked to emit a relation with a
      model-suggested confidence state (PRD §9.3, §35.2 "`MODEL_SUGGESTED` cannot support definitive
      status"; deliverable 6).
- [ ] `[machine]` `extract_facts()` returns `RATE_EXTRACTION_AMBIGUOUS` rather than a fact when a
      `TableSpec` entry matches zero or ≥2 blocks, and every returned fact's offsets slice exactly its
      `quoted_text` out of `parsed.text` (PRD §9.3, §15.3; deliverable 7).
- [ ] `[machine]` This package imports no HTTP library and no HTML/XML/PDF parsing library — asserted
      by re-running `INGF-01`'s AST scan over `pipelines/adapters/_shared/rates/**` with a synthetic
      dirty fixture as negative control (PRD §37.4; sub-PRD D9).
- [ ] `[machine]` `PAYROLL_TAX_JURISDICTIONS` has exactly the eight PRD §6.3 jurisdictions;
      `python -m <aroot>._shared.rates matrix` exits non-zero when a jurisdiction directory or a
      financial-year cell is missing, and zero for a complete synthetic 8 × 3 tree (PRD §44.2 `E13`,
      §44.4; deliverable 8).
- [ ] `[machine]` `rate-matrix.json` rejects an unknown key (`additionalProperties: false`) and a cell
      with `present: true, fact_count: 0` (deliverable 8).
- [ ] `[machine]` Every failure code in deliverable 9 is registered with a non-empty operator action,
      and `INGF-05`'s reason-table totality test still passes with them present (PRD §40.8 item 10,
      ADM-001).
- [ ] `[machine]` `_shared/rates/README.md` documents the import path, the D3 rule, the emission
      mapping and the three financial years — asserted by a doc test that each named section exists
      (cold-start requirement; deliverable 10).
- [ ] `[machine]` No file was created at `pipelines/adapters/_shared/__init__.py` by this ticket
      (sub-PRD **D4**), and the test suite runs with the package imported by the path `SLEG-01`
      established (sub-PRD **N2**).
- [ ] `[machine]` The suite runs fully offline — a session fixture asserts no outbound socket.
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, PRD §20.3 "Rust and Python builds/tests").
- [ ] `[machine]` `pnpm test` green — standing suite item; this ticket adds no TypeScript, so the
      expectation is "unchanged and green" (plan §1.1, PRD §45.3).
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (supports `SRCH-003`,
      `SRCH-005`, `COV-001`; PRD §44.2 `E13` groundwork); UAT IDs — **none owned**; the model is a
      precondition for `UAT-SRCH-03` ("Select 2024-08-03 then open result → Version effective at that
      date opens; current text is not substituted"), owned by `14-search-product`; schema/API/event
      compatibility (introduces `RATES_MODEL_VERSION` = "1" and `rate-matrix.json`, both consumed by
      nine adapter tickets — a change after merge requires re-publishing them,
      `publish-tickets.mjs --sync`); tenant/PII/security impact (none — public source metadata only,
      no tenant or customer data enters this package); source/licence impact (none directly; the model
      carries no text beyond the quoted span an adapter's licence assessment already permits);
      cost/memory/latency impact (negligible); rollback path (delete the package; nothing depends on
      it until `SINS-03`); known gaps (sub-PRD **N1**, **N2**, **N6**; the per-source anomaly
      thresholds this package deliberately does not set are baseline-selected and consolidated by
      `GOLD-16`, plan §8 **Q9**).
- [ ] `[human]` **Architect/Founder review that the D2 mapping actually discharges PRD §40.3** — that
      a rate emitted this way can be cited with a date-specific official source and its
      legislation/guidance role, for a `SCALAR`, a `BRACKETED` and a `DIMENSIONED` example. Whether
      the representation is *sufficient* (as opposed to present) is irreducibly a judgment call, and
      it binds nine adapters plus every downstream citation. If it holds, record it as
      `docs/adr/NNNN-date-versioned-rate-fact-representation.md` (sub-PRD D2 is flagged as an ADR
      candidate; plan §2.1 **A9** gives the creating ticket ownership of that file).
- [ ] `[human]` If `SLEG-01`'s packaging convention differs from what deliverable 1 assumed, the
      sub-PRD's **D4**/**N2** rows are updated in the same PR (writeback obligation, plan §1.1).
- **No `[fixture]` criteria** — this package owns no source group and replays no recorded official
  data; its inputs are synthetic `ParsedDocument` objects built in the tests. The first recorded
  wave-2 fixtures arrive with `SINS-02`. Declared absent deliberately.

## Test plan

Harness: `pytest` via `uv run pytest pipelines/adapters/_shared/rates -q`. Everything is offline: no
network, no `pipelines/adapters/<group>/` content required, no `corpus.sqlite`. Copy the construction
pattern from `pipelines/ingestion/tests/adapter/` (`INGF-01`) — synthetic fixtures in-tree, one
negative control per rule.

1. `uv sync --frozen && uv run pytest pipelines/adapters/_shared/rates -q` — all green.
2. **`test_financial_year.py`** — boundary table: `2024-06-30 → 2023-24`, `2024-07-01 → 2024-25`,
   `2025-06-30 → 2024-25`, `2026-07-01 → 2026-27`; `SUPPORTED_FINANCIAL_YEARS` exact tuple; malformed
   labels raise.
3. **`test_values.py`** — `RateValue` validators for all three shapes; `parse_value()` over a table of
   spans (`"5.45%"`, `"$1,200,000"`, `"1.2 million"` → raise, `"nil"` → raise); `Decimal` exactness.
4. **`test_rate_fact.py`** — the D3 rule is the centrepiece. Build a `ParsedDocument`-like text
   `"The rate is 5.45% from 1 July 2025."`, slice the correct span and construct successfully; then
   parametrised negative controls: value not present in the span; off-by-one offsets; empty span;
   `applies_to < applies_from`; `financial_year` inconsistent with `applies_from`; unknown
   `source_role`. Also assert frozen-ness and the absence of any `current`-shaped attribute.
5. **`test_series.py`** — a three-FY series: `as_at()` inside each interval, at each boundary date,
   before the first and after the last; then one mutated copy per `validate()` rule asserting exactly
   that code and severity; then the `PT-*` vs non-`PT-*` severity switch for
   `RATE_FY_COVERAGE_INCOMPLETE`.
6. **`test_emit.py`** — `rate_records()` output sequence and cardinality with and without
   `legislation_ref`; every record passed through `CRPS-01`'s `validate_record()` and asserted to
   produce zero violations; provenance and `tool_versions` present on every envelope; two-run byte
   equality; `RateRelationError` for a model-suggested relation.
7. **`test_extract.py`** — a synthetic `ParsedDocument` with three labelled blocks; a `TableSpec`
   matching one, none and two; assert facts, `RATE_EXTRACTION_AMBIGUOUS`, and that every fact's
   offsets slice its own `quoted_text` from `parsed.text`.
8. **`test_matrix.py`** — a synthetic `pipelines/adapters/`-shaped tree in `tmp_path` with eight
   `pt-*` groups × three FYs: complete tree exits 0; then delete one jurisdiction directory, then one
   FY cell, then set `fact_count: 0`, asserting non-zero exit and the specific failure each time.
9. **`test_architecture.py`** — re-runs `INGF-01`'s import scan over this package plus a synthetic
   module importing `httpx` as the negative control.
10. **`test_failure_codes.py`** — every deliverable-9 code registered with a non-empty operator
    action; re-registration is idempotent.
11. **`test_readme.py`** — the authoring-guide doc test.
12. `uv run pytest` (whole repo) and `pnpm test` — green.

**Reviewer focus.** Run `test_rate_fact.py` first: if a `RateFact` can be constructed with a value
that is not in its own quoted span, sub-PRD **D3** is not enforced and the ticket is not done —
everything else in this module rests on that one check. Then confirm `as_at()` has no fallback path
to a nearest or newest fact, that `validate()` never repairs, and that the matrix CLI fails rather
than prints a blank cell.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (a docs PR/MR,
a changelog line in `docs/prd/07-sources-instruments/README.md`, then `publish-tickets.mjs --sync`),
and only then change code. Silent divergence is an incomplete ticket. The ticket wins over any
implementation plan (CLAUDE.md, issue #53). Because nine tickets are `blocked_by` this one, a change
here after merge also requires re-publishing them — say so in the PR.

**Foreseeable frictions and their exact writeback targets:**

1. **`FND-03` has no suitable `node_kind`, `event_type` or `relation_type` value for a dated rate
   fact** (sub-PRD **N1**) → do **not** invent a literal: `CRPS-01` deliverable 4 generates SQLite
   `CHECK` constraints from `packages/contracts`, so an invented value fails at build time anyway.
   Use the nearest existing value, record the compromise in
   `docs/prd/07-sources-instruments/README.md` **N1**, and raise the enum addition against `FND-03`
   by proposing the row in `docs/prd/breakdown-plan.md` §5.1. If the addition is durable, write
   `docs/adr/NNNN-rate-fact-enum-values.md` (new file, owned by this ticket per plan §2.1 **A9**).
2. **The D2 mapping cannot express a real rate** — e.g. a jurisdiction publishes a rate that depends
   on two independent dimensions and a bracket at once → extend `RateValue` **here**, in this
   package, and update this ticket's deliverable 3 plus
   `docs/prd/07-sources-instruments/README.md` **D2** first. Never let an adapter add a local variant
   of the value model (plan §9 **R2**), and never add a tenth intermediate-record type (that is
   `CRPS-01`'s, plan §2.1 **A4**).
3. **A real source states a rate only in an image, a spreadsheet or a form the parser cannot reach
   with exact offsets** → the fact **must not be emitted**. The honest outcomes are: a `known_gaps`
   entry with `customer_visible: true` and `reason_code: FORMAT_UNSUPPORTED` in that group's
   `registry.yaml`, and — where it makes the group's coverage claim untrue — the PRD §7 status
   `FRESHNESS_LIMITED` or `METADATA_AND_LINK_ACTIVE` carried by a complete `INGF-07` `limitation`
   block: state, `reason_code`, `reason_detail`, the measured `evidence[]`, the affected dates or
   collections and the customer-visible warning (sub-PRD **D11**; plan §8 **Q10**, confirmed policy).
   PRD §44.4 forbids silently calling the category covered, and the status is never chosen to make
   the work smaller. Record the pattern in `docs/prd/07-sources-instruments/README.md`.
4. **`SLEG-01`'s packaging convention makes `_shared/rates` unimportable from a hyphenated group
   directory** (sub-PRD **N2**) → follow whatever `SLEG-01` actually did and record it in the sub-PRD
   **D4**/**N2** rows in the same PR. If the convention genuinely requires a file at
   `pipelines/adapters/_shared/__init__.py`, that file is shared by four modules: raise it as a plan
   change in `docs/prd/breakdown-plan.md` §4.2 (a new contested-path row naming a single owner) —
   do not create it silently.
5. **`SINS-05` (FWO) or another group without a `SINS-01` edge needs rate facts** (sub-PRD **N4**) →
   the writeback is a **plan** change adding the edge in `docs/prd/breakdown-plan.md` §5.8 and §6.2
   plus this module's README, then `publish-tickets.mjs --sync`. Copying this package into that group
   is the failure plan §9 **R2** exists to prevent.
6. **`RateSeries.validate()` wants to auto-close an open interval or fill a gap** → refuse. PRD §15.2
   makes legal status derive from evidenced events; a synthesised interval is an unevidenced legal
   claim. Emit the finding and let the operator act (`INGF-05`'s quarantine, PRD §12.2).

**Escalation rule.** If PRD §40.3's rule cannot be satisfied — if a rate genuinely cannot be stored
with an effective interval and a pinpoint citation inside the `CRPS-01` contract — that overturns
both PRD §40.3 and plan §2.1 **A4**, and it invalidates nine adapter tickets plus the `E13` exit
evidence. Stop, escalate for re-review, and never soften the model locally: a rate without a citable
dated source is precisely the failure PRD §43.3 gates to zero ("Date/jurisdiction critical error …
must be 0").
