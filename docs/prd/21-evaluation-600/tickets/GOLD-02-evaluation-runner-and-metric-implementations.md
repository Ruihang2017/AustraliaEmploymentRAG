---
id: GOLD-02
title: "Evaluation runner and metric implementations"
module: 21-evaluation-600
lane: 21-evaluation-600
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [GOLD-01, ASK-02]
blocks: [GOLD-03, GOLD-04]
---

# GOLD-02 — Evaluation runner and metric implementations

Implements PRD §14.3, §43.3 and §43.4 — requirements **EVAL-001** and **EVAL-002** (measurement half);
epic `E31-EVAL-600`.
No ADR — the decision is already made in PRD §43.3 (seven metrics with their exact calculations) and
PRD §14.3 (*"Deterministic checks control legal/citation launch gates"*); this is build ticket 2 of 17
against it.
Parent sub-PRD: [21-evaluation-600 README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [GOLD-01 — Case schema, splits, integrity and blind protection](GOLD-01-case-schema-splits-integrity-and-blind-protection.md), [ASK-02 — Quick workflow in worker](../../15-answer-product/tickets/ASK-02-quick-workflow-in-worker-retrieve-pack-gateway-validate-commit.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §43.3 is a finished metric table with stated calculations and gate values; this makes each row
computable and replayable.

## Background + basis

**PRD §43.3 metric definitions, transcribed verbatim — the acceptance target:**

| Metric | Calculation/critical rule |
|---|---|
| Factual citation coverage | Material factual/legal claims with ≥1 valid supporting/qualifying citation ÷ all material claims; gate 100% |
| Citation precision | Citations whose exact passage and role support/qualify claimed text ÷ all answer citations; ≥98% |
| Recall@10 | Required gold nodes with at least one hit in first 10 eligible results, macro-averaged by case; ≥90% |
| Date/jurisdiction critical error | Any definitive use of inapplicable version/jurisdiction; must be 0 |
| Unsupported definitive claim | Definitive material claim failing support validator/human gold; must be 0 |
| Correct refusal | Refusal/insufficient/out-of-scope/evasion cases with acceptable result ÷ such cases; ≥95% |
| Source-status correctness | Correct in-force/future/repealed/stale/unknown treatment ÷ assessed status assertions; ≥98% |

> **Schema success, latency and cost are reported by model profile and task type. Aggregate passing
> cannot waive a zero-tolerance error or critical regression.**

**PRD §14.3 evaluation method, quoted verbatim — the rules that shape this runner:**

> - **Deterministic checks control legal/citation launch gates.**
> - A pinned LLM judge MAY assist with clarity, missing conditions, coherence and usefulness but MUST
>   NOT decide legal correctness, binding status, date applicability or release alone.
> - Founder review prioritises failures, changed cases, source/prompt/model impacts, conflicts,
>   coverage/classification, case treatment and temporal traps.
> - **Related smoke subsets run on changes; development cases run nightly where practical; development
>   + validation run weekly; all 600 run for release candidates.**
> - **Blind gold answers MUST remain outside ordinary coding-agent context.**
> - Formal dataset corrections create a new version and reason; they are not edited invisibly.

**PRD §43.4 founder test queue, quoted verbatim — the ordering this runner must emit:**

> 1. any cross-tenant/PII/security failure;
> 2. any unsupported claim or legal-date/jurisdiction failure;
> 3. changed evaluation cases versus last accepted baseline;
> 4. source adapter count/time/licence/quarantine anomalies;
> 5. Coverage/enterprise-agreement/case-treatment failures;
> 6. UI/manual acceptance failures;
> 7. performance/cost/accessibility defects.
>
> Every reviewed failure is classified `CODE`, `CORPUS`, `GOLD_DATA`, `PROMPT`, `MODEL_PROFILE`,
> `PRODUCT_AMBIGUITY` or `SOURCE_LIMITATION`; it gets an owner, requirement ID and reproducible
> fixture.

**PRD §14.2 gate values this runner must make measurable** (enforced by `GOLD-03`): citation coverage
**100%**, citation precision **≥ 98%**, recall@10 **≥ 90%**, critical legal-date/jurisdiction errors
**0**, unsupported definitive claims **0**, correct refusal **≥ 95%**, source-status correctness
**≥ 98%**.

**PRD §14.1 required per-case fields** (`GOLD-01` deliverable 1, mandatory here): *"scenario, question,
legal date, jurisdictions, expected answer status, required facts, prohibited assumptions, trap types,
gold DocumentVersion/NodeVersion authorities, required/optional/prohibited claims and expected citation
roles."* Every metric below is computed from those fields and the recorded observation — never from a
model's opinion.

**What is already decided elsewhere and must not be re-decided here.** `ASK-02` owns the PRD §9.4
sequence in `apps/worker` and commits the Answer Snapshot; `EVID-05` owns the PRD §36.6 deterministic
validator and its counters (`criticalLegalDateErrors`, `criticalJurisdictionErrors`,
`unsupportedDefinitiveClaims`, …); `RETR-08`/`RETR-09` own retrieval and the typed client; `FND-07`
owns `AnswerStatus` and `isDefinitiveClaim`; `GOLD-01` owns the case schema, the dataset checker and the
blind primitives. This ticket **observes and scores**; it re-implements none of them. PRD §45.2 gives
`pipelines` *"Official-source acquisition/build/evaluation"* and nothing else.

**Sub-PRD decisions carried forward:** **D9** (recorded, replayable runs), **D16** (offline; no live
provider in CI), **D17** (Python), **D19** (test layout), **D20** (no blind-derived text in artifacts).

**Accepted caveats carried forward:**

- **The runner does not judge.** `GOLD-04`'s judge is `blocked_by` this ticket and its output is never
  an input to a §43.3 metric (sub-PRD **D10**).
- **Two of the seven metrics have a semantic-sounding phrase in the PRD** — *"support/qualify claimed
  text"* (precision) and *"correct … treatment"* (source status). Both are made deterministic here by
  scoring against the case's declared gold, not by asking a model; PRD §14.3 requires exactly that.
- **A metric must not simply echo the system under test.** Where the product already counts something
  (`EVID-05`'s counters), this runner records the system value **and** recomputes it independently from
  the observation; a mismatch is itself a reported failure.

## Goal

Produce `pipelines/evaluation/src/runner/**`: an execution driver that runs a selected case suite
against the product (record mode) or against a stored run artifact (replay mode), an immutable
content-hashed run artifact capturing everything a metric needs, deterministic implementations of all
seven PRD §43.3 metrics plus the schema-success/latency/cost reporting, per-category and aggregate
breakdowns, the PRD §43.4 ordered failure queue with its classification vocabulary, and blind-safe
execution in which no blind case text can reach any artifact. Completion is mechanically checkable:
`uv run pytest pipelines/evaluation/tests/runner` is green offline with no provider and no key;
replaying a committed run artifact reproduces every metric bit-for-bit; and a run whose case set
includes blind material aborts rather than writing a leaked artifact.

## Non-goals

- **No thresholds, verdicts, gates or release evidence pack** — `GOLD-03` (`src/gates/**`,
  `blocked_by` this ticket). This ticket produces numbers; it never decides whether they are good
  enough.
- **No judge, no model-assisted scoring of any kind** — `GOLD-04` (`src/judge/**`, `blocked_by` this
  ticket). PRD §14.3 keeps legal correctness deterministic.
- **No profile promotion, non-regression decision or frozen-validation ceremony** — `GOLD-15`.
- **No roster/licence/freshness reconciliation** — `GOLD-16` (`src/coverage/**`).
- **No case content, gold answers or category directories** — `GOLD-05` … `GOLD-14`.
- **No case schema, split checker, seal or guard** — `GOLD-01` (merged; this ticket's blocker).
  Imported, never duplicated.
- **No product behaviour**: no retrieval, no evidence pack, no validator, no answer workflow, no
  refusal decision — `11-retrieval-engine`, `12-evidence-safety`, `15-answer-product`.
- **No CI workflow or schedule** — `00-foundation` (`FND-02`); sub-PRD **Q-GOLD-E**.

## File-scope (write-owns)

Owned by this ticket:

- `pipelines/evaluation/src/runner/**`
- `pipelines/evaluation/tests/runner/**` (sub-PRD **D19**)
- `pipelines/evaluation/pyproject.toml` — **append-only**, own dependencies and the
  `evaluation.runner` entry point only

Does not touch:

- `pipelines/evaluation/src/dataset/**`, `schemas/evaluation/**`, `evals/splits/**` — `GOLD-01`
  (merged; blocker). `src/gates/**` and `evals/reports/**` — `GOLD-03`; `src/judge/**` — `GOLD-04`;
  `src/promotion/**` — `GOLD-15`; `src/coverage/**` — `GOLD-16`.
- `evals/cases/**`, `evals/gold/**` — `GOLD-05` … `GOLD-14`.
  `evals/reports/release-candidate/**` — `GOLD-17`.
- `apps/**`, `packages/**`, `services/**` — `15-answer-product`, `12-evidence-safety`,
  `11-retrieval-engine`, `00-foundation`, `01-app-data`; consumed through their public interfaces,
  never modified to make a metric pass.
- `pipelines/{ingestion,adapters,corpus-builder,embeddings}/**` — `04`, `05`–`10`.
  `infra/**`, `tests/**`, `.github/workflows/**` — other modules per plan §4/§4.1.
- `docs/PRD.md`, `.claude/**` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged at plan time, no in-flight contention
(plan §1 header). `pipelines/evaluation/src/runner/**` is written by no other ticket (plan §5.22). This
is a module wave-2 ticket; its concurrent siblings are the ten authoring tickets (`evals/{cases,gold}/*`
— data only, disjoint) and `GOLD-16` (`src/coverage/**`). Its dependents `GOLD-03` and `GOLD-04` are
`blocked_by` this ticket and therefore never concurrent. Both declared blockers land first: `GOLD-01`
(module wave 1) and `ASK-02` (`15-answer-product` wave 2). Shared append-only file:
`pipelines/evaluation/pyproject.toml`.

## Deliverables

1. **`src/runner/suite.py` — suite selection matching PRD §14.3's cadences.** `Suite` values
   `SMOKE`, `DEVELOPMENT`, `DEVELOPMENT_AND_VALIDATION`, `ALL_600`, plus `--category` and
   `--case` filters. `SMOKE` is *related* subsets: cases whose `tags`/`primary_category` intersect a
   supplied change descriptor (touched source group ids, touched requirement ids, touched prompt or
   profile ids), with a deterministic floor so an empty intersection still runs a fixed core subset.
   `ALL_600` is the only suite that includes `BLIND`.
2. **`src/runner/execute.py` — the execution port.** One interface, `AnswerExecutor`, with exactly two
   implementations: `LiveExecutor` (drives the product through its public API — `POST /v1/answers`,
   `POST /v1/search`, coverage/compare endpoints — with a per-case idempotency key) and
   `ReplayExecutor` (reads a stored run artifact). The metric code accepts only `Observation` records
   and cannot tell the two apart. `LiveExecutor` never runs in CI (sub-PRD **D16**).
3. **`src/runner/observation.py` — the `Observation` record**, the single input to every metric.
   Per case it captures: case id, `dataset_version`, `split`, `corpus_release_id`, retrieval profile
   id, model profile ids and **actual model versions** (PRD §30.2 `ANS-004`), request as sent,
   ranked eligible retrieval results (ordered `(document_version_id, node_version_id)` list, at least
   the first 20), the answer snapshot's `status`, claims (kind, text hash, definitiveness flag,
   support), citations (`evidence_id`, `document_version_id`, `node_version_id`, `citation_role`,
   `quote_start`, `quote_end`), the validator findings and counters from `EVID-05`, clarifications,
   refusal reason, displayed source-status assertions, schema-success flag, latency per stage and
   cost per profile. **Claim/citation text is stored as a hash plus offsets, not prose**, so an
   artifact carries no reproduced legal text (PRD §22) and no route to blind content (**D20**).
4. **`src/runner/metrics/**` — one module per PRD §43.3 row**, each a pure
   `(case, observation) -> MetricOutcome`, so a Reviewer can read a metric beside the PRD row:

   | # | Metric id | Deterministic rule | Denominator |
   |---:|---|---|---|
   | 1 | `FACTUAL_CITATION_COVERAGE` | a material claim (kind ∈ `RULE, APPLICATION, CONCLUSION, DATE_OR_STATUS`, or `SHORT_ANSWER`) counts as covered when ≥1 of its citations is validator-accepted with role `SUPPORTS` or `QUALIFIES` | all material claims |
   | 2 | `CITATION_PRECISION` | a citation is precise when (a) `EVID-05` raised no finding against it, **and** (b) its `(version_id, node_id)` appears in the case's `gold_authorities` (either `required: true` or `required: false`), **and** (c) its `citation_role` is the role that gold declares for that authority | all answer citations |
   | 3 | `RECALL_AT_10` | per case: required gold nodes (`required: true`) with ≥1 hit in the first **10** eligible results; **macro-averaged by case**, never micro-averaged | cases with ≥1 required gold node |
   | 4 | `DATE_JURISDICTION_CRITICAL_ERROR` | count of definitive claims citing a version outside `legal_as_at`'s effective interval or a jurisdiction disjoint from the case's; recomputed here from the observation **and** compared with `EVID-05`'s counters — a mismatch is its own finding | count (zero-tolerance) |
   | 5 | `UNSUPPORTED_DEFINITIVE_CLAIM` | count of surviving claims that are definitive (`FND-07`'s rule, recorded on the observation) and lack a validator-accepted supporting citation or contradict `prohibited_claims` | count (zero-tolerance) |
   | 6 | `CORRECT_REFUSAL` | for cases whose `expected_answer_status` ∈ `INSUFFICIENT_EVIDENCE, CONFLICTING_SOURCES, OUT_OF_SCOPE, SOURCE_NOT_CURRENT` or whose `trap_types` include evasion/PII: the observed status ∈ the case's `acceptable_statuses` **and** no `prohibited_claims` phrase appears; a PII case is correct only when the request was **rejected before a job** (PRD §36.8) | such cases |
   | 7 | `SOURCE_STATUS_CORRECTNESS` | each displayed status assertion (in-force / future / repealed / stale / unknown) about a cited authority is compared with the status the pinned release evidences for `legal_as_at`; gold may pin an expected value per authority | all assessed status assertions |

   Every outcome carries `numerator`, `denominator`, `value`, `unresolved` and per-case detail ids.
   A metric whose denominator is zero returns `UNRESOLVED`, never `1.0` (sub-PRD **D11** — silence is
   not success).
5. **`src/runner/metrics/reported.py` — the PRD §43.3 reported-not-gated series**: schema success rate,
   latency percentiles and cost, each broken down **by model profile and task type**, plus retrieval
   latency by stage. These are reported here and gated by `GOLD-03` only once sub-PRD **Q-GOLD-A** is
   answered.
6. **`src/runner/breakdown.py`** — per-primary-category and aggregate roll-ups for every metric, and
   per-split roll-ups (development / validation / blind), matching PRD §43.5's *"all 600 metrics,
   per-category breakdown"*.
7. **`src/runner/triage.py` — the PRD §43.4 ordered failure queue.** Emits failures in the PRD's seven
   priority bands, each item carrying case id, band, the classification vocabulary
   (`CODE|CORPUS|GOLD_DATA|PROMPT|MODEL_PROFILE|PRODUCT_AMBIGUITY|SOURCE_LIMITATION`) as an
   **unset-by-default** field the reviewer fills, an owner slot, a requirement id and the reproducible
   fixture reference (run artifact hash + case id). The runner **never assigns** a classification
   itself — PRD §43.4 makes that a human review act.
8. **`src/runner/artifact.py` — the immutable run artifact.** One JSON document containing: run id,
   started/finished, suite, dataset version, corpus release id, app/search versions, retrieval profile
   id, model profile ids and actual model versions, the per-case observations, the metric record, the
   breakdowns, the triage queue, and a `content_sha256` over the canonicalised body. Written once,
   never updated; a second write to the same run id is an error. Replay reads it and recomputes every
   metric — the numbers are a function of the artifact, not of the run.
9. **`src/runner/blind.py` — blind-safe execution (sub-PRD D20, PRD §14.3).**
   - Blind cases are loaded through `GOLD-01`'s `open_blind`, which requires `EVAL_BLIND_KEY_FILE`; a
     run selecting `BLIND` without the key fails with `BlindKeyUnavailable` **before** executing
     anything.
   - Blind observations record ids, codes, counts and hashes only — no question, no scenario, no claim
     text, no gold text, no quote. The artifact schema for a blind case forbids the text-bearing fields
     structurally (`additionalProperties: false`).
   - After every artifact write the runner calls `GOLD-01`'s `assert_no_blind_leakage(paths,
     leak_shingles(...))`; a hit deletes the artifact and fails the run.
   - Blind case objects are `GOLD-01`'s opaque `SealedCase`; a stray `print`/`log`/assert raises rather
     than rendering (`GOLD-01` deliverable 13).
10. **`src/runner/cli.py`** — `python -m evaluation.runner run --suite <s> [--category …]
    [--release <path>] [--executor live|replay] [--artifact <path>] [--out <dir>]` and
    `python -m evaluation.runner replay --artifact <path>`. Exit codes: `0` only when every selected
    case produced an observation and every metric resolved; non-zero on execution failure or any
    `UNRESOLVED` metric. Metric *values* do not set the exit code — that is `GOLD-03`'s job, and
    keeping it out of here is what stops a threshold from quietly living in two places.
11. **`tests/runner/**`** — offline fixtures (sub-PRD **D18**): a synthetic case set with a matching
    hand-built observation set covering, per metric, a passing case, a failing case and an
    `UNRESOLVED` case; a committed golden run artifact whose replay must reproduce every number
    bit-for-bit; a mismatch fixture where `EVID-05`'s counters disagree with the independent
    recomputation; a blind fixture proving key-absence aborts before execution; and a leak fixture
    proving a text-bearing artifact is deleted.
12. **`pipelines/evaluation/README.md` update** — append the metric table with each metric's module
    path, the record/replay split, the artifact contract and the statement that thresholds live in
    `GOLD-03`.

## Acceptance checklist (classified)

- [ ] `[fixture]` **All seven §43.3 metrics replay**: `prd-43-3-metrics.json` (the table transcribed
      verbatim) matches the metric registry name-for-name and calculation-for-calculation, and each
      metric has a passing, a failing and an `UNRESOLVED` fixture. (PRD §43.3)
- [ ] `[fixture]` **Determinism**: replaying the committed golden run artifact twice produces
      byte-identical metric records, and the recomputed values equal the values stored in the artifact.
      (PRD §14.3; sub-PRD D9)
- [ ] `[machine]` **Citation coverage is measured against material claims**, and a claim with only a
      `BACKGROUND_ONLY` or `CONTRADICTS` citation counts as **uncovered**. (PRD §43.3 row 1; §15.5)
- [ ] `[machine]` **Citation precision counts a validator-accepted citation to a non-gold node as
      imprecise**, and a gold-listed node cited with the wrong role as imprecise. (PRD §43.3 row 2)
- [ ] `[machine]` **Recall@10 is macro-averaged by case** over the first **10 eligible** results; a
      fixture where micro-averaging would pass and macro-averaging fails must fail. (PRD §43.3 row 3)
- [ ] `[machine]` **Zero-tolerance metrics are counts, not rates**, and one occurrence in one case is
      reported as one — never diluted by 599 passing cases. (PRD §43.3 *"Aggregate passing cannot waive
      a zero-tolerance error"*; §14.2)
- [ ] `[machine]` **Independent recomputation**: a fixture whose recorded `EVID-05` counters disagree
      with the runner's recomputation produces a `COUNTER_MISMATCH` finding and the run does not report
      a clean result. (PRD §14.3 *"Deterministic checks control legal/citation launch gates"*)
- [ ] `[machine]` **Correct refusal**: an `OUT_OF_SCOPE` case answered definitively fails; a PII case is
      correct only when the request was rejected before a job was created. (PRD §43.3 row 6; §36.8;
      §30.2 `ANS-002`)
- [ ] `[machine]` **Source-status correctness** compares displayed status against the release-evidenced
      status at `legal_as_at`; a case citing an `ENACTED_NOT_IN_FORCE` node as current fails. (PRD
      §43.3 row 7; §6.7; §36.2)
- [ ] `[machine]` **Empty denominator is `UNRESOLVED`, not 100%** for every rate metric. (Sub-PRD D11)
- [ ] `[machine]` **No thresholds here**: a grep of `src/runner/**` finds none of `0.98`, `0.9`, `0.95`,
      `100%` or a comparison against a gate value; the numbers live only in `GOLD-03`. (PRD §14.2;
      sub-PRD D12)
- [ ] `[machine]` **No judge, no model**: an import-graph test finds no provider SDK, HTTP model client
      or `evaluation.judge` import reachable from `src/runner/metrics/**`. (PRD §14.3; sub-PRD D10)
- [ ] `[machine]` **Blind safety — key absence**: selecting `ALL_600` without `EVAL_BLIND_KEY_FILE`
      fails with `BlindKeyUnavailable` **before** any case executes and writes no artifact. (PRD §14.3;
      sub-PRD D2)
- [ ] `[machine]` **Blind safety — no text**: with an ephemeral test key, a blind observation contains
      no question, scenario, claim text, quote or gold text; the artifact schema rejects such a field;
      an injected 12-token blind shingle in an artifact causes deletion and failure. (PRD §43.1; sub-PRD
      D20)
- [ ] `[machine]` **Artifact immutability**: writing the same run id twice fails; the `content_sha256`
      covers the canonicalised body and changes when any observation changes. (PRD §43.5)
- [ ] `[machine]` **Triage ordering**: a mixed failure fixture is emitted in exactly PRD §43.4's seven
      bands, with the classification field **unset** and an owner/requirement/fixture slot per item.
      (PRD §43.4)
- [ ] `[machine]` **Schema success, latency and cost are reported by model profile and task type.**
      (PRD §43.3 closing paragraph)
- [ ] `[machine]` `uv sync --frozen` then `uv run pytest` green, with **no network and no provider key**
      (standing item, PRD §45.3, §20.3).
- [ ] `[machine]` `pnpm test` green — unaffected; no TypeScript. `cargo test --workspace` unaffected; no
      Rust. (PRD §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs (**EVAL-001**, **EVAL-002**), user-visible
      change and non-goals, schema/API compatibility impact (the run-artifact contract consumed by
      `GOLD-03`, `GOLD-04`, `GOLD-15`, `GOLD-17`, `INTL-06`), **tenant/PII/security and retention impact**
      (no customer data; blind material never rendered; artifacts carry hashes not prose),
      source/licence impact (none), cost/memory/latency impact (a full-600 live run's provider cost is
      reported per profile and is subject to the PRD §24.1 A$50 ceiling), rollback path, known gaps
      (**Q-GOLD-A**, **Q-GOLD-D**).

Absent classes: no `[human]` criteria — every metric is deterministic by PRD §14.3, and human review of
*failures* is PRD §43.4 work owned by `GOLD-17`. `[fixture]` items are replays of recorded runs (plan
§1.1); `[machine]` items are unit/property checks.

## Test plan

Every step runs offline: no network, **no provider key**, **no seal key** except the ephemeral pair the
tests generate.

1. **Read the metric table against the PRD.** Compare `tests/runner/fixtures/prd-43-3-metrics.json` with
   `docs/PRD.md` §43.3 row by row — seven rows, seven calculations, seven gate values recorded as
   *documentation only* (the enforcement is `GOLD-03`).
2. **Run the suite.** `uv sync --frozen`; `uv run pytest pipelines/evaluation/tests/runner -q`; then
   `uv run pytest` from the repository root. Construction pattern to copy: `GOLD-01`'s
   `tests/dataset/**` (fixture tree + per-check negatives) and `RETR-10`'s benchmark-report fixtures.
3. **Per-metric triple.** For each of the seven metrics run its passing, failing and `UNRESOLVED`
   fixture and assert the exact numerator/denominator, not just the boolean.
4. **Macro-average proof.** Use the fixture where one case has 10 required gold nodes and nine cases
   have one each; assert the reported recall equals the macro mean and differs from the micro mean.
5. **Zero-tolerance proof.** One critical date error in one of 600 fixture cases must appear as
   `count = 1`, and no aggregate roll-up may present it as `0.998`.
6. **Counter-mismatch.** Feed an observation whose `EVID-05` counters are lower than the independent
   recomputation; assert `COUNTER_MISMATCH` and a non-clean result.
7. **Replay determinism.** `python -m evaluation.runner replay --artifact tests/runner/fixtures/golden-run.json`
   twice; diff both metric records; expect no bytes changed.
8. **Blind matrix.** (a) `--suite all600` with no key → `BlindKeyUnavailable`, no artifact on disk.
   (b) With the ephemeral key → blind observations contain only ids/codes/hashes; grep the artifact for
   any fixture blind question token — none. (c) Inject a blind shingle into a written artifact and
   re-run the post-write scan → artifact deleted, run failed.
9. **Threshold absence.** Grep `src/runner/**` for `0.98`, `0.95`, `0.90`, `>=` against a constant gate
   — none; confirm no module imports `evaluation.gates`.
10. **Judge isolation.** Grep the import graph of `src/runner/**` for `evaluation.judge`, any provider
    SDK and any HTTP client used for model calls — none.
11. **Artifact contract.** Mutate one observation field; assert `content_sha256` changes. Attempt a
    second write of the same run id; assert failure.
12. **Append-only manifest.** `git diff pipelines/evaluation/pyproject.toml` shows additions only.
13. **Reviewer focus.** Confirm the metrics are computed from the case's declared gold rather than from
    the system's own claims wherever the PRD's wording sounds semantic; confirm no threshold and no
    verdict exists in this ticket; confirm an empty denominator cannot report success; confirm a blind
    run is impossible without a key and impossible to leak with one; confirm the triage queue leaves
    classification to the human, per PRD §43.4.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR → merge →
   `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/21-evaluation-600/README.md` (version +0.1 with a changelog line) **before** changing code.
   PRD §45.4 additionally requires an evaluation subset with any change to legal status/date/citation
   behaviour.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A §43.3 calculation cannot be computed from the observation the product exposes* (for example the
     ranked **eligible** result list, or the displayed status assertions) → the missing signal is a
     contract gap in `RETR-09`/`ASK-02`/`EVID-05`. Raise it as a docs PR against **that** ticket, record
     the interim in `docs/prd/21-evaluation-600/README.md`, and report the metric `UNRESOLVED` until it
     lands. Never approximate a gated metric from a weaker signal.
   - *Citation precision as defined here rejects citations a human would accept* → record the measured
     rate and examples (ids only) in `docs/prd/21-evaluation-600/README.md` and raise a **case-data**
     fix in the owning `GOLD-05` … `GOLD-14` ticket (add the node as a `required: false` gold
     authority). Do **not** loosen the metric: PRD §14.2 gates precision at ≥ 98% and PRD §43.4 forbids
     changing expected output without a versioned founder-approved reason.
   - *A metric is too slow over 600 cases* → optimise inside `src/runner/**`; if the artifact contract
     must change, amend this ticket and `GOLD-03`'s consumer contract in one docs PR.
   - *The nightly/weekly cadences of PRD §14.3 need scheduled workflows* → sub-PRD **Q-GOLD-E**; the
     writeback target is a docs PR against `FND-02`, not a workflow file written here (plan §4.1).
   - *Someone asks for the judge to break a tie on a failing case* → refuse and record the request in
     `docs/prd/21-evaluation-600/README.md` **D10**. PRD §14.3 forbids the judge deciding legal
     correctness; `GOLD-04` exists precisely so the boundary is visible.
3. **Falsified protocol.** **A §43.3 metric that cannot be computed deterministically overturns PRD
   §14.3's first bullet.** Do not substitute a model-scored proxy, a human spot check dressed as a
   number, or a metric computed from the system's own self-report alone. Stop, escalate for re-review,
   raise an ADR under `docs/adr/`, and write back to `docs/prd/21-evaluation-600/README.md` **and**
   `docs/prd/breakdown-plan.md` before any code. A gate whose measurement is negotiable is not a gate.
