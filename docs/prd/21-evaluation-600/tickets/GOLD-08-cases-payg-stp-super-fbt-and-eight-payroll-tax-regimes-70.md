---
id: GOLD-08
title: "Cases: PAYG/STP/super/FBT and eight payroll-tax regimes (70)"
module: 21-evaluation-600
lane: 21-evaluation-600
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [GOLD-01, SINS-06, SINS-07, SINS-08, SINS-09, SINS-10, SINS-11, SINS-12, SINS-13, SINS-14]
blocks: [GOLD-17]
---

# GOLD-08 — Cases: PAYG/STP/super/FBT and eight payroll-tax regimes (70)

Implements PRD §43.1 (row 4), §40.3 and §14.1 — requirement **EVAL-001**; epic `E31-EVAL-600`.
No ADR — the decision is already made in PRD §43.1 (the category and its 42/14/14 allocation) and PRD
§40.3 (*"Rates are date-versioned legal facts, not mutable fields"*); this is build ticket 8 of 17
against it.
Parent sub-PRD: [21-evaluation-600 README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [GOLD-01 — Case schema, splits, integrity and blind protection](GOLD-01-case-schema-splits-integrity-and-blind-protection.md), [SINS-06 — `ATO-EMPLOYMENT`](../../07-sources-instruments/tickets/SINS-06-ato-employment.md), and the eight payroll-tax adapters [SINS-07 `PT-NSW`](../../07-sources-instruments/tickets/SINS-07-pt-nsw-payroll-tax.md), [SINS-08 `PT-VIC`](../../07-sources-instruments/tickets/SINS-08-pt-vic-payroll-tax.md), [SINS-09 `PT-QLD`](../../07-sources-instruments/tickets/SINS-09-pt-qld-payroll-tax.md), [SINS-10 `PT-WA`](../../07-sources-instruments/tickets/SINS-10-pt-wa-payroll-tax.md), [SINS-11 `PT-SA`](../../07-sources-instruments/tickets/SINS-11-pt-sa-payroll-tax.md), [SINS-12 `PT-TAS`](../../07-sources-instruments/tickets/SINS-12-pt-tas-payroll-tax.md), [SINS-13 `PT-ACT`](../../07-sources-instruments/tickets/SINS-13-pt-act-payroll-tax.md), [SINS-14 `PT-NT`](../../07-sources-instruments/tickets/SINS-14-pt-nt-payroll-tax.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
the category, its counts, its per-jurisdiction floor and the date-versioned rate rule are already fixed
by the PRD and the breakdown plan; this authors the data against `GOLD-01`'s schema and checker.

## Background + basis

**PRD §43.1, this ticket's row, transcribed verbatim:**

| Primary category | Development | Validation | Blind | Total |
|---|---:|---:|---:|---:|
| PAYG/STP/super/FBT and eight payroll-tax regimes | **42** | **14** | **14** | **70** |

> **At least eight primary cases in each applicable nationwide category must cover each
> state/territory**; cross-tags ensure every product surface and answer status is represented.

Breakdown plan §5.22 states this ticket's goal as *"42/14/14 with ≥8 primary cases per jurisdiction"* —
so the eight payroll-tax jurisdictions take 64 of the 70 primary cases and the remaining 6 are
Commonwealth PAYG/STP/super/FBT material.

**PRD §14.1, the required per-case fields, quoted verbatim:**

> Each case SHOULD include **scenario, question, legal date, jurisdictions, expected answer status,
> required facts, prohibited assumptions, trap types, gold DocumentVersion/NodeVersion authorities,
> required/optional/prohibited claims and expected citation roles.**

`GOLD-01` deliverable 1 makes these required (sub-PRD **D6**); PRD §43.2 adds the rest and *"Gold
authorities use immutable corpus IDs for a named evaluation CorpusRelease."*

**PRD §40.3, the rule this category exists to protect, quoted verbatim:**

> **Rates are date-versioned legal facts, not mutable fields. A displayed rate must cite its
> official date-specific source and applicable legislation/guidance role.**

**PRD §6.2 and §6.3, the subject scope:** *"PAYG, Single Touch Payroll, FBT, superannuation and Payday
Super materials relevant to employment/payroll"* (Commonwealth) and *"payroll tax legislation, rates and
official guidance"* for each of NSW, Victoria, Queensland, Western Australia, South Australia,
Tasmania, the ACT and the Northern Territory. PRD §6.6 requires point-in-time coverage of 2026–27,
2025–26 and 2024–25 — three financial years in which thresholds and rates changed.

**PRD §9.1, the authority rule these cases must probe:** *"Guidance MUST NOT silently override
legislation, an operative instrument or binding authority."* Revenue-office guidance is subordinate to
the payroll-tax Act, and a case whose answer depends on that ordering is a required trap.

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
(`EVAL-PAY-###`), stratification schema, seal and checker. `SINS-01` owns the date-versioned rate/
threshold fact model; `SINS-06` … `SINS-14` own their adapters and their `evaluation_subset_ref` ids
(PRD §40.8 item 11). This ticket cites their corpus nodes; it never models a rate.

**Sub-PRD decisions carried forward:** **D1**–**D3**, **D5**, **D6**, **D7**, **D8**, **D18**.

**Accepted caveats carried forward:**

- **A pinned evaluation CorpusRelease may not exist yet** (sub-PRD **Q-GOLD-D**).
- **Nine source adapters are blockers**, so this ticket starts only after all nine land; that is exactly
  why it can cite real per-jurisdiction corpus ids rather than placeholders.
- **Rate arithmetic is not the product's promise.** Cases must test whether the *correct date-specific
  source* is cited and correctly characterised — not whether the system performs a tax calculation.

## Goal

Author the `payroll` evaluation category: exactly **70** cases — 42 development, 14 validation
(plaintext) and 14 blind (sealed) — with **exactly 8 primary cases for each of the eight payroll-tax
jurisdictions** (≥ 4 development, ≥ 1 validation and ≥ 1 blind each) and the remaining 6 covering
Commonwealth PAYG/STP/super/FBT, every case grounded in immutable corpus ids from the relevant
`PT-*`/`ATO-EMPLOYMENT` material and turning on **date-versioned** rates, thresholds and obligations
across the PRD §6.6 three financial years, plus the category's `stratification.yaml` and dataset-version
registration. Completion is mechanically checkable: `verify --category payroll` passes with counts
exactly 42/14/14, the per-jurisdiction floor met, no cross-split overlap, every blind slot sealed with a
matching digest and allowlisted sidecar, and every `evaluation_subset_ref` id the nine adapters name
existing here.

## Non-goals

- **No other category's cases** — `GOLD-05` … `GOLD-07`, `GOLD-09` … `GOLD-14`. State *employment/
  industrial* law is `GOLD-09`; only payroll-related obligations are primary here.
- **No schema, id rules, seal or checker** — `GOLD-01` (merged; blocker).
- **No metrics, thresholds, gates, judge or reports** — `GOLD-02`, `GOLD-03`, `GOLD-04`, `GOLD-17`.
- **No rate/threshold fact model, adapter or registry row** — `SINS-01`, `SINS-06` … `SINS-14` (merged;
  blockers), `INGF-07`.
- **No tax calculation engine or worked arithmetic** — outside the product's scope (PRD §3 non-goals and
  §9.4: the product cites and explains sources; it does not compute a liability).
- **No blind gold plaintext anywhere** — PRD §14.3, §45.1 item 6.
- **No blind case authoring, review or decryption** — plan §8 **Q6** (confirmed) puts authoring with the
  `evaluation-author` agents outside this repository, per-case review with the independent
  `evaluation-reviewer` agent, and opening with the Founder alone. This ticket delivers sealed slots.
- **No product fix**: a defect routes to the owning module's ticket (PRD §43.4).

## File-scope (write-owns)

Owned by this ticket:

- `evals/cases/payroll/**` — `stratification.yaml`, `development/*.yaml`, `validation/*.yaml`,
  `blind/*.sidecar.yaml`, `manifest.yaml`, `README.md`
- `evals/gold/payroll/**` — `development/*.yaml`, `validation/*.yaml`, `blind/*.sealed`,
  `blind/manifest.json`

Does not touch:

- The other nine category directories — `GOLD-05` … `GOLD-07`, `GOLD-09` … `GOLD-14`.
- `evals/splits/**`, `schemas/evaluation/**`, `pipelines/evaluation/**` — `GOLD-01` … `GOLD-04`,
  `GOLD-15`, `GOLD-16`. Dataset-version entries are created **through `GOLD-01`'s CLI**.
- `evals/reports/**` — `GOLD-03`; `evals/reports/release-candidate/**` — `GOLD-17`.
- `pipelines/**`, `apps/**`, `packages/**`, `services/**`, `infra/**`, `tests/**` — other modules per
  plan §4. `docs/PRD.md`, `.claude/**` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). The two directories are named after this category and are written by no other ticket (plan
§5.22); the nine concurrent authoring siblings own differently-named directories — PRD §44.3's
*"individual evaluation categories"* — and no central split index exists (sub-PRD **D4**). All ten
declared blockers land first: `GOLD-01` (module wave 1) and the nine `07-sources-instruments` adapters
(each after `SINS-01`). No shared append-only file.

