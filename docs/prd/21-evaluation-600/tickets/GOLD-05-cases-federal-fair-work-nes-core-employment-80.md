---
id: GOLD-05
title: "Cases: federal Fair Work/NES/core employment (80)"
module: 21-evaluation-600
lane: 21-evaluation-600
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [GOLD-01, SLEG-02]
blocks: [GOLD-17]
---

# GOLD-05 — Cases: federal Fair Work/NES/core employment (80)

Implements PRD §43.1 (row 1) and §14.1 — requirement **EVAL-001**; epic `E31-EVAL-600`.
No ADR — the decision is already made in PRD §43.1 (the category and its 48/16/16 allocation) and PRD
§14.1 (the required per-case fields); this is build ticket 5 of 17 against it.
Parent sub-PRD: [21-evaluation-600 README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [GOLD-01 — Case schema, splits, integrity and blind protection](GOLD-01-case-schema-splits-integrity-and-blind-protection.md), [SLEG-02 — `LEG-CTH` Federal Register of Legislation](../../06-sources-legislation/tickets/SLEG-02-leg-cth-federal-register-of-legislation.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
the category, its counts and its per-case fields are already fixed by the PRD; this authors the data
against `GOLD-01`'s schema and checker.

## Background + basis

**PRD §43.1, this ticket's row, transcribed verbatim:**

| Primary category | Development | Validation | Blind | Total |
|---|---:|---:|---:|---:|
| Federal Fair Work/NES/core employment law | **48** | **16** | **16** | **80** |

> Cases may carry multiple tags, but each has one primary allocation so totals cannot drift. …
> cross-tags ensure every product surface and answer status is represented. **The blind case
> content/gold data is inaccessible to ordinary coding-agent context.**

**PRD §14.1, the required per-case fields, quoted verbatim:**

> Each case SHOULD include **scenario, question, legal date, jurisdictions, expected answer status,
> required facts, prohibited assumptions, trap types, gold DocumentVersion/NodeVersion authorities,
> required/optional/prohibited claims and expected citation roles.**

`GOLD-01` deliverable 1 makes these **required** in this dataset profile (sub-PRD **D6**), and PRD
§43.2 adds `id, dataset_version, split, primary_category, tags, product_surface, mode,
anonymous_scenario, legal_as_at, input_structured_fields, acceptable_statuses, expected_clarifications,
expected_refusal_reason, licensing/freshness/source preconditions, latency_class, cost_class,
author/reviewer, change_reason`.

**PRD §43.2, the gold rule, quoted verbatim:** *"**Gold authorities use immutable corpus IDs for a named
evaluation CorpusRelease.** When an official source changes, a formal dataset migration links old/new
gold; past reports stay reproducible."*

**PRD §14.1's subject scope for this category** comes from §6.2: *"Fair Work Act, regulations and
National Employment Standards"*, plus the Commonwealth material this category anchors — and PRD §6.6
requires point-in-time support for **2026–27, 2025–26 and 2024–25**.

**PRD §14.3, binding on the blind third of this ticket:** *"**Blind gold answers MUST remain outside
ordinary coding-agent context.**"* PRD §45.1 item 6: *"Never expose blind evaluation gold data … to
coding agents."* Consequently this ticket authors **48 development + 16 validation cases in plaintext**
and delivers its **16 blind slots through `GOLD-01`'s sealed channel** — sealing requires only the
committed public key, so the slots can be produced without any Builder ever holding the key that opens
them (`GOLD-01` deliverable 13).

**Plan §8 Q6 (confirmed) — the division of labour for the blind third.** Blind case content and gold
answers are authored by dedicated `evaluation-author` agents in an isolated session/workspace
**outside this repository**, and are checked by an independent `evaluation-reviewer` agent against
official sources before encryption; no lawyer or employed domain expert is engaged, and the Founder
performs a risk-based spot check of typically 12–20 of the 120 blind cases across all ten categories.
Blind plaintext never enters this ticket's scope: it is never committed to git, copied into ordinary
fixtures, pasted into an implementation agent's session, or exposed to ordinary CI. **This ticket
delivers the visible development and validation cases and the 16 sealed blind *slots*** — envelope,
manifest digest and allowlisted sidecar — and nothing else about the blind third. That division is
settled, not an open Founder question.

**PRD §43.4, quoted verbatim — the rule that governs every later edit:** *"Agents may not 'fix' a
failing gold case by changing expected output without a versioned founder-approved reason."*

**Requirement.** `EVAL-001` (PRD §30.2): *"Dataset contains 360 development, 120 validation and 120
protected blind cases … Split integrity/no-overlap test passes."* This ticket contributes exactly
48/16/16 of that total; PRD §43.1's counts are exact, not minima.

**What is already decided elsewhere and must not be re-decided here.** `GOLD-01` owns the case schema,
the id rules (`EVAL-FED-###`), the stratification schema, the dataset-version registry, the seal and the
checker. `SLEG-02` owns the `LEG-CTH` adapter and, per PRD §40.8 item 11 and its own sub-PRD **L8**,
declares `evaluation_subset_ref` ids in `pipelines/adapters/leg-cth/registry.yaml` that this category
must satisfy — `INGF-07`'s example is literally `EVAL-FED-001`. `GOLD-16` reconciles those references;
`GOLD-02`/`GOLD-03` score and gate.

**Sub-PRD decisions carried forward:** **D1**–**D3** (sealed blind, key never held here, sidecar
allowlist), **D5** (`EVAL-FED-###`), **D6** (fields mandatory), **D7** (two-mode gold resolution),
**D8** (versioned corrections), **D18** (synthetic only — invented employers, no real PII).

**Accepted caveats carried forward:**

- **A pinned evaluation CorpusRelease may not exist yet** (sub-PRD **Q-GOLD-D**). Gold ids are authored
  against the release available at authoring time and recorded in the category manifest; `GOLD-01`'s
  `GOLD_RESOLVES` check reports `UNRESOLVED` without a release and becomes blocking at `GOLD-17`.
- **Case *content quality* is a human judgement.** The checker proves counts, schema, stratification and
  seal integrity; whether a trap is a real legal trap is founder/reviewer work (PRD §43.4). Both classes
  appear in the acceptance list.

## Goal

Author the `federal-core` evaluation category: exactly **80** cases — 48 development, 16 validation
(both plaintext) and 16 blind (sealed) — each validating against `GOLD-01`'s schema with every PRD §14.1
field present, each grounded in `LEG-CTH` corpus ids for Fair Work Act/regulations/NES material across
the PRD §6.6 three financial years, together with the category's machine-checkable
`stratification.yaml` and its registration in the dataset-version registry. Completion is mechanically
checkable: `uv run python -m evaluation.dataset verify --category federal-core` passes with counts
exactly 48/16/16, no id or near-duplicate overlap between splits, every declared floor met, every blind
slot sealed with a matching digest and an allowlisted sidecar, and every `evaluation_subset_ref` id that
`leg-cth`'s registry names existing in this category.

## Non-goals

- **No other category's cases** — `GOLD-06` … `GOLD-14` own the other nine directories.
- **No schema, id rules, split index, seal implementation or checker** — `GOLD-01` (merged; blocker).
  This ticket writes data, not tooling.
- **No metrics, thresholds, gates, judge or reports** — `GOLD-02`, `GOLD-03`, `GOLD-04`, `GOLD-17`.
- **No adapter, registry row, licence assessment or corpus build** — `SLEG-02` (merged; blocker),
  `INGF-07`, `CRPS-06`. This ticket reads corpus ids; it never writes `pipelines/**`.
- **No blind gold plaintext in the repository, in a diff, in an issue, in a PR body or in an agent
  transcript** — PRD §14.3, §45.1 item 6. Blind slots exist only as sealed envelopes plus sidecars.
- **No blind case authoring, review or decryption** — plan §8 **Q6** (confirmed) puts authoring with the
  `evaluation-author` agents outside this repository, per-case review with the independent
  `evaluation-reviewer` agent, and opening with the Founder alone. This ticket delivers sealed slots.
- **No product fix.** If a case exposes a defect, the fix belongs to the owning module's ticket; this
  ticket never adjusts a case to make the product pass (PRD §43.4).

## File-scope (write-owns)

Owned by this ticket:

- `evals/cases/federal-core/**` — `stratification.yaml`, `development/*.yaml`, `validation/*.yaml`,
  `blind/*.sidecar.yaml`, `manifest.yaml`
- `evals/gold/federal-core/**` — `development/*.yaml`, `validation/*.yaml`,
  `blind/*.sealed` + `blind/manifest.json`

Does not touch:

- The other nine category directories under `evals/cases/**` and `evals/gold/**` — `GOLD-06` …
  `GOLD-14`.
- `evals/splits/**`, `schemas/evaluation/**`, `pipelines/evaluation/**` — `GOLD-01` … `GOLD-04`,
  `GOLD-15`, `GOLD-16`. Dataset-version entries are created **through `GOLD-01`'s CLI**, never by
  hand-editing `evals/splits/**`.
- `evals/reports/**` — `GOLD-03`; `evals/reports/release-candidate/**` — `GOLD-17`.
- `pipelines/adapters/**`, `pipelines/ingestion/**`, `pipelines/corpus-builder/**` — `05`–`10`, `04`.
- `apps/**`, `packages/**`, `services/**`, `infra/**`, `tests/**`, `.github/workflows/**` — other
  modules per plan §4. `docs/PRD.md`, `.claude/**` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). This ticket's two directories are named after its category and are written by no other ticket
(plan §5.22). Its nine concurrent siblings (`GOLD-06` … `GOLD-14`) each own a differently-named category
directory, which is why the wave is safe — PRD §44.3 names *"individual evaluation categories"* as a
canonical safe parallel work unit, alongside individual source adapters. The one file all ten would
otherwise have shared, a central split index, does not exist: splits are **composed** from per-category
files (sub-PRD **D4**). `GOLD-02` (`src/runner/**`) and `GOLD-16` (`src/coverage/**`) run concurrently in
disjoint trees. Both declared blockers land first: `GOLD-01` (module wave 1) and `SLEG-02`
(`06-sources-legislation` wave 2). No shared append-only file — this ticket adds no dependency.

## Deliverables

1. **`evals/cases/federal-core/stratification.yaml`** — the category's machine-checkable contract
   (`GOLD-01` deliverable 3): counts `development: 48`, `validation: 16`, `blind: 16`; product-surface
   floors `ASK ≥ 40`, `SEARCH ≥ 3`, `MONITOR ≥ 3` (sub-PRD cross-cutting table); answer-status floors
   `SUPPORTED ≥ 2`, `CONDITIONAL ≥ 2` per split; legal-date coverage across the PRD §6.6 three financial
   years with ≥ 6 cases whose `legal_as_at` falls in each of 2024–25, 2025–26 and 2026–27; required
   trap types (deliverable 4). The checker enforces this file; the file is the ticket's own claim made
   testable.
2. **48 development cases** in `evals/cases/federal-core/development/` — one YAML per case, id
   `EVAL-FED-001` … (contiguous, never reused), each with every PRD §14.1/§43.2 field. Subject coverage,
   from PRD §6.2 and §43.1 row 1: NES entitlements (leave, hours, notice, redundancy, casual conversion,
   flexible work requests), employment status and the statutory definitions, general protections,
   unfair-dismissal eligibility and thresholds, small-business rules, termination and notice, record
   keeping and pay-slip obligations, and the Fair Work Regulations where they carry operative effect.
3. **16 validation cases** in `evals/cases/federal-core/validation/` — same schema and rigour, authored
   to be *independent* of the development set: no shared scenario, no paraphrase of a development
   question (`GOLD-01`'s `NO_NEAR_DUPLICATES` check compares across splits, because a validation set
   that echoes development measures nothing).
4. **Trap coverage** — every case declares `trap_types`, and the category must include at least: a
   provision amended within the three-year window where the answer differs by `legal_as_at`; a
   provision that appears to apply but is displaced by a more specific instrument (PRD §9.1
   *"specific-versus-general rules"*); a case where regulator guidance conflicts with the Act and must
   not override it (PRD §9.1 *"Guidance MUST NOT silently override legislation"*); a case whose decisive
   fact is absent and must produce clarification rather than an assumption (PRD §30.2 `ANS-001`); and a
   case whose correct answer is `CONDITIONAL` because a branch depends on an unknown fact (PRD §36.8).
5. **Gold authorities** in `evals/gold/federal-core/{development,validation}/` — one gold file per case:
   `gold_authorities[{document_id, version_id, node_id, citation_role, required}]` with **immutable
   corpus ids** from the pinned evaluation release (PRD §43.2), `required: true` for the nodes recall@10
   must find and `required: false` for additionally acceptable authorities (this is what makes
   `GOLD-02`'s citation-precision denominator fair without loosening the metric), plus
   `required_claims`, `optional_claims`, `prohibited_claims` and the expected citation role per
   authority. Pinpoint offsets are recorded where the claim depends on a specific passage (PRD §15.3).
6. **16 blind slots, sealed** — for each blind case: `evals/gold/federal-core/blind/<id>.sealed`
   (envelope produced by `GOLD-01`'s `seal`, which needs only `evals/splits/blind-recipient.pub`),
   `evals/gold/federal-core/blind/manifest.json` (per-file digest, count, dataset version), and
   `evals/cases/federal-core/blind/<id>.sidecar.yaml` carrying **only** the allowlisted fields
   (`GOLD-01` deliverable 4). The plaintext used for sealing is authored **outside this repository** by
   the `evaluation-author` agents and checked by the independent `evaluation-reviewer` agent before
   encryption (plan §8 **Q6**, confirmed); it is **never committed, pasted, summarised or quoted**
   anywhere, and the git-ignored working directory (`evals/.gitignore`, `GOLD-01` deliverable 15) is a
   backstop rather than the control. This ticket's obligation is that the slots exist, are sealed, are
   counted and are stratified.
7. **`evals/cases/federal-core/manifest.yaml`** — the category descriptor: primary category, code `FED`,
   directory, counts, the pinned `corpus_release_id` used for gold resolution, the `dataset_version`
   this content was registered under, and the list of `evaluation_subset_ref` ids this category
   satisfies.
8. **Adapter reciprocity** — read `evaluation_subset_ref` from `pipelines/adapters/leg-cth/registry.yaml`
   (`INGF-07` deliverable 1) and ensure every id it names in the `FED` range exists here with matching
   subject matter. An id naming another category is reported for `GOLD-16` rather than created here.
   Basis: PRD §40.8 item 11; `SLEG-02` acceptance ("*resolve against `evals/cases/**` when it exists*").
9. **Dataset registration** — register all 80 cases through `GOLD-01`'s CLI (`version new --reason …
   --approved-by …`), producing content hashes for the plaintext cases and envelope digests for the
   blind ones, so every later edit is a **versioned** correction (PRD §14.3, §43.4).
10. **`evals/cases/federal-core/README.md`** — what the category covers, the trap inventory, the
    authoring conventions (synthetic employers, invented ABNs, no real PII per sub-PRD **D18**), and the
    sentence that blind material is sealed and must never be opened, pasted or summarised in this
    repository.

## Acceptance checklist (classified)

- [ ] `[machine]` **Counts are exactly 48 / 16 / 16 = 80** and match PRD §43.1 row 1 —
      `verify --category federal-core` fails on 47 or 49. (PRD §43.1; `EVAL-001`)
- [ ] `[machine]` **Every case validates** against `GOLD-01`'s schema with all PRD §14.1 fields present;
      an unknown field fails. (PRD §14.1, §43.2; sub-PRD D6)
- [ ] `[machine]` **No overlap**: no id in two splits, no near-duplicate question/scenario hash across
      splits, ids contiguous in the `EVAL-FED-###` range and never reused. (PRD §30.2 `EVAL-001`;
      sub-PRD D5)
- [ ] `[machine]` **Stratification holds**: the declared surface, status, trap and financial-year floors
      in `stratification.yaml` are met per split. (PRD §43.1; §14.1)
- [ ] `[machine]` **Gold shape**: every case has ≥ 1 `required: true` gold authority with a permitted
      `citation_role`; pinpoint offsets are present where a claim depends on a passage. (PRD §43.2,
      §15.3)
- [ ] `[machine]` **Gold resolves against the pinned release** when one is supplied
      (`verify --category federal-core --release <path>`); without one the result is `UNRESOLVED` and the
      command exits non-zero — never a silent pass. (PRD §43.2, §40.9; sub-PRD D7)
- [ ] `[machine]` **Blind integrity without decryption**: 16 sealed envelopes, 16 sidecars, digests
      match `manifest.json`, every sidecar carries only allowlisted fields, and `guard-blind` finds no
      blind plaintext anywhere in the tree. (PRD §14.3, §43.1; sub-PRD D1–D3)
- [ ] `[machine]` **No key is needed to deliver this ticket**: sealing uses only
      `evals/splits/blind-recipient.pub`; no private key appears in the diff, and `git log -p` for this
      branch contains no blind plaintext. (PRD §45.1 item 6; sub-PRD D2)
- [ ] `[machine]` **Adapter reciprocity**: every `EVAL-FED-###` id referenced by
      `pipelines/adapters/leg-cth/registry.yaml` exists in this category. (PRD §40.8 item 11; `SLEG-02`)
- [ ] `[machine]` **Synthetic only**: no real person name, contact detail, TFN, bank detail or payroll
      identifier appears in any case; employers and ABNs are invented and flagged. (PRD §14.1
      *"synthetic"*; §10.1; sub-PRD D18)
- [ ] `[machine]` **Registered dataset version**: all 80 cases appear in the dataset-version registry with
      content hashes/envelope digests, `change_reason` and `approved_by`. (PRD §14.3; §43.4)
- [ ] `[machine]` `uv run pytest` green (standing item, PRD §45.3) — the dataset checker runs over this
      category as part of the suite.
- [ ] `[machine]` `pnpm test` green — unaffected; this ticket writes no code. `cargo test --workspace`
      unaffected. (PRD §45.3)
- [ ] `[human]` **Case-quality review**: a founder/reviewer confirms the development and validation cases
      are legally realistic, that each declared trap is a genuine trap rather than a wording puzzle, that
      the expected answer status is the one PRD §36.8 requires, and that no case rewards a shortcut the
      product should not take. Plan §1.1 maps case-quality judgement to `[human]`. (PRD §43.4)
- [ ] `[human]` **Blind third**: the Founder confirms the 16 sealed slots were produced under plan §8
      **Q6**'s confirmed path — `evaluation-author` agents outside this repository, independent
      `evaluation-reviewer` check against official sources before encryption — and applies the
      risk-based spot check where this category is sampled (typically 12–20 across the whole 120
      blind cases). Recorded in the ADR `GOLD-01` authors. (PRD §14.3; plan §8 **Q6**)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs (**EVAL-001**), user-visible change and
      non-goals, schema compatibility impact (data only, against `GOLD-01`'s schema), **tenant/PII/security
      impact** (synthetic content; blind sealed; no key in the diff), **source/licence impact** (gold cites
      official `LEG-CTH` nodes; no source text is reproduced beyond pinpoint offsets and permitted
      quotes), cost/latency impact (adds 80 cases to a full run), rollback path (dataset version),
      known gaps (**Q-GOLD-D** if gold is unresolved).

Absent classes: no `[fixture]` criteria — no recorded evaluation run exists to replay at this point in
the DAG (`GOLD-02` is not a blocker of this ticket); the first replay of these cases is `GOLD-17`'s
release-candidate run.

## Test plan

Every `[machine]` step runs offline and **without the blind seal key**. The Reviewer never decrypts
anything.

1. **Verify the category.** `uv sync --frozen`; then
   `uv run python -m evaluation.dataset verify --category federal-core --format json`. Assert exit 0 (or
   the expected `UNRESOLVED` exit when no release is supplied) and read the JSON findings.
2. **Counts against the PRD.** Compare the reported counts with PRD §43.1 row 1: 48 / 16 / 16 / 80.
3. **Read the plaintext cases.** The 48 development and 16 validation cases are **not** blind and may be
   read freely: spot-check ten of them against the schema fields, confirm the `legal_as_at` values span
   the PRD §6.6 three financial years, and confirm each `trap_types` entry is reflected in the scenario.
4. **Verify the blind third without reading it.** Run `uv run python -m evaluation.dataset guard-blind`
   and confirm: 16 envelopes, 16 sidecars, digest match, allowlisted sidecar fields only, no plaintext.
   Then confirm by inspection that `evals/gold/federal-core/blind/*.sealed` is opaque ciphertext and
   that no sidecar contains a `question`, `anonymous_scenario`, `gold_authorities` or claim field.
   **This is the whole blind review a Reviewer performs — do not request, decrypt or accept a plaintext
   copy** (PRD §14.3, §45.1 item 6).
5. **Overlap checks.** Assert `SPLIT_DISJOINT` and `NO_NEAR_DUPLICATES` pass; then, on a scratch copy,
   duplicate one development question into validation and confirm the checker fails — the check is real,
   not decorative.
6. **Gold resolution.** Run `verify --category federal-core --release <fixture-or-pinned-release>`;
   assert every `required: true` authority resolves. Corrupt one `node_id` on a scratch copy and confirm
   `GOLD_RESOLVES` fails.
7. **Adapter reciprocity.** Grep `pipelines/adapters/leg-cth/registry.yaml` for `evaluation_subset_ref`
   and confirm every `FED` id it names exists under `evals/cases/federal-core/`.
8. **Synthetic-content scan.** Run the checker's PII/realness scan; independently grep for `@`,
   `tel:`, nine-digit TFN-shaped strings and any ABN not on the category's invented list.
9. **Version registry.** Confirm all 80 ids appear in the dataset-version registry with hashes and a
   `change_reason`; edit one case on a scratch copy and confirm `VERSIONED_CORRECTIONS` fails without a
   new version.
10. **Suite.** `uv run pytest` from the repository root.
11. **Reviewer focus.** Confirm the validation set is genuinely independent of development (this is the
    most common silent defect); confirm gold `required: true` sets are minimal and correct rather than
    exhaustive-and-hopeful; confirm no case's expected output looks reverse-engineered from an
    implementation; confirm nothing in the diff, PR body or commit messages contains blind content.

## Feedback obligation

1. **General rule.** If authoring falsifies this ticket, update **this ticket** (docs PR → merge →
   `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/21-evaluation-600/README.md` (version +0.1 with a changelog line) **before** changing data.
   Every later change to a delivered case is a **versioned dataset correction** with a reason and an
   approver — PRD §14.3: *"Formal dataset corrections create a new version and reason; they are not
   edited invisibly."*
2. **Foreseeable frictions, each with its exact writeback target:**
   - *The corpus cannot supply enough distinct `LEG-CTH` material for 80 non-overlapping cases* → do
     **not** pad with paraphrases and do **not** reduce the count (PRD §43.1's numbers are exact).
     Record the shortfall in `docs/prd/21-evaluation-600/README.md`, and route it to `GOLD-16`'s coverage
     reconciliation and the Founder: a category that cannot be populated is a **corpus coverage**
     finding under PRD §7/§44.4, not a dataset design choice.
   - *A gold authority stops resolving because the official source changed* → PRD §43.2 requires a
     **formal dataset migration** linking old→new gold with a reason, created through `GOLD-01`'s
     `migrate` command so past reports stay reproducible. Never silently repoint a gold id.
   - *A case fails once the product runs it* → classify it in the PRD §43.4 vocabulary and route it to
     the owning module's ticket. **Never** change `expected_answer_status`, `required_claims` or gold to
     make the product pass: PRD §43.4 forbids it without a versioned founder-approved reason, and a case
     edited to match a defect converts a failing gate into a passing one.
   - *The stratification floors cannot all be met inside 80 cases* → adjust the **floors in
     `stratification.yaml`**, record the change and its reason in
     `docs/prd/21-evaluation-600/README.md`'s cross-cutting table, and check the global invariant with
     `GOLD-17` — never drop a PRD §14.1 subject from the dataset.
   - *An `evaluation_subset_ref` id from `leg-cth` belongs to another category* → report it to `GOLD-16`
     and raise a docs PR against `SLEG-02`'s registry row; do not create a mis-categorised case here.
3. **Falsified protocol.** **If any part of this work appears to require reading, writing, quoting or
   summarising blind case content or gold answers in ordinary context, the task is wrong.** That
   overturns PRD §14.3 and §45.1 item 6 — a product-level safety rule. Stop, escalate to the Founder
   (plan §8 **Q6**), and write back to `docs/prd/21-evaluation-600/README.md` and
   `docs/prd/breakdown-plan.md` **R9** before continuing. Equally: if the 48/16/16 allocation itself
   proves wrong, that is a **PRD** change under PRD §45.5 requiring Founder approval — never a local
   adjustment to make a checker pass.
