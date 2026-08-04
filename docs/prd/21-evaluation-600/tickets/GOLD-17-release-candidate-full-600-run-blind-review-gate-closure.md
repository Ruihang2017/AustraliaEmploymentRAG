---
id: GOLD-17
title: "Release-candidate full-600 run, blind review, gate closure"
module: 21-evaluation-600
lane: 21-evaluation-600
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [GOLD-03, GOLD-05, GOLD-06, GOLD-07, GOLD-08, GOLD-09, GOLD-10, GOLD-11, GOLD-12, GOLD-13, GOLD-14, GOLD-15, GOLD-16]
blocks: [LNCH-04, LNCH-05]
---

# GOLD-17 — Release-candidate full-600 run, blind review, gate closure

Implements PRD §14.2, §43.5 and §26 — requirement **EVAL-002** (and closes **EVAL-001**); epic
`E34-LAUNCH`.
No ADR — the decision is already made in PRD §14.3 (*"all 600 run for release candidates"*), §14.2 (the
threshold table) and §43.5 (the release evidence pack); this is build ticket 17 of 17 against it.
Parent sub-PRD: [21-evaluation-600 README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [GOLD-03 — Release gate enforcement and release evidence pack](GOLD-03-release-gate-enforcement-and-release-evidence-pack.md), the ten case categories [GOLD-05](GOLD-05-cases-federal-fair-work-nes-core-employment-80.md), [GOLD-06](GOLD-06-cases-modern-awards-coverage-and-classification-90.md), [GOLD-07](GOLD-07-cases-enterprise-agreements-and-lifecycle-70.md), [GOLD-08](GOLD-08-cases-payg-stp-super-fbt-and-eight-payroll-tax-regimes-70.md), [GOLD-09](GOLD-09-cases-state-territory-employment-and-industrial-law-64.md), [GOLD-10](GOLD-10-cases-whs-ohs-and-workers-compensation-64.md), [GOLD-11](GOLD-11-cases-adjacent-regimes-60.md), [GOLD-12](GOLD-12-cases-case-authority-appeal-and-treatment-40.md), [GOLD-13](GOLD-13-cases-historical-future-commencement-and-transitional-traps-30.md), [GOLD-14](GOLD-14-cases-insufficient-conflicting-evidence-pii-evasion-out-of-scope-32.md), plus [GOLD-15 — Model and retrieval profile promotion](GOLD-15-model-and-retrieval-profile-promotion-with-non-regression-report.md) and [GOLD-16 — Full-roster coverage reconciliation](GOLD-16-full-roster-coverage-licence-and-freshness-reconciliation.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
every component exists; this ticket runs them in the PRD's order, assembles the §43.5 pack and records
the closure evidence. The judgements inside it are explicitly the Founder's and are marked `[human]`.

## Background + basis

**PRD §14.3, quoted verbatim — the trigger for this ticket:** *"Related smoke subsets run on changes;
development cases run nightly where practical; development + validation run weekly; **all 600 run for
release candidates.**"*

**PRD §14.2 release thresholds, transcribed verbatim — what must pass on the candidate:**

| Metric | Gate |
|---|---:|
| Factual citation coverage | 100% |
| Citation precision | ≥ 98% |
| Retrieval recall@10 | ≥ 90% |
| Critical legal-date or jurisdiction errors | 0 |
| Unsupported definitive claims | 0 |
| Correct refusal | ≥ 95% |
| Source-status correctness | ≥ 98% |

> The release MUST also have no critical regression relative to the current production baseline,
> acceptable schema success, cost and latency, and no supported-to-unsupported or refusal-to-definitive
> degradation in material cases.

**PRD §43.5 release evidence pack, quoted verbatim — the artifact this ticket commits:**

> Promotion UI links one immutable release report containing application/corpus versions, source coverage
> and gaps, all 600 metrics, per-category breakdown, critical-error list, changed cases,
> security/tenant/PII results, performance and memory benchmark, provider/profile cost forecast,
> backup/restore result, accessibility result, known risks and founder approval/reason.

**PRD §43.4 founder test queue, quoted verbatim — the review this ticket organises:**

> The next daytime founder session reviews in this order:
>
> 1. any cross-tenant/PII/security failure;
> 2. any unsupported claim or legal-date/jurisdiction failure;
> 3. changed evaluation cases versus last accepted baseline;
> 4. source adapter count/time/licence/quarantine anomalies;
> 5. Coverage/enterprise-agreement/case-treatment failures;
> 6. UI/manual acceptance failures;
> 7. performance/cost/accessibility defects.
>
> Every reviewed failure is classified `CODE`, `CORPUS`, `GOLD_DATA`, `PROMPT`, `MODEL_PROFILE`,
> `PRODUCT_AMBIGUITY` or `SOURCE_LIMITATION`; it gets an owner, requirement ID and reproducible fixture.
> **Agents may not "fix" a failing gold case by changing expected output without a versioned
> founder-approved reason.**

**PRD §14.3, binding on the blind third of the run:** *"**Blind gold answers MUST remain outside ordinary
coding-agent context.**"* The blind portion of this run therefore executes only in a session the
**Founder** starts: the Founder is the sole custodian of the private key, it reaches the run through
`EVAL_BLIND_KEY_FILE` (no default path, no in-repository lookup, no keyring fallback), and the stage's
output is limited to content-free metrics, category summaries and case ids (breakdown plan §8 **Q6**,
confirmed; sub-PRD **D2**, **D22**). A Builder delivers everything except the blind execution and the
blind review, and those two items are `[human]`.

**PRD §26 "Quality", quoted verbatim — what this ticket evidences:**

> - All launch thresholds pass on the release candidate.
> - No critical time/jurisdiction errors or unsupported definitive claims remain.
> - Claim-level citation validator and refusal/status behaviour pass.
> - Model profiles, fallback status and actual versions are recorded.

**PRD §44.4:** if a gate cannot be met, the only permitted outcomes are delaying production access or
launching an explicitly visible limited state — **never** a lowered threshold.

**Requirements.** `EVAL-001` (*"Dataset contains 360 development, 120 validation and 120 protected blind
cases"*) is closed here on the real dataset; `EVAL-002` (*"Release is blocked unless every numeric and
zero-tolerance gate passes"*) is exercised here on the real candidate.

**What is already decided elsewhere and must not be re-decided here.** `GOLD-02` owns the runner and
metrics; `GOLD-03` owns the thresholds, the verdict, the baseline and the pack **schema** and writer;
`GOLD-15` owns the model/retrieval promotion decision record; `GOLD-16` owns the roster reconciliation
report; the ten authoring tickets own the case data. Four §43.5 sections are produced by other modules —
security/tenant/PII (`23-assurance`), performance and memory benchmark (`RLSE-11`), backup/restore
(`RLSE-09`), accessibility (`ASSR-07`) — and are carried here as **referenced artifacts** whose absence is
`UNRESOLVED`; `LNCH-05` performs the whole-of-PRD §26 closure.

**Sub-PRD decisions carried forward:** **D9** (recorded, replayable runs), **D11** (`PASS`/`FAIL`/
`UNRESOLVED`, no override), **D13** (an unmeetable gate is a Founder release decision), **D14** (this
ticket owns `evals/reports/release-candidate/**`), **D20** (no blind-derived text in any artifact).

**Accepted caveats carried forward:**

- **This ticket cannot make a failing candidate pass.** Its success condition is a *truthful* closure
  record, not a green one; a `FAIL` verdict with a complete gap list is a correct delivery of this ticket
  (PRD §44.4).
- **A Builder cannot complete the blind items.** They require the key and the Founder's review; both are
  `[human]` and no code path substitutes for them.

## Goal

Run and record the release candidate: execute all 600 cases (development + validation by a Builder;
blind by the Founder, the sole key custodian), evaluate them through `GOLD-03`'s gate, assemble the PRD §43.5 evidence
pack with `GOLD-15`'s promotion decision and `GOLD-16`'s roster reconciliation folded in, organise the
PRD §43.4 founder review queue over the failures and changed cases, and commit one immutable,
content-hashed release-candidate report under `evals/reports/release-candidate/**` that either records a
`PASS` verdict with the Founder's approval and reason, or records a `FAIL`/`UNRESOLVED` verdict with the
complete blocking list. Completion is mechanically checkable: the committed pack validates against
`GOLD-03`'s schema, its metric record replays bit-for-bit from the committed run artifact, the seven
§14.2 rows are present with their measured values, no blind text appears anywhere in the pack, and the
verdict shown in the pack matches the verdict `GOLD-03` produces when re-run.

## Non-goals

- **No metric, threshold, verdict or pack-schema implementation** — `GOLD-02`, `GOLD-03`. This ticket
  runs them.
- **No case authoring or gold editing** — `GOLD-05` … `GOLD-14`. PRD §43.4 forbids changing expected
  output to make a candidate pass; a required case change is a versioned correction owned by the
  authoring ticket.
- **No product fix.** Every failure is classified and routed; the fix belongs to the owning module.
- **No model or corpus promotion** — `GOLD-15` prepares the decision, `RLSE-06`/`RLSE-07` and `INTL-04`
  perform promotion.
- **No whole-PRD §26 closure, policy pack or onboarding material** — `24-launch` (`LNCH-04`, `LNCH-05`,
  both `blocked_by` this ticket). This ticket closes the **§14.2 evaluation** gates only.
- **No security/PII, performance, backup or accessibility results** — `23-assurance`, `RLSE-09`,
  `RLSE-11`, `ASSR-07`. Referenced, never produced or estimated here.
- **No blind material in ordinary context** — PRD §14.3, §45.1 item 6.

## File-scope (write-owns)

Owned by this ticket:

- `evals/reports/release-candidate/**` — the committed release-candidate report directory: the run
  artifact, the gate verdict, the PRD §43.5 evidence pack, the founder review queue, the changed-case
  list and the closure record

Does not touch:

- The rest of `evals/reports/**` — `GOLD-03` (schema, writer, `baseline.json`, examples).
- `evals/cases/**`, `evals/gold/**` — `GOLD-05` … `GOLD-14`; **read-only here**, and blind material is
  never opened outside the Founder's key-holding session (plan §8 **Q6**).
- `evals/splits/**`, `schemas/evaluation/**`, `pipelines/evaluation/**` — `GOLD-01` … `GOLD-04`,
  `GOLD-15`, `GOLD-16`. If the run needs a code change, it belongs to the owning ticket, not here.
- `apps/**`, `packages/**`, `services/**`, `pipelines/{ingestion,adapters,corpus-builder,embeddings}/**`,
  `infra/**`, `tests/**`, `docs/release/**` — other modules per plan §4 (`docs/release/**` is `LNCH-05`).
- `docs/PRD.md`, `.claude/**` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). `evals/reports/release-candidate/**` is written by no other ticket; `GOLD-03` owns the rest of
`evals/reports/**` and is a **blocker** of this ticket, so the two are never concurrent. This is the
module's final wave (plan §7: five waves): all thirteen declared blockers — `GOLD-03`, the ten authoring
tickets, `GOLD-15` and `GOLD-16` — land first, and nothing in the module runs alongside it. Its
dependents `LNCH-04` and `LNCH-05` are `blocked_by` this ticket. No shared append-only file — this ticket
adds no dependency and writes no manifest.

## Deliverables

1. **`evals/reports/release-candidate/<rc-id>/manifest.json`** — the candidate's identity: application
   version, corpus release id, retrieval profile hash, model profile ids and **actual model versions**,
   dataset version, the `GOLD-15` promotion decision hash, the `GOLD-16` reconciliation report hash, and
   the run timestamps. PRD §26 requires *"Model profiles, fallback status and actual versions are
   recorded"*.
2. **Pre-flight closure of `EVAL-001`** — run `GOLD-01`'s `verify --complete --release <pinned>` over the
   real dataset and commit its output: counts exactly 360/120/120/600, split disjointness, no
   cross-split near-duplicates, every category's stratification met, the cross-cutting surface/status
   floors met, and **every gold authority resolving** in the pinned release (PRD §40.9's *"broken gold
   citation"* is blocking here, per sub-PRD **D7**).
3. **The development + validation run (Builder).** `GOLD-02` over the 480 non-blind cases against the
   candidate build, producing the immutable run artifact. Recorded, replayable, offline-verifiable
   afterwards (sub-PRD **D9**).
4. **The blind run (the Founder).** `GOLD-02` over the 120 blind cases in a session the Founder starts
   with `EVAL_BLIND_KEY_FILE` pointing at the private key they alone hold (plan §8 **Q6** items 13–14).
   Its output is restricted to content-free metrics, category summaries and case ids: observations carry
   ids, codes and hashes only, and `GOLD-01`'s post-write leak scan runs before the artifact is
   committed (sub-PRD **D20**, **D22**). **A Builder does not run this stage and never sees its
   inputs**; if the blind run fails, debugging uses development/validation cases and category-level
   blind metrics only.
5. **The merged 600-case artifact and gate evaluation.** Merge the two run artifacts into one
   content-hashed artifact and run `GOLD-03`'s `evaluate --artifact <merged> --baseline <accepted>`.
   Commit the verdict verbatim — including a `FAIL` or `UNRESOLVED` verdict. There is no path in this
   ticket that edits, re-runs-until-green, or partially reports a verdict.
6. **The PRD §43.5 evidence pack** — built through `GOLD-03`'s `build_pack` (which refuses to emit on a
   non-`PASS` verdict), with each section filled:

   | §43.5 section | Source |
   |---|---|
   | application/corpus versions | deliverable 1 |
   | source coverage and gaps | `GOLD-16`'s reconciliation report (referenced by hash) |
   | all 600 metrics · per-category breakdown | `GOLD-02` via the merged artifact |
   | critical-error list | `GOLD-02`'s zero-tolerance detail |
   | changed cases | dataset-version diff against the accepted baseline (deliverable 7) |
   | security/tenant/PII results | **referenced artifact** — `23-assurance` |
   | performance and memory benchmark | **referenced artifact** — `RLSE-11` |
   | provider/profile cost forecast | `GOLD-15`'s decision record + `GOLD-02`'s cost-by-profile |
   | backup/restore result | **referenced artifact** — `RLSE-09` |
   | accessibility result | **referenced artifact** — `ASSR-07` |
   | known risks | deliverable 9 |
   | founder approval/reason | `[human]`, deliverable 10 |

   A missing referenced artifact is `UNRESOLVED` (blocking), never an empty section (sub-PRD **D11**).
7. **`changed-cases.json`** — every case whose content or gold changed since the accepted baseline, with
   its `dataset_version`, `change_reason` and `approved_by`, so PRD §43.4 item 3 (*"changed evaluation
   cases versus last accepted baseline"*) is reviewable at a glance. A changed case without a reason and
   approver is a `FAIL` of the dataset check, not a note.
8. **`founder-review-queue.json`** — `GOLD-02`'s triage output rendered in PRD §43.4's seven priority
   bands, each item carrying case id, band, an **unset** classification field, an owner slot, a
   requirement id and the reproducible fixture reference (artifact hash + case id). The queue is the
   working document for deliverable 10.
9. **`known-risks.md`** — the explicit limitations carried into launch: `GOLD-16`'s gap list (any group
   in a PRD §7 limited state, the measured evidence for it, the affected dates or collections and the
   customer-visible warning it requires), any `UNRESOLVED` gate row and why, the sub-PRD open questions
   still unanswered (**Q-GOLD-A**, **Q-GOLD-B**, **Q-GOLD-C**, **Q-GOLD-D**, **Q-GOLD-E**,
   **Q-GOLD-G**), and the PRD §44.4 framing — delay or explicitly visible limited state, never a lowered
   threshold and never an arbitrary scope reduction for a date (plan §8 **Q10**).
10. **`closure.json` — the closure record.** States: `RUN_COMPLETE → REVIEWED → CLOSED_PASS |
    CLOSED_BLOCKED`. It carries the verdict hash, the review completion, and — for `CLOSED_PASS` — the
    **Founder's approval and reason** (PRD §43.5's final item). `CLOSED_PASS` is unreachable without a
    `PASS` verdict **and** an approval record; a test asserts the transition guard, and there is no flag
    that bypasses it.
11. **`README.md` in the report directory** — how to reproduce every number offline from the committed
    artifact, which sections are referenced from other modules, and the statement that no blind case
    content or gold answer appears anywhere in this directory.

## Acceptance checklist (classified)

- [ ] `[machine]` **`EVAL-001` closes on the real dataset**: `verify --complete --release <pinned>`
      reports exactly 360/120/120/600, split disjointness, no cross-split near-duplicates, every
      category's stratification met, and **every gold authority resolving**. (PRD §30.2 `EVAL-001`;
      §14.1; §43.1; §40.9)
