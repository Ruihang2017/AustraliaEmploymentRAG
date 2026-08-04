---
id: RETR-08
title: Evidence sufficiency and evidence-pack candidate assembly
module: 11-retrieval-engine
lane: 11-retrieval-engine
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RETR-06]
blocks: [RETR-10, ASK-02]
---

# RETR-08 — Evidence sufficiency and evidence-pack candidate assembly

Implements PRD §17.1, §36.2, §36.4, §36.7, §15.3 — requirement IDs `SRCH-003` (exact offsets),
`ANS-004` (one pinned release), `ANS-005` (evidence for every material claim, upstream half); epic
`E17-INDEX`.
No ADR — the decision is already made in PRD §36.4 (the evidence-object field list) and PRD §36.2
(the evidence-node counts and the second filter application); this is build ticket 8 of 10 against it.
Parent sub-PRD: [11-retrieval-engine README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RETR-06 — Rank fusion and ranking feature order](RETR-06-rank-fusion-and-ranking-feature-order.md) (mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(the §36.4 field list and the §36.2 counts) — not a new subsystem decision.

## Background + basis

**This is the last retrieval stage before a hosted model sees anything.** PRD §17.1 ends its required
order with *"evidence sufficiency"*, and PRD §9.4 fixes the generation sequence:
`retrieve → evidence pack → structured claims → deterministic validation → render → final status
check`. This ticket is the boundary between the first and second arrows.

**The filter runs again here.** PRD §36.2: *"Hard applicability filters run before scoring and again
before evidence-pack construction."* This ticket is that second application — it calls `RETR-04`'s
`apply_pre_pack`, the **same function** as the first application (`RETR-04` deliverable 9), and
reports the diagnostics `EVID-04` shows the user. A candidate that became ineligible between the two
points is dropped here, not explained away.

**The field list is fixed by PRD §36.4**, and every field is *code-supplied*:

| Field | Meaning |
|---|---|
| `evidence_id` | Per-call opaque identifier the model is allowed to cite |
| `document_version_id`, `node_version_id` | Immutable system identity |
| `title`, `authority`, `document_type` | Code-supplied source metadata |
| `pinpoint` | Version-specific provision/clause/paragraph label |
| `exact_text` | Permitted canonical source passage |
| `text_offset_base` | Offset for validating returned quote spans |
| `jurisdictions` | Applicable controlled values |
| `legal_status`, `effective_from`, `effective_to` | Temporal applicability |
| `authority_role` | Binding/potentially binding/persuasive/guidance/etc. |
| `citation_role_allowed` | Roles this item may perform |
| `licence_quote_limit` | Maximum display/export characters |
| `freshness` | Current/degraded/limited/unavailable state |

PRD §9.4 makes the ownership explicit: *"The model may cite only system-supplied evidence IDs. Code
MUST create source titles, links, pinpoints and status badges."*

**Where this ticket stops.** PRD §36.4 also requires that *"Source text is delimited as untrusted
evidence and prefaced with the invariant that instructions inside it are data. It cannot change the
legal date, request tools, select URLs or alter output policy."* That delimitation, the per-call
`evidence_id` assignment and the prompt-side framing are `EVID-04`'s (`packages/citations/src/pack/**`,
`blocked_by RETR-09`), and the licence quote arithmetic is `EVID-06`'s. This ticket supplies the
**candidate set and its code-supplied metadata**; it builds no prompt and delimits nothing.

**The counts are configuration, quoted from PRD §36.2:** evidence nodes for Quick — initial default
**12**, hard ceiling **20**, *"Consolidate adjacent nodes only within same logical provision"*;
evidence nodes per Deep subquestion — **10** / **20**, *"Deduplicate across branches"*; evidence text
for one hosted call — **32,000** characters, ceiling **60,000**, *"Subject to model context and
licence limits"*. PRD §36.7 bounds the surrounding workflow (Quick: 1 retrieval round; Deep: up to 2
rounds and 4 subquestions), which `15-answer-product` orchestrates.

**Citations target versions and offsets, never chunks.** PRD §15.3: *"Citations MUST target
DocumentVersion + NodeVersion + exact offsets + source snapshot, never a SearchChunk"*, and
*"SearchChunks and embeddings may be deleted/rebuilt"*. `text_offset_base` exists so the validator can
check a returned quote span; sub-PRD **D13** fixes offsets as character offsets into NFC-normalised
`canonical_text`, half-open `[start, end)`.