## Deliverables

1. **`stratification.yaml`** — counts `42/14/14`; **per-jurisdiction floor**: exactly 8 primary cases for
   each of `NSW, VIC, QLD, WA, SA, TAS, ACT, NT`, each with ≥ 4 development, ≥ 1 validation and ≥ 1
   blind; **Commonwealth floor**: 6 primary cases (`CTH`) with ≥ 4 development; surface floors
   `ASK ≥ 30`, `SEARCH ≥ 3`; status floors `SUPPORTED ≥ 2`, `CONDITIONAL ≥ 2` per split; financial-year
   floor: ≥ 15 cases whose answer changes between the PRD §6.6 years.
2. **42 development cases** in `development/`, ids `EVAL-PAY-###`, all PRD §14.1/§43.2 fields present.
   Subject coverage: payroll-tax liability triggers, thresholds and rates by financial year, grouping
   provisions, contractor/employment-agent provisions, exemptions and rebates, lodgement/annual
   reconciliation obligations; and Commonwealth PAYG withholding, Single Touch Payroll reporting,
   superannuation guarantee and Payday Super material, and FBT as it touches employment.
3. **14 validation cases** in `validation/` — independent of development; no shared scenario or
   paraphrase across splits.
4. **Trap coverage.** At least:
   - **date-versioned rate** (PRD §40.3): identical facts at two `legal_as_at` dates produce different
     rates/thresholds, and gold requires the **date-specific** source node — a case where citing the
     current rate for a prior year is a `DATE_JURISDICTION_CRITICAL_ERROR`;
   - **wrong-jurisdiction trap**: facts that look like one state's regime but are governed by another's,
     with the wrong-state conclusion in `prohibited_claims`;
   - **guidance vs Act** (PRD §9.1): a revenue-office ruling or guide that cannot override the
     payroll-tax Act; the expected citation roles distinguish the two;
   - **grouping**: related entities whose grouping changes the threshold outcome, requiring a
     `CONDITIONAL` status when a decisive fact is unstated;
   - **mid-year change**: a rate or threshold changing part-way through a financial year;
   - **federal/state boundary**: a question whose answer requires distinguishing a Commonwealth
     obligation (PAYG/STP/super) from a state payroll-tax obligation.
