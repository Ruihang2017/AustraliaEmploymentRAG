---
id: GOLD-10
title: "Cases: WHS/OHS and workers compensation (64)"
module: 21-evaluation-600
lane: 21-evaluation-600
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [GOLD-01, SADJ-01, SADJ-02, SADJ-03, SADJ-04, SADJ-05, SADJ-06, SADJ-07, SADJ-08, SADJ-09]
blocks: [GOLD-17]
---

# GOLD-10 — Cases: WHS/OHS and workers compensation (64)

Implements PRD §43.1 (row 6), §6.3 and §14.1 — requirement **EVAL-001**; epic `E31-EVAL-600`.
No ADR — the decision is already made in PRD §43.1 (the category and its 38/13/13 allocation) and PRD
§6.3 (WHS/OHS and workers compensation for all eight jurisdictions); this is build ticket 10 of 17
against it.
Parent sub-PRD: [21-evaluation-600 README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [GOLD-01 — Case schema, splits, integrity and blind protection](GOLD-01-case-schema-splits-integrity-and-blind-protection.md) and the nine employment-adjacent groups [SADJ-01 `ADJ-CTH`](../../09-sources-adjacent/tickets/SADJ-01-adj-cth.md), [SADJ-02 `ADJ-NSW`](../../09-sources-adjacent/tickets/SADJ-02-adj-nsw.md), [SADJ-03 `ADJ-VIC`](../../09-sources-adjacent/tickets/SADJ-03-adj-vic.md), [SADJ-04 `ADJ-QLD`](../../09-sources-adjacent/tickets/SADJ-04-adj-qld.md), [SADJ-05 `ADJ-WA`](../../09-sources-adjacent/tickets/SADJ-05-adj-wa.md), [SADJ-06 `ADJ-SA`](../../09-sources-adjacent/tickets/SADJ-06-adj-sa.md), [SADJ-07 `ADJ-TAS`](../../09-sources-adjacent/tickets/SADJ-07-adj-tas.md), [SADJ-08 `ADJ-ACT`](../../09-sources-adjacent/tickets/SADJ-08-adj-act.md), [SADJ-09 `ADJ-NT`](../../09-sources-adjacent/tickets/SADJ-09-adj-nt.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
the category, its counts and the eight-jurisdiction coverage rule are already fixed by the PRD; this
authors the data against `GOLD-01`'s schema and checker.

## Background + basis

**PRD §43.1, this ticket's row, transcribed verbatim:**

| Primary category | Development | Validation | Blind | Total |
|---|---:|---:|---:|---:|
| WHS/OHS and workers compensation (eight jurisdictions) | **38** | **13** | **13** | **64** |

> **At least eight primary cases in each applicable nationwide category must cover each
> state/territory.**

64 = 8 × 8: **eight primary cases per state/territory**, exactly. Commonwealth WHS and Comcare material
appears as a **cross-tag** on state cases rather than as primary cases, because PRD §43.1's totals are
exact and leave no primary slot for it; the boundary is documented in the category README.

**PRD §14.1, the required per-case fields, quoted verbatim:**

> Each case SHOULD include **scenario, question, legal date, jurisdictions, expected answer status,
> required facts, prohibited assumptions, trap types, gold DocumentVersion/NodeVersion authorities,
> required/optional/prohibited claims and expected citation roles.**

`GOLD-01` deliverable 1 makes these required (sub-PRD **D6**); PRD §43.2 adds the rest and *"Gold
authorities use immutable corpus IDs for a named evaluation CorpusRelease."*

**PRD §6.3, the subject scope, quoted verbatim** (for all eight jurisdictions): *"WHS/OHS; …
workers compensation; … relevant regulators, courts and tribunals."* PRD §6.1 adds the rule that shapes
which sources may decide a case: *"Official regulator summaries MAY supplement but MUST NOT replace
primary decisions or operative instruments."* Codes of practice and regulator guidance are therefore
subordinate to the WHS/OHS Act and regulations — and PRD §9.1 states it directly: *"Guidance MUST NOT
silently override legislation, an operative instrument or binding authority."*

**PRD §36.2 and §14.2:** the hard jurisdiction filter, and the gate *"Critical legal-date or
jurisdiction errors — 0"*. WHS is the category where near-identical model provisions across
jurisdictions make a jurisdiction slip both easy and dangerous: Victoria's OHS scheme differs from the
harmonised WHS scheme, and a case must be scored on the jurisdiction's own text.

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
(`EVAL-WHS-###`), stratification schema, seal and checker. `SADJ-01` … `SADJ-09` own their adapters,
their per-group registry decomposition and their `evaluation_subset_ref` ids (PRD §40.8 item 11).
`GOLD-11` owns the other adjacent regimes from the **same** nine adapters — the two categories share
blockers and must not share cases; the boundary is deliverable 10.

**Sub-PRD decisions carried forward:** **D1**–**D3**, **D5**, **D6**, **D7**, **D8**, **D18**.

**Accepted caveats carried forward:**

- **A pinned evaluation CorpusRelease may not exist yet** (sub-PRD **Q-GOLD-D**).
- **`GOLD-10` and `GOLD-11` are the module's only two categories with identical blockers.** They run
  concurrently and must not duplicate a scenario; `GOLD-01`'s `NO_NEAR_DUPLICATES` check runs across the
  whole dataset at `GOLD-17`, so a collision is detected — but it is cheaper to avoid it by respecting
  the documented boundary (WHS/OHS + workers compensation here; discrimination, privacy/surveillance,
  labour hire, LSL, migration, child/public-sector/whistleblowing there).

## Goal

Author the `whs-compensation` evaluation category: exactly **64** cases — 38 development, 13 validation
(plaintext) and 13 blind (sealed) — with **exactly 8 primary cases per state/territory** (≥ 4
development, ≥ 1 validation and ≥ 1 blind each), grounded in immutable `ADJ-*` corpus ids for WHS/OHS
duties, regulations, codes of practice and workers-compensation entitlements across the PRD §6.6 three
financial years, plus the category's `stratification.yaml` and dataset-version registration. Completion
is mechanically checkable: `verify --category whs-compensation` passes with counts exactly 38/13/13, the
eight-per-jurisdiction floor met, no cross-split overlap, every blind slot sealed with a matching digest
and allowlisted sidecar, and every `evaluation_subset_ref` id the nine adapters name for this category
existing here.

## Non-goals

- **No other category's cases** — discrimination, privacy/surveillance, labour hire, LSL, migration,
  child/public-sector/whistleblowing are `GOLD-11`; state employment/industrial law is `GOLD-09`;
  federal law is `GOLD-05`.
- **No schema, id rules, seal or checker** — `GOLD-01` (merged; blocker).
- **No metrics, thresholds, gates, judge or reports** — `GOLD-02`, `GOLD-03`, `GOLD-04`, `GOLD-17`.
- **No adapter, registry decomposition or licence assessment** — `SADJ-01` … `SADJ-09` (merged;
  blockers), `INGF-04`, `INGF-07`.
- **No safety advice product behaviour**: cases test legal-source retrieval and citation, not incident
  response guidance.
- **No blind gold plaintext anywhere** — PRD §14.3, §45.1 item 6.
- **No blind case authoring, review or decryption** — plan §8 **Q6** (confirmed) puts authoring with the
  `evaluation-author` agents outside this repository, per-case review with the independent
  `evaluation-reviewer` agent, and opening with the Founder alone. This ticket delivers sealed slots.
- **No product fix**: a defect routes to the owning module's ticket (PRD §43.4).

## File-scope (write-owns)

Owned by this ticket:

- `evals/cases/whs-compensation/**` — `stratification.yaml`, `development/*.yaml`, `validation/*.yaml`,
  `blind/*.sidecar.yaml`, `manifest.yaml`, `README.md`
- `evals/gold/whs-compensation/**` — `development/*.yaml`, `validation/*.yaml`, `blind/*.sealed`,
  `blind/manifest.json`

Does not touch:

- The other nine category directories — in particular `evals/{cases,gold}/adjacent-regimes/**`, which is
  `GOLD-11`'s and shares this ticket's blockers.
- `evals/splits/**`, `schemas/evaluation/**`, `pipelines/evaluation/**` — `GOLD-01` … `GOLD-04`,
  `GOLD-15`, `GOLD-16`. Dataset-version entries are created **through `GOLD-01`'s CLI**.
- `evals/reports/**` — `GOLD-03`; `evals/reports/release-candidate/**` — `GOLD-17`.
- `pipelines/**`, `apps/**`, `packages/**`, `services/**`, `infra/**`, `tests/**` — other modules per
  plan §4. `docs/PRD.md`, `.claude/**` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). The two directories are named after this category and are written by no other ticket (plan
§5.22). Its most contentious neighbour is `GOLD-11`, which has the **same nine blockers** and therefore
runs in the same wave — the two are safe because their directories are disjoint and no central split
index exists (sub-PRD **D4**); PRD §44.3 names *"individual evaluation categories"* as the safe unit
precisely for this shape. All ten declared blockers land first: `GOLD-01` (module wave 1) and the nine
`09-sources-adjacent` adapters. No shared append-only file.

## Deliverables

1. **`stratification.yaml`** — counts `38/13/13`; **per-jurisdiction floor**: exactly 8 primary cases for
   each of `NSW, VIC, QLD, WA, SA, TAS, ACT, NT`, each with ≥ 4 development, ≥ 1 validation and ≥ 1
   blind; **regime split**: ≥ 3 WHS/OHS and ≥ 3 workers-compensation cases per jurisdiction; surface
   floors `ASK ≥ 25`, `SEARCH ≥ 3`; status floors `SUPPORTED ≥ 2`, `CONDITIONAL ≥ 2` per split; ≥ 8
   cases whose answer changes across the PRD §6.6 financial years.
2. **38 development cases** in `development/`, ids `EVAL-WHS-###`, all PRD §14.1/§43.2 fields present.
   Subject coverage: primary duties of care and who holds them, consultation duties, incident
   notification thresholds, regulator powers and notices, codes of practice and their legal weight, and
   workers-compensation coverage, notification, weekly-payment and return-to-work provisions.
3. **13 validation cases** in `validation/` — independent of development; no shared scenario or
   paraphrase across splits.
4. **Trap coverage.** At least:
   - **harmonised-vs-non-harmonised** (PRD §36.2, §14.2): a Victorian OHS question whose plausible answer
     text comes from the harmonised WHS model, with the wrong-scheme conclusion in `prohibited_claims`;
   - **code of practice vs Act** (PRD §6.1, §9.1): a case where a code of practice is evidence of what is
     reasonably practicable but cannot be cited as the operative obligation; expected citation roles
     distinguish the two;
   - **duty holder identification**: facts where the duty holder is not the direct employer, producing
     `CONDITIONAL` when a decisive fact is unstated;
   - **workers-compensation scheme boundary**: an injury whose scheme depends on where the worker is
     based, cross-referenced with the jurisdiction trap;
   - **amended-in-window**: a provision or scheme rate amended within the PRD §6.6 three years;
   - **regulator guidance freshness**: a case whose regulator page is stale relative to the Act, where
     `SOURCE_NOT_CURRENT` is an acceptable status (PRD §36.8).
5. **Gold authorities** — immutable `ADJ-*` corpus ids for the operative provision, with `required: true`
   on what recall@10 must find, the code of practice (where relevant) at `citation_role` reflecting its
   subordinate role, and pinpoint offsets wherever the answer turns on specific text (PRD §15.3, §9.1).
6. **13 blind slots, sealed** — envelopes + `blind/manifest.json` + allowlisted sidecars, sealed with the
   committed public key only; plaintext working directory git-ignored and never committed, pasted or
   summarised. The plaintext itself is authored outside this repository by the `evaluation-author`
   agents and checked by the independent `evaluation-reviewer` agent before encryption (PRD §14.3,
   §45.1 item 6; plan §8 **Q6**, confirmed); this ticket's obligation is that the slots exist, are
   sealed, are counted and are stratified.
7. **`manifest.yaml`** — primary category, code `WHS`, counts, per-jurisdiction and per-regime
   distribution, pinned `corpus_release_id`, `dataset_version`, satisfied `evaluation_subset_ref` ids.
8. **Adapter reciprocity** — every `WHS`-range id declared in
   `pipelines/adapters/adj-{cth,nsw,vic,qld,wa,sa,tas,act,nt}/registry.yaml` exists here; an id naming
   `ADJ` (i.e. `GOLD-11`'s range) is reported for `GOLD-16`, never created here (PRD §40.8 item 11).
9. **Dataset registration** — all 64 cases registered through `GOLD-01`'s CLI with hashes/digests,
   `change_reason` and `approved_by` (PRD §14.3, §43.4).
10. **`README.md`** — scope, the per-jurisdiction/per-regime distribution table, the **explicit boundary
    with `GOLD-11`** (which regimes belong where, and that Commonwealth WHS/Comcare material is a
    cross-tag rather than a primary case), the trap inventory, authoring conventions (sub-PRD **D18**)
    and the blind-material statement.

## Acceptance checklist (classified)

- [ ] `[machine]` **Counts are exactly 38 / 13 / 13 = 64**, matching PRD §43.1 row 6. (`EVAL-001`)
- [ ] `[machine]` **Eight primary cases per state/territory**, each with ≥ 4 development, ≥ 1 validation
      and ≥ 1 blind, and ≥ 3 WHS/OHS plus ≥ 3 workers-compensation cases per jurisdiction. (PRD §43.1;
      §6.3)
- [ ] `[machine]` **Every case validates** against `GOLD-01`'s schema with all PRD §14.1 fields present.
      (PRD §14.1, §43.2)
- [ ] `[machine]` **No overlap**: no id in two splits; no near-duplicate across splits; ids contiguous in
      `EVAL-WHS-###`; **and no scenario collides with `adjacent-regimes`** (checked across categories).
      (PRD §30.2 `EVAL-001`)
- [ ] `[machine]` **Harmonised-vs-non-harmonised trap encoded**: at least one Victorian OHS case whose
      `prohibited_claims` names the harmonised-model conclusion. (PRD §36.2; §14.2)
- [ ] `[machine]` **Code-of-practice role encoded**: at least one case where the code carries a
      subordinate citation role and the operative duty is cited from the Act/regulation. (PRD §6.1, §9.1)
- [ ] `[machine]` **Gold shape and pinpoints**: ≥ 1 `required: true` authority per case; pinpoint offsets
      where the answer turns on specific text. (PRD §43.2, §15.3)
- [ ] `[machine]` **Gold resolves against the pinned release** when supplied; `UNRESOLVED` and non-zero
      exit otherwise. (PRD §43.2, §40.9; sub-PRD D7)
- [ ] `[machine]` **Blind integrity without decryption**: 13 envelopes, 13 sidecars, digests match,
      allowlisted fields only, no plaintext found by `guard-blind`. (PRD §14.3, §43.1)
- [ ] `[machine]` **No key needed to deliver**: only the committed public key is used; no private key and
      no blind plaintext in the diff or history. (PRD §45.1 item 6)
- [ ] `[machine]` **Adapter reciprocity**: every `EVAL-WHS-###` id named by the nine adjacent adapters
      exists here. (PRD §40.8 item 11)
- [ ] `[machine]` **Synthetic only**: invented workplaces and workers; no real person, contact, injury
      record or payroll identifier. (PRD §14.1; §10.1; sub-PRD D18)
- [ ] `[machine]` **Registered dataset version** for all 64 cases with hashes, reason and approver.
      (PRD §14.3; §43.4)
- [ ] `[machine]` `uv run pytest` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm test` green — unaffected. `cargo test --workspace` unaffected. (PRD §45.3)
- [ ] `[human]` **Case-quality review**: a founder/reviewer confirms the duties, thresholds and
      compensation entitlements match each jurisdiction's actual scheme, that the harmonised/Victorian
      distinction is handled correctly, and that codes of practice are never treated as operative
      obligations. Plan §1.1 maps case-quality judgement to `[human]`. (PRD §43.4; §6.1; §9.1)
- [ ] `[human]` **Blind third**: the Founder confirms the 13 sealed slots were produced under plan §8
      **Q6**'s confirmed path — `evaluation-author` agents outside this repository, independent
      `evaluation-reviewer` check against official sources before encryption — and applies the
      risk-based spot check where this category is sampled (typically 12–20 across the whole 120
      blind cases). Recorded in the ADR `GOLD-01` authors. (PRD §14.3; plan §8 **Q6**)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs (**EVAL-001**), user-visible change and
      non-goals, schema compatibility impact (data only), tenant/PII/security impact (synthetic; no
      injury or medical detail about a real person; blind sealed), source/licence impact (regulator
      material cited by node and offset), cost/latency impact (adds 64 cases), rollback path (dataset
      version), known gaps.

Absent classes: no `[fixture]` criteria — no recorded evaluation run exists to replay at this point in
the DAG (`GOLD-02` is not a blocker); the first replay is `GOLD-17`'s.

## Test plan

Every `[machine]` step runs offline and **without the blind seal key**.

1. **Verify the category.** `uv run python -m evaluation.dataset verify --category whs-compensation
   --format json`.
2. **Counts and distribution.** Assert 38/13/13/64, exactly 8 per jurisdiction, and the per-regime
   floors.
3. **Read the plaintext cases.** Spot-check one WHS and one workers-compensation case per jurisdiction;
   confirm each cites that jurisdiction's own Act/regulation.
4. **Verify the blind third without reading it.** `guard-blind` → 13 envelopes, 13 sidecars, digests
   match, allowlisted fields only. **Do not request or accept a plaintext copy** (PRD §14.3, §45.1
   item 6).
5. **Cross-category duplication.** Run the checker across `whs-compensation` and `adjacent-regimes`
   together and confirm `NO_NEAR_DUPLICATES` passes — the two categories share blockers and are the most
   likely place for a duplicated scenario.
6. **Scheme traps.** Confirm the Victorian OHS case and the code-of-practice case encode their prohibited
   conclusions and citation roles.
7. **Overlap, gold resolution, synthetic scan, version registry** — from the checker's output; on a
   scratch copy corrupt one `node_id` and one case's content to confirm `GOLD_RESOLVES` and
   `VERSIONED_CORRECTIONS` fail.
8. **Suite.** `uv run pytest` from the repository root.
9. **Reviewer focus.** Confirm the validation set is independent of development; confirm no case treats a
   code of practice as the operative duty; confirm the `GOLD-11` boundary is respected; confirm nothing
   in the diff, PR body or commit messages contains blind content.

## Feedback obligation

1. **General rule.** If authoring falsifies this ticket, update **this ticket** (docs PR → merge →
   `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/21-evaluation-600/README.md` (version +0.1 with a changelog line) **before** changing data.
   Later changes to delivered cases are **versioned dataset corrections** (PRD §14.3).
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A jurisdiction's adjacent adapter has not indexed enough WHS or workers-compensation material for 8
     cases* → do not reduce the floor silently; record it in `docs/prd/21-evaluation-600/README.md`,
     raise it with the owning `SADJ-*` ticket and route it to `GOLD-16` as a **coverage** finding under
     PRD §7/§44.4.
   - *A scenario overlaps with `GOLD-11`* → resolve by the documented boundary (deliverable 10) and, if
     the boundary itself is unclear, amend **both** category READMEs in one docs PR and record it in the
     sub-PRD. Never leave two near-duplicate cases in different categories: PRD §43.1's "one primary
     allocation" rule exists so totals cannot drift.
   - *A regulator page is stale relative to the Act* → that is a legitimate `SOURCE_NOT_CURRENT` case
     (PRD §36.8), not a data defect. Encode it as such.
   - *A provision is renumbered and gold stops resolving* → create a **formal dataset migration** through
     `GOLD-01`'s `migrate` command (PRD §43.2, §15.3).
   - *An `evaluation_subset_ref` id belongs to `adjacent-regimes`* → report to `GOLD-16`; raise a docs PR
     against the owning `SADJ-*` ticket.
3. **Falsified protocol.** **If any part of this work appears to require reading, writing, quoting or
   summarising blind case content or gold answers in ordinary context, the task is wrong** — that
   overturns PRD §14.3 and §45.1 item 6. Stop, escalate to the Founder (plan §8 **Q6**), and write back
   to `docs/prd/21-evaluation-600/README.md` and `docs/prd/breakdown-plan.md` **R9**. A change to the
   38/13/13 allocation or the eight-per-jurisdiction floor is a **PRD** change under §45.5 requiring
   Founder approval.