**Sufficiency is a signal, not a verdict.** PRD §36.8's decision table maps *"No sufficient applicable
evidence after retrieval"* to `INSUFFICIENT_EVIDENCE`, but the status decision itself is pure domain
logic in `packages/domain` (`FND-07`) applied by the answer workflow, and the deterministic validator
is `EVID-05`. This ticket emits the facts — how many applicable nodes, at what authority levels, with
which conjunct removed the rest — and never returns an answer status.

**Carried caveat (accepted for the MVP, documented not enforced):** node consolidation *"only within
same logical provision"* depends on the corpus's node hierarchy being trustworthy. `CRPS-03` guarantees
chunks never cross independent legal nodes; consolidation here is the inverse operation and is bounded
by the same hierarchy. Where the hierarchy is missing, this ticket consolidates nothing rather than
guessing.

## Goal

Produce `services/search-rs/src/evidence/**`: the second PRD §36.2 filter application; consolidation
of adjacent nodes within one logical provision; bounded, deduplicated candidate assembly for Quick and
for each Deep subquestion within the §36.2 node and character budgets; the complete PRD §36.4
code-supplied metadata for every candidate (minus the per-call `evidence_id`, which is `EVID-04`'s);
and a sufficiency report of facts, not verdicts. Completion is mechanically checkable:
`cargo test --workspace` is green, every assembled candidate independently passes the §36.2 predicate,
every `exact_text` slice reproduces the stored node text at the declared offsets, the node and
character budgets are never exceeded, and a deliberately emptied candidate set yields an explicit
insufficiency report rather than an empty success.

## Non-goals

- **No evidence-pack construction, no untrusted-content delimitation, no prompt text, no `evidence_id`
  assignment** — `12-evidence-safety`/`EVID-04` (`packages/citations/src/pack/**`, `blocked_by
  RETR-09`). PRD §36.4's delimitation invariant and PRD §37.5's model boundary are theirs.
- **No licence quote-limit arithmetic or trimming** — `EVID-06`. This ticket passes through the licence
  assessment and permitted-use flags `RETR-04` derived; the enforced limit is computed there and again
  at display/export.
- **No answer status, refusal decision or claim support** — `FND-07` (`packages/domain/src/answers/**`)
  and `EVID-05` (the deterministic validator). This ticket reports sufficiency **facts**.
- **No Quick/Deep orchestration, subquestion planning, rounds, budgets or cancellation** —
  `15-answer-product` (`ASK-02`, `ASK-10`), which is `blocked_by` this ticket. This ticket assembles
  one candidate set per call.
- **No retrieval, filtering, fusion or ranking** — `RETR-02`…`RETR-07`. This ticket consumes ranked
  `EligibleCandidate`s and cannot construct one.
- **No corpus schema change** — `CRPS-01` (PRD §44.3 serial-owned). **No wire-contract change** —
  `RETR-01` owns `src/service/contract/**` (sub-PRD D8); this ticket fills the frozen
  `POST /v1/evidence` endpoint.
- **No model call of any kind** — the search process has no provider credential (PRD §39.1, §39.6).

## File-scope (write-owns)

- `services/search-rs/src/evidence/**` — the second filter application, provision-aware consolidation,
  budgeted assembly for Quick and Deep, the PRD §36.4 metadata projection, deduplication, and the
  sufficiency report.
- `services/search-rs/tests/evidence_*.rs` — this ticket's Rust integration tests (sub-PRD D12).
- Module-shared, append-only (sub-PRD D12, breakdown plan §1.1): `services/search-rs/Cargo.toml`
  (own dependencies only; regenerate `Cargo.lock` as a build artifact, never hand-merge) and
  `services/search-rs/src/lib.rs` (append exactly `pub mod evidence;`).

Does not touch:

- `services/search-rs/src/{main.rs,service}/**` — `RETR-01`; `src/lexical/**` — `RETR-02`;
  `src/exact/**` — `RETR-03`; `src/filters/**` — `RETR-04`; `src/dense/**` — `RETR-05`;
  `src/ranking/**` — `RETR-06`; `src/localmodel/**` — `RETR-07` (all merged before this starts);
  `benches/**`, `src/bench/**` — `RETR-10`. `packages/retrieval-client/**` — `RETR-09`.
- `packages/citations/**`, `packages/pii/**`, `packages/model-gateway/**` — `12-evidence-safety`.
  `packages/domain/**` — `00-foundation`. `apps/worker/**` — `15-answer-product` / `03-app-runtime`.
- `pipelines/**`, `schemas/**` — `04-corpus-contract` / `00-foundation` (PRD §44.3 serial-owned).
- `infra/**`, `tests/**`, `evals/**` — other modules per breakdown plan §4. `docs/PRD.md` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header). `src/evidence/**` is written by no other ticket in the plan. This ticket is the sole
member of its wave in the module's schedule (breakdown plan §7: 6 minimum waves), with `RETR-09`
(`packages/retrieval-client/**`) as the only possible concurrent sibling — a disjoint tree in a
different language. Its declared blocker `RETR-06` is merged first, and through it `RETR-03`,
`RETR-04` and `RETR-05`. Only the two append-only shared files (`Cargo.toml`, `src/lib.rs`) are
touched by more than one ticket, with additive lines only.