5. **Gold authorities** — immutable corpus ids for the **date-specific** rate/threshold node and the
   underlying legislative provision, with `citation_role` distinguishing the operative instrument from
   guidance (PRD §9.1, §40.3). `required: true` marks what recall@10 must find; pinpoint offsets are
   mandatory wherever a number is the answer.
6. **14 blind slots, sealed** — envelopes + `blind/manifest.json` + allowlisted sidecars, sealed with the
   committed public key only; plaintext working directory git-ignored and never committed, pasted or
   summarised. The plaintext itself is authored outside this repository by the `evaluation-author`
   agents and checked by the independent `evaluation-reviewer` agent before encryption (PRD §14.3,
   §45.1 item 6; plan §8 **Q6**, confirmed); this ticket's obligation is that the slots exist, are
   sealed, are counted and are stratified.
7. **`manifest.yaml`** — primary category, code `PAY`, counts, per-jurisdiction distribution, pinned
   `corpus_release_id`, `dataset_version`, satisfied `evaluation_subset_ref` ids.
8. **Adapter reciprocity** — every `PAY`-range id declared in
   `pipelines/adapters/{ato-employment,pt-nsw,pt-vic,pt-qld,pt-wa,pt-sa,pt-tas,pt-act,pt-nt}/registry.yaml`
   exists here; an id naming another category is reported for `GOLD-16` (PRD §40.8 item 11).
