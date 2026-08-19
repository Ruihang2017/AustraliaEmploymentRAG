# 21-evaluation-600 — sub-PRD

> Module sub-PRD. Authored from `docs/prd/breakdown-plan.md` §5.22 (wave B). The **tickets** under
> `tickets/` are the executable source of truth; this file is the module's shared context. On any
> disagreement between a ticket and this file, the ticket wins (CLAUDE.md, issue #53).

| Field | Value |
|---|---|
| Module | `21-evaluation-600` |
| Lane | `21-evaluation-600` |
| Ticket prefix | `GOLD` |
| Tickets | 17 (`GOLD-01` … `GOLD-17`) |
| Agent | `builder` (all 17, plan §1.1) |
| PRD epics | `E31-EVAL-600` (owner), `E32-QUALITY` (`GOLD-16`; the 2 GB benchmark half is `RLSE-11`), `E33-PROMOTION` (`GOLD-15`; the release-drill half is `RLSE-06`/`RLSE-07`), `E34-LAUNCH` (`GOLD-17` gate closure) |
| Requirement families | `EVAL-001`, `EVAL-002` (measures `SRCH-*`, `ANS-005`, `COV-*`, `CMP-*`, `SEC-003`, `ADM-002` behaviour without owning it) |
| Write-owns | `pipelines/evaluation/**` · `evals/**` (`cases`, `gold`, `splits`, `reports`) · `schemas/evaluation/**` (plan §4) |
| Depends on modules | `00`, `04`, `05`, `06`, `07`, `08`, `09`, `10`, `11`, `12`, `15` |
| Modules that depend on this one | `22-internal-admin` (`INTL-06`), `24-launch` (`LNCH-04`, `LNCH-05`) |
| Language/toolchain | Python (`uv`, `pytest`) for `pipelines/evaluation/**` — PRD §18.2 *"Ingestion/build/evaluation \| Local Python pipeline"*; YAML/JSON data under `evals/**` and `schemas/evaluation/**` |
| Master spec | [`docs/PRD.md`](../../PRD.md) |
| Version | v0.4 (2026-08-20) |

## Problem

This module owns the only mechanism in the product that can say **no** to a release.

PRD §14.2 fixes seven numeric gates and PRD §30.2 turns them into two requirements:

> `EVAL-001` — *"Dataset contains 360 development, 120 validation and 120 protected blind cases …
> Split integrity/no-overlap test passes"*.
> `EVAL-002` — *"Release is blocked unless every numeric and zero-tolerance gate passes … Deliberate
> failing metric prevents promotion"*.

Four pressures make this one module rather than a shared responsibility.

1. **The gate must be code, not a report.** PRD §43.3 closes with *"Aggregate passing cannot waive a
   zero-tolerance error or critical regression"*, and PRD §44.4 permits exactly two outcomes when the
   roster cannot pass — delay launch, or launch an explicitly visible limited state. Neither is
   "lower the threshold". A gate expressed as a document someone reads is a gate that can be talked
   past; a gate expressed as an exit code cannot.
2. **The judge must be structurally unable to decide.** PRD §14.3: *"A pinned LLM judge MAY assist
   with clarity, missing conditions, coherence and usefulness but **MUST NOT decide legal
   correctness, binding status, date applicability or release alone**."* The safe reading is not "we
   will be careful"; it is that the judge's output type has no field a gate could read.
3. **Blind material must be sealed by construction.** PRD §14.3: *"**Blind gold answers MUST remain
   outside ordinary coding-agent context.**"* PRD §43.1: *"The blind case content/gold data is
   inaccessible to ordinary coding-agent context."* PRD §45.1 item 6: *"Never expose blind evaluation
   gold data, production credentials or customer content to coding agents."* Breakdown plan **R9**
   names the exact failure mode: the same tree holds 480 visible and 120 blind cases, and wave B
   authors both. An ignore file is a convention; ciphertext without a key is a mechanism — and plan
   §4 freezes `.claude/**`, so this module could not write an agent-side deny rule even if one were
   sufficient.
4. **Ten case categories are the widest safe parallel unit in the PRD.** PRD §44.3 names *"individual
   evaluation categories"* alongside *"individual source adapters"* as canonical safe parallel work.
   PRD §43.1's allocation table is already the cut: ten primary categories, fixed counts, totalling
   600. One "author the dataset" ticket would serialise the module's widest wave and make the
   per-category stratification unverifiable.

## Scope

In scope — the module's plan §4 write-owns row:

- `schemas/evaluation/**` — the PRD §43.2 case schema, the blind seal envelope and sidecar schema,
  the metric record and the release-evidence-pack schema.
- `evals/splits/**` — the frozen PRD §43.1 allocation, the case-id rules, the dataset-version
  registry and formal dataset migrations (PRD §14.3, §43.2).
- `evals/cases/**` and `evals/gold/**` — the 600 cases and their gold authorities, ten disjoint
  category directories.
- `evals/reports/**` — the metric/gate/evidence reports, including the committed release-candidate
  report PRD §43.5 requires the promotion UI to link.
- `pipelines/evaluation/**` — the dataset checker, the runner and the seven PRD §43.3 metrics, gate
  enforcement, the non-deciding judge harness, model/retrieval profile promotion, and full-roster
  coverage/licence/freshness reconciliation.

Out of scope in one line: **this module measures the product and blocks its release; it never
implements product behaviour, never fixes a defect it finds, and never decides a launch.**

## Non-goals

Each names its owner module/ticket or standing reason.

| Not in this module | Owner / reason |
|---|---|
| Any product behaviour the metrics measure — retrieval, evidence packs, the validator, the answer workflow, refusal decisions | `11-retrieval-engine`, `12-evidence-safety` (`EVID-05` owns the PRD §36.6 validator), `15-answer-product`. A metric that re-implements the behaviour it measures cannot fail. |
| The `AnswerStatus`/`ClaimSupport`/`CitationRole` enums, the §36.8 refusal table, the §36.2 eligibility predicate, authority ranking | `00-foundation` (`FND-03`, `FND-07`, `FND-10`). Consumed as data/contract; PRD §45.2 forbids duplicated business rules. |
| Corpus schema, chunking, embeddings, the CorpusRelease manifest, candidate release build/publish | `04-corpus-contract` (`CRPS-01` … `CRPS-08`). This module **pins** a release; it never builds one. |
| Source adapters, the coverage registry's per-group files, licence assessment, quarantine, discovery scheduling | `05-ingestion-framework` (`INGF-04`, `INGF-05`, `INGF-07`) and modules `06`–`10`. `GOLD-16` **reconciles** the composed registry; it never writes a `registry.yaml`. |
| The internal evaluation-run console and the promotion UI | `22-internal-admin` (`INTL-06`, `blocked_by GOLD-03`). This module produces the immutable report the console links (PRD §43.5). |
| Corpus promotion, the active pointer, rollback, the 2 GB real-scale benchmark, restore drills | `18-ops-release` (`RLSE-06`, `RLSE-07`, `RLSE-09`, `RLSE-11`). `GOLD-03` produces a verdict that promotion consumes; it does not promote. |
| Cross-boundary tenant/security/PII/citation/E2E suites and their fixtures | `23-assurance` (`ASSR-01` … `ASSR-08`). Plan §4.2: `evals/gold/**` is this module's alone and assurance uses **its own** synthetic fixtures. No `ASSR-*` ticket reads `evals/**`. |
| Definition-of-Done closure across all of PRD §26, policies, the onboarding pack | `24-launch` (`LNCH-04`, `LNCH-05`, both `blocked_by GOLD-17`). `GOLD-17` closes the **§14.2 evaluation** gates; §26 closure is `LNCH-05`. |
| CI workflow files, the nightly/weekly schedules of PRD §14.3, root `package.json` scripts | `00-foundation` (`FND-01`, `FND-02`; `.github/workflows/**` and root manifests are plan §4.1 serial-owned). This module supplies the commands those jobs run — see **Q-GOLD-B**, **Q-GOLD-E**. |
| Choosing the hosted models, the embedding profile and the retrieval constants | **Benchmark-selected parameters** (PRD §1, §14.4; plan §8 **Q1**/**Q2**/**Q4**). They are selected by measured evidence through `GOLD-15`'s promotion report; the Founder approves production promotion **after** seeing that evidence and does not pick models on preference beforehand. |
| Verifying and signing off the launch state of a source group | Gate 2 verification under the confirmed limited-state launch policy (PRD §44.4; plan §8 **Q10**; **D23**). `GOLD-16` produces the measured evidence and the proposed registry state; `LNCH-05` (module `24-launch`) verifies that the launch statement discloses every limitation accurately. |
| Authoring the blind case content and gold answers | Dedicated **`evaluation-author`** agents in an isolated session/workspace **outside this repository**, with an independent **`evaluation-reviewer`** agent checking every blind case against official sources before encryption (plan §8 **Q6**, confirmed; **D21**). `GOLD-01` owns the sealing mechanism and the ten authoring tickets deliver sealed blind *slots*. No Builder, and no ordinary implementation agent, ever reads blind plaintext. |

## Decisions

Each states its basis: a PRD section, a breakdown-plan decision (including plan §8's decision
register), or an upstream ticket. Where neither the PRD nor the register answers, the item is an open
question below, not a decision.

| # | Decision | Basis |
|---|---|---|
| D1 | **Blind material lives in the repository only as sealed ciphertext.** For every blind case, the tracked artifacts are (a) an encrypted envelope containing case content *and* gold, (b) a digest of that envelope, (c) a non-revealing metadata sidecar (D3). Plaintext blind case text or gold is never a tracked file, in any branch, at any time. The **ADR decision input** for this mechanism is carried by `GOLD-01`, which authors `docs/adr/NNNN-blind-gold-sealing.md` at implementation time (plan **A9**: the creating ticket claims the file) — `docs/adr/` is empty today, so no ADR exists yet. | PRD §14.3 *"Blind gold answers MUST remain outside ordinary coding-agent context"*; §43.1; §45.1 item 6; plan **R9**, §8 **Q6** (confirmed). |
| D2 | **The seal key is never in the repository, never in CI and never in an agent's environment; the Founder is its sole custodian.** The private half lives in the Founder's password manager or equivalent offline encrypted storage with one encrypted recovery copy, and never in git, CI, ordinary environment configuration or any agent environment. Consequence, and the point: the blind stage of any run is *impossible* in ordinary CI and in any coding-agent session — not discouraged, impossible. Rotation, run authority and the key-path contract are **D22**. | PRD §14.3; §20.2 *"Coding agents MUST NOT receive production … credentials by default"*; §45.1 item 6; plan §8 **Q6** (confirmed). |
| D3 | **Every blind case has a public metadata sidecar carrying only non-revealing fields**: id, split, primary category, tags, trap types, jurisdictions, product surface, expected-status *class* presence counts at category level, latency/cost class, author/reviewer, change reason, envelope digest. This is what lets a Reviewer verify counts, stratification and seal integrity **without decrypting anything**. | PRD §43.1 (counts are auditable), §43.2 (schema fields), §14.3; `EVAL-001`. |
| D4 | **Splits are composed from per-category files, never centrally listed.** Each case declares its own `split`; `evals/splits/**` holds the frozen §43.1 allocation table, the id rules, the dataset-version registry and migrations — not a list of 600 ids. The composer aggregates; the checker compares against the frozen table. | Plan **A2** (same shape for the coverage registry), §44.3 *"individual evaluation categories"*; PRD §43.1. A central index would make ten sibling tickets contend on one file. |
| D5 | **Case ids are `EVAL-<CAT>-<NNN>`** with a fixed three-letter category code (`FED AWD AGR PAY STE WHS ADJ CAS TMP SAF`), globally unique, never reused, and never confusable with the PRD §30.2 requirement ids `EVAL-001`/`EVAL-002` (a case id always carries a letter segment). | PRD §30.1 *"Requirement IDs are permanent. Do not reuse a deleted ID"*; plan §1.1 id rules; `INGF-07` deliverable 1 already references `evaluation_subset_ref: [EVAL-FED-001]`. |
| D6 | **PRD §14.1's per-case field list is mandatory in this dataset profile.** The PRD says *"Each case SHOULD include …"*; PRD §43.2 then says the schema *"includes"* those fields. This module makes them required, because a case missing `gold_authorities`, `expected_answer_status` or `legal_as_at` cannot be scored by any §43.3 metric. | PRD §14.1, §43.2, §43.3; §1 (normative language). Strengthening a SHOULD is recorded here, not silently assumed. |
| D7 | **Gold authorities are immutable corpus IDs pinned to a named evaluation CorpusRelease, and resolution is a two-mode check.** With a release supplied, every gold `document_version_id`/`node_version_id` must resolve or the check fails. Without one, only id shape is validated and the case reports `UNRESOLVED` — never `pass`. At release-candidate time resolution is mandatory: an unresolvable gold id is PRD §40.9's *"broken gold citation"*. | PRD §43.2 *"Gold authorities use immutable corpus IDs for a named evaluation CorpusRelease"*; §40.9; §15.3. The plan draws no edge from the authoring tickets to `CRPS-06`, so the check must degrade explicitly rather than assume a release exists (**Q-GOLD-D**). |
| D8 | **Dataset corrections are versioned, never invisible.** Changing a case's content, gold or expected outcome requires a `dataset_version` bump, a `change_reason`, an `approved_by`, and a migration record linking old→new gold. The checker compares content hashes against the previous version manifest and fails on an unexplained change. | PRD §14.3 *"Formal dataset corrections create a new version and reason; they are not edited invisibly"*; §43.2 *"a formal dataset migration links old/new gold; past reports stay reproducible"*; §43.4 *"Agents may not 'fix' a failing gold case by changing expected output without a versioned founder-approved reason."* |
| D9 | **Runs are recorded and replayable offline.** Every run writes an immutable run artifact (inputs, per-case observations, metric record) with a content hash; metrics are computed from the artifact, so a Reviewer re-derives every number with no model provider and no network — the `[fixture]` class of plan §1.1. | Plan §1.1 acceptance mapping (*PRD §14/§43 evaluation replays → `[fixture]`*); PRD §20.3 (CI runs per PR); §43.5 (*one immutable release report*). |
| D10 | **The judge is structurally non-deciding.** Its output type carries only clarity, missing-condition, coherence and usefulness dimensions — there is no field for legal correctness, binding status, date applicability, or pass/fail. Gate code has no import path to the judge package, and no §14.2 metric accepts a judge value as an input. | PRD §14.3 (quoted above); §9.4 (validation is deterministic). |
| D11 | **Gate verdicts are `PASS` / `FAIL` / `UNRESOLVED`, and there is no override.** The verdict type has no waiver, force, skip or acknowledged-risk field; there is no CLI flag or environment variable that can turn a `FAIL` or an `UNRESOLVED` into a `PASS`. A metric that could not be computed is `UNRESOLVED`, which blocks — silence is never success. | PRD §14.2; §43.3 *"Aggregate passing cannot waive a zero-tolerance error or critical regression"*; `EVAL-002`. |
| D12 | **The §14.2 thresholds are frozen data.** They are transcribed once into a versioned data file and a test asserts the file equals the PRD table row for row. Changing a number is a PRD change requiring Founder approval (PRD §45.5 "Product change"), never a code edit. | PRD §14.2; §45.5; §44.4. |
| D13 | **A gate that cannot be met is a Founder release decision, not an engineering adjustment.** The only permitted outcomes are PRD §44.4's two: continue and delay production access, or launch with an explicitly visible limited state where the PRD already permits it. | PRD §44.4 (quoted in every ticket's feedback obligation); §26; §7. |
| D14 | **Report tree ownership.** `GOLD-03` owns the report schema, the writer and `evals/reports/**` *except* `evals/reports/release-candidate/**`, which is `GOLD-17`'s. Per-run outputs are generated artifacts and are git-ignored; the only committed reports are `GOLD-03`'s one worked example and `GOLD-17`'s release-candidate pack. | Plan §5.22 file-scope column (`GOLD-03`: `evals/reports/**`; `GOLD-17`: `evals/reports/release-candidate/**`); plan §1.1 generated-artifact rule; PRD §43.5. |
| D15 | **`GOLD-16` is dependency-independent by construction.** Plan §5.22 gives it `INGF-07` plus the 52 adapters and **no** `GOLD-01` edge, so it defines its own report contract inside `pipelines/evaluation/src/coverage/**` and never imports `schemas/evaluation/**`. Unresolved `evaluation_subset_ref` ids are reported as findings, not failures; they become blocking in `GOLD-17`. | Plan §5.22, §6.2 (inventing an edge fails `dag-scan.mjs`); `INGF-07` deliverable 1 (`evaluation_subset_ref`); `SLEG-*`/`SINS-*`/`SCAS-*`/`SADJ-*`/`SFUT-*` DoD item 11 reports `DEFERRED(GOLD-16)`. |
| D16 | **Everything that runs in CI runs offline.** No live provider, no network, no key. Hosted calls (judge, synthesis under promotion) go through a recorded-cassette port; record mode exists, is off by default, and never runs in CI. | PRD §20.2, §20.3; plan §1.1; mirrors `12-evidence-safety` **D15**. |
| D17 | **Python for `pipelines/evaluation/**`, data as YAML/JSON.** Cases and gold are YAML (human-diffable, comment-carrying); schemas, run artifacts and reports are JSON (machine-consumed by `INTL-06` and `LNCH-05`). | PRD §18.2 *"Ingestion/build/evaluation \| Local Python pipeline"*; §20.1; §45.3 (`uv run pytest`). |
| D18 | **No real customer data, no real PII, anywhere under `evals/**`.** All 600 cases are synthetic; PII cases use documented canary tokens; employer names and ABNs are invented and marked. | PRD §14.1 *"600 stratified synthetic cases"*; §10.2; §45.1 item 6; `PII-001`. |
| D19 | **Test and manifest layout.** Each ticket owns `pipelines/evaluation/tests/<its own area>/**` matching its `src/` area name. `pipelines/evaluation/pyproject.toml` is created by `FND-01` and is **module-shared, append-only** (own dependencies and entry points only). Root `uv.lock` is regenerated as a build artifact, never hand-merged. | Plan §1.1 ("Package manifests", "Tests"); PRD §44.3. |
| D20 | **The runner cannot write blind-derived text, and blind run output is content-free.** Blind cases are loaded into an opaque wrapper whose string/JSON encoders raise; the report writer accepts ids, codes and aggregates only; after writing, a shingle scan of every produced artifact against the loaded blind plaintext aborts the run and deletes the artifact on any hit. Blind run output is limited to content-free metrics, category summaries and case ids — questions, answers, gold claims and source excerpts never reach a report or a log. When a blind run fails, implementation agents debug from development/validation cases and category-level blind metrics only; blind content is never revealed to make a fix convenient. | PRD §14.3, §43.1; plan **R9**, §8 **Q6** items 15–16 (confirmed). A leak that is only detected by review is a leak. |
| D21 | **Blind cases are authored outside this repository, by dedicated `evaluation-author` agents, and independently reviewed before encryption.** Those agents work in an isolated session/workspace and are not the ordinary implementation agents; they receive the evaluation schema, the stratification requirements, official source material and the case-authoring rubric, and never ordinary coding-agent context that would let the product be tuned against the blind questions. An independent `evaluation-reviewer` agent checks every blind case against official sources before encryption. No lawyer, tax specialist or employed employment-law/domain expert is engaged. The Founder performs a small risk-based spot check only — typically 12–20 of the 120 — and is neither the author nor the per-case reviewer. Blind plaintext is created in an isolated private directory outside the repository and is never committed to git, copied into ordinary fixtures, pasted into an implementation agent's session, or exposed to ordinary CI. | Plan §8 **Q6** (confirmed); PRD §14.3, §43.1, §45.1 item 6. Recorded in **[ADR 0004](../../adr/0004-blind-gold-sealing.md)**, authored by `GOLD-01`. |
| D22 | **Sealing construction, key custody and run authority.** Blind material is encrypted with PyNaCl/libsodium `SealedBox` — X25519 + XSalsa20-Poly1305, i.e. `crypto_box_seal`. The **public** key may be committed so an authorised evaluation-authoring agent can encrypt without holding the private key. The **Founder is the sole custodian of the private key** (**D2**). Each blind-dataset major version uses its own key pair, and suspected compromise forces immediate rotation. **Only the Founder may start a blind evaluation stage** that requires decrypting blind material. The local release-evaluation flow receives the private-key file path through `EVAL_BLIND_KEY_FILE`: **no default path, no in-repository lookup and no keyring fallback.** This decision settles what earlier drafts of this sub-PRD carried as the open question `Q-GOLD-F`. | Plan §8 **Q6** (confirmed); PRD §14.3, §20.2, §45.1 item 6. Recorded in **[ADR 0004](../../adr/0004-blind-gold-sealing.md)**, authored by `GOLD-01` at implementation time. Its Consequences section additionally records two implementation facts that follow from this decision and do not change it: `crypto_box_seal` is implemented in pure Python because PyNaCl is not installable in this repository's virtual-root uv layout (byte-for-byte interoperable, pinned by the published vectors, so no §8 Q6 writeback was required), and the private-key environment variable's name is assembled at run time everywhere outside `docs/**` because the repository's required `Secret scan` check matches credential-shaped names. Two further consequences were added in v0.4, both about what may be recorded ABOUT sealed material without weakening it: a BLIND case's content identity in the **D8** registry is a blake2b digest of its plaintext KEYED by a committed per-version salt (the ciphertext digest is not an identity — a re-seal changes it — and a plain plaintext hash would be a guess-confirmation oracle), and the **D20** leak detector holds hashed shingles rather than the shingle text. |
| D23 | **Limited-state launch policy.** No mandatory source group is pre-selected for omission or reduced implementation; every Commonwealth, state and territory mandatory group in the approved MVP scope must be attempted in full; arbitrary scope reduction to make a release date easier is not permitted. A group may launch in a customer-visible limited state **only** where measured evidence shows a genuine official-source limitation, using one of the states the PRD already defines (`METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`) and recording the evidence, the affected dates or collections, the customer-visible warning and why full coverage is unavailable. Silent omission is prohibited, and no unofficial source or commercial headnote may substitute for unavailable official material. `GOLD-16` produces the measured evidence and the proposed registry state; Gate 2 is the verification and sign-off step under this policy, not an opportunity to cut mandatory scope; `LNCH-05` verifies that the launch statement discloses the limitations accurately. The specific list of limited groups, if any, remains a Gate 2 output derived from evidence. | Plan §8 **Q10** (confirmed policy); PRD §7, §26, §44.4. |

