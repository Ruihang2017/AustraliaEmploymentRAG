---
id: SADJ-01
title: ADJ-CTH (Home Affairs, OAIC, AHRC, Comcare, DEWR…)
module: 09-sources-adjacent
lane: 09-sources-adjacent
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INGF-09, SLEG-02]
blocks: [GOLD-10, GOLD-11, GOLD-16]
---

# SADJ-01 — `ADJ-CTH` (Home Affairs, OAIC, AHRC, Comcare, DEWR…)

Implements PRD §40.5 (wave 4 — employment-adjacent official regimes), PRD §6.2 (Commonwealth and
national scope), PRD §7 (wave 4) and PRD §40.8 (adapter Definition of Done) <SRCH-002, ADM-001> —
No ADR — the decision is already made in PRD §40.5; this is build ticket 1 of 9 against it.
Parent sub-PRD: [09-sources-adjacent README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on:
[INGF-09 — Adapter conformance kit (the twelve-item DoD)](../../05-ingestion-framework/tickets/INGF-09-adapter-conformance-kit-the-twelve-item-dod.md);
`SLEG-02` — `LEG-CTH` Federal Register of Legislation, module `06-sources-legislation`
(`docs/prd/06-sources-legislation/tickets/`).
**Why `builder`:** a bounded change inside one module's declared file-scope — one adapter directory —
against contracts PRD §40.7/§40.8 and `INGF-01`/`INGF-09` already fix; not a new subsystem decision.

## Background + basis

**PRD §40.5 fixes this group's row verbatim:**

| Group ID | Authorities to enumerate in registry | Required topics |
|---|---|---|
| `ADJ-CTH` | Home Affairs, OAIC, Australian Human Rights Commission, Comcare, DEWR and other responsible official Commonwealth authorities | work rights/migration, privacy, discrimination, WHS/compensation/public sector/whistleblowing where employment-related |

and the same section states the release rule this ticket exists to satisfy:

> "An authority name in this planning row is not enough for release. The registry must link exact
> official pages/collections and identify whether material is law, operative instrument, decision,
> code, guidance, policy or news."

**PRD §6.2 fixes the Commonwealth adjacent scope** this group must reach:

> "Employment-related migration and right-to-work materials."
> "Employment-related privacy, surveillance and whistleblowing material."
> "Commonwealth public-sector employment material."

**PRD §7 wave 4** names the regimes: "WHS/OHS, discrimination, workers compensation, labour hire,
portable LSL, surveillance/privacy, whistleblowing, child employment, public sector and
migration/right-to-work", and fixes the release outcome:

> "No mandatory source group may remain `PLANNED_NOT_ACTIVE` at release. A group blocked by official
> capability or licensing MUST use an explicit status such as `METADATA_AND_LINK_ACTIVE`,
> `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED` or `SOURCE_UNAVAILABLE` and MUST produce
> customer-visible warnings when relevant."

**PRD §44.4:** "It is not permitted to silently call an unimplemented source category covered."

**PRD §9.1 fixes what this material *is*.** Regulator guidance sits at level 6 of the authority
hierarchy — "Official regulator guidance, rulings, decision summaries and impact materials" — and:

> "Guidance MUST NOT silently override legislation, an operative instrument or binding authority."

PRD §6.1 says the same from the source side: "Official regulator summaries MAY supplement but MUST
NOT replace primary decisions or operative instruments."

**Why `blocked_by SLEG-02`.** The Acts behind every one of these regimes — *Migration Act 1958*,
*Privacy Act 1988*, the Commonwealth discrimination Acts, *Work Health and Safety Act 2011* (Cth),
*Safety, Rehabilitation and Compensation Act 1988*, *Public Interest Disclosure Act 2013*,
*Corporations Act 2001* Part 9.4AAA, *Public Service Act 1999* — belong to `LEG-CTH` (PRD §40.2,
wave 1). This adapter never re-ingests them (sub-PRD **D4**). It links to them: where a document is
deterministically tied to a provision, it emits a `node_relation` targeting the `LEG-CTH` node
identity, which requires those identities to exist first. PRD §9.3 fixes the standard: "Deterministic
extraction may support conclusions when exact source evidence and parser version are retained."

**Why `blocked_by INGF-09`.** `INGF-09` ships the twelve-item conformance kit, the `ReplayFetcher`,
`ReplayClock` and `replay_context` helpers, the reference adapter and the authoring guide at
`pipelines/ingestion/src/<root>/conformance/README.md`. That guide — not another adapter's code — is
what this ticket is written against. `INGF-01` fixes the eight PRD §40.7 boundaries, `AdapterMeta`,
`AdapterRunContext`, `IntermediateRecordEnvelope` and the `ADAPTER` module-level convention;
`INGF-02` owns `allowlist.yaml`, `INGF-04` owns `licence.yaml`, `INGF-07` owns `registry.yaml`.

**Carried caveats, documented not re-litigated.**
- Sub-PRD **M1**: `registry.yaml` declares one `authority:`, but this group spans eight authorities.
  This ticket is the **widest** group and therefore raises the schema change first — see *Feedback
  obligation* 1. Interim rule: lead authority in `authority:`, every other authority named on its own
  `official_endpoints` entry.
- Sub-PRD **M2**: one `licence.yaml` per group; most-restrictive-wins across the authorities until
  `INGF-04` supports per-collection overrides.
- Sub-PRD **M6** / plan §8 **Q9** (baseline-selected): PRD §40.9's ±10% collection-count change and
  >2% parse-failure figures are **initial defaults**. This ticket records the group's values in
  `conformance.yaml` and may tighten or replace the percentages once it has a representative baseline
  — overrides are tighten-only. Critical identity, time, mandatory-source and citation failures are
  unconditional blockers whatever the percentages are, and `GOLD-16` consolidates and verifies the
  final per-source thresholds.

**The limited-state launch policy is settled — plan §8 Q10 is confirmed policy (sub-PRD D11).**
No mandatory source group is pre-selected for omission or reduced implementation; `ADJ-CTH` must be
attempted in full; arbitrary scope reduction to make a release date easier is not permitted. A
customer-visible limited state — `METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`,
`LICENSING_RESTRICTED` or `SOURCE_UNAVAILABLE` — is permitted **only** where measured evidence shows
a genuine official-source limitation (an official capability limit, the official body not publishing
the material, a licensing restriction, historical material unavailable, a freshness limitation, or
another real official-source constraint), and it is then recorded through `INGF-07`'s `limitation`
block (Deliverable 2). Silent omission is prohibited, and no unofficial source or commercial headnote
may substitute for unavailable official material. A PRD §6.3 topic with no applicable regime in this
jurisdiction is a different thing and is **not** a limited state: it is an official-source fact
recorded as a customer-visible `known_gaps` entry on an otherwise-`ACTIVE` group (sub-PRD **D5**,
**D12**). `GOLD-16` produces the measured evidence and the proposed registry state, `LNCH-05`
verifies that the launch statement discloses it accurately, and Gate 2 is the Founder's verification
and sign-off under this policy — not an opportunity to cut mandatory scope. This ticket supplies the
status, the evidence and the customer-visible gap text unconditionally; **which** groups, if any, end
up limited is a Gate 2 output derived from evidence.

## Goal

Deliver the `ADJ-CTH` source adapter at `pipelines/adapters/adj-cth/**`: a `registry.yaml` that
decomposes the group into the nine named source groups of Deliverable 1 with an exact official
endpoint and PRD §40.5 material classification per collection, an `allowlist.yaml` covering exactly
those hosts, a `licence.yaml` plus captured snapshots, and an `adapter.py` exposing
`ADAPTER: SourceAdapter` that implements all eight PRD §40.7 boundaries across those collections —
such that `python -m <root>.conformance check pipelines/adapters/adj-cth` exits 0 with all twelve
PRD §40.8 items `PASS` (item 11 `DEFERRED(GOLD-16)` only if `evals/cases/**` does not yet exist), the
composed Source Coverage Registry reports `ADJ-CTH` as `ACTIVE` or an explicit PRD §7 limited status
with customer-visible gaps, and every PRD §6.2 Commonwealth adjacent topic is either covered by a
named collection or carries a recorded gap.

## Non-goals

- **No Commonwealth legislation.** The *Migration Act*, *Privacy Act*, *Fair Work Act*, WHS Act
  (Cth), SRC Act, PID Act, *Public Service Act* and every legislative instrument made under them
  belong to `SLEG-02` (`LEG-CTH`, module `06-sources-legislation`). Includes APS Commissioner's
  Directions and the WHS (Codes of Practice) approvals: these are legislative instruments, not
  regulator guidance.
- **No court or tribunal judgments.** High Court, Federal Court, FCFCOA and FWC material belongs to
  `SCAS-02`…`SCAS-05` (module `08-sources-cases`). This adapter ingests only the regulator's **own**
  published decisions, determinations, enforcement outcomes and decision summaries (PRD §6.4 last
  bullet, §9.1 level 6).
- **No bills, exposure drafts or consultations.** `SFUT-02` (`FUTURE-CTH`, module
  `10-sources-future`).
- **No FWO, ATO, FWC awards/agreements material.** `SINS-02`…`SINS-06` (module
  `07-sources-instruments`).
- **No `_shared/**` helper directory.** Sub-PRD **D2**: module 09 has no `_shared` path in plan §4.
  Read `pipelines/adapters/_shared/legislation/**` (`SLEG-01`) if useful; never write it.
- **No framework code.** Fetching, hashing, artifact storage, licence gating, parsing, quarantine and
  run accounting are `pipelines/ingestion/**` (`INGF-01`…`INGF-09`). PRD §40.7: "Shared framework
  code performs HTTP safety, hashing, artifact persistence, retry, licensing, metrics, quarantine and
  run accounting."
- **No corpus writes.** PRD §40.7: "The adapter never writes active corpus tables directly."
- **No evaluation cases or gold data.** `GOLD-10`/`GOLD-11` (module `21-evaluation-600`). This ticket
  only *references* evaluation-case ids in `registry.yaml`. `evals/gold/**` is never read (plan §9
  R9, PRD §45.1 item 6).
- **No live network access in tests.** PRD §40.8 item 2's "live dry-run evidence" is a **recorded**
  artifact committed by this ticket; the kit validates its shape and age, it does not perform the run.
- **No new third-party dependency.** Sub-PRD **D10**; `INGF-01`'s architecture test forbids HTTP and
  database imports under `pipelines/adapters/**`.

## File-scope (write-owns)

- `pipelines/adapters/adj-cth/**` — the whole group directory and nothing else:
  `registry.yaml`, `allowlist.yaml`, `licence.yaml`, `licence-snapshots/**`, `conformance.yaml`,
  `adapter.py`, any internal modules the Builder chooses (e.g. `collections/**`), `fixtures/**`,
  `tests/**`.
- Does not touch: `pipelines/adapters/adj-{nsw,vic,qld,wa,sa,tas,act,nt}/**` — sibling tickets
  `SADJ-02`…`SADJ-09` in this module.
- Does not touch: `pipelines/adapters/_shared/**` — `SLEG-01`, `SINS-01`, `SCAS-01`, `SFUT-01`
  (modules `06`, `07`, `08`, `10`). Read-only reuse is allowed; writing is not.
- Does not touch: `pipelines/adapters/leg-*/**` (module `06`), `pipelines/adapters/{fwc-*,fwo-*,ato-*,pt-*}/**`
  (module `07`), `pipelines/adapters/case-*/**` (module `08`), `pipelines/adapters/future-*/**`
  (module `10`).
- Does not touch: `pipelines/ingestion/**` (`05`), `pipelines/corpus-builder/**` and
  `pipelines/embeddings/**` (`04`), `pipelines/evaluation/**` and `evals/**` (`21`).
- Does not touch: `packages/**`, `apps/**`, `services/**`, `schemas/**`, `infra/**`, `tests/**`,
  `.github/workflows/**`, root manifests, `pipelines/adapters/pyproject.toml` (sub-PRD **D10**/**M4**).

**Serial safety.** This is the first decomposition of `docs/PRD.md`: nothing is merged and no ticket
has previously touched these paths. The eight sibling `SADJ` tickets own eight *different* sibling
directories under `pipelines/adapters/`, so the nine jurisdiction scopes are disjoint by construction
— `adj-cth/` shares no file with `adj-nsw/`, and the module has **no intra-module edges** (plan §7:
min waves 1, nine useful lanes), so all nine may legitimately run as concurrent lanes. The only file
five modules could otherwise contend on is `pipelines/adapters/pyproject.toml`; sub-PRD **D10** keeps
it untouched because `INGF-01`'s architecture test forbids the two library classes an adapter would
otherwise want. Upstream `INGF-09` and `SLEG-02` have landed before this ticket starts.

## Deliverables

1. **Registry decomposition — the nine named source groups of `ADJ-CTH`.** Each becomes one
   `official_endpoints` entry (or a small contiguous set of entries) in `registry.yaml`, with its own
   discovery strategy, fixtures, baseline row and quarantine cases. Domains below are the **expected**
   official entries; the Builder resolves and records the exact collection URLs, and a changed entry
   point is a writeback (see *Feedback obligation* 4), not an improvisation.

   | # | `collection_key` | Authority (`authority_type`) | Expected official entry | PRD §6.2/§6.3 topic | `material_class` values | Initial tier |
   |---|---|---|---|---|---|---|
   | 1 | `migration-work-rights-homeaffairs` | Department of Home Affairs (`DEPARTMENT`) | `homeaffairs.gov.au`, `immi.homeaffairs.gov.au` | migration / right to work | `GUIDANCE`, `POLICY`, `NEWS` | T2 |
   | 2 | `privacy-oaic` | Office of the Australian Information Commissioner (`REGULATOR`) | `oaic.gov.au` | employment-related privacy and surveillance | `GUIDANCE`, `CODE`, `DECISION` | T1 |
   | 3 | `discrimination-ahrc` | Australian Human Rights Commission (`COMMISSION`) | `humanrights.gov.au` | discrimination / equal opportunity | `GUIDANCE`, `CODE`, `POLICY`, `DECISION` | T1 |
   | 4 | `whs-model-swa` | Safe Work Australia (`COMMISSION`) | `safeworkaustralia.gov.au` | WHS — the **model** laws and model codes the state codes derive from | `CODE`, `GUIDANCE`, `POLICY` | T1 |
   | 5 | `whs-comcare` | Comcare (`REGULATOR`) | `comcare.gov.au` | WHS in the Commonwealth jurisdiction | `CODE`, `GUIDANCE`, `DECISION`, `NEWS` | T1 |
   | 6 | `workers-comp-comcare` | Comcare (`REGULATOR`) | `comcare.gov.au` | workers compensation (SRC Act scheme) | `GUIDANCE`, `POLICY`, `OPERATIVE_INSTRUMENT` | T2 |
   | 7 | `whistleblowing-asic-ombudsman` | ASIC (`REGULATOR`) and the Commonwealth Ombudsman (`REGULATOR`) | `asic.gov.au`, `ombudsman.gov.au` | whistleblowing (corporate + public interest disclosure) | `GUIDANCE`, `CODE`, `POLICY` | T2 |
   | 8 | `public-sector-apsc` | Australian Public Service Commission (`COMMISSION`) | `apsc.gov.au` | Commonwealth public-sector employment | `GUIDANCE`, `POLICY`, `CODE` | T2 |
   | 9 | `workplace-relations-dewr` | Department of Employment and Workplace Relations (`DEPARTMENT`) | `dewr.gov.au` | employment/workplace-relations policy and reform implementation | `POLICY`, `GUIDANCE`, `NEWS` | T3 |

   `authority.jurisdiction` is `CTH` for all nine. Lead authority in `registry.yaml.authority` is
   **Comcare** (the widest employment-adjacent regulator in the group); every other authority is named
   on its endpoint entries — the interim rule of sub-PRD **M1**.

2. **`pipelines/adapters/adj-cth/registry.yaml`** — one file, validating against `INGF-07`'s
   committed `registry.schema.json`, with `group_id: ADJ-CTH`, `wave: 4`, the lead `authority` block,
   one `official_endpoints` entry per collection URL (each with `collection`, `kind` and
   `material_class`), `document_coverage` (families, `date_from`, `financial_years` covering at least
   PRD §6.6's 2024-25/2025-26/2026-27), `licence_ref`, `allowlist_ref`, `adapter_status`,
   `initial_index_tier`, `change_detection` (capability, cadence, conditional-request support, weekly
   count/hash and monthly manifest reconciliation flags), `known_gaps` and `evaluation_subset_ref`.
   `python -m <root>.registry validate pipelines/adapters/adj-cth` exits 0.

   **When — and only when — `adapter_status` is one of the four PRD §7 limited states, the same file
   carries `INGF-07`'s `limitation` block.** This ticket consumes that contract and never redefines
   it: `state` equal to `adapter_status`; a `reason_code` from the closed set
   `OFFICIAL_CAPABILITY_LIMIT` / `MATERIAL_NOT_PUBLISHED` / `LICENSING_RESTRICTION` /
   `HISTORICAL_MATERIAL_UNAVAILABLE` / `FRESHNESS_LIMITATION` / `OTHER_OFFICIAL_SOURCE_CONSTRAINT`; a
   mandatory `reason_detail` stating why full coverage is unavailable; at least one `evidence` entry
   (`kind`, `observed_at`, `official_url`, `ref`, `summary`) recording a measured or official-source
   fact; an `affected` scope naming the dates or the collections; and a `customer_visible_warning`
   that also appears as a `customer_visible: true` `known_gaps` entry. A non-limited status carries
   `limitation: null`. `INGF-07` fails composition with `REGISTRY_LIMITATION_MISSING`,
   `REGISTRY_LIMITATION_UNEVIDENCED`, `REGISTRY_LIMITATION_SCOPE_MISSING` or
   `REGISTRY_LIMITATION_WARNING_MISSING` when one is absent, so an unevidenced limited state cannot be
   merged (plan §8 **Q10**, confirmed policy; sub-PRD **D11**).

3. **`allowlist.yaml`** — `INGF-02`'s schema: `schemes: [https]` only, one `hosts` entry per domain in
   Deliverable 1 with the narrowest `path_prefixes` that cover the declared collections, plus any
   politeness/limit keys the schema defines. Every `official_endpoints` URL in `registry.yaml` must
   pass this allowlist — `INGF-07` fails composition with `REGISTRY_ENDPOINT_NOT_ALLOWLISTED`
   otherwise, and `INGF-09`'s `ReplayFetcher` refuses an off-allowlist URL even when a fixture exists.

4. **`licence.yaml` + `licence-snapshots/`** — `INGF-04`'s schema: a captured snapshot per authority
   (`terms_url`, `terms_sha256`, stored artifact under `licence-snapshots/<date>-<hash>.<ext>`) and
   one `assessment` block stating all nine PRD §11.1 decision axes plus `attribution_text`,
   `max_quote_chars` and `status`. Where the authorities' terms differ, the **group** assessment is
   the most restrictive of them (sub-PRD **M2**); where terms are unclear, `UNCLEAR_RESTRICTED`, which
   `INGF-04` collapses to metadata/link-only (PRD §11.1: "Unclear rights default to metadata, limited
   quotation and official links").

5. **`adapter.py` — `ADAPTER: SourceAdapter`** (module-level, `INGF-01` deliverable 9's convention)
   with `meta = AdapterMeta(group_id="ADJ-CTH", adapter_key="adj-cth", jurisdiction="CTH",
   authority_id=<lead>, adapter_version=…, supported_content_types=[…],
   declared_quarantine_reasons=[…])`, implementing all eight PRD §40.7 boundaries. Every network,
   filesystem and store access goes through `ctx: AdapterRunContext`; no HTTP or parser library is
   imported (`INGF-01` deliverable 11).

6. **`discover()` — per-collection strategies.** One strategy object per `collection_key`, each
   declaring its change-detection mechanism (feed, sitemap, API, updated listing, manifest or
   conditional request over a listing page) and emitting `RemoteDescriptor`s whose `descriptor_key`
   is stable across runs and whose `hints` carry the `collection_key`. A collection whose authority
   publishes no delta mechanism declares `capability: NONE` and drives the group's
   `FRESHNESS_LIMITED` status (sub-PRD **D6**, PRD §12.1) — it does not silently inherit the daily
   cadence.

7. **`identify()` — stable identity and deletion behaviour.** `stable_source_key` scheme
   `adj-cth:<collection_key>:<authority-assigned-id-or-normalised-path>`, documented in the module
   docstring with one worked example per collection. Deterministic across two runs and stable across
   two versions of the same document; different documents never collide. A descriptor that disappears
   yields a `REMOVED` finding and retains prior versions — it never deletes state (PRD §40.8 item 3;
   `INGF-09` item 3).

8. **`parse()` + `normalise()` — node hierarchy and exact-text round-trip.** Codes of practice and
   long guidance normalise to a chapter/section/clause `NodeVersion` tree with contiguous sibling
   `ordinal`s and one root; short guidance pages normalise to a shallow heading tree.
   `text[start_offset:end_offset]` reproduces every block exactly and every `text_hash` recomputes
   from `canonical_text` (PRD §15.3: "Citations MUST target DocumentVersion + NodeVersion + exact
   offsets + source snapshot"; `INGF-06`'s `assert_roundtrip()`).

9. **`document_type` — subordinate-authority typing (sub-PRD D3).** A closed per-adapter vocabulary
   distinguishing at least `APPROVED_CODE_OF_PRACTICE`, `MODEL_CODE_OF_PRACTICE`,
   `REGULATOR_GUIDANCE`, `REGULATOR_POLICY`, `REGULATOR_DECISION`, `PUBLIC_REGISTER_ENTRY` and
   `REGULATOR_NEWS`, each mapped to the PRD §40.5 `material_class` recorded in `registry.yaml`. This
   is what lets PRD §9.1's "Guidance MUST NOT silently override legislation" be enforced downstream
   and what makes `SRCH-002`'s type/authority filters meaningful.

10. **`extractEvents()` — evidenced status only (sub-PRD D7).** Issue, revision, replacement and
    withdrawal events with `event_date` and `effective_date` distinguished (PRD §15.2), producing a
    `legal_status` from PRD §6.7's seven values. A document whose authority publishes no status
    signal is `STATUS_UNCONFIRMED` — never `IN_FORCE` by default. Versions of one consolidated series
    must not have overlapping effect intervals (PRD §35.2, §40.9).

11. **`extractRelations()` — links into `LEG-CTH`, never re-ingestion (sub-PRD D4).** Where a
    document is deterministically tied to a provision — a code approved under a named section,
    guidance citing a numbered provision, an APSC document citing the *Public Service Act* — emit a
    `node_relation` targeting the `LEG-CTH` node identity with `derivation` recording deterministic
    extraction, the exact evidence offsets and `parser_version`, and a `confidence_state` that is
    **not** `MODEL_SUGGESTED` (PRD §9.3; PRD §35.2 "`MODEL_SUGGESTED` cannot support definitive
    status"). An unresolvable citation is dropped, not guessed.

12. **Topic coverage and gaps (sub-PRD D5).** `registry.yaml.known_gaps` records, with
    `customer_visible: true`, every PRD §6.2/§7 wave-4 topic this group does not cover from an
    official Commonwealth collection — including any date-limited coverage against PRD §6.6's three
    financial years. Commonwealth topics with no federal regime (labour hire licensing, portable long
    service leave, child employment) are recorded as gaps naming the state/territory groups that do
    cover them.

13. **Fixtures (PRD §40.8 items 2, 4, 6, 7, 8, 10), namespaced per collection** under the kit's
    directory names (sub-PRD **M7**): `fixtures/discovery/<collection_key>/…` (≥1 recorded discovery
    response each), `fixtures/documents/<collection_key>/…` covering every declared content type,
    `fixtures/timepoints/<collection_key>/…` declaring ≥3 legal dates, `fixtures/quarantine/…` with
    ≥1 deliberately defective artifact per code in `declared_quarantine_reasons`,
    `fixtures/baseline.json` with one `collections` row per `collection_key`, and `fixtures/dry-run.json`
    with `{run_at, descriptors_discovered, sample_urls, tool_versions}` dated within
    `DRY_RUN_MAX_AGE_DAYS`. Every fixture is public source material with **no** customer data,
    cookies, `Authorization` headers or credentials (`INGF-09` item 4).

14. **`conformance.yaml` + `tests/test_conformance.py`.** The five-line subclass from `INGF-09`
    deliverable 1 (`class TestAdjCth(ConformanceTestCase): group_dir = …`) plus a `conformance.yaml`
    declaring `resource_ceilings` and initial `anomaly_overrides` (tighten-only; PRD §40.9,
    sub-PRD **M6**). `deferred_items` may contain only `11`, and only with a reason.

15. **Adapter-local unit tests** under `pipelines/adapters/adj-cth/tests/` beyond the inherited kit:
    per-collection discovery parsing, the identity scheme's collision and stability properties, the
    `document_type` mapping table, the `LEG-CTH` relation extractor (including the drop-on-ambiguity
    path) and the gap/status derivation.

16. **Failure codes** registered with `register_failure_codes("adj-cth", …)` (`INGF-01` deliverable
    10), each with a non-empty operator action (PRD §40.8 item 10, ADM-001) — at minimum: unparseable
    collection listing, missing collection listing, unexpected content type, identity conflict,
    citation target unresolvable, and licence-terms change detected.

## Acceptance checklist (classified)

**Per named source group.** Items 1–12 below are PRD §40.8's twelve-item Definition of Done and each
must hold for **every one of the nine named source groups** in Deliverable 1 — the conformance run is
parametrised per `collection_key`, and a report in which an item passes for one collection and is
absent for another is a failure (PRD §44.4).

- [ ] `[machine]` **DoD 1 — registry row, allowlist, licence.** `registry.yaml`, `allowlist.yaml` and
      `licence.yaml` validate; `group_id` is `ADJ-CTH` and is in `MANDATORY_SOURCE_GROUPS`; the
      directory name equals `group_id.lower()`; each of the nine collections has its own
      `official_endpoints` row with a `material_class` from PRD §40.5's seven values; every endpoint
      URL passes `allowlist.yaml`; the licence snapshot file's SHA-256 equals `snapshot.terms_sha256`
      (PRD §40.8 item 1, §6.1, §11.1).
- [ ] `[fixture]` **DoD 2 — discovery fixture and dry-run evidence.** Replaying
      `fixtures/discovery/<collection_key>/` through `adapter.discover()` yields ≥1 `RemoteDescriptor`
      per collection with a non-empty `descriptor_key` and an allowlisted URL; `fixtures/dry-run.json`
      is present, well-formed and within `DRY_RUN_MAX_AGE_DAYS` (PRD §40.8 item 2).
- [ ] `[fixture]` **DoD 3 — stable identity, versions, deletion/unavailability.** `identify()` is
      deterministic across two calls and stable across two versions of the same document, distinct
      documents never collide, and a removed descriptor produces a `REMOVED` finding without deleting
      prior state — proven for every collection (PRD §40.8 item 3).
- [ ] `[fixture]` **DoD 4 — representative fixtures without customer data.** `fixtures/documents/`
      covers every content type declared in `AdapterMeta.supported_content_types` for every
      collection, and the no-customer-data scan finds no TFN/ABN-with-name/email/phone/credential
      pattern, no `Set-Cookie`/`Authorization`/`Bearer` capture and no `.env`-shaped content
      (PRD §40.8 item 4, §19.2, §35.3).
- [ ] `[fixture]` **DoD 5 — parser/node hierarchy and exact-text round-trip.** Every document fixture
      parses through `INGF-06`'s `ParserHost`; `assert_roundtrip()` passes; the node tree has one
      root, no cycles and contiguous sibling `ordinal`s; every `text_hash` recomputes from
      `canonical_text` (PRD §40.8 item 5, §15.3, §35.2).
- [ ] `[fixture]` **DoD 6 — historical/effective/status/event behaviour at ≥3 time points.** For each
      collection, three declared legal dates each resolve to a `DocumentVersion` whose
      `effective_from`/`effective_to` bracket the date, a `legal_status` from PRD §6.7's seven values,
      and events whose `event_date` and `effective_date` are distinguished; no two versions of a
      consolidated series overlap (PRD §40.8 item 6, §6.6, §15.2, §35.2).
- [ ] `[fixture]` **DoD 7 — incremental no-change / changed / removed / transient-failure.** The four
      replayed scenarios produce their expected counts and run status per collection; the transient
      failure retries within bounds and creates **no** content quarantine item (PRD §40.8 item 7).
- [ ] `[fixture]` **DoD 8 — count/hash baseline and anomaly thresholds.** `fixtures/baseline.json`
      carries one `collections` row per `collection_key`; the replayed run reproduces it exactly; the
      `conformance.yaml` `anomaly_overrides` tighten and never loosen `INGF-05`'s policy
      (PRD §40.8 item 8, §40.9).
- [ ] `[fixture]` **DoD 9 — freshness schedule with last-check/last-ingest separation.**
      `change_detection.{capability,cadence}` is declared per collection; a replayed 304 run advances
      `last_successful_change_scan_at` and leaves `last_content_ingestion_at` unchanged, while a
      content run advances both (PRD §40.8 item 9, §12.1).
- [ ] `[fixture]` **DoD 10 — quarantine cases and operator recovery action.** Every code in
      `declared_quarantine_reasons` has ≥1 defective fixture that produces exactly that code, and
      every code has a non-empty operator action in `INGF-05`'s reason table (PRD §40.8 item 10,
      ADM-001).
- [ ] `[machine]` **DoD 11 — retrieval/citation evaluation subset.** `registry.yaml.evaluation_subset_ref`
      is non-empty, every id matches the evaluation-case id pattern and, where `evals/cases/**`
      exists, resolves there; otherwise the item is `DEFERRED(GOLD-16)` with a `conformance.yaml`
      reason. `evals/gold/**` is never read (PRD §40.8 item 11; plan §9 R9; PRD §45.1 item 6).
- [ ] `[fixture]` **DoD 12 — measured storage, parse time, index size and peak memory.** All four
      measurements are recorded in `conformance-report.json`, are non-zero and are within the
      `conformance.yaml` ceilings (PRD §40.8 item 12, §39.2).
- [ ] `[fixture]` `python -m <root>.conformance check pipelines/adapters/adj-cth` exits **0** in
      strict mode and the report shows `summary.fail == 0` and `summary.not_available == 0`; a
      `--lenient` report is not acceptable evidence (`INGF-09` deliverables 4–5, PRD §45.4).
- [ ] `[machine]` **Source Coverage Registry row.** `INGF-07`'s composer over
      `pipelines/adapters/` includes `ADJ-CTH` with all nine PRD §6.1 attributes populated, the five
      PRD §12.1 dates as separate fields, and `mode="release"` composition passing for this group
      (`ADM-001`, PRD §6.1, §7).
- [ ] `[machine]` **Explicit status, never a silent downgrade.** `adapter_status` is `ACTIVE` or one
      of `METADATA_AND_LINK_ACTIVE` / `FRESHNESS_LIMITED` / `LICENSING_RESTRICTED` /
      `SOURCE_UNAVAILABLE`; if limited, at least one `known_gaps` entry has `customer_visible: true`
      and names the cause (PRD §7, §12.1, §44.4).
- [ ] `[machine]` **A limited status is only representable with its evidence.** When `adapter_status`
      is one of the four limited states, `registry.yaml` carries `INGF-07`'s `limitation` block:
      `state` equal to `adapter_status`, a closed-set `reason_code`, a non-empty `reason_detail`, at
      least one `evidence` entry, an `affected` scope naming dates or collections, and a
      `customer_visible_warning` that also appears as a `customer_visible: true` gap; a non-limited
      status carries `limitation: null`. Deleting any one of those from a scratch copy makes
      composition fail with the matching `REGISTRY_LIMITATION_*` code. The recorded evidence must
      describe a genuine official-source limitation — unfinished work is not one (plan §8 **Q10**,
      confirmed policy; sub-PRD **D11**; `INGF-07` deliverables 3 and 6).
- [ ] `[machine]` **Topic coverage.** A test asserts that each PRD §6.2/§7 wave-4 Commonwealth topic
      (migration/right-to-work, privacy, surveillance, discrimination, WHS, workers compensation,
      whistleblowing, public-sector employment) maps to at least one `collection_key` **or** to a
      `known_gaps` entry with `customer_visible: true` (sub-PRD D5, PRD §44.4).
- [ ] `[machine]` **Subordinate-authority typing.** Every emitted `DocumentVersion` carries a
      `document_type` from Deliverable 9's vocabulary and a jurisdiction/authority, and no guidance
      document is emitted with a `document_type` reserved for legislation (PRD §9.1, §6.1;
      `SRCH-002`).
- [ ] `[machine]` **Relations, not duplicates.** Every `node_relation` emitted targets a `LEG-CTH`
      identity with retained evidence offsets and `parser_version`, `confidence_state` is never
      `MODEL_SUGGESTED`, and no `DocumentVersion` emitted by this adapter duplicates a `LEG-CTH`
      stable identity (sub-PRD D4, PRD §9.3, §35.2, §40.9).
- [ ] `[machine]` **Boundary tests.** `INGF-01`'s architecture scan passes for
      `pipelines/adapters/adj-cth/**`: no HTTP library, no `sqlite3`, no corpus-database module, no
      tenant/customer import (PRD §37.4, §39.1, §40.7; SEC-002).
- [ ] `[machine]` The adapter suite runs fully **offline**: a session fixture asserts no outbound
      network during `uv run pytest pipelines/adapters/adj-cth`.
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, PRD §20.3 "Rust and Python builds/tests").
- [ ] `[machine]` `pnpm test` green — standing suite item; this ticket adds no TypeScript, so the
      expectation is "unchanged and green" (plan §1.1, PRD §45.3).
- [ ] `[human]` **Founder/Architect review of the registry decomposition** — whether the nine named
      collections and their material classifications actually discharge PRD §40.5's "An authority name
      in this planning row is not enough for release" for the Commonwealth is irreducibly a judgment
      call, and PRD §43.4 item 4 puts "source adapter count/time/licence/quarantine anomalies" in the
      founder review queue. The composed registry row is also what PRD §41.3 step 1 demonstrates.
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (**ADM-001**, **SRCH-002**;
      contributes to PRD §26 Corpus); UAT IDs — **none**: no PRD §41.2 `UAT-*` row exercises a source
      adapter directly, and the nearest, `UAT-OPS-01`, belongs to `CRPS-06`/`RLSE-07`;
      schema/API/event compatibility (none — consumes `INGF-01`/`INGF-07` contracts, introduces no
      schema); tenant/PII/security impact (none — public source material only; fixtures scanned for
      customer data); **source/licence/provenance impact** (nine authorities, their licence
      assessments and the resulting quotation/display limits); cost/memory/latency impact (the DoD
      item 12 measurements against PRD §39.2's 2 GiB host budget); rollback path (delete the group
      directory; `INGF-07` then fails with `MANDATORY_GROUP_MISSING`, which is the intended loud
      failure); known gaps (sub-PRD M1, M2, M6, M7, M8; plan §8 **Q9** is baseline-selected — the
      ±10% / >2% figures are initial defaults this group may tighten from its own baseline — and
      the plan §8 **Q10** limited-state policy is confirmed, so neither is an open gap: any limited
      status stated here is an evidenced official-source limitation carrying its `limitation` block).
- [ ] `[human]` If any writeback in *Feedback obligation* is triggered, the corresponding docs change
      lands in the same PR (or a preceding docs PR) — a schema or plan change discovered here must not
      remain only in code.
- **Absent classes declared:** there are **no `[human]` UAT-script criteria** (see above) and no
  accessibility, tenancy or PII-admission criteria — this ticket produces no UI, no API surface and
  touches no customer data (PRD §39.1). All replayed evidence is `[fixture]`; all schema, boundary and
  suite checks are `[machine]`.

## Test plan

Harness: `pytest` via `uv run pytest pipelines/adapters/adj-cth -q`, and the conformance CLI. Every
step is reproducible **offline with no network**: all HTTP is served by `INGF-09`'s `ReplayFetcher`
from committed fixtures, time by `ReplayClock`, and records by the in-memory `RecordSink`. Copy the
construction pattern from `INGF-09`'s reference adapter at
`pipelines/ingestion/src/<root>/conformance/reference/demo-registry/` and its authoring guide at
`pipelines/ingestion/src/<root>/conformance/README.md` — not from another `SADJ` ticket's code.

1. `uv sync --frozen` then `uv run pytest pipelines/adapters/adj-cth -q` — all green.
2. `python -m <root>.registry validate pipelines/adapters/adj-cth` — exit 0. Then delete one required
   attribute from a scratch copy and confirm a non-zero exit: the schema is enforced, not decorative.
3. `python -m <root>.conformance check pipelines/adapters/adj-cth --report /tmp/adj-cth.json` —
   exit 0, `"strict": true`, `summary.fail == 0`, `summary.not_available == 0`, and every item's
   `evidence` naming each of the nine `collection_key`s it covered. Assert item 11 is `PASS` or
   `DEFERRED` with a recorded reason, and nothing else is deferred.
4. **Per-collection matrix** (`tests/test_collections.py`): parametrised over the nine
   `collection_key`s, asserting for each that discovery, document, timepoint and quarantine fixtures
   exist and that `baseline.json` has its row. This is the test that makes "per named source group"
   mechanical rather than aspirational — a new collection added to `registry.yaml` without fixtures
   fails here.
5. **Identity** (`tests/test_identity.py`): determinism across two calls; stability across two
   versions of one document; no collision across the nine collections; `REMOVED` on a disappeared
   descriptor with prior versions retained.
6. **Round-trip** (`tests/test_parse.py`): `assert_roundtrip()` for every document fixture; one root,
   no cycles, contiguous ordinals; a deliberately corrupted offset fixture must fail.
7. **Temporal** (`tests/test_events.py`): the three time points per collection; `event_date` vs
   `effective_date`; `STATUS_UNCONFIRMED` for a fixture with no published status signal; an
   overlapping-interval fixture must fail.
8. **Relations** (`tests/test_relations.py`): a code-of-practice fixture citing a named section emits
   a `node_relation` into `LEG-CTH` with evidence offsets and `parser_version`; an ambiguous citation
   emits nothing; `confidence_state` is never `MODEL_SUGGESTED`.
9. **Status and gaps** (`tests/test_status.py`): each PRD §6.2/§7 topic maps to a collection or a
   customer-visible gap; a collection with `capability: NONE` forces `FRESHNESS_LIMITED`; an
   `UNCLEAR_RESTRICTED` licence forces the metadata/link-only permission set.
10. `uv run pytest` (whole repo) and `pnpm test` — green.

**Reviewer focus.** (a) Open `registry.yaml` and check that each of the nine collections has a real,
specific official endpoint and a defensible `material_class` — a generic authority home page is the
failure PRD §40.5 warns about. (b) Confirm the conformance report names every collection under every
item; an item that passes on one collection and silently skips another is the PRD §44.4 failure.
(c) Confirm no Act text is emitted by this adapter (grep the emitted records for a `document_type`
reserved for legislation and for `LEG-CTH` stable keys appearing as *emitted* identities rather than
relation targets). (d) Confirm `FRESHNESS_LIMITED`/`LICENSING_RESTRICTED` are used where the source
genuinely lacks the capability, and that neither is used to paper over an unfinished collection.
(e) Re-run step 3 after deleting one licence snapshot file — DoD item 1 must fail.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (a docs PR/MR,
a changelog line in `docs/prd/09-sources-adjacent/README.md`, then `publish-tickets.mjs --sync`), and
only then change code. Silent divergence is an incomplete ticket; the ticket wins over any
implementation plan (CLAUDE.md, issue #53).

**Foreseeable frictions and their exact writeback targets:**

**Standing rule for every limited state below (plan §8 Q10, confirmed policy).** A limited
`adapter_status` is permitted only where measured evidence shows a genuine official-source
limitation, and declaring one obliges this ticket to fill `INGF-07`'s `limitation` block — `state`, a
closed-set `reason_code`, a `reason_detail` saying why full coverage is unavailable, at least one
`evidence` entry, an `affected` scope of dates or collections, and the `customer_visible_warning`
that also appears as a customer-visible `known_gaps` entry. Composition fails otherwise. A limited
state is never a way to describe unfinished work, never grounds for dropping a collection, and never
grounds for substituting an unofficial source or a commercial headnote. A PRD §6.3 topic with no
applicable regime here is a different thing: an official-source fact recorded as a customer-visible
`known_gaps` entry on an otherwise-`ACTIVE` group (sub-PRD **D5**, **D12**), never a limited
`adapter_status`. `GOLD-16` consolidates the evidence and Gate 2 is verification and sign-off, not
scope reduction.

1. **`registry.yaml` cannot express nine authorities in one group** (sub-PRD **M1**) — the schema has
   a single `authority:`. → Raise it against `INGF-07`: update
   `docs/prd/05-ingestion-framework/tickets/INGF-07-source-coverage-registry-composition-and-freshness-fields.md`
   deliverable 2 and `docs/prd/05-ingestion-framework/README.md` D2/D3 **first**, then update
   `docs/prd/09-sources-adjacent/README.md` **M1**, then implement. `INGF-07`'s own feedback
   obligation item 1 already names this case and requires the multiplicity to stay **inside** the
   group's file. Never create a second, cross-group registry file: that falsifies plan §2.1 **A2**.
2. **One `licence.yaml` cannot describe authorities with different terms** (sub-PRD **M2**). → Interim
   is most-restrictive-wins, which is always safe under PRD §11.1. If that suppresses a genuinely
   permitted collection, raise a per-collection override *inside* `licence.yaml` against
   `INGF-04` (its ticket + `docs/prd/05-ingestion-framework/README.md`), and record the outcome in
   `docs/prd/09-sources-adjacent/README.md` **M2**. Never widen a permission locally.
3. **A regulator has no usable change-detection capability, or its terms are unclear/restrictive.** →
   This is a **status**, recorded with PRD §7's and §12.1's explicit vocabulary
   (`FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `METADATA_AND_LINK_ACTIVE`, `SOURCE_UNAVAILABLE`)
   plus a `known_gaps` entry with `customer_visible: true`, **and** a writeback line in
   `docs/prd/09-sources-adjacent/README.md` naming the collection and the limitation. It is never a
   silent downgrade, never a quiet cadence change, and never grounds for dropping the collection:
   PRD §44.4 forbids silently calling an unimplemented source category covered.
4. **An expected official entry has moved, been retired, or the responsible authority has changed.** →
   Record the new entry in `registry.yaml`/`allowlist.yaml`, and update Deliverable 1's table in this
   ticket in the same PR. The table is the cold-start contract for reviewers and for `GOLD-16`; a
   correction that lives only in YAML makes the ticket and the repository disagree.
5. **A topic in PRD §6.2/§7 has no Commonwealth collection at all** (e.g. no federal labour-hire or
   portable-LSL regime). → Record it as a `known_gaps` entry naming the state/territory groups that
   cover it (sub-PRD **D5**). If no group anywhere covers it, that is a roster gap: raise it against
   `GOLD-16` and `docs/prd/breakdown-plan.md` §5 — do not absorb another module's scope here.
6. **A shared helper looks necessary across two or more `SADJ` tickets.** → Forbidden here: module 09
   owns no `_shared` path (sub-PRD **D2**). The writeback is plan §9 **R2**: add a sibling ticket to
   the module that owns `pipelines/adapters/_shared/legislation/**` (`06-sources-legislation`,
   `SLEG-01`), add the `blocked_by` edge in `docs/prd/breakdown-plan.md` §5.10 and §6.2, and only then
   implement. Never copy a helper into two adapter directories, and never create
   `pipelines/adapters/_shared/adjacent/**`.
7. **A conformance item cannot pass for a legitimate reason** (e.g. an authority publishes no PDF at
   all). → Use `NOT_APPLICABLE` **with a recorded reason**, never a silent skip and never `--lenient`.
   If an item is impossible for a whole class of regulator sources, that is a change to PRD §40.8's
   list — a product/spec change under PRD §45.5. Escalate; do not add a second deferrable item.
8. **A hard-to-reverse choice arises that this ticket does not settle** — for example a general
   convention for representing multi-authority groups across all nine wave-4 tickets. → That is an
   ADR candidate under plan §2.1 **A9**: write `docs/adr/NNNN-<slug>.md` (new file, owned by this
   ticket), record the consequence in `docs/prd/09-sources-adjacent/README.md`, and add the row to
   `docs/prd/breakdown-plan.md` §2.1 before implementing.

**Escalation rule.** If PRD §40.5's requirement — exact official pages/collections with a material
classification per named authority — cannot be met for this group, that is not a local implementation
detail: it decides whether `E15` can exit and whether PRD §26's "All five source waves have active or
explicitly limited registry status" is true. Stop, record the limitation with PRD §7's explicit
status vocabulary, escalate for re-review, and never present an unimplemented collection as covered.