- [ ] `[machine]` **All seven PRD §14.2 rows are present with measured values** in the committed verdict —
      factual citation coverage **100%**, citation precision **≥ 98%**, recall@10 **≥ 90%**, critical
      legal-date/jurisdiction errors **0**, unsupported definitive claims **0**, correct refusal
      **≥ 95%**, source-status correctness **≥ 98%** — and the verdict states `PASS`, `FAIL` or
      `UNRESOLVED` per row. (PRD §14.2; §30.2 `EVAL-002`)
- [ ] `[machine]` **The §14.2 second paragraph is evaluated**: no critical regression against the accepted
      baseline, and no supported-to-unsupported or refusal-to-definitive degradation in material cases,
      each reported per case id. (PRD §14.2)
- [ ] `[fixture]` **The committed run artifact replays offline**: re-running `GOLD-02`'s `replay` and
      `GOLD-03`'s `evaluate` on the committed artifact reproduces the committed metric record and verdict
      bit-for-bit, with no network, no provider key and **no seal key**. (Plan §1.1; sub-PRD D9)
- [ ] `[machine]` **No blind material leaks**: the whole `evals/reports/release-candidate/**` directory
      contains no blind question, scenario, claim text, quote or gold text; `GOLD-01`'s leak scan is clean
      and `guard-blind` passes. (PRD §14.3, §43.1; sub-PRD D20)
