---
id: GOLD-15
title: "Model and retrieval profile promotion with non-regression report"
module: 21-evaluation-600
lane: 21-evaluation-600
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [GOLD-03, GOLD-04, RETR-10, EVID-07]
blocks: [GOLD-17]
---

# GOLD-15 — Model and retrieval profile promotion with non-regression report

Implements PRD §14.4, §17.3 and §36.2 — contributes to requirements **EVAL-002** and **ANS-004**; epic
`E33-PROMOTION` (PRD §44.2).
No ADR — the decision is already made in PRD §14.4 (*"A candidate MUST pass security/cost compatibility,
development, frozen validation, blind testing and full non-regression before promotion"*); this is build
ticket 15 of 17 against it.
Parent sub-PRD: [21-evaluation-600 README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [GOLD-03 — Release gate enforcement and release evidence pack](GOLD-03-release-gate-enforcement-and-release-evidence-pack.md), [GOLD-04 — Pinned LLM-judge harness (non-deciding)](GOLD-04-pinned-llm-judge-harness-non-deciding.md), [RETR-10 — Retrieval benchmark harness](../../11-retrieval-engine/tickets/RETR-10-retrieval-benchmark-harness.md), [EVID-07 — Model gateway: profiles, providers, schema enforcement](../../12-evidence-safety/tickets/EVID-07-model-gateway-profiles-providers-schema-enforcement.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §14.4 already fixes the promotion sequence and its preconditions; this makes the sequence executable
and its evidence auditable.

## Background + basis

**PRD §14.4 model-profile promotion, quoted verbatim — the whole contract of this ticket:**

> Profiles:
>
> - `QUERY_EMBEDDING`
> - `LOCAL_RERANK`
> - `QUICK_SYNTHESIS`
> - `DEEP_SYNTHESIS`
> - `STRUCTURED_REPAIR`
> - `EVALUATION_JUDGE`
>
> **A candidate MUST pass security/cost compatibility, development, frozen validation, blind testing and
> full non-regression before promotion. Every fallback requires independent approval. Embedding changes
> require a dual index, retrieval recall/resource comparison and pointer rollback. Production customer
> shadowing requires explicit anonymised-improvement opt-in; synthetic traffic is the default.**
>
> Exact models, tokenizer settings, hot vector count, release-size/concurrency limits and provider
> token/time ceilings are benchmark-selected configuration—not permanent requirements.

**PRD §36.2, quoted verbatim — why "frozen validation" is a mechanical state, not a phase name:**

> These are buildable initial defaults, stored in a versioned retrieval profile. **They must be tuned on
> the development set and frozen for validation/release.**

**PRD §17.3, quoted verbatim:** *"**No unvalidated fallback is permitted during provider failure or
budget exhaustion.**"*

**PRD §14.3, binding on the blind stage:** *"**Blind gold answers MUST remain outside ordinary
coding-agent context.**"* Consequently the blind stage of a promotion **cannot run** in CI or in a
coding-agent session: `GOLD-01`'s `open_blind` requires the key path supplied from the environment
through `EVAL_BLIND_KEY_FILE` — no default path, no in-repository lookup, no keyring fallback — the
Founder is the **sole custodian** of that key, and **only the Founder may start a blind stage**. Blind
stage output is limited to content-free metrics, category summaries and case ids. That is settled by
breakdown plan §8 **Q6** (confirmed) and recorded as sub-PRD **D2**/**D22**.

**PRD §44.2, epic `E33-PROMOTION`** (week 7): *"Model/retrieval profile selection, app/corpus release
drill"*, exit evidence *"Validation/blind/non-regression report"*.

**The benchmark-selected parameters this ticket resolves** (breakdown plan §8, mirrored in the
sub-PRD): plan **Q1** / sub-PRD **Q2**, the exact hosted model per profile; plan **Q2** / sub-PRD
**Q3**, the embedding model, tokenizer, dimensions, normalisation and quantisation (measured with
`CRPS-05` and `RETR-10`); plan **Q4** / sub-PRD **Q4**, the retrieval profile constants, *"frozen for
validation by `GOLD-15`"*. None of them is an open Founder question. Each is selected by measured
evidence through this ticket's promotion report, and the Founder approves production promotion
**after** seeing that evidence rather than picking a model or a constant on preference beforehand
(PRD §14.4). Recording the measured values is an acceptance item, not a side effect.

**What is already decided elsewhere and must not be re-decided here.** `GOLD-02` owns metrics and run
artifacts; `GOLD-03` owns thresholds, verdicts, baselines and the evidence pack (this ticket **calls**
its evaluator and never re-applies a threshold); `GOLD-04` owns the non-deciding judge; `RETR-10` owns
the retrieval benchmark harness and its `retrieval-benchmark-report.json`; `EVID-07` owns the model
gateway, the approved-profile registry and provider adapters; `CRPS-05` owns the embedding build and its
manifest; `RLSE-06`/`RLSE-07` own promotion of the app and corpus releases themselves.

**Sub-PRD decisions carried forward:** **D9** (recorded, replayable runs), **D11** (`PASS`/`FAIL`/
`UNRESOLVED`, no override), **D12** (thresholds are frozen data), **D13** (an unmeetable gate is a
Founder decision), **D16** (offline by default; cassettes), **D17**, **D19**.

**Accepted caveats carried forward:**

- **This ticket never promotes anything.** It produces a promotion **decision record** whose terminal
  state requires an explicit Founder approval; PRD §14.4 makes promotion approval the Founder's, and
  `RLSE-06`/`RLSE-07`/`INTL-04` own the act of promoting.
- **Live stages cost money and need credentials.** A development or validation stage against real
  providers runs only where a key exists, is bounded by the PRD §24.1 A$50 ceiling through `EVID-08`'s
  reservation, and never runs in CI. The ticket's `[machine]`/`[fixture]` acceptance is entirely
  cassette- and artifact-based.
- **Blind is the one stage a Builder cannot complete.** Its acceptance item is `[human]` and belongs to
  the Founder, the sole private-key custodian and the only person who may start a blind stage (plan §8
  **Q6**; sub-PRD **D22**).

## Goal

Produce `pipelines/evaluation/src/promotion/**`: an executable PRD §14.4 promotion sequence —
security/cost compatibility, development, **frozen** validation, blind, full non-regression — driven by
`GOLD-02` runs and `GOLD-03` verdicts, with a profile-freeze mechanism that makes "tuned on development,
frozen for validation" a checkable state rather than a promise, the PRD §14.4 embedding-change extras
(dual index, recall/resource comparison, pointer rollback), an independent-approval requirement for every
fallback, and one immutable promotion decision record that carries the resolved benchmark-selected
parameters (plan §8 Q1/Q2/Q4) and cannot reach `APPROVED` without a Founder act. Completion is
mechanically checkable: `uv run pytest pipelines/evaluation/tests/promotion` is green offline; a
candidate that skips a stage, changes a frozen constant, or lacks the blind stage cannot reach
`READY_FOR_APPROVAL`; and the decision record has no field by which code can approve itself.

## Non-goals

- **No metric or threshold implementation** — `GOLD-02`, `GOLD-03`. This ticket orchestrates them.
- **No judge decision-making** — `GOLD-04`; judgements are advisory context in the report and are never
  an input to a stage outcome (sub-PRD **D10**).
- **No model gateway, provider adapter, profile registry or budget breaker** — `12-evidence-safety`
  (`EVID-07`, `EVID-08`). Consumed through their public interfaces.
- **No retrieval implementation, index build or benchmark harness** — `11-retrieval-engine` (`RETR-01` …
  `RETR-10`) and `04-corpus-contract` (`CRPS-05`). This ticket reads `RETR-10`'s report and freezes the
  profile that produced it.
- **No app or corpus release promotion, active pointer or rollback execution** — `18-ops-release`
  (`RLSE-06`, `RLSE-07`) and `22-internal-admin` (`INTL-04`).
- **No customer shadowing implementation** — PRD §14.4 permits it only with explicit
  anonymised-improvement opt-in; this ticket encodes synthetic traffic as the default and records the
  opt-in requirement as a precondition it checks, not a feature it builds.
- **No release-candidate full-600 run or founder review** — `GOLD-17` (`blocked_by` this ticket).
- **No blind gold access without the key** — PRD §14.3; the stage fails closed.

## File-scope (write-owns)

Owned by this ticket:

- `pipelines/evaluation/src/promotion/**`
- `pipelines/evaluation/tests/promotion/**` (sub-PRD **D19**)
- `pipelines/evaluation/pyproject.toml` — **append-only**, own dependencies and the
  `evaluation.promotion` entry point only

Does not touch:

- `pipelines/evaluation/src/{dataset,runner,gates,judge,coverage}/**` — `GOLD-01` … `GOLD-04`, `GOLD-16`.
- `evals/**` — `GOLD-01`, `GOLD-03`, `GOLD-05` … `GOLD-14`, `GOLD-17`. Promotion runs write into a
  caller-supplied run directory through `GOLD-03`'s writer; this ticket commits no report.
- `packages/model-gateway/**`, `packages/citations/**` — `12-evidence-safety`; `services/search-rs/**`,
  `packages/retrieval-client/**` — `11-retrieval-engine`; `pipelines/embeddings/**` —
  `04-corpus-contract`.
- `infra/deploy/**` — `18-ops-release` (plan §4.1 serial-owned); `apps/**` — product modules.
- Root manifests, `.github/workflows/**`, `packages/contracts/**` — `00-foundation` (plan §4.1).
  `docs/PRD.md`, `.claude/**` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). `pipelines/evaluation/src/promotion/**` is written by no other ticket (plan §5.22). This is a
module wave-4 ticket: `GOLD-03` and `GOLD-04` are merged blockers, the ten authoring tickets are
complete or in flight in a disjoint data tree, and `GOLD-16` owns `src/coverage/**`. Its dependent
`GOLD-17` is `blocked_by` this ticket. All four declared blockers land first: `GOLD-03` and `GOLD-04`
(module wave 3), `RETR-10` (`11-retrieval-engine` final wave) and `EVID-07` (`12-evidence-safety` wave
1). Shared append-only file: `pipelines/evaluation/pyproject.toml`.

## Deliverables

1. **`src/promotion/candidate.py` — what a candidate is.** `PromotionCandidate` names the profile
   (`QUERY_EMBEDDING`, `LOCAL_RERANK`, `QUICK_SYNTHESIS`, `DEEP_SYNTHESIS`, `STRUCTURED_REPAIR`,
   `EVALUATION_JUDGE` — exactly PRD §14.4's list, asserted against a transcription fixture), the
   candidate model/version or retrieval-profile id, the incumbent it would replace, the corpus release,
   and the change class (`MODEL`, `RETRIEVAL_PROFILE`, `EMBEDDING`, `FALLBACK`).
2. **`src/promotion/stages/**` — one module per PRD §14.4 stage**, each returning a
   `StageResult{outcome: PASS|FAIL|UNRESOLVED, evidence_refs, blocking_reasons}`:

   | # | Stage id | What it checks | Basis |
   |---:|---|---|---|
   | 1 | `SECURITY_COST_COMPATIBILITY` | provider retention/no-training preconditions declared by `EVID-07`'s profile, token/time ceilings set, projected cost within the PRD §24.1 ceiling with `EVID-08`'s reservation arithmetic, no new tool surface | §14.4, §10.2, §24.1, §37.5 |
   | 2 | `DEVELOPMENT` | a `GOLD-02` run over the 360 development cases, evaluated by `GOLD-03` | §14.3, §14.4 |
   | 3 | `FROZEN_VALIDATION` | the retrieval/model profile is **frozen** (deliverable 3) *before* the 120 validation cases run; a profile hash change between tuning and validation invalidates the stage | §36.2, §14.4 |
   | 4 | `BLIND` | a `GOLD-02` run over the 120 blind cases, which requires the seal key and therefore a session the Founder starts, with content-free output only | §14.1, §14.3, §43.1; plan §8 **Q6** |
   | 5 | `FULL_NON_REGRESSION` | `GOLD-03`'s baseline comparison over all 600 against the accepted baseline: no critical regression, no supported-to-unsupported or refusal-to-definitive degradation | §14.2, §43.3 |

   Stages are **ordered and non-skippable**: a later stage cannot start while an earlier one is not
   `PASS`, and the sequence is a state machine whose transitions are the only way to advance
   (deliverable 6).
3. **`src/promotion/freeze.py` — the freeze, made mechanical.** `freeze(profile) -> FrozenProfile`
   canonicalises the retrieval/model profile, computes `profile_sha256`, and records it in the decision
   record. Every subsequent stage records the hash of the profile it ran under; the sequence **fails**
   if the validation or blind stage ran under a different hash than the freeze. PRD §36.2's *"tuned on
   the development set and frozen for validation/release"* is thereby enforced rather than asserted.
4. **`src/promotion/embedding.py` — the PRD §14.4 embedding extras.** When `change_class == EMBEDDING`,
   three additional requirements must be satisfied or the sequence is `UNRESOLVED`:
   - a **dual index** exists (old and new embedding profiles both loadable) — evidenced by `CRPS-05`'s
     embedding manifest pair;
   - a **retrieval recall/resource comparison** from `RETR-10`'s `retrieval-benchmark-report.json`,
     comparing recall@10, latency percentiles, startup time and peak RSS for both profiles;
   - a **pointer rollback** plan referencing `RLSE-07`'s corpus-pointer mechanism, recorded as a
     `ReferencedArtifact`.
5. **`src/promotion/fallback.py` — independent approval for every fallback.** A candidate whose
   `change_class == FALLBACK` requires a **separate** approval record naming an approver distinct from
   the primary candidate's, and the profile must itself be an approved §14.4 profile — PRD §17.3's *"no
   unvalidated fallback"* is enforced by making an unapproved fallback unrepresentable in the record.
6. **`src/promotion/decision.py` — the immutable decision record.** States:
   `DRAFT → STAGES_RUNNING → READY_FOR_APPROVAL → APPROVED | REJECTED`. It carries the candidate, the
   five stage results with their evidence references, the frozen profile hash, the embedding extras where
   applicable, the resolved benchmark-selected parameters (deliverable 8), `GOLD-04`'s advisory
   judgements labelled `ADVISORY_NON_DECIDING`, cost and latency by profile and task type, and a
   `content_sha256`. **`APPROVED` requires a Founder approval record** (approver, timestamp, reason);
   there is no code path that sets it, no `--approve` flag in the CLI, and a test asserts the transition
   function rejects `APPROVED` without an approval record. PRD §14.4 makes promotion approval the
   Founder's.
7. **`src/promotion/shadowing.py` — the default is synthetic.** A precondition check that refuses any
   run configured against production customer traffic unless an explicit anonymised-improvement opt-in
   record is present; the default traffic source is the synthetic evaluation dataset. PRD §14.4:
   *"Production customer shadowing requires explicit anonymised-improvement opt-in; synthetic traffic is
   the default."*
8. **`src/promotion/parameters.py` — the benchmark-selected parameters, recorded as versioned data.**
   The decision record carries the resolved values for plan §8 **Q1** (exact hosted model per profile;
   sub-PRD **Q2**), plan §8 **Q2** (embedding model, tokenizer, dimensions, normalisation and
   quantisation, taken from `CRPS-05`'s manifest; sub-PRD **Q3**) and plan §8 **Q4** (retrieval profile
   constants, taken from the frozen profile; sub-PRD **Q4**), each with the run artifact that justifies
   it. Plan §8 **Q3** is a different entry — always-hot vectors and semantic-cache size, deferred to
   `RLSE-11` — and is never written from here. These are configuration, not thresholds: PRD §14.4 calls them *"benchmark-selected
   configuration—not permanent requirements"*, and PRD §45.5 classifies them as such.
9. **`src/promotion/cli.py`** — `python -m evaluation.promotion run --candidate <file>
   [--stage <id>] [--artifact-dir <dir>]`, `freeze --profile <file>`, `report --decision <file>`. Exit
   non-zero on any `FAIL` or `UNRESOLVED`. No `--approve`, `--skip-stage`, `--force` or equivalent, and a
   test asserts the option surface contains none.
10. **`tests/promotion/**`** — offline fixtures (sub-PRD **D18**): a full five-stage passing sequence
    built from recorded `GOLD-02` artifacts and `GOLD-03` verdicts; per-stage failure fixtures; a
    profile-hash-mismatch fixture proving frozen validation fails; an embedding candidate missing each of
    the three extras; a fallback without an independent approver; a blind stage without a key (must be
    `UNRESOLVED`, never skipped); a self-approval attempt (must be rejected); and a shadowing
    configuration without opt-in.
11. **`pipelines/evaluation/README.md` update** — append the five stages, the freeze rule, the embedding
    extras, the fallback rule, the decision-record states and the sentence that promotion approval is the
    Founder's.

## Acceptance checklist (classified)

- [ ] `[machine]` **The five PRD §14.4 stages exist, in order, and are non-skippable**: a candidate that
      attempts validation before development, or blind before frozen validation, fails. (PRD §14.4)
- [ ] `[machine]` **Frozen validation is mechanical**: a profile whose `profile_sha256` changed between
      the freeze and the validation run makes the stage `FAIL`, not a warning. (PRD §36.2 *"tuned on the
      development set and frozen for validation/release"*)
- [ ] `[machine]` **The profile list is exactly PRD §14.4's six**, asserted against a transcription
      fixture. (PRD §14.4)
- [ ] `[machine]` **Embedding extras enforced**: an `EMBEDDING` candidate missing the dual index, the
      recall/resource comparison or the pointer-rollback reference is `UNRESOLVED`. (PRD §14.4)
- [ ] `[machine]` **Fallback needs independent approval**: a `FALLBACK` candidate with the same approver
      as the primary, or naming a non-approved profile, is rejected. (PRD §14.4; §17.3)
- [ ] `[machine]` **No self-approval**: the decision record cannot reach `APPROVED` without a Founder
      approval record; the CLI has no `--approve`; a test asserts the transition function's guard.
      (PRD §14.4)
- [ ] `[machine]` **Synthetic traffic is the default**: a run configured against production customer
      traffic without an explicit anonymised-improvement opt-in record is refused. (PRD §14.4)
- [ ] `[machine]` **The blind stage fails closed**: without `EVAL_BLIND_KEY_FILE` the stage is
      `UNRESOLVED` and the sequence cannot reach `READY_FOR_APPROVAL` — it is never skipped, defaulted or
      marked "not applicable". (PRD §14.3, §14.1; sub-PRD D2)
- [ ] `[machine]` **No thresholds are re-implemented here**: gate outcomes come from `GOLD-03`; a grep of
      `src/promotion/**` finds no §14.2 value. (Sub-PRD D12)
- [ ] `[machine]` **The judge is advisory only**: judgements appear in the decision record labelled
      `ADVISORY_NON_DECIDING` and change no stage outcome; an import/dataflow test proves it. (PRD §14.3;
      sub-PRD D10)
- [ ] `[fixture]` **Full sequence replay**: the recorded five-stage fixture reproduces the same decision
      record bit-for-bit offline, with no provider key and no seal key. (Plan §1.1; sub-PRD D9, D16)
- [ ] `[machine]` **Cost and latency reported by profile and task type**, including the projected
      monthly cost against the PRD §24.1 A$50 ceiling. (PRD §43.3; §24.1; §14.4 stage 1)
- [ ] `[machine]` `uv sync --frozen` then `uv run pytest` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm test` green — unaffected; no TypeScript. `cargo test --workspace` unaffected; no
      Rust (the benchmark harness is `RETR-10`'s). (PRD §45.3)
- [ ] `[machine]` **Writeback item**: the resolved benchmark-selected parameters are written back to
      `docs/prd/21-evaluation-600/README.md` (**Q2**, **Q3**, **Q4**) **and** to
      `docs/prd/breakdown-plan.md` §8 (Q1, Q2, Q4), with the decision-record hash as evidence. (Plan §8;
      PRD §45.5 "Benchmark-selected configuration"; CLAUDE.md issue #53)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs (contributes **EVAL-002**, **ANS-004**),
      user-visible change and non-goals, schema compatibility impact (the decision-record contract
      consumed by `GOLD-17`, `INTL-06` and `LNCH-05`), **tenant/PII/security and retention impact** (no
      customer traffic by default; provider retention checked in stage 1; blind material never rendered),
      source/licence impact (none), **model/token/cost impact** (live stages are bounded and reported),
      rollback path (pointer rollback for embedding changes), known gaps (**Q-GOLD-A** may leave the
      acceptability rows `UNRESOLVED`).
- [ ] `[human]` **Blind stage execution started by the Founder**, the sole private-key custodian, with
      the key supplied through `EVAL_BLIND_KEY_FILE` and the stage's output limited to content-free
      metrics, category summaries and case ids (PRD §14.3; plan §8 **Q6** items 13–15; sub-PRD **D22**).
      A Builder cannot complete this item, and no code path may substitute for it.
- [ ] `[human]` **Founder approval of the promotion decision**, with reason recorded. PRD §14.4 reserves
      promotion approval to the Founder; the tool only prepares the evidence. (PRD §14.4; §45.5)

Absent classes: none — this ticket has `[machine]`, `[fixture]` and `[human]` criteria. The `[human]`
items are the two acts the PRD reserves to a person: running the blind stage with the key, and approving
promotion.

## Test plan

Every `[machine]`/`[fixture]` step runs offline: no network, **no provider key**, **no seal key**.

1. **Read the stage list against the PRD.** Compare `tests/promotion/fixtures/prd-14-4-stages.json` with
   PRD §14.4's sentence — five stages, in order — and the profile list with §14.4's six profiles.
2. **Run the suite.** `uv sync --frozen`; `uv run pytest pipelines/evaluation/tests/promotion -q`; then
   `uv run pytest` from the repository root. Construction pattern to copy: `GOLD-03`'s `tests/gates/**`
   (per-row negatives) and `GOLD-02`'s golden-artifact replay.
3. **Ordering.** Attempt each out-of-order transition; assert refusal. Attempt to mark a stage `PASS`
   without its evidence reference; assert refusal.
4. **Freeze.** Run development, freeze, then mutate one retrieval constant and run validation; assert the
   stage fails on the hash mismatch and names both hashes.
5. **Embedding extras.** Run an `EMBEDDING` candidate three times, each missing one required extra;
   assert `UNRESOLVED` each time with the missing item named.
6. **Fallback.** Submit a fallback with the same approver as the primary; assert rejection. Submit one
   naming a non-approved profile; assert rejection.
7. **Self-approval hunt.** Grep `src/promotion/**` for any assignment of `APPROVED`; assert the only path
   is the guarded transition requiring an approval record. Run the CLI with `--approve`; assert an
   unrecognised option.
8. **Blind fail-closed.** Run the sequence with no `EVAL_BLIND_KEY_FILE`; assert the blind stage is
   `UNRESOLVED`, the sequence stops before `READY_FOR_APPROVAL`, and no artifact claims blind coverage.
9. **Shadowing.** Configure production traffic without an opt-in record; assert refusal; add the record;
   assert it proceeds.
10. **Replay.** Run the recorded five-stage fixture twice; diff the decision records; expect no bytes
    changed.
11. **Threshold absence.** Grep `src/promotion/**` for `0.98`, `0.95`, `0.90`, `100%` — none; confirm gate
    outcomes come from `GOLD-03`.
12. **Append-only manifest.** `git diff pipelines/evaluation/pyproject.toml` shows additions only.
13. **Reviewer focus.** Confirm the sequence cannot be short-circuited, that "frozen" is a hash and not a
    convention, that the blind stage cannot be satisfied without a key, that the judge changes no
    outcome, and that nothing in this ticket can approve a promotion.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR → merge →
   `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/21-evaluation-600/README.md` (version +0.1 with a changelog line) **before** changing code.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *The benchmark-selected parameters are chosen* → that is this ticket's **writeback obligation**, not
     a side effect: record them in `docs/prd/21-evaluation-600/README.md` (**Q2**, **Q3**, **Q4**) and in
     `docs/prd/breakdown-plan.md` §8 (Q1, Q2, Q4), each with the decision-record hash. PRD §45.5 calls
     them versioned configuration backed by measured evidence — an unrecorded choice is indistinguishable
     from a guess.
   - *No candidate profile passes stage 1's security/cost preconditions* → that is a **Founder**
     commercial/provider decision (sub-PRD **Q-EVID-4** in `12-evidence-safety`, plan §8 **Q1**). Record
     it and stop; do not relax the retention or cost precondition to let a provider through.
   - *A profile constant must change after the freeze* → the frozen validation result is void. Re-freeze
     and re-run stages 3–5; **never** edit the frozen profile in place, and never re-use an earlier
     validation result under a new hash (PRD §36.2).
   - *The blind stage cannot be scheduled with the Founder* → the sequence stays `UNRESOLVED` and
     promotion does not proceed. Record the scheduling constraint in
     `docs/prd/21-evaluation-600/README.md` (changelog line; **D22** is the controlling decision); PRD
     §14.4 lists blind testing as mandatory, so an unrun blind stage is a delay (PRD §44.4 outcome 1),
     never a waiver, and no substitute runner may be improvised — only the Founder starts a blind stage
     (plan §8 **Q6**).
   - *`RETR-10`'s report lacks a number the embedding comparison needs* → raise a docs PR against
     `RETR-10`, record the interim in the README, and report the extra `UNRESOLVED`.
   - *Someone proposes shadowing production traffic to get better evidence* → refuse unless the explicit
     anonymised-improvement opt-in exists; PRD §14.4 and §10.2 are the controlling text. Record the
     request in the README.
3. **Falsified protocol.** **If a promotion appears to require skipping a PRD §14.4 stage, that overturns
   a product-safety rule.** Do not add a "provisional promotion", an "expedited path", a "stage not
   applicable" flag or an auto-approval. Stop, escalate for re-review, raise an ADR under `docs/adr/`,
   and write back to `docs/prd/21-evaluation-600/README.md` **and** `docs/prd/breakdown-plan.md` before
   any code. PRD §44.4 permits only two outcomes when the bar cannot be met: delay, or an explicitly
   visible limited state — both are the Founder's to choose, and neither is implemented here.
