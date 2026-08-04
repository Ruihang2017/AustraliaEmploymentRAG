---
id: FND-07
title: "Domain: answer status, claim support, citation role, refusal table"
module: 00-foundation
lane: 00-foundation
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-03]
blocks: [EVID-04]
---

# FND-07 — Domain: answer status, claim support, citation role, refusal table

Implements PRD §8.4, §9.1, §15.5 and §36.8, requirement **ANS-005** (epic `E03-DOMAIN`).
No ADR — the decision is already made in PRD §36.8 (the refusal/status decision table) and §15.5 (claim
support and citation roles); this is build ticket 7 of 10 against it.
Parent sub-PRD: [00-foundation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-03 — Canonical enums and opaque ID conventions](FND-03-canonical-enums-and-opaque-id-conventions.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §36.8 is a finished decision table; this makes it executable in pure code rather than in a prompt.

## Background + basis

**PRD §36.8 refusal/status decision table, transcribed verbatim** — the acceptance target:

| Condition | Result |
|---|---|
| Evidence supports all material claims | `SUPPORTED` |
| Evidence supports branches but material fact is unknown | `CONDITIONAL` |
| No sufficient applicable evidence after retrieval | `INSUFFICIENT_EVIDENCE` |
| Applicable authorities materially conflict and cannot be reconciled | `CONFLICTING_SOURCES` |
| Request is outside employment-law/product function | `OUT_OF_SCOPE` |
| Relevant source is stale/unavailable and could change answer | `SOURCE_NOT_CURRENT` |
| Employee PII detected | Request rejected before job; no answer status |
| Unlawful operational-evasion request | Refusal with lawful compliance/remediation alternative |
| Provider/budget unavailable | Job unavailable; Search and saved records remain available |

and its closing rule:

> Words such as "definitely compliant", "guaranteed", "zero risk" and numeric model-confidence
> percentages are prohibited. Uncertainty is represented by status, assumptions, missing facts, conflicts
> and evidence roles.

**PRD §15.5** fixes the claim/citation vocabulary and one hard rule:

> Claim support values: `DIRECTLY_SUPPORTED`, `SUPPORTED_BY_INFERENCE`, `CONDITIONAL`, `CONTRADICTED`,
> `NOT_SUPPORTED`.
> Citation roles: `SUPPORTS`, `QUALIFIES`, `CONTRADICTS`, `DEFINES`, `BACKGROUND_ONLY`.
> **`BACKGROUND_ONLY` evidence cannot independently support a definitive legal claim.**

**PRD §8.4** fixes the answer structure and the status set:

> 1. Short answer: Yes, No, Likely, Depends or insufficient evidence. 2. Explanation and application.
> 3. Conditions and assumptions. 4. Claim-level authorities. 5. Practical next steps/checks.
> 6. Limitations and unresolved facts.
>
> Answer statuses: `SUPPORTED`, `CONDITIONAL`, `INSUFFICIENT_EVIDENCE`, `CONFLICTING_SOURCES`,
> `OUT_OF_SCOPE`, `SOURCE_NOT_CURRENT`.

**PRD §9.1** supplies the conflict rule this ticket must respect without owning the hierarchy:
*"Guidance MUST NOT silently override legislation, an operative instrument or binding authority."*
Sub-PRD decision **D11**: the eight-level ordering and the comparator implementation are `FND-10`
(`packages/domain/src/legal/**`); this ticket declares a **structural port** typed over `AuthorityLevel`
(a `FND-03` enum) and never imports its sibling.

**PRD §9.4 evidence-first synthesis** is why this logic is code, not prompt text:

> The generation sequence MUST be: `retrieve → evidence pack → structured claims → deterministic
> validation → render → final status check`. The model may cite only system-supplied evidence IDs. **Code
> MUST create source titles, links, pinpoints and status badges.** … A bounded repair attempt MAY be
> made; remaining unsupported claims MUST be removed and the answer downgraded/refused.
>
> Hidden chain-of-thought MUST NOT be requested, stored or displayed.

**Requirement ANS-005** (PRD §30.2): *"Every material claim has validated source evidence or is
removed/downgraded | Answer result | answer snapshot | App/ephemeral | **Unsupported definitive claim
count is zero**"*.

**Sub-PRD decision D13, carried forward explicitly.** The PRD states the conditions but not their
precedence when two hold at once. D13 fixes: **the more restrictive status wins; a status more permissive
than any triggered condition is never selected.** Basis: PRD §2 (*"visible uncertainty and refusal when
evidence is insufficient"*) and §9.4 (*"remaining unsupported claims MUST be removed and the answer
downgraded/refused"*). This is recorded as sub-PRD open question **Q-F3**, owner **Founder** (a
`PRODUCT_AMBIGUITY` classification under PRD §43.4); it is buildable today and must be written back if
the `21-evaluation-600` refusal cases falsify it.

**Accepted caveats carried forward:**

- Rows 7–9 of §36.8 are **not** answer statuses. PII rejection happens before a job exists (PRD §10.1,
  §37.2, error `EMPLOYEE_PII_DETECTED`); unlawful-evasion refusal is a refusal, not a status (PRD §9.5);
  provider/budget unavailability is a job outcome (`GENERATION_UNAVAILABLE`, PRD §34.9) with Search
  still available (PRD §8.2). This ticket models them as a separate outcome type, never as an
  `AnswerStatus`.
- The deterministic citation validator itself is `12-evidence-safety`/`EVID-05`; evidence-pack
  construction is `EVID-04`, which is `blocked_by` this ticket. This ticket decides status **from
  validated inputs**; it does not validate offsets, licences or corpus membership.

## Goal

Produce `packages/domain/src/answers/**`: the PRD §36.8 table as executable, ordered logic with a
documented precedence; claim-support classification honouring §15.5's `BACKGROUND_ONLY` rule; the §8.4
answer-section order as a constant; and a prohibited-certainty-language detector for §36.8's final
paragraph — all pure, framework-free and unit-tested. Completion is mechanically checkable: every §36.8
row replays against a fixture, and a claim citing only `BACKGROUND_ONLY` evidence can never be
`DIRECTLY_SUPPORTED`.

## Non-goals

- **No evidence-pack construction, delimitation or untrusted-content handling** —
  `12-evidence-safety`/`EVID-04` (`packages/citations/src/pack/**`), which is `blocked_by` this ticket.
- **No deterministic citation validator or bounded repair** — `EVID-05`
  (`packages/citations/src/validator/**`), whose twelve §36.6 checks are its own ticket.
- **No authority hierarchy or ranking** — `FND-10` (sub-PRD D11). This ticket declares the comparator
  port and ships a test double; it must not rank authorities itself.
- **No temporal or jurisdiction eligibility** — `FND-10` owns PRD §36.2's predicate. `SOURCE_NOT_CURRENT`
  here is a *status decision from a supplied freshness signal*, not a freshness computation.
- **No PII detection** — `12-evidence-safety`/`EVID-01` (`packages/pii/**`), PRD §10.1/§37.2.
- **No model prompts, provider calls or output parsing** — `12-evidence-safety`/`EVID-07`
  (`packages/model-gateway/**`). PRD §9.4 forbids hidden chain-of-thought anywhere.
- **No answer rendering, screens or copy** — `15-answer-product` (`ASK-*`) and `packages/ui`
  (`03-app-runtime`/`RUNT-06`).
- **No enum definitions** — `FND-03` owns `AnswerStatus`, `ClaimSupport`, `CitationRole`,
  `AuthorityLevel` and the §34.9 error codes.
- **No budget or provider-availability arithmetic** — `FND-09` and `EVID-08`.

## File-scope (write-owns)

Owned by this ticket:

- `packages/domain/src/answers/**`
- `packages/domain/test/answers/**` (sub-PRD D14)
- `packages/domain/package.json` — **append-only**, own entries only (sub-PRD D16)

Does not touch:

- `packages/domain/src/{access,workflow,budget,legal}/**` — `FND-06`, `FND-08`, `FND-09`, `FND-10`
  (same wave, sibling leaves; sub-PRD D10 forbids imports between them — the `AuthorityComparator` port
  is **structural**, not an import).
- `packages/contracts/**` — `FND-03` (merged), `FND-04`/`FND-05` (same wave, different package).
- `packages/citations/**`, `packages/pii/**`, `packages/model-gateway/**` — `12-evidence-safety`.
- `apps/**` — `03-app-runtime` and the product modules.
- Root manifests, lockfiles, `README.md`, `tools/**` — `FND-01`; `.github/workflows/**` — `FND-02`.

**Serial-safety analysis.** First decomposition; nothing merged, nothing in flight. One of seven wave-3
siblings, all `blocked_by FND-03`; the five `packages/domain` tickets own five disjoint leaf directories
and may not import one another (sub-PRD D10), so parallel lanes share no source file. Only
`packages/domain/package.json` is shared, append-only per breakdown plan §1.1.
`packages/domain/src/answers/**` is written by no other ticket in the plan (breakdown plan §4).

## Deliverables

1. **`REFUSAL_TABLE`** — the six §36.8 status rows as ordered data, each with its condition name, the
   PRD's condition wording and its resulting `AnswerStatus`. The three non-status rows (PII, unlawful
   evasion, provider/budget) are modelled separately as `PreAdmissionOutcome` /
   `JobUnavailableOutcome`, each carrying the PRD's stated consequence — including *"Search and saved
   records remain available"* for the provider/budget row (PRD §36.8, §8.2).
