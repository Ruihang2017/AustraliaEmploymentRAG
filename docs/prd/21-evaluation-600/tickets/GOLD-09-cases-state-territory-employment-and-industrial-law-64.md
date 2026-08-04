---
id: GOLD-09
title: "Cases: state/territory employment and industrial law (64)"
module: 21-evaluation-600
lane: 21-evaluation-600
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [GOLD-01, SLEG-03, SLEG-04, SLEG-05, SLEG-06, SLEG-07, SLEG-08, SLEG-09, SLEG-10]
blocks: [GOLD-17]
---

# GOLD-09 — Cases: state/territory employment and industrial law (64)

Implements PRD §43.1 (row 5), §6.3 and §14.1 — requirement **EVAL-001**, exercising **CMP-001**; epic
`E31-EVAL-600`.
No ADR — the decision is already made in PRD §43.1 (the category and its 38/13/13 allocation) and PRD
§6.3 (the eight-jurisdiction subject scope); this is build ticket 9 of 17 against it.
Parent sub-PRD: [21-evaluation-600 README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [GOLD-01 — Case schema, splits, integrity and blind protection](GOLD-01-case-schema-splits-integrity-and-blind-protection.md) and the eight state/territory legislation registers [SLEG-03 `LEG-NSW`](../../06-sources-legislation/tickets/SLEG-03-leg-nsw.md), [SLEG-04 `LEG-VIC`](../../06-sources-legislation/tickets/SLEG-04-leg-vic.md), [SLEG-05 `LEG-QLD`](../../06-sources-legislation/tickets/SLEG-05-leg-qld.md), [SLEG-06 `LEG-WA`](../../06-sources-legislation/tickets/SLEG-06-leg-wa.md), [SLEG-07 `LEG-SA`](../../06-sources-legislation/tickets/SLEG-07-leg-sa.md), [SLEG-08 `LEG-TAS`](../../06-sources-legislation/tickets/SLEG-08-leg-tas.md), [SLEG-09 `LEG-ACT`](../../06-sources-legislation/tickets/SLEG-09-leg-act.md), [SLEG-10 `LEG-NT`](../../06-sources-legislation/tickets/SLEG-10-leg-nt.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
the category, its counts and the eight-jurisdiction coverage rule are already fixed by the PRD; this
authors the data against `GOLD-01`'s schema and checker.

## Background + basis

**PRD §43.1, this ticket's row, transcribed verbatim:**

| Primary category | Development | Validation | Blind | Total |
|---|---:|---:|---:|---:|
| State/territory employment and industrial law (eight jurisdictions) | **38** | **13** | **13** | **64** |

> **At least eight primary cases in each applicable nationwide category must cover each
> state/territory.**

64 = 8 × 8, so this category's floor is exact: **eight primary cases per jurisdiction**, with none left
over.

**PRD §14.1, the required per-case fields, quoted verbatim:**

> Each case SHOULD include **scenario, question, legal date, jurisdictions, expected answer status,
> required facts, prohibited assumptions, trap types, gold DocumentVersion/NodeVersion authorities,
> required/optional/prohibited claims and expected citation roles.**

`GOLD-01` deliverable 1 makes these required (sub-PRD **D6**); PRD §43.2 adds the rest and *"Gold
authorities use immutable corpus IDs for a named evaluation CorpusRelease."*

**PRD §6.3, the subject scope, quoted verbatim** (for NSW, Victoria, Queensland, Western Australia,
South Australia, Tasmania, the ACT and the Northern Territory): *"employment and industrial-relations
legislation and guidance; long-service leave; … workplace surveillance and employment-related privacy;
… child employment; public-sector employment; relevant regulators, courts and tribunals."* WHS/OHS and
workers compensation are `GOLD-10`; discrimination, labour hire, migration and whistleblowing are
`GOLD-11`; **this category owns state/territory employment and industrial law and long-service leave**.

**PRD §36.2, the filter these cases must probe:** a candidate is eligible only if *"requested
jurisdiction intersects applicable jurisdiction"*, and PRD §14.2 gates *"Critical legal-date or
jurisdiction errors"* at **0**. A case whose facts sit in one state while the plausible answer text comes
from another is the archetypal jurisdiction trap.

**PRD §8.6 Compare, quoted verbatim:** *"Compare MUST support jurisdiction, time and
authority/instrument dimensions. Each dimension MUST run its own date, jurisdiction and status filtering
and MUST have its own claims/citations."* This category carries the sub-PRD's **jurisdiction**-dimension
Compare floor (`CMP-001`, `UAT-CMP-02`).

**PRD §14.3, binding on the blind third:** *"**Blind gold answers MUST remain outside ordinary
coding-agent context.**"* This ticket authors **38 development + 13 validation** cases in plaintext and
delivers its **13 blind slots** through `GOLD-01`'s sealed channel — sealing requires only the
committed public key, so the slots exist without any Builder holding the key that opens them.

**Plan §8 Q6 (confirmed) — the division of labour for the blind third.** Blind case content and gold
answers are authored by dedicated `evaluation-author` agents in an isolated session/workspace
**outside this repository**, and are checked by an independent `evaluation-reviewer` agent against
official sources before encryption; no lawyer or employed domain expert is engaged, and the Founder
performs a risk-based spot check of typically 12–20 of the 120 blind cases across all ten categories.
Blind plaintext never enters this ticket's scope: it is never committed to git, copied into ordinary
fixtures, pasted into an implementation agent's session, or exposed to ordinary CI. **This ticket
delivers the visible development and validation cases and the 13 sealed blind *slots*** — envelope,
manifest digest and allowlisted sidecar — and nothing else about the blind third. That division is
settled, not an open Founder question.

**PRD §43.4:** *"Agents may not 'fix' a failing gold case by changing expected output without a
versioned founder-approved reason."*

**Requirement.** `EVAL-001`: 360/120/120 with a passing split-integrity test; this ticket contributes
exactly 38/13/13.

**What is already decided elsewhere and must not be re-decided here.** `GOLD-01` owns the schema, ids
(`EVAL-STE-###`), stratification schema, seal and checker. `SLEG-01` owns the point-in-time/commencement
primitives and `SLEG-03` … `SLEG-10` own their registers and `evaluation_subset_ref` ids (PRD §40.8
item 11). `ASK-11`/`ASK-12` own Compare.

**Sub-PRD decisions carried forward:** **D1**–**D3**, **D5**, **D6**, **D7**, **D8**, **D18**.

**Accepted caveats carried forward:**

- **A pinned evaluation CorpusRelease may not exist yet** (sub-PRD **Q-GOLD-D**).
- **Eight adapters are blockers**, so real per-jurisdiction corpus ids exist before authoring starts.
- **Federal displacement is a legal reality**, not a case defect: several state provisions are wholly or
  partly displaced for national-system employees. Cases must state which system applies and cite the
  evidence (PRD §8.5 stage 1).

## Goal

Author the `state-employment` evaluation category: exactly **64** cases — 38 development, 13 validation
(plaintext) and 13 blind (sealed) — with **exactly 8 primary cases per state/territory** (≥ 4
development, ≥ 1 validation and ≥ 1 blind each), grounded in immutable `LEG-*` corpus ids for
state/territory employment, industrial-relations and long-service-leave law across the PRD §6.6 three
financial years, including at least four jurisdiction-dimension Compare cases, plus the category's
`stratification.yaml` and dataset-version registration. Completion is mechanically checkable:
`verify --category state-employment` passes with counts exactly 38/13/13, the eight-per-jurisdiction
floor met, no cross-split overlap, every blind slot sealed with a matching digest and allowlisted
sidecar, and every `evaluation_subset_ref` id the eight registers name existing here.

## Non-goals

- **No other category's cases** — WHS/OHS and workers compensation are `GOLD-10`; discrimination,
  privacy/surveillance, labour hire, migration, child/public-sector/whistleblowing are `GOLD-11`;
  payroll tax is `GOLD-08`; federal law is `GOLD-05`.
- **No schema, id rules, seal or checker** — `GOLD-01` (merged; blocker).
- **No metrics, thresholds, gates, judge or reports** — `GOLD-02`, `GOLD-03`, `GOLD-04`, `GOLD-17`.
- **No adapter, point-in-time primitive or registry row** — `SLEG-01`, `SLEG-03` … `SLEG-10` (merged;
  blockers), `INGF-07`.
- **No Compare implementation** — `15-answer-product` (`ASK-11`, `ASK-12`). These cases measure it.
- **No blind gold plaintext anywhere** — PRD §14.3, §45.1 item 6.
- **No blind case authoring, review or decryption** — plan §8 **Q6** (confirmed) puts authoring with the
  `evaluation-author` agents outside this repository, per-case review with the independent
  `evaluation-reviewer` agent, and opening with the Founder alone. This ticket delivers sealed slots.
- **No product fix**: a defect routes to the owning module's ticket (PRD §43.4).

## File-scope (write-owns)

Owned by this ticket:

- `evals/cases/state-employment/**` — `stratification.yaml`, `development/*.yaml`, `validation/*.yaml`,
  `blind/*.sidecar.yaml`, `manifest.yaml`, `README.md`
- `evals/gold/state-employment/**` — `development/*.yaml`, `validation/*.yaml`, `blind/*.sealed`,
  `blind/manifest.json`

Does not touch:

- The other nine category directories — `GOLD-05` … `GOLD-08`, `GOLD-10` … `GOLD-14`.
- `evals/splits/**`, `schemas/evaluation/**`, `pipelines/evaluation/**` — `GOLD-01` … `GOLD-04`,
  `GOLD-15`, `GOLD-16`. Dataset-version entries are created **through `GOLD-01`'s CLI**.
- `evals/reports/**` — `GOLD-03`; `evals/reports/release-candidate/**` — `GOLD-17`.
- `pipelines/**`, `apps/**`, `packages/**`, `services/**`, `infra/**`, `tests/**` — other modules per
  plan §4. `docs/PRD.md`, `.claude/**` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). The two directories are named after this category and are written by no other ticket (plan
§5.22); the nine concurrent authoring siblings own differently-named directories — PRD §44.3's
*"individual evaluation categories"* — and no central split index exists (sub-PRD **D4**). All nine
declared blockers land first: `GOLD-01` (module wave 1) and the eight registers
(`06-sources-legislation` wave 2, each after `SLEG-01`). No shared append-only file.

## Deliverables

1. **`stratification.yaml`** — counts `38/13/13`; **per-jurisdiction floor**: exactly 8 primary cases for
   each of `NSW, VIC, QLD, WA, SA, TAS, ACT, NT`, each with ≥ 4 development, ≥ 1 validation and ≥ 1
   blind; surface floors `ASK ≥ 25`, `COMPARE ≥ 4` (jurisdiction dimension, sub-PRD cross-cutting
   table), `SEARCH ≥ 3`; status floors `SUPPORTED ≥ 2`, `CONDITIONAL ≥ 2` per split; ≥ 8 cases whose
   answer changes across the PRD §6.6 financial years.
2. **38 development cases** in `development/`, ids `EVAL-STE-###`, all PRD §14.1/§43.2 fields present.
   Subject coverage per PRD §6.3: state/territory employment and industrial-relations legislation and
   official guidance, long-service leave (including portable-LSL interaction where it is the state
   employment question rather than the adjacent-regime question), public-sector and child-employment
   provisions where they sit in the state employment Act, and the relevant state tribunal's role.
3. **13 validation cases** in `validation/` — independent of development; no shared scenario or
   paraphrase across splits.
4. **Trap coverage.** At least:
   - **jurisdiction trap** (PRD §36.2, §14.2): facts in one state whose plausible answer text comes from
     another; the wrong-state conclusion is in `prohibited_claims`;
   - **system trap** (PRD §8.5 stage 1): a question whose answer depends on whether the employee is in
     the national system, with the displaced state provision cited as background rather than operative;
   - **long-service-leave continuity**: service across entities/jurisdictions where the applicable Act
     turns on a stated fact, producing `CONDITIONAL` when that fact is absent;
   - **amended-in-window**: a provision amended within PRD §6.6's three years where the answer differs by
     `legal_as_at`;
   - **jurisdiction Compare** (`CMP-001`, `UAT-CMP-02`): at least four cases comparing two jurisdictions,
     each side carrying its own citations, and at least one where a side is genuinely unavailable and must
     stay unavailable rather than be made symmetrical.
5. **Gold authorities** — immutable `LEG-*` corpus ids for the operative provision per jurisdiction, with
   `required: true` on what recall@10 must find and pinpoint offsets where the answer turns on specific
   text. Where a case is a Compare case, gold is recorded per dimension side (PRD §8.6 *"each dimension
   … MUST have its own claims/citations"*).
6. **13 blind slots, sealed** — envelopes + `blind/manifest.json` + allowlisted sidecars, sealed with the
   committed public key only; plaintext working directory git-ignored and never committed, pasted or
   summarised. The plaintext itself is authored outside this repository by the `evaluation-author`
   agents and checked by the independent `evaluation-reviewer` agent before encryption (PRD §14.3,
   §45.1 item 6; plan §8 **Q6**, confirmed); this ticket's obligation is that the slots exist, are
   sealed, are counted and are stratified.
7. **`manifest.yaml`** — primary category, code `STE`, counts, the per-jurisdiction distribution, pinned
   `corpus_release_id`, `dataset_version`, satisfied `evaluation_subset_ref` ids.
8. **Adapter reciprocity** — every `STE`-range id declared in
   `pipelines/adapters/leg-{nsw,vic,qld,wa,sa,tas,act,nt}/registry.yaml` exists here; an id naming
   another category is reported for `GOLD-16` (PRD §40.8 item 11).
9. **Dataset registration** — all 64 cases registered through `GOLD-01`'s CLI with hashes/digests,
   `change_reason` and `approved_by` (PRD §14.3, §43.4).
10. **`README.md`** — scope, per-jurisdiction distribution table, trap inventory, the boundary with
    `GOLD-10`/`GOLD-11` (so a later reader does not duplicate a case), authoring conventions (sub-PRD
    **D18**) and the blind-material statement.

## Acceptance checklist (classified)

- [ ] `[machine]` **Counts are exactly 38 / 13 / 13 = 64**, matching PRD §43.1 row 5. (`EVAL-001`)
- [ ] `[machine]` **Eight primary cases per state/territory**, each with ≥ 4 development, ≥ 1 validation
      and ≥ 1 blind — all eight jurisdictions present. (PRD §43.1; §6.3)
- [ ] `[machine]` **Every case validates** against `GOLD-01`'s schema with all PRD §14.1 fields present.
      (PRD §14.1, §43.2)
- [ ] `[machine]` **No overlap**: no id in two splits; no near-duplicate across splits; ids contiguous in
      `EVAL-STE-###`. (PRD §30.2 `EVAL-001`)
- [ ] `[machine]` **Jurisdiction trap encoded**: ≥ 8 cases (one per jurisdiction) whose
      `prohibited_claims` names the plausible-but-wrong jurisdiction's conclusion. (PRD §36.2; §14.2
      *"Critical legal-date or jurisdiction errors 0"*)
- [ ] `[machine]` **Compare floor met**: ≥ 4 jurisdiction-dimension Compare cases, each with per-side
      gold, and ≥ 1 with a genuinely unavailable side whose expected result is "unavailable", not
      symmetry. (PRD §8.6; §30.2 `CMP-002`; §41.2 `UAT-CMP-02`)
- [ ] `[machine]` **Gold shape and pinpoints**: ≥ 1 `required: true` authority per case (per side for
      Compare cases); pinpoint offsets where the answer turns on specific text. (PRD §43.2, §15.3, §8.6)
- [ ] `[machine]` **Gold resolves against the pinned release** when supplied; `UNRESOLVED` and non-zero
      exit otherwise. (PRD §43.2, §40.9; sub-PRD D7)
- [ ] `[machine]` **Blind integrity without decryption**: 13 envelopes, 13 sidecars, digests match,
      allowlisted fields only, no plaintext found by `guard-blind`. (PRD §14.3, §43.1)
- [ ] `[machine]` **No key needed to deliver**: only the committed public key is used; no private key and
      no blind plaintext in the diff or history. (PRD §45.1 item 6)
- [ ] `[machine]` **Adapter reciprocity**: every `EVAL-STE-###` id named by the eight registers exists
      here. (PRD §40.8 item 11)
- [ ] `[machine]` **Synthetic only**: invented employers and employees, no real person, contact or
      payroll identifier. (PRD §14.1; §10.1; sub-PRD D18)
- [ ] `[machine]` **Registered dataset version** for all 64 cases with hashes, reason and approver.
      (PRD §14.3; §43.4)
- [ ] `[machine]` `uv run pytest` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm test` green — unaffected. `cargo test --workspace` unaffected. (PRD §45.3)
- [ ] `[human]` **Case-quality review**: a founder/reviewer confirms each jurisdiction's cases reflect
      that jurisdiction's actual statutory scheme, that national-system displacement is handled honestly,
      and that the jurisdiction traps are genuine rather than lexical. Plan §1.1 maps case-quality
      judgement to `[human]`. (PRD §43.4; §6.3)
- [ ] `[human]` **Blind third**: the Founder confirms the 13 sealed slots were produced under plan §8
      **Q6**'s confirmed path — `evaluation-author` agents outside this repository, independent
      `evaluation-reviewer` check against official sources before encryption — and applies the
      risk-based spot check where this category is sampled (typically 12–20 across the whole 120
      blind cases). Recorded in the ADR `GOLD-01` authors. (PRD §14.3; plan §8 **Q6**)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs (**EVAL-001**; exercises **CMP-001**,
      **CMP-002**), user-visible change and non-goals, schema compatibility impact (data only),
      tenant/PII/security impact (synthetic; blind sealed), source/licence impact (state registers'
      licence terms respected — cite nodes and offsets), cost/latency impact (adds 64 cases), rollback
      path (dataset version), known gaps.

Absent classes: no `[fixture]` criteria — no recorded evaluation run exists to replay at this point in
the DAG (`GOLD-02` is not a blocker); the first replay is `GOLD-17`'s.

## Test plan

Every `[machine]` step runs offline and **without the blind seal key**.

1. **Verify the category.** `uv run python -m evaluation.dataset verify --category state-employment
   --format json`.
2. **Counts and jurisdiction distribution.** Assert 38/13/13/64 and exactly 8 per jurisdiction with the
   per-split floors.
3. **Read the plaintext cases.** Spot-check one case per jurisdiction; confirm the cited Act is that
   jurisdiction's and that the scenario could not be answered from another state's text.
4. **Verify the blind third without reading it.** `guard-blind` → 13 envelopes, 13 sidecars, digests
   match, allowlisted fields only. **Do not request or accept a plaintext copy** (PRD §14.3, §45.1
   item 6).
5. **Jurisdiction traps.** For each of the eight, confirm `prohibited_claims` names the wrong-jurisdiction
   conclusion and that gold carries the correct state's node.
6. **Compare cases.** Confirm each has per-side gold and that the unavailable-side case expects
   unavailability rather than a fabricated symmetric answer.
7. **Overlap, gold resolution, synthetic scan, version registry** — from the checker's output; on a
   scratch copy corrupt one `node_id` and one case's content to confirm `GOLD_RESOLVES` and
   `VERSIONED_CORRECTIONS` fail.
8. **Suite.** `uv run pytest` from the repository root.
9. **Reviewer focus.** Confirm the validation set is independent of development; confirm no case
   silently assumes the national system applies; confirm nothing in the diff, PR body or commit messages
   contains blind content.

## Feedback obligation

1. **General rule.** If authoring falsifies this ticket, update **this ticket** (docs PR → merge →
   `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/21-evaluation-600/README.md` (version +0.1 with a changelog line) **before** changing data.
   Later changes to delivered cases are **versioned dataset corrections** (PRD §14.3).
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A jurisdiction's register lacks enough employment/industrial material for 8 cases* → do not reduce
     the floor silently; PRD §43.1's per-state rule is the thing at risk. Record it in
     `docs/prd/21-evaluation-600/README.md`, raise it with the owning `SLEG-*` ticket and route it to
     `GOLD-16` as a **coverage** finding under PRD §7/§44.4.
   - *A provision is repealed or renumbered and gold stops resolving* → create a **formal dataset
     migration** through `GOLD-01`'s `migrate` command (PRD §43.2, §15.3 node lineage).
   - *The product answers a state question with another state's provision* → that is the defect this
     category exists to catch (PRD §14.2 zero-tolerance jurisdiction errors). Classify under PRD §43.4
     and route to `RETR-04`/`ASK-02`; **never** change the expected output.
   - *A Compare case cannot be expressed because one side has no corpus material* → keep it and mark the
     side unavailable — that is `CMP-002`'s required behaviour, not a case defect.
   - *An `evaluation_subset_ref` id belongs elsewhere* → report to `GOLD-16`; raise a docs PR against the
     owning `SLEG-*` ticket.
3. **Falsified protocol.** **If any part of this work appears to require reading, writing, quoting or
   summarising blind case content or gold answers in ordinary context, the task is wrong** — that
   overturns PRD §14.3 and §45.1 item 6. Stop, escalate to the Founder (plan §8 **Q6**), and write back
   to `docs/prd/21-evaluation-600/README.md` and `docs/prd/breakdown-plan.md` **R9**. A change to the
   38/13/13 allocation or the eight-per-jurisdiction floor is a **PRD** change under §45.5 requiring
   Founder approval.
