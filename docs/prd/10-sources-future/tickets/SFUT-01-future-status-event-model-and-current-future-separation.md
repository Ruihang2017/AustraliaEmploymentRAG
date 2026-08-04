---
id: SFUT-01
title: Future-status event model and current/future separation
module: 10-sources-future
lane: 10-sources-future
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [SLEG-01]
blocks: [SFUT-02, SFUT-03, SFUT-04, SFUT-05, SFUT-06, SFUT-07, SFUT-08, SFUT-09, SFUT-10]
---

# SFUT-01 — Future-status event model and current/future separation

Implements PRD §6.5 (future and proposed law), PRD §6.7 (legal status taxonomy), PRD §40.6 (wave 5)
and PRD §36.2 (status clause of the hard applicability filter) &lt;SRCH-002&gt; — no ADR — the decision is
already made in PRD §6.5 and §6.7; this is build ticket 1 of 10 against it.
Parent sub-PRD: [10-sources-future README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `SLEG-01` — Legislation adapter primitives (point-in-time, events, title allowlist),
module `06-sources-legislation`, file-scope `pipelines/adapters/_shared/legislation/**`
(`docs/prd/06-sources-legislation/tickets/`).
**Why `builder`:** a bounded shared-primitives package inside this module's declared file-scope,
against invariants PRD §6.5, §6.7 and §36.2 already state verbatim — not a new subsystem decision.

## Background + basis

**PRD §6.5 lists the material and states the invariant.**

> "- Bills.
> - Explanatory memoranda.
> - Enacted but not commenced amendments.
> - Draft instruments.
> - Consultations.
> - Commencement proclamations and equivalent status events.
>
> Future/proposed material MUST be stored and searchable but MUST be separated from current-law
> answers and visibly labelled."

**PRD §6.7 fixes the taxonomy and the default.**

> "`IN_FORCE`, `ENACTED_NOT_IN_FORCE`, `BILL_NOT_ENACTED`, `DRAFT_OR_CONSULTATION`, `REPEALED`,
> `SUPERSEDED`, `STATUS_UNCONFIRMED`
>
> Default answers MUST use only material in force at the requested legal date unless the user
> explicitly requests historical, future or proposed material."

**PRD §36.2 is where separation actually bites.** The hard applicability filter runs *"before scoring
and again before evidence-pack construction"*; a candidate is eligible only if

```text
requested date ∈ effective interval
AND requested jurisdiction intersects applicable jurisdiction
AND legal status is permitted by request mode
AND document/source use is permitted by licence assessment
AND version and node belong to the pinned CorpusRelease
```

> "Future/proposed research changes the allowed status set but never relabels future material as
> current. `STATUS_UNCONFIRMED` cannot support a definitive current-law conclusion."

That sentence is the reason this ticket is status-driven and not date-driven (sub-PRD **D2**): the
PRD makes the *status clause*, not the effect interval, the separation mechanism.

**PRD §15.2 fixes where status comes from.**

> "Legal status MUST be derived from evidenced LegalEvents. Cached status fields MAY improve
> performance but are not the authoritative history."

**PRD §40.6 closes with the labelling rule this ticket must make expressible.**

> "Each future item links to the legislation it would amend where deterministically supported. The
> UI labels `BILL_NOT_ENACTED`, `ENACTED_NOT_IN_FORCE` or `DRAFT_OR_CONSULTATION` with the relevant
> dates and never calls it current law."

**The two failure modes this ticket exists to prevent** (sub-PRD *Problem*): contamination (a bill or
enacted-not-commenced amendment reaching a current-law answer) and fabricated certainty (inventing a
commencement date for material commencing *"on a day to be fixed by proclamation"*). PRD §43.3 makes
both release gates: *"Date/jurisdiction critical error … must be 0"* and *"Source-status correctness
… ≥98%"*. PRD §41.2 `UAT-SRCH-02` is the human script: *"Search current law with
`ENACTED_NOT_IN_FORCE` source present → Future material absent from default results or visibly
separated when requested."*

**What this ticket must not become.** `FND-10` owns the answer-time predicate in TypeScript
(`packages/domain/src/legal/**`, including `deriveStatus(events, asAt)`), and `RETR-04` owns the
search-side hard filters in Rust. This ticket ships a **producer-side** validator whose only job is
to prove that the data a `FUTURE-*` adapter emits *cannot* be eligible in current-law mode. The two
are different obligations (does the producer label correctly / does the consumer filter correctly)
and PRD §45.2 forbids duplicating business rules across owners — so the shared, authoritative
vocabulary stays the `packages/contracts` enums, consumed here through `CRPS-01`'s Python contract
package, never re-spelled.

**What already exists when this ticket starts.** `INGF-01` (adapter protocol, ports, envelope,
failure-code registry), `INGF-05` (quarantine, run accounting, `ValidationFinding` severities),
`INGF-06` (parser host, `assert_roundtrip`), `INGF-07` (`registry.yaml` schema and roster),
`INGF-09` (conformance kit and `ReplayFetcher`), `CRPS-01` (INR record types and JSON Schemas), and
`SLEG-01` (`_shared/legislation/**`: point-in-time, commencement/repeal events, title allowlist).
Read `docs/prd/05-ingestion-framework/tickets/`, `docs/prd/04-corpus-contract/tickets/CRPS-01-*.md`
and `docs/prd/06-sources-legislation/tickets/SLEG-01-*.md` for their exact public surfaces before
naming anything.

**Carried caveats.** (a) The canonical `event_type` members for §40.6's status events are `FND-03`'s
(sub-PRD **F3**); a missing member is a writeback there, never a local string. (b) The INR contract
scopes refs by `source_id`, so the "amends" link is metadata, not a relation (sub-PRD **D5**, **F2**).
(c) The import root and `_shared` layout follow `SLEG-01` (sub-PRD **D11**, **F7**).

## Goal

Create the shared current-vs-future separation model under `pipelines/adapters/_shared/future/**`:
an evidence-driven future-status derivation, the PRD §40.6 status-event vocabulary mapped onto the
canonical `event_type` enum, a `CommencementSpec` that resolves to a date only on evidence, an
emit-time `FutureSeparationValidator` returning `BLOCK`-severity `ValidationFinding`s for every way a
wave-5 record could contaminate current law, the `future.*` metadata schema that carries the PRD
§40.6 labels and their dates, the deterministic amends-linkage builder, and a synthetic
three-time-point separation fixture pack — such that all nine `FUTURE-*` adapters call one shared
`assert_excluded_from_current_law()` and the PRD §6.5 invariant is a test, not a convention.

## Non-goals

- **No source adapter and no network access.** The nine groups are `SFUT-02`…`SFUT-10`; fixtures here
  are synthetic and hand-written.
- **No answer-time or search-time filtering.** `FND-10` owns PRD §36.2's eligibility predicate in
  `packages/domain/src/legal/**`; `RETR-04` owns the search-side hard filters. This ticket's
  simulation is producer-side evidence only and must say so in its docstrings.
- **No enum definitions.** `legal_status`, `document_type`, `event_type`, `relation_type` and
  `confidence_state` are `FND-03`'s, consumed through `CRPS-01`'s Python contract package. Re-spelling
  a value here is a defect (sub-PRD F3).
- **No INR record types or schema changes.** `CRPS-01` owns them (plan §2.1 **A4**).
- **No point-in-time consolidation, repeal machinery or title allowlist.** `SLEG-01` owns
  `_shared/legislation/**`; this package imports it and never copies it (sub-PRD **D7**, plan §9 R2).
- **No corpus, app or ephemeral database access of any kind.** PRD §40.7: *"The adapter never writes
  active corpus tables directly"*; PRD §39.1: *"Python pipeline code never imports tenant/customer
  packages."*
- **No registry, allowlist, licence or conformance file schemas.** `INGF-07`, `INGF-02`, `INGF-04`,
  `INGF-09` own them; this ticket only reads the `registry.yaml` fields it validates against.
- **No UI labelling.** `FIND-04`/`FIND-05` render the labels; this ticket makes the label facts
  present and evidenced.
- **No evaluation cases.** `GOLD-13` authors the 30 temporal traps; `evals/gold/**` must never be
  read (plan §9 R9, PRD §45.1 item 6).

## File-scope (write-owns)

- `pipelines/adapters/_shared/future/**` — the shared package and its own tests, including
  `schema/future-metadata.schema.json` and `fixtures/separation/**`.
- `pipelines/adapters/pyproject.toml` — **append-only**; append only the dependencies this ticket
  declares and resolve conflicts by re-running `uv lock`, never by hand-merge (plan §1.1, PRD §44.3,
  sub-PRD F7).
- Does not touch: `pipelines/adapters/future-{cth,nsw,vic,qld,wa,sa,tas,act,nt}/**` — `SFUT-02`…`SFUT-10`.
- Does not touch: `pipelines/adapters/_shared/legislation/**` and `pipelines/adapters/leg-*/**` —
  module `06-sources-legislation` (`SLEG-01`…`SLEG-10`). Imported read-only.
- Does not touch: `pipelines/adapters/_shared/{rates,caselaw}/**` and `pipelines/adapters/{fwc-*,fwo-*,ato-*,pt-*,case-*,adj-*}/**`
  — modules `07`, `08`, `09`.
- Does not touch: `pipelines/ingestion/**` — `05-ingestion-framework`.
- Does not touch: `pipelines/corpus-builder/**`, `schemas/**` — `04-corpus-contract`, `00-foundation`.
- Does not touch: `packages/**`, `apps/**`, `services/**`, `tests/**`, `evals/**`,
  `pipelines/evaluation/**`, `infra/**`.

**Serial safety.** This is the first decomposition of `docs/PRD.md`: nothing is merged and no ticket
is in flight, so no prior ticket has touched these paths. `SFUT-01` is this module's wave 1 and runs
alone — all nine sibling tickets are `blocked_by` it, so none can be concurrent with it. Concurrency
outside the module is possible with `06`–`09` adapter tickets, whose scopes are different directories
under `pipelines/adapters/`; the only path shared with them is the append-only
`pipelines/adapters/pyproject.toml`.

## Deliverables

Names below are **binding**: nine adapter tickets are written against them without reading this
package's source. Internal organisation inside `_shared/future/` is the Builder's choice; the public
surface is not.

1. **Package skeleton.** `pipelines/adapters/_shared/future/__init__.py` exporting
   `FUTURE_MODEL_VERSION: str` (`"1.0.0"`, semver, bumped by any change to a rule below) and
   re-exporting the public names of deliverables 2–9. Follow the `_shared` layout and import root
   `SLEG-01` established for `_shared/legislation` (sub-PRD **D11**); do not invent a second one.

2. **`future.statuses` — the permitted wave-5 status set.** Import the PRD §6.7 values from
   `CRPS-01`'s Python contract package (which reuses the `packages/contracts` enum, `CRPS-01`
   deliverable 13); never re-spell them locally. Export:
   - `FUTURE_STATUSES: frozenset[str]` = `{BILL_NOT_ENACTED, DRAFT_OR_CONSULTATION, ENACTED_NOT_IN_FORCE}`;
   - `PERMITTED_WAVE5_STATUSES: frozenset[str]` = `FUTURE_STATUSES | {STATUS_UNCONFIRMED}`;
   - `FORBIDDEN_WAVE5_STATUSES: frozenset[str]` = every other §6.7 value, i.e.
     `{IN_FORCE, REPEALED, SUPERSEDED}` (sub-PRD **D2**);
   - `PROPOSAL_DOCUMENT_TYPES: frozenset[str]` — the `document_type` values a wave-5 group may emit:
     bill, explanatory material, draft instrument, consultation document and commencement/proclamation
     notice. Resolve each to the canonical `document_type` member from `FND-03`; a member that does
     not exist is sub-PRD **F3**'s writeback, not a new string.
   A test asserts `FUTURE_STATUSES ∪ FORBIDDEN_WAVE5_STATUSES ∪ {STATUS_UNCONFIRMED}` equals the full
   seven-value §6.7 enum, so a future enum change cannot leave a value unclassified.

