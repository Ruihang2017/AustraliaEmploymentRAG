---
id: GOLD-07
title: "Cases: enterprise agreements and lifecycle (70)"
module: 21-evaluation-600
lane: 21-evaluation-600
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [GOLD-01, SINS-04]
blocks: [GOLD-17]
---

# GOLD-07 — Cases: enterprise agreements and lifecycle (70)

Implements PRD §43.1 (row 3), §8.5 and §14.1 — requirement **EVAL-001**, exercising **COV-003**; epic
`E31-EVAL-600`.
No ADR — the decision is already made in PRD §43.1 (the category and its 42/14/14 allocation) and PRD
§6.2/§8.5 (the agreement lifecycle these cases must probe); this is build ticket 7 of 17 against it.
Parent sub-PRD: [21-evaluation-600 README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [GOLD-01 — Case schema, splits, integrity and blind protection](GOLD-01-case-schema-splits-integrity-and-blind-protection.md), [SINS-04 — `FWC-AGREEMENTS` agreement lifecycle](../../07-sources-instruments/tickets/SINS-04-fwc-agreements-agreement-lifecycle.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
the category, its counts and the lifecycle rules the traps must probe are already fixed by the PRD;
this authors the data against `GOLD-01`'s schema and checker.

## Background + basis

**PRD §43.1, this ticket's row, transcribed verbatim:**

| Primary category | Development | Validation | Blind | Total |
|---|---:|---:|---:|---:|
| Enterprise agreements and lifecycle | **42** | **14** | **14** | **70** |

**PRD §14.1, the required per-case fields, quoted verbatim:**

> Each case SHOULD include **scenario, question, legal date, jurisdictions, expected answer status,
> required facts, prohibited assumptions, trap types, gold DocumentVersion/NodeVersion authorities,
> required/optional/prohibited claims and expected citation roles.**

`GOLD-01` deliverable 1 makes these required (sub-PRD **D6**); PRD §43.2 adds the remaining schema
fields and *"Gold authorities use immutable corpus IDs for a named evaluation CorpusRelease."*

**PRD §6.2, the subject scope, quoted verbatim:** *"Enterprise agreements and their approval, variation,
replacement and termination chains."*

**PRD §6.6, the trap this category exists to protect, quoted verbatim:** *"**An enterprise agreement
MUST NOT be treated as ceased merely because its nominal expiry date has passed.**"*

**PRD §8.5 stages 2–3, quoted verbatim:** *"2. Employer/ABN enterprise-agreement candidates. 3. Agreement
approval, variation, replacement, termination and coverage."* — and the requirement it carries,
`COV-003` (PRD §30.2): *"Agreement search supports employer name and validated ABN … **Known synthetic
ABN fixture returns linked candidates**."* PRD §41.2 `UAT-COV-02`: *"Known synthetic employer/ABN has
agreement chain → Agreement candidates show approval, variation/replacement/termination evidence."*

**PRD §14.3, binding on the blind third:** *"**Blind gold answers MUST remain outside ordinary
coding-agent context.**"* This ticket authors **42 development + 14 validation** cases in plaintext and
delivers its **14 blind slots** through `GOLD-01`'s sealed channel — sealing requires only the
committed public key, so the slots exist without any Builder holding the key that opens them.

**Plan §8 Q6 (confirmed) — the division of labour for the blind third.** Blind case content and gold
answers are authored by dedicated `evaluation-author` agents in an isolated session/workspace
**outside this repository**, and are checked by an independent `evaluation-reviewer` agent against
official sources before encryption; no lawyer or employed domain expert is engaged, and the Founder
performs a risk-based spot check of typically 12–20 of the 120 blind cases across all ten categories.
Blind plaintext never enters this ticket's scope: it is never committed to git, copied into ordinary
fixtures, pasted into an implementation agent's session, or exposed to ordinary CI. **This ticket
delivers the visible development and validation cases and the 14 sealed blind *slots*** — envelope,
manifest digest and allowlisted sidecar — and nothing else about the blind third. That division is
settled, not an open Founder question.

**PRD §43.4:** *"Agents may not 'fix' a failing gold case by changing expected output without a
versioned founder-approved reason."*

**Requirement.** `EVAL-001`: 360/120/120 with a passing split-integrity test; this ticket contributes
exactly 42/14/14.

**What is already decided elsewhere and must not be re-decided here.** `GOLD-01` owns the schema, ids
(`EVAL-AGR-###`), stratification schema, seal and checker. `SINS-04` owns the `FWC-AGREEMENTS` adapter,
its lifecycle evidence model and its `evaluation_subset_ref` ids (PRD §40.8 item 11). `ASK-08` owns the
Coverage workflow. `SINS-02` owns FWC decision documents that evidence approval/termination.

**Sub-PRD decisions carried forward:** **D1**–**D3**, **D5**, **D6**, **D7**, **D8**, **D18** (invented
employers and ABNs — the ABNs must be checksum-valid but fictitious, because `COV-003`'s behaviour
depends on a valid checksum and PRD §10.1 permits public business identifiers).

**Accepted caveats carried forward:**

- **A pinned evaluation CorpusRelease may not exist yet** (sub-PRD **Q-GOLD-D**).
- **Agreement realism is a human judgement**; the checker proves structure, not legal plausibility
  (PRD §43.4).

## Goal

Author the `agreements` evaluation category: exactly **70** cases — 42 development, 14 validation
(plaintext) and 14 blind (sealed) — grounded in `FWC-AGREEMENTS` corpus ids across approval →
variation → replacement → termination chains, including the PRD §6.6 nominal-expiry trap and the
`COV-003` employer/ABN candidate path, with the category's `stratification.yaml` and dataset-version
registration. Completion is mechanically checkable: `verify --category agreements` passes with counts
exactly 42/14/14, no cross-split overlap, all declared floors met, every blind slot sealed with a
matching digest and allowlisted sidecar, and every `evaluation_subset_ref` id `fwc-agreements` names
existing here.

## Non-goals

- **No other category's cases** — `GOLD-05`, `GOLD-06`, `GOLD-08` … `GOLD-14`. Award coverage belongs to
  `GOLD-06`; only the *agreement-displaces-award* interaction appears here, tagged not duplicated.
- **No schema, id rules, seal or checker** — `GOLD-01` (merged; blocker).
- **No metrics, thresholds, gates, judge or reports** — `GOLD-02`, `GOLD-03`, `GOLD-04`, `GOLD-17`.
- **No agreement lifecycle model, adapter or registry row** — `SINS-04` (merged; blocker), `SINS-02`,
  `INGF-07`.
- **No Coverage workflow implementation or ABN validation logic** — `15-answer-product` (`ASK-08`) and
  `14-search-product`. These cases measure that behaviour.
- **No blind gold plaintext anywhere** — PRD §14.3, §45.1 item 6.
- **No blind case authoring, review or decryption** — plan §8 **Q6** (confirmed) puts authoring with the
  `evaluation-author` agents outside this repository, per-case review with the independent
  `evaluation-reviewer` agent, and opening with the Founder alone. This ticket delivers sealed slots.
- **No product fix**: a defect routes to the owning module's ticket (PRD §43.4).

## File-scope (write-owns)

Owned by this ticket:

- `evals/cases/agreements/**` — `stratification.yaml`, `development/*.yaml`, `validation/*.yaml`,
  `blind/*.sidecar.yaml`, `manifest.yaml`, `README.md`
- `evals/gold/agreements/**` — `development/*.yaml`, `validation/*.yaml`, `blind/*.sealed`,
  `blind/manifest.json`

Does not touch:

- The other nine category directories — `GOLD-05`, `GOLD-06`, `GOLD-08` … `GOLD-14`.
- `evals/splits/**`, `schemas/evaluation/**`, `pipelines/evaluation/**` — `GOLD-01` … `GOLD-04`,
  `GOLD-15`, `GOLD-16`. Dataset-version entries are created **through `GOLD-01`'s CLI**.
- `evals/reports/**` — `GOLD-03`; `evals/reports/release-candidate/**` — `GOLD-17`.
- `pipelines/**`, `apps/**`, `packages/**`, `services/**`, `infra/**`, `tests/**` — other modules per
  plan §4. `docs/PRD.md`, `.claude/**` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). The two directories are named after this category and written by no other ticket (plan §5.22);
the nine concurrent authoring siblings own differently-named directories — PRD §44.3's *"individual
evaluation categories"* — and no central split index exists (sub-PRD **D4**). Both declared blockers land
first: `GOLD-01` (module wave 1) and `SINS-04` (`07-sources-instruments`, after `SINS-02`). No shared
append-only file.

## Deliverables

1. **`stratification.yaml`** — counts `42/14/14`; surface floors `COVERAGE ≥ 8`, `ASK ≥ 25`,
   `SEARCH ≥ 3`; status floors `SUPPORTED ≥ 2`, `CONDITIONAL ≥ 2` per split; lifecycle-stage floors — at
   least 6 cases each for approval, variation, replacement and termination; ≥ 4 cases keyed on
   employer/ABN candidate lookup (`COV-003`); financial-year spread across PRD §6.6's three years.
2. **42 development cases** in `development/`, ids `EVAL-AGR-###`, all PRD §14.1/§43.2 fields present.
   Subject coverage: agreement coverage and application to a described employee, approval decisions and
   undertakings, variations and their effective dates, replacement agreements and the transition between
   them, termination (including termination after nominal expiry), interaction with the NES and the
   better-off-overall context as evidenced by official material, and the agreement→award displacement
   question.
3. **14 validation cases** in `validation/` — independent of development; no shared scenario or
   paraphrase.
4. **Trap coverage.** At least:
   - **nominal expiry ≠ ceased** (PRD §6.6): an agreement past its nominal expiry that remains
     operative; `prohibited_claims` names the "expired therefore no longer applies" conclusion;
   - **replacement chain**: the answer depends on which agreement applies at `legal_as_at`, with the
     superseded one still cited as background;
   - **termination with a date**: a terminated agreement whose termination takes effect after the
     requested date;
   - **variation timing**: identical facts at two dates give different outcomes;
   - **employer/ABN lookup** (`COV-003`, `UAT-COV-02`): a synthetic but checksum-valid ABN whose
     candidate chain must show approval/variation/replacement/termination evidence;
   - **agreement not applicable** (PRD §8.5): a negative conclusion that requires pinpoint evidence and
     is otherwise prohibited.
5. **Gold authorities** — immutable corpus ids for the agreement `document_version_id`/`node_version_id`
   deciding each case, plus the FWC decision or lifecycle-event node that evidences approval, variation,
   replacement or termination (PRD §9.3: an assertion needs evidence). `required: true` marks what
   recall@10 must find; `required: false` marks additionally acceptable authorities; pinpoint offsets
   are mandatory for coverage clauses and lifecycle conclusions.
6. **14 blind slots, sealed** — envelopes + `blind/manifest.json` + allowlisted sidecars, sealed with the
   committed public key only; plaintext working directory git-ignored and never committed, pasted or
   summarised. The plaintext itself is authored outside this repository by the `evaluation-author`
   agents and checked by the independent `evaluation-reviewer` agent before encryption (PRD §14.3,
   §45.1 item 6; plan §8 **Q6**, confirmed); this ticket's obligation is that the slots exist, are
   sealed, are counted and are stratified.
7. **`manifest.yaml`** — primary category, code `AGR`, counts, pinned `corpus_release_id`,
   `dataset_version`, satisfied `evaluation_subset_ref` ids.
8. **Adapter reciprocity** — every `AGR`-range id declared in
   `pipelines/adapters/fwc-agreements/registry.yaml` exists here; an id naming another category is
   reported for `GOLD-16` (PRD §40.8 item 11).
9. **Dataset registration** — all 70 cases registered through `GOLD-01`'s CLI with hashes/digests,
   `change_reason` and `approved_by` (PRD §14.3, §43.4).
10. **`README.md`** — scope, trap inventory mapped to PRD §6.6 and `COV-003`, authoring conventions
    (invented employers, checksum-valid fictitious ABNs, no real PII — sub-PRD **D18**), and the
    blind-material statement.

## Acceptance checklist (classified)

- [ ] `[machine]` **Counts are exactly 42 / 14 / 14 = 70**, matching PRD §43.1 row 3. (`EVAL-001`)
- [ ] `[machine]` **Every case validates** against `GOLD-01`'s schema with all PRD §14.1 fields present.
      (PRD §14.1, §43.2)
- [ ] `[machine]` **No overlap**: no id in two splits; no near-duplicate across splits; ids contiguous in
      `EVAL-AGR-###`. (PRD §30.2 `EVAL-001`)
- [ ] `[machine]` **Lifecycle stratification holds**: ≥ 6 cases each for approval, variation, replacement
      and termination; ≥ 4 employer/ABN cases; declared surface and status floors met. (PRD §6.2, §8.5,
      §43.1)
- [ ] `[machine]` **Nominal-expiry trap present and encoded**: at least one case where the agreement is
      past nominal expiry and remains operative, with the "expired therefore inapplicable" conclusion in
      `prohibited_claims`. (PRD §6.6)
- [ ] `[machine]` **`COV-003` trap present**: a checksum-valid synthetic ABN whose expected result is a
      linked candidate chain with lifecycle evidence. (PRD §30.2 `COV-003`; §41.2 `UAT-COV-02`)
- [ ] `[machine]` **Gold shape and pinpoints**: ≥ 1 `required: true` authority per case; lifecycle
      conclusions carry an evidencing node and pinpoint offsets. (PRD §43.2, §9.3, §15.3)
- [ ] `[machine]` **Gold resolves against the pinned release** when supplied; `UNRESOLVED` and non-zero
      exit otherwise. (PRD §43.2, §40.9; sub-PRD D7)
- [ ] `[machine]` **Blind integrity without decryption**: 14 envelopes, 14 sidecars, digests match,
      allowlisted fields only, no plaintext found by `guard-blind`. (PRD §14.3, §43.1)
- [ ] `[machine]` **No key needed to deliver**: only the committed public key is used; no private key and
      no blind plaintext in the diff or history. (PRD §45.1 item 6)
- [ ] `[machine]` **Adapter reciprocity**: every `EVAL-AGR-###` id in
      `pipelines/adapters/fwc-agreements/registry.yaml` exists here. (PRD §40.8 item 11)
- [ ] `[machine]` **Synthetic only**: invented employers, fictitious but checksum-valid ABNs, no real
      person or contact data. (PRD §14.1; §10.1; sub-PRD D18)
- [ ] `[machine]` **Registered dataset version** for all 70 cases with hashes, reason and approver.
      (PRD §14.3; §43.4)
- [ ] `[machine]` `uv run pytest` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm test` green — unaffected. `cargo test --workspace` unaffected. (PRD §45.3)
- [ ] `[human]` **Case-quality review**: a founder/reviewer confirms the lifecycle chains are realistic
      and internally consistent, that the nominal-expiry and replacement traps are genuine, and that no
      case can be answered by keyword-matching "expired" or "terminated". Plan §1.1 maps case-quality
      judgement to `[human]`. (PRD §43.4; §6.6)
- [ ] `[human]` **Blind third**: the Founder confirms the 14 sealed slots were produced under plan §8
      **Q6**'s confirmed path — `evaluation-author` agents outside this repository, independent
      `evaluation-reviewer` check against official sources before encryption — and applies the
      risk-based spot check where this category is sampled (typically 12–20 across the whole 120
      blind cases). Recorded in the ADR `GOLD-01` authors. (PRD §14.3; plan §8 **Q6**)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs (**EVAL-001**; exercises **COV-003**),
      user-visible change and non-goals, schema compatibility impact (data only), tenant/PII/security
      impact (synthetic; blind sealed), **source/licence impact** (agreement documents may carry tighter
      licence limits — gold cites nodes and offsets, never bulk text), cost/latency impact (adds 70
      cases), rollback path (dataset version), known gaps.

Absent classes: no `[fixture]` criteria — no recorded evaluation run exists to replay at this point in
the DAG (`GOLD-02` is not a blocker); the first replay is `GOLD-17`'s.

## Test plan

Every `[machine]` step runs offline and **without the blind seal key**.

1. **Verify the category.** `uv run python -m evaluation.dataset verify --category agreements
   --format json`.
2. **Counts against the PRD.** 42 / 14 / 14 / 70, matching §43.1 row 3.
3. **Read the plaintext cases.** Spot-check ten development/validation cases; confirm each lifecycle
   stage floor is genuinely represented, not merely tagged.
4. **Verify the blind third without reading it.** `guard-blind` → 14 envelopes, 14 sidecars, digests
   match, allowlisted fields only. Confirm the `.sealed` files are opaque. **Do not request or accept a
   plaintext copy** (PRD §14.3, §45.1 item 6).
5. **Nominal-expiry and replacement traps.** Open both cases; confirm the prohibited conclusion is
   encoded and the gold cites the operative agreement at `legal_as_at`.
6. **ABN case.** Confirm the ABN passes checksum validation and is not a real registered entity in the
   category's invented list.
7. **Overlap, gold resolution, synthetic scan, version registry** — as in the checker's output; on a
   scratch copy corrupt one `node_id` and one case's content to confirm `GOLD_RESOLVES` and
   `VERSIONED_CORRECTIONS` fail.
8. **Suite.** `uv run pytest` from the repository root.
9. **Reviewer focus.** Confirm the validation set is independent of development; confirm every lifecycle
   conclusion is evidenced rather than asserted (PRD §9.3); confirm nothing in the diff, PR body or
   commit messages contains blind content.

## Feedback obligation

1. **General rule.** If authoring falsifies this ticket, update **this ticket** (docs PR → merge →
   `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/21-evaluation-600/README.md` (version +0.1 with a changelog line) **before** changing data.
   Later changes to delivered cases are **versioned dataset corrections** (PRD §14.3).
2. **Foreseeable frictions, each with its exact writeback target:**
   - *Agreement material is licence-restricted so gold cannot quote what a case needs* → keep the case,
     record the limitation in the case's `preconditions` and in
     `docs/prd/21-evaluation-600/README.md`, and route the licence question to `INGF-04`/`SINS-04`. PRD
     §11.1's conservative default stands; never bypass a licence limit to make a case scorable.
   - *An agreement is terminated or replaced after authoring and gold stops resolving* → create a
     **formal dataset migration** through `GOLD-01`'s `migrate` command (PRD §43.2). This is the most
     likely migration in the whole dataset — agreements change more often than legislation.
   - *The product treats a nominally expired agreement as ceased* → that is the defect this category
     exists to catch. Classify under PRD §43.4 and route to `ASK-08`/`SINS-04`; **never** change the
     expected output (PRD §6.6 is explicit).
   - *A lifecycle stage cannot reach its floor from available corpus material* → adjust the floor in
     `stratification.yaml`, record it in the README, and raise the coverage gap with `GOLD-16` — never
     drop the stage.
   - *An `evaluation_subset_ref` id belongs elsewhere* → report to `GOLD-16`; raise a docs PR against
     `SINS-04`.
3. **Falsified protocol.** **If any part of this work appears to require reading, writing, quoting or
   summarising blind case content or gold answers in ordinary context, the task is wrong** — that
   overturns PRD §14.3 and §45.1 item 6. Stop, escalate to the Founder (plan §8 **Q6**), and write back
   to `docs/prd/21-evaluation-600/README.md` and `docs/prd/breakdown-plan.md` **R9**. A change to the
   42/14/14 allocation is a **PRD** change under §45.5 requiring Founder approval.
