---
id: GOLD-06
title: "Cases: modern awards, coverage and classification (90)"
module: 21-evaluation-600
lane: 21-evaluation-600
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [GOLD-01, SINS-03]
blocks: [GOLD-17]
---

# GOLD-06 — Cases: modern awards, coverage and classification (90)

Implements PRD §43.1 (row 2), §8.5 and §14.1 — requirement **EVAL-001**, exercising **COV-001** …
**COV-004**; epic `E31-EVAL-600`.
No ADR — the decision is already made in PRD §43.1 (the category and its 54/18/18 allocation) and PRD
§8.5 (the ordered Coverage Navigator rules the traps must exercise); this is build ticket 6 of 17
against it.
Parent sub-PRD: [21-evaluation-600 README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [GOLD-01 — Case schema, splits, integrity and blind protection](GOLD-01-case-schema-splits-integrity-and-blind-protection.md), [SINS-03 — `FWC-AWARDS` awards, variation history, pay data](../../07-sources-instruments/tickets/SINS-03-fwc-awards-awards-variation-history-pay-data.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
the category, its counts, its per-case fields and the coverage rules the traps must probe are already
fixed by the PRD; this authors the data against `GOLD-01`'s schema and checker.

## Background + basis

**PRD §43.1, this ticket's row, transcribed verbatim:**

| Primary category | Development | Validation | Blind | Total |
|---|---:|---:|---:|---:|
| Modern awards, coverage and classification | **54** | **18** | **18** | **90** |

**PRD §14.1, the required per-case fields, quoted verbatim:**

> Each case SHOULD include **scenario, question, legal date, jurisdictions, expected answer status,
> required facts, prohibited assumptions, trap types, gold DocumentVersion/NodeVersion authorities,
> required/optional/prohibited claims and expected citation roles.**

`GOLD-01` deliverable 1 makes these required (sub-PRD **D6**); PRD §43.2 adds the rest of the schema and
the rule that *"Gold authorities use immutable corpus IDs for a named evaluation CorpusRelease."*

**PRD §8.5 Coverage Navigator, quoted verbatim — the behaviour these cases must probe:**

> Coverage Navigator MUST process in this order:
>
> 1. Likely workplace-relations system.
> 2. Employer/ABN enterprise-agreement candidates.
> 3. Agreement approval, variation, replacement, termination and coverage.
> 4. Modern-award candidates if no applicable agreement is established.
> 5. Industry/occupational coverage and exclusions.
> 6. Classification candidates based on principal duties, qualifications and responsibility.
> 7. Decisive missing facts and required clarifications.
>
> **Job title alone MUST NOT determine classification. Multiple candidates MUST remain visible when
> evidence cannot select one. `Award-free`, `agreement not applicable` and exclusion conclusions require
> pinpoint evidence.** Candidate status values: `CONFIRMED_FROM_STATED_FACTS`, `LIKELY`, `POSSIBLE`,
> `UNLIKELY`, `EXCLUDED`, `INSUFFICIENT_EVIDENCE`.

**The requirements these cases exercise** (PRD §30.2): `COV-001` *"Coverage follows system → agreement →
award → classification order"*; `COV-002` *"Job title alone cannot confirm award/classification …
Job-title-only test returns candidates/missing facts"*; `COV-003` *"Agreement search supports employer
name and validated ABN"*; `COV-004` *"Award-free, excluded or agreement-not-applicable outcomes need
pinpoint evidence … Negative conclusion without qualifying evidence fails validation"*. PRD §41.2 adds
`UAT-COV-01` and `UAT-COV-03`, whose fixtures these cases are the systematic version of.

**PRD §14.3, binding on the blind third:** *"**Blind gold answers MUST remain outside ordinary
coding-agent context.**"* This ticket authors **54 development + 18 validation** cases in plaintext and
delivers its **18 blind slots** through `GOLD-01`'s sealed channel (sealing needs only the committed
public key, so the slots exist without any Builder holding the key that opens them).

**Plan §8 Q6 (confirmed) — the division of labour for the blind third.** Blind case content and gold
answers are authored by dedicated `evaluation-author` agents in an isolated session/workspace
**outside this repository**, and are checked by an independent `evaluation-reviewer` agent against
official sources before encryption; no lawyer or employed domain expert is engaged, and the Founder
performs a risk-based spot check of typically 12–20 of the 120 blind cases across all ten categories.
Blind plaintext never enters this ticket's scope: it is never committed to git, copied into ordinary
fixtures, pasted into an implementation agent's session, or exposed to ordinary CI. **This ticket
delivers the visible development and validation cases and the 18 sealed blind *slots*** — envelope,
manifest digest and allowlisted sidecar — and nothing else about the blind third. That division is
settled, not an open Founder question.

**PRD §43.4:** *"Agents may not 'fix' a failing gold case by changing expected output without a
versioned founder-approved reason."*

**Requirement.** `EVAL-001`: 360/120/120 with a passing split-integrity test; this ticket contributes
exactly 54/18/18.

**What is already decided elsewhere and must not be re-decided here.** `GOLD-01` owns the schema, ids
(`EVAL-AWD-###`), stratification schema, seal and checker. `SINS-03` owns the `FWC-AWARDS` adapter and
declares `evaluation_subset_ref` ids (PRD §40.8 item 11) this category must satisfy. `ASK-08` owns the
Coverage workflow implementation — these cases measure it and never re-specify it.

**Sub-PRD decisions carried forward:** **D1**–**D3**, **D5**, **D6**, **D7**, **D8**, **D18**.

**Accepted caveats carried forward:**

- **A pinned evaluation CorpusRelease may not exist yet** (sub-PRD **Q-GOLD-D**); `GOLD_RESOLVES`
  reports `UNRESOLVED` until one is supplied and becomes blocking at `GOLD-17`.
- **Classification realism is a human judgement.** The checker proves counts, schema, stratification and
  seals; whether a classification trap reflects real award structure is founder/reviewer work
  (PRD §43.4).

## Goal

Author the `awards-coverage` evaluation category: exactly **90** cases — 54 development, 18 validation
(plaintext) and 18 blind (sealed) — grounded in `FWC-AWARDS` corpus ids for modern awards, their
variation histories, coverage clauses and classification structures, with traps that systematically
exercise each PRD §8.5 rule (order, job-title-only, multiple visible candidates, pinpoint-evidence
negatives) across the PRD §6.6 three financial years, plus the category's `stratification.yaml` and its
dataset-version registration. Completion is mechanically checkable: `uv run python -m evaluation.dataset
verify --category awards-coverage` passes with counts exactly 54/18/18, no cross-split overlap, all
declared floors met, every blind slot sealed with a matching digest and allowlisted sidecar, and every
`evaluation_subset_ref` id `fwc-awards` names existing here.

## Non-goals

- **No other category's cases** — `GOLD-05`, `GOLD-07` … `GOLD-14`. Enterprise-agreement lifecycle cases
  belong to `GOLD-07`; only the *agreement-blocks-award* interaction appears here, and it is tagged, not
  duplicated.
- **No schema, id rules, seal or checker** — `GOLD-01` (merged; blocker).
- **No metrics, thresholds, gates, judge or reports** — `GOLD-02`, `GOLD-03`, `GOLD-04`, `GOLD-17`.
- **No Coverage Navigator implementation, candidate ranking or screen** — `15-answer-product` (`ASK-08`,
  `ASK-09`). These cases measure that behaviour; they do not define it.
- **No adapter, registry row, pay-data model or corpus build** — `SINS-03` (merged; blocker), `SINS-01`,
  `INGF-07`, `CRPS-06`.
- **No blind gold plaintext anywhere in the repository, a diff, an issue, a PR body or a transcript** —
  PRD §14.3, §45.1 item 6.
- **No blind case authoring, review or decryption** — plan §8 **Q6** (confirmed) puts authoring with the
  `evaluation-author` agents outside this repository, per-case review with the independent
  `evaluation-reviewer` agent, and opening with the Founder alone. This ticket delivers sealed slots.
- **No product fix**: a case that exposes a defect routes to the owning module (PRD §43.4).

## File-scope (write-owns)

Owned by this ticket:

- `evals/cases/awards-coverage/**` — `stratification.yaml`, `development/*.yaml`, `validation/*.yaml`,
  `blind/*.sidecar.yaml`, `manifest.yaml`, `README.md`
- `evals/gold/awards-coverage/**` — `development/*.yaml`, `validation/*.yaml`, `blind/*.sealed`,
  `blind/manifest.json`

Does not touch:

- The other nine category directories — `GOLD-05`, `GOLD-07` … `GOLD-14`.
- `evals/splits/**`, `schemas/evaluation/**`, `pipelines/evaluation/**` — `GOLD-01` … `GOLD-04`,
  `GOLD-15`, `GOLD-16`. Dataset-version entries are created **through `GOLD-01`'s CLI**.
- `evals/reports/**` — `GOLD-03`; `evals/reports/release-candidate/**` — `GOLD-17`.
- `pipelines/adapters/**`, `pipelines/ingestion/**`, `pipelines/corpus-builder/**` — `04`–`10`.
- `apps/**`, `packages/**`, `services/**`, `infra/**`, `tests/**` — other modules per plan §4.
  `docs/PRD.md`, `.claude/**` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). The two directories are named after this category and are written by no other ticket (plan
§5.22); the nine concurrent authoring siblings own differently-named directories — PRD §44.3 names
*"individual evaluation categories"* as a canonical safe parallel unit, and no central split index
exists to contend on (sub-PRD **D4**). `GOLD-02` and `GOLD-16` run concurrently in disjoint code trees.
Both declared blockers land first: `GOLD-01` (module wave 1) and `SINS-03` (`07-sources-instruments`
wave 2). No shared append-only file.

