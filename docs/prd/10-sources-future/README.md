# 10-sources-future — sub-PRD

> Module sub-PRD authored from `docs/prd/breakdown-plan.md` §5.11. The **ticket files** under
> `tickets/` are the executable source of truth; this README is the module-level context they share.
> Master spec: [PRD](../../PRD.md). Decomposition plan: [breakdown-plan](../breakdown-plan.md).

| Field | Value |
|---|---|
| Module | `10-sources-future` |
| Lane | `10-sources-future` |
| Ticket prefix | `SFUT` |
| Tickets | 10 (`SFUT-01` … `SFUT-10`) |
| Agent | `builder` (all 10, plan §1.1) |
| Epic | `E16-FUTURE` (PRD §44.2, week 3, depends on `E09`–`E10`, exit evidence *"Current/future separation tests"*) |
| PRD source roster | §40.6 — wave 5, nine groups `FUTURE-CTH` … `FUTURE-NT` |
| Requirement family | `SRCH-002` (status filters), supporting `ADM-001` (registry) and PRD §26 Corpus |
| Write-owns | `pipelines/adapters/_shared/future/**` · `pipelines/adapters/future-{cth,nsw,vic,qld,wa,sa,tas,act,nt}/**` (plan §4) |
| Depends on modules | `05-ingestion-framework` (framework + conformance kit), `06-sources-legislation` (`_shared/legislation`, the nine registers) |
| Language/toolchain | Python (`uv`, `pytest`) — PRD §18.2 *"Ingestion/build/evaluation \| Local Python pipeline"*, §20.1, §45.3 |
| Version | v0.2 |

## Problem

PRD §6.5 requires the corpus to carry future and proposed law — *"Bills. Explanatory memoranda.
Enacted but not commenced amendments. Draft instruments. Consultations. Commencement proclamations
and equivalent status events."* — and then imposes the invariant this whole module exists to make
mechanical:

> "Future/proposed material MUST be stored and searchable but MUST be separated from current-law
> answers and visibly labelled." (PRD §6.5)

PRD §6.7 states the default from the other side:

> "Default answers MUST use only material in force at the requested legal date unless the user
> explicitly requests historical, future or proposed material."

and PRD §36.2 states the retrieval-side rule:

> "Future/proposed research changes the allowed status set but never relabels future material as
> current. `STATUS_UNCONFIRMED` cannot support a definitive current-law conclusion."

PRD §40.6 turns that into nine mandatory source groups and closes with:

> "Each future item links to the legislation it would amend where deterministically supported. The UI
> labels `BILL_NOT_ENACTED`, `ENACTED_NOT_IN_FORCE` or `DRAFT_OR_CONSULTATION` with the relevant
> dates and never calls it current law."

Two failure modes are specific to this wave and are the reason it is a module rather than nine
ordinary adapters:

