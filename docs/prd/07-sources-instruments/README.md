# 07-sources-instruments — sub-PRD

> Module sub-PRD authored from `docs/prd/breakdown-plan.md` §5.8. The **ticket files** under
> `tickets/` are the executable source of truth; this README is the module-level context they share.
> Master spec: [PRD](../../PRD.md). Decomposition plan: [breakdown-plan](../breakdown-plan.md).

| Field | Value |
|---|---|
| Module | `07-sources-instruments` |
| Lane | `07-sources-instruments` |
| Ticket prefix | `SINS` |
| Tickets | 14 (`SINS-01` … `SINS-14`) |
| Agent | `builder` (all 14, plan §1.1) |
| Epics | `E11-FWC`, `E12-FWO-ATO`, `E13-PAYROLL-TAX` (PRD §44.2) |
| Requirement families | `COV-003`, `SRCH-004` (plan §3); supports `COV-001`, `SRCH-002/003/005`, `ADM-001` |
| Write-owns | `pipelines/adapters/_shared/rates/**` · `pipelines/adapters/{fwc-docs,fwc-awards,fwc-agreements,fwo-guidance,ato-employment}/**` · `pipelines/adapters/pt-{nsw,vic,qld,wa,sa,tas,act,nt}/**` (plan §4) |
| Depends on modules | `05-ingestion-framework`, `06-sources-legislation` |
| Language/toolchain | Python (`uv`, `pytest`) — PRD §18.2 "Ingestion/build/evaluation \| Local Python pipeline", §20.1, §45.3 |
| Version | v0.2 |

## Problem

PRD §7 wave 2 is *"Industrial instruments and payroll rules: awards, agreements, FWC/FWO, ATO,
superannuation and all payroll-tax authorities."* PRD §40.3 turns that into **thirteen mandatory
source groups** — `FWC-DOCS`, `FWC-AWARDS`, `FWC-AGREEMENTS`, `FWO-GUIDANCE`, `ATO-EMPLOYMENT` and
the eight revenue authorities `PT-NSW` … `PT-NT`. PRD §44.4 is blunt about what happens if one of
them is skipped:

> "It is not permitted to silently call an unimplemented source category covered."

Wave 2 is also where the corpus first carries **numbers that change on a date**. PRD §40.3 closes
its table with the rule the whole module is built around:

> "Rates are date-versioned legal facts, not mutable fields. A displayed rate must cite its official
> date-specific source and applicable legislation/guidance role."

A payroll-tax rate, an award pay point, a super-guarantee percentage and an FBT gross-up are not
configuration. They are legal facts with an effective interval, an authority, an exact source
passage and a place in the PRD §9.1 hierarchy. Get that wrong once and the product produces a
confidently wrong number with a citation attached — the single most damaging failure mode PRD §43.3
gates against ("Date/jurisdiction critical error … must be 0").

The module therefore has three jobs:

1. **Fix the dated-fact model once** (`SINS-01`) so the nine rate-bearing adapters express rates
   identically inside the existing `CRPS-01` intermediate-record contract, with evidence offsets that
   make a fabricated number impossible.
2. **Deliver the five national instrument/guidance groups** (`SINS-02`…`SINS-06`) — FWC document
   search, awards, agreements, FWO guidance, ATO employment/payroll material — each with exact
   identifiers (`SRCH-004`), lifecycle evidence (`COV-003`) and licence control (PRD §11.1).
3. **Deliver eight genuinely parallel payroll-tax adapters** (`SINS-07`…`SINS-14`) whose combined
   output is the PRD §44.2 `E13` exit evidence: *"Eight-jurisdiction historical fixture matrix"*
   across the three financial years PRD §6.6 requires (2026–27, 2025–26, 2024–25).

## Scope

| In scope | Ticket |
|---|---|
| Date-versioned rate/threshold fact model, evidence-bound values, FY periodisation, series invariants, the emission mapping into `CRPS-01` records, the `E13` matrix harness | `SINS-01` |
| `FWC-DOCS` — Document Search discovery, exact FWC identifiers and neutral citations, stable identity for decisions/orders/awards/agreements | `SINS-02` |
| `FWC-AWARDS` — modern-award identity, variation history version chains, classification structures, pay data as dated facts, annual wage review material | `SINS-03` |
| `FWC-AGREEMENTS` — agreement identity, employer/ABN linkage, approval → variation → replacement → termination evidence chains, nominal-expiry rule | `SINS-04` |
| `FWO-GUIDANCE` — official guidance captured as subordinate authority (PRD §9.1 level 6), change notices | `SINS-05` |
| `ATO-EMPLOYMENT` — PAYG/STP/super/FBT employer material, ruling vs guidance separation, subject-scope allowlist, licence control | `SINS-06` |
| Eight payroll-tax adapters: dated rates/thresholds/levies, rulings/circulars/guides, link to each jurisdiction's payroll-tax legislation, the group's `E13` matrix row | `SINS-07`…`SINS-14` |