## Deliverables

1. **`evals/cases/awards-coverage/stratification.yaml`** — counts `54/18/18`; product-surface floors
   `COVERAGE ≥ 12`, `ASK ≥ 30`, `SEARCH ≥ 3` (sub-PRD cross-cutting table); answer-status floors
   `SUPPORTED ≥ 2`, `CONDITIONAL ≥ 2` per split and `INSUFFICIENT_EVIDENCE ≥ 1` in the category;
   coverage-stage floors — at least 6 cases per PRD §8.5 stage 4 (award candidates), stage 5
   (industry/occupational coverage and exclusions) and stage 6 (classification); financial-year spread
   across PRD §6.6's three years; required trap types (deliverable 4).
2. **54 development cases** in `development/`, ids `EVAL-AWD-###`, each carrying every PRD §14.1/§43.2
   field. Subject coverage from PRD §6.2 and §43.1 row 2: award coverage by industry and occupation,
   coverage exclusions, classification structures and levels, allowances and penalty/overtime
   provisions where they turn on classification, junior/apprentice/trainee rates, variation histories
   (including annual-wage-review variations) and the pay data attached to an award version.
3. **18 validation cases** in `validation/` — independent of development: no shared scenario and no
   paraphrase (`NO_NEAR_DUPLICATES` compares across splits).
