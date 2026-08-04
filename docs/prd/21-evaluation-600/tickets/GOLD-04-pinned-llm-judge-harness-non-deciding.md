---
id: GOLD-04
title: "Pinned LLM-judge harness (non-deciding)"
module: 21-evaluation-600
lane: 21-evaluation-600
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [GOLD-02]
blocks: [GOLD-15]
---

# GOLD-04 — Pinned LLM-judge harness (non-deciding)

Implements PRD §14.3 and §14.4 — contributes to requirement **EVAL-002**; epic `E31-EVAL-600`.
No ADR — the decision is already made in PRD §14.3 (a pinned judge may assist with clarity but must not
decide legal correctness, binding status, date applicability or release alone) and PRD §14.4 (the
`EVALUATION_JUDGE` profile); this is build ticket 4 of 17 against it.
Parent sub-PRD: [21-evaluation-600 README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [GOLD-02 — Evaluation runner and metric implementations](GOLD-02-evaluation-runner-and-metric-implementations.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §14.3 already fixes both what the judge may assist with and what it may never decide; this makes
the second half structural.

## Background + basis

**PRD §14.3, the governing sentence, quoted verbatim:**

> A pinned LLM judge MAY assist with **clarity, missing conditions, coherence and usefulness** but
> **MUST NOT decide legal correctness, binding status, date applicability or release alone.**

The first bullet of the same section fixes the division of labour: *"Deterministic checks control
legal/citation launch gates."*

**PRD §14.4 model-profile promotion, quoted verbatim in the part that binds this ticket:**

> Profiles:
>
> - `QUERY_EMBEDDING`
> - `LOCAL_RERANK`
> - `QUICK_SYNTHESIS`
> - `DEEP_SYNTHESIS`
> - `STRUCTURED_REPAIR`
> - **`EVALUATION_JUDGE`**
>
> A candidate MUST pass security/cost compatibility, development, frozen validation, blind testing and
> full non-regression before promotion. … Exact models, tokenizer settings, hot vector count,
> release-size/concurrency limits and provider token/time ceilings are benchmark-selected
> configuration—not permanent requirements.

**PRD §17.3:** *"No unvalidated fallback is permitted during provider failure or budget exhaustion."*
A judge that silently falls back to a different model is no longer *pinned*, so a provider failure here
produces an absent judgement, never a substituted one.

**PRD §9.4 and §36.6** put deterministic validation on the answer path; the judge is not on that path
and must never become a second, softer validator. `12-evidence-safety`'s sub-PRD records the same
boundary from the other side: *"**Use an LLM judge as the validator** (or as a tiebreaker on a §36.6
check)"* is a **rejected alternative** there, with this ticket named as where the judge legitimately
lives.

**Requirement context.** `EVAL-002` (PRD §30.2) blocks a release unless every numeric and
zero-tolerance gate passes; those gates are computed by `GOLD-02` and applied by `GOLD-03`. This ticket
adds review assistance **outside** that path, so a Founder reviewing PRD §43.4's queue has structured
help — and so that help can never become the decision.

**What is already decided elsewhere and must not be re-decided here.** `GOLD-02` owns the seven §43.3
metrics and the run artifact; `GOLD-03` owns thresholds and the verdict; `EVID-07` owns the model
gateway, the approved profiles and provider adapters (`packages/model-gateway/**`) — this ticket does
not import it, because plan §5.22 gives it no `EVID-07` edge (that edge belongs to `GOLD-15`). The
judge therefore runs behind a **port** with recorded cassettes, and `GOLD-15` is where a real profile is
wired.

**Sub-PRD decisions carried forward:** **D10** (structurally non-deciding), **D16** (offline; recorded
cassettes; record mode off by default), **D17** (Python), **D19** (test layout).

**Accepted caveats carried forward:**

- **The exact judge model is a benchmark-selected parameter** — plan §8 **Q1** / sub-PRD **Q2**, owned
  by this module and selected by measured evidence through `GOLD-15`'s promotion report; the Founder
  approves production promotion **after** seeing that evidence rather than choosing a model beforehand.
  This ticket builds against the profile abstraction and a cassette-backed stub, exactly as `EVID-07`
  does for synthesis.
- **The judge costs money.** PRD §24.1 caps founder-funded monthly spend at A$50 and `EVID-08` owns the
  breaker. Judge runs are therefore opt-in, bounded per run, cost-reported per profile, and never part
  of a per-PR CI job (sub-PRD **D16**).

## Goal

Produce `pipelines/evaluation/src/judge/**`: a pinned, replayable judging harness that scores answers
on exactly the four PRD §14.3 assistive dimensions and is **structurally incapable** of expressing a
legal-correctness, binding-status, date-applicability or pass/fail judgement — no such field exists in
its output type, no gate can import it, and its record carries the pinned profile id, model version and
prompt hash so a judgement is attributable and reproducible. Completion is mechanically checkable:
`uv run pytest pipelines/evaluation/tests/judge` is green offline with no provider key; the judgement
type's field set is asserted to be exactly the four dimensions plus provenance; and an import-graph test
proves `evaluation.gates` and `evaluation.runner.metrics` cannot reach this package.

## Non-goals

- **No metric, threshold, verdict or gate** — `GOLD-02` (merged; blocker) and `GOLD-03`. The judge
  contributes to none of them, by construction.
- **No legal correctness, binding status, date applicability or release decision** — PRD §14.3 forbids
  it; `EVID-05`'s deterministic validator and `GOLD-02`'s metrics decide those, and PRD §43.4 makes the
  human the reviewer of record.
- **No model gateway, provider adapter, budget reservation or BYOK** — `12-evidence-safety` (`EVID-07`,
  `EVID-08`, `EVID-09`). Reached through a port; wired by `GOLD-15`.
- **No profile selection or promotion** — `GOLD-15` (`blocked_by` this ticket).
- **No case content or gold** — `GOLD-05` … `GOLD-14`. The judge never authors, edits or proposes case
  data (PRD §43.4).
- **No blind-material access** — `GOLD-01`'s seal governs; the judge is not a route around it, and the
  harness refuses blind input without the key exactly as the runner does.
- **No CI schedule** — `00-foundation` (`FND-02`); sub-PRD **Q-GOLD-E**.

## File-scope (write-owns)

Owned by this ticket:

- `pipelines/evaluation/src/judge/**`
- `pipelines/evaluation/tests/judge/**` (sub-PRD **D19**)
- `pipelines/evaluation/pyproject.toml` — **append-only**, own dependencies and the `evaluation.judge`
  entry point only

Does not touch:

- `pipelines/evaluation/src/{dataset,runner,gates,promotion,coverage}/**` — `GOLD-01`, `GOLD-02`,
  `GOLD-03`, `GOLD-15`, `GOLD-16`.
- `evals/**` — `GOLD-01`, `GOLD-03`, `GOLD-05` … `GOLD-14`, `GOLD-17`. The judge writes no case, gold,
  split or report file; its records are attached to a run directory by its caller.
- `packages/model-gateway/**`, `packages/citations/**`, `packages/pii/**` — `12-evidence-safety`.
- `apps/**`, `services/**`, `infra/**`, `.github/workflows/**`, root manifests — other modules per plan
  §4/§4.1. `docs/PRD.md`, `.claude/**` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). `pipelines/evaluation/src/judge/**` is written by no other ticket (plan §5.22). This is a