## Deliverables

1. **`src/evidence/assemble.rs::assemble_evidence(ranked: &[Ranked], request: &EvidenceRequest,
   release: &ReleaseHandle, profile) -> EvidenceAssembly`** — the entry point behind the frozen
   `POST /v1/evidence` endpoint, with this **ordering constraint**:
   1. **re-apply the hard filters** — call `RETR-04`'s `apply_pre_pack` on the ranked candidates
      (PRD §36.2 *"and again before evidence-pack construction"*). This step is first and is not
      optional; there is no parameter that skips it;
   2. consolidate adjacent nodes within one logical provision (deliverable 2);
   3. deduplicate (deliverable 3);
   4. apply the node budget for the requested mode (deliverable 4);
   5. apply the character budget (deliverable 5);
   6. project the PRD §36.4 metadata (deliverable 6);
   7. compute the sufficiency report (deliverable 7).
   The input type is `Ranked` (wrapping `EligibleCandidate`); this module cannot construct one.
2. **`src/evidence/consolidate.rs`** — PRD §36.2's Quick note *"Consolidate adjacent nodes only within
   same logical provision"*: adjacent `node_version`s that share a parent provision, are contiguous by
   `ordinal`, and belong to the same `document_version`, may be merged into one evidence candidate
   whose text is the concatenation **as stored**, with `text_offset_base` set to the first node's
   offset base and each constituent node's `(node_version_id, start, end)` retained. Consolidation is
   refused — not guessed — when the hierarchy is missing, when a gap in `ordinal` exists, or when the
   nodes have different `legal_status` or `effective_from`/`effective_to`. A consolidated candidate
   still names **every** constituent `node_version_id`, because PRD §15.3 requires citations to target a
   NodeVersion.
3. **`src/evidence/dedupe.rs`** — PRD §36.2's Deep note *"Deduplicate across branches"*: identical
   `node_version_id`s appearing in more than one subquestion's candidate list are emitted once, with
   the set of requesting branches recorded. Deduplication is by node identity, never by text
   similarity (two distinct provisions with identical wording are two pieces of evidence).
4. **`src/evidence/budget.rs` — node budgets from the profile** (`RETR-01` deliverable 7):
   `EvidenceMode::Quick` → `profile.evidence_nodes_quick` (v1 default **12**, hard ceiling **20**);
   `EvidenceMode::DeepSubquestion` → `profile.evidence_nodes_deep_per_subquestion` (**10** / **20**).
   Selection keeps the ranked order from `RETR-06` and never re-ranks; when the budget truncates, the
   count of dropped applicable candidates is recorded in the sufficiency report so the workflow can
   say "more applicable material existed" rather than implying completeness.
5. **Character budget** — `profile.evidence_chars_per_call` (v1 default **32,000**, hard ceiling
   **60,000**, PRD §36.2 *"Subject to model context and licence limits"*). The budget is applied over
   `exact_text` lengths in **characters** (sub-PRD D13), highest-ranked first; a candidate that does
   not fit is **omitted whole**, never truncated mid-passage — a partial provision is a citation
   hazard, and PRD §36.6's validator requires quote offsets to reproduce exact evidence text. Omissions
   are counted in the report. Licence-driven trimming remains `EVID-06`'s.