2. **`decideAnswerStatus(signals): AnswerStatus`** over an explicit signal record —
   `{ outOfScope, sourceStaleOrUnavailableAndMaterial, unreconciledAuthorityConflict,
   sufficientApplicableEvidence, allMaterialClaimsSupported, materialFactUnknown }` — implementing the
   §36.8 rows with the **D13 precedence**: evaluate the restrictive conditions first
   (`OUT_OF_SCOPE` → `SOURCE_NOT_CURRENT` → `CONFLICTING_SOURCES` → `INSUFFICIENT_EVIDENCE` →
   `CONDITIONAL` → `SUPPORTED`), and never return a status more permissive than any triggered condition.
   The function returns the status **and** the list of every condition that fired, so the caller can
   surface all of them (PRD §36.8: uncertainty is represented by status, assumptions, missing facts and
   conflicts — not by a single silent choice).
3. **`classifyClaimSupport(claim, citations, compareAuthority): ClaimSupport`** implementing §15.5, with
   these hard rules:
   - a claim whose citations are all `BACKGROUND_ONLY` is `NOT_SUPPORTED` and can never be
     `DIRECTLY_SUPPORTED` or `SUPPORTED_BY_INFERENCE` (PRD §15.5);
   - a claim with a `CONTRADICTS` citation from an authority that `compareAuthority` ranks at or above
     its supporting citations is `CONTRADICTED`;
   - `compareAuthority` is the **structural port**
     `(a: AuthorityLevel, b: AuthorityLevel) => -1 | 0 | 1`, supplied by the caller; `FND-10` exports a
     function of exactly this signature. This module ships a test double only (sub-PRD D11).