- [ ] `[machine]` **The pack is complete or explicitly `UNRESOLVED`**: all fourteen PRD §43.5 sections
      validate against `GOLD-03`'s schema; the four externally-produced sections are `ReferencedArtifact`s
      with producer, hash and status. (PRD §43.5)
- [ ] `[machine]` **No pack on a blocked release**: if the verdict is not `PASS`, the directory contains a
      verdict, a review queue and `known-risks.md`, and **no** evidence pack. (PRD §43.5; `EVAL-002`)
- [ ] `[machine]` **Changed cases are accounted for**: every case differing from the accepted baseline has
      a `dataset_version`, `change_reason` and `approved_by`; an unexplained change fails. (PRD §14.3;
      §43.4 item 3)
- [ ] `[machine]` **The review queue is in PRD §43.4 order** with the seven bands, unset classifications
      and a reproducible fixture reference per item. (PRD §43.4)
- [ ] `[machine]` **Closure cannot self-approve**: `CLOSED_PASS` requires a `PASS` verdict **and** a
      Founder approval record; no CLI flag or field sets it. (PRD §43.5; §14.4)
- [ ] `[machine]` `uv run pytest` green and `pnpm test` green on the merged default branch (standing
      items, PRD §45.3). `cargo test --workspace` unaffected — this ticket writes data, not code.
