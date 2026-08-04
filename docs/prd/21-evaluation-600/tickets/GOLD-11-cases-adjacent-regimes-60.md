---
id: GOLD-11
title: "Cases: discrimination, privacy/surveillance, labour hire, LSL, migration, child/public-sector/whistleblowing (60)"
module: 21-evaluation-600
lane: 21-evaluation-600
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [GOLD-01, SADJ-01, SADJ-02, SADJ-03, SADJ-04, SADJ-05, SADJ-06, SADJ-07, SADJ-08, SADJ-09]
blocks: [GOLD-17]
---

# GOLD-11 — Cases: discrimination, privacy/surveillance, labour hire, LSL, migration, child/public-sector/whistleblowing (60)

Implements PRD §43.1 (row 7), §6.2/§6.3 and §14.1 — requirement **EVAL-001**; epic `E31-EVAL-600`.
No ADR — the decision is already made in PRD §43.1 (the category and its 36/12/12 allocation) and PRD
§6.2/§6.3 (the employment-adjacent regimes); this is build ticket 11 of 17 against it.
Parent sub-PRD: [21-evaluation-600 README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [GOLD-01 — Case schema, splits, integrity and blind protection](GOLD-01-case-schema-splits-integrity-and-blind-protection.md) and the nine employment-adjacent groups [SADJ-01 `ADJ-CTH`](../../09-sources-adjacent/tickets/SADJ-01-adj-cth.md), [SADJ-02 `ADJ-NSW`](../../09-sources-adjacent/tickets/SADJ-02-adj-nsw.md), [SADJ-03 `ADJ-VIC`](../../09-sources-adjacent/tickets/SADJ-03-adj-vic.md), [SADJ-04 `ADJ-QLD`](../../09-sources-adjacent/tickets/SADJ-04-adj-qld.md), [SADJ-05 `ADJ-WA`](../../09-sources-adjacent/tickets/SADJ-05-adj-wa.md), [SADJ-06 `ADJ-SA`](../../09-sources-adjacent/tickets/SADJ-06-adj-sa.md), [SADJ-07 `ADJ-TAS`](../../09-sources-adjacent/tickets/SADJ-07-adj-tas.md), [SADJ-08 `ADJ-ACT`](../../09-sources-adjacent/tickets/SADJ-08-adj-act.md), [SADJ-09 `ADJ-NT`](../../09-sources-adjacent/tickets/SADJ-09-adj-nt.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
the category, its counts and its regimes are already fixed by the PRD; this authors the data against
`GOLD-01`'s schema and checker.

## Background + basis

**PRD §43.1, this ticket's row, transcribed verbatim:**

| Primary category | Development | Validation | Blind | Total |
|---|---:|---:|---:|---:|
| Discrimination, privacy/surveillance, labour hire, LSL, migration, child/public-sector/whistleblowing | **36** | **12** | **12** | **60** |

> **At least eight primary cases in each applicable nationwide category must cover each
> state/territory**; cross-tags ensure every product surface and answer status is represented.

**This is the module's one arithmetic tension** (sub-PRD **Q-GOLD-C**, owner **Founder**): eight
jurisdictions × eight primary cases is 64, and this category has 60 primary cases — several of whose
regimes (migration/right-to-work, Commonwealth privacy and whistleblowing, Commonwealth public-sector
employment) are **not** state matters at all. The checkable rule this ticket implements, recorded in the
sub-PRD: **each of the eight states/territories carries ≥ 5 primary cases here (≥ 3 development, ≥ 1
validation, ≥ 1 blind), the remaining 20 cases cover Commonwealth-level regimes, and the PRD §43.1
eight-per-jurisdiction floor is satisfied across the nationwide categories collectively** — `GOLD-08`
(8/jurisdiction) + `GOLD-09` (8) + `GOLD-10` (8) + this category (≥ 5) — which `GOLD-01`'s `--complete`
check verifies at `GOLD-17`.

**PRD §14.1, the required per-case fields, quoted verbatim:**

> Each case SHOULD include **scenario, question, legal date, jurisdictions, expected answer status,
> required facts, prohibited assumptions, trap types, gold DocumentVersion/NodeVersion authorities,
> required/optional/prohibited claims and expected citation roles.**

`GOLD-01` deliverable 1 makes these required (sub-PRD **D6**); PRD §43.2 adds the rest and *"Gold
authorities use immutable corpus IDs for a named evaluation CorpusRelease."*

**PRD §6.3, the state/territory scope, quoted verbatim:** *"long-service leave; … discrimination and
equal opportunity; … labour hire licensing; portable long-service leave; workplace surveillance and
employment-related privacy; whistleblowing; child employment; public-sector employment; relevant
regulators, courts and tribunals."* **PRD §6.2** adds the Commonwealth side: *"Employment-related
migration and right-to-work materials. Employment-related privacy, surveillance and whistleblowing
material. Commonwealth public-sector employment material."*

**PRD §9.1, the interaction rule these cases must probe:** the engine must consider *"jurisdiction,
legal date, commencement, repeal, transitional provisions, **specific-versus-general rules, instrument
interaction**"*. Adjacent regimes are where a general employment answer is most often displaced by a
specific statute — anti-discrimination, surveillance or labour-hire licensing law — and where regulator
guidance most often reads as if it were operative.

**PRD §10.1, binding on this category's authoring:** employee names, contact details and identifying
combinations are blocked input. Discrimination and whistleblowing scenarios are exactly where a
plausible-sounding case would carry personal detail; every case here is synthetic with invented parties
(sub-PRD **D18**).

**PRD §14.3, binding on the blind third:** *"**Blind gold answers MUST remain outside ordinary
coding-agent context.**"* This ticket authors **36 development + 12 validation** cases in plaintext and
delivers its **12 blind slots** through `GOLD-01`'s sealed channel — sealing requires only the
committed public key, so the slots exist without any Builder holding the key that opens them.

**Plan §8 Q6 (confirmed) — the division of labour for the blind third.** Blind case content and gold
answers are authored by dedicated `evaluation-author` agents in an isolated session/workspace
**outside this repository**, and are checked by an independent `evaluation-reviewer` agent against
official sources before encryption; no lawyer or employed domain expert is engaged, and the Founder
performs a risk-based spot check of typically 12–20 of the 120 blind cases across all ten categories.
Blind plaintext never enters this ticket's scope: it is never committed to git, copied into ordinary
fixtures, pasted into an implementation agent's session, or exposed to ordinary CI. **This ticket
delivers the visible development and validation cases and the 12 sealed blind *slots*** — envelope,
manifest digest and allowlisted sidecar — and nothing else about the blind third. That division is
settled, not an open Founder question.

**PRD §43.4:** *"Agents may not 'fix' a failing gold case by changing expected output without a
versioned founder-approved reason."*

**Requirement.** `EVAL-001`: 360/120/120 with a passing split-integrity test; this ticket contributes
exactly 36/12/12.

**What is already decided elsewhere and must not be re-decided here.** `GOLD-01` owns the schema, ids
(`EVAL-ADJ-###`), stratification schema, seal and checker. `SADJ-01` … `SADJ-09` own their adapters and
`evaluation_subset_ref` ids (PRD §40.8 item 11). `GOLD-10` owns WHS/OHS and workers compensation from the
**same** nine adapters; the boundary is deliverable 10.

**Sub-PRD decisions carried forward:** **D1**–**D3**, **D5**, **D6**, **D7**, **D8**, **D18**.

**Accepted caveats carried forward:**

- **A pinned evaluation CorpusRelease may not exist yet** (sub-PRD **Q-GOLD-D**).
- **`GOLD-10` and this ticket share all nine source blockers** and run in the same wave; the categories
  are disjoint by directory and by documented regime boundary.
- **Long-service leave appears in two categories by PRD design.** `GOLD-09` covers the general state LSL
  entitlement as state employment law; **this** category covers **portable** LSL schemes and their
  registration/levy obligations. The boundary is documented in both READMEs.

## Goal

Author the `adjacent-regimes` evaluation category: exactly **60** cases — 36 development, 12 validation
(plaintext) and 12 blind (sealed) — covering all eight adjacent regimes with ≥ 6 primary cases each and
≥ 5 primary cases for each state/territory (≥ 3 development, ≥ 1 validation, ≥ 1 blind), grounded in
immutable `ADJ-*` corpus ids across the PRD §6.6 three financial years, plus the category's
`stratification.yaml` and dataset-version registration. Completion is mechanically checkable:
`verify --category adjacent-regimes` passes with counts exactly 36/12/12, the regime and jurisdiction
floors met, no cross-split or cross-category duplication, every blind slot sealed with a matching digest
and allowlisted sidecar, and every `evaluation_subset_ref` id the nine adapters name for this category
existing here.

## Non-goals

- **No other category's cases** — WHS/OHS and workers compensation are `GOLD-10`; state employment and
  general LSL entitlement are `GOLD-09`; federal Fair Work material is `GOLD-05`.
- **No schema, id rules, seal or checker** — `GOLD-01` (merged; blocker).
- **No metrics, thresholds, gates, judge or reports** — `GOLD-02`, `GOLD-03`, `GOLD-04`, `GOLD-17`.
- **No adapter, registry decomposition or licence assessment** — `SADJ-01` … `SADJ-09` (merged;
  blockers), `INGF-04`, `INGF-07`.
- **No PII-refusal behaviour cases** — `GOLD-14` owns the PII/evasion/out-of-scope category. Cases here
  are ordinary legal questions about regimes that *concern* privacy; they never contain blocked input.
- **No blind gold plaintext anywhere** — PRD §14.3, §45.1 item 6.
- **No blind case authoring, review or decryption** — plan §8 **Q6** (confirmed) puts authoring with the
  `evaluation-author` agents outside this repository, per-case review with the independent
  `evaluation-reviewer` agent, and opening with the Founder alone. This ticket delivers sealed slots.
- **No product fix**: a defect routes to the owning module's ticket (PRD §43.4).

## File-scope (write-owns)

Owned by this ticket:

- `evals/cases/adjacent-regimes/**` — `stratification.yaml`, `development/*.yaml`, `validation/*.yaml`,
  `blind/*.sidecar.yaml`, `manifest.yaml`, `README.md`
- `evals/gold/adjacent-regimes/**` — `development/*.yaml`, `validation/*.yaml`, `blind/*.sealed`,
  `blind/manifest.json`

Does not touch:

- The other nine category directories — in particular `evals/{cases,gold}/whs-compensation/**`, which is
  `GOLD-10`'s and shares this ticket's blockers.
- `evals/splits/**`, `schemas/evaluation/**`, `pipelines/evaluation/**` — `GOLD-01` … `GOLD-04`,
  `GOLD-15`, `GOLD-16`. Dataset-version entries are created **through `GOLD-01`'s CLI**.
- `evals/reports/**` — `GOLD-03`; `evals/reports/release-candidate/**` — `GOLD-17`.
- `pipelines/**`, `apps/**`, `packages/**`, `services/**`, `infra/**`, `tests/**` — other modules per
  plan §4. `docs/PRD.md`, `.claude/**` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). The two directories are named after this category and are written by no other ticket (plan
§5.22). Its most contentious neighbour is `GOLD-10`, which has the **same nine blockers** and runs in the
same wave — safe because the directories are disjoint and no central split index exists (sub-PRD
**D4**); PRD §44.3 names *"individual evaluation categories"* as the safe unit for exactly this shape.
All ten declared blockers land first: `GOLD-01` (module wave 1) and the nine `09-sources-adjacent`
adapters. No shared append-only file.

## Deliverables

1. **`stratification.yaml`** — counts `36/12/12`; **regime floor**: ≥ 6 primary cases for each of
   `discrimination`, `privacy_surveillance`, `labour_hire`, `portable_lsl`, `migration_right_to_work`,
   `child_employment`, `public_sector`, `whistleblowing`; **jurisdiction floor**: ≥ 5 primary cases for
   each of `NSW, VIC, QLD, WA, SA, TAS, ACT, NT` with ≥ 3 development, ≥ 1 validation and ≥ 1 blind, and
   ≥ 20 Commonwealth-level cases; surface floors `ASK ≥ 25`, `SEARCH ≥ 3`; status floors
   `SUPPORTED ≥ 2`, `CONDITIONAL ≥ 2` per split. The file records the **Q-GOLD-C** rule as data, so the
   PRD's ambiguity is resolved in one visible place rather than in nine case files.
2. **36 development cases** in `development/`, ids `EVAL-ADJ-###`, all PRD §14.1/§43.2 fields present.
   Subject coverage per regime: protected attributes, exceptions and the discrimination complaint path;
   workplace surveillance notice/consent obligations and employment-related privacy duties; labour-hire
   licensing obligations for providers and hosts; portable LSL scheme registration, levies and
   entitlement; employment-related migration and right-to-work checks; child-employment permits and
   hours; public-sector employment codes and merit obligations; whistleblowing disclosure protections and
   who qualifies.
3. **12 validation cases** in `validation/` — independent of development; no shared scenario or
   paraphrase across splits.
4. **Trap coverage.** At least:
   - **specific displaces general** (PRD §9.1): a case where an adjacent statute governs and a general
     employment answer would be wrong; `prohibited_claims` names the general-law conclusion;
   - **jurisdiction trap**: near-identical regimes across states where only one jurisdiction's Act
     applies (PRD §36.2, §14.2);
   - **federal/state overlap**: a discrimination or privacy question where both Commonwealth and state
     schemes could apply and the answer must present both rather than silently pick one;
   - **regulator guidance vs Act** (PRD §6.1, §9.1): guidance that cannot establish the obligation;
   - **portable LSL vs general LSL**: a case that turns on which scheme applies (the `GOLD-09` boundary
     made testable);
   - **commencement-in-window**: an adjacent regime amended or commenced within the PRD §6.6 three years.
5. **Gold authorities** — immutable `ADJ-*` corpus ids for the operative provision of the governing
   regime, with `required: true` on what recall@10 must find, both schemes cited where the federal/state
   overlap case requires it, and pinpoint offsets wherever the answer turns on specific text (PRD §15.3).
6. **12 blind slots, sealed** — envelopes + `blind/manifest.json` + allowlisted sidecars, sealed with the
   committed public key only; plaintext working directory git-ignored and never committed, pasted or
   summarised. The plaintext itself is authored outside this repository by the `evaluation-author`
   agents and checked by the independent `evaluation-reviewer` agent before encryption (PRD §14.3,
   §45.1 item 6; plan §8 **Q6**, confirmed); this ticket's obligation is that the slots exist, are
   sealed, are counted and are stratified.
7. **`manifest.yaml`** — primary category, code `ADJ`, counts, per-regime and per-jurisdiction
   distribution, pinned `corpus_release_id`, `dataset_version`, satisfied `evaluation_subset_ref` ids.
8. **Adapter reciprocity** — every `ADJ`-range id declared in
   `pipelines/adapters/adj-{cth,nsw,vic,qld,wa,sa,tas,act,nt}/registry.yaml` exists here; an id naming
   `WHS` (i.e. `GOLD-10`'s range) is reported for `GOLD-16`, never created here (PRD §40.8 item 11).
9. **Dataset registration** — all 60 cases registered through `GOLD-01`'s CLI with hashes/digests,
   `change_reason` and `approved_by` (PRD §14.3, §43.4).
10. **`README.md`** — scope, per-regime and per-jurisdiction distribution, the **explicit boundaries with
    `GOLD-10`** (WHS/workers compensation) **and `GOLD-09`** (general LSL vs portable LSL), the
    **Q-GOLD-C** rule and why it differs from the strict eight-per-jurisdiction reading, authoring
    conventions (invented parties; no real complainant, discloser or personal detail — sub-PRD **D18**,
    PRD §10.1) and the blind-material statement.

## Acceptance checklist (classified)

- [ ] `[machine]` **Counts are exactly 36 / 12 / 12 = 60**, matching PRD §43.1 row 7. (`EVAL-001`)
- [ ] `[machine]` **Regime floor met**: ≥ 6 primary cases for each of the eight regimes named in the PRD
      row. (PRD §43.1; §6.2; §6.3)
- [ ] `[machine]` **Jurisdiction floor met**: ≥ 5 primary cases per state/territory with ≥ 3 development,
      ≥ 1 validation and ≥ 1 blind, plus ≥ 20 Commonwealth-level cases — the **Q-GOLD-C** rule, encoded in
      `stratification.yaml`. (PRD §43.1; sub-PRD Q-GOLD-C)
- [ ] `[machine]` **Every case validates** against `GOLD-01`'s schema with all PRD §14.1 fields present.
      (PRD §14.1, §43.2)
- [ ] `[machine]` **No overlap**: no id in two splits; no near-duplicate across splits; ids contiguous in
      `EVAL-ADJ-###`; **and no scenario collides with `whs-compensation` or `state-employment`**.
      (PRD §30.2 `EVAL-001`; §43.1 "one primary allocation")
- [ ] `[machine]` **Specific-displaces-general trap encoded**: at least one case per regime whose
      `prohibited_claims` names the general-employment-law conclusion. (PRD §9.1)
- [ ] `[machine]` **Federal/state overlap encoded**: at least one case whose gold requires both schemes to
      be presented rather than one silently chosen. (PRD §6.2, §6.3, §9.1)
- [ ] `[machine]` **Gold shape and pinpoints**: ≥ 1 `required: true` authority per case; pinpoint offsets
      where the answer turns on specific text. (PRD §43.2, §15.3)
- [ ] `[machine]` **Gold resolves against the pinned release** when supplied; `UNRESOLVED` and non-zero
      exit otherwise. (PRD §43.2, §40.9; sub-PRD D7)
- [ ] `[machine]` **Blind integrity without decryption**: 12 envelopes, 12 sidecars, digests match,
      allowlisted fields only, no plaintext found by `guard-blind`. (PRD §14.3, §43.1)
- [ ] `[machine]` **No key needed to deliver**: only the committed public key is used; no private key and
      no blind plaintext in the diff or history. (PRD §45.1 item 6)
- [ ] `[machine]` **Adapter reciprocity**: every `EVAL-ADJ-###` id named by the nine adjacent adapters
      exists here. (PRD §40.8 item 11)
- [ ] `[machine]` **Synthetic only, and especially here**: invented complainants, disclosers, workers and
      employers; no real name, contact detail, health or complaint record. (PRD §14.1; §10.1; sub-PRD
      D18)
- [ ] `[machine]` **Registered dataset version** for all 60 cases with hashes, reason and approver.
      (PRD §14.3; §43.4)
- [ ] `[machine]` `uv run pytest` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm test` green — unaffected. `cargo test --workspace` unaffected. (PRD §45.3)
- [ ] `[human]` **Case-quality review**: a founder/reviewer confirms each regime's cases reflect the
      actual statutory scheme and complaint path, that the federal/state overlap cases are legally
      honest, and that no scenario reads as a real person's matter. Plan §1.1 maps case-quality judgement
      to `[human]`. (PRD §43.4; §10.1)
- [ ] `[human]` **Founder confirms the Q-GOLD-C rule** recorded in `stratification.yaml` and the sub-PRD
      — this is the ticket where PRD §43.1's per-jurisdiction sentence is interpreted, and the
      interpretation is the Founder's to accept. (PRD §43.1; §45.5)
- [ ] `[human]` **Blind third**: the Founder confirms the 12 sealed slots were produced under plan §8
      **Q6**'s confirmed path — `evaluation-author` agents outside this repository, independent
      `evaluation-reviewer` check against official sources before encryption — and applies the
      risk-based spot check where this category is sampled (typically 12–20 across the whole 120
      blind cases). Recorded in the ADR `GOLD-01` authors. (PRD §14.3; plan §8 **Q6**)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs (**EVAL-001**), user-visible change and
      non-goals, schema compatibility impact (data only), **tenant/PII/security impact** (synthetic
      parties; no personal detail even in discrimination/whistleblowing scenarios; blind sealed),
      source/licence impact (regulator material cited by node and offset), cost/latency impact (adds 60
      cases), rollback path (dataset version), known gaps (**Q-GOLD-C**).

Absent classes: no `[fixture]` criteria — no recorded evaluation run exists to replay at this point in
the DAG (`GOLD-02` is not a blocker); the first replay is `GOLD-17`'s.

## Test plan

Every `[machine]` step runs offline and **without the blind seal key**.

1. **Verify the category.** `uv run python -m evaluation.dataset verify --category adjacent-regimes
   --format json`.
2. **Counts and floors.** Assert 36/12/12/60, ≥ 6 per regime, ≥ 5 per state/territory with the per-split
   floors, ≥ 20 Commonwealth cases.
3. **Read the plaintext cases.** Spot-check one case per regime; confirm the governing statute is the
   adjacent one and that a general employment answer would be wrong.
4. **Verify the blind third without reading it.** `guard-blind` → 12 envelopes, 12 sidecars, digests
   match, allowlisted fields only. **Do not request or accept a plaintext copy** (PRD §14.3, §45.1
   item 6).
5. **Cross-category duplication.** Run the checker across `adjacent-regimes`, `whs-compensation` and
   `state-employment` together and confirm `NO_NEAR_DUPLICATES` passes.
6. **Q-GOLD-C rule.** Read `stratification.yaml` and confirm the jurisdiction rule is stated as data and
   matches the sub-PRD's recorded interpretation — this is the one place PRD §43.1's ambiguity is
   resolved.
7. **PII scan.** Run the checker's synthetic-content scan and independently grep for names paired with
   contact details, health information or complaint identifiers — none.
8. **Overlap, gold resolution, version registry** — from the checker's output; on a scratch copy corrupt
   one `node_id` and one case's content to confirm `GOLD_RESOLVES` and `VERSIONED_CORRECTIONS` fail.
9. **Suite.** `uv run pytest` from the repository root.
10. **Reviewer focus.** Confirm the validation set is independent of development; confirm the
    `GOLD-09`/`GOLD-10` boundaries hold; confirm no case would require the product to give
    complaint-handling advice rather than cite law; confirm nothing in the diff, PR body or commit
    messages contains blind content.

## Feedback obligation

1. **General rule.** If authoring falsifies this ticket, update **this ticket** (docs PR → merge →
   `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/21-evaluation-600/README.md` (version +0.1 with a changelog line) **before** changing data.
   Later changes to delivered cases are **versioned dataset corrections** (PRD §14.3).
2. **Foreseeable frictions, each with its exact writeback target:**
   - *The Q-GOLD-C rule proves wrong* — for example the Founder reads PRD §43.1 as requiring eight per
     jurisdiction here too → record the decision in `docs/prd/21-evaluation-600/README.md`
     **Q-GOLD-C**, change `stratification.yaml`, and if the totals cannot then hold, escalate: PRD
     §43.1's 60 is exact, so the reconciliation is a **PRD** question under §45.5, not a local edit.
   - *A regime has no usable corpus material in a jurisdiction* → record it, raise it with the owning
     `SADJ-*` ticket, and route it to `GOLD-16` as a **coverage** finding under PRD §7/§44.4. Do not
     silently drop a regime: PRD §43.1 names all eight.
   - *A scenario overlaps with `GOLD-10` or `GOLD-09`* → resolve by the documented boundary; if the
     boundary is unclear, amend the affected category READMEs in one docs PR and record it in the
     sub-PRD.
   - *A provision is renumbered and gold stops resolving* → create a **formal dataset migration** through
     `GOLD-01`'s `migrate` command (PRD §43.2, §15.3).
   - *An `evaluation_subset_ref` id belongs to `whs-compensation`* → report to `GOLD-16`; raise a docs PR
     against the owning `SADJ-*` ticket.
3. **Falsified protocol.** **If any part of this work appears to require reading, writing, quoting or
   summarising blind case content or gold answers in ordinary context, the task is wrong** — that
   overturns PRD §14.3 and §45.1 item 6. Stop, escalate to the Founder (plan §8 **Q6**), and write back
   to `docs/prd/21-evaluation-600/README.md` and `docs/prd/breakdown-plan.md` **R9**. Equally: **no real
   person's discrimination, health or whistleblowing matter may ever be used as a case**, even
   paraphrased — PRD §10.1 and §14.1 (*"synthetic"*) are absolute here.