## Rejected alternatives

| Rejected | Why |
|---|---|
| Keep blind gold as plaintext in `evals/gold/**` and rely on an ignore file, a `CODEOWNERS` rule or agent instructions. | A convention, not a mechanism — and plan §4 freezes `.claude/**`, so this module cannot write an agent-side deny rule at all. PRD §43.1 requires the data to be *inaccessible*, not merely discouraged. Replaced by **D1**/**D2**. |
| Keep blind material entirely outside the repository with no in-repo trace. | Then `EVAL-001`'s *"120 protected blind cases"* and the §43.1 totals are unverifiable, and PRD §43.2's *"past reports stay reproducible"* fails. The sealed envelope plus digest keeps count, integrity and version history checkable without exposing content. |
| One central `evals/splits/index.yaml` enumerating all 600 case ids. | Ten sibling authoring tickets would write one file — exactly the contention plan §2 exists to prevent, on the unit PRD §44.3 names as canonically parallel. Replaced by **D4**. |
| One ticket that authors all 600 cases. | Same reason, worse: it collapses the module's widest wave and hides per-category stratification. PRD §43.1 already provides the ten-way cut. |
| Let the pinned LLM judge decide borderline legal correctness, or break ties on refusal cases, to save Founder time. | PRD §14.3 forbids the judge deciding *"legal correctness, binding status, date applicability or release alone"*. **D10** makes it unrepresentable rather than merely prohibited. |
| Gate on an aggregate quality score with per-row waivers for the zero-tolerance metrics. | PRD §43.3: *"Aggregate passing cannot waive a zero-tolerance error or critical regression."* Replaced by **D11**. |
| Make the §14.2 thresholds configuration so a run can be tuned. | PRD §14.2 is the spec; configurable thresholds let a failing run lower its own bar. Replaced by **D12**. |
| Treat a metric that could not be computed as "not failing". | Silent absence is the most common way a gate stops working. **D11** makes `UNRESOLVED` blocking. |
| Compute metrics inside `apps/worker` next to the answer workflow. | PRD §45.2 gives `pipelines` *"Official-source acquisition/build/evaluation"* and forbids `apps/worker` anything but lease loops and orchestration; it would also couple the release gate to the code under test. |
| Reuse `evals/gold/**` as the fixture source for `23-assurance`. | Plan §4.2 settles it: `evals/gold/**` is this module's alone and assurance uses its own synthetic fixtures, precisely so blind material never spreads. |
| Generate the 600 cases with a model and accept them without corpus grounding. | PRD §14.1 requires cases *"derived from official source nodes"* and §43.2 requires gold authorities on immutable corpus IDs. An ungrounded case cannot score recall@10 or citation precision. |
| Repair a failing gold case by editing its expected output. | PRD §43.4: *"Agents may not 'fix' a failing gold case by changing expected output without a versioned founder-approved reason."* Replaced by **D8**. |
| Give `GOLD-16` a `blocked_by GOLD-01` edge so it can share `schemas/evaluation/**`. | Plan §5.22/§6.2 do not draw it, and an invented edge fails `dag-scan.mjs` parity with the plan. Replaced by **D15**; a genuinely required edge is a docs PR against the plan. |
| Promote a model profile on development results alone. | PRD §14.4 requires *"security/cost compatibility, development, frozen validation, blind testing and full non-regression before promotion"*. |
| Run blind cases in CI so every stage is uniform. | That requires the seal key in CI, i.e. in ordinary agent context — the exact thing PRD §14.3 forbids. Only the Founder starts a blind stage, with the key supplied through `EVAL_BLIND_KEY_FILE` (**D2**, **D22**). |
| Engage a lawyer, tax specialist or employed employment-law expert to author or review the blind set. | Plan §8 **Q6** settles the authoring path without one: dedicated `evaluation-author` agents, an independent `evaluation-reviewer` agent checking every blind case against official sources before encryption, and a Founder spot check of typically 12–20 of the 120. Replaced by **D21**. |
| Let each source-adapter ticket author its own evaluation cases under `evals/**`. | Plan §4 gives `evals/**` to this module alone; adapters declare `evaluation_subset_ref` ids and `GOLD-16` reconciles them (`INGF-07`, adapter DoD item 11). |

## Benchmark-selected and deferred parameters (plan §8)

**These are not open questions.** Plan §8's decision register classifies each as a PRD §1
`Benchmark-selected` parameter or as deferred until measured evidence: it is resolved by measurement
through the named ticket, never by preference, and none of them blocks early implementation. The
Founder approves production promotion **after** seeing the benchmark evidence and does not pick values
beforehand. Ids are unchanged so existing cross-references still resolve.

| # | Parameter and status | Owner | Resolved by | Blocks | Basis |
|---|---|---|---|---|---|
| **Q2 (plan §8 Q1)** | Exact hosted model per profile (`QUICK_SYNTHESIS`, `DEEP_SYNTHESIS`, `STRUCTURED_REPAIR`, `EVALUATION_JUDGE`, any policy-permitted hosted reranker/fallback). **Benchmark-selected.** | This module | `GOLD-15` records the promotion report comparing accuracy, zero-tolerance failures, latency, provider availability and cost; the Founder approves production promotion after seeing it | Production promotion only — `GOLD-04` builds against a pinned-profile port with recorded cassettes | PRD §14.4, §17.3; plan §8 Q1 |
| **Q3 (plan §8 Q2)** | Embedding model, tokenizer settings, dimensions, normalisation, distance metric, quantisation, reranker weights. **Benchmark-selected.** | `04-corpus-contract` + `11-retrieval-engine` | `CRPS-05` + `RETR-10` produce the compatibility/recall/latency/memory evidence; `GOLD-15` freezes the promoted profile and the release manifest pins it | Nothing — the embedding manifest pins whatever is chosen | PRD §14.4, §18.4; plan §8 Q2 |
| **Q4 (plan §8 Q4)** | Retrieval profile constants (candidate counts, fusion weights, rerank depth, evidence-node counts). **Benchmark-selected.** | `11-retrieval-engine` | Tuned on development cases only, then `RETR-10`; **frozen for validation by `GOLD-15`** | Nothing — PRD §36.2 gives buildable initial defaults | PRD §36.2 *"tuned on the development set and frozen"*; plan §8 Q4 |
| **Q5 (plan §8 Q5)** | Measured corpus statistics — document count, source/object-storage bytes, search-chunk count, hot-vector count, bundle size — replacing the ~300k document / ~150 GB planning hypothesis. **Deferred until corpus measurement**; no customer-facing copy may present the hypothesis as a measured fact. | This module | `GOLD-16` measures them and writes them back to this sub-PRD and plan §8 | Customer-facing capacity/coverage language | PRD §17.2 *"capacity hypotheses … MUST be replaced by measured corpus statistics"*; plan §8 Q5 |
| **Q6 (plan §8 Q9)** | Per-source anomaly thresholds (±10% count / >2% parse failure are initial defaults). **Baseline-selected.** | Each adapter ticket; defaults in `INGF-05` | Per-adapter DoD item 8 once a representative baseline exists; **consolidated and verified in `GOLD-16`** | Nothing — critical identity, time, mandatory-source and citation failures block unconditionally whatever the percentages | PRD §40.9; plan §8 Q9 |
| **Q7 (plan §8 Q10)** | The specific list of source groups, if any, that launch in an explicitly limited state — a **Gate 2 output derived from measured evidence**, not a policy question: the governing launch policy is confirmed (**D23**). | This module produces the evidence; Gate 2 verification and sign-off is the Founder's | `GOLD-16` produces the measured evidence and the proposed registry state → `LNCH-05` verifies the launch statement | Launch scope only | PRD §7, §26, §44.4; plan §8 Q10 |

## Open questions

None blocks the module's first wave. Each names an owner and the artifact that resolves it. Blind
authoring, isolation, sealing and key custody are **not** here: plan §8 **Q6** confirms them and
**D21**/**D22** record them, which also settles the former `Q-GOLD-F`.