4. **Trap coverage — the PRD §8.5 rules made testable.** The category must include at least:
   - **job title only** (`COV-002`, `UAT-COV-01`): a case whose facts give only a job title; expected
     result is multiple visible candidates plus decisive missing facts, never a confirmed
     classification;
   - **multiple candidates retained**: evidence cannot select one; `acceptable_statuses` permits
     `CONDITIONAL`/`INSUFFICIENT_EVIDENCE` but not a single confirmed candidate;
   - **award-free without evidence** (`COV-004`, `UAT-COV-03`): a definitive negative conclusion is
     prohibited unless pinpoint exclusion evidence exists; `prohibited_claims` names the unsupported
     negative;
   - **agreement displaces award** (PRD §8.5 stages 3–4): an applicable agreement means the award
     question changes shape — tagged `agreements`, primary category stays here;
   - **classification depends on principal duties, not seniority label** (PRD §8.5 stage 6);
   - **variation timing**: the same facts answered at two `legal_as_at` dates give different rates or
     coverage because of a variation within the three-year window;
   - **guidance vs instrument**: FWO or regulator guidance that must not override the award's operative
     text (PRD §9.1).
5. **Gold authorities** in `evals/gold/awards-coverage/{development,validation}/` — immutable corpus ids
   for the award `document_version_id`/`node_version_id` that decide each case, `required: true` for the
   nodes recall@10 must find (typically the coverage clause and the classification definition),
   `required: false` for additionally acceptable authorities, plus `required_claims`, `optional_claims`,
   `prohibited_claims` and the expected `citation_role` per authority. Pinpoint offsets are mandatory
   for coverage and classification clauses, because `COV-004`'s evidence standard is *pinpoint*
   evidence (PRD §8.5, §15.3).
6. **18 blind slots, sealed** — `evals/gold/awards-coverage/blind/<id>.sealed` + `blind/manifest.json` +
   `evals/cases/awards-coverage/blind/<id>.sidecar.yaml` with allowlisted fields only. Sealing uses only
   `evals/splits/blind-recipient.pub`; the plaintext working directory is git-ignored and never
   committed, pasted or summarised. The plaintext itself is authored outside this repository by the
   `evaluation-author` agents and checked by the independent `evaluation-reviewer` agent before
   encryption (PRD §14.3, §45.1 item 6; plan §8 **Q6**, confirmed); this ticket's obligation is that the
   slots exist, are sealed, are counted and are stratified.
7. **`manifest.yaml`** — primary category, code `AWD`, counts, pinned `corpus_release_id`,
   `dataset_version`, and the `evaluation_subset_ref` ids satisfied.