1. **Contamination.** A bill or an enacted-but-not-commenced amendment that is emitted with a
   current-law status, or with an effective interval that brackets today, silently becomes an answer
   about current law. PRD §43.3 makes *"Date/jurisdiction critical error … must be 0"* and
   *"Source-status correctness … ≥98%"* release gates, and `UAT-SRCH-02` tests exactly this
   ("Search current law with `ENACTED_NOT_IN_FORCE` source present → Future material absent from
   default results or visibly separated when requested").
2. **Fabricated certainty.** Commencement is frequently *"on a day to be fixed by proclamation"*.
   Inventing a date to fill a required field is precisely the *"false guarantee"* PRD §12.1 forbids,
   and it converts a not-yet-operative amendment into current law on a date nobody proclaimed.

The module therefore delivers one shared **current-vs-future separation model** (`SFUT-01`) that
makes both invariants emit-time, evidence-driven and mechanically testable, and nine jurisdiction
adapters that are built against it.

## Scope

| In scope | Ticket |
|---|---|
| Future-status derivation from evidenced `LegalEvent`s, the §40.6 status-event vocabulary, `CommencementSpec`, the emit-time separation validator, the `future.*` metadata schema, the amends-linkage builder, the shared separation fixture pack | `SFUT-01` |
| `FUTURE-CTH` — Parliament Bills and Legislation plus Federal Register: introduced/passed/assented, enacted-not-commenced, commencement, disallowance, explanatory material | `SFUT-02` |
| `FUTURE-NSW` … `FUTURE-NT` — register + parliament + official consultations per jurisdiction: Bill/draft/proclamation/commencement/repeal status *"without contaminating current-law answers"* | `SFUT-03` … `SFUT-10` |
| Each group's Source Coverage Registry row, URL allowlist, licence snapshot/assessment, recorded fixtures and the full PRD §40.8 twelve-item Definition of Done | every adapter ticket |

## Non-goals

| Not in this module | Owner |
|---|---|
| The adapter framework, safe fetcher, artifact store, licence gate, quarantine/run accounting, parser host, registry composer, discovery scheduler, conformance kit | `05-ingestion-framework` (`INGF-01`…`INGF-09`) |
| `corpus.sqlite` schema, the intermediate normalised-record (INR) contract, chunking, tiering, embeddings, release build/sign/publish | `04-corpus-contract` (`CRPS-01`…`CRPS-08`) |
| The nine legislation registers, point-in-time consolidation, in-force versions, repeal, the title allowlist and the shared legislation primitives | `06-sources-legislation` (`SLEG-01`…`SLEG-10`) |
| Canonical enums — `legal_status`, `document_type`, `event_type`, `relation_type`, `confidence_state`, jurisdiction codes | `00-foundation` (`FND-03`) |
| The answer-time temporal/authority predicate (`deriveStatus`, PRD §36.2 eligibility) | `00-foundation` (`FND-10`) |
| Hard applicability filters inside the search service, applied pre-scoring and pre-pack | `11-retrieval-engine` (`RETR-04`) |
| Advanced-Search status filter UI and the "future material visibly separated" screen behaviour | `14-search-product` (`FIND-04`, `FIND-05`) |
| Evaluation cases for historical/future/commencement/transitional traps (30 cases) | `21-evaluation-600` (`GOLD-13`) |
| Full-roster coverage/licence/freshness reconciliation across all 52 groups, and Gate 2 verification of any proposed limited state | `21-evaluation-600` (`GOLD-16` produces the measured evidence and the proposed registry state) and `24-launch` (`LNCH-05` verifies the launch statement discloses it accurately); the Founder verifies and signs off at Gate 2 under the confirmed limited-state launch policy (plan §8 **Q10**; decision **D12**) |
| Source-health, quarantine and licensing consoles | `22-internal-admin` (`INTL-02`, `INTL-03`, `INTL-05`) |
| Cross-boundary suites under `tests/**` | `23-assurance` |
| Any app-database, tenant or customer-data access | PRD §39.1: *"Python pipeline code never imports tenant/customer packages"* |

## Decisions

| # | Decision | Basis | Recorded by |
|---|---|---|---|
| D1 | **Wave-5 groups own the pre-enactment pipeline, wave-1 groups own the law.** A `FUTURE-*` adapter emits *proposal documents* — bill texts and prints, explanatory memoranda/statements, exposure drafts and draft instruments, official consultation documents, and separately-published commencement/proclamation notices — plus the §40.6 status events. It never emits a document version for an Act, regulation, statutory rule or consolidation: those belong to the same jurisdiction's `LEG-*` group. | PRD §40.2 rows give `LEG-*` *"In-force/repealed/as-made Acts/instruments, point-in-time versions … commencement tables"*; PRD §40.6 gives `FUTURE-*` the status events; plan §5.7 goals name Acts/instruments/versions and plan §5.11 goals name *"Bills, assent, enacted-not-commenced, disallowance, EMs"*. Duplicating a title in two groups produces two search results for one law. | `SFUT-01` (mechanism), every adapter (application) |
| D2 | **Separation is enforced at emit time by status and document type, never by the date interval.** Every record a `FUTURE-*` group emits carries `legal_status ∈ {BILL_NOT_ENACTED, DRAFT_OR_CONSULTATION, ENACTED_NOT_IN_FORCE, STATUS_UNCONFIRMED}` and a `document_type` from the proposal set; `IN_FORCE` is unconditionally forbidden. `effective_from`/`effective_to` describe when that *print/draft is the current text of that proposal document*, never a claim of legal force. | PRD §36.2 makes the status clause the separation mechanism (*"legal status is permitted by request mode"*; *"never relabels future material as current"*); PRD §35.2 keeps `legal_status` a separate column from the effect interval; PRD §15.2 distinguishes publication, effective, retrieval and knowledge time. | `SFUT-01` |
| D3 | **Status is derived from evidenced `LegalEvent`s only; anything unevidenced is `STATUS_UNCONFIRMED`, never `IN_FORCE`.** | PRD §15.2: *"Legal status MUST be derived from evidenced LegalEvents. Cached status fields MAY improve performance but are not the authoritative history."* PRD §36.2: *"`STATUS_UNCONFIRMED` cannot support a definitive current-law conclusion."* | `SFUT-01` |
| D4 | **An unresolved commencement resolves to `None`, never to a date.** `CommencementSpec` records the *mechanism* (`ON_ASSENT`, `FIXED_DATE`, `PERIOD_AFTER_ASSENT`, `BY_PROCLAMATION_SET`, `BY_PROCLAMATION_UNSET`, `CONDITIONAL_UNSET`); only an evidenced proclamation or a computable rule produces a date. | PRD §12.1: *"MUST show `FRESHNESS_LIMITED` rather than a false guarantee"* — the same principle applied to legal dates; PRD §43.3 makes date critical errors a zero-tolerance gate. | `SFUT-01` |
| D5 | **The "links to the legislation it would amend" relation travels as evidenced metadata (`future.amends`), not as a `node_relation`.** The INR contract scopes every `NodeRef`/`VersionRef` by the envelope's `source_id` (`CRPS-01` deliverable 11), so a cross-source relation is not expressible. The link records the target's jurisdiction, official identifier, official URL and the evidence offsets it was read from. | PRD §40.6: *"Each future item links to the legislation it would amend **where deterministically supported**"*; `CRPS-01` deliverable 11; PRD §35.2: *"`MODEL_SUGGESTED` cannot support definitive status."* | `SFUT-01`; open question **F2** |
| D6 | **Third-party consultation submissions are out of scope.** Only official consultation documents (discussion papers, exposure drafts, official consultation pages and official outcome statements) are ingested; submission repositories are excluded from every group's `allowlist.yaml`. | PRD §6.1: *"Only official public sources are eligible for the corpus. Customer private documents are excluded."* PRD §10.1 (PII) and PRD §40.8 item 4 (*"fixtures without customer data"*) — submissions routinely carry named individuals and contact details. | `SFUT-01` (validator), every adapter (allowlist) |
| D7 | **`_shared/future/**` builds on `_shared/legislation/**` and never copies it; no adapter imports another adapter.** All nine adapters are `blocked_by SFUT-01` for the future layer and `blocked_by SLEG-0N` for their jurisdiction's register conventions. | Plan §9 **R2**: *"The shared primitive stays owned by `SLEG-01`/…/`SFUT-01` … Never copy the helper into two adapter directories."* PRD §40.7 puts shared behaviour in framework code. | `SFUT-01` |
| D8 | **Initial index tier for every wave-5 group is `T3`.** PRD §40.6 is the only roster table with **no** "Initial tier" column; `registry.yaml` nevertheless requires `initial_index_tier` (`INGF-07`). `T3` is *"metadata/lexical/on-demand"*, which satisfies §6.5 *"stored and searchable"* at the lowest memory cost. The value is a declaration, not the assignment: `CRPS-04` assigns the real tier *"from evidence, not guesswork"*. | PRD §40.1 tier definitions; PRD §17.2 (*"The complete eligible corpus receives metadata/lexical/field/citation discovery"*, tier 3 *"no default embedding"*); PRD §39.2 memory budget; plan §5.5 `CRPS-04`. | every adapter; open question **F1** |
| D9 | **Default change-detection cadence is `NORMAL_DAILY`.** A group declares `CRITICAL_6_12H` only for an endpoint that publishes commencement/proclamation events, because a commencement flips material from not-operative to operative. A source with no delta mechanism declares `capability: NONE`, which `INGF-07` derives to `FRESHNESS_LIMITED`, plus a `known_gaps` entry with `customer_visible: true`. Where that makes the **group's** `adapter_status` one of the four PRD §7 limited states, the group also carries `INGF-07`'s `limitation` block with the measured evidence for it (**D12**) — the status alone is never sufficient. | PRD §12.1 cadences and *"Sources without reliable delta mechanisms MUST show `FRESHNESS_LIMITED` rather than a false guarantee"*; PRD §7 limited-status vocabulary; `INGF-07` deliverable 3. | every adapter |
| D10 | **One `registry.yaml` and one `licence.yaml` per group, even though a §40.6 group spans a legislation register, a parliament and consultation portals.** Multiplicity is expressed *inside* the file as a list of authorities/collections with per-endpoint `material_class`. | `INGF-07` feedback item 1 fixes exactly this resolution for multi-authority groups; plan §2.1 **A2** forbids any cross-group shared file. | every adapter |
| D11 | **Import root and `_shared` layout follow `SLEG-01`.** Plan §4 fixes the paths as `pipelines/adapters/_shared/future/**` and `pipelines/adapters/future-<juris>/**`. `pipelines/adapters` is a PRD §20.1 member, so `FND-01` creates its `pyproject.toml` (plan §1.1); `SLEG-01` creates the first `_shared` package and fixes how it is imported. This module follows both without re-deciding. Adapter modules themselves are loaded by path (`INGF-01`'s `load_adapter`), so hyphenated group directories are fine. | Plan §1.1, §4; `INGF-01` deliverable 9. | `SFUT-01`; open question **F7** |
| D12 | **The limited-state launch policy is confirmed, and a limited state is recordable only with its evidence.** Plan §8 **Q10** is settled: no mandatory `FUTURE-*` group is pre-selected for omission or reduced implementation, all nine must be attempted in full, and arbitrary scope reduction to make a release date easier is not permitted. A group may launch in one of the four PRD §7 customer-visible limited states — `METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE` — **only** where measured evidence shows a genuine official-source limitation: an official capability limit, the official body not publishing the material, a licensing restriction, historical material unavailable, a freshness limitation, or another real official-source constraint. Declaring one obliges that group's `registry.yaml` to carry `INGF-07`'s `limitation` block — `state` equal to `adapter_status`, a closed-set `reason_code`, a mandatory `reason_detail`, at least one `evidence` entry, an `affected` scope of dates or collections, and a `customer_visible_warning` that also appears as a customer-visible `known_gaps` entry — which this module **consumes and never redefines**. Silent omission is prohibited and no unofficial source or commercial headnote may substitute for unavailable official material. `GOLD-16` produces the measured evidence and the proposed registry state, `LNCH-05` verifies the launch statement, and Gate 2 is the Founder's verification and sign-off under this policy, not an opportunity to cut mandatory scope. **Which** groups, if any, end up limited remains a Gate 2 output derived from that evidence. Registry status is orthogonal to what a group *emits*: **D1**–**D5**'s PRD §6.5/§6.7 current-vs-future separation invariants and `SFUT-01`'s checks apply unchanged whatever `adapter_status` says. | Plan §8 **Q10** (confirmed policy); PRD §7, §6.1, §26, §44.4; `INGF-07` deliverables 3, 6 and 7 (the schema, the `REGISTRY_LIMITATION_*` composition failures and the verbatim carry-through to `GOLD-16`/`LNCH-05`). | every adapter (status + `limitation` record); `GOLD-16` (consolidation); `LNCH-05` (disclosure) |

## Rejected alternatives

| Rejected | Why |
|---|---|
| Emitting bill and Act documents from both `leg-<juris>` and `future-<juris>` | Two documents for one law: conflicting search results, and PRD §40.9 flags *"any duplicate stable identity"*. D1 gives each group a disjoint document class. |
| Separating future material by pushing `effective_from` into the far future (sentinel date) | A fabricated date is exactly PRD §12.1's *"false guarantee"*, it would also hide the material from *future-mode* research (PRD §6.5 requires it searchable), and PRD §36.2 already makes the status clause the separation mechanism. |
| Deriving status from a cached field on the source page ("this Bill has passed") without an evidenced event | PRD §15.2: status *"MUST be derived from evidenced LegalEvents"*; a scraped banner is not evidence with offsets. |
| Model/LLM inference of which Act a bill amends | PRD §40.6 says *"where deterministically supported"*; PRD §35.2 says *"`MODEL_SUGGESTED` cannot support definitive status"*; PRD §9.1's authority hierarchy would be built on a guess. |
| Copying the status-derivation helper into each of the nine adapters | Plan §9 **R2** — the shared primitive stays owned by `SFUT-01`. |
| Collapsing the nine jurisdictions into one `future` adapter | PRD §44.4 forbids dropping a mandatory group; PRD §44.3 names individual adapters the *"safe parallel work units"*; plan §5.11 fixes ten tickets and plan §7 gives this module nine useful lanes. |
| Ingesting parliamentary Hansard, committee reports or third-party submissions to enrich bill context | Out of PRD §6.5's list, and submissions carry personal information (D6, PRD §6.1, §10.1). |
| Re-implementing PRD §36.2's eligibility predicate here as the product filter | `FND-10` (domain) and `RETR-04` (search) own it. `SFUT-01` ships only a producer-side *simulation* of the status clause, whose sole job is to prove the emitted data cannot leak into current-law mode. |
| Writing a shared `sources/future.yaml` describing all nine groups | Plan §2.1 **A2**; `INGF-07` asserts no registry file exists outside `pipelines/adapters/<group>/`. |
| Omitting or reducing a mandatory `FUTURE-*` group, or one of its named collections, to make a release date easier | Plan §8 **Q10** is confirmed policy: no mandatory group may be pre-selected for omission or reduced implementation, and arbitrary scope reduction for date convenience is not permitted (**D12**). PRD §44.4 forbids silently calling an unimplemented source category covered. A genuine official-source limitation is recorded as an evidenced limited state, never as absence. |
| Declaring `FRESHNESS_LIMITED` / `LICENSING_RESTRICTED` / `METADATA_AND_LINK_ACTIVE` / `SOURCE_UNAVAILABLE` for a collection that is merely unfinished | Those four states are the PRD's honest description of a *real* limitation. `INGF-07` will not compose one without a `limitation` block carrying evidence, an affected scope and a customer-visible warning (**D12**), and PRD §44.4 makes the silent downgrade the failure. |

## Settled and benchmark-selected entries (plan §8)

Two entries this module used to carry as open questions are settled by `docs/prd/breakdown-plan.md`
§8's decision register. Their ids are unchanged so existing ticket cross-references still resolve;
what changed is their status. Neither is a number or a choice anyone in this module is asked to guess.

| # | Entry and status | Owner | Resolved by | Blocks |
|---|---|---|---|---|
| F5 *(plan §8 **Q10**)* | **Settled — confirmed policy; now decision D12.** No mandatory `FUTURE-*` group is pre-selected for omission or reduced implementation, every one of the nine is attempted in full, arbitrary scope reduction to make a release date easier is not permitted, and a customer-visible limited state is permitted only on measured evidence of a genuine official-source limitation, recorded in `INGF-07`'s `limitation` block. **Which** groups, if any, end up limited is a Gate 2 output derived from that evidence — a measurement result, not an open decision. | Policy: **already decided** (plan §8 **Q10**). Evidence: each adapter ticket. | `GOLD-16` produces the measured evidence and the proposed registry state → `LNCH-05` verifies the launch statement → Gate 2 is the Founder's verification and sign-off under the policy | Nothing in this module. Every adapter supplies the PRD §7 status, the `limitation` record and the customer-visible gap text unconditionally. |
| F6 *(plan §8 **Q9**)* | **Baseline-selected.** PRD §40.9's ±10% collection-count change and >2% parse-failure figures are **initial defaults**; each adapter may tighten or replace the percentages once it has a representative baseline (tighten-only). Critical identity, time, mandatory-source and citation failures are **unconditional blockers** unaffected by any percentage. | each adapter ticket, with the defaults and the tighten-only override mechanism in **`INGF-05`** | per-adapter DoD item 8 (`conformance.yaml` `anomaly_overrides`, tighten-only); **consolidated and verified in `GOLD-16`** | Nothing — the critical failures already block release unconditionally. |

## Open questions

Module-local only. **F5** and **F6** are no longer open — they moved to the table above when plan §8's
decision register confirmed **Q10** and recorded **Q9** as baseline-selected; their ids are retained
there so every ticket reference still resolves. **F1** is unaffected and stays open: PRD §40.6 is
still the only roster table without an "Initial tier" column, and `CRPS-04` still owns the real
assignment. (Plan §8 **Q3** — always-hot vector count, semantic-cache limits, resident-memory
allocation and the cold/hot tier boundary — is a separate, *deferred until real-scale measurement*
entry owned by `18-ops-release` and resolved by `RLSE-11`'s 2 GB benchmark; its governing policy is
already settled, and it is not this module's question.)

| # | Question | Owner | Resolved by | Blocks |
|---|---|---|---|---|
| F1 | **Initial index tier for wave 5.** PRD §40.6 is the only roster table without an "Initial tier" column, yet `registry.yaml` requires one. D8 declares `T3`. | `04-corpus-contract` — **`CRPS-04`** (*"T1/T2/T3/excluded/quarantined assigned from evidence, not guesswork"*, plan §5.5) | `CRPS-04` at build time; the registry value is a declaration | Nothing. A `T3` declaration cannot over-claim: it is the lowest tier that still satisfies PRD §6.5 "searchable". |
| F2 | **Cross-source amendment linkage.** D5 carries `future.amends` as metadata because INR refs are `source_id`-scoped. Does the contract need a first-class cross-source relation? | `04-corpus-contract` — **`CRPS-01`** owns the INR contract | The first adapter that proves metadata is insufficient raises it against `CRPS-01`; writeback target `docs/prd/04-corpus-contract/README.md` + the `CRPS-01` ticket | Nothing at ingest time. Answer-time resolution of the link is `RETR-*`/`EVID-*` and can consume the metadata. |
| F3 | **Canonical `event_type` members for the §40.6 status events** (`INTRODUCED`, `PASSED`, `ASSENTED`, `COMMENCEMENT`, `DISALLOWANCE`, `PROCLAMATION_MADE`, `DRAFT_PUBLISHED`, `CONSULTATION_OPENED`, `CONSULTATION_CLOSED`, `LAPSED`, `WITHDRAWN`). | `00-foundation` — **`FND-03`** owns every controlled value | `FND-03`'s own feedback rule names `event_type` explicitly: add the member there **and** to `packages/contracts/test/enums/prd-enums.fixture.json` **and** to `docs/prd/00-foundation/README.md` D6 | `SFUT-01`'s event mapping. `FND-03` is transitively upstream (`FND-03` → `CRPS-01` → `INGF-01` → … → `SLEG-01` → `SFUT-01`), so it has landed; a missing member is a writeback, never a local string. |
| F4 | **If `06-sources-legislation` reads §40.2's "Bills" as belonging to `LEG-*`**, D1 is contradicted and two modules would emit the same documents. | this sub-PRD (Architect) jointly with `docs/prd/06-sources-legislation/README.md` | The first `SFUT-0N` Builder that sees bill documents in the merged `leg-<juris>` adapter escalates **before** emitting anything; writeback to both sub-PRDs and, if the module boundary moves, to `docs/prd/breakdown-plan.md` §4/§5 | Emission of bill documents in the affected jurisdiction only. |
| F7 | **`pipelines/adapters/pyproject.toml` is shared-additive across five modules (`06`–`10`) and 52 tickets**, a width plan §1.1 only states for a single module. | `00-foundation` — **`FND-01`** created it | Append-only use; conflicts resolved by re-running `uv lock`, never hand-merged (plan §1.1, PRD §44.3). If churn actually blocks delivery, writeback to `docs/prd/breakdown-plan.md` §1.1/§4 | Nothing today; wave 5 declares few dependencies. |
| F8 | **DoD item 11 (retrieval/citation evaluation subset) cannot be satisfied when wave 5 lands**, because `evals/**` is authored later. | `21-evaluation-600` — **`GOLD-13`** (temporal traps, `blocked_by SFUT-02`) and **`GOLD-16`** (roster reconciliation) | `INGF-09`'s verdict model permits `DEFERRED` for item 11 **only**, and only with a recorded `conformance.yaml` reason | Nothing. Every ticket here must still declare `evaluation_subset_ref` ids so `GOLD-16` can reconcile them. |

## Work breakdown

`lane` = `10-sources-future` and `agent` = `builder` for all ten tickets (plan §1.1). Paths are
relative to the repository root.

| Ticket | Size | Lane | File-scope (write-owns) | Depends on |
|---|---|---|---|---|
| [`SFUT-01`](tickets/SFUT-01-future-status-event-model-and-current-future-separation.md) — Future-status event model and current/future separation | M | `10-sources-future` | `pipelines/adapters/_shared/future/**` | `SLEG-01` |
| [`SFUT-02`](tickets/SFUT-02-future-cth.md) — `FUTURE-CTH` | M | `10-sources-future` | `pipelines/adapters/future-cth/**` | `SFUT-01`, `SLEG-02` |
| [`SFUT-03`](tickets/SFUT-03-future-nsw.md) — `FUTURE-NSW` | M | `10-sources-future` | `pipelines/adapters/future-nsw/**` | `SFUT-01`, `SLEG-03` |
| [`SFUT-04`](tickets/SFUT-04-future-vic.md) — `FUTURE-VIC` | M | `10-sources-future` | `pipelines/adapters/future-vic/**` | `SFUT-01`, `SLEG-04` |
| [`SFUT-05`](tickets/SFUT-05-future-qld.md) — `FUTURE-QLD` | M | `10-sources-future` | `pipelines/adapters/future-qld/**` | `SFUT-01`, `SLEG-05` |
| [`SFUT-06`](tickets/SFUT-06-future-wa.md) — `FUTURE-WA` | M | `10-sources-future` | `pipelines/adapters/future-wa/**` | `SFUT-01`, `SLEG-06` |
| [`SFUT-07`](tickets/SFUT-07-future-sa.md) — `FUTURE-SA` | M | `10-sources-future` | `pipelines/adapters/future-sa/**` | `SFUT-01`, `SLEG-07` |
| [`SFUT-08`](tickets/SFUT-08-future-tas.md) — `FUTURE-TAS` | M | `10-sources-future` | `pipelines/adapters/future-tas/**` | `SFUT-01`, `SLEG-08` |
| [`SFUT-09`](tickets/SFUT-09-future-act.md) — `FUTURE-ACT` | M | `10-sources-future` | `pipelines/adapters/future-act/**` | `SFUT-01`, `SLEG-09` |
| [`SFUT-10`](tickets/SFUT-10-future-nt.md) — `FUTURE-NT` | M | `10-sources-future` | `pipelines/adapters/future-nt/**` | `SFUT-01`, `SLEG-10` |

`pipelines/adapters/pyproject.toml` is **shared-additive** (D11, F7): each ticket appends only the
dependencies it declares, and a conflict is resolved by re-running `uv lock`, never by hand-merging
(plan §1.1, PRD §44.3).

### Lane profile (plan §7)

Two waves, peak nine concurrent lanes, **not fully serial**:

```text
wave 1  SFUT-01
wave 2  SFUT-02 | SFUT-03 | SFUT-04 | SFUT-05 | SFUT-06 | SFUT-07 | SFUT-08 | SFUT-09 | SFUT-10
```

The nine adapter file-scopes are disjoint by directory (`pipelines/adapters/future-<juris>/**`).
They share exactly two paths: `pipelines/adapters/_shared/future/**`, which they only **read** and
which is owned by `SFUT-01` (every one of them is `blocked_by` it), and the append-only
`pipelines/adapters/pyproject.toml`. Cross-module, they read `pipelines/adapters/_shared/legislation/**`
and `pipelines/adapters/leg-<juris>/**` (module `06`) and `pipelines/ingestion/**` (module `05`);
they write neither.

### Downstream

`SFUT-02` gates `GOLD-13` (30 historical/future/commencement/transitional trap cases) and
`GOLD-16`; `SFUT-03`…`SFUT-10` each gate `GOLD-16` (full-roster coverage, licence and freshness
reconciliation) — plan §6.2. `GOLD-16` is the ticket that proves *"Every mandatory group is ACTIVE
or explicitly limited — never silently omitted"* (PRD §44.4).

## Acceptance — what makes the module done

The module is done when all ten tickets are delivered and:

1. **PRD §6.5 invariant, mechanically** — every record any `FUTURE-*` group emits carries a
   non-current PRD §6.7 status and a proposal `document_type`; a producer-side simulation of PRD
   §36.2's status clause in `CURRENT_LAW` mode returns an empty eligible set over every group's
   fixtures at every declared legal date (`SFUT-01` validator, run by all nine adapters).
2. **PRD §44.2 `E16` exit evidence — "Current/future separation tests"** — that suite exists, is
   offline-reproducible and is part of every adapter's acceptance.
3. **PRD §6.7 default** — `derive_future_status()` never returns `IN_FORCE` for a wave-5 record, and
   returns `STATUS_UNCONFIRMED` rather than guessing when evidence is missing; an unresolved
   commencement resolves to `None`, never a date (D3, D4).
4. **PRD §40.6** — all nine group IDs exist as `pipelines/adapters/future-<juris>/` directories with
   their required status events implemented and their labels (`BILL_NOT_ENACTED`,
   `ENACTED_NOT_IN_FORCE`, `DRAFT_OR_CONSULTATION`) carrying the relevant dates.
5. **PRD §40.8** — each of the nine passes all twelve Definition-of-Done items through
   `INGF-09`'s conformance kit with a committed `conformance-report.json`; item 11 may be
   `DEFERRED(GOLD-16)` with a recorded reason and nothing else may be deferred (F8).
6. **PRD §6.1 / §7 / §12.1 / ADM-001** — each group has a Source Coverage Registry row that
   validates (`python -m <root>.registry validate <group-dir>` exits 0), declares `ACTIVE` or one of
   the four PRD §7 limited states with a customer-visible gap, and keeps the five PRD §12.1 dates
   separate. A limited state also carries `INGF-07`'s `limitation` block — state, closed-set reason
   code, reason detail, at least one evidence entry, affected dates or collections and the
   customer-visible warning — so an unevidenced limited state cannot compose, and no group was
   pre-selected for omission or reduced implementation (**D12**; plan §8 **Q10**, confirmed policy).
7. **PRD §11.1** — each group has a licence snapshot and an independent assessment per authority;
   unclear rights collapse to metadata/link-only before storage, indexing, embedding, display or
   export.
8. **SRCH-002** — *"Advanced Search applies date, jurisdiction, type, authority and status filters"*,
   minimum evidence *"Every result independently passes all hard filters"* (PRD §30.2). This module
   supplies the correctly-statused data those filters act on; enforcement is `RETR-04`/`FIND-04`, and
   `UAT-SRCH-02` is the human script that closes it.
9. **PRD §26 (Corpus)** — *"All five source waves have active or explicitly limited registry status"*
   gains its wave-5 evidence; **PRD §44.4** — no wave-5 category is silently called covered.
10. `uv run pytest` and `pnpm test` are green on the merged default branch after every ticket
    (PRD §45.3, plan §1.1).

## Changelog

- **v0.2 — 2026-08-03** — realigned to `docs/prd/breakdown-plan.md` §8's decision register.
  **Q10 is confirmed policy**, so this sub-PRD no longer describes limited launch as a pending Founder
  decision: it is new decision **D12** — no mandatory `FUTURE-*` group is pre-selected for omission or
  reduced implementation, all nine are attempted in full, arbitrary scope reduction for date
  convenience is not permitted, and a limited state is recordable only through `INGF-07`'s
  `limitation` block (state, closed `reason_code` set, mandatory `reason_detail`, non-empty
  `evidence[]`, `affected` dates or collections, `customer_visible_warning`), which this module
  consumes and never redefines. **D9** now requires that record whenever a limited status is set, and
  two rejected alternatives are added. **Q9 remains baseline-selected**: the ±10% / >2% figures are
  stated as initial defaults each adapter may tighten from a representative baseline (tighten-only),
  with critical identity, time, mandatory-source and citation failures blocking unconditionally and
  `GOLD-16` consolidating — never numbers anyone guesses. **F5** and **F6** therefore leave *Open
  questions* for the new **Settled and benchmark-selected entries** table, keeping their ids so every
  ticket reference resolves. **F1 stays open** — PRD §40.6 still has no "Initial tier" column and
  `CRPS-04` still owns the real assignment — as do **F2**, **F3**, **F4**, **F7** and **F8**; plan §8
  **Q3** remains deferred until `RLSE-11`'s real-scale measurement and is referenced only where a
  ticket's DoD item 12 measurements meet PRD §39.2's host budget. **Nothing about what this module
  emits changed**: D1–D8's PRD §6.5/§6.7 current-vs-future separation invariants, `SFUT-01`'s checks,
  the ten tickets, their `blocked_by`/`blocks` edges, file-scopes, PRD traceability, the PRD §40.8
  twelve-item Definition of Done and every evidence-collection and customer-visible-limitation
  requirement are unchanged.
- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.11 (10 tickets,
  `SFUT-01`…`SFUT-10`). Records D1 (wave-5 vs wave-1 document ownership), D2 (status-based, not
  date-based, separation) and D5 (amends linkage as evidenced metadata) as the load-bearing choices,
  and raises F1–F8 as module-level open questions.
