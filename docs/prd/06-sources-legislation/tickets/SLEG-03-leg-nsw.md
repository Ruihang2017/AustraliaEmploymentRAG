---
id: SLEG-03
title: "`LEG-NSW`"
module: 06-sources-legislation
lane: 06-sources-legislation
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [SLEG-01]
blocks: [SINS-07, SADJ-02, SFUT-03, GOLD-09, GOLD-16]
---

# SLEG-03 — `LEG-NSW`

Implements PRD §40.2 (`LEG-NSW` source group), PRD §6.3 (state and territory scope) and PRD §40.8
(adapter Definition of Done) <SRCH-002, SRCH-003, SRCH-005; supports ADM-001, SEC-002> — no ADR — the
decision is already made in PRD §40.2; this is build ticket 3 of 10 against it.
Parent sub-PRD: [06-sources-legislation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [SLEG-01 — Legislation adapter primitives (point-in-time, events, title allowlist)](SLEG-01-legislation-adapter-primitives-point-in-time-events-title-allowlist.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §40.7's eight boundaries and PRD §40.8's twelve-item checklist — not a new subsystem decision.

## Background + basis

**The PRD §40.2 row for this group, verbatim:**

| Group ID | Jurisdiction/official entry | Required document families | Minimum adapter capability | Initial tier |
|---|---|---|---|---|
| `LEG-NSW` | NSW legislation — <https://legislation.nsw.gov.au/> | In-force/repealed/as-made Acts/instruments, point-in-time versions, Bills, commencement tables | XML/bulk where permitted; feeds; versions/events | T1 employment scope |

and the scoping rule that closes PRD §40.2:

> "Wave 1 is scoped to employment-related titles and their necessary amending, commencement,
> transitional and interpretation instruments—not every unrelated law in each register. A maintained
> subject/title allowlist plus dependency expansion records why each title is included."

**PRD §6.3 fixes what "employment-related" means for NSW** — this is the ticket's subject scope,
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

Only the **legislation** in that list is this ticket's: NSW Acts, statutory instruments and their
commencement/amendment/repeal history. Rates and official guidance are `07-sources-instruments`
(`PT-NSW`), regulator material is `09-sources-adjacent` (`ADJ-NSW`), and courts/tribunals are
`08-sources-cases` — all three of which build on the legislation this ticket ingests (sub-PRD **D7**).

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

PRD §45.4 makes it a merge gate: "Changes to source adapters include the twelve-item adapter
Definition of Done." `INGF-09` implements all twelve as `ConformanceTestCase`, so this ticket's job is
to make the adapter and its fixtures pass them, not to re-implement the checks.

**Two capabilities in the row are load-bearing for NSW.** *Point-in-time versions* is what
`UAT-SRCH-03` exercises ("Select 2024-08-03 then open result | Version effective at that date opens;
current text is not substituted") and what PRD §6.6's three-financial-year window requires.
*Commencement tables* are the register's own evidence for commencement events, and PRD §15.2 requires
status to be derived from evidenced events — so the commencement table is a first-class parse target,
not decoration. The row also names *XML/bulk where permitted; feeds* — "where permitted" is a licence
question answered by `licence.yaml` (PRD §11.1), and a feed that does not exist means
`change_detection.capability` is lower and the group is `FRESHNESS_LIMITED` (PRD §12.1).

**PRD §40.1 says a roster row is not coverage:** "Every row starts `NOT_STARTED` and must become
`ACTIVE` or an explicit customer-visible limited state before release. The live Source Coverage
Registry will expand each group into exact collections/endpoints, licence snapshots, formats, counts,
date bounds, schedules and gaps." Expanding this group into exact endpoints is deliverable 1, not a
later step.

**PRD §7 and §12.1 give the only honest exits, and the policy governing them is settled.** Plan §8
**Q10** is a **confirmed policy** (sub-PRD **D13**): no mandatory source group is pre-selected for
omission or reduced implementation, every Commonwealth, state and territory mandatory group in the
approved MVP scope must be attempted in full, and arbitrary scope reduction to make a release date
easier is not permitted. `LEG-NSW` is therefore built in full; a limited state is never a way to
make this ticket smaller. A limited state is permitted **only** where measured evidence shows a
genuine limitation prevents `ACTIVE` — an official capability limit, the official body not publishing
the material, a licensing restriction, historical material unavailable, a freshness limitation, or
another real official-source constraint. Where that is measured — for example the register cannot
supply the PRD §40.2 minimum capability — the group takes an explicit status
(`METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED` or `SOURCE_UNAVAILABLE`)
with a customer-visible gap **and** `INGF-07`'s non-null `limitation` block recording the evidence,
the affected dates or collections, the customer-visible warning and why full coverage is unavailable,
and this sub-PRD is updated. Silent omission is prohibited, and no unofficial source or commercial
headnote may substitute for unavailable official material. PRD §44.4: "It is not permitted to
silently call an unimplemented source category covered." That is sub-PRD decision **D8**, and it is a
**writeback**, never a silent downgrade. `GOLD-16` produces the measured evidence and the proposed
registry state and `LNCH-05` verifies that the launch statement discloses it; Gate 2 is the
verification and sign-off step under this policy, not an opportunity to cut mandatory scope.

**PRD §44.2 epic `E10-LEG-STATES`**, week 2, exit evidence *"Each group has independent DoD/report"* —
this ticket is one of that epic's eight, and "independent" is why the eight run as concurrent lanes.

**Downstream (plan §6.2): `SLEG-03 --> SINS-07 & SADJ-02 & SFUT-03 & GOLD-09 & GOLD-16`.**
`SINS-07` (`PT-NSW`, Revenue NSW payroll tax) adds dated rates, thresholds and rulings on top of the
payroll-tax **legislation** this ticket ingests. `SADJ-02` (`ADJ-NSW`: SafeWork NSW,
Anti-Discrimination NSW, SIRA, Long Service Corporation and responsible industrial/public-sector
authorities) adds regulator material on top of the WHS, discrimination, workers-compensation and LSL
legislation this ticket ingests. `SFUT-03` (`FUTURE-NSW`) adds bill/draft/proclamation status on top of
the same register identities. `GOLD-09` authors 64 state/territory evaluation cases "covering all
eight jurisdictions" against real corpus IDs. `GOLD-16` reconciles the full 52-group roster. A later
change to `stable_source_key` derivation invalidates `GOLD-09`'s gold authorities.

**What the framework already provides — do not rebuild it.** `INGF-01` (the `SourceAdapter` protocol,
`AdapterMeta`, `AdapterRunContext`, `IntermediateRecordEnvelope`, record re-exports,
`register_failure_codes`, the `ADAPTER` loading convention); `INGF-02` (`allowlist.yaml` schema and the
only permitted HTTP path); `INGF-03` (artifact store); `INGF-04` (`licence.yaml` schema, snapshot
capture CLI, permitted-use gate); `INGF-05` (`ingestion.sqlite`, run accounting, quarantine reasons,
the §40.9 stage runner, anomaly policy); `INGF-06` (isolated parser/OCR host and `assert_roundtrip`);
`INGF-07` (`registry.yaml` schema, the 52-group roster, freshness composition); `INGF-09` (the twelve
DoD checks, `ReplayFetcher`, `ReplayClock`, `replay_context`, the reference adapter, and the authoring
guide at `pipelines/ingestion/src/<root>/conformance/README.md`). `SLEG-01` provides the legislation
primitives (`_shared.legislation`: `resolve_as_at`, `assert_no_overlap`, `build_event`,
`derive_status`, `stable_node_key`, `NodeTree`, `diff_nodes`, `load_titles`, `FinancialYearWindow`,
`legislation_findings`) and its consumer guide at
`pipelines/adapters/_shared/legislation/README.md`. **Read both guides first; they are written for
exactly this ticket.**

**Carried caveats, documented not re-litigated.** Per-source anomaly thresholds are initial defaults
until a representative baseline (plan §8 **Q9**, sub-PRD **L3**), and `conformance.yaml` overrides
may only tighten — a genuinely looser percentage is a writeback to `GOLD-16`, never a local
override. DoD item 11 may report `DEFERRED(GOLD-16)` until `evals/cases/**` exists (sub-PRD **L8**);
`evals/gold/**` is never read (plan §9 **R9**, PRD §45.1 item 6). `max_quote_chars` and the licence
status are Founder calls (sub-PRD **L7**). No consolidation is ever synthesised (sub-PRD **D10**).

## Goal

Deliver the `LEG-NSW` source adapter under `pipelines/adapters/leg-nsw/**`: the group's
`registry.yaml`, `allowlist.yaml`, `licence.yaml` + immutable `licence-snapshots/`, a `titles.yaml`
subject/title allowlist over the PRD §6.3 NSW employment scope, `conformance.yaml`, and an
`adapter.py` exposing `ADAPTER: SourceAdapter` that implements all eight PRD §40.7 boundaries over the
NSW legislation register — emitting point-in-time `DocumentVersion`s for in-force, repealed and
as-made Acts and instruments, a node hierarchy with exact-text round-trip, and evidenced
`LegalEvent`s including commencements read from the register's commencement tables — together with
the recorded fixtures that make `python -m <root>.conformance check pipelines/adapters/leg-nsw` exit
`0` in **strict** mode with all twelve PRD §40.8 items passing offline, and a
`conformance-report.json` attached to the PR.

## Non-goals

- **No shared legislation primitive.** Point-in-time resolution, status derivation, node lineage, the
  `titles.yaml` schema and the FLAG/BLOCK table are `SLEG-01`'s
  (`pipelines/adapters/_shared/legislation/**`). A helper this adapter wants is added **there** as a
  new sibling ticket, never copied here — plan §9 **R2**: "Never copy the helper into two adapter
  directories."
- **No ingestion-framework change.** HTTP, artifacts, licensing gate, parser host, quarantine, run
  accounting, registry composition, discovery scheduling and the conformance checks are
  `INGF-01`…`INGF-09`'s. A check this adapter cannot pass is a conversation with `INGF-09`, not a
  local weakening.
- **No NSW payroll-tax rates, thresholds, rulings or guidance** — `07-sources-instruments` / `SINS-07`
  (`PT-NSW`, Revenue NSW), which is `blocked_by` this ticket. This ticket ingests the payroll-tax
  **legislation** only (sub-PRD **D7**).
- **No SafeWork NSW, Anti-Discrimination NSW, SIRA or Long Service Corporation material** —
  `09-sources-adjacent` / `SADJ-02` (`ADJ-NSW`), which is `blocked_by` this ticket.
- **No NSW court, tribunal or Industrial Relations Commission decisions** — `08-sources-cases` /
  `SCAS-06` (`CASE-NSW`).
- **No Bills, draft instruments, consultations or the current-vs-future separation model** —
  `10-sources-future` / `SFUT-03` (`FUTURE-NSW`), which is `blocked_by` this ticket. PRD §40.2 lists
  Bills among the register's document families, but PRD §40.6 assigns "Bill/draft/proclamation/
  commencement/repeal status without contaminating current-law answers" to `FUTURE-NSW`, and PRD §6.5
  requires future material to be separated and labelled. This adapter emits `ENACTED_NOT_IN_FORCE`
  for registered material whose commencement is not yet effective — PRD §15.2 requires status to
  follow the evidence — and records a bill's official identifier as version metadata where the
  register supplies it, so `SFUT-03` can resolve it. It ingests no bill documents (sub-PRD **D6**).
- **No corpus write, chunking, tiering or embedding.** PRD §40.7: "The adapter never writes active
  corpus tables directly." `CRPS-03`/`CRPS-04`/`CRPS-05` own the rest.
- **No evaluation cases or gold answers** — `21-evaluation-600` / `GOLD-09`.
- **No live network in CI** — sub-PRD **D12**.
- **No tenant, customer or app-database access.** PRD §39.1: "Python pipeline code never imports
  tenant/customer packages." Standing rule, not a deferral.

## File-scope (write-owns)

- `pipelines/adapters/leg-nsw/**` — the whole group directory, in the layout `INGF-07` deliverable 1
  fixes and `INGF-09` deliverable 7 demonstrates:

  ```text
  pipelines/adapters/leg-nsw/
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
  (sub-PRD **D3**). In practice this ticket appends nothing: adapters may not import an HTTP or
  document-parsing library (`INGF-01` deliverable 11, `INGF-02` deliverable 8). Conflicts resolve by
  re-running `uv lock`, never by hand-merge (plan §1.1, PRD §44.3).
- Does not touch: `pipelines/adapters/_shared/legislation/**` — `SLEG-01` (same module, wave 1).
- Does not touch: `pipelines/adapters/leg-{cth,vic,qld,wa,sa,tas,act,nt}/**` — `SLEG-02`,
  `SLEG-04`…`SLEG-10` (same module, concurrent wave-2 lanes).
- Does not touch: `pipelines/adapters/pt-nsw/**` (`SINS-07`), `pipelines/adapters/adj-nsw/**`
  (`SADJ-02`), `pipelines/adapters/future-nsw/**` (`SFUT-03`), `pipelines/adapters/case-nsw/**`
  (`SCAS-06`), `pipelines/adapters/_shared/{rates,caselaw,future}/**` — modules `07`–`10`.
- Does not touch: `pipelines/ingestion/**` — `05-ingestion-framework`.
- Does not touch: `pipelines/corpus-builder/**`, `pipelines/embeddings/**`,
  `schemas/corpus-manifest/**` — `04-corpus-contract`.
- Does not touch: `pipelines/evaluation/**`, `evals/**` — `21-evaluation-600`. `evals/gold/**` is not
  even read (plan §9 **R9**).
- Does not touch: `packages/**`, `apps/**`, `services/**`, `infra/**`, `schemas/{openapi,events}/**`,
  `tests/**`, `.github/workflows/**`, root manifests and lockfiles.

**Serial safety.** This is the **first decomposition** of `docs/PRD.md` (plan §1 header: `phase: 1`,
`existingFiles: ['.gitkeep']`); nothing is merged and no ticket is in flight, so no prior ticket has
touched `pipelines/adapters/leg-nsw/**`. The only writers anywhere under `pipelines/adapters/` before
this ticket are `FND-01` (the member manifest) and `SLEG-01` (`_shared/legislation/**` plus the
manifest), both of which must have landed — this ticket is `blocked_by SLEG-01`. **Sibling adapter
scopes are disjoint by construction:** plan §4 gives this module one directory per PRD §40.2 group id,
each owned by exactly one ticket, and `INGF-07`'s A2 layout keeps every per-group artefact **inside**
its own directory — there is no shared registry, allowlist, licence, titles or fixture file to contend
on. The eight concurrent sibling lanes therefore share exactly one path with this ticket,
`pipelines/adapters/pyproject.toml`, which is append-only and which none of them expects to modify.

## Deliverables

1. **`registry.yaml` — the Source Coverage Registry row (PRD §40.8 item 1, PRD §6.1).** Validated by
   `python -m <root>.registry validate pipelines/adapters/leg-nsw`. All nine PRD §6.1 attributes:
   `group_id: LEG-NSW`, `wave: 1`; the NSW register's responsible `authority` with `jurisdiction:
   NSW` and `official_url: https://legislation.nsw.gov.au/`; `official_endpoints` — the **exact
   collections, listings, feeds or bulk/XML endpoints this adapter actually calls**, each with
   `kind` and `material_class` (PRD §40.1 requires expansion into exact endpoints; a bare homepage
   URL does not satisfy item 1); `document_coverage.families` covering the PRD §40.2 required
   families — in-force, repealed and as-made Acts/instruments, point-in-time versions, commencement
   tables — and `financial_years` covering at least `2024-25`, `2025-26`, `2026-27` (PRD §6.6) or a
   `customer_visible: true` gap; `licence_ref`; `allowlist_ref`; `adapter_status` — `ACTIVE`, or one
   of PRD §7's four limited states, which is permitted **only** on measured evidence of a genuine
   official-source limitation and then requires both a `customer_visible: true` `known_gaps` entry
   and `INGF-07`'s non-null `limitation` block (`state` equal to `adapter_status`; a `reason_code`
   from the closed set `OFFICIAL_CAPABILITY_LIMIT | MATERIAL_NOT_PUBLISHED | LICENSING_RESTRICTION |
   HISTORICAL_MATERIAL_UNAVAILABLE | FRESHNESS_LIMITATION | OTHER_OFFICIAL_SOURCE_CONSTRAINT`; a
   mandatory `reason_detail`; at least one `evidence` entry; `affected` dates or collections; and a
   `customer_visible_warning`) — sub-PRD **D8**/**D13**, plan §8 **Q10**; `initial_index_tier: T1`
   (PRD §40.2 "T1 employment scope");
   `change_detection.{capability,cadence,supports_conditional_requests,reconciliation}` reflecting
   the **measured** capability of those endpoints — feeds and bulk XML raise it, their absence
   lowers it and yields `FRESHNESS_LIMITED` (PRD §12.1); `known_gaps`; `evaluation_subset_ref` for
   `GOLD-09`/`GOLD-16`.

2. **`allowlist.yaml` (PRD §40.8 item 1, `SEC-002`, PRD §37.4).** `schemes: [https]` only; the
   register's host(s) with explicit `path_prefixes` covering exactly the `official_endpoints` above;
   polite `min_request_interval_ms` and `max_concurrent_requests` (consumed by `INGF-08`);
   `approved_max_bytes` only with a written `approved_max_bytes_reason` — relevant if the register
   offers bulk XML downloads (PRD §37.4's "source-specific approved limit"). The adapter reaches the
   network **only** through `ctx.fetcher`, and `ReplayFetcher` refuses a fixture URL outside this file.

3. **`licence.yaml` + `licence-snapshots/` (PRD §40.8 item 1, PRD §11.1, PRD §35.3).** Capture the
   register's terms with `python -m <root>.licensing capture pipelines/adapters/leg-nsw --terms-url
   <official terms URL>`; the stored file's SHA-256 must equal `snapshot.terms_sha256`. State all
   nine PRD §11.1 axes independently — commercial-use, storage, indexing, embedding, display,
   quotation, export, attribution, prohibited-use — plus `attribution_text`, `max_quote_chars` and one
   of the six PRD §11.1 states. **This is where PRD §40.2's "XML/bulk where permitted" is answered**:
   if bulk access is not permitted, `storage`/`indexing` decisions must say so and the adapter must
   not use it. Unclear rights are `UNCLEAR_RESTRICTED` — PRD §11.1: "Unclear rights default to
   metadata, limited quotation and official links" — and `INGF-04`'s gate collapses them
   conservatively. Never assume permission from the tier (PRD §40.1).

4. **`titles.yaml` — the PRD §40.2 subject/title allowlist (`SLEG-01`'s schema, sub-PRD D5/D7).**
   `subjects` covering the PRD §6.3 NSW topics quoted above — payroll-tax legislation, employment and
   industrial-relations legislation, long service leave, WHS, discrimination and equal opportunity,
   workers compensation, labour hire licensing, portable long service leave, workplace surveillance
   and employment-related privacy, whistleblowing, child employment, public-sector employment. One
   entry per included title with `stable_source_key`, `canonical_title`, `document_type` and an
   `inclusion` reason that is either `SUBJECT_MATCH` (naming the subject) or `DEPENDENCY_EXPANSION`
   (naming `depends_on` and a `dependency_kind` of `AMENDING | COMMENCEMENT | TRANSITIONAL |
   INTERPRETATION | SUBORDINATE`). `adapter.discover()` refuses a title with no recorded reason via
   `unexplained_titles()`. Unrelated NSW law is out of scope (PRD §40.2).

5. **`adapter.py` — `ADAPTER: SourceAdapter` implementing the eight PRD §40.7 boundaries.**
   `AdapterMeta(group_id="LEG-NSW", adapter_key="leg-nsw", jurisdiction="NSW", authority_id=…,
   adapter_version="0.1.0", supported_content_types=[…], declared_quarantine_reasons=[…])`.
   - `discover(ctx, cursor, since)` — over the `official_endpoints`, preferring feeds and bulk/XML
     where the licence permits, with conditional requests where supported; filtered by `titles.yaml`.
     Yields `RemoteDescriptor`s with a stable `descriptor_key`, `etag`/`last_modified` where provided,
     and `hints` carrying the register's identifiers. Paging via `DiscoveryCursor`, never an unbounded
     loop.
   - `fetch(ctx, descriptor, validators)` — `ctx.fetcher` only, passing `FetchValidators` so a 304 is
     possible.
   - `identify(ctx, artifact)` — `stable_source_key` is the register's own permanent identifier for the
     title, never a URL, never a display title, never a hash of content that changes between
     point-in-time versions.
   - `parse(ctx, artifact)` — through `ctx.parser` (`INGF-06`) only; `ParsedBlock` offsets satisfy the
     exact-text round-trip.
   - `normalise(ctx, parsed, identity)` — builds the `DocumentVersionRecord` + `NodeVersionRecord`s via
     `SLEG-01`'s `NodeTree`/`stable_node_key`, setting `version_label`, `publication_date`,
     `effective_from`/`effective_to` from the **point-in-time version** the register publishes,
     `content_hash`, `official_url`, `retrieved_at` and `legal_status` from `derive_status`.
   - `extract_events(ctx, normalised)` — `LegalEventRecord`s for commencement (**read from the
     register's commencement tables**, which PRD §40.2 lists as a required document family and PRD
     §15.2 makes the authority for status), amendment, repeal and as-made registration, each built
     through `build_event` so an unevidenced event cannot be constructed. `event_date` (when notified)
     and `effective_date` (when it takes effect) stay independent.
   - `extract_relations(ctx, normalised)` — from `diff_nodes` plus the register's own amend/renumber
     evidence; `confidence_state` is never `MODEL_SUGGESTED` (PRD §35.2).
   - `validate(ctx, candidate, prior)` — returns `legislation_findings(...)`.
   The module imports no HTTP or parsing library — enforced by `INGF-01`/`INGF-02`'s architecture scan.

6. **`fixtures/discovery/` + `fixtures/dry-run.json` (DoD item 2).** ≥1 recorded discovery response
   per `official_endpoints` entry in `INGF-09`'s recorded-response format, so replay yields ≥1
   `RemoteDescriptor` with a non-empty `descriptor_key` and an allowlisted URL. `dry-run.json` carries
   `{run_at, descriptors_discovered, sample_urls, tool_versions}` from a **one-time live** discovery
   run, `run_at` inside `DRY_RUN_MAX_AGE_DAYS = 180`.

7. **`fixtures/documents/` (DoD items 4 and 5).** Representative artefacts for every media type in
   `AdapterMeta.supported_content_types` — the register's HTML and, where published, XML and PDF
   forms, including at least one **commencement table** artefact. Public official material only, and
   **no customer data**: `INGF-09`'s item-4 scanner rejects TFN/ABN-with-name/email/phone/credential
   patterns, `Set-Cookie` or `Authorization` captures and `.env`-shaped content. Each fixture parses
   through `INGF-06`'s host, satisfies `assert_roundtrip()`, and yields a node hierarchy with one
   root, no cycles, contiguous sibling ordinals and recomputable `text_hash`es.

8. **`fixtures/timepoints/` (DoD item 6).** ≥3 legal dates, one in each PRD §6.6 financial year
   (2024–25, 2025–26, 2026–27), for at least one title with real point-in-time history — a NSW
   employment or payroll-tax Act is the natural choice, since `SINS-07` depends on it. For each date:
   a version whose interval brackets it, a `legal_status` from PRD §6.7's seven values backed by an
   evidence event, and `event_date`/`effective_date` distinguished. No two consolidated versions may
   overlap (PRD §35.2, §40.9).

9. **Incremental scenarios (DoD item 7).** Four recorded scenarios: **no-change** (304 → zero fetched,
   zero quarantined, `last_successful_change_scan_at` advanced, `last_content_ingestion_at`
   unchanged); **changed** (new version emitted, prior version's `effective_to` closed via
   `close_prior_version`); **removed** (a descriptor that disappears yields a `REMOVED` finding and
   **retains** prior state — PRD §40.8 item 3's "deletion/unavailability behaviour"); **transient
   failure** (5xx/timeout → bounded retry then `FETCH_TRANSIENT_FAILURE`, run `PARTIAL`, no content
   quarantine).

10. **`fixtures/baseline.json` + `conformance.yaml` (DoD items 8 and 12).** `baseline.json` records
    `{collections: {name: {count, content_hash_set_sha256}}, captured_at}` and the replayed run must
    reproduce it exactly. `conformance.yaml` carries `resource_ceilings` (`storage_bytes`,
    `parse_wall_ms`, `index_size_estimate_bytes`, `peak_rss_bytes` — PRD §39.2 budgets the host at
    2 GiB) and any `anomaly_overrides`, which may only **tighten** the PRD §40.9 defaults. Plan §8
    **Q9** stands.

11. **Freshness declaration (DoD item 9).** `registry.yaml.change_detection` plus recorded runs
    proving the PRD §12.1 separation: a 304 run advances `last_discovery_check_at` /
    `last_successful_change_scan_at`; only a content run advances `last_content_ingestion_at`. Cadence
    is one of `CRITICAL_6_12H | NORMAL_DAILY | WEEKLY_RECONCILE | MONTHLY_MANIFEST`; a primary state
    register is a critical collection unless the endpoint capability genuinely cannot support it — in
    which case **D8** applies.

12. **`fixtures/quarantine/` and failure codes (DoD item 10).** ≥1 deliberately defective artefact per
    code in `AdapterMeta.declared_quarantine_reasons`, each producing exactly that code, each code
    carrying a non-empty operator action. Reuse `SLEG-01`'s `legislation` codes and `INGF-05`'s
    framework codes first; register a `leg-nsw`-area code only when genuinely group-specific, always
    with its operator action.

13. **`tests/test_conformance.py` — the five-line file `INGF-09` deliverable 1 fixes:**

    ```python
    from pathlib import Path
    from aer_ingestion.conformance import ConformanceTestCase

    class TestLegNsw(ConformanceTestCase):
        group_dir = Path(__file__).resolve().parents[1]
    ```

    plus adapter-specific unit tests in the same directory. No `test_dod_*` method may be overridden —
    `ConformanceOverrideError` is raised at collection time if it is.

14. **`conformance-report.json` attached to the PR** — from
    `python -m <root>.conformance check pipelines/adapters/leg-nsw`, `strict: true`, exit `0`. This is
    the PRD §45.4 evidence and the artefact `GOLD-16` reconciles.

## Acceptance checklist (classified)

**PRD §40.8 Definition of Done — all twelve items.**

- [ ] `[machine]` **DoD 1 — registry row, allowlist, licence.** `registry.yaml`, `allowlist.yaml` and
      `licence.yaml` exist and validate through `INGF-07`/`INGF-02`/`INGF-04`; `group_id` is `LEG-NSW`
      and is in `MANDATORY_SOURCE_GROUPS`; the directory name equals `group_id.lower()`; the licence
      snapshot file's SHA-256 equals `snapshot.terms_sha256`; every `official_endpoints` URL passes the
      allowlist (PRD §40.8 item 1, §6.1, §11.1).
- [ ] `[machine]` **Source Coverage Registry row is complete and composable.**
      `compose_registry(mode="release")` over a tree containing this group reports no
      `MANDATORY_GROUP_MISSING` for `LEG-NSW`, no `REGISTRY_GAP_NOT_VISIBLE` and no
      `REGISTRY_ENDPOINT_NOT_ALLOWLISTED`; the row carries all nine PRD §6.1 attributes, every
      `official_endpoints` entry has a `material_class`, and `adapter_status` satisfies
      `is_release_acceptable()`. When `adapter_status` is one of the four limited states the row also
      carries a valid `limitation` block, so composition reports no `REGISTRY_LIMITATION_MISSING`,
      `REGISTRY_LIMITATION_UNEVIDENCED`, `REGISTRY_LIMITATION_SCOPE_MISSING` or
      `REGISTRY_LIMITATION_WARNING_MISSING`; an `ACTIVE` row carries no `limitation` at all
      (PRD §6.1, §7, §40.1, §44.4; plan §8 **Q10**; sub-PRD **D13**; `ADM-001`).
- [ ] `[fixture]` **DoD 2 — discovery fixture and live dry-run evidence.** Replay yields ≥1
      `RemoteDescriptor` with a non-empty `descriptor_key` and an allowlisted URL; `dry-run.json` has
      the four required fields with `run_at` inside 180 days (PRD §40.8 item 2).
- [ ] `[fixture]` **DoD 3 — stable identity, versions, deletion/unavailability.** `identify()` is
      deterministic across two calls and stable across two point-in-time versions of the same title;
      different titles yield different `stable_source_key`s; a removed descriptor produces a `REMOVED`
      finding and deletes no prior state (PRD §40.8 item 3).
- [ ] `[fixture]` **DoD 4 — representative fixtures without customer data.** `fixtures/documents/`
      covers every declared media type; the no-customer-data scan finds no TFN, ABN-with-name, email,
      phone, credential, `Set-Cookie`/`Authorization` capture or `.env`-shaped content
      (PRD §40.8 item 4, §19.2, §35.3).
- [ ] `[fixture]` **DoD 5 — parser/node hierarchy and exact-text round-trip.** Every document fixture
      parses through `INGF-06`'s host; `assert_roundtrip()` passes; the hierarchy has one root, no
      cycles, contiguous sibling ordinals, and every `text_hash` recomputes (PRD §40.8 item 5, §15.3,
      §35.2; `SRCH-003`).
- [ ] `[fixture]` **DoD 6 — three time points.** One legal date in each of 2024–25, 2025–26 and
      2026–27 resolves to a version whose interval brackets it, with a PRD §6.7 status backed by an
      evidence event and `event_date`/`effective_date` distinguished; no two consolidated versions
      overlap (PRD §40.8 item 6, §6.6, §15.2, §35.2).
- [ ] `[fixture]` **DoD 7 — incremental matrix.** The four scenarios of deliverable 9 each produce
      their expected counts and run status, and the transient-failure case creates **no** content
      quarantine item (PRD §40.8 item 7).
- [ ] `[fixture]` **DoD 8 — count/hash baseline and anomaly thresholds.** The replayed run reproduces
      `fixtures/baseline.json` exactly; `conformance.yaml`'s `anomaly_overrides` pass
      `AnomalyPolicy.for_group()` — tighten-only, no BLOCK downgraded (PRD §40.8 item 8, §40.9).
- [ ] `[fixture]` **DoD 9 — freshness schedule, last-check/last-ingest separation.** `registry.yaml`
      declares `change_detection.{capability,cadence}`; a replayed 304 run and a replayed content run
      write **different** freshness fields (PRD §40.8 item 9, §12.1).
- [ ] `[fixture]` **DoD 10 — quarantine cases and operator recovery.** Every code in
      `declared_quarantine_reasons` has ≥1 defective fixture producing exactly that code, and every
      code has a non-empty `operator_action` in `INGF-05`'s reason table (PRD §40.8 item 10;
      `ADM-001`).
- [ ] `[machine]` **DoD 11 — retrieval/citation evaluation subset.** `evaluation_subset_ref` is
      non-empty and every id matches the evaluation-case id pattern; ids resolve against
      `evals/cases/**` when it exists, otherwise the item reports `DEFERRED(GOLD-16)` with a recorded
      reason. `evals/gold/**` is never read (PRD §40.8 item 11; plan §9 **R9**, PRD §45.1 item 6).
- [ ] `[fixture]` **DoD 12 — measured storage, parse time, index size and peak memory.** All four
      measurements recorded, non-zero and within this group's `conformance.yaml` ceilings
      (PRD §40.8 item 12, §39.2).
- [ ] `[fixture]` **The kit as a whole.** `python -m <root>.conformance check
      pipelines/adapters/leg-nsw` exits `0` with `strict: true`, and the report validates against
      `conformance-report.schema.json` (PRD §45.4).

**Adapter behaviour beyond the kit.**

- [ ] `[machine]` `adapter.py` exposes module-level `ADAPTER` satisfying
      `isinstance(ADAPTER, SourceAdapter)`, and `AdapterMeta.adapter_key == "leg-nsw" ==
      group_id.lower()` (`INGF-01` deliverables 4, 5, 9).
- [ ] `[machine]` **Architecture**: `INGF-01`/`INGF-02`'s scanner reports this directory clean — no
      `httpx`, `requests`, `aiohttp`, `urllib`, `http.client`, `socket`, `sqlite3`, corpus-database or
      document-parsing import; the network is reached only via `ctx.fetcher` and parsing only via
      `ctx.parser` (PRD §37.4, §40.7, §39.1; `SEC-002`).
- [ ] `[machine]` **Title allowlist is total.** `unexplained_titles()` over the discovery fixtures
      returns empty; every `DEPENDENCY_EXPANSION` resolves to another entry (PRD §40.2).
- [ ] `[machine]` **Commencement evidence.** Every `COMMENCEMENT` event emitted from a commencement-table
      fixture carries a resolvable `evidence_node_version_id` pointing into that table's parsed nodes
      (PRD §15.2, §35.2 `legal_event.evidence_node_version_id`; PRD §40.2 "commencement tables").
- [ ] `[machine]` **Status is evidenced.** Every emitted version's `legal_status` traces to a
      `LegalEvent` with a resolvable `evidence_node_version_id`, or is `STATUS_UNCONFIRMED`; no
      relation is emitted with `confidence_state = MODEL_SUGGESTED` (PRD §15.2, §35.2; `SRCH-005`).
- [ ] `[machine]` **Hard-filter fields are populated.** Every emitted `DocumentVersion` carries a
      non-null `document_type`, `effective_from`, `legal_status` and `official_url`, and resolves to
      the `NSW` jurisdiction through its `source`/`authority` (`SRCH-002`; PRD §30.2 "Every result
      independently passes all hard filters"; PRD §36.2).
- [ ] `[machine]` The whole suite runs **offline**: a session fixture asserts no outbound network
      connection is opened during `uv run pytest pipelines/adapters/leg-nsw` (sub-PRD **D12**).
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, PRD §20.3 "Rust and Python builds/tests").
- [ ] `[machine]` `pnpm test` green — standing suite item; this ticket adds no TypeScript, so the
      expectation is "unchanged and green" (plan §1.1, PRD §45.3).

**Human judgment.**

- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (`SRCH-002`, `SRCH-003`,
      `SRCH-005`; supports `ADM-001`, `SEC-002`); UAT IDs — `UAT-SRCH-03` ("Select 2024-08-03 then
      open result | Version effective at that date opens; current text is not substituted") is the
      behaviour this group's point-in-time versions make possible, executed by `14-search-product`;
      schema/API/event compatibility (no schema change — this ticket fills existing schemas);
      tenant/PII/security impact (none — public official material; fixtures scanned by DoD item 4);
      **source/licence impact** (the `licence.yaml` assessment, whether XML/bulk access is permitted,
      `max_quote_chars`, and any `known_gaps`); cost/memory/latency impact (DoD item 12's four
      measurements against PRD §39.2's 2 GiB budget); rollback path (delete the group directory;
      `compose_registry` then reports `MANDATORY_GROUP_MISSING` for `LEG-NSW`, which is the correct
      honest state); known gaps and follow-up ids (`SINS-07`, `SADJ-02`, `SFUT-03`, `GOLD-09`,
      `GOLD-16`; sub-PRD **L3**, **L5**, **L7**, **L8**).
- [ ] `[human]` **Founder review of the coverage claim** — that `titles.yaml` genuinely covers the
      PRD §6.3 NSW topics (including the payroll-tax, WHS, discrimination, workers-compensation, LSL
      and labour-hire legislation that `SINS-07` and `SADJ-02` will build on), that each inclusion
      reason is defensible, and that `known_gaps` states the limitations a customer would need to see.
      PRD §6.1 forbids claiming that every document is included; PRD §41.3 step 1 shows this row to the
      customer in the first demo minute; PRD §43.4 item 4 puts source adapter anomalies in the founder
      review queue (sub-PRD **L5**).
- [ ] `[human]` **Dry-run provenance** — confirm `fixtures/dry-run.json` was produced against the
      official endpoints listed in `registry.yaml`/`allowlist.yaml`, and that the committed document
      fixtures are unmodified official responses. The kit can check shape and freshness offline; it
      cannot check provenance (PRD §40.8 item 2).
- [ ] `[human]` **Writeback obligation as an acceptance item** — if measured evidence shows the
      register cannot supply the PRD §40.2 minimum capability (XML/bulk where permitted, feeds,
      versions/events), the PR sets the limited `adapter_status`, adds the customer-visible gap,
      fills `INGF-07`'s `limitation` block with the evidence, the affected dates or collections and
      the customer-visible warning, **and** updates `docs/prd/06-sources-legislation/README.md` in
      the same change (sub-PRD **D8**/**D13**; plan §8 **Q10**; PRD §7, §12.1, §44.4). A limited
      state asserted without measured evidence, and any scope reduction taken to make delivery
      easier, are both refused.
- **No additional `[fixture]` classes** beyond the DoD items above. Declared explicitly.
- **No `cargo test --workspace` item** — this ticket adds no Rust (plan §1.1).

## Test plan

Harness: `pytest`, run as `uv run pytest pipelines/adapters/leg-nsw -q`, plus the kit CLI. Everything
is **offline**. Construction pattern to copy: `INGF-09`'s reference adapter at
`pipelines/ingestion/src/<root>/conformance/reference/demo-registry/` — same layout, same recorded-
response fixture format, same five-line `test_conformance.py`. Read
`pipelines/ingestion/src/<root>/conformance/README.md` and
`pipelines/adapters/_shared/legislation/README.md` before starting.

1. `uv sync --frozen && uv run pytest pipelines/adapters/leg-nsw -q` — all green.
2. **The twelve DoD items** — `test_conformance.py` collects the twelve inherited `test_dod_NN_*`
   methods; every one passes, item 11 either passing or `DEFERRED(GOLD-16)` with a recorded reason.
3. **The kit CLI** — `python -m <root>.conformance check pipelines/adapters/leg-nsw --report
   conformance-report.json` exits `0`; assert `"strict": true`, `summary.fail == 0`,
   `summary.not_available == 0`. A `--lenient` report is **not** acceptable evidence.
4. **Registry composition** — `python -m <root>.registry validate pipelines/adapters/leg-nsw` exits
   `0`; compose a fixture tree containing this group in `mode="release"` and assert no
   `MANDATORY_GROUP_MISSING` for `LEG-NSW` and that the five PRD §12.1 dates appear as five separate
   fields with `freshness_status` matching the declared capability.
5. **Licence** — `python -m <root>.licensing check pipelines/adapters/leg-nsw` exits `0`; the snapshot
   hash matches; `INGF-04`'s gate returns the expected `LicenceDecision` for each of the six
   `IntendedUse` values, including the bulk/XML storage decision.
6. **Adapter unit tests** — `tests/test_identity.py` (determinism, cross-version stability),
   `tests/test_normalise.py` (node tree, round-trip, point-in-time intervals),
   `tests/test_events.py` (commencement-table evidence resolution, `event_date` vs `effective_date`,
   three time points, consolidated non-overlap).
7. **Incremental matrix** — `tests/test_incremental.py` runs the four recorded scenarios, asserting
   run counts, run status, freshness field movement and the absence of a content quarantine item on
   transient failure.
8. **Architecture** — `tests/test_architecture.py` imports `INGF-01`'s scanner and asserts this
   directory is clean.
9. **Offline guard** — a session fixture that fails the run if any outbound socket is opened.
10. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus, in this order: (a) run the kit CLI and read `conformance-report.json` — `NOT_AVAILABLE`
is a **failure**, not a skip, and `DEFERRED` is legitimate only for item 11; (b) confirm
`adapter_status` matches what the fixtures actually prove — an `ACTIVE` row over a source with
`change_detection.capability: NONE` is the exact dishonesty PRD §7, §12.1 and §44.4 forbid;
(c) confirm every commencement event resolves to evidence in a commencement-table node (PRD §15.2);
(d) confirm the point-in-time intervals do not overlap and that a date inside each of the three
financial years resolves (PRD §6.6, §35.2); (e) confirm the fixtures contain no cookies, tokens or
personal data; (f) confirm nothing in the directory opens a socket or a parser directly (PRD §37.4,
`SEC-002`).

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (a docs PR/MR,
a version note in the sub-PRD changelog, then `publish-tickets.mjs --sync`), and only then change
code. Silent divergence is an incomplete ticket. The ticket wins over any implementation plan
(CLAUDE.md, issue #53). Five tickets are `blocked_by` this one (`SINS-07`, `SADJ-02`, `SFUT-03`,
`GOLD-09`, `GOLD-16`); a change to `stable_source_key` or node-key derivation after merge invalidates
`GOLD-09`'s gold authorities and must be called out in the PR.

**Foreseeable frictions and their exact writeback targets:**

1. **The register does not provide the PRD §40.2 minimum capability** — no XML/bulk or feed, no
   point-in-time versions, no commencement tables, or no evidenced events → this is a **writeback**,
   never a silent downgrade. Set `adapter_status` to the honest PRD §7 value
   (`METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED` or `SOURCE_UNAVAILABLE`),
   add a `known_gaps` entry with `customer_visible: true`, and update the decisions/open-questions
   table in `docs/prd/06-sources-legislation/README.md` **in the same PR**. PRD §7 permits exactly
   those four states; PRD §44.4 forbids calling the category covered; PRD §12.1 forbids a false
   freshness guarantee. Populate `INGF-07`'s `limitation` block in the same change:
   `state`, a closed-set `reason_code`, `reason_detail`, at least one `evidence` entry, the `affected`
   dates or collections and the `customer_visible_warning`. Plan §8 **Q10** is confirmed policy, so
   this is never a scope choice — the limited state is legitimate only on that measured evidence, no
   part of the group may be silently omitted, and no unofficial source or commercial headnote may
   substitute for it. `GOLD-16` carries the evidence and the proposed registry state into the Gate 2
   verification that `LNCH-05` discloses.
2. **Bulk/XML access exists but the licence does not permit it** ("where permitted", PRD §40.2) →
   record the restriction in `licence.yaml`, fall back to the permitted access path, and note the
   consequence in `known_gaps` (slower change detection is a `FRESHNESS_LIMITED` question, not a
   licence workaround). Do not scrape around a licence restriction; PRD §11.1's assessment is binding
   and `INGF-04`'s gate enforces it.
3. **A shared helper is missing from `_shared/legislation`** → do **not** write it inside this
   directory and do **not** copy `SLEG-01`'s code. Plan §9 **R2**: the primitive stays owned by
   `SLEG-01`; the writeback is a new sibling ticket in this module, recorded in
   `docs/prd/06-sources-legislation/README.md`'s work-breakdown table and in
   `docs/prd/breakdown-plan.md` §5.7/§6.2, with this adapter `blocked_by` it. Two adapters wanting the
   same private helper is the early signal.
4. **A conformance item cannot pass for a legitimate reason** (e.g. the register publishes no PDF) →
   use `NOT_APPLICABLE` **with a recorded reason** where `INGF-09` permits it, and record the pattern
   in `docs/prd/05-ingestion-framework/README.md`. Never override a `test_dod_*` method, never add a
   skip, and never use `--lenient` as evidence. If an item is impossible for a whole class of
   registers, that is a change to PRD §40.8 — a **product/spec** change under PRD §45.5. Escalate.
5. **Licence terms are unclear or prohibit storage/indexing** → record the assessment honestly and let
   `INGF-04`'s gate collapse the permission set. If that leaves the group unable to reach `ACTIVE`,
   set `LICENSING_RESTRICTED` and update `docs/prd/06-sources-legislation/README.md` open question
   **L7**. Never raise `max_quote_chars` or soften an axis to make a test pass.
6. **The register publishes no point-in-time text for part of the PRD §6.6 window** → sub-PRD **D10**:
   emit the versions the register actually publishes and record a `DATE_LIMITED` `known_gaps` entry
   with `customer_visible: true`. **Never** reconstruct a consolidation from as-made plus amendments
   and present it as an official version — PRD §6.1 admits only official public sources. Overturning
   D10 requires `docs/adr/NNNN-no-synthesised-consolidations.md` plus the D10/L6 rows in
   `docs/prd/06-sources-legislation/README.md`, escalated before any code is written.
7. **A title `SINS-07` or `SADJ-02` needs is not in `titles.yaml`** → add it here with its inclusion
   reason; that is this ticket's scope under sub-PRD **D7**, and the reason the DAG orders those
   tickets after this one. Do not let a downstream module ingest state legislation itself.
8. **A new failure code needs a quarantine class mapping `INGF-05` does not have** → register the code
   here with its operator action and raise the class mapping against `INGF-05`. Do not edit
   `INGF-05`'s reason table — it is another module's file-scope.

**Escalation rule.** If the twelve-item Definition of Done cannot be met for `LEG-NSW`, stop and
escalate. PRD §26 requires all five source waves to have active or explicitly limited registry
status, and PRD §44.4 permits exactly two outcomes: continue work and delay production access, or
launch with this group in an explicit, customer-visible limited state. The second is available only
on measured evidence of a genuine official-source limitation, recorded in `INGF-07`'s `limitation`
block (plan §8 **Q10**, confirmed policy); it is not a route to reducing mandatory scope. Quietly
shipping a group that claims more coverage than it has is not one of them.