8. **Adapter reciprocity** — every `AWD`-range id declared in
   `pipelines/adapters/fwc-awards/registry.yaml` (`INGF-07` deliverable 1, PRD §40.8 item 11) exists
   here; an id naming another category is reported for `GOLD-16`, not created here.
9. **Dataset registration** — all 90 cases registered through `GOLD-01`'s CLI with content hashes and
   envelope digests, `change_reason` and `approved_by` (PRD §14.3, §43.4).
10. **`README.md`** — category scope, the trap inventory mapped to `COV-001` … `COV-004`, authoring
    conventions (synthetic employers, invented ABNs, no real PII — sub-PRD **D18**), and the statement
    that blind material is sealed and must never be opened, pasted or summarised here.

## Acceptance checklist (classified)

- [ ] `[machine]` **Counts are exactly 54 / 18 / 18 = 90**, matching PRD §43.1 row 2. (PRD §43.1;
      `EVAL-001`)
- [ ] `[machine]` **Every case validates** against `GOLD-01`'s schema with all PRD §14.1 fields present.
      (PRD §14.1, §43.2; sub-PRD D6)
- [ ] `[machine]` **No overlap**: no id in two splits; no near-duplicate scenario/question across splits;
      ids contiguous in `EVAL-AWD-###` and never reused. (PRD §30.2 `EVAL-001`)
- [ ] `[machine]` **Coverage-stage stratification holds**: the declared floors for PRD §8.5 stages 4, 5
      and 6, the `COVERAGE ≥ 12` surface floor and the status floors are met per split. (PRD §8.5;
      §43.1)
- [ ] `[machine]` **`COV-002` trap present and encoded**: at least one job-title-only case whose
      `expected_answer_status` and `prohibited_claims` forbid a confirmed classification. (PRD §30.2
      `COV-002`; §41.2 `UAT-COV-01`)
- [ ] `[machine]` **`COV-004` trap present and encoded**: at least one award-free/exclusion case whose
      gold requires **pinpoint** evidence and whose `prohibited_claims` names the unsupported negative
      conclusion. (PRD §30.2 `COV-004`; §41.2 `UAT-COV-03`; §8.5)
- [ ] `[machine]` **Gold shape and pinpoints**: every case has ≥ 1 `required: true` authority; coverage
      and classification authorities carry pinpoint offsets. (PRD §43.2, §15.3, §8.5)
- [ ] `[machine]` **Gold resolves against the pinned release** when supplied; `UNRESOLVED` and non-zero
      exit otherwise. (PRD §43.2, §40.9; sub-PRD D7)
- [ ] `[machine]` **Blind integrity without decryption**: 18 envelopes, 18 sidecars, digests match,
      sidecars carry only allowlisted fields, `guard-blind` finds no plaintext. (PRD §14.3, §43.1)
- [ ] `[machine]` **No key needed to deliver**: sealing uses only the committed public key; no private
      key and no blind plaintext appears in the diff or history. (PRD §45.1 item 6; sub-PRD D2)
- [ ] `[machine]` **Adapter reciprocity**: every `EVAL-AWD-###` id in
      `pipelines/adapters/fwc-awards/registry.yaml` exists here. (PRD §40.8 item 11)
- [ ] `[machine]` **Synthetic only**: no real person, contact detail or payroll identifier; employers and
      ABNs invented and flagged. (PRD §14.1; §10.1; sub-PRD D18)
- [ ] `[machine]` **Registered dataset version** for all 90 cases with hashes, reason and approver.
      (PRD §14.3; §43.4)