module wave-3 ticket; its only concurrent sibling is `GOLD-03` (`src/gates/**`, `evals/reports/**`) —
disjoint trees with no import edge in either direction (the *absence* of that edge is deliverable 5).
Its declared blocker `GOLD-02` lands first (module wave 2); its dependent `GOLD-15` is `blocked_by` this
ticket and never concurrent. Shared append-only file: `pipelines/evaluation/pyproject.toml`.

## Deliverables

1. **`src/judge/schema.py` — the judgement type, and what it cannot say.** `Judgement` is a frozen
   dataclass whose field set is **exactly**:
   `case_id`, `run_id`, `profile_id`, `model_version`, `prompt_hash`, `rubric_version`, `judged_at`,
   `clarity`, `missing_conditions`, `coherence`, `usefulness`, `notes`, `cost`, `latency_ms`.
   The four dimension fields are the PRD §14.3 list, each an ordinal band (`POOR|ADEQUATE|GOOD`) plus an
   optional free-text observation. There is **no** field — and no permitted extra key — for legal
   correctness, binding status, date applicability, jurisdiction, effective date, citation validity,
   pass/fail, score, confidence, recommendation, or release readiness. A test asserts the field set
   equals this list exactly, so adding one is a visible, reviewable diff.
2. **`src/judge/rubric/**` — the pinned rubric.** One versioned prompt per dimension, content-hashed;
   the hash is recorded on every judgement. The rubric text explicitly instructs that legal correctness,
   dates, jurisdiction and binding status are **not** being assessed and that the judge must not
   propose changes to a case or its gold (PRD §43.4). A change to a rubric file changes `rubric_version`
   and `prompt_hash`, so judgements from two rubrics can never be silently compared.
