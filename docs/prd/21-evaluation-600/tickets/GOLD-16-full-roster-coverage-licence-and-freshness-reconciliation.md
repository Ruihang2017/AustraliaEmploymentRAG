---
id: GOLD-16
title: "Full-roster coverage, licence and freshness reconciliation"
module: 21-evaluation-600
lane: 21-evaluation-600
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INGF-07, SLEG-02, SLEG-03, SLEG-04, SLEG-05, SLEG-06, SLEG-07, SLEG-08, SLEG-09, SLEG-10, SINS-02, SINS-03, SINS-04, SINS-05, SINS-06, SINS-07, SINS-08, SINS-09, SINS-10, SINS-11, SINS-12, SINS-13, SINS-14, SCAS-02, SCAS-03, SCAS-04, SCAS-05, SCAS-06, SCAS-07, SCAS-08, SCAS-09, SCAS-10, SCAS-11, SCAS-12, SCAS-13, SADJ-01, SADJ-02, SADJ-03, SADJ-04, SADJ-05, SADJ-06, SADJ-07, SADJ-08, SADJ-09, SFUT-02, SFUT-03, SFUT-04, SFUT-05, SFUT-06, SFUT-07, SFUT-08, SFUT-09, SFUT-10]
blocks: [GOLD-17]
---

# GOLD-16 — Full-roster coverage, licence and freshness reconciliation

