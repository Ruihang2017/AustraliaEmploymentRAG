---
id: SADJ-08
title: ADJ-ACT
module: 09-sources-adjacent
lane: 09-sources-adjacent
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INGF-09, SLEG-09]
blocks: [GOLD-10, GOLD-11, GOLD-16]
---

# SADJ-08 — `ADJ-ACT`

Implements PRD §40.5 (wave 4 — employment-adjacent official regimes), PRD §6.3 (state and territory
scope) and PRD §40.8 (adapter Definition of Done) <SRCH-002, ADM-001> — No ADR — the decision is
already made in PRD §40.5; this is build ticket 8 of 9 against it.
Parent sub-PRD: [09-sources-adjacent README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on:
[INGF-09 — Adapter conformance kit (the twelve-item DoD)](../../05-ingestion-framework/tickets/INGF-09-adapter-conformance-kit-the-twelve-item-dod.md);
`SLEG-09` — `LEG-ACT`, module `06-sources-legislation` (`docs/prd/06-sources-legislation/tickets/`).
**Why `builder`:** a bounded change inside one module's declared file-scope — one adapter directory —
against contracts PRD §40.7/§40.8 and `INGF-01`/`INGF-09` already fix; not a new subsystem decision.

## Background + basis

**PRD §40.5 fixes this group's row verbatim:**

| Group ID | Authorities to enumerate in registry | Required topics |
|---|---|---|
| `ADJ-ACT` | WorkSafe ACT, ACT Human Rights Commission, ACT Long Service Leave Authority and responsible public-sector authorities | WHS, discrimination, compensation, portable/ordinary LSL, privacy/public-sector employment |

and the release rule this ticket exists to satisfy:

> "An authority name in this planning row is not enough for release. The registry must link exact
> official pages/collections and identify whether material is law, operative instrument, decision,
> code, guidance, policy or news."

**PRD §6.3 fixes the full state/territory checklist** — binding on the ACT in addition to the §40.5
row:

> "For NSW, Victoria, Queensland, Western Australia, South Australia, Tasmania, the ACT and the
> Northern Territory: payroll tax legislation, rates and official guidance; employment and
> industrial-relations legislation and guidance; long-service leave; WHS/OHS; discrimination and
> equal opportunity; workers compensation; labour hire licensing; portable long-service leave;
> workplace surveillance and employment-related privacy; whistleblowing; child employment;
> public-sector employment; relevant regulators, courts and tribunals."

Note that the §40.5 ACT row does **not** name labour hire licensing or child employment, while §6.3
does. The ACT operates a labour-hire licensing scheme, so it is a covered collection here, not a gap —
sub-PRD **D5**: the §6.3 checklist is evaluated for every jurisdiction and every topic resolves to a
collection, a customer-visible gap, or another module. PRD §44.4: "It is not permitted to silently
call an unimplemented source category covered."

**PRD §7** fixes the release outcome: no mandatory group may remain `PLANNED_NOT_ACTIVE`; a group
blocked by official capability or licensing "MUST use an explicit status such as
`METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED` or `SOURCE_UNAVAILABLE` and
MUST produce customer-visible warnings when relevant."

**PRD §9.1 fixes what this material *is*** — level 6, "Official regulator guidance, rulings, decision
summaries and impact materials" — and: "Guidance MUST NOT silently override legislation, an operative
instrument or binding authority." PRD §6.1: "Official regulator summaries MAY supplement but MUST NOT
replace primary decisions or operative instruments."

**The ACT privacy cross-reference — sub-PRD D9 / open question M8.** ACT information-privacy
complaints and guidance are handled under an arrangement with the **Commonwealth** Office of the
Australian Information Commissioner, whose collection is ingested **once** by `SADJ-01` under
`ADJ-CTH`. This group therefore records the applicability of that material in its registry entry and
emits **no duplicate document identity**. PRD §35.2 makes `legal_document` unique on
`(source_id, stable_source_key)` and PRD §40.9 flags "any duplicate stable identity" as an anomaly;
duplicating the OAIC collection here would create exactly that, plus two divergent freshness records
for one source.

**Why `blocked_by SLEG-09`.** The Acts and subordinate laws behind these regimes — the *Work Health
and Safety Act 2011* (ACT) and its approved codes of practice (approved by **notifiable instrument**,
so the approved text itself is register material), the *Discrimination Act 1991* (ACT), the
*Workers Compensation Act 1951* (ACT), the *Long Service Leave (Portable Schemes) Act 2009*,
*Long Service Leave Act 1976* (ACT), *Labour Hire Licensing Act 2020* (ACT),
*Information Privacy Act 2014* (ACT), *Public Interest Disclosure Act 2012* (ACT) and
*Public Sector Management Act 1994* — belong to `LEG-ACT` (PRD §40.2, wave 1). This adapter never
re-ingests them (sub-PRD **D4**); it emits `node_relation` records targeting their `LEG-ACT` node
identities, which must exist first. PRD §9.3: "Deterministic extraction may support conclusions when
exact source evidence and parser version are retained." The ACT's instrument-based code approval makes
this boundary sharper than in other jurisdictions: the **approved code text** is `LEG-ACT` register
material, while the regulator's guidance, summaries and alerts about it are this group's.

**Why `blocked_by INGF-09`.** `INGF-09` ships the twelve-item conformance kit, the `ReplayFetcher`,
`ReplayClock` and `replay_context` helpers, the reference adapter and the authoring guide at
`pipelines/ingestion/src/<root>/conformance/README.md` — the document this ticket is written against.
`INGF-01` fixes the eight PRD §40.7 boundaries, `AdapterMeta`, `AdapterRunContext` and the `ADAPTER`
convention; `INGF-02` owns `allowlist.yaml`, `INGF-04` owns `licence.yaml`, `INGF-07` owns
`registry.yaml`.

**Carried caveats, documented not re-litigated.** Sub-PRD **M1** (one `authority:` per
`registry.yaml` vs many authorities per group), **M2** (one `licence.yaml` per group — interim:
most-restrictive-wins), **M3** (`known_gaps` has no "regime does not exist" reason code — a gap-level
code only; it never sets `adapter_status` and never produces a `limitation` block, sub-PRD **D12**),
**M7** (per-collection fixture namespacing), **M8** (the OAIC cross-reference resolved by this ticket
under **D9**).

**Per-source anomaly thresholds are baseline-selected, not guessed (sub-PRD M6; plan §8 Q9).**
PRD §40.9's ±10% collection-count change and >2% parse-failure figures are **initial defaults**. This
ticket records the group's values in `conformance.yaml` and may tighten or replace the percentages
once it has a representative baseline — overrides are tighten-only. Critical identity, time,
mandatory-source and citation failures are unconditional blockers whatever the percentages are, and
`GOLD-16` consolidates and verifies the final per-source thresholds.

**The limited-state launch policy is settled — plan §8 Q10 is confirmed policy (sub-PRD D11).**
No mandatory source group is pre-selected for omission or reduced implementation; `ADJ-ACT` must be
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

Deliver the `ADJ-ACT` source adapter at `pipelines/adapters/adj-act/**`: a `registry.yaml` that
decomposes the group into the seven named source groups of Deliverable 1 with an exact official
endpoint and PRD §40.5 material classification per collection **and** records the `ADJ-CTH` privacy
cross-reference without duplicating it, an `allowlist.yaml` covering exactly those hosts, a
`licence.yaml` plus captured snapshots, and an `adapter.py` exposing `ADAPTER: SourceAdapter`
implementing all eight PRD §40.7 boundaries across those collections — such that
`python -m <root>.conformance check pipelines/adapters/adj-act` exits 0 with all twelve PRD §40.8
items `PASS` per collection (item 11 `DEFERRED(GOLD-16)` only while `evals/cases/**` is absent), the
composed Source Coverage Registry reports `ADJ-ACT` as `ACTIVE` or an explicit PRD §7 limited status
with customer-visible gaps, and every PRD §6.3 topic is mapped to a collection, to a recorded gap, or
to the module that owns it.

## Non-goals

- **No ACT legislation or register instruments.** Acts, subordinate laws, disallowable and notifiable
  instruments — **including the approved WHS codes of practice as approved instruments** — belong to
  `SLEG-09` (`LEG-ACT`, module `06-sources-legislation`). This group ingests the regulator's guidance
  about them, not the instrument text.
- **No court or tribunal decisions.** ACT courts and ACAT belong to `SCAS-12` (`CASE-ACT`, module
  `08-sources-cases`). Only the **regulator's own** published decisions, register entries, enforcement
  outcomes and decision summaries are in scope here (PRD §6.4 last bullet, §9.1 level 6).
- **No duplicate ingestion of the Commonwealth OAIC collection.** `SADJ-01` (`ADJ-CTH`) owns it;
  this group cross-references it (sub-PRD **D9**).
- **No bills, drafts or consultations.** `SFUT-09` (`FUTURE-ACT`, module `10-sources-future`).
- **No payroll tax.** `SINS-13` (`PT-ACT`, module `07-sources-instruments`).
- **No ACT public-sector enterprise agreements.** Approved enterprise agreements belong to
  `FWC-AGREEMENTS` (`SINS-04`, module `07-sources-instruments`).
- **No `_shared/**` helper directory.** Sub-PRD **D2**: module 09 has no `_shared` path in plan §4.
- **No framework code** — `pipelines/ingestion/**`, PRD §40.7.
- **No corpus writes.** PRD §40.7: "The adapter never writes active corpus tables directly."
- **No evaluation cases or gold data** — `GOLD-10`/`GOLD-11`; `evals/gold/**` is never read (plan §9
  R9, PRD §45.1 item 6).
- **No live network access in tests** — item 2's "live dry-run evidence" is a recorded artifact.
- **No new third-party dependency** — sub-PRD **D10**.

## File-scope (write-owns)

- `pipelines/adapters/adj-act/**` — `registry.yaml`, `allowlist.yaml`, `licence.yaml`,
  `licence-snapshots/**`, `conformance.yaml`, `adapter.py`, internal modules of the Builder's choice,
  `fixtures/**`, `tests/**`.
- Does not touch: `pipelines/adapters/adj-{cth,nsw,vic,qld,wa,sa,tas,nt}/**` — sibling tickets
  `SADJ-01`…`SADJ-07`, `SADJ-09`. In particular the OAIC collection lives in `adj-cth/` and is read,
  never copied.
- Does not touch: `pipelines/adapters/_shared/**` (`SLEG-01`, `SINS-01`, `SCAS-01`, `SFUT-01`) —
  read-only reuse allowed, writing is not.
- Does not touch: `pipelines/adapters/leg-*/**` (`06`), `pipelines/adapters/{fwc-*,fwo-*,ato-*,pt-*}/**`
  (`07`), `pipelines/adapters/case-*/**` (`08`), `pipelines/adapters/future-*/**` (`10`).
- Does not touch: `pipelines/ingestion/**` (`05`), `pipelines/corpus-builder/**` and
  `pipelines/embeddings/**` (`04`), `pipelines/evaluation/**` and `evals/**` (`21`).
- Does not touch: `packages/**`, `apps/**`, `services/**`, `schemas/**`, `infra/**`, `tests/**`,
  `.github/workflows/**`, root manifests, `pipelines/adapters/pyproject.toml` (sub-PRD **D10**/**M4**).

**Serial safety.** First decomposition of `docs/PRD.md`: nothing merged, no prior ticket has touched
these paths. The eight sibling `SADJ` tickets own eight different sibling directories, so the nine
jurisdiction scopes are disjoint by construction and the module has no intra-module edges (plan §7:
min waves 1, nine useful lanes) — all nine may run as concurrent lanes. The `ADJ-CTH` cross-reference
of sub-PRD **D9** is a **registry reference by group id**, not a file dependency: it introduces no
write into `adj-cth/` and no `blocked_by` edge, and it is resolved by `INGF-07`'s composer at build
time. `pipelines/adapters/pyproject.toml` stays untouched (sub-PRD **D10**). Upstream `INGF-09` and
`SLEG-09` have landed before this ticket starts.

## Deliverables

1. **Registry decomposition — the seven named source groups of `ADJ-ACT`.** Each becomes one
   `official_endpoints` entry (or a small contiguous set) in `registry.yaml`, with its own discovery
   strategy, fixtures, baseline row and quarantine cases. Domains are the **expected** official
   entries; the Builder resolves and records the exact collection URLs, and a changed entry point is
   a writeback (*Feedback obligation* 4), not an improvisation.

   | # | `collection_key` | Authority (`authority_type`) | Expected official entry | PRD §6.3 topic | `material_class` values | Initial tier |
   |---|---|---|---|---|---|---|
   | 1 | `whs-worksafe-act` | WorkSafe ACT / Office of the Work Health and Safety Commissioner (`REGULATOR`) | `worksafe.act.gov.au` | WHS/OHS | `GUIDANCE`, `DECISION` (prosecutions, enforceable undertakings), `NEWS` (safety alerts), `CODE` **only** where the regulator publishes non-instrument code material — approved codes as instruments are `LEG-ACT` | T1 |
   | 2 | `workers-comp-worksafe-act` | WorkSafe ACT — private-sector workers compensation regulator (`REGULATOR`) | workers-compensation pages under `worksafe.act.gov.au` | workers compensation | `OPERATIVE_INSTRUMENT` where made under the Act, `GUIDANCE`, `POLICY` | T1 |
   | 3 | `discrimination-hrc-act` | ACT Human Rights Commission (`COMMISSION`) | `hrc.act.gov.au` | discrimination and equal opportunity; human rights | `GUIDANCE`, `POLICY`, `DECISION` (published reports and conciliation outcomes) | T1 |
   | 4 | `portable-lsl-actleave` | ACT Long Service Leave Authority ("ACT Leave") (`REGULATOR`) | `actleave.act.gov.au` | portable long service leave (construction, cleaning, community sector, security) | `GUIDANCE`, `POLICY`, `DECISION` (registration/scheme decisions) | T2 |
   | 5 | `labour-hire-access-canberra` | Access Canberra (`REGULATOR`) | `accesscanberra.act.gov.au` | labour hire licensing; ordinary long service leave and employment-standards guidance | `DECISION` (public licence register entries and licensing decisions), `GUIDANCE` | T2 |
   | 6 | `public-sector-actps` | ACT Public Service — Head of Service, Chief Minister, Treasury and Economic Development Directorate (`DEPARTMENT`) | `cmtedd.act.gov.au`, ACT public-sector employment pages under `act.gov.au` | public-sector employment | `OPERATIVE_INSTRUMENT` (Head of Service directions and determinations), `GUIDANCE`, `POLICY` | T2 |
   | 7 | `pid-privacy-act` | ACT Ombudsman (`REGULATOR`), with the privacy arrangement recorded as a cross-reference to `ADJ-CTH` | `ombudsman.act.gov.au` | whistleblowing / public interest disclosures; employment-related privacy (**cross-reference**, sub-PRD **D9**) | `GUIDANCE`, `CODE` (PID guidelines and model procedures) | T2 |

   `authority.jurisdiction` is `ACT` for all seven. Lead authority in `registry.yaml.authority` is
   **WorkSafe ACT**; every other authority is named on its endpoint entries — the interim rule of
   sub-PRD **M1**. Collections 1 and 2 share a host but are distinct collections; they must not be
   collapsed into one endpoint row.

2. **`pipelines/adapters/adj-act/registry.yaml`** — one file validating against `INGF-07`'s
   `registry.schema.json`: `group_id: ADJ-ACT`, `wave: 4`, lead `authority`, one `official_endpoints`
   entry per collection URL with `collection`, `kind` and `material_class`, `document_coverage`
   (families, `date_from`, `financial_years` covering at least PRD §6.6's 2024-25/2025-26/2026-27),
   `licence_ref`, `allowlist_ref`, `adapter_status`, `initial_index_tier`, `change_detection`,
   `known_gaps` — **including the privacy cross-reference entry naming `ADJ-CTH`** — and
   `evaluation_subset_ref`. `python -m <root>.registry validate pipelines/adapters/adj-act` exits 0.

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
   Deliverable 1 with the narrowest `path_prefixes` covering the declared collections. The OAIC host
   is **not** allowlisted here — that collection belongs to `adj-cth` (sub-PRD **D9**). Every
   `official_endpoints` URL must pass this file.

4. **`licence.yaml` + `licence-snapshots/`** — `INGF-04`'s schema: a captured snapshot per authority
   and one `assessment` covering all nine PRD §11.1 decision axes plus `attribution_text`,
   `max_quote_chars` and `status`. Divergent terms resolve to the most restrictive for the group
   (sub-PRD **M2**); unclear terms are `UNCLEAR_RESTRICTED`, collapsing to metadata/link-only
   (PRD §11.1).

5. **`adapter.py` — `ADAPTER: SourceAdapter`** with `meta = AdapterMeta(group_id="ADJ-ACT",
   adapter_key="adj-act", jurisdiction="ACT", …)` implementing all eight PRD §40.7 boundaries. All
   I/O flows through `ctx: AdapterRunContext`; no HTTP or parser library is imported (`INGF-01`
   deliverable 11).

6. **`discover()` — per-collection strategies.** One strategy per `collection_key` declaring its
   change-detection mechanism (feed, sitemap, API, updated listing, manifest, or conditional request
   over a listing page), emitting `RemoteDescriptor`s with a run-stable `descriptor_key` and the
   `collection_key` in `hints`. The public licence register (collection 5) is paginated: its strategy
   must be explicit about pagination and about how a de-listed licence is detected. A collection with
   no delta mechanism declares `capability: NONE` and drives `FRESHNESS_LIMITED` (sub-PRD **D6**,
   PRD §12.1).

7. **`identify()` — stable identity and deletion behaviour.** `stable_source_key` scheme
   `adj-act:<collection_key>:<authority-assigned-id-or-normalised-path>`, documented with one worked
   example per collection. Deterministic across runs, stable across versions, collision-free across
   collections and — critically — **never equal to an `ADJ-CTH` OAIC key** (sub-PRD **D9**). A
   disappeared descriptor yields `REMOVED` and retains prior versions; a de-listed labour-hire licence
   is a status change with history, never a deletion (PRD §40.8 item 3).

8. **`parse()` + `normalise()` — node hierarchy and exact-text round-trip.** Head of Service
   directions and long guidance normalise to a chapter/section/clause `NodeVersion` tree (one root,
   contiguous sibling ordinals); short guidance and register entries normalise to a shallow structure.
   `text[start_offset:end_offset]` reproduces every block and every `text_hash` recomputes from
   `canonical_text` (PRD §15.3, `INGF-06`'s `assert_roundtrip()`).

9. **`document_type` — subordinate-authority typing (sub-PRD D3).** Closed vocabulary distinguishing
   at least `REGULATOR_GUIDANCE`, `HEAD_OF_SERVICE_DIRECTION`, `SCHEME_GUIDELINE`, `REGULATOR_POLICY`,
   `REGULATOR_DECISION`, `PUBLIC_REGISTER_ENTRY` and `REGULATOR_NEWS`, each mapped to its PRD §40.5
   `material_class`. Because approved WHS codes are register instruments in the ACT, the vocabulary
   must **not** contain a type that would let this adapter emit an approved code as if it owned it —
   PRD §9.1's "Guidance MUST NOT silently override legislation" and sub-PRD **D4**.

10. **`extractEvents()` — evidenced status only (sub-PRD D7).** Issue, revision, replacement and
    withdrawal events with `event_date` and `effective_date` distinguished (PRD §15.2), yielding a
    PRD §6.7 `legal_status`. No published status signal ⇒ `STATUS_UNCONFIRMED`, never `IN_FORCE` by
    default. Head of Service directions are numbered, dated and superseded explicitly: that history
    must be captured, not flattened to "current". Versions of one consolidated series must not overlap
    (PRD §35.2, §40.9).

11. **`extractRelations()` — links into `LEG-ACT`, never re-ingestion (sub-PRD D4).** Regulator
    guidance about an approved code, a direction citing the *Public Sector Management Act*, or
    guidance citing a numbered provision emits a `node_relation` targeting the `LEG-ACT` node identity
    with `derivation` recording deterministic extraction, exact evidence offsets and `parser_version`,
    and a `confidence_state` that is never `MODEL_SUGGESTED` (PRD §9.3, §35.2). Unresolvable citations
    are dropped, not guessed. This is the ACT's sharpest boundary: guidance about a code links to the
    code's `LEG-ACT` identity rather than restating it.

12. **PRD §6.3 topic coverage map**, materialised both in `registry.yaml` and as a committed table in
    the adapter's module docstring:

    | PRD §6.3 topic | Covered by | Note |
    |---|---|---|
    | payroll tax legislation, rates, guidance | `PT-ACT` (`SINS-13`, module `07`) | out of this group's scope |
    | employment and industrial-relations legislation | `LEG-ACT` (`SLEG-09`, module `06`) | guidance side covered by collections 5 and 6 |
    | long service leave | collection 5 | ordinary LSL |
    | WHS/OHS | collection 1 | approved codes as instruments are `LEG-ACT`; this collection is the regulator's guidance about them |
    | discrimination and equal opportunity | collection 3 | |
    | workers compensation | collection 2 | |
    | labour hire licensing | collection 5 | the ACT operates a licensing scheme even though §40.5's ACT row does not name it — sub-PRD **D5** |
    | portable long service leave | collection 4 | |
    | workplace surveillance and employment-related privacy | **cross-reference to `ADJ-CTH`** | ACT information-privacy material is administered under an arrangement with the Commonwealth OAIC and is ingested once by `SADJ-01`. Record a `known_gaps`-style entry with `customer_visible: true` that names `ADJ-CTH` as the covering group; emit no duplicate identity (sub-PRD **D9**, **M8**; PRD §35.2, §40.9). |
    | whistleblowing | collection 7 | |
    | child employment | **verify** | ACT child-employment rules sit in the children and young people legislation (`LEG-ACT`); if no regulator collection publishes employment-relevant guidance, record a `known_gaps` entry with `customer_visible: true` rather than leaving the topic unmentioned (sub-PRD **D5**) |
    | public-sector employment | collection 6 | approved enterprise agreements are `FWC-AGREEMENTS` (`SINS-04`) |
    | relevant regulators, courts and tribunals | this group (regulators) + `CASE-ACT` (`SCAS-12`, module `08`) | boundary stated in *Non-goals* |

    Any topic that cannot be covered — including date-limited coverage against PRD §6.6's three
    financial years — is recorded as a `known_gaps` entry with `customer_visible: true`, never
    omitted (sub-PRD **D5**, PRD §44.4).

13. **Fixtures (PRD §40.8 items 2, 4, 6, 7, 8, 10), namespaced per collection** under the kit's
    directory names (sub-PRD **M7**): `fixtures/discovery/<collection_key>/…`,
    `fixtures/documents/<collection_key>/…` covering every declared content type,
    `fixtures/timepoints/<collection_key>/…` with ≥3 legal dates, `fixtures/quarantine/…` with ≥1
    defective artifact per declared quarantine code, `fixtures/baseline.json` with one `collections`
    row per `collection_key`, and `fixtures/dry-run.json` within `DRY_RUN_MAX_AGE_DAYS`. Every fixture
    is public source material with no customer data, cookies, `Authorization` headers or credentials
    (`INGF-09` item 4) — the licence-register fixture is the highest-risk case.

14. **`conformance.yaml` + `tests/test_conformance.py`** — the five-line `ConformanceTestCase`
    subclass from `INGF-09` deliverable 1, plus `resource_ceilings` and initial tighten-only
    `anomaly_overrides` (PRD §40.9, sub-PRD **M6**). `deferred_items` may contain only `11`, with a
    reason.

15. **Adapter-local unit tests** beyond the inherited kit: per-collection discovery parsing (including
    register pagination and shared-host separation), identity stability/collision properties
    **including the no-collision-with-`ADJ-CTH` property**, the `document_type` mapping table, the
    `LEG-ACT` relation extractor including its drop-on-ambiguity path, and the gap/cross-reference
    derivation of Deliverable 12.

16. **Failure codes** registered with `register_failure_codes("adj-act", …)`, each with a non-empty
    operator action (PRD §40.8 item 10, ADM-001): at minimum unparseable collection listing, missing
    collection listing, register pagination truncated, unexpected content type, identity conflict,
    cross-group identity collision, unresolvable citation target and licence-terms change detected.

## Acceptance checklist (classified)

**Per named source group.** Items 1–12 are PRD §40.8's twelve-item Definition of Done and each must
hold for **every one of the seven named source groups** in Deliverable 1. A report in which an item
passes for one collection and is absent for another is a failure (PRD §44.4).

- [ ] `[machine]` **DoD 1 — registry row, allowlist, licence.** All three files validate; `group_id`
      is `ADJ-ACT` and in `MANDATORY_SOURCE_GROUPS`; directory name equals `group_id.lower()`; each of
      the seven collections has its own `official_endpoints` row with a PRD §40.5 `material_class`;
      every endpoint URL passes `allowlist.yaml`; the OAIC host is **not** allowlisted here; the
      licence snapshot's SHA-256 equals `snapshot.terms_sha256` (PRD §40.8 item 1, §6.1, §11.1).
- [ ] `[fixture]` **DoD 2 — discovery fixture and dry-run evidence.** Replay yields ≥1
      `RemoteDescriptor` per collection with a non-empty `descriptor_key` and an allowlisted URL;
      `fixtures/dry-run.json` is present, well-formed and within `DRY_RUN_MAX_AGE_DAYS`.
- [ ] `[fixture]` **DoD 3 — stable identity, versions, deletion/unavailability.** Deterministic across
      two calls, stable across two versions, collision-free across collections and against `ADJ-CTH`
      OAIC keys; a removed descriptor yields `REMOVED` and deletes no prior state, including a
      de-listed licence-register entry.
- [ ] `[fixture]` **DoD 4 — representative fixtures without customer data.** Every declared content
      type is represented per collection and the no-customer-data scan is clean (PRD §40.8 item 4,
      §19.2, §35.3).
- [ ] `[fixture]` **DoD 5 — parser/node hierarchy and exact-text round-trip.** `assert_roundtrip()`
      passes for every document fixture; one root, no cycles, contiguous sibling ordinals; every
      `text_hash` recomputes (PRD §15.3, §35.2).
- [ ] `[fixture]` **DoD 6 — three time points.** Three declared legal dates per collection resolve to
      bracketing `effective_from`/`effective_to`, a PRD §6.7 `legal_status`, and events with
      `event_date` and `effective_date` distinguished; a superseded Head of Service direction keeps its
      history; no overlapping consolidated intervals (PRD §6.6, §15.2, §35.2).
- [ ] `[fixture]` **DoD 7 — incremental no-change / changed / removed / transient-failure.** The four
      replayed scenarios produce their expected counts and status per collection; the transient
      failure retries within bounds and creates **no** content quarantine item.
- [ ] `[fixture]` **DoD 8 — count/hash baseline and anomaly thresholds.** `baseline.json` has one row
      per `collection_key`, the replayed run reproduces it exactly, and `anomaly_overrides` tighten
      and never loosen `INGF-05`'s policy (PRD §40.9).
- [ ] `[fixture]` **DoD 9 — freshness schedule with last-check/last-ingest separation.** A replayed
      304 run advances `last_successful_change_scan_at` and leaves `last_content_ingestion_at`
      unchanged; a content run advances both (PRD §12.1).
- [ ] `[fixture]` **DoD 10 — quarantine cases and operator recovery action.** Every declared
      quarantine code has ≥1 defective fixture producing exactly that code, and a non-empty operator
      action in `INGF-05`'s reason table (ADM-001).
- [ ] `[machine]` **DoD 11 — retrieval/citation evaluation subset.** `evaluation_subset_ref` is
      non-empty and well-formed, resolving against `evals/cases/**` where it exists, otherwise
      `DEFERRED(GOLD-16)` with a recorded reason; `evals/gold/**` is never read (plan §9 R9, PRD
      §45.1 item 6).
- [ ] `[fixture]` **DoD 12 — measured storage, parse time, index size and peak memory.** All four are
      recorded, non-zero and within the `conformance.yaml` ceilings (PRD §39.2).
- [ ] `[fixture]` `python -m <root>.conformance check pipelines/adapters/adj-act` exits **0** in
      strict mode with `summary.fail == 0` and `summary.not_available == 0`; a `--lenient` report is
      not acceptable evidence (PRD §45.4).
- [ ] `[machine]` **Source Coverage Registry row.** `INGF-07`'s composer includes `ADJ-ACT` with all
      nine PRD §6.1 attributes, the five PRD §12.1 dates as separate fields, and `mode="release"`
      composition passing for this group (`ADM-001`).
- [ ] `[machine]` **Privacy cross-reference, not duplication (sub-PRD D9).** The registry entry names
      `ADJ-CTH` as the covering group for employment-related privacy with `customer_visible: true`,
      **and** a test asserts this adapter emits no document identity that duplicates an `ADJ-CTH` OAIC
      key and fetches no OAIC URL (PRD §35.2 uniqueness, §40.9 duplicate-identity anomaly).
- [ ] `[machine]` **Explicit status, never a silent downgrade.** `adapter_status` is `ACTIVE` or one
      of the four PRD §7 limited states; a limited state carries a `known_gaps` entry with
      `customer_visible: true` naming the cause (PRD §7, §12.1, §44.4).
- [ ] `[machine]` **A limited status is only representable with its evidence.** When `adapter_status`
      is one of the four limited states, `registry.yaml` carries `INGF-07`'s `limitation` block:
      `state` equal to `adapter_status`, a closed-set `reason_code`, a non-empty `reason_detail`, at
      least one `evidence` entry, an `affected` scope naming dates or collections, and a
      `customer_visible_warning` that also appears as a `customer_visible: true` gap; a non-limited
      status carries `limitation: null`. Deleting any one of those from a scratch copy makes
      composition fail with the matching `REGISTRY_LIMITATION_*` code. The recorded evidence must
      describe a genuine official-source limitation — unfinished work is not one (plan §8 **Q10**,
      confirmed policy; sub-PRD **D11**; `INGF-07` deliverables 3 and 6).
- [ ] `[machine]` **PRD §6.3 topic coverage.** A test asserts Deliverable 12's map: every §6.3 topic
      resolves to a `collection_key`, to a `known_gaps` entry with `customer_visible: true`, to a
      cross-referenced group, or to a named other module — with **labour hire licensing** covered (not
      gapped) and **child employment** resolved one way or the other (sub-PRD D5, PRD §44.4).
- [ ] `[machine]` **Approved codes stay in `LEG-ACT`.** A test asserts no emitted `DocumentVersion`
      carries a `document_type` that would present an approved code of practice as this group's own
      instrument, and that guidance about a code links to the code's `LEG-ACT` identity by relation
      (sub-PRD D4, PRD §9.1).
- [ ] `[machine]` **Subordinate-authority typing.** Every emitted `DocumentVersion` carries a
      `document_type` from Deliverable 9's vocabulary plus jurisdiction and authority (PRD §9.1, §6.1;
      `SRCH-002`).
- [ ] `[machine]` **Relations, not duplicates.** Every `node_relation` targets a `LEG-ACT` identity
      with retained evidence offsets and `parser_version`, `confidence_state` is never
      `MODEL_SUGGESTED`, and no emitted `DocumentVersion` duplicates a `LEG-ACT` stable identity
      (PRD §9.3, §35.2, §40.9).
- [ ] `[machine]` **Boundary tests.** `INGF-01`'s architecture scan passes for
      `pipelines/adapters/adj-act/**`: no HTTP library, no `sqlite3`, no corpus-database module, no
      tenant/customer import (PRD §37.4, §39.1, §40.7; SEC-002).
- [ ] `[machine]` The adapter suite runs fully **offline** — a session fixture asserts no outbound
      network during `uv run pytest pipelines/adapters/adj-act`.
- [ ] `[machine]` `uv run pytest` green (PRD §45.3, §20.3).
- [ ] `[machine]` `pnpm test` green — standing item; no TypeScript here, so "unchanged and green".
- [ ] `[human]` **Founder/Architect review of the registry decomposition and the privacy
      cross-reference** — whether the seven named collections discharge PRD §40.5 for the ACT, and
      whether the `ADJ-CTH` cross-reference reads correctly as customer-facing coverage language, are
      irreducibly judgment calls; PRD §43.4 item 4 puts source-adapter anomalies in the founder review
      queue, and the composed row is what PRD §41.3 step 1 demonstrates.
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (**ADM-001**, **SRCH-002**); UAT
      IDs — **none** (no PRD §41.2 row exercises a source adapter directly; the nearest, `UAT-OPS-01`,
      belongs to `CRPS-06`/`RLSE-07`); schema/API/event compatibility (none); tenant/PII/security
      impact (none — public source material; register fixtures scanned for customer data);
      **source/licence/provenance impact** (seven authorities plus one cross-referenced Commonwealth
      collection); cost/memory/latency impact (DoD item 12 measurements against PRD §39.2's 2 GiB
      budget); rollback path (delete the group directory — `INGF-07` then fails loudly with
      `MANDATORY_GROUP_MISSING`); known gaps (privacy cross-reference; child employment if unresolved;
      sub-PRD M1, M2, M3, M6, M7, M8; plan §8 **Q9** is baseline-selected — the ±10% / >2% figures are
      initial defaults this group may tighten from its own baseline — and the plan §8 **Q10**
      limited-state policy is confirmed, so neither is an open gap: any limited status stated here is
      an evidenced official-source limitation carrying its `limitation` block).
- [ ] `[human]` Any triggered writeback below lands in the same PR (or a preceding docs PR).
- **Absent classes declared:** no `[human]` UAT-script criteria (see above), and no accessibility,
  tenancy or PII-admission criteria — this ticket produces no UI, no API surface and touches no
  customer data (PRD §39.1). All replayed evidence is `[fixture]`; schema, boundary and suite checks
  are `[machine]`.

## Test plan

Harness: `uv run pytest pipelines/adapters/adj-act -q` plus the conformance CLI. Every step is
reproducible **offline with no network**: HTTP is served by `INGF-09`'s `ReplayFetcher` from committed
fixtures, time by `ReplayClock`, records by the in-memory `RecordSink`. Copy the construction pattern
from `INGF-09`'s reference adapter
(`pipelines/ingestion/src/<root>/conformance/reference/demo-registry/`) and its authoring guide
(`pipelines/ingestion/src/<root>/conformance/README.md`) — not from another `SADJ` ticket's code.

1. `uv sync --frozen` then `uv run pytest pipelines/adapters/adj-act -q` — all green.
2. `python -m <root>.registry validate pipelines/adapters/adj-act` — exit 0; then delete one required
   attribute from a scratch copy and confirm a non-zero exit.
3. `python -m <root>.conformance check pipelines/adapters/adj-act --report /tmp/adj-act.json` —
   exit 0, `"strict": true`, `summary.fail == 0`, `summary.not_available == 0`, and every item's
   `evidence` naming each of the seven `collection_key`s. Item 11 is `PASS` or `DEFERRED` with a
   reason.
4. **Per-collection matrix** (`tests/test_collections.py`): parametrised over the seven
   `collection_key`s, asserting discovery/document/timepoint/quarantine fixtures exist and
   `baseline.json` has the row.
5. **Cross-reference integrity** (`tests/test_cross_reference.py`): the load-bearing test for this
   ticket — assert the privacy entry names `ADJ-CTH`, that `allowlist.yaml` contains no OAIC host,
   that a full replayed run fetches no OAIC URL, and that no emitted `stable_source_key` matches the
   `ADJ-CTH` OAIC key scheme (sub-PRD D9; PRD §35.2, §40.9).
6. **Identity** (`tests/test_identity.py`): determinism, cross-version stability, no cross-collection
   collision, `REMOVED` with prior versions retained including a de-listed licence.
7. **Round-trip** (`tests/test_parse.py`): `assert_roundtrip()` for every document fixture; one root,
   no cycles, contiguous ordinals; a deliberately corrupted offset fixture must fail.
8. **Temporal** (`tests/test_events.py`): three time points per collection; a superseded Head of
   Service direction keeps its history; `event_date` vs `effective_date`; `STATUS_UNCONFIRMED` where
   no status is published; an overlapping-interval fixture must fail.
9. **Relations, codes and gaps** (`tests/test_relations.py`, `tests/test_coverage.py`): guidance about
   an approved code links to the code's `LEG-ACT` identity and does not restate it; an ambiguous
   citation emits nothing; Deliverable 12's map holds; `capability: NONE` forces `FRESHNESS_LIMITED`;
   `UNCLEAR_RESTRICTED` forces the metadata/link-only permission set.
10. `uv run pytest` (whole repo) and `pnpm test` — green.

**Reviewer focus.** (a) The privacy cross-reference is the point of this ticket — confirm `ADJ-ACT`
neither fetches nor duplicates OAIC material and that the registry says so in customer-visible terms.
(b) Approved WHS codes must remain `LEG-ACT` register instruments; this adapter may only publish
guidance about them. (c) Each of the seven collections must have a real, specific official endpoint;
collections 1 and 2 sharing a host must still be two rows. (d) Labour hire licensing must be covered,
not gapped — the ACT has a scheme even though §40.5's row omits it. (e) The conformance report must
name every collection under every item. (f) Re-run step 3 after deleting one licence snapshot file —
DoD item 1 must fail.

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

1. **The `ADJ-CTH` cross-reference cannot be expressed in `registry.yaml`** — there is no field for
   "covered by another group" (sub-PRD **M8**, **D9**). → Interim is a `known_gaps` entry naming
   `ADJ-CTH` with `customer_visible: true`. If `INTL-02` or `GOLD-16` cannot distinguish "covered
   elsewhere" from "not covered", raise a `covered_by` field against `INGF-07` (its ticket plus
   `docs/prd/05-ingestion-framework/README.md`) and record the outcome in
   `docs/prd/09-sources-adjacent/README.md` **M8**. Duplicating the OAIC collection into `adj-act/` is
   **not** an option: PRD §40.9 flags duplicate stable identities and PRD §35.2 makes them invalid.
2. **The ACT privacy arrangement changes** — for example a territory information commissioner is
   established. → Add the collection here, update Deliverable 1 and 12 in this ticket and
   `docs/prd/09-sources-adjacent/README.md` **D9**/**M8** in the same PR, and coordinate the boundary
   with `SADJ-01`. Do not silently start fetching OAIC content from this group.
3. **Approved WHS codes appear only on the regulator's site and not in the register.** → That is a
   `LEG-ACT` gap, not a licence to ingest the instrument text here: raise it against `SLEG-09`, record
   the dependency in `docs/prd/09-sources-adjacent/README.md`, and keep this adapter to guidance plus
   relations (sub-PRD **D4**, PRD §9.1).
4. **An expected official entry has moved or the responsible authority has changed** — ACT public-sector
   employment material moves between `act.gov.au` and directorate sites. → Record the new entry in
   `registry.yaml`/`allowlist.yaml` **and** update Deliverable 1's table in this ticket in the same PR.
5. **A regulator lacks the assumed change-detection capability, or its terms are unclear/restrictive.**
   → Record it as a **status** using PRD §7's and §12.1's explicit vocabulary (`FRESHNESS_LIMITED`,
   `LICENSING_RESTRICTED`, `METADATA_AND_LINK_ACTIVE`, `SOURCE_UNAVAILABLE`) plus a `known_gaps` entry
   with `customer_visible: true`, **and** add a writeback line to
   `docs/prd/09-sources-adjacent/README.md`. Never a silent downgrade — PRD §44.4.
6. **A shared helper looks necessary across two or more `SADJ` tickets.** → Forbidden here: module 09
   owns no `_shared` path (sub-PRD **D2**). Writeback is plan §9 **R2**: add a sibling ticket to
   `06-sources-legislation` (owner of `pipelines/adapters/_shared/legislation/**` via `SLEG-01`), add
   the `blocked_by` edge in `docs/prd/breakdown-plan.md` §5.10 and §6.2, then implement.
7. **A conformance item cannot pass for a legitimate reason.** → `NOT_APPLICABLE` **with a recorded
   reason**, never a silent skip and never `--lenient`. If an item is impossible for a whole class of
   regulator sources, that is a change to PRD §40.8's list — a product/spec change under PRD §45.5.
8. **A hard-to-reverse choice arises that this ticket does not settle** — in particular a general
   convention for one wave-4 group covering another jurisdiction's topic. → ADR candidate under plan
   §2.1 **A9**: write `docs/adr/NNNN-<slug>.md`, record the consequence in
   `docs/prd/09-sources-adjacent/README.md` (**D9**), add the row to `docs/prd/breakdown-plan.md` §2.1,
   then implement.

**Escalation rule.** If PRD §40.5's requirement — exact official pages/collections with a material
classification per named authority — cannot be met for the ACT, or if the cross-reference model
produces a coverage claim that is not true, that is not a local implementation detail: it decides
whether `E15` can exit and whether PRD §26's "All five source waves have active or explicitly limited
registry status" is true. Stop, record the limitation with PRD §7's explicit status vocabulary,
escalate for re-review, and never present an unimplemented collection — or another group's coverage —
as this group's own.
