---
id: SINS-05
title: "`FWO-GUIDANCE`"
module: 07-sources-instruments
lane: 07-sources-instruments
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INGF-09]
blocks: [GOLD-16]
---

# SINS-05 — `FWO-GUIDANCE`

Implements PRD §40.3 (wave-2 source group `FWO-GUIDANCE`), PRD §9.1 (authority hierarchy), PRD §6.2
(Commonwealth scope) and PRD §40.8 (adapter Definition of Done) <`ADM-001`, `SRCH-002`> — **No ADR —
the decision is already made in PRD §40.3; this is build ticket 5 of 14 against it.**
Parent sub-PRD: [07-sources-instruments README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `INGF-09` — Adapter conformance kit (the twelve-item DoD), module
`05-ingestion-framework`
([tickets/INGF-09](../../05-ingestion-framework/tickets/INGF-09-adapter-conformance-kit-the-twelve-item-dod.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed adapter
contract (PRD §40.7) and a fixed twelve-item gate (PRD §40.8) — not a new subsystem decision.

## Background + basis

**The PRD §40.3 row, verbatim:**

| Group ID | Official entry | Required artifacts | Initial tier |
|---|---|---|---|
| `FWO-GUIDANCE` | Fair Work Ombudsman — <https://www.fairwork.gov.au/> | Official guidance, award/coverage/classification material, pay guides/tools and change notices | T1 guidance, subordinate authority |

**Note what the row does not say (sub-PRD D7).** PRD §40.3 has no "Minimum adapter capability" column
and states no licensing. Change-detection capability and rights are **outcomes** of this ticket,
recorded in `registry.yaml` (`INGF-07`) and `licence.yaml` (`INGF-04`). PRD §12.1: *"Sources without
reliable delta mechanisms MUST show `FRESHNESS_LIMITED` rather than a false guarantee."*

**The limited-state launch policy is settled (plan §8 **Q10**, confirmed policy; sub-PRD **D11**).**
It governs what this ticket may record and is not a question this ticket reopens:

1. `FWO-GUIDANCE` is a mandatory group and is attempted **in full** — never pre-selected for omission
   or reduced implementation, and never trimmed to make a release date easier.
2. A limited state is permitted **only** where measured evidence shows a genuine limitation prevents
   `ACTIVE`: an official capability limit, the official body not publishing the material, a licensing
   restriction, historical material unavailable, a freshness limitation, or another real
   official-source constraint. The permitted states are PRD §7's four — `METADATA_AND_LINK_ACTIVE`,
   `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`.
3. Where one applies, `registry.yaml` carries `INGF-07`'s **`limitation` block**: `state` equal to
   `adapter_status`, a closed-set `reason_code`, a mandatory `reason_detail`, a non-empty `evidence[]`,
   an `affected` scope naming the affected dates or collections, and a `customer_visible_warning`.
   `INGF-07`'s composer fails in **every** mode without them. Silent omission is prohibited, and no
   unofficial source or commercial headnote may substitute for unavailable official material.
4. `GOLD-16` produces the measured evidence and the proposed registry state, `LNCH-05` verifies the
   launch statement discloses it accurately, and Gate 2 is verification and sign-off under this
   policy — not an opportunity to cut mandatory scope. This is a live consideration for a guidance
   site whose pages change silently: `FRESHNESS_LIMITED` here would be an evidenced measurement of the
   site's delta capability, never a convenience.

**The tier column carries the whole design.** "T1 guidance, **subordinate authority**". PRD §9.1
fixes where this material sits in the hierarchy:

> "Default ordering: 1. Constitution and applicable legislation. 2. Regulations and legislative
> instruments. 3. Binding judicial authority. 4. FWC orders, approved agreements, modern awards and
> decisions with operative effect. 5. Persuasive court, tribunal and FWC decisions. **6. Official
> regulator guidance, rulings, decision summaries and impact materials.** 7. Explanatory memoranda
> and interpretive materials. 8. Bills, consultations and non-operative future materials."

and closes with the rule this ticket exists to make impossible to violate:

> "Guidance MUST NOT silently override legislation, an operative instrument or binding authority."

PRD §6.1 says the same from the corpus side:

> "Official regulator summaries MAY supplement but MUST NOT replace primary decisions or operative
> instruments."

Plan §5.8's goal is exactly that sentence: *"Guidance captured as subordinate authority, never
overriding law."*

**How subordination is expressed (sub-PRD D5).** The adapter does **not** emit a §9.1 level number.
PRD §45.2 gives `packages/domain` the "Pure permissions, state transitions, evidence/budget rules"
and gives `pipelines` "Official-source acquisition/build/evaluation"; the hierarchy computation is
`FND-10`'s (`packages/domain/src/legal/**`, plan §5.1, PRD refs §9.1/§36.2/§36.3). What this adapter
owes is the **input** that computation needs and the guarantee that it cannot be misread: every
document emitted here carries a `document_type` from the guidance family and an `authority_key`
identifying the Fair Work Ombudsman as a regulator — and **never** a `document_type` from the
legislation, legislative-instrument or operative-instrument families. A test enforces that
mechanically, because a single mislabelled document is enough for guidance to outrank the Act it
summarises.

**Why the pay guides are not rate facts here (sub-PRD N4).** The §40.3 row names "pay guides/tools",
and pay guides state numbers. But plan §5.8 gives this ticket `blocked_by: [INGF-09]` **only** — it
has no `SINS-01` edge, so `_shared/rates` is not a dependency of this ticket and must not be imported.
Pay-guide material is captured as **dated guidance documents with citable nodes**, not as `RateFact`s.
Copying the rate model into this directory is the failure plan §9 **R2** exists to prevent; if rate
facts are genuinely required from FWO, the writeback is a plan change adding the edge (see *Feedback
obligation*).

**PRD §40.7 fixes the interface** (eight boundaries; the adapter never writes corpus tables; it emits
versioned intermediate records with source URL, artifact hash and tool version; shared framework code
performs HTTP safety, hashing, artifact persistence, retry, licensing, metrics, quarantine and run
accounting). `INGF-01` publishes it as `SourceAdapter`; `INGF-09` publishes `ConformanceTestCase` and
`ReplayFetcher`.

**Carried caveats.**

- **No HTTP or parser library** (PRD §37.4, `05` sub-PRD D10, `INGF-01` deliverable 11): fetch through
  `ctx.fetcher`, parse through `ctx.parser`.
- **Guidance changes without a version label.** PRD §15.2 requires publication, effective, retrieval
  and system-knowledge time to be distinguished; a guidance page that carries no publication date is
  a real case. `retrieved_at` is always known; a missing publication or effective date is recorded as
  such and never invented. PRD §6.7's `STATUS_UNCONFIRMED` exists for precisely this.
- **Change notices are content, not events about legislation.** An FWO change notice is guidance
  *about* a change; the commencement or amendment event itself belongs to `LEG-CTH` (`SLEG-02`) and
  `FUTURE-CTH` (`SFUT-02`). This ticket has edges to neither and must not emit legislation events.
- **Anomaly thresholds (plan §8 **Q9**, baseline-selected).** PRD §40.9's ±10% count change and >2%
  parse failure are the framework's **initial defaults**, refined per source once this group has a
  representative baseline. This ticket records that baseline and may **tighten** them, never loosen
  them; a genuine need for a looser percentage is a writeback to `INGF-05`, not a local override.
  `GOLD-16` consolidates, and the critical identity, time, mandatory-source and citation failures
  block unconditionally regardless of any percentage.

## Goal

Deliver the `FWO-GUIDANCE` source adapter under `pipelines/adapters/fwo-guidance/**`: the per-adapter
`registry.yaml`, `allowlist.yaml`, `licence.yaml` + immutable licence snapshot, an `adapter.py`
exposing `ADAPTER: SourceAdapter` with all eight PRD §40.7 boundaries over the FWO guidance
collections, a **subject-scope allowlist** restricting ingestion to employment/payroll guidance,
document typing that makes every emitted record unambiguously subordinate regulator guidance, dated
guidance versions with citable nodes, change notices captured as guidance content, and the complete
PRD §40.8 fixture set — such that
`python -m <iroot>.conformance check pipelines/adapters/fwo-guidance` exits 0 in strict mode and a
test proves no record from this group can be emitted with an operative-authority document type.

## Non-goals

- **No rate or pay facts.** This ticket has no `SINS-01` edge (sub-PRD **N4**); `_shared/rates` is not
  imported and no `RateFact` is emitted. Pay-guide numbers are captured as citable text.
- **No awards, agreements or FWC decisions** — `SINS-03`, `SINS-04`, `SCAS-05`. FWO guidance *about*
  an award is guidance; the award itself is `FWC-AWARDS`. PRD §6.1: regulator summaries "MUST NOT
  replace primary decisions or operative instruments".
- **No legislation events.** Commencement, amendment and repeal events for Commonwealth law are
  `SLEG-02` (`LEG-CTH`); future/proposed status events are `SFUT-02` (`FUTURE-CTH`). This ticket has
  edges to neither.
- **No PRD §9.1 hierarchy computation.** `FND-10` (`packages/domain/src/legal/**`) owns it
  (sub-PRD **D5**). This ticket emits `document_type` + `authority_key`, never a level.
- **No answer-time subordination enforcement.** The rule "Guidance MUST NOT silently override
  legislation" is applied when an answer is validated — `EVID-05` (`packages/citations`) and the PRD
  §36.2 filters in `RETR-04`. This ticket makes the corpus data unambiguous so those layers can work.
- **No coverage or classification decision** — `ASK-08` (`15-answer-product`).
- **No evaluation cases or gold data** — `21-evaluation-600` (`GOLD-16`); never read `evals/gold/**`
  (PRD §45.1 item 6, plan §9 R9).
- **No registry/allowlist/licence/conformance *schema* changes** — `INGF-07`, `INGF-02`, `INGF-04`,
  `INGF-09`. This ticket authors instances only, including any `limitation` block, whose fields and
  closed `reason_code` set are `INGF-07`'s and are never redefined here.
- **No launch-scope call and no reduction of this group's mandatory scope.** The limited-state policy
  is confirmed (plan §8 **Q10**, sub-PRD **D11**); this ticket supplies its own measured status and
  evidence, `GOLD-16` consolidates, and Gate 2 verifies.
- **No live network in tests.**

## File-scope (write-owns)

- `pipelines/adapters/fwo-guidance/**` — the whole group directory: `registry.yaml`,
  `allowlist.yaml`, `licence.yaml`, `licence-snapshots/`, `conformance.yaml` (optional), `adapter.py`,
  `fixtures/**`, `tests/**`, `README.md`.
- Does not touch: `pipelines/adapters/_shared/**` — `SLEG-01`, `SINS-01`, `SCAS-01`, `SFUT-01`. In
  particular `_shared/rates` is **not** imported here (sub-PRD N4).
- Does not touch: `pipelines/adapters/{fwc-docs,fwc-awards,fwc-agreements,ato-employment}/**` and
  `pipelines/adapters/pt-*/**` — `SINS-02`, `SINS-03`, `SINS-04`, `SINS-06`…`SINS-14`.
- Does not touch: `pipelines/adapters/leg-cth/**`, `future-cth/**` — modules `06`, `10`.
- Does not touch: `pipelines/ingestion/**`, `pipelines/corpus-builder/**`, `schemas/**` — modules
  `05`, `04`, `00`.
- Does not touch: `evals/**`, `pipelines/evaluation/**` — `21-evaluation-600`.
- Does not touch: `packages/**`, `apps/**`, `services/**`, `tests/**`, `infra/**`,
  `.github/workflows/**`.
- `pipelines/adapters/pyproject.toml` (if it exists) — **append-only**, shared-additive; resolve
  conflicts by re-running `uv lock` (plan §1.1, PRD §44.3). Expected untouched (sub-PRD D9).

**Serial safety.** First decomposition of `docs/PRD.md`; **nothing is merged and no ticket is in
flight**. `INGF-01`…`INGF-09` have landed and own `pipelines/ingestion/**`, read-only from here. This
ticket is in wave 1 of the module alongside `SINS-01` (`_shared/rates/**`) and `SINS-02`
(`fwc-docs/**`) — three disjoint directories. Every other ticket in this module owns exactly one other
group directory, so the fourteen scopes are pairwise disjoint by construction (`INGF-07`
deliverable 1: one directory per group, named `group_id.lower()`). The only potentially shared path is
the optional `pyproject.toml`, which is append-only.

## Deliverables

1. **`registry.yaml`** (`INGF-07` schema) with all nine PRD §6.1 attributes: `group_id:
   FWO-GUIDANCE`, `wave: 2`; `authority` = the Fair Work Ombudsman with `authority_type: REGULATOR`,
   `jurisdiction: CTH`, `official_url`; `official_endpoints` — one entry per guidance collection
   actually used, each with `kind` and `material_class` from PRD §40.5's seven-value set, which for
   this group is **`GUIDANCE`, `POLICY` or `NEWS` only** — never `LAW` or `OPERATIVE_INSTRUMENT`;
   `document_coverage.families` covering the row's required artifacts (official guidance,
   award/coverage/classification material, pay guides/tools, change notices) with `financial_years`
   per PRD §6.6 or a `known_gaps` entry; `initial_index_tier: T1`; `change_detection.*` **as
   measured**; `known_gaps` with `customer_visible` flags; `evaluation_subset_ref`.
   `adapter_status` is whatever this ticket's evidence supports. If it is one of PRD §7's four limited
   states, the file **must** also carry `INGF-07`'s `limitation` block — `state` equal to
   `adapter_status`, a closed-set `reason_code`, a `reason_detail`, a non-empty `evidence[]` (the
   dry-run, conformance report, licence assessment or capability probe that demonstrates the
   limitation), an `affected` scope naming the affected dates or collections, and a
   `customer_visible_warning` that also appears as a `customer_visible: true` `known_gaps` entry
   (sub-PRD **D11**; plan §8 **Q10**). If it is `ACTIVE`, `limitation` stays null — `INGF-07` rejects
   a non-limited status carrying one.
2. **`allowlist.yaml`** (`INGF-02` schema): `schemes: [https]`, the FWO host with `path_prefixes`
   covering exactly deliverable 1's endpoints, plus conservative politeness values.
3. **`licence.yaml` + `licence-snapshots/`** via
   `python -m <iroot>.licensing capture pipelines/adapters/fwo-guidance`, stating all nine PRD §11.1
   axes independently plus `status`, `attribution_text`, `max_quote_chars`. Unclear rights ⇒
   `UNCLEAR_RESTRICTED`/`REVIEW_REQUIRED`, which `INGF-04`'s gate collapses to metadata/link-only
   (PRD §11.1: "Unclear rights default to metadata, limited quotation and official links").
4. **Subject-scope allowlist.** A committed, documented list of the guidance subjects and collection
   paths in scope — employment and payroll material only — with a recorded reason per entry, mirroring
   the discipline PRD §40.2 imposes on wave 1 ("A maintained subject/title allowlist plus dependency
   expansion records why each title is included"). A page outside the list is not fetched; the list is
   the auditable answer to "why is this in the corpus?". The allowlist bounds *subject matter*, which
   PRD §40.3 defines for this group; it is not a device for reducing the group's mandatory scope
   (sub-PRD **D11**), and every exclusion carries its reason.
5. **`adapter.py`** exposing `ADAPTER: SourceAdapter` with
   `AdapterMeta(group_id="FWO-GUIDANCE", adapter_key="fwo-guidance", jurisdiction="CTH", …)` and all
   eight PRD §40.7 boundaries. `discover` traverses the allowlisted collections with a
   `DiscoveryCursor` and honours `since`; `fetch` through `ctx.fetcher` with conditional-request
   validators; `parse` through `ctx.parser`.
6. **Subordinate document typing (the load-bearing deliverable).** `identify()` sets `document_type`
   from a **closed guidance set** resolved against `packages/contracts` (sub-PRD **N1**) and
   `authority_key` to the Fair Work Ombudsman. A module-level constant names the **forbidden** set —
   the legislation, legislative-instrument and operative-instrument document types — and a guard
   raises before emission if a record would carry one. Every emitted document therefore reaches
   `FND-10` as unambiguous regulator guidance (PRD §9.1 level 6).
7. **Dated guidance versions.** `normalise()` emits a `DocumentVersion` per distinct published state
   with `publication_date` where the source states it, `effective_from` where the guidance itself
   declares an operative date, `retrieved_at` always, and `legal_status` from PRD §6.7's seven values
   — using `STATUS_UNCONFIRMED` rather than a guess when the source states no date (PRD §15.2's four
   times must stay distinguishable). Content changes with no version label are detected by
   `content_hash` and produce a new version, never an in-place update (PRD §35.3 immutability).
8. **Citable node hierarchy.** Guidance pages are emitted with their own headings and sections as
   `document_node`/`node_version` records with exact offsets, so a claim can cite a pinpoint rather
   than a whole page (PRD §15.3; PRD §36.6's validator checks "exact offsets"). Pay-guide tables are
   citable nodes — text, not `RateFact`s (Non-goals).
9. **Change notices.** Captured as guidance documents of their own with their published date, linked
   to the guidance they concern **only** where the source states the link structurally
   (`node_relation`, `derivation: DETERMINISTIC`, non-model `confidence_state`). No legislation event
   is emitted (PRD §9.3, §35.2).
10. **Fixtures (PRD §40.8 items 2, 4, 6, 7, 10).** `fixtures/discovery/`; `fixtures/dry-run.json`
    (`run_at` within `DRY_RUN_MAX_AGE_DAYS = 180`); `fixtures/documents/` covering every declared
    media type, scrubbed of customer data/cookies/credentials; `fixtures/timepoints/` with ≥3 legal
    dates; `fixtures/quarantine/` with one defective artifact per declared reason code;
    `fixtures/baseline.json`.
11. **`tests/test_conformance.py`** — the five-line `ConformanceTestCase` subclass, plus unit tests
    for deliverables 4, 6, 7 and 9.
12. **`conformance.yaml`** where resource ceilings or **tightened** anomaly thresholds are needed;
    `deferred_items` may contain only `11`.
13. **Failure codes** with `register_failure_codes("fwo-guidance", …)`, each with a non-empty
    operator action (PRD §40.8 item 10, ADM-001) — at minimum: page outside the subject allowlist,
    document type would be operative, publication date unparseable, guidance structure not
    recognised, collection count anomaly.
14. **`README.md`** in the group directory: collections used and the subject-scope allowlist with its
    reasons, the subordinate-typing rule quoted from PRD §9.1, the dating rule for undated guidance,
    the recorded change-detection capability with its evidence, the known gaps, and — if the group
    carries a `limitation` — the evidence, affected collections and customer-visible warning behind it.

## Acceptance checklist (classified)

**PRD §40.8 — the twelve-item adapter Definition of Done (all twelve required):**

- [ ] `[fixture]` **DoD 1** — `registry.yaml`, `allowlist.yaml`, `licence.yaml` validate;
      `FWO-GUIDANCE` is in `MANDATORY_SOURCE_GROUPS`; directory name == `group_id.lower()`; licence
      snapshot SHA-256 == `snapshot.terms_sha256`; every endpoint URL passes the allowlist. **This is
      the group's Source Coverage Registry row** (PRD §6.1, A2).
- [ ] `[fixture]` **DoD 2** — recorded discovery replays through `adapter.discover()` yielding ≥1
      `RemoteDescriptor` with a non-empty `descriptor_key` and an allowlisted URL; `dry-run.json`
      present and within `DRY_RUN_MAX_AGE_DAYS`.
- [ ] `[fixture]` **DoD 3** — `identify()` deterministic and stable across two versions of one
      guidance page; different pages yield different keys; a removed descriptor produces `REMOVED` and
      deletes no prior state.
- [ ] `[fixture]` **DoD 4** — `fixtures/documents/` covers every declared media type and passes the
      no-customer-data scan.
- [ ] `[fixture]` **DoD 5** — every fixture parses through `ParserHost`, `assert_roundtrip()` passes,
      the node hierarchy has one root, no cycles, contiguous sibling ordinals and recomputable
      `text_hash` (PRD §15.3, §35.2).
- [ ] `[fixture]` **DoD 6** — ≥3 time points: each yields a `DocumentVersion` bracketing that date, a
      `legal_status` from PRD §6.7's seven values, and events with `event_date`/`effective_date`
      distinguished; no overlapping effect intervals.
- [ ] `[fixture]` **DoD 7** — no-change (304 → 0 fetched, last-check advanced, last-ingest unchanged),
      changed (**including a content change with no version label, detected by `content_hash`**),
      removed (prior retained), transient failure (bounded retry → `PARTIAL`, no content quarantine).
- [ ] `[fixture]` **DoD 8** — `fixtures/baseline.json` reproduces exactly on replay; any
      `anomaly_overrides` are derived from that measured baseline and **tighten only** — an attempted
      loosening of an `INGF-05` initial default fails (PRD §40.9; plan §8 **Q9**, baseline-selected).
- [ ] `[machine]` **DoD 9** — `change_detection.{capability,cadence}` declared; a replayed 304 run and
      a replayed content run write **different** freshness fields (PRD §12.1).
- [ ] `[fixture]` **DoD 10** — one defective artifact per declared quarantine reason produces exactly
      that code; every code has a non-empty operator action (ADM-001).
- [ ] `[machine]` **DoD 11** — `evaluation_subset_ref` non-empty and well-formed; ids resolve if
      `evals/cases/**` exists, else `DEFERRED(GOLD-16)` with a reason; `evals/gold/**` never read.
- [ ] `[fixture]` **DoD 12** — the replayed full run records non-zero `storage_bytes`,
      `parse_wall_ms`, `index_size_estimate_bytes`, `peak_rss_bytes`, each within this group's ceiling
      (PRD §39.2).
- [ ] `[machine]` `python -m <iroot>.conformance check pipelines/adapters/fwo-guidance` exits 0 in
      **strict** mode; the committed `conformance-report.json` shows no `FAIL` and no
      `NOT_AVAILABLE` (PRD §45.4).

**Group-specific:**

- [ ] `[machine]` **Subordination is mechanical (PRD §9.1, §6.1)** — no record emitted by this adapter
      carries a `document_type` from the legislation, legislative-instrument or operative-instrument
      families; a mutated fixture that attempts one raises before emission and produces the
      `document type would be operative` failure code. Every emitted document's `authority_key`
      identifies the Fair Work Ombudsman as a regulator (deliverable 6).
- [ ] `[machine]` **Subject-scope allowlist (deliverable 4)** — a discovered URL outside the committed
      subject list is **not** fetched and produces the corresponding failure code; every entry in the
      list has a recorded reason (mirrors PRD §40.2's title-allowlist discipline).
- [ ] `[machine]` **Undated guidance is honest (PRD §15.2, §6.7)** — a fixture page with no
      publication date yields `publication_date: null` and `legal_status: STATUS_UNCONFIRMED`, never
      an inferred date; `retrieved_at` is always populated.
- [ ] `[machine]` **Unlabelled content change is a new version (PRD §35.3)** — a fixture whose body
      changes with no version label produces a new `DocumentVersion` with a new `content_hash`, and no
      update path mutates the prior version.
- [ ] `[machine]` **No rate facts and no `_shared/rates` import** — an import scan asserts
      `_shared.rates` is not imported anywhere in this directory, and the emitted record stream
      carries no `rates` tool-version key (sub-PRD **N4**; this ticket has no `SINS-01` edge).
- [ ] `[machine]` **No legislation events** — the emitted stream contains no `legal_event` for
      commencement, amendment or repeal of legislation; those belong to `SLEG-02`/`SFUT-02`
      (Non-goals).
- [ ] `[machine]` **No unevidenced relation (PRD §9.3)** — a change notice whose subject is only
      implied emits no `node_relation`; no emitted relation carries a model-suggested
      `confidence_state` (PRD §35.2).
- [ ] `[machine]` The adapter imports no HTTP library and no HTML/XML/PDF parsing library —
      `INGF-01`'s AST scan over `pipelines/adapters/fwo-guidance/**` passes (PRD §37.4, SEC-002).
- [ ] `[machine]` `python -m <iroot>.registry validate pipelines/adapters/fwo-guidance` exits 0 and a
      `--mode release` compose containing this group succeeds with `ACTIVE` or a PRD §7 limited status
      **with** a `customer_visible: true` gap (PRD §7, §44.4).
- [ ] `[machine]` **A limited status is only expressible with its evidence (sub-PRD D11; plan §8
      Q10).** If this group's `adapter_status` is limited, the `--mode release` compose carries the
      `limitation` block through verbatim and fails when any obligation is removed — one parametrised
      mutation per code: no block → `REGISTRY_LIMITATION_MISSING`; empty `evidence` →
      `REGISTRY_LIMITATION_UNEVIDENCED`; no `affected` dates or collections →
      `REGISTRY_LIMITATION_SCOPE_MISSING`; empty `customer_visible_warning` →
      `REGISTRY_LIMITATION_WARNING_MISSING`. If the group is `ACTIVE`, the same test asserts
      `limitation` is null and that adding one fails to load.
- [ ] `[machine]` The whole suite runs offline with no outbound network.
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, §20.3).
- [ ] `[machine]` `pnpm test` green — standing item; no TypeScript here, so "unchanged and green".
- [ ] `[human]` **Licence assessment sign-off** — the nine PRD §11.1 axes are a legal judgment
      (PRD §11.2, `LEGAL_REVIEW_PENDING`). PRD §11.1 also forbids implying government endorsement, and
      regulator guidance is exactly the material where that risk is highest; the Founder confirms the
      attribution text and quotation limit before the group is declared `ACTIVE`.
- [ ] `[human]` **Subject-scope review** — is the committed subject allowlist the right employment/
      payroll boundary, neither over-collecting unrelated FWO material nor omitting a topic customers
      will ask about? Irreducibly a judgment call; PRD §43.4 item 4 puts source adapter anomalies in
      the founder review queue and PRD §6.1 forbids over-claiming coverage.
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (`ADM-001`; supports `SRCH-002`,
      `SRCH-003`, and the PRD §9.1 subordination `EVID-05` enforces); UAT IDs — **none owned**;
      schema/API/event compatibility (none — instances only); tenant/PII/security impact (none —
      public official material; the fixture scan is the control); **source/licence impact (the
      recorded assessment, the attribution text, and the endorsement caveat of PRD §11.1)**;
      cost/memory/latency impact (DoD item 12); rollback path (mark `IN_DEVELOPMENT`, exclude from a
      release compose); known gaps (sub-PRD N4, plus this group's own `known_gaps` entries and — if it
      carries one — its `limitation` block with the evidence behind it; the anomaly thresholds are
      baseline-selected and consolidated by `GOLD-16`, plan §8 **Q9**, and the limited-state launch
      policy itself is confirmed, plan §8 **Q10**, so it is not a gap in this ticket).
- **Absent classes:** none. This ticket carries `[machine]`, `[fixture]` and `[human]` criteria.

## Test plan

Harness: `uv run pytest pipelines/adapters/fwo-guidance -q` plus the conformance CLI. All replays are
offline through `INGF-09`'s `ReplayFetcher`/`ReplayClock`; the fetcher refuses a URL absent from the
fixtures **and** a URL present but outside `allowlist.yaml`. Copy the construction pattern from
`INGF-09`'s reference adapter (`pipelines/ingestion/src/<iroot>/conformance/reference/demo-registry/`)
and its authoring guide (`pipelines/ingestion/src/<iroot>/conformance/README.md`).

1. `uv sync --frozen && uv run pytest pipelines/adapters/fwo-guidance -q`.
2. `python -m <iroot>.registry validate pipelines/adapters/fwo-guidance` — exit 0.
3. `python -m <iroot>.conformance check pipelines/adapters/fwo-guidance --report conformance-report.json`
   — exit 0, twelve verdicts inspected individually; `NOT_AVAILABLE` is a failure, never a skip.
4. **`tests/test_subordination.py`** — the load-bearing test: for every recorded fixture, assert the
   emitted `document_type` is in the guidance set and the `authority_key` is the FWO; then a mutation
   that forces an operative type, asserting the guard raises and the failure code is recorded.
5. **`tests/test_subject_scope.py`** — an out-of-scope URL in a recorded listing is not fetched;
   every allowlist entry has a reason.
6. **`tests/test_dating.py`** — the undated-page case (`STATUS_UNCONFIRMED`, null publication date,
   populated `retrieved_at`) and the unlabelled-content-change case (new version by `content_hash`,
   prior version unmutated).
7. **`tests/test_no_rates.py`** — the `_shared.rates` import scan and the tool-version key assertion.
8. **`tests/test_change_notices.py`** — a structurally-stated link emits a deterministic relation; an
   implied link emits nothing.
9. **`tests/test_registry_status.py`** — the declared `adapter_status` composes in `--mode release`;
   if it is limited, the four `limitation` mutations each fail with their own `REGISTRY_LIMITATION_*`
   code and the block survives composition verbatim; if it is `ACTIVE`, adding a `limitation` fails
   to load (sub-PRD **D11**).
10. **`tests/test_architecture.py`** — re-runs `INGF-01`'s AST scan over this directory with a
    synthetic dirty module as negative control.
11. `uv run pytest` (whole repo) and `pnpm test` — green.

**Reviewer focus.** (a) Run `tests/test_subordination.py` first: one mislabelled guidance document is
enough for regulator guidance to outrank the Act it summarises, which is precisely what PRD §9.1's
last sentence and PRD §6.1 forbid. (b) Confirm no pay-guide number became a `RateFact` — this ticket
has no `SINS-01` edge, and a locally-copied rate model is the plan §9 R2 failure. (c) Confirm undated
guidance is not given an invented date. (d) Confirm the recorded `change_detection.capability` is
backed by evidence in `fixtures/dry-run.json`. (e) If the group is limited, confirm the `limitation`
block names a real official-source constraint with evidence — not a scope decision wearing a
`reason_code` (sub-PRD **D11**).

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (docs PR/MR,
changelog line in `docs/prd/07-sources-instruments/README.md`, then `publish-tickets.mjs --sync`),
then change code. `GOLD-16` is `blocked_by` this ticket.

**Foreseeable frictions and their exact writeback targets:**

1. **The guidance site has no reliable delta mechanism** — pages change silently, with no feed, no
   sitemap and no conditional-request support → record the true `change_detection.capability`, let
   `INGF-07` derive **`FRESHNESS_LIMITED`**, add a `known_gaps` entry with `customer_visible: true`,
   populate the `limitation` block (`reason_code: OFFICIAL_CAPABILITY_LIMIT` or
   `FRESHNESS_LIMITATION`, the capability-probe evidence, the affected collections, the
   customer-visible warning), and update `docs/prd/07-sources-instruments/README.md`. PRD §12.1
   requires exactly this "rather than a false guarantee". Content-hash comparison is a valid
   *detection* mechanism but it is not a delta feed — declare what is true.
2. **Rights are unclear, restricted or prohibited** → record the true PRD §11.1 status, let
   `INGF-04`'s gate collapse it to metadata/link-only, set the registry status to
   **`LICENSING_RESTRICTED`** with a customer-visible gap and a `limitation` block whose
   `reason_code` is `LICENSING_RESTRICTION` and whose `evidence[]` cites the licence assessment, and
   update this module's README. PRD §44.4 forbids silently calling the category covered.
3. **Pay guides genuinely need to be rate facts** (sub-PRD **N4**) → the writeback is a **plan**
   change: add `SINS-01` to this ticket's `blocked_by` in `docs/prd/breakdown-plan.md` §5.8, add the
   matching edge in §6.2, update `docs/prd/07-sources-instruments/README.md` **N4**, then
   `publish-tickets.mjs --sync`. **Never** copy `_shared/rates` into this directory (plan §9 **R2**)
   and never emit an ad-hoc rate structure.
4. **A guidance page can only be dated by inference** → do not infer. Use
   `legal_status: STATUS_UNCONFIRMED` (PRD §6.7) and record a `known_gaps` entry. PRD §15.2 makes
   status derive from evidence; an invented effective date is a date/jurisdiction critical error,
   which PRD §43.3 gates to zero.
5. **A guidance document appears to state the law more clearly than the Act** → irrelevant to this
   ticket's typing. PRD §9.1: "Guidance MUST NOT silently override legislation, an operative
   instrument or binding authority", and PRD §6.1: regulator summaries "MUST NOT replace primary
   decisions or operative instruments". If the guidance set genuinely needs a finer document typing to
   express (say) a binding ruling versus an explanatory note, extend the closed set here and record it
   in this module's README; if the needed value does not exist in `packages/contracts`, that is
   sub-PRD **N1**'s writeback to `FND-03`, never a local literal.
6. **A change notice describes a commencement** → capture the notice as guidance and stop.
   Legislation events are `SLEG-02`'s and future-status events are `SFUT-02`'s; this ticket has edges
   to neither, and emitting one here would put an unevidenced legal status change in the corpus from a
   secondary source.

**Escalation rule.** If the twelve-item Definition of Done cannot be satisfied for this mandatory
group, PRD §7 and PRD §44.4 forbid leaving it `PLANNED_NOT_ACTIVE` or calling it covered. Stop and
record the true status together with its complete `limitation` block — evidence, affected dates or
collections, customer-visible warning and the reason full coverage is unavailable. The governing
policy is **confirmed** (plan §8 **Q10**; sub-PRD **D11**), so the question raised is never "may this
group be dropped or reduced" but only "does the measured evidence show a genuine official-source
limitation"; `GOLD-16` produces the evidence and the proposed registry state, `LNCH-05` verifies the
launch statement, and Gate 2 is the verification and sign-off step. And if the subordination guarantee
of deliverable 6 cannot be made mechanical — if regulator guidance cannot be distinguished from
operative material at ingestion — escalate for re-review rather than shipping: PRD §9.1's closing rule
is the difference between research and misinformation.