- [ ] `[human]` **The blind run is started and executed by the Founder**, the sole private-key
      custodian, with the key supplied through `EVAL_BLIND_KEY_FILE`; its artifact is merged with
      content-free metrics, category summaries and case ids only, and no blind text reaches the
      repository. A Builder cannot complete this item. (PRD §14.3; §43.1; plan §8 **Q6** items 10–15;
      sub-PRD **D22**)
- [ ] `[human]` **Founder review of failures and changed cases**, in PRD §43.4's order, with every
      reviewed failure classified `CODE`/`CORPUS`/`GOLD_DATA`/`PROMPT`/`MODEL_PROFILE`/
      `PRODUCT_AMBIGUITY`/`SOURCE_LIMITATION` and given an owner, requirement id and reproducible
      fixture. (PRD §43.4)
- [ ] `[human]` **Case-quality judgement on blind results**: where a blind case failed, the Founder — not
      an agent — decides whether the product or the case was wrong, and any case change is a versioned
      correction with an approved reason. (PRD §43.4 *"Agents may not 'fix' a failing gold case …"*;
      §14.3)
- [ ] `[human]` **Founder approval and reason recorded** in the evidence pack for a `PASS`, or the PRD
      §44.4 outcome chosen for a `FAIL` — delay production access, or launch named groups in an
      explicitly visible limited state, which under the confirmed launch policy requires measured
      evidence of a genuine official-source limitation for every named group and permits no arbitrary
      scope reduction. (PRD §43.5; §44.4; plan §8 **Q10**; sub-PRD **D23**)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs (**EVAL-001**, **EVAL-002**), user-visible
      change and non-goals, schema compatibility impact (the committed pack is what `INTL-06` links and
      `LNCH-05` closes against), **tenant/PII/security and retention impact** (no research content, no
      customer data, no blind material in the report), source/licence impact (`GOLD-16`'s gap list is
      carried verbatim), **cost/memory/latency impact** (the full-600 run's provider cost is reported by
      profile against the PRD §24.1 ceiling), rollback path, known gaps (`known-risks.md`).