3. **`src/judge/port.py` — the provider port.** One interface `JudgeProvider.judge(request) ->
   RawJudgement` with two implementations: `CassetteProvider` (default; replays recorded responses keyed
   by `(prompt_hash, case_id, model_version)`) and `ProfileProvider` (calls the `EVALUATION_JUDGE`
   profile through the injected gateway callable that `GOLD-15` supplies). No provider SDK is imported
   in this package. Record mode exists, is off by default, requires an explicit flag plus a key from the
   environment, and is asserted never to run in CI (sub-PRD **D16**).
4. **`src/judge/run.py::judge_run(artifact, cases, provider, budget) -> JudgementSet`** — iterates the
   selected observations, enforces a per-run **hard cap** on judge calls and cost, and produces one
   `Judgement` per case. Failures are recorded as **absent judgements** with a reason code; there is no
   retry onto a different model and no fallback profile (PRD §17.3). Blind cases follow `GOLD-01`'s
   rules: without `EVAL_BLIND_KEY_FILE` the harness refuses to judge them, and a judgement for a blind
   case carries ids and bands only — never text.
5. **`src/judge/isolation.py` + an import-graph test — the structural guarantee.** Asserted in both
   directions:
   - nothing under `pipelines/evaluation/src/gates/**` or `src/runner/metrics/**` imports
     `evaluation.judge` (sub-PRD **D10**);
   - `evaluation.judge` imports no threshold, no verdict type and no metric implementation, so a
     judgement cannot be silently folded into a gated number;
   - `Judgement` is not serialisable into the `GOLD-03` evidence-pack sections that carry metrics; it
     appears only in the advisory section of a review bundle, labelled `ADVISORY_NON_DECIDING`.
6. **`src/judge/report.py`** — an advisory review bundle: judgements grouped by PRD §43.4 band and by
   primary category, each item carrying the case id, the four bands, and a fixed header line stating
   *"Advisory only — PRD §14.3: the judge does not decide legal correctness, binding status, date
   applicability or release."* The bundle is written to the caller-supplied run directory; this ticket
   writes no path under `evals/**` itself.
7. **`src/judge/cli.py`** — `python -m evaluation.judge run --artifact <path> [--cases …]
   [--provider cassette|profile] [--max-calls N] [--max-cost N]`, defaulting to `cassette`. Exit code
   reflects **harness** success only (all selected cases produced a judgement or a recorded absence);
   dimension bands never affect the exit code, because a judge that can fail a build has decided
   something.
8. **`tests/judge/**`** — offline fixtures (sub-PRD **D18**): recorded cassettes for a good answer, a
   vague answer and a missing-condition answer; a field-set test for `Judgement`; a rubric-hash test; a
   provider-failure fixture asserting an absent judgement with no substitution; a budget-cap fixture; a
   blind fixture asserting refusal without a key and text-free output with one; and the two-direction
   import-graph test.
