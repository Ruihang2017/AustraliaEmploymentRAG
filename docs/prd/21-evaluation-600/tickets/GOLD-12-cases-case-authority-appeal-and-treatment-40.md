---
id: GOLD-12
title: "Cases: case authority, appeal and treatment (40)"
module: 21-evaluation-600
lane: 21-evaluation-600
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [GOLD-01, SCAS-02, SCAS-03, SCAS-04, SCAS-05]
blocks: [GOLD-17]
---

# GOLD-12 — Cases: case authority, appeal and treatment (40)

Implements PRD §43.1 (row 8), §9.2/§9.3 and §14.1 — requirement **EVAL-001**, exercising **SRCH-004**
and **SRCH-005**; epic `E31-EVAL-600`.
No ADR — the decision is already made in PRD §43.1 (the category and its 24/8/8 allocation) and PRD §9.2
(the case-treatment rules, including `TREATMENT_NOT_CONFIRMED`); this is build ticket 12 of 17 against
it.
Parent sub-PRD: [21-evaluation-600 README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [GOLD-01 — Case schema, splits, integrity and blind protection](GOLD-01-case-schema-splits-integrity-and-blind-protection.md), [SCAS-02 `CASE-HCA`](../../08-sources-cases/tickets/SCAS-02-case-hca.md), [SCAS-03 `CASE-FCA`](../../08-sources-cases/tickets/SCAS-03-case-fca.md), [SCAS-04 `CASE-FCFCOA`](../../08-sources-cases/tickets/SCAS-04-case-fcfcoa.md), [SCAS-05 `CASE-FWC`](../../08-sources-cases/tickets/SCAS-05-case-fwc.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
the category, its counts and the treatment rules the traps must probe are already fixed by the PRD; this
authors the data against `GOLD-01`'s schema and checker.

## Background + basis

**PRD §43.1, this ticket's row, transcribed verbatim:**

| Primary category | Development | Validation | Blind | Total |
|---|---:|---:|---:|---:|
| Case authority, appeal and treatment | **24** | **8** | **8** | **40** |

**PRD §14.1, the required per-case fields, quoted verbatim:**

> Each case SHOULD include **scenario, question, legal date, jurisdictions, expected answer status,
> required facts, prohibited assumptions, trap types, gold DocumentVersion/NodeVersion authorities,
> required/optional/prohibited claims and expected citation roles.**

`GOLD-01` deliverable 1 makes these required (sub-PRD **D6**); PRD §43.2 adds the rest and *"Gold
authorities use immutable corpus IDs for a named evaluation CorpusRelease."*

**PRD §9.2 case treatment, quoted verbatim — the rules these cases must probe:**

> - Court/tribunal, level, date, case number and neutral citation MUST be displayed.
> - Authority status MUST distinguish binding, potentially binding, persuasive and unknown.
> - Appeal, affirmation, reversal, overruling, distinction, following and citation relationships MAY be
>   asserted only with evidence.
> - **A citation alone establishes `CITES`, not treatment.**
> - **Unconfirmed later treatment MUST display `TREATMENT_NOT_CONFIRMED`.**
> - Holding/reasons MUST be distinguished from obiter, party submissions and background where the source
>   permits.
> - **A single decision MUST NOT be generalised into a universal rule without supporting authority.**

**PRD §9.3 relationship evidence, quoted verbatim:**

> Official structured assertions may support conclusions. Deterministic extraction may support
> conclusions when exact source evidence and parser version are retained. **LLM-discovered relationships
> are `MODEL_SUGGESTED` and MUST NOT change legal status or support a definitive treatment conclusion.**

**PRD §9.1, the hierarchy this category tests directly:** binding judicial authority sits above FWC
orders and persuasive decisions, and *"the statutory version interpreted by a case and later
amendments"* must be considered — a case interpreting a since-amended provision is the archetypal trap
here.

**The requirements these cases exercise** (PRD §30.2): `SRCH-004` *"Exact provision/case/agreement/ABN
matches outrank semantic similarity … Exact-match regression set passes"* and `SRCH-005` *"Source/version
pages expose timeline and relationships without generation"*. PRD §8.6 gives the
**authority/instrument** Compare dimension this category carries (sub-PRD cross-cutting floors).

**PRD §14.3, binding on the blind third:** *"**Blind gold answers MUST remain outside ordinary
coding-agent context.**"* This ticket authors **24 development + 8 validation** cases in plaintext and
delivers its **8 blind slots** through `GOLD-01`'s sealed channel — sealing requires only the committed
public key, so the slots exist without any Builder holding the key that opens them.

**Plan §8 Q6 (confirmed) — the division of labour for the blind third.** Blind case content and gold
answers are authored by dedicated `evaluation-author` agents in an isolated session/workspace
**outside this repository**, and are checked by an independent `evaluation-reviewer` agent against
official sources before encryption; no lawyer or employed domain expert is engaged, and the Founder
performs a risk-based spot check of typically 12–20 of the 120 blind cases across all ten categories.
Blind plaintext never enters this ticket's scope: it is never committed to git, copied into ordinary
fixtures, pasted into an implementation agent's session, or exposed to ordinary CI. **This ticket
delivers the visible development and validation cases and the 8 sealed blind *slots*** — envelope,
manifest digest and allowlisted sidecar — and nothing else about the blind third. That division is
settled, not an open Founder question.

**PRD §43.4:** *"Agents may not 'fix' a failing gold case by changing expected output without a
versioned founder-approved reason."*

**Requirement.** `EVAL-001`: 360/120/120 with a passing split-integrity test; this ticket contributes
exactly 24/8/8.

**What is already decided elsewhere and must not be re-decided here.** `GOLD-01` owns the schema, ids
(`EVAL-CAS-###`), stratification schema, seal and checker. `SCAS-01` owns the case-law primitives
(citation-level, paragraph identity, treatment) and `SCAS-02` … `SCAS-05` own the HCA/FCA/FCFCOA/FWC
adapters and their `evaluation_subset_ref` ids (PRD §40.8 item 11). `FND-10` owns the authority-hierarchy
predicate; `EVID-05` owns the validator.

**Sub-PRD decisions carried forward:** **D1**–**D3**, **D5**, **D6**, **D7**, **D8**, **D18**.

**Accepted caveats carried forward:**

- **A pinned evaluation CorpusRelease may not exist yet** (sub-PRD **Q-GOLD-D**).
- **State and territory decision collections (`SCAS-06` … `SCAS-13`) are not blockers of this ticket**
  (plan §5.22 lists only `SCAS-02` … `SCAS-05`). Cases here are therefore anchored in the four federal
  and FWC collections; state-court treatment appears as a cross-tag only where the cited decision already
  exists in the pinned release, and never as a `required: true` gold authority.
- **Case parties are public** (PRD §10.1 permits *"public case parties"*), so real decisions may be cited
  — but the **scenario** around them is synthetic (sub-PRD **D18**).

## Goal

Author the `case-treatment` evaluation category: exactly **40** cases — 24 development, 8 validation
(plaintext) and 8 blind (sealed) — grounded in immutable `CASE-HCA`/`CASE-FCA`/`CASE-FCFCOA`/`CASE-FWC`
corpus ids, systematically probing every PRD §9.2 rule (displayed identity, binding/persuasive/unknown
status, evidence-only treatment assertions, `CITES` ≠ treatment, `TREATMENT_NOT_CONFIRMED`, holding vs
obiter, no universal rule from one decision) and PRD §9.3's `MODEL_SUGGESTED` limit, plus the category's
`stratification.yaml` and dataset-version registration. Completion is mechanically checkable:
`verify --category case-treatment` passes with counts exactly 24/8/8, no cross-split overlap, all
declared floors met, every blind slot sealed with a matching digest and allowlisted sidecar, and every
`evaluation_subset_ref` id the four case adapters name existing here.

## Non-goals

- **No other category's cases** — `GOLD-05` … `GOLD-11`, `GOLD-13`, `GOLD-14`.
- **No schema, id rules, seal or checker** — `GOLD-01` (merged; blocker).
- **No metrics, thresholds, gates, judge or reports** — `GOLD-02`, `GOLD-03`, `GOLD-04`, `GOLD-17`.
- **No case-law primitives, treatment extraction or adapter** — `SCAS-01` … `SCAS-05` (merged; blockers).
- **No authority-hierarchy implementation** — `00-foundation` (`FND-10`) and `11-retrieval-engine`
  (`RETR-06`). These cases measure the behaviour.
- **No state/territory decision collections as required gold** — `SCAS-06` … `SCAS-13` are not blockers
  (see caveat).
- **No blind gold plaintext anywhere** — PRD §14.3, §45.1 item 6.
- **No blind case authoring, review or decryption** — plan §8 **Q6** (confirmed) puts authoring with the
  `evaluation-author` agents outside this repository, per-case review with the independent
  `evaluation-reviewer` agent, and opening with the Founder alone. This ticket delivers sealed slots.
- **No product fix**: a defect routes to the owning module's ticket (PRD §43.4).

## File-scope (write-owns)

Owned by this ticket:

- `evals/cases/case-treatment/**` — `stratification.yaml`, `development/*.yaml`, `validation/*.yaml`,
  `blind/*.sidecar.yaml`, `manifest.yaml`, `README.md`
- `evals/gold/case-treatment/**` — `development/*.yaml`, `validation/*.yaml`, `blind/*.sealed`,
  `blind/manifest.json`

Does not touch:

- The other nine category directories — `GOLD-05` … `GOLD-11`, `GOLD-13`, `GOLD-14`.
- `evals/splits/**`, `schemas/evaluation/**`, `pipelines/evaluation/**` — `GOLD-01` … `GOLD-04`,
  `GOLD-15`, `GOLD-16`. Dataset-version entries are created **through `GOLD-01`'s CLI**.
- `evals/reports/**` — `GOLD-03`; `evals/reports/release-candidate/**` — `GOLD-17`.
- `pipelines/**`, `apps/**`, `packages/**`, `services/**`, `infra/**`, `tests/**` — other modules per
  plan §4. `docs/PRD.md`, `.claude/**` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). The two directories are named after this category and are written by no other ticket (plan
§5.22); the nine concurrent authoring siblings own differently-named directories — PRD §44.3's
*"individual evaluation categories"* — and no central split index exists (sub-PRD **D4**). All five
declared blockers land first: `GOLD-01` (module wave 1) and `SCAS-02` … `SCAS-05` (`08-sources-cases`,
each after `SCAS-01`). No shared append-only file.

## Deliverables

1. **`stratification.yaml`** — counts `24/8/8`; **court floor**: ≥ 6 primary cases each anchored in
   `CASE-HCA`, `CASE-FCA`, `CASE-FCFCOA` and `CASE-FWC`; **rule floor**: ≥ 2 cases for each PRD §9.2
   bullet (identity display, authority status, evidence-only treatment, `CITES` ≠ treatment,
   `TREATMENT_NOT_CONFIRMED`, holding vs obiter, no universal rule); surface floors `ASK ≥ 20`,
   `SEARCH ≥ 3`, `COMPARE ≥ 4` (authority/instrument dimension, sub-PRD cross-cutting table); status
   floors `SUPPORTED ≥ 2`, `CONDITIONAL ≥ 2` per split and `CONFLICTING_SOURCES ≥ 1` in the category.
2. **24 development cases** in `development/`, ids `EVAL-CAS-###`, all PRD §14.1/§43.2 fields present.
   Subject coverage: which decision binds a given jurisdiction and level; appeal outcomes and their
   effect; the statutory version a decision interpreted versus the current text; the weight of an FWC
   Full Bench decision relative to a court; obiter versus holding; and neutral-citation/case-number exact
   lookups (`SRCH-004`).
3. **8 validation cases** in `validation/` — independent of development; no shared scenario or paraphrase
   across splits.
4. **Trap coverage — PRD §9.2 made testable.** At least:
   - **`CITES` is not treatment**: a later decision merely citing an earlier one; the expected answer must
     not assert following, approval or distinction; the treatment conclusion is in `prohibited_claims`;
   - **`TREATMENT_NOT_CONFIRMED`**: a decision whose later treatment is unevidenced in the corpus; the
     expected answer displays the unconfirmed state rather than inferring it;
   - **superseded statutory basis**: a decision interpreting a provision amended since; the expected
     answer distinguishes the interpreted version from the current one (PRD §9.1);
   - **level/binding trap**: a persuasive decision presented as if binding; `prohibited_claims` names the
     binding assertion;
   - **one decision ≠ universal rule** (PRD §9.2 final bullet): facts inviting a general rule from a
     single decision;
   - **`MODEL_SUGGESTED` limit** (PRD §9.3): a relationship that only a model could infer; the expected
     answer may mention it as non-definitive and must not change legal status on it;
   - **authority Compare** (`CMP-001`, PRD §8.6): ≥ 4 cases comparing two authorities/instruments, each
     side with its own citations.
5. **Gold authorities** — immutable corpus ids for the decision `document_version_id` and the **paragraph
   `node_version_id`** that carries the holding, using `SCAS-01`'s paragraph identity; `required: true`
   on what recall@10 must find; `citation_role` distinguishing the holding from background; pinpoint
   offsets mandatory wherever the answer turns on specific reasoning (PRD §15.3, §9.2).
6. **8 blind slots, sealed** — envelopes + `blind/manifest.json` + allowlisted sidecars, sealed with the
   committed public key only; plaintext working directory git-ignored and never committed, pasted or
   summarised. The plaintext itself is authored outside this repository by the `evaluation-author`
   agents and checked by the independent `evaluation-reviewer` agent before encryption (PRD §14.3,
   §45.1 item 6; plan §8 **Q6**, confirmed); this ticket's obligation is that the slots exist, are
   sealed, are counted and are stratified.
7. **`manifest.yaml`** — primary category, code `CAS`, counts, per-court distribution, pinned
   `corpus_release_id`, `dataset_version`, satisfied `evaluation_subset_ref` ids.
8. **Adapter reciprocity** — every `CAS`-range id declared in
   `pipelines/adapters/case-{hca,fca,fcfcoa,fwc}/registry.yaml` exists here; an id naming another
   category is reported for `GOLD-16` (PRD §40.8 item 11).
9. **Dataset registration** — all 40 cases registered through `GOLD-01`'s CLI with hashes/digests,
   `change_reason` and `approved_by` (PRD §14.3, §43.4).
10. **`README.md`** — scope, the per-court distribution, the PRD §9.2 rule-to-case map (so a reader can
    see every bullet is covered), the state-collections caveat, authoring conventions (public case
    parties are permitted; scenarios are synthetic — sub-PRD **D18**, PRD §10.1) and the blind-material
    statement.

## Acceptance checklist (classified)

- [ ] `[machine]` **Counts are exactly 24 / 8 / 8 = 40**, matching PRD §43.1 row 8. (`EVAL-001`)
- [ ] `[machine]` **Court and rule floors met**: ≥ 6 cases per court collection and ≥ 2 cases per PRD
      §9.2 bullet, asserted from `stratification.yaml`. (PRD §9.2; §43.1)
- [ ] `[machine]` **Every case validates** against `GOLD-01`'s schema with all PRD §14.1 fields present.
      (PRD §14.1, §43.2)
- [ ] `[machine]` **No overlap**: no id in two splits; no near-duplicate across splits; ids contiguous in
      `EVAL-CAS-###`. (PRD §30.2 `EVAL-001`)
- [ ] `[machine]` **`CITES` ≠ treatment encoded**: at least two cases whose `prohibited_claims` name a
      treatment conclusion drawn from a bare citation. (PRD §9.2)
- [ ] `[machine]` **`TREATMENT_NOT_CONFIRMED` encoded**: at least two cases whose expected output requires
      the unconfirmed state rather than an inferred treatment. (PRD §9.2)
- [ ] `[machine]` **`MODEL_SUGGESTED` limit encoded**: at least one case where a model-inferred
      relationship must not change legal status or support a definitive conclusion. (PRD §9.3)
- [ ] `[machine]` **Binding/persuasive distinction encoded**: at least two cases whose gold sets the
      authority status and whose `prohibited_claims` name the over-claimed status. (PRD §9.2; §9.1)
- [ ] `[machine]` **Compare floor met**: ≥ 4 authority/instrument-dimension Compare cases with per-side
      gold. (PRD §8.6; §30.2 `CMP-001`)
- [ ] `[machine]` **Gold shape and pinpoints**: ≥ 1 `required: true` paragraph-level authority per case;
      holding-carrying paragraphs identified with pinpoint offsets. (PRD §43.2, §15.3, §9.2)
- [ ] `[machine]` **Gold resolves against the pinned release** when supplied; `UNRESOLVED` and non-zero
      exit otherwise. (PRD §43.2, §40.9; sub-PRD D7)
- [ ] `[machine]` **Blind integrity without decryption**: 8 envelopes, 8 sidecars, digests match,
      allowlisted fields only, no plaintext found by `guard-blind`. (PRD §14.3, §43.1)
- [ ] `[machine]` **No key needed to deliver**: only the committed public key is used; no private key and
      no blind plaintext in the diff or history. (PRD §45.1 item 6)
- [ ] `[machine]` **Adapter reciprocity**: every `EVAL-CAS-###` id named by the four case adapters exists
      here. (PRD §40.8 item 11)
- [ ] `[machine]` **Synthetic scenarios**: public case parties may be named; the surrounding scenario,
      employer and employee are invented, with no real person's contact or employment record. (PRD §10.1;
      §14.1; sub-PRD D18)
