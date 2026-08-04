---
id: CRPS-04
title: Index-tier assignment policy
module: 04-corpus-contract
lane: 04-corpus-contract
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [CRPS-01]
blocks: [CRPS-05]
---

# CRPS-04 — Index-tier assignment policy

Implements PRD §17.2, §40.1, §11.1 — requirement IDs `SRCH-003` (eligible-corpus indexing) and
`ADM-002` (licensing/quarantine gating of a release), epic `E17-INDEX` (build half).
No ADR — the decision is already made in PRD §17.2 (the five tiers and what each receives) and §40.1
("Licensing can only reduce permitted display/indexing, never be assumed from the tier"); this is
build ticket 4 of 8 against it.
Parent sub-PRD: [04-corpus-contract README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [CRPS-01 — corpus.sqlite schema + intermediate normalised-record contract](CRPS-01-corpus-sqlite-schema-and-intermediate-normalised-record-contract.md) (mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(the tier vocabulary, the licence states and the quarantine rule are all already specified) — not a
new subsystem decision.

## Background + basis

**The tiers and their meaning are fixed.** PRD §17.2:

> - `TIER_1_FULL_SEMANTIC`
> - `TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC`
> - `TIER_3_METADATA_AND_ON_DEMAND`
> - `EXCLUDED_LICENSING`
> - `QUARANTINED_QUALITY`
>
> The complete eligible corpus receives metadata/lexical/field/citation discovery. Tier 1 receives
> full dense indexing; Tier 2 selective/on-demand dense indexing; Tier 3 no default embedding.
> Long-tail lexical hits MAY populate a bounded semantic cache. Embedding eviction MUST NOT remove
> legal evidence.

**Tiering is the cost mechanism, and it must not delete legal scope.** PRD §2: *"It controls cost by
tiering semantic indexing—not by silently deleting agreed legal scope. … the complete eligible corpus
receives lexical/metadata/citation indexing; high-value material receives full dense indexing;
long-tail material receives selective or on-demand semantic processing."*

**The source roster carries an initial tier, and licensing may only reduce it.** PRD §40.1:
*"Initial semantic tiers: `T1` primary/high-frequency full semantic, `T2` lexical plus selective
semantic, `T3` metadata/lexical/on-demand. Licensing can only reduce permitted display/indexing,
never be assumed from the tier."* Every PRD §40.2–40.6 roster row carries an "Initial tier" column.

**Licence states are fixed.** PRD §11.1: *"LicenceAssessment MUST independently state commercial-use,
storage, indexing, embedding, display, quotation, export, attribution and prohibited-use decisions."*
States: `PERMITTED`, `PERMITTED_WITH_ATTRIBUTION`, `METADATA_AND_LINK_ONLY`, `UNCLEAR_RESTRICTED`,
`PROHIBITED`, `REVIEW_REQUIRED`, with *"Unclear rights default to metadata, limited quotation and
official links."*

**Quarantine blocks inclusion.** PRD §35.3, `quarantine_item`: *"cannot enter promoted release while
open"*. PRD §12.2: *"Failed parsing, licensing ambiguity, count anomalies, OCR defects, identity
conflicts and broken structure MUST enter quarantine."*

**The column already exists.** PRD §35.3, `search_chunk`: required column `index_tier`. `CRPS-01`
created the DDL and the enum `CHECK` list generated from `packages/contracts`; this ticket computes
the value.

**Carried caveat (accepted, documented, not enforced here):** the always-hot vector count (planning
hypothesis 150,000–300,000 chunks, PRD §17.2), the semantic-cache entry/byte limit, the resident
memory allocation and the cold/hot tier boundary are breakdown plan §8 **Q3**, whose status is
**deferred until real-scale measurement** and which `RLSE-11` resolves against the real 2 GB
benchmark. The *policy* around those numbers is already settled and is not this ticket's to
re-open: full lexical corpus coverage is kept, hot dense coverage is reduced before lexical scope, the
2 GB production-host budget holds, every process carries an explicit memory limit, and any
dense-coverage downgrade is disclosed rather than silent. This ticket produces a policy whose *output
distribution is measurable*, so that decision has evidence to act on; it does not fix a hot-vector
budget, and it never trims coverage to fit one.

**Downstream.** `CRPS-05` (embedding build) is `blocked_by` this ticket: it embeds only what the
policy marks Tier 1 (and the selective Tier 2 subset). `RETR-05` reads the tier at query time.

## Goal

Produce a pure, evidence-driven tier-assignment policy in
`pipelines/corpus-builder/src/tiering/**` that maps `(source-group initial tier, licence assessment,
quarantine state, document/version attributes)` to exactly one of the five PRD §17.2 tiers per chunk,
with an explicit precedence order in which restrictions always dominate, an auditable per-decision
reason, and an aggregate report of the resulting distribution. Completion is mechanically checkable:
`uv run pytest pipelines/corpus-builder/tests/tiering` is green, including a decision-table test
covering every (initial tier × licence state × quarantine state) combination and a property test
asserting that no input can produce a tier higher than the source group's initial tier.

## Non-goals

- **No chunk production** — `CRPS-03` (`src/chunking/**`) produces `SearchChunkDraft` values without
  a tier; this ticket assigns the tier. The two run concurrently and must not import each other.
- **No embedding, no vector index, no semantic cache** — `CRPS-05` (`pipelines/embeddings/**`) and
  `RETR-05` (`11-retrieval-engine`). PRD §17.2's "bounded semantic cache" and "Embedding eviction MUST
  NOT remove legal evidence" are query-time/runtime behaviours owned by `11`; this ticket only ensures
  its output never marks legal evidence unindexable for cost reasons.
- **No licence assessment authoring** — `INGF-04` (`05-ingestion-framework`,
  `pipelines/ingestion/src/licensing/**`) owns the licence snapshot/assessment registry and the
  permitted-use gate. This ticket **consumes** an assessment; it never decides one.
- **No quarantine engine or run accounting** — `INGF-05` (`05-ingestion-framework`). This ticket
  consumes quarantine state.
- **No Source Coverage Registry** — `INGF-07` (`05-ingestion-framework`, decision A2). The
  source-group initial tier is an input read from the registry/`source` row, not defined here.
- **No release gating** — `CRPS-06` (`src/validation/**`) decides whether a candidate may be built;
  this ticket only labels chunks.
- **No schema change** — `CRPS-01` owns `pipelines/corpus-builder/schema/**` (PRD §44.3 serial-owned).

## File-scope (write-owns)

- `pipelines/corpus-builder/src/tiering/**`
- `pipelines/corpus-builder/tests/tiering/**`
- Module-shared, append-only (breakdown plan §1.1): `pipelines/corpus-builder/pyproject.toml`
  (dependencies only; regenerate the root `uv.lock` as a build artifact, never hand-merge).

Does not touch:

- `pipelines/corpus-builder/schema/**`, `src/contracts/**` — `CRPS-01`. **This module is the sole
  owner of the corpus schema and the release manifest (PRD §44.3, breakdown plan §4.1); no other
  module may write them, and inside the module only `CRPS-01`/`CRPS-02` do.**
- `schemas/corpus-manifest/**`, `src/manifest/**` — `CRPS-02`. `src/chunking/**` — `CRPS-03`.
  `pipelines/embeddings/**` — `CRPS-05`. `src/{build,validation}/**` — `CRPS-06`.
  `src/publish/**` — `CRPS-07`. `fixtures/**` — `CRPS-08`.
- `pipelines/ingestion/**` — `05-ingestion-framework` (licensing, quarantine, registry).
  `pipelines/adapters/**` — modules 06–10. `services/search-rs/**` — `11-retrieval-engine`.
  `packages/**`, `schemas/{openapi,events,evaluation}/**`, `apps/**`, `infra/**`, `evals/**`,
  `tests/**` — other modules per breakdown plan §4. `docs/PRD.md` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header — `phase: 1`, `existingFiles: ['.gitkeep']`). `src/tiering/**` does not exist before
this ticket. Concurrent wave-2 siblings are `CRPS-02` (`schemas/corpus-manifest/**`,
`src/manifest/**`) and `CRPS-03` (`src/chunking/**`) — disjoint sub-trees; the only shared file is the
module's append-only `pyproject.toml`, whose conflicts resolve by re-running `uv lock` (breakdown plan
§1.1, mirroring PRD §44.3's lockfile rule).

## Deliverables

1. `src/tiering/inputs.py` — the explicit input record, so the policy is a pure function of declared
   evidence and can be tested without a database:

   ```text
   @dataclass(frozen=True)
   class TieringInput:
       source_group_id: str
       source_initial_tier: Literal["T1", "T2", "T3"]   # PRD §40.1 / roster rows
       licence_status: LicenceStatus                     # PRD §11.1, six states
       licence_permits_indexing: bool                    # PRD §11.1 per-decision column
       licence_permits_embedding: bool                   # PRD §11.1 per-decision column
       licence_permits_storage: bool                     # PRD §11.1 per-decision column
       quarantine_open: bool                             # PRD §35.3 quarantine_item
       document_type: str
       legal_status: str                                 # PRD §6.7
       is_evidence_bearing: bool                         # operative text vs navigational shell
       node_char_count: int
   ```

2. `src/tiering/policy.py::assign_tier(inp: TieringInput) -> TierDecision` — pure, total, no I/O.
   `TierDecision` = `{tier: IndexTier, reason_code: str, applied_rule: str,
   downgraded_from: IndexTier | None}`. Every decision carries a reason so an operator can answer
   "why is this not embedded?" from data (PRD §12.1's customer-visible source metadata and ADM-001's
   internal visibility both depend on explainable state).
3. **Precedence order (load-bearing).** Rules are evaluated in this exact order; the first match wins
   and later rules may only downgrade, never upgrade:
   1. `quarantine_open` → `QUARANTINED_QUALITY`. Basis: PRD §35.3 "cannot enter promoted release
      while open".
   2. `licence_status in {PROHIBITED}` **or** `licence_permits_storage is False` →
      `EXCLUDED_LICENSING`. Basis: PRD §11.1.
   3. `licence_status in {UNCLEAR_RESTRICTED, REVIEW_REQUIRED, METADATA_AND_LINK_ONLY}` **or**
      `licence_permits_indexing is False` → `TIER_3_METADATA_AND_ON_DEMAND`. Basis: PRD §11.1
      "Unclear rights default to metadata, limited quotation and official links."
   4. `licence_permits_embedding is False` → at most `TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC`
      (dense indexing is off; lexical/metadata remains). Basis: PRD §11.1 lists embedding as an
      independent decision; PRD §40.1 "Licensing can only reduce permitted display/indexing".
   5. Otherwise map the source-group initial tier: `T1 → TIER_1_FULL_SEMANTIC`,
      `T2 → TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC`, `T3 → TIER_3_METADATA_AND_ON_DEMAND`.
      Basis: PRD §40.1.
   6. Non-evidence-bearing structural material (`is_evidence_bearing is False`, e.g. a bare heading or
      a navigational stub) may be reduced by one tier, never below `TIER_3_METADATA_AND_ON_DEMAND`,
      and never for evidence-bearing text. Basis: PRD §17.2 "Tier 3 no default embedding" and
      "Embedding eviction MUST NOT remove legal evidence".
   7. **No rule may ever return a tier above the source-group initial tier.** Asserted as a property
      test, not merely documented.
4. `src/tiering/policy.py::assign_tiers(chunks, inputs_by_node) -> list[ChunkTierAssignment]` —
   the batch entry point returning `{node_version_id, chunk_ordinal, tier, reason_code}` per chunk,
   consuming `CRPS-03`'s `SearchChunkDraft` **by structural fields only** (`node_version_id`,
   `chunk_ordinal`, `char_count`) — the module must not import `src.chunking`, so the two concurrent
   tickets stay decoupled; the shared type is declared in `src/tiering/inputs.py` as a Protocol.