9. **Dataset registration** — all 70 cases registered through `GOLD-01`'s CLI with hashes/digests,
   `change_reason` and `approved_by` (PRD §14.3, §43.4).
10. **`README.md`** — scope, the per-jurisdiction distribution table, the trap inventory mapped to PRD
    §40.3 and §9.1, authoring conventions (invented employers, fictitious checksum-valid ABNs, no real
    PII — sub-PRD **D18**), and the blind-material statement.

## Acceptance checklist (classified)

- [ ] `[machine]` **Counts are exactly 42 / 14 / 14 = 70**, matching PRD §43.1 row 4. (`EVAL-001`)
- [ ] `[machine]` **Per-jurisdiction floor met**: exactly 8 primary cases for each of the eight
      payroll-tax jurisdictions, each with ≥ 4 development, ≥ 1 validation and ≥ 1 blind; 6 Commonwealth
      cases. (PRD §43.1 *"At least eight primary cases … must cover each state/territory"*; plan §5.22)
- [ ] `[machine]` **Every case validates** against `GOLD-01`'s schema with all PRD §14.1 fields present.
      (PRD §14.1, §43.2)
- [ ] `[machine]` **No overlap**: no id in two splits; no near-duplicate across splits; ids contiguous in
      `EVAL-PAY-###`. (PRD §30.2 `EVAL-001`)
- [ ] `[machine]` **Date-versioned rate traps present**: ≥ 15 cases whose expected answer changes across
      the PRD §6.6 financial years, each with a date-specific gold node. (PRD §40.3, §6.6)
- [ ] `[machine]` **Guidance-vs-Act trap encoded**: at least one case whose gold gives the Act the
      operative role and the revenue-office guidance a subordinate role, with the guidance-overrides
      conclusion in `prohibited_claims`. (PRD §9.1)