- [ ] `[machine]` **Registered dataset version** for all 40 cases with hashes, reason and approver.
      (PRD §14.3; §43.4)
- [ ] `[machine]` `uv run pytest` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm test` green — unaffected. `cargo test --workspace` unaffected. (PRD §45.3)
- [ ] `[human]` **Case-quality review**: a founder/reviewer confirms the authority statements are legally
      correct, that holdings are correctly distinguished from obiter, that no case asserts a treatment the
      corpus does not evidence, and that the appeal chains are real. Plan §1.1 maps case-quality judgement
      to `[human]`; PRD §43.4 puts case-treatment failures in the founder queue explicitly. (PRD §43.4
      item 5; §9.2)
- [ ] `[human]` **Blind third**: the Founder confirms the 8 sealed slots were produced under plan §8
      **Q6**'s confirmed path — `evaluation-author` agents outside this repository, independent
      `evaluation-reviewer` check against official sources before encryption — and applies the
      risk-based spot check where this category is sampled (typically 12–20 across the whole 120
      blind cases). Recorded in the ADR `GOLD-01` authors. (PRD §14.3; plan §8 **Q6**)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs (**EVAL-001**; exercises **SRCH-004**,
      **SRCH-005**, **CMP-001**), user-visible change and non-goals, schema compatibility impact (data
      only), tenant/PII/security impact (public case parties only; blind sealed), **source/licence
      impact** (judgment text is cited by paragraph node and offset — no bulk reproduction, and no
      third-party headnote or summary, PRD §6.1), cost/latency impact (adds 40 cases), rollback path
      (dataset version), known gaps.

Absent classes: no `[fixture]` criteria — no recorded evaluation run exists to replay at this point in
the DAG (`GOLD-02` is not a blocker); the first replay is `GOLD-17`'s.

## Test plan

Every `[machine]` step runs offline and **without the blind seal key**.

1. **Verify the category.** `uv run python -m evaluation.dataset verify --category case-treatment
   --format json`.
2. **Counts and floors.** Assert 24/8/8/40, ≥ 6 per court, ≥ 2 per PRD §9.2 bullet.
3. **Read the plaintext cases.** Open the rule-to-case map in the README and confirm each PRD §9.2 bullet
   has a real case behind it, not a tag.
4. **Verify the blind third without reading it.** `guard-blind` → 8 envelopes, 8 sidecars, digests match,
   allowlisted fields only. **Do not request or accept a plaintext copy** (PRD §14.3, §45.1 item 6).
5. **Treatment traps.** Open the `CITES`-only and `TREATMENT_NOT_CONFIRMED` cases; confirm the prohibited
   conclusions are encoded and that gold cites no relationship the corpus does not evidence (PRD §9.3).
6. **Paragraph-level gold.** Confirm gold targets paragraph `node_version_id`s with pinpoint offsets, not
   whole judgments — a whole-judgment citation makes citation precision unmeasurable.
7. **Compare cases.** Confirm each has per-side gold on the authority/instrument dimension.
8. **Overlap, gold resolution, licence scan, version registry** — from the checker's output; on a scratch
   copy corrupt one `node_id` and one case's content to confirm `GOLD_RESOLVES` and
   `VERSIONED_CORRECTIONS` fail.
9. **Suite.** `uv run pytest` from the repository root.
10. **Reviewer focus.** Confirm the validation set is independent of development; confirm no case
    generalises a single decision into a rule; confirm no third-party headnote or commercial summary is
    used as an authority (PRD §6.1); confirm nothing in the diff, PR body or commit messages contains
    blind content.

## Feedback obligation

1. **General rule.** If authoring falsifies this ticket, update **this ticket** (docs PR → merge →
   `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/21-evaluation-600/README.md` (version +0.1 with a changelog line) **before** changing data.
   Later changes to delivered cases are **versioned dataset corrections** (PRD §14.3).
2. **Foreseeable frictions, each with its exact writeback target:**
   - *The corpus evidences no later treatment for any suitable decision, so `TREATMENT_NOT_CONFIRMED`
     cases are trivial* → that is still the correct behaviour to test. Record the limitation in
     `docs/prd/21-evaluation-600/README.md` and raise treatment-evidence coverage with `SCAS-01`; do not
     invent a treatment relationship to make a case interesting — PRD §9.2 permits assertions *"only with
     evidence"*.
   - *A needed decision lives in a state collection that is not a blocker of this ticket* → keep it as a
     cross-tag or non-required authority; a required dependency on `SCAS-06` … `SCAS-13` is a **plan**
     change (docs PR against `docs/prd/breakdown-plan.md` §5.22/§6.2), never an invented edge.
   - *An appeal outcome lands after authoring and changes a case's answer* → create a **formal dataset
     migration** through `GOLD-01`'s `migrate` command with the reason (PRD §43.2, §14.3). Case treatment
     is the most legally volatile category in the dataset.
   - *The product asserts treatment from a bare citation* → that is the defect this category exists to
     catch. Classify under PRD §43.4 (item 5 names case-treatment failures explicitly) and route to
     `SCAS-01`/`RETR-06`/`EVID-05`; **never** change the expected output.
   - *An `evaluation_subset_ref` id belongs elsewhere* → report to `GOLD-16`; raise a docs PR against the
     owning `SCAS-*` ticket.
3. **Falsified protocol.** **If any part of this work appears to require reading, writing, quoting or
   summarising blind case content or gold answers in ordinary context, the task is wrong** — that
   overturns PRD §14.3 and §45.1 item 6. Stop, escalate to the Founder (plan §8 **Q6**), and write back
   to `docs/prd/21-evaluation-600/README.md` and `docs/prd/breakdown-plan.md` **R9**. A change to the
   24/8/8 allocation is a **PRD** change under §45.5 requiring Founder approval.
