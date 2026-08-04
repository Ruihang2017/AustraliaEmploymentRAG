---
id: GOLD-01
title: "Case schema, splits, integrity and blind protection"
module: 21-evaluation-600
lane: 21-evaluation-600
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-03, CRPS-02]
blocks: [GOLD-02, GOLD-05, GOLD-06, GOLD-07, GOLD-08, GOLD-09, GOLD-10, GOLD-11, GOLD-12, GOLD-13, GOLD-14]
---

# GOLD-01 — Case schema, splits, integrity and blind protection

Implements PRD §14.1, §43.2 and §45.1 — requirement **EVAL-001**; epic `E31-EVAL-600`.
No ADR gates this ticket — the decision is already made in PRD §14.1 (the 360/120/120 split), §43.2
(the case schema) and §14.3 (blind gold stays outside ordinary coding-agent context), and breakdown
plan §8 **Q6** (status: **CONFIRMED**) settles the blind authoring, isolation, sealing and key-custody
mechanism; this is build ticket 1 of 17 against them. This ticket carries the **ADR decision input**
for §8 Q6 (deliverable 17) and **creates** `docs/adr/NNNN-blind-gold-sealing.md` to record it (plan
**A9**, PRD §45.5 "Architecture decision"). **No ADR exists yet — `docs/adr/` is empty, and the
Builder authors this one at implementation time.**
Parent sub-PRD: [21-evaluation-600 README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-03 — Canonical enums and opaque ID conventions](../../00-foundation/tickets/FND-03-canonical-enums-and-opaque-id-conventions.md), [CRPS-02 — CorpusRelease manifest schema, signing and verification](../../04-corpus-contract/tickets/CRPS-02-corpusrelease-manifest-schema-signing-and-verification.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §43.2 already lists the case fields and PRD §43.1 already fixes the counts; this makes them
machine-checkable.

## Background + basis

**PRD §14.1 dataset, quoted verbatim — the requirement this ticket makes checkable:**

> The MVP MUST use 600 stratified synthetic cases derived from official source nodes:
>
> - 360 development;
> - 120 validation;
> - 120 blind test.
>
> Cases MUST cover federal law, modern awards/classification, enterprise agreements, all
> states/territories, payroll-related obligations, WHS/OHS, workers compensation,
> discrimination/privacy/surveillance, case treatment, future/historical time traps, insufficient
> evidence, conflicts, PII, malicious avoidance, Search, Compare, Coverage and Monitor behaviour.
>
> **Each case SHOULD include scenario, question, legal date, jurisdictions, expected answer status,
> required facts, prohibited assumptions, trap types, gold DocumentVersion/NodeVersion authorities,
> required/optional/prohibited claims and expected citation roles.**

**PRD §43.2 evaluation case schema, quoted verbatim — the field list this ticket encodes:**

> Each versioned YAML/JSON case includes:
>
> ```text
> id, dataset_version, split, primary_category, tags
> product_surface, mode, anonymous_scenario, question
> legal_as_at, jurisdictions, input_structured_fields
> expected_answer_status, acceptable_statuses
> required_facts, prohibited_assumptions, trap_types
> gold_authorities[{document_id, version_id, node_id, citation_role, required}]
> required_claims[], optional_claims[], prohibited_claims[]
> expected_clarifications[], expected_refusal_reason
> licensing/freshness/source preconditions
> latency_class, cost_class, author/reviewer, change_reason
> ```
>
> **Gold authorities use immutable corpus IDs for a named evaluation CorpusRelease. When an official
> source changes, a formal dataset migration links old/new gold; past reports stay reproducible.**

**PRD §43.1 allocation, transcribed — frozen data for this ticket:**

| Primary category | Development | Validation | Blind | Total |
|---|---:|---:|---:|---:|
| Federal Fair Work/NES/core employment law | 48 | 16 | 16 | 80 |
| Modern awards, coverage and classification | 54 | 18 | 18 | 90 |
| Enterprise agreements and lifecycle | 42 | 14 | 14 | 70 |
| PAYG/STP/super/FBT and eight payroll-tax regimes | 42 | 14 | 14 | 70 |
| State/territory employment and industrial law (eight jurisdictions) | 38 | 13 | 13 | 64 |
| WHS/OHS and workers compensation (eight jurisdictions) | 38 | 13 | 13 | 64 |
| Discrimination, privacy/surveillance, labour hire, LSL, migration, child/public-sector/whistleblowing | 36 | 12 | 12 | 60 |
| Case authority, appeal and treatment | 24 | 8 | 8 | 40 |
| Historical, future, commencement and transitional traps | 18 | 6 | 6 | 30 |
| Insufficient/conflicting evidence, PII, evasion and out-of-scope | 20 | 6 | 6 | 32 |
| **Total** | **360** | **120** | **120** | **600** |

> At least eight primary cases in each applicable nationwide category must cover each state/territory;
> cross-tags ensure every product surface and answer status is represented. **The blind case
> content/gold data is inaccessible to ordinary coding-agent context.**

**The three sentences that make blind protection a mechanism, not a policy:**

> PRD §14.3: *"**Blind gold answers MUST remain outside ordinary coding-agent context.**"*
> PRD §45.1 item 6: *"**Never expose blind evaluation gold data**, production credentials or customer
> content to coding agents."*
> PRD §45.2, `tests` row, "Must not own": *"Blind gold exposed to normal fixtures."*

Breakdown plan **R9** states the failure mode this ticket must close: *"The same tree holds 480 visible
and 120 blind cases, and wave B authors both. … `GOLD-01` must make the split mechanically enforceable
(Q6). Until it does, no ticket may reference `evals/gold/**` blind paths."*

**Breakdown plan §8 Q6 — blind case authoring, isolation and key custody. Status: CONFIRMED.** This is
settled. It must not be re-litigated here, substituted by a local preference, or treated as a
suggestion; a Builder that believes the code falsifies it uses the feedback obligation below. The
dataset stays 600 synthetic cases — 360 development, 120 validation, 120 protected blind — and the
blind 120 are produced as follows.

1. Blind material is authored by dedicated `evaluation-author` agents working in an isolated
   session/workspace. They are **not** the ordinary implementation agents.
2. They may receive the evaluation schema, the stratification requirements, official source material
   and the case-authoring rubric. They must **not** receive ordinary coding-agent context that would
   let the product implementation be tuned against the blind questions.
3. An independent `evaluation-reviewer` agent checks every blind case against official sources
   **before** encryption. No lawyer, tax specialist or employed employment-law/domain expert is
   engaged. The Founder performs a small risk-based spot check only — typically 12–20 of the 120 — and
   is neither the author nor the per-case reviewer.
4. Blind plaintext is created in an isolated private directory **outside the repository**. It is never
   committed to git, copied into ordinary fixtures, pasted into an implementation agent's session, or
   exposed to ordinary CI.
5. After authoring and review, material is encrypted with PyNaCl/libsodium `SealedBox` — X25519 +
   XSalsa20-Poly1305, i.e. `crypto_box_seal`. The **public** key may be committed to the repository so
   an authorised evaluation-authoring agent can encrypt without holding the private key.
6. The **Founder is the sole custodian of the private key.** It lives in the Founder's password
   manager or equivalent offline encrypted storage with one encrypted recovery copy, and never in git,
   CI, ordinary environment configuration or any agent environment. Each blind-dataset major version
   uses its own key pair; suspected compromise forces immediate rotation.
7. **Only the Founder may start a blind evaluation stage** that requires decrypting blind material.
   The local release-evaluation flow receives the private-key file path through `EVAL_BLIND_KEY_FILE`:
   **no default path, no in-repository lookup and no keyring fallback.**
8. Blind run output is restricted to content-free metrics, category summaries and case IDs; questions,
   answers, gold claims and source excerpts must never reach a report or a log. If a blind run fails,
   implementation agents debug using development/validation cases and category-level blind metrics
   only — blind content is never revealed merely to make a fix convenient.

Items 4–8 are what this ticket implements mechanically (deliverables 8, 12–15). Items 1–3 happen
outside this repository and are never this ticket's, or any Builder's, work.

**PRD §14.3, the correction rule:** *"Formal dataset corrections create a new version and reason; they
are not edited invisibly."* PRD §43.4: *"Agents may not 'fix' a failing gold case by changing expected
output without a versioned founder-approved reason."*

**Requirement.** `EVAL-001` (PRD §30.2): *"Dataset contains 360 development, 120 validation and 120
protected blind cases … **Split integrity/no-overlap test passes**."*

**What is already decided elsewhere and must not be re-decided here.** `FND-03` owns the canonical
enums and opaque-ID conventions (jurisdiction codes, `AnswerStatus`, `CitationRole`, legal-status
values) — the case schema **references** them and must not restate them. `CRPS-02` owns the
CorpusRelease manifest schema, signing and `verify_bundle()` — the dataset pins a release id and
verifies through `CRPS-02`, never by reimplementation. `CRPS-01` owns `document_version_id` /
`node_version_id` identity.

**Sub-PRD decisions carried forward:** **D1**–**D3** (sealed blind material, key never in repo/CI,
non-revealing sidecar), **D4** (splits composed, not centrally listed), **D5** (case ids), **D6**
(§14.1 fields are mandatory here), **D7** (two-mode gold resolution), **D8** (versioned corrections),
**D17** (Python + YAML/JSON), **D18** (synthetic only), **D19** (test layout), **D20** (content-free
blind output), **D21** (blind authoring, isolation and independent review, all outside this
repository), **D22** (sealing construction, sole Founder custody, rotation and run authority).

**Accepted caveats carried forward:**

- **Blind authoring happens outside this repository (plan §8 **Q6**, confirmed).** Sealing therefore
  uses a **public recipient key**: an authorised `evaluation-author` agent can seal, and only the
  Founder can open. That is why no Builder — authoring or otherwise — ever needs, or gets, the private
  key.
- **No corpus release necessarily exists yet.** Plan §5.22 draws no edge from the authoring tickets to
  `CRPS-06`, so gold-authority resolution is two-mode (**D7**), and "unresolved" is reported, never
  silently passed. Sub-PRD **Q-GOLD-D**.
- **File-scope extends plan §5.22's column.** The plan lists `schemas/evaluation/**` and
  `evals/splits/**`; a split-integrity *test* needs code, so this ticket also owns
  `pipelines/evaluation/src/dataset/**` and `pipelines/evaluation/tests/dataset/**` — inside the
  module's plan §4 row, disjoint from every sibling. Recorded in the sub-PRD changelog.

## Goal

Produce the dataset contract and its enforcement: the PRD §43.2 case schema (with PRD §14.1's fields
mandatory), the frozen PRD §43.1 allocation, the case-id rules, the dataset-version registry and
migration format, and a Python `evaluation.dataset` package providing a composer, an integrity checker
and a **blind seal/guard** whose control is mechanical — blind case content and gold exist in the
repository only as ciphertext sealed to a public recipient key whose private half is never in the
repository, CI, or any agent environment. Completion is mechanically checkable: `uv run pytest
pipelines/evaluation/tests/dataset` is green, `uv run python -m evaluation.dataset verify --complete`
reproduces the §43.1 table exactly over fixture categories, and the blind guard fails the build if any
blind plaintext, unsealed blind file, digest mismatch or non-allowlisted sidecar field appears
anywhere in the tree.

## Non-goals

- **No evaluation cases, gold answers or category directories** — `GOLD-05` … `GOLD-14` own
  `evals/{cases,gold}/<category>/**`. This ticket ships only synthetic *fixture* categories under its
  own test tree.
- **No runner, metrics, judge, gates or reports** — `GOLD-02` (`src/runner/**`), `GOLD-03`
  (`src/gates/**`, `evals/reports/**`), `GOLD-04` (`src/judge/**`). This ticket defines the types they
  consume; it computes no §43.3 metric.
- **No corpus release build, signing or verification implementation** — `04-corpus-contract`
  (`CRPS-02`, `CRPS-06`). Verification is delegated to `CRPS-02`'s verifier.
- **No canonical enums or ID conventions** — `00-foundation` (`FND-03`, plan §4.1 serial-owned).
  Referenced, never restated.
- **No CI workflow, schedule or root script** — `00-foundation` (`FND-01`, `FND-02`). See sub-PRD
  **Q-GOLD-B**/**Q-GOLD-E**.
- **No blind case authoring, review, decryption or spot-checking** — plan §8 **Q6** (confirmed) puts
  authoring with the `evaluation-author` agents outside this repository, per-case review with the
  independent `evaluation-reviewer` agent, and the risk-based spot check with the Founder. This ticket
  ships the mechanism and never authors, opens, reads or summarises a blind case.
- **No execution of key generation, storage or rotation** — those are the Founder's custodial acts
  under plan §8 **Q6** (sub-PRD **D22**). This ticket consumes the committed public key, implements the
  `EVAL_BLIND_KEY_FILE` contract, and records the custody rules it depends on in the ADR.

## File-scope (write-owns)

Owned by this ticket:

- `schemas/evaluation/**`
- `evals/splits/**`
- `evals/.gitignore` (module-level ignore for unsealed blind working directories; the only file this
  ticket writes at the `evals/` root)
- `pipelines/evaluation/src/dataset/**`, `pipelines/evaluation/tests/dataset/**` (sub-PRD **D19**)
- `docs/adr/NNNN-blind-gold-sealing.md` — new file, claimed by creation (plan **A9**)
- `pipelines/evaluation/pyproject.toml` — **append-only**, own dependencies and the
  `evaluation.dataset` entry point only

Does not touch:

- `evals/cases/**`, `evals/gold/**` — `GOLD-05` … `GOLD-14`. `evals/reports/**` — `GOLD-03`;
  `evals/reports/release-candidate/**` — `GOLD-17`.
- `pipelines/evaluation/src/{runner,gates,judge,promotion,coverage}/**` — `GOLD-02`, `GOLD-03`,
  `GOLD-04`, `GOLD-15`, `GOLD-16`.
- `packages/contracts/**`, `schemas/openapi/**`, `schemas/events/**`, root manifests and lockfiles,
  `.github/workflows/**` — `00-foundation` (plan §4.1 serial-owned); consumed, never written.
- `schemas/corpus-manifest/**`, `pipelines/corpus-builder/**` — `04-corpus-contract`.
  `pipelines/ingestion/**`, `pipelines/adapters/**` — `05`–`10`.
- `apps/**`, `packages/**`, `services/**`, `infra/**`, `tests/**` — other modules per plan §4.
  `docs/PRD.md`, `.claude/**`, `templates/**` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). `schemas/evaluation/**` and `evals/splits/**` are written by no other ticket in the plan (plan
§5.22), and `pipelines/evaluation/src/dataset/**` is claimed here for the first time — every sibling
`pipelines/evaluation` ticket owns a differently-named area (`runner`, `gates`, `judge`, `promotion`,
`coverage`). This is a module wave-1 ticket; its only concurrent sibling is `GOLD-16`
(`src/coverage/**`), a disjoint tree. Ten of its dependents (`GOLD-05` … `GOLD-14`) are `blocked_by`
this ticket and therefore never concurrent with it; they own ten disjoint category directories, which
PRD §44.3 names as a canonical safe parallel unit (*"individual evaluation categories"*). Both declared
blockers land first: `FND-03` (`00-foundation` wave 2) and `CRPS-02` (`04-corpus-contract` wave 2).
Shared append-only file: `pipelines/evaluation/pyproject.toml`.

## Deliverables

1. **`schemas/evaluation/case.schema.json`** — JSON Schema (draft 2020-12) for one case, containing
   **every** PRD §43.2 field name verbatim, with these required (**D6**, PRD §14.1): `id`,
   `dataset_version`, `split`, `primary_category`, `tags`, `product_surface`, `mode`,
   `anonymous_scenario`, `question`, `legal_as_at`, `jurisdictions`, `expected_answer_status`,
   `acceptable_statuses`, `required_facts`, `prohibited_assumptions`, `trap_types`, `gold_authorities`,
   `required_claims`, `optional_claims`, `prohibited_claims`, `latency_class`, `cost_class`, `author`,
   `reviewer`, `change_reason`. Optional-by-nature: `input_structured_fields`,
   `expected_clarifications`, `expected_refusal_reason`, `preconditions` (licensing/freshness/source).
   Constraints: `split ∈ {DEVELOPMENT, VALIDATION, BLIND}`; `legal_as_at` is `YYYY-MM-DD` (PRD §35.1);
   `jurisdictions` from `FND-03`'s jurisdiction enum; `expected_answer_status` and
   `acceptable_statuses` from `FND-03`'s answer-status values (PRD §36.8);
   `gold_authorities[].citation_role` from `FND-03`'s `CitationRole` (PRD §15.5); `additionalProperties:
   false` at every level, so an unknown field is a validation failure rather than silent data.
2. **`schemas/evaluation/gold-authority.schema.json`** — `{document_id, version_id, node_id,
   citation_role, required}` exactly as PRD §43.2 writes it, with id patterns taken from `FND-03`'s
   opaque-ID conventions and `CRPS-01`'s corpus identity; plus `quote_start`/`quote_end` optional
   pinpoints (PRD §15.3: *"Citations MUST target DocumentVersion + NodeVersion + exact offsets"*).
3. **`schemas/evaluation/stratification.schema.json`** — a category's declared, machine-checkable
   contract: per-split counts, per-jurisdiction floors, per-product-surface floors, per-answer-status
   floors, required trap types. Each authoring ticket ships one; this schema is what makes their
   claims verifiable without reading their content.
4. **`schemas/evaluation/blind-envelope.schema.json`** and
   **`schemas/evaluation/blind-sidecar.schema.json`** — the sealed-envelope descriptor (algorithm,
   recipient key id, ciphertext digest, byte length, sealed-at, sealer) and the **allowlisted** sidecar
   (**D3**): `id`, `split` (`BLIND`), `primary_category`, `tags`, `trap_types`, `jurisdictions`,
   `product_surface`, `latency_class`, `cost_class`, `author`, `reviewer`, `change_reason`,
   `envelope_digest`. `additionalProperties: false` — the sidecar is an allowlist, so a field carrying
   content cannot be added by accident.
5. **`schemas/evaluation/dataset-version.schema.json`** and
   **`schemas/evaluation/dataset-migration.schema.json`** (**D8**) — the version registry (version id,
   created-at, per-case content hash, per-case sealed-envelope digest, approver) and the migration
   record (from/to version, per-case old→new gold mapping, `reason`, `approved_by`, PRD §43.4
   classification `CODE|CORPUS|GOLD_DATA|PROMPT|MODEL_PROFILE|PRODUCT_AMBIGUITY|SOURCE_LIMITATION`).
6. **`evals/splits/allocation.yaml`** — the PRD §43.1 table as frozen data: ten category rows with
   directory slug, three-letter code (**D5**) and the four counts, plus the totals 360/120/120/600. A
   test asserts it matches the transcription in this ticket row for row.
7. **`evals/splits/id-rules.yaml`** — `EVAL-<CAT>-<NNN>` with the fixed codes `FED AWD AGR PAY STE WHS
   ADJ CAS TMP SAF`, a uniqueness/never-reuse rule, and the statement that a case id always carries a
   letter segment so it can never be read as requirement id `EVAL-001`/`EVAL-002` (PRD §30.1; plan
   §1.1). `INGF-07`'s `evaluation_subset_ref: [EVAL-FED-001]` must remain a valid id under these rules.
8. **`evals/splits/blind-recipient.pub`** — the committed **public** recipient key of the blind-dataset
   key pair (PyNaCl/libsodium `SealedBox`, X25519), plus a key id and the blind-dataset major version
   it belongs to: plan §8 **Q6** gives each blind-dataset major version its own key pair, so the file
   format must carry that version rather than assume one permanent key, and rotation replaces this file
   through a new dataset version (**D8**). Private half: held solely by the Founder and never in the
   repository, CI, ordinary environment configuration or any agent environment (**D2**, **D22**). A
   test asserts no file under `evals/**` or `pipelines/evaluation/**` matches a private-key header
   pattern.
9. **`evals/splits/dataset-versions/<version>.json`** and **`evals/splits/migrations/**`** — the
   registry and migration instances (initially the `v1` registry with zero cases; the authoring
   tickets add entries through the CLI, never by hand-editing).
10. **`pipelines/evaluation/src/dataset/model.py`** — typed, frozen dataclasses for `Case`,
    `GoldAuthority`, `Stratification`, `BlindSidecar`, `SealedEnvelope`, `DatasetVersion`,
    `Migration`, plus `Split` and `PrimaryCategory` enums generated from `allocation.yaml`.
11. **`pipelines/evaluation/src/dataset/compose.py::compose(root) -> Dataset`** (**D4**) — discovers
    `evals/cases/*/` directories, loads every case YAML and every blind sidecar, and returns one
    in-memory dataset. It never reads a central index and never writes one; adding a category is
    adding a directory.
12. **`pipelines/evaluation/src/dataset/checks/**` — one module per check**, each a pure
    `(dataset, context) -> list[Finding]`, so a Reviewer can read a rule beside the PRD:

    | # | Check id | Rule | PRD basis |
    |---:|---|---|---|
    | 1 | `SCHEMA_VALID` | every case validates against `case.schema.json`; every sidecar against `blind-sidecar.schema.json` | §43.2, §14.1 |
    | 2 | `ID_RULES` | ids match `EVAL-<CAT>-<NNN>`, the code matches the directory, ids are globally unique and never reused (checked against every prior dataset version) | §30.1, **D5** |
    | 3 | `ALLOCATION_EXACT` | per-category and total counts equal `allocation.yaml` **exactly** — not "at least" | §43.1, `EVAL-001` |
    | 4 | `SPLIT_DISJOINT` | each id appears in exactly one split; no id appears in two categories | `EVAL-001` *"Split integrity/no-overlap test passes"* |
    | 5 | `NO_NEAR_DUPLICATES` | no two cases share a normalised `question`+`anonymous_scenario` hash **across splits** (the leak that would make blind testing meaningless); reported per split pair | §14.1, §14.3 |
    | 6 | `STRATIFICATION_MET` | each category satisfies its own `stratification.yaml` | §43.1 |
    | 7 | `GOLD_SHAPE` | every `gold_authorities` entry has well-formed ids and a permitted `citation_role`; at least one `required: true` authority unless `expected_answer_status ∈ {OUT_OF_SCOPE}` or the case is a PII-rejection case | §43.2, §43.3 |
    | 8 | `GOLD_RESOLVES` (**D7**) | with `--release`, every gold `version_id`/`node_id` resolves in the pinned release via `CRPS-02`'s verifier + corpus read; without `--release`, emits `UNRESOLVED` findings — never `pass` | §43.2, §40.9 *"any broken gold citation"* |
    | 9 | `VERSIONED_CORRECTIONS` | a case whose content hash differs from the registry requires a new `dataset_version`, a non-empty `change_reason` and an `approved_by`; a changed **expected output** additionally requires a migration record | §14.3, §43.4 |
    | 10 | `BLIND_SEALED` | every `BLIND` case has exactly one sealed envelope and one sidecar, digests match, and **no** plaintext case/gold file exists under any `blind/` path | §14.3, §43.1, **D1** |
    | 11 | `NO_PRIVATE_KEY` | no private-key material anywhere in the module's trees | **D2** |
    | 12 | `COMPLETE_DATASET` (`--complete` only) | totals are exactly 360/120/120/600 and the sub-PRD cross-cutting floors hold (every product surface and answer status represented) | §14.1, §43.1 |

    Findings carry check id, severity (`FAIL` / `UNRESOLVED`), category, case id and a **content-free**
    message — plan §8 **Q6** item 15 restricts every blind-touching output to content-free metrics,
    category summaries and case ids. `UNRESOLVED` is never counted as a pass (sub-PRD **D11**).
13. **`pipelines/evaluation/src/dataset/blind.py` — the mechanical blind control.** This is the
    ticket's load-bearing deliverable; specify it exactly:
    - `seal(plaintext_bytes, recipient_pub) -> SealedEnvelope` uses **PyNaCl/libsodium `SealedBox`** —
      X25519 + XSalsa20-Poly1305, i.e. `crypto_box_seal` — exactly as plan §8 **Q6** confirms. Sealing
      requires only the public key, so an authorised `evaluation-author` agent seals without ever
      holding the private key. The primitive is part of a confirmed decision: substituting another one
      is a writeback against plan §8 Q6 (feedback obligation 2), never a local implementation choice.
    - `open_blind(envelope, key_source) -> SealedCase` requires the private key from an
      **environment-supplied path** (`EVAL_BLIND_KEY_FILE`). No default path, no repository lookup, no
      keyring fallback. Missing/unreadable key raises `BlindKeyUnavailable` — the deterministic reason
      an ordinary CI run and an ordinary agent session cannot open blind material (**D2**). Only the
      Founder holds that key and only the Founder starts a blind stage (plan §8 **Q6** items 13–14;
      **D22**), so this exception is the normal outcome everywhere else.
    - `SealedCase` is an **opaque wrapper**: `__repr__`, `__str__`, `__format__` and the JSON encoder
      hook all raise `BlindMaterialNotRenderable`. Field access is through explicit accessors used by
      the runner only. A test asserts that `print`, f-strings, `json.dumps`, `logging` and `pytest`
      assertion rewriting all raise rather than render.
    - `leak_shingles(sealed_cases) -> frozenset[str]` produces normalised 12-token shingles of blind
      plaintext **in memory only**, and
      `assert_no_blind_leakage(paths, shingles)` scans produced artifacts; on any hit it deletes the
      artifact and raises `BlindLeakDetected`. `GOLD-02` calls it after every write (sub-PRD **D20**).
    - `guard(root) -> list[Finding]` — the standalone repository guard implementing checks 10 and 11
      without needing any key.
14. **`pipelines/evaluation/src/dataset/cli.py`** — `python -m evaluation.dataset` with subcommands:
    `verify [--category <slug> | --complete] [--release <path>] [--format json|text]`,
    `seal --category <slug> --in <dir>` (reads an untracked working directory, writes envelopes +
    sidecars, never echoes content), `guard-blind`, `hash --category <slug>`,
    `version new --reason <text> --approved-by <name>`, `migrate --from <v> --to <v>`. Every subcommand
    exits **non-zero** on any `FAIL` **or** `UNRESOLVED` finding, and prints no case content — findings
    reference ids only.
15. **`evals/.gitignore`** — ignores `**/blind/unsealed/**` and `**/*.plaintext.yaml`, so a working
    directory used for authoring blind cases cannot be committed by accident. The guard treats a
    tracked file at such a path as a `FAIL`, so the ignore file is a convenience and the guard is the
    control.
16. **`pipelines/evaluation/tests/dataset/**`** — fixture-driven tests (sub-PRD **D19**, **D18**): a
    tiny synthetic three-category fixture tree with its own miniature allocation, positive and negative
    fixtures for **every** check in deliverable 12, an ephemeral test key pair generated in the test
    process (never committed), and a `prd-43-1-allocation.json` transcription asserted against
    `evals/splits/allocation.yaml`.
17. **`docs/adr/NNNN-blind-gold-sealing.md`** (plan **A9**, PRD §45.5) — **the ADR does not exist yet:
    `docs/adr/` is empty, and this ticket's Builder authors it at implementation time.** Plan §8 **Q6**
    is the confirmed decision, so the ADR *records* it and never reopens it. The decision input is
    fixed here so the Builder transcribes rather than invents; write at least these sections.

    - **Status** — Accepted. Source: breakdown plan §8 **Q6** (confirmed, Founder-owned); PRD §14.3,
      §43.1, §45.1 item 6.
    - **Context** — one tree holds 480 visible and 120 blind cases and wave B authors both (plan
      **R9**). PRD §14.3 requires blind gold to *remain outside ordinary coding-agent context* and PRD
      §43.1 requires it to be *inaccessible*, not merely discouraged. Plan §4 freezes `.claude/**`, so
      an agent-side deny rule is not even writable from this module.
    - **Decision** — (a) blind material is authored by dedicated `evaluation-author` agents in an
      isolated session/workspace **outside this repository**, given only the schema, the stratification
      requirements, official source material and the authoring rubric, and never ordinary coding-agent
      context; (b) an independent `evaluation-reviewer` agent checks every blind case against official
      sources before encryption; no lawyer, tax specialist or employed domain expert is engaged, and
      the Founder performs a risk-based spot check of typically 12–20 of the 120; (c) plaintext never
      enters git, ordinary fixtures, an implementation agent's session or ordinary CI; (d) material is
      sealed with PyNaCl/libsodium `SealedBox` (X25519 + XSalsa20-Poly1305, `crypto_box_seal`); (e) the
      public key is committed so an authorised authoring agent can encrypt without the private key;
      (f) blind run output is limited to content-free metrics, category summaries and case IDs, and a
      failed blind run is debugged from development/validation cases and category-level blind metrics
      only.
    - **Custody model** — the Founder is the **sole** custodian of the private key; it lives in a
      password manager or equivalent offline encrypted storage with **one** encrypted recovery copy,
      and never in git, CI, ordinary environment configuration or any agent environment; one key pair
      per blind-dataset major version, with immediate rotation on suspected compromise; **only the
      Founder may start a blind stage**; the private-key path arrives through `EVAL_BLIND_KEY_FILE`
      with no default path, no in-repository lookup and no keyring fallback.
    - **Rejected alternatives** — (i) an ignore file, a `CODEOWNERS` rule or agent instructions: a
      convention rather than a mechanism, and unwritable here because `.claude/**` is frozen; (ii)
      keeping blind material entirely outside the repository with no in-repo trace: `EVAL-001`'s *"120
      protected blind cases"* and PRD §43.2's *"past reports stay reproducible"* would become
      unverifiable; (iii) symmetric encryption with a shared key: every authoring party would then hold
      the opening key; (iv) engaging a lawyer or employed domain expert as author/reviewer: plan §8 Q6
      settles the authoring path without one; (v) a keyring or default-path key lookup: it would make
      an accidental blind open possible in an ordinary session.
    - **Consequences** — no blind stage can run in ordinary CI or in any coding-agent session, by
      construction; blind failures are debugged from category-level metrics, which is deliberately
      slower; the Founder is a single point of custody, mitigated only by the one encrypted recovery
      copy; a lost key makes that blind-dataset major version unopenable and forces a new key pair plus
      a re-sealed dataset version through **D8**'s versioned-correction path; and because authoring and
      review happen outside this repository, `GOLD-05` … `GOLD-14` can only ever verify blind
      **slots** — count, seal, digest, sidecar allowlist and stratification — never content.
    - **Review trigger** — any change to who may hold the private key, who may start a blind stage, or
      the sealing primitive. Each is a change to a **confirmed** decision: writeback to
      `docs/prd/breakdown-plan.md` §8 **Q6** and this sub-PRD first, then the ADR, then code.
18. **`pipelines/evaluation/README.md`** (create) — the module's entry map: the CLI, the checks table,
    the blind rules, and the sentences *"the private seal key is never in this repository, in CI, or in
    an agent environment"* and *"only the Founder starts a blind stage, and blind run output carries
    metrics, category summaries and case ids only"* stated where a future contributor will read them.

## Acceptance checklist (classified)

- [ ] `[machine]` **`EVAL-001` split integrity**: over the fixture tree, `ALLOCATION_EXACT`,
      `SPLIT_DISJOINT` and `NO_NEAR_DUPLICATES` pass on a correct dataset and each fails on its own
      negative fixture (one miscounted category, one id in two splits, one duplicated question).
      (PRD §30.2 `EVAL-001`; §43.1)
- [ ] `[machine]` **The §43.1 table is frozen data**: `evals/splits/allocation.yaml` equals
      `prd-43-1-allocation.json` row for row, and the totals are exactly **360 / 120 / 120 / 600**.
      (PRD §43.1; §14.1)
- [ ] `[machine]` **Every PRD §43.2 field name exists in the schema** and the PRD §14.1 fields are
      `required`; an unknown field fails validation (`additionalProperties: false`). (PRD §43.2, §14.1;
      sub-PRD D6)
- [ ] `[machine]` **Blind plaintext is impossible**: `guard-blind` fails on (a) a plaintext case under a
      `blind/` path, (b) a blind case with no envelope, (c) an envelope whose digest does not match its
      manifest entry, (d) a sidecar carrying any non-allowlisted field, (e) any private-key-shaped file.
      (PRD §14.3, §43.1, §45.1 item 6; sub-PRD D1–D3)
- [ ] `[machine]` **The key is required and absent**: with `EVAL_BLIND_KEY_FILE` unset, `open_blind`
      raises `BlindKeyUnavailable`; there is no default path, repository lookup or keyring fallback — a
      test greps `src/dataset/**` for any literal key path. (PRD §14.3, §20.2; sub-PRD D2)
- [ ] `[machine]` **Sealed material cannot be rendered**: `print`, f-string, `json.dumps`, `logging` and
      a failing `assert` on a `SealedCase` each raise `BlindMaterialNotRenderable` rather than emitting
      text. (Sub-PRD D20)
- [ ] `[machine]` **Leak detection works**: `assert_no_blind_leakage` detects a 12-token shingle of
      blind plaintext written into a JSON artifact, deletes the artifact and raises. (Sub-PRD D20)
- [ ] `[machine]` **Sealing needs no private key**: the seal path succeeds with only
      `blind-recipient.pub` present; a round-trip with the ephemeral test key recovers the plaintext.
      (Plan §8 Q6; sub-PRD D1)
- [ ] `[machine]` **Corrections are versioned**: changing a fixture case's content without a new
      `dataset_version` + `change_reason` + `approved_by` fails `VERSIONED_CORRECTIONS`; changing an
      expected output additionally requires a migration record. (PRD §14.3; §43.4)
- [ ] `[machine]` **Gold resolution is two-mode and never silently passes**: without `--release` every
      gold entry yields an `UNRESOLVED` finding and the command exits non-zero; with a `CRPS-08`-shaped
      fixture release, valid ids resolve and an invented `node_id` fails. (PRD §43.2, §40.9; sub-PRD D7)
- [ ] `[machine]` **Findings are content-free**: a canary string placed in a fixture case's `question`
      appears in no finding message, log line or non-zero-exit output. (PRD §22; §14.3)
- [ ] `[machine]` **Case ids cannot be read as requirement ids**: `EVAL-001` is rejected by `ID_RULES`
      and `EVAL-FED-001` is accepted (`INGF-07` deliverable 1 depends on the latter). (PRD §30.1; plan
      §1.1)
- [ ] `[machine]` `uv sync --frozen` then `uv run pytest` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm test` green — unaffected; this ticket writes no TypeScript. `cargo test
      --workspace` unaffected; no Rust. (PRD §45.3)
- [ ] `[machine]` **Writeback item**: `docs/adr/NNNN-blind-gold-sealing.md` is authored by this ticket
      and carries every section of deliverable 17 — status, context, decision, custody model, rejected
      alternatives, consequences and review trigger — transcribing plan §8 **Q6** rather than reopening
      it, and `docs/prd/21-evaluation-600/README.md` records the allocated ADR number against **D21**
      and **D22**. (Plan **A9**, §8 **Q6**; PRD §45.5)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs (**EVAL-001**), user-visible change and
      non-goals, schema compatibility impact (`schemas/evaluation/**` is consumed by `GOLD-02` …
      `GOLD-17`), **tenant/PII/security and retention impact** (no customer data; blind material sealed;
      no private key committed), source/licence impact (none), cost/memory/latency impact (checker runs
      in seconds over 600 cases), rollback path, known gaps (**Q-GOLD-C**, **Q-GOLD-D**).
- [ ] `[human]` **The Founder supplies the public half of the blind-dataset key pair** for
      `evals/splits/blind-recipient.pub`, and confirms the private half is held exactly as plan §8
      **Q6** requires: password manager or equivalent offline encrypted storage, one encrypted recovery
      copy, and never in git, CI, ordinary environment configuration or any agent environment. A
      Builder cannot complete this item and must never generate the pair inside an agent session. Not
      required to merge against an ephemeral test key, but required before any real blind material is
      sealed and before `GOLD-15` or `GOLD-17` runs a blind stage. (Plan §8 **Q6**; sub-PRD **D22**;
      PRD §14.3, §20.2)

Absent classes: no `[fixture]` criteria — there is no recorded evaluation run to replay yet
(`GOLD-02` introduces the first). The single `[human]` item is a custodial act plan §8 **Q6** reserves
to the Founder — not an open decision, and not a quality judgement about this code.

## Test plan

Every `[machine]` step runs offline: no network, no provider, **no private seal key** except the
ephemeral pair the tests generate in-process.

1. **Read the schema against the PRD.** Open `docs/PRD.md` §43.2 and `schemas/evaluation/case.schema.json`
   side by side; every field name in the PRD's block must exist, spelled identically. A renamed field is
   a silent contract break for `GOLD-02` … `GOLD-17`.
2. **Read the allocation against the PRD.** Compare `evals/splits/allocation.yaml` with §43.1 row by row
   and check the totals are 360/120/120/600.
3. **Run the suite.** `uv sync --frozen`, then `uv run pytest pipelines/evaluation/tests/dataset -q`,
   then `uv run pytest` from the repository root. Construction pattern to copy: `INGF-07`'s
   `pipelines/ingestion/tests/registry/**` (generated synthetic tree + per-invariant negative fixtures)
   and `CRPS-08`'s fixture-release tests.
4. **Per-check positive/negative.** For each of the twelve checks, run its passing fixture (no finding)
   and its failing fixture (exactly that check's finding id). Confirm each negative fails for the stated
   reason, not incidentally.
5. **Blind guard matrix.** In a scratch copy of the fixture tree, in turn: drop a plaintext
   `blind/case.yaml`; delete an envelope; corrupt one envelope byte; add `question:` to a sidecar; add a
   file beginning `-----BEGIN`. Assert `guard-blind` exits non-zero each time and names the case id
   only.
6. **Key absence.** Unset `EVAL_BLIND_KEY_FILE` and call `open_blind`; assert `BlindKeyUnavailable`.
   Point it at a wrong key; assert a decryption failure, not a partial result. Grep `src/dataset/**` for
   `~/`, `.ssh`, `keyring`, `os.environ.get("EVAL_BLIND_KEY_FILE", ` with a default — none.
7. **Opacity.** Attempt `print(sealed)`, `f"{sealed}"`, `json.dumps(sealed, default=str)`,
   `logging.info("%s", sealed)` and `assert sealed == None`; each must raise
   `BlindMaterialNotRenderable`.
8. **Leak scan.** Write a JSON artifact containing a 12-token span from a fixture blind case; assert
   `assert_no_blind_leakage` deletes it and raises.
9. **Seal round-trip without the private key.** Generate an ephemeral pair; seal with the public half
   only; assert the ciphertext differs on every seal (nonce) and that opening with the private half
   reproduces the plaintext byte-for-byte.
10. **Versioned correction.** Edit a fixture case's `question`; assert `VERSIONED_CORRECTIONS` fails.
    Re-run `version new --reason … --approved-by …`; assert it passes. Edit an `expected_answer_status`
    without a migration; assert it still fails.
11. **Gold resolution.** Run `verify --category <fixture>` with no `--release` (expect `UNRESOLVED`,
    non-zero exit) and with the `CRPS-08` fixture bundle (expect pass); then corrupt one `node_id` and
    expect a `GOLD_RESOLVES` failure.
12. **Append-only manifest.** `git diff pipelines/evaluation/pyproject.toml` shows additions only.
13. **Reviewer focus.** Confirm the blind control is a *mechanism*: that the sealing primitive is
    PyNaCl/libsodium `SealedBox` (`crypto_box_seal`) as plan §8 **Q6** confirms; that no committed file
    contains a private key; that sealing needs only the public key; that nothing in `src/dataset/**` can open blind
    material without an environment-supplied key path; that the guard fails the build rather than
    printing a warning; that findings never carry case content; and that `evals/splits/**` contains no
    enumerated list of case ids (**D4** — otherwise ten authoring tickets would contend on one file).

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR → merge →
   `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/21-evaluation-600/README.md` (version +0.1 with a changelog line) **before** changing code.
   Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *PyNaCl/libsodium `SealedBox` is unavailable, unpinnable, or forbidden by PRD §21.1's supply-chain
     rules* → the primitive belongs to a **confirmed** decision, so the writeback comes first: raise it
     against `docs/prd/breakdown-plan.md` §8 **Q6** and `docs/prd/21-evaluation-600/README.md`
     (**D22**), then record the replacement and its properties in
     `docs/adr/NNNN-blind-gold-sealing.md` (consequences section), and only then change
     `src/dataset/blind.py`. The invariant that must survive any substitution: **sealing requires only
     a public key; opening requires a key held solely by the Founder and never present in the
     repository, CI or an agent environment.**
   - *A `[FND-03]` enum this schema references does not exist or is named differently* → raise it in a
     docs PR against `FND-03`, and record the interim in `docs/prd/21-evaluation-600/README.md`. Do not
     define a second copy of a canonical enum here — PRD §44.3 makes `packages/contracts` serial-owned
     and PRD §45.2 forbids duplicated rules.
   - *The PRD §43.1 per-jurisdiction floor cannot be expressed for `adjacent-regimes`* → this is sub-PRD
     **Q-GOLD-C**, owner **Founder**. Record the chosen checkable rule in
     `docs/prd/21-evaluation-600/README.md` **Q-GOLD-C** first; never weaken `ALLOCATION_EXACT`, which
     is `EVAL-001` itself.
   - *No CorpusRelease exists to resolve gold ids against* → that is sub-PRD **Q-GOLD-D**; the two-mode
     check already covers it. Do **not** make `GOLD_RESOLVES` optional or default it to pass — an
     unresolved gold citation is PRD §40.9's blocking condition at release.
   - *A downstream ticket wants a sidecar field this schema does not allow* → change the **sidecar
     schema here**, in one docs PR amending this ticket and theirs, and re-justify it against PRD §43.1
     (*"the blind case content/gold data is inaccessible"*). Never let a downstream ticket widen an
     allowlist by writing `schemas/evaluation/**`.
   - *`pnpm eval:smoke` cannot reach this Python package* → sub-PRD **Q-GOLD-B**; the writeback target is
     a docs PR against `FND-01` deliverable 2 (and `FND-02` deliverable 3 if the job changes), not a new
     script in this module.
3. **Falsified protocol.** **If blind material cannot be protected mechanically, that overturns PRD
   §14.3 and §45.1 item 6 — a product-level safety rule, not an implementation detail.** Do not fall
   back to an ignore file, a naming convention, a code comment, or "the agent was told not to look".
   Stop, escalate for re-review, update the ADR **and** `docs/prd/breakdown-plan.md` **R9**/§8 **Q6**
   before any further code. Equally: **a Builder must never author, decrypt, paste or summarise blind
   case content or gold answers** — plan §8 **Q6** puts authoring with the `evaluation-author` agents
   outside this repository and opening with the Founder alone, so if a task appears to require either,
   the task is wrong; the escalation path is the Founder, never a local workaround.