3. **`future.events` — the PRD §40.6 status-event vocabulary.**
   `FutureEventKind` — a closed set covering every event PRD §40.6 names across its nine rows:
   `INTRODUCED`, `PASSED`, `ASSENTED`, `COMMENCEMENT`, `DISALLOWANCE`, `PROCLAMATION_MADE`,
   `DRAFT_PUBLISHED`, `CONSULTATION_OPENED`, `CONSULTATION_CLOSED`, `LAPSED`, `WITHDRAWN`,
   `REPEAL_SCHEDULED`.
   `CANONICAL_EVENT_TYPE: Mapping[FutureEventKind, str]` maps each to the canonical `event_type`
   value from `FND-03`. `canonical_event_type(kind) -> str` raises `UnmappedFutureEventError`
   naming the kind, `FND-03` and sub-PRD **F3** when no canonical member exists — a loud failure, never
   a fallback string.
   `build_event(kind, *, stable_source_key, event_date, effective_date=None, evidence_ref,
   metadata=None) -> LegalEvent` constructs a `CRPS-01` `legal_event` payload with
   `event_type = canonical_event_type(kind)` and `metadata_json` validated by deliverable 6. An
   `evidence_ref` is **required** for every kind except `CONSULTATION_CLOSED` — an event without
   evidence is a `STATUS_UNCONFIRMED` input, not an assertion (PRD §15.2).

