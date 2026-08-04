---
id: FND-10
title: "Domain: temporal applicability and authority hierarchy"
module: 00-foundation
lane: 00-foundation
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-03]
blocks: [EVID-05]
---

# FND-10 — Domain: temporal applicability and authority hierarchy

Implements PRD §36.2, §36.3, §9.1, §15.2, §6.6 and §6.7 (epic `E03-DOMAIN`). No requirement ID of its
own — it is the shared predicate behind **SRCH-002**, **SRCH-005** and **ANS-005**, which are owned
downstream by `14-search-product`, `11-retrieval-engine` and `12-evidence-safety`.
No ADR — the decision is already made in PRD §36.2 (the eligibility conjunction), §36.3 (the ranking
feature order) and §9.1 (the authority hierarchy); this is build ticket 10 of 10 against it.
Parent sub-PRD: [00-foundation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-03 — Canonical enums and opaque ID conventions](FND-03-canonical-enums-and-opaque-id-conventions.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §36.2 states the predicate literally; this makes it pure, total and tested.

## Background + basis

**PRD §36.2, the eligibility predicate, quoted verbatim** — the acceptance target:

```text
requested date ∈ effective interval
AND requested jurisdiction intersects applicable jurisdiction
AND legal status is permitted by request mode
AND document/source use is permitted by licence assessment
AND version and node belong to the pinned CorpusRelease
```

with the surrounding rules:

> Hard applicability filters run before scoring **and again before evidence-pack construction**.
>
> Future/proposed research changes the allowed status set but never relabels future material as current.
> `STATUS_UNCONFIRMED` cannot support a definitive current-law conclusion.

**PRD §36.3 ranking feature order, quoted verbatim:**

> The versioned ranker considers, in this order of safety precedence:
> 1. exact identifier and pinpoint match;
> 2. hard applicability pass;
> 3. authority level and binding/persuasive role;
> 4. direct subject/topic match;
> 5. lexical rank;
> 6. dense/rerank relevance;
> 7. relationship relevance (amends, applies, interprets, replaces);
> 8. source freshness and parser quality.
>
> **No learned score may reintroduce a filtered item** or turn regulator guidance into higher authority
> than the operative legislation/instrument it explains.

**PRD §9.1 authority hierarchy, quoted verbatim** — the eight-level default ordering:

> 1. Constitution and applicable legislation.
> 2. Regulations and legislative instruments.
> 3. Binding judicial authority.
> 4. FWC orders, approved agreements, modern awards and decisions with operative effect.
> 5. Persuasive court, tribunal and FWC decisions.
> 6. Official regulator guidance, rulings, decision summaries and impact materials.
> 7. Explanatory memoranda and interpretive materials.
> 8. Bills, consultations and non-operative future materials.
>
> The engine MUST additionally consider jurisdiction, legal date, commencement, repeal, transitional
> provisions, specific-versus-general rules, instrument interaction, the statutory version interpreted by
> a case and later amendments. **Guidance MUST NOT silently override legislation, an operative instrument
> or binding authority.**

**PRD §15.2 temporal model, quoted verbatim:**

> The system MUST distinguish: publication time; effective time; retrieval time; system knowledge/recorded
> time.
>
> **Legal status MUST be derived from evidenced LegalEvents.** Cached status fields MAY improve
> performance but are not the authoritative history. A query MUST carry `legal_as_at`; an Answer Snapshot
> MUST also carry `knowledge_cutoff_at` and `corpus_release_id`.

**PRD §6.6 historical coverage:** point-in-time retrieval MUST support 2026–27, 2025–26 and 2024–25.
*"Case law and still-operative instruments MUST NOT be excluded solely because they are older than three
financial years. An enterprise agreement MUST NOT be treated as ceased merely because its nominal expiry
date has passed."*

**PRD §6.7 legal status taxonomy** (the seven values, owned as an enum by `FND-03`) plus the rule:
*"Default answers MUST use only material in force at the requested legal date unless the user explicitly
requests historical, future or proposed material."*

**PRD §35.2** gives the interval convention its basis: the `document_version` row's critical constraint is
*"immutable; non-overlap validation where versions represent consolidated effect"*, and §34.2's example
payload carries `"effective_from": "2026-07-01", "effective_to": null`.

**Sub-PRD decision D12, carried forward explicitly:** effective intervals are **closed and inclusive** —
`[effective_from, effective_to]`, with `effective_to: null` meaning open-ended — and adjacent versions
must satisfy `next.effective_from > prev.effective_to`. This is a **cross-module semantic** shared with
`04-corpus-contract`/`CRPS-01`, which owns the columns; it is recorded as sub-PRD open question
**Q-F4** and must be written back if `CRPS-01` chooses otherwise.

**Sub-PRD decision D11, carried forward explicitly:** this ticket owns the authority hierarchy. It exports
`compareAuthority` with the exact signature `(a: AuthorityLevel, b: AuthorityLevel) => -1 | 0 | 1` so
that `FND-07`'s structural port matches **without an import between sibling leaves** (sub-PRD D10).
`AuthorityLevel` is a `FND-03` enum; neither ticket imports the other.

**Accepted caveats carried forward:**

- The **per-mode permitted status sets** are not literally in the PRD. §6.7 and §36.2 give the
  invariants (default = in force at the requested date; future never relabelled current;
  `STATUS_UNCONFIRMED` never definitive); the exact sets are recorded here as the initial rule and
  registered as sub-PRD open question **Q-F5**, owner **Founder** (product ambiguity, PRD §45.5),
  validated by `21-evaluation-600`.
- Retrieval profile constants (lexical and dense candidate counts, rank-fusion weights, rerank depth,
  evidence-node counts) are breakdown plan §8 **Q4**, a **benchmark-selected** parameter owned by
  `11-retrieval-engine`: started from PRD §36.2's buildable initial defaults, tuned on development cases
  only, frozen before validation and blind testing, and recorded through `RETR-10` and `GOLD-15`. It
  blocks nothing here — this ticket owns the §36.2 *filter*, not the §36.2 *count table*, and no
  constant of that kind belongs in `packages/domain`.
- Licence assessment values come from `FND-03`; the licence registry itself is
  `05-ingestion-framework`/`INGF-04`. This module takes an assessment as an input.

## Goal

Produce `packages/domain/src/legal/**`: the PRD §36.2 five-conjunct eligibility predicate as a total,
pure function reporting **every** failing conjunct; the §9.1 authority hierarchy with a comparator that
guarantees guidance never outranks legislation or an operative instrument; the §36.3 feature order as an
ordered constant with a "no filtered item reintroduced" invariant helper; the §15.2 four-time temporal
model with status derived from evidenced events; and the §6.6 financial-year helpers with the two
non-exclusion rules. Completion is mechanically checkable: a 32-row truth table over the five conjuncts
replays green, and property tests prove guidance can never outrank legislation and that a filtered item
can never be reintroduced by any score.

## Non-goals

- **No retrieval execution, indexes, fusion, rerank or scoring** — `11-retrieval-engine`
  (`services/search-rs/**`, `RETR-01` … `RETR-10`). This module supplies the predicate and the feature
  order; the engine applies them.
- **No corpus schema, `document_version` columns, chunker or release manifest** —
  `04-corpus-contract`/`CRPS-01`, `CRPS-02`, `CRPS-03`. The interval semantic is shared (Q-F4) but the
  columns are theirs.
- **No evidence pack, citation validator or repair** — `12-evidence-safety`/`EVID-04`, `EVID-05`
  (`EVID-05` is `blocked_by` this ticket). PRD §36.2 requires the filter to run *again* before
  evidence-pack construction — that second application is `EVID-04`'s call site, using this function.
- **No answer status or claim support** — `FND-07` (sibling leaf; sub-PRD D10 forbids the import).
- **No licence registry, snapshots or permitted-use assessment** — `05-ingestion-framework`/`INGF-04`.
- **No legal-event extraction or ingestion** — `05-ingestion-framework` and the source modules 06–10.
  This module derives status *from supplied evidenced events*; it does not find them.
- **No search UI, filters or timeline screens** — `14-search-product` (`FIND-01` … `FIND-05`).
- **No enum definitions** — `FND-03` owns `LegalStatus`, `AuthorityLevel`, `LicenceAssessmentState`,
  `IndexTier` and the jurisdiction codes.
- **No retrieval profile constants** — breakdown plan §8 Q4, benchmark-selected, owned by
  `11-retrieval-engine` and recorded through `RETR-10`/`GOLD-15`. No candidate count, fusion weight,
  rerank depth or evidence-node count may be introduced here, not even as a default: this module states
  the ordering and the filter, never the numbers.

## File-scope (write-owns)

Owned by this ticket:

- `packages/domain/src/legal/**`
- `packages/domain/test/legal/**` (sub-PRD D14)
- `packages/domain/package.json` — **append-only**, own entries only (sub-PRD D16)

Does not touch:

- `packages/domain/src/{access,answers,workflow,budget}/**` — `FND-06`, `FND-07`, `FND-08`, `FND-09`
  (same wave, sibling leaves; sub-PRD D10 forbids imports between them — `FND-07`'s comparator port is
  satisfied **structurally**).
- `packages/contracts/**` — `FND-03` (merged), `FND-04`/`FND-05` (same wave, different package).
- `pipelines/corpus-builder/**` — `04-corpus-contract`; `services/search-rs/**` and
  `packages/retrieval-client/**` — `11-retrieval-engine`; `packages/citations/**` —
  `12-evidence-safety`; `apps/**` — `03-app-runtime` and the product modules.
- Root manifests, lockfiles, `README.md`, `tools/**` — `FND-01`; `.github/workflows/**` — `FND-02`.

**Serial-safety analysis.** First decomposition; nothing merged, nothing in flight. One of seven wave-3
siblings, all `blocked_by FND-03`; the five `packages/domain` tickets own five disjoint leaf directories
and may not import one another (sub-PRD D10). Only `packages/domain/package.json` is shared, append-only
per breakdown plan §1.1. `packages/domain/src/legal/**` is written by no other ticket in the plan
(breakdown plan §4). The one *semantic* (not path) overlap — the effective-interval convention shared
with `CRPS-01` — is recorded as Q-F4 with a writeback target rather than resolved by a file lock.

## Deliverables

1. **`isEligible(candidate, request): Eligibility`** implementing PRD §36.2's five conjuncts **in the
   PRD's order**, evaluating **all five** (no short-circuit) and returning
   `{ eligible: boolean; failures: EligibilityFailure[] }` with failure names:
   - `OUTSIDE_EFFECTIVE_INTERVAL` — requested date ∉ effective interval;
   - `JURISDICTION_MISMATCH` — requested jurisdiction does not intersect applicable jurisdiction;
   - `STATUS_NOT_PERMITTED_BY_MODE` — legal status not permitted by request mode;
   - `LICENCE_NOT_PERMITTED` — document/source use not permitted by licence assessment;
   - `NOT_IN_PINNED_RELEASE` — version/node not in the pinned CorpusRelease.
   Reporting every failure (not just the first) is deliberate: PRD §36.2 requires the filter to run twice,
   and the second run's diagnostics are what `EVID-04` shows the user.
2. **`PERMITTED_STATUSES_BY_MODE`** — a frozen table for the request modes `CURRENT_LAW`, `HISTORICAL`
   and `FUTURE_OR_PROPOSED`, each entry citing the PRD sentence that justifies it, plus these hard
   invariants asserted independently of the table:
   - default (`CURRENT_LAW`) admits only material in force at the requested legal date (PRD §6.7);
   - future/proposed material is never relabelled current — a `FUTURE_OR_PROPOSED` result carries its own
     status and never `IN_FORCE` (PRD §36.2);
   - `STATUS_UNCONFIRMED` can never support a definitive current-law conclusion — exposed as
     `canSupportDefinitiveCurrentLaw(status): boolean` (PRD §36.2).
   The table is the initial rule and is registered as sub-PRD open question **Q-F5**.
3. **Interval semantics (sub-PRD D12, Q-F4)**:
   - `effectiveIntervalContains(interval, date): boolean` over the **closed inclusive** interval
     `[effective_from, effective_to]`, `null` upper bound meaning open-ended;
   - `assertNonOverlapping(versions): Overlap[]` — adjacent consolidated versions must satisfy
     `next.effective_from > prev.effective_to` (PRD §35.2 *"non-overlap validation where versions
     represent consolidated effect"*). Returns the offending pairs rather than throwing, so the corpus
     builder can quarantine rather than crash.
4. **`AUTHORITY_RANK`** — the PRD §9.1 eight levels as an ordered frozen constant (rank 1 = highest), and
   **`compareAuthority(a: AuthorityLevel, b: AuthorityLevel): -1 | 0 | 1`** with exactly that signature
   (sub-PRD D11 — `FND-07`'s structural port).
5. **`guidanceCannotOutrank(higher, lower): boolean`** encoding PRD §9.1's *"Guidance MUST NOT silently
   override legislation, an operative instrument or binding authority"* and PRD §36.3's *"[no learned
   score may] turn regulator guidance into higher authority than the operative legislation/instrument it
   explains"*: levels 6–8 can never be ordered above levels 1–4, whatever any score says.
6. **`RANKING_FEATURE_ORDER`** — PRD §36.3's eight features as an ordered constant, plus
   `assertNoFilteredItemReintroduced(preFilterIds, postRankIds): Violation[]` implementing *"No learned
   score may reintroduce a filtered item"*. `11-retrieval-engine` calls it after fusion and rerank. The
   constant carries the **order only** — no weight, depth or candidate count (breakdown plan §8 Q4).
7. **Temporal model (PRD §15.2)**: a type distinguishing the four times —
   `published_at`, `effective_from`/`effective_to`, `retrieved_at`, `recorded_at` — and
   `deriveStatus(events, asAt): LegalStatus` computing status **from evidenced `LegalEvent`s only**.
   A supplied cached status is accepted as an input for comparison but never as the answer, and
   `statusDisagreesWithCache(...)` reports the divergence (PRD §15.2: *"Cached status fields MAY improve
   performance but are not the authoritative history"*).
8. **Financial-year helpers (PRD §6.6)**: `financialYearOf(date)` for the Australian financial year
   (1 July – 30 June), `SUPPORTED_FINANCIAL_YEARS = ['2024-25', '2025-26', '2026-27']`, and the two
   non-exclusion predicates:
   - `mustNotExcludeForAge(candidate): boolean` — case law and still-operative instruments are never
     excluded solely for being older than three financial years;
   - `agreementCeased(agreement, asAt): boolean` — an enterprise agreement is **not** ceased merely
     because its nominal expiry date has passed; cessation requires an evidenced event.
9. **Purity and determinism**: no imports outside `packages/contracts` and Node built-ins; no clock (the
   `asAt` date is always an input), no randomness, no I/O (PRD §39.1, §45.2). All dates are
   `YYYY-MM-DD` legal dates (PRD §34.1, §35.1), never `Date` objects with a timezone.
10. **Fixtures** in `packages/domain/test/legal/`:
    - `prd-36-2-eligibility.json` — the five-conjunct truth table, all 32 combinations, with the expected
      `eligible` flag and failure set;
    - `prd-9-1-hierarchy.json` — the eight authority levels in order, transcribed verbatim;
    - `prd-36-3-features.json` — the eight ranking features in order, transcribed verbatim;
    - `boundary-dates.json` — financial-year and interval boundary cases including 30 June / 1 July.

## Acceptance checklist (classified)

- [ ] `[fixture]` §36.2 truth table: all **32** conjunct combinations in `prd-36-2-eligibility.json`
      replay green — `eligible` is true only for the all-true row, and the reported failure set matches
      exactly (PRD §36.2).
- [ ] `[machine]` All five conjuncts are evaluated: a candidate failing three of them reports all three
      failures, not the first (PRD §36.2 — needed for the second, pre-evidence-pack application).
- [ ] `[fixture]` §9.1 hierarchy replay: `AUTHORITY_RANK` matches `prd-9-1-hierarchy.json` in order and
      wording (PRD §9.1).
- [ ] `[fixture]` §36.3 feature order replay: `RANKING_FEATURE_ORDER` matches `prd-36-3-features.json`
      in order (PRD §36.3).
- [ ] `[machine]` Property test (≥10,000 cases): `guidanceCannotOutrank` never lets an authority at
      level 6–8 be ordered above one at level 1–4, for any input (PRD §9.1, §36.3).
- [ ] `[machine]` Property test: `assertNoFilteredItemReintroduced` flags every post-rank id absent from
      the pre-filter set, for randomly generated id sets (PRD §36.3 *"No learned score may reintroduce a
      filtered item"*).
- [ ] `[machine]` No retrieval constant leaks in: `src/legal/**` exports no candidate count, fusion
      weight, rerank depth or evidence-node count, and `RANKING_FEATURE_ORDER` carries order only —
      those values are breakdown plan §8 Q4, benchmark-selected and owned by `RETR-10`/`GOLD-15`.
- [ ] `[machine]` Comparator signature: `compareAuthority` satisfies
      `(a: AuthorityLevel, b: AuthorityLevel) => -1 | 0 | 1` exactly, verified by a type-level test —
      this is `FND-07`'s structural port and must not drift (sub-PRD D11).
- [ ] `[machine]` Boundary dates (sub-PRD **D12**): a version effective `[2024-07-01, 2025-06-30]`
      contains `2024-07-01` and `2025-06-30` and excludes `2025-07-01`; an open-ended interval
      (`effective_to: null`) contains every date on or after `effective_from`; two adjacent consolidated
      versions never both contain one date (PRD §35.2).
- [ ] `[machine]` `assertNonOverlapping` returns the offending pair for
      `[2024-07-01, 2025-06-30]` + `[2025-06-30, null]` and returns empty for
      `[2024-07-01, 2025-06-29]` + `[2025-06-30, null]` (PRD §35.2).
- [ ] `[machine]` Mode rules: `CURRENT_LAW` admits only material in force at the requested date;
      `FUTURE_OR_PROPOSED` results never carry `IN_FORCE`; `canSupportDefinitiveCurrentLaw('STATUS_UNCONFIRMED')`
      is `false` (PRD §6.7, §36.2).
- [ ] `[machine]` `deriveStatus` computes from evidenced events only: given events that contradict a
      supplied cached status, the derived status wins and `statusDisagreesWithCache` reports it
      (PRD §15.2).
- [ ] `[machine]` Financial years: `financialYearOf('2026-06-30') === '2025-26'`;
      `financialYearOf('2026-07-01') === '2026-27'`; `SUPPORTED_FINANCIAL_YEARS` has exactly the three
      PRD §6.6 years (PRD §6.6).
- [ ] `[machine]` Non-exclusion rules: a 2019 still-operative instrument and a 2015 case are not excluded
      for age; an enterprise agreement past its nominal expiry with no evidenced cessation event is not
      ceased (PRD §6.6).
- [ ] `[machine]` Dates are legal-date strings throughout: no `Date` object with timezone semantics
      crosses the module boundary (PRD §34.1, §35.1).
- [ ] `[machine]` No sibling-leaf import: `src/legal/**` does not import
      `src/{access,answers,workflow,budget}/**` (sub-PRD D10).
- [ ] `[machine]` Import-graph purity and determinism: only `packages/contracts` and Node built-ins; no
      `Date.now`, `Math.random` or `process.env` (PRD §39.1, §45.2).
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable. `11-retrieval-engine` re-implements nothing: `RETR-*` calls this predicate
      from the TypeScript side and mirrors only the filter *inputs* into `services/search-rs`.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (`E03-DOMAIN`; underpins
      **SRCH-002**, **SRCH-005**, **ANS-005**; `UAT-SRCH-02`/`UAT-SRCH-03` are exercised downstream by
      `14-search-product` and `23-assurance`), user-visible change and non-goals, schema/API/event
      compatibility impact (none — pure functions; **the interval convention D12 is a cross-module
      semantic, name it**), tenant/PII/security impact (none — public corpus data only),
      **source/licence impact** (licence assessment is a hard eligibility conjunct — PRD §36.2, §11.1),
      cost/memory/latency impact (none), rollback path (revert; only `EVID-05` consumes it), known gaps
      (**Q-F4 interval inclusivity, Q-F5 per-mode status sets**; the retrieval constants are breakdown
      plan §8 Q4 — benchmark-selected by `RETR-10`/`GOLD-15`, deliberately absent here rather than
      missing).

Absent classes: no `[human]` criteria — pure logic. The human-visible consequences are `UAT-SRCH-02`
(*"Search current law with `ENACTED_NOT_IN_FORCE` source present → Future material absent from default
results or visibly separated when requested"*) and `UAT-SRCH-03` (*"Select 2024-08-03 then open result →
Version effective at that date opens; current text is not substituted"*), both owned by
`14-search-product`/`23-assurance`. No evaluation-replay `[fixture]` class here — the PRD §14/§43 replays
are `21-evaluation-600`; the `[fixture]` items above are PRD-table transcriptions.

## Test plan

Reviewer steps, all offline and deterministic (every date is an explicit input; no clock):

1. **Read the fixtures against the PRD.** Compare `prd-9-1-hierarchy.json` with `docs/PRD.md` §9.1 and
   `prd-36-3-features.json` with §36.3, item by item and **in order** — the order is the safety
   precedence, so a reordered fixture silently deletes the rule.
2. **Truth table.** Confirm `prd-36-2-eligibility.json` has all 32 rows (not a sampled subset) and that
   each row lists the expected failure set, not just a boolean. Run the suite:
   `pnpm --filter @<scope>/domain test`.
3. **All-failures negative test.** On a scratch branch make `isEligible` short-circuit on the first
   failing conjunct; assert the multi-failure test fails; discard.
4. **Guidance property.** Confirm the generator produces pairs spanning all eight levels, including
   level 6 vs level 1 and level 8 vs level 4. Run with ≥10,000 cases.
5. **No-constants check.** Run the retrieval-constant test, then read `prd-36-3-features.json` and
   `RANKING_FEATURE_ORDER`: they must carry feature names in order and no numeric weight, depth or
   count. A number here would pre-empt breakdown plan §8 Q4, which is settled by benchmark in
   `RETR-10`/`GOLD-15`.
6. **Boundary dates.** Verify the explicit cases for 30 June / 1 July, `effective_to: null`, and two
   adjacent consolidated versions. This is where sub-PRD **D12/Q-F4** lives — if `CRPS-01` has already
   landed, cross-check its `document_version` column semantics and raise Q-F4 if they differ.
7. **Mode rules.** Verify `FUTURE_OR_PROPOSED` results never carry `IN_FORCE`, and that
   `STATUS_UNCONFIRMED` is rejected for definitive current-law support.
8. **`deriveStatus`.** Verify a case where the cached status and the evidenced events disagree, and that
   the derived value wins (PRD §15.2).
9. **Comparator port.** Run the type-level test; confirm the exported signature is exactly
   `(a: AuthorityLevel, b: AuthorityLevel) => -1 | 0 | 1` so `FND-07`'s port matches structurally.
10. **Purity checks.** Run the import-graph and sibling-leaf tests; grep `src/legal/**` for `Date.now`,
    `new Date(`, `Math.random`, `process.env` — none outside pure `YYYY-MM-DD` string handling.
11. **Append-only manifest.** `git diff packages/domain/package.json` shows additions only.

Harness: the framework `FND-01` registered plus the property-testing library declared in
`packages/domain/package.json`. Fixtures: the four files in deliverable 10. No mocks, no network, no
corpus, no index — the whole point is that the predicate is testable without any of them.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update this ticket and
`docs/prd/00-foundation/README.md` (version +0.1, changelog line) **before** changing code; re-publish
with `publish-tickets.mjs --sync`. Silent divergence = incomplete.

**Foreseeable frictions, each with its writeback target:**

1. **`CRPS-01` models `effective_to` as exclusive**, contradicting sub-PRD **D12**. → This is recorded
   open question **Q-F4**. Update **`docs/prd/00-foundation/README.md` D12/Q-F4** and raise it on
   **`docs/prd/breakdown-plan.md` §4.2** as a contested *semantic* before either side changes code.
   Two modules with different interval conventions produce silently wrong point-in-time results — the
   exact failure `UAT-SRCH-03` is designed to catch, and it would pass on both sides in isolation.
2. **A per-mode permitted-status set is wrong** (a real query needs `SUPERSEDED` in historical mode, or
   `ENACTED_NOT_IN_FORCE` must be visibly separated rather than excluded). → Recorded as **Q-F5**, owner
   **Founder**. Update **`docs/prd/00-foundation/README.md` Q-F5** and this ticket's deliverable 2 first;
   the three invariants (default-in-force, never relabel future, `STATUS_UNCONFIRMED` never definitive)
   are PRD-quoted and may not be relaxed without a PRD change (§45.5).
3. **`RETR-*` needs the eligibility filter inside `services/search-rs` (Rust), where this TypeScript
   module cannot run.** → Do **not** hand-port the predicate: two implementations will diverge. Record
   the constraint in `docs/prd/00-foundation/README.md`, and raise the mechanism (shared test vectors
   generated from `prd-36-2-eligibility.json`, or filtering on the TypeScript side before the query) on
   **`docs/prd/breakdown-plan.md` §4.2**. If a durable technology choice results, it is an ADR
   (`docs/adr/NNNN-eligibility-filter-boundary.md`, PRD §45.5).
4. **`FND-07`'s comparator port and `compareAuthority` do not match structurally.** → Fix it here if the
   signature deviates from D11; otherwise raise it against `FND-07`. Never resolve it by importing
   across `packages/domain` leaves — that breaks sub-PRD D10 and the seven-lane wave-3 safety it buys.
5. **`deriveStatus` cannot be computed from events alone** for a real source (the events are incomplete,
   so only a cached status exists). → PRD §15.2 is explicit that events are authoritative. Record the
   source and gap in `docs/prd/00-foundation/README.md`, and route the ingestion gap to
   `05-ingestion-framework`/`INGF-05` (quarantine) — do not silently promote the cached status to
   authoritative.
6. **An authority level is needed that §9.1 does not list** (e.g. a distinct level for approved
   enterprise agreements versus modern awards). → Product change per PRD §45.5: raise it against
   `FND-03`'s `AuthorityLevel` enum **and** the PRD, and record it in
   `docs/prd/00-foundation/README.md` Open questions with a named owner.
7. **`RETR-10` asks for a retrieval constant to live here** so both sides share one definition. → Do not
   accept it: breakdown plan §8 Q4 gives `11-retrieval-engine` the ownership *and* the measurement, and
   a frozen constant in `packages/domain` would fix a benchmark-selected value in the wrong module.
   Record the request in `docs/prd/00-foundation/README.md` and raise it on
   **`docs/prd/breakdown-plan.md` §4.2** if the ownership genuinely needs to move.

**Escalation.** If PRD §36.2's conjunction proves insufficient as a *hard* filter — for example a
candidate must be admitted despite failing a conjunct — that overturns the safety model behind SRCH-002,
SRCH-005 and ANS-005. Stop, raise an ADR under `docs/adr/`, write back to
`docs/prd/00-foundation/README.md`, and escalate to the human. Never add an exception path inside the
predicate: PRD §36.3 states that no score may reintroduce a filtered item, and a soft filter is the same
failure by another route.
