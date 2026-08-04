---
id: WTCH-02
title: Detected-change matcher and single-crawl fan-out
module: 16-monitor-alerts
lane: 16-monitor-alerts
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-04, DATA-07, CRPS-06]
blocks: [WTCH-03]
---

# WTCH-02 — Detected-change matcher and single-crawl fan-out

Implements PRD §12.1, §33.4 and §8.8, requirement **MON-002** (epic `E25-MONITOR`).
No ADR — the decision is already made in PRD §8.8 (*"A single detected source change MUST fan out to
matching watchlists rather than create one crawler per watchlist"*) and PRD §33.4 steps 6–7; this is
build ticket 2 of 8 against it.
Parent sub-PRD: [16-monitor-alerts README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RUNT-04 — Worker runtime: queue classes, leases, fairness, checkpoints](../../03-app-runtime/tickets/RUNT-04-worker-runtime-queue-classes-leases-fairness-checkpoints.md), [DATA-07 — Usage, monitor, issue/correction, audit, incident tables](../../01-app-data/tickets/DATA-07-usage-monitor-issue-correction-audit-incident-tables.md), [CRPS-06 — Candidate release build and validation gates](../../04-corpus-contract/tickets/CRPS-06-candidate-release-build-and-validation-gates.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §33.4 fixes the pipeline steps and `CRPS-06` already emits the release diff this handler consumes;
this is the matching pass, not a new subsystem.

## Background + basis

**The fan-out requirement, verbatim (PRD §8.8):**

> A single detected source change MUST fan out to matching watchlists rather than create one crawler
> per watchlist.

**The change-type vocabulary is closed (PRD §8.8):**

> Changes MUST be structured as amendment, commencement, rate, replacement, appeal, guidance,
> source-removal or freshness events—not raw HTML diffs.

and PRD §32.7 closes the loophole: *"Raw HTML diffs never become customer alerts."*

**The pipeline position (PRD §33.4, steps 4–7):**

> 4. Validation either quarantines the change or includes it in a candidate CorpusRelease.
> 5. Promotion atomically changes the active release.
> 6. **Change matcher creates one `DetectedChange` and finds matching watch targets and cited Answer
>    Snapshots.**
> 7. Transaction creates tenant alerts and marks materially affected records `REVIEW_REQUIRED`.

**This ticket owns step 6 only.** Step 7 is `WTCH-03`, which is `blocked_by` this ticket — so this
handler cannot import it. Steps 1–5 are `05-ingestion-framework`, the source modules,
`04-corpus-contract` and `18-ops-release`.

**The persistence contract already exists (`DATA-07`, merged before this ticket):**

> **`detected_change` (global).** No `organization_id`; written only through `systemContext`
> (`DATA-02`); a compile-time/runtime assertion proves a tenant repository cannot be constructed for
> it. Columns: source/corpus ids, `change_type`, detection/publication/effective dates, before/after
> node and document ids, `severity` (PRD §35.6, §32.7). **This is the structural half of MON-002 —
> one row fans out to many tenants' alerts.**

PRD §35.6 states the same constraint as a table property: `detected_change` is a *"global
public-source event, not tenant content"*, and `watchlist`/`watch_target` carry *"no crawler per
watch"*.

**The input contract already exists (`CRPS-06` deliverable 8, merged before this ticket):**

> `src/build/diff.py::release_diff(parent_db | None, candidate_db) -> ReleaseDiff` — the corpus-side
> change record `WTCH-02` consumes: for each affected document,
> `{document_id, source_id, change_type: ADDED|VERSION_ADDED|TEXT_CHANGED|STATUS_CHANGED|REMOVED|
> RELATION_CHANGED, before_document_version_id, after_document_version_id,
> changed_node_version_ids[], effective_from, publication_date, severity_hint}`. Written as
> `release-diff.json` next to `gate-report.json`. … This module does **not** interpret severity for
> tenants — `severity_hint` is corpus-side only.

So the corpus side gives **six structural change kinds**; PRD §8.8 requires **eight legal change
types**. Translating one into the other, using the legal events and status data that accompany the
diff, is the core judgement of this ticket and is specified in deliverable 4.

**The freshness dates (PRD §12.1)** are the source of the eighth type:

> Customer-visible source metadata MUST separate: last discovery check; last successful change scan;
> last full reconciliation; last content ingestion; freshness status.
> … Sources without reliable delta mechanisms MUST show `FRESHNESS_LIMITED` rather than a false
> guarantee.

**The requirement (PRD §30.2):**

> | MON-002 | One detected source change fans out to matching watchlists | Internal/admin | change
> pipeline | Source/App | **N matching tenants do not trigger N crawls** |

**The UAT script (PRD §41.2):**

> | `UAT-MON-01` | Promote fixture change cited by three tenants | One DetectedChange, tenant-isolated
> alerts, affected records marked correctly |

**The worker contract (`RUNT-04`, "The A1 worker registration contract", normative here):** every
immediate child directory of `apps/worker/src/handlers/` is a handler area; the area MUST contain
`index.ts` with a default export of `JobHandlerModule`; each handler declares `type` (a
`packages/contracts` job-type enum member), `queue` (one of the five PRD §39.5 classes) and an
ordered `stages` list of `{ name, idempotent }`; `run` is called **once per stage** and returning is
the yield point; `JobContext` exposes `{ jobId, jobType, tenant, payload, attempt, checkpoint,
logger, signal }` with **no unscoped connection**; boot fails loudly on a malformed area; and
*"Adding, renaming or removing a handler area produces **zero** diff outside that area's own
directory."*

PRD §39.5 puts *"impact matching"* in the `maintenance` queue class, priority 4, "cooperative and
bounded", and `RUNT-04`'s decision **D8** confirms the placement: *"Impact matching lives in
`apps/worker/src/handlers/change-matching/**` (`WTCH-02`, `16-monitor-alerts`) and registers into the
`maintenance` class."*

**Ephemeral work never produces alerts (PRD §10.4):** *"Durable audit/export/review/version
comparison/change alerts require `SAVE` mode."*

**Accepted caveats carried forward:**

- **Nothing in the plan enqueues this job.** PRD §33.4 step 5 (promotion) is `RLSE-07`'s tool and the
  operator console is `INTL-04`; breakdown-plan §5.17 declares no edge from either to this ticket.
  This is sub-PRD open question **Q-WTCH-1**. The handler is therefore specified against an explicit
  **enqueue contract** (deliverable 2) and is fully testable by enqueuing the job directly. Do not
  add a scheduler, a poller or a filesystem watcher inside `apps/worker` to work around it.
- **The `freshness` change type has no declared producer.** `INGF-07` owns the five PRD §12.1 dates
  and `INGF-08` the discovery scheduler; neither is in this ticket's `blocked_by`. Sub-PRD open
  question **Q-WTCH-2**. Deliverable 2 accepts a second job type for it so the classification code
  exists and is tested from a fixture; wiring the producer is the writeback.
- **`severity_hint` is corpus-side only** (`CRPS-06`). This ticket derives the tenant-facing
  `severity` from the classified change type and the target kind, and records the corpus hint
  separately for operators.
- This handler is `maintenance`-class: PRD §39.5 makes it *"cooperative/bounded"*, so it must yield
  between stages and must not starve `interactive_quick`.

## Goal

Produce the `apps/worker/src/handlers/change-matching/**` handler area: a `maintenance`-class,
checkpointed job that reads one corpus release diff (or one freshness event), classifies each change
into exactly one of the eight PRD §8.8 structured types, writes one global `detected_change` row per
change through `DATA-02`'s system context, and — in the **same transaction** — emits one internal
`outbox_event` per matched `(organization_id, watchlist_id, detected_change_id)` produced by a
**single set-based matching pass** whose query count does not grow with the number of tenants.
Completion is mechanically checkable: three tenants watching the same document yield one
`detected_change` and three outbox rows; a fifty-tenant run executes the same number of queries as
the three-tenant run; the handler performs **zero** network calls; and an unclassifiable change
creates no alert intent at all.

## Non-goals

- **No alerts, no `REVIEW_REQUIRED` marking, no acknowledge/resolve** — `WTCH-03`
  (`apps/worker/src/handlers/alerts/**`, `apps/api/src/routes/alerts/**`), which is `blocked_by` this
  ticket and consumes the outbox events produced here (sub-PRD **D4**).
- **No delivery of any kind** — `WTCH-04` (email), `WTCH-05` (webhook), `WTCH-06` (digest). This
  handler sends nothing and opens no socket.
- **No watchlist or target CRUD** — `WTCH-01`.
- **No tables, migrations or repositories** — `01-app-data`/`DATA-07` (breakdown-plan **A3**;
  PRD §45.2). This ticket calls `detected_change`, `watch_target` and `outbox_event` repositories.
- **No corpus build, release diff computation, gates or promotion** — `04-corpus-contract`/`CRPS-06`
  produces `release-diff.json`; `18-ops-release`/`RLSE-07` promotes. This handler never reads
  `corpus.sqlite` directly, never writes any corpus artifact and never touches an active pointer.
- **No discovery, fetching, conditional requests or freshness computation** —
  `05-ingestion-framework` (`INGF-07`, `INGF-08`). **This is the point of the ticket:** PRD §8.8
  forbids a crawler per watch, and the way to guarantee that is a matcher with no fetch capability at
  all.
- **No worker runtime, lease loop, queue configuration or fairness arbiter** —
  `03-app-runtime`/`RUNT-04`. This ticket registers one handler area into the existing `maintenance`
  class.
- **No job scheduler or cron** — see **Q-WTCH-1**; the enqueue contract is the boundary.
- **No enum members** — `FND-03` owns `ChangeType`, `Severity` and the job-type enum.

## File-scope (write-owns)

- `apps/worker/src/handlers/change-matching/**` — the whole handler area, including `index.ts`, the
  classifier, the matcher, the fan-out writer, its fixtures and its tests under
  `apps/worker/src/handlers/change-matching/__tests__/**`.

Does not touch:

- `apps/worker/src/handlers/{alerts,notifications}/**` — `WTCH-03`, `WTCH-04`, `WTCH-05`, `WTCH-06`
  (same module, disjoint areas).
- `apps/worker/src/{main.ts,runtime,queues}/**`, `apps/worker/src/handlers/maintenance/**`,
  `apps/worker/{package.json,tsconfig.json}` — `03-app-runtime`/`RUNT-04`.
- `apps/worker/src/handlers/{answer,deep,coverage,comparison,rerun,correction,export}/**` — modules
  15, 17, 19.
- `apps/api/**`, `apps/web/**` — `WTCH-01`, `WTCH-03`, `WTCH-05`, `WTCH-07`, `WTCH-08` and other
  modules.
- `packages/database/**` (**A3**), `packages/contracts/**`, `packages/domain/**`, `packages/jobs/**`.
- `pipelines/**`, `services/search-rs/**`, `schemas/**`, `infra/**`, `tests/**`.

**Serial-safety analysis.** First decomposition — breakdown-plan §1 records `phase: 1`, nothing
merged and nothing in flight, so no file in this scope has a previous author.
`apps/worker/src/handlers/change-matching/` does not exist before this ticket and is written by no
other ticket in the plan: breakdown-plan §4 allocates
`apps/worker/src/handlers/{change-matching,alerts,notifications}/**` to this module and §5.17 splits
those three areas across `WTCH-02`, `WTCH-03` and `WTCH-04`/`WTCH-05`/`WTCH-06`. Under **A1** each
handler area is an independent directory with its own `index.ts`, so sibling areas share no file —
`RUNT-04` contract item 6 guarantees adding this area diffs nothing outside it. This ticket is in
intra-module round 1 alongside `WTCH-01`, whose scope is `apps/api/**`.

## Deliverables

1. **Handler area entry** `apps/worker/src/handlers/change-matching/index.ts` — a default-exported
   `JobHandlerModule` registering two handlers, both `queue: 'maintenance'` (PRD §39.5; `RUNT-04`
   D8), each with the ordered stages below. Job types come from `packages/contracts` (`FND-03`); if a
   member is missing, that is a `00-foundation` writeback, not a local string literal.
2. **The enqueue contract** (the boundary named in **Q-WTCH-1**/**Q-WTCH-2**), documented in
   `apps/worker/src/handlers/change-matching/CONTRACT.md` and typed in `payload.ts`:
   - `CORPUS_CHANGE_MATCHING` — `{ corpus_release_id, parent_corpus_release_id | null,
     release_diff_ref }` where `release_diff_ref` locates `CRPS-06`'s `release-diff.json` (a local
     path or an object-store key; the handler resolves it through an injected `DiffReader` port so
     tests read a committed fixture and no network is required).
   - `SOURCE_FRESHNESS_CHANGED` — `{ source_id, previous_freshness_status, freshness_status,
     last_successful_change_scan, detected_at }` (PRD §12.1's separated dates).
   - Both carry `enqueued_by` (`PROMOTION_TOOL` | `OPERATOR` | `TEST`) for audit.
   - **Job-level idempotency:** the enqueue contract requires an `idempotency_fingerprint` of
     `('CORPUS_CHANGE_MATCHING', corpus_release_id)` / `('SOURCE_FRESHNESS_CHANGED', source_id,
     detected_at)` so `DATA-05`'s unique job constraint makes a duplicate enqueue return the original
     job rather than run twice (PRD §18.5, §35.6 `job`).
3. **Stages** (`RUNT-04` deliverable 7 semantics — a stage declared `idempotent: false` that has
   already been recorded complete is never re-executed):
   1. `LOAD_DIFF` — `idempotent: true`. Reads and schema-validates the diff through `DiffReader`;
      rejects a malformed diff with a terminal failure code rather than partial processing.
   2. `CLASSIFY` — `idempotent: true`. Pure function over the diff, producing classified changes.
   3. `RECORD_AND_FANOUT` — `idempotent: false`. One transaction per bounded batch: write
      `detected_change` rows and the matched outbox rows together.
   4. `REPORT` — `idempotent: true`. Writes the operator counters (deliverable 8).
   Between stages the handler returns, which is the yield point `RUNT-04` requires so a
   `maintenance` job cannot starve `interactive_quick` (PRD §39.5).
4. **Classification into the eight PRD §8.8 types** —
   `apps/worker/src/handlers/change-matching/classify.ts`, a **pure** function
   `classify(change: CorpusChange, context: ClassificationContext): Classified | Unclassified`.
   The mapping is data, not branching prose, and each row cites the evidence it requires:

   | PRD §8.8 type | Recognised from | Notes |
   |---|---|---|
   | `AMENDMENT` | `TEXT_CHANGED` or `VERSION_ADDED` on an in-force instrument where the new version's text differs and a legal event of amending kind is present | The default legislative change |
   | `COMMENCEMENT` | `STATUS_CHANGED` into an in-force status, or a legal event carrying a commencement date | Carries `effective_date`; PRD §34.8's example event is exactly this |
   | `RATE` | An `AMENDMENT`-shaped change whose changed nodes carry the date-versioned rate/threshold facts (`SINS-01`'s model) | Distinguished before `AMENDMENT`, because a rate change is what a payroll customer watches |
   | `REPLACEMENT` | `ADDED` + `REMOVED`/superseded pair linked by a replacement relation, or a `RELATION_CHANGED` of replacement kind | Both ids are carried as before/after |
   | `APPEAL` | `RELATION_CHANGED` or `ADDED` on a decision collection carrying an appeal/treatment relation | The case-treatment signal (PRD §9.2) |
   | `GUIDANCE` | Any change whose `source_id` belongs to a guidance-role source (FWO/ATO guidance) | Informational: creates an alert, never a record transition (see `WTCH-03`) |
   | `SOURCE_REMOVAL` | `REMOVED`, or a document version withdrawn/repealed with no replacement | PRD §8.8's "source-removal" |
   | `FRESHNESS` | The `SOURCE_FRESHNESS_CHANGED` job, or a transition into `FRESHNESS_LIMITED` | PRD §12.1; carries no before/after node ids |

   Ordering is fixed and total: `FRESHNESS` → `SOURCE_REMOVAL` → `REPLACEMENT` → `APPEAL` → `RATE` →
   `COMMENCEMENT` → `AMENDMENT` → `GUIDANCE`, first match wins, and the chosen rule id is recorded on
   the row so an operator can see *why*. A change matching no rule is `UNCLASSIFIED`.
5. **`UNCLASSIFIED` handling (sub-PRD D7)** — an unclassified change is written as a
   `detected_change` row with `change_type = UNCLASSIFIED`, produces **no** matched outbox row and
   therefore no alert, and increments an operator counter with the rule-evaluation trace. It is
   **never** rendered as a text or HTML diff and never delivered (PRD §8.8, §32.7). The doc comment
   states that adding a ninth type is a PRD change (sub-PRD **Q-WTCH-8**), not a local rule.
6. **`detected_change` writing** — through `DATA-02`'s `systemContext` only (`DATA-07` deliverable 5:
   *"No `organization_id`; written only through `systemContext`"*). A deterministic
   `change_key = sha256(corpus_release_id, document_id, before_document_version_id,
   after_document_version_id, change_type)` is computed and stored so a re-run of stage
   `RECORD_AND_FANOUT` (which cannot happen under `idempotent: false`, but may under operator
   re-enqueue with a new release id) is detectable. Columns populated: source/corpus ids,
   `change_type`, detection date (`now` from the injected clock), publication date and effective date
   from the diff, before/after node and document ids, tenant-facing `severity`, plus the corpus
   `severity_hint` recorded separately.
7. **The single-pass matcher** — `apps/worker/src/handlers/change-matching/match.ts`:
   - Builds one `MatchProbe` per classified change:
     `{ document_id, node_ids[], source_id, jurisdiction, topics[], abns[] }` derived from the diff.
   - Executes a **fixed set of set-based queries over `watch_target`**, one per target kind that the
     probe can satisfy (`DOCUMENT`, `NODE`, `JURISDICTION_TOPIC`, `EMPLOYER_ABN`, `SAVED_SEARCH`,
     `RECORD_AUTHORITY`) using `DATA-07`'s normalised-key index, joined to `watchlist` for
     `active = true`, the watchlist's `event_types` containing the classified type and its
     `severity_threshold` being satisfied. **The number of queries is a function of the target-kind
     count and the batch size — never of the number of organisations, watchlists or targets.**
   - `SAVED_SEARCH` matching in this build is **coarse and declared**: a saved search matches when the
     change's jurisdiction and document type fall inside the descriptor's filters. It does **not**
     re-execute the search (no `14-search-product` runtime coupling; PRD §16.2 keeps search a metered
     read). The limitation is recorded in `CONTRACT.md` and in the sub-PRD, not hidden.
   - `RECORD_AUTHORITY` targets are already materialised as authority ids by `WTCH-01`
     (sub-PRD **D12**), so matching them needs no research-table read.
   - Results stream in bounded batches (default 500 matches per transaction, configurable per
     PRD §39.6 layer 1) so a change matching every tenant cannot hold one long transaction — the
     `maintenance` class is "cooperative/bounded" (PRD §39.5).
8. **Fan-out write, one transaction per batch (sub-PRD D4)** — for each batch, in a single
   transaction: insert/confirm the `detected_change` row(s) and insert one `outbox_event` per matched
   `(organization_id, watchlist_id, detected_change_id)` with an internal type
   `monitor.change_matched` and a payload of **identifiers only**
   (`{ detected_change_id, watchlist_id, change_type, effective_date, severity }`). Basis:
   PRD §35.8 invariant 6 — *"Outbox event and corresponding business state commit in one
   transaction"* — and PRD §18.1's database-backed outbox. The outbox type is an **internal**
   aggregate event (`DATA-05`), explicitly **not** a webhook event: `schemas/events/**` is `FND-05`'s
   serial-owned tree and only `WTCH-05` emits `alert.created`.
9. **No egress, by construction** — the area imports no HTTP client, no DNS resolver and no socket
   API. An architecture assertion over `apps/worker/src/handlers/change-matching/**` fails on any
   such import. This is the mechanical form of PRD §8.8's "rather than create one crawler per
   watchlist" and of `MON-002`'s evidence.
10. **Operator counters** (PRD §22 metric families, feeding `22-internal-admin`) recorded on the job
    and emitted through `packages/observability` (`RUNT-07`) with **no** research content:
    `changes_in_diff`, `changes_classified{type}`, `changes_unclassified`, `queries_executed`,
    `organizations_matched`, `watchlists_matched`, `outbox_rows_written`, `batches`,
    `fetches_attempted` (which must always be `0`).
11. **Committed fixtures** under `apps/worker/src/handlers/change-matching/__tests__/fixtures/`:
    - `release-diff.min.json` — a `CRPS-06`-shaped diff containing at least one instance of each of
      the six corpus change kinds, and enough legal-event/status detail to exercise every
      classification rule plus one deliberately unclassifiable change;
    - `freshness-event.json` — a `SOURCE_FRESHNESS_CHANGED` payload;
    - `expected-classification.json` — the expected `(change_key → type, rule_id)` map, so a reviewer
      can check the classification against PRD §8.8 without reading code.

## Acceptance checklist (classified)

- [ ] `[fixture]` **`UAT-MON-01`, matcher half**: replaying `release-diff.min.json` with three
      organisations each watching the same document produces **exactly one** `detected_change` row
      and **three** `monitor.change_matched` outbox rows, one per organisation, each carrying only
      identifiers (PRD §41.2 `UAT-MON-01`; PRD §33.4 step 6; **MON-002**)
- [ ] `[fixture]` Classification replay: every change in `release-diff.min.json` classifies to the
      type and rule id recorded in `expected-classification.json`, covering all eight PRD §8.8 types
      at least once (PRD §8.8)
- [ ] `[machine]` **MON-002, no per-watch crawl**: with 3 organisations and again with 50
      organisations (and 200 watch targets), `queries_executed` is **identical**, and
      `fetches_attempted` is `0` in both runs (PRD §8.8, §35.6 "no crawler per watch"; `MON-002`
      evidence *"N matching tenants do not trigger N crawls"*)
- [ ] `[machine]` No-egress architecture assertion: `apps/worker/src/handlers/change-matching/**`
      imports no HTTP client, socket, DNS or fetch API — asserted by an import-graph scan that fails
      when a client is added on a scratch branch (PRD §8.8; sub-PRD **D10** boundary)
- [ ] `[machine]` `detected_change` is global: the handler writes it through `systemContext`, the row
      has no `organization_id`, and an attempt to write it through a tenant repository fails
      (`DATA-07` deliverable 5; PRD §35.6 *"global public-source event, not tenant content"*)
- [ ] `[machine]` **Tenant isolation of the fan-out**: organisation A's outbox row is not visible to
      organisation B, and a watchlist belonging to A never appears in B's matched set — asserted with
      a three-tenant matrix (PRD §16.5, §21.2, `SEC-001`)
- [ ] `[machine]` Watchlist filters are honoured: a change whose type is absent from a watchlist's
      `event_types`, whose severity is below the `severity_threshold`, whose jurisdiction is outside
      the watchlist's set, or whose watchlist is inactive produces **no** match (PRD §32.7)
- [ ] `[machine]` **Unclassifiable change (sub-PRD D7)**: the deliberately unclassifiable fixture
      change is recorded as `UNCLASSIFIED`, produces zero outbox rows, increments
      `changes_unclassified`, and **no** code path emits a text or HTML diff — asserted by a scan for
      any diff/patch/HTML rendering import in the area (PRD §8.8, §32.7)
- [ ] `[machine]` Atomicity: an induced failure while writing the outbox rolls back the
      `detected_change` rows of that batch — no `detected_change` exists without its matched outbox
      rows, and none of a batch is half-written (PRD §35.8 invariant 6)
- [ ] `[machine]` At-least-once safety: killing the process after `RECORD_AND_FANOUT` commits and
      restarting does **not** re-execute that stage (`idempotent: false`), and a duplicate enqueue
      with the same `idempotency_fingerprint` returns the original job — a side-effect counter equals
      1 in both cases (PRD §18.5, §39.5; `RUNT-04` deliverable 7)
- [ ] `[machine]` Bounded batches: a change matching 5,000 watchlists writes in batches of the
      configured size, yields between stages, and an `interactive_quick` job enqueued mid-run starts
      within one stage boundary (PRD §39.5 "cooperative/bounded", "yield between stages")
- [ ] `[machine]` A malformed or truncated `release-diff.json` fails `LOAD_DIFF` terminally with a
      named failure code and writes **no** `detected_change` row (PRD §12.2's fail-closed discipline)
- [ ] `[machine]` **Payload minimisation (PRD §8.8)**: the outbox payload and every log line carry
      identifiers, enum values and counts only — asserted by the denylist property-name check
      (`question`, `facts`, `answer`, `short_answer`, `claim_text`, `quote`, `snippet`, `excerpt`,
      `content`, `prompt`, `reasoning`, `provider_payload`, `text`) and by a check that no complete
      customer question or answer can reach the outbox or the logger (PRD §8.8, §22)
- [ ] `[machine]` A1 conformance: the handler area registers by directory convention with **zero**
      diff outside `apps/worker/src/handlers/change-matching/`, verified with `git status
      --porcelain` after `RUNT-04`'s exported conformance harness (`RUNT-04` contract items 1–3, 6)
- [ ] `[machine]` `JobContext` discipline: no unscoped `packages/database` import in the area; every
      tenant read goes through the scoped context (PRD §45.2, `SEC-001`)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3)
- [ ] `[human]` Gate 2 founder smoke test of `UAT-MON-01` end to end (promote a fixture change cited
      by three tenants → one DetectedChange, tenant-isolated alerts, affected records marked) is run
      with `WTCH-03` and `WTCH-08`. **Not required to merge** — this ticket's automated half above is
      (PRD §41.2; CLAUDE.md Gate 2)
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable. The producer of `release-diff.json` is Python (`CRPS-06`) but is
      consumed here as committed JSON (PRD §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement **MON-002** and `UAT-MON-01`, epic
      `E25-MONITOR`; user-visible change and non-goals; schema/API/event compatibility impact (a new
      internal outbox type; **no** change to `schemas/events/**`); tenant/PII/security impact
      (`detected_change` is global and holds no tenant content; outbox payloads are identifiers only;
      the area has no egress); source/licence impact (reads a corpus diff, publishes no source text);
      cost/memory/latency impact (batch size, query count independent of tenant count, no provider
      call); rollback path (revert the area; unprocessed diffs are re-enqueueable); known gaps
      (**Q-WTCH-1** enqueue producer, **Q-WTCH-2** freshness producer, coarse `SAVED_SEARCH`
      matching)

## Test plan

Reviewer steps. Every step is offline and deterministic: injected clock, injected RNG, committed
fixtures, no network, no corpus build, no provider.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter <the apps/worker package name>`; suites under
   `apps/worker/src/handlers/change-matching/__tests__/`.
3. **Harness.** Copy the construction pattern from `RUNT-04`'s
   `apps/worker/test/handler-area-conformance.ts` and `checkpoint-resume.test.ts`: a temp-file
   `app.sqlite` migrated by `DATA-01`'s runner, `DATA-04`/`DATA-07` factories for organisations,
   watchlists and targets, `packages/jobs` lease primitives and a fake clock. `DiffReader` is stubbed
   to read `__tests__/fixtures/release-diff.min.json` from disk.
4. **Read the fixtures against the PRD.** Compare `expected-classification.json` with PRD §8.8's
   eight types and with `CRPS-06` deliverable 8's six corpus change kinds. This mapping is the one
   piece of judgement in the ticket; verifying it is the reviewer's highest-value step. Confirm every
   one of the eight types appears at least once and that the ordering in deliverable 4 is what the
   code applies (a `RATE` change must not be recorded as `AMENDMENT`).
5. **Fan-out.** Seed three organisations watching one document; run; assert one `detected_change`
   row (`SELECT count(*)`), three outbox rows, and that each row's `organization_id` differs. Then
   seed fifty organisations and 200 targets; assert `queries_executed` is unchanged from the
   three-tenant run and `fetches_attempted` is `0` in both. A matcher that loops per tenant will fail
   this test — that is its purpose.
6. **No egress.** Run the import-graph assertion. On a scratch branch add an HTTP client import to
   the area and confirm the assertion fails naming the file; discard.
7. **Filters.** Parametrise over the four exclusion cases (`event_types`, `severity_threshold`,
   `jurisdictions`, inactive) and assert zero matches for each.
8. **Unclassified.** Assert the fixture's unclassifiable change writes an `UNCLASSIFIED` row, zero
   outbox rows and a non-zero counter. Grep the area for any diff/patch/HTML library import — there
   must be none (PRD §32.7).
9. **Atomicity.** Inject a failure in the outbox insert; assert the batch's `detected_change` rows
   are absent afterwards.
10. **Resume.** Kill after `RECORD_AND_FANOUT` commits; restart; assert the stage is not re-executed
    and the outbox row count is unchanged. Re-enqueue with the same `idempotency_fingerprint`; assert
    the original job is returned.
11. **Fairness.** With a 5,000-match change running, enqueue an `interactive_quick` job and assert it
    starts within one stage boundary, reusing `RUNT-04`'s `fairness.test.ts` construction.
12. **Payload minimisation.** Run the denylist test over the outbox payload schema and the logger
    calls; confirm no free text reaches either.
13. **A1 conformance.** Run `RUNT-04`'s conformance harness against this area, then
    `git status --porcelain` — clean.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket file** (docs PR →
merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/16-monitor-alerts/README.md` (version +0.1 with a changelog line) **before** changing code.
Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**Foreseeable frictions, each with its exact writeback target:**

1. **A real source change fits none of the eight PRD §8.8 types** (sub-PRD **Q-WTCH-8**, **D7**). →
   The change is recorded `UNCLASSIFIED` and creates no alert. Then: record the observed change shape
   in `docs/prd/16-monitor-alerts/README.md` Q-WTCH-8 and escalate a **product change** (PRD §45.5)
   to add the type to the PRD and to `FND-03`'s enum, with the plan edge in
   `docs/prd/breakdown-plan.md` §6.2. **A change type that cannot be structured must not degrade into
   a raw HTML or text diff** — PRD §8.8 and §32.7 forbid it, and doing so silently would be a
   product-safety regression, not a local workaround.
2. **`CRPS-06`'s `release-diff.json` lacks a field the classifier needs** (for example the legal
   event kind that separates `AMENDMENT` from `COMMENCEMENT`, or the rate-fact marker for `RATE`). →
   The producer owns the shape. Raise a `04-corpus-contract` ticket to extend
   `CRPS-06` deliverable 8, record the agreed shape in **`docs/prd/16-monitor-alerts/README.md`** and
   in `docs/prd/04-corpus-contract/README.md`, and keep the `blocked_by` edge as it is. Do **not**
   open `corpus.sqlite` from `apps/worker` to recover the missing field: that would make the worker a
   corpus reader (PRD §39.1's process boundary) and would couple this module to the bundle layout.
3. **Nobody enqueues the job in production** (**Q-WTCH-1**). → The writeback target is
   `docs/prd/breakdown-plan.md` §5.19/§5.23 plus §6.2 (a new edge from `RLSE-07` or `INTL-04`).
   Do **not** add a poller, cron or filesystem watcher to `apps/worker/src/handlers/change-matching`:
   scheduling is `RUNT-04`'s runtime and promotion is `18-ops-release`'s tool.
4. **The freshness producer does not exist** (**Q-WTCH-2**). → Keep the `SOURCE_FRESHNESS_CHANGED`
   handler and its fixture; record the missing producer in
   `docs/prd/16-monitor-alerts/README.md` Q-WTCH-2 and raise the edge in
   `docs/prd/breakdown-plan.md` §5.6/§6.2. Never compute freshness here — PRD §12.1's five dates are
   `INGF-07`'s.
5. **Coarse `SAVED_SEARCH` matching produces false positives or misses.** → Record the measured
   behaviour in `docs/prd/16-monitor-alerts/README.md`. Executing the saved search at match time
   would give this handler a retrieval dependency and a per-watch execution cost — the exact shape
   PRD §8.8 forbids. If precise matching is genuinely required, it needs a plan change
   (`docs/prd/breakdown-plan.md` §5.17/§6.2, a `blocked_by` edge on `11-retrieval-engine`) and an ADR
   under `docs/adr/`, not a local search call.
6. **`DATA-07` has no way to write `outbox_event` in the same transaction as `detected_change`.** →
   PRD §35.8 invariant 6 requires it, so this is an `01-app-data` gap: raise a `01-app-data` ticket,
   add the edge in `docs/prd/breakdown-plan.md` §5.2/§6.2, and record it here. Do **not** write
   `packages/database/**` (breakdown-plan **A3**, risk **R4**) and do **not** commit the two in
   separate transactions.
7. **The single-pass matcher is too slow at real scale.** → That is a **benchmark-selected
   configuration** question (PRD §45.5): tune the batch size and the index usage, record the measured
   numbers in the PR's cost/memory/latency line (PRD §45.4) and in
   `docs/prd/16-monitor-alerts/README.md`. A per-tenant loop is never the answer — it is the thing
   `MON-002` forbids.

**Escalation.** PRD §8.8's *"A single detected source change MUST fan out to matching watchlists
rather than create one crawler per watchlist"* and PRD §32.7's *"Raw HTML diffs never become customer
alerts"* are the two release requirements behind this module. If either is outright falsified — for
example if matching genuinely cannot be done without a per-watch fetch — stop, raise an ADR under
`docs/adr/`, write back to `docs/prd/16-monitor-alerts/README.md` and
`docs/prd/breakdown-plan.md` §5.17, and escalate to the human before any code lands. Never introduce
a per-watchlist fetch or an unstructured diff inside this ticket.