4. **`future.commencement` — `CommencementSpec` and its resolution (sub-PRD D4).**
   Frozen dataclass `CommencementSpec(kind: CommencementKind, fixed_date: str | None,
   days_after_assent: int | None, condition_text: str | None, evidence_ref: NodeRef | None)` with
   `CommencementKind ∈ {ON_ASSENT, FIXED_DATE, PERIOD_AFTER_ASSENT, BY_PROCLAMATION_SET,
   BY_PROCLAMATION_UNSET, CONDITIONAL_UNSET, UNKNOWN}`.
   `resolve_commencement(spec, *, assent_date: str | None) -> str | None` returns a `YYYY-MM-DD`
   date **only** for `ON_ASSENT` (with an assent date), `FIXED_DATE` and `PERIOD_AFTER_ASSENT` (with
   an assent date), and `BY_PROCLAMATION_SET` (which requires `fixed_date` **and**
   `evidence_ref`). For `BY_PROCLAMATION_UNSET`, `CONDITIONAL_UNSET` and `UNKNOWN` it returns
   `None` — and `None` is a first-class outcome that callers must render as "commencement date not
   yet fixed", never substitute. A test asserts no code path can produce a date from an unset kind.

5. **`future.status` — evidence-driven derivation.**
   `derive_future_status(events: Sequence[LegalEvent], *, as_at: str,
   commencement: CommencementSpec | None = None) -> str` returning one member of
   `PERMITTED_WAVE5_STATUSES`, by these rules in order:
   1. an evidenced `WITHDRAWN` or `LAPSED` event dated ≤ `as_at` → `BILL_NOT_ENACTED`
      (the proposal never became law; the document remains searchable and labelled);
   2. an evidenced `DISALLOWANCE` dated ≤ `as_at` → `BILL_NOT_ENACTED` for a disallowed instrument
      proposal;
   3. an evidenced `ASSENTED` dated ≤ `as_at` → `ENACTED_NOT_IN_FORCE`;
   4. an evidenced `INTRODUCED` or `PASSED` dated ≤ `as_at` (no assent) → `BILL_NOT_ENACTED`;
   5. an evidenced `DRAFT_PUBLISHED`, `CONSULTATION_OPENED` or `CONSULTATION_CLOSED` dated ≤ `as_at`
      → `DRAFT_OR_CONSULTATION`;
   6. otherwise → `STATUS_UNCONFIRMED`.
   **`IN_FORCE` is unreachable from this function** — a wave-5 record describes a proposal document,
   and a commenced law is the `LEG-*` group's document (sub-PRD **D1**). A test asserts
   `IN_FORCE ∉ set(outputs)` across the full generated event-combination matrix.
   `derive_future_status` is pure: no clock, no IO, deterministic for a given input.