Absent classes: none — this ticket carries `[machine]`, `[fixture]` and `[human]` criteria. The `[human]`
items are exactly the acts the PRD reserves to a person: running the blind stage with the key, reviewing
failures and changed cases (§43.4), judging blind case quality, and approving or declining the release
(§43.5, §44.4).

## Test plan

Every `[machine]`/`[fixture]` step runs offline from the committed artifacts: no network, **no provider
key**, **no seal key**. The Reviewer never decrypts blind material and never asks for it.

1. **Reproduce the metrics.** `uv run python -m evaluation.runner replay --artifact
   evals/reports/release-candidate/<rc-id>/run-artifact.json`, then `uv run python -m evaluation.gates
   evaluate --artifact <same> --baseline evals/reports/baseline.json`. Assert the metric record and
   verdict are byte-identical to the committed ones.
2. **Check the seven rows against the PRD.** Compare the verdict's rows with `docs/PRD.md` §14.2 —
   values, comparators and the zero-tolerance rows. A row that is missing, renamed or softened is the
   failure this step exists to catch.
3. **Close `EVAL-001`.** Run `uv run python -m evaluation.dataset verify --complete --release <pinned>`;
   assert 360/120/120/600, disjointness, stratification and gold resolution.
4. **Blind-safety scan.** Run `guard-blind` and `GOLD-01`'s leak scan over
   `evals/reports/release-candidate/**`; then independently grep the directory for any sentence-like
   string longer than a threshold in a blind case's observation — there must be none. Confirm blind
   observations carry only ids, codes, counts and hashes.