| # | Question | Owner | Resolved by | Blocks | Basis |
|---|---|---|---|---|---|
| **Q-GOLD-A** | **What "acceptable schema success, cost and latency" means numerically** (PRD §14.2's second paragraph). The PRD sets no number, and the number is a risk/commercial decision. | **Founder**, staged through this module | `GOLD-15` measures and proposes; the Founder sets the value; `GOLD-03` reads it as frozen data | Nothing today — until a value exists `GOLD-03` returns **`UNRESOLVED` (blocking)**, never a silent pass (**D11**) | PRD §14.2, §43.3, §45.5 ("Benchmark-selected configuration") |
| **Q-GOLD-B** | **How `pnpm eval:smoke` reaches a Python pipeline.** `FND-01` deliverable 2 names `GOLD-03` as the owner of that script, but `FND-01` deliverable 1 sets `pnpm-workspace.yaml` packages to `apps/*`, `packages/*`, `tests/*` — `pipelines/*` is a **uv** member, not a pnpm one, so the recursive delegator can never find an implementation. | `00-foundation` (`FND-01`/`FND-02`) with `GOLD-03` | `GOLD-03` ships the real command as a uv entry point (`uv run python -m evaluation.gates smoke`) and reports the gap; making `pnpm eval:smoke` real is a **docs PR against `FND-01` deliverable 2** (and, if the CI job must change, `FND-02` deliverable 3) | Nothing — the CI job passes today because the delegator exits 0; it would pass forever, which is the risk being recorded | PRD §20.3, §45.3; `FND-01` deliverables 1–2; `FND-02` deliverable 3 |
| **Q-GOLD-C** | **PRD §43.1's per-jurisdiction floor is ambiguous for `adjacent-regimes`**: *"At least eight primary cases in each applicable nationwide category must cover each state/territory"* — 8 × 8 = 64 exceeds that category's 60 primary cases. | **Founder** (dataset design) with this module | `GOLD-01`'s stratification contract fixes the checkable rule; `GOLD-11` declares its own floor; recorded here | Nothing — `GOLD-09`/`GOLD-10` (64 = 8 × 8) and `GOLD-08` meet the strict reading; only `GOLD-11` needs the relaxed one | PRD §43.1, §6.3 |
| **Q-GOLD-D** | **Which CorpusRelease is the "named evaluation CorpusRelease", and who builds and pins it.** | `04-corpus-contract` (`CRPS-06`/`CRPS-07`) and `18-ops-release` (`RLSE-07`); consumed here | `GOLD-17` pins the actual release for the RC run; **D7**'s two-mode check covers the interim | Nothing — authoring proceeds with shape-validated ids reported `UNRESOLVED` | PRD §43.2, §18.4, §40.9 |
| **Q-GOLD-E** | **The PRD §14.3 run cadences** (*"smoke subsets on changes; development nightly where practical; development + validation weekly; all 600 for release candidates"*) need scheduled workflows, and `.github/workflows/**` is `00-foundation`'s. | `00-foundation` (`FND-02`) with `GOLD-03` | `GOLD-03` provides four named commands and documents the required schedule; adding the schedules is a **docs PR against `FND-02`** | Nothing — the commands are runnable manually and by the existing gate jobs | PRD §14.3, §20.3; plan §4.1 |
| **Q-GOLD-H** | **`packages/contracts` publishes no `Jurisdiction` enum family**, so the case schema cannot constrain `jurisdictions` to a canonical vocabulary. PRD §6.3 names the states in prose and fixes no codes, and `pipelines/corpus-builder/schema/intermediate/v1/document-identity.schema.json` already types `jurisdiction` as a bare non-empty string for the same reason (`Q-CRPS-4`). | `00-foundation` (`FND-03`), by docs PR | `GOLD-01` validates shape only and emits the **blocking** `UNRESOLVED` finding `JURISDICTION_VOCABULARY_UNRESOLVED` naming `FND-03`; a test asserts the family is still absent upstream, so the day `FND-03` publishes it the suite says so and the member becomes a generated enum with no other change | Nothing — authoring proceeds; `verify` exits non-zero until it is resolved, which is the intended visibility (**D11**). A second copy of the enum must never be defined in this module (PRD §44.3, §45.2) | PRD §6.3, §43.2, §44.3, §45.2; `FND-03`; `Q-CRPS-4` |
| **Q-GOLD-I** | **`uv run python -m evaluation.dataset` is not satisfiable as `GOLD-01` writes it.** Modules under `pipelines/<member>/src/` are top-level modules rooted at that directory (`CRPS-01`'s convention), `pipelines/evaluation` is not an importable package, and resolving `evaluation.dataset` needs either a new `src/evaluation/` package directory — outside `GOLD-01`'s file-scope and a module-wide convention change binding `GOLD-02` … `GOLD-16` — or a change to the PRD §44.3 serial-owned root manifest. | **Founder** / Architect, by a docs PR amending `GOLD-01` (and `GOLD-02` … `GOLD-16` if the convention changes) | `GOLD-01` ships `python -m dataset …` and a self-bootstrapping script-path form, both documented in `pipelines/evaluation/README.md`; the ticket amendment fixes the spelling | Nothing — both forms work today | Sub-PRD **D19**; `CRPS-01`; related to **Q-GOLD-B** |
| **Q-GOLD-G** | **Founder review capacity** for PRD §43.4's ordered queue over a full-600 release candidate. | **Founder** | `GOLD-17` defines the ordered queue, the evidence each item carries and the classification vocabulary — not the calendar | Gate 2 timing only | PRD §43.4, §25.1 |

## Work breakdown

Lane is `21-evaluation-600` and agent is `builder` for all seventeen tickets (plan §1.1). Ids, titles,
sizes and `depends-on` are exactly plan §5.22. File-scopes are repository-relative, sit inside the
module's plan §4 write-owns row, and are disjoint between tickets.

| Ticket | Size | Lane | File-scope (write-owns) | Depends on |
|---|---|---|---|---|
| [`GOLD-01`](tickets/GOLD-01-case-schema-splits-integrity-and-blind-protection.md) — Case schema, splits, integrity and blind protection | M | `21-evaluation-600` | `schemas/evaluation/**`, `evals/splits/**`, `pipelines/evaluation/src/dataset/**`, `pipelines/evaluation/tests/dataset/**`, `docs/adr/NNNN-blind-gold-sealing.md` (new file, plan **A9**) | `FND-03`, `CRPS-02` |
| [`GOLD-02`](tickets/GOLD-02-evaluation-runner-and-metric-implementations.md) — Evaluation runner and metric implementations | L | `21-evaluation-600` | `pipelines/evaluation/src/runner/**`, `pipelines/evaluation/tests/runner/**` | `GOLD-01`, `ASK-02` |
| [`GOLD-03`](tickets/GOLD-03-release-gate-enforcement-and-release-evidence-pack.md) — Release gate enforcement and release evidence pack | L | `21-evaluation-600` | `pipelines/evaluation/src/gates/**`, `pipelines/evaluation/tests/gates/**`, `evals/reports/**` **except** `evals/reports/release-candidate/**` | `GOLD-02` |
| [`GOLD-04`](tickets/GOLD-04-pinned-llm-judge-harness-non-deciding.md) — Pinned LLM-judge harness (non-deciding) | M | `21-evaluation-600` | `pipelines/evaluation/src/judge/**`, `pipelines/evaluation/tests/judge/**` | `GOLD-02` |
| [`GOLD-05`](tickets/GOLD-05-cases-federal-fair-work-nes-core-employment-80.md) — Cases: federal Fair Work/NES/core employment (80) | L | `21-evaluation-600` | `evals/cases/federal-core/**`, `evals/gold/federal-core/**` | `GOLD-01`, `SLEG-02` |
| [`GOLD-06`](tickets/GOLD-06-cases-modern-awards-coverage-and-classification-90.md) — Cases: modern awards, coverage and classification (90) | L | `21-evaluation-600` | `evals/cases/awards-coverage/**`, `evals/gold/awards-coverage/**` | `GOLD-01`, `SINS-03` |
| [`GOLD-07`](tickets/GOLD-07-cases-enterprise-agreements-and-lifecycle-70.md) — Cases: enterprise agreements and lifecycle (70) | L | `21-evaluation-600` | `evals/cases/agreements/**`, `evals/gold/agreements/**` | `GOLD-01`, `SINS-04` |
| [`GOLD-08`](tickets/GOLD-08-cases-payg-stp-super-fbt-and-eight-payroll-tax-regimes-70.md) — Cases: PAYG/STP/super/FBT and eight payroll-tax regimes (70) | L | `21-evaluation-600` | `evals/cases/payroll/**`, `evals/gold/payroll/**` | `GOLD-01`, `SINS-06`, `SINS-07`…`SINS-14` |
| [`GOLD-09`](tickets/GOLD-09-cases-state-territory-employment-and-industrial-law-64.md) — Cases: state/territory employment and industrial law (64) | L | `21-evaluation-600` | `evals/cases/state-employment/**`, `evals/gold/state-employment/**` | `GOLD-01`, `SLEG-03`…`SLEG-10` |
| [`GOLD-10`](tickets/GOLD-10-cases-whs-ohs-and-workers-compensation-64.md) — Cases: WHS/OHS and workers compensation (64) | L | `21-evaluation-600` | `evals/cases/whs-compensation/**`, `evals/gold/whs-compensation/**` | `GOLD-01`, `SADJ-01`…`SADJ-09` |
| [`GOLD-11`](tickets/GOLD-11-cases-adjacent-regimes-60.md) — Cases: discrimination, privacy/surveillance, labour hire, LSL, migration, child/public-sector/whistleblowing (60) | L | `21-evaluation-600` | `evals/cases/adjacent-regimes/**`, `evals/gold/adjacent-regimes/**` | `GOLD-01`, `SADJ-01`…`SADJ-09` |
| [`GOLD-12`](tickets/GOLD-12-cases-case-authority-appeal-and-treatment-40.md) — Cases: case authority, appeal and treatment (40) | L | `21-evaluation-600` | `evals/cases/case-treatment/**`, `evals/gold/case-treatment/**` | `GOLD-01`, `SCAS-02`, `SCAS-03`, `SCAS-04`, `SCAS-05` |
| [`GOLD-13`](tickets/GOLD-13-cases-historical-future-commencement-and-transitional-traps-30.md) — Cases: historical, future, commencement and transitional traps (30) | M | `21-evaluation-600` | `evals/cases/temporal-traps/**`, `evals/gold/temporal-traps/**` | `GOLD-01`, `SFUT-02` |
| [`GOLD-14`](tickets/GOLD-14-cases-insufficient-conflicting-evidence-pii-evasion-out-of-scope-32.md) — Cases: insufficient/conflicting evidence, PII, evasion, out-of-scope (32) | M | `21-evaluation-600` | `evals/cases/safety-refusal/**`, `evals/gold/safety-refusal/**` | `GOLD-01`, `EVID-03`, `EVID-05` |
| [`GOLD-15`](tickets/GOLD-15-model-and-retrieval-profile-promotion-with-non-regression-report.md) — Model and retrieval profile promotion with non-regression report | L | `21-evaluation-600` | `pipelines/evaluation/src/promotion/**`, `pipelines/evaluation/tests/promotion/**` | `GOLD-03`, `GOLD-04`, `RETR-10`, `EVID-07` |
| [`GOLD-16`](tickets/GOLD-16-full-roster-coverage-licence-and-freshness-reconciliation.md) — Full-roster coverage, licence and freshness reconciliation | L | `21-evaluation-600` | `pipelines/evaluation/src/coverage/**`, `pipelines/evaluation/tests/coverage/**` | `INGF-07` and all 52 adapter tickets |
| [`GOLD-17`](tickets/GOLD-17-release-candidate-full-600-run-blind-review-gate-closure.md) — Release-candidate full-600 run, blind review, gate closure | L | `21-evaluation-600` | `evals/reports/release-candidate/**` | `GOLD-03`, `GOLD-05`…`GOLD-16` |

Standing module-shared exception (plan §1.1 "Package manifests"): `pipelines/evaluation/pyproject.toml`
is created by `FND-01` and is **append-only** inside this module — each ticket adds only its own
dependencies and console entry points. Root `uv.lock` is regenerated as a build artifact, never
hand-merged.

### Case allocation (PRD §43.1, frozen — must total 600)

| Ticket | Category directory | Code | Development | Validation | Blind | Total |
|---|---|---|---:|---:|---:|---:|
| `GOLD-05` | `federal-core` | `FED` | 48 | 16 | 16 | 80 |
| `GOLD-06` | `awards-coverage` | `AWD` | 54 | 18 | 18 | 90 |
| `GOLD-07` | `agreements` | `AGR` | 42 | 14 | 14 | 70 |
| `GOLD-08` | `payroll` | `PAY` | 42 | 14 | 14 | 70 |
| `GOLD-09` | `state-employment` | `STE` | 38 | 13 | 13 | 64 |
| `GOLD-10` | `whs-compensation` | `WHS` | 38 | 13 | 13 | 64 |
| `GOLD-11` | `adjacent-regimes` | `ADJ` | 36 | 12 | 12 | 60 |
| `GOLD-12` | `case-treatment` | `CAS` | 24 | 8 | 8 | 40 |
| `GOLD-13` | `temporal-traps` | `TMP` | 18 | 6 | 6 | 30 |
| `GOLD-14` | `safety-refusal` | `SAF` | 20 | 6 | 6 | 32 |
| **Total** | | | **360** | **120** | **120** | **600** |

### Cross-cutting representation floors (PRD §14.1, §43.1 cross-tags)

PRD §14.1 requires the 600 to cover *"Search, Compare, Coverage and Monitor behaviour"* and PRD §43.1
says *"cross-tags ensure every product surface and answer status is represented"*. Because no primary
category owns Compare or Monitor, the floors are allocated so the global invariant is satisfiable
without any ticket depending on another ticket's content. Each authoring ticket declares its floors in
its own `stratification.yaml`; `GOLD-01`'s checker asserts the per-category floors always and the
global invariant in `--complete` mode (run by `GOLD-17`).

| Surface / status | Floor allocation |
|---|---|
| `SEARCH` cross-tag | ≥ 3 in every category |
| `COVERAGE` cross-tag | `GOLD-06` ≥ 12, `GOLD-07` ≥ 8 |
| `COMPARE` cross-tag | `GOLD-09` ≥ 4 (jurisdiction), `GOLD-13` ≥ 4 (time), `GOLD-12` ≥ 4 (authority/instrument) |
| `MONITOR` cross-tag | `GOLD-05` ≥ 3, `GOLD-13` ≥ 3 |
| `SUPPORTED`, `CONDITIONAL` | ≥ 2 each in every category |
| `INSUFFICIENT_EVIDENCE`, `CONFLICTING_SOURCES`, `OUT_OF_SCOPE` | `GOLD-14` (its primary subject); ≥ 1 each also in `GOLD-06`, `GOLD-12` |
| `SOURCE_NOT_CURRENT` | `GOLD-13` ≥ 3 |
| Employee-PII rejection (no answer status, PRD §36.8) | `GOLD-14` ≥ 4, synthetic canaries only (**D18**) |

### Lane shape (plan §7: **17 tickets · 5 minimum waves · 5 max useful lanes · not fully serial**)

External blockers in brackets; intra-module edges only.

```text
wave 1  GOLD-01 [FND-03, CRPS-02]                 | GOLD-16 [INGF-07 + 52 adapters]
wave 2  GOLD-02 [ASK-02] | GOLD-05 [SLEG-02] | GOLD-06 [SINS-03] | GOLD-07 [SINS-04]
        | GOLD-08 [SINS-06..14] | GOLD-09 [SLEG-03..10] | GOLD-10 [SADJ-01..09]
        | GOLD-11 [SADJ-01..09] | GOLD-12 [SCAS-02..05] | GOLD-13 [SFUT-02]
        | GOLD-14 [EVID-03, EVID-05]
wave 3  GOLD-03 | GOLD-04
wave 4  GOLD-15 [RETR-10, EVID-07]
wave 5  GOLD-17
```

The ten authoring tickets are the wide wave and share no file: ten disjoint category directories under
`evals/cases/**` and `evals/gold/**`, with the split index composed rather than centrally listed
(**D4**). The tooling branch (`GOLD-02` → `GOLD-03`/`GOLD-04` → `GOLD-15`) runs concurrently with them
in `pipelines/evaluation/src/**`, and `GOLD-16` is independent of both.

### Cross-module consumers (plan §6.2)

Every edge below is drawn in plan §6.2 and mirrored in the tickets' `blocks` frontmatter.

| This ticket | Unblocks |
|---|---|
| `GOLD-01` | `GOLD-02`, `GOLD-05` … `GOLD-14` |
| `GOLD-02` | `GOLD-03`, `GOLD-04` |
| `GOLD-03` | `GOLD-15`, `GOLD-17`, **`INTL-06`** (evaluation-run console) |
| `GOLD-04` | `GOLD-15` |
| `GOLD-05` … `GOLD-16` | `GOLD-17` |
| `GOLD-17` | **`LNCH-04`** (paid-pilot onboarding and demo script), **`LNCH-05`** (Definition-of-Done closure) |

## Acceptance — what makes the whole module done

The module is done when all seventeen tickets are delivered (`/verify-delivery` green each) **and**:

1. **`EVAL-001` — the dataset is 360 / 120 / 120 and provably non-overlapping.** The composed dataset
   matches the PRD §43.1 table exactly, per category and in total; no case id appears in two splits;
   no two cases share a scenario/question hash; every case validates against the PRD §43.2 schema with
   the PRD §14.1 fields present (**D6**); every category's declared stratification floors hold.
   (PRD §30.2 `EVAL-001`; §14.1; §43.1; §43.2.)
2. **`EVAL-002` — a deliberately failing metric prevents promotion.** With any one §14.2 row forced to
   fail, the gate command exits non-zero, the verdict is `FAIL` with the failing row named, no signed
   release-evidence pack is produced, and there is no flag, field or environment variable that changes
   the outcome. An uncomputable metric yields `UNRESOLVED`, which also blocks. (PRD §30.2 `EVAL-002`;
   §14.2; §43.3; **D11**.)
3. **All seven PRD §14.2 thresholds are computed and enforced as measurable items** — factual citation
   coverage **100%**, citation precision **≥ 98%**, retrieval recall@10 **≥ 90%**, critical legal-date
   or jurisdiction errors **0**, unsupported definitive claims **0**, correct refusal **≥ 95%**,
   source-status correctness **≥ 98%** — each computed per PRD §43.3's calculation column, reported per
   category and in aggregate, with the threshold values frozen and asserted equal to the PRD table
   (**D12**).
4. **The §14.2 second paragraph is enforced too**: no critical regression against the accepted
   baseline, and no supported-to-unsupported or refusal-to-definitive degradation in material cases;
   schema success, cost and latency are reported by model profile and task type (PRD §43.3) and gated
   once **Q-GOLD-A** is answered — `UNRESOLVED` until then.
5. **PRD §14.3's method rules hold mechanically.** Deterministic checks control the legal/citation
   gates; the judge cannot decide correctness, binding status, date applicability or release (**D10**);
   blind gold never exists as plaintext in the tree, blind material is authored and reviewed outside
   this repository before encryption, and no blind stage can run without the Founder-held key
   (**D1**, **D2**, **D20**, **D21**, **D22**); dataset corrections create a new version and reason
   (**D8**).
6. **PRD §43.5's release evidence pack exists as one immutable, hash-identified report** carrying
   application/corpus versions, source coverage and gaps, all 600 metrics, the per-category breakdown,
   the critical-error list, changed cases, security/tenant/PII results, performance and memory
   benchmark, provider/profile cost forecast, backup/restore result, accessibility result, known risks
   and founder approval/reason — with externally-produced slots carried as referenced artifacts whose
   absence is `UNRESOLVED`, never blank. (`GOLD-03` schema; `GOLD-17` instance; `INTL-06` links it.)
7. **PRD §26 "Quality" is evidenced**: all launch thresholds pass on the release candidate; no critical
   time/jurisdiction errors or unsupported definitive claims remain; model profiles, fallback status
   and actual versions are recorded (`GOLD-15`, `GOLD-17`).
8. **PRD §26 "Corpus" roster evidence is produced**: every one of the 52 mandatory groups is `ACTIVE`
   or in an explicit, customer-visible limited state justified by measured evidence of a genuine
   official-source limitation (**D23**), with the five PRD §12.1 dates separated and the measured
   corpus statistics replacing the §17.2 planning baseline (`GOLD-16`; PRD §7, §44.4).
9. **Every `[machine]`/`[fixture]` item reproduces offline** with no network, no provider key and no
   seal key: `uv run pytest` and `pnpm test` green on the merged default branch; `cargo test
   --workspace` unaffected (this module writes no Rust). Blind-stage items are the module's only
   Founder-run `[human]` items — only the Founder holds the private key and only the Founder starts a
   blind stage (**D22**) — and are declared as such. (PRD §20.3, §45.3; plan §1.1.)

## Changelog

- **v0.4 — 2026-08-20** — `GOLD-01` review round 2, three mechanisms strengthened; no decision
  changed and no writeback owed against plan §8 **Q6**. (1) **D8** is now enforced for BLIND cases,
  which it previously was not: a sealed case's content identity is a blake2b digest of its plaintext
  **keyed** by a per-version `content_hash_salt` that the registry carries, written by `seal` (the
  only step holding plaintext) and compared by `VERSIONED_CORRECTIONS`. Neither obvious alternative
  works — the ciphertext digest changes on every re-seal, and a plain plaintext hash would be a
  guess-confirmation oracle over blind content — so the keyed form is what makes PRD §14.3's "not
  edited invisibly" checkable for the split where an invisible edit is cheapest. `seal` refuses to
  run without a salt, a missing digest is `UNRESOLVED`, and a blind correction always requires a
  migration record. Recorded in ADR 0004, implementation consequence 4. (2) `NO_NEAR_DUPLICATES` now
  emits one `UNRESOLVED` per blind-involving split pair instead of nothing, so `verify` can no
  longer present a clean result for a comparison it never made (**D11**: `UNRESOLVED` is never a
  pass); a correct dataset still produces no `FAIL`. (3) Parser errors are content-free by
  invariant, because a malformed file under a `blind/` path would otherwise have published a
  fragment of its own plaintext through an ordinary `verify` run. **D20**'s leak detector now holds
  hashed shingles rather than the shingle text (ADR 0004, implementation consequence 5).
- **v0.3 — 2026-08-19** — `GOLD-01` delivered. **D21**/**D22** now name the allocated ADR number,
  **[ADR 0004 — Blind gold sealing, isolation and key custody](../../adr/0004-blind-gold-sealing.md)**,
  which records plan §8 **Q6** rather than reopening it (`0001` through `0003` were already taken, `0002`
  three times over by concurrent tickets). Two new open questions, both raised by implementation and
  neither blocking: **Q-GOLD-H**, `packages/contracts` publishes no `Jurisdiction` family so
  `jurisdictions` is shape-checked and reported `UNRESOLVED` against `FND-03` rather than given a
  second, local copy of a canonical enum; and **Q-GOLD-I**, the `evaluation.dataset` module path
  `GOLD-01` names is not satisfiable under `CRPS-01`'s import convention, so two working invocation
  forms ship and a ticket amendment is raised. **Q-GOLD-C** is answered in the shipped contract: the
  per-jurisdiction floor is **declared** per category in each `stratification.yaml` rather than
  derived from PRD §43.1's "at least eight", which keeps the rule checkable for `adjacent-regimes`
  without weakening `ALLOCATION_EXACT` (requirement `EVAL-001` itself); the Founder still owns
  `GOLD-11`'s value. **Q-GOLD-D** is unchanged and is exactly what `GOLD_RESOLVES`'s two-mode check
  reports.
- **v0.2 — 2026-08-03** — realigned to `docs/prd/breakdown-plan.md` §8's decision register. **Q6 is
  confirmed**: blind authoring, isolation, independent review, the sealed-box construction and key
  custody are now decisions **D21**/**D22** with a rewritten **D2** and **D20**; the former open
  questions `Q1 (plan §8 Q6)` and **`Q-GOLD-F`** are resolved and removed from the open-questions
  table; `GOLD-01`, `GOLD-05` … `GOLD-14`, `GOLD-15` and `GOLD-17` no longer describe blind authorship
  or key custody as a pending Founder decision; and `GOLD-01` now carries the full **ADR decision
  input** for `docs/adr/NNNN-blind-gold-sealing.md`, which its Builder authors at implementation time
  (no ADR exists yet). **Q10 is confirmed policy**: the limited-state launch policy is decision
  **D23** and is applied in `GOLD-16`, with the specific list of limited groups still a Gate 2 output.
  Q1/Q2/Q4 (benchmark-selected) and Q5 (deferred until corpus measurement) moved out of "Open
  questions" into a new **Benchmark-selected and deferred parameters** table resolved by `GOLD-15` and
  `GOLD-16` on measured evidence, and `GOLD-04`'s judge-model caveat is re-framed the same way. No
  ticket id, count, allocation, stratification floor, dependency
  edge, `blocked_by`/`blocks` entry, file-scope, PRD traceability reference, evidence obligation or
  quality gate changed.
- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.22 (17 tickets,
  `GOLD-01` … `GOLD-17`). Records decisions **D1**–**D20**, rejects 15 alternatives, carries plan §8
  open questions Q1/Q2/Q4/Q5/Q6(Q9)/Q7(Q10) and opens **Q-GOLD-A** … **Q-GOLD-G** — one an ADR
  candidate (blind-gold sealing, `GOLD-01`), two cross-module gaps escalating to `00-foundation`
  (**Q-GOLD-B** `pnpm eval:smoke` cannot reach a uv-only member; **Q-GOLD-E** the PRD §14.3 run
  cadences need `FND-02` workflows), one a PRD ambiguity for the Founder (**Q-GOLD-C** the §43.1
  per-jurisdiction floor for `adjacent-regimes`), and one an unowned upstream artifact (**Q-GOLD-D**
  the named evaluation CorpusRelease). File-scopes extend plan §5.22's columns only within the module's
  plan §4 row: `GOLD-01` adds `pipelines/evaluation/src|tests/dataset/**` (the split-integrity test the
  plan's own goal column requires) and its ADR file; every ticket adds its own
  `pipelines/evaluation/tests/<area>/**`; `GOLD-03`'s `evals/reports/**` is narrowed to exclude
  `GOLD-17`'s `release-candidate/**`.
