---
id: SINS-02
title: "`FWC-DOCS` — FWC Document Search"
module: 07-sources-instruments
lane: 07-sources-instruments
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INGF-09]
blocks: [SINS-04, SCAS-05, GOLD-16]
---

# SINS-02 — `FWC-DOCS` — FWC Document Search

Implements PRD §40.3 (wave-2 source group `FWC-DOCS`), PRD §6.2 (Commonwealth scope), PRD §6.4 (case
law and decisions) and PRD §40.8 (adapter Definition of Done) <`SRCH-004`, `ADM-001`> — **No ADR —
the decision is already made in PRD §40.3; this is build ticket 2 of 14 against it.**
Parent sub-PRD: [07-sources-instruments README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `INGF-09` — Adapter conformance kit (the twelve-item DoD), module
`05-ingestion-framework`
([tickets/INGF-09](../../05-ingestion-framework/tickets/INGF-09-adapter-conformance-kit-the-twelve-item-dod.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed adapter
contract (PRD §40.7) and a fixed twelve-item gate (PRD §40.8) — not a new subsystem decision.

## Background + basis

**The PRD §40.3 row, verbatim.** This is the whole specification the roster gives for this group:

| Group ID | Official entry | Required artifacts | Initial tier |
|---|---|---|---|
| `FWC-DOCS` | FWC Document Search — <https://www.fwc.gov.au/document-search> | Decisions, orders, modern/historical awards, variations, agreements, Full Bench and research material | T1 awards/key decisions; T2 agreements/long tail |

**Note what the row does not say (sub-PRD D7).** Unlike PRD §40.2 (wave 1), the §40.3 table has no
"Minimum adapter capability" column and states no licensing. **Change-detection capability and
licensing are outcomes of this ticket, not inputs**: they are determined during the live dry-run and
recorded in `registry.yaml` (`INGF-07` schema) and `licence.yaml` (`INGF-04` schema). PRD §6.1
requires all nine attributes — "authority, jurisdiction, official endpoints, document/date coverage,
licensing, adapter status, change-detection capability, freshness and known gaps" — and PRD §12.1
requires the honest fallback:

> "Sources without reliable delta mechanisms MUST show `FRESHNESS_LIMITED` rather than a false
> guarantee."

**PRD §40.1 fixes what a roster row means:**

> "The rows below are mandatory source groups, not claims that adapters already exist. Every row
> starts `NOT_STARTED` and must become `ACTIVE` or an explicit customer-visible limited state before
> release. The live Source Coverage Registry will expand each group into exact collections/endpoints,
> licence snapshots, formats, counts, date bounds, schedules and gaps."

**The limited-state launch policy is settled (plan §8 **Q10**, confirmed policy; sub-PRD **D11**).**
It governs what this ticket may record and is not a question this ticket reopens:

1. `FWC-DOCS` is a mandatory group and is attempted **in full**. It is not pre-selected for omission
   or reduced implementation, and its scope is never trimmed to make a release date easier.
2. A limited state is permitted **only** where measured evidence shows a genuine limitation prevents
   `ACTIVE` — an official capability limit, the official body not publishing the material, a licensing
   restriction, historical material unavailable, a freshness limitation, or another real
   official-source constraint.
3. The permitted states are PRD §7's four: `METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`,
   `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`.
4. Where one applies, `registry.yaml` carries `INGF-07`'s **`limitation` block** — `state` equal to
   `adapter_status`, a `reason_code` from its closed set, a mandatory `reason_detail` saying why full
   coverage is unavailable, a non-empty `evidence[]`, an `affected` scope naming the affected dates or
   collections, and a `customer_visible_warning`. `INGF-07`'s composer fails in **every** mode without
   them (`REGISTRY_LIMITATION_MISSING` / `_UNEVIDENCED` / `_SCOPE_MISSING` / `_WARNING_MISSING`).
5. Silent omission is prohibited, and no unofficial source or commercial headnote may substitute for
   unavailable official material.
6. `GOLD-16` produces the measured evidence and the proposed registry state, `LNCH-05` verifies the
   launch statement discloses it accurately, and Gate 2 is verification and sign-off under this
   policy — not an opportunity to cut mandatory scope.

**Why exact identifiers are the point of this ticket.** `SRCH-004`: *"Exact provision/case/agreement/
ABN matches outrank semantic similarity … Exact-match regression set passes."* PRD §35.2 gives
`legal_document` the columns `official_identifier`, `neutral_citation` and `employer_abn` with "exact
indexes on identifiers/ABN". FWC material is identified by award codes, agreement codes, matter
numbers and neutral citations; if this adapter does not extract them exactly, the exact-match path in
`RETR-03` has nothing to match on. Plan §5.8's goal for this ticket is precisely *"Decisions, orders,
awards and agreements discovery with exact IDs."*

**Why this ticket is a spine, not just an adapter (sub-PRD D6).** Plan §6.2 gives it
`SINS-02 --> SINS-04 & SCAS-05 & GOLD-16`. `FWC-AGREEMENTS` (`SINS-04`, this module) and `CASE-FWC`
(`SCAS-05`, module `08-sources-cases`) both draw on **the same** FWC Document Search collection —
PRD §40.4's `CASE-FWC` row names its official entry as "FWC Document Search". Plan §4 states "Read
access is unrestricted; only writes are allocated", and plan §9 **R2** forbids copying a helper into
two adapter directories. This ticket therefore exposes its Document Search discovery and identifier
machinery as a **stable, importable, documented public surface** that the other two read; it does not
implement their document families.

**PRD §40.7 fixes the interface** (eight boundaries; the adapter never writes corpus tables, emits
versioned intermediate records with source URL, artifact hash and tool version, and shared framework
code performs HTTP safety, hashing, artifact persistence, retry, licensing, metrics, quarantine and
run accounting). `INGF-01` publishes it as the `SourceAdapter` protocol; `INGF-09` publishes the
`ConformanceTestCase` base class and the `ReplayFetcher`.

**PRD §37.4 and `05` sub-PRD D10 (carried caveat).** This adapter may not import `requests`, `httpx`,
`aiohttp`, `urllib`, `urllib3`, `http.client` or `socket`, nor any HTML/XML/PDF parsing library.
Fetching goes through `ctx.fetcher`; parsing goes through `ctx.parser` (`INGF-06`'s `ParserHost`).
`INGF-01`'s AST scan enforces both.

**Carried caveat — index tier (sub-PRD N3).** `registry.yaml.initial_index_tier` is a single value
but the PRD row gives a split ("T1 awards/key decisions; T2 agreements/long tail"). Declare the
primary tier and record the split as a note plus a `known_gaps` entry; `CRPS-04` assigns the
operative per-chunk tier "from evidence, not guesswork". Do not petition for a schema change here.

**Carried caveat — shared host (sub-PRD N5).** `FWC-AWARDS`, `FWC-AGREEMENTS` and `CASE-FWC` use the
same host. Declare conservative `min_request_interval_ms` and `max_concurrent_requests` in
`allowlist.yaml`; `INGF-08` enforces one token bucket per host across groups.

**Carried caveat — anomaly thresholds (plan §8 **Q9**, baseline-selected).** PRD §40.9's ±10% count
change and >2% parse failure are the framework's **initial defaults**, refined per source once this
group has a representative baseline. This ticket may **tighten** them for `FWC-DOCS` and never loosen
them; a group that genuinely needs a looser percentage escalates by writeback to `INGF-05`, never by
a local override. `GOLD-16` consolidates the final per-source thresholds, and the critical identity,
time, mandatory-source and citation failures block unconditionally regardless of any percentage.

## Goal

Deliver the `FWC-DOCS` source adapter under `pipelines/adapters/fwc-docs/**`: the per-adapter
`registry.yaml`, `allowlist.yaml`, `licence.yaml` + immutable licence snapshot, an `adapter.py`
exposing `ADAPTER: SourceAdapter` with all eight PRD §40.7 boundaries over the FWC Document Search
collection, exact-identifier extraction for FWC decisions, orders, awards, variations and agreements
into `official_identifier`/`neutral_citation`, a documented public discovery/identity surface that
`SINS-04` and `SCAS-05` import, and the complete PRD §40.8 fixture set — such that
`python -m <iroot>.conformance check pipelines/adapters/fwc-docs` exits 0 in strict mode with all
twelve items `PASS` (item 11 `DEFERRED(GOLD-16)` only if `evals/cases/**` does not yet exist), and
the group composes into the Source Coverage Registry with a non-fictional change-detection capability
and freshness status.

## Non-goals

- **No award content, variation history, classification structure or pay data** — `SINS-03`
  (`FWC-AWARDS`). This ticket discovers and identifies award documents; it does not model them.
- **No agreement lifecycle chain, employer/ABN linkage or nominal-expiry rule** — `SINS-04`
  (`FWC-AGREEMENTS`), which is `blocked_by` this ticket.
- **No case-law modelling of FWC decisions** — bench composition, matter/section metadata, appeal and
  treatment relationships are `SCAS-05` (`CASE-FWC`, module `08-sources-cases`), also `blocked_by`
  this ticket. `TREATMENT_NOT_CONFIRMED` is `SCAS-01`'s default, not this ticket's concern (PRD §9.2).
- **No rate or pay facts.** This ticket has no `SINS-01` edge in plan §5.8 and must emit none
  (sub-PRD N4's rule applied here). If it needs them, that is a plan writeback.
- **No exact-match ranking.** `RETR-03` (`11-retrieval-engine`) decides that exact identifiers
  outrank semantic similarity; this ticket only guarantees the identifiers are in the corpus fields.
- **No evaluation cases or gold data** — `21-evaluation-600` (`GOLD-06`, `GOLD-16`). Item 11
  references ids; it never reads `evals/gold/**` (PRD §45.1 item 6, plan §9 R9).
- **No registry, allowlist, licence or conformance *schema* changes** — `INGF-07`, `INGF-02`,
  `INGF-04`, `INGF-09` own those. This ticket authors *instances* only, including any `limitation`
  block, whose fields and closed `reason_code` set are `INGF-07`'s and are never redefined here.
- **No launch-scope call and no reduction of this group's mandatory scope.** The limited-state policy
  is confirmed (plan §8 **Q10**, sub-PRD **D11**); this ticket supplies its own measured status and
  evidence, `GOLD-16` consolidates, and Gate 2 verifies.
- **No live network access in tests.** "Live dry-run evidence" (PRD §40.8 item 2) is a recorded
  artifact committed to `fixtures/dry-run.json`; the suite replays fixtures offline.

## File-scope (write-owns)

- `pipelines/adapters/fwc-docs/**` — the whole group directory:
  `registry.yaml`, `allowlist.yaml`, `licence.yaml`, `licence-snapshots/`, `conformance.yaml`
  (optional), `adapter.py`, `fixtures/**`, `tests/**`, `README.md`.
- Does not touch: `pipelines/adapters/_shared/**` — `SLEG-01`, `SINS-01`, `SCAS-01`, `SFUT-01`
  (plan §9 R2: shared primitives are never edited from an adapter directory).
- Does not touch: `pipelines/adapters/{fwc-awards,fwc-agreements,fwo-guidance,ato-employment}/**`
  and `pipelines/adapters/pt-*/**` — `SINS-03`…`SINS-14`.
- Does not touch: `pipelines/adapters/case-fwc/**` — `SCAS-05` (module `08-sources-cases`), which
  reads this directory.
- Does not touch: `pipelines/ingestion/**` — `05-ingestion-framework`.
- Does not touch: `pipelines/corpus-builder/**`, `schemas/**` — `04-corpus-contract`,
  `00-foundation`.
- Does not touch: `evals/**`, `pipelines/evaluation/**` — `21-evaluation-600`.
- Does not touch: `packages/**`, `apps/**`, `services/**`, `tests/**`, `infra/**`,
  `.github/workflows/**`.
- `pipelines/adapters/pyproject.toml` (if it exists) — **append-only**, shared-additive; resolve
  conflicts by re-running `uv lock`, never hand-merge (plan §1.1, PRD §44.3). Should be untouched:
  sub-PRD D9 forbids HTTP and parser dependencies.

**Serial safety.** First decomposition of `docs/PRD.md`; **nothing is merged and no ticket is in
flight**, so no prior ticket has touched these paths. `INGF-01`…`INGF-09` have landed and own
`pipelines/ingestion/**`. The tickets that may run concurrently with this one are `SINS-01`
(`_shared/rates/**`) and `SINS-05` (`fwo-guidance/**`) in wave 1 — both disjoint directories. Every
other ticket in this module owns exactly one other group directory, so the fourteen scopes are
pairwise disjoint by construction (`INGF-07` deliverable 1: one directory per group, named
`group_id.lower()`). The only paths two tickets could contend for are `_shared/**` — which no adapter
writes — and the optional `pyproject.toml`, which is append-only.

## Deliverables

1. **`registry.yaml`** validating against `INGF-07`'s schema, with all nine PRD §6.1 attributes:
   `group_id: FWC-DOCS`, `wave: 2`; `authority` = the Fair Work Commission with
   `authority_type: COMMISSION`, `jurisdiction: CTH`, `court_level` populated (required for
   `COMMISSION`), `official_url: https://www.fwc.gov.au/`; `official_endpoints` — one entry per
   Document Search collection actually used, each with `kind` (`LISTING`/`FEED`/`API`/`SITEMAP`/
   `DOCUMENT`) and `material_class` from PRD §40.5's seven-value set (`DECISION` for decisions and
   orders, `OPERATIVE_INSTRUMENT` for awards and agreements, `POLICY`/`NEWS` for research material);
   `document_coverage.families` covering the row's required artifacts — decisions, orders, modern and
   historical awards, variations, agreements, Full Bench and research material — with `date_from`
   justified by what the collection actually exposes and `financial_years` covering the three PRD §6.6
   years or a `known_gaps` entry explaining why not; `licence_ref`, `allowlist_ref`;
   `initial_index_tier: T1` plus a note recording the PRD row's T1/T2 split (sub-PRD N3);
   `change_detection.{capability,cadence,supports_conditional_requests,reconciliation}` **as
   measured**; `known_gaps` with `customer_visible` flags; `evaluation_subset_ref`.
   `adapter_status` is whatever this ticket's evidence supports. If it is one of PRD §7's four limited
   states, the file **must** also carry `INGF-07`'s `limitation` block — `state` equal to
   `adapter_status`, a closed-set `reason_code`, a `reason_detail`, a non-empty `evidence[]` (the
   `dry-run.json`, conformance report, licence assessment or capability probe that demonstrates the
   limitation), an `affected` scope naming the affected dates or collections, and a
   `customer_visible_warning` that also appears as a `customer_visible: true` `known_gaps` entry
   (sub-PRD **D11**; plan §8 **Q10**). If it is `ACTIVE`, `limitation` stays null — `INGF-07` rejects
   a non-limited status carrying one.
2. **`allowlist.yaml`** validating against `INGF-02`'s schema: `schemes: [https]`, the FWC host(s)
   with explicit `path_prefixes` covering exactly the endpoints in deliverable 1, plus conservative
   `min_request_interval_ms` and `max_concurrent_requests` (sub-PRD N5). Every URL in
   `registry.yaml.official_endpoints` must pass this allowlist — `INGF-07` fails composition with
   `REGISTRY_ENDPOINT_NOT_ALLOWLISTED` otherwise.
3. **`licence.yaml` + `licence-snapshots/<date>-<hash>.<ext>`** captured with
   `python -m <iroot>.licensing capture pipelines/adapters/fwc-docs`, stating **all nine** PRD §11.1
   decision axes independently (commercial use, storage, indexing, embedding, display, quotation,
   export, attribution, prohibited use), the assessment `status` from the six PRD §11.1 states,
   `attribution_text` and `max_quote_chars`. Where rights are not clearly permitted the status is
   `UNCLEAR_RESTRICTED` or `REVIEW_REQUIRED`, which `INGF-04`'s gate collapses to metadata/link-only —
   the PRD §11.1 default ("Unclear rights default to metadata, limited quotation and official links").
4. **`adapter.py`** exposing module-level `ADAPTER: SourceAdapter` (`INGF-01` deliverable 9's
   directory convention) with `AdapterMeta(group_id="FWC-DOCS", adapter_key="fwc-docs",
   jurisdiction="CTH", authority_id=…, adapter_version=…, supported_content_types=…,
   declared_quarantine_reasons=…)` and all eight PRD §40.7 boundaries:
   - `discover` — paged traversal of the Document Search collections declared in `registry.yaml`,
     driven by `DiscoveryCursor`, honouring `since` for incremental runs and emitting
     `RemoteDescriptor`s whose `descriptor_key` is stable across runs and whose `url` is allowlisted;
   - `fetch` — through `ctx.fetcher` only, passing `FetchValidators` with the stored `etag` and
     `last_modified` so a re-check is a conditional request (PRD §12.1);
   - `identify` — deterministic `StableDocumentIdentity`; see deliverable 5;
   - `parse` — through `ctx.parser` only;
   - `normalise` — `DocumentVersion` + `NodeVersion`s with a hierarchy that preserves the document's
     own structure and exact text (PRD §15.3, §40.8 item 5);
   - `extract_events` — publication and, where the source states them, issue/variation/operative
     dates as `legal_event` records with `event_date` and `effective_date` distinguished (PRD §15.2);
   - `extract_relations` — only relations the source asserts structurally; nothing inferred
     (PRD §9.3);
   - `validate` — group-specific findings merged with framework anomaly rules.
5. **Exact-identifier extraction (`SRCH-004`).** A documented, individually tested module resolving,
   for every discovered document: the FWC **neutral citation** where the document has one (the
   `[YYYY] <COURT-CODE> <N>` form the source itself prints, including Full Bench and approval-body
   variants), the **award code** and **agreement code** where present, the **matter/document number**,
   and the publication date. These land in `document_identity.official_identifier`,
   `.neutral_citation` and `.stable_source_key` (`CRPS-01` payload). Identifiers are read from the
   source text or its structured fields — **never** constructed, guessed or completed from model
   knowledge. An unparseable identifier yields a quarantine item, not a fabricated value.
6. **Stable identity and deletion behaviour (PRD §40.8 item 3).** `stable_source_key` derivation is
   documented in `README.md`, deterministic, stable across two versions of one document, and distinct
   between documents. A descriptor that disappears from the collection produces a `REMOVED` finding
   and retains prior state — PRD §15.1's `DocumentVersion` is immutable and PRD §35.3 forbids a delete
   path.
7. **The public surface `SINS-04` and `SCAS-05` import (sub-PRD D6).** Export, from a stable module
   path documented in `README.md`: the Document Search discovery client (collection descriptors,
   paging, `since` handling), the identifier parsers of deliverable 5, and the `stable_source_key`
   derivation. Mark everything else private. Changing this surface after merge requires re-publishing
   `SINS-04` and `SCAS-05` (`publish-tickets.mjs --sync`) — state that in the module docstring.
8. **Fixtures (PRD §40.8 items 2, 4, 6, 7, 10).** `fixtures/discovery/` (≥1 recorded listing
   response, replayable through `ReplayFetcher`); `fixtures/dry-run.json`
   (`{run_at, descriptors_discovered, sample_urls, tool_versions}`, `run_at` within
   `DRY_RUN_MAX_AGE_DAYS = 180`); `fixtures/documents/` covering every declared media type, scrubbed
   of any customer data, cookie, `Authorization` header or credential; `fixtures/timepoints/` with
   ≥3 legal dates; `fixtures/quarantine/` with one deliberately defective artifact per code in
   `declared_quarantine_reasons`; `fixtures/baseline.json` with per-collection counts and a content
   hash set.
9. **`tests/test_conformance.py`** — exactly the five-line `ConformanceTestCase` subclass from
   `INGF-09` deliverable 1, plus `tests/` unit tests for deliverables 5, 6 and 7 (identifier parsing
   table, identity determinism, the public surface's importability and shape).
10. **`conformance.yaml`** only if this group needs resource ceilings or **tightened** anomaly
    thresholds. Overrides may only tighten (`INGF-05`'s `AnomalyPolicy`); `deferred_items` may contain
    only `11`.
11. **Failure codes** registered with `register_failure_codes("fwc-docs", …)`, each with a non-empty
    operator action (PRD §40.8 item 10, ADM-001) — at minimum: identifier unparseable, listing shape
    changed, document type unrecognised, collection count anomaly.
12. **`README.md`** in the group directory: the collections used and why, the identifier grammar, the
    `stable_source_key` rule, the public surface for `SINS-04`/`SCAS-05`, the recorded change-detection
    capability with the evidence for it, the known gaps, and — if the group carries a `limitation` —
    the evidence, affected collections and customer-visible warning behind it.

## Acceptance checklist (classified)

**PRD §40.8 — the twelve-item adapter Definition of Done (all twelve required):**

- [ ] `[fixture]` **DoD 1** — `registry.yaml`, `allowlist.yaml` and `licence.yaml` exist and validate;
      `FWC-DOCS` is in `MANDATORY_SOURCE_GROUPS`; the directory name equals `group_id.lower()`; the
      licence snapshot file's SHA-256 equals `snapshot.terms_sha256`; every `official_endpoints` URL
      passes the allowlist. **This is the group's Source Coverage Registry row** (PRD §6.1, §40.8
      item 1, A2).
- [ ] `[fixture]` **DoD 2** — a recorded discovery response replays through `adapter.discover()` and
      yields ≥1 `RemoteDescriptor` with a non-empty `descriptor_key` and an allowlisted URL;
      `fixtures/dry-run.json` is present and within `DRY_RUN_MAX_AGE_DAYS`.
- [ ] `[fixture]` **DoD 3** — `identify()` is deterministic across two calls and stable across two
      versions of one document; different documents yield different keys; a removed descriptor
      produces `REMOVED` and deletes no prior state.
- [ ] `[fixture]` **DoD 4** — `fixtures/documents/` covers every declared media type and passes the
      no-customer-data scan (no TFN, personal email, `Set-Cookie`, `Authorization: Bearer` or
      `.env`-shaped content).
- [ ] `[fixture]` **DoD 5** — every document fixture parses through `ParserHost`,
      `assert_roundtrip()` passes, and the node hierarchy has one root, no cycles, contiguous sibling
      ordinals and recomputable `text_hash` (PRD §15.3, §35.2).
- [ ] `[fixture]` **DoD 6** — ≥3 time points: each produces a `DocumentVersion` bracketing that date,
      a `legal_status` from PRD §6.7's seven values, and events with `event_date` and `effective_date`
      distinguished; no overlapping effect intervals in a consolidated series.
- [ ] `[fixture]` **DoD 7** — the four incremental scenarios: no-change (304 → 0 fetched,
      `last_successful_change_scan_at` advanced, `last_content_ingestion_at` unchanged), changed
      (new version emitted, prior `effective_to` closed), removed (`REMOVED`, prior version retained),
      transient failure (bounded retry → `PARTIAL` run, **no** content quarantine).
- [ ] `[fixture]` **DoD 8** — `fixtures/baseline.json` reproduces exactly on replay; any
      `anomaly_overrides` are derived from that measured baseline, **tighten only** and pass
      `AnomalyPolicy.for_group()` — an attempted loosening of an `INGF-05` initial default fails
      (PRD §40.9; plan §8 **Q9**, baseline-selected).
- [ ] `[machine]` **DoD 9** — `change_detection.{capability,cadence}` declared; a replayed 304 run and
      a replayed content run write **different** freshness fields, proving last-check and last-ingest
      are separated (PRD §12.1).
- [ ] `[fixture]` **DoD 10** — one defective artifact per declared quarantine reason produces exactly
      that code, and every code has a non-empty operator action (ADM-001).
- [ ] `[machine]` **DoD 11** — `registry.yaml.evaluation_subset_ref` is non-empty and well-formed;
      ids resolve if `evals/cases/**` exists, otherwise the item is `DEFERRED(GOLD-16)` with a
      recorded reason. `evals/gold/**` is never read (PRD §45.1 item 6, plan §9 R9).
- [ ] `[fixture]` **DoD 12** — the replayed full run records non-zero `storage_bytes`,
      `parse_wall_ms`, `index_size_estimate_bytes` and `peak_rss_bytes`, each within this group's
      ceiling (PRD §39.2's 2 GiB host budget makes these release inputs).
- [ ] `[machine]` `python -m <iroot>.conformance check pipelines/adapters/fwc-docs` exits 0 in
      **strict** mode and the committed `conformance-report.json` shows `summary.pass == 12` (or 11
      with item 11 deferred) — the artifact PRD §45.4 requires on the PR.

**Group-specific:**

- [ ] `[machine]` Exact identifiers (`SRCH-004`): a parser table over recorded document fixtures
      extracts the neutral citation, award code, agreement code and matter number into
      `official_identifier`/`neutral_citation`; a fixture with a malformed identifier produces a
      quarantine item and **no** record, proving nothing is fabricated (deliverable 5).
- [ ] `[machine]` The public surface of deliverable 7 imports from its documented path and exposes the
      discovery client, the identifier parsers and the `stable_source_key` derivation — the contract
      `SINS-04` and `SCAS-05` are written against (sub-PRD D6).
- [ ] `[machine]` The adapter imports no HTTP library and no HTML/XML/PDF parsing library —
      `INGF-01`'s AST scan over `pipelines/adapters/fwc-docs/**` passes (PRD §37.4, SEC-002).
- [ ] `[machine]` `python -m <iroot>.registry validate pipelines/adapters/fwc-docs` exits 0, and
      composing a registry containing this group in `--mode release` succeeds with a status that is
      `ACTIVE` or one of the four PRD §7 limited states **with** a `customer_visible: true` gap
      (PRD §7, §44.4).
- [ ] `[machine]` **A limited status is only expressible with its evidence (sub-PRD D11; plan §8
      Q10).** If this group's `adapter_status` is limited, a `--mode release` compose carries the
      `limitation` block through verbatim and fails when any obligation is removed — one parametrised
      mutation per code: no block → `REGISTRY_LIMITATION_MISSING`; empty `evidence` →
      `REGISTRY_LIMITATION_UNEVIDENCED`; no `affected` dates or collections →
      `REGISTRY_LIMITATION_SCOPE_MISSING`; empty `customer_visible_warning` →
      `REGISTRY_LIMITATION_WARNING_MISSING`. If the group is `ACTIVE`, the same test asserts
      `limitation` is null and that adding one fails to load.
- [ ] `[machine]` No rate or pay fact is emitted by this adapter — asserted by scanning the emitted
      record stream for the `rates` tool-version key (sub-PRD N4's rule; this ticket has no `SINS-01`
      edge).
- [ ] `[machine]` The whole suite runs offline with no outbound network (session fixture asserts it).
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, PRD §20.3).
- [ ] `[machine]` `pnpm test` green — standing suite item; no TypeScript in this ticket, so
      "unchanged and green" (plan §1.1, PRD §45.3).
- [ ] `[human]` **Licence assessment sign-off.** The nine PRD §11.1 axes are a legal judgment, not a
      code output; PRD §11.2 keeps `LEGAL_REVIEW_PENDING` an explicit launch risk. The Founder
      confirms the recorded status, `max_quote_chars` and attribution text before the group is
      declared `ACTIVE`.
- [ ] `[human]` **Coverage-row review** against PRD §41.3 step 1 ("open Source Coverage Registry; show
      all jurisdictions, active/limited groups, date ranges and freshness") — is this row honest about
      what is and is not covered? Where the row is limited, does its `limitation` block present
      evidence, affected collections and a customer-visible warning a reader could act on
      (sub-PRD **D11**)? PRD §43.4 item 4 puts source adapter count/time/licence/quarantine anomalies
      in the founder review queue.
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (`SRCH-004`, `ADM-001`; supports
      `SRCH-002`, `SRCH-003`, `SRCH-005`); UAT IDs — **none owned**; supports `UAT-SRCH-01` and
      `UAT-SRCH-03` by supplying versioned FWC material; schema/API/event compatibility (introduces
      the public surface of deliverable 7, consumed by `SINS-04` and `SCAS-05` — a change after merge
      requires re-publishing both); tenant/PII/security impact (none — public official material; the
      fixture scan is the customer-data control); **source/licence impact (the recorded assessment and
      its consequences for display/quotation/export)**; cost/memory/latency impact (DoD item 12's four
      measurements); rollback path (mark the group `IN_DEVELOPMENT` and exclude it from a release
      compose); known gaps (sub-PRD N3, N5, plus this group's own `known_gaps` entries and — if it
      carries one — its `limitation` block with the evidence behind it; the anomaly thresholds are
      baseline-selected and consolidated by `GOLD-16`, plan §8 **Q9**, and the limited-state launch
      policy itself is confirmed, plan §8 **Q10**, so it is not a gap in this ticket).
- **Absent classes:** none. This ticket carries `[machine]`, `[fixture]` and `[human]` criteria.

## Test plan

Harness: `uv run pytest pipelines/adapters/fwc-docs -q` plus the conformance CLI. Everything replays
from committed fixtures through `INGF-09`'s `ReplayFetcher` and `ReplayClock`; **no test performs a
network call**, and `ReplayFetcher` refuses a URL absent from the fixtures *and* a URL present in the
fixtures but outside `allowlist.yaml`. Copy the construction pattern from `INGF-09`'s reference
adapter at `pipelines/ingestion/src/<iroot>/conformance/reference/demo-registry/` and its authoring
guide `pipelines/ingestion/src/<iroot>/conformance/README.md` — that guide, not another adapter, is
the cold-start reference.

1. `uv sync --frozen && uv run pytest pipelines/adapters/fwc-docs -q`.
2. `python -m <iroot>.registry validate pipelines/adapters/fwc-docs` — exit 0.
3. `python -m <iroot>.conformance check pipelines/adapters/fwc-docs --report conformance-report.json`
   — exit 0, `summary.fail == 0`, `strict: true`. Inspect the report's twelve verdicts individually;
   a `NOT_AVAILABLE` is a **failure**, never a skip (`05` sub-PRD M3).
4. **`tests/test_identifiers.py`** — a table of recorded document fixtures → expected
   `official_identifier`/`neutral_citation`; plus malformed inputs asserting a quarantine item and no
   emitted record.
5. **`tests/test_identity.py`** — determinism across two calls, stability across two versions,
   distinctness across documents, and the `REMOVED` path retaining prior state.
6. **`tests/test_public_surface.py`** — imports the deliverable-7 module by its documented path and
   asserts the exported names; this is the test `SINS-04` and `SCAS-05` rely on not breaking.
7. **`tests/test_no_rate_facts.py`** — the emitted stream carries no `rates` tool-version key.
8. **`tests/test_registry_status.py`** — the declared `adapter_status` composes in `--mode release`;
   if it is limited, the four `limitation` mutations each fail with their own `REGISTRY_LIMITATION_*`
   code and the block survives composition verbatim; if it is `ACTIVE`, adding a `limitation` fails
   to load (sub-PRD **D11**).
9. **`tests/test_architecture.py`** — re-runs `INGF-01`'s AST scan over this directory with a
   synthetic dirty module as negative control.
10. `uv run pytest` (whole repo) and `pnpm test` — green.

**Reviewer focus.** (a) Confirm no identifier is ever synthesised: feed the malformed fixture and
check that the run quarantines rather than emits. (b) Confirm the recorded
`change_detection.capability` is backed by evidence in `fixtures/dry-run.json` — a declared `FEED`
with no feed in the fixtures is exactly the "false guarantee" PRD §12.1 forbids. (c) Confirm the
licence snapshot hash matches and that an `UNCLEAR_*` status has actually collapsed to
metadata/link-only through `INGF-04`'s gate. (d) Confirm the public surface is stable and documented,
since two tickets in two modules import it. (e) If the group is limited, confirm the `limitation`
block names a real official-source constraint with evidence — not a scope decision wearing a
`reason_code` (sub-PRD **D11**).

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (docs PR/MR,
changelog line in `docs/prd/07-sources-instruments/README.md`, then `publish-tickets.mjs --sync`),
then change code. Silent divergence is an incomplete ticket; the ticket wins over any implementation
plan (CLAUDE.md, issue #53). Three tickets are `blocked_by` this one, so a change to deliverable 7
after merge also requires re-publishing `SINS-04`, `SCAS-05` and `GOLD-16`.

**Foreseeable frictions and their exact writeback targets:**

1. **The source has no reliable delta mechanism** — no feed, no sitemap, no conditional-request
   support, no manifest → record `change_detection.capability: NONE` (or the weakest true value) and
   let `INGF-07` derive **`FRESHNESS_LIMITED`**. Add a `known_gaps` entry with
   `customer_visible: true` and `reason_code: CAPABILITY_LIMITED`, populate the `limitation` block
   with `reason_code: OFFICIAL_CAPABILITY_LIMIT` (or `FRESHNESS_LIMITATION`), the capability-probe
   evidence, the affected collections and the customer-visible warning, and update this module's
   README. PRD §12.1 requires exactly this rather than "a false guarantee"; PRD §7 names the status.
   **Never declare a capability the dry-run did not demonstrate.**
2. **Rights are unclear, restricted or prohibited** → record the true PRD §11.1 status, let
   `INGF-04`'s gate collapse it to metadata/link-only, set the registry status to
   **`LICENSING_RESTRICTED`** with a customer-visible gap and a `limitation` block whose
   `reason_code` is `LICENSING_RESTRICTION` and whose `evidence[]` cites the licence assessment, and
   update `docs/prd/07-sources-instruments/README.md`. PRD §11.1: "Unclear rights default to metadata,
   limited quotation and official links." A silent downgrade of storage/indexing without the registry
   status is forbidden — PRD §44.4: "It is not permitted to silently call an unimplemented source
   category covered."
3. **A required artifact class in the PRD §40.3 row cannot be reached** (e.g. historical awards are
   not published in a retrievable form) → the group does **not** silently ship without it, and the
   class is not dropped because reaching it is hard. Confirm by measurement that the material is
   genuinely unavailable, record the gap in `registry.yaml.known_gaps` with `customer_visible: true`,
   set the status to `METADATA_AND_LINK_ACTIVE` or `SOURCE_UNAVAILABLE` as the evidence supports, fill
   the `limitation` block (`reason_code: MATERIAL_NOT_PUBLISHED` or
   `HISTORICAL_MATERIAL_UNAVAILABLE`, the probe evidence, the affected dates/collections and the
   warning), and record it in this module's README. The governing policy is confirmed (plan §8
   **Q10**, sub-PRD **D11**): the only live question is whether the evidence shows a real
   official-source limitation — never whether mandatory scope may be cut. `GOLD-16` consolidates the
   evidence and the proposed state, `LNCH-05` verifies the disclosure, and Gate 2 signs it off.
4. **`SINS-04` or `SCAS-05` needs something the deliverable-7 surface does not expose** → extend the
   surface **here** and update this ticket's deliverable 7 plus
   `docs/prd/07-sources-instruments/README.md` **D6**, then re-publish the dependents. Do not let a
   dependent copy the discovery or identifier code into its own directory (plan §9 **R2**), and do not
   move it into `_shared/` without a plan change: `_shared/` areas have four fixed owners
   (`SLEG-01`, `SINS-01`, `SCAS-01`, `SFUT-01`), and adding a fifth is a
   `docs/prd/breakdown-plan.md` §4/§4.2 change.
5. **A conformance item cannot pass for a structural reason** (e.g. the collection publishes no PDF,
   so item 4's PDF fixture is impossible) → use `NOT_APPLICABLE` **with a recorded reason**, which
   `INGF-09` permits only where the PRD allows it. If an item is impossible for a whole class of
   sources, that is a change to PRD §40.8 — a **product/spec** change under PRD §45.5. Escalate; never
   run the kit with `--lenient` and present the report as evidence.
6. **The group needs a shared helper that does not exist** → add a ticket to the owning primitives
   ticket's module (plan §9 **R2**: "a new sibling ticket is added there and the adapters are
   `blocked_by` it"), recorded in `docs/prd/breakdown-plan.md` §5.8 and §6.2. Never copy a helper
   between adapter directories.

**Escalation rule.** If the twelve-item Definition of Done cannot be satisfied for this mandatory
group, that is not a ticket-local outcome: PRD §7 and PRD §44.4 forbid leaving a mandatory group
`PLANNED_NOT_ACTIVE` or calling it covered. Stop and record the true status together with its
complete `limitation` block — evidence, affected dates or collections, customer-visible warning and
the reason full coverage is unavailable. The governing policy is **confirmed** (plan §8 **Q10**;
sub-PRD **D11**), so the question raised is never "may this group be dropped or reduced" but only
"does the measured evidence show a genuine official-source limitation". `GOLD-16` produces the
evidence and the proposed registry state, `LNCH-05` verifies the launch statement, and Gate 2 is the
verification and sign-off step. The only permitted launch outcomes for an unfinished group remain PRD
§44.4's two: continue and delay production access, or launch with the limitation visible and relevant
answers safely warning or refusing.