5. **Pack completeness.** Validate the pack against `GOLD-03`'s schema; confirm the four referenced
   artifacts carry producer, hash and status, and that any `UNRESOLVED` reference is reflected in the
   verdict.
6. **Blocked-release shape.** On a scratch copy, force one metric below its threshold and re-run
   `evaluate`; assert no pack is emitted and the verdict names the row.
7. **Changed cases.** Open `changed-cases.json`; confirm every entry has a `change_reason` and
   `approved_by`, and that no expected output changed without one (PRD §43.4).
8. **Review queue.** Confirm the seven PRD §43.4 bands, the unset classification fields and a
   reproducible fixture reference per item.
9. **Closure guard.** Attempt to set `CLOSED_PASS` without an approval record; assert refusal. Confirm no
   CLI flag can do it.
10. **Suite.** `uv run pytest` and `pnpm test` from the repository root on the merged default branch.
11. **Reviewer focus.** Confirm the committed verdict is the one the tools produce — not a curated
    subset; confirm no case was edited to make a metric pass (check `changed-cases.json` against the
    dataset-version history); confirm `known-risks.md` names every limited source group and every
    `UNRESOLVED` row; confirm nothing in the directory, the PR body or the commit messages contains blind
    content; and confirm that a `FAIL` verdict is delivered as a complete, honest closure rather than
    withheld.