5. **Eligibility rule (load-bearing).** `EXCLUDED_LICENSING` and `QUARANTINED_QUALITY` are *not*
   part of "the complete eligible corpus" (PRD §17.2). Everything else — Tiers 1, 2 and 3 — MUST
   receive metadata/lexical/field/citation indexing. Export
   `is_eligible_for_lexical(tier) -> bool` and `is_eligible_for_dense(tier) -> bool` from this module
   as the single definition used by `CRPS-05` and `CRPS-06`, so "eligible" is never re-derived
   inconsistently in two places.
6. `src/tiering/report.py::tier_distribution(assignments) -> TierReport` — counts and total characters
   per tier, per `source_group_id`, plus the counts of each `reason_code`. This report feeds the
   manifest's `coverage`/`counts` members (`CRPS-02` deliverable 1) via `CRPS-06`, and it is the
   measured evidence input for breakdown plan §8 Q3 (`RLSE-11`'s deferred hot-dense-coverage numbers)
   and Q5 (`GOLD-16`'s deferred corpus statistics).
7. `src/tiering/README.md` — one page: the decision table as a table, the precedence order, the
   "restrictions dominate" rule, and the explicit statement that this module never *decides* a licence
   or a quarantine — it consumes them (`INGF-04`/`INGF-05`).
8. Every reason code is an exported constant with a docstring naming its PRD basis, e.g.
   `REASON_QUARANTINE_OPEN` ("PRD §35.3: cannot enter promoted release while open"),
   `REASON_LICENCE_PROHIBITED`, `REASON_LICENCE_UNCLEAR_DEFAULT_METADATA`,
   `REASON_LICENCE_NO_EMBEDDING`, `REASON_SOURCE_INITIAL_TIER`, `REASON_NON_EVIDENCE_STRUCTURAL`.

## Acceptance checklist (classified)

- [ ] `[machine]` Decision-table test: every combination of (3 initial tiers × 6 licence states × 2
      quarantine states × 2 evidence-bearing flags) produces the documented tier and reason code —
      72 cases enumerated explicitly in the test, not generated from the implementation.
      (PRD §17.2, §11.1, §40.1)
- [ ] `[machine]` Property test: for arbitrary inputs, the returned tier is never "better" than the
      source-group initial tier under the ordering `TIER_1 > TIER_2 > TIER_3 > {EXCLUDED_LICENSING,
      QUARANTINED_QUALITY}`. (Rule 3.7; PRD §40.1)
- [ ] `[machine]` `quarantine_open=True` yields `QUARANTINED_QUALITY` regardless of every other input,
      including a `T1` + `PERMITTED` source. (PRD §35.3)
- [ ] `[machine]` `licence_status=UNCLEAR_RESTRICTED` never yields Tier 1 or Tier 2, for any initial
      tier. (PRD §11.1 "Unclear rights default to metadata, limited quotation and official links")
- [ ] `[machine]` `licence_permits_embedding=False` with `PERMITTED` status and a `T1` source yields
      `TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC`, not `EXCLUDED_LICENSING` — a licence that forbids
      embedding must not delete lexical coverage. (PRD §2, §17.2, §40.1)
- [ ] `[machine]` `is_evidence_bearing=True` material is never reduced by rule 3.6 — asserted for
      every tier. (PRD §17.2 "Embedding eviction MUST NOT remove legal evidence")
- [ ] `[machine]` `is_eligible_for_lexical()` is true for Tiers 1–3 and false for `EXCLUDED_LICENSING`
      and `QUARANTINED_QUALITY`; `is_eligible_for_dense()` is true only for Tier 1 and the selective
      Tier 2 path. (Deliverable 5; PRD §17.2)
- [ ] `[machine]` Every `TierDecision` carries a non-empty `reason_code` drawn from the exported
      constant set, and `downgraded_from` is set exactly when a downgrade occurred. (Deliverable 2)
- [ ] `[machine]` `tier_distribution()` totals equal the input chunk count and are grouped per source
      group and per reason code. (Deliverable 6)
- [ ] `[machine]` `src/tiering/**` does not import `src.chunking` or `src.manifest` — asserted by an
      import test, so the concurrent-ticket boundary cannot erode. (Deliverable 4)
- [ ] `[machine]` `assign_tier()` is total: no input in the decision table raises, and an unknown
      licence state raises a typed `UnknownLicenceState` rather than silently defaulting to a
      permissive tier — fail closed. (PRD §11.1; §12.2)
- [ ] `[machine]` No memory, cost or hot-vector budget appears anywhere in `src/tiering/**` — asserted
      by a source scan for budget-shaped constants — so a deferred Q3 number can never be smuggled in
      as a tier downgrade. (PRD §2 "not by silently deleting agreed legal scope"; breakdown plan §8 Q3)
- [ ] `[machine]` `uv run pytest` green (Python; PRD §45.3).
- [ ] `[machine]` `pnpm test` green (standing item, breakdown plan §1.1).
- [ ] `[machine]` PR states requirement IDs `SRCH-003`, `ADM-002`; source/licence impact ("consumes
      licence assessments; never authors one"); cost/memory impact (the tier distribution drives
      embedding cost); rollback path; known gaps including the deferred Q3/Q5 measurements.
      (PRD §45.4)
- [ ] No `[fixture]` criteria — the policy is a pure decision function with no recorded-data replay;
      the corpus-wide distribution is exercised in `CRPS-06`'s build fixture.
- [ ] No `[human]` criteria — no user-visible surface. The customer-visible consequence (limited
      source states) is `ADM-001`/`INGF-07`. Launch scope is governed by breakdown plan §8 **Q10**, a
      **confirmed policy**: no mandatory source group is pre-selected for omission, every group is
      attempted in full, no scope is cut for a date, and a limited state is permitted only on measured
      evidence of a genuine official-source limitation — recorded with the evidence, affected
      dates/collections, the customer-visible warning and the reason. `GOLD-16` produces that evidence
      and `LNCH-05` verifies the launch statement; Gate 2 is verification and sign-off, not a scope
      decision, and nothing in this ticket may pre-empt it.
- [ ] `cargo test --workspace` not applicable — this ticket touches no Rust.

## Test plan

All steps run offline; no network, no credentials.

1. `uv run pytest pipelines/corpus-builder/tests/tiering -q`.
   Harness: pytest with `@pytest.mark.parametrize` over an explicit 72-row decision table declared in
   `tests/tiering/test_decision_table.py` as literal data. The table is the specification: if the
   implementation changes, the table must be edited deliberately.
2. Property tests with Hypothesis over `TieringInput` (strategies for each field), asserting the
   monotonicity rule 3.7, the evidence-bearing protection (rule 3.6) and totality.
3. Import-boundary test: `tests/tiering/test_module_boundary.py` imports `src.tiering` in a fresh
   interpreter and asserts `src.chunking` and `src.manifest` are absent from `sys.modules`.
4. Report test: assign tiers over a 1,000-chunk synthetic assignment set spanning three source groups
   and assert the distribution totals and per-reason counts.
5. Suite green: `uv run pytest` and `pnpm test` from the repository root.
6. Reviewer focus (security/licensing-sensitive path): confirm no code path can *upgrade* a tier;
   confirm an unknown or missing licence assessment fails closed rather than defaulting to
   `PERMITTED`; confirm `EXCLUDED_LICENSING` material is excluded from *both* eligibility predicates;
   confirm no licence decision logic (as opposed to consumption) has leaked in from `INGF-04`; confirm
   no budget or capacity number has leaked in from the deferred Q3 measurement.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/04-corpus-contract/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *The `licence_permits_*` decisions are not available as separate booleans from `INGF-04`'s
     assessment* → PRD §11.1 requires them to be stated independently. Do not collapse them into the
     status. Raise it against `INGF-04` as a ticket-change request in
     `docs/prd/05-ingestion-framework/tickets/`, and record the dependency in
     `docs/prd/04-corpus-contract/README.md`; if a `blocked_by` edge is genuinely needed, it goes into
     `docs/prd/breakdown-plan.md` §5.5 **and** §6.2 first.
   - *Tier 1 volume exceeds the always-hot vector budget* (breakdown plan §8 Q3, deferred until
     real-scale measurement) → this ticket does **not** silently downgrade material to fit a budget:
     that would be "silently deleting agreed legal scope" (PRD §2), and the settled Q3 policy already
     requires hot dense coverage to be reduced before lexical scope and any downgrade to be disclosed.
     Publish the measured distribution via deliverable 6 and let `RLSE-11` make the documented
     reduction decision; record the finding in `docs/prd/04-corpus-contract/README.md` (Q3).
   - *A source group needs a per-document (not per-group) initial tier* → extend `TieringInput` and
     the decision table in **this ticket**, and note the change in
     `docs/prd/04-corpus-contract/README.md`. The registry side is `INGF-07` (decision A2) — do not
     write a per-document tier table into an adapter directory.
   - *The policy needs chunk text (not just structure) to decide* → that would couple this ticket to
     `CRPS-03`'s output semantics and break the concurrent-lane guarantee. Raise it as a plan change
     in `docs/prd/breakdown-plan.md` §5.5/§6.2 (an edge `CRPS-03 → CRPS-04`) rather than importing
     across the boundary.
3. **Falsified protocol.** If PRD §17.2's tier model itself proves unworkable — for example if
   "the complete eligible corpus receives metadata/lexical/field/citation discovery" cannot be
   afforded at measured scale — that is a **product change** under PRD §45.5 (it changes the coverage
   promise) and requires founder approval and a PRD update. Stop, escalate for re-review, and write
   back to `docs/prd/04-corpus-contract/README.md` and `docs/prd/breakdown-plan.md` §2.1 first. Never
   narrow coverage inside this ticket.