## Non-goals

| Not in this module | Owner |
|---|---|
| The adapter framework, safe fetcher, artifact store, licence gate, quarantine, registry composer, discovery scheduler and conformance kit | `05-ingestion-framework` / `INGF-01`…`INGF-09` |
| The `corpus.sqlite` schema and the intermediate normalised-record (INR) contract | `04-corpus-contract` / `CRPS-01` (plan §2.1 **A4**) |
| Chunking, index-tier assignment, embeddings, release build/sign/publish | `04-corpus-contract` / `CRPS-03`…`CRPS-07` |
| Wave 1 legislation registers and the shared point-in-time/commencement primitives | `06-sources-legislation` / `SLEG-01`…`SLEG-10` |
| FWC decisions **as case law** — bench, matter, Full Bench metadata, treatment relationships | `08-sources-cases` / `SCAS-05` (`blocked_by SINS-02`) |
| Wave 4 employment-adjacent regulators and wave 5 future/proposed law | `09-sources-adjacent`, `10-sources-future` |
| Canonical enum values (`document_type`, `node_kind`, `event_type`, `relation_type`, `legal_status`) | `00-foundation` / `FND-03` |
| The PRD §9.1 authority-hierarchy computation and the §36.2 eligibility predicate | `00-foundation` / `FND-10` (`packages/domain/src/legal/**`) |
| Coverage Navigator ordering, award/classification decisions and agreement candidate selection | `15-answer-product` / `ASK-08` (`blocked_by SINS-03`, `SINS-04`) |
| Exact-identifier ranking, hard filters and fusion | `11-retrieval-engine` / `RETR-03`, `RETR-04`, `RETR-06` |
| Licence-limited quotation/display/export at render time | `12-evidence-safety` / `EVID-06`; `19-exports` / `XPRT-02`–`XPRT-04` |
| Evaluation cases, gold authorities, metrics and full-roster reconciliation | `21-evaluation-600` / `GOLD-06`, `GOLD-07`, `GOLD-08`, `GOLD-16` |
| Source health / quarantine / licensing consoles | `22-internal-admin` / `INTL-02`, `INTL-03`, `INTL-05` |
| Any app-database, tenant or customer-data access | PRD §39.1: "Python pipeline code never imports tenant/customer packages" |

## Decisions

