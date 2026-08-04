# 09-sources-adjacent — sub-PRD

> Module sub-PRD authored from `docs/prd/breakdown-plan.md` §5.10. The **ticket files** under
> `tickets/` are the executable source of truth; this README is the module-level context they share.
> Master spec: [PRD](../../PRD.md). Decomposition plan: [breakdown-plan](../breakdown-plan.md).

| Field | Value |
|---|---|
| Module | `09-sources-adjacent` |
| Lane | `09-sources-adjacent` |
| Ticket prefix | `SADJ` |
| Tickets | 9 (`SADJ-01` … `SADJ-09`) |
| Agent | `builder` (all 9, plan §1.1) |
| Epic | `E15-ADJACENT` (PRD §44.2) — exit evidence *"Registry decomposed; adapter DoD per group"* |
| Requirement families | `SRCH-002`, `ADM-001` (plan §3) |
| Write-owns | `pipelines/adapters/adj-{cth,nsw,vic,qld,wa,sa,tas,act,nt}/**` (plan §4) |
| Depends on modules | `05-ingestion-framework`, `06-sources-legislation` |
| Language/toolchain | Python (`uv`, `pytest`) — PRD §18.2 "Ingestion/build/evaluation \| Local Python pipeline", §20.1, §45.3 |
| Version | v0.2 |

## Problem

PRD §7 wave 4 is the part of the corpus where **the law that decides an employment question is not
in the Fair Work Act**:

> "4. **Employment-adjacent regimes:** WHS/OHS, discrimination, workers compensation, labour hire,
> portable LSL, surveillance/privacy, whistleblowing, child employment, public sector and
> migration/right-to-work."

PRD §6.3 makes the same list mandatory for **every** state and territory, and PRD §40.5 turns it
into nine mandatory source groups — `ADJ-CTH`, `ADJ-NSW`, `ADJ-VIC`, `ADJ-QLD`, `ADJ-WA`, `ADJ-SA`,
`ADJ-TAS`, `ADJ-ACT`, `ADJ-NT` — one per jurisdiction, each naming several regulators.

The failure mode this module exists to prevent is stated by PRD §40.5 itself:

> "An authority name in this planning row is not enough for release. The registry must link exact
> official pages/collections and identify whether material is law, operative instrument, decision,
> code, guidance, policy or news."

and by PRD §44.4:

> "It is not permitted to silently call an unimplemented source category covered."

A ticket that says *"ingest all adjacent sources for NSW"* is therefore not implementable and not
releasable. Every ticket in this module carries a **named decomposition** of its jurisdiction — one
row per authority/collection, with the topic it serves, the PRD §40.5 material classification, the
expected change-detection capability and the initial index tier — and proves the full PRD §40.8
twelve-item Definition of Done against each of them.

The second problem is boundary discipline. Adjacent regimes are the place where four other modules'
material is easiest to duplicate: the WHS **Act** belongs to wave 1 (`LEG-*`), the tribunal
**judgment** belongs to wave 3 (`CASE-*`), the **bill** belongs to wave 5 (`FUTURE-*`), and only the
regulator's own code/guidance/policy/decision-summary/register material belongs here. PRD §9.1
places that material at level 6 of the authority hierarchy and states the consequence:

> "Guidance MUST NOT silently override legislation, an operative instrument or binding authority."

## Scope

| In scope | Ticket |
|---|---|
| `ADJ-CTH` — Home Affairs work rights/migration, OAIC privacy, AHRC discrimination, Safe Work Australia model WHS material, Comcare WHS + SRC-scheme compensation, ASIC/Commonwealth Ombudsman whistleblowing, APSC public-sector employment, DEWR workplace-relations policy | `SADJ-01` |
| `ADJ-NSW` — SafeWork NSW, Anti-Discrimination NSW, SIRA, icare, Long Service Corporation, NSW Industrial Relations, IPC NSW, Office of the Children's Guardian, NSW PSC, NSW Ombudsman | `SADJ-02` |
| `ADJ-VIC` — WorkSafe Victoria (OHS + WorkCover), VEOHRC, Labour Hire Authority, Portable Long Service Authority, Wage Inspectorate Victoria, VPSC, OVIC, IBAC | `SADJ-03` |
| `ADJ-QLD` — WHSQ/OIR, WorkCover Queensland, Workers' Compensation Regulator, QHRC, Labour Hire Licensing Queensland, QLeave, Queensland PSC, Queensland Ombudsman | `SADJ-04` |
| `ADJ-WA` — WorkSafe WA/DEMIRS, WorkCover WA, EOC WA, MyLeave, Private Sector Labour Relations (Wageline), PSC WA, Ombudsman WA — **and the explicit record of the regimes WA does not have** | `SADJ-05` |
| `ADJ-SA` — SafeWork SA (WHS + IR/LSL/child employment), EOC SA, ReturnToWorkSA, Consumer and Business Services labour-hire licensing, construction portable-LSL authority, OCPSE, SA public-integrity/PID | `SADJ-06` |
| `ADJ-TAS` — WorkSafe Tasmania (WHS + WorkCover), Equal Opportunity Tasmania, TasBuild, Tasmanian IR/LSL/youth-employment material, State Service Management Office, Ombudsman Tasmania (PID + personal information) | `SADJ-07` |
| `ADJ-ACT` — WorkSafe ACT, ACT Human Rights Commission, ACT Leave, Access Canberra labour-hire licensing, ACT public-sector employment, ACT Ombudsman/OAIC privacy arrangement | `SADJ-08` |
| `ADJ-NT` — NT WorkSafe (WHS + Return to Work), NT Anti-Discrimination Commission, NT Build, NT IR/LSL/child-employment material, OCPE, Ombudsman NT, OIC NT | `SADJ-09` |