4. **`guidanceCannotOverride(citations, compareAuthority): Violation[]`** — flags any case where an
   `AuthorityLevel` of official regulator guidance (PRD §9.1 level 6) or lower is used to displace
   legislation, an operative instrument or binding authority (levels 1–4) for the same claim
   (PRD §9.1: *"Guidance MUST NOT silently override legislation, an operative instrument or binding
   authority."*).
5. **`containsProhibitedCertainty(text): ProhibitedMatch[]`** — detects the §36.8 prohibited words
   (`definitely compliant`, `guaranteed`, `zero risk`, case-insensitive, whitespace-tolerant) and
   numeric model-confidence expressions (a percentage adjacent to a confidence/certainty word). Returns
   matches with offsets so the caller can report them; it never rewrites text.
6. **`ANSWER_SECTION_ORDER`** — the six §8.4 sections as an ordered frozen constant, so no renderer can
   reorder them, plus `SHORT_ANSWER_VALUES` (`Yes`, `No`, `Likely`, `Depends`, insufficient evidence) as
   §8.4 states them.
7. **`isDefinitiveClaim(claim): boolean`** — the predicate ANS-005's *"unsupported definitive claim count
   is zero"* is measured against, so `EVID-05` and the `21-evaluation-600` metrics count the same thing.
8. **Purity**: no imports outside `packages/contracts` and Node built-ins; no clock, randomness or I/O
   (PRD §39.1, §45.2). No prompt strings, no provider vocabulary — PRD §9.4 requires this decision to be
   code.
9. **Fixture** `packages/domain/test/answers/prd-36-8-refusal.json` — the §36.8 table transcribed
   verbatim (all nine rows, including the three non-status ones) plus a precedence section enumerating
   the simultaneous-condition cases and the D13 expected outcome.

## Acceptance checklist (classified)

- [ ] `[fixture]` §36.8 replay: each of the six status rows returns exactly the tabled `AnswerStatus`
      when its condition alone holds (PRD §36.8).
- [ ] `[fixture]` §36.8 non-status rows: PII detection returns a `PreAdmissionOutcome` with **no**
      `AnswerStatus`; unlawful-evasion returns a refusal outcome; provider/budget unavailability returns
      a job-unavailable outcome that explicitly records Search and saved records as still available
      (PRD §36.8, §8.2, §34.9 `GENERATION_UNAVAILABLE`).
- [ ] `[fixture]` Precedence (sub-PRD **D13**): for every pair of simultaneously-true conditions in the
      fixture's precedence section, the returned status is the more restrictive one, and the returned
      condition list contains **both** (PRD §36.8; Q-F3).
- [ ] `[machine]` Property test (≥10,000 cases): `decideAnswerStatus` never returns `SUPPORTED` when any
      restrictive condition is true, and never returns a status whose row is absent from the signal set
      (PRD §36.8, ANS-005).
- [ ] `[machine]` Property test: a claim whose citations are all `BACKGROUND_ONLY` is never
      `DIRECTLY_SUPPORTED` or `SUPPORTED_BY_INFERENCE` — it is `NOT_SUPPORTED`
      (PRD §15.5: *"`BACKGROUND_ONLY` evidence cannot independently support a definitive legal claim"*).
- [ ] `[machine]` `guidanceCannotOverride` flags a guidance-level citation displacing a legislation-level
      citation for the same claim, and does not flag the reverse (PRD §9.1).
- [ ] `[machine]` `containsProhibitedCertainty` catches "definitely compliant", "guaranteed", "zero risk"
      and "92% confidence"; it does **not** flag ordinary legal prose containing "risk", "compliance" or
      a percentage that is a statutory rate (PRD §36.8) — both positive and negative cases asserted.
- [ ] `[machine]` `ANSWER_SECTION_ORDER` matches PRD §8.4's six sections in order, asserted against the
      fixture (PRD §8.4).
- [ ] `[machine]` Structural port: `classifyClaimSupport` accepts any
      `(a: AuthorityLevel, b: AuthorityLevel) => -1 | 0 | 1` function; the module contains **no**
      authority ordering of its own — asserted by a test that two different comparators produce
      different results on the same claim (sub-PRD D11).
- [ ] `[machine]` No sibling-leaf import: `src/answers/**` does not import
      `src/{access,workflow,budget,legal}/**` (sub-PRD D10).
- [ ] `[machine]` Import-graph purity and determinism: only `packages/contracts` and Node built-ins; no
      `Date.now`, `Math.random` or `process.env` (PRD §39.1, §45.2).
- [ ] `[machine]` No prompt or provider text: the module contains no natural-language instruction string
      intended for a model, and no hidden-reasoning field (PRD §9.4: *"Hidden chain-of-thought MUST NOT
      be requested, stored or displayed"*).
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**ANS-005**, `E03-DOMAIN`;
      `UAT-ANS-03`/`UAT-ANS-05` are exercised downstream by `15-answer-product` and `23-assurance`),
      user-visible change and non-goals, schema/API/event compatibility impact (none — pure functions),
      tenant/PII/security impact (PII rejection is modelled as pre-admission and carries no answer
      status — PRD §36.8, §10.1), source/licence impact (none), cost/memory/latency impact (none),
      rollback path (revert; only `EVID-04` consumes it), known gaps (**D13 precedence is a recorded
      product ambiguity, Q-F3, owner Founder**).

Absent classes: no `[human]` criteria — the decision is pure logic. Its human-facing consequences
(`UAT-ANS-03` "Evidence pack lacks support for material conclusion → `INSUFFICIENT_EVIDENCE`;
no definitive conclusion", `UAT-ANS-05` validator rejection) are end-to-end scripts owned by
`15-answer-product` and `23-assurance`, and the evaluation replay of refusal behaviour is
`21-evaluation-600`.

## Test plan

Reviewer steps, all offline and deterministic:

1. **Read the fixture against the PRD.** Compare `packages/domain/test/answers/prd-36-8-refusal.json`
   with `docs/PRD.md` §36.8 row by row, and its claim-support/citation-role sections with §15.5. Confirm
   all nine §36.8 rows are present, including the three that are not statuses.
2. **Run the suite.** `pnpm --filter @<scope>/domain test`. Confirm the refusal replay produces one
   assertion per row, and that the precedence section has at least one case per restrictive pair.
3. **Precedence negative test.** On a scratch branch reorder `decideAnswerStatus` so `SUPPORTED` is
   checked first; assert the precedence fixture fails; discard.
4. **`BACKGROUND_ONLY` property.** Confirm the generator produces claims with mixed citation roles, not
   only all-`BACKGROUND_ONLY` cases (otherwise the property is vacuous).
5. **Comparator port.** Read the signature; confirm no `AUTHORITY_RANK`-style constant exists in
   `src/answers/**` (that belongs to `FND-10`), and run the two-comparator test.
6. **Prohibited-language cases.** Read both lists; confirm the negative cases include at least one
   legitimate sentence containing "risk" and one containing a statutory percentage (e.g. a
   superannuation guarantee rate) so the detector is not a blunt keyword filter that would degrade
   answer quality.
7. **Purity checks.** Run the import-graph and sibling-leaf tests; grep `src/answers/**` for `Date.now`,
   `Math.random`, `process.env` — none.
8. **Append-only manifest.** `git diff packages/domain/package.json` shows additions only.

Harness: the framework `FND-01` registered plus the property-testing library declared in
`packages/domain/package.json` (`FND-06` sets the pattern if it lands first; otherwise this ticket does).
Fixture: `packages/domain/test/answers/prd-36-8-refusal.json`. No mocks beyond the comparator test
double, no network, no model calls.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update this ticket and
`docs/prd/00-foundation/README.md` (version +0.1, changelog line) **before** changing code; re-publish
with `publish-tickets.mjs --sync`. Silent divergence = incomplete.

**Foreseeable frictions, each with its writeback target:**

1. **The D13 precedence produces a wrong answer on a real evaluation case.** → This is the recorded open
   question **Q-F3** (owner **Founder**, PRD §43.4 `PRODUCT_AMBIGUITY`). Update
   **`docs/prd/00-foundation/README.md` D13/Q-F3** *first*, then this ticket, then the code, and notify
   `21-evaluation-600`. A refusal-precedence change is customer-visible behaviour and needs founder
   approval per PRD §45.5.
2. **`EVID-04`/`EVID-05` needs a signal `decideAnswerStatus` does not accept** (e.g. a per-claim
   confidence artefact). → Extend the **signal record in this ticket**, not in `packages/citations`.
   PRD §45.2 forbids duplicated business rules outside `packages/domain`; a second status decision in
   the validator would be exactly that. Record the extension in `docs/prd/00-foundation/README.md`.
3. **The `AuthorityComparator` structural port does not line up with `FND-10`'s exported signature.** →
   Both are typed over `AuthorityLevel` from `packages/contracts` (sub-PRD D11). If the shapes diverge,
   fix the **port definition here** and record it in `docs/prd/00-foundation/README.md` D11 — do **not**
   import `src/legal/**`, which would break the sibling-leaf rule (D10) that makes the wave-3 lanes safe.
4. **The prohibited-language detector produces false positives that degrade real answers.** → Record the
   corpus of false positives in `docs/prd/00-foundation/README.md` and update this ticket's negative
   test list. PRD §36.8's prohibition is absolute for those words; narrowing the *pattern* is allowed,
   removing a prohibited word is a PRD change (§45.5).
5. **A `ClaimSupport` or `CitationRole` value is needed that §15.5 does not contain.** → Product change:
   raise it against `FND-03`'s enum **and** the PRD per §45.5; record it in
   `docs/prd/00-foundation/README.md` Open questions with a named owner. Never add a local value.

**Escalation.** If PRD §9.4's "status decided in code, not prompts" proves unworkable — for instance the
§36.8 conditions cannot be derived from deterministic signals and would require the model to self-report
its status — that overturns the evidence-first architecture and ANS-005's zero-unsupported-claim
guarantee. Stop, raise an ADR under `docs/adr/`, write back to `docs/prd/00-foundation/README.md`, and
escalate to the human. Never let the model choose the answer status inside this ticket.
