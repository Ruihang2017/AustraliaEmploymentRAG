---
id: RETR-06
title: Rank fusion and ranking feature order
module: 11-retrieval-engine
lane: 11-retrieval-engine
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RETR-03, RETR-04, RETR-05]
blocks: [RETR-08]
---

# RETR-06 — Rank fusion and ranking feature order

Implements PRD §17.1, §36.2, §36.3, §9.1 — requirement IDs `SRCH-004` (*"Exact provision/case/agreement/ABN
matches outrank semantic similarity"*), `SRCH-002` (no filtered item returns); epic `E17-INDEX`.
No ADR — the decision is already made in PRD §36.3 (the eight ranking features "in this order of
safety precedence") and PRD §36.2 (reciprocal-rank fusion, no raw-score addition); this is build
ticket 6 of 10 against it.
Parent sub-PRD: [11-retrieval-engine README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RETR-03 — Exact-identifier retrieval](RETR-03-exact-identifier-retrieval.md), [RETR-04 — Hard legal filters](RETR-04-hard-legal-filters-pre-scoring-and-pre-pack.md), [RETR-05 — USearch dense index](RETR-05-usearch-dense-index-tiering-quantisation-semantic-cache.md) (mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(the §36.3 feature order and the three upstream stages' candidate outputs) — not a new subsystem
decision.

## Background + basis

**The feature order is a safety order, quoted verbatim.** PRD §36.3:

> The versioned ranker considers, in this order of safety precedence:
>
> 1. exact identifier and pinpoint match;
> 2. hard applicability pass;
> 3. authority level and binding/persuasive role;
> 4. direct subject/topic match;
> 5. lexical rank;
> 6. dense/rerank relevance;
> 7. relationship relevance (amends, applies, interprets, replaces);
> 8. source freshness and parser quality.
>
> No learned score may reintroduce a filtered item or turn regulator guidance into
> higher authority than the operative legislation/instrument it explains.

Two of those eight are not preferences at all: feature 2 is `RETR-04`'s predicate (an item that fails
it is gone, not demoted) and feature 1 carries PRD §36.2's *"Always retained if applicable"*. The
remaining six order what survives.

**Fusion combines ranks, never scores.** PRD §17.1: *"Rank fusion SHOULD combine ranks rather than
directly add incompatible BM25/vector scores and SHOULD explicitly consider exact match, authority,
temporal fit, jurisdiction fit, operative status and legal relationships."* PRD §36.2's table:
*"Rank-fused candidates | 60 | 100 | Reciprocal-rank fusion; no raw-score addition"*. Sub-PRD
decision **D6** makes that structural: the upstream stages hand this ticket rank ordinals, and the
candidate contract does not require a raw score to reproduce an ordering.

**Guidance can never outrank the law it explains.** PRD §9.1 gives the eight-level authority
hierarchy and states: *"Guidance MUST NOT silently override legislation, an operative instrument or
binding authority."* PRD §36.3 repeats it as a ranking constraint. `FND-10` deliverables 4–6 express
this as pure TypeScript — `AUTHORITY_RANK`, `compareAuthority(a, b) => -1 | 0 | 1`,
`guidanceCannotOutrank(higher, lower)`, `RANKING_FEATURE_ORDER` and
`assertNoFilteredItemReintroduced(preFilterIds, postRankIds)` — and commits the fixtures
`packages/domain/test/legal/prd-9-1-hierarchy.json` and `prd-36-3-features.json` (its deliverable 10).
There is deliberately **no `blocked_by` edge** between `FND-10` and this ticket (breakdown plan
§5.12), so parity is asserted by replaying those committed fixtures, skipping with a named message if
they are absent — the same discipline `RETR-04` applies to the §36.2 truth table (sub-PRD Q-RETR-3).

**The rerank safety floor is part of the configuration.** PRD §36.2's table row *"Local rerank
candidates | 30 | 50 | Exact/applicable authority cannot be demoted below safety floor"*. This ticket
defines and enforces the floor; `RETR-07` performs the rerank inside it.

**Nothing here re-checks applicability — it cannot undo it.** `RETR-04`'s `EligibleCandidate` newtype
(sub-PRD D4) is the input type of every function in this ticket; there is no constructor available
here, so "no learned score may reintroduce a filtered item" is a compile-time property rather than a
test. The test still exists, because a reviewer must be able to see it fail if the type boundary is
ever weakened.

**Carried caveat (accepted for the MVP, documented not enforced):** the fusion constant `k` and any
per-stage weights are **benchmark-selected configuration** (PRD §45.5; breakdown plan §8 **Q4**, owner
`11-retrieval-engine`: start from the PRD §36.2 initial defaults, tune on **development cases only**,
freeze **before validation and blind testing**, and record the final profile through `RETR-10` and
`GOLD-15`). This ticket ships buildable initial defaults inside `RETR-01`'s versioned retrieval profile
and makes every weight a profile value, never a literal in the ranking code.

## Goal

Produce `services/search-rs/src/ranking/**`: reciprocal-rank fusion over the exact, lexical and dense
rank lists bounded by `profile.fused_candidates`; the PRD §36.3 eight-feature comparator applied in
safety-precedence order with the PRD §9.1 authority hierarchy and the guidance-never-outranks
invariant; the exact-identifier retention rule and the rerank safety floor; and a machine-readable
ranking explanation for every returned candidate. Completion is mechanically checkable:
`cargo test --workspace` is green, `FND-10`'s hierarchy and feature-order fixtures replay green in
Rust, property tests prove no post-rank id is absent from the pre-rank eligible set and no
guidance-level item is ordered above an operative-legislation item, and the fixture's exact
identifiers rank first.

## Non-goals

- **No filtering** — `RETR-04`. This ticket consumes `EligibleCandidate` and cannot construct one;
  it never re-evaluates the §36.2 predicate and never drops a candidate for an applicability reason.
- **No retrieval** — `RETR-03` (exact), `RETR-02` (lexical), `RETR-05` (dense). This ticket receives
  their outputs.
- **No model-based reranking** — `RETR-07` (`src/localmodel/**`), which is a concurrent sibling and is
  **not** blocked by this ticket; its runtime is the confirmed breakdown plan §8 Q11 local-model
  boundary (ONNX Runtime, CPU-only — sub-PRD D16) and is not this ticket's to choose either. This
  ticket defines the candidate window and the safety floor the reranker must respect and consumes a
  reranked order when one is supplied.
- **No hosted reranker.** PRD §17.3 permits one *"only for approved complex paths when local ranking
  is insufficient"*, and PRD §39.1/§39.6 give the search process no provider credentials. A hosted
  reranker, if ever approved, belongs to `packages/model-gateway` (`EVID-07`) and is out of scope here.
- **No evidence assembly or sufficiency** — `RETR-08` (`src/evidence/**`), which is `blocked_by` this
  ticket.
- **No change to `FND-10`** — `00-foundation` owns `packages/domain/**` and its fixtures. A
  divergence is a writeback, never an edit to their file.
- **No profile constant decision** — breakdown plan §8 **Q4** (benchmark-selected), resolved by
  `RETR-10` and frozen before validation and blind testing. This ticket reads every constant from the
  profile.
- **No wire-contract change** — `RETR-01` owns `src/service/contract/**` (sub-PRD D8).

## File-scope (write-owns)

- `services/search-rs/src/ranking/**` — reciprocal-rank fusion, the §36.3 comparator, the authority
  hierarchy and guidance invariant, retention and safety-floor enforcement, the ranking explanation,
  and the parity harness that replays `FND-10`'s hierarchy/feature fixtures.
- `services/search-rs/tests/ranking_*.rs` — this ticket's Rust integration tests (sub-PRD D12).
- Module-shared, append-only (sub-PRD D12, breakdown plan §1.1): `services/search-rs/Cargo.toml`
  (own dependencies only; regenerate `Cargo.lock` as a build artifact, never hand-merge) and
  `services/search-rs/src/lib.rs` (append exactly `pub mod ranking;`).

Does not touch:

- `services/search-rs/src/{main.rs,service}/**` — `RETR-01`; `src/lexical/**` — `RETR-02`;
  `src/exact/**` — `RETR-03`; `src/filters/**` — `RETR-04`; `src/dense/**` — `RETR-05` (all merged
  before this starts); `src/localmodel/**` — `RETR-07` (concurrent sibling); `src/evidence/**` —
  `RETR-08`; `benches/**`, `src/bench/**` — `RETR-10`. `packages/retrieval-client/**` — `RETR-09`.
- `packages/domain/**` — `00-foundation` (`FND-10`). This ticket **reads**
  `packages/domain/test/legal/prd-9-1-hierarchy.json` and `prd-36-3-features.json` and never writes
  them.
- `pipelines/**`, `schemas/**` — `04-corpus-contract` / `00-foundation` (PRD §44.3 serial-owned).
- `packages/**`, `apps/**`, `infra/**`, `tests/**`, `evals/**` — other modules per breakdown plan §4.
  `docs/PRD.md` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header). `src/ranking/**` is written by no other ticket in the plan. All three declared
blockers (`RETR-03`, `RETR-04`, `RETR-05`) are merged before this starts; the concurrent sibling in
the same wave is `RETR-07` (`src/localmodel/**`) — a disjoint directory and test-file prefix, meeting
this ticket only through the profile's rerank window and the safety floor defined here. Only the two
append-only shared files (`Cargo.toml`, `src/lib.rs`) are touched by more than one ticket, with
additive lines only.

## Deliverables

1. **`src/ranking/fusion.rs::reciprocal_rank_fusion(lists: &[RankList], profile) -> Vec<Fused>`** —
   RRF over the per-stage rank lists (`exact`, `lexical`, `dense`), score
   `Σ_l w_l / (k + rank_l(d))` where `k` and the per-list weights `w_l` come from
   `RetrievalProfile` (`RETR-01` deliverable 7) — never from a literal. Rules:
   - the input is **rank ordinals only**; a raw BM25 or cosine value is not accepted by the function
     signature (sub-PRD D6; PRD §36.2 *"no raw-score addition"*);
   - a candidate absent from a list contributes nothing from that list — it is never imputed a rank;
   - output is bounded by `profile.fused_candidates` (v1 default **60**, hard ceiling **100**,
     PRD §36.2);
   - ties break deterministically by `(document_version_id, node_version_id)` so the same inputs always
     produce the same order (a benchmark that reorders run to run cannot measure recall).
2. **`src/ranking/authority.rs`** — the PRD §9.1 eight levels as an ordered constant with rank 1
   highest:
   1. Constitution and applicable legislation; 2. regulations and legislative instruments;
   3. binding judicial authority; 4. FWC orders, approved agreements, modern awards and decisions with
   operative effect; 5. persuasive court, tribunal and FWC decisions; 6. official regulator guidance,
   rulings, decision summaries and impact materials; 7. explanatory memoranda and interpretive
   materials; 8. bills, consultations and non-operative future materials.
   Exports `compare_authority(a, b) -> Ordering` and
   **`guidance_cannot_outrank(higher, lower) -> bool`**, enforcing that levels 6–8 can never be ordered
   above levels 1–4 *whatever any score says* — the Rust counterpart of `FND-10` deliverable 5.
3. **`src/ranking/features.rs`** — the PRD §36.3 eight features as an ordered constant and a
   **lexicographic comparator** applying them in that exact order:

   | # | Feature | Input |
   |---:|---|---|
   | 1 | exact identifier and pinpoint match | `RetentionClass::ExactIdentifier` + pinpoint depth (`RETR-03`) |
   | 2 | hard applicability pass | guaranteed by the `EligibleCandidate` type (`RETR-04`) — asserted, never re-evaluated |
   | 3 | authority level and binding/persuasive role | deliverable 2; `authority_role` from the corpus |
   | 4 | direct subject/topic match | classification topics ∩ candidate topics/headings |
   | 5 | lexical rank | `RETR-02` rank ordinal |
   | 6 | dense/rerank relevance | `RETR-05` rank ordinal, replaced by `RETR-07`'s reranked ordinal when present |
   | 7 | relationship relevance | `node_relation` (`AMENDS`, `APPLIES`, `INTERPRETS`, `REPLACES`), excluding `MODEL_SUGGESTED` from any status-bearing effect (PRD §9.3) |
   | 8 | source freshness and parser quality | `freshness_status`, `parser_version` (PRD §12.1) |

   Features 5 and 6 are where the fused RRF order enters; features 1–4 dominate it, and 7–8 break
   remaining ties. A feature whose input is missing is neutral — never a penalty that could invert a
   higher-precedence feature.
4. **Exact retention (PRD §36.2 *"Always retained if applicable"*).**
   `apply_retention(fused, exact, profile) -> Vec<Ranked>` guarantees that every `EligibleCandidate`
   carrying `RetentionClass::ExactIdentifier` appears in the output, up to `profile.exact_results`,
   **regardless of its fused rank** — and that it is ordered above any candidate with no exact match at
   the same authority level. Retention applies only to candidates that reached this stage, i.e. that
   already passed `RETR-04`; an inapplicable exact match never arrives here (`RETR-03` deliverable 8).
5. **Rerank window and safety floor.** `rerank_window(ranked, profile) -> (Vec<Ranked>, Floor)` selects
   the top `profile.rerank_candidates` (v1 default **30**, hard ceiling **50**, PRD §36.2) for
   `RETR-07`, and `enforce_floor(reranked, floor) -> Vec<Ranked>` re-applies the floor afterwards:
   **no exact-identifier candidate and no candidate at authority levels 1–4 may be demoted below the
   floor position it held before reranking**. Basis: PRD §36.2 *"Exact/applicable authority cannot be
   demoted below safety floor"*; PRD §17.1 *"reranking … MUST NOT override applicability"*.
   `enforce_floor` is total: a reranked order that violates the floor is **corrected and counted**, not
   rejected, and the correction is reported in the explanation.
6. **`no_filtered_item_reintroduced(pre_rank_ids, post_rank_ids) -> Vec<Violation>`** — the Rust
   counterpart of `FND-10` deliverable 6. Structurally it cannot fail while the `EligibleCandidate`
   type boundary holds; it exists so that a weakening of that boundary fails a test loudly rather than
   silently. Called at the end of the pipeline and in the property tests.
7. **`src/ranking/explain.rs::RankingExplanation`** — per candidate:
   `{ final_rank, retention, feature_values: [f1..f8], stage_ranks: {exact, lexical, dense, rerank},
   rrf_score, floor_corrected: bool, profile_id, profile_version }`. Two consumers: the response's
   `match_reasons` (PRD §34.2 requires code-supplied reasons) and `RETR-10`'s regression analysis. The
   explanation is diagnostic, never prose, and never contains node text.
8. **Parity harness** — `src/ranking/parity.rs` + `tests/ranking_parity.rs`: replays
   `packages/domain/test/legal/prd-9-1-hierarchy.json` (the eight levels in order and wording) and
   `prd-36-3-features.json` (the eight features in order) against deliverables 2 and 3. If a file is
   absent, the test **skips with a message naming `FND-10` and sub-PRD Q-RETR-3** — never passes
   silently (no `blocked_by` edge exists, breakdown plan §5.12).
9. **Determinism and purity.** Ranking is a pure function of `(candidates, classification, profile)`:
   no clock, no randomness, no I/O, no model call. The same inputs produce the same order in every
   process. Basis: PRD §14.4 (versioned, comparable configuration) and the need for a stable
   `RETR-10` recall measurement.
10. **`src/ranking/README.md`** — one page: the eight features quoted from PRD §36.3, the RRF formula
    with its profile-sourced constants, the retention and floor rules, and the statement that this
    module can neither construct nor resurrect an ineligible candidate.

## Acceptance checklist (classified)

- [ ] `[fixture]` `FND-10` parity: `prd-9-1-hierarchy.json` and `prd-36-3-features.json` replay green
      — the Rust hierarchy and feature order match in order and wording — or the test skips with a
      message naming `FND-10` and sub-PRD Q-RETR-3. (PRD §9.1, §36.3)
- [ ] `[machine]` **No filtered item reintroduced**: a property test over ≥10,000 generated candidate
      sets asserts every post-rank id is present in the pre-rank eligible set, and a compile-fail test
      asserts this module cannot construct an `EligibleCandidate`. (PRD §36.3 verbatim; sub-PRD D4)
- [ ] `[machine]` **Guidance never outranks operative law**: a property test over ≥10,000 randomly
      generated pairs and scores asserts no candidate at authority levels 6–8 is ever ordered above one
      at levels 1–4, whatever the RRF score, dense rank or rerank order. (PRD §9.1, §36.3)
- [ ] `[fixture]` `SRCH-004`: for each of the `CRPS-08` fixture's four exact identifiers, the exact
      target is final rank 1 and no dense-only or lexical-only candidate displaces it — including when
      the dense stage is given a deliberately adversarial ordering that puts an unrelated node first.
      (PRD §30.2 `SRCH-004`; §36.2 *"Always retained if applicable"*; §36.3 feature 1)
- [ ] `[machine]` Ranks not scores: `reciprocal_rank_fusion` accepts rank ordinals only — a raw BM25 or
      cosine value is not expressible in its signature — and a test asserts identical output for two
      candidate sets that differ only in raw score. (PRD §17.1, §36.2; sub-PRD D6)
- [ ] `[machine]` Bounds: fused output never exceeds `profile.fused_candidates`; the rerank window never
      exceeds `profile.rerank_candidates`; a profile exceeding the PRD §36.2 hard ceilings (100 and 50)
      is rejected at load. (PRD §36.2)
- [ ] `[machine]` Safety floor: a rerank permutation that demotes an exact-identifier candidate or a
      level-1–4 authority below its pre-rerank floor position is corrected, counted and reported as
      `floor_corrected` — asserted over 1,000 random permutations. (PRD §36.2 *"cannot be demoted below
      safety floor"*)
- [ ] `[machine]` Feature precedence: parametrised tests prove each feature can only break ties left by
      all higher-precedence features — e.g. a large dense advantage (feature 6) never overturns an
      authority-level difference (feature 3), and a freshness advantage (feature 8) never overturns a
      topic match (feature 4). (PRD §36.3 *"in this order of safety precedence"*)
- [ ] `[machine]` `MODEL_SUGGESTED` relations contribute no status-bearing ranking effect and are
      excluded from feature 7's evidence-backed relationship boost. (PRD §9.3 *"LLM-discovered
      relationships are `MODEL_SUGGESTED` and MUST NOT change legal status or support a definitive
      treatment conclusion"*)
- [ ] `[machine]` Determinism: the same inputs produce a byte-identical ranked order across two
      processes; ties break by `(document_version_id, node_version_id)`. (Deliverable 9)
- [ ] `[machine]` Explanation completeness: every returned candidate carries a `RankingExplanation`
      with all eight feature values, its stage ranks and the profile id/version; no explanation field
      contains node text. (PRD §34.2; §22)
- [ ] `[fixture]` **PRD §13.2 budget contribution**: fusing and ranking 200 candidates completes with
      p95 ≤ **30 ms** over 200 runs (its share of the §13.2 search p95 ≤ 2 s composite that `RETR-10`
      measures end to end), with an RSS delta ≤ **4 MiB** across the run inside the PRD §39.2 768 MiB
      process limit. Numbers, method and machine recorded in the PR. (PRD §13.2, §39.2)
- [ ] `[machine]` `cargo test --workspace` green (Rust; PRD §45.3).
- [ ] `[machine]` `pnpm test` green (standing item, breakdown plan §1.1).
- [ ] `[machine]` PR states requirement IDs `SRCH-004`, `SRCH-002`; schema/API impact (`match_reasons`
      and the diagnostic explanation in `RETR-01`'s frozen contract); latency/memory impact (measured
      above); rollback path; known gaps including the benchmark-selected fusion constants (breakdown
      plan §8 Q4, resolved by `RETR-10`). (PRD §45.4)
- [ ] No `[human]` criteria — ranking is pure, deterministic logic with committed fixtures and property
      tests. The human-visible payoff (`UAT-SRCH-01`, the exact-match experience) is exercised by
      `14-search-product` at Gate 2, and the frozen profile is approved at `GOLD-15`.
- [ ] `uv run pytest` not applicable — this ticket touches no Python.

## Test plan

All steps run offline against the committed `CRPS-08` fixture bundle, an index built by `RETR-02`'s
builder and a stub vector index from `RETR-05`'s test helper; no network.

1. `cargo test -p search-rs ranking` then `cargo test --workspace`. Integration tests live in
   `services/search-rs/tests/ranking_*.rs`. Construction pattern to copy: `RETR-04`'s
   `tests/filters_parity.rs` for fixture replay with a named skip, and its property-test shape for the
   ≥10,000-case invariants.
2. Parity: replay both `FND-10` fixtures; fail (not skip) on a present-but-disagreeing file.
3. Invariants: two property tests — no post-rank id outside the pre-rank set; no level-6–8 item above a
   level-1–4 item — each over ≥10,000 generated cases with adversarial scores (dense first, lexical
   first, all-equal, inverted).
4. `SRCH-004`: for each fixture identifier, run the full pipeline with an adversarial dense ordering
   and assert final rank 1; then assert the same with the dense stage `Unavailable`.
5. Floor: generate 1,000 random rerank permutations of a fixed window and assert `enforce_floor`
   restores every protected candidate and sets `floor_corrected`.
6. Precedence matrix: one test per adjacent feature pair, constructing two candidates that differ in
   exactly those two features and asserting the higher-precedence one decides.
7. Determinism: run the ranker twice in separate processes over the same inputs and compare the emitted
   order and explanations byte for byte.
8. Budget: `tests/ranking_budget.rs` measures p95 over 200 runs of 200 candidates and the RSS delta,
   printing both for the PR.
9. Suite green: `cargo test --workspace` and `pnpm test` from the repository root.
10. Reviewer focus: confirm no raw score can enter fusion through any public function; confirm the
    guidance invariant is enforced as a hard constraint rather than a large weight; confirm the safety
    floor is applied **after** rerank, not before; confirm ties are deterministic; confirm the module
    genuinely cannot construct an `EligibleCandidate`; confirm `MODEL_SUGGESTED` relations cannot
    influence a status-bearing ordering.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/11-retrieval-engine/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *The Rust hierarchy or feature order disagrees with `FND-10`'s fixtures* → **stop**. Do not adjust
     either side to match the other silently and do not edit `packages/domain/**`. Record the
     disagreement in `docs/prd/11-retrieval-engine/README.md` (Q-RETR-3) and raise the ticket change
     against the wrong side; if the disagreement is structural, the ADR is
     `docs/adr/NNNN-cross-language-eligibility-predicate.md` (breakdown plan A9), whose scope covers
     the shared §36.2/§36.3 invariants.
   - *Strict lexicographic feature precedence produces obviously poor result quality* → do **not**
     convert the order into a weighted sum: PRD §36.3 says *"in this order of safety precedence"*, and a
     weighted sum is exactly what lets feature 6 overturn feature 3. Tune the **within-feature**
     signals and the RRF constants in the profile, measure with `RETR-10`, and if the order itself must
     change, that is a **product change** requiring founder approval and a PRD update (PRD §45.5) —
     record the case in `docs/prd/11-retrieval-engine/README.md` first.
   - *A fusion constant or weight has to change to hit `RETR-10`'s recall@10 target* → that is
     breakdown plan §8 **Q4**. Report the measured value through `RETR-10`; the change lands as a docs
     PR against `RETR-01` (the profile owner) plus `publish-tickets.mjs --sync`, never as a literal in
     `src/ranking/**`.
   - *The rerank floor blocks a demotion that is genuinely correct* → the floor is PRD §36.2's stated
     rule. Record the case in `docs/prd/11-retrieval-engine/README.md` with the evidence, and route it
     to `GOLD-15`'s promotion evidence; never widen the floor's exceptions inside this ticket.
   - *A relationship type or freshness signal is missing from the corpus* → features 7 and 8 degrade to
     neutral, never to a penalty. If the signal is genuinely required, raise the ticket change against
     `CRPS-01` (PRD §44.3 serial-owned corpus schema) and take the `blocked_by` edge in
     `docs/prd/breakdown-plan.md` §5.12 and §6.2 before writing code.
3. **Falsified protocol.** If the §36.3 order turns out to be unimplementable as a strict precedence —
   for example if feature 2 cannot be represented as a guarantee because some stage can produce an
   unfiltered candidate — then sub-PRD decision **D4** and PRD §36.3's central sentence are falsified.
   Stop, escalate for re-review, and write back to `docs/prd/breakdown-plan.md` §8 plus this sub-PRD
   before shipping. A ranker that can resurrect a filtered item is indistinguishable, to a customer,
   from having no filters at all.
