---
id: SLEG-02
title: "`LEG-CTH` — Federal Register of Legislation"
module: 06-sources-legislation
lane: 06-sources-legislation
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [SLEG-01]
blocks: [SADJ-01, SFUT-02, GOLD-05, GOLD-16]
---

# SLEG-02 — `LEG-CTH` — Federal Register of Legislation

Implements PRD §40.2 (`LEG-CTH` source group), PRD §6.2 (Commonwealth and national scope) and
PRD §40.8 (adapter Definition of Done) <SRCH-002, SRCH-003, SRCH-005; supports ADM-001, SEC-002> — no
ADR — the decision is already made in PRD §40.2; this is build ticket 2 of 10 against it.
Parent sub-PRD: [06-sources-legislation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [SLEG-01 — Legislation adapter primitives (point-in-time, events, title allowlist)](SLEG-01-legislation-adapter-primitives-point-in-time-events-title-allowlist.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §40.7's eight boundaries and PRD §40.8's twelve-item checklist — not a new subsystem decision.

## Background + basis

**The PRD §40.2 row for this group, verbatim:**

| Group ID | Jurisdiction/official entry | Required document families | Minimum adapter capability | Initial tier |
|---|---|---|---|---|
| `LEG-CTH` | Federal Register of Legislation — <https://www.legislation.gov.au/> | Acts, regulations/instruments, compilations, as-made, amendments, commencement, repeal, histories | Structured discovery; versions; node hierarchy; events | T1 employment scope |

and the scoping rule that closes PRD §40.2:

> "Wave 1 is scoped to employment-related titles and their necessary amending, commencement,
> transitional and interpretation instruments—not every unrelated law in each register. A maintained
> subject/title allowlist plus dependency expansion records why each title is included."

**PRD §6.2 fixes what "employment-related" means at the Commonwealth level** — this is the ticket's
subject scope, quoted in full because the title allowlist is judged against it:

> - Fair Work Act, regulations and National Employment Standards.
> - Modern awards, variations, orders, classifications and relevant pay data.
> - Enterprise agreements and their approval, variation, replacement and termination chains.
> - Fair Work Commission decisions, orders and Full Bench material.
> - Fair Work Ombudsman official guidance.
> - PAYG, Single Touch Payroll, FBT, superannuation and Payday Super materials relevant to
>   employment/payroll.
> - Employment-related migration and right-to-work materials.
> - Employment-related privacy, surveillance and whistleblowing material.
> - Commonwealth public-sector employment material.

Only the **legislation** in that list is this ticket's: the Acts, regulations, legislative instruments
and their commencement/amendment/repeal history on the Federal Register. Awards, agreements, FWC
decisions, FWO guidance and ATO material are separate PRD §40.3/§40.4 groups owned by
`07-sources-instruments` and `08-sources-cases` — see *Non-goals*.

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

**PRD §40.1 says a roster row is not coverage:** "The rows below are mandatory source groups, not
claims that adapters already exist. Every row starts `NOT_STARTED` and must become `ACTIVE` or an
explicit customer-visible limited state before release. The live Source Coverage Registry will expand
each group into exact collections/endpoints, licence snapshots, formats, counts, date bounds,
schedules and gaps." Expanding this group into exact endpoints is this ticket's deliverable 1, not a
later step.

**PRD §7 and §12.1 give the only honest exits, and the policy governing them is settled.** Plan §8
**Q10** is a **confirmed policy** (sub-PRD **D13**): no mandatory source group is pre-selected for
omission or reduced implementation, every Commonwealth, state and territory mandatory group in the
approved MVP scope must be attempted in full, and arbitrary scope reduction to make a release date
easier is not permitted. `LEG-CTH` is therefore built in full; a limited state is never a way to
make this ticket smaller. A limited state is permitted **only** where measured evidence shows a
genuine limitation prevents `ACTIVE` — an official capability limit, the official body not publishing
the material, a licensing restriction, historical material unavailable, a freshness limitation, or
another real official-source constraint. Where that is measured — for example the register cannot
supply the PRD §40.2 minimum capability of structured discovery, versions, node hierarchy and
events — the group takes an explicit status (`METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`,
`LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`) with a customer-visible gap **and** `INGF-07`'s
non-null `limitation` block recording the evidence, the affected dates or collections, the
customer-visible warning and why full coverage is unavailable, and this sub-PRD is updated. Silent
omission is prohibited, and no unofficial source or commercial headnote may substitute for
unavailable official material. PRD §12.1: "Sources without reliable delta mechanisms MUST show
`FRESHNESS_LIMITED` rather than a false guarantee." PRD §44.4: "It is not permitted to silently call
an unimplemented source category covered." That is sub-PRD decision **D8** and it is a **writeback**,
never a silent downgrade. `GOLD-16` produces the measured evidence and the proposed registry state
and `LNCH-05` verifies that the launch statement discloses it; Gate 2 is the verification and
sign-off step under this policy, not an opportunity to cut mandatory scope.

**PRD §44.2 epic `E09-LEG-CTH`**, week 2, exit evidence *"Adapter DoD + temporal search fixture"*,
depends on `E08` (the ingestion framework). This is that epic's single ticket.

**Downstream (plan §6.2): `SLEG-02 --> SADJ-01 & SFUT-02 & GOLD-05 & GOLD-16`.**
`SADJ-01` (`ADJ-CTH`: Home Affairs, OAIC, AHRC, Comcare, DEWR) adds regulator material **on top of**
the Commonwealth legislation this ticket ingests. `SFUT-02` (`FUTURE-CTH`) adds bills, assent,
enacted-not-commenced and disallowance status on top of the same register identities.
`GOLD-05` authors 80 federal Fair Work/NES/core employment evaluation cases "with gold authorities on
real corpus IDs" — i.e. the `stable_source_key`s and node keys this ticket emits. `GOLD-16`
reconciles the full 52-group roster. All four are written against the identities and events produced
here; a later change to `stable_source_key` derivation invalidates `GOLD-05`'s gold data.

**What the framework already provides — do not rebuild it.** `INGF-01` (the `SourceAdapter` protocol,
`AdapterMeta`, `AdapterRunContext`, `IntermediateRecordEnvelope`, record re-exports,
`register_failure_codes`, `ADAPTER` loading convention); `INGF-02` (`allowlist.yaml` schema and the
only permitted HTTP path); `INGF-03` (artifact store); `INGF-04` (`licence.yaml` schema, snapshot
capture CLI, permitted-use gate); `INGF-05` (`ingestion.sqlite`, run accounting, quarantine reasons,
the §40.9 stage runner, anomaly policy); `INGF-06` (isolated parser/OCR host and `assert_roundtrip`);
`INGF-07` (`registry.yaml` schema, the 52-group roster, freshness composition); `INGF-09` (the twelve
DoD checks, `ReplayFetcher`, `ReplayClock`, `replay_context`, the reference adapter and the authoring
guide at `pipelines/ingestion/src/<root>/conformance/README.md`). `SLEG-01` provides the legislation
primitives (`_shared.legislation`: `resolve_as_at`, `assert_no_overlap`, `build_event`,
`derive_status`, `stable_node_key`, `NodeTree`, `diff_nodes`, `load_titles`,
`FinancialYearWindow`, `legislation_findings`) and its consumer guide at
`pipelines/adapters/_shared/legislation/README.md`. **Read that guide and `INGF-09`'s authoring guide
first; they are written for exactly this ticket.**

**Carried caveats, documented not re-litigated.**
- Per-source anomaly thresholds are initial defaults until a representative baseline (plan §8 **Q9**,
  sub-PRD **L3**); overrides in `conformance.yaml` may only tighten (`INGF-05`'s `AnomalyPolicy`),
  and a genuinely looser percentage is a writeback to `GOLD-16`, never a local override.
- The evaluation subset (DoD item 11) may report `DEFERRED(GOLD-16)` until `evals/cases/**` exists —
  the single deferrable item (`INGF-09` deliverable 4; sub-PRD **L8**). `evals/gold/**` is never read
  (plan §9 **R9**, PRD §45.1 item 6).
- `max_quote_chars` and the licence status are Founder calls (sub-PRD **L7**,
  `05-ingestion-framework` M2); unclear rights collapse conservatively through `INGF-04`'s gate.
- No consolidation is ever synthesised (sub-PRD **D10**); a missing point-in-time version is a
  `DATE_LIMITED` customer-visible gap.

## Goal

Deliver the `LEG-CTH` source adapter under `pipelines/adapters/leg-cth/**`: the group's
`registry.yaml`, `allowlist.yaml`, `licence.yaml` + immutable `licence-snapshots/`, `titles.yaml`
subject/title allowlist over the PRD §6.2 Commonwealth employment scope, `conformance.yaml`, and an
`adapter.py` exposing `ADAPTER: SourceAdapter` that implements all eight PRD §40.7 boundaries over the
Federal Register of Legislation — emitting `DocumentVersion`s with real effective intervals, a node
hierarchy with exact-text round-trip, and evidenced `LegalEvent`s for commencement, amendment and
repeal — together with the recorded fixtures that make
`python -m <root>.conformance check pipelines/adapters/leg-cth` exit `0` in **strict** mode with all
twelve PRD §40.8 items passing offline, and a `conformance-report.json` attached to the PR.

## Non-goals

- **No shared legislation primitive.** Point-in-time resolution, status derivation, node lineage,
  the `titles.yaml` schema and the FLAG/BLOCK table are `SLEG-01`'s
  (`pipelines/adapters/_shared/legislation/**`). A helper this adapter wants is added **there** as a
  new sibling ticket, never copied here — plan §9 **R2**: "Never copy the helper into two adapter
  directories."
- **No ingestion-framework change.** HTTP, artifacts, licensing gate, parser host, quarantine, run
  accounting, registry composition, discovery scheduling and the conformance checks are
  `INGF-01`…`INGF-09`'s. A check this adapter cannot pass is a conversation with `INGF-09`, not a
  local weakening — `ConformanceTestCase` raises `ConformanceOverrideError` if you try.
- **No other source group.** `FWC-DOCS`, `FWC-AWARDS`, `FWC-AGREEMENTS`, `FWO-GUIDANCE` and
  `ATO-EMPLOYMENT` are PRD §40.3 groups owned by `07-sources-instruments`; `CASE-HCA`/`CASE-FCA`/
  `CASE-FCFCOA`/`CASE-FWC` are PRD §40.4 groups owned by `08-sources-cases`; `ADJ-CTH` is a PRD §40.5
  group owned by `09-sources-adjacent` (`SADJ-01`, which is `blocked_by` this ticket).
- **No Bills, explanatory memoranda, assent-not-commenced tracking or disallowance events as a
  product feature** — `10-sources-future` / `SFUT-02` (`FUTURE-CTH`), which is `blocked_by` this
  ticket. This adapter emits `ENACTED_NOT_IN_FORCE` for registered material whose commencement is not
  yet effective, because PRD §15.2 requires status to follow the evidence, and stops there (sub-PRD
  **D6**).
- **No corpus write, chunking, tiering or embedding.** PRD §40.7: "The adapter never writes active
  corpus tables directly. It emits versioned intermediate records with source URL, artifact hash and
  tool version." `CRPS-03`/`CRPS-04`/`CRPS-05` own the rest.
- **No evaluation cases or gold answers** — `21-evaluation-600` / `GOLD-05`. This ticket declares
  `evaluation_subset_ref` ids in `registry.yaml`; `GOLD-05` authors the cases and `GOLD-16` reconciles.
- **No live network in CI.** Sub-PRD **D12**: the one live interaction is a one-time discovery dry run
  whose evidence is committed as `fixtures/dry-run.json`; every test replays recorded fixtures.
- **No tenant, customer or app-database access.** PRD §39.1: "Python pipeline code never imports
  tenant/customer packages." Standing rule, not a deferral.

## File-scope (write-owns)

- `pipelines/adapters/leg-cth/**` — the whole group directory, in the layout `INGF-07` deliverable 1
  fixes and `INGF-09` deliverable 7 demonstrates:

  ```text
  pipelines/adapters/leg-cth/
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
  document-parsing library (`INGF-01` deliverable 11, `INGF-02` deliverable 8), so there is no
  dependency to declare. If one is genuinely required, append only it and re-run `uv lock`; never
  hand-merge (plan §1.1, PRD §44.3).
- Does not touch: `pipelines/adapters/_shared/legislation/**` — `SLEG-01` (same module, wave 1).
- Does not touch: `pipelines/adapters/leg-{nsw,vic,qld,wa,sa,tas,act,nt}/**` — `SLEG-03`…`SLEG-10`
  (same module, concurrent wave-2 lanes).
- Does not touch: `pipelines/adapters/_shared/{rates,caselaw,future}/**` and every other
  `pipelines/adapters/<group>/**` — modules `07`–`10`.
- Does not touch: `pipelines/ingestion/**` — `05-ingestion-framework`.
- Does not touch: `pipelines/corpus-builder/**`, `pipelines/embeddings/**`,
  `schemas/corpus-manifest/**` — `04-corpus-contract`.
- Does not touch: `pipelines/evaluation/**`, `evals/**` — `21-evaluation-600`. `evals/gold/**` is not
  even read (plan §9 **R9**).
- Does not touch: `packages/**`, `apps/**`, `services/**`, `infra/**`, `schemas/{openapi,events}/**`,
  `tests/**`, `.github/workflows/**`, root manifests and lockfiles.

**Serial safety.** This is the **first decomposition** of `docs/PRD.md` (plan §1 header: `phase: 1`,
`existingFiles: ['.gitkeep']`); nothing is merged and no ticket is in flight, so no prior ticket has
touched `pipelines/adapters/leg-cth/**`. The only writers anywhere under `pipelines/adapters/` before
this ticket are `FND-01` (the member manifest) and `SLEG-01` (`_shared/legislation/**` plus the
manifest), both of which must have landed — this ticket is `blocked_by SLEG-01`. **Sibling adapter
scopes are disjoint by construction:** plan §4 gives this module one directory per PRD §40.2 group id
(`leg-cth`, `leg-nsw`, `leg-vic`, `leg-qld`, `leg-wa`, `leg-sa`, `leg-tas`, `leg-act`, `leg-nt`), each
owned by exactly one ticket, and `INGF-07`'s A2 layout keeps every per-group artefact **inside** its
own directory — there is no shared registry, allowlist, licence or fixture file to contend on. The
eight concurrent `SLEG-03`…`SLEG-10` lanes therefore share exactly one path with this ticket,
`pipelines/adapters/pyproject.toml`, which is append-only and which none of them expects to modify.

## Deliverables

1. **`registry.yaml` — the Source Coverage Registry row (PRD §40.8 item 1, PRD §6.1).** Validated by
   `python -m <root>.registry validate pipelines/adapters/leg-cth`. All nine PRD §6.1 attributes:
   - `group_id: LEG-CTH`, `wave: 1` (PRD §40.2);
   - `authority` — the Federal Register's responsible authority with `authority_type`,
     `jurisdiction: CTH`, `official_url: https://www.legislation.gov.au/`;
   - `official_endpoints` — **the exact collections/listings/feeds this adapter actually calls**, each
     with `kind` (`LISTING|FEED|API|SITEMAP|MANIFEST|DOCUMENT`) and `material_class`
     (`LAW|OPERATIVE_INSTRUMENT|DECISION|CODE|GUIDANCE|POLICY|NEWS`). PRD §40.1 requires the group to
     be "expanded into exact collections/endpoints" — a bare homepage URL does not satisfy item 1.
     Every URL must pass `allowlist.yaml` (`INGF-07` fails otherwise with
     `REGISTRY_ENDPOINT_NOT_ALLOWLISTED`);
   - `document_coverage.families` covering the PRD §40.2 required families — Acts,
     regulations/instruments, compilations, as-made, amendments, commencement, repeal, histories — and
     `financial_years` covering at least `2024-25`, `2025-26`, `2026-27` (PRD §6.6) or a
     `customer_visible: true` gap explaining the shortfall;
   - `licence_ref: ./licence.yaml`, `allowlist_ref: ./allowlist.yaml`;
   - `adapter_status` — `ACTIVE`, or one of PRD §7's four limited states, which is permitted **only**
     on measured evidence of a genuine official-source limitation and then requires both a
     `customer_visible: true` `known_gaps` entry and `INGF-07`'s non-null `limitation` block (`state`
     equal to `adapter_status`; a `reason_code` from the closed set `OFFICIAL_CAPABILITY_LIMIT |
     MATERIAL_NOT_PUBLISHED | LICENSING_RESTRICTION | HISTORICAL_MATERIAL_UNAVAILABLE |
     FRESHNESS_LIMITATION | OTHER_OFFICIAL_SOURCE_CONSTRAINT`; a mandatory `reason_detail`; at least
     one `evidence` entry; `affected` dates or collections; and a `customer_visible_warning`) —
     sub-PRD **D8**/**D13**, plan §8 **Q10**;
   - `initial_index_tier: T1` — PRD §40.2 "T1 employment scope";
   - `change_detection.{capability,cadence,supports_conditional_requests,reconciliation}` — the
     **measured** capability of the endpoints in this file, not an aspiration. `NONE` yields
     `FRESHNESS_LIMITED` and that is the correct outcome when it is true (PRD §12.1);
   - `known_gaps` — every known limitation with `reason_code` and `customer_visible`;
   - `evaluation_subset_ref` — ids for `GOLD-05`/`GOLD-16` (DoD item 11).

2. **`allowlist.yaml` (PRD §40.8 item 1, `SEC-002`, PRD §37.4).** `schemes: [https]` only; the
   register's host(s) with explicit `path_prefixes` covering exactly the `official_endpoints` above;
   `min_request_interval_ms` and `max_concurrent_requests` set politely (consumed by `INGF-08`);
   `approved_max_bytes` only with a written `approved_max_bytes_reason` (PRD §37.4's "source-specific
   approved limit"). The adapter reaches the network **only** through `ctx.fetcher`, and `INGF-09`'s
   `ReplayFetcher` refuses a fixture URL outside this file — a fixture cannot legitimise an
   off-allowlist URL.

3. **`licence.yaml` + `licence-snapshots/` (PRD §40.8 item 1, PRD §11.1, PRD §35.3).** Capture the
   register's terms with `python -m <root>.licensing capture pipelines/adapters/leg-cth --terms-url
   <official terms URL>` so the snapshot is fetched through the allowlisted safe fetcher and stored
   immutably; the file's SHA-256 must equal `snapshot.terms_sha256`. The assessment states **all nine
   PRD §11.1 axes independently** — commercial-use, storage, indexing, embedding, display, quotation,
   export, attribution, prohibited-use — plus `attribution_text`, `max_quote_chars` and one of the six
   PRD §11.1 states. Where rights are unclear, record `UNCLEAR_RESTRICTED`: PRD §11.1 —
   "Unclear rights default to metadata, limited quotation and official links" — and `INGF-04`'s gate
   collapses it conservatively. Do not assume permission from the tier (PRD §40.1: "Licensing can only
   reduce permitted display/indexing, never be assumed from the tier").

4. **`titles.yaml` — the PRD §40.2 subject/title allowlist (`SLEG-01`'s schema, sub-PRD D5/D7).**
   `subjects` drawn from the PRD §6.2 Commonwealth scope quoted above; one entry per included title
   with `stable_source_key`, `canonical_title`, `document_type` and an `inclusion` reason that is
   either `SUBJECT_MATCH` (naming the subject) or `DEPENDENCY_EXPANSION` (naming `depends_on` and a
   `dependency_kind` of `AMENDING | COMMENCEMENT | TRANSITIONAL | INTERPRETATION | SUBORDINATE`).
   The Fair Work Act and its regulations, the National Employment Standards material, and the
   employment-related migration/right-to-work, privacy/surveillance/whistleblowing, superannuation and
   PAYG/STP/FBT **legislation and legislative instruments** named in PRD §6.2 are in scope; unrelated
   Commonwealth law is not (PRD §40.2). `adapter.discover()` refuses a title with no recorded reason
   via `unexplained_titles()`.

5. **`adapter.py` — `ADAPTER: SourceAdapter` implementing the eight PRD §40.7 boundaries.**
   Module-level `ADAPTER` is the only export `INGF-01`'s `load_adapter` needs.
   `AdapterMeta(group_id="LEG-CTH", adapter_key="leg-cth", jurisdiction="CTH", authority_id=…,
   adapter_version="0.1.0", supported_content_types=[…], declared_quarantine_reasons=[…])`.
   - `discover(ctx, cursor, since)` — structured discovery over the `official_endpoints`, using
     conditional requests where the endpoint supports them, filtered by `titles.yaml`. Yields
     `RemoteDescriptor`s with a **stable** `descriptor_key`, `etag`/`last_modified` where the endpoint
     provides them, and `hints` carrying the register's own identifiers. Paging is expressed through
     `DiscoveryCursor`, never an unbounded loop.
   - `fetch(ctx, descriptor, validators)` — `ctx.fetcher` only; passes `FetchValidators` so a 304 is
     possible; returns the framework's `ArtifactRef`.
   - `identify(ctx, artifact)` — `StableDocumentIdentity` whose `stable_source_key` is the register's
     own permanent identifier for the title (never a URL, never a title string, never a hash of
     content that changes between compilations), plus `document_type`, `official_identifier`,
     `canonical_title`. Determinism and cross-version stability are DoD item 3.
   - `parse(ctx, artifact)` — through `ctx.parser` (`INGF-06`) only. Returns `ParsedDocument` with
     `ParsedBlock`s whose `start_offset`/`end_offset` satisfy the exact-text round-trip.
   - `normalise(ctx, parsed, identity)` — builds `DocumentVersionRecord` +
     `Sequence[NodeVersionRecord]` via `SLEG-01`'s `NodeTree` and `stable_node_key`, setting
     `version_label`, `publication_date`, `effective_from`/`effective_to`, `content_hash`,
     `official_url`, `retrieved_at` and `legal_status` from `derive_status`.
   - `extract_events(ctx, normalised)` — `LegalEventRecord`s for commencement, amendment, repeal,
     compilation registration and as-made registration, each built through `SLEG-01`'s `build_event`
     so an unevidenced event cannot be constructed (PRD §15.2, PRD §35.2
     `legal_event.evidence_node_version_id`).
   - `extract_relations(ctx, normalised)` — `NodeRelationRecord`s from `diff_nodes` plus the register's
     own amend/renumber evidence; `confidence_state` is never `MODEL_SUGGESTED` (PRD §35.2).
   - `validate(ctx, candidate, prior)` — returns `SLEG-01`'s `legislation_findings(...)`; the runner
     (`INGF-05`) decides quarantine consequences.
   The module imports no HTTP or parsing library — enforced by `INGF-01`/`INGF-02`'s architecture scan.

6. **`fixtures/discovery/` + `fixtures/dry-run.json` (DoD item 2).** At least one recorded discovery
   response per `official_endpoints` entry, in `INGF-09`'s committed recorded-response format, so
   replay through `ReplayFetcher` yields ≥1 `RemoteDescriptor` with a non-empty `descriptor_key` and an
   allowlisted URL. `dry-run.json` carries `{run_at, descriptors_discovered, sample_urls,
   tool_versions}` from a **one-time live** discovery run against the official endpoints, with `run_at`
   inside `DRY_RUN_MAX_AGE_DAYS = 180`.

7. **`fixtures/documents/` (DoD items 4 and 5).** Representative artefacts covering every media type
   declared in `AdapterMeta.supported_content_types` — the register's HTML/XML document formats and,
   where it publishes them, PDF. Public official material only, and **no customer data**: `INGF-09`'s
   item-4 scanner rejects TFN/ABN-with-name/email/phone/credential patterns, `Set-Cookie` or
   `Authorization` header captures and `.env`-shaped content. Each fixture must parse through
   `INGF-06`'s host, satisfy `assert_roundtrip()`, and produce a node hierarchy with one root, no
   cycles, contiguous sibling ordinals and recomputable `text_hash`es.

8. **`fixtures/timepoints/` (DoD item 6).** At least three legal dates, one in each PRD §6.6 financial
   year (2024–25, 2025–26, 2026–27), for at least one title with real version history — the Fair Work
   Act and its compilations are the natural choice. For each date: `normalise()` + `extract_events()`
   produce a version whose interval brackets the date, a `legal_status` from PRD §6.7's seven values
   backed by an evidence event, and `event_date`/`effective_date` kept distinct (PRD §15.2). No two
   consolidated versions may overlap (PRD §35.2, §40.9).

9. **Incremental scenarios (DoD item 7).** Four recorded scenarios: **no-change** (304 → zero fetched,
   zero quarantined, `last_successful_change_scan_at` advanced, `last_content_ingestion_at`
   unchanged); **changed** (new version emitted, prior version's `effective_to` closed via
   `close_prior_version`); **removed** (a descriptor that disappears yields a `REMOVED` finding and
   **retains** prior state — PRD §40.8 item 3's "deletion/unavailability behaviour"); **transient
   failure** (5xx/timeout → bounded retry then `FETCH_TRANSIENT_FAILURE`, run `PARTIAL`, no content
   quarantine).

10. **`fixtures/baseline.json` + `conformance.yaml` (DoD items 8 and 12).** `baseline.json` records
    `{collections: {name: {count, content_hash_set_sha256}}, captured_at}` and the replayed run must
    reproduce it exactly. `conformance.yaml` carries this group's `resource_ceilings`
    (`storage_bytes`, `parse_wall_ms`, `index_size_estimate_bytes`, `peak_rss_bytes` — PRD §39.2
    budgets the host at 2 GiB, so these are release inputs) and any `anomaly_overrides`, which may
    only **tighten** the PRD §40.9 defaults (`INGF-05`'s `AnomalyPolicy` raises `AnomalyPolicyError`
    otherwise). Plan §8 **Q9** stands: these are initial defaults, tightened once this register has
    a representative baseline.

11. **Freshness declaration (DoD item 9).** `registry.yaml.change_detection` plus recorded runs proving
    the separation PRD §12.1 mandates: a 304 run advances `last_discovery_check_at` /
    `last_successful_change_scan_at`; only a content run advances `last_content_ingestion_at`. Cadence
    is one of `CRITICAL_6_12H | NORMAL_DAILY | WEEKLY_RECONCILE | MONTHLY_MANIFEST`
    (PRD §12.1); `LEG-CTH` is a critical collection for employment law, so `CRITICAL_6_12H` unless the
    endpoint capability genuinely cannot support it — in which case **D8** applies.

12. **`fixtures/quarantine/` and failure codes (DoD item 10).** At least one deliberately defective
    artefact per code in `AdapterMeta.declared_quarantine_reasons`, each producing exactly that code,
    each code carrying a non-empty operator action. Reuse `SLEG-01`'s `legislation` codes and
    `INGF-05`'s framework codes first; register a `leg-cth`-area code only when genuinely
    group-specific, always with its operator action (`INGF-01`'s `register_failure_codes`).

13. **`tests/test_conformance.py` — the five-line file `INGF-09` deliverable 1 fixes:**

    ```python
    from pathlib import Path
    from aer_ingestion.conformance import ConformanceTestCase

    class TestLegCth(ConformanceTestCase):
        group_dir = Path(__file__).resolve().parents[1]
    ```

    plus adapter-specific unit tests in the same directory for the register's parsing and identity
    rules. No `test_dod_*` method may be overridden — `ConformanceOverrideError` is raised at
    collection time if it is.

14. **`conformance-report.json` attached to the PR** — produced by
    `python -m <root>.conformance check pipelines/adapters/leg-cth`, `strict: true`, exit `0`. This is
    the PRD §45.4 evidence and the artefact `GOLD-16` reconciles.

## Acceptance checklist (classified)

**PRD §40.8 Definition of Done — all twelve items.**

- [ ] `[machine]` **DoD 1 — registry row, allowlist, licence.** `registry.yaml`, `allowlist.yaml` and
      `licence.yaml` exist and validate through `INGF-07`/`INGF-02`/`INGF-04`; `group_id` is `LEG-CTH`
      and is in `MANDATORY_SOURCE_GROUPS`; the directory name equals `group_id.lower()`; the licence
      snapshot file's SHA-256 equals `snapshot.terms_sha256`; every `official_endpoints` URL passes the
      allowlist (PRD §40.8 item 1, §6.1, §11.1).
- [ ] `[machine]` **Source Coverage Registry row is complete and composable.**
      `compose_registry(mode="release")` over a tree containing this group reports no
      `MANDATORY_GROUP_MISSING` for `LEG-CTH`, no `REGISTRY_GAP_NOT_VISIBLE` and no
      `REGISTRY_ENDPOINT_NOT_ALLOWLISTED`; the row carries all nine PRD §6.1 attributes, every
      `official_endpoints` entry has a `material_class`, and `adapter_status` satisfies
      `is_release_acceptable()`. When `adapter_status` is one of the four limited states the row also
      carries a valid `limitation` block, so composition reports no `REGISTRY_LIMITATION_MISSING`,
      `REGISTRY_LIMITATION_UNEVIDENCED`, `REGISTRY_LIMITATION_SCOPE_MISSING` or
      `REGISTRY_LIMITATION_WARNING_MISSING`; an `ACTIVE` row carries no `limitation` at all
      (PRD §6.1, §7, §40.1, §44.4; plan §8 **Q10**; sub-PRD **D13**; `ADM-001`).
- [ ] `[fixture]` **DoD 2 — discovery fixture and live dry-run evidence.** Replaying
      `fixtures/discovery/` through `ReplayFetcher` yields ≥1 `RemoteDescriptor` with a non-empty
      `descriptor_key` and an allowlisted URL; `fixtures/dry-run.json` has
      `{run_at, descriptors_discovered, sample_urls, tool_versions}` with `run_at` inside 180 days
      (PRD §40.8 item 2).
- [ ] `[fixture]` **DoD 3 — stable identity, versions, deletion/unavailability.** `identify()` is
      deterministic across two calls and stable across two versions of the same title; different
      titles yield different `stable_source_key`s; a removed descriptor produces a `REMOVED` finding
      and deletes no prior state (PRD §40.8 item 3).
- [ ] `[fixture]` **DoD 4 — representative fixtures without customer data.** `fixtures/documents/`
      covers every declared media type; the no-customer-data scan finds no TFN, ABN-with-name, email,
      phone, credential, `Set-Cookie`/`Authorization` capture or `.env`-shaped content
      (PRD §40.8 item 4, §19.2, §35.3).
- [ ] `[fixture]` **DoD 5 — parser/node hierarchy and exact-text round-trip.** Every document fixture
      parses through `INGF-06`'s host; `assert_roundtrip()` passes; the node hierarchy has one root,
      no cycles, contiguous sibling ordinals, and every `text_hash` recomputes from `canonical_text`
      (PRD §40.8 item 5, §15.3, §35.2; `SRCH-003`).
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
- [ ] `[machine]` **DoD 11 — retrieval/citation evaluation subset.** `registry.yaml`'s
      `evaluation_subset_ref` is non-empty and every id matches the evaluation-case id pattern; ids
      resolve against `evals/cases/**` when it exists, otherwise the item reports `DEFERRED(GOLD-16)`
      with a `conformance.yaml` reason — the single deferrable item. `evals/gold/**` is never read
      (PRD §40.8 item 11; plan §9 **R9**, PRD §45.1 item 6).
- [ ] `[fixture]` **DoD 12 — measured storage, parse time, index size and peak memory.** The replayed
      full run records `storage_bytes`, `parse_wall_ms`, `index_size_estimate_bytes` and
      `peak_rss_bytes`, all non-zero and each within this group's `conformance.yaml` ceiling
      (PRD §40.8 item 12, §39.2).
- [ ] `[fixture]` **The kit as a whole.** `python -m <root>.conformance check
      pipelines/adapters/leg-cth` exits `0` with `strict: true`, and the emitted
      `conformance-report.json` validates against `conformance-report.schema.json` (PRD §45.4).

**Adapter behaviour beyond the kit.**

- [ ] `[machine]` `pipelines/adapters/leg-cth/adapter.py` exposes module-level `ADAPTER` satisfying
      `isinstance(ADAPTER, SourceAdapter)`, and `AdapterMeta.adapter_key == "leg-cth" ==
      group_id.lower()` (`INGF-01` deliverables 4, 5, 9).
- [ ] `[machine]` **Architecture**: `INGF-01`/`INGF-02`'s scanner reports this directory clean — no
      `httpx`, `requests`, `aiohttp`, `urllib`, `http.client`, `socket`, `sqlite3`, corpus-database or
      document-parsing import; the network is reached only via `ctx.fetcher` and parsing only via
      `ctx.parser` (PRD §37.4, §40.7, §39.1; `SEC-002`).
- [ ] `[machine]` **Title allowlist is total.** `unexplained_titles()` over the discovery fixtures
      returns empty: every discovered title has an entry in `titles.yaml` with a recorded inclusion
      reason, and every `DEPENDENCY_EXPANSION` resolves to another entry (PRD §40.2; `SLEG-01`
      deliverable 6).
- [ ] `[machine]` **Status is evidenced.** Every emitted version's `legal_status` traces to a
      `LegalEvent` with a resolvable `evidence_node_version_id`, or is `STATUS_UNCONFIRMED`; no
      relation is emitted with `confidence_state = MODEL_SUGGESTED` (PRD §15.2, §35.2; `SRCH-005`).
- [ ] `[machine]` **Hard-filter fields are populated.** Every emitted `DocumentVersion` carries a
      non-null `document_type`, `effective_from`, `legal_status` and `official_url`, and resolves to a
      `CTH` jurisdiction through its `source`/`authority` — the inputs PRD §36.2's eligibility
      predicate filters on (`SRCH-002`; PRD §30.2 "Every result independently passes all hard
      filters").
- [ ] `[machine]` The whole suite runs **offline**: a session fixture asserts no outbound network
      connection is opened during `uv run pytest pipelines/adapters/leg-cth` (sub-PRD **D12**).
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, PRD §20.3 "Rust and Python builds/tests").
- [ ] `[machine]` `pnpm test` green — standing suite item; this ticket adds no TypeScript, so the
      expectation is "unchanged and green" (plan §1.1, PRD §45.3).

**Human judgment.**

- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (`SRCH-002`, `SRCH-003`,
      `SRCH-005`; supports `ADM-001` via the registry row and `SEC-002` via the allowlist); UAT IDs —
      `UAT-SRCH-03` ("Select 2024-08-03 then open result | Version effective at that date opens;
      current text is not substituted") is the behaviour this group's point-in-time versions make
      possible, executed by `14-search-product`; schema/API/event compatibility (no schema change —
      this ticket fills `INGF-07`/`INGF-02`/`INGF-04`/`SLEG-01` schemas); tenant/PII/security impact
      (none — public official material, no tenant or customer data; fixtures scanned by DoD item 4);
      **source/licence impact** (the `licence.yaml` assessment and `max_quote_chars` for `LEG-CTH`, and
      any `known_gaps`); cost/memory/latency impact (DoD item 12's four measurements against PRD
      §39.2's 2 GiB host budget); rollback path (delete the group directory; `compose_registry` then
      reports `MANDATORY_GROUP_MISSING` for `LEG-CTH`, which is the correct honest state);
      known gaps and follow-up ids (`GOLD-05`, `GOLD-16`; sub-PRD **L3**, **L5**, **L7**, **L8**).
- [ ] `[human]` **Founder review of the coverage claim** — that `titles.yaml` genuinely covers the
      PRD §6.2 Commonwealth employment scope, that each inclusion reason is defensible, and that
      `known_gaps` states the limitations a customer would need to see. PRD §6.1 forbids claiming that
      every document is included and requires customer-facing coverage language to follow the
      registry; PRD §41.3 step 1 puts this row in front of the customer in the first demo minute; PRD
      §43.4 item 4 puts source adapter anomalies in the founder review queue (sub-PRD **L5**).
- [ ] `[human]` **Dry-run provenance** — confirm `fixtures/dry-run.json` was produced against the
      official endpoints listed in `registry.yaml`/`allowlist.yaml`, and that the committed document
      fixtures are unmodified official responses. The kit can check shape and freshness offline; it
      cannot check provenance (PRD §40.8 item 2).
- [ ] `[human]` **Writeback obligation as an acceptance item** — if measured evidence shows the
      register cannot supply the PRD §40.2 minimum capability (structured discovery, versions, node
      hierarchy, events), the PR sets the limited `adapter_status`, adds the customer-visible gap,
      fills `INGF-07`'s `limitation` block with the evidence, the affected dates or collections and
      the customer-visible warning, **and** updates `docs/prd/06-sources-legislation/README.md` in
      the same change (sub-PRD **D8**/**D13**; plan §8 **Q10**; PRD §7, §12.1, §44.4). A limited
      state asserted without measured evidence, and any scope reduction taken to make delivery
      easier, are both refused.
- **No additional `[fixture]` classes** beyond the DoD items above — every recorded-data replay in
  this ticket is a §40.8 item. Declared explicitly.
- **No `cargo test --workspace` item** — this ticket adds no Rust (plan §1.1).

## Test plan

Harness: `pytest`, run as `uv run pytest pipelines/adapters/leg-cth -q`, plus the kit CLI. Everything
is **offline**; no network access is required or permitted. Construction pattern to copy: `INGF-09`'s
reference adapter at `pipelines/ingestion/src/<root>/conformance/reference/demo-registry/` — the same
file layout, the same recorded-response fixture format, the same five-line `test_conformance.py`.
Read `pipelines/ingestion/src/<root>/conformance/README.md` (the authoring guide) and
`pipelines/adapters/_shared/legislation/README.md` (the primitives guide) before starting.

1. `uv sync --frozen && uv run pytest pipelines/adapters/leg-cth -q` — all green.
2. **The twelve DoD items** — `uv run pytest pipelines/adapters/leg-cth/tests/test_conformance.py -q`
   collects the twelve inherited `test_dod_NN_*` methods; every one passes, item 11 either passing or
   `DEFERRED(GOLD-16)` with a recorded reason.
3. **The kit CLI** — `python -m <root>.conformance check pipelines/adapters/leg-cth --report
   conformance-report.json` exits `0`; assert the report has `"strict": true` and
   `summary.fail == 0`, `summary.not_available == 0`. A report produced with `--lenient` records
   `"strict": false` and **is not** acceptable evidence.
4. **Registry composition** — `python -m <root>.registry validate pipelines/adapters/leg-cth` exits
   `0`; then compose a fixture tree containing this group in `mode="release"` and assert no
   `MANDATORY_GROUP_MISSING` for `LEG-CTH`, and that the five PRD §12.1 dates appear as five separate
   fields with `freshness_status` matching the declared capability.
5. **Licence** — `python -m <root>.licensing check pipelines/adapters/leg-cth` exits `0`; assert the
   snapshot file hash matches `terms_sha256` and that `INGF-04`'s gate returns the expected
   `LicenceDecision` for each of the six `IntendedUse` values.
6. **Adapter unit tests** (`tests/test_identity.py`, `tests/test_normalise.py`,
   `tests/test_events.py`) — identity determinism and cross-version stability; node-tree structure and
   round-trip on each document fixture; event evidence resolution; the three time points; the
   consolidated non-overlap assertion.
7. **Incremental matrix** (`tests/test_incremental.py`) — the four recorded scenarios of
   deliverable 9, asserting run counts, run status, freshness field movement and the absence of a
   content quarantine item on transient failure.
8. **Architecture** (`tests/test_architecture.py`) — import `INGF-01`'s scanner and run it over
   `pipelines/adapters/leg-cth/**`; assert clean.
9. **Offline guard** — a session fixture that fails the run if any outbound socket is opened.
10. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus, in this order: (a) run the kit CLI and read `conformance-report.json` — a
`NOT_AVAILABLE` verdict is a **failure**, not a skip, and `DEFERRED` is legitimate only for item 11;
(b) confirm `adapter_status` in `registry.yaml` matches what the fixtures actually prove — an `ACTIVE`
row over a source with `change_detection.capability: NONE` is the exact dishonesty PRD §7, §12.1 and
§44.4 forbid; (c) confirm every emitted status names its evidence event (PRD §15.2) and no relation
is `MODEL_SUGGESTED`; (d) confirm the fixtures contain no cookies, tokens or personal data
(PRD §40.8 item 4); (e) confirm nothing in the directory opens a socket or a parser directly
(PRD §37.4, `SEC-002`).

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (a docs PR/MR,
a version note in the sub-PRD changelog, then `publish-tickets.mjs --sync`), and only then change
code. Silent divergence is an incomplete ticket. The ticket wins over any implementation plan
(CLAUDE.md, issue #53). Four tickets are `blocked_by` this one (`SADJ-01`, `SFUT-02`, `GOLD-05`,
`GOLD-16`); a change to `stable_source_key` or node-key derivation after merge invalidates `GOLD-05`'s
gold authorities and must be called out in the PR.

**Foreseeable frictions and their exact writeback targets:**

1. **The register does not provide the PRD §40.2 minimum capability** — no structured discovery, no
   version history, no node-level structure, or no evidenced events → this is a **writeback**, never a
   silent downgrade. Set `adapter_status` to the honest PRD §7 value (`METADATA_AND_LINK_ACTIVE`,
   `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED` or `SOURCE_UNAVAILABLE`), add a `known_gaps` entry with
   `customer_visible: true`, and update the decisions/open-questions table in
   `docs/prd/06-sources-legislation/README.md` **in the same PR**. PRD §7 permits exactly those four
   states; PRD §44.4 forbids calling the category covered; PRD §12.1 forbids a false freshness
   guarantee. Populate `INGF-07`'s `limitation` block in the same change:
   `state`, a closed-set `reason_code`, `reason_detail`, at least one `evidence` entry, the `affected`
   dates or collections and the `customer_visible_warning`. Plan §8 **Q10** is confirmed policy, so
   this is never a scope choice — the limited state is legitimate only on that measured evidence, no
   part of the group may be silently omitted, and no unofficial source or commercial headnote may
   substitute for it. `GOLD-16` carries the evidence and the proposed registry state into the Gate 2
   verification that `LNCH-05` discloses.
2. **The register has no reliable delta mechanism** (no feed, API, sitemap, manifest or usable
   conditional requests) → `change_detection.capability: NONE`, which `INGF-07` derives to
   `FRESHNESS_LIMITED`. That is the correct outcome, not a defect to work around with a scheduled full
   crawl. Record it in `known_gaps` and in `docs/prd/06-sources-legislation/README.md`.
3. **A shared helper is missing from `_shared/legislation`** → do **not** write it inside this
   directory and do **not** copy `SLEG-01`'s code. Plan §9 **R2**: the primitive stays owned by
   `SLEG-01`; the writeback is a new sibling ticket in this module, recorded in
   `docs/prd/06-sources-legislation/README.md`'s work-breakdown table and in
   `docs/prd/breakdown-plan.md` §5.7/§6.2, with this adapter `blocked_by` it.
4. **A conformance item cannot pass for a legitimate reason** (e.g. the register publishes no PDF, so
   item 4's PDF fixture does not exist) → use `NOT_APPLICABLE` **with a recorded reason** where
   `INGF-09` permits it, and record the pattern in `docs/prd/05-ingestion-framework/README.md`. Never
   override a `test_dod_*` method, never add a skip, and never use `--lenient` as evidence
   (`ConformanceOverrideError` and the report's `"strict": false` flag exist to prevent both). If an
   item is impossible for a whole class of registers, that is a change to PRD §40.8 — a
   **product/spec** change under PRD §45.5. Escalate.
5. **Licence terms are unclear or prohibit storage/indexing** → record the assessment honestly
   (`UNCLEAR_RESTRICTED`, `REVIEW_REQUIRED` or `PROHIBITED`) and let `INGF-04`'s gate collapse the
   permission set. If that leaves the group unable to reach `ACTIVE`, set `LICENSING_RESTRICTED` and
   update `docs/prd/06-sources-legislation/README.md` open question **L7**. Do **not** raise
   `max_quote_chars` or soften an axis to make a test pass — PRD §11.1's default is the conservative
   one, and PRD §11.2 keeps `LEGAL_REVIEW_PENDING` an explicit launch risk.
6. **The register publishes no consolidated point-in-time text for part of the PRD §6.6 window** →
   sub-PRD **D10**: emit the versions the register actually publishes and record a `DATE_LIMITED`
   `known_gaps` entry with `customer_visible: true`. **Never** reconstruct a consolidation from
   as-made plus amendments and present it as an official version — PRD §6.1 admits only official
   public sources. If reconstruction is judged necessary, that overturns **D10**: the writeback is
   `docs/adr/NNNN-no-synthesised-consolidations.md` plus the D10/L6 rows in
   `docs/prd/06-sources-legislation/README.md`, and it must be escalated before any code is written.
7. **A new failure code needs a quarantine class mapping `INGF-05` does not have** → register the code
   here with its operator action and raise the class mapping against `INGF-05`. Do not edit
   `INGF-05`'s reason table — it is another module's file-scope.
8. **Anomaly defaults are wrong for this register** (plan §8 **Q9**) → tighten in `conformance.yaml`
   and record the measured baseline in the PR. Loosening is refused by `AnomalyPolicy`; if a default
   is genuinely too tight for a legitimate register, record it for `GOLD-16`'s consolidation rather
   than editing `INGF-05`'s defaults.

**Escalation rule.** If the twelve-item Definition of Done cannot be met for `LEG-CTH` — the
Commonwealth register is the single most load-bearing source in the corpus, and PRD §26 requires all
five waves to have active or explicitly limited status — stop and escalate. The permitted outcomes are
PRD §44.4's two: continue work and delay production access, or launch with this group in an explicit,
customer-visible limited state. The second is available only on measured evidence of a genuine
official-source limitation, recorded in `INGF-07`'s `limitation` block (plan §8 **Q10**, confirmed
policy); it is not a route to reducing mandatory scope. Quietly shipping a group that claims more
coverage than it has is not one of them.
