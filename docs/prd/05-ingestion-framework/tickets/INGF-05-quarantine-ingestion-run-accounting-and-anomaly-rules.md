---
id: INGF-05
title: Quarantine, ingestion-run accounting and anomaly rules
module: 05-ingestion-framework
lane: 05-ingestion-framework
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INGF-03]
blocks: [INGF-08, INGF-09, INTL-03]
---

# INGF-05 — Quarantine, ingestion-run accounting and anomaly rules

Implements PRD §12.2 (safe source publication), PRD §35.3 (`ingestion_run`, `quarantine_item`) and
PRD §40.9 (corpus build and promotion stages) — no ADR — the decision is already made in PRD §12.2
and §40.9; this is build ticket 5 of 9 against it.
Parent sub-PRD: [05-ingestion-framework README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [INGF-03 — Immutable artifact store](INGF-03-immutable-artifact-store-with-hashing-and-r2-keys.md)
**Why `builder`:** a bounded implementation of three ports declared in `INGF-01` plus the stage order
PRD §40.9 states as a diagram — not a new subsystem decision.

## Background + basis

**PRD §12.2 names the quarantine classes and the promotion consequence:**

> "Failed parsing, licensing ambiguity, count anomalies, OCR defects, identity conflicts and broken
> structure MUST enter quarantine. Candidate corpus releases MUST pass completeness, time, identity,
> citation, licensing, smoke search, evaluation-subset and manifest checks. Failed releases MUST NOT
> modify active production data."

**PRD §35.3 fixes both records.** `ingestion_run`: `id`, `source_id`, `mode`, `started_at`,
`finished_at`, `status`, *discovered/fetched/changed/parsed/quarantined counts*, `tool_versions_json`,
`failure_code`; constraint *"resource/cost limits recorded"*. `quarantine_item`: `id`,
`ingestion_run_id`, `artifact_id`, `reason_code`, `details_json`, `status`, `resolution`,
`resolved_at`; constraint ***"cannot enter promoted release while open"***.

**PRD §40.9 fixes the stage order** (sub-PRD **D7** gives this ticket the runner):

```text
Discover → Fetch + hash immutable artifact → Licence gate → Parse/OCR in isolation
        → Normalise identity, versions, nodes → Extract events/relations
        → Validation --fail--> Quarantine
                     --pass--> Build corpus.sqlite + indexes → …
```

and the anomaly rules verbatim:

> "Initial anomaly rules **flag, rather than automatically fail**, a ±10% collection count change,
> >2% parse failure, any duplicate stable identity, any overlapping effect interval for a supposedly
> consolidated series, any missing mandatory source group, or any broken gold citation. **Critical
> identity/time/citation and mandatory-source failures block release**; percentage thresholds are
> refined per source after baseline measurement."

Those two sentences are not contradictory: everything in the list is *detected and reported* rather
than aborting the run, but the identity/time/citation/mandatory-source subset **blocks release**
while the percentage thresholds only **flag**. This ticket encodes exactly that split.

**PRD §40.8 item 10** makes "quarantine cases and operator recovery action" part of every adapter's
DoD, and **ADM-001** requires quarantine to be visible internally. `INTL-03` (Quarantine console,
`22-internal-admin`) is `blocked_by` this ticket with the goal *"Every quarantine reason has a
defined operator action"* — so the reason → action mapping is data here, not prose in a console.

**Where the state lives (sub-PRD D6, ADR candidate M1).** PRD §18.3: "`corpus.sqlite` is
release-specific, immutable and production read-only … Ingestion MUST NOT modify active production
corpus data." PRD §39.1: "Python pipeline code never imports tenant/customer packages", so `app.sqlite`
is equally unavailable. Run and quarantine state therefore live in a **separate mutable
`ingestion.sqlite`** owned by this module. PRD §39.3 requires that "The app database, ephemeral
database and corpus cannot share a wildcard backup rule" — the ingestion store is rebuildable public
state and must not be added to the Litestream glob.

**Baseline-selected thresholds (plan §8 Q9).** The ±10% count-change and >2% parse-failure figures
are **initial defaults**, not numbers awaiting a Founder guess. PRD §40.9 says "percentage thresholds
are refined per source after baseline measurement", and plan §8 **Q9** records the consequence: each
adapter may tighten or replace the percentage thresholds once it has a representative baseline, while
critical identity, time, mandatory-source and citation failures remain **unconditional blockers**
unaffected by any percentage threshold. This ticket owns the two initial defaults and the tighten-only
per-source override mechanism; each adapter ticket sets its own values under its DoD item 8, and
`GOLD-16` consolidates and verifies the final per-source thresholds.

## Goal

Implement run accounting, quarantine and anomaly detection under
`pipelines/ingestion/src/<root>/{runs,quarantine}/**`: the `ingestion.sqlite` working store, the
`RunRecorder`/`RunHistoryPort`/`QuarantineSink`/`RecordSink` port implementations, an
`IngestionRunner` that executes exactly the PRD §40.9 stage order and records the PRD §35.3 counts,
a quarantine reason table where every code carries a mandatory operator action, and the §40.9 anomaly
rules with the correct FLAG/BLOCK split and a per-source override that can only tighten — proven by
offline replay tests over recorded stage transcripts.

## Non-goals

- **No corpus release build, validation gates or promotion.** `CRPS-06` builds and validates
  candidates; `CRPS-07` publishes; `RLSE-07` promotes. This ticket exports
  `has_open_quarantine(group_ids)` so those tickets can enforce PRD §35.3's "cannot enter promoted
  release while open"; it does not enforce it itself.
- **No quarantine console, operator actions UI or resolution workflow UI** — `INTL-03`
  (`22-internal-admin`), which is `blocked_by` this ticket.
- **No `detected_change` rows, watch matching or tenant alerts** — `DATA-07` owns the table,
  `WTCH-02` the fan-out. PRD §33.4 places change matching **after** promotion (step 6), not in
  ingestion.
- **No scheduling or cadence logic** — `INGF-08`, which is `blocked_by` this ticket.
- **No parsing, fetching or licence evaluation** — `INGF-06`, `INGF-02`, `INGF-04`. The runner calls
  their ports.
- **No app or tenant database access of any kind** — PRD §39.1.
- **No Litestream/backup configuration** — `18-ops-release` (`RLSE-05`). This ticket only states, and
  tests, that `ingestion.sqlite` is not app data.
- **No gold-citation evaluation.** The `broken gold citation` anomaly is *declared* here as a BLOCK
  class; the check itself runs in `21-evaluation-600` (`GOLD-03`) against `evals/**`.

## File-scope (write-owns)

- `pipelines/ingestion/src/<root>/runs/**` and `pipelines/ingestion/src/<root>/quarantine/**`
  (plan §5.6 `src/{quarantine,runs}/**`).
- `pipelines/ingestion/tests/runs/**` and `pipelines/ingestion/tests/quarantine/**`.
- `pipelines/ingestion/pyproject.toml` — **append-only**; conflicts resolve by re-running `uv lock`
  (plan §1.1).
- Does not touch: `pipelines/ingestion/src/<root>/{adapter,fetch,artifacts,licensing,parsing,registry,discovery,conformance}/**`
  — `INGF-01`…`INGF-04`, `INGF-06`…`INGF-09`.
- Does not touch: `pipelines/corpus-builder/**` — `04-corpus-contract` (`CRPS-06` owns release
  validation gates).
- Does not touch: `packages/database/**` — `01-app-data`. `ingestion.sqlite` is not an app database
  and must not be defined there (PRD §45.2 gives `packages/database` "app schema/migrations/tenant
  repositories" and forbids it corpus schema).
- Does not touch: `apps/api/src/routes/internal/**`, `apps/admin/**` — `22-internal-admin`
  (`INTL-03`).
- Does not touch: `infra/backup/**` — `18-ops-release` (`RLSE-05`).
- Does not touch: `pipelines/adapters/**` — modules `06`–`10`.

**Serial safety.** First decomposition; nothing merged, nothing in flight. `INGF-01`…`INGF-03` have
landed. Concurrent siblings: **`INGF-04`** (`blocked_by INGF-03`, owns `licensing/`) and possibly
**`INGF-06`** (`blocked_by INGF-02`, owns `parsing/`) — both disjoint from `runs/` and `quarantine/`.
The one shared path is `pyproject.toml`, append-only by plan §1.1.

## Deliverables

1. **`<root>.runs.store` — the `ingestion.sqlite` working store (sub-PRD D6).** A small migration-less
   schema created on first open (`CREATE TABLE IF NOT EXISTS`), with a `schema_version` table and an
   explicit upgrade function. Tables mirror PRD §35.3 exactly:
   - `ingestion_run(id, source_id, group_id, mode, started_at, finished_at, status,
     discovered_count, fetched_count, changed_count, parsed_count, quarantined_count,
     tool_versions_json, failure_code, peak_rss_bytes, wall_time_ms, bytes_fetched)` — the last three
     are PRD §35.3's "resource/cost limits recorded";
   - `quarantine_item(id, ingestion_run_id, artifact_id, reason_code, details_json, status,
     resolution, resolved_at)`;
   - `artifact_index(...)` implementing `INGF-03`'s `ArtifactIndex` protocol;
   - `discovery_state(group_id, descriptor_key, last_seen_at, etag, last_modified, content_sha256,
     status)` — the incremental comparison state `INGF-08` reads.

   The database path comes from configuration; the default is a workstation-local directory. It is
   **never** `app.sqlite`, `ephemeral.sqlite` or a corpus bundle path, and a test asserts the module
   contains no reference to those names (PRD §18.3, §39.1, §39.3). A module docstring records
   sub-PRD open question **M1** (production path is `RLSE-02`'s).

2. **`<root>.runs.recorder` — `RunRecorder` + `RunHistoryPort`.**
   `start(*, group_id, mode) -> RunHandle` opens a run row with `status="RUNNING"`;
   `RunHandle.count(stage, n=1)` increments exactly the PRD §35.3 counters;
   `RunHandle.finish(status, failure_code=None)` closes it with
   `status ∈ {SUCCEEDED, PARTIAL, FAILED, CANCELLED}` and records `wall_time_ms`, `peak_rss_bytes`
   and `bytes_fetched`. `RunHandle` is a context manager: an uncaught exception closes the run
   `FAILED` with the exception's failure code, never leaves it `RUNNING`.
   `RunHistoryPort.latest(group_id) -> RunSummary | None` returns the summary `INGF-07` and `INGF-08`
   consume, carrying the five PRD §12.1 dates as **separate** fields:
   `last_discovery_check_at`, `last_successful_change_scan_at`, `last_full_reconciliation_at`,
   `last_content_ingestion_at`, plus the raw counts. This ticket **records** them; `INGF-07` derives
   `freshness_status` from them.

3. **`<root>.quarantine.reasons` — the reason table (the `INTL-03` contract).**
   `QUARANTINE_REASONS: Mapping[FailureCode, QuarantineReason]` where
   `QuarantineReason(code, klass, severity, operator_action, recovery_command | None)` and
   `klass` is one of the **six PRD §12.2 classes**: `PARSE_FAILURE`, `LICENSING_AMBIGUITY`,
   `COUNT_ANOMALY`, `OCR_DEFECT`, `IDENTITY_CONFLICT`, `BROKEN_STRUCTURE`.
   Every failure code registered by any area (`INGF-01`'s `failure_code_registry()`) must map to a
   class and carry a non-empty `operator_action`; an unmapped code maps to
   `UNCLASSIFIED_FAILURE` with the action "triage in the quarantine console and add a mapping" — a
   test asserts the registry is total, so a new code added by any later ticket (including an adapter
   ticket) fails CI until it has an action (PRD §40.8 item 10, ADM-001).

4. **`<root>.quarantine.sink` — `QuarantineSink`.**
   `quarantine(*, run_id, artifact_id, code, details) -> str` writes one `quarantine_item` with
   `status="OPEN"`, increments the run's `quarantined_count`, and returns the item id. `details_json`
   is a bounded structure (stage, descriptor key, official URL, message, up to 2 KiB of context) and
   **never** contains raw document bytes. `resolve(item_id, resolution, actor)` sets
   `status="RESOLVED"` and `resolved_at`; there is no delete path.
   `has_open_quarantine(group_ids: Sequence[str]) -> bool` and
   `open_items(group_ids) -> Sequence[QuarantineItem]` are the exported predicates `CRPS-06`/`RLSE-07`
   use for PRD §35.3's "cannot enter promoted release while open".

5. **`<root>.runs.runner` — `IngestionRunner`, the PRD §40.9 stage order (sub-PRD D7).**
   `PIPELINE_STAGES: tuple[str, ...] = ("DISCOVER", "FETCH", "LICENCE_GATE", "PARSE", "NORMALISE",
   "EXTRACT", "VALIDATE", "EMIT")` — a module constant, asserted by test against the executed order.
   `run(adapter, ctx, *, mode) -> RunResult` executes them for one group:
   - `DISCOVER` → `adapter.discover()`; each descriptor compared against `discovery_state` to derive
     `NEW | CHANGED | UNCHANGED | REMOVED`;
   - `FETCH` → `adapter.fetch()` (which must use `ctx.fetcher`); `UNCHANGED`/304 skips the rest;
   - `LICENCE_GATE` → `permitted_storage(group_id)` from `INGF-04`, passed to `ArtifactStore.put`;
     a `PROHIBITED` group quarantines with `LICENCE_PROHIBITED` and continues to the next descriptor;
   - `PARSE` → `ctx.parser.run(...)` (`INGF-06`); a failure quarantines `PARSE_FAILED`/`OCR_DEFECT`;
   - `NORMALISE`, `EXTRACT` → `adapter.normalise/extract_events/extract_relations`;
   - `VALIDATE` → `adapter.validate(candidate, prior)` merged with the framework anomaly rules
     (deliverable 6); a `BLOCK` finding quarantines, a `FLAG` finding is recorded on the run;
   - `EMIT` → one `IntermediateRecordEnvelope` per record through `RecordSink`.
   A stage failure never aborts the whole run by default: the descriptor is quarantined and the run
   continues, finishing `PARTIAL`. `--fail-fast` exists for local development only.
   The runner touches **no corpus table** — PRD §40.7.

6. **`<root>.runs.anomalies` — the §40.9 rules, with the exact FLAG/BLOCK split.**

   | Rule | Initial default | Class | PRD basis |
   |---|---|---|---|
   | Collection count change beyond ±10% vs baseline | `COUNT_DELTA_PCT = 10.0` | **FLAG** | §40.9 "percentage thresholds are refined per source" |
   | Parse failure rate above 2% | `PARSE_FAILURE_PCT = 2.0` | **FLAG** | §40.9 |
   | Duplicate stable identity | — | **BLOCK** | §40.9 "Critical identity … failures block release" |
   | Overlapping effect interval in a consolidated series | — | **BLOCK** | §40.9 "critical … time … failures block release"; §35.2 `document_version` "non-overlap validation" |
   | Missing mandatory source group | — | **BLOCK** | §40.9 + §44.4 "not permitted to silently call an unimplemented source category covered" (evaluated by `INGF-07`/`GOLD-16`; declared here) |
   | Broken gold citation | — | **BLOCK** | §40.9 (evaluated by `GOLD-03`; declared here) |

   `AnomalyPolicy.for_group(group_id, overrides)` applies a per-source override that may **only
   tighten**: a percentage may be lowered, never raised above the default; a BLOCK class can never be
   downgraded to FLAG or disabled. An attempt raises `AnomalyPolicyError`. Overrides are read from the
   group's `conformance.yaml` (schema owned by `INGF-09`) when present — this ticket reads the key
   `anomaly_overrides` defensively and ignores an absent file. The module docstring records that the
   two percentages are plan §8 **Q9** initial defaults to be replaced per source from a representative
   baseline, that the four BLOCK rules are unconditional whatever the percentages say, and that
   `GOLD-16` consolidates and verifies the final per-source thresholds.

7. **Failure codes** registered with `register_failure_codes("runs", …)` /
   `register_failure_codes("quarantine", …)`, each with an operator action:
   `PARSE_FAILED`, `OCR_DEFECT`, `IDENTITY_CONFLICT`, `IDENTITY_DUPLICATE`,
   `EFFECT_INTERVAL_OVERLAP`, `BROKEN_STRUCTURE`, `COUNT_ANOMALY`, `PARSE_FAILURE_RATE`,
   `MANDATORY_GROUP_MISSING`, `GOLD_CITATION_BROKEN`, `UNCLASSIFIED_FAILURE`,
   `RUN_ABORTED`, `RUN_RESOURCE_LIMIT`.

8. **CLI.** `python -m <root>.runs run <group-dir> [--mode full|incremental|discovery-only|replay]`
   and `python -m <root>.quarantine list [--group G] [--open]` /
   `python -m <root>.quarantine resolve <item-id> --resolution TEXT`. `list` emits stable JSON — the
   read model `INTL-03` renders.

## Acceptance checklist (classified)

- [ ] `[machine]` `PIPELINE_STAGES` equals the PRD §40.9 order, and a recorded run's observed stage
      sequence equals it for a happy-path descriptor (PRD §40.9; deliverable 5).
- [ ] `[machine]` `ingestion_run` rows carry exactly the PRD §35.3 columns including all five counts
      and the three resource fields; asserted against an explicit column list in the test
      (PRD §35.3 "resource/cost limits recorded").
- [ ] `[machine]` `RunHandle` used as a context manager closes the run `FAILED` on an exception and
      never leaves `status="RUNNING"` (PRD §35.3).
- [ ] `[machine]` **Reason table totality**: every code in `failure_code_registry()` — across all
      areas, discovered dynamically — maps to one of the six PRD §12.2 classes and has a non-empty
      `operator_action`. Adding an unmapped code to the registry in a test fails the assertion
      (PRD §12.2, §40.8 item 10, ADM-001; the `INTL-03` contract).
- [ ] `[machine]` All six PRD §12.2 quarantine classes are represented by at least one code:
      failed parsing, licensing ambiguity, count anomalies, OCR defects, identity conflicts, broken
      structure (PRD §12.2).
- [ ] `[machine]` `quarantine()` writes `status="OPEN"`, increments `quarantined_count`, and
      `details_json` never exceeds 2 KiB and never contains raw document bytes (PRD §22 bounded logs;
      §35.3).
- [ ] `[machine]` `has_open_quarantine()` returns `True` while an item is `OPEN` and `False` after
      `resolve()`; there is no delete path in the public surface (PRD §35.3 "cannot enter promoted
      release while open").
- [ ] `[machine]` **Anomaly split**: the two percentage rules produce `FLAG` findings and do not stop
      the run; the four critical rules produce `BLOCK` findings; a `BLOCK` finding results in a
      quarantine item (PRD §40.9, both sentences).
- [ ] `[machine]` **Override direction**: lowering `COUNT_DELTA_PCT` is accepted; raising it above the
      default raises `AnomalyPolicyError`; downgrading any BLOCK rule to FLAG or disabling it raises
      `AnomalyPolicyError` (PRD §40.9 "Critical … failures block release"; plan §8 Q9).
- [ ] `[fixture]` A recorded multi-descriptor run transcript (new / changed / unchanged-304 /
      removed / parse-failure / licence-prohibited) replays offline and produces the exact expected
      counts, quarantine items and run status `PARTIAL`; the transcript lives under
      `pipelines/ingestion/tests/runs/fixtures/` (PRD §40.8 item 7 groundwork for `INGF-09`).
- [ ] `[machine]` The store never references `app.sqlite`, `ephemeral.sqlite` or an active corpus
      path; no module in this area imports a tenant/customer package or a corpus database module
      (PRD §18.3, §39.1, §39.3; sub-PRD D6).
- [ ] `[machine]` `python -m <root>.quarantine list --open` emits stable JSON containing, for every
      item, its reason code **and** its operator action (the `INTL-03` contract: "Every quarantine
      reason has a defined operator action").
- [ ] `[machine]` `uv run pytest` green.
- [ ] `[machine]` `pnpm test` green (unchanged — no TypeScript in this ticket).
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (**ADM-001**; supports
      **ADM-002** by exporting the open-quarantine predicate the promotion gate consumes); UAT IDs —
      `UAT-OPS-01` ("Corrupt candidate corpus fixture → promotion blocked") is **owned by
      `RLSE-07`/`CRPS-06`**, and this ticket supplies its quarantine precondition; schema/API/event
      compatibility (introduces `ingestion.sqlite`; failure codes are append-only after merge);
      tenant/PII/security impact (none — no customer data; the store is not app data); source/licence
      impact (quarantines a `PROHIBITED` group rather than ingesting it); cost/memory/latency impact
      (state the recorded `peak_rss_bytes` from the replay fixture); rollback path; known gaps (the
      per-source percentage thresholds are baseline-selected under plan §8 **Q9** and consolidated by
      `GOLD-16`; sub-PRD **M1**).
- [ ] `[human]` The FLAG/BLOCK split and the two initial percentage defaults are reviewed by the
      Founder in the PRD §43.4 review queue (item 4: "source adapter count/time/licence/quarantine
      anomalies"). This is a review that the split matches PRD §40.9 and that the defaults are safe to
      start from — not a request to pick the final numbers: plan §8 **Q9** replaces them per source
      from a representative baseline and `GOLD-16` verifies the result. Irreducibly human judgment on
      release risk.

## Test plan

Harness: `uv run pytest pipelines/ingestion/tests/runs pipelines/ingestion/tests/quarantine -q`,
fully offline. Ports from `INGF-02`/`INGF-04`/`INGF-06` are supplied as recorded-transcript doubles;
copy the double pattern from `INGF-03`'s `tests/artifacts/conftest.py`.

1. `uv sync --frozen && uv run pytest pipelines/ingestion/tests/{runs,quarantine} -q`.
2. **`test_store.py`** — schema creation, column lists asserted against the literal PRD §35.3 lists,
   the forbidden-path scan, idempotent re-open.
3. **`test_recorder.py`** — counter increments per stage; context-manager failure path; `RunSummary`
   carries the five PRD §12.1 dates as separate fields with distinct values after a 304-only run and
   after a content run (the separation `INGF-07` depends on).
4. **`test_reasons.py`** — registry totality (dynamically over `failure_code_registry()`), the
   six-class coverage assertion, and a negative control that registers an unmapped code and expects
   failure.
5. **`test_sink.py`** — open/resolve lifecycle, `has_open_quarantine`, details bound, no delete
   symbol.
6. **`test_runner.py`** `[fixture]` — replays `tests/runs/fixtures/transcript-mixed.json`; asserts
   stage order, per-descriptor outcomes, counts, quarantine items, and final `PARTIAL` status.
7. **`test_anomalies.py`** — the six-rule table; override direction cases; a `BLOCK` finding produces
   a quarantine item while a `FLAG` finding does not.
8. **`test_cli.py`** — `quarantine list --open` JSON shape including `operator_action`.
9. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus (concurrency- and safety-sensitive): that a run interrupted mid-stage cannot leave
`status="RUNNING"` or a half-counted run row; that two concurrent runs for different groups do not
corrupt `ingestion.sqlite` (WAL mode + per-run transaction boundaries); that no BLOCK rule can be
disabled through configuration; and that `has_open_quarantine` cannot return `False` while an
`OPEN` row exists for the queried group.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (docs PR/MR,
sub-PRD changelog line, then `publish-tickets.mjs --sync`), then change code.

**Foreseeable frictions and their exact writeback targets:**

1. **`ingestion.sqlite` proves to be the wrong store** — e.g. concurrent adapter runs contend, or the
   production discovery-only mode needs different storage → this is decomposition-critical
   (sub-PRD **D6**). Write `docs/adr/NNNN-ingestion-working-store.md` (new file, owned by this ticket
   per plan §2.1 **A9**), update `docs/prd/05-ingestion-framework/README.md` D6/M1, and only then
   change the implementation. Never move the state into `corpus.sqlite` (PRD §18.3 forbids it) or
   `app.sqlite` (PRD §39.1, §45.2 forbid it).
2. **The production host has nowhere to put `ingestion.sqlite`** (PRD §39.3 has no row) → that is
   sub-PRD open question **M1**, owner `RLSE-02` (`infra/deploy/host/**`). Record the requirement in
   `docs/prd/05-ingestion-framework/README.md` M1; do not add a row to PRD §39.3 and do not write
   into `infra/**`.
3. **A real source needs a different anomaly threshold from the §40.9 initial default** → replacing a
   percentage from a representative baseline is the expected path (plan §8 **Q9**) and is an
   adapter-side `anomaly_overrides` change — but deliverable 6 accepts it **only in the tightening
   direction**, and never for a BLOCK rule. A source whose measured baseline genuinely needs a *looser*
   percentage than the framework default is not expressible through `anomaly_overrides` by design: the
   writeback is a docs PR against this ticket's deliverable 6 **and** `INGF-09` DoD item 8 (whose
   negative control asserts the same tighten-only rule), recorded in
   `docs/prd/05-ingestion-framework/README.md` under **Benchmark-selected and deferred parameters**
   before `anomalies.py` changes — never a local relaxation. If a group genuinely cannot pass a BLOCK
   rule, the correct outcome is a customer-visible limited registry state carrying the measured
   evidence, the affected dates or collections, the customer-visible warning and the reason
   (`INGF-07`; plan §8 **Q10**, confirmed policy) plus a `GOLD-16` reconciliation entry — never a
   threshold downgrade, and never a silently reduced group.
4. **The §40.9 stage order cannot be executed as written** (e.g. licence terms are only discoverable
   after parsing) → update this ticket's deliverable 5 and
   `docs/prd/05-ingestion-framework/README.md` D7 first. The order is a PRD diagram, so a genuine
   reordering is a **product/spec** change under PRD §45.5 and must be escalated, not implemented.
5. **`CRPS-06` wants a different open-quarantine predicate shape** → extend the exported function
   here and record it in `docs/prd/05-ingestion-framework/README.md`; `04-corpus-contract` must not
   re-query `ingestion.sqlite` directly, and this module must not import the corpus builder.

**Escalation rule.** If PRD §35.3's "cannot enter promoted release while open" or PRD §40.9's
"Critical identity/time/citation and mandatory-source failures block release" cannot be enforced as
data rather than as console prose, that overturns a release-safety decision with direct legal-accuracy
consequences. Stop and escalate for re-review; never make a BLOCK rule advisory inside this ticket.
