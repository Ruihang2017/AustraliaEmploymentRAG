---
id: SLEG-01
title: Legislation adapter primitives (point-in-time, events, title allowlist)
module: 06-sources-legislation
lane: 06-sources-legislation
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INGF-09]
blocks: [SLEG-02, SLEG-03, SLEG-04, SLEG-05, SLEG-06, SLEG-07, SLEG-08, SLEG-09, SLEG-10, SINS-01, SFUT-01]
---

# SLEG-01 — Legislation adapter primitives (point-in-time, events, title allowlist)

Implements PRD §40.2 (wave 1 legislation registers), PRD §6.6 (historical coverage), PRD §15.2
(temporal model) and PRD §35.2 (corpus identity/version tables) <SRCH-002, SRCH-003, SRCH-005> — no
ADR — the decision is already made in PRD §15.2 and §40.2; this is build ticket 1 of 10 against it.
Parent sub-PRD: [06-sources-legislation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `INGF-09` — Adapter conformance kit (the twelve-item DoD), module `05-ingestion-framework`
(`docs/prd/05-ingestion-framework/tickets/INGF-09-adapter-conformance-kit-the-twelve-item-dod.md`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a contract PRD
§15.2, §35.2 and §40.7 already fix — not a new subsystem decision.

## Background + basis

**PRD §40.2 mandates nine legislation registers and scopes them.** The table's nine rows (`LEG-CTH`,
`LEG-NSW`, `LEG-VIC`, `LEG-QLD`, `LEG-WA`, `LEG-SA`, `LEG-TAS`, `LEG-ACT`, `LEG-NT`) differ in
endpoint and format but ask for the same four capabilities — *structured discovery; versions; node
hierarchy; events* — and the section closes with the scoping rule this ticket must make mechanical:

> "Wave 1 is scoped to employment-related titles and their necessary amending, commencement,
> transitional and interpretation instruments—not every unrelated law in each register. **A
> maintained subject/title allowlist plus dependency expansion records why each title is included.**"

**PRD §15.2 fixes the temporal model and forbids scraped status.**

> "The system MUST distinguish: publication time; effective time; retrieval time; system
> knowledge/recorded time."
>
> "**Legal status MUST be derived from evidenced LegalEvents.** Cached status fields MAY improve
> performance but are not the authoritative history."

**PRD §6.7 fixes the status vocabulary** — exactly seven values: `IN_FORCE`, `ENACTED_NOT_IN_FORCE`,
`BILL_NOT_ENACTED`, `DRAFT_OR_CONSULTATION`, `REPEALED`, `SUPERSEDED`, `STATUS_UNCONFIRMED`. And:
"Default answers MUST use only material in force at the requested legal date unless the user
explicitly requests historical, future or proposed material."

**PRD §6.6 fixes the point-in-time window:**

> "At MVP launch, point-in-time retrieval MUST support: 2026–27; 2025–26; 2024–25.
> Case law and still-operative instruments MUST NOT be excluded solely because they are older than
> three financial years."

**PRD §35.2 fixes the shapes these primitives produce.** `document_version` carries
`version_label`, `publication_date`, `effective_from`, `effective_to`, `legal_status`, `retrieved_at`,
`content_hash`, `official_url` and is **immutable** with "non-overlap validation where versions
represent consolidated effect". `document_node` is unique on `(document_id, stable_node_key)`.
`node_relation` records "Renumber, replace, split, merge, amend, cite, interpret, apply and treatment
relations" with `evidence_node_version_id`, `evidence_start`, `evidence_end`, `derivation`,
`confidence_state` — and "`MODEL_SUGGESTED` cannot support definitive status". `legal_event` carries
`event_type`, `event_date`, `effective_date`, `evidence_node_version_id`, `target_version_id`.

**PRD §15.3 fixes node identity:** "Provision labels are version-specific display values, not
permanent IDs. Node lineage supports renumber/replacement/split/merge. … Citations MUST target
DocumentVersion + NodeVersion + exact offsets + source snapshot, never a SearchChunk."

**Why this ticket is first, and why it must not become a parser.** Plan §9 **R2** is the standing
warning:

> "**Adapters need more shared code than `_shared/{legislation,rates,caselaw,future}` provides.**
> State registers differ enough that a common parser is tempting; a shared file written by 52
> concurrent tickets is the worst contention in the repo. … The shared primitive stays owned by
> `SLEG-01`/`SINS-01`/`SCAS-01`/`SFUT-01`; a new sibling ticket is added there and the adapters are
> `blocked_by` it. **Never copy the helper into two adapter directories.**"

So this ticket owns the *legal* machinery (time, status, lineage, scope) that must be identical
across nine registers, and deliberately owns **no** HTML/XML/PDF parsing, because parsing is what
genuinely differs per register and belongs inside each adapter.

**The surface is a cross-module contract.** Plan §6.2: `SLEG-01 --> SLEG-02 & … & SLEG-10 & SINS-01 &
SFUT-01`. `SINS-01` (`pipelines/adapters/_shared/rates/**`, module `07`) builds date-versioned rate
facts on this temporal model; `SFUT-01` (`pipelines/adapters/_shared/future/**`, module `10`) builds
the current-vs-future separation on this status derivation. Eleven tickets across three modules are
written against the names below without reading this module's source.

**What the framework already provides — do not rebuild it.** `INGF-01` fixes the eight PRD §40.7
boundaries as the `SourceAdapter` protocol, the record re-exports (`DocumentVersionRecord`,
`NodeVersionRecord`, `LegalEventRecord`, `NodeRelationRecord`, `SourceArtifactRecord`), `AdapterMeta`,
`AdapterRunContext`, `IntermediateRecordEnvelope`, the adapter-loading convention and
`register_failure_codes`. `INGF-02` owns HTTP; `INGF-06` owns parsing; `INGF-05` owns quarantine, run
accounting and the §40.9 anomaly rules; `INGF-07` owns `registry.yaml` and the 52-group roster;
`INGF-04` owns `licence.yaml`; `INGF-09` owns the twelve-item conformance kit and the replay
harness. This ticket adds legal-domain primitives **on top of** those, and imports rather than
redefines every one of them.

**Carried caveats, documented not re-litigated.**
- The import root and packaging of the `pipelines/adapters` member come from `FND-01`'s committed
  `pipelines/adapters/pyproject.toml` (sub-PRD **D2**, open question **L2**). This ticket reads it and
  follows it.
- `pipelines/adapters/pyproject.toml` is shared-additive across modules `06`–`10` (sub-PRD **D3**,
  open question **L1**). This ticket is its first writer in the adapter tree.
- Per-source anomaly thresholds are initial defaults until each adapter has a representative baseline
  (plan §8 **Q9**, sub-PRD **L3**); this ticket declares no thresholds of its own.

## Goal

Create the shared legislation primitives under `pipelines/adapters/_shared/legislation/**`: a
point-in-time version model with a consolidated-series non-overlap validator, an evidenced
`LegalEvent` vocabulary and the PRD §6.7 status-derivation function, node-lineage helpers for
renumber/replace/split/merge, the `titles.yaml` subject/title-allowlist schema with dependency
expansion and recorded inclusion reasons, a PRD §6.6 financial-year coverage helper, a reusable set of
legislation `ValidationFinding`s, and the `legislation` failure-code registrations — such that
`uv run pytest pipelines/adapters/_shared/legislation` proves each rule with property and table tests
and nine sibling adapters (plus `SINS-01` and `SFUT-01`) can be built against these names without
reading this ticket.

## Non-goals

- **No source adapter, no `registry.yaml`, `allowlist.yaml`, `licence.yaml`, `titles.yaml` *content*,
  and no HTTP request to any register.** All nine groups belong to `SLEG-02`…`SLEG-10`. This ticket
  ships schemas and pure logic with synthetic fixtures only.
- **No HTML/XML/PDF parsing, OCR or text extraction.** `INGF-06` owns the isolated parser host; the
  per-register parsing differences are exactly what each adapter ticket owns. Adding a parser here
  would rebuild plan §9 **R2**'s failure.
- **No HTTP, retry, artifact storage, hashing, licensing, quarantine or run accounting** — PRD §40.7
  assigns all of it to "shared framework code": `INGF-02`…`INGF-05`.
- **No changes to the `SourceAdapter` protocol, the record types or the ports** — `INGF-01`
  (and `CRPS-01` for the record payloads, plan §2.1 **A4**). A shape that does not fit is a writeback,
  not a local widening.
- **No Bills, explanatory memoranda, drafts, consultations or the current-vs-future separation
  model** — `10-sources-future` / `SFUT-01` (sub-PRD **D6**). This ticket defines
  `ENACTED_NOT_IN_FORCE` derivation because PRD §15.2 requires status to follow the evidence, and
  stops there.
- **No rate/threshold fact model** — `07-sources-instruments` / `SINS-01`, which is `blocked_by` this
  ticket.
- **No case-law citation, court level, paragraph identity or treatment model** —
  `08-sources-cases` / `SCAS-01` (`_shared/caselaw`).
- **No chunking, tiering, embedding or corpus write of any kind.** PRD §40.7: "The adapter never
  writes active corpus tables directly." `CRPS-03`/`CRPS-04` own chunking and tiering.
- **No evaluation cases or gold data** — `21-evaluation-600`. This module never reads `evals/gold/**`
  (plan §9 **R9**, PRD §45.1 item 6).
- **No tenant, customer or app-database concept.** PRD §39.1: "Python pipeline code never imports
  tenant/customer packages." Standing rule, not a deferral.

## File-scope (write-owns)

- `pipelines/adapters/_shared/legislation/**` — the package source, its committed JSON Schemas
  (`schema/titles.schema.json`), its `README.md` (the consumer guide) and its tests under
  `pipelines/adapters/_shared/legislation/tests/**` (plan §1.1: "Unit/integration tests live inside
  the owning package … and belong to that module's tickets").
- `pipelines/adapters/pyproject.toml` — **shared-additive, append-only** across modules `06`–`10`
  (sub-PRD **D3**, open question **L1**). This ticket is its first writer in the adapter tree: it
  reads what `FND-01` committed, appends the `_shared` package declaration only if `FND-01` declared
  none, and appends no third-party dependency. Conflicts are resolved by re-running `uv lock`, never
  by hand-merge (plan §1.1, PRD §44.3).
- Does not touch: `pipelines/adapters/leg-{cth,nsw,vic,qld,wa,sa,tas,act,nt}/**` — `SLEG-02`…`SLEG-10`
  (same module, wave 2).
- Does not touch: `pipelines/adapters/_shared/rates/**` — `07-sources-instruments` (`SINS-01`);
  `pipelines/adapters/_shared/caselaw/**` — `08-sources-cases` (`SCAS-01`);
  `pipelines/adapters/_shared/future/**` — `10-sources-future` (`SFUT-01`); every other
  `pipelines/adapters/<group>/**` directory — modules `07`–`10`.
- Does not touch: `pipelines/ingestion/**` — `05-ingestion-framework` (`INGF-01`…`INGF-09`).
- Does not touch: `pipelines/corpus-builder/**`, `pipelines/embeddings/**`,
  `schemas/corpus-manifest/**` — `04-corpus-contract`.
- Does not touch: `pipelines/evaluation/**`, `evals/**`, `schemas/evaluation/**` —
  `21-evaluation-600`.
- Does not touch: `packages/**`, `apps/**`, `services/**`, `infra/**`, `schemas/{openapi,events}/**`,
  `tests/**`, `.github/workflows/**`, root manifests and lockfiles.

**Serial safety.** This is the **first decomposition** of `docs/PRD.md` (plan §1 header: `phase: 1`,
`existingFiles: ['.gitkeep']`); nothing is merged and no ticket is in flight, so no prior ticket has
touched these paths. The only earlier writer anywhere under `pipelines/adapters/` is `FND-01`, which
creates the member manifest and (per its own file-scope) at most one empty entry file — `INGF-01`'s
architecture test is written to "tolerate an absent `pipelines/adapters/` directory (it is created by
module `06`)". This ticket is wave 1 of its module and runs alone: all nine sibling `SLEG` tickets are
`blocked_by` it, and `SINS-01`/`SFUT-01` are too, so no ticket that writes under
`pipelines/adapters/**` can be concurrent with it. Sibling adapter scopes are disjoint by
construction — one directory per PRD §40.2 group id, and this ticket writes none of them.

## Deliverables

Names below are **binding**: eleven tickets across three modules (`SLEG-02`…`SLEG-10`, `SINS-01`,
`SFUT-01`) are written against them without reading this source. Internal organisation inside the
package is the Builder's choice; the public surface is not.

1. **Package skeleton and provenance.** `pipelines/adapters/_shared/legislation/__init__.py`
   exporting `LEGISLATION_PRIMITIVES_VERSION: str` (`"0.1.0"`) and re-exporting the public names of
   deliverables 2–9 so a consumer needs one import line. Read the packaging style from the committed
   `pipelines/adapters/pyproject.toml`; if it declares no package, append `_shared` as the sole
   declared package and record the choice in the module docstring against sub-PRD **D2**/**L2**.
   Every public symbol's docstring cites the PRD section that fixes it (`§6.6`, `§6.7`, `§15.2`,
   `§15.3`, `§35.2`, `§40.2`).

2. **`_shared.legislation.timeline` — the point-in-time model.**
   - `EffectInterval(effective_from: str, effective_to: str | None)` — legal dates `YYYY-MM-DD`
     (PRD §35.1), `effective_to = None` meaning open-ended. `contains(as_at: str) -> bool` uses
     **closed-open** semantics (`effective_from <= as_at < effective_to`), stated in the docstring as
     the module's single convention so nine adapters cannot each pick one.
   - `resolve_as_at(versions: Sequence[DocumentVersionRecord], as_at: str) -> DocumentVersionRecord |
     None` — the version in effect at a legal date; deterministic and total (returns `None`, never
     guesses).
   - `assert_no_overlap(versions, *, series: str) -> Sequence[ValidationFinding]` — PRD §35.2's
     "non-overlap validation where versions represent consolidated effect". Two consolidated versions
     whose intervals intersect produce a **BLOCK** finding with code `EFFECT_INTERVAL_OVERLAP`
     (`INGF-05`'s code, reused — see deliverable 9), because PRD §40.9 makes "any overlapping effect
     interval for a supposedly consolidated series" a critical time failure.
   - `assert_no_gap(versions, *, window: FinancialYearWindow) -> Sequence[ValidationFinding]` — a hole
     inside the PRD §6.6 window produces a **FLAG** finding `COVERAGE_GAP` carrying the missing
     interval, so `SLEG-02`…`SLEG-10` can convert it into a `known_gaps` row rather than discover it
     at release.
   - `close_prior_version(prior, new_effective_from) -> DocumentVersionRecord` — returns a **new**
     record with `effective_to` set; it never mutates (PRD §35.8 invariant 5, PRD §35.2 "immutable").
   - The four PRD §15.2 times are kept distinct in the helper signatures: `publication_date` and
     `effective_from`/`effective_to` are legal dates; `retrieved_at` is the artifact's UTC timestamp;
     the system-knowledge time is the ingestion run's. A helper that conflates two of them is a defect
     — asserted by test.

3. **`_shared.legislation.events` — evidenced status events.**
   - `LegislationEventType` — a closed enum, exactly:
     `ASSENT`, `COMMENCEMENT`, `COMMENCEMENT_PROCLAIMED`, `AMENDMENT`, `REPEAL`, `SUNSET`,
     `REMADE`, `REPUBLICATION`, `COMPILATION_REGISTERED`, `AS_MADE_REGISTERED`, `DISALLOWANCE`,
     `RENUMBER`. Each member's docstring names the PRD §40.2 register capability or PRD §7 wave-1
     phrase it serves ("history, commencement, amendment and repeal"), so a tenth value is a
     deliberate change and not an accident.
   - `build_event(*, document_id, event_type, event_date, effective_date, evidence, target_version_id
     = None, metadata = None) -> LegalEventRecord` where `evidence: EventEvidence(node_version_id,
     start_offset, end_offset)`. **Evidence is mandatory**: constructing an event without a resolvable
     `evidence.node_version_id` raises `UnevidencedEventError`. Basis: PRD §35.2 `legal_event`
     carries `evidence_node_version_id`, and PRD §15.2 makes events the authority for status.
   - `event_date` (when the event was made/notified) and `effective_date` (when it takes legal effect)
     are separate arguments with no default relationship — PRD §35.2 lists both columns and PRD §15.2
     distinguishes publication from effective time. A helper that sets one from the other is a defect.

4. **`_shared.legislation.status` — PRD §6.7 derivation.**
   - `LegalStatus` — re-exported from `packages/contracts` via `CRPS-01`'s enum surface if one exists
     there; otherwise a closed local enum with exactly PRD §6.7's seven values in PRD order. Resolve
     by reading the merged `CRPS-01`/`FND-03` code — do **not** invent an eighth value, and do not
     silently duplicate an existing enum (see *Feedback obligation* 3).
   - `derive_status(events: Sequence[LegalEventRecord], *, as_at: str, version: DocumentVersionRecord)
     -> StatusDerivation` returning `(status, evidence_event_id, rationale)`. Rules, in this
     precedence order, each citing PRD §6.7:
     1. a `REPEAL`/`SUNSET` event whose `effective_date <= as_at` → `REPEALED`;
     2. a later version of the same consolidated series in effect at `as_at` → `SUPERSEDED`;
     3. a `COMMENCEMENT`/`COMMENCEMENT_PROCLAIMED` event whose `effective_date <= as_at`, with the
        version's interval containing `as_at` → `IN_FORCE`;
     4. an `ASSENT`/`AS_MADE_REGISTERED` event present but no commencement effective at `as_at` →
        `ENACTED_NOT_IN_FORCE`;
     5. otherwise → `STATUS_UNCONFIRMED`.
   - `BILL_NOT_ENACTED` and `DRAFT_OR_CONSULTATION` are **never** returned by this function; a
     docstring states that they are `SFUT-01`'s (sub-PRD **D6**) and a test asserts they are absent
     from the derivation's output range.
   - `StatusDerivation.evidence_event_id` is `None` **only** for `STATUS_UNCONFIRMED`; every other
     status must name the event that produced it (PRD §15.2). Asserted by property test.

5. **`_shared.legislation.nodes` — identity and lineage.**
   - `stable_node_key(path: Sequence[str]) -> str` — a deterministic key built from the document's
     structural path (e.g. `part/3/div/2/s/117/subs/2`), **not** from the display label, because
     PRD §15.3 says "Provision labels are version-specific display values, not permanent IDs".
     Normalisation rules (case, whitespace, separator, numeric padding) are fixed here so two
     registers cannot produce two conventions; the function is pure and total.
   - `NodeTree` builder over `INGF-01`'s `ParsedBlock` sequence producing `NodeVersionRecord`s with
     `parent_node_version_id`, `display_label`, `heading`, `canonical_text`, `ordinal`,
     `effective_from`/`effective_to` and `text_hash`. Structural invariants, each an assertion with a
     named finding: one root; no cycles; contiguous `ordinal`s among siblings; `text_hash`
     recomputable from `canonical_text`; offsets satisfying the exact-text round-trip
     (`parsed.text[start:end] == block text`) required by PRD §40.8 item 5 and PRD §15.3.
   - `diff_nodes(prior: Sequence[NodeVersionRecord], current: Sequence[NodeVersionRecord]) ->
     Sequence[NodeRelationRecord]` emitting `RENUMBER`, `REPLACE`, `SPLIT`, `MERGE` and `AMEND`
     relations (PRD §35.2 `node_relation.relation_type`, PRD §15.3 "Node lineage supports
     renumber/replacement/split/merge"). Every emitted relation carries
     `derivation="DETERMINISTIC_STRUCTURAL"` and `confidence_state="EVIDENCED"`; the function **never**
     emits `MODEL_SUGGESTED`, and a test asserts the string cannot be produced — PRD §35.2:
     "`MODEL_SUGGESTED` cannot support definitive status".

6. **`_shared.legislation.titles` — the subject/title allowlist (sub-PRD D5).** Committed JSON Schema
   at `schema/titles.schema.json` with `additionalProperties: false`; the file each adapter commits is
   `pipelines/adapters/<group-id>/titles.yaml`:

   ```yaml
   group_id: LEG-CTH
   subjects:                                  # PRD §6.2 (CTH) / §6.3 (states) topic keys
     - EMPLOYMENT_INDUSTRIAL
     - PAYROLL_TAX
     - LONG_SERVICE_LEAVE
   titles:
     - stable_source_key: C2009A00028
       canonical_title: Fair Work Act 2009
       document_type: ACT
       inclusion:
         reason: SUBJECT_MATCH               # SUBJECT_MATCH | DEPENDENCY_EXPANSION
         subject: EMPLOYMENT_INDUSTRIAL
         note: "PRD §6.2 — Fair Work Act, regulations and National Employment Standards"
     - stable_source_key: C2009L02356
       canonical_title: Fair Work Regulations 2009
       document_type: REGULATION
       inclusion:
         reason: DEPENDENCY_EXPANSION
         depends_on: C2009A00028
         dependency_kind: SUBORDINATE        # AMENDING | COMMENCEMENT | TRANSITIONAL |
                                             # INTERPRETATION | SUBORDINATE
         note: "PRD §40.2 — necessary subordinate instrument"
   ```

   - `SUBJECT_KEYS` — a closed set covering PRD §6.2's Commonwealth topics and PRD §6.3's eleven
     state/territory topics (`EMPLOYMENT_INDUSTRIAL`, `PAYROLL_TAX`, `LONG_SERVICE_LEAVE`,
     `PORTABLE_LSL`, `WHS_OHS`, `DISCRIMINATION_EO`, `WORKERS_COMPENSATION`, `LABOUR_HIRE`,
     `SURVEILLANCE_PRIVACY`, `WHISTLEBLOWING`, `CHILD_EMPLOYMENT`, `PUBLIC_SECTOR_EMPLOYMENT`,
     `MIGRATION_RIGHT_TO_WORK`, `SUPERANNUATION_PAYROLL_TAXATION`, `INTERPRETATION_GENERAL`).
   - `load_titles(group_dir) -> TitleAllowlist`, `TitleAllowlist.includes(stable_source_key) -> bool`,
     `TitleAllowlist.reason(stable_source_key) -> Inclusion`.
   - Loader invariants: `group_id` matches the directory name upper-cased; every
     `DEPENDENCY_EXPANSION` entry's `depends_on` resolves to another entry in the same file (no
     dangling parent) and the dependency graph is acyclic; every `SUBJECT_MATCH` entry's `subject` is
     in the file's declared `subjects`; `stable_source_key` values are unique. Each failure has its own
     code (deliverable 9).
   - `unexplained_titles(discovered, allowlist) -> Sequence[str]` — the discovery-side check that lets
     an adapter refuse to ingest a title with no recorded reason (PRD §40.2's "records why each title
     is included").

7. **`_shared.legislation.coverage` — PRD §6.6 financial years.**
   `FinancialYear` for Australian FY (1 July – 30 June) with `LAUNCH_FINANCIAL_YEARS: tuple[str, ...]
   = ("2024-25", "2025-26", "2026-27")` — exactly PRD §6.6's three, in PRD order, with the docstring
   quoting the sentence. `FinancialYearWindow.covers(versions) -> CoverageReport` returns per-year
   `RESOLVED | MISSING` by calling `resolve_as_at` at each year's start, end and one mid-point (the
   three time points PRD §40.8 item 6 requires). `still_operative_exception(version) -> bool`
   implements PRD §6.6's carve-out — a still-operative instrument older than the window is **not**
   excluded — and a test asserts the window logic never drops such a version.

8. **`_shared.legislation.validation` — reusable legislation findings.** A `legislation_findings(...)`
   entry point returning `INGF-01`'s `ValidationFindings`, composed from deliverables 2, 4, 5 and 6,
   for an adapter to return from PRD §40.7's `validate(candidate, priorState)`. Severity mapping is
   fixed here and matches `INGF-05`'s FLAG/BLOCK split (its deliverable 6):

   | Finding | Severity | Basis |
   |---|---|---|
   | overlapping effect interval in a consolidated series | **BLOCK** | PRD §40.9 "critical … time … failures block release"; §35.2 |
   | duplicate `stable_source_key` or `stable_node_key` | **BLOCK** | PRD §40.9 "any duplicate stable identity" |
   | status asserted without an evidence event | **BLOCK** | PRD §15.2 |
   | node-tree structural break (multi-root, cycle, non-contiguous ordinals, hash mismatch, round-trip failure) | **BLOCK** | PRD §15.3, §40.8 item 5 |
   | title ingested with no allowlist entry or no inclusion reason | **BLOCK** | PRD §40.2 |
   | coverage gap inside the PRD §6.6 window | **FLAG** | PRD §6.6 + §40.9 (percentage/coverage rules are refined per source) |
   | commencement event with `effective_date` before `event_date` | **FLAG** | PRD §15.2 (implausible but not automatically fatal) |

   `legislation_findings` never quarantines, never writes and never raises for a FLAG — the
   `IngestionRunner` (`INGF-05`) decides consequences.

9. **Failure codes.** Registered with `INGF-01`'s
   `register_failure_codes("legislation", …)`, each value being the **operator action** (PRD §40.8
   item 10, `ADM-001`): `LEGISLATION_TITLE_NOT_ALLOWLISTED`, `LEGISLATION_TITLE_REASON_MISSING`,
   `LEGISLATION_TITLES_INVALID`, `LEGISLATION_TITLE_DEPENDENCY_DANGLING`,
   `LEGISLATION_TITLE_DEPENDENCY_CYCLE`, `LEGISLATION_STATUS_UNEVIDENCED`,
   `LEGISLATION_EVENT_EVIDENCE_MISSING`, `LEGISLATION_NODE_TREE_BROKEN`,
   `LEGISLATION_NODE_KEY_DUPLICATE`, `LEGISLATION_COVERAGE_GAP`.
   Codes that already exist in the framework are **reused, not re-registered**:
   `EFFECT_INTERVAL_OVERLAP`, `IDENTITY_DUPLICATE`, `IDENTITY_CONFLICT`, `BROKEN_STRUCTURE`
   (`INGF-05` deliverable 7). A test asserts no code registered here duplicates a framework code
   (`INGF-01`'s `DuplicateFailureCodeError` is the mechanism).

10. **Consumer guide** at `pipelines/adapters/_shared/legislation/README.md`: the import line, the
    closed-open interval convention, the status-derivation precedence table, the evidence rule, the
    `titles.yaml` layout with a filled example, the node-key normalisation rules, the FLAG/BLOCK table,
    and a worked "minimal legislation adapter" sketch showing where each primitive is called inside
    the eight PRD §40.7 boundaries. This is the document a cold-starting adapter Builder reads instead
    of another adapter's code — the same role `INGF-09`'s authoring guide plays for the conformance
    kit. A doc test asserts every public symbol of deliverables 2–8 appears in it.

## Acceptance checklist (classified)

- [ ] `[machine]` `LegislationEventType` and the status vocabulary are **closed** sets with exactly the
      declared members, and `derive_status` never returns `BILL_NOT_ENACTED` or
      `DRAFT_OR_CONSULTATION` — asserted over the full generated input space of the precedence rules
      (PRD §6.7; sub-PRD **D6**; deliverables 3–4).
- [ ] `[machine]` `derive_status` reproduces its five-rule precedence table on an explicit case matrix
      held in the test file, and every non-`STATUS_UNCONFIRMED` result carries a non-null
      `evidence_event_id` (PRD §15.2; deliverable 4).
- [ ] `[machine]` `build_event` raises `UnevidencedEventError` without a resolvable evidence node
      version, and keeps `event_date` and `effective_date` independent — a test asserts neither is
      derived from the other (PRD §15.2, §35.2; deliverable 3).
- [ ] `[machine]` `assert_no_overlap` emits a **BLOCK** `EFFECT_INTERVAL_OVERLAP` finding for two
      intersecting consolidated versions and nothing for an abutting pair — the closed-open convention
      (PRD §35.2 "non-overlap validation", §40.9; deliverable 2).
- [ ] `[machine]` `resolve_as_at` is total and deterministic: property test over generated version
      sequences asserts it returns the unique interval containing the date, or `None`, and never
      raises (deliverable 2).
- [ ] `[machine]` `close_prior_version` returns a new record and leaves the input untouched — no
      in-place mutation path exists (PRD §35.2 immutable, §35.8 invariant 5; deliverable 2).
- [ ] `[machine]` `stable_node_key` is derived from structural path only: two versions with different
      `display_label`s but the same structural path yield the same key, and two different paths never
      collide over the generated corpus (PRD §15.3; deliverable 5).
- [ ] `[machine]` `NodeTree` rejects a multi-root tree, a cycle, non-contiguous sibling ordinals, a
      `text_hash` that does not recompute, and an offset pair that fails the exact-text round-trip —
      one negative control each (PRD §15.3, §40.8 item 5; deliverable 5).
- [ ] `[machine]` `diff_nodes` emits `RENUMBER`, `REPLACE`, `SPLIT`, `MERGE` and `AMEND` on the
      matching synthetic pairs, always with `confidence_state="EVIDENCED"`; a test asserts the string
      `MODEL_SUGGESTED` cannot be produced by any code path in this package (PRD §35.2; deliverable 5).
- [ ] `[machine]` `titles.schema.json` rejects: an unknown `subjects` key, a `SUBJECT_MATCH` whose
      subject is not declared, a `DEPENDENCY_EXPANSION` with a dangling `depends_on`, a dependency
      cycle, a duplicate `stable_source_key`, a `group_id` that does not match the directory, and an
      entry with no `inclusion` — one parametrised case each (PRD §40.2; deliverable 6).
- [ ] `[machine]` `unexplained_titles` returns exactly the discovered keys with no allowlist entry, so
      an adapter can refuse them (PRD §40.2 "records why each title is included"; deliverable 6).
- [ ] `[machine]` `LAUNCH_FINANCIAL_YEARS == ("2024-25", "2025-26", "2026-27")` and
      `FinancialYearWindow.covers` reports `MISSING` for a hole and `RESOLVED` for each of the three
      time points per year (PRD §6.6, §40.8 item 6; deliverable 7).
- [ ] `[machine]` `still_operative_exception` keeps a pre-window still-operative instrument in scope —
      PRD §6.6: "still-operative instruments MUST NOT be excluded solely because they are older than
      three financial years" (deliverable 7).
- [ ] `[machine]` `legislation_findings` produces the exact severity in deliverable 8's table for one
      crafted input per row, and never raises on a FLAG (PRD §40.9; `INGF-05` deliverable 6).
- [ ] `[machine]` Every failure code in deliverable 9 is registered with a non-empty operator action,
      and no code registered here collides with a framework code (`ADM-001`, PRD §40.8 item 10;
      `INGF-01` deliverable 10).
- [ ] `[machine]` **Architecture**: `INGF-01`'s scanner reports this package clean — no `httpx`,
      `requests`, `aiohttp`, `urllib`, `http.client`, `socket`, `sqlite3` or corpus-database import,
      and no document-parsing library (PRD §37.4, §40.7, §39.1; `INGF-01` deliverable 11, `INGF-02`
      deliverable 8).
- [ ] `[machine]` The package performs no I/O other than reading a `titles.yaml` handed to it: a
      session guard asserts no network socket is opened and no path outside the test tree is written
      (PRD §40.7's framework/adapter split).
- [ ] `[machine]` Consumer-guide doc test: every public symbol of deliverables 2–8 appears in
      `_shared/legislation/README.md` with its PRD reference (cold-start requirement; deliverable 10).
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, PRD §20.3 "Rust and Python builds/tests").
- [ ] `[machine]` `pnpm test` green — standing suite item; this ticket adds no TypeScript, so the
      expectation is "unchanged and green" (plan §1.1, PRD §45.3).
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (`SRCH-002`, `SRCH-003`,
      `SRCH-005` groundwork; `ADM-001` groundwork via the failure-code operator actions); UAT IDs —
      none directly, though `UAT-SRCH-03` ("Select 2024-08-03 then open result … current text is not
      substituted") is the behaviour this ticket's point-in-time model makes possible and
      `14-search-product` executes; schema/API/event compatibility (introduces `titles.yaml` and the
      `_shared.legislation` public surface, consumed by eleven tickets across modules `06`, `07` and
      `10` — a change after merge requires re-publishing them, `publish-tickets.mjs --sync`);
      tenant/PII/security impact (none — no tenant or customer data enters this package);
      source/licence impact (none — this ticket fetches nothing); cost/memory/latency impact (none);
      rollback path (delete the package; nothing depends on it until `SLEG-02` starts); known gaps
      (sub-PRD **L1**, **L2**, **L6**).
- [ ] `[human]` **Writeback obligation is itself an acceptance item**: if the `pipelines/adapters`
      packaging that `FND-01` committed differs from sub-PRD **D2**, this PR updates
      `docs/prd/06-sources-legislation/README.md` rows **D2**/**L2** in the same change (plan §1.1).
- [ ] `[human]` **Decide open question L6** — whether "no synthesised consolidations" (sub-PRD **D10**)
      is durable enough to record as `docs/adr/NNNN-no-synthesised-consolidations.md` (owned by this
      ticket per plan §2.1 **A9**, classified "Architecture decision" by PRD §45.5). It binds nine
      adapters' behaviour when a register publishes no point-in-time text, and whether a
      machine-reconstructed consolidation may ever be presented with the authority of primary law is
      irreducibly a judgment call.
- **No `[fixture]` criteria** — this ticket replays no recorded source data. Its inputs are synthetic
  version/node/event structures constructed in the tests; the first recorded register fixtures arrive
  with `SLEG-02`…`SLEG-10`. Declared absent deliberately.
- **No `cargo test --workspace` item** — this ticket adds no Rust (plan §1.1).

## Test plan

Harness: `pytest`, run as `uv run pytest pipelines/adapters/_shared/legislation -q`. Everything is
offline; no `pipelines/adapters/leg-*/**` content is required and none exists yet. Construction
pattern to copy: `pipelines/ingestion/tests/adapter/` from `INGF-01` (protocol/table/negative-control
style) and `pipelines/ingestion/tests/registry/` from `INGF-07` (schema fixture-per-invalid-case
style).

1. `uv sync --frozen && uv run pytest pipelines/adapters/_shared/legislation -q` — all green.
2. **`test_timeline.py`** — the closed-open convention on abutting and overlapping pairs;
   `resolve_as_at` property test (Hypothesis or an equivalent generated matrix) over sequences of
   1–20 versions asserting totality, determinism and uniqueness; `assert_no_overlap` BLOCK finding;
   `assert_no_gap` FLAG finding with the exact missing interval; `close_prior_version` immutability
   (the input object is compared by value before and after).
3. **`test_events.py`** — `build_event` happy path; `UnevidencedEventError` for a missing/unresolvable
   evidence node; a table asserting `event_date` and `effective_date` survive independently through
   construction and serialisation; the closed enum membership assertion.
4. **`test_status.py`** — the five-rule precedence matrix as an explicit expected table (one row per
   combination of repeal/supersession/commencement/assent presence × `as_at` before and after each
   effective date); the "evidence id present unless `STATUS_UNCONFIRMED`" property test; the assertion
   that the two `SFUT-01` statuses are unreachable.
5. **`test_nodes.py`** — `stable_node_key` label-independence and collision test over a generated path
   corpus; five `NodeTree` negative controls (multi-root, cycle, ordinal gap, hash mismatch,
   round-trip break); `diff_nodes` over five crafted prior/current pairs, one per relation type; a
   source scan asserting the literal `MODEL_SUGGESTED` appears nowhere in the package.
6. **`test_titles.py`** — the seven schema negative controls of the acceptance list, each a fixture
   file under `tests/fixtures/titles/`; a valid `leg-cth`-shaped file loading and answering
   `includes`/`reason`; `unexplained_titles` on a discovery list containing two unknown keys.
7. **`test_coverage.py`** — `LAUNCH_FINANCIAL_YEARS` equality; the three-time-points-per-year report
   over a version set with a deliberate hole in 2025–26; the still-operative carve-out.
8. **`test_validation.py`** — one crafted input per row of deliverable 8's severity table, asserting
   the exact code and severity, and that a FLAG-only input returns `has_blocking is False`.
9. **`test_failure_codes.py`** — every code registered with a non-empty operator action; a
   deliberate duplicate registration of a framework code raises `DuplicateFailureCodeError`.
10. **`test_architecture.py`** — imports `INGF-01`'s scanner and runs it over
    `pipelines/adapters/_shared/legislation/**`, asserting the package is clean; a synthetic dirty
    module in `tests/fixtures/dirty/` is the positive control.
11. **`test_guide.py`** — the consumer-guide doc test of deliverable 10.
12. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus: (a) that `derive_status` cannot return a status without naming the event that
produced it — this is the rule every downstream legal answer rests on (PRD §15.2); (b) that the
closed-open interval convention is applied identically in `resolve_as_at`, `assert_no_overlap` and
`FinancialYearWindow`, since a mismatch would put a document in force on the day it was repealed;
(c) that no code path can emit `MODEL_SUGGESTED` or an unevidenced relation (PRD §35.2); (d) that
nothing in the package performs HTTP, parsing or corpus writes (PRD §40.7, §37.4).

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (a docs PR/MR,
a version note in the sub-PRD changelog, then `publish-tickets.mjs --sync`), and only then change
code. Silent divergence is an incomplete ticket. The ticket wins over any implementation plan
(CLAUDE.md, issue #53). Because eleven tickets across three modules are `blocked_by` this one, a
change here after merge also requires re-publishing the dependent tickets — say so in the PR.

**Foreseeable frictions and their exact writeback targets:**

1. **A register genuinely needs a shared helper this package does not provide** (a tenth event type, a
   second node-key convention, a jurisdiction-specific interval rule) → **do not add it inside an
   adapter directory, and do not copy this package.** Plan §9 **R2** fixes the path: add the primitive
   here — which after merge means a new sibling ticket in this module recorded in
   `docs/prd/06-sources-legislation/README.md`'s work-breakdown table and in
   `docs/prd/breakdown-plan.md` §5.7/§6.2, with the affected adapters `blocked_by` it. Two adapters
   wanting the same private helper is the early signal.
2. **`FND-01` declared a different packaging for `pipelines/adapters` (different import root, src
   layout, or no member at all)** → follow `FND-01` and update
   `docs/prd/06-sources-legislation/README.md` rows **D2** and **L2** in the same PR. If the member is
   missing entirely, that is a `00-foundation` gap: raise it against `FND-01` rather than creating the
   manifest from scratch (plan §1.1 gives `FND-01` that ownership). If `_shared` cannot be imported
   from a path-loaded `adapter.py` at all, that falsifies `INGF-01`'s directory-convention loading
   (its D5/M5) — escalate there before working around it here.
3. **`CRPS-01`/`FND-03` already export a `LegalStatus` enum, or export it in a different shape** →
   import and re-export it; never define a second one. PRD §35.1 requires enumerations to be
   "checked text values generated from `packages/contracts`", and plan §4.1 makes `FND-03` the serial
   owner of canonical enums. If a value this ticket needs is missing there, that is a writeback to
   `FND-03` (a `00-foundation` ticket change), not a local addition — record it in
   `docs/prd/06-sources-legislation/README.md` and take the `blocked_by` edge.
4. **`INGF-01`'s `ValidationFinding`, `ParsedBlock` or record types do not fit the primitives above**
   (for example `ParsedBlock` carries no structural path, so `stable_node_key` has nothing to hash) →
   the change belongs in `INGF-01`, not here. Update
   `docs/prd/05-ingestion-framework/README.md` and the `INGF-01` ticket first, then this ticket's
   deliverable 5, then code. Widening a framework type locally would break the 52-adapter contract.
5. **`INGF-05`'s FLAG/BLOCK split disagrees with deliverable 8's table** → `INGF-05` wins for the
   framework anomaly rules; this table may only be **stricter**, never looser (its `AnomalyPolicy`
   already refuses a downgrade). If a legislation-specific rule genuinely needs to be a FLAG where the
   framework says BLOCK, that is a change to PRD §40.9's critical list — a **product/spec** change
   under PRD §45.5. Escalate; do not soften it here.
6. **A new failure code needs a quarantine *class* mapping that `INGF-05` does not have** → register
   the code here with its operator action, and raise the class mapping against `INGF-05`
   (`docs/prd/05-ingestion-framework/tickets/INGF-05-...md` deliverable 3). Do **not** edit
   `INGF-05`'s reason table from this module — it is another module's file-scope.
7. **A register publishes no consolidated point-in-time text for part of the PRD §6.6 window** → this
   is sub-PRD **D10**/**L6**. Emit what the register publishes, let `assert_no_gap` FLAG it, and let
   the adapter record a `DATE_LIMITED` `known_gaps` entry with `customer_visible: true`. **Never**
   synthesise a consolidation. If the founder decides reconstruction is required after all, that
   overturns D10: write `docs/adr/NNNN-no-synthesised-consolidations.md`, update
   `docs/prd/06-sources-legislation/README.md` D10/L6, and escalate — PRD §6.1 admits only official
   public sources.

**Escalation rule.** If a decided protocol here is outright falsified — status derived from evidenced
events (PRD §15.2), the seven-value PRD §6.7 vocabulary, structural-path node identity (PRD §15.3), or
the single shared home for legislation primitives (plan §9 **R2**) — that overturns either the PRD or
a decision recorded in the breakdown plan. Stop, escalate for re-review, and never swap the approach
silently inside this ticket: nine register adapters, `SINS-01` and `SFUT-01` are written against it,
and a divergence here becomes nine different legal answers to the same question.