Implements PRD §6.1, §7, §12.1, §26 and §44.4 — contributes to requirements **ADM-001** and **EVAL-002**;
epic `E32-QUALITY` (PRD §44.2; the 2 GB real-scale benchmark half is `RLSE-11`).
No ADR — the decision is already made in PRD §7 (*"No mandatory source group may remain
`PLANNED_NOT_ACTIVE` at release"*) and PRD §44.4 (*"It is not permitted to silently call an unimplemented
source category covered"*); this is build ticket 16 of 17 against it.
Parent sub-PRD: [21-evaluation-600 README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [INGF-07 — Source Coverage Registry composition and freshness fields](../../05-ingestion-framework/tickets/INGF-07-source-coverage-registry-composition-and-freshness-fields.md) **and all 52 mandatory source-adapter tickets** — `SLEG-02` … `SLEG-10` ([06-sources-legislation](../../06-sources-legislation/README.md)), `SINS-02` … `SINS-14` ([07-sources-instruments](../../07-sources-instruments/README.md)), `SCAS-02` … `SCAS-13` ([08-sources-cases](../../08-sources-cases/README.md)), `SADJ-01` … `SADJ-09` ([09-sources-adjacent](../../09-sources-adjacent/README.md)), `SFUT-02` … `SFUT-10` ([10-sources-future](../../10-sources-future/README.md)). The frontmatter `blocked_by` list is authoritative and mirrors breakdown plan §6.2 exactly.
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §6.1 already fixes the nine registry attributes, §12.1 the five freshness dates and §7 the permitted
limited states; this reconciles the composed registry against the mandatory roster and reports the truth.

## Background + basis

**PRD §7, quoted verbatim — the rule this ticket enforces:**

> **No mandatory source group may remain `PLANNED_NOT_ACTIVE` at release.** A group blocked by official
> capability or licensing MUST use an explicit status such as `METADATA_AND_LINK_ACTIVE`,
> `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED` or `SOURCE_UNAVAILABLE` and MUST produce customer-visible
> warnings when relevant.

**PRD §44.4, quoted verbatim:**

> If the full roster cannot pass by Week 8, the only permitted launch outcomes are:
>
> 1. continue work and delay production access; or
> 2. launch with an explicit source group in a technically/licensing-limited state only where the PRD
>    already permits that state, the limitation is visible and relevant answers safely warn/refuse.
>
> **It is not permitted to silently call an unimplemented source category covered.**

**PRD §6.1, quoted verbatim:**

> Every source MUST appear in the Source Coverage Registry with **authority, jurisdiction, official
> endpoints, document/date coverage, licensing, adapter status, change-detection capability, freshness
> and known gaps.**
>
> The product MUST NOT claim that every Australian employment-law document is included without
> exception. Customer-facing coverage language MUST refer to the published/auditable source registry and
> visible limitations.

**PRD §12.1, quoted verbatim — the five dates that must stay separate:**

> Customer-visible source metadata MUST separate:
>
> - last discovery check;
> - last successful change scan;
> - last full reconciliation;
> - last content ingestion;
> - freshness status.
>
> … Sources without reliable delta mechanisms MUST show `FRESHNESS_LIMITED` rather than a false
> guarantee.

**PRD §17.2, the hypothesis this ticket replaces with measurement:** *"approximately 300,000 documents;
approximately 150 GB source/object storage; … These counts are **capacity hypotheses and MUST be
replaced by measured corpus statistics**."* That replacement is breakdown plan §8 **Q5**, owned by this
ticket. Plan §8 records **Q5** as *deferred until corpus measurement*: the ~300k document / ~150 GB
figures are planning hypotheses, and neither this report nor any customer-facing copy may present them
as measured fact until this ticket measures the real values.

**PRD §40.9, the anomaly rules this ticket consolidates:** *"Initial anomaly rules flag, rather than
automatically fail, a ±10% collection count change, >2% parse failure, any duplicate stable identity,
any overlapping effect interval …, **any missing mandatory source group, or any broken gold citation**.
Critical identity/time/citation and mandatory-source failures block release; percentage thresholds are
refined per source after baseline measurement."* Plan §8 **Q9** consolidates those per-source thresholds
here.

**PRD §26, "Corpus", quoted verbatim:** *"All five source waves have active or explicitly limited registry
status. Current financial year plus the preceding two financial years (three total) are validated. Raw
evidence/provenance/licensing and immutable CorpusRelease workflows operate. Source freshness, quarantine
and safe promotion/rollback are demonstrated."*

**What is already decided elsewhere and must not be re-decided here.** `INGF-07` owns the registry
schema, the per-adapter `registry.yaml` layout, the 52-entry mandatory roster as code, the composer and
the `freshness_status` derivation — this ticket **consumes** the composed registry and never writes a
`registry.yaml`. `INGF-04` owns licence snapshots and assessments; `INGF-05` owns quarantine and run
accounting; each adapter ticket owns its own DoD evidence including its `evaluation_subset_ref` ids
(PRD §40.8 item 11), which several adapter tickets currently report as `DEFERRED(GOLD-16)`.

**Sub-PRD decisions carried forward:** **D15** — **this ticket is dependency-independent by
construction.** Breakdown plan §5.22 gives it `INGF-07` plus the 52 adapters and **no `GOLD-01` edge**,
so it defines its own report contract inside its own tree and never imports `schemas/evaluation/**`. An
unresolved `evaluation_subset_ref` id is reported as a **finding**, not a failure; it becomes blocking at
`GOLD-17`, which does depend on both. Also **D16** (offline), **D17** (Python), **D19** (test layout).

**Accepted caveats carried forward:**

- **This ticket may run before any evaluation case exists.** Its blockers are sources, not `GOLD-01` …
  `GOLD-14`. Every check that needs the case tree degrades to an explicit `UNRESOLVED` finding.
- **It decides nothing about launch, and the launch policy is already settled.** Plan §8 **Q10**
  (confirmed policy; sub-PRD **D23**) fixes it: no mandatory source group is pre-selected for omission
  or reduced implementation, every mandatory group must be attempted in full, arbitrary scope reduction
  to make a release date easier is not permitted, and a customer-visible limited state is permitted
  **only** where measured evidence shows a genuine official-source limitation — recorded with that
  evidence, the affected dates or collections, the customer-visible warning and the reason. This ticket
  produces the measured evidence and the proposed registry state; Gate 2 is the Founder's verification
  and sign-off step, not an opportunity to cut mandatory scope; `LNCH-05` verifies the launch
  statement. Which groups, if any, end up limited is a Gate 2 output, never a scope choice made here.

## Goal

Produce `pipelines/evaluation/src/coverage/**`: a reconciliation of the composed Source Coverage Registry
against the 52-group mandatory roster that (a) fails when any mandatory group is missing or still
`NOT_STARTED`/`PLANNED_NOT_ACTIVE`/`IN_DEVELOPMENT` in release mode, (b) verifies each group carries all
nine PRD §6.1 attributes and the five PRD §12.1 dates as separate fields with a derived
`freshness_status`, (c) checks each group's licence assessment state and the customer-visible warning
that a limited state requires, (d) replaces PRD §17.2's planning baseline with **measured** corpus
statistics, (e) consolidates the PRD §40.9 per-source anomaly thresholds, and (f) resolves each group's
`evaluation_subset_ref` ids against the case tree when it exists — emitting one machine-readable,
content-hashed reconciliation report with an explicit gap list. Completion is mechanically checkable:
`uv run pytest pipelines/evaluation/tests/coverage` is green offline over a synthetic 52-group fixture
tree, release-mode reconciliation fails on a missing or non-active mandatory group, and no check can
report "covered" without evidence.

## Non-goals

- **No registry schema, per-adapter `registry.yaml`, composer or roster definition** — `INGF-07` (merged;
  blocker). This ticket reads the composed output.
- **No adapter, fetch, parse, licence assessment or quarantine handling** — modules `05`–`10`.
- **No corpus build, release manifest or promotion** — `04-corpus-contract`, `18-ops-release`.
- **No case schema, split checker or seal** — `GOLD-01`. This ticket has **no** `GOLD-01` edge (sub-PRD
  **D15**) and must not import `schemas/evaluation/**`; `evaluation_subset_ref` resolution is
  filesystem-level and degrades to `UNRESOLVED`.
- **No §14.2 thresholds, verdicts or evidence pack** — `GOLD-03`. This ticket has no `GOLD-03` edge
  either; it emits its own report, which `GOLD-17` folds into the PRD §43.5 pack.
- **No 2 GB real-scale performance/memory benchmark** — `18-ops-release` (`RLSE-11`), the other half of
  epic `E32`.
- **No launch-scope decision, and no scope reduction of any kind** — the governing policy is confirmed
  (PRD §44.4; plan §8 **Q10**; sub-PRD **D23**) and its Gate 2 verification and sign-off is the
  Founder's; `LNCH-05` verifies the launch statement. This ticket produces the measured evidence and the
  proposed registry state only.
- **No customer-facing coverage copy** — `24-launch` (`LNCH-03`) and `14-search-product` (source
  screens). This ticket supplies the auditable facts PRD §6.1 says that copy must refer to.

## File-scope (write-owns)

Owned by this ticket:

- `pipelines/evaluation/src/coverage/**` — including its **own** report contract
  (`src/coverage/schema/coverage-reconciliation-report.schema.json`), because this ticket has no
  `GOLD-01` edge (sub-PRD **D15**)
- `pipelines/evaluation/tests/coverage/**` (sub-PRD **D19**)
- `pipelines/evaluation/pyproject.toml` — **append-only**, own dependencies and the
  `evaluation.coverage` entry point only

Does not touch:

- `pipelines/evaluation/src/{dataset,runner,gates,judge,promotion}/**` — `GOLD-01` … `GOLD-04`,
  `GOLD-15`. `schemas/evaluation/**` — `GOLD-01` (deliberately not imported).
- `evals/**` — `GOLD-01`, `GOLD-03`, `GOLD-05` … `GOLD-14`, `GOLD-17`. Read-only for
  `evaluation_subset_ref` resolution; this ticket writes no case, gold, split or report file there.
- `pipelines/ingestion/**`, `pipelines/adapters/**` — `05`–`10`. `pipelines/corpus-builder/**`,
  `pipelines/embeddings/**` — `04-corpus-contract`.
- `apps/**`, `packages/**`, `services/**`, `infra/**`, `tests/**`, `.github/workflows/**` — other modules
  per plan §4/§4.1. `docs/PRD.md`, `.claude/**` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). `pipelines/evaluation/src/coverage/**` is written by no other ticket (plan §5.22). This ticket
is **independent of the whole `GOLD-01` → `GOLD-15` chain**: it sits in module wave 1 by intra-module
edges and runs concurrently with every other ticket in the module, in a disjoint code tree, sharing only
the append-only `pyproject.toml`. Its 53 declared blockers are all outside this module and land first
(`INGF-07` in `05-ingestion-framework`; the 52 adapters across `06`–`10`, which plan §7 schedules as the
two ~50-wide waves). Its dependent `GOLD-17` is `blocked_by` this ticket.

## Deliverables

1. **`src/coverage/roster.py` — the 52-group mandatory roster, read from `INGF-07`.** The roster is
   `INGF-07` deliverable 4's `MANDATORY_SOURCE_GROUPS`; this module **consumes** it and additionally
   asserts the count is 52 and that the ids match PRD §40.2–§40.6 (nine legislation registers, thirteen
   national-instrument/payroll groups, twelve court/tribunal collections, nine adjacent groups, nine
   future-law groups). A divergence between `INGF-07`'s roster and the PRD is a `FAIL`, not a silent
   adoption.
2. **`src/coverage/checks/**` — one module per reconciliation rule**, each a pure
   `(registry, context) -> list[Finding]`:

   | # | Check id | Rule | PRD basis |
   |---:|---|---|---|
   | 1 | `MANDATORY_GROUP_PRESENT` | every roster group exists in the composed registry | §7, §40.1, §44.4 |
   | 2 | `NO_NON_ACTIVE_AT_RELEASE` | in release mode no group is `NOT_STARTED`, `PLANNED_NOT_ACTIVE` or `IN_DEVELOPMENT` | §7 |
   | 3 | `LIMITED_STATE_IS_EXPLICIT` | a group not `ACTIVE` uses one of §7's named limited states and records the measured evidence of the genuine official-source limitation, the affected dates or collections, the reason, and the customer-visible warning it triggers | §7, §44.4; plan §8 **Q10** |
   | 4 | `NINE_ATTRIBUTES_PRESENT` | authority, jurisdiction, official endpoints, document/date coverage, licensing, adapter status, change-detection capability, freshness, known gaps | §6.1 |
   | 5 | `FIVE_DATES_SEPARATE` | last discovery check, last successful change scan, last full reconciliation, last content ingestion and freshness status are distinct fields, none derived by copying another | §12.1 |
   | 6 | `FRESHNESS_HONEST` | a group without a reliable delta mechanism is `FRESHNESS_LIMITED`, not "daily"; a stale date beyond the group's declared cadence downgrades the status | §12.1 |
   | 7 | `LICENCE_ASSESSED` | every group has a licence snapshot and assessment state from `INGF-04`; an unclear assessment must be metadata/link-only, never assumed permissive | §11.1, §6.1 |
   | 8 | `THREE_FINANCIAL_YEARS` | each group's document/date coverage spans the PRD §6.6 three financial years, or declares the gap explicitly | §6.6, §26 |
   | 9 | `QUARANTINE_CLOSED` | no group carries open quarantine items that would block promotion | §12.2, §40.9 |
   | 10 | `EVALUATION_SUBSET_RESOLVES` | every `evaluation_subset_ref` id resolves to a case in `evals/cases/**`; **`UNRESOLVED` (a finding) when the case tree is absent** — blocking only at `GOLD-17` | §40.8 item 11; sub-PRD **D15** |
   | 11 | `ANOMALY_THRESHOLDS_SET` | every group declares its per-source anomaly thresholds, or explicitly inherits `INGF-05`'s defaults with a reason | §40.9; plan §8 **Q9** |
   | 12 | `MEASURED_STATISTICS_PRESENT` | measured document count, storage bytes, chunk count and hot-vector count are present and replace the §17.2 planning baseline | §17.2; plan §8 **Q5** |

   Findings carry check id, severity (`FAIL` / `UNRESOLVED` / `INFO`), group id and a content-free
   message. **No check may report a group covered without evidence** — the absence of data is
   `UNRESOLVED`, never a pass (PRD §44.4).
3. **`src/coverage/statistics.py` — measured corpus statistics (plan §8 Q5).** Computes, from the pinned
   corpus release and the composed registry: document count, node/chunk counts, embedded-chunk count,
   on-disk sizes per bundle component, per-group document and date coverage, and the resulting
   always-hot vector count. The report presents them **beside** the PRD §17.2 planning baseline with the
   delta, so replacing a hypothesis with a measurement is visible rather than implied.
4. **`src/coverage/anomalies.py` — consolidated PRD §40.9 thresholds (plan §8 Q9).** Collects each
   group's declared count-change and parse-failure thresholds, flags groups still on the ±10% / >2%
   placeholders, and separates **flag** rules from the **blocking** ones the PRD names — critical
   identity/time/citation failures, missing mandatory groups and broken gold citations.
5. **`src/coverage/report.py` + `src/coverage/schema/coverage-reconciliation-report.schema.json`** — one
   machine-readable, content-hashed report: roster status per group, the five dates, licence state,
   freshness, coverage years, quarantine, anomaly thresholds, evaluation-subset resolution, measured
   statistics, and an explicit **gap list** in which every non-`ACTIVE` group appears with its state,
   reason and required customer-visible warning. The report is `GOLD-17`'s input for PRD §43.5's *"source
   coverage and gaps"* section and `LNCH-05`'s input for PRD §26's corpus items.
6. **`src/coverage/launch_scope.py` — the PRD §44.4 decision support, not the decision.** Produces the two
   permitted outcomes as data: the set of groups that would have to be declared limited (with the exact
   §7 state, the measured evidence of the official-source limitation, the affected dates or collections
   and the warning-text requirement), and the set that would delay launch. A proposed limited state
   without that measured evidence is not representable — the module emits `UNRESOLVED` instead — and
   there is no input by which a mandatory group can be dropped or reduced to make a date easier (plan §8
   **Q10**, confirmed policy). It contains **no** approval field and **no** default recommendation: Gate
   2 verification and sign-off is the Founder's, and `LNCH-05` verifies the launch statement.
7. **`src/coverage/cli.py`** — `python -m evaluation.coverage reconcile [--mode dev|release]
   [--registry <path>] [--release <path>] [--cases <path>] [--out <dir>]`. Release mode exits non-zero on
   any `FAIL` **or** `UNRESOLVED`; dev mode exits non-zero on `FAIL` only and lists `UNRESOLVED` as work
   remaining. There is no `--assume-covered`, `--skip-group` or `--force`, and a test asserts the option
   surface contains none.
8. **`tests/coverage/**`** — offline fixtures (sub-PRD **D18**): a **synthetic 52-group registry tree**
   generated by a committed script (the same shape `INGF-07`'s tests use), with negative fixtures for
   every check — a missing group, a `PLANNED_NOT_ACTIVE` group in release mode, a limited state without a
   reason or warning, a group missing one of the nine attributes, two of the five dates copied from each
   other, a "daily" freshness claim without a delta mechanism, an unassessed licence, a coverage gap in
   one financial year, an open quarantine item, an unresolvable `evaluation_subset_ref`, a placeholder
   anomaly threshold, and absent measured statistics.
9. **`pipelines/evaluation/README.md` update** — append the twelve checks, the report contract, the
   dev/release mode difference, the statement that this module never writes a `registry.yaml`, and the
   note that launch scope is the Founder's decision.

## Acceptance checklist (classified)

- [ ] `[machine]` **All 52 mandatory groups are reconciled**: the roster count is 52, the ids match PRD
      §40.2–§40.6, and a missing group makes reconciliation `FAIL`. (PRD §7, §40.1; §44.4)
- [ ] `[machine]` **Release mode refuses non-active groups**: `NOT_STARTED`, `PLANNED_NOT_ACTIVE` and
      `IN_DEVELOPMENT` all fail in release mode. (PRD §7 *"No mandatory source group may remain
      `PLANNED_NOT_ACTIVE` at release"*)
- [ ] `[machine]` **A limited state is explicit and evidenced**: a non-`ACTIVE` group must use one of
      `METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`, and
      must carry the measured evidence of the official-source limitation, the affected dates or
      collections, the reason and the customer-visible warning it triggers; a proposed limited state
      without that evidence is `UNRESOLVED`, never accepted. (PRD §7; §44.4; plan §8 **Q10**)
- [ ] `[machine]` **Nothing is silently covered**: absent data is `UNRESOLVED` and, in release mode,
      blocking; no check has a permissive default. (PRD §44.4 *"It is not permitted to silently call an
      unimplemented source category covered"*)
- [ ] `[machine]` **The nine PRD §6.1 attributes are present per group**, asserted individually. (PRD
      §6.1)
- [ ] `[machine]` **The five PRD §12.1 dates are separate fields**, and a fixture that copies one into
      another fails. (PRD §12.1)
- [ ] `[machine]` **Freshness is honest**: a group without a reliable delta mechanism must be
      `FRESHNESS_LIMITED`; a stale date beyond the declared cadence downgrades the status. (PRD §12.1)
- [ ] `[machine]` **Licence state present per group**, with unclear assessments treated as
      metadata/link-only. (PRD §11.1, §6.1)
- [ ] `[machine]` **Three financial years covered or the gap declared** per group. (PRD §6.6; §26)
- [ ] `[machine]` **Open quarantine blocks**: a group with an open quarantine item cannot report as
      release-ready. (PRD §12.2; §40.9)
- [ ] `[machine]` **`evaluation_subset_ref` resolution**: ids resolve against `evals/cases/**` when it
      exists; when it does not, the finding is `UNRESOLVED` and the ticket still completes — the blocking
      form is `GOLD-17`'s. (PRD §40.8 item 11; sub-PRD D15)
- [ ] `[machine]` **Measured statistics replace the planning baseline**: document count, storage,
      chunk and hot-vector counts are reported beside PRD §17.2's ~300k/~150 GB hypothesis with the
      delta. (PRD §17.2; plan §8 **Q5**)
- [ ] `[machine]` **Anomaly thresholds consolidated**: every group's thresholds are listed, placeholders
      are flagged, and blocking rules are separated from flagging rules. (PRD §40.9; plan §8 **Q9**)
- [ ] `[machine]` **No override**: the CLI exposes no `--assume-covered`, `--skip-group` or `--force`; the
      report has no field that can mark a group covered without evidence. (PRD §44.4)
- [ ] `[machine]` **The report is content-hashed and machine-readable**, validating against its own schema
      — and this module imports no `schemas/evaluation/**`. (Sub-PRD D15)
- [ ] `[machine]` `uv sync --frozen` then `uv run pytest` green offline over the synthetic 52-group
      fixture tree (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm test` green — unaffected; no TypeScript. `cargo test --workspace` unaffected; no
      Rust. (PRD §45.3)
- [ ] `[machine]` **Writeback item**: the measured corpus statistics (plan §8 **Q5**) and the consolidated
      anomaly thresholds (plan §8 **Q9**) are written back to `docs/prd/21-evaluation-600/README.md`
      **and** `docs/prd/breakdown-plan.md` §8, with the report hash as evidence. (Plan §1.1; PRD §17.2;
      CLAUDE.md issue #53)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs (contributes **ADM-001**, **EVAL-002**),
      user-visible change and non-goals, schema compatibility impact (the reconciliation-report contract
      consumed by `GOLD-17`, `LNCH-05` and potentially `INTL-02`), tenant/PII/security impact (registry
      metadata only — no customer or research content), **source/licence impact** (this is the module's
      licence-visibility artifact), cost/memory/latency impact (reconciliation is I/O-bound over the
      registry), rollback path, known gaps (Gate 2 verification of any proposed limited state is the
      Founder's; plan §8 **Q10**).
- [ ] `[human]` **Gate 2 verification and sign-off**: the Founder reviews the gap list and verifies,
      under the confirmed policy (plan §8 **Q10**; sub-PRD **D23**), that every proposed limited state
      rests on measured evidence of a genuine official-source limitation and carries its affected dates
      or collections, reason and customer-visible warning — no mandatory group omitted, none reduced for
      date convenience — then chooses, per PRD §44.4, between delaying production access and launching
      the named groups in that explicitly visible limited state. This ticket produces the evidence;
      `LNCH-05` verifies the launch statement. Not required to merge. (PRD §44.4; §26)

Absent classes: no `[fixture]` criteria — there is no recorded evaluation run in this ticket's scope; its
inputs are the composed registry and the corpus release, and its tests run against a generated synthetic
registry tree (`[machine]`).

## Test plan

Every `[machine]` step runs offline: no network, no provider key, no seal key.

1. **Read the roster against the PRD.** Compare the 52 ids with PRD §40.2–§40.6 (9 + 13 + 12 + 9 + 9) and
   confirm `INGF-07`'s roster is consumed rather than re-declared.
2. **Run the suite.** `uv sync --frozen`; `uv run pytest pipelines/evaluation/tests/coverage -q`; then
   `uv run pytest` from the repository root. Construction pattern to copy: `INGF-07`'s
   `pipelines/ingestion/tests/registry/**` (generated 52-group tree + per-invariant negatives).
3. **Per-check positive/negative.** Run each of the twelve checks against its passing and failing fixture;
   confirm each fails for its own reason.
4. **Release-mode refusal.** Set one group to `PLANNED_NOT_ACTIVE` and run `--mode release`; assert
   non-zero exit and the group named. Repeat with a group removed entirely.
5. **Silent-coverage hunt.** Remove the licence assessment, then the freshness dates, then the measured
   statistics; each must produce `UNRESOLVED` and block in release mode — never a pass.
6. **Date separation.** Copy `last_discovery_at` into `last_ingestion_at`; assert `FIVE_DATES_SEPARATE`
   fails.
7. **Evaluation-subset degradation.** Run with `--cases` pointing at an empty tree; assert `UNRESOLVED`
   findings and a completed run (dev mode), then with a populated tree; assert resolution.
8. **Measured statistics.** Confirm the report shows the measured values beside PRD §17.2's baseline with
   the delta computed.
9. **Override hunt.** Grep `src/coverage/**` for `assume`, `skip`, `force`, `covered = True` defaults —
   none; run the CLI with `--force`; assert an unrecognised option.
10. **Independence.** Grep the import graph of `src/coverage/**` for `schemas/evaluation`,
    `evaluation.dataset` and `evaluation.gates` — none (sub-PRD **D15**).
11. **Append-only manifest.** `git diff pipelines/evaluation/pyproject.toml` shows additions only.
12. **Reviewer focus.** Confirm no check can conclude "covered" from absent data; confirm the limited
    states are exactly PRD §7's; confirm the gap list names every non-`ACTIVE` group with its warning
    requirement; confirm the launch decision is presented as options, not a recommendation.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR → merge →
   `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/21-evaluation-600/README.md` (version +0.1 with a changelog line) **before** changing code.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A mandatory group genuinely cannot be made active* → **do not** relabel it, exclude it from the
     roster, reduce its scope, or mark it covered. Record it in the gap list with the exact PRD §7
     limited state, the measured evidence of the official-source limitation, the affected dates or
     collections, the reason and its required warning; write it back to
     `docs/prd/21-evaluation-600/README.md` (**Q7**; plan §8 **Q10**, confirmed policy); and route the
     Gate 2 verification to the Founder and the launch statement to `LNCH-05`. PRD §44.4 is explicit
     that silently calling a category covered is not permitted.
   - *`INGF-07`'s roster disagrees with PRD §40.2–§40.6* → raise a docs PR against `INGF-07`; do not
     adopt the divergence here. A roster that drifts is how a missing source group becomes invisible.
   - *A group's `evaluation_subset_ref` names a case that does not exist* → report it to the owning
     `GOLD-05` … `GOLD-14` ticket and, if the id is mis-categorised, raise a docs PR against the owning
     adapter ticket. It stays `UNRESOLVED` here and becomes blocking at `GOLD-17`.
   - *Measured statistics differ wildly from PRD §17.2's baseline* → that is the expected outcome of
     plan §8 **Q5** and must be written back to `docs/prd/breakdown-plan.md` §8 and the sub-PRD; it may
     also move `RLSE-11`'s 2 GB benchmark assumptions and `RETR-05`'s tiering — notify both.
   - *Per-source anomaly thresholds still sit on the ±10% / >2% placeholders* → flag them (plan §8
     **Q9**); the fix belongs to the owning adapter ticket, not here.
   - *This ticket needs the case tree contract to resolve subsets properly* → resist adding a `GOLD-01`
     dependency: sub-PRD **D15** and plan §5.22/§6.2 give this ticket no such edge, and inventing one
     fails `dag-scan.mjs`. If a real edge is required, it is a **plan** change (docs PR against
     `docs/prd/breakdown-plan.md` §5.22 and §6.2) before any import.
3. **Falsified protocol.** **If the roster cannot pass, that is a launch decision, not a reporting
   problem.** Do not soften a status, widen a permitted state, drop a group from the roster, or default a
   missing attribute. Stop, escalate for re-review, and write back to
   `docs/prd/21-evaluation-600/README.md` **and** `docs/prd/breakdown-plan.md` before any code. PRD §44.4
   allows exactly two outcomes — delay, or an explicitly visible limited state — and both belong to the
   Founder.