## Non-goals

| Not in this module | Owner |
|---|---|
| The **Acts, regulations and legislative instruments** of every adjacent regime (WHS Act, EO/anti-discrimination Act, workers-compensation Act, labour-hire Act, LSL Acts, surveillance/privacy Acts, PID Acts, child-employment Acts, public-sector Acts) | `06-sources-legislation` — `SLEG-02`…`SLEG-10`, wave 1 (PRD §40.2, §7) |
| Court and tribunal **judgments** arising under those regimes (WHS prosecutions in court, anti-discrimination tribunal decisions, workers-compensation appeal decisions) | `08-sources-cases` — `SCAS-02`…`SCAS-13` (PRD §40.4, §6.4) |
| **Bills, drafts, consultations and commencement events** for adjacent-regime law | `10-sources-future` — `SFUT-02`…`SFUT-10` (PRD §40.6, §6.5) |
| Payroll tax, awards, agreements, FWC/FWO/ATO material | `07-sources-instruments` (PRD §40.3) |
| The adapter framework, safe fetcher, artifact store, licence gate, quarantine, run accounting, registry composer, discovery scheduler and conformance kit | `05-ingestion-framework` — `INGF-01`…`INGF-09` (PRD §40.7) |
| The `corpus.sqlite` schema, the intermediate normalised-record payload types, chunking, tiering, embeddings, release build/sign/publish | `04-corpus-contract` — `CRPS-01`…`CRPS-08` (plan §2.1 A4) |
| Any `_shared/**` adapter helper directory | `06`/`07`/`08`/`10` own `_shared/{legislation,rates,caselaw,future}`; module 09 has **no** `_shared` path in plan §4 — see decision **D2** |
| Full-roster coverage/licence/freshness reconciliation, and Gate 2 verification of any proposed limited state | `21-evaluation-600` — `GOLD-16` produces the measured evidence and the proposed registry state; `24-launch` — `LNCH-05` verifies the launch statement discloses it accurately; the Founder verifies and signs off at Gate 2 under the confirmed limited-state launch policy (plan §8 **Q10**; decision **D11**) |
| Evaluation cases for WHS/compensation and the other adjacent regimes | `21-evaluation-600` — `GOLD-10`, `GOLD-11` (both `blocked_by` all nine `SADJ` tickets) |
| Internal source-health / quarantine / licensing consoles | `22-internal-admin` — `INTL-02`, `INTL-03`, `INTL-05` |
| Customer-facing source and registry screens | `14-search-product` — `FIND-05` |
| Any app-database, tenant or customer-data access | PRD §39.1: "Python pipeline code never imports tenant/customer packages" |

## Decisions