| # | Decision | Basis | Recorded by |
|---|---|---|---|
| D1 | **`_shared/rates` is the single owner of the dated-fact model.** The nine rate-bearing adapters (`SINS-03`, `SINS-06`, `SINS-07`…`SINS-14`) are `blocked_by SINS-01` and never re-implement, fork or widen it. | plan §9 **R2**: "The shared primitive stays owned by `SLEG-01`/`SINS-01`/`SCAS-01`/`SFUT-01` … Never copy the helper into two adapter directories." plan §5.8 edges. | `SINS-01` |
| D2 | **A rate is emitted through the existing `CRPS-01` INR contract** — `document_node` + `node_version` (exact official text, dated interval, character offsets) + `legal_event` (structured value in `metadata_json`, `evidence_ref` to that node) + an optional `node_relation` to the applicable legislation node. **No new record type is invented.** **ADR candidate.** | plan §2.1 **A4**; PRD §40.7 ("The adapter never writes active corpus tables directly"); PRD §9.3 (deterministic extraction may support conclusions when exact source evidence and parser version are retained); `CRPS-01` deliverables 10–13, 16. | `SINS-01` |
| D3 | **No numeric rate or threshold may be hardcoded.** `RateFact` construction fails unless the declared value re-parses from the exact quoted source span (`evidence.quoted_text == parsed_text[start:end]`). A value the model "knows" but the fixture does not contain cannot be emitted. | PRD §40.3 ("A displayed rate must cite its official date-specific source"); PRD §9.4 evidence-first; PRD §15.3 exact offsets; PRD §40.7 provenance. | `SINS-01` |
| D4 | **`pipelines/adapters/_shared/` carries no `__init__.py`** (PEP 420 namespace directory), so `_shared/{legislation,rates,caselaw,future}` are four independently-owned regular packages with **zero shared files** between modules `06`–`10`. `SINS-01` follows the packaging convention `SLEG-01` established (it is `blocked_by` it) and records what it found here. | plan §2 (the cut is file ownership; two concurrent tickets never write the same path); plan §4; plan §9 **R2**. | `SINS-01` |
| D5 | **Adapters emit `document_type` + `authority_key`, never a PRD §9.1 authority level.** The hierarchy is computed at answer time from those facts. | PRD §9.1; PRD §45.2 (`packages/domain` owns "Pure permissions, state transitions, evidence/budget rules", `pipelines` owns "Official-source acquisition/build/evaluation"); plan §5.1 `FND-10`. | `SINS-05`, `SINS-06` |
| D6 | **`FWC-DOCS` owns the FWC Document Search discovery/identity client; `SINS-04` and `SCAS-05` read it.** Neither re-implements Document Search paging, filters or identifier parsing. | plan §4: "Read access is unrestricted; only writes are allocated"; plan §6.2 edges `SINS-02 → SINS-04 & SCAS-05`; plan §9 **R2**. | `SINS-02` |
| D7 | **Change-detection capability and licensing are determined by the adapter, not given by the PRD.** PRD §40.3's table has exactly four columns (Group ID · Official entry · Required artifacts · Initial tier) — unlike §40.2, it states **no** minimum adapter capability. Each ticket determines capability and rights during its own dry-run and records them in `registry.yaml` / `licence.yaml`; no delta mechanism ⇒ `FRESHNESS_LIMITED`, unclear rights ⇒ `UNCLEAR_RESTRICTED`/`REVIEW_REQUIRED` collapsing to metadata/link-only and `LICENSING_RESTRICTED` in the registry. That framing is now backed by settled policy rather than an open launch question: whatever the adapter measures, a limited status is expressible **only** together with **D11**'s `limitation` block. | PRD §6.1, §7, §11.1, §12.1, §40.1, §44.4; plan §8 **Q10** (confirmed policy); `INGF-04` gate table; `INGF-07` status vocabulary and `limitation` schema. | every adapter ticket |
| D8 | **The three PRD §6.6 financial years are the three PRD §40.8 item-6 time points** for every rate-bearing group, and the eight `PT-*` rows compose the PRD §44.2 `E13` matrix. | PRD §6.6 ("point-in-time retrieval MUST support 2026–27; 2025–26; 2024–25"); PRD §40.8 item 6; PRD §44.2 `E13` exit evidence. | `SINS-01`, `SINS-07`…`SINS-14` |
| D9 | **Adapters import no HTTP and no document-parsing library.** Rate and structure extraction runs over `ParsedDocument.text` / `.blocks` returned by `INGF-06`'s `ParserHost`, using the standard library only. | PRD §37.4 ("Adapters use a shared fetcher, not arbitrary HTTP libraries"); `05` sub-PRD **D10**; `INGF-01` deliverable 11 architecture tests. | every ticket |
| D10 | **One directory per PRD §40.3 group, named `group_id.lower()`.** No group is merged with another, and no group directory contains a second group's material. | plan §2 principle 3; plan §4 write-owns row; `INGF-07` deliverable 1 layout; PRD §44.4. | every ticket |
| D11 | **The limited-state launch policy is settled: a limited state is an evidenced measurement, never a scope choice.** No mandatory group in this module is pre-selected for omission or reduced implementation; all thirteen PRD §40.3 groups are attempted in full, and scope is never reduced to make a release date easier. A group may launch in one of the four PRD §7 limited states (`METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`) **only** where measured evidence shows a genuine limitation prevents `ACTIVE` — an official capability limit, the official body not publishing the material, a licensing restriction, historical material unavailable, a freshness limitation, or another real official-source constraint. That state is recorded through `INGF-07`'s `registry.yaml` **`limitation` block**, which this module **consumes and never redefines**: `state` equal to `adapter_status`, a `reason_code` from `INGF-07`'s closed set, a mandatory `reason_detail` saying why full coverage is unavailable, a non-empty `evidence[]`, an `affected` scope naming the affected dates or collections, and a `customer_visible_warning` that also appears as a `customer_visible: true` `known_gaps` entry. Silent omission is prohibited, and no unofficial source or commercial headnote may substitute for unavailable official material. `GOLD-16` produces the measured evidence and the proposed registry state; `LNCH-05` verifies that the launch statement discloses it accurately; Gate 2 is verification and sign-off under this policy, not an opportunity to cut mandatory scope. | plan §8 **Q10** (confirmed policy); PRD §7, §12.1, §26, §44.4; `INGF-07` deliverables 3, 6, 7 and its `REGISTRY_LIMITATION_*` failure codes. | every adapter ticket (`SINS-02`…`SINS-14`) |

