---
id: GOLD-03
title: "Release gate enforcement and release evidence pack"
module: 21-evaluation-600
lane: 21-evaluation-600
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [GOLD-02]
blocks: [GOLD-15, GOLD-17, INTL-06]
---

# GOLD-03 — Release gate enforcement and release evidence pack

Implements PRD §14.2 and §43.5 — requirement **EVAL-002**; epic `E31-EVAL-600`.
No ADR — the decision is already made in PRD §14.2 (the seven-row threshold table and the
no-critical-regression rule) and PRD §43.5 (the release evidence pack contents); this is build ticket
3 of 17 against it.
Parent sub-PRD: [21-evaluation-600 README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [GOLD-02 — Evaluation runner and metric implementations](GOLD-02-evaluation-runner-and-metric-implementations.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §14.2 is a finished table of gate values and PRD §43.5 a finished list of report contents; this
turns both into code that can refuse a release.

## Background + basis

**PRD §14.2 release thresholds, transcribed verbatim — the frozen data this ticket enforces:**

| Metric | Gate |
|---|---:|
| Factual citation coverage | 100% |
| Citation precision | ≥ 98% |
| Retrieval recall@10 | ≥ 90% |
| Critical legal-date or jurisdiction errors | 0 |
| Unsupported definitive claims | 0 |
| Correct refusal | ≥ 95% |
| Source-status correctness | ≥ 98% |

> **The release MUST also have no critical regression relative to the current production baseline,
> acceptable schema success, cost and latency, and no supported-to-unsupported or refusal-to-definitive
> degradation in material cases.**

**PRD §43.3 closing rule, quoted verbatim:** *"**Aggregate passing cannot waive a zero-tolerance error
or critical regression.**"*

**PRD §43.5 release evidence pack, quoted verbatim — the report contract:**

> Promotion UI links one immutable release report containing application/corpus versions, source
> coverage and gaps, all 600 metrics, per-category breakdown, critical-error list, changed cases,
> security/tenant/PII results, performance and memory benchmark, provider/profile cost forecast,
> backup/restore result, accessibility result, known risks and founder approval/reason.

**PRD §44.4 schedule truth, quoted verbatim — why a threshold is never the thing that moves:**

> If the full roster cannot pass by Week 8, the only permitted launch outcomes are:
>
> 1. continue work and delay production access; or
> 2. launch with an explicit source group in a technically/licensing-limited state only where the PRD
>    already permits that state, the limitation is visible and relevant answers safely warn/refuse.
>
> It is not permitted to silently call an unimplemented source category covered.

**Requirement.** `EVAL-002` (PRD §30.2): *"Release is blocked unless every numeric and zero-tolerance
gate passes … **Deliberate failing metric prevents promotion**."*

**PRD §20.3 CI gates** name *"Retrieval/evaluation smoke set"* on every PR and *"Release candidates
additionally run integration, restore, evaluation, compatibility and rollback tests"* — the commands
this ticket must provide. `FND-01` deliverable 2 names `GOLD-03` as the owner of the `eval:smoke`
entry command; `FND-02` deliverable 3 wires the `retrieval-eval-smoke` job to `pnpm eval:smoke` and
deliverable 4 reserves an `evaluation` job in `release-candidate.yml`.

**What is already decided elsewhere and must not be re-decided here.** `GOLD-02` owns the seven metric
computations, the observation and run-artifact contracts, the breakdowns and the PRD §43.4 triage
queue — this ticket **reads** its artifact and applies thresholds. `GOLD-01` owns the dataset checker
(`EVAL-001`). `CRPS-02` owns release-manifest signing; `RLSE-06`/`RLSE-07` own promotion; `INTL-06`
(`blocked_by` this ticket) owns the console that links the report.

**Sub-PRD decisions carried forward:** **D11** (`PASS`/`FAIL`/`UNRESOLVED`, no override), **D12**
(thresholds are frozen data asserted equal to the PRD), **D13** (an unmeetable gate is a Founder release
decision under §44.4), **D14** (report-tree ownership; per-run outputs are generated), **D16**
(offline), **D19** (test layout).

**Accepted caveats carried forward:**

- **This module cannot reach into promotion tooling.** Plan §6.2 gives `RLSE-07` no edge to this
  ticket. The enforcement surfaces this ticket genuinely owns are: a non-zero exit in the
  release-candidate pipeline, the **absence** of a valid evidence pack, and a machine-readable verdict
  carrying `release_blocked: true` that `INTL-06` (`blocked_by` this ticket) consumes before enabling
  promotion. A further hard interlock inside `infra/deploy/promote/**` is a docs PR against `RLSE-07`
  plus a new plan §5/§6.2 edge — never a write into another module's tree.
- **Four §43.5 slots are produced by other modules** (security/tenant/PII results — `23-assurance`;
  performance and memory benchmark — `RLSE-11`; backup/restore result — `RLSE-09`; accessibility result
  — `ASSR-07`). This ticket defines them as **referenced artifacts** (producer, artifact id, hash,
  status); a missing reference is `UNRESOLVED`, never blank.
- **"Acceptable schema success, cost and latency" has no number in the PRD.** Sub-PRD **Q-GOLD-A**,
  owner **Founder**. Until it is set, those rows evaluate to `UNRESOLVED`, which blocks — the PRD's
  requirement is enforced, and the missing number is visible rather than assumed.
- **`pnpm eval:smoke` cannot reach a uv-only member** (`FND-01` deliverable 1 sets the pnpm workspace to
  `apps/*`, `packages/*`, `tests/*`). Sub-PRD **Q-GOLD-B**: this ticket ships the real command as a uv
  entry point and reports the gap; wiring `pnpm eval:smoke` is a docs PR against `FND-01`.

## Goal

Produce `pipelines/evaluation/src/gates/**` and the `evals/reports/**` tree: the PRD §14.2 thresholds as
frozen, PRD-verified data; a gate evaluator that turns a `GOLD-02` run artifact into a
`PASS`/`FAIL`/`UNRESOLVED` verdict with **no** waiver path; baseline comparison implementing the §14.2
second paragraph (no critical regression, no supported-to-unsupported or refusal-to-definitive
degradation); and the PRD §43.5 release evidence pack as one immutable, content-hashed report with every
listed section present or explicitly `UNRESOLVED`. Completion is mechanically checkable: `uv run pytest
pipelines/evaluation/tests/gates` is green offline; forcing any one §14.2 row to fail makes the gate
command exit non-zero, produce no evidence pack and emit `release_blocked: true`; and no flag,
environment variable or field can change that outcome.

## Non-goals

- **No metric computation** — `GOLD-02` (merged; this ticket's blocker). A threshold applied to a number
  this ticket also computed would be a gate marking its own homework.
- **No judge and no model-assisted verdict** — `GOLD-04`. The verdict type cannot reference judge output
  (sub-PRD **D10**).
- **No profile promotion ceremony, frozen validation or blind stage** — `GOLD-15`.
- **No release-candidate run, founder review or blind review** — `GOLD-17` (`blocked_by` this ticket),
  which also owns `evals/reports/release-candidate/**`.
- **No corpus promotion, active pointer, rollback or release archive** — `18-ops-release` (`RLSE-06`,
  `RLSE-07`, `RLSE-01`). This ticket produces the verdict; it never promotes.
- **No admin console, screen or `/internal/v1` route** — `22-internal-admin` (`INTL-06`, `blocked_by`
  this ticket).
- **No security/PII, benchmark, backup or accessibility results** — `23-assurance`, `RLSE-09`,
  `RLSE-11`, `ASSR-07`. Referenced, never produced here.
- **No CI workflow file or root script** — `00-foundation` (`FND-01`, `FND-02`); sub-PRD **Q-GOLD-B**,
  **Q-GOLD-E**.

## File-scope (write-owns)

Owned by this ticket:

- `pipelines/evaluation/src/gates/**`
- `pipelines/evaluation/tests/gates/**` (sub-PRD **D19**)
- `evals/reports/**` — **except** `evals/reports/release-candidate/**`, which is `GOLD-17`'s. This
  ticket creates `evals/reports/.gitignore` (per-run outputs are generated artifacts, plan §1.1),
  `evals/reports/schema/**` and one committed worked example under `evals/reports/examples/**`
  (sub-PRD **D14**)
- `pipelines/evaluation/pyproject.toml` — **append-only**, own dependencies and the `evaluation.gates`
  entry point only

Does not touch:

- `evals/reports/release-candidate/**` — `GOLD-17`. `evals/cases/**`, `evals/gold/**` — `GOLD-05` …
  `GOLD-14`. `evals/splits/**`, `schemas/evaluation/**` — `GOLD-01`.
- `pipelines/evaluation/src/{dataset,runner,judge,promotion,coverage}/**` — `GOLD-01`, `GOLD-02`,
  `GOLD-04`, `GOLD-15`, `GOLD-16`.
- `infra/deploy/**`, `infra/**` — `18-ops-release` (plan §4.1 serial-owned production files).
  `apps/api/src/routes/internal/**`, `apps/admin/**` — `22-internal-admin`.
- Root manifests, `.github/workflows/**`, `packages/contracts/**` — `00-foundation` (plan §4.1).
- `docs/PRD.md`, `.claude/**` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). `pipelines/evaluation/src/gates/**` is written by no other ticket (plan §5.22); `evals/reports/**`
is shared only with `GOLD-17`, which is `blocked_by` this ticket and owns a disjoint subdirectory, so
the two are never concurrent and never write the same path. This is a module wave-3 ticket; its only
concurrent sibling is `GOLD-04` (`src/judge/**`). Its declared blocker `GOLD-02` lands first (module
wave 2). Shared append-only file: `pipelines/evaluation/pyproject.toml`.

## Deliverables

1. **`src/gates/thresholds.py` + `src/gates/prd-14-2.json` — the §14.2 table as frozen data**
   (sub-PRD **D12**): seven rows, each with metric id, comparator (`==`, `>=`, `<=`), value, and
   zero-tolerance flag. A test asserts the file equals the table transcribed in this ticket's
   Background, row for row and value for value. The values are **not** configurable: no CLI flag, no
   environment variable, no config file overlay, no per-run override. Changing one is a PRD change
   requiring Founder approval (PRD §45.5 "Product change").
2. **`src/gates/verdict.py` — the verdict type with no waiver.** `GateVerdict` is a frozen dataclass
   `{run_id, artifact_sha256, dataset_version, corpus_release_id, rows: list[GateRow], outcome:
   PASS|FAIL|UNRESOLVED, release_blocked: bool, blocking_reasons: list[str]}`. It has **no** field for
   waiver, override, acknowledged risk, exception, force or approval-to-proceed; a test asserts the
   field set is exactly this list, so adding one is a visible diff. `release_blocked` is `True` for any
   outcome other than `PASS` — silence is never success (sub-PRD **D11**).
3. **`src/gates/evaluate.py::evaluate(artifact, baseline=None) -> GateVerdict`** — the ordered
   evaluation:
   1. verify the artifact's `content_sha256` and that `EVAL-001`'s dataset check passed for the
      artifact's `dataset_version` (`GOLD-01`'s checker result is carried on the artifact); a failed or
      missing dataset check is `UNRESOLVED`;
   2. apply the seven §14.2 rows; a metric reported `UNRESOLVED` by `GOLD-02` stays `UNRESOLVED`;
   3. apply the zero-tolerance rule: any non-zero count in rows 4–5 is `FAIL` **regardless of every
      other row** (PRD §43.3);
   4. apply the §14.2 second paragraph (deliverable 4);
   5. compose `blocking_reasons` naming each failing/unresolved row by its PRD metric name.
   The function is pure and takes no environment.
4. **`src/gates/regression.py` — the §14.2 second paragraph, made mechanical.** Against the accepted
   baseline artifact:
   - `CRITICAL_REGRESSION` — any zero-tolerance count that increased, or any gated rate that fell below
     both its threshold and its baseline value;
   - `SUPPORTED_TO_UNSUPPORTED_DEGRADATION` — a **material** case (declared by `GOLD-01`'s schema field
     `tags: [material]` or `required_claims` non-empty) whose baseline status was `SUPPORTED`/
     `CONDITIONAL` and whose candidate status is `INSUFFICIENT_EVIDENCE`/`CONFLICTING_SOURCES`;
   - `REFUSAL_TO_DEFINITIVE_DEGRADATION` — a material case whose baseline correctly refused and whose
     candidate answers definitively;
   - `SCHEMA_COST_LATENCY_ACCEPTABILITY` — reads the Founder-set values when they exist; **`UNRESOLVED`
     until sub-PRD Q-GOLD-A is answered**, never defaulted to acceptable.
   Each degradation is listed per case id; a single occurrence blocks, since PRD §14.2 states the rule
   without a tolerance.
5. **`src/gates/baseline.py` — the accepted baseline pointer.** `evals/reports/baseline.json` records
   the accepted run artifact hash, its dataset version, corpus release and the Founder approval that
   accepted it. Updating the baseline requires an explicit `baseline accept --artifact <hash>
   --approved-by <name> --reason <text>` command and is append-only history — a candidate can never
   become its own baseline, and a failing run can never be accepted implicitly.
6. **`evals/reports/schema/release-evidence-pack.schema.json` — PRD §43.5 as a schema** with one
   required section per listed item:
   `application_versions`, `corpus_versions`, `source_coverage_and_gaps`, `metrics_all_600`,
   `per_category_breakdown`, `critical_error_list`, `changed_cases`, `security_tenant_pii_results`,
   `performance_and_memory_benchmark`, `provider_profile_cost_forecast`, `backup_restore_result`,
   `accessibility_result`, `known_risks`, `founder_approval`. Externally-produced sections use a
   `ReferencedArtifact` shape `{producer_ticket, artifact_id, sha256, status: PRESENT|UNRESOLVED,
   retrieved_at}`. `additionalProperties: false`; a missing section fails validation rather than
   rendering an empty card.
7. **`src/gates/pack.py::build_pack(verdict, artifact, references) -> EvidencePack`** — assembles the
   pack, canonicalises it, computes `content_sha256`, and **refuses to emit a pack when the verdict is
   not `PASS`**: a blocked release has a *verdict document* and no evidence pack, so a promotion UI
   cannot be shown a green report for a failed run (PRD §43.5, `EVAL-002`). The pack is immutable: a
   second build for the same run id fails.
8. **`src/gates/cli.py`** — `python -m evaluation.gates` with subcommands:
   - `smoke` — PRD §20.3's per-PR *"Retrieval/evaluation smoke set"*: runs `GOLD-02`'s `SMOKE` suite in
     replay mode over committed fixtures and applies the thresholds; the real implementation behind
     `pnpm eval:smoke` (sub-PRD **Q-GOLD-B**);
   - `nightly`, `weekly`, `release-candidate` — the PRD §14.3 cadences as named commands (development;
     development + validation; all 600), documented for the schedules `FND-02` must add
     (sub-PRD **Q-GOLD-E**);
   - `evaluate --artifact <path> [--baseline <path>] [--out <dir>]` — writes the verdict and, only on
     `PASS`, the evidence pack;
   - `baseline accept …` (deliverable 5).
   Every subcommand **exits non-zero** on `FAIL` or `UNRESOLVED`. There is no `--force`, `--skip`,
   `--waive`, `--allow-fail` or equivalent, and a test asserts the CLI's option set contains none.
9. **`evals/reports/.gitignore`** — per-run output directories are generated artifacts and are ignored
   (plan §1.1); the tracked content of this tree is the schema, `baseline.json`, and one committed
   worked example (deliverable 10). `GOLD-17`'s `release-candidate/**` is excluded from the ignore so
   the release report stays committed.
10. **`evals/reports/examples/**` — one committed worked example**: a small passing verdict + evidence
    pack, and a **failing** verdict showing `release_blocked: true` with a named blocking reason and no
    accompanying pack. These are what `INTL-06` builds its console against and what a Reviewer reads to
    see the two shapes.
11. **`tests/gates/**`** — offline fixtures (sub-PRD **D18**): `prd-14-2-thresholds.json` (the table
    transcribed verbatim) asserted against the frozen data; per-row failing fixtures (one per §14.2
    row); a zero-tolerance fixture where six rows pass and one count is `1`; degradation fixtures for
    each §14.2 second-paragraph rule; an `UNRESOLVED` fixture where a metric could not be computed; a
    fixture proving no pack is emitted on a non-`PASS` verdict; and a CLI option-surface test.
12. **`pipelines/evaluation/README.md` update** — append the gate table, the verdict states, the "no
    override exists" statement, the four PRD §43.5 sections produced elsewhere, and the two commands CI
    runs.

## Acceptance checklist (classified)

- [ ] `[machine]` **`EVAL-002` — a deliberately failing metric prevents promotion**: for **each** of the
      seven §14.2 rows, a fixture forcing that row to fail produces `outcome = FAIL`,
      `release_blocked = true`, a non-zero exit and **no** evidence pack. (PRD §30.2 `EVAL-002`; §14.2)
- [ ] `[machine]` **The seven thresholds are exactly the PRD's**: citation coverage **100%**, citation
      precision **≥ 98%**, recall@10 **≥ 90%**, critical legal-date/jurisdiction errors **0**,
      unsupported definitive claims **0**, correct refusal **≥ 95%**, source-status correctness
      **≥ 98%** — asserted against `prd-14-2-thresholds.json`. (PRD §14.2; sub-PRD D12)
- [ ] `[machine]` **Zero tolerance cannot be averaged away**: a run with six passing rows and one
      critical date error is `FAIL`. (PRD §43.3 *"Aggregate passing cannot waive a zero-tolerance error
      or critical regression"*)
- [ ] `[machine]` **No override exists**: `GateVerdict`'s field set is exactly the declared list; the CLI
      exposes no `--force`/`--skip`/`--waive`/`--allow-fail`; no environment variable is read by
      `evaluate`. (PRD §14.2; §44.4; sub-PRD D11)
- [ ] `[machine]` **`UNRESOLVED` blocks**: a metric with an empty denominator, a missing dataset check,
      an unverified artifact hash or an unset acceptability value yields `UNRESOLVED`,
      `release_blocked = true` and a non-zero exit. (Sub-PRD D11; **Q-GOLD-A**)
- [ ] `[machine]` **`EVAL-001` is a precondition**: an artifact whose dataset check failed cannot produce
      a `PASS`. (PRD §30.2 `EVAL-001`; §14.1)
- [ ] `[machine]` **§14.2 second paragraph is enforced**: fixtures for critical regression,
      supported-to-unsupported degradation and refusal-to-definitive degradation each block, naming the
      affected case ids. (PRD §14.2)
- [ ] `[machine]` **Baseline integrity**: a candidate cannot be its own baseline; accepting a baseline
      requires `--approved-by` and `--reason` and appends to history rather than overwriting. (PRD
      §14.2; §43.4 item 3)
- [ ] `[machine]` **PRD §43.5 pack completeness**: the schema requires all fourteen sections; a pack
      missing one fails validation; externally-produced sections are `ReferencedArtifact`s whose absence
      is `UNRESOLVED`, never blank. (PRD §43.5)
- [ ] `[machine]` **The pack is immutable and hash-identified**: `content_sha256` covers the
      canonicalised body; a second build for the same run id fails; mutating any section changes the
      hash. (PRD §43.5 *"one immutable release report"*)
- [ ] `[machine]` **No pack on a blocked release**: the failing example under `evals/reports/examples/**`
      has a verdict and no pack. (PRD §43.5; `EVAL-002`)
- [ ] `[machine]` **The judge cannot reach the gate**: an import-graph test finds no `evaluation.judge`
      import and no judge-sourced field in `GateVerdict` or the pack schema. (PRD §14.3; sub-PRD D10)
- [ ] `[machine]` **Offline smoke command works**: `python -m evaluation.gates smoke` runs in replay mode
      over committed fixtures with no network, no provider key and no seal key, and returns a verdict.
      (PRD §20.3; sub-PRD D16)
- [ ] `[machine]` `uv sync --frozen` then `uv run pytest` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm test` green — unaffected; no TypeScript here. `cargo test --workspace`
      unaffected; no Rust. (PRD §45.3)
- [ ] `[machine]` **Writeback item**: sub-PRD **Q-GOLD-A** (acceptable schema success/cost/latency) and
      **Q-GOLD-B** (`pnpm eval:smoke` cannot reach a uv member) are updated in
      `docs/prd/21-evaluation-600/README.md` with the implemented behaviour and the exact command CI
      should run. (Plan §1.1; CLAUDE.md issue #53)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs (**EVAL-002**, contributes **EVAL-001**),
      user-visible change and non-goals, schema/API compatibility impact (the verdict and pack schemas
      consumed by `GOLD-15`, `GOLD-17`, `INTL-06`, `LNCH-05`), **tenant/PII/security and retention
      impact** (reports carry ids, counts and hashes — no research content, no blind material),
      source/licence impact (none), cost/memory/latency impact (gate evaluation is CPU-only over one
      artifact), rollback path, known gaps (**Q-GOLD-A**, **Q-GOLD-B**, and that promotion tooling has no
      DAG edge to this ticket).
- [ ] `[human]` **Founder sets the acceptability values** for schema success, cost and latency
      (**Q-GOLD-A**). Not required to merge — the rows are `UNRESOLVED` and therefore blocking until then
      — but required before `GOLD-17` can reach a `PASS`. (PRD §14.2; §45.5)

Absent classes: no `[fixture]` criteria beyond the replayed runs used by the `smoke` command — the
recorded-run replays themselves belong to `GOLD-02`; here they are inputs. The single `[human]` item is a
Founder decision the PRD reserves, not a quality judgement about this code.

## Test plan

Every `[machine]` step runs offline: no network, no provider key, no seal key.

1. **Read the threshold table against the PRD.** Compare `src/gates/prd-14-2.json` and
   `tests/gates/fixtures/prd-14-2-thresholds.json` with `docs/PRD.md` §14.2 — seven rows, seven values,
   comparators included. A softened comparator (`>` instead of `>=`, or `>= 0.98` written as `> 0.97`)
   is the failure this step exists to catch.
2. **Run the suite.** `uv sync --frozen`; `uv run pytest pipelines/evaluation/tests/gates -q`; then
   `uv run pytest` from the repository root. Construction pattern to copy: `GOLD-02`'s
   `tests/runner/**` (golden artifact + per-row negatives).
3. **Seven single-row failures.** For each §14.2 row, force it to fail and assert `FAIL`,
   `release_blocked = true`, non-zero exit, no pack, and the row named in `blocking_reasons`.
4. **Zero-tolerance.** Six rows green, `unsupported_definitive_claims = 1` → `FAIL`. Repeat with
   `critical_date_jurisdiction_errors = 1`.
5. **`UNRESOLVED` matrix.** In turn: empty denominator; dataset check absent; artifact hash mismatch;
   acceptability values unset. Each must be `UNRESOLVED` with a non-zero exit — never `PASS`.
6. **Override hunt.** Grep `src/gates/**` for `force`, `skip`, `waive`, `override`, `allow_fail`,
   `os.environ` — none in the evaluation path. Attempt to construct a `GateVerdict` with an extra field
   → type/validation error. Run the CLI with `--force` → unrecognised option.
7. **Regression fixtures.** Run each §14.2 second-paragraph rule against a baseline: increased
   zero-tolerance count; a material case moving `SUPPORTED` → `INSUFFICIENT_EVIDENCE`; a material case
   moving refusal → definitive. Each blocks and names the case ids.
8. **Baseline discipline.** Attempt `baseline accept` on the candidate's own artifact → refused. Accept
   with `--approved-by`/`--reason` → history appended, previous entry retained.
9. **Pack completeness.** Delete one §43.5 section → schema failure. Set a referenced artifact to
   `UNRESOLVED` → verdict `UNRESOLVED`, no pack. Build twice for the same run id → failure.
10. **Two committed examples.** Read `evals/reports/examples/**`: one `PASS` with a pack, one `FAIL`
    with a verdict and **no** pack. Confirm neither contains research content, case text or blind
    material.
11. **Smoke command.** `python -m evaluation.gates smoke` with the network disabled and no keys present;
    expect a verdict and a deterministic exit code.
12. **Append-only manifest.** `git diff pipelines/evaluation/pyproject.toml` shows additions only.
13. **Reviewer focus.** Confirm the thresholds are data asserted against the PRD, not literals scattered
    through code; confirm no code path can turn `FAIL`/`UNRESOLVED` into `PASS`; confirm a blocked
    release produces no evidence pack at all; confirm the judge is unreachable from the verdict; confirm
    `evals/reports/release-candidate/**` is untouched (that is `GOLD-17`'s tree).

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR → merge →
   `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/21-evaluation-600/README.md` (version +0.1 with a changelog line) **before** changing code.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A §14.2 threshold cannot be met on the release candidate* → **this is a Founder release decision,
     not a code change.** PRD §44.4 permits exactly two outcomes: delay production access, or launch
     with an explicitly visible limited state where the PRD already allows it. Record the measured value
     and the decision in `docs/prd/21-evaluation-600/README.md` and route the decision to the Founder
     via `GOLD-17`/`LNCH-05`. **Never** lower a threshold, add a waiver field, exclude a case, or
     re-scope a metric's denominator to make the number pass.
   - *"Acceptable schema success, cost and latency" is still unset when a release candidate runs* →
     sub-PRD **Q-GOLD-A**. The rows stay `UNRESOLVED` (blocking); the writeback is a Founder decision
     recorded in the README, not a default value chosen here.
   - *Promotion tooling needs a hard interlock on the verdict* → raise a docs PR against `RLSE-07` (and
     `INTL-04`) adding the dependency, plus the new edge in `docs/prd/breakdown-plan.md` §5/§6.2. Do not
     write into `infra/deploy/**` (plan §4.1 serial-owned).
   - *`INTL-06` needs a field the verdict or pack does not carry* → change the **schema here**, in one
     docs PR amending this ticket and `INTL-06`, and regenerate the committed examples. Never let the
     console compute a gate result of its own.
   - *A §43.5 section's producer never delivers an artifact* → keep it `UNRESOLVED`; record the gap in
     `docs/prd/21-evaluation-600/README.md` and in `LNCH-05`'s closure list. An absent section is a known
     gap under PRD §44.4, not a blank field.
   - *`pnpm eval:smoke` still cannot reach this package* → sub-PRD **Q-GOLD-B**; docs PR against `FND-01`
     deliverable 2 and, if needed, `FND-02` deliverable 3.
3. **Falsified protocol.** **A gate that can be overridden is not a gate, and changing a §14.2 value is a
   product change, not an implementation detail.** If pressure appears to add a waiver, an exception
   list, an "approved risk" field or a configurable threshold, stop and escalate for re-review: it
   overturns PRD §14.2, §43.3's no-waiver rule and §44.4's schedule truth. Raise an ADR under
   `docs/adr/` and write back to `docs/prd/21-evaluation-600/README.md` **and**
   `docs/prd/breakdown-plan.md` before any code. `EVAL-002`'s acceptance evidence is precisely that a
   deliberately failing metric prevents promotion.