| # | Decision | Basis | Recorded by |
|---|---|---|---|
| D1 | **One ticket per PRD §40.5 Group ID; the decomposition into named source groups lives inside that group's `registry.yaml`.** No new Group IDs are created. | `INGF-07` fixes `MANDATORY_SOURCE_GROUPS` at exactly the 52 PRD §40.2–40.6 ids, of which wave 4 contributes exactly `ADJ-CTH`…`ADJ-NT`; inventing `ADJ-NSW-SAFEWORK` would fail roster composition. PRD §40.5 requires the exact pages/collections to be *in the registry*, not in the roster. `INGF-07`'s own feedback obligation names this case: "keep **one file per group** and express the multiplicity **inside** it (a list of authorities/collections)". | every ticket; schema friction is open question **M1** |
| D2 | **Module 09 creates no `_shared/**` directory.** Plan §4 gives this module exactly `pipelines/adapters/adj-{cth,nsw,vic,qld,wa,sa,tas,act,nt}/**` and no `_shared` path. Reuse comes from `pipelines/ingestion/**` (framework) and, read-only, `pipelines/adapters/_shared/legislation/**` (`SLEG-01`, available transitively because every `SLEG-0X` is `blocked_by SLEG-01`). | plan §4; plan §9 **R2**: "a shared file written by 52 concurrent tickets is the worst contention in the repo … Never copy the helper into two adapter directories." All nine `SADJ` tickets are schedulable in the same wave (plan §7: min waves 1, nine useful lanes), so a shared directory here would be written by nine concurrent lanes. | every ticket; writeback path in each ticket's *Feedback obligation* |
| D3 | **Regulator material is subordinate authority and is typed as such.** `document_type` distinguishes an approved code of practice (made or approved under the regime's Act) from ordinary guidance, policy, a regulator decision/enforcement outcome, a public register entry and news. | PRD §9.1 level 6 ("Official regulator guidance, rulings, decision summaries and impact materials") and "Guidance MUST NOT silently override legislation, an operative instrument or binding authority"; PRD §6.1 "Official regulator summaries MAY supplement but MUST NOT replace primary decisions or operative instruments"; PRD §40.5's seven-value material classification. | every ticket |
| D4 | **The regime's Act is never re-ingested here.** Where the regulator document is deterministically tied to a provision (a code approved under a named section, guidance citing a numbered provision), the adapter emits a `node_relation` targeting the `LEG-<juris>` node identity with retained evidence offsets and `parser_version`. | PRD §9.3: "Deterministic extraction may support conclusions when exact source evidence and parser version are retained"; PRD §35.2 `node_relation`. This is why plan §5.10 makes every `SADJ-0X` `blocked_by` its `SLEG-0X` register. | every ticket |
| D5 | **The PRD §6.3 twelve-topic checklist is evaluated for every state/territory, and every topic resolves to a named collection, to an explicit `known_gaps` entry with `customer_visible: true`, or to a named other module — never to silence.** This is not local practice: it is the confirmed plan §8 **Q10** policy applied at topic level (**D11**), which prohibits silent omission and forbids reducing an attempted group's scope for release-date convenience. Which of the three outcomes applies is an evidence question; "unmentioned" is not one of them. | PRD §6.3 lists all twelve topics for all eight jurisdictions while PRD §40.5's per-row "Required topics" column is narrower; PRD §40.5 `ADJ-WA` says "only regimes actually applicable"; PRD §6.1 requires "known gaps"; PRD §7 requires an explicit limited status with customer-visible warnings; PRD §44.4 forbids silence; plan §8 **Q10** items 1, 3 and 7 (confirmed policy). | every ticket; `SADJ-05` is the sharpest case; the "regime does not exist" case is **D12** |
| D6 | **Missing capability is a status, not a downgrade.** A collection with no feed/API/sitemap/manifest gets `change_detection.capability: NONE` → `FRESHNESS_LIMITED`; unclear or restrictive terms give `UNCLEAR_RESTRICTED` (collapsing to metadata/link-only) and, where that constrains the whole group, group status `LICENSING_RESTRICTED`; no online official publication at all gives `SOURCE_UNAVAILABLE`. Whenever one of those four states lands on the group's `adapter_status`, the group's `registry.yaml` also carries `INGF-07`'s `limitation` block with the measured evidence for it (**D11**) — the status alone is never sufficient. | PRD §12.1 "Sources without reliable delta mechanisms MUST show `FRESHNESS_LIMITED` rather than a false guarantee"; PRD §11.1 "Unclear rights default to metadata, limited quotation and official links"; PRD §7's four explicit limited statuses; `INGF-07` deliverable 3. | every ticket |
| D7 | **`legal_status` for regulator material is evidence-derived; absent evidence it is `STATUS_UNCONFIRMED`.** A guidance page with no published issue/revision/withdrawal signal is never asserted `IN_FORCE`. | PRD §15.2 "Legal status MUST be derived from evidenced LegalEvents"; PRD §6.7's seven-value taxonomy. | every ticket |
| D8 | **A statutory authority that publishes on a non-`.gov.au` domain is admissible only as the named statutory authority for its scheme**, recorded in `registry.yaml.authority` with its statutory basis and explicitly allowlisted. Known cases: ReturnToWorkSA, the SA and Tasmanian and NT construction portable-LSL authorities, WorkCover Queensland's insurer site. | PRD §6.1 "Only official public sources are eligible"; PRD §37.4/SEC-002 require a per-source allowlist, so the exception is expressed as data, not as a code path. | `SADJ-04`, `SADJ-06`, `SADJ-07`, `SADJ-09` |
| D9 | **Material that another wave-4 group already ingests is cross-referenced, never duplicated.** The concrete case is ACT privacy, administered under an arrangement with the Commonwealth OAIC: `ADJ-CTH` ingests the OAIC collection once; `ADJ-ACT` records applicability in its registry entry and emits no duplicate document identity. | PRD §35.2 `legal_document` unique `(source_id, stable_source_key)`; PRD §40.9 flags "any duplicate stable identity" as an anomaly. | `SADJ-08` (with `SADJ-01`); open question **M8** |
| D10 | **No adapter adds a third-party dependency.** `INGF-01`'s architecture test forbids any module under `pipelines/adapters/**` importing `requests`/`httpx`/`aiohttp`/`urllib`/`socket` or `sqlite3`; everything else reaches the adapter through `AdapterRunContext`. | PRD §37.4 "Adapters use a shared fetcher, not arbitrary HTTP libraries"; `INGF-01` deliverable 11. Keeps `pipelines/adapters/pyproject.toml` — one PRD §20.1 member shared by five modules — untouched (open question **M4**). | every ticket |
| D11 | **The limited-state launch policy is confirmed, and a limited state is recordable only with its evidence.** Plan §8 **Q10** is settled: no mandatory `ADJ-*` group is pre-selected for omission or reduced implementation, all nine must be attempted in full, and arbitrary scope reduction to make a release date easier is not permitted. A group may launch in one of the four PRD §7 customer-visible limited states — `METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE` — **only** where measured evidence shows a genuine official-source limitation: an official capability limit, the official body not publishing the material, a licensing restriction, historical material unavailable, a freshness limitation, or another real official-source constraint. Declaring one obliges that group's `registry.yaml` to carry `INGF-07`'s `limitation` block — `state` equal to `adapter_status`, a closed-set `reason_code`, a mandatory `reason_detail`, at least one `evidence` entry, an `affected` scope of dates or collections, and a `customer_visible_warning` that also appears as a customer-visible `known_gaps` entry — which this module **consumes and never redefines**. Silent omission is prohibited and no unofficial source or commercial headnote may substitute for unavailable official material. `GOLD-16` produces the measured evidence and the proposed registry state, `LNCH-05` verifies the launch statement, and Gate 2 is the Founder's verification and sign-off under this policy, not an opportunity to cut mandatory scope. **Which** groups, if any, end up limited remains a Gate 2 output derived from that evidence. | Plan §8 **Q10** (confirmed policy); PRD §7, §6.1, §26, §44.4; `INGF-07` deliverables 3, 6 and 7 (the schema, the `REGISTRY_LIMITATION_*` composition failures and the verbatim carry-through to `GOLD-16`/`LNCH-05`). | every ticket (status + `limitation` record); `GOLD-16` (consolidation); `LNCH-05` (disclosure) |
| D12 | **"This regime does not exist here" is an official-source fact, not a limited state and not a scope reduction.** A PRD §6.3 topic with no applicable regime in a jurisdiction is recorded as a `known_gaps` entry with `customer_visible: true` on a group whose `adapter_status` stays `ACTIVE`; it never sets one of the four limited states and never produces a `limitation` block. A limited `adapter_status` means something else entirely — the group's *own* official material cannot be fully acquired — and always carries its evidence under **D11**. The two are therefore distinguishable in the composed registry by construction: topic-level absence lives in `known_gaps`, group-level limitation lives in `limitation`. Neither is ever a way to describe unfinished work, and neither is ever grounds for dropping a collection. | PRD §40.5 (`ADJ-WA` "only regimes actually applicable") and PRD §6.3 make regime absence a real jurisdictional fact; plan §8 **Q10** item 4 lists what counts as a genuine limitation and items 1–3 forbid scope reduction, so conflating the two would let a cut masquerade as a fact; PRD §44.4. | `SADJ-05` (the sharpest case) and every ticket; the *topic-level* reason-code gap stays open as **M3** |

## Rejected alternatives

| Rejected | Why |
|---|---|
| One "wave 4" ticket covering all nine jurisdictions | Plan §5.10 fixes nine tickets and plan §7 records this module at nine useful lanes and **one** minimum wave; collapsing them produces the fully-serial module CLAUDE.md treats as a decomposition defect, and one directory written by one ticket for nine jurisdictions is 9× the review surface with no parallelism. |
| A Group ID per authority (`ADJ-NSW-SAFEWORK`, `ADJ-NSW-SIRA`, …) | Breaks `INGF-07`'s 52-entry `MANDATORY_SOURCE_GROUPS` and PRD §40.5's roster; composition would fail with `REGISTRY_UNKNOWN_GROUP`, and PRD §44.2 `E15` counts groups, not authorities. |
| A shared `pipelines/adapters/_shared/adjacent/**` helper owned by this module | Outside module 09's plan §4 write-owns row, and it would be written by up to nine concurrent lanes — plan §9 **R2** verbatim. If a helper is genuinely universal it belongs to `SLEG-01`'s `_shared/legislation/**` as a new sibling ticket in module `06`, with the `blocked_by` edge added to the plan. |
| Ingesting the regime's Act inside the `ADJ-*` group "so the group is self-contained" | Duplicates wave 1 (`LEG-*`) identity and point-in-time machinery, creates duplicate stable identities (PRD §40.9 anomaly) and would need a second implementation of PRD §6.6's three-financial-year point-in-time requirement. |
| Ingesting tribunal decisions (anti-discrimination tribunals, workers-compensation appeal bodies) here | PRD §40.4 gives every state/territory decision collection to wave 3; `SCAS-06`…`SCAS-13` already own them, including "Relevant court/tribunal/industrial decisions". |
| Substituting a commercial summary, law-firm article or aggregator where an official regulator publishes nothing online | PRD §6.1: "Third-party commercial headnotes and summaries are excluded"; PRD §40.4's rule for an unavailable class applies by analogy — record `SOURCE_UNAVAILABLE`, do not substitute. |
| Omitting a PRD §6.3 topic because the PRD §40.5 row for that jurisdiction does not name it | PRD §44.4. The topic is recorded as covered, limited or gapped — the third option is not "unmentioned". |
| Omitting or reducing a mandatory `ADJ-*` group, or one of its named collections, to make a release date easier | Plan §8 **Q10** is confirmed policy: no mandatory group may be pre-selected for omission or reduced implementation, and arbitrary scope reduction for date convenience is not permitted (**D11**). PRD §44.4 forbids silently calling an unimplemented source category covered. A genuine official-source limitation is recorded as an evidenced limited state, never as absence. |
| Declaring `FRESHNESS_LIMITED` / `LICENSING_RESTRICTED` / `METADATA_AND_LINK_ACTIVE` / `SOURCE_UNAVAILABLE` for a collection that is merely unfinished | Those four states are the PRD's honest description of a *real* limitation. `INGF-07` will not compose one without a `limitation` block carrying evidence, an affected scope and a customer-visible warning (**D11**), and PRD §44.4 makes the silent downgrade the failure. Unfinished work gets finished, not relabelled. |
| Letting a regulator with no change feed inherit the default daily cadence | PRD §12.1: `FRESHNESS_LIMITED` "rather than a false guarantee". Freshness the source cannot support is a false customer promise, not a scheduling detail. |

## Settled and benchmark-selected entries (plan §8)

Two entries this module used to carry as open questions are settled by `docs/prd/breakdown-plan.md`
§8's decision register. Their ids are unchanged so the nine tickets' existing cross-references still
resolve; what changed is their status. Neither is a number or a choice anyone in this module is asked
to guess.

| # | Entry and status | Owner | Resolved by | Blocks |
|---|---|---|---|---|
| M5 *(plan §8 **Q10**)* | **Settled — confirmed policy; now decision D11.** No mandatory `ADJ-*` group is pre-selected for omission or reduced implementation, every one of the nine is attempted in full, arbitrary scope reduction to make a release date easier is not permitted, and a customer-visible limited state is permitted only on measured evidence of a genuine official-source limitation, recorded in `INGF-07`'s `limitation` block. **Which** groups, if any, end up limited is a Gate 2 output derived from that evidence — a measurement result, not an open decision. | Policy: **already decided** (plan §8 **Q10**). Evidence: each `SADJ` ticket. | `GOLD-16` produces the measured evidence and the proposed registry state → `LNCH-05` verifies the launch statement → Gate 2 is the Founder's verification and sign-off under the policy | Nothing in this module. Every ticket supplies the status, the `limitation` record and the customer-visible gap text unconditionally. |
| M6 *(plan §8 **Q9**)* | **Baseline-selected.** PRD §40.9's ±10% collection-count change and >2% parse-failure figures are **initial defaults**; each adapter may tighten or replace the percentages once it has a representative baseline (tighten-only). Critical identity, time, mandatory-source and citation failures are **unconditional blockers** unaffected by any percentage. | each `SADJ` ticket, with the defaults and the tighten-only override mechanism in **`INGF-05`** | per-adapter DoD item 8 (`conformance.yaml` `anomaly_overrides`, tighten-only); **consolidated and verified in `GOLD-16`** | Nothing — the critical failures already block release unconditionally. |

## Open questions

Module-local only. **M5** and **M6** are no longer open — they moved to the table above when plan §8's
decision register confirmed **Q10** and recorded **Q9** as baseline-selected; their ids are retained
there so every ticket reference still resolves. None of M1–M4, M7 or M8 blocks the module's single
wave.

| # | Question | Owner | Resolved by | Blocks |
|---|---|---|---|---|
| M1 | **`registry.yaml` has a single `authority:` object, but every `ADJ-*` group spans several authorities.** `INGF-07`'s schema gives one authority plus a list of `official_endpoints`; wave 4 needs an authority per endpoint. | `05-ingestion-framework` (**`INGF-07`** owns the schema) | `SADJ-01` — the widest group — raises it first: either `official_endpoints[].authority` is added, or an `authorities:` list with `authority_ref` per endpoint. `INGF-07`'s feedback obligation item 1 already names this exact case and requires the schema change to land in `INGF-07` + `docs/prd/05-ingestion-framework/README.md` before any workaround. | Nothing structurally — the interim rule is a **lead authority** in `authority:` plus every other authority named in the endpoint entry, and the writeback is mandatory before merge. |
| M2 | **Per-collection licence divergence inside one group.** `licence.yaml` is one file per group with one `snapshot`/`assessment` pair; `ADJ-VIC` alone spans eight authorities with independently published terms. | `05-ingestion-framework` (**`INGF-04`**) | The interim rule is **most-restrictive-wins for the group**, with each authority's snapshot captured under `licence-snapshots/`. Where that would suppress an otherwise-permitted collection, the writeback is a per-collection override *inside* `licence.yaml` (still one file per group, preserving A2) raised against `INGF-04`. | Display/quotation breadth only; the conservative default is always safe (PRD §11.1). |
| M3 | **`known_gaps.reason_code` has no value for "this jurisdiction has no such regime".** The enum is `DATE_LIMITED\|SOURCE_UNAVAILABLE\|LICENSING_RESTRICTED\|CAPABILITY_LIMITED\|FORMAT_UNSUPPORTED`. This is a **topic-level** expressiveness question only: **D12** already separates the two cases at group level, because a regime that does not exist never sets `adapter_status` and never produces a `limitation` block. M3 asks whether the distinction should also be machine-readable inside `known_gaps`. | `05-ingestion-framework` (**`INGF-07`**) | Interim: `SOURCE_UNAVAILABLE` as a **gap** reason code, with a description stating that the regime does not exist in the jurisdiction as at the recorded date. If `GOLD-16` or `INTL-02` cannot distinguish "no regime" from "regulator offline", the writeback is a `REGIME_NOT_APPLICABLE` value added in `INGF-07`. | Nothing — both render as a customer-visible gap, and neither changes `adapter_status`. |
| M4 | **`pipelines/adapters/pyproject.toml` is one PRD §20.1 member shared by five modules** (`06`–`10`), while plan §1.1 assigns manifests per module. | `00-foundation` (**`FND-01`** creates every member manifest) + plan §4 | D10 removes the pressure: no `SADJ` ticket adds a dependency. If one genuinely must, treat the manifest as append-only across the five modules, resolve conflicts by re-running `uv lock`, and record the cross-module sharing in `docs/prd/breakdown-plan.md` §4. | Nothing today. |
| M7 | **Fixture layout for a multi-collection group.** `INGF-09` expects `fixtures/{discovery,documents,timepoints,quarantine}` plus `baseline.json`/`dry-run.json`; wave 4 needs them per named collection. | `05-ingestion-framework` (**`INGF-09`**) | Interim: keep the kit's top-level directory names and namespace **inside** them (`fixtures/discovery/<collection_key>/…`); `baseline.json` already keys by collection. If the kit's collector cannot recurse, the writeback is against `INGF-09` deliverable 2. | Nothing — a flat fallback still satisfies the kit, at the cost of per-collection evidence. |
| M8 | **ACT privacy is administered under an arrangement with the Commonwealth OAIC** — is the OAIC collection ingested once (`ADJ-CTH`) and cross-referenced, or duplicated in `ADJ-ACT`? | this sub-PRD (Architect) → **D9** | `SADJ-08` implements the cross-reference; `SADJ-01` owns the OAIC collection. If a duplicate identity is unavoidable, that is a PRD §40.9 anomaly and the writeback target is this README's D9. | Nothing. |

## Work breakdown

`lane` = `09-sources-adjacent` and `agent` = `builder` for all nine tickets (plan §1.1). Every ticket
is size **L**. Paths are repository-relative.

| Ticket | Size | Lane | File-scope (write-owns) | Depends on |
|---|---|---|---|---|
| [`SADJ-01`](tickets/SADJ-01-adj-cth.md) — `ADJ-CTH` (Home Affairs, OAIC, AHRC, Comcare, DEWR…) | L | `09-sources-adjacent` | `pipelines/adapters/adj-cth/**` | `INGF-09`, `SLEG-02` |
| [`SADJ-02`](tickets/SADJ-02-adj-nsw.md) — `ADJ-NSW` | L | `09-sources-adjacent` | `pipelines/adapters/adj-nsw/**` | `INGF-09`, `SLEG-03` |
| [`SADJ-03`](tickets/SADJ-03-adj-vic.md) — `ADJ-VIC` | L | `09-sources-adjacent` | `pipelines/adapters/adj-vic/**` | `INGF-09`, `SLEG-04` |
| [`SADJ-04`](tickets/SADJ-04-adj-qld.md) — `ADJ-QLD` | L | `09-sources-adjacent` | `pipelines/adapters/adj-qld/**` | `INGF-09`, `SLEG-05` |
| [`SADJ-05`](tickets/SADJ-05-adj-wa.md) — `ADJ-WA` | L | `09-sources-adjacent` | `pipelines/adapters/adj-wa/**` | `INGF-09`, `SLEG-06` |
| [`SADJ-06`](tickets/SADJ-06-adj-sa.md) — `ADJ-SA` | L | `09-sources-adjacent` | `pipelines/adapters/adj-sa/**` | `INGF-09`, `SLEG-07` |
| [`SADJ-07`](tickets/SADJ-07-adj-tas.md) — `ADJ-TAS` | L | `09-sources-adjacent` | `pipelines/adapters/adj-tas/**` | `INGF-09`, `SLEG-08` |
| [`SADJ-08`](tickets/SADJ-08-adj-act.md) — `ADJ-ACT` | L | `09-sources-adjacent` | `pipelines/adapters/adj-act/**` | `INGF-09`, `SLEG-09` |
| [`SADJ-09`](tickets/SADJ-09-adj-nt.md) — `ADJ-NT` | L | `09-sources-adjacent` | `pipelines/adapters/adj-nt/**` | `INGF-09`, `SLEG-10` |

The nine file-scopes are disjoint sibling directories under `pipelines/adapters/`. No path is shared
between two tickets in this module — including `pyproject.toml`, which D10 keeps untouched.

### Lane profile (plan §7)

One wave, nine concurrent lanes, **not fully serial**:

```text
wave 1  SADJ-01 | SADJ-02 | SADJ-03 | SADJ-04 | SADJ-05 | SADJ-06 | SADJ-07 | SADJ-08 | SADJ-09
```

There are **no intra-module edges**: every dependency is cross-module (`INGF-09` plus the ticket's
own `SLEG-0X` register), and `/start-all` gates those from the flat DAG. This is the module PRD
§44.3 has in mind when it calls individual source adapters "safe parallel work units".

### Downstream

All nine tickets block `GOLD-10` (WHS/OHS and workers-compensation evaluation cases, 64),
`GOLD-11` (discrimination, privacy/surveillance, labour hire, LSL, migration, child/public-sector/
whistleblowing cases, 60) and `GOLD-16` (full-roster coverage, licence and freshness
reconciliation) — plan §6.2. `GOLD-16` is where PRD §44.4 is finally enforced across all 52 groups,
so the registry rows these tickets author are the evidence, not decoration.

## Acceptance — what makes the module done

The module is done when all nine tickets are delivered and:

1. **PRD §44.2 `E15` exit evidence — "Registry decomposed; adapter DoD per group".** Each of the nine
   groups has a `registry.yaml` whose `official_endpoints` enumerate the exact official
   pages/collections of each named authority, every entry carrying a `material_class` from PRD
   §40.5's seven values, and each group has a passing `conformance-report.json` from `INGF-09`'s kit.
2. **PRD §40.8 — the twelve-item Definition of Done holds for every named source group**, not merely
   once per jurisdiction: registry row + allowlist + licence snapshot/assessment; discovery fixture
   and dry-run evidence; identity/deletion rules; representative fixtures; parser/node round-trip;
   three time points; the incremental no-change/changed/removed/transient-failure matrix; count/hash
   baseline and anomaly thresholds; freshness schedule with last-check/last-ingest separation;
   quarantine cases with operator recovery actions; an evaluation subset reference; measured storage,
   parse time, index size and peak memory.
3. **PRD §6.1 / `ADM-001`** — every group appears in the composed Source Coverage Registry with
   authority, jurisdiction, official endpoints, document/date coverage, licensing, adapter status,
   change-detection capability, freshness and known gaps; `INGF-07`'s composer runs clean over all
   nine directories.
4. **PRD §6.3** — for each of the eight states/territories, all twelve topics are either covered by a
   named collection, carry an explicit `known_gaps` entry with `customer_visible: true`, or name the
   other module that owns them (D5). Silence is not one of the outcomes: that is the confirmed plan §8
   **Q10** policy applied at topic level (D11), and a topic whose regime does not exist in the
   jurisdiction is recorded as exactly that, never as a group-level limitation (D12). `ADJ-CTH` covers
   PRD §6.2's Commonwealth adjacent items (migration/right-to-work, privacy, surveillance and
   whistleblowing, Commonwealth public-sector employment).
