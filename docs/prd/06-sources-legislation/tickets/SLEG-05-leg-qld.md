---
id: SLEG-05
title: "`LEG-QLD`"
module: 06-sources-legislation
lane: 06-sources-legislation
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [SLEG-01]
blocks: [SINS-09, SADJ-04, SFUT-05, GOLD-09, GOLD-16]
---

# SLEG-05 — `LEG-QLD`

Implements PRD §40.2 (`LEG-QLD` source group), PRD §6.3 (state and territory scope) and PRD §40.8
(adapter Definition of Done) <SRCH-002, SRCH-003, SRCH-005; supports ADM-001, SEC-002> — no ADR — the
decision is already made in PRD §40.2; this is build ticket 5 of 10 against it.
Parent sub-PRD: [06-sources-legislation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [SLEG-01 — Legislation adapter primitives (point-in-time, events, title allowlist)](SLEG-01-legislation-adapter-primitives-point-in-time-events-title-allowlist.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §40.7's eight boundaries and PRD §40.8's twelve-item checklist — not a new subsystem decision.

## Background + basis

**The PRD §40.2 row for this group, verbatim:**

| Group ID | Jurisdiction/official entry | Required document families | Minimum adapter capability | Initial tier |
|---|---|---|---|---|
| `LEG-QLD` | Queensland Legislation — <https://www.legislation.qld.gov.au/> | Bills, Acts, subordinate legislation, point-in-time reprints, future annotations | HTML/XML/PDF discovery; versions/events | T1 employment scope |

and the scoping rule that closes PRD §40.2:

> "Wave 1 is scoped to employment-related titles and their necessary amending, commencement,
> transitional and interpretation instruments—not every unrelated law in each register. A maintained
> subject/title allowlist plus dependency expansion records why each title is included."

**PRD §6.3 fixes what "employment-related" means for Queensland** — this is the ticket's subject
scope, quoted in full because `titles.yaml` is judged against it:

> "For NSW, Victoria, Queensland, Western Australia, South Australia, Tasmania, the ACT and the
> Northern Territory:
> - payroll tax legislation, rates and official guidance;
> - employment and industrial-relations legislation and guidance;
> - long-service leave;
> - WHS/OHS;
> - discrimination and equal opportunity;
> - workers compensation;
> - labour hire licensing;
> - portable long-service leave;
> - workplace surveillance and employment-related privacy;
> - whistleblowing;
> - child employment;
> - public-sector employment;
> - relevant regulators, courts and tribunals."

Only the **legislation** in that list is this ticket's: Queensland Acts, subordinate legislation and
their commencement/amendment/repeal history. Rates and official guidance are
`07-sources-instruments` (`PT-QLD`), regulator material is `09-sources-adjacent` (`ADJ-QLD`), and
courts/tribunals are `08-sources-cases` — all three build on the legislation this ticket ingests
(sub-PRD **D7**).

**PRD §40.8 is the Definition of Done, verbatim.** "For each source group, the implementation PR must
provide:"

> 1. registry row(s), official URL allowlist and licence snapshot/assessment;
> 2. discovery fixture and live dry-run evidence;
> 3. stable identity/version rules, including deletion/unavailability behaviour;
> 4. representative HTML/XML/JSON/PDF fixtures without customer data;
> 5. parser/node hierarchy and exact-text round-trip tests;
> 6. historical/effective/status/event behaviour for at least three time points;
> 7. incremental no-change, changed, removed and transient-failure tests;
> 8. count/hash baseline and anomaly thresholds;
> 9. freshness schedule and last-check/last-ingest separation;
> 10. quarantine cases and operator recovery action;
> 11. retrieval/citation evaluation subset;
> 12. measured storage, parse time, index size and peak memory.

PRD §45.4 makes it a merge gate. `INGF-09` implements all twelve as `ConformanceTestCase`.

**What makes Queensland distinctive.** The row names **point-in-time reprints** and **future
annotations**, and a minimum capability of **HTML/XML/PDF discovery**. Three consequences:

1. **Reprints are the version series.** Each reprint is a `DocumentVersion` with its own
   `version_label`, `effective_from`/`effective_to` and `content_hash` (PRD §35.2), and the series
   must satisfy PRD §35.2's "non-overlap validation where versions represent consolidated effect" —
   `SLEG-01`'s `assert_no_overlap` makes an overlap a **BLOCK** finding (PRD §40.9: "any overlapping
   effect interval for a supposedly consolidated series").
2. **Future annotations mark amendments that are enacted but not yet commenced.** PRD §6.7 has
   `ENACTED_NOT_IN_FORCE` precisely for that, and PRD §15.2 requires the status to be derived from the
   evidenced event — so a future annotation is parsed as evidence for a `COMMENCEMENT` event with a
   future `effective_date`, not as prose. What this adapter must **not** do is build the current-vs-
   future separation model or ingest bills: that is `SFUT-05` (`FUTURE-QLD`), which is `blocked_by`
   this ticket (sub-PRD **D6**; PRD §40.6, PRD §6.5).
3. **Three formats in one group.** HTML, XML and PDF discovery means `supported_content_types` has
   three entries, and `INGF-09`'s DoD item 4 requires a representative fixture for **every** declared
   type. All parsing goes through `INGF-06`'s isolated host (PRD §37.4).

**PRD §40.1 says a roster row is not coverage:** "Every row starts `NOT_STARTED` and must become
`ACTIVE` or an explicit customer-visible limited state before release. The live Source Coverage
Registry will expand each group into exact collections/endpoints, licence snapshots, formats, counts,
date bounds, schedules and gaps." Expanding this group into exact endpoints is deliverable 1.

**PRD §7 and §12.1 give the only honest exits, and the policy governing them is settled.** Plan §8
**Q10** is a **confirmed policy** (sub-PRD **D13**): no mandatory source group is pre-selected for
omission or reduced implementation, every Commonwealth, state and territory mandatory group in the
approved MVP scope must be attempted in full, and arbitrary scope reduction to make a release date
easier is not permitted. `LEG-QLD` is therefore built in full; a limited state is never a way to
make this ticket smaller. A limited state is permitted **only** where measured evidence shows a
genuine limitation prevents `ACTIVE` — an official capability limit, the official body not publishing
the material, a licensing restriction, historical material unavailable, a freshness limitation, or
another real official-source constraint. Where that is measured, the group takes an explicit status
(`METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED` or `SOURCE_UNAVAILABLE`)
with a customer-visible gap **and** `INGF-07`'s non-null `limitation` block recording the evidence,
the affected dates or collections, the customer-visible warning and why full coverage is unavailable,
plus a sub-PRD update. Silent omission is prohibited, and no unofficial source or commercial headnote
may substitute for unavailable official material. PRD §44.4: "It is not permitted to silently call an
unimplemented source category covered." That is sub-PRD decision **D8**: a **writeback**, never a
silent downgrade. `GOLD-16` produces the measured evidence and the proposed registry state and
`LNCH-05` verifies that the launch statement discloses it; Gate 2 is the verification and sign-off
step under this policy, not an opportunity to cut mandatory scope.

**PRD §44.2 epic `E10-LEG-STATES`**, week 2, exit evidence *"Each group has independent DoD/report"*.

**Downstream (plan §6.2): `SLEG-05 --> SINS-09 & SADJ-04 & SFUT-05 & GOLD-09 & GOLD-16`.**
`SINS-09` (`PT-QLD`, Queensland Revenue Office) adds dated rates, thresholds, the levy and rulings on
top of the payroll-tax **legislation** this ticket ingests. `SADJ-04` (`ADJ-QLD`: WHS Queensland/OIR,
QHRC, WorkCover Queensland, Labour Hire Licensing Queensland, QLeave and public-sector authorities)
adds regulator material on top of the WHS, discrimination, workers-compensation, labour-hire and
portable-LSL **legislation** this ticket ingests. `SFUT-05` (`FUTURE-QLD`) adds future-status events.
`GOLD-09` authors state/territory evaluation cases against real corpus IDs; `GOLD-16` reconciles.

**What the framework already provides — do not rebuild it.** `INGF-01` (protocol, `AdapterMeta`,
`AdapterRunContext`, envelope, record re-exports, `register_failure_codes`, `ADAPTER` loading);
`INGF-02` (`allowlist.yaml` schema, the only permitted HTTP path); `INGF-03` (artifact store);
`INGF-04` (`licence.yaml` schema, snapshot capture, permitted-use gate); `INGF-05` (run accounting,
quarantine reasons, the §40.9 stage runner, anomaly policy); `INGF-06` (isolated parser/OCR host,
`assert_roundtrip`); `INGF-07` (`registry.yaml` schema, roster, freshness composition); `INGF-09` (the
twelve DoD checks, `ReplayFetcher`, `ReplayClock`, `replay_context`, the reference adapter and the
authoring guide). `SLEG-01` provides `_shared.legislation` (`resolve_as_at`, `assert_no_overlap`,
`build_event`, `derive_status`, `stable_node_key`, `NodeTree`, `diff_nodes`, `load_titles`,
`FinancialYearWindow`, `legislation_findings`) and its consumer guide. **Read both guides first.**

**Carried caveats, documented not re-litigated.** Per-source anomaly thresholds are initial defaults
until a representative baseline (plan §8 **Q9**, sub-PRD **L3**); overrides may only tighten, and a
genuinely looser percentage is a writeback to `GOLD-16`, never a local override. DoD item 11
may report `DEFERRED(GOLD-16)` (sub-PRD **L8**); `evals/gold/**` is never read (plan §9 **R9**, PRD
§45.1 item 6). `max_quote_chars` and the licence status are Founder calls (sub-PRD **L7**). No
consolidation is ever synthesised (sub-PRD **D10**).

## Goal

Deliver the `LEG-QLD` source adapter under `pipelines/adapters/leg-qld/**`: the group's
`registry.yaml`, `allowlist.yaml`, `licence.yaml` + immutable `licence-snapshots/`, a `titles.yaml`
subject/title allowlist over the PRD §6.3 Queensland employment scope, `conformance.yaml`, and an
`adapter.py` exposing `ADAPTER: SourceAdapter` that implements all eight PRD §40.7 boundaries over
Queensland Legislation — discovering Acts, subordinate legislation and their point-in-time reprints
across HTML/XML/PDF, emitting a non-overlapping reprint version series with exact-text round-trip, and
evidenced `LegalEvent`s including future-annotation-backed commencements with a future
`effective_date` — together with the recorded fixtures that make
`python -m <root>.conformance check pipelines/adapters/leg-qld` exit `0` in **strict** mode with all
twelve PRD §40.8 items passing offline, and a `conformance-report.json` attached to the PR.

## Non-goals

- **No shared legislation primitive.** Point-in-time resolution, status derivation, node lineage, the
  `titles.yaml` schema and the FLAG/BLOCK table are `SLEG-01`'s. A helper this adapter wants is added
  **there** as a new sibling ticket, never copied here — plan §9 **R2**.
- **No ingestion-framework change**, and no HTTP, PDF or OCR library in this directory — `INGF-02` and
  `INGF-06` own them, and the architecture scan fails the build on a direct import (PRD §37.4).
- **No Queensland payroll-tax rates, thresholds, levy, rulings or guidance** — `07-sources-instruments`
  / `SINS-09` (`PT-QLD`), which is `blocked_by` this ticket. This ticket ingests the payroll-tax
  **legislation** only (sub-PRD **D7**).
- **No WHS Queensland/OIR, QHRC, WorkCover Queensland, Labour Hire Licensing Queensland or QLeave
  material** — `09-sources-adjacent` / `SADJ-04` (`ADJ-QLD`), which is `blocked_by` this ticket.
- **No QIRC, Industrial Court or Queensland court decisions, and no state awards or operative
  industrial instruments** — `08-sources-cases` / `SCAS-08` (`CASE-QLD`), whose PRD §40.4 row covers
  "QIRC decisions, state awards/instruments".
- **No Bills, draft instruments, consultations or the current-vs-future separation model** —
  `10-sources-future` / `SFUT-05` (`FUTURE-QLD`), which is `blocked_by` this ticket. PRD §40.2 lists
  Bills among the register's document families, but PRD §40.6 assigns future status to `FUTURE-QLD`
  and PRD §6.5 requires future material to be separated and labelled. This adapter records a
  future-annotation-backed `COMMENCEMENT` event with a future `effective_date` and derives
  `ENACTED_NOT_IN_FORCE` from it — PRD §15.2 requires status to follow the evidence — and stops there
  (sub-PRD **D6**).
- **No corpus write, chunking, tiering or embedding.** PRD §40.7.
- **No evaluation cases or gold answers** — `21-evaluation-600` / `GOLD-09`.
- **No live network in CI** — sub-PRD **D12**.
- **No tenant, customer or app-database access.** PRD §39.1. Standing rule, not a deferral.

## File-scope (write-owns)

- `pipelines/adapters/leg-qld/**` — the whole group directory, in the layout `INGF-07` deliverable 1
  fixes and `INGF-09` deliverable 7 demonstrates:

  ```text
  pipelines/adapters/leg-qld/
  ├── registry.yaml                          # schema: INGF-07
  ├── allowlist.yaml                         # schema: INGF-02
  ├── licence.yaml                           # schema: INGF-04
  ├── licence-snapshots/<date>-<hash>.<ext>  # written by INGF-04's capture CLI
  ├── titles.yaml                            # schema: SLEG-01
  ├── conformance.yaml                       # schema: INGF-09 (optional overrides)
  ├── adapter.py                             # module-level `ADAPTER: SourceAdapter` (INGF-01)
  ├── fixtures/{discovery,documents,timepoints,quarantine}/, baseline.json, dry-run.json
  └── tests/                                 # test_conformance.py + adapter unit tests
  ```

- `pipelines/adapters/pyproject.toml` — **shared-additive, append-only** across modules `06`–`10`
  (sub-PRD **D3**); this ticket appends nothing. Conflicts resolve by re-running `uv lock`, never by
  hand-merge (plan §1.1, PRD §44.3).
- Does not touch: `pipelines/adapters/_shared/legislation/**` — `SLEG-01` (same module, wave 1).
- Does not touch: `pipelines/adapters/leg-{cth,nsw,vic,wa,sa,tas,act,nt}/**` — `SLEG-02`…`SLEG-04`,
  `SLEG-06`…`SLEG-10` (same module, concurrent wave-2 lanes).
- Does not touch: `pipelines/adapters/pt-qld/**` (`SINS-09`), `pipelines/adapters/adj-qld/**`
  (`SADJ-04`), `pipelines/adapters/future-qld/**` (`SFUT-05`), `pipelines/adapters/case-qld/**`
  (`SCAS-08`), `pipelines/adapters/_shared/{rates,caselaw,future}/**` — modules `07`–`10`.
- Does not touch: `pipelines/ingestion/**` — `05-ingestion-framework`.
- Does not touch: `pipelines/corpus-builder/**`, `pipelines/embeddings/**`,
  `schemas/corpus-manifest/**` — `04-corpus-contract`.
- Does not touch: `pipelines/evaluation/**`, `evals/**` — `21-evaluation-600`. `evals/gold/**` is not
  even read (plan §9 **R9**).
- Does not touch: `packages/**`, `apps/**`, `services/**`, `infra/**`, `schemas/{openapi,events}/**`,
  `tests/**`, `.github/workflows/**`, root manifests and lockfiles.

**Serial safety.** This is the **first decomposition** of `docs/PRD.md` (plan §1 header: `phase: 1`,
`existingFiles: ['.gitkeep']`); nothing is merged and no ticket is in flight, so no prior ticket has
touched `pipelines/adapters/leg-qld/**`. The only writers anywhere under `pipelines/adapters/` before
this ticket are `FND-01` (the member manifest) and `SLEG-01` (`_shared/legislation/**` plus the
manifest), both of which must have landed — this ticket is `blocked_by SLEG-01`. **Sibling adapter
scopes are disjoint by construction:** plan §4 gives this module one directory per PRD §40.2 group id,
each owned by exactly one ticket, and `INGF-07`'s A2 layout keeps every per-group artefact inside its
own directory. The eight concurrent sibling lanes share exactly one path with this ticket,
`pipelines/adapters/pyproject.toml`, which is append-only and which none of them expects to modify.

## Deliverables

1. **`registry.yaml` — the Source Coverage Registry row (PRD §40.8 item 1, PRD §6.1).** Validated by
   `python -m <root>.registry validate pipelines/adapters/leg-qld`. All nine PRD §6.1 attributes:
   `group_id: LEG-QLD`, `wave: 1`; the register's responsible `authority` with `jurisdiction: QLD` and
   `official_url: https://www.legislation.qld.gov.au/`; `official_endpoints` — the **exact
   collections/listings this adapter actually calls**, each with `kind` and `material_class` (PRD
   §40.1); `document_coverage.families` covering the PRD §40.2 required families — Acts, subordinate
   legislation, point-in-time reprints, future annotations — and `financial_years` covering at least
   `2024-25`, `2025-26`, `2026-27` (PRD §6.6) or a `customer_visible: true` gap; `licence_ref`;
   `allowlist_ref`; `adapter_status` — `ACTIVE`, or one of PRD §7's four limited
   states, which is permitted **only** on measured evidence of a genuine official-source limitation
   and then requires both a `customer_visible: true` `known_gaps` entry and `INGF-07`'s non-null
   `limitation` block (`state` equal to `adapter_status`; a `reason_code` from the closed set
   `OFFICIAL_CAPABILITY_LIMIT | MATERIAL_NOT_PUBLISHED | LICENSING_RESTRICTION |
   HISTORICAL_MATERIAL_UNAVAILABLE | FRESHNESS_LIMITATION | OTHER_OFFICIAL_SOURCE_CONSTRAINT`; a
   mandatory `reason_detail`; at least one `evidence` entry; `affected` dates or collections; and a
   `customer_visible_warning`) — sub-PRD **D8**/**D13**, plan §8 **Q10**; `initial_index_tier: T1`;
   `change_detection.{capability,cadence,supports_conditional_requests,reconciliation}` reflecting the
   **measured** capability of those endpoints (PRD §12.1); `known_gaps`; `evaluation_subset_ref` for
   `GOLD-09`/`GOLD-16`.

2. **`allowlist.yaml` (PRD §40.8 item 1, `SEC-002`, PRD §37.4).** `schemes: [https]` only; the
   register's host(s) with explicit `path_prefixes` covering exactly the `official_endpoints`; polite
   `min_request_interval_ms` and `max_concurrent_requests`; `approved_max_bytes` only with a written
   `approved_max_bytes_reason` (PDF reprints of long Acts can exceed `INGF-02`'s 50 MiB default; PRD
   §37.4 allows only a documented "source-specific approved limit"). The adapter reaches the network
   only through `ctx.fetcher`; `ReplayFetcher` refuses a fixture URL outside this file.

3. **`licence.yaml` + `licence-snapshots/` (PRD §40.8 item 1, PRD §11.1, PRD §35.3).** Capture the
   register's terms with `python -m <root>.licensing capture pipelines/adapters/leg-qld --terms-url
   <official terms URL>`; the stored file's SHA-256 must equal `snapshot.terms_sha256`. State all nine
   PRD §11.1 axes independently plus `attribution_text`, `max_quote_chars` and one of the six PRD
   §11.1 states. Unclear rights are `UNCLEAR_RESTRICTED` — "Unclear rights default to metadata,
   limited quotation and official links" — collapsed conservatively by `INGF-04`'s gate. Never assume
   permission from the tier (PRD §40.1).

4. **`titles.yaml` — the PRD §40.2 subject/title allowlist (`SLEG-01`'s schema, sub-PRD D5/D7).**
   `subjects` covering the PRD §6.3 Queensland topics quoted above. One entry per included title with
   `stable_source_key`, `canonical_title`, `document_type` and an `inclusion` reason (`SUBJECT_MATCH`
   naming the subject, or `DEPENDENCY_EXPANSION` naming `depends_on` and a `dependency_kind` of
   `AMENDING | COMMENCEMENT | TRANSITIONAL | INTERPRETATION | SUBORDINATE`). `adapter.discover()`
   refuses a title with no recorded reason via `unexplained_titles()`.

5. **`adapter.py` — `ADAPTER: SourceAdapter` implementing the eight PRD §40.7 boundaries.**
   `AdapterMeta(group_id="LEG-QLD", adapter_key="leg-qld", jurisdiction="QLD", authority_id=…,
   adapter_version="0.1.0", supported_content_types=[…HTML, XML and PDF media types…],
   declared_quarantine_reasons=[…])`.
   - `discover(ctx, cursor, since)` — over the `official_endpoints` across HTML/XML/PDF, enumerating
     each allowlisted title's **reprint history**, with conditional requests where supported. Yields
     `RemoteDescriptor`s whose `descriptor_key` identifies *title + reprint*, since a Queensland title
     has many reprints.
   - `fetch(ctx, descriptor, validators)` — `ctx.fetcher` only, passing `FetchValidators`.
   - `identify(ctx, artifact)` — `stable_source_key` is the register's permanent identifier for the
     **title**, stable across reprints; the reprint distinction lives in
     `DocumentVersion.version_label` (PRD §35.2). Never a URL, never a display title, never a content
     hash.
   - `parse(ctx, artifact)` — through `ctx.parser` (`INGF-06`) only, for all three formats;
     `ParsedBlock` offsets satisfy the exact-text round-trip.
   - `normalise(ctx, parsed, identity)` — builds `DocumentVersionRecord` + `NodeVersionRecord`s via
     `NodeTree`/`stable_node_key`, setting `version_label` (the reprint identifier),
     `publication_date`, `effective_from`/`effective_to`, `content_hash`, `official_url`,
     `retrieved_at` and `legal_status` from `derive_status`.
   - `extract_events(ctx, normalised)` — `LegalEventRecord`s for commencement, amendment, repeal and
     as-made registration, each built through `build_event` so an unevidenced event cannot be
     constructed. **A future annotation in a reprint is parsed as evidence for a `COMMENCEMENT` event
     whose `effective_date` is in the future**, from which `derive_status` yields
     `ENACTED_NOT_IN_FORCE` at today's date (PRD §6.7, §15.2). `event_date` and `effective_date` stay
     independent.
   - `extract_relations(ctx, normalised)` — from `diff_nodes` plus the reprint's own amend/renumber
     annotations; `confidence_state` is never `MODEL_SUGGESTED` (PRD §35.2).
   - `validate(ctx, candidate, prior)` — returns `legislation_findings(...)`, which makes an
     overlapping reprint interval a **BLOCK**.
   The module imports no HTTP or parsing library — enforced by `INGF-01`/`INGF-02`'s architecture scan.

6. **`fixtures/discovery/` + `fixtures/dry-run.json` (DoD item 2).** ≥1 recorded discovery response
   per `official_endpoints` entry, so replay yields ≥1 `RemoteDescriptor` with a non-empty
   `descriptor_key` and an allowlisted URL. `dry-run.json` carries `{run_at, descriptors_discovered,
   sample_urls, tool_versions}` from a **one-time live** run, `run_at` inside
   `DRY_RUN_MAX_AGE_DAYS = 180`.

7. **`fixtures/documents/` (DoD items 4 and 5).** Representative artefacts for **every** declared media
   type — HTML, XML and PDF — including at least one reprint that carries a **future annotation**.
   Public official material only, and **no customer data**: the item-4 scanner rejects
   TFN/ABN-with-name/email/phone/credential patterns, `Set-Cookie` or `Authorization` captures and
   `.env`-shaped content. Each fixture parses through `INGF-06`'s host, satisfies `assert_roundtrip()`,
   and yields a node hierarchy with one root, no cycles, contiguous sibling ordinals and recomputable
   `text_hash`es.

8. **`fixtures/timepoints/` (DoD item 6).** ≥3 legal dates, one in each PRD §6.6 financial year
   (2024–25, 2025–26, 2026–27), for at least one title with a real reprint history — a Queensland
   employment, WHS or payroll-tax Act is the natural choice, since `SINS-09` and `SADJ-04` depend on
   it. For each date: a reprint whose interval brackets it, a `legal_status` from PRD §6.7's seven
   values backed by an evidence event, and `event_date`/`effective_date` distinguished. **At least one
   case must exercise `ENACTED_NOT_IN_FORCE` from a future annotation.** No two reprints of the same
   series may overlap (PRD §35.2, §40.9).

9. **Incremental scenarios (DoD item 7).** Four recorded scenarios: **no-change** (304 → zero fetched,
   zero quarantined, `last_successful_change_scan_at` advanced, `last_content_ingestion_at`
   unchanged); **changed** (a new reprint emitted, prior reprint's `effective_to` closed via
   `close_prior_version`); **removed** (a descriptor that disappears yields a `REMOVED` finding and
   **retains** prior state — PRD §40.8 item 3); **transient failure** (5xx/timeout → bounded retry
   then `FETCH_TRANSIENT_FAILURE`, run `PARTIAL`, no content quarantine).

10. **`fixtures/baseline.json` + `conformance.yaml` (DoD items 8 and 12).** `baseline.json` records
    `{collections: {name: {count, content_hash_set_sha256}}, captured_at}` and the replayed run must
    reproduce it exactly. `conformance.yaml` carries `resource_ceilings` (`storage_bytes`,
    `parse_wall_ms`, `index_size_estimate_bytes`, `peak_rss_bytes`; PRD §39.2 budgets the host at
    2 GiB) and any `anomaly_overrides`, which may only **tighten** the PRD §40.9 defaults. Plan §8
    **Q9** stands.

11. **Freshness declaration (DoD item 9).** `registry.yaml.change_detection` plus recorded runs
    proving the PRD §12.1 separation: a 304 run advances `last_discovery_check_at` /
    `last_successful_change_scan_at`; only a content run advances `last_content_ingestion_at`. Cadence
    is one of `CRITICAL_6_12H | NORMAL_DAILY | WEEKLY_RECONCILE | MONTHLY_MANIFEST`; a primary state
    register is a critical collection unless the endpoint capability genuinely cannot support it — in
    which case **D8** applies.

12. **`fixtures/quarantine/` and failure codes (DoD item 10).** ≥1 deliberately defective artefact per
    code in `declared_quarantine_reasons`, each producing exactly that code, each code carrying a
    non-empty operator action. **Include an overlapping-reprint fixture** mapping to
    `EFFECT_INTERVAL_OVERLAP` (PRD §40.9's critical time failure). Reuse `SLEG-01`'s `legislation`
    codes and `INGF-05`'s framework codes first.

13. **`tests/test_conformance.py` — the five-line file `INGF-09` deliverable 1 fixes:**

    ```python
    from pathlib import Path
    from aer_ingestion.conformance import ConformanceTestCase

    class TestLegQld(ConformanceTestCase):
        group_dir = Path(__file__).resolve().parents[1]
    ```

    plus adapter-specific unit tests. No `test_dod_*` method may be overridden.

14. **`conformance-report.json` attached to the PR** — from
    `python -m <root>.conformance check pipelines/adapters/leg-qld`, `strict: true`, exit `0`.

## Acceptance checklist (classified)

**PRD §40.8 Definition of Done — all twelve items.**

- [ ] `[machine]` **DoD 1 — registry row, allowlist, licence.** All three files exist and validate
      through `INGF-07`/`INGF-02`/`INGF-04`; `group_id` is `LEG-QLD` and is in
      `MANDATORY_SOURCE_GROUPS`; the directory name equals `group_id.lower()`; the snapshot file's
      SHA-256 equals `snapshot.terms_sha256`; every `official_endpoints` URL passes the allowlist
      (PRD §40.8 item 1, §6.1, §11.1).
- [ ] `[machine]` **Source Coverage Registry row is complete and composable.**
      `compose_registry(mode="release")` reports no `MANDATORY_GROUP_MISSING` for `LEG-QLD`, no
      `REGISTRY_GAP_NOT_VISIBLE` and no `REGISTRY_ENDPOINT_NOT_ALLOWLISTED`; all nine PRD §6.1
      attributes present; every endpoint has a `material_class`; `adapter_status` satisfies
      `is_release_acceptable()`. When `adapter_status` is one of the four limited states the row also
      carries a valid `limitation` block, so composition reports no `REGISTRY_LIMITATION_MISSING`,
      `REGISTRY_LIMITATION_UNEVIDENCED`, `REGISTRY_LIMITATION_SCOPE_MISSING` or
      `REGISTRY_LIMITATION_WARNING_MISSING`; an `ACTIVE` row carries no `limitation` at all
      (PRD §6.1, §7, §40.1, §44.4; plan §8 **Q10**; sub-PRD **D13**; `ADM-001`).
- [ ] `[fixture]` **DoD 2 — discovery fixture and live dry-run evidence** (PRD §40.8 item 2).
- [ ] `[fixture]` **DoD 3 — stable identity, versions, deletion/unavailability.** `identify()` is
      deterministic across two calls and stable across two **reprints** of the same title; different
      titles yield different `stable_source_key`s; a removed descriptor produces a `REMOVED` finding
      and deletes no prior state (PRD §40.8 item 3).
- [ ] `[fixture]` **DoD 4 — representative fixtures without customer data**, covering **all three**
      declared media types (HTML, XML, PDF); the no-customer-data scan finds nothing
      (PRD §40.8 item 4, §19.2, §35.3).
- [ ] `[fixture]` **DoD 5 — parser/node hierarchy and exact-text round-trip** for every fixture, in
      every format; one root, no cycles, contiguous sibling ordinals, recomputable `text_hash`es
      (PRD §40.8 item 5, §15.3, §35.2; `SRCH-003`).
- [ ] `[fixture]` **DoD 6 — three time points**, one in each of 2024–25, 2025–26 and 2026–27, each
      resolving to a reprint whose interval brackets it with a PRD §6.7 status backed by an evidence
      event and `event_date`/`effective_date` distinguished; **at least one `ENACTED_NOT_IN_FORCE`
      case derived from a future annotation**; no two reprints of a series overlap
      (PRD §40.8 item 6, §6.6, §6.7, §15.2, §35.2).
- [ ] `[fixture]` **DoD 7 — incremental matrix.** The four scenarios each produce their expected counts
      and run status; the transient-failure case creates **no** content quarantine item
      (PRD §40.8 item 7).
- [ ] `[fixture]` **DoD 8 — count/hash baseline and anomaly thresholds.** The replayed run reproduces
      `fixtures/baseline.json` exactly; `anomaly_overrides` pass `AnomalyPolicy.for_group()` —
      tighten-only (PRD §40.8 item 8, §40.9).
- [ ] `[fixture]` **DoD 9 — freshness schedule, last-check/last-ingest separation** (PRD §40.8 item 9,
      §12.1).
- [ ] `[fixture]` **DoD 10 — quarantine cases and operator recovery**, including the overlapping-reprint
      fixture mapping to `EFFECT_INTERVAL_OVERLAP`; every code has a non-empty `operator_action`
      (PRD §40.8 item 10, §40.9; `ADM-001`).
- [ ] `[machine]` **DoD 11 — retrieval/citation evaluation subset.** `evaluation_subset_ref` non-empty
      and well-formed; ids resolve against `evals/cases/**` when it exists, otherwise
      `DEFERRED(GOLD-16)` with a recorded reason. `evals/gold/**` is never read (PRD §40.8 item 11;
      plan §9 **R9**).
- [ ] `[fixture]` **DoD 12 — measured storage, parse time, index size and peak memory**, all four
      recorded, non-zero and within this group's ceilings (PRD §40.8 item 12, §39.2).
- [ ] `[fixture]` **The kit as a whole.** `python -m <root>.conformance check
      pipelines/adapters/leg-qld` exits `0` with `strict: true`, report schema-valid (PRD §45.4).

**Adapter behaviour beyond the kit.**

- [ ] `[machine]` `adapter.py` exposes module-level `ADAPTER` satisfying
      `isinstance(ADAPTER, SourceAdapter)`, and `AdapterMeta.adapter_key == "leg-qld" ==
      group_id.lower()` (`INGF-01` deliverables 4, 5, 9).
- [ ] `[machine]` **Architecture**: the scanner reports this directory clean — no `httpx`, `requests`,
      `aiohttp`, `urllib`, `http.client`, `socket`, `sqlite3`, corpus-database, PDF or XML-parsing
      library import; the network is reached only via `ctx.fetcher` and parsing only via `ctx.parser`
      (PRD §37.4, §40.7, §39.1; `SEC-002`).
- [ ] `[machine]` **Title allowlist is total.** `unexplained_titles()` over the discovery fixtures
      returns empty; every `DEPENDENCY_EXPANSION` resolves to another entry (PRD §40.2).
- [ ] `[machine]` **Future annotations are evidence, not prose.** Every `ENACTED_NOT_IN_FORCE`
      derivation names a `COMMENCEMENT` event with a future `effective_date` and a resolvable
      `evidence_node_version_id` in the annotated reprint (PRD §15.2, §6.7; sub-PRD **D6**).
- [ ] `[machine]` **Status is evidenced.** Every emitted version's `legal_status` traces to a
      `LegalEvent` with a resolvable `evidence_node_version_id`, or is `STATUS_UNCONFIRMED`; no
      relation is emitted with `confidence_state = MODEL_SUGGESTED` (PRD §15.2, §35.2; `SRCH-005`).
- [ ] `[machine]` **Hard-filter fields are populated.** Every emitted `DocumentVersion` carries a
      non-null `document_type`, `effective_from`, `legal_status` and `official_url`, and resolves to
      the `QLD` jurisdiction through its `source`/`authority` (`SRCH-002`; PRD §30.2, §36.2).
- [ ] `[machine]` The whole suite runs **offline**: a session fixture asserts no outbound network
      connection is opened (sub-PRD **D12**).
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, PRD §20.3).
- [ ] `[machine]` `pnpm test` green — standing suite item; no TypeScript in this ticket (plan §1.1).

**Human judgment.**

- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (`SRCH-002`, `SRCH-003`,
      `SRCH-005`; supports `ADM-001`, `SEC-002`); UAT IDs — `UAT-SRCH-03` (point-in-time) and
      `UAT-SRCH-02` ("Search current law with `ENACTED_NOT_IN_FORCE` source present | Future material
      absent from default results or visibly separated when requested") are the behaviours this
      group's reprints and future annotations make possible, executed by `14-search-product` and
      `10-sources-future`; schema/API/event compatibility (none — fills existing schemas);
      tenant/PII/security impact (none — public official material; fixtures scanned by DoD item 4);
      **source/licence impact** (assessment, `max_quote_chars`, `known_gaps`); cost/memory/latency
      impact (DoD item 12 against PRD §39.2's 2 GiB budget); rollback path (delete the group
      directory; `compose_registry` then reports `MANDATORY_GROUP_MISSING` for `LEG-QLD`, the correct
      honest state); known gaps and follow-up ids (`SINS-09`, `SADJ-04`, `SFUT-05`, `GOLD-09`,
      `GOLD-16`; sub-PRD **L3**, **L5**, **L7**, **L8**).
- [ ] `[human]` **Founder review of the coverage claim** — that `titles.yaml` genuinely covers the
      PRD §6.3 Queensland topics (including the payroll-tax, WHS, discrimination,
      workers-compensation, labour-hire and portable-LSL legislation that `SINS-09` and `SADJ-04` will
      build on), that each inclusion reason is defensible, and that `known_gaps` states the limitations
      a customer would need to see (PRD §6.1, §41.3 step 1, §43.4 item 4; sub-PRD **L5**).
- [ ] `[human]` **Future-annotation boundary review** — confirm this adapter labels not-yet-commenced
      amendments and does **not** build the current-vs-future separation model or ingest bills, which
      are `SFUT-05`'s (sub-PRD **D6**; PRD §6.5 "MUST be separated from current-law answers and
      visibly labelled").
- [ ] `[human]` **Dry-run provenance** — confirm `fixtures/dry-run.json` was produced against the
      official endpoints in `registry.yaml`/`allowlist.yaml` and that the document fixtures are
      unmodified official responses (PRD §40.8 item 2).
- [ ] `[human]` **Writeback obligation as an acceptance item** — if measured evidence shows the
      register cannot supply the PRD §40.2 minimum capability (HTML/XML/PDF discovery,
      versions/events), the PR sets the limited `adapter_status`, adds the customer-visible gap,
      fills `INGF-07`'s `limitation` block with the evidence, the affected dates or collections and
      the customer-visible warning, **and** updates `docs/prd/06-sources-legislation/README.md` in
      the same change (sub-PRD **D8**/**D13**; plan §8 **Q10**; PRD §7, §12.1, §44.4). A limited
      state asserted without measured evidence, and any scope reduction taken to make delivery
      easier, are both refused.
- **No additional `[fixture]` classes** beyond the DoD items above. Declared explicitly.
- **No `cargo test --workspace` item** — this ticket adds no Rust (plan §1.1).

## Test plan

Harness: `pytest`, run as `uv run pytest pipelines/adapters/leg-qld -q`, plus the kit CLI. Everything
is **offline**. Construction pattern to copy: `INGF-09`'s reference adapter at
`pipelines/ingestion/src/<root>/conformance/reference/demo-registry/`. Read
`pipelines/ingestion/src/<root>/conformance/README.md` and
`pipelines/adapters/_shared/legislation/README.md` before starting.

1. `uv sync --frozen && uv run pytest pipelines/adapters/leg-qld -q` — all green.
2. **The twelve DoD items** — `test_conformance.py` collects the twelve inherited `test_dod_NN_*`
   methods; every one passes, item 11 either passing or `DEFERRED(GOLD-16)` with a recorded reason.
3. **The kit CLI** — `python -m <root>.conformance check pipelines/adapters/leg-qld --report
   conformance-report.json` exits `0`; assert `"strict": true`, `summary.fail == 0`,
   `summary.not_available == 0`. A `--lenient` report is **not** acceptable evidence.
4. **Registry composition** — `python -m <root>.registry validate pipelines/adapters/leg-qld` exits
   `0`; compose a fixture tree in `mode="release"` and assert no `MANDATORY_GROUP_MISSING` for
   `LEG-QLD` and that the five PRD §12.1 dates appear as five separate fields.
5. **Licence** — `python -m <root>.licensing check pipelines/adapters/leg-qld` exits `0`; snapshot
   hash matches; `INGF-04`'s gate returns the expected `LicenceDecision` for each of the six
   `IntendedUse` values.
6. **Reprint series** — `tests/test_reprints.py` asserts a title's reprint series is contiguous and
   non-overlapping, that `resolve_as_at` returns the right reprint at each of the three time points,
   and that a deliberately overlapping pair produces a **BLOCK** `EFFECT_INTERVAL_OVERLAP` finding.
7. **Future annotations** — `tests/test_future_annotations.py` asserts an annotated reprint produces a
   `COMMENCEMENT` event with a future `effective_date` and a resolvable evidence node, and that
   `derive_status` returns `ENACTED_NOT_IN_FORCE` at a date before that commencement and `IN_FORCE`
   after it.
8. **Adapter unit tests** — `tests/test_identity.py` (determinism, stability across reprints),
   `tests/test_normalise.py` (node tree, round-trip in all three formats),
   `tests/test_events.py` (evidence resolution, `event_date` vs `effective_date`).
9. **Incremental matrix** — `tests/test_incremental.py` runs the four recorded scenarios.
10. **Architecture** — `tests/test_architecture.py` imports `INGF-01`'s scanner and asserts this
    directory is clean.
11. **Offline guard** — a session fixture that fails the run if any outbound socket is opened.
12. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus, in this order: (a) run the kit CLI — `NOT_AVAILABLE` is a **failure**, not a skip, and
`DEFERRED` is legitimate only for item 11; (b) the reprint series — confirm no two reprints of one
title overlap and that each of the three financial-year dates resolves to exactly one (PRD §35.2,
§40.9, §6.6); (c) confirm every `ENACTED_NOT_IN_FORCE` names its future-commencement evidence and that
this adapter does not attempt the current-vs-future separation model (sub-PRD **D6**); (d) confirm
`adapter_status` matches what the fixtures prove (PRD §7, §12.1, §44.4); (e) confirm the fixtures
contain no cookies, tokens or personal data; (f) confirm nothing in the directory opens a socket or a
parser directly (PRD §37.4, `SEC-002`).

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (a docs PR/MR,
a version note in the sub-PRD changelog, then `publish-tickets.mjs --sync`), and only then change
code. Silent divergence is an incomplete ticket. The ticket wins over any implementation plan
(CLAUDE.md, issue #53). Five tickets are `blocked_by` this one (`SINS-09`, `SADJ-04`, `SFUT-05`,
`GOLD-09`, `GOLD-16`); a change to `stable_source_key` or node-key derivation after merge invalidates
`GOLD-09`'s gold authorities and must be called out in the PR.

**Foreseeable frictions and their exact writeback targets:**

1. **The register does not provide the PRD §40.2 minimum capability** — no HTML/XML/PDF discovery, no
   reprint history, or no evidenced events → **writeback**, never a silent downgrade. Set
   `adapter_status` to the honest PRD §7 value, add a `known_gaps` entry with
   `customer_visible: true`, and update `docs/prd/06-sources-legislation/README.md` **in the same
   PR**. Populate `INGF-07`'s `limitation` block in the same change:
   `state`, a closed-set `reason_code`, `reason_detail`, at least one `evidence` entry, the `affected`
   dates or collections and the `customer_visible_warning`. Plan §8 **Q10** is confirmed policy, so
   this is never a scope choice — the limited state is legitimate only on that measured evidence, no
   part of the group may be silently omitted, and no unofficial source or commercial headnote may
   substitute for it. `GOLD-16` carries the evidence and the proposed registry state into the Gate 2
   verification that `LNCH-05` discloses.
2. **Future annotations cannot be parsed deterministically into a dated commencement** → do **not**
   infer a date. Emit no event, let `derive_status` return `STATUS_UNCONFIRMED`, and record a
   `CAPABILITY_LIMITED` `known_gaps` entry. PRD §35.2 forbids `MODEL_SUGGESTED` from supporting
   definitive status, and PRD §15.2 makes evidence the authority; a guessed commencement date is worse
   than an unconfirmed status. Raise the pattern with `SFUT-05`, whose job is future-status events.
3. **A shared helper is missing from `_shared/legislation`** → do **not** write it here and do **not**
   copy `SLEG-01`'s code. Plan §9 **R2**: add a new sibling ticket in this module, recorded in
   `docs/prd/06-sources-legislation/README.md`'s work-breakdown table and in
   `docs/prd/breakdown-plan.md` §5.7/§6.2, with this adapter `blocked_by` it.
4. **A conformance item cannot pass for a legitimate reason** → use `NOT_APPLICABLE` **with a recorded
   reason** where `INGF-09` permits it, and record the pattern in
   `docs/prd/05-ingestion-framework/README.md`. Never override a `test_dod_*` method, never add a
   skip, never use `--lenient` as evidence. An item impossible for a whole class of registers is a
   change to PRD §40.8 — a **product/spec** change under PRD §45.5. Escalate.
5. **Licence terms are unclear or prohibit storage/indexing** → record the assessment honestly and let
   `INGF-04`'s gate collapse the permission set; if the group cannot reach `ACTIVE`, set
   `LICENSING_RESTRICTED` and update open question **L7** in
   `docs/prd/06-sources-legislation/README.md`. Never raise `max_quote_chars` to make a test pass.
6. **The register publishes no reprint for part of the PRD §6.6 window** → sub-PRD **D10**: emit what
   the register publishes and record a `DATE_LIMITED` `known_gaps` entry with
   `customer_visible: true`. **Never** reconstruct a consolidation from as-made plus amendments —
   PRD §6.1 admits only official public sources. Overturning D10 requires
   `docs/adr/NNNN-no-synthesised-consolidations.md` plus the D10/L6 rows in the sub-PRD, escalated
   first.
7. **A title `SINS-09` or `SADJ-04` needs is not in `titles.yaml`** → add it here with its inclusion
   reason; that is this ticket's scope under sub-PRD **D7**.
8. **A new failure code needs a quarantine class mapping `INGF-05` does not have** → register the code
   here with its operator action and raise the class mapping against `INGF-05`. Do not edit
   `INGF-05`'s reason table — it is another module's file-scope.

**Escalation rule.** If the twelve-item Definition of Done cannot be met for `LEG-QLD`, stop and
escalate. PRD §26 requires all five source waves to have active or explicitly limited registry
status, and PRD §44.4 permits exactly two outcomes: continue work and delay production access, or
launch with this group in an explicit, customer-visible limited state. The second is available only
on measured evidence of a genuine official-source limitation, recorded in `INGF-07`'s `limitation`
block (plan §8 **Q10**, confirmed policy); it is not a route to reducing mandatory scope. Quietly
shipping a group that claims more coverage than it has is not one of them.
