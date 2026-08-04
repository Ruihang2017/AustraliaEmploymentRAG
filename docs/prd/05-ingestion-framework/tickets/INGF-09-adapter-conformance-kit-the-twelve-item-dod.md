---
id: INGF-09
title: Adapter conformance kit (the twelve-item DoD)
module: 05-ingestion-framework
lane: 05-ingestion-framework
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INGF-05, INGF-06]
blocks: [SLEG-01, SINS-02, SINS-05, SCAS-01, SADJ-01, SADJ-02, SADJ-03, SADJ-04, SADJ-05, SADJ-06, SADJ-07, SADJ-08, SADJ-09]
---

# INGF-09 — Adapter conformance kit (the twelve-item DoD)

Implements PRD §40.8 (adapter Definition of Done) and PRD §45.4 (pull-request contract) — no ADR —
the decision is already made in PRD §40.8; this is build ticket 9 of 9 against it.
Parent sub-PRD: [05-ingestion-framework README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [INGF-05 — Quarantine, ingestion-run accounting and anomaly rules](INGF-05-quarantine-ingestion-run-accounting-and-anomaly-rules.md),
[INGF-06 — Isolated parser/OCR subprocess harness](INGF-06-isolated-parser-ocr-subprocess-harness.md)
**Why `builder`:** a bounded harness inside this module's declared file-scope against a twelve-item
checklist PRD §40.8 enumerates verbatim — not a new subsystem decision.

## Background + basis

**PRD §40.8 is the checklist, verbatim.** "For each source group, the implementation PR must
provide:"

1. registry row(s), official URL allowlist and licence snapshot/assessment;
2. discovery fixture and live dry-run evidence;
3. stable identity/version rules, including deletion/unavailability behaviour;
4. representative HTML/XML/JSON/PDF fixtures without customer data;
5. parser/node hierarchy and exact-text round-trip tests;
6. historical/effective/status/event behaviour for at least three time points;
7. incremental no-change, changed, removed and transient-failure tests;
8. count/hash baseline and anomaly thresholds;
9. freshness schedule and last-check/last-ingest separation;
10. quarantine cases and operator recovery action;
11. retrieval/citation evaluation subset;
12. measured storage, parse time, index size and peak memory.

**PRD §45.4** makes it a PR gate: "Changes to source adapters include the twelve-item adapter
Definition of Done."

**Why one kit rather than 52 hand-written suites.** This ticket `blocks` 13 tickets directly
(`SLEG-01`, `SINS-02`, `SINS-05`, `SCAS-01`, `SADJ-01`…`SADJ-09`, plan §6.2) and, through them, all
52 adapter tickets in modules `06`–`10`. PRD §44.3 calls individual source adapters the "safe
parallel work units"; they are only safe if each one is proved the same way, by a harness they do not
have to write and cannot weaken. Plan §5.6 states the goal exactly: *"One harness proves all 52
adapters the same way."*

**The cold-start requirement is unusually strict here.** 52 Builders in five different modules will
implement adapters against this kit **without reading each other's code and without this planning
conversation**. The kit therefore ships not only checks but a **reference adapter** and an
**authoring guide** inside its own file-scope.

**Time points.** PRD §6.6 sets the three-financial-year minimum (2026–27, 2025–26, 2024–25) which
item 6's "at least three time points" serves; PRD §15.2 requires publication, effective, retrieval and
system-knowledge time to be distinguished; PRD §6.7 gives the seven legal-status values.

**Round-trip.** PRD §15.3: "Citations MUST target DocumentVersion + NodeVersion + **exact offsets** +
source snapshot, never a SearchChunk." Item 5 is what makes that possible; `INGF-06` exports
`assert_roundtrip()` for it.

**Fixtures without customer data.** PRD §40.8 item 4 and PRD §19.2/§35.3 ("no customer data"). Source
material is public, but a fixture captured from a live site can still pick up cookies, tokens or a
support email — item 4 must check, not assume.

**Blind gold is settled, and none of it belongs here (plan §8 Q6, confirmed).** Blind material is
authored by dedicated `evaluation-author` agents in an isolated workspace outside the repository,
independently reviewed before encryption, sealed with libsodium `SealedBox`, with the Founder as sole
custodian of the private key and `EVAL_BLIND_KEY_FILE` supplying its path with no default, no
in-repository lookup and no keyring fallback; `GOLD-01` implements that mechanism. Nothing about it is
outstanding, and nothing about it changes what this kit does — but it fixes one rule that binds all 52
adapter authors: **adapter conformance fixtures are ordinary fixtures and must never contain or
reference blind gold material**, and the kit never opens a path under `evals/gold/**`
(PRD §14.3, §45.1 item 6; plan §9 R9).

**Carried caveat — sub-PRD M3.** Plan §5.6 gives this ticket `blocked_by: [INGF-05, INGF-06]` only,
while DoD items 1 and 9 exercise schemas owned by `INGF-04` (`licence.yaml`) and `INGF-07`
(`registry.yaml`). The kit therefore resolves those validators **through the ports declared in
`INGF-01`** and reports `NOT_AVAILABLE` — which **fails** the kit in strict mode — rather than
skipping a check silently. Item 11 is the single deliberately deferrable item, because `evals/**`
(module `21-evaluation-600`) is authored after the adapters it evaluates.

## Goal

Implement the adapter conformance kit under `pipelines/ingestion/src/<root>/conformance/**`: a
reusable `ConformanceTestCase` base class that runs all twelve PRD §40.8 checks for any
`pipelines/adapters/<group-id>/` directory from a five-line adapter-side test file, a
`python -m <root>.conformance check <group-dir>` CLI producing a machine-readable
`conformance-report.json` with a per-item verdict, the `conformance.yaml` per-adapter override
schema, a complete passing **reference adapter**, an authoring guide, and a negative-control suite
proving every one of the twelve checks can fail — so that 52 adapter tickets can be built in parallel
against one identical, non-weakenable standard.

## Non-goals

- **No individual source adapter.** The reference adapter is a synthetic `demo-registry` group inside
  this module's own tree; the 52 real groups belong to modules `06`–`10`.
- **No shared adapter helper code.** `_shared/{legislation,rates,caselaw,future}` primitives are owned
  by `SLEG-01`, `SINS-01`, `SCAS-01`, `SFUT-01` (plan §9 R2). The kit tests adapters; it does not
  provide legal-domain helpers.
- **No `registry.yaml`, `allowlist.yaml` or `licence.yaml` schema** — `INGF-07`, `INGF-02`, `INGF-04`
  (sub-PRD D3). The kit **calls** their validators.
- **No evaluation cases, gold data or metrics** — `21-evaluation-600`. Item 11 checks that a subset is
  *referenced and well-formed*; `GOLD-16` reconciles it. The kit must never read `evals/gold/**`
  (plan §9 R9, PRD §45.1 item 6: "Never expose blind evaluation gold data … to coding agents"), and an
  adapter's conformance fixtures are ordinary fixtures that must never contain or reference blind gold
  material (plan §8 **Q6**, confirmed — see Background).
- **No live network access.** "Live dry-run evidence" (item 2) is a **recorded artifact** the adapter
  ticket commits; the kit validates its shape and freshness, it does not perform the live run.
- **No corpus release build, promotion or search smoke** — `CRPS-06`, `RLSE-07`.
- **No CI workflow file** — `.github/workflows/**` is `00-foundation` (`FND-02`). The kit ships a CLI
  with a stable exit code; wiring it into CI is a `FND-02` concern.

## File-scope (write-owns)

- `pipelines/ingestion/src/<root>/conformance/**`, including:
  `schema/conformance.schema.json` (the per-adapter override file),
  `schema/conformance-report.schema.json`, `reference/**` (the reference adapter), and
  `README.md` (the adapter authoring guide).
- `pipelines/ingestion/tests/conformance/**`, including the negative-control mutation suite.
- `pipelines/ingestion/pyproject.toml` — **append-only**; conflicts resolve by re-running `uv lock`
  (plan §1.1).
- Does not touch: `pipelines/ingestion/src/<root>/{adapter,fetch,artifacts,licensing,quarantine,runs,parsing,registry,discovery}/**`
  — `INGF-01`…`INGF-08`.
- Does not touch: `pipelines/adapters/**` — modules `06`–`10`. The reference adapter lives at
  `src/<root>/conformance/reference/demo-registry/` inside this module.
- Does not touch: `evals/**`, `pipelines/evaluation/**` — `21-evaluation-600`.
- Does not touch: `.github/workflows/**` — `00-foundation` (`FND-02`).
- Does not touch: `tests/**` — `23-assurance`.

**Serial safety.** First decomposition; nothing merged, nothing in flight. `INGF-01`…`INGF-06` have
landed. The ticket that can be concurrent with this one is **`INGF-07`** (`blocked_by INGF-04`),
which owns `src/<root>/registry/**` — disjoint from `conformance/`. Both tickets *describe* the
per-adapter file layout; only `INGF-07` writes `registry.schema.json` and only this ticket writes
`conformance.schema.json`. The one shared path is `pyproject.toml`, append-only by plan §1.1.

## Deliverables

1. **`<root>.conformance.ConformanceTestCase` — the adapter-side API (binding on 52 tickets).**
   An adapter's entire conformance suite is exactly this file:

   ```python
   # pipelines/adapters/<group-id>/tests/test_conformance.py
   from pathlib import Path
   from aer_ingestion.conformance import ConformanceTestCase

   class TestLegCth(ConformanceTestCase):
       group_dir = Path(__file__).resolve().parents[1]
   ```

   `pytest` collects the twelve inherited `test_dod_NN_*` methods. The base class exposes
   `group_dir` (required), `strict: bool = True`, and nothing else that an adapter may override — a
   test asserts that overriding any `test_dod_*` method in a subclass raises `ConformanceOverrideError`
   at collection time, so no adapter can weaken its own gate.

2. **The twelve checks — exact method names and assertions.** One method per PRD §40.8 item, named
   `test_dod_01_registry_allowlist_licence` … `test_dod_12_measured_resources`:

   | # | Method | Asserts |
   |---|---|---|
   | 1 | `test_dod_01_registry_allowlist_licence` | `registry.yaml`, `allowlist.yaml`, `licence.yaml` exist and validate through `INGF-07`/`INGF-02`/`INGF-04`; `group_id` is in `MANDATORY_SOURCE_GROUPS`; directory name == `group_id.lower()`; the licence snapshot file exists and its SHA-256 equals `snapshot.terms_sha256`; every `official_endpoints` URL passes the allowlist. |
   | 2 | `test_dod_02_discovery_fixture_and_dry_run` | `fixtures/discovery/` contains ≥1 recorded discovery response; replaying it through `adapter.discover()` with the replay fetcher yields ≥1 `RemoteDescriptor` with non-empty `descriptor_key` and an allowlisted `url`; `fixtures/dry-run.json` exists with `{run_at, descriptors_discovered, sample_urls, tool_versions}` and `run_at` is within `DRY_RUN_MAX_AGE_DAYS = 180`. |
   | 3 | `test_dod_03_identity_and_deletion` | `adapter.identify()` is deterministic (same artifact → same `stable_source_key` across two calls) and stable across two *versions* of the same document fixture; different documents yield different keys; a removed descriptor produces a `REMOVED` finding and deletes no prior state (`INGF-08` semantics). |
   | 4 | `test_dod_04_representative_fixtures` | `fixtures/documents/` covers every media type the group declares in `AdapterMeta.supported_content_types`; each fixture is non-empty; the **no-customer-data scan** finds no TFN/ABN-with-name/email/phone/credential pattern, no `Set-Cookie`/`Authorization`/`Bearer` header capture and no `.env`-shaped content. |
   | 5 | `test_dod_05_parser_roundtrip` | every document fixture parses through `INGF-06`'s `ParserHost`; `assert_roundtrip(document)` passes; the emitted node hierarchy has one root, no cycles, contiguous `ordinal`s among siblings, and every `NodeVersion.text_hash` recomputes from `canonical_text` (PRD §15.3, §35.2). |
   | 6 | `test_dod_06_three_time_points` | `fixtures/timepoints/` declares ≥3 legal dates; for each, `normalise()`+`extract_events()` produce a `DocumentVersion` whose `effective_from`/`effective_to` bracket that date, a `legal_status` from the PRD §6.7 seven-value set, and events whose `event_date`/`effective_date` are distinguished (PRD §15.2); no two versions of a consolidated series have overlapping effect intervals (PRD §35.2). |
   | 7 | `test_dod_07_incremental_matrix` | four replayed scenarios: **no-change** (304 → 0 fetched, 0 quarantined, `last_successful_change_scan_at` advanced, `last_content_ingestion_at` unchanged); **changed** (new version emitted, prior version's `effective_to` closed); **removed** (`REMOVED` finding, prior version retained); **transient failure** (5xx/timeout → bounded retry then `FETCH_TRANSIENT_FAILURE`, run `PARTIAL`, **no** content quarantine). |
   | 8 | `test_dod_08_count_hash_baseline` | `fixtures/baseline.json` exists with `{collections: {name: {count, content_hash_set_sha256}}, captured_at}`; the replayed run reproduces it exactly; declared `anomaly_overrides` in `conformance.yaml` pass `INGF-05`'s `AnomalyPolicy.for_group()` (i.e. tighten only, never downgrade a BLOCK). |
   | 9 | `test_dod_09_freshness_schedule` | `registry.yaml` declares `change_detection.{capability,cadence}`; a replayed 304 run and a replayed content run write **different** fields — proving last-check and last-ingest are separated exactly as PRD §12.1 and §40.8 item 9 require. |
   | 10 | `test_dod_10_quarantine_cases` | `fixtures/quarantine/` contains ≥1 deliberately defective artifact for **every** code in `AdapterMeta.declared_quarantine_reasons`; each produces exactly that code; each code has a non-empty `operator_action` in `INGF-05`'s reason table. |
   | 11 | `test_dod_11_evaluation_subset` | `registry.yaml.evaluation_subset_ref` is non-empty and every id matches the evaluation-case id pattern; **if** `evals/cases/**` exists, every referenced id resolves there; if it does not exist, the item reports `DEFERRED(GOLD-16)` — the single deferrable item (see deliverable 4). `evals/gold/**` is never read (plan §9 R9, PRD §45.1 item 6). |
   | 12 | `test_dod_12_measured_resources` | the replayed full run records `storage_bytes`, `parse_wall_ms`, `index_size_estimate_bytes` and `peak_rss_bytes` into the report, all present and non-zero, and each within the group's ceiling from `conformance.yaml` (or the kit default). PRD §39.2 budgets the host at 2 GiB, so these numbers are release inputs, not decoration. |

3. **`conformance.yaml` — the per-adapter override file (sub-PRD D3; this ticket owns the schema).**
   Optional; absent means kit defaults. Committed JSON Schema with `additionalProperties: false`:

   ```yaml
   group_id: LEG-CTH
   resource_ceilings:
     storage_bytes: 5368709120
     parse_wall_ms: 1800000
     index_size_estimate_bytes: 1073741824
     peak_rss_bytes: 1073741824
   anomaly_overrides:          # read by INGF-05's AnomalyPolicy; tighten-only (PRD §40.9)
     count_delta_pct: 5.0
     parse_failure_pct: 1.0
   deferred_items: [11]        # ONLY item 11 may appear; any other value is a schema error
   deferral_reasons:
     11: "Evaluation cases authored in GOLD-16"
   ```

4. **Verdict model and strictness.** Every item resolves to exactly one of
   `PASS | FAIL | NOT_APPLICABLE(reason) | NOT_AVAILABLE(port, ticket) | DEFERRED(ticket)`.
   - `NOT_APPLICABLE` requires a recorded reason and is permitted only where the PRD itself allows it
     (e.g. item 4's PDF fixture for a group that publishes no PDFs);
   - **`NOT_AVAILABLE` fails the kit** in strict mode and names the missing port and its implementing
     ticket — sub-PRD **M3**'s mitigation. It exists so a missing `INGF-04`/`INGF-07` validator is
     loud, never a silent pass;
   - `DEFERRED` is permitted **only** for item 11 and only with a `conformance.yaml` reason.
   `strict=True` is the default and the CLI default; `--lenient` exists for local iteration and is
   recorded in the report so a lenient report can never be mistaken for evidence.

5. **CLI and report.** `python -m <root>.conformance check <group-dir> [--report FILE] [--lenient]`
   exits `0` only when every item is `PASS`, `NOT_APPLICABLE` or (item 11) `DEFERRED`. It writes
   `conformance-report.json` validated by `schema/conformance-report.schema.json`:

   ```json
   {
     "report_schema_version": "1",
     "group_id": "LEG-CTH",
     "adapter_version": "0.1.0",
     "framework_version": "0.1.0",
     "checked_at": "2026-08-03T00:00:00Z",
     "strict": true,
     "items": [{"item": 1, "name": "registry_allowlist_licence", "verdict": "PASS",
                "detail": null, "evidence": {}}],
     "measurements": {"storage_bytes": 0, "parse_wall_ms": 0,
                      "index_size_estimate_bytes": 0, "peak_rss_bytes": 0},
     "summary": {"pass": 12, "fail": 0, "not_applicable": 0,
                 "not_available": 0, "deferred": 0}
   }
   ```

   The report is the artifact an adapter PR attaches for PRD §45.4 ("Changes to source adapters
   include the twelve-item adapter Definition of Done") and the input `GOLD-16` reconciles.

6. **Replay infrastructure the adapters use.** `ReplayFetcher` (serves recorded responses from
   `fixtures/`, refuses any URL not present, and still applies `INGF-02`'s allowlist so a fixture
   cannot legitimise an off-allowlist URL), `ReplayClock`, an in-memory `RecordSink`, and a temp
   `ingestion.sqlite`. Exposed as public helpers so an adapter's *own* unit tests reuse them:
   `from aer_ingestion.conformance import ReplayFetcher, ReplayClock, replay_context`.
   Recorded-response format is a committed JSON schema (`fixtures/*.json`: request URL + method +
   validators → status, headers, body path) so 52 tickets record fixtures identically.

7. **The reference adapter** at `src/<root>/conformance/reference/demo-registry/` — a complete,
   deliberately tiny, fully-passing group with `registry.yaml`, `allowlist.yaml`, `licence.yaml`,
   `licence-snapshots/`, `conformance.yaml`, `adapter.py` (all eight PRD §40.7 boundaries
   implemented over three synthetic documents), `fixtures/{discovery,documents,timepoints,quarantine,
   baseline.json,dry-run.json}` and `tests/test_conformance.py`. Its `group_id` is `DEMO-REGISTRY`,
   which is **not** in `MANDATORY_SOURCE_GROUPS`; the kit accepts it only under an explicit
   `allow_non_roster=True` flag used by the reference and by the kit's own tests, so no real adapter
   can use it to bypass the roster check.

8. **The authoring guide** at `src/<root>/conformance/README.md`: the per-adapter file layout, the
   five-line test file, the import paths (`aer_ingestion.adapter`, `.conformance`), each of the twelve
   items with the fixture it needs, the failure-code registration rule, the tighten-only anomaly rule,
   the blind-gold rule ("conformance fixtures are ordinary fixtures: never read, contain or reference
   `evals/gold/**` material" — plan §8 **Q6**, confirmed), and a pointer to the reference adapter.
   This is the document
   a cold-starting adapter Builder reads instead of another adapter's code.

9. **Negative-control suite** in `tests/conformance/`: for each of the twelve items, one mutation of a
   copy of the reference adapter that **must** make that item `FAIL` (e.g. delete `licence.yaml`;
   corrupt a `text_hash`; make `identify()` non-deterministic; overlap two effect intervals; advance
   `last_content_ingestion_at` on a 304; loosen an anomaly override; drop a quarantine fixture;
   exceed a resource ceiling). A conformance kit that cannot fail is worthless; this suite is the
   proof that it can.

10. **Failure codes** registered with `register_failure_codes("conformance", …)`, each with an
    operator action: `CONFORMANCE_ITEM_FAILED`, `CONFORMANCE_PORT_UNAVAILABLE`,
    `CONFORMANCE_FIXTURE_MISSING`, `CONFORMANCE_FIXTURE_CONTAINS_CUSTOMER_DATA`,
    `CONFORMANCE_OVERRIDE_FORBIDDEN`, `CONFORMANCE_DRY_RUN_STALE`.

## Acceptance checklist (classified)

- [ ] `[machine]` `ConformanceTestCase` exposes exactly twelve `test_dod_NN_*` methods, one per PRD
      §40.8 item, named as in deliverable 2; a test asserts the set of names and the item numbering
      (PRD §40.8).
- [ ] `[machine]` A subclass overriding any `test_dod_*` method raises `ConformanceOverrideError` at
      collection time — no adapter can weaken its own gate (PRD §45.4).
- [ ] `[fixture]` The **reference adapter** passes all twelve items with verdict `PASS` (item 11 via
      its committed evaluation-subset ids), `exit 0`, and a report validating against
      `conformance-report.schema.json` (PRD §40.8; deliverable 7).
- [ ] `[fixture]` **Negative controls**: twelve mutations of the reference adapter, one per item, each
      producing `FAIL` for exactly that item and a non-zero exit (deliverable 9). This is the
      load-bearing evidence that the kit is not vacuous.
- [ ] `[machine]` `NOT_AVAILABLE` fails the kit in strict mode and names the port and the implementing
      ticket: simulated by unregistering the `LicenceGate` and the registry validator (sub-PRD **M3**;
      PRD §40.8 items 1 and 9).
- [ ] `[machine]` `DEFERRED` is accepted **only** for item 11 and only with a `conformance.yaml`
      reason; `deferred_items: [5]` is a schema error (deliverable 3/4).
- [ ] `[machine]` `--lenient` is recorded in the report as `"strict": false`, so a lenient report
      cannot be presented as PRD §45.4 evidence (deliverable 4).
- [ ] `[machine]` Item 4's no-customer-data scan flags a fixture containing a synthetic TFN, a
      personal email, a `Set-Cookie` header capture and an `Authorization: Bearer` line, and passes a
      clean fixture (PRD §40.8 item 4, §19.2, §35.3).
- [ ] `[machine]` Item 5 uses `INGF-06`'s exported `assert_roundtrip()` and fails on a corrupted
      offset or a mismatched `text_hash` (PRD §40.8 item 5, §15.3).
- [ ] `[machine]` Item 6 fails when two versions of a consolidated series overlap and when a
      `legal_status` outside PRD §6.7's seven values is emitted (PRD §35.2, §6.7).
- [ ] `[machine]` Item 7's four scenarios each produce their expected run counts and status, and the
      transient-failure case does **not** create a content quarantine item (PRD §40.8 item 7).
- [ ] `[machine]` Item 9 fails when a 304 run advances `last_content_ingestion_at` — the
      last-check/last-ingest separation (PRD §12.1, §40.8 item 9).
- [ ] `[machine]` Item 8 fails when `anomaly_overrides` loosen a threshold or downgrade a BLOCK rule
      (PRD §40.9; `INGF-05`'s `AnomalyPolicyError`).
- [ ] `[machine]` Item 10 fails when a code in `declared_quarantine_reasons` has no fixture, and when
      a fixture produces a different code (PRD §40.8 item 10, ADM-001).
- [ ] `[machine]` Item 12 records all four measurements and fails when one exceeds its ceiling
      (PRD §40.8 item 12, §39.2).
- [ ] `[machine]` The kit never reads any path under `evals/gold/**` — asserted by an access guard in
      the test session (plan §9 R9; PRD §45.1 item 6; PRD §14.3).
- [ ] `[machine]` `ReplayFetcher` refuses a URL absent from the fixtures **and** a URL present in the
      fixtures but outside the group's `allowlist.yaml` (a fixture cannot legitimise an off-allowlist
      URL) (SEC-002 consistency).
- [ ] `[machine]` The reference adapter's non-roster `group_id` is accepted only with
      `allow_non_roster=True`; without it, item 1 fails (deliverable 7).
- [ ] `[machine]` The authoring guide `src/<root>/conformance/README.md` documents all twelve items,
      the five-line test file and the per-adapter layout — asserted by a doc test that each item
      number appears with its method name (cold-start requirement).
- [ ] `[machine]` Every failure code in deliverable 10 is registered with a non-empty operator action
      (ADM-001, PRD §40.8 item 10).
- [ ] `[machine]` The whole suite runs offline with no outbound network (session fixture asserts it).
- [ ] `[machine]` `uv run pytest` green.
- [ ] `[machine]` `pnpm test` green (unchanged — no TypeScript in this ticket).
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (**ADM-001**; supports **SEC-002**
      via the allowlist-respecting replay fetcher and **EVAL-002** via item 11's reference); UAT IDs —
      none directly; schema/API/event compatibility (fixes `ConformanceTestCase`,
      `conformance.yaml` and `conformance-report.json`, all consumed by 52 adapter tickets across five
      modules — changes after merge require re-publishing dependent tickets); tenant/PII/security
      impact (fixture scanning is a customer-data control; the kit reads no blind gold);
      source/licence impact (item 1 enforces the licence snapshot/assessment for every group);
      cost/memory/latency impact (item 12's measurements are the per-group inputs to PRD §39.2's
      budget); rollback path; known gaps (sub-PRD M3).
- [ ] `[human]` **Founder/Architect review that the twelve checks actually discharge PRD §40.8** —
      the kit is the gate for all 52 adapters, and whether a check is *sufficient* (as opposed to
      present) is irreducibly a judgment call. PRD §43.4 item 4 puts adapter anomalies in the founder
      review queue.
- **No further `[fixture]` classes** beyond the reference adapter and the negative controls; the kit
  replays recorded data by construction. Declared explicitly.

## Test plan

Harness: `uv run pytest pipelines/ingestion/tests/conformance -q`, fully offline. The kit's own tests
run the kit against copies of the reference adapter in a temp directory — never against
`pipelines/adapters/**`.

1. `uv sync --frozen && uv run pytest pipelines/ingestion/tests/conformance -q`.
2. **`test_reference_passes.py`** `[fixture]` — the reference adapter, all twelve `PASS`, exit 0,
   report schema-valid, `summary.pass == 12`.
3. **`test_negative_controls.py`** `[fixture]` — parametrised over twelve mutation functions, each
   copying the reference into `tmp_path`, applying one mutation, and asserting exactly that item's
   verdict is `FAIL` while the others are unaffected where independent.
4. **`test_verdicts.py`** — `NOT_AVAILABLE` with the licence/registry validators unregistered;
   `DEFERRED` allowed only for item 11; `NOT_APPLICABLE` requires a reason; `--lenient` recorded.
5. **`test_api_lock.py`** — the twelve method names; the override guard; the public helper exports
   (`ReplayFetcher`, `ReplayClock`, `replay_context`).
6. **`test_fixture_hygiene.py`** — the item-4 customer-data scanner over clean and dirty samples.
7. **`test_replay_fetcher.py`** — unknown-URL refusal and off-allowlist refusal.
8. **`test_gold_guard.py`** — an access guard proving no `evals/gold/**` path is opened during a full
   kit run.
9. **`test_guide.py`** — the authoring-guide doc test.
10. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus: run the negative-control suite first — if any mutation still passes, the kit is
vacuous for that item and the ticket is not done. Then confirm that no check can be disabled from the
adapter side (`conformance.yaml` has no "skip" key, `deferred_items` accepts only `11`, and
`test_dod_*` cannot be overridden), and that `NOT_AVAILABLE` is a failure rather than a skip.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (docs PR/MR,
sub-PRD changelog line, then `publish-tickets.mjs --sync`), then change code. Because 13 tickets are
`blocked_by` this one and 52 depend on it transitively, a change here after merge also requires
re-publishing the dependent tickets (`publish-tickets.mjs --sync`) — say so in the PR.

**Foreseeable frictions and their exact writeback targets:**

1. **DoD items 1 or 9 report `NOT_AVAILABLE` because `INGF-04`/`INGF-07` have not landed in the
   branch** (sub-PRD **M3**) → this is expected and must stay a **failure**, not a skip. If the
   ordering genuinely blocks delivery, the writeback is a plan change: add `INGF-04` and `INGF-07` to
   `INGF-09.blocked_by` in `docs/prd/breakdown-plan.md` §5.6 and the matching edges in §6.2, update
   `docs/prd/05-ingestion-framework/README.md` M3, and escalate — never soften the verdict locally.
2. **A real source group cannot satisfy one of the twelve items** (e.g. no PDF exists, or the source
   publishes no manifest for item 8) → use `NOT_APPLICABLE` **with a recorded reason** where the item
   legitimately does not apply, and record the pattern in
   `docs/prd/05-ingestion-framework/README.md`. If an item is impossible for a whole *class* of
   sources, that is a change to PRD §40.8's list — a **product/spec** change under PRD §45.5.
   Escalate; do not add a second deferrable item.
3. **Adapter tickets want to add their own conformance checks** → allowed only as *additional* tests
   in that adapter's own `tests/`, never by editing the kit. If a check is genuinely universal, it
   belongs here: update this ticket's deliverable 2 and re-publish the dependent tickets. Plan §9 R2
   is the standing warning about shared code written by 52 concurrent tickets.
4. **The `ConformanceTestCase` base-class collection pattern does not work with the chosen pytest
   configuration** → update deliverable 1 in this ticket and
   `docs/prd/05-ingestion-framework/README.md` **before** changing the adapter-side API, and re-publish
   the 13 directly-blocked tickets. The five-line adapter test file is the contract 52 Builders are
   told to write; it must not change silently.
5. **Item 11 tempts a read of `evals/gold/**`** → forbidden, and not an open question. Plan §9 R9 and
   PRD §45.1 item 6 keep blind gold outside ordinary agent context, and plan §8 **Q6** (confirmed)
   settles how it is authored, isolated, sealed and key-custodied — `GOLD-01` implements the mechanism
   and the Founder is the sole private-key custodian. Item 11 validates the *reference*, never the gold
   answer, and a conformance fixture that contained or pointed at blind material would breach the same
   rule. If the check is felt to be too weak, raise it against `GOLD-16`, whose job is exactly that
   reconciliation.
6. **Resource ceilings (item 12) are exceeded by a legitimate large group** → raise that group's
   ceiling in its own `conformance.yaml` with the measurement as justification, and record the
   aggregate in the PR's cost/memory line. If the aggregate across 52 groups breaches PRD §39.2's
   2 GiB host budget, that is `RLSE-11`'s measurement to resolve: plan §8 **Q3** is deferred until
   real-scale measurement, and the always-hot vector count, cache limits and cold/hot tier boundary
   come from that benchmark rather than from any number chosen here. Escalate rather than raising the
   kit default.

**Escalation rule.** If the twelve-item Definition of Done cannot be made mechanically checkable —
or if any adapter-side mechanism can disable a check — that overturns PRD §40.8 and PRD §45.4, the
gate on which all 52 source-adapter tickets and PRD §26's corpus Definition of Done depend. Stop and
escalate for re-review; a kit that can be bypassed is worse than no kit, because it produces evidence
that is not evidence.