5. **PRD §7 / §44.4** — no `ADJ-*` group is `NOT_STARTED`, `PLANNED_NOT_ACTIVE` or `IN_DEVELOPMENT`;
   each is `ACTIVE` or one of the four explicit limited statuses with a customer-visible warning. Any
   group that is limited also carries `INGF-07`'s `limitation` block — state, closed-set reason code,
   reason detail, at least one evidence entry, affected dates or collections and the customer-visible
   warning — so `mode="release"` composition cannot pass an unevidenced limited state, and no group
   was pre-selected for omission or reduced implementation (D11; plan §8 **Q10**, confirmed policy).
   `INGF-07`'s `mode="release"` composition passes for wave 4.
6. **`SRCH-002`** — "Advanced Search applies date, jurisdiction, type, authority and status filters …
   Every result independently passes all hard filters." Every emitted `DocumentVersion` carries a
   jurisdiction, an authority, a `document_type` that distinguishes code/guidance/policy/decision/
   register/news, and a PRD §6.7 `legal_status` derived from evidence (D3, D7).
7. **PRD §9.1** — regulator material is typed as subordinate authority and, where deterministically
   supported, linked to the operative provision in the jurisdiction's `LEG-*` group by a
   `node_relation` with retained evidence offsets and `parser_version` (D4, PRD §9.3).
