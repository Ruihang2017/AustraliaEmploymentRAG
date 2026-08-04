---
id: SLEG-07
title: "`LEG-SA`"
module: 06-sources-legislation
lane: 06-sources-legislation
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [SLEG-01]
blocks: [SINS-11, SADJ-06, SFUT-07, GOLD-09, GOLD-16]
---

# SLEG-07 — `LEG-SA`

Implements PRD §40.2 (`LEG-SA` source group), PRD §6.3 (state and territory scope) and PRD §40.8
(adapter Definition of Done) <SRCH-002, SRCH-003, SRCH-005; supports ADM-001, SEC-002> — no ADR — the
decision is already made in PRD §40.2; this is build ticket 7 of 10 against it.
Parent sub-PRD: [06-sources-legislation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [SLEG-01 — Legislation adapter primitives (point-in-time, events, title allowlist)](SLEG-01-legislation-adapter-primitives-point-in-time-events-title-allowlist.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §40.7's eight boundaries and PRD §40.8's twelve-item checklist — not a new subsystem decision.

## Background + basis

**The PRD §40.2 row for this group, verbatim:**

| Group ID | Jurisdiction/official entry | Required document families | Minimum adapter capability | Initial tier |
|---|---|---|---|---|
| `LEG-SA` | South Australian Legislation — <https://legislation.sa.gov.au/> | Acts, Bills, regulations/rules, proclamations/notices, historical index | Discovery; versions; proclamation events | T1 employment scope |

and the scoping rule that closes PRD §40.2:

> "Wave 1 is scoped to employment-related titles and their necessary amending, commencement,
> transitional and interpretation instruments—not every unrelated law in each register. A maintained
> subject/title allowlist plus dependency expansion records why each title is included."

**PRD §6.3 fixes what "employment-related" means for South Australia** — the ticket's subject scope,
quoted in full because `titles.yaml` is judged against it:

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

Only the **legislation** in that list is this ticket's: SA Acts, regulations and rules and their
commencement/amendment/repeal history. Rates and official guidance are `07-sources-instruments`
(`PT-SA`), regulator material is `09-sources-adjacent` (`ADJ-SA`), and courts/tribunals — including
SAET — are `08-sources-cases` (`CASE-SA`). All three build on the legislation this ticket ingests
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

**What makes South Australia distinctive.** The PRD §40.2 row is the only one whose minimum capability
names **proclamation events**, and it lists **proclamations/notices** and a **historical index** among
the required families. Three consequences:

1. **Proclamations are the commencement evidence.** PRD §15.2: "Legal status MUST be derived from
   evidenced LegalEvents." `SLEG-01`'s event vocabulary has `COMMENCEMENT_PROCLAIMED` for exactly
   this, and every such event must carry a resolvable `evidence_node_version_id` into the parsed
   proclamation (PRD §35.2 `legal_event.evidence_node_version_id`). A commencement asserted without a
   proclamation is `STATUS_UNCONFIRMED`, not an assumption.
2. **The historical index is the version-discovery mechanism.** It is what makes PRD §6.6's
   three-financial-year point-in-time window reachable, and it is a parse target in its own right.
3. **`event_date` and `effective_date` genuinely differ here.** A proclamation is made and published on
   one date and takes effect on another; PRD §35.2 gives `legal_event` both columns and PRD §15.2
   requires publication and effective time to be distinguished. Collapsing them would put a provision
   in force on the wrong day.

**PRD §40.1 says a roster row is not coverage:** "Every row starts `NOT_STARTED` and must become
`ACTIVE` or an explicit customer-visible limited state before release. The live Source Coverage
Registry will expand each group into exact collections/endpoints, licence snapshots, formats, counts,
date bounds, schedules and gaps." Expanding this group into exact endpoints is deliverable 1.

**PRD §7 and §12.1 give the only honest exits, and the policy governing them is settled.** Plan §8
**Q10** is a **confirmed policy** (sub-PRD **D13**): no mandatory source group is pre-selected for
omission or reduced implementation, every Commonwealth, state and territory mandatory group in the
approved MVP scope must be attempted in full, and arbitrary scope reduction to make a release date
easier is not permitted. `LEG-SA` is therefore built in full; a limited state is never a way to
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

**Downstream (plan §6.2): `SLEG-07 --> SINS-11 & SADJ-06 & SFUT-07 & GOLD-09 & GOLD-16`.**
`SINS-11` (`PT-SA`, RevenueSA) adds dated rates, thresholds, guides and circulars on top of the
payroll-tax **legislation** this ticket ingests. `SADJ-06` (`ADJ-SA`: SafeWork SA, Equal Opportunity
SA, ReturnToWorkSA, Consumer and Business Services labour-hire licensing and portable-LSL
authorities) adds regulator material on top of the WHS, discrimination, compensation, labour-hire and
portable-LSL **legislation** this ticket ingests. `SFUT-07` (`FUTURE-SA`) adds future-status events.
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

Deliver the `LEG-SA` source adapter under `pipelines/adapters/leg-sa/**`: the group's `registry.yaml`,
`allowlist.yaml`, `licence.yaml` + immutable `licence-snapshots/`, a `titles.yaml` subject/title
allowlist over the PRD §6.3 SA employment scope, `conformance.yaml`, and an `adapter.py` exposing
`ADAPTER: SourceAdapter` that implements all eight PRD §40.7 boundaries over SA Legislation —
discovering Acts, regulations and rules and their versions through the historical index, parsing
proclamations and notices into evidenced `COMMENCEMENT_PROCLAIMED` events with distinct
`event_date`/`effective_date`, and emitting a non-overlapping version series with exact-text
round-trip — together with the recorded fixtures that make
`python -m <root>.conformance check pipelines/adapters/leg-sa` exit `0` in **strict** mode with all
twelve PRD §40.8 items passing offline, and a `conformance-report.json` attached to the PR.

## Non-goals

- **No shared legislation primitive.** Point-in-time resolution, status derivation, node lineage, the
  `titles.yaml` schema and the FLAG/BLOCK table are `SLEG-01`'s. A helper this adapter wants is added
  **there** as a new sibling ticket, never copied here — plan §9 **R2**.
- **No ingestion-framework change**, and no HTTP, PDF or OCR library in this directory — `INGF-02` and
  `INGF-06` own them, and the architecture scan fails the build on a direct import (PRD §37.4).
- **No SA payroll-tax rates, thresholds, guides or circulars** — `07-sources-instruments` / `SINS-11`
  (`PT-SA`, RevenueSA), which is `blocked_by` this ticket. This ticket ingests the payroll-tax
  **legislation** only (sub-PRD **D7**).
- **No SafeWork SA, Equal Opportunity SA, ReturnToWorkSA, Consumer and Business Services or
  portable-LSL authority material** — `09-sources-adjacent` / `SADJ-06` (`ADJ-SA`), which is
  `blocked_by` this ticket.
- **No SAET, Employment Court or SA court decisions** — `08-sources-cases` / `SCAS-10` (`CASE-SA`).
- **No Bills, draft instruments, consultations or the current-vs-future separation model** —
  `10-sources-future` / `SFUT-07` (`FUTURE-SA`), which is `blocked_by` this ticket. PRD §40.2 lists
  Bills among the register's document families, but PRD §40.6 assigns future status to `FUTURE-SA` and
  PRD §6.5 requires future material to be separated and labelled. This adapter emits
  `ENACTED_NOT_IN_FORCE` for registered material whose proclaimed commencement is not yet effective —
  PRD §15.2 requires status to follow the evidence — and stops there (sub-PRD **D6**).
- **No corpus write, chunking, tiering or embedding.** PRD §40.7.
- **No evaluation cases or gold answers** — `21-evaluation-600` / `GOLD-09`.
- **No live network in CI** — sub-PRD **D12**.
- **No tenant, customer or app-database access.** PRD §39.1. Standing rule, not a deferral.

## File-scope (write-owns)

- `pipelines/adapters/leg-sa/**` — the whole group directory, in the layout `INGF-07` deliverable 1
  fixes and `INGF-09` deliverable 7 demonstrates:

  ```text
  pipelines/adapters/leg-sa/
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
- Does not touch: `pipelines/adapters/leg-{cth,nsw,vic,qld,wa,tas,act,nt}/**` — `SLEG-02`…`SLEG-06`,
  `SLEG-08`…`SLEG-10` (same module, concurrent wave-2 lanes).
- Does not touch: `pipelines/adapters/pt-sa/**` (`SINS-11`), `pipelines/adapters/adj-sa/**`
  (`SADJ-06`), `pipelines/adapters/future-sa/**` (`SFUT-07`), `pipelines/adapters/case-sa/**`
  (`SCAS-10`), `pipelines/adapters/_shared/{rates,caselaw,future}/**` — modules `07`–`10`.
- Does not touch: `pipelines/ingestion/**` — `05-ingestion-framework`.
- Does not touch: `pipelines/corpus-builder/**`, `pipelines/embeddings/**`,
  `schemas/corpus-manifest/**` — `04-corpus-contract`.
- Does not touch: `pipelines/evaluation/**`, `evals/**` — `21-evaluation-600`. `evals/gold/**` is not
  even read (plan §9 **R9**).
- Does not touch: `packages/**`, `apps/**`, `services/**`, `infra/**`, `schemas/{openapi,events}/**`,
  `tests/**`, `.github/workflows/**`, root manifests and lockfiles.

**Serial safety.** This is the **first decomposition** of `docs/PRD.md` (plan §1 header: `phase: 1`,
`existingFiles: ['.gitkeep']`); nothing is merged and no ticket is in flight, so no prior ticket has
touched `pipelines/adapters/leg-sa/**`. The only writers anywhere under `pipelines/adapters/` before
this ticket are `FND-01` (the member manifest) and `SLEG-01` (`_shared/legislation/**` plus the
manifest), both of which must have landed — this ticket is `blocked_by SLEG-01`. **Sibling adapter
scopes are disjoint by construction:** plan §4 gives this module one directory per PRD §40.2 group id,
each owned by exactly one ticket, and `INGF-07`'s A2 layout keeps every per-group artefact inside its
own directory. The eight concurrent sibling lanes share exactly one path with this ticket,
`pipelines/adapters/pyproject.toml`, which is append-only and which none of them expects to modify.

## Deliverables

1. **`registry.yaml` — the Source Coverage Registry row (PRD §40.8 item 1, PRD §6.1).** Validated by
   `python -m <root>.registry validate pipelines/adapters/leg-sa`. All nine PRD §6.1 attributes:
   `group_id: LEG-SA`, `wave: 1`; the register's responsible `authority` with `jurisdiction: SA` and
   `official_url: https://legislation.sa.gov.au/`; `official_endpoints` — the **exact
   collections/listings this adapter actually calls**, including the historical index and the
   proclamations/notices collection, each with `kind` and `material_class` (PRD §40.1);
   `document_coverage.families` covering the PRD §40.2 required families — Acts, regulations/rules,
   proclamations/notices, historical index — and `financial_years` covering at least `2024-25`,
   `2025-26`, `2026-27` (PRD §6.6) or a `customer_visible: true` gap; `licence_ref`; `allowlist_ref`;
   `adapter_status` — `ACTIVE`, or one of PRD §7's four limited
   states, which is permitted **only** on measured evidence of a genuine official-source limitation
   and then requires both a `customer_visible: true` `known_gaps` entry and `INGF-07`'s non-null
   `limitation` block (`state` equal to `adapter_status`; a `reason_code` from the closed set
   `OFFICIAL_CAPABILITY_LIMIT | MATERIAL_NOT_PUBLISHED | LICENSING_RESTRICTION |
   HISTORICAL_MATERIAL_UNAVAILABLE | FRESHNESS_LIMITATION | OTHER_OFFICIAL_SOURCE_CONSTRAINT`; a
   mandatory `reason_detail`; at least one `evidence` entry; `affected` dates or collections; and a
   `customer_visible_warning`) — sub-PRD **D8**/**D13**, plan §8 **Q10**; `initial_index_tier: T1`;
   `change_detection.{capability,cadence,supports_conditional_requests,reconciliation}` reflecting the
   **measured** capability (PRD §12.1); `known_gaps`; `evaluation_subset_ref` for
   `GOLD-09`/`GOLD-16`.

2. **`allowlist.yaml` (PRD §40.8 item 1, `SEC-002`, PRD §37.4).** `schemes: [https]` only; the
   register's host(s) with explicit `path_prefixes` covering exactly the `official_endpoints`; polite
   `min_request_interval_ms` and `max_concurrent_requests`; `approved_max_bytes` only with a written
   `approved_max_bytes_reason` (PRD §37.4's "source-specific approved limit"). The adapter reaches the
   network only through `ctx.fetcher`; `ReplayFetcher` refuses a fixture URL outside this file.

3. **`licence.yaml` + `licence-snapshots/` (PRD §40.8 item 1, PRD §11.1, PRD §35.3).** Capture the
   register's terms with `python -m <root>.licensing capture pipelines/adapters/leg-sa --terms-url
   <official terms URL>`; the stored file's SHA-256 must equal `snapshot.terms_sha256`. State all nine
   PRD §11.1 axes independently plus `attribution_text`, `max_quote_chars` and one of the six PRD
   §11.1 states. Unclear rights are `UNCLEAR_RESTRICTED` — "Unclear rights default to metadata,
   limited quotation and official links" — collapsed conservatively by `INGF-04`'s gate. Never assume
   permission from the tier (PRD §40.1).

4. **`titles.yaml` — the PRD §40.2 subject/title allowlist (`SLEG-01`'s schema, sub-PRD D5/D7).**
   `subjects` covering the PRD §6.3 SA topics quoted above. One entry per included title with
   `stable_source_key`, `canonical_title`, `document_type` and an `inclusion` reason (`SUBJECT_MATCH`
   naming the subject, or `DEPENDENCY_EXPANSION` naming `depends_on` and a `dependency_kind` of
   `AMENDING | COMMENCEMENT | TRANSITIONAL | INTERPRETATION | SUBORDINATE`) — **proclamations are the
   canonical `COMMENCEMENT` dependency here**. `adapter.discover()` refuses a title with no recorded
   reason via `unexplained_titles()`.

5. **`adapter.py` — `ADAPTER: SourceAdapter` implementing the eight PRD §40.7 boundaries.**
   `AdapterMeta(group_id="LEG-SA", adapter_key="leg-sa", jurisdiction="SA", authority_id=…,
   adapter_version="0.1.0", supported_content_types=[…], declared_quarantine_reasons=[…])`.
   - `discover(ctx, cursor, since)` — over the `official_endpoints`, walking the **historical index**
     to enumerate each allowlisted title's versions and the proclamations/notices that evidence its
     commencements, with conditional requests where supported. Yields `RemoteDescriptor`s with a
     stable `descriptor_key`.
   - `fetch(ctx, descriptor, validators)` — `ctx.fetcher` only, passing `FetchValidators`.
   - `identify(ctx, artifact)` — `stable_source_key` is the register's permanent identifier for the
     title, stable across versions. Never a URL, never a display title, never a content hash.
   - `parse(ctx, artifact)` — through `ctx.parser` (`INGF-06`) only; `ParsedBlock` offsets satisfy the
     exact-text round-trip.
   - `normalise(ctx, parsed, identity)` — builds `DocumentVersionRecord` + `NodeVersionRecord`s via
     `NodeTree`/`stable_node_key`, setting `version_label`, `publication_date`,
     `effective_from`/`effective_to`, `content_hash`, `official_url`, `retrieved_at` and
     `legal_status` from `derive_status`.
   - `extract_events(ctx, normalised)` — `LegalEventRecord`s built through `build_event`, with
     **`COMMENCEMENT_PROCLAIMED` produced from a parsed proclamation/notice** and carrying that
     document's node version as evidence; plus amendment, repeal and as-made registration.
     `event_date` (the date the proclamation was made/published) and `effective_date` (the date the
     provision commences) are set independently and never derived from one another (PRD §15.2,
     §35.2).
   - `extract_relations(ctx, normalised)` — from `diff_nodes` plus the register's own amend/renumber
     evidence; `confidence_state` is never `MODEL_SUGGESTED` (PRD §35.2).
   - `validate(ctx, candidate, prior)` — returns `legislation_findings(...)`.
   The module imports no HTTP or parsing library — enforced by `INGF-01`/`INGF-02`'s architecture scan.

6. **`fixtures/discovery/` + `fixtures/dry-run.json` (DoD item 2).** ≥1 recorded discovery response
   per `official_endpoints` entry — including the historical index and the proclamations collection —
   so replay yields ≥1 `RemoteDescriptor` with a non-empty `descriptor_key` and an allowlisted URL.
   `dry-run.json` carries `{run_at, descriptors_discovered, sample_urls, tool_versions}` from a
   **one-time live** run, `run_at` inside `DRY_RUN_MAX_AGE_DAYS = 180`.

7. **`fixtures/documents/` (DoD items 4 and 5).** Representative artefacts for every declared media
   type, **including at least one proclamation/notice and one historical-index page**. Public official
   material only, and **no customer data**: the item-4 scanner rejects TFN/ABN-with-name/email/phone/
   credential patterns, `Set-Cookie` or `Authorization` captures and `.env`-shaped content. Each
   fixture parses through `INGF-06`'s host, satisfies `assert_roundtrip()`, and yields a node
   hierarchy with one root, no cycles, contiguous sibling ordinals and recomputable `text_hash`es.

8. **`fixtures/timepoints/` (DoD item 6).** ≥3 legal dates, one in each PRD §6.6 financial year
   (2024–25, 2025–26, 2026–27), for at least one title with real version history — an SA employment,
   WHS or payroll-tax Act is the natural choice, since `SINS-11` and `SADJ-06` depend on it. For each
   date: a version whose interval brackets it, a `legal_status` from PRD §6.7's seven values backed by
   an evidence event, and `event_date`/`effective_date` distinguished. **At least one case must be a
   proclamation-evidenced commencement where the two dates differ.** No two consolidated versions may
   overlap (PRD §35.2, §40.9).

9. **Incremental scenarios (DoD item 7).** Four recorded scenarios: **no-change** (304 → zero fetched,
   zero quarantined, `last_successful_change_scan_at` advanced, `last_content_ingestion_at`
   unchanged); **changed** (new version emitted, prior version's `effective_to` closed via
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
    non-empty operator action. **Include a proclamation whose commencement date cannot be resolved**,
    which must yield `STATUS_UNCONFIRMED` plus a recorded finding rather than a guessed date
    (PRD §15.2, §6.7). Reuse `SLEG-01`'s `legislation` codes and `INGF-05`'s framework codes first.

13. **`tests/test_conformance.py` — the five-line file `INGF-09` deliverable 1 fixes:**

    ```python
    from pathlib import Path
    from aer_ingestion.conformance import ConformanceTestCase

    class TestLegSa(ConformanceTestCase):
        group_dir = Path(__file__).resolve().parents[1]
    ```

    plus adapter-specific unit tests. No `test_dod_*` method may be overridden.

14. **`conformance-report.json` attached to the PR** — from
    `python -m <root>.conformance check pipelines/adapters/leg-sa`, `strict: true`, exit `0`.

## Acceptance checklist (classified)

**PRD §40.8 Definition of Done — all twelve items.**

- [ ] `[machine]` **DoD 1 — registry row, allowlist, licence.** All three files exist and validate
      through `INGF-07`/`INGF-02`/`INGF-04`; `group_id` is `LEG-SA` and is in
      `MANDATORY_SOURCE_GROUPS`; the directory name equals `group_id.lower()`; the snapshot file's
      SHA-256 equals `snapshot.terms_sha256`; every `official_endpoints` URL passes the allowlist
      (PRD §40.8 item 1, §6.1, §11.1).
- [ ] `[machine]` **Source Coverage Registry row is complete and composable.**
      `compose_registry(mode="release")` reports no `MANDATORY_GROUP_MISSING` for `LEG-SA`, no
      `REGISTRY_GAP_NOT_VISIBLE` and no `REGISTRY_ENDPOINT_NOT_ALLOWLISTED`; all nine PRD §6.1
      attributes present; every endpoint has a `material_class`; `adapter_status` satisfies
      `is_release_acceptable()`. When `adapter_status` is one of the four limited states the row also
      carries a valid `limitation` block, so composition reports no `REGISTRY_LIMITATION_MISSING`,
      `REGISTRY_LIMITATION_UNEVIDENCED`, `REGISTRY_LIMITATION_SCOPE_MISSING` or
      `REGISTRY_LIMITATION_WARNING_MISSING`; an `ACTIVE` row carries no `limitation` at all
      (PRD §6.1, §7, §40.1, §44.4; plan §8 **Q10**; sub-PRD **D13**; `ADM-001`).
- [ ] `[fixture]` **DoD 2 — discovery fixture and live dry-run evidence** (PRD §40.8 item 2).
- [ ] `[fixture]` **DoD 3 — stable identity, versions, deletion/unavailability.** `identify()` is
      deterministic across two calls and stable across two versions of the same title; different
      titles yield different `stable_source_key`s; a removed descriptor produces a `REMOVED` finding
      and deletes no prior state (PRD §40.8 item 3).
- [ ] `[fixture]` **DoD 4 — representative fixtures without customer data**, covering every declared
      media type including a proclamation/notice and a historical-index page; the no-customer-data
      scan finds nothing (PRD §40.8 item 4, §19.2, §35.3).
- [ ] `[fixture]` **DoD 5 — parser/node hierarchy and exact-text round-trip** for every fixture; one
      root, no cycles, contiguous sibling ordinals, recomputable `text_hash`es (PRD §40.8 item 5,
      §15.3, §35.2; `SRCH-003`).
- [ ] `[fixture]` **DoD 6 — three time points**, one in each of 2024–25, 2025–26 and 2026–27, each
      resolving to a version whose interval brackets it with a PRD §6.7 status backed by an evidence
      event; **at least one proclamation-evidenced commencement where `event_date` and
      `effective_date` differ**; no two consolidated versions overlap (PRD §40.8 item 6, §6.6, §15.2,
      §35.2).
- [ ] `[fixture]` **DoD 7 — incremental matrix.** The four scenarios each produce their expected counts
      and run status; the transient-failure case creates **no** content quarantine item
      (PRD §40.8 item 7).
- [ ] `[fixture]` **DoD 8 — count/hash baseline and anomaly thresholds.** The replayed run reproduces
      `fixtures/baseline.json` exactly; `anomaly_overrides` pass `AnomalyPolicy.for_group()` —
      tighten-only (PRD §40.8 item 8, §40.9).
- [ ] `[fixture]` **DoD 9 — freshness schedule, last-check/last-ingest separation** (PRD §40.8 item 9,
      §12.1).
- [ ] `[fixture]` **DoD 10 — quarantine cases and operator recovery**, including the unresolvable
      proclamation case; every code has a non-empty `operator_action` (PRD §40.8 item 10; `ADM-001`).
- [ ] `[machine]` **DoD 11 — retrieval/citation evaluation subset.** `evaluation_subset_ref` non-empty
      and well-formed; ids resolve against `evals/cases/**` when it exists, otherwise
      `DEFERRED(GOLD-16)` with a recorded reason. `evals/gold/**` is never read (PRD §40.8 item 11;
      plan §9 **R9**).
- [ ] `[fixture]` **DoD 12 — measured storage, parse time, index size and peak memory**, all four
      recorded, non-zero and within this group's ceilings (PRD §40.8 item 12, §39.2).
- [ ] `[fixture]` **The kit as a whole.** `python -m <root>.conformance check
      pipelines/adapters/leg-sa` exits `0` with `strict: true`, report schema-valid (PRD §45.4).

**Adapter behaviour beyond the kit.**

- [ ] `[machine]` `adapter.py` exposes module-level `ADAPTER` satisfying
      `isinstance(ADAPTER, SourceAdapter)`, and `AdapterMeta.adapter_key == "leg-sa" ==
      group_id.lower()` (`INGF-01` deliverables 4, 5, 9).
- [ ] `[machine]` **Architecture**: the scanner reports this directory clean — no `httpx`, `requests`,
      `aiohttp`, `urllib`, `http.client`, `socket`, `sqlite3`, corpus-database or document-parsing
      library import; the network is reached only via `ctx.fetcher` and parsing only via `ctx.parser`
      (PRD §37.4, §40.7, §39.1; `SEC-002`).
- [ ] `[machine]` **Title allowlist is total.** `unexplained_titles()` over the discovery fixtures
      returns empty; every `DEPENDENCY_EXPANSION` resolves to another entry (PRD §40.2).
- [ ] `[machine]` **Proclamation evidence.** Every `COMMENCEMENT_PROCLAIMED` event carries a resolvable
      `evidence_node_version_id` into a parsed proclamation, and a proclamation whose commencement
      date cannot be resolved yields `STATUS_UNCONFIRMED` rather than an inferred date
      (PRD §15.2, §6.7, §35.2; PRD §40.2 "proclamation events").
- [ ] `[machine]` **Status is evidenced.** Every emitted version's `legal_status` traces to a
      `LegalEvent` with a resolvable `evidence_node_version_id`, or is `STATUS_UNCONFIRMED`; no
      relation is emitted with `confidence_state = MODEL_SUGGESTED` (PRD §15.2, §35.2; `SRCH-005`).
- [ ] `[machine]` **Hard-filter fields are populated.** Every emitted `DocumentVersion` carries a
      non-null `document_type`, `effective_from`, `legal_status` and `official_url`, and resolves to
      the `SA` jurisdiction through its `source`/`authority` (`SRCH-002`; PRD §30.2, §36.2).
- [ ] `[machine]` The whole suite runs **offline**: a session fixture asserts no outbound network
      connection is opened (sub-PRD **D12**).
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, PRD §20.3).
- [ ] `[machine]` `pnpm test` green — standing suite item; no TypeScript in this ticket (plan §1.1).

**Human judgment.**

- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (`SRCH-002`, `SRCH-003`,
      `SRCH-005`; supports `ADM-001`, `SEC-002`); UAT IDs — `UAT-SRCH-03` is the behaviour this
      group's version history makes possible, executed by `14-search-product`; schema/API/event
      compatibility (none — fills existing schemas); tenant/PII/security impact (none — public
      official material; fixtures scanned by DoD item 4); **source/licence impact** (assessment,
      `max_quote_chars`, `known_gaps`); cost/memory/latency impact (DoD item 12 against PRD §39.2's
      2 GiB budget); rollback path (delete the group directory; `compose_registry` then reports
      `MANDATORY_GROUP_MISSING` for `LEG-SA`, the correct honest state); known gaps and follow-up ids
      (`SINS-11`, `SADJ-06`, `SFUT-07`, `GOLD-09`, `GOLD-16`; sub-PRD **L3**, **L5**, **L7**, **L8**).
- [ ] `[human]` **Founder review of the coverage claim** — that `titles.yaml` genuinely covers the
      PRD §6.3 SA topics (including the payroll-tax, WHS, discrimination, compensation, labour-hire
      and portable-LSL legislation that `SINS-11` and `SADJ-06` will build on), that each inclusion
      reason is defensible, and that `known_gaps` states the limitations a customer would need to see
      (PRD §6.1, §41.3 step 1, §43.4 item 4; sub-PRD **L5**).
- [ ] `[human]` **Dry-run provenance** — confirm `fixtures/dry-run.json` was produced against the
      official endpoints in `registry.yaml`/`allowlist.yaml` and that the document fixtures are
      unmodified official responses (PRD §40.8 item 2).
- [ ] `[human]` **Writeback obligation as an acceptance item** — if measured evidence shows the
      register cannot supply the PRD §40.2 minimum capability (discovery, versions, proclamation
      events), the PR sets the limited `adapter_status`, adds the customer-visible gap, fills
      `INGF-07`'s `limitation` block with the evidence, the affected dates or collections and the
      customer-visible warning, **and** updates `docs/prd/06-sources-legislation/README.md` in the
      same change (sub-PRD **D8**/**D13**; plan §8 **Q10**; PRD §7, §12.1, §44.4). A limited state
      asserted without measured evidence, and any scope reduction taken to make delivery easier, are
      both refused.
- **No additional `[fixture]` classes** beyond the DoD items above. Declared explicitly.
- **No `cargo test --workspace` item** — this ticket adds no Rust (plan §1.1).

## Test plan

Harness: `pytest`, run as `uv run pytest pipelines/adapters/leg-sa -q`, plus the kit CLI. Everything
is **offline**. Construction pattern to copy: `INGF-09`'s reference adapter at
`pipelines/ingestion/src/<root>/conformance/reference/demo-registry/`. Read
`pipelines/ingestion/src/<root>/conformance/README.md` and
`pipelines/adapters/_shared/legislation/README.md` before starting.

1. `uv sync --frozen && uv run pytest pipelines/adapters/leg-sa -q` — all green.
2. **The twelve DoD items** — `test_conformance.py` collects the twelve inherited `test_dod_NN_*`
   methods; every one passes, item 11 either passing or `DEFERRED(GOLD-16)` with a recorded reason.
3. **The kit CLI** — `python -m <root>.conformance check pipelines/adapters/leg-sa --report
   conformance-report.json` exits `0`; assert `"strict": true`, `summary.fail == 0`,
   `summary.not_available == 0`. A `--lenient` report is **not** acceptable evidence.
4. **Proclamation events** — `tests/test_proclamations.py` asserts each proclamation fixture produces
   a `COMMENCEMENT_PROCLAIMED` event with a resolvable evidence node and distinct
   `event_date`/`effective_date`; a proclamation with an unresolvable commencement date yields
   `STATUS_UNCONFIRMED` and a recorded finding, never an inferred date.
5. **Registry composition** — `python -m <root>.registry validate pipelines/adapters/leg-sa` exits
   `0`; compose a fixture tree in `mode="release"` and assert no `MANDATORY_GROUP_MISSING` for
   `LEG-SA` and that the five PRD §12.1 dates appear as five separate fields.
6. **Licence** — `python -m <root>.licensing check pipelines/adapters/leg-sa` exits `0`; snapshot hash
   matches; `INGF-04`'s gate returns the expected `LicenceDecision` for each of the six `IntendedUse`
   values.
7. **Adapter unit tests** — `tests/test_identity.py` (determinism, cross-version stability),
   `tests/test_normalise.py` (node tree, round-trip), `tests/test_timepoints.py` (the three
   financial-year dates, non-overlap).
8. **Incremental matrix** — `tests/test_incremental.py` runs the four recorded scenarios.
9. **Architecture** — `tests/test_architecture.py` imports `INGF-01`'s scanner and asserts this
   directory is clean.
10. **Offline guard** — a session fixture that fails the run if any outbound socket is opened.
11. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus, in this order: (a) run the kit CLI — `NOT_AVAILABLE` is a **failure**, not a skip, and
`DEFERRED` is legitimate only for item 11; (b) **the proclamation events** — confirm each names its
evidence and that gazettal/publication and commencement dates are kept apart, because collapsing them
puts a provision in force on the wrong day (PRD §15.2); (c) confirm `adapter_status` matches what the
fixtures prove (PRD §7, §12.1, §44.4); (d) confirm the three financial-year dates each resolve to
exactly one non-overlapping version (PRD §6.6, §35.2); (e) confirm the fixtures contain no cookies,
tokens or personal data; (f) confirm nothing in the directory opens a socket or a parser directly
(PRD §37.4, `SEC-002`).

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (a docs PR/MR,
a version note in the sub-PRD changelog, then `publish-tickets.mjs --sync`), and only then change
code. Silent divergence is an incomplete ticket. The ticket wins over any implementation plan
(CLAUDE.md, issue #53). Five tickets are `blocked_by` this one (`SINS-11`, `SADJ-06`, `SFUT-07`,
`GOLD-09`, `GOLD-16`); a change to `stable_source_key` or node-key derivation after merge invalidates
`GOLD-09`'s gold authorities and must be called out in the PR.

**Foreseeable frictions and their exact writeback targets:**

1. **The register does not provide the PRD §40.2 minimum capability** — no structured discovery, no
   version history, or no machine-readable proclamation events → **writeback**, never a silent
   downgrade. Set `adapter_status` to the honest PRD §7 value, add a `known_gaps` entry with
   `customer_visible: true`, and update `docs/prd/06-sources-legislation/README.md` **in the same
   PR**. Populate `INGF-07`'s `limitation` block in the same change:
   `state`, a closed-set `reason_code`, `reason_detail`, at least one `evidence` entry, the `affected`
   dates or collections and the `customer_visible_warning`. Plan §8 **Q10** is confirmed policy, so
   this is never a scope choice — the limited state is legitimate only on that measured evidence, no
   part of the group may be silently omitted, and no unofficial source or commercial headnote may
   substitute for it. `GOLD-16` carries the evidence and the proposed registry state into the Gate 2
   verification that `LNCH-05` discloses.
2. **A proclamation's commencement date cannot be parsed deterministically** → do **not** infer it.
   Emit no commencement event, let `derive_status` return `STATUS_UNCONFIRMED`, and record a
   `CAPABILITY_LIMITED` `known_gaps` entry. PRD §35.2 forbids `MODEL_SUGGESTED` from supporting
   definitive status and PRD §15.2 makes evidence the authority; a guessed date is worse than an
   unconfirmed status, because `SRCH-002`'s date filter would silently return the wrong version.
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
6. **The historical index does not reach back across the PRD §6.6 window** → sub-PRD **D10**: emit what
   the register publishes and record a `DATE_LIMITED` `known_gaps` entry with
   `customer_visible: true`. **Never** reconstruct a consolidation from as-made plus amendments —
   PRD §6.1 admits only official public sources. Overturning D10 requires
   `docs/adr/NNNN-no-synthesised-consolidations.md` plus the D10/L6 rows in the sub-PRD, escalated
   first.
7. **A title `SINS-11` or `SADJ-06` needs is not in `titles.yaml`** → add it here with its inclusion
   reason; that is this ticket's scope under sub-PRD **D7**.
8. **A new failure code needs a quarantine class mapping `INGF-05` does not have** → register the code
   here with its operator action and raise the class mapping against `INGF-05`. Do not edit
   `INGF-05`'s reason table — it is another module's file-scope.

**Escalation rule.** If the twelve-item Definition of Done cannot be met for `LEG-SA`, stop and
escalate. PRD §26 requires all five source waves to have active or explicitly limited registry
status, and PRD §44.4 permits exactly two outcomes: continue work and delay production access, or
launch with this group in an explicit, customer-visible limited state. The second is available only
on measured evidence of a genuine official-source limitation, recorded in `INGF-07`'s `limitation`
block (plan §8 **Q10**, confirmed policy); it is not a route to reducing mandatory scope. Quietly
shipping a group that claims more coverage than it has is not one of them.