9. **`pipelines/evaluation/README.md` update** — append the four assistive dimensions, the four
   forbidden judgements quoted from PRD §14.3, the pinning fields recorded on every judgement, and the
   sentence that no gate imports this package.

## Acceptance checklist (classified)

- [ ] `[machine]` **The judge cannot express a forbidden judgement**: `Judgement`'s field set is exactly
      the declared list; adding `correctness`, `binding_status`, `date_applicable`, `verdict`, `score`,
      `confidence` or `recommendation` fails the field-set test and schema validation. (PRD §14.3;
      sub-PRD D10)
- [ ] `[machine]` **The judge cannot reach a gate**: import-graph tests prove `evaluation.gates` and
      `evaluation.runner.metrics` do not import `evaluation.judge`, and that `evaluation.judge` imports
      no threshold, verdict or metric module. (PRD §14.3; §43.3)
- [ ] `[machine]` **The judge scores exactly the four PRD §14.3 dimensions** — clarity, missing
      conditions, coherence, usefulness — and the rubric text states what is *not* being assessed.
      (PRD §14.3)
- [ ] `[machine]` **Pinning is recorded**: every judgement carries `profile_id`, `model_version`,
      `prompt_hash` and `rubric_version`; changing a rubric file changes the hash and the version.
      (PRD §14.4 *"pinned"*; §30.2 `ANS-004` discipline applied to evaluation)
- [ ] `[fixture]` **Replay works offline**: with `CassetteProvider`, a full judged run reproduces
      byte-identical judgements with no network and no provider key. (Plan §1.1; PRD §20.3; sub-PRD D16)
- [ ] `[machine]` **No unvalidated fallback**: a provider failure yields an **absent** judgement with a
      reason code — never a different model, a cached judgement from another rubric, or a defaulted
      band. (PRD §17.3; §14.4 *"Every fallback requires independent approval"*)
- [ ] `[machine]` **Budget is bounded**: `--max-calls` / `--max-cost` stop the run and record the stop;
      cost and latency are reported per profile. (PRD §24.1; §43.3 closing paragraph)
- [ ] `[machine]` **Blind safety**: judging a blind case without `EVAL_BLIND_KEY_FILE` fails with
      `BlindKeyUnavailable`; with an ephemeral test key the judgement contains ids and bands only, and
      the leak scan finds no blind shingle. (PRD §14.3; sub-PRD D20)