8. **PRD §6.6** — the three financial years 2026–27, 2025–26 and 2024–25 are represented for every
   collection that publishes dated versions, or the shortfall is a customer-visible gap.
9. **PRD §26 (Corpus)** — wave 4's contribution to "All five source waves have active or explicitly
   limited registry status" and "Source freshness, quarantine and safe promotion/rollback are
   demonstrated".
10. **PRD §45.4** — every adapter PR states its requirement IDs, source/licence/provenance impact and
    attaches the twelve-item DoD report.
11. `uv run pytest` and `pnpm test` are green on the merged default branch after every ticket
    (PRD §45.3, PRD §20.3 "Rust and Python builds/tests", plan §1.1).

## Changelog

- **v0.2 — 2026-08-03** — realigned to `docs/prd/breakdown-plan.md` §8's decision register.
  **Q10 is confirmed policy**, so this sub-PRD no longer describes limited launch as a pending Founder
  decision: it is decision **D11** — no mandatory `ADJ-*` group is pre-selected for omission or
  reduced implementation, all nine are attempted in full, arbitrary scope reduction for date
  convenience is not permitted, and a limited state is recordable only through `INGF-07`'s
  `limitation` block (state, closed `reason_code` set, mandatory `reason_detail`, non-empty
  `evidence[]`, `affected` dates or collections, `customer_visible_warning`), which this module
  consumes and never redefines. New decision **D12** makes the module's sharpest distinction explicit:
  a regime that genuinely does not exist in a jurisdiction is an official-source fact recorded as a
  customer-visible `known_gaps` entry on an otherwise-`ACTIVE` group — never a limited
  `adapter_status`, never a `limitation` block and never a scope reduction. **D5** ("every §6.3 topic
  resolves to a collection, a customer-visible gap or a named other module — never silence") is
  restated as policy-backed rather than local practice, **D6** now requires the `limitation` record
  whenever a limited status is set, and two rejected alternatives are added. **Q9 remains
  baseline-selected**: the ±10% / >2% figures are stated as initial defaults each adapter may tighten
  from a representative baseline (tighten-only), with critical identity, time, mandatory-source and
  citation failures blocking unconditionally and `GOLD-16` consolidating — never numbers anyone
  guesses. **M5** and **M6** therefore leave *Open questions* for the new **Settled and
  benchmark-selected entries** table, keeping their ids so every ticket reference resolves; **M3** is
  clarified as a topic-level expressiveness question and **M1**–**M4**, **M7** and **M8** remain open.
  Nine tickets, their `blocked_by`/`blocks` edges, file-scopes, PRD traceability, the PRD §40.8
  twelve-item Definition of Done and every evidence-collection and customer-visible-limitation
  requirement are unchanged.
- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.10 (9 tickets,
  `SADJ-01`…`SADJ-09`). Fixes D1 (one ticket per §40.5 Group ID, decomposition inside `registry.yaml`),
  D2 (no `_shared` directory for this module), D4 (relations to `LEG-*`, never re-ingestion) and D5
  (the §6.3 twelve-topic checklist with explicit gaps), and raises M1–M8 as module-level open
  questions.