- [ ] `[machine]` **Wrong-jurisdiction trap encoded**: at least one case whose `prohibited_claims` names
      the plausible-but-wrong state conclusion. (PRD §14.2 *"Critical legal-date or jurisdiction
      errors 0"*)
- [ ] `[machine]` **Gold shape and pinpoints**: ≥ 1 `required: true` authority per case; every numeric
      answer carries pinpoint offsets on a date-specific node. (PRD §43.2, §15.3, §40.3)
- [ ] `[machine]` **Gold resolves against the pinned release** when supplied; `UNRESOLVED` and non-zero
      exit otherwise. (PRD §43.2, §40.9; sub-PRD D7)
- [ ] `[machine]` **Blind integrity without decryption**: 14 envelopes, 14 sidecars, digests match,
      allowlisted fields only, no plaintext found by `guard-blind`. (PRD §14.3, §43.1)
- [ ] `[machine]` **No key needed to deliver**: only the committed public key is used; no private key and
      no blind plaintext in the diff or history. (PRD §45.1 item 6)
- [ ] `[machine]` **Adapter reciprocity**: every `EVAL-PAY-###` id named by the nine adapters' registry
      rows exists here. (PRD §40.8 item 11)
- [ ] `[machine]` **Synthetic only**: invented employers, fictitious checksum-valid ABNs, no real person,
      contact, TFN or payroll identifier. (PRD §14.1; §10.1; sub-PRD D18)
- [ ] `[machine]` **Registered dataset version** for all 70 cases with hashes, reason and approver.
      (PRD §14.3; §43.4)
- [ ] `[machine]` `uv run pytest` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm test` green — unaffected. `cargo test --workspace` unaffected. (PRD §45.3)
- [ ] `[human]` **Case-quality review**: a founder/reviewer confirms the rates, thresholds and grouping
      scenarios are realistic per jurisdiction and financial year, that each trap is genuine, and that no
      case rewards quoting a current rate for a historical date. Plan §1.1 maps case-quality judgement to
      `[human]`. (PRD §43.4; §40.3)
- [ ] `[human]` **Blind third**: the Founder confirms the 14 sealed slots were produced under plan §8
      **Q6**'s confirmed path — `evaluation-author` agents outside this repository, independent
      `evaluation-reviewer` check against official sources before encryption — and applies the
      risk-based spot check where this category is sampled (typically 12–20 across the whole 120
      blind cases). Recorded in the ADR `GOLD-01` authors. (PRD §14.3; plan §8 **Q6**)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs (**EVAL-001**), user-visible change and
      non-goals, schema compatibility impact (data only), tenant/PII/security impact (synthetic; blind
      sealed), **source/licence impact** (revenue-office material may be licence-limited — cite nodes and
      offsets, never bulk text), cost/latency impact (adds 70 cases), rollback path (dataset version),
      known gaps.

Absent classes: no `[fixture]` criteria — no recorded evaluation run exists to replay at this point in
the DAG (`GOLD-02` is not a blocker); the first replay is `GOLD-17`'s.

## Test plan

Every `[machine]` step runs offline and **without the blind seal key**.

1. **Verify the category.** `uv run python -m evaluation.dataset verify --category payroll --format json`.
2. **Counts and jurisdiction distribution.** Assert 42/14/14/70 and read the per-jurisdiction table from
   `manifest.yaml`: exactly 8 per jurisdiction, ≥ 4/≥ 1/≥ 1 per split, 6 Commonwealth.
3. **Read the plaintext cases.** Spot-check two cases per jurisdiction; confirm each cites a
   date-specific source rather than a current-rate page.
4. **Verify the blind third without reading it.** `guard-blind` → 14 envelopes, 14 sidecars, digests
   match, allowlisted fields only. **Do not request or accept a plaintext copy** (PRD §14.3, §45.1
   item 6).
5. **Date traps.** Take one case per jurisdiction and confirm that changing `legal_as_at` to another
   financial year changes the expected answer and the gold node.
6. **Guidance-vs-Act.** Confirm the roles in gold distinguish operative instrument from guidance and that
   the prohibited conclusion is encoded.
7. **Overlap, gold resolution, synthetic scan, version registry** — from the checker's output; on a
   scratch copy corrupt one `node_id` and one case's content to confirm `GOLD_RESOLVES` and
   `VERSIONED_CORRECTIONS` fail.
8. **Suite.** `uv run pytest` from the repository root.
9. **Reviewer focus.** Confirm the validation set is independent of development; confirm no case depends
   on arithmetic the product does not promise; confirm every numeric answer is anchored to a
   date-specific pinpoint; confirm nothing in the diff, PR body or commit messages contains blind
   content.

## Feedback obligation

1. **General rule.** If authoring falsifies this ticket, update **this ticket** (docs PR → merge →
   `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/21-evaluation-600/README.md` (version +0.1 with a changelog line) **before** changing data.
   Later changes to delivered cases are **versioned dataset corrections** (PRD §14.3).
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A jurisdiction's corpus lacks enough historical rate material for 8 cases* → do not reduce the
     floor silently. Record the shortfall in `docs/prd/21-evaluation-600/README.md`, raise it with the
     owning `SINS-*` ticket, and route it to `GOLD-16` — a jurisdiction that cannot be evaluated is a
     **coverage** finding under PRD §7/§44.4, and PRD §43.1's per-jurisdiction rule is the thing at risk.
   - *A rate page changes and gold stops resolving* → create a **formal dataset migration** through
     `GOLD-01`'s `migrate` command linking old→new gold with a reason (PRD §43.2). Rates change every
     financial year; this is a routine, versioned event, never a silent repoint.
   - *The product answers with a current rate for a historical date* → that is the defect this category
     exists to catch (PRD §40.3, §14.2 zero-tolerance date errors). Classify under PRD §43.4 and route to
     `RETR-04`/`ASK-02`/`SINS-01`; **never** change the expected output.
   - *Revenue-office licence limits prevent quoting a needed table* → record the limitation in the case's
     `preconditions` and the README, and route the licence question to `INGF-04`. PRD §11.1's
     conservative default stands.
   - *An `evaluation_subset_ref` id belongs elsewhere* → report to `GOLD-16`; raise a docs PR against the
     owning `SINS-*` ticket.
3. **Falsified protocol.** **If any part of this work appears to require reading, writing, quoting or
   summarising blind case content or gold answers in ordinary context, the task is wrong** — that
   overturns PRD §14.3 and §45.1 item 6. Stop, escalate to the Founder (plan §8 **Q6**), and write back
   to `docs/prd/21-evaluation-600/README.md` and `docs/prd/breakdown-plan.md` **R9**. A change to the
   42/14/14 allocation or the per-jurisdiction floor is a **PRD** change under §45.5 requiring Founder
   approval.
