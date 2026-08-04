---
id: RETR-04
title: Hard legal filters (pre-scoring and pre-pack)
module: 11-retrieval-engine
lane: 11-retrieval-engine
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RETR-02]
blocks: [RETR-06]
---

# RETR-04 — Hard legal filters (pre-scoring and pre-pack)

Implements PRD §36.2, §17.1, §6.7, §11.1, §15.2 — requirement ID `SRCH-002` (*"Advanced Search
applies date, jurisdiction, type, authority and status filters"*, minimum evidence: *"Every result
independently passes all hard filters"*), supporting `SRCH-004` and `ANS-004`; epic `E17-INDEX`.
No ADR — the decision is already made in PRD §36.2 (the five-conjunct eligibility predicate, applied
before scoring and again before evidence-pack construction); this is build ticket 4 of 10 against it.
Parent sub-PRD: [11-retrieval-engine README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RETR-02 — Tantivy lexical/field/citation index](RETR-02-tantivy-lexical-field-citation-index.md) (mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(the §36.2 predicate, already expressed as pure TypeScript by `FND-10`) — not a new subsystem
decision.

## Background + basis

**This is the ticket the product's safety claim rests on.** PRD §2 says the system is safer than a
general chatbot *"by enforcing legal-date and jurisdiction filters, immutable source versions,
claim-level citations, deterministic citation validation, visible uncertainty and refusal when
evidence is insufficient."* The first clause is this ticket.

**The predicate, quoted verbatim.** PRD §36.2:

> Hard applicability filters run before scoring and again before evidence-pack
> construction. A candidate is eligible only if:
>
> ```text
> requested date ∈ effective interval
> AND requested jurisdiction intersects applicable jurisdiction
> AND legal status is permitted by request mode
> AND document/source use is permitted by licence assessment
> AND version and node belong to the pinned CorpusRelease
> ```
>
> Future/proposed research changes the allowed status set but never relabels
> future material as current. `STATUS_UNCONFIRMED` cannot support a definitive
> current-law conclusion.

**Nothing may put a filtered item back.** PRD §17.1: *"Dense similarity and reranking MAY improve
recall/order but MUST NOT override applicability."* PRD §36.3: *"No learned score may reintroduce a
filtered item or turn regulator guidance into higher authority than the operative legislation/
instrument it explains."* Sub-PRD decision **D4** turns that into a type boundary: only this stage can
construct the eligible-candidate type that `RETR-06`, `RETR-07` and `RETR-08` consume, so
reintroduction is not expressible in the language rather than merely forbidden by review.

**"Twice, identically" is the requirement, not "twice".** The pre-scoring application and the
pre-evidence-pack application must be the *same function on the same inputs*; two implementations that
drift are worse than one, because the second is the last line of defence before a hosted model sees
the text. `RETR-08` calls this ticket's function for the second application; `EVID-04` calls
`FND-10`'s TypeScript predicate for the pack it builds in the worker (PRD §9.4's
`retrieve → evidence pack → structured claims → deterministic validation` sequence). All three must
agree.

**There are two implementations of this predicate in the repository, deliberately.** `FND-10`
(`packages/domain/src/legal/**`) owns the pure TypeScript version: `isEligible(candidate, request)`
returning `{ eligible, failures }` with failure names `OUTSIDE_EFFECTIVE_INTERVAL`,
`JURISDICTION_MISMATCH`, `STATUS_NOT_PERMITTED_BY_MODE`, `LICENCE_NOT_PERMITTED`,
`NOT_IN_PINNED_RELEASE`, evaluating **all five conjuncts** without short-circuit; and it commits a
32-row truth table at `packages/domain/test/legal/prd-36-2-eligibility.json` (its deliverables 1 and
10). Sub-PRD decision **D5** makes this ticket re-implement the predicate in Rust — a per-candidate
cross-process call at 100–200 candidates cannot fit the PRD §13.2 p95 ≤ 2 s budget — and **prove
parity by replaying that committed fixture**. Sub-PRD open question **Q-RETR-3** records this as an
ADR candidate and names the writeback path; there is deliberately **no `blocked_by` edge** between
`FND-10` and this ticket (breakdown plan §5.12), so the parity test must degrade to a skip with a
named message if the fixture is absent, never pass silently.

**Two semantics are decided elsewhere and must be matched, not invented:**

- **Interval inclusivity** — `FND-10` decides closed-inclusive `[effective_from, effective_to]` with
  `effective_to: null` meaning open-ended, and adjacent consolidated versions satisfying
  `next.effective_from > prev.effective_to` (its D12; open question Q-F4 shared with `CRPS-01`, which
  owns the columns). This ticket matches it (sub-PRD Q-RETR-5).
- **Per-mode permitted status sets** — the exact sets for `CURRENT_LAW` / `HISTORICAL` /
  `FUTURE_OR_PROPOSED` are **not literally in the PRD**; `FND-10` records an initial rule as its open
  question Q-F5 with the **Founder** as owner. This ticket consumes the same table and asserts only
  the invariants the PRD does fix: default admits only material in force at the requested date
  (§6.7); future material is never relabelled current (§36.2); `STATUS_UNCONFIRMED` can never support
  a definitive current-law conclusion (§36.2). Sub-PRD Q-RETR-4.

**Licence is a permitted-use decision, not a tier.** PRD §11.1 requires `LicenceAssessment` to state
*"commercial-use, storage, indexing, embedding, display, quotation, export, attribution and
prohibited-use decisions"* over the six states `PERMITTED`, `PERMITTED_WITH_ATTRIBUTION`,
`METADATA_AND_LINK_ONLY`, `UNCLEAR_RESTRICTED`, `PROHIBITED`, `REVIEW_REQUIRED`, and states that
*"Unclear rights default to metadata, limited quotation and official links."* `CRPS-04`'s tiering
already excludes `PROHIBITED` material from indexing, but tier is a build-time artefact: this ticket
must re-derive permitted use at request time from the assessment stored in the corpus, because a
`METADATA_AND_LINK_ONLY` document is lexically indexed yet must not yield quotable text.

**Legal status is derived from events, not trusted from a column.** PRD §15.2: *"Legal status MUST be
derived from evidenced LegalEvents. Cached status fields MAY improve performance but are not the
authoritative history."* The filter may use the cached `legal_status` column as a fast path but must
be able to verify it against `legal_event` rows, and must report a divergence rather than hide it.

## Goal

Produce `services/search-rs/src/filters/**`: the PRD §36.2 five-conjunct eligibility predicate in
Rust as a total, non-short-circuiting function reporting every failing conjunct; an
`EligibleCandidate` newtype that **only this module can construct**, so no downstream stage can emit
an ineligible candidate; the request-mode status table and the licence permitted-use derivation; and
the two application points (pre-scoring, and a re-application entry point for `RETR-08`) proven to be
the same function. Completion is mechanically checkable: `cargo test --workspace` is green,
`FND-10`'s committed 32-row truth table replays green in Rust, a property test proves no
`EligibleCandidate` can be constructed outside this module, and every result of every generated
request over the `CRPS-08` fixture independently passes the predicate.

## Non-goals

- **No ranking, fusion, rerank or ordering of any kind** — `RETR-06`/`RETR-07`. This ticket only
  decides eligibility; it never scores.
- **No exact-identifier parsing** — `RETR-03`, the concurrent sibling. This ticket receives the parsed
  classification and filters candidates from any stage identically, including exact hits ("always
  retained **if applicable**").
- **No evidence-pack construction, quote trimming or licence display limits** —
  `12-evidence-safety` (`EVID-04`, `EVID-06`). This ticket decides *eligibility*; the quote-limit
  arithmetic and the untrusted-content delimitation are theirs. `RETR-08` calls this ticket for the
  second application before assembling candidates.
- **No change to `FND-10`** — `00-foundation` owns `packages/domain/src/legal/**` and its fixtures.
  A divergence is a writeback (Feedback obligation), never an edit to their file.
- **No permitted-status product decision** — sub-PRD Q-RETR-4 / `FND-10` Q-F5, owner **Founder**.
  This ticket implements the table and the PRD-fixed invariants; it does not settle the open sets.
- **No licence registry, snapshot or assessment authoring** — `05-ingestion-framework` (`INGF-04`).
  This ticket reads the assessment recorded in the corpus.
- **No tier assignment** — `CRPS-04`. Tier is an input; `EXCLUDED_LICENSING` and `QUARANTINED_QUALITY`
  are never eligible, but tier is not a substitute for this predicate.
- **No corpus schema change** — `CRPS-01` (PRD §44.3 serial-owned).
- **No wire-contract change** — `RETR-01` owns `src/service/contract/**` (sub-PRD D8).

## File-scope (write-owns)

- `services/search-rs/src/filters/**` — the predicate, `EligibleCandidate`, the request-mode status
  table, licence permitted-use derivation, status-from-events verification, the two application
  points, and the parity harness that replays `FND-10`'s fixture.
- `services/search-rs/tests/filters_*.rs` — this ticket's Rust integration tests (sub-PRD D12).
- Module-shared, append-only (sub-PRD D12, breakdown plan §1.1): `services/search-rs/Cargo.toml`
  (own dependencies only; regenerate `Cargo.lock` as a build artifact, never hand-merge) and
  `services/search-rs/src/lib.rs` (append exactly `pub mod filters;`).

Does not touch:

- `services/search-rs/src/{main.rs,service}/**` — `RETR-01`; `src/lexical/**` — `RETR-02` (both merged
  before this starts); `src/exact/**` — `RETR-03` (concurrent sibling); `src/dense/**` — `RETR-05`;
  `src/ranking/**` — `RETR-06`; `src/localmodel/**` — `RETR-07`; `src/evidence/**` — `RETR-08`;
  `benches/**`, `src/bench/**` — `RETR-10`. `packages/retrieval-client/**` — `RETR-09`.
- `packages/domain/**` — `00-foundation` (`FND-10`). This ticket **reads**
  `packages/domain/test/legal/prd-36-2-eligibility.json` and never writes it.
- `pipelines/**`, `schemas/**` — `04-corpus-contract` / `00-foundation` (PRD §44.3 serial-owned).
- `packages/citations/**` — `12-evidence-safety`. `apps/**`, `infra/**`, `tests/**`, `evals/**` —
  other modules per breakdown plan §4. `docs/PRD.md` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header). `src/filters/**` is written by no other ticket in the plan. The concurrent wave-3
sibling is `RETR-03` (`src/exact/**`) — a disjoint directory and test-file prefix; the two meet only
at `RETR-06`, which is `blocked_by` both. `RETR-02`, whose candidates this ticket filters, is the
declared blocker. The one **semantic** overlap — the §36.2 predicate shared with `FND-10` — is a
cross-language duplication recorded as sub-PRD Q-RETR-3 with a writeback target, not a shared file;
`packages/domain/**` is read-only from here.

## Deliverables

1. **`src/filters/eligibility.rs::is_eligible(candidate: &CandidateFacts, request: &FilterRequest)
   -> Eligibility`** — the PRD §36.2 five conjuncts **in the PRD's order**, evaluating **all five**
   (no short-circuit) and returning `Eligibility { eligible: bool, failures: Vec<EligibilityFailure> }`
   with exactly `FND-10`'s failure names:
   `OutsideEffectiveInterval`, `JurisdictionMismatch`, `StatusNotPermittedByMode`,
   `LicenceNotPermitted`, `NotInPinnedRelease`. Reporting every failure is deliberate: the second
   application's diagnostics are what `EVID-04` shows the user, and a search that returns nothing must
   be able to say *why* (PRD §32.1's distinct no-results states).
2. **`src/filters/candidate.rs::EligibleCandidate`** — a newtype wrapping `Candidate` with a
   **private** field and **no public constructor**; the only constructor is
   `filters::apply(...) -> Vec<EligibleCandidate>` inside this module. `RETR-06`, `RETR-07` and
   `RETR-08` consume `EligibleCandidate` and cannot manufacture one. `EligibleCandidate::into_inner()`
   exists for serialisation but there is no `From<Candidate> for EligibleCandidate`. Basis: PRD §36.3
   *"No learned score may reintroduce a filtered item"*; sub-PRD D4. A compile-fail test
   (`trybuild`-style or an equivalent documented mechanism) asserts that constructing one from outside
   the module does not compile.
3. **`src/filters/interval.rs`** — `effective_interval_contains(interval, date) -> bool` over the
   **closed inclusive** interval `[effective_from, effective_to]`, `None` upper bound meaning
   open-ended, matching `FND-10`'s D12 exactly (sub-PRD Q-RETR-5). Dates are `YYYY-MM-DD` legal-date
   strings compared lexicographically after validation — never timezone-bearing timestamps (PRD
   §34.1, §35.1). Boundary behaviour is fixed by test: `[2024-07-01, 2025-06-30]` contains both
   endpoints and excludes `2025-07-01`.
4. **`src/filters/jurisdiction.rs`** — set intersection between the requested jurisdictions and the
   candidate's applicable jurisdictions, using the `FND-03` jurisdiction codes as stored in the corpus.
   An **empty request set means "no jurisdiction restriction"**, which is not the same as an empty
   candidate set: a candidate with no recorded jurisdiction fails the conjunct rather than matching
   everything. Basis: PRD §36.2 conjunct 2; §6.2/§6.3 scope.
5. **`src/filters/status.rs`** — the request-mode status table for `CURRENT_LAW`, `HISTORICAL` and
   `FUTURE_OR_PROPOSED` over the PRD §6.7 taxonomy (`IN_FORCE`, `ENACTED_NOT_IN_FORCE`,
   `BILL_NOT_ENACTED`, `DRAFT_OR_CONSULTATION`, `REPEALED`, `SUPERSEDED`, `STATUS_UNCONFIRMED`), plus
   three invariants asserted **independently of the table**, because they are the PRD-fixed part
   (sub-PRD Q-RETR-4):
   - `CURRENT_LAW` admits only material in force at the requested legal date (PRD §6.7 *"Default
     answers MUST use only material in force at the requested legal date unless the user explicitly
     requests historical, future or proposed material"*);
   - a `FUTURE_OR_PROPOSED` result carries its own status and is **never relabelled** `IN_FORCE`
     (PRD §36.2) — the filter never rewrites a candidate's status field;
   - `can_support_definitive_current_law(STATUS_UNCONFIRMED) == false` (PRD §36.2).
6. **`src/filters/status_evidence.rs`** — `derive_status(events, as_at) -> LegalStatus` from the
   corpus `legal_event` rows, plus `status_disagrees_with_cache(candidate, derived) -> Option<Divergence>`.
   The cached `document_version.legal_status` may be used as the fast path, but a divergence is
   reported as a `Warning` finding on the response and counted, never silently preferred. Basis: PRD
   §15.2 *"Legal status MUST be derived from evidenced LegalEvents. Cached status fields MAY improve
   performance but are not the authoritative history."*
7. **`src/filters/licence.rs`** — permitted-use derivation from the stored `licence_assessment` over
   PRD §11.1's six states, producing `PermittedUse { index: bool, display_text: bool, quote: bool,
   quote_limit_chars: Option<u32>, export: bool, attribution_required: bool }`:
   - `PERMITTED` → all true; `PERMITTED_WITH_ATTRIBUTION` → all true with `attribution_required`;
   - `METADATA_AND_LINK_ONLY` and `UNCLEAR_RESTRICTED` → metadata and official link only, no text
     display, no quote (PRD §11.1 *"Unclear rights default to metadata, limited quotation and official
     links"* — this filter's conservative reading is metadata-and-link, and any quotation allowance is
     `EVID-06`'s licence-limit arithmetic, never this stage's);
   - `PROHIBITED` → not eligible at all (`LicenceNotPermitted`);
   - `REVIEW_REQUIRED` → treated as `UNCLEAR_RESTRICTED` until an assessment exists.
   A candidate that survives with text display disabled is returned as a **metadata-only** result with
   no snippet, not dropped — PRD §11.1 wants the link, not silence. The `PermittedUse` value travels
   with the candidate so `RETR-08` and `EVID-04`/`EVID-06` do not re-derive it.
8. **`src/filters/release.rs`** — conjunct 5: the candidate's `document_version_id` and
   `node_version_id` belong to the **pinned** release handle, verified against the open release rather
   than assumed from the request. A candidate from another release is a `NotInPinnedRelease` failure
   and, if it ever occurs inside one request, an error-level log event — PRD §36.6 treats
   *"Version/node belongs to pinned release"* as an integrity check whose failure consequence is
   *"Fail entire execution as integrity incident"*.
9. **The two application points, one function.**
   - `filters::apply_pre_scoring(candidates, request, release) -> (Vec<EligibleCandidate>, FilterReport)`
     — called after exact and lexical retrieval and before any scoring;
   - `filters::apply_pre_pack(candidates: &[EligibleCandidate], request, release) -> (Vec<EligibleCandidate>, FilterReport)`
     — the re-application `RETR-08` calls before candidate assembly.
   Both delegate to the same `is_eligible`; a test asserts that for a randomly generated corpus of
   candidate facts the two calls produce **identical** eligible sets and identical failure reports
   (PRD §36.2 *"run before scoring and again before evidence-pack construction"*).
10. **`FilterReport`** — `{ examined, eligible, by_failure: {failure -> count}, status_divergences,
    metadata_only }`, surfaced in the response `warnings` and consumed by `RETR-10`'s benchmark and by
    `FIND-04`'s no-results taxonomy. A search that returns nothing must be able to say which conjunct
    removed everything.
11. **Parity harness** — `src/filters/parity.rs` + `tests/filters_parity.rs`: loads
    `packages/domain/test/legal/prd-36-2-eligibility.json` (`FND-10` deliverable 10), maps each of the
    32 rows into `CandidateFacts`/`FilterRequest`, and asserts the Rust `Eligibility` matches the
    recorded `eligible` flag and failure set exactly. If the file is absent, the test **skips with a
    message naming `FND-10` and sub-PRD Q-RETR-3** — never passes silently (there is no `blocked_by`
    edge, breakdown plan §5.12).
12. **`src/filters/README.md`** — one page: the five conjuncts quoted from PRD §36.2, the failure
    names, the `EligibleCandidate` type-boundary rationale, the two application points, and the
    statement that no ranking signal can reintroduce a filtered item.

## Acceptance checklist (classified)

- [ ] `[fixture]` **`FND-10` parity**: all 32 rows of `packages/domain/test/legal/prd-36-2-eligibility.json`
      replay green in Rust — `eligible` true only for the all-true row, failure sets identical — or the
      test skips with a message naming `FND-10` and sub-PRD Q-RETR-3. (PRD §36.2; sub-PRD D5, Q-RETR-3)
- [ ] `[machine]` All five conjuncts evaluate: a candidate failing three reports all three failures,
      not the first. (PRD §36.2 — the second application's diagnostics depend on it)
- [ ] `[machine]` **Type boundary**: a compile-fail test proves `EligibleCandidate` cannot be
      constructed outside `src/filters/**`, and no `From<Candidate>`, `unsafe` transmute or public
      field exists. (PRD §36.3 *"No learned score may reintroduce a filtered item"*; sub-PRD D4)
- [ ] `[machine]` **Idempotent double application**: over 10,000 generated candidate/request pairs,
      `apply_pre_scoring` followed by `apply_pre_pack` yields the identical eligible set and identical
      `FilterReport` as `apply_pre_scoring` alone. (PRD §36.2 *"again before evidence-pack
      construction"*)
- [ ] `[machine]` Interval boundaries: `[2024-07-01, 2025-06-30]` contains `2024-07-01` and
      `2025-06-30` and excludes `2025-07-01`; `effective_to: null` contains every date on or after
      `effective_from`; the convention matches `FND-10`'s D12 exactly. (PRD §35.2; sub-PRD Q-RETR-5)
- [ ] `[fixture]` `SRCH-002` end to end: over the `CRPS-08` fixture, for **every** result of every
      generated request, evaluating `is_eligible` independently on the returned
      `document_version_id`/`node_version_id` returns `eligible` — a property test, not a spot check.
      (PRD §30.2 `SRCH-002` *"Every result independently passes all hard filters"*)
- [ ] `[fixture]` `UAT-SRCH-02` behaviour at the engine boundary: with the fixture's
      `ENACTED_NOT_IN_FORCE` document present, a `CURRENT_LAW` request never returns it, a
      `FUTURE_OR_PROPOSED` request returns it **carrying its own status**, and no code path rewrites a
      status value. (PRD §6.7, §36.2)
- [ ] `[fixture]` `UAT-SRCH-03` behaviour at the engine boundary: a request at the fixture's earlier
      time point returns the version effective then, and the current version is not substituted, at
      each of the fixture's three time points. (PRD §15.2; `CRPS-08` deliverable 1)
- [ ] `[machine]` `STATUS_UNCONFIRMED` can never support a definitive current-law conclusion:
      `can_support_definitive_current_law` is `false`, and a `CURRENT_LAW` request does not return
      `STATUS_UNCONFIRMED` material as eligible current law. (PRD §36.2)
- [ ] `[fixture]` Licence: the fixture's `PROHIBITED` document is never eligible; a
      `METADATA_AND_LINK_ONLY`/`UNCLEAR_RESTRICTED`/`REVIEW_REQUIRED` document is returned as a
      metadata-only candidate with no snippet and `PermittedUse.display_text == false`; tier
      `EXCLUDED_LICENSING` and `QUARANTINED_QUALITY` are never eligible. (PRD §11.1; §17.2; §35.3)
- [ ] `[machine]` Pinned release: a candidate whose version belongs to another loaded release fails
      `NotInPinnedRelease` and emits an error-level integrity log event. (PRD §36.2 conjunct 5; §36.6
      *"Fail entire execution as integrity incident"*)
- [ ] `[machine]` Status divergence: when the cached `legal_status` disagrees with the status derived
      from `legal_event` rows, the divergence is reported in `FilterReport.status_divergences` and the
      **derived** status governs eligibility. (PRD §15.2)
- [ ] `[machine]` Empty jurisdiction request means no restriction; a candidate with no recorded
      jurisdiction fails the conjunct rather than matching everything. (Deliverable 4)
- [ ] `[fixture]` **PRD §13.2 budget contribution**: filtering 200 candidates completes with p95
      ≤ **25 ms** over 200 runs (the stage's share of the §13.2 search p95 ≤ 2 s composite that
      `RETR-10` measures end to end); the stage allocates no per-request index and adds an RSS delta
      ≤ **4 MiB** across the run, inside the PRD §39.2 768 MiB process limit. Numbers, method and
      machine recorded in the PR. (PRD §13.2, §39.2)
- [ ] `[machine]` `cargo test --workspace` green (Rust; PRD §45.3).
- [ ] `[machine]` `pnpm test` green (standing item, breakdown plan §1.1).
- [ ] `[machine]` PR states requirement IDs `SRCH-002`, `SRCH-004`, `ANS-004` and UAT ids
      `UAT-SRCH-02`, `UAT-SRCH-03`; source/licence impact (the six PRD §11.1 states and their
      permitted-use mapping); tenant/PII impact ("none — no tenant data enters this process");
      latency/memory impact (measured above); rollback path; known gaps including the open
      per-mode status sets (sub-PRD Q-RETR-4, owner Founder) and the cross-language duplication
      (Q-RETR-3). (PRD §45.4)
- [ ] No `[human]` criteria at the engine boundary — the predicate is pure logic with a committed truth
      table. The human judgement it depends on (the per-mode status sets, sub-PRD Q-RETR-4) is the
      **Founder's**, staged through `FND-10` Q-F5, and the customer-visible behaviour is smoke-tested
      as `UAT-SRCH-02`/`UAT-SRCH-03` at Gate 2 by `14-search-product`.
- [ ] `uv run pytest` not applicable — this ticket touches no Python.

## Test plan

All steps run offline against the committed `CRPS-08` fixture bundle and an index built by `RETR-02`'s
builder into `tmp_path`; no network.

1. `cargo test -p search-rs filters` then `cargo test --workspace`. Integration tests live in
   `services/search-rs/tests/filters_*.rs`. Construction pattern to copy: `RETR-01`'s
   `tests/service_bundle.rs` for fixture handling and `FND-10`'s
   `packages/domain/test/legal/` fixture-replay shape for the truth table.
2. Parity: `tests/filters_parity.rs` loads `packages/domain/test/legal/prd-36-2-eligibility.json`,
   asserts all 32 rows, and skips with a message naming `FND-10` if the file does not exist. The test
   must fail — not skip — if the file exists but a row disagrees.
3. Type boundary: a compile-fail case asserting `EligibleCandidate { .. }` and
   `EligibleCandidate::from(candidate)` do not compile outside the module; plus a source scan asserting
   no `pub` constructor and no `unsafe` block in `src/filters/candidate.rs`.
4. Double application: property test over 10,000 generated `(CandidateFacts, FilterRequest)` pairs
   asserting set and report equality between one and two applications.
5. `SRCH-002` property test: generate requests over the fixture (random legal dates across the three
   time points, jurisdiction subsets, all three modes, all document types), execute the pipeline, and
   assert every returned result independently satisfies `is_eligible`. Assert also that the union of
   `FilterReport.by_failure` counts plus `eligible` equals `examined`.
6. Licence matrix: one test per PRD §11.1 state over the fixture, asserting eligibility and
   `PermittedUse`; explicitly assert the metadata-only candidate carries no snippet.
7. Status/events: construct candidates whose cached status disagrees with their `legal_event` history
   and assert the derived status governs and the divergence is reported.
8. Release: load the fixture under two aliases and assert a cross-release candidate fails
   `NotInPinnedRelease` and logs at error level.
9. Budget: `tests/filters_budget.rs` measures p95 over 200 runs of 200 candidates and the RSS delta,
   printing both for the PR.
10. Suite green: `cargo test --workspace` and `pnpm test` from the repository root.
11. Reviewer focus (this is the module's highest-risk ticket): confirm there is **no** public path to
    construct `EligibleCandidate`; confirm all five conjuncts are evaluated with no early return;
    confirm the licence mapping is conservative for `UNCLEAR_RESTRICTED`/`REVIEW_REQUIRED`; confirm no
    code rewrites a candidate's `legal_status`; confirm the second application is the same function,
    not a copy; confirm the parity test cannot pass by skipping when the fixture is present; confirm
    the pinned-release conjunct checks the open release handle rather than trusting the request.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/11-retrieval-engine/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *The Rust predicate disagrees with `FND-10`'s truth table* → **stop**. Do not adjust the Rust
     result to match, and do not edit `packages/domain/**`. Record the disagreeing row in
     `docs/prd/11-retrieval-engine/README.md` (Q-RETR-3), raise the ticket change against `FND-10` if
     the TypeScript side is wrong, and — because this is a hard-to-reverse cross-language invariant —
     open `docs/adr/NNNN-cross-language-eligibility-predicate.md` (breakdown plan A9: the creating
     ticket claims the file) recording which implementation is normative and how parity is maintained.
   - *`FND-10`'s truth-table fixture does not exist when this ticket runs* → the parity test skips with
     a named message (deliverable 11) and the PR's "known gaps" section states it. If it is still
     absent when `RETR-06` lands, escalate: an unverified duplicate of the §36.2 predicate is exactly
     the risk Q-RETR-3 exists to track.
   - *The interval convention in the corpus disagrees with `FND-10`'s closed-inclusive rule*
     (sub-PRD Q-RETR-5) → the columns are `CRPS-01`'s and the semantic is `FND-10`'s; write back to
     `docs/prd/11-retrieval-engine/README.md` **and** `docs/prd/breakdown-plan.md` §4.2 (a contested
     semantic, not a contested path) before choosing a convention here. A silent off-by-one-day
     decision is a `UAT-SRCH-03` failure that no test outside this ticket will catch.
   - *A per-mode status set has to change to make a legitimate query work* → that is sub-PRD
     **Q-RETR-4**, owner **Founder**, staged through `FND-10` Q-F5. Record the case in
     `docs/prd/11-retrieval-engine/README.md`; never widen the set locally to satisfy a test.
   - *A licence state has no defensible permitted-use mapping* → default to the most restrictive
     option, record it in `docs/prd/11-retrieval-engine/README.md`, and raise it with
     `05-ingestion-framework` (`INGF-04`, the assessment owner). PRD §11.1's default direction is
     explicit; never resolve ambiguity towards more display.
   - *Filtering 200 candidates cannot meet its latency share* → optimise inside this ticket (precompute
     the facts alongside the index, cache derived status per version within a request) but **never** by
     sampling, short-circuiting the conjuncts, or moving a conjunct behind ranking. If it still cannot
     be met, that is a PRD §13.2 case: *"If a goal cannot be met without violating evidence quality,
     cost or safety, the product MUST preserve correctness and surface delay/degraded status"* — record
     the measurement and route it to `RETR-10` and `RLSE-11`.
3. **Falsified protocol.** If the five-conjunct predicate turns out to be unimplementable as stated —
   for example if "applicable jurisdiction" cannot be determined from the corpus for a whole document
   class — then PRD §36.2 and the product's core safety claim (PRD §2) are in question for that class.
   Stop, escalate for re-review, and write back to `docs/prd/breakdown-plan.md` §8 plus this sub-PRD
   before shipping a partial filter. A retrieval engine that returns material it cannot prove
   applicable is the exact failure this product exists to prevent; never soften the predicate to make
   results appear.