- [ ] `[machine]` **The judge never proposes case data**: the rubric forbids it and a test asserts no
      output field can carry a proposed case, gold authority or expected status. (PRD §43.4 *"Agents may
      not 'fix' a failing gold case by changing expected output"*)
- [ ] `[machine]` **Exit code independence**: a run in which every case scores `POOR` on all four
      dimensions still exits 0 when the harness succeeded. (PRD §14.3 — the judge decides nothing)
- [ ] `[machine]` **Record mode is off by default** and cannot run without an explicit flag plus an
      environment-supplied key; a CI-marker test asserts it is never enabled in the test suite. (PRD
      §20.2, §20.3; sub-PRD D16)
- [ ] `[machine]` `uv sync --frozen` then `uv run pytest` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm test` green — unaffected; no TypeScript. `cargo test --workspace` unaffected; no
      Rust. (PRD §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs (contributes **EVAL-002**), user-visible
      change and non-goals, schema compatibility impact (`Judgement` consumed by `GOLD-15` and `GOLD-17`
      advisory bundles), **tenant/PII/security and retention impact** (no customer data; provider
      retention is the `EVID-07` profile's concern; blind material never sent), source/licence impact
      (none), **model/token/cost impact** (judge calls are capped and reported per profile against the
      PRD §24.1 ceiling), rollback path, known gaps (**Q2** — the judge model stays benchmark-selected until
      `GOLD-15` measures and records it).

Absent classes: no `[human]` criteria — this ticket's whole point is that human judgement stays with the
Founder in PRD §43.4 and is *not* delegated here; `GOLD-17` owns the human review. `[fixture]` items are
cassette replays.

## Test plan

Every step runs offline: no network, **no provider key**, **no seal key** except the ephemeral test pair.

1. **Read the rubric against PRD §14.3.** Confirm the four dimensions are exactly clarity, missing
   conditions, coherence and usefulness, and that the rubric states the four forbidden judgements in the
   PRD's own words.
2. **Run the suite.** `uv sync --frozen`; `uv run pytest pipelines/evaluation/tests/judge -q`; then
   `uv run pytest` from the repository root. Construction pattern to copy: `EVID-07`'s recorded-cassette
   provider tests and `GOLD-02`'s golden-artifact replay.
3. **Field-set proof.** Assert `Judgement`'s fields equal the declared list. On a scratch branch add a
   `correctness` field and confirm the test fails; discard.
4. **Import-graph proof.** Assert no path from `evaluation.gates` or `evaluation.runner.metrics` to
   `evaluation.judge`, and none from `evaluation.judge` to thresholds, verdict or metric modules.
5. **Cassette replay.** Judge the three recorded answers twice; diff the judgements; expect no bytes
   changed. Confirm the run needs no key and no network.
6. **Provider failure.** Script a failing provider; assert an absent judgement with a reason code, no
   substitution and no retry against another model.
7. **Budget cap.** Set `--max-calls 2` over five cases; assert the run stops, records the stop and
   reports cost.
8. **Blind matrix.** Judge a blind case with no key → `BlindKeyUnavailable`. With the ephemeral key →
   judgement carries ids and bands only; run `GOLD-01`'s leak scan over the output — clean.
9. **Exit-code independence.** Force all-`POOR` bands; assert exit 0.
10. **Rubric hash.** Change one rubric character; assert `prompt_hash` and `rubric_version` change and
    that judgements from the two rubrics are not comparable in the report.
11. **Append-only manifest.** `git diff pipelines/evaluation/pyproject.toml` shows additions only.
12. **Reviewer focus.** Confirm the *absence* is structural, not documentary: there is no forbidden
    field, no gate import, no exit-code influence and no path by which a judgement becomes a §14.2
    number. Confirm the advisory bundle is labelled `ADVISORY_NON_DECIDING` wherever it is rendered.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR → merge →
   `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/21-evaluation-600/README.md` (version +0.1 with a changelog line) **before** changing code.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A reviewer wants the judge to flag likely legal errors so the queue is shorter* → refuse, and
     record the request in `docs/prd/21-evaluation-600/README.md` **D10**. PRD §14.3 forbids the judge
     deciding legal correctness; the legitimate route is a **deterministic** check in `GOLD-02` or a
     `EVID-05` validator rule (docs PR against that ticket).
   - *`GOLD-15` needs a judgement field this type does not have* → change the type **here**, in one docs
     PR amending both tickets, and re-justify against the four PRD §14.3 dimensions. A field that
     encodes correctness is not addable at any price.
   - *The judge's bands correlate poorly with founder review and look unhelpful* → that is a rubric
     question. Bump `rubric_version`, record the observation in the README, and keep the old rubric's
     judgements distinguishable. Do not compensate by widening what the judge assesses.
   - *A provider key is needed for CI so judging is uniform* → refuse; sub-PRD **D16** and PRD §20.2 keep
     provider credentials out of agent/CI contexts. Cassettes are the uniform path.
   - *The `EVALUATION_JUDGE` profile is still unchosen* → sub-PRD **Q2** (plan §8 Q1), resolved by
     `GOLD-15`; the cassette provider is the interim and needs no decision.
3. **Falsified protocol.** **If the judge is ever needed to decide a gated outcome, that overturns PRD
   §14.3 — a product-safety rule, not a tooling preference.** Do not add a "tiebreak" mode, an
   "auto-approve when the judge is confident" path, or a correctness field behind a flag. Stop, escalate
   for re-review, raise an ADR under `docs/adr/`, and write back to
   `docs/prd/21-evaluation-600/README.md` **and** `docs/prd/breakdown-plan.md` before any code. The
   product's central claim is deterministic validation (PRD §9.4, §21); a model-decided gate would make
   that claim untestable.
