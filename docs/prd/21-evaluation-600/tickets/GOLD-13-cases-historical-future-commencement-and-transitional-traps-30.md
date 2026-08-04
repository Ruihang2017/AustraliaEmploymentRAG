---
id: GOLD-13
title: "Cases: historical, future, commencement and transitional traps (30)"
module: 21-evaluation-600
lane: 21-evaluation-600
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [GOLD-01, SFUT-02]
blocks: [GOLD-17]
---

# GOLD-13 — Cases: historical, future, commencement and transitional traps (30)

Implements PRD §43.1 (row 9), §6.5/§6.6/§6.7 and §14.1 — requirement **EVAL-001**, exercising
**SRCH-002**; epic `E31-EVAL-600`.
No ADR — the decision is already made in PRD §43.1 (the category and its 18/6/6 allocation) and PRD
§6.5/§6.6/§6.7 (future material is separated and labelled, three financial years are supported, and the
legal-status taxonomy is fixed); this is build ticket 13 of 17 against it.
Parent sub-PRD: [21-evaluation-600 README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [GOLD-01 — Case schema, splits, integrity and blind protection](GOLD-01-case-schema-splits-integrity-and-blind-protection.md), [SFUT-02 `FUTURE-CTH`](../../10-sources-future/tickets/SFUT-02-future-cth.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
the category, its counts and the temporal rules the traps must probe are already fixed by the PRD; this
authors the data against `GOLD-01`'s schema and checker.

## Background + basis

**PRD §43.1, this ticket's row, transcribed verbatim:**

| Primary category | Development | Validation | Blind | Total |
|---|---:|---:|---:|---:|
| Historical, future, commencement and transitional traps | **18** | **6** | **6** | **30** |

**PRD §14.1, the required per-case fields, quoted verbatim:**

> Each case SHOULD include **scenario, question, legal date, jurisdictions, expected answer status,
> required facts, prohibited assumptions, trap types, gold DocumentVersion/NodeVersion authorities,
> required/optional/prohibited claims and expected citation roles.**

`GOLD-01` deliverable 1 makes these required (sub-PRD **D6**); PRD §43.2 adds the rest and *"Gold
authorities use immutable corpus IDs for a named evaluation CorpusRelease."*

**PRD §6.5, quoted verbatim:** *"Future/proposed material MUST be stored and searchable but **MUST be
separated from current-law answers and visibly labelled**."* Its material list is bills, explanatory
memoranda, enacted-but-not-commenced amendments, draft instruments, consultations and commencement
proclamations.

**PRD §6.6, quoted verbatim:** point-in-time retrieval MUST support **2026–27, 2025–26 and 2024–25**;
*"Case law and still-operative instruments MUST NOT be excluded solely because they are older than three
financial years."*

**PRD §6.7, the status taxonomy, transcribed verbatim:** `IN_FORCE`, `ENACTED_NOT_IN_FORCE`,
`BILL_NOT_ENACTED`, `DRAFT_OR_CONSULTATION`, `REPEALED`, `SUPERSEDED`, `STATUS_UNCONFIRMED` — and the
rule: *"Default answers MUST use only material in force at the requested legal date unless the user
explicitly requests historical, future or proposed material."*

**PRD §36.2, quoted verbatim:** *"Future/proposed research changes the allowed status set but **never
relabels future material as current**. `STATUS_UNCONFIRMED` cannot support a definitive current-law
conclusion."*

**The gates this category feeds** (PRD §14.2): *"Critical legal-date or jurisdiction errors — 0"* and
*"Source-status correctness — ≥ 98%"*. PRD §43.3 defines the latter as *"Correct in-force/future/
repealed/stale/unknown treatment ÷ assessed status assertions"* — this category is where most of that
denominator comes from. PRD §41.2 adds `UAT-SRCH-02` (*"Future material absent from default results or
visibly separated when requested"*) and `UAT-SRCH-03` (*"Version effective at that date opens; current
text is not substituted"*).

**PRD §14.3, binding on the blind third:** *"**Blind gold answers MUST remain outside ordinary
coding-agent context.**"* This ticket authors **18 development + 6 validation** cases in plaintext and
delivers its **6 blind slots** through `GOLD-01`'s sealed channel — sealing requires only the committed
public key, so the slots exist without any Builder holding the key that opens them.

**Plan §8 Q6 (confirmed) — the division of labour for the blind third.** Blind case content and gold
answers are authored by dedicated `evaluation-author` agents in an isolated session/workspace
**outside this repository**, and are checked by an independent `evaluation-reviewer` agent against
official sources before encryption; no lawyer or employed domain expert is engaged, and the Founder
performs a risk-based spot check of typically 12–20 of the 120 blind cases across all ten categories.
Blind plaintext never enters this ticket's scope: it is never committed to git, copied into ordinary
fixtures, pasted into an implementation agent's session, or exposed to ordinary CI. **This ticket
delivers the visible development and validation cases and the 6 sealed blind *slots*** — envelope,
manifest digest and allowlisted sidecar — and nothing else about the blind third. That division is
settled, not an open Founder question.

**PRD §43.4:** *"Agents may not 'fix' a failing gold case by changing expected output without a
versioned founder-approved reason."*

**Requirement.** `EVAL-001`: 360/120/120 with a passing split-integrity test; this ticket contributes
exactly 18/6/6.

**What is already decided elsewhere and must not be re-decided here.** `GOLD-01` owns the schema, ids
(`EVAL-TMP-###`), stratification schema, seal and checker. `SFUT-01` owns the future/status event model
and current-vs-future separation; `SFUT-02` owns `FUTURE-CTH` and its `evaluation_subset_ref` ids (PRD
§40.8 item 11). `SLEG-01` owns point-in-time/commencement primitives; `FND-10` owns the temporal
predicate; `RETR-04` owns the hard filters.

**Sub-PRD decisions carried forward:** **D1**–**D3**, **D5**, **D6**, **D7**, **D8**, **D18**.

**Accepted caveats carried forward:**

- **A pinned evaluation CorpusRelease may not exist yet** (sub-PRD **Q-GOLD-D**).
- **Only `SFUT-02` is a source blocker** (plan §5.22), so future/proposed material is anchored in
  Commonwealth bills, EMs, enacted-not-commenced amendments and commencement proclamations. Historical
  and transitional traps draw on whatever the pinned release already holds; a **required** gold authority
  from a state future-law group would need a plan edge and is out of scope here.
- **A temporal case ages.** A case pinned to "the amendment commencing next quarter" becomes a
  historical case once it commences. Every case therefore states an explicit `legal_as_at` and its gold
  is anchored to versions, not to "now" — and a commencement that occurs after authoring is a
  **versioned dataset migration**, not a silent edit.

## Goal

Author the `temporal-traps` evaluation category: exactly **30** cases — 18 development, 6 validation
(plaintext) and 6 blind (sealed) — that systematically probe PRD §6.5/§6.6/§6.7 and §36.2: historical
point-in-time answers across the three supported financial years, future/proposed material that must be
separated and labelled rather than treated as current, commencement and transitional provisions, and
`STATUS_UNCONFIRMED` material that cannot support a definitive conclusion — plus the category's
`stratification.yaml` and dataset-version registration. Completion is mechanically checkable:
`verify --category temporal-traps` passes with counts exactly 18/6/6, no cross-split overlap, all
declared floors met (including every PRD §6.7 status value), every blind slot sealed with a matching
digest and allowlisted sidecar, and every `evaluation_subset_ref` id `future-cth` names existing here.

## Non-goals

- **No other category's cases** — `GOLD-05` … `GOLD-12`, `GOLD-14`. A payroll rate change over time is
  `GOLD-08`'s; only cases whose *primary* subject is the temporal rule belong here.
- **No schema, id rules, seal or checker** — `GOLD-01` (merged; blocker).
- **No metrics, thresholds, gates, judge or reports** — `GOLD-02`, `GOLD-03`, `GOLD-04`, `GOLD-17`.
- **No future/status event model, commencement extraction or adapter** — `SFUT-01`, `SFUT-02` (merged;
  blocker), `SLEG-01`.
- **No temporal filter implementation** — `00-foundation` (`FND-10`) and `11-retrieval-engine`
  (`RETR-04`). These cases measure the behaviour.
- **No blind gold plaintext anywhere** — PRD §14.3, §45.1 item 6.
- **No blind case authoring, review or decryption** — plan §8 **Q6** (confirmed) puts authoring with the
  `evaluation-author` agents outside this repository, per-case review with the independent
  `evaluation-reviewer` agent, and opening with the Founder alone. This ticket delivers sealed slots.
- **No product fix**: a defect routes to the owning module's ticket (PRD §43.4).

## File-scope (write-owns)

Owned by this ticket:

- `evals/cases/temporal-traps/**` — `stratification.yaml`, `development/*.yaml`, `validation/*.yaml`,
  `blind/*.sidecar.yaml`, `manifest.yaml`, `README.md`
- `evals/gold/temporal-traps/**` — `development/*.yaml`, `validation/*.yaml`, `blind/*.sealed`,
  `blind/manifest.json`

Does not touch:

- The other nine category directories — `GOLD-05` … `GOLD-12`, `GOLD-14`.
- `evals/splits/**`, `schemas/evaluation/**`, `pipelines/evaluation/**` — `GOLD-01` … `GOLD-04`,
  `GOLD-15`, `GOLD-16`. Dataset-version entries are created **through `GOLD-01`'s CLI**.
- `evals/reports/**` — `GOLD-03`; `evals/reports/release-candidate/**` — `GOLD-17`.
- `pipelines/**`, `apps/**`, `packages/**`, `services/**`, `infra/**`, `tests/**` — other modules per
  plan §4. `docs/PRD.md`, `.claude/**` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). The two directories are named after this category and are written by no other ticket (plan
§5.22); the nine concurrent authoring siblings own differently-named directories — PRD §44.3's
*"individual evaluation categories"* — and no central split index exists (sub-PRD **D4**). Both declared
blockers land first: `GOLD-01` (module wave 1) and `SFUT-02` (`10-sources-future`, after `SFUT-01`). No
shared append-only file.

## Deliverables

1. **`stratification.yaml`** — counts `18/6/6`; **status floor**: at least one case whose gold material
   carries each PRD §6.7 value (`IN_FORCE`, `ENACTED_NOT_IN_FORCE`, `BILL_NOT_ENACTED`,
   `DRAFT_OR_CONSULTATION`, `REPEALED`, `SUPERSEDED`, `STATUS_UNCONFIRMED`); **year floor**: ≥ 4 cases
   per PRD §6.6 financial year; surface floors `ASK ≥ 15`, `SEARCH ≥ 3`, `COMPARE ≥ 4` (time dimension),
   `MONITOR ≥ 3` (sub-PRD cross-cutting table); status floors `SOURCE_NOT_CURRENT ≥ 3`,
   `SUPPORTED ≥ 2`, `CONDITIONAL ≥ 2`.
2. **18 development cases** in `development/`, ids `EVAL-TMP-###`, all PRD §14.1/§43.2 fields present.
   Subject coverage: point-in-time answers where the current text differs from the text effective at
   `legal_as_at`; enacted-but-not-commenced amendments; bills and consultation drafts; commencement
   proclamations and staged commencement; transitional and savings provisions; repealed and superseded
   instruments that still govern a past period.
3. **6 validation cases** in `validation/` — independent of development; no shared scenario or paraphrase
   across splits.
4. **Trap coverage.** At least:
   - **current text substituted for historical** (`UAT-SRCH-03`): the answer must use the version
     effective at `legal_as_at`; the current-text conclusion is in `prohibited_claims`;
   - **future material treated as current** (PRD §6.5, §36.2): an enacted-not-commenced amendment that
     must be visibly separated, never relabelled current;
   - **bill treated as law** (PRD §6.7 `BILL_NOT_ENACTED`): a bill or EM that cannot support a
     current-law conclusion;
   - **commencement date trap**: a provision commencing between two candidate dates, where the answer
     flips;
   - **transitional provision**: the general rule is displaced for a defined cohort or period;
   - **repealed but still governing**: conduct in a past period governed by a since-repealed provision
     (PRD §6.6);
   - **`STATUS_UNCONFIRMED`** (PRD §36.2): material whose status the corpus cannot confirm; the expected
     status is `SOURCE_NOT_CURRENT` or an explicitly qualified answer, never a definitive one;
   - **time Compare** (`CMP-001`, `UAT-CMP-01`): ≥ 4 cases comparing the same instrument at two legal
     dates, each column carrying its own version and citations, distinguishing textual change from change
     in legal effect.
5. **Gold authorities** — immutable corpus ids for the **version effective at `legal_as_at`**, plus the
   commencement or repeal `legal_event` evidence where the case turns on it (PRD §15.2: *"Legal status
   MUST be derived from evidenced LegalEvents"*). `required: true` marks what recall@10 must find;
   expected source-status values are recorded per authority so `GOLD-02`'s source-status metric has a
   ground truth.
6. **6 blind slots, sealed** — envelopes + `blind/manifest.json` + allowlisted sidecars, sealed with the
   committed public key only; plaintext working directory git-ignored and never committed, pasted or
   summarised. The plaintext itself is authored outside this repository by the `evaluation-author`
   agents and checked by the independent `evaluation-reviewer` agent before encryption (PRD §14.3,
   §45.1 item 6; plan §8 **Q6**, confirmed); this ticket's obligation is that the slots exist, are
   sealed, are counted and are stratified.
7. **`manifest.yaml`** — primary category, code `TMP`, counts, the status/year distribution, pinned
   `corpus_release_id`, `dataset_version`, satisfied `evaluation_subset_ref` ids.
8. **Adapter reciprocity** — every `TMP`-range id declared in
   `pipelines/adapters/future-cth/registry.yaml` exists here; an id naming another category is reported
   for `GOLD-16` (PRD §40.8 item 11).
9. **Dataset registration** — all 30 cases registered through `GOLD-01`'s CLI with hashes/digests,
   `change_reason` and `approved_by` (PRD §14.3, §43.4).
10. **`README.md`** — scope, the status/year distribution, the ageing rule (a future case becomes a
    historical case at commencement, handled by migration), authoring conventions (sub-PRD **D18**) and
    the blind-material statement.

## Acceptance checklist (classified)

- [ ] `[machine]` **Counts are exactly 18 / 6 / 6 = 30**, matching PRD §43.1 row 9. (`EVAL-001`)
- [ ] `[machine]` **Every PRD §6.7 status value appears** in at least one case's gold material, and each
      PRD §6.6 financial year has ≥ 4 cases. (PRD §6.6, §6.7; §43.1)
- [ ] `[machine]` **Every case validates** against `GOLD-01`'s schema with all PRD §14.1 fields present.
      (PRD §14.1, §43.2)
- [ ] `[machine]` **No overlap**: no id in two splits; no near-duplicate across splits; ids contiguous in
      `EVAL-TMP-###`. (PRD §30.2 `EVAL-001`)
- [ ] `[machine]` **Historical-substitution trap encoded**: ≥ 2 cases whose `prohibited_claims` name the
      current-text conclusion and whose gold is the version effective at `legal_as_at`. (PRD §6.6; §41.2
      `UAT-SRCH-03`)
- [ ] `[machine]` **Future-as-current trap encoded**: ≥ 2 cases with `ENACTED_NOT_IN_FORCE` or
      `BILL_NOT_ENACTED` gold whose expected answer separates and labels the material rather than
      treating it as current. (PRD §6.5; §36.2; §41.2 `UAT-SRCH-02`)
- [ ] `[machine]` **`STATUS_UNCONFIRMED` encoded**: ≥ 1 case where unconfirmed status cannot support a
      definitive current-law conclusion. (PRD §36.2)
- [ ] `[machine]` **Expected source-status recorded per authority**, so `GOLD-02`'s source-status metric
      has a ground truth. (PRD §43.3 row 7; §14.2 *"Source-status correctness ≥ 98%"*)
- [ ] `[machine]` **Compare floor met**: ≥ 4 time-dimension Compare cases with per-column versions and
      citations, distinguishing textual change from change in legal effect. (PRD §8.6; §41.2
      `UAT-CMP-01`)
- [ ] `[machine]` **Commencement/repeal evidence present**: cases turning on a status change cite the
      evidencing `legal_event`. (PRD §15.2; §9.3)
- [ ] `[machine]` **Gold resolves against the pinned release** when supplied; `UNRESOLVED` and non-zero
      exit otherwise. (PRD §43.2, §40.9; sub-PRD D7)
- [ ] `[machine]` **Blind integrity without decryption**: 6 envelopes, 6 sidecars, digests match,
      allowlisted fields only, no plaintext found by `guard-blind`. (PRD §14.3, §43.1)
- [ ] `[machine]` **No key needed to deliver**: only the committed public key is used; no private key and
      no blind plaintext in the diff or history. (PRD §45.1 item 6)
- [ ] `[machine]` **Adapter reciprocity**: every `EVAL-TMP-###` id named by `future-cth` exists here.
      (PRD §40.8 item 11)
- [ ] `[machine]` **Synthetic only**: invented employers and employees; no real person or contact data.
      (PRD §14.1; §10.1; sub-PRD D18)
- [ ] `[machine]` **Registered dataset version** for all 30 cases with hashes, reason and approver.
      (PRD §14.3; §43.4)
- [ ] `[machine]` `uv run pytest` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm test` green — unaffected. `cargo test --workspace` unaffected. (PRD §45.3)
- [ ] `[human]` **Case-quality review**: a founder/reviewer confirms the commencement and transitional
      chains are real, that each temporal trap would genuinely mislead a naive system, and that the
      expected statuses match PRD §6.7. Plan §1.1 maps case-quality judgement to `[human]`; PRD §43.4
      item 7 puts temporal traps in the founder queue. (PRD §43.4; §6.5–§6.7)
- [ ] `[human]` **Blind third**: the Founder confirms the 6 sealed slots were produced under plan §8
      **Q6**'s confirmed path — `evaluation-author` agents outside this repository, independent
      `evaluation-reviewer` check against official sources before encryption — and applies the
      risk-based spot check where this category is sampled (typically 12–20 across the whole 120
      blind cases). Recorded in the ADR `GOLD-01` authors. (PRD §14.3; plan §8 **Q6**)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs (**EVAL-001**; exercises **SRCH-002**,
      **CMP-001**), user-visible change and non-goals, schema compatibility impact (data only),
      tenant/PII/security impact (synthetic; blind sealed), source/licence impact (bills and EMs cited by
      node and offset), cost/latency impact (adds 30 cases), rollback path (dataset version), known gaps
      (the ageing rule).

Absent classes: no `[fixture]` criteria — no recorded evaluation run exists to replay at this point in
the DAG (`GOLD-02` is not a blocker); the first replay is `GOLD-17`'s.

## Test plan

Every `[machine]` step runs offline and **without the blind seal key**.

1. **Verify the category.** `uv run python -m evaluation.dataset verify --category temporal-traps
   --format json`.
2. **Counts and floors.** Assert 18/6/6/30, every PRD §6.7 status present, ≥ 4 cases per financial year.
3. **Read the plaintext cases.** Confirm each case's `legal_as_at` is explicit and that its gold is the
   version effective at that date, not the current one.
4. **Verify the blind third without reading it.** `guard-blind` → 6 envelopes, 6 sidecars, digests match,
   allowlisted fields only. **Do not request or accept a plaintext copy** (PRD §14.3, §45.1 item 6).
5. **Temporal traps.** For the historical-substitution and future-as-current cases, confirm the
   prohibited conclusion is encoded and that the expected status matches PRD §6.7.
6. **Compare cases.** Confirm each column carries its own version and citations and that textual change
   is distinguished from change in legal effect.
7. **Event evidence.** Confirm commencement/repeal cases cite a `legal_event` node rather than asserting
   the change.
8. **Overlap, gold resolution, synthetic scan, version registry** — from the checker's output; on a
   scratch copy corrupt one `node_id` and one case's content to confirm `GOLD_RESOLVES` and
   `VERSIONED_CORRECTIONS` fail.
9. **Suite.** `uv run pytest` from the repository root.
10. **Reviewer focus.** Confirm the validation set is independent of development; confirm no case would
    silently pass if the system substituted current text; confirm the ageing rule is documented so a
    commenced amendment is migrated rather than edited; confirm nothing in the diff, PR body or commit
    messages contains blind content.

## Feedback obligation

1. **General rule.** If authoring falsifies this ticket, update **this ticket** (docs PR → merge →
   `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/21-evaluation-600/README.md` (version +0.1 with a changelog line) **before** changing data.
   Later changes to delivered cases are **versioned dataset corrections** (PRD §14.3).
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A future amendment commences and a case's expected answer changes* → create a **formal dataset
     migration** through `GOLD-01`'s `migrate` command with the commencement as the reason (PRD §43.2,
     §14.3). This is the expected lifecycle of this category, not an error.
   - *The corpus holds no `DRAFT_OR_CONSULTATION` or `STATUS_UNCONFIRMED` material to anchor a case* →
     record it in `docs/prd/21-evaluation-600/README.md`, raise it with `SFUT-01`/`SFUT-02` and route it
     to `GOLD-16` as a **coverage** finding; do not fabricate a status.
   - *A required gold authority would have to come from a state future-law group* → that group is not a
     blocker of this ticket; keep it non-required, or raise a **plan** change (docs PR against
     `docs/prd/breakdown-plan.md` §5.22/§6.2). Never invent a DAG edge.
   - *The product substitutes current text for a historical date* → that is the defect this category
     exists to catch (PRD §14.2 zero-tolerance date errors). Classify under PRD §43.4 and route to
     `RETR-04`/`SLEG-01`; **never** change the expected output.
   - *An `evaluation_subset_ref` id belongs elsewhere* → report to `GOLD-16`; raise a docs PR against
     `SFUT-02`.
3. **Falsified protocol.** **If any part of this work appears to require reading, writing, quoting or
   summarising blind case content or gold answers in ordinary context, the task is wrong** — that
   overturns PRD §14.3 and §45.1 item 6. Stop, escalate to the Founder (plan §8 **Q6**), and write back
   to `docs/prd/21-evaluation-600/README.md` and `docs/prd/breakdown-plan.md` **R9**. A change to the
   18/6/6 allocation is a **PRD** change under §45.5 requiring Founder approval.
