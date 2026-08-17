---
id: CRPS-06
title: Candidate release build and validation gates
module: 04-corpus-contract
lane: 04-corpus-contract
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [CRPS-02, CRPS-05]
blocks: [CRPS-07, WTCH-02, RLSE-11]
---

# CRPS-06 — Candidate release build and validation gates

Implements PRD §12.2, §18.4, §40.9 — requirement ID `ADM-002`, epic `E07-CORPUS-SCHEMA` (with the
`E17-INDEX` build half).
No ADR — the decision is already made in PRD §12.2 (the eight candidate checks) and §40.9 (the build
and promotion stage graph); this is build ticket 6 of 8 against it. One sub-question genuinely
undecided by the PRD — how the bundle's lexical index is produced offline without importing
`services/search-rs` — is sub-PRD open question **Q-CRPS-2** and is recorded by this ticket as an ADR,
not invented in code: [ADR 0003 — Offline lexical index builder](../../../adr/0003-offline-lexical-index-builder.md),
which selects option (a), a pinned externally-built search binary invoked over a documented CLI
contract, with `NullLexicalIndexBuilder` for fixtures and development builds.
Parent sub-PRD: [04-corpus-contract README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [CRPS-02 — CorpusRelease manifest schema, signing and verification](CRPS-02-corpusrelease-manifest-schema-signing-and-verification.md), [CRPS-05 — Embedding build pipeline and embedding manifest](CRPS-05-embedding-build-pipeline-and-embedding-manifest.md) (mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(PRD §12.2 enumerates the gates and PRD §40.9 fixes the stage order) — not a new subsystem decision.

## Background + basis

**The build and promotion stages are specified as a graph.** PRD §40.9:

```text
Discover → Fetch + hash immutable artifact → Licence gate → Parse/OCR in isolation
→ Normalise identity, versions, nodes → Extract events/relations → Validation
   ├─ fail → Quarantine
   └─ pass → Build corpus.sqlite + indexes → Completeness/time/citation/licence/search/eval tests
      → Sign manifest + upload staging → Production verify/download → Shadow/serial smoke
      → Atomic active pointer
```

This ticket owns the **Build → tests** span (and hands `Sign + upload staging` to `CRPS-02`'s signer
and `CRPS-07`'s publisher). Everything left of `Normalise` is `05-ingestion-framework` and the source
modules; everything from `Production verify` rightwards is `18-ops-release` (`RLSE-07`).

**The gates are enumerated.** PRD §12.2: *"Failed parsing, licensing ambiguity, count anomalies, OCR
defects, identity conflicts and broken structure MUST enter quarantine. Candidate corpus releases MUST
pass completeness, time, identity, citation, licensing, smoke search, evaluation-subset and manifest
checks. Failed releases MUST NOT modify active production data."*

**Anomaly severity is specified.** PRD §40.9: *"Initial anomaly rules flag, rather than automatically
fail, a ±10% collection count change, >2% parse failure, any duplicate stable identity, any
overlapping effect interval for a supposedly consolidated series, any missing mandatory source group,
or any broken gold citation. Critical identity/time/citation and mandatory-source failures block
release; percentage thresholds are refined per source after baseline measurement."* Those two
percentage figures are **initial defaults**, not guesses awaiting a ruling: breakdown plan §8 **Q9** is
**baseline-selected**, each adapter may tighten or replace the percentages once it has a
representative baseline, `GOLD-16` consolidates and verifies the final per-source values, and the
critical classes block unconditionally regardless of any percentage.

**Quarantine blocks inclusion.** PRD §35.3, `quarantine_item`: *"cannot enter promoted release while
open"*.

**Active data is untouchable.** PRD §18.4: *"Active data MUST never be rebuilt or mutated in place."*
PRD §35.8 invariant 8: *"Active corpus promotion never mutates an existing release bundle."*
Requirement `ADM-002` (PRD §30.2) minimum acceptance evidence: *"Promotion failure leaves active
pointer unchanged."*

**Coverage claims must be honest, and the launch policy behind them is settled.** PRD §44.4: *"It is
not permitted to silently call an unimplemented source category covered."* PRD §7: *"No mandatory
source group may remain `PLANNED_NOT_ACTIVE` at release. A group blocked by official capability or
licensing MUST use an explicit status such as `METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`,
`LICENSING_RESTRICTED` or `SOURCE_UNAVAILABLE`."* Breakdown plan §8 **Q10** is a **confirmed policy**
on top of that: no mandatory group is pre-selected for omission, every group in the approved MVP scope
is attempted in full, no scope is reduced to make a release date easier, and a limited state is
permitted **only** on measured evidence of a genuine official-source limitation — recorded with the
evidence, the affected dates or collections, the customer-visible warning and the reason. `GOLD-16`
produces that evidence and the proposed registry state; `LNCH-05` verifies the launch statement; Gate
2 is verification and sign-off, not an opportunity to cut mandatory scope. This ticket's completeness
gate is the corpus-side enforcement of that policy: it accepts an explicit limited state and refuses a
silent gap.

**The manifest must pin the model, tokenizer and runtime — and this ticket is where that is
enforced.** Breakdown plan §8 **Q11** (confirmed) requires *"Models, tokenizers and runtime metadata
are pinned in the corpus/retrieval manifest"* and *"Model artefacts must carry an immutable revision
identifier, hash, dimensions, normalisation, truncation and licence information"*. `CRPS-02`
deliverables 12–13 define the members and the `release_kind` severity rule; `CRPS-05` emits them for
the executed document-embedding profile; this ticket supplies the pins as explicit build inputs and
gates that a `CANDIDATE` never carries a stub, an incomplete pin or an embedding-manifest
disagreement. The values themselves are not this ticket's: models are plan §8 **Q2**
(benchmark-selected, frozen by `GOLD-15`) and the runtime pin comes from `RETR-07`'s recorded
compatibility verification under the confirmed Q11 decision.

**Smoke queries belong to production verification.** PRD §18.4: *"Production verifies signature,
compatibility, disk, hashes, read-only database/index integrity and smoke queries."* That is why this
ticket's "smoke search" gate is the **offline corpus-level** subset (identifier and node lookups
against `corpus.sqlite`) and the full search smoke stays with `RLSE-07` — the alternative, calling
`services/search-rs` from here, would create a `04 → 11` module edge on top of the existing `11 → 04`
edge, i.e. a module cycle that makes `dag-scan.mjs` exit 1 (breakdown plan §6.1, risk R6).

**Downstream consumers.** `CRPS-07` uploads what this ticket builds. `WTCH-02` (`16-monitor-alerts`)
is `blocked_by` this ticket because PRD §33.4 steps 4–6 put the change data on the corpus side:
*"Validation either quarantines the change or includes it in a candidate CorpusRelease. Promotion
atomically changes the active release. Change matcher creates one `DetectedChange` and finds matching
watch targets …"* — and PRD §35.6's `detected_change` needs *"source/corpus IDs, change type, dates,
before/after node/document IDs, severity"*. `RLSE-11` (the 2 GB real-scale benchmark) is
`blocked_by` this ticket because it needs a real candidate bundle and its measured sizes.

**Carried caveat (accepted for the MVP, documented not enforced):** the evaluation-subset gate
consumes a **report file** produced by `21-evaluation-600`; this module never runs the evaluation
harness (module `21` depends on `04`, not the reverse). Until `GOLD-03` exists, the gate's status is
`NOT_RUN`, which is a **blocking** state for a release intended for promotion and an allowed state for
a fixture or a development build — the distinction is explicit, never implicit.

## Goal

Produce the candidate-release build in `pipelines/corpus-builder/src/build/**` and the gate suite in
`src/validation/**`: an orchestrator that assembles a complete PRD §18.4 bundle from a normalised
corpus (chunks from `CRPS-03`, tiers from `CRPS-04`, vectors from `CRPS-05`, manifest from `CRPS-02`),
runs the eight PRD §12.2 gates plus the PRD §40.9 anomaly rules, fails closed on any blocking finding,
and emits a machine-readable gate report and a parent-to-candidate release diff. Completion is
mechanically checkable: `uv run pytest pipelines/corpus-builder/tests/build
pipelines/corpus-builder/tests/validation` is green, a deliberately defective input produces no signed
manifest and no bundle at the final output path, and every gate has at least one passing and one
failing test case.

## Non-goals

- **No upload to R2** — `CRPS-07` (`src/publish/**`).
- **No production download, verification, shadow run, atomic pointer switch or rollback** — `RLSE-07`
  (`18-ops-release`, `infra/deploy/corpus/**`; PRD §44.3 serial-owned there). This ticket never
  touches any active release, any pointer or any production path.
- **No `DetectedChange` rows, watch matching, alerts or notifications** — `WTCH-02`/`WTCH-03`
  (`16-monitor-alerts`). This ticket emits the corpus-side release diff those consume.
- **No evaluation harness, metrics or gate thresholds** — `21-evaluation-600` (`GOLD-02`, `GOLD-03`).
  This ticket consumes an evaluation report file and enforces its verdict.
- **No calls into `services/search-rs`** — module-cycle prevention (breakdown plan R6). The offline
  smoke gate queries `corpus.sqlite` directly.
- **No model, tokenizer or runtime selection, and no model loading** — the models are plan §8 **Q2**
  (`GOLD-15`) and the runtime is plan §8 **Q11**, confirmed and owned by `RETR-07`. This ticket
  receives both as explicit inputs, records them through `CRPS-02`'s builder and gates their
  completeness; it chooses nothing and loads nothing.
- **No fetching, parsing, licensing decisions, quarantine authoring or run accounting** —
  `05-ingestion-framework` (`INGF-02` … `INGF-05`). This ticket reads their recorded state.
- **No chunking, tiering, embedding, schema or manifest-schema changes** — `CRPS-03`, `CRPS-04`,
  `CRPS-05`, `CRPS-01`, `CRPS-02` respectively.
- **No 2 GB host benchmark** — `RLSE-11` (`18-ops-release`), which is `blocked_by` this ticket.
- **No launch-scope decision** — breakdown plan §8 **Q10** already settles the policy; `GOLD-16`
  produces the evidence and `LNCH-05` the disclosure. This ticket enforces the corpus-side rule and
  never selects which groups may launch limited.

## File-scope (write-owns)

- `pipelines/corpus-builder/src/build/**`
- `pipelines/corpus-builder/src/validation/**`
- `pipelines/corpus-builder/tests/build/**`, `pipelines/corpus-builder/tests/validation/**`
- Module-shared, append-only (breakdown plan §1.1): `pipelines/corpus-builder/pyproject.toml`
  (dependencies only; regenerate the root `uv.lock` as a build artifact, never hand-merge).
- Per breakdown plan A9 (`docs/adr/**` is shared-additive with per-file ownership, claimed by the
  creating ticket): [`docs/adr/0003-offline-lexical-index-builder.md`](../../../adr/0003-offline-lexical-index-builder.md)
  — **required** (deliverable 3). The number was `NNNN` until execution: `0003` is the next free one,
  taken after checking `docs/adr/` as the serial-safety analysis below requires.
- This ticket file itself, for the ADR link and the `cargo test --workspace` decision below — the
  ticket's own acceptance list makes both writebacks acceptance items, so they land in the same PR.

Does not touch:

- `pipelines/corpus-builder/schema/**`, `src/contracts/**` — `CRPS-01`; `schemas/corpus-manifest/**`,
  `src/manifest/**` — `CRPS-02`. Both are the PRD §44.3 **serial-owned corpus schema and release
  manifest**: `04-corpus-contract` is their sole owner and **no other module may write them**; inside
  this module only `CRPS-01`/`CRPS-02` do. This ticket calls their APIs and writes neither.
- `src/chunking/**` — `CRPS-03`. `src/tiering/**` — `CRPS-04`. `pipelines/embeddings/**` — `CRPS-05`.
  `src/publish/**` — `CRPS-07`. `fixtures/**` — `CRPS-08`.
- `services/search-rs/**` — `11-retrieval-engine`. `pipelines/{ingestion,adapters,evaluation}/**`,
  `evals/**`, `schemas/evaluation/**` — `05`/`06`–`10`/`21`. `infra/**` — `03`/`18`.
  `apps/**`, `packages/**`, `tests/**` — other modules per breakdown plan §4. `docs/PRD.md` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header — `phase: 1`). `src/build/**` and `src/validation/**` do not exist before this ticket.
Both of this ticket's blockers (`CRPS-02`, `CRPS-05`) are merged before it starts, and its only
possible concurrent siblings under the wave model are none — `CRPS-06` is alone in wave 4, with
`CRPS-07` strictly after it. The ADR file is claimed by creation under A9 (`docs/adr/` is empty per
breakdown plan §1 header, so no `NNNN` collision exists; take the next free number at execution time
and check `docs/adr/` first).

## Deliverables

1. `src/build/plan.py` — `@dataclass(frozen=True) class BuildRequest` with `corpus_db_path`,
   `parent_release_id | None`, `output_dir`, `release_kind` (`CANDIDATE` by default, per `CRPS-02`
   deliverable 4), `evaluation_report_path | None`, `versions` (schema/parser/chunker/embedding/index/
   builder/contract), `compatibility` (app/search ranges), `anomaly_thresholds` (defaults per PRD
   §40.9, overridable per source group — breakdown plan §8 Q9), `allow_not_run_evaluation: bool`
   (default `False`), `local_model_pins` (the `CRPS-02` deliverable 12 `ModelPin` list, one entry per
   role the release pins) and `runtime_pin` (the `CRPS-02` deliverable 12 `RuntimePin`). The last two
   are **explicit inputs**, sourced from `RETR-07`'s recorded compatibility verification and the chosen
   model artefacts: this ticket must never read them from the environment, an installed package or
   `services/search-rs`'s `Cargo.toml`, and must never default them (breakdown plan §8 **Q11**).
2. `src/build/assemble.py::assemble_bundle(request) -> BundlePaths` — produces the exact PRD §18.4
   layout under `output_dir/corpus-release-{release_id}/`:
   `corpus.sqlite`, `tantivy/`, `vectors.usearch`, `embedding-manifest.json`,
   `release-manifest.json`. Ordering constraints: copy/attach the corpus database first (read-only
   source, never mutated in place); then the vector artifact and embedding manifest produced by
   `CRPS-05`; then the lexical index (deliverable 3); then the release manifest last, because it hashes
   every other file. Assembly is staged: everything is written under
   `output_dir/.staging/<release_id>/` and renamed into place only after all gates pass — so a failed
   build leaves nothing at the final path (PRD §12.2 "Failed releases MUST NOT modify active
   production data"). The bundle contains exactly these five entries: model weight files are **not**
   added here (sub-PRD **D15** — the manifest pins artefact identity, and a sixth bundle path would be
   a plan/PRD writeback).
3. `src/build/indexes.py` — the `IndexBuilder` port:
   `class LexicalIndexBuilder(Protocol): def build(self, corpus_db: Path, out_dir: Path) ->
   IndexBuildResult` (returning `{index_version, file_count, byte_size, doc_count}`).
   **Sub-PRD open question Q-CRPS-2 is resolved by this ticket**: PRD §19.1 forbids production index
   builds and PRD §19.3 places "index build" in the local pipeline, but no PRD section names the
   builder, and importing `services/search-rs` would create a module cycle (breakdown plan R6).
   Therefore this ticket:
   - defines the port and the bundle-side contract (`tantivy/` directory contents are opaque to this
     module; only its presence, `index_version` and file hashes are this module's business);
   - **records the chosen mechanism in
     [`docs/adr/0003-offline-lexical-index-builder.md`](../../../adr/0003-offline-lexical-index-builder.md)**
     (decision: option (a)) — options to
     weigh explicitly in the ADR: (a) invoke a pinned, separately-built search binary as an external
     command over a documented CLI contract; (b) a Python-side Tantivy binding pinned in
     `pyproject.toml`; (c) defer index construction to a `11-retrieval-engine` ticket invoked by the
     release process. State the compatibility consequence for `RETR-01`/`RETR-02` and the
     reproducibility consequence for CI in the ADR;
   - ships `NullLexicalIndexBuilder` for tests and fixtures, which writes a `tantivy/` directory
     containing a single `INDEX_STATE.json` (`{state: "ABSENT", reason, index_version: null}`) — used
     only when `release_kind != CANDIDATE`; a `CANDIDATE` build with the null builder is a **blocking**
     gate failure, so a fixture path can never masquerade as a promotable release.
4. `src/validation/gates.py` — the eight PRD §12.2 gates, each a callable
   `(BundleContext) -> list[Finding]` with `Finding = {gate, code, severity: BLOCKING|ANOMALY|INFO,
   message, subject, evidence}`. Gates and their content:
   1. **completeness** — every mandatory source group in PRD §40.2–40.6 is present with an explicit
      status; a group in `PLANNED_NOT_ACTIVE` is BLOCKING (PRD §7, §44.4); a group in an explicit
      limited state (`METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`,
      `SOURCE_UNAVAILABLE`) passes and is recorded in `coverage` with its recorded reason — the
      corpus-side enforcement of the confirmed breakdown plan §8 **Q10** policy, which permits a
      limited state only on measured evidence and forbids silent omission; counts in the manifest
      equal counts queried from the database; `chunk`/`embedding` counts agree with `CRPS-05`'s report.
   2. **time** — no `document_version` has `effective_to < effective_from`; no overlapping effect
      intervals within a series marked consolidated (BLOCKING per PRD §40.9 "any overlapping effect
      interval for a supposedly consolidated series"); every `legal_event.effective_date` is present
      where the event type requires it; every date matches `YYYY-MM-DD` (PRD §15.2, §35.1).
   3. **identity** — no duplicate `(source_id, stable_source_key)`; no duplicate
      `(document_id, stable_node_key)`; every `document_version` resolves to exactly one
      `legal_document`; duplicate stable identity is BLOCKING (PRD §40.9).
   4. **citation** — every `node_version.text_hash` matches its stored text; every `search_chunk`
      offset pair slices inside its node text and reproduces `text_hash` (reuse `CRPS-03`'s
      `validate_chunks`); every `node_relation.evidence_*` offset is in range; a broken gold citation
      reported by the evaluation report is BLOCKING (PRD §40.9; §15.3; `SRCH-003`).
   5. **licensing** — every `source_artifact` links a `licence_snapshot`; every included document has
      a `licence_assessment`; no chunk with tier `EXCLUDED_LICENSING` is present in the vector index
      or marked lexically eligible; `PROHIBITED`/missing assessment is BLOCKING (PRD §11.1, §35.3).
      Model-weight licences are covered by the manifest gate below, not here — this gate is about
      corpus content.
   6. **smoke search (offline subset)** — a fixed set of identifier and node lookups executes against
      `corpus.sqlite` read-only and returns the expected rows: exact provision lookup, neutral-citation
      lookup, ABN lookup, point-in-time node resolution at three dates. Full search smoke is
      `RLSE-07`'s (PRD §18.4).
   7. **evaluation-subset** — reads `evaluation_report_path`; a report with any failed gate is
      BLOCKING; a missing report is BLOCKING unless `allow_not_run_evaluation` **and**
      `release_kind != CANDIDATE`. The report's shape is declared in
      `src/validation/evaluation_report.py` as a minimal contract (`{report_id, ran_at, metrics{},
      gates[{name, threshold, observed, passed}]}`) matching PRD §14.2's thresholds; `21-evaluation-600`
      produces it.
   8. **manifest** — `CRPS-02`'s `verify_bundle()` returns `ok`, including schema validation, hash
      agreement, `versions.schema` matching `corpus_meta.schema_version`, **and** the breakdown plan §8
      **Q11** pinning checks of `CRPS-02` deliverable 10 step 9 / deliverable 13: `runtime` and
      `local_models[]` present and complete; every model pin carrying its immutable revision
      identifier, artefact hash, dimensions, normalisation, truncation, tokenizer artefact identity and
      licence; the `DOCUMENT_EMBEDDING` pin agreeing with `embedding-manifest.json`; the
      `QUERY_EMBEDDING` pin's representation members equalling it; and — for `release_kind: CANDIDATE`
      — no stub or placeholder pin (the `stub:` `model_id` convention and a stub `runtime.family` are
      BLOCKING here, exactly as the null lexical index builder is in deliverable 3).
5. `src/validation/quarantine.py::assert_no_open_quarantine(conn) -> list[Finding]` — any
   `quarantine_item.status` in an open state is BLOCKING (PRD §35.3 "cannot enter promoted release
   while open"), with the count and reason-code breakdown carried into the manifest's `quarantine`
   member.
6. `src/validation/anomalies.py` — the PRD §40.9 flag-rather-fail rules with per-source-group
   overridable thresholds: collection count change beyond ±10%, parse-failure rate above 2%
   (both `ANOMALY`), and the four unconditional `BLOCKING` classes (duplicate stable identity,
   overlapping consolidated effect interval, missing mandatory source group, broken gold citation).
   The two percentages are declared constants documented as **initial defaults** — breakdown plan §8
   **Q9** is baseline-selected, so each adapter may tighten or replace them after a representative
   baseline and `GOLD-16` consolidates the final per-source values. The four BLOCKING classes are not
   overridable by any threshold, by configuration or by a per-source setting.
7. `src/build/report.py` — `gate-report.json` written next to the bundle (never inside it, so the
   bundle hash is stable): `{release_id, release_kind, started_at, finished_at, gates: [{gate, status,
   findings: [...]}], blocking_count, anomaly_count, decision: BUILT|REJECTED}`. A `REJECTED` build
   still writes the report — an operator must be able to see why (PRD §12.2, `ADM-001` internal
   visibility).
8. `src/build/diff.py::release_diff(parent_db | None, candidate_db) -> ReleaseDiff` — the corpus-side
   change record `WTCH-02` consumes: for each affected document, `{document_id, source_id,
   change_type: ADDED|VERSION_ADDED|TEXT_CHANGED|STATUS_CHANGED|REMOVED|RELATION_CHANGED,
   before_document_version_id, after_document_version_id, changed_node_version_ids[],
   effective_from, publication_date, severity_hint}`. Written as `release-diff.json` next to
   `gate-report.json`. Basis: PRD §33.4 steps 4–6 and PRD §35.6 `detected_change`'s required content.
   This module does **not** interpret severity for tenants — `severity_hint` is corpus-side only.
9. `src/build/measure.py` — records `{corpus_sqlite_bytes, lexical_index_bytes, vector_index_bytes,
   total_bundle_bytes, build_seconds, peak_rss_bytes}` into the gate report. This is the measured
   input `RLSE-11` needs for the 2 GB real-scale benchmark and for breakdown plan §8 Q3/Q5 — both
   **deferred until measurement**, so these numbers are evidence for those decisions and never a
   restatement of the PRD's planning hypotheses. It applies PRD §40.8 item 12's discipline ("measured
   storage, parse time, index size and peak memory") to the release build.
10. `src/build/cli.py` — `uv run python -m corpus_builder build-candidate --corpus <path> --out <dir>
    [--parent <release_id>] [--evaluation-report <path>] --model-pins <path> --runtime-pin <path>
    [--sign --key <path> --key-id <id>]`.
    Exit codes: `0` built, `2` rejected by a gate, `1` internal error. The pin inputs are required for
    a `CANDIDATE` build. Signing is opt-in and delegated to `CRPS-02`'s `sign_manifest`; **an unsigned
    candidate is never renamed into the final output path when `--sign` was requested and signing
    failed**.
11. **Ordering constraint (load-bearing).** `assemble (staging) → gates → [all pass] → manifest build
    → sign → atomic rename into place`. No gate may run against the final path, and no artifact
    reaches the final path before every gate passes. Basis: PRD §12.2 and §18.4's "Active data MUST
    never be rebuilt or mutated in place".

## Acceptance checklist (classified)

- [ ] `[machine]` Each of the eight PRD §12.2 gates has at least one passing and one failing test
      case, and a failing gate yields `decision: REJECTED`. (PRD §12.2; `ADM-002`)
- [ ] `[machine]` A rejected build leaves **nothing** at the final output path and leaves the input
      corpus database byte-identical (hash compared before/after). (PRD §12.2 "Failed releases MUST
      NOT modify active production data"; §18.4; §35.8 invariant 8)
- [ ] `[machine]` An open `quarantine_item` blocks the build regardless of every other gate passing.
      (PRD §35.3)
- [ ] `[machine]` A missing mandatory source group and a group left `PLANNED_NOT_ACTIVE` are both
      BLOCKING; a group in an explicit limited state (`METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`,
      `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`) passes and is recorded in `coverage` together with
      its recorded reason. (PRD §7, §44.4; breakdown plan §8 Q10 confirmed policy)
- [ ] `[machine]` Anomaly classification matches PRD §40.9: ±10% count change and >2% parse failure
      are `ANOMALY` (build proceeds, recorded); duplicate stable identity, overlapping consolidated
      effect interval, missing mandatory group and broken gold citation are `BLOCKING`. A per-source
      threshold override changes only the percentages and can never downgrade one of the four BLOCKING
      classes — asserted. (Breakdown plan §8 Q9, baseline-selected)
- [ ] `[machine]` A missing evaluation report is BLOCKING for `release_kind: CANDIDATE`, and allowed
      only with `allow_not_run_evaluation` on a non-candidate build — asserted both ways.
      (PRD §12.2; §14.2)
- [ ] `[machine]` A `CANDIDATE` build using `NullLexicalIndexBuilder` fails with a dedicated blocking
      code — a fixture-grade index can never be published as a candidate. (Deliverable 3)
- [ ] `[machine]` **Pinning gate**: a `CANDIDATE` build fails with a dedicated blocking code when
      `runtime_pin` or `local_model_pins` is absent or incomplete, when any model pin lacks its
      revision, artefact hash, dimensions, normalisation, truncation, tokenizer artefact identity or
      licence, when the `DOCUMENT_EMBEDDING` pin disagrees with `embedding-manifest.json`, when a
      `QUERY_EMBEDDING` pin's representation members differ from it, or when any pin is a stub — one
      test per case. The same bundle built as `SYNTHETIC_FIXTURE` with stub pins succeeds and the stub
      is visible in the manifest. (Breakdown plan §8 **Q11**; `CRPS-02` deliverables 12–13)
- [ ] `[machine]` No pin is inferred: a source scan asserts `src/build/**` and `src/validation/**`
      read no runtime, crate or model version from the environment, an installed package or
      `services/search-rs`. (Deliverable 1; breakdown plan §8 Q11)
- [ ] `[machine]` The assembled bundle contains exactly the PRD §18.4 paths — five entries, no model
      weight file — and `CRPS-02`'s `verify_bundle()` returns `ok` for a successful build.
      (PRD §18.4; sub-PRD D15)
- [ ] `[machine]` `release_diff()` over a parent/candidate pair reports each change type at least
      once, with before/after ids and dates populated — the shape `WTCH-02` consumes.
      (PRD §33.4; §35.6)
- [ ] `[machine]` `gate-report.json` and `release-diff.json` are written **outside** the bundle
      directory, so adding them cannot change any manifest file hash. (Deliverable 7)
- [ ] `[machine]` `measure.py` records corpus/index/vector byte sizes and peak RSS into the gate
      report. (PRD §40.8 item 12; measured evidence for the deferred breakdown plan §8 Q3/Q5 decisions,
      consumed by `RLSE-11`)
- [ ] `[machine]` Signing failure after successful gates leaves nothing at the final path and exits
      non-zero. (Deliverable 10)
- [ ] `[fixture]` End-to-end build over the committed small corpus fixture produces a complete bundle
      whose manifest reproduces the recorded golden values (excluding timestamps and paths), and a
      second run over the same input reproduces identical artifact hashes.
      (PRD §40.8 item 4 discipline; §18.4)
- [ ] `[fixture]` **The `UAT-OPS-01` corpus-side replay**: a deliberately corrupted candidate fixture
      ("Corrupt candidate corpus fixture" → "Promotion blocked; active release/search unchanged") is
      rejected by the gates and produces no publishable artifact. (PRD §41.2 `UAT-OPS-01`; `ADM-002`)
- [ ] `[human]` At Gate 2, the founder runs `UAT-OPS-01` end-to-end (corrupt candidate → promotion
      blocked, active release and Search unchanged) with `RLSE-07`; this ticket's half is the rejected
      candidate. Not required to merge — the automated half above is. (PRD §41.2; CLAUDE.md Gate 2)
- [ ] `[machine]` `uv run pytest` green (Python; PRD §45.3).
- [ ] `[machine]` `pnpm test` green (standing item, breakdown plan §1.1).
- [ ] `[machine]` [`docs/adr/0003-offline-lexical-index-builder.md`](../../../adr/0003-offline-lexical-index-builder.md)
      exists, states the chosen option (**(a)**, a pinned externally-built search binary invoked over
      a documented CLI contract, with `NullLexicalIndexBuilder` for fixtures and development builds),
      its consequences for `RETR-01`/`RETR-02` and CI reproducibility, and is linked from this
      ticket — the writeback is itself an acceptance item. (Sub-PRD Q-CRPS-2; PRD §45.5)
- [ ] `[machine]` PR states requirement ID `ADM-002` and `UAT-OPS-01`; schema/API compatibility
      impact; source/licence/provenance impact (licensing gate, model-licence pins); cost/memory/disk
      impact (measured bundle sizes); rollback path (candidate discarded, active untouched); known gaps
      including the baseline-selected Q9 thresholds and the deferred Q3/Q5 measurements. (PRD §45.4)
- [ ] `cargo test --workspace` **not applicable — recorded decision, not an omission.** ADR 0003
      selects option (a): the pinned lexical indexer *is* a Rust-built binary, but it is
      `11-retrieval-engine`'s artifact, built and tested there, and this ticket invokes it across a
      process boundary over a documented CLI contract. This ticket adds, changes and compiles **no
      Rust** — `git diff --stat` over its branch touches no `.rs` file, no `Cargo.toml` and no
      `Cargo.lock` — so `cargo test --workspace` here would re-run another module's suite over an
      unchanged tree and report nothing about this change. The conditional in the previous wording
      ("if the ADR selects a Rust-built lexical indexer, add `cargo test --workspace` to this list")
      is therefore **answered in this docs PR rather than left implicit**: the item stays not
      applicable, and it becomes applicable on the first ticket in this module that actually edits
      Rust. The compatibility handshake between the two modules — the CLI contract, the
      `index_version` string and the `versions.index` values `RETR-01` accepts — is a published
      cross-module interface per ADR 0003 and is covered by `RETR-01`'s own acceptance list.

## Test plan

All steps run offline; no network, no cloud credentials, no production keys (development keypair from
`CRPS-02`'s fixtures only).

1. `uv run pytest pipelines/corpus-builder/tests/build pipelines/corpus-builder/tests/validation -q`.
   Harness: pytest. A `candidate_factory` fixture in `tests/build/conftest.py` composes the earlier
   tickets — `CRPS-01`'s `create_corpus_database()`, `CRPS-03`'s chunker, `CRPS-04`'s tiering,
   `CRPS-05`'s stub-provider embedding build, `CRPS-02`'s manifest builder and dev key — into a
   known-good candidate; every gate test mutates exactly one thing from that baseline. The model and
   runtime pins are literal test data supplied by the factory, never read from the machine.
2. Gate matrix: one test module per gate (`test_gate_completeness.py`, `…_time.py`, `…_identity.py`,
   `…_citation.py`, `…_licensing.py`, `…_smoke.py`, `…_evaluation.py`, `…_manifest.py`), each with a
   pass case and at least one fail case asserting the exact `Finding.code`. The manifest module also
   carries the pinning matrix (absent pin, incomplete pin, each missing member, embedding-manifest
   disagreement, query/document representation mismatch, stub pin under each `release_kind`).
3. Fail-closed: after a rejected build, assert `not (output_dir / f"corpus-release-{release_id}")
   .exists()`, assert the staging directory is cleaned or clearly marked, and assert the input corpus
   database's sha256 is unchanged.
4. Idempotence/determinism: build twice from the same input into two directories; compare
   `artifacts.*` hashes in the two manifests.
5. Diff: build a parent, mutate the corpus (add a document, add a version, change node text, change a
   status, remove a document), rebuild, and assert `release-diff.json` contains one entry of each
   change type with correct before/after ids.
6. `UAT-OPS-01` replay: corrupt the candidate `corpus.sqlite` (truncate a page) and assert a BLOCKING
   manifest/hash finding and `decision: REJECTED`.
7. Suite green: `uv run pytest` and `pnpm test` from the repository root.
8. Reviewer focus (this is the module's highest-risk ticket): confirm no code path writes to the
   parent/active bundle or to the input corpus database; confirm the staging→rename sequence has no
   window where a partially-built bundle exists at the final path; confirm gates cannot be disabled by
   configuration for a `CANDIDATE` build (search for any `skip`/`force` flag); confirm a per-source
   anomaly override cannot reach one of the four unconditional BLOCKING classes; confirm the
   evaluation gate treats a malformed report as BLOCKING rather than missing; confirm no pin is
   defaulted or inferred and no stub pin can reach a `CANDIDATE`; confirm no import of
   `services.search_rs` or any network client.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/04-corpus-contract/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *No offline lexical index builder is available under any of the three ADR options* (Q-CRPS-2) →
     write [`docs/adr/0003-offline-lexical-index-builder.md`](../../../adr/0003-offline-lexical-index-builder.md)
     with the finding, then write back to
     `docs/prd/breakdown-plan.md` §2.1 (a new ADR-candidate row) and §4.2 (a new contested-path row),
     and add the resulting edge — most likely a `blocked_by` on an `11-retrieval-engine` ticket — to
     `docs/prd/breakdown-plan.md` §5.5 **and** §6.2. Do **not** import `services/search-rs` from this
     module: that is a module cycle and `/start-all` will refuse to run (breakdown plan R6).
   - *There is no process that can supply `local_model_pins`/`runtime_pin` to a candidate build* →
     breakdown plan §8 **Q11** requires the release to pin those values, so the answer is never a
     default or an environment probe. Record the gap in `docs/prd/04-corpus-contract/README.md` and
     raise the ticket change against **`CRPS-02`** (the manifest owner) and `RETR-07` (the value's
     source) before writing code. A `CANDIDATE` that cannot state its pins must fail, not guess.
   - *A model artefact must ship inside the bundle for the release to be self-contained* → that adds a
     path to PRD §18.4's fixed five-entry layout: a **plan/PRD writeback** (sub-PRD D15), not a change
     to `assemble_bundle`. Stop and write back to `docs/prd/breakdown-plan.md` §2.1/§4.1 and
     `docs/prd/04-corpus-contract/README.md` first.
   - *A PRD §12.2 gate cannot be implemented offline* (most likely "smoke search") → keep the offline
     subset, record the reduced scope in **this ticket's** deliverable 4.6 and in
     `docs/prd/04-corpus-contract/README.md`, and confirm the full check is claimed by `RLSE-07`'s
     ticket. A gate that silently checks less than PRD §12.2 states is a defect.
   - *The evaluation report's shape disagrees with `21-evaluation-600`'s output* → the producer wins;
     adjust `src/validation/evaluation_report.py` and record the contract in
     `docs/prd/04-corpus-contract/README.md`. If `04` genuinely needs to be `blocked_by` a `GOLD-*`
     ticket, that is a **module-cycle** risk (21 already depends on 04) — escalate per layer 3 rather
     than adding the edge.
   - *Measured build memory or bundle size exceeds the 32 GB attached SSD / 2 GB RAM envelope*
     (PRD §19.1) → report via deliverable 9 and record in `docs/prd/04-corpus-contract/README.md`
     (Q3/Q5, both deferred until measured); the reduction decision is `RLSE-11`'s under the settled Q3
     policy, not this ticket's.
   - *Per-source anomaly thresholds need to differ from the ±10% / >2% initial defaults* (breakdown
     plan §8 Q9, baseline-selected) → they are already overridable per source group; record the chosen
     values with the source group's own ticket (`06`–`10`), where the representative baseline that
     justifies them lives, and note the mechanism in `docs/prd/04-corpus-contract/README.md`. Never
     change the unconditional BLOCKING classes.
   - *A source group cannot reach an `ACTIVE` state before release* → the answer is the confirmed
     breakdown plan §8 **Q10** policy, not a scope cut here: the group is attempted in full, and a
     limited state is recorded only with measured evidence, affected dates/collections, the
     customer-visible warning and the reason. The evidence is `GOLD-16`'s and the disclosure is
     `LNCH-05`'s; this ticket only enforces that the state is explicit.
3. **Falsified protocol.** If PRD §12.2's "Failed releases MUST NOT modify active production data" or
   PRD §18.4's "Active data MUST never be rebuilt or mutated in place" cannot be honoured by an
   offline build — for example if the only feasible index build mutates the source database in place —
   that overturns the release-safety model and requirement `ADM-002`. Stop, escalate for re-review,
   and write back to `docs/prd/04-corpus-contract/README.md` and `docs/prd/breakdown-plan.md` §2.1
   before writing any code that mutates an existing bundle. Never relax a release-safety invariant
   inside the ticket.