6. **`future.metadata` — the `future.*` label block and its JSON Schema.** A committed
   `schema/future-metadata.schema.json` (`additionalProperties: false`) describing the object stored
   in `legal_event.metadata_json` and in the adapter's `document_version` side-channel, so that PRD
   §40.6's *"labels … with the relevant dates"* is data, not prose:

   ```yaml
   future:
     status: ENACTED_NOT_IN_FORCE        # one of PERMITTED_WAVE5_STATUSES
     introduced_date: '2026-02-11'       # required when status is BILL_NOT_ENACTED
     passed_date: '2026-05-14'
     assent_date: '2026-06-02'           # required when status is ENACTED_NOT_IN_FORCE
     commencement:                       # required when status is ENACTED_NOT_IN_FORCE
       kind: BY_PROCLAMATION_UNSET
       resolved_date: null               # null is a valid, meaningful value (D4)
       condition_text: 'a day to be fixed by proclamation'
       evidence_ref: {stable_source_key: ..., version_label: ..., stable_node_key: ...}
     consultation:                       # required when status is DRAFT_OR_CONSULTATION
       opened_date: '2026-03-01'
       closes_date: '2026-04-15'
     amends: []                          # deliverable 7
     never_current: true                 # constant; asserted by the validator
   ```

   `build_future_metadata(...) -> Mapping` validates against the schema and raises
   `FutureMetadataError` naming the missing field when a status's required dates are absent.

7. **`future.linkage` — deterministic amends linkage (sub-PRD D5).**
   `AmendsLink(target_jurisdiction: str, target_official_identifier: str, target_official_url: str,
   target_neutral_title: str | None, derivation: str, evidence_ref: NodeRef,
   evidence_start: int, evidence_end: int)` and
   `build_amends_links(parsed, *, rules) -> Sequence[AmendsLink]`.
   Rules:
   - a link is emitted **only** when it is read from the document's own parsed text with exact
     character offsets (PRD §40.6 *"where deterministically supported"*; PRD §15.3 exact offsets);
   - `derivation` must be a deterministic value from the canonical enum; a model-suggested derivation
     or a `confidence_state` of `MODEL_SUGGESTED` is rejected with `NonDeterministicLinkageError`
     (PRD §35.2: *"`MODEL_SUGGESTED` cannot support definitive status"*);
   - links are carried in `future.amends`, **not** as a `node_relation`, because INR refs are scoped
     by the envelope's `source_id` (`CRPS-01` deliverable 11). The module docstring records that
     constraint and points at sub-PRD **F2** as the writeback path if a first-class cross-source
     relation is ever needed.