6. **`src/evidence/project.rs` — the PRD §36.4 metadata projection.** Every candidate is emitted as
   `EvidenceCandidate` carrying, code-supplied from the corpus and the pinned release:
   `document_version_id`, `node_version_id[]`, `title`, `authority {id, name}`, `document_type`,
   `pinpoint` (the version-specific display label — PRD §15.3 *"Provision labels are version-specific
   display values, not permanent IDs"*), `exact_text`, `text_offset_base`, `jurisdictions`,
   `legal_status`, `effective_from`, `effective_to`, `authority_role`, `citation_role_allowed`,
   `licence { assessment_state, permitted_use, attribution_required, quote_limit_chars_from_assessment }`,
   `freshness`, `official_url` (code-generated, PRD §9.4 and §36.6 *"URL is code-generated official
   URL"*), and `corpus_release_id`. **`evidence_id` is deliberately absent** — it is a per-call opaque
   identifier that `EVID-04` assigns (PRD §36.4). `authority_role` and `citation_role_allowed` are
   derived from the PRD §9.1 hierarchy and the document type, never from model output.
7. **`src/evidence/sufficiency.rs::SufficiencyReport`** — facts, not verdicts:
   `{ requested_nodes, applicable_nodes, emitted_nodes, dropped_by_budget, dropped_by_chars,
   consolidated_groups, deduplicated, by_failure: {conjunct -> count}, authority_levels_present: [..],
   has_operative_authority: bool, has_only_guidance: bool, freshness_states: {..},
   metadata_only_candidates, degraded_stages: [..] }`. Two named conditions the workflow needs and the
   engine can state without judging:
   - `has_only_guidance` — every emitted candidate is at PRD §9.1 authority levels 6–8, which
     PRD §9.1 says *"MUST NOT silently override legislation, an operative instrument or binding
     authority"*;
   - `applicable_nodes == 0` with the failing conjunct histogram, the input `FND-07`/`EVID-05` need for
     PRD §36.8's `INSUFFICIENT_EVIDENCE` row.
   The report contains **no** answer status, no refusal and no prose.
8. **Release integrity.** Every emitted candidate's `document_version_id`/`node_version_id` is verified
   against the pinned release handle at emission time, independently of the earlier filter pass. A
   mismatch aborts the assembly with an integrity error rather than emitting the candidate — PRD §36.6
   makes *"Version/node belongs to pinned release"* an integrity incident that *"Fail[s] entire
   execution"*.
9. **Offset fidelity.** For every emitted candidate, `exact_text` is produced by `RETR-01`'s reader
   slicing the stored NFC-normalised `canonical_text` at the recorded character range, and the
   candidate carries the range plus `text_offset_base` so `EVID-05` can validate a returned quote span
   (PRD §36.6 *"Quote offsets reproduce exact evidence text"*). A property test asserts round-tripping
   for every node in the fixture, including the non-ASCII node.
10. **`src/evidence/README.md`** — one page: the seven-step order, the §36.4 field table with the
    explicit note that `evidence_id` belongs to `EVID-04`, the budgets and their ceilings, the
    consolidation rules, and the statement that sufficiency here is a fact set, not a status.

## Acceptance checklist (classified)

- [ ] `[fixture]` **Second filter application**: over the `CRPS-08` fixture, every emitted
      `EvidenceCandidate` independently passes `RETR-04`'s §36.2 predicate — a property test over
      generated requests — and the assembly entry point has no parameter that skips step 1.
      (PRD §36.2 *"and again before evidence-pack construction"*; `SRCH-002`)
- [ ] `[machine]` Same function, not a copy: a test asserts the second application delegates to
      `RETR-04`'s `apply_pre_pack` and that the eligible set equals the first application's for
      unchanged inputs. (PRD §36.2; `RETR-04` deliverable 9)
- [ ] `[machine]` Node budgets: Quick never emits more than `profile.evidence_nodes_quick`; a Deep
      subquestion never more than `profile.evidence_nodes_deep_per_subquestion`; profiles above the PRD
      §36.2 ceilings (20 and 20) are rejected at load. (PRD §36.2)
- [ ] `[machine]` Character budget: total `exact_text` never exceeds
      `profile.evidence_chars_per_call`; a candidate that does not fit is omitted **whole** and counted
      — no truncated passage is ever emitted. (PRD §36.2; §36.6)
- [ ] `[fixture]` Offset fidelity: for every emitted candidate, slicing the stored `canonical_text` at
      the recorded character range reproduces `exact_text` byte for byte, including the fixture's
      non-ASCII node; `text_offset_base` is consistent with the slice. (PRD §36.4, §36.6, §15.3;
      `SRCH-003`; sub-PRD D13)
- [ ] `[machine]` Consolidation: adjacent nodes in one logical provision merge into one candidate that
      still names every constituent `node_version_id`; consolidation is refused across a provision
      boundary, across an `ordinal` gap, and across differing status or effective intervals — one test
      per refusal case. (PRD §36.2 Quick note; §15.3; `CRPS-03`)
- [ ] `[machine]` Deduplication is by node identity, not text similarity: two distinct nodes with
      identical text remain two candidates; the same node requested by two Deep branches is emitted once
      with both branches recorded. (PRD §36.2 Deep note)
- [ ] `[machine]` PRD §36.4 completeness: every emitted candidate carries every §36.4 field this ticket
      owns — asserted by a field-by-field test derived from the §36.4 table — and **does not** carry
      `evidence_id`. (PRD §36.4; §9.4 *"Code MUST create source titles, links, pinpoints and status
      badges"*)
- [ ] `[machine]` Code-generated URLs only: `official_url` is constructed from corpus data; no field in
      the projection is ever populated from model output (there is no model input to this module).
      (PRD §36.6 *"URL is code-generated official URL"*; §9.4)
- [ ] `[machine]` Release integrity: a candidate whose version does not belong to the pinned release
      aborts the assembly with an integrity error and is never emitted. (PRD §36.6; §36.2 conjunct 5;
      `ANS-004`)
- [ ] `[fixture]` Insufficiency is explicit: a request whose filters remove everything returns
      `applicable_nodes == 0` with a populated `by_failure` histogram — never an empty success — and
      `has_only_guidance` is true for a fixture request that retrieves guidance-level material only.
      (PRD §36.8 `INSUFFICIENT_EVIDENCE` input; §9.1)
- [ ] `[machine]` No status, no prose: the response type contains no answer status, no refusal reason
      and no free text beyond `exact_text` and code-supplied metadata — asserted structurally.
      (PRD §36.8 ownership; `FND-07`, `EVID-05`)
- [ ] `[machine]` Licence pass-through: a metadata-only candidate (`PermittedUse.display_text == false`)
      carries no `exact_text` and is counted in `metadata_only_candidates`; the quote limit is passed
      through unmodified for `EVID-06` to enforce. (PRD §11.1; `RETR-04` deliverable 7)
- [ ] `[fixture]` **PRD §13.2 / §39.2 budgets**: assembling a 12-node Quick set from 200 ranked
      candidates completes with p95 ≤ **150 ms** over 200 runs — its share of the §13.2 search p95 ≤ 2 s
      composite `RETR-10` measures end to end, and well inside PRD §36.7's Quick objective of 30 s for
      the whole answer; RSS delta ≤ **8 MiB** across the run inside the PRD §39.2 768 MiB process limit
      (bounded by the 32,000-character text budget). Numbers, method and machine recorded in the PR.
      (PRD §13.2, §36.7, §39.2)
- [ ] `[machine]` `cargo test --workspace` green (Rust; PRD §45.3).
- [ ] `[machine]` `pnpm test` green (standing item, breakdown plan §1.1).
- [ ] `[machine]` PR states requirement IDs `SRCH-003`, `ANS-004`, `ANS-005` and UAT id `UAT-ANS-03`
      (the `INSUFFICIENT_EVIDENCE` path this report feeds); schema/API impact (the frozen
      `POST /v1/evidence` shape and its consumers `RETR-09`, `EVID-04`, `ASK-02`); source/licence impact
      (metadata-only pass-through); latency/memory impact (measured above); rollback path; known gaps.
      (PRD §45.4)
- [ ] No `[human]` criteria — assembly is deterministic logic over a fixture. The human-visible payoff
      (`UAT-ANS-03`, an `INSUFFICIENT_EVIDENCE` answer that reads correctly) is exercised by
      `15-answer-product` and reviewed by the founder at `43.4`/Gate 2.
- [ ] `uv run pytest` not applicable — this ticket touches no Python.

## Test plan

All steps run offline against the committed `CRPS-08` fixture bundle, an index built by `RETR-02`'s
builder and a stub vector index from `RETR-05`'s test helper; no network, no model.

1. `cargo test -p search-rs evidence` then `cargo test --workspace`. Integration tests live in
   `services/search-rs/tests/evidence_*.rs`. Construction pattern to copy: `RETR-04`'s
   `tests/filters_*.rs` property-test shape, and `RETR-01`'s fixture handling.
2. Second application: property test over generated requests asserting every emitted candidate passes
   `is_eligible` independently, plus a test asserting the delegation to `apply_pre_pack` (for example
   by instrumenting the filter's call counter) and equality with the first application's eligible set.
3. Budgets: parametrised over `{Quick, DeepSubquestion} × {under, exactly at, over}` the node budget and
   over character budgets, asserting the counts, the whole-candidate omission rule and the recorded
   drop counts.
4. Offsets: property test over every node in the fixture — slice, compare to `exact_text`, verify
   `text_offset_base`; include the non-ASCII node and a consolidated group.
5. Consolidation: one test per refusal case (provision boundary, ordinal gap, differing status,
   differing interval, missing hierarchy) plus a positive case asserting all constituent
   `node_version_id`s are retained.
6. Dedupe: two Deep branches requesting one node; two distinct nodes with identical text.
7. §36.4 completeness: a field-by-field test enumerating the §36.4 table, asserting presence for the
   fields this ticket owns and **absence** of `evidence_id`.
8. Integrity: inject a candidate from a second loaded release and assert the assembly aborts.
9. Insufficiency: a request restricted to a legal date at which the fixture has no in-force material,
   asserting `applicable_nodes == 0` and a populated failure histogram; a request that retrieves only
   the fixture's guidance-like document, asserting `has_only_guidance`.
10. Budget measurement: `tests/evidence_budget.rs` measures p95 and RSS delta and prints them for the
    PR.
11. Suite green: `cargo test --workspace` and `pnpm test` from the repository root.
12. Reviewer focus: confirm the second filter application cannot be skipped and is the same function;
    confirm no candidate text is ever truncated mid-passage; confirm consolidation refuses rather than
    guesses; confirm `evidence_id` is absent so `EVID-04` remains the only assigner; confirm the
    sufficiency report contains no status or prose; confirm every projected field comes from the corpus
    or the release, never from an upstream stage's inference.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/11-retrieval-engine/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *`EVID-04` needs a §36.4 field this projection does not supply* → the field list is PRD §36.4's
     and the wire shape is `RETR-01`'s frozen contract. Record the need in
     `docs/prd/11-retrieval-engine/README.md` and raise a docs PR against **this ticket and `RETR-01`**
     (and `RETR-09` if the wire type changes) before either side writes code. Never let `EVID-04`
     synthesise a field the engine should have supplied — PRD §9.4 requires code-supplied metadata to
     come from the corpus.
   - *The node or character budget makes a legitimate answer impossible* → the budgets are PRD §36.2
     initial defaults with ceilings, and tuning them is breakdown plan §8 **Q4** (benchmark-selected:
     tuned on development cases only and frozen before validation and blind testing), resolved by
     `RETR-10` and frozen by `GOLD-15`. Report the measurement; the change lands as a docs PR against
     `RETR-01` (the profile owner). Never truncate a passage to fit a budget — PRD §36.6's quote-offset
     check would then fail downstream and the answer would be degraded for an invisible reason.
   - *Node consolidation produces text that reads as one provision but spans two* → refuse the
     consolidation and record the corpus hierarchy defect in
     `docs/prd/11-retrieval-engine/README.md`; the boundary rules belong to `CRPS-03` (chunking) and
     `CRPS-01` (hierarchy). PRD §15.3's *"SearchChunks MUST NOT cross independent legal nodes"* has an
     obvious counterpart here.
   - *The sufficiency report is being used to decide an answer status inside the engine* → stop. PRD
     §36.8's decision table is `FND-07`/`EVID-05` territory; a status decided in two places will
     diverge. Record any pressure to move it in `docs/prd/11-retrieval-engine/README.md` and raise it
     with `12-evidence-safety`.
   - *A licence-restricted candidate needs different treatment than metadata-only pass-through* →
     `EVID-06` owns quote limits and `INGF-04` owns assessments. Pass through, record the case, and
     raise the ticket change against the owner; never resolve a licence ambiguity towards more text.
3. **Falsified protocol.** If applying the hard filters a second time turns out to be impossible at
   this point — for instance because the candidate facts needed are no longer available — then PRD
   §36.2's *"and again before evidence-pack construction"* cannot be honoured inside the search
   boundary, and the last line of defence before a hosted model would move to `EVID-04` alone. Stop,
   escalate for re-review, and write back to `docs/prd/breakdown-plan.md` §5.12/§5.13 plus this sub-PRD
   and `docs/prd/12-evidence-safety/README.md` before shipping a single-application pipeline. Never
   ship evidence assembly that has not re-verified applicability.