- [ ] `[machine]` `uv run pytest` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm test` green — unaffected; no code in this ticket. `cargo test --workspace`
      unaffected. (PRD §45.3)
- [ ] `[human]` **Case-quality review**: a founder/reviewer confirms the awards, coverage clauses and
      classification structures are realistic, that each trap is a genuine legal trap, and that no case
      can be answered correctly by pattern-matching a job title. Plan §1.1 maps case-quality judgement to
      `[human]`. (PRD §43.4; §8.5)
- [ ] `[human]` **Blind third**: the Founder confirms the 18 sealed slots were produced under plan §8
      **Q6**'s confirmed path — `evaluation-author` agents outside this repository, independent
      `evaluation-reviewer` check against official sources before encryption — and applies the
      risk-based spot check where this category is sampled (typically 12–20 across the whole 120
      blind cases). Recorded in the ADR `GOLD-01` authors. (PRD §14.3; plan §8 **Q6**)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs (**EVAL-001**; exercises **COV-001** …
      **COV-004**), user-visible change and non-goals, schema compatibility impact (data only),
      tenant/PII/security impact (synthetic; blind sealed; no key in diff), **source/licence impact**
      (gold cites official FWC award nodes; quotes stay within the licence assessment's limits),
      cost/latency impact (adds 90 cases to a full run), rollback path (dataset version), known gaps.

Absent classes: no `[fixture]` criteria — no recorded evaluation run exists to replay at this point in
the DAG (`GOLD-02` is not a blocker of this ticket); the first replay of these cases is `GOLD-17`'s.

## Test plan

Every `[machine]` step runs offline and **without the blind seal key**.

1. **Verify the category.** `uv run python -m evaluation.dataset verify --category awards-coverage
   --format json`; read the findings.
2. **Counts against the PRD.** 54 / 18 / 18 / 90, matching §43.1 row 2.
3. **Read the plaintext cases.** Development and validation cases are not blind and may be read freely:
   spot-check ten against the schema, and confirm each declared PRD §8.5 stage floor is genuinely
   represented rather than tagged.
4. **Verify the blind third without reading it.** `guard-blind` → 18 envelopes, 18 sidecars, digests
   match, allowlisted fields only, no plaintext; confirm by inspection that the `.sealed` files are
   opaque and no sidecar carries a question, scenario or gold field. **Do not request or accept a
   plaintext copy** (PRD §14.3, §45.1 item 6).
5. **`COV-002` / `COV-004` traps.** Open the job-title-only case and the award-free case; confirm the
   expected status, `prohibited_claims` and pinpoint gold make the wrong answer impossible to score as
   correct.
6. **Overlap.** Assert `SPLIT_DISJOINT` and `NO_NEAR_DUPLICATES`; on a scratch copy paraphrase a
   development question into validation and confirm the checker fails.
7. **Gold resolution.** `verify --category awards-coverage --release <path>`; corrupt one `node_id` on a
   scratch copy and confirm `GOLD_RESOLVES` fails.
8. **Adapter reciprocity.** Grep `pipelines/adapters/fwc-awards/registry.yaml` for
   `evaluation_subset_ref` and confirm each `AWD` id exists.
9. **Synthetic scan** and **version registry** as in the checker's output; edit a case on a scratch copy
   and confirm `VERSIONED_CORRECTIONS` fails without a new version.
10. **Suite.** `uv run pytest` from the repository root.
11. **Reviewer focus.** Confirm the validation set is independent of development; confirm classification
    cases turn on principal duties rather than titles; confirm negative conclusions always carry pinpoint
    gold; confirm nothing in the diff, PR body or commit messages contains blind content.

## Feedback obligation

1. **General rule.** If authoring falsifies this ticket, update **this ticket** (docs PR → merge →
   `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/21-evaluation-600/README.md` (version +0.1 with a changelog line) **before** changing data.
   Every later change to a delivered case is a **versioned dataset correction** with a reason and an
   approver (PRD §14.3).
2. **Foreseeable frictions, each with its exact writeback target:**
   - *The corpus lacks enough distinct awards/classification structures for 90 non-overlapping cases* →
     do not pad with paraphrases and do not reduce the count. Record the shortfall in
     `docs/prd/21-evaluation-600/README.md` and route it to `GOLD-16` and the Founder as a **coverage**
     finding under PRD §7/§44.4.
   - *An award is varied and a gold node stops resolving* → create a **formal dataset migration** through
     `GOLD-01`'s `migrate` command linking old→new gold with a reason (PRD §43.2); never repoint a gold
     id silently.
   - *The Coverage workflow disagrees with a case's expected candidate set* → classify it under PRD
     §43.4 and route it to `ASK-08`. **Never** change the expected output to match the implementation;
     `COV-002`/`COV-004` are the requirements this category exists to protect.
   - *A stratification floor cannot be met inside 90 cases* → change the floor in `stratification.yaml`,
     record it in the README's cross-cutting table, and re-check the global invariant at `GOLD-17`.
   - *An `evaluation_subset_ref` id from `fwc-awards` belongs elsewhere* → report to `GOLD-16` and raise a
     docs PR against `SINS-03`; do not create a mis-categorised case here.
3. **Falsified protocol.** **If any part of this work appears to require reading, writing, quoting or
   summarising blind case content or gold answers in ordinary context, the task is wrong** — that
   overturns PRD §14.3 and §45.1 item 6. Stop, escalate to the Founder (plan §8 **Q6**), and write back
   to `docs/prd/21-evaluation-600/README.md` and `docs/prd/breakdown-plan.md` **R9**. Equally, a change
   to the 54/18/18 allocation is a **PRD** change under §45.5 requiring Founder approval — never a local
   adjustment to make a checker pass.