8. **`future.separation` — the emit-time validator (the mechanical form of PRD §6.5).**
   `FutureSeparationValidator(group_id: str, registry: Mapping)` with
   `validate(records: Sequence[Envelope], *, legal_dates: Sequence[str]) -> ValidationFindings`
   producing `INGF-01`/`CRPS-01` `ValidationFinding`s at `BLOCK` severity. The eight checks, each
   with its own failure code (deliverable 10):

   | # | Code | Fails when |
   |---|---|---|
   | S1 | `FUTURE_STATUS_FORBIDDEN` | any emitted `document_version.legal_status ∉ PERMITTED_WAVE5_STATUSES` — in particular `IN_FORCE` (PRD §6.5, §6.7; D2). |
   | S2 | `FUTURE_DOCUMENT_TYPE_FORBIDDEN` | any emitted `document_identity.document_type ∉ PROPOSAL_DOCUMENT_TYPES` — the mechanical form of sub-PRD **D1** (an Act/regulation/consolidation belongs to `LEG-*`). |
   | S3 | `FUTURE_STATUS_NOT_EVIDENCED` | a status other than `STATUS_UNCONFIRMED` is asserted with no `legal_event` carrying an `evidence_ref` that supports it (PRD §15.2). |
   | S4 | `COMMENCEMENT_DATE_FABRICATED` | a `COMMENCEMENT`/`PROCLAMATION_MADE` event carries an `effective_date` without an `evidence_ref`, **or** a `CommencementSpec` of an unset kind was resolved to a date (D4). |
   | S5 | `FUTURE_LABEL_DATES_MISSING` | the `future.*` block for a record's status lacks that status's required dates (deliverable 6; PRD §40.6). |
   | S6 | `CURRENT_LAW_ELIGIBILITY_LEAK` | `current_law_eligible(records, as_at=d, mode=CURRENT_LAW)` is non-empty for any `d` in `legal_dates` (PRD §6.5, §6.7, §36.2). |
   | S7 | `AMENDS_LINK_NOT_DETERMINISTIC` | an `AmendsLink` lacks evidence offsets or carries a non-deterministic derivation (D5; PRD §35.2). |
   | S8 | `SUBMISSION_MATERIAL_FORBIDDEN` | the group's `registry.yaml`/`allowlist.yaml` admits a third-party submission endpoint, or an emitted record's `provenance.official_url` matches one (sub-PRD **D6**; PRD §6.1, §10.1). |

   `assert_excluded_from_current_law(records, *, legal_dates)` is the one-line helper every adapter
   calls in its own test suite; it raises `SeparationViolation` listing every finding.

9. **`future.eligibility` — the producer-side status-clause simulation.**
   `RequestMode ∈ {CURRENT_LAW, INCLUDE_FUTURE, INCLUDE_HISTORICAL}` and
   `current_law_eligible(records, *, as_at: str, mode: RequestMode) -> Sequence[Envelope]`
   implementing **only** PRD §36.2's `legal status is permitted by request mode` clause:
   `CURRENT_LAW` permits `{IN_FORCE}`; `INCLUDE_FUTURE` additionally permits `FUTURE_STATUSES`;
   `INCLUDE_HISTORICAL` additionally permits `{REPEALED, SUPERSEDED}`. `STATUS_UNCONFIRMED` is never
   permitted in `CURRENT_LAW` (PRD §36.2: *"cannot support a definitive current-law conclusion"*).
   The module docstring states in the first line that this is a **producer-side simulation for
   separation evidence only** and that the product's filter is `FND-10` + `RETR-04` — so no later
   reader mistakes it for the answer path (PRD §45.2).

10. **Failure codes** registered through `INGF-01`'s registry with
    `register_failure_codes("future", …)`, each with a non-empty operator action (PRD §40.8 item 10,
    ADM-001): the eight `S1`–`S8` codes above plus `FUTURE_EVENT_UNMAPPED`,
    `FUTURE_METADATA_INVALID`, `FUTURE_COMMENCEMENT_UNRESOLVED` (informational, `FLAG` severity — an
    unfixed commencement date is normal, not a defect).

