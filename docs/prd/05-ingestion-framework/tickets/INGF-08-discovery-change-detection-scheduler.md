---
id: INGF-08
title: Discovery / change-detection scheduler
module: 05-ingestion-framework
lane: 05-ingestion-framework
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INGF-05, INGF-07]
blocks: []
---

# INGF-08 — Discovery / change-detection scheduler

Implements PRD §12.1 (freshness cadences), PRD §33.4 step 1 (source change to customer alert) and
PRD §19.3 (local workstation vs production discovery) — no ADR — the decision is already made in PRD
§12.1; this is build ticket 8 of 9 against it.
Parent sub-PRD: [05-ingestion-framework README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [INGF-05 — Quarantine, ingestion-run accounting and anomaly rules](INGF-05-quarantine-ingestion-run-accounting-and-anomaly-rules.md),
[INGF-07 — Source Coverage Registry composition and freshness fields](INGF-07-source-coverage-registry-composition-and-freshness-fields.md)
**Why `builder`:** a bounded scheduling layer inside this module's declared file-scope over cadences
PRD §12.1 states numerically and a run API `INGF-05` already exposes — not a new subsystem decision.

## Background + basis

**PRD §12.1 fixes the cadences and the mechanism:**

> "Critical official collections SHOULD be checked every **6–12 hours** using feeds/APIs/sitemaps/
> updated listings/manifests and **conditional requests**.
> Normal official collections SHOULD be checked **at least daily** where source capability permits.
> **Weekly** collection count/hash reconciliation and deeper **monthly** manifest reconciliation are
> required.
> The target is to **detect official change within 24 hours** and normally process/validate/publish
> within a further 24 hours.
> Sources without reliable delta mechanisms MUST show `FRESHNESS_LIMITED` rather than a false
> guarantee."

**PRD §33.4 step 1** makes discovery the head of the whole change-to-alert workflow: "Scheduled
discovery detects changed official metadata/hash", followed by "Adapter fetches only approved
official URLs and stores immutable artifact". Steps 6–9 (change matching, tenant alerts, delivery)
happen **after promotion** and belong to `WTCH-02`/`WTCH-03` — not here.

**PRD §19.3 splits the runtime:**

> "The local pipeline performs source-adapter development, full fetch/parse, OCR orchestration,
> normalisation, embedding, index build, 600-case evaluation, release signing and candidate upload.
> **The production server continues lightweight source discovery so source health does not depend on
> the workstation being online.**"

That sentence is why this ticket ships two modes rather than one.

**PRD §42.2** gives the alert this scheduler's data feeds: "Critical source freshness | misses
declared critical SLA by **2×** | Immediate | Mark degraded; stop definitive affected answers if
material." `INGF-07` computes `critical_freshness_breach`; `RLSE-08` delivers the alert.

**Inputs already fixed by siblings.** `INGF-07`'s `registry.yaml` declares
`change_detection.{capability,cadence,supports_conditional_requests,reconciliation}` per group.
`INGF-02`'s `allowlist.yaml` declares per-host `min_request_interval_ms` and
`max_concurrent_requests`. `INGF-05` owns `discovery_state` (per-descriptor `etag`/`last_modified`/
`content_sha256`/`last_seen_at`) and the `RunRecorder`/`RunHistoryPort`. This ticket composes them;
it defines no new per-adapter file.

**Carried caveat (sub-PRD M1).** Where the production host stores `ingestion.sqlite`, and whether it
runs discovery-only at all, is `RLSE-02`'s decision (PRD §39.3 has no row). This ticket takes the
path from configuration and never hard-codes `/srv/aer/...`.

## Goal

Implement the discovery scheduler under `pipelines/ingestion/src/<root>/discovery/**`: a deterministic
due-list computation from each group's PRD §12.1 cadence and its recorded last-check times, a change
scan that uses conditional requests through `INGF-02` and classifies each descriptor as
`NEW | CHANGED | UNCHANGED | REMOVED | UNAVAILABLE` without ever deleting prior state, weekly
count/hash and monthly manifest reconciliation passes, per-host politeness limits, and two run modes
(`discovery-only` for the production server, `full` for the workstation) — proven by offline replay
of recorded 200/304/404/5xx sequences against a fake clock.

## Non-goals

- **No `detected_change` rows, watch matching, alerts or notifications** — PRD §33.4 places those
  after promotion: `DATA-07` owns the table, `WTCH-02` the fan-out, `WTCH-03`–`WTCH-06` the delivery.
  This ticket records findings on the ingestion run only.
- **No corpus release build or promotion** — `CRPS-06`, `CRPS-07`, `RLSE-07`.
- **No alerting, status page or on-call delivery** — `18-ops-release` / `RLSE-08` (PRD §42.2). This
  ticket exposes the data; `INGF-07` computes the breach flag.
- **No cron/systemd unit, timer or host packaging** — `18-ops-release` / `RLSE-02`
  (`infra/deploy/host/**`). This ticket ships a CLI that a timer can invoke.
- **No new per-adapter file or schema** — cadence lives in `registry.yaml` (`INGF-07`), politeness in
  `allowlist.yaml` (`INGF-02`) (sub-PRD D3).
- **No fetching implementation** — `INGF-02`. This ticket calls the `Fetcher` port.
- **No adapter discovery logic** — each group's `discover()` is its own adapter's, in modules
  `06`–`10`.
- **No freshness status derivation** — `INGF-07` owns it; this ticket produces the timestamps it
  reads.

## File-scope (write-owns)

- `pipelines/ingestion/src/<root>/discovery/**` (plan §5.6 `src/discovery/**`).
- `pipelines/ingestion/tests/discovery/**`.
- `pipelines/ingestion/pyproject.toml` — **append-only**; conflicts resolve by re-running `uv lock`
  (plan §1.1).
- Does not touch: `pipelines/ingestion/src/<root>/{adapter,fetch,artifacts,licensing,quarantine,runs,parsing,registry,conformance}/**`
  — `INGF-01`…`INGF-07`, `INGF-09`.
- Does not touch: `pipelines/adapters/**` — modules `06`–`10`.
- Does not touch: `apps/worker/src/handlers/change-matching/**` — `16-monitor-alerts` (`WTCH-02`).
- Does not touch: `infra/deploy/**` — `18-ops-release` (`RLSE-02`, `RLSE-08`).
- Does not touch: `packages/database/**` — `01-app-data`.

**Serial safety.** First decomposition; nothing merged, nothing in flight. This ticket is wave 6 —
the last in the module — so `INGF-01`…`INGF-07` and, in a live schedule, `INGF-09` have landed or are
landing. `INGF-09` owns `src/<root>/conformance/**`; this ticket owns `discovery/` only. No `INGF`
ticket is `blocked_by` this one, so nothing waits on it inside the module. The one shared path is
`pyproject.toml`, append-only by plan §1.1.

## Deliverables

1. **`<root>.discovery.cadence` — the PRD §12.1 schedule constants.**

   | Cadence | Target interval | SLA (used by `INGF-07`'s `freshness_status`) | Applies to |
   |---|---|---|---|
   | `CRITICAL_6_12H` | 6 h | 12 h | `last_successful_change_scan_at` |
   | `NORMAL_DAILY` | 24 h | 24 h | `last_successful_change_scan_at` |
   | `WEEKLY_RECONCILE` | 7 d | 7 d | `last_full_reconciliation_at` |
   | `MONTHLY_MANIFEST` | 31 d | 31 d | `last_full_reconciliation_at` |

   Plus `CHANGE_DETECTION_TARGET_HOURS = 24` — PRD §12.1's "detect official change within 24 hours".
   A group whose cadence is `CRITICAL_6_12H` is additionally subject to reconciliation cadences when
   its `registry.yaml` declares them (`reconciliation.count_hash_weekly`,
   `reconciliation.manifest_monthly`) — the reconciliation schedule is independent of the change-scan
   schedule, never a replacement for it.

2. **`<root>.discovery.scheduler` — the due list.**
   `due_groups(registry: SourceCoverageRegistry, *, clock: Clock, now: datetime | None = None)
   -> Sequence[DueItem]` where
   `DueItem(group_id, task: Literal["CHANGE_SCAN", "COUNT_HASH_RECONCILE", "MANIFEST_RECONCILE"],
   due_since: datetime, overdue_by: timedelta, priority: int)`.
   Deterministic: identical registry + identical clock ⇒ identical ordering
   (`sorted by (priority, overdue_by desc, group_id)`), with `CRITICAL_6_12H` change scans at
   priority 1, `NORMAL_DAILY` at 2, reconciliations at 3. A group whose
   `change_detection.capability == NONE` is **never** due for a change scan (there is nothing to
   scan) but **is** due for reconciliation when declared — this is the mechanical form of PRD §12.1's
   "Sources without reliable delta mechanisms MUST show `FRESHNESS_LIMITED` rather than a false
   guarantee". A group whose `adapter_status` is `NOT_STARTED`, `PLANNED_NOT_ACTIVE` or
   `SOURCE_UNAVAILABLE` is skipped with a recorded reason rather than silently omitted.

3. **`<root>.discovery.scan` — the change scan.**
   `scan_group(adapter, ctx, *, mode) -> ScanResult` runs `adapter.discover(ctx, cursor, since)`
   where `since` comes from `RunHistoryPort.latest(group_id).last_successful_change_scan_at` and
   `cursor` from the group's persisted `discovery_state`. For every returned `RemoteDescriptor` it
   classifies against `discovery_state` (`INGF-05`'s table):

   | Condition | `DiscoveryFinding.status` |
   |---|---|
   | `descriptor_key` unseen | `NEW` |
   | seen, and `etag`/`last_modified`/`content_sha256` differ | `CHANGED` |
   | seen, conditional request returned 304, or all validators equal | `UNCHANGED` |
   | previously seen, absent from this discovery **and** a targeted request returns 404/410 | `REMOVED` |
   | previously seen, absent, and a targeted request fails transiently | `UNAVAILABLE` |

   A `REMOVED` finding **never** deletes prior state or prior versions: it is recorded, and the
   adapter's `normalise`/`validate` decide the legal-status consequence (PRD §40.8 item 3 "stable
   identity/version rules, including deletion/unavailability behaviour"). `discovery_state` rows are
   updated, never removed.

4. **Conditional requests.** Every re-check of a known descriptor sends `If-None-Match` /
   `If-Modified-Since` via `INGF-02`'s `FetchValidators`. A 304 counts as a **successful change scan**
   (it sets `last_successful_change_scan_at`) and increments `discovered_count` **without**
   incrementing `fetched_count` or writing an artifact — the separation PRD §12.1 requires between
   "last successful change scan" and "last content ingestion", and the separation `INGF-09`'s DoD
   item 9 asserts (PRD §40.8 item 9: "freshness schedule and last-check/last-ingest separation").

5. **Reconciliation passes.**
   `reconcile_counts(adapter, ctx)` — PRD §12.1's "Weekly collection count/hash reconciliation":
   re-enumerates the group's collections, compares the count and the aggregate content-hash set with
   the recorded baseline, and reports deltas to `INGF-05`'s anomaly rules (`COUNT_ANOMALY`,
   `PARSE_FAILURE_RATE` unaffected). It **flags**; it never fails the run (PRD §40.9).
   `reconcile_manifest(adapter, ctx)` — PRD §12.1's "deeper monthly manifest reconciliation": where
   the source publishes a manifest/sitemap, compares the full identity set and reports missing or
   unexpected identities as `IDENTITY_CONFLICT` findings.
   Both set `last_full_reconciliation_at` on success.

6. **Run modes (PRD §19.3).**
   - `discovery-only` — **production server**: discovery + conditional metadata requests only. It
     must not parse, normalise, embed or write artifacts; a guard raises
     `DiscoveryModeViolation` if a stage beyond `FETCH` is reached, and the mode is asserted by test.
     Its purpose is exactly PRD §19.3's "source health does not depend on the workstation being
     online".
   - `full` — **workstation**: hands each `NEW`/`CHANGED` descriptor to `INGF-05`'s `IngestionRunner`
     for the remaining PRD §40.9 stages.
   Both modes record an `ingestion_run` row with the corresponding `mode` value
   (`DISCOVERY_ONLY` / `FULL` / `INCREMENTAL`).

7. **Politeness and resource control.** Per host, `min_request_interval_ms` and
   `max_concurrent_requests` from that group's `allowlist.yaml` (`INGF-02` deliverable 1) are
   enforced by a token-bucket limiter shared across the whole scheduler process, so two groups on the
   same host cannot exceed the host's budget. Jitter of up to ±10% of the target interval is applied
   to due times so 52 groups do not stampede on the hour. A global
   `max_parallel_groups` (default 4) bounds concurrency; PRD §39.2 budgets the production host
   tightly, so the `discovery-only` default is 1.

8. **Failure handling.** A group whose scan fails transiently finishes its run `PARTIAL` with
   `FETCH_TRANSIENT_FAILURE` and does **not** advance `last_successful_change_scan_at` — a failed scan
   must never look fresh (PRD §12.1 "rather than a false guarantee"). A group whose scan fails on a
   policy denial (`FETCH_DENIED_*`) quarantines and does not retry on the same schedule tick.

9. **CLI.**
   `python -m <root>.discovery due [--adapters-root DIR] [--json]` — prints the due list;
   `python -m <root>.discovery run [--mode discovery-only|full] [--groups G,...] [--max N]` —
   executes the due items in order. Exit code is non-zero only on a scheduler-level failure, never on
   an individual group's `PARTIAL` (so a timer does not flap); the per-group outcome is in the run
   rows and in the JSON summary.

10. **Failure codes** registered with `register_failure_codes("discovery", …)`, each with an operator
    action: `DISCOVERY_MODE_VIOLATION`, `DISCOVERY_CURSOR_INVALID`,
    `DISCOVERY_DESCRIPTOR_UNSTABLE` (a descriptor key that changes between runs for the same item),
    `RECONCILE_COUNT_DELTA`, `RECONCILE_IDENTITY_MISSING`, `RECONCILE_IDENTITY_UNEXPECTED`.

## Acceptance checklist (classified)

- [ ] `[machine]` Cadence constants equal the PRD §12.1 values (6–12 h critical, ≥ daily normal,
      weekly count/hash, monthly manifest) and `CHANGE_DETECTION_TARGET_HOURS == 24` (PRD §12.1).
- [ ] `[machine]` `due_groups()` is deterministic for a fixed registry + fake clock, orders
      `CRITICAL_6_12H` before `NORMAL_DAILY` before reconciliations, and returns nothing for a group
      that was scanned within its target interval (PRD §12.1; deliverable 2).
- [ ] `[machine]` A group with `capability: NONE` is never due for a change scan, and is still due for
      a declared reconciliation (PRD §12.1 "Sources without reliable delta mechanisms…").
- [ ] `[machine]` A group whose `adapter_status` is `NOT_STARTED`, `PLANNED_NOT_ACTIVE` or
      `SOURCE_UNAVAILABLE` is skipped **with a recorded reason** in the summary, not silently omitted
      (PRD §7, §44.4).
- [ ] `[fixture]` **Change-classification matrix** replayed offline from recorded responses: unseen →
      `NEW`; changed `ETag` → `CHANGED`; 304 → `UNCHANGED`; disappeared + 404 → `REMOVED`;
      disappeared + 503 → `UNAVAILABLE`. Fixture under
      `pipelines/ingestion/tests/discovery/fixtures/` (PRD §33.4 step 1; PRD §40.8 item 7).
- [ ] `[machine]` A `REMOVED` finding deletes no `discovery_state` row and no prior version; the row
      is marked, not dropped (PRD §40.8 item 3 "deletion/unavailability behaviour").
- [ ] `[fixture]` **Conditional requests**: a re-check sends `If-None-Match`/`If-Modified-Since`; a
      304 advances `last_successful_change_scan_at` and `discovered_count` but leaves
      `last_content_ingestion_at` and `fetched_count` unchanged — the exact separation PRD §12.1 and
      PRD §40.8 item 9 require (and `INGF-09` DoD item 9 asserts).
- [ ] `[machine]` A transiently failed scan finishes `PARTIAL` and does **not** advance
      `last_successful_change_scan_at` (PRD §12.1 "rather than a false guarantee").
- [ ] `[machine]` `discovery-only` mode raises `DiscoveryModeViolation` if any stage beyond `FETCH`
      is attempted, writes no artifact, and records `mode="DISCOVERY_ONLY"` (PRD §19.3, §40.9).
- [ ] `[machine]` `full` mode hands `NEW`/`CHANGED` descriptors to `INGF-05`'s `IngestionRunner` and
      the resulting run carries the PRD §35.3 counts (PRD §40.9).
- [ ] `[machine]` **Politeness**: with `min_request_interval_ms = 1000`, two groups sharing a host
      issue requests at least 1 s apart (fake clock); `max_concurrent_requests` is never exceeded;
      jitter keeps due times within ±10% (PRD §21.1 resource limits; `INGF-02` deliverable 1).
- [ ] `[machine]` `reconcile_counts()` reports a count delta as a **FLAG** finding and does not fail
      the run; `reconcile_manifest()` reports missing/unexpected identities and both set
      `last_full_reconciliation_at` (PRD §12.1, §40.9).
- [ ] `[machine]` The scheduler writes no `detected_change` row and imports nothing from
      `packages/database` or `apps/worker` (PRD §33.4 ordering; PRD §39.1).
- [ ] `[machine]` `python -m <root>.discovery run` exits zero when an individual group is `PARTIAL`
      and non-zero only on a scheduler-level failure (deliverable 9).
- [ ] `[machine]` Every failure code in deliverable 10 is registered with a non-empty operator action
      (ADM-001, PRD §40.8 item 10).
- [ ] `[machine]` `uv run pytest` green.
- [ ] `[machine]` `pnpm test` green (unchanged — no TypeScript in this ticket).
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (**ADM-001** source health;
      supports **MON-002** by producing the change signal that `WTCH-02` fans out after promotion);
      UAT IDs — `UAT-MON-01` is `WTCH-02`/`WTCH-03`'s and depends on a *promoted* change, not on this
      scheduler; schema/API/event compatibility (none — no new file schema); tenant/PII/security
      impact (none — no customer data; all egress goes through `INGF-02`'s allowlisted fetcher);
      source/licence impact (discovery respects `INGF-04`'s gate for any body it stores);
      cost/memory/latency impact — **state the measured `discovery-only` footprint**, since PRD §39.2
      budgets the production host at 2 GiB; rollback path (disable the timer); known gaps (sub-PRD
      M1).
- **No `[human]` acceptance criteria beyond the PR contract** — every rule here is mechanically
  testable against a fake clock. Declared absent deliberately.

## Test plan

Harness: `uv run pytest pipelines/ingestion/tests/discovery -q`, fully offline. Uses `INGF-02`'s
loopback fixture server and fake resolver, `INGF-05`'s `ingestion.sqlite` on a temp path, `INGF-07`'s
synthetic registry fixtures, and a fake `Clock` for every time assertion.

1. `uv sync --frozen && uv run pytest pipelines/ingestion/tests/discovery -q`.
2. **`test_cadence.py`** — constants vs the PRD §12.1 values; SLA mapping per cadence.
3. **`test_scheduler.py`** — due-list determinism, ordering, not-yet-due suppression, `capability:
   NONE`, skipped statuses with recorded reasons, jitter bounds.
4. **`test_scan.py`** `[fixture]` — the five-outcome classification matrix replayed from
   `fixtures/scan-sequences.json`; `discovery_state` retention on `REMOVED`; descriptor-key
   instability detection.
5. **`test_conditional.py`** `[fixture]` — header assertions on the fixture server; the 304 counter
   and timestamp separation asserted on the resulting `ingestion_run` row.
6. **`test_modes.py`** — `discovery-only` violation guard, artifact-free assertion, run mode value;
   `full` mode handing off to the `IngestionRunner`.
7. **`test_politeness.py`** — token-bucket spacing across two groups on one host; concurrency cap.
8. **`test_reconcile.py`** — count-delta FLAG, manifest identity findings, timestamp updates.
9. **`test_cli.py`** — exit codes and JSON summary shape.
10. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus (concurrency-sensitive): that a failed or partial scan cannot advance a freshness
timestamp; that two concurrent group runs cannot interleave writes to one `discovery_state` row; that
the per-host limiter is genuinely shared across groups rather than per-group; and that
`discovery-only` cannot reach a stage that writes an artifact.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (docs PR/MR,
sub-PRD changelog line, then `publish-tickets.mjs --sync`), then change code.

**Foreseeable frictions and their exact writeback targets:**

1. **A source's cadence cannot be met with its declared capability** (e.g. a "critical" collection
   with no feed and a rate-limited listing) → the correct outcome is `FRESHNESS_LIMITED` on that
   group's `registry.yaml` (`INGF-07`'s schema, owned by the adapter ticket), **not** a shortened
   interval or a hidden retry loop. PRD §12.1: "MUST show `FRESHNESS_LIMITED` rather than a false
   guarantee." Record the pattern in `docs/prd/05-ingestion-framework/README.md` if it recurs across
   groups.
2. **The scheduler needs a per-group key that `registry.yaml` does not have** → the key is added in
   `INGF-07`'s schema via a ticket update (sub-PRD **D3** gives that file one owner); this ticket must
   not write `src/<root>/registry/**` and must not introduce a second scheduling file.
3. **The production host cannot run `discovery-only`** (no Python runtime, no place for
   `ingestion.sqlite`, or PRD §39.2's memory budget does not allow it) → that is sub-PRD open question
   **M1**, owner `RLSE-02`. Record the constraint in
   `docs/prd/05-ingestion-framework/README.md` M1. If discovery must move entirely to the workstation,
   that contradicts PRD §19.3's "source health does not depend on the workstation being online" and is
   a **product/architecture** change under PRD §45.5 — escalate, do not quietly drop the mode.
4. **Change classification needs adapter-specific logic** (e.g. a register whose listing page changes
   on every request) → the adapter's `discover()` normalises that away; the framework's classification
   stays generic. If the generic five-outcome model is genuinely insufficient, update this ticket's
   deliverable 3 and `INGF-01`'s `DiscoveryFinding` (a ticket change there, not a local widening).
5. **`WTCH-02` wants the change signal directly from ingestion** → refuse and point at PRD §33.4: the
   fan-out happens after promotion (step 5 → step 6), from a `DetectedChange` derived from the
   promoted release, not from a discovery finding. Record the boundary in
   `docs/prd/05-ingestion-framework/README.md` if it is challenged; changing it would let unpromoted,
   unvalidated source changes reach customers.

**Escalation rule.** If PRD §12.1's cadence/target model or PRD §19.3's split between workstation and
production discovery cannot be honoured, that overturns a stated operational requirement that
ADM-001, PRD §42.2's freshness alert and the PRD §26 "Source freshness … demonstrated" line all
depend on. Stop and escalate for re-review; never let a timestamp advance on an unsuccessful scan to
make a dashboard look green.
