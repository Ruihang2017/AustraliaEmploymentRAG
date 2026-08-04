---
id: SCAS-01
title: "Case-law primitives: citation, level, paragraph identity, treatment"
module: 08-sources-cases
lane: 08-sources-cases
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INGF-09]
blocks: [SCAS-02, SCAS-03, SCAS-04, SCAS-05, SCAS-06, SCAS-07, SCAS-08, SCAS-09, SCAS-10, SCAS-11, SCAS-12, SCAS-13]
---

# SCAS-01 — Case-law primitives: citation, level, paragraph identity, treatment

Implements PRD §9.2 (case treatment), PRD §9.3 (relationship evidence), PRD §35.2 (`node_relation`,
`legal_event`, `authority`) and PRD §40.4 (wave 3 roster) <SRCH-004, SRCH-005> — no ADR — the
decision is already made in PRD §9.2 and §9.3; this is build ticket 1 of 13 against it.
Parent sub-PRD: [08-sources-cases README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [INGF-09 — Adapter conformance kit (the twelve-item DoD)](../../05-ingestion-framework/tickets/INGF-09-adapter-conformance-kit-the-twelve-item-dod.md)
**Why `builder`:** a bounded library inside this module's declared file-scope against rules PRD §9.2
and §9.3 already state as MUST-level bullets — not a new subsystem decision.

## Background + basis

**PRD §9.2 is the specification, verbatim:**

> - "Court/tribunal, level, date, case number and neutral citation MUST be displayed."
> - "Authority status MUST distinguish binding, potentially binding, persuasive and unknown."
> - "Appeal, affirmation, reversal, overruling, distinction, following and citation relationships MAY
>   be asserted only with evidence."
> - "A citation alone establishes `CITES`, not treatment."
> - "Unconfirmed later treatment MUST display `TREATMENT_NOT_CONFIRMED`."
> - "Holding/reasons MUST be distinguished from obiter, party submissions and background where the
>   source permits."
> - "A single decision MUST NOT be generalised into a universal rule without supporting authority."

**PRD §9.3 fixes what may support a conclusion:**

> - "Official structured assertions may support conclusions."
> - "Deterministic extraction may support conclusions when exact source evidence and parser version
>   are retained."
> - "LLM-discovered relationships are `MODEL_SUGGESTED` and MUST NOT change legal status or support a
>   definitive treatment conclusion."

**PRD §35.2 gives the storage shape the rules must land in.** `node_relation` has columns
`from_node_version_id`, `to_node_version_id`, `relation_type`, `evidence_node_version_id`,
`evidence_start`, `evidence_end`, `derivation`, `parser_version`, `confidence_state`, with the
critical constraint stated as *"`MODEL_SUGGESTED` cannot support definitive status"*. `legal_event`
has `event_type`, `event_date`, `effective_date`, `evidence_node_version_id`, `target_version_id`,
with *"legal status derived from events"*. `authority` has `authority_type`, `jurisdiction`,
`court_level`. PRD §15.1 says `NodeRelation` covers *"Renumber, replace, split, merge, amend, cite,
interpret, apply and **treatment** relations"* and `LegalEvent` covers *"commencement, repeal,
variation and **appeal**"*.

**PRD §15.3 fixes node and citation identity:**

> "Provision labels are version-specific display values, not permanent IDs. … Citations MUST target
> DocumentVersion + NodeVersion + exact offsets + source snapshot, never a SearchChunk."

That is why paragraph numbers become stable node keys and `[45]` stays a display label
(sub-PRD **D7**), and why PRD §40.4's `CASE-FCA` row requires *"metadata and exact paragraphs"*.

**Why this ticket is first and why it is shared.** Plan §5.9 makes all twelve `CASE-*` adapters
`blocked_by` this one, and plan §9 **R2** is the standing warning:

> "The shared primitive stays owned by `SLEG-01`/`SINS-01`/`SCAS-01`/`SFUT-01`; a new sibling ticket
> is added there and the adapters are `blocked_by` it. **Never copy the helper into two adapter
> directories.**"

Twelve divergent implementations of the treatment rules is the specific failure PRD §27 names
(*"Case treatment is incomplete … no LLM-only treatment assertion"*) and PRD §43.1 measures with 40
evaluation cases in the *"Case authority, appeal and treatment"* category (`GOLD-12`).

**The cold-start requirement is strict.** Twelve Builders will write twelve adapters against this
library **without reading each other's code and without this planning conversation**. This ticket
therefore ships an authoring guide inside its own file-scope, and every public name below is binding.

**What this ticket must not decide.** PRD §9.2's *bindingness* rule (bullet 2) depends on the asking
court, so it belongs to `FND-10` (`packages/domain/src/legal/**`, plan §5.1: *"temporal applicability
and authority hierarchy"*) and is consumed at answer time by `EVID-04`'s `authority_role` field
(PRD §36.4). Bullet 7 (no universal rule from one decision) is an answer-generation rule owned by
`FND-07`/`EVID-05`. This ticket supplies the **facts and the evidenced graph** those rules need
(sub-PRD **D8**).

**Carried caveats.**
- Enum values are `FND-03`'s (plan §4.2: canonical enums have exactly one owner). This ticket
  consumes `relation_type`, `confidence_state`, `event_type`, `document_type`, `node_kind`,
  `authority_type` and `court_level` through the `CRPS-01` record contract and **writes back** to
  `FND-03` if a value PRD §9.2/§9.3/§15.1 requires is absent — sub-PRD **Q1**.
- Whether an evidenced reversal changes `legal_status` is `FND-10`'s call — sub-PRD **Q3**. This
  ticket implements **D6** (treatment changes the graph, not the status) because it emits strictly
  more information than either answer needs.
- `pipelines/adapters` importability is `INGF-01`'s loader behaviour — sub-PRD **Q2**.

## Goal

Create `pipelines/adapters/_shared/caselaw/**`: the Python library every `CASE-*` adapter in this
module imports, providing neutral-citation and pinpoint parsing, stable case identity, judgment
paragraph identity and node construction with exact-offset round-trip, court/bench fact records, case
`LegalEvent` emission, case-specific validation findings, and — the load-bearing part — a relation
API in which a treatment relation **cannot be constructed** without a resolvable evidence span, a
deterministic/official derivation and a parser version; in which `CITES` is terminal and cannot be
upgraded in place; in which `MODEL_SUGGESTED` is rejected at the emit boundary; and in which
`TREATMENT_NOT_CONFIRMED` is the computed default for every case pair without evidenced treatment —
proved by a negative-control suite in which each of those guarantees is separately attacked.

## Non-goals

- **No source adapter.** All twelve `CASE-*` groups are `SCAS-02`…`SCAS-13`. This ticket's tests use
  synthetic judgment fixtures under its own tree.
- **No HTTP, no parsing, no OCR.** `INGF-02`'s `Fetcher` and `INGF-06`'s `ParserHost` are the only
  routes; `INGF-01`'s architecture test forbids `requests`/`httpx`/`urllib`/`socket` and a document
  parser library anywhere under `pipelines/adapters/**`.
- **No `registry.yaml`, `allowlist.yaml`, `licence.yaml` or `conformance.yaml` schema** — `INGF-07`,
  `INGF-02`, `INGF-04`, `INGF-09` respectively (`05-ingestion-framework` sub-PRD D3). This library
  neither defines nor validates them.
- **No corpus table access and no normalised-record type definitions** — `CRPS-01` owns the payload
  types (plan §2.1 **A4**); PRD §40.7: *"The adapter never writes active corpus tables directly."*
- **No canonical enum definitions** — `FND-03` (sub-PRD **Q1**).
- **No binding/persuasive computation and no PRD §9.1 hierarchy** — `FND-10`, consumed by `EVID-04`
  (sub-PRD **D8**).
- **No chunking or index-tier assignment** — `CRPS-03`, `CRPS-04`. A judgment paragraph is a
  `NodeVersion`; how it is chunked and tiered is decided downstream.
- **No ranking use of relations** — PRD §36.3 item 7 (*"relationship relevance"*) is `RETR-06`.
- **No evaluation cases** — `GOLD-12` authors the 40 case-treatment cases. This library must never
  read `evals/gold/**` (plan §9 **R9**, PRD §45.1 item 6).
- **No answer-side rule** that a single decision cannot become a universal rule (PRD §9.2 bullet 7) —
  `FND-07`/`EVID-05`. Carried forward explicitly, not dropped.
- **No file at `pipelines/adapters/_shared/` level** — sub-PRD **D11**; that path is owned by no
  module and `SLEG-01` runs concurrently.

## File-scope (write-owns)

- `pipelines/adapters/_shared/caselaw/**` — the library, its `tests/` and its `README.md` authoring
  guide. Plan §5.9 gives exactly this scope.
- Does not touch: `pipelines/adapters/_shared/` itself, `pipelines/adapters/_shared/legislation/**`
  (`06-sources-legislation` / `SLEG-01`), `_shared/rates/**` (`07-sources-instruments` / `SINS-01`),
  `_shared/future/**` (`10-sources-future` / `SFUT-01`). No `__init__.py` above `caselaw/`
  (sub-PRD **D11**).
- Does not touch: `pipelines/adapters/case-*/**` — `SCAS-02`…`SCAS-13`, nor any other
  `pipelines/adapters/<group>/**` directory in modules `06`, `07`, `09`, `10`.
- Does not touch: `pipelines/ingestion/**` — `05-ingestion-framework`.
- Does not touch: `pipelines/corpus-builder/**`, `schemas/**` — `04-corpus-contract`, `00-foundation`.
- Does not touch: `packages/**`, `apps/**`, `services/**`, `tests/**`, `evals/**`,
  `pipelines/evaluation/**`, `infra/**`, root manifests.
- `pipelines/adapters/pyproject.toml` (if `FND-01` created one for the member): **append-only**, and
  the expectation is that this ticket appends **nothing** — the library needs no third-party HTTP or
  parser dependency by construction. Conflicts resolve by re-running `uv lock`, never hand-merge
  (plan §1.1, PRD §44.3).

**Serial safety.** This is the first decomposition of `docs/PRD.md` (plan §1: phase 1, `append:
false`, `usedIds: []`); nothing is merged and no ticket has touched these paths. Intra-module, this
ticket is **wave 1 and runs alone** — all twelve siblings are `blocked_by` it (plan §7: 2 waves, peak
12 lanes). Cross-module, `SLEG-01`, `SINS-01` and `SFUT-01` may run concurrently; their scopes are
sibling directories under `_shared/` and are disjoint from `_shared/caselaw/**`, which is exactly why
**D11** forbids any file at the `_shared/` root. The twelve sibling adapter scopes
(`pipelines/adapters/case-<jur>/**`) are disjoint from each other and from this one by directory:
they share only this library, which they import and never write.

## Deliverables

Names below are **binding**: twelve adapter tickets are written against them without reading this
source. Internal organisation inside `caselaw/` is the Builder's choice; the public surface is not.
Import root per sub-PRD **Q2**; the guide records whatever `INGF-01`'s loader supports.

1. **Package.** `pipelines/adapters/_shared/caselaw/__init__.py` exporting `CASELAW_VERSION: str`
   (`"0.1.0"`) — used as the `parser_version` component every relation and event carries — and
   re-exporting the public API of deliverables 2–9. PEP 420 namespace package above it (**D11**).

2. **`citation.py` — neutral citations and pinpoints.**
   - `NeutralCitation(year: int, court_code: str, number: int, raw: str)` (frozen) with
     `key` → the normalised uppercase form `"[2023] HCA 12"` → `"2023:HCA:12"`, used for
     `legal_document.neutral_citation` and for exact-identifier retrieval (`SRCH-004`, PRD §17.1
     *"Exact identifiers include provisions, neutral citations, case numbers, award/agreement
     identifiers and ABNs"*).
   - `parse_neutral_citation(text: str, *, allowed_courts: Mapping[str, CourtFacts]) -> NeutralCitation | None`
     — deterministic pattern `\[(\d{4})\]\s+([A-Z][A-Za-z]{1,12})\s+(\d{1,5})`; a court code absent
     from `allowed_courts` returns `None` rather than inventing a court.
   - `iter_citations(text: str, *, allowed_courts) -> Iterator[CitationMatch]` where
     `CitationMatch(citation, start, end, pinpoints: Sequence[Pinpoint])` carries **character offsets
     into the text it was found in** — these are the evidence offsets PRD §35.2 stores.
   - `Pinpoint(kind: Literal["PARAGRAPH", "PAGE"], first: int, last: int, start: int, end: int)`,
     parsing `at [45]`, `at [45]–[47]`, `at [45], [52]` (en dash and hyphen both accepted).
   - `register_court_codes(group_id: str, codes: Mapping[str, CourtFacts]) -> None` and
     `court_codes() -> Mapping[str, CourtFacts]` — the area-local **registry** pattern `INGF-01`
     deliverable 10 uses for failure codes, chosen for the same reason: a shared `courts.yaml` would
     serialise twelve concurrent tickets (sub-PRD rejected alternatives). Duplicate registration of a
     code with different facts raises `DuplicateCourtCodeError`; identical re-registration is
     idempotent.
   - `parse_medium_neutral_from_url()` **does not exist**. A citation is read from source text or
     from an official structured field, never inferred from a URL (evidence discipline).

3. **`identity.py` — stable case identity (PRD §40.8 item 3).**
   - `IdentityBasis = Literal["NEUTRAL_CITATION", "COURT_FILE_NUMBER", "OFFICIAL_URL_PATH"]`.
   - `case_identity(*, citation: NeutralCitation | None, court_file_number: str | None,
     decision_date: str, court: CourtFacts, official_url: str, canonical_title: str,
     document_type: str) -> CaseIdentity` returning a `StableDocumentIdentity` (`INGF-01`
     deliverable 3) plus `identity_basis` and a `weak: bool` flag.
     Preference order is fixed: neutral citation → `court/file-number/date` → URL path.
     `OFFICIAL_URL_PATH` sets `weak=True` and raises the `CASE_IDENTITY_WEAK` finding so PRD §40.9's
     duplicate-identity anomaly has something to catch.
   - `stable_source_key` is deterministic, lowercase, and contains no volatile component (no
     retrieval date, no query string, no session token). A test asserts two independent runs over the
     same artifact produce the same key, and that two different judgments never collide.

4. **`paragraph.py` — paragraph identity and judgment node hierarchy (D7).**
   - `paragraph_stable_node_key(n: int) -> str` → `f"para/{n:04d}"`;
     `sequence_stable_node_key(ordinal: int) -> str` → `f"seq/{ordinal:04d}"` for unnumbered material;
     `part_stable_node_key(part: str) -> str` → `f"part/{part}"` for `coversheet`, `catchwords`,
     `orders`, `reasons`, `annexure/<n>`.
   - `SectionRole = Literal["HOLDING_OR_REASONS", "ORDERS", "CATCHWORDS", "BACKGROUND",
     "SUBMISSIONS", "UNCLASSIFIED"]` — PRD §9.2 bullet 6 *"where the source permits"*: a role is
     assigned **only** from an official structural marker the adapter passes in; the default is
     `UNCLASSIFIED`. Guessing from prose is forbidden and there is no heuristic classifier here.
   - `build_judgment_nodes(parsed: ParsedDocument, *, document_key: str, effective_from: str,
     part_markers: Mapping[str, SectionRole] | None = None) -> JudgmentNodes` returning a root
     `judgment` node, part nodes, and one node per paragraph, each a `NodeVersionRecord`
     (`CRPS-01`) with `display_label` = `"[45]"`, `stable_node_key` = `"para/0045"`, `ordinal`
     contiguous among siblings, `parent_stable_node_key` set, `canonical_text` exact and `text_hash`
     recomputable.
   - **Round-trip guarantee** (PRD §15.3, §40.8 item 5): every emitted node satisfies
     `parsed.text[block.start_offset:block.end_offset] == node.canonical_text`, asserted inside
     `build_judgment_nodes` and re-asserted by `INGF-06`'s `assert_roundtrip()`.
   - **Duplicate paragraph numbers** produce `CASE_DUPLICATE_PARAGRAPH` as a `BLOCKING`
     `ValidationFinding` — never a silent merge, never a `-2` suffix.
   - `paragraph_span(nodes, first, last) -> Sequence[NodeVersionRecord]` for pinpoint resolution.
   - Multi-judgment decisions: `judgment_sections` marks per-judge sections when the source marks
     them, carrying `authored_by` on the part node; unmarked sources leave it `None`.

5. **`authority.py` — court and bench facts, not bindingness (D8).**
   - `CourtFacts(authority_id: str, name: str, authority_type: str, jurisdiction: str,
     court_level: str, is_appellate: bool, official_url: str)` (frozen), where `authority_type` and
     `court_level` values come from the `CRPS-01`/`FND-03` enums (sub-PRD **Q1**) — a value not in
     the contract enum raises `UnknownCourtLevelError` rather than being coerced.
   - `BenchFacts(members: Sequence[str], bench_size: int, is_full_bench: bool,
     presiding: str | None)` — PRD §40.4's `CASE-FWC` row requires *"matter/section/bench metadata"*
     and PRD §6.4 requires *"Fair Work Commission, including Full Bench decisions"*.
   - `authority_record(facts) -> Mapping[str, object]` shaped for PRD §35.2 `authority`.
   - **No function returns "binding"/"persuasive".** A module-level docstring states that PRD §9.2
     bullet 2 is `FND-10`'s, with the reason (bindingness is relative to the asking court) so a
     cold-starting Builder does not add it here.

6. **`treatment.py` — the evidence-backed relation API (D2–D5). This is the load-bearing module.**
   - `TREATMENT_TYPES: frozenset[str]` = the six PRD §9.2 treatment relationships —
     `APPEAL`, `AFFIRMS`, `REVERSES`, `OVERRULES`, `DISTINGUISHES`, `FOLLOWS` — and `CITATION_TYPE`
     = `CITES`, with the module-level invariant `CITES not in TREATMENT_TYPES` asserted at import.
     Values are resolved from the contract `relation_type` enum; a missing value is sub-PRD **Q1**'s
     writeback, not a local constant.
   - `EvidenceSpan(node_stable_key: str, start: int, end: int, quoted_text_sha256: str)` (frozen) —
     no defaults, every field required.
   - `Derivation = Literal["OFFICIAL_STRUCTURED", "DETERMINISTIC_EXTRACTION"]` — exactly PRD §9.3's
     first two bullets. `MODEL_SUGGESTED` is deliberately **not** a member.
   - `assert_treatment(*, from_ref: DocumentRef, to_ref: DocumentRef, treatment: str,
     evidence: EvidenceSpan, derivation: Derivation, parser_version: str) -> NodeRelationRecord`
     — the **only** way to produce a treatment relation. It raises:
     `TreatmentEvidenceRequiredError` if `evidence` is falsy or any field empty;
     `ModelSuggestedTreatmentError` if `derivation` is `"MODEL_SUGGESTED"` or any non-member
     (**D5**, PRD §9.3);
     `TreatmentTypeError` if `treatment` is `CITES` or outside `TREATMENT_TYPES` (**D3**);
     `TreatmentDirectionError` if `from_ref.decision_date < to_ref.decision_date` — a court cannot
     treat a judgment that did not yet exist (PRD §9.2 *"Unconfirmed **later** treatment"*).
   - `record_citation(*, from_ref, to_ref, evidence: EvidenceSpan, parser_version: str)
     -> NodeRelationRecord` — always `relation_type = CITES`; identical evidence discipline.
   - **No upgrade path exists.** There is no `upgrade_to_treatment`, no `set_relation_type`, no
     mutable field: `NodeRelationRecord` is frozen (`CRPS-01`) and this module exports no function
     that takes a relation and returns a different `relation_type`. A test asserts the module's
     public surface contains no such name (**D3**).
   - `verify_evidence_span(span: EvidenceSpan, nodes: Mapping[str, NodeVersionRecord]) -> None` —
     resolves the span against the emitting document's nodes and asserts
     `sha256(node.canonical_text[start:end]) == span.quoted_text_sha256`; an unresolvable span raises
     `EvidenceUnresolvedError` and produces the `TREATMENT_EVIDENCE_UNRESOLVED` BLOCKING finding.
     Every relation is verified before emission — "with evidence" is checked, not declared.
   - `treatment_status(from_key: str, to_key: str, relations: Iterable[NodeRelationRecord]) -> str`
     returns the evidenced treatment when exactly one exists, `TREATMENT_CONFLICTING` when two
     evidenced treatments disagree, and **`TREATMENT_NOT_CONFIRMED` in every other case, including
     when only `CITES` relations exist and when the relation list is empty** (**D4**, PRD §9.2).
     There is no argument that suppresses the default.
   - `resolve_citations(matches: Iterable[CitationMatch], *, resolver: Callable[[NeutralCitation],
     DocumentRef | None], from_ref, emitting_nodes, parser_version) -> CitationOutcome` returning
     `(relations, unresolved: Sequence[NeutralCitation])`. Unresolved targets produce **no relation**
     (**D9**) and are returned for the run report and the group's `known_gaps`.

7. **`events.py` — case `LegalEvent`s with the same evidence discipline.**
   - `case_event(*, document_key: str, event_type: str, event_date: str,
     effective_date: str | None, evidence: EvidenceSpan | None, derivation: Derivation,
     target_version_label: str | None, metadata: Mapping[str, object]) -> LegalEventRecord`.
     `evidence` may be `None` **only** when `derivation == "OFFICIAL_STRUCTURED"` and the metadata
     names the official field it came from (`official_field`); otherwise it is required. PRD §15.2:
     *"Legal status MUST be derived from evidenced LegalEvents."*
   - The event vocabulary this module needs — decision handed down, appeal lodged, appeal allowed,
     appeal dismissed, special leave granted, special leave refused, decision corrected, decision
     withdrawn or suppressed — is **reconciled with `FND-03`'s `event_type` enum, not forked**
     (sub-PRD **Q1**; PRD §15.1 already names *"appeal"* as a `LegalEvent` class). Reconciliation is
     an acceptance item; a missing value is a docs PR against `FND-03`.
   - `DECISION_WITHDRAWN_OR_SUPPRESSED` is the PRD §40.8 item 3 deletion/unavailability path for
     judgments (sub-PRD **D14**): the prior version is retained, the event records the official
     removal, and no re-identification is attempted.

8. **`validation.py` — case-specific `ValidationFindings` for every adapter's `validate()`.**
   `case_validation(candidate, prior) -> ValidationFindings` (`INGF-01` deliverable 3 types) covering,
   each with severity and a fixture: duplicate paragraph number (`BLOCK`); paragraph round-trip
   failure (`BLOCK`); unresolved evidence span (`BLOCK`); treatment direction invalid (`BLOCK`);
   missing neutral citation where the group declares the court publishes one (`FLAG`); weak identity
   basis (`FLAG`); decision date after `retrieved_at` (`BLOCK`); unresolved citation targets above a
   per-group ratio (`FLAG`, feeding **D9**); overlapping effect intervals for one document
   (`BLOCK`, PRD §35.2). Severities use `INGF-01`'s `Literal["BLOCK", "FLAG", "INFO"]`; the mapping
   to PRD §40.9 (*"Critical identity/time/citation … failures block release"*) is documented per code.

9. **`failures.py`.** `register_failure_codes("caselaw", …)` (`INGF-01` deliverable 10) with a
   non-empty **operator action** for each: `CASE_CITATION_UNPARSEABLE`, `CASE_IDENTITY_WEAK`,
   `CASE_DUPLICATE_PARAGRAPH`, `CASE_PARAGRAPH_ROUNDTRIP_FAILED`, `CASE_DATE_INCONSISTENT`,
   `CASE_CITATION_TARGET_UNRESOLVED`, `CASE_SUPPRESSED_OR_WITHDRAWN`,
   `TREATMENT_EVIDENCE_UNRESOLVED`, `TREATMENT_DIRECTION_INVALID`,
   `TREATMENT_MODEL_SUGGESTED_REJECTED`, `TREATMENT_CONFLICTING`.

10. **`README.md` — the authoring guide for the twelve adapter Builders** (cold-start requirement,
    the same role `INGF-09`'s guide plays for the framework). Contains: the import form resolved for
    sub-PRD **Q2**; a complete worked example of a `CASE-*` `adapter.py` implementing PRD §40.7's
    eight boundaries over one synthetic judgment; the paragraph/identity rules; the treatment rules
    with the four exceptions and why each exists; the "record fixtures, never author them" rule
    (**D12**); the "official publishers only" rule (**D13**); the `known_gaps` obligation for
    unresolved citations (**D9**); and a pointer to `INGF-09`'s conformance guide for the twelve DoD
    items. A doc test asserts every public symbol of deliverables 2–9 appears in it.

11. **Negative-control suite** — for each guarantee, a test that it **fails** when attacked:
    treatment without evidence; treatment with an evidence span that does not hash-match; treatment
    with `derivation="MODEL_SUGGESTED"`; treatment with `relation_type="CITES"`; a later-case
    treatment asserted backwards in time; an attempt to mutate a returned `NodeRelationRecord`; a
    `treatment_status()` call with only `CITES` relations (must be `TREATMENT_NOT_CONFIRMED`); a
    duplicate paragraph number; a corrupted `text_hash`. A guarantee that cannot fail is not a
    guarantee.

12. **Docstring provenance.** Every public symbol cites the PRD section that fixes it (`§9.2`, `§9.3`,
    `§15.1`, `§15.2`, `§15.3`, `§35.2`, `§40.4`, `§40.8`). A cold-starting Builder must be able to
    read the contract without this ticket.

## Acceptance checklist (classified)

- [ ] `[machine]` `assert_treatment()` raises `TreatmentEvidenceRequiredError` when `evidence` is
      absent or any of its four fields is empty — the mechanical form of PRD §9.2 *"MAY be asserted
      only with evidence"* (deliverable 6).
- [ ] `[machine]` `assert_treatment()` raises `EvidenceUnresolvedError` when the span does not
      hash-match the emitting document's node text; evidence is verified, not declared (PRD §9.3
      *"exact source evidence and parser version are retained"*).
- [ ] `[machine]` `assert_treatment(derivation="MODEL_SUGGESTED")` — and any other non-member value —
      raises `ModelSuggestedTreatmentError`, and no adapter-reachable path emits a `MODEL_SUGGESTED`
      relation (PRD §9.3; sub-PRD **D5**).
- [ ] `[machine]` `assert_treatment(treatment="CITES")` raises `TreatmentTypeError`, and the module's
      public surface contains no `upgrade`/`set_relation_type`/mutating function — asserted by
      introspection over `dir(treatment)` (PRD §9.2 *"A citation alone establishes `CITES`, not
      treatment"*; sub-PRD **D3**).
- [ ] `[machine]` `record_citation()` always yields `relation_type == CITES`, and `CITES` is not in
      `TREATMENT_TYPES` (deliverable 6).
- [ ] `[machine]` `treatment_status()` returns `TREATMENT_NOT_CONFIRMED` for: an empty relation list;
      a list containing only `CITES`; and a list whose relations concern other case pairs — with no
      argument able to suppress the default (PRD §9.2 *"Unconfirmed later treatment MUST display
      `TREATMENT_NOT_CONFIRMED`"*; sub-PRD **D4**).
- [ ] `[machine]` `treatment_status()` returns `TREATMENT_CONFLICTING` for two evidenced treatments
      that disagree, and never silently picks one (PRD §9.2).
- [ ] `[machine]` `assert_treatment()` raises `TreatmentDirectionError` when the asserting judgment
      predates its target (PRD §9.2 *"Unconfirmed **later** treatment"*).
- [ ] `[machine]` `resolve_citations()` emits **no** relation for an unresolved target and returns it
      in `unresolved`; a dangling `to_ref` is impossible (sub-PRD **D9**; PRD §35.2).
- [ ] `[machine]` Returned `NodeRelationRecord`/`LegalEventRecord` instances are frozen: attribute
      assignment raises (PRD §35.8 invariant 5; `CRPS-01`).
- [ ] `[machine]` Every emitted relation carries a non-empty `parser_version` containing
      `CASELAW_VERSION` and the adapter version (PRD §9.3, §35.2).
- [ ] `[machine]` `build_judgment_nodes()` satisfies the exact-text round-trip for every node, keeps
      `ordinal` contiguous among siblings, sets `display_label` `"[45]"` with `stable_node_key`
      `"para/0045"`, and recomputes every `text_hash` (PRD §15.3, §40.8 item 5; sub-PRD **D7**).
- [ ] `[machine]` A duplicate paragraph number produces a `BLOCK` `CASE_DUPLICATE_PARAGRAPH` finding
      and no merged node (deliverable 4).
- [ ] `[machine]` Unnumbered material gets `seq/<ordinal>` keys and never enters the `para/` space
      (deliverable 4).
- [ ] `[machine]` `case_identity()` is deterministic across two runs and stable across two versions of
      one judgment; different judgments never collide; `OFFICIAL_URL_PATH` sets `weak=True` and emits
      `CASE_IDENTITY_WEAK` (PRD §40.8 item 3).
- [ ] `[machine]` `parse_neutral_citation()` accepts the `[YYYY] COURT N` form for registered court
      codes and returns `None` for an unregistered code; `iter_citations()` returns character offsets
      that index the source text exactly (PRD §17.1 exact identifiers, `SRCH-004`).
- [ ] `[machine]` `register_court_codes()` is idempotent for identical facts and raises
      `DuplicateCourtCodeError` for conflicting ones — no shared court file exists anywhere in the
      repository (asserted by a scan; sub-PRD rejected alternatives).
- [ ] `[machine]` `SectionRole` defaults to `UNCLASSIFIED` and is assignable only from an explicit
      marker map; no prose heuristic exists (PRD §9.2 *"where the source permits"*).
- [ ] `[machine]` `authority.py` exports no function returning binding/persuasive status, and
      `court_level`/`authority_type` values outside the contract enum raise (sub-PRD **D8**, **Q1**).
- [ ] `[machine]` `case_event()` requires an `EvidenceSpan` unless `derivation ==
      "OFFICIAL_STRUCTURED"` with a named `official_field` (PRD §15.2).
- [ ] `[machine]` **Enum reconciliation**: every `relation_type`, `confidence_state`, `event_type`,
      `node_kind`, `document_type`, `authority_type` and `court_level` value this library emits exists
      in the `CRPS-01`/`FND-03` contract enums; the test fails loudly and names the missing value
      rather than defining it locally (sub-PRD **Q1**).
- [ ] `[machine]` **Negative controls** (deliverable 11): each of the nine attacks fails as specified;
      a mutation that makes any one of them pass is a defect in the guarantee, not the test.
- [ ] `[machine]` No module under `_shared/caselaw/**` imports `requests`, `httpx`, `urllib`,
      `socket`, `sqlite3` or a document-parser library — `INGF-01` deliverable 11's architecture scan
      passes over this tree (PRD §37.4, §40.7).
- [ ] `[machine]` No path under `evals/gold/**` is opened during the suite (plan §9 **R9**, PRD §45.1
      item 6, §14.3).
- [ ] `[machine]` The whole suite runs offline with no outbound network (session fixture asserts it).
- [ ] `[machine]` The authoring guide documents every public symbol of deliverables 2–9 — doc test
      (deliverable 10; cold-start requirement for twelve Builders).
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, PRD §20.3 *"Rust and Python builds/tests"*).
- [ ] `[machine]` `pnpm test` green — standing suite item; this ticket adds no TypeScript, so the
      expectation is "unchanged and green" (plan §1.1, PRD §45.3).
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (**SRCH-004**, **SRCH-005**;
      supports **SRCH-003**) and UAT IDs (**none** — no PRD §41.2 row exercises case-law primitives
      directly; the case-treatment evidence surfaces through `GOLD-12`); schema/API/event
      compatibility (fixes the public API twelve adapter tickets are written against — a change after
      merge requires re-publishing all twelve, `publish-tickets.mjs --sync`); tenant/PII/security
      impact (none — public official judgment text only; officially published anonymisation is
      preserved and never reversed, sub-PRD **D14**); source/licence impact (none directly — licence
      decisions are `INGF-04`'s per group); cost/memory/latency impact (none — pure library);
      rollback path (delete the directory; nothing depends on it until `SCAS-02`); known gaps
      (sub-PRD Q1, Q2, Q3).
- [ ] `[human]` **Founder/Architect review that the treatment API actually discharges PRD §9.2 and
      §9.3** — whether the four exceptions and the computed default are *sufficient* (as opposed to
      present) is irreducibly a judgment call, and PRD §43.4 item 5 puts case-treatment failures in
      the founder review queue. This library is the gate for twelve adapters and 40 `GOLD-12`
      evaluation cases.
- [ ] `[human]` If sub-PRD **Q1** resolves by adding values to `FND-03`, the docs PR against
      `FND-03` is linked from this PR and `docs/prd/08-sources-cases/README.md` Q1 is updated in the
      same change (writeback obligation, plan §1.1).
- **No `[fixture]` criteria** — this ticket replays no recorded official source data. Its inputs are
  synthetic judgments authored inside its own tests, which is legitimate precisely because they are
  *not* presented as official responses (sub-PRD **D12** binds the adapter tickets, which do replay
  recorded data). Declared absent deliberately.

## Test plan

Harness: `pytest` via `uv run pytest pipelines/adapters/_shared/caselaw/tests -q`, fully offline. Copy
the construction pattern from `pipelines/ingestion/tests/conformance/` (`INGF-09`): synthetic inputs
in a temp directory, one negative control per guarantee, no network fixture.

1. `uv sync --frozen && uv run pytest pipelines/adapters/_shared/caselaw/tests -q`.
2. **`test_treatment_evidence.py`** — the four `assert_treatment()` exceptions, one test each, plus
   the hash-mismatch case and the happy path for all six `TREATMENT_TYPES`. Assert the returned record
   carries `evidence_start`/`evidence_end`/`derivation`/`parser_version`/`confidence_state`.
3. **`test_treatment_status.py`** — the `TREATMENT_NOT_CONFIRMED` default over: empty list, `CITES`
   only, unrelated pairs, and one evidenced treatment; then `TREATMENT_CONFLICTING` for two
   disagreeing evidenced treatments. This is the test `GOLD-12` mirrors at answer level.
4. **`test_no_upgrade_path.py`** — introspects `treatment.py`'s public names and asserts none matches
   `upgrade|set_|mutate|promote`; asserts `NodeRelationRecord` attribute assignment raises.
5. **`test_citations.py`** — parsing, offsets, pinpoint ranges (`[45]`, `[45]–[47]`, `[45], [52]`),
   unregistered court code → `None`, and the court-code registry rules.
6. **`test_paragraphs.py`** — round-trip over a synthetic three-part judgment with 60 numbered
   paragraphs, unnumbered coversheet material and one duplicate number; asserts keys, labels,
   ordinals, hashes and the `BLOCK` finding.
7. **`test_identity.py`** — determinism, stability across two versions, collision-freedom over 100
   synthetic judgments, and the weak-basis flag.
8. **`test_events.py`** — evidence requirement, the `OFFICIAL_STRUCTURED` exception, and the
   suppression/withdrawal path retaining the prior version.
9. **`test_enum_reconciliation.py`** — imports the `CRPS-01` contract enums and asserts every value
   this library emits exists there; on failure the assertion message names the missing value and
   points at sub-PRD **Q1**.
10. **`test_architecture.py`** — reuses `INGF-01`'s scan over `_shared/caselaw/**`; asserts no HTTP,
    parser or sqlite import and no `evals/gold/**` access.
11. **`test_guide.py`** — the authoring-guide doc test.
12. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus: run `test_treatment_evidence.py`, `test_treatment_status.py` and
`test_no_upgrade_path.py` first. If any attack in deliverable 11 succeeds — an evidence-free
treatment, a `CITES` upgraded in place, a `MODEL_SUGGESTED` derivation accepted, or a
`treatment_status()` that returns anything but `TREATMENT_NOT_CONFIRMED` for an unevidenced pair —
PRD §9.2/§9.3 are not enforced and the ticket is not done, regardless of the rest. Second focus:
confirm the paragraph round-trip is byte-exact (PRD §15.3 citations depend on it) and that no shared
court/enum file was introduced anywhere outside this directory.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (a docs PR/MR,
a changelog line in `docs/prd/08-sources-cases/README.md`, then `publish-tickets.mjs --sync`), and
only then change code. Silent divergence is an incomplete ticket; the ticket wins over any
implementation plan (CLAUDE.md, issue #53). Because twelve tickets are `blocked_by` this one, a change
here after merge also requires re-publishing all twelve — say so in the PR.

**Foreseeable frictions and their exact writeback targets:**

1. **A `relation_type`, `confidence_state` or `event_type` value PRD §9.2/§9.3/§15.1 requires is
   missing from `FND-03`** (sub-PRD **Q1**) → open a docs PR against
   `docs/prd/00-foundation/tickets/FND-03-canonical-enums-and-opaque-id-conventions.md` adding the
   value, update `docs/prd/08-sources-cases/README.md` Q1, re-publish `FND-03`, **then** emit it.
   Never define the value locally: plan §4.2 gives canonical enums exactly one owner, and PRD §35.1
   generates the database `CHECK` lists from them, so a local enum produces rows the corpus schema
   rejects.
2. **`INGF-01`'s loader does not make `from _shared.caselaw import …` resolvable** (sub-PRD **Q2**)
   → record the mechanism that does work in `_shared/caselaw/README.md` and open a docs PR against
   `docs/prd/05-ingestion-framework/tickets/INGF-01-adapter-interface-and-versioned-intermediate-records.md`
   (deliverable 9) plus `docs/prd/08-sources-cases/README.md` Q2. Never add a per-adapter `sys.path`
   hack: twelve copies of an import workaround is exactly the divergence plan §9 **R2** forbids.
3. **`FND-10` needs an evidenced reversal to change `legal_status`** (sub-PRD **Q3**, decision
   **D6**) → this is a cross-module contract change: update `docs/prd/08-sources-cases/README.md`
   D6/Q3 and open a docs PR against `FND-10` **before** any status-writing code exists here. Emitting
   a status change from an adapter without that agreement would let a treatment silently rewrite
   corpus status — precisely what PRD §9.3 forbids for unevidenced relations and what PRD §15.2
   ("legal status derived from evidenced LegalEvents") constrains for evidenced ones.
4. **A court's structured "cases citing this" data looks like treatment** → it is `CITES` only
   (PRD §9.2). If a court publishes an explicit official treatment field (some do publish
   "considered/followed/overruled" annotations), that is `derivation="OFFICIAL_STRUCTURED"` with the
   official field named in the evidence metadata — and the adapter ticket must record which field, in
   its own `registry.yaml`. If no evidence span can be produced because the assertion lives in a
   database field rather than text, raise it here: the writeback is an `EvidenceSpan` variant in this
   ticket's deliverable 6, agreed in `docs/prd/08-sources-cases/README.md` D2, **not** a nullable
   evidence field.
5. **A twelfth-hour temptation to infer treatment from language patterns** ("we respectfully decline
   to follow…") → that is deterministic extraction and is *permitted* by PRD §9.3 **only** when the
   exact source evidence and parser version are retained. It must therefore go through
   `assert_treatment()` with a real span, and the pattern set must live in the adapter that owns that
   court's prose, not in this shared library — otherwise one regex change silently rewrites the
   treatment graph for twelve jurisdictions. If a genuinely universal pattern emerges, add it here
   with its own negative controls and re-publish the twelve dependent tickets.
6. **The paragraph model does not fit a court that numbers by page or by section** → extend
   `paragraph.py` with an explicitly named alternative key space (`page/NNNN`) in **this** ticket and
   record it in `docs/prd/08-sources-cases/README.md` D7. Do not let an adapter invent its own key
   format: `stable_node_key` is what makes PRD §15.3's historical links survive a later release
   (`SRCH-005`).
7. **A shared court-code or enum file starts to look convenient** → forbidden. Twelve concurrent
   tickets writing one file is the contention plan §2.1 **A2** and plan §9 **R2** exist to prevent.
   Use `register_court_codes()`.

**Escalation rule.** If PRD §9.2/§9.3 cannot be made mechanically enforceable — if any adapter-side
mechanism can assert a treatment without evidence, upgrade a `CITES`, emit a `MODEL_SUGGESTED`
relation into legal status, or bypass the `TREATMENT_NOT_CONFIRMED` default — stop and escalate for
re-review. That overturns two MUST-level PRD sections, PRD §27's stated mitigation for the
"Case treatment is incomplete" risk, and the basis of `GOLD-12`'s 40 evaluation cases. An API that
can be bypassed is worse than none, because it produces evidence that is not evidence.