11. **`fixtures/separation/**` — the shared synthetic pack.** A hand-written, network-free set of
    INR record batches plus the legal dates that exercise them, reusable by all nine adapters:
    - `bill-lifecycle/` — one proposal document across four evidenced events (introduced → passed →
      assented → commenced) with three declared legal dates: **before introduction**, **after assent
      and before commencement**, **after commencement**. At all three the record must be excluded
      from `CURRENT_LAW`;
    - `proclamation-unset/` — an assented amendment whose commencement is *"a day to be fixed by
      proclamation"*, asserting `resolve_commencement(...) is None` and status
      `ENACTED_NOT_IN_FORCE`;
    - `consultation/` — an exposure draft with `opened_date`/`closes_date`;
    - `contaminated/` — deliberate negatives, one per `S1`–`S8` code, used as the validator's
      negative controls.
    Every fixture is synthetic and contains no personal data (PRD §40.8 item 4).

12. **`future.conformance` — helpers the nine adapters call.**
    `assert_future_separation(group_dir, *, legal_dates)` (runs deliverable 8 over the group's own
    replayed fixtures via `INGF-09`'s `ReplayFetcher`/`replay_context`) and
    `assert_no_cross_adapter_import(group_dir)` (an AST scan asserting the group imports no other
    `pipelines/adapters/<group>` module — sub-PRD **D7**; `_shared/**` is permitted). These are
    additive to `INGF-09`'s twelve DoD checks, never a replacement, and never weaken them.

13. **`README.md` inside `_shared/future/`** — the wave-5 authoring guide: sub-PRD **D1**'s ownership
    cut (what a `FUTURE-*` group may and may not emit), the status-derivation table, the commencement
    kinds, the `future.*` metadata block, the eight separation checks with their codes, the
    submission-material exclusion, and the five-line pattern an adapter's separation test uses. This
    is the document a cold-starting adapter Builder reads instead of another adapter's code.

## Acceptance checklist (classified)

- [ ] `[machine]` `FUTURE_STATUSES`, `PERMITTED_WAVE5_STATUSES` and `FORBIDDEN_WAVE5_STATUSES`
      partition the full PRD §6.7 seven-value enum, and every value is imported from `CRPS-01`'s
      contract package rather than spelled locally (PRD §6.7; deliverable 2).
- [ ] `[machine]` `derive_future_status()` never returns `IN_FORCE`: asserted over the full generated
      matrix of evidenced-event combinations × legal dates (PRD §6.5, §6.7; deliverable 5).
- [ ] `[machine]` `derive_future_status()` returns `STATUS_UNCONFIRMED` when no evidenced event
      supports a status, and an event without an `evidence_ref` does not raise a status
      (PRD §15.2; deliverables 3, 5).
- [ ] `[machine]` `resolve_commencement()` returns `None` for `BY_PROCLAMATION_UNSET`,
      `CONDITIONAL_UNSET` and `UNKNOWN` at every input combination, and no code path produces a date
      from an unset kind (PRD §12.1 "rather than a false guarantee"; sub-PRD D4; deliverable 4).
- [ ] `[machine]` `canonical_event_type()` raises `UnmappedFutureEventError` naming `FND-03` and
      sub-PRD F3 for an unmapped kind, and never returns a fallback string (deliverable 3).
- [ ] `[machine]` `build_future_metadata()` rejects an `ENACTED_NOT_IN_FORCE` block without an assent
      date or commencement object, a `BILL_NOT_ENACTED` block without an introduction date, and a
      `DRAFT_OR_CONSULTATION` block without a publication/consultation date — one case each
      (PRD §40.6 "with the relevant dates"; deliverable 6).
- [ ] `[machine]` `build_amends_links()` rejects a link without exact evidence offsets and a link with
      a model-suggested derivation or `confidence_state == MODEL_SUGGESTED`
      (PRD §40.6, §35.2; deliverable 7).
- [ ] `[machine]` **Separation negative controls** — one fixture per code `S1`…`S8` in
      `fixtures/separation/contaminated/`, each producing exactly that `BLOCK` finding and no other;
      the clean fixtures produce none (deliverables 8, 11). A validator that cannot fail is worthless;
      this is the proof that it can.
- [ ] `[machine]` **PRD §44.2 `E16` exit evidence — current/future separation test**:
      `assert_excluded_from_current_law()` over `fixtures/separation/bill-lifecycle/` at all three
      declared legal dates (before introduction, after assent before commencement, after commencement)
      returns an empty `CURRENT_LAW` eligible set, while `INCLUDE_FUTURE` returns the records
      (PRD §6.5, §6.7, §36.2).
- [ ] `[machine]` `current_law_eligible()` never admits `STATUS_UNCONFIRMED` in `CURRENT_LAW` mode
      (PRD §36.2; deliverable 9).
- [ ] `[machine]` `assert_no_cross_adapter_import()` flags a synthetic group importing another
      `pipelines/adapters/<group>` module and passes one importing only `_shared/**`
      (sub-PRD D7; deliverable 12).
- [ ] `[machine]` Every failure code in deliverable 10 is registered with a non-empty operator action,
      and registration is idempotent (PRD §40.8 item 10, ADM-001; `INGF-01` deliverable 10).
- [ ] `[machine]` No module in this package imports `sqlite3`, an HTTP library, or any
      `packages/database`/`packages/auth` module — the `INGF-01` architecture-scan pattern applied to
      `_shared/future/**` (PRD §37.4, §39.1, §40.7).
- [ ] `[machine]` `_shared/future/**` imports `_shared/legislation/**` where it needs point-in-time or
      event primitives and defines no duplicate of them — asserted by a test naming the symbols reused
      (sub-PRD D7, plan §9 R2).
- [ ] `[machine]` No path under `evals/gold/**` is opened during the suite (plan §9 R9,
      PRD §45.1 item 6).
- [ ] `[machine]` The whole suite runs offline with no outbound network (session fixture asserts it).
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, PRD §20.3 "Rust and Python builds/tests").
- [ ] `[machine]` `pnpm test` green — standing suite item; this ticket adds no TypeScript, so the
      expectation is "unchanged and green" (plan §1.1, PRD §45.3).