## Rejected alternatives

| Rejected | Why |
|---|---|
| A `rates` table, a `current_rate` column, or a rates YAML the adapters update in place | PRD §40.3: "Rates are date-versioned legal facts, **not mutable fields**". A mutable field cannot answer `legal_as_at` (PRD §15.2) and would break `UAT-SRCH-03`. |
| A new `rate_fact` record type added to the `CRPS-01` INR contract | Makes `04-corpus-contract` depend on a wave-2 module, falsifying plan §2.1 **A4**; a contract change binds five source modules and is a major-version writeback (`CRPS-01` deliverable 16). D2 shows the existing types are sufficient. |
| Copying the rate model into each `pt-*` directory | plan §9 **R2** names this exact failure: "Never copy the helper into two adapter directories." |
| One `payroll-tax` adapter covering all eight jurisdictions | PRD §44.4 forbids dropping a group; plan §2 principle 3 gives each §40.3 group its own ticket and directory; merging siblings is a **plan** change under plan §9 **R3**, never a local choice. |
| Re-implementing FWC Document Search inside `fwc-agreements` and `case-fwc` | Three copies of one paging/identifier parser across two modules — plan §9 **R2**. D6 makes `SINS-02` the single owner and the `blocks` edges enforce the order. |
| Hardcoding rate values "known" from model training data to avoid recording a fixture | Produces an uncitable number; PRD §9.4 requires evidence-first synthesis and PRD §40.7 requires source URL + artifact hash on every emitted record. D3 makes it mechanically impossible. |
| Emitting a PRD §9.1 authority level integer per document | Duplicates a pure domain rule inside the pipeline — PRD §45.2 gives `packages/domain` the legal rules and forbids `apps`/`pipelines` "Duplicated business rules". |
| Declaring `ACTIVE` for a group whose delta mechanism was never proven | PRD §12.1: sources without reliable delta mechanisms "MUST show `FRESHNESS_LIMITED` rather than a false guarantee"; PRD §44.4. |
| Treating an enterprise agreement as ceased once its nominal expiry date passed | PRD §6.6 forbids it verbatim: "An enterprise agreement MUST NOT be treated as ceased merely because its nominal expiry date has passed." |
| Choosing in advance which wave-2 groups will "only" be metadata-and-link, to reduce the amount of work | **D11** / plan §8 **Q10**: no mandatory group is pre-selected for omission or reduced implementation, and arbitrary scope reduction to make a release date easier is not permitted. A limited state is an output of measurement, recorded with evidence — never an input to planning. |
| Declaring a limited status with a bare `known_gaps` line and no `limitation` block | `INGF-07`'s composer fails in every mode with `REGISTRY_LIMITATION_MISSING` / `_UNEVIDENCED` / `_SCOPE_MISSING` / `_WARNING_MISSING`. A limitation that cannot present its evidence, affected scope and customer-visible warning is indistinguishable from a silent omission (PRD §44.4). |

## Decision-register entries carried here (plan §8)

`docs/prd/breakdown-plan.md` §8 is the decision register the tickets cite. Four of its entries reach
this module. **None of them is an open module question**, and no ticket may reopen one locally — a
Builder that believes a confirmed entry is falsified by what it finds uses the ticket's feedback
obligation (writeback to the plan and this sub-PRD first, then code).