## Feedback obligation

1. **General rule.** If the run falsifies this ticket, update **this ticket** (docs PR → merge →
   `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/21-evaluation-600/README.md` (version +0.1 with a changelog line) **before** changing
   anything else. A release-candidate report that is edited after the fact is not evidence.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A §14.2 threshold is not met on the candidate* → **this is a Founder release decision.** Record the
     measured value and the blocking rows in the committed verdict and `known-risks.md`, write the
     situation back to `docs/prd/21-evaluation-600/README.md`, and route the PRD §44.4 choice (delay, or
     an explicitly visible limited state) to the Founder through `LNCH-05`. **Never** lower a threshold,
     exclude a case, re-scope a denominator, re-run until a favourable sample appears, or split the run
     to report a subset.
   - *A blind case fails and the case itself looks wrong* → the classification and the decision are the
     **Founder's** (PRD §43.4). Any change is a versioned dataset correction owned by the authoring
     `GOLD-05` … `GOLD-14` ticket with an approved reason; an agent may not change expected output.
   - *A referenced §43.5 artifact does not exist* (security/PII, benchmark, backup, accessibility) → keep
     it `UNRESOLVED`, record it in `known-risks.md`, and notify the producing ticket (`ASSR-*`,
     `RLSE-09`, `RLSE-11`, `ASSR-07`) and `LNCH-05`. An absent section is a known gap under PRD §44.4,
     never a blank.
   - *`GOLD-16` reports a mandatory group short of `ACTIVE`* → carry its gap list verbatim into
     `known-risks.md` with the required customer-visible warning; PRD §44.4 forbids silently calling it
     covered.
   - *A metric cannot be computed for some cases* → the rows stay `UNRESOLVED` and block; raise the
     missing signal against `GOLD-02` or the owning product ticket, and record it in the sub-PRD.
   - *The blind stage cannot be scheduled with the Founder* → the candidate is not closable. Record
     the delay in `known-risks.md`; PRD §14.3 makes the full-600 run mandatory for a release candidate,
     so an unrun blind third is a delay (PRD §44.4 outcome 1), never a waiver.
3. **Falsified protocol.** **This is the ticket where the temptation to make the number pass is
   strongest, and yielding to it would silently void every gate in the product.** Do not edit a case, a
   gold answer, a threshold, a denominator or a committed report to reach `CLOSED_PASS`. Do not report a
   partial run as a full one. Do not let a model decide a borderline failure (PRD §14.3). If the gates
   cannot be met, stop, escalate for re-review, and write back to
   `docs/prd/21-evaluation-600/README.md` **and** `docs/prd/breakdown-plan.md` before any further work —
   PRD §44.4 gives exactly two honest outcomes, and both belong to the Founder. A truthful `FAIL` is a
   successful delivery of this ticket; a curated `PASS` is a defect in the product's central safety
   claim.