- [ ] `[machine]` `_shared/future/README.md` documents all eight separation checks with their codes
      and the status-derivation table — asserted by a doc test that each code appears with its rule
      (cold-start requirement for nine downstream tickets).
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (**SRCH-002** data-side;
      supports **ADM-001** via the registry checks); UAT IDs (`UAT-SRCH-02` — this ticket supplies the
      producer-side guarantee the script tests, the screen behaviour is `FIND-04`'s); schema/API/event
      compatibility (introduces `future-metadata.schema.json` and `FUTURE_MODEL_VERSION`, both
      consumed by nine adapter tickets — a change after merge requires re-publishing them);
      tenant/PII/security impact (submission-material exclusion, D6; no tenant data); source/licence
      impact (none directly — per-group licences are the adapter tickets'); cost/memory/latency
      impact (none — pure functions); rollback path (delete the package; nothing depends on it until
      `SFUT-02`); known gaps (sub-PRD F1–F4, F7).
- [ ] `[human]` **Architect/Founder review that the eight separation checks actually discharge
      PRD §6.5's invariant.** Whether the checks are *sufficient* — not merely present — is
      irreducibly a judgment call, and this package is the gate for all nine wave-5 groups
      (PRD §43.4 item 2 puts legal-date failures at the top of the founder review queue).
- **No `[fixture]` criteria** — every fixture here is hand-written synthetic data, not recorded source
  data; the first recorded wave-5 transcripts arrive with `SFUT-02`. Declared absent deliberately.

## Test plan

Harness: `uv run pytest pipelines/adapters/_shared/future -q` (or the sibling `tests/` directory the
`SLEG-01` layout established), fully offline. Copy the construction pattern from
`pipelines/ingestion/tests/adapter/test_protocol_surface.py` (`INGF-01`) for surface assertions and
from `pipelines/ingestion/tests/conformance/test_negative_controls.py` (`INGF-09`) for the mutation
suite.

1. `uv sync --frozen && uv run pytest pipelines/adapters/_shared/future -q`.
2. **`test_statuses.py`** — the partition of PRD §6.7's seven values; identity of the imported enum
   members with `CRPS-01`'s (no local copy).
3. **`test_status_derivation.py`** — a parametrised matrix over every subset of
   `{INTRODUCED, PASSED, ASSENTED, COMMENCEMENT, DISALLOWANCE, LAPSED, WITHDRAWN, DRAFT_PUBLISHED,
   CONSULTATION_OPENED, CONSULTATION_CLOSED}` × three legal dates, asserting the deliverable-5 rule
   order, that `IN_FORCE` never appears in the output set, and that unevidenced events yield
   `STATUS_UNCONFIRMED`.
4. **`test_commencement.py`** — the resolution table; the unset kinds returning `None`; a property
   test that no `(spec, assent_date)` pair with an unset kind returns a string.
5. **`test_events.py`** — the `FutureEventKind` → canonical `event_type` mapping; the
   `UnmappedFutureEventError` message naming `FND-03`; the `evidence_ref` requirement.
6. **`test_metadata.py`** — schema validation of the four `future.*` shapes plus the three
   missing-date negatives.
7. **`test_linkage.py`** — deterministic link accepted; offset-less link rejected; model-suggested
   derivation rejected.
8. **`test_separation.py`** — the load-bearing suite. Over
   `fixtures/separation/{bill-lifecycle,proclamation-unset,consultation}/`, assert
   `assert_excluded_from_current_law()` passes at every declared legal date and that
   `INCLUDE_FUTURE` mode returns the records (searchable, per PRD §6.5). Then, parametrised over the
   eight `contaminated/` fixtures, assert exactly the expected `S<n>` code fires.
9. **`test_eligibility.py`** — the three request modes; `STATUS_UNCONFIRMED` never eligible in
   `CURRENT_LAW`.
10. **`test_architecture.py`** — the forbidden-import scan over this package; the cross-adapter-import
    helper over two synthetic group fixtures.
11. **`test_guide.py`** — the `README.md` doc test (all eight codes and the derivation table present).
12. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus: run the eight negative controls first — if any `contaminated/` fixture still passes,
the separation model is vacuous for that check and the ticket is not done. Then confirm that (a) no
code path can turn an unset commencement into a date, (b) `derive_future_status` has no branch that
can return `IN_FORCE`, (c) `current_law_eligible` is not silently used anywhere as a product filter,
and (d) the package holds no copy of a `_shared/legislation` primitive.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (a docs PR/MR,
a changelog line in `docs/prd/10-sources-future/README.md`, then `publish-tickets.mjs --sync`), and
only then change code. Silent divergence is an incomplete ticket; the ticket wins over any
implementation plan (CLAUDE.md, issue #53). Nine tickets are `blocked_by` this one, so a change after
merge also requires re-publishing them.

**Foreseeable frictions and their exact writeback targets:**

1. **A PRD §40.6 status event has no canonical `event_type` member** (sub-PRD **F3**) → add it in
   `packages/contracts` under `FND-03`'s rules, record it in
   `docs/prd/00-foundation/README.md` **D6** and in the `prd-enums` fixture, then map it here. Never
   emit a locally-invented string: `CRPS-01` deliverable 13 makes `event_type` a controlled value and
   PRD §35.1 generates the SQLite check constraints from it.
2. **The `future.amends` metadata proves insufficient — a first-class cross-source relation is
   needed** (sub-PRD **F2**) → the writeback is `docs/prd/04-corpus-contract/README.md` and the
   `CRPS-01` ticket (the INR contract owner), then this ticket's deliverable 7. Do **not** widen a
   `node_relation` ref shape locally: `CRPS-01` deliverable 11 makes source-scoped natural keys
   load-bearing for the corpus builder.
3. **`SLEG-01`'s `_shared` layout or import root differs from what this ticket assumed**
   (sub-PRD **D11**, **F7**) → follow `SLEG-01`, and update the file-scope note in
   `docs/prd/10-sources-future/README.md` D11 in the same PR. If `pipelines/adapters` has no
   manifest at all, that is a `00-foundation` gap: raise it against `FND-01` rather than creating one
   here (plan §1.1 gives `FND-01` that ownership).
4. **`06-sources-legislation` already emits bill documents**, contradicting sub-PRD **D1**
   (open question **F4**) → stop before writing any adapter. The writeback is
   `docs/prd/10-sources-future/README.md` D1 **and** `docs/prd/06-sources-legislation/README.md`; if
   the module boundary moves, `docs/prd/breakdown-plan.md` §4/§5 changes too and that is an
   escalation, not a local fix. Two groups emitting one law is the exact corpus defect this ticket
   exists to prevent.
5. **A real source needs a status the PRD §6.7 taxonomy does not contain** → that is a **product
   change** under PRD §45.5 (it changes customer-visible legal labelling) requiring founder approval
   and a PRD update. Do not add an eighth status, and do not overload `STATUS_UNCONFIRMED` to mean
   something specific — `STATUS_UNCONFIRMED` is defined by PRD §36.2 as unable to support a
   definitive conclusion, and widening it would weaken every downstream gate.
6. **A source lacks the assumed change-detection or licensing capability** → the writeback is that
   group's `registry.yaml` using PRD §7's explicit limited statuses (`METADATA_AND_LINK_ACTIVE`,
   `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`) plus a `known_gaps` entry with
   `customer_visible: true`, and a note in `docs/prd/10-sources-future/README.md`. Never a silent
   downgrade: PRD §44.4 — *"It is not permitted to silently call an unimplemented source category
   covered."*
7. **The producer-side simulation (deliverable 9) starts being used as the product's filter** →
   forbidden. `FND-10` and `RETR-04` own PRD §36.2. If a consumer wants this logic, the writeback is
   to those tickets, not an export from here; a second implementation of the eligibility predicate is
   the duplication PRD §45.2 forbids.

**Escalation rule.** If PRD §6.5's invariant cannot be made mechanical at emit time — if there is any
way for a wave-5 record to be eligible in current-law mode that this validator cannot see — that
overturns the decomposition premise of this module and endangers PRD §43.3's zero-tolerance
date/status gates and PRD §26's corpus Definition of Done. Stop and escalate for re-review; a
separation model that can be bypassed is worse than none, because it produces evidence that is not
evidence.