| Entry | Register status | What it means for `SINS-01`…`SINS-14` |
|---|---|---|
| **Q10** — which source groups may launch in a limited state | **Confirmed policy** | Settled; recorded here as **D11**. Every mandatory PRD §40.3 group is attempted in full; a limited state is permitted only on measured evidence of a genuine official-source limitation and is recorded through `INGF-07`'s `limitation` block. `GOLD-16` produces the measured evidence and the proposed registry state, `LNCH-05` verifies the launch statement discloses it accurately, and Gate 2 is verification and sign-off — not an opportunity to cut mandatory scope. Each ticket supplies its own measured status, evidence and customer-visible warning; none decides the launch call, and none may reduce its own scope to avoid one. |
| **Q9** — per-source anomaly thresholds | **Baseline-selected** | PRD §40.9's ±10% count change and >2% parse failure are the framework's **initial defaults**, not a number anyone is waiting to be told: each adapter measures a representative baseline and may **tighten** them in its own `conformance.yaml`. `INGF-05`/`INGF-09` encode tighten-only — an adapter that believes it needs a *looser* percentage escalates by writeback (this README plus the owning `INGF-05` ticket), never by local override. Critical identity, time, mandatory-source and citation failures are unconditional blockers that no percentage threshold affects. `GOLD-16` consolidates and verifies the final per-source thresholds. |
| **Q3** — always-hot vectors and semantic-cache size | **Deferred until real-scale measurement** (`RLSE-11`) | Not a decision this module makes or waits on. Where a wave-2 collection's measured parse cost or index footprint threatens the PRD §39.2 host budget (`SINS-10`'s employer guide is the named case), the ticket records its PRD §40.8 item-12 measurements and escalates them to `RLSE-11` rather than truncating official material. |
| **Q5** — measured corpus statistics | **Deferred until corpus measurement** (`GOLD-16`) | Every document count, byte figure and collection size in this module is a **measurement produced by these tickets**, never a planning number to be reproduced. Where a collection proves too large for the budget (`SINS-04`'s agreement long tail is the named case), the ticket records the measured DoD item-12 numbers, date-bounds `document_coverage` with a `customer_visible: true` gap, and escalates to `GOLD-16`. No adapter silently truncates a collection to fit a capacity hypothesis. |

## Open questions

The six entries below are the genuinely open **module** questions. Each is resolved inside this
module or by a named owner elsewhere; none of them is a plan §8 register entry.

| # | Question | Owner | Resolved by | Blocks |
|---|---|---|---|---|
| N1 | The canonical `node_kind`, `event_type` and `relation_type` values needed to express a dated rate fact (D2) may not exist in `FND-03`'s enums, and `CRPS-01` generates SQLite `CHECK` constraints from them — an invented literal is rejected by the database. | `00-foundation` (**`FND-03`**) | `SINS-01` resolves against the committed `packages/contracts` enums; a genuinely missing value is a writeback to `docs/prd/breakdown-plan.md` §5.1 plus an ADR, never a local literal | The exact enum values in `SINS-01`'s emission mapping. Nine adapters follow whatever `SINS-01` records. |
| N2 | Packaging and import path of `pipelines/adapters/_shared/**` — whether `pipelines/adapters` is a declared workspace member with its own `pyproject.toml`, and how a hyphenated group directory imports `_shared`. | `00-foundation` (**`FND-01`** creates every PRD §20.1 member manifest, plan §1.1); precedent set by **`SLEG-01`** | `SINS-01` reads the tree `SLEG-01` left (it is `blocked_by` it) and follows it; records the result in this README (D4) | Every `import` line in this module. Resolved before `SINS-01` starts. |
| N3 | `registry.yaml.initial_index_tier` is a single value, but PRD §40.3 gives `FWC-DOCS` a split tier ("T1 awards/key decisions; T2 agreements/long tail") and `FWC-AGREEMENTS` "T2; candidates on demand". | `05-ingestion-framework` (**`INGF-07`** owns the schema); `04-corpus-contract` (`CRPS-04`) owns the real per-chunk tier | `SINS-02`/`SINS-04` declare the group's primary tier and record the split as a `known_gaps` note; if per-endpoint tiers are genuinely needed, the schema change is `INGF-07`'s | Nothing — `CRPS-04` assigns the operative tier "from evidence, not guesswork". |
| N4 | FWO pay guides carry rate-shaped material, but plan §5.8/§6.2 give `SINS-05` **no** `SINS-01` edge. | this sub-PRD (Architect) → `docs/prd/breakdown-plan.md` §5.8/§6.2 | `SINS-05` emits **no** rate facts and captures pay-guide material as dated guidance documents; if rate facts prove necessary, the writeback adds the edge in the plan | Nothing today. Copying the rate model into `fwo-guidance` is forbidden (plan §9 R2). |
| N5 | Three groups in this module (`FWC-DOCS`, `FWC-AWARDS`, `FWC-AGREEMENTS`) plus `CASE-FWC` in module `08` share the host `www.fwc.gov.au`; politeness limits are per host, so concurrent lanes contend for one budget. | `05-ingestion-framework` (**`INGF-08`** owns the per-host token bucket) | Each group declares conservative `min_request_interval_ms` / `max_concurrent_requests` in its own `allowlist.yaml`; `INGF-08` enforces the shared bucket across groups | Nothing — replayed conformance runs are offline; only live dry-runs contend. |
| N6 | `SINS-06` (`ATO-EMPLOYMENT`) has no `SLEG-02` edge, so the Commonwealth legislation nodes its facts should cite may not exist when it runs. | this sub-PRD (Architect) → plan §5.8/§6.2 | `legislation_ref` is optional; an unresolved link records a `validation_finding` of severity `ANOMALY` plus a `known_gaps` entry — never a fabricated link | Nothing. The same graceful rule applies to `SINS-03`, which also has no `SLEG-02` edge. |

## Work breakdown

`lane` = `07-sources-instruments` and `agent` = `builder` for all fourteen tickets (plan §1.1).
Paths are repository-relative. `<aroot>` is the adapters import root of **N2**; `<iroot>` is the
ingestion-framework import root (`05` sub-PRD D11, default `aer_ingestion`).

| Ticket | Size | Lane | File-scope (write-owns) | Depends on |
|---|---|---|---|---|
| [`SINS-01`](tickets/SINS-01-date-versioned-rate-threshold-fact-model.md) — Date-versioned rate/threshold fact model | M | `07-sources-instruments` | `pipelines/adapters/_shared/rates/**` | `SLEG-01` |
| [`SINS-02`](tickets/SINS-02-fwc-docs-fwc-document-search.md) — `FWC-DOCS` — FWC Document Search | L | `07-sources-instruments` | `pipelines/adapters/fwc-docs/**` | `INGF-09` |
| [`SINS-03`](tickets/SINS-03-fwc-awards-awards-variation-history-pay-data.md) — `FWC-AWARDS` — awards, variation history, pay data | L | `07-sources-instruments` | `pipelines/adapters/fwc-awards/**` | `SINS-01` |
| [`SINS-04`](tickets/SINS-04-fwc-agreements-agreement-lifecycle.md) — `FWC-AGREEMENTS` — agreement lifecycle | L | `07-sources-instruments` | `pipelines/adapters/fwc-agreements/**` | `SINS-02` |
| [`SINS-05`](tickets/SINS-05-fwo-guidance.md) — `FWO-GUIDANCE` | M | `07-sources-instruments` | `pipelines/adapters/fwo-guidance/**` | `INGF-09` |
| [`SINS-06`](tickets/SINS-06-ato-employment.md) — `ATO-EMPLOYMENT` | L | `07-sources-instruments` | `pipelines/adapters/ato-employment/**` | `SINS-01` |
| [`SINS-07`](tickets/SINS-07-pt-nsw-payroll-tax.md) — `PT-NSW` payroll tax | M | `07-sources-instruments` | `pipelines/adapters/pt-nsw/**` | `SINS-01`, `SLEG-03` |
| [`SINS-08`](tickets/SINS-08-pt-vic-payroll-tax.md) — `PT-VIC` payroll tax | M | `07-sources-instruments` | `pipelines/adapters/pt-vic/**` | `SINS-01`, `SLEG-04` |
| [`SINS-09`](tickets/SINS-09-pt-qld-payroll-tax.md) — `PT-QLD` payroll tax | M | `07-sources-instruments` | `pipelines/adapters/pt-qld/**` | `SINS-01`, `SLEG-05` |
| [`SINS-10`](tickets/SINS-10-pt-wa-payroll-tax.md) — `PT-WA` payroll tax | M | `07-sources-instruments` | `pipelines/adapters/pt-wa/**` | `SINS-01`, `SLEG-06` |
| [`SINS-11`](tickets/SINS-11-pt-sa-payroll-tax.md) — `PT-SA` payroll tax | M | `07-sources-instruments` | `pipelines/adapters/pt-sa/**` | `SINS-01`, `SLEG-07` |
| [`SINS-12`](tickets/SINS-12-pt-tas-payroll-tax.md) — `PT-TAS` payroll tax | M | `07-sources-instruments` | `pipelines/adapters/pt-tas/**` | `SINS-01`, `SLEG-08` |
| [`SINS-13`](tickets/SINS-13-pt-act-payroll-tax.md) — `PT-ACT` payroll tax | M | `07-sources-instruments` | `pipelines/adapters/pt-act/**` | `SINS-01`, `SLEG-09` |
| [`SINS-14`](tickets/SINS-14-pt-nt-payroll-tax.md) — `PT-NT` payroll tax | M | `07-sources-instruments` | `pipelines/adapters/pt-nt/**` | `SINS-01`, `SLEG-10` |

Every ticket's file-scope is its **whole group directory**, including that group's `fixtures/` and
`tests/` (plan §1.1: "Unit/integration tests live inside the owning package or app and belong to that
module's tickets"; `INGF-07` deliverable 1 layout). The fourteen scopes are pairwise disjoint: no two
tickets can write the same path. If `pipelines/adapters/pyproject.toml` exists it is
**shared-additive** and append-only, resolved by re-running `uv lock`, never hand-merged (plan §1.1,
PRD §44.3) — and in practice untouched, because D9 forbids adapters from adding HTTP or parser
dependencies at all.

### Lane profile (plan §7)

14 tickets, **2 waves**, peak **11** concurrent lanes, **not fully serial** — the widest module in
the plan after `08-sources-cases`:

```text
wave 1  SINS-01 | SINS-02 | SINS-05
wave 2  SINS-03 | SINS-04 | SINS-06 | SINS-07 | SINS-08 | SINS-09 | SINS-10 |
        SINS-11 | SINS-12 | SINS-13 | SINS-14
```

The only intra-module edges are `SINS-01 → {03, 06, 07…14}` (the rate model) and `SINS-02 → 04` (the
Document Search client). PRD §44.3 calls individual source adapters "safe parallel work units"; the
eight payroll-tax tickets are the clearest instance in the whole plan — they share exactly one thing,
`_shared/rates/**`, which they are `blocked_by`, and touch no other common path.

### Downstream

`SINS-02` gates `SINS-04`, `SCAS-05` (module `08`) and `GOLD-16`. `SINS-01` gates the nine
rate-bearing adapters. `SINS-03` and `SINS-04` gate `ASK-08` (Coverage Navigator, module `15`) plus
`GOLD-06`/`GOLD-07`. `SINS-06`…`SINS-14` gate `GOLD-08` (the PAYG/STP/super/FBT + payroll-tax
evaluation category, PRD §43.1 row 4). All fourteen gate `GOLD-16` (full-roster coverage, licence and
freshness reconciliation). Source: plan §6.2.

## Acceptance — what makes the module done

The module is done when all fourteen tickets are delivered and:

1. **PRD §40.8 — the twelve-item Definition of Done, for all thirteen groups.**
   `python -m <iroot>.conformance check pipelines/adapters/<group>` exits 0 in **strict** mode for
   `fwc-docs`, `fwc-awards`, `fwc-agreements`, `fwo-guidance`, `ato-employment` and all eight `pt-*`
   groups, each with a committed `conformance-report.json` (`INGF-09` deliverable 5). Item 11 may be
   `DEFERRED(GOLD-16)` only with a recorded reason; no other item may be deferred.
2. **PRD §6.1 / §7 / §44.4 — registry.** `python -m <iroot>.registry compose --mode release` passes
   for all thirteen wave-2 groups: each is `ACTIVE` or one of the four PRD §7 explicit limited states
   (`METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`)
   with at least one `known_gaps` entry marked `customer_visible: true` **and a complete `INGF-07`
   `limitation` block** — `state` equal to `adapter_status`, a closed-set `reason_code`, a
   `reason_detail`, a non-empty `evidence[]`, an `affected` scope and a `customer_visible_warning`
   (**D11**). None remains `PLANNED_NOT_ACTIVE`, `NOT_STARTED` or `IN_DEVELOPMENT`, and no group is
   absent.
3. **PRD §11.1 — licensing.** Every group has an immutable licence snapshot whose SHA-256 matches
   `terms_sha256`, and a `LicenceAssessment` independently stating all nine decision axes. Unclear
   rights collapse to metadata/link-only before storage, indexing, embedding, display or export.
4. **PRD §40.3 — the rate rule.** Every emitted rate/threshold fact carries an effective interval, an
   exact source pinpoint (`NodeRef` + character offsets) whose quoted span re-parses to the declared
   value, and its source role; no adapter holds a mutable "current rate" anywhere (`SINS-01` plus the
   nine rate-bearing groups).
5. **PRD §6.6 / §44.2 `E13` — the eight-jurisdiction historical fixture matrix.**
   `python -m <aroot>._shared.rates matrix --adapters-root pipelines/adapters` prints a complete
   8 × 3 table (NSW, VIC, QLD, WA, SA, TAS, ACT, NT × 2024-25, 2025-26, 2026-27) and exits 0; a
   missing jurisdiction or financial year is a failure, never a blank cell.
6. **`SRCH-004`** — "Exact provision/case/agreement/ABN matches outrank semantic similarity". Corpus
   precondition met: award codes and agreement codes land in `legal_document.official_identifier`,
   FWC neutral citations in `neutral_citation`, employer ABNs in `employer_abn` (`SINS-02`,
   `SINS-03`, `SINS-04`; PRD §35.2 "exact indexes on identifiers/ABN"). Ranking itself is `RETR-03`.
7. **`COV-003`** — "Agreement search supports employer name and validated ABN … Known synthetic ABN
   fixture returns linked candidates". Corpus precondition met by `SINS-04`: checksum-validated ABNs
   and the approval/variation/replacement/termination evidence chain, replayable from a committed
   synthetic-employer fixture. The product surface is `ASK-08`.
8. **`COV-001`** — award and classification structure exists as an addressable node hierarchy with
   pinpoint-citable classification levels (`SINS-03`), so the Coverage Navigator's stages 4–6 have
   something to cite.
9. **PRD §44.2 exit evidence** — `E11` "Exact IDs, version chains and evaluation subset"
   (`SINS-02`–`SINS-04`); `E12` "Licence/source-role validation" (`SINS-05`, `SINS-06`); `E13`
   "Eight-jurisdiction historical fixture matrix" (`SINS-07`–`SINS-14` over `SINS-01`).
10. **PRD §9.1 subordination** — no FWO, ATO or revenue-office guidance document is emitted with a
    `document_type` from the legislation/legislative-instrument set; guidance never claims operative
    authority in the corpus (`SINS-05`, `SINS-06`, `SINS-07`…`SINS-14`).
11. **PRD §40.9 anomalies** — every group has a count/hash baseline and per-source thresholds that
    only **tighten** the `INGF-05` initial defaults; a `BLOCK` rule is never downgraded, and the
    unconditional critical identity/time/mandatory-source/citation blockers are untouched by any
    percentage threshold (plan §8 **Q9**).
12. `uv run pytest` and `pnpm test` are green on the merged default branch after every ticket
    (PRD §45.3, plan §1.1).

## Changelog

- **v0.2 — 2026-08-03** — carried `docs/prd/breakdown-plan.md` §8's decision register into this
  module. **Q10 (limited-state launch policy) is confirmed** and is no longer described as an open
  question or a pending Founder decision: new decision **D11** states the policy and binds all
  thirteen adapter tickets to `INGF-07`'s `registry.yaml` `limitation` block (`state`, closed
  `reason_code` set, mandatory `reason_detail`, non-empty `evidence[]`, `affected` scope,
  `customer_visible_warning`), which this module consumes and never redefines. **Q9** is restated as
  baseline-selected and tighten-only rather than a placeholder awaiting a chosen number; **Q3**/**Q5**
  are restated as deferred until measurement, with the escalation paths (`RLSE-11`, `GOLD-16`) named.
  Added the "Decision-register entries carried here" section; the Open questions table now holds only
  the genuinely open module questions **N1**–**N6**. **D7**, two rejected alternatives and acceptance
  items 2 and 11 updated accordingly. No change to product scope, the source roster, dependency order,
  `blocked_by`/`blocks` edges, PRD traceability or any quality gate.
- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.8 (14 tickets,
  `SINS-01`…`SINS-14`). Records D2 (rate facts expressed inside the existing `CRPS-01` INR contract)
  and D4 (`_shared/` as a PEP 420 namespace directory) as ADR candidates, and raises N1–N6 as
  module-level open questions.
